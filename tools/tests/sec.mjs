// Тести аудиту безпеки CRM v2 (19.11.2026). Запускається з run.mjs (спільний звіт); окремо: node tools/tests/sec.mjs.
// Що перевіряємо:
//   • працівника, адміна й власника впізнаємо лише за підтвердженим контактом — Telegram id, пошта входу через Google, номер,
//     підтверджений ботом (functions/_lib.js verifiedEmail / verifiedPhone, migrations/0017); телефон чи пошта з профілю або заявки — ні;
//   • вхід за номером через бота наскрізь (start → вебхук бота → status) і привʼязка запрошення після нього;
//   • журнал етапу (історія, «погодив клієнт», правки, відлік нагадувань) веде сервер — тіло «Зберегти проєкт» його не змінює;
//   • довідники «ключ → підпис» не знаходять «constructor» / «__proto__»; ціна позиції — лише за номером позиції;
//   • без права на контакти клієнта не видно адреси доставки й адреси з профілю;
//   • невірний ключ інтеграції — з лімітом спроб; для кожної мови з 3D-турами в _headers є своє правило.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';

const env = makeEnv(freshDB(), { TELEGRAM_BOT_USERNAME: 'cas_test_bot', OWNER_TG_ID: '111', OWNER_EMAIL: 'owner@example.com', ADMIN_EMAILS: 'admin@example.com' });
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
const me = async cookie => (await call(env, 'GET', '/api/me', { cookie })).data.client;
const staffOf = async cookie => { const c = await me(cookie); return c && c.staff ? c.staff.role : null; };

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const DES = await addClient(env, { id: 444, name: 'Дизайнер' });
const EVE = await addClient(env, { id: 666, name: 'Сторонній клієнт' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, DES, EVE })) ck[k] = await login(env, id);
await me(ck.OWNER); await me(ck.MGR);
const DES_ID = (await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Дизайнерка', role: 'designer', tg: '444' } })).data.id;
ck.DES = await login(env, DES);

// ===== вхід за номером через бота (як у браузері й Telegram) =====
const { webhookSecret } = await import('../../functions/_alerts.js');
const hook = async update => call(env, 'POST', '/api/tg/webhook', { body: update, headers: { 'x-telegram-bot-api-secret-token': await webhookSecret(env), noOrigin: true } });
let ipN = 0;
async function phoneLogin(phone, tgId, { contactPhone = phone, contactUser = tgId } = {}) {
  const s = await call(env, 'POST', '/api/auth/phone/start', { body: { phone }, headers: { ip: '10.9.0.' + (++ipN) } });
  if (s.status !== 200) return { start: s };
  const pl = s.headers.get('set-cookie').split(';')[0], token = s.data.token;
  const from = { id: Number(tgId), first_name: 'Тест' }, chat = { id: Number(tgId) };
  await hook({ message: { chat, from, text: '/start login_' + token } });
  await hook({ message: { chat, from, contact: { phone_number: contactPhone.replace('+', ''), user_id: Number(contactUser) } } });
  const st = await call(env, 'GET', '/api/auth/phone/status?token=' + token, { cookie: pl });
  const set = st.headers.get('set-cookie') || '';
  const m = /cas_s=[^;]+/.exec(set);
  return { start: s, status: st, cookie: m ? m[0] : null, token, pl };
}

describe('Безпека: вхід за номером через бота');
await it('start → бот → status: сесію отримує лише браузер, що почав вхід, і лише один раз', async () => {
  bot.reset();
  const r = await phoneLogin('+380671000001', '70001');
  eq(r.status.status, 200); eq(r.status.data.status, 'ok'); ok(r.cookie, 'cookie сесії');
  eq((await me(r.cookie)).phone, '+380671000001');
  ok(bot.calls.some(c => c.chat_id === '70001' && /самі щойно почали вхід/.test(c.text || '')), 'бот попереджає: ділитися номером лише якщо вхід почали самі');
  eq((await call(env, 'GET', '/api/auth/phone/status?token=' + r.token, { cookie: r.pl })).data.status, 'used', 'повторно сесію не видаємо');
  const s2 = await call(env, 'POST', '/api/auth/phone/start', { body: { phone: '+380671000002' }, headers: { ip: '10.9.1.1' } });
  eq((await call(env, 'GET', '/api/auth/phone/status?token=' + s2.data.token)).status, 403, 'без cookie браузера');
  eq((await call(env, 'GET', '/api/auth/phone/status?token=' + s2.data.token, { cookie: r.pl })).status, 403, 'чужа cookie браузера');
});
await it('чужий контакт або інший номер у боті — входу немає; підпис /confirm не підробити', async () => {
  const a = await phoneLogin('+380671000003', '70003', { contactUser: '70099' }); // переслали чужий контакт
  eq(a.status.data.status, 'pending'); eq(a.cookie, null);
  const b = await phoneLogin('+380671000004', '70004', { contactPhone: '+380671000005' }); // у Telegram інший номер
  eq(b.status.data.status, 'pending'); eq(b.cookie, null);
  const c = await call(env, 'POST', '/api/auth/phone/confirm', { body: { token: b.token, phone: '+380671000004', tg_id: '70004' }, headers: { 'x-bot-signature': 'a'.repeat(64) } });
  eq(c.status, 401);
  eq((await call(env, 'POST', '/api/tg/webhook', { body: { message: { chat: { id: 1 }, from: { id: 1 }, text: '/start' } }, headers: { 'x-telegram-bot-api-secret-token': 'x', noOrigin: true } })).status, 403, 'вебхук без секрету');
});

describe('Безпека: запрошення працівника — лише за підтвердженим контактом');
let invId;
await it('телефон, вписаний у профіль, не відкриває запрошення за номером (PATCH /api/me і /api/account/profile)', async () => {
  const r = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Новий менеджер', role: 'manager', phone: '+380671112233' } });
  eq(r.status, 200); eq(r.data.linked, false); invId = r.data.id;
  eq((await call(env, 'PATCH', '/api/me', { cookie: ck.EVE, body: { phone: '+380671112233' } })).status, 200);
  eq(await staffOf(ck.EVE), null, 'профіль /api/me');
  eq((await call(env, 'GET', '/api/admin/crm', { cookie: ck.EVE })).status, 403);
  eq((await call(env, 'PATCH', '/api/account/profile', { cookie: ck.EVE, body: { phone: '067 111 22 33' } })).status, 200);
  ck.EVE = await login(env, EVE); // новий вхід — та сама перевірка при видачі сесії
  eq(await staffOf(ck.EVE), null, 'профіль кабінету');
  eq((await q1('SELECT client_id FROM staff WHERE id = ?', invId)).client_id, null, 'запрошення лишилось вільним');
});
await it('номер із профілю заздалегідь: нове запрошення за цим номером не привʼязується до такого акаунта', async () => {
  await call(env, 'PATCH', '/api/me', { cookie: ck.EVE, body: { phone: '+380671119999' } });
  const r = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Прораб за номером', role: 'foreman', phone: '+380671119999' } });
  eq(r.status, 200); eq(r.data.linked, false);
  eq(await staffOf(ck.EVE), null);
  eq((await me(ck.EVE)).name, 'Сторонній клієнт', 'сесію клієнта не анульовано');
});
await it('той, хто підтвердив номер у боті, стає працівником: новий акаунт за номером і наявний акаунт Telegram', async () => {
  const a = await phoneLogin('+380671112233', '70010');
  eq(a.status.data.status, 'ok'); eq(await staffOf(a.cookie), 'manager');
  eq((await q1('SELECT client_id FROM staff WHERE id = ?', invId)).client_id, (await me(a.cookie)).id);
  // акаунт Telegram (входив віджетом) підтверджує номер у боті → запрошення за номером привʼязується до нього
  const TGC = await addClient(env, { id: 70020, name: 'Геодезист' });
  const inv = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Геодезист', role: 'surveyor', phone: '+380671114455' } });
  eq(inv.data.linked, false);
  const b = await phoneLogin('+380671114455', '70020');
  eq(b.status.data.status, 'ok'); eq((await me(b.cookie)).id, TGC); eq(await staffOf(b.cookie), 'surveyor');
  eq((await q1('SELECT phone_verified FROM clients WHERE id = ?', TGC)).phone_verified, '+380671114455');
  // номер підтверджено раніше → нове запрошення за ним привʼязується одразу (і дубль → 409)
  const TG2 = await addClient(env, { id: 70030, name: 'Мебляр' });
  eq((await phoneLogin('+380671116677', '70030')).status.data.status, 'ok');
  const inv2 = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Мебляр', role: 'furniture', phone: '067 111 66 77' } });
  eq([inv2.status, inv2.data.linked], [200, true]);
  eq((await q1('SELECT client_id FROM staff WHERE id = ?', inv2.data.id)).client_id, TG2);
  eq((await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Мебляр 2', role: 'furniture', phone: '+380671116677' } })).status, 409);
});
await it('пошта не з входу через Google (із заявки) не дає ролі: ні власника, ні адміна, ні запрошення за поштою', async () => {
  await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Бухгалтер', role: 'accountant', email: 'buh@example.com' } });
  for (const [i, email] of ['owner@example.com', 'admin@example.com', 'buh@example.com'].entries()) {
    const phone = '+38067222000' + i;
    // заявка з поштою (її вписує працівник з leads.edit) → проєкт: акаунт клієнта за номером з цією поштою
    const lead = await call(env, 'POST', '/api/admin/crm', { cookie: ck.MGR, body: { name: 'Клієнт ' + i, phone, email, service: 'Дизайн інтерʼєру' } });
    eq(lead.status, 200);
    eq((await call(env, 'POST', '/api/admin/projects', { cookie: ck.MGR, body: { type: 'from_lead', order_id: lead.data.id } })).status, 200);
    const r = await phoneLogin(phone, '7100' + i);
    eq(r.status.data.status, 'ok');
    const c = await me(r.cookie);
    eq([c.staff, c.admin, c.home], [null, false, '/kabinet'], email);
    eq((await call(env, 'GET', '/api/admin/audit', { cookie: r.cookie })).status, 403);
    eq((await call(env, 'GET', '/api/admin/crm', { cookie: r.cookie })).status, 403);
    const acc = await q1("SELECT id FROM clients WHERE provider = 'phone' AND provider_id = ?", phone);
    eq(await q1('SELECT 1 FROM staff WHERE client_id = ?', acc.id), null);
  }
  // ті самі пошти з входу через Google — працюють, як і раніше
  const G = await addClient(env, { provider: 'google', id: 'g-owner', name: 'Власник G', email: 'Owner@Example.com' });
  eq(await staffOf(await login(env, G)), 'owner');
  const GA = await addClient(env, { provider: 'google', id: 'g-admin', name: 'Адмін G', email: 'admin@example.com' });
  eq(await staffOf(await login(env, GA)), 'manager');
  const GB = await addClient(env, { provider: 'google', id: 'g-buh', name: 'Бухгалтер G', email: 'buh@example.com' });
  eq(await staffOf(await login(env, GB)), 'accountant');
  // нове запрошення за поштою не чіпляється до акаунта, де ця пошта — лише із заявки
  const lead = await call(env, 'POST', '/api/admin/crm', { cookie: ck.MGR, body: { name: 'Клієнт X', phone: '+380672229999', email: 'new.manager@example.com' } });
  await call(env, 'POST', '/api/admin/projects', { cookie: ck.MGR, body: { type: 'from_lead', order_id: lead.data.id } });
  const inv = await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Менеджер за поштою', role: 'manager', email: 'new.manager@example.com' } });
  eq([inv.status, inv.data.linked], [200, false]);
});
await it('база без міграції 0017: вхід за номером і запрошення за номером працюють (акаунт входу за номером)', async () => {
  const e2 = makeEnv(freshDB(16), { TELEGRAM_BOT_USERNAME: 'cas_test_bot' });
  const o = await addClient(e2, { id: 111, name: 'Власник' });
  const ko = await login(e2, o);
  await call(e2, 'GET', '/api/me', { cookie: ko });
  const eve = await addClient(e2, { id: 666, name: 'Сторонній' });
  const ke = await login(e2, eve);
  await call(e2, 'PATCH', '/api/me', { cookie: ke, body: { phone: '+380673330001' } });
  const inv = await call(e2, 'POST', '/api/admin/staff', { cookie: ko, body: { name: 'Прораб', role: 'foreman', phone: '+380673330001' } });
  eq([inv.status, inv.data.linked], [200, false]);
  eq((await call(e2, 'GET', '/api/me', { cookie: ke })).data.client.staff, null);
  const acc = await addClient(e2, { provider: 'phone', id: '+380673330001', name: 'Прораб', phone: '+380673330001' });
  eq((await call(e2, 'GET', '/api/me', { cookie: await login(e2, acc) })).data.client.staff.role, 'foreman');
  const s = await call(e2, 'POST', '/api/auth/phone/start', { body: { phone: '+380673330002' } });
  const sig = (await import('../../functions/_lib.js')).botSignature;
  const c = await call(e2, 'POST', '/api/auth/phone/confirm', { body: { token: s.data.token, phone: '+380673330002', tg_id: '666' }, headers: { 'x-bot-signature': await sig(e2, s.data.token, '+380673330002', '666') } });
  eq(c.status, 200, 'підтвердження без колонки phone_verified');
});

describe('Безпека: журнал етапу веде сервер');
await it('«Зберегти проєкт» не дописує погодження від клієнта, історію й правки і не скидає паузу нагадувань', async () => {
  const C = await addClient(env, { id: 80001, name: 'Клієнт Дизайн' });
  const kc = await login(env, C);
  const forged = { approved_at: '2026-11-01', approved_by: 'client', rev_note: 'нібито правка клієнта', rev_at: '2026-11-01', review_at: '2026-11-01 10:00',
    remind_at: '2026-11-01 10:00', remind_n: 2, hist: [{ act: 'approve', at: '2026-11-01 10:00', by: 'Клієнт Дизайн' }] };
  const p = await call(env, 'POST', '/api/admin/projects', { cookie: ck.MGR, body: { type: 'project', client_id: C, service: 'design', title: 'Дизайн',
    stages: [{ name: 'Планування', status: 'review', progress: 90, ...forged }, { name: 'Концепція', status: 'review', progress: 90 }] } });
  eq(p.status, 200);
  const stages = async () => JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', p.data.id)).stages);
  let s = await stages();
  eq([s[0].approved_at, s[0].approved_by, s[0].hist, s[0].rev_note, s[0].remind_at, s[0].remind_n], ['2026-11-01', undefined, undefined, undefined, undefined, undefined], 'новий проєкт');
  // те саме через PATCH наявного етапу
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: p.data.id, stages: [{ ...s[0], ...forged }, { ...s[1], ...forged, approved_at: null }] } })).status, 200);
  s = await stages();
  eq([s[0].approved_by, s[0].hist, s[0].rev_note, s[0].remind_n, s[1].approved_by, s[1].hist, s[1].rev_note, s[1].remind_at], [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined], 'PATCH');
  // справжні дії: клієнт просить правки на 2-му етапі, менеджер нагадує про 1-й (знявши «погоджено»)
  eq((await call(env, 'POST', '/api/account/projects', { cookie: kc, body: { action: 'revise', project_id: p.data.id, stage_id: s[1].id, note: 'Пересунути стіну' } })).status, 200);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: p.data.id, stages: (await stages()).map((y, i) => (i ? y : { ...y, approved_at: null })) } })).status, 200);
  const rem = body => call(env, 'POST', '/api/admin/projects', { cookie: ck.MGR, body: { type: 'remind', project_id: p.data.id, stage_id: s[0].id, ...body } });
  eq((await rem({ channel: 'telegram' })).status, 400, '«надіслав бот» вручну в журнал не записати');
  eq((await rem({ channel: 'constructor' })).status, 400);
  eq((await rem({ channel: 'viber' })).status, 200);
  s = await stages();
  ok(s[0].remind_at && s[0].hist.length === 1 && s[1].hist.length === 1 && s[1].rev_note === 'Пересунути стіну');
  // стара форма без журналу (або зі стертим) — журнал, правки й пауза 48 год лишаються
  const wiped = s.map(({ hist, remind_at, remind_n, review_at, rev_note, rev_at, ...y }) => ({ ...y, hist: [], remind_at: '' }));
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: p.data.id, stages: wiped } })).status, 200);
  const s2 = await stages();
  eq([s2[0].remind_at, s2[0].hist, s2[1].hist, s2[1].rev_note, s2[1].rev_at], [s[0].remind_at, s[0].hist, s[1].hist, 'Пересунути стіну', s[1].rev_at]);
  eq((await rem({ channel: 'viber' })).status, 429, 'нагадування — не частіше 48 год');
  // клієнт погодив → збереження форми лишає «погодив клієнт»; інша дата погодження — це вже позначка менеджера
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: p.data.id, stages: s2.map((y, i) => (i ? { ...y, status: 'review' } : y)) } })).status, 200);
  eq((await call(env, 'POST', '/api/account/projects', { cookie: kc, body: { action: 'approve', project_id: p.data.id, stage_id: s[1].id } })).status, 200);
  let s3 = await stages();
  eq(s3[1].approved_by, 'client');
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: p.data.id, stages: s3 } })).status, 200);
  eq((await stages())[1].approved_by, 'client');
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.MGR, body: { id: p.data.id, stages: s3.map((y, i) => (i ? { ...y, approved_at: '2026-01-01' } : y)) } })).status, 200);
  s3 = await stages();
  eq([s3[1].approved_at, s3[1].approved_by, s3[1].hist.length], ['2026-01-01', undefined, 2]);
});

