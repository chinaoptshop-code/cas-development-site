// Нагадування клієнту (CRM v2, Михайло 18.11.2026) — без спаму, кожне — в журналі:
//   • етап дизайну/архітектури на «Прийманні» без погодження → «етап чекає вашого погодження»: не частіше 1 разу на 48 год на етап
//     (remind_at у JSON етапу), автоматично — лише через ≥ 24 год після переходу на приймання (review_at), не більше 3 автонагадувань
//     на етап (remind_n), лише 10:00–20:00 за Києвом; кожне — запис hist {act: 'remind'} і audit_log 'client.remind';
//   • проєкт «Завершено» (projects.done_at, migrations/0016) → через ~2 доби одне прохання про відгук у Google (review_asked_at), audit 'client.review'.
// Канал — Telegram-бот, якщо клієнт привʼязаний (вхід через Telegram або за номером через бота). Пошти для розсилок у студії немає —
// без Telegram менеджер надсилає той самий текст сам (кнопки в адмінці: Telegram / Viber / WhatsApp), і це теж логується (channel).
// Тексти 10 мовами — functions/_client_msgs.js; мова — мова заявки (orders.lang), потім налаштування клієнта, інакше uk.
import { tg } from './_alerts.js';
import { tgOf } from './_lib.js';
import { langOf, remindText, reviewText } from './_client_msgs.js';
import { audit, noTable } from './_roles.js';

