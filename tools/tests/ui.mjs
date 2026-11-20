// Playwright: три інтерфейси CRM (майстер-панель /kabinet/admin, кабінет працівника /kabinet/team, кабінет клієнта
// /kabinet/obiekt) на ширинах 402 і 1440 без JS-помилок і CSP-порушень + 403-сторінка для чужого інтерфейсу.
// API — справжні обробники functions/ через стенд tools/tests/harness.mjs (node:sqlite, мок Telegram), статичні файли — з репозиторію
// з CSP із _headers. Зовнішні запити (Clarity, Telegram, Google) блокуються.
//   node tools/tests/ui.mjs [--shots <тека>]     (скріни JPEG, стиснуті; без --shots — не зберігаються)
//   CRM3_SHOTS=<тека> — PNG діалогу конфлікту версій і вибору на канбані (crm3-*.png)
//   CRM4_SHOTS=<тека> — PNG вкладки «Задачі», задач у картці заявки, таблиці контактів та імпорту CSV (crm4-*.png)
//   ONLY=owner-crm,client — лише перевірки, назва яких починається з одного з цих слів (для налагодження)
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { ROOT, addClient, call, freshDB, login, makeEnv } from './harness.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const crm3Dir = process.env.CRM3_SHOTS || null;
if (crm3Dir) mkdirSync(crm3Dir, { recursive: true });
const snap = async (page, name) => { if (crm3Dir) await page.screenshot({ path: join(crm3Dir, `crm3-${name}-${page.viewportSize().width}.png`) }); };
const crm4Dir = process.env.CRM4_SHOTS || null;
if (crm4Dir) mkdirSync(crm4Dir, { recursive: true });
const snap4 = async (page, name) => { if (crm4Dir) await page.screenshot({ path: join(crm4Dir, `crm4-${name}-${page.viewportSize().width}.png`) }); };

// ===== дані =====
const BOTKEY = 'test-leadbot-key-0123456789abcdef'; // фіктивний ключ лише для тестів
const env = makeEnv(freshDB(), {
  LEADBOT_KEY: BOTKEY,
  ASSETS: { fetch: async req => new Response(readFileSync(join(ROOT, new URL(req.url).pathname.slice(1) + '.html')), { headers: { 'content-type': 'text/html' } }) },
});
const OWNER = await addClient(env, { id: 111, name: 'Михайло' });
const MGR = await addClient(env, { id: 222, name: 'Менеджер' });
const FORE = await addClient(env, { id: 333, name: 'Олег' });
const C1 = await addClient(env, { id: 900, name: 'Клієнт Тест', phone: '+380501112233' });
const C2 = await addClient(env, { id: 901, name: 'Клієнт Другий', phone: '+380501112244' }); // клієнт проєктів для перевірки конфлікту версій
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, FORE, C1, C2 })) ck[k] = await login(env, id);
const api = async (who, m, p, body) => { const r = await call(env, m, p, { cookie: ck[who], body }); if (r.status >= 400) throw new Error(`${m} ${p} → ${r.status} ${r.text}`); return r.data; };
await api('OWNER', 'GET', '/api/me');
await api('MGR', 'GET', '/api/me');
const fore = await api('OWNER', 'POST', '/api/admin/staff', { name: 'Олег (прораб)', role: 'foreman', tg: '333' });
ck.FORE = await login(env, FORE);
const d = new Date(), iso = n => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
const P1 = (await api('OWNER', 'POST', '/api/admin/projects', { type: 'project', client_id: C1, title: 'Квартира, тестовий обʼєкт', address: 'вул. Тестова, 1',
  stages: [{ name: 'Демонтаж', progress: 100 }, { name: 'Чорнові роботи', progress: 40, end: iso(-2) }, { name: 'Чистові', progress: 0, end: iso(20) }],
  assignee_staff_id: fore.id, contract_amount: 50000, contract_currency: 'USD', next_step: 'Приймання електрики', next_date: iso(0) })).id;
await api('OWNER', 'POST', '/api/admin/projects', { type: 'payment', project_id: P1, title: 'Аванс', amount: 25000, status: 'paid' });
await api('OWNER', 'POST', '/api/admin/projects', { type: 'payment', project_id: P1, title: 'Після чорнових', amount: 15000, due_date: iso(-1) });
for (const [i, s] of ['Ремонт квартири', 'Дизайн інтерʼєру', 'Будівництво будинку'].entries())
  await call(env, 'POST', '/api/leads', { body: { name: 'Лід ' + (i + 1), phone: '067111223' + i, service: s, source: 'cas-develop.com/remont-kvartyr-kyiv#prices' }, headers: { ip: '10.0.1.' + i } });
await call(env, 'POST', '/api/leads', { body: { name: 'Лід з кейсу', phone: '0671112299', service: 'Дизайн інтерʼєру', source: 'cas-develop.com/dyzain-interieru-kyiv', ref_path: '/proekty/monpark' }, headers: { ip: '10.0.1.9' } });
// бот пошуку: партнери й заявка «В CRM» (functions/api/bot/*)
for (const b of [{ name: 'Бригада Тест', type: 'crew', city: 'Київ', tg: '@test_crew_ua', tags: ['плитка'], source_name: 'Тестова група', source_url: 'https://t.me/test_group/1' },
  { company: 'ТОВ «Тест Постач»', type: 'supplier', city: 'Львів', site: 'https://supplier.example.com' }])
  await call(env, 'POST', '/api/bot/partners', { body: b, headers: { 'x-bot-key': BOTKEY, noOrigin: true } });
await call(env, 'POST', '/api/bot/leads', { body: { hash: 'uitest-lead-0001', service: 'Ремонт квартири', city: 'Київ', text: 'Лід з бота: шукаю ремонт 60 м²', author: { tg: '@test_author' } }, headers: { 'x-bot-key': BOTKEY, noOrigin: true } });
await api('FORE', 'POST', '/api/team/action', { type: 'issue', project_id: P1, note: 'Протікає стояк у ванній' });
await api('OWNER', 'POST', '/api/admin/projects', { type: 'project', client_id: C1, service: 'design', status: 'paused', title: 'Дизайн квартири, тест',
  stages: [{ name: 'Обміри й ТЗ', status: 'done', progress: 100, approved_at: iso(-3) }, { name: 'Планувальне рішення', status: 'review', progress: 90 }, { name: 'Концепція', progress: 0 }] });
// CRM v3: проєкти для перевірки конфлікту версій (по одному на ширину — клієнт погоджує етап під час редагування),
// заявки для вибору на канбані й для конфлікту в картці заявки
const CF = {};
for (const w of [402, 1440, 'clash']) CF[w] = (await api('OWNER', 'POST', '/api/admin/projects', { type: 'project', client_id: C2, service: 'design', title: 'Конфлікт версій ' + w,
  stages: [{ name: 'Планування', status: 'review', progress: 90 }, { name: 'Концепція', progress: 0 }] })).id;
const KB = {};
for (const w of [402, 1440]) KB[w] = [(await api('OWNER', 'POST', '/api/admin/crm', { name: 'Канбан А ' + w, phone: '0672220' + w, service: 'Ремонт' })).id,
  (await api('OWNER', 'POST', '/api/admin/crm', { name: 'Канбан Б ' + w, phone: '0672221' + w, service: 'Дизайн' })).id];
