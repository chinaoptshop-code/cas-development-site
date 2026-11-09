// Тести ролей і доступу CRM (migrations 0001–0010, functions/_roles.js). Запуск: node tools/tests/run.mjs
// Стенд — tools/tests/harness.mjs (node:sqlite замість D1, мок Telegram). Перевіряємо для кожної ролі, що вона бачить і
// чого НЕ бачить (рядки й поля), заборону ескалації, деактивацію, session_version, аудит, CSRF і старі сценарії клієнта/заявок.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';

const env = makeEnv(freshDB());
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();

// ===== люди =====
const OWNER = await addClient(env, { id: 111, name: 'Михайло' });            // перший у ADMIN_TG_IDS → власник
const MGR = await addClient(env, { id: 222, name: 'Менеджерка Оля' });        // у ADMIN_TG_IDS → manager автоматично
const C1 = await addClient(env, { id: 900, name: 'Клієнт Один', phone: '+380501112233' });
const C2 = await addClient(env, { id: 901, name: 'Клієнт Два', phone: '+380504445566' });
const FOREMAN = await addClient(env, { id: 333, name: 'Олег' });               // увійшов як клієнт ще до запрошення
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, C1, C2, FOREMAN })) ck[k] = await login(env, id);

describe('Перехід і визначення ролей');
await it('власник = перший id з ADMIN_TG_IDS (OWNER_TG_ID не задано)', async () => {
  const r = await call(env, 'GET', '/api/me', { cookie: ck.OWNER });
  eq(r.data.client.staff.role, 'owner'); eq(r.data.client.home, '/kabinet/admin'); eq(r.data.client.admin, true);
});
await it('інший адмін з ADMIN_TG_IDS → manager (рядок staff створено автоматично)', async () => {
  const r = await call(env, 'GET', '/api/me', { cookie: ck.MGR });
  eq(r.data.client.staff.role, 'manager'); eq(r.data.client.home, '/kabinet/team');
  ok(await q1("SELECT 1 FROM staff WHERE client_id = ? AND role = 'manager'", MGR));
});
await it('клієнт — без ролі, дім /kabinet', async () => {
  const r = await call(env, 'GET', '/api/me', { cookie: ck.C1 });
  eq(r.data.client.staff, null); eq(r.data.client.home, '/kabinet'); eq(r.data.client.admin, false);
});
await it('OWNER_TG_ID має пріоритет над ADMIN_TG_IDS', async () => {
  const e2 = { ...env, OWNER_TG_ID: '222' };
  const r = await call(e2, 'GET', '/api/me', { cookie: ck.MGR });
  eq(r.data.client.staff.role, 'owner');
  const r2 = await call(e2, 'GET', '/api/me', { cookie: ck.OWNER });
  eq(r2.data.client.staff.role, 'manager', 'колишній «власник» без змінної — менеджер');
  await DB.prepare("UPDATE staff SET role = 'manager' WHERE client_id = ?").bind(MGR).run(); // повертаємо як було
});

