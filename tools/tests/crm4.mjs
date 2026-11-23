// Тести CRM v4 (20.11.2026): задачі й таблиці контактів. Запускається з run.mjs (спільний звіт); окремо: node tools/tests/crm4.mjs.
//   • задачі (functions/_tasks.js, /api/admin/tasks, /api/team/tasks, migrations/0018): CRUD, права за ролями, «виконано / повернути»,
//     прострочені й перемикачі, привʼязки (і що з них бачить працівник), версії / 409, масові дії, ліміти, задачі етапів у спільному списку;
//   • сповіщення: призначено / виконано (лише 10:00–20:00 Київ, поза ними — черга), ранкове зведення раз на день (мок Telegram);
//   • контакти (/api/admin/partners): сортування й сторінки таблиці, архів, масові дії, імпорт CSV (дублі, права, ліміт), експорт (BOM, права).
// Усі імена, телефони й адреси тут — вигадані.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';
import { STAFF_LIMITS, limited, staffKey } from '../../functions/_rate.js';
import { ROLES } from '../../functions/_roles.js';
import { kyiv, kyivMidnight } from '../../functions/_alerts.js';
import { runTaskNotices } from '../../functions/_tasks.js';

const env = makeEnv(freshDB(), { ALERTS_TEST_CLOCK: '1' });
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
const qa = async (sql, ...a) => (await DB.prepare(sql).bind(...a).all()).results;

// годинник тестів: «сьогодні» — справжня київська дата; середина дня й ніч — через заголовок x-test-now (лише з ALERTS_TEST_CLOCK=1)
const TODAY = kyiv(new Date()).date;
const day = n => new Date(Date.parse(TODAY + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const at = (date, h, m = 0) => new Date(kyivMidnight(date).getTime() + (h * 60 + m) * 60000);
const NOON = at(TODAY, 12), NIGHT = at(TODAY, 23, 30);

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const DES = await addClient(env, { id: 444, name: 'Дизайнер' });
const FORE = await addClient(env, { id: 555, name: 'Прораб' });
const ACC = await addClient(env, { id: 666, name: 'Бухгалтер' });
const NOTG = await addClient(env, { provider: 'google', id: 'g-777', name: 'Без Telegram', email: 'no.tg@example.com' });
const CL = await addClient(env, { id: 80001, name: 'Клієнт Тест', phone: '+380500008001' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, DES, FORE, ACC, NOTG, CL })) ck[k] = await login(env, id);
await call(env, 'GET', '/api/me', { cookie: ck.OWNER }); await call(env, 'GET', '/api/me', { cookie: ck.MGR });
const staff = async (name, role, extra) => (await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name, role, ...extra } })).data.id;
const S = { DES: await staff('Дизайнерка Тест', 'designer', { tg: '444' }), FORE: await staff('Прораб Тест', 'foreman', { tg: '555' }),
  ACC: await staff('Бухгалтерка Тест', 'accountant', { tg: '666' }), NOTG: await staff('Мебляр без Telegram', 'furniture', { email: 'no.tg@example.com' }) };
for (const k of ['DES', 'FORE', 'ACC', 'NOTG']) ck[k] = await login(env, { DES, FORE, ACC, NOTG }[k]);
S.OWNER = (await q1('SELECT id FROM staff WHERE client_id = ?', OWNER)).id; S.MGR = (await q1('SELECT id FROM staff WHERE client_id = ?', MGR)).id;
await call(env, 'GET', '/api/team/today', { cookie: ck.NOTG }); // привʼязати запрошення до акаунта

const T = (method, body, who = 'MGR', when = NOON, e = env) => call(e, method, '/api/admin/tasks', { cookie: ck[who], body, headers: { 'x-test-now': when.toISOString() } });
const list = async (qs = '', who = 'MGR', when = NOON) => (await call(env, 'GET', '/api/admin/tasks' + (qs ? '?' + qs : ''), { cookie: ck[who], headers: { 'x-test-now': when.toISOString() } }));
const rowsOf = async (qs, who, when) => (await list(qs, who, when)).data.rows;
const mk = async (body, who = 'MGR', when = NOON) => { const r = await T('POST', body, who, when); if (r.status !== 200) throw new Error('POST → ' + r.status + ' ' + r.text); return r.data.id; };
const tg = chat => bot.calls.filter(c => c.method === 'sendMessage' && String(c.chat_id) === String(chat));
const sla = now => call(env, 'POST', '/api/admin/lead-sla', { body: { now: now.toISOString() }, headers: { 'x-lead-key': 'lead-key', noOrigin: true } });

// обʼєкти для привʼязок: проєкт прораба, чужий проєкт, заявка дизайнерки, чужа заявка, контакти
const P = body => call(env, 'POST', '/api/admin/projects', { cookie: ck.MGR, body });
const PJ = (await P({ type: 'project', client_id: CL, service: 'repair', title: 'Квартира на Тестовій', assignee_staff_id: S.FORE, stages: [{ name: 'Демонтаж', progress: 100 }, { name: 'Чорнові', progress: 30 }] })).data.id;
const PJ2 = (await P({ type: 'project', client_id: CL, service: 'design', title: 'Чужий дизайн-проєкт', stages: [{ name: 'Бриф', progress: 0 }] })).data.id;
const stageId = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', PJ)).stages)[1].id;
const lead = async (name, phone, st) => { const id = (await call(env, 'POST', '/api/admin/crm', { cookie: ck.MGR, body: { name, phone, service: 'Ремонт квартири' } })).data.id; if (st) await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id, assignee_staff_id: st } }); return id; };
const LD = await lead('Заявка дизайнерки', '0670008001', S.DES), LD2 = await lead('Чужа заявка', '0670008002');
const C = body => call(env, 'POST', '/api/admin/partners', { cookie: ck.MGR, body });
const CT = (await C({ name: 'Плиточник Тестовий', type: 'master', city: 'Київ', phone: '067 000 81 01', tags: ['плитка'] })).data.id;
const CT2 = (await C({ company: 'ТОВ «Вигадані вікна»', type: 'supplier', city: 'Львів', email: 'windows@example.com' })).data.id;
await C({ action: 'link', contact_id: CT, project_id: PJ, role: 'Плиточник' });

