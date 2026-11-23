// Швидкість основних типів сторінок: LCP, CLS, TBT (сума long tasks понад 50 мс), байти й запити першого завантаження.
//   node tools/tests/perf.mjs [--pages /,/x] [--runs 2] [--json out.json]
//   node tools/tests/perf.mjs --inp [--runs 3] [--only 'частина назви']   — відгук на дії (INP), див. ACTS нижче
// «сцена» — TBT/CLS прокрутки колесом до першої сцени section.bz (або квізу) й ще 3 екрани крізь неї.
// Профілі: «телефон» 402×874 DPR3, 1.6 Мбіт/с, RTT 150 мс, CPU ×4; «ПК» 1440×900 без обмежень. Статика — з репозиторію
// (ті самі правила, що tools/tests/layout.mjs), зовнішні запити (Clarity тощо) блокуються; мініфікацію деплою не враховано.
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = process.env.PERF_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // PERF_ROOT=<інша копія репозиторію> — порівняння «до/після» тим самим скриптом
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PAGES = arg('--pages', '/,/en/,/services,/remont-kvartyr-kyiv,/budivnytstvo-budynkiv-kyiv,/portfolio,/ozdoba,/kalkuliator-remontu,/blog/avtorskyi-nahliad-navishcho').split(',');
const RUNS = +arg('--runs', 2);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.avif': 'image/avif' };
function staticFile(path) {
  let f = join(ROOT, decodeURIComponent(path));
  if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(join(f, 'index.html')) ? join(f, 'index.html') : f.replace(/\/$/, '') + '.html';
  if (!existsSync(f) && existsSync(f + '.html')) f = f + '.html';
  return existsSync(f) && !f.includes('/tools/') ? f : null;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), f = staticFile(u.pathname);
  if (!f) { res.writeHead(404); return res.end(); }
  const t = MIME[extname(f)] || 'application/octet-stream';
  let body = readFileSync(f); const h = { 'content-type': t, 'cache-control': 'no-store' };
  if (/text|javascript|json|svg/.test(t)) { body = zlib.brotliCompressSync(body); h['content-encoding'] = 'br'; }
  res.writeHead(200, h); res.end(body);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const PROF = {
  phone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, net: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, cpu: 4 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, net: null, cpu: 1 },
};
async function measure(path, p) {
  const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: !!p.isMobile, hasTouch: !!p.hasTouch });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (p.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...p.net });
  if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
  let bytes = 0, reqs = 0; const byType = {};
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
  cdp.on('Network.responseReceived', e => { reqs++; byType[e.type] = (byType[e.type] || 0) + 1; });
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0, tbt: 0, lcpEl: '' };
    new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = (e.element && (e.element.tagName + '.' + [...e.element.classList].join('.'))) || e.url || ''; } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 120000 });
  const load = Date.now() - t0;
  await page.waitForTimeout(p.net ? 3000 : 1200);
  const initial = { bytes, reqs, tbt: await page.evaluate(() => window.__m.tbt) };
  // перша дія: прокрутка (вмикає ліниві скрипти) — CLS після неї теж рахуємо (hadRecentInput не ставиться для scroll)
  await page.mouse.wheel(0, 900); await page.waitForTimeout(p.net ? 2500 : 800);
  await page.mouse.wheel(0, 2400); await page.waitForTimeout(p.net ? 2500 : 800);
  const m = await page.evaluate(() => window.__m);
  // сцена (section.bz) і квіз: прокрутка колесом до блоку й крізь нього — TBT/CLS цієї фази окремо (скрипт сцени, збірка, casDrive)
  let tbtScene = 0, clsScene = 0;
  const tgt = await page.evaluate(() => { const s = document.querySelector('section.bz[data-js], [data-quiz]'); return s ? Math.round(s.getBoundingClientRect().top + scrollY) : -1; });
  if (tgt >= 0) {
    const vh = p.viewport.height;
    for (let y = await page.evaluate(() => scrollY); y < tgt + 3 * vh; y += vh * 0.8) { await page.mouse.wheel(0, vh * 0.8); await page.waitForTimeout(p.net ? 700 : 250); }
    await page.waitForTimeout(p.net ? 2500 : 800);
    const m2 = await page.evaluate(() => window.__m);
    tbtScene = Math.round(m2.tbt - m.tbt); clsScene = +(m2.cls - m.cls).toFixed(3);
  }
  await ctx.close();
  return { lcp: Math.round(m.lcp), lcpEl: m.lcpEl.slice(0, 60), cls: +m.cls.toFixed(3), tbt: Math.round(initial.tbt), tbtScroll: Math.round(m.tbt - initial.tbt), tbtScene, clsScene, load, kb: Math.round(initial.bytes / 1024), reqs: initial.reqs, kbAfterScroll: Math.round(bytes / 1024) };
}
// ===== Відгук на дії (INP): node tools/tests/perf.mjs --inp [--runs 3] [--json out.json] =====
// Event Timing (PerformanceObserver 'event', durationThreshold 16): тривалість взаємодії = від події до наступного кадру, найдовша з подій однієї дії
// (pointerdown / pointerup / click / keydown). Мережа без обмежень (міряємо головний потік), телефон — CPU ×4. Дія > 200 мс на телефоні — код 1.
// d — уся тривалість, in — затримка до обробника, js — обробники, pt — стиль/розкладка/малювання після них.
const INP_MAX = 200;
const center = (p, sel, n = 0) => p.locator(sel).nth(n).evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
const sceneReady = async (p, sel) => {
  await p.mouse.wheel(0, 300); await p.waitForTimeout(400);
  await p.locator(sel).scrollIntoViewIfNeeded(); await p.waitForSelector(sel + ' .bz-nx', { timeout: 15000 }); await p.waitForTimeout(1200);
  const ap = p.locator(sel + ' .bz-ap').first(); if (await ap.count() && await ap.isVisible()) { await ap.click().catch(() => {}); await p.waitForTimeout(400); } // пауза автопрогравання
  await center(p, sel + ' .bz-nx');
};
const ACTS = [
  { name: 'плитка data-c="x": розгорнути', path: '/remont-kvartyr-kyiv', prep: p => center(p, '[data-c="x"] .ux-h', 1), sel: '[data-c="x"] .ux-h >> nth=1' },
  { name: 'плитка data-c="x": згорнути', path: '/remont-kvartyr-kyiv', prep: async (p, hit) => { await center(p, '[data-c="x"] .ux-h', 1); await hit('[data-c="x"] .ux-h >> nth=1'); await p.waitForTimeout(700); }, sel: '[data-c="x"] .ux-h >> nth=1' },
  { name: 'плитка з фото (послуги)', path: '/services', prep: p => center(p, '[data-c="x"] .ux-h', 0), sel: '[data-c="x"] .ux-h >> nth=0' },
  { name: 'бургер: відкрити', path: '/', only: 'phone', sel: '.sch-burger' },
  { name: 'бургер: закрити', path: '/', only: 'phone', prep: async (p, hit) => { await hit('.sch-burger'); await p.waitForTimeout(600); }, sel: '.sch-burger' },
  { name: 'перемикач мови: меню', path: '/services', sel: '.sch-ld summary' },
  { name: 'сцена (головна): наступний етап', path: '/', prep: p => sceneReady(p, '#build-anim'), sel: '#build-anim .bz-nx', twice: true },
  { name: 'сцена (головна): попередній етап', path: '/', prep: async (p, hit) => { await sceneReady(p, '#build-anim'); await hit('#build-anim .bz-nx'); await p.waitForTimeout(900); }, sel: '#build-anim .bz-pv' },
  { name: 'сцена (головна): → з клавіатури', path: '/', only: 'desktop', prep: async p => { await sceneReady(p, '#build-anim'); await p.locator('#build-anim .bz-nx').focus(); }, key: 'ArrowRight' },
  { name: 'сцена (будівництво, повна): наступний етап', path: '/budivnytstvo-budynkiv-kyiv', prep: p => sceneReady(p, '#build-anim'), sel: '#build-anim .bz-nx', twice: true },
  // огляд моделі (23.11.2026): кнопка «+», крок обертання з клавіатури (перепроєкція всіх видимих шарів) і «скинути» після повороту
  { name: 'модель (головна): «+» наблизити', path: '/', prep: p => sceneReady(p, '#build-anim'), sel: '#build-anim .bz-zi' },
  { name: 'модель (головна): крок обертання Shift+→', path: '/', prep: async p => { await sceneReady(p, '#build-anim'); await p.locator('#build-anim .bz-fig').focus(); }, key: 'Shift+ArrowRight', twice: true },
  { name: 'модель (головна): «скинути» після повороту', path: '/', prep: async p => { await sceneReady(p, '#build-anim'); await p.locator('#build-anim .bz-fig').focus(); await p.keyboard.press('Shift+ArrowRight'); await p.keyboard.press('Shift+ArrowDown'); await p.waitForTimeout(600); }, sel: '#build-anim .bz-zr', settle: 1200 },
  { name: 'модель (будівництво, повна): крок обертання', path: '/budivnytstvo-budynkiv-kyiv', prep: async p => { await sceneReady(p, '#build-anim'); await p.locator('#build-anim .bz-fig').focus(); }, key: 'Shift+ArrowRight', twice: true },
  { name: 'сцена (головна): вкладка «Ландшафт»', path: '/', prep: async p => { await sceneReady(p, '#build-anim'); await center(p, 'nav.la-tab a', 2); }, sel: 'nav.la-tab a >> nth=2', settle: 2500 },
  { name: 'лайтбокс: відкрити', path: '/proekty/monpark', prep: async p => { await center(p, 'a[data-lb]', 0); await p.waitForTimeout(900); }, sel: 'a[data-lb] >> nth=0' },
  { name: 'лайтбокс: наступне фото', path: '/proekty/monpark', prep: async (p, hit) => { await center(p, 'a[data-lb]', 0); await p.waitForTimeout(900); await hit('a[data-lb] >> nth=0'); await p.waitForTimeout(1200); }, key: 'ArrowRight' },
  { name: 'лайтбокс: закрити', path: '/proekty/monpark', prep: async (p, hit) => { await center(p, 'a[data-lb]', 0); await p.waitForTimeout(900); await hit('a[data-lb] >> nth=0'); await p.waitForTimeout(1200); }, key: 'Escape' },
  { name: '«Звʼязатися»: меню', path: '/remont-kvartyr-kyiv', only: 'phone', sel: '.mbar .mb-tg' },
  { name: 'вікно заявки: відкрити (кнопка футера)', path: '/remont-kvartyr-kyiv', prep: p => center(p, '.scf-cta'), sel: '.scf-cta' }, // Михайло 24.11.2026: форма — у вікні
  { name: 'квіз: варіант відповіді', path: '/remont-kvartyr-kyiv', prep: async p => { await p.mouse.wheel(0, 300); await p.waitForTimeout(400); await p.locator('[data-quiz]').first().scrollIntoViewIfNeeded(); await p.waitForSelector('.qz button, .qz label', { timeout: 10000 }); await center(p, '.qz button, .qz label'); await p.waitForTimeout(500); }, sel: '.qz button, .qz label', opt: true },
  { name: 'калькулятор: цифра в полі площі', path: '/kalkuliator-remontu', prep: async p => { await center(p, '#cArea'); await p.locator('#cArea').focus(); }, key: '7' },
  { name: 'FAQ: відкрити питання', path: '/about', prep: async p => { await center(p, 'details summary'); await p.waitForTimeout(300); }, sel: 'main details:not(.sch-ld) > summary', opt: true },
  { name: '«Читати далі» (.c-b)', path: '/blog/avtorskyi-nahliad-navishcho', prep: async p => { await center(p, 'main .c-b'); await p.waitForTimeout(300); }, sel: 'main .c-b', opt: true },
  { name: 'карусель «Що ми робимо»: →', path: '/', prep: async p => { await p.mouse.wheel(0, 300); await p.waitForTimeout(400); await center(p, '.xs-svc'); await p.waitForTimeout(600); }, sel: '.xs-svc .ui-next, .xs-svc [class*="next"], .xs-svc button >> nth=-1', opt: true },
];
async function inpOne(a, p) {
  const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: !!p.isMobile, hasTouch: !!p.hasTouch });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(() => {
    window.__ev = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ev.push({ n: e.name, d: e.duration, id: e.interactionId, in: e.processingStart - e.startTime, js: e.processingEnd - e.processingStart }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  });
  const hit = sel => p.hasTouch ? page.locator(sel).first().tap() : page.locator(sel).first().click();
  let r = null;
  try {
    await page.goto(BASE + a.path, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1200); // idle-ініціалізація (pointerFx, heroSlides, ліниві скрипти)
    if (a.prep) await a.prep(page, hit);
    await page.waitForTimeout(400);
    if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    await page.waitForTimeout(300);
    const worst = { d: 0 };
    for (let k = 0; k < (a.twice ? 2 : 1); k++) {
      await page.evaluate(() => { window.__ev.length = 0; });
      if (a.key) await page.keyboard.press(a.key); else await hit(a.sel);
      await page.waitForTimeout(a.settle || 900);
      const ev = (await page.evaluate(() => window.__ev)).filter(e => e.id > 0 || /^(pointerdown|pointerup|click|keydown|keyup)$/.test(e.n));
      if (process.env.INP_DEBUG) console.log('   ', ev.map(e => `${e.n} d${Math.round(e.d)} in${Math.round(e.in)} js${Math.round(e.js)}`).join(' | '));
      const top = ev.sort((x, y) => y.d - x.d)[0] || { n: '-', d: 8, in: 0, js: 0 }; // немає запису — швидше за 16 мс
      if (top.d >= worst.d) Object.assign(worst, top);
    }
    r = { d: Math.round(worst.d), ev: worst.n, in: Math.round(worst.in), js: Math.round(worst.js), pt: Math.max(0, Math.round(worst.d - worst.in - worst.js)) };
  } catch (e) { r = a.opt ? null : { err: String(e.message || e).split('\n')[0].slice(0, 120) }; }
  await ctx.close();
  return r;
}
if (process.argv.includes('--inp')) {
  const res = []; let bad = 0;
  const only = arg('--only', '');
  for (const a of ACTS) {
    if (only && !a.name.includes(only)) continue;
    const row = { name: a.name, path: a.path };
    for (const [name, p] of Object.entries(PROF)) {
      if (a.only && a.only !== name) continue;
      const rs = []; for (let i = 0; i < RUNS; i++) { const r = await inpOne(a, p); if (r) rs.push(r); }
      if (!rs.length) continue;
      const er = rs.find(r => r.err); if (er) { row[name] = er; bad++; continue; }
      rs.sort((x, y) => x.d - y.d); row[name] = rs[(rs.length - 1) >> 1]; row[name].all = rs.map(r => r.d);
      if (name === 'phone' && row[name].d > INP_MAX) bad++;
    }
    res.push(row);
    const f = r => !r ? '      —' : r.err ? ' ПОМИЛКА: ' + r.err : `${String(r.d).padStart(4)} мс (${r.ev}: чекав ${r.in}, js ${r.js}, кадр ${r.pt}; ${r.all.join('/')})`;
    console.log(`${row.phone && row.phone.d > INP_MAX ? '✗' : ' '} ${a.name.padEnd(44)} телефон ${f(row.phone).padEnd(58)} ПК ${f(row.desktop)}`);
  }
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(res, null, 1));
  await browser.close(); server.close();
  console.log(bad ? `\nINP: ${bad} дій повільніші за ${INP_MAX} мс на телефоні (або з помилкою)` : `\nINP: усі дії ≤ ${INP_MAX} мс на телефоні`);
  process.exit(bad ? 1 : 0);
}
const out = [];
for (const path of PAGES) for (const [name, p] of Object.entries(PROF)) {
  const rs = []; for (let i = 0; i < RUNS; i++) rs.push(await measure(path, p));
  const med = k => rs.map(r => r[k]).sort((a, b) => a - b)[Math.floor((rs.length - 1) / 2)];
  const r = { path, prof: name, lcp: med('lcp'), cls: Math.max(...rs.map(r => r.cls)), tbt: med('tbt'), tbtScroll: med('tbtScroll'), tbtScene: med('tbtScene'), clsScene: Math.max(...rs.map(r => r.clsScene)), kb: med('kb'), reqs: med('reqs'), kbAfterScroll: med('kbAfterScroll'), lcpEl: rs[0].lcpEl };
  out.push(r);
  console.log(`${path.padEnd(42)} ${name.padEnd(8)} LCP ${String(r.lcp).padStart(5)} мс  CLS ${r.cls.toFixed(3)}  TBT ${String(r.tbt).padStart(4)}+${String(r.tbtScroll).padStart(4)} мс  сцена TBT ${String(r.tbtScene).padStart(4)} CLS ${r.clsScene.toFixed(3)}  ${String(r.kb).padStart(5)} КБ/${r.reqs} запитів (після прокрутки ${r.kbAfterScroll} КБ)  LCP: ${r.lcpEl}`);
}
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
