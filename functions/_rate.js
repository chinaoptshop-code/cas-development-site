// Спільний rate-limit для API (таблиця rate_hits — migrations/0007_security.sql).
// Ключ — хеш IP (для IPv6 — мережа /64, щоб не обходили ліміт зміною адреси в межах одного підключення).
// Якщо міграція ще не застосована — ліміт не блокує (fail-open): краще пропустити заявку, ніж втратити клієнта.
import { hexOf, sha256 } from './_lib.js';

// IP клієнта → рядок для ключа ліміту: IPv4 як є, IPv6 — перші 4 групи (/64)
export function ipKey(request) {
  const ip = (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim();
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return full.slice(0, 4).map(x => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export const ipHash = async (request, salt) => hexOf(await sha256(salt + '|' + ipKey(request)));

// Зареєструвати спробу в кошику bucket; true — ліміт перевищено (спробу не записуємо).
// peek = true — лише перевірити, не записуючи спробу (бот: вірний ключ після серії невдалих — functions/api/bot/_middleware.js).
// by — свій ключ замість IP (напр. акаунт працівника — staffLimited).
export async function limited(env, request, bucket, limit, windowS = 3600, peek = false, by = null) {
  try {
    const now = Math.floor(Date.now() / 1000), key = by != null ? hexOf(await sha256(bucket + '|' + by)) : await ipHash(request, bucket);
    // прибирання: лише старі записи цього кошика — швидко за індексом
    await env.DB.prepare('DELETE FROM rate_hits WHERE bucket = ? AND created_at < ?').bind(bucket, now - 86400).run();
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE bucket = ? AND ip_hash = ? AND created_at > ?')
      .bind(bucket, key, now - windowS).first();
    if ((r?.n || 0) >= limit) return true;
    if (peek) return false;
    await env.DB.prepare('INSERT INTO rate_hits (bucket, ip_hash, created_at) VALUES (?, ?, ?)').bind(bucket, key, now).run();
    return false;
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return false;
    throw e;
  }
}

// Ліміт у памʼяті ізоляту, БЕЗ бази (23.11.2026): для частих запитів довіреного клієнта з перевіреним ключем (бот і воркер чату,
// functions/api/bot/_middleware.js). limited() на кожен запит читає з rate_hits усі його спроби за вікно — при опитуванні кожні 3–5 с
// це ~900 запитів × ~900 рядків на годину: за день воркер чату вичерпав добовий ліміт D1 (5 млн прочитаних рядків) і майже вичерпав
// ліміт записів. Тут лічильник живе в памʼяті: нуль читань і записів. Ізолятів кілька, тож межа приблизна — це запобіжник від
// циклу, що зірвався, а не захист від чужих (чужих відсікає ключ і limited() для невірних ключів).
const MEM = new Map();
export function memLimited(request, bucket, limit, windowS = 3600, t = Date.now()) {
  const k = bucket + '|' + ipKey(request);
  let e = MEM.get(k);
  if (!e || t - e.t >= windowS * 1000) { if (MEM.size > 5000) MEM.clear(); e = { t, n: 0 }; MEM.set(k, e); }
  return ++e.n > limit;
}
export const memReset = () => MEM.clear();

// Ліміти записів працівників (19.11.2026) — на годину, на акаунт працівника, а не на IP: в офісі всі сидять за однією адресою,
// а зламаний акаунт чи скрипт, що зациклився, міг би міняти адреси. Щедрі: звичайна робота (десятки змін на годину) до них не доходить,
// а потік у сотні записів (спам нотатками, історією заявок, журналом «КП надіслано», аудитом) зупиняється з 429.
//   crm      — заявки й замовлення CRM: нова заявка, зміна картки, перетягування на канбані, пропозиція;
//   kp       — журнал «КП надіслано» (кожен запис — рядок в історії заявки й аудиті);
//   bulk     — масові дії (до 100 заявок за раз);
//   contacts — довідник контактів і привʼязки до обʼєктів; orders — замовлення Оздоби; codes — коди партнерів;
//   staff    — персонал і ролі; repo — збереження сайту (коміт у GitHub);
//   chat     — відповіді людини в чаті на сайті, зміна стану розмови, заявка з розмови;
//   tasks    — задачі (створення, правка, «виконано»); import — порції імпорту контактів з CSV (до 100 рядків у порції).
export const STAFF_LIMITS = Object.freeze({ crm: 600, kp: 120, bulk: 60, contacts: 600, orders: 600, codes: 120, staff: 120, repo: 300, tasks: 600, import: 120, chat: 600 });
export const staffKey = x => 'staff:' + (x && (x.staffId || (x.client && x.client.id)) || '');
export const staffLimited = (env, request, x, kind) => limited(env, request, 'staff-' + kind, STAFF_LIMITS[kind], 3600, false, staffKey(x));
export const TOO_MANY = 'Забагато змін поспіль — зачекайте кілька хвилин';
