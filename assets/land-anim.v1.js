/* «Ландшафт з нуля» (tools/site/landanim.py): ізометрична SVG-сцена облаштування ділянки, 16 етапів за прокруткою.
   Вантажить site-chrome.v1.js після першої прокрутки (section.bz[data-js]). Тексти етапів — з DOM (ol.bz-st), підписи — script.la-ui.
   CLS 0: сцена будується лише коли блок поза кадром; reduced-motion — статичні кадри з кнопками; клавіатура: ←/→, кнопки з aria. */
(function () {
  'use strict';
  var sdU = null; // casSide (site-chrome.v1.js): панель компактної сцени головної — лічильник, прогрес, номери етапів
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
  // деталізація 09.11: площина фасаду F(a, z) → точка; q — прямокутник на ній; sp — відрізок для <path>; zz — та сама лінія на іншій висоті
  function q(F, a0, a1, z0, z1) { return F(a0, z0).concat(F(a1, z0), F(a1, z1), F(a0, z1)); }
  function sp(a) { return 'M' + pts(a).replace(/ /g, 'L'); }
  function zz(a, z) { return a.map(function (v, i) { return i % 3 === 2 ? z : v; }); }
  function tr(a, n) { return '<g class="lx-t' + (n ? ' n' : '') + '">' + line('lx-sp', a) + line('lx-tr', a) + line('lx-tg', a) + '</g>'; } // траншея: відвал, яма, щебінь
  function man(x, y, z) { return '<g class="lx-man" transform="translate(' + P(x, y, z) + ')"><path d="M-1.6 0l.4-8-1-.5.1-5q2.1-1.4 4.2 0l.1 5-1 .5.4 8h-1.1L0-6-.5 0z"/><circle cy="-15.4" r="1.7"/></g>'; }
  function fence(F, a0, a1) { return poly('lx-fn', q(F, a0, a1, 0, 1.2)) + line('lx-fr', F(a0, 1.1).concat(F(a1, 1.1))) + line('lx-fr', F(a0, 0.3).concat(F(a1, 0.3))) + line('lx-fp', F(a0, 0).concat(F(a0, 1.4))) + line('lx-fp', F(a1, 0).concat(F(a1, 1.4))); }
  /* будинок у стилі сцени «Будинок»: штукатурка, цоколь, двоскатний дах з фальцами й рядами, вікна з рамами, двері, ганок, ринви; [стіни і дах, ганок, вечірні вікна] */
  function house(dx) {
    var x0 = U(0.22), x1 = U(0.78), y0 = V(0.02), y1 = V(0.17), H = 5.2, R = 6.6, o = 0.45, ym = (y0 + y1) / 2, e = H - (R - H) * o / (ym - y0), h = '', wn = '', n, i, a, w,
      Fa = function (a, z) { return [a, y1, z]; }, Sa = function (a, z) { return [x1, a, z]; };
    function win(F, a, b, z0, z1) {
      var m = (a + b) / 2;
      h += poly('lx-wf', q(F, a - 0.12, b + 0.12, z0 - 0.12, z1 + 0.1)) + poly('lx-wg', q(F, a, b, z0, z1)) + poly('lx-wl', q(F, a + 0.1, a + 0.3, z0 + 0.45, z1 - 0.1)) + line('lx-wm', F(m, z0).concat(F(m, z1))) + line('lx-ws', F(a - 0.2, z0 - 0.15).concat(F(b + 0.2, z0 - 0.15)));
      wn += poly('lx-wn', q(F, a, b, z0, z1));
    }
    h += poly('lx-hw', q(Fa, x0, x1, 0, H)) + poly('lx-hw r', [x1, y0, 0, x1, y1, 0, x1, y1, H, x1, ym, R, x1, y0, H]) + poly('lx-pl', q(Fa, x0, x1, 0, 0.5)) + poly('lx-pl r', q(Sa, y0, y1, 0, 0.5)) + line('lx-bd', [x0, y1, 2.65, x1, y1, 2.65, x1, y0, 2.65]);
    w = x1 - x0; n = Math.max(3, Math.round(w / 2.7));
    for (i = 0; i < n; i++) { a = x0 + (i + 0.5) * w / n; if (Math.abs(a - dx) > 1.3) win(Fa, a - 0.6, a + 0.6, 0.95, 2.2); win(Fa, a - 0.6, a + 0.6, 3.3, 4.55); }
    w = y1 - y0; n = Math.max(1, Math.round(w / 4));
    for (i = 0; i < n; i++) { a = y0 + (i + 0.5) * w / n; win(Sa, a - 0.55, a + 0.55, 0.95, 2.2); win(Sa, a - 0.55, a + 0.55, 3.3, 4.55); }
    win(Sa, ym - 0.3, ym + 0.3, 5.35, 5.95);
    h += poly('lx-wf', q(Fa, dx - 0.62, dx + 0.62, 0.5, 2.78)) + poly('lx-do', q(Fa, dx - 0.5, dx + 0.5, 0.5, 2.66)) + poly('lx-wg', q(Fa, dx - 0.28, dx + 0.28, 1.9, 2.45)) + circ('lx-kn', dx + 0.34, y1, 1.5, 0.07);
    // дах: задній схил, комин, передній схил з фальцами й рядами, вітрова дошка, гребінь, ринва й водостоки
    var rb = '', rw = '', t;
    for (t = x0 - o + 0.3; t < x1 + o; t += 0.55) rb += sp([t, ym, R, t, y1 + o, e]);
    for (t = 0.2; t < 1; t += 0.2) rw += sp([x0 - o, ym + (y1 + o - ym) * t, R - (R - e) * t, x1 + o, ym + (y1 + o - ym) * t, R - (R - e) * t]);
    h += poly('lx-rf b', [x0 - o, y0 - o, e, x1 + o, y0 - o, e, x1 + o, ym, R, x0 - o, ym, R]) + box('lx-ch', x0 + 2, x0 + 2.7, ym - 1.1, ym - 0.4, 5.6, 7.1)
      + poly('lx-rf', [x0 - o, ym, R, x1 + o, ym, R, x1 + o, y1 + o, e, x0 - o, y1 + o, e]) + '<path class="lx-rr" d="' + rb + '"/><path class="lx-rw" d="' + rw + '"/>'
      + line('lx-rb', [x1 + o, y1 + o, e, x1 + o, ym, R, x1 + o, y0 - o, e]) + line('lx-rb', [x0 - o, ym, R + 0.05, x1 + o, ym, R + 0.05])
      + line('lx-gu', [x0 - o, y1 + o, e - 0.1, x1 + o, y1 + o, e - 0.1]) + line('lx-gu', [x0 + 0.2, y1 + 0.15, e - 0.1, x0 + 0.2, y1 + 0.15, 0.1]) + line('lx-gu', [x1 - 0.2, y1 + 0.15, e - 0.1, x1 - 0.2, y1 + 0.15, 0.1]);
    var pr = box('lx-st', dx - 1, dx + 1, y1, y1 + 0.9, 0, 0.25) + box('lx-st', dx - 0.8, dx + 0.8, y1, y1 + 0.5, 0.25, 0.5) + box('lx-cn', dx - 0.95, dx + 0.95, y1, y1 + 1.1, 2.95, 3.08) + circ('lx-lm', dx + 0.85, y1, 2.35, 0.1);
    return [h, pr, wn + circ('la-glow', dx, y1 + 0.6, 2.2, 1.6), [x0, x1, y0, y1]];
  }

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
    var gx = U(Lt.path[0][Lt.path[0].length - 1][0]), Hs = house(U(Lt.path[0][0][0])), hb = Hs[3];
    add('ground', fence(function (a, z) { return [a, 0, z]; }, 0, Wd) + fence(function (a, z) { return [0, a, z]; }, 0, Dp), 12, 0.02);
    add('ground', Hs[0], -1, 0); add('hard', Hs[1], -1, 0);
    add('top', fence(function (a, z) { return [Wd, a, z]; }, 0, Dp) + fence(function (a, z) { return [a, Dp, z]; }, 0, gx - 1.1) + fence(function (a, z) { return [a, Dp, z]; }, gx + 1.1, Wd), 12, 0.04);
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
    t = [mx, V(0.32), 0, mx, V(0.97), 0, soak[0], soak[1], 0]; add('under', tr(t) + line('la-drain', t), 4, 0.1, null, 0);
    for (i = 0; i < 6; i++) { var yy = V(0.36 + i * 0.1); t = [mx, yy, 0, U(0.12), yy + V(0.06), 0]; add('under', tr(t, 1) + line('la-drain2', t), 4, 0.25 + i * 0.1, null, 0); }
    add('under', circ('la-soak', soak[0], soak[1], 0, 0.8), 4, 0.9, null, 0);
    add('under', '<g class="la-drops">' + [0, 1, 2].map(function (n) { var a = P(mx, V(0.32), 0), b = P(mx, V(0.97), 0); return '<circle r="2.4" class="la-drop"><animateMotion dur="2.4s" begin="' + (n * 0.8) + 's" repeatCount="indefinite" path="M' + a.join(',') + ' L' + b.join(',') + '"/></circle>'; }).join('') + '</g>', 4, 0.5, null, 0);
    // 6 автополив: магістраль, форсунки з бризками, крапельні лінії
    t = [U(0.85), V(0.18), 0, U(0.96), V(0.2), 0, U(0.96), V(0.96), 0]; add('under', tr(t, 1) + line('la-irr', t), 5, 0.05, null, 1);
    var hn = 0;
    for (i = 0.08; i < 0.95; i += 0.22) for (j = 0.36; j < 0.98; j += 0.2) {
      var sx = U(i), sy = V(j); t = [U(0.96), sy, 0, sx, sy, 0]; add('under', tr(t, 1) + line('la-irr2', t), 5, 0.15 + (hn % 10) * 0.02, null, 1);
      add('plant', '<g class="la-spr">' + circ('la-head', sx, sy, 0.05, 0.12) + '<path class="la-spray" d="M' + P(sx, sy, 0.1).join(',') + ' q 9 -14 18 0 M' + P(sx, sy, 0.1).join(',') + ' q -9 -14 -18 0"/></g>', 5, 0.3 + (hn++ % 10) * 0.06, null);
    }
    Lt.beds.forEach(function (b, n) { add('under', bedShape('la-drip', b, 0), 5, 0.7 + n * 0.05, null, 1); });
    // 7 кабелі освітлення
    Lt.path.forEach(function (p, n) { var a = p.reduce(function (a, q) { return a.concat([U(q[0]) + 1, V(q[1]), 0]); }, [U(0.5), V(0.17), 0]); add('under', tr(a, 1) + line('la-cab', a), 6, 0.2 + n * 0.3, null, 2); });
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
      add('edge', line('lx-cs', zz(lft, 0)) + line('la-curb', zz(lft, 0.16)), 7, 0.1 + n * 0.4); add('edge', line('lx-cs', zz(rgt, 0)) + line('la-curb', zz(rgt, 0.16)), 7, 0.2 + n * 0.4);
      add('edge', line('la-base', sg.reduce(function (a, q) { return a.concat([q[0], q[1], 0.02]); }, [])), 8, 0.01);
    });
    // 10 тераса: дошки по черзі
    var tx0 = U(T0[0]), tx1 = U(T0[1]), ty0 = V(T0[2]), ty1 = V(T0[3]);
    add('hard', box('la-deckb', tx0, tx1, ty0, ty1, 0, 0.25), 9, 0.05);
    for (t = tx0, i = 0; t < tx1 - 0.05; t += 0.16, i++) add('hard', poly('la-board b' + (i % 2), [t, ty0, 0.3, Math.min(t + 0.14, tx1), ty0, 0.3, Math.min(t + 0.14, tx1), ty1, 0.3, t, ty1, 0.3]), 9, 0.15 + 0.8 * (t - tx0) / (tx1 - tx0));
    // 11 газон смугами з швами (під доріжками й терасою за порядком малювання)
    for (t = V(0.18), i = 0; t < Dp; t += 0.45, i++) {
      var t2 = Math.min(t + 0.42, Dp), sm = '';
      for (j = 2.05 - (i % 2); j < Wd - 0.1; j += 2) sm += sp([j, t, 0.04, j, t2, 0.04]);
      add('lawn', poly('la-turf t' + (i * 7 % 3), [0.05, t, 0.04, Wd - 0.05, t, 0.04, Wd - 0.05, t2, 0.04, 0.05, t2, 0.04]) + '<path class="lx-sm" d="' + sm + '"/>', 10, 0.1 + 0.85 * (t - V(0.18)) / (Dp - V(0.18)));
    }
    add('lawn', poly('lx-gt', rect(0.05, Wd - 0.05, V(0.18), Dp, 0.04)), 10, 0.97);
    add('lawn', poly('lx-ao', rect(hb[0] - 0.3, hb[1] + 0.5, hb[3], hb[3] + 1.1, 0.04)) + poly('lx-ao', rect(hb[1], hb[1] + 1.6, hb[2] - 0.3, hb[3] + 0.5, 0.04)), -1, 0);
    // 14 квітники: дренаж/ґрунт/мульча/квіти; 8 — бордюр клумби
    Lt.beds.forEach(function (b, n) {
      add('edge', bedShape('lx-cs', b, 0) + bedShape('la-bedc', b, 0.16), 7, 0.6 + n * 0.1);
      add('bed', bedShape('la-mulch', b, 0.07), 13, 0.1 + n * 0.08);
      var cx = b[0] === 'e' ? U(b[1]) : U((b[1] + b[2]) / 2), cy = b[0] === 'e' ? V(b[2]) : V((b[3] + b[4]) / 2), rx = b[0] === 'e' ? U(b[3]) : U(b[2] - b[1]) / 2, ry = b[0] === 'e' ? V(b[4]) : V(b[4] - b[3]) / 2;
      for (var f = 0; f < 14; f++) { var aa = f * 2.4, rr = 0.25 + (f % 5) / 7; add('bed', circ('la-flower f' + (f % 4), cx + Math.cos(aa) * rx * rr * 0.8, cy + Math.sin(aa) * ry * rr * 0.8, 0.25, 0.22), 13, 0.4 + f * 0.04); }
    });
    // 12 дерева: яма з мульчею → стовбур → крона росте
    Lt.trees.forEach(function (p, n) {
      var x = U(p[0]), y = V(p[1]), o = 0.05 + n * 0.85 / Lt.trees.length;
      add('plant', circ('la-pit', x, y, 0.05, 0.9) + circ('la-mulch2', x, y, 0.06, 0.75), 11, o);
      var s = [1, 0.72, 1.3][n % 3], b = P(x, y, 0.3), c = P(x, y, 5.6 * s), w = 1.4 * s * K, g;
      add('bed', circ('lx-sh', x + 1.1 * s, y - 0.7 * s, 0.05, 1.6 * s), 11, o + 0.04);
      if (n % 3 === 1 && cfg.s !== 2) g = line('la-trunk', [x, y, 0, x, y, 0.8]) + '<path class="lx-cn1" d="M' + c + 'L' + (b[0] - w) + ',' + b[1] + 'L' + b + 'z"/><path class="lx-cn1 d" d="M' + c + 'L' + (+b[0] + w) + ',' + b[1] + 'L' + b + 'z"/>';
      else g = line('la-trunk', [x, y, 0, x, y, 2.6 * s]) + circ('la-crown', x, y, 3.6 * s, 1.5 * s) + circ('la-crown2', x - 0.4 * s, y + 0.3 * s, 4.2 * s, 0.9 * s) + circ('lx-c3', x - 0.5 * s, y + 0.4 * s, 4.3 * s, 0.5 * s);
      add('plant', '<g class="la-tree">' + g + '</g>', 11, o + 0.04);
    });
    // 13 кущі
    Lt.shrubs.forEach(function (p, n) { var x = U(p[0]), y = V(p[1]), r = (cfg.s === 2 ? 0.35 : 0.55) * [1, 0.7, 1.35][n % 3]; add('plant', '<g class="la-shrub">' + circ('lx-sh', x + r * 0.6, y - r * 0.4, 0.03, r * 1.1) + circ('la-bush', x, y, r, r) + circ('lx-bh', x - r * 0.25, y + r * 0.25, r * 1.3, r * 0.5) + '</g>', 12, 0.05 + 0.9 * n / Lt.shrubs.length); });
    // 15 зона відпочинку: вогнище або альтанка, лавки
    var rx0 = U(Lt.relax[0]), ry0 = V(Lt.relax[1]);
    add('hard', circ('la-pad', rx0, ry0, 0.05, 2.3), 14, 0.1);
    if (Lt.relax[2] === 'g') add('plant', box('la-gaz', rx0 - 1.4, rx0 + 1.4, ry0 - 1.4, ry0 + 1.4, 0, 2.6) + poly('la-gazr', [rx0 - 1.8, ry0 - 1.8, 2.6, rx0 + 1.8, ry0 - 1.8, 2.6, rx0 + 1.8, ry0 + 1.8, 2.6, rx0 - 1.8, ry0 + 1.8, 2.6]), 14, 0.4);
    else { add('plant', circ('la-fire', rx0, ry0, 0.2, 0.7) + '<path class="la-flame" d="M' + P(rx0, ry0, 0.2).join(',') + ' q -4 -10 0 -18 q 4 8 0 18"/>', 14, 0.4); }
    for (i = 0; i < 3; i++) { var ba = 0.6 + i * 2.1; add('plant', box('la-bench', rx0 + Math.cos(ba) * 2 - 0.5, rx0 + Math.cos(ba) * 2 + 0.5, ry0 + Math.sin(ba) * 2 - 0.25, ry0 + Math.sin(ba) * 2 + 0.25, 0, 0.45), 14, 0.6 + i * 0.1); }
    add('plant', man(U(Lt.path[0][0][0]) + 2.2, V(T0[2]) + 1.4, 0.3), 14, 0.8); add('plant', man(rx0 - 2.4, ry0 + 2.6, 0.05), 15, 0.3);
    // 16 світло: вечір, світильники вздовж доріжок і підсвітка дерев
    add('sky', '<rect class="la-night" x="-9999" y="-9999" width="19999" height="19999"/>', 15, 0.05); add('sky', Hs[2], 15, 0.1); // вікна — над вечірнім затемненням
    edges.forEach(function (q, n) { if (n % 7) return; var nx = -Math.sin(q[2]), ny = Math.cos(q[2]); add('sky', circ('lx-pool', q[0] + nx, q[1] + ny, 0.02, 2.6) + line('la-post', [q[0] + nx, q[1] + ny, 0, q[0] + nx, q[1] + ny, 0.7]) + circ('lx-lm', q[0] + nx, q[1] + ny, 0.75, 0.12) + circ('la-glow', q[0] + nx, q[1] + ny, 0.75, 1.1), 15, 0.2 + 0.6 * n / edges.length); });
    Lt.trees.forEach(function (p, n) { add('sky', circ('la-glow up', U(p[0]), V(p[1]), 1.5, 1.6), 15, 0.5 + n * 0.04); });
    add('sky', circ('la-glow fire', rx0, ry0, 0.6, 1.8), 15, 0.7);
    // збірка: шари в порядку малювання; ключі появи — у відсортованому списку для швидкого оновлення
    var order = ['ground', 'under', 'lawn', 'edge', 'hard', 'bed', 'plant', 'top', 'sky'], html = '', id = 0;
    els = [];
    order.forEach(function (ly) { L[ly].forEach(function (o) { o.id = id++; o.z = o.k >= Math.floor(prog) + 1 && o.x == null && o.h.indexOf('-night') < 0 ? 1 : 0; html += '<g class="la-e' + (o.k < 0 ? ' on' : '') + (o.x != null ? ' ux ux' + o.x : '') + '" data-i="' + o.id + '">' + (o.z ? '' : o.h) + '</g>'; if (o.k >= 0) els.push(o); }); });
    els.sort(function (a, b) { return a.k - b.k; });
    // рамка: уся ділянка
    var c = [P(0, 0, 9), P(Wd, 0, 0), P(0, Dp, 0), P(Wd, Dp, 0)], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    FULL = [Math.min.apply(0, xs) - 20, Math.min.apply(0, ys) - 20, Math.max.apply(0, xs) - Math.min.apply(0, xs) + 40, Math.max.apply(0, ys) - Math.min.apply(0, ys) + 40];
    svg.innerHTML = '<defs><linearGradient id="la-g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f9a4a"/><stop offset="1" stop-color="#4d7a34"/></linearGradient>'
      + '<pattern id="la-bark" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#5a3a22"/><circle cx="1.5" cy="1.5" r="1" fill="#7a5233"/><circle cx="4.5" cy="4" r=".8" fill="#3f2816"/></pattern>'
      + '<radialGradient id="la-cr"><stop offset="0" stop-color="#8fbf5a"/><stop offset="1" stop-color="#3f6e2a"/></radialGradient>'
      + '<radialGradient id="la-gl"><stop offset="0" stop-color="#ffd98a" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>' + DEF + '</defs>' + html;
    nodes = [].slice.call(svg.querySelectorAll('g.la-e'));
    ptr = 0; shown = -1; vb = null;
    els.forEach(function (o) { o.n = nodes[o.id]; });
    fillL();
    apply(true);
  }
  var FULL, nodes = [];
  /* деталізація: фактури (ґрунт, рівнений ґрунт, трава, штахети) і стилі нових деталей — лише для цієї сцени (.la-lnd), без blur */
  var DEF = '<pattern id="lx-dt" width="14" height="9" patternUnits="userSpaceOnUse"><rect width="14" height="9" fill="#5b4630"/><circle cx="3" cy="2" r="1" fill="#6c5439"/><circle cx="10" cy="6.5" r="1.2" fill="#4b3826"/><circle cx="7.5" cy="3.5" r=".5" fill="#80664a"/><circle cx="12" cy="1.5" r=".6" fill="#4b3826"/></pattern>'
    + '<pattern id="lx-gd" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="7" height="7" fill="#6a5236"/><rect width="7" height="1.2" fill="#77603f"/><circle cx="3" cy="4.5" r=".6" fill="#594430"/></pattern>'
    + '<pattern id="lx-gt" width="8" height="6" patternUnits="userSpaceOnUse"><path d="M1 5l.8-2.2M4.2 6l.5-2.4M6 3.4l1-1.8M2.6 2.2l.4-1.6" stroke="#93c264" stroke-width=".6" opacity=".5"/></pattern>'
    + '<pattern id="lx-fn" width="4" height="9" patternUnits="userSpaceOnUse"><rect width="2.8" height="9" fill="#8c6c4a"/><rect width=".7" height="9" fill="#a4835e"/></pattern>'
    + '<style>.la-lnd .la-soil{fill:url(#lx-dt)}.la-lnd .la-graded{fill:url(#lx-gd)}.la-lnd .la-turf.t2{fill:#64923f}.lx-gt{fill:url(#lx-gt);pointer-events:none}'
    + '.lx-sm{fill:none;stroke:#36592a;stroke-width:.5;opacity:.75}.la-lnd .la-paver{stroke:#665e50;stroke-width:.6}.la-lnd .la-curb,.la-lnd .la-bedc{stroke:#e4ddcd;stroke-width:2.2}.lx-cs{fill:none;stroke:#776d5d;stroke-width:3.4;stroke-linejoin:round}'
    + '.lx-t polyline{fill:none;stroke-linecap:round;stroke-linejoin:round}.lx-sp{stroke:#7d6347;stroke-width:10}.lx-tr{stroke:#21160d;stroke-width:6.5}.lx-tg{stroke:#9b907d;stroke-width:3.4;stroke-dasharray:1.2 1.4}'
    + '.lx-t.n .lx-sp{stroke-width:6.5}.lx-t.n .lx-tr{stroke-width:4}.lx-t.n .lx-tg{stroke-width:1.8}.la-buried .lx-t{display:none}'
    + '.lx-hw{fill:#ece6da}.lx-hw.r{fill:#c7bfaf}.lx-pl{fill:#8a847a}.lx-pl.r{fill:#6c675f}.lx-bd{stroke:#fff;stroke-width:.8;opacity:.55;fill:none}'
    + '.lx-wf{fill:#3a3e44}.lx-wg{fill:#2a4862}.lx-wl{fill:#a9cbe2;opacity:.45}.lx-wm{stroke:#3a3e44;stroke-width:.9}.lx-ws{stroke:#d3ccbe;stroke-width:1.6}.lx-wn{fill:#ffcb6b;stroke:#ffe6aa;stroke-width:.4}'
    + '.lx-do{fill:#6d4529}.lx-kn{fill:#e2c77c}.lx-rf{fill:#363a40}.lx-rf.b{fill:#2a2d32}.lx-rr{fill:none;stroke:#25282c;stroke-width:.8}.lx-rw{fill:none;stroke:#4a4f57;stroke-width:.6}'
    + '.lx-rb{fill:none;stroke:#1c1e22;stroke-width:2.2;stroke-linejoin:round}.lx-gu{fill:none;stroke:#9097a0;stroke-width:1.6}.lx-ch.t{fill:#60656c}.lx-ch.r{fill:#3e4247}.lx-ch.l{fill:#50545a}'
    + '.lx-st.t{fill:#bdb6a9}.lx-st.r{fill:#8f887b}.lx-st.l{fill:#a39c8f}.lx-cn.t{fill:#3c4046}.lx-cn.r,.lx-cn.l{fill:#2a2d31}.lx-lm{fill:#ffe6a8}'
    + '.lx-ao{fill:#0b1306;opacity:.24}.lx-sh{fill:#0b1806;opacity:.3}.lx-cn1{fill:#3b6e33}.lx-cn1.d{fill:#28502a}.lx-c3{fill:#b4d97c;opacity:.5}.lx-bh{fill:#62a14a}'
    + '.lx-fn{fill:url(#lx-fn)}.lx-fr{stroke:#6a4e33;stroke-width:1.2}.lx-fp{stroke:#56402a;stroke-width:2.2}.lx-pool{fill:url(#la-gl);opacity:.5}.lx-man{fill:#262a31}'
    + '.la-svg:is(.xr0,.xr1,.xr2) .lx-gt,.la-svg:is(.xr0,.xr1,.xr2) .lx-sm{opacity:.3}</style>';
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
    // кути фокуса на землі й на висоті будинку/крон (6.5 м): наїзд камери не зрізає верх будинку й дерев (QA Mac mini 06.11)
    var c = [], g = [[f[0], f[1]], [f[2], f[1]], [f[0], f[3]], [f[2], f[3]]];
    g.forEach(function (q) { c.push(P(U(q[0]), V(q[1]), 0), P(U(q[0]), V(q[1]), 6.5)); });
    var xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    var w = Math.max.apply(0, xs) - Math.min.apply(0, xs) + 60, h = Math.max.apply(0, ys) - Math.min.apply(0, ys) + 60, ar = FULL[2] / FULL[3];
    // вищий за кадр блок (телефон, складаний у книжковій орієнтації): пропорції блоку — запас зверху для будинку й крон на тлі, без порожніх смуг
    var bw = svg && svg.clientWidth, bh = svg && svg.clientHeight, h0;
    if (bw > 0 && bh > 0 && bw / bh < ar) ar = bw / bh;
    if (w / h < ar) w = h * ar; else { h0 = h; h = w / ar; }
    var cy = (Math.min.apply(0, ys) + Math.max.apply(0, ys)) / 2 - (h0 ? (h - h0) * 0.35 : 0); // додану висоту — переважно вгору
    return fit([(Math.min.apply(0, xs) + Math.max.apply(0, xs)) / 2 - w / 2, cy - h / 2, w, h], i, ar);
  }
  // 09.11: уся модель (ділянка з будинком) — у кадрі з полем 5% з кожного боку; наїзд зміщує кадр до деталі етапу й наближає, наскільки дозволяють пропорції блоку
  function fit(f, i, ar) { if (svg && svg.clientHeight > 0) ar = svg.clientWidth / svg.clientHeight; return fitM(f, [FULL[0] + 20, FULL[1] + 20, FULL[0] + FULL[2] - 20, FULL[1] + FULL[3] - 20], ar); }
  function fitM(f, M, ar) {
    var w = Math.max(f[2], (M[2] - M[0]) / 0.9, (M[3] - M[1]) / 0.9 * ar), h = w / ar, cx = f[0] + f[2] / 2, cy = f[1] + f[3] / 2;
    function cl(c, d, a, b) { c = (c + (a + b) / 2) / 2; return Math.max(b + 0.05 * d - d, Math.min(a - 0.05 * d, c - d / 2)); }
    return [cl(cx, w, M[0], M[2]), cl(cy, h, M[1], M[3]), w, h];
  }
  // перша збірка частинами (телефон CPU×4): вміст груп наступних етапів — порожні <g> на своєму місці, доливаються в простої порціями ≤ ~6 мс, не більше порції на кадр;
  // група, до якої дійшов прогрес раніше, доливається одразу (fz)
  var fT = 0;
  function fz(o) { o.z = 0; o.n.innerHTML = o.h; }
  function fillL() {
    var t = ++fT, j = 0, ric = function (f) { W.requestAnimationFrame(function () { if (W.requestIdleCallback) W.requestIdleCallback(f, { timeout: 150 }); else setTimeout(f, 0); }); };
    function ch() { if (t !== fT) return; var t0 = Date.now(); for (; j < els.length && Date.now() - t0 < 6; j++) if (els[j].z) fz(els[j]); if (j < els.length) ric(ch); }
    ric(ch);
  }
  function apply(force) {
    var p = prog;
    while (ptr < els.length && els[ptr].k <= p) { if (els[ptr].z) fz(els[ptr]); els[ptr].n.classList.add('on'); ptr++; }
    while (ptr > 0 && els[ptr - 1].k > p) { ptr--; els[ptr].n.classList.remove('on'); }
    els.forEach(function (o) { if (o.u != null) o.n.classList.toggle('gone', p >= o.u); });
    svg.classList.toggle('la-buried', p >= LAWN + 0.6);
    svg.classList.toggle('la-dusk', p >= 15);
    var i = Math.min(N - 1, Math.floor(p));
    if (i !== shown || force) {
      shown = i;
      cap.innerHTML = '<b>' + esc(ST[i][0]) + '</b><span>' + esc(ST[i][1]) + '</span>';
      cnt.textContent = (i + 1) + ' ' + ui.of + ' ' + N; if (sdU) sdU(i);
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
    svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'la-svg la-lnd'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', sec.querySelector('h2').textContent);
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
    if (CMP && W.casSide) sdU = W.casSide({ stick: stick, cap: cap, nav: nav, foot: foot, n: N, go: function (i) { go(i); }, title: function (i) { return i < 0 ? sec.querySelector('h2').textContent : ST[i][0]; } }); // єдиний вигляд компактних сцен (Михайло 08.11.2026)
    else { run = el('div', 'la-run'); run.style.height = 'calc(100vh + ' + N + ' * clamp(400px, 50vh, 560px))'; box0.appendChild(ctr); run.appendChild(stick); box0.appendChild(run); }
    list.parentNode.insertBefore(box0, list);
    list.classList.add('la-sr');
    sec.classList.add('la-on');
    svg.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(shown + ((e.key === 'ArrowRight') !== (d.documentElement.dir === 'rtl') ? 1 : -1)); } }); // preventDefault — casGest на блоці не робить другого кроку; RTL — дзеркально
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
    // жести всіх сцен (головні й повні): колесо над кадром ±1 етап, клік/тап збоку, свайп, ←/→; підказка — лише на головних. Повна sticky: go() плавно прокручує до етапу
    if (W.casGest) W.casGest({ root: box0, view: svg, go: go, cur: function () { return Math.max(0, shown); }, n: N, hint: d.querySelector('.hx-home') ? nav.parentNode : null, before: nav });
  }
  function css() {
    return new Promise(function (res) {
      // свій CSS і спільний scene-ui.v1.css: збираємо сцену лише після того, як обидва застосовано (site-chrome.v1.js міг уже додати <link>,
      // але файл ще вантажиться — без очікування сцена будується без стилів, а потім стискається, і низ сторінки «стрибає», CLS до 1.0)
      var href = sec.getAttribute('data-css'), ls = [], n, l = href && d.querySelector('link[href="' + href + '"]');
      if (href && !l) { l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; d.head.appendChild(l); }
      if (l) ls.push(l);
      var u = d.querySelector('link[href^="/assets/scene-ui."]'); if (u) ls.push(u);
      n = ls.length; if (!n) return res();
      function one() { if (!--n) res(); }
      ls.forEach(function (x) { if (x.sheet) return one(); var f = 0, k = function () { if (!f) { f = 1; one(); } }; x.addEventListener('load', k); x.addEventListener('error', k); setTimeout(k, 8000); });
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
