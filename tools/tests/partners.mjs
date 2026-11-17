// Тести «Партнерів» і API бота пошуку (migrations/0013_partners.sql, functions/api/bot/*, functions/api/admin/partners.js).
// Запускається з run.mjs (спільний звіт); окремо: node tools/tests/partners.mjs. Ключ бота тут — фіктивний, лише для тестів.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';

const KEY = 'test-leadbot-key-0123456789abcdef';
const env = makeEnv(freshDB(), { LEADBOT_KEY: KEY });
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
let ipN = 0;
const botCall = (m, path, body, { key = KEY, ip } = {}) => call(env, m, path, { body, headers: { ...(key == null ? {} : { 'x-bot-key': key }), ip: ip || '10.77.0.' + (++ipN % 200 + 1), noOrigin: true } });

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const DES = await addClient(env, { id: 444, name: 'Дизайнер' });
const ACC = await addClient(env, { id: 555, name: 'Бухгалтер' });
const CL = await addClient(env, { id: 999, name: 'Клієнт' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, DES, ACC, CL })) ck[k] = await login(env, id);
await call(env, 'GET', '/api/me', { cookie: ck.OWNER }); await call(env, 'GET', '/api/me', { cookie: ck.MGR });
await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Дизайнер', role: 'designer', tg: '444' } });
await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Бухгалтер', role: 'accountant', tg: '555' } });
ck.DES = await login(env, DES); ck.ACC = await login(env, ACC);

describe('Бот пошуку: автентифікація X-Bot-Key');
await it('без ключа → 401, невірний ключ → 401, вірний → 200', async () => {
  eq((await botCall('POST', '/api/bot/partners', { name: 'Х' }, { key: null })).status, 401);
  eq((await botCall('POST', '/api/bot/partners', { name: 'Х' }, { key: 'wrong-key' })).status, 401);
  eq((await botCall('POST', '/api/bot/partners', { name: 'Х' }, { key: KEY.slice(0, -1) + 'X' })).status, 401, 'ключ, що відрізняється останнім символом');
  eq((await botCall('GET', '/api/bot/feedback', undefined, { key: null })).status, 401);
  eq((await botCall('POST', '/api/bot/leads', { text: 'x', source_url: 'https://t.me/a/1' }, { key: '' })).status, 401);
  eq((await botCall('POST', '/api/bot/partners', { name: 'Тест Авторизації' })).status, 200);
});
await it('секрет LEADBOT_KEY не задано (або закороткий) → 503 навіть з будь-яким ключем', async () => {
  const e2 = { ...env, LEADBOT_KEY: '' };
  eq((await call(e2, 'POST', '/api/bot/partners', { body: { name: 'X' }, headers: { 'x-bot-key': '', noOrigin: true } })).status, 503);
  const e3 = { ...env, LEADBOT_KEY: 'short' };
  eq((await call(e3, 'POST', '/api/bot/partners', { body: { name: 'X' }, headers: { 'x-bot-key': 'short', noOrigin: true } })).status, 503);
});
await it('20 невдалих спроб з IP → 429, і вірний ключ з цього IP теж 429 до кінця вікна', async () => {
  let last;
  for (let i = 0; i < 21; i++) last = await botCall('POST', '/api/bot/partners', { name: 'X' }, { key: 'guess-' + i, ip: '10.99.9.9' });
  eq(last.status, 429);
  eq((await botCall('POST', '/api/bot/partners', { name: 'X' }, { ip: '10.99.9.9' })).status, 429);
  eq((await botCall('POST', '/api/bot/partners', { name: 'Інший IP' }, { ip: '10.99.9.10' })).status, 200);
});
await it('cookie працівника не відкриває /api/bot/* (потрібен саме ключ)', async () => {
  eq((await call(env, 'POST', '/api/bot/partners', { cookie: ck.OWNER, body: { name: 'X' } })).status, 401);
});