describe('Задачі: створення, права за ролями');
let T1, T2, T3;
await it('менеджер: швидке додавання одним рядком → задача собі, відкрита, без сповіщення; видно в «Мої»', async () => {
  bot.reset();
  const r = await T('POST', { title: '  Передзвонити постачальнику   плитки ' });
  eq(r.status, 200); T1 = r.data.id;
  const t = await q1('SELECT * FROM tasks WHERE id = ?', T1);
  eq([t.title, t.status, t.priority, t.assignee_staff_id, t.created_by, t.due_date, t.assign_notified], ['Передзвонити постачальнику плитки', 'open', 'normal', S.MGR, S.MGR, null, 1]);
  eq(bot.calls.length, 0, 'собі — без Telegram');
  ok(r.data.task.ver && r.data.task.can.edit && r.data.task.can.done && r.data.task.mine, 'відповідь — готовий рядок із версією');
  ok((await rowsOf('view=mine')).some(x => x.id === T1 && x.src === 't'));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.create' AND entity = 'tasks' AND entity_id = ?", String(T1)), 'аудит');
});
await it('власник призначає дизайнерці задачу зі строком, часом і привʼязкою до заявки → Telegram виконавцю (робочий час)', async () => {
  bot.reset();
  T2 = await mk({ title: 'Підготувати планування <b>до зустрічі</b>', note: 'Два варіанти\nз кухнею-вітальнею', priority: 'high', due_date: day(1), due_time: '14:30', assignee_staff_id: S.DES, order_id: LD }, 'OWNER');
  const m = tg(444);
  eq(m.length, 1); ok(/Вам призначено задачу/.test(m[0].text) && /&lt;b&gt;до зустрічі&lt;\/b&gt;/.test(m[0].text), 'текст задачі в Telegram екрановано');
  ok(m[0].text.includes(`Строк: ${day(1).slice(8)}.${day(1).slice(5, 7)} 14:30`) && /Поставив\(ла\): Власник/.test(m[0].text), m[0].text);
  eq(m[0].reply_markup.inline_keyboard.at(-1)[0].url, 'https://cas-develop.com/kabinet/team#todo', 'працівнику — посилання в кабінет працівника');
  ok(/^k:\d+:d$/.test(m[0].reply_markup.inline_keyboard[0][0].callback_data), 'під задачею — кнопка «✅ Виконано» (k:<id>:d)');
  const t = await q1('SELECT * FROM tasks WHERE id = ?', T2);
  eq([t.title, t.note, t.assign_notified, t.order_id, t.due_time], ['Підготувати планування <b>до зустрічі</b>', 'Два варіанти\nз кухнею-вітальнею', 1, LD, '14:30'], 'текст зберігається як є');
});
await it('перевірки полів: без назви, зла дата/час, невідомий чи вимкнений виконавець, неіснуюча привʼязка → 422, нічого не створено', async () => {
  const n0 = (await q1('SELECT COUNT(*) AS n FROM tasks')).n;
  const off = await staff('Вимкнений', 'foreman', { tg: '998' });
  await DB.prepare('UPDATE staff SET active = 0 WHERE id = ?').bind(off).run();
  for (const b of [{ title: '   ' }, { title: 'x', due_date: '2026-13-45' }, { title: 'x', due_date: day(1), due_time: '25:00' }, { title: 'x', assignee_staff_id: 99999 }, { title: 'x', assignee_staff_id: off },
    { title: 'x', priority: 'urgent' }, { title: 'x', order_id: 99999 }, { title: 'x', project_id: 99999 }, { title: 'x', contact_id: 99999 }, { title: { a: 1 } }])
    eq((await T('POST', b)).status, 422, JSON.stringify(b));
  eq((await q1('SELECT COUNT(*) AS n FROM tasks')).n, n0);
  const id = await mk({ title: 'Час без дати', due_time: '10:00', project_id: PJ, stage_id: 'zzzz' });
  const t = await q1('SELECT due_time, stage_id FROM tasks WHERE id = ?', id);
  eq([t.due_time, t.stage_id], [null, null], 'час без дати й етап не з цього обʼєкта відкидаються');
  await call(env, 'DELETE', '/api/admin/tasks?id=' + id, { cookie: ck.MGR });
});
await it('дизайнер, прораб, бухгалтер (tasks.own): створити, правити, масово, видалити — 403; гість — 401; клієнт — 403', async () => {
  T3 = await mk({ title: 'Замовити плитку', assignee_staff_id: S.FORE, project_id: PJ, stage_id: stageId, due_date: day(-1) });
  for (const who of ['DES', 'FORE', 'ACC']) {
    eq((await T('POST', { title: 'Сам собі' }, who)).status, 403, who + ' POST');
    eq((await T('PATCH', { bulk: { ids: [T3], done: true } }, who)).status, 403, who + ' bulk');
    eq((await call(env, 'DELETE', '/api/admin/tasks?id=' + T3, { cookie: ck[who] })).status, 403, who + ' DELETE');
  }
  eq((await T('PATCH', { id: T3, title: 'Інша назва' }, 'FORE')).status, 403, 'виконавець не править свою задачу');
  eq((await q1('SELECT title FROM tasks WHERE id = ?', T3)).title, 'Замовити плитку');
  eq((await call(env, 'GET', '/api/admin/tasks')).status, 401);
  for (const path of ['/api/admin/tasks', '/api/team/tasks']) eq((await call(env, 'GET', path, { cookie: ck.CL })).status, 403, path);
  eq((await call(env, 'PATCH', '/api/team/tasks', { cookie: ck.CL, body: { id: T3, done: true } })).status, 403);
});
await it('працівник бачить лише задачі, призначені йому (і в /api/admin/tasks, і в /api/team/tasks); чужу не відмітить — 404', async () => {
  for (const path of ['/api/admin/tasks?view=any', '/api/team/tasks?view=any']) {
    const r = await call(env, 'GET', path, { cookie: ck.FORE, headers: { 'x-test-now': NOON.toISOString() } });
    eq(r.status, 200); eq(r.data.rows.filter(x => x.src === 't').map(x => x.id), [T3], path);
    eq(r.data.can.manage, false); ok(!r.data.staff, 'список працівників — лише тим, хто призначає');
  }
  eq((await rowsOf('view=any&assignee=' + S.DES, 'FORE')).length, 0, 'фільтр за чужим виконавцем нічого не відкриває');
  eq((await rowsOf('view=all', 'ACC')).length, 0);
  for (const who of ['FORE', 'ACC']) eq((await T('PATCH', { id: T2, done: true }, who)).status, 404, who);
  eq((await q1('SELECT status FROM tasks WHERE id = ?', T2)).status, 'open');
  eq((await T('PATCH', { id: 999999, done: true })).status, 404);
});

describe('Задачі: «виконано», коментар, скасування, сповіщення автору');
await it('дизайнерка відмічає «виконано» з коментарем → статус, хто й коли; автору (власнику) — Telegram з коментарем; повтор нічого не змінює', async () => {
  bot.reset();
  const r = await call(env, 'PATCH', '/api/team/tasks', { cookie: ck.DES, body: { id: T2, done: true, note: 'Надіслала <i>два</i> варіанти' }, headers: { 'x-test-now': NOON.toISOString() } });
  eq(r.status, 200); eq(r.data.changed, true); eq([r.data.task.status, r.data.task.done_by_name, r.data.task.done_note], ['done', 'Дизайнерка Тест', 'Надіслала <i>два</i> варіанти']);
  const t = await q1('SELECT * FROM tasks WHERE id = ?', T2);
  eq([t.status, t.done_by, t.done_note, t.done_notified], ['done', S.DES, 'Надіслала <i>два</i> варіанти', 1]); ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(t.done_at));
  const m = tg(111);
  eq(m.length, 1); ok(/Задачу виконано/.test(m[0].text) && /Виконав\(ла\): Дизайнерка Тест/.test(m[0].text) && /&lt;i&gt;два&lt;\/i&gt;/.test(m[0].text), m[0].text);
  eq(m[0].reply_markup.inline_keyboard.at(-1)[0].url, 'https://cas-develop.com/kabinet/admin#tasks', 'власнику — посилання в панель');
  const again = await T('PATCH', { id: T2, done: true, note: 'ще раз' }, 'DES');
  eq([again.status, again.data.changed], [200, false]); eq(tg(111).length, 1, 'друге сповіщення не йде');
  eq((await q1('SELECT done_note FROM tasks WHERE id = ?', T2)).done_note, 'Надіслала <i>два</i> варіанти', 'коментар не перезаписано');
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.done' AND entity_id = ?", String(T2)));
});
await it('«скасувати» — повернути в роботу: статус open, позначки виконання очищено; свою задачу, виконану собі, — без сповіщень', async () => {
  bot.reset();
  const r = await T('PATCH', { id: T2, done: false }, 'DES');
  eq([r.status, r.data.changed, r.data.task.status], [200, true, 'open']);
  const t = await q1('SELECT status, done_by, done_at, done_note FROM tasks WHERE id = ?', T2);
  eq([t.status, t.done_by, t.done_at, t.done_note], ['open', null, null, null]);
  eq((await T('PATCH', { id: T1, done: true })).data.changed, true); eq((await T('PATCH', { id: T1, done: false })).data.changed, true);
  eq(bot.calls.length, 0);
});
await it('менеджер скасовує задачу (status: cancelled) і відновлює; «виконано» через правку ставить, хто й коли; видалення — в аудит', async () => {
  const id = await mk({ title: 'Тимчасова' });
  let r = await T('PATCH', { id, status: 'cancelled' });
  eq([r.status, r.data.task.status], [200, 'cancelled']);
  ok(!(await rowsOf('view=all')).some(x => x.id === id) && (await rowsOf('view=done')).some(x => x.id === id), 'скасована — не серед відкритих');
  eq((await T('PATCH', { id, status: 'nope' })).status, 422);
  r = await T('PATCH', { id, status: 'done' });
  const t = await q1('SELECT status, done_by, done_at FROM tasks WHERE id = ?', id);
  eq([t.status, t.done_by, !!t.done_at], ['done', S.MGR, true]);
  eq((await T('PATCH', { id, done: false })).data.task.status, 'open');
  eq((await call(env, 'DELETE', '/api/admin/tasks?id=' + id, { cookie: ck.MGR })).status, 200);
  ok(!await q1('SELECT 1 FROM tasks WHERE id = ?', id)); ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.delete' AND entity_id = ?", String(id)));
  eq((await call(env, 'DELETE', '/api/admin/tasks?id=p1', { cookie: ck.MGR })).status, 400, 'задачі етапів звідси не видаляються');
});