describe('Персонал: додавання, ескалація');
let foremanId, designerId, accId;
await it('менеджер не може додати працівника (staff.manage — лише власник)', async () => {
  const r = await call(env, 'POST', '/api/admin/staff', { cookie: ck.MGR, body: { name: 'X', role: 'foreman', tg: '55555' } });
  eq(r.status, 403);
});
await it('власник додає прораба за Telegram id — існуючий акаунт привʼязано, клієнтська сесія анульована', async () => {
  const r = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Олег (прораб)', role: 'foreman', tg: '333' } });
  eq(r.status, 200); eq(r.data.linked, true); foremanId = r.data.id;
  eq((await call(env, 'GET', '/api/me', { cookie: ck.FOREMAN })).data.client, null, 'стара cookie недійсна');
  ck.FOREMAN = await login(env, FOREMAN);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.FOREMAN })).data.client.staff.role, 'foreman');
});
await it('запрошення дизайнера за поштою привʼязується при першому вході', async () => {
  const r = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Аня', role: 'designer', email: 'Anya@Example.com' } });
  eq(r.status, 200); eq(r.data.linked, false); designerId = r.data.id;
  const DES = await addClient(env, { provider: 'google', id: 'g-1', name: 'Anna G', email: 'anya@example.com' });
  ck.DES = await login(env, DES);
  const me = await call(env, 'GET', '/api/me', { cookie: ck.DES });
  eq(me.data.client.staff.role, 'designer'); eq(me.data.client.staff.id, designerId);
});
await it('бухгалтер за телефоном', async () => {
  const r = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Ірина', role: 'accountant', phone: '097 123 45 67' } });
  eq(r.status, 200); accId = r.data.id;
  const ACC = await addClient(env, { provider: 'phone', id: '+380971234567', name: 'Ірина', phone: '+380971234567' });
  ck.ACC = await login(env, ACC);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.ACC })).data.client.staff.role, 'accountant');
});
await it('дубль працівника → 409; роль owner не призначається → 403', async () => {
  eq((await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Олег 2', role: 'foreman', tg: '333' } })).status, 409);
  eq((await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Хтось', role: 'owner', tg: '77777' } })).status, 403);
});
await it('працівник не змінює собі роль (немає staff.manage) і власник не змінює себе/власника', async () => {
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.FOREMAN, body: { id: foremanId, role: 'manager' } })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.MGR, body: { id: foremanId, role: 'manager' } })).status, 403);
  const own = await q1("SELECT id FROM staff WHERE role = 'owner'");
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: own.id, active: false } })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: foremanId, role: 'owner' } })).status, 403);
});
await it('роль owner, підмінена напряму в БД, не дає прав власника', async () => {
  await DB.prepare("UPDATE staff SET role = 'owner' WHERE id = ?").bind(foremanId).run();
  const r = await call(env, 'GET', '/api/admin/audit', { cookie: ck.FOREMAN });
  eq(r.status, 403);
  await DB.prepare("UPDATE staff SET role = 'foreman' WHERE id = ?").bind(foremanId).run();
});
await it('менеджер бачить список працівників лише коротко (без контактів запрошень)', async () => {
  const r = await call(env, 'GET', '/api/admin/staff', { cookie: ck.MGR });
  eq(r.status, 200); ok(r.data.staff.length >= 4); ok(!('tg_id' in r.data.staff[0]) && !('phone' in r.data.staff[0]));
  const o = await call(env, 'GET', '/api/admin/staff', { cookie: ck.OWNER });
  ok(o.data.staff.some(s => s.tg_id === '333')); ok(o.data.roles.foreman.perms.includes('reports.upload'));
});

