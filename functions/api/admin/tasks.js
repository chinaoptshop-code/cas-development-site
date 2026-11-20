// Задачі CRM (CRM v4, 20.11.2026) — вкладка «Задачі» в /kabinet/admin, блоки «Задачі» в картках заявки / обʼєкта / контакту і «Мої задачі»
// в кабінеті працівника (/api/team/tasks — ті самі обробники). Логіка, права й сповіщення — functions/_tasks.js; таблиця — migrations/0018.
// Права: tasks.manage (власник, менеджер) — усе; tasks.own (усі ролі) — лише задачі, призначені собі: список, «виконано» / «повернути».
// GET   ?view=mine|all|overdue|today|week|done|any&assignee=<id>|none&link=lead|project|contact|none&order_id=&project_id=&contact_id=
//       &q=&priority=high&limit=<1…500, типово 200>&offset=   → {rows, more, total, counts: {mine, all, overdue, today, week, done}, today, staff?, can}
//       rows — і загальні задачі (src 't', id — число), і задачі етапів обʼєктів (src 'p'; у запитах — id 'p<число>'); кожен рядок має key.
// GET   ?count=1 → {overdue, mine} — лічильник на вкладці
// POST  {title, note?, priority?, due_date?, due_time?, assignee_staff_id?, order_id?, project_id?, stage_id?, contact_id?} — створити (tasks.manage);
//       без assignee_staff_id — задача собі
// PATCH {id, done: true|false, note?} — «виконано» / «повернути в роботу» (свою — будь-хто; чужу — tasks.manage); note — коментар виконавця
// PATCH {id, ver?, …поля, status?: open|done|cancelled} — правка (tasks.manage); ver — версія з GET (functions/_ver.js): задачу відтоді
//       змінили → 409 {conflict: true, task, last} без змін. Для задач етапів ('p<id>') — лише title, due_date, assignee_staff_id (projects.edit).
// PATCH {bulk: {ids: [до 100], done: true | due_date: 'РРРР-ММ-ДД'|null | assignee_staff_id: <id>|null}} — масова дія (tasks.manage) → {changed, skipped}
// DELETE ?id=<id> — видалити загальну задачу назавжди (tasks.manage; звичайний шлях — status 'cancelled')
// Записи — до 600 на годину на працівника, масові — до 60 (functions/_rate.js), далі 429.
import { bad, json, readJSON } from '../../_lib.js';
import { PERMS as RIGHTS, ROLES, audit, need, noTable } from '../../_roles.js';
import { TOO_MANY, staffLimited } from '../../_rate.js';
import { conflict, lastChange, taskVer } from '../../_ver.js';
import { BULK_MAX, Bad, TASK_PRIORITY, TASK_STATUS, createTask, listTasks, nowOf, oneTask, setDone, stageTaskDone, stageTaskEdit, taskCounters, tasksReady, updateTask } from '../../_tasks.js';

const PERMS = ['tasks.manage', 'tasks.own'];
const migrating = () => bad('Розділ «Задачі» оновлюється (міграція 0018) — спробуйте за кілька хвилин', 503);
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
// id із запиту: число — загальна задача, 'p<число>' — задача етапу обʼєкта
const ref = v => { const m = /^(p?)(\d{1,12})$/.exec(String(v ?? '')); return m && +m[2] > 0 ? { stage: m[1] === 'p', id: +m[2] } : null; };
const guard = async fn => { try { return await fn(); } catch (e) { if (e instanceof Bad) return bad(e.message, e.status); if (noTable(e)) return migrating(); throw e; } };

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, PERMS);
  if (error) return error;
  const sp = new URL(request.url).searchParams, p = k => (sp.get(k) || '').trim(), now = nowOf(env, request);
  return guard(async () => {
    if (!await tasksReady(env)) return migrating();
    if (p('count')) return json(await taskCounters(env, x, now));
    const manage = x.can('tasks.manage');
    const d = await listTasks(env, x, { view: p('view') || (manage ? 'all' : 'mine'), assignee: p('assignee'), link: p('link'), order_id: p('order_id'), project_id: p('project_id'),
      contact_id: p('contact_id'), q: p('q'), priority: p('priority'), limit: p('limit'), offset: p('offset') }, now);
    let staff;
    if (manage) staff = (await env.DB.prepare('SELECT id, name, role FROM staff WHERE active = 1 ORDER BY name').all()).results.map(s => ({ id: s.id, name: s.name, role_label: ROLES[s.role] ? ROLES[s.role].label : s.role }));
    return json({ ...d, ...(staff ? { staff } : {}), me: x.staffId, statuses: TASK_STATUS, priorities: TASK_PRIORITY, can: { manage } });
  });
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'tasks.manage');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  if (await staffLimited(env, request, x, 'tasks')) return bad(TOO_MANY, 429);
  const now = nowOf(env, request);
  return guard(async () => { const id = await createTask(env, request, x, d, now); return json({ ok: true, id, task: await oneTask(env, x, id, now) }); });
}

