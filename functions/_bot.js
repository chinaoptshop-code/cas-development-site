// Бот сайту в Telegram — кнопки керування й команди для працівників (Михайло 23.11.2026: «кнопки керування в Telegram»;
// інструкція — tools/admin/README.md, розділ 19). Вебхук — functions/api/tg/webhook.js; сповіщення й тексти заявок — functions/_alerts.js;
// задачі — functions/_tasks.js.
//
// Хто: лише працівник, якого сервер упізнав за Telegram id (staffCtxTg у functions/_roles.js — той самий ctx і ті самі x.can(), що в CRM).
//   Чужим (клієнти, що входять на сайт через цього ж бота, будь-хто інший) бот на команди не відповідає, а на кнопки — «Немає доступу».
// Як: кнопки шлють callback_data лише з id і кодом дії (≤ 64 байти); текст кнопки сервер не читає. Кожна дія — через той самий серверний шлях,
//   що й CRM: зміна заявки — patchOne з functions/api/admin/crm.js (права, видимість, історія, аудит, сповіщення відповідальному),
//   задачі — createTask / setDone / updateTask / stageTask* з functions/_tasks.js. Ліміти записів — STAFF_LIMITS (crm, tasks) на працівника.
//   Повторне натискання нічого не ламає: «Уже …» замість другої зміни. Застаріла клавіатура (заявку вже змінили) — так само «Уже …».
//   Усе, що йде з даних (імена, послуги, коментарі, назви задач), — HTML-екранування (escHtml). Телефон клієнта — лише з clients.contacts
//   (shapeOrder), сторінка й зовнішнє джерело — лише з leads.view_all, як у CRM.
// Кнопки: під заявкою «✅ Взяв у роботу» → «📞 Подзвонив», «🔕 Не додзвонився» (+ нагадування через 1 год у робочий час), «📝 Задача»
//   (сьогодні / завтра), «➡️ Статус» (стадії CRM), «👤 Передати» (працівники, що ведуть заявки); під задачею — «✅ Виконано» (і «↩️ Скасувати»),
//   «⏰ Завтра». Команди (лише особистий чат; у групах — тільки /help): /today /leads /tasks /lead <номер> /task <текст> /stats /help,
//   і постійна клавіатура «Сьогодні · Заявки · Задачі».
// Тихі години: сам бот пише лише 10:00–20:00 Київ (нагадування задач — runTaskNotices), на команди й кнопки відповідає завжди.
// Тести — tools/tests/tgbot.mjs (у run.mjs).
import { dict, statusLabel, statusesOf } from './_lib.js';
import { CRM_URL, SLA_MIN, escHtml as esc, fmtMin, kyiv, kyivMidnight, leadActions, leadKeyboard, leadText, parseUtc, setCommandsFor, sqlTime, takeLead, tg } from './_alerts.js';
import { ROLES, audit, canSeeProject, noTable, orderScope, shapeOrder, staffCtxTg } from './_roles.js';
import { TOO_MANY, staffLimited } from './_rate.js';
import { patchOne, visible } from './api/admin/crm.js';
import { Bad, canSeeTasks, createTask, listTasks, setDone, stageTaskDone, stageTaskEdit, taskRef, taskRow, tasksReady, updateTask } from './_tasks.js';
import { refHostLabel } from './_refhost.js';

const TEAM_URL = 'https://cas-develop.com/kabinet/team';
const cut = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const dm = d => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '');
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const atKyiv = (date, hm) => { const [h, m] = hm.split(':').map(Number); return new Date(kyivMidnight(date).getTime() + (h * 60 + m) * 60000); };
const MAX = 3900; // ліміт Telegram — 4096 символів
const clip = s => (s.length > MAX ? s.slice(0, MAX) + '\n…' : s);

// Постійна клавіатура особистого чату: шле ті самі команди
export const MENU = { keyboard: [[{ text: 'Сьогодні' }, { text: 'Заявки' }, { text: 'Задачі' }]], resize_keyboard: true, is_persistent: true };
const ALIAS = dict({ 'сьогодні': 'today', 'заявки': 'leads', 'задачі': 'tasks' });
const say = (env, chat, text, markup) => tg(env, 'sendMessage', { chat_id: String(chat), text: clip(text), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(markup ? { reply_markup: markup } : {}) });
const homeOf = x => (x.can('panel.admin') ? CRM_URL : TEAM_URL);