// ===== дані =====
let P1, P2, L1, L2, ORD;
describe('Обʼєкти: призначення й row-level');
await it('власник створює обʼєкт з відповідальним прорабом — прораб отримує Telegram', async () => {
  bot.reset();
  const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'project', client_id: C1, title: 'Квартира на Печерську', address: 'вул. Тестова, 1',
    stages: [{ name: 'Демонтаж', progress: 100 }, { name: 'Чорнові роботи', progress: 30, end: '2020-01-01' }, { name: 'Чистові', progress: 0 }],
    assignee_staff_id: foremanId, contract_amount: 50000, contract_currency: 'USD' } });
  eq(r.status, 200); P1 = r.data.id;
  ok(bot.calls.some(c => c.method === 'sendMessage' && c.chat_id === '333' && /Квартира на Печерську/.test(c.text)), 'сповіщення прорабу');
  const r2 = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'project', client_id: C2, title: 'Будинок у Козині', address: 'Козин', contract_amount: 120000 } });
  P2 = r2.data.id;
  await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'payment', project_id: P1, title: 'Аванс', amount: 25000, status: 'paid' } });
  await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'payment', project_id: P1, title: 'Після чорнових', amount: 15000, due_date: '2020-02-01' } });
});
await it('прораб бачить лише свій обʼєкт: адреса й телефон клієнта — так, суми й платежі — ні', async () => {
  const r = await call(env, 'GET', '/api/admin/projects', { cookie: ck.FOREMAN });
  eq(r.status, 200); eq(r.data.projects.map(p => p.id), [P1]);
  const p = r.data.projects[0];
  eq(p.address, 'вул. Тестова, 1'); eq(p.client_phone, '+380501112233');
  ok(!('contract_amount' in p), 'без суми договору'); eq(r.data.payments, [], 'без платежів');
  const t = await call(env, 'GET', '/api/team/today', { cookie: ck.FOREMAN });
  eq(t.status, 200); eq(t.data.projects.map(p => p.id), [P1]);
  ok(!('contract_amount' in t.data.projects[0]) && !('payments' in t.data.projects[0]));
  ok(t.data.tasks.some(x => x.kind === 'stage' && x.urgent), 'прострочений етап у задачах');
  ok(t.data.tasks.some(x => x.kind === 'report'), 'нагадування про фотозвіт');
  eq(t.data.leads, []);
});
await it('прораб не відкриє чужий обʼєкт за id (404, а не 403 — не підтверджуємо існування)', async () => {
  eq((await call(env, 'POST', '/api/team/action', { cookie: ck.FOREMAN, body: { type: 'issue', project_id: P2, note: 'x' } })).status, 404);
  eq((await call(env, 'POST', '/api/team/upload', { cookie: ck.FOREMAN, body: { project_id: P2, mime: 'image/png', data: 'iVBORw0KGgo=' } })).status, 404);
  eq((await call(env, 'GET', '/api/admin/projects?client_id=' + C2, { cookie: ck.FOREMAN })).data.projects.length, 0);
});
await it('прораб не редагує обʼєкт, платежі, документи (лише етап/звіт/проблема)', async () => {
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.FOREMAN, body: { id: P1, title: 'Hack' } })).status, 403);
  eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.FOREMAN, body: { type: 'payment', project_id: P1, title: 'x', amount: 1 } })).status, 403);
  eq((await call(env, 'DELETE', '/api/admin/projects?type=project&id=' + P1, { cookie: ck.FOREMAN })).status, 403);
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: ck.FOREMAN })).status, 403);
  eq((await call(env, 'GET', '/api/admin/clients', { cookie: ck.FOREMAN })).status, 403);
  eq((await call(env, 'GET', '/api/admin/repo?op=status', { cookie: ck.FOREMAN })).status, 403);
});
let mediaUrl;
await it('прораб: фото → фотозвіт → етап виконано → проблема; власнику й менеджеру — Telegram', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64');
  const u = await call(env, 'POST', '/api/team/upload', { cookie: ck.FOREMAN, body: { project_id: P1, mime: 'image/png', data: png } });
  eq(u.status, 200); mediaUrl = u.data.url; ok(/^https:\/\/cas-develop\.com\/api\/media\/[0-9a-f]{24}$/.test(mediaUrl));
  const bad = await call(env, 'POST', '/api/team/upload', { cookie: ck.FOREMAN, body: { project_id: P1, mime: 'image/png', data: Buffer.from('<svg>').toString('base64') } });
  eq(bad.status, 415, 'не-фото відхилено');
  const stage = (await q1('SELECT stages FROM projects WHERE id = ?', P1)).stages;
  const sid = JSON.parse(stage)[1].id;
  const r = await call(env, 'POST', '/api/team/action', { cookie: ck.FOREMAN, body: { type: 'report', project_id: P1, stage_id: sid, note: 'Стяжка готова', photos: [mediaUrl] } });
  eq(r.status, 200);
  bot.reset();
  const s = await call(env, 'POST', '/api/team/action', { cookie: ck.FOREMAN, body: { type: 'stage', project_id: P1, stage_id: sid, status: 'done' } });
  eq(s.status, 200); eq(s.data.stage.progress, 100);
  ok(bot.calls.some(c => c.chat_id === '111' && /Етап виконано/.test(c.text)), 'власнику — етап виконано');
  bot.reset();
  const i = await call(env, 'POST', '/api/team/action', { cookie: ck.FOREMAN, body: { type: 'issue', project_id: P1, note: 'Протікає стояк', photos: [mediaUrl] } });
  eq(i.status, 200);
  const to = bot.calls.filter(c => /Проблема на обʼєкті/.test(c.text || '')).map(c => c.chat_id).sort();
  eq(to, ['111', '222']);
});
await it('фото: клієнт-власник і прораб бачать, інший клієнт — 404', async () => {
  const path = new URL(mediaUrl).pathname;
  eq((await call(env, 'GET', path, { cookie: ck.C1 })).status, 200);
  eq((await call(env, 'GET', path, { cookie: ck.FOREMAN })).status, 200);
  eq((await call(env, 'GET', path, { cookie: ck.C2 })).status, 404);
  eq((await call(env, 'GET', path)).status, 401);
});
await it('фото чужого обʼєкта не прикріпити до свого звіту', async () => {
  // медіа P2 (завантажив власник) — у звіт прораба по P1 не потрапить
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]).toString('base64');
  const u = await call(env, 'POST', '/api/team/upload', { cookie: ck.OWNER, body: { project_id: P2, mime: 'image/png', data: png } });
  const r = await call(env, 'POST', '/api/team/action', { cookie: ck.FOREMAN, body: { type: 'report', project_id: P1, note: 'x', photos: [u.data.url] } });
  const rep = await q1('SELECT photos FROM project_reports WHERE id = ?', r.data.id);
  eq(JSON.parse(rep.photos), []);
});

