// Список селекторів критичного CSS (tools/site/critcss.json → assets/crit.v1.css, див. tools/site/critcss.py).
//   node tools/tests/critcss.mjs            — обійти вибірку сторінок (усі типи й мови) на 9 ширинах, записати список і перезібрати файл
//   node tools/tests/critcss.mjs --check    — лише перевірити: чи всі правила першого екрана вже в списку (швидка вибірка)
// Перший екран = елементи, чий верх < 1.25 висоти вікна (CRIT_K) (без розміру — за попереднім елементом у порядку документа), стан до
// зовнішніх скриптів (вони виконуються вже після повного CSS). :hover/:focus/::before… відкидаються перед перевіркою (щедро).
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const CHECK = process.argv.includes('--check'), FRESH = process.argv.includes('--fresh');  // --fresh: список з нуля (інакше лише росте)
const K = +(process.env.CRIT_K || 1.25);  // «перший екран» = верх елемента < K × висота вікна
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f) && existsSync(f + '.html')) f += '.html';
  if (!existsSync(f) || f.includes('/tools/')) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

function walk(d, out = []) {
  for (const n of readdirSync(join(ROOT, d))) {
    const p = d ? d + '/' + n : n;
    if (/^(tools|node_modules|tury|\.|[a-z]{2}\/tury)/.test(p)) continue;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out); else if (p.endsWith('.html') && !/^google/.test(n)) out.push(p);
  }
  return out;
}
let files = walk('');
// вибірка: усе, крім довгих хвостів (товари Оздоби, статті блогу) — з них по кілька на мову/тип
const cnt = {};
files = files.filter(f => {
  const k = /ozdoba\/./.test(f) ? 'ozd:' + f.split('/')[0] : /(^|\/)blog\/./.test(f) ? 'blog:' + f.split('/')[0] : null;
  if (!k) return true;
  cnt[k] = (cnt[k] || 0) + 1; return cnt[k] <= (k.startsWith('ozd') ? 12 : 6);
});
if (CHECK) files = ['index.html', 'services.html', 'about.html', 'contact.html', 'portfolio.html', 'remont-kvartyr-kyiv.html', 'kalkuliator-remontu.html',
  'ozdoba.html', 'blog.html', 'budivnytstvo-budynkiv-kyiv.html', 'en/index.html', 'ar/index.html', 'proekty/monpark.html'].filter(f => existsSync(join(ROOT, f)));
const VPS = CHECK ? [[402, 874], [1440, 900]] : [[344, 740], [402, 874], [852, 393], [768, 1024], [1024, 768], [1114, 720], [1440, 900], [1920, 1080], [2560, 1440]];

const rules = JSON.parse(execSync('python3 tools/site/critcss.py --rules', { cwd: ROOT }).toString());
const known = new Set(JSON.parse(existsSync(join(ROOT, 'tools/site/critcss.json')) ? readFileSync(join(ROOT, 'tools/site/critcss.json'), 'utf8') : '[]'));
const hit = new Set();
const browser = await chromium.launch();

async function scan(file, [w, h]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1024 && h > w, hasTouch: w < 1200 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.route(/\.(js|webp|avif|png|jpe?g|woff2|mp4|webm)(\?|$)/, r => r.abort());
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + '/' + file.replace(/index\.html$/, ''), { waitUntil: 'load', timeout: 30000 });
    const got = await page.evaluate(({ rules, todo, K }) => {
      const H = innerHeight * K, inTop = new Set([document.documentElement, document.body]);
      let last = 0;
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width || r.height) last = r.top + scrollY;
        if (last < H) inTop.add(el);
      }
      const STATE = /:(hover|focus-visible|focus-within|focus|active|visited|link|any-link|target|popover-open|modal|fullscreen|-webkit-autofill|autofill|placeholder-shown|user-invalid|invalid|valid|open|closed|playing|paused)(?![\w-])/g;
      const PSEUDO = /::?(before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button|details-content|-webkit-[\w-]+|-moz-[\w-]+|-ms-[\w-]+)(\([^)]*\))?/g;
      const split = s => { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && !d) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
      const res = [];
      for (const r of rules) {
        if (!todo.includes(r)) continue;
        let ok = false;
        for (let s of split(r)) {
          s = s.replace(PSEUDO, '').replace(STATE, '').replace(/:not\(\s*\)/g, '').trim();
          if (!s || /^[>+~]/.test(s)) { ok = true; break; }
          s = s.replace(/[>+~]\s*$/, '').trim();
          let els;
          try { els = document.querySelectorAll(s); } catch { ok = true; break; }  // не розбирається — щедро в критичний
          for (const e of els) if (inTop.has(e)) { ok = true; break; }
          if (ok) break;
        }
        if (ok) res.push(r);
      }
      return res;
    }, { rules, todo: rules.filter(r => !hit.has(r)), K });
    got.forEach(r => hit.add(r));
  } catch (e) { console.error('  !', file, w, e.message.split('\n')[0]); }
  await ctx.close();
}

const jobs = [];
for (const f of files) for (const vp of VPS) jobs.push([f, vp]);
let done = 0;
const N = 6;
await Promise.all(Array.from({ length: N }, async () => {
  while (jobs.length) {
    const [f, vp] = jobs.shift(); await scan(f, vp);
    if (++done % 200 === 0) console.log(`  ${done} / ${files.length * VPS.length}, правил: ${hit.size}`);
  }
}));
await browser.close(); server.close();

const list = rules.filter(r => hit.has(r));
if (CHECK) {
  const miss = list.filter(r => !known.has(r));
  console.log(miss.length ? `Критичний CSS: ${miss.length} правил першого екрана немає в tools/site/critcss.json — node tools/tests/critcss.mjs\n  ` + miss.slice(0, 20).join('\n  ') : `Критичний CSS: OK (${known.size} правил у списку)`);
  process.exit(miss.length ? 1 : 0);
}
// правила, що вже були в списку, лишаємо (сторінки з вибірки могли змінитися) — список лише росте, доки правило є у файлі
const keep = rules.filter(r => hit.has(r) || (!FRESH && known.has(r)));
writeFileSync(join(ROOT, 'tools/site/critcss.json'), JSON.stringify(keep, null, 0).replace(/","/g, '",\n"') + '\n');
console.log(execSync('python3 tools/site/critcss.py', { cwd: ROOT }).toString().trim(), `— ${keep.length} з ${rules.length} правил, сторінок ${files.length} × ${VPS.length} ширин`);