describe('Задачі: прострочені, перемикачі, фільтри');
let V = {};
await it('«Мої / Усі / Прострочені / Сьогодні / Тиждень / Виконані» і лічильники; строк з часом сьогодні прострочується після цього часу', async () => {
  V.late = await mk({ title: 'Прострочена позавчора', due_date: day(-2), assignee_staff_id: S.DES });
  V.today = await mk({ title: 'Сьогодні без часу', due_date: TODAY });
  V.todayAm = await mk({ title: 'Сьогодні о 09:00', due_date: TODAY, due_time: '09:00' });
  V.todayPm = await mk({ title: 'Сьогодні о 18:00', due_date: TODAY, due_time: '18:00', priority: 'high' });
  V.week = await mk({ title: 'За 5 днів', due_date: day(5) });
  V.far = await mk({ title: 'За 20 днів', due_date: day(20) });
  V.none = await mk({ title: 'Без строку, без виконавця', assignee_staff_id: null });
  V.done = await mk({ title: 'Уже зроблена' }); await T('PATCH', { id: V.done, done: true });
  const ids = async (qs, who) => (await rowsOf(qs, who)).filter(x => x.src === 't').map(x => x.id);
  const d = (await list('view=overdue')).data;
  eq(d.rows.map(x => x.id), [V.late, T3, V.todayAm], 'прострочені: за датою, потім за часом');
  ok(d.rows.every(x => x.overdue)); eq(d.today, TODAY);
  eq(await ids('view=today'), [V.todayAm, V.todayPm, V.today], 'сьогодні: з часом — раніше, без часу — в кінці');
  eq(await ids('view=week'), [V.todayAm, V.todayPm, V.today, T2, V.week], 'сьогодні + 6 днів');
  eq(await ids('view=done'), [V.done]);
  ok(!(await ids('view=all')).includes(V.done) && (await ids('view=all')).includes(V.far));
  const all = await ids('view=all');
  ok(all.indexOf(V.late) < all.indexOf(V.today) && all.indexOf(V.far) < all.indexOf(V.none), 'за строком, без строку — в кінці');
  const mine = await ids('view=mine');
  ok(mine.includes(V.today) && !mine.includes(V.late) && !mine.includes(V.none), '«Мої» — лише призначені мені');
  eq([d.counts.overdue, d.counts.today, d.counts.week, d.counts.done], [3, 3, 5, 1]); eq(d.counts.all, all.length); eq(d.counts.mine, mine.length);
  ok(!(await rowsOf('view=overdue', 'MGR', at(TODAY, 8))).some(x => x.id === V.todayAm), 'о 08:00 задача на 09:00 ще не прострочена');
  const c = (await list('count=1')).data; eq([c.overdue, c.mine], [3, mine.length], 'лічильник вкладки');
  eq((await list('count=1', 'FORE')).data.overdue, 1, 'працівникові — лише свої прострочені');
});
await it('фільтри: виконавець (і «без виконавця»), привʼязка, пошук, «важливі»; сторінки limit / offset', async () => {
  const ids = async qs => (await rowsOf(qs)).filter(x => x.src === 't').map(x => x.id);
  eq(await ids('view=all&assignee=' + S.DES), [V.late, T2]);
  eq(await ids('view=all&assignee=none'), [V.none]);
  eq(await ids('view=all&link=lead'), [T2]); eq(await ids('view=all&link=project'), [T3]);
  ok((await ids('view=all&link=none')).includes(V.today) && !(await ids('view=all&link=none')).includes(T2));
  eq(await ids('view=all&order_id=' + LD), [T2]); eq(await ids('view=any&project_id=' + PJ), [T3]);
  eq(await ids('view=all&q=' + encodeURIComponent('18:00')), [V.todayPm]); eq(await ids('view=all&q=' + encodeURIComponent('100%_')), []);
  eq(await ids('view=all&priority=high'), [V.todayPm, T2]);
  const p1 = (await list('view=all&limit=3')).data, p2 = (await list('view=all&limit=3&offset=3')).data;
  eq([p1.rows.length, p1.more, p2.rows.length], [3, true, 3]); ok(!p1.rows.some(a => p2.rows.some(b => a.key === b.key)), 'сторінки не перетинаються');
});

describe('Задачі: привʼязки й що з них бачить працівник');
await it('менеджер бачить назву обʼєкта з етапом, заявку з телефоном, контакт; блок «Задачі» картки — ?view=any&order_id / project_id / contact_id', async () => {
  const a = await mk({ title: 'Уточнити строки вікон', contact_id: CT2, project_id: PJ2, assignee_staff_id: S.FORE });
  V.cross = a;
  const t3 = (await rowsOf('view=any&project_id=' + PJ)).find(x => x.id === T3);
  eq([t3.project.title, t3.project.stage_name, t3.stage_id], ['Квартира на Тестовій', 'Чорнові', stageId]);
  const t2 = (await rowsOf('view=any&order_id=' + LD)).find(x => x.id === T2);
  ok(t2.order.number && t2.order.name === 'Заявка дизайнерки' && /8001$/.test(t2.order.phone.replace(/\D/g, '')), JSON.stringify(t2.order));
  const tc = (await rowsOf('view=any&contact_id=' + CT2))[0];
  eq([tc.id, tc.contact.company, tc.project.title], [a, 'ТОВ «Вигадані вікна»', 'Чужий дизайн-проєкт']); ok(!tc.link_hidden);
});
await it('прораб: свій обʼєкт — з назвою; чужий обʼєкт і чужий контакт — без назв і id (link_hidden); контакт свого обʼєкта — видно', async () => {
  const mine = await rowsOf('view=any', 'FORE');
  const t3 = mine.find(x => x.id === T3), cross = mine.find(x => x.id === V.cross);
  eq(t3.project.title, 'Квартира на Тестовій');
  eq([cross.project, cross.project_id, cross.contact, cross.contact_id, cross.link_hidden], [undefined, undefined, undefined, undefined, true]);
  ok(!JSON.stringify(cross).includes('Чужий') && !JSON.stringify(cross).includes('Вигадані'), 'жодної назви чужого обʼєкта чи контакту');
  const own = await mk({ title: 'Домовитись про плитку', contact_id: CT, assignee_staff_id: S.FORE });
  const r = (await rowsOf('view=any', 'FORE')).find(x => x.id === own);
  eq([r.contact.name, r.contact.phone], ['Плиточник Тестовий', '+380670008101'], 'контакт привʼязано до його обʼєкта (contacts.linked) + clients.contacts');
});
await it('дизайнерка бачить свою заявку, а чужу — ні; бухгалтер (без контактів) не бачить ні контакту, ні телефонів', async () => {
  const other = await mk({ title: 'Задача з чужою заявкою', order_id: LD2, assignee_staff_id: S.DES });
  const rows = await rowsOf('view=any', 'DES');
  ok(rows.find(x => x.id === T2).order.name === 'Заявка дизайнерки');
  const o = rows.find(x => x.id === other); eq([o.order, o.order_id, o.link_hidden], [undefined, undefined, true]);
  const acc = await mk({ title: 'Звірити рахунок постачальника', contact_id: CT, project_id: PJ, assignee_staff_id: S.ACC });
  const r = (await rowsOf('view=any', 'ACC')).find(x => x.id === acc);
  eq([r.contact, r.link_hidden, r.project.title], [undefined, true, 'Квартира на Тестовій'], 'бухгалтер бачить усі обʼєкти, але не контакти');
  ok(!/\+380/.test(JSON.stringify(await rowsOf('view=any', 'ACC'))), 'жодного телефону');
});