describe('Клієнт бачить лише своє і без внутрішніх полів');
await it('клієнт: лише свій проєкт; без суми договору, виконавців, проблем, автора звіту', async () => {
  const r = await call(env, 'GET', '/api/account/projects', { cookie: ck.C1 });
  eq(r.data.projects.map(p => p.id), [P1]);
  const s = JSON.stringify(r.data);
  for (const k of ['contract_amount', 'assignee_staff_id', 'author_staff_id', 'Протікає стояк', 'crm_note', 'client_phone', 'project_staff'])
    ok(!s.includes(k), 'витік: ' + k);
  ok(r.data.projects[0].reports.some(x => x.photos.includes(mediaUrl)), 'фотозвіт прораба видно клієнту');
  eq((await call(env, 'GET', '/api/account/projects', { cookie: ck.C2 })).data.projects.map(p => p.id), [P2]);
});
await it('клієнт не має доступу до /api/admin/* і /api/team/*', async () => {
  for (const p of ['/api/admin/crm', '/api/admin/projects', '/api/admin/staff', '/api/admin/studio', '/api/admin/audit', '/api/team/today'])
    eq((await call(env, 'GET', p, { cookie: ck.C1 })).status, 403, p);
  eq((await call(env, 'GET', '/api/admin/crm')).status, 401);
});

