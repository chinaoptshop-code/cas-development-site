// Спільні помічники API кабінету клієнта (Cloudflare Pages Functions + D1, binding DB).
// Секрети середовища: TELEGRAM_BOT_TOKEN (бот для входу), GOOGLE_CLIENT_ID, SESSION_SECRET (необовʼязково —
// інакше генерується й зберігається в D1), ADMIN_TG_IDS / ADMIN_EMAILS (через кому), LEAD_WEBHOOK (n8n).

// Воронка CRM (migrations/0004_crm.sql, 0010). Порядок ключів = порядок колонок канбану в /kabinet/admin.
// Замовлення Оздоби (kind = order): new → in_work → quote_sent → paid → production → shipping → delivered | cancelled.
export const ORDER_STATUSES = {
  new: 'Нове', in_work: 'В роботі', quote_sent: 'КП надіслано', paid: 'Оплачено',
  production: 'У виробництві', shipping: 'В дорозі', delivered: 'Доставлено', cancelled: 'Скасовано',
};
// Заявки студії (kind = lead): заявка → розрахунок → договір → проєкт (етапи — у projects.stages) → здача → гарантія.
export const LEAD_STATUSES = {
  new: 'Нова заявка', in_work: 'В роботі', quote_sent: 'Розрахунок', contract: 'Договір', project: 'Проєкт: етапи',
  handover: 'Здача', warranty: 'Гарантія', cancelled: 'Скасовано',
};
export const STATUSES = { ...ORDER_STATUSES, contract: 'Договір', project: 'Проєкт: етапи', handover: 'Здача', warranty: 'Гарантія' };
export const statusesOf = kind => (kind === 'lead' ? LEAD_STATUSES : ORDER_STATUSES);
// старі статуси (до 0004) — лише для підписів, нові замовлення їх не отримують
export const LEGACY_STATUSES = { confirmed: 'Підтверджено', awaiting_payment: 'Очікує оплату', ordered: 'Замовлено на фабриці' };
export const statusLabel = (s, kind) => (kind && statusesOf(kind)[s]) || STATUSES[s] || LEGACY_STATUSES[s] || s;
// закриті стадії: не рахуються як «відкриті» / прострочені
export const CLOSED = ['delivered', 'cancelled', 'warranty'];

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const bad = (msg, status = 400) => json({ error: msg }, status);

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function hmac(keyBytes, msg) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export const sha256 = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));

// рівночасове порівняння рядків
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function secret(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='session_secret'").first();
  if (row) return row.value;
  const v = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES ('session_secret', ?)").bind(v).run();
  return (await env.DB.prepare("SELECT value FROM settings WHERE key='session_secret'").first()).value;
}

const COOKIE = 'cas_s';
const DAYS = 30;       // клієнт
const ADMIN_DAYS = 7;  // працівник / адмін: коротша сесія — менше шкоди від викраденої cookie

// Працівник студії (активний рядок staff, migrations/0010) або старий адмін (isAdmin) — сесія 7 днів.
// До міграції 0010 таблиці staff немає — тоді лише isAdmin.
export async function isStaffClient(env, c) {
  if (!c) return false;
  if (isAdmin(env, c)) return true;
  try {
    if (await env.DB.prepare('SELECT 1 FROM staff WHERE client_id = ? AND active = 1').bind(c.id).first()) return true;
    // запрошення, яке привʼяжеться при першому запиті (functions/_roles.js findStaff) — одразу видаємо сесію працівника
    const tg = tgOf(c), email = c.email ? c.email.toLowerCase() : null, phone = normalizePhone(c.phone);
    return !!(tg || email || phone) && !!await env.DB.prepare(`SELECT 1 FROM staff WHERE client_id IS NULL AND active = 1
        AND ((tg_id IS NOT NULL AND tg_id = ?1) OR (email IS NOT NULL AND email = ?2) OR (phone IS NOT NULL AND phone = ?3))`).bind(tg, email, phone).first();
  } catch { return false; }
}

