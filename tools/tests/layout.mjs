// Playwright-аудит верстки: сторінки сайту на різних ширинах, програмні перевірки класу «щось комусь заважає».
//   node tools/tests/layout.mjs                      # швидкий набір (головні, послуги, про, контакти, портфоліо; 402 і 1440) — код 1 при помилках
//   node tools/tests/layout.mjs --full [--out <тека>] [--widths 360,402,...] [--pages /a,/b] [--set core|uk|all]
// Перевіряє: (a) секції/блоки в main вужчі за сусідів (shrink-to-fit у grid/flex), (b) текст поверх тексту/кнопок,
// (c) контраст тексту на фото (піксельна проба під текстом), (d) фіксовані шапка/пігулка «Звʼязатися» над кнопками/полями/H1
// (на старті й унизу сторінки), (e) горизонтальна прокрутка, (f) обрізаний текст, (g) тап-цілі < 44 px на тачі,
// (h) фото розтягнуті (менше слоту × DPR × 0.95) чи сплющені; плюс JS-помилки консолі.
// Статика — з кореня репозиторію (як Cloudflare Pages: /x → x.html, CSP з _headers), зовнішні запити блокуються.
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FULL = process.argv.includes('--full');
const OUT = arg('--out', null);
if (OUT) mkdirSync(OUT, { recursive: true });
const DPR = { 360: 3, 402: 3, 768: 2, 1024: 2, 1440: 1, 1920: 2, 2560: 1 };
const WIDTHS = (arg('--widths', FULL ? '360,402,768,1024,1440,1920,2560' : '402,1440')).split(',').map(Number);

// ===== набори сторінок =====
const CL = JSON.parse(readFileSync(join(ROOT, 'tools/site/lang/clusters.json'), 'utf8'));
const LANGS = ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'ar'];
const core = [...LANGS.map(l => CL.home[l])];
for (const k of ['services', 'about', 'contact']) for (const l of ['uk', 'en', 'ru', 'ar']) core.push(CL[k][l]);
core.push('/portfolio', '/en/portfolio', '/ru/portfolio');
const ukLand = readdirSync(join(ROOT, 'tools/site/pages')).filter(f => /^uk-.*\.json$/.test(f))
  .map(f => JSON.parse(readFileSync(join(ROOT, 'tools/site/pages', f), 'utf8')).slug).filter(s => s && !['index', 'about', 'services', 'contact', 'portfolio'].includes(s)).map(s => '/' + s);
const extra = ['/en/interior-design', '/en/house-construction', '/en/turnkey-renovation', '/en/landscape-design', '/en/restaurant-design',
  '/ozdoba', '/kalkuliator-remontu', '/remont-kvartyr-kyiv', '/budivnytstvo-budynkiv-kyiv', '/dyzain-interieru-kyiv'];
