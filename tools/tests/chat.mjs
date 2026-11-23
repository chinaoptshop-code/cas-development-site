// Тести чату на сайті (migrations/0021_chat.sql, functions/_chat.js, /api/chat/*, /api/bot/chat*, /api/admin/chat).
// Запускається з run.mjs (спільний звіт); окремо: node tools/tests/chat.mjs. Ключ бота й номери — фіктивні, лише для тестів.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';

const KEY = 'test-leadbot-key-0123456789abcdef';
// фейковий R2 (binding MEDIA): put / get / delete у памʼяті
function fakeR2() {
  const m = new Map();
  return { m, async put(k, v) { m.set(k, new Uint8Array(v)); }, async get(k) { return m.has(k) ? { body: m.get(k) } : null; }, async delete(k) { m.delete(k); } };
}
const R2 = fakeR2();
const env = makeEnv(freshDB(), { LEADBOT_KEY: KEY, MEDIA: R2 });
const envD1 = makeEnv(freshDB(), { LEADBOT_KEY: KEY }); // без R2 — байти в D1
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
let ipN = 0;
const nextIp = () => '10.55.' + (Math.floor(++ipN / 200) % 200) + '.' + (ipN % 200 + 1);
const start = async (e = env, body = { lang: 'uk', page: '/remont-kvartyr-kyiv' }, ip = nextIp()) => {
  const r = await call(e, 'POST', '/api/chat/start', { body, headers: { ip } });
  return { ...r.data, status: r.status, ip, h: { 'x-chat-sid': r.data && r.data.sid, 'x-chat-token': r.data && r.data.token, ip } };
};
const send = (c, body, e = env) => call(e, 'POST', '/api/chat/send', { body, headers: c.h });
const poll = (c, after = 0, e = env) => call(e, 'GET', '/api/chat/poll?after=' + after, { headers: c.h });
const up = (c, name, bytes, mime = 'application/octet-stream', e = env, extra = {}) => call(e, 'POST', '/api/chat/upload', { raw: bytes,
  headers: { ...c.h, 'content-type': mime, 'x-file-name': encodeURIComponent(name), ...extra } });
const botCall = (m, path, body, e = env, key = KEY) => call(e, m, path, { body, headers: { ...(key ? { 'x-bot-key': key } : {}), ip: '10.200.0.1', noOrigin: true } });
const B = (...parts) => { const a = []; for (const p of parts) typeof p === 'string' ? a.push(...[...p].map(c => c.charCodeAt(0))) : a.push(...p); return new Uint8Array(a); };
const pad = (head, n = 200) => { const b = new Uint8Array(Math.max(n, head.length)); b.set(head); return b; };
const PNG = pad(B([0x89], 'PNG\r\n\x1a\n')), JPG = pad(B([0xff, 0xd8, 0xff, 0xe0])), PDF = pad(B('%PDF-1.7\n')), DWG = pad(B('AC1032')),
  XLSX = pad(B('PK\x03\x04')), WEBM = pad(B([0x1a, 0x45, 0xdf, 0xa3])), OGG = pad(B('OggS')), M3DS = pad(B([0x4d, 0x4d, 0x10, 0])), MP4 = pad(B([0, 0, 0, 0x18], 'ftypmp42'));

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const DES = await addClient(env, { id: 444, name: 'Дизайнер' });
const CL = await addClient(env, { id: 999, name: 'Клієнт' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, DES, CL })) ck[k] = await login(env, id);
await call(env, 'GET', '/api/me', { cookie: ck.OWNER }); await call(env, 'GET', '/api/me', { cookie: ck.MGR });
await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name: 'Дизайнер', role: 'designer', tg: '444' } });
ck.DES = await login(env, DES);

