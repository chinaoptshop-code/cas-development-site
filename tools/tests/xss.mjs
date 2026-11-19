// Playwright: текст, який вводять клієнти, відвідувачі сайту, бот і працівники, ніде не стає розміткою в трьох інтерфейсах CRM
// (майстер-панель /kabinet/admin, кабінет працівника /kabinet/team, кабінет клієнта /kabinet*).
// У всі текстові поля, що приймає API (заявка з сайту, профіль клієнта, «Є правки», контакти, обʼєкт, етапи, звіти, задачі, проблеми,
// нотатки CRM), кладемо рядки з лапками й тегами; далі відкриваємо вкладки й картки і перевіряємо, що в DOM не зʼявилось жодного
// вузла чи атрибута з цих рядків (data-xss) і не виконався обробник (window.__xss). Посилання — лише безпечні схеми.
// API — справжні обробники functions/ через tools/tests/harness.mjs; сторінки — з репозиторію з CSP із _headers.
//   node tools/tests/xss.mjs
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { ROOT, addClient, call, freshDB, login, makeEnv } from './harness.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }

// рядки-пастки: тег з обробником; вихід з атрибута в подвійних і в одинарних лапках (без «<» — такі приймає й довідник контактів)
const TAG = '"><img src=x onerror="window.__xss=1" data-xss><svg onload="window.__xss=1" data-xss></svg>';
const DQ = 'x" autofocus onfocus="window.__xss=1" data-xss="1';
const SQ = "x' autofocus onfocus='window.__xss=1' data-xss='1";
const ALL = `${TAG} ${SQ}`;
const pick = i => [TAG, DQ, SQ, ALL][i % 4];
let n = 0;
const P = () => pick(n++);

const BOTKEY = 'test-leadbot-key-0123456789abcdef'; // фіктивний ключ лише для тестів
const env = makeEnv(freshDB(), {
  LEADBOT_KEY: BOTKEY,
  ASSETS: { fetch: async req => new Response(readFileSync(join(ROOT, new URL(req.url).pathname.slice(1) + '.html')), { headers: { 'content-type': 'text/html' } }) },
});
const DB = env.DB;
const OWNER = await addClient(env, { id: 111, name: 'Михайло' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const FORE = await addClient(env, { id: 333, name: 'Олег' });
const DES = await addClient(env, { id: 444, name: 'Аня' });
// клієнт: імʼя й @username приходять з Telegram, решту він вписує сам
const C1 = await addClient(env, { id: 900, name: ALL, username: SQ, phone: '+380501112233' });
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, FORE, DES, C1 })) ck[k] = await login(env, id);
const api = async (who, m, p, body) => { const r = await call(env, m, p, { cookie: ck[who], body }); if (r.status >= 400) throw new Error(`${m} ${p} → ${r.status} ${r.text}`); return r.data; };
await api('OWNER', 'GET', '/api/me'); await api('MGR', 'GET', '/api/me');
const fore = await api('OWNER', 'POST', '/api/admin/staff', { name: 'Олег ' + DQ, role: 'foreman', tg: '333', note: P() });
const des = await api('OWNER', 'POST', '/api/admin/staff', { name: 'Аня ' + SQ, role: 'designer', tg: '444', note: P() });
ck.FORE = await login(env, FORE); ck.DES = await login(env, DES);
const d0 = new Date(), iso = k => new Date(d0.getTime() + k * 86400000).toISOString().slice(0, 10);

// ===== клієнт =====
await call(env, 'PATCH', '/api/me', { cookie: ck.C1, body: { city: P(), company: P() } });
await call(env, 'PATCH', '/api/account/profile', { cookie: ck.C1, body: { client_type: 'eu', company_name: P(), company_code: 'x' } });
await call(env, 'POST', '/api/account/addresses', { cookie: ck.C1, body: { kind: 'object', city: P(), address: P(), label: P(), recipient: P() } });
// ===== заявки з сайту (будь-хто) =====
for (let i = 0; i < 4; i++) await call(env, 'POST', '/api/leads', { headers: { ip: '10.0.2.' + i }, body: {
  name: pick(i), phone: '06711122' + (30 + i), service: pick(i + 1), source: i % 2 ? 'cas-develop.com/x#' + pick(i) : pick(i + 2), page: pick(i), form: pick(i + 3),
  lang: i ? 'uk' : 'x">', message: pick(i + 1), area: pick(i + 2), utm_source: pick(i), utm_medium: pick(i + 1), utm_campaign: pick(i + 2), ref_path: '/proekty/monpark' } });
