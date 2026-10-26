// Помічники кабінету клієнта v2 (functions/api/account/*, functions/api/admin/projects.js).
// Таблиці — migrations/0005_account.sql; працюють і до її застосування (порожні дані замість помилки).
import { bad, currentClient, isAdmin, json, readJSON } from './_lib.js';

// Етапи замовлення в кабінеті. Ключі — orders.status воронки 0004_crm.sql; старі статуси 0001 зводимо до них.
export const STAGES = [
  ['new', 'Нове'], ['in_work', 'В роботі'], ['quote_sent', 'КП надіслано'], ['paid', 'Оплачено'],
  ['production', 'У виробництві'], ['shipping', 'В дорозі'], ['delivered', 'Доставлено'],
];
const ALIAS = {
  confirmed: 'in_work', awaiting_payment: 'quote_sent', ordered: 'production', in_progress: 'in_work',
  shipped: 'shipping', done: 'delivered', canceled: 'cancelled',
};
// status з БД → ключ етапу (невідомий або порожній → «new»)
export function stageOf(status) {
  const s = ALIAS[status] || status;
  if (s === 'cancelled') return 'cancelled';
  return STAGES.some(([k]) => k === s) ? s : 'new';
}
export const stageLabel = k => k === 'cancelled' ? 'Скасовано' : (STAGES.find(([s]) => s === k) || STAGES[0])[1];

// Сесія обовʼязкова; для змін — лише JSON (захист від крос-сайтових form-POST).
export async function client(request, env) {
  const c = await currentClient(request, env);
  if (!c) return { error: bad('Потрібно увійти', 401) };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE'
    && !/^application\/json\b/i.test(request.headers.get('content-type') || '')) return { error: bad('Очікуємо JSON', 415) };
  return { c };
}

export async function admin(request, env) {
  const r = await client(request, env);
  if (r.error) return r;
  if (!isAdmin(env, r.c)) return { error: bad('Немає доступу', 403) };
  return r;
}

export async function body(request, max = 16 * 1024) {
  try { return { d: await readJSON(request, max) }; } catch { return { error: bad('Некоректні дані') }; }
}

// Таблиця ще не створена (міграція 0005 не застосована)?
export const noTable = e => /no such table|no such column/i.test(String(e && e.message || e));
export const notReady = () => bad('Розділ оновлюється — спробуйте за кілька хвилин', 503);

export const txt = (v, n = 300) => (v == null ? null : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) || null);
export const int = v => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

// Лише https-посилання (фото, документи), до 1000 символів.
export function httpsUrl(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s.length > 1000) return null;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

export const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

// Загальний прогрес проєкту — середнє прогресу етапів (0–100).
export const progressOf = stages => stages.length ? Math.round(stages.reduce((s, x) => s + Math.max(0, Math.min(100, Number(x.progress) || 0)), 0) / stages.length) : 0;

// ===== Онлайн-контроль обʼєкта (migrations/0008_online_control.sql) =====
// Статуси етапу. Старі етапи без статусу виводимо з прогресу (0 → planned, 1–99 → in_progress, 100 → done).
export const STAGE_STATUS = { planned: 'Заплановано', in_progress: 'В роботі', review: 'Приймання', done: 'Виконано', paused: 'Пауза' };
export const stageStatus = s => (s && STAGE_STATUS[s.status] ? s.status
  : (Number(s && s.progress) || 0) >= 100 ? 'done' : (Number(s && s.progress) || 0) > 0 ? 'in_progress' : 'planned');
export const PAY_STATUS = { planned: 'Заплановано', due: 'До оплати', paid: 'Оплачено' };
export const CURRENCIES = ['USD', 'UAH', 'EUR'];
export const stageKey = v => (/^[a-z0-9]{1,12}$/.test(String(v || '')) ? String(v) : null);
export const newStageKey = () => [...crypto.getRandomValues(new Uint8Array(5))].map(b => (b % 36).toString(36)).join('');

// Камера 24/7: https-посилання → що показати клієнту.
//   youtube  — трансляція YouTube (з доступом за посиланням): вбудовуємо через youtube-nocookie.com (уже в CSP frame-src);
//   snapshot — пряме посилання на кадр .jpg/.png/.webp (img-src https: дозволено): показуємо кадр з кнопкою «оновити»;
//   link     — будь-яка інша хмара камери (Hik-Connect, Ezviz, Imou, Ivideon…): кнопка «Відкрити камеру» в новій вкладці.
// Чужі iframe/відео-потоки на сторінку кабінету не вбудовуємо — CSP не розширюємо.
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'];
export function cameraOf(v) {
  const s = httpsUrl(v);
  if (!s) return null;
  const u = new URL(s), host = u.hostname.toLowerCase();
  if (u.username || u.password) return null; // логін/пароль у посиланні не приймаємо
  if (YT_HOSTS.includes(host)) {
    const m = host === 'youtu.be' ? u.pathname.match(/^\/([\w-]{11})/) : (u.searchParams.get('v') || '').match(/^([\w-]{11})$/) || u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{11})/);
    if (m) return { kind: 'youtube', url: s, host, embed: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1` };
  }
  if (/\.(jpe?g|png|webp)$/i.test(u.pathname)) return { kind: 'snapshot', url: s, host };
  return { kind: 'link', url: s, host };
}

export { json, bad };
