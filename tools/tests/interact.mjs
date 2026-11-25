// Playwright: логіка взаємодій сайту — бургер (фокус-пастка, Esc), перемикач мов, плитки data-c (розгортання без стрибка прокрутки),
// каруселі/стрічки (стрілки з боків, без кнопки паузи), сцени (клік у правій чверті кадру, ←/→, перемикач сцен на головній без переходу),
// пігулка «Звʼязатися», форма заявки (валідація, успіх лише після 2xx — ендпоінти підмінено), .lq-go → контекст у формі, квіз, калькулятор, карта.
//   node tools/tests/interact.mjs        (код 1 при помилках)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.avif': 'image/avif' };
function staticFile(path) {
  let f = join(ROOT, decodeURIComponent(path));
  if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(join(f, 'index.html')) ? join(f, 'index.html') : f.replace(/\/$/, '') + '.html';
  if (!existsSync(f) && existsSync(f + '.html')) f = f + '.html';
  return existsSync(f) && !f.includes('/tools/') ? f : null;
}
let apiStatus = 200, posts = [];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const ch = []; for await (const c of req) ch.push(c);
    if (req.method === 'POST') posts.push({ path: u.pathname, body: Buffer.concat(ch).toString() });
    res.writeHead(apiStatus, { 'content-type': 'application/json' });
    return res.end(u.pathname === '/api/orders' && apiStatus === 200 ? '{"ok":true,"number":"OZD-TEST-1"}' : '{}');
  }
  const f = staticFile(u.pathname);
  if (!f) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let fails = 0;