describe('Задачі: версії (одночасне редагування)');
await it('правка зі старою версією → 409 {conflict, task, last} без змін; зі свіжою — збережено; «виконано» теж змінює версію', async () => {
  const id = await mk({ title: 'Версії', due_date: day(3) });
  const v0 = (await rowsOf('view=all')).find(x => x.id === id).ver;
  ok(/^[0-9a-f]{16}$/.test(v0));
  eq((await T('PATCH', { id, ver: v0, due_date: day(4) }, 'OWNER')).status, 200); // власник переніс строк
  const r = await T('PATCH', { id, ver: v0, title: 'Версії (правка менеджера)' });
  eq(r.status, 409); eq([r.data.conflict, r.data.error], [true, 'Задачу змінили, поки ви редагували']);
  eq([r.data.task.due_date, r.data.task.title], [day(4), 'Версії']); eq([r.data.last.by, r.data.last.what], ['Власник', 'змінено задачу']);
  eq((await q1('SELECT title FROM tasks WHERE id = ?', id)).title, 'Версії', 'нічого не записано');
  const r2 = await T('PATCH', { id, ver: r.data.task.ver, title: 'Версії (правка менеджера)' });
  eq([r2.status, r2.data.task.title, r2.data.task.due_date], [200, 'Версії (правка менеджера)', day(4)]);
  await T('PATCH', { id, done: true }, 'OWNER');
  const r3 = await T('PATCH', { id, ver: r2.data.task.ver, note: 'після виконання' });
  eq(r3.status, 409); eq(r3.data.last.what, 'задачу виконано');
  eq((await T('PATCH', { id, title: 'Без версії — як дія одним полем' })).status, 200);
});
await it('перепризначення: новому виконавцю — Telegram; собі — ні; незмінена форма нічого не пише', async () => {
  bot.reset();
  const id = await mk({ title: 'Перепризначити' });
  const n0 = (await q1("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'tasks' AND entity_id = ?", String(id))).n;
  eq((await T('PATCH', { id, title: 'Перепризначити' })).data.changed, false);
  eq((await q1("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'tasks' AND entity_id = ?", String(id))).n, n0);
  await T('PATCH', { id, assignee_staff_id: S.FORE });
  eq(tg(555).length, 1); ok(/Перепризначити/.test(tg(555)[0].text));
  await T('PATCH', { id, assignee_staff_id: S.MGR }); eq(tg(222).length, 0);
});

describe('Задачі етапів обʼєкта у спільному списку (project_tasks лишаються у своїй таблиці)');
let PT1, PT2;
await it('задачі етапів видно поруч із загальними (src p), з назвою обʼєкта й етапу; дані в project_tasks не змінюються', async () => {
  PT1 = (await P({ type: 'task', project_id: PJ, title: 'Погодити розкладку плитки', stage_id: stageId, staff_id: S.FORE, due_date: day(-3) })).data.id;
  PT2 = (await P({ type: 'task', project_id: PJ2, title: 'Зібрати бриф', staff_id: S.DES, due_date: day(2) })).data.id;
  const rows = await rowsOf('view=all');
  const a = rows.find(x => x.key === 'p' + PT1), b = rows.find(x => x.key === 'p' + PT2);
  eq([a.src, a.title, a.status, a.overdue, a.assignee_name, a.project.title, a.project.stage_name], ['p', 'Погодити розкладку плитки', 'open', true, 'Прораб Тест', 'Квартира на Тестовій', 'Чорнові']);
  ok(b && a.can.done && a.can.edit && !a.ver, 'версії в задач етапів немає');
  eq(rows[0].key, 'p' + PT1, 'найдавніший строк — першим, незалежно від таблиці');
  ok((await rowsOf('view=overdue')).some(x => x.key === 'p' + PT1));
  eq((await rowsOf('view=any', 'FORE')).filter(x => x.src === 'p').map(x => x.id), [PT1], 'працівник — лише свої задачі етапів');
});
await it('«виконано» зі спільного списку: прораб — свою (project_tasks.done = 1, аудит task.done), чужу — 403; менеджер — будь-яку й назад', async () => {
  eq((await T('PATCH', { id: 'p' + PT2, done: true }, 'FORE')).status, 404, 'чужий обʼєкт — не видно');
  await DB.prepare('INSERT OR IGNORE INTO project_staff (project_id, staff_id, task) VALUES (?, ?, ?)').bind(PJ2, S.FORE, 'тест').run();
  eq((await T('PATCH', { id: 'p' + PT2, done: true }, 'FORE')).status, 403, 'обʼєкт видно, але задача іншого працівника');
  await DB.prepare('DELETE FROM project_staff WHERE project_id = ? AND staff_id = ?').bind(PJ2, S.FORE).run();
  const r = await call(env, 'PATCH', '/api/team/tasks', { cookie: ck.FORE, body: { id: 'p' + PT1, done: true } });
  eq([r.status, r.data.changed], [200, true]);
  const t = await q1('SELECT done, done_by, done_at FROM project_tasks WHERE id = ?', PT1);
  eq([t.done, t.done_by, !!t.done_at], [1, S.FORE, true]); ok(await q1("SELECT 1 FROM audit_log WHERE action = 'task.done' AND entity = 'projects' AND entity_id = ?", String(PJ)));
  eq((await T('PATCH', { id: 'p' + PT1, done: true }, 'FORE')).data.changed, false);
  eq((await T('PATCH', { id: 'p' + PT1, done: false })).data.changed, true);
  eq((await q1('SELECT done, done_at FROM project_tasks WHERE id = ?', PT1)).done_at, null);
  // картка обʼєкта бачить ту саму задачу, як і раніше
  const g = (await call(env, 'GET', '/api/admin/projects', { cookie: ck.MGR })).data.tasks.find(x => x.id === PT1);
  eq([g.title, g.done], ['Погодити розкладку плитки', 0]);
});
await it('дата й виконавець задачі етапу зі списку (projects.edit): новий виконавець — у команді обʼєкта; інші поля не чіпаємо', async () => {
  const r = await T('PATCH', { id: 'p' + PT2, due_date: day(6), assignee_staff_id: S.FORE });
  eq([r.status, r.data.changed], [200, true]);
  const t = await q1('SELECT due_date, staff_id, title, stage_id FROM project_tasks WHERE id = ?', PT2);
  eq([t.due_date, t.staff_id, t.title], [day(6), S.FORE, 'Зібрати бриф']);
  ok(await q1('SELECT 1 FROM project_staff WHERE project_id = ? AND staff_id = ?', PJ2, S.FORE), 'виконавець бачить обʼєкт');
  eq((await T('PATCH', { id: 'p' + PT2, due_date: 'завтра' })).status, 422);
  eq((await T('PATCH', { id: 'p' + PT2, due_date: day(1) }, 'FORE')).status, 403, 'працівник дату не переносить');
  eq((await T('PATCH', { id: 'p999999', done: true })).status, 404);
});