describe('Заявки: row-level і field-level');
await it('заявка з форми сайту → Telegram адмінам (як раніше)', async () => {
  bot.reset();
  const r = await call(env, 'POST', '/api/leads', { body: { name: 'Петро', phone: '0671112233', service: 'Ремонт квартири', source: 'cas-develop.com/remont-kvartyr-kyiv#prices' } });
  eq(r.status, 200); L1 = (await q1('SELECT id FROM orders WHERE number = ?', r.data.number)).id;
  eq(bot.calls.filter(c => c.method === 'sendMessage').map(c => c.chat_id).sort(), ['111', '222']);
  const r2 = await call(env, 'POST', '/api/leads', { body: { name: 'Ганна', phone: '0679998877', service: 'Дизайн' }, headers: { ip: '10.0.0.2' } });
  L2 = (await q1('SELECT id FROM orders WHERE number = ?', r2.data.number)).id;
});
await it('менеджер призначає заявку дизайнеру й ставить суму; дизайнеру — Telegram немає (без TG), аудит є', async () => {
  const r = await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: L1, assignee_staff_id: designerId, amount: 300000, status: 'quote_sent' } });
  eq(r.status, 200); eq(r.data.status_label, 'Розрахунок');
  const a = await q1("SELECT * FROM audit_log WHERE action = 'lead.update' AND entity_id = ?", String(L1));
  ok(a && JSON.parse(a.after).assignee_staff_id === designerId && JSON.parse(a.before).status === 'new');
});
await it('дизайнер бачить лише призначену заявку, з контактами, без суми', async () => {
  const r = await call(env, 'GET', '/api/admin/crm', { cookie: ck.DES });
  eq(r.status, 200); eq(r.data.rows.map(x => x.id), [L1]);
  ok(r.data.rows[0].phone, 'телефон є'); ok(!('amount' in r.data.rows[0]), 'суми немає');
  eq((await call(env, 'GET', '/api/admin/crm?events=' + L2, { cookie: ck.DES })).status, 404);
});
await it('дизайнер: чужу заявку не змінить (404), суму й відповідального — 403, статус своєї — так', async () => {
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.DES, body: { id: L2, status: 'in_work' } })).status, 404);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.DES, body: { id: L1, amount: 1 } })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.DES, body: { id: L1, assignee_staff_id: null } })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.DES, body: { id: L1, status: 'contract', crm_note: 'Погодили' } })).status, 200);
  eq((await q1('SELECT amount FROM orders WHERE id = ?', L1)).amount, 300000, 'сума не змінилась');
});
await it('дизайнер без права export і аналітики', async () => {
  eq((await call(env, 'GET', '/api/admin/crm?format=csv', { cookie: ck.DES })).status, 403);
  eq((await call(env, 'GET', '/api/admin/crm?stats=1', { cookie: ck.DES })).status, 403);
});
await it('замовлення Оздоби: старий сценарій оформлення працює; бухгалтер бачить суми без телефонів і без заявок', async () => {
  const cat = JSON.parse((await import('node:fs')).readFileSync(new URL('../../assets/ozdoba/catalog.json', import.meta.url)));
  const it0 = cat.items.find(i => i.price != null && !i.ss);
  const qty = Math.max(cat.min_qty || 10, Math.ceil(470000 / it0.price));
  const r = await call(env, 'POST', '/api/orders', { cookie: ck.C2, body: { phone: '0504445566', cart: [{ id: it0.id, qty, ci: -1 }] }, headers: { ip: '10.0.0.3' } });
  eq(r.status, 200, JSON.stringify(r.data)); ORD = (await q1('SELECT id FROM orders WHERE number = ?', r.data.number)).id;
  const a = await call(env, 'GET', '/api/admin/crm', { cookie: ck.ACC });
  eq(a.status, 200); eq(a.data.rows.map(x => x.kind), ['order']);
  ok(a.data.rows[0].total > 0 && !('phone' in a.data.rows[0]));
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.ACC, body: { id: ORD, status: 'paid' } })).status, 403, 'бухгалтер не змінює статус');
  const c = await call(env, 'GET', '/api/orders', { cookie: ck.C2 });
  eq(c.data.orders.length, 1); ok(!('crm_note' in c.data.orders[0]) && !('assignee' in c.data.orders[0]));
  const ao = await call(env, 'GET', '/api/account/orders', { cookie: ck.C2 });
  eq(ao.data.orders.length, 1);
});
await it('менеджер бачить усе (заявки + Оздоба), CSV з аудитом, фільтри працівник/місто/прострочка', async () => {
  const r = await call(env, 'GET', '/api/admin/crm', { cookie: ck.MGR });
  eq(r.data.rows.length, 3); ok(r.data.staff.length >= 4);
  eq((await call(env, 'GET', '/api/admin/crm?staff=' + designerId, { cookie: ck.MGR })).data.rows.map(x => x.id), [L1]);
  eq((await call(env, 'GET', '/api/admin/crm?staff=none&kind=lead', { cookie: ck.MGR })).data.rows.map(x => x.id), [L2]);
  await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: L2, city: 'Львівська обл.', next_contact: '2020-01-01', status: 'in_work' } });
  eq((await call(env, 'GET', '/api/admin/crm?city=' + encodeURIComponent('Львів'), { cookie: ck.MGR })).data.rows.map(x => x.id), [L2]);
  eq((await call(env, 'GET', '/api/admin/crm?overdue=1', { cookie: ck.MGR })).data.rows.map(x => x.id), [L2]);
  eq((await call(env, 'GET', '/api/admin/crm?min=200000', { cookie: ck.MGR })).data.rows.map(x => x.id), [L1]);
  const c = await call(env, 'GET', '/api/admin/crm?format=csv', { cookie: ck.MGR });
  eq(c.status, 200); ok(/Номер;Тип/.test(c.text));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'crm.export'"));
});
await it('невідомий статус для типу запису → 400 (статус Оздоби не ставиться заявці)', async () => {
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: L2, status: 'shipping' } })).status, 400);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: ORD, status: 'warranty' } })).status, 400);
});