const blogs = readdirSync(join(ROOT, 'blog')).filter(f => f.endsWith('.html')).slice(0, 3).map(f => '/blog/' + f.slice(0, -5));
const prod = readdirSync(join(ROOT, 'ozdoba')).filter(f => f.endsWith('.html'))[0];
const SETS = {
  quick: core.filter(p => !/\/ar\/|\/ru\/(?!$)/.test(p)),
  core: [...core, ...extra, '/ozdoba/' + prod.slice(0, -5), ...blogs],
  uk: ukLand,
};
SETS.all = [...new Set([...SETS.core, ...SETS.uk])];
let PAGES = arg('--pages', null)?.split(',') || SETS[arg('--set', FULL ? 'core' : 'quick')];
PAGES = PAGES.filter(p => existsSync(join(ROOT, p === '/' ? 'index.html' : p.endsWith('/') ? p + 'index.html' : p + '.html')));

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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.avif': 'image/avif', '.ico': 'image/x-icon', '.pbf': 'application/x-protobuf' };
function staticFile(path) {
  let f = join(ROOT, decodeURIComponent(path));
  if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(join(f, 'index.html')) ? join(f, 'index.html') : f.replace(/\/$/, '') + '.html';
  if (!existsSync(f) && existsSync(f + '.html')) f = f + '.html';
  return existsSync(f) && !f.includes('/tools/') ? f : null;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
  const f = staticFile(u.pathname);
  if (!f) { res.writeHead(404); return res.end('404'); }
  const headers = { 'content-type': MIME[extname(f)] || 'application/octet-stream' };
  if (extname(f) === '.html') { const csp = cspOf(u.pathname); if (csp.length) headers['content-security-policy'] = csp.join(', '); }
  res.writeHead(200, headers); res.end(readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ===== перевірки в сторінці =====
function analyze(opts) {
  const out = [];
  const W = innerWidth, touch = opts.touch, dpr = devicePixelRatio;
  const add = (cls, el, msg, rect) => {
    const r = rect || el.getBoundingClientRect();
    out.push({ cls, sel: path(el), msg, rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } });
  };
  function path(el) {
    const p = [];
    for (let e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { p.unshift(s + '#' + e.id); break; }
      const c = [...e.classList].slice(0, 2).join('.');
      if (c) s += '.' + c;
      p.unshift(s);
    }
    return p.join('>');
  }
  const cs = e => getComputedStyle(e);
  const visible = e => {
    if (!e.getClientRects().length) return false;
    for (let x = e; x && x !== document.body; x = x.parentElement) {
      const s = cs(x);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
      if (x.hasAttribute('hidden') || x.getAttribute('aria-hidden') === 'true') return false;
      const pa = x.parentElement; // вміст закритого <details> не відображається
      if (pa && pa.tagName === 'DETAILS' && !pa.open && x.tagName !== 'SUMMARY') return false;
    }
    return true;
  };
  // видима частина з урахуванням overflow предків
  const clipCache = new Map();
  function clipOf(el) {
    if (clipCache.has(el)) return clipCache.get(el);
    let r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    const p = el.parentElement;
    if (p && p !== document.documentElement) {
      r = { ...clipOf(p) };
      const s = cs(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.contain.includes('paint')) {
        const b = p.getBoundingClientRect();
        if (s.overflowX !== 'visible') { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
        if (s.overflowY !== 'visible') { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
      }
    }
    clipCache.set(el, r);
    return r;
  }
  // те саме, але з власним overflow елемента (line-clamp, max-height:0 у згорнутих блоках)
  const selfClip = el => {
    const r = { ...clipOf(el) }, s = cs(el);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
      const b = el.getBoundingClientRect();
      if (s.overflowX !== 'visible') { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
      if (s.overflowY !== 'visible') { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
    }
    return r;
  };
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const clipRect = (r, c) => { const l = Math.max(r.left, c.l), t = Math.max(r.top, c.t), rr = Math.min(r.right, c.r), b = Math.min(r.bottom, c.b); return rr > l && b > t ? { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t } : null; };
  const isFixed = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = cs(x).position; if (p === 'fixed' || p === 'sticky') return x; } return null; };

  // (e) горизонтальна прокрутка
  const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (over > 1) {
    const culprits = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > W + 1 && r.width > 0 && visible(e) && clipOf(e).r > W + 1; }).slice(-3);
    add('e-hscroll', culprits[0] || document.body, `горизонтальна прокрутка ${over}px: ${culprits.map(path).join(' | ')}`);
  }

  // (a) діти main / секцій вужчі за контейнер
  const main = document.querySelector('main') || document.body;
  const containers = [main, ...main.querySelectorAll(':scope > section, :scope > div, :scope > section > .w, :scope > .w, :scope > section > div')];
  for (const c of containers) {
    const s = cs(c);
    if (!visible(c) || !/block|grid|flex/.test(s.display) || s.display.includes('inline')) continue;
    if (s.display.includes('flex') && s.flexDirection.startsWith('row')) continue;
    const cr = c.getBoundingClientRect();
    const inner = cr.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth);
    if (inner < 200) continue;
    const isGrid = s.display.includes('grid');
    const cols = isGrid ? s.gridTemplateColumns.split(' ').length : 1;
    for (const k of c.children) {
      if (!visible(k) || /^(SCRIPT|STYLE|TEMPLATE|BR|A|BUTTON|SPAN|IMG|SVG|INPUT|LABEL|SMALL|B|EM|STRONG|svg|P)$/.test(k.tagName)) continue;
      const ks = cs(k);
      if (ks.position === 'absolute' || ks.position === 'fixed' || ks.display.startsWith('inline') || ks.float !== 'none') continue;
      if (k.matches('[data-c="x"], [data-c="k"], .sc-chev, [role="tablist"], nav.la-tab, .btns, .lq-go, .la-ctl')) continue;
      if (isGrid) { // span < усіх колонок — задумана плитка
        const gc = ks.gridColumnStart + '/' + ks.gridColumnEnd;
        if (cols > 1 && !/^1\/-1$|^auto\/auto$/.test(gc.replace(/\s/g, ''))) continue;
        if (cols > 1 && gc.replace(/\s/g, '') === 'auto/auto' && !(cols >= 6 || k.tagName === 'SECTION')) continue;
        if (cols > 1 && gc.replace(/\s/g, '') === 'auto/auto') {
          const kr = k.getBoundingClientRect();
          if (kr.width < inner * 0.85 && !/^\d/.test(ks.maxWidth)) add('a-narrow', k, `елемент grid (${cols} кол.) без grid-column:1/-1 — ${Math.round(kr.width)} з ${Math.round(inner)}px`);
          continue;
        }
      }
      const kr = k.getBoundingClientRect();
      if (kr.width >= inner * 0.85) continue;
      // задумано вужчий: max-width у px/em/ch (текстова колонка) — пропускаємо, якщо елемент упирається в свій max-width
      const mw = parseFloat(ks.maxWidth);
      if (!isNaN(mw) && Math.abs(kr.width - mw) < 2) continue;
      if (/%/.test(ks.width) || ks.width !== 'auto' && k.style.width) continue;
      // текстові блоки (h2, p, ul) з max-width у em — пропускаємо
      if (/^(H\d|UL|OL|DL|FIGURE|BLOCKQUOTE|FORM|DETAILS|TABLE)$/.test(k.tagName) && !isNaN(mw)) continue;
      // блок, ширина якого = ширина вмісту (fit-content / shrink) — підозра
      const wide = [...c.children].filter(x => x !== k && visible(x) && x.getBoundingClientRect().width >= inner * 0.95).length;
      if (wide >= 1 && kr.width < inner * 0.85 && kr.height > 60) add('a-narrow', k, `вужчий за сусідів: ${Math.round(kr.width)} з ${Math.round(inner)}px (max-width ${ks.maxWidth}, margin ${ks.marginLeft}/${ks.marginRight})`);
    }
  }

  // збір текстових вузлів
  const texts = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim().length > 1 ? 1 : 2 });
  const visCache = new Map();
  const vis = e => { if (!visCache.has(e)) visCache.set(e, visible(e)); return visCache.get(e); };
  for (let n; (n = tw.nextNode());) {
    const el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TITLE)$/.test(el.tagName) || el.closest('svg,[hidden],.sr-only,.visually-hidden,.skip,.sch-menu,details:not([open])>:not(summary)') || !vis(el)) continue;
    const s = cs(el);
    if (s.color === 'rgba(0, 0, 0, 0)' || parseFloat(s.fontSize) < 1) continue;
    { const b = el.getBoundingClientRect(); if (b.width <= 2 || b.height <= 2 || s.clip !== 'auto' || /inset\(50%/.test(s.clipPath)) continue; } // sr-only
    const rg = document.createRange(); rg.selectNodeContents(n);
    const c = selfClip(el);
    for (const r of rg.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const v = clipRect(r, c);
      if (v && v.width > 2 && v.height > 2) texts.push({ el, r: v, n });
    }
  }
  // (b) текст поверх тексту / кнопок
  const ints = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary')].filter(vis);
  const bucket = new Map(), BS = 200;
  const keys = r => { const k = []; for (let x = Math.floor((r.left + scrollX) / BS); x <= Math.floor((r.right + scrollX) / BS); x++) for (let y = Math.floor((r.top + scrollY) / BS); y <= Math.floor((r.bottom + scrollY) / BS); y++) k.push(x + ',' + y); return k; };
  texts.forEach((t, i) => keys(t.r).forEach(k => { if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(i); }));
  const seen = new Set();
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  const fixedA = new Map(); const fx = e => { if (!fixedA.has(e)) fixedA.set(e, isFixed(e)); return fixedA.get(e); };
  for (const [, idx] of bucket) for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) {
    const A = texts[idx[i]], B = texts[idx[j]];
    if (A.n === B.n || related(A.el, B.el)) continue;
    if (fx(A.el) !== fx(B.el)) continue; // фіксоване над прокручуваним — окрема перевірка (d)
    const ov = inter(A.r, B.r), m = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
    if (ov > m * 0.25 && ov > 30) {
      const key = path(A.el) + '|' + path(B.el); if (seen.has(key)) continue; seen.add(key);
      add('b-text-overlap', A.el, `текст «${A.n.nodeValue.trim().slice(0, 40)}» перекриває «${B.n.nodeValue.trim().slice(0, 40)}» (${path(B.el)})`, A.r);
    }
  }
  for (const it of ints) {
    if (fx(it)) continue;
    for (const raw of it.getClientRects()) { // багаторядкове посилання — кожен рядок окремо
    const ir = clipRect(raw, clipOf(it)); if (!ir) continue;
    for (const k of keys(ir)) for (const i of bucket.get(k) || []) {
      const T = texts[i];
      if (related(T.el, it) || fx(T.el) || T.el.closest('a,button,label,summary') && related(T.el.closest('a,button,label,summary'), it)) continue;
      const ov = inter(T.r, ir);
      if (ov > T.r.width * T.r.height * 0.3 && ov > 30) {
        const key = path(T.el) + '>' + path(it); if (seen.has(key)) continue; seen.add(key);
        add('b-text-over-control', T.el, `текст «${T.n.nodeValue.trim().slice(0, 40)}» під/над елементом ${path(it)}`, T.r);
      }
    }  }
  }
  // (d) фіксовані шари над кнопками/полями/H1
  const fixedEls = [...document.querySelectorAll('body *')].filter(e => { const p = cs(e).position; return (p === 'fixed' || p === 'sticky') && vis(e) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < innerHeight * 0.6; });
  // на старті — H1 і кнопки першого екрана (hero); унизу сторінки — усе, що вже не відкрутити з-під шару
  const hero = main.firstElementChild;
  const targets = [...ints, ...document.querySelectorAll('h1')].filter(e => vis(e) && !fixedEls.some(f => f.contains(e)) && (opts.phase !== 'top0' || e.tagName === 'H1' || hero && hero.contains(e)));
  for (const f of fixedEls) {
    if (fixedEls.some(g => g !== f && g.contains(f))) continue;
    // шапка при прокрутці закономірно накриває вміст під собою — перевіряємо її лише на старті сторінки
    if (opts.phase !== 'top0' && f.matches('header, .sch')) continue;
    // лише непрозорі частини: сам елемент, якщо має фон, або його видимі діти
    const parts = [f, ...f.querySelectorAll('*')].filter(e => { const s = cs(e); return vis(e) && (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || e.tagName === 'A' || e.tagName === 'BUTTON'); });
    for (const p of parts) {
      const fr = p.getBoundingClientRect(); if (fr.width < 4 || fr.height < 4) continue;
      for (const t of targets) {
        const tr = t.getBoundingClientRect();
        if (tr.bottom < 0 || tr.top > innerHeight) continue;
        const ov = inter(fr, tr);
        if (ov > tr.width * tr.height * 0.25) add('d-fixed-cover', t, `${opts.phase}: ${path(p)} закриває ${t.tagName.toLowerCase()} «${(t.textContent || t.value || t.placeholder || '').trim().slice(0, 30)}»`, tr);
      }
    }
  }
  if (opts.phase !== 'top0') return out;

  // (f) обрізаний текст
  const textEls = new Set(texts.map(t => t.el));
  for (const el of textEls) {
    const s = cs(el);
    if (el.closest('.sch-menu,[data-c],.ux-rest,.mq,.xs-st,.vgrid,[class*="marq"],[class*="car"]')) continue;
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue; // візуально прихований (sr-only) текст
    if ((s.overflowX !== 'visible' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2 && s.whiteSpace !== 'normal' && el.clientWidth > 0)
      add('f-clipped', el, `текст обрізаний по ширині (${el.scrollWidth}>${el.clientWidth}) «${el.textContent.trim().slice(0, 40)}»`);
    else if (s.webkitLineClamp && s.webkitLineClamp !== 'none') {
      if (el.scrollHeight > el.clientHeight + 2 && !el.parentElement.querySelector('button,[data-more],.ux-more') && !el.closest('article,li,.card')?.querySelector('a[href]'))
        add('f-clamped', el, `line-clamp без розгортання «${el.textContent.trim().slice(0, 40)}»`);
    }
    else if (s.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0 && el.clientHeight < 200 && !el.closest('details,[data-c],[aria-expanded]') && !el.parentElement.querySelector('button'))
      add('f-clipped', el, `текст обрізаний по висоті (${el.scrollHeight}>${el.clientHeight}) «${el.textContent.trim().slice(0, 40)}»`);
  }
  // (g) тап-цілі
  if (touch) for (const it of ints) {
    const r = it.getBoundingClientRect();
    if (r.width === 0 || it.matches('input[type=checkbox],input[type=radio]') && it.closest('label')) continue;
    // посилання всередині тексту абзацу — виняток WCAG 2.5.8
    const p = it.parentElement;
    if (it.tagName === 'A' && p && /^(P|LI|SPAN|SMALL|TD|DD|FIGCAPTION|LABEL|EM|B|STRONG)$/.test(p.tagName) && p.textContent.trim().length > it.textContent.trim().length + 3) continue;
    if (it.matches('.rp-o')) continue; // обʼєкти генплану: тап поруч (≤24 px) відкриває найближчий — resort-plan.v1.js
    if (it.closest('.skip, .sch-menu, nav.crumbs, .crumbs, [aria-label*="крихт"], .bc, footer .sf-l')) continue;
    // прозора зона дотику ::before/::after (position:absolute з відʼємними inset) — рахуємо її розмір
    let tw = r.width, th = r.height;
    for (const pe of ['::before', '::after']) {
      const q = getComputedStyle(it, pe);
      if (q.content === 'none' || q.position !== 'absolute') continue;
      const px = v => (/px$/.test(v) ? parseFloat(v) : null);
      const L = px(q.left), R = px(q.right), T = px(q.top), B = px(q.bottom);
      // блок, від якого рахується inset: найближчий позиціонований предок (або сам елемент)
      let cb = it; while (cb && cb !== document.body && cs(cb).position === 'static') cb = cb.parentElement;
      const cr = (cb || it).getBoundingClientRect();
      const w2 = L != null && R != null ? cr.width - L - R : parseFloat(q.width) || 0, h2 = T != null && B != null ? cr.height - T - B : parseFloat(q.height) || 0;
      tw = Math.max(tw, w2); th = Math.max(th, h2);
    }
    if (th < 43.5 || tw < 43.5) {
      // розмір цілі з урахуванням ::before/::after не бачимо — дозволяємо, якщо в радіусі 24px немає інших цілей (spacing exception)
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const near = ints.some(o => o !== it && !o.contains(it) && !it.contains(o) && (() => { const q = o.getBoundingClientRect(); return q.width && Math.hypot(Math.max(q.left - cx, 0, cx - q.right), Math.max(q.top - cy, 0, cy - q.bottom)) < 22; })());
      if (near) add(Math.min(tw, th) < 32 || Math.max(tw, th) < 44 ? 'g-tap' : 'g-tap-minor', it, `тап-ціль ${Math.round(tw)}×${Math.round(th)} поруч з іншими «${(it.textContent || it.getAttribute('aria-label') || '').trim().slice(0, 30)}»`);
    }
  }
  // (h) фото: розтягнуті / сплющені
  for (const im of document.images) {
    if (!vis(im) || !im.complete || !im.naturalWidth || im.closest('.sch,footer')) continue;
    const src = im.currentSrc || im.src;
    if (/\.svg(\?|$)/.test(src) || src.startsWith('data:')) continue;
    const r = im.getBoundingClientRect(); if (r.width < 40 || r.height < 40) continue;
    const s = cs(im);
    // naturalWidth для srcset з w-дескрипторами — уже поділений на щільність; беремо справжню ширину файлу з дескриптора
    let nw = im.naturalWidth, nh = im.naturalHeight;
    const ss = (im.closest('picture')?.querySelector('source[srcset]')?.srcset || '') + ',' + (im.srcset || '');
    const cur = src.split('/').pop().split('?')[0];
    const m = ss.split(',').map(x => x.trim().split(/\s+/)).find(([u, d]) => u && u.split('/').pop().split('?')[0] === cur && /w$/.test(d || ''));
    if (m) { const fw = parseInt(m[1]); nh = Math.round(nh * fw / nw); nw = fw; }
    const fit = s.objectFit;
    let need;
    if (fit === 'cover') need = Math.max(r.width / nw, r.height / nh);
    else if (fit === 'contain' || fit === 'scale-down') need = Math.min(r.width / nw, r.height / nh);
    else need = r.width / nw;
    if (need * dpr > 1 / 0.95) add('h-upscaled', im, `фото ${nw}×${nh} у слоті ${Math.round(r.width)}×${Math.round(r.height)}@${dpr} — потрібно ≥${Math.round(nw * need * dpr)}w (${src.split('/').pop()})`);
    if ((fit === 'fill' || fit === '') && Math.abs(r.width / r.height - nw / nh) / (nw / nh) > 0.04) add('h-distorted', im, `фото сплющене: ${nw}×${nh} → ${Math.round(r.width)}×${Math.round(r.height)} без object-fit (${src.split('/').pop()})`);
  }
  // кандидати на контраст: текст поверх фото (img або background-image під центром тексту)
  const cand = [];
  const done = new Set();
  for (const t of texts) {
    if (done.has(t.el) || cand.length > 40 || fx(t.el)) continue;
    const r = t.r; if (r.top + scrollY > document.documentElement.scrollHeight) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy < 0 || cy > innerHeight || cx < 0 || cx > W) continue;
    const under = document.elementsFromPoint(cx, cy);
    const ph = under.find(e => e.tagName === 'IMG' || e.tagName === 'VIDEO' || e.tagName === 'PICTURE' || cs(e).backgroundImage.includes('url('));
    if (!ph || ph.contains(t.el) && ph.tagName !== 'IMG' && !cs(ph).backgroundImage.includes('url(')) continue;
    done.add(t.el);
    const i = cand.length; t.el.dataset.auC = i;
    const s = cs(t.el);
    cand.push({ i, sel: path(t.el), text: t.n.nodeValue.trim().slice(0, 40), color: s.color, size: parseFloat(s.fontSize), bold: +s.fontWeight >= 700, r: { x: r.left, y: r.top, w: r.width, h: r.height } });
  }
  out.push({ cls: '_contrast', cand });
  return out;
}

