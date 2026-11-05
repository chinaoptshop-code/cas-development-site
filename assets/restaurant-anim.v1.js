/* «Ресторан з нуля» (tools/site/restaurant.py): ізометрична SVG-сцена ресторану в розрізі, 14 етапів за прокруткою —
   замір, коробка ряд за рядом, вітрини, вентиляція, каналізація з жироуловлювачами, електрика кухні (рентген), підлога, зал, бар,
   відкрита кухня, меблі, тераса, світло день → вечір, гості. Вантажить site-chrome.v1.js після першої прокрутки (section.bz[data-js]).
   Тексти етапів — з DOM (ol.bz-st), підписи — script.rs-ui. CLS 0: сцена будується, коли блок поза кадром; reduced-motion —
   статичні кадри з кнопками; клавіатура ←/→. */
(function () {
  'use strict';
  var W = window, d = document, sec = d.querySelector('section.rs[data-rs]');
  if (!sec || sec.__rs) return; sec.__rs = 1;
  var drive = null, RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ui = {}; try { ui = JSON.parse(sec.querySelector('script.rs-ui').textContent); } catch (e) { return; }
  var ST = [].map.call(sec.querySelectorAll('ol.bz-st > li'), function (li) { var b = li.querySelector('b'), s = li.querySelector('span'); return [b ? b.textContent : li.textContent, s ? s.textContent : '']; });
  var N = ST.length || 14, AR = [150, 300, 500], STY = ['modern', 'loft', 'classic'];
  var cfg = { a: 300, s: 0, xr: [0, 0, 0] }, prog = 0, shown = -1, svg, els = [], nodes = [], ptr = 0, vb = null, vbT = null, raf = 0, run, cap, cnt, live, night, FULL;
  var FLOOR = 6, CEIL = 7, DUSK = 12;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function cl(ev, v) { try { if (W.clarity) { W.clarity('event', ev); if (v) W.clarity('set', ev, v); } } catch (e) { } }

  /* ── геометрія: ізометрія, метри ── */
  var K = 10, Wd, Dp, H = 4.2, TD = 4.6;
  function P(x, y, z) { return [((x - y) * 0.8660254 * K).toFixed(1), (((x + y) * 0.5 - (z || 0)) * K).toFixed(1)]; }
  function pts(a) { var o = []; for (var i = 0; i < a.length; i += 3) o.push(P(a[i], a[i + 1], a[i + 2]).join(',')); return o.join(' '); }
  function pth(a) { return 'M' + pts(a).split(' ').join(' L'); }
  var L;
  // елемент: шар, розмітка, ключ появи (етап + частка), ключ зникнення, рентген-шар (0 вентиляція, 1 каналізація, 2 електрика), глибина для сортування
  function add(layer, html, s, o, until, ux, dp) { L[layer].push({ h: html, k: s < 0 ? -1 : s + Math.min(o, 0.999), u: until, x: ux, d: dp || 0 }); }
  function poly(c, a) { return '<polygon class="' + c + '" points="' + pts(a) + '"/>'; }
  function line(c, a) { return '<polyline class="' + c + '" points="' + pts(a) + '"/>'; }
  function rect(x0, x1, y0, y1, z) { z = z || 0; return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]; }
  function circ(c, x, y, z, r) { var q = P(x, y, z); return '<ellipse class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" rx="' + (r * K * 1.22).toFixed(1) + '" ry="' + (r * K * 0.7).toFixed(1) + '"/>'; }
  function dot(c, x, y, z, r) { var q = P(x, y, z); return '<circle class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + r + '"/>'; }
  function box(c, x0, x1, y0, y1, z0, z1) { return poly(c + ' t', rect(x0, x1, y0, y1, z1)) + poly(c + ' r', [x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1]) + poly(c + ' l', [x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1]); }
  function wx(c, x, y0, y1, z0, z1) { return poly(c, [x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1]); }
  function wy(c, y, x0, x1, z0, z1) { return poly(c, [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]); }
  function flow(c, a, n, dur) { // частинки вздовж траси (повітря, вода, струм)
    var p = pth(a), o = '';
    for (var i = 0; i < n; i++) o += '<circle r="2.2" class="' + c + '"><animateMotion dur="' + dur + 's" begin="' + (i * dur / n).toFixed(2) + 's" repeatCount="indefinite" path="' + p + '"/></circle>';
    return RM ? '' : '<g>' + o + '</g>';
  }
  function person(c, x, y, z) { // гість: тулуб і голова
    var a = P(x, y, z), b = P(x, y, z + 1.0), h = P(x, y, z + 1.32);
    return '<g class="rs-man ' + c + '"><line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/><circle cx="' + h[0] + '" cy="' + h[1] + '" r="2.6"/></g>';
  }

  function build() {
    var A = cfg.a; Wd = Math.sqrt(A * 1.5); Dp = A / Wd;
    L = { ground: [], slab: [], under: [], floor: [], back: [], fin: [], duct: [], furn: [], front: [], terr: [], ppl: [], sky: [], glow: [] };
    var i, j, t, n, x, y;
    var kx0 = Wd * 0.56, kx1 = Wd - 0.15, ky1 = Dp * 0.4; // кухня: задній правий кут
    var bx = 1.7, by0 = Dp * 0.14, by1 = Dp * 0.5;        // бар: уздовж лівої задньої стіни
    var door = [Wd * 0.14, Wd * 0.14 + 1.8];
    add('ground', '<rect class="rs-day" x="-9999" y="-9999" width="19999" height="19999"/>', -1, 0);
    add('ground', poly('rs-ground', rect(-3, Wd + 4, -3, Dp + TD + 2.5, 0)), -1, 0);
    add('ground', poly('rs-walk', rect(-3, Wd + 4, Dp + TD + 0.3, Dp + TD + 2.5, 0.01)), -1, 0);
    // 0 замір і 3D-скан: контур, зони, сканер з променями
    add('sky', poly('rs-plan', rect(0, Wd, 0, Dp, 0.05)), 0, 0.1, 2);
    add('sky', poly('rs-plan', rect(kx0, kx1, 0.15, ky1, 0.05)) + poly('rs-plan', rect(0.4, bx + 0.8, by0, by1, 0.05)), 0, 0.45, 2);
    var cx = Wd * 0.45, cy = Dp * 0.55, rays = '';
    for (i = 0; i < 14; i++) { var an = i / 14 * 6.283, rx = cx + Math.cos(an) * Wd, ry = cy + Math.sin(an) * Dp; rx = Math.max(0, Math.min(Wd, rx)); ry = Math.max(0, Math.min(Dp, ry)); rays += '<polyline class="rs-ray" style="animation-delay:' + (i * 0.12).toFixed(2) + 's" points="' + pts([cx, cy, 1.5, rx, ry, 1.2 + (i % 3)]) + '"/>'; }
    add('sky', '<g>' + rays + '</g>' + line('rs-tri', [cx - 0.4, cy, 0, cx, cy, 1.5, cx + 0.4, cy, 0]) + dot('rs-scan', cx, cy, 1.55, 4), 0, 0.2, 1.2);
    // 1 коробка: плита, колони, стіни ряд за рядом (пил з-під кельми)
    add('slab', box('rs-slab', 0, Wd, 0, Dp, -0.3, 0), 1, 0.02);
    add('slab', poly('rs-conc', rect(0, Wd, 0, Dp, 0)), 1, 0.03); // фактура бетону — ненавʼязливо
    var cols = []; for (x = 6; x < Wd - 2; x += 6) for (y = 6; y < Dp - 2; y += 6) cols.push([x, y]);
    cols.forEach(function (c, k) { add('furn', box('rs-col', c[0] - 0.2, c[0] + 0.2, c[1] - 0.2, c[1] + 0.2, 0, H), 1, 0.1 + 0.2 * k / Math.max(1, cols.length), null, null, c[0] + c[1]); });
    var C = 7, ch = H / C;
    for (i = 0; i < C; i++) {
      var z0 = i * ch, z1 = z0 + ch, o = 0.15 + 0.75 * i / C;
      add('back', wx('rs-wall c' + (i % 2), 0, 0, Dp, z0, z1) + wy('rs-wall c' + (i % 2), 0, 0, Wd, z0, z1), 1, o);
      add('back', '<g class="rs-dust">' + dot('rs-pf', Wd * 0.3, 0, z1, 2) + dot('rs-pf', 0, Dp * 0.4, z1, 1.6) + dot('rs-pf', Wd * 0.7, 0, z1, 1.4) + '</g>', 1, o, 1 + (i + 1.5) / C);
    }
    add('back', wx('rs-conc w', 0.01, 0, Dp, 0, H) + wy('rs-conc w', 0.01, 0, Wd, 0, H), 1, 0.92);
    add('front', poly('rs-edge', rect(0, Wd, 0, Dp, H)), 1, 0.95);
    // 2 фасад: парапет, вітрини секціями, вхід, місце під вивіску
    add('front', wy('rs-par', Dp, 0, door[0], 0, 0.6) + wy('rs-par', Dp, door[1], Wd, 0, 0.6) + wx('rs-par r', Wd, 0, Dp, 0, 0.6), 2, 0.05);
    var gl = [];
    for (x = 0; x < Wd - 0.1; x += 2.5) { var x1 = Math.min(Wd, x + 2.5); if (x1 > door[0] && x < door[1]) { if (x < door[0]) gl.push(['y', x, door[0]]); if (x1 > door[1]) gl.push(['y', door[1], x1]); } else gl.push(['y', x, x1]); }
    for (y = Dp; y > 0.1; y -= 2.5) gl.push(['x', Math.max(0, y - 2.5), y]);
    gl.forEach(function (g, k) {
      var h = g[0] === 'y' ? wy('rs-glass', Dp, g[1], g[2], 0.6, H - 0.55) + line('rs-mul', [g[2], Dp, 0.6, g[2], Dp, H - 0.55]) : wx('rs-glass r', Wd, g[1], g[2], 0.6, H - 0.55) + line('rs-mul', [Wd, g[1], 0.6, Wd, g[1], H - 0.55]);
      add('front', h, 2, 0.15 + 0.6 * k / gl.length);
    });
    add('front', wy('rs-glass dr', Dp, door[0], door[1], 0, H - 0.55) + line('rs-mul', [(door[0] + door[1]) / 2, Dp, 0, (door[0] + door[1]) / 2, Dp, H - 0.55]), 2, 0.78);
    add('front', wy('rs-band', Dp, 0, Wd, H - 0.55, H) + wx('rs-band r', Wd, 0, Dp, H - 0.55, H), 2, 0.85);
    add('front', wy('rs-sign', Dp, Wd * 0.34, Wd * 0.66, H - 0.45, H - 0.1), 2, 0.92);
    // 3 вентиляція (рентген 0): витяжний зонт → шахта на дах → вентилятор; припливна мережа залу з дифузорами; потік повітря
    var hx0 = kx0 + 0.6, hx1 = kx1 - 0.6, hy = 0.9, sx = (hx0 + hx1) / 2;
    var duct = [[sx, hy, 3.4, sx, 0.5, 3.4], [sx, 0.5, 3.4, sx, 0.5, H + 1.1]];
    add('duct', box('rs-duct', sx - 0.35, sx + 0.35, 0.15, 0.85, 3.3, H + 1.1), 3, 0.15, null, 0, 1);
    add('duct', box('rs-fan', sx - 0.9, sx + 0.9, 0.1, 1.4, H + 0.6, H + 1.4), 3, 0.3, null, 0, 1);
    var sy = Dp * 0.68, segs = [];
    for (x = 0.8; x < Wd - 1.2; x += 1.6) segs.push(x);
    segs.forEach(function (x0, k) { add('duct', box('rs-duct s', x0, Math.min(Wd - 0.8, x0 + 1.6), sy - 0.3, sy + 0.3, 3.45, 3.85), 3, 0.35 + 0.4 * k / segs.length, null, 0, 2); });
    for (x = 2.4; x < Wd - 1.5; x += 3.2) add('duct', poly('rs-dif', rect(x - 0.3, x + 0.3, sy + 0.35, sy + 0.95, 3.6)) + line('rs-dif2', [x - 0.3, sy + 0.35, 3.6, x - 0.3, sy + 0.35, 3.85]), 3, 0.75 + x / Wd * 0.2, null, 0, 2);
    add('duct', box('rs-duct s', 0.2, 0.8, sy - 0.3, sy + 0.3, 3.45, H + 0.9), 3, 0.3, null, 0, 2);
    add('duct', flow('rs-air', [sx, 0.5, 3.6, sx, 0.5, H + 1.3], 3, 1.6) + flow('rs-air s', [0.5, sy, H + 0.8, 0.5, sy, 3.65, Wd - 1, sy, 3.65], 5, 4), 3, 0.6, null, 0, 3);
    // 4 каналізація й жироуловлювачі (рентген 1): трапи, мийки, ухили, уловлювач під кухнею й на виході, краплі
    var tx = kx0 + (kx1 - kx0) * 0.3, ty = ky1 + 0.9, out = Wd + 2.2;
    var pipe = [kx1 - 0.6, 0.6, 0.02, tx, 0.6, 0.02, tx, ty, 0.02, out, ty, 0.02];
    add('under', line('rs-sew', pipe), 4, 0.1, null, 1);
    add('under', line('rs-sew s', [bx - 0.6, by0 + 0.8, 0.02, bx - 0.6, ty + 1.4, 0.02, tx, ty + 1.4, 0.02, tx, ty, 0.02]), 4, 0.3, null, 1);
    for (i = 0; i < 3; i++) add('under', circ('rs-drain', kx0 + 1 + i * (kx1 - kx0 - 2) / 2, ky1 * 0.6, 0.03, 0.22), 4, 0.2 + i * 0.08, null, 1);
    add('under', box('rs-trap', tx - 0.5, tx + 0.5, ty - 0.4, ty + 0.4, 0, 0.55), 4, 0.5, null, 1);
    add('ground', box('rs-trap big', Wd + 1.1, Wd + 2.6, ty - 0.8, ty + 0.8, 0, 0.35) + circ('rs-hatch', Wd + 1.85, ty, 0.36, 0.4), 4, 0.7);
    add('under', flow('rs-drop', [kx1 - 0.6, 0.6, 0.05, tx, 0.6, 0.05, tx, ty, 0.05, out, ty, 0.05], 4, 3), 4, 0.6, null, 1);
    // 5 електрика кухні (рентген 2): щит, лотки під стелею, опуски до обладнання, лінії світла залу; іскри
    var pz = 1.2, py = Dp * 0.82;
    add('fin', box('rs-panel', 0, 0.2, py - 0.5, py + 0.5, pz, pz + 1.3), 5, 0.08, null, 2);
    add('duct', line('rs-tray', [0.1, py, 3.2, 0.1, 0.3, 3.2, kx1 - 0.3, 0.3, 3.2]), 5, 0.2, null, 2);
    for (i = 0; i < 5; i++) { x = kx0 + 0.5 + i * (kx1 - kx0 - 1) / 4; add('duct', line('rs-cab', [x, 0.3, 3.2, x, 0.3, 0.9]) + dot('rs-spark', x, 0.3, 0.9, 2.2), 5, 0.35 + i * 0.07, null, 2); }
    for (y = 2; y < Dp - 1; y += 3) add('duct', line('rs-cab l', [0.1, y, 3.3, Wd * 0.5, y, 3.3]), 5, 0.75 + y / Dp * 0.2, null, 2);
    add('duct', flow('rs-amp', [0.1, py, 3.2, 0.1, 0.3, 3.2, kx1 - 0.3, 0.3, 3.2], 3, 2.4), 5, 0.6, null, 2);
    // 6 підлога: кухня — плитка плитка за плиткою, зал — дошка смугами
    var tl = 1.2, tiles = [];
    for (x = kx0 - 0.6; x < kx1 - 0.05; x += tl) for (y = 0; y < ky1 + 0.6; y += tl) tiles.push([x, Math.min(kx1, x + tl), y, Math.min(ky1 + 0.6, y + tl)]);
    tiles.sort(function (a, b) { return (a[0] + a[2]) - (b[0] + b[2]); });
    tiles.forEach(function (q, k) { add('floor', poly('rs-tile t' + (((q[0] / tl) + (q[2] / tl)) & 1), rect(q[0], q[1], q[2], q[3], 0.04)), 6, 0.05 + 0.4 * k / tiles.length); });
    for (y = 0, n = 0; y < Dp - 0.01; y += 0.8, n++) {
      var y1 = Math.min(Dp, y + 0.8), xe = y < ky1 + 0.6 ? kx0 - 0.6 : Wd;
      add('floor', poly('rs-plank p' + (n % 3), rect(0, xe, y, y1, 0.04)), 6, 0.45 + 0.5 * y / Dp);
    }
    // 7 стіни й стеля залу: оздоблення панелями, рейкова стеля над залом
    for (x = 0; x < Wd - 0.01; x += 3) add('fin', wy('rs-fin', 0.02, x, Math.min(Wd, x + 3), 0, H), 7, 0.05 + 0.3 * x / Wd);
    for (y = 0; y < Dp - 0.01; y += 3) add('fin', wx('rs-fin l', 0.02, y, Math.min(Dp, y + 3), 0, H), 7, 0.05 + 0.3 * y / Dp);
    add('fin', wy('rs-mold', 0.03, 0, Wd, 0.9, 1.0) + wx('rs-mold', 0.03, 0, Dp, 0.9, 1.0), 7, 0.4);
    for (x = 1, n = 0; x < Wd - 1; x += 0.9, n++) add('front', line('rs-slat', [x, ky1 + 1, 3.95, x, Dp - 0.8, 3.95]), 7, 0.45 + 0.5 * x / Wd);
    // 8 бар: стійка, стільниця, полиці з пляшками одна за одною, стільці
    add('furn', box('rs-bar', bx, bx + 0.7, by0, by1, 0, 1.05) + box('rs-bartop', bx - 0.1, bx + 0.9, by0 - 0.1, by1 + 0.1, 1.05, 1.12), 8, 0.1, null, null, bx + by0);
    add('furn', box('rs-barb', 0.05, 0.65, by0, by1, 0, 0.9), 8, 0.05, null, null, 0.2 + by0);
    for (i = 0; i < 3; i++) add('fin', line('rs-shelf', [0.06, by0, 1.5 + i * 0.5, 0.06, by1, 1.5 + i * 0.5]), 8, 0.2 + i * 0.05);
    var bot = '', bn = 0;
    for (i = 0; i < 3; i++) for (y = by0 + 0.15; y < by1 - 0.1; y += 0.22) { var q0 = P(0.08, y, 1.52 + i * 0.5), q1 = P(0.08, y, 1.78 + i * 0.5); add('fin', '<line class="rs-btl b' + (bn % 4) + '" x1="' + q0[0] + '" y1="' + q0[1] + '" x2="' + q1[0] + '" y2="' + q1[1] + '"/>', 8, 0.3 + 0.4 * (bn++) / (3 * (by1 - by0) / 0.22)); }
    for (y = by0 + 0.4; y < by1 - 0.2; y += 0.75) add('furn', line('rs-leg', [bx + 1.3, y, 0, bx + 1.3, y, 0.75]) + circ('rs-stool', bx + 1.3, y, 0.78, 0.22), 8, 0.75 + 0.2 * (y - by0) / (by1 - by0), null, null, bx + 1.3 + y);
    // 9 відкрита кухня: лінія обладнання, острів, роздача, зонт; пара над плитами
    var eq = ['fr', 'st', 'st', 'ov', 'sk', 'fr'], ew = (kx1 - kx0 - 0.2) / eq.length;
    eq.forEach(function (e2, k) { var x0 = kx0 + 0.1 + k * ew, hz = e2 === 'fr' ? 2.1 : 0.9; add('furn', box('rs-eq ' + e2, x0 + 0.04, x0 + ew - 0.04, 0.1, 0.85, 0, hz), 9, 0.05 + 0.35 * k / eq.length, null, null, x0 + 0.5); });
    add('furn', box('rs-hood', hx0, hx1, 0.1, 1.3, 2.4, 2.85), 9, 0.45, null, null, sx + 0.6);
    add('furn', box('rs-isl', kx0 + 1, kx1 - 1, ky1 * 0.45, ky1 * 0.45 + 0.9, 0, 0.92), 9, 0.55, null, null, kx0 + ky1 * 0.45 + 1);
    add('furn', box('rs-pass', kx0 - 0.6, kx1, ky1, ky1 + 0.6, 0, 1.1) + line('rs-lamp', [kx0, ky1 + 0.3, 1.7, kx1 - 0.4, ky1 + 0.3, 1.7]), 9, 0.7, null, null, kx0 + ky1 + 0.3);
    var steam = ''; for (i = 1; i < 3; i++) { var sxx = kx0 + 0.1 + (i + 0.5) * ew; steam += dot('rs-steam', sxx, 0.5, 1.1, 3) + '<circle class="rs-steam d" cx="' + P(sxx, 0.5, 1.1)[0] + '" cy="' + P(sxx, 0.5, 1.1)[1] + '" r="2.4"/>'; }
    add('furn', '<g>' + steam + '</g>', 9, 0.4, null, null, 1);
    // 10 меблі залу: столи з двома-чотирма стільцями, банкетка вздовж стіни
    var tabs = [];
    for (x = bx + 3; x < Wd - 1.3; x += 2.7) for (y = 1.6; y < Dp - 1.4; y += 2.6) { if (x > kx0 - 1.6 && y < ky1 + 1.6) continue; if (Math.abs(y - sy) < 0.01) continue; tabs.push([x, y]); }
    tabs.forEach(function (q, k) {
      var x0 = q[0], y0 = q[1], o = 0.05 + 0.9 * k / tabs.length, dep = x0 + y0;
      add('furn', box('rs-chair', x0 - 0.25, x0 + 0.25, y0 - 1.0, y0 - 0.55, 0, 0.45) + box('rs-chb', x0 - 0.25, x0 + 0.25, y0 - 1.05, y0 - 0.95, 0.45, 0.95), 10, o, null, null, dep - 0.8);
      add('furn', line('rs-leg', [x0, y0, 0, x0, y0, 0.72]) + box('rs-tab', x0 - 0.45, x0 + 0.45, y0 - 0.45, y0 + 0.45, 0.72, 0.78), 10, o + 0.01, null, null, dep);
      add('furn', box('rs-chair', x0 - 0.25, x0 + 0.25, y0 + 0.55, y0 + 1.0, 0, 0.45) + box('rs-chb', x0 - 0.25, x0 + 0.25, y0 + 0.95, y0 + 1.05, 0.45, 0.95), 10, o + 0.02, null, null, dep + 0.8);
      add('front', line('rs-pend', [x0, y0, 3.95, x0, y0, 2.6]) + circ('rs-shade', x0, y0, 2.6, 0.3), 10, o + 0.03);
      add('glow', circ('rs-glow', x0, y0, 2.4, 1.3), DUSK, 0.2 + 0.6 * k / tabs.length);
      q.push(o);
    });
    // 11 тераса: настил дошка за дошкою, вазони, парасолі, столи
    var tx0 = 0.4, tx1 = Wd * 0.72, ty0 = Dp + 0.5, ty1 = Dp + TD;
    add('terr', box('rs-deckb', tx0, tx1, ty0, ty1, 0, 0.12), 11, 0.03);
    for (x = tx0, n = 0; x < tx1 - 0.05; x += 0.3, n++) add('terr', poly('rs-board b' + (n % 2), rect(x, Math.min(tx1, x + 0.27), ty0, ty1, 0.14)), 11, 0.05 + 0.4 * (x - tx0) / (tx1 - tx0));
    for (x = tx0 + 0.6; x < tx1; x += 2.2) add('terr', box('rs-pot', x - 0.3, x + 0.3, ty1 - 0.5, ty1 + 0.1, 0.12, 0.7) + circ('rs-bush', x, ty1 - 0.2, 1.05, 0.45), 11, 0.5 + 0.2 * x / tx1);
    var umb = []; for (x = tx0 + 1.8; x < tx1 - 1; x += 3.4) umb.push(x);
    umb.forEach(function (x0, k) {
      var y0 = (ty0 + ty1) / 2 - 0.3, o = 0.7 + 0.25 * k / umb.length;
      add('terr', box('rs-chair', x0 - 0.9, x0 - 0.5, y0 - 0.2, y0 + 0.2, 0.12, 0.55) + box('rs-chair', x0 + 0.5, x0 + 0.9, y0 - 0.2, y0 + 0.2, 0.12, 0.55) + box('rs-tab', x0 - 0.4, x0 + 0.4, y0 - 0.4, y0 + 0.4, 0.82, 0.88) + line('rs-pole', [x0, y0, 0.12, x0, y0, 2.5]), 11, o);
      add('terr', '<g class="rs-umb">' + poly('rs-can', [x0 - 1.4, y0, 2.3, x0, y0 - 1.4, 2.3, x0 + 1.4, y0, 2.3, x0, y0 + 1.4, 2.3]) + poly('rs-can2', [x0 - 1.4, y0, 2.3, x0, y0 + 1.4, 2.3, x0, y0, 2.75]) + '</g>', 11, o + 0.02);
    });
    // 12 світло день → вечір: ніч, гірлянда тераси, підсвітка бару, роздачі й вивіски
    add('sky', '<rect class="rs-night" x="-9999" y="-9999" width="19999" height="19999"/>', DUSK, 0.02);
    var gar = []; for (x = tx0; x <= tx1 + 0.01; x += (tx1 - tx0) / 10) gar.push(x, ty1, 2.6 - Math.sin((x - tx0) / (tx1 - tx0) * Math.PI) * 0.4);
    add('glow', line('rs-wire', gar) + gar.reduce(function (a, v, k) { return k % 3 ? a : a + dot('rs-bulb', gar[k], gar[k + 1], gar[k + 2], 2.2); }, ''), DUSK, 0.3);
    add('glow', circ('rs-glow bar', bx - 0.2, (by0 + by1) / 2, 1.8, 2.2) + circ('rs-glow', (kx0 + kx1) / 2, ky1, 1.6, 2), DUSK, 0.4);
    add('glow', wy('rs-signon', Dp, Wd * 0.34, Wd * 0.66, H - 0.45, H - 0.1), DUSK, 0.5);
    // 13 гості: за столами, біля бару; офіціант між роздачею й залом, гості заходять з вулиці
    tabs.forEach(function (q, k) { if (k % 3 === 2) return; add('ppl', person('g' + (k % 4), q[0], q[1] - 0.78, 0.25) + (k % 2 ? '' : person('g' + ((k + 1) % 4), q[0], q[1] + 0.78, 0.25)), 13, 0.05 + 0.6 * k / tabs.length); });
    for (y = by0 + 0.4; y < by1 - 0.2; y += 1.5) add('ppl', person('g2', bx + 1.3, y, 0.5), 13, 0.5);
    umb.forEach(function (x0, k) { add('ppl', person('g' + (k % 4), x0 - 0.7, (ty0 + ty1) / 2 - 0.3, 0.3), 13, 0.4 + k * 0.05); });
    if (tabs.length && !RM) {
      var t0 = tabs[Math.floor(tabs.length / 2)], w1 = P(kx0 - 0.3, ky1 + 1, 0), w2 = P(t0[0], t0[1] - 1.4, 0), g1 = P((door[0] + door[1]) / 2, Dp + TD + 1, 0), g2 = P((door[0] + door[1]) / 2, Dp - 1, 0);
      add('ppl', '<g class="rs-walker">' + person('w', 0, 0, 0).replace('<g class="rs-man w">', '<g class="rs-man w"><animateMotion dur="7s" repeatCount="indefinite" keyPoints="0;1;1;0;0" keyTimes="0;.4;.5;.9;1" calcMode="linear" path="M' + w1.join(',') + ' L' + w2.join(',') + '"/>') + '</g>', 13, 0.6);
      add('ppl', '<g class="rs-walker">' + person('g1', 0, 0, 0).replace('<g class="rs-man g1">', '<g class="rs-man g1"><animateMotion dur="9s" repeatCount="indefinite" path="M' + g1.join(',') + ' L' + g2.join(',') + '"/>') + '</g>', 13, 0.7);
    }
    // збірка: шари в порядку малювання; меблі — за глибиною (x + y); ключі появи — у відсортованому списку
    L.furn.sort(function (a, b) { return a.d - b.d; });
    var order = ['ground', 'slab', 'under', 'floor', 'back', 'fin', 'duct', 'furn', 'front', 'terr', 'ppl', 'sky', 'glow'], html = '', id = 0;
    els = [];
    order.forEach(function (ly) { L[ly].forEach(function (o) { o.id = id++; html += '<g class="rs-e' + (o.k < 0 ? ' on' : '') + (o.x != null ? ' ux ux' + o.x : '') + '">' + o.h + '</g>'; if (o.k >= 0) els.push(o); }); });
    els.sort(function (a, b) { return a.k - b.k; });
    var c = [P(0, 0, H + 1.6), P(Wd + 2.6, 0, 0), P(0, Dp + TD, 0), P(Wd, Dp + TD, 0), P(Wd + 2.6, Dp, 0)], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    FULL = [Math.min.apply(0, xs) - 16, Math.min.apply(0, ys) - 16, Math.max.apply(0, xs) - Math.min.apply(0, xs) + 32, Math.max.apply(0, ys) - Math.min.apply(0, ys) + 32];
    FOC = [0, 0, [0, Dp * 0.6, Wd, Dp + 1, 0, H], [0, 0, Wd, Dp, 3, H + 1.4], [kx0 - 2.5, 0, Wd + 2.8, ky1 + 2.2, 0, 1.6], [0, 0, Wd, Dp, 0.8, 3.4], 0, 0,
      [0, by0 - 1, bx + 2, by1 + 1, 0, 2.6], [kx0 - 1.2, 0, Wd, ky1 + 0.9, 0, H], 0, [tx0 - 0.5, Dp - 0.5, tx1 + 0.5, ty1 + 0.5, 0, 2.8], 0, 0];
    svg.innerHTML = '<defs><linearGradient id="rs-gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6f2" stop-opacity=".34"/><stop offset="1" stop-color="#9cc3d6" stop-opacity=".16"/></linearGradient>'
      + '<radialGradient id="rs-gw"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>'
      + '<pattern id="rs-cc" width="9" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".5" fill="#fff" fill-opacity=".1"/><circle cx="6" cy="4.5" r=".6" fill="#000" fill-opacity=".14"/><circle cx="3.5" cy="5.5" r=".35" fill="#fff" fill-opacity=".08"/></pattern>'
      + '<linearGradient id="rs-wsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>'
      + '<pattern id="rs-brick" width="12" height="8" patternUnits="userSpaceOnUse"><rect width="12" height="8" fill="#8a4a32"/><path d="M0 4h12M6 0v4M0 4v4M12 4v4" stroke="#5e3020" stroke-width=".8"/></pattern></defs>' + html;
    nodes = [].slice.call(svg.querySelectorAll('g.rs-e'));
    night = svg.querySelector('.rs-night');
    ptr = 0; shown = -1; vb = null;
    els.forEach(function (o) { o.n = nodes[o.id]; });
    apply(true);
  }
  var FOC = [];
  function target(i) { // кадр під фактичні пропорції сцени (402 — майже квадрат, 1440 — 2:1): обʼєкт етапу — по центру й цілий
    var f = FOC[i]; if (!f) return FULL;
    var c = [P(f[0], f[1], f[5]), P(f[2], f[1], f[4]), P(f[0], f[3], f[4]), P(f[2], f[3], f[4]), P(f[2], f[1], f[5]), P(f[0], f[3], f[5])], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    var ar = svg && svg.clientWidth && svg.clientHeight ? svg.clientWidth / svg.clientHeight : FULL[2] / FULL[3];
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys), pd = Math.max(x1 - x0, y1 - y0) * 0.07 + 10;
    var w = x1 - x0 + pd * 2, h = y1 - y0 + pd * 2, fw = Math.max(FULL[2], FULL[3] * ar), fh = fw / ar;
    if (w / h < ar) w = h * ar; else h = w / ar;
    if (w > fw) { w = fw; h = fh; }
    return [(x0 + x1 - w) / 2, (y0 + y1 - h) / 2, w, h];
  }
  function apply(force) {
    var p = prog;
    while (ptr < els.length && els[ptr].k <= p) { els[ptr].n.classList.add('on'); ptr++; }
    while (ptr > 0 && els[ptr - 1].k > p) { ptr--; els[ptr].n.classList.remove('on'); }
    els.forEach(function (o) { if (o.u != null) o.n.classList.toggle('gone', p >= o.u); });
    svg.classList.toggle('rs-under', p >= FLOOR + 0.5);
    svg.classList.toggle('rs-ceil', p >= CEIL + 0.5);
    svg.classList.toggle('rs-dusk', p >= DUSK + 0.3);
    if (night) night.style.opacity = p < DUSK ? 0 : (Math.min(1, (p - DUSK) / 0.7) * 0.55).toFixed(2); // плавно: день → вечір за прокруткою
    var i = Math.min(N - 1, Math.floor(p));
    if (i !== shown || force) {
      shown = i;
      cap.innerHTML = '<b>' + esc(ST[i][0]) + '</b><span>' + esc(ST[i][1]) + '</span>';
      cnt.textContent = (i + 1) + ' ' + ui.of + ' ' + N;
      live.textContent = (i + 1) + '/' + N + ': ' + ST[i][0];
      vbT = target(i);
      if (i === N - 1) cl('rs_end');
    }
    if (!vb || RM || force) vb = vbT.slice();
    if (!raf) tick();
  }
  function tick() {
    raf = 0;
    var dn = 0;
    for (var j = 0; j < 4; j++) { var dv = vbT[j] - vb[j]; if (Math.abs(dv) > 0.5) { vb[j] += dv * 0.12; dn = 1; } else vb[j] = vbT[j]; }
    svg.setAttribute('viewBox', vb.map(function (v) { return v.toFixed(1); }).join(' '));
    if (dn && !RM) raf = W.requestAnimationFrame(tick);
  }
  function raw() { // прогрес за прокруткою, етапи (згладжування, ліміт швидкості й «один етап за клацання» — casDrive у site-chrome.v1.js)
    if (!run) return null;
    var r = run.getBoundingClientRect(), span = r.height - W.innerHeight;
    return span > 0 ? Math.max(0, Math.min(1, -r.top / span)) * N : 0;
  }
  function go(i) {
    i = Math.max(0, Math.min(N - 1, i));
    if (RM || !run) { prog = i + 0.999; apply(); return; }
    if (drive) drive.reset();
    var r = run.getBoundingClientRect(), span = r.height - W.innerHeight;
    W.scrollTo({ top: W.pageYOffset + r.top + span * (i + 0.6) / N, behavior: 'smooth' });
  }
  function seg(name, items, cur, fn) {
    var g = el('div', 'la-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', name);
    g.appendChild(el('span', 'la-lab', esc(name)));
    items.forEach(function (t, i) {
      var b = el('button', '', esc(t)); b.type = 'button'; b.setAttribute('aria-pressed', i === cur ? 'true' : 'false');
      b.addEventListener('click', function () { [].forEach.call(g.querySelectorAll('button'), function (x, j) { x.setAttribute('aria-pressed', j === i ? 'true' : 'false'); }); fn(i); });
      g.appendChild(b);
    });
    return g;
  }
  function money(v) { return window.casNum(v); } // формат мови — site-chrome.v1.js
  function est() { return ui.est.replace('{n}', cfg.a).replace('{v}', money(Math.max(2500, cfg.a * 30))); }
  function enhance() {
    var list = sec.querySelector('ol.bz-st'), box0 = el('div', 'la-box'), ctr = el('div', 'la-ctl');
    ctr.appendChild(seg(ui.area, AR.map(function (n) { return n + ' ' + ui.unit; }), 1, function (i) { cfg.a = AR[i]; build(); estEl.textContent = est(); cl('rs_area', cfg.a); }));
    ctr.appendChild(seg(ui.style, ui.styles, 0, function (i) { cfg.s = i; svg.setAttribute('class', svg.getAttribute('class').replace(/\bst\d\b/, 'st' + i)); cl('rs_style', STY[i]); }));
    var xr = el('div', 'la-seg la-xr'); xr.setAttribute('role', 'group'); xr.setAttribute('aria-label', ui.xray); xr.appendChild(el('span', 'la-lab', esc(ui.xray)));
    ui.xr.forEach(function (t, i) {
      var b = el('button', 'x' + i, esc(t)); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { cfg.xr[i] = cfg.xr[i] ? 0 : 1; b.setAttribute('aria-pressed', cfg.xr[i] ? 'true' : 'false'); svg.classList.toggle('xr' + i, !!cfg.xr[i]); cl('rs_xray', i); });
      xr.appendChild(b);
    });
    ctr.appendChild(xr);
    var stick = el('div', 'la-stick');
    svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'la-svg rs-svg st0'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', sec.querySelector('h2').textContent);
    var nav = el('div', 'la-nav'), pb = el('button', 'la-prev', '‹') /* RTL: Unicode сам віддзеркалює ‹ › (Bidi_Mirrored), тож символи ті самі, що в LTR */, nb = el('button', 'la-next', '›');
    pb.type = nb.type = 'button'; pb.setAttribute('aria-label', ui.prev); nb.setAttribute('aria-label', ui.next);
    pb.addEventListener('click', function () { go(shown - 1); }); nb.addEventListener('click', function () { go(shown + 1); });
    cnt = el('span', 'la-cnt'); cap = el('p', 'la-cap'); live = el('span', 'la-live'); live.setAttribute('aria-live', 'polite');
    nav.appendChild(pb); nav.appendChild(cnt); nav.appendChild(nb);
    stick.appendChild(svg); stick.appendChild(cap); stick.appendChild(nav); stick.appendChild(live);
    var estEl = el('p', 'la-est'); estEl.textContent = est();
    var cta = el('a', 'btn main la-cta', esc(ui.calc)); cta.href = '#zayavka';
    cta.addEventListener('click', function () {
      var f = d.getElementById('of'), m = d.getElementById('oMsg'), msg = ui.msg.replace('{n}', cfg.a).replace('{s}', ui.styles[cfg.s]);
      if (f) f.setAttribute('data-service', ui.svc);
      if (m) { m.value = msg; var det = m.closest('details'); if (det) det.open = true; }
      setTimeout(function () { var ph = d.getElementById('oPhone'); if (ph) ph.focus({ preventScroll: true }); }, 500);
      cl('rs_cta', cfg.a + '/' + STY[cfg.s]);
    });
    var foot = el('div', 'la-foot'); foot.appendChild(estEl); foot.appendChild(cta); stick.appendChild(foot);
    var CMP = !RM && !!d.querySelector('.hx-home'); // головні: компактна сцена в межах екрана — без sticky-доріжки, етапи крокує casAuto і ←/→ (Михайло 05.11.2026)
    if (RM || CMP) { box0.appendChild(ctr); box0.appendChild(stick); if (CMP) sec.classList.add('la-cmp'); }
    else { run = el('div', 'la-run'); run.style.height = 'calc(100vh + ' + N + ' * clamp(400px, 50vh, 560px))'; box0.appendChild(ctr); run.appendChild(stick); box0.appendChild(run); }
    list.parentNode.insertBefore(box0, list);
    list.classList.add('la-sr');
    sec.classList.add('la-on');
    svg.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(shown + 1); if (e.key === 'ArrowLeft') go(shown - 1); });
    svg.setAttribute('tabindex', '0');
    prog = RM ? N - 0.001 : CMP ? 0.999 : 0;
    build();
    W.addEventListener('resize', function () { if (shown >= 0) { vbT = target(shown); if (RM) vb = vbT.slice(); if (!raf) tick(); } });
    if (!RM && !CMP && W.casDrive) {
      drive = W.casDrive({ n: N, min: 0, raw: raw, view: run, render: function (c) { prog = c; apply(); } });
      drive.kick();
      if (W.casAuto) W.casAuto({ root: box0, view: svg, host: nav, step: drive.step, restart: drive.restart, atEnd: drive.atEnd });
    }
    if (CMP && W.casAuto) W.casAuto({ root: box0, view: svg, host: nav, step: function () { if (shown >= N - 1) return false; go(shown + 1); return true; },
      restart: function () { go(0); }, atEnd: function () { return shown >= N - 1; } });
  }
  function css() {
    return new Promise(function (res) {
      var href = sec.getAttribute('data-css'); if (!href || d.querySelector('link[href="' + href + '"]')) return res();
      var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = function () { res(); }; d.head.appendChild(l);
    });
  }
  // блок вище екрана (швидка прокрутка, reduced-motion — він стискається): тримаємо видимий вміст на місці самі,
  // якщо скрол-якоріння браузера не спрацює (низ сторінки, Safari без overflow-anchor), інакше CLS до 1.0
  function keep() { var b0 = sec.getBoundingClientRect().bottom, up = b0 <= 0; enhance(); if (up) { var dy = sec.getBoundingClientRect().bottom - b0; if (Math.abs(dy) > 1) { var hs = d.documentElement.style; hs.scrollBehavior = 'auto'; W.scrollBy(0, dy); hs.scrollBehavior = ''; } } } // без smooth з CSS — інакше зсув видно
  function inView() { var r = sec.getBoundingClientRect(); return r.top < 0 && r.bottom > 0; } // людина всередині блоку; верх блоку в кадрі — збираємо одразу (зсуву над ним немає)
  css().then(function () {
    if (!inView() || sec.hasAttribute('data-sw') || !('IntersectionObserver' in W)) return keep(); // data-sw — показана перемикачем сцен на місці: одразу
    var o = new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) { o.disconnect(); keep(); } });
    o.observe(sec);
  });
})();
