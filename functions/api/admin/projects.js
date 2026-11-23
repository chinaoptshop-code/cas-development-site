// Проєкти (обʼєкти) клієнтів: вкладка «Проєкти» в /kabinet/admin і кабінет працівника. Права — functions/_roles.js:
//   GET — projects.view_all (усі) або projects.view_assigned (assignee_staff_id = я або я в project_staff);
//       платежі й сума договору — лише finance.view; телефон/адреса/камера — лише clients.contacts;
//   project / document — projects.edit; payment — finance.edit; report — reports.upload (лише видимий обʼєкт);
//   partner — partners.manage; issue (PATCH, закрити проблему) — projects.edit; task — projects.edit або projects.edit_stage
//   (працівник без projects.edit — лише свої задачі: створити на себе й відмітити виконаною). Кожна зміна — в audit_log.
//   Платежі, документи, задачі й DELETE — лише видимого обʼєкта (canSeeProject), інакше 404.
//   Призначення: assignee_staff_id (відповідальний) і staff: [{id, task}] (кілька виконавців, project_staff); працівнику — Telegram.
// GET    /api/admin/projects[?client_id=N&service=design&status=active]
//          → {projects, reports, documents, payments, tasks, online, templates, schemes, …}; tasks — [] до міграції 0012
// POST   /api/admin/projects {type, ...}            — створити:
//          type 'project':  {client_id | new_client: {name, phone?}, title, service?, address?, area?, status?, stages?, next_step?, next_date?, manager?, camera_url?, camera_note?,
//                            deadline?, scheme?: '50/50'|'50/30/20'|'50/40/10'}
//                           stages: [{id?, name, status?, progress, start?, end?, note?, approved_at?, revisions?}] — id етапу сервер ставить сам;
//                           без stages — шаблон етапів за типом (TEMPLATES); scheme — графік платежів з привʼязкою до етапів (finance.edit)
//          type 'from_lead': {order_id, title?} — заявка → проєкт (projects.edit + видима заявка): клієнт (leadClient), тип і площа з пропозиції
//                           (orders.offer, migrations/0014), адреса — місто заявки, відповідальний — з заявки; заявка → «Проєкт: етапи», orders.project_id;
//                           повторно → 409 {id}
//          type 'task':     {project_id, title, stage_id?, staff_id?, due_date?, sort?}   (міграція 0012)
//          type 'report':   {project_id, date, title?, note?, photos: ["https://…"], stage_id?}
//          type 'document': {client_id, project_id?, order_id?, kind, title, url, stage_id?}   — акт етапу: kind 'act' + stage_id
//          type 'payment':  {project_id, title, stage_id?, pct?, amount?, currency?, due_date?, paid_date?, status?, note?, sort?}
//          type 'partner':  {client_id, code}  — привʼязати особистий код партнера до клієнта (code: null — відвʼязати)
// PATCH  /api/admin/projects {type: 'project'|'report'|'payment'|'issue'|'task', id, ...поля}  — змінити (task: done: true|false)
//          Проєкт — з версією (functions/_ver.js): GET віддає projects[].ver, форма повертає {ver}; запис відтоді змінився (клієнт погодив
//          етап чи попросив правки, інший менеджер зберіг картку) → 409 {conflict: true, ver, last} без змін. Зі списком етапів ver
//          обовʼязковий (без нього 428). Погодження й лічильник правок уже збереженого етапу форма не перезаписує: їх змінює лише явна
//          дія в етапі — approve: true | 'РРРР-ММ-ДД' | false і rev_delta: ±n (поля approved_at / revisions з форми ігноруються).
// DELETE /api/admin/projects?type=project|report|document|payment|task&id=N
// Камера (camera_url, міграція 0008): https без логіна/пароля в адресі; YouTube вбудовується (youtube-nocookie), кадр .jpg — картинкою,
// решта — посилання в новій вкладці (functions/_account.js cameraOf). Записи — не частіше 600/год з IP (functions/_rate.js);
// CSRF, JSON-only і розмір тіла — functions/api/_middleware.js.
import {
  admin, body, cameraOf, CURRENCIES, date, httpsUrl, int, json, bad, newStageKey, noTable, notReady,
  PAY_STATUS, progressOf, STAGE_STATUS, stageKey, stageStatus, txt,
} from '../../_account.js';
import { IN_IDS, dict, idsArg, normCode, normalizePhone } from '../../_lib.js';
import { escHtml, notifyStaff } from '../../_alerts.js';
import { audit, canSeeProject, need, orderScope, projectScope, shapeProject, staffById } from '../../_roles.js';
import { limited } from '../../_rate.js';
import { leadContact, projectContacts } from '../../_partners.js';
import { askReview, kyivStamp, remindStage } from '../../_nudges.js';
import { conflict, lastChange, projectVer, projectVerById } from '../../_ver.js';

// arch — архітектурний проєкт (будинок, комерційна будівля): ескіз, АР, КР, інженерні розділи, генплан, дозвільні документи
const SERVICES = ['design', 'arch', 'repair', 'build', 'furnish', 'landscape', 'other'];
// проєктування: погодження етапів клієнтом, раунди правок, результати етапу (документи зі stage_id)
export const DESIGN_SERVICES = ['design', 'arch'];
const STATUS = ['active', 'paused', 'done'];
// render / drawing / spec — результати етапів проєктування (візуалізації, креслення, специфікації), привʼязуються до stage_id
const KINDS = ['contract', 'estimate', 'invoice', 'act', 'design', 'render', 'drawing', 'spec', 'other'];
// Шаблони етапів за типом проєкту — одне джерело правди (адмінка бере їх із GET як templates)
export const TEMPLATES = {
  // дизайн інтерʼєру — як у практиці студії (Михайло 18.11.2026): бриф → замір → планування → концепція → 3D → креслення → комплектація → нагляд
  design: ['Бриф', 'Замір / 3D-замір', 'Планувальне рішення', 'Концепція / колажі', '3D-візуалізації', 'Робочі креслення', 'Специфікації й комплектація', 'Авторський нагляд'],
  // архітектурний проєкт: ОВ / ВК / ЕО — за завданням (CLAUDE.md: «ескізний + робочий АР і КР; ОВ, ВК, ЕО, генплан — за завданням»)
  arch: ['Ескізний проєкт', 'АР — архітектурні рішення', 'КР — конструктивні рішення', 'ОВ / ВК / ЕО (за завданням)', 'Генплан', 'Супровід дозвільних документів'],
  repair: ['Демонтаж', 'Чорнові роботи', 'Інженерні мережі', 'Штукатурка й стяжка', 'Чистове оздоблення', 'Меблі й техніка', 'Здача й прибирання'],
  build: ['Проєкт і дозволи', 'Фундамент', 'Коробка', 'Покрівля', 'Вікна й фасад', 'Інженерія', 'Оздоблення', 'Благоустрій', 'Здача'],
  furnish: ['Підбір і специфікація', 'Погодження', 'Замовлення', 'Виробництво', 'Доставка', 'Монтаж'],
  landscape: ['Обміри й зйомка', 'Концепція', 'Робочий проєкт', 'Земляні роботи й дренаж', 'Мощення', 'Озеленення', 'Здача'],
  other: [],
};
// Схеми оплати: частки й назви рядків; частина привʼязується до етапу шаблону (перший / середній / останній)
export const SCHEMES = dict({ '50/50': [50, 50], '50/30/20': [50, 30, 20], '50/40/10': [50, 40, 10] });
const today = () => new Date().toISOString().slice(0, 10);

