// Тести CRM v2 (18.11.2026): заявка → пропозиція «від $…» → проєкт (migrations/0014_lead_offer.sql, functions/api/admin/crm.js OFFER,
// POST /api/admin/projects {type: 'from_lead'}). Запускається з run.mjs (спільний звіт); окремо: node tools/tests/crm2.mjs.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';

const env = makeEnv(freshDB());
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
const NB = ' ';

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const DES = await addClient(env, { id: 444, name: 'Дизайнер' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, DES })) ck[k] = await login(env, id);
await call(env, 'GET', '/api/me', { cookie: ck.OWNER }); await call(env, 'GET', '/api/me', { cookie: ck.MGR });
const dz = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Дизайнерка', role: 'designer', tg: '444' } });
const DES_ID = dz.data.id;
ck.DES = await login(env, DES);

const lead = async (body, cookie = ck.OWNER) => (await call(env, 'POST', '/api/admin/crm', { cookie, body: { name: 'Клієнт', ...body } })).data.id;
const patch = (body, cookie = ck.OWNER) => call(env, 'PATCH', '/api/admin/crm', { cookie, body });
const rows = async (cookie = ck.OWNER) => (await call(env, 'GET', '/api/admin/crm?kind=lead', { cookie })).data;

describe('Пропозиція з заявки: ставки CLAUDE.md, «від $…», мінімум дизайну, Європа');
let L1;
await it('GET віддає типи пропозиції: спершу пріоритетні (дизайн, ремонт під ключ, будинок, комерція), ставки — з functions/_rates.js', async () => {
  const d = await rows();
  eq(d.offers.slice(0, 5).map(o => o.key), ['dz', 'reno', 'key', 'box', 'office']);
  const by = Object.fromEntries(d.offers.map(o => [o.key, o.rate]));
  eq([by.dz, by.reno, by.office, by.furn, by.box, by.key, by.arch, by.land, by.plan, by.full],
    [[30, 45], [550, 850], [350, null], [250, 400], [600, 900], [1100, 1700], [12, 18], [50, null], [6, null], [45, null]]);
  eq(d.offers.find(o => o.key === 'dz').min, [2500, 4000]); eq(d.offers.find(o => o.key === 'reno').min, null);
  eq(d.offers.find(o => o.key === 'land').unit, 'сотка');
});
await it('дизайн 85 м² → від $2 550; заявка «Нова» → «Розрахунок», подія з рядком розрахунку, аудит', async () => {
  L1 = await lead({ phone: '0671234567', service: 'Дизайн квартири', city: 'Київ' });
  const r = await patch({ id: L1, offer: { key: 'dz', area: 85, region: 'ua' } });
  eq(r.status, 200); eq(r.data.status, 'quote_sent'); eq(r.data.offer.from, 2550); eq(r.data.offer.rate, 30);
  eq(r.data.offer_line, `Дизайн-проєкт інтерʼєру: 85 м² — від $2${NB}550 ($30/м²)`);
  const o = await q1('SELECT * FROM orders WHERE id = ?', L1);
  eq(o.status, 'quote_sent'); ok(o.taken_at, 'перший перехід із «Нове» = взяли в роботу');
  eq(JSON.parse(o.offer).by, 'Власник');
  ok(await q1("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'quote_sent' AND note LIKE 'Розрахунок: Дизайн-проєкт%'", L1));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'lead.update' AND entity_id = ? AND after LIKE '%offer%'", String(L1)));
  eq((await rows()).rows.find(x => x.id === L1).offer.from, 2550, 'пропозиція в списку');
});
await it('мінімум дизайну $2 500 (Європа $4 000); Європа — +50%; немає ставки → «за кошторисом»; ландшафт — за сотку', async () => {
  const L = await lead({ phone: '0670000001' });
  const f = async (offer) => (await patch({ id: L, offer })).data;
  let d = await f({ key: 'dz', area: 40 }); eq(d.offer.from, 2500); ok(/мінімум \$2 500/.test(d.offer_line), d.offer_line);
  d = await f({ key: 'dz', area: 40, region: 'eu' }); eq([d.offer.from, d.offer.rate, d.offer.region], [4000, 45, 'eu']); ok(/Європа$/.test(d.offer_line));
  d = await f({ key: 'reno', area: 60 }); eq(d.offer.from, 33000); eq(d.offer.min, null);
  d = await f({ key: 'reno', area: 60, region: 'eu' }); eq(d.offer.from, 51000);
  d = await f({ key: 'key', area: 150 }); eq(d.offer.from, 165000);
  d = await f({ key: 'office', area: 200, region: 'eu' }); eq(d.offer.from, null); ok(/за кошторисом/.test(d.offer_line));
  d = await f({ key: 'land', area: '6,5' }); eq([d.offer.from, d.offer.unit, d.offer.area], [325, 'сотка', 6.5]);
  d = await f({ key: 'arch', area: 180 }); eq(d.offer.from, 2160);
  eq((await q1('SELECT status FROM orders WHERE id = ?', L)).status, 'quote_sent', 'повторні розрахунки не міняють стадію далі');
});
await it('невалідна пропозиція → 422 без змін; null — прибрати; замовлення Оздоби → 400', async () => {
  const L = await lead({ phone: '0670000002' });
  for (const offer of [{ key: 'hack', area: 10 }, { key: 'dz', area: 0 }, { key: 'dz', area: -5 }, { key: 'dz', area: 'багато' }, { key: 'dz', area: 1e7 }, [1], 'dz', { key: '__proto__', area: 5 }])
    eq((await patch({ id: L, offer })).status, 422, JSON.stringify(offer));
  const o = await q1('SELECT status, offer FROM orders WHERE id = ?', L);
  eq([o.status, o.offer], ['new', null]);
  await patch({ id: L, offer: { key: 'dz', area: 90 } });
  eq((await patch({ id: L, offer: null })).status, 200);
  eq((await q1('SELECT offer FROM orders WHERE id = ?', L)).offer, null);
  await DB.prepare("INSERT INTO orders (number, kind, items, status) VALUES ('OZD-T-1', 'order', '[]', 'new')").run();
  const oid = (await q1("SELECT id FROM orders WHERE number = 'OZD-T-1'")).id;
  eq((await patch({ id: oid, offer: { key: 'dz', area: 10 } })).status, 400);
});
await it('дизайнер: розрахунок лише своєї заявки (чужа — 404)', async () => {
  const mine = await lead({ phone: '0670000003', assignee_staff_id: DES_ID });
  const other = await lead({ phone: '0670000004' });
  eq((await patch({ id: mine, offer: { key: 'dz', area: 70 } }, ck.DES)).status, 200);
  eq((await patch({ id: other, offer: { key: 'dz', area: 70 } }, ck.DES)).status, 404);
});

