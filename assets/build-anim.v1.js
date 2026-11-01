/* CAS — «Будинок з нуля» / «Ремонт з нуля» v2: технологія будівництва й ремонту в ізометричній SVG-сцені за прокруткою. UI-kit: /styleguide/#build-anim-sg.
   Розмітку (section.bz з назвами/описами етапів, слот заявки) ставить tools/site/buildanim.py; тексти всіх матеріалів, етапів і «пирогів» шарів —
   /assets/build-anim.v1.<мова>.json (з tools/site/buildanim_data.py; версії — рядок VER нижче, його оновлює buildanim.py). Цей файл:
   1) коли блок за ~3 екрани — вантажить CSS і JSON, малює сцену кодом (без картинок і бібліотек) і вмикає «закріплена сцена + доріжка прокрутки»;
   2) прокрутка → прогрес 0…N етапів; деталі етапу зʼявляються по черзі (opacity/translate, згладжування rAF), стіни ростуть рядами;
      на «Інженерних мережах» стіни й дах стають напівпрозорими (видно кабелі, труби, теплу підлогу, вентиляцію);
   3) «пиріг» шарів (стіна, покрівля, підлога, фундамент, вікно): наведення / тап / Tab на шар → опис; на телефоні — кнопка «Пиріг шарів» над сценою;
   4) будинок: перемикач технології стін (газоблок / цегла / каркас / брус) — свої етапи й деталі для кожної технології (по 19 етапів — висота блоку не змінюється);
   5) prefers-reduced-motion — без доріжки й руху: статичні кадри, перемикання степером; клавіатура: «Пропустити анімацію», кнопки етапів (←/→, Home/End).
   CTA — спільний /assets/lead-form.v1.js (.lq-slot → data-source «#build-anim»). Слухач прокрутки працює лише поки блок у кадрі. На LCP не впливає. */
