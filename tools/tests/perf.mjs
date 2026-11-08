// Швидкість основних типів сторінок: LCP, CLS, TBT (сума long tasks понад 50 мс), байти й запити першого завантаження.
//   node tools/tests/perf.mjs [--pages /,/x] [--runs 2] [--json out.json]
// Профілі: «телефон» 402×874 DPR3, 1.6 Мбіт/с, RTT 150 мс, CPU ×4; «ПК» 1440×900 без обмежень. Статика — з репозиторію
// (ті самі правила, що tools/tests/layout.mjs), зовнішні запити (Clarity тощо) блокуються; мініфікацію деплою не враховано.
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
  await ctx.close();
  return { lcp: Math.round(m.lcp), lcpEl: m.lcpEl.slice(0, 60), cls: +m.cls.toFixed(3), tbt: Math.round(initial.tbt), tbtScroll: Math.round(m.tbt - initial.tbt), load, kb: Math.round(initial.bytes / 1024), reqs: initial.reqs, kbAfterScroll: Math.round(bytes / 1024) };
}
const out = [];
for (const path of PAGES) for (const [name, p] of Object.entries(PROF)) {
  const rs = []; for (let i = 0; i < RUNS; i++) rs.push(await measure(path, p));
  const med = k => rs.map(r => r[k]).sort((a, b) => a - b)[Math.floor((rs.length - 1) / 2)];
  const r = { path, prof: name, lcp: med('lcp'), cls: Math.max(...rs.map(r => r.cls)), tbt: med('tbt'), tbtScroll: med('tbtScroll'), kb: med('kb'), reqs: med('reqs'), kbAfterScroll: med('kbAfterScroll'), lcpEl: rs[0].lcpEl };
  out.push(r);
  console.log(`${path.padEnd(42)} ${name.padEnd(8)} LCP ${String(r.lcp).padStart(5)} мс  CLS ${r.cls.toFixed(3)}  TBT ${String(r.tbt).padStart(4)}+${String(r.tbtScroll).padStart(4)} мс  ${String(r.kb).padStart(5)} КБ/${r.reqs} запитів (після прокрутки ${r.kbAfterScroll} КБ)  LCP: ${r.lcpEl}`);
}
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