describe('Заявка → проєкт однією кнопкою (POST /api/admin/projects {type: \'from_lead\'})');
let P1;
await it('без клієнта: новий клієнт provider phone, тип і площа з пропозиції, місто → адреса, заявка → «Проєкт: етапи», project_id', async () => {
  bot.reset();
  await patch({ id: L1, assignee_staff_id: DES_ID });
  const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.MGR, body: { type: 'from_lead', order_id: L1 } });
  eq(r.status, 200); P1 = r.data.id;
  const p = await q1('SELECT * FROM projects WHERE id = ?', P1);
  eq([p.service, p.area, p.address, p.order_id, p.assignee_staff_id], ['design', 85, 'Київ', L1, DES_ID]);
  eq(p.title, 'Дизайн-проєкт · Клієнт');
  eq(JSON.parse(p.stages)[0].name, 'Бриф');
  const c = await q1('SELECT * FROM clients WHERE id = ?', p.client_id);
  eq([c.provider, c.provider_id, c.phone, c.name, c.last_login], ['phone', '+380671234567', '+380671234567', 'Клієнт', null]);
  const o = await q1('SELECT * FROM orders WHERE id = ?', L1);
  eq([o.status, o.project_id, o.client_id], ['project', P1, p.client_id]);
  ok(await q1("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'project'", L1));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'lead.convert' AND entity_id = ?", String(L1)));
  ok(bot.calls.some(x => x.chat_id === '444' && /Вам призначено обʼєкт/.test(x.text)), 'відповідальному заявки');
});
await it('повторна конверсія → 409 з id проєкту; картка проєкту показує заявку (сторінка-джерело — лише власнику й менеджеру)', async () => {
  const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'from_lead', order_id: L1 } });
  eq(r.status, 409); eq(r.data.id, P1);
  await DB.prepare("UPDATE orders SET ref_path = '/proekty/monpark', source = 'cas-develop.com/dyzain-interieru-kyiv#prices' WHERE id = ?").bind(L1).run();
  const pr = (await call(env, 'GET', '/api/admin/projects', { cookie: ck.OWNER })).data.projects.find(x => x.id === P1);
  eq(pr.lead.number, (await q1('SELECT number FROM orders WHERE id = ?', L1)).number); eq(pr.lead.ref_path, '/proekty/monpark');
  const dpr = (await call(env, 'GET', '/api/admin/projects', { cookie: ck.DES })).data.projects.find(x => x.id === P1);
  ok(dpr && dpr.lead && !('ref_path' in dpr.lead), 'дизайнер бачить свій обʼєкт без сторінки-джерела');
});
await it('клієнт входить за тим самим номером (Telegram-бот) — бачить свій проєкт у кабінеті', async () => {
  const { upsertClient } = await import('../../functions/_lib.js');
  const c = await upsertClient(env, { provider: 'phone', provider_id: '+380671234567', name: 'Олена' });
  eq(c.id, (await q1('SELECT client_id FROM projects WHERE id = ?', P1)).client_id);
  const r = await call(env, 'GET', '/api/account/projects', { cookie: await login(env, c.id) });
  eq(r.data.projects.map(p => p.id), [P1]);
});
await it('номер, підтверджений входом через бота (login_requests) → проєкт іде на той акаунт; телефону з профілю не віримо', async () => {
  const tgc = await addClient(env, { id: 7001, name: 'Тарас TG', phone: '+380509990000' }); // телефон «у профілі»
  const L = await lead({ phone: '050 999 00 00', service: 'Ремонт квартири' });
  const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'from_lead', order_id: L } });
  ok((await q1('SELECT client_id FROM projects WHERE id = ?', r.data.id)).client_id !== tgc, 'не прикріплено до чужого профілю');
  const real = await addClient(env, { id: 7002, name: 'Тарас справжній' });
  await DB.prepare("INSERT INTO login_requests (token, phone, browser_hash, status, client_id, created_at, expires_at) VALUES ('t1', '+380507770000', 'h', 'used', ?, 1, 2)").bind(real).run();
  const L2 = await lead({ phone: '+38 050 777 00 00', service: 'Ремонт офісу' });
  const r2 = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'from_lead', order_id: L2, title: 'Офіс на Подолі' } });
  const p2 = await q1('SELECT * FROM projects WHERE id = ?', r2.data.id);
  eq([p2.client_id, p2.title, p2.service, p2.area], [real, 'Офіс на Подолі', 'repair', null], 'тип — з тексту заявки');
});
await it('заявка без телефону → клієнт «crm»; права: дизайнер без projects.edit — 403; чужа заявка — 404', async () => {
  const L = await lead({ email: 'x@example.com', service: 'Архітектурний проєкт будинку' });
  const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'from_lead', order_id: L } });
  eq(r.status, 200);
  const c = await q1('SELECT c.* FROM clients c JOIN projects p ON p.client_id = c.id WHERE p.id = ?', r.data.id);
  eq([c.provider, c.provider_id, c.email], ['crm', 'lead-' + L, 'x@example.com']);
  eq((await q1('SELECT service FROM projects WHERE id = ?', r.data.id)).service, 'arch');
  const L3 = await lead({ phone: '0670000005', assignee_staff_id: DES_ID });
  eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.DES, body: { type: 'from_lead', order_id: L3 } })).status, 403);
  eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'from_lead', order_id: 999999 } })).status, 404);
});