const leads = (await api('MGR', 'GET', '/api/admin/crm?kind=lead')).rows;
// ===== CRM: нотатки, історія, пропозиція, відповідальний-дизайнер =====
for (const [i, o] of leads.entries()) await api('MGR', 'PATCH', '/api/admin/crm', { id: o.id, crm_note: P(), manager_note: P(), note: P(), city: P(), assignee_staff_id: i % 2 ? des.id : fore.id });
await api('MGR', 'PATCH', '/api/admin/crm', { id: leads[0].id, offer: { key: 'dz', area: 85, region: 'ua' } });
await api('MGR', 'POST', '/api/admin/crm', { name: P(), phone: '0671112277', email: 'a@b.co' + SQ, service: P(), source: P(), comment: P(), city: P(), assignee: P() });
await call(env, 'POST', '/api/bot/leads', { headers: { 'x-bot-key': BOTKEY, noOrigin: true }, body: { hash: 'xsstest-lead-0001', service: DQ, city: SQ, text: DQ + ' ' + SQ, budget: DQ, estimate: SQ, source_name: DQ, author: { name: SQ, tg: '@test_author' } } });
// замовлення Оздоби (гість): імʼя, доставка, компанія, коментар
const cat = JSON.parse(readFileSync(join(ROOT, 'assets/ozdoba/catalog.json'), 'utf8'));
const it = cat.items.find(i => i.price == null) || cat.items[0];
const ordNum = (await call(env, 'POST', '/api/orders', { cookie: ck.C1, headers: { ip: '10.0.3.1' }, body: { name: P(), phone: '0671112288', delivery: P(), company: P(), comment: P(), cart: [{ id: it.id, qty: 5000 }] } })).data.number.replace(/^OZD-/, '');
await api('MGR', 'PATCH', '/api/admin/orders', { id: (await api('MGR', 'GET', '/api/admin/orders')).orders[0].id, manager_note: ALL, note: P() });
// ===== контакти (довідник не приймає «<», тож — вихід з атрибута) =====
const cts = [];
for (const [i, t] of ['crew', 'supplier', 'client'].entries())
  cts.push((await api('MGR', 'POST', '/api/admin/partners', { name: i % 2 ? SQ : DQ, company: i ? SQ + i : DQ, type: t, city: SQ, phone: '06722233' + (10 + i), tags: [DQ, SQ], notes: DQ + '\n' + SQ, status: 'working', rating: 5 })).id);
await call(env, 'POST', '/api/bot/partners', { headers: { 'x-bot-key': BOTKEY, noOrigin: true }, body: { name: SQ + ' бот', type: 'crew', city: DQ, tg: '@test_crew_ua', tags: [SQ], source_name: DQ, source_url: 'https://t.me/test_group/1' } });
// ===== обʼєкти: дизайн (погодження / «Є правки») і ремонт =====
const mk = (title, service, stages) => api('OWNER', 'POST', '/api/admin/projects', { type: 'project', client_id: C1, service, title, address: P(), next_step: P(), next_date: iso(0), manager: P(),
  stages, assignee_staff_id: fore.id, staff: [{ id: des.id, task: P() }], contract_amount: 50000, camera_url: 'https://cam.example.com/live', camera_note: P(), deadline: iso(-1) });
