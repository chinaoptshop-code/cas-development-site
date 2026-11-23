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

describe('Новий проєкт із клієнтом, якого менеджер вписав сам (POST /api/admin/projects {type: \'project\', new_client})');
const NP = (body, cookie = ck.OWNER) => call(env, 'POST', '/api/admin/projects', { cookie, body: { type: 'project', title: 'Будинок, тест', service: 'arch', ...body } });
await it('імʼя + номер → клієнт provider phone, проєкт на ньому; той самий номер удруге — той самий клієнт, імʼя не переписуємо', async () => {
  const before = (await q1('SELECT COUNT(*) AS n FROM clients')).n;
  const r = await NP({ new_client: { name: 'Новий Клієнт', phone: '067 555 00 11' }, area: 550 });
  eq(r.status, 200);
  const c = await q1('SELECT * FROM clients WHERE id = ?', r.data.client_id);
  eq([c.provider, c.provider_id, c.name, c.phone], ['phone', '+380675550011', 'Новий Клієнт', '+380675550011']);
  eq((await q1('SELECT client_id, service, area FROM projects WHERE id = ?', r.data.id)), { client_id: c.id, service: 'arch', area: 550 });
  const r2 = await NP({ new_client: { name: 'Інше імʼя', phone: '+380675550011' }, title: 'Другий обʼєкт' });
  eq([r2.status, r2.data.client_id], [200, c.id]);
  eq((await q1('SELECT name FROM clients WHERE id = ?', c.id)).name, 'Новий Клієнт');
  eq((await q1('SELECT COUNT(*) AS n FROM clients')).n, before + 1);
  const a = await q1("SELECT after FROM audit_log WHERE action = 'project.create' AND entity_id = ?", String(r.data.id));
  ok(/"new_client":true/.test(a.after), 'аудит позначає нового клієнта');
});
await it('клієнт входить за цим номером через бота — бачить проєкт; без номера → клієнт «crm», щоразу окремий', async () => {
  const { upsertClient } = await import('../../functions/_lib.js');
  const c = await upsertClient(env, { provider: 'phone', provider_id: '+380675550011', name: 'Новий Клієнт' });
  const r = await call(env, 'GET', '/api/account/projects', { cookie: await login(env, c.id) });
  eq(r.data.projects.length, 2);
  const a = await NP({ new_client: { name: 'Без номера' } }), b = await NP({ new_client: { name: 'Без номера', phone: '  ' } });
  eq([a.status, b.status], [200, 200]);
  ok(a.data.client_id !== b.data.client_id, 'без номера клієнтів не зливаємо');
  const ca = await q1('SELECT provider, provider_id, phone FROM clients WHERE id = ?', a.data.client_id);
  ok(ca.provider === 'crm' && /^manual-/.test(ca.provider_id) && ca.phone == null, 'crm manual-…');
});
await it('номер, підтверджений входом через бота → наявний акаунт; телефону з профілю не віримо; міжнародний номер приймаємо', async () => {
  const prof = await addClient(env, { id: 7101, name: 'Профіль з номером', phone: '+380931110022' });
  const r = await NP({ new_client: { name: 'Клієнт', phone: '0931110022' } });
  ok(r.status === 200 && r.data.client_id !== prof, 'не прикріплено до чужого профілю');
  const real = await addClient(env, { id: 7102, name: 'Справжній' });
  await DB.prepare("INSERT INTO login_requests (token, phone, browser_hash, status, client_id, created_at, expires_at) VALUES ('t-nc', '+380931110033', 'h', 'used', ?, 1, 2)").bind(real).run();
  eq((await NP({ new_client: { name: 'Клієнт', phone: '+38 093 111 00 33' } })).data.client_id, real);
  const us = await NP({ new_client: { name: 'Client Abroad', phone: '+1 (212) 555-01-00' } });
  eq((await q1('SELECT provider_id FROM clients WHERE id = ?', us.data.client_id)).provider_id, '+12125550100');
});
await it('помилки: без імені, кривий номер, не обʼєкт → 422/404 і жодного нового клієнта чи проєкту; невалідний проєкт клієнта не створює', async () => {
  const n = async () => [(await q1('SELECT COUNT(*) AS n FROM clients')).n, (await q1('SELECT COUNT(*) AS n FROM projects')).n];
  const before = await n();
  eq((await NP({ new_client: { name: '  ', phone: '0671112233' } })).status, 422);
  eq((await NP({ new_client: { name: 'Клієнт', phone: '12345' } })).status, 422);
  eq((await NP({ new_client: 'Клієнт' })).status, 404);
  eq((await NP({ new_client: ['Клієнт'] })).status, 404);
  eq((await NP({})).status, 404);
  eq((await NP({ new_client: { name: 'Клієнт', phone: '0671112244' }, title: '' })).status, 422, 'проєкт без назви');
  eq((await NP({ new_client: { name: 'Клієнт', phone: '0671112244' }, camera_url: 'http://x' })).status, 422, 'камера не https');
  eq(await n(), before);
});
await it('client_id має пріоритет над new_client; права: дизайнер без projects.edit — 403; сума договору без finance.edit — 403', async () => {
  const cl = await addClient(env, { id: 7103, name: 'Наявний' });
  const r = await NP({ client_id: cl, new_client: { name: 'Зайвий', phone: '0671112255' } });
  eq([r.status, r.data.client_id], [200, cl]);
  eq(await q1("SELECT 1 AS x FROM clients WHERE provider_id = '+380671112255'"), null);
  eq((await NP({ new_client: { name: 'Клієнт' } }, ck.DES)).status, 403);
});

