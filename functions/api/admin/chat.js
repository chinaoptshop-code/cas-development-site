// /api/admin/chat — «Чат на сайті» в /kabinet/admin (assets/admin/chat.v1.js). Права (functions/_roles.js): chat.view — список, розмова, файли;
// chat.reply — відповідь людини, зміна стану, заявка з розмови. Обидва — власник і менеджер. Ліміт записів — STAFF_LIMITS.chat (functions/_rate.js).
// Токен, sid і хеш IP відвідувача назовні не віддаємо; текст і імена файлів — дані (адмінка вставляє їх лише через esc / textContent).
//
// GET  ?state=bot|waiting|staff|closed|unread&q=&limit=1..200&before=<id> — список розмов (нові зверху): {rows, more, next, counts, online, storage: {used, cap}|null}
// GET  ?id=<n> — розмова з повідомленнями й файлами: {session, messages}; позначає розмову переглянутою
// GET  ?file=<24 hex> — байти файлу (як вкладення)
// POST {id, text} — відповідь людини (role staff): стан staff, бот у розмові більше не відповідає, доки не повернуть «боту»
// POST {id, action: 'lead', phone?, name?} — створити заявку CRM з розмови (якщо ще немає)
// PATCH {id, state: bot|waiting|staff|closed} — змінити стан («Повернути боту», «Закрити»)
import { bad, json, normalizePhone, readJSON, str } from '../../_lib.js';
import { audit, need } from '../../_roles.js';
import { TOO_MANY, staffLimited } from '../../_rate.js';
import { ChatError, FILE_RE, HANDOFF, L, STATES, addMessage, botOnline, clean, fileResponse, hasR2, leadFromChat, messages, r2Cap, r2Used, wrap } from '../../_chat.js';

const pub = s => ({ id: s.id, state: s.state, handoff_reason: s.handoff_reason || null, handoff_label: s.handoff_reason ? HANDOFF[s.handoff_reason] || null : null, lang: s.lang, page: s.page, ref_host: s.ref_host, created_at: s.created_at, last_at: s.last_at,
  last_user_at: s.last_user_at, last_bot_at: s.last_bot_at, msgs: s.msgs, files: s.files ?? undefined, bytes: s.bytes,
  unread: s.last_user_id > s.staff_seen_id, waiting_reply: s.last_user_id > s.answered_upto,
  lead: s.order_id ? { id: s.order_id, number: s.number || null } : null, last_text: s.last_text ?? undefined, last_role: s.last_role ?? undefined });

export const onRequestGet = ({ request, env }) => wrap(async () => {
  const { x, error } = await need(request, env, 'chat.view');
  if (error) return error;
  const u = new URL(request.url), p = u.searchParams;
  if (p.has('file')) {
    const id = p.get('file') || '';
    if (!FILE_RE.test(id)) return bad('Файл не знайдено', 404);
    const f = await env.DB.prepare('SELECT * FROM chat_files WHERE id = ?').bind(id).first();
    return f ? fileResponse(env, f) : bad('Файл не знайдено', 404);
  }
  if (p.has('id')) {
    const id = parseInt(p.get('id'), 10) || 0;
    const s = await env.DB.prepare('SELECT s.*, o.number FROM chat_sessions s LEFT JOIN orders o ON o.id = s.order_id WHERE s.id = ?').bind(id).first();
    if (!s) return bad('Розмову не знайдено', 404);
    const list = await messages(env, s.id, '1=1', [], 500);
    const last = list.length ? list[list.length - 1].id : 0;
    if (last > s.staff_seen_id) await env.DB.prepare('UPDATE chat_sessions SET staff_seen_id = ? WHERE id = ?').bind(last, s.id).run();
    return json({ session: pub(s), messages: list, online: await botOnline(env), can_reply: x.can('chat.reply') });
  }
  const limit = Math.max(1, Math.min(200, parseInt(p.get('limit'), 10) || 50));
  const args = [], w = ['s.msgs > 0'];
  const st = p.get('state') || '';
  if (st === 'unread') w.push('s.last_user_id > s.staff_seen_id');
  else if (STATES.includes(st)) { w.push('s.state = ?'); args.push(st); }
  const q = clean(p.get('q'), 80);
  if (q) {
    w.push("(o.number LIKE ?1q OR s.page LIKE ?1q OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.session_id = s.id AND m.text LIKE ?1q) OR EXISTS (SELECT 1 FROM chat_files f WHERE f.session_id = s.id AND f.name LIKE ?1q))");
    args.push('%' + q.replace(/[%_]/g, '') + '%');
  }
  const before = parseInt(p.get('before'), 10) || 0;
  if (before > 0) { w.push('s.id < ?'); args.push(before); }
  // параметри нумеруємо явно (?1, ?2 …): пошук використовує той самий параметр кілька разів
  const parts = [], vals = [];
  for (const cond of w) {
    if (cond.includes('?1q')) { vals.push(args.shift()); parts.push(cond.replace(/\?1q/g, '?' + vals.length)); }
    else if (cond.includes('?')) { vals.push(args.shift()); parts.push(cond.replace('?', '?' + vals.length)); }
    else parts.push(cond);
  }
  const where = parts.join(' AND ');
  const { results } = await env.DB.prepare(`SELECT s.*, o.number,
      (SELECT m.text FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_text,
      (SELECT m.role FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_role,
      (SELECT COUNT(*) FROM chat_files f WHERE f.session_id = s.id AND f.role = 'user' AND f.message_id IS NOT NULL) AS files
      FROM chat_sessions s LEFT JOIN orders o ON o.id = s.order_id WHERE ${where} ORDER BY s.id DESC LIMIT ?${vals.length + 1}`).bind(...vals, limit + 1).all();
  const more = results.length > limit, rows = results.slice(0, limit).map(r => ({ ...pub(r), last_text: str(r.last_text, 160) }));
  const c = await env.DB.prepare(`SELECT state, COUNT(*) AS n, SUM(CASE WHEN last_user_id > staff_seen_id THEN 1 ELSE 0 END) AS unread FROM chat_sessions WHERE msgs > 0 GROUP BY state`).all();
  const counts = { all: 0, unread: 0 };
  for (const r of c.results) { counts[r.state] = r.n; counts.all += r.n; counts.unread += r.unread || 0; }
  // «Сховище: X з Y ГБ» — лише коли R2 привʼязано (файли чату; стеля — CHAT_R2_CAP_GB)
  const storage = hasR2(env) ? { used: await r2Used(env), cap: r2Cap(env) } : null;
  return json({ rows, more, next: more ? rows[rows.length - 1].id : null, counts, online: await botOnline(env), storage });
});