const PD = (await mk('Дизайн ' + TAG, 'design', [{ name: TAG, status: 'review', progress: 90, note: P(), staff_id: des.id, rev_max: 1 }, { name: SQ, status: 'review', progress: 90, note: P() }, { name: DQ, progress: 0, end: iso(-2) }])).id;
const PR = (await mk('Ремонт ' + SQ, 'repair', [{ name: DQ, progress: 40, end: iso(-2), note: P() }, { name: TAG, progress: 0 }])).id;
const st = async id => JSON.parse((await DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(id).first()).stages);
const sd = await st(PD), sr = await st(PR);
await api('C1', 'POST', '/api/account/projects', { action: 'revise', project_id: PD, stage_id: sd[0].id, note: ALL });
await api('C1', 'POST', '/api/account/projects', { action: 'approve', project_id: PD, stage_id: sd[1].id });
for (const pid of [PD, PR]) {
  const stage = (pid === PD ? sd : sr)[0].id;
  await api('OWNER', 'POST', '/api/admin/projects', { type: 'payment', project_id: pid, title: P(), note: P(), amount: 100, due_date: iso(-1), stage_id: stage });
  await api('OWNER', 'POST', '/api/admin/projects', { type: 'document', client_id: C1, project_id: pid, kind: 'act', title: P(), url: 'https://docs.example.com/a.pdf', stage_id: stage });
  await api('OWNER', 'POST', '/api/admin/projects', { type: 'task', project_id: pid, title: P(), staff_id: fore.id, due_date: iso(-1), stage_id: stage });
  await api('FORE', 'POST', '/api/team/action', { type: 'report', project_id: pid, title: P(), note: P(), photos: ['https://img.example.com/a.jpg?' + encodeURIComponent(SQ)], stage_id: stage });
  await api('FORE', 'POST', '/api/team/action', { type: 'issue', project_id: pid, note: ALL, stage_id: stage });
  await api('FORE', 'POST', '/api/admin/projects', { type: 'task', project_id: pid, title: P() });
  for (const c of cts) await api('MGR', 'POST', '/api/admin/partners', { action: 'link', contact_id: c, project_id: pid, role: SQ, note: DQ });
}
await api('OWNER', 'POST', '/api/admin/projects', { type: 'document', client_id: C1, kind: 'other', title: P(), url: 'https://docs.example.com/b.pdf' });
await api('OWNER', 'POST', '/api/admin/partner-codes', { code: 'XSS10', name: P(), discount: 10 }).catch(() => null);
await api('MGR', 'POST', '/api/admin/projects', { type: 'from_lead', order_id: leads[0].id });

// ===== сервер =====
const H = readFileSync(join(ROOT, '_headers'), 'utf8');
const cspOf = path => {
  const blocks = H.split(/\n(?=\/)/).map(b => b.split('\n')).filter(b => b[0] && b[0].startsWith('/'));
  const out = [];
  for (const [rule, ...lines] of blocks) {
    const re = new RegExp('^' + rule.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (!re.test(path)) continue;
    if (lines.some(l => /^\s*! Content-Security-Policy/.test(l))) out.length = 0;
    for (const l of lines) { const m = l.match(/^\s*Content-Security-Policy:\s*(.+)$/); if (m) out.push(m[1]); }
  }
  return out;
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.avif': 'image/avif', '.ico': 'image/x-icon' };
function staticFile(path) {
  let f = join(ROOT, decodeURIComponent(path));
  if (existsSync(f) && statSync(f).isDirectory()) f = !existsSync(join(f, 'index.html')) && existsSync(f + '.html') ? f + '.html' : join(f, 'index.html');
  if (!existsSync(f) && existsSync(f + '.html')) f = f + '.html';
  return existsSync(f) && !f.includes('/tools/') ? f : null;
}
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const chunks = []; for await (const c of req) chunks.push(c);
    const cookie = req.headers.cookie || '';
    if (u.pathname.startsWith('/api/')) {
      const raw = chunks.length ? Buffer.concat(chunks).toString() : null;
      const r = await call(env, req.method, u.pathname + u.search, { cookie, raw, headers: { 'content-type': req.headers['content-type'] || 'application/json' } });
      const h = {}; r.headers.forEach((v, k) => { if (!/content-length|content-encoding/.test(k)) h[k] = v; });
      res.writeHead(r.status, h); return res.end(r.text);
    }
    let status = 200, body = null;
    if (u.pathname.startsWith('/kabinet')) {
      const r = await call(env, 'GET', u.pathname, { cookie });
      if (r.status !== 200 || !r.headers.get('x-static')) { status = r.status; body = r.text; }
    }
    const f = body == null && staticFile(u.pathname);
    if (body == null && !f) { res.writeHead(404); return res.end('404'); }
    const headers = { 'content-type': f ? MIME[extname(f)] || 'application/octet-stream' : 'text/html; charset=utf-8' };
    if (!f || extname(f) === '.html') { const csp = cspOf(u.pathname); if (csp.length) headers['content-security-policy'] = csp.join(', '); }
    res.writeHead(status, headers); res.end(body != null ? body : readFileSync(f));
  } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e && e.stack || e)); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ===== браузер =====
