// Playwright: логіка взаємодій сайту — бургер (фокус-пастка, Esc), перемикач мов, плитки data-c (розгортання без стрибка прокрутки),
// каруселі/стрічки (стрілки, пауза), сцени (клік у правій чверті кадру, ←/→, перемикач сцен на головній без переходу),
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
  const errs = [];
  page.on('pageerror', e => { if (!IGN_PE.test(e.message)) errs.push('JS: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !IGN.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  try {
    await page.goto(BASE + path, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await fn(page);
  } catch (e) { errs.push(String(e.message || e).split('\n')[0]); }
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
for (const w of [402, 1440]) await test('карусель «Що ми робимо»: стрілки гортають', '/', w, async p => {
  await wakeup(p);
  const row = p.locator('.xs-sv').first();
  await row.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  const nx = p.locator('.cv-b').nth(1);
  must(await nx.count(), 'немає кнопок каруселі');
  const box = await nx.boundingBox(); must(box && box.width >= 43.5 && box.height >= 43.5, 'кнопка каруселі < 44px');
  const s0 = await row.evaluate(e => e.scrollLeft);
  await nx.click(); await p.waitForTimeout(900);
  const s1 = await row.evaluate(e => e.scrollLeft);
  must(Math.abs(s1 - s0) > 20, `→ не гортає (${s0}→${s1})`);
});
await test('карусель «Наші проєкти»: кнопка паузи', '/', 1440, async p => {
  await wakeup(p);
  const b = p.locator('.xs-covers .cv-p').first();
  await p.locator('.xs-cv').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
  must(await b.count(), 'немає кнопки паузи каруселі');
  const a0 = await b.getAttribute('aria-pressed');
  await b.click(); await p.waitForTimeout(200);
  must(await b.getAttribute('aria-pressed') !== a0, 'aria-pressed не змінився');
});
// стрічка під hero головних (Михайло 11.11.2026): без кнопки паузи, автопрокрутка, кадри — посилання на кейс своєї мови; тап відкриває, свайп — ні
for (const [path, w] of [['/', 402], ['/', 1440], ['/en/', 402], ['/ar/', 1440]]) await test('стрічка фото під hero: кадри-посилання, тап/свайп, без паузи', path, w, async p => {
  const pre = path === '/' ? '' : path.replace(/\/$/, '');
  const sc = p.locator('.hx-home~.xs-strip .xs-st').first();
  await p.waitForTimeout(700);
  must(await p.locator('.xs-strip .mq-ap, .xs-strip .mq-bar, .hx-home~.xs-strip button').count() === 0, 'у стрічки є кнопка паузи');
  const bad = await sc.evaluate((e, pre) => [...e.querySelectorAll(':scope>a')].filter(a => !a.classList.contains('mq-c')).filter(a => !(a.getAttribute('href').startsWith(pre + '/proekty/') || a.getAttribute('href') === pre + '/portfolio') || !a.getAttribute('aria-label')).length + (e.querySelector(':scope>figure') ? 1 : 0), pre);
  must(bad === 0, `кадри без посилання/aria-label своєї мови: ${bad}`);
  await sc.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
  if (w > 600) await p.mouse.move(5, 5);
  const s0 = await sc.evaluate(e => Math.abs(e.scrollLeft)); await p.waitForTimeout(1500);
  const s1 = await sc.evaluate(e => Math.abs(e.scrollLeft));
  must(s1 - s0 > 5, `автопрокрутка стоїть (${s0}→${s1})`);
  const bb = await sc.boundingBox();
  const cx = bb.x + bb.width * 0.3, cy = bb.y + bb.height * 0.5;
  // свайп / перетягування — без переходу
  const url0 = p.url();
  if (w < 600) {
    const cdp = await p.context().newCDPSession(p);
    const pt = x => [{ x, y: cy }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(cx + 120) });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(cx + 120 - i * 25) }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await p.mouse.move(cx + 120, cy); await p.mouse.down(); await p.mouse.move(cx, cy, { steps: 8 }); await p.mouse.up();
  }
  await p.waitForTimeout(700);
  must(p.url() === url0, `свайп відкрив ${p.url()}`);
  // тап / клік — відкриває кейс кадру під пальцем
  const href = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href'), [cx, cy]);
  must(href, 'під точкою немає посилання');
  if (w < 600) await p.touchscreen.tap(cx, cy); else await p.mouse.click(cx, cy);
  await p.waitForURL(u => new URL(u).pathname.replace(/\.html$/, '') === href.replace(/\.html$/, ''), { timeout: 5000 }).catch(() => {});
  must(new URL(p.url()).pathname.replace(/\.html$/, '') === href, `тап: ${p.url()} замість ${href}`);
});
for (const w of [402, 1440]) await test('сцена на головній: клік у правій чверті, ←/→, перемикач сцен без переходу', '/', w, async p => {
  await wakeup(p);
  const sec = p.locator('#build-anim');
  await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  await p.waitForSelector('#build-anim .bz-nav .bz-b', { timeout: 10000 });
  const cur = () => p.evaluate(() => [...document.querySelectorAll('#build-anim .bz-nav .bz-b')].findIndex(b => b.getAttribute('aria-current') === 'step'));
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
const scGo = (p, k) => p.evaluate(`(()=>{const b=[...${SCN}.querySelectorAll('.sc-n,.bz-nav button')];b.at(${k}).click();return b.length})()`);
// перемикач сцен головної не рухає сторінку (19.11.2026): H2 і панелі вкладок різної висоти давали стрибок до ~70 px (телефон) і ~50 px (ПК).
// Тепер: спільний відступ H2 і 2 рядки під H2 на телефоні (site-chrome.v1.css) + секція тримає висоту найвищої показаної вкладки (завантажувач сцен).
// Перше коло — блок може лише підрости (≤ 30 px телефон, ≤ 60 px ПК: довга назва на 2 рядки); друге коло — висота не змінюється зовсім.
for (const w of [402, 1440]) await test('перемикач сцен головної: висота блоку не стрибає між вкладками', '/', w, async p => {
  await wakeup(p);
  await p.evaluate(() => { try { localStorage.setItem('casScHint', '1'); } catch (e) { } });
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .bz-ct', { timeout: 10000 }); await p.waitForTimeout(800);
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
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .bz-ct', { timeout: 10000 }); await p.waitForTimeout(800);
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
  await p.waitForSelector('#build-anim .bz-ct', { timeout: 10000 });
  await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center' }));
  await p.waitForFunction(() => +(document.querySelector('#build-anim .bz-ct').textContent.slice(0, 2)) >= 3, null, { timeout: 12000 }); // автопрогравання: 1.6 с + 3.5 с на етап
  await p.evaluate(() => { const c = document.querySelector('#build-anim .bz-ct'); window.__ct = []; new MutationObserver(() => window.__ct.push(c.textContent.slice(0, 2))).observe(c, { childList: true, subtree: true, characterData: true }); });
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(4800);
  const away = await p.evaluate(() => window.__ct.splice(0));
  must(!away.length, 'сцена поза кадром перемикала етапи: ' + away.join(' '));
  await p.evaluate(() => document.querySelector('#build-anim .bz-fig').scrollIntoView({ block: 'center' })); await p.waitForTimeout(1500);
  const back = await p.evaluate(() => window.__ct.filter((v, i, a) => v !== a[i - 1]));
  must(back.length && back[0] === '01' && back.every(v => v === '01' || v === '02'), 'після повернення: ' + back.join(' → ') + ' (очікується одразу 01)');
});
// «Ресторан з нуля», етап «Гості»: силуети були сірі під нічним шаром і їх майже не було видно — етап виглядав порожнім
await test('сцена «Ресторан»: на етапі «Гості» видно гостей (≥ 10 світлих силуетів)', '/', 1440, async p => {
  await wakeup(p);
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .bz-ct', { timeout: 10000 });
  await scTab(p, 5); await p.waitForSelector('section.bz .rs-svg', { timeout: 10000 });
  await scGo(p, -1); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const s = [...document.querySelectorAll('.rs-svg .rs-e.on .rs-sil')]; const l = s.map(e => { const f = getComputedStyle(e).fill.match(/\d+/g).map(Number); return (0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]) / 255; }); return { n: s.length, lum: +Math.max(0, ...l).toFixed(2) }; });
  must(r.n >= 10 && r.lum > 0.85, 'гості на останньому етапі: ' + JSON.stringify(r));
});
// «Будинок на воді», етап «Здача»: був без видимої зміни відносно «Вечора» — знак «ключі» в кадрі лише на останньому етапі
await test('сцена «Будинок на воді»: на етапі «Здача» — знак «ключі» в межах кадру', '/', 402, async p => {
  await wakeup(p);
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .bz-ct', { timeout: 10000 });
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
  await p.locator('#build-anim').scrollIntoViewIfNeeded(); await p.waitForSelector('#build-anim .bz-ct', { timeout: 10000 });
  await scTab(p, 3); await p.waitForSelector('section.bz .rp-svg', { timeout: 10000 });
  await p.evaluate(`(()=>{const b=${SCN}.querySelector('.sc-ap');if(b&&b.dataset.st==='on')b.click()})()`);
  await scGo(p, 2); await p.waitForTimeout(600);
  const cur = () => p.evaluate(`[...${SCN}.querySelectorAll('.sc-n')].findIndex(b=>b.getAttribute('aria-current')==='step')`);
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
await test('форма: порожній телефон не надсилається; 500 — без успіху; 200 — успіх', '/remont-kvartyr-kyiv', 402, async p => {
  posts = []; apiStatus = 500;
  await p.locator('#of').scrollIntoViewIfNeeded();
  await p.click('#oBtn'); await p.waitForTimeout(500);
  must(posts.length === 0, 'порожня форма надіслана');
  await p.fill('#oPhone', '0671234567');
  await p.click('#oBtn'); await p.waitForTimeout(1500);
  must(posts.length === 1, 'заявку не надіслано (' + posts.length + ')');
  const okVis = async () => p.evaluate(() => [...document.querySelectorAll('#oOk,.lq-ok')].some(e => e.offsetParent && getComputedStyle(e).display !== 'none' && e.textContent.trim().length > 5));
  must(!(await okVis()), 'успіх показано при 500');
  apiStatus = 200;
  await p.click('#oBtn'); await p.waitForTimeout(1500);
  must(await okVis(), 'успіх не показано при 200');
  const af = await p.evaluate(() => { const x = document.querySelector('#oOk .lf-after'), a = x && x.querySelector('a.lf-tg'); return x ? { t: x.textContent, h: a && a.getAttribute('href'), v: !!x.offsetParent, hh: a ? a.getBoundingClientRect().height : 0 } : null; });
  must(af && af.v && /Пн–Пт 10:00–20:00/.test(af.t) && /терміново/.test(af.t), 'після успіху немає рядка «Відповідаємо Пн–Пт 10:00–20:00…»: ' + JSON.stringify(af));
  must(af.h === 'https://t.me/+380978667755' && af.hh >= 44, 'кнопка Telegram після успіху: ' + JSON.stringify(af));
  const b = JSON.parse(posts.at(-1).body); must(/380671234567|0671234567/.test(b.phone), 'телефон не в заявці');
  must(b.service, 'немає service');
});
// Перехід на …#zayavka з ІНШОЇ сторінки: сторінка стає на місце одразу (без плавної прокрутки ~10 000 px), шапка видима й не перекриває ціль;
// у межах сторінки прокрутка до якоря лишається плавною (html.sb), reduced-motion — миттєво завжди.
const hashRec = () => { window.__ys = []; const f = () => { window.__ys.push(Math.round(scrollY)); requestAnimationFrame(f); }; requestAnimationFrame(f); };
for (const [path, w] of [['/remont-kvartyr-kyiv', 402], ['/', 1440], ['/ar/', 402], ['/contact', 402], ['/en/apartment-interior-design', 1440]]) await test('якір з іншої сторінки: #zayavka одразу на місці, шапка не перекриває', '/about', w, async p => {
  await p.addInitScript(hashRec);
  await p.goto(BASE + path + '#zayavka', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const ys = window.__ys, y = scrollY, el = document.getElementById('zayavka').getBoundingClientRect(), h = document.querySelector('.sch').getBoundingClientRect();
    return { mid: new Set(ys.filter(v => v > y * 0.1 && v < y * 0.9)).size, y, top: Math.round(el.top), hb: Math.round(h.bottom), end: y + innerHeight >= document.documentElement.scrollHeight - 2,
      sb: getComputedStyle(document.documentElement).scrollBehavior, cls: document.documentElement.classList.contains('sb'), vh: innerHeight }; });
  must(r.y > 1000, 'сторінка не перейшла до #zayavka: y=' + r.y);
  must(r.mid <= 2, `плавна прокрутка при завантаженні з якорем: ${r.mid} проміжних положень`);
  must(r.hb > 0, 'шапка схована після переходу на якір');
  must((r.top >= r.hb - 1 && r.top < r.vh * 0.5) || (r.end && r.top < r.vh * 0.5), `#zayavka не під шапкою: top=${r.top}, шапка до ${r.hb}`);
  must(r.cls && r.sb === 'smooth', 'після завантаження плавність у межах сторінки не ввімкнулась: ' + r.sb);
});
await test('якір у межах сторінки: прокрутка плавна (html.sb одразу, без #)', '/remont-kvartyr-kyiv', 1440, async p => {
  must(await p.evaluate(() => document.documentElement.classList.contains('sb') && getComputedStyle(document.documentElement).scrollBehavior === 'smooth'), 'немає html.sb / scroll-behavior:smooth');
  await p.evaluate(hashRec);
  await p.evaluate(() => { location.hash = '#zayavka'; });
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => ({ n: new Set(window.__ys.filter(v => v > scrollY * 0.1 && v < scrollY * 0.9)).size, y: scrollY }));
  must(r.y > 1000 && r.n >= 5, `перехід у межах сторінки не плавний: ${r.n} проміжних положень, y=${r.y}`);
});
await test('якір, reduced-motion: миттєво і з іншої сторінки, і в межах сторінки', '/about', 402, async p => {
  await p.addInitScript(hashRec);
  await p.goto(BASE + '/remont-kvartyr-kyiv#zayavka', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ mid: new Set(window.__ys.filter(v => v > scrollY * 0.1 && v < scrollY * 0.9)).size, y: scrollY, sb: getComputedStyle(document.documentElement).scrollBehavior }));
  must(r.y > 1000 && r.mid <= 2 && r.sb === 'auto', `reduced-motion: ${r.mid} проміжних положень, scroll-behavior ${r.sb}`);
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
  await p.evaluate(() => { const e = document.querySelector('.xs-covers') || document.getElementById('zayavka'); window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 60, behavior: 'instant' }); window.__mark(); });
  await p.mouse.wheel(0, 1); await p.waitForTimeout(2500);
  let r = await p.evaluate(() => window.__sh);
  must(Math.abs(r.max) <= 4, `після стрибка до секції вміст зсунувся на ${r.max} px (${r.who})`);
  // 2) сторінку відкрито з #zayavka; далі — прокрутка вгору кроками (секції й сцена вище отримують справжню висоту)
  await p.goto(BASE + '/404.html'); await p.goto(BASE + path + '#zayavka', { waitUntil: 'load' }); await p.waitForTimeout(250);
  await p.mouse.move(200, 300); await p.mouse.wheel(0, -1);
  for (let i = 0; i < 40; i++) { const top = await p.evaluate(() => { window.scrollBy({ top: -400, behavior: 'instant' }); window.__mark(); return scrollY <= 0; }); await p.waitForTimeout(120); if (top) break; }
  await p.waitForTimeout(600);
  r = await p.evaluate(() => window.__sh);
  must(Math.abs(r.max) <= 4, `прокрутка вгору з #zayavka: вміст зсунувся на ${r.max} px (${r.who})`);
});
// Повільна мережа: CSS/дані сцени приходять, коли людина вже всередині блоку (верх блоку вище екрана; на телефоні блок головної вищий за екран).
// Сцена збирається на місці (висоту тримає резерв site-chrome.v1.css) — раніше чекала, доки блок вийде з кадру, і не зʼявлялась (так падав і perf.mjs --inp).
for (const [path, w, dy] of [['/', 402, 31], ['/remont-kvartyr-kyiv', 402, 200], ['/budivnytstvo-budynkiv-kyiv', 1440, 200]]) await test('сцена: збірка, коли людина вже всередині блоку (повільна мережа)', path, w, async p => {
  await p.route(/\/assets\/(?:build-anim|scene-ui)/, async r => { await new Promise(ok => setTimeout(ok, 1200)); await r.continue().catch(() => {}); });
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift' }); });
  await p.mouse.move(200, 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(150);
  await p.evaluate(dy => { const e = document.getElementById('build-anim'); window.scrollTo({ top: e.getBoundingClientRect().top + scrollY + dy, behavior: 'instant' }); }, dy);
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => ({ cls: window.__cls, nx: Math.round(document.getElementById('build-anim').nextElementSibling.getBoundingClientRect().top), built: !!document.querySelector('#build-anim .bz-nx') }));
  must(!before.built, 'сцена зібралась до приходу CSS/даних — тест не перевіряє збірку в кадрі');
  await p.waitForSelector('#build-anim .bz-nx', { timeout: 8000 });
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({ cls: window.__cls, nx: Math.round(document.getElementById('build-anim').nextElementSibling.getBoundingClientRect().top) }));
  must(after.cls - before.cls <= 0.05, 'CLS збірки в кадрі ' + (after.cls - before.cls).toFixed(3));
  must(Math.abs(after.nx - before.nx) <= 4, `блок під сценою зсунувся на ${after.nx - before.nx} px`);
});
await test('.lq-go → #zayavka з контекстом сцени', '/budivnytstvo-budynkiv-kyiv', 1440, async p => {
  await wakeup(p);
  const go = p.locator('.lq-go').first();
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2)); await p.waitForTimeout(1500);
  if (!(await go.count())) throw new Error('немає .lq-go');
  await go.scrollIntoViewIfNeeded(); await go.click(); await p.waitForTimeout(1200);
  const y = await p.locator('#of').evaluate(e => e.getBoundingClientRect().top);
  must(y > -50 && y < 900, 'форма не у видимій зоні після .lq-go: ' + Math.round(y));
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
// калькулятор — кілька позицій одразу (Михайло 20.11.2026): плитки #cIt [data-k] (aria-pressed), уточнення #cV [data-k] [data-p], площа #cArea, сотки #cLand
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
  await p.click('#cSend'); await p.waitForTimeout(300);
  must((await p.inputValue('#oArea')) === '1250', 'сотки не перетворено на м² у формі');
  const ms = await p.inputValue('#oMsg'), sv = await p.getAttribute('#of', 'data-service');
  must(/Україна/.test(ms) && /Ландшафт/.test(ms) && /Ландшафт/.test(sv) && /Україна/.test(sv), 'регіон/послуга не в формі: ' + ms + ' | ' + sv);
  await cOnly(p, 'reno'); await cVar(p, 'reno', 'reno');
  must(await p.locator('#cArea').isVisible() && (await p.inputValue('#cArea')) === '10' && await p.locator('#cLandW').isHidden(), 'поле м² не повернулось після соток');
  await p.click('#cReg [data-r="1"]');
  await set('60'); await p.click('#cSend'); await p.waitForTimeout(300);
  const m1 = await p.inputValue('#oMsg'); must(/Європа/.test(m1) && /Європа/.test(await p.getAttribute('#of', 'data-service')), 'Європа не в формі');
  await set('80'); await p.click('#cSend'); await p.waitForTimeout(300);
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
    await p.click('#cSend'); await p.waitForTimeout(300);
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
  await p.click('#cSend'); await p.waitForTimeout(400);
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
// «Гід з цінами» (16.11.2026): не друга форма, а кнопка → єдина форма #zayavka з контекстом; після 2xx — «Завантажити гід»
for (const [path, w, re] of [['/ru/kalkulyator-remonta', 402, /гид по ценам/], ['/vartist-remontu-kvartyry-kyiv', 1440, /гід з цінами/]]) await test('«Гід з цінами»: кнопка → #zayavka, контекст guide, без другої форми; 200 — посилання на PDF', path, w, async p => {
  await p.evaluate(() => document.querySelector('.gd-slot').scrollIntoView({ block: 'center' })); await p.waitForTimeout(800);
  must(await p.locator('form').evaluateAll(fs => fs.filter(f => f.offsetParent && f.id !== 'of' && !f.closest('header,.sch,.qz,dialog')).length) === 0, 'на сторінці друга форма');
  must(!(await p.locator('.gd-slot form').count()), 'у гіді лишилась форма');
  const go = p.locator('.gd-slot a.gd-go');
  must(re.test((await go.textContent()).toLowerCase()), 'текст кнопки гіда: ' + await go.textContent());
  must((await go.boundingBox()).height >= 44, 'кнопка гіда < 44 px');
  await go.click(); await p.waitForTimeout(1200);
  const y = await p.locator('#oPhone').evaluate(e => e.getBoundingClientRect().top);
  must(y > -50 && y < 900, 'форма не у видимій зоні після кнопки гіда: ' + Math.round(y));
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
  const cov = await p.locator('.xs-st a').first().boundingBox();
  await p.mouse.move(cov.x + cov.width / 2, cov.y + cov.height / 2, { steps: 6 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on && c.big && c.g === 'g' && c.w >= 50, 'над обкладинкою проєкту — велике кільце зі стрілкою: ' + JSON.stringify(c));
  must(await p.evaluate(() => /[→\u2192]/.test(getComputedStyle(document.querySelector('.cur'), '::after').content)), 'у кільці над обкладинкою немає «→»');
  const nav = await p.locator('header .sch-nav a').first().boundingBox();
  await p.mouse.move(nav.x + nav.width / 2, nav.y + nav.height / 2, { steps: 6 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on && c.big && !c.g && c.w >= 50, 'над посиланням меню — велике кільце без стрілки: ' + JSON.stringify(c));
  await p.locator('#oPhone').scrollIntoViewIfNeeded(); const f = await p.locator('#oPhone').boundingBox();
  await p.mouse.move(f.x + 40, f.y + f.height / 2, { steps: 4 }); await p.waitForTimeout(450);
  c = await curSt(p); must(!c.on, 'над полем форми кільце має зникати: ' + JSON.stringify(c));
  await p.mouse.move(f.x - 40, f.y - 70, { steps: 4 }); await p.waitForTimeout(450);
  c = await curSt(p); must(c.on, 'після поля форми кільце не повернулось: ' + JSON.stringify(c));
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
await test('калькулятор (ar, RTL), кілька позицій: галочка з боку кінця рядка, без горизонтальної прокрутки на 344 px', '/ar/renovation-calculator', [344, 760], async p => {
  await cOnly(p, 'design', 'reno', 'furn', 'land');
  must(await p.locator('#cRows li').count() === 4 && /\$/.test(await p.textContent('#cSum')), 'ar: немає 4 рядків і суми');
  const side = await p.evaluate(() => { const b = document.querySelector('#cIt [data-k="reno"]'), r = b.getBoundingClientRect(), s = getComputedStyle(b, '::before'); return [parseFloat(s.left), r.width]; });
  must(side[0] < side[1] / 2, 'ar: галочка не ліворуч (кінець рядка в RTL): ' + side);
  must(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ar: горизонтальна прокрутка');
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
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAIL` : '\nВзаємодії: ALL OK');
process.exit(fails ? 1 : 0);