// ===== картка заявки =====
// leadText (functions/_alerts.js) з полями в межах прав + рядок стану; клавіатура — «Взяти» для нової, інакше дії
export function cardText(o, x) {
  const r = shapeOrder(o, x);
  if (!x.can('leads.view_all')) { delete r.ref_host; delete r.ref_path; }
  const st = [`➡️ <b>${esc(statusLabel(o.status, o.kind))}</b>`, o.assignee ? `👤 ${esc(o.assignee)}` : null,
    o.taken_at && o.reaction_min != null ? `⏱ ${fmtMin(o.reaction_min)}` : null, o.next_contact ? `📅 ${dm(o.next_contact)}` : null].filter(Boolean).join(' · ');
  return leadText(r) + '\n\n' + st;
}
export const cardKb = (o, x) => (!o.taken_at && o.status === 'new' ? leadKeyboard(o.id) : leadActions(o.id, homeOf(x)));
const back = id => [{ text: '← Назад', callback_data: `l:${id}:b` }];
function statusKb(o) {
  const ST = statusesOf(o.kind), rows = [];
  const btn = Object.keys(ST).map(k => ({ text: (k === o.status ? '• ' : '') + ST[k], callback_data: `l:${o.id}:s:${k}` }));
  for (let i = 0; i < btn.length; i += 2) rows.push(btn.slice(i, i + 2));
  return { inline_keyboard: [...rows, back(o.id)] };
}
// хто може вести заявки: ролі з leads.view_all або leads.view_assigned, лише активні
async function leadStaff(env) {
  try {
    return (await env.DB.prepare('SELECT id, name, role FROM staff WHERE active = 1 ORDER BY name, id').all()).results
      .filter(s => ROLES[s.role] && ROLES[s.role].perms.some(p => p === 'leads.view_all' || p === 'leads.view_assigned')).slice(0, 12);
  } catch (e) { if (noTable(e)) return []; throw e; }
}
async function assignKb(env, o) {
  const list = await leadStaff(env), rows = [];
  const btn = list.map(s => ({ text: (s.id === o.assignee_staff_id ? '✓ ' : '') + cut(s.name, 24), callback_data: `l:${o.id}:a:${s.id}` }));
  for (let i = 0; i < btn.length; i += 2) rows.push(btn.slice(i, i + 2));
  return { inline_keyboard: [...rows, back(o.id)] };
}
const taskMenu = id => ({ inline_keyboard: [[{ text: '📝 Сьогодні', callback_data: `l:${id}:t1` }, { text: '📝 Завтра', callback_data: `l:${id}:t2` }], back(id)] });