// Журнал етапу веде лише сервер: історію (hist), позначку «погодив сам клієнт» (approved_by), останню вимогу правок (rev_note / rev_at)
// і відлік нагадувань (review_at, remind_at, remind_n) беремо із збереженого етапу з тим самим id (prev), а не з тіла запиту —
// форму «Зберегти проєкт» не можна використати, щоб дописати погодження від імені клієнта, стерти історію чи обійти паузу 48 год.
const prevStages = j => { try { const a = JSON.parse(j || '[]'); return new Map((Array.isArray(a) ? a : []).filter(s => s && s.id).map(s => [s.id, s])); } catch { return new Map(); } };
const clampRev = n => Math.max(0, Math.min(99, n || 0));
// Погодження (approved_at / approved_by) і лічильник правок (revisions) змінюють і клієнт у кабінеті, і менеджер. Тому для вже
// збереженого етапу їх теж беремо із запису, а не з форми: форма, відкрита до того, як клієнт погодив етап чи надіслав «Є правки»,
// не може стерти дату погодження чи зменшити лічильник. Менеджер змінює їх лише явною дією в етапі:
//   approve: true (сьогодні) | 'РРРР-ММ-ДД' | false (зняти погодження) — запис в історії етапу з іменем менеджера;
//   rev_delta: ±n — додати / відняти правки відносно збереженого значення.
// Новий етап (id ще немає в записі) бере approved_at / revisions як є — перезаписувати там нічого.
function stagesOf(v, prev = new Map(), by = null) {
  if (!Array.isArray(v)) return null;
  const seen = new Set();
  return v.slice(0, 20).map(s => {
    let id = stageKey(s && s.id);
    if (!id || seen.has(id)) id = newStageKey();
    seen.add(id);
    const isNew = !prev.has(id), was = prev.get(id) || {};
    const progress = Math.max(0, Math.min(100, int(s && s.progress) || 0));
    const status = s && typeof s.status === 'string' && STAGE_STATUS[s.status] ? s.status : stageStatus({ progress });
    const out = {
      id, name: txt(s && s.name, 80) || 'Етап', status, progress: status === 'done' ? 100 : progress,
      start: date(s && s.start), end: date(s && s.end), note: txt(s && s.note, 300),
    };
    const hist = histOf(was.hist), op = s ? s.approve : undefined, opDate = date(op), delta = int(s && s.rev_delta) || 0;
    let ap, apBy = null, rv;
    if (isNew) {
      ap = date(s && s.approved_at) || opDate || (op === true ? kyivStamp().slice(0, 10) : null);
      rv = clampRev((int(s && s.revisions) || 0) + delta);
    } else {
      ap = date(was.approved_at); apBy = ap && was.approved_by === 'client' ? 'client' : null; rv = clampRev(int(was.revisions));
      if (op === false) {
        if (ap) hist.push({ act: 'unapprove', at: kyivStamp(), by: txt(by, 80) });
        ap = null; apBy = null;
      } else if (op === true ? !ap : (opDate && opDate !== ap)) { // позначка менеджера «Погоджено клієнтом» (інша дата — теж його позначка)
        ap = opDate || kyivStamp().slice(0, 10); apBy = null;
        hist.push({ act: 'approve', at: kyivStamp(), by: txt(by, 80), note: 'позначка в адмінці' });
      }
      if (delta) rv = clampRev(rv + delta);
    }
    // дизайн-проєкт: дата погодження етапу клієнтом і кількість правок (лише якщо задано — JSON не роздуваємо)
    if (ap) out.approved_at = ap;
    if (apBy) out.approved_by = apBy; // погодив сам клієнт у кабінеті (POST /api/account/projects)
    if (rv) out.revisions = rv;
    // відповідальний за етап (staff.id; перевірка активності — checkStageStaff) і кругів правок за договором
    const sid = int(s && s.staff_id), rm = int(s && s.rev_max);
    if (sid > 0) out.staff_id = sid;
    if (rm > 0) out.rev_max = Math.min(rm, 20);
    // остання вимога правок від клієнта (POST /api/account/projects, action 'revise') — лишається при «Зберегти проєкт»
    const rn = txt(was.rev_note, 1000), ra = date(was.rev_at);
    if (rn && ra) { out.rev_note = rn; out.rev_at = ra; }
    // історія погоджень і правок етапу (пише кабінет клієнта й нагадування) — до 30 записів
    // нагадування клієнту (functions/_nudges.js): коли етап став «Приймання», останнє нагадування, скільки автоматичних
    const stamp = v => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(v || '')) ? String(v) : null);
    if (stamp(was.review_at)) out.review_at = stamp(was.review_at);
    if (stamp(was.remind_at)) out.remind_at = stamp(was.remind_at);
    if (int(was.remind_n) > 0) out.remind_n = Math.min(int(was.remind_n), 99);
    if (hist.length) out.hist = hist.slice(-30);
    return out;
  });
}
const HIST_ACT = ['approve', 'unapprove', 'revise', 'remind'];
export function histOf(v) {
  return Array.isArray(v) ? v.filter(h => h && HIST_ACT.includes(h.act) && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(String(h.at || '')))
    .slice(-30).map(h => ({ act: h.act, at: String(h.at), by: txt(h.by, 80), ...(h.note ? { note: txt(h.note, 1000) } : {}) })) : [];
}
// відповідальні етапів: нові — лише активні працівники; кожен потрапляє в команду обʼєкта (бачить його в /kabinet/team)
// і отримує Telegram. Уже призначених раніше (навіть якщо працівника вимкнули) не перевіряємо — збереження не ламається.
const stageStaff = j => { try { return JSON.parse(j || '[]').filter(s => s && s.staff_id).map(s => [s.staff_id, s.name]); } catch { return []; } };
async function checkStageStaff(env, stagesJson, prevJson) {
  const had = new Set(stageStaff(prevJson).map(([id, name]) => id + '|' + name));
  const fresh = stageStaff(stagesJson).filter(([id, name]) => !had.has(id + '|' + name));
  for (const [id] of fresh) { const st = await staffById(env, id); if (!st || !st.active) return { error: bad('Відповідальний етапу: працівника не знайдено або вимкнено', 422) }; }
  return { fresh };
}
async function stageAssigned(env, x, projectId, title, fresh) {
  for (const [sid, name] of fresh) {
    await joinTeam(env, projectId, sid);
    if (sid !== x.staffId) await notifyStaff(env, sid, `📐 Вам призначено етап <b>${escHtml(name)}</b>\nОбʼєкт: ${escHtml(title)}`,
      { inline_keyboard: [[{ text: '📋 Мої задачі', url: 'https://cas-develop.com/kabinet/team' }]] });
  }
}
// графік платежів за схемою: аванс — перший етап, проміжний — середній, останній — останній етап
function schemeRows(key, stages, amount, currency) {
  const parts = SCHEMES[key];
  if (!parts) return [];
  const names = parts.length === 2 ? ['Аванс', 'Після завершення робіт'] : ['Аванс', 'Проміжний платіж', 'Після завершення робіт'];
  const n = stages.length;
  return parts.map((pct, i) => {
    const si = !n ? -1 : i === 0 ? 0 : i === parts.length - 1 ? n - 1 : Math.floor(n / 2);
    return { title: names[i] + ' ' + pct + '%', pct, stage_id: si >= 0 ? stages[si].id : null, amount: amount != null ? Math.round(amount * pct) / 100 : null,
      currency, status: 'planned', sort: i };
  });
}
const photosOf = v => (Array.isArray(v) ? v.map(httpsUrl).filter(Boolean).slice(0, 30) : []);
// етап за id — лише з етапів цього проєкту, інакше null
function stageIn(stagesJson, v) {
  const k = stageKey(v);
  if (!k) return null;
  try { return JSON.parse(stagesJson || '[]').some(s => s && s.id === k) ? k : null; } catch { return null; }
}
const num = (v, max = 1e9) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > max ? null : Math.round(Number(v) * 100) / 100);
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);

