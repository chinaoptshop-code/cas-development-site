// Тести CRM v3 (19.11.2026). Запускається з run.mjs (спільний звіт); окремо: node tools/tests/crm3.mjs.
//   • одночасне редагування: версія картки (functions/_ver.js) — проєкт, заявка, контакт; стара форма → 409 без змін;
//     погодження, правки, нагадування й історію етапу веде сервер — форма «Зберегти проєкт» їх не перезаписує;
//     запис етапів — «порівняй і заміни» (зміна в ту саму мить не затирає іншу);
//   • ліміти записів працівників (functions/_rate.js, STAFF_LIMITS) — на акаунт, а не на IP;
//   • довгі списки заявок: сторінки (limit / before), лічильники й пошук на сервері.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';
import { STAFF_LIMITS, limited, staffKey } from '../../functions/_rate.js';

const env = makeEnv(freshDB(), { GITHUB_CONTENT_TOKEN: 'test-token-not-real' });
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
const kyivDay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const DES = await addClient(env, { id: 444, name: 'Дизайнер' });
const CL = await addClient(env, { id: 70001, name: 'Клієнт Дизайн', phone: '+380500007001' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, DES, CL })) ck[k] = await login(env, id);
await call(env, 'GET', '/api/me', { cookie: ck.OWNER }); await call(env, 'GET', '/api/me', { cookie: ck.MGR });
const DES_ID = (await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Дизайнерка', role: 'designer', tg: '444' } })).data.id;
ck.DES = await login(env, DES);

const P = (body, cookie = ck.MGR) => call(env, 'POST', '/api/admin/projects', { cookie, body });
const projects = async (cookie = ck.MGR) => (await call(env, 'GET', '/api/admin/projects', { cookie })).data.projects;
const card = async (id, cookie = ck.MGR) => (await projects(cookie)).find(p => p.id === id);
const stagesDb = async id => JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', id)).stages);
const saveForm = (form, extra = {}, cookie = ck.MGR, e = env) => call(e, 'PATCH', '/api/admin/projects', { cookie, body: { id: form.id, ver: form.ver, stages: form.stages, ...extra } });
const clientDo = (action, pid, sid, extra = {}, e = env) => call(e, 'POST', '/api/account/projects', { cookie: ck.CL, body: { action, project_id: pid, stage_id: sid, ...extra } });
const newDesign = async title => (await P({ type: 'project', client_id: CL, service: 'design', title,
  stages: [{ name: 'Планування', status: 'review', progress: 90 }, { name: 'Концепція', status: 'review', progress: 90 }, { name: 'Креслення', progress: 0 }] })).data.id;
// стенд, у якому перед записом, що збігається з re, один раз виконується hook — «хтось устиг раніше» в ту саму мить
const racing = (re, hook) => { let h = hook; return { ...env, DB: { prepare(sql) { if (h && re.test(sql)) { const f = h; h = null; f(); } return DB.prepare(sql); }, batch: l => DB.batch(l), exec: s => DB.exec(s) } }; };
const mutate = (id, fn) => { const st = JSON.parse(DB.db.prepare('SELECT stages FROM projects WHERE id = ?').get(id).stages); fn(st); DB.db.prepare('UPDATE projects SET stages = ? WHERE id = ?').run(JSON.stringify(st), id); };

describe('Одночасне редагування: картка проєкту відкрита до того, як клієнт погодив етап');
await it('менеджер зберігає стару форму після «Погодити етап» → 409 «Проєкт змінився…», нічого не змінено; погодження на місці', async () => {
  const pid = await newDesign('Дизайн: погодження під час редагування');
  const form = await card(pid); // менеджер відкрив картку
  ok(/^[0-9a-f]{16}$/.test(form.ver), 'GET віддає версію');
  eq((await clientDo('approve', pid, form.stages[0].id)).status, 200); // клієнт погодив у кабінеті
  form.stages[2].note = 'Примітка менеджера'; form.stages[0].name = 'Планувальне рішення';
  const r = await saveForm(form, { next_step: 'Передати креслення' });
  eq(r.status, 409); eq(r.data.conflict, true); eq(r.data.error, 'Проєкт змінився, поки ви редагували');
  ok(r.data.ver && r.data.ver !== form.ver, 'нова версія у відповіді');
  eq([r.data.last.by, r.data.last.what], ['Клієнт', 'клієнт погодив етап'], 'хто й що змінив — без імені клієнта');
  const s = await stagesDb(pid);
  eq([s[0].approved_at, s[0].approved_by, s[0].name, s[2].note], [kyivDay(), 'client', 'Планування', null], 'форма не збережена, погодження ціле');
  eq((await q1('SELECT next_step FROM projects WHERE id = ?', pid)).next_step, null);
  // «Оновити й повторити мої зміни»: свіжі дані + мої правки → збережено, дата погодження, «погодив клієнт» та історія на місці
  const fresh = await card(pid);
  eq(fresh.ver, r.data.ver);
  fresh.stages[2].note = 'Примітка менеджера'; fresh.stages[0].name = 'Планувальне рішення';
  const r2 = await saveForm(fresh, { next_step: 'Передати креслення' });
  eq(r2.status, 200); ok(r2.data.ver && r2.data.ver !== fresh.ver, 'відповідь — з новою версією');
  const s2 = await stagesDb(pid);
  eq([s2[0].approved_at, s2[0].approved_by, s2[0].name, s2[2].note, s2[0].hist.map(h => h.act)], [kyivDay(), 'client', 'Планувальне рішення', 'Примітка менеджера', ['approve']]);
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'project.approve' AND entity_id = ?", String(pid)), 'аудит погодження');
});
await it('навіть зі свіжою версією стара форма (без approved_at / revisions / історії) не стирає погодження й правки', async () => {
  const pid = await newDesign('Дизайн: журнал веде сервер');
  const old = await card(pid);
  eq((await clientDo('approve', pid, old.stages[0].id)).status, 200);
  eq((await clientDo('revise', pid, old.stages[1].id, { note: 'Змінити колір кухні' })).status, 200);
  const now = await card(pid);
  // тіло — етапи зі старої форми (як їх бачив менеджер до дій клієнта), версія — свіжа: поля сервера однаково не перезаписуються
  const r = await saveForm({ id: pid, ver: now.ver, stages: old.stages.map(y => ({ ...y, approved_at: null, revisions: 0, hist: [], rev_note: '' })) });
  eq(r.status, 200);
  const s = await stagesDb(pid);
  eq([s[0].approved_at, s[0].approved_by, s[0].hist.length], [kyivDay(), 'client', 1], 'погодження');
  eq([s[1].revisions, s[1].rev_note, s[1].rev_at, s[1].hist.map(h => h.act)], [1, 'Змінити колір кухні', kyivDay(), ['revise']], 'правки');
});
await it('«Є правки» під час редагування: 409; після оновлення лічильник менеджера додається до клієнтського (rev_delta), статус — як вирішив менеджер', async () => {
  const pid = await newDesign('Дизайн: правки під час редагування');
  const form = await card(pid);
  eq((await clientDo('revise', pid, form.stages[0].id, { note: 'Перенести двері' })).status, 200);
  form.stages[0].rev_delta = 1; // менеджер у старій формі натиснув «Правки +»
  const r = await saveForm(form);
  eq(r.status, 409); eq(r.data.last.what, 'клієнт попросив правки');
  let s = await stagesDb(pid);
  eq([s[0].status, s[0].revisions, s[0].rev_note], ['in_progress', 1, 'Перенести двері'], 'етап у роботі, правка клієнта ціла');
  const fresh = await card(pid);
  fresh.stages[0].rev_delta = 1;
  eq((await saveForm(fresh)).status, 200);
  s = await stagesDb(pid);
  eq([s[0].status, s[0].revisions, s[0].rev_note, s[0].hist.length], ['in_progress', 2, 'Перенести двері', 1], '1 клієнта + 1 менеджера');
});
await it('нагадування клієнту (службовий відлік) не робить відкриту форму застарілою; зміна команди чи суми — робить', async () => {
  const pid = await newDesign('Дизайн: версія й нагадування');
  const form = await card(pid);
  eq((await P({ type: 'remind', project_id: pid, stage_id: form.stages[0].id, channel: 'viber' })).status, 200);
  eq((await card(pid)).ver, form.ver, 'remind_at / hist у версію не входять');
  form.stages[2].note = 'після нагадування';
  eq((await saveForm(form)).status, 200);
  const s = await stagesDb(pid);
  ok(s[0].remind_at && s[0].hist.length === 1 && s[2].note === 'після нагадування', 'нагадування й примітка разом');
  const f2 = await card(pid);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { id: pid, staff: [{ id: DES_ID, task: 'Візуалізації' }] } })).status, 200); // власник змінив команду
  eq((await saveForm(f2)).status, 409, 'команда змінилась');
  const f3 = await card(pid);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { id: pid, contract_amount: 9000, contract_currency: 'USD' } })).status, 200);
  eq((await saveForm(f3)).status, 409, 'сума договору змінилась');
  eq((await saveForm(await card(pid))).status, 200);
});
await it('версія обовʼязкова зі списком етапів (428); точкова зміна поля без етапів — без версії; з версією — перевіряється', async () => {
  const pid = await newDesign('Дизайн: версія обовʼязкова');
  const form = await card(pid);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: pid, stages: form.stages } })).status, 428);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: pid, next_step: 'Крок' } })).status, 200);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: pid, ver: form.ver, next_step: 'Інший крок' } })).status, 409);
  eq((await q1('SELECT next_step FROM projects WHERE id = ?', pid)).next_step, 'Крок');
  eq((await saveForm(form, {}, ck.DES)).status, 403, 'права не розширились: дизайнер картку не зберігає');
});