const LC = (await api('OWNER', 'POST', '/api/admin/crm', { name: 'Заявка для конфлікту', phone: '0672229999', service: 'Ремонт офісу' })).id;
const row = async (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
// CRM v4: задачі (загальні й до заявки / обʼєкта) і контакти для таблиці — усе вигадане
const kd = n => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
const LEAD1 = (await row("SELECT id FROM orders WHERE name = 'Лід 1'")).id;
for (const t of [
  { title: 'Надіслати КП по ремонту квартири', due_date: kd(0), order_id: LEAD1 },
  { title: 'Замовити плитку для санвузла', due_date: kd(-2), assignee_staff_id: fore.id, project_id: P1, priority: 'high', note: 'Керамограніт 60×120, 14 м²' },
  { title: 'Погодити дату заміру', due_date: kd(1), due_time: '11:00' },
  { title: 'Оновити прайс постачальників', due_date: kd(4) },
  { title: 'Зібрати відгуки після здачі' },
]) await api('MGR', 'POST', '/api/admin/tasks', t);
for (const w of [402, 1440]) await api('MGR', 'POST', '/api/admin/tasks', { title: 'Передзвонити прорабу ' + w, due_date: kd(0), assignee_staff_id: fore.id });
for (const c of [
  { name: 'Андрій Електрик (тест)', type: 'master', city: 'Київ', phone: '0670001101', tags: ['електрика'], rating: 5 },
  { name: 'Віра Плиточниця (тест)', type: 'master', city: 'Бровари', phone: '0670001102', tags: ['плитка'], rating: 4 },
  { company: 'ТОВ «Тестові вікна»', type: 'supplier', city: 'Львів', email: 'windows@example.com', tags: ['вікна'] },
  { name: 'Гліб Підрядник (тест)', company: 'ФОП Тестовий', type: 'contractor', city: 'Одеса', tg: '@test_contractor_ua' },
  { name: 'Дарина Ріелторка (тест)', type: 'realtor', city: 'Київ', phone: '0670001105' },
  { name: 'Єгор Партнер (тест)', type: 'partner', city: 'Вінниця', phone: '0670001106' },
]) await api('MGR', 'POST', '/api/admin/partners', c);

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
  if (existsSync(f) && statSync(f).isDirectory()) f = !existsSync(join(f, 'index.html')) && existsSync(f + '.html') ? f + '.html' : join(f, 'index.html'); // /kabinet → kabinet.html (поруч тека kabinet/)
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
    if (u.pathname.startsWith('/kabinet')) { // functions/kabinet/_middleware.js: 403 «не ваш інтерфейс»
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
let fails = 0;
const cookieOf = s => { const [name, value] = s.split('='); return { name, value: s.slice(name.length + 1), url: BASE }; };
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
async function check(label, who, path, widths, expect) {
  if (only && !only.some(o => label.startsWith(o))) return;
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 874 : 900 }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600, locale: 'uk-UA' }); // мова браузера — uk (кабінет клієнта бере її, якщо інших підказок немає)
    if (who) await ctx.addCookies([cookieOf(ck[who])]);
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('JS: ' + e.message));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(t)) errs.push('console: ' + t); if (/Content Security Policy|Refused to/.test(t)) errs.push('CSP: ' + t); });
    await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', e => console.error('Refused to (CSP) ' + e.violatedDirective + ' ' + e.blockedURI)); });
    let msg = '';
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await expect(page, resp);
      // горизонтальна прокрутка сторінки на телефоні — помилка верстки
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 2) errs.push(`горизонтальна прокрутка ${over}px`);
      if (shotsDir) await page.screenshot({ path: join(shotsDir, `${label}-${w}.jpg`), type: 'jpeg', quality: 55, fullPage: w > 600 ? false : true, clip: undefined });
    } catch (e) { errs.push(String(e.message || e).split('\n')[0]); }
    if (errs.length) { fails++; msg = '\n      ' + [...new Set(errs)].slice(0, 6).join('\n      '); }
    console.log(`  ${errs.length ? '✗' : '✓'} ${label} @${w}${msg}`);
    await ctx.close();
  }
}
const see = async (page, sel, text) => {
  await page.waitForSelector(sel, { timeout: 8000 });
  if (text) { const t = await page.textContent(sel); if (!new RegExp(text).test(t)) throw new Error(`${sel}: немає «${text}» (є: «${String(t).replace(/\s+/g, ' ').trim().slice(0, 90)}»)`); }
};
const W = [402, 1440];
let nAdd = 0;
console.log('Майстер-панель власника');
await check('owner-studio', 'OWNER', '/kabinet/admin#studio', W, async p => { await see(p, 'body.adm-owner'); await see(p, '.adm-tabs', 'Студія'); await see(p, '#admView', 'Воронк|воронк'); });
await check('owner-crm', 'OWNER', '/kabinet/admin#crm', W, async p => { await see(p, '#admView', 'Лід 1'); });
// сторінка-джерело (orders.ref_path): позначка «← /шлях» у списку, клік — фільтр за нею, поле фільтра й рядок у картці
await check('owner-crm-ref', 'OWNER', '/kabinet/admin#crm', W, async p => {
  await see(p, '#admView', 'Лід з кейсу');
  if (!(await p.$('[data-f=ref]'))) throw new Error('немає фільтра «Сторінка-джерело»');
  await p.locator('[data-ref="/proekty/monpark"]').first().click(); await p.waitForTimeout(600);
  if (await p.inputValue('[data-f=ref]') !== '/proekty/monpark') throw new Error('клік по позначці не поставив фільтр');
  const t = await p.textContent('[data-list]');
  if (!/Лід з кейсу/.test(t) || /Лід 1/.test(t)) throw new Error('фільтр за сторінкою-джерелом не працює');
  await p.locator('[data-list] :text("Лід з кейсу")').first().click(); await see(p, 'dialog[open]', 'Сторінка-джерело: /proekty/monpark');
});
// CRM: швидкі фільтри (один дотик), «Взяти в роботу» на новій заявці — без відкриття картки; у картці — дати «Завтра/+3 дні»
await check('owner-crm-quick', 'OWNER', '/kabinet/admin#crm', W, async p => {
  await see(p, '[data-list]', 'Лід 1');
  if (await p.$eval('details.crm-more', d => d.open)) throw new Error('панель фільтрів розгорнута без активних фільтрів');
  await p.click('[data-qf=new]'); await p.waitForTimeout(500);
  if (await p.getAttribute('[data-qf=new]', 'aria-pressed') !== 'true') throw new Error('«Нові» не позначено');
  const n0 = await p.$$eval('[data-take]', b => b.length); if (!n0) throw new Error('немає «Взяти в роботу»');
  const small = await p.$$eval('[data-take],[data-qf]', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 35.5).length);
  if (small) throw new Error('кнопки менші за норму: ' + small);
  const card = p.locator('.kn-card:has([data-take])').first(), num = (await card.locator('b').first().textContent()).trim();
  await card.locator('[data-take]').click(); await p.waitForTimeout(700);
  if (await p.locator('.kn-card', { hasText: num }).count()) throw new Error('взята заявка лишилась серед «Нових»');
  await p.click('[data-qf=all]'); await p.waitForTimeout(500);
  await p.locator('.kn-card', { hasText: num }).first().locator('b').first().click(); // не по позначці сторінки-джерела (вона ставить фільтр) await see(p, 'dialog[open]', 'В роботі|взято|Взяв');
  if (await p.$('dialog[open] [data-take]')) throw new Error('у взятої заявки знову «Взяти в роботу»');
  await p.click('dialog[open] [data-nc="1"]');
  const v = await p.inputValue('dialog[open] [name=next_contact]');
  if (v !== new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' })) throw new Error('«Завтра» поставило ' + v);
  p.once('dialog', d => d.accept()); await p.click('dialog[open] button.x'); await p.waitForTimeout(200);
  if (await p.$('dialog[open]')) throw new Error('картка не закрилась після підтвердження');
});
// Пропозиція з заявки: тип підставлено з тексту, площа → «від $2 550», «Зберегти розрахунок» → «Розрахунок», «Створити проєкт» → картка проєкту
await check('owner-lead-offer', 'OWNER', '/kabinet/admin#crm', [1440], async p => {
  await see(p, '[data-list]', 'Лід 2');
  await p.locator('.kn-card', { hasText: 'Лід 2' }).first().locator('b').first().click(); await see(p, 'dialog[open] [data-offer]', 'Пропозиція');
  if (await p.inputValue('dialog[open] [data-ok]') !== 'dz') throw new Error('тип не підставлено з «Дизайн інтерʼєру»');
  await p.fill('dialog[open] [data-oa]', '85'); await see(p, 'dialog[open] [data-os]', 'від \\$2\u202f550');
  await p.click('dialog[open] [data-osave]'); await p.waitForTimeout(800);
  if (await p.inputValue('dialog[open] [name=status]') !== 'quote_sent') throw new Error('стадія не «Розрахунок»');
  await see(p, 'dialog[open] [data-osend]', 'Надіслати КП'); await see(p, 'dialog[open] .kp-text');
  if (!/від \$2\u202f550/.test(await p.inputValue('dialog[open] .kp-text'))) throw new Error('текст КП без «від»');
  if (!(await p.$('dialog[open] [data-sh=whatsapp]'))) throw new Error('немає кнопки WhatsApp');
  p.once('dialog', d => d.accept()); await p.click('dialog[open] [data-oconv]');
  await see(p, '.pj-lead', 'З заявки'); await see(p, '[data-f] [name=title]');
  if (!/Дизайн-проєкт/.test(await p.inputValue('[data-f] [name=title]'))) throw new Error('назва проєкту');
  const n = await p.$$eval('.pj-stage', e => e.length); if (n !== 8) throw new Error('етапів дизайну ' + n);
});
// Масові дії: у таблиці — прапорці, панель «Вибрано N» з підтвердженням → стадія змінюється для обраних
await check('owner-crm-bulk', 'OWNER', '/kabinet/admin#crm', [1440, 402], async p => {
  await see(p, '[data-list]', 'Лід');
  if (!(await p.$('[data-sel]'))) { await p.click('[data-v=table]'); await p.waitForTimeout(500); }
  const boxes = p.locator('[data-sel]'); if (await boxes.count() < 2) throw new Error('немає прапорців вибору');
  await boxes.nth(0).click(); await boxes.nth(1).click();
  await see(p, '[data-bulk]', 'Вибрано: 2');
  const h = await p.$eval('[data-bulk] [data-bx]', b => b.getBoundingClientRect().height); if (h < 43.5) throw new Error('кнопка панелі < 44px');
  p.once('dialog', d => d.accept()); await p.selectOption('[data-bulk] [data-bs]', 'in_work'); await p.waitForTimeout(900);
  if (!(await p.$eval('[data-bulk]', b => b.hidden))) throw new Error('панель не сховалась після дії');
  if (/,\s*<div class="kn-card|^,/.test(await p.innerHTML('[data-list]'))) throw new Error('коми між картками');
});
// «Партнери»: список, фільтр за типом, картка, збереження статусу; CRM — фільтр «Бот пошуку»
await check('owner-partners', 'OWNER', '/kabinet/admin#partners', W, async p => {
  await see(p, '[data-ptbl]', 'Бригада Тест'); await see(p, '[data-ptbl]', 'Тест Постач');
  await p.selectOption('[data-f=type]', 'supplier'); await p.waitForTimeout(500);
  const t = await p.textContent('#admView');
  if (/Бригада Тест/.test(t) || !/Тест Постач/.test(t)) throw new Error('фільтр за типом не працює');
  await p.selectOption('[data-f=type]', ''); await p.waitForTimeout(500);
  await p.locator('[data-ptbl] tr.clk', { hasText: 'Бригада Тест' }).click(); await see(p, '[data-pf]');
  if (await p.inputValue('[data-pf] [name=tg]') !== '@test_crew_ua') throw new Error('картка: немає @username');
  await see(p, '#admView', 'Тестова група');
  await p.selectOption('[data-pf] [name=status]', 'interesting'); await p.click('[data-pf] button[type=submit]');
  await see(p, '[data-ptbl]', 'Цікавий');
  await p.selectOption('[data-f=type]', ''); // скидаємо фільтр (зберігається в localStorage)
  // швидкий фільтр за типом і новий контакт-майстер з оцінкою
  await p.click('[data-qt=crew]'); await p.waitForTimeout(500);
  if (!/Бригада Тест/.test(await p.textContent('[data-ptbl]')) || /Тест Постач/.test(await p.textContent('#admView'))) throw new Error('швидкий фільтр «Бригади»');
  await p.click('[data-qt=""]'); await p.waitForTimeout(400);
  await p.click('[data-new]'); await see(p, '[data-pf]');
  await p.fill('[data-pf] [name=name]', 'Майстер UI ' + (++nAdd)); await p.selectOption('[data-pf] [name=type]', 'master'); await p.selectOption('[data-pf] [name=rating]', '5');
  await p.click('[data-pf] button[type=submit]'); await see(p, '[data-ptbl]', 'Майстер UI');
  if (!(await p.$('[data-ptbl] .ct-star'))) throw new Error('немає оцінки в списку');
});
await check('owner-crm-finder', 'OWNER', '/kabinet/admin#crm', [1440], async p => {
  await see(p, '#admView', 'Лід 1');
  await p.click('details.crm-more summary'); // панель фільтрів згорнута, доки фільтри не задано
  await p.selectOption('[data-f=place]', 'finder'); await p.waitForTimeout(600);
  const t = await p.textContent('[data-list]');
  if (!/@test_author/.test(t) || /Лід 1/.test(t)) throw new Error('фільтр «Бот пошуку» не працює');
  await p.selectOption('[data-f=place]', '');
});
await check('owner-project-save', 'OWNER', '/kabinet/admin#projects', W, async p => {
  await see(p, '#admView', 'Квартира, тестовий обʼєкт');
  await p.locator('#admView .clk', { hasText: 'Квартира, тестовий обʼєкт' }).first().click(); await see(p, '[data-save]');
  if (!(await p.$eval('[data-dirty]', e => e.hidden))) throw new Error('позначка змін без змін');
  await p.fill('[data-f] [name=next_step]', 'Приймання електрики й сантехніки');
  if (await p.$eval('[data-dirty]', e => e.hidden)) throw new Error('немає позначки незбережених змін');
  if (await p.$eval('.pj-save', e => getComputedStyle(e).position) !== 'sticky') throw new Error('«Зберегти проєкт» не липка');
  await p.click('[data-save]'); await p.waitForTimeout(800); await see(p, '[data-save]');
  if (await p.inputValue('[data-f] [name=next_step]') !== 'Приймання електрики й сантехніки') throw new Error('не збережено');
  if (!(await p.$eval('[data-dirty]', e => e.hidden))) throw new Error('позначка лишилась після збереження');
});
// Контакти обʼєкта: пошук у довіднику → привʼязка з роллю → видно в картці; прораб бачить контакт у своєму кабінеті
await check('owner-project-contacts', 'OWNER', '/kabinet/admin#projects', [1440], async p => {
  await p.locator('#admView .clk', { hasText: 'Квартира, тестовий обʼєкт' }).first().click(); await see(p, '[data-pct]');
  if (await p.$('[data-pct] [data-ctx]')) return; // уже привʼязано попереднім проходом
  await p.fill('[data-ctr]', 'Плитка'); await p.fill('[data-ctq]', 'Бригада'); await p.waitForSelector('[data-ctl]');
  await p.click('[data-ctl]'); await see(p, '[data-pct] .ct-links', 'Бригада Тест');
});
// ===== CRM v3 (19.11.2026) =====
// Одночасне редагування: менеджер редагує картку проєкту, клієнт у цей час погоджує етап → «Зберегти» → діалог
// «Проєкт змінився, поки ви редагували» → «Оновити й повторити мої зміни» → зміни менеджера збережено, погодження клієнта ціле
await check('owner-project-conflict', 'OWNER', '/kabinet/admin#projects', W, async p => {
  const w = p.viewportSize().width, pid = CF[w];
  await p.locator('#admView .clk', { hasText: 'Конфлікт версій ' + w }).first().click(); await see(p, '[data-save]');
  await p.fill('[data-f] [name=next_step]', 'Передати планування ' + w);
  await p.fill('[data-st] [data-k=note][data-i="1"]', 'примітка менеджера');
  const sid = JSON.parse((await row('SELECT stages FROM projects WHERE id = ?', pid)).stages)[0].id;
  await api('C2', 'POST', '/api/account/projects', { action: 'approve', project_id: pid, stage_id: sid }); // клієнт погодив у своєму кабінеті
  await p.click('[data-save]');
  await see(p, 'dialog.cf-dlg[open]', 'Проєкт змінився, поки ви редагували'); await see(p, 'dialog.cf-dlg', 'клієнт погодив етап');
  if (/Клієнт Другий/.test(await p.textContent('dialog.cf-dlg'))) throw new Error('у діалозі — імʼя клієнта');
  const btns = await p.$$eval('dialog.cf-dlg .cf-act .btn', a => a.map(b => [b.textContent, Math.round(b.getBoundingClientRect().height), getComputedStyle(b).borderRadius]));
  if (btns.length !== 3 || btns[0][0] !== 'Оновити й повторити мої зміни') throw new Error('кнопки діалогу: ' + JSON.stringify(btns));
  if (btns.some(b => b[1] < 44 || parseFloat(b[2]) < 20)) throw new Error('кнопки діалогу < 44 px або не округлі: ' + JSON.stringify(btns));
  const box = await p.$eval('dialog.cf-dlg', d => { const r = d.getBoundingClientRect(); return [r.left, r.right, innerWidth, r.bottom, innerHeight]; });
  if (box[0] < 0 || box[1] > box[2] + 1 || box[3] > box[4] + 1) throw new Error('діалог виходить за екран: ' + box);
  let st = JSON.parse((await row('SELECT stages FROM projects WHERE id = ?', pid)).stages);
  if (!st[0].approved_at || st[1].note) throw new Error('сервер зберіг стару форму');
  await snap(p, 'conflict');
  await p.click('dialog.cf-dlg button[value=retry]');
  await p.waitForFunction(() => /ваші зміни додано до свіжих даних/.test(document.body.textContent), null, { timeout: 8000 });
  await p.waitForTimeout(700); await see(p, '[data-save]');
  const pr = await row('SELECT next_step, stages FROM projects WHERE id = ?', pid); st = JSON.parse(pr.stages);
  if (pr.next_step !== 'Передати планування ' + w || st[1].note !== 'примітка менеджера') throw new Error('зміни менеджера не збережено: ' + pr.next_step + ' / ' + st[1].note);
  if (!st[0].approved_at || st[0].approved_by !== 'client' || !(st[0].hist || []).some(h => h.act === 'approve')) throw new Error('погодження клієнта втрачено: ' + JSON.stringify(st[0]));
  await see(p, '[data-st]', 'Погоджено клієнтом'); await see(p, '[data-st]', 'у кабінеті');
  if (!(await p.$eval('[data-dirty]', e => e.hidden))) throw new Error('позначка незбережених змін лишилась');
});
// те саме поле змінили обидва → свіже значення лишається, моє показано в примітці; нічого не зберігається само
await check('owner-project-conflict-clash', 'OWNER', '/kabinet/admin#projects', [1440], async p => {
  const pid = CF.clash;
  await p.locator('#admView .clk', { hasText: 'Конфлікт версій clash' }).first().click(); await see(p, '[data-save]');
  await p.fill('[data-f] [name=next_step]', 'Мій крок'); await p.fill('[data-f] [name=address]', 'вул. Моя, 5');
  await api('MGR', 'PATCH', '/api/admin/projects', { id: pid, next_step: 'Крок іншого менеджера' });
  await p.click('[data-save]'); await see(p, 'dialog.cf-dlg[open]', 'Проєкт змінився');
  await p.click('dialog.cf-dlg button[value=retry]');
  await see(p, '[data-cfn]', 'Крок іншого менеджера'); await see(p, '[data-cfn]', 'Мій крок');
  if (await p.inputValue('[data-f] [name=next_step]') !== 'Крок іншого менеджера') throw new Error('у полі має лишитись свіже значення');
  if (await p.inputValue('[data-f] [name=address]') !== 'вул. Моя, 5') throw new Error('мою зміну без перетину не перенесено');
  if (await p.$eval('[data-dirty]', e => e.hidden)) throw new Error('перенесені зміни мають бути позначені як незбережені');
  if ((await row('SELECT address FROM projects WHERE id = ?', pid)).address) throw new Error('з конфліктом поля нічого не має зберігатись само');
  await p.click('[data-save]'); await p.waitForTimeout(900);
  const pr = await row('SELECT address, next_step FROM projects WHERE id = ?', pid);
  if (pr.address !== 'вул. Моя, 5' || pr.next_step !== 'Крок іншого менеджера') throw new Error('після перевірки не збережено: ' + JSON.stringify(pr));
  // «Оновити без моїх змін» і «Повернутись до форми»
  await see(p, '[data-save]'); await p.fill('[data-f] [name=manager]', 'Чернетка');
  await api('MGR', 'PATCH', '/api/admin/projects', { id: pid, next_step: 'Ще один крок' });
  await p.click('[data-save]'); await see(p, 'dialog.cf-dlg[open]'); await p.click('dialog.cf-dlg button[value=cancel]');
  if (await p.inputValue('[data-f] [name=manager]') !== 'Чернетка') throw new Error('«Повернутись до форми» має лишити форму як є');
  await p.click('[data-save]'); await see(p, 'dialog.cf-dlg[open]'); await p.click('dialog.cf-dlg button[value=reload]'); await p.waitForTimeout(900); await see(p, '[data-save]');
  if (await p.inputValue('[data-f] [name=manager]') !== '' || await p.inputValue('[data-f] [name=next_step]') !== 'Ще один крок') throw new Error('«Оновити без моїх змін» має показати свіжі дані');
});
// картка заявки: інший менеджер змінив місто, я — нотатки → діалог → повторити → обидві зміни в базі
await check('owner-lead-conflict', 'OWNER', '/kabinet/admin#crm', [1440], async p => {
  await see(p, '[data-list]', 'Заявка для конфлікту');
  await p.locator('.kn-card, tr.clk', { hasText: 'Заявка для конфлікту' }).first().click(); await see(p, 'dialog[open] form');
  await p.fill('dialog[open] [name=crm_note]', 'Мої нотатки після дзвінка');
  await api('MGR', 'PATCH', '/api/admin/crm', { id: LC, city: 'Одеса' });
  await p.click('dialog[open] button[value=save]');
  await see(p, 'dialog.cf-dlg[open]', 'Заявку змінили, поки ви редагували');
  await p.click('dialog.cf-dlg button[value=retry]'); await p.waitForTimeout(900);
  const o = await row('SELECT crm_note, city FROM orders WHERE id = ?', LC);
  if (o.crm_note !== 'Мої нотатки після дзвінка' || o.city !== 'Одеса') throw new Error('злиття заявки: ' + JSON.stringify(o));
  // те саме поле: моє значення не затирає чуже — примітка з обома
  await p.locator('.kn-card, tr.clk', { hasText: 'Заявка для конфлікту' }).first().click(); await see(p, 'dialog[open] form');
  await p.fill('dialog[open] [name=city]', 'Львів');
  await api('MGR', 'PATCH', '/api/admin/crm', { id: LC, city: 'Харківська обл.' });
  await p.click('dialog[open] button[value=save]'); await see(p, 'dialog.cf-dlg[open]');
  await p.click('dialog.cf-dlg button[value=retry]');
  await see(p, 'dialog[open] [data-cfn]', 'Харківська обл.'); await see(p, 'dialog[open] [data-cfn]', 'Львів');
  if ((await row('SELECT city FROM orders WHERE id = ?', LC)).city !== 'Харківська обл.') throw new Error('чуже значення затерто');
});
// масові дії на канбані: «Вибрати кілька» → прапорці на картках → панель → стадія з підтвердженням
await check('owner-crm-kanban-bulk', 'OWNER', '/kabinet/admin#crm', [1440, 402], async p => {
  const w = p.viewportSize().width, [a, b] = KB[w];
  await see(p, '[data-list]', 'Лід');
  await p.click('[data-v=kanban]'); await see(p, '.kn .kn-card'); await p.waitForTimeout(350); // зміна вигляду — з плавним переходом
  if (await p.$('.kn [data-sel]')) throw new Error('прапорці на канбані — лише в режимі вибору');
  const pick = p.locator('[data-pick]');
  const ph = await pick.evaluate(e => e.getBoundingClientRect().height);
  if (ph < (w < 600 ? 43.5 : 35)) throw new Error('кнопка «Вибрати кілька» замала: ' + ph);
  await pick.click(); await see(p, '.kn.pick [data-sel]'); await see(p, '[data-bulk]', 'Вибрано: 0');
  for (const id of [a, b]) { const c = p.locator(`.kn-card[data-id="${id}"]`); await c.scrollIntoViewIfNeeded(); await c.locator('b').first().click(); } // дотик до картки — вибрати
  if (await p.$('dialog[open]')) throw new Error('у режимі вибору картка не має відкриватись');
  await see(p, '[data-bulk]', 'Вибрано: 2');
  if ((await p.locator('.kn-card.picked').count()) !== 2) throw new Error('вибрані картки не підсвічено');
  const z = await p.$eval(`.kn-card[data-id="${a}"] .sel-l`, e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  if (z[0] < 43.5 || z[1] < 43.5) throw new Error('зона прапорця < 44 px: ' + z);
  await p.locator(`.kn-card[data-id="${a}"]`).scrollIntoViewIfNeeded();
  await snap(p, 'kanban');
  let asked = ''; p.once('dialog', d => { asked = d.message(); d.accept(); });
  await p.selectOption('[data-bulk] [data-bs]', 'in_work'); await p.waitForTimeout(1000);
  if (!/2 запис/.test(asked)) throw new Error('немає підтвердження масової дії: ' + asked);
  for (const id of [a, b]) if ((await row('SELECT status FROM orders WHERE id = ?', id)).status !== 'in_work') throw new Error('стадію не змінено');
  if (await p.$('.kn.pick')) throw new Error('після дії режим вибору має вимкнутись');
  // «вся колонка» і вихід з вибору без змін
  await p.click('[data-pick]'); await see(p, '.kn.pick [data-colall]');
  const col = p.locator('.kn-col', { has: p.locator('[data-colall]') }).first();
  await col.locator('[data-colall]').click();
  const n = await col.locator('.kn-card').count();
  await see(p, '[data-bulk]', 'Вибрано: ' + n);
  p.once('dialog', d => d.dismiss()); await p.selectOption('[data-bulk] [data-bs]', 'cancelled'); await p.waitForTimeout(400); // «ні» в підтвердженні — нічого не міняється
  if ((await row("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' AND id IN (?, ?)", a, b)).n) throw new Error('дія виконалась без підтвердження');
  await p.click('[data-bulk] [data-bx]'); await p.click('[data-bulk] [data-bx]').catch(() => {});
  await p.waitForTimeout(300);
  if (await p.$('.kn.pick')) throw new Error('«Скасувати вибір» / «Вийти з вибору» не вимкнули режим');
  await p.click('[data-v=' + (w < 600 ? 'table' : 'kanban') + ']');
});
// незбережені зміни: перемикання вкладки панелі спершу питає («ні» — лишаємось у формі, «так» — переходимо)
await check('owner-tab-guard', 'OWNER', '/kabinet/admin#projects', W, async p => {
  await p.locator('#admView .clk', { hasText: 'Квартира, тестовий обʼєкт' }).first().click(); await see(p, '[data-save]');
  let asked = 0; const no = d => { asked++; d.dismiss(); };
  p.once('dialog', no); await p.click('.adm-tabs [data-t=crm]'); await p.waitForTimeout(300);
  if (asked) throw new Error('без змін питати не треба'); p.off('dialog', no);
  await see(p, '[data-list]'); await p.click('.adm-tabs [data-t=projects]');
  await p.locator('#admView .clk', { hasText: 'Квартира, тестовий обʼєкт' }).first().click(); await see(p, '[data-save]');
  await p.fill('[data-f] [name=manager]', 'Незбережений текст');
  let msg = ''; p.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await p.click('.adm-tabs [data-t=crm]'); await p.waitForTimeout(300);
  if (!/незбережені зміни/.test(msg)) throw new Error('перемикання вкладки не попередило: ' + msg);
  if (await p.inputValue('[data-f] [name=manager]') !== 'Незбережений текст') throw new Error('після «ні» форма має лишитись');
  if ((await p.getAttribute('.adm-tabs [data-t=projects]', 'aria-pressed')) !== 'true' || !/#projects$/.test(p.url())) throw new Error('вкладка / адреса змінились попри «ні»');
  p.once('dialog', d => d.accept()); await p.click('.adm-tabs [data-t=crm]'); await see(p, '[data-list]');
  if ((await p.getAttribute('.adm-tabs [data-t=crm]', 'aria-pressed')) !== 'true') throw new Error('після «так» вкладка не перемкнулась');
  // картка контакту — той самий сторож
  await p.click('.adm-tabs [data-t=partners]'); await see(p, '[data-ptbl]');
  await p.locator('[data-ptbl] .clk').first().click(); await see(p, '[data-pf]');
  await p.fill('[data-pf] [name=city]', 'Чернетка міста');
  msg = ''; p.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await p.click('.adm-tabs [data-t=crm]'); await p.waitForTimeout(300);
  if (!/картці контакту/.test(msg) || !(await p.$('[data-pf]'))) throw new Error('картка контакту: вкладка перемкнулась без попередження');
  p.once('dialog', d => d.accept()); await p.click('[data-back]'); await see(p, '[data-ptbl]');
});
await check('owner-staff', 'OWNER', '/kabinet/admin#team', W, async p => { await see(p, '.staff-t', 'Олег');
  await p.click('details.add summary'); await see(p, '[data-add]');
  const n = ++nAdd; await p.fill('[data-add] [name=name]', 'Тест Менеджер ' + n); await p.selectOption('[data-add] [name=role]', 'manager'); await p.fill('[data-add] [name=email]', 'test.manager' + n + '@example.com');
  await p.click('[data-add] button[type=submit]'); await see(p, '.st-inv', 'kabinet/team'); await see(p, '.staff-t', 'Тест Менеджер'); });
await check('owner-audit', 'OWNER', '/kabinet/admin#audit', [1440], async p => { await see(p, '#admView', 'Аудит'); });
console.log('Робоча панель менеджера (без Студії/Персоналу/Аудиту)');
await check('manager-panel', 'MGR', '/kabinet/admin', [1440], async p => {
  await see(p, 'body.adm-manager'); await see(p, '.adm-tabs', 'CRM');
  if (/Студія|Персонал|Аудит/.test(await p.textContent('.adm-tabs'))) throw new Error('менеджер бачить вкладки власника');
  if (!/Контакти/.test(await p.textContent('.adm-tabs'))) throw new Error('менеджер не бачить «Контакти»');
});
console.log('Кабінет працівника (прораб)');
await check('team-today', 'FORE', '/kabinet/team', W, async p => {
  await see(p, '.tm-tasks'); await see(p, '.tm-hello', 'Прораб');
  const t = await p.textContent('#tm');
  if (/50\s?000|25\s?000|Платежі/.test(t)) throw new Error('прораб бачить фінанси');
});
await check('team-objects', 'FORE', '/kabinet/team#objects', W, async p => {
  await see(p, '.tm-obj', 'Квартира, тестовий обʼєкт'); await see(p, '.tm-obj', '\\+380501112233');
  await p.click('.tm-obj [data-act="report"]'); await see(p, '#tmSheet[open]', 'Фотозвіт');
  const fs = await p.$eval('#tmSheet textarea', e => parseFloat(getComputedStyle(e).fontSize)); if (fs < 16) throw new Error('поле < 16px (iPhone збільшить)');
  const small = await p.$$eval('.tm-btn,.tm-nav a,.tm-x', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.textContent.trim()).slice(0, 3));
  if (small.length) throw new Error('кнопки < 44px: ' + small.join(', '));
});
await check('team-contacts', 'FORE', '/kabinet/team#objects', [402], async p => {
  await see(p, '.tm-obj', 'Квартира, тестовий обʼєкт'); await see(p, '.tm-obj', 'Контакти обʼєкта');
});
console.log('Кабінет клієнта');
await check('client-object', 'C1', '/kabinet/obiekt', W, async p => {
  await see(p, 'main', 'Квартира, тестовий обʼєкт');
  const t = await p.textContent('main');
  if (/Протікає стояк|Олег \(прораб\)/.test(t)) throw new Error('клієнт бачить внутрішні поля (проблема/працівник)');
  // камеру пропонуємо один раз: картка «Камера 24/7» з кнопкою; форма заявки внизу зʼявляється лише після кнопки
  if (await p.locator('[data-cam-lead]').count() !== 1) throw new Error('кнопка «Підключити камеру» має бути одна');
  if (await p.isVisible('#kb-lead')) throw new Error('форма заявки на камеру видна одразу — камера пропонується двічі');
  await p.click('[data-cam-lead]'); await p.waitForTimeout(700);
  if (!(await p.isVisible('#kb-lead #oPhone'))) throw new Error('кнопка картки не відкрила форму заявки на камеру');
  if ((await p.$eval('#of', f => f.dataset.service)) !== 'camera') throw new Error('форма не про камеру');
});
await check('client-approve', 'C1', '/kabinet/proekty', [402], async p => {
  await see(p, '#kb', 'Дизайн квартири, тест'); await see(p, '#kb', 'чекає вашого погодження');
  const h = await p.$eval('[data-appr]', b => b.getBoundingClientRect().height); if (h < 43.5) throw new Error('кнопка < 44px');
  p.once('dialog', d => d.accept()); await p.click('[data-appr]'); await p.waitForTimeout(600);
  if (await p.$('[data-appr]')) throw new Error('кнопка лишилась');
  const r = await p.evaluate(() => window.CASAccount.api('/api/account/projects'));
  const st = r.projects.find(x => x.service === 'design').stages[1];
  if (!st.approved_at || st.approved_by !== 'client') throw new Error('не збережено: ' + JSON.stringify(st));
});
// Оздоба прихована (tools/site/flags.py OZDOBA_PUBLIC = False → data-oz="0"): у огляді без промо Оздоби й кошика,
// вкладки «Замовлення»/«Обране» — лише за наявності даних; кнопка «Вийти / змінити акаунт» — в огляді й профілі
const OZ_OFF = /data-oz="0"/.test(readFileSync(join(ROOT, 'kabinet.html'), 'utf8'));
await check('client-overview', 'C1', '/kabinet', W, async p => {
  await see(p, '#kb [data-kb-out]', 'Вийти / змінити акаунт');
  if (!OZ_OFF) return;
  const t = await p.textContent('#kb');
  if (/До каталогу Оздоби|Рекомендуємо з Оздоби|Знижка за обсягом/.test(t)) throw new Error('промо Оздоби в огляді');
  if (await p.$('header a[aria-label="Кошик"]')) throw new Error('кошик у шапці');
  const st = await p.evaluate(async () => { const r = await window.CASAccount.api('/api/account/orders').catch(() => ({ orders: [] }));
    const v = s => { const a = document.querySelector('.kb-tabs a[data-kb-tab="' + s + '"]'); return a && !a.hidden; };
    return { n: (r.orders || []).length, o: v('orders') }; });
  if (st.o !== st.n > 0) throw new Error(`вкладка «Замовлення»: видно=${st.o}, замовлень=${st.n}`);
});
await check('client-profile', 'C1', '/kabinet/profil', [402], async p => { await see(p, '#kb [data-kb-out]', 'Вийти / змінити акаунт'); });
// Мови кабінету клієнта (assets/kabinet-i18n.v1.js, tools/shop/kabinet_v2.py): ?lang=xx → словник, шапка/футер мови, памʼять між сторінками,
// перемикач select#kb-lang, RTL для ar, мова зі сторінки-джерела (referrer), працівник і адмінка — українською
const noUk = async (p, sel = 'main') => { const t = await p.textContent(sel); const m = t.match(/Етапи робіт|Графік платежів|Документи|Особисті дані|Мова спілкування|Вийти \/ змінити акаунт|Загальна готовність/); if (m) throw new Error('неперекладене: ' + m[0]); };
await check('client-lang-en', 'C1', '/kabinet/obiekt?lang=en', W, async p => {
  await see(p, '#kb .kb-card', 'Квартира, тестовий обʼєкт');
  if (await p.getAttribute('html', 'lang') !== 'en') throw new Error('html lang ≠ en');
  await see(p, 'h1', 'My site: online control'); await see(p, '#kb', 'Work stages'); await see(p, '#kb', 'Payment schedule'); await noUk(p);
  if (!await p.$('header.sch .sch-nav a[href^="/en/"]')) throw new Error('шапка не англійською');
  if (!await p.$('footer.scf a[href^="/en/"]')) throw new Error('футер не англійською');
  if (!/\?lang=ru$/.test(await p.getAttribute('.scf-langs a[lang="ru"]', 'href'))) throw new Error('мови футера не ведуть на цю ж сторінку кабінету');
  await p.click('.kb-tabs a[href="/kabinet/profil"]'); await p.waitForSelector('#kb-pf');
  if (await p.getAttribute('html', 'lang') !== 'en') throw new Error('мова не запамʼяталась між сторінками');
  await see(p, '#kb', 'Personal details'); await noUk(p);
  if ((await p.$$eval('#pf-lang option', o => o.length)) !== 10) throw new Error('«Мова спілкування» — не 10 мов');
});
await check('client-lang-switch-rtl', 'C1', '/kabinet/obiekt?lang=en', [402, 1440], async p => {
  await p.waitForSelector('#kb .kb-card');
  await Promise.all([p.waitForURL(/lang=ar/), p.selectOption('#kb-lang', 'ar')]);
  await p.waitForSelector('#kb .kb-card');
  const a = await p.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, stored: localStorage.getItem('cas-kab-lang'), ck: document.cookie,
    sel: document.getElementById('kb-lang').value, ta: getComputedStyle(document.querySelector('.kb-note') || document.body).borderRightWidth }));
  if (a.dir !== 'rtl' || a.lang !== 'ar' || a.stored !== 'ar' || !/cas_lang=ar/.test(a.ck) || a.sel !== 'ar') throw new Error('ar/RTL: ' + JSON.stringify(a));
  await noUk(p); await p.waitForLoadState('networkidle');
  await Promise.all([p.waitForURL(/lang=uk/), p.selectOption('#kb-lang', 'uk')]);
  await see(p, 'h1', 'Мій обʼєкт'); await see(p, '#kb', 'Етапи робіт');
  if (await p.evaluate(() => document.documentElement.dir === 'rtl' || document.documentElement.lang !== 'uk')) throw new Error('після uk лишився RTL/мова');
});
await check('client-lang-ar', 'C1', '/kabinet/obiekt?lang=ar', W, async p => { // RTL: без горизонтальної прокрутки (перевіряє check), шапка й текст арабською
  await see(p, '#kb .kb-card', 'Квартира, тестовий обʼєкт'); await noUk(p);
  if (await p.evaluate(() => document.documentElement.dir) !== 'rtl') throw new Error('немає dir=rtl');
  await see(p, '#kb', 'جدول الدفعات');
});
await check('client-lang-referrer', null, '/kabinet', [402], async p => {
  await p.goto(BASE + '/kabinet', { referer: BASE + '/de/', waitUntil: 'networkidle' });
  if (await p.getAttribute('html', 'lang') !== 'de') throw new Error('мова зі сторінки-джерела /de/ не взялась');
  await see(p, '#kb-login-h', 'Anmelden|Einloggen');
  await see(p, '#kb', 'Telefon');
});
await check('staff-stays-uk', 'FORE', '/kabinet/team?lang=en', [402], async p => {
  await see(p, 'h1', 'Кабінет працівника');
  if (await p.getAttribute('html', 'lang') !== 'uk') throw new Error('кабінет працівника змінив мову');
});
console.log('Чужий інтерфейс → 403');
await check('denied-team-admin', 'FORE', '/kabinet/admin', [402], async (p, r) => { if (r.status() !== 403) throw new Error('статус ' + r.status()); await see(p, 'h1', 'не для вашого'); });
await check('denied-client-team', 'C1', '/kabinet/team', [402], async (p, r) => { if (r.status() !== 403) throw new Error('статус ' + r.status()); });