describe('«Надіслати КП»: текст мовою заявки (10 мов), журнал без надсилання з сервера');
await it('kp_text у списку: uk — «від $2 550 ($30/м²)»; en — кома в тисячах; усі 10 мов без порожніх місць', async () => {
  const r = (await rows()).rows.find(x => x.id === L1);
  ok(r.kp_text.includes(`від $2${NB}550 ($30/м²)`), r.kp_text); ok(/^Добрий день, Клієнт, дякуємо/.test(r.kp_text)); ok(/безкоштовна/.test(r.kp_text));
  const { kpText, LANGS } = await import('../../functions/_client_msgs.js');
  const f = { key: 'reno', label: 'x', area: 1200, unit: 'м²', rate: 550, min: null, from: 660000 };
  ok(kpText(f, 'en', 'Anna').includes('from $660,000 ($550/m²)'), kpText(f, 'en'));
  ok(kpText(f, 'de').includes(`ab $660${NB}000 ($550/m²)`));
  ok(kpText({ key: 'land', area: 6, unit: 'сотка', rate: 50, from: 300 }, 'en').includes('6 ares — from $300 ($50/are)'));
  ok(kpText({ key: 'office', area: 100, unit: 'м²', rate: null, from: null }, 'fr').includes('sur devis'));
  for (const l of LANGS) { const t = kpText(f, l, 'X'); ok(t && !/undefined|null/.test(t) && t.includes('cas-develop.com'), l + ': ' + t); }
  eq(kpText(f, 'xx').slice(0, 11), 'Добрий день', 'невідома мова → uk');
});
await it('offer_sent: без розрахунку → 409, невідомий канал → 400; WhatsApp → рядок в історії й аудит lead.offer_sent', async () => {
  const L = await lead({ phone: '0670000010' });
  eq((await patch({ id: L, offer_sent: 'whatsapp' })).status, 409);
  await patch({ id: L, offer: { key: 'reno', area: 50 } });
  eq((await patch({ id: L, offer_sent: 'sms' })).status, 400);
  eq((await patch({ id: L, offer_sent: 'whatsapp' })).status, 200);
  ok(await q1("SELECT 1 FROM order_events WHERE order_id = ? AND note LIKE 'КП надіслано (WhatsApp): Ремонт під ключ%'", L));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'lead.offer_sent' AND entity_id = ?", String(L)));
  eq((await patch({ id: L, offer_sent: 'telegram' }, ck.DES)).status, 404, 'чужа заявка дизайнера');
});