describe('Безпека: нагадування клієнту');
await it('клієнт вимкнув «Сповіщення в Telegram» у профілі — бот не пише (ні автоматично, ні кнопкою); менеджер отримує текст', async () => {
  const { runNudges, kyivStamp } = await import('../../functions/_nudges.js');
  const C = await addClient(env, { id: 80010, name: 'Тихий Клієнт' });
  const kc = await login(env, C);
  eq((await call(env, 'PATCH', '/api/account/profile', { cookie: kc, body: { notify_tg: false } })).status, 200);
  const p = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'project', client_id: C, service: 'design', title: 'Дизайн без сповіщень', stages: [{ name: 'Планування', progress: 50 }] } });
  const pid = p.data.id, sid = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', pid)).stages)[0].id;
  eq((await call(env, 'POST', '/api/team/action', { cookie: ck.OWNER, body: { type: 'stage', project_id: pid, stage_id: sid, status: 'review' } })).status, 200);
  const st = JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', pid)).stages);
  const day = new Date(); day.setUTCHours(10, 0, 0, 0);
  st[0].review_at = kyivStamp(new Date(day.getTime() - 30 * 3600000));
  await DB.prepare('UPDATE projects SET stages = ? WHERE id = ?').bind(JSON.stringify(st), pid).run();
  bot.reset();
  await runNudges(env, new Request('https://cas-develop.com/api/admin/lead-sla'), day);
  ok(!bot.calls.some(c => c.chat_id === '80010'), 'автоматичне нагадування');
  const r = await call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body: { type: 'remind', project_id: pid, stage_id: sid } });
  eq([r.status, r.data.sent], [200, false]); ok(/чекає вашого погодження/.test(r.data.text));
  ok(!bot.calls.some(c => c.chat_id === '80010'), 'кнопка «Нагадати»');
  await DB.prepare("UPDATE projects SET status = 'done', done_at = datetime('now', '-3 days') WHERE id = ?").bind(pid).run();
  await runNudges(env, new Request('https://cas-develop.com/api/admin/lead-sla'), day);
  ok(!bot.calls.some(c => c.chat_id === '80010'), 'прохання про відгук');
  eq((await q1('SELECT review_asked_at FROM projects WHERE id = ?', pid)).review_asked_at, null);
  // увімкнув знову — бот пише
  await call(env, 'PATCH', '/api/account/profile', { cookie: kc, body: { notify_tg: true } });
  await runNudges(env, new Request('https://cas-develop.com/api/admin/lead-sla'), day);
  ok(bot.calls.some(c => c.chat_id === '80010' && /Google|відгук/.test(c.text)), 'з увімкненими сповіщеннями — пише');
});