function projectFields(d, cur = {}, by = null) {
  const h = k => has(d, k);
  const p = {
    title: h('title') ? txt(d.title, 120) : cur.title,
    service: h('service') ? (SERVICES.includes(d.service) ? d.service : 'other') : (cur.service || 'other'),
    address: h('address') ? txt(d.address, 200) : cur.address,
    area: h('area') ? (Number(d.area) > 0 && Number(d.area) < 1e6 ? Number(d.area) : null) : cur.area,
    status: h('status') ? (STATUS.includes(d.status) ? d.status : 'active') : (cur.status || 'active'),
    stages: h('stages') ? JSON.stringify(stagesOf(d.stages, prevStages(cur.stages), by) || []) : (cur.stages || '[]'),
    next_step: h('next_step') ? txt(d.next_step, 300) : cur.next_step,
    next_date: h('next_date') ? date(d.next_date) : cur.next_date,
    manager: h('manager') ? txt(d.manager, 80) : cur.manager,
  };
  return p.title ? { p } : { error: 'Вкажіть назву проєкту' };
}

// Графік платежів: схема в кожного клієнта своя — лише рядки бази
function paymentFields(d, cur = {}, stagesJson) {
  const h = k => has(d, k);
  const p = {
    title: h('title') ? txt(d.title, 120) : cur.title,
    stage_id: h('stage_id') ? stageIn(stagesJson, d.stage_id) : (cur.stage_id ?? null),
    pct: h('pct') ? num(d.pct, 100) : (cur.pct ?? null),
    amount: h('amount') ? num(d.amount) : (cur.amount ?? null),
    currency: h('currency') ? (CURRENCIES.includes(d.currency) ? d.currency : 'USD') : (cur.currency || 'USD'),
    due_date: h('due_date') ? date(d.due_date) : (cur.due_date ?? null),
    paid_date: h('paid_date') ? date(d.paid_date) : (cur.paid_date ?? null),
    status: h('status') ? (typeof d.status === 'string' && PAY_STATUS[d.status] ? d.status : 'planned') : (cur.status || 'planned'),
    note: h('note') ? txt(d.note, 300) : (cur.note ?? null),
    sort: h('sort') ? (int(d.sort) || 0) : (cur.sort || 0),
  };
  if (p.status === 'paid' && !p.paid_date) p.paid_date = new Date().toISOString().slice(0, 10);
  return p.title ? { p } : { error: 'Вкажіть назву платежу (напр. «Аванс»)' };
}

// Камера: '' — прибрати; інакше лише коректне https-посилання без логіна/пароля
function cameraFields(d) {
  if (!has(d, 'camera_url') && !has(d, 'camera_note')) return null;
  const raw = String(d.camera_url == null ? '' : d.camera_url).trim();
  const cam = raw ? cameraOf(raw) : null;
  if (raw && !cam) return { error: 'Посилання на камеру — лише https://…, без логіна й пароля в адресі' };
  return { url: cam ? cam.url : null, note: txt(d.camera_note, 300) };
}

const deadlineOf = d => (has(d, 'deadline') ? { v: date(d.deadline) } : null);
const canTask = x => x.can('projects.edit') || x.can('projects.edit_stage');
// задача: без projects.edit — лише на себе
async function taskFields(env, x, d, cur, stagesJson) {
  const h = k => has(d, k);
  const p = {
    title: h('title') ? txt(d.title, 160) : cur.title,
    stage_id: h('stage_id') ? stageIn(stagesJson, d.stage_id) : (cur.stage_id ?? null),
    staff_id: h('staff_id') ? (d.staff_id ? int(d.staff_id) : null) : (cur.staff_id ?? (cur.id ? null : x.staffId)),
    due_date: h('due_date') ? date(d.due_date) : (cur.due_date ?? null),
    sort: h('sort') ? (int(d.sort) || 0) : (cur.sort || 0),
  };
  if (!p.title) return { error: bad('Вкажіть задачу', 422) };
  if (!x.can('projects.edit')) { // працівник ставить задачу лише собі
    if (p.staff_id == null) p.staff_id = x.staffId;
    if (p.staff_id !== x.staffId) return { error: deny('projects.edit') };
  }
  if (p.staff_id && p.staff_id !== (cur.staff_id ?? null)) {
    const st = await staffById(env, p.staff_id);
    if (!st || !st.active) return { error: bad('Працівника не знайдено або вимкнено', 422) };
  }
  return { p };
}

// виконавець задачі має бачити обʼєкт: якщо його немає в команді — додаємо (project_staff, задача «Задачі обʼєкта»)
async function joinTeam(env, projectId, staffId) {
  if (!staffId) return false;
  const pr = await env.DB.prepare('SELECT assignee_staff_id FROM projects WHERE id = ?').bind(projectId).first();
  if (!pr || pr.assignee_staff_id === staffId) return false;
  const r = await env.DB.prepare("INSERT OR IGNORE INTO project_staff (project_id, staff_id, task) VALUES (?, ?, 'Задачі обʼєкта')").bind(projectId, staffId).run();
  return r.meta.changes > 0;
}

const run = async fn => { try { return await fn(); } catch (e) { if (noTable(e)) return notReady(); throw e; } };
const tolerant = p => p.catch(e => { if (!noTable(e)) throw e; }); // колонка/таблиця 0008 ще не створена — не заважає основній зміні
const tooMany = () => bad('Забагато змін поспіль — зачекайте кілька хвилин', 429);
const touch = (env, id) => env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(id).run();

