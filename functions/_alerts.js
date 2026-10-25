// Сповіщення адмінам у Telegram про нові заявки й замовлення, «Взяв у роботу», SLA 15 хв і щоденний звіт.
// Бот — той самий, що для входу на сайт (секрет TELEGRAM_BOT_TOKEN), адресати — ADMIN_TG_IDS (через кому).
// Кожен адмін має хоч раз натиснути «Start» у боті, інакше Telegram не дозволить йому писати.
// Таблиці й поля — migrations/0006_lead_alerts.sql; інструкція — tools/admin/README.md, «Сповіщення про заявки».
// TELEGRAM_API_BASE — лише для локальних тестів (мок Bot API); у продакшні не задається.
import { hmac, sha256 } from './_lib.js';

export const CRM_URL = 'https://cas-develop.com/kabinet/admin#crm';
export const SLA_MIN = 15;        // перше нагадування, якщо заявку не взяли за 15 хв
export const REPEAT_MIN = 60;     // друге — ще через 60 хв
export const MAX_REMINDERS = 2;
const REPORT_AT = [20, 45];       // щоденний звіт о 20:45 за Києвом
const QUIET = [22, 8];            // тиша 22:00–08:00: нагадування чекають до 08:00 (нові заявки — завжди)

export const adminIds = env => [...new Set((env.ADMIN_TG_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d{1,20}$/.test(s)))];
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ===== Bot API =====
export async function tg(env, method, params) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const r = await fetch(`${env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params),
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) console.log('telegram', method, r.status, d && d.description);
    return d && d.ok ? d.result : null;
  } catch (e) {
    console.log('telegram', method, e && e.message);
    return null;
  }
}

// секрет вебхука (заголовок X-Telegram-Bot-Api-Secret-Token) — виводиться з токена бота, окремий секрет не потрібен
export const webhookSecret = async env => hmac(await sha256(env.TELEGRAM_BOT_TOKEN), 'cas-tg-webhook');

// ===== Час (orders.created_at — UTC «YYYY-MM-DD HH:MM:SS») =====
export const parseUtc = s => new Date(String(s).replace(' ', 'T') + 'Z');
export const sqlTime = d => d.toISOString().slice(0, 19).replace('T', ' ');
let TZ = 'Europe/Kyiv';
try { new Intl.DateTimeFormat('en-GB', { timeZone: TZ }); } catch { TZ = 'Europe/Kiev'; }
function parts(d) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d)) p[x.type] = x.value;
  return p;
}
// Київський час: date «YYYY-MM-DD», h, m, hm «HH:MM», dmy «25.10.2026»
export function kyiv(d) {
  const p = parts(d);
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, hm: `${p.hour}:${p.minute}`, dmy: `${p.day}.${p.month}.${p.year}` };
}
const offsetMs = d => { const p = parts(d); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000; };
// початок київської доби date («YYYY-MM-DD») як момент часу
export function kyivMidnight(date) {
  const [y, m, dd] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, dd); // перехід на літній/зимовий час — о 03:00/04:00, тож зсув опівночі той самий
  return new Date(guess - offsetMs(new Date(guess)));
}
export const isQuiet = d => { const h = kyiv(d).h; return h >= QUIET[0] || h < QUIET[1]; };
export const fmtMin = n => (n < 60 ? `${n} хв` : `${Math.floor(n / 60)} год${n % 60 ? ` ${n % 60} хв` : ''}`);
const ageMin = (o, now) => Math.max(0, Math.round((now - parseUtc(o.created_at)) / 60000));

// ===== Текст і кнопки =====
// Номер телефону — простим текстом: Telegram сам робить його клікабельним (дзвінок), tel: у кнопках він не підтримує.
export function leadText(o, x = {}) {
  const order = o.kind === 'order';
  const utm = x.utm_source ? [x.utm_source, x.utm_medium, x.utm_campaign].filter(Boolean).join(' / ') : '';
  const page = x.page && x.page !== o.source ? x.page : '';
  let comment = x.message != null ? x.message : o.comment;
  if (x.area && x.message != null) comment = [comment, `Площа: ${x.area}`].filter(Boolean).join('\n');
  return [
    `${order ? '🛒 Замовлення Оздоби' : '🔔 Заявка'} <b>${esc(o.number)}</b>`,
    o.service ? `Послуга: <b>${esc(cut(o.service, 200))}</b>` : null,
    `📞 ${esc(o.phone || '—')}`,
    `Імʼя: ${esc(o.name || 'Без імені')}`,
    order && o.total != null ? `Сума: ${new Intl.NumberFormat('uk-UA').format(o.total)} ₴${o.on_request ? ` + ${o.on_request} поз. за запитом` : ''}` : null,
    o.source ? `Звідки: ${esc(cut(o.source, 200))}` : null,
    page ? `Сторінка: ${esc(cut(page, 300))}` : null,
    x.form ? `Форма: ${esc(cut(x.form, 40))}` : null,
    comment ? `💬 ${esc(cut(comment, 1500))}` : null,
    utm ? `UTM: ${esc(cut(utm, 200))}` : null,
    `🕒 ${kyiv(parseUtc(o.created_at)).hm}, ${kyiv(parseUtc(o.created_at)).dmy} (Київ)`,
  ].filter(Boolean).join('\n');
}
export const leadKeyboard = id => ({ inline_keyboard: [
  [{ text: '✅ Взяв у роботу', callback_data: `take:${id}` }],
  [{ text: '📋 Відкрити в CRM', url: CRM_URL }],
] });

async function sendAll(env, orderId, kind, text, keyboard) {
  let sent = 0;
  for (const chat of adminIds(env)) {
    const m = await tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard });
    if (!m) continue;
    sent++;
    if (orderId) await env.DB.prepare('INSERT INTO tg_alerts (order_id, chat_id, message_id, kind) VALUES (?, ?, ?, ?)').bind(orderId, chat, m.message_id, kind).run();
  }
  return sent;
}

// Нова заявка / замовлення → кожному адміну. x — сирі дані форми (page, form, message, area, utm_*).
export async function notifyNew(env, orderId, x = {}) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !adminIds(env).length) return 0;
    const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    return o ? await sendAll(env, o.id, 'new', leadText(o, x), leadKeyboard(o.id)) : 0;
  } catch (e) {
    console.log('notifyNew', e && e.message); // заявка вже збережена — сповіщення не має ламати відповідь формі
    return 0;
  }
}

// «Взяв у роботу»: статус in_work (якщо був «Нове»), відповідальний, час реакції; редагує повідомлення в усіх адмінів.
// Повторне натискання / інший адмін → { already: true }.
export async function takeLead(env, id, who, via = 'Telegram', now = new Date()) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'not_found' };
  if (o.taken_at) return { already: true, o };
  const min = ageMin(o, now);
  const u = await env.DB.prepare(`UPDATE orders SET taken_at = ?, reaction_min = ?, assignee = COALESCE(NULLIF(assignee, ''), ?),
      status = CASE WHEN status = 'new' THEN 'in_work' ELSE status END, updated_at = datetime('now') WHERE id = ? AND taken_at IS NULL`)
    .bind(sqlTime(now), min, who, id).run();
  if (!u.meta.changes) return { already: true, o: await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first() };
  if (o.status === 'new') await env.DB.prepare("INSERT INTO order_events (order_id, status, note, author) VALUES (?, 'in_work', ?, ?)")
    .bind(id, `Взяв у роботу (${via}) за ${fmtMin(min)}`, who).run();
  const n = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  await markTaken(env, n, who, min);
  return { ok: true, min, o: n };
}

async function markTaken(env, o, who, min) {
  const { results } = await env.DB.prepare('SELECT chat_id, message_id, kind FROM tg_alerts WHERE order_id = ?').bind(o.id).all();
  const done = `✅ Взяв <b>${esc(who)}</b> за ${fmtMin(min)}`;
  const full = leadText(o) + '\n\n' + done;
  for (const a of results) {
    await tg(env, 'editMessageText', { chat_id: a.chat_id, message_id: a.message_id, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      text: a.kind === 'new' ? full : `⏰ ${esc(o.number)}: ${done}`, reply_markup: { inline_keyboard: [[{ text: '📋 Відкрити в CRM', url: CRM_URL }]] } });
  }
}

// Імʼя адміна, що натиснув кнопку: як у CRM (clients.name), інакше з Telegram
export async function adminName(env, from) {
  const c = await env.DB.prepare("SELECT name FROM clients WHERE provider = 'telegram' AND provider_id = ?").bind(String(from.id)).first();
  return (c && c.name) || [from.first_name, from.last_name].filter(Boolean).join(' ') || (from.username ? '@' + from.username : `id ${from.id}`);
}

// ===== SLA: нагадування про невзяті заявки =====
// Перше — через 15 хв після заявки, друге — ще через 60 хв після першого. У тихі години (22:00–08:00 Київ) — нічого:
// прострочені заявки нагадаються першим запуском після 08:00.
export async function runSla(env, now = new Date()) {
  const { results } = await env.DB.prepare(`SELECT * FROM orders o WHERE o.status = 'new' AND o.taken_at IS NULL AND o.reminders < ?
      AND o.created_at <= ? AND o.created_at >= ? AND EXISTS (SELECT 1 FROM tg_alerts a WHERE a.order_id = o.id AND a.kind = 'new')
      ORDER BY o.id LIMIT 50`)
    .bind(MAX_REMINDERS, sqlTime(new Date(now - SLA_MIN * 60000)), sqlTime(new Date(now - 7 * 86400000))).all();
  const due = results.filter(o => o.reminders === 0 || (o.reminded_at && now - parseUtc(o.reminded_at) >= REPEAT_MIN * 60000));
  if (isQuiet(now)) return { quiet: true, due: due.length, sent: [] };
  const sent = [];
  for (const o of due) {
    // атомарно «забираємо» нагадування — два запуски cron поспіль не надішлють його двічі
    const u = await env.DB.prepare('UPDATE orders SET reminders = reminders + 1, reminded_at = ? WHERE id = ? AND reminders = ? AND taken_at IS NULL')
      .bind(sqlTime(now), o.id, o.reminders).run();
    if (!u.meta.changes) continue;
    await sendAll(env, o.id, 'reminder', `⏰ <b>Заявка без відповіді ${fmtMin(ageMin(o, now))}</b>\n\n` + leadText(o), leadKeyboard(o.id));
    sent.push(o.number);
  }
  return { quiet: false, due: due.length, sent };
}

// ===== Щоденний звіт =====
// Рахує заявки з сайту й замовлення Оздоби за київську добу date (лише ті, про які бот сповіщав).
export async function dayStats(env, date) {
  const from = kyivMidnight(date), to = new Date(from.getTime() + 36 * 3600000);
  const end = kyivMidnight(kyiv(to).date); // наступна київська північ (враховує перехід на літній/зимовий час)
  const { results } = await env.DB.prepare(`SELECT o.* FROM orders o WHERE o.created_at >= ? AND o.created_at < ?
      AND EXISTS (SELECT 1 FROM tg_alerts a WHERE a.order_id = o.id AND a.kind = 'new') ORDER BY o.id`)
    .bind(sqlTime(from), sqlTime(end)).all();
  const taken = results.filter(o => o.taken_at && o.reaction_min != null);
  const r = taken.map(o => o.reaction_min);
  return {
    date, total: results.length, leads: results.filter(o => o.kind === 'lead').length, orders: results.filter(o => o.kind === 'order').length,
    taken: taken.length, within_sla: r.filter(m => m <= SLA_MIN).length,
    avg: r.length ? Math.round(r.reduce((s, m) => s + m, 0) / r.length) : null, max: r.length ? Math.max(...r) : null,
    unanswered: results.filter(o => !o.taken_at && o.status === 'new'),
  };
}

export function reportText(s) {
  const dmy = s.date.split('-').reverse().join('.');
  if (!s.total) return `📊 <b>Заявки за ${dmy}</b>\n\nНових заявок і замовлень не було.`;
  return [
    `📊 <b>Заявки за ${dmy}</b>`, '',
    `Усього: <b>${s.total}</b> (заявок ${s.leads}, замовлень Оздоби ${s.orders})`,
    `Взято в роботу: <b>${s.taken}</b> з ${s.total}`,
    s.taken ? `Час реакції: середній <b>${fmtMin(s.avg)}</b>, максимальний <b>${fmtMin(s.max)}</b>` : null,
    s.taken ? `У межах ${SLA_MIN} хв: ${s.within_sla} з ${s.taken}` : null,
    s.unanswered.length ? `\n❗ <b>Без відповіді (${s.unanswered.length}):</b>` : '\n✅ Без відповіді — жодної.',
    ...s.unanswered.slice(0, 30).map(o => `• ${esc(o.number)} · ${kyiv(parseUtc(o.created_at)).hm} · ${esc(cut(o.service || (o.kind === 'order' ? 'Оздоба' : 'заявка'), 60))} · ${esc(o.phone || '—')}`),
  ].filter(x => x != null).join('\n');
}

// Звіт о 20:45 (або пізніше того ж вечора, якщо cron запізнився) — рівно один раз на добу; force — надіслати зараз.
export async function runReport(env, now = new Date(), force = false) {
  const k = kyiv(now);
  const due = k.h > REPORT_AT[0] || (k.h === REPORT_AT[0] && k.m >= REPORT_AT[1]);
  if (!force) {
    if (!due) return { due: false };
    const u = await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('lead_report_day', ?1)
        ON CONFLICT(key) DO UPDATE SET value = ?1 WHERE settings.value != ?1`).bind(k.date).run();
    if (!u.meta.changes) return { due: true, already: true };
  }
  const s = await dayStats(env, k.date);
  const sent = await sendAll(env, null, 'report', reportText(s), { inline_keyboard: [[{ text: '📋 Відкрити CRM', url: CRM_URL }]] });
  return { due: true, sent, stats: { ...s, unanswered: s.unanswered.map(o => o.number) } };
}

// ===== Вебхук бота =====
// Ставимо /api/tg/webhook, якщо вебхука немає або він уже наш (оновлюємо). Чужий вебхук (n8n тощо) не чіпаємо без force.
export async function ensureWebhook(env, origin, force = false) {
  if (!env.TELEGRAM_BOT_TOKEN) return { webhook: 'no_token' };
  const url = `${origin}/api/tg/webhook`;
  const info = await tg(env, 'getWebhookInfo', {});
  if (!info) return { webhook: 'error' };
  if (info.url === url && !force) return { webhook: 'ok' };
  if (info.url && info.url !== url && !force) return { webhook: 'foreign', host: (() => { try { return new URL(info.url).host; } catch { return '?'; } })() };
  const ok = await tg(env, 'setWebhook', { url, secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'] });
  return { webhook: ok ? 'set' : 'error', previous: info.url ? 'replaced' : 'none' };
}
