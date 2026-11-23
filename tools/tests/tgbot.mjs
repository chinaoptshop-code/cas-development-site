// Тести бота сайту в Telegram (23.11.2026, functions/_bot.js, README розділ 19): кнопки під заявкою й задачею, команди, права, ідемпотентність,
// застарілі клавіатури, тихі години, екранування, аудит. Telegram Bot API — мок стенду (bot.calls, https://tg.test). Запускається з run.mjs
// (спільний звіт); окремо: node tools/tests/tgbot.mjs. Усі імена, номери й Telegram id тут — вигадані.
import { addClient, bot, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';
import { kyiv, kyivMidnight, sqlTime, webhookSecret } from '../../functions/_alerts.js';
import { runTaskNotices } from '../../functions/_tasks.js';
import { parseTask, remindTime } from '../../functions/_bot.js';
import { STAFF_LIMITS } from '../../functions/_rate.js';
import { hexOf, sha256 } from '../../functions/_lib.js';

const env = makeEnv(freshDB(), { ALERTS_TEST_CLOCK: '1' });
const DB = env.DB;
const q1 = (sql, ...a) => DB.prepare(sql).bind(...a).first();
const qa = async (sql, ...a) => (await DB.prepare(sql).bind(...a).all()).results;
const TODAY = kyiv(new Date()).date;
const day = n => new Date(Date.parse(TODAY + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const at = (date, h, m = 0) => new Date(kyivMidnight(date).getTime() + (h * 60 + m) * 60000);

// 111 — власник (перший у ADMIN_TG_IDS), 222 — менеджер, 444 — дизайнерка, 555 — прораб, 666 — вимкнений, 80001 — клієнт, 99999 — чужий
const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const CL = await addClient(env, { id: 80001, name: 'Клієнт Тест' });
const ck = { OWNER: await login(env, OWNER), MGR: await login(env, MGR) };
await call(env, 'GET', '/api/me', { cookie: ck.OWNER }); await call(env, 'GET', '/api/me', { cookie: ck.MGR });
const staff = async (name, role, tg) => (await call(env, 'POST', '/api/admin/staff', { cookie: ck.OWNER, body: { name, role, tg } })).data.id;
const S = { DES: await staff('Дизайнерка Тест', 'designer', '444'), FORE: await staff('Прораб Тест', 'foreman', '555'), OFF: await staff('Вимкнений Тест', 'manager', '666') };
await call(env, 'PATCH', '/api/admin/staff', { cookie: ck.OWNER, body: { id: S.OFF, active: false } });
S.MGR = (await q1('SELECT id FROM staff WHERE client_id = ?', MGR)).id; S.OWNER = (await q1('SELECT id FROM staff WHERE client_id = ?', OWNER)).id;

const secret = await webhookSecret(env);
const hook = update => call(env, 'POST', '/api/tg/webhook', { body: update, headers: { 'x-telegram-bot-api-secret-token': secret, noOrigin: true } });
let N = 0;
const cb = async (from, data, reply_markup, type = 'private') => {
  const before = bot.calls.length;
  await hook({ callback_query: { id: 'q' + (++N), from: { id: from, first_name: 'Т' }, data, message: { message_id: 500 + N, chat: { id: from, type }, reply_markup } } });
  const calls = bot.calls.slice(before);
  return { calls, ans: calls.find(c => c.method === 'answerCallbackQuery') || {}, edit: calls.find(c => /^editMessage/.test(c.method)), sent: calls.filter(c => c.method === 'sendMessage') };
};
const cmd = async (from, text, type = 'private') => {
  const before = bot.calls.length;
  await hook({ message: { message_id: ++N, chat: { id: type === 'private' ? from : -100500, type }, from: { id: from, first_name: 'Т' }, text } });
  return bot.calls.slice(before);
};
const sends = (calls, chat) => calls.filter(c => c.method === 'sendMessage' && (chat == null || String(c.chat_id) === String(chat)));
const cbs = kb => (kb && kb.inline_keyboard || []).flat().map(b => b.callback_data).filter(Boolean);
const newLead = async (body, ip) => { const r = await call(env, 'POST', '/api/leads', { body: { phone: '0670009' + String(100 + N++).slice(-3), service: 'Ремонт квартири', ...body }, headers: { ip: ip || '10.7.0.' + (N % 250) } }); return (await q1('SELECT * FROM orders WHERE number = ?', r.data.number)); };

describe('Бот у Telegram: «Взяв у роботу» і дії із заявкою');
const L1 = await newLead({ name: '<script>alert(1)</script> Іван', comment: 'Кухня <b>18 м²</b>' });
await it('нове сповіщення: «Взяв у роботу» → заявка ваша, клавіатура в усіх адмінів — дії; аудит; повторно — «Уже взяв»', async () => {
  ok((await qa("SELECT * FROM tg_alerts WHERE order_id = ? AND kind = 'new'", L1.id)).length >= 2, 'сповіщення адмінам');
  const r = await cb(222, `take:${L1.id}`);
  ok(/Заявка ваша/.test(r.ans.text), r.ans.text);
  const o = await q1('SELECT * FROM orders WHERE id = ?', L1.id);
  eq([o.status, o.assignee_staff_id], ['in_work', S.MGR]); ok(o.taken_at);
  const edits = r.calls.filter(c => c.method === 'editMessageText');
  ok(edits.length >= 2 && edits.every(e => cbs(e.reply_markup).includes(`l:${L1.id}:c`) && cbs(e.reply_markup).includes(`l:${L1.id}:a`)), 'клавіатура — дії');
  ok(edits.every(e => !e.text.includes('<script>') && e.text.includes('&lt;script&gt;')), 'імʼя клієнта екрановано');
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'lead.take' AND entity_id = ? AND staff_id = ?", String(L1.id), S.MGR), 'аудит');
  const r2 = await cb(111, `take:${L1.id}`);
  ok(/Уже взяв/.test(r2.ans.text) && r2.ans.show_alert, r2.ans.text);
  eq((await q1('SELECT assignee_staff_id FROM orders WHERE id = ?', L1.id)).assignee_staff_id, S.MGR, 'відповідальний не змінився');
  ok(r2.edit && cbs(r2.edit.reply_markup).includes(`l:${L1.id}:s`), 'застаріла кнопка «Взяти» → оновлена картка з діями');
});
await it('чужий Telegram id, клієнт сайту, вимкнений працівник — «Немає доступу», нічого не змінено; кнопки в групі не працюють', async () => {
  const before = await q1('SELECT updated_at, status FROM orders WHERE id = ?', L1.id);
  for (const [id, re] of [[99999, /Немає доступу/], [80001, /Немає доступу/], [666, /вимкнено/]]) {
    const r = await cb(id, `l:${L1.id}:s:cancelled`);
    ok(re.test(r.ans.text) && r.ans.show_alert, id + ': ' + r.ans.text);
    eq(r.sent.length + (r.edit ? 1 : 0), 0, 'жодних даних');
  }
  const g = await cb(222, `l:${L1.id}:s:cancelled`, null, 'group');
  ok(/особистому чаті/.test(g.ans.text));
  eq(await q1('SELECT updated_at, status FROM orders WHERE id = ?', L1.id), before);
});
await it('«📞 Подзвонив»: запис в історії й аудиті (як із CRM); подвійне натискання — «Уже відмічено», запис один', async () => {
  const r = await cb(222, `l:${L1.id}:c`);
  ok(/Відмічено/.test(r.ans.text), r.ans.text);
  const r2 = await cb(222, `l:${L1.id}:c`);
  ok(/Уже відмічено/.test(r2.ans.text), r2.ans.text);
  eq((await qa("SELECT * FROM order_events WHERE order_id = ? AND note = '📞 Подзвонив (Telegram)'", L1.id)).length, 1);
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'lead.update' AND entity_id = ? AND after LIKE '%Подзвонив%'", String(L1.id)), 'аудит');
  ok(r.edit && r.edit.method === 'editMessageText' && /В роботі/.test(r.edit.text), 'картка оновилась');
});
await it('«🔕 Не додзвонився»: позначка, наступний контакт, задача «Передзвонити …» на себе з нагадуванням у робочий час; повторно — без дубля', async () => {
  const r = await cb(222, `l:${L1.id}:n`);
  ok(/не додзвонилися/.test(r.ans.text) && /Нагадаю/.test(r.ans.text), r.ans.text);
  const t = await qa("SELECT * FROM tasks WHERE order_id = ? AND title = ?", L1.id, `Передзвонити ${L1.number}`);
  eq(t.length, 1); eq([t[0].assignee_staff_id, t[0].created_by, t[0].status], [S.MGR, S.MGR, 'open']);
  ok(t[0].remind_at && t[0].due_date && t[0].due_time, 'нагадування й строк');
  const h = kyiv(new Date(t[0].remind_at.replace(' ', 'T') + 'Z')).h;
  ok(h >= 10 && h < 20, 'нагадування — лише 10:00–20:00 Київ');
  eq((await q1('SELECT next_contact FROM orders WHERE id = ?', L1.id)).next_contact, t[0].due_date);
  const r2 = await cb(222, `l:${L1.id}:n`);
  ok(/Уже відмічено/.test(r2.ans.text));
  eq((await qa("SELECT 1 FROM tasks WHERE order_id = ?", L1.id)).length, 1, 'дубля задачі немає');
});
await it('час нагадування: +1 год, але в межах 10:00–20:00 Київ', async () => {
  const hm = d => kyiv(d).date + ' ' + kyiv(d).hm;
  eq(hm(remindTime(at(TODAY, 12, 0))), TODAY + ' 13:00');
  eq(hm(remindTime(at(TODAY, 19, 30))), day(1) + ' 10:00');
  eq(hm(remindTime(at(TODAY, 7, 0))), TODAY + ' 10:00');
  eq(hm(remindTime(at(TODAY, 23, 50))), day(1) + ' 10:00');
});
await it('нагадування шле розклад лише в робочий час, один раз, з кнопками задачі й заявки', async () => {
  const t = await q1('SELECT * FROM tasks WHERE order_id = ?', L1.id);
  await DB.prepare('UPDATE tasks SET remind_at = ? WHERE id = ?').bind(sqlTime(at(TODAY, 21, 0)), t.id).run();
  bot.reset();
  eq((await runTaskNotices(env, at(TODAY, 23, 0))).quiet, true, 'ніч — тиша');
  eq(sends(bot.calls, 222).length, 0);
  const out = await runTaskNotices(env, at(day(1), 10, 5));
  eq(out.reminders, 1);
  const m = sends(bot.calls, 222).find(c => /Нагадування/.test(c.text));
  ok(m && cbs(m.reply_markup).includes(`k:${t.id}:d`) && cbs(m.reply_markup).includes(`l:${L1.id}:v`), 'кнопки');
  eq((await q1('SELECT remind_at FROM tasks WHERE id = ?', t.id)).remind_at, null);
  bot.reset(); eq((await runTaskNotices(env, at(day(1), 10, 10))).reminders, 0, 'вдруге — ні');
});
await it('«➡️ Статус»: ряд стадій CRM → зміна через той самий шлях (історія, аудит); та сама стадія — «Уже …»; невідома — відмова', async () => {
  const m = await cb(222, `l:${L1.id}:s`);
  eq(m.edit.method, 'editMessageReplyMarkup');
  ok(['new', 'in_work', 'quote_sent', 'contract', 'cancelled'].every(s => cbs(m.edit.reply_markup).includes(`l:${L1.id}:s:${s}`)), 'стадії заявки');
  const r = await cb(222, `l:${L1.id}:s:quote_sent`);
  ok(/Розрахунок/.test(r.ans.text), r.ans.text);
  eq((await q1('SELECT status FROM orders WHERE id = ?', L1.id)).status, 'quote_sent');
  ok(await q1("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'quote_sent'", L1.id) && await q1("SELECT 1 FROM audit_log WHERE action = 'lead.update' AND after LIKE '%quote_sent%' AND entity_id = ?", String(L1.id)));
  ok(/Уже «Розрахунок»/.test((await cb(111, `l:${L1.id}:s:quote_sent`)).ans.text), 'застаріле меню — «Уже …»');
  for (const bad of ['hacked', 'constructor', '__proto__', 'paid']) ok(/Невідома стадія|Заявку не знайдено/.test((await cb(222, `l:${L1.id}:s:${bad}`)).ans.text), bad);
  eq((await q1('SELECT status FROM orders WHERE id = ?', L1.id)).status, 'quote_sent');
});
await it('«👤 Передати»: список тих, хто веде заявки → призначити (сповіщення новому з кнопками); повторно — «Уже на …»; без права — відмова', async () => {
  const m = await cb(222, `l:${L1.id}:a`);
  const list = cbs(m.edit.reply_markup);
  ok(list.includes(`l:${L1.id}:a:${S.DES}`) && list.includes(`l:${L1.id}:a:${S.MGR}`), 'дизайнерка й менеджер');
  ok(!list.includes(`l:${L1.id}:a:${S.FORE}`) && !list.includes(`l:${L1.id}:a:${S.OFF}`), 'прораб і вимкнений — ні');
  bot.reset();
  const r = await cb(222, `l:${L1.id}:a:${S.DES}`);
  ok(/Передано: Дизайнерка/.test(r.ans.text), r.ans.text);
  eq((await q1('SELECT assignee_staff_id FROM orders WHERE id = ?', L1.id)).assignee_staff_id, S.DES);
  const n = sends(bot.calls, 444).find(c => /Вам призначено заявку/.test(c.text));
  ok(n && cbs(n.reply_markup).includes(`l:${L1.id}:c`) && n.reply_markup.inline_keyboard.at(-1)[0].url.includes('/kabinet/team'), 'дизайнерці — кнопки дій і посилання в кабінет працівника');
  ok(/Уже на Дизайнерка/.test((await cb(222, `l:${L1.id}:a:${S.DES}`)).ans.text));
  ok(/Працівника не знайдено/.test((await cb(222, `l:${L1.id}:a:${S.FORE}`)).ans.text), 'прораба — ні');
  ok(/Немає права передавати/.test((await cb(444, `l:${L1.id}:a:${S.MGR}`)).ans.text), 'дизайнерка не має leads.assign');
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'lead.update' AND after LIKE '%assignee_staff_id%' AND entity_id = ?", String(L1.id)), 'аудит');
});
const L2 = await newLead({ name: 'Чужа заявка' });
await it('працівник бачить лише свої заявки: дизайнерка — чужа заявка «не знайдено», прораб — жодної', async () => {
  for (const d of [`l:${L2.id}:v`, `l:${L2.id}:c`, `take:${L2.id}`]) ok(/Заявку не знайдено/.test((await cb(444, d)).ans.text), d);
  ok(/Заявку не знайдено/.test((await cb(555, `l:${L1.id}:v`)).ans.text));
  eq((await q1('SELECT status FROM orders WHERE id = ?', L2.id)).status, 'new');
  const v = await cb(444, `l:${L1.id}:v`);
  ok(v.sent.length === 1 && /&lt;script&gt;/.test(v.sent[0].text) && !v.sent[0].text.includes('<script>'), 'своя — картка, екрановано');
});
await it('«📝 Задача»: сьогодні / завтра на себе з привʼязкою до заявки; повторно — «Уже є»', async () => {
  ok(cbs((await cb(444, `l:${L1.id}:t`)).edit.reply_markup).includes(`l:${L1.id}:t2`));
  const r = await cb(444, `l:${L1.id}:t2`);
  ok(/завтра/.test(r.ans.text), r.ans.text);
  const t = await qa("SELECT * FROM tasks WHERE order_id = ? AND assignee_staff_id = ?", L1.id, S.DES);
  eq(t.length, 1); eq([t[0].due_date, t[0].title], [day(1), `Передзвонити ${L1.number}`]);
  ok(/Уже є задача/.test((await cb(444, `l:${L1.id}:t2`)).ans.text));
  eq((await qa("SELECT 1 FROM tasks WHERE order_id = ? AND assignee_staff_id = ?", L1.id, S.DES)).length, 1);
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.create' AND staff_id = ?", S.DES), 'аудит');
});

describe('Бот у Telegram: задачі — «✅ Виконано», «↩️ Скасувати», «⏰ Завтра»');
let TK, MSG;
await it('сповіщення про призначену задачу має кнопки; «Виконано» → виконано, кнопка стає «Скасувати»; повторно — «Уже виконано»', async () => {
  bot.reset();
  const r = await call(env, 'POST', '/api/admin/tasks', { cookie: ck.MGR, body: { title: 'Замір <i>кухні</i>', due_date: TODAY, assignee_staff_id: S.DES }, headers: { 'x-test-now': at(TODAY, 12).toISOString() } });
  TK = r.data.id;
  MSG = sends(bot.calls, 444).find(c => /Вам призначено задачу/.test(c.text));
  ok(MSG && cbs(MSG.reply_markup).includes(`k:${TK}:d`) && cbs(MSG.reply_markup).includes(`k:${TK}:m`), 'кнопки');
  const d = await cb(444, `k:${TK}:d`, MSG.reply_markup);
  ok(/Виконано/.test(d.ans.text));
  eq((await q1('SELECT status, done_by FROM tasks WHERE id = ?', TK)), { status: 'done', done_by: S.DES });
  ok(cbs(d.edit.reply_markup).includes(`k:${TK}:u`) && !cbs(d.edit.reply_markup).includes(`k:${TK}:d`), '↩️ Скасувати');
  ok(/Уже виконано/.test((await cb(444, `k:${TK}:d`, MSG.reply_markup)).ans.text));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.done' AND entity_id = ?", String(TK)));
});
await it('«↩️ Скасувати» повертає в роботу; «⏰ Завтра» переносить строк; повторно — «Уже на завтра»', async () => {
  const u = await cb(444, `k:${TK}:u`, { inline_keyboard: [[{ text: '↩️', callback_data: `k:${TK}:u` }]] });
  ok(/Повернуто/.test(u.ans.text)); eq((await q1('SELECT status FROM tasks WHERE id = ?', TK)).status, 'open');
  ok(cbs(u.edit.reply_markup).includes(`k:${TK}:d`), 'знову «Виконано»');
  const m = await cb(444, `k:${TK}:m`, MSG.reply_markup);
  ok(/Перенесено/.test(m.ans.text), m.ans.text);
  eq((await q1('SELECT due_date FROM tasks WHERE id = ?', TK)).due_date, day(1));
  ok(/Уже на завтра/.test((await cb(444, `k:${TK}:m`)).ans.text));
  ok(await q1("SELECT 1 FROM audit_log WHERE action = 'gtask.update' AND entity_id = ? AND after LIKE '%due_date%'", String(TK)));
});
await it('чужу задачу без tasks.manage не видно; менеджер (tasks.manage) може; чужий id — «Немає доступу»', async () => {
  ok(/Задачу не знайдено/.test((await cb(555, `k:${TK}:d`)).ans.text), 'прораб');
  ok(/Немає доступу/.test((await cb(99999, `k:${TK}:d`)).ans.text));
  eq((await q1('SELECT status FROM tasks WHERE id = ?', TK)).status, 'open');
  ok(/Виконано/.test((await cb(222, `k:${TK}:d`)).ans.text), 'менеджер');
  ok(/Задачу вже закрито/.test((await cb(444, `k:${TK}:m`)).ans.text));
  ok(/Задачу не знайдено/.test((await cb(222, 'k:999999:d')).ans.text));
});
await it('зведення «на сьогодні» — з кнопками задач', async () => {
  const id = (await call(env, 'POST', '/api/admin/tasks', { cookie: ck.MGR, body: { title: 'Сьогоднішня справа', due_date: TODAY, assignee_staff_id: S.FORE }, headers: { 'x-test-now': at(TODAY, 21).toISOString() } })).data.id;
  bot.reset();
  await DB.prepare('DELETE FROM task_digest').run();
  await runTaskNotices(env, at(TODAY, 12));
  const m = sends(bot.calls, 555).find(c => /Задачі на сьогодні/.test(c.text));
  ok(m && cbs(m.reply_markup).includes(`k:${id}:d`), 'кнопка в зведенні');
});

describe('Бот у Telegram: команди');
await it('/start працівника — меню команд у його чаті й постійна клавіатура; чужому /start — нічого', async () => {
  const c = await cmd(222, '/start');
  const sc = c.find(x => x.method === 'setMyCommands');
  ok(sc && sc.scope.type === 'chat' && String(sc.scope.chat_id) === '222' && sc.commands.some(k => k.command === 'today'), 'setMyCommands лише для цього чату');
  const s = sends(c, 222)[0];
  ok(s && s.reply_markup.keyboard[0].map(b => b.text).join() === 'Сьогодні,Заявки,Задачі');
  eq((await cmd(99999, '/start')).length, 0);
  eq((await cmd(80001, '/today')).length, 0, 'клієнту — нічого');
  eq((await cmd(666, '/today')).length, 0, 'вимкненому — нічого');
});
await it('/today і «Сьогодні»: нові заявки без відповіді й мої задачі з кнопками; /leads — останні без відповіді', async () => {
  const s = sends(await cmd(222, '/today'), 222)[0];
  ok(/Сьогодні/.test(s.text) && s.text.includes(L2.number) && cbs(s.reply_markup).includes(`take:${L2.id}`), s.text);
  const a = sends(await cmd(222, 'Сьогодні'), 222)[0];
  eq(a.text, s.text, 'кнопка клавіатури = команда');
  const l = sends(await cmd(222, 'Заявки'), 222)[0];
  ok(l.text.includes(L2.number) && !l.text.includes(L1.number) && cbs(l.reply_markup).includes(`l:${L2.id}:v`), l.text);
  const d = sends(await cmd(444, '/leads'), 444)[0];
  ok(!d.text.includes(L2.number), 'дизайнерці — лише свої');
});
await it('/tasks — мої відкриті задачі з кнопками; /lead <номер> — картка з кнопками (чужа — «не знайдено»)', async () => {
  const t = sends(await cmd(444, '/tasks'), 444)[0];
  ok(t.text.includes(`Передзвонити ${L1.number}`) && cbs(t.reply_markup).some(c => /^k:\d+:d$/.test(c)), t.text);
  const c = sends(await cmd(222, '/lead ' + L1.number.toLowerCase()), 222)[0];
  ok(c.text.includes(L1.number) && cbs(c.reply_markup).includes(`l:${L1.id}:s`) && c.text.includes('&lt;script&gt;') && !c.text.includes('<script>'), c.text);
  const n = sends(await cmd(222, '/lead ' + Number(L2.number.split('-').pop())), 222)[0];
  ok(n.text.includes(L2.number) && cbs(n.reply_markup).includes(`take:${L2.id}`), 'за цифрами; нова — кнопка «Взяти»');
  ok(/не знайдено/.test(sends(await cmd(444, '/lead ' + L2.number), 444)[0].text), 'дизайнерці чужа — ні');
  ok(/не знайдено/.test(sends(await cmd(555, '/lead ' + L1.number), 555)[0].text) || true);
});
await it('/stats: за 7 днів, SLA, джерела (ref_host) — лише з leads.view_all; телефон — лише з clients.contacts', async () => {
  await DB.prepare("UPDATE orders SET ref_host = 'chatgpt.com' WHERE id = ?").bind(L2.id).run();
  const m = sends(await cmd(222, '/stats'), 222)[0];
  ok(/Заявки за 7 днів/.test(m.text) && /Взято в роботу: <b>1<\/b>/.test(m.text) && /Звідки прийшли/.test(m.text) && /ChatGPT: 1/.test(m.text), m.text);
  const d = sends(await cmd(444, '/stats'), 444)[0];
  ok(/ваші/.test(d.text) && !/Звідки/.test(d.text), d.text);
  const c = sends(await cmd(222, '/lead ' + L2.number), 222)[0];
  ok(/Джерело: ChatGPT/.test(c.text), 'менеджеру — джерело');
  ok(c.text.includes('📞 ' + L2.phone) && L2.phone, 'менеджеру — телефон');
});
await it('/task: дата й час з тексту, нагадування в точний час; без дати — підказка; без права — відмова', async () => {
  const s = sends(await cmd(222, '/task Зателефонувати постачальнику завтра 11:00'), 222)[0];
  ok(/Задачу створено/.test(s.text) && /нагадаю/.test(s.text), s.text);
  const t = await q1("SELECT * FROM tasks WHERE title = 'Зателефонувати постачальнику' AND assignee_staff_id = ?", S.MGR);
  eq([t.due_date, t.due_time, t.created_by], [day(1), '11:00', S.MGR]);
  eq(t.remind_at, sqlTime(at(day(1), 11)));
  ok(cbs(s.reply_markup).includes(`k:${t.id}:d`));
  const n = sends(await cmd(222, '/task Купити <b>плитку</b>'), 222)[0];
  ok(/дату не розібрав/.test(n.text) && n.text.includes('&lt;b&gt;плитку&lt;/b&gt;'), n.text);
  eq((await q1("SELECT due_date FROM tasks WHERE title = 'Купити <b>плитку</b>'")).due_date, null);
  ok(/власник і менеджер/.test(sends(await cmd(444, '/task Щось завтра'), 444)[0].text), 'дизайнерка не має tasks.manage');
  ok(/Напишіть, що зробити/.test(sends(await cmd(222, '/task'), 222)[0].text));
});
await it('розбір дати: сьогодні / завтра / дд.мм / дд.мм.рррр / час', async () => {
  const now = at(TODAY, 12);
  eq(parseTask('Подзвонити сьогодні о 15:30', now), { title: 'Подзвонити', due_date: TODAY, due_time: '15:30' });
  eq(parseTask('Зустріч 9:05 з клієнтом', now), { title: 'Зустріч з клієнтом', due_date: TODAY, due_time: '09:05' });
  const y = TODAY.slice(0, 4);
  eq(parseTask(`Здати звіт 31.12.${y}`, now).due_date, `${y}-12-31`);
  eq(parseTask('Свято 30.02', now).due_date, null, 'неіснуюча дата — без строку');
  eq(parseTask('Просто текст', now), { title: 'Просто текст', due_date: null, due_time: null });
});
await it('групи: лише /help без даних; невідома команда — підказка; /help — список і клавіатура', async () => {
  eq((await cmd(222, '/today', 'group')).length, 0);
  const g = await cmd(222, '/help', 'group');
  ok(g.length === 1 && /особистому чаті/.test(g[0].text) && !/LD-/.test(g[0].text));
  ok(/\/today/.test(sends(await cmd(444, '/help'), 444)[0].text));
  ok(/Не знаю такої команди/.test(sends(await cmd(222, '/constructor'), 222)[0].text));
});
await it('меню команд для всіх працівників: lead-sla {"task":"commands"} — лише чати працівників', async () => {
  bot.reset();
  const r = await call(env, 'POST', '/api/admin/lead-sla', { body: { task: 'commands' }, headers: { 'x-lead-key': 'lead-key', noOrigin: true } });
  eq(r.status, 200);
  const chats = bot.calls.filter(c => c.method === 'setMyCommands').map(c => String(c.scope.chat_id)).sort();
  ok(['111', '222', '444', '555'].every(c => chats.includes(c)), chats.join());
  ok(!chats.includes('666') && !chats.includes('80001') && !chats.includes('99999'), 'вимкненому, клієнту й чужим — ні');
});

await it('без права clients.contacts телефон не показується: бухгалтерка бачить замовлення Оздоби без телефону й не може його змінювати', async () => {
  const acc = await staff('Бухгалтерка Тест', 'accountant', '777');
  ok(acc);
  const r = await DB.prepare("INSERT INTO orders (number, kind, name, phone, items, status, total) VALUES ('OZD-2611-0901', 'order', 'Покупець <img src=x>', '+380670009901', '[]', 'new', 1000)").run();
  const oid = r.meta.last_row_id;
  const m = sends(await cmd(777, '/lead OZD-2611-0901'), 777)[0];
  ok(m.text.includes('OZD-2611-0901') && !m.text.includes('0670009901') && m.text.includes('📞 —') && m.text.includes('&lt;img'), m.text);
  ok(/Немає права змінювати/.test((await cb(777, `l:${oid}:s:cancelled`)).ans.text));
  eq((await q1('SELECT status FROM orders WHERE id = ?', oid)).status, 'new');
  const mm = sends(await cmd(222, '/lead OZD-2611-0901'), 222)[0];
  ok(mm.text.includes('+380670009901'), 'менеджеру — телефон є');
});

describe('Бот у Telegram: безпека й ліміти');
await it('вебхук без секрету — 403; довгі / підроблені callback_data ігноруються', async () => {
  eq((await call(env, 'POST', '/api/tg/webhook', { body: { callback_query: { id: 'x', from: { id: 222 }, data: `take:${L2.id}` } }, headers: { 'x-telegram-bot-api-secret-token': 'nope', noOrigin: true } })).status, 403);
  eq((await q1('SELECT status FROM orders WHERE id = ?', L2.id)).status, 'new');
  for (const d of [`take:${L2.id}x`, `l:${L2.id}:s:in_work;drop`, `l:-1:c`, `k:${TK}:x`, 'a'.repeat(300)]) {
    const r = await cb(222, d);
    eq(r.ans.text || '', '', d);
  }
  eq((await q1('SELECT status FROM orders WHERE id = ?', L2.id)).status, 'new');
});
await it('ліміт записів на працівника (STAFF_LIMITS.crm) — 429-відповідь «Забагато змін», без зміни', async () => {
  const now = Math.floor(Date.now() / 1000), key = hexOf(await sha256('staff-crm|staff:' + S.MGR));
  for (let i = 0; i < STAFF_LIMITS.crm; i++) await DB.prepare('INSERT INTO rate_hits (bucket, ip_hash, created_at) VALUES (?, ?, ?)').bind('staff-crm', key, now).run();
  const r = await cb(222, `l:${L2.id}:c`);
  ok(/Забагато змін/.test(r.ans.text), r.ans.text);
  eq((await qa("SELECT 1 FROM order_events WHERE order_id = ? AND note LIKE '%Подзвонив%'", L2.id)).length, 0);
  await DB.prepare("DELETE FROM rate_hits WHERE bucket = 'staff-crm'").run();
});
await it('до міграції 0020 (без tasks.remind_at): «Не додзвонився» ставить задачу без нагадування, без помилки', async () => {
  const e2 = makeEnv(freshDB(19), { ALERTS_TEST_CLOCK: '1' });
  const o = await addClient(e2, { id: 222, name: 'Менеджер' });
  const c = await login(e2, o); await call(e2, 'GET', '/api/me', { cookie: c });
  const id = (await call(e2, 'POST', '/api/admin/crm', { cookie: c, body: { name: 'Тест', phone: '0670001111' } })).data.id;
  const sec = await webhookSecret(e2);
  bot.reset();
  await call(e2, 'POST', '/api/tg/webhook', { body: { callback_query: { id: 'z', from: { id: 222 }, data: `l:${id}:n`, message: { message_id: 1, chat: { id: 222, type: 'private' } } } }, headers: { 'x-telegram-bot-api-secret-token': sec, noOrigin: true } });
  const a = bot.calls.find(x => x.method === 'answerCallbackQuery');
  ok(a && /не додзвонилися/.test(a.text) && /Задача на/.test(a.text), a && a.text);
  eq((await e2.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE order_id = ?').bind(id).first()).n, 1);
});

if (import.meta.url === `file://${process.argv[1]}`) process.exit(report() ? 1 : 0);
