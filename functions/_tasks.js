// Задачі CRM (CRM v4, Михайло 20.11.2026: «виставляти задачі, відмічати що вони виконані»). Таблиця — migrations/0018_tasks.sql.
// Спільне для панелі (/api/admin/tasks), кабінету працівника (/api/team/tasks, /api/team/today) і розкладу (/api/admin/lead-sla).
//
// Що таке «задача»:
//   • загальна (таблиця tasks, src 't'): назва, примітка, строк (дата і, за бажанням, час), пріоритет, виконавець, автор і, за бажанням,
//     привʼязка до заявки / обʼєкта (+ етап) / контакту;
//   • задача етапу обʼєкта (project_tasks, 0012, src 'p') — лишається у своїй таблиці й у картці обʼєкта як була; спільний список її
//     лише ПОКАЗУЄ поруч із загальними (UNION у SQL), «виконано», дату й виконавця можна змінити й звідси (ті самі правила, що в
//     /api/admin/projects і /api/team/action). Дані не переносимо — жодного ризику для наявних задач обʼєктів.
// Права (functions/_roles.js): tasks.manage (власник, менеджер) — створюють, призначають, бачать усі; tasks.own (усі ролі) — лише
//   задачі, призначені собі: бачити, «виконано» / «повернути» з коментарем. Привʼязаний обʼєкт працівник бачить лише в межах своїх прав:
//   назва обʼєкта — якщо обʼєкт видно (projectScope), заявка — якщо видно (orderScope), контакт — за contacts.linked (контакт привʼязано
//   до його обʼєкта), телефони — лише з clients.contacts. Чого не видно — у відповіді просто немає (link_hidden: true).
// Сповіщення в Telegram (бот сайту, notifyStaff): виконавцю — при призначенні; автору — коли задачу виконано; зранку (з 10:00 Київ)
//   зведення «сьогодні й прострочені» — не більше одного на день на людину (task_digest). Усе — лише 10:00–20:00 за Києвом: подія
//   поза цим часом чекає в черзі (assign_notified / done_notified = 0) до наступного проходу розкладу. Без Telegram — без сповіщення, без помилки.
// Тексти задач — звичайний текст: сервер їх не чистить від «<», інтерфейс скрізь екранує (tools/tests/xss.mjs).
import { dict } from './_lib.js';
import { escHtml, kyiv, notifyStaff } from './_alerts.js';
import { ROLES, audit, canSeeProject, noTable, orderScope, projectScope, staffById } from './_roles.js';
import { stagesArr, taskVer } from './_ver.js';

export const TASK_STATUS = dict({ open: 'Відкрита', done: 'Виконано', cancelled: 'Скасовано' });
export const TASK_PRIORITY = dict({ normal: 'Звичайна', high: 'Важлива' });
export const VIEWS = ['mine', 'all', 'overdue', 'today', 'week', 'done', 'any'];
export const BULK_MAX = 100, PAGE = 200;
const WORK = [10, 20]; // сповіщення — лише 10:00–20:00 за Києвом