describe('Безпека: довідники й службові поля');
await it('статус, канал, тип, схема з назвою «constructor» / «__proto__» → помилка, у базу не потрапляє', async () => {
  const lead = (await call(env, 'POST', '/api/admin/crm', { cookie: ck.MGR, body: { name: 'Лід', phone: '0675550001' } })).data.id;
  for (const st of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: lead, status: st } })).status, 400, st);
    eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { bulk: { ids: [lead], status: st } } })).data.done, 0, 'bulk ' + st);
  }
  eq((await q1('SELECT status FROM orders WHERE id = ?', lead)).status, 'new');
  await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: lead, offer: { key: 'dz', area: 50 } } });
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: lead, offer_sent: 'constructor' } })).status, 400);
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: lead, offer: { key: 'constructor', area: 50 } } })).status, 422);
  const C = await addClient(env, { id: 80002, name: 'Клієнт' });
  const P = body => call(env, 'POST', '/api/admin/projects', { cookie: ck.OWNER, body });
  for (const t of ['constructor', '__proto__', 'toString']) {
    eq((await P({ type: t, project_id: 1 })).status, 400, 'type ' + t);
    eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { type: t, id: 1 } })).status, 400, 'PATCH type ' + t);
    eq((await call(env, 'DELETE', '/api/admin/projects?type=' + t + '&id=1', { cookie: ck.OWNER })).status, 400, 'DELETE type ' + t);
    eq((await call(env, 'POST', '/api/team/action', { cookie: ck.OWNER, body: { type: t, project_id: 1 } })).status, 400, 'team ' + t);
  }
  // значення не рядком (масив/обʼєкт) — так само не проходить
  eq((await call(env, 'PATCH', '/api/admin/crm', { cookie: ck.MGR, body: { id: lead, status: ['in_work'] } })).status, 400);
  eq((await P({ type: ['task'], project_id: 1, title: 'x' })).status, 400);
  eq((await call(env, 'PATCH', '/api/admin/projects', { cookie: ck.OWNER, body: { type: ['task'], id: 1 } })).status, 400);
  eq((await call(env, 'POST', '/api/team/action', { cookie: ck.OWNER, body: { type: ['task'], project_id: 1, note: 'x' } })).status, 400);
  const pr = await P({ type: 'project', client_id: C, title: 'Обʼєкт', scheme: 'constructor', contract_amount: 1000, stages: [{ name: 'Етап', status: 'constructor' }, { name: 'Етап 2', status: '__proto__', progress: 100 }, { name: 'Етап 3', status: ['review'] }] });
  eq(pr.status, 200);
  eq(JSON.parse((await q1('SELECT stages FROM projects WHERE id = ?', pr.data.id)).stages).map(s => s.status), ['planned', 'done', 'planned']);
  eq((await q1('SELECT COUNT(*) AS n FROM project_payments WHERE project_id = ?', pr.data.id)).n, 0, 'невідома схема — без платежів');
  const pay = await P({ type: 'payment', project_id: pr.data.id, title: 'Аванс', status: 'constructor' });
  eq((await q1('SELECT status FROM project_payments WHERE id = ?', pay.data.id)).status, 'planned');
  eq((await call(env, 'POST', '/api/admin/partners', { cookie: ck.MGR, body: { name: 'Контакт', status: 'constructor' } })).status, 400);
  eq((await call(env, 'POST', '/api/admin/partners', { cookie: ck.MGR, body: { name: 'Контакт', type: '__proto__' } })).status, 400);
});
await it('ціна позиції замовлення — лише за номером позиції (не «__proto__»)', async () => {
  const r = await DB.prepare("INSERT INTO orders (number, kind, name, phone, items, total, on_request, delivery, status) VALUES ('OZD-T-1', 'order', 'Гість', '+380501', ?, 0, 1, 'Київ, вул. Тестова, 5', 'new')")
    .bind(JSON.stringify([{ id: 1, name: 'Крісло', qty: 10, unit: 'шт', price: null }])).run();
  const id = r.meta.last_row_id;
  const patch = prices => call(env, 'PATCH', '/api/admin/orders', { cookie: ck.OWNER, body: { id, prices } });
  for (const index of ['__proto__', 'constructor', 'length', '0', -1, 1.5, null]) eq((await patch([{ index, price: 777 }])).status, 200);
  eq([].price, undefined, 'Array.prototype не змінено'); eq(Object.prototype.price, undefined);
  eq(JSON.parse((await q1('SELECT items FROM orders WHERE id = ?', id)).items)[0].price, null);
  eq((await patch([{ index: 0, price: 1200 }])).status, 200);
  eq(JSON.parse((await q1('SELECT items FROM orders WHERE id = ?', id)).items)[0].price, 1200);
});
await it('без права на контакти (бухгалтер): адреси доставки й адреси з профілю клієнта немає; з правом — є', async () => {
  const ACC = await addClient(env, { provider: 'google', id: 'g-acc2', name: 'Бухгалтерка', email: 'acc2@example.com' });
  await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Бухгалтерка', role: 'accountant', email: 'acc2@example.com' } });
  const ka = await login(env, ACC);
  const C = await addClient(env, { id: 80003, name: 'Клієнт з адресою', phone: '+380501239999' });
  await DB.prepare("UPDATE clients SET city = 'Київ, вул. Секретна, 7' WHERE id = ?").bind(C).run();
  await DB.prepare("UPDATE orders SET client_id = ? WHERE number = 'OZD-T-1'").bind(C).run();
  for (const [who, cookie, sees] of [['бухгалтер', ka, false], ['менеджер', ck.MGR, true]]) {
    const texts = [];
    for (const path of ['/api/admin/orders', '/api/admin/crm?kind=order', '/api/admin/clients', '/api/admin/clients?id=' + C]) {
      const r = await call(env, 'GET', path, { cookie });
      eq(r.status, 200, who + ' ' + path); texts.push(r.text);
    }
    const all = texts.join('\n');
    eq(/вул\. Тестова, 5/.test(all), sees, who + ': адреса доставки');
    eq(/вул\. Секретна, 7/.test(all), sees, who + ': адреса з профілю');
    eq(/380501239999/.test(all), sees, who + ': телефон');
    ok(/OZD-T-1/.test(all) && /Клієнт з адресою/.test(all), who + ': саме замовлення й імʼя видно');
  }
});
await it('невірний ключ інтеграції (x-lead-key): після серії спроб — 429; вірний ключ працює', async () => {
  const bad = (path, ip) => call(env, 'POST', path, { body: { phone: '0670000001' }, headers: { 'x-lead-key': 'wrong-key', ip, noOrigin: true } });
  for (const path of ['/api/leads', '/api/admin/lead-sla']) {
    const ip = path === '/api/leads' ? '10.7.7.1' : '10.7.7.2';
    let last;
    for (let i = 0; i < 20; i++) { last = await bad(path, ip); eq(last.status, 403, path + ' #' + i); }
    eq((await bad(path, ip)).status, 429, path);
    eq((await bad(path, '10.7.7.9')).status, 403, 'інша адреса — свій лічильник');
  }
  eq((await call(env, 'POST', '/api/leads', { body: { phone: '0670000002', name: 'З ключем' }, headers: { 'x-lead-key': 'lead-key', ip: '10.7.7.1', noOrigin: true } })).status, 200);
  eq((await call(env, 'POST', '/api/admin/lead-sla', { body: { task: 'report' }, headers: { 'x-lead-key': 'lead-key', ip: '10.7.7.2', noOrigin: true } })).status, 200);
});

