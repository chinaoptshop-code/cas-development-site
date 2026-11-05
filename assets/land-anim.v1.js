/* «Ландшафт з нуля» (tools/site/landanim.py): ізометрична SVG-сцена облаштування ділянки, 16 етапів за прокруткою.
   Вантажить site-chrome.v1.js після першої прокрутки (section.bz[data-js]). Тексти етапів — з DOM (ol.bz-st), підписи — script.la-ui.
   CLS 0: сцена будується лише коли блок поза кадром; reduced-motion — статичні кадри з кнопками; клавіатура: ←/→, кнопки з aria. */
(function () {
  'use strict';
  var W = window, d = document, sec = d.querySelector('section.la[data-la]');
  if (!sec || sec.__la) return; sec.__la = 1;
  var drive = null, RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ui = {}; try { ui = JSON.parse(sec.querySelector('script.la-ui').textContent); } catch (e) { return; }
  var ST = [].map.call(sec.querySelectorAll('ol.bz-st > li'), function (li) { var b = li.querySelector('b'), s = li.querySelector('span'); return [b ? b.textContent : li.textContent, s ? s.textContent : '']; });
  var N = ST.length || 16, SOT = [6, 10, 15, 25], STY = ['modern', 'natural', 'regular'];
  var cfg = { n: 10, s: 0, xr: [0, 0, 0] }, prog = 0, shown = -1, svg, els = [], ptr = 0, vb = null, vbT = null, raf = 0, run, stick, cap, cnt, live;
  var LAWN = 10; // етап газону: підземні шари ховаються, якщо не ввімкнено рентген
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function cl(ev, v) { try { if (W.clarity) { W.clarity('event', ev); if (v) W.clarity('set', ev, v); } } catch (e) { } }

  /* ── геометрія: ізометрія, метри ── */
  var K = 10, Wd, Dp;
  function P(x, y, z) { return [((x - y) * 0.8660254 * K).toFixed(1), (((x + y) * 0.5 - (z || 0)) * K).toFixed(1)]; }
  function pts(a) { var o = []; for (var i = 0; i < a.length; i += 3) o.push(P(a[i], a[i + 1], a[i + 2]).join(',')); return o.join(' '); }
  var buf, L = { ground: [], under: [], lawn: [], edge: [], hard: [], bed: [], plant: [], top: [], sky: [] };
  // елемент: шар, розмітка, ключ появи (етап + частка), ключ зникнення (необовʼязково), підземний шар (0 дренаж, 1 полив, 2 кабелі)
  function add(layer, html, s, o, until, ux) { L[layer].push({ h: html, k: s + Math.min(o, 0.999), u: until, x: ux }); }
  function poly(c, a) { return '<polygon class="' + c + '" points="' + pts(a) + '"/>'; }
  function line(c, a) { return '<polyline class="' + c + '" points="' + pts(a) + '"/>'; }
  function rect(x0, x1, y0, y1, z) { z = z || 0; return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]; }
  function circ(c, x, y, z, r) { var q = P(x, y, z); return '<ellipse class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" rx="' + (r * K * 1.22).toFixed(1) + '" ry="' + (r * K * 0.7).toFixed(1) + '"/>'; }
  function box(c, x0, x1, y0, y1, z0, z1) { return poly(c + ' t', rect(x0, x1, y0, y1, z1)) + poly(c + ' r', [x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1]) + poly(c + ' l', [x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1]); }
  function U(u) { return u * Wd; } function V(v) { return v * Dp; }

  function layout(style) {
    var Lt = {};
    Lt.terr = style === 2 ? [0.3, 0.7, 0.19, 0.31] : style === 1 ? [0.24, 0.6, 0.19, 0.29] : [0.2, 0.6, 0.19, 0.31];
    Lt.path = style === 0 ? [[[0.4, 0.31], [0.4, 0.99]], [[0.4, 0.7], [0.72, 0.7]]]
      : style === 1 ? [[[0.42, 0.29], [0.34, 0.44], [0.45, 0.6], [0.37, 0.78], [0.44, 0.99]], [[0.45, 0.6], [0.6, 0.66], [0.72, 0.72]]]
        : [[[0.5, 0.31], [0.5, 0.99]], [[0.18, 0.64], [0.78, 0.64]]];
    Lt.beds = style === 0 ? [['r', 0.03, 0.17, 0.36, 0.8], ['r', 0.82, 0.97, 0.36, 0.56]]
      : style === 1 ? [['e', 0.16, 0.5, 0.11, 0.1], ['e', 0.82, 0.42, 0.1, 0.08], ['e', 0.2, 0.86, 0.09, 0.07]]
        : [['r', 0.28, 0.46, 0.42, 0.6], ['r', 0.54, 0.72, 0.42, 0.6], ['r', 0.28, 0.46, 0.68, 0.86], ['r', 0.54, 0.72, 0.68, 0.86]];
    Lt.trees = style === 0 ? [[0.1, 0.25], [0.9, 0.24], [0.92, 0.9], [0.1, 0.92], [0.62, 0.9]]
      : style === 1 ? [[0.08, 0.24], [0.88, 0.26], [0.7, 0.42], [0.92, 0.62], [0.12, 0.68], [0.6, 0.92], [0.25, 0.95], [0.86, 0.94]]
        : [[0.38, 0.38], [0.62, 0.38], [0.38, 0.9], [0.62, 0.9], [0.1, 0.25], [0.9, 0.25]];
    Lt.shrubs = style === 0 ? (function () { var a = []; for (var v = 0.22; v < 0.99; v += 0.05) a.push([0.015, v]); return a; })()
      : style === 1 ? [[0.22, 0.4], [0.27, 0.43], [0.75, 0.5], [0.8, 0.53], [0.3, 0.8], [0.96, 0.75], [0.93, 0.79], [0.06, 0.5]]
        : (function () { var a = []; [[0.27, 0.47], [0.73, 0.47]].forEach(function (p) { for (var v = 0.42; v < 0.87; v += 0.045) if (v < 0.6 || v > 0.68) a.push([p[0], v]); }); return a; })();
    Lt.relax = style === 2 ? [0.84, 0.64, 'g'] : [0.76, 0.74, 'f'];
    return Lt;
  }
  function seg(p) { // полілінія в долях → метри, крок 0,6 м: [x, y, кут]
    var out = [];
    for (var i = 0; i < p.length - 1; i++) {
      var x0 = U(p[i][0]), y0 = V(p[i][1]), x1 = U(p[i + 1][0]), y1 = V(p[i + 1][1]), l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(l / 0.6));
      for (var j = 0; j < n; j++) out.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n, Math.atan2(y1 - y0, x1 - x0)]);
    }
    return out;
  }
  function build() {
    var area = cfg.n * 100; Wd = Math.sqrt(area / 1.5); Dp = Wd * 1.5;
    for (var k in L) L[k] = [];
    var Lt = layout(cfg.s), i, j, t;
    // ділянка, будинок (контекст), паркан
    add('ground', poly('la-soil', rect(0, Wd, 0, Dp)), -1, 0);
    add('ground', box('la-house', U(0.22), U(0.78), V(0.02), V(0.17), 0, 6) + poly('la-roof', [U(0.22), V(0.02), 6, U(0.78), V(0.02), 6, U(0.78), V(0.17), 6, U(0.22), V(0.17), 6]), -1, 0);
    // 1 геодезія: тахеометр, кілки, осі
    add('top', line('la-tri', [U(0.97), V(0.03), 0, U(0.97), V(0.03), 1.4]) + line('la-tri', [U(0.95), V(0.05), 0, U(0.97), V(0.03), 1.4, U(0.99), V(0.05), 0]) + circ('la-dev', U(0.97), V(0.03), 1.5, 0.25), 0, 0.05, 3);
    var pegs = [[0, 0], [1, 0], [1, 1], [0, 1]].concat(Lt.path[0]);
    pegs.forEach(function (p, n) { add('top', line('la-peg', [U(p[0]), V(p[1]), 0, U(p[0]), V(p[1]), 0.8]) + circ('la-pegf', U(p[0]), V(p[1]), 0.8, 0.12), 0, 0.15 + 0.8 * n / pegs.length, 3); });
    Lt.path.forEach(function (p, n) { add('top', line('la-axis', p.reduce(function (a, q) { return a.concat([U(q[0]), V(q[1]), 0.02]); }, [])), 0, 0.5 + n * 0.2, 3); });
    // 2 дрон: апарат і сітка зйомки
    add('top', '<g class="la-drone">' + circ('la-dr', Wd / 2, Dp / 2, 9, 0.6) + line('la-dr2', [Wd / 2 - 1, Dp / 2, 9, Wd / 2 + 1, Dp / 2, 9]) + line('la-dr2', [Wd / 2, Dp / 2 - 1, 9, Wd / 2, Dp / 2 + 1, 9]) + '</g>', 1, 0.02, 2);
    for (i = 1; i < 8; i++) add('top', line('la-scan', [U(i / 8), 0, 0.03, U(i / 8), Dp, 0.03]), 1, 0.1 + i * 0.1, 2);
    // 3 проєкт на ділянці: пунктир зон
    var T0 = Lt.terr;
    add('top', poly('la-plan', rect(U(T0[0]), U(T0[1]), V(T0[2]), V(T0[3]), 0.03)), 2, 0.1, 9);
    Lt.beds.forEach(function (b, n) { add('top', bedShape('la-plan', b, 0.03), 2, 0.3 + n * 0.1, 7.7); }); // розмітка грядок — до бордюрів, далі не лишається на газоні
    Lt.trees.forEach(function (p, n) { add('top', circ('la-plan', U(p[0]), V(p[1]), 0.03, 1.4), 2, 0.6 + n * 0.04, 10.2); }); // лунки дерев — до газону
    // 4 рельєф: горби зникають, стрілки ухилу
    for (i = 0; i < 18; i++) { var hx = U(((i * 37) % 97) / 100), hy = V(0.2 + ((i * 53) % 79) / 100); if (hy < Dp) add('ground', circ('la-lump', hx, hy, 0, 1 + (i % 3) * 0.5), -1, 0, 3 + (i % 9) / 10); }
    [[0.3, 0.22, 0.3, 0.4], [0.7, 0.22, 0.7, 0.4], [0.9, 0.5, 0.9, 0.8]].forEach(function (a, n) { add('top', line('la-slope', [U(a[0]), V(a[1]), 0.05, U(a[2]), V(a[3]), 0.05]), 3, 0.4 + n * 0.2, 5); });
    add('ground', poly('la-graded', rect(0, Wd, V(0.17), Dp)), 3, 0.5);
    // 5 дренаж (ялинка до колодязя), краплі
    var mx = U(0.9), soak = [U(0.93), V(0.985)];
    add('under', line('la-drain', [mx, V(0.32), 0, mx, V(0.97), 0, soak[0], soak[1], 0]), 4, 0.1, null, 0);
    for (i = 0; i < 6; i++) { var yy = V(0.36 + i * 0.1); add('under', line('la-drain2', [mx, yy, 0, U(0.12), yy + V(0.06), 0]), 4, 0.25 + i * 0.1, null, 0); }
    add('under', circ('la-soak', soak[0], soak[1], 0, 0.8), 4, 0.9, null, 0);
    add('under', '<g class="la-drops">' + [0, 1, 2].map(function (n) { var a = P(mx, V(0.32), 0), b = P(mx, V(0.97), 0); return '<circle r="2.4" class="la-drop"><animateMotion dur="2.4s" begin="' + (n * 0.8) + 's" repeatCount="indefinite" path="M' + a.join(',') + ' L' + b.join(',') + '"/></circle>'; }).join('') + '</g>', 4, 0.5, null, 0);
    // 6 автополив: магістраль, форсунки з бризками, крапельні лінії
    add('under', line('la-irr', [U(0.85), V(0.18), 0, U(0.96), V(0.2), 0, U(0.96), V(0.96), 0]), 5, 0.05, null, 1);
    var hn = 0;
    for (i = 0.08; i < 0.95; i += 0.22) for (j = 0.36; j < 0.98; j += 0.2) {
      var sx = U(i), sy = V(j); add('under', line('la-irr2', [U(0.96), sy, 0, sx, sy, 0]), 5, 0.15 + (hn % 10) * 0.02, null, 1);
      add('plant', '<g class="la-spr">' + circ('la-head', sx, sy, 0.05, 0.12) + '<path class="la-spray" d="M' + P(sx, sy, 0.1).join(',') + ' q 9 -14 18 0 M' + P(sx, sy, 0.1).join(',') + ' q -9 -14 -18 0"/></g>', 5, 0.3 + (hn++ % 10) * 0.06, null);
    }
    Lt.beds.forEach(function (b, n) { add('under', bedShape('la-drip', b, 0), 5, 0.7 + n * 0.05, null, 1); });
    // 7 кабелі освітлення
    Lt.path.forEach(function (p, n) { add('under', line('la-cab', p.reduce(function (a, q) { return a.concat([U(q[0]) + 1, V(q[1]), 0]); }, [U(0.5), V(0.17), 0])), 6, 0.2 + n * 0.3, null, 2); });
    // 8 бордюри (контури доріжок і клумб) — нижче; 9 доріжки — бруківка камінь за каменем з перевʼязкою
    var stones = [], edges = [];
    Lt.path.forEach(function (p) { seg(p).forEach(function (q, r) { stones.push([q, r]); }); });
    stones.forEach(function (sq, n) {
      var q = sq[0], a = q[2], c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c, off = (sq[1] % 2) * 0.2;
      for (var m = 0; m < 3; m++) {
        var w0 = -0.6 + m * 0.4 + (m === 0 ? 0 : off - 0.0), w1 = Math.min(0.6, w0 + 0.38);
        var x0 = q[0] + nx * w0, y0 = q[1] + ny * w0, x1 = q[0] + nx * w1, y1 = q[1] + ny * w1;
        add('hard', poly('la-paver p' + ((sq[1] + m) % 3), [x0, y0, 0.06, x1, y1, 0.06, x1 + c * 0.56, y1 + s * 0.56, 0.06, x0 + c * 0.56, y0 + s * 0.56, 0.06]), 8, 0.05 + 0.9 * n / stones.length);
      }
      edges.push(q);
    });
    add('hard', '', 8, 0); // подушка й геотекстиль показуємо смугами під бруківкою
    Lt.path.forEach(function (p, n) {
      var sg = seg(p); if (!sg.length) return;
      var lft = [], rgt = [];
      sg.forEach(function (q) { var nx = -Math.sin(q[2]), ny = Math.cos(q[2]); lft.push(q[0] + nx * 0.72, q[1] + ny * 0.72, 0.08); rgt.push(q[0] - nx * 0.72, q[1] - ny * 0.72, 0.08); });
      add('edge', line('la-curb', lft), 7, 0.1 + n * 0.4); add('edge', line('la-curb', rgt), 7, 0.2 + n * 0.4);
      add('edge', line('la-base', sg.reduce(function (a, q) { return a.concat([q[0], q[1], 0.02]); }, [])), 8, 0.01);
    });
    // 10 тераса: дошки по черзі
    var tx0 = U(T0[0]), tx1 = U(T0[1]), ty0 = V(T0[2]), ty1 = V(T0[3]);
    add('hard', box('la-deckb', tx0, tx1, ty0, ty1, 0, 0.25), 9, 0.05);
    for (t = tx0, i = 0; t < tx1 - 0.05; t += 0.16, i++) add('hard', poly('la-board b' + (i % 2), [t, ty0, 0.3, Math.min(t + 0.14, tx1), ty0, 0.3, Math.min(t + 0.14, tx1), ty1, 0.3, t, ty1, 0.3]), 9, 0.15 + 0.8 * (t - tx0) / (tx1 - tx0));
    // 11 газон смугами з швами (під доріжками й терасою за порядком малювання)
    for (t = V(0.18), i = 0; t < Dp; t += 0.45, i++) add('lawn', poly('la-turf t' + (i % 2), [0.05, t, 0.04, Wd - 0.05, t, 0.04, Wd - 0.05, Math.min(t + 0.42, Dp), 0.04, 0.05, Math.min(t + 0.42, Dp), 0.04]), 10, 0.1 + 0.85 * (t - V(0.18)) / (Dp - V(0.18)));
    // 14 квітники: дренаж/ґрунт/мульча/квіти; 8 — бордюр клумби
    Lt.beds.forEach(function (b, n) {
      add('edge', bedShape('la-bedc', b, 0.06), 7, 0.6 + n * 0.1);
      add('bed', bedShape('la-mulch', b, 0.07), 13, 0.1 + n * 0.08);
      var cx = b[0] === 'e' ? U(b[1]) : U((b[1] + b[2]) / 2), cy = b[0] === 'e' ? V(b[2]) : V((b[3] + b[4]) / 2), rx = b[0] === 'e' ? U(b[3]) : U(b[2] - b[1]) / 2, ry = b[0] === 'e' ? V(b[4]) : V(b[4] - b[3]) / 2;
      for (var f = 0; f < 14; f++) { var aa = f * 2.4, rr = 0.25 + (f % 5) / 7; add('bed', circ('la-flower f' + (f % 4), cx + Math.cos(aa) * rx * rr * 0.8, cy + Math.sin(aa) * ry * rr * 0.8, 0.25, 0.22), 13, 0.4 + f * 0.04); }
    });
    // 12 дерева: яма з мульчею → стовбур → крона росте
    Lt.trees.forEach(function (p, n) {
      var x = U(p[0]), y = V(p[1]), o = 0.05 + n * 0.85 / Lt.trees.length;
      add('plant', circ('la-pit', x, y, 0.05, 0.9) + circ('la-mulch2', x, y, 0.06, 0.75), 11, o);
      add('plant', '<g class="la-tree">' + line('la-trunk', [x, y, 0, x, y, 2.6]) + circ('la-crown', x, y, 3.6, 1.5) + circ('la-crown2', x - 0.4, y + 0.3, 4.2, 0.9) + '</g>', 11, o + 0.04);
    });
    // 13 кущі
    Lt.shrubs.forEach(function (p, n) { add('plant', '<g class="la-shrub">' + circ('la-bush', U(p[0]), V(p[1]), 0.5, cfg.s === 2 ? 0.35 : 0.55) + '</g>', 12, 0.05 + 0.9 * n / Lt.shrubs.length); });
    // 15 зона відпочинку: вогнище або альтанка, лавки
    var rx0 = U(Lt.relax[0]), ry0 = V(Lt.relax[1]);
    add('hard', circ('la-pad', rx0, ry0, 0.05, 2.3), 14, 0.1);
    if (Lt.relax[2] === 'g') add('plant', box('la-gaz', rx0 - 1.4, rx0 + 1.4, ry0 - 1.4, ry0 + 1.4, 0, 2.6) + poly('la-gazr', [rx0 - 1.8, ry0 - 1.8, 2.6, rx0 + 1.8, ry0 - 1.8, 2.6, rx0 + 1.8, ry0 + 1.8, 2.6, rx0 - 1.8, ry0 + 1.8, 2.6]), 14, 0.4);
    else { add('plant', circ('la-fire', rx0, ry0, 0.2, 0.7) + '<path class="la-flame" d="M' + P(rx0, ry0, 0.2).join(',') + ' q -4 -10 0 -18 q 4 8 0 18"/>', 14, 0.4); }
    for (i = 0; i < 3; i++) { var ba = 0.6 + i * 2.1; add('plant', box('la-bench', rx0 + Math.cos(ba) * 2 - 0.5, rx0 + Math.cos(ba) * 2 + 0.5, ry0 + Math.sin(ba) * 2 - 0.25, ry0 + Math.sin(ba) * 2 + 0.25, 0, 0.45), 14, 0.6 + i * 0.1); }
    // 16 світло: вечір, світильники вздовж доріжок і підсвітка дерев
    add('sky', '<rect class="la-night" x="-9999" y="-9999" width="19999" height="19999"/>', 15, 0.05);
    edges.forEach(function (q, n) { if (n % 7) return; var nx = -Math.sin(q[2]), ny = Math.cos(q[2]); add('sky', line('la-post', [q[0] + nx, q[1] + ny, 0, q[0] + nx, q[1] + ny, 0.7]) + circ('la-glow', q[0] + nx, q[1] + ny, 0.75, 1.1), 15, 0.2 + 0.6 * n / edges.length); });
    Lt.trees.forEach(function (p, n) { add('sky', circ('la-glow up', U(p[0]), V(p[1]), 1.5, 1.6), 15, 0.5 + n * 0.04); });
    add('sky', circ('la-glow fire', rx0, ry0, 0.6, 1.8), 15, 0.7);
    // збірка: шари в порядку малювання; ключі появи — у відсортованому списку для швидкого оновлення
    var order = ['ground', 'under', 'lawn', 'edge', 'hard', 'bed', 'plant', 'top', 'sky'], html = '', id = 0;
    els = [];
    order.forEach(function (ly) { L[ly].forEach(function (o) { o.id = id++; html += '<g class="la-e' + (o.k < 0 ? ' on' : '') + (o.x != null ? ' ux ux' + o.x : '') + '" data-i="' + o.id + '">' + o.h + '</g>'; if (o.k >= 0) els.push(o); }); });
    els.sort(function (a, b) { return a.k - b.k; });
    // рамка: уся ділянка
    var c = [P(0, 0, 9), P(Wd, 0, 0), P(0, Dp, 0), P(Wd, Dp, 0)], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    FULL = [Math.min.apply(0, xs) - 20, Math.min.apply(0, ys) - 20, Math.max.apply(0, xs) - Math.min.apply(0, xs) + 40, Math.max.apply(0, ys) - Math.min.apply(0, ys) + 40];
    svg.innerHTML = '<defs><linearGradient id="la-g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f9a4a"/><stop offset="1" stop-color="#4d7a34"/></linearGradient>'
      + '<pattern id="la-bark" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#5a3a22"/><circle cx="1.5" cy="1.5" r="1" fill="#7a5233"/><circle cx="4.5" cy="4" r=".8" fill="#3f2816"/></pattern>'
      + '<radialGradient id="la-cr"><stop offset="0" stop-color="#8fbf5a"/><stop offset="1" stop-color="#3f6e2a"/></radialGradient>'
      + '<radialGradient id="la-gl"><stop offset="0" stop-color="#ffd98a" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>' + html;
    nodes = [].slice.call(svg.querySelectorAll('g.la-e'));
    ptr = 0; shown = -1; vb = null;
    els.forEach(function (o) { o.n = nodes[o.id]; });
    apply(true);
  }
  var FULL, nodes = [];
  function bedShape(c, b, z) {
    if (b[0] === 'r') return poly(c, rect(U(b[1]), U(b[2]), V(b[3]), V(b[4]), z));
    var a = [], cx = U(b[1]), cy = V(b[2]), rx = U(b[3]), ry = V(b[4]);
    for (var i = 0; i < 14; i++) { var t = i / 14 * 6.283, w = 1 + 0.12 * Math.sin(i * 1.7); a.push(cx + Math.cos(t) * rx * w, cy + Math.sin(t) * ry * w, z); }
    return poly(c, a);
  }
  /* фокус камери на етапі: частки ділянки (u0, v0, u1, v1) */
  var FOC = [0, 0, 0, 0, [0.5, 0.25, 1, 1], 0, [0.15, 0.15, 0.85, 1], [0.05, 0.25, 0.95, 1], [0.15, 0.25, 0.85, 1], [0.05, 0.05, 0.75, 0.45], 0, 0, 0, [0, 0.3, 1, 0.95], [0.5, 0.45, 1, 0.95], 0];
  function target(i) {
    var f = FOC[i]; if (!f) return FULL;
    var c = [P(U(f[0]), V(f[1]), 4), P(U(f[2]), V(f[1]), 0), P(U(f[0]), V(f[3]), 0), P(U(f[2]), V(f[3]), 0)], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    var w = Math.max.apply(0, xs) - Math.min.apply(0, xs) + 60, h = Math.max.apply(0, ys) - Math.min.apply(0, ys) + 60, ar = FULL[2] / FULL[3];
    if (w / h < ar) w = h * ar; else h = w / ar; // пропорції як у повного кадру — без стрибків розміру
    return [(Math.min.apply(0, xs) + Math.max.apply(0, xs)) / 2 - w / 2, (Math.min.apply(0, ys) + Math.max.apply(0, ys)) / 2 - h / 2, w, h];
  }
  function apply(force) {
    var p = prog;
    while (ptr < els.length && els[ptr].k <= p) { els[ptr].n.classList.add('on'); ptr++; }
    while (ptr > 0 && els[ptr - 1].k > p) { ptr--; els[ptr].n.classList.remove('on'); }
    els.forEach(function (o) { if (o.u != null) o.n.classList.toggle('gone', p >= o.u); });
    svg.classList.toggle('la-buried', p >= LAWN + 0.6);
    svg.classList.toggle('la-dusk', p >= 15);
    var i = Math.min(N - 1, Math.floor(p));
    if (i !== shown || force) {
      shown = i;
      cap.innerHTML = '<b>' + esc(ST[i][0]) + '</b><span>' + esc(ST[i][1]) + '</span>';
      cnt.textContent = (i + 1) + ' ' + ui.of + ' ' + N;
      live.textContent = (i + 1) + '/' + N + ': ' + ST[i][0];
      vbT = target(i);
      if (i === N - 1) cl('la_end');
    }
    if (!vb || RM || force) vb = vbT.slice();
    tick();
  }
  function tick() {
    raf = 0;
    var dn = 0;
    for (var j = 0; j < 4; j++) { var dv = vbT[j] - vb[j]; if (Math.abs(dv) > 0.5) { vb[j] += dv * 0.14; dn = 1; } else vb[j] = vbT[j]; }
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
  function seg2(name, items, cur, fn) {
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
  function est() { return ui.est.replace('{n}', cfg.n).replace('{v}', money(cfg.n * 50)); }
  function enhance() {
    var w = sec.querySelector('.w'), list = sec.querySelector('ol.bz-st');
    var box0 = el('div', 'la-box');
    var ctr = el('div', 'la-ctl');
    ctr.appendChild(seg2(ui.sot, SOT.map(function (n) { return n + ''; }), 1, function (i) { cfg.n = SOT[i]; build(); estEl.textContent = est(); cl('la_sot', cfg.n); }));
    ctr.appendChild(seg2(ui.style, ui.styles, 0, function (i) { cfg.s = i; build(); cl('la_style', STY[i]); }));
    var xr = el('div', 'la-seg la-xr'); xr.setAttribute('role', 'group'); xr.setAttribute('aria-label', ui.xray); xr.appendChild(el('span', 'la-lab', esc(ui.xray)));
    ui.xr.forEach(function (t, i) {
      var b = el('button', 'x' + i, esc(t)); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { cfg.xr[i] = cfg.xr[i] ? 0 : 1; b.setAttribute('aria-pressed', cfg.xr[i] ? 'true' : 'false'); svg.classList.toggle('xr' + i, !!cfg.xr[i]); cl('la_xray', i); });
      xr.appendChild(b);
    });
    ctr.appendChild(xr);
    stick = el('div', 'la-stick');
    svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'la-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', sec.querySelector('h2').textContent);
    var nav = el('div', 'la-nav'), pb = el('button', 'la-prev', '‹') /* RTL: Unicode сам віддзеркалює ‹ › (Bidi_Mirrored), тож символи ті самі, що в LTR */, nb = el('button', 'la-next', '›');
    pb.type = nb.type = 'button'; pb.setAttribute('aria-label', ui.prev); nb.setAttribute('aria-label', ui.next);
    pb.addEventListener('click', function () { go(shown - 1); }); nb.addEventListener('click', function () { go(shown + 1); });
    cnt = el('span', 'la-cnt'); cap = el('p', 'la-cap'); live = el('span', 'la-live'); live.setAttribute('aria-live', 'polite');
    nav.appendChild(pb); nav.appendChild(cnt); nav.appendChild(nb);
    stick.appendChild(svg); stick.appendChild(cap); stick.appendChild(nav); stick.appendChild(live);
    var estEl = el('p', 'la-est'); estEl.textContent = est();
    var cta = el('a', 'btn main la-cta', esc(ui.calc)); cta.href = '#zayavka';
    cta.addEventListener('click', function () {
      var f = d.getElementById('of'), m = d.getElementById('oMsg'), msg = ui.msg.replace('{n}', cfg.n).replace('{s}', ui.styles[cfg.s]);
      if (f) f.setAttribute('data-service', ui.svc);
      if (m) { m.value = msg; var det = m.closest('details'); if (det) det.open = true; }
      setTimeout(function () { var ph = d.getElementById('oPhone'); if (ph) ph.focus({ preventScroll: true }); }, 500);
      cl('la_cta', cfg.n + '/' + STY[cfg.s]);
    });
    var foot = el('div', 'la-foot'); foot.appendChild(estEl); foot.appendChild(cta);
    stick.appendChild(foot);
    var CMP = !RM && !!d.querySelector('.hx-home'); // головні: компактна сцена в межах екрана — без sticky-доріжки, етапи крокує casAuto і ←/→ (Михайло 05.11.2026)
    if (RM || CMP) { box0.appendChild(ctr); box0.appendChild(stick); if (CMP) sec.classList.add('la-cmp'); }
    else { run = el('div', 'la-run'); run.style.height = 'calc(100vh + ' + N + ' * clamp(400px, 50vh, 560px))'; box0.appendChild(ctr); run.appendChild(stick); box0.appendChild(run); }
    list.parentNode.insertBefore(box0, list);
    list.classList.add('la-sr');
    sec.classList.add('la-on');
    svg.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(shown + 1); if (e.key === 'ArrowLeft') go(shown - 1); });
    svg.setAttribute('tabindex', '0');
    // пироги: кнопка поруч підсвічує відповідну зону в сцені
    [].forEach.call(sec.querySelectorAll('details.la-pie'), function (dt) { dt.addEventListener('toggle', function () { if (dt.open) cl('la_pie', dt.getAttribute('data-pie')); }); });
    prog = RM ? N - 0.001 : CMP ? 0.999 : 0;
    build();
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