async function bulk(env, request, x, b, now) {
  if (!x.can('tasks.manage')) return bad('Немає права: масові дії із задачами', 403);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String))].map(ref) : [];
  if (!ids.length || ids.length > BULK_MAX || ids.some(r => !r)) return bad(`ids: від 1 до ${BULK_MAX} задач`);
  const act = ['done', 'due_date', 'assignee_staff_id'].filter(k => has(b, k));
  if (act.length !== 1) return bad('Одна дія: done | due_date | assignee_staff_id');
  if (await staffLimited(env, request, x, 'bulk')) return bad(TOO_MANY, 429);
  let changed = 0, skipped = 0;
  for (const r of ids) {
    try {
      let res;
      if (r.stage) res = act[0] === 'done' ? await stageTaskDone(env, request, x, r.id, !!b.done) : await stageTaskEdit(env, request, x, r.id, { [act[0]]: b[act[0]] });
      else {
        const cur = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(r.id).first();
        if (!cur) { skipped++; continue; }
        res = act[0] === 'done' ? await setDone(env, request, x, cur, !!b.done, null, now) : cur.status !== 'open' ? { changed: false } : await updateTask(env, request, x, cur, { [act[0]]: b[act[0]] }, now);
      }
      if (res.changed) changed++; else skipped++;
    } catch (e) { if (e instanceof Bad) { if (e.status === 422) throw e; skipped++; } else throw e; } // некоректне значення дії (дата, працівник) — помилка всього запиту
  }
  await audit(env, request, x, 'gtask.bulk', 'tasks', null, null, { action: act[0], value: b[act[0]], ids: ids.length, changed, skipped });
  return json({ ok: true, changed, skipped });
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, PERMS);
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return bad('Некоректні дані');
  const now = nowOf(env, request);
  return guard(async () => {
    if (d.bulk && typeof d.bulk === 'object') return bulk(env, request, x, d.bulk, now);
    const r = ref(d.id);
    if (!r) return bad('Потрібен id задачі');
    if (await staffLimited(env, request, x, 'tasks')) return bad(TOO_MANY, 429);
    const toggle = has(d, 'done') && Object.keys(d).every(k => ['id', 'done', 'note', 'ver'].includes(k));
    if (r.stage) { // задача етапу обʼєкта
      const res = toggle ? await stageTaskDone(env, request, x, r.id, !!d.done) : await stageTaskEdit(env, request, x, r.id, d);
      return json({ ok: true, ...res });
    }
    const cur = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(r.id).first();
    const manage = x.can('tasks.manage');
    // чужу задачу працівник без tasks.manage не бачить узагалі — 404, як і неіснуючу
    if (!cur || (!manage && cur.assignee_staff_id !== x.staffId)) return bad('Задачу не знайдено', 404);
    if (toggle) {
      let note = null;
      if (d.done && d.note != null && d.note !== '') { if (typeof d.note !== 'string') return bad('note: очікуємо текст', 422); note = d.note.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 1000) || null; }
      const res = await setDone(env, request, x, cur, !!d.done, note, now);
      return json({ ok: true, ...res, task: await oneTask(env, x, cur.id, now) });
    }
    if (!manage) return bad('Немає права: ' + RIGHTS['tasks.manage'], 403);
    if (d.ver != null && d.ver !== '' && String(d.ver) !== await taskVer(cur))
      return conflict('Задачу змінили, поки ви редагували', { task: await oneTask(env, x, cur.id, now), last: await lastChange(env, 'tasks', cur.id) });
    const res = await updateTask(env, request, x, cur, d, now);
    return json({ ok: true, ...res, task: await oneTask(env, x, cur.id, now) });
  });
}

export async function onRequestDelete({ request, env }) {
  const { x, error } = await need(request, env, 'tasks.manage');
  if (error) return error;
  const r = ref(new URL(request.url).searchParams.get('id'));
  if (!r || r.stage) return bad('Потрібен id загальної задачі (задачі етапів видаляються в картці обʼєкта)');
  if (await staffLimited(env, request, x, 'tasks')) return bad(TOO_MANY, 429);
  return guard(async () => {
    const cur = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(r.id).first();
    if (!cur) return bad('Задачу не знайдено', 404);
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(cur.id).run();
    await audit(env, request, x, 'gtask.delete', 'tasks', cur.id, { title: cur.title, status: cur.status, assignee_staff_id: cur.assignee_staff_id, due_date: cur.due_date }, null);
    return json({ ok: true });
  });
}
