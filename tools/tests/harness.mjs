// Тестовий стенд для Cloudflare Pages Functions без wrangler: D1 → node:sqlite (у памʼяті), застосовуються migrations/*.sql,
// запит проходить ланцюжок middleware (functions/api/_middleware.js → …/_middleware.js) і обробник, як на Pages.
// Telegram Bot API і fetch каталогу — мок (bot.calls). Запуск усіх тестів: node tools/tests/run.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FN = join(ROOT, 'functions');

// ===== D1 на node:sqlite =====
const norm = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a.map(norm)); }
  _s() { return this.db.prepare(this.sql); }
  async first(col) { const r = this._s().get(...this.args); const o = r ? { ...r } : null; return col && o ? o[col] : o; }
  async all() { return { results: this._s().all(...this.args).map(r => ({ ...r })), success: true }; }
  async run() { const r = this._s().run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
export class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(list) { const out = []; this.db.exec('BEGIN'); try { for (const s of list) out.push(await s.run()); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; } return out; }
  async exec(sql) { this.db.exec(sql); }
}

export function migrations(upTo = Infinity) {
  return readdirSync(join(ROOT, 'migrations')).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort().filter(f => parseInt(f, 10) <= upTo);
}
export function freshDB(upTo) {
  const d = new D1();
  for (const f of migrations(upTo)) d.db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
  return d;
}

// ===== мок fetch: Telegram Bot API, каталог Оздоби, n8n =====
export const bot = { calls: [], reset() { this.calls = []; } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://tg.test/')) {
    const method = url.split('/').pop(), body = JSON.parse(init.body || '{}');
    bot.calls.push({ method, ...body });
    const result = method === 'sendMessage' ? { message_id: bot.calls.length } : method === 'getWebhookInfo' ? { url: '' } : true;
    return new Response(JSON.stringify({ ok: true, result }), { headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/assets/ozdoba/catalog.json')) return new Response(readFileSync(join(ROOT, 'assets/ozdoba/catalog.json')));
  if (url.includes('n8n') || url.includes('webhook')) return new Response('{}');
  if (realFetch && !/^https?:\/\/(cas-develop\.com|tg\.test)/.test(url)) throw new Error('мережа в тестах заборонена: ' + url);
  throw new Error('немає мока для ' + url);
};

export function makeEnv(db, extra = {}) {
  return {
    DB: db, SESSION_SECRET: 'test-secret', TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_API_BASE: 'https://tg.test',
    ADMIN_TG_IDS: '111,222', LEAD_INGEST_KEY: 'lead-key',
    ASSETS: { fetch: async () => new Response('<!doctype html><title>403</title><h1>Немає доступу</h1>', { status: 200 }) },
    ...extra,
  };
}

// ===== маршрутизація як у Pages Functions =====
const mods = new Map();
async function load(file) {
  if (!mods.has(file)) mods.set(file, await import(pathToFileURL(file).href));
  return mods.get(file);
}
function route(path) {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  let dir = FN;
  const mw = [], params = {};
  for (let i = 0; i < parts.length; i++) {
    if (existsSync(join(dir, '_middleware.js'))) mw.push(join(dir, '_middleware.js'));
    const last = i === parts.length - 1;
    if (last) {
      if (existsSync(join(dir, parts[i] + '.js'))) return { mw, file: join(dir, parts[i] + '.js'), params };
      if (existsSync(join(dir, parts[i], 'index.js'))) return { mw: [...mw, ...(existsSync(join(dir, parts[i], '_middleware.js')) ? [join(dir, parts[i], '_middleware.js')] : [])], file: join(dir, parts[i], 'index.js'), params };
      const dyn = readdirSync(dir).find(f => /^\[\w+\]\.js$/.test(f));
      if (dyn) { params[dyn.slice(1, -4)] = parts[i]; return { mw, file: join(dir, dyn), params }; }
      if (existsSync(join(dir, parts[i], '_middleware.js'))) mw.push(join(dir, parts[i], '_middleware.js'));
      return { mw, file: null, params };
    }
    if (!existsSync(join(dir, parts[i]))) return { mw, file: null, params };
    dir = join(dir, parts[i]);
  }
  return { mw, file: null, params };
}

export async function call(env, method, path, { cookie, body, headers = {}, raw } = {}) {
  const url = 'https://cas-develop.com' + path;
  const h = new Headers({ 'cf-connecting-ip': headers.ip || '10.0.0.1', ...headers });
  delete h.ip;
  if (cookie) h.set('cookie', cookie);
  let payload;
  if (raw != null) payload = raw;
  else if (body !== undefined) { payload = JSON.stringify(body); if (!h.has('content-type')) h.set('content-type', 'application/json'); }
  if (payload != null) h.set('content-length', String(Buffer.byteLength(payload)));
  if (method !== 'GET' && !h.has('origin') && !headers.noOrigin) h.set('origin', 'https://cas-develop.com');
  if (headers.noOrigin) h.delete('origin');
  const request = new Request(url, { method, headers: h, body: payload });
  const { mw, file, params } = route(new URL(url).pathname);
  const handler = async () => {
    if (!file) return new Response('static', { status: 200, headers: { 'x-static': '1' } });
    const m = await load(file);
    const fn = m['onRequest' + method[0] + method.slice(1).toLowerCase()] || m.onRequest;
    if (!fn) return new Response('method', { status: 405 });
    return fn({ request, env, params, waitUntil: null, next: async () => new Response('static', { headers: { 'x-static': '1' } }) });
  };
  let i = 0;
  const next = async () => (i < mw.length ? (await load(mw[i++])).onRequest({ request, env, params, next, waitUntil: null }) : handler());
  const res = await next();
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* html / csv */ }
  return { status: res.status, data, text, headers: res.headers };
}

// Сесія для клієнта (як після входу)
export async function login(env, clientId) {
  const { sessionCookie } = await load(join(FN, '_lib.js'));
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(clientId).first();
  return (await sessionCookie(env, c)).split(';')[0];
}
export async function addClient(env, f) {
  const r = await env.DB.prepare('INSERT INTO clients (provider, provider_id, name, email, phone, username) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(f.provider || 'telegram', String(f.id), f.name || null, f.email || null, f.phone || null, f.username || null).run();
  return r.meta.last_row_id;
}

// ===== мінімальний раннер =====
const results = [];
let group = '';
export function describe(name) { group = name; }
export async function it(name, fn) {
  try { await fn(); results.push([true, group, name]); }
  catch (e) { results.push([false, group, name, e]); }
}
export function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} очікували ${JSON.stringify(b)}, отримали ${JSON.stringify(a)}`); }
export function ok(v, msg) { if (!v) throw new Error(msg || 'умова не виконана'); }
export function report() {
  let g = null, fails = 0;
  for (const [pass, grp, name, e] of results) {
    if (grp !== g) { console.log('\n' + grp); g = grp; }
    console.log(`  ${pass ? '✓' : '✗'} ${name}${pass ? '' : '\n      ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')}`);
    if (!pass) fails++;
  }
  console.log(`\n${results.length - fails}/${results.length} OK${fails ? ` — ${fails} FAIL` : ' — ALL OK'}`);
  return fails;
}