describe('Чат: розмова відвідувача');
let A;
await it('start → sid 32 hex, token 64 hex, привітання мовою, ліміти з R2; у D1 — лише хеш токена й IP', async () => {
  A = await start(env, { lang: 'en', page: 'https://cas-develop.com/en/interior-design?x=1', ref_host: 'www.Google.com' });
  eq(A.status, 200); ok(/^[0-9a-f]{32}$/.test(A.sid)); ok(/^[0-9a-f]{64}$/.test(A.token));
  ok(/CAS Development/.test(A.hello) && /Hello/.test(A.hello)); eq(A.limits, { file: 50 * 1024 * 1024, session: 150 * 1024 * 1024, r2: true });
  ok(A.accept.includes('.dwg') && A.accept.includes('.3ds') && !A.accept.includes('.svg') && !A.accept.includes('.html'));
  const s = await q1('SELECT * FROM chat_sessions WHERE sid = ?', A.sid);
  eq(s.lang, 'en'); eq(s.page, '/en/interior-design'); eq(s.ref_host, 'google.com'); eq(s.state, 'bot');
  ok(s.token_hash !== A.token && s.token_hash.length === 64); ok(!JSON.stringify(s).includes(A.token)); ok(!JSON.stringify(s).includes('10.55.'));
  eq(A.online, false, 'воркер ще не пінгував');
});
await it('невідома мова → uk; чужа сторінка й розмітка в page/ref_host → null', async () => {
  const c = await start(env, { lang: 'xx', page: 'https://evil.example/<script>', ref_host: '<b>x</b>' });
  const s = await q1('SELECT * FROM chat_sessions WHERE sid = ?', c.sid);
  eq(s.lang, 'uk'); eq(s.page, null); eq(s.ref_host, null);
});
await it('send: текст і опитування; порожнє — 422; задовге — 413; не рядок — 400', async () => {
  const r = await send(A, { text: '  Скільки коштує ремонт 60 м²?\r\nКиїв ' });
  eq(r.status, 200); ok(r.data.id > 0); eq(r.data.state, 'bot');
  const p = await poll(A);
  eq(p.status, 200); eq(p.data.messages.length, 1); eq(p.data.messages[0].role, 'user'); eq(p.data.messages[0].text, 'Скільки коштує ремонт 60 м²?\nКиїв');
  eq(p.data.state, 'bot'); eq(p.data.typing, false); eq(p.data.last_id, r.data.id);
  eq((await poll(A, r.data.id)).data.messages.length, 0, 'after — лише нові');
  eq((await send(A, { text: '   ' })).status, 422);
  eq((await send(A, {})).status, 422);
  eq((await send(A, { text: 'я'.repeat(4300) })).status, 413);
  eq((await send(A, { text: { a: 1 } })).status, 400);
  // ≤ 4000 знаків приймаємо, керівні символи прибираємо
  const long = await send(A, { text: 'a\u0000b‮c' + 'я'.repeat(4100 - 10) });
  eq(long.status, 200);
  const m = await q1('SELECT text FROM chat_messages WHERE id = ?', long.data.id);
  eq(m.text.length, 4000); ok(m.text.startsWith('abc'));
});
await it('чужий / невірний токен, чужий sid → 404 (не підтверджуємо існування)', async () => {
  const B2 = await start();
  eq((await call(env, 'GET', '/api/chat/poll', { headers: { 'x-chat-sid': A.sid, 'x-chat-token': B2.token } })).status, 404);
  eq((await call(env, 'GET', '/api/chat/poll', { headers: { 'x-chat-sid': A.sid, 'x-chat-token': A.token.slice(0, -1) + (A.token.endsWith('0') ? '1' : '0') } })).status, 404);
  eq((await call(env, 'GET', '/api/chat/poll', { headers: { 'x-chat-sid': 'f'.repeat(32), 'x-chat-token': A.token } })).status, 404);
  eq((await call(env, 'GET', '/api/chat/poll')).status, 404);
  eq((await send({ h: { 'x-chat-sid': A.sid, 'x-chat-token': B2.token } }, { text: 'hi' })).status, 404);
  // sid і token параметрами адреси — ні (токен не має лишатися в журналах і історії)
  eq((await call(env, 'GET', `/api/chat/poll?sid=${A.sid}&token=${A.token}`)).status, 404);
  eq((await call(env, 'GET', '/api/chat/poll', { headers: A.h })).status, 200);
});
await it('POST без Origin свого сайту → 403 (чат — лише для браузера); чужий Origin → 403', async () => {
  eq((await call(env, 'POST', '/api/chat/start', { body: { lang: 'uk' }, headers: { noOrigin: true, ip: nextIp() } })).status, 403);
  eq((await call(env, 'POST', '/api/chat/start', { body: { lang: 'uk' }, headers: { origin: 'https://evil.example', ip: nextIp() } })).status, 403);
  eq((await call(env, 'POST', '/api/chat/send', { body: { text: 'x' }, headers: { ...A.h, noOrigin: true } })).status, 403);
  eq((await call(env, 'POST', '/api/chat/upload', { raw: PNG, headers: { ...A.h, noOrigin: true, 'x-file-name': 'a.png' } })).status, 403);
});