const browser = await chromium.launch();
let fails = 0, opened = 0, withText = 0;
const seen = {};
const cookieOf = s => { const [name] = s.split('='); return { name, value: s.slice(name.length + 1), url: BASE }; };
// що вважаємо проривом: вузол/атрибут із пастки, виконаний обробник, посилання з небезпечною схемою
const probe = () => {
  const bad = [];
  if (window.__xss) bad.push('виконано обробник (window.__xss)');
  for (const el of document.querySelectorAll('[data-xss]')) bad.push('вузол/атрибут із тексту: ' + el.outerHTML.slice(0, 160));
  for (const el of document.querySelectorAll('[onfocus],[onerror],[onload]')) if (/__xss/.test(el.outerHTML)) bad.push('обробник з тексту: ' + el.outerHTML.slice(0, 160));
  for (const a of document.querySelectorAll('a[href],iframe[src],form[action]')) {
    const v = a.getAttribute('href') || a.getAttribute('src') || a.getAttribute('action') || '';
    if (/^\s*(javascript|data|vbscript):/i.test(v)) bad.push('небезпечна схема: ' + v.slice(0, 80));
  }
  return bad;
};
// відкриваємо все, що розгортається, і по черзі — картки (кожну з чистого аркуша)
const CARDS = '#admView .clk, #admView tr.clk, #admView .kn-card b, #admView [data-open], #admView [data-id]:not(input):not(select):not(button), .tm-obj summary, .tm-card, .kb-card summary';
async function crawl(label, who, path, { cards = 8, extra } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'uk-UA' });
  await ctx.addCookies([cookieOf(ck[who])]);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const found = new Set();
  let shown = 0; // скільки разів текст пастки справді був на екрані (інакше перевірка нічого не варта)
  const look = async () => {
    for (const b of await page.evaluate(probe).catch(() => [])) found.add(b);
    if (await page.evaluate(() => /__xss/.test(document.body.innerText) || [...document.querySelectorAll('input,textarea')].some(e => /__xss/.test(e.value))).catch(() => false)) shown++;
  };
  const settle = async () => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(250); };
  const unfold = async () => { await page.evaluate(() => { for (const d of document.querySelectorAll('details:not([open])')) d.open = true; }).catch(() => {}); await page.waitForTimeout(100); };
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle' }); await settle(); await unfold(); await look();
    const total = Math.min(cards, await page.locator(CARDS).count());
    for (let i = 0; i < total; i++) {
      await page.goto(BASE + '/kabinet', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.goto(BASE + path, { waitUntil: 'networkidle' }); await settle();
      const el = page.locator(CARDS).nth(i);
      if (!(await el.count())) break;
      await el.click({ timeout: 1500, force: true }).catch(() => {});
      await settle(); await unfold(); await look(); opened++;
      if (extra) { await extra(page).catch(() => {}); await settle(); await unfold(); await look(); }
    }
    if (extra && !total) { await extra(page).catch(() => {}); await settle(); await look(); }
  } catch (e) { found.add('помилка обходу: ' + String(e.message || e).split('\n')[0]); }
  if (found.size) fails++;
  seen[label] = shown; if (shown) withText++;
  console.log(`  ${found.size ? '✗' : '✓'} ${label} (текст пастки на екрані: ${shown})${found.size ? '\n      ' + [...found].slice(0, 8).join('\n      ') : ''}`);
  await ctx.close();
}
const table = async p => { const b = p.locator('[data-v=table]'); if (await b.count()) await b.first().click({ timeout: 1000 }); };

console.log('Майстер-панель (власник)');
for (const tab of ['studio', 'crm', 'stats', 'orders', 'clients', 'projects', 'partners', 'codes', 'team', 'audit'])
  await crawl('owner-' + tab, 'OWNER', '/kabinet/admin#' + tab, { cards: tab === 'projects' || tab === 'crm' ? 10 : 6 });
await crawl('owner-crm-table', 'OWNER', '/kabinet/admin#crm', { cards: 0, extra: table });
console.log('Робоча панель (менеджер)');
for (const tab of ['crm', 'clients', 'projects', 'partners']) await crawl('manager-' + tab, 'MGR', '/kabinet/admin#' + tab, { cards: 4 });
console.log('Кабінет працівника (прораб, дизайнер)');
for (const who of ['FORE', 'DES']) for (const v of ['today', 'objects', 'leads', 'more'])
  await crawl(`${who.toLowerCase()}-${v}`, who, '/kabinet/team#' + v, { cards: 4 });
console.log('Кабінет клієнта');
for (const p of ['', '/obiekt', '/proekty', '/profil', '/zamovlennia', '/zamovlennia?n=OZD-' + ordNum, '/obrane']) await crawl('client' + (p || '/'), 'C1', '/kabinet' + p, { cards: 3 });

await browser.close(); server.close();
if (opened < 20 || withText < 15) { console.log(`\nвідкрито лише ${opened} карток, текст пастки видно на ${withText} екранах — обхід не працює`); fails++; }
console.log(fails ? `\n${fails} FAIL` : `\nALL OK (карток відкрито: ${opened})`);
process.exit(fails ? 1 : 0);