describe('Бот пошуку: перевірка полів');
await it('HTML у будь-якому полі → 400; сутності теж', async () => {
  for (const b of [{ name: '<b>Бригада</b>' }, { company: 'X</script>' }, { name: 'Ок', notes: 'x', city: '<img src=x onerror=alert(1)>' }, { name: 'Ок &lt;b&gt;' }, { name: 'Ок', tags: ['<i>x'] }]) {
    const r = await botCall('POST', '/api/bot/partners', b);
    eq(r.status, 400, JSON.stringify(b)); ok(/HTML/.test(r.data.error), r.data.error);
  }
  eq((await botCall('POST', '/api/bot/leads', { text: 'Шукаю <a href=x>ремонт</a>', source_url: 'https://t.me/g/1' })).status, 400);
  eq((await botCall('POST', '/api/bot/feedback', { hash: 'abcdefgh1', reason: '<b>спам</b>' })).status, 400);
});
await it('тип, @username, телефон, посилання: невалідне → 400', async () => {
  eq((await botCall('POST', '/api/bot/partners', { name: 'X', type: 'hacker' })).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { name: 'X', tg: '@a b' })).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { name: 'X', phone: '12' })).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { name: 'X', site: 'javascript:alert(1)' })).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { name: 'X', source_url: 'https://user:pass@t.me/x' })).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { name: 'X', name2: 1, tags: 'a,'.repeat(60) })).status, 400, 'забагато тегів');
  eq((await botCall('POST', '/api/bot/partners', {})).status, 400, 'порожній партнер');
  eq((await botCall('POST', '/api/bot/partners', [1, 2])).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { name: { x: 1 } })).status, 400, 'обʼєкт замість тексту');
  eq((await botCall('POST', '/api/bot/partners', { items: [] })).status, 400);
  eq((await botCall('POST', '/api/bot/partners', { items: Array(51).fill({ name: 'x' }) })).status, 400);
});
await it('довгі поля обрізаються, керівні символи прибираються', async () => {
  const r = await botCall('POST', '/api/bot/partners', { name: 'Я'.repeat(500), city: 'Київ\u0000\u0007 ' });
  eq(r.status, 200);
  const p = await q1('SELECT * FROM partners WHERE id = ?', r.data.id);
  eq(p.name.length, 120); eq(p.city, 'Київ');
});
await it('завеликий запит → 413', async () => {
  eq((await botCall('POST', '/api/bot/partners', { name: 'x', notes: 'я'.repeat(70000) })).status, 413);
});