describe('Одночасне редагування: зміни в ту саму мить («порівняй і заміни»)');
await it('клієнт погодив етап між читанням і записом форми менеджера → 409, погодження ціле', async () => {
  const pid = await newDesign('Дизайн: гонка менеджер ← клієнт');
  const form = await card(pid);
  form.stages[0].name = 'Назва менеджера';
  const e = racing(/^UPDATE projects SET title/, () => mutate(pid, st => { st[0].approved_at = kyivDay(); st[0].approved_by = 'client'; st[0].hist = [{ act: 'approve', at: kyivDay() + ' 12:00', by: 'Клієнт' }]; }));
  const r = await saveForm(form, {}, ck.MGR, e);
  eq(r.status, 409); eq(r.data.conflict, true);
  const s = await stagesDb(pid);
  eq([s[0].approved_at, s[0].approved_by, s[0].name], [kyivDay(), 'client', 'Планування']);
});
await it('менеджер зберіг картку, поки клієнт погоджував → погодження лягає на свіжі етапи, зміни менеджера цілі', async () => {
  const pid = await newDesign('Дизайн: гонка клієнт ← менеджер');
  const sid = (await stagesDb(pid))[0].id;
  const e = racing(/^UPDATE projects SET stages/, () => mutate(pid, st => { st[0].name = 'Перейменував менеджер'; st[2].note = 'нова примітка'; }));
  const r = await clientDo('approve', pid, sid, {}, e);
  eq(r.status, 200);
  const s = await stagesDb(pid);
  eq([s[0].approved_at, s[0].approved_by, s[0].name, s[2].note], [kyivDay(), 'client', 'Перейменував менеджер', 'нова примітка']);
});
await it('менеджер погодив етап сам, поки клієнт натискав «Є правки» → правки відхилено (409), погодження ціле', async () => {
  const pid = await newDesign('Дизайн: гонка правки ← погодження');
  const sid = (await stagesDb(pid))[1].id;
  const e = racing(/^UPDATE projects SET stages/, () => mutate(pid, st => { st[1].approved_at = kyivDay(); }));
  const r = await clientDo('revise', pid, sid, { note: 'Змінити планування' }, e);
  eq(r.status, 409);
  const s = await stagesDb(pid);
  eq([s[1].approved_at, s[1].status, s[1].revisions], [kyivDay(), 'review', undefined]);
});
await it('кабінет працівника: «Етап виконано» в ту саму мить, що й погодження клієнта, — обидві зміни збережено', async () => {
  const pid = await newDesign('Дизайн: гонка працівник ← клієнт');
  const sid = (await stagesDb(pid))[0].id;
  const e = racing(/^UPDATE projects SET stages/, () => mutate(pid, st => { st[0].approved_at = kyivDay(); st[0].approved_by = 'client'; }));
  const r = await call(e, 'POST', '/api/team/action', { cookie: ck.OWNER, body: { type: 'stage', project_id: pid, stage_id: sid, status: 'done' } });
  eq(r.status, 200);
  const s = await stagesDb(pid);
  eq([s[0].status, s[0].progress, s[0].approved_at, s[0].approved_by], ['done', 100, kyivDay(), 'client']);
});

