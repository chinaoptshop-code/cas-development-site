// Ліміт D1: не більше 100 параметрів на запит (20.11.2026). Запускається з run.mjs (спільний звіт); окремо: node tools/tests/d1limit.mjs.
// Списки id (обʼєкти, заявки, контакти) передаються одним параметром — JSON-масивом (IN_IDS / idsArg у functions/_lib.js).
// Стенд (harness.mjs) падає на > 100 параметрах так само, як D1, тож ці тести ловлять `IN (?,?,…)` зі списком на сотні id:
//   • 130 обʼєктів: панель «Обʼєкти», кабінет працівника «Сьогодні», кабінет клієнта;
//   • картка клієнта зі 150 заявками (події, журнал змін);
//   • довідник контактів на 130 записів (лічильники обʼєктів і заявок).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { D1_MAX_PARAMS, addClient, call, describe, eq, freshDB, it, login, makeEnv, ok, report } from './harness.mjs';

const env = makeEnv(freshDB(), { GITHUB_CONTENT_TOKEN: 'test-token-not-real' });
const DB = env.DB;
const run = (sql, ...a) => DB.db.prepare(sql).run(...a);

const OWNER = await addClient(env, { id: 111, name: 'Власник' });
const CL = await addClient(env, { id: 81001, name: 'Клієнт Багато', phone: '+380500008101' });
const ck = { OWNER: await login(env, OWNER), CL: await login(env, CL) };
await call(env, 'GET', '/api/me', { cookie: ck.OWNER });

const N = 130; // обʼєктів і контактів — більше за ліміт параметрів
const pids = [];
for (let i = 1; i <= N; i++) {
  const id = Number(run("INSERT INTO projects (client_id, title, service, status, stages) VALUES (?, ?, 'repair', 'active', '[]')", CL, `Обʼєкт ${i}`).lastInsertRowid);
  pids.push(id);
  run("INSERT INTO project_reports (project_id, date, title, photos) VALUES (?, '2026-11-20', ?, '[]')", id, `Звіт ${i}`);
  run('INSERT INTO project_tasks (project_id, title) VALUES (?, ?)', id, `Задача ${i}`);
  run("INSERT INTO project_payments (project_id, title, amount, status) VALUES (?, ?, 100, 'planned')", id, `Платіж ${i}`);
}
const LEADS = 150, oids = [];
for (let i = 1; i <= LEADS; i++) {
  const id = Number(run("INSERT INTO orders (number, client_id, name, phone, items, kind, status) VALUES (?, ?, 'Клієнт Багато', '+380500008101', '[]', 'lead', 'new')", `LD-T-${String(i).padStart(4, '0')}`, CL).lastInsertRowid);
  oids.push(id);
  run("INSERT INTO order_events (order_id, status, note) VALUES (?, 'new', ?)", id, `подія ${i}`);
}
run("INSERT INTO audit_log (actor, role, action, entity, entity_id) VALUES ('тест', 'owner', 'update', 'orders', ?)", String(oids[LEADS - 1]));
run("INSERT INTO audit_log (actor, role, action, entity, entity_id) VALUES ('тест', 'owner', 'update', 'projects', ?)", String(pids[N - 1]));
const cids = [];
for (let i = 1; i <= N; i++) {
  const id = Number(run("INSERT INTO partners (name, type, status) VALUES (?, 'contractor', 'new')", `Контакт ${i}`).lastInsertRowid);
  cids.push(id);
  run('INSERT INTO contact_links (contact_id, project_id) VALUES (?, ?)', id, pids[i - 1]);
}

describe('Ліміт D1 — 100 параметрів на запит');
await it('стенд відмовляє запиту з понад 100 параметрами — як D1', async () => {
  const many = Array.from({ length: D1_MAX_PARAMS + 1 }, (_, i) => i);
  let err = '';
  try { DB.prepare(`SELECT 1 WHERE 1 IN (${many.map(() => '?').join(',')})`).bind(...many); } catch (e) { err = String(e.message); }
  ok(/too many SQL variables/.test(err), 'очікували помилку «too many SQL variables», отримали: ' + err);
  eq((await DB.prepare(`SELECT COUNT(*) AS n FROM projects WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(pids)).first()).n, N, 'json_each бере весь список одним параметром');
});
await it(`панель «Обʼєкти»: ${N} обʼєктів — 200, звіти, задачі, платежі й контакти є і в останнього`, async () => {
  const r = await call(env, 'GET', '/api/admin/projects', { cookie: ck.OWNER });
  eq(r.status, 200, JSON.stringify(r.data).slice(0, 200));
  eq(r.data.projects.length, N);
  for (const id of [pids[0], pids[N - 1]]) { // перший і 130-й: дані є для всього списку, а не лише для перших 100
    const p = r.data.projects.find(x => x.id === id);
    ok(p, 'обʼєкт ' + id + ' у списку');
    eq(p.tasks_total, 1, 'задачі обʼєкта ' + id);
    eq(p.contacts.length, 1, 'контакти обʼєкта ' + id);
    for (const k of ['reports', 'payments', 'tasks']) ok(r.data[k].some(y => y.project_id === id), k + ' обʼєкта ' + id);
  }
});
await it('кабінет працівника «Сьогодні» і кабінет клієнта з цими обʼєктами — 200', async () => {
  const t = await call(env, 'GET', '/api/team/today', { cookie: ck.OWNER });
  eq(t.status, 200, JSON.stringify(t.data).slice(0, 200));
  ok(t.data.projects.length > 0, 'обʼєкти в «Сьогодні»');
  const a = await call(env, 'GET', '/api/account/projects', { cookie: ck.CL });
  eq(a.status, 200, JSON.stringify(a.data).slice(0, 200));
  ok(a.data.projects.length > 0, 'обʼєкти в кабінеті клієнта');
});
await it(`картка клієнта: ${LEADS} заявок — 200, події й журнал змін на місці`, async () => {
  const r = await call(env, 'GET', '/api/admin/clients?id=' + CL, { cookie: ck.OWNER });
  eq(r.status, 200, JSON.stringify(r.data).slice(0, 200));
  eq(r.data.orders.length, LEADS);
  eq(r.data.events.length, LEADS);
  ok(r.data.audit.some(a => a.entity === 'orders') && r.data.audit.some(a => a.entity === 'projects'), 'журнал змін: записи і про заявку, і про обʼєкт');
});
await it(`довідник контактів: ${N} записів — 200, лічильник обʼєктів є і в останнього`, async () => {
  const r = await call(env, 'GET', '/api/admin/partners', { cookie: ck.OWNER });
  eq(r.status, 200, JSON.stringify(r.data).slice(0, 200));
  eq(r.data.rows.length, N);
  eq(r.data.rows.find(x => x.id === cids[N - 1]).n_projects, 1);
  eq(r.data.rows.find(x => x.id === cids[0]).n_projects, 1);
});
await it('у functions/ немає списків `IN (?,?,…)`, зібраних зі змінного масиву (крім сталого CLOSED)', async () => {
  const bad = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) {
    readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (!/^\s*\/\//.test(l) && /\.map\(\(\)\s*=>\s*'\?'\)/.test(l) && !/CLOSED\.map/.test(l)) bad.push(`${p}:${i + 1}`); });
  } } };
  walk(new URL('../../functions', import.meta.url).pathname);
  eq(bad, [], 'використайте IN_IDS + idsArg(ids) з functions/_lib.js:');
});

if (import.meta.url === `file://${process.argv[1]}`) process.exit(report() ? 1 : 0);