describe('Майстер-панель і аудит — лише власник');
await it('дашборд «вся студія»: воронка, фінанси, навантаження, прострочки', async () => {
  const r = await call(env, 'GET', '/api/admin/studio', { cookie: ck.OWNER });
  eq(r.status, 200);
  eq(r.data.funnel.map(f => f.key), ['new', 'in_work', 'quote_sent', 'contract', 'project', 'handover', 'warranty', 'cancelled']);
  eq(r.data.funnel.find(f => f.key === 'contract').n, 1);
  eq(r.data.finance.projects.USD.paid, 25000); eq(r.data.finance.projects.USD.overdue, 15000);
  ok(r.data.workload.find(w => w.id === foremanId).projects === 1);
  ok(r.data.overdue.issues.length === 1 && r.data.overdue.payments.length === 1);
  eq((await call(env, 'GET', '/api/admin/studio', { cookie: ck.MGR })).status, 403);
});
await it('аудит бачить лише власник; є записи про персонал, етап, проблему', async () => {
  const r = await call(env, 'GET', '/api/admin/audit', { cookie: ck.OWNER });
  eq(r.status, 200);
  const acts = new Set(r.data.rows.map(x => x.action));
  for (const a of ['staff.create', 'project.create', 'project.assign', 'project.stage', 'issue.create', 'report.create', 'lead.update', 'payment.create']) ok(acts.has(a), 'немає ' + a);
  eq((await call(env, 'GET', '/api/admin/audit', { cookie: ck.MGR })).status, 403);
  eq((await call(env, 'GET', '/api/admin/audit', { cookie: ck.ACC })).status, 403);
});
await it('картка клієнта: уся історія; прораб не має доступу', async () => {
  const r = await call(env, 'GET', '/api/admin/clients?id=' + C1, { cookie: ck.OWNER });
  eq(r.status, 200); eq(r.data.projects.map(p => p.id), [P1]); ok(r.data.projects[0].payments.length === 2); ok(r.data.audit.length > 0);
  const a = await call(env, 'GET', '/api/admin/clients?id=' + C1, { cookie: ck.ACC });
  ok(!('phone' in a.data.client)); eq(a.data.audit, []);
});

describe('Відкликання доступу');
await it('деактивація працівника діє миттєво (навіть з чинною cookie)', async () => {
  await DB.prepare('UPDATE staff SET active = 0 WHERE id = ?').bind(designerId).run(); // напряму, без зміни session_version
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: ck.DES })).status, 403);
  await DB.prepare('UPDATE staff SET active = 1 WHERE id = ?').bind(designerId).run();
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: ck.DES })).status, 200);
});
await it('деактивація через API: сесії анульовано, заявки на нього не призначити, Telegram «усім» — без нього', async () => {
  const mgrStaff = (await q1('SELECT id FROM staff WHERE client_id = ?', MGR)).id;
  const r = await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: mgrStaff, active: false } });
  eq(r.status, 200); eq(r.data.sessions_revoked, true);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.MGR })).data.client, null);
  const fresh = await login(env, MGR);
  const me = await call(env, 'GET', '/api/me', { cookie: fresh });
  eq(me.data.client.staff, null, 'у ADMIN_TG_IDS, але вимкнений — не адмін'); eq(me.data.client.staff_disabled, true);
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: fresh })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.OWNER, body: { id: L1, assignee_staff_id: mgrStaff } })).status, 422);
  bot.reset();
  await call(env, 'POST', '/api/leads', { body: { phone: '0631231231' }, headers: { ip: '10.0.0.9' } });
  eq(bot.calls.filter(c => c.method === 'sendMessage').map(c => c.chat_id), ['111']);
  await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: mgrStaff, active: true } });
  ck.MGR = await login(env, MGR);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.MGR })).data.client.staff.role, 'manager');
});
await it('«Вийти на всіх пристроях» (session_version)', async () => {
  const a = await login(env, C1), b = await login(env, C1);
  eq((await call(env, 'POST', '/api/auth/logout', { cookie: a, body: { all: true } })).status, 200);
  eq((await call(env, 'GET', '/api/me', { cookie: b })).data.client, null);
  ck.C1 = await login(env, C1);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.C1 })).data.client.id, C1);
});
await it('стара cookie (формат до 0010, без версії) працює, поки версія 0; підробка підпису — ні', async () => {
  const { hmac } = await import('../../functions/_lib.js');
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const sig = await hmac(new TextEncoder().encode('test-secret'), `${C2}.${exp}`);
  eq((await call(env, 'GET', '/api/me', { cookie: `cas_s=${C2}.${exp}.${sig}` })).data.client.id, C2);
  eq((await call(env, 'GET', '/api/me', { cookie: `cas_s=${OWNER}.${exp}.${sig}` })).data.client, null);
  eq((await call(env, 'GET', '/api/me', { cookie: `cas_s=${C2}.${exp}.5.${sig}` })).data.client, null);
});