describe('Задачі: масові дії');
await it('виконано / перенести дату / змінити виконавця — для загальних і задач етапів разом; підсумок changed / skipped; аудит', async () => {
  bot.reset();
  const a = await mk({ title: 'Масова А' }), b = await mk({ title: 'Масова Б', due_date: day(1) });
  let r = await T('PATCH', { bulk: { ids: [a, b, 'p' + PT1, 987654], due_date: day(9) } });
  eq([r.status, r.data.changed, r.data.skipped], [200, 3, 1]);
  eq((await qa('SELECT due_date FROM tasks WHERE id IN (?, ?)', a, b)).map(x => x.due_date), [day(9), day(9)]);
  eq((await q1('SELECT due_date FROM project_tasks WHERE id = ?', PT1)).due_date, day(9));
  r = await T('PATCH', { bulk: { ids: [a, b], assignee_staff_id: S.DES } });
  eq(r.data.changed, 2); eq(tg(444).length, 2, 'кожна призначена задача — сповіщення виконавцю');
  r = await T('PATCH', { bulk: { ids: [a, b, 'p' + PT1], done: true } });
  eq([r.data.changed, r.data.skipped], [3, 0]);
  eq((await T('PATCH', { bulk: { ids: [a, b], done: true } })).data, { ok: true, changed: 0, skipped: 2 }, 'повтор нічого не змінює');
  eq((await T('PATCH', { bulk: { ids: [a], due_date: day(1) } })).data.changed, 0, 'виконані не переносяться');
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.bulk'"));
  await T('PATCH', { bulk: { ids: ['p' + PT1], done: false } });
});
await it('межі: понад 100, порожній список, дві дії, зла дата чи працівник — помилка без часткових змін', async () => {
  const a = await mk({ title: 'Межі' });
  eq((await T('PATCH', { bulk: { ids: Array.from({ length: 101 }, (_, i) => i + 1), done: true } })).status, 400);
  eq((await T('PATCH', { bulk: { ids: [], done: true } })).status, 400);
  eq((await T('PATCH', { bulk: { ids: [a], done: true, due_date: day(1) } })).status, 400);
  eq((await T('PATCH', { bulk: { ids: [a, 'x1'], done: true } })).status, 400);
  eq((await T('PATCH', { bulk: { ids: [a], due_date: '31.12.2026' } })).status, 422);
  eq((await T('PATCH', { bulk: { ids: [a], assignee_staff_id: 424242 } })).status, 422);
  const t = await q1('SELECT status, due_date, assignee_staff_id FROM tasks WHERE id = ?', a);
  eq([t.status, t.due_date, t.assignee_staff_id], ['open', null, S.MGR]);
});

describe('Задачі: ліміти записів (STAFF_LIMITS)');
const fill = async (kind, cid, n = STAFF_LIMITS[kind]) => {
  const st = await q1('SELECT id FROM staff WHERE client_id = ?', cid), x = { staffId: st.id, client: { id: cid } }, req = new Request('https://cas-develop.com/x');
  await DB.prepare('DELETE FROM rate_hits WHERE bucket = ?').bind('staff-' + kind).run();
  for (let i = 0; i < n; i++) if (await limited(env, req, 'staff-' + kind, STAFF_LIMITS[kind], 3600, false, staffKey(x))) throw new Error('ліміт спрацював зарано: ' + i);
};
await it('600 записів задач на годину на працівника, далі 429 (створення, «виконано», правка); інший працівник не зачеплений; масові — 60', async () => {
  eq([STAFF_LIMITS.tasks, STAFF_LIMITS.import, STAFF_LIMITS.bulk], [600, 120, 60]);
  const id = await mk({ title: 'Ліміт', assignee_staff_id: S.DES });
  await fill('tasks', MGR, STAFF_LIMITS.tasks - 1);
  eq((await T('PATCH', { id, note: 'остання дозволена' })).status, 200);
  for (const [m, b] of [['POST', { title: 'понад ліміт' }], ['PATCH', { id, done: true }], ['PATCH', { id, note: 'x' }]]) { const r = await T(m, b); eq(r.status, 429); eq(r.data.error, 'Забагато змін поспіль — зачекайте кілька хвилин'); }
  eq((await call(env, 'DELETE', '/api/admin/tasks?id=' + id, { cookie: ck.MGR })).status, 429);
  eq((await T('PATCH', { id, done: true }, 'DES')).status, 200, 'ліміт — на акаунт, не на IP');
  eq((await list('view=all')).status, 200, 'читання ліміт не чіпає');
  await fill('bulk', MGR);
  eq((await T('PATCH', { bulk: { ids: [id], done: false } })).status, 429);
  await DB.prepare("DELETE FROM rate_hits WHERE bucket LIKE 'staff-%'").run();
});

describe('Сповіщення: робочі години, черга, ранкове зведення (мок Telegram)');
await it('призначено о 23:30 → тиша, сповіщення в черзі; перший прохід розкладу після 10:00 надсилає його один раз', async () => {
  await DB.prepare("UPDATE tasks SET status = 'cancelled' WHERE status = 'open'").run(); await DB.prepare('UPDATE project_tasks SET done = 1').run(); // чистий аркуш для зведень
  bot.reset();
  const a = await mk({ title: 'Нічна задача 1', assignee_staff_id: S.FORE, due_date: day(3) }, 'MGR', NIGHT), b = await mk({ title: 'Нічна задача 2', assignee_staff_id: S.FORE, priority: 'high' }, 'MGR', NIGHT);
  eq(bot.calls.length, 0, 'уночі бот мовчить');
  eq((await qa('SELECT assign_notified FROM tasks WHERE id IN (?, ?)', a, b)).map(x => x.assign_notified), [0, 0]);
  eq((await runTaskNotices(env, at(day(1), 9, 55))).quiet, true); eq(bot.calls.length, 0, 'о 09:55 ще рано');
  const r = await runTaskNotices(env, at(day(1), 10, 5));
  eq([r.assigned, r.done], [1, 0]);
  const m = tg(555); eq(m.length, 1); ok(/Вам призначено задач: 2/.test(m[0].text) && /Нічна задача 1/.test(m[0].text) && /❗ Нічна задача 2/.test(m[0].text), m[0].text);
  eq((await runTaskNotices(env, at(day(1), 10, 10))).assigned, 0); eq(tg(555).length, 1, 'удруге не надсилається');
});
await it('виконано о 23:30 → автору вранці; повернули в роботу до ранку → сповіщення не йде', async () => {
  bot.reset();
  const a = await mk({ title: 'Зробити вночі', assignee_staff_id: S.FORE }), b = await mk({ title: 'Зробили й повернули', assignee_staff_id: S.FORE });
  bot.reset();
  await T('PATCH', { id: a, done: true, note: 'готово' }, 'FORE', NIGHT); await T('PATCH', { id: b, done: true }, 'FORE', NIGHT); await T('PATCH', { id: b, done: false }, 'FORE', NIGHT);
  eq(bot.calls.length, 0);
  const r = await runTaskNotices(env, at(day(1), 11));
  eq(r.done, 1); const m = tg(222); eq(m.length, 1); ok(/Задачу виконано/.test(m[0].text) && /Зробити вночі/.test(m[0].text) && !/повернули/.test(m[0].text));
  eq((await runTaskNotices(env, at(day(1), 11, 5))).done, 0);
});
await it('зведення «сьогодні й прострочені»: раз на день на людину, лише тим, у кого є що робити; задачі етапів теж; без Telegram — без помилки', async () => {
  await DB.prepare("UPDATE tasks SET status = 'cancelled' WHERE status = 'open'").run(); await DB.prepare('DELETE FROM task_digest').run();
  const MON = '2026-11-23', TUE = '2026-11-24', SAT = '2026-11-28', SUN = '2026-11-29';
  const ins = (title, sid, due, time, pr = 'normal') => DB.prepare('INSERT INTO tasks (title, assignee_staff_id, created_by, due_date, due_time, priority) VALUES (?, ?, ?, ?, ?, ?)').bind(title, sid, S.MGR, due, time || null, pr).run();
  await ins('Здати креслення <script>', S.DES, MON, '15:00', 'high'); await ins('Подзвонити клієнту', S.DES, MON); await ins('Стара задача', S.DES, '2026-11-19');
  await ins('Майбутня', S.DES, TUE); await ins('Прорабу на вівторок', S.FORE, TUE); await ins('Мебляру без Telegram', S.NOTG, MON); await ins('Без строку', S.ACC, null);
  await DB.prepare('INSERT INTO project_tasks (project_id, title, staff_id, due_date) VALUES (?, ?, ?, ?)').bind(PJ, 'Задача етапу: прийняти плитку', S.DES, MON).run();
  bot.reset();
  eq((await runTaskNotices(env, at(MON, 9, 30))).quiet, true);
  const r = await runTaskNotices(env, at(MON, 10, 2));
  eq(r.digests, 1, 'лише дизайнерці: у прораба на сьогодні нічого, мебляр без Telegram');
  const m = tg(444); eq(m.length, 1);
  ok(/Задачі на сьогодні, 23\.11/.test(m[0].text) && /Сьогодні \(3\)/.test(m[0].text) && /Прострочені \(1\)/.test(m[0].text), m[0].text);
  ok(/❗ Здати креслення &lt;script&gt; — 15:00/.test(m[0].text) && /Задача етапу: прийняти плитку/.test(m[0].text) && /Стара задача — з 19\.11/.test(m[0].text) && !/Майбутня/.test(m[0].text), m[0].text);
  eq((await q1('SELECT day FROM task_digest WHERE staff_id = ?', S.NOTG)).day, MON, 'без Telegram: позначено, помилки немає');
  ok(!await q1('SELECT 1 FROM task_digest WHERE staff_id = ?', S.ACC), 'задача без строку у зведення не потрапляє');
  for (const h of [10, 13, 19]) await runTaskNotices(env, at(MON, h, 30));
  eq(tg(444).length, 1, 'не частіше одного зведення на день');
  eq((await runTaskNotices(env, at(MON, 20, 5))).quiet, true);
  const tue = await runTaskNotices(env, at(TUE, 10, 0));
  eq(tue.digests, 2); ok(/Прорабу на вівторок/.test(tg(555)[0].text)); ok(/Прострочені \(4\)/.test(tg(444)[1].text) && /Сьогодні \(1\)/.test(tg(444)[1].text));
  // вихідні: лише тим, у кого строк саме сьогодні
  await ins('Суботня задача', S.FORE, SAT);
  bot.reset();
  eq((await runTaskNotices(env, at(SAT, 10, 0))).digests, 1); eq(tg(555).length, 1); eq(tg(444).length, 0, 'прострочені у вихідний не нагадуємо');
  eq((await runTaskNotices(env, at(SUN, 12, 0))).digests, 0);
});
await it('розклад /api/admin/lead-sla викликає прохід задач; вимкнений працівник зведень не отримує', async () => {
  await DB.prepare('DELETE FROM task_digest').run(); await DB.prepare('UPDATE staff SET active = 0 WHERE id = ?').bind(S.DES).run();
  bot.reset();
  const r = await sla(at('2026-11-30', 10, 30));
  eq(r.status, 200); ok(r.data.tasks && r.data.tasks.digests >= 1, JSON.stringify(r.data.tasks));
  eq(tg(444).length, 0); ok(tg(555).length === 1);
  eq((await sla(at('2026-11-30', 22, 30))).data.tasks, { quiet: true });
  await DB.prepare('UPDATE staff SET active = 1 WHERE id = ?').bind(S.DES).run();
});