const editKb = (env, msg, markup) => (msg && msg.chat && msg.message_id ? tg(env, 'editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: markup }) : null);
const editCard = (env, msg, o, x) => (msg && msg.chat && msg.message_id ? tg(env, 'editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text: clip(cardText(o, x)),
  parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: cardKb(o, x) }) : null);

// той самий запис у історії від того самого працівника за останні 2 хв — подвійне натискання
const recent = async (env, id, note, who) => !!await env.DB.prepare("SELECT 1 FROM order_events WHERE order_id = ? AND note = ? AND author = ? AND created_at >= datetime('now', '-2 minutes')")
  .bind(id, note, who).first();
const errOf = async r => { const j = await r.json().catch(() => ({})); return j.error || 'Не вдалося зберегти'; };
// «Не додзвонився»: нагадати через 1 год, але лише в робочий час 10:00–20:00 Київ (інакше — о 10:00 наступного робочого вікна)
export function remindTime(now) {
  const t = new Date(now.getTime() + 3600000), k = kyiv(t);
  if (k.h < 10) return atKyiv(k.date, '10:00');
  if (k.h >= 20) return atKyiv(addDays(k.date, 1), '10:00');
  return new Date(Math.ceil(t.getTime() / 60000) * 60000);
}
async function setRemind(env, id, when) {
  try { await env.DB.prepare('UPDATE tasks SET remind_at = ? WHERE id = ?').bind(when ? sqlTime(when) : null, id).run(); return true; }
  catch (e) { if (noTable(e)) return false; throw e; } // до migrations/0020 — без нагадування в точний час
}
const canOwnTasks = x => !!x.staffId && canSeeTasks(x);
// відкрита задача «Передзвонити …» цього працівника по цій заявці
const callTask = (env, x, o, title) => env.DB.prepare("SELECT * FROM tasks WHERE order_id = ? AND assignee_staff_id = ? AND status = 'open' AND title = ? ORDER BY id DESC LIMIT 1")
  .bind(o.id, x.staffId, title).first();

// ===== кнопки =====
export async function onCallback(env, request, cq) {
  const data = String(cq.data || ''), msg = cq.message || null;
  const answer = (text = '', alert = false) => tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: cut(text, 190), show_alert: alert });
  if (msg && msg.chat && msg.chat.type && msg.chat.type !== 'private') return answer('Кнопки працюють лише в особистому чаті з ботом', true);
  const x = await staffCtxTg(env, cq.from && cq.from.id);
  if (!x.role) return answer(x.deactivated ? 'Доступ працівника вимкнено' : 'Немає доступу', true);
  const chat = msg && msg.chat ? msg.chat.id : cq.from.id;
  let m;
  try {
    if ((m = /^take:(\d{1,12})$/.exec(data))) return await leadAct(env, request, x, +m[1], 'take', null, msg, chat, answer);
    if ((m = /^l:(\d{1,12}):(v|b|c|n|t|t1|t2|s|a)(?::([a-z_]{2,20}|\d{1,12}))?$/.exec(data))) return await leadAct(env, request, x, +m[1], m[2], m[3] ?? null, msg, chat, answer);
    if ((m = /^k:(p?)(\d{1,12}):(d|u|m)$/.exec(data))) return await taskAct(env, request, x, m[1] === 'p', +m[2], m[3], msg, answer);
  } catch (e) {
    if (e instanceof Bad) return answer(e.message, true);
    if (noTable(e)) return answer('Розділ оновлюється — спробуйте за кілька хвилин', true);
    throw e;
  }
  return answer('');
}