describe('Одночасне редагування: картка заявки й контакт');
const crm = async (qs = '', cookie = ck.MGR) => (await call(env, 'GET', '/api/admin/crm?kind=lead' + qs, { cookie })).data;
const patch = (body, cookie = ck.MGR) => call(env, 'PATCH', '/api/admin/crm', { cookie, body });
const lead = async (body, cookie = ck.OWNER) => (await call(env, 'POST', '/api/admin/crm', { cookie, body: { name: 'Лід', ...body } })).data.id;
await it('заявка: два менеджери — друге збереження зі старою версією → 409 зі свіжим рядком, нотатка першого ціла; зі свіжою — ок', async () => {
  const id = await lead({ phone: '0670001122', service: 'Ремонт' });
  const a = (await crm()).rows.find(r => r.id === id), b = (await crm('', ck.OWNER)).rows.find(r => r.id === id);
  ok(/^[0-9a-f]{16}$/.test(a.ver)); eq(a.ver, b.ver);
  const r1 = await patch({ id, ver: a.ver, crm_note: 'Дзвонив, просить КП до пʼятниці' });
  eq(r1.status, 200); ok(r1.data.ver && r1.data.ver !== a.ver);
  const r2 = await patch({ id, ver: b.ver, crm_note: 'Не додзвонився' }, ck.OWNER);
  eq(r2.status, 409); eq(r2.data.conflict, true); eq(r2.data.error, 'Заявку змінили, поки ви редагували');
  eq([r2.data.row.crm_note, r2.data.row.ver, r2.data.last.by], ['Дзвонив, просить КП до пʼятниці', r1.data.ver, 'Менеджер']);
  eq((await q1('SELECT crm_note FROM orders WHERE id = ?', id)).crm_note, 'Дзвонив, просить КП до пʼятниці');
  eq((await patch({ id, ver: r2.data.row.ver, next_contact: '2030-01-10' }, ck.OWNER)).status, 200);
  eq((await patch({ id, status: 'in_work' })).status, 200, 'швидка дія (канбан) — без версії');
  const d = await q1('SELECT crm_note, next_contact, status FROM orders WHERE id = ?', id);
  eq([d.crm_note, d.next_contact, d.status], ['Дзвонив, просить КП до пʼятниці', '2030-01-10', 'in_work']);
});
await it('контакт: версія в картці; стара версія → 409 зі свіжою карткою; зі свіжою — ок', async () => {
  const c = await call(env, 'POST', '/api/admin/partners', { cookie: ck.OWNER, body: { name: 'Плиточник Тест', type: 'master', phone: '+380671110099' } });
  eq(c.status, 200);
  const get = async () => (await call(env, 'GET', '/api/admin/partners?id=' + c.data.id, { cookie: ck.MGR })).data.partner;
  const a = await get();
  ok(/^[0-9a-f]{16}$/.test(a.ver));
  const r1 = await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.MGR, body: { id: a.id, ver: a.ver, notes: 'Працює швидко', rating: 5 } });
  eq(r1.status, 200); ok(r1.data.partner.ver !== a.ver);
  const r2 = await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.OWNER, body: { id: a.id, ver: a.ver, notes: 'Дорого', status: 'working' } });
  eq(r2.status, 409); eq(r2.data.conflict, true); eq([r2.data.partner.notes, r2.data.partner.rating, r2.data.partner.ver], ['Працює швидко', 5, r1.data.partner.ver]);
  eq((await get()).notes, 'Працює швидко');
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.OWNER, body: { id: a.id, ver: r2.data.partner.ver, status: 'working' } })).status, 200);
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.OWNER, body: { id: a.id, city: 'Київ' } })).status, 200, 'без версії — як раніше');
  const z = await get(); eq([z.notes, z.status, z.city, z.rating], ['Працює швидко', 'working', 'Київ', 5]);
});