describe('Бот пошуку: дедуплікація партнерів');
let crewId;
await it('новий партнер: тип, місто, @username (нижній регістр, без @), джерело, теги', async () => {
  const r = await botCall('POST', '/api/bot/partners', { name: 'Бригада Петра', type: 'crew', city: 'Київ', tg: '@Petro_Crew', tags: ['Плитка', 'плитка', 'стяжка'],
    source_name: 'Ремонт Київ (група)', source_url: 'https://t.me/remont_kyiv/123' });
  eq(r.status, 200); eq(r.data.created, true); eq(r.data.times_seen, 1); crewId = r.data.id;
  const p = await q1('SELECT * FROM partners WHERE id = ?', crewId);
  eq(p.tg, 'petro_crew'); eq(p.status, 'new'); eq(JSON.parse(p.tags), ['плитка', 'стяжка']); eq(JSON.parse(p.sources).length, 1);
});
await it('той самий @username (інший регістр, t.me-посилання) → оновлення, times_seen 2, нові поля й теги дописано', async () => {
  const r = await botCall('POST', '/api/bot/partners', { tg: 'https://t.me/petro_crew', phone: '067 111 22 33', tags: ['електрика'], source_name: 'Інша група', source_url: 'https://t.me/other/9' });
  eq(r.data.created, false); eq(r.data.id, crewId); eq(r.data.times_seen, 2);
  const p = await q1('SELECT * FROM partners WHERE id = ?', crewId);
  eq(p.name, 'Бригада Петра'); eq(p.phone, '+380671112233'); eq(p.times_seen, 2); eq(p.source_name, 'Інша група');
  eq(JSON.parse(p.tags), ['плитка', 'стяжка', 'електрика']); eq(JSON.parse(p.sources).length, 2);
});
await it('той самий телефон в іншому форматі → той самий партнер', async () => {
  const r = await botCall('POST', '/api/bot/partners', { name: 'Петро', phone: '+38 (067) 111-22-33' });
  eq(r.data.id, crewId); eq(r.data.times_seen, 3);
});
await it('компанія з лапками й ТОВ / сайт з www → той самий партнер', async () => {
  const a = await botCall('POST', '/api/bot/partners', { company: 'ТОВ «Будмайстер Плюс»', type: 'builder', site: 'https://www.budmaster.example.com/' });
  const b = await botCall('POST', '/api/bot/partners', { company: 'Будмайстер плюс', city: 'Ірпінь' });
  const c = await botCall('POST', '/api/bot/partners', { name: 'Хтось', site: 'http://budmaster.example.com/contacts' });
  eq(b.data.id, a.data.id); eq(c.data.id, a.data.id); eq(c.data.times_seen, 3);
  const p = await q1('SELECT * FROM partners WHERE id = ?', a.data.id);
  eq(p.city, 'Ірпінь'); eq(p.type, 'builder');
});
await it('бот не змінює статус і нотатки менеджера; тип «Інше» уточнюється', async () => {
  const r = await botCall('POST', '/api/bot/partners', { name: 'Ріелтор Оля', tg: '@olya_realty' });
  await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.MGR, body: { id: r.data.id, status: 'working', notes: 'Дає клієнтів з новобудов' } });
  await botCall('POST', '/api/bot/partners', { tg: '@olya_realty', type: 'realtor' });
  const p = await q1('SELECT * FROM partners WHERE id = ?', r.data.id);
  eq(p.status, 'working'); eq(p.notes, 'Дає клієнтів з новобудов'); eq(p.type, 'realtor'); eq(p.times_seen, 2);
});
await it('пакет items: кожен окремо, помилка одного не ламає інші', async () => {
  const r = await botCall('POST', '/api/bot/partners', { items: [{ name: 'Постачальник Плитки', type: 'supplier', tg: '@tile_supply' }, { name: '<b>x</b>' }, { tg: '@petro_crew' }] });
  eq(r.status, 200); eq(r.data.results.length, 3);
  eq(r.data.results[0].created, true); ok(r.data.results[1].error); eq(r.data.results[2].id, crewId);
});