describe('Масові дії в CRM: стадія, відповідальний, «Не цікаво» — з правами на кожен рядок');
await it('власник: стадія трьом; «Не цікаво» заявці бота → «Скасовано» + bot_feedback; відповідальний', async () => {
  const a = await lead({ phone: '0670000020' }), b = await lead({ phone: '0670000021' }), c = await lead({ phone: '0670000022' });
  let r = await patch({ bulk: { ids: [a, b, c], status: 'in_work' } });
  eq([r.status, r.data.done], [200, 3]);
  eq((await env.DB.prepare(`SELECT status FROM orders WHERE id IN (${a}, ${b}, ${c})`).all()).results.map(x => x.status), ['in_work', 'in_work', 'in_work']);
  ok(await q1("SELECT 1 FROM order_events WHERE order_id = ? AND note = 'Масова зміна стадії'", a));
  await DB.prepare("UPDATE orders SET source = 'finder', ext_hash = 'bulk-hash-1' WHERE id = ?").bind(c).run();
  r = await patch({ bulk: { ids: [b, c], not_interested: 'не наш регіон' } });
  eq(r.data.done, 2);
  eq((await q1('SELECT status FROM orders WHERE id = ?', c)).status, 'cancelled');
  ok(await q1("SELECT 1 FROM order_events WHERE order_id = ? AND note = 'Не цікаво: не наш регіон'", c));
  eq((await q1("SELECT reason FROM bot_feedback WHERE lead_hash = 'bulk-hash-1'")).reason, 'не наш регіон');
  r = await patch({ bulk: { ids: [a], assignee_staff_id: DES_ID } });
  eq((await q1('SELECT assignee_staff_id FROM orders WHERE id = ?', a)).assignee_staff_id, DES_ID);
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'crm.bulk'"));
});
await it('дизайнер: лише свої рядки, без призначення; невалідні запити → 400', async () => {
  const mine = await lead({ phone: '0670000030', assignee_staff_id: DES_ID }), other = await lead({ phone: '0670000031' });
  const r = await patch({ bulk: { ids: [mine, other], status: 'in_work' } }, ck.DES);
  eq(r.status, 200); eq(r.data.done, 1);
  eq(r.data.results.find(x => x.id === other).error, 'Запис не знайдено');
  eq((await q1('SELECT status FROM orders WHERE id = ?', other)).status, 'new');
  const r2 = await patch({ bulk: { ids: [mine], assignee_staff_id: null } }, ck.DES);
  ok(/Немає права призначати/.test(r2.data.results[0].error));
  eq((await patch({ bulk: { ids: [] , status: 'new' } })).status, 400);
  eq((await patch({ bulk: { ids: Array.from({ length: 101 }, (_, i) => i + 1), status: 'new' } })).status, 400);
  eq((await patch({ bulk: { ids: [mine], status: 'new', not_interested: 'x' } })).status, 400);
});