describe('Кабінет працівника: «Мої задачі» (/api/team/today, /api/team/tasks)');
await it('today віддає todo (мої відкриті) і todo_done, у «Сьогодні» — kind todo (прострочена — urgent); після «виконано» зникає', async () => {
  await DB.prepare("UPDATE tasks SET status = 'cancelled' WHERE status = 'open'").run();
  const a = await mk({ title: 'Заміряти нішу', assignee_staff_id: S.FORE, due_date: day(-1), project_id: PJ }), b = await mk({ title: 'Без строку прорабу', assignee_staff_id: S.FORE });
  await mk({ title: 'Не прорабу', assignee_staff_id: S.DES });
  const d = (await call(env, 'GET', '/api/team/today', { cookie: ck.FORE })).data;
  eq(d.todo.map(x => x.id), [a, b]); ok(d.todo[0].overdue && d.todo[0].project.title === 'Квартира на Тестовій');
  const k = d.tasks.filter(x => x.kind === 'todo');
  eq(k.map(x => [x.todo_id, x.urgent, x.sub]), [[a, true, 'Квартира на Тестовій'], [b, false, '']]);
  ok(d.me.perms.includes('tasks.own') && !d.me.perms.includes('tasks.manage'));
  await call(env, 'PATCH', '/api/team/tasks', { cookie: ck.FORE, body: { id: a, done: true, note: 'Ніша 62 см' } });
  const d2 = (await call(env, 'GET', '/api/team/today', { cookie: ck.FORE })).data;
  eq(d2.todo.map(x => x.id), [b]); eq([d2.todo_done[0].id, d2.todo_done[0].done_note], [a, 'Ніша 62 см']);
  ok(!d2.tasks.some(x => x.kind === 'todo' && x.todo_id === a));
});

describe('До міграції 0018: старий стан бази не ламається');
await it('без таблиці tasks: «Задачі» → 503, кабінет працівника, розклад і довідник контактів працюють як раніше', async () => {
  const e0 = makeEnv(freshDB(17), { ALERTS_TEST_CLOCK: '1' });
  const o = await addClient(e0, { id: 111, name: 'Власник' }), c0 = await login(e0, o);
  await call(e0, 'GET', '/api/me', { cookie: c0 });
  for (const [m, b] of [['GET'], ['POST', { title: 'x' }], ['PATCH', { id: 1, done: true }]]) eq((await call(e0, m, '/api/admin/tasks', { cookie: c0, body: b })).status, 503, m);
  eq((await call(e0, 'GET', '/api/admin/tasks?count=1', { cookie: c0 })).status, 503);
  const t = await call(e0, 'GET', '/api/team/today', { cookie: c0 }); eq(t.status, 200); eq(t.data.todo, []);
  const s = await call(e0, 'POST', '/api/admin/lead-sla', { body: { now: at('2026-11-23', 11).toISOString() }, headers: { 'x-lead-key': 'lead-key', noOrigin: true } });
  eq(s.status, 200); eq(s.data.tasks, { pending: true });
  eq((await call(e0, 'POST', '/api/admin/partners', { cookie: c0, body: { name: 'Контакт до міграції', phone: '0670000001' } })).status, 200);
  const l = await call(e0, 'GET', '/api/admin/partners?sort=open_tasks&dir=desc&facets=1&ver=1', { cookie: c0 });
  eq(l.status, 200); eq([l.data.rows.length, l.data.rows[0].open_tasks, l.data.archive, l.data.archived_count], [1, 0, false, 0]);
  eq((await call(e0, 'PATCH', '/api/admin/partners', { cookie: c0, body: { id: l.data.rows[0].id, archived: true } })).status, 503);
  eq((await call(e0, 'PATCH', '/api/admin/partners', { cookie: c0, body: { bulk: { ids: [l.data.rows[0].id], archive: true } } })).status, 503);
  eq((await call(e0, 'GET', '/api/admin/partners?find=Контакт', { cookie: c0 })).data.rows.length, 1);
});

