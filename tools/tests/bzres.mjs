// Резерв висоти компактної сцени «Будинок з нуля» на головних (10 мов, телефон ≤ 767 px): поправка до формули резерву в site-chrome.v1.css.
// Панель етапу зібраної сцени (текст етапу, підказка, рядок ціни) переноситься по-різному залежно від мови й ширини — формула резерву
// (кадр + clamp(…69vw…)) цього не знає: до збірки блок був на −38…+45 px іншим, ніж після (вміст нижче сіпався, коли сцена збиралась у кадрі).
// Скрипт міряє обидва стани на одній сторінці мови при ширинах 320…767 (крок 1 px): сторінка A — резерв (build-anim.v1.js не приходить),
// сторінка B — зібрана сцена; різниця висот секції → --bzr для :lang(мова) і діапазону ширин. Підказка («один раз», localStorage casScHint)
// висоти не змінює (панель тримає місце) — перевіряємо обидва стани. Два профілі висоти вікна: 874 (звичайні телефони) і 667 (≤ 700 px —
// iPhone SE тощо: build-anim.v1.css ховає лічильник «01 / N» і зменшує текст етапу) — свої правила з (max-height:700px) після основних.
// Від решти висоти вікна різниця не залежить (кадр min(40svh,340px) однаковий до й після збірки; перевірено 640…932).
//   node tools/tests/bzres.mjs            перевірка: |різниця| ≤ 8 px на всіх ширинах (код 1, якщо ні)
//   node tools/tests/bzres.mjs --write    переміряти й переписати блок /*bzr*/…/*/bzr*/ у site-chrome.v1.css (далі — critcss не потрібен: правило не критичне)
//   LANGS=uk,es WIDTHS=360,402 H=667 node tools/tests/bzres.mjs   — частина (H — лише цей профіль висоти)
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.avif': 'image/avif' };
const server = http.createServer((q, s) => {
  let f = join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f) && existsSync(f + '.html')) f += '.html';
  if (!existsSync(f) || f.includes('/tools/')) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;
const WRITE = process.argv.includes('--write'), TOL = 8;
const PROF = [[874, ''], [667, ' and (max-height:700px)']].filter(([h]) => !process.env.H || h === +process.env.H || (+process.env.H <= 700) === (h <= 700)).map(([h, m]) => [+process.env.H || h, m]);
const LANGS = (process.env.LANGS || 'uk,ru,en,es,zh,pl,de,fr,pt,ar').split(',');
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : Array.from({ length: 767 - 320 + 1 }, (_, i) => 320 + i);
const CSS = join(ROOT, 'assets', 'site-chrome.v1.css');
const browser = await chromium.launch();