export async function onRequestGet({ request, env }) {
  const { x, error } = await admin(request, env, ['projects.view_all', 'projects.view_assigned']);
  if (error) return error;
  const sp = new URL(request.url).searchParams;
  const cid = int(sp.get('client_id')), svc = SERVICES.includes(sp.get('service')) ? sp.get('service') : null, sts = STATUS.includes(sp.get('status')) ? sp.get('status') : null;
  return run(async () => {
    const args = [];
    const w = ' WHERE ' + projectScope(x, args) + (cid ? ' AND p.client_id = ?' : '') + (svc ? ' AND p.service = ?' : '') + (sts ? ' AND p.status = ?' : '');
    if (cid) args.push(cid);
    if (svc) args.push(svc);
    if (sts) args.push(sts);
    const RAW = (await env.DB.prepare(`SELECT p.*, c.name AS client_name, c.phone AS client_phone FROM projects p LEFT JOIN clients c ON c.id = p.client_id${w} ORDER BY p.id DESC LIMIT 300`)
      .bind(...args).all()).results;
    const P = RAW.map(p => ({ ...p, stages: JSON.parse(p.stages || '[]').map(s => ({ ...s, status: stageStatus(s) })) }));
    const ids = P.map(p => p.id);
    const R = ids.length ? (await env.DB.prepare(`SELECT * FROM project_reports WHERE project_id ${IN_IDS} ORDER BY date DESC LIMIT 1000`).bind(idsArg(ids)).all())
      .results.map(r => ({ ...r, photos: JSON.parse(r.photos || '[]') })) : [];
    // документи: усі (projects.view_all) або лише привʼязані до видимих обʼєктів
    const D = x.can('projects.view_all')
      ? (await env.DB.prepare(`SELECT * FROM documents${cid ? ' WHERE client_id = ?' : ''} ORDER BY id DESC LIMIT 1000`).bind(...(cid ? [cid] : [])).all()).results
      : ids.length ? (await env.DB.prepare(`SELECT * FROM documents WHERE project_id ${IN_IDS} ORDER BY id DESC LIMIT 1000`).bind(idsArg(ids)).all()).results : [];
    let PAY = [], online = true;
    try {
      PAY = ids.length && x.can('finance.view') ? (await env.DB.prepare(`SELECT * FROM project_payments WHERE project_id ${IN_IDS} ORDER BY sort, COALESCE(due_date, '9999'), id LIMIT 2000`).bind(idsArg(ids)).all()).results : [];
    } catch (e) { if (!noTable(e)) throw e; online = false; }
    let PS = [], ISS = [], AS = [], TK = [];
    try {
      PS = ids.length ? (await env.DB.prepare(`SELECT ps.project_id, ps.staff_id, ps.task, s.name, s.role FROM project_staff ps JOIN staff s ON s.id = ps.staff_id WHERE ps.project_id ${IN_IDS}`).bind(idsArg(ids)).all()).results : [];
      AS = ids.length ? (await env.DB.prepare(`SELECT id, name FROM staff WHERE id IN (SELECT assignee_staff_id FROM projects WHERE id ${IN_IDS})`).bind(idsArg(ids)).all()).results : [];
      ISS = ids.length ? (await env.DB.prepare(`SELECT i.*, s.name AS staff_name FROM project_issues i LEFT JOIN staff s ON s.id = i.staff_id WHERE i.project_id ${IN_IDS} ORDER BY i.id DESC LIMIT 500`).bind(idsArg(ids)).all()).results
        .map(i => ({ ...i, photos: JSON.parse(i.photos || '[]') })) : [];
    } catch (e) { if (!noTable(e)) throw e; }
    let tasksReady = true;
    try { // задачі (міграція 0012)
      TK = ids.length ? (await env.DB.prepare(`SELECT t.*, s.name AS staff_name FROM project_tasks t LEFT JOIN staff s ON s.id = t.staff_id WHERE t.project_id ${IN_IDS}
          ORDER BY t.done, t.sort, COALESCE(t.due_date, '9999'), t.id LIMIT 3000`).bind(idsArg(ids)).all()).results : [];
    } catch (e) { if (!noTable(e)) throw e; tasksReady = false; }
    let LD = []; // заявки, з яких виросли проєкти: номер і джерело (сторінка-джерело — лише leads.view_all)
    try {
      const oids = [...new Set(P.map(p => p.order_id).filter(Boolean))];
      LD = oids.length ? (await env.DB.prepare(`SELECT id, number, source, ref_path FROM orders WHERE id ${IN_IDS}`).bind(idsArg(oids)).all()).results : [];
    } catch (e) { if (!noTable(e)) throw e; }
    const CT = await projectContacts(env, x, ids); // контакти обʼєкта (бригади, постачальники…) — migrations/0015
    const VER = new Map(); // версія картки для «Зберегти проєкт» (functions/_ver.js) — з рядка бази, як його прочитали
    for (const r of RAW) VER.set(r.id, await projectVer(r, PS.filter(y => y.project_id === r.id)));
    const t = today();
    const projects = P.map(p => {
      const ld = p.order_id ? LD.find(o => o.id === p.order_id) : null;
      const tk = TK.filter(y => y.project_id === p.id);
      return shapeProject({ ...p, ver: VER.get(p.id), team: PS.filter(y => y.project_id === p.id), assignee_name: (AS.find(s => s.id === p.assignee_staff_id) || {}).name || null,
        overdue: !!(p.deadline && p.deadline < t && p.status !== 'done'), progress: progressOf(p.stages), contacts: CT[p.id] || [],
        ...(ld ? { lead: { id: ld.id, number: ld.number, source: ld.source, ...(x.can('leads.view_all') ? { ref_path: ld.ref_path } : {}) } } : {}), tasks_total: tk.length, tasks_done: tk.filter(y => y.done).length }, x);
    });
    return json({
      projects, reports: R, documents: D, payments: PAY, issues: ISS, tasks: TK, tasks_ready: tasksReady, online, services: SERVICES, statuses: STATUS, kinds: KINDS,
      templates: TEMPLATES, schemes: SCHEMES, design_services: DESIGN_SERVICES, today: t,
      can: { edit: x.can('projects.edit'), finance: x.can('finance.view'), finance_edit: x.can('finance.edit'), report: x.can('reports.upload'), task: canTask(x) },
      stage_statuses: STAGE_STATUS, pay_statuses: PAY_STATUS, currencies: CURRENCIES,
    });
  });
}

const PERM = dict({ remind: 'projects.edit', review_request: 'projects.edit', from_lead: 'projects.edit', project: 'projects.edit', document: 'projects.edit', payment: 'finance.edit', report: 'reports.upload', partner: 'partners.manage', issue: 'projects.edit', task: 'projects.edit_stage' });
const deny = p => bad('Немає права: ' + p, 403);
const permOk = (x, type) => (type === 'task' ? canTask(x) : x.can(PERM[type]));

// Призначення: відповідальний і виконавці. Повертає помилку або null; нових виконавців сповіщає в Telegram.
async function assign(env, request, x, pr, d) {
  const out = {};
  if (has(d, 'assignee_staff_id')) {
    const sid = d.assignee_staff_id ? int(d.assignee_staff_id) : null;
    const st = sid ? await staffById(env, sid) : null;
    if (sid && (!st || !st.active)) return { error: bad('Працівника не знайдено або вимкнено', 422) };
    if ((pr.assignee_staff_id ?? null) !== sid) {
      await env.DB.prepare('UPDATE projects SET assignee_staff_id = ? WHERE id = ?').bind(sid, pr.id).run();
      out.assignee_staff_id = [pr.assignee_staff_id ?? null, sid];
      if (sid && sid !== x.staffId) await notifyStaff(env, sid, `🏗 Вам призначено обʼєкт <b>${escHtml(pr.title)}</b> (відповідальний)`, { inline_keyboard: [[{ text: '📋 Мої обʼєкти', url: 'https://cas-develop.com/kabinet/team' }]] });
    }
  }
  if (Array.isArray(d.staff)) {
    const want = new Map();
    for (const t of d.staff.slice(0, 30)) { const id = int(t && (t.id ?? t.staff_id)); if (id) want.set(id, txt(t.task, 80)); }
    for (const id of want.keys()) { const st = await staffById(env, id); if (!st || !st.active) return { error: bad('Працівника не знайдено або вимкнено', 422) }; }
    const cur = (await env.DB.prepare('SELECT staff_id, task FROM project_staff WHERE project_id = ?').bind(pr.id).all()).results;
    const had = new Set(cur.map(r => r.staff_id));
    await env.DB.prepare('DELETE FROM project_staff WHERE project_id = ?').bind(pr.id).run();
    for (const [id, task] of want) await env.DB.prepare('INSERT INTO project_staff (project_id, staff_id, task) VALUES (?, ?, ?)').bind(pr.id, id, task).run();
    out.staff = [cur, [...want].map(([id, task]) => ({ staff_id: id, task }))];
    for (const [id, task] of want) if (!had.has(id) && id !== x.staffId)
      await notifyStaff(env, id, `🏗 Вас додано на обʼєкт <b>${escHtml(pr.title)}</b>${task ? `\nЗадача: ${escHtml(task)}` : ''}`, { inline_keyboard: [[{ text: '📋 Мої обʼєкти', url: 'https://cas-develop.com/kabinet/team' }]] });
  }
  if (Object.keys(out).length) await audit(env, request, x, 'project.assign', 'projects', pr.id,
    Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v[0]])), Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v[1]])));
  return { error: null };
}
const money = d => has(d, 'contract_amount') || has(d, 'contract_currency');
const contractOf = d => ({ amount: num(d.contract_amount), currency: CURRENCIES.includes(d.contract_currency) ? d.contract_currency : 'USD' });

