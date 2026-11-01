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
  var VER = {"en":"a8d0eebe","ru":"d129230e","uk":"7dd8b65c"}; /*ver*/
  var MQ = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)');
  var MOB = W.matchMedia && W.matchMedia('(max-width:767px)');
  var lang = (d.documentElement.lang || 'uk').slice(0, 2); if (!VER[lang]) lang = 'uk';
  var MATS = ['block', 'brick', 'frame', 'brus'];
  function cl(ev, v) { try { if (W.clarity) W.clarity('event', ev); if (v && W.clarity) W.clarity('set', ev, v); } catch (e) { } } // аналітика: кінець, CTA, матеріал, пиріг
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- ізометрія: x → вправо-вниз, y → вліво-вниз, z → вгору (1 м = K px) ---------- */
  var K = 18, CX = K * 0.8660254, SY = K * 0.5, bb;
  function P(x, y, z) {
    var a = (x - y) * CX, b = (x + y) * SY - z * K;
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

  /* ---------- сцена «квартира» (розріз): 3D-замір → демонтаж → перегородки → електрика → сантехніка → стяжка → штукатурка → стелі → плитка → фарба → підлога й двері → меблі → здача ---------- */
  function flat(S, ui) {
    var L = [];
    function A(key, fr, v, o) { var i = S(key); if (i < 0 || !v) return; o = o || {}; var e = -1; if (o.h) { var j = S(o.h[0]); if (j >= 0) e = j + (o.h[1] || 0) * 0.6; } L.push({ s: i + (fr || 0) * 0.6, v: v, m: typeof v === 'function' ? 'g' : (o.m || 'f'), e: e, c: o.c || '' }); }
    function B(v, h) { var e = -1; if (h) { var j = S(h[0]); if (j >= 0) e = j + (h[1] || 0) * 0.6; } L.push({ s: -9, v: v, m: 'f', e: e, c: '' }); }
    var WX = 12, WY = 9, H = 3, PX = 7, PT = 0.2, PY = 5.2, DY0 = 3.4, DY1 = 4.4, DZ = 2.1, WIN = [2, 5.2, 0.9, 2.6];
    var wallA = [ry(0, -0.3, WX, 0, H), ry(0, WIN[0], WIN[1], WIN[2], WIN[3])], wallB = [rx(0, 0, WY, 0, H)];
    B(box('cut', -0.3, WX, -0.3, WY, -0.35, 0) + pg('flr', rz(0, 0, WX, 0, WY)) + pg('sky', ry(-0.3, WIN[0], WIN[1], WIN[2], WIN[3])) +
      pg('cut t', rz(H, -0.3, WX, -0.3, 0)) + ph('cw l', wallA) + pg('cut r', rx(WX, -0.3, 0, 0, H)) +
      pg('cut t', rz(H, -0.3, 0, 0, WY)) + ph('cw r', wallB) + pg('cut l', ry(WY, -0.3, 0, 0, H)));
    B('<g class="ghost">' + box('gh', PX, PX + PT, 0, PY, 0, H) + box('gh', 0, 0.65, 0.4, 4.6, 0, 0.95) + box('gh', 2.6, 5.8, 6.6, 7.85, 0, 0.85) + '</g>');
    // старі покриття (до демонтажу)
    B(pg('old', rz(0.03, 0.4, 6.6, 0.4, 5.6)) + pl('oldl', [1.2, 1, 0.03, 5.6, 4.4, 0.03]) + pl('oldl', [2, 4.8, 0.03, 6.2, 1.2, 0.03]), ['demo', 0.25]);
    // підлога: труби, тепла підлога, стяжка, гідроізоляція, плитка, паркет
    A('plumb', 0, pl('pc', [11.5, 0.35, 0.03, 11.5, 5.0, 0.03, 7.6, 5.0, 0.03]) + pl('ph', [11.2, 0.35, 0.03, 11.2, 4.75, 0.03, 7.6, 4.75, 0.03]) + pl('pc', [11.5, 0.6, 0.03, 10.5, 0.6, 0.03]) + pl('pc', [11.5, 1.6, 0.03, 8.2, 1.6, 0.03]) + pl('ph', [11.2, 1.3, 0.03, 8.2, 1.3, 0.03]) +
      pl('pc', [7.6, 5.0, 0.03, 0.75, 5.0, 0.03, 0.75, 3.3, 0.03]) + pl('ph', [7.6, 4.75, 0.03, 1.0, 4.75, 0.03, 1.0, 3.3, 0.03]) + pl('swp', [10.4, 0.5, 0.03, 10.4, 3.6, 0.03, 11.7, 3.6, 0.03]));
    A('screed', 0, pl('loop', zig(0.5, PX - 0.4, 5.6, WY - 0.4, 0.04, 0.3)) + pl('dmp', [0.05, 0.05, 0.06, 0.05, WY, 0.06]) + pl('dmp', [0.05, 0.05, 0.06, WX, 0.05, 0.06]));
    A('screed', 0.5, pg('scr', rz(0.06, 0, WX, 0, WY)) + (function () { var s = ''; range(1.5, WX - 0.5, 1.5).forEach(function (x) { s += pl('mk', [x, 0.2, 0.065, x, WY - 0.2, 0.065]); }); return s; })());
    A('plumb', 0.5, pg('hyw', rz(0.065, PX + PT, WX, 0, PY)));
    var tl = '';
    for (var tx = PX + PT + 0.6; tx < WX; tx += 0.6) tl += pl('tg', [tx, 0, 0.07, tx, PY, 0.07]);
    for (var ty = 0.6; ty < PY; ty += 0.6) tl += pl('tg', [PX + PT, ty, 0.07, WX, ty, 0.07]);
    A('tile', 0, pg('tlf', rz(0.07, PX + PT, WX, 0, PY)) + tl + pg('drain', rz(0.072, 10.2, 10.5, 3.2, 3.5)));
    var pq = '';
    for (var x = 0.6; x < WX; x += 0.6) pq += pl('pq', x > PX ? [x, PY, 0.07, x, WY, 0.07] : [x, 0, 0.07, x, WY, 0.07]);
    A('floor', 0, ph('pqf', [rz(0.07, 0, WX, 0, WY), rz(0.07, PX, WX, 0, PY)]) + pq + pl('skr', [0.02, WY, 0.12, 0.02, 0.02, 0.12, PX, 0.02, 0.12]));
    // стіни: кабелі в штробах, маяки, штукатурка, гідроізоляція, фарба, плитка, щит і колектор
    var e2 = pl('el', [0.6, 0, 2.7, 11.6, 0, 2.7]) + pl('el', [1.2, 0, 2.7, 1.2, 0, 0.35]) + pl('el', [6.3, 0, 2.7, 6.3, 0, 1]) + pl('el', [9.4, 0, 2.7, 9.4, 0, 1.2]) +
      pl('el', [0, 0.6, 2.7, 0, 8.6, 2.7]) + pl('el', [0, 2.5, 2.7, 0, 2.5, 1.05]) + pl('el', [0, 7, 2.7, 0, 7, 0.35]) + pl('el', [0, 8.3, 2.7, 0, 8.3, 2.0]);
    [[1.2, 0.35], [6.3, 1], [9.4, 1.2]].forEach(function (p) { e2 += pg('sb', ry(0.01, p[0] - 0.12, p[0] + 0.12, p[1] - 0.12, p[1] + 0.12)); });
    [[2.5, 1.05], [7, 0.35]].forEach(function (p) { e2 += pg('sb', rx(0.01, p[0] - 0.12, p[0] + 0.12, p[1] - 0.12, p[1] + 0.12)); });
    A('elec', 0, e2);
    A('plumb', 0, pl('pc', [11.7, 0.25, 0, 11.7, 0.25, H]) + pl('ph', [11.45, 0.25, 0, 11.45, 0.25, H]) + pl('swp', [11.9, 0.3, 0, 11.9, 0.3, H]));
    var mk = ''; range(0.8, WX - 0.4, 1.4).forEach(function (x) { mk += pl('mk', [x, 0.02, 0.1, x, 0.02, H - 0.1]); }); range(0.8, WY - 0.4, 1.4).forEach(function (y) { mk += pl('mk', [0.02, y, 0.1, 0.02, y, H - 0.1]); });
    A('plaster', 0, mk);
    A('plaster', 0.4, ph('pls l', wallA) + ph('pls r', wallB));
    A('plumb', 0.5, pg('hyw', ry(0.02, PX + PT, WX, 0, 0.3)) + pg('hyw', ry(0.02, 10.2, WX, 0, 2.0)));
    A('paint', 0, ph('pt l', wallA) + ph('pt r', wallB));
    var tw = '';
    for (var tx2 = PX + PT + 0.6; tx2 < WX; tx2 += 0.6) tw += pl('tg', [tx2, 0.03, 0, tx2, 0.03, 2.4]);
    for (var tz = 0.6; tz < 2.4; tz += 0.6) tw += pl('tg', [PX + PT, 0.03, tz, WX, 0.03, tz]);
    A('tile', 0.3, pg('tw', ry(0.03, PX + PT, WX, 0, 2.4)) + tw + pg('tw r', rx(0.03, 0.4, 4.6, 0.95, 1.6)) + (function () { var s = ''; range(0.7, 4.4, 0.3).forEach(function (y) { s += pl('tg', [0.03, y, 0.95, 0.03, y, 1.6]); }); return s; })());
    A('elec', 0.3, box('pan', 0, 0.12, 7.9, 8.6, 1.4, 2.0));
    A('plumb', 0.2, box('col', 11.3, 11.9, 1.0, 1.15, 0.4, 1.0));
    // демонтаж: стара перегородка зникає, будсміття в мішках — вивозимо
    B(box('oldw', 3.7, 3.9, 0, 4.4, 0, H), ['demo', 0.3]);
    A('demo', 0.35, pg('heap', [4.6, 6.2, 0.03, 6.4, 6, 0.03, 5.4, 6.9, 0.6]) + pg('heap2', [6.4, 6, 0.03, 6.2, 7.6, 0.03, 5.4, 6.9, 0.6]) + box('bag', 6.6, 7.2, 6.6, 7.1, 0.03, 0.55) + box('bag', 6.8, 7.4, 7.3, 7.8, 0.03, 0.5), { h: ['part', 0.2] });
    // перегородка росте рядами газоблоку
    A('part', 0, function (k) {
      var z = Math.round(H * k / 0.25) * 0.25; if (z <= 0) return '';
      var hole = z > 0.05 ? [rx(PX + PT, DY0, DY1, 0, Math.min(z, DZ))] : [];
      return ph('pw r', [rx(PX + PT, 0, PY, 0, z)].concat(hole)) + pg('pw l', ry(PY, PX, PX + PT, 0, z)) +
        (z > DZ ? pg('pw t', rz(z, PX, PX + PT, 0, PY)) + pg('lnt r', rx(PX + PT + 0.005, DY0 - 0.2, DY1 + 0.2, DZ, DZ + 0.25)) : pg('pw t', rz(z, PX, PX + PT, 0, DY0)) + pg('pw t', rz(z, PX, PX + PT, DY1, PY)));
    });
    // вікно (наявне), двері, стелі з нішами під світло
    B(pg('gl gd-l', ry(0.01, WIN[0], WIN[1], WIN[2], WIN[3])) + pl('mu', [3.6, 0.01, WIN[2], 3.6, 0.01, WIN[3]]));
    A('floor', 0.4, pg('dr', [PX + PT, DY0, 0.07, PX + PT + 0.9, DY0 - 0.1, 0.07, PX + PT + 0.9, DY0 - 0.1, DZ, PX + PT, DY0, DZ]) + ph('arc r', [rx(PX + PT + 0.01, DY0 - 0.1, DY1 + 0.1, 0.07, DZ + 0.1), rx(PX + PT + 0.01, DY0, DY1, 0.07, DZ)]));
    A('ceil', 0, box('blk', 0, WX, 0, 0.55, H - 0.32, H) + box('blk', 0, 0.55, 0.55, WY, H - 0.32, H), { m: 'd' });
    A('ceil', 0.4, pl('led', [0.6, 0.6, H - 0.34, WX, 0.6, H - 0.34]) + pl('led', [0.6, 0.6, H - 0.34, 0.6, WY, H - 0.34]));
    // меблі: кухня, стіл, шафа, умивальник, душ, диван, килим
    A('furn', 0, pg('rug', rz(0.08, 2, 6.4, 4.8, 8.4)));
    A('furn', 0.2, box('kw', 0, 0.38, 0.4, 4.6, 1.6, 2.4) + box('kb', 0, 0.65, 0.4, 4.6, 0, 0.88) + box('ct', 0, 0.7, 0.35, 4.65, 0.88, 0.95) +
      box('wrd', 0, 0.62, 5.4, 8.6, 0, 2.4) + pg('vn t', rz(0.85, 9.8, 11.2, 0, 0.5)) + pg('vn r', rx(11.2, 0, 0.5, 0.5, 0.85)) + pg('vn l', ry(0.5, 9.8, 11.2, 0.5, 0.85)) +
      pg('mir', ry(0.035, 10, 11, 1.2, 2)) + pg('glp', ry(1.8, PX + PT, 9, 0.07, 2.1)) +
      pl('lg', [2.8, 2.8, 0, 2.8, 2.8, 0.72]) + pl('lg', [4.4, 3.4, 0, 4.4, 3.4, 0.72]) + box('tb', 2.6, 4.6, 2.6, 3.6, 0.72, 0.78) +
      box('sf', 2.6, 5.8, 6.6, 7.5, 0.1, 0.45) + box('sf', 2.6, 5.8, 7.5, 7.85, 0.1, 0.85) + box('sf', 5.5, 5.8, 6.6, 7.5, 0.1, 0.62), { m: 'd' });
    // світло: споти в нішах (стелі), підвіси й рослина (здача)
    var sp = ''; [2, 4.5, 7, 9.5].forEach(function (x) { sp += circ('bulb', x, 0.3, H - 0.33, 1.8); }); [2, 4.5, 7].forEach(function (y) { sp += circ('bulb', 0.3, y, H - 0.33, 1.8); });
    A('ceil', 0.6, sp);
    var l7 = '';
    [[3.6, 3.1], [9.6, 2.6], [4.2, 7.2]].forEach(function (p) { l7 += pl('cab', [p[0], p[1], H, p[0], p[1], 2.25]) + pg('lmp', [p[0] - 0.35, p[1], 2.05, p[0] + 0.35, p[1], 2.05, p[0] + 0.12, p[1], 2.3, p[0] - 0.12, p[1], 2.3]) + circ('glo', p[0], p[1], 1.9, 16) + circ('bulb', p[0], p[1], 2.02, 3); });
    l7 += box('pot', 10.6, 11.1, 7.6, 8.1, 0.07, 0.55) + circ('cr', 10.85, 7.85, 1.15, 13) + circ('cr2', 10.65, 8.05, 1.35, 8);
    A('done', 0, l7);
    // 3D-замір: сканер і промені (зникають після демонтажу)
    var s0 = pl('tri', [5.6, 5, 0, 6, 5.2, 1.4, 6.4, 4.8, 0]) + pl('tri', [6, 5.2, 1.4, 6.1, 5.7, 0]) + box('tri-h', 5.85, 6.15, 5.05, 5.35, 1.4, 1.65);
    [[0, 0, H], [WX, 0, H], [0, WY, H], [0, 0, 0], [WX, 0, 0.6], [0, WY, 0.6], [WIN[0], 0, WIN[3]], [WIN[1], 0, WIN[2]]].forEach(function (q) { s0 += pl('lzr', [6, 5.2, 1.55].concat(q)) + circ('dot', q[0], q[1], q[2], 2.2); });
    s0 += pl('dim', [0, WY + 0.6, 0, WX, WY + 0.6, 0]) + txt('dt', 5.4, WY + 1.5, 0, 30, '12,0') + pl('dim', [WX + 0.6, 0, 0, WX + 0.6, WY, 0]) + txt('dt', WX + 1.4, 3.8, 0, -30, '9,0');
    A('measure', 0, s0, { h: ['demo', 0.4] });
    A('done', 0.2, seal(WX + 1.2, -0.6, 3.6, ui), { m: 'd' });
    return { parts: L, xr: -1, th: [['p-pl', S('plaster') + 0.45], ['p-pt', S('paint') + 0.4]] };
  }

  /* ---------- «пиріг» шарів: кольори шарів (ті самі, що в сцені) ---------- */
  var PC = {
    net: ['#e8b75a', '#6f9fc4', '#e0705a', '#9a958e', '#c3c9cd'],
    fplate: ['#8a857e', '#e8e4dc', '#8fb3c9', '#1f1d1b', '#b3ada4', '#7e7a74', '#c9a86a', '#e6e2da'], ushp: ['#8a857e', '#8fb3c9', '#7e7a74', '#c9a86a', '#e6e2da', '#5d7a8b'],
    fstrip: ['#2f3a33', '#8fb3c9', '#1f1d1b', '#8a857e', '#c9a86a'], slab: ['#b58a5a', '#9a948b', '#6b8c6e', '#b2aba0', '#e3dbcd'],
    roof: ['#3a383d', '#a87b4c', '#8f6236', '#cfd8dd', '#d8c46a', '#9fb2bd', '#e3dbcd'], win: ['#7aa6c2', '#e6d48c', '#c4705f', '#d9d6d0'],
    floor: ['#b58a5a', '#9a948b', '#d9a64e', '#cfd8dd', '#8fb3c9', '#8a857e'], w_block: ['#e2dacd', '#c9c2b5', '#d8c46a', '#9a948b', '#bdb6aa', '#efe9df'],
    w_brick: ['#c08a5c', '#2a2622', '#d8c46a', '#9a4a30', '#efe9df'], w_frame: ['#8a6a4e', '#2a2622', '#cfd8dd', '#c9a96e', '#d8c46a', '#9fb2bd', '#a87b4c', '#efe9df'],
    w_brus: ['#d9a35c', '#b07d45', '#c9a86a', '#8f6236', '#6b8c6e'], f_wet: ['#d9d6d0', '#a9a39a', '#5d8fb5', '#c9c2b5', '#77716a', '#45403a'],
    f_floor: ['#b58a5a', '#6b8c6e', '#77716a', '#c4705f', '#8fb3c9', '#45403a'], f_wall: ['#e3dbcd', '#efe9df', '#d9d3c8', '#a69f95', '#c9c2b5', '#5f5952'],
    f_ceil: ['#efe9df', '#9fb2bd', '#d9a64e', '#45403a']
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
    if (!cta.id) cta.id = 'bz-cta';
    var mat = sec.getAttribute('data-bz-m'); if (MATS.indexOf(mat) < 0) mat = 'block';
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
    ctl.appendChild(prev); ctl.appendChild(nav); ctl.appendChild(pb); ctl.appendChild(next);
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
    // конфігуратор технології стін (лише будинок)
    var mats = null;
    if (scene === 'house') {
      mats = el('div', 'bz-mats'); mats.setAttribute('role', 'group'); mats.setAttribute('aria-label', ui.mat);
      mats.innerHTML = '<span aria-hidden="true">' + esc(ui.mat) + '</span>' + MATS.map(function (m) { return '<button type="button" data-m="' + m + '" aria-pressed="false">' + esc(ui.m[m]) + '</button>'; }).join('');
      mats.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-m]'); if (b && b.getAttribute('data-m') !== mat) setMat(b.getAttribute('data-m'), 1); });
    }
    side.appendChild(hd); side.appendChild(ol); side.appendChild(pie); side.appendChild(ctl); side.appendChild(goA);
    if (mats) fig.appendChild(mats);
    pin.appendChild(skip); pin.appendChild(fig); pin.appendChild(side);
    run.appendChild(pin);
    cta.parentNode.insertBefore(run, cta);
    sec.classList.add('bz-on');

    // «пиріг»: список шарів з товщинами; наведення / фокус / тап — опис шару (aria-live)
    function renderPie(k, into) {
      var p = data.pie[k], o = p[1] === 'h' ? ui.h : p[1] === 'v' ? ui.v : ['', ''], cs = PC[k] || [];
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
      var st = data.st[scene];
      ol.innerHTML = seq.map(function (k, i) { var s = st[k] || ['', '']; return '<li id="bz-s' + i + '"><div><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div></li>'; }).join('');
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
      sc = scene === 'flat' ? flat(S, ui) : house(mat, S, ui);
      var body = sc.parts.map(function (p, i) {
        var v = typeof p.v === 'function' ? '' : p.v;
        if (typeof p.v === 'function') p.v(1); // габарити з урахуванням повної висоти
        return p.s < -1 && p.e < 0 && !p.c ? v : '<g class="bz-l' + (p.c ? ' ' + p.c : '') + '" data-i="' + i + '">' + v + '</g>';
      }).join('');
      var pad = 12, vb = [bb[0] - pad, bb[1] - pad - 30, bb[2] - bb[0] + pad * 2, bb[3] - bb[1] + pad * 2 + 30].map(function (v) { return v.toFixed(0); }).join(' ');
      var h2 = sec.querySelector('h2'), old = fig.querySelector('svg');
      var html = '<svg viewBox="' + vb + '" role="img" aria-label="' + esc(ui.fig + (h2 ? h2.textContent : '')) + '" focusable="false" preserveAspectRatio="xMidYMid meet" class="m-' + mat + '">' +
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
      if (mats) [].forEach.call(mats.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === mat ? 'true' : 'false'); });
      reserve();
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
        if (rm || e.target.closest('.bz-mats,.bz-pie')) return;
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