async function leadAct(env, request, x, id, act, arg, msg, chat, answer) {
  const o = await visible(env, x, id); // чужа заявка — як неіснуюча
  if (!o) return answer('Заявку не знайдено', true);
  if (act === 'v') { await say(env, chat, cardText(o, x), cardKb(o, x)); return answer(''); }
  if (act === 'b') { await editKb(env, msg, cardKb(o, x)); return answer(''); }
  if (!x.can(o.kind === 'lead' ? 'leads.edit' : 'orders.edit')) return answer('Немає права змінювати цю заявку', true);
  if (act === 's' && arg == null) { await editKb(env, msg, statusKb(o)); return answer('Оберіть стадію'); }
  if (act === 'a') {
    if (!x.can('leads.assign')) return answer('Немає права передавати заявки', true);
    if (arg == null) { await editKb(env, msg, await assignKb(env, o)); return answer('Кому передати?'); }
  }
  if (act === 't') {
    if (!canOwnTasks(x)) return answer('Немає права на задачі', true);
    await editKb(env, msg, taskMenu(o.id)); return answer('Коли передзвонити?');
  }
  const now = new Date(), k = kyiv(now), title = `Передзвонити ${o.number}`;
  if ((act === 't1' || act === 't2') && !canOwnTasks(x)) return answer('Немає права на задачі', true);
  if (await staffLimited(env, request, x, act === 't1' || act === 't2' ? 'tasks' : 'crm')) return answer(TOO_MANY, true);
  let reply = '', alert = false;
  const taken = o.status === 'new' ? { status: 'in_work' } : {}; // подзвонив / не додзвонився — заявку вже взято в роботу
  if (act === 'take') {
    const r = await takeLead(env, o.id, x.name, 'Telegram', now, x.staffId);
    if (r.already) { reply = `Уже взяв ${r.o.assignee || 'інший менеджер'}${r.o.reaction_min != null ? ` (за ${fmtMin(r.o.reaction_min)})` : ''}`; alert = true; }
    else { reply = `Заявка ваша. Час реакції — ${fmtMin(r.min)}`; await audit(env, request, x, 'lead.take', 'orders', o.id, { status: o.status }, { status: r.o.status, taken_via: 'Telegram', reaction_min: r.min }); }
  } else if (act === 'c') {
    const note = '📞 Подзвонив (Telegram)';
    if (await recent(env, o.id, note, x.name)) reply = 'Уже відмічено';
    else { const r = await patchOne(env, request, x, { id: o.id, note, ...taken }); if (r.status !== 200) return answer(await errOf(r), true); reply = '📞 Відмічено: подзвонили'; }
  } else if (act === 'n') {
    const note = '🔕 Не додзвонився (Telegram)', when = remindTime(now), w = kyiv(when);
    if (await recent(env, o.id, note, x.name)) reply = 'Уже відмічено';
    else {
      const r = await patchOne(env, request, x, { id: o.id, note, next_contact: w.date, ...taken });
      if (r.status !== 200) return answer(await errOf(r), true);
      reply = '🔕 Відмічено: не додзвонилися';
      if (canOwnTasks(x) && await tasksReady(env)) {
        const cur = await callTask(env, x, o, title);
        let tid = cur && cur.id;
        if (cur) { if (cur.due_date !== w.date || cur.due_time !== w.hm) await updateTask(env, request, x, cur, { due_date: w.date, due_time: w.hm }, now); }
        else tid = await createTask(env, request, x, { title, due_date: w.date, due_time: w.hm, order_id: o.id }, now);
        const rem = await setRemind(env, tid, when);
        reply += rem ? `. Нагадаю ${w.date === k.date ? 'о' : dm(w.date) + ' о'} ${w.hm}` : `. Задача на ${dm(w.date)} ${w.hm}`;
      }
    }
  } else if (act === 't1' || act === 't2') {
    if (!await tasksReady(env)) return answer('Задачі оновлюються — спробуйте за кілька хвилин', true);
    const due = act === 't1' ? k.date : addDays(k.date, 1), cur = await callTask(env, x, o, title);
    if (cur && cur.due_date === due) reply = `Уже є задача на ${act === 't1' ? 'сьогодні' : 'завтра'}`;
    else if (cur) { await updateTask(env, request, x, cur, { due_date: due }, now); reply = `📝 Задачу перенесено на ${dm(due)}`; }
    else { await createTask(env, request, x, { title, due_date: due, order_id: o.id }, now); reply = `📝 Задача «${title}» — ${act === 't1' ? 'сьогодні' : 'завтра'}`; }
  } else if (act === 's') {
    const ST = statusesOf(o.kind);
    if (!ST[arg]) return answer('Невідома стадія', true);
    if (o.status === arg) reply = `Уже «${ST[arg]}»`;
    else { const r = await patchOne(env, request, x, { id: o.id, status: arg }); if (r.status !== 200) return answer(await errOf(r), true); reply = `➡️ ${ST[arg]}`; }
  } else if (act === 'a') {
    const sid = Number(arg), list = await leadStaff(env), s = list.find(v => v.id === sid);
    if (!s) return answer('Працівника не знайдено або вимкнено', true);
    if (o.assignee_staff_id === sid) reply = `Уже на ${s.name}`;
    else { const r = await patchOne(env, request, x, { id: o.id, assignee_staff_id: sid }); if (r.status !== 200) return answer(await errOf(r), true); reply = `👤 Передано: ${s.name}`; }
  }
  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first();
  await editCard(env, msg, fresh, x);
  return answer(reply, alert);
}

// у клавіатурі повідомлення — рядок задачі ref: після «Виконано» — «↩️ Скасувати», після «Скасувати» — знову «Виконано / Завтра»
function swapRow(markup, ref, row) {
  const rows = markup && Array.isArray(markup.inline_keyboard) ? markup.inline_keyboard : null;
  if (!rows) return null;
  const has = r => Array.isArray(r) && r.some(b => b && typeof b.callback_data === 'string' && b.callback_data.startsWith(`k:${ref}:`));
  if (!rows.some(has)) return null;
  return { inline_keyboard: rows.map(r => (has(r) ? row : r)) };
}
const taskCount = markup => new Set(((markup && markup.inline_keyboard) || []).flat().map(b => b && /^k:(p?\d+):/.exec(b.callback_data || '')).filter(Boolean).map(m => m[1])).size;