export const REMIND_GAP_H = 48, REMIND_AUTO_AFTER_H = 24, REMIND_AUTO_MAX = 3, REVIEW_AFTER_H = 48;
export const CHANNELS = { telegram: 'Telegram-бот', telegram_manual: 'Telegram (вручну)', viber: 'Viber', whatsapp: 'WhatsApp', copy: 'скопійовано' };
const DESIGN = ['design', 'arch'];
// «YYYY-MM-DD HH:MM» за Києвом (як hist етапу) і розбір назад у мілісекунди
export const kyivStamp = (d = new Date()) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv' }).slice(0, 16);
const kyivMs = s => { if (!s) return 0; const d = new Date(String(s).replace(' ', 'T') + ':00Z'); const off = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })); return d.getTime() - off; };
const hoursSince = (s, now) => (now.getTime() - kyivMs(s)) / 3600000;
const dayTime = now => { const h = +now.toLocaleString('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false }); return h >= 10 && h < 20; };

async function clientOf(env, p) {
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(p.client_id).first();
  let lang = null;
  if (p.order_id) { try { lang = (await env.DB.prepare('SELECT lang FROM orders WHERE id = ?').bind(p.order_id).first() || {}).lang; } catch (e) { if (!noTable(e)) throw e; } }
  if (!lang) { try { lang = (await env.DB.prepare('SELECT lang FROM client_settings WHERE client_id = ?').bind(p.client_id).first() || {}).lang; } catch (e) { if (!noTable(e)) throw e; } }
  return { c, lang: langOf(lang), chat: tgOf(c), name: c && c.name ? String(c.name).split(' ')[0] : null };
}
const send = async (env, chat, text) => !!(chat && await tg(env, 'sendMessage', { chat_id: String(chat), text, link_preview_options: { is_disabled: true } }));
const parse = s => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

// Нагадати про етап. channel: null — спробувати бота; telegram_manual | viber | whatsapp | copy — менеджер надіслав сам (лише журнал).
// Повертає {ok, sent, channel, text, phone, wait_h} або {error, status}.
export async function remindStage(env, request, x, p, stageId, { channel = null, auto = false, now = new Date() } = {}) {
  if (!DESIGN.includes(p.service)) return { error: 'Нагадування — лише для дизайну й архітектури', status: 422 };
  const stages = parse(p.stages), i = stages.findIndex(s => s && s.id === stageId);
  if (i < 0) return { error: 'Етап не знайдено', status: 404 };
  const s = stages[i], st = s.status || 'planned';
  if (s.approved_at || !['review', 'done'].includes(st)) return { error: 'Етап не чекає погодження клієнта', status: 409 };
  if (s.remind_at && hoursSince(s.remind_at, now) < REMIND_GAP_H)
    return { error: `Нагадування вже було ${s.remind_at} — наступне не раніше ніж через ${REMIND_GAP_H} год`, status: 429, wait_h: Math.ceil(REMIND_GAP_H - hoursSince(s.remind_at, now)) };
  if (channel && !CHANNELS[channel]) return { error: 'Невідомий канал', status: 400 };
  const k = await clientOf(env, p);
  const text = remindText(s.name, p.title, p.id, k.lang, k.name);
  let used = channel;
  if (!channel) {
    if (!k.chat || !await send(env, k.chat, text)) return auto ? { ok: false, sent: false } : { ok: true, sent: false, text, phone: k.c && k.c.phone, lang: k.lang };
    used = 'telegram';
  }
  const at = kyivStamp(now);
  stages[i] = { ...s, remind_at: at, remind_n: (Number(s.remind_n) || 0) + (auto ? 1 : 0),
    hist: [...(Array.isArray(s.hist) ? s.hist : []), { act: 'remind', at, by: auto ? 'автоматично' : (x && x.name) || null, note: CHANNELS[used] }].slice(-30) };
  await env.DB.prepare('UPDATE projects SET stages = ? WHERE id = ?').bind(JSON.stringify(stages), p.id).run();
  await audit(env, request, x || { name: 'автоматично', role: 'system' }, 'client.remind', 'projects', p.id, null, { stage_id: s.id, channel: used, auto });
  return { ok: true, sent: used === 'telegram', channel: used, text };
}

// Попросити відгук у Google (один раз; повтор — 409, якщо вже просили)
export async function askReview(env, request, x, p, { channel = null, auto = false, now = new Date() } = {}) {
  if (p.status !== 'done') return { error: 'Відгук просимо лише після завершення проєкту', status: 409 };
  if (p.review_asked_at) return { error: `Відгук уже просили ${p.review_asked_at}`, status: 409 };
  if (channel && !CHANNELS[channel]) return { error: 'Невідомий канал', status: 400 };
  const k = await clientOf(env, p);
  const text = reviewText(p.title, k.lang, k.name);
  let used = channel;
  if (!channel) {
    if (!k.chat || !await send(env, k.chat, text)) return auto ? { ok: false, sent: false } : { ok: true, sent: false, text, phone: k.c && k.c.phone, lang: k.lang };
    used = 'telegram';
  }
  await env.DB.prepare("UPDATE projects SET review_asked_at = datetime('now'), review_channel = ? WHERE id = ?").bind(used, p.id).run();
  await audit(env, request, x || { name: 'автоматично', role: 'system' }, 'client.review', 'projects', p.id, null, { channel: used, auto });
  return { ok: true, sent: used === 'telegram', channel: used, text };
}

// Автоматичний прохід (з /api/admin/lead-sla, кожні 5 хв): лише вдень, порція до 20 проєктів кожного виду
export async function runNudges(env, request, now = new Date()) {
  if (!dayTime(now)) return { quiet: true };
  const out = { reminders: 0, reviews: 0 };
  try {
    const { results: P } = await env.DB.prepare(`SELECT p.* FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.status = 'active' AND p.service IN ('design', 'arch')
        AND p.stages LIKE '%"review"%' AND (c.provider = 'telegram' OR c.tg_id IS NOT NULL) ORDER BY p.id LIMIT 200`).all();
    for (const p of P) {
      for (const s of parse(p.stages)) {
        if (out.reminders >= 20) break;
        if (s.status !== 'review' || s.approved_at || !s.review_at || hoursSince(s.review_at, now) < REMIND_AUTO_AFTER_H) continue;
        if ((Number(s.remind_n) || 0) >= REMIND_AUTO_MAX || (s.remind_at && hoursSince(s.remind_at, now) < REMIND_GAP_H)) continue;
        const r = await remindStage(env, request, null, p, s.id, { auto: true, now });
        if (r.sent) { out.reminders++; p.stages = (await env.DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(p.id).first()).stages; }
      }
    }
    const cut = new Date(now.getTime() - REVIEW_AFTER_H * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    // лише клієнти з Telegram (бот може написати); решта — кнопка «Попросити відгук» в адмінці
    const { results: D } = await env.DB.prepare(`SELECT p.* FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.status = 'done' AND p.done_at IS NOT NULL AND p.done_at <= ?
        AND p.review_asked_at IS NULL AND (c.provider = 'telegram' OR c.tg_id IS NOT NULL) ORDER BY p.done_at LIMIT 20`).bind(cut).all();
    for (const p of D) {
      const r = await askReview(env, request, null, p, { auto: true, now });
      if (r.sent) out.reviews++;
    }
  } catch (e) { if (!noTable(e)) throw e; out.pending = true; }
  return out;
}