describe('Ліміти записів працівників (на акаунт, не на IP)');
const staffId = async cid => (await q1('SELECT id FROM staff WHERE client_id = ?', cid)).id;
const fill = async (kind, cid, n = STAFF_LIMITS[kind]) => { // вичерпати кошик працівника (без сотень HTTP-викликів)
  const x = { staffId: await staffId(cid) }, req = new Request('https://cas-develop.com/x', { headers: { 'cf-connecting-ip': '10.9.9.9' } });
  await DB.prepare('DELETE FROM rate_hits WHERE bucket = ?').bind('staff-' + kind).run();
  for (let i = 0; i < n; i++) if (await limited(env, req, 'staff-' + kind, STAFF_LIMITS[kind], 3600, false, staffKey(x))) throw new Error('ліміт спрацював зарано: ' + i);
};
await it('ліміти щедрі: CRM 600, КП 120, масові 60, контакти 600, замовлення 600, коди 120, персонал 120, сайт 300 на годину', async () => {
  eq(STAFF_LIMITS, { crm: 600, kp: 120, bulk: 60, contacts: 600, orders: 600, codes: 120, staff: 120, repo: 300 });
});
let LIM;
await it('нотатки / картки CRM: 600 змін — ок, далі 429; інший працівник з тієї ж адреси працює; без часткових змін', async () => {
  LIM = await lead({ phone: '0670002233', service: 'Дизайн' });
  await fill('crm', MGR, STAFF_LIMITS.crm - 1);
  eq((await patch({ id: LIM, crm_note: 'остання в межах ліміту' })).status, 200);
  const r = await patch({ id: LIM, crm_note: 'понад ліміт' });
  eq(r.status, 429); ok(/зачекайте/.test(r.data.error));
  eq((await q1('SELECT crm_note FROM orders WHERE id = ?', LIM)).crm_note, 'остання в межах ліміту');
  eq((await call(env, 'POST', '/api/admin/crm', { cookie: ck.MGR, body: { name: 'Ще заявка' } })).status, 429, 'нова заявка вручну — той самий кошик');
  eq((await patch({ id: LIM, crm_note: 'власник з тієї ж адреси' }, ck.OWNER)).status, 200, 'ліміт — на акаунт');
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: ck.MGR })).status, 200, 'читання не обмежене');
});
await it('журнал «КП надіслано»: 120 записів на годину, далі 429 — історія заявки не росте; окремий кошик від карток', async () => {
  eq((await patch({ id: LIM, offer: { key: 'dz', area: 90, region: 'ua' } }, ck.OWNER)).status, 200);
  await fill('kp', OWNER, STAFF_LIMITS.kp - 1);
  eq((await patch({ id: LIM, offer_sent: 'whatsapp' }, ck.OWNER)).status, 200);
  const n = (await q1("SELECT COUNT(*) AS n FROM order_events WHERE order_id = ? AND note LIKE 'КП надіслано%'", LIM)).n;
  eq((await patch({ id: LIM, offer_sent: 'viber' }, ck.OWNER)).status, 429);
  eq((await q1("SELECT COUNT(*) AS n FROM order_events WHERE order_id = ? AND note LIKE 'КП надіслано%'", LIM)).n, n);
  eq((await patch({ id: LIM, crm_note: 'картка працює' }, ck.OWNER)).status, 200);
});
await it('масові дії: 60 на годину; контакти, замовлення Оздоби, коди партнерів, персонал, збереження сайту — свої кошики', async () => {
  await fill('bulk', OWNER);
  eq((await patch({ bulk: { ids: [LIM], status: 'in_work' } }, ck.OWNER)).status, 429);
  await fill('contacts', OWNER);
  eq((await call(env, 'POST', '/api/admin/partners', { cookie: ck.OWNER, body: { name: 'Спам', type: 'other' } })).status, 429);
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.OWNER, body: { id: 1, notes: 'x' } })).status, 429);
  eq((await call(env, 'DELETE', '/api/admin/partners?link=1', { cookie: ck.OWNER })).status, 429);
  eq((await call(env, 'GET', '/api/admin/partners', { cookie: ck.OWNER })).status, 200);
  await fill('orders', OWNER);
  eq((await call(env, 'PATCH', '/api/admin/orders', { cookie: ck.OWNER, body: { id: 1, manager_note: 'x' } })).status, 429);
  await fill('codes', OWNER);
  eq((await call(env, 'POST', '/api/admin/partner-codes', { cookie: ck.OWNER, body: { name: 'Спам' } })).status, 429);
  eq((await call(env, 'PATCH', '/api/admin/partner-codes', { cookie: ck.OWNER, body: { code: 'DIZ-X', active: false } })).status, 429);
  await fill('staff', OWNER);
  eq((await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Спам', role: 'foreman', tg: '777' } })).status, 429);
  eq((await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: DES_ID, note: 'x' } })).status, 429);
  await fill('repo', OWNER);
  eq((await call(env, 'POST', '/api/admin/repo', { cookie: ck.OWNER, body: { op: 'save', message: 'x', files: [{ path: 'img/uploads/x.webp', content: 'AA==', encoding: 'base64' }] } })).status, 429);
  ok(!(await q1("SELECT 1 FROM partners WHERE name = 'Спам'")) && !(await q1("SELECT 1 FROM staff WHERE name = 'Спам'")), 'нічого не записано');
  // права не розширились: дизайнер, як і раніше, не має доступу до довідника контактів і персоналу
  eq((await call(env, 'POST', '/api/admin/partners', { cookie: ck.DES, body: { name: 'Чужий', type: 'other' } })).status, 403);
  eq((await call(env, 'POST', '/api/admin/staff', { cookie: ck.DES, body: { name: 'Чужий', role: 'foreman', tg: '778' } })).status, 403);
});
await it('до міграції 0007 (немає таблиці лімітів) записи не блокуються', async () => {
  const e0 = makeEnv(freshDB());
  const o = await addClient(e0, { id: 111, name: 'Власник' }), k = await login(e0, o);
  await call(e0, 'GET', '/api/me', { cookie: k });
  await e0.DB.exec('DROP TABLE rate_hits');
  eq((await call(e0, 'POST', '/api/admin/crm', { cookie: k, body: { name: 'Без лімітів' } })).status, 200);
});