(function () {
  var d = document, W = window;
  if (W.__casBA) return; W.__casBA = 1;
  var secs = [].slice.call(d.querySelectorAll('section.bz[data-bz]'));
  if (!secs.length || !W.fetch || !W.Promise) return;
  var VER = {"en":"ea1a780d","ru":"f6f0e97d","uk":"d881637c"}; /*ver*/
  var MQ = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)');
  var MOB = W.matchMedia && W.matchMedia('(max-width:767px)');
  var lang = (d.documentElement.lang || 'uk').slice(0, 2); if (!VER[lang]) lang = 'uk';
  var MATS = ['block', 'brick', 'frame', 'brus'];
  function cl(ev, v) { try { if (W.clarity) W.clarity('event', ev); if (v && W.clarity) W.clarity('set', ev, v); } catch (e) { } } // аналітика: кінець, CTA, матеріал, пиріг
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- ізометрія: x → вправо-вниз, y → вліво-вниз, z → вгору (1 м = K px) ---------- */
  var K = 18, CX = K * 0.8660254, SY = K * 0.5, ZK = K, bb; // квартира — диметрія «згори» (SY, ZK — у build)
  function P(x, y, z) {
    var a = (x - y) * CX, b = (x + y) * SY - z * ZK;
    if (a < bb[0]) bb[0] = a; if (b < bb[1]) bb[1] = b; if (a > bb[2]) bb[2] = a; if (b > bb[3]) bb[3] = b;
    return a.toFixed(1) + ',' + b.toFixed(1);
  }
  function pp(a) { var o = []; for (var i = 0; i < a.length; i += 3) o.push(P(a[i], a[i + 1], a[i + 2])); return o.join(' '); }
  function pg(c, a) { return '<polygon class="' + c + '" points="' + pp(a) + '"/>'; }
  function pl(c, a) { return '<polyline class="' + c + '" points="' + pp(a) + '"/>'; }
  function ph(c, rings) { // контур з отворами (evenodd)
    return '<path class="' + c + '" fill-rule="evenodd" d="' + rings.map(function (a) { return 'M' + pp(a).replace(/ /g, 'L') + 'Z'; }).join('') + '"/>';
  }
  // прямокутник у площині x=X (грань «r»), y=Y (грань «l»), z=Z (верх «t»)
  function rx(X, y0, y1, z0, z1) { return [X, y0, z0, X, y1, z0, X, y1, z1, X, y0, z1]; }
  function ry(Y, x0, x1, z0, z1) { return [x0, Y, z0, x1, Y, z0, x1, Y, z1, x0, Y, z1]; }
  function rz(Z, x0, x1, y0, y1) { return [x0, y0, Z, x1, y0, Z, x1, y1, Z, x0, y1, Z]; }
  function box(c, x0, x1, y0, y1, z0, z1) { return pg(c + ' t', rz(z1, x0, x1, y0, y1)) + pg(c + ' r', rx(x1, y0, y1, z0, z1)) + pg(c + ' l', ry(y1, x0, x1, z0, z1)); }
  function circ(c, x, y, z, r) { var q = P(x, y, z).split(','); return '<circle class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + r + '"/>'; }
  function txt(c, x, y, z, rot, s) { var q = P(x, y, z).split(','); return '<text class="' + c + '" transform="translate(' + q[0] + ' ' + q[1] + ') rotate(' + rot + ')">' + esc(s) + '</text>'; }
  function tree(x, y, h, r) { return pl('tk', [x, y, 0, x, y, h]) + circ('cr', x, y, h + r / K * 0.9, r) + circ('cr2', x - 0.25, y + 0.25, h + r / K * 1.2, r * 0.55); }
  function clipO(o, z0, z1) { var a = Math.max(o[2], z0), b = Math.min(o[3], z1); return b - a > 0.02 ? [o[0], o[1], a, b] : null; }
  function range(a, b, st) { var o = []; for (var v = a; v <= b + 1e-6; v += st) o.push(+v.toFixed(3)); return o; }
  // кільце стін (x0..x1, y0..y1, товщина t): in — внутрішні грані дальніх стін (малюються перед інтерʼєром), out — верх і зовнішні грані ближніх (після)
  function ring(c, x0, x1, y0, y1, t, z0, z1, OY, OX) {
    var hy = (OY || []).map(function (o) { o = clipO(o, z0, z1); return o && ry(y1, o[0], o[1], o[2], o[3]); }).filter(Boolean);
    var hx = (OX || []).map(function (o) { o = clipO(o, z0, z1); return o && rx(x1, o[0], o[1], o[2], o[3]); }).filter(Boolean);
    return {
      i: pg(c + ' ir', rx(x0 + t, y0 + t, y1 - t, z0, z1)) + pg(c + ' il', ry(y0 + t, x0 + t, x1 - t, z0, z1)),
      o: ph(c + ' t', [rz(z1, x0, x1, y0, y1), rz(z1, x0 + t, x1 - t, y0 + t, y1 - t)]) + ph(c + ' r', [rx(x1, y0, y1, z0, z1)].concat(hx)) + ph(c + ' l', [ry(y1, x0, x1, z0, z1)].concat(hy))
    };
  }
  // ближні грані (фасадні шари) з отворами, відступ D назовні; tri — фронтон на грані x
  function skin(c, x0, x1, y0, y1, D, z0, z1, OY, OX, tri) {
    var hy = OY.map(function (o) { o = clipO(o, z0, z1); return o && ry(y1 + D, o[0], o[1], o[2], o[3]); }).filter(Boolean);
    var hx = OX.map(function (o) { o = clipO(o, z0, z1); return o && rx(x1 + D, o[0], o[1], o[2], o[3]); }).filter(Boolean);
    return ph(c + ' r', [rx(x1 + D, y0 - D, y1 + D, z0, z1)].concat(hx)) + ph(c + ' l', [ry(y1 + D, x0 - D, x1 + D, z0, z1)].concat(hy)) +
      (tri ? pg(c + ' r', [x1 + D, y0 - D, z1, x1 + D, y1 + D, z1, x1 + D, tri[0], tri[1]]) : '');
  }
  function zig(x0, x1, y0, y1, z, st) { var a = [], f = 0; for (var y = y0; y <= y1 + 1e-6; y += st) { a.push(f ? x1 : x0, y, z, f ? x0 : x1, y, z); f = !f; } return a; }

  // візерунки матеріалів в ізометрії: l — грань уздовж x (skewY 30°), r — уздовж y (skewY −30°)
  function pats() {
    var o = '';
    function p(id, w, h, fills, paths) {
      ['l', 'r'].forEach(function (f, i) {
        o += '<pattern id="bz-' + id + '-' + f + '" width="' + w + '" height="' + h + '" patternUnits="userSpaceOnUse" patternTransform="skewY(' + (f === 'l' ? 30 : -30) + ')">' +
          '<rect width="' + w + '" height="' + h + '" fill="' + fills[i] + '"/>' + paths.map(function (q) { return '<path d="' + q[0] + '" stroke="' + q[1] + '" stroke-width="' + (q[2] || 0.6) + '" fill="none"/>'; }).join('') + '</pattern>';
      });
    }
    // газоблок 600×250: ряди по 4.5 px, кожен 4-й ряд — арматура в штробі (жовта лінія)
    p('block', 18.7, 18, ['#bdb6aa', '#9e978c'], [['M0 4.5H18.7M0 9H18.7M0 13.5H18.7M0 4.5V0M9.35 4.5V0M4.67 9V4.5M14 9V4.5M0 13.5V9M9.35 13.5V9M4.67 18V13.5M14 18V13.5', 'rgba(8,7,9,.28)'], ['M0 .5H18.7', '#d9a64e', 0.9]]);
    p('brick', 9, 4.5, ['#9a4a30', '#7d3b26'], [['M0 2.25H9M0 4.5H9M2 0V2.25M6.5 2.25V4.5', 'rgba(232,218,198,.6)', 0.5]]);
    p('brickf', 9, 4.5, ['#c08a5c', '#9f6f48'], [['M0 2.25H9M0 4.5H9M2 0V2.25M6.5 2.25V4.5', 'rgba(250,240,225,.75)', 0.5]]);
    p('wood', 400, 3.6, ['#b07d45', '#8f6236'], [['M0 3.3H400', 'rgba(52,28,10,.7)'], ['M0 3.6H400', 'rgba(232,206,160,.45)', 0.4]]);
    p('board', 400, 4.5, ['#8a6a4e', '#6f533c'], [['M0 4.2H400', 'rgba(20,12,6,.45)']]);
    p('osb', 22.5, 22.5, ['#c9a96e', '#a88a55'], [['M0 22.2H22.5M22.2 0V22.5', 'rgba(60,40,10,.55)'], ['M4 6l3 1M12 4l2 2M6 14l4-1M15 16l2 3M9 10l3 0', 'rgba(110,80,30,.5)', 0.5]]);
    p('wool', 18, 9, ['#d8c46a', '#b9a552'], [['M0 8.7H18M17.7 0V9', 'rgba(90,70,10,.45)'], ['M2 3h4M9 5h5M3 7h3', 'rgba(120,95,20,.35)', 0.4]]);
    p('eps', 18, 9, ['#e9e6df', '#cdc9c1'], [['M0 8.7H18M17.7 0V9', 'rgba(8,7,9,.18)']]);
    p('mb', 30, 12, ['#dfe6ea', '#c3cdd3'], [['M3 6h8M17 6h8', 'rgba(60,90,120,.45)', 0.8]]);
    return o;
  }

  /* ---------- сцена «будинок»: частини в порядку малювання (painter), кожна — етап (ключ + частка), режим, коли зникає ---------- */
  function house(mat, S, ui) {
    var L = [];
    function A(key, fr, v, o) { // key — етап; fr — частка етапу; v — svg або function(k) для «росту»; o: {m:'f'|'d'|'g', h:[ключ, частка], c:'клас'}
      var i = typeof key === 'number' ? key : S(key); if (i < 0 || !v) return;
      o = o || {};
      var e = -1; if (o.h) { var j = S(o.h[0]); if (j >= 0) e = j + (o.h[1] || 0) * 0.6; }
      L.push({ s: i + (fr || 0) * 0.6, v: v, m: typeof v === 'function' ? 'g' : (o.m || 'f'), e: e, c: o.c || '' });
    }
    function B(v, c) { L.push({ s: -9, v: v, m: 'f', e: -1, c: c || '' }); }
    var plate = mat === 'block' || mat === 'frame', brus = mat === 'brus', frame = mat === 'frame', brick = mat === 'brick';
    var Kk = {
      w1: { block: 'b_w1', brick: 'k_w1', frame: 'f_studs', brus: 'r_walls' }[mat], bl: { block: 'belt1', brick: 'k_belt', frame: 'f_osb', brus: 'r_slab' }[mat],
      sl: { block: 'slab', brick: 'slab', frame: 'f_osb', brus: 'r_slab' }[mat], w2: { block: 'b_w2', brick: 'k_w2', frame: 'f_w2', brus: 'r_w2' }[mat],
      raf: brus ? 'r_rafters' : 'rafters', win: brus ? 'r_win' : 'win', fac: { block: 'fac_b', brick: 'fac_k', frame: 'fac_f', brus: 'r_fin' }[mat],
      fd: plate ? 'pour' : 's_pour', scr: { block: 'screed', brick: 'screed', frame: 'f_fin', brus: 'r_fin' }[mat]
    };
    var GX = 16, GY = 13, GZ = -1.2, X0 = 3, X1 = 13, Y0 = 3, Y1 = 10, T = frame ? 0.25 : 0.35;
    var ZP = 0.25, ZB1 = 3.0, ZM = 3.25, ZF2 = 3.5, ZB2 = 5.75, ZT = 6.0, MZ = 6.15, RY = 6.5, RZ = 8.7, O = 0.5;
    var tg = (RZ - MZ) / (RY - Y0), EZ = MZ - O * tg, zr = function (y) { return y < RY ? MZ + (y - Y0) * tg : MZ + (Y1 - y) * tg; };
    var OY = [[4, 7, ZP + 0.85, ZP + 2.35], [8.4, 9.6, ZP, ZP + 2.25], [10.4, 12.2, ZP + 0.85, ZP + 2.35], [4, 6.2, ZF2 + 0.85, ZF2 + 2.1], [7.4, 12.2, ZF2 + 0.85, ZF2 + 2.1]];
    var OX = [[4.2, 6.6, ZP + 0.85, ZP + 2.35], [4.8, 8.4, ZF2 + 0.85, ZF2 + 2.1]];
    var IX0 = X0 + T, IX1 = X1 - T, IY0 = Y0 + T, IY1 = Y1 - T, Sx0 = X0 - 0.3, Sx1 = X1 + 0.3, Sy0 = Y0 - 0.3, Sy1 = Y1 + 0.3;
    var WC = { block: 'wb', brick: 'wk', frame: 'wf', brus: 'wr' }[mat]; // клас стін за матеріалом
    var snap = { block: 0.25, brick: 0.25, frame: 0.25, brus: 0.2 }[mat];

    /* ── ділянка-діорама: ґрунт у розрізі, сітка */
    var grid = '';
    for (var g = 2; g < GX; g += 2) grid += pl('gd', [g, 0, 0, g, GY, 0]);
    for (g = 2; g < GY; g += 2) grid += pl('gd', [0, g, 0, GX, g, 0]);
    B(pg('so r', rx(GX, 0, GY, GZ, 0)) + pg('so l', ry(GY, 0, GX, GZ, 0)) + pl('st', [GX, 0, -0.3, GX, GY, -0.3, 0, GY, -0.3]) + pl('st', [GX, 0, -0.85, GX, GY, -0.85, 0, GY, -0.85]) +
      pg('gr', rz(0, 0, GX, 0, GY)) + grid);
    B('<g class="ghost">' + box('gh', Sx0, Sx1, Sy0, Sy1, 0, ZP) + box('gh', X0, X1, Y0, Y1, ZP, ZT) +
      pg('gh', [X0 - O, RY, RZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ, X0 - O, Y1 + O, EZ]) + pg('gh', [X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ]) + '</g>');

    /* ── котлован / траншеї і шари під фундаментом */
    var PD = -0.8;
    if (plate) {
      A('pit', 0, pg('pf', rz(PD, 2, 14, 2, 11)) + pg('pi r', rx(2, 2, 11, PD, 0)) + pg('pi l', ry(2, 2, 14, PD, 0)) + pl('st', [2, 2, -0.3, 2, 11, -0.3]) + pl('st', [2, 2, -0.3, 14, 2, -0.3]));
      A('base', 0, pg('geo', rz(PD + 0.01, 2, 14, 2, 11)));
      A('base', 0.3, pg('sand', rz(-0.5, 2.2, 13.8, 2.2, 10.8)));
      A('base', 0.6, pg('grv', rz(-0.3, 2.3, 13.7, 2.3, 10.7)));
      if (!frame) {
        var hs = ''; range(3, 13, 1).forEach(function (x) { hs += pl('hsm', [x, 2.45, -0.2, x, 10.55, -0.2]); });
        A('hydro', 0, pg('prep', rz(-0.23, 2.4, 13.6, 2.4, 10.6)));
        A('hydro', 0.35, pg('hyd', rz(-0.2, 2.45, 13.55, 2.45, 10.55)) + hs);
        var xg = ''; range(Sx0 + 1.2, Sx1 - 0.1, 1.2).forEach(function (x) { xg += pl('xg', [x, Sy0, -0.05, x, Sy1, -0.05]); }); range(Sy0 + 0.6, Sy1 - 0.1, 0.6).forEach(function (y) { xg += pl('xg', [Sx0, y, -0.05, Sx1, y, -0.05]); });
        A('hydro', 0.65, pg('xps', rz(-0.05, Sx0, Sx1, Sy0, Sy1)) + xg);
      } else { // УШП: XPS по дну, L-блоки по краях, труби теплої підлоги й вводи — до бетону
        A('ushp', 0, pg('xps', rz(-0.05, Sx0, Sx1, Sy0, Sy1)));
        A('ushp', 0.35, pl('loop', zig(Sx0 + 0.6, Sx1 - 0.6, Sy0 + 0.6, Sy1 - 0.6, 0, 0.35)) + pl('cwp', [6, Sy0 + 0.5, 0, 6, Sy1 + 1.4, 0]) + pl('sw', [9.6, Sy0 + 1.2, 0, 9.6, Sy1 + 1.6, 0]));
      }
      // армування: дві сітки, випуски, опалубка (дальні дошки — до бетону, ближні — після)
      var m1 = '', m2 = '', vy = '';
      range(Sy0 + 0.15, Sy1 - 0.15, 0.4).forEach(function (y) { m1 += pl('rb', [Sx0 + 0.1, y, 0.02, Sx1 - 0.1, y, 0.02]); m2 += pl('rb', [Sx0 + 0.1, y, 0.19, Sx1 - 0.1, y, 0.19]); });
      range(Sx0 + 0.15, Sx1 - 0.15, 0.4).forEach(function (x) { m1 += pl('rb', [x, Sy0 + 0.1, 0.02, x, Sy1 - 0.1, 0.02]); m2 += pl('rb', [x, Sy0 + 0.1, 0.19, x, Sy1 - 0.1, 0.19]); });
      if (!frame) {
        range(X0 + 0.5, X1 - 0.5, 1).forEach(function (x) { vy += pl('vy', [x, Y0 + T / 2, 0.2, x, Y0 + T / 2, 0.95]) + pl('vy', [x, Y1 - T / 2, 0.2, x, Y1 - T / 2, 0.95]); });
        range(Y0 + 0.5, Y1 - 0.5, 1).forEach(function (y) { vy += pl('vy', [X0 + T / 2, y, 0.2, X0 + T / 2, y, 0.95]) + pl('vy', [X1 - T / 2, y, 0.2, X1 - T / 2, y, 0.95]); });
      }
      var fwF = pg('fw r', rx(Sx0 - 0.04, Sy0, Sy1, -0.05, ZP + 0.08)) + pg('fw l', ry(Sy0 - 0.04, Sx0, Sx1, -0.05, ZP + 0.08));
      var fwN = box('fw', Sx1, Sx1 + 0.05, Sy0 - 0.04, Sy1 + 0.05, -0.05, ZP + 0.08) + box('fw', Sx0 - 0.04, Sx1, Sy1, Sy1 + 0.05, -0.05, ZP + 0.08);
      if (frame) { // L-блоки XPS по краю УШП замість опалубки
        var lb = ring('xpe', Sx0, Sx1, Sy0, Sy1, 0.2, -0.05, ZP, [], []);
        A('ushp', 0, lb.i); A('ushp', 0.6, m2);
      } else { A('rebar', 0, fwF, { h: [Kk.w1, 0] }); A('rebar', 0, m1); A('rebar', 0.35, m2); }
      A(Kk.fd, 0, function (k) { if (k <= 0) return ''; var z = -0.05 + (ZP + 0.05) * k; return frame ? pg('fd t', rz(Math.max(z, -0.04), Sx0 + 0.2, Sx1 - 0.2, Sy0 + 0.2, Sy1 - 0.2)) : box('fd', Sx0, Sx1, Sy0, Sy1, -0.05, Math.max(z, -0.04)); });
      if (frame) A('ushp', 0, lb.o); else { A('rebar', 0.65, vy, { h: [Kk.w1, 0.4] }); A('rebar', 0, fwN, { h: [Kk.w1, 0] }); }
      A(Kk.w1, 0, ph('bf', [rz(0, 2, 14, 2, 11), rz(0, Sx0, Sx1, Sy0, Sy1)]));
      B(ph('bf', [rz(0, 0, GX, 0, GY), rz(0, 0, 14, 0, 11)]) + pl('gd', [14, 0, 0, 14, 11, 0, 0, 11, 0])); // ґрунт перед котлованом закриває нижні шари
    } else { // стрічка: траншеї, подушка, опалубка, каркас, бетон, гідроізоляція й XPS по цоколю, засипка
      var R = [X0 - 0.55, X1 + 0.55, Y0 - 0.55, Y1 + 0.55], I = [X0 + 0.55, X1 - 0.55, Y0 + 0.55, Y1 - 0.55], SR = [X0 - 0.25, X1 + 0.25, Y0 - 0.25, Y1 + 0.25];
      A('trench', 0, ph('pf', [rz(0, R[0], R[1], R[2], R[3]), rz(0, I[0], I[1], I[2], I[3])]) + pg('pi r', rx(R[0], R[2], R[3], PD, 0)) + pg('pi l', ry(R[2], R[0], R[1], PD, 0)) +
        pg('pi r', rx(I[1], I[2], I[3], PD, 0)) + pg('pi l', ry(I[3], I[0], I[1], PD, 0)));
      A('base', 0, ph('sand', [rz(0, R[0] + 0.05, R[1] - 0.05, R[2] + 0.05, R[3] - 0.05), rz(0, I[0] - 0.05, I[1] + 0.05, I[2] - 0.05, I[3] + 0.05)]));
      A('base', 0.5, ph('grv', [rz(0, R[0] + 0.15, R[1] - 0.15, R[2] + 0.15, R[3] - 0.15), rz(0, I[0] - 0.15, I[1] + 0.15, I[2] - 0.15, I[3] + 0.15)]));
      var cg = '';
      [[-0.13, 0.05], [0.13, 0.05], [-0.13, 0.2], [0.13, 0.2]].forEach(function (q) {
        var a = X0 + q[0], b = X1 - q[0], c = Y0 + q[0], e2 = Y1 - q[0];
        cg += pl('rb', [a, c, q[1], b, c, q[1], b, e2, q[1], a, e2, q[1], a, c, q[1]]);
      });
      range(X0, X1, 0.5).forEach(function (x) { cg += pl('rb', [x, Y0 - 0.13, 0.05, x, Y0 - 0.13, 0.2]) + pl('rb', [x, Y1 + 0.13, 0.05, x, Y1 + 0.13, 0.2]); });
      range(Y0, Y1, 0.5).forEach(function (y) { cg += pl('rb', [X1 + 0.13, y, 0.05, X1 + 0.13, y, 0.2]); });
      var fwS = box('fw', SR[0] - 0.05, SR[0], SR[2], SR[3], 0, ZP + 0.08) + box('fw', SR[0], SR[1], SR[2] - 0.05, SR[2], 0, ZP + 0.08) +
        box('fw', X0 + 0.25, X1 - 0.25, Y0 + 0.25, Y0 + 0.3, 0, ZP + 0.08) + box('fw', X0 + 0.25, X0 + 0.3, Y0 + 0.3, Y1 - 0.25, 0, ZP + 0.08);
      var fwSN = box('fw', X1 - 0.3, X1 - 0.25, Y0 + 0.3, Y1 - 0.25, 0, ZP + 0.08) + box('fw', X0 + 0.25, X1 - 0.3, Y1 - 0.3, Y1 - 0.25, 0, ZP + 0.08) +
        box('fw', SR[1], SR[1] + 0.05, SR[2] - 0.05, SR[3], 0, ZP + 0.08) + box('fw', SR[0] - 0.05, SR[1] + 0.05, SR[3], SR[3] + 0.05, 0, ZP + 0.08);
      A('s_rebar', 0, fwS, { h: ['s_hydro', 0] }); A('s_rebar', 0.4, cg);
      var sr = function (k) { if (k <= 0) return ''; var z = Math.max(0.02, ZP * k), q = ring('fd', SR[0], SR[1], SR[2], SR[3], 0.5, 0, z, [], []); return q.i + q.o; };
      A('s_pour', 0, sr);
      A('s_rebar', 0, fwSN, { h: ['s_hydro', 0] });
      A('s_hydro', 0, pg('bit r', rx(SR[1] + 0.01, SR[2], SR[3] + 0.01, 0, ZP)) + pg('bit l', ry(SR[3] + 0.01, SR[0], SR[1] + 0.01, 0, ZP)));
      A('s_hydro', 0.35, pg('xpsv r', rx(SR[1] + 0.09, SR[2], SR[3] + 0.09, 0, ZP)) + pg('xpsv l', ry(SR[3] + 0.09, SR[0], SR[1] + 0.09, 0, ZP)) + pg('xpsv t', rz(ZP, SR[0], SR[1] + 0.09, SR[3], SR[3] + 0.09)) + pg('xpsv t', rz(ZP, SR[1], SR[1] + 0.09, SR[2], SR[3])));
      A('s_hydro', 0.7, ph('bf', [rz(0.005, R[0] - 0.05, R[1] + 0.05, R[2] - 0.05, R[3] + 0.05), rz(0.005, SR[0], SR[1] + 0.1, SR[2], SR[3] + 0.1)]) + ph('bf', [rz(0.005, X0 + 0.25, X1 - 0.25, Y0 + 0.25, Y1 - 0.25)]));
    }
    // екскаватор і відвал ґрунту
    A(plate ? 'pit' : 'trench', 0, pg('heap', [0.4, 2.2, 0, 1.5, 0.6, 0, 1.9, 2, 0.9]) + pg('heap2', [0.4, 2.2, 0, 1.9, 2, 0.9, 1.9, 3.6, 0]), { h: [Kk.w1, 0.5] });
    /* ── благоустрій на рівні землі: газон, відмостка, доріжка */
    A('land', 0, ph('lawn', [rz(0.004, 0.1, GX - 0.1, 0.1, GY - 0.1), rz(0.004, X0 - 1.0, X1 + 1.0, Y0 - 1.0, Y1 + 1.0)]));
    A('land', 0, ph('pave', [rz(0.02, X0 - 0.9, X1 + 0.9, Y0 - 0.9, Y1 + 0.9), rz(0.02, X0 - 0.2, X1 + 0.2, Y0 - 0.2, Y1 + 0.2)]) + pg('pave', rz(0.02, 8.2, 9.8, Y1 + 0.9, GY - 0.05)) + pg('pave', rz(0.02, 9.8, 14.5, 11.4, 12.4)));
    A('land', 0.3, tree(1.1, 4.2, 1.2, 16), { m: 'd' }); // дерево за будинком — до стін (painter)
    /* ── геодезія: осі, обноска з причалками, тахеометр, розміри */
    var ob = '', OB = [X0 - 1.4, X1 + 1.4, Y0 - 1.4, Y1 + 1.4];
    range(OB[0], OB[1], 2.4).concat([OB[1]]).forEach(function (x) { ob += pl('stk', [x, OB[2], 0, x, OB[2], 0.8]); });
    range(OB[2], OB[3], 2.3).concat([OB[3]]).forEach(function (y) { ob += pl('stk', [OB[0], y, 0, OB[0], y, 0.8]); });
    ob += pl('obn', [OB[0], OB[2], 0.7, OB[1], OB[2], 0.7]) + pl('obn', [OB[0], OB[2], 0.7, OB[0], OB[3], 0.7]);
    [X0, X1].forEach(function (x) { ob += pl('str', [x, OB[2], 0.74, x, OB[3], 0.74]); });
    [Y0, Y1].forEach(function (y) { ob += pl('str', [OB[0], y, 0.74, OB[1], y, 0.74]); });
    var obN = pl('obn', [OB[0], OB[3], 0.7, OB[1], OB[3], 0.7]) + pl('obn', [OB[1], OB[2], 0.7, OB[1], OB[3], 0.7]);
    range(OB[0], OB[1], 2.4).concat([OB[1]]).forEach(function (x) { obN += pl('stk', [x, OB[3], 0, x, OB[3], 0.8]); });
    range(OB[2], OB[3], 2.3).forEach(function (y) { obN += pl('stk', [OB[1], y, 0, OB[1], y, 0.8]); });
    var ax = ''; [X0, X1].forEach(function (x) { ax += pl('ax', [x, 0.3, 0, x, GY - 0.3, 0]); }); [Y0, Y1].forEach(function (y) { ax += pl('ax', [0.3, y, 0, GX - 0.3, y, 0]); });
    A('geo', 0, ax, { h: [plate ? 'pit' : 'trench', 0.3] });
    A('geo', 0.3, ob + obN, { h: [Kk.fd, 0.9] });
    A('geo', 0.5, pl('dim', [X0, 12.3, 0, X1, 12.3, 0]) + pl('dim', [X0, 12, 0, X0, 12.6, 0]) + pl('dim', [X1, 12, 0, X1, 12.6, 0]) + txt('dt', 7.3, 13.1, 0, 30, '10,0') +
      pl('dim', [15.2, Y0, 0, 15.2, Y1, 0]) + pl('dim', [14.9, Y0, 0, 15.5, Y0, 0]) + pl('dim', [14.9, Y1, 0, 15.5, Y1, 0]) + txt('dt', 15.9, 6.1, 0, -30, '7,0'), { h: ['base', 0] });

    /* ── 1 поверх: підлога, внутрішні грані, мережі, штукатурка, інтерʼєр */
    if (!plate) {
      if (brus) A('r_crown', 0.5, pg('dk', rz(ZP + 0.2, IX0, IX1, IY0, IY1)) + (function () { var s = ''; range(IX0 + 0.4, IX1 - 0.2, 0.4).forEach(function (x) { s += pl('dkl', [x, IY0, ZP + 0.2, x, IY1, ZP + 0.2]); }); return s; })());
      else { A('mep', 0, pg('sub', rz(ZP, IX0, IX1, IY0, IY1))); A('mep', 0.15, pg('xps', rz(ZP + 0.02, IX0, IX1, IY0, IY1))); }
    }
    if (!frame && !brus) A('mep', 0.3, pl('loop', zig(IX0 + 0.35, IX1 - 0.35, IY0 + 0.35, IY1 - 0.35, ZP + 0.04, 0.32)));
    if (!brus && !frame) A('screed', 0, pg('scr', rz(ZP + 0.07, IX0, IX1, IY0, IY1)));
    A('int', 0, (function () { var s = pg('flw', rz(ZP + 0.09, IX0, IX1, IY0, IY1)); range(IX0 + 0.5, IX1 - 0.1, 0.5).forEach(function (x) { s += pl('flwl', [x, IY0, ZP + 0.09, x, IY1, ZP + 0.09]); }); return s; })());
    var WT1 = brus ? ZM : ZB1;
    var w1i = function (k) { var z = ZP + Math.round((WT1 - ZP) * k / snap) * snap; return z > ZP + 0.01 ? ring(WC, X0, X1, Y0, Y1, T, ZP, z, OY, OX).i : ''; };
    var w1o = function (k) {
      var z = ZP + Math.round((WT1 - ZP) * k / snap) * snap; if (z <= ZP + 0.01) return '';
      var q = ring(WC, X0, X1, Y0, Y1, T, ZP, z, OY, OX).o;
      if (!brus) OY.concat([]).forEach(function (o) { if (o[3] < ZB1 && z >= o[3] + 0.25) q += pg('lnt l', ry(Y1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
      if (!brus) OX.forEach(function (o) { if (o[3] < ZB1 && z >= o[3] + 0.25) q += pg('lnt r', rx(X1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
      if (brus) q += logEnds(ZP, z);
      return q;
    };
    function logEnds(z0, z1) { // кути зрубу «в чашу»: торці вінців виступають
      var s = '', r = 0;
      for (var z = z0; z < z1 - 0.01; z += 0.2, r++) {
        var a = Math.min(z + 0.2, z1);
        s += r % 2 ? box('le', X1 - T, X1, Y1, Y1 + 0.25, z, a) + box('le', X1 - T, X1, Y0 - 0.25, Y0, z, a) : box('le', X1, X1 + 0.25, Y1 - T, Y1, z, a) + box('le', X0 - 0.25, X0, Y1 - T, Y1, z, a);
      }
      return s;
    }
    // каркас: стійки (дальні — до інтерʼєру, ближні — після), обвʼязки, ригелі
    function studs(z0, z1, near, OYf, OXf) {
      var s = [], h = 0.12, w = T;
      function inO(v, os) { return os.some(function (o) { return v > o[0] - 0.05 && v < o[1] + 0.05 && o[2] < z1 && o[3] > z0; }); }
      if (!near) {
        range(X0 + 0.1, X1 - 0.1, 0.6).forEach(function (x) { s.push([x + Y0, box('stud', x - h / 2, x + h / 2, Y0, Y0 + w, z0, z1)]); });
        range(Y0 + 0.6, Y1 - 0.1, 0.6).forEach(function (y) { s.push([X0 + y, box('stud', X0, X0 + w, y - h / 2, y + h / 2, z0, z1)]); });
      } else {
        range(Y0 + 0.3, Y1 - 0.1, 0.6).forEach(function (y) { if (!inO(y, OXf)) s.push([X1 + y, box('stud', X1 - w, X1, y - h / 2, y + h / 2, z0, z1)]); });
        range(X0 + 0.3, X1 - 0.1, 0.6).forEach(function (x) { if (!inO(x, OYf)) s.push([x + Y1, box('stud', x - h / 2, x + h / 2, Y1 - w, Y1, z0, z1)]); });
        OYf.forEach(function (o) {
          if (o[3] <= z0 || o[2] >= z1) return;
          s.push([o[0] + Y1, box('stud', o[0] - 0.14, o[0], Y1 - w, Y1, z0, z1)]); s.push([o[1] + Y1, box('stud', o[1], o[1] + 0.14, Y1 - w, Y1, z0, z1)]);
          s.push([o[0] + Y1 + 0.5, box('hdr', o[0] - 0.14, o[1] + 0.14, Y1 - w, Y1, o[3], o[3] + 0.22)]);
          if (o[2] > z0 + 0.1) s.push([o[0] + Y1 + 0.5, box('hdr', o[0], o[1], Y1 - w, Y1, o[2] - 0.08, o[2])]);
        });
        OXf.forEach(function (o) {
          if (o[3] <= z0 || o[2] >= z1) return;
          s.push([X1 + o[0], box('stud', X1 - w, X1, o[0] - 0.14, o[0], z0, z1)]); s.push([X1 + o[1], box('stud', X1 - w, X1, o[1], o[1] + 0.14, z0, z1)]);
          s.push([X1 + o[1] + 0.5, box('hdr', X1 - w, X1, o[0] - 0.14, o[1] + 0.14, o[3], o[3] + 0.22)]);
          if (o[2] > z0 + 0.1) s.push([X1 + o[1] + 0.5, box('hdr', X1 - w, X1, o[0], o[1], o[2] - 0.08, o[2])]);
        });
        s.push([X1 + Y1 + 1, box('stud', X1 - 0.18, X1, Y1 - 0.18, Y1, z0, z1)]);
      }
      return s.sort(function (a, b) { return a[0] - b[0]; }).map(function (q) { return q[1]; }).join('');
    }
    var o1 = OY.filter(function (o) { return o[3] < ZB1; }), x1o = OX.filter(function (o) { return o[3] < ZB1; }), o2 = OY.filter(function (o) { return o[2] > ZF2; }), x2o = OX.filter(function (o) { return o[2] > ZF2; });
    if (frame) {
      var bp = ring('pla', X0, X1, Y0, Y1, T, ZP, ZP + 0.15, [], []);
      A('f_plate', 0, bp.i);
      A('f_ins', 0, pg('wool r', rx(IX0 - 0.05, IY0 - 0.05, IY1, ZP + 0.15, ZB1)) + pg('wool l', ry(IY0 - 0.05, IX0 - 0.05, IX1, ZP + 0.15, ZB1)));
      A('f_studs', 0, studs(ZP + 0.15, ZM - 0.15, 0, o1, x1o), { m: 'd' });
      var tp1 = ring('pla', X0, X1, Y0, Y1, T, ZM - 0.15, ZM, [], []); A('f_studs', 0.6, tp1.i);
      A('f_ins', 0.6, pg('vb', rx(IX0 + 0.01, IY0, IY1, ZP + 0.15, ZM - 0.15)) + pg('vb', ry(IY0 + 0.01, IX0, IX1, ZP + 0.15, ZM - 0.15)));
      A('f_fin', 0.4, pg('gkl r', rx(IX0 + 0.06, IY0 + 0.05, IY1, ZP + 0.15, ZM - 0.15)) + pg('gkl l', ry(IY0 + 0.06, IX0 + 0.05, IX1, ZP + 0.15, ZM - 0.15)));
    } else {
      if (brus) { var cr = ring('wr', X0, X1, Y0, Y1, T, ZP, ZP + 0.2, [], []); A('r_crown', 0, cr.i); }
      A(Kk.w1, 0, function (k) { return w1i(k); });
      if (!brus) A(Kk.bl, 0, ring('blt', X0, X1, Y0, Y1, T, ZB1, ZM, [], []).i);
    }
    // мережі в стінах (до штукатурки), штукатурка, потім прилади на стінах
    var cab = pl('el', [IX0 + 0.01, IY0 + 0.2, ZP + 2.45, IX0 + 0.01, IY1 - 0.2, ZP + 2.45]) + pl('el', [IX0 + 0.2, IY0 + 0.01, ZP + 2.45, IX1 - 0.2, IY0 + 0.01, ZP + 2.45]);
    [4.4, 6.2, 8.4].forEach(function (y) { cab += pl('el', [IX0 + 0.01, y, ZP + 2.45, IX0 + 0.01, y, ZP + 0.35]); });
    [5, 7.6, 10.2].forEach(function (x) { cab += pl('el', [x, IY0 + 0.01, ZP + 2.45, x, IY0 + 0.01, ZP + (x > 7 ? 1.1 : 0.35)]); });
    var pipes = pl('hw', [11.7, IY0 + 0.05, ZP + 1.3, 11.7, IY0 + 0.05, ZP + 0.5, 10.6, IY0 + 0.05, ZP + 0.5]) + pl('cwp', [11.95, IY0 + 0.05, ZP + 1.3, 11.95, IY0 + 0.05, ZP + 0.35, 6.2, IY0 + 0.05, ZP + 0.35, 6.2, IY0 + 0.05, ZP + 1.0]) +
      pl('sw', [6.6, IY0 + 0.3, ZP + 0.05, 6.6, IY1 + 1.2, ZP + 0.05]);
    A('mep', 0, cab + (brus ? '' : pipes), { c: 'net' });
    if (!frame && !brus) A('screed', 0.5, pg('plw r', rx(IX0 + 0.02, IY0 + 0.02, IY1, ZP + 0.07, ZB1)) + pg('plw l', ry(IY0 + 0.02, IX0 + 0.02, IX1, ZP + 0.07, ZB1)));
    if (brus) A('r_fin', 0.3, pg('lz r', rx(IX0 + 0.01, IY0, IY1, ZP + 0.2, ZM)) + pg('lz l', ry(IY0 + 0.01, IX0, IX1, ZP + 0.2, ZM)));
    var dev = box('pan', IX0, IX0 + 0.12, 4.2, 4.8, ZP + 1.3, ZP + 1.95) + box('blr', 11.4, 12.2, IY0, IY0 + 0.35, ZP + 1.3, ZP + 2.15) + box('col', 10.2, 11, IY0, IY0 + 0.15, ZP + 0.3, ZP + 0.8);
    if (brus) dev = box('pan', IX0, IX0 + 0.12, 4.2, 4.8, ZP + 1.3, ZP + 1.95) + box('rad', 5, 6.6, IY0, IY0 + 0.1, ZP + 0.3, ZP + 0.8) + box('rad', 9, 10.6, IY0, IY0 + 0.1, ZP + 0.3, ZP + 0.8) + pl('cwp', [5, IY0 + 0.12, ZP + 0.25, 10.6, IY0 + 0.12, ZP + 0.25]);
    A('mep', 0.3, dev);
    A('int', 0.3, box('kb', 8.2, 11.2, IY0, IY0 + 0.6, ZP + 0.1, ZP + 0.95) + box('ct', 8.15, 11.25, IY0, IY0 + 0.65, ZP + 0.95, ZP + 1.0) + box('kw', 8.2, 11.2, IY0, IY0 + 0.35, ZP + 1.55, ZP + 2.3) +
      box('sf', 4.2, 6.6, 6.6, 7.4, ZP + 0.1, ZP + 0.45) + box('sf', 4.2, 6.6, 6.4, 6.6, ZP + 0.1, ZP + 0.85) + box('tb', 8.6, 10.4, 6, 7, ZP + 0.72, ZP + 0.78) + pl('lg', [8.8, 6.9, ZP + 0.1, 8.8, 6.9, ZP + 0.72]) + pl('lg', [10.2, 6.9, ZP + 0.1, 10.2, 6.9, ZP + 0.72]));
    // ближні стіни 1 поверху
    if (frame) {
      A('f_plate', 0, bp.o);
      A('f_studs', 0, studs(ZP + 0.15, ZM - 0.15, 1, o1, x1o), { m: 'd', c: 'ow' });
      A('f_studs', 0.6, tp1.o, { m: 'd', c: 'ow' });
      A('f_osb', 0, skin('osb', X0, X1, Y0, Y1, 0.01, ZP, ZM, o1, x1o), { c: 'ow' });
    } else {
      if (brus) A('r_crown', 0, cr.o, { c: 'ow' });
      A(Kk.w1, 0, function (k) { return w1o(k); }, { c: 'ow' });
      if (!brus) A(Kk.bl, 0, ring('blt', X0, X1, Y0, Y1, T, ZB1, ZM, [], []).o, { c: 'ow' });
    }
    /* ── перекриття */
    if (frame) A('f_osb', 0.5, box('jst', X0, X1, Y0, Y1, ZM - 0.15, ZF2) + (function () { var s = ''; range(X0 + 0.6, X1 - 0.3, 0.6).forEach(function (x) { s += pl('jsl', [x, Y0, ZF2, x, Y1, ZF2]); }); return s; })(), { m: 'd' });
    else if (brus) A('r_slab', 0, box('wsl', X0, X1, Y0, Y1, ZM, ZF2) + (function () { var s = ''; range(X0 + 0.8, X1 - 0.4, 0.8).forEach(function (x) { s += pg('bme', ry(Y1 + 0.01, x - 0.1, x + 0.1, ZM + 0.02, ZF2 - 0.03)); }); return s; })(), { m: 'd' });
    else A('slab', 0, box('sl', X0, X1, Y0, Y1, ZM, ZF2) + (function () { var s = ''; range(X0 + 1.2, X1 - 0.2, 1.2).forEach(function (x) { s += pl('slj', [x, Y0, ZF2, x, Y1, ZF2]); }); return s; })(), { m: 'd' });
    /* ── 2 поверх */
    var w2s = Kk.w2;
    if (!frame && !brus) { A('screed', 0, pg('scr', rz(ZF2 + 0.06, IX0, IX1, IY0, IY1))); }
    A('int', 0, pg('flw', rz(ZF2 + 0.08, IX0, IX1, IY0, IY1)));
    var w2i = function (k) { var z = ZF2 + Math.round((ZB2 - ZF2) * k / snap) * snap; return z > ZF2 + 0.01 ? ring(WC, X0, X1, Y0, Y1, T, ZF2, z, OY, OX).i : ''; };
    var w2o = function (k) {
      var z = ZF2 + Math.round((ZB2 - ZF2) * k / snap) * snap; if (z <= ZF2 + 0.01) return '';
      var q = ring(WC, X0, X1, Y0, Y1, T, ZF2, z, OY, OX).o;
      if (!brus) o2.forEach(function (o) { if (z >= o[3] + 0.25) q += pg('lnt l', ry(Y1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
      if (!brus) x2o.forEach(function (o) { if (z >= o[3] + 0.25) q += pg('lnt r', rx(X1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
      if (brus) q += logEnds(ZF2, z);
      return q;
    };
    if (frame) {
      A('f_w2', 0, ring('pla', X0, X1, Y0, Y1, T, ZF2, ZF2 + 0.15, [], []).i);
      A('f_ins', 0, pg('wool r', rx(IX0 - 0.05, IY0 - 0.05, IY1, ZF2 + 0.15, ZB2)) + pg('wool l', ry(IY0 - 0.05, IX0 - 0.05, IX1, ZF2 + 0.15, ZB2)));
      A('f_w2', 0, studs(ZF2 + 0.15, ZT - 0.15, 0, o2, x2o), { m: 'd' });
      A('f_ins', 0.6, pg('vb', rx(IX0 + 0.01, IY0, IY1, ZF2 + 0.15, ZT - 0.15)) + pg('vb', ry(IY0 + 0.01, IX0, IX1, ZF2 + 0.15, ZT - 0.15)));
      A('f_fin', 0.4, pg('gkl r', rx(IX0 + 0.06, IY0 + 0.05, IY1, ZF2 + 0.15, ZT - 0.15)) + pg('gkl l', ry(IY0 + 0.06, IX0 + 0.05, IX1, ZF2 + 0.15, ZT - 0.15)));
    } else {
      A(w2s, 0, function (k) { return w2i(k); });
      if (!brus) A(w2s, 0.75, ring('blt', X0, X1, Y0, Y1, T, ZB2, ZT, [], []).i);
      else A(w2s, 0, function (k) { return k > 0.99 ? ring('wr', X0, X1, Y0, Y1, T, ZB2, ZT, [], []).i : ''; });
    }
    var cab2 = pl('el', [IX0 + 0.01, IY0 + 0.2, ZF2 + 2.2, IX0 + 0.01, IY1 - 0.2, ZF2 + 2.2]) + pl('el', [IX0 + 0.2, IY0 + 0.01, ZF2 + 2.2, IX1 - 0.2, IY0 + 0.01, ZF2 + 2.2]);
    [5, 8].forEach(function (y) { cab2 += pl('el', [IX0 + 0.01, y, ZF2 + 2.2, IX0 + 0.01, y, ZF2 + 0.35]); });
    A('mep', 0, cab2, { c: 'net' });
    if (!frame && !brus) A('screed', 0.5, pg('plw r', rx(IX0 + 0.02, IY0 + 0.02, IY1, ZF2 + 0.06, ZB2)) + pg('plw l', ry(IY0 + 0.02, IX0 + 0.02, IX1, ZF2 + 0.06, ZB2)));
    if (brus) A('r_fin', 0.3, pg('lz r', rx(IX0 + 0.01, IY0, IY1, ZF2, ZT)) + pg('lz l', ry(IY0 + 0.01, IX0, IX1, ZF2, ZT)));
    // вентиляція: рекуператор і повітроводи під стелею 2 поверху, стояк — на дах
    A('mep', 0.45, box('duct', IX0 + 0.6, IX1 - 1.4, IY0, IY0 + 0.3, ZB2 - 0.45, ZB2 - 0.2) + box('rec', IX1 - 1.4, IX1 - 0.4, IY0, IY0 + 0.55, ZB2 - 0.75, ZB2 - 0.15) + box('duct', IX0 + 0.6, IX0 + 0.9, IY0, IY0 + 0.3, ZF2, ZB2 - 0.2), { c: 'net' });
    A('int', 0.3, box('bed', 4.6, 6.8, 5.2, 7.4, ZF2 + 0.1, ZF2 + 0.5) + box('bed', 4.6, 4.75, 5.2, 7.4, ZF2 + 0.1, ZF2 + 1.0) + box('wrd', 9.4, 12.2, IY0, IY0 + 0.6, ZF2 + 0.1, ZF2 + 2.2));
    if (frame) {
      A('f_w2', 0, ring('pla', X0, X1, Y0, Y1, T, ZF2, ZF2 + 0.15, [], []).o, { c: 'ow' });
      A('f_w2', 0, studs(ZF2 + 0.15, ZT - 0.15, 1, o2, x2o), { m: 'd', c: 'ow' });
      A('f_w2', 0.5, skin('osb', X0, X1, Y0, Y1, 0.01, ZF2 - 0.25, ZT, o2, x2o), { c: 'ow' });
      A('f_w2', 0.7, ring('pla', X0, X1, Y0, Y1, T, ZT - 0.15, ZT, [], []).o + box('mlt', X0 + 0.02, X1 - 0.02, Y0 + 0.03, Y0 + 0.23, ZT, MZ) + box('mlt', X0 + 0.02, X1 - 0.02, Y1 - 0.23, Y1 - 0.03, ZT, MZ), { c: 'ow' });
    } else {
      A(w2s, 0, function (k) { return w2o(k); }, { c: 'ow' });
      if (!brus) {
        A(w2s, 0.75, ring('blt', X0, X1, Y0, Y1, T, ZB2, ZT, [], []).o + box('pin', X0 + 0.15, X1 - 0.15, Y0 + 0.12, Y0 + 0.14, ZT, ZT + 0.12), { c: 'ow' });
        A(w2s, 0.9, box('mlt', X0 + 0.02, X1 - 0.02, Y0 + 0.03, Y0 + 0.23, ZT, MZ) + box('mlt', X0 + 0.02, X1 - 0.02, Y1 - 0.23, Y1 - 0.03, ZT, MZ), { m: 'd', c: 'ow' });
      } else A(w2s, 0, function (k) { return k > 0.99 ? ring('wr', X0, X1, Y0, Y1, T, ZB2, ZT, [], []).o + logEnds(ZB2, ZT) : ''; }, { c: 'ow' });
    }
    // фронтон (грань x = X1) — стіновий матеріал або ОСБ, потім фасад
    var gab = [X1, Y0, MZ, X1, Y1, MZ, X1, RY, RZ - 0.15];
    A(Kk.raf, 0, pg((frame ? 'osb' : WC) + ' r', gab), { c: 'ow' });
    /* ── вікна: склопакети, рами, стрічки теплого монтажу; світло у вікнах */
    var wn = '', tp = '', gw = '', ok = '';
    OY.forEach(function (o, i) {
      if (i === 1) { wn += pg('dr', ry(Y1 + 0.01, o[0], o[1], o[2], o[3])) + pl('mu', [o[1] - 0.2, Y1 + 0.01, o[2] + 1.0, o[1] - 0.2, Y1 + 0.01, o[2] + 1.15]); }
      else { wn += pg('gl', ry(Y1 + 0.01, o[0], o[1], o[2], o[3])) + pl('fr', [o[0], Y1 + 0.01, o[2], o[1], Y1 + 0.01, o[2], o[1], Y1 + 0.01, o[3], o[0], Y1 + 0.01, o[3], o[0], Y1 + 0.01, o[2]]); if (o[1] - o[0] > 2) wn += pl('mu', [(o[0] + o[1]) / 2, Y1 + 0.01, o[2], (o[0] + o[1]) / 2, Y1 + 0.01, o[3]]); gw += pg('glw', ry(Y1 + 0.02, o[0] + 0.08, o[1] - 0.08, o[2] + 0.08, o[3] - 0.08)); }
      tp += ph('tape', [ry(Y1 + 0.015, o[0] - 0.1, o[1] + 0.1, o[2] - (i === 1 ? 0 : 0.1), o[3] + 0.1), ry(Y1 + 0.015, o[0], o[1], o[2], o[3])]);
      ok += ph('oks', [ry(Y1 + 0.02, o[0] - 0.12, o[1] + 0.12, o[2] - (i === 1 ? 0 : 0.12), o[3] + 0.16), ry(Y1 + 0.02, o[0], o[1], o[2], o[3])]);
    });
    OX.forEach(function (o) {
      wn += pg('gl r', rx(X1 + 0.01, o[0], o[1], o[2], o[3])) + pl('fr', [X1 + 0.01, o[0], o[2], X1 + 0.01, o[1], o[2], X1 + 0.01, o[1], o[3], X1 + 0.01, o[0], o[3], X1 + 0.01, o[0], o[2]]) + pl('mu', [X1 + 0.01, (o[0] + o[1]) / 2, o[2], X1 + 0.01, (o[0] + o[1]) / 2, o[3]]);
      gw += pg('glw', rx(X1 + 0.02, o[0] + 0.08, o[1] - 0.08, o[2] + 0.08, o[3] - 0.08));
      tp += ph('tape', [rx(X1 + 0.015, o[0] - 0.1, o[1] + 0.1, o[2] - 0.1, o[3] + 0.1), rx(X1 + 0.015, o[0], o[1], o[2], o[3])]);
      ok += ph('oks', [rx(X1 + 0.02, o[0] - 0.12, o[1] + 0.12, o[2] - 0.12, o[3] + 0.16), rx(X1 + 0.02, o[0], o[1], o[2], o[3])]);
    });
    if (brus) A('r_win', 0, ok, { c: 'ow' });
    A(Kk.win, brus ? 0.35 : 0, wn, { c: 'ow' });
    A(Kk.win, brus ? 0.6 : 0.4, tp, { c: 'ow', h: [Kk.fac, frame ? 0.45 : 0.1] });
    /* ── фасад */
    var D = { block: 0.12, brick: 0.2, frame: 0.1, brus: 0.005 }[mat], gt = [RY, RZ - 0.3];
    if (mat === 'block') {
      A('fac_b', 0, skin('ins', X0, X1, Y0, Y1, D, ZP + 0.3, MZ, OY, OX, gt) + pg('xpsv r', rx(X1 + D, Y0 - D, Y1 + D, ZP - 0.25, ZP + 0.3)) + pg('xpsv l', ry(Y1 + D, X0 - D, X1 + D, ZP - 0.25, ZP + 0.3)), { c: 'ow' });
      A('fac_b', 0.5, skin('rnd', X0, X1, Y0, Y1, D + 0.01, ZP + 0.3, MZ, OY, OX, gt) + pg('plt r', rx(X1 + D + 0.01, Y0 - D, Y1 + D + 0.01, ZP - 0.25, ZP + 0.3)) + pg('plt l', ry(Y1 + D + 0.01, X0 - D, X1 + D + 0.01, ZP - 0.25, ZP + 0.3)), { c: 'ow' });
    } else if (brick) {
      A('fac_k', 0, skin('wool', X0, X1, Y0, Y1, 0.1, ZP, MZ, OY, OX, gt), { c: 'ow' });
      A('fac_k', 0.45, skin('fbr', X0, X1, Y0, Y1, D, ZP - 0.1, MZ, OY, OX, gt), { c: 'ow' });
    } else if (frame) {
      A('f_ins', 0.3, skin('mb', X0, X1, Y0, Y1, 0.04, ZP, MZ, OY, OX, gt), { c: 'ow' });
      var bt = ''; range(Y0 + 0.2, Y1, 0.6).forEach(function (y) { bt += pl('bat', [X1 + 0.07, y, ZP, X1 + 0.07, y, ZT]); }); range(X0 + 0.2, X1, 0.6).forEach(function (x) { bt += pl('bat', [x, Y1 + 0.07, ZP, x, Y1 + 0.07, ZT]); });
      A('fac_f', 0, bt, { c: 'ow' });
      A('fac_f', 0.45, skin('clad', X0, X1, Y0, Y1, D, ZP, MZ, OY, OX, gt) + pg('plt r', rx(X1 + D, Y0 - D, Y1 + D, ZP - 0.25, ZP)) + pg('plt l', ry(Y1 + D, X0 - D, X1 + D, ZP - 0.25, ZP)), { c: 'ow' });
    } else A('r_fin', 0, skin('lz', X0, X1, Y0, Y1, D, ZP, ZT, OY, OX), { c: 'ow' });
    // цоколь: оздоблення поверх XPS плити / стрічки (разом із фасадом)
    var cx = plate ? Sx1 + (frame ? 0.02 : 0.01) : X1 + 0.35, cy = plate ? Sy1 + (frame ? 0.02 : 0.01) : Y1 + 0.35, c0 = plate ? Sx0 : X0 - 0.35, c1 = plate ? Sy0 : Y0 - 0.35;
    if (frame || !plate) A(Kk.fac, 0.5, pg('plt r', rx(cx, c1, cy, -0.03, ZP)) + pg('plt l', ry(cy, c0, cx, -0.03, ZP)) + pg('plt t', rz(ZP, c0, cx, cy - 0.12, cy)) + pg('plt t', rz(ZP, cx - 0.12, cx, c1, cy)), { c: 'ow' });
    // склопакети поверх фасаду (фасад має отвори) — світло інтерʼєру
    A('int', 0.6, gw);
    /* ── дах: крокви, мембрана, контробрешітка й обрешітка, покриття, водостоки */
    var rb = '', rfr = '', xs = range(X0 - O + 0.1, X1 + O - 0.1, 0.6);
    xs.forEach(function (x) { rb += pl('raf', [x, Y0 - O, EZ, x, RY, RZ]); rfr += pl('raf', [x, RY, RZ, x, Y1 + O, EZ]); });
    var sup = ''; if (brus) xs.forEach(function (x) { sup += box('sup', x - 0.08, x + 0.08, Y1 - 0.32, Y1 - 0.08, ZT, ZT + 0.1); });
    A(Kk.raf, 0, rb + pl('rdg', [X0 - O, RY, RZ, X1 + O, RY, RZ]) + rfr + sup, { m: 'd', c: 'ow' });
    var back = [X0 - O, Y0 - O, EZ, X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ], front = [X0 - O, Y1 + O, EZ, X1 + O, Y1 + O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ];
    A(Kk.raf, 0.35, pg('mem', back) + pg('mem', front), { c: 'ow' });
    var cbt = '';
    xs.forEach(function (x) { cbt += pl('cb', [x, RY, RZ + 0.05, x, Y1 + O, EZ + 0.05]); });
    range(0.08, 1, 0.12).forEach(function (u) { var y = RY + u * (Y1 + O - RY), z = RZ - u * (RZ - EZ) + 0.08; cbt += pl('bttn', [X0 - O, y, z, X1 + O, y, z]); });
    A(Kk.raf, 0.65, cbt, { c: 'ow' });
    var seam = mat === 'frame' || brus, prof = '';
    if (seam) range(X0 - O + 0.5, X1 + O - 0.1, 0.5).forEach(function (x) { prof += pl('sm', [x, RY, RZ + 0.1, x, Y1 + O, EZ + 0.1]); });
    else range(0.06, 1, 0.075).forEach(function (u) { var y = RY + u * (Y1 + O - RY), z = RZ - u * (RZ - EZ) + 0.1; prof += pl('tl', [X0 - O, y, z, X1 + O, y, z]); });
    var vz = zr(3.7) + 0.12;
    A('roof', 0.35, pg('rf b', back.map(function (v, i) { return i % 3 === 2 ? v + 0.1 : v; })) + box('vent', 4.0, 4.3, 3.55, 3.85, vz - 0.4, vz + 0.8) +
      pg('rf f', front.map(function (v, i) { return i % 3 === 2 ? v + 0.1 : v; })) + prof +
      pl('rk', [X1 + O, Y0 - O, EZ + 0.1, X1 + O, RY, RZ + 0.1, X1 + O, Y1 + O, EZ + 0.1]) + pl('rdg2', [X0 - O, RY, RZ + 0.16, X1 + O, RY, RZ + 0.16]), { m: 'd', c: 'ow' });
    A('roof', 0.7, pl('gut', [X0 - O, Y1 + O + 0.08, EZ - 0.05, X1 + O, Y1 + O + 0.08, EZ - 0.05]) + pl('gut', [X1 + O - 0.15, Y1 + O + 0.08, EZ - 0.05, X1 + O - 0.15, Y1 + O + 0.08, 0.25]), { c: 'ow' });
    /* ── передній план: техніка, дрон, ганок (брус), дерева, світло, гарантія */
    if (plate && !frame) A('pour', 0, box('trk', 14.2, 15.8, 11.4, 12.6, 0, 0.9) + box('trc', 14.2, 14.9, 12.6, 13.2, 0, 1.2) + pl('boom', [15.2, 12, 1.2, 13.4, 9.4, 5.6, 9.8, 7.4, 4.2, 9.2, 7, 1.2]) + pl('hose', [9.2, 7, 1.2, 9.2, 7, 0.4]), { h: ['pour', 0.95] });
    else if (plate) A('pour', 0, box('trk', 14.2, 15.8, 11.4, 12.6, 0, 0.9) + box('trc', 14.2, 14.9, 12.6, 13.2, 0, 1.2) + pl('boom', [15.2, 12, 1.2, 13.4, 9.4, 4.4, 9.8, 7.4, 2.8, 9.2, 7, 0.9]) + pl('hose', [9.2, 7, 0.9, 9.2, 7, 0.35]), { h: ['pour', 0.95] });
    else A('s_pour', 0, box('trk', 14.2, 15.8, 11.4, 12.6, 0, 0.9) + box('trc', 14.2, 14.9, 12.6, 13.2, 0, 1.2) + pl('boom', [15.2, 12, 1.2, 14.2, 10.6, 2.6, 13.4, 10.4, 0.9]) + pl('hose', [13.4, 10.4, 0.9, 13.4, 10.3, 0.35]), { h: ['s_pour', 0.95] });
    if (!frame && !brus) A('slab', 0, box('trk', 0.4, 2.4, 11.2, 12.4, 0, 0.9) + pl('boom', [1.4, 11.8, 1.0, 7.2, 6.6, 9.6]) + pl('hose', [7.2, 6.6, 9.6, 7.2, 6.6, 4.6]) + box('sl', 6.2, 8.2, 5.2, 8.2, 4.4, 4.62), { h: ['slab', 0.9] });
    A('geo', 0, pl('tri', [14.4, 11.6, 0, 15, 11.9, 1.5, 15.6, 11.5, 0]) + pl('tri', [15, 11.9, 1.5, 15.2, 12.5, 0]) + box('tri-h', 14.8, 15.2, 11.7, 12.1, 1.5, 1.8), { h: ['base', 0] });
    var drone = function () { var q = P(14.6, 1.6, 10.2).split(','), x = +q[0], y = +q[1]; return '<g class="drn"><path d="M' + (x - 13) + ' ' + y + 'h26M' + x + ' ' + (y - 5) + 'v10" class="dra"/><rect x="' + (x - 4) + '" y="' + (y - 2.5) + '" width="8" height="5" rx="1.5" class="drb"/>' +
      [[-13, 0], [13, 0], [0, -5], [0, 5]].map(function (q2) { return '<ellipse cx="' + (x + q2[0]) + '" cy="' + (y + q2[1]) + '" rx="5" ry="1.6" class="drr"/>'; }).join('') + '</g>'; };
    A(Kk.sl, 0.2, drone(), { h: [Kk.sl, 0.95] }); A('roof', 0.2, drone(), { h: ['roof', 0.98] });
    if (brus) {
      var por = box('post', 8.0, 8.16, Y1 + 1.2, Y1 + 1.36, 0.2, ZB1 - 0.15) + box('post', 10.0, 10.16, Y1 + 1.2, Y1 + 1.36, 0.2, ZB1 - 0.15) + box('jack', 7.98, 8.18, Y1 + 1.18, Y1 + 1.38, ZB1 - 0.15, ZB1) + box('jack', 9.98, 10.18, Y1 + 1.18, Y1 + 1.38, ZB1 - 0.15, ZB1) +
        box('wsl', 7.6, 10.6, Y1, Y1 + 1.5, ZB1, ZB1 + 0.12);
      A('r_shrink', 0, por, { m: 'd' });
      A('r_shrink', 0.3, pl('arr', [12.6, Y1 + 0.3, ZT - 0.3, 12.6, Y1 + 0.3, ZT - 1.2]) + pl('arr', [12.4, Y1 + 0.3, ZT - 0.95, 12.6, Y1 + 0.3, ZT - 1.2, 12.8, Y1 + 0.3, ZT - 0.95]) + txt('dt', 12.9, Y1 + 0.3, ZT - 0.8, 0, ui.shrink), { h: ['r_win', 0.5] });
    }
    A('land', 0.3, tree(1.4, 11.6, 1.4, 20) + tree(15, 1.4, 1.6, 22) + circ('cr2', 5, Y1 + 1.5, 0.35, 7) + circ('cr', 6.3, Y1 + 1.55, 0.35, 8) + circ('cr2', 11.6, Y1 + 1.5, 0.35, 7), { m: 'd' });
    A('land', 0.6, pl('lp', [7.8, 12.2, 0, 7.8, 12.2, 1.1]) + circ('lpg', 7.8, 12.2, 1.15, 9) + circ('bulb', 7.8, 12.2, 1.15, 2) + pl('lp', [14.7, 12.4, 0, 14.7, 12.4, 1.1]) + circ('lpg', 14.7, 12.4, 1.15, 9) + circ('bulb', 14.7, 12.4, 1.15, 2));
    A('done', 0, seal(15.4, 3.4, 9.6, ui), { m: 'd' });
    return { parts: L, xr: S('mep'), th: [] };
  }
  function seal(x, y, z, ui) { // печатка «36 міс. гарантія»
    var q = P(x, y, z).split(','), a = +q[0], b = +q[1];
    bb[0] = Math.min(bb[0], a - 28); bb[1] = Math.min(bb[1], b - 28); bb[2] = Math.max(bb[2], a + 28); bb[3] = Math.max(bb[3], b + 28);
    return '<g class="seal"><circle cx="' + a + '" cy="' + b + '" r="27" class="sl1"/><circle cx="' + a + '" cy="' + b + '" r="22" class="sl2"/>' +
      '<text x="' + a + '" y="' + (b + 1) + '" class="sl3">36</text><text x="' + a + '" y="' + (b + 11) + '" class="sl4">' + esc(ui.mo) + '</text><text x="' + a + '" y="' + (b - 12) + '" class="sl4">' + esc(ui.gar) + '</text></g>';
  }

  /* ---------- сцена «квартира» v3: ≈86 м² у «ляльковому» розрізі без стелі (задні зовнішні стіни — на всю висоту з вікнами, перегородки й передні стіни
     зрізані низько, щоб було видно кімнати). Кожна деталь — окремий шар зі своїм етапом; обʼємні шари сортуються за габаритами (painter, топологічно),
     мережі — окремою групою над сценою: «рентген» показує всі прокладені мережі крізь оздоблення. V: new — новобудова з нуля, old — вторинка з демонтажем. */
  var NETS = ['el', 'lv', 'cw', 'hw', 'sw', 'uf', 'ac'];
  function zsort(L) { // шари 0 (задні стіни) → 1 (підлога) → 2 (обʼєми, топологічно: «позаду» = розділені по x, y або z) → 3 (накладки)
    var A = L.filter(function (p) { return p.z === 2; }), n = A.length, i, j, E = 1e-4, sb = [], inD = [], adj = [], dn = [], res = [];
    A.forEach(function (p) {
      var b = p.b, a0 = 1e9, a1 = -1e9, c0 = 1e9, c1 = -1e9;
      [0, 1].forEach(function (u) { [2, 3].forEach(function (v) { [4, 5].forEach(function (w) { var a = (b[u] - b[v]) * CX, c = (b[u] + b[v]) * SY - b[w] * ZK; a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }); }); });
      sb.push([a0, a1, c0, c1]); inD.push(0); adj.push([]); dn.push(0);
    });
    function bh(a, b) { return a[1] <= b[0] + E || a[3] <= b[2] + E || a[5] <= b[4] + E; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      if (sb[i][1] <= sb[j][0] + 0.2 || sb[j][1] <= sb[i][0] + 0.2 || sb[i][3] <= sb[j][2] + 0.2 || sb[j][3] <= sb[i][2] + 0.2) continue;
      var p = bh(A[i].b, A[j].b), q = bh(A[j].b, A[i].b);
      if (p && !q) { adj[i].push(j); inD[j]++; } else if (q && !p) { adj[j].push(i); inD[i]++; }
    }
    while (res.length < n) {
      var k = -1;
      for (i = 0; i < n && k < 0; i++) if (!dn[i] && !inD[i]) k = i;
      if (k < 0) for (i = 0; i < n; i++) if (!dn[i] && (k < 0 || A[i].b[0] + A[i].b[2] + A[i].b[4] < A[k].b[0] + A[k].b[2] + A[k].b[4])) k = i; // цикл — за глибиною
      dn[k] = 1; res.push(A[k]); adj[k].forEach(function (m) { inD[m]--; });
    }
    var o = [];
    [0, 1].forEach(function (z) { L.forEach(function (p) { if (p.z === z) o.push(p); }); });
    return o.concat(res, L.filter(function (p) { return p.z === 3; }));
  }
  // текст, що лежить на підлозі (z): d — уздовж y (читається вгору-вправо), інакше уздовж x
  function tf(c, x, y, z, s, d) {
    var q = P(x, y, z).split(','), u = d ? [CX, -SY] : [CX, SY], v = d ? [CX, SY] : [-CX, SY];
    return '<text class="' + c + '" transform="matrix(' + [u[0] / K, u[1] / K, v[0] / K, v[1] / K, +q[0], +q[1]].map(function (t) { return +t.toFixed(3); }).join(' ') + ')">' + esc(s) + '</text>';
  }
  function flat(S, ui, V, lang) {
    var L = [], OLD = V === 'old', WX = 12, WY = 7.2, H = 2.8, T = 0.3, ZC = 1.4, ZF = 0.35;
    function I(z, key, fr, b, v, o) {
      if (!v) return; o = o || {};
      var i = key ? S(key) : -9; if (key && i < 0) return;
      var e = -1; if (o.h) { var j = S(o.h[0]); if (j >= 0) e = j + (o.h[1] || 0) * 0.6; }
      L.push({ s: key ? i + (fr || 0) * 0.6 : -9, v: v, m: typeof v === 'function' ? 'g' : (o.m || 'f'), e: e, c: (o.c || '') + (o.n ? ' net n-' + o.n : ''), b: b, z: z, n: o.n });
    }
    function bx(key, fr, c, x0, x1, y0, y1, z0, z1, o, extra) { I(2, key, fr, [x0, x1, y0, y1, z0, z1], box(c, x0, x1, y0, y1, z0, z1) + (extra || ''), o); }
    function fx(key, fr, c, X, a, b, z0, z1, o) { I(2, key, fr, [X, X, a, b, z0, z1], pg(c + ' r', rx(X, a, b, z0, z1)), o); }
    function fy(key, fr, c, Y, a, b, z0, z1, o) { I(2, key, fr, [a, b, Y, Y, z0, z1], pg(c + ' l', ry(Y, a, b, z0, z1)), o); }
    function fl(key, fr, v, o) { I(1, key, fr, null, v, o); }
    function nt(key, fr, n, s, hide) { I(3, key, fr, null, s, { n: n, h: hide }); }
    function nl(a) { return pl('nl', a); }
    function each(a, f) { a.forEach(function (r) { f.apply(null, r); }); }
    function grid(c, z, x0, x1, y0, y1, st, sy) { var s = ''; range(x0 + st, x1 - 0.05, st).forEach(function (x) { s += pl(c, [x, y0, z, x, y1, z]); }); range(y0 + (sy || st), y1 - 0.05, sy || st).forEach(function (y) { s += pl(c, [x0, y, z, x1, y, z]); }); return s; }
    function sock(X, Y, z, ax) { return pg('sb', ax ? ry(Y, X - 0.07, X + 0.07, z - 0.07, z + 0.07) : rx(X, Y - 0.07, Y + 0.07, z - 0.07, z + 0.07)); }
    var num = function (v) { return lang === 'en' ? String(v) : String(v).replace('.', ','); };

    // ── геометрія: вікна в задніх стінах, перегородки (x0, x1, y0, y1, b — газоблок / g — гіпсокартон, прорізи)
    var WIN = [[1.0, 2.6], [3.2, 4.8], [6.6, 8.2], [9.9, 11.3]], WZ = [0.85, 2.55], WK = [5.0, 6.2], WKZ = [1.05, 2.45];
    var WALLS = [[5.6, 5.72, 0, 4, 'g'], [9.08, 9.2, 0, 4, 'g'], [3.4, 12, 4, 4.12, 'g', [[3.9, 5.3], [8.2, 9], [10, 10.8]]],
      [3.52, 5.72, 5.1, 5.22, 'b', [[4.4, 5.1]]], [8.2, 9.72, 5.1, 5.22, 'b', [[8.6, 9.3]]], [9.72, 12, 5.1, 5.22, 'g', [[10.4, 11.2]]],
      [3.4, 3.52, 4.12, 5.1, 'b'], [3.4, 3.52, 5.1, 7.2, 'b'], [5.6, 5.72, 5.22, 7.2, 'b'], [8.2, 8.32, 5.22, 7.2, 'b'], [9.6, 9.72, 5.22, 7.2, 'b']];
    var WET = [[3.52, 5.6, 5.22, 7.2], [8.32, 9.6, 5.22, 7.2]], TZ = [[0, 3.4, 4, 7.2], [5.72, 8.2, 5.1, 7.2]].concat(WET),
      PZ = [[0, 5.6, 0, 4], [5.72, 9.08, 0, 4], [9.2, WX, 0, 4], [3.52, WX, 4.12, 5.1], [9.72, WX, 5.22, WY]],
      UF = [[0.75, 3.25, 4.2, 7.05], [3.95, 5.5, 5.3, 6.35], [5.9, 8.05, 5.35, 7.0]];
    var SEG = [];
    WALLS.forEach(function (w) {
      var ax = w[1] - w[0] > w[3] - w[2], c = [ax ? w[0] : w[2]];
      (w[5] || []).forEach(function (d) { c.push(d[0], d[1]); }); c.push(ax ? w[1] : w[3]);
      for (var i = 0; i < c.length; i += 2) SEG.push(ax ? [c[i], c[i + 1], w[2], w[3], w[4], 1] : [w[0], w[1], c[i], c[i + 1], w[4], 0]);
    });
    function trim(a0, a1, pl0, ax) { // ділянки грані, закриті перпендикулярними стінами, що стоять на її площині
      SEG.forEach(function (w) {
        if (ax ? (w[5] || Math.abs(w[2] - pl0) > 0.01) : (!w[5] || Math.abs(w[0] - pl0) > 0.01)) return;
        var b0 = ax ? w[0] : w[2], b1 = ax ? w[1] : w[3];
        if (b0 <= a0 + 1e-6 && b1 > a0) a0 = b1; if (b1 >= a1 - 1e-6 && b0 < a1) a1 = b0;
      });
      return [a0, a1];
    }
    function wetF(g) { return WET.some(function (r) { return g[5] ? Math.abs(r[2] - g[3]) < 0.01 && r[0] < g[1] && r[1] > g[0] : Math.abs(r[0] - g[1]) < 0.01 && r[2] < g[3] && r[3] > g[2]; }); }

    // ── 0: плита, підлога, небо у вікнах, укоси; вікна (старі / нові) — до площини стіни; задні стіни
    var s1 = box('cut', -T, WX + T, -T, WY + T, -0.32, 0) + pg('flr', rz(0, 0, WX, 0, WY));
    WIN.forEach(function (w) { s1 += pg('sky', ry(-T, w[0], w[1], WZ[0], WZ[1])) + pg('jb r', rx(w[0], -T, 0, WZ[0], WZ[1])) + pg('jb t', rz(WZ[0], w[0], w[1], -T, 0)); });
    s1 += pg('sky', rx(-T, WK[0], WK[1], WKZ[0], WKZ[1])) + pg('jb l', ry(WK[0], -T, 0, WKZ[0], WKZ[1])) + pg('jb t', rz(WKZ[0], -T, 0, WK[0], WK[1]));
    I(0, null, 0, null, s1);
    var ow = '', nw = '', tp = '', ok = '';
    WIN.forEach(function (w) {
      var m = (w[0] + w[1]) / 2;
      ow += pg('owf', ry(-0.1, w[0], w[1], WZ[0], WZ[1])) + pg('gl gd-l', ry(-0.11, w[0] + 0.1, w[1] - 0.1, WZ[0] + 0.1, WZ[1] - 0.1)) + pl('owm', [m, -0.1, WZ[0], m, -0.1, WZ[1]]) + pl('owm', [w[0], -0.1, 1.95, w[1], -0.1, 1.95]);
      nw += pg('gl gd-l', ry(-0.12, w[0], w[1], WZ[0], WZ[1])) + pl('fr', [w[0] + 0.03, -0.12, WZ[0] + 0.03, w[1] - 0.03, -0.12, WZ[0] + 0.03, w[1] - 0.03, -0.12, WZ[1] - 0.03, w[0] + 0.03, -0.12, WZ[1] - 0.03, w[0] + 0.03, -0.12, WZ[0] + 0.03]) + pl('fr', [m, -0.12, WZ[0], m, -0.12, WZ[1]]);
      tp += pl('tape', [w[0] + 0.02, -0.04, WZ[0] + 0.02, w[1] - 0.02, -0.04, WZ[0] + 0.02, w[1] - 0.02, -0.04, WZ[1] - 0.02, w[0] + 0.02, -0.04, WZ[1] - 0.02, w[0] + 0.02, -0.04, WZ[0] + 0.02]);
      ok += pg('oks r', rx(w[0] + 0.004, -0.12, 0, WZ[0], WZ[1])) + pg('oks t', rz(WZ[0] + 0.004, w[0], w[1], -0.12, 0));
    });
    var mk = (WK[0] + WK[1]) / 2;
    ow += pg('owf', rx(-0.1, WK[0], WK[1], WKZ[0], WKZ[1])) + pg('gl gd-l', rx(-0.11, WK[0] + 0.1, WK[1] - 0.1, WKZ[0] + 0.1, WKZ[1] - 0.1)) + pl('owm', [-0.1, mk, WKZ[0], -0.1, mk, WKZ[1]]);
    nw += pg('gl gd-l', rx(-0.12, WK[0], WK[1], WKZ[0], WKZ[1])) + pl('fr', [-0.12, mk, WKZ[0], -0.12, mk, WKZ[1]]);
    tp += pl('tape', [-0.04, WK[0] + 0.02, WKZ[0] + 0.02, -0.04, WK[1] - 0.02, WKZ[0] + 0.02, -0.04, WK[1] - 0.02, WKZ[1] - 0.02, -0.04, WK[0] + 0.02, WKZ[1] - 0.02, -0.04, WK[0] + 0.02, WKZ[0] + 0.02]);
    ok += pg('oks l', ry(WK[0] + 0.004, -0.12, 0, WKZ[0], WKZ[1])) + pg('oks t', rz(WKZ[0] + 0.004, -0.12, 0, WK[0], WK[1]));
    if (OLD) { I(0, null, 0, null, ow, { h: ['win', 0.1] }); I(0, 'win', 0.45, null, nw); I(0, 'win', 0.2, null, tp, { h: ['win', 0.75] }); }
    else { I(0, null, 0, null, nw); I(0, 'win', 0.1, null, tp, { h: ['win', 0.6] }); }
    I(0, 'win', 0.7, null, ok);
    function fY(o) { return [ry(o, 0, WX, 0, H)].concat(WIN.map(function (w) { return ry(o, w[0], w[1], WZ[0], WZ[1]); })); }
    function fX(o) { return [rx(o, 0, WY, 0, H), rx(o, WK[0], WK[1], WKZ[0], WKZ[1])]; }
    I(0, null, 0, null, pg('cut t', rz(H, -T, WX + T, -T, 0)) + ph('cw l', fY(0)) + pg('cut r', rx(WX + T, -T, 0, 0, H)) + pg('cut l', ry(0, WX, WX + T, ZF, H)) +
      pg('cut t', rz(H, -T, 0, 0, WY + T)) + ph('cw r', fX(0)) + pg('cut l', ry(WY + T, -T, 0, 0, H)) + pg('cut r', rx(0, WY, WY + T, ZF, H)));
    // оздоблення задніх стін: маяки → штукатурка → шпаклівка → фарба; фартух кухні — плитка
    var bk = ''; range(0.6, WX - 0.3, 1.3).forEach(function (x) { if (!WIN.some(function (w) { return x > w[0] - 0.1 && x < w[1] + 0.1; })) bk += pl('mk', [x, 0.01, 0.1, x, 0.01, H - 0.1]); });
    range(0.6, WY - 0.3, 1.3).forEach(function (y) { if (y < WK[0] - 0.1 || y > WK[1] + 0.1) bk += pl('mk', [0.01, y, 0.1, 0.01, y, H - 0.1]); });
    I(0, 'plaster', 0, null, bk, { h: ['plaster', 0.7] });
    I(0, 'plaster', 0.4, null, ph('pls l', fY(0.004)) + ph('pls r', fX(0.004)));
    I(0, 'paint', 0, null, ph('shp l', fY(0.005)) + ph('shp r', fX(0.005)));
    I(0, 'paint', 0.55, null, ph('pt l', fY(0.006)) + ph('pt r', fX(0.006)));
    I(0, 'tile', 0.4, null, pg('tw r', rx(0.008, 4.15, WK[0], 0.9, 1.5)) + pg('tw r', rx(0.008, WK[1], 7.15, 0.9, 1.5)) + pg('tw r', rx(0.008, WK[0], WK[1], 0.9, WKZ[0])) + grid2());
    function grid2() { var s = ''; range(4.45, 7.1, 0.3).forEach(function (y) { if (y < WK[0] || y > WK[1]) s += pl('tg', [0.009, y, 0.9, 0.009, y, 1.5]); }); s += pl('tg', [0.009, 4.15, 1.2, 0.009, WK[0], 1.2]) + pl('tg', [0.009, WK[1], 1.2, 0.009, 7.15, 1.2]); return s; }
    // старі покриття, радіатори, перегородки (вторинка) — до демонтажу
    if (OLD) {
      var od = { h: ['demo', 0.15] };
      fl(null, 0, pg('old', rz(0.04, 0.05, WX - 0.05, 0.05, WY - 0.05)) + grid('oldl', 0.045, 0.05, WX - 0.05, 0.05, WY - 0.05, 1.5, 9) + pg('oldt', rz(0.05, 5.32, 6.6, 4.42, WY)) + grid('tg', 0.055, 5.32, 6.6, 4.42, WY, 0.3), od);
      [[3.0, 3.12, 0, 3.0], [0, 3.0, 4.3, 4.42], [4.2, WX, 4.3, 4.42], [5.2, 5.32, 4.42, WY], [6.6, 6.72, 4.42, WY], [8.9, 9.02, 0, 4.3]].forEach(function (w) { bx(null, 0, 'oldw', w[0], w[1], w[2], w[3], 0, ZC, { h: ['demo', 0.3] }); });
      WIN.forEach(function (w) { var r = ''; range(w[0] + 0.35, w[1] - 0.3, 0.09).forEach(function (x) { r += pl('rib', [x, 0.16, 0.14, x, 0.16, 0.68]); }); bx(null, 0, 'rado', w[0] + 0.3, w[1] - 0.3, 0.05, 0.16, 0.12, 0.7, { h: ['demo', 0.2] }, r); });
      bx(null, 0, 'rst', 3.6, 3.72, 5.3, 5.42, 0, ZC, { h: ['demo', 0.2] }); bx(null, 0, 'rst', 8.42, 8.52, 7.0, 7.1, 0, ZC, { h: ['demo', 0.2] });
      // мішки й сміття, вивезення через вхідні двері
      bx('demo', 0.35, 'heap', 4.4, 5.4, 1.4, 2.6, 0, 0.35, { h: ['part', 0.15] });
      [[6.0, 6.5, 6.2], [6.6, 7.1, 6.0], [6.2, 6.7, 6.7], [7.2, 7.7, 6.5], [6.9, 7.4, 5.5]].forEach(function (q, i) { bx('demo', 0.4 + i * 0.05, 'bag', q[0], q[1], q[2], q[2] + 0.42, 0, 0.5, { h: ['part', 0.15], m: 'd' }); });
      I(3, 'demo', 0.6, null, pl('arr', [6.95, 6.9, 0.3, 6.95, 8.6, 0.3]) + pl('arr', [6.75, 8.25, 0.3, 6.95, 8.6, 0.3, 7.15, 8.25, 0.3]), { h: ['part', 0.15] });
    } else {
      // новобудова: приймання — лазерний рівень, перевірка площин, ґрунт по бетону
      var lz = pl('tri', [2.6, 2.1, 0, 2.9, 2.3, 1.2, 3.2, 2.0, 0]) + pl('tri', [2.9, 2.3, 1.2, 2.95, 2.7, 0]) + box('tri-h', 2.8, 3.0, 2.2, 2.4, 1.2, 1.4);
      lz += pl('lzg', [0.012, 0, 1.0, 0.012, WY, 1.0]) + pl('lzg', [0, 0.012, 1.0, WX, 0.012, 1.0]) + pl('lzg', [2.9, 0.012, 0.05, 2.9, 0.012, H - 0.05]) + pl('lzg', [0.012, 2.3, 0.05, 0.012, 2.3, H - 0.05]);
      I(3, 'demo', 0, null, lz, { h: ['part', 0] });
      fl('demo', 0.5, pg('prm', rz(0.01, 0, WX, 0, WY)), { h: ['screed', 0.6] });
    }
    // радіатори під вікнами (вторинка — нові на етапі сантехніки)
    WIN.forEach(function (w) { var r = ''; range(w[0] + 0.3, w[1] - 0.25, 0.1).forEach(function (x) { r += pl('rib2', [x, 0.125, 0.18, x, 0.125, 0.6]); }); bx(OLD ? 'plumb' : null, 0.6, 'rad', w[0] + 0.25, w[1] - 0.25, 0.04, 0.12, 0.15, 0.62, OLD ? { m: 'd' } : null, r); });

    // ── 1: дизайн-проєкт на підлозі: контури кімнат, меблі, підписи з площами
    var RM = [['liv', 2.0, 2.3, 33], ['bed', 7.4, 2.0, 13], ['kid', 10.5, 2.2, 11], ['hall', 7.2, 4.5, 13], ['bath', 4.5, 5.9, 4], ['wc', 8.85, 6.2, 2.5, 1], ['wr', 10.75, 6.2, 4.5, 1]];
    var pln = '';
    SEG.forEach(function (g) { pln += pl('pln', [g[0], g[2], 0.02, g[1], g[2], 0.02, g[1], g[3], 0.02, g[0], g[3], 0.02, g[0], g[2], 0.02]); });
    [[0, 0.62, 4.15, 7.15], [5.75, 7.8, 0.9, 2.5], [3.0, 3.9, 0.8, 3.0], [1.4, 2.4, 4.9, 6.3], [3.56, 5.3, 6.45, 7.17], [8.34, 8.9, 6.1, 6.5], [9.75, 10.3, 5.3, 7.15], [9.25, 10.15, 2.3, 3.95], [0, 0.45, 0.9, 2.9]].forEach(function (r) {
      pln += pl('plf', [r[0], r[2], 0.02, r[1], r[2], 0.02, r[1], r[3], 0.02, r[0], r[3], 0.02, r[0], r[2], 0.02]);
    });
    RM.forEach(function (r) { var sm = r[3] < 5 ? ' rs' : ''; pln += tf('rl' + sm, r[1], r[2], 0.02, ui.rm[r[0]], r[4]) + tf('ra' + sm, r[1] + (r[4] ? 0.4 : 0.32), r[2] + (r[4] ? 0 : 0.32), 0.02, num(r[3]) + ' ' + ui.m2, r[4]); });
    fl('design', 0, pln, { m: 'd', h: ['part', 0.5] });

    // ── 2: перегородки ростуть рядами: газоблок — по 0,2 м, гіпсокартон — профіль, далі листи
    SEG.forEach(function (g) {
      var b = [g[0], g[1], g[2], g[3], 0, ZC], ax = g[5];
      if (g[4] === 'b') I(2, 'part', 0, b, function (k) {
        var z = Math.min(ZC, Math.round(ZC * k / 0.2) * 0.2); if (z < 0.01) return '';
        var s = box('pw', g[0], g[1], g[2], g[3], 0, z);
        range(0.2, z - 0.05, 0.2).forEach(function (r) { s += ax ? pl('rw', [g[0], g[3] + 0.001, r, g[1], g[3] + 0.001, r]) : pl('rw', [g[1] + 0.001, g[2], r, g[1] + 0.001, g[3], r]); });
        return s;
      });
      else I(2, 'part', 0.3, b, function (k) {
        if (k <= 0) return '';
        var s = '', m = ax ? (g[2] + g[3]) / 2 : (g[0] + g[1]) / 2, a0 = ax ? g[0] : g[2], a1 = ax ? g[1] : g[3];
        [0.02, ZC].forEach(function (z) { s += ax ? pl('prf', [a0, m, z, a1, m, z]) : pl('prf', [m, a0, z, m, a1, z]); });
        range(a0 + 0.05, a1 - 0.02, 0.6).concat([a1 - 0.03]).forEach(function (a) { s += ax ? pl('prf', [a, m, 0, a, m, ZC]) : pl('prf', [m, a, 0, m, a, ZC]); });
        var z = k < 0.45 ? 0 : Math.min(ZC, Math.ceil((k - 0.45) / 0.55 * 2) * 0.7);
        return s + (z > 0 ? box('gk', g[0], g[1], g[2], g[3], 0, z) : '');
      });
      // грані: штукатурка (газоблок), шпаклівка й фарба або плитка (мокрі зони)
      var t = wetF(g), A = ax ? trim(g[0], g[1], g[3], 1) : trim(g[2], g[3], g[1], 0);
      if (A[1] - A[0] < 0.02) return;
      function face(key, fr, c, o, z1, o2) {
        if (ax) I(2, key, fr, [A[0], g[1] + o, g[3] + o, g[3] + o, 0, z1], pg(c + ' l', ry(g[3] + o, A[0], A[1], 0, z1)) + (A[1] >= g[1] - 1e-6 ? pg(c + ' r', rx(g[1] + o, g[2], g[3] + o, 0, z1)) : ''), o2);
        else I(2, key, fr, [g[1] + o, g[1] + o, A[0], g[3] + o, 0, z1], pg(c + ' r', rx(g[1] + o, A[0], A[1], 0, z1)) + (A[1] >= g[3] - 1e-6 ? pg(c + ' l', ry(g[3] + o, g[0], g[1] + o, 0, z1)) : ''), o2);
      }
      if (t) face('hydro', 0.3, 'hyw', 0.002, 0.2);
      if (g[4] === 'b') {
        var mm = ''; range(A[0] + 0.4, A[1] - 0.1, 1.2).forEach(function (a) { mm += ax ? pl('mk', [a, g[3] + 0.003, 0.08, a, g[3] + 0.003, ZC - 0.05]) : pl('mk', [g[1] + 0.003, a, 0.08, g[1] + 0.003, a, ZC - 0.05]); });
        if (mm) I(2, 'plaster', 0, ax ? [A[0], A[1], g[3] + 0.003, g[3] + 0.003, 0, ZC] : [g[1] + 0.003, g[1] + 0.003, A[0], A[1], 0, ZC], mm, { h: ['plaster', 0.7] });
        face('plaster', 0.4, 'pls', 0.004, ZC);
      }
      if (t) { face('tile', 0, 'hy2', 0.0055, ZC); face('tile', 0.35, 'tw', 0.007, ZC); }
      else { face('paint', 0, 'shp', 0.005, ZC); face('paint', 0.55, !ax && g[0] === 5.6 && g[3] === 4 ? 'pta' : 'pt', 0.006, ZC); }
    });
    // плиткова сітка на стінах мокрих зон (окремий шар поверх плитки)
    var twg = '';
    range(5.22 + 0.3, 7.15, 0.3).forEach(function (y) { twg += pl('tg', [3.528, y, 0, 3.528, y, ZC]) + pl('tg', [8.328, y, 0, 8.328, y, ZC]); });
    range(0.3, ZC - 0.05, 0.3).forEach(function (z) { twg += pl('tg', [3.528, 5.22, z, 3.528, WY, z]) + pl('tg', [8.328, 5.22, z, 8.328, WY, z]) + pl('tg', [3.52, 5.228, z, 4.4, 5.228, z]) + pl('tg', [5.1, 5.228, z, 5.6, 5.228, z]) + pl('tg', [8.32, 5.228, z, 8.6, 5.228, z]) + pl('tg', [9.3, 5.228, z, 9.6, 5.228, z]); });
    I(2, 'tile', 0.45, [3.528, 9.6, 5.228, 5.228, 0, ZC], twg);
    // передні зовнішні стіни (зрізані низько) і вхідні двері
    bx(null, 0, 'ext', 0, 6.5, WY, WY + T, 0, ZF); bx(null, 0, 'ext', 7.4, WX + T, WY, WY + T, 0, ZF); bx(null, 0, 'ext', WX, WX + T, 0, WY, 0, ZF);
    // шахти стояків (обшиваємо після випробування труб) і плитка на них
    bx('plaster', 0.15, 'shf', 3.52, 3.86, 5.22, 5.56, 0, ZC); bx('plaster', 0.15, 'shf', 8.32, 8.66, 6.86, WY, 0, ZC);
    bx('tile', 0.4, 'twb', 3.52, 3.867, 5.22, 5.567, 0, ZC); bx('tile', 0.4, 'twb', 8.32, 8.667, 6.853, WY, 0, ZC);
    // інсталяція підвісного унітаза: каркас → короб у плитці
    bx('plumb', 0.4, 'inst', 8.34, 8.5, 6.0, 6.6, 0, 1.12, { h: ['tile', 0.4] }, pg('tnk', rx(8.505, 6.12, 6.48, 0.75, 1.05)));
    bx('tile', 0.4, 'twb', 8.32, 8.56, 5.98, 6.62, 0, 1.12);
    // колектор з лічильниками й щит
    bx('plumb', 0.2, 'colb', 8.32, 8.44, 5.35, 5.95, 0.25, 0.85, null, pl('vlv', [8.445, 5.45, 0.55, 8.445, 5.85, 0.55]) + pl('vlv', [8.445, 5.45, 0.4, 8.445, 5.85, 0.4]));
    var brk = ''; range(6.4, 6.85, 0.06).forEach(function (y, i) { brk += pg(i === 5 || i === 6 ? 'rcd' : 'brk', rx(5.865, y, y + 0.045, 1.08, 1.2)); });
    bx('elec', 0.3, 'pan', 5.72, 5.86, 6.35, 6.9, 0.9, 1.35, null, brk);
    bx('elec', 0.35, 'mbx', 5.72, 5.84, 5.75, 6.15, 0.95, 1.3);

    // ── мережі (рентген): прокладка на своєму етапі, ховаються під стяжкою / штукатуркою / стелею
    // електрика: з щита в підлозі (гофра під стяжкою) до стін, далі вертикальні штроби до розеток, вимикачів і світла
    var ef = nl([5.86, 6.6, 1.0, 6.1, 6.6, 1.0, 6.1, 6.6, 0.03, 6.1, 4.55, 0.03, 0.15, 4.55, 0.03]) + nl([6.1, 4.62, 0.03, 0.2, 4.62, 0.03, 0.2, 7.0, 0.03]) +
      nl([2.9, 4.55, 0.03, 2.9, 0.15, 0.03]) + nl([2.9, 1.6, 0.03, 0.15, 1.6, 0.03]) + nl([6.0, 4.55, 0.03, 6.0, 0.6, 0.03, 5.73, 0.6, 0.03]) + nl([6.0, 2.6, 0.03, 5.73, 2.6, 0.03]) +
      nl([6.1, 4.55, 0.03, 11.7, 4.55, 0.03, 11.7, 0.15, 0.03]) + nl([8.6, 4.55, 0.03, 8.6, 0.15, 0.03]) + nl([9.5, 4.55, 0.03, 9.5, 0.15, 0.03]) + nl([9.4, 3.0, 0.03, 9.21, 3.0, 0.03]) +
      nl([5.86, 6.2, 1.0, 5.4, 6.2, 1.0, 5.4, 5.23, 1.0]);
    nt('elec', 0, 'el', ef, ['screed', 0.5]);
    var ew = '', sbx = '';
    each([[0.6, 0.3], [2.9, 0.3], [2.9, 2.6], [5.2, 0.3], [5.2, 2.6], [8.6, 0.3], [8.6, 2.6], [9.5, 0.9], [11.7, 0.3], [11.7, 2.6]], function (x, z) { ew += nl([x, 0.012, 0.03, x, 0.012, z]); sbx += sock(x, 0.012, z, 1); });
    each([[1.6, 0.3], [1.6, 1.1], [4.55, 0.3], [4.62, 1.1], [6.6, 1.1], [7.0, 0.3], [7.0, 2.2], [3.1, 2.6]], function (y, z) { ew += nl([0.012, y, 0.03, 0.012, y, z]); sbx += sock(0.012, y, z, 0); });
    each([[0.6, 0.6], [2.6, 0.6], [3.6, 0.9]], function (y, z) { ew += nl([5.732, y, 0.03, 5.732, y, z]); sbx += sock(5.732, y, z, 0); });
    ew += nl([9.212, 3.0, 0.03, 9.212, 3.0, 0.3]) + nl([5.4, 5.232, 1.0, 5.4, 5.232, 1.0]); sbx += sock(9.212, 3.0, 0.3, 0) + sock(5.4, 5.232, 1.0, 1);
    ew += nl([0.6, 0.012, 2.55, 11.7, 0.012, 2.55]) + nl([0.012, 0.4, 2.55, 0.012, 7.0, 2.55]); // освітлення під стелею
    each([[2.9, 2.55], [8.6, 2.55], [11.7, 2.55]], function (x, z) { sbx += pg('jbx', ry(0.014, x - 0.12, x + 0.12, z - 0.12, z + 0.12)); });
    each([[1.6, 2.55], [6.6, 2.55]], function (y, z) { sbx += pg('jbx', rx(0.014, y - 0.12, y + 0.12, z - 0.12, z + 0.12)); });
    nt('elec', 0.15, 'el', ew + sbx, ['plaster', 0.3]);
    // слабкі струми: медіабокс → ТБ, роутер у вітальні, стіл у дитячій
    nt('elec', 0.4, 'lv', nl([5.84, 5.9, 1.0, 5.95, 5.9, 1.0, 5.95, 5.9, 0.03, 5.95, 4.42, 0.03, 0.3, 4.42, 0.03, 0.3, 1.75, 0.03, 0.012, 1.75, 0.03, 0.012, 1.75, 1.1]) +
      nl([5.95, 4.42, 0.03, 10.3, 4.42, 0.03, 10.3, 0.15, 0.03, 10.3, 0.012, 0.03, 10.3, 0.012, 0.9]) + sock(0.012, 1.75, 1.1, 0) + sock(10.3, 0.012, 0.9, 1), ['plaster', 0.3]);
    // кондиціонери (траси на етапі електрики, ховаються в короб стелі) і короб витяжки
    nt('elec', 0.55, 'ac', nl([8.7, 0.012, 2.3, 8.7, 0.012, 2.65, 9.1, 0.012, 2.65]) + nl([8.75, 0.012, 2.3, 8.75, 0.012, 2.6, 9.1, 0.012, 2.6]) + circ('acx', 9.1, 0, 2.62, 2.4) +
      nl([11.65, 0.012, 2.3, 11.65, 0.012, 2.65, 11.95, 0.012, 2.65]) + circ('acx', 11.95, 0, 2.65, 2.4) + nl([0.012, 3.1, 2.3, 0.012, 3.1, 2.65, 0.012, 3.75, 2.65]) + circ('acx', 0, 3.75, 2.65, 2.4) +
      pl('nd', [0.2, 6.75, 2.3, 0.2, 6.75, 2.65, 0.2, 7.1, 2.65]), ['ceil', 0.5]);
    // вода й каналізація
    var cw = nl([8.42, 7.05, 0.03, 8.42, 5.65, 0.03, 8.42, 5.65, 0.3]) + nl([8.36, 5.5, 0.3, 8.36, 5.5, 0.03, 8.36, 4.7, 0.03, 3.7, 4.7, 0.03, 0.3, 4.7, 0.03, 0.3, 5.5, 0.03, 0.012, 5.5, 0.03, 0.012, 5.5, 0.5]) +
      nl([3.75, 4.7, 0.03, 3.75, 6.0, 0.03, 3.6, 6.0, 0.03, 3.53, 6.0, 0.5]) + nl([3.75, 6.0, 0.03, 3.75, 6.85, 0.03, 3.528, 6.85, 0.03, 3.528, 6.85, 0.7]) + nl([8.45, 5.95, 0.4, 8.45, 6.25, 0.4, 8.45, 6.25, 0.9]);
    var hw = nl([8.5, 7.05, 0.03, 8.5, 5.75, 0.03, 8.5, 5.75, 0.3]) + nl([8.36, 5.8, 0.3, 8.28, 5.8, 0.03, 8.28, 4.8, 0.03, 3.82, 4.8, 0.03, 0.4, 4.8, 0.03, 0.4, 5.62, 0.03, 0.012, 5.62, 0.03, 0.012, 5.62, 0.5]) +
      nl([3.82, 4.8, 0.03, 3.82, 6.1, 0.03, 3.53, 6.1, 0.5]) + nl([3.82, 6.1, 0.03, 3.82, 6.95, 0.03, 3.528, 6.95, 0.03, 3.528, 6.95, 0.7]);
    var rs = OLD ? 'plumb' : null;
    nt(rs, 0, 'cw', nl([8.42, 7.1, 0, 8.42, 7.1, ZC]), ['plaster', 0.15]); nt(rs, 0, 'hw', nl([8.5, 7.1, 0, 8.5, 7.1, ZC]), ['plaster', 0.15]);
    nt(rs, 0, 'sw', nl([8.58, 7.0, 0, 8.58, 7.0, ZC]) + nl([3.7, 5.39, 0, 3.7, 5.39, ZC]), ['plaster', 0.15]);
    nt('plumb', 0.05, 'cw', cw, ['screed', 0.5]); nt('plumb', 0.15, 'hw', hw, ['screed', 0.5]);
    var chev = ''; [0.9, 1.7, 2.5].forEach(function (x) { chev += pl('nl', [x - 0.12, 5.48, 0.05, x, 5.6, 0.05, x - 0.12, 5.72, 0.05]); });
    nt('plumb', 0.25, 'sw', nl([0.35, 5.6, 0.45, 0.35, 5.6, 0.06, 3.7, 5.6, 0.05, 3.7, 5.42, 0.05]) + nl([3.7, 6.7, 0.06, 3.7, 5.56, 0.05]) + nl([3.62, 6.0, 0.45, 3.7, 6.0, 0.06]) +
      nl([8.42, 6.3, 0.23, 8.42, 6.3, 0.06, 8.58, 6.9, 0.05, 8.58, 6.97, 0.05]) + chev + tf('slp', 1.9, 5.95, 0.05, '2–3 %'), ['screed', 0.5]);
    // тепла підлога: нагрівальний кабель змійкою по утеплювачу, датчик у гофрі, терморегулятор
    var uf = '';
    UF.forEach(function (r) { uf += pl('nl', zig(r[0], r[1], r[2], r[3], 0.04, 0.22)); });
    nt('screed', 0.15, 'uf', uf + nl([0.75, 6.0, 0.04, 0.012, 6.0, 0.04, 0.012, 6.0, 0.9]) + sock(0.012, 6.0, 0.9, 0), ['screed', 0.55]);

    // ── підлога: гідроізоляція (1-й шар) → утеплювач і демпферна стрічка → маяки → стяжка → 2-й шар → плитка / підкладка й паркет → плінтус
    WET.forEach(function (r) { fl('hydro', 0, pg('hyw', rz(0.02, r[0], r[1], r[2], r[3]))); });
    var tps = '';
    WET.forEach(function (r) { tps += pl('tp', [r[0] + 0.01, r[3] - 0.01, 0.025, r[0] + 0.01, r[2] + 0.01, 0.025, r[1] - 0.01, r[2] + 0.01, 0.025]) + pl('tp', [r[0] + 0.01, r[2] + 0.01, 0.025, r[0] + 0.01, r[2] + 0.01, 0.2]); });
    tps += circ('clr', 3.7, 5.6, 0.03, 2.6) + circ('clr', 3.75, 6.7, 0.03, 2.6) + circ('clr', 8.42, 6.3, 0.03, 2.6);
    I(3, 'hydro', 0.5, null, tps, { h: ['screed', 0.55] });
    UF.forEach(function (r) { fl('screed', 0, pg('xps', rz(0.025, r[0] - 0.1, r[1] + 0.1, r[2] - 0.1, r[3] + 0.1)) + grid('xg', 0.026, r[0] - 0.1, r[1] + 0.1, r[2] - 0.1, r[3] + 0.1, 0.6, 1.2), { h: ['screed', 0.6] }); });
    I(3, 'screed', 0, null, pl('dmp', [0.04, WY - 0.05, 0.05, 0.04, 0.04, 0.05, WX - 0.05, 0.04, 0.05]) + pl('dmp', [3.55, 5.25, 0.05, 5.56, 5.25, 0.05]) + pl('dmp', [5.76, 5.15, 0.05, 5.76, WY - 0.05, 0.05]) +
      pl('dmp', [8.36, 5.25, 0.05, 8.36, WY - 0.05, 0.05]) + pl('dmp', [5.76, 0.04, 0.05, 5.76, 3.95, 0.05]) + pl('dmp', [9.24, 0.04, 0.05, 9.24, 3.95, 0.05]), { h: ['screed', 0.65] });
    var bc = ''; range(0.9, WX - 0.3, 1.5).forEach(function (x) { bc += pl('mk', [x, 0.2, 0.065, x, WY - 0.2, 0.065]); });
    I(3, 'screed', 0.3, null, bc, { h: ['screed', 0.65] });
    var fib = ''; for (var q = 0, sd = 7; q < 70; q++) { sd = (sd * 9301 + 49297) % 233280; var fx0 = sd / 233280 * (WX - 0.4) + 0.2; sd = (sd * 9301 + 49297) % 233280; var fy0 = sd / 233280 * (WY - 0.4) + 0.2; fib += pl('fib', [fx0, fy0, 0.066, fx0 + 0.12, fy0 + 0.05, 0.066]); }
    fl('screed', 0.55, pg('scr', rz(0.065, 0, WX, 0, WY)) + fib);
    WET.forEach(function (r) { fl('tile', 0, pg('hy2', rz(0.068, r[0], r[1], r[2], r[3]))); });
    TZ.forEach(function (r, i) { var st0 = i > 1 ? 0.3 : 0.6; fl('tile', 0.25, pg('tlf' + (i > 1 ? ' tlb' : ''), rz(0.075, r[0], r[1], r[2], r[3])) + grid('tg', 0.076, r[0], r[1], r[2], r[3], st0)); });
    var crs = ''; WET.forEach(function (r) { range(r[0] + 0.3, r[1] - 0.1, 0.3).forEach(function (x) { range(r[2] + 0.3, r[3] - 0.1, 0.3).forEach(function (y) { crs += pl('crs', [x - 0.06, y, 0.077, x + 0.06, y, 0.077]) + pl('crs', [x, y - 0.06, 0.077, x, y + 0.06, 0.077]); }); }); });
    fl('tile', 0.3, crs, { h: ['tile', 0.65] });
    TZ.forEach(function (r, i) { fl('tile', 0.7, grid('tgg', 0.077, r[0], r[1], r[2], r[3], i > 1 ? 0.3 : 0.6)); });
    PZ.forEach(function (r) { fl('floor', 0, pg('ulay', rz(0.07, r[0], r[1], r[2], r[3]))); });
    PZ.forEach(function (r) {
      var s = pg('pqf', rz(0.075, r[0], r[1], r[2], r[3])), a = 0;
      range(r[2] + 0.2, r[3] - 0.02, 0.2).forEach(function (y) { s += pl('pq', [r[0], y, 0.076, r[1], y, 0.076]); a++; range(r[0] + (a % 3) * 0.4 + 0.3, r[1] - 0.1, 1.2).forEach(function (x) { s += pl('pq', [x, y - 0.2, 0.076, x, y, 0.076]); }); });
      fl('floor', 0.35, s);
    });
    fl('floor', 0.75, pl('skr', [0.02, WY - 0.02, 0.1, 0.02, 0.02, 0.1, WX - 0.02, 0.02, 0.1]) + pl('skr', [5.74, 0.05, 0.1, 5.74, 3.98, 0.1]) + pl('skr', [9.22, 0.05, 0.1, 9.22, 3.98, 0.1]) + pl('skr', [3.55, 4.14, 0.1, 3.9, 4.14, 0.1]) + pl('skr', [5.3, 4.14, 0.1, 8.2, 4.14, 0.1]));

    // ── вікна: підвіконня (обʼєм перед стіною)
    WIN.forEach(function (w) { bx('win', 0.8, 'sill', w[0] - 0.05, w[1] + 0.05, 0, 0.22, WZ[0] - 0.04, WZ[0]); });
    bx('win', 0.8, 'sill', 0, 0.22, WK[0] - 0.05, WK[1] + 0.05, WKZ[0] - 0.04, WKZ[0]);

    // ── стелі: «голограма» каркаса на висоті стелі, короби з LED-нішами вздовж задніх стін, споти
    var cg = ''; range(0.6, WX - 0.1, 0.6).forEach(function (x) { cg += pl('cgr', [x, 0, H, x, WY, H]); }); range(1.2, WY - 0.1, 1.2).forEach(function (y) { cg += pl('cgr', [0, y, H, WX, y, H]); });
    I(3, 'ceil', 0, null, cg + pl('cgr2', [0, 0, H, WX, 0, H, WX, WY, H, 0, WY, H, 0, 0, H]), { h: ['tile', 0] });
    bx('ceil', 0.35, 'blk', 0, WX, 0, 0.45, H - 0.3, H); bx('ceil', 0.35, 'blk', 0, 0.45, 0.45, WY, H - 0.3, H);
    var spt = ''; [1.8, 4.0, 7.4, 10.6].forEach(function (x) { spt += circ('bulb', x, 0.22, H - 0.31, 1.6); }); [1.2, 5.6, 6.6].forEach(function (y) { spt += circ('bulb', 0.22, y, H - 0.31, 1.6); });
    I(3, 'ceil', 0.6, null, pl('led', [0.45, 0.46, H - 0.3, WX, 0.46, H - 0.3]) + pl('led', [0.46, 0.45, H - 0.3, 0.46, WY, H - 0.3]) + spt);

    // ── двері: приховані (врівень зі стіною) — ванна, санвузол, гардеробна; звичайні з лиштвою — спальня, дитяча; вхідні
    each([[4.4, 5.22, 0.7], [8.6, 5.22, 0.7], [10.4, 5.22, 0.8]], function (x, y, w) { bx('doors', 0.1, 'dh', x, x + 0.04, y, y + w, 0, ZC, { m: 'd' }); });
    each([[8.96, 3.2], [10.0, 3.2]], function (x, y) { bx('doors', 0.35, 'dr', x, x + 0.04, y, 4.0, 0, ZC, { m: 'd' }); });
    each([[8.2, 9.0], [10.0, 10.8]], function (a, b) { I(2, 'doors', 0.45, [a - 0.08, b + 0.08, 4.132, 4.132, 0, ZC], ph('arc l', [ry(4.132, a - 0.08, b + 0.08, 0, ZC), ry(4.132, a, b, 0, ZC)])); });
    bx('doors', 0.6, 'de', 6.5, 6.56, 6.35, WY, 0, ZF + 0.6, { m: 'd' });

    // ── меблі на замовлення: модуль за модулем (кухня, ТВ-зона, шафа в передпокої, гардеробна, дитяча)
    var fm = 0; function M(c, x0, x1, y0, y1, z0, z1, ex) { bx('furn', Math.min(0.85, fm), c, x0, x1, y0, y1, z0, z1, { m: 'd' }, ex); fm += 0.05; }
    M('kc', 0, 0.62, 4.15, 4.8, 0, 2.3, pl('hdl', [0.625, 4.72, 0.9, 0.625, 4.72, 1.5]));
    [[4.8, 5.4], [5.4, 6.0], [6.0, 6.6], [6.6, 7.15]].forEach(function (r) { M('kb', 0, 0.6, r[0], r[1], 0.1, 0.86, pl('hdl', [0.605, r[0] + 0.1, 0.78, 0.605, r[1] - 0.1, 0.78])); });
    M('ct', 0, 0.64, 4.8, 7.15, 0.86, 0.9);
    [[6.2, 6.65], [6.65, 7.15]].forEach(function (r) { M('kw', 0, 0.35, r[0], r[1], 1.55, 2.3); });
    M('kw', 0, 0.35, 4.8, 5.0, 1.55, 2.3);
    M('tvu', 0, 0.42, 0.9, 2.9, 0.12, 0.5);
    M('wrd', 5.75, 6.33, 5.25, 6.1, 0, 2.2, pl('hdl', [6.335, 5.68, 0.9, 6.335, 5.68, 1.3]));
    [[5.3, 5.9], [5.9, 6.5], [6.5, 7.15]].forEach(function (r) { var sh = ''; [0.5, 1.0, 1.5].forEach(function (z) { sh += pl('shl', [10.25, r[0] + 0.03, z, 10.25, r[1] - 0.03, z]); }); M('wro', 9.75, 10.25, r[0], r[1], 0, 2.0, sh); });
    M('dsk', 9.6, 11.6, 0.05, 0.65, 0.72, 0.76); M('wrd', 9.22, 9.55, 0.3, 1.9, 0, 1.2);
    M('tb', 1.4, 2.4, 4.9, 6.3, 0.72, 0.76, pl('lg', [1.5, 5.0, 0, 1.5, 5.0, 0.72]) + pl('lg', [2.3, 6.2, 0, 2.3, 6.2, 0.72]));

    // ── сантехприлади, техніка, кондиціонери, світло
    bx('light', 0, 'tub', 3.56, 5.3, 6.45, 7.17, 0, 0.58, { m: 'd' }, pg('tubi', rz(0.58, 3.66, 5.2, 6.55, 7.07)));
    bx('light', 0.1, 'vn', 3.55, 4.05, 5.65, 6.3, 0.4, 0.85, { m: 'd' }, pg('bwl', rz(0.851, 3.62, 3.98, 5.75, 6.2)));
    bx('light', 0.15, 'wcb', 8.56, 9.05, 6.1, 6.5, 0.32, 0.45, { m: 'd' });
    I(2, 'light', 0.2, [0, 0.64, 5.4, 6.9, 0.9, 1.25], pg('snk', rz(0.905, 0.1, 0.5, 5.35, 5.85)) + pl('tap', [0.08, 5.6, 0.9, 0.08, 5.6, 1.18, 0.25, 5.6, 1.18]) + pg('hob', rz(0.905, 0.08, 0.56, 6.45, 7.0)), { m: 'd' });
    bx('light', 0.25, 'acu', 8.4, 9.0, 0, 0.22, 2.15, 2.42, { m: 'd' }); bx('light', 0.25, 'acu', 11.3, 11.9, 0, 0.22, 2.15, 2.42, { m: 'd' }); bx('light', 0.25, 'acu', 0, 0.22, 2.6, 3.6, 2.15, 2.42, { m: 'd' });
    // вечір: тепле світло — сцена темніє, світяться LED, споти, підвіси, торшер
    var x0 = -T, x1 = WX + T, y0 = -T, y1 = WY + T;
    I(3, 'light', 0.45, null, '<polygon class="eve" points="' + [P(x0, y0, H), P(x1, y0, H), P(x1, y0, -0.32), P(x1, y1, -0.32), P(x0, y1, -0.32), P(x0, y1, H)].join(' ') + '"/>');
    var gl = '';
    [[1.6, 5.3], [2.2, 5.9]].forEach(function (p) { gl += pl('cab', [p[0], p[1], H, p[0], p[1], 1.75]) + pg('lmp', [p[0] - 0.22, p[1], 1.55, p[0] + 0.22, p[1], 1.55, p[0] + 0.08, p[1], 1.75, p[0] - 0.08, p[1], 1.75]) + circ('glo', p[0], p[1], 1.2, 26) + circ('bulb', p[0], p[1], 1.58, 2.6); });
    gl += pl('lg', [3.4, 3.4, 0.08, 3.4, 3.4, 1.55]) + pg('lmp', [3.22, 3.4, 1.45, 3.58, 3.4, 1.45, 3.48, 3.4, 1.65, 3.32, 3.4, 1.65]) + circ('glo', 3.4, 3.4, 1.1, 24);
    gl += circ('glo', 5.95, 0.5, 0.75, 16) + circ('glo', 5.95, 2.75, 0.75, 16) + circ('glo', 10.6, 0.4, 1.0, 16);
    [1.8, 4.0, 7.4, 10.6].forEach(function (x) { gl += circ('glo', x, 0.4, 1.6, 20); }); [1.2, 5.6, 6.6].forEach(function (y) { gl += circ('glo', 0.4, y, 1.6, 20); });
    I(3, 'light', 0.55, null, gl + pl('led2', [0.45, 0.46, H - 0.3, WX, 0.46, H - 0.3]) + pl('led2', [0.46, 0.45, H - 0.3, 0.46, WY, H - 0.3]) + pl('led2', [0.36, 4.8, 1.53, 0.36, 7.15, 1.53]), { c: 'lit' });

    // ── декор: диван, ліжка, килими, рослини, картини; клінінг — «блиск»
    var dc = 0; function D(c, x0, x1, y0, y1, z0, z1, ex) { bx('decor', Math.min(0.6, dc), c, x0, x1, y0, y1, z0, z1, { m: 'd' }, ex); dc += 0.04; }
    fl('decor', 0, pg('rug', rz(0.09, 1.2, 3.0, 0.9, 3.0)) + pg('rug2', rz(0.09, 6.0, 8.4, 2.6, 3.7)));
    D('sf', 3.0, 3.9, 0.8, 3.0, 0.1, 0.45); D('sf', 3.6, 3.9, 0.8, 3.0, 0.45, 0.85); D('sf', 3.0, 3.9, 0.8, 1.05, 0.45, 0.62); D('sf', 3.0, 3.9, 2.75, 3.0, 0.45, 0.62);
    D('tb', 1.9, 2.5, 1.5, 2.4, 0.3, 0.38);
    D('bed', 5.75, 7.8, 0.9, 2.5, 0.12, 0.5, pg('pil', rz(0.52, 5.85, 6.25, 1.0, 2.4)) + pg('bld', rz(0.505, 6.6, 7.78, 0.92, 2.48))); D('hb', 5.73, 5.82, 0.9, 2.5, 0.12, 1.05);
    D('ns', 5.75, 6.15, 0.35, 0.8, 0, 0.5); D('ns', 5.75, 6.15, 2.6, 3.05, 0, 0.5);
    D('bed', 9.25, 10.15, 2.3, 3.95, 0.12, 0.45, pg('bld2', rz(0.455, 9.6, 10.14, 2.32, 3.93)));
    [[1.0, 5.15], [1.0, 5.8], [2.55, 5.15], [2.55, 5.8]].forEach(function (p) { D('chr', p[0], p[0] + 0.36, p[1], p[1] + 0.36, 0, 0.45); });
    [[4.9, 0.4], [11.6, 3.6], [0.4, 3.75], [7.8, 6.8]].forEach(function (p) { D('pot', p[0] - 0.18, p[0] + 0.18, p[1] - 0.18, p[1] + 0.18, 0, 0.42, circ('cr', p[0], p[1], 0.85, 10) + circ('cr2', p[0] - 0.1, p[1] + 0.08, 1.05, 6)); });
    I(0, 'decor', 0.3, null, pg('art', ry(0.012, 2.66, 3.14, 1.15, 1.85)) + pg('art2', rx(0.012, 0.95, 2.85, 1.75, 2.15)) + pg('art', ry(0.012, 8.35, 9.0, 1.2, 1.8)), { m: 'd' });
    var spk = ''; [[2.0, 1.2, 0.5], [7.0, 1.6, 0.8], [4.6, 6.0, 0.9], [10.2, 2.4, 0.6], [1.0, 6.3, 1.1], [8.8, 6.2, 0.7], [10.8, 4.6, 0.3]].forEach(function (p) { var q = P(p[0], p[1], p[2]).split(','), x = +q[0], y = +q[1]; spk += '<path class="spk" d="M' + x + ' ' + (y - 5) + 'L' + (x + 1.2) + ' ' + (y - 1.2) + 'L' + (x + 5) + ' ' + y + 'L' + (x + 1.2) + ' ' + (y + 1.2) + 'L' + x + ' ' + (y + 5) + 'L' + (x - 1.2) + ' ' + (y + 1.2) + 'L' + (x - 5) + ' ' + y + 'L' + (x - 1.2) + ' ' + (y - 1.2) + 'Z"/>'; });
    I(3, 'decor', 0.5, null, spk, { h: ['done', 0.5] });

    // ── 3D-замір: сканер на тринозі, промені до кутів і прорізів, хмара точок, розміри
    var s0 = pl('tri', [2.6, 2.0, 0, 2.9, 2.2, 1.4, 3.2, 1.9, 0]) + pl('tri', [2.9, 2.2, 1.4, 2.95, 2.6, 0]) + box('tri-h', 2.8, 3.0, 2.1, 2.3, 1.4, 1.62);
    [[0, 0, H], [WX, 0, H], [0, WY, H], [0, 0, 0], [WX, 0, 0], [0, WY, 0], [1.0, 0, WZ[1]], [4.8, 0, WZ[0]], [6.6, 0, WZ[1]], [11.3, 0, WZ[0]], [0, WK[0], WKZ[1]], [WX, WY, 0]].forEach(function (q) { s0 += pl('lzr', [2.9, 2.2, 1.55].concat(q)) + circ('dot', q[0], q[1], q[2], 2); });
    for (var c2 = 0, sd2 = 3; c2 < 46; c2++) { sd2 = (sd2 * 9301 + 49297) % 233280; var u = sd2 / 233280; sd2 = (sd2 * 9301 + 49297) % 233280; var vv = sd2 / 233280 * H; s0 += c2 % 2 ? circ('pcl', u * WX, 0.01, vv, 0.9) : circ('pcl', 0.01, u * WY, vv, 0.9); }
    s0 += pl('dim', [0, WY + 0.8, 0, WX, WY + 0.8, 0]) + pl('dim', [0, WY + 0.6, 0, 0, WY + 1.0, 0]) + pl('dim', [WX, WY + 0.6, 0, WX, WY + 1.0, 0]) + tf('dt', 6, WY + 1.35, 0, num('12.00')) +
      pl('dim', [WX + 0.8, 0, 0, WX + 0.8, WY, 0]) + pl('dim', [WX + 0.6, 0, 0, WX + 1.0, 0, 0]) + pl('dim', [WX + 0.6, WY, 0, WX + 1.0, WY, 0]) + tf('dt', WX + 1.35, 3.6, 0, num('7.20'), 1);
    I(3, 'measure', 0, null, s0, { h: ['design', 0.4] });
    I(3, 'done', 0.2, null, seal(WX * 0.6, -T, H + 1.7, ui), { m: 'd' });
    return { parts: zsort(L), xr: -1, net: S('elec'), th: [['p-pl', S('plaster') + 0.45], ['p-pt', S('paint') + 0.4], ['p-eve', S('light') + 0.4]] };
  }

  /* ---------- «пиріг» шарів: кольори шарів (ті самі, що в сцені) ---------- */
  var PC = {
    net: ['#e8b75a', '#6f9fc4', '#e0705a', '#9a958e', '#c3c9cd'],
    fplate: ['#8a857e', '#e8e4dc', '#8fb3c9', '#1f1d1b', '#b3ada4', '#7e7a74', '#c9a86a', '#e6e2da'], ushp: ['#8a857e', '#8fb3c9', '#7e7a74', '#c9a86a', '#e6e2da', '#5d7a8b'],
    fstrip: ['#2f3a33', '#8fb3c9', '#1f1d1b', '#8a857e', '#c9a86a'], slab: ['#b58a5a', '#9a948b', '#6b8c6e', '#b2aba0', '#e3dbcd'],
    roof: ['#3a383d', '#a87b4c', '#8f6236', '#cfd8dd', '#d8c46a', '#9fb2bd', '#e3dbcd'], win: ['#7aa6c2', '#e6d48c', '#c4705f', '#d9d6d0'],
    floor: ['#b58a5a', '#9a948b', '#d9a64e', '#cfd8dd', '#8fb3c9', '#8a857e'], w_block: ['#e2dacd', '#c9c2b5', '#d8c46a', '#9a948b', '#bdb6aa', '#efe9df'],
    w_brick: ['#c08a5c', '#2a2622', '#d8c46a', '#9a4a30', '#efe9df'], w_frame: ['#8a6a4e', '#2a2622', '#cfd8dd', '#c9a96e', '#d8c46a', '#9fb2bd', '#a87b4c', '#efe9df'],
    w_brus: ['#d9a35c', '#b07d45', '#c9a86a', '#8f6236', '#6b8c6e'], f_wet: ['#d9d6d0', '#a9a39a', '#5d8fb5', '#86807a', '#3f6f95', '#c9c2b5', '#45403a'],
    f_floor: ['#c9c6c0', '#a9a39a', '#86807a', '#f0a04b', '#8fb3c9', '#6b8c6e', '#45403a'], f_wall: ['#e3dbcd', '#efe9df', '#d9d3c8', '#a69f95', '#c9c2b5', '#5f5952'],
    f_ceil: ['#efe9df', '#ddd6ca', '#9fb2bd', '#d9a64e', '#45403a'], f_part: ['#e3dbcd', '#ddd6ca', '#d8c46a', '#cfc8bc', '#6b8c6e'],
    f_pq: ['#b58a5a', '#6b8c6e', '#c9c2b5', '#86807a', '#45403a'], f_net: ['#e8b75a', '#b08be0', '#6fa8dc', '#e0705a', '#a8a39b', '#f0a04b', '#7fd3d9']
  };

  /* ---------- збірка блоку ---------- */
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function enhance(sec, data) {
    if (sec.hasAttribute('data-bz-on')) return;
    sec.setAttribute('data-bz-on', '');
    var ui = data.ui, scene = sec.getAttribute('data-bz') === 'flat' ? 'flat' : 'house';
    var ol = sec.querySelector('ol.bz-st'), cta = sec.querySelector('.bz-cta'); if (!cta) return;
    if (!ol) { ol = el('ol', 'bz-st'); cta.parentNode.insertBefore(ol, cta); } // сторінка на межі бюджету: список — лише з JSON
    var sx = secs.indexOf(sec) > 0 ? secs.indexOf(sec) + '-' : ''; // кілька блоків на сторінці (styleguide) — унікальні id
    if (!cta.id) cta.id = 'bz-cta' + (sx ? '-' + sx.slice(0, -1) : '');
    var mat = sec.getAttribute('data-bz-m'); if (MATS.indexOf(mat) < 0) mat = 'block';
    var fv = sec.getAttribute('data-bz-v') === 'old' ? 'old' : 'new', xr = false, cpt = sec.hasAttribute('data-bz-c'), hl = '';
    var seq, n, lis = [], sc, svg, layers = [], ghost, act = -1, cur = 0, raf = 0, top0 = 0, live = false, rm = !!(MQ && MQ.matches), man = 0, pieKey = null, pieSel = 0;
    function S(k) { return seq.indexOf(k); }
    function pieOf(k) { var a = data.pieAt[scene][k]; if (a && typeof a === 'object') a = a[mat]; return a && data.pie[a] ? a : null; }
    ol.classList.remove('steps'); ol.classList.add('bz-on-l');

    var run = el('div', 'bz-run'), pin = el('div', 'bz-pin'), side = el('div', 'bz-side'), fig = el('div', 'bz-fig');
    var skip = el('a', 'bz-skip'); skip.href = '#' + cta.id; skip.textContent = ui.skip;
    var hd = el('div', 'bz-hd'), ct = el('p', 'bz-ct'); ct.setAttribute('aria-hidden', 'true');
    var bar = el('div', 'bz-bar', '<i></i>'), bi = bar.firstChild; hd.appendChild(ct); hd.appendChild(bar);
    var ctl = el('div', 'bz-ctl'), nav = el('div', 'bz-nav'); nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', ui.nav);
    var prev = el('button', 'bz-pv', '<span aria-hidden="true">←</span>'), next = el('button', 'bz-nx', '<span aria-hidden="true">→</span>');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', ui.prev); next.setAttribute('aria-label', ui.next);
    prev.addEventListener('click', function () { go(Math.max(0, act - 1)); }); next.addEventListener('click', function () { go(Math.min(n - 1, act + 1)); });
    var pb = el('button', 'bz-pb'); pb.type = 'button'; pb.setAttribute('aria-expanded', 'false');
    var pie = el('div', 'bz-pie'); pie.setAttribute('role', 'group'); pie.id = 'bz-pie-' + scene;
    pb.setAttribute('aria-controls', pie.id);
    pb.addEventListener('click', function () { setPieOpen(!fig.classList.contains('pie-open')); });
    // рентген мереж (квартира): усі прокладені мережі крізь оздоблення + легенда з підсвіткою однієї мережі
    var xb = el('button', 'bz-xb'); xb.type = 'button'; xb.setAttribute('aria-pressed', 'false'); xb.textContent = ui.xr || '';
    xb.addEventListener('click', function () { setXr(!xr, 1); });
    var lg = el('div', 'bz-lg'); lg.setAttribute('role', 'group'); lg.setAttribute('aria-label', ui.xr || '');
    lg.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-n]'); if (!b) return; var k = b.getAttribute('data-n'); setHl(hl === k ? '' : k); cl('build_anim_net', k); });
    function setHl(k) { hl = k; if (svg) { if (k) svg.setAttribute('data-hl', k); else svg.removeAttribute('data-hl'); } [].forEach.call(lg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-n') === k ? 'true' : 'false'); }); }
    function setXr(v, user) {
      if (v === xr) return;
      xr = v; sec.classList.toggle('bz-xr', v); xb.setAttribute('aria-pressed', v ? 'true' : 'false');
      if (svg) svg.classList.toggle('xrf', v);
      if (!v) setHl('');
      layers.forEach(function (l) { l.k = -1; }); if (sc) render(cur);
      if (user) cl('build_anim_xray', v ? 'on' : 'off');
    }
    ctl.appendChild(prev); ctl.appendChild(nav); ctl.appendChild(pb); ctl.appendChild(next); hd.appendChild(xb);
    var btns = [];
    nav.addEventListener('keydown', function (e) {
      var i = btns.indexOf(d.activeElement); if (i < 0) return;
      var j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (j < 0 || j >= n) return;
      e.preventDefault(); btns[j].focus(); go(j);
    });
    var ch3 = cta.querySelector('h3');
    var goA = el('a', 'bz-go'); goA.href = '#' + cta.id; goA.textContent = (ch3 ? ch3.textContent : '') + ' →'; goA.tabIndex = -1;
    goA.addEventListener('click', function () { // після переходу до якоря — фокус на телефон у слоті заявки
      cl('build_anim_cta');
      setTimeout(function () { var i = cta.querySelector('input[type="tel"]'); if (i) try { i.focus({ preventScroll: true }); } catch (e) { i.focus(); } }, rm ? 0 : 700);
    });
    // перемикачі над сценою: сцена (головна), технологія стін (будинок) або варіант квартири (новобудова / вторинка)
    var mats = el('div', 'bz-mats');
    function grp(lbl, a, ks, cur0, nm) {
      return '<span class="bz-g" role="group"' + (lbl ? ' aria-label="' + esc(lbl) + '"><span class="bz-gl" aria-hidden="true">' + esc(lbl) + '</span>' : '>') +
        ks.map(function (k) { return '<button type="button" data-' + a + '="' + k + '" aria-pressed="' + (k === cur0) + '">' + esc(nm[k]) + '</button>'; }).join('') + '</span>';
    }
    function chips() {
      mats.innerHTML = (cpt && ui.sc ? grp('', 's', ['house', 'flat'], scene, ui.sc) : '') +
        (scene === 'house' ? grp(ui.mat, 'm', MATS, mat, ui.m) : ui.fl ? grp(ui.fl.v, 'v', data.fv || ['new', 'old'], fv, ui.fl) : '');
    }
    mats.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
      if (b.hasAttribute('data-m')) setMat(b.getAttribute('data-m'), 1);
      else if (b.hasAttribute('data-v')) { fv = b.getAttribute('data-v'); rebuild(); cl('build_anim_var', fv); }
      else if (b.hasAttribute('data-s')) { scene = b.getAttribute('data-s'); rebuild(); placePie(); cl('build_anim_scene', scene); }
      var f = mats.querySelector('button[aria-pressed="true"]' + (b.hasAttribute('data-s') ? '[data-s]' : '')); if (f) try { f.focus({ preventScroll: true }); } catch (x) { }
    });
    function rebuild() { build(); render(cur); }
    side.appendChild(hd); side.appendChild(ol); side.appendChild(pie); side.appendChild(ctl); side.appendChild(goA);
    fig.appendChild(mats); fig.appendChild(lg);
    pin.appendChild(skip); pin.appendChild(fig); pin.appendChild(side);
    run.appendChild(pin);
    cta.parentNode.insertBefore(run, cta);
    sec.classList.add('bz-on');

    // «пиріг»: список шарів з товщинами; наведення / фокус / тап — опис шару (aria-live)
    function renderPie(k, into) {
      var p = data.pie[k], o = p[1] === 'h' ? ui.h : p[1] === 'v' ? ui.v : p[1] === 's' && ui.s ? ui.s : ['', ''], cs = PC[k] || [];
      into.setAttribute('aria-label', p[0]);
      into.innerHTML = '<p class="bz-pt"><b>' + esc(p[0]) + '</b>' + (o[0] ? '<span>' + esc(ui.typ) + '</span>' : '') + '</p>' + (o[0] ? '<p class="bz-pe">' + esc(o[0]) + '</p>' : '') + '<ul>' +
        p[2].map(function (l, i) { return '<li style="--i:' + i + '"><button type="button" data-i="' + i + '" aria-pressed="' + (i === 0) + '"><i style="background:' + (cs[i] || '#888') + '"></i><span>' + esc(l[0]) + '</span><em>' + esc(l[1]) + '</em></button></li>'; }).join('') +
        '</ul>' + (o[1] ? '<p class="bz-pe">' + esc(o[1]) + '</p>' : '') + '<p class="bz-pd" aria-live="polite">' + esc(p[2][0][2]) + '</p>' +
        '<button type="button" class="bz-px" aria-label="' + esc(ui.close) + '">×</button>';
    }
    function selLayer(i, user) {
      if (!pieKey) return;
      var p = data.pie[pieKey]; if (!p[2][i]) return;
      pieSel = i;
      [].forEach.call(pie.querySelectorAll('ul button'), function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      var pd = pie.querySelector('.bz-pd'); if (pd) pd.textContent = p[2][i][2];
      if (user) cl('build_anim_pie', pieKey);
    }
    pie.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.classList.contains('bz-px')) { setPieOpen(false); pb.focus(); return; }
      if (b.hasAttribute('data-i')) selLayer(+b.getAttribute('data-i'), 1);
    });
    pie.addEventListener('pointerover', function (e) { if (e.pointerType !== 'mouse') return; var b = e.target.closest && e.target.closest('button[data-i]'); if (b) selLayer(+b.getAttribute('data-i')); });
    pie.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('button[data-i]'); if (b) selLayer(+b.getAttribute('data-i')); });
    pie.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fig.classList.contains('pie-open')) { setPieOpen(false); pb.focus(); } });
    function setPieOpen(v) { fig.classList.toggle('pie-open', v); pb.setAttribute('aria-expanded', v ? 'true' : 'false'); if (v) { var f = pie.querySelector('ul button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { } } }
    function setPie(k) {
      if (k === pieKey) return;
      pieKey = k; pieSel = 0;
      if (k) { renderPie(k, pie); pie.classList.remove('is-x'); void pie.offsetWidth; pie.classList.add('is-x'); pb.textContent = ui.pie + ' (' + data.pie[k][2].length + ')'; }
      else { pie.innerHTML = ''; if (fig.classList.contains('pie-open')) setPieOpen(false); }
      pie.classList.toggle('is-on', !!k); pb.classList.toggle('is-on', !!k); pb.disabled = !k;
    }
    function placePie() { // телефон — пиріг над сценою за кнопкою; десктоп — у колонці під описом (місце зарезервоване: CLS 0)
      var mob = !!(MOB && MOB.matches);
      if (mob && pie.parentNode !== fig) fig.appendChild(pie); else if (!mob && pie.parentNode !== side) { side.insertBefore(pie, ctl); setPieOpen(false); }
      reserve();
    }
    function reserve() { // мінімальна висота пирога = найбільший пиріг поточної технології
      pie.style.minHeight = '';
      if (MOB && MOB.matches) return;
      var tmp = el('div', 'bz-pie is-on'); tmp.style.cssText = 'position:absolute;visibility:hidden;left:0;right:0;top:0'; side.appendChild(tmp);
      var mx = 0; seq.forEach(function (k) { var p = pieOf(k); if (p) { renderPie(p, tmp); mx = Math.max(mx, tmp.offsetHeight); } });
      side.removeChild(tmp);
      pie.style.minHeight = mx ? mx + 'px' : '';
    }

    function build() { // текст етапів (JSON = той самий текст, що в HTML для стартового матеріалу), кнопки, сцена
      seq = scene === 'flat' ? data.flat : data.mats[mat]; n = seq.length;
      if (scene === 'flat') { SY = K * 0.6; ZK = K * 0.8; } else { SY = K * 0.5; ZK = K; } // квартира — трохи «згори»: низькі перегородки не ховають кімнати
      var st = data.st[scene], suf = fv === 'new' ? '_n' : '_o';
      ol.innerHTML = seq.map(function (k, i) { var s = (scene === 'flat' && st[k + suf]) || st[k] || ['', '']; return '<li id="bz-s' + sx + i + '"><div><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div></li>'; }).join('');
      lis = [].slice.call(ol.children);
      nav.innerHTML = '';
      btns = lis.map(function (li, i) {
        var b = el('button', 'bz-b'); b.type = 'button';
        b.innerHTML = '<span>' + (i + 1) + '</span>';
        b.setAttribute('aria-label', ui.st + ' ' + (i + 1) + ': ' + li.querySelector('b').textContent);
        b.setAttribute('aria-controls', li.id);
        b.addEventListener('click', function () { go(i); });
        nav.appendChild(b);
        return b;
      });
      run.style.setProperty('--n', n);
      bb = [1e9, 1e9, -1e9, -1e9];
      sc = scene === 'flat' ? flat(S, ui, fv, lang) : house(mat, S, ui);
      var body = '', nb = '';
      sc.parts.forEach(function (p, i) {
        var v = typeof p.v === 'function' ? '' : p.v;
        if (typeof p.v === 'function') p.v(1); // габарити з урахуванням повної висоти
        var h = p.s < -1 && p.e < 0 && !p.c ? v : '<g class="bz-l' + (p.c ? ' ' + p.c : '') + '" data-i="' + i + '">' + v + '</g>';
        if (p.n) nb += h; else body += h;
      });
      if (scene === 'flat') body = '<g class="bz-sc">' + body + '</g><g class="bz-nt">' + nb + '</g>'; else body += nb;
      var pad = 12, vb = [bb[0] - pad, bb[1] - pad - 30, bb[2] - bb[0] + pad * 2, bb[3] - bb[1] + pad * 2 + 30].map(function (v) { return v.toFixed(0); }).join(' ');
      var h2 = sec.querySelector('h2'), old = fig.querySelector('svg');
      var html = '<svg viewBox="' + vb + '" role="img" aria-label="' + esc(ui.fig + (h2 ? h2.textContent : '')) + '" focusable="false" preserveAspectRatio="xMidYMid meet" class="' + (scene === 'flat' ? 'f-' + fv : 'm-' + mat) + '">' +
        '<defs><linearGradient id="bz-gw-' + scene + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8"/><stop offset="1" stop-color="#e2a24f"/></linearGradient>' +
        '<radialGradient id="bz-rg-' + scene + '"><stop offset="0" stop-color="#f6c978" stop-opacity=".55"/><stop offset="1" stop-color="#f6c978" stop-opacity="0"/></radialGradient>' + pats() + '</defs>' + body + '</svg>';
      var tmp = el('div', '', html), nsvg = tmp.firstChild;
      if (old) fig.replaceChild(nsvg, old); else fig.insertBefore(nsvg, fig.firstChild);
      svg = nsvg;
      svg.style.setProperty('--gw', 'url(#bz-gw-' + scene + ')'); svg.style.setProperty('--rg', 'url(#bz-rg-' + scene + ')');
      var gs = svg.querySelectorAll('g.bz-l[data-i]');
      layers = [].map.call(gs, function (g) { var p = sc.parts[+g.getAttribute('data-i')]; return { g: g, p: p, k: -1 }; });
      ghost = svg.querySelector('.ghost');
      act = -1; pieKey = undefined;
      chips();
      xb.hidden = lg.hidden = scene !== 'flat';
      if (scene === 'flat' && data.pie.f_net) lg.innerHTML = data.pie.f_net[2].map(function (l, i) { return '<button type="button" data-n="' + NETS[i] + '" aria-pressed="false"><i style="background:' + PC.f_net[i] + '"></i>' + esc(l[0]) + '</button>'; }).join('');
      if (xr) { svg.classList.add('xrf'); if (scene !== 'flat') setXr(false); }
      setHl('');
      msg();
      reserve();
    }
    function msg() { // конфігурація → коментар заявки (lead-form.v1.js читає data-msg найближчого предка форми)
      if (cpt && data.cta) { // головна: перемикач сцени міняє заклик і послугу заявки
        if (ch3) ch3.textContent = data.cta[scene]; goA.textContent = data.cta[scene] + ' →';
        var sv = data.svc && data.svc[scene], s2 = cta.querySelector('.lq-slot');
        if (sv && s2) { s2.setAttribute('data-service', sv); var f2 = s2.querySelector('form'); if (f2) f2.setAttribute('data-service', sv); }
      }
      var sl = cta.querySelector('.lq-slot'); if (!sl) return;
      sl.setAttribute('data-msg', scene === 'flat' ? (ui.sc ? ui.sc.flat + ': ' : '') + (ui.fl ? ui.fl[fv] : fv) : (ui.sc ? ui.sc.house + ': ' : '') + ui.m[mat]);
    }
    function setMat(m, user) {
      mat = m; build(); render(cur);
      if (user) cl('build_anim_mat', mat);
    }

    function render(s) {
      for (var j = 0; j < layers.length; j++) {
        var Ly = layers[j], p = Ly.p, k = p.s < -1 ? 1 : clamp((s - p.s) / 0.25);
        if (p.e >= 0) k *= 1 - clamp((s - p.e) / 0.25);
        k = Math.round(k * 100) / 100;
        if (p.e >= 0 && xr && p.n) k = p.s < -1 ? 1 : clamp((s - p.s) / 0.25); // рентген: прокладені мережі видно й під оздобленням
        if (k === Ly.k) continue;
        Ly.k = k;
        if (p.m === 'g') { var h = p.v(k); if (h !== Ly.h) { Ly.h = h; Ly.g.innerHTML = h; } continue; }
        Ly.g.style.opacity = k;
        if (p.m === 'd') Ly.g.setAttribute('transform', k < 1 ? 'translate(0 ' + (-(1 - k) * 30).toFixed(1) + ')' : '');
      }
      if (ghost) ghost.style.opacity = (0.5 * (1 - clamp(s / (n * 0.6)))).toFixed(3);
      if (sc.xr >= 0) svg.classList.toggle('xr', s >= sc.xr + 0.08 && s < sc.xr + 1);
      sc.th.forEach(function (q) { svg.classList.toggle(q[0], q[1] >= 0 && s >= q[1]); });
      var end = s >= n - 0.25;
      if (end !== sec.classList.contains('bz-end')) {
        sec.classList.toggle('bz-end', end); goA.tabIndex = end || rm ? 0 : -1;
        if (end && !rm && !sec.__baSeen) { sec.__baSeen = 1; cl('build_anim_end'); }
      }
      bi.style.transform = 'scaleX(' + clamp(s / n).toFixed(4) + ')';
      var a = Math.min(n - 1, Math.max(0, Math.floor(s)));
      if (a !== act) {
        act = a;
        ct.innerHTML = '<b>' + ('0' + (a + 1)).slice(-2) + '</b> / ' + ('0' + n).slice(-2);
        lis.forEach(function (li, i) { li.classList.toggle('is-on', i === a); li.classList.toggle('is-done', i < a); });
        btns.forEach(function (b, i) { b.classList.toggle('is-done', i < a); if (i === a) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
        prev.disabled = a === 0; next.disabled = a === n - 1;
        setPie(pieOf(seq[a]));
        if (scene === 'flat') { xb.disabled = a < sc.net; if (xb.disabled && xr) setXr(false); }
      }
    }
    function span() { return run.offsetHeight - pin.offsetHeight; }
    // прогрес 0…1 → етап: старт із 0.6 (на вході в блок перший етап уже намальований)
    function target() {
      if (rm) return man;
      var sp = span(); if (sp <= 0) return n;
      return 0.6 + clamp((top0 - run.getBoundingClientRect().top) / sp) * (n - 0.6);
    }
    function tick() {
      raf = 0;
      var tg = target();
      cur += (tg - cur) * 0.16;
      if (Math.abs(tg - cur) < 0.004) cur = tg;
      render(cur);
      if (cur !== tg) raf = W.requestAnimationFrame(tick);
    }
    function kick() { if (!raf) raf = W.requestAnimationFrame(tick); }
    function measure() { top0 = parseFloat(W.getComputedStyle(pin).top) || 0; kick(); }
    function go(i) {
      if (rm) { man = i + 0.85; cur = man; render(cur); return; }
      var r = run.getBoundingClientRect(), y = W.pageYOffset + r.top - top0 + span() * clamp((i + 0.85 - 0.6) / (n - 0.6));
      W.scrollTo({ top: Math.round(y), behavior: 'smooth' });
    }
    function mode() {
      rm = !!(MQ && MQ.matches);
      sec.classList.toggle('bz-rm', rm);
      if (rm) { if (!man) man = n - 0.02; cur = man; render(cur); } else { cur = target(); render(cur); }
      measure();
    }
    W.addEventListener('scroll', function () { if (live && !rm) kick(); }, { passive: true });
    W.addEventListener('resize', function () { measure(); }, { passive: true });
    if (MQ) { if (MQ.addEventListener) MQ.addEventListener('change', mode); else if (MQ.addListener) MQ.addListener(mode); }
    if (MOB) { if (MOB.addEventListener) MOB.addEventListener('change', placePie); else if (MOB.addListener) MOB.addListener(placePie); }
    if ('IntersectionObserver' in W) {
      new IntersectionObserver(function (es) { live = es[0].isIntersecting; if (live) kick(); }).observe(run);
    } else live = true;
    // мікровзаємодії (лише миша, без prefers-reduced-motion): легкий нахил сцени за курсором і «магнітна» кнопка CTA
    if (W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      fig.addEventListener('pointermove', function (e) {
        if (rm || e.target.closest('.bz-mats,.bz-pie,.bz-lg')) return;
        var r = fig.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        svg.style.transform = 'perspective(1600px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 7).toFixed(2) + 'deg)';
      });
      fig.addEventListener('pointerleave', function () { svg.style.transform = ''; });
      goA.addEventListener('pointermove', function (e) {
        if (rm) return;
        var r = goA.getBoundingClientRect();
        goA.style.translate = ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px';
      });
      goA.addEventListener('pointerleave', function () { goA.style.translate = ''; });
    }
    build();
    placePie();
    render(0.6);
    mode();
  }

  /* ---------- ліниве завантаження: CSS + JSON → сцена, за ~3 екрани до блоку ---------- */
  var cssP = null, dataP = null;
  function css() {
    if (!cssP) cssP = new Promise(function (res) {
      var s0 = d.querySelector('section.bz[data-css]'), href = (s0 && s0.getAttribute('data-css')) || '/assets/build-anim.v1.css';
      var l0 = d.querySelector('link[href="' + href + '"]');
      if (l0) { if (l0.sheet) return res(); l0.addEventListener('load', res); l0.addEventListener('error', res); return; }
      var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href;
      l.onload = l.onerror = function () { res(); };
      d.head.appendChild(l);
    });
    return cssP;
  }
  function data() {
    if (!dataP) dataP = fetch('/assets/build-anim.v1.' + lang + '.json?v=' + VER[lang], { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw r; return r.json(); });
    return dataP;
  }
  // CLS = 0: блок перебудовується лише поза кадром. Якщо сторінка відкрилась одразу на ньому (якір, відновлення прокрутки),
  // людина бачить звичайний список етапів, а сцена зʼявиться, щойно блок вийде з кадру (вище/нижче — скрол-якоріння тримає екран).
  function inView(sec) { var r = sec.getBoundingClientRect(); return r.top < (W.innerHeight || 0) && r.bottom > 0; }
  function start(sec) {
    Promise.all([css(), data()]).then(function (r) {
      var dt = r[1];
      if (!inView(sec) || !('IntersectionObserver' in W)) return enhance(sec, dt);
      var o = new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) { o.disconnect(); enhance(sec, dt); } });
      o.observe(sec);
    }).catch(function () { }); // без даних — лишається звичайний список етапів
  }
  // нуль роботи на завантаженні (TBT/LCP): спостерігач вмикається лише після першої прокрутки сторінки
  function arm() {
    W.removeEventListener('scroll', arm);
    if (!('IntersectionObserver' in W)) return secs.forEach(start);
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } });
    }, { rootMargin: '300% 0px 300% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  }
  if ((W.pageYOffset || 0) > 0 || W.__casBAs) arm(); else W.addEventListener('scroll', arm, { passive: true });
})();