const SVC_LABEL = { design: 'Дизайн-проєкт', arch: 'Архітектурний проєкт', repair: 'Ремонт', build: 'Будівництво', furnish: 'Комплектація', landscape: 'Ландшафт', other: 'Проєкт' };
// тип проєкту за текстом заявки (коли пропозиції ще немає)
export function guessService(t) {
  const s = String(t || '').toLowerCase();
  return /архіт|архпро|architect/.test(s) ? 'arch' : /дизайн|design|інтерʼ?єр|інтер'єр/.test(s) ? 'design' : /ландшафт|landscape|сад/.test(s) ? 'landscape'
    : /будів|будинок|house|котедж|коробк/.test(s) ? 'build' : /ремонт|renovat|офіс|office/.test(s) ? 'repair' : /меблю|комплект|furnish/.test(s) ? 'furnish' : 'other';
}
// Клієнт для проєкту з заявки. Лише підтверджені звʼязки: заявка вже має client_id (подана з кабінету) → вхід за цим номером, підтверджений
// Telegram-ботом (login_requests confirmed/used; телефон у профілі клієнт може вписати будь-який — йому не віримо) → новий запис clients
// provider 'phone' (provider_id = номер: щойно клієнт увійде за номером, він побачить проєкт) або 'crm' без номера.
export async function leadClient(env, o) {
  if (o.client_id && await env.DB.prepare('SELECT 1 FROM clients WHERE id = ?').bind(o.client_id).first()) return o.client_id;
  return clientByContact(env, { name: o.name, email: o.email, phone: normalizePhone(o.phone) }, 'lead-' + o.id);
}
// Запис clients за контактом, який вписав працівник (заявка або «Новий клієнт» у формі проєкту): номер, яким уже входили через
// Telegram-бот, → той самий клієнт; інакше provider 'phone' (provider_id = номер) або 'crm' без номера (crmKey — унікальний ключ запису).
async function clientByContact(env, c, crmKey) {
  const phone = c.phone || null;
  if (phone) {
    const lr = await env.DB.prepare("SELECT client_id FROM login_requests WHERE phone = ? AND status IN ('confirmed', 'used') AND client_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(phone).first().catch(() => null);
    if (lr && await env.DB.prepare('SELECT 1 FROM clients WHERE id = ?').bind(lr.client_id).first()) return lr.client_id;
  }
  const [prov, pid] = phone ? ['phone', phone] : ['crm', crmKey];
  await env.DB.prepare('INSERT OR IGNORE INTO clients (provider, provider_id, name, email, phone) VALUES (?, ?, ?, ?, ?)')
    .bind(prov, pid, txt(c.name, 120), txt(c.email, 200), phone).run();
  return (await env.DB.prepare('SELECT id FROM clients WHERE provider = ? AND provider_id = ?').bind(prov, pid).first()).id;
}
// «Новий клієнт» у формі проєкту: {name, phone?} — імʼя обовʼязкове, номер — за бажанням (за ним клієнт потім увійде й побачить проєкт)
function newClientOf(d) {
  const nc = d.new_client;
  if (!nc || typeof nc !== 'object' || Array.isArray(nc)) return null;
  const name = txt(nc.name, 120), raw = nc.phone == null ? '' : String(nc.phone).trim();
  if (!name) return { error: 'Вкажіть імʼя нового клієнта' };
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) return { error: 'Телефон клієнта — у форматі +380XXXXXXXXX або міжнародному з «+»' };
  return { name, phone };
}