// Довгі списки: 450 заявок понад сторінку (200) — «Показано 200 з N», «Показати ще», пошук по всій базі, лічильники канбану «з N»
console.log('CRM: довгі списки');
{
  const ins = env.DB.db.prepare(`INSERT INTO orders (number, kind, name, phone, items, service, source, status) VALUES (?, 'lead', ?, ?, '[]', 'Ремонт квартири', 'вручну', ?)`);
  env.DB.db.exec('BEGIN');
  for (let i = 1; i <= 450; i++) ins.run('CAS-P' + String(i).padStart(4, '0'), 'Масовий ' + i, '0683' + String(i).padStart(6, '0'), i % 3 ? 'new' : 'in_work');
  env.DB.db.exec('COMMIT');
}
await check('owner-crm-pages', 'OWNER', '/kabinet/admin#crm', [1440, 402], async p => {
  const w = p.viewportSize().width, rowSel = w < 600 ? '.crm-list .kn-card' : 'table.adm tbody tr';
  const count = () => p.locator(rowSel).count();
  const until = (fn, arg, what) => p.waitForFunction(fn, arg, { timeout: 8000 }).catch(async () => { throw new Error(what + ' (підсумок: «' + (await p.textContent('[data-sum]')) + '», рядків ' + await count() + ')'); });
  const sumIs = re => until(r => { const e = document.querySelector('[data-sum]'); return !!e && new RegExp(r).test(e.textContent) && !document.querySelector('[data-list][aria-busy]'); }, re, 'очікували «' + re + '»');
  const table = async () => { await p.click('[data-v=table]'); await p.waitForSelector(rowSel); await p.waitForTimeout(350); }; // зміна вигляду — з плавним переходом
  await sumIs('Показано 200 з'); await table();
  await see(p, '[data-more]', 'Показати ще 200');
  if (await count() !== 200) throw new Error('перша сторінка: ' + await count());
  if ((await p.$eval('[data-more]', b => b.getBoundingClientRect().height)) < 43.5) throw new Error('«Показати ще» < 44 px');
  // список / таблиця: догортали до кінця — наступна сторінка вантажиться сама, екран лишається на місці (не стрибає в новий кінець
  // і не тягне одразу все)
  const y0 = await p.evaluate(() => { document.querySelector('[data-more]').scrollIntoView({ block: 'end' }); return scrollY; });
  await sumIs('Показано 400 з'); await p.waitForTimeout(500);
  if (await count() !== 400 || !(await p.$('[data-more]'))) throw new Error('після наступної сторінки екран має лишитись на місці, а не довантажити все одразу: ' + await count());
  if (Math.abs((await p.evaluate(() => scrollY)) - y0) > 4) throw new Error('екран стрибнув після довантаження');
  await p.evaluate(() => document.querySelector('[data-more]').scrollIntoView({ block: 'end' }));
  await sumIs('^\\d+ запис');
  if (await p.$('[data-more]')) throw new Error('усе завантажено, а кнопка лишилась');
  // пошук — на сервері: знаходить найстарішу заявку, якої на першій сторінці не було
  await p.reload({ waitUntil: 'networkidle' }); await sumIs('Показано 200 з'); await table();
  if (/Лід 1(?!\d)/.test(await p.textContent('[data-list]'))) throw new Error('«Лід 1» не мав бути на першій сторінці');
  await p.fill('[data-f=q]', 'Лід 1'); await sumIs('^1 запис');
  await see(p, '[data-list]', 'Лід 1');
  await p.fill('[data-f=q]', ''); await sumIs('Показано 200 з');
  // швидкий фільтр «Нові» — теж по всій базі; канбан: у заголовку колонки «200 з 3xx»
  await p.click('[data-qf=new]'); await sumIs('Показано 200 з 3\\d\\d');
  await p.click('[data-v=kanban]'); await p.waitForSelector('.kn-col[data-col=new] h3'); await p.waitForTimeout(350);
  await see(p, '.kn-col[data-col=new] h3', '200 з 3\\d\\d'); await see(p, '[data-more]');
  // канбан: сама не довантажується — лише кнопкою «Показати ще»
  await p.waitForTimeout(400); await sumIs('Показано 200 з 3\\d\\d');
  await p.click('[data-more]'); await sumIs('^3\\d\\d запис');
  if (/ з /.test(await p.textContent('.kn-col[data-col=new] h3')) || await p.$('[data-more]')) throw new Error('канбан: після «Показати ще» має бути вся колонка');
  await p.click('[data-qf=all]'); await sumIs('Показано 200 з');
  if (w < 600) await table();
});

