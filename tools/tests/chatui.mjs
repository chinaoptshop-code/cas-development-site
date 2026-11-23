// Playwright: чат на сайті (assets/chat.v1.{js,css}, завантажувач у site-chrome.v1.js, вкладка «Чат» адмінки assets/admin/chat.v1.js).
// Сторінки — з репозиторію з CSP і Permissions-Policy з _headers; API — справжні обробники functions/ через стенд harness.mjs (node:sqlite, мок
// Telegram, фейковий R2); «воркер Mac mini» — виклики /api/bot/chat з цього скрипту. Зовнішні запити блокуються.
//   node tools/tests/chatui.mjs [--shots <тека>]     (PNG deviceScaleFactor 2; без --shots — не зберігаються)
// Перевіряє: CHAT_PUBLIC = True (з 23.11.2026) — кружечок бота поруч із кружечком дзвінка (телефон) та іконка в рядах месенджерів, модуль і панель
// лише після тапу; сторінка без розмітки чату (як при False) + ?chat=1 — JS додає кружечок і іконки; меню дзвінка — 5 іконок; 402 і 1440; ліміти (лічильник, «далі менеджер»);
// текст, відповідь бота з розрахунком і голосом, файл, запис голосу, номер → заявка, офлайн, ar (RTL) і en, клавіатура (Esc, Tab у межах панелі),
// без горизонтальної прокрутки, JS-помилок і порушень CSP; текст із розміткою ніде не стає розміткою (віконце й адмінка).
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { ROOT, addClient, call, freshDB, login, makeEnv } from './harness.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `${name}-${page.viewportSize().width}.png`) }); };

const KEY = 'test-leadbot-key-0123456789abcdef'; // фіктивний ключ лише для тестів
const R2 = new Map();
const env = makeEnv(freshDB(), { LEADBOT_KEY: KEY, CHAT_IP_STARTS: '100', /* усі запити стенду — з однієї адреси */ MEDIA: { async put(k, v) { R2.set(k, new Uint8Array(v)); }, async get(k) { return R2.has(k) ? { body: R2.get(k) } : null; }, async delete(k) { R2.delete(k); } },
  ASSETS: { fetch: async req => new Response(readFileSync(join(ROOT, new URL(req.url).pathname.slice(1) + '.html')), { headers: { 'content-type': 'text/html' } }) } });
const OWNER = await addClient(env, { id: 111, name: 'Михайло' });
const ckOwner = await login(env, OWNER);
await call(env, 'GET', '/api/me', { cookie: ckOwner });
const bot = (m, p, body) => call(env, m, p, { body, headers: { 'x-bot-key': KEY, noOrigin: true, ip: '10.200.0.9' } });
const ping = () => bot('POST', '/api/bot/chat/ping', {});
const TAG = '"><img src=x onerror="window.__xss=1" data-xss><svg onload="window.__xss=1" data-xss></svg>';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(300)]);