describe('Безпека: заголовки сторінок (_headers)');
await it('кабінет: noindex і без кешу; адмінка — без фреймів; для кожної мови з 3D-турами є правило CSP', async () => {
  const H = readFileSync(join(ROOT, '_headers'), 'utf8');
  // правило → його заголовки (рядки з відступом; коментарі й порожні рядки між блоками не рахуємо)
  const block = rule => { const m = H.split(/\n(?=\/)/).find(b => b.split('\n')[0].trim() === rule); return m ? m.split('\n').slice(1).filter(l => /^\s+\S/.test(l)).map(l => l.trim()).join('\n') : ''; };
  ok(/X-Robots-Tag: noindex, nofollow/.test(block('/kabinet*')) && /Cache-Control: no-store/.test(block('/kabinet*')));
  ok(/frame-ancestors 'none'/.test(block('/kabinet/admin*')) && /Referrer-Policy: no-referrer/.test(block('/kabinet/admin*')));
  ok(/X-Frame-Options: SAMEORIGIN/.test(block('/*')) && /object-src 'none'/.test(block('/*')) && /base-uri 'self'/.test(block('/*')) && !/unsafe-eval/.test(block('/*')));
  const ref = block('/tury/*');
  ok(/frame-ancestors \*/.test(ref) && /script-src 'self' 'unsafe-eval'/.test(ref));
  for (const d of readdirSync(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory() || !/^[a-z]{2}$/.test(d.name) || !existsSync(join(ROOT, d.name, 'tury'))) continue;
    eq(block(`/${d.name}/tury/*`), ref, `/${d.name}/tury/* — те саме правило, що й /tury/*`);
  }
});

if (process.argv[1] && process.argv[1].endsWith('sec.mjs')) process.exit(report() ? 1 : 0);