// ===================== контакти: таблиця =====================
const K = (qs = '', who = 'MGR') => call(env, 'GET', '/api/admin/partners' + (qs ? '?' + qs : ''), { cookie: ck[who] });
const KP = (body, who = 'MGR') => call(env, 'PATCH', '/api/admin/partners', { cookie: ck[who], body });
const names = d => d.rows.map(r => r.name || r.company);
describe('Контакти: таблиця — сортування, сторінки, лічильники, колонки');
let CN = {};
await it('колонки таблиці: привʼязки, відкриті задачі, остання взаємодія; версія для правки клітинки; лічильники типів', async () => {
  for (const [k, b] of Object.entries({
    a: { name: 'Андрій Тестовий', type: 'crew', city: 'Київ', phone: '0670009001', tags: ['гіпсокартон'], rating: 5 },
    b: { name: 'Богдана Вигадана', company: 'ФОП Вигадана', type: 'supplier', city: 'Одеса', tg: '@bohdana_test', tags: ['плитка', 'сантехніка'], rating: 3 },
    c: { company: 'Яворів Буд (тест)', type: 'contractor', city: 'Львів', email: 'yavoriv@example.com' },
    d: { name: 'Єва Тестова', type: 'client', phone: '+380 50 000 90 04' },
  })) CN[k] = (await C(b)).data.id;
  await mk({ title: 'Запитати ціну', contact_id: CN.b }); await mk({ title: 'Запитати строки', contact_id: CN.b }); const dn = await mk({ title: 'Закрита', contact_id: CN.b }); await T('PATCH', { id: dn, done: true });
  await C({ action: 'link', contact_id: CN.a, project_id: PJ2, role: 'Гіпсокартон' }); await C({ action: 'link', contact_id: CN.a, order_id: LD });
  const d = (await K('ver=1&facets=1')).data;
  const a = d.rows.find(r => r.id === CN.a), b = d.rows.find(r => r.id === CN.b);
  eq([a.n_projects, a.n_leads, a.open_tasks, b.open_tasks, b.n_projects], [1, 1, 0, 2, 0]);
  ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(a.last_touch) && /^[0-9a-f]{16}$/.test(a.ver) && !('n_links' in a) && !('company_key' in JSON.parse(JSON.stringify(a))));
  eq([d.type_counts.crew, d.type_counts.supplier >= 2, d.type_counts.client, d.total, d.more, d.archive], [1, true, 1, d.rows.length, false, true]);
  ok(d.cities.some(c => c.v === 'Київ' && c.n >= 2) && d.tags.some(t => t.v === 'плитка' && t.n >= 2), 'значення для фільтрів міста й спеціалізації');
  eq((await K('tag=' + encodeURIComponent('сантехніка'))).data.rows.map(r => r.id), [CN.b]);
});
await it('сортування по колонці (asc / desc), порожні — в кінці; невідома колонка — типовий порядок; сторінки limit / offset з total і more', async () => {
  const by = async (s, dir = 'asc') => (await K(`sort=${s}&dir=${dir}`)).data;
  const n1 = names(await by('name')), n2 = names(await by('name', 'desc'));
  eq(n1, n1.slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)), 'за назвою');
  eq(n2, n1.slice().reverse());
  eq((await by('open_tasks', 'desc')).rows[0].id, CN.b); eq((await by('links', 'desc')).rows[0].id, CN.a);
  eq((await by('rating', 'desc')).rows[0].id, CN.a);
  const em = (await by('email')).rows; ok(em[0].email && !em[em.length - 1].email, 'без пошти — в кінці');
  await DB.prepare("UPDATE tasks SET updated_at = datetime('now', '+1 hour') WHERE contact_id = ?").bind(CN.b).run();
  eq((await by('last_touch', 'desc')).rows[0].id, CN.b, 'остання взаємодія — задача з контактом');
  eq(names(await by('id; DROP TABLE partners')), names((await K()).data), 'чужий текст у sort ігнорується');
  const p1 = (await K('sort=name&limit=3')).data, p2 = (await K('sort=name&limit=3&offset=3')).data;
  eq([p1.rows.length, p1.more, p1.total], [3, true, n1.length]); eq(names(p1).concat(names(p2)), n1.slice(0, 6));
});
await it('список зі 150+ контактів віддається (без списків id у запиті: D1 приймає до 100 параметрів)', async () => {
  for (let i = 0; i < 150; i++) await DB.prepare("INSERT INTO partners (name, type, city, phone, tags) VALUES (?, 'other', 'Тестове місто', ?, '[]')").bind('Масовий ' + String(i).padStart(3, '0'), '+38067111' + String(1000 + i)).run();
  const d = (await K()).data; ok(d.rows.length >= 150 && d.total === d.rows.length);
  eq((await K('city=' + encodeURIComponent('Тестове місто') + '&limit=200&ver=1')).data.rows.length, 150);
});