async function taskAct(env, request, x, stage, id, act, msg, answer) {
  if (!canSeeTasks(x)) return answer('Немає права на задачі', true);
  if (!await tasksReady(env)) return answer('Задачі оновлюються — спробуйте за кілька хвилин', true);
  if (await staffLimited(env, request, x, 'tasks')) return answer(TOO_MANY, true);
  const now = new Date(), tomorrow = addDays(kyiv(now).date, 1), ref = (stage ? 'p' : '') + id;
  let t, reply;
  if (stage) {
    const tk = await env.DB.prepare('SELECT * FROM project_tasks WHERE id = ?').bind(id).first();
    if (!tk || !await canSeeProject(env, x, tk.project_id)) return answer('Задачу не знайдено', true);
    if (act === 'm') {
      if (tk.done) return answer('Задачу вже виконано', true);
      if (tk.due_date === tomorrow) reply = 'Уже на завтра';
      else { await stageTaskEdit(env, request, x, id, { due_date: tomorrow }); reply = `⏰ Перенесено на ${dm(tomorrow)}`; }
    } else {
      const r = await stageTaskDone(env, request, x, id, act === 'd'); // права й видимість обʼєкта — усередині
      reply = act === 'd' ? (r.changed ? '✅ Виконано' : 'Уже виконано') : (r.changed ? '↩️ Повернуто в роботу' : 'Уже в роботі');
    }
    t = { src: 'p', id, title: tk.title };
  } else {
    const cur = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    // чужу задачу без tasks.manage не видно — як неіснуючу (так само, як /api/team/tasks)
    if (!cur || (!x.can('tasks.manage') && cur.assignee_staff_id !== x.staffId)) return answer('Задачу не знайдено', true);
    if (act === 'm') {
      if (cur.status !== 'open') return answer('Задачу вже закрито', true);
      if (cur.due_date === tomorrow) reply = 'Уже на завтра';
      else {
        await updateTask(env, request, x, cur, { due_date: tomorrow }, now);
        if (cur.remind_at) await setRemind(env, id, cur.due_time ? atKyiv(tomorrow, cur.due_time) : null); // нагадування переїжджає разом зі строком
        reply = `⏰ Перенесено на ${dm(tomorrow)}`;
      }
    } else {
      const r = await setDone(env, request, x, cur, act === 'd', null, now);
      reply = act === 'd' ? (r.changed ? '✅ Виконано' : 'Уже виконано') : (r.changed ? '↩️ Повернуто в роботу' : 'Уже в роботі');
    }
    t = { src: 't', id, title: cur.title };
  }
  const single = taskCount(msg && msg.reply_markup) <= 1;
  const row = act === 'd' ? [{ text: '↩️ Скасувати' + (single ? '' : ': ' + cut(t.title, 22)), callback_data: `k:${taskRef(t)}:u` }] : taskRow(t, single);
  const mk = msg && swapRow(msg.reply_markup, ref, row);
  if (mk) await editKb(env, msg, mk);
  return answer(reply);
}

// ===== команди =====
const HELP = [
  '<b>Бот CAS Development — для працівників студії</b>', '',
  '/today — сьогодні: нові заявки без відповіді й мої задачі',
  '/leads — заявки без відповіді (останні 10)',
  '/tasks — мої відкриті задачі',
  '/lead LD-2611-0001 — картка заявки з кнопками (можна лише цифри: /lead 1)',
  '/task Подзвонити постачальнику завтра 11:00 — задача собі (сьогодні / завтра / дд.мм і гг:хх; з часом — нагадаю)',
  '/stats — заявки за 7 днів',
  '', 'Під заявкою: ✅ Взяв у роботу → 📞 Подзвонив · 🔕 Не додзвонився · 📝 Задача · ➡️ Статус · 👤 Передати.',
  'Під задачею: ✅ Виконано (↩️ Скасувати) · ⏰ Завтра.',
  'Сам бот пише лише 10:00–20:00 за Києвом (нові заявки — одразу).',
].join('\n');

