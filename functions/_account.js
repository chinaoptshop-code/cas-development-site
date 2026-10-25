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

export { json, bad };