// ===== CRM v4: задачі й таблиця контактів =====
console.log('CRM v4: задачі, таблиця контактів');
// елемент є й містить текст (чекаємо до 6 с: списки домальовуються після відповіді API)
const seeT = async (p, sel, text) => {
  try { await p.waitForFunction(([q, t]) => { const e = document.querySelector(q); return !!e && (!t || new RegExp(t).test(e.textContent)); }, [sel, text || ''], { timeout: 6000 }); }
  catch { const t = await p.textContent(sel).catch(() => null); throw new Error(`${sel}: немає «${text}» (є: «${String(t).replace(/\s+/g, ' ').trim().slice(0, 110)}»)`); }
};
// ціль дотику: на телефоні — 44 px; на ПК кнопки панелі — 36 px (як у решти CRM); min — своя межа (прапорець «виконано» — 44 px скрізь)
const box44 = async (p, sel, what, min) => {
  const lim = min || (p.viewportSize().width < 600 ? 44 : 36);
  const h = await p.$$eval(sel, els => els.filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  if (!h.length || h.some(x => x < lim - 0.5)) throw new Error(`${what}: ціль дотику < ${lim} px (${h.map(Math.round).slice(0, 4)})`);
};
// картка заявки «Лід 1» (після перевірки довгих списків вона не на першій сторінці — шукаємо на сервері)
const openLead1 = async p => {
  await p.waitForSelector('[data-f=q]'); await p.fill('[data-f=q]', 'Лід 1');
  await p.waitForFunction(() => /^1 запис/.test((document.querySelector('[data-sum]') || {}).textContent || ''), null, { timeout: 6000 });
  await p.locator('[data-list] :text("Лід 1")').first().click();
};
// вкладка «Задачі»: лічильник прострочених, групи за датою, швидке додавання (назва + Enter), прапорець ≥ 44 px, «Скасувати»
await check('owner-tasks', 'OWNER', '/kabinet/admin#tasks', W, async p => {
  const w = p.viewportSize().width;
  await seeT(p, '.adm-tabs [data-t=tasks]', 'Задачі'); await seeT(p, '.adm-tabs [data-t=tasks] .tab-n', '^[1-9]');
  await seeT(p, '[data-list] .tk-g.late', 'Прострочені'); await seeT(p, '[data-list]', 'Замовити плитку для санвузла'); await seeT(p, '[data-list]', 'Сьогодні');
  await box44(p, '.tk-chk', 'прапорець «виконано»', 44); await box44(p, '.tk-views .pill', 'перемикач'); await box44(p, '[data-add] [data-qb]', '«Додати»');
  const title = 'Купити зразки фарби ' + w;
  await p.fill('[data-add] [data-qt]', title); await p.press('[data-add] [data-qt]', 'Enter');
  await seeT(p, '[data-list]', title);
  if (await p.inputValue('[data-add] [data-qt]') !== '') throw new Error('поле швидкого додавання не очистилось');
  const t = await row('SELECT * FROM tasks WHERE title = ?', title);
  if (!t || t.status !== 'open' || !t.assignee_staff_id) throw new Error('задачу не створено собі');
  await snap4(p, 'tasks');
  // «виконано» одним дотиком → зникає з відкритих, є «Скасувати»
  await p.locator('.tk-row', { hasText: title }).locator('.tk-chk').click(); await seeT(p, '.tk-undo', 'Задачу виконано');
  await p.waitForFunction(x => ![...document.querySelectorAll('[data-list] .tk-row')].some(r => r.textContent.includes(x)), title, { timeout: 4000 });
  if ((await row('SELECT status FROM tasks WHERE id = ?', t.id)).status !== 'done') throw new Error('статус не done');
  await p.click('.tk-undo [data-undo]'); await seeT(p, '[data-list]', title);
  if ((await row('SELECT status FROM tasks WHERE id = ?', t.id)).status !== 'open') throw new Error('«Скасувати» не повернуло задачу');
  // перемикачі: «Прострочені» — лише прострочені; «Виконані» — без відкритих
  await p.click('[data-v=overdue]'); await p.waitForFunction(() => document.querySelector('[data-v=overdue]')?.getAttribute('aria-pressed') === 'true');
  await p.waitForFunction(x => !document.querySelector('[data-list]').textContent.includes(x), title);
  await seeT(p, '[data-list]', 'Замовити плитку для санвузла');
  if (await p.locator('[data-list] .tk-row:not(.late)').count()) throw new Error('серед прострочених — не прострочена');
  await p.click('[data-v=all]'); await seeT(p, '[data-list]', title);
});
// правка на місці (зі строком і виконавцем), скасування задачі; масові дії: вибрати кілька → перенести дату
await check('owner-tasks-edit', 'OWNER', '/kabinet/admin#tasks', W, async p => {
  await seeT(p, '[data-list]', 'Оновити прайс постачальників');
  if (await p.getAttribute('[data-v=all]', 'aria-pressed') !== 'true') await p.click('[data-v=all]');
  await p.locator('.tk-row', { hasText: 'Оновити прайс постачальників' }).locator('[data-edit]').click();
  await seeT(p, '.tk-edit [data-k=title]');
  await p.fill('.tk-edit [data-k=note]', 'Запитати три пропозиції'); await p.fill('.tk-edit [data-k=due_date]', kd(6)); await p.check('.tk-edit [data-k=priority]');
  await box44(p, '.tk-edit [data-save]', '«Зберегти»');
  await p.click('.tk-edit [data-save]'); await seeT(p, '[data-list]', 'Запитати три пропозиції');
  const t = await row("SELECT * FROM tasks WHERE title = 'Оновити прайс постачальників'");
  if (t.note !== 'Запитати три пропозиції' || t.due_date !== kd(6) || t.priority !== 'high') throw new Error('правка не збережена: ' + JSON.stringify([t.note, t.due_date, t.priority]));
  await p.fill('.tk-edit [data-k=due_date]', kd(4)).catch(() => {}); // форма вже закрита — нічого
  // масові дії
  await p.click('[data-pick]'); await seeT(p, '[data-list] [data-sel]');
  const a = p.locator('.tk-row', { hasText: 'Погодити дату заміру' }).locator('.tk-chk'), b = p.locator('.tk-row', { hasText: 'Зібрати відгуки після здачі' }).locator('.tk-chk');
  await a.click(); await b.click(); await seeT(p, '[data-bulk]', 'Вибрано: 2');
  await box44(p, '[data-bulk] .btn', 'кнопки масових дій');
  await p.fill('[data-bulk] [data-bdate]', kd(9)); p.once('dialog', d => d.accept()); await p.click('[data-bulk] [data-bmove]');
  await p.waitForFunction(() => document.querySelector('[data-bulk]').hidden, null, { timeout: 4000 });
  const moved = (await env.DB.prepare("SELECT due_date FROM tasks WHERE title IN ('Погодити дату заміру', 'Зібрати відгуки після здачі')").all()).results.map(r => r.due_date);
  if (moved.join() !== [kd(9), kd(9)].join()) throw new Error('дату не перенесено: ' + moved);
  await p.fill('[data-f=q]', 'заміру'); await p.waitForFunction(() => document.querySelectorAll('[data-list] .tk-row').length === 1, null, { timeout: 4000 });
  await p.fill('[data-f=q]', ''); await p.waitForFunction(() => document.querySelectorAll('[data-list] .tk-row').length > 3);
});
// картка заявки: блок «Задачі» з задачами цієї заявки, швидке додавання не закриває й не «бруднить» картку
await check('owner-lead-tasks', 'OWNER', '/kabinet/admin#crm', W, async p => {
  const w = p.viewportSize().width;
  await openLead1(p);
  await seeT(p, 'dialog[open] [data-tasks]', 'Надіслати КП по ремонту квартири');
  if (/Замовити плитку/.test(await p.textContent('dialog[open] [data-tasks]'))) throw new Error('у картці — задача іншої привʼязки');
  const title = 'Уточнити площу квартири ' + w;
  await p.fill('dialog[open] [data-tasks] [data-qt]', title); await p.press('dialog[open] [data-tasks] [data-qt]', 'Enter');
  await seeT(p, 'dialog[open] [data-tasks] [data-list]', title);
  if (!(await p.$('dialog[open]'))) throw new Error('Enter у задачі закрив картку заявки');
  const t = await row('SELECT order_id FROM tasks WHERE title = ?', title);
  if (!t || t.order_id !== LEAD1) throw new Error('задачу не привʼязано до заявки');
  await box44(p, 'dialog[open] [data-tasks] .tk-chk', 'прапорець у картці', 44);
  { const over = await p.$eval('dialog[open]', d => d.scrollWidth - d.clientWidth); if (over > 2) throw new Error(`картка заявки гортається вбік на ${over}px`); }
  await p.locator('dialog[open] [data-tasks] .tk-chk').first().scrollIntoViewIfNeeded(); await snap4(p, 'lead-tasks');
  let asked = false; p.once('dialog', d => { asked = true; d.accept(); });
  await p.click('dialog[open] button.x'); await p.waitForTimeout(300);
  if (asked) throw new Error('додавання задачі позначило картку заявки зміненою');
  if (await p.$('dialog[open]')) throw new Error('картка не закрилась');
});
// картки обʼєкта й контакту: той самий блок
await check('owner-project-tasks', 'OWNER', '/kabinet/admin#projects', [1440], async p => {
  await seeT(p, '#admView', 'Квартира, тестовий обʼєкт'); await p.locator('tr.clk', { hasText: 'Квартира, тестовий обʼєкт' }).first().click();
  await seeT(p, '[data-gtk]', 'Замовити плитку для санвузла'); await seeT(p, '[data-gtk] [data-qst]', 'Чорнові роботи');
});
// контакти: режим «Таблиця» — вкладки типів з лічильниками, сортування, правка клітинки, вибір колонок, гортання лише всередині таблиці
await check('owner-contacts-table', 'OWNER', '/kabinet/admin#partners', W, async p => {
  const w = p.viewportSize().width;
  await p.waitForSelector('[data-mode=table]'); await p.click('[data-mode=table]');
  await seeT(p, '[data-ctbl]', 'Андрій Електрик'); await seeT(p, '[data-ty=master]', 'Майстри\\s*[2-9]'); await seeT(p, '[data-ty=supplier]', 'Постачальники');
  const names = () => p.$$eval('[data-ctbl] tbody tr[data-id] td[data-c=name] [data-v]', e => e.map(x => x.textContent.trim()).filter(Boolean));
  // сортування за містом: asc → desc
  await p.click('[data-s=city]'); await p.waitForSelector('th[aria-sort=ascending] [data-s=city]');
  const c1 = await p.$$eval('[data-ctbl] tbody tr[data-id] td[data-c=city]', e => e.map(x => x.textContent.trim()).filter(Boolean));
  if (c1.join() !== c1.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join()) throw new Error('місто не за зростанням: ' + c1);
  await p.click('[data-s=city]'); await p.waitForSelector('th[aria-sort=descending] [data-s=city]');
  await p.click('[data-s=name]'); await p.waitForSelector('th[aria-sort=ascending] [data-s=name]');
  // закріплений заголовок і гортання лише всередині таблиці
  if (await p.$eval('[data-ctbl] thead th', th => getComputedStyle(th).position) !== 'sticky') throw new Error('заголовок таблиці не закріплено');
  if (w < 600 && !(await p.$eval('.ct-wrap', e => e.scrollWidth > e.clientWidth + 20))) throw new Error('на телефоні таблиця має гортатись усередині себе');
  // вкладка типу
  await p.click('[data-ty=master]'); await p.waitForFunction(() => document.querySelector('[data-ty=master]')?.getAttribute('aria-pressed') === 'true' && !/Тестові вікна/.test(document.querySelector('[data-ctbl]').textContent));
  { const nm = await names(); if (!nm.includes('Андрій Електрик (тест)') || !nm.includes('Віра Плиточниця (тест)') || nm.some(x => /Ріелторка|Партнер|Підрядник/.test(x))) throw new Error('майстри: ' + nm); }
  const town = w === 402 ? 'Вишгород' : 'Буча', tel = w === 402 ? '9' : '8';
  // правка клітинки на місці (місто) — Enter зберігає; телефон нормалізується
  const cell = p.locator('tr[data-id]', { hasText: 'Віра Плиточниця' }).locator('td[data-c=city]');
  await cell.click(); await p.fill('td.editing input', town); await p.press('td.editing input', 'Enter');
  await p.waitForFunction(t => !document.querySelector('td.editing') && [...document.querySelectorAll('td[data-c=city]')].some(td => td.textContent.trim() === t), town, { timeout: 4000 });
  if ((await row("SELECT city FROM partners WHERE name LIKE 'Віра Плиточниця%'")).city !== town) throw new Error('клітинку не збережено');
  const ph = p.locator('tr[data-id]', { hasText: 'Андрій Електрик' }).locator('td[data-c=phone]');
  await ph.click(); await p.fill('td.editing input', '067 000 11 9' + tel); await p.press('td.editing input', 'Enter');
  await p.waitForFunction(t => [...document.querySelectorAll('td[data-c=phone]')].some(td => td.textContent.includes('+38067000119' + t)), tel, { timeout: 4000 });
  // Esc — без змін
  await cell.click(); await p.fill('td.editing input', 'Не зберігати'); await p.press('td.editing input', 'Escape');
  if (await p.$('td.editing')) throw new Error('Esc не закрив клітинку');
  if ((await row("SELECT city FROM partners WHERE name LIKE 'Віра Плиточниця%'")).city !== town) throw new Error('Esc зберіг зміну');
  // вибір колонок запамʼятовується
  await p.click('.ct-cols summary'); await p.uncheck('[data-col=notes]'); await p.waitForFunction(() => !document.querySelector('[data-s=notes]'));
  await p.reload({ waitUntil: 'networkidle' }); await seeT(p, '[data-ctbl]', 'Андрій Електрик');
  if (await p.$('[data-s=notes]')) throw new Error('вибір колонок не запамʼятався');
  await p.click('.ct-cols summary'); await p.check('[data-col=notes]'); await p.waitForSelector('[data-s=notes]'); await p.click('.ct-cols summary');
  // швидке додавання рядка
  await p.fill('[data-newrow] [data-n=name]', 'Жанна Нова (тест) ' + w); await p.fill('[data-newrow] [data-n=phone]', '06700012' + (w === 402 ? '01' : '02')); await p.press('[data-newrow] [data-n=phone]', 'Enter');
  await seeT(p, '[data-ctbl]', 'Жанна Нова \\(тест\\) ' + w);
  if ((await row('SELECT type FROM partners WHERE name = ?', 'Жанна Нова (тест) ' + w)).type !== 'master') throw new Error('новий рядок — не з типом відкритої вкладки');
  await p.click('[data-ty=""]'); await seeT(p, '[data-ctbl]', 'Тестові вікна');
  await box44(p, '[data-ctbl] thead th button', 'заголовок-сортування'); await box44(p, '.ct-tb [data-imp]', '«Імпорт CSV»');
  await snap4(p, 'contacts-table');
  // масова дія: місто для двох вибраних
  await p.locator('tr[data-id]', { hasText: 'Дарина Ріелторка' }).locator('[data-sel]').check(); await p.locator('tr[data-id]', { hasText: 'Єгор Партнер' }).locator('[data-sel]').check();
  await seeT(p, '[data-bulk]', 'Вибрано: 2'); await p.fill('[data-bcity]', 'Ірпінь'); p.once('dialog', d => d.accept()); await p.click('[data-bcgo]');
  await p.waitForFunction(() => [...document.querySelectorAll('td[data-c=city]')].filter(td => td.textContent.trim() === 'Ірпінь').length === 2, null, { timeout: 4000 });
  if (!(await p.$('[data-csv][href*="format=csv"][href*="sort=name"]'))) throw new Error('CSV має брати поточний фільтр і сортування');
  await p.click('[data-mode=list]'); await seeT(p, '[data-ptbl]', 'Тестові вікна'); await p.click('[data-mode=table]'); await seeT(p, '[data-ctbl]');
});
// імпорт CSV: файл → зіставлення колонок (вгадано з заголовків) → попередній перегляд (новий / дубль / помилка) → імпорт лише нових
await check('owner-contacts-import', 'OWNER', '/kabinet/admin#partners', W, async p => {
  const w = p.viewportSize().width, u = w === 402 ? '41' : '42';
  await p.waitForSelector('[data-mode]'); if (!(await p.$('[data-ctbl]'))) await p.click('[data-mode=table]');
  await seeT(p, '[data-ctbl]', 'Андрій Електрик'); await p.click('[data-imp]'); await seeT(p, 'dialog.c4-imp[open]', 'Імпорт контактів з CSV');
  const csv = '﻿Імʼя;Телефон;Місто;Спеціалізація;Тип\r\n' +
    `Захар Сантехнік (тест ${w});067 000 ${u} 01;Київ;"сантехніка, опалення";Майстер\r\n` +
    'Дарина та сама;+38 (067) 000-11-05;Київ;;\r\n' +
    `Ілля Маляр (тест ${w});067000${u}02;Буча;малярні роботи;\r\n` +
    'Кривий номер;12-34;Київ;;\r\n';
  await p.setInputFiles('dialog.c4-imp [data-file]', { name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await seeT(p, 'dialog.c4-imp', 'зіставте колонки');
  const map = await p.$$eval('dialog.c4-imp [data-m]', e => e.map(x => x.value));
  if (map.join() !== 'name,phone,city,tags,type') throw new Error('колонки не вгадано: ' + map);
  await p.selectOption('dialog.c4-imp [data-dt]', 'crew');
  await p.click('dialog.c4-imp [data-go]'); await seeT(p, 'dialog.c4-imp [data-psum]', 'Буде додано: 2');
  const t = await p.textContent('dialog.c4-imp');
  if (!/дублів \(пропустимо\): 1/.test(t) || !/з помилками \(пропустимо\): 1/.test(t) || !/вже є: Дарина Ріелторка/.test(t) || !/помилка: Телефон: некоректний номер/.test(t)) throw new Error('попередній перегляд: ' + t.replace(/\s+/g, ' ').slice(0, 300));
  if (await row('SELECT 1 FROM partners WHERE name LIKE ?', `Захар Сантехнік (тест ${w})`)) throw new Error('перевірка вже записала рядок');
  await snap4(p, 'import-preview');
  await p.click('dialog.c4-imp [data-imp]'); await seeT(p, 'dialog.c4-imp [data-pdone]', 'Додано: 2');
  await p.click('dialog.c4-imp [data-x]'); await seeT(p, '[data-ctbl]', `Захар Сантехнік \\(тест ${w}\\)`);
  const a = await row('SELECT * FROM partners WHERE name = ?', `Захар Сантехнік (тест ${w})`), b = await row('SELECT * FROM partners WHERE name = ?', `Ілля Маляр (тест ${w})`);
  if (a.type !== 'master' || a.phone !== `+38067000${u}01` || a.tags !== '["сантехніка","опалення"]' || b.type !== 'crew' || b.city !== 'Буча') throw new Error('імпорт: ' + JSON.stringify([a.type, a.phone, a.tags, b.type, b.city]));
  if (await p.$('dialog.c4-imp')) throw new Error('діалог імпорту не закрився');
});
// менеджер: ті самі задачі й таблиця; працівник (прораб): «Задачі» — лише свої, «виконано» з коментарем, повернення
await check('manager-tasks', 'MGR', '/kabinet/admin#tasks', [402], async p => { await seeT(p, '[data-list]', 'Замовити плитку для санвузла'); await seeT(p, '[data-add] [data-qt]'); });
await check('team-todo', 'FORE', '/kabinet/team#todo', W, async p => {
  const w = p.viewportSize().width, title = 'Передзвонити прорабу ' + w;
  await seeT(p, '.tm-nav', 'Задачі'); await seeT(p, '#tmView', title);
  const txt = await p.textContent('#tmView');
  if (/Надіслати КП|Погодити дату заміру|Зібрати відгуки/.test(txt)) throw new Error('видно чужі задачі');
  await box44(p, '.tm-cb', 'прапорець «виконано»', 44);
  await snap4(p, 'team-todo');
  await p.locator('.tm-todo', { hasText: title }).locator('.tm-cb').click();
  await seeT(p, '#tmSheet[open]', 'Задачу виконано\\?'); await p.fill('#tmSheet textarea', 'Домовились на завтра о 10:00');
  await p.click('#tmSheet button[type=submit]'); await p.waitForFunction(() => !document.querySelector('#tmSheet[open]'), null, { timeout: 4000 });
  await p.waitForFunction(x => ![...document.querySelectorAll('#tmView > .tm-todos > .tm-todo')].some(e => e.textContent.includes(x)) && !!document.querySelector('.tm-more'), title, { timeout: 5000 });
  const t = await row('SELECT status, done_note, done_by FROM tasks WHERE title = ?', title);
  if (t.status !== 'done' || t.done_note !== 'Домовились на завтра о 10:00' || t.done_by !== fore.id) throw new Error('не виконано: ' + JSON.stringify(t));
  await p.click('.tm-more summary'); await seeT(p, '.tm-more', 'Мій коментар: Домовились на завтра');
  // «Сьогодні»: прострочена задача прораба з кнопкою «Виконано»
  await p.click('.tm-nav [data-v=today]'); await seeT(p, '#tmView', 'Замовити плитку для санвузла'); await seeT(p, '#tmView [data-gdone]', 'Виконано');
});

await browser.close(); server.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL OK');
process.exit(fails ? 1 : 0);