// розбір /task: «… сьогодні|завтра|післязавтра|дд.мм[.рррр] … гг:хх» → {title, due_date, due_time}; чого не розібрали — лишається в назві
export function parseTask(text, now = new Date()) {
  const today = kyiv(now).date;
  let s = ' ' + String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ') + ' ', date = null, time = null;
  const take = (re, f) => { const m = re.exec(s); if (m && f(m) !== false) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); };
  take(/\s(?:о|в|об|at)?\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s)/i, m => { time = m[1].padStart(2, '0') + ':' + m[2]; });
  take(/\s(сьогодні|сегодня|today)(?=[\s,.!])/i, () => { date = today; });
  if (!date) take(/\s(післязавтра|послезавтра)(?=[\s,.!])/i, () => { date = addDays(today, 2); });
  if (!date) take(/\s(завтра|tomorrow)(?=[\s,.!])/i, () => { date = addDays(today, 1); });
  if (!date) take(/\s(?:на\s+)?(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=[\s,.!])/, m => {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : today.slice(0, 4);
    let d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(d + 'T00:00:00Z')) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d) return false;
    if (!m[3] && d < today) d = (+y + 1) + d.slice(4); // 05.01 у грудні — наступного року
    date = d;
  });
  if (time && !date) date = today;
  const title = s.replace(/\s+/g, ' ').replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '').slice(0, 200);
  return { title, due_date: date, due_time: date ? time : null };
}

// Повідомлення в особистому чаті працівника. Повертає true, якщо це була команда (оброблено), false — не наше (вхід за номером тощо).
export async function onCommand(env, request, msg) {
  const chat = msg.chat && msg.chat.id, text = String(msg.text || '').trim();
  const m = /^\/([a-z_]{2,20})(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text);
  const cmd = m ? m[1].toLowerCase() : ALIAS[text.toLowerCase()];
  if (!cmd) return false;
  const x = await staffCtxTg(env, msg.from && msg.from.id);
  if (!x.role) return cmd !== 'start'; // чужим — нічого (клієнтам бот лише допомагає увійти на сайт)
  const arg = m ? (m[2] || '').trim() : '';
  const now = new Date();
  switch (cmd) {
    case 'start':
      await setCommandsFor(env, chat);
      await say(env, chat, 'Готово: сюди приходитимуть нові заявки з сайту й замовлення Оздоби, нагадування й щоденний звіт.\nКнопки нижче — «Сьогодні», «Заявки», «Задачі»; усі команди — /help.', MENU);
      return true;
    case 'help': await say(env, chat, HELP, MENU); return true;
    case 'today': await say(env, chat, ...await today(env, x, now)); return true;
    case 'leads': await say(env, chat, ...await leadsList(env, x)); return true;
    case 'tasks': await say(env, chat, ...await tasksList(env, x, now)); return true;
    case 'lead': await say(env, chat, ...await leadCard(env, x, arg)); return true;
    case 'stats': await say(env, chat, ...await stats(env, x, now)); return true;
    case 'task': await say(env, chat, ...await newTask(env, request, x, arg, now)); return true;
    default: await say(env, chat, 'Не знаю такої команди. Усі команди — /help', MENU); return true;
  }
}

