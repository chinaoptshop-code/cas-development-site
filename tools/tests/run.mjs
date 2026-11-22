// Тести ролей і доступу CRM (migrations 0001–0012, functions/_roles.js). Запуск: node tools/tests/run.mjs
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
  eq(r.data.client.staff.role, 'manager'); eq(r.data.client.home, '/kabinet/admin');
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
await it('редагування працівника: лише власник, перевірка контактів, дубль 409, аудит', async () => {
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.MGR, body: { id: accId, name: 'Злам' } })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: accId, tg: 'abc' } })).status, 422);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: accId, email: 'not-mail' } })).status, 422);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: accId, phone: '' } })).status, 422, 'без жодного контакту');
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: designerId, tg: '333' } })).status, 409, 'Telegram id прораба');
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: designerId, phone: '+380971234567' } })).status, 409, 'телефон бухгалтера');
  const r = await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: accId, name: 'Ірина Б.', note: 'фінанси' } });
  eq(r.status, 200); eq(r.data.sessions_revoked, false, 'імʼя й примітка — сесії лишаються');
  eq((await q1('SELECT name, note FROM staff WHERE id = ?', accId)).name, 'Ірина Б.');
  eq((await call(env, 'GET', '/api/me', { cookie: ck.ACC })).data.client.staff.role, 'accountant');
  const a = await q1("SELECT before, after FROM audit_log WHERE action = 'staff.update' AND entity_id = ? ORDER BY id DESC LIMIT 1", String(accId));
  ok(a && JSON.parse(a.before).name === 'Ірина' && JSON.parse(a.after).note === 'фінанси');
});
await it('зміна контакту для входу відвʼязує старий акаунт і анулює його сесії', async () => {
  const ACC = (await q1('SELECT client_id FROM staff WHERE id = ?', accId)).client_id;
  const r = await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: accId, phone: '097 000 11 22' } });
  eq(r.status, 200); eq(r.data.sessions_revoked, true);
  eq((await q1('SELECT client_id, phone FROM staff WHERE id = ?', accId)).client_id, null);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.ACC })).data.client, null, 'стара cookie недійсна');
  ck.ACC = await login(env, ACC);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.ACC })).data.client.staff, null, 'старий номер — уже не працівник');
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: ck.ACC })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: accId, phone: '097 123 45 67' } })).status, 200);
  ck.ACC = await login(env, ACC);
  eq((await call(env, 'GET', '/api/me', { cookie: ck.ACC })).data.client.staff.role, 'accountant', 'повернули номер — привʼязано знову');
  eq((await q1('SELECT client_id FROM staff WHERE id = ?', accId)).client_id, ACC);
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
  ok(t.data.tasks.filter(x => x.kind === 'stage').every(x => /^Етап «.+»$/.test(x.title) && x.due), 'назва етапу без дублю дати (дата — у полі due)');
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
await it('профіль: «Мова спілкування» — усі 10 мов сайту, невідома → 422', async () => {
  for (const l of ['pt', 'ar', 'zh', 'uk']) {
    const r = await call(env, 'PATCH', '/api/account/profile', { cookie: ck.C1, body: { lang: l } });
    eq(r.status, 200, l); eq(r.data.settings.lang, l);
  }
  eq((await call(env, 'PATCH', '/api/account/profile', { cookie: ck.C1, body: { lang: 'xx' } })).status, 422);
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
  eq((await call(env, 'GET', '/api/admin/crm?min=200000&kind=lead', { cookie: ck.MGR })).data.rows.map(x => x.id), [L1]);
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

describe('Сторінка-джерело заявки (orders.ref_path, migrations/0011): прийом, перевірка, CRM, CSV, ролі');
{
  const re = makeEnv(freshDB());
  const rq = (sql, ...a) => re.DB.prepare(sql).bind(...a).first();
  const o = await addClient(re, { id: 111, name: 'Власник' }), m = await addClient(re, { id: 222, name: 'Менеджер' });
  const rc = { O: await login(re, o), M: await login(re, m) };
  await call(re, 'GET', '/api/me', { cookie: rc.M });
  let n = 0;
  const lead = async ref => {
    n++;
    const r = await call(re, 'POST', '/api/leads', { body: { phone: '06700000' + String(10 + n), service: 'Ремонт', source: 'cas-develop.com/remont-kvartyr-kyiv', form: 'landing', ref_path: ref }, headers: { ip: '10.9.0.' + n } });
    eq(r.status, 200, 'заявка прийнята');
    return rq('SELECT id, ref_path, form FROM orders WHERE number = ?', r.data.number);
  };
  let A, B;
  await it('шлях того самого сайту зберігається окремою колонкою', async () => {
    A = await lead('/proekty/monpark'); eq(A.ref_path, '/proekty/monpark'); eq(A.form, 'landing');
    B = await lead('/tury/apartment-2025'); eq(B.ref_path, '/tury/apartment-2025');
    eq((await lead('/ru/blog/kak-sostavit-smetu-na-remont')).ref_path, '/ru/blog/kak-sostavit-smetu-na-remont');
  });
  await it('чужий домен, //host, схема, query/hash, розмітка, задовге, не рядок → null (заявка все одно зберігається)', async () => {
    for (const bad of ['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)', '/a?x=1', '/a#b', '/a b', '/<script>', '/a"b', '\\\\evil', '/' + 'x'.repeat(170), 'proekty', 123, { p: '/x' }, ''])
      eq((await lead(bad)).ref_path, null, 'відхилено: ' + JSON.stringify(bad));
    eq((await lead(undefined)).ref_path, null);
  });
  await it('CRM менеджера: поле ref_path, фільтр ?ref= (точно й за префіксом «/proekty/»), аналітика by_ref', async () => {
    const all = await call(re, 'GET', '/api/admin/crm?kind=lead', { cookie: rc.M });
    eq(all.status, 200); eq(all.data.rows.find(x => x.id === A.id).ref_path, '/proekty/monpark');
    eq((await call(re, 'GET', '/api/admin/crm?ref=' + encodeURIComponent('/proekty/monpark'), { cookie: rc.M })).data.rows.map(x => x.id), [A.id]);
    eq((await call(re, 'GET', '/api/admin/crm?ref=' + encodeURIComponent('/proekty/'), { cookie: rc.M })).data.rows.map(x => x.id), [A.id]);
    eq((await call(re, 'GET', '/api/admin/crm?ref=' + encodeURIComponent('/proekty'), { cookie: rc.M })).data.rows.length, 0, 'без «/» у кінці — точний збіг');
    eq((await call(re, 'GET', '/api/admin/crm?ref=' + encodeURIComponent('%'), { cookie: rc.M })).data.rows.length, 0, '% — не шаблон');
    const st = await call(re, 'GET', '/api/admin/crm?stats=1', { cookie: rc.O });
    ok(st.data.by_ref.some(g => g.key === '/tury/apartment-2025' && g.n === 1), 'by_ref у аналітиці');
  });
  await it('CSV: колонка «Сторінка-джерело»', async () => {
    const c = await call(re, 'GET', '/api/admin/crm?format=csv&kind=lead', { cookie: rc.O });
    eq(c.status, 200); ok(/;Сторінка-джерело;/.test(c.text.split('\r\n')[0]), 'заголовок'); ok(c.text.includes(';/proekty/monpark;'), 'значення');
  });
  await it('дизайнер (лише призначені заявки): ref_path не бачить, ?ref= ігнорується', async () => {
    const s = await call(re, 'POST', '/api/admin/staff', { cookie: rc.O, body: { name: 'Дизайнерка', role: 'designer', email: 'des@example.com' } });
    eq(s.status, 200);
    rc.D = await login(re, await addClient(re, { provider: 'google', id: 'g-des', name: 'D', email: 'des@example.com' }));
    eq((await call(re, 'PATCH', '/api/admin/crm', { cookie: rc.O, body: { id: A.id, assignee_staff_id: s.data.id } })).status, 200);
    const r = await call(re, 'GET', '/api/admin/crm?ref=' + encodeURIComponent('/tury/apartment-2025'), { cookie: rc.D });
    eq(r.status, 200); eq(r.data.rows.map(x => x.id), [A.id]); ok(!('ref_path' in r.data.rows[0]), 'без ref_path');
  });
  await it('база без міграції 0011: заявка з ref_path зберігається з form/lang (0009), без ref_path; до 0009 — як раніше', async () => {
    for (const up of [10, 8]) {
      const oe = makeEnv(freshDB(up));
      const r = await call(oe, 'POST', '/api/leads', { body: { phone: '0501112299', form: 'landing', lang: 'uk', ref_path: '/proekty/monpark' } });
      eq(r.status, 200, 'міграції до ' + up);
      const row = await oe.DB.prepare('SELECT * FROM orders WHERE number = ?').bind(r.data.number).first();
      ok(!('ref_path' in row)); if (up >= 9) eq(row.form, 'landing');
    }
  });
}

describe('Зовнішнє джерело візиту (orders.ref_host, migrations/0019): прийом, перевірка, CRM, фільтр, CSV, Telegram, ролі');
{
  const he = makeEnv(freshDB());
  const hq = (sql, ...a) => he.DB.prepare(sql).bind(...a).first();
  const o = await addClient(he, { id: 111, name: 'Власник' }), m = await addClient(he, { id: 222, name: 'Менеджер' });
  const hc = { O: await login(he, o), M: await login(he, m) };
  await call(he, 'GET', '/api/me', { cookie: hc.M });
  let n = 0;
  const lead = async host => {
    n++;
    const r = await call(he, 'POST', '/api/leads', { body: { phone: '06800000' + String(10 + n), service: 'Дизайн', source: 'cas-develop.com/dyzain-interieru-kyiv', form: 'landing', ref_path: '/proekty/monpark', ref_host: host }, headers: { ip: '10.8.0.' + n } });
    eq(r.status, 200, 'заявка прийнята');
    return hq('SELECT id, ref_host, ref_path FROM orders WHERE number = ?', r.data.number);
  };
  let G, C, E;
  await it('валідний хост зберігається (нижній регістр, без www.); Telegram — рядок «Джерело: …»', async () => {
    bot.reset();
    G = await lead('www.Google.com.ua'); eq(G.ref_host, 'google.com.ua'); eq(G.ref_path, '/proekty/monpark');
    ok(bot.calls.some(c => c.method === 'sendMessage' && /Джерело: Google \(google\.com\.ua\)/.test(c.text)), 'Telegram: Джерело: Google (google.com.ua)');
    C = await lead('chatgpt.com'); eq(C.ref_host, 'chatgpt.com');
    E = await lead('example.org'); eq(E.ref_host, 'example.org');
    bot.reset(); await lead('l.instagram.com');
    ok(bot.calls.some(c => /Джерело: Instagram \(l\.instagram\.com\)/.test(c.text || '')), 'Telegram: Instagram');
    bot.reset(); await lead(undefined);
    ok(bot.calls.length && bot.calls.every(c => !/Джерело:/.test(c.text || '')), 'без джерела — без рядка');
  });
  await it('сміття → null: скрипти, шляхи, схеми, порт, IP, задовге, наш домен, не рядок (заявка зберігається)', async () => {
    for (const bad of ['<script>alert(1)</script>', 'evil.com/path', 'https://evil.com', 'evil.com:8080', 'evil.com?x=1', 'ev il.com', '"><img src=x>.com', 'localhost',
      '192.168.0.1', '-evil.com', 'evil-.com', 'a..b.com', 'x'.repeat(78) + '.com', 'cas-develop.com', 'www.cas-develop.com', 'x.pages.dev', 123, { h: 'google.com' }, ['google.com'], ''])
      eq((await lead(bad)).ref_host, null, 'відхилено: ' + JSON.stringify(bad));
  });
  await it('CRM менеджера: ref_host і ref_src (людська назва), фільтр ?rh=, аналітика by_host', async () => {
    const all = await call(he, 'GET', '/api/admin/crm?kind=lead', { cookie: hc.M });
    eq(all.status, 200);
    const g = all.data.rows.find(x => x.id === G.id);
    eq(g.ref_host, 'google.com.ua'); eq(g.ref_src, 'Google (google.com.ua)');
    eq(all.data.rows.find(x => x.id === E.id).ref_src, 'example.org', 'невідомий сайт — сам хост');
    const ids = async q => (await call(he, 'GET', '/api/admin/crm?kind=lead&rh=' + q, { cookie: hc.M })).data.rows.map(x => x.id).sort((a, b) => a - b);
    eq(await ids('google'), [G.id]); eq(await ids('chatgpt'), [C.id]); eq(await ids('other'), [E.id]);
    eq((await ids('any')).length, 4, 'any — усі з джерелом');
    eq((await ids('nonsense')).length, n, 'невідомий ключ — фільтр ігнорується');
    const st = await call(he, 'GET', '/api/admin/crm?stats=1', { cookie: hc.O });
    ok(st.data.by_host.some(x => x.key === 'Google' && x.n === 1) && st.data.by_host.some(x => x.key === 'example.org'), 'by_host');
  });
  await it('CSV: колонка «Зовнішнє джерело» з назвою й хостом', async () => {
    const c = await call(he, 'GET', '/api/admin/crm?format=csv&kind=lead', { cookie: hc.O });
    eq(c.status, 200); ok(/;Зовнішнє джерело;/.test(c.text.split('\r\n')[0]), 'заголовок'); ok(c.text.includes(';Google (google.com.ua);'), 'значення');
  });
  await it('дизайнер (лише призначені): ref_host / ref_src не бачить, ?rh= ігнорується', async () => {
    const s = await call(he, 'POST', '/api/admin/staff', { cookie: hc.O, body: { name: 'Дизайнер', role: 'designer', email: 'des2@example.com' } });
    eq(s.status, 200);
    hc.D = await login(he, await addClient(he, { provider: 'google', id: 'g-des2', name: 'D', email: 'des2@example.com' }));
    eq((await call(he, 'PATCH', '/api/admin/crm', { cookie: hc.O, body: { id: G.id, assignee_staff_id: s.data.id } })).status, 200);
    const r = await call(he, 'GET', '/api/admin/crm?rh=chatgpt', { cookie: hc.D });
    eq(r.status, 200); eq(r.data.rows.map(x => x.id), [G.id]);
    ok(!('ref_host' in r.data.rows[0]) && !('ref_src' in r.data.rows[0]), 'без ref_host / ref_src');
  });
  await it('база без міграції 0019: заявка з ref_host зберігається з ref_path (0011); без 0011 — з form (0009)', async () => {
    for (const up of [18, 10]) {
      const oe = makeEnv(freshDB(up));
      const r = await call(oe, 'POST', '/api/leads', { body: { phone: '0501112288', form: 'landing', ref_path: '/proekty/monpark', ref_host: 'google.com' } });
      eq(r.status, 200, 'міграції до ' + up);
      const row = await oe.DB.prepare('SELECT * FROM orders WHERE number = ?').bind(r.data.number).first();
      ok(!('ref_host' in row)); eq(row.form, 'landing'); if (up >= 11) eq(row.ref_path, '/proekty/monpark');
    }
  });
}

describe('CRM обʼєктів: шаблони етапів, дата здачі, графік за схемою, фільтри (migrations/0012)');
{
  const ce = makeEnv(freshDB());
  const cq = (sql, ...a) => ce.DB.prepare(sql).bind(...a).first();
  const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const o = await addClient(ce, { id: 111, name: 'Власник' }), m = await addClient(ce, { id: 222, name: 'Менеджер' });
  const cl = await addClient(ce, { id: 990, name: 'Тест-клієнт', phone: '+380500000001' });
  const k = { O: await login(ce, o), M: await login(ce, m), C: await login(ce, cl) };
  await call(ce, 'GET', '/api/me', { cookie: k.M });
  const f1 = await call(ce, 'POST', '/api/admin/staff', { cookie: k.O, body: { name: 'Прораб А', role: 'foreman', tg: '444' } });
  const f2 = await call(ce, 'POST', '/api/admin/staff', { cookie: k.O, body: { name: 'Прораб Б', role: 'foreman', tg: '555' } });
  const A = f1.data.id, B = f2.data.id;
  k.A = await login(ce, await addClient(ce, { id: 444, name: 'А' }));
  k.B = await login(ce, await addClient(ce, { id: 555, name: 'Б' }));
  const proj = async (body, cookie = k.O) => call(ce, 'POST', '/api/admin/projects', { cookie, body: { type: 'project', client_id: cl, ...body } });
  const list = async (qs = '', cookie = k.O) => (await call(ce, 'GET', '/api/admin/projects' + qs, { cookie })).data;
  const get = async (id, cookie = k.O) => (await list('', cookie)).projects.find(p => p.id === id);
  // «Зберегти проєкт»: форма повертає версію, з якою її відкрили (functions/_ver.js)
  const save = async (id, stages, extra = {}, cookie = k.O) => call(ce, 'PATCH', '/api/admin/projects', { cookie, body: { id, ver: (await get(id)).ver, stages, ...extra } });
  let D1, R1, B1, O1;

  await it('GET віддає шаблони етапів за типом (одне джерело правди — сервер)', async () => {
    const d = await list();
    eq(Object.keys(d.templates), ['design', 'arch', 'repair', 'build', 'furnish', 'landscape', 'other']);
    eq(d.templates.design[0], 'Бриф'); eq(d.templates.design.length, 8); eq(d.templates.design[7], 'Авторський нагляд');
    eq(d.templates.arch, ['Ескізний проєкт', 'АР — архітектурні рішення', 'КР — конструктивні рішення', 'ОВ / ВК / ЕО (за завданням)', 'Генплан', 'Супровід дозвільних документів']);
    eq(d.design_services, ['design', 'arch']); eq(d.templates.build.length, 9); eq(d.templates.other, []);
    eq(Object.keys(d.schemes), ['50/50', '50/30/20', '50/40/10']);
  });
  await it('новий проєкт без stages → етапи з шаблону типу; явні stages — без шаблону', async () => {
    const tpl = (await list()).templates;
    const r = await proj({ title: 'Дизайн квартири', service: 'design', address: 'вул. Тестова, 5', area: 80, assignee_staff_id: A });
    eq(r.status, 200); D1 = r.data.id;
    const st = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages);
    eq(st.map(s => s.name), tpl.design); ok(st.every(s => s.status === 'planned' && s.progress === 0));
    eq(new Set(st.map(s => s.id)).size, 8, 'унікальні id етапів');
    B1 = (await proj({ title: 'Будинок', service: 'build' })).data.id;
    eq(JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', B1)).stages).length, 9);
    O1 = (await proj({ title: 'Інше', service: 'nonsense' })).data.id;
    const o1 = await cq('SELECT service, stages FROM projects WHERE id = ?', O1);
    eq(o1.service, 'other'); eq(JSON.parse(o1.stages), []);
    const own = (await proj({ title: 'Свої етапи', service: 'repair', stages: [{ name: 'Один' }] })).data.id;
    eq(JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', own)).stages).map(s => s.name), ['Один']);
  });
  await it('ремонт зі схемою 50/30/20: платежі від суми договору, привʼязані до першого / середнього / останнього етапу', async () => {
    const r = await proj({ title: 'Ремонт офісу', service: 'repair', contract_amount: 10000, contract_currency: 'EUR', scheme: '50/30/20', deadline: day(-3) });
    eq(r.status, 200); R1 = r.data.id;
    const st = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', R1)).stages);
    const pay = (await ce.DB.prepare('SELECT * FROM project_payments WHERE project_id = ? ORDER BY sort').bind(R1).all()).results;
    eq(pay.map(y => y.amount), [5000, 3000, 2000]); eq(pay.map(y => y.pct), [50, 30, 20]); ok(pay.every(y => y.currency === 'EUR' && y.status === 'planned'));
    eq(pay.map(y => y.stage_id), [st[0].id, st[3].id, st[6].id]);
    ok(/^Аванс 50%/.test(pay[0].title) && /Після завершення/.test(pay[2].title));
    const a = await cq("SELECT after FROM audit_log WHERE action = 'project.create' AND entity_id = ?", String(R1));
    eq(JSON.parse(a.after).scheme, '50/30/20');
  });
  await it('дата здачі: зберігається, прострочка = deadline < сьогодні і статус не «Завершено»', async () => {
    let p = await get(R1);
    eq(p.deadline, day(-3)); eq(p.overdue, true);
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.O, body: { id: R1, deadline: day(30) } })).status, 200);
    p = await get(R1); eq(p.deadline, day(30)); eq(p.overdue, false);
    await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.O, body: { id: R1, deadline: day(-1), status: 'done' } });
    eq((await get(R1)).overdue, false, 'завершений — не прострочений');
    await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.O, body: { id: R1, status: 'active' } });
    eq((await get(R1)).overdue, true);
    await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.O, body: { id: B1, deadline: 'завтра' } });
    eq((await get(B1)).deadline, null, 'некоректна дата → null');
    ok(await cq("SELECT 1 FROM audit_log WHERE action = 'project.update' AND entity_id = ? AND after LIKE '%deadline%'", String(R1)), 'зміна дати в аудиті');
  });
  await it('GET ?service= і ?status= фільтрують на сервері; невідоме значення ігнорується', async () => {
    eq((await list('?service=design')).projects.map(p => p.id), [D1]);
    eq((await list('?service=build&status=active')).projects.map(p => p.id), [B1]);
    eq((await list('?status=done')).projects.length, 0);
    eq((await list('?service=hack')).projects.length, (await list()).projects.length);
  });
  await it('без finance.edit схему платежів не створити (403); прораб не створює проєкт', async () => {
    eq((await proj({ title: 'x', service: 'repair' }, k.A)).status, 403);
    // дизайн-проєкт без суми: схема з порожніми сумами, але лише з правом фінансів — менеджер має
    const r = await proj({ title: 'Комплектація', service: 'furnish', scheme: '50/50' }, k.M);
    eq(r.status, 200);
    eq((await ce.DB.prepare('SELECT amount FROM project_payments WHERE project_id = ?').bind(r.data.id).all()).results.map(y => y.amount), [null, null]);
  });

  describe('CRM обʼєктів: погодження етапу дизайн-проєкту (approved_at, revisions)');
  await it('погодження менеджером (approve) і правки (rev_delta) зберігаються в етапі; некоректні — відкидаються; клієнт бачить «погоджено»', async () => {
    const st = (await get(D1)).stages;
    st[0].approve = day(-2); st[0].rev_delta = 3; st[1].approve = 'вчора'; st[1].rev_delta = 500; st[2].rev_delta = -4;
    eq((await save(D1, st)).status, 200);
    const s2 = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages);
    eq([s2[0].approved_at, s2[0].revisions], [day(-2), 3]);
    ok(!('approved_at' in s2[1])); eq(s2[1].revisions, 99, 'обмеження 99'); ok(!('revisions' in s2[2]), 'відʼємне → без поля');
    eq(s2.map(s => s.id), st.map(s => s.id), 'id етапів не змінились');
    eq(s2[0].hist.map(h => [h.act, h.by]), [['approve', 'Власник']], 'позначка менеджера — в історії етапу');
    // поля approved_at / revisions з форми для збереженого етапу ігноруються — лише явні дії
    const st2 = (await get(D1)).stages; st2[0].approved_at = day(-9); st2[0].revisions = 0; delete st2[1].revisions; st2[1].approved_at = day(-1);
    eq((await save(D1, st2)).status, 200);
    const s3 = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages);
    eq([s3[0].approved_at, s3[0].revisions, s3[1].approved_at, s3[1].revisions], [day(-2), 3, undefined, 99]);
    const st3 = (await get(D1)).stages; st3[1].rev_delta = -99; st3[1].approve = true;
    eq((await save(D1, st3)).status, 200);
    const s4 = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages);
    ok(!('revisions' in s4[1])); eq(s4[1].approved_at, new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }));
    const st4 = (await get(D1)).stages; st4[1].approve = false;
    eq((await save(D1, st4)).status, 200);
    const s5 = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages);
    ok(!('approved_at' in s5[1])); eq(s5[1].hist.map(h => h.act), ['approve', 'unapprove']);
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.O, body: { id: D1, stages: st4 } })).status, 428, 'список етапів без версії не приймаємо');
    const c = await call(ce, 'GET', '/api/account/projects', { cookie: k.C });
    eq(c.data.projects.find(p => p.id === D1).stages[0].approved_at, day(-2));
  });
  await it('«етап виконано» з кабінету працівника не стирає погодження', async () => {
    const sid = (await get(D1)).stages[0].id;
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'stage', project_id: D1, stage_id: sid, status: 'done' } })).status, 200);
    const s0 = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages)[0];
    eq([s0.status, s0.approved_at, s0.revisions], ['done', day(-2), 3]);
  });
  await it('клієнт сам погоджує етап на прийманні (POST /api/account/projects): Telegram, аудит, approved_by зберігається', async () => {
    const ap = (body, cookie = k.C) => call(ce, 'POST', '/api/account/projects', { cookie, body: { action: 'approve', project_id: D1, ...body } });
    const sid = (await get(D1)).stages[2].id, kyiv = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
    eq((await ap({ stage_id: sid })).status, 409, 'етап ще не на прийманні');
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'stage', project_id: D1, stage_id: sid, status: 'review' } })).status, 200);
    eq((await ap({ stage_id: sid }, k.A)).status, 404, 'чужий проєкт — як неіснуючий');
    eq((await ap({ stage_id: 'zzzzz' })).status, 404);
    eq((await call(ce, 'POST', '/api/account/projects', { cookie: k.C, body: { action: 'delete', project_id: D1, stage_id: sid } })).status, 400);
    eq((await call(ce, 'POST', '/api/account/projects', { body: { action: 'approve', project_id: D1, stage_id: sid } })).status, 401);
    bot.reset();
    const r = await ap({ stage_id: sid });
    eq(r.status, 200); eq(r.data.stage.approved_at, kyiv);
    const s = JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages)[2];
    eq([s.approved_at, s.approved_by, s.status], [kyiv, 'client', 'review']);
    ok(bot.calls.some(c => /Клієнт погодив етап/.test(c.text) && c.chat_id === '444'), 'відповідальному');
    ok(bot.calls.some(c => /Клієнт погодив етап/.test(c.text) && c.chat_id === '111'), 'власнику');
    ok(await cq("SELECT 1 FROM audit_log WHERE action = 'project.approve' AND entity_id = ? AND role = 'client'", String(D1)));
    eq((await ap({ stage_id: sid })).data.already, true, 'повторно — без змін');
    // збереження проєкту в адмінці не губить «погодив клієнт»
    eq((await save(D1, (await get(D1)).stages)).status, 200);
    eq(JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', D1)).stages)[2].approved_by, 'client');
  });
  await it('погодження клієнтом — лише для дизайн-проєкту', async () => {
    const r = await proj({ title: 'Ремонт для погодження', service: 'repair' });
    const sid = (await get(r.data.id)).stages[0].id;
    await call(ce, 'POST', '/api/team/action', { cookie: k.O, body: { type: 'stage', project_id: r.data.id, stage_id: sid, status: 'review' } });
    eq((await call(ce, 'POST', '/api/account/projects', { cookie: k.C, body: { action: 'approve', project_id: r.data.id, stage_id: sid } })).status, 404);
    await call(ce, 'DELETE', '/api/admin/projects?type=project&id=' + r.data.id, { cookie: k.O });
  });

  describe('CRM обʼєктів: задачі (project_tasks) — CRUD, права, кабінет працівника');
  let T1, T2, T3, TB;
  await it('власник створює задачу з виконавцем і терміном → Telegram виконавцю, аудит task.create; GET віддає tasks', async () => {
    bot.reset();
    const sid = (await get(D1)).stages[1].id;
    const r = await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: D1, title: 'Погодити планування', stage_id: sid, staff_id: A, due_date: day(-1) } });
    eq(r.status, 200); T1 = r.data.id;
    ok(bot.calls.some(c => c.chat_id === '444' && /Погодити планування/.test(c.text)), 'сповіщення виконавцю');
    T2 = (await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: D1, title: 'Замовити плитку', staff_id: B, due_date: day(5) } })).data.id;
    T3 = (await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: D1, title: 'Нічия задача', staff_id: null } })).data.id;
    TB = (await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: B1, title: 'Чужий обʼєкт', staff_id: B } })).data.id;
    const d = await list();
    const t1 = d.tasks.find(t => t.id === T1);
    eq([t1.title, t1.stage_id, t1.staff_name, t1.done], ['Погодити планування', sid, 'Прораб А', 0]);
    const p = d.projects.find(x => x.id === D1); eq([p.tasks_total, p.tasks_done], [3, 0]);
    ok(await cq("SELECT 1 FROM audit_log WHERE action = 'task.create' AND entity_id = ?", String(D1)));
    eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: D1, title: '  ' } })).status, 422);
    eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: D1, title: 'x', staff_id: 9999 } })).status, 422);
    const bad = (await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: D1, title: 'Етап чужий', stage_id: 'zzzzz' } })).data.id;
    eq((await cq('SELECT stage_id FROM project_tasks WHERE id = ?', bad)).stage_id, null, 'етап не з цього проєкту → null');
    await call(ce, 'DELETE', '/api/admin/projects?type=task&id=' + bad, { cookie: k.O });
  });
  await it('прораб бачить задачі лише своїх обʼєктів; чужий обʼєкт — 404', async () => {
    const d = await list('', k.A);
    eq(d.projects.map(p => p.id), [D1]); ok(!d.tasks.some(t => t.id === TB), 'без задач чужого обʼєкта');
    eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'task', project_id: B1, title: 'x' } })).status, 404);
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.A, body: { type: 'task', id: TB, done: true } })).status, 404);
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'task', project_id: B1, task_id: TB } })).status, 404);
  });
  await it('прораб: свою задачу ставить лише на себе, редагувати чуже чи поля — 403, видаляти — 403', async () => {
    const r = await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'task', project_id: D1, title: 'Купити профіль' } });
    eq(r.status, 200); eq((await cq('SELECT staff_id FROM project_tasks WHERE id = ?', r.data.id)).staff_id, A, 'на себе');
    eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'task', project_id: D1, title: 'x', staff_id: B } })).status, 403);
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.A, body: { type: 'task', id: T1, title: 'Інше' } })).status, 403);
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.A, body: { type: 'task', id: T2, done: true } })).status, 403, 'задача Прораба Б');
    eq((await call(ce, 'DELETE', '/api/admin/projects?type=task&id=' + r.data.id, { cookie: k.A })).status, 403);
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.A, body: { type: 'task', id: r.data.id, done: true } })).status, 200);
    eq((await cq('SELECT done, done_by FROM project_tasks WHERE id = ?', r.data.id)).done_by, A);
  });
  await it('/kabinet/team: мої невиконані задачі як kind «task» (прострочена — urgent), чекліст обʼєкта; чужих у «Сьогодні» немає', async () => {
    const t = await call(ce, 'GET', '/api/team/today', { cookie: k.A });
    eq(t.status, 200);
    const mine = t.data.tasks.filter(x => x.kind === 'task');
    eq(mine.map(x => x.task_id), [T1]); eq(mine[0].urgent, true); eq(mine[0].due, day(-1)); ok(/етап/.test(mine[0].sub));
    const p = t.data.projects.find(x => x.id === D1);
    eq(p.tasks.length, 4); ok(p.tasks.find(x => x.id === T1).mine && !p.tasks.find(x => x.id === T2).mine);
    eq(p.tasks.find(x => x.id === T1).stage_name, (await get(D1)).stages[1].name);
    // виконавця задачі додано в команду обʼєкта — Б бачить свої задачі й ці обʼєкти, але не задачі А
    const tb = await call(ce, 'GET', '/api/team/today', { cookie: k.B });
    eq(tb.data.tasks.filter(x => x.kind === 'task').map(x => x.task_id), [T2, TB]);
    eq(tb.data.projects.map(x => x.id).sort(), [D1, B1].sort());
    ok(await cq('SELECT 1 FROM project_staff WHERE project_id = ? AND staff_id = ?', B1, B), 'Б у команді B1');
  });
  await it('працівник відмічає свою задачу (team/action type task) — зникає з «Сьогодні», аудит task.done; чужу — 403; нічию — можна', async () => {
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'task', project_id: D1, task_id: T2 } })).status, 403);
    const r = await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'task', project_id: D1, task_id: T1 } });
    eq(r.status, 200); eq(r.data.done, true);
    const row = await cq('SELECT done, done_by, done_at FROM project_tasks WHERE id = ?', T1);
    eq([row.done, row.done_by], [1, A]); ok(row.done_at);
    ok(!(await call(ce, 'GET', '/api/team/today', { cookie: k.A })).data.tasks.some(x => x.task_id === T1));
    ok(await cq("SELECT 1 FROM audit_log WHERE action = 'task.done' AND staff_id = ?", A));
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'task', project_id: D1, task_id: T3 } })).status, 200, 'без виконавця');
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'task', project_id: D1, task_id: T1, done: false } })).status, 200);
    eq((await cq('SELECT done, done_at FROM project_tasks WHERE id = ?', T1)).done_at, null, 'повернуто в роботу');
    eq((await call(ce, 'POST', '/api/team/action', { cookie: k.A, body: { type: 'task', project_id: D1, task_id: TB } })).status, 404, 'задача іншого обʼєкта');
  });
  await it('власник редагує і видаляє задачу; видалення проєкту прибирає його задачі', async () => {
    eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.O, body: { type: 'task', id: T2, title: 'Замовити плитку 60×60', staff_id: A, done: true } })).status, 200);
    const t2 = await cq('SELECT * FROM project_tasks WHERE id = ?', T2);
    eq([t2.title, t2.staff_id, t2.done], ['Замовити плитку 60×60', A, 1]);
    eq((await call(ce, 'DELETE', '/api/admin/projects?type=task&id=' + T3, { cookie: k.O })).status, 200);
    ok(!await cq('SELECT 1 FROM project_tasks WHERE id = ?', T3)); ok(await cq("SELECT 1 FROM audit_log WHERE action = 'task.delete'"));
    eq((await call(ce, 'DELETE', '/api/admin/projects?type=task&id=' + T3, { cookie: k.O })).status, 404, 'вже немає');
    const tmp = (await proj({ title: 'На видалення', service: 'repair' })).data.id;
    await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'task', project_id: tmp, title: 'x' } });
    eq((await call(ce, 'DELETE', '/api/admin/projects?type=project&id=' + tmp, { cookie: k.O })).status, 200);
    ok(!await cq('SELECT 1 FROM project_tasks WHERE project_id = ?', tmp));
  });
  await it('дашборд «Студія»: прострочені задачі й дати здачі — у «прострочене»', async () => {
    const r = await call(ce, 'GET', '/api/admin/studio', { cookie: k.O });
    eq(r.status, 200);
    ok(r.data.overdue.tasks.some(t => t.id === T1 && t.project_title === 'Дизайн квартири'), 'прострочена задача');
    ok(!r.data.overdue.tasks.some(t => t.id === T2), 'виконана — ні');
    ok(r.data.overdue.deadlines.some(p => p.project_id === R1), 'обʼєкт з минулою датою здачі');
    eq(r.data.workload.find(w => w.id === A).late_tasks, 1);
  });

  describe('Безпека: платежі, документи й DELETE лише видимого обʼєкта (canSeeProject)');
  await it('працівник з правами фінансів/редагування, але без projects.view_all — чужий обʼєкт 404', async () => {
    const R = await import('../../functions/_roles.js');
    const was = R.ROLES.foreman.perms.slice();
    R.ROLES.foreman.perms.push('finance.edit', 'finance.view', 'projects.edit');
    try {
      const pay = (await ce.DB.prepare('SELECT id FROM project_payments WHERE project_id = ?').bind(R1).first()).id;
      eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'payment', project_id: R1, title: 'Хак', amount: 1 } })).status, 404, 'POST платежу');
      eq((await call(ce, 'PATCH', '/api/admin/projects', { cookie: k.A, body: { type: 'payment', id: pay, status: 'paid' } })).status, 404, 'PATCH платежу');
      eq((await cq('SELECT status FROM project_payments WHERE id = ?', pay)).status, 'planned');
      eq((await call(ce, 'DELETE', '/api/admin/projects?type=payment&id=' + pay, { cookie: k.A })).status, 404, 'DELETE платежу');
      eq((await call(ce, 'DELETE', '/api/admin/projects?type=project&id=' + B1, { cookie: k.A })).status, 404, 'DELETE проєкту');
      eq((await call(ce, 'DELETE', '/api/admin/projects?type=task&id=' + TB, { cookie: k.A })).status, 404, 'DELETE задачі');
      eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'document', client_id: cl, project_id: B1, kind: 'act', title: 'x', url: 'https://example.com/a.pdf' } })).status, 404, 'документ до чужого');
      ok(await cq('SELECT 1 FROM projects WHERE id = ?', B1) && await cq('SELECT 1 FROM project_payments WHERE id = ?', pay));
      eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'payment', project_id: D1, title: 'Свій', amount: 1 } })).status, 200, 'свій обʼєкт — можна');
    } finally { R.ROLES.foreman.perms.length = 0; R.ROLES.foreman.perms.push(...was); }
    eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.A, body: { type: 'payment', project_id: D1, title: 'x' } })).status, 403, 'права повернуто');
  });

  describe('Проєктування (дизайн і архітектура): відповідальний етапу, круги правок, результати, «Потрібні правки» клієнта');
  {
    let AR;
    const stg = async id => JSON.parse((await cq('SELECT stages FROM projects WHERE id = ?', id)).stages);
    await it('архітектурний проєкт: шаблон АР/КР, прогрес у списку', async () => {
      const r = await proj({ title: 'Будинок 180 м² — архпроєкт', service: 'arch', area: 180, assignee_staff_id: A });
      eq(r.status, 200); AR = r.data.id;
      const p = await get(AR);
      eq(p.service, 'arch'); eq(p.stages.length, 6); eq(p.progress, 0);
      eq((await list('?service=arch')).projects.map(x => x.id), [AR]);
    });
    await it('відповідальний етапу і rev_max: зберігаються, працівник потрапляє в команду й отримує Telegram; вимкнений/неіснуючий → 422', async () => {
      const st = (await get(AR)).stages;
      st[0].staff_id = B; st[0].rev_max = 2; st[0].end = day(-1); st[1].rev_max = 500;
      bot.reset();
      eq((await save(AR, st)).status, 200);
      const s2 = await stg(AR);
      eq([s2[0].staff_id, s2[0].rev_max, s2[1].rev_max], [B, 2, 20]);
      ok(await cq('SELECT 1 FROM project_staff WHERE project_id = ? AND staff_id = ?', AR, B), 'у команді');
      ok(bot.calls.some(c => c.chat_id === '555' && /Вам призначено етап/.test(c.text)), 'Telegram відповідальному етапу');
      bot.reset();
      eq((await save(AR, (await get(AR)).stages)).status, 200);
      ok(!bot.calls.some(c => /Вам призначено етап/.test(c.text)), 'повторне збереження — без повторного сповіщення');
      const bad1 = (await get(AR)).stages; bad1[2].staff_id = 99999;
      eq((await save(AR, bad1)).status, 422);
      eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'project', client_id: cl, title: 'x', service: 'arch', stages: [{ name: 'Е', staff_id: 99999 }] } })).status, 422);
    });
    await it('кабінет працівника: «Мій етап» у «Сьогодні» (прострочений — urgent), відповідальний і правки — в етапах обʼєкта', async () => {
      const r = await call(ce, 'GET', '/api/team/today', { cookie: k.B });
      eq(r.status, 200);
      const t = r.data.tasks.find(x => x.kind === 'stage' && x.project_id === AR);
      ok(t && t.mine && t.urgent && /^Мій етап/.test(t.title), JSON.stringify(t));
      const p = r.data.projects.find(x => x.id === AR);
      eq([p.stages[0].mine, p.stages[0].staff_name], [true, 'Прораб Б']);
    });
    await it('клієнт не бачить staff_id етапу; результати етапу (render/drawing/spec) — з stage_id', async () => {
      const sid = (await get(AR)).stages[0].id;
      for (const kind of ['render', 'drawing', 'spec'])
        eq((await call(ce, 'POST', '/api/admin/projects', { cookie: k.O, body: { type: 'document', client_id: cl, project_id: AR, kind, stage_id: sid, title: 'Ескіз ' + kind, url: 'https://example.com/' + kind + '.pdf' } })).status, 200);
      const c = (await call(ce, 'GET', '/api/account/projects', { cookie: k.C })).data.projects.find(x => x.id === AR);
      ok(!('staff_id' in c.stages[0]), 'staff_id приховано'); eq(c.stages[0].rev_max, 2);
      eq(c.documents.filter(x => x.stage_id === sid).map(x => x.kind).sort(), ['drawing', 'render', 'spec']);
    });
    await it('«Потрібні правки»: лише етап на прийманні, коментар обовʼязковий; revisions + 1, етап у роботу, понад rev_max — over; Telegram і аудит', async () => {
      const sid = (await get(AR)).stages[0].id;
      const rv = (body, cookie = k.C) => call(ce, 'POST', '/api/account/projects', { cookie, body: { action: 'revise', project_id: AR, stage_id: sid, ...body } });
      eq((await rv({ note: 'Зсунути вхід' })).status, 409, 'етап ще не на прийманні');
      const review = () => call(ce, 'POST', '/api/team/action', { cookie: k.O, body: { type: 'stage', project_id: AR, stage_id: sid, status: 'review' } });
      eq((await review()).status, 200);
      eq((await rv({ note: 'ok' })).status, 422, 'закороткий коментар');
      eq((await rv({ note: 'Зсунути вхід' }, k.B)).status, 404, 'чужий проєкт');
      bot.reset();
      const r = await rv({ note: 'Зсунути вхід на 1 м і додати навіс <b>' });
      eq(r.status, 200); eq([r.data.stage.revisions, r.data.stage.over, r.data.stage.status], [1, false, 'in_progress']);
      let s0 = (await stg(AR))[0];
      eq([s0.status, s0.revisions, s0.rev_note], ['in_progress', 1, 'Зсунути вхід на 1 м і додати навіс <b>']);
      eq(s0.hist.map(h => h.act), ['revise']); eq(s0.hist[0].note, 'Зсунути вхід на 1 м і додати навіс <b>');
      ok(s0.progress <= 90);
      ok(bot.calls.some(c => c.chat_id === '555' && /просить правки/.test(c.text) && /&lt;b&gt;/.test(c.text)), 'відповідальному етапу, HTML екрановано');
      ok(bot.calls.some(c => c.chat_id === '444' && /просить правки/.test(c.text)), 'відповідальному обʼєкта');
      ok(await cq("SELECT 1 FROM audit_log WHERE action = 'project.revise' AND entity_id = ? AND role = 'client'", String(AR)));
      eq((await rv({ note: 'Ще раз' })).status, 409, 'етап у роботі — не можна');
      await review(); await rv({ note: 'Друга правка' }); await review();
      const r3 = await rv({ note: 'Третя правка' });
      eq([r3.data.stage.revisions, r3.data.stage.over], [3, true], 'понад 2 круги за договором');
      // адмінка зберігає коментар клієнта
      eq((await save(AR, (await get(AR)).stages)).status, 200);
      s0 = (await stg(AR))[0]; eq([s0.revisions, s0.rev_note], [3, 'Третя правка']);
      eq(s0.hist.map(h => h.act), ['revise', 'revise', 'revise'], 'історія етапу зберігається адмінкою');
      ok(!('hist' in (await call(ce, 'GET', '/api/account/projects', { cookie: k.C })).data.projects.find(x => x.id === AR).stages[0]), 'клієнт історію не бачить');
      await review();
      eq((await call(ce, 'POST', '/api/account/projects', { cookie: k.C, body: { action: 'approve', project_id: AR, stage_id: sid } })).status, 200, 'погодження архітектури');
      eq((await rv({ note: 'Після погодження' })).status, 409);
      const t = (await call(ce, 'GET', '/api/team/today', { cookie: k.B })).data.projects.find(x => x.id === AR);
      eq(t.stages[0].revisions, 3);
    });
    await it('«Потрібні правки» не для ремонту', async () => {
      const r = await proj({ title: 'Ремонт без правок', service: 'repair' });
      const sid = (await get(r.data.id)).stages[0].id;
      await call(ce, 'POST', '/api/team/action', { cookie: k.O, body: { type: 'stage', project_id: r.data.id, stage_id: sid, status: 'review' } });
      eq((await call(ce, 'POST', '/api/account/projects', { cookie: k.C, body: { action: 'revise', project_id: r.data.id, stage_id: sid, note: 'Переробити' } })).status, 404);
      await call(ce, 'DELETE', '/api/admin/projects?type=project&id=' + r.data.id, { cookie: k.O });
      await call(ce, 'DELETE', '/api/admin/projects?type=project&id=' + AR, { cookie: k.O });
    });
  }

  describe('Сумісність: база без міграції 0012');
  await it('дата здачі й задачі не ламають решту: створення з шаблоном, PATCH, GET, кабінет, студія', async () => {
    const oe = makeEnv(freshDB(11));
    const ow = await login(oe, await addClient(oe, { id: 111, name: 'В' }));
    await addClient(oe, { id: 991, name: 'К' });
    const cid = (await oe.DB.prepare('SELECT id FROM clients WHERE provider_id = ?').bind('991').first()).id;
    const r = await call(oe, 'POST', '/api/admin/projects', { cookie: ow, body: { type: 'project', client_id: cid, title: 'Старий', service: 'landscape', deadline: '2030-01-01', scheme: '50/50', contract_amount: 100 } });
    eq(r.status, 200, JSON.stringify(r.data));
    const row = await oe.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(r.data.id).first();
    ok(!('deadline' in row)); eq(JSON.parse(row.stages).length, 7);
    eq((await oe.DB.prepare('SELECT COUNT(*) AS n FROM project_payments').first()).n, 2);
    eq((await call(oe, 'PATCH', '/api/admin/projects', { cookie: ow, body: { id: r.data.id, title: 'Старий 2', deadline: '2031-01-01' } })).status, 200);
    const g = await call(oe, 'GET', '/api/admin/projects', { cookie: ow });
    eq(g.status, 200); eq(g.data.tasks, []); eq(g.data.tasks_ready, false); eq(g.data.projects[0].title, 'Старий 2');
    eq((await call(oe, 'POST', '/api/admin/projects', { cookie: ow, body: { type: 'task', project_id: r.data.id, title: 'x' } })).status, 503);
    eq((await call(oe, 'GET', '/api/team/today', { cookie: ow })).status, 200);
    eq((await call(oe, 'POST', '/api/team/action', { cookie: ow, body: { type: 'task', project_id: r.data.id, task_id: 1 } })).status, 503);
    const st = await call(oe, 'GET', '/api/admin/studio', { cookie: ow });
    eq(st.status, 200); eq(st.data.overdue.tasks, []);
  });
}

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
  await it('catalog.json: пороги 460 000/920 000/1 840 000 ₴ → 3/5/7%, мінімум 10 шт', async () => {
    eq(cat.volume_discounts, [[460000, 3], [920000, 5], [1840000, 7]]); eq(cat.min_qty, 10);
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
  await it('знижка за обсягом: ≥460k — 3%, ≥920k — 5%, ≥1 840k — 7% (нижче 460k заявка не проходить)', async () => {
    for (const [g, pct] of [[460000, 3], [920000, 5], [1840000, 7]]) {
      const r = await order(qFor(g)); eq(r.status, 200, JSON.stringify(r.data)); eq(r.data.discount_pct, pct, `сума ${r.data.goods}`);
      eq(r.data.discount, Math.round(r.data.goods * pct / 100)); eq(r.data.total, r.data.goods - r.data.discount); eq(r.data.shipping, 0, 'доставка не в сумі');
    }
  });
  await it('код партнера: більший за обсягову — діє код; менший — діє обсягова; не сумуються', async () => {
    await se.DB.prepare("INSERT INTO partner_codes (code, name, discount) VALUES ('DIZ-TEST', 'Тест', 4), ('DIZ-HIGH', 'Тест 2', 6)").run();
    const a = await order(qFor(470000), { promo: 'diz-high' });
    eq(a.data.discount_pct, 6, 'код 6% > обсягова 3%'); eq(a.data.promo, 'DIZ-HIGH');
    const b = await order(qFor(930000), { promo: 'DIZ-TEST' });
    eq(b.data.discount_pct, 5, 'обсягова 5% > код 4% — не 9%');
    const c = await order(qFor(470000), { promo: 'NOPE-CODE' });
    eq(c.data.discount_pct, 3); eq(c.data.promo, null, 'невідомий код не застосовано');
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

// «Партнери» і API бота пошуку (migrations/0013) — окремий файл, спільний звіт
await import('./partners.mjs');
// CRM v2: пропозиція з заявки й конверсія в проєкт (migrations/0014) — окремий файл, спільний звіт
await import('./crm2.mjs');
// Аудит безпеки 19.11.2026: підтверджені контакти працівників, вхід за номером, журнал етапу, довідники, заголовки — спільний звіт
await import('./sec.mjs');
// CRM v3 (19.11.2026): версії карток і одночасне редагування, ліміти записів працівників, сторінки довгих списків — спільний звіт
await import('./crm3.mjs');
// Ліміт D1 — 100 параметрів на запит: списки id одним JSON-параметром (20.11.2026) — спільний звіт
await import('./d1limit.mjs');
// CRM v4 (20.11.2026): задачі (CRUD, права, сповіщення, зведення) і таблиці контактів (сортування, архів, масові дії, імпорт / експорт CSV)
await import('./crm4.mjs');

process.exit(report() ? 1 : 0);