async function open(lang, built, seen, H) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  if (!built) await p.route(/\/assets\/build-anim\.v1\.js/, () => {}); // ніколи не відповідаємо: резерв лишається (не .bz-no)
  await p.addInitScript(([seen, base]) => {
    try { if (seen) localStorage.setItem('casScHint', '1'); else localStorage.removeItem('casScHint'); } catch (e) { }
    if (base) addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.bz{--bzr:0px!important}'; document.head.appendChild(s); });
  }, [seen, WRITE && !built]);
  await p.goto(BASE + (lang === 'uk' ? '/' : `/${lang}/`), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.mouse.move(100, 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('build-anim').scrollIntoView({ block: 'start' }));
  if (built) {
    await p.waitForSelector('#build-anim .bz-nx', { timeout: 20000 });
    await p.waitForFunction(() => !document.getElementById('build-anim').style.minHeight, null, { timeout: 20000 });
    // зупиняємо автопрогравання (кроки етапів не змінюють висоту — усі li в одній клітинці сітки, але менше роботи між замірами)
    await p.evaluate(() => { const b = document.querySelector('#build-anim .sc-enc'); if (b && b.getAttribute('data-st') === 'on') b.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
  } else {
    await p.waitForTimeout(300);
    if (!(await p.evaluate(() => { const s = document.getElementById('build-anim'); return !s.hasAttribute('data-bz-on') && !s.classList.contains('bz-no'); }))) throw new Error(lang + ': резерв не тримається (сцена зібралась або .bz-no)');
  }
  return { ctx, p };
}
const H_SEC = p => p.evaluate(() => new Promise(ok => requestAnimationFrame(() => ok(document.getElementById('build-anim').getBoundingClientRect().height)))); // кадр після зміни вікна: обробники resize сцени встигають

const res = {}; // res[H][seen][lang] = [[w, Δ]…]
let bad = [];
// без підказки — лише перевірка (кожна 4-та ширина): панель тримає місце підказки, висота та сама
const jobs = [];
for (const [H] of PROF) for (const seen of WRITE ? [false] : [false, true]) for (const lang of LANGS) jobs.push([H, seen, lang, seen && !process.env.WIDTHS ? WIDTHS.filter((w, i) => i % 4 === 0) : WIDTHS]);
async function job([H, seen, lang, ws]) {
  const [A, B] = await Promise.all([open(lang, false, seen, H), open(lang, true, seen, H)]);
  const hint = await B.p.evaluate(() => !!document.querySelector('#build-anim .sc-hint'));
  if (hint === seen) throw new Error(`${lang}: підказка ${hint ? 'є' : 'немає'} при casScHint=${seen ? 1 : 0}`);
  const row = ((res[H] ||= {})[seen] ||= {})[lang] = [];
  for (const w of ws) {
    await Promise.all([A.p.setViewportSize({ width: w, height: H }), B.p.setViewportSize({ width: w, height: H })]);
    const [hb, ha] = await Promise.all([H_SEC(B.p), H_SEC(A.p)]);
    const d = Math.round(hb - ha);
    row.push([w, d]);
    if (!WRITE && Math.abs(d) > TOL) bad.push(`${lang}${seen ? ' (без підказки)' : ''} @${w}×${H}: ${d > 0 ? '+' : ''}${d} px`);
  }
  await A.ctx.close(); await B.ctx.close();
  const ds = row.map(x => x[1]);
  console.log(`  ${lang} ×${H}${seen ? ' без підказки' : ''}: різниця ${Math.min(...ds)}…${Math.max(...ds)} px` + (ws.length <= 4 ? ' (' + row.map(x => x[0] + ':' + x[1]).join(' ') + ')' : ''));
}
const PAR = +process.env.PAR || 3; // паралельно — мови (у кожної дві сторінки)
// BZR_RAW=<файл.json>: заміри зберігаються туди; з --write і наявним файлом — беруться з нього без перемірювання (підбір діапазонів)
const RAW = process.env.BZR_RAW;
if (WRITE && RAW && existsSync(RAW)) Object.assign(res, JSON.parse(readFileSync(RAW, 'utf8')));
else { await Promise.all(Array.from({ length: PAR }, async () => { while (jobs.length) await job(jobs.shift()); })); if (RAW) writeFileSync(RAW, JSON.stringify(res)); }
await browser.close(); server.close();

if (WRITE) {
  // правила за зростанням min-width (пізніше перекриває раніше), профіль ≤ 700 px — після основного; відрізки ширин, де розкид різниці ≤ 6 px, — одне значення (середина): похибка ≤ 3 px; нове правило — лише коли значення змінюється
  const out = [];
  for (const [H, media] of PROF) {
    const rules = []; // [w, мова, px]
    for (const lang of LANGS) {
      const row = res[H][false][lang], segs = [];
      for (const [w, d] of row) { const s = segs.at(-1); if (s && Math.max(s.hi, d) - Math.min(s.lo, d) <= 6) { s.hi = Math.max(s.hi, d); s.lo = Math.min(s.lo, d); } else segs.push({ w, lo: d, hi: d }); }
      let prev = null;
      for (const s of segs) { const v = Math.round((s.lo + s.hi) / 2); if (v !== prev) rules.push([s.w, lang, v]); prev = v; }
    }
    const byW = new Map();
    for (const [w, lang, v] of rules) { const k = w === WIDTHS[0] ? 0 : w; if (!byW.has(k)) byW.set(k, []); byW.get(k).push(lang + ':' + v); }
    for (const w of [...byW.keys()].sort((a, b) => a - b)) {
      // одне значення для кількох мов — один селектор; на .bz, не на html (інакше critcss.mjs вважає правило першоекранним)
      const g = new Map(); for (const x of byW.get(w)) { const [l, v] = x.split(':'); if (!g.has(v)) g.set(v, []); g.get(v).push(l); }
      const r = [...g].map(([v, ls]) => (ls.length > 1 ? `.bz[data-bz-c]:is(${ls.map(l => `:lang(${l})`).join(',')})` : `.bz[data-bz-c]:lang(${ls[0]})`) + `{--bzr:${v}px}`).join('');
      out.push((w ? `@media(min-width:${w}px) and (max-width:767px)` : `@media(max-width:767px)`) + media + `{${r}}`);
    }
    console.log(`  ×${H}: ${rules.length} поправок, ${byW.size} діапазонів ширин`);
  }
  const body = out.join('\n');
  const blk = `/*bzr*/ /* ЗГЕНЕРОВАНО tools/tests/bzres.mjs --write: поправка резерву компактної сцени головних за мовою й шириною (--bzr, у формулі резерву @media(max-width:767px)); руками не правити */\n${body}\n/*/bzr*/`;
  let css = readFileSync(CSS, 'utf8');
  const re = /\/\*bzr\*\/[\s\S]*?\/\*\/bzr\*\//;
  if (!re.test(css)) throw new Error('у site-chrome.v1.css немає блоку /*bzr*/…/*/bzr*/');
  css = css.replace(re, blk); writeFileSync(CSS, css);
  console.log(`  записано ${blk.length} Б`);
} else {
  if (bad.length) { console.log(`\nРезерв компактної сцени: ${bad.length} розбіжностей > ${TOL} px:\n  ` + bad.slice(0, 30).join('\n  ')); process.exit(1); }
  console.log(`\nРезерв компактної сцени: OK (≤ ${TOL} px, ${LANGS.length} мов × ${WIDTHS.length} ширин × висоти ${PROF.map(x => x[0]).join('/')} × з підказкою/без)`);
}