// нові заявки без відповіді (видимі працівнику), нові зверху
async function waiting(env, x, limit) {
  const a = [], w = orderScope(x, a);
  return (await env.DB.prepare(`SELECT o.* FROM orders o WHERE ${w} AND o.status = 'new' AND o.taken_at IS NULL ORDER BY o.id DESC LIMIT ?`).bind(...a, limit).all()).results;
}
const leadLine = o => `• <b>${esc(o.number)}</b> · ${kyiv(parseUtc(o.created_at)).hm}${kyiv(parseUtc(o.created_at)).date !== kyiv(new Date()).date ? ' ' + dm(kyiv(parseUtc(o.created_at)).date) : ''} · ${esc(cut(o.service || (o.kind === 'order' ? 'Оздоба' : 'заявка'), 60))}`;
const leadRow = o => [{ text: `📋 ${o.number}`, callback_data: `l:${o.id}:v` }, { text: '✅ Взяти', callback_data: `take:${o.id}` }];
const canLeads = x => x.can('leads.view_all') || x.can('leads.view_assigned') || x.can('orders.view');
async function myTasks(env, x, now) {
  if (!canOwnTasks(x) || !await tasksReady(env)) return null;
  return (await listTasks(env, x, { view: 'mine', limit: 60 }, now)).rows;
}
const taskLine = (t, k) => `• ${t.priority === 'high' ? '❗ ' : ''}${esc(cut(t.title, 120))}${t.due_date ? ` — ${t.due_date === k.date ? (t.due_time || 'сьогодні') : (t.overdue ? 'з ' : 'до ') + dm(t.due_date) + (t.due_time ? ' ' + t.due_time : '')}` : ''}${t.overdue ? ' ⚠️' : ''}`;