// ===== сервер =====
const H = readFileSync(join(ROOT, '_headers'), 'utf8');
const headerOf = (path, name) => {
  const blocks = H.split(/\n(?=\/)/).map(b => b.split('\n')).filter(b => b[0] && b[0].startsWith('/'));
  const out = [];
  for (const [rule, ...lines] of blocks) {
    const re = new RegExp('^' + rule.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (!re.test(path)) continue;
    if (lines.some(l => new RegExp('^\\s*! ' + name).test(l))) out.length = 0;
    for (const l of lines) { const m = l.match(new RegExp('^\\s*' + name + ':\\s*(.+)$')); if (m) out.push(m[1]); }
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
let BASE;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const chunks = []; for await (const c of req) chunks.push(c);
    if (u.pathname.startsWith('/api/')) {
      const raw = chunks.length ? Buffer.concat(chunks) : null;
      const headers = {};
      for (const k of ['content-type', 'x-chat-sid', 'x-chat-token', 'x-file-name']) if (req.headers[k]) headers[k] = req.headers[k];
      if (req.headers.origin) headers.origin = req.headers.origin === BASE ? 'https://cas-develop.com' : req.headers.origin; else headers.noOrigin = true;
      const r = await call(env, req.method, u.pathname + u.search, { cookie: req.headers.cookie || '', raw: raw && raw.length ? new Uint8Array(raw) : null, headers });
      const h = {}; r.headers.forEach((v, k) => { if (!/content-length|content-encoding/.test(k)) h[k] = v; });
      // байти як є (файли й аудіо)
      res.writeHead(r.status, h); return res.end(r.buf ? Buffer.from(r.buf) : r.text);
    }
    let status = 200, body = null;
    if (u.pathname.startsWith('/kabinet')) {
      const r = await call(env, 'GET', u.pathname, { cookie: req.headers.cookie || '' });
      if (r.status !== 200 || !r.headers.get('x-static')) { status = r.status; body = r.text; }
    }
    const f = body == null && staticFile(u.pathname);
    if (body == null && !f) { res.writeHead(404); return res.end('404'); }
    const headers = { 'content-type': f ? MIME[extname(f)] || 'application/octet-stream' : 'text/html; charset=utf-8' };
    if (!f || extname(f) === '.html') {
      const csp = headerOf(u.pathname, 'Content-Security-Policy'); if (csp.length) headers['content-security-policy'] = csp.join(', ');
      const pp = headerOf(u.pathname, 'Permissions-Policy'); if (pp.length) headers['permissions-policy'] = pp[pp.length - 1];
    }
    res.writeHead(status, headers); res.end(body != null ? body : readFileSync(f));
  } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e && e.stack || e)); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0, passed = 0;