// створення проєкту: POST type 'project' і конверсія заявки (type 'from_lead')
async function newProject(env, request, x, d) {
  if ((money(d) || d.scheme) && !x.can('finance.edit')) return deny('finance.edit');
  // клієнт: наявний (client_id) або новий, якого менеджер вписав сам (new_client) — запис створюємо після перевірки решти полів
  const nc = int(d.client_id) ? null : newClientOf(d);
  if (nc && nc.error) return bad(nc.error, 422);
  let cl = nc ? null : await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(int(d.client_id)).first();
  if (!cl && !nc) return bad('Клієнта не знайдено', 404);
  // без етапів — шаблон за типом проєкту
  const svc = SERVICES.includes(d.service) ? d.service : 'other';
  const { p, error: e2 } = projectFields(Array.isArray(d.stages) ? d : { ...d, stages: TEMPLATES[svc].map(name => ({ name, status: 'planned', progress: 0 })) });
  if (e2) return bad(e2, 422);
  const ss = await checkStageStaff(env, p.stages, '[]');
  if (ss.error) return ss.error;
  const cam = cameraFields(d);
  if (cam && cam.error) return bad(cam.error, 422);
  if (nc) cl = { id: await clientByContact(env, nc, 'manual-' + crypto.randomUUID()) };
  const r = await env.DB.prepare('INSERT INTO projects (client_id, title, service, address, area, status, stages, next_step, next_date, manager) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cl.id, p.title, p.service, p.address ?? null, p.area ?? null, p.status, p.stages, p.next_step ?? null, p.next_date ?? null, p.manager ?? null).run();
  const pid = r.meta.last_row_id;
  if (cam) await env.DB.prepare('UPDATE projects SET camera_url = ?, camera_note = ? WHERE id = ?').bind(cam.url, cam.note, pid).run();
  if (money(d)) { const m = contractOf(d); await env.DB.prepare('UPDATE projects SET contract_amount = ?, contract_currency = ? WHERE id = ?').bind(m.amount, m.currency, pid).run(); }
  const dl = deadlineOf(d);
  if (dl && dl.v) await tolerant(env.DB.prepare('UPDATE projects SET deadline = ? WHERE id = ?').bind(dl.v, pid).run());
  if (d.scheme && SCHEMES[d.scheme]) { // графік платежів за схемою (до міграції 0008 — пропускаємо)
    const m = contractOf(d);
    for (const y of schemeRows(d.scheme, JSON.parse(p.stages), m.amount, m.currency))
      await tolerant(env.DB.prepare(`INSERT INTO project_payments (project_id, stage_id, title, pct, amount, currency, status, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(pid, y.stage_id, y.title, y.pct, y.amount, y.currency, y.status, y.sort).run());
  }
  if (d.order_id && int(d.order_id)) { // проєкт виріс із заявки: заявка переходить у стадію «Проєкт»
    const o = await env.DB.prepare("SELECT id, status FROM orders WHERE id = ? AND kind = 'lead'").bind(int(d.order_id)).first();
    if (o) {
      await env.DB.prepare('UPDATE projects SET order_id = ? WHERE id = ?').bind(o.id, pid).run();
      if (['new', 'in_work', 'quote_sent', 'contract'].includes(o.status)) {
        await env.DB.prepare("UPDATE orders SET status = 'project', updated_at = datetime('now') WHERE id = ?").bind(o.id).run();
        await env.DB.prepare("INSERT INTO order_events (order_id, status, note, author) VALUES (?, 'project', ?, ?)").bind(o.id, 'Створено проєкт «' + p.title + '»', x.name).run();
      }
    }
  }
  const a = await assign(env, request, x, { id: pid, title: p.title, assignee_staff_id: null }, d);
  if (a.error) return a.error;
  await stageAssigned(env, x, pid, p.title, ss.fresh);
  await audit(env, request, x, 'project.create', 'projects', pid, null, { client_id: cl.id, ...(nc ? { new_client: true } : {}), ...p, deadline: dl ? dl.v : null, scheme: SCHEMES[d.scheme] ? d.scheme : null });
  return json({ ok: true, id: pid, client_id: cl.id });
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await admin(request, env, [...Object.values(PERM), 'projects.edit']);
  if (error) return error;
  const { d, error: e1 } = await body(request, 32 * 1024);
  if (e1) return e1;
  if (await limited(env, request, 'admin-projects', 600)) return tooMany();
  if (typeof d.type !== 'string' || !PERM[d.type]) return bad('Невідомий type');
  if (!permOk(x, d.type)) return deny(PERM[d.type]);
  return run(async () => {
    if (d.type === 'project') return newProject(env, request, x, d);
    if (d.type === 'remind' || d.type === 'review_request') {
      // клієнту: «етап чекає погодження» (не частіше 1/48 год) або прохання про відгук (один раз) — functions/_nudges.js;
      // channel порожній — Telegram-бот; без привʼязки — {sent: false, text}: менеджер надсилає сам і повідомляє канал (журнал)
      const pr = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr || !await canSeeProject(env, x, pr.id)) return bad('Проєкт не знайдено', 404);
      const ch = d.channel ? String(d.channel) : null;
      const r = d.type === 'remind' ? await remindStage(env, request, x, pr, String(d.stage_id || ''), { channel: ch }) : await askReview(env, request, x, pr, { channel: ch });
      return r.error ? json({ error: r.error, wait_h: r.wait_h }, r.status) : json(r);
    }
    if (d.type === 'from_lead') {
      // заявка → проєкт однією кнопкою: клієнт, контакт, джерело (orders.source/ref_path через order_id), тип і площа з пропозиції
      const args = [];
      const o = await env.DB.prepare(`SELECT o.* FROM orders o WHERE o.id = ? AND o.kind = 'lead' AND ${orderScope(x, args)}`).bind(int(d.order_id) || 0, ...args).first();
      if (!o) return bad('Заявку не знайдено', 404);
      const ex = await env.DB.prepare('SELECT id FROM projects WHERE id = ? OR order_id = ? ORDER BY id LIMIT 1').bind(o.project_id || 0, o.id).first();
      if (ex) return json({ error: 'Проєкт із цієї заявки вже створено', id: ex.id }, 409);
      const cid = await leadClient(env, o);
      let f = null; try { f = JSON.parse(o.offer || 'null'); } catch { /* noop */ }
      const svc = f && SERVICES.includes(f.service) ? f.service : guessService(`${o.service || ''} ${o.comment || ''}`);
      const area = f && f.area > 0 ? (f.unit === 'сотка' ? f.area * 100 : f.area) : null;
      const st = o.assignee_staff_id ? await staffById(env, o.assignee_staff_id) : null;
      const res = await newProject(env, request, x, {
        client_id: cid, title: txt(d.title, 120) || `${SVC_LABEL[svc]} · ${o.name || o.number}`, service: svc, area, address: txt(o.city, 200), order_id: o.id,
        ...(st && st.active ? { assignee_staff_id: st.id } : {}),
      });
      const j = await res.clone().json();
      if (!j.ok) return res;
      if (!o.client_id) await env.DB.prepare('UPDATE orders SET client_id = ? WHERE id = ? AND client_id IS NULL').bind(cid, o.id).run();
      await tolerant(env.DB.prepare('UPDATE orders SET project_id = ? WHERE id = ?').bind(j.id, o.id).run());
      const contact = await leadContact(env, o, cid, j.id, x.staffId); // клієнт у «Контактах» + звʼязки (migrations/0015)
      await audit(env, request, x, 'lead.convert', 'orders', o.id, null, { project_id: j.id, client_id: cid, service: svc, area, contact_id: contact });
      return json({ ok: true, id: j.id, client_id: cid });
    }
    if (d.type === 'task') {
      const pr = await env.DB.prepare('SELECT id, title, stages FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr || !await canSeeProject(env, x, pr.id)) return bad('Проєкт не знайдено', 404);
      const { p, error: e2 } = await taskFields(env, x, d, {}, pr.stages);
      if (e2) return e2;
      const r = await env.DB.prepare('INSERT INTO project_tasks (project_id, stage_id, title, staff_id, due_date, sort) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(pr.id, p.stage_id, p.title, p.staff_id, p.due_date, p.sort).run();
      const joined = await joinTeam(env, pr.id, p.staff_id);
      await touch(env, pr.id);
      await audit(env, request, x, 'task.create', 'projects', pr.id, null, { task_id: r.meta.last_row_id, ...p, ...(joined ? { joined_team: p.staff_id } : {}) });
      if (p.staff_id && p.staff_id !== x.staffId)
        await notifyStaff(env, p.staff_id, `📝 Нова задача на обʼєкті <b>${escHtml(pr.title)}</b>\n${escHtml(p.title)}${p.due_date ? `\nТермін: ${p.due_date}` : ''}`, { inline_keyboard: [[{ text: '📋 Мої задачі', url: 'https://cas-develop.com/kabinet/team' }]] });
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'report') {
      const pr = await env.DB.prepare('SELECT id, stages FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr || !await canSeeProject(env, x, pr.id)) return bad('Проєкт не знайдено', 404);
      const dt = date(d.date) || new Date().toISOString().slice(0, 10);
      const photos = photosOf(d.photos);
      if (!photos.length && !txt(d.note, 10)) return bad('Додайте фото (https-посилання) або опис', 422);
      const r = await env.DB.prepare('INSERT INTO project_reports (project_id, date, title, note, photos) VALUES (?, ?, ?, ?, ?)')
        .bind(pr.id, dt, txt(d.title, 120), txt(d.note, 2000), JSON.stringify(photos)).run();
      const sid = stageIn(pr.stages, d.stage_id);
      if (sid) await tolerant(env.DB.prepare('UPDATE project_reports SET stage_id = ? WHERE id = ?').bind(sid, r.meta.last_row_id).run());
      if (x.staffId) await tolerant(env.DB.prepare('UPDATE project_reports SET author_staff_id = ? WHERE id = ?').bind(x.staffId, r.meta.last_row_id).run());
      await touch(env, pr.id);
      await audit(env, request, x, 'report.create', 'projects', pr.id, null, { report_id: r.meta.last_row_id, photos: photos.length, stage_id: sid || null });
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'document') {
      const cl = await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(int(d.client_id)).first();
      if (!cl) return bad('Клієнта не знайдено', 404);
      const url = httpsUrl(d.url), title = txt(d.title, 160);
      if (!url || !title) return bad('Потрібні назва й https-посилання', 422);
      const pid = d.project_id ? int(d.project_id) : null, oid = d.order_id ? int(d.order_id) : null;
      const prj = pid ? await env.DB.prepare('SELECT id, stages FROM projects WHERE id = ? AND client_id = ?').bind(pid, cl.id).first() : null;
      if (pid && !prj) return bad('Проєкт іншого клієнта', 422);
      if (pid && !await canSeeProject(env, x, pid)) return bad('Проєкт не знайдено', 404);
      if (oid && !await env.DB.prepare('SELECT 1 FROM orders WHERE id = ? AND client_id = ?').bind(oid, cl.id).first()) return bad('Замовлення іншого клієнта', 422);
      const r = await env.DB.prepare('INSERT INTO documents (client_id, project_id, order_id, kind, title, url) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(cl.id, pid, oid, KINDS.includes(d.kind) ? d.kind : 'other', title, url).run();
      const sid = prj && stageIn(prj.stages, d.stage_id);
      if (sid) await tolerant(env.DB.prepare('UPDATE documents SET stage_id = ? WHERE id = ?').bind(sid, r.meta.last_row_id).run());
      await audit(env, request, x, 'document.create', 'projects', pid, null, { document_id: r.meta.last_row_id, title, kind: d.kind });
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'payment') {
      const pr = await env.DB.prepare('SELECT id, stages FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr || !await canSeeProject(env, x, pr.id)) return bad('Проєкт не знайдено', 404);
      const { p, error: e2 } = paymentFields(d, {}, pr.stages);
      if (e2) return bad(e2, 422);
      const r = await env.DB.prepare(`INSERT INTO project_payments (project_id, stage_id, title, pct, amount, currency, due_date, paid_date, status, note, sort)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(pr.id, p.stage_id, p.title, p.pct, p.amount, p.currency, p.due_date, p.paid_date, p.status, p.note, p.sort).run();
      await touch(env, pr.id);
      await audit(env, request, x, 'payment.create', 'projects', pr.id, null, { payment_id: r.meta.last_row_id, ...p });
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'partner') {
      const cid = int(d.client_id);
      if (!await env.DB.prepare('SELECT 1 FROM clients WHERE id = ?').bind(cid).first()) return bad('Клієнта не знайдено', 404);
      await env.DB.prepare('UPDATE partner_codes SET client_id = NULL WHERE client_id = ?').bind(cid).run();
      if (d.code) {
        const code = normCode(d.code);
        const r = code && await env.DB.prepare('UPDATE partner_codes SET client_id = ? WHERE code = ?').bind(cid, code).run();
        if (!r || !r.meta.changes) return bad('Код не знайдено', 404);
      }
      await audit(env, request, x, 'partner.link', 'clients', cid, null, { code: d.code ? normCode(d.code) : null });
      return json({ ok: true });
    }
    return bad('Невідомий type');
  });
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await admin(request, env, ['projects.edit', 'projects.edit_stage', 'finance.edit', 'reports.upload']);
  if (error) return error;
  const { d, error: e1 } = await body(request, 32 * 1024);
  if (e1) return e1;
  if (await limited(env, request, 'admin-projects', 600)) return tooMany();
  const type = d.type || 'project';
  const perm = type === 'payment' ? 'finance.edit' : type === 'report' ? 'reports.upload' : type === 'task' ? 'projects.edit_stage' : 'projects.edit';
  if (typeof type !== 'string' || !PERM[type] || type === 'partner' || type === 'document') return bad('Невідомий type');
  if (type === 'task' ? !canTask(x) : !x.can(perm)) return deny(perm);
  return run(async () => {
    if (type === 'task') {
      const cur = await env.DB.prepare('SELECT * FROM project_tasks WHERE id = ?').bind(int(d.id)).first();
      if (!cur || !await canSeeProject(env, x, cur.project_id)) return bad('Задачу не знайдено', 404);
      const editor = x.can('projects.edit');
      // працівник без projects.edit — лише відмітити свою (або нічию) задачу
      if (!editor && (Object.keys(d).some(k => !['type', 'id', 'done'].includes(k)) || (cur.staff_id && cur.staff_id !== x.staffId))) return deny('projects.edit');
      const pr = await env.DB.prepare('SELECT title, stages FROM projects WHERE id = ?').bind(cur.project_id).first();
      let q = { title: cur.title, stage_id: cur.stage_id, staff_id: cur.staff_id, due_date: cur.due_date, sort: cur.sort };
      if (editor) {
        const { p, error: e2 } = await taskFields(env, x, Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'done')), cur, pr && pr.stages);
        if (e2) return e2;
        q = p;
      }
      const done = has(d, 'done') ? (d.done ? 1 : 0) : cur.done;
      await env.DB.prepare(`UPDATE project_tasks SET title = ?, stage_id = ?, staff_id = ?, due_date = ?, sort = ?, done = ?,
          done_at = CASE WHEN ? = 1 THEN COALESCE(done_at, datetime('now')) END, done_by = CASE WHEN ? = 1 THEN COALESCE(done_by, ?) END WHERE id = ?`)
        .bind(q.title, q.stage_id, q.staff_id, q.due_date, q.sort, done, done, done, x.staffId, cur.id).run();
      if (q.staff_id !== (cur.staff_id ?? null)) await joinTeam(env, cur.project_id, q.staff_id);
      await touch(env, cur.project_id);
      const act = done !== cur.done ? (done ? 'task.done' : 'task.reopen') : 'task.update';
      await audit(env, request, x, act, 'projects', cur.project_id, { task_id: cur.id, title: cur.title, staff_id: cur.staff_id, due_date: cur.due_date, done: cur.done },
        { task_id: cur.id, ...q, done });
      if (q.staff_id && q.staff_id !== (cur.staff_id ?? null) && q.staff_id !== x.staffId)
        await notifyStaff(env, q.staff_id, `📝 Вам призначено задачу на обʼєкті <b>${escHtml(pr ? pr.title : '')}</b>\n${escHtml(q.title)}${q.due_date ? `\nТермін: ${q.due_date}` : ''}`, { inline_keyboard: [[{ text: '📋 Мої задачі', url: 'https://cas-develop.com/kabinet/team' }]] });
      return json({ ok: true });
    }
    if (type === 'issue') {
      const i = await env.DB.prepare('SELECT * FROM project_issues WHERE id = ?').bind(int(d.id)).first();
      if (!i || !await canSeeProject(env, x, i.project_id)) return bad('Проблему не знайдено', 404);
      const status = d.status === 'open' ? 'open' : 'resolved';
      await env.DB.prepare("UPDATE project_issues SET status = ?, resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') END, resolved_by = ? WHERE id = ?")
        .bind(status, status, status === 'resolved' ? x.staffId : null, i.id).run();
      await audit(env, request, x, 'issue.' + status, 'projects', i.project_id, { issue_id: i.id, status: i.status }, { issue_id: i.id, status });
      return json({ ok: true });
    }
    if (type === 'report') {
      const r = await env.DB.prepare('SELECT * FROM project_reports WHERE id = ?').bind(int(d.id)).first();
      if (!r || !await canSeeProject(env, x, r.project_id)) return bad('Звіт не знайдено', 404);
      // фотозвіт без права редагування обʼєкта — лише свій
      if (!x.can('projects.edit') && r.author_staff_id !== x.staffId) return deny('projects.edit');
      await env.DB.prepare('UPDATE project_reports SET date = ?, title = ?, note = ?, photos = ? WHERE id = ?')
        .bind(date(d.date) || r.date, d.title !== undefined ? txt(d.title, 120) : r.title, d.note !== undefined ? txt(d.note, 2000) : r.note,
          d.photos !== undefined ? JSON.stringify(photosOf(d.photos)) : r.photos, r.id).run();
      if (d.stage_id !== undefined) {
        const pr = await env.DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(r.project_id).first();
        await env.DB.prepare('UPDATE project_reports SET stage_id = ? WHERE id = ?').bind(stageIn(pr && pr.stages, d.stage_id), r.id).run();
      }
      await audit(env, request, x, 'report.update', 'projects', r.project_id, { report_id: r.id, title: r.title, note: r.note }, { report_id: r.id, title: d.title, note: d.note });
      return json({ ok: true });
    }
    if (type === 'payment') {
      const cur = await env.DB.prepare('SELECT * FROM project_payments WHERE id = ?').bind(int(d.id)).first();
      if (!cur || !await canSeeProject(env, x, cur.project_id)) return bad('Платіж не знайдено', 404);
      const pr = await env.DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(cur.project_id).first();
      const { p, error: e2 } = paymentFields(d, cur, pr && pr.stages);
      if (e2) return bad(e2, 422);
      await env.DB.prepare('UPDATE project_payments SET stage_id = ?, title = ?, pct = ?, amount = ?, currency = ?, due_date = ?, paid_date = ?, status = ?, note = ?, sort = ? WHERE id = ?')
        .bind(p.stage_id, p.title, p.pct, p.amount, p.currency, p.due_date, p.paid_date, p.status, p.note, p.sort, cur.id).run();
      await touch(env, cur.project_id);
      await audit(env, request, x, 'payment.update', 'projects', cur.project_id, cur, { id: cur.id, ...p });
      return json({ ok: true });
    }
    const cur = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(int(d.id)).first();
    if (!cur || !await canSeeProject(env, x, cur.id)) return bad('Проєкт не знайдено', 404);
    if (money(d) && !x.can('finance.edit')) return deny('finance.edit');
    // версія картки: зі списком етапів — обовʼязкова (весь список перезаписується); застаріла → 409 без змін
    if (has(d, 'stages') && (d.ver == null || d.ver === '')) return bad('Панель оновилась — перезавантажте сторінку й повторіть зміну', 428);
    const stale = async () => conflict('Проєкт змінився, поки ви редагували', { ver: await projectVerById(env, cur.id), last: await lastChange(env, 'projects', cur.id) });
    if (d.ver != null && d.ver !== '') {
      let team0 = [];
      try { team0 = (await env.DB.prepare('SELECT staff_id, task FROM project_staff WHERE project_id = ?').bind(cur.id).all()).results; } catch (e) { if (!noTable(e)) throw e; }
      if (String(d.ver) !== await projectVer(cur, team0)) return stale();
    }
    const { p, error: e2 } = projectFields(d, cur, x.name);
    if (e2) return bad(e2, 422);
    if (has(d, 'stages')) { // етап щойно став «Приймання» → review_at (відлік для нагадування клієнту)
      const prev = new Map(JSON.parse(cur.stages || '[]').map(y => [y.id, y]));
      p.stages = JSON.stringify(JSON.parse(p.stages).map(y => (y.status === 'review' && (!prev.get(y.id) || prev.get(y.id).status !== 'review') ? { ...y, review_at: kyivStamp() } : y)));
    }
    const ss = has(d, 'stages') ? await checkStageStaff(env, p.stages, cur.stages) : { fresh: [] };
    if (ss.error) return ss.error;
    const cam = cameraFields(d);
    if (cam && cam.error) return bad(cam.error, 422);
    // «порівняй і заміни»: пишемо, лише якщо етапи ті самі, що прочитали на початку запиту (клієнт міг погодити етап у цю ж мить)
    const w = await env.DB.prepare(`UPDATE projects SET title = ?, service = ?, address = ?, area = ?, status = ?, stages = ?, next_step = ?, next_date = ?, manager = ?, updated_at = datetime('now') WHERE id = ? AND stages IS ?`)
      .bind(p.title, p.service, p.address ?? null, p.area ?? null, p.status, p.stages, p.next_step ?? null, p.next_date ?? null, p.manager ?? null, cur.id, cur.stages).run();
    if (!w.meta.changes) return stale();
    if (p.status !== cur.status && (p.status === 'done' || cur.status === 'done')) // для прохання про відгук через ~2 доби (migrations/0016)
      await tolerant(env.DB.prepare(`UPDATE projects SET done_at = ${p.status === 'done' ? "datetime('now')" : 'NULL'} WHERE id = ?`).bind(cur.id).run());
    // камера — окремо: до міграції 0008 решта проєкту зберігається, а камера — ні (поле порожнє — нічого не ламаємо)
    if (cam && (cam.url || cam.note || cur.camera_url !== undefined)) await env.DB.prepare('UPDATE projects SET camera_url = ?, camera_note = ? WHERE id = ?').bind(cam.url, cam.note, cur.id).run();
    if (money(d)) { const m = contractOf(d); await env.DB.prepare('UPDATE projects SET contract_amount = ?, contract_currency = ? WHERE id = ?').bind(m.amount, m.currency, cur.id).run(); }
    const dl = deadlineOf(d); // до міграції 0012 — не зберігається, решта проєкту — так
    if (dl && (dl.v || cur.deadline !== undefined)) await tolerant(env.DB.prepare('UPDATE projects SET deadline = ? WHERE id = ?').bind(dl.v, cur.id).run());
    const a = await assign(env, request, x, cur, d);
    if (a.error) return a.error;
    await stageAssigned(env, x, cur.id, p.title, ss.fresh);
    if (dl && String(dl.v ?? '') !== String(cur.deadline ?? '')) p.deadline = dl.v;
    const changed = Object.fromEntries(Object.entries(p).filter(([k, v]) => String(v ?? '') !== String(cur[k] ?? '')));
    if (Object.keys(changed).length || money(d)) await audit(env, request, x, 'project.update', 'projects', cur.id,
      Object.fromEntries(Object.keys(changed).map(k => [k, cur[k]]).concat(money(d) ? [['contract_amount', cur.contract_amount]] : [])),
      { ...changed, ...(money(d) ? { contract_amount: num(d.contract_amount) } : {}) });
    return json({ ok: true, ver: await projectVerById(env, cur.id) });
  });
}