describe('CSRF і заголовки');
await it('POST з чужого Origin → 403, form-urlencoded → 415, без Origin із Sec-Fetch-Site cross-site → 403', async () => {
  eq((await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'x', role: 'foreman', tg: '12345' }, headers: { origin: 'https://evil.example' } })).status, 403);
  eq((await call(env, 'POST', '/api/team/action', { cookie: ck.FOREMAN, raw: 'type=issue', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.OWNER, body: { id: L2 }, headers: { noOrigin: true, 'sec-fetch-site': 'cross-site' } })).status, 403);
  const r = await call(env, 'GET', '/api/team/today', { cookie: ck.FOREMAN });
  eq(r.headers.get('x-frame-options'), 'DENY'); ok(/default-src 'none'/.test(r.headers.get('content-security-policy')));
});

describe('Сторінки: кожен — у свій інтерфейс, чужий — 403');
await it('/kabinet/admin: власник і менеджер — так; прораб і клієнт — 403; гість — сторінка входу', async () => {
  eq((await call(env, 'GET', '/kabinet/admin', { cookie: ck.OWNER })).status, 200);
  eq((await call(env, 'GET', '/kabinet/admin', { cookie: ck.MGR })).status, 200);
  eq((await call(env, 'GET', '/kabinet/admin', { cookie: ck.FOREMAN })).status, 403);
  eq((await call(env, 'GET', '/kabinet/admin', { cookie: ck.C1 })).status, 403);
  eq((await call(env, 'GET', '/kabinet/admin')).status, 200);
});
await it('/kabinet/team: працівники — так; клієнт — 403; /kabinet — усім', async () => {
  eq((await call(env, 'GET', '/kabinet/team', { cookie: ck.FOREMAN })).status, 200);
  eq((await call(env, 'GET', '/kabinet/team', { cookie: ck.ACC })).status, 200);
  eq((await call(env, 'GET', '/kabinet/team', { cookie: ck.C1 })).status, 403);
  eq((await call(env, 'GET', '/kabinet', { cookie: ck.C1 })).status, 200);
});

describe('Сумісність: база без міграції 0010');
await it('адміни працюють як раніше (owner/manager без рядка staff), клієнт — як раніше', async () => {
  const old = makeEnv(freshDB(9));
  const o = await addClient(old, { id: 111, name: 'M' }), c = await addClient(old, { id: 5 });
  const co = await login(old, o), cc = await login(old, c);
  eq((await call(old, 'GET', '/api/me', { cookie: co })).data.client.staff.role, 'owner');
  eq((await call(old, 'GET', '/api/admin/crm', { cookie: co })).status, 200, 'CRM власника працює і до міграції');
  eq((await call(old, 'GET', '/api/admin/projects', { cookie: co })).status, 200);
  eq((await call(old, 'GET', '/api/account/projects', { cookie: cc })).status, 200);
  eq((await call(old, 'GET', '/api/admin/projects', { cookie: cc })).status, 403);
  const l = await call(old, 'POST', '/api/leads', { body: { phone: '0501231234' } });
  eq(l.status, 200);
});