describe('Чат: файли');
let fPng, fPdf;
await it('фото, PDF, DWG, Excel, 3DS, відео, голос webm/ogg — приймаємо; тип за розширенням і сигнатурою', async () => {
  const cases = [['plan.png', PNG, 'image/png', 'image'], ['ТЗ клієнта.pdf', PDF, 'application/pdf', 'pdf'], ['kitchen.dwg', DWG, '', 'cad'],
    ['смета.xlsx', XLSX, '', 'sheet'], ['room.3ds', M3DS, '', 'model'], ['tour.mp4', MP4, 'video/mp4', 'video'],
    ['voice.webm', WEBM, 'audio/webm;codecs=opus', 'audio'], ['voice.ogg', OGG, 'audio/ogg', 'audio'], ['photo.JPG', JPG, 'image/jpeg', 'image']];
  for (const [name, bytes, mime, kind] of cases) {
    const r = await up(A, name, bytes, mime);
    eq(r.status, 200, name + ' ' + JSON.stringify(r.data)); eq(r.data.kind, kind, name); ok(/^[0-9a-f]{24}$/.test(r.data.file_id));
    if (name === 'plan.png') fPng = r.data.file_id;
    if (name.endsWith('.pdf')) fPdf = r.data.file_id;
  }
  eq((await q1('SELECT mime FROM chat_files WHERE id = ?', fPng)).mime, 'image/png');
  ok(R2.m.size >= cases.length, 'байти — у R2');
});
await it('небезпечні й невідомі типи → 415; вміст не відповідає типу → 415; HTML під виглядом CSV/DXF → 415', async () => {
  for (const n of ['page.html', 'x.svg', 'a.js', 'setup.exe', 'run.bat', 'x.php', 'noext', 'a.htm', 'x.mjs']) eq((await up(A, n, pad(B('<html>')))).status, 415, n);
  eq((await up(A, 'fake.png', pad(B('<svg onload=alert(1)>')), 'image/png')).status, 415);
  eq((await up(A, 'fake.pdf', pad(B('hello world')))).status, 415);
  eq((await up(A, 'fake.dwg', pad(B('MZ\x90')))).status, 415);
  eq((await up(A, 'list.csv', B('<script>alert(1)</script>,1'))).status, 415);
  eq((await up(A, 'plan.dxf', B('  <html><body>'))).status, 415);
  eq((await up(A, 'ok.csv', B('area;price\n60;550'))).status, 200);
  eq((await up(A, 'empty.png', new Uint8Array(0))).status, 400);
});
await it('імʼя файлу: без шляху, лапок і розмітки; ≤ 120 символів із розширенням', async () => {
  const r = await up(A, '../../etc/"<img src=x onerror=alert(1)>".png', PNG, 'image/png');
  eq(r.status, 200); ok(!/[<>"\/]/.test(r.data.name), r.data.name);
  const r2 = await up(A, 'д'.repeat(300) + '.pdf', PDF);
  eq(r2.data.name.length, 120); ok(r2.data.name.endsWith('.pdf'));
});
await it('надіслати з файлами: свої, ще не надіслані; чужий файл → 404; той самий двічі → 404', async () => {
  const C = await start();
  const fc = (await up(C, 'c.png', PNG, 'image/png')).data.file_id;
  eq((await send(A, { files: [fc] })).status, 404, 'файл іншої розмови');
  const r = await send(A, { text: 'План і ТЗ', files: [fPng, fPdf, fPng] });
  eq(r.status, 200);
  eq((await send(A, { files: [fPng] })).status, 404, 'уже надісланий');
  eq((await send(A, { files: ['zz'] })).status, 400);
  const m = (await poll(A)).data.messages.find(x => x.id === r.data.id);
  eq(m.files.map(f => f.name).sort(), ['plan.png', 'ТЗ клієнта.pdf'].sort());
  ok(!('data' in m.files[0]) && !('r2_key' in m.files[0]));
});
await it('файл віддаємо лише своїй розмові: attachment, nosniff, sandbox; активний тип ніколи', async () => {
  const r = await call(env, 'GET', '/api/chat/file/' + fPng, { headers: A.h });
  eq(r.status, 200); eq(r.headers.get('content-type'), 'image/png'); ok(/^attachment;/.test(r.headers.get('content-disposition')));
  eq(r.headers.get('x-content-type-options'), 'nosniff'); ok(/sandbox|default-src 'none'/.test(r.headers.get('content-security-policy')));
  const p = await call(env, 'GET', '/api/chat/file/' + fPdf, { headers: A.h });
  eq(p.headers.get('content-type'), 'application/octet-stream'); ok(/filename\*=UTF-8''/.test(p.headers.get('content-disposition')));
  const C = await start();
  eq((await call(env, 'GET', '/api/chat/file/' + fPng, { headers: C.h })).status, 404, 'чужа розмова');
  eq((await call(env, 'GET', '/api/chat/file/' + fPng)).status, 404, 'без токена');
  eq((await call(env, 'GET', '/api/chat/file/zz', { headers: A.h })).status, 404);
});
await it('без R2: до 1,5 МБ у D1, більший файл → 413 {too_big, alt: Telegram/WhatsApp}; з R2 — до 50 МБ', async () => {
  const D = await start(envD1);
  eq(D.limits, { file: 1.5 * 1024 * 1024, session: 6 * 1024 * 1024, r2: false });
  const okR = await up(D, 'a.jpg', pad(JPG, 1024 * 1024), 'image/jpeg', envD1);
  eq(okR.status, 200);
  const f = await envD1.DB.prepare('SELECT data, r2_key FROM chat_files WHERE id = ?').bind(okR.data.file_id).first();
  ok(f.data && !f.r2_key, 'байти в D1');
  const big = await up(D, 'b.jpg', pad(JPG, 2 * 1024 * 1024), 'image/jpeg', envD1);
  eq(big.status, 413); eq(big.data.too_big, true); ok(/t\.me/.test(big.data.alt.telegram) && /wa\.me/.test(big.data.alt.whatsapp));
  const got = await call(envD1, 'GET', '/api/chat/file/' + okR.data.file_id, { headers: D.h });
  eq(got.status, 200); eq(got.text.length > 0, true);
  // з R2 — 10 МБ проходить
  eq((await up(A, 'big.pdf', pad(PDF, 10 * 1024 * 1024))).status, 200);
  // понад 50 МБ відсікає ще спільний middleware за Content-Length
  const { csrfCheck } = await import('../../functions/api/_middleware.js');
  const req = n => new Request('https://cas-develop.com/api/chat/upload', { method: 'POST', headers: { origin: 'https://cas-develop.com', 'content-type': 'application/pdf', 'content-length': String(n) } });
  eq(csrfCheck(req(60 * 1024 * 1024)).status, 413); eq(csrfCheck(req(49 * 1024 * 1024)), null, 'сирі байти до 50 МБ — не JSON, але дозволено');
  const other = new Request('https://cas-develop.com/api/chat/send', { method: 'POST', headers: { origin: 'https://cas-develop.com', 'content-type': 'text/plain', 'content-length': '5' } });
  eq(csrfCheck(other).status, 415, 'решта /api/chat — лише JSON');
});
await it('ліміт байтів розмови без R2 (6 МБ) і кількості файлів (30) → 413', async () => {
  const D = await start(envD1);
  let last;
  for (let i = 0; i < 5; i++) last = await up(D, `p${i}.jpg`, pad(JPG, 1.4 * 1024 * 1024), 'image/jpeg', envD1);
  eq(last.status, 413); eq(last.data.session_full, true);
  const E = await start();
  await DB.prepare('UPDATE chat_sessions SET bytes = 0 WHERE sid = ?').bind(E.sid).run();
  for (let i = 0; i < 30; i++) await DB.prepare("INSERT INTO chat_files (id, session_id, name, mime, kind, size, data) VALUES (?, (SELECT id FROM chat_sessions WHERE sid = ?), 'x.png', 'image/png', 'image', 1, x'00')")
    .bind(String(i).padStart(24, 'a'), E.sid).run();
  const r = await up(E, 'one.png', PNG, 'image/png');
  eq(r.status, 413); eq(r.data.too_many, true);
});

describe('Чат: ліміти');
await it('нових розмов з однієї адреси — 10 на годину, далі 429', async () => {
  const ip = '10.66.6.6';
  let last;
  for (let i = 0; i < 11; i++) last = await start(env, { lang: 'uk' }, ip);
  eq(last.status, 429);
  eq((await start(env, { lang: 'uk' }, '10.66.6.7')).status, 200);
});
await it('повідомлень у розмові — 40 на годину, далі 429', async () => {
  const C = await start();
  let last;
  for (let i = 0; i < 41; i++) last = await send(C, { text: 'm' + i });
  eq(last.status, 429);
});
await it('завантажень з адреси — 60 на годину, далі 429', async () => {
  const C = await start(env, { lang: 'uk' }, '10.67.0.1');
  let last;
  for (let i = 0; i < 61; i++) last = await up(C, 'a.png', PNG, 'image/png', env, {});
  ok(last.status === 429 || last.status === 413, String(last.status));
});

describe('Чат: черга воркера (/api/bot/chat)');
await it('без ключа / з невірним → 401; cookie власника не відкриває', async () => {
  eq((await botCall('GET', '/api/bot/chat', undefined, env, null)).status, 401);
  eq((await botCall('GET', '/api/bot/chat', undefined, env, 'nope-nope')).status, 401);
  eq((await call(env, 'GET', '/api/bot/chat', { cookie: ck.OWNER })).status, 401);
  eq((await botCall('POST', '/api/bot/chat/ping', {}, env, null)).status, 401);
});
let Q, item;
await it('ping → online у відвідувача; черга: розмова з pending, історія, файли; блокування — другий запит її не бачить', async () => {
  const p = await botCall('POST', '/api/bot/chat/ping', {});
  eq(p.status, 200); ok(p.data.queue >= 1);
  eq((await poll(A)).data.online, true);
  Q = await start(env, { lang: 'ar', page: '/ar/' });
  await send(Q, { text: 'مرحبا' });
  const f = (await up(Q, 'flat.pdf', PDF)).data.file_id;
  const m2 = await send(Q, { text: '60 م²', files: [f] });
  const r = await botCall('GET', '/api/bot/chat?limit=10');
  eq(r.status, 200);
  item = r.data.items.find(x => x.sid === Q.sid);
  ok(item, 'розмова в черзі'); eq(item.lang, 'ar'); eq(item.page, '/ar/'); eq(item.state, 'bot'); eq(item.last_user_id, m2.data.id);
  eq(item.pending.length, 2); eq(item.pending[1].files[0].name, 'flat.pdf'); eq(item.pending[1].files[0].kind, 'pdf'); eq(item.history, []);
  ok(!JSON.stringify(item).includes(Q.token), 'токен воркеру не віддаємо');
  const again = await botCall('GET', '/api/bot/chat?limit=10');
  ok(!again.data.items.some(x => x.sid === Q.sid), 'заблоковано для другого воркера');
  eq((await poll(Q)).data.typing, true, 'поки воркер працює — «друкує…»');
});
await it('блокування минуло → розмова знову в черзі', async () => {
  await DB.prepare('UPDATE chat_sessions SET lock_until = ? WHERE sid = ?').bind(Math.floor(Date.now() / 1000) - 1, Q.sid).run();
  const r = await botCall('GET', '/api/bot/chat?limit=10');
  ok(r.data.items.some(x => x.sid === Q.sid));
});
await it('файл для воркера: /api/bot/chat/file?id= з ключем; без ключа — 401', async () => {
  const fid = item.pending[1].files[0].id;
  const r = await botCall('GET', '/api/bot/chat/file?id=' + fid);
  eq(r.status, 200); ok(r.text.startsWith('%PDF'));
  eq((await botCall('GET', '/api/bot/chat/file?id=' + fid, undefined, env, null)).status, 401);
  eq((await botCall('GET', '/api/bot/chat/file?id=bad')).status, 404);
});
await it('застарілий reply_to → 409 {conflict, last_user_id}; актуальний — відповідь з estimate й аудіо у відвідувача', async () => {
  const stale = await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: item.pending[0].id, text: 'x' });
  eq(stale.status, 409); eq(stale.data.conflict, true); eq(stale.data.last_user_id, item.last_user_id);
  ok((await botCall('GET', '/api/bot/chat?limit=10')).data.items.some(x => x.sid === Q.sid), '409 conflict знімає блокування — розмова знову в черзі');
  const est = { currency: 'USD', region: 'ua', lines: [{ label: 'Ремонт під ключ (роботи + чорнові матеріали)', qty: 60, unit: 'м²', rate: 550, from: 33000 },
    { label: 'Дизайн-проєкт інтерʼєру', qty: 60, unit: 'м²', rate: 30, from: 2500, note: 'мінімум $2 500' }], total_from: 35500, note: 'Розрахунок попередній' };
  const audio = { mime: 'audio/ogg', data: Buffer.from(OGG).toString('base64'), dur: 4.2 };
  const r = await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: item.last_user_id, text: 'Орієнтовно від $35 500.', estimate: est, audio });
  eq(r.status, 200, JSON.stringify(r.data)); eq(r.data.state, 'bot');
  const p = await poll(Q);
  const m = p.data.messages.find(x => x.role === 'bot');
  eq(m.text, 'Орієнтовно від $35 500.'); eq(m.estimate.total_from, 35500); eq(m.estimate.lines.length, 2); eq(m.estimate.lines[1].note, 'мінімум $2 500');
  eq(m.audio.mime, 'audio/ogg'); eq(m.audio.dur, 4.2);
  const a = await call(env, 'GET', '/api/chat/file/' + m.audio.id, { headers: Q.h });
  eq(a.status, 200); eq(a.headers.get('content-type'), 'audio/ogg');
  eq(p.data.typing, false);
  const again = await botCall('GET', '/api/bot/chat?limit=10');
  ok(!again.data.items.some(x => x.sid === Q.sid), 'відповіли — не в черзі');
});
await it('наступне повідомлення → знову в черзі; history містить попередні з відповіддю', async () => {
  await send(Q, { text: 'А меблювання?' });
  const r = await botCall('GET', '/api/bot/chat?limit=10');
  const it2 = r.data.items.find(x => x.sid === Q.sid);
  eq(it2.pending.length, 1); ok(it2.history.some(x => x.role === 'bot' && x.estimate));
});
await it('typing і release; порожня відповідь — 422; невалідний estimate / audio — 400', async () => {
  const it3 = (await q1('SELECT last_user_id FROM chat_sessions WHERE sid = ?', Q.sid)).last_user_id;
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, typing: true })).data.typing, true);
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, release: true })).data.released, true);
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: it3 })).status, 422);
  for (const estimate of [{ lines: [] }, { lines: [{ qty: 1 }] }, { lines: [{ label: 'x', rate: -5 }] }, { lines: [{ label: 'x', rate: 'abc' }] }, { currency: 'BTC', lines: [{ label: 'x' }] }, [1]])
    eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: it3, text: 'x', estimate })).status, 400, JSON.stringify(estimate));
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: it3, text: 'x', audio: { mime: 'text/html', data: 'PGI+' } })).status, 400);
  eq((await botCall('POST', '/api/bot/chat', { sid: 'z', reply_to: it3, text: 'x' })).status, 400);
  eq((await botCall('POST', '/api/bot/chat', { sid: 'a'.repeat(32), reply_to: it3, text: 'x' })).status, 404);
});
await it('handoff → стан waiting і сповіщення власнику й менеджерам у Telegram з посиланням на розмову', async () => {
  bot.reset();
  const last = (await q1('SELECT last_user_id, id FROM chat_sessions WHERE sid = ?', Q.sid));
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: last.last_user_id, text: 'x', handoff: true, handoff_reason: 'vip' })).status, 400, 'невідома причина');
  const r = await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: last.last_user_id, text: 'Передаю менеджеру', handoff: true, handoff_reason: 'big_project', reason: 'Будинок 300 м² <b>' });
  eq(r.status, 200); eq(r.data.state, 'waiting'); eq(r.data.notified, 2);
  const msgs = bot.calls.filter(c => c.method === 'sendMessage');
  eq(msgs.length, 2); ok(/потрібна людина/.test(msgs[0].text)); ok(msgs[0].text.includes('&lt;b&gt;'), 'текст у Telegram екранується');
  ok(/Великий обʼєкт/.test(msgs[0].text)); eq((await q1('SELECT handoff_reason FROM chat_sessions WHERE sid = ?', Q.sid)).handoff_reason, 'big_project');
  ok(msgs[0].reply_markup.inline_keyboard[0][0].url.endsWith(`/kabinet/admin?cs=${last.id}#chat`)); eq(msgs[0].reply_markup.inline_keyboard[0][0].text, '💬 Відкрити розмову');
  eq((await poll(Q)).data.state, 'waiting');
  // повторний handoff не дублює сповіщення
  await send(Q, { text: 'Ще питання' });
  bot.reset();
  const l2 = (await q1('SELECT last_user_id FROM chat_sessions WHERE sid = ?', Q.sid)).last_user_id;
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: l2, text: 'Менеджер скоро буде', handoff: true })).data.notified, 0);
  eq(bot.calls.length, 0);
  // renotify: клієнт обрав час дзвінка — нове для людини, сповіщаємо вдруге (лише з reason; без reason — ні)
  await send(Q, { text: '2' });
  const l3 = (await q1('SELECT last_user_id FROM chat_sessions WHERE sid = ?', Q.sid)).last_user_id;
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: l3, text: 'Записав', handoff: true, handoff_reason: 'asks_human', renotify: true })).data.notified, 0, 'без reason');
  await send(Q, { text: 'Вт о 10' });
  const l4 = (await q1('SELECT last_user_id FROM chat_sessions WHERE sid = ?', Q.sid)).last_user_id;
  const rn = await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: l4, text: 'Записав: Вт 24.11, 10:00', handoff: true, handoff_reason: 'asks_human', reason: 'Клієнт просить дзвінок Вт 24.11, 10:00 (Київ)', renotify: true });
  eq([rn.status, rn.data.state, rn.data.notified], [200, 'waiting', 2]);
  const m2 = bot.calls.filter(c => c.method === 'sendMessage');
  ok(/Клієнт просить людину або дзвінок — Клієнт просить дзвінок Вт 24\.11, 10:00/.test(m2[0].text), m2[0].text);
  eq((await q1('SELECT handoff_reason FROM chat_sessions WHERE sid = ?', Q.sid)).handoff_reason, 'asks_human');
});
await it('воркер мовчить > 3 хв → online: false у start і poll', async () => {
  await DB.prepare("UPDATE settings SET value = ? WHERE key = 'chat_bot_ping'").bind(String(Math.floor(Date.now() / 1000) - 400)).run();
  eq((await poll(Q)).data.online, false);
  eq((await start()).online, false);
  await botCall('POST', '/api/bot/chat/ping', {});
  eq((await poll(Q)).data.online, true);
});