export async function onRequestDelete({ request, env }) {
  const { x, error } = await admin(request, env, ['projects.edit', 'finance.edit']);
  if (error) return error;
  const u = new URL(request.url), type = u.searchParams.get('type'), id = int(u.searchParams.get('id'));
  if (await limited(env, request, 'admin-projects', 600)) return tooMany();
  const perm = type === 'payment' ? 'finance.edit' : 'projects.edit';
  if (!x.can(perm)) return deny(perm);
  return run(async () => {
    const table = dict({ payment: 'project_payments', report: 'project_reports', document: 'documents', project: 'projects', task: 'project_tasks' })[type]; // лише ці пʼять назв потрапляють у SQL
    if (!table) return bad('Невідомий type');
    const before = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
    // лише видимий обʼєкт; документ без обʼєкта — лише з projects.view_all
    const pid = before ? (type === 'project' ? before.id : before.project_id) : null;
    if (!before || (pid ? !await canSeeProject(env, x, pid) : !x.can('projects.view_all'))) return bad('Не знайдено', 404);
    await audit(env, request, x, type + '.delete', 'projects', type === 'project' ? id : before.project_id, before, null);
    if (type === 'task') await env.DB.prepare('DELETE FROM project_tasks WHERE id = ?').bind(id).run();
    else if (type === 'payment') await env.DB.prepare('DELETE FROM project_payments WHERE id = ?').bind(id).run();
    else if (type === 'report') await env.DB.prepare('DELETE FROM project_reports WHERE id = ?').bind(id).run();
    else if (type === 'document') await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
    else if (type === 'project') {
      await tolerant(env.DB.prepare('DELETE FROM project_payments WHERE project_id = ?').bind(id).run());
      await tolerant(env.DB.prepare('DELETE FROM project_staff WHERE project_id = ?').bind(id).run());
      await tolerant(env.DB.prepare('DELETE FROM project_issues WHERE project_id = ?').bind(id).run());
      await tolerant(env.DB.prepare('DELETE FROM project_tasks WHERE project_id = ?').bind(id).run());
      await tolerant(env.DB.prepare('DELETE FROM media WHERE project_id = ?').bind(id).run());
      await env.DB.batch([
        env.DB.prepare('DELETE FROM project_reports WHERE project_id = ?').bind(id),
        env.DB.prepare('UPDATE documents SET project_id = NULL WHERE project_id = ?').bind(id),
        env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
      ]);
    } else return bad('Невідомий type');
    return json({ ok: true });
  });
}