const step = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n      ')); }
};
const ok = (v, m) => { if (!v) throw new Error(m || 'умова не виконана'); };
async function ctxOf(w, { lang = 'uk-UA', cookie } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 874 : 900 }, deviceScaleFactor: 2, isMobile: w < 600, hasTouch: w < 600, locale: lang, permissions: ['microphone'] });
  if (cookie) { const [name] = cookie.split('='); await ctx.addCookies([{ name, value: cookie.slice(name.length + 1), url: BASE }]); }
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('JS: ' + e.message));
  page.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/.test(t)) errs.push('CSP: ' + t); else if (m.type() === 'error' && !/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource|ERR_ABORTED/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', e => console.error('Refused to (CSP) ' + e.violatedDirective + ' ' + e.blockedURI)); });
  return { ctx, page, errs };
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function openChat(page, w) {
  if (w < 768) {
    await page.click('.mbar[data-one] > a.mb-bot[data-chat]');   // кружечок бота поруч із кружечком дзвінка (Михайло 23.11.2026)
  } else {
    const a = page.locator('.scf-soc a[data-chat]');
    await a.scrollIntoViewIfNeeded();
    await a.click();
  }
  await page.waitForSelector('.cht:not([hidden])');
}
const xssFree = page => page.evaluate(() => !document.querySelector('[data-xss]') && !window.__xss);

for (const w of [402, 1440]) {
  console.log(`\nЧат на сайті — ${w} px`);
  const { ctx, page, errs } = await ctxOf(w);
  await env.DB.prepare("DELETE FROM settings WHERE key = 'chat_bot_ping'").run(); // воркер ще не пінгував
  await step('CHAT_PUBLIC = True: іконка в рядах месенджерів і (телефон) кружечок бота поруч із кружечком дзвінка; модуль і панель — лише після тапу', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    for (const sel of ['.scf-soc a[data-chat]', '.sch-mmsg a[data-chat]', '.mbar[data-one] > a.mb-bot[data-chat]']) ok(await page.$(sel), 'немає ' + sel);
    ok(!(await page.$('.mb-menu a[data-chat]')), 'у меню дзвінка іконки чату вже немає (окремий кружечок)');
    ok((await page.getAttribute('.scf-soc a[data-chat]', 'href')) === '#zayavka', 'без JS — до форми заявки');
    ok(!(await page.evaluate(() => [...document.scripts].some(s => /chat\.v1\.js/.test(s.src)))), 'модуль завантажено без потреби');
    ok(!(await page.$('.cht')), 'панель відкрилась сама');
    const a = await page.$('.scf-soc a[data-chat]');
    ok(/Чат/.test(await a.getAttribute('aria-label')) && await a.getAttribute('title'), 'aria-label/title');
    const box = await a.boundingBox(); ok(box.width >= 44 && box.height >= 44, 'іконка ≥ 44 px: ' + JSON.stringify(box));
    if (w >= 768) {
      ok(!(await page.isVisible('.mbar')), 'на ПК кружечків немає');
      await page.locator('.scf-soc').scrollIntoViewIfNeeded(); await shot(page, 'chat-icon-footer');
    } else {
      const c = await page.$$eval('.mbar[data-one] > .mb-bot, .mbar[data-one] > .mb-tg', xs => xs.map(x => ({ c: x.className, l: x.getAttribute('aria-label'), r: x.getBoundingClientRect().toJSON() })));
      ok(c.length === 2 && c[0].c === 'mb-bot' && c[1].c === 'mb-tg', 'бот, потім дзвінок: ' + JSON.stringify(c));
      ok(c.every(x => x.r.width >= 44 && x.r.height >= 44 && Math.abs(x.r.width - x.r.height) < 1 && x.r.left >= 0 && x.r.right <= w && x.l), 'кружечки ≥ 44 px у межах екрана з aria-label');
      ok(c[0].r.right <= c[1].r.left - 4 && Math.abs(c[0].r.top - c[1].r.top) < 1, 'кружечки не перекриваються, в один ряд');
      await page.click('.mbar[data-one] .mb-tg'); await page.waitForTimeout(250);
      ok((await page.getAttribute('.mbar[data-one] .mb-tg', 'aria-expanded')) === 'true', 'aria-expanded');
      // 5 іконок (дзвінок, Telegram, WhatsApp, Viber, WeChat) — в один ряд, кожна ≥ 44 px, меню в межах екрана
      const ic = await page.$$eval('.mb-menu a:not(.mb-lead)', xs => xs.map(x => x.getBoundingClientRect().toJSON()));
      ok(ic.length === 5, 'іконок у меню: ' + ic.length);
      ok(ic.every(r => Math.abs(r.top - ic[0].top) < 1 && r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= w), 'не в один ряд / < 44 px: ' + JSON.stringify(ic.map(r => [r.left, r.top, r.width])));
      await shot(page, 'chat-icon-pill'); await page.click('.mbar[data-one] .mb-tg');
    }
  });
  await step('сторінка без розмітки чату (як при CHAT_PUBLIC = False) + ?chat=1: JS додає кружечок бота й іконки; режим запамʼятовується', async () => {
    await page.route(BASE + '/services', async r => {
      const html = readFileSync(join(ROOT, 'services.html'), 'utf8').replace(/<a class="(?:mb-bot|bi bi-chat)"[^>]*data-chat[^>]*><\/a>\n?/g, '');
      await r.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': headerOf('/services', 'Content-Security-Policy').join(', ') }, body: html });
    });
    await page.goto(BASE + '/services', { waitUntil: 'networkidle' });
    ok(!(await page.$('a[data-chat]')), 'без ?chat=1 і без розмітки — чату немає');
    await page.goto(BASE + '/?chat=1', { waitUntil: 'networkidle' });
    // режим перевірки запамʼятовується на наступних сторінках вкладки
    await page.goto(BASE + '/services', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    ok(await page.$('.scf-soc a[data-chat]'), 'sessionStorage cas_chat');
    if (w < 768) ok(await page.$('.mbar[data-one] > a.mb-bot[data-chat]'), 'кружечок бота додав JS');
    await page.unroute(BASE + '/services');
  });
  await step('тап по іконці → панель: dialog, фокус у полі, дисклеймер, привітання, офлайн, без горизонтальної прокрутки', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await openChat(page, w);
    await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('cht-in'), null, { timeout: 3000 }).catch(() => {});
    const d = await page.$eval('.cht', e => ({ role: e.getAttribute('role'), modal: e.getAttribute('aria-modal'), focus: document.activeElement && document.activeElement.className, r: e.getBoundingClientRect().toJSON(), fs: getComputedStyle(e.querySelector('.cht-in')).fontSize }));
    ok(d.role === 'dialog' && d.modal === 'true', 'role'); ok(/cht-in/.test(d.focus), 'фокус: ' + d.focus); ok(parseFloat(d.fs) >= 16, 'поле ≥ 16 px');
    if (w < 768) ok(d.r.width >= w - 1 && d.r.height >= 800, 'телефон — на весь екран ' + JSON.stringify(d.r));
    else ok(d.r.width >= 380 && d.r.width <= 420 && d.r.right <= w, 'ПК — картка 380–420 px у куті ' + JSON.stringify(d.r));
    ok(/AI-помічник/.test(await page.textContent('.cht-disc')));
    ok(await page.isVisible('.cht-off'), 'воркер ще не пінгував — офлайн');
    ok(await noHScroll(page), 'горизонтальна прокрутка');
    ok(!(await page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden')), 'overflow:hidden на <html>');
    for (const b of await page.$$('.cht .cht-ib, .cht .btn, .cht-lv')) { const bb = await b.boundingBox(); if (bb && bb.width) ok(bb.width >= 43.9 && bb.height >= 43.9, 'кнопка < 44 px: ' + (await b.getAttribute('class')) + ' ' + JSON.stringify(bb)); }
    await shot(page, 'chat-offline');
  });
  await step('Esc закриває й повертає фокус на іконку; Tab не виходить з панелі', async () => {
    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
    ok(await page.evaluate(() => !!document.activeElement.closest('.cht')), 'фокус вийшов з панелі');
    await page.keyboard.press('Escape');
    ok(await page.isHidden('.cht'), 'не закрилась');
    ok(await page.evaluate(() => !!document.activeElement.closest('[data-chat],.mbar')), 'фокус не повернувся: ' + await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
  });
  let sid;
  await step('текст → бульбашка; «воркер» відповідає з розрахунком і голосом → таблиця й плеєр (без автозапуску)', async () => {
    await ping();
    await openChat(page, w);
    await page.waitForFunction(() => document.querySelector('.cht-off').hidden);
    await page.fill('.cht-in', 'Ремонт квартири 60 м² у Києві ' + TAG);
    if (w >= 768) await page.keyboard.press('Enter'); else await page.click('.cht-send');
    await page.waitForSelector('.cht-me');
    ok((await page.textContent('.cht-me .cht-t')).includes('<img'), 'текст відвідувача — як текст');
    const q = await bot('GET', '/api/bot/chat?limit=5');
    const it = q.data.items[0]; ok(it && it.pending.length === 1, 'черга'); sid = it.sid;
    await page.waitForSelector('.cht-typing:not([hidden])', { timeout: 6000 });
    const est = { currency: 'USD', region: 'ua', lines: [{ label: 'Ремонт під ключ (роботи + чорнові матеріали) ' + TAG, qty: 60, unit: 'м²', rate: 550, from: 33000 },
      { label: 'Дизайн-проєкт інтерʼєру', qty: 60, unit: 'м²', rate: 30, from: 2500, note: 'мінімум $2 500' }, { label: 'Меблі й техніка', from: null }], total_from: 35500,
      note: 'Розрахунок попередній: точна сума — після заміру й кошторису.' };
    const r = await bot('POST', '/api/bot/chat', { sid, reply_to: it.last_user_id, text: 'Орієнтовно від $35 500 за ремонт і дизайн ' + TAG, estimate: est, audio: { mime: 'audio/ogg', data: OGG.toString('base64'), dur: 12 } });
    ok(r.status === 200, JSON.stringify(r.data));
    await page.waitForSelector('.cht-bot[data-id] .cht-est table', { timeout: 15000 });
    const tx = await page.textContent('.cht-est');
    ok(/від \$33 000/.test(tx) && /\$550\/м²/.test(tx) && /за кошторисом/.test(tx) && /від \$35 500 \(≈/.test(tx), 'формат цін: ' + tx);
    ok(await page.isVisible('.cht-bot .cht-play'), 'плеєр');
    ok(/Голосова відповідь/.test(await page.textContent('.cht-bot .cht-pll')));
    ok(!(await page.evaluate(() => [...document.querySelectorAll('audio')].some(a => !a.paused))), 'автозапуск');
    ok(await xssFree(page), 'XSS у віконці');
    await page.$eval('.cht-log', e => { e.scrollTop = e.scrollHeight; });
    await shot(page, 'chat-estimate');
  });
  await step('файл: вибір → прогрес → чип → надіслати → фото в бульбашці; імʼя з розміткою — текстом', async () => {
    await page.setInputFiles('.cht-f input[type=file]', { name: 'план "<b>x</b>".png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('.cht-att-i.ok');
    await shot(page, 'chat-attach');
    await page.click('.cht-send');
    await page.waitForSelector('.cht-me .cht-img, .cht-me .cht-file', { timeout: 6000 });
    ok(await xssFree(page));
  });
  await step('непідтримуваний тип і завеликий файл — зрозуміле повідомлення з Telegram / WhatsApp', async () => {
    await page.setInputFiles('.cht-f input[type=file]', { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<b>x</b>') });
    await page.waitForSelector('.cht-err');
    ok(/тип файлу/.test(await page.textContent('.cht-err:last-of-type')));
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(60 * 1048576)], 'huge.pdf', { type: 'application/pdf' })); const i = document.querySelector('.cht-f input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => [...document.querySelectorAll('.cht-err')].some(e => /Telegram/.test(e.textContent) && e.querySelector('a[href^="https://t.me/"]')));
  });
  await step('запис голосу: мікрофон → таймер → скасувати; «Зупинити й надіслати» — голосове в розмові', async () => {
    ok(await page.$('.cht-mic'), 'кнопки мікрофона немає');
    await page.click('.cht-mic');
    await page.waitForSelector('.cht-rec:not([hidden])');
    await page.waitForTimeout(1300);
    ok(/0:0[1-9]/.test(await page.textContent('.cht-rt')), 'таймер');
    await shot(page, 'chat-recording');
    await page.click('.cht-rc');
    await page.waitForSelector('.cht-rec', { state: 'hidden' });
    const n = await page.$$eval('.cht-me', x => x.length);
    await page.click('.cht-mic'); await page.waitForSelector('.cht-rec:not([hidden])'); await page.waitForTimeout(1200); await page.click('.cht-rs');
    await page.waitForFunction(k => document.querySelectorAll('.cht-me').length > k, n, { timeout: 8000 });
    ok(await page.$('.cht-me:last-of-type .cht-play'), 'голосове — плеєр у бульбашці');
  });
  await step('ліміти: лічильник символів з 80 % межі; задовге — зрозуміле повідомлення, не надсилається', async () => {
    await page.fill('.cht-in', 'а'.repeat(1500));
    ok(await page.isHidden('.cht-cnt'), 'до 80 % — без лічильника');
    await page.fill('.cht-in', 'а'.repeat(1700));
    ok(await page.isVisible('.cht-cnt') && /1700 \/ 2000/.test(await page.textContent('.cht-cnt')), 'лічильник');
    await page.fill('.cht-in', 'а'.repeat(2100));
    ok(await page.$eval('.cht-cnt', e => e.classList.contains('over')), 'понад межу — червоний');
    const n = await page.$$eval('.cht-me', x => x.length);
    await page.click('.cht-send');
    await page.waitForFunction(() => [...document.querySelectorAll('.cht-err')].some(e => /задовге — до 2000/.test(e.textContent)));
    ok((await page.$$eval('.cht-me', x => x.length)) === n, 'не надіслано');
    await page.fill('.cht-in', '');
  });
  await step('ліміт розмови (handoff limit від воркера): «Далі вам відповість менеджер», месенджери, рядок номера відкритий', async () => {
    const n0 = await page.$$eval('.cht-me', x => x.length);
    await page.fill('.cht-in', 'Ще одне питання');
    await page.click('.cht-send');
    await page.waitForFunction(k => document.querySelectorAll('.cht-me').length > k, n0);
    await page.waitForTimeout(300);
    const it = (await bot('GET', '/api/bot/chat?limit=5')).data.items.find(x => x.sid === sid);
    ok(it, 'розмова в черзі');
    const r = await bot('POST', '/api/bot/chat', { sid, reply_to: it.last_user_id, handoff: true, handoff_reason: 'limit', reason: 'бюджет воркера (тест)' });
    ok(r.status === 200 && r.data.limit === 'conv', JSON.stringify(r.data));
    await page.waitForSelector('.cht-off.cht-lim:not([hidden])', { timeout: 15000 });
    ok(/Далі вам відповість менеджер/.test(await page.textContent('.cht-off')));
    ok(await page.$('.cht-off a[href^="https://t.me/"]') && await page.$('.cht-off a[href^="viber://"]'), 'месенджери');
    ok(await page.isVisible('.cht-pf'), 'рядок номера відкритий');
    ok(/Далі вам відповість менеджер/.test(await page.textContent('.cht-sys:not(.cht-err)')), 'системне повідомлення сайту');
    ok(!(await bot('GET', '/api/bot/chat?limit=5')).data.items.some(x => x.sid === sid), 'бот більше не отримує розмову');
    await shot(page, 'chat-limit');
  });
  await step('«Залишити номер» → заявка CRM (source=chat) і «Дякуємо» в розмові', async () => {
    if (await page.isHidden('.cht-pf')) await page.click('.cht-lv'); // після ліміту рядок уже відкритий
    await page.fill('.cht-pf input', '+380 67 000 00 0' + (w % 10));
    await page.click('.cht-ps');
    await page.waitForFunction(() => [...document.querySelectorAll('.cht-sys:not(.cht-err)')].some(e => /Дякуємо/.test(e.textContent)), null, { timeout: 6000 });
    const o = await env.DB.prepare("SELECT o.source, o.form FROM chat_sessions s JOIN orders o ON o.id = s.order_id WHERE s.sid = ?").bind(sid).first();
    ok(o && o.source === 'chat' && o.form === 'chat', JSON.stringify(o));
  });
  await step('після перезавантаження розмова відновлюється; «відповідає людина»; без JS-помилок і порушень CSP', async () => {
    await call(env, 'POST', '/api/admin/chat', { cookie: ckOwner, body: { id: (await env.DB.prepare('SELECT id FROM chat_sessions WHERE sid = ?').bind(sid).first()).id, text: 'Добрий день! Це Михайло, підкажу по ремонту.' } });
    await page.reload({ waitUntil: 'networkidle' });
    await openChat(page, w);
    await page.waitForSelector('.cht-staff', { timeout: 8000 });
    ok(/менеджер/i.test(await page.textContent('.cht-st')), 'стан staff');
    ok(await page.$('.cht-bot .cht-est'), 'історія з розрахунком');
    ok(await noHScroll(page));
    await page.$eval('.cht-log', e => { e.scrollTop = e.scrollHeight; });
    await shot(page, 'chat-staff');
    ok(!errs.length, errs.join('\n'));
  });
  await ctx.close();
}

for (const [lang, path, loc] of [['ar', '/ar/', 'ar'], ['en', '/en/', 'en-US']]) {
  for (const w of [402, 1440]) {
    console.log(`\n${lang} — ${w} px`);
    const { ctx, page, errs } = await ctxOf(w, { lang: loc });
    await step(`${lang}: текст мовою сторінки${lang === 'ar' ? ', RTL, ціни в ізоляті LTR' : ''}`, async () => {
      await ping();
      await page.goto(BASE + path + '?chat=1', { waitUntil: 'networkidle' });
      await openChat(page, w);
      const dir = await page.getAttribute('.cht', 'dir');
      ok(dir === (lang === 'ar' ? 'rtl' : 'ltr'), 'dir ' + dir);
      ok(lang === 'ar' ? /مساعد/.test(await page.textContent('.cht-hd')) : /assistant/i.test(await page.textContent('.cht-hd')));
      await page.fill('.cht-in', lang === 'ar' ? 'شقة 80 م²' : 'Apartment 80 m²');
      await page.click('.cht-send');
      await page.waitForSelector('.cht-me');
      const it = (await bot('GET', '/api/bot/chat?limit=5')).data.items.find(x => x.lang === lang);
      ok(it, 'мова розмови в черзі');
      await bot('POST', '/api/bot/chat', { sid: it.sid, reply_to: it.last_user_id, text: lang === 'ar' ? 'تقديريًا من $44 000' : 'Approximately from $44,000',
        estimate: { lines: [{ label: lang === 'ar' ? 'تجديد' : 'Renovation', qty: 80, unit: lang === 'ar' ? 'م²' : 'm²', rate: 550, from: 44000 }], total_from: 44000 } });
      await page.waitForSelector('.cht-est', { timeout: 15000 });
      const t = await page.textContent('.cht-est .cht-s');
      if (lang === 'ar') ok(/⁦\$44 000⁩/.test(t), 'ізолят: ' + JSON.stringify(t)); else ok(/from \$44,000/.test(t), t);
      ok(await noHScroll(page));
      await shot(page, `chat-${lang}`);
      ok(!errs.length, errs.join('\n'));
    });
    await ctx.close();
  }
}

// ===== адмінка =====
for (const w of [402, 1440]) {
  console.log(`\nАдмінка «Чат» — ${w} px`);
  const { ctx, page, errs } = await ctxOf(w, { cookie: ckOwner });
  await step('список розмов і картка: стан, мова, розрахунок, файли, відповідь; розмітка відвідувача — текстом', async () => {
    await page.goto(BASE + '/kabinet/admin#chat', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ch-row', { timeout: 10000 });
    ok(await page.$('.adm-tabs button[data-t="chat"]'), 'вкладка');
    ok(await noHScroll(page), 'прокрутка (список)');
    await shot(page, 'admin-chat-list');
    const id = (await env.DB.prepare("SELECT s.id FROM chat_sessions s WHERE s.lang = 'uk' AND EXISTS (SELECT 1 FROM chat_files f WHERE f.session_id = s.id AND f.role = 'user' AND f.message_id IS NOT NULL) ORDER BY s.id LIMIT 1").first()).id;
    await page.click(`.ch-row[data-id="${id}"]`);
    await page.waitForSelector('.ch-msgs .ch-m');
    ok(await page.$('.ch-est'), 'розрахунок у картці');
    ok(await page.$('.ch-file'), 'файл у картці');
    ok(await xssFree(page), 'XSS в адмінці');
    await page.fill('[data-reply]', 'Відповідь з адмінки ' + TAG);
    await page.click('.ch-reply button[type=submit]');
    await page.waitForFunction(() => [...document.querySelectorAll('.ch-staff .ch-t')].some(e => /з адмінки/.test(e.textContent)), null, { timeout: 8000 });
    ok(await xssFree(page));
    await page.$eval('.ch-msgs', e => { e.scrollTop = e.scrollHeight; });
    ok(await noHScroll(page), 'прокрутка (картка)');
    await shot(page, 'admin-chat-card');
    ok(!errs.length, errs.join('\n'));
  });
  await step('посилання з Telegram ?cs=<id>#chat відкриває картку розмови', async () => {
    const id = (await env.DB.prepare("SELECT id FROM chat_sessions WHERE lang = 'ar' ORDER BY id LIMIT 1").first()).id;
    await page.goto(BASE + `/kabinet/admin?cs=${id}#chat`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ch-head h2');
    ok((await page.textContent('.ch-head h2')).includes('#' + id));
  });
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${passed}/${passed + fails} OK${fails ? ` — ${fails} FAIL` : ' — ALL OK'}`);
process.exit(fails ? 1 : 0);