describe('Бот пошуку: заявка «В CRM»');
let leadId;
await it('створює заявку source=finder без сповіщення (notify не true)', async () => {
  bot.reset();
  const r = await botCall('POST', '/api/bot/leads', { hash: 'lead-abc-0001', service: 'Ремонт квартири', city: 'Київ', area: '75 м²', budget: '$40 000',
    estimate: 'Ремонт від $550/м² → від $41 250', score: 87, source_name: 'Ремонт Київ', source_url: 'https://t.me/remont_kyiv/555',
    text: 'Шукаю бригаду на ремонт трикімнатної', author: { name: 'Андрій', tg: '@andrii_test' } });
  eq(r.status, 200); ok(/^LD-/.test(r.data.number)); eq(r.data.notified, false); leadId = r.data.id;
  const o = await q1('SELECT * FROM orders WHERE id = ?', leadId);
  eq(o.kind, 'lead'); eq(o.source, 'finder'); eq(o.form, 'finder'); eq(o.contact_tg, 'andrii_test'); eq(o.ext_hash, 'lead-abc-0001'); eq(o.city, 'Київ'); eq(o.phone, null);
  ok(/Скор: 87\/100/.test(o.comment) && /Бюджет: \$40 000/.test(o.comment) && /t\.me\/remont_kyiv\/555/.test(o.comment));
  eq(bot.calls.filter(c => c.method === 'sendMessage').length, 0, 'без notify — без сповіщення');
});
await it('той самий hash удруге → duplicate, нова заявка не створюється', async () => {
  const r = await botCall('POST', '/api/bot/leads', { hash: 'lead-abc-0001', service: 'Ремонт', source_url: 'https://t.me/x/1' });
  eq(r.data.duplicate, true); eq(r.data.id, leadId);
  eq((await q1("SELECT COUNT(*) AS n FROM orders WHERE source = 'finder'")).n, 1);
});
await it('notify: true → сповіщення адмінам у Telegram', async () => {
  bot.reset();
  const r = await botCall('POST', '/api/bot/leads', { hash: 'lead-abc-0002', service: 'Дизайн інтерʼєру', author: { phone: '0501234567' }, notify: true });
  eq(r.status, 200); eq(r.data.notified, true);
  ok(bot.calls.some(c => c.method === 'sendMessage' && /Дизайн інтерʼєру/.test(c.text)), 'адміни отримали сповіщення');
});
await it('без контакту й посилання → 400; без послуги й тексту → 400; score поза 0–100 → 400; notify не boolean → 400', async () => {
  eq((await botCall('POST', '/api/bot/leads', { service: 'Ремонт' })).status, 400);
  eq((await botCall('POST', '/api/bot/leads', { author: { tg: '@someone_x' } })).status, 400);
  eq((await botCall('POST', '/api/bot/leads', { service: 'Р', source_url: 'https://t.me/a/1', score: 150 })).status, 400);
  eq((await botCall('POST', '/api/bot/leads', { service: 'Р', source_url: 'https://t.me/a/1', notify: 'yes' })).status, 400);
  eq((await botCall('POST', '/api/bot/leads', { service: 'Р', source_url: 'https://t.me/a/1', hash: 'bad hash!' })).status, 400);
});
await it('CRM: фільтр source=finder / place=finder — лише заявки бота; place «finder», Telegram автора — у рядку й CSV', async () => {
  await call(env, 'POST', '/api/leads', { body: { name: 'З сайту', phone: '0679998877', source: 'cas-develop.com/remont' }, headers: { ip: '10.5.5.5' } });
  for (const qs of ['source=finder', 'place=finder']) {
    const r = await call(env, 'GET', '/api/admin/crm?' + qs, { cookie: ck.MGR });
    eq(r.status, 200); eq(r.data.rows.length, 2, qs); ok(r.data.rows.every(o => o.source === 'finder' && o.place === 'finder'));
  }
  const all = await call(env, 'GET', '/api/admin/crm', { cookie: ck.MGR });
  ok(all.data.rows.some(o => o.name === 'З сайту'));
  eq(all.data.rows.find(o => o.id === leadId).contact_tg, 'andrii_test');
  const man = await call(env, 'GET', '/api/admin/crm?place=manual', { cookie: ck.MGR });
  ok(!man.data.rows.some(o => o.source === 'finder'), '«Вручну» не включає бота');
  const csv = await call(env, 'GET', '/api/admin/crm?source=finder&format=csv', { cookie: ck.OWNER });
  ok(/Telegram/.test(csv.text) && /andrii_test/.test(csv.text));
  const s = await call(env, 'GET', '/api/admin/crm?q=andrii_test', { cookie: ck.MGR });
  eq(s.data.rows.length, 1, 'пошук за Telegram автора');
});