describe('Сумісність: база без міграції 0014');
await it('пропозиція → 503 без часткового збереження; конверсія працює (без orders.project_id)', async () => {
  const oe = makeEnv(freshDB(13));
  const o = await addClient(oe, { id: 111, name: 'Власник' });
  const k = await login(oe, o);
  await call(oe, 'GET', '/api/me', { cookie: k });
  const id = (await call(oe, 'POST', '/api/admin/crm', { cookie: k, body: { name: 'Стара', phone: '0671110000', service: 'Дизайн' } })).data.id;
  const r = await call(oe, 'PATCH', '/api/admin/crm', { cookie: k, body: { id, offer: { key: 'dz', area: 50 } } });
  eq(r.status, 503);
  eq((await oe.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first()).status, 'new');
  eq((await call(oe, 'GET', '/api/admin/crm', { cookie: k })).status, 200);
  const c = await call(oe, 'POST', '/api/admin/projects', { cookie: k, body: { type: 'from_lead', order_id: id } });
  eq(c.status, 200);
  eq((await call(oe, 'POST', '/api/admin/projects', { cookie: k, body: { type: 'from_lead', order_id: id } })).status, 409, 'повтор — за projects.order_id');
});

if (process.argv[1] && process.argv[1].endsWith('crm2.mjs')) process.exit(report() ? 1 : 0);
