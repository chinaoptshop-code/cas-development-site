// Оптимістична конкуренція CRM (19.11.2026): картку (проєкт, заявку, контакт) можуть одночасно змінювати двоє — менеджер у формі,
// клієнт у кабінеті («Погодити етап», «Є правки»), другий менеджер, бот. Щоб збереження старої форми мовчки не стерло чужу зміну:
//   • сервер віддає разом із записом версію `ver` — короткий хеш полів, які форма може перезаписати (без міграції: рахується з рядка);
//   • форма повертає `ver`, з яким її відкрили; якщо запис відтоді змінився — 409 {conflict: true, ver, last} без жодних змін,
//     інтерфейс показує «… змінився, поки ви редагували» й пропонує оновити дані та повторити свої зміни;
//   • запис етапів — лише «порівняй і заміни» (UPDATE … WHERE stages = <те, що прочитали>): навіть у ту саму мить одна зміна
//     не лягає поверх іншої (updateStages — для точкових дій: клієнт, кабінет працівника, нагадування).
// Версія — не секрет і не підпис: це лише позначка «з якого стану редагували».
import { hexOf, json, sha256 } from './_lib.js';

export const verOf = async parts => hexOf(await sha256(JSON.stringify(parts))).slice(0, 16);

// Етап у версії проєкту: те, що редагує форма, і стан погодження / правок (його зміну менеджер має побачити до збереження).
// Службовий відлік нагадувань (review_at, remind_at, remind_n) і журнал (hist) у версію не входять: їх веде сервер, форма їх не
// перезаписує — автоматичне нагадування клієнту не робить відкриту форму «застарілою».
const STAGE_KEYS = ['id', 'name', 'status', 'progress', 'start', 'end', 'note', 'staff_id', 'rev_max', 'approved_at', 'approved_by', 'revisions', 'rev_note', 'rev_at'];
const PROJECT_KEYS = ['title', 'service', 'address', 'area', 'status', 'next_step', 'next_date', 'manager', 'camera_url', 'camera_note',
  'contract_amount', 'contract_currency', 'deadline', 'assignee_staff_id'];
export const stagesArr = j => { try { const a = typeof j === 'string' ? JSON.parse(j || '[]') : j; return Array.isArray(a) ? a : []; } catch { return []; } };
const norm = v => (v == null || v === '' ? null : v);
// team — [{staff_id, task}] з project_staff (форма зберігає і команду)
export function projectVer(p, team = []) {
  return verOf([
    PROJECT_KEYS.map(k => norm(p[k])),
    stagesArr(p.stages).map(s => STAGE_KEYS.map(k => norm(s && s[k]))),
    team.map(t => [t.staff_id, norm(t.task)]).sort((a, b) => a[0] - b[0]),
  ]);
}
export async function projectVerById(env, id) {
  const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!p) return null;
  let team = [];
  try { team = (await env.DB.prepare('SELECT staff_id, task FROM project_staff WHERE project_id = ?').bind(id).all()).results; }
  catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  return projectVer(p, team);
}

// Заявка / замовлення CRM: поля картки + пропозиція
const LEAD_KEYS = ['status', 'assignee', 'assignee_staff_id', 'crm_note', 'manager_note', 'amount', 'currency', 'next_contact', 'city', 'offer', 'project_id'];
export const leadVer = o => verOf(LEAD_KEYS.map(k => norm(o[k])));
// Контакт довідника
const CONTACT_KEYS = ['name', 'company', 'type', 'city', 'tg', 'phone', 'email', 'site', 'tags', 'notes', 'status', 'rating'];
export const contactVer = r => verOf(CONTACT_KEYS.map(k => norm(r[k])));
// Задача (migrations/0018): усе, що редагує форма; «виконано» — окрема дія одним дотиком, але й вона змінює версію
const TASK_KEYS = ['title', 'note', 'status', 'priority', 'due_date', 'due_time', 'assignee_staff_id', 'order_id', 'project_id', 'stage_id', 'contact_id'];
export const taskVer = t => verOf(TASK_KEYS.map(k => norm(t[k])));

// Хто й коли востаннє змінив запис — для повідомлення про конфлікт (з audit_log; без імені клієнта — лише «клієнт»)
const WHAT = {
  'project.approve': 'клієнт погодив етап', 'project.revise': 'клієнт попросив правки', 'project.update': 'збережено картку проєкту',
  'project.stage': 'змінено статус етапу', 'project.assign': 'змінено команду', 'client.remind': 'нагадування клієнту',
  'lead.update': 'змінено заявку', 'lead.offer_sent': 'надіслано КП', 'order.update': 'змінено замовлення', 'crm.bulk': 'масова дія',
  'pbase.update': 'змінено контакт', 'pbase.bulk': 'масова дія з контактами', 'pbase.archive': 'контакт в архіві', 'pbase.restore': 'контакт повернуто з архіву',
  'gtask.update': 'змінено задачу', 'gtask.done': 'задачу виконано', 'gtask.reopen': 'задачу повернуто в роботу', 'gtask.bulk': 'масова дія із задачами',
};
export async function lastChange(env, entity, id) {
  try {
    const a = await env.DB.prepare('SELECT actor, role, action, at FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 1').bind(entity, String(id)).first();
    if (!a) return null;
    return { by: a.role === 'client' ? 'Клієнт' : (a.actor || null), what: WHAT[a.action] || null, at: a.at };
  } catch { return null; }
}
export const conflict = (msg, extra = {}) => json({ error: msg, conflict: true, ...extra }, 409);

// Точкова зміна етапів (клієнт погодив / попросив правки, працівник змінив статус, нагадування): читаємо → fn(stages, project) →
// записуємо, лише якщо етапи за цей час ніхто не змінив; інакше читаємо знову й застосовуємо зміну до свіжих даних (до 4 спроб).
// fn повертає {stages, …} — зберегти, або {error, …} / {skip: true, …} — нічого не писати. where — додаткова умова (напр. client_id).
export async function updateStages(env, id, fn, { where = '', args = [], touch = true } = {}) {
  for (let n = 0; n < 4; n++) {
    const p = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?${where}`).bind(id, ...args).first();
    if (!p) return { missing: true };
    const r = await fn(stagesArr(p.stages), p);
    if (!r || r.error || r.skip || !r.stages) return { ...r, project: p };
    const w = await env.DB.prepare(`UPDATE projects SET stages = ?${touch ? ", updated_at = datetime('now')" : ''} WHERE id = ? AND stages IS ?`)
      .bind(JSON.stringify(r.stages), id, p.stages).run();
    if (w.meta.changes) return { ...r, project: p, saved: true };
  }
  return { error: 'Не вдалося зберегти — спробуйте ще раз', status: 409 };
}