describe('Довгі списки заявок: сторінки, лічильники й пошук на сервері');
const e2 = makeEnv(freshDB());
const O2 = await addClient(e2, { id: 111, name: 'Власник' }), D2 = await addClient(e2, { id: 444, name: 'Дизайнер' });
const k2 = { O: await login(e2, O2) };
await call(e2, 'GET', '/api/me', { cookie: k2.O });
const DES2 = (await call(e2, 'POST', '/api/admin/staff', { cookie: k2.O, body: { name: 'Дизайнерка', role: 'designer', tg: '444' } })).data.id;
k2.D = await login(e2, D2);
// 1 230 заявок напряму в базу (понад колишню межу 1000): кожна 41-ша — «Розрахунок», кожна 100-та — з рідкісним словом
{
  const ins = e2.DB.db.prepare(`INSERT INTO orders (number, kind, name, phone, items, service, source, status, assignee_staff_id, city) VALUES (?, 'lead', ?, ?, '[]', ?, 'вручну', ?, ?, ?)`);
  e2.DB.db.exec('BEGIN');
  for (let i = 1; i <= 1230; i++) ins.run('CAS-T' + String(i).padStart(5, '0'), 'Клієнт ' + i, '06700' + String(i).padStart(5, '0'),
    i % 100 === 0 ? 'Ремонт мансарди' : 'Ремонт квартири', i % 41 === 0 ? 'quote_sent' : 'new', i % 7 === 0 ? DES2 : null, i % 2 ? 'Київ' : 'Львів');
  e2.DB.db.exec('COMMIT');
}
const page = async (qs, cookie = k2.O) => (await call(e2, 'GET', '/api/admin/crm?kind=lead' + qs, { cookie })).data;
await it('перша сторінка: limit рядків, нові зверху, total / more / next; лічильники стадій — по всій базі, а не по сторінці', async () => {
  const d = await page('&limit=200');
  eq([d.rows.length, d.total, d.more, d.next], [200, 1230, true, d.rows[199].id]);
  eq(d.rows[0].number, 'CAS-T01230');
  eq([d.by_status.lead.new, d.by_status.lead.quote_sent, d.waiting], [1200, 30, 1200]);
  ok(d.rows.every(r => /^[0-9a-f]{16}$/.test(r.ver)), 'версія в кожному рядку');
});
await it('наступні сторінки (before) — без пропусків і повторів до кінця; остання — more: false', async () => {
  const seen = new Set(); let before = '', n = 0, d;
  do { d = await page('&limit=500' + (before ? '&before=' + before : '')); for (const r of d.rows) seen.add(r.id); before = d.next; n++; } while (d.more);
  eq([seen.size, n, d.rows.length, d.next], [1230, 3, 230, null]);
});
await it('без limit — як раніше, до 1000 (стара вкладка не ламається), але тепер із more / next і можна дочитати решту', async () => {
  const d = await page('');
  eq([d.rows.length, d.total, d.more], [1000, 1230, true]);
  const rest = await page('&before=' + d.next);
  eq([rest.rows.length, rest.more], [230, false]);
  eq((await page('&limit=5000')).rows.length, 1000, 'limit не більше 1000');
  eq((await page('&limit=0')).rows.length, 1, 'limit не менше 1');
});
await it('пошук і швидкі фільтри працюють на сервері по всій базі: знаходять рядки поза першою сторінкою', async () => {
  let d = await page('&limit=200&q=' + encodeURIComponent('мансард'));
  eq([d.rows.length, d.total, d.more], [12, 12, false]); ok(d.rows.some(r => r.number === 'CAS-T00100'), 'найстаріший збіг знайдено');
  d = await page('&limit=200&q=CAS-T00007');
  eq(d.rows.map(r => r.name), ['Клієнт 7']);
  d = await page('&limit=10&status=quote_sent');
  eq([d.rows.length, d.total, d.more, d.waiting], [10, 30, true, 0]);
  d = await page('&limit=200&staff=' + DES2); // «Мої»
  eq([d.total, d.rows.length, d.more], [175, 175, false]);
  d = await page('&limit=50&city=' + encodeURIComponent('Львів') + '&status=new');
  eq([d.total, d.rows.length, d.more], [600, 50, true]);
  const p2 = await page('&limit=50&city=' + encodeURIComponent('Львів') + '&status=new&before=' + d.next);
  ok(p2.rows.every(r => r.city === 'Львів' && r.status === 'new') && p2.rows[0].id < d.next, 'фільтр тримається на наступній сторінці');
});
await it('права на сторінках ті самі: дизайнер бачить лише свої заявки (і лише їх лічильники)', async () => {
  const d = await page('&limit=100', k2.D);
  eq([d.total, d.rows.length, d.more], [175, 100, true]);
  ok(d.rows.every(r => r.assignee_staff_id === DES2));
  const d2 = await page('&limit=100&before=' + d.next, k2.D);
  eq([d2.rows.length, d2.more], [75, false]); ok(d2.rows.every(r => r.assignee_staff_id === DES2));
});
await it('CSV — усе за фільтром, а не перша сторінка', async () => {
  const r = await call(e2, 'GET', '/api/admin/crm?kind=lead&format=csv&limit=10', { cookie: k2.O });
  eq(r.status, 200); eq(r.text.trim().split('\r\n').length, 1231, 'заголовок + 1230 рядків');
});

bot.reset();
if (process.argv[1] && process.argv[1].endsWith('crm3.mjs')) process.exit(report() ? 1 : 0);