describe('Чат: «нова розмова» адмінам у Telegram');
await it('перше повідомлення: 10:00–20:00 Київ — одразу, поза вікном — черга; одне повідомлення на розмову', async () => {
  const { runChatNotices, workHours } = await import('../../functions/_chat.js');
  bot.reset();
  const C = await start(env, { lang: 'de', page: '/de/' });
  await send(C, { text: 'Hallo <script>alert(1)</script> ' + 'x'.repeat(300) });
  const row = () => q1('SELECT * FROM chat_sessions WHERE sid = ?', C.sid);
  const sent = () => bot.calls.filter(c => c.method === 'sendMessage' && /Нова розмова/.test(c.text));
  if (workHours(new Date())) { ok((await row()).notified_at, 'у робочий час — одразу'); eq(sent().length, 2); }
  else { eq((await row()).notified_at, null, 'поза вікном — у черзі'); eq(sent().length, 0); }
  await DB.prepare('UPDATE chat_sessions SET notified_at = NULL WHERE sid = ?').bind(C.sid).run();
  bot.reset();
  eq((await runChatNotices(env, new Date('2026-11-23T21:00:00Z'))).quiet, true, '23:00 Київ — тиша');
  eq(sent().length, 0);
  const r = await runChatNotices(env, new Date('2026-11-23T10:00:00Z'));
  ok(r.sent >= 1, JSON.stringify(r));
  const cid = (await row()).id;
  const m = sent().find(c => c.text.includes('#' + cid));
  ok(m, 'повідомлення про цю розмову'); ok(m.text.includes('&lt;script&gt;') && !m.text.includes('<script>'), 'екранується'); ok(/DE · \/de\//.test(m.text));
  ok(m.text.length < 600, 'лише перші ~200 знаків'); ok(m.reply_markup.inline_keyboard[0][0].url.includes('/kabinet/admin?cs='));
  bot.reset();
  await send(C, { text: 'Ще' });
  eq((await runChatNotices(env, new Date('2026-11-23T10:05:00Z'))).sent, 0, 'друге повідомлення — без нового сповіщення');
  eq(sent().length, 0);
});

describe('Чат: номер відвідувача → заявка CRM');
let LEAD;
await it('contact: заявка source=chat, form=chat, ref_path, ref_host; сповіщення адмінам; системне «Дякуємо» мовою розмови', async () => {
  bot.reset();
  eq((await call(env, 'POST', '/api/chat/contact', { body: { phone: '12' }, headers: A.h })).status, 422);
  const r = await call(env, 'POST', '/api/chat/contact', { body: { name: 'Олена <b>', phone: '067 000 00 01' }, headers: A.h });
  eq(r.status, 200); ok(/^LD-\d{4}-\d{4}$/.test(r.data.number));
  const o = await q1('SELECT * FROM orders WHERE number = ?', r.data.number);
  LEAD = o;
  eq(o.kind, 'lead'); eq(o.source, 'chat'); eq(o.form, 'chat'); eq(o.phone, '+380670000001'); eq(o.ref_path, '/en/interior-design'); eq(o.ref_host, 'google.com'); eq(o.lang, 'en');
  ok(/Скільки коштує ремонт 60 м²/.test(o.comment) && /kabinet\/admin\?cs=/.test(o.comment));
  eq((await q1('SELECT order_id FROM chat_sessions WHERE sid = ?', A.sid)).order_id, o.id);
  ok(bot.calls.filter(c => c.method === 'sendMessage').length === 2, 'notifyNew обом адмінам');
  const p = await poll(A);
  eq(p.data.lead.number, r.data.number); ok(p.data.messages.some(m => m.role === 'system' && /Thank you/.test(m.text)));
  // повторно — та сама заявка
  eq((await call(env, 'POST', '/api/chat/contact', { body: { phone: '+380670000001' }, headers: A.h })).data.number, r.data.number);
  // у CRM — фільтр «Чат на сайті»
  const crm = await call(env, 'GET', '/api/admin/crm?place=chat', { cookie: ck.MGR });
  ok(crm.data.rows.some(x => x.number === r.data.number) && crm.data.rows.every(x => x.source === 'chat'));
});

describe('Чат: адмінка (/api/admin/chat)');
let QID;
await it('права: власник і менеджер — так; дизайнер, клієнт, гість — ні', async () => {
  eq((await call(env, 'GET', '/api/admin/chat', { cookie: ck.OWNER })).status, 200);
  eq((await call(env, 'GET', '/api/admin/chat', { cookie: ck.MGR })).status, 200);
  eq((await call(env, 'GET', '/api/admin/chat', { cookie: ck.DES })).status, 403);
  eq((await call(env, 'GET', '/api/admin/chat', { cookie: ck.CL })).status, 403);
  eq((await call(env, 'GET', '/api/admin/chat')).status, 401);
  eq((await call(env, 'POST', '/api/admin/chat', { cookie: ck.DES, body: { id: 1, text: 'x' } })).status, 403);
});
await it('список: стан, мова, останнє повідомлення, заявка; без sid, токена й хешу IP; фільтри й пошук', async () => {
  const r = await call(env, 'GET', '/api/admin/chat', { cookie: ck.MGR });
  const row = r.data.rows.find(x => x.lead && x.lead.number === LEAD.number);
  ok(row); eq(row.lang, 'en');
  const s = JSON.stringify(r.data);
  ok(!s.includes(A.sid) && !s.includes(A.token) && !/token_hash|ip_hash|"sid"/.test(s));
  QID = (await q1('SELECT id FROM chat_sessions WHERE sid = ?', Q.sid)).id;
  const w = await call(env, 'GET', '/api/admin/chat?state=waiting', { cookie: ck.MGR });
  ok(w.data.rows.length >= 1 && w.data.rows.every(x => x.state === 'waiting')); ok(w.data.counts.waiting >= 1);
  const f = await call(env, 'GET', '/api/admin/chat?q=' + encodeURIComponent('меблювання'), { cookie: ck.MGR });
  eq(f.data.rows.map(x => x.id), [QID]);
  const f2 = await call(env, 'GET', '/api/admin/chat?q=flat.pdf', { cookie: ck.MGR });
  eq(f2.data.rows.map(x => x.id), [QID]);
  ok((await call(env, 'GET', '/api/admin/chat?state=unread', { cookie: ck.MGR })).data.rows.some(x => x.id === QID));
});
await it('картка: повідомлення з файлами й розрахунком; позначає переглянутою; файл — лише з правом', async () => {
  const r = await call(env, 'GET', '/api/admin/chat?id=' + QID, { cookie: ck.MGR });
  eq(r.status, 200); ok(r.data.messages.some(m => m.estimate)); ok(r.data.messages.some(m => m.files.length)); eq(r.data.can_reply, true);
  ok(!(await call(env, 'GET', '/api/admin/chat?state=unread', { cookie: ck.MGR })).data.rows.some(x => x.id === QID));
  const fid = r.data.messages.find(m => m.files.length).files[0].id;
  const f = await call(env, 'GET', '/api/admin/chat?file=' + fid, { cookie: ck.MGR });
  eq(f.status, 200); ok(/^attachment/.test(f.headers.get('content-disposition')));
  eq((await call(env, 'GET', '/api/admin/chat?file=' + fid, { cookie: ck.DES })).status, 403);
  eq((await call(env, 'GET', '/api/admin/chat?id=999999', { cookie: ck.MGR })).status, 404);
});
await it('відповідь людини → staff у відвідувача з імʼям; бот більше не отримує розмову й не може відповісти (409)', async () => {
  const r = await call(env, 'POST', '/api/admin/chat', { cookie: ck.MGR, body: { id: QID, text: 'Добрий день, це менеджер <i>Олег</i>' } });
  eq(r.status, 200); eq(r.data.state, 'staff');
  const p = await poll(Q);
  const m = p.data.messages.find(x => x.role === 'staff');
  eq(m.text, 'Добрий день, це менеджер <i>Олег</i>'); eq(m.author, 'Менеджер'); eq(p.data.state, 'staff');
  await send(Q, { text: 'Дякую!' });
  ok(!(await botCall('GET', '/api/bot/chat?limit=10')).data.items.some(x => x.sid === Q.sid), 'staff — не в черзі бота');
  const l = (await q1('SELECT last_user_id FROM chat_sessions WHERE sid = ?', Q.sid)).last_user_id;
  const b = await botCall('POST', '/api/bot/chat', { sid: Q.sid, reply_to: l, text: 'бот' });
  eq(b.status, 409); eq(b.data.state, 'staff');
  eq((await botCall('POST', '/api/bot/chat', { sid: Q.sid, typing: true })).status, 409);
});
await it('«Повернути боту» → bot; нове повідомлення відвідувача знову в черзі; закрита розмова відкривається новим повідомленням', async () => {
  eq((await call(env, 'PATCH', '/api/admin/chat', { cookie: ck.MGR, body: { id: QID, state: 'robot' } })).status, 400);
  eq((await call(env, 'PATCH', '/api/admin/chat', { cookie: ck.MGR, body: { id: QID, state: 'bot' } })).data.state, 'bot');
  ok(!(await botCall('GET', '/api/bot/chat?limit=10')).data.items.some(x => x.sid === Q.sid), 'старе вже з відповіддю людини');
  await send(Q, { text: 'Ще одне питання' });
  ok((await botCall('GET', '/api/bot/chat?limit=10')).data.items.some(x => x.sid === Q.sid));
  await call(env, 'PATCH', '/api/admin/chat', { cookie: ck.MGR, body: { id: QID, state: 'closed' } });
  eq((await send(Q, { text: 'Ви тут?' })).data.state, 'bot');
});
await it('«Створити заявку» з розмови без номера; повторно — та сама', async () => {
  const r = await call(env, 'POST', '/api/admin/chat', { cookie: ck.OWNER, body: { id: QID, action: 'lead' } });
  eq(r.status, 200); ok(r.data.number); eq(r.data.existing, false);
  eq((await call(env, 'POST', '/api/admin/chat', { cookie: ck.OWNER, body: { id: QID, action: 'lead' } })).data.number, r.data.number);
  eq((await call(env, 'POST', '/api/admin/chat', { cookie: ck.OWNER, body: { id: QID, action: 'lead', phone: 'abc' } })).status, 400);
  const o = await q1('SELECT source, phone FROM orders WHERE number = ?', r.data.number);
  eq(o.source, 'chat'); eq(o.phone, null);
});

describe('Чат: терміни зберігання, D1 ≤ 100 параметрів, база без міграції');
await it('очищення: розмови без заявки > 30 діб і файли > 14 діб видаляються (і з R2); з заявкою — лишаються', async () => {
  const old = await start();
  await send(old, { text: 'старе' });
  const f = (await up(old, 'old.png', PNG, 'image/png')).data.file_id;
  await send(old, { files: [f] });
  const key = (await q1('SELECT r2_key FROM chat_files WHERE id = ?', f)).r2_key;
  ok(R2.m.has(key));
  await DB.prepare("UPDATE chat_sessions SET last_at = datetime('now', '-31 days') WHERE sid = ?").bind(old.sid).run();
  const kept = await start();
  await send(kept, { text: 'свіже' });
  const kf = (await up(kept, 'k.png', PNG, 'image/png')).data.file_id;
  await send(kept, { files: [kf] });
  await DB.prepare("UPDATE chat_files SET created_at = datetime('now', '-15 days') WHERE id = ?").bind(kf).run();
  // розмова з заявкою: файли й розмова лишаються навіть старі
  await DB.prepare("UPDATE chat_sessions SET last_at = datetime('now', '-40 days') WHERE sid = ?").bind(A.sid).run();
  await DB.prepare("UPDATE chat_files SET created_at = datetime('now', '-40 days') WHERE session_id = (SELECT id FROM chat_sessions WHERE sid = ?)").bind(A.sid).run();
  const r = await call(env, 'POST', '/api/admin/lead-sla', { body: {}, headers: { 'x-lead-key': 'lead-key', noOrigin: true } });
  eq(r.status, 200); ok(r.data.chat.sessions >= 1 && r.data.chat.files >= 2, JSON.stringify(r.data.chat));
  eq(await q1('SELECT id FROM chat_sessions WHERE sid = ?', old.sid), null); ok(!R2.m.has(key));
  eq(await q1('SELECT id FROM chat_files WHERE id = ?', kf), null, 'файл без заявки > 14 діб');
  ok(await q1('SELECT id FROM chat_sessions WHERE sid = ?', kept.sid), 'свіжа розмова лишається');
  ok(await q1('SELECT id FROM chat_sessions WHERE sid = ?', A.sid), 'з заявкою — лишається');
  ok((await q1("SELECT COUNT(*) AS n FROM chat_files WHERE session_id = (SELECT id FROM chat_sessions WHERE sid = ?)", A.sid)).n > 0, 'файли розмови з заявкою — лишаються');
  eq((await poll(old)).status, 404);
});
await it('D1 ≤ 100 параметрів: 150 повідомлень з файлами в опитуванні й адмінці, очищення 150 розмов', async () => {
  const C = await start();
  const sidRow = await q1('SELECT id FROM chat_sessions WHERE sid = ?', C.sid);
  for (let i = 0; i < 150; i++) {
    const r = await DB.prepare("INSERT INTO chat_messages (session_id, role, text) VALUES (?, 'user', ?)").bind(sidRow.id, 'm' + i).run();
    await DB.prepare("INSERT INTO chat_files (id, session_id, message_id, name, mime, kind, size, data) VALUES (?, ?, ?, 'a.png', 'image/png', 'image', 1, x'00')")
      .bind((i + 1000).toString(16).padStart(24, 'b'), sidRow.id, r.meta.last_row_id).run();
  }
  await DB.prepare('UPDATE chat_sessions SET msgs = 150 WHERE id = ?').bind(sidRow.id).run();
  const p = await poll(C);
  eq(p.status, 200); eq(p.data.messages.length, 100); ok(p.data.messages.every(m => m.files.length === 1));
  eq((await call(env, 'GET', '/api/admin/chat?id=' + sidRow.id, { cookie: ck.MGR })).data.messages.length, 150);
  for (let i = 0; i < 150; i++) await DB.prepare("INSERT INTO chat_sessions (sid, token_hash, msgs, last_at) VALUES (?, 'x', 1, datetime('now', '-60 days'))").bind(i.toString(16).padStart(32, 'c')).run();
  await DB.prepare("UPDATE chat_sessions SET last_at = datetime('now', '-60 days') WHERE id = ?").bind(sidRow.id).run();
  const r = await call(env, 'POST', '/api/admin/lead-sla', { body: {}, headers: { 'x-lead-key': 'lead-key', noOrigin: true } });
  eq(r.status, 200); ok(r.data.chat.sessions >= 150, JSON.stringify(r.data.chat));
});
await it('база без міграції 0021: чат — чесний 503, решта API (заявки, бот пошуку, SLA) працює', async () => {
  const e = makeEnv(freshDB(19), { LEADBOT_KEY: KEY });
  const r = await call(e, 'POST', '/api/chat/start', { body: { lang: 'uk' }, headers: { ip: nextIp() } });
  eq(r.status, 503); ok(/0021/.test(r.data.error));
  eq((await call(e, 'GET', '/api/chat/poll', { headers: { 'x-chat-sid': 'a'.repeat(32), 'x-chat-token': 'b'.repeat(64) } })).status, 503);
  eq((await botCall('GET', '/api/bot/chat', undefined, e)).status, 503);
  eq((await botCall('POST', '/api/bot/chat/ping', {}, e)).status, 503);
  eq((await call(e, 'POST', '/api/leads', { body: { phone: '0670000009', name: 'Т' }, headers: { 'x-lead-key': 'lead-key' } })).status, 200);
  eq((await botCall('POST', '/api/bot/partners', { name: 'Бригада Т' }, e)).status, 200);
  const sla = await call(e, 'POST', '/api/admin/lead-sla', { body: {}, headers: { 'x-lead-key': 'lead-key', noOrigin: true } });
  eq(sla.status, 200); eq(sla.data.chat.skipped, 'no_migration');
  // без D1 зовсім
  eq((await call(makeEnv(null), 'POST', '/api/chat/start', { body: {}, headers: { ip: nextIp() } })).status, 503);
});

describe('Чат: ліміт читань без запису в D1');
await it('poll / file / status: потік з однієї адреси → 429 (у памʼяті ізоляту), інша адреса — працює; D1 rate_hits не росте', async () => {
  const c = await start();
  const before = (await q1('SELECT COUNT(*) AS n FROM rate_hits')).n;
  let last = 0;
  for (let i = 0; i < 95; i++) last = (await poll(c)).status;
  eq(last, 429, 'після 90 опитувань за хвилину');
  eq((await q1('SELECT COUNT(*) AS n FROM rate_hits')).n, before, 'опитування не пишуть у rate_hits');
  const other = await start();
  eq((await poll(other)).status, 200);
  // невірний токен теж рахується (перебір не дає безлімітних читань D1)
  const bad = { ...c.h, 'x-chat-token': '0'.repeat(64), ip: nextIp() };
  const codes = new Set();
  for (let i = 0; i < 92; i++) codes.add((await call(env, 'GET', '/api/chat/poll', { headers: bad })).status);
  ok(codes.has(404) && codes.has(429), [...codes].join(','));
  const ip = nextIp();
  let st = 0;
  for (let i = 0; i < 31; i++) st = (await call(env, 'GET', '/api/chat/status', { headers: { ip } })).status;
  eq(st, 429);
  const { hotLimited, hotReset } = await import(new URL('../../functions/_chat.js', import.meta.url));
  const fake = { headers: new Headers({ 'cf-connecting-ip': '10.99.0.1' }) };
  for (let i = 0; i < 120; i++) hotLimited(fake, 'file', 1000);
  ok(hotLimited(fake, 'file', 1000), '121-й файл за хвилину');
  ok(!hotLimited(fake, 'file', 1000 + 61000), 'нова хвилина — знову можна');
  hotReset();
});

describe('Чат: версії панелі в завантажувачі site-chrome.v1.js');
await it('блок /*chat:v*/ відповідає assets/chat.v1.{js,css} (інакше — python3 tools/chat/ver.py)', async () => {
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const { ROOT } = await import('./harness.mjs');
  const h = f => createHash('sha1').update(readFileSync(ROOT + '/assets/' + f)).digest('hex').slice(0, 8);
  const sc = readFileSync(ROOT + '/assets/site-chrome.v1.js', 'utf8');
  ok(sc.includes(`var CHV = {js: "${h('chat.v1.js')}", css: "${h('chat.v1.css')}"};`), 'застарілі версії панелі: python3 tools/chat/ver.py');
});

if (process.argv[1] && process.argv[1].endsWith('chat.mjs')) process.exit(report() ? 1 : 0);