describe('Бот пошуку: «Не цікаво» (feedback)');
await it('POST записує, повтор оновлює причину; GET ?since= віддає змінені після since', async () => {
  eq((await botCall('POST', '/api/bot/feedback', { hash: 'lead-xyz-0001', reason: 'Це реклама підрядника' })).status, 200);
  eq((await botCall('POST', '/api/bot/feedback', { hash: 'lead-xyz-0002', reason: 'Не наш регіон', verdict: 'not_interested' })).status, 200);
  await DB.prepare("UPDATE bot_feedback SET updated_at = '2026-01-01 00:00:00' WHERE lead_hash = 'lead-xyz-0002'").run();
  eq((await botCall('POST', '/api/bot/feedback', { hash: 'lead-xyz-0001', reason: 'Спам', verdict: 'spam' })).status, 200);
  eq((await q1('SELECT COUNT(*) AS n FROM bot_feedback')).n, 2);
  const all = await botCall('GET', '/api/bot/feedback');
  eq(all.data.items.map(i => i.hash), ['lead-xyz-0002', 'lead-xyz-0001']); eq(all.data.items[1].verdict, 'spam'); eq(all.data.items[1].reason, 'Спам');
  const since = await botCall('GET', '/api/bot/feedback?since=2026-06-01');
  eq(since.data.items.map(i => i.hash), ['lead-xyz-0001']);
  const iso = await botCall('GET', '/api/bot/feedback?since=' + encodeURIComponent('2025-12-31T23:00:00Z') + '&limit=1');
  eq(iso.data.items.length, 1); eq(iso.data.more, true); eq(iso.data.next, '2026-01-01 00:00:00');
  const nxt = await botCall('GET', '/api/bot/feedback?since=' + encodeURIComponent(iso.data.next));
  eq(nxt.data.items.map(i => i.hash), ['lead-xyz-0001']);
});
await it('невалідні hash / verdict / since → 400', async () => {
  eq((await botCall('POST', '/api/bot/feedback', { hash: 'short' })).status, 400);
  eq((await botCall('POST', '/api/bot/feedback', { hash: 'lead-xyz-0003', verdict: 'love' })).status, 400);
  eq((await botCall('GET', '/api/bot/feedback?since=вчора')).status, 400);
  eq((await botCall('GET', "/api/bot/feedback?since=2026-01-01'%20OR%201=1")).status, 400);
});