async function target(env, d) {
  const id = parseInt(d && d.id, 10) || 0;
  const s = id ? await env.DB.prepare('SELECT * FROM chat_sessions WHERE id = ?').bind(id).first() : null;
  if (!s) throw new ChatError('Розмову не знайдено', 404);
  return s;
}

export const onRequestPost = ({ request, env, waitUntil }) => wrap(async () => {
  const { x, error } = await need(request, env, 'chat.reply');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 24 * 1024) || {}; } catch { return bad('Некоректні дані'); }
  const s = await target(env, d);
  if (await staffLimited(env, request, x, 'chat')) return bad(TOO_MANY, 429);
  if (d.action === 'lead') {
    const phone = d.phone ? normalizePhone(d.phone) : null;
    if (d.phone && !phone) return bad('Телефон: формат +380… або міжнародний');
    const r = await leadFromChat(env, s, { phone, name: str(d.name, 120), by: x.name, waitUntil });
    if (!r.existing) await audit(env, request, x, 'chat.lead', 'chat', s.id, null, { order: r.number });
    return json({ ok: true, number: r.number, order_id: r.id, existing: !!r.existing });
  }
  if (typeof d.text !== 'string') return bad('text: рядок');
  const text = clean(d.text, L.botText);
  if (!text) return bad('Порожня відповідь', 422);
  const id = await addMessage(env, s, 'staff', text, { author: str(x.name, 80) });
  await env.DB.prepare(`UPDATE chat_sessions SET state = 'staff', answered_upto = last_user_id, lock_until = NULL, typing_until = NULL, staff_seen_id = ?,
      last_at = datetime('now') WHERE id = ?`).bind(id, s.id).run();
  await audit(env, request, x, 'chat.reply', 'chat', s.id, null, { message: id });
  return json({ ok: true, id, state: 'staff' });
});

export const onRequestPatch = ({ request, env }) => wrap(async () => {
  const { x, error } = await need(request, env, 'chat.reply');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 4096) || {}; } catch { return bad('Некоректні дані'); }
  const s = await target(env, d);
  if (!STATES.includes(d.state)) return bad('state: ' + STATES.join(' | '));
  if (await staffLimited(env, request, x, 'chat')) return bad(TOO_MANY, 429);
  // «Повернути боту» з розмови, яку вела людина: те, що відвідувач написав людині, бот не перепитує — відповідає лише на нові повідомлення
  const handled = s.state === 'staff' && d.state === 'bot' ? ', answered_upto = last_user_id' : '';
  await env.DB.prepare(`UPDATE chat_sessions SET state = ?, lock_until = NULL${handled}, last_at = datetime('now') WHERE id = ?`).bind(d.state, s.id).run();
  await audit(env, request, x, 'chat.state', 'chat', s.id, { state: s.state }, { state: d.state });
  return json({ ok: true, state: d.state });
});