describe('Контакти: правка клітинки, архів, масові дії');
await it('правка клітинки з версією: стара версія → 409 з карткою, свіжа → збережено; телефон нормалізується', async () => {
  const row = (await K('ver=1')).data.rows.find(r => r.id === CN.c);
  eq((await KP({ id: CN.c, ver: row.ver, city: 'Яворів' })).status, 200);
  const r = await KP({ id: CN.c, ver: row.ver, phone: '067 000 90 03' });
  eq(r.status, 409); eq([r.data.conflict, r.data.partner.city], [true, 'Яворів']);
  const r2 = await KP({ id: CN.c, ver: r.data.partner.ver, phone: '067 000 90 03' });
  eq([r2.status, r2.data.partner.phone, r2.data.partner.city], [200, '+380670009003', 'Яворів']);
  eq((await KP({ id: CN.c, phone: '12' })).status, 400, 'некоректний телефон');
  eq((await KP({ id: CN.c, phone: '0670009001' })).status, 409, 'номер іншого контакту');
});
await it('архів: контакт зникає зі списку, пошуку й лічильників, лишається в ?archived=1 і в картці; дубль — «уже є в архіві»; повернення', async () => {
  eq((await KP({ id: CN.d, archived: true })).data, { ok: true, archived: true });
  ok((await q1('SELECT archived_at FROM partners WHERE id = ?', CN.d)).archived_at);
  const d = (await K()).data;
  ok(!d.rows.some(r => r.id === CN.d)); eq([d.type_counts.client, d.archived_count], [undefined, 1]);
  eq((await K('find=' + encodeURIComponent('Єва'))).data.rows.length, 0);
  eq((await K('archived=1')).data.rows.map(r => r.id), [CN.d]);
  eq((await K('id=' + CN.d)).status, 200, 'картка архівного відкривається');
  const dup = await C({ name: 'Єва ще раз', phone: '050 000 90 04' });
  eq(dup.status, 409); ok(/в архіві/.test(dup.data.error) && dup.data.archived === true);
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.archive' AND entity_id = ?", String(CN.d)));
  eq((await KP({ id: CN.d, archived: false })).status, 200);
  ok((await K()).data.rows.some(r => r.id === CN.d)); ok(await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.restore' AND entity_id = ?", String(CN.d)));
  eq((await KP({ id: CN.d, archived: true }, 'DES')).status, 403);
});
await it('масові дії: тип, місто, архів — для вибраних; аудит кожної зміни; межі й права', async () => {
  let r = await KP({ bulk: { ids: [CN.a, CN.b, 999999], type: 'contractor' } });
  eq([r.status, r.data.changed, r.data.skipped], [200, 2, 1]);
  eq((await qa('SELECT type FROM partners WHERE id IN (?, ?)', CN.a, CN.b)).map(x => x.type), ['contractor', 'contractor']);
  r = await KP({ bulk: { ids: [CN.a, CN.b, CN.c], city: 'Київська обл.' } }); eq(r.data.changed, 3);
  eq((await KP({ bulk: { ids: [CN.a], city: 'Київська обл.' } })).data, { ok: true, changed: 0, skipped: 1 });
  r = await KP({ bulk: { ids: [CN.a, CN.b], archive: true } }); eq(r.data.changed, 2);
  ok(!(await K()).data.rows.some(x => [CN.a, CN.b].includes(x.id)));
  eq((await KP({ bulk: { ids: [CN.a, CN.b], archive: false } })).data.changed, 2);
  eq((await qa("SELECT 1 FROM audit_log WHERE action = 'pbase.update' AND entity_id = ?", String(CN.a))).length, 2, 'тип і місто — окремі записи');
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.bulk'"));
  ok(await q1('SELECT 1 FROM contact_links WHERE contact_id = ?', CN.a), 'звʼязки після архіву на місці');
  for (const b of [{ ids: [CN.a], type: 'nope' }, { ids: [CN.a], city: '<b>x</b>' }, { ids: [], type: 'crew' }, { ids: [CN.a], type: 'crew', city: 'x' }, { ids: Array.from({ length: 101 }, (_, i) => i + 1), archive: true }, { ids: ['1; DROP'], archive: true }])
    eq((await KP({ bulk: b })).status, 400, JSON.stringify(b).slice(0, 60));
  for (const who of ['DES', 'FORE', 'ACC']) eq((await KP({ bulk: { ids: [CN.a], archive: true } }, who)).status, 403, who);
});

describe('Контакти: імпорт CSV');
const IMP = (body, who = 'MGR') => call(env, 'POST', '/api/admin/partners', { cookie: ck[who], body: { action: 'import', ...body } });
await it('попередній перегляд (dry): нові, дублі з бази (телефон у будь-якому форматі, Telegram, пошта), дубль у файлі, помилки — нічого не записано', async () => {
  const n0 = (await q1('SELECT COUNT(*) AS n FROM partners')).n;
  const rows = [
    { name: 'Новий Електрик', type: 'Майстер', city: 'Київ', phone: '(067) 000-95-01', tags: 'електрика, щитки', notes: 'з імпорту', rating: '4' },
    { name: 'Дубль за телефоном', phone: '+38 (067) 000 90 01' },
    { name: 'Дубль за Telegram', tg: 'https://t.me/Bohdana_Test' },
    { name: 'Дубль за поштою', email: 'YAVORIV@example.com' },
    { name: 'Той самий у файлі', phone: '0670009501' },
    { name: 'Кривий телефон', phone: '12345' },
    { name: 'Розмітка <img src=x onerror=alert(1)>', phone: '0670009502' },
    { company: 'ТОВ «Новий постач»', type: 'supplier', email: 'new.supplier@example.com', status: 'Співпрацюємо' },
    {},
  ];
  const r = await IMP({ rows, dry: true, type: 'crew' });
  eq(r.status, 200); eq([r.data.dry, r.data.created, r.data.dups, r.data.errors], [true, 2, 4, 3]);
  eq(r.data.results.map(x => x.status), ['new', 'dup', 'dup', 'dup', 'dup', 'error', 'error', 'new', 'error']);
  eq([r.data.results[1].where, r.data.results[1].id, r.data.results[2].id, r.data.results[3].id, r.data.results[4].where, r.data.results[4].row], ['base', CN.a, CN.b, CN.c, 'file', 0]);
  ok(/phone/.test(r.data.results[5].error) && /HTML/.test(r.data.results[6].error));
  eq((await q1('SELECT COUNT(*) AS n FROM partners')).n, n0, 'dry нічого не пише');
  ok(!await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.import'"));
  V.rows = rows;
});
await it('імпорт: записано лише нові; тип і статус — з підпису або типовий; телефон нормалізовано; повторний імпорт — самі дублі; аудит', async () => {
  const r = await IMP({ rows: V.rows, type: 'crew' });
  eq([r.data.created, r.data.dups, r.data.errors], [2, 4, 3]);
  const a = await q1('SELECT * FROM partners WHERE id = ?', r.data.results[0].id), b = await q1('SELECT * FROM partners WHERE id = ?', r.data.results[7].id);
  eq([a.name, a.type, a.phone, a.tags, a.notes, a.rating, a.status, a.source_name], ['Новий Електрик', 'master', '+380670009501', '["електрика","щитки"]', 'з імпорту', 4, 'new', 'імпорт CSV']);
  eq([b.company, b.type, b.email, b.status], ['ТОВ «Новий постач»', 'supplier', 'new.supplier@example.com', 'working']);
  const again = await IMP({ rows: V.rows, type: 'crew' });
  eq([again.data.created, again.data.dups, again.data.errors], [0, 6, 3]);
  eq((await IMP({ rows: [{ name: 'Без типу', phone: '0670009510' }], type: 'crew' })).data.created, 1);
  eq((await q1("SELECT type FROM partners WHERE phone = '+380670009510'")).type, 'crew', 'типовий тип імпорту');
  eq((await IMP({ rows: [{ name: 'Архівний дубль', phone: '0500009004' }] })).data.results[0].status, 'dup');
  const au = await q1("SELECT after FROM audit_log WHERE action = 'pbase.import' ORDER BY id LIMIT 1");
  eq(JSON.parse(au.after), { rows: 9, created: 2, dups: 4, errors: 3 });
});
await it('ліміти й права імпорту: до 100 рядків у порції, до 120 порцій на годину; дизайнер / прораб / бухгалтер — 403', async () => {
  eq((await IMP({ rows: Array.from({ length: 101 }, (_, i) => ({ name: 'Р' + i })) })).status, 400);
  eq((await IMP({ rows: [] })).status, 400); eq((await IMP({ rows: 'csv' })).status, 400);
  for (const who of ['DES', 'FORE', 'ACC']) eq((await IMP({ rows: [{ name: 'x' }] }, who)).status, 403, who);
  await fill('import', MGR, STAFF_LIMITS.import - 1);
  eq((await IMP({ rows: [{ name: 'Остання порція', phone: '0670009520' }] })).status, 200);
  eq((await IMP({ rows: [{ name: 'Понад ліміт', phone: '0670009521' }] })).status, 429);
  eq((await C({ name: 'Ручне додавання не зачеплене', phone: '0670009522' })).status, 200);
  await DB.prepare("DELETE FROM rate_hits WHERE bucket LIKE 'staff-%'").run();
});

describe('Контакти: експорт CSV і права на контактні дані');
await it('CSV: UTF-8 з BOM, «;», за поточним фільтром і сортуванням, телефони в одному форматі; формули знешкоджено; експорт — в аудиті', async () => {
  await C({ name: '=HYPERLINK("http://x.test")', type: 'other', city: 'Тест-CSV', phone: '0670009530' });
  const r = await K('format=csv&city=' + encodeURIComponent('Київська обл.') + '&sort=name&dir=desc');
  eq(r.status, 200); ok(/text\/csv/.test(r.headers.get('content-type')) && /attachment; filename="cas-contacts-/.test(r.headers.get('content-disposition')));
  eq(r.bom, true, 'BOM для Excel (перші байти EF BB BF)');
  const lines = r.text.trim().split('\r\n');
  ok(lines[0].startsWith('ID;Імʼя;Компанія;Тип;Місто / область;Telegram;Телефон'));
  eq(lines.slice(1).map(l => l.split(';')[1] || l.split(';')[2]), ['Богдана Вигадана', 'Андрій Тестовий', 'Яворів Буд (тест)'].sort().reverse().map(n => n), 'лише відфільтровані, у порядку сортування');
  ok(lines.some(l => l.includes('+380670009001')) && lines.some(l => l.includes('@bohdana_test')));
  const f = (await K('format=csv&city=' + encodeURIComponent('Тест-CSV'))).text;
  ok(f.includes(`"'=HYPERLINK(""http://x.test"")"`), 'клітинка-формула починається з апострофа');
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.export'"));
  eq((await K('format=csv', 'DES')).status, 403); eq((await K('', 'FORE')).status, 403); eq((await K('format=csv', 'ACC')).status, 403);
});
await it('без права clients.contacts телефон, Telegram і пошта не віддаються ні в таблиці, ні в картці, ні в пошуку, ні в CSV', async () => {
  const was = ROLES.manager.perms.slice();
  try {
    ROLES.manager.perms.splice(ROLES.manager.perms.indexOf('clients.contacts'), 1);
    const d = (await K('ver=1')).data;
    ok(d.rows.length > 5 && d.rows.every(r => r.phone == null && r.tg == null && r.email == null), 'таблиця');
    ok(d.rows.some(r => r.name === 'Андрій Тестовий'), 'імена й компанії лишаються');
    const card = (await K('id=' + CN.a)).data.partner; eq([card.phone, card.name], [null, 'Андрій Тестовий']);
    ok((await K('find=' + encodeURIComponent('Андрій'))).data.rows.every(r => r.phone == null));
    const csv = (await K('format=csv')).text;
    ok(!/\+380\d{9}/.test(csv) && !/@bohdana_test/.test(csv) && !/@example\.com/.test(csv) && csv.includes('Андрій Тестовий'), 'CSV без контактів');
  } finally { ROLES.manager.perms.length = 0; ROLES.manager.perms.push(...was); }
  ok((await K()).data.rows.some(r => r.phone), 'з правом — як раніше');
});

if (import.meta.url === `file://${process.argv[1]}`) process.exit(report() ? 1 : 0);
