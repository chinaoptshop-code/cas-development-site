// Спільні помічники API кабінету клієнта (Cloudflare Pages Functions + D1, binding DB).
// Секрети середовища: TELEGRAM_BOT_TOKEN (бот для входу), GOOGLE_CLIENT_ID, SESSION_SECRET (необовʼязково —
// інакше генерується й зберігається в D1), ADMIN_TG_IDS / ADMIN_EMAILS (через кому), LEAD_WEBHOOK (n8n).

// Воронка CRM (migrations/0004_crm.sql). Порядок ключів = порядок колонок канбану в /kabinet/admin.
export const STATUSES = {
  new: 'Нове', in_work: 'В роботі', quote_sent: 'КП надіслано', paid: 'Оплачено',
  production: 'У виробництві', shipping: 'В дорозі', delivered: 'Доставлено', cancelled: 'Скасовано',
};
// старі статуси (до 0004) — лише для підписів, нові замовлення їх не отримують
export const LEGACY_STATUSES = { confirmed: 'Підтверджено', awaiting_payment: 'Очікує оплату', ordered: 'Замовлено на фабриці' };
export const statusLabel = s => STATUSES[s] || LEGACY_STATUSES[s] || s;
export const requireAdmin = async (request, env) => {
  const c = await currentClient(request, env);
  return isAdmin(env, c) ? c : null;
};

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
const ADMIN_DAYS = 7;  // адмін: коротша сесія — менше шкоди від викраденої cookie

// Сесія без стану: cas_s = <id>.<exp>.<HMAC>. Нова cookie на кожен вхід (фіксація сесії неможлива — до входу cookie немає).
// c — клієнт (обʼєкт з D1) або id; для адмінів (isAdmin) — 7 днів.
export async function sessionCookie(env, c) {
  const clientId = typeof c === 'object' ? c.id : c;
  const days = typeof c === 'object' && isAdmin(env, c) ? ADMIN_DAYS : DAYS;
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const body = `${clientId}.${exp}`;
  const sig = await hmac(enc.encode(await secret(env)), body);
  return `${COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function currentClient(request, env) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=(\\d+)\\.(\\d+)\\.([0-9a-f]{64})`));
  if (!m) return null;
  const [, id, exp, sig] = m;
  if (+exp < Date.now() / 1000) return null;
  if (!same(sig, await hmac(enc.encode(await secret(env)), `${id}.${exp}`))) return null;
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(+id).first();
  // адмінська сесія довша за 7 днів (видана до 0007 або як клієнтська до призначення адміном) — увійти заново
  if (c && isAdmin(env, c) && +exp - Date.now() / 1000 > ADMIN_DAYS * 86400 + 300) return null;
  return c;
}

export function isAdmin(env, c) {
  if (!c) return false;
  if (c.role === 'admin') return true;
  const list = k => (env[k] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return (c.provider === 'telegram' && list('ADMIN_TG_IDS').includes(String(c.provider_id)))
    || (!!c.email && list('ADMIN_EMAILS').includes(c.email.toLowerCase()));
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