describe('«Партнери» в /kabinet/admin: ролі');
await it('власник і менеджер бачать список; дизайнер, бухгалтер і клієнт — 403; гість — 401', async () => {
  const o = await call(env, 'GET', '/api/admin/partners', { cookie: ck.OWNER });
  eq(o.status, 200); ok(o.data.rows.length >= 4); ok(o.data.types.crew && o.data.statuses.working);
  eq((await call(env, 'GET', '/api/admin/partners', { cookie: ck.MGR })).status, 200);
  eq((await call(env, 'GET', '/api/admin/partners', { cookie: ck.DES })).status, 403);
  eq((await call(env, 'GET', '/api/admin/partners?id=' + crewId, { cookie: ck.DES })).status, 403);
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.DES, body: { id: crewId, status: 'rejected' } })).status, 403);
  eq((await call(env, 'GET', '/api/admin/partners?format=csv', { cookie: ck.ACC })).status, 403);
  eq((await call(env, 'GET', '/api/admin/partners', { cookie: ck.CL })).status, 403);
  eq((await call(env, 'GET', '/api/admin/partners')).status, 401);
  const me = await call(env, 'GET', '/api/admin/crm', { cookie: ck.DES });
  ok(!me.data.me.perms.includes('partners.base'), 'у дизайнера немає права partners.base');
});
await it('фільтри: тип, статус, місто, пошук (@username, тег)', async () => {
  const g = async qs => (await call(env, 'GET', '/api/admin/partners?' + qs, { cookie: ck.MGR })).data.rows;
  ok((await g('type=crew')).every(r => r.type === 'crew')); ok((await g('type=crew')).some(r => r.id === crewId));
  eq((await g('status=working')).map(r => r.name), ['Ріелтор Оля']);
  eq((await g('city=' + encodeURIComponent('Ірпінь'))).length, 1);
  eq((await g('q=' + encodeURIComponent('@petro_crew')))[0].id, crewId);
  eq((await g('tag=електрика')).map(r => r.id), [crewId]);
  eq((await g('q=' + encodeURIComponent('%'))).length, 0, '% у пошуку — буквально');
});
await it('картка ?id=: теги й джерела масивами, без службових ключів', async () => {
  const r = await call(env, 'GET', '/api/admin/partners?id=' + crewId, { cookie: ck.MGR });
  eq(r.data.partner.tg, 'petro_crew'); eq(r.data.partner.sources.length, 2); ok(Array.isArray(r.data.partner.tags));
  ok(!('company_key' in r.data.partner)); eq(r.data.partner.type_label, 'Бригада / підрядник');
  eq((await call(env, 'GET', '/api/admin/partners?id=99999', { cookie: ck.MGR })).status, 404);
});
await it('PATCH: статус/нотатки/контакт; аудит pbase.update; контакт іншого партнера → 409; невалідне → 400', async () => {
  const r = await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.MGR, body: { id: crewId, status: 'interesting', notes: 'Добре кладуть плитку', tags: ['плитка'] } });
  eq(r.status, 200); eq(r.data.partner.status, 'interesting'); eq(r.data.partner.tags, ['плитка']);
  const p = await q1('SELECT * FROM partners WHERE id = ?', crewId);
  eq(p.tg, 'petro_crew', 'незмінені поля лишились'); eq(p.notes, 'Добре кладуть плитку');
  const a = await q1("SELECT * FROM audit_log WHERE action = 'pbase.update' AND entity_id = ? ORDER BY id DESC", String(crewId));
  ok(a && /interesting/.test(a.after) && /new/.test(a.before));
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.MGR, body: { id: crewId, tg: '@olya_realty' } })).status, 409);
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.MGR, body: { id: crewId, status: 'vip' } })).status, 400);
  eq((await call(env, 'PATCH', '/api/admin/partners', { cookie: ck.MGR, body: { id: crewId, notes: '<script>x</script>' } })).status, 400);
});
await it('POST вручну: новий → 200 і аудит pbase.create; дубль → 409 з id', async () => {
  const r = await call(env, 'POST', '/api/admin/partners', { cookie: ck.OWNER, body: { name: 'Архітектор Ігор', type: 'designer', tg: '@igor_arch', status: 'interesting' } });
  eq(r.status, 200);
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.create' AND entity_id = ?", String(r.data.id)));
  const d = await call(env, 'POST', '/api/admin/partners', { cookie: ck.MGR, body: { name: 'Ігор', tg: 'IGOR_ARCH' } });
  eq(d.status, 409); eq(d.data.id, r.data.id);
});

describe('«Партнери»: CSV');
await it('CSV (власник, менеджер): заголовок, @username, тип і статус підписами; аудит pbase.export', async () => {
  const r = await call(env, 'GET', '/api/admin/partners?format=csv', { cookie: ck.MGR });
  eq(r.status, 200); ok(/text\/csv/.test(r.headers.get('content-type'))); ok(/attachment; filename="cas-partners-/.test(r.headers.get('content-disposition')));
  const lines = r.text.replace(/^﻿/, '').trim().split('\r\n');
  ok(/^ID;Імʼя;Компанія;Тип/.test(lines[0]), lines[0]);
  ok(lines.some(l => /@petro_crew/.test(l) && /Бригада \/ підрядник/.test(l) && /Цікавий/.test(l)));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'pbase.export'"));
  const f = await call(env, 'GET', '/api/admin/partners?format=csv&type=supplier', { cookie: ck.OWNER });
  ok(!/petro_crew/.test(f.text) && /tile_supply/.test(f.text), 'CSV з фільтром');
});
await it('CSV-інʼєкція: імʼя з «=» отримує апостроф', async () => {
  await botCall('POST', '/api/bot/partners', { name: '=HYPERLINK("http://evil.example")', tg: '@inject_test' });
  const r = await call(env, 'GET', '/api/admin/partners?format=csv&q=inject_test', { cookie: ck.OWNER });
  ok(/;"'=HYPERLINK\(""http:\/\/evil\.example""\)";/.test(r.text), r.text.split('\r\n')[1]);
});

if (process.argv[1] && process.argv[1].endsWith('partners.mjs')) process.exit(report() ? 1 : 0);