async function today(env, x, now) {
  const k = kyiv(now), out = [`🗓 <b>Сьогодні, ${dm(k.date)}</b>`], kb = [];
  if (canLeads(x)) {
    const a = [], w = orderScope(x, a);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${w} AND o.created_at >= ?`).bind(...a, sqlTime(kyivMidnight(k.date))).first();
    const list = await waiting(env, x, 10);
    out.push('', `Нових заявок сьогодні: <b>${(n && n.n) || 0}</b>`, list.length ? `<b>Без відповіді (${list.length}${list.length === 10 ? '+' : ''})</b>` : '✅ Без відповіді — жодної', ...list.map(leadLine));
    kb.push(...list.slice(0, 5).map(leadRow));
  }
  const tasks = await myTasks(env, x, now);
  if (tasks) {
    const due = tasks.filter(t => t.overdue || t.due_date === k.date);
    out.push('', due.length ? `<b>Мої задачі на сьогодні й прострочені (${due.length})</b>` : '✅ Задач на сьогодні немає', ...due.slice(0, 15).map(t => taskLine(t, k)));
    kb.push(...due.slice(0, 8).map(t => taskRow(t, false)));
  }
  kb.push([{ text: '📋 Відкрити', url: homeOf(x) }]);
  return [out.join('\n'), { inline_keyboard: kb }];
}
async function leadsList(env, x) {
  if (!canLeads(x)) return ['Заявки вам не призначаються.'];
  const list = await waiting(env, x, 10);
  if (!list.length) return ['✅ Заявок без відповіді немає.', { inline_keyboard: [[{ text: '📋 Відкрити', url: homeOf(x) }]] }];
  return [[`<b>Заявки без відповіді (${list.length})</b>`, ...list.map(leadLine)].join('\n'), { inline_keyboard: [...list.map(leadRow), [{ text: '📋 Відкрити', url: homeOf(x) }]] }];
}
async function tasksList(env, x, now) {
  const tasks = await myTasks(env, x, now);
  if (!tasks) return ['Задачі вам не призначаються.'];
  if (!tasks.length) return ['✅ Відкритих задач немає.'];
  const k = kyiv(now);
  return [[`<b>Мої задачі (${tasks.length})</b>`, ...tasks.slice(0, 25).map(t => taskLine(t, k)), tasks.length > 25 ? `…і ще ${tasks.length - 25}` : null].filter(Boolean).join('\n'),
    { inline_keyboard: [...tasks.slice(0, 8).map(t => taskRow(t, false)), [{ text: '📋 Усі задачі', url: x.can('panel.admin') ? 'https://cas-develop.com/kabinet/admin#tasks' : TEAM_URL + '#todo' }]] }];
}
async function leadCard(env, x, arg) {
  const q = String(arg || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!q) return ['Номер заявки: /lead LD-2611-0001 (або лише цифри: /lead 1)'];
  const a = [], w = orderScope(x, a);
  let o = null;
  if (/^[A-ZА-Я]{1,4}-\d{4}-\d{1,6}$/.test(q)) o = await env.DB.prepare(`SELECT o.* FROM orders o WHERE o.number = ? AND ${w}`).bind(q, ...a).first();
  else if (/^\d{1,6}$/.test(q)) o = await env.DB.prepare(`SELECT o.* FROM orders o WHERE o.number LIKE ? AND ${w} ORDER BY o.id DESC LIMIT 1`).bind('%-' + q.padStart(4, '0'), ...a).first();
  else return ['Номер заявки — як у CRM: LD-2611-0001 (або лише цифри)'];
  if (!o) return ['Заявку не знайдено.'];
  return [cardText(o, x), cardKb(o, x)];
}
async function stats(env, x, now) {
  if (!canLeads(x)) return ['Статистика — для тих, хто веде заявки.'];
  const k = kyiv(now), from = addDays(k.date, -6), a = [], w = orderScope(x, a);
  const rows = (await env.DB.prepare(`SELECT o.* FROM orders o WHERE ${w} AND o.kind = 'lead' AND o.created_at >= ? ORDER BY o.id DESC LIMIT 5000`).bind(...a, sqlTime(kyivMidnight(from))).all()).results;
  const taken = rows.filter(o => o.taken_at && o.reaction_min != null), r = taken.map(o => o.reaction_min);
  const out = [`📊 <b>Заявки за 7 днів (${dm(from)}–${dm(k.date)})</b>${x.can('leads.view_all') ? '' : ' — ваші'}`, '',
    `Усього: <b>${rows.length}</b>`, `Взято в роботу: <b>${taken.length}</b>`,
    taken.length ? `Вчасно (≤ ${SLA_MIN} хв): <b>${r.filter(v => v <= SLA_MIN).length}</b> з ${taken.length} · середня реакція ${fmtMin(Math.round(r.reduce((s, v) => s + v, 0) / r.length))}` : null,
    `Без відповіді зараз: ${rows.filter(o => o.status === 'new' && !o.taken_at).length}`];
  if (x.can('leads.view_all')) { // зовнішнє джерело візиту (orders.ref_host, 0019) — лише власнику й менеджеру, як у CRM
    const by = new Map();
    for (const o of rows) { const l = refHostLabel(o.ref_host) || 'без джерела (прямий захід, UTM або вручну)'; by.set(l, (by.get(l) || 0) + 1); }
    if (rows.length) out.push('', '<b>Звідки прийшли</b>', ...[...by.entries()].sort((p, q) => q[1] - p[1]).slice(0, 10).map(([l, n]) => `• ${esc(l)}: ${n}`));
  }
  return [out.filter(v => v != null).join('\n'), { inline_keyboard: [[{ text: '📋 Відкрити', url: homeOf(x) }]] }];
}
async function newTask(env, request, x, arg, now) {
  if (!x.can('tasks.manage') || !x.staffId) return ['Створювати задачі можуть власник і менеджер (право «Задачі: створювати»).'];
  if (!await tasksReady(env)) return ['Задачі оновлюються — спробуйте за кілька хвилин.'];
  const p = parseTask(arg, now);
  if (!p.title) return ['Напишіть, що зробити: /task Подзвонити постачальнику завтра 11:00'];
  if (await staffLimited(env, request, x, 'tasks')) return [TOO_MANY];
  const id = await createTask(env, request, x, { title: p.title, due_date: p.due_date, due_time: p.due_time }, now);
  let remind = false;
  if (p.due_time) { const when = atKyiv(p.due_date, p.due_time); if (when > now) remind = await setRemind(env, id, when); }
  const t = { src: 't', id, title: p.title };
  const when = p.due_date ? `Строк: ${dm(p.due_date)}${p.due_time ? ' ' + p.due_time : ''}${remind ? ' (нагадаю)' : ''}` : 'Без строку — дату не розібрав. Приклад: /task Подзвонити завтра 11:00 (сьогодні, завтра, дд.мм, гг:хх)';
  return [[`📝 <b>Задачу створено</b>`, esc(p.title), when].join('\n'), { inline_keyboard: [taskRow(t, true)] }];
}

export const GROUP_HELP = 'Бот CAS Development працює в особистому чаті: відкрийте бота й натисніть Start.';