const IGN = /net::ERR_FAILED|ERR_BLOCKED|Failed to load resource|ERR_ABORTED/;
// Chrome скасовує cross-document view transition, коли нова сторінка ще не ввімкнула @view-transition (так само з «Що ми робимо» → лендинг) — не помилка сайту
const IGN_PE = /Transition was aborted because of invalid state/;
async function test(name, path, w, fn, opt) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return; // ONLY='частина назви' node tools/tests/interact.mjs — лише ці тести
  const [vw, vh] = Array.isArray(w) ? w : [w, w < 600 ? 874 : 900], touch = vw < 600 || vh < 500; // [ширина, висота] — альбомний телефон
  if (Array.isArray(w)) w = vw + '×' + vh;
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, ...(opt || {}) }); // opt — напр. { reducedMotion: 'reduce' }
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => /n8n\./.test(r.request().url()) ? r.fulfill({ status: apiStatus, body: '{}' }) : r.abort());
  const page = await ctx.newPage();
  // CPU=4 node tools/tests/interact.mjs — сповільнений процесор (перевірка стійкості тестів до навантаження, як у повному наборі паралельно з іншими)
  if (+process.env.CPU > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
  const errs = [];
  page.on('pageerror', e => { if (!IGN_PE.test(e.message)) errs.push('JS: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !IGN.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  try {
    await page.goto(BASE + path, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await fn(page);
  } catch (e) { errs.push(process.env.FULLERR ? String(e.message || e).slice(0, 2000) : String(e.message || e).split('\n')[0]); }
  if (errs.length) fails++;
  console.log(`  ${errs.length ? '✗' : '✓'} ${name} (${path} @${w})${errs.length ? '\n      ' + [...new Set(errs)].join('\n      ') : ''}`);
  await ctx.close();
}
const must = (c, m) => { if (!c) throw new Error(m); };
const wakeup = async p => { await p.mouse.wheel(0, 300); await p.waitForTimeout(500); await p.mouse.wheel(0, -300); await p.waitForTimeout(300); };

await test('бургер: відкриття, фокус усередині, Tab по колу, Esc', '/', 402, async p => {
  await p.click('.sch-burger');
  await p.waitForSelector('#sch-menu:not([hidden])');
  must(await p.getAttribute('.sch-burger', 'aria-expanded') === 'true', 'aria-expanded ≠ true');
  must(await p.evaluate(() => document.getElementById('sch-menu').contains(document.activeElement)), 'фокус не в меню');
  for (let i = 0; i < 30; i++) await p.keyboard.press('Tab');
  must(await p.evaluate(() => document.getElementById('sch-menu').contains(document.activeElement) || document.activeElement.classList.contains('sch-burger')), 'фокус вийшов з меню');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  must(await p.getAttribute('.sch-burger', 'aria-expanded') === 'false', 'Esc не закрив меню');
  must(await p.evaluate(() => document.activeElement.classList.contains('sch-burger')), 'фокус не повернувся на бургер');
});
await test('перемикач мов: меню й перехід на EN', '/services', 1440, async p => {
  await p.click('.sch-ld summary');
  await p.waitForSelector('.sch-ld-m a[hreflang=en]', { state: 'visible' });
  await Promise.all([p.waitForURL(/\/en\/services$/), p.click('.sch-ld-m a[hreflang=en]')]);
});
for (const w of [402, 1440]) await test('плитки data-c="x": розгортання/згортання, прокрутка не стрибає', '/remont-kvartyr-kyiv', w, async p => {
  const b = p.locator('[data-c="x"] .ux-h').nth(1);
  // у середину екрана: біля нижнього краю кнопку перекриває пігулка «Зв'язатися», і Playwright сам докручує сторінку перед кліком
  await b.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(200);
  const y0 = await p.evaluate(() => scrollY), t0 = await b.evaluate(e => e.getBoundingClientRect().top);
  await b.click(); await p.waitForTimeout(400);
  must(await b.getAttribute('aria-expanded') === 'true', 'не розгорнулась');
  const t1 = await b.evaluate(e => e.getBoundingClientRect().top);
  must(Math.abs(t1 - t0) < 80, `заголовок плитки зʼїхав на ${Math.round(t1 - t0)}px`);
  const id = await b.getAttribute('aria-controls');
  must(await p.locator('#' + id).isVisible(), 'вміст не видно');
  await b.click(); await p.waitForTimeout(400);
  must(await b.getAttribute('aria-expanded') === 'false', 'не згорнулась');
  const t2 = await b.evaluate(e => e.getBoundingClientRect().top);
  must(t2 > -10 && t2 < 900, `після згортання заголовок поза екраном (${Math.round(t2)})`);
  void y0;
});
// Михайло 24.11.2026: «Що ми робимо» на головних — усі послуги одразу, без прогортування; іконки замість фото (rich.svc_icons)
for (const [path, w] of [['/', 402], ['/', 1440], ['/ar/', 402], ['/de/', 402], ['/de/', 1440], ['/', 820]]) await test('«Що ми робимо»: усі картки видно одразу, іконки, без каруселі', path, w, async p => {
  // ціна лише в $ (Михайло 24.11.2026: «де перекреслив залиш ціну лише в долларах»): без «(≈ …)» і без слова «проєкт» у мінімумі
  const fx = await p.evaluate(() => [...document.querySelectorAll('.xs-svi .xs-pr')].map(e => e.textContent));
  must(fx.length && !fx.some(t => /≈/.test(t)) && !/проєкт|Mindestprojekt|minimum project/i.test(fx.join(' ')), '«Що ми робимо»: друга валюта або «проєкт» у ціні: ' + fx.join(' | '));
  await wakeup(p);
  const row = p.locator('.hx-home~.xs-svc .xs-si').first();
  must(await row.count(), 'немає ряду .xs-si');
  await row.evaluate(e => e.closest('section').scrollIntoView({ block: 'start' })); await p.waitForTimeout(600);
  const st = await row.evaluate(e => {
    const sec = e.closest('section'), r = e.getBoundingClientRect(), cards = [...e.children];
    return { sw: e.scrollWidth, cw: e.clientWidth, secH: sec.getBoundingClientRect().height, vh: innerHeight, n: cards.length,
      oldRow: sec.querySelectorAll('.xs-sv, .cv-b, .cv-nav, img').length,
      cards: cards.map(c => { const b = c.getBoundingClientRect(), a = c.querySelector('h3 a[href]'), ab = a && getComputedStyle(a, '::after');
        return { inside: b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1, w: b.width, h: b.height,
          icon: !!c.querySelector('svg use'), img: c.querySelectorAll('img').length, link: !!a, cover: !!ab && ab.position === 'absolute' }; }) };
  });
  must(st.n >= 5, 'карток менше 5: ' + st.n);
  must(st.sw <= st.cw, `ряд прокручується вбік (${st.sw} > ${st.cw})`);
  must(st.oldRow === 0, 'лишились фото, стрілки або карусель .xs-sv');
  st.cards.forEach((c, i) => {
    must(c.inside, `картка ${i + 1} виходить за межі ряду`);
    must(c.icon && !c.img, `картка ${i + 1}: має бути іконка (svg use) і без <img>`);
    must(c.link && c.cover, `картка ${i + 1}: не посилання цілком`);
    must(c.h >= 44 && c.w >= 44, `картка ${i + 1} < 44 px`);
  });
  if (w >= 1100) must(new Set(st.cards.map(c => Math.round(c.w))).size === 1, 'на ПК картки різної ширини');
  if (w < 768) must(st.secH <= st.vh, `на телефоні блок вищий за екран (${Math.round(st.secH)} > ${st.vh})`);
  const s0 = await row.evaluate(e => e.scrollLeft); await p.waitForTimeout(1500);
  must(await row.evaluate(e => e.scrollLeft) === s0, 'ряд рухається сам');
  const hs = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); must(hs <= 0, `горизонтальна прокрутка сторінки ${hs}px`);
});
// Михайло 23.11.2026: стрілки каруселей — з боків ряду поверх фото (ліворуч і праворуч), не під рядом; кнопки паузи немає ніде
for (const [path, w] of [['/', 402], ['/', 1440], ['/ar/', 402]]) await test('каруселі: стрілки з боків на фото, без ряду кнопок і паузи', path, w, async p => {
  await wakeup(p);
  for (const sel of ['.xs-cv']) { // «Що ми робимо» — без каруселі з 24.11.2026 (тест вище)
    const row = p.locator(sel).first();
    await row.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(700);
    const st = await row.evaluate(e => {
      const sec = e.closest('section'), r = e.getBoundingClientRect(), im = e.querySelector('img').getBoundingClientRect(), q = c => { const b = sec.querySelector(c); return b ? b.getBoundingClientRect() : null; };
      const l = q('.cv-l'), rr = q('.cv-r'), nav = sec.querySelector('.cv-nav');
      return { n: sec.querySelectorAll('.cv-b').length, navH: nav ? nav.offsetHeight : -1, rtl: document.documentElement.dir === 'rtl', row: [r.left, r.right, r.top, r.bottom], im: [im.top, im.bottom],
        l: l && [l.left, l.right, l.top, l.bottom, l.width, l.height], r: rr && [rr.left, rr.right, rr.top, rr.bottom, rr.width, rr.height], below: sec.getBoundingClientRect().bottom - r.bottom };
    });
    must(st.n === 2 && st.l && st.r, sel + ': має бути рівно дві стрілки');
    must(st.navH === 0, sel + ': .cv-nav займає місце (' + st.navH + ' px)');
    for (const b of [st.l, st.r]) {
      must(b[4] >= 43.5 && b[5] >= 43.5, sel + ': стрілка < 44px');
      must(b[2] >= st.im[0] - 1 && b[3] <= st.im[1] + 1, sel + ': стрілка не на фото (' + JSON.stringify([b, st.im]) + ')');
      must(Math.abs((b[2] + b[3]) / 2 - (st.im[0] + st.im[1]) / 2) <= 3, sel + ': стрілка не по центру фото');
    }
    const [first, last] = st.rtl ? [st.r, st.l] : [st.l, st.r], mid = (st.row[0] + st.row[1]) / 2;
    must(first[1] < mid && last[0] > mid && first[0] >= -1 && last[1] <= w + 1, sel + ': стрілки не з боків ряду ' + JSON.stringify([first, last, st.row]));
    must(first[0] - Math.max(0, st.row[0]) <= 40 && Math.min(w, st.row[1]) - last[1] <= 40, sel + ': стрілки далеко від країв');
  }
  must(await p.locator('.cv-p, .mq-ap, .mq-bar').count() === 0, 'лишилась кнопка паузи');
  const hs = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); must(hs <= 0, `горизонтальна прокрутка сторінки ${hs}px`);
  const cls = await p.evaluate(() => window.__cls); must(cls == null || cls <= 0.05, 'CLS ' + cls);
});
// Михайло 24.11.2026: курсор над рядом автопрокрутку НЕ зупиняє; затиснута ліва кнопка + рух тягне ряд (усі стрічки й каруселі), клік без руху — перехід
await test('карусель «Наші проєкти»: під курсором рухається далі, ‹ › гортають', '/', 1440, async p => {
  await wakeup(p);
  const row = p.locator('.xs-cv').first();
  await row.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(600);
  const bb = await row.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(400);
  // простора карусель (24.11.2026): кадр за кадром раз на 7 с — під курсором наступний кадр однаково настає
  const h0 = await row.evaluate(e => e.scrollLeft);
  await p.waitForFunction(([s, v]) => Math.abs(document.querySelector(s).scrollLeft - v) > 8, ['.xs-cv', h0], { timeout: 12000 }).catch(() => {});
  must(Math.abs(await row.evaluate(e => e.scrollLeft) - h0) > 8, 'під курсором карусель зупинилась');
  const a0 = await row.evaluate(e => e.scrollLeft);
  await p.locator('.xs-covers .cv-r').first().click(); await p.waitForTimeout(900);
  const s1 = await row.evaluate(e => e.scrollLeft);
  await p.locator('.xs-covers .cv-l').first().click(); await p.waitForTimeout(900);
  const s2 = await row.evaluate(e => e.scrollLeft);
  must(s1 - a0 > 20 && s1 - s2 > 20, `стрілки не гортають (${a0}→${s1}→${s2})`);
});
for (const [path, sel] of [['/', '.xs-cv'], ['/about', '.xs-bl'], ['/ar/', '.xs-cv'], ['/portfolio', '.xs-st']]) await test('перетягування мишкою тягне ряд, клік після нього не відкриває посилання: ' + sel, path, 1440, async p => {
  await wakeup(p);
  const row = p.locator(sel).first();
  await row.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(1200);
  const bb = await row.boundingBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2, url = p.url();
  await p.mouse.move(cx, cy); await p.waitForTimeout(200);
  const info = await row.evaluate(e => { const c = e.querySelector('.mq-c'), f = e.firstElementChild; return { s: e.scrollLeft, half: c ? Math.abs(c.offsetLeft - f.offsetLeft) : 0, rtl: document.documentElement.dir === 'rtl' }; });
  await p.mouse.down();
  // RTL і ряд без кола (простора карусель): на старті scrollLeft = 0 — край; тягнемо в бік, куди ряд може йти
  const dir = info.rtl && !info.half ? -1 : 1;
  for (let i = 1; i <= 8; i++) { await p.mouse.move(cx - dir * i * 25, cy); await p.waitForTimeout(16); }
  const mid = await row.evaluate(e => ({ s: e.scrollLeft, dg: e.classList.contains('dg') }));
  must(mid.dg, 'під час перетягування немає класу .dg');
  // ряд пішов за курсором на ~200 px (нескінченна стрічка — з точністю до довжини кола)
  let moved = mid.s - info.s - 200 * dir; if (info.half) moved = ((moved % info.half) + info.half) % info.half, moved = Math.min(moved, info.half - moved);
  must(Math.abs(moved) <= 40, `ряд не пішов за курсором: ${info.s}→${mid.s} (коло ${info.half})`);
  await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(700);
  must(p.url() === url, 'після перетягування відкрилось посилання: ' + p.url());
  must(!(await row.evaluate(e => e.classList.contains('dg'))), 'клас .dg лишився після перетягування');
  must(await p.locator('#lb.on, .lb.on, [data-lb-open]').count() === 0, 'після перетягування відкрився лайтбокс');
});
// «Простора» карусель проєктів головних (Михайло 24.11.2026: «карусель в стилі першого екрану — маленький підпис проекту і відео зум анімація першого фото проекту»):
// одразу під hero (стрічки малих фото й окремого блоку «Наші проєкти» внизу немає); телефон — один кадр на всю ширину ~72svh, ПК — великі кадри; підпис «назва + місто · площа»,
// кадр — посилання на кейс своєї мови; Ken Burns (scale > 1) лише на видимому кадрі й лише transform; ‹ › гортають; свайп не відкриває, тап — відкриває; без кнопки паузи
for (const [path, w] of [['/', 402], ['/', 1440], ['/en/', 402], ['/ar/', 402], ['/de/', 1440]]) await test('простора карусель проєктів: кадр, підпис, посилання, Ken Burns, ‹ ›, свайп/тап', path, w, async p => {
  const pre = path === '/' ? '' : path.replace(/\/$/, '');
  must(await p.locator('.xs-strip').count() === 0, 'на головній лишилась стрічка малих фото');
  must(await p.locator('main section.xs-covers').count() === 1, 'карусель проєктів не одна (дублювання)');
  must(await p.evaluate(() => { const h = document.querySelector('.hx-home'); let n = h && h.nextElementSibling; while (n && n.tagName !== 'SECTION') n = n.nextElementSibling; return !!n && n.classList.contains('xs-spc'); }), 'карусель — не одразу під hero');
  const sc = p.locator('.xs-cvsp').first();
  await sc.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(1800);
  must(await p.locator('.xs-spc .mq-ap, .xs-spc .mq-bar, .xs-spc .cv-p').count() === 0, 'у каруселі є кнопка паузи');
  const r = await sc.evaluate((e, pre) => {
    const a = [...e.querySelectorAll(':scope>a')], W = innerWidth, H = innerHeight, b0 = a[0].getBoundingClientRect();
    const bad = a.filter(x => !x.getAttribute('href').startsWith(pre + '/proekty/') || !x.querySelector('span b') || !x.querySelector('span small')).length;
    const kb = a.filter(x => x.classList.contains('kb'));
    const vis = x => { const b = x.getBoundingClientRect(), s = e.getBoundingClientRect(); return Math.max(0, Math.min(b.right, s.right) - Math.max(b.left, s.left)) / b.width; };
    const sc = x => { const m = getComputedStyle(x.querySelector('img')).transform; return m === 'none' ? 1 : new DOMMatrix(m).a; };
    const tp = getComputedStyle(a[0].querySelector('img')).transitionProperty;
    return { n: a.length, bad, w: Math.round(b0.width), h: Math.round(b0.height), W, H, kb: kb.length, kbVis: kb.every(x => vis(x) >= .6), other: a.filter(x => !x.classList.contains('kb')).map(sc).filter(v => v > 1.001).length, kbScale: kb.length ? sc(kb[0]) : 0, tp,
      fs: parseFloat(getComputedStyle(a[0].querySelector('b')).fontSize), h1: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize) };
  }, pre);
  must(r.n >= 4 && !r.bad, 'кадри без посилання на кейс своєї мови чи без підпису: ' + JSON.stringify(r));
  if (w < 600) must(Math.abs(r.w - r.W) <= 2 && r.h >= .6 * r.H && r.h <= .8 * r.H, 'телефон: кадр не на всю ширину / не ~72svh: ' + JSON.stringify(r));
  else must(r.h >= .55 * r.H && r.w >= .35 * r.W, 'ПК: кадр замалий: ' + JSON.stringify(r));
  must(r.fs < r.h1, 'підпис кадру не дрібніший за H1');
  must(r.kb === 1 && r.kbVis && !r.other && r.kbScale > 1.001 && /^transform$/.test(r.tp), 'Ken Burns: ' + JSON.stringify(r));
  // ‹ › гортають
  const s0 = await sc.evaluate(e => e.scrollLeft);
  await p.locator('.xs-spc .cv-r').first().click(); await p.waitForTimeout(900);
  const s1 = await sc.evaluate(e => e.scrollLeft);
  must(Math.abs(s1 - s0) > 50, `стрілка › не гортає (${s0}→${s1})`);
  // свайп / перетягування — без переходу; тап / клік — кейс кадру
  const bb = await sc.boundingBox(), cy = bb.y + bb.height * .5, url0 = p.url();
  const cx = Math.min(bb.x + bb.width * .5, 300);
  if (w < 600) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx + 100, y: cy }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 100 - i * 25, y: cy }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else { await p.mouse.move(cx + 100, cy); await p.mouse.down(); await p.mouse.move(cx - 100, cy, { steps: 8 }); await p.mouse.up(); }
  await p.waitForTimeout(900);
  must(p.url() === url0, `свайп відкрив ${p.url()}`);
  await p.waitForFunction(e => { const v = e.scrollLeft, k = e.__st || (e.__st = { v: NaN, n: 0 }); k.n = Math.abs(v - k.v) < 1 ? k.n + 1 : 0; k.v = v; return k.n >= 2; }, await sc.elementHandle(), { timeout: 8000, polling: 150 }).catch(() => {});
  const href = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href'), [cx, cy]);
  must(href, 'під точкою немає посилання');
  if (w < 600) await p.touchscreen.tap(cx, cy); else await p.mouse.click(cx, cy);
  await p.waitForURL(u => new URL(u).pathname.replace(/\.html$/, '') === href.replace(/\.html$/, ''), { timeout: 5000 }).catch(() => {});
  must(new URL(p.url()).pathname.replace(/\.html$/, '') === href, `тап: ${p.url()} замість ${href}`);
});
await test('простора карусель, reduced-motion: без Ken Burns і автозміни', '/', 402, async p => {
  const sc = p.locator('.xs-cvsp').first();
  await sc.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(2000);
  const r = await sc.evaluate(e => ({ kb: e.querySelectorAll('.kb').length, t: getComputedStyle(e.querySelector('img')).transform }));
  must(!r.kb && (r.t === 'none' || r.t === 'matrix(1, 0, 0, 1, 0, 0)'), 'рух при reduced-motion: ' + JSON.stringify(r));
}, { reducedMotion: 'reduce' });
for (const w of [402, 1440]) await test('сцена на головній: клік у правій чверті, ←/→, перемикач сцен без переходу', '/', w, async p => {
  await wakeup(p);
  const sec = p.locator('#build-anim');
  await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 });
  const cur = () => p.evaluate(() => (+(document.querySelector('#build-anim .sc-enc')||{getAttribute:()=>0}).getAttribute('aria-valuenow')-1));
  const pause = p.locator('#build-anim .la-play, #build-anim [class*="play"]').first();
  if (await pause.count()) { const pr = await pause.getAttribute('aria-pressed'); if (pr !== 'true') await pause.click().catch(() => {}); }
  await p.waitForTimeout(300);
  const svg = p.locator('#build-anim svg').first();
  const bb = await svg.boundingBox(); must(bb, 'немає кадру сцени');
  const s0 = await cur();
  await p.mouse.click(bb.x + bb.width * 0.9, bb.y + bb.height * 0.5); await p.waitForTimeout(500);
  const s1 = await cur();
  must(s1 === s0 + 1 || s0 === -1 && s1 >= 0, `клік у правій чверті: етап ${s0}→${s1}`);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500);
  const s2 = await cur();
  must(s2 === s1 - 1 || s2 === s1, `←: етап ${s1}→${s2}`); // ← працює, коли фокус у сцені
  const url = p.url();
  const tab = p.locator('#build-anim nav.la-tab a').nth(2);
  if (await tab.count()) {
    await tab.scrollIntoViewIfNeeded(); await tab.click(); await p.waitForTimeout(2500);
    must(p.url() === url, 'перемикач сцен перейшов на іншу сторінку: ' + p.url());
  }
});
// сцени головних (QA 18.11.2026): активна сцена — секція з перемикачем вкладок; кнопки номерів етапів — .sc-n (casSide) або .bz-nav (Будинок/Квартира)
const SCN = `(()=>{const ss=[...document.querySelectorAll('section.bz')].filter(s=>s.offsetParent&&s.getBoundingClientRect().height>50);return ss.find(x=>x.querySelector('nav.la-tab'))||ss[0]})()`;
const scTab = async (p, i) => { const a = p.locator('section.bz nav.la-tab a').nth(i); await a.scrollIntoViewIfNeeded(); await a.click(); await p.waitForTimeout(2500); await p.evaluate(`${SCN}.scrollIntoView({block:'start'})`); await p.waitForTimeout(600); };
const scGo = (p, k) => p.evaluate(`(()=>{const e=${SCN}.querySelector('.sc-enc'),n=+e.getAttribute('aria-valuemax'),i=${k}<0?n+${k}:${k};e.__go(i);return n})()`);
// перемикач сцен головної не рухає сторінку (19.11.2026): H2 і панелі вкладок різної висоти давали стрибок до ~70 px (телефон) і ~50 px (ПК).
// Тепер: спільний відступ H2 і 2 рядки під H2 на телефоні (site-chrome.v1.css) + секція тримає висоту найвищої показаної вкладки (завантажувач сцен).
// Перше коло — блок може лише підрости (≤ 30 px телефон, ≤ 60 px ПК: довга назва на 2 рядки); друге коло — висота не змінюється зовсім.
for (const w of [402, 1440]) await test('перемикач сцен головної: висота блоку не стрибає між вкладками', '/', w, async p => {
  await wakeup(p);
  await p.evaluate(() => { try { localStorage.setItem('casScHint', '1'); } catch (e) { } });
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 }); await p.waitForTimeout(800);
  const H = () => p.evaluate(`Math.round(${SCN}.getBoundingClientRect().height)`);
  const tab = async i => { const a = p.locator('section.bz nav.la-tab a').nth(i); await a.scrollIntoViewIfNeeded(); await a.click(); await p.waitForFunction(i => { const n = document.querySelector('section.bz nav.la-tab'); return n && n.getAttribute('aria-busy') !== 'true' && n.querySelectorAll('a')[i].hasAttribute('aria-current'); }, i, { timeout: 10000 }); await p.waitForTimeout(1800); return H(); };
  const n = await p.locator('section.bz nav.la-tab a').count(); must(n === 6, 'вкладок перемикача: ' + n);
  const h0 = await H(), first = [h0];
  for (let i = 1; i < n; i++) first.push(await tab(i));
  first.push(await tab(0));
  must(first.every((h, i) => !i || h >= first[i - 1]), 'блок сцени зменшився при перемиканні: ' + first.join(' → '));
  must(first.at(-1) - h0 <= (w < 600 ? 30 : 60), 'перше коло: блок підріс на ' + (first.at(-1) - h0) + ' px: ' + first.join(' → '));
  const second = []; for (let i = 1; i < n; i++) second.push(await tab(i));
  second.push(await tab(0));
  must(second.every(h => Math.abs(h - first.at(-1)) <= 1), 'друге коло: висота змінюється: ' + first.at(-1) + ' → ' + second.join(' → '));
});
// альбомний телефон (≥768 px завширшки, низький екран): кадр і панель компактної сцени — у межах екрана під шапкою (було 423–520 px при 329 доступних)
for (const vp of [[852, 393], [932, 430]]) await test('компактна сцена на альбомному телефоні: кадр і панель — у межах екрана', '/', vp, async p => {
  await wakeup(p);
  await p.evaluate(() => { try { localStorage.setItem('casScHint', '1'); } catch (e) { } });
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 }); await p.waitForTimeout(800);
  const fit = () => p.evaluate(`(()=>{const r=${SCN}.querySelector('.bz-pin,.la-stick,.rp-grid').getBoundingClientRect(),hd=document.querySelector('header').getBoundingClientRect().height;return {row:Math.round(r.height),avail:Math.round(innerHeight-hd),next:!!${SCN}.querySelector('.bz-nx,.sc-next,.la-next')}})()`);
  for (const i of [0, 2, 3]) {
    if (i) { const a = p.locator('section.bz nav.la-tab a').nth(i); await a.scrollIntoViewIfNeeded(); await a.click(); await p.waitForTimeout(2600); }
    const f = await fit();
    must(f.row <= f.avail, 'вкладка ' + i + ': ряд сцени ' + f.row + ' px > ' + f.avail + ' px екрана під шапкою');
    must(f.next, 'вкладка ' + i + ': немає кнопки «далі»');
  }
});
// компактна «Будинок з нуля»: рестарт після ≥ 4 с поза кадром — одразу з етапу 01, без «перемотки» назад 05 → 04 → … → 01
// (застарілий прогрес casDrive доганяв етап, який ставить go(); той самий drive на прокрутці перемикав етапи сцени поза кадром)
await test('компактна сцена: рестарт після виходу з кадру — одразу з 01, без перемотки назад', '/', 402, async p => {
  await wakeup(p);
  await p.evaluate(() => { try { localStorage.setItem('casScHint', '1'); } catch (e) { } });
  await p.locator('#build-anim').scrollIntoViewIfNeeded();
  await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center' }));
  await p.waitForFunction(() => +document.querySelector('#build-anim .sc-enc').getAttribute('aria-valuenow') >= 3, null, { timeout: 12000 }); // автопрогравання: 1.6 с + 3.5 с на етап
  await p.evaluate(() => { const c = document.querySelector('#build-anim .sc-enc'); window.__ct = []; new MutationObserver(() => window.__ct.push(('0' + c.getAttribute('aria-valuenow')).slice(-2))).observe(c, { attributes: true, attributeFilter: ['aria-valuenow'] }); });
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(4800);
  const away = await p.evaluate(() => window.__ct.splice(0));
  must(!away.length, 'сцена поза кадром перемикала етапи: ' + away.join(' '));
  await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center' })); await p.waitForTimeout(1500);
  const back = await p.evaluate(() => window.__ct.filter((v, i, a) => v !== a[i - 1]));
  must(back.length && back[0] === '01' && back.every(v => v === '01' || v === '02'), 'після повернення: ' + back.join(' → ') + ' (очікується одразу 01)');
});
// ── огляд моделі «Будинок/Квартира з нуля» (Михайло 23.11.2026 «крутити й приближати модельку»; build-anim.v1.js «огляд моделі»):
//    перетягування обертає (не етап), «скинути» — рівно та сама розмітка кадру, вертикальний свайп — сторінка, щипок і Ctrl+колесо — масштаб моделі
//    (масштаб сторінки — 1), тап у чверті — етап, кнопки + − ↺ і клавіші, повернута модель будує наступні етапи без помилок, RTL, reduced-motion, інші сцени — як були
const orb = p => p.evaluate(() => { const s = document.querySelector('#build-anim'); return s && s.__bzOrb ? s.__bzOrb() : null; });
const bzStep = p => p.evaluate(() => (+(document.querySelector('#build-anim .sc-enc')||{getAttribute:()=>0}).getAttribute('aria-valuenow')-1));
// розмітка кадру без пулу частинок (координати хмарок пилу випадкові): камера, viewBox, візерунки
const bzSnap = p => p.evaluate(() => { const s = document.querySelector('#build-anim .bz-fig > svg'), c = s.querySelector('g.bz-cam').cloneNode(true); c.querySelectorAll('.bz-pfs').forEach(e => e.remove()); return c.innerHTML + '|' + s.getAttribute('viewBox') + '|' + s.querySelector('defs').innerHTML; });
const bzNodes = p => p.evaluate(() => { const c = document.querySelector('#build-anim .bz-fig > svg g.bz-cam'); return c.querySelectorAll('*').length - c.querySelectorAll('.bz-pfs, .bz-pfs *').length; });
async function bzReady(p) {
  await wakeup(p);
  await p.evaluate(() => { try { localStorage.setItem('casScHint', '1'); } catch (e) { } });
  await p.locator('#build-anim').scrollIntoViewIfNeeded();
  await p.waitForSelector('#build-anim .sc-enc', { timeout: 15000 });
  await p.evaluate(() => { const a = document.querySelector('#build-anim .sc-enc'); if (a && a.getAttribute('data-st') === 'on') a.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
  await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center', behavior: 'instant' }));
  let a = '', b = await bzSnap(p); // доливання шарів (fillLazy) — у простої: чекаємо, поки розмітка кадру стане
  for (let i = 0; i < 20 && a !== b; i++) { await p.waitForTimeout(400); a = b; b = await bzSnap(p); }
  return p.locator('#build-anim .bz-fig > svg').boundingBox();
}
const drag = async (p, x, y, dx, dy, o) => { if (o && o.shift) await p.keyboard.down('Shift'); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 12 }); await p.mouse.up(); if (o && o.shift) await p.keyboard.up('Shift'); await p.waitForTimeout(250); };
for (const [path, w] of [['/', 1440], ['/budivnytstvo-budynkiv-kyiv', 1440], ['/remont-kvartyr-kyiv', 1440], ['/', 402]]) await test('модель: перетягування мишею повертає модель (не етап), «скинути» — рівно початкова розмітка кадру', path, w, async p => {
  const bb = await bzReady(p); must(bb, 'немає кадру сцени');
  const s0 = await bzSnap(p), st0 = await bzStep(p), pt0 = await p.evaluate(() => document.querySelector('#build-anim .bz-fig > svg g.bz-cam polygon').getAttribute('points'));
  must(await p.locator('#build-anim .bz-zr').isDisabled(), '«скинути» активна в типовому вигляді');
  await drag(p, bb.x + bb.width / 2, bb.y + bb.height / 2, -bb.width * 0.3, bb.height * 0.15);
  const o = await orb(p), pt1 = await p.evaluate(() => document.querySelector('#build-anim .bz-fig > svg g.bz-cam polygon').getAttribute('points'));
  must(o && o.rot && o.t < -0.1 && o.p > o.p0, 'перетягування не повернуло модель: ' + JSON.stringify(o));
  must(pt1 !== pt0, 'координати точок не змінились після повороту');
  must(await bzStep(p) === st0, `перетягування змінило етап: ${st0} → ${await bzStep(p)}`);
  must(!(await p.evaluate(() => document.querySelector('#build-anim .bz-fig > svg g.bz-cam').innerHTML.includes('NaN'))), 'NaN у розмітці повернутої моделі');
  must(await p.evaluate(() => !String(getSelection()).trim()), 'перетягування виділило текст сторінки');
  await p.click('#build-anim .bz-zr'); await p.waitForTimeout(900);
  const o2 = await orb(p);
  must(!o2.rot && o2.t === 0 && o2.z === 1, '«скинути» не повернула типовий вигляд: ' + JSON.stringify(o2));
  must(await bzSnap(p) === s0, '«скинути»: розмітка кадру не та сама, що до повороту');
  // Shift + перетягування на 1× — без зсуву; наближена — пересувається
  await p.click('#build-anim .bz-zi'); await p.waitForTimeout(500);
  const vb0 = await p.getAttribute('#build-anim .bz-fig > svg', 'viewBox');
  await drag(p, bb.x + bb.width / 2, bb.y + bb.height / 2, 80, 40, { shift: 1 });
  const vb1 = await p.getAttribute('#build-anim .bz-fig > svg', 'viewBox');
  must(vb1 !== vb0 && !(await orb(p)).rot, 'Shift + перетягування не пересуває наближену модель (або повертає її): ' + vb0 + ' → ' + vb1);
});
await test('модель: свайп пальцем обертає й не крокує етап; вертикальний свайп — прокрутка сторінки; тап у чверті — етап', '/', 402, async p => {
  const bb = await bzReady(p), g = await touches(p);
  const st0 = await bzStep(p), cy = bb.y + bb.height / 2;
  await g.swipe(bb.x + bb.width * 0.62, cy, bb.x + bb.width * 0.38, cy + 6);
  const o = await orb(p);
  must(o.rot && o.t < -0.05, 'горизонтальний свайп не повернув модель: ' + JSON.stringify(o));
  must(Math.abs(o.p - o.p0) < 1e-6, 'один палець змінив нахил: ' + JSON.stringify(o));
  must(await bzStep(p) === st0, `свайп змінив етап: ${st0} → ${await bzStep(p)}`);
  const y0 = await p.evaluate(() => scrollY);
  await g.swipe(bb.x + bb.width / 2, cy + 60, bb.x + bb.width / 2, cy - 120);
  const y1 = await p.evaluate(() => scrollY), o2 = await orb(p);
  must(y1 - y0 > 40, `вертикальний свайп у кадрі не прокрутив сторінку: ${y0} → ${y1}`);
  must(Math.abs(o2.t - o.t) < 1e-6, 'вертикальний свайп повернув модель');
  await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(300);
  const b2 = await p.locator('#build-anim .bz-fig > svg').boundingBox(), st1 = await bzStep(p);
  await p.touchscreen.tap(b2.x + b2.width * 0.92, b2.y + b2.height * 0.4); await p.waitForTimeout(600);
  must(await bzStep(p) === st1 + 1, `тап у правій чверті: етап ${st1} → ${await bzStep(p)}`);
  must(Math.abs((await orb(p)).t - o.t) < 1e-6, 'тап у чверті змінив кут');
});
await test('модель: щипок масштабує модель, масштаб сторінки лишається 1; подвійний тап — 1×', '/', 402, async p => {
  const bb = await bzReady(p), g = await touches(p), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  const st0 = await bzStep(p);
  await g.pinch(cx, cy, 30, 110);
  const o = await orb(p), sc = await p.evaluate(() => visualViewport.scale);
  must(o.z > 1.5, 'щипок не наблизив модель: ' + JSON.stringify(o));
  must(Math.abs(sc - 1) < 1e-3, 'щипок у кадрі змінив масштаб сторінки: ' + sc);
  must(await bzStep(p) === st0, 'щипок змінив етап');
  await g.dbl(cx, cy); await p.waitForTimeout(400);
  must((await orb(p)).z === 1, 'подвійний тап у середині кадру не повернув 1×: ' + JSON.stringify(await orb(p)));
});
await test('модель: Ctrl + колесо — масштаб моделі, звичайне колесо — етап; кнопки + − ↺ і клавіші', '/', 1440, async p => {
  const bb = await bzReady(p), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  await p.mouse.move(cx, cy);
  await p.keyboard.down('Control'); await p.mouse.wheel(0, -240); await p.keyboard.up('Control'); await p.waitForTimeout(400);
  let o = await orb(p);
  must(o.z > 1.2, 'Ctrl + колесо не наблизило модель: ' + JSON.stringify(o));
  must(Math.abs(await p.evaluate(() => visualViewport.scale) - 1) < 1e-3, 'Ctrl + колесо змінило масштаб сторінки');
  const st0 = await bzStep(p), sy = await p.evaluate(() => scrollY);
  await p.mouse.wheel(0, 120); await p.waitForTimeout(700);
  must(await bzStep(p) === st0 + 1 && await p.evaluate(() => scrollY) === sy, `звичайне колесо над кадром: етап ${st0} → ${await bzStep(p)} (як і раніше — +1 етап без прокрутки)`);
  await p.click('#build-anim .bz-zr'); await p.waitForTimeout(700);
  await p.click('#build-anim .bz-zi'); await p.waitForTimeout(500);
  const z1 = (await orb(p)).z; must(z1 > 1.4, '«+» не наблизила: ' + z1);
  await p.click('#build-anim .bz-zo'); await p.waitForTimeout(500);
  must((await orb(p)).z < z1, '«−» не віддалила');
  must(await p.locator('#build-anim .bz-zr').isDisabled() && await p.locator('#build-anim .bz-zo').isDisabled(), '1× і типовий кут: «−» і «скинути» мають бути неактивні');
  // клавіші з фокусом на кадрі: Shift + → / ↓ — поворот і нахил, + — масштаб, 0 — типовий вигляд; → без Shift — етап
  await p.focus('#build-anim .bz-fig');
  const st1 = await bzStep(p);
  await p.keyboard.press('Shift+ArrowRight'); await p.keyboard.press('Shift+ArrowDown'); await p.waitForTimeout(300);
  o = await orb(p); must(o.rot && o.t > 0 && o.p > o.p0, 'Shift + →/↓ не повернули модель: ' + JSON.stringify(o));
  must(await bzStep(p) === st1, 'Shift + → змінив етап');
  await p.keyboard.press('+'); await p.waitForTimeout(400); must((await orb(p)).z > 1.2, 'клавіша + не наблизила');
  await p.keyboard.press('0'); await p.waitForTimeout(800); o = await orb(p); must(!o.rot && o.z === 1, 'клавіша 0 не скинула вигляд: ' + JSON.stringify(o));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  must(await bzStep(p) === st1 + 1, '→ з фокусом на кадрі не крокує етап');
  // кнопки — у кадрі, ≥ 44 px, не на печатці (угорі праворуч)
  const r = await p.evaluate(() => { const f = document.querySelector('#build-anim .bz-fig').getBoundingClientRect(); return [...document.querySelectorAll('#build-anim .bz-ob button')].map(b => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, in: q.left >= f.left && q.right <= f.right && q.bottom <= f.bottom && q.top >= f.top, low: q.top > f.top + f.height / 2 }; }); });
  must(r.length === 3 && r.every(b => b.w >= 44 && b.h >= 44 && b.in && b.low), 'кнопки огляду: ' + JSON.stringify(r));
});
for (const w of [402, 1440]) await test('модель: повернута модель будує наступні етапи без помилок і без «розсипаних» шарів', w > 600 ? '/budivnytstvo-budynkiv-kyiv' : '/', w, async p => {
  const bb = await bzReady(p);
  if (w > 600) await drag(p, bb.x + bb.width / 2, bb.y + bb.height / 2, bb.width * 0.25, -bb.height * 0.1);
  else { const g = await touches(p); await g.swipe(bb.x + bb.width * 0.35, bb.y + bb.height / 2, bb.x + bb.width * 0.65, bb.y + bb.height / 2); }
  must((await orb(p)).rot, 'модель не повернулась');
  const n = await p.evaluate(() => +document.querySelector('#build-anim .sc-enc').getAttribute('aria-valuemax'));
  for (const k of [3, Math.floor(n / 2), n - 1]) {
    await p.evaluate(k => document.querySelector('#build-anim .sc-enc').__go(k), k); await p.waitForTimeout(w > 600 ? 2200 : 900);
    await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(600);
  }
  must((await orb(p)).rot, 'кут скинувся під час етапів');
  const html = await p.evaluate(() => document.querySelector('#build-anim .bz-fig > svg g.bz-cam').innerHTML);
  must(!html.includes('NaN'), 'NaN у розмітці');
  const n1 = await bzNodes(p);
  await p.click('#build-anim .bz-zr'); await p.waitForTimeout(900);
  const n0 = await bzNodes(p);
  must(n1 === n0, `вузлів у кадрі: повернута ${n1}, типова ${n0} (на тому самому етапі)`);
});
await test('модель (ar, RTL): кнопки праворуч у кадрі, свайп обертає й не крокує етап', '/ar/', 402, async p => {
  const bb = await bzReady(p), g = await touches(p);
  const r = await p.evaluate(() => { const f = document.querySelector('#build-anim .bz-fig').getBoundingClientRect(), o = document.querySelector('#build-anim .bz-ob').getBoundingClientRect(); return { fr: f.right, or: o.right, ol: o.left, fl: f.left }; });
  must(r.fr - r.or < 24 && r.ol - r.fl > 100, 'RTL: кнопки огляду не праворуч: ' + JSON.stringify(r));
  const st0 = await bzStep(p);
  await g.swipe(bb.x + bb.width * 0.4, bb.y + bb.height / 2, bb.x + bb.width * 0.6, bb.y + bb.height / 2);
  must((await orb(p)).rot && await bzStep(p) === st0, 'RTL: свайп не повернув модель або змінив етап');
  must(await p.getAttribute('#build-anim .bz-zr', 'aria-label') === 'إعادة ضبط العرض', 'RTL: назва кнопки «скинути» не арабською');
});
await test('модель (reduced-motion): перетягування працює, «скинути» — одразу', '/', 1440, async p => {
  const bb = await bzReady(p);
  await drag(p, bb.x + bb.width / 2, bb.y + bb.height / 2, 160, 0);
  must((await orb(p)).rot, 'reduced-motion: перетягування не повернуло модель');
  await p.click('#build-anim .bz-zr'); await p.waitForTimeout(80);
  const o = await orb(p); must(!o.rot && o.z === 1, 'reduced-motion: «скинути» не миттєве: ' + JSON.stringify(o));
}, { reducedMotion: 'reduce' });
await test('модель: інші сцени (Ландшафт) — свайп, як і раніше, крокує етап', '/', 402, async p => {
  await bzReady(p);
  await scTab(p, 2);
  const svg = p.locator(`section.bz:has(nav.la-tab) .la-svg`).first(); await svg.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await p.evaluate(`(()=>{const b=${SCN}.querySelector('.sc-enc');if(b&&b.getAttribute('data-st')==='on')b.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))})()`);
  const st = () => p.evaluate(`+${SCN}.querySelector('.sc-enc').getAttribute('aria-valuenow')-1`);
  const bb = await svg.boundingBox(), s0 = await st(), g = await touches(p);
  await g.swipe(bb.x + bb.width * 0.75, bb.y + bb.height / 2, bb.x + bb.width * 0.25, bb.y + bb.height / 2);
  await p.waitForTimeout(400);
  must(await st() === s0 + 1, `Ландшафт: свайп ← не крокує етап (${s0} → ${await st()})`);
  must(!(await p.locator(`section.bz:has(nav.la-tab) .bz-ob`).count()), 'Ландшафт: кнопки огляду моделі в чужій сцені');
});
// «Ресторан з нуля», етап «Гості»: силуети були сірі під нічним шаром і їх майже не було видно — етап виглядав порожнім
await test('сцена «Ресторан»: на етапі «Гості» видно гостей (≥ 10 світлих силуетів)', '/', 1440, async p => {
  await wakeup(p);
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 });
  await scTab(p, 5); await p.waitForSelector('section.bz .rs-svg', { timeout: 10000 });
  await scGo(p, -1); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const s = [...document.querySelectorAll('.rs-svg .rs-e.on .rs-sil')]; const l = s.map(e => { const f = getComputedStyle(e).fill.match(/\d+/g).map(Number); return (0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]) / 255; }); return { n: s.length, lum: +Math.max(0, ...l).toFixed(2) }; });
  must(r.n >= 10 && r.lum > 0.85, 'гості на останньому етапі: ' + JSON.stringify(r));
});
// «Будинок на воді», етап «Здача»: був без видимої зміни відносно «Вечора» — знак «ключі» в кадрі лише на останньому етапі
await test('сцена «Будинок на воді»: на етапі «Здача» — знак «ключі» в межах кадру', '/', 402, async p => {
  await wakeup(p);
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 });
  await scTab(p, 4); await p.waitForSelector('section.bz .wh-svg', { timeout: 10000 });
  await scGo(p, -2); await p.waitForTimeout(1200);
  const on = () => p.evaluate(() => { const k = document.querySelector('.wh-svg .wh-key'), g = k && k.closest('.wh-e'), s = document.querySelector('.wh-svg').getBoundingClientRect(), r = k && k.getBoundingClientRect(); return k ? { on: g.classList.contains('on'), op: +getComputedStyle(g).opacity, inF: r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom && r.width > 20 } : null; });
  const a = await on(); must(a && !a.on, '«ключі» видно до етапу «Здача»: ' + JSON.stringify(a));
  await scGo(p, -1); await p.waitForTimeout(1500);
  const b = await on(); must(b && b.on && b.op > 0.9 && b.inF, '«ключі» на етапі «Здача»: ' + JSON.stringify(b));
});
// «Комплекс»: кадр (генплан) фокусується, ←/→ з фокусом крокують зупинками — як у решти сцен (раніше SVG без tabindex: після кліку по кадру стрілки не працювали)
await test('сцена «Комплекс»: фокус на кадрі, → / ← крокують зупинками', '/', 1440, async p => {
  await wakeup(p);
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .sc-enc', { timeout: 10000 });
  await scTab(p, 3); await p.waitForSelector('section.bz .rp-svg', { timeout: 10000 });
  await p.evaluate(`(()=>{const b=${SCN}.querySelector('.sc-enc');if(b&&b.dataset.st==='on')b.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))})()`);
  await scGo(p, 2); await p.waitForTimeout(600);
  const cur = () => p.evaluate(`+${SCN}.querySelector('.sc-enc').getAttribute('aria-valuenow')-1`);
  must(await p.evaluate(() => document.querySelector('.rp-svg').tabIndex === 0), 'кадр «Комплексу» не фокусується (tabindex)');
  await p.evaluate(() => document.querySelector('.rp-svg').focus());
  const c0 = await cur(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  const c1 = await cur(); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500);
  const c2 = await cur();
  must(c1 === c0 + 1 && c2 === c0, `→/←: ${c0} → ${c1} → ${c2}`);
});
await test('пігулка «Звʼязатися»: меню й Esc', '/remont-kvartyr-kyiv', 402, async p => {
  await p.click('.mbar .mb-tg');
  must(await p.locator('.mbar.open').count(), 'меню не відкрилось');
  must(await p.locator('.mbar .mb-menu a[href^="tel:"]').isVisible(), 'немає «Подзвонити»');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  must(!(await p.locator('.mbar.open').count()), 'Esc не закрив');
});
// Вікно заявки (Михайло 24.11.2026): форма — у dialog.fdl, відкриває кнопка «Розрахувати проєкт» у футері (і всі посилання на #zayavka)
const fdOpen = p => p.evaluate(() => { const d = document.querySelector('dialog.fdl'); return !!(d && d.open); });
const openFd = async p => {
  await p.locator('.scf-cta').scrollIntoViewIfNeeded(); await p.click('.scf-cta'); await p.waitForTimeout(400);
  must(await fdOpen(p), 'кнопка футера не відкрила вікно заявки');
};
await test('форма: порожній телефон не надсилається; 500 — без успіху; 200 — успіх', '/remont-kvartyr-kyiv', 402, async p => {
  posts = []; apiStatus = 500;
  await openFd(p);
  await p.click('#oBtn'); await p.waitForTimeout(500);
  must(posts.length === 0, 'порожня форма надіслана');
  await p.fill('#oPhone', '0671234567');
  await p.click('#oBtn'); await p.waitForTimeout(1500);
  must(posts.length === 1, 'заявку не надіслано (' + posts.length + ')');
  const okVis = async () => p.evaluate(() => [...document.querySelectorAll('#oOk,.lq-ok')].some(e => e.offsetParent && getComputedStyle(e).display !== 'none' && e.textContent.trim().length > 5));
  must(!(await okVis()), 'успіх показано при 500');
  must(await fdOpen(p) && await p.locator('#oErr').textContent() !== '', 'при 500 вікно закрилось або немає тексту помилки');
  apiStatus = 200;
  await p.click('#oBtn'); await p.waitForTimeout(1500);
  must(await okVis(), 'успіх не показано при 200');
  must(await fdOpen(p) && await p.evaluate(() => document.activeElement && document.activeElement.id === 'oOk'), 'після успіху: вікно відкрите, фокус на «дякуємо»');
  const af = await p.evaluate(() => { const x = document.querySelector('#oOk .lf-after'), a = x && x.querySelector('a.lf-tg'); return x ? { t: x.textContent, h: a && a.getAttribute('href'), v: !!x.offsetParent, hh: a ? a.getBoundingClientRect().height : 0 } : null; });
  must(af && af.v && /Пн–Пт 10:00–20:00/.test(af.t) && /терміново/.test(af.t), 'після успіху немає рядка «Відповідаємо Пн–Пт 10:00–20:00…»: ' + JSON.stringify(af));
  must(af.h === 'https://t.me/+380978667755' && af.hh >= 44, 'кнопка Telegram після успіху: ' + JSON.stringify(af));
  const b = JSON.parse(posts.at(-1).body); must(/380671234567|0671234567/.test(b.phone), 'телефон не в заявці');
  must(b.service, 'немає service');
});
// Перехід на …#zayavka з ІНШОЇ сторінки: сторінка стає на місце одразу (без плавної прокрутки ~10 000 px), шапка видима й не перекриває ціль;
// у межах сторінки прокрутка до якоря лишається плавною (html.sb), reduced-motion — миттєво завжди.
const hashRec = () => { window.__ys = []; const f = () => { window.__ys.push(Math.round(scrollY)); requestAnimationFrame(f); }; requestAnimationFrame(f); };
// …#zayavka (кнопка футера сторінки без форми, посилання ззовні): одразу відкрите вікно заявки, сторінка не прокручується, якір прибрано з адреси
for (const [path, w] of [['/remont-kvartyr-kyiv', 402], ['/', 1440], ['/ar/', 402], ['/contact', 402], ['/en/apartment-interior-design', 1440]]) await test('#zayavka з іншої сторінки: одразу вікно заявки, без прокрутки', '/about', w, async p => {
  await p.addInitScript(hashRec);
  await p.goto(BASE + path + '#zayavka', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ y: scrollY, hash: location.hash, foc: document.activeElement && document.activeElement.id, sec: getComputedStyle(document.getElementById('zayavka')).display }));
  must(await fdOpen(p), 'вікно заявки не відкрилось');
  must(r.y < 50 && r.hash === '' && r.foc === 'oPhone' && r.sec === 'none', 'після відкриття: ' + JSON.stringify(r));
  await p.goBack().catch(() => {}); await p.waitForTimeout(400);
  must(!(await fdOpen(p)) && p.url().endsWith(path), '«Назад» не закрив вікно або пішов зі сторінки: ' + p.url());
});
// Перехід на інший якір (не форму) з ІНШОЇ сторінки: сторінка стає на місце одразу, шапка видима й не перекриває ціль
for (const [path, w] of [['/remont-kvartyr-kyiv', 402], ['/budivnytstvo-budynkiv-kyiv', 1440]]) await test('якір з іншої сторінки: одразу на місці, шапка не перекриває', '/about', w, async p => {
  await p.addInitScript(hashRec);
  await p.goto(BASE + path + '#build-anim', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const ys = window.__ys, y = scrollY, el = document.getElementById('build-anim').getBoundingClientRect(), h = document.querySelector('.sch').getBoundingClientRect();
    return { mid: new Set(ys.filter(v => v > y * 0.1 && v < y * 0.9)).size, y, top: Math.round(el.top), hb: Math.round(h.bottom),
      sb: getComputedStyle(document.documentElement).scrollBehavior, cls: document.documentElement.classList.contains('sb'), vh: innerHeight }; });
  must(r.y > 500, 'сторінка не перейшла до якоря: y=' + r.y);
  must(r.mid <= 2, `плавна прокрутка при завантаженні з якорем: ${r.mid} проміжних положень`);
  must(r.hb > 0, 'шапка схована після переходу на якір');
  must(r.top >= r.hb - 1 && r.top < r.vh * 0.5, `якір не під шапкою: top=${r.top}, шапка до ${r.hb}`);
  must(r.cls && r.sb === 'smooth', 'після завантаження плавність у межах сторінки не ввімкнулась: ' + r.sb);
});
await test('якір у межах сторінки: прокрутка плавна (html.sb одразу, без #)', '/remont-kvartyr-kyiv', 1440, async p => {
  must(await p.evaluate(() => document.documentElement.classList.contains('sb') && getComputedStyle(document.documentElement).scrollBehavior === 'smooth'), 'немає html.sb / scroll-behavior:smooth');
  await p.evaluate(hashRec);
  await p.evaluate(() => { document.querySelector('.scf').id = 't-end'; location.hash = '#t-end'; }); // далека ціль (форма тепер у вікні — #zayavka не прокручує)
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => ({ n: new Set(window.__ys.filter(v => v > scrollY * 0.1 && v < scrollY * 0.9)).size, y: scrollY }));
  must(r.y > 1000 && r.n >= 5, `перехід у межах сторінки не плавний: ${r.n} проміжних положень, y=${r.y}`);
});
await test('якір, reduced-motion: миттєво і з іншої сторінки, і в межах сторінки', '/about', 402, async p => {
  await p.addInitScript(hashRec);
  await p.goto(BASE + '/remont-kvartyr-kyiv#build-anim', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ mid: new Set(window.__ys.filter(v => v > scrollY * 0.1 && v < scrollY * 0.9)).size, y: scrollY, sb: getComputedStyle(document.documentElement).scrollBehavior }));
  must(r.y > 500 && r.mid <= 2 && r.sb === 'auto', `reduced-motion: ${r.mid} проміжних положень, scroll-behavior ${r.sb}`);
}, { reducedMotion: 'reduce' });
// Safari без scroll anchoring (емуляція html{overflow-anchor:none}): видимий вміст не зсувається сам, коли вище довантажуються стилі сцени,
// секції з content-visibility:auto отримують справжню висоту або ініціалізується карусель «Наші проєкти» (резерв висоти + cvSize() в ui-polish.v1.js).
// Міряємо зсув видимих блоків (rect.top) без дії людини: після стрибка до «Наших проєктів» одразу після load і під час прокрутки вгору з #zayavka.
const noAnchor = () => {
  const ins = () => { if (!document.documentElement) return setTimeout(ins, 0); const st = document.createElement('style'); st.textContent = 'html{overflow-anchor:none!important}'; document.documentElement.appendChild(st); }; ins();
  const S = window.__sh = { max: 0, who: '', base: null };
  window.__mark = () => { S.base = [...document.querySelectorAll('main>*, main>*>*, main>*>.w>*, .scf')].filter(e => !e.parentElement.closest('section.bz')) /* вміст самої сцени при збірці перебудовується — стежимо за блоком сцени й усім поза ним */.map(e => [e, e.getBoundingClientRect()]).filter(x => x[1].bottom > 0 && x[1].top < innerHeight).map(x => [x[0], x[1].top]); };
  const f = () => { if (S.base) for (const [e, t] of S.base) { if (!e.isConnected) continue; const d = e.getBoundingClientRect().top - t; if (Math.abs(d) > Math.abs(S.max)) { S.max = Math.round(d); S.who = (e.id || String(e.className).slice(0, 24) || e.tagName) + ' @y' + Math.round(scrollY); } } requestAnimationFrame(f); };
  requestAnimationFrame(f);
};
for (const path of ['/', '/en/', '/ar/', '/remont-kvartyr-kyiv']) for (const w of [402, 1440]) await test('без scroll anchoring (Safari): вміст не зсувається — ' + path, '/404.html', w, async p => {
  await p.addInitScript(noAnchor);
  // 1) одразу після load — стрибок до останньої секції перед формою
  await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(250);
  await p.mouse.move(200, 300);
  await p.evaluate(() => { const e = document.querySelector('.xs-covers') || document.querySelector('.scf'); window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 60, behavior: 'instant' }); window.__mark(); });
  await p.mouse.wheel(0, 1); await p.waitForTimeout(2500);
  let r = await p.evaluate(() => window.__sh);
  must(Math.abs(r.max) <= 4, `після стрибка до секції вміст зсунувся на ${r.max} px (${r.who})`);
  // 2) одразу після load — стрибок у кінець сторінки (форма тепер у вікні); далі — прокрутка вгору кроками (секції й сцена вище отримують справжню висоту)
  await p.goto(BASE + '/404.html'); await p.goto(BASE + path, { waitUntil: 'load' }); await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await p.waitForTimeout(250);
  await p.mouse.move(200, 300); await p.mouse.wheel(0, -1);
  for (let i = 0; i < 40; i++) { const top = await p.evaluate(() => { window.scrollBy({ top: -400, behavior: 'instant' }); window.__mark(); return scrollY <= 0; }); await p.waitForTimeout(120); if (top) break; }
  await p.waitForTimeout(600);
  r = await p.evaluate(() => window.__sh);
  must(Math.abs(r.max) <= 4, `прокрутка вгору з кінця сторінки: вміст зсунувся на ${r.max} px (${r.who})`);
});
// Повільна мережа: CSS/дані сцени приходять, коли людина вже всередині блоку (верх блоку вище екрана; на телефоні блок головної вищий за екран).
// Сцена збирається на місці (висоту тримає резерв site-chrome.v1.css) — раніше чекала, доки блок вийде з кадру, і не зʼявлялась (так падав і perf.mjs --inp).
for (const [path, w, dy] of [['/', 402, 31], ['/remont-kvartyr-kyiv', 402, 200], ['/budivnytstvo-budynkiv-kyiv', 1440, 200]]) await test('сцена: збірка, коли людина вже всередині блоку (повільна мережа)', path, w, async p => {
  await p.route(/\/assets\/(?:build-anim|scene-ui)/, async r => { await new Promise(ok => setTimeout(ok, 1200)); await r.continue().catch(() => {}); });
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift' }); });
  await p.mouse.move(200, 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(150);
  await p.evaluate(dy => { const e = document.getElementById('build-anim'); window.scrollTo({ top: e.getBoundingClientRect().top + scrollY + dy, behavior: 'instant' }); }, dy);
  await p.waitForTimeout(500);
  let before = await p.evaluate(() => ({ cls: window.__cls, nx: Math.round(document.getElementById('build-anim').nextElementSibling.getBoundingClientRect().top), built: !!document.querySelector('#build-anim .bz-nx') }));
  must(!before.built, 'сцена зібралась до приходу CSS/даних — тест не перевіряє збірку в кадрі');
  // головна на телефоні (з 24.11.2026 без рядка номерів блок нижчий за екран): видно низ блоку й вміст під ним — збірка чекає наступної прокрутки (правило CLAUDE.md)
  if (!(await p.waitForSelector('#build-anim .bz-nx', { timeout: 4000 }).catch(() => null))) {
    await p.evaluate(() => window.scrollBy({ top: -240, behavior: 'instant' })); await p.waitForTimeout(50); // низ блоку — нижче екрана: тепер збірка
    before = await p.evaluate(() => ({ cls: window.__cls, nx: Math.round(document.getElementById('build-anim').nextElementSibling.getBoundingClientRect().top) }));
    await p.waitForSelector('#build-anim .bz-nx', { timeout: 8000 });
  }
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({ cls: window.__cls, nx: Math.round(document.getElementById('build-anim').nextElementSibling.getBoundingClientRect().top) }));
  must(after.cls - before.cls <= 0.05, 'CLS збірки в кадрі ' + (after.cls - before.cls).toFixed(3));
  must(Math.abs(after.nx - before.nx) <= 4, `блок під сценою зсунувся на ${after.nx - before.nx} px`);
});
// Резерв компактної сцени головних (21.11.2026): висота блоку до збірки (резерв site-chrome.v1.css, --bzr за мовою й шириною — tools/tests/bzres.mjs)
// і після неї розходиться ≤ 8 px (було −38…+45 px: es/fr/pt +43, zh −19 на 402), CLS збірки в кадрі ≤ 0.05. Повна матриця ширин 320…767 — bzres.mjs.
for (const w of [402, 1440, [375, 667]]) for (const lg of ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'pt', 'ar']) if (!Array.isArray(w) || ['uk', 'pl', 'zh'].includes(lg)) await test('резерв компактної сцени головної: до/після збірки ≤ 8 px', lg === 'uk' ? '/' : `/${lg}/`, w, async p => {
  let go; const gate = new Promise(ok => go = ok);
  await p.route(/\/assets\/build-anim\.v1\.js/, async r => { await gate; await r.continue().catch(() => {}); });
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift' }); });
  await p.mouse.move(100, 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('build-anim').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await p.waitForTimeout(400);
  const h = () => p.evaluate(() => ({ h: document.getElementById('build-anim').getBoundingClientRect().height, cls: window.__cls }));
  const a = await h();
  must(!(await p.evaluate(() => document.getElementById('build-anim').hasAttribute('data-bz-on'))), 'сцена зібралась до приходу скрипта — тест не бачить резерву');
  go();
  await p.waitForSelector('#build-anim .bz-nx', { timeout: 10000 });
  await p.waitForFunction(() => !document.getElementById('build-anim').style.minHeight, null, { timeout: 10000 });
  await p.waitForTimeout(500);
  const b = await h(), d = Math.round(b.h - a.h);
  must(Math.abs(d) <= 8, `резерв ${Math.round(a.h)} px, після збірки ${Math.round(b.h)} px (${d > 0 ? '+' : ''}${d}) — переміряй: node tools/tests/bzres.mjs --write`);
  must(b.cls - a.cls <= 0.05, 'CLS збірки в кадрі ' + (b.cls - a.cls).toFixed(3));
});
// Конфігуратор на телефоні (20.11.2026): назви матеріалів читаються повністю (без «…», ≥ 13 px), без горизонтальної прокрутки сторінки;
// альбомний телефон — фото ліворуч (≥ 55 % ширини), панель матеріалів колонкою праворуч, цілі дотику ≥ 44 px
const kfState = () => { const q = s => document.querySelector(s), vw = innerWidth, vh = innerHeight, pn = q('.kf-panel').getBoundingClientRect(), ns = [...document.querySelectorAll('#kfSw .sw-n')];
  const cs = ns.map(e => getComputedStyle(e));
  return { n: ns.length, cut: ns.filter((e, i) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || cs[i].textOverflow === 'ellipsis' || cs[i].whiteSpace === 'nowrap').map(e => e.textContent).slice(0, 3),
    fs: Math.min(...cs.map(c => parseFloat(c.fontSize))), sw: document.documentElement.scrollWidth - vw, panel: [Math.round(pn.left), Math.round(pn.top), Math.round(pn.right), Math.round(pn.bottom)], vw, vh,
    small: [...document.querySelectorAll('#kfZones button, .kf-rooms button, .kf-tool, #kfSw .sw')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.bottom > 0 && r.top < vh && (r.width < 43.5 || r.height < 43.5)).length }; };
for (const [path, w] of [['/konfigurator', 344], ['/konfigurator', 402], ['/de/interior-konfigurator', 344], ['/es/configurador-interiores', 402], ['/ar/interior-configurator', 430]]) await test('конфігуратор, телефон: назви матеріалів повністю, ≥ 13 px', path, w, async p => {
  await p.waitForSelector('#kfSw .sw-n', { timeout: 8000 });
  const r = await p.evaluate(kfState);
  must(r.n >= 6, 'немає зразків матеріалів');
  must(!r.cut.length, 'назви обрізані: ' + r.cut.join(', '));
  must(r.fs >= 13, 'кегль назв ' + r.fs + ' px');
  must(r.sw <= 0, 'горизонтальна прокрутка сторінки: ' + r.sw + ' px');
  must(!r.small, 'цілі дотику < 44 px: ' + r.small);
});
for (const [path, vp] of [['/konfigurator', [852, 393]], ['/konfigurator', [932, 430]], ['/ar/interior-configurator', [852, 393]], ['/de/interior-konfigurator', [667, 375]]]) await test('конфігуратор, альбомний телефон: фото ≥ 55 % ширини, панель праворуч', path, vp, async p => {
  await p.waitForSelector('#kfSw .sw-n', { timeout: 8000 });
  const r = await p.evaluate(kfState);
  must(r.panel[0] >= r.vw * 0.55 && r.panel[2] <= r.vw + 1 && r.panel[3] <= r.vh + 1 && r.panel[1] >= 0, `панель закриває фото або виходить за екран: ${r.panel} на ${r.vw}×${r.vh}`);
  must(!r.cut.length && r.fs >= 13, 'назви обрізані або дрібні: ' + r.cut.join(', ') + ' ' + r.fs);
  must(r.sw <= 0, 'горизонтальна прокрутка сторінки: ' + r.sw + ' px');
  must(!r.small, 'цілі дотику < 44 px: ' + r.small);
  const h1 = await p.evaluate(() => { const h = document.querySelector('.kf-head h1').getBoundingClientRect(), pn = document.querySelector('.kf-panel').getBoundingClientRect(); return h.right <= pn.left && h.top >= 0 && h.bottom < innerHeight; });
  must(h1, 'H1 під панеллю або поза екраном');
  // вибір матеріалу з панелі працює, фото лишається видимим
  await p.locator('#kfSw .sw').nth(1).tap(); await p.waitForTimeout(300);
  must(await p.locator('#kfSw .sw').nth(1).getAttribute('aria-pressed') === 'true', 'матеріал не вибрано');
});
await test('.lq-go → вікно заявки з контекстом сцени', '/budivnytstvo-budynkiv-kyiv', 1440, async p => {
  await wakeup(p);
  const go = p.locator('.lq-go').first();
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2)); await p.waitForTimeout(1500);
  if (!(await go.count())) throw new Error('немає .lq-go');
  await go.scrollIntoViewIfNeeded(); await go.click(); await p.waitForTimeout(1200);
  const y = await p.locator('#of').evaluate(e => e.getBoundingClientRect().top);
  must(await fdOpen(p) && y > -50 && y < 900, 'вікно заявки не відкрилось після .lq-go: ' + Math.round(y));
  must(await p.evaluate(() => document.activeElement.id === 'oPhone'), 'після .lq-go фокус не на телефоні');
  const inScene = await go.evaluate(e => !!e.closest('section.bz[data-bz]'));
  if (inScene) must((await p.inputValue('#oMsg')).length > 5, 'конфігурація сцени не перенесена в #oMsg');
});
await test('квіз: крок і перехід до форми', '/remont-kvartyr-kyiv', 402, async p => {
  await wakeup(p);
  const q = p.locator('.qz, [class*="quiz"]').first();
  if (!(await q.count())) return; // квізу на сторінці немає
  await q.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  const opt = q.locator('button, label').first();
  must(await opt.count(), 'квіз без варіантів');
  await opt.click(); await p.waitForTimeout(300);
});
await test('калькулятор: площа → сума', '/kalkuliator-remontu', 1440, async p => {
  const inp = p.locator('#cArea');
  must(await inp.count(), 'немає поля площі');
  const before = await p.locator('main').innerText();
  await inp.fill('120').catch(async () => { await inp.evaluate(e => { e.value = 120; e.dispatchEvent(new Event('input', { bubbles: true })); }); });
  await inp.dispatchEvent('input'); await inp.dispatchEvent('change'); await p.waitForTimeout(500);
  const after = await p.locator('main').innerText();
  must(after !== before && /\$\s?\d|\d[\d\s]*\s?\$/.test(after), 'сума не змінилась');
});
// Роздільник тисяч U+202F (21.11.2026): у Manrope/Cormorant гліфа немає, Chrome малював ~0.1em («$1100»); свій гліф 0.2em — блок /*nn*/
// у site-chrome.v1.css (tools/fonts/nnbsp.py), грані тих самих сімейств з unicode-range:U+202F, оголошені ПІСЛЯ основних.
const nnW = p => p.evaluate(async () => {
  await document.fonts.ready;
  const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue, el = n.parentElement;
    if (t.indexOf(' ') < 0 || !el || el.closest('script,style,template,noscript,svg') || !el.getClientRects().length) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    for (let i = 0; i < t.length; i++) if (t[i] === ' ') {
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      const b = r.getBoundingClientRect(); if (b.height) out.push(+(b.width / fs).toFixed(3));
    }
  }
  return out;
});
await test('роздільник тисяч U+202F видно: 0.2em у сумі калькулятора й рядках цін (uk, de, ar), не ~0.1em', '/kalkuliator-remontu', 402, async p => {
  await p.locator('#cArea').fill('1200'); await p.locator('#cArea').dispatchEvent('input'); await p.waitForTimeout(300);
  must(/ /.test(await p.locator('#cSum').innerText()), 'у сумі калькулятора немає U+202F');
  for (const u of [null, '/vartist-budivnytstva-budynku-kyiv', '/de/renovierungskosten-rechner', '/ar/renovation-calculator']) {
    if (u) { await p.goto(BASE + u, { waitUntil: 'load' }); await p.waitForTimeout(200); }
    const ws = await nnW(p);
    must(ws.length >= 2, `${u || 'калькулятор'}: у видимому тексті немає цін з U+202F`);
    const bad = ws.filter(x => x < 0.18 || x > 0.24);
    must(!bad.length, `${u || 'калькулятор'}: U+202F ${bad.slice(0, 4).join(', ')}em — має бути 0.2em (блок /*nn*/ у site-chrome.v1.css після основних @font-face)`);
  }
});
// Один шрифт — Manrope (Михайло 24.11.2026: «Зроби всюди такий шрифт» → «Усе рівним шрифтом»): видимий текст і заголовки — Manrope
// (текст — "Manrope", заголовки — "Manrope H": ті самі файли з size-adjust); zh — Manrope перед CJK, ar — "CAS NN", далі Manrope;
// Cormorant Garamond — лише логотип (.sch-logo); жодного запиту cormorant-cyrillic / cormorant-italic; кабінет — теж Manrope
await test('один шрифт: текст і заголовки — Manrope, Cormorant лише в логотипі (uk, послуги, лендинг, блог, проєкт, en, zh, ar, кабінет)', '/', 402, async p => {
  for (const u of ['/', '/services', '/remont-kvartyr-kyiv', '/blog/avtorskyi-nahliad-navishcho', '/proekty/monpark', '/about', '/en/', '/de/', '/zh/', '/ar/', '/kabinet']) {
    if (u !== '/') { await p.goto(BASE + u, { waitUntil: 'load' }); await p.waitForTimeout(200); }
    const r = await p.evaluate(async () => {
      await document.fonts.ready;
      const ar = document.documentElement.lang === 'ar', bad = [], logo = [];
      let n = 0, h = 0;
      for (const e of document.querySelectorAll('p, a, button, input, textarea, select, li, span, label, summary, small, b, strong, em, h1, h2, h3, h4, figcaption, td, th, dd, dt')) {
        if (e.closest('svg, script, style, template, noscript') || !e.getClientRects().length) continue;
        const own = e.matches('input, textarea, select') ? 'x' : [...e.childNodes].filter(c => c.nodeType === 3).map(c => c.nodeValue).join('');
        if (!/[\p{L}\p{N}]/u.test(own)) continue; // лише символи-іконки (‹ › ✕) — свій стек
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const ff = cs.fontFamily.replace(/["']/g, '').split(',').map(x => x.trim());
        const first = ar && ff[0] === 'CAS NN' ? ff[1] : ff[0];
        if (e.closest('.sch-logo')) { if (!/^Cormorant Garamond$/.test(ff[0])) logo.push(cs.fontFamily.slice(0, 40)); continue; }
        n++; if (/^H\d$/.test(e.tagName)) h++;
        if (!/^Manrope/.test(first || '')) bad.push(`${e.tagName.toLowerCase()}.${e.className || ''}: ${cs.fontFamily.slice(0, 50)}`);
        if (cs.fontStyle === 'italic') bad.push(`${e.tagName.toLowerCase()}.${e.className || ''}: курсив (у Manrope його немає — синтетичний нахил)`);
      }
      const fonts = performance.getEntriesByType('resource').map(x => x.name).filter(x => /cormorant-(cyrillic|italic)/i.test(x));
      return { n, h, bad, logo, fonts };
    });
    must(r.n > 10, `${u}: замало видимих текстових елементів (${r.n})`);
    must(!r.bad.length, `${u}: не Manrope — ${[...new Set(r.bad)].slice(0, 4).join(' | ')}`);
    must(!r.logo.length, `${u}: логотип не Cormorant — ${r.logo[0]}`);
    must(!r.fonts.length, `${u}: вантажиться ${r.fonts.join(', ')}`);
  }
});
// Сцени (Михайло 24.11.2026 «Номери етапів під сценою… лиши тільки стрілки і лінію прогресу» → «замість нумерації постав енкодер»):
// у панелі — ← → і енкодер (role=slider, aria-valuetext «Етап i з N: назва»); немає рядка номерів, кнопки паузи й лічильника «01 / N»
for (const [u, w, tab] of [['/', 402, 0], ['/', 1440, 2], ['/ar/', 402, 0], ['/budivnytstvo-budynkiv-kyiv', 1440, -1], ['/landshaftnyi-dyzain-kyiv', 1440, -1], ['/remont-kvartyr-kyiv', 1440, -1], ['/remont-kvartyr-kyiv', 402, -1], ['/ar/turnkey-renovation', 402, -1]]) await test('сцена: лише стрілки й енкодер — без номерів, паузи й лічильника', u, w, async p => {
  await wakeup(p);
  await p.evaluate(() => { try { localStorage.setItem('casScHint', '1'); } catch (e) { } });
  await p.locator('section.bz').first().scrollIntoViewIfNeeded(); await p.waitForSelector('section.bz .sc-enc', { timeout: 15000 });
  if (tab > 0) await scTab(p, tab);
  const r = await p.evaluate(`(()=>{const s=${SCN},e=s.querySelector('.sc-enc'),vis=q=>[...s.querySelectorAll(q)].filter(x=>x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden');
    const r=e.getBoundingClientRect();return {nums:vis('.sc-n,.bz-nav .bz-b,.bz-nav').length,pause:vis('.sc-ap,.bz-ap,.la-play').length,ct:vis('.sc-ct,.bz-ct,.la-cnt').length,
    arrows:vis('.bz-nx,.sc-next,.la-next,.bz-pv,.sc-prev,.la-prev').length,row:vis('.bz-nx,.sc-next,.la-next,.bz-pv,.sc-prev,.la-prev').filter(x=>{const b=x.getBoundingClientRect();return Math.abs(b.top+b.height/2-r.top-r.height/2)<=12&&b.width>=44&&b.height>=44}).length,role:e.getAttribute('role'),vt:e.getAttribute('aria-valuetext')||'',h:Math.round(r.height),max:+e.getAttribute('aria-valuemax')}})()`);
  must(!r.nums && !r.pause && !r.ct, 'у панелі сцени лишились номери/пауза/лічильник: ' + JSON.stringify(r));
  must(r.arrows >= 2 && r.row >= 2, 'немає стрілок ← → (≥ 44 px) в одному ряду з енкодером: ' + JSON.stringify(r));
  must(r.role === 'slider' && r.max > 1 && /\d/.test(r.vt) && r.h >= 44, 'енкодер: ' + JSON.stringify(r));
  // клавіші з фокусом: End → останній, Home → перший; тап по лінії — етап під пальцем
  // повна sticky-сцена: go() плавно прокручує доріжку, casDrive доганяє етап — чекаємо до 20 с
  const val = v => p.waitForFunction(`+${SCN}.querySelector('.sc-enc').getAttribute('aria-valuenow')===${v}`, null, { timeout: 40000 }).then(() => v).catch(() => p.evaluate(`+${SCN}.querySelector('.sc-enc').getAttribute('aria-valuenow')`));
  const still = () => p.evaluate(async () => { let y = -1; for (let i = 0; i < 80 && y !== scrollY; i++) { y = scrollY; await new Promise(ok => setTimeout(ok, 400)); } }); // плавна прокрутка доріжки дійшла
  await p.evaluate(`${SCN}.querySelector('.sc-enc').focus()`);
  // без паузи: дія з енкодером сама глушить автопрогравання на 9 с (casAuto слухає у фазі перехоплення) — сцена не перестрибує з 1-го етапу на 2-й
  await p.keyboard.press('End'); await still();
  const v1 = await val(r.max);
  await p.keyboard.press('Home'); await still();
  const v2 = await val(1);
  await p.waitForTimeout(1500);
  const v3 = +await p.evaluate(`${SCN}.querySelector('.sc-enc').getAttribute('aria-valuenow')`);
  must(v1 === r.max && v2 === 1 && v3 === 1, `Home/End: ${v1}, ${v2}, через 1.5 с — ${v3} (N=${r.max})`);
  // пробіл на енкодері — пауза / відтворення автопрогравання
  const st0 = await p.evaluate(`${SCN}.querySelector('.sc-enc').getAttribute('data-st')`);
  if (st0) { await p.keyboard.press(' '); must(await p.evaluate(`${SCN}.querySelector('.sc-enc').getAttribute('data-st')`) !== st0, 'пробіл на енкодері не перемкнув автопрогравання'); }
  // ручка цілком у межах енкодера на першому й останньому етапі (не обрізана краєм)
  const kb = await p.evaluate(`(()=>{const e=${SCN}.querySelector('.sc-enc'),k=e.querySelector('.sc-ek').getBoundingClientRect(),r=e.getBoundingClientRect();return [Math.round(k.left-r.left),Math.round(r.right-k.right)]})()`);
  must(kb[0] >= 0 && kb[1] >= 0, 'ручка енкодера виходить за край: ' + kb);
});
// ar (RTL): «$2 500», не «2 500$» — ціни у видимому тексті й data-xs в ізоляті LTR U+2066…U+2069 (chrome.price_iso, як iso() у calc.v1.js)
for (const u of ['/ar/interior-design', '/ar/interior-design-worldwide', '/ar/apartment-renovation-cost']) {
  await test('ar: знак $ ліворуч від числа (ізолят LTR) — рядок ціни hero, текст, data-xs', u, 402, async p => {
    const r = await p.evaluate(() => {
      const out = { n: 0, bad: [], xs: [] }, w = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
      for (let t; (t = w.nextNode());) {
        const s = t.nodeValue, rx = /\$(?=\d)/g;
        for (let m; (m = rx.exec(s));) {
          const a = document.createRange(), b = document.createRange();
          a.setStart(t, m.index); a.setEnd(t, m.index + 1); b.setStart(t, m.index + 1); b.setEnd(t, m.index + 2);
          const ra = a.getClientRects()[0], rb = b.getClientRects()[0];
          if (!ra || !rb || !ra.width || Math.abs(ra.top - rb.top) > 4) continue; // приховане або перенос рядка
          out.n++;
          if (ra.left > rb.left) out.bad.push(s.slice(Math.max(0, m.index - 12), m.index + 8));
        }
      }
      document.querySelectorAll('[data-xs*="$"]').forEach(e => { if (!/\u2066\$\d[^\u2069]*\u2069/.test(e.dataset.xs)) out.xs.push(e.dataset.xs); });
      return out;
    });
    must(r.n >= 1, 'не знайдено видимих цін «$…»');
    must(!r.bad.length, `«$» праворуч від числа: ${r.bad.slice(0, 3).join(' | ')}`);
    must(!r.xs.length, `data-xs без ізоляту: ${r.xs.slice(0, 2).join(' | ')}`);
  });
}
// калькулятор — кілька позицій одразу (Михайло 20.11.2026): плитки #cIt [data-k] (aria-pressed), уточнення #cV [data-k] [data-p], площа #cArea, сотки #cLand
// «Отримати точний кошторис» відкриває вікно заявки (24.11.2026): перевіряємо й закриваємо (Esc), щоб далі клацати калькулятор
const cSendEsc = async (p, ms = 300) => { await p.click('#cSend'); await p.waitForTimeout(ms); must(await fdOpen(p), 'калькулятор не відкрив вікно заявки'); await p.keyboard.press('Escape'); await p.waitForTimeout(150); };
const cTile = (p, k) => p.locator(`#cIt [data-k="${k}"]`);
const cOn = async (p, k) => (await cTile(p, k).getAttribute('aria-pressed')) === 'true';
const cOnly = async (p, ...ks) => { for (const k of ['design', 'reno', 'furn', 'build', 'arch', 'land']) if ((await cOn(p, k)) !== ks.includes(k)) await cTile(p, k).click(); await p.waitForTimeout(150); };
const cVar = async (p, k, v) => { await p.click(`#cV [data-k="${k}"] [data-p="${v}"]`); await p.waitForTimeout(100); };
await test('калькулятор: 0 → «—», дизайн для 10 м² — мінімум $2 500, величезна площа обмежена', '/kalkuliator-remontu', 402, async p => {
  const set = async v => { await p.fill('#cArea', v); await p.dispatchEvent('#cArea', 'input'); await p.waitForTimeout(150); return p.textContent('#cSum'); };
  const nb = s => s.replace(/[\u00a0\u202f]/g, ' ');
  must((await set('0')) === '—', 'площа 0 не дає «—»');
  must((await set('abc').catch(() => '—')) === '—', 'нечислове значення');
  must((await set('-5')) === '—', 'відʼємна площа');
  await cOnly(p, 'design', 'reno', 'furn'); await cVar(p, 'design', 'dz');
  await set('10');
  must(nb(await p.textContent('#cRows')).includes('$2 500'), 'дизайн 10 м² не дорівнює мінімуму $2 500');
  const big = (await set('99999999')).replace(/\D/g, '');
  must(+big <= 100000 * (550 + 45 + 250) + 1, 'площа не обмежена: ' + big);
  // пакети дизайну: планувальний $6/м² і повний $45/м² — теж мінімум $2 500
  await set('1000'); await cVar(p, 'design', 'plan');
  must(nb(await p.textContent('#cRows')).includes('$6 000'), 'планувальний 1000 м² ≠ $6 000');
  await cVar(p, 'design', 'full'); await set('20');
  must(nb(await p.textContent('#cRows')).includes('$2 500'), 'повний 20 м² не дорівнює мінімуму $2 500');
  // ±5% — лише для ремонту
  must(/±5/.test(await p.textContent('#cNote')), 'немає ±5% для ремонту');
  await cOnly(p, 'build'); must(!/±5/.test(await p.textContent('#cNote')), '±5% для будівництва');
  must(await p.locator('#cV [data-k="build"]').isVisible() && await p.locator('#cV [data-k="reno"]').isHidden(), 'уточнення не лише для вибраних позицій');
  // ремонт і будівництво — одна площа: вибір одного знімає інше
  await cTile(p, 'reno').click(); await p.waitForTimeout(150);
  must(await cOn(p, 'reno') && !(await cOn(p, 'build')) && await p.locator('#cRows li').count() === 1, 'ремонт і будівництво вибрані разом');
  // Європа: ремонт $850, дизайн мін. $4 000, меблювання $400; офіс і ландшафт — за кошторисом
  await cOnly(p, 'design', 'reno', 'furn'); await p.click('#cReg [data-r="1"]'); await cVar(p, 'design', 'dz'); await set('10');
  must(nb(await p.textContent('#cRows')).includes('$8 500') && (nb(await p.textContent('#cRows')).match(/\$4 000/g) || []).length === 2, 'ставки Європи: ' + await p.textContent('#cRows'));
  await cVar(p, 'design', 'plan');
  must(/кошторис/.test(await p.textContent('#cRows')) && await p.locator('#cPlus').isVisible(), 'планувальний у Європі не «за кошторисом»');
  await cOnly(p, 'reno'); await cVar(p, 'reno', 'office');
  must(/кошторис/.test(await p.textContent('#cSum')) && await p.locator('#cSumL').isHidden(), 'офіс у Європі не «за кошторисом»');
  await cOnly(p, 'land');
  must((await p.inputValue('#cLand')) === '10' && /сот/.test(await p.textContent('label[for="cLand"]')) && await p.locator('#cAreaW').isHidden(), 'ландшафт — не в сотках (своє поле)');
  must(/кошторис/.test(await p.textContent('#cSum')), 'ландшафт у Європі не «за кошторисом»');
  await p.click('#cReg [data-r="0"]'); await p.fill('#cLand', '12.5'); await p.waitForTimeout(150);
  must(nb(await p.textContent('#cSum')) === '$625', 'ландшафт 12,5 сотки ≠ $625');
  await cSendEsc(p);
  must((await p.inputValue('#oArea')) === '1250', 'сотки не перетворено на м² у формі');
  const ms = await p.inputValue('#oMsg'), sv = await p.getAttribute('#of', 'data-service');
  must(/Україна/.test(ms) && /Ландшафт/.test(ms) && /Ландшафт/.test(sv) && /Україна/.test(sv), 'регіон/послуга не в формі: ' + ms + ' | ' + sv);
  await cOnly(p, 'reno'); await cVar(p, 'reno', 'reno');
  must(await p.locator('#cArea').isVisible() && (await p.inputValue('#cArea')) === '10' && await p.locator('#cLandW').isHidden(), 'поле м² не повернулось після соток');
  await p.click('#cReg [data-r="1"]');
  await set('60'); await cSendEsc(p);
  const m1 = await p.inputValue('#oMsg'); must(/Європа/.test(m1) && /Європа/.test(await p.getAttribute('#of', 'data-service')), 'Європа не в формі');
  await set('80'); await cSendEsc(p);
  must((await p.inputValue('#oMsg')) !== m1 && (await p.inputValue('#oArea')) === '80', 'повторний розрахунок не оновив форму');
});
await test('калькулятор: кома, помилка й стеля поля, розбивка рядками, Enter, підписи для читалки', '/kalkuliator-remontu', 402, async p => {
  const set = async v => { await p.fill('#cArea', v); await p.waitForTimeout(120); };
  must(await p.getAttribute('#cArea', 'inputmode') === 'decimal' && await p.locator('label[for="cArea"]').count() === 1, 'поле площі без inputmode/підпису');
  must(await p.locator('#calc [role="group"][aria-labelledby="cItL"] #cIt').count() === 1 && (await p.textContent('#cItL')).trim().length > 3, 'плитки «Що порахувати» без підпису групи');
  must(await p.locator('#cIt button[aria-pressed]').count() === 6 && await p.locator('#calc select, #calc input[type=checkbox]').count() === 0, 'плитки без aria-pressed або лишився список/прапорець');
  await set('75,6'); must((await p.textContent('#cSum')).replace(/\D/g, '') === String(76 * 550), 'кома в площі: ' + await p.textContent('#cSum'));
  must(await p.locator('#cRows li').count() === 1 && /76 м² × \$550\/м²/.test(await p.textContent('#cRows')), 'розбивка без «площа × ставка»: ' + await p.textContent('#cRows'));
  await set('abc');
  must(await p.getAttribute('#cArea', 'aria-invalid') === 'true' && await p.locator('#cAreaE').isVisible() && (await p.textContent('#cSum')) === '—', 'нечислова площа без помилки');
  must(await p.getAttribute('#cArea', 'aria-describedby') === 'cAreaE', 'помилка не повʼязана з полем');
  await set('-3'); must(await p.getAttribute('#cArea', 'aria-invalid') === 'true', 'відʼємна площа без помилки');
  await set('500000'); must(/100 000/.test((await p.textContent('#cAreaE')).replace(/\u00a0/g, ' ')) && await p.getAttribute('#cArea', 'aria-invalid') === 'false', 'стеля без підказки: ' + await p.textContent('#cAreaE'));
  await set(''); must(await p.locator('#cAreaE').isHidden() && (await p.textContent('#cSum')) === '—', 'порожнє поле — помилка або сума');
  await p.fill('#cArea', '40'); await p.press('#cArea', 'Enter'); await p.waitForTimeout(100);
  must((await p.textContent('#cSum')).replace(/\D/g, '') === '22000', 'Enter не перерахував');
  await cTile(p, 'design').click(); await cTile(p, 'furn').click(); await p.waitForTimeout(150);
  must(await p.locator('#cRows li').count() === 3 && /мінімум \$2\u202f500/.test(await p.textContent('#cRows')), 'дизайн 40 м² не показує мінімум: ' + await p.textContent('#cRows'));
  must(await p.getAttribute('#cSumP', 'aria-live') === 'polite', 'сума не озвучується');
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'горизонтальна прокрутка');
});
for (const [path, rx] of [['/ru/kalkulyator-remonta', /Калькулятор/], ['/en/renovation-cost-calculator', /Calculator/], ['/es/calculadora-reforma', /Calculadora/], ['/zh/renovation-calculator', /计算器/],
  ['/pl/kalkulator-remontu', /Kalkulator/], ['/de/renovierungskosten-rechner', /Rechner/], ['/fr/calculateur-renovation', /Calculateur/], ['/pt/calculadora-obras', /Calculadora/], ['/ar/renovation-calculator', /الحاسبة/]]) {
  await test('калькулятор мовою: сума, кома/крапка, конфіг → форма (data-service, #oMsg, площа)', path, 402, async p => {
    must(/\$/.test(await p.textContent('#cSum')), 'немає суми');
    await p.fill('#cArea', '80,5'); await p.waitForTimeout(120);
    must((await p.textContent('#cSum')).replace(/\D/g, '') === String(81 * 550), 'кома: ' + await p.textContent('#cSum'));
    await cSendEsc(p);
    must(rx.test(await p.getAttribute('#of', 'data-service')) && (await p.getAttribute('#of', 'data-form')) === 'calc', 'послуга/місце не в формі');
    must((await p.inputValue('#oArea')) === '81' && /\$/.test(await p.inputValue('#oMsg')), 'площа/розрахунок не в формі');
  });
}
// «Ремонт» і «Будівництво будинку» разом не вибираються: вибір одного знімає інше — під плитками пояснення мовою сторінки (aria-live), висота блоку та сама
for (const [path, w, reno, build] of [['/kalkuliator-remontu', 402, 'Ремонт', 'Будівництво будинку'], ['/kalkuliator-remontu', 1440, 'Ремонт', 'Будівництво будинку'], ['/en/renovation-cost-calculator', 402, 'Renovation', 'House construction'],
  ['/de/renovierungskosten-rechner', 344, 'Renovierung', 'Hausbau'], ['/ar/renovation-calculator', 402, 'التجديد', 'بناء منزل']]) await test('калькулятор, кілька позицій: пояснення, коли ремонт знімає будівництво (і навпаки), без стрибка висоти', path, w, async p => {
  const st = () => p.evaluate(() => { const c = document.getElementById('calc'), on = c.querySelector('.cx>.on'), r = on && on.getBoundingClientRect(), nx = document.getElementById('cV').getBoundingClientRect(), it = document.getElementById('cIt').getBoundingClientRect();
    return { vis: on ? on.textContent : '', x: on ? on.getAttribute('data-x') : '', live: document.getElementById('cEx').textContent, top: Math.round(document.getElementById('cSend').getBoundingClientRect().top + scrollY), fs: on ? parseFloat(getComputedStyle(on).fontSize) : 0,
      fit: !on || (r.top >= it.bottom - 1 && (document.getElementById('cV').hidden || r.bottom <= nx.top + 1) && r.left >= 0 && r.right <= innerWidth), sw: document.documentElement.scrollWidth <= innerWidth }; });
  const press = k => p.click(`#cIt button[data-k="${k}"]`);
  let a = await st(); must(!a.vis && !a.live, 'пояснення видно до дії: ' + a.vis);
  await press('build'); let b = await st(); // типово вибрано ремонт → будівництво його знімає
  must(await p.getAttribute('#cIt button[data-k="reno"]', 'aria-pressed') === 'false', 'ремонт не знято');
  must(b.x === 'build' && b.vis.includes(build) && b.live === b.vis, `немає пояснення про «${build}»: «${b.vis}» / aria-live «${b.live}»`);
  must(b.fs >= 13 && b.fit && b.sw, `пояснення не вміщується під плитками або дрібне: ${b.fs}px, fit=${b.fit}`);
  await press('reno'); let c = await st();
  must(c.x === 'reno' && c.vis.includes(reno) && c.vis !== b.vis && c.live === c.vis, `немає пояснення про «${reno}»: «${c.vis}»`);
  must(c.top === a.top, `висота блоку стрибнула: кнопка ${a.top} → ${c.top}`); // той самий вибір, що на старті (лише ремонт) — та сама висота
  await press('design'); const d = await st(); must(!d.vis && !d.live, 'пояснення не зникло після наступної дії');
  await press('design'); await press('reno'); await press('reno'); const e = await st(); must(!e.vis, 'пояснення зʼявилось без зняття іншої позиції');
});
// ar (RTL): ціна в рядку результату й примітці — «$» ліворуч від числа (як на плитках і в сумі), не «2 500$»
await test('калькулятор (ar, RTL): мінімум дизайну — «$2 500», знак $ ліворуч від числа', '/ar/renovation-calculator?k=design', 402, async p => {
  await p.fill('#cArea', '10');
  const r = await p.evaluate(() => { const out = {};
    for (const [k, el] of [['row', document.querySelector('#cRows em')], ['note', document.getElementById('cNote')]]) {
      const tn = [...el.childNodes].find(n => n.nodeType === 3), t = tn.textContent, i = t.lastIndexOf('$'), rg = document.createRange();
      rg.setStart(tn, i); rg.setEnd(tn, i + 1); const a = rg.getBoundingClientRect(); rg.setStart(tn, i + 1); rg.setEnd(tn, i + 2); const b = rg.getBoundingClientRect();
      out[k] = { t, ok: a.left < b.left && Math.abs(a.top - b.top) < 4, iso: /⁦\$2 500⁩/.test(t) }; }
    return out; });
  must(r.row.iso && r.row.ok, 'рядок результату: «$» не ліворуч від числа — ' + JSON.stringify(r.row.t));
  must(r.note.iso && r.note.ok, 'примітка: «$» не ліворуч від числа — ' + JSON.stringify(r.note.t));
  await cSendEsc(p, 400);
  must(!/[⁦⁩]/.test(await p.inputValue('#oMsg')), 'службові знаки напрямку потрапили в коментар заявки');
});
await test('калькулятор (ar, RTL): Європа й ландшафт', '/ar/renovation-calculator', 402, async p => {
  await p.click('#cReg [data-r="1"]'); await cOnly(p, 'land');
  must((await p.textContent('#cSum')).includes('المقايسة'), 'ar: ландшафт у Європі не «وفق المقايسة»');
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ar: горизонтальна прокрутка');
});
await test('Оздоба: кошик — мінімум 10 шт і $10 000, знижка 3%, заявка: 500 — без успіху, 200 — номер', '/ozdoba', 402, async p => {
  await p.waitForFunction(() => typeof DATA !== 'undefined' && DATA && DATA.items && DATA.items.length);
  const r = await p.evaluate(async () => {
    const it = DATA.items.find(i => i.price != null && !i.ss && i.price * 10 < 460000);
    openItem(it.id); addToCart(); openCart(); await new Promise(s => setTimeout(s, 200));
    const low = document.getElementById('sheetCart').innerText;
    cart[0].qty = Math.ceil(470000 / it.price); renderCart();
    return { q: cart[0].qty, low: low.replace(/\s/g, ' '), big: document.getElementById('sheetCart').innerText };
  });
  must(r.low.includes('460 000') && /10/.test(r.low), 'немає підказки про мінімальне замовлення');
  must(/−3%/.test(r.big), 'немає знижки за обсягом 3%');
  await p.evaluate(() => openPay()); await p.waitForTimeout(300);
  await p.fill('#fPhone', '+48 512 345 678');
  posts = []; apiStatus = 500;
  await p.click('#sendBtn'); await p.waitForTimeout(800);
  must(!(await p.locator('#payBody .done').count()), 'успіх показано при 500');
  apiStatus = 200;
  await p.click('#sendBtn'); await p.waitForTimeout(800);
  must(await p.locator('#payBody .done').count() && (await p.textContent('#payBody')).includes('OZD-TEST-1'), 'немає успіху з номером при 200');
  const b = JSON.parse(posts.filter(x => x.path === '/api/orders').at(-1).body);
  must(b.cart[0].qty >= 10 && b.phone.includes('512'), 'кошик/телефон не в заявці');
});
await test('карта проєктів: постер → інтерактивна', '/portfolio', 1440, async p => {
  const m = p.locator('.cmap').first();
  await m.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  await m.click({ position: { x: 60, y: 60 } }).catch(() => {});
  await p.waitForTimeout(2500);
  must(await p.locator('.cmap-ready, .cmap .maplibregl-canvas, .cmap canvas').count(), 'карта не стала інтерактивною');
  const fly = p.locator('.cmap-list .cmap-fly').first(); // «Показати на карті» — без переходу на сторінку проєкту
  must(await fly.count() && await fly.isVisible(), 'немає кнопки «Показати на карті»');
  const url = p.url(); await fly.click(); await p.waitForTimeout(800);
  must(p.url() === url, 'кнопка «Показати на карті» перейшла на іншу сторінку');
});
// ── лайтбокс фото (/assets/lightbox.v1.js, tools/site/lbox.py): один на весь сайт; тап → відкрито з великою копією, свайп ←/→, щипок/подвійний тап — зум
//    (свайп при зумі не гортає), «Назад» і свайп униз закривають без переходу, Esc/тло, фокус усередині й повернення, RTL — дзеркально, довга галерея — хвіст з JSON
const lbState = p => p.evaluate(() => window.casLb && casLb.state());
async function touches(p) {
  const cdp = await p.context().newCDPSession(p);
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  return {
    swipe: async (x0, y0, x1, y1) => { await t('touchStart', [[x0, y0]]); for (let i = 1; i <= 8; i++) { await t('touchMove', [[x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8]]); await p.waitForTimeout(16); } await t('touchEnd', []); await p.waitForTimeout(350); },
    pinch: async (cx, cy, d0, d1) => { await t('touchStart', [[cx - d0, cy], [cx + d0, cy]]); for (let i = 1; i <= 10; i++) { const d = d0 + (d1 - d0) * i / 10; await t('touchMove', [[cx - d, cy], [cx + d, cy]]); await p.waitForTimeout(16); } await t('touchEnd', []); await p.waitForTimeout(300); },
    dbl: async (x, y) => { for (let k = 0; k < 2; k++) { await t('touchStart', [[x, y]]); await t('touchEnd', []); await p.waitForTimeout(80); } await p.waitForTimeout(350); },
  };
}
for (const [path, rtl] of [['/proekty/monpark', false], ['/ar/proekty/monpark', true]]) await test('лайтбокс на телефоні: тап, велика копія, свайп, щипок, подвійний тап, «Назад», свайп униз' + (rtl ? ' (RTL)' : ''), path, 402, async p => {
  const W = 402, H = 874, url = p.url();
  const a = p.locator('a[data-lb]').first(); await a.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await a.tap(); await p.waitForTimeout(600);
  let s = await lbState(p);
  must(s && s.open && s.i === 0 && s.n > 1, 'лайтбокс не відкрився тапом');
  must(p.url() === url, 'тап по фото перейшов на файл');
  const im = await p.evaluate(() => { const i = document.querySelector('.clb-im'), w = +(i.currentSrc.match(/-(\d+)\.webp/) || [])[1]; return { w, slot: i.getBoundingClientRect().width * devicePixelRatio, lb: document.querySelector('a[data-lb]').getAttribute('data-lb') }; });
  const maxW = Math.max(...im.lb.split(',').map(Number));
  must(im.w >= Math.min(im.slot, maxW) * 0.95, `лайтбокс показує малу копію: ${im.w}w на кадр ${Math.round(im.slot)} px`);
  must(await p.evaluate(() => document.getElementById('clb').contains(document.activeElement)), 'фокус не в лайтбоксі');
  const g = await touches(p);
  await g.swipe(W * .8, H / 2, W * .2, H / 2); // палець вліво: далі (RTL — назад)
  s = await lbState(p); must(s.i === (rtl ? s.n - 1 : 1), `свайп ← не гортає: ${s.i}`);
  await g.swipe(W * .2, H / 2, W * .8, H / 2);
  s = await lbState(p); must(s.i === 0, `свайп → не повертає: ${s.i}`);
  await g.pinch(W / 2, H / 2, 40, 140); s = await lbState(p); must(s.z > 1.5, `щипок не збільшує: ${s.z}`);
  await g.swipe(W * .7, H / 2, W * .3, H / 2); s = await lbState(p); must(s.i === 0 && s.z > 1.5, 'свайп при зумі гортає фото замість пересування');
  await g.dbl(W / 2, H / 2); s = await lbState(p); must(s.z === 1, `подвійний тап не скидає зум: ${s.z}`);
  await g.dbl(W / 2, H / 2); s = await lbState(p); must(s.z > 2, `подвійний тап не збільшує: ${s.z}`);
  await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await p.waitForTimeout(500);
  s = await lbState(p); must(!s.open && p.url() === url, '«Назад» не закрив лайтбокс або пішов зі сторінки');
  await a.scrollIntoViewIfNeeded(); await a.tap(); await p.waitForTimeout(600);
  must((await lbState(p)).open, 'лайтбокс не відкрився вдруге');
  await g.swipe(W / 2, H * .4, W / 2, H * .85);
  s = await lbState(p); must(!s.open && p.url() === url, 'свайп униз не закрив лайтбокс');
});
await test('лайтбокс на ПК: клік, ‹ ›, ←/→, Tab усередині, Esc → фокус на мініатюрі; довга галерея — хвіст з JSON', '/proekty/petrivtsi-house', 1440, async p => {
  const a = p.locator('a[data-lb]').nth(22); await a.scrollIntoViewIfNeeded(); await a.click(); await p.waitForTimeout(500);
  let s = await lbState(p); must(s && s.open && s.i === 22 && s.n >= 100, `лайтбокс не відкрився кліком: ${JSON.stringify(s)}`);
  await p.click('.clb-n'); await p.waitForTimeout(250); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(800);
  s = await lbState(p); must(s.i === 25 && /-\d+\.webp/.test(s.src), `‹ › / → не дійшли до хвоста галереї: ${s.i}`);
  for (let k = 0; k < 4; k++) await p.keyboard.press('Tab');
  must(await p.evaluate(() => document.getElementById('clb').contains(document.activeElement)), 'Tab вийшов з лайтбокса');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  s = await lbState(p); must(!s.open, 'Esc не закрив');
  must(await p.evaluate(() => !!document.activeElement.closest('a[data-lb]')), 'фокус не повернувся на мініатюру');
  await a.click(); await p.waitForTimeout(500); await p.mouse.click(200, 120); await p.waitForTimeout(500);
  must(!(await lbState(p)).open, 'клік по тлу не закрив');
});
await test('«Наші проєкти» лендингу: тап по фото — на сторінку проєкту (картка-посилання)', '/dyzain-interieru-kyiv', 402, async p => {
  const b = p.locator('[data-c="x"]:has(.gal) .ux-h').first();
  if (await b.count()) { await b.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await b.click(); await p.waitForTimeout(500); }
  const hit = await p.evaluate(() => { const im = document.querySelector('.gal figure img'); if (!im) return 'немає .gal'; im.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = im.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const l = el && el.closest('a[href]'); return l ? l.getAttribute('href') : 'під пальцем ' + (el && el.tagName); });
  must(/^\/proekty\//.test(hit) || hit === 'немає .gal', `фото «Наших проєктів» не веде на кейс: ${hit}`);
});
// ── шляхи до заявки (CRO, 16.11.2026): кожен лід несе послугу, місце (source …#місце, form) і контекст; посилання на заявку без форми — на #zayavka контактів
const lastLead = () => JSON.parse(posts.filter(x => x.path === '/api/leads').at(-1).body);
const submitOf = async (p, phone = '0671234567') => {
  apiStatus = 200; posts = [];
  await p.fill('#oPhone', phone); await p.click('#oBtn'); await p.waitForTimeout(1500);
  must(posts.some(x => x.path === '/api/leads'), 'заявку не надіслано');
  return lastLead();
};
await test('калькулятор → форма: коментар з розрахунком видно; лід — form=calc, source …#calc, площа й конфігурація', '/kalkuliator-remontu', 402, async p => {
  await p.fill('#cArea', '75'); await p.dispatchEvent('#cArea', 'input');
  await p.locator('#cSend').scrollIntoViewIfNeeded(); await p.click('#cSend'); await p.waitForTimeout(1200);
  must(await p.evaluate(() => document.activeElement.id === 'oPhone'), 'після «Отримати точний кошторис» фокус не на телефоні');
  must(await p.locator('#oMsg').isVisible(), 'розрахунок схований у згорнутому «Додати коментар»');
  const b = await submitOf(p);
  must(b.form === 'calc' && /#calc$/.test(b.source) && /^cas-develop\.com\/kalkuliator-remontu#calc$/.test(b.source), 'місце калькулятора: ' + b.form + ' | ' + b.source);
  must(b.area === '75' && /калькулятор/i.test(b.message) && /\$/.test(b.message) && /Калькулятор/.test(b.service), 'конфігурація не в заявці: ' + JSON.stringify(b));
});
await test('.lq-go у сцені → лід: form і source …#місце, конфігурація будинку в коментарі', '/budivnytstvo-budynkiv-kyiv', 1440, async p => {
  await wakeup(p);
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2)); await p.waitForTimeout(1500);
  const go = p.locator('section.bz[data-bz] .lq-go').first();
  if (!(await go.count())) throw new Error('немає .lq-go у сцені');
  const place = (await go.getAttribute('data-form')).replace(/^quick-/, '');
  await go.scrollIntoViewIfNeeded(); await go.click(); await p.waitForTimeout(1200);
  const b = await submitOf(p);
  must(b.form === 'quick-' + place && b.source.endsWith('#' + place), 'місце .lq-go не в заявці: ' + b.form + ' | ' + b.source);
  must(b.message.length > 10 && b.service, 'конфігурація/послуга не в заявці: ' + JSON.stringify(b));
  must(/\$600×\d+ = \$[\d\u202f]+ \/ \$1\u202f100×\d+ = \$/.test(b.message), 'орієнтир коробка/під ключ (casCost) не в коментарі: ' + b.message);
});
await test('квіз → лід: form=quiz, source …#quiz, відповіді; після успіху форма повертає своє місце', '/remont-kvartyr-kyiv', 402, async p => {
  await wakeup(p);
  const q = p.locator('.qz').first();
  if (!(await q.count())) throw new Error('немає квізу');
  await q.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  const step = async () => { const l = q.locator('.qz-st:not([hidden]) label:not([hidden])').first(); await l.click(); await p.waitForTimeout(400); };
  await step(); await step();
  await q.locator('.qz-nx').click(); await p.waitForTimeout(300);
  await step();
  apiStatus = 200; posts = [];
  await q.locator('.qz-pr input').fill('0671234567'); await q.locator('.qz-send').click(); await p.waitForTimeout(1500);
  const b = lastLead();
  must(b.form === 'quiz' && /#quiz$/.test(b.source) && /^Квіз:/.test(b.message), 'квіз: ' + b.form + ' | ' + b.source + ' | ' + b.message);
  must(/регіон: Україна/.test(b.message) && /Україна/.test(b.service), 'квіз uk: регіон «Україна» не в заявці: ' + b.service + ' | ' + b.message);
  must(await q.locator('.qz-ok').isVisible(), 'немає успіху квізу');
  must(await q.locator('.qz-ok .lf-after a.lf-tg[href="https://t.me/+380978667755"]').isVisible(), 'у квізі після успіху немає години відповіді й кнопки Telegram');
  must(!/#quiz/.test(await p.getAttribute('#of', 'data-source')), 'source форми не відновлено після квізу');
});
await test('квіз en: регіон типово «Європа» (радіогрупа), перемикач → Україна перераховує орієнтир і йде в заявку', '/en/turnkey-renovation', 402, async p => {
  await wakeup(p);
  const q = p.locator('.qz').first();
  if (!(await q.count())) throw new Error('немає квізу');
  await q.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  must(await q.getAttribute('data-region') === 'eu', 'en: типовий регіон не Європа: ' + await q.getAttribute('data-region'));
  const rg = q.locator('[role="radiogroup"]');
  must(await rg.count() === 1 && (await rg.locator('input[type="radio"]').count()) === 2, 'немає радіогрупи регіону з 2 радіо');
  const lid = await rg.getAttribute('aria-labelledby'); must(lid && (await p.locator('#' + lid).textContent()).trim(), 'радіогрупа без підпису');
  for (const l of await rg.locator('label').all()) { const bb = await l.boundingBox(); must(bb && bb.height >= 44, 'ціль регіону < 44 px: ' + (bb && bb.height)); }
  const step = async () => { const l = q.locator('.qz-st:not([hidden]) label:not([hidden])').first(); await l.click(); await p.waitForTimeout(400); };
  await step(); await step(); // квартира → дизайн-проєкт (70 м²): Європа — мін. $4 000, Україна — мін. $2 500
  await q.locator('.qz-nx').click(); await p.waitForTimeout(300);
  await step();
  const head = () => q.locator('.qz-res .qz-q').textContent();
  must(/\$4,000/.test(await head()), 'en/Європа: орієнтир не $4,000: ' + await head());
  await rg.locator('label').first().click(); await p.waitForTimeout(200);
  must(await q.getAttribute('data-region') === 'ua' && /\$2,500/.test(await head()), 'перемикач → Україна не перерахував: ' + await head());
  apiStatus = 200; posts = [];
  await q.locator('.qz-pr input').fill('0671234567'); await q.locator('.qz-send').click(); await p.waitForTimeout(1500);
  const b = lastLead();
  must(b.form === 'quiz' && /регіон: Україна/.test(b.message) && /Україна/.test(b.service), 'регіон не в заявці: ' + b.service + ' | ' + b.message);
});
await test('кейс → «Хочу так само» → лендинг: у заявці «Перед цим: /proekty/…»', '/proekty/monpark', 402, async p => {
  const a = p.locator('main a[href$="#zayavka"]').first();
  must(await a.count(), 'немає «Хочу так само» з #zayavka');
  await Promise.all([p.waitForNavigation(), a.click()]); await p.waitForTimeout(500);
  await p.locator('#of').scrollIntoViewIfNeeded();
  const b = await submitOf(p);
  must(/Перед цим: \/proekty\/monpark/.test(b.message), 'немає сторінки-джерела в заявці: ' + b.message);
  must(b.ref_path === '/proekty/monpark', 'сторінка-джерело не окремим полем ref_path: ' + b.ref_path);
  must(b.service && !/#/.test(b.source), 'service/source: ' + JSON.stringify(b));
});
// зовнішнє джерело візиту (orders.ref_host, 22.11.2026): з Google на кейс → лендинг → заявка: ref_host = лише хост, у sessionStorage — так само
await test('зовнішнє джерело: прийшли з Google → інша сторінка → у заявці ref_host лише хост; без чужого referrer — немає', '/404.html', 402, async p => {
  await p.goto(BASE + '/proekty/monpark', { waitUntil: 'load', referer: 'https://www.Google.com.ua/search?q=remont&utm=x' }); await p.waitForTimeout(300);
  must(await p.evaluate(() => sessionStorage.getItem('cas_rh')) === 'google.com.ua', 'sessionStorage cas_rh: ' + await p.evaluate(() => sessionStorage.getItem('cas_rh')));
  must(await p.evaluate(() => !/cas_rh/.test(document.cookie) && localStorage.getItem('cas_rh') == null), 'джерело не лише в sessionStorage');
  const a = p.locator('main a[href$="#zayavka"]').first();
  await Promise.all([p.waitForNavigation(), a.click()]); await p.waitForTimeout(500);
  await p.locator('#of').scrollIntoViewIfNeeded();
  const b = await submitOf(p);
  must(b.ref_host === 'google.com.ua', 'ref_host: ' + b.ref_host);
  must(b.ref_path === '/proekty/monpark', 'ref_path поруч: ' + b.ref_path);
  await p.evaluate(() => sessionStorage.clear());
  await p.goto(BASE + '/remont-kvartyr-kyiv#zayavka', { waitUntil: 'load' }); await p.waitForTimeout(300);
  const c = await submitOf(p, '0671234568');
  must(!('ref_host' in c), 'без зовнішнього referrer — ref_host: ' + c.ref_host);
});
// «Гід з цінами» (16.11.2026): не друга форма, а кнопка → єдина форма #zayavka з контекстом; після 2xx — «Завантажити гід»
for (const [path, w, re] of [['/ru/kalkulyator-remonta', 402, /гид по ценам/], ['/vartist-remontu-kvartyry-kyiv', 1440, /гід з цінами/]]) await test('«Гід з цінами»: кнопка → вікно заявки, контекст guide, без другої форми; 200 — посилання на PDF', path, w, async p => {
  await p.evaluate(() => document.querySelector('.gd-slot').scrollIntoView({ block: 'center' })); await p.waitForTimeout(800);
  must(await p.locator('form').evaluateAll(fs => fs.filter(f => f.offsetParent && f.id !== 'of' && !f.closest('header,.sch,.qz,dialog')).length) === 0, 'на сторінці друга форма');
  must(!(await p.locator('.gd-slot form').count()), 'у гіді лишилась форма');
  const go = p.locator('.gd-slot a.gd-go');
  must(re.test((await go.textContent()).toLowerCase()), 'текст кнопки гіда: ' + await go.textContent());
  must((await go.boundingBox()).height >= 44, 'кнопка гіда < 44 px');
  await go.click(); await p.waitForTimeout(1200);
  const y = await p.locator('#oPhone').evaluate(e => e.getBoundingClientRect().top);
  must(await fdOpen(p) && y > -50 && y < 900, 'вікно заявки не відкрилось після кнопки гіда: ' + Math.round(y));
  must(re.test((await p.inputValue('#oMsg')).toLowerCase()), 'коментар «Хочу гід…» не в формі');
  const b = await submitOf(p);
  must(b.form === 'guide' && /#guide$/.test(b.source) && b.service === 'Гід з цінами', 'контекст гіда: ' + JSON.stringify(b));
  must(await p.locator('#oOk a.gd-dl[href*="/assets/guide/"]').isVisible(), 'після успіху немає «Завантажити гід»');
});
// каталог 3D-турів: лише пігулка «Звʼязатися» (як на решті сайту), без форми
for (const path of ['/tury', '/en/tury', '/ar/tury']) await test('каталог турів: пігулка «Звʼязатися» з меню, форми немає', path, 402, async p => {
  must(!(await p.locator('form').count()), 'на каталозі турів є форма');
  const tg = p.locator('.mbar[data-one] .mb-tg');
  must(await tg.isVisible(), 'немає пігулки «Звʼязатися»');
  await tg.click(); await p.waitForTimeout(300);
  must(await p.locator('.mbar .mb-menu a[href="tel:+380978667755"]').isVisible(), 'у меню немає «Подзвонити»');
  must(/#zayavka$/.test(await p.locator('.mbar .mb-lead').getAttribute('href')), '«Залишити номер» не на #zayavka контактів');
});
await test('каталог турів на ПК: пігулки немає', '/tury', 1440, async p => { must(!(await p.locator('.mbar').isVisible()), 'пігулка на ПК'); });
for (const [path, w] of [['/proekty/monpark', 1440], ['/tury/apartment-2025', 402], ['/en/tury/apartment-2025', 402], ['/ru/tury/apartment-2025', 1440]]) await test('сторінка без форми: «Заявка»/пігулка/CTA ведуть на #zayavka контактів, месенджери й tel: правильні', path, w, async p => {
  const r = await p.evaluate(() => {
    const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    return {
      contact: [...document.querySelectorAll('main a[href], .mbar a[href], a.sch-cta')].map(a => a.getAttribute('href')).filter(h => /^\/(?:[a-z]{2}\/)?(?:contact|kontakty|kontakt|contacto)(?:#|$)/.test(h)),
      cform: hrefs.filter(h => /#cForm/.test(h)),
      tel: [...new Set(hrefs.filter(h => /^tel:/.test(h)))],
      tg: [...new Set(hrefs.filter(h => /t\.me\//.test(h)))], wa: [...new Set(hrefs.filter(h => /wa\.me|whatsapp/.test(h)))], vb: [...new Set(hrefs.filter(h => /^viber:/.test(h)))]
    };
  });
  must(!r.cform.length, 'посилання на неіснуючий #cForm');
  must(r.contact.length && r.contact.every(h => h.endsWith('#zayavka')), 'посилання на контакти без #zayavka: ' + r.contact.join(' '));
  must(r.tel.join() === 'tel:+380978667755', 'tel: ' + r.tel.join());
  must(r.tg.join() === 'https://t.me/+380978667755' && r.wa.join() === 'https://wa.me/380978667755' && r.vb.join() === 'viber://chat?number=%2B380978667755', 'месенджери: ' + JSON.stringify(r));
});
// Курсор-супутник (ПК) і хвиля дотику (тач) — pointerFx() у ui-polish.v1.js (Михайло 20.11.2026)
const curSt = p => p.evaluate(() => { const c = document.querySelector('.cur'); if (!c) return null; const r = c.firstChild.getBoundingClientRect(); return { on: c.classList.contains('is-on'), big: c.classList.contains('is-a'), g: c.getAttribute('data-g'), w: Math.round(r.width), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), pe: getComputedStyle(c).pointerEvents, ah: c.getAttribute('aria-hidden') }; });
await test('курсор-супутник (ПК): зʼявляється після руху миші, більшає над посиланням, «→» над обкладинкою, зникає над полем форми', '/', 1440, async p => {
  await p.waitForFunction(() => document.querySelector('.cur'), null, { timeout: 8000 }); // після load в idle
  let c = await curSt(p); must(c && !c.on && c.pe === 'none' && c.ah === 'true', 'до руху миші кільце має бути сховане, aria-hidden і без pointer-events: ' + JSON.stringify(c));
  must(await p.locator('.tap').count() === 0, 'на ПК не має бути елемента хвилі дотику');
  must(await p.evaluate(() => getComputedStyle(document.body).cursor !== 'none' && getComputedStyle(document.documentElement).cursor !== 'none'), 'рідний курсор сховано');
  await p.mouse.move(300, 500); await p.mouse.move(420, 520, { steps: 5 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on && !c.big && c.w >= 26 && c.w <= 30 && Math.abs(c.x - 420) <= 2 && Math.abs(c.y - 520) <= 2, 'кільце не наздогнало курсор над порожнім місцем: ' + JSON.stringify(c));
  await p.locator('.xs-cv').first().evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(300);
  const cov = await p.locator('.xs-cv a').first().boundingBox();
  await p.mouse.move(cov.x + cov.width / 2, cov.y + cov.height / 2, { steps: 6 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on && c.big && c.g === 'g' && c.w >= 50, 'над обкладинкою проєкту — велике кільце зі стрілкою: ' + JSON.stringify(c));
  must(await p.evaluate(() => /[→\u2192]/.test(getComputedStyle(document.querySelector('.cur'), '::after').content)), 'у кільці над обкладинкою немає «→»');
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(300); // далі — шапка й форма, як до каруселі під hero
  const nav = await p.locator('header .sch-nav a').first().boundingBox();
  await p.mouse.move(nav.x + nav.width / 2, nav.y + nav.height / 2, { steps: 6 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on && c.big && !c.g && c.w >= 50, 'над посиланням меню — велике кільце без стрілки: ' + JSON.stringify(c));
  await openFd(p); const f = await p.locator('#oPhone').boundingBox();
  await p.mouse.move(f.x + 40, f.y + f.height / 2, { steps: 4 }); await p.waitForTimeout(450);
  c = await curSt(p); must(!c.on, 'над полем форми кільце має зникати: ' + JSON.stringify(c));
  await p.mouse.move(f.x - 60, f.y - 70, { steps: 4 }); await p.waitForTimeout(450);
  c = await curSt(p); must(!c.on, 'над вікном заявки (top layer) кільце має бути сховане: ' + JSON.stringify(c));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); must(!(await fdOpen(p)), 'Esc не закрив вікно');
  await p.mouse.move(f.x - 40, f.y - 90, { steps: 4 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on, 'після вікна кільце не повернулось: ' + JSON.stringify(c));
  const y0 = c.y; await p.mouse.wheel(0, -300); await p.waitForTimeout(350);
  must((await curSt(p)).y === y0, 'кільце рухається під час прокрутки без руху миші');
});
await test('курсор-супутник: «+» над фото з лайтбоксом', '/proekty/yacht-vip', 1440, async p => {
  await p.waitForFunction(() => document.querySelector('.cur'), null, { timeout: 8000 });
  const a = p.locator('a[data-lb]').first(); await a.scrollIntoViewIfNeeded(); const bb = await a.boundingBox();
  await p.mouse.move(bb.x + 10, bb.y + 10); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 5 }); await p.waitForTimeout(450);
  const c = await curSt(p); must(c.on && c.big && c.g === 'p', 'над фото галереї — кільце з «+»: ' + JSON.stringify(c));
});
await test('тач: кільця курсора немає, хвиля зʼявляється на tap і зникає; прокрутка її не запускає', '/remont-kvartyr-kyiv', 402, async p => {
  await p.waitForFunction(() => document.querySelector('.tap'), null, { timeout: 8000 });
  must(await p.locator('.cur').count() === 0, 'на тач-екрані є кільце курсора');
  const anims = () => p.evaluate(() => document.querySelector('.tap i').getAnimations().length);
  const t = p.locator('main [data-c="x"]').first(); await t.scrollIntoViewIfNeeded(); const bb = await t.boundingBox();
  const cdp = await p.context().newCDPSession(p); // свайп: палець їде > 10 px — хвилі немає
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + 80, y: bb.y + 60 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x + 80, y: bb.y + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(80); must(await anims() === 0, 'хвиля запустилась від свайпа');
  await p.waitForTimeout(400); await t.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); // свайп прокрутив сторінку — плитку знову в кадр
  const bb2 = await t.boundingBox(); const tx = Math.round(bb2.x + bb2.width / 2), ty = Math.round(bb2.y + 60);
  await p.touchscreen.tap(tx, ty); await p.waitForTimeout(60);
  const r = await p.evaluate(() => { const i = document.querySelector('.tap i'), b = i.getBoundingClientRect(); return { n: i.getAnimations().length, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), pe: getComputedStyle(i.parentNode).pointerEvents }; });
  must(r.n === 1 && Math.abs(r.x - tx) <= 2 && Math.abs(r.y - ty) <= 2 && r.pe === 'none', 'хвиля не зʼявилась у точці дотику: ' + JSON.stringify(r) + ' / tap ' + tx + ',' + ty);
  await p.waitForTimeout(500); must(await anims() === 0, 'хвиля не зникла за 0,5 с');
});
await test('prefers-reduced-motion: ні кільця курсора, ні хвилі дотику', '/', 1440, async p => {
  await p.waitForTimeout(1500); await p.mouse.move(300, 400); await p.mouse.move(400, 420, { steps: 4 }); await p.waitForTimeout(300);
  must(await p.locator('.cur').count() === 0 && await p.locator('.tap').count() === 0, 'є елементи курсора/хвилі при reduced-motion');
}, { reducedMotion: 'reduce' });
await test('кабінет: без кільця курсора', '/kabinet', 1440, async p => {
  await p.waitForTimeout(1500); await p.mouse.move(300, 400); await p.mouse.move(400, 420, { steps: 4 }); await p.waitForTimeout(300);
  must(await p.locator('.cur').count() === 0, 'у кабінеті є кільце курсора');
});
// ── Калькулятор: кілька позицій одразу (Михайло 20.11.2026) — дизайн + ремонт + меблювання на одну площу, телефон і ПК ──
for (const w of [402, 1440]) {
  await test('калькулятор, кілька позицій: дизайн + ремонт + меблювання → 3 рядки й сума → форма з усіма позиціями; успіх лише після 2xx', '/kalkuliator-remontu', w, async p => {
    const nb = s => s.replace(/[  ]/g, ' '), num = s => +s.replace(/\D/g, '');
    const top = () => p.evaluate(() => Math.round(document.getElementById('cItL').getBoundingClientRect().top + scrollY));
    await p.locator('#cIt').scrollIntoViewIfNeeded();
    // на старті — як і раніше: ремонт квартири, 60 м²
    must(await cOn(p, 'reno') && await p.locator('#cIt button[aria-pressed="true"]').count() === 1 && num(await p.textContent('#cSum')) === 33000, 'типовий вибір — не ремонт 60 м²: ' + await p.textContent('#cSum'));
    // плитки: ≥ 44 px, без горизонтальної прокрутки, стан — не лише кольором (галочка) і aria-pressed
    const g = await p.evaluate(() => [...document.querySelectorAll('#cIt button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    must(g.length === 6 && g.every(x => x[0] >= 44 && x[1] >= 44), 'плитки менші за 44 px: ' + JSON.stringify(g));
    const mark = k => p.evaluate(k => { const b = document.querySelector(`#cIt [data-k="${k}"]`); return getComputedStyle(b, '::after').content !== 'none'; }, k);
    must(await mark('reno') && !(await mark('design')), 'галочка не відрізняє вибрану плитку');
    const y0 = await top(), sy0 = await p.evaluate(() => scrollY);
    await cTile(p, 'design').click(); await cTile(p, 'furn').click(); await p.waitForTimeout(200);
    must(await top() === y0 && Math.abs(await p.evaluate(() => scrollY) - sy0) <= 1, 'вибір позиції зсунув блок або прокрутку');
    must(await cOn(p, 'design') && await cOn(p, 'reno') && await cOn(p, 'furn') && await mark('design'), 'три позиції не вибрано');
    must(await p.locator('#cV [data-k="design"]').isVisible() && await p.locator('#cV [data-k="reno"]').isVisible() && await p.locator('#cV [data-k="build"]').isHidden(), 'уточнення — не лише вибраних позицій');
    must(await p.locator('#cV [data-k="design"] [aria-pressed="true"]').count() === 1 && await p.locator('#cV [data-k="design"] [data-p="dz"][aria-pressed="true"]').count() === 1, 'пакет дизайну — не один «Дизайн-проєкт»');
    // 60 м²: дизайн — мінімум $2 500 (60 × $30 = $1 800), ремонт $33 000, меблювання $15 000
    const li = async () => (await p.locator('#cRows li').allTextContents()).map(nb);
    let r = await li();
    must(r.length === 3 && /Дизайн-проєкт.*мінімум \$2 500/.test(r[0]) && /Ремонт квартири.*60 м² × \$550\/м².*\$33 000/.test(r[1]) && /Меблювання.*60 м² × \$250\/м².*\$15 000/.test(r[2]), 'рядки 60 м²: ' + JSON.stringify(r));
    must(num(await p.textContent('#cSum')) === 50500 && await p.locator('#cSumL').isVisible() && /₴/.test(await p.textContent('#cSumX')), 'сума ≠ $50 500 або немає ≈ ₴: ' + await p.textContent('#cSumP'));
    must((nb(await p.textContent('#cNote')).match(/\$2 500/g) || []).length === 1 && (nb(await p.textContent('#cNote')).match(/нижня межа/g) || []).length === 1, 'пояснення не одне: ' + await p.textContent('#cNote'));
    // 100,4 м² (кома): мінімум уже не діє — $3 000 + $55 000 + $25 000; сума = сума рядків
    await p.fill('#cArea', '100,4'); await p.waitForTimeout(150); r = await li();
    must(r.length === 3 && !/мінімум/.test(r.join('')) && r.map(x => num(x.split('$').pop())).reduce((a, b) => a + b, 0) === 83000 && num(await p.textContent('#cSum')) === 83000, 'сума ≠ сумі рядків: ' + JSON.stringify(r));
    // один пакет дизайну; ремонт: квартира АБО офіс — рядок один
    await cVar(p, 'design', 'full'); await cVar(p, 'reno', 'office'); r = await li();
    must(r.length === 3 && /Повний з наглядом.*\$4 500/.test(r[0]) && /Ремонт офісу.*\$35 000/.test(r[1]) && num(await p.textContent('#cSum')) === 64500, 'варіанти позицій: ' + JSON.stringify(r));
    must(await p.locator('#cV [data-k="reno"] [aria-pressed="true"]').count() === 1, 'у ремонті вибрано два варіанти');
    await cVar(p, 'design', 'dz'); await cVar(p, 'reno', 'reno'); await p.fill('#cArea', '60'); await p.waitForTimeout(150);
    // клавіатура: пробіл на плитці перемикає
    await cTile(p, 'arch').focus(); await p.keyboard.press('Space'); await p.waitForTimeout(100);
    must(await cOn(p, 'arch') && (await li()).length === 4, 'пробіл не вибрав плитку');
    await p.keyboard.press('Enter'); await p.waitForTimeout(100); must(!(await cOn(p, 'arch')), 'Enter не зняв плитку');
    // нічого не вибрано — підказка, суми немає
    await cOnly(p);
    must(await p.locator('#cPick').isVisible() && await p.locator('#cSum').isHidden() && await p.locator('#cSumL').isHidden() && await p.locator('#cRows').isHidden() && !(await p.textContent('#cSumX')), 'нічого не вибрано — не підказка');
    must(/Оберіть/.test(await p.textContent('#cPick')) && await p.locator('#cV').isHidden(), 'текст підказки / уточнення без позицій');
    // ландшафт у сотках разом із позиціями за м²
    for (const k of ['reno', 'design', 'furn', 'land']) await cTile(p, k).click(); // ремонт — перший вибраний → основна позиція заявки
    await p.waitForTimeout(150);
    must(await p.locator('#cArea').isVisible() && await p.locator('#cLand').isVisible(), 'для м² і соток — не два поля');
    await p.fill('#cLand', '12,5'); await p.waitForTimeout(150); r = await li();
    must(r.length === 4 && /Ландшафт.*12,5 сот\. × \$50\/сотку.*\$625/.test(r[3]) && num(await p.textContent('#cSum')) === 51125, 'ландшафт разом із м²: ' + JSON.stringify(r));
    await cTile(p, 'land').click(); await p.waitForTimeout(150);
    must(await p.locator('#cLandW').isHidden() && num(await p.textContent('#cSum')) === 50500, 'поле соток лишилось без ландшафту');
    must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'горизонтальна прокрутка');
    // → форма: усі позиції, площа, сума; основна позиція — перша вибрана (ремонт); успіх лише після 2xx
    await p.click('#cSend'); await p.waitForTimeout(1200);
    const sv = await p.getAttribute('#of', 'data-service'), ms = nb(await p.inputValue('#oMsg'));
    must(/^Калькулятор: Ремонт квартири під ключ \+ Дизайн-проєкт інтерʼєру \+ Меблювання й комплектація · Україна$/.test(sv) && sv.length <= 200, 'data-service: ' + sv);
    must(/Дизайн-проєкт інтерʼєру: мінімум \$2 500/.test(ms) && /Ремонт квартири під ключ · 60 м² × \$550\/м²: \$33 000/.test(ms) && /Меблювання й комплектація · 60 м² × \$250\/м²: \$15 000/.test(ms) && /= від \$50 500/.test(ms) && /Україна/.test(ms), 'коментар: ' + ms);
    must((await p.inputValue('#oArea')) === '60' && (await p.getAttribute('#of', 'data-form')) === 'calc', 'площа/місце не в формі');
    posts = []; apiStatus = 500;
    await p.fill('#oPhone', '0671234567'); await p.click('#oBtn'); await p.waitForTimeout(1500);
    const okVis = () => p.evaluate(() => { const e = document.getElementById('oOk'); return !!(e && e.offsetParent && getComputedStyle(e).display !== 'none' && e.textContent.trim().length > 5); });
    must(posts.some(x => x.path === '/api/leads') && !(await okVis()), 'успіх показано при 500');
    apiStatus = 200; await p.click('#oBtn'); await p.waitForTimeout(1500);
    must(await okVis(), 'успіх не показано при 200');
    const b = JSON.parse(posts.filter(x => x.path === '/api/leads').at(-1).body);
    must(b.form === 'calc' && /#calc$/.test(b.source) && b.area === '60' && b.service === sv && b.service.length <= 200 && nb(b.message).length <= 1500, 'лід: ' + JSON.stringify(b));
    must(['Дизайн-проєкт', 'Ремонт квартири', 'Меблювання', '$50 500'].every(x => nb(b.message).includes(x)), 'у ліді не всі позиції: ' + b.message);
  });
}
await test('калькулятор, посилання ?k=: старе значення списку вибирає одну позицію, кілька — через кому', '/kalkuliator-remontu?k=housekey#calc', 402, async p => {
  // «Порахувати» з лендингу веде на …#calc (ux.py): з параметром вибору блок «Що порахувати» теж одразу в кадрі
  await p.waitForTimeout(600);
  must(await p.evaluate(() => { const r = document.getElementById('cItL').getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }), '…?k=…#calc: блок «Що порахувати» не в кадрі');
  must(await cOn(p, 'build') && await p.locator('#cIt button[aria-pressed="true"]').count() === 1 && await p.locator('#cV [data-k="build"] [data-p="key"][aria-pressed="true"]').count() === 1, '?k=housekey не вибрав «Будинок під ключ»');
  must((await p.textContent('#cSum')).replace(/\D/g, '') === String(60 * 1100), '?k=housekey: сума ' + await p.textContent('#cSum'));
  await p.goto(p.url().replace(/\?.*$/, '?k=design,remont,furn'), { waitUntil: 'load' }); await p.waitForTimeout(300);
  must(await cOn(p, 'design') && await cOn(p, 'reno') && await cOn(p, 'furn') && (await p.textContent('#cSum')).replace(/\D/g, '') === '50500', '?k=design,remont,furn: ' + await p.textContent('#cSum'));
  await p.goto(p.url().replace(/\?.*$/, '?k=%3Cb%3E,xyz'), { waitUntil: 'load' }); await p.waitForTimeout(300);
  must(await cOn(p, 'reno') && await p.locator('#cIt button[aria-pressed="true"]').count() === 1, 'сміття в ?k= — не типовий вибір');
});
// Тип будинку (Михайло 21.11.2026): ряд #cHt [data-t] під «Коробка / Під ключ», видно лише з «Будівництвом будинку»; один вибір, типово «ще не визначились»
// (базові $600 / $1 100). Ставки типів — Михайло 21.11.2026 (rates.HOUSE): каркасний деревʼяний 350 / 950 (Європа 550 / 1 500), СІП 300 / 750 (450 / 1 200);
// тип без ставки («за кошторисом») у даних сайту немає — для цього шляху ФІКСТУРА: null у CAS_HT сторінки тесту.
const cType = async (p, t) => { await p.click(`#cHt [data-t="${t}"]`); await p.waitForTimeout(120); };
const cTypeOn = p => p.locator('#cHt [aria-pressed="true"]').evaluateAll(b => b.map(x => x.getAttribute('data-t')));
const cNb = s => s.replace(/[  ]/g, ' ');
const cDigits = async p => (await p.textContent('#cSum')).replace(/\D/g, '');
const cHtBox = p => p.evaluate(() => { const g = document.querySelector('#cV [data-h]'), bs = [...g.querySelectorAll('#cHt button')];
  return { vis: !g.hidden && g.offsetParent !== null, n: bs.length, minH: Math.min(...bs.map(b => b.getBoundingClientRect().height)), h: Math.round(document.getElementById('cV').getBoundingClientRect().height),
    cut: bs.filter(b => b.scrollWidth > b.clientWidth + 1 || [...b.childNodes].some(c => c.nodeType === 1 && c.getBoundingClientRect().right > b.getBoundingClientRect().right + 1)).map(b => b.textContent),
    out: bs.filter(b => { const r = b.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5; }).length, sw: document.documentElement.scrollWidth, iw: innerWidth,
    lab: (document.getElementById(g.getAttribute('aria-labelledby')) || {}).textContent || '' }; });
for (const [path, w, wantLab] of [['/kalkuliator-remontu', 402, 'Тип будинку'], ['/kalkuliator-remontu', 1440, 'Тип будинку'], ['/de/renovierungskosten-rechner', [344, 760], 'Haustyp'], ['/ar/renovation-calculator', 402, 'نوع المنزل'],
  ['/ru/kalkulyator-remonta', 402, 'Тип дома'], ['/en/renovation-cost-calculator', [344, 760], 'House type'], ['/es/calculadora-reforma', [344, 760], 'Tipo de casa'], ['/zh/renovation-calculator', 402, '房屋类型'],
  ['/pl/kalkulator-remontu', [344, 760], 'Typ domu'], ['/fr/calculateur-renovation', [344, 760], 'Type de maison'], ['/pt/calculadora-obras', [344, 760], 'Tipo de moradia']])
  await test('калькулятор, тип будинку: ряд лише з будівництвом, 8 кнопок ≥ 44 px без обрізання й горизонтальної прокрутки, один вибір, висота не стрибає', path, w, async p => {
    must(!(await cHtBox(p)).vis, 'ряд «Тип будинку» видно без будівництва');
    await cOnly(p, 'build');
    const a = await cHtBox(p);
    must(a.vis && a.n === 8 && a.lab === wantLab, 'ряд типів: ' + JSON.stringify(a));
    must(a.minH >= 44 && !a.cut.length && !a.out && a.sw <= a.iw + 1, 'кнопки типів: ' + JSON.stringify(a));
    must(JSON.stringify(await cTypeOn(p)) === '[""]' && (await cDigits(p)) === String(60 * 600), 'типово не «ще не визначились» або сума не базова: ' + await p.textContent('#cSum'));
    const hs = [a.h];
    for (const t of ['lstk', 'timber', 'brick', '']) { await cType(p, t); must(JSON.stringify(await cTypeOn(p)) === JSON.stringify([t]), 'вибрано не один тип: ' + t); hs.push((await cHtBox(p)).h); }
    must(Math.max(...hs) - Math.min(...hs) <= 1, 'висота блоку уточнень змінюється при виборі типу: ' + hs);
    await cTile(p, 'build').click(); await p.waitForTimeout(150);
    must(!(await cHtBox(p)).vis, 'ряд «Тип будинку» лишився без будівництва');
  });
await test('калькулятор, тип будинку зі ставкою: рядок з назвою типу, решта рахується; заявка містить тип; без ставки (фікстура) — «за кошторисом»; «ще не визначились» — сума як раніше', '/kalkuliator-remontu', 402, async p => {
  await cOnly(p, 'build', 'arch');
  must((await cDigits(p)) === String(60 * 600 + 60 * 12), 'без типу: ' + await p.textContent('#cSum'));
  await cType(p, 'frame');
  let rows = cNb(await p.locator('#cRows li').allTextContents().then(a => a.join(' | ')));
  must(/Будівництво будинку \(коробка\) · Каркасний деревʼяний · 60 м² × \$350\/м²\s*\$21 000/.test(rows) && /Архітектурний проєкт будинку · 60 м² × \$12\/м²\s*\$720/.test(rows), 'рядки: ' + rows);
  must((await cDigits(p)) === String(60 * 350 + 720) && await p.locator('#cPlus').isHidden(), 'сума з типом: ' + await p.textContent('#cSum'));
  must(cNb(await cTile(p, 'build').locator('small').textContent()) === 'від $350/м²', 'плитка будівництва: ' + await cTile(p, 'build').textContent());
  must(cNb(await p.locator('#cHt [data-t="frame"] small').textContent()) === 'від $350/м²' && cNb(await p.locator('#cHt [data-t="sandwich"] small').textContent()) === 'від $250/м²' && /\$600/.test(await p.locator('#cHt [data-t=""] small').textContent()), 'підписи кнопок типів');
  await cSendEsc(p);
  let sv = await p.getAttribute('#of', 'data-service'), msg = cNb(await p.inputValue('#oMsg'));
  must(sv === 'Калькулятор: Будівництво будинку (коробка) · Каркасний деревʼяний + Архітектурний проєкт будинку · Україна' && sv.length <= 200, 'data-service: ' + sv);
  must(/Будівництво будинку \(коробка\) · Каркасний деревʼяний · 60 м² × \$350\/м²: \$21 000/.test(msg) && /= від \$21 720/.test(msg) && (await p.inputValue('#oArea')) === '60', '#oMsg: ' + msg);
  // тип без ставки — ФІКСТУРА (у даних сайту такого немає): рядок «за кошторисом», решта рахується
  await p.evaluate(() => { CAS_HT.frame = { box: [null, null], key: [null, null] }; document.getElementById('calc').scrollIntoView(); });
  await cType(p, 'timber'); await cType(p, 'frame');
  rows = cNb(await p.locator('#cRows li').allTextContents().then(a => a.join(' | ')));
  must(/Будівництво будинку \(коробка\) · Каркасний деревʼяний\s*за кошторисом/.test(rows) && (await cDigits(p)) === '720' && await p.locator('#cPlus').isVisible(), 'тип без ставки: ' + rows + ' / ' + await p.textContent('#cSum'));
  must((await p.locator('#cHt [data-t="frame"] small').textContent()) === 'за кошторисом', 'підпис типу без ставки');
  await cSendEsc(p); msg = cNb(await p.inputValue('#oMsg'));
  must(/Каркасний деревʼяний: за кошторисом/.test(msg) && /= від \$720 \+ позиції за кошторисом/.test(msg), '#oMsg (без ставки): ' + msg);
  await p.evaluate(() => document.getElementById('calc').scrollIntoView()); await cType(p, '');
  must((await cDigits(p)) === String(60 * 600 + 60 * 12) && !/Каркасний/.test(await p.textContent('#cRows')), '«ще не визначились» не повернув базову суму');
  await cTile(p, 'reno').click(); await p.waitForTimeout(150); // ремонт знімає будівництво — тип більше ні на що не діє
  must(!(await cOn(p, 'build')) && (await cDigits(p)) === String(60 * 550 + 60 * 12) && /\$600/.test(await cTile(p, 'build').locator('small').textContent()), 'тип діє без будівництва');
});
await test('калькулятор, тип будинку і посилання ?k=house&t=<тип>: рахує за ставкою типу, «від $…/м²» на кнопці, Європа, під ключ', '/kalkuliator-remontu?k=house&t=frame#calc', 1440, async p => {
  must(await cOn(p, 'build') && JSON.stringify(await cTypeOn(p)) === '["frame"]' && await p.locator('#cV [data-k="build"] [data-p="box"][aria-pressed="true"]').count() === 1, '?k=house&t=frame не вибрав коробку каркасного');
  must((await cDigits(p)) === String(60 * 350), 'коробка каркасного: ' + await p.textContent('#cSum'));
  await cVar(p, 'build', 'key');
  must((await cDigits(p)) === String(60 * 950), 'під ключ за ставкою типу: ' + await p.textContent('#cSum'));
  must(cNb(await p.locator('#cHt [data-t="frame"] small').textContent()) === 'від $950/м²' && cNb(await cTile(p, 'build').locator('small').textContent()) === 'від $950/м²', 'підпис ставки типу: ' + await p.locator('#cHt [data-t="frame"]').textContent());
  must(cNb(await p.locator('#cHt [data-t=""] small').textContent()) === 'від $1 100/м²' && cNb(await p.locator('#cHt [data-t="lstk"] small').textContent()) === 'від $1 150/м²', 'підписи інших типів');
  must(/Будинок під ключ з оздобленням · Каркасний деревʼяний · 60 м² × \$950\/м²\s*\$57 000/.test(cNb(await p.textContent('#cRows'))), 'рядок: ' + await p.textContent('#cRows'));
  await cVar(p, 'build', 'box');
  must((await cDigits(p)) === String(60 * 350) && cNb(await p.locator('#cV [data-k="build"] [data-p="box"] small').textContent()) === '$350/м²', 'коробка за ставкою типу: ' + await p.textContent('#cSum'));
  await p.click('#cReg [data-r="1"]'); await p.waitForTimeout(120);
  must((await cDigits(p)) === String(60 * 550), 'Європа, коробка: ' + await p.textContent('#cSum'));
  await cVar(p, 'build', 'key');
  must((await cDigits(p)) === String(60 * 1500) && cNb(await p.locator('#cHt [data-t="frame"] small').textContent()) === 'від $1 500/м²', 'Європа, під ключ: ' + await p.textContent('#cSum'));
  await cSendEsc(p);
  must(/Будинок під ключ з оздобленням · Каркасний деревʼяний · Європа$/.test(await p.getAttribute('#of', 'data-service')) && /Каркасний деревʼяний · 60 м² × \$1[\s  ]500\/м²: \$90[\s  ]000/.test(await p.inputValue('#oMsg')), 'заявка: ' + await p.getAttribute('#of', 'data-service') + ' / ' + await p.inputValue('#oMsg'));
  // старі посилання: без t або з невідомим t — як раніше
  await p.goto(p.url().replace(/\?.*$/, '?k=housekey&t=nope'), { waitUntil: 'load' }); await p.waitForTimeout(300);
  must(JSON.stringify(await cTypeOn(p)) === '[""]' && (await cDigits(p)) === String(60 * 1100), '?k=housekey&t=nope: ' + await p.textContent('#cSum'));
  await p.goto(p.url().replace(/\?.*$/, '?t=sip'), { waitUntil: 'load' }); await p.waitForTimeout(300);
  must(await cOn(p, 'reno') && !(await cOn(p, 'build')) && (await cDigits(p)) === String(60 * 550), '?t= без ?k= змінив типовий вибір: ' + await p.textContent('#cSum'));
});
await test('калькулятор (ar, RTL), тип будинку: назва типу в рядку й заявці, ціна в рядку — «$…» ліворуч від числа', '/ar/renovation-calculator?k=housekey&t=sip', 402, async p => {
  must(JSON.stringify(await cTypeOn(p)) === '["sip"]' && /ألواح SIP/.test(await p.textContent('#cRows')), 'ar: тип не в рядку: ' + await p.textContent('#cRows'));
  await p.click('#cReg [data-r="1"]'); await p.waitForTimeout(120);
  must((await cDigits(p)) === String(60 * 1200) && /⁦\$1[\s  ]200⁩/.test(await p.textContent('#cRows')), 'ar: Європа, СІП під ключ: ' + JSON.stringify(await p.textContent('#cRows')));
  await p.click('#cReg [data-r="0"]'); await p.waitForTimeout(120);
  must((await cDigits(p)) === String(60 * 750) && /⁦\$750⁩/.test(await p.textContent('#cRows')), 'ar: рядок зі ставкою типу: ' + JSON.stringify(await p.textContent('#cRows')));
  await cSendEsc(p);
  must(/ألواح SIP/.test(await p.getAttribute('#of', 'data-service')) && /ألواح SIP/.test(await p.inputValue('#oMsg')) && !/[⁦⁩]/.test(await p.inputValue('#oMsg')), 'ar: заявка без типу або зі службовими знаками');
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ar: горизонтальна прокрутка');
});
// Сума лише «за кошторисом» (жодної позиції зі ставкою, напр. ремонт офісу в Європі): речення «Це нижня межа…» не показуємо; висота примітки — та сама (невидимий шар)
for (const path of ['/kalkuliator-remontu', '/ru/kalkulyator-remonta', '/en/renovation-cost-calculator', '/es/calculadora-reforma', '/zh/renovation-calculator',
  '/pl/kalkulator-remontu', '/de/renovierungskosten-rechner', '/fr/calculateur-renovation', '/pt/calculadora-obras', '/ar/renovation-calculator'])
  await test('калькулятор: сума лише «за кошторисом» — без речення про нижню межу, висота примітки не змінюється', path + '?k=remont', 402, async p => {
    const C = await p.evaluate(() => JSON.parse(document.getElementById('cCfg').textContent));
    const st = () => p.evaluate(nb => { const n = document.getElementById('cNote'), vis = [...n.childNodes].filter(x => !(x.nodeType === 1 && x.classList.contains('gh'))).map(x => x.textContent).join('');
      return { vis, has: vis.includes(nb), h: Math.round(n.getBoundingClientRect().height), sum: document.getElementById('cSum').textContent, plus: !document.getElementById('cPlus').hidden,
        gh: [...n.querySelectorAll('.gh')].every(e => e.getAttribute('aria-hidden') === 'true' && getComputedStyle(e).visibility === 'hidden') }; }, C.nb);
    await p.click('#cReg [data-r="1"]'); await p.waitForTimeout(150);
    const a = await st(); must(a.has && /\d/.test(a.sum), 'Європа, ремонт квартири — немає суми або речення: ' + JSON.stringify(a));
    await cVar(p, 'reno', 'office'); await p.waitForTimeout(100);
    const b = await st();
    must(b.sum === C.est && !b.has && !b.plus && b.gh, 'лише «за кошторисом» — речення лишилось: ' + JSON.stringify(b));
    must(Math.abs(b.h - a.h) <= 1, `висота примітки змінилась: ${a.h} → ${b.h}`);
    await cTile(p, 'design').click(); await p.waitForTimeout(150); // дизайн зі ставкою + офіс за кошторисом — речення повертається
    const c = await st(); must(c.has && c.plus && /\d/.test(c.sum), 'з позицією зі ставкою речення не повернулось: ' + JSON.stringify(c));
  });
await test('калькулятор (ar, RTL), кілька позицій: галочка з боку кінця рядка, без горизонтальної прокрутки на 344 px', '/ar/renovation-calculator', [344, 760], async p => {
  await cOnly(p, 'design', 'reno', 'furn', 'land');
  must(await p.locator('#cRows li').count() === 4 && /\$/.test(await p.textContent('#cSum')), 'ar: немає 4 рядків і суми');
  const side = await p.evaluate(() => { const b = document.querySelector('#cIt [data-k="reno"]'), r = b.getBoundingClientRect(), s = getComputedStyle(b, '::before'); return [parseFloat(s.left), r.width]; });
  must(side[0] < side[1] / 2, 'ar: галочка не ліворуч (кінець рядка в RTL): ' + side);
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ar: горизонтальна прокрутка');
});
// WeChat і Behance (Михайло 21.11.2026): месенджери й соцмережі — лише іконки без підпису «Месенджери» (футер, картка біля форми #zayavka, /contact);
// клік по WeChat копіює номер +380 63 866 77 55 і показує підказку мовою сторінки (aria-live), Behance — у футері й на /contact, не біля форми
const WX = '+380 63 866 77 55', CLIP = { permissions: ['clipboard-read', 'clipboard-write'] };
const wxTip = p => p.evaluate(() => { const t = document.querySelector('.wx-t'); return t ? { on: t.classList.contains('on'), txt: t.textContent, live: t.getAttribute('aria-live'), pos: getComputedStyle(t).position } : null; });
const icoRow = (p, sel) => p.evaluate(sel => [...document.querySelectorAll(sel + ' a')].map(a => { const r = a.getBoundingClientRect();
  return { k: (a.className.match(/bi-(\w+)/) || [])[1], w: Math.round(r.width), h: Math.round(r.height), txt: a.textContent.trim(), lab: a.getAttribute('aria-label') || '', href: a.getAttribute('href'), wx: a.getAttribute('data-wx') }; }), sel);
await test('WeChat: є у футері, клік копіює номер; Behance — у футері; без підпису «Месенджери»; біля форми іконок немає', '/', 1440, async p => {
  const f = await icoRow(p, '.scf-soc');
  must(f.map(x => x.k).join() === 'tel,telegram,viber,whatsapp,instagram,youtube,linkedin,tiktok,behance,wechat,chat', 'футер: ' + f.map(x => x.k));
  must(f.every(x => x.w >= 44 && x.h >= 44 && !x.txt && x.lab), 'футер: кнопки не іконки ≥ 44 px: ' + JSON.stringify(f));
  must(f.find(x => x.k === 'behance').href === 'https://www.behance.net/mykhailol2' && f.find(x => x.k === 'wechat').wx === WX && f.find(x => x.k === 'wechat').lab.includes(WX), 'футер: Behance / WeChat');
  must(!(await p.evaluate(() => [...document.querySelectorAll('.scf b')].some(b => /Месенджери/.test(b.textContent)))), 'футер: підпис «Месенджери» лишився');
  // футер (Михайло 24.11.2026): ряд іконок — один ряд, по центру з кнопкою «Розрахувати проєкт»
  const top = await p.evaluate(() => { const s = document.querySelector('.scf-soc').getBoundingClientRect(), b = document.querySelector('.scf-cta').getBoundingClientRect(); return [Math.round(Math.abs((s.top + s.bottom) / 2 - (b.top + b.bottom) / 2)), s.height]; });
  must(top[0] <= 2 && top[1] < 60, 'футер: ряд іконок не по центру з кнопкою або в два ряди на 1440: ' + top);
  await p.locator('.scf-soc .bi-wechat').scrollIntoViewIfNeeded(); await p.click('.scf-soc .bi-wechat'); await p.waitForTimeout(300);
  let tip = await wxTip(p);
  must(tip && tip.on && tip.live === 'polite' && tip.pos === 'fixed' && /Номер WeChat скопійовано/.test(tip.txt) && tip.txt.includes(WX), 'підказка: ' + JSON.stringify(tip));
  must((await p.evaluate(() => navigator.clipboard.readText())) === WX, 'буфер: ' + await p.evaluate(() => navigator.clipboard.readText()));
  must(p.url().startsWith('http'), 'сторінка пішла з сайту: ' + p.url());
  // картки контактів біля форми й іконок під кнопкою немає (Михайло 24.11.2026)
  await openFd(p);
  must(!(await p.locator('.of-ct, .lq-alt, dialog.fdl a.bi').count()), 'біля форми лишилися картка контактів або іконки месенджерів');
}, CLIP);
await test('WeChat на /contact (en): лише іконки з Behance і WeChat, підказка англійською', '/en/contact', 402, async p => {
  const r = await icoRow(p, '.xs-msg');
  must(['behance', 'wechat'].every(k => r.some(x => x.k === k)) && r.every(x => x.w >= 44 && x.h >= 44 && !x.txt && x.lab), '/contact: ' + JSON.stringify(r));
  must(!(await p.$('.xs-msg-h')) && (await p.getAttribute('.xs-msg', 'aria-label')) === 'Messengers', '/contact: підпис над рядом лишився або немає aria-label');
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'горизонтальна прокрутка');
  await p.locator('.xs-msg .bi-wechat').scrollIntoViewIfNeeded(); await p.locator('.xs-msg .bi-wechat').tap(); await p.waitForTimeout(300);
  const tip = await wxTip(p);
  must(tip && tip.on && /WeChat number copied/.test(tip.txt), 'підказка en: ' + JSON.stringify(tip));
  must((await p.evaluate(() => navigator.clipboard.readText())) === WX, 'буфер (тач)');
}, CLIP);
// Іконки месенджерів і соцмереж — лише у футері праворуч (Михайло 24.11.2026: «вони дублюються по 3 рази»); у меню кружечка й мобільному меню шапки — як і раніше.
// Футер без підпису студії й заголовка «Контакти» (10 мов), кнопка «Розрахувати проєкт» відкриває вікно; ✕/Esc/тло/«Назад», фокус назад на кнопку
const NOTAG = /Студія дизайну|Студия дизайна|design, renovation and turnkey|Estudio|设计|Studio projektowe|Studio für|Studio de|Estúdio|استوديو/;
for (const [path, w] of [['/', 402], ['/', 1440], ['/en/', 1440], ['/ar/', 402], ['/ar/', 1440], ['/zh/', 402], ['/de/', 1440], ['/pl/', 402], ['/fr/', 1440], ['/es/', 402], ['/pt/', 1440], ['/ru/', 402]]) await test('футер: лише логотип і адреса (номера текстом немає, дзвінок — перша іконка); кнопка «Розрахувати проєкт» → вікно; іконки — лише у футері', path, w, async p => {
  // номери телефонів (Михайло 24.11.2026 «…і номери телефонів — лиши тільки стрілки…»): у шапці й футері номера текстом немає; дзвінок — іконка tel: з підписом мовою сторінки
  const ph = await p.evaluate(() => { const t = [document.querySelector('header.sch'), document.querySelector('footer.scf')].map(x => x.innerText).join(' '), f = document.querySelector('.scf-soc a');
    return { num: /866[\s\u00a0]?77[\s\u00a0]?55/.test(t), first: f && f.getAttribute('href'), lab: f && f.getAttribute('aria-label'), hd: !!document.querySelector('header .sch-tel[href^="tel:"][aria-label]') }; });
  must(!ph.num && /^tel:/.test(ph.first || '') && ph.lab && ph.hd, 'номер текстом у шапці/футері або немає іконки дзвінка: ' + JSON.stringify(ph));
  const r = await p.evaluate(() => { const f = document.querySelector('.scf-top'), b = f.querySelector('.scf-cta'), br = b.getBoundingClientRect(), lg = f.querySelector('.sch-logo').getBoundingClientRect(), ad = f.querySelector('address').getBoundingClientRect();
    return { txt: f.innerText, p: f.querySelectorAll('.scf-brand p, .scf-col > b').length, h: Math.round(br.height), bg: getComputedStyle(b).backgroundColor, href: b.getAttribute('href'), lab: b.textContent.trim(), lx: Math.round(lg.left), ax: Math.round(ad.left), lr: Math.round(lg.right), ar: Math.round(ad.right), rtl: document.documentElement.dir === 'rtl',
      icons: [...document.querySelectorAll('a.bi')].filter(a => a.offsetParent && !a.closest('.scf, .sch-menu, .mbar')).length, sw: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  must(!r.p && !NOTAG.test(r.txt) && !/^(?:Контакти|Контакты|Contacts?|Contacto|Kontakt|Contactos|联系方式|التواصل)$/m.test(r.txt), 'у футері лишився підпис студії або «Контакти»: ' + r.txt.slice(0, 200));
  must(r.h >= 44 && r.bg !== 'rgba(0, 0, 0, 0)' && r.href === '#zayavka' && r.lab, 'кнопка футера: ' + JSON.stringify(r));
  must(r.rtl ? Math.abs(r.lr - r.ar) <= 2 : Math.abs(r.lx - r.ax) <= 2, 'логотип і адреса не на одній лінії: ' + JSON.stringify(r));
  must(r.icons === 0, 'іконки месенджерів поза футером і меню: ' + r.icons);
  must(r.sw, 'горизонтальна прокрутка');
  const btn = p.locator('.scf-cta');
  await openFd(p);
  const d = await p.evaluate(() => { const g = document.querySelector('dialog.fdl'), c = g.querySelector('.fdl-c').getBoundingClientRect(), x = g.querySelector('.fdl-x').getBoundingClientRect(), t = document.getElementById(g.getAttribute('aria-labelledby'));
    return { modal: g.open && g.getAttribute('aria-modal') === 'true' && getComputedStyle(g).position === 'fixed' && +getComputedStyle(g).zIndex > 1e6, lab: t && t.textContent.trim(), foc: document.activeElement.id, c: [c.left, c.right, c.bottom, innerWidth, innerHeight], x: [x.width, x.height], html: getComputedStyle(document.documentElement).overflow + getComputedStyle(document.body).overflow,
      top: (() => { const e = document.elementFromPoint(c.left + 20, c.bottom - 20); return e && !!e.closest('dialog.fdl'); })(), fs: parseFloat(getComputedStyle(document.getElementById('oPhone')).fontSize) }; });
  must(d.modal && d.lab && d.foc === 'oPhone', 'вікно: ' + JSON.stringify(d));
  must(d.x[0] >= 44 && d.x[1] >= 44 && d.top && d.fs >= 16 && d.c[0] >= 0 && d.c[1] <= d.c[3] + 0.5 && d.c[2] <= d.c[4] + 1.5, 'вікно: ✕ < 44, щось поверх, поле < 16 px або за краєм: ' + JSON.stringify(d));
  must(!/hidden/.test(d.html), 'overflow:hidden на html/body: ' + d.html);
  await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab'); await p.waitForTimeout(100);
  must(await p.evaluate(() => !!document.activeElement.closest('dialog.fdl')), 'фокус вийшов з вікна');
  await p.click('.fdl-x'); await p.waitForTimeout(300);
  must(!(await fdOpen(p)) && await btn.evaluate(b => document.activeElement === b), '✕: вікно не закрилось або фокус не на кнопці');
  await btn.click(); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  must(!(await fdOpen(p)), 'Esc не закрив вікно');
  await btn.click(); await p.waitForTimeout(300); await p.mouse.click(3, 3); await p.waitForTimeout(300);
  must(!(await fdOpen(p)), 'клік по тлу не закрив вікно');
  const u0 = p.url(); await btn.click(); await p.waitForTimeout(300); await p.goBack(); await p.waitForTimeout(400);
  must(!(await fdOpen(p)) && p.url() === u0, '«Назад» не закрив вікно або пішов зі сторінки: ' + p.url());
});
await test('вікно заявки: «Заявка» в шапці (ПК) відкриває вікно, «Назад» після закриття хрестиком не лишає зайвого запису', '/remont-kvartyr-kyiv', 1440, async p => {
  await p.click('a.sch-cta'); await p.waitForTimeout(300);
  must(await fdOpen(p), '«Заявка» в шапці не відкрила вікно');
  await p.click('.fdl-x'); await p.waitForTimeout(400);
  must(!(await fdOpen(p)) && p.url().endsWith('/remont-kvartyr-kyiv'), 'після ✕: ' + p.url());
  await p.click('a.sch-cta'); await p.waitForTimeout(300); must(await fdOpen(p), 'вдруге вікно не відкрилось');
});
await test('вікно заявки: «Залишити номер» у меню кружечка → вікно, фокус на телефоні; поле й кнопку видно', '/', 402, async p => {
  await p.click('.mbar .mb-tg'); await p.waitForTimeout(300); await p.click('.mbar .mb-lead'); await p.waitForTimeout(400);
  must(await fdOpen(p), '«Залишити номер» не відкрив вікно');
  const r = await p.evaluate(() => { const b = document.getElementById('oBtn').getBoundingClientRect(), f = document.getElementById('oPhone').getBoundingClientRect(); return { foc: document.activeElement.id, b: b.bottom, f: f.top, vh: innerHeight, menu: document.querySelector('.mbar').classList.contains('open') }; });
  must(r.foc === 'oPhone' && r.f >= 0 && r.b <= r.vh && !r.menu, 'вікно на телефоні: ' + JSON.stringify(r));
});
await test('вікно заявки, reduced-motion: без анімації появи', '/', 402, async p => {
  await openFd(p);
  must(await p.evaluate(() => getComputedStyle(document.querySelector('.fdl-c')).animationName === 'none'), 'анімація при reduced-motion');
}, { reducedMotion: 'reduce' });
await test('реферальна програма: форма на місці, без вікна; кнопка футера — на форму контактів', '/referalna-prohrama', 402, async p => {
  must(await p.locator('#zayavka #of').isVisible() || await p.evaluate(() => getComputedStyle(document.getElementById('zayavka')).display !== 'none'), 'форму реферальної сховано');
  must(!(await p.locator('dialog.fdl').count()) && /\/contact#zayavka$/.test(await p.getAttribute('.scf-cta', 'href')), 'реферальна: ' + await p.getAttribute('.scf-cta', 'href'));
});
await test('без JS: секція #zayavka з формою видима', '/remont-kvartyr-kyiv', 402, async p => {
  must(await p.locator('#zayavka #of').isVisible() && await p.locator('#oPhone').isVisible(), 'без JS форма схована');
}, { javaScriptEnabled: false });
// Іконка чату «блимає» (Михайло 24.11.2026): кружечок бота й іконка у футері — .ch-on, поки чат не відкривали; після відкриття — більше ніколи; reduced-motion — ні
await test('чат: іконка блимає, перестає після відкриття чату', '/', 402, async p => {
  await p.waitForFunction(() => document.querySelector('a.mb-bot.ch-on'), null, { timeout: 8000 });
  must(await p.evaluate(() => getComputedStyle(document.querySelector('a.mb-bot'), '::after').animationName === 'chAtt'), 'кружечок бота без анімації');
  must(!(await p.evaluate(() => document.querySelector('.scf-soc a[data-chat]').classList.contains('ch-on'))), 'іконка у футері поза екраном блимає');
  await p.evaluate(() => document.querySelector('.scf-soc a[data-chat]').scrollIntoView({ block: 'center' }));
  must(await p.waitForFunction(() => document.querySelector('.scf-soc a[data-chat]').classList.contains('ch-on'), null, { timeout: 3000 }).then(() => true, () => false), 'іконка у футері на екрані не блимає');
  await p.evaluate(() => { const a = document.querySelector('a.mb-bot'); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await p.waitForTimeout(300);
  must(await p.evaluate(() => !document.querySelector('a[data-chat].ch-on') && localStorage.getItem('cas_chat_seen') === '1'), 'після відкриття чату блимає далі');
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  must(!(await p.locator('a[data-chat].ch-on').count()), 'після перезавантаження знову блимає');
});
await test('чат, reduced-motion: іконка не блимає', '/', 402, async p => {
  await p.waitForTimeout(3000);
  must(!(await p.locator('a[data-chat].ch-on').count()) && await p.evaluate(() => getComputedStyle(document.querySelector('a.mb-bot'), '::after').animationName) === 'none', 'блимає при reduced-motion');
}, { reducedMotion: 'reduce' });
for (const w of [344, 402]) await test('мобільне меню шапки: месенджери — лише іконки', '/', w, async p => {
  await p.click('.sch-burger'); await p.waitForTimeout(400);
  await p.locator('.sch-mmsg').scrollIntoViewIfNeeded();
  const r = await icoRow(p, '.sch-mmsg');
  must(r.map(x => x.k).join() === 'telegram,viber,whatsapp,wechat,instagram,chat', 'іконки: ' + r.map(x => x.k));
  must(r.every(x => x.w >= 44 && x.h >= 44 && !x.txt && x.lab), 'не іконки ≥ 44 px з aria-label: ' + JSON.stringify(r));
  must(await p.evaluate(() => [...document.querySelectorAll('.sch-mmsg a')].every(a => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })), 'іконка за краєм екрана');
});
for (const [path, w] of [['/', 402], ['/', 320], ['/ar/', 402], ['/ar/', 344], ['/en/apartment-renovation-cost', 430]]) await test('пігулка: меню — ряд іконок і «Залишити номер»', path, w, async p => {
  await p.click('.mbar .mb-tg'); await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const m = document.querySelector('.mbar .mb-menu').getBoundingClientRect();
    return { m: [m.left, m.right, innerWidth], rtl: document.dir === 'rtl' || document.documentElement.dir === 'rtl',
      ic: [...document.querySelectorAll('.mbar .mb-menu a:not(.mb-lead)')].map(a => { const b = a.getBoundingClientRect(); return { h: a.getAttribute('href'), x: b.left, w: b.width, hh: b.height, t: b.top, txt: a.textContent.trim(), lab: a.getAttribute('aria-label') || '', v: !!a.offsetParent }; }),
      lead: (() => { const a = document.querySelector('.mbar .mb-lead'), b = a.getBoundingClientRect(); return { h: a.getAttribute('href'), txt: a.textContent.trim(), w: b.width, hh: b.height, t: b.top }; })() }; });
  must(r.ic.length === 5 && /^tel:/.test(r.ic[0].h) && /t\.me/.test(r.ic[1].h) && /wa\.me/.test(r.ic[2].h) && /^viber:/.test(r.ic[3].h) && /^weixin:/.test(r.ic[4].h), 'порядок: ' + r.ic.map(x => x.h));
  must(r.ic.every(x => x.v && x.w >= 44 && x.hh >= 44 && !x.txt && x.lab), 'не іконки ≥ 44 px з aria-label: ' + JSON.stringify(r.ic));
  must(r.ic.every(x => Math.abs(x.t - r.ic[0].t) < 2), 'іконки не в один ряд');
  must(r.rtl ? r.ic[0].x > r.ic[4].x : r.ic[0].x < r.ic[4].x, 'RTL: ряд не дзеркальний');
  must(r.lead.txt && /#zayavka$/.test(r.lead.h) && r.lead.hh >= 44 && r.lead.t > r.ic[0].t, '«Залишити номер»: ' + JSON.stringify(r.lead));
  must(r.m[0] >= 0 && r.m[1] <= r.m[2], 'меню за краєм екрана: ' + r.m);
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'горизонтальна прокрутка');
});
// Два кружечки в куті телефона (Михайло 23.11.2026): дзвінок (у самому куті, меню) і бот-помічник (поруч, панель чату; CHAT_PUBLIC);
// ≥ 44 px, однакові, не перекривають одне одного й край екрана, RTL — дзеркально; без видимого тексту, з aria-label/title; на ПК — немає
for (const [path, w, h] of [['/', 344, 740], ['/', 402, 874], ['/ar/', 344, 740], ['/ar/', 402, 874], ['/en/apartment-renovation-cost', 430, 932], ['/services', 360, 640]]) await test('кружечки: дзвінок і бот поруч, ≥ 44 px, без перекриття', path, [w, h], async p => {
  const r = await p.evaluate(() => [...document.querySelectorAll('.mbar[data-one] > .mb-bot, .mbar[data-one] > .mb-tg')].map(e => { const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { c: e.className, x: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, rad: cs.borderRadius, txt: e.textContent.trim(), lab: e.getAttribute('aria-label') || '', ti: e.getAttribute('title') || '', vw: innerWidth, vh: innerHeight, rtl: document.documentElement.dir === 'rtl' }; }));
  must(r.length === 2 && r[0].c.split(' ')[0] === 'mb-bot' && r[1].c.split(' ')[0] === 'mb-tg', 'кружечки: ' + JSON.stringify(r.map(x => x.c)));
  must(r.every(x => x.w >= 44 && x.h >= 44 && Math.abs(x.w - x.h) < 1 && Math.abs(x.w - r[0].w) < 1 && /50%|9999|28px/.test(x.rad)), 'не круглі / різні / < 44 px: ' + JSON.stringify(r));
  must(r.every(x => !x.txt && x.lab && x.ti), 'видимий текст або без aria-label/title: ' + JSON.stringify(r.map(x => [x.txt, x.lab])));
  must(r.every(x => x.x >= 8 && x.r <= x.vw - 8 && x.b <= x.vh - 8), 'за краєм екрана: ' + JSON.stringify(r));
  must(Math.abs(r[0].t - r[1].t) < 1, 'не в один ряд');
  const [bot, tel] = r;
  must(r[0].rtl ? tel.r <= bot.x - 6 : bot.r <= tel.x - 6, 'перекриваються або без проміжку: ' + JSON.stringify(r));
  must(r[0].rtl ? tel.x < 30 : tel.r > tel.vw - 30, 'дзвінок не в самому куті (RTL — лівому)');
  // тап по боту — панель чату; кружечки під панеллю не видно (поле вводу не перекрите)
  await p.click('.mbar[data-one] > .mb-bot');
  await p.waitForSelector('.cht:not([hidden])', { timeout: 8000 });
  const cover = await p.evaluate(() => { const t = document.querySelector('.cht-in').getBoundingClientRect(); const e = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return !!(e && e.closest('.cht')); });
  must(cover, 'поле вводу чату перекрите');
  await p.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('cht-in'), null, { timeout: 3000 });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  must(await p.evaluate(() => !!document.activeElement.closest('.mbar')), 'фокус не повернувся на кружечок');
});
await test('кружечки на ПК: немає (у шапці телефон і «Заявка»)', '/', 1440, async p => {
  must(!(await p.locator('.mbar').isVisible()) && !(await p.locator('.mbar .mb-bot').isVisible()), 'кружечки на ПК');
});
await test('кружечок дзвінка: aria-expanded/controls, ✕ у відкритому стані, клік поза — закриває', '/', 402, async p => {
  const tg = p.locator('.mbar[data-one] .mb-tg');
  must((await tg.getAttribute('aria-controls')) === 'mb-menu' && (await tg.getAttribute('aria-expanded')) === 'false', 'aria');
  must(/Зв.язатися/.test(await tg.getAttribute('aria-label')), 'aria-label: ' + await tg.getAttribute('aria-label'));
  await tg.click(); await p.waitForTimeout(250);
  must((await tg.getAttribute('aria-expanded')) === 'true', 'не відкрилось');
  must(await p.evaluate(() => /×/.test(getComputedStyle(document.querySelector('.mbar .mb-tg'), '::before').content)), 'немає ✕');
  await p.mouse.click(40, 300); await p.waitForTimeout(250);
  must((await tg.getAttribute('aria-expanded')) === 'false', 'клік поза меню не закрив');
});
// Кільце курсора біля країв вікна (20.11.2026): RTL і LTR на 1024 / 1440 / 1920 — без горизонтальної прокрутки, кліки проходять крізь кільце,
// стрілка над обкладинкою в RTL — «←»
for (const [path, w] of [['/ar/', 1440], ['/ar/', 1920], ['/ar/services', 1024], ['/', 1024], ['/services', 1920]]) await test('курсор-супутник біля країв: без горизонтальної прокрутки, не перехоплює кліки', path, w, async p => {
  await p.waitForFunction(() => document.querySelector('.cur'), null, { timeout: 8000 });
  const H = 900, pts = [[w - 2, 300], [w - 1, H - 2], [1, 400], [2, H - 3], [w / 2, 2], [w - 30, 40], [30, 40]];
  for (const [x, y] of pts) {
    await p.mouse.move(Math.max(40, Math.min(w - 40, x)), Math.max(40, Math.min(H - 40, y))); await p.mouse.move(x, y, { steps: 4 }); await p.waitForTimeout(260);
    const r = await p.evaluate(([x, y]) => { const h = document.documentElement, c = document.querySelector('.cur'), top = document.elementFromPoint(Math.min(x, innerWidth - 1), Math.min(y, innerHeight - 1));
      return { sw: h.scrollWidth, cw: h.clientWidth, sx: Math.round(scrollX), bw: document.body.scrollWidth, hit: !!(top && top.closest('.cur')), pos: getComputedStyle(c).position, pe: getComputedStyle(c).pointerEvents }; }, [x, y]);
    must(r.sw <= r.cw && r.sx === 0, `горизонтальна прокрутка з кільцем у точці ${x},${y}: scrollWidth ${r.sw} > ${r.cw}, scrollX ${r.sx}`);
    must(!r.hit && r.pe === 'none' && r.pos === 'fixed', `кільце перехоплює точку ${x},${y}: ` + JSON.stringify(r));
  }
  // клік крізь кільце доходить до посилання шапки (1024 — меню в бургері, тож «Заявка»)
  const a = p.locator('header .sch-nav a:visible, header a.sch-cta:visible').first(), bb = await a.boundingBox();
  await a.evaluate(e => e.addEventListener('click', ev => { ev.preventDefault(); ev.stopImmediatePropagation(); window.__hit = 1; }, true));
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 5 }); await p.waitForTimeout(300);
  must(await p.evaluate(() => document.querySelector('.cur').classList.contains('is-a')), 'над посиланням шапки кільце не збільшилось');
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  must(await p.evaluate(() => window.__hit === 1), 'клік під кільцем не дійшов до посилання');
});
// Сцена збирається трьома задачами; якщо людина за цей час прогорнула сторінку, компенсація висоти (scrollBy) не має повертати її назад
// (20.11.2026: після швидкої прокрутки повз сцену й назад нагору сторінка стрибала на тисячі px униз).
for (const [path, w] of [['/en/', 1440], ['/', 402], ['/ar/', [820, 1180]]]) await test('сцена: прокрутка під час збірки не скасовується (сторінка не стрибає)', path, w, async p => {
  const r = await p.evaluate(async () => {
    const sec = document.querySelector('section.bz[data-js], section.bz'); if (!sec) return { skip: 1 };
    const jumped = new Promise(ok => { const mo = new MutationObserver(() => { if (sec.hasAttribute('data-bz-on')) { mo.disconnect(); scrollTo({ top: 0, behavior: 'instant' }); ok(true); } }); mo.observe(sec, { attributes: true }); setTimeout(() => ok(false), 9000); });
    // форма тепер у вікні (24.11.2026) — сторінка коротша, і на високому екрані низ сцени лишався б у кадрі (тоді збірка за правилом чекає наступної прокрутки);
    // запас унизу тримає сцену повністю над екраном, як раніше під секцією форми
    const b0 = sec.getBoundingClientRect().bottom - (document.documentElement.scrollHeight - innerHeight - scrollY);
    if (b0 > -40) { const sp = document.createElement('div'); sp.style.height = Math.ceil(b0 + 40) + 'px'; document.body.appendChild(sp); }
    scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); // перша прокрутка вантажить скрипт сцени; сцена — вище екрана, збірка стартує
    const built = await jumped; await new Promise(r => setTimeout(r, 1500));
    return { built, y: Math.round(scrollY) };
  });
  if (r.skip) return;
  must(r.built, 'сцена не почала збиратись за 9 с');
  must(r.y === 0, `після повернення нагору сторінка сама прокрутилась на ${r.y}px`);
});
// Галерея /proekty (20.11.2026): мініатюри — data-srcset (sharp.py), до прокрутки вантажиться лише головне фото (LCP не ділить канал з галереєю);
// при прокрутці site-chrome.v1.js ставить srcset за ~350 px до кадру, клітинки тримають 4:3 — без зсуву.
for (const [path, w] of [['/proekty/yacht-vip', 402], ['/en/proekty/monpark', 1440]]) await test('галерея /proekty: спершу лише головне фото, мініатюри — при прокрутці, CLS 0', path, w, async p => {
  const reqs = []; p.on('request', r => { if (/\/img\/p\//.test(r.url())) reqs.push(r.url()); });
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift' }); });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
  must(reqs.length === 1, `до прокрутки завантажено фото проєкту: ${reqs.length} (має бути 1 — головне)`);
  const st0 = await p.evaluate(() => { const g = [...document.querySelectorAll('.pg img')], a = g[0].parentNode.getBoundingClientRect(); return { n: g.length, wait: g.filter(i => i.hasAttribute('data-srcset')).length, cell: a.width > 100 && Math.abs(a.width / a.height - 4 / 3) < .02 }; });
  must(st0.n > 3 && st0.wait === st0.n && st0.cell, 'мініатюри не відкладені або клітинка не 4:3: ' + JSON.stringify(st0));
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift' }); });
  await p.locator('.pg').scrollIntoViewIfNeeded(); await p.mouse.wheel(0, 500); await p.waitForTimeout(900);
  const st = await p.evaluate(() => { const g = [...document.querySelectorAll('.pg img')], v = g.filter(i => { const r = i.parentNode.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }); return { v: v.length, ok: v.filter(i => i.complete && i.naturalWidth > 0 && i.offsetWidth > 0 && !i.hasAttribute('data-srcset')).length, cls: window.__cls }; });
  must(st.v > 0 && st.ok === st.v, `мініатюри в кадрі не завантажились: ${st.ok} з ${st.v}`);
  must(st.cls < .01, 'зсув верстки при появі мініатюр: ' + st.cls.toFixed(3));
});
// «Бренди, з якими працюємо» (rich.py brands, 21.11.2026): назви текстом у <ul>, рух — marquee() (копії aria-hidden), пауза наведенням/дотиком/фокусом (кнопки паузи немає — Михайло 23.11.2026),
// без горизонтальної прокрутки сторінки, висота блоку не стрибає (CLS), RTL — у зворотний бік; reduced-motion — статичний ряд із переносом
for (const [path, w] of [['/about', 1440], ['/about', 402], ['/ar/about', 402], ['/de/ueber-uns', 344], ['/komplektatsiia-pid-kliuch-kyiv', 768]]) await test('стрічка брендів: рухається, пауза, без зсуву', path, w, async p => {
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  const ul = p.locator('.xs-brands .xs-bl');
  must(await ul.count() === 1, 'немає стрічки брендів');
  const h0 = await ul.evaluate(e => { e.closest('section').scrollIntoView({ block: 'center' }); return e.closest('section').offsetHeight; });
  if (w >= 1024) await p.mouse.move(2, 2);
  await p.waitForTimeout(900);
  const st = await ul.evaluate(e => ({ li: e.querySelectorAll('li:not(.mq-c)').length, cl: e.querySelectorAll('li.mq-c').length, hid: [...e.querySelectorAll('li.mq-c')].every(x => x.getAttribute('aria-hidden') === 'true'),
    img: e.closest('section').querySelectorAll('img,svg').length, h: e.closest('section').offsetHeight, hs: document.documentElement.scrollWidth - innerWidth, rtl: document.documentElement.dir === 'rtl' }));
  must(st.li >= 10 && st.li <= 60 && st.cl === st.li && st.hid, 'назви/копії: ' + JSON.stringify(st));
  must(st.img === 0, 'у стрічці брендів є зображення (лише назви текстом)');
  must(st.hs <= 0, `горизонтальна прокрутка сторінки ${st.hs}px`);
  must(Math.abs(st.h - h0) <= 1, `висота блоку змінилась ${h0}→${st.h}`);
  const s0 = await ul.evaluate(e => e.scrollLeft); await p.waitForTimeout(1200); const s1 = await ul.evaluate(e => e.scrollLeft);
  must(Math.abs(s1 - s0) > 10 && (st.rtl ? s1 < s0 : s1 > s0), `стрічка не рухається або не в той бік (${s0}→${s1})`);
  must(await p.locator('.xs-brands button, .xs-brands .mq-bar').count() === 0, 'у стрічки брендів є кнопка (паузи немає з 23.11.2026)');
  const ub = await ul.boundingBox();
  if (w >= 1024) { // курсор над стрічкою її не зупиняє (Михайло 24.11.2026)
    await p.mouse.move(ub.x + ub.width / 3, ub.y + ub.height / 2); await p.waitForTimeout(300);
    const m0 = await ul.evaluate(e => e.scrollLeft);
    await p.waitForFunction(v => Math.abs(document.querySelector('.xs-brands .xs-bl').scrollLeft - v) > 8, m0, { timeout: 6000 }).catch(() => {});
    must(Math.abs(await ul.evaluate(e => e.scrollLeft) - m0) > 8, 'під курсором стрічка зупинилась');
  }
  const cls = await p.evaluate(() => window.__cls);
  must(cls <= 0.05, 'CLS ' + cls.toFixed(3));
});
for (const [path, w] of [['/about', 402], ['/ar/about', 1440]]) await test('стрічка брендів, reduced-motion: статичний ряд із переносом, без копій і кнопки', path, w, async p => {
  const ul = p.locator('.xs-brands .xs-bl');
  await ul.evaluate(e => e.closest('section').scrollIntoView({ block: 'center' })); await p.waitForTimeout(800);
  const st = await ul.evaluate(e => ({ cl: e.querySelectorAll('li.mq-c').length, btn: e.closest('section').querySelectorAll('button').length, rows: new Set([...e.children].map(x => Math.round(x.getBoundingClientRect().top))).size,
    over: e.scrollWidth - e.clientWidth, hs: document.documentElement.scrollWidth - innerWidth }));
  must(st.cl === 0 && st.btn === 0, 'копії/кнопка при reduced-motion: ' + JSON.stringify(st));
  must(st.rows >= 2 && st.over <= 1 && st.hs <= 0, 'ряд не переноситься або виходить за край: ' + JSON.stringify(st));
}, { reducedMotion: 'reduce' });
// Згода на cookies (22.11.2026): регіон — за часовим поясом; Україна — без плашки, Clarity після першої дії; решта — opt-in (cas_ck)
const clarityReqs = p => { const a = []; p.on('request', q => { if (/clarity\.ms/.test(q.url())) a.push(q.url()); }); return a; };
const ckState = p => p.evaluate(() => { const c = document.querySelector('.ck'); const r = c && c.getBoundingClientRect(); const b = c ? [...c.querySelectorAll('.ck-b button')].map(x => { const q = x.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), getComputedStyle(x).backgroundColor, getComputedStyle(x).borderColor]; }) : [];
  return { on: !!(c && c.classList.contains('on') && getComputedStyle(c).visibility === 'visible'), r: r && [r.top, r.bottom, r.left, r.right], b, role: c && c.getAttribute('role'), lab: c && c.getAttribute('aria-label'), act: c && c.contains(document.activeElement), ls: (() => { try { return localStorage.getItem('cas_ck'); } catch (e) { return 'x'; } })() }; });
for (const w of [344, 1440]) await test('cookies, Київ: плашки немає, Clarity — лише після першої дії', '/', w, async p => {
  const rq = clarityReqs(p);
  await p.waitForTimeout(2200);
  must(!(await ckState(p)).on, 'плашка в Україні');
  must(rq.length === 0, 'Clarity до першої дії');
  await p.mouse.wheel(0, 400); await p.waitForTimeout(800);
  must(rq.length >= 1, 'Clarity не запитано після прокрутки');
}, { timezoneId: 'Europe/Kyiv' });
for (const [path, w] of [['/en/services', 344], ['/en/services', 402], ['/en/', 1440]]) await test('cookies, Берлін: плашка; Clarity після першої дії й до вибору, без сигналу згоди; «Добре» → consentv2, плашки більше немає', path, w, async p => {
  const rq = clarityReqs(p);
  await p.evaluate(() => { window.__ls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls += e.value; }).observe({ type: 'layout-shift' }); });
  await p.waitForFunction(() => document.querySelector('.ck.on'), null, { timeout: 6000 });
  must(rq.length === 0, 'Clarity до першої дії');
  const s = await ckState(p);
  must(s.role === 'region' && s.lab, 'плашка без role/aria-label');
  must(!s.act, 'плашка забрала фокус');
  must(s.b.length === 2 && s.b.every(x => x[1] >= 44) && s.b[0].join() === s.b[1].join(), 'кнопки не однакові або < 44 px: ' + JSON.stringify(s.b));
  must(s.r[1] <= (w < 768 ? 874 : 900) && s.r[2] >= 0, 'плашка поза вікном');
  if (w < 768) { const m = await p.locator('.mbar[data-one] .mb-tg').boundingBox(); must(m && s.r[1] <= m.y - 4, 'плашка накриває пігулку «Звʼязатися»'); }
  const h1 = await p.locator('h1').boundingBox(); must(h1.y + h1.height <= s.r[0] || h1.y >= s.r[1], 'плашка накриває H1');
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 500); await p.waitForTimeout(250); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  must(rq.length >= 1, 'Clarity не завантажився після прокрутки (згоди не чекаємо — Михайло 22.11.2026)');
  must(!(await p.evaluate(() => [...((window.clarity || {}).q || [])].some(a => /^consent/.test(a[0])))), 'сигнал згоди Clarity до «Добре»');
  const ls = await p.evaluate(() => window.__ls); must(ls === 0, 'зсув верстки ' + ls);
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(300);
  const ov = await p.evaluate(() => { const c = document.querySelector('.ck').getBoundingClientRect(); return [...document.querySelectorAll('.scf a')].filter(a => { const r = a.getBoundingClientRect(); return r.height > 0 && a.checkVisibility({ visibilityProperty: true }) && r.bottom > c.top && r.top < c.bottom && r.right > c.left && r.left < c.right; }).map(a => a.textContent.trim()).slice(0, 3); });
  must(ov.length === 0, 'унизу сторінки плашка накриває футер: ' + ov.join(', '));
  await p.click('.ck-b button[data-v="1"]'); await p.waitForTimeout(600);
  must(await p.evaluate(() => [...((window.clarity || {}).q || [])].some(a => a[0] === 'consentv2' && a[1].analytics_Storage === 'granted' && a[1].ad_Storage === 'denied')), 'немає clarity("consentv2", analytics granted)');
  const a = await ckState(p); must(!a.on && /^1\|\d{4}-\d\d-\d\d$/.test(a.ls), 'після «Добре»: ' + JSON.stringify(a));
  await p.evaluate(() => scrollTo(0, 0)); const n0 = rq.length; await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2200);
  must(!(await ckState(p)).on, 'плашка після перезавантаження');
  await p.keyboard.press('Tab'); await p.waitForTimeout(800);
  must(rq.length > n0, 'після «Добре» Clarity не вантажиться після дії');
}, { timezoneId: 'Europe/Berlin' });
await test('cookies, Берлін: «Відхилити» — Clarity немає й після перезавантаження', '/de/', 402, async p => {
  const rq = clarityReqs(p);
  await p.mouse.wheel(0, 900); await p.waitForTimeout(300);
  await p.waitForFunction(() => document.querySelector('.ck.on'), null, { timeout: 6000 });
  must(rq.length >= 1, 'Clarity не завантажився після прокрутки');
  await p.evaluate(() => { document.cookie = '_clck=t;path=/'; document.cookie = '_clsk=t;path=/'; });
  await p.click('.ck-b button[data-v="0"]'); await p.waitForTimeout(400);
  must(!/_cl(ck|sk)=/.test(await p.evaluate(() => document.cookie)), 'cookies Clarity не видалено');
  const a = await ckState(p); must(!a.on && /^0\|/.test(a.ls), 'після «Відхилити»: ' + JSON.stringify(a));
  must(await p.evaluate(() => { const q = [...((window.clarity || {}).q || [])]; return q.some(a => a[0] === 'consentv2' && a[1].analytics_Storage === 'denied') && q.some(a => a[0] === 'consent' && a[1] === false); }), 'немає consentv2 denied / consent(false) після «Відхилити»');
  await p.mouse.wheel(0, 300); await p.waitForTimeout(500);
  const n0 = rq.length; await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2200);
  must(!(await ckState(p)).on, 'плашка після перезавантаження');
  await p.mouse.wheel(0, 300); await p.keyboard.press('Tab'); await p.waitForTimeout(800);
  must(rq.length === n0, 'Clarity після «Відхилити» і перезавантаження');
}, { timezoneId: 'Europe/Berlin' });
for (const [path, w, tz] of [['/', 344, 'Europe/Kyiv'], ['/', 402, 'Europe/Kyiv'], ['/en/', 402, 'Europe/Berlin'], ['/ar/', 1440, 'Asia/Dubai']]) await test('cookies: «Cookies» у футері відкриває плашку з поточним станом', path, w, async p => {
  const rq = clarityReqs(p);
  const ln = p.locator('.scf-legal a[data-ck]'); must(await ln.count() === 1, 'немає «Cookies» у футері');
  must(/#cookies$/.test(await ln.getAttribute('href')), 'без JS посилання не веде на #cookies');
  await ln.scrollIntoViewIfNeeded(); await ln.click(); await p.waitForTimeout(400);
  const s = await ckState(p); must(s.on && s.act, 'плашка не відкрилась або фокус не в ній: ' + JSON.stringify(s));
  const kyiv = tz === 'Europe/Kyiv';
  if (kyiv) must(/вімкн/.test(await p.locator('.ck-st').textContent()), 'стан «ввімкнена» в Україні');
  await p.click('.ck-b button[data-v="0"]'); await p.waitForTimeout(300);
  must(!(await ckState(p)).on, 'плашка не закрилась');
  await ln.click(); await p.waitForTimeout(300);
  must(await p.getAttribute('.ck-b button[data-v="0"]', 'aria-pressed') === 'true', 'поточний вибір не позначено');
  await p.click('.ck-b button[data-v="0"]');
  await p.reload({ waitUntil: 'load' }); const n0 = rq.length; await p.mouse.wheel(0, 300); await p.waitForTimeout(800);
  must(rq.length === n0, 'після «Відхилити» з футера Clarity вантажиться');
}, { timezoneId: tz });
// Кнопки — design kit (Михайло 24.11.2026: «маленька кнопка, потім велика, зробити Design kit кнопок»): усі видимі primary/secondary — однієї висоти (±1 px),
// на телефоні кнопка-дія блоку — на всю ширину свого контейнера, пара в hero — 50/50; тап-цілі ≥ 44 px
for (const u of ['/', '/services', '/remont-kvartyr-kyiv', '/budivnytstvo-budynkiv-kyiv', '/contact', '/blog/akustyka-open-space-bez-hluhykh-peregorodok', '/en/', '/ar/']) for (const w of [402, 1440]) await test(`кнопки: design kit — одна висота, ширина за правилом (${u}, ${w})`, u, w, async p => {
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo({ top: y, behavior: 'instant' }); await new Promise(ok => setTimeout(ok, 60)); } scrollTo({ top: 0, behavior: 'instant' }); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(phone => {
    const vis = e => { if (!e.getClientRects().length) return false; for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity === 0) return false; } const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const bs = [...document.querySelectorAll('main :is(.btn,.bz-go,.qz-b), .scf a.scf-cta')].filter(vis).filter(e => !e.closest('[data-c] .cmp-x,.ux-rest,[hidden]'));
    const hs = bs.map(e => Math.round(e.getBoundingClientRect().height)), h0 = hs.slice().sort((a, b) => a - b)[hs.length >> 1];
    const bad = [], small = [];
    bs.forEach((e, i) => {
      const b = e.getBoundingClientRect(), t = e.textContent.trim().slice(0, 30);
      if (Math.abs(hs[i] - h0) > 1) bad.push(`висота ${hs[i]} ≠ ${h0}: ${t}`);
      if (b.height < 44 || b.width < 44) small.push(t);
      if (!phone) return;
      const par = e.parentElement, pc = getComputedStyle(par), pw = par.getBoundingClientRect().width - parseFloat(pc.paddingLeft) - parseFloat(pc.paddingRight) - parseFloat(pc.borderLeftWidth) - parseFloat(pc.borderRightWidth);
      const sib = [...par.children].filter(x => x !== e && x.matches('.btn') && vis(x));
      if (e.closest('.hero .btns') && sib.length) { if (Math.abs(b.width - sib[0].getBoundingClientRect().width) > 2) bad.push(`пара hero не 50/50: ${t}`); }
      else if (b.width < pw - 2) bad.push(`ширина ${Math.round(b.width)} < ${Math.round(pw)}: ${t}`);
    });
    return { n: bs.length, h0, bad: bad.slice(0, 6), small: small.slice(0, 4) };
  }, w < 768);
  must(r.n > 0, 'немає видимих кнопок');
  must(!r.bad.length && !r.small.length, JSON.stringify(r));
});
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAIL` : '\nВзаємодії: ALL OK');
process.exit(fails ? 1 : 0);