describe('Оздоба: правила CLAUDE.md на сервері (мін. 10 шт, мін. $10 000, знижки 3/5/7%, код партнера не сумується)');
{
  const se = makeEnv(freshDB());
  const cat = JSON.parse((await import('node:fs')).readFileSync(new URL('../../assets/ozdoba/catalog.json', import.meta.url)));
  const it0 = cat.items.find(i => i.price != null && !i.ss);
  let ipn = 0;
  const order = (qty, extra = {}) => call(se, 'POST', '/api/orders', { body: { phone: '0671234567', cart: [{ id: it0.id, qty, ci: -1 }], ...extra }, headers: { ip: '10.9.0.' + (++ipn) } });
  const qFor = g => Math.max(10, Math.ceil(g / it0.price));
  await it('catalog.json: пороги 230 000/460 000/920 000 ₴ → 3/5/7%, мінімум 10 шт', async () => {
    eq(cat.volume_discounts, [[230000, 3], [460000, 5], [920000, 7]]); eq(cat.min_qty, 10);
  });
  await it('9 шт позиції — 400 з поясненням про мінімум', async () => {
    const r = await order(9); eq(r.status, 400); ok(/10/.test(r.data.error));
  });
  await it('сума менше 460 000 ₴ (≈ $10 000) — 400', async () => {
    const cheap = cat.items.filter(i => i.price != null && !i.ss).sort((a, b) => a.price - b.price)[0];
    ok(cheap.price * 10 < 460000, 'є дешевий товар для перевірки');
    const r = await call(se, 'POST', '/api/orders', { body: { phone: '0671234567', cart: [{ id: cheap.id, qty: 10, ci: -1 }] }, headers: { ip: '10.9.1.1' } });
    eq(r.status, 400); ok(/460.000/.test(r.data.error));
  });
  await it('знижка за обсягом: ≥460k — 5%, ≥920k — 7% (нижче 460k заявка не проходить)', async () => {
    for (const [g, pct] of [[460000, 5], [920000, 7]]) {
      const r = await order(qFor(g)); eq(r.status, 200, JSON.stringify(r.data)); eq(r.data.discount_pct, pct, `сума ${r.data.goods}`);
      eq(r.data.discount, Math.round(r.data.goods * pct / 100)); eq(r.data.total, r.data.goods - r.data.discount); eq(r.data.shipping, 0, 'доставка не в сумі');
    }
  });
  await it('код партнера: більший за обсягову — діє код; менший — діє обсягова; не сумуються', async () => {
    await se.DB.prepare("INSERT INTO partner_codes (code, name, discount) VALUES ('DIZ-TEST', 'Тест', 4), ('DIZ-HIGH', 'Тест 2', 6)").run();
    const a = await order(qFor(470000), { promo: 'diz-high' });
    eq(a.data.discount_pct, 6, 'код 6% > обсягова 5%'); eq(a.data.promo, 'DIZ-HIGH');
    const b = await order(qFor(470000), { promo: 'DIZ-TEST' });
    eq(b.data.discount_pct, 5, 'обсягова 5% > код 4% — не 9%');
    const c = await order(qFor(470000), { promo: 'NOPE-CODE' });
    eq(c.data.discount_pct, 5); eq(c.data.promo, null, 'невідомий код не застосовано');
  });
  await it('ціни — з каталогу сервера, не з кошика клієнта', async () => {
    const r = await call(se, 'POST', '/api/orders', { body: { phone: '0671234567', cart: [{ id: it0.id, qty: qFor(470000), ci: -1, price: 1 }] }, headers: { ip: '10.9.2.1' } });
    eq(r.data.goods, it0.price * qFor(470000));
  });
}

describe('Заявки: антиспам і валідація (/api/leads)');
{
  const le = makeEnv(freshDB());
  const n = async () => (await le.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE kind = 'lead'").first()).n;
  await it('приховане поле hp / website — «успіх» без збереження і без сповіщення', async () => {
    bot.reset();
    for (const body of [{ phone: '0671112233', hp: 'x' }, { phone: '0671112233', website: 'http://spam' }]) {
      const r = await call(le, 'POST', '/api/leads', { body, headers: { ip: '10.8.0.1' } }); eq(r.status, 200); eq(r.data.number, undefined);
    }
    eq(await n(), 0); eq(bot.calls.length, 0);
  });
  await it('надіслано швидше 1,5 с після відкриття (t_ms) — не зберігається', async () => {
    await call(le, 'POST', '/api/leads', { body: { phone: '0671112233', t_ms: 400 }, headers: { ip: '10.8.0.2' } }); eq(await n(), 0);
  });
  await it('телефон коротший 9 цифр — 400; міжнародний номер — приймається; сповіщення в Telegram надіслано', async () => {
    eq((await call(le, 'POST', '/api/leads', { body: { phone: '12345' }, headers: { ip: '10.8.0.3' } })).status, 400);
    bot.reset();
    const r = await call(le, 'POST', '/api/leads', { body: { phone: '+44 7700 900123', t_ms: 9000, form: 'landing', lang: 'en' }, headers: { ip: '10.8.0.4' } });
    eq(r.status, 200); ok(r.data.number); eq(await n(), 1);
    ok(bot.calls.some(c => c.method === 'sendMessage'), 'адміни отримали сповіщення (мок Telegram)');
  });
  await it('6-та заявка з одного IP за годину — 429', async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await call(le, 'POST', '/api/leads', { body: { phone: '06700000' + String(10 + i) }, headers: { ip: '10.8.0.9' } });
    eq(last.status, 429);
  });
}

process.exit(report() ? 1 : 0);