// контраст: ховаємо текст, знімаємо фон під ним, рахуємо в сторінці через canvas
async function contrast(page, cand) {
  const res = [];
  if (!cand.length) return res;
  // фіксовані шари (шапка, пігулка) не є фоном тексту — ховаємо на час знімків
  await page.addStyleTag({ content: '.mbar,.sch,header.sch{visibility:hidden!important}' }).then(h => h.evaluate(e => e.id = 'au-hide'));
  for (const c of cand) {
    if (c.r.w < 4 || c.r.h < 4) continue;
    const clip = { x: Math.max(0, c.r.x), y: Math.max(0, c.r.y), width: Math.min(c.r.w, 1200), height: Math.min(c.r.h, 300) };
    const restore = await page.evaluate(i => { const e = document.querySelector(`[data-au-c="${i}"]`); if (!e) return false; e.dataset.auOld = e.getAttribute('style') || ''; e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); e.style.setProperty('-webkit-text-fill-color', 'transparent', 'important'); return true; }, c.i);
    if (!restore) continue;
    let buf;
    try { buf = await page.screenshot({ clip, animations: 'disabled', caret: 'hide', scale: 'css' }); } catch { buf = null; }
    await page.evaluate(i => { const e = document.querySelector(`[data-au-c="${i}"]`); e.setAttribute('style', e.dataset.auOld); if (!e.dataset.auOld) e.removeAttribute('style'); }, c.i);
    if (!buf) continue;
    const stat = await page.evaluate(async ({ b64, color }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = new OffscreenCanvas(img.width, img.height), x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data;
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const m = color.match(/[\d.]+/g).map(Number); const Lt = L(m[0], m[1], m[2]);
      const ls = []; for (let i = 0; i < d.length; i += 16) ls.push(L(d[i], d[i + 1], d[i + 2]));
      ls.sort((a, b) => a - b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      // найгірші 10% пікселів фону під текстом
      const light = Lt > 0.4;
      const worst = light ? ls[Math.floor(ls.length * 0.9)] : ls[Math.floor(ls.length * 0.1)];
      const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
      return { worst: ratio(Lt, worst), mean: ratio(Lt, mean) };
    }, { b64: buf.toString('base64'), color: c.color });
    const large = c.size >= 24 || c.size >= 18.66 && c.bold;
    const need = large ? 3 : 4.5;
    if (stat.worst < need) res.push({ cls: 'c-contrast', sel: c.sel, msg: `контраст «${c.text}» ${stat.worst.toFixed(2)} (середній ${stat.mean.toFixed(2)}) < ${need} на фото`, rect: { x: Math.round(c.r.x), y: Math.round(c.r.y), w: Math.round(c.r.w), h: Math.round(c.r.h) } });
  }
  await page.evaluate(() => document.getElementById('au-hide')?.remove());
  return res;
}