// Сесія без стану: cas_s = <id>.<exp>.<ver>.<HMAC(id.exp.ver)>; ver = clients.session_version («Вийти на всіх пристроях»
// і деактивація працівника збільшують його — усі старі cookie стають недійсними). Старий формат <id>.<exp>.<HMAC>
// (до 0010) приймаємо, поки версія 0. Нова cookie на кожен вхід (фіксація сесії неможлива — до входу cookie немає).
// c — клієнт (обʼєкт з D1) або id.
export async function sessionCookie(env, c) {
  const obj = typeof c === 'object' ? c : await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(+c).first();
  const clientId = obj ? obj.id : +c;
  const days = await isStaffClient(env, obj) ? ADMIN_DAYS : DAYS;
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const body = `${clientId}.${exp}.${(obj && obj.session_version) || 0}`;
  const sig = await hmac(enc.encode(await secret(env)), body);
  return `${COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const SESSION_RE = new RegExp(`(?:^|; )${COOKIE}=(\\d+)\\.(\\d+)(?:\\.(\\d{1,9}))?\\.([0-9a-f]{64})(?:;|$)`);
export async function currentClient(request, env) {
  const m = (request.headers.get('cookie') || '').match(SESSION_RE);
  if (!m) return null;
  const [, id, exp, ver, sig] = m;
  if (+exp < Date.now() / 1000) return null;
  const body = ver == null ? `${id}.${exp}` : `${id}.${exp}.${ver}`;
  if (!same(sig, await hmac(enc.encode(await secret(env)), body))) return null;
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(+id).first();
  if (!c) return null;
  if ((+ver || 0) !== (Number(c.session_version) || 0)) return null; // «вийти на всіх пристроях» / деактивація
  // сесія працівника довша за 7 днів (видана як клієнтська до призначення) — увійти заново
  if (+exp - Date.now() / 1000 > ADMIN_DAYS * 86400 + 300 && await isStaffClient(env, c)) return null;
  return c;
}

// «Вийти на всіх пристроях»: усі cookie цього клієнта стають недійсними (до 0010 — без ефекту, лише поточна cookie).
export async function bumpSession(env, clientId) {
  try { await env.DB.prepare('UPDATE clients SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?').bind(clientId).run(); return true; }
  catch { return false; }
}

const envList = (env, k) => (env[k] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
// Telegram id клієнта: вхід через віджет (provider_id) або за номером через бота (clients.tg_id, 0010)
export const tgOf = c => (c ? (c.provider === 'telegram' ? String(c.provider_id) : c.tg_id ? String(c.tg_id) : null) : null);

// Старий «адмін» (до ролей): clients.role = 'admin', Telegram у ADMIN_TG_IDS або пошта в ADMIN_EMAILS.
// Після 0010 такі люди автоматично стають працівниками з роллю manager (functions/_roles.js), власник — owner.
export function isAdmin(env, c) {
  if (!c) return false;
  if (c.role === 'admin') return true;
  const tg = tgOf(c);
  return (!!tg && envList(env, 'ADMIN_TG_IDS').includes(tg))
    || (!!c.email && envList(env, 'ADMIN_EMAILS').includes(c.email.toLowerCase()));
}

// Власник (майстер-акаунт): OWNER_TG_ID / OWNER_EMAIL; якщо жодна не задана — перший id з ADMIN_TG_IDS.
export function isOwner(env, c) {
  if (!c) return false;
  const tg = tgOf(c);
  const owners = envList(env, 'OWNER_TG_ID'), mails = envList(env, 'OWNER_EMAIL');
  if (!owners.length && !mails.length) {
    const first = envList(env, 'ADMIN_TG_IDS')[0];
    return !!tg && !!first && tg === first;
  }
  return (!!tg && owners.includes(tg)) || (!!c.email && mails.includes(c.email.toLowerCase()));
}

export async function upsertClient(env, p) {
  await env.DB.prepare(`INSERT INTO clients (provider, provider_id, name, username, email, photo, last_login)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
      ON CONFLICT(provider, provider_id) DO UPDATE SET
        name = COALESCE(clients.name, excluded.name), username = excluded.username,
        email = COALESCE(excluded.email, clients.email), photo = excluded.photo, last_login = datetime('now')`)
    .bind(p.provider, String(p.provider_id), p.name || null, p.username || null, p.email || null, p.photo || null).run();
  return env.DB.prepare('SELECT * FROM clients WHERE provider = ? AND provider_id = ?').bind(p.provider, String(p.provider_id)).first();
}

export const publicClient = (c, env) => c && ({
  id: c.id, provider: c.provider, name: c.name, username: c.username, email: c.email, phone: c.phone,
  photo: c.photo, city: c.city, company: c.company, admin: isAdmin(env, c),
});

export async function readJSON(request, max = 64 * 1024) {
  const t = await request.text();
  if (t.length > max) throw new Error('too large');
  return t ? JSON.parse(t) : {};
}

const str = (v, n = 300) => (v == null ? null : String(v).trim().slice(0, n) || null);
export { str };

// Номер телефону → +380XXXXXXXXX (Україна: 0XXXXXXXXX, 380…, +380…) або E.164 (+ і 10–15 цифр); інакше null.
export function normalizePhone(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\+?[\d\s()\-.]{9,24}$/.test(s)) return null;
  const d = s.replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) return '+38' + d;
  if (d.startsWith('380')) return /^380\d{9}$/.test(d) ? '+' + d : null;
  return /^[1-9]\d{9,14}$/.test(d) ? '+' + d : null;
}

export const hexOf = hex;
export const clientIp = request => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';

// Підпис запиту бота до /api/auth/phone/confirm: hex(HMAC-SHA256(sha256(TELEGRAM_BOT_TOKEN), token|phone|tg_id)).
export const botSignature = async (env, token, phone, tgId) => hmac(await sha256(env.TELEGRAM_BOT_TOKEN), `${token}|${phone}|${tgId}`);

// Cookie браузера, що почав вхід за номером (секрет; у БД — лише sha256).
export const PL_COOKIE = 'cas_pl';
export const plCookie = (v, maxAge) => `${PL_COOKIE}=${v}; Path=/api/auth/phone; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const readCookie = (request, name) => (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1] || null;

// ===== Знижки Оздоби =====
// Знижка за обсягом: пороги з catalog.json volume_discounts [[сума товарів, грн, %], …] — ті самі рахує кошик (assets/ozdoba/app.js).
export const volumePct = (cat, goods) => (cat.volume_discounts || []).reduce((p, [t, pc]) => (goods >= t ? Math.max(p, pc) : p), 0);
// Особистий код партнера: верхній регістр, літери (лат./кир.), цифри й дефіс, 3–32 символи.
export const normCode = v => {
  const s = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-ZА-ЯІЇЄҐ0-9][A-ZА-ЯІЇЄҐ0-9-]{2,31}$/.test(s) ? s : null;
};
// Активний код партнера з D1 або null.
export async function partnerCode(env, v) {
  const code = normCode(v);
  if (!code) return null;
  return env.DB.prepare('SELECT code, name, discount FROM partner_codes WHERE code = ? AND active = 1').bind(code).first();
}

// Номер заявки CRM (orders.kind = 'lead'): LD-РРММ-0001
export async function nextLeadNumber(env) {
  const d = new Date();
  const pre = `LD-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}-`;
  const row = await env.DB.prepare('SELECT number FROM orders WHERE number LIKE ? ORDER BY id DESC LIMIT 1').bind(pre + '%').first();
  const n = row ? parseInt(row.number.slice(pre.length), 10) || 0 : 0;
  return pre + String(n + 1).padStart(4, '0');
}