describe('Нагадування клієнту про погодження етапу й прохання про відгук (functions/_nudges.js, migrations/0016)');
{
  const { runNudges, kyivStamp } = await import('../../functions/_nudges.js');
  const TGC = await addClient(env, { id: 5551, name: 'Ірина Телеграм' }); // provider telegram → бот може написати
  const PHC = (await q1('SELECT client_id FROM projects WHERE id = ?', P1)).client_id; // клієнт за номером, без Telegram
  const mkp = async (client_id, extra = {}) => (await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'project', client_id, title: 'Дизайн для нагадувань', service: 'design', ...extra } })).data.id;
  const toReview = async (pid, i = 0) => { const sid = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', pid)).stages)[i].id;
    eq((await call(env, 'POST', '/api/team/action', { cookie: ck.OWNER, body: { type: 'stage', project_id: pid, stage_id: sid, status: 'review' } })).status, 200); return sid; };
  const rem = (body, cookie = ck.OWNER) => call(env, 'POST', '/api/admin/projects', { cookie, body: { type: 'remind', ...body } });
  let PT, PP, SID;
  await it('клієнт у Telegram: «Нагадати» → бот, текст мовою заявки з посиланням на кабінет; повтор раніше 48 год → 429; запис в історії етапу й аудит', async () => {
    PT = await mkp(TGC); SID = await toReview(PT);
    ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', PT)).stages)[0].review_at), 'review_at');
    bot.reset();
    const r = await rem({ project_id: PT, stage_id: SID });
    eq([r.status, r.data.sent, r.data.channel], [200, true, 'telegram']);
    const m = bot.calls.find(c => c.chat_id === '5551');
    ok(m && /Ірина, етап «Бриф» проєкту «Дизайн для нагадувань» чекає вашого погодження/.test(m.text) && /\/kabinet\/obiekt\?p=\d+&lang=uk/.test(m.text), m && m.text);
    const r2 = await rem({ project_id: PT, stage_id: SID });
    eq(r2.status, 429); ok(r2.data.wait_h > 40);
    const s0 = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', PT)).stages)[0];
    eq(s0.hist.at(-1).act, 'remind'); ok(s0.remind_at);
    ok(await q1("SELECT 1 FROM audit_log WHERE action = 'client.remind' AND entity_id = ?", String(PT)));
    eq((await call(env, 'GET', '/api/admin/projects', { cookie: ck.OWNER })).data.projects.find(p => p.id === PT).stages[0].remind_at, s0.remind_at, 'адмінка бачить і зберігає');
  });
  await it('без Telegram: текст для ручного надсилання (мова заявки), канал WhatsApp → лише журнал; не той етап/тип → 409/422; дизайнер → 403', async () => {
    PP = await mkp(PHC); const sid = await toReview(PP);
    await DB.prepare("UPDATE orders SET lang = 'en' WHERE id = ?").bind(L1).run(); await DB.prepare('UPDATE projects SET order_id = ? WHERE id = ?').bind(L1, PP).run();
    const r = await rem({ project_id: PP, stage_id: sid });
    eq([r.status, r.data.sent], [200, false]); ok(/is awaiting your approval/.test(r.data.text) && /lang=en/.test(r.data.text), r.data.text);
    ok(!JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', PP)).stages)[0].remind_at, 'не надіслано — не рахується');
    eq((await rem({ project_id: PP, stage_id: sid, channel: 'whatsapp' })).status, 200);
    eq(JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', PP)).stages)[0].hist.at(-1).note, 'WhatsApp');
    eq((await rem({ project_id: PP, stage_id: sid, channel: 'whatsapp' })).status, 429, 'той самий ліміт 48 год');
    const other = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', PP)).stages)[2].id;
    eq((await rem({ project_id: PP, stage_id: other })).status, 409);
    eq((await rem({ project_id: PP, stage_id: sid, channel: 'sms' })).status, 429);
    eq((await rem({ project_id: PP, stage_id: sid }, ck.DES)).status, 403);
  });
  await it('автоматично (lead-sla): через ≥24 год приймання, вдень, не частіше 48 год; уночі — нічого', async () => {
    const pid = await mkp(TGC), sid = await toReview(pid);
    const st = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', pid)).stages);
    const day = new Date(); day.setUTCHours(10, 0, 0, 0); // 12:00–13:00 за Києвом
    st[0].review_at = kyivStamp(new Date(day.getTime() - 30 * 3600000));
    await DB.prepare('UPDATE projects SET stages = ? WHERE id = ?').bind(JSON.stringify(st), pid).run();
    const night = new Date(day); night.setUTCHours(21, 30);
    eq((await runNudges(env, new Request('https://cas-develop.com/api/admin/lead-sla'), night)).quiet, true);
    bot.reset();
    const r = await runNudges(env, new Request('https://cas-develop.com/api/admin/lead-sla'), day);
    ok(r.reminders >= 1, JSON.stringify(r)); ok(bot.calls.some(c => c.chat_id === '5551' && /чекає вашого погодження/.test(c.text)));
    const s0 = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', pid)).stages)[0];
    eq([s0.remind_n, s0.hist.at(-1).by], [1, 'автоматично']);
    bot.reset();
    await runNudges(env, new Request('https://cas-develop.com/api/admin/lead-sla'), new Date(day.getTime() + 3600000));
    ok(!bot.calls.some(c => c.chat_id === '5551' && /чекає/.test(c.text)), 'не частіше 48 год');
  });
  await it('відгук у Google: лише «Завершено»; done_at ставиться; автоматично через 2 доби один раз; вручну — текст і журнал; повтор → 409', async () => {
    eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'review_request', project_id: PT } })).status, 409, 'ще не завершено');
    eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { id: PT, status: 'done' } })).status, 200);
    ok((await q1('SELECT done_at FROM projects WHERE id = ?', PT)).done_at);
    const day = new Date(); day.setUTCHours(10, 0, 0, 0);
    bot.reset();
    await runNudges(env, new Request('https://cas-develop.com/x'), day);
    ok(!bot.calls.some(c => /відгук у Google/.test(c.text)), 'ще не минуло 2 доби');
    await DB.prepare("UPDATE projects SET done_at = datetime('now', '-3 days') WHERE id = ?").bind(PT).run();
    await runNudges(env, new Request('https://cas-develop.com/x'), day);
    const m = bot.calls.find(c => c.chat_id === '5551' && /g\.page\/r\/CbaVqfJBXWLQEAE\/review/.test(c.text));
    ok(m && /Проєкт «Дизайн для нагадувань» завершено/.test(m.text), JSON.stringify(bot.calls.map(c => c.text)));
    eq((await q1('SELECT review_channel FROM projects WHERE id = ?', PT)).review_channel, 'telegram');
    bot.reset(); await runNudges(env, new Request('https://cas-develop.com/x'), day);
    ok(!bot.calls.some(c => /review/.test(c.text)), 'лише один раз');
    eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'review_request', project_id: PT } })).status, 409);
    await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { id: PP, status: 'done' } });
    const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'review_request', project_id: PP } });
    eq(r.data.sent, false); ok(/Google review/.test(r.data.text), r.data.text);
    eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'review_request', project_id: PP, channel: 'viber' } })).data.channel, 'viber');
    ok(await q1("SELECT 1 FROM audit_log WHERE action = 'client.review' AND entity_id = ?", String(PP)));
    await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { id: PP, status: 'active' } });
    eq((await q1('SELECT done_at FROM projects WHERE id = ?', PP)).done_at, null, 'знову в роботі — done_at знято');
  });
}

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
