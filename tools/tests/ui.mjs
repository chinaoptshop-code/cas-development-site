// Playwright: три інтерфейси CRM (майстер-панель /kabinet/admin, кабінет працівника /kabinet/team, кабінет клієнта
// /kabinet/obiekt) на ширинах 402 і 1440 без JS-помилок і CSP-порушень + 403-сторінка для чужого інтерфейсу.
// API — справжні обробники functions/ через стенд tools/tests/harness.mjs (node:sqlite, мок Telegram), статичні файли — з репозиторію
// з CSP із _headers. Зовнішні запити (Clarity, Telegram, Google) блокуються.
//   node tools/tests/ui.mjs [--shots <тека>]     (скріни JPEG, стиснуті; без --shots — не зберігаються)
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
const ck = {};
for (const [k, id] of Object.entries({ OWNER, MGR, FORE, C1 })) ck[k] = await login(env, id);
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
async function check(label, who, path, widths, expect) {
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
  if (text) { const t = await page.textContent(sel); if (!new RegExp(text).test(t)) throw new Error(`${sel}: немає «${text}»`); }
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
});
await check('owner-crm-finder', 'OWNER', '/kabinet/admin#crm', [1440], async p => {
  await see(p, '#admView', 'Лід 1');
  await p.selectOption('[data-f=place]', 'finder'); await p.waitForTimeout(600);
  const t = await p.textContent('[data-list]');
  if (!/@test_author/.test(t) || /Лід 1/.test(t)) throw new Error('фільтр «Бот пошуку» не працює');
  await p.selectOption('[data-f=place]', '');
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
  if (!/Партнери/.test(await p.textContent('.adm-tabs'))) throw new Error('менеджер не бачить «Партнери»');
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
console.log('Кабінет клієнта');
await check('client-object', 'C1', '/kabinet/obiekt', W, async p => {
  await see(p, 'main', 'Квартира, тестовий обʼєкт');
  const t = await p.textContent('main');
  if (/Протікає стояк|Олег \(прораб\)/.test(t)) throw new Error('клієнт бачить внутрішні поля (проблема/працівник)');
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

await browser.close(); server.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL OK');
process.exit(fails ? 1 : 0);
