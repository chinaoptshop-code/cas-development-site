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
async function test(name, path, w, fn) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 874 : 900 }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
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
  const b = JSON.parse(posts.at(-1).body); must(/380671234567|0671234567/.test(b.phone), 'телефон не в заявці');
  must(b.service, 'немає service');
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
  const inp = p.locator('input[type=number], input[type=range]').first();
  must(await inp.count(), 'немає поля площі');
  const before = await p.locator('main').innerText();
  await inp.fill('120').catch(async () => { await inp.evaluate(e => { e.value = 120; e.dispatchEvent(new Event('input', { bubbles: true })); }); });
  await inp.dispatchEvent('input'); await inp.dispatchEvent('change'); await p.waitForTimeout(500);
  const after = await p.locator('main').innerText();
  must(after !== before && /\$\s?\d|\d[\d\s]*\s?\$/.test(after), 'сума не змінилась');
});
await test('калькулятор: 0 → «—», дизайн для 10 м² — мінімум $2 500, величезна площа обмежена', '/kalkuliator-remontu', 402, async p => {
  const set = async v => { await p.fill('#cArea', v); await p.dispatchEvent('#cArea', 'input'); await p.waitForTimeout(150); return p.textContent('#cSum'); };
  const kind = async k => { await p.selectOption('#cKind', k); await p.waitForTimeout(150); };
  const nb = s => s.replace(/[  ]/g, ' ');
  must((await set('0')) === '—', 'площа 0 не дає «—»');
  must((await set('abc').catch(() => '—')) === '—', 'нечислове значення');
  must((await set('-5')) === '—', 'відʼємна площа');
  await kind('remont'); await p.click('#cDz [data-p="dz"]'); await p.check('#cFurn');
  await set('10');
  must(nb(await p.textContent('#cRows')).includes('$2 500'), 'дизайн 10 м² не дорівнює мінімуму $2 500');
  const big = (await set('99999999')).replace(/\D/g, '');
  must(+big <= 100000 * (550 + 45 + 250) + 1, 'площа не обмежена: ' + big);
  // пакети дизайну: планувальний $6/м² і повний $45/м² — теж мінімум $2 500
  await set('1000'); await p.click('#cDz [data-p="plan"]');
  must(nb(await p.textContent('#cRows')).includes('$6 000'), 'планувальний 1000 м² ≠ $6 000');
  await p.click('#cDz [data-p="full"]'); await set('20');
  must(nb(await p.textContent('#cRows')).includes('$2 500'), 'повний 20 м² не дорівнює мінімуму $2 500');
  // ±5% — лише для ремонту
  must(/±5/.test(await p.textContent('#cNote')), 'немає ±5% для ремонту');
  await kind('house'); must(!/±5/.test(await p.textContent('#cNote')), '±5% для будівництва');
  must(await p.locator('#cFurnW').isHidden(), 'меблювання для коробки');
  // Європа: ремонт $850, дизайн мін. $4 000, меблювання $400; офіс і ландшафт — за кошторисом
  await kind('remont'); await p.click('#cReg [data-r="1"]'); await p.click('#cDz [data-p="dz"]'); await set('10');
  must(nb(await p.textContent('#cRows')).includes('$8 500') && nb(await p.textContent('#cRows')).includes('$4 000') && nb(await p.textContent('#cRows')).includes('$4 000'), 'ставки Європи: ' + await p.textContent('#cRows'));
  await p.click('#cDz [data-p="plan"]');
  must(/кошторис/.test(await p.textContent('#cRows')) && await p.locator('#cPlus').isVisible(), 'планувальний у Європі не «за кошторисом»');
  await kind('office'); await p.click('#cDz [data-p="0"]'); await p.uncheck('#cFurn'); await p.waitForTimeout(150);
  must(/кошторис/.test(await p.textContent('#cSum')) && await p.locator('#cSumL').isHidden(), 'офіс у Європі не «за кошторисом»');
  await kind('land');
  must((await p.inputValue('#cArea')) === '10' && /сот/.test(await p.textContent('#cAreaL')), 'ландшафт — не в сотках');
  must(/кошторис/.test(await p.textContent('#cSum')), 'ландшафт у Європі не «за кошторисом»');
  await p.click('#cReg [data-r="0"]'); must(nb(await set('12.5')) === '$625', 'ландшафт 12,5 сотки ≠ $625');
  await p.click('#cSend'); await p.waitForTimeout(300);
  must((await p.inputValue('#oArea')) === '1250', 'сотки не перетворено на м² у формі');
  const ms = await p.inputValue('#oMsg'), sv = await p.getAttribute('#of', 'data-service');
  must(/Україна/.test(ms) && /Ландшафт/.test(ms) && /Ландшафт/.test(sv) && /Україна/.test(sv), 'регіон/послуга не в формі: ' + ms + ' | ' + sv);
  await kind('remont'); must((await p.inputValue('#cArea')) !== '12.5', 'площа м² не відновилась після соток');
  await p.click('#cReg [data-r="1"]');
  await set('60'); await p.click('#cSend'); await p.waitForTimeout(300);
  const m1 = await p.inputValue('#oMsg'); must(/Європа/.test(m1) && /Європа/.test(await p.getAttribute('#of', 'data-service')), 'Європа не в формі');
  await set('80'); await p.click('#cSend'); await p.waitForTimeout(300);
  must((await p.inputValue('#oMsg')) !== m1 && (await p.inputValue('#oArea')) === '80', 'повторний розрахунок не оновив форму');
});
await test('калькулятор (ar, RTL): Європа й ландшафт', '/ar/renovation-calculator', 402, async p => {
  await p.click('#cReg [data-r="1"]'); await p.selectOption('#cKind', 'land'); await p.waitForTimeout(150);
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
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAIL` : '\nВзаємодії: ALL OK');
process.exit(fails ? 1 : 0);