export class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
const line = (v, n) => { if (v == null) return null; if (typeof v !== 'string' && typeof v !== 'number') return undefined; return String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || null; };
const multi = (v, n) => { if (v == null) return null; if (typeof v !== 'string' && typeof v !== 'number') return undefined; return String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n) || null; };
const idOf = v => (v == null || v === '' ? null : typeof v !== 'object' && Number.isInteger(+v) && +v > 0 ? +v : undefined);
export const dateOf = v => (v == null || v === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) ? String(v) : undefined);
const timeOf = v => (v == null || v === '' ? null : /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : undefined);
const like = s => '%' + String(s).slice(0, 80).replace(/[\\%_]/g, c => '\\' + c) + '%';
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dm = s => (s ? String(s).slice(8, 10) + '.' + String(s).slice(5, 7) : '');
export const workHours = now => { const h = kyiv(now).h; return h >= WORK[0] && h < WORK[1]; };
// Час запиту. {x-test-now} — підміна годинника лише для локальних тестів (ALERTS_TEST_CLOCK=1, як у /api/admin/lead-sla).
export function nowOf(env, request) {
  const t = env.ALERTS_TEST_CLOCK === '1' && request ? request.headers.get('x-test-now') : null;
  const d = t ? new Date(t) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
// D1 приймає до 100 параметрів на запит — списки id ріжемо на порції
async function byIds(ids, fn) { const out = []; for (let i = 0; i < ids.length; i += 80) out.push(...await fn(ids.slice(i, i + 80))); return out; }
const marks = a => a.map(() => '?').join(',');

// Чи є таблиця (кеш лише ствердної відповіді: після міграції все вмикається без перезапуску)
const READY = new WeakMap();
async function hasTable(env, name) {
  const m = READY.get(env) || {};
  if (m[name]) return true;
  try { await env.DB.prepare(`SELECT 1 FROM ${name} LIMIT 1`).first(); READY.set(env, { ...m, [name]: true }); return true; } // name — лише константи з цього файлу
  catch (e) { if (noTable(e)) return false; throw e; }
}
export const tasksReady = env => hasTable(env, 'tasks');

// ===== список: загальні задачі + задачі етапів однією вибіркою =====
const SEL_T = `SELECT 't' AS src, id, title, note, status, priority, due_date, due_time, assignee_staff_id, created_by, done_by, done_at, done_note,
  order_id, project_id, stage_id, contact_id, created_at, updated_at FROM tasks`;
const SEL_P = `SELECT 'p' AS src, id, title, NULL AS note, CASE WHEN done = 1 THEN 'done' ELSE 'open' END AS status, 'normal' AS priority, due_date, NULL AS due_time,
  staff_id AS assignee_staff_id, NULL AS created_by, done_by, done_at, NULL AS done_note, NULL AS order_id, project_id, stage_id, NULL AS contact_id,
  created_at, COALESCE(done_at, created_at) AS updated_at FROM project_tasks`;
const union = stage => `(${SEL_T}${stage ? ' UNION ALL ' + SEL_P : ''}) u`;

export const canSeeTasks = x => x.can('tasks.manage') || x.can('tasks.own');
// Що бачить працівник: tasks.manage — усі загальні задачі (і задачі етапів, якщо бачить усі обʼєкти); решта — лише призначені собі
function scope(x, args) {
  if (x.can('tasks.manage')) {
    if (x.can('projects.view_all')) return '1=1';
    args.push(x.staffId || 0);
    return "(u.src = 't' OR u.assignee_staff_id = ?)";
  }
  args.push(x.staffId || 0);
  return 'u.assignee_staff_id = ?';
}
// умови перемикачів «Мої / Усі / Прострочені / Сьогодні / Тиждень / Виконані»
function viewCond(view, x, k) {
  const T = k.date;
  switch (view) {
    case 'mine': return ["u.status = 'open' AND u.assignee_staff_id = ?", [x.staffId || 0]];
    case 'all': return ["u.status = 'open'", []];
    case 'overdue': return ["u.status = 'open' AND (u.due_date < ? OR (u.due_date = ? AND u.due_time IS NOT NULL AND u.due_time < ?))", [T, T, k.hm]];
    case 'today': return ["u.status = 'open' AND u.due_date = ?", [T]];
    case 'week': return ["u.status = 'open' AND u.due_date >= ? AND u.due_date <= ?", [T, addDays(T, 6)]];
    case 'done': return ["u.status != 'open'", []];
    default: return ['1=1', []];
  }
}
const isOverdue = (t, k) => t.status === 'open' && !!t.due_date && (t.due_date < k.date || (t.due_date === k.date && !!t.due_time && t.due_time < k.hm));

// f: {view, assignee: <id>|'none', link: lead|project|contact|none, order_id, project_id, contact_id, q, priority, limit, offset}
export async function listTasks(env, x, f = {}, now = new Date()) {
  const k = kyiv(now), stage = await hasTable(env, 'project_tasks');
  const base = [], cond = [scope(x, base)], args = [...base];
  for (const col of ['order_id', 'project_id', 'contact_id']) { const v = idOf(f[col]); if (v) { cond.push(`u.${col} = ?`); args.push(v); } }
  if (f.assignee === 'none') cond.push('u.assignee_staff_id IS NULL');
  else if (idOf(f.assignee)) { cond.push('u.assignee_staff_id = ?'); args.push(idOf(f.assignee)); }
  if (f.link === 'lead') cond.push('u.order_id IS NOT NULL');
  else if (f.link === 'project') cond.push('u.project_id IS NOT NULL');
  else if (f.link === 'contact') cond.push('u.contact_id IS NOT NULL');
  else if (f.link === 'none') cond.push('u.order_id IS NULL AND u.project_id IS NULL AND u.contact_id IS NULL');
  if (f.priority === 'high') cond.push("u.priority = 'high'");
  if (f.q) { cond.push("(u.title LIKE ? ESCAPE '\\' OR u.note LIKE ? ESCAPE '\\')"); args.push(like(f.q), like(f.q)); }
  const view = VIEWS.includes(f.view) ? f.view : 'all';
  const [vc, va] = viewCond(view, x, k);
  const limit = Math.min(500, Math.max(1, Number(f.limit) || PAGE)), offset = Math.max(0, Number(f.offset) || 0);
  const order = view === 'done' ? 'COALESCE(u.done_at, u.updated_at) DESC, u.id DESC'
    : "CASE WHEN u.status = 'open' THEN 0 ELSE 1 END, CASE WHEN u.due_date IS NULL THEN 1 ELSE 0 END, u.due_date, COALESCE(u.due_time, '99'), CASE u.priority WHEN 'high' THEN 0 ELSE 1 END, u.src, u.id";
  const where = cond.join(' AND ');
  const { results } = await env.DB.prepare(`SELECT u.* FROM ${union(stage)} WHERE ${where} AND ${vc} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args, ...va, limit + 1, offset).all();
  const more = results.length > limit;
  // лічильники перемикачів — з тими самими додатковими фільтрами (виконавець, привʼязка, пошук)
  const cs = [], ca = [];
  for (const v of ['mine', 'all', 'overdue', 'today', 'week']) { const [c, a] = viewCond(v, x, k); cs.push(`SUM(CASE WHEN ${c} THEN 1 ELSE 0 END) AS c_${v}`); ca.push(...a); }
  const cnt = await env.DB.prepare(`SELECT ${cs.join(', ')}, SUM(CASE WHEN u.status = 'done' THEN 1 ELSE 0 END) AS c_done, COUNT(*) AS n FROM ${union(stage)} WHERE ${where}`).bind(...ca, ...args).first();
  const counts = {}; for (const v of ['mine', 'all', 'overdue', 'today', 'week', 'done']) counts[v] = (cnt && cnt['c_' + v]) || 0;
  const total = view === 'any' ? (cnt && cnt.n) || 0 : view === 'done' ? null : counts[view];
  return { rows: await shapeTasks(env, x, results.slice(0, limit), now), more, total, counts, today: k.date, view };
}
// Лічильник на вкладці: прострочені (серед видимих) і мої відкриті
export async function taskCounters(env, x, now = new Date()) {
  const k = kyiv(now), stage = await hasTable(env, 'project_tasks'), base = [], sc = scope(x, base);
  const [oc, oa] = viewCond('overdue', x, k), [mc, ma] = viewCond('mine', x, k);
  const r = await env.DB.prepare(`SELECT SUM(CASE WHEN ${oc} THEN 1 ELSE 0 END) AS c_overdue, SUM(CASE WHEN ${mc} THEN 1 ELSE 0 END) AS c_mine FROM ${union(stage)} WHERE ${sc}`).bind(...oa, ...ma, ...base).first();
  return { overdue: (r && r.c_overdue) || 0, mine: (r && r.c_mine) || 0 };
}

// Рядки для відповіді: імена, привʼязки (лише в межах прав), прострочення, версія, що можна робити
export async function shapeTasks(env, x, rows, now = new Date()) {
  if (!rows.length) return [];
  const k = kyiv(now), manage = x.can('tasks.manage');
  const staff = new Map((await env.DB.prepare('SELECT id, name, role, active FROM staff').all()).results.map(s => [s.id, s]));
  const uniq = col => [...new Set(rows.map(r => r[col]).filter(Boolean))];
  const P = new Map(), O = new Map(), C = new Map();
  for (const p of await byIds(uniq('project_id'), async ids => { const a = [...ids]; const w = projectScope(x, a); return (await env.DB.prepare(`SELECT p.id, p.title, p.stages FROM projects p WHERE p.id IN (${marks(ids)}) AND ${w}`).bind(...a).all()).results; })) P.set(p.id, p);
  for (const o of await byIds(uniq('order_id'), async ids => { const a = [...ids]; const w = orderScope(x, a); return (await env.DB.prepare(`SELECT o.id, o.number, o.kind, o.service, o.name, o.phone FROM orders o WHERE o.id IN (${marks(ids)}) AND ${w}`).bind(...a).all()).results; })) O.set(o.id, o);
  const cts = x.can('clients.contacts');
  if (x.can('partners.base') || x.can('contacts.linked')) {
    try {
      for (const c of await byIds(uniq('contact_id'), async ids => {
        if (x.can('partners.base')) return (await env.DB.prepare(`SELECT id, name, company, type, phone, tg FROM partners WHERE id IN (${marks(ids)})`).bind(...ids).all()).results;
        const a = [...ids]; const w = projectScope(x, a); // contacts.linked: лише контакти, привʼязані до видимих працівнику обʼєктів
        return (await env.DB.prepare(`SELECT c.id, c.name, c.company, c.type, c.phone, c.tg FROM partners c WHERE c.id IN (${marks(ids)})
            AND EXISTS (SELECT 1 FROM contact_links l JOIN projects p ON p.id = l.project_id WHERE l.contact_id = c.id AND ${w})`).bind(...a).all()).results;
      })) C.set(c.id, c);
    } catch (e) { if (!noTable(e)) throw e; }
  }
  const nm = id => (id && staff.get(id) ? staff.get(id).name : null);
  const out = [];
  for (const t of rows) {
    const pr = t.project_id ? P.get(t.project_id) : null, o = t.order_id ? O.get(t.order_id) : null, c = t.contact_id ? C.get(t.contact_id) : null;
    const mine = !!x.staffId && t.assignee_staff_id === x.staffId;
    const r = {
      key: t.src + t.id, src: t.src, id: t.id, title: t.title, note: t.note, status: t.status, status_label: TASK_STATUS[t.status] || t.status, priority: t.priority,
      due_date: t.due_date, due_time: t.due_time, assignee_staff_id: t.assignee_staff_id, assignee_name: nm(t.assignee_staff_id),
      created_by: t.created_by, created_by_name: nm(t.created_by), done_by_name: nm(t.done_by), done_at: t.done_at, done_note: t.done_note,
      created_at: t.created_at, overdue: isOverdue(t, k), mine,
    };
    if (pr) { r.project_id = pr.id; r.stage_id = t.stage_id || null; r.project = { id: pr.id, title: pr.title, stage_name: t.stage_id ? (stagesArr(pr.stages).find(s => s && s.id === t.stage_id) || {}).name || null : null }; }
    if (o) { r.order_id = o.id; r.order = { id: o.id, number: o.number, kind: o.kind, service: o.service, name: o.name, ...(cts ? { phone: o.phone } : {}) }; }
    if (c) { r.contact_id = c.id; r.contact = { id: c.id, name: c.name, company: c.company, type: c.type, ...(cts ? { phone: c.phone, tg: c.tg } : {}) }; }
    if ((t.project_id && !pr) || (t.order_id && !o) || (t.contact_id && !c)) r.link_hidden = true; // привʼязка є, але цьому працівнику її не видно
    if (t.src === 't') {
      r.ver = await taskVer(t);
      r.can = { edit: manage, done: manage || mine };
    } else r.can = { edit: manage && x.can('projects.edit'), done: x.can('projects.edit') || (x.can('projects.edit_stage') && (mine || !t.assignee_staff_id)) };
    out.push(r);
  }
  return out;
}
export const oneTask = async (env, x, id, now) => { const t = await env.DB.prepare(`${SEL_T} WHERE id = ?`).bind(id).first(); return t ? (await shapeTasks(env, x, [t], now))[0] : null; };

// ===== поля задачі з запиту =====
// cur — поточний запис (PATCH): незмінені поля беремо з нього. Кидає Bad з текстом для користувача.
async function fields(env, x, d, cur) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Bad('Очікуємо JSON-обʼєкт');
  const p = {};
  const pick = (key, f, n) => {
    if (!has(d, key)) { p[key] = cur ? cur[key] ?? null : null; return; }
    const v = f(d[key], n);
    if (v === undefined) throw new Bad(`Поле ${key}: некоректне значення`, 422);
    p[key] = v;
  };
  pick('title', line, 200); pick('note', multi, 2000);
  if (!p.title) throw new Bad('Вкажіть, що треба зробити', 422);
  p.priority = has(d, 'priority') ? String(d.priority || 'normal') : cur ? cur.priority : 'normal';
  if (!TASK_PRIORITY[p.priority]) throw new Bad('priority: normal | high', 422);
  pick('due_date', dateOf); pick('due_time', timeOf);
  if (!p.due_date) p.due_time = null;
  for (const key of ['assignee_staff_id', 'order_id', 'project_id', 'contact_id']) pick(key, idOf);
  if (!cur && !has(d, 'assignee_staff_id')) p.assignee_staff_id = x.staffId || null; // швидке додавання: без виконавця — задача собі
  p.stage_id = has(d, 'stage_id') ? (d.stage_id ? String(d.stage_id).slice(0, 12) : null) : cur ? cur.stage_id ?? null : null;
  const changed = key => p[key] && p[key] !== (cur ? cur[key] : null);
  if (changed('assignee_staff_id')) { const s = await staffById(env, p.assignee_staff_id); if (!s || !s.active) throw new Bad('Працівника не знайдено або вимкнено', 422); }
  if (changed('order_id') && !await env.DB.prepare('SELECT 1 FROM orders WHERE id = ?').bind(p.order_id).first()) throw new Bad('Заявку не знайдено', 422);
  if (changed('contact_id') && !await env.DB.prepare('SELECT 1 FROM partners WHERE id = ?').bind(p.contact_id).first()) throw new Bad('Контакт не знайдено', 422);
  if (p.project_id) {
    const pr = await env.DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(p.project_id).first();
    if (!pr) throw new Bad('Обʼєкт не знайдено', 422);
    if (p.stage_id && !stagesArr(pr.stages).some(s => s && s.id === p.stage_id)) p.stage_id = null; // етап не з цього обʼєкта
  } else p.stage_id = null;
  return p;
}
const AUD = ['title', 'note', 'status', 'priority', 'due_date', 'due_time', 'assignee_staff_id', 'order_id', 'project_id', 'stage_id', 'contact_id'];
const changes = (a, b) => { const before = {}, after = {}; for (const key of AUD) if (String(a[key] ?? '') !== String(b[key] ?? '')) { before[key] = a[key] ?? null; after[key] = b[key] ?? null; } return Object.keys(after).length ? { before, after } : null; };

export async function createTask(env, request, x, d, now = new Date()) {
  const p = await fields(env, x, d, null);
  const notify = p.assignee_staff_id && p.assignee_staff_id !== x.staffId ? 0 : 1;
  const r = await env.DB.prepare(`INSERT INTO tasks (title, note, priority, due_date, due_time, assignee_staff_id, created_by, order_id, project_id, stage_id, contact_id, assign_notified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.title, p.note, p.priority, p.due_date, p.due_time, p.assignee_staff_id, x.staffId, p.order_id, p.project_id, p.stage_id, p.contact_id, notify).run();
  const id = r.meta.last_row_id;
  await audit(env, request, x, 'gtask.create', 'tasks', id, null, p);
  if (!notify) await notifyAssigned(env, [id], now);
  return id;
}

// «Виконано» / «Повернути в роботу» одним дотиком. Запис — «порівняй і заміни»: подвійний дотик чи два працівники в ту саму мить
// не дадуть двох сповіщень і не перезапишуть коментар. Повертає {changed}.
export async function setDone(env, request, x, cur, done, note, now = new Date()) {
  if (done) {
    const u = await env.DB.prepare(`UPDATE tasks SET status = 'done', done_by = ?, done_at = datetime('now'), done_note = ?, done_notified = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'open'`).bind(x.staffId, note, cur.created_by && cur.created_by !== x.staffId ? 0 : 1, cur.id).run();
    if (!u.meta.changes) return { changed: false };
    await audit(env, request, x, 'gtask.done', 'tasks', cur.id, { status: cur.status }, { status: 'done', title: cur.title, ...(note ? { done_note: note } : {}) });
    if (cur.created_by && cur.created_by !== x.staffId) await notifyDone(env, [cur.id], now);
    return { changed: true };
  }
  const u = await env.DB.prepare(`UPDATE tasks SET status = 'open', done_by = NULL, done_at = NULL, done_note = NULL, done_notified = 1, updated_at = datetime('now')
      WHERE id = ? AND status != 'open'`).bind(cur.id).run();
  if (!u.meta.changes) return { changed: false };
  await audit(env, request, x, 'gtask.reopen', 'tasks', cur.id, { status: cur.status }, { status: 'open', title: cur.title });
  return { changed: true };
}

// Правка задачі (tasks.manage). d.status: open | done | cancelled — «виконано» через правку теж ставить, хто й коли.
export async function updateTask(env, request, x, cur, d, now = new Date()) {
  const p = await fields(env, x, d, cur);
  let status = cur.status;
  if (has(d, 'status')) { status = String(d.status); if (!TASK_STATUS[status]) throw new Bad('status: open | done | cancelled', 422); }
  const next = { ...p, status };
  const ch = changes(cur, next);
  if (!ch) return { changed: false };
  const toDone = status === 'done' && cur.status !== 'done', reopened = status === 'open' && cur.status !== 'open';
  const reassigned = status === 'open' && p.assignee_staff_id && p.assignee_staff_id !== cur.assignee_staff_id && p.assignee_staff_id !== x.staffId;
  await env.DB.prepare(`UPDATE tasks SET title = ?, note = ?, priority = ?, due_date = ?, due_time = ?, assignee_staff_id = ?, order_id = ?, project_id = ?, stage_id = ?, contact_id = ?,
      status = ?, done_by = ?, done_at = ?, done_note = ?, assign_notified = ?, done_notified = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(p.title, p.note, p.priority, p.due_date, p.due_time, p.assignee_staff_id, p.order_id, p.project_id, p.stage_id, p.contact_id, status,
      toDone ? x.staffId : status === 'done' ? cur.done_by : null, toDone ? now.toISOString().slice(0, 19).replace('T', ' ') : status === 'done' ? cur.done_at : null,
      status === 'done' ? cur.done_note : null, reassigned ? 0 : reopened ? 1 : cur.assign_notified ?? 1,
      toDone && cur.created_by && cur.created_by !== x.staffId ? 0 : 1, cur.id).run();
  await audit(env, request, x, toDone ? 'gtask.done' : reopened ? 'gtask.reopen' : 'gtask.update', 'tasks', cur.id, ch.before, ch.after);
  if (reassigned) await notifyAssigned(env, [cur.id], now);
  if (toDone && cur.created_by && cur.created_by !== x.staffId) await notifyDone(env, [cur.id], now);
  return { changed: true };
}

// ===== задачі етапів обʼєкта (project_tasks) зі спільного списку — ті самі правила, що в /api/admin/projects і /api/team/action =====
async function stageTask(env, x, id) {
  let tk;
  try { tk = await env.DB.prepare('SELECT * FROM project_tasks WHERE id = ?').bind(id).first(); } catch (e) { if (noTable(e)) return null; throw e; }
  return tk && await canSeeProject(env, x, tk.project_id) ? tk : null;
}
export async function stageTaskDone(env, request, x, id, done) {
  const tk = await stageTask(env, x, id);
  if (!tk) throw new Bad('Задачу не знайдено', 404);
  if (!x.can('projects.edit') && (!x.can('projects.edit_stage') || (tk.staff_id && tk.staff_id !== x.staffId))) throw new Bad('Це задача іншого працівника', 403);
  const v = done ? 1 : 0;
  const u = await env.DB.prepare(`UPDATE project_tasks SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now') END, done_by = CASE WHEN ? = 1 THEN ? END WHERE id = ? AND done != ?`)
    .bind(v, v, v, x.staffId, tk.id, v).run();
  if (!u.meta.changes) return { changed: false };
  await env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(tk.project_id).run();
  await audit(env, request, x, done ? 'task.done' : 'task.reopen', 'projects', tk.project_id, { task_id: tk.id, done: tk.done }, { task_id: tk.id, title: tk.title, done: v });
  return { changed: true };
}
// дата й виконавець задачі етапу (масові дії, правка на місці) — право projects.edit; новий виконавець потрапляє в команду обʼєкта
export async function stageTaskEdit(env, request, x, id, d) {
  if (!x.can('projects.edit')) throw new Bad('Немає права змінювати задачі обʼєктів', 403);
  const tk = await stageTask(env, x, id);
  if (!tk) throw new Bad('Задачу не знайдено', 404);
  let due = tk.due_date, sid = tk.staff_id, title = tk.title;
  if (has(d, 'due_date')) { due = dateOf(d.due_date); if (due === undefined) throw new Bad('Поле due_date: некоректне значення', 422); }
  if (has(d, 'title')) { title = line(d.title, 160); if (!title) throw new Bad('Вкажіть, що треба зробити', 422); }
  if (has(d, 'assignee_staff_id')) {
    sid = idOf(d.assignee_staff_id); if (sid === undefined) throw new Bad('Поле assignee_staff_id: некоректне значення', 422);
    if (sid && sid !== tk.staff_id) { const s = await staffById(env, sid); if (!s || !s.active) throw new Bad('Працівника не знайдено або вимкнено', 422); }
  }
  if (due === tk.due_date && sid === tk.staff_id && title === tk.title) return { changed: false };
  await env.DB.prepare('UPDATE project_tasks SET title = ?, due_date = ?, staff_id = ? WHERE id = ?').bind(title, due, sid, tk.id).run();
  const pr = await env.DB.prepare('SELECT title, assignee_staff_id FROM projects WHERE id = ?').bind(tk.project_id).first();
  if (sid && sid !== tk.staff_id && pr && pr.assignee_staff_id !== sid)
    await env.DB.prepare("INSERT OR IGNORE INTO project_staff (project_id, staff_id, task) VALUES (?, ?, 'Задачі обʼєкта')").bind(tk.project_id, sid).run();
  await env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(tk.project_id).run();
  await audit(env, request, x, 'task.update', 'projects', tk.project_id, { task_id: tk.id, title: tk.title, staff_id: tk.staff_id, due_date: tk.due_date }, { task_id: tk.id, title, staff_id: sid, due_date: due });
  if (sid && sid !== tk.staff_id && sid !== x.staffId)
    await notifyStaff(env, sid, `📝 Вам призначено задачу на обʼєкті <b>${escHtml(pr ? pr.title : '')}</b>\n${escHtml(title)}${due ? `\nТермін: ${due}` : ''}`, { inline_keyboard: [[{ text: '📋 Мої задачі', url: 'https://cas-develop.com/kabinet/team' }]] });
  return { changed: true };
}

// ===== сповіщення =====
const homeUrl = s => 'https://cas-develop.com' + (s && ROLES[s.role] && ROLES[s.role].home === '/kabinet/admin' ? '/kabinet/admin#tasks' : '/kabinet/team#todo');
const kb = s => ({ inline_keyboard: [[{ text: '📋 Мої задачі', url: homeUrl(s) }]] });
const dueText = t => (t.due_date ? dm(t.due_date) + (t.due_time ? ' ' + t.due_time : '') : '');
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const bullet = (t, extra = '') => `• ${t.priority === 'high' ? '❗ ' : ''}${escHtml(cut(t.title, 160))}${extra}`;
// «забираємо» сповіщення атомарно: два проходи розкладу поспіль чи подвійний запит не надішлють його двічі
async function claim(env, col, ids) {
  const mine = [];
  for (const id of ids) if ((await env.DB.prepare(`UPDATE tasks SET ${col} = 1 WHERE id = ? AND ${col} = 0`).bind(id).run()).meta.changes) mine.push(id); // col — лише дві константи нижче
  return mine.length ? byIds(mine, async part => (await env.DB.prepare(`SELECT * FROM tasks WHERE id IN (${marks(part)})`).bind(...part).all()).results) : [];
}
const group = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };

// Виконавцю: «вам призначено задачу» (кілька за раз — одним повідомленням). Поза робочими годинами — лишається в черзі.
export async function notifyAssigned(env, ids, now = new Date()) {
  if (!workHours(now)) return 0;
  let sent = 0;
  try {
    const rows = (await claim(env, 'assign_notified', ids)).filter(t => t.status === 'open' && t.assignee_staff_id);
    for (const [sid, list] of group(rows, 'assignee_staff_id')) {
      const s = await staffById(env, sid), by = list[0].created_by ? await staffById(env, list[0].created_by) : null;
      const text = list.length === 1
        ? [`📝 <b>Вам призначено задачу</b>`, `${list[0].priority === 'high' ? '❗ ' : ''}${escHtml(cut(list[0].title, 300))}`, dueText(list[0]) ? `Строк: ${dueText(list[0])}` : null,
          list[0].note ? `💬 ${escHtml(cut(list[0].note, 400))}` : null, by && by.id !== sid ? `Поставив(ла): ${escHtml(by.name)}` : null].filter(Boolean).join('\n')
        : [`📝 <b>Вам призначено задач: ${list.length}</b>`, ...list.slice(0, 15).map(t => bullet(t, dueText(t) ? ` — до ${dueText(t)}` : '')), list.length > 15 ? `…і ще ${list.length - 15}` : null].filter(Boolean).join('\n');
      sent += await notifyStaff(env, sid, text, kb(s));
    }
  } catch (e) { if (!noTable(e)) console.log('notifyAssigned', e && e.message); }
  return sent;
}
// Автору: «задачу виконано» (якщо виконав не він сам)
export async function notifyDone(env, ids, now = new Date()) {
  if (!workHours(now)) return 0;
  let sent = 0;
  try {
    const rows = (await claim(env, 'done_notified', ids)).filter(t => t.status === 'done' && t.created_by && t.created_by !== t.done_by);
    for (const [sid, list] of group(rows, 'created_by')) {
      const s = await staffById(env, sid);
      const who = async t => { const d = t.done_by ? await staffById(env, t.done_by) : null; return d ? d.name : '—'; };
      const text = list.length === 1
        ? [`✅ <b>Задачу виконано</b>`, escHtml(cut(list[0].title, 300)), `Виконав(ла): ${escHtml(await who(list[0]))}`, list[0].done_note ? `💬 ${escHtml(cut(list[0].done_note, 400))}` : null].filter(Boolean).join('\n')
        : [`✅ <b>Виконано задач: ${list.length}</b>`, ...await Promise.all(list.slice(0, 15).map(async t => bullet(t, ` — ${escHtml(await who(t))}`))), list.length > 15 ? `…і ще ${list.length - 15}` : null].filter(Boolean).join('\n');
      sent += await notifyStaff(env, sid, text, kb(s));
    }
  } catch (e) { if (!noTable(e)) console.log('notifyDone', e && e.message); }
  return sent;
}

// Прохід розкладу (/api/admin/lead-sla, кожні 5 хв), лише 10:00–20:00 за Києвом:
//   1) сповіщення з черги (призначено / виконано поза робочими годинами);
//   2) зведення «сьогодні й прострочені» кожному активному працівнику, в якого вони є, — раз на день (перший прохід після 10:00).
//      У суботу й неділю зведення йде лише тим, у кого є задача зі строком саме сьогодні (прострочені чекають понеділка).
export async function runTaskNotices(env, now = new Date()) {
  if (!workHours(now)) return { quiet: true };
  const out = { assigned: 0, done: 0, digests: 0 };
  try {
    if (!await hasTable(env, 'tasks')) return { pending: true };
    const ids = async col => (await env.DB.prepare(`SELECT id FROM tasks WHERE ${col} = 0 ORDER BY id LIMIT 100`).all()).results.map(r => r.id);
    out.assigned = await notifyAssigned(env, await ids('assign_notified'), now);
    out.done = await notifyDone(env, await ids('done_notified'), now);
    const k = kyiv(now), stage = await hasTable(env, 'project_tasks'), weekend = [0, 6].includes(new Date(k.date + 'T12:00:00Z').getUTCDay());
    const { results } = await env.DB.prepare(`SELECT u.src, u.id, u.title, u.priority, u.due_date, u.due_time, u.assignee_staff_id FROM ${union(stage)} JOIN staff s ON s.id = u.assignee_staff_id AND s.active = 1
        WHERE u.status = 'open' AND u.due_date IS NOT NULL AND u.due_date <= ? ORDER BY u.due_date, COALESCE(u.due_time, '99'), u.id LIMIT 2000`).bind(k.date).all();
    for (const [sid, list] of group(results, 'assignee_staff_id')) {
      const todayL = list.filter(t => t.due_date === k.date), late = list.filter(t => t.due_date < k.date);
      if (weekend && !todayL.length) continue;
      const u = await env.DB.prepare(`INSERT INTO task_digest (staff_id, day) VALUES (?1, ?2) ON CONFLICT(staff_id) DO UPDATE SET day = ?2 WHERE task_digest.day != ?2`).bind(sid, k.date).run();
      if (!u.meta.changes) continue; // сьогодні вже було
      const s = await staffById(env, sid);
      const part = (title, arr, f) => (arr.length ? ['', `<b>${title} (${arr.length})</b>`, ...arr.slice(0, 12).map(f), arr.length > 12 ? `…і ще ${arr.length - 12}` : null] : []);
      const text = [`🗓 <b>Задачі на сьогодні, ${dm(k.date)}</b>`,
        ...part('Сьогодні', todayL, t => bullet(t, t.due_time ? ` — ${t.due_time}` : '')),
        ...part('Прострочені', late, t => bullet(t, ` — з ${dm(t.due_date)}`))].filter(v => v != null).join('\n');
      out.digests += await notifyStaff(env, sid, text, kb(s));
    }
  } catch (e) { if (!noTable(e)) throw e; out.pending = true; }
  return out;
}