// ===== прогін =====
const browser = await chromium.launch();
const findings = [];
const IGNORE_CONSOLE = /net::ERR_FAILED|ERR_BLOCKED|Failed to load resource|ERR_ABORTED|status of 404/;
async function run(path, w) {
  const dpr = DPR[w] || 1, touch = w < 1024;
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 874 : w < 1100 ? 1024 : Math.round(w * 0.5625) }, deviceScaleFactor: dpr, isMobile: w < 600, hasTouch: touch, reducedMotion: 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('JS: ' + e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !IGNORE_CONSOLE.test(t)) errs.push('console: ' + t.slice(0, 200)); });
  const rec = [];
  try {
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(400);
    // прокрутка донизу й назад: lazy-фото й скрипти після першої прокрутки
    await page.evaluate(async () => { const H = () => document.documentElement.scrollHeight; for (let y = 0; y < H(); y += innerHeight * 0.8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } scrollTo(0, 0); });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const top = await page.evaluate(analyze, { touch, phase: 'top0' });
    const ci = top.findIndex(f => f.cls === '_contrast');
    const cand = ci >= 0 ? top.splice(ci, 1)[0].cand : [];
    rec.push(...top, ...await contrast(page, cand));
    // контраст і перекриття — ще на середині сторінки (плитки з фото)
    for (const frac of [0.33, 0.66]) {
      await page.evaluate(f => scrollTo(0, document.documentElement.scrollHeight * f), frac); await page.waitForTimeout(250);
      const mid = await page.evaluate(analyze, { touch, phase: 'top' });
      const k = mid.findIndex(f => f.cls === '_contrast');
      rec.push(...await contrast(page, k >= 0 ? mid[k].cand : []));
      rec.push(...mid.filter(f => /^b-/.test(f.cls)));
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(400);
    rec.push(...(await page.evaluate(analyze, { touch, phase: 'bottom' })).filter(f => f.cls.startsWith('d-')));
  } catch (e) { errs.push('load: ' + String(e.message || e).split('\n')[0]); }
  for (const e of new Set(errs)) rec.push({ cls: 'js-error', sel: '', msg: e });
  // дедуп у межах сторінки
  const uniq = []; const k = new Set();
  for (const f of rec) { const key = f.cls + f.sel + f.msg.replace(/\d+/g, '#'); if (!k.has(key)) { k.add(key); uniq.push({ page: path, w, ...f }); } }
  if (OUT && uniq.length) {
    const shotFor = uniq.filter(f => f.rect && f.cls !== 'g-tap').slice(0, 3);
    for (const [i, f] of shotFor.entries()) {
      try {
        const H = await page.evaluate(() => document.documentElement.scrollHeight);
        const y = Math.max(0, Math.min(f.rect.y - 120, H - 600));
        await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(150);
        const sy = await page.evaluate(() => scrollY);
        await page.evaluate(({ r, sy }) => { const d = document.createElement('div'); d.id = 'au-mark'; d.style.cssText = `position:absolute;z-index:2147483647;pointer-events:none;outline:3px solid #f0f;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`; document.body.append(d); }, { r: f.rect, sy });
        const name = `AU-${path.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home'}-${w}-${f.cls}-${i}.jpg`;
        await page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 50, scale: 'css' });
        await page.evaluate(() => document.getElementById('au-mark')?.remove());
        f.shot = name;
      } catch {}
    }
  }
  await ctx.close();
  return uniq;
}
const jobs = []; for (const p of PAGES) for (const w of WIDTHS) jobs.push([p, w]);
let done = 0;
const N = +arg('--par', 3);
await Promise.all(Array.from({ length: N }, async () => { for (let j; (j = jobs.shift());) { const r = await run(...j); findings.push(...r); done++; if (process.stdout.isTTY || FULL) process.stdout.write(`\r${done} сторінко-ширин, знахідок ${findings.length}   `); } }));
await browser.close(); server.close();
const by = {};
for (const f of findings) by[f.cls] = (by[f.cls] || 0) + 1;
if (OUT) writeFileSync(join(OUT, 'findings.json'), JSON.stringify(findings, null, 1));
console.log(`\nВерстка: ${PAGES.length} сторінок × ${WIDTHS.join('/')} — ` + (Object.entries(by).map(([k, v]) => `${k}: ${v}`).join(', ') || 'чисто'));
// у швидкому режимі (тест) — помилкою вважаємо лише класи, які мають бути нулем завжди
const HARD = /^(a-narrow|b-text-overlap|b-text-over-control|d-fixed-cover|e-hscroll|f-clipped|g-tap|h-distorted|js-error)$/;
const hard = findings.filter(f => HARD.test(f.cls));
for (const f of (FULL ? [] : hard).slice(0, 40)) console.log(`  ✗ ${f.page} @${f.w} ${f.cls}: ${f.msg} [${f.sel}]`);
process.exit(!FULL && hard.length ? 1 : 0);
