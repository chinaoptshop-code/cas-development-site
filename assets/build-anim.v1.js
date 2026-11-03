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
  if (W.__casBA) { if (typeof W.__casBA === 'function') [].forEach.call(d.querySelectorAll('section.bz[data-bz][data-sw]'), W.__casBA); return; } // скрипт уже працює: блок, показаний перемикачем сцен на місці, — запускаємо тут
  W.__casBA = 1;
  var secs = [].slice.call(d.querySelectorAll('section.bz[data-bz]'));
  if (!secs.length || !W.fetch || !W.Promise) return;
  var VER = {"ar.flat":"46b56699","ar.house":"b9e1a415","de.flat":"13675997","de.house":"518a9a7d","en.flat":"72e68dcb","en.house":"8f4442b3","es.flat":"ddb675d6","es.house":"f522c1f0","fr.flat":"5e0de606","fr.house":"81f6c511","pl.flat":"8737eeeb","pl.house":"ca47929e","ru.flat":"3a0da7af","ru.house":"d047addb","uk.flat":"4be1e913","uk.house":"8eae39f9","zh.flat":"0ae41127","zh.house":"35503c4f"}; /*ver*/
  var MQ = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)');
  var MOB = W.matchMedia && W.matchMedia('(max-width:767px)');
  var lang = (d.documentElement.lang || 'uk').slice(0, 2); if (!VER[lang + '.house']) lang = 'uk';
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
    p('boardv', 4.5, 400, ['#3b3a3c', '#2c2b2d'], [['M4.2 0V400', 'rgba(0,0,0,.55)']]); // барнхаус: вертикальна дошка
    p('boardl', 400, 4.5, ['#d9d6cf', '#bdb9b1'], [['M0 4.2H400', 'rgba(60,55,50,.35)']]); // сканді: світла горизонтальна
    p('stone', 18, 9, ['#8f8a83', '#76716b'], [['M0 4.5H7M10 4.5H18M0 9H18M5 0V4.5M13 0V4.5M2 4.5V9M9 4.5V9M15 4.5V9', 'rgba(30,28,26,.55)', 0.7]]); // шале: камінь по цоколю
    // реалізм: мʼяка тінь на землі, відблиск/тінь схилу покрівлі, бетон, ґрунт — напівпрозорі шари поверх матеріалу
    o += '<linearGradient id="bz-csh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050404" stop-opacity=".42"/><stop offset="1" stop-color="#050404" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="bz-rsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>' +
      '<pattern id="bz-cc" width="9" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".5" fill="#fff" fill-opacity=".12"/><circle cx="6" cy="4.5" r=".6" fill="#000" fill-opacity=".16"/><circle cx="3.5" cy="5.5" r=".35" fill="#fff" fill-opacity=".09"/></pattern>' +
      '<pattern id="bz-so" width="6" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#d8c3a0" fill-opacity=".12"/><circle cx="4" cy="3.3" r=".7" fill="#000" fill-opacity=".14"/></pattern>';
    return o;
  }

  /* ---------- конфігуратор будинку: стилі (форма даху, ухил, звис, фасадна система, вікна [ширина, низ, верх від підлоги]) ---------- */
  var HS = {
    minimal: { r: 'flat', p: 0, o: 0, f: 'r', w: [2.2, 0.1, 2.5] }, barn: { r: 'gable', p: 42, o: 0.06, f: 'c', w: [1.1, 0.3, 2.45] },
    scandi: { r: 'gable', p: 35, o: 0.5, f: 'c', w: [1.4, 0.85, 2.35] }, classic: { r: 'hip', p: 30, o: 0.55, f: 'r', w: [1.0, 0.7, 2.4] },
    chalet: { r: 'gable', p: 22, o: 1.1, f: 'c', w: [1.6, 0.85, 2.3] }, aframe: { r: 'af', p: 60, o: 0.25, f: 'c', w: [0, 0, 0] }
  };
  var STY = ['minimal', 'barn', 'scandi', 'classic', 'chalet', 'aframe'], TYP = ['one', 'attic', 'two'], SZ = [80, 120, 160, 220, 300];
  // похідні параметри конфігурації (спільні для сцени, пирогів і текстів етапів)
  function hder(C) {
    var Y = HS[C.s] || HS.scandi, AF = Y.r === 'af', TY = AF ? 'attic' : C.t;
    var FS = C.m === 'brus' ? 'w' : C.m === 'frame' ? (Y.f === 'r' ? 'rnd' : 'c') : Y.f === 'c' ? 'clad' : 'r';
    var eff = AF ? 1.4 : TY === 'two' ? 2 : TY === 'attic' ? 1.6 : 1, fp = C.a / eff;
    var D = Math.min(12, Math.max(6, Math.sqrt(fp / 1.45))), W = Math.min(22, Math.max(7, fp / D));
    D = Math.round(D * 2) / 2; W = Math.round(W * 2) / 2;
    return { Y: Y, RF: Y.r, AF: AF, FL: Y.r === 'flat', TY: TY, FS: FS, W: W, D: D, fl: TY === 'two' ? 2 : 1,
      tags: [C.r && Y.r === 'flat' ? 'ter' : '', AF ? 'af' : '', Y.r === 'flat' ? 'flat_' + TY : '', Y.r === 'flat' ? 'flat' : '', TY === 'one' || TY === 'attic' ? TY : '', Y.r === 'hip' ? 'hip' : '', FS === 'clad' || FS === 'rnd' ? FS : ''].filter(Boolean) };
  }
  // сумісність: змінений параметр k має пріоритет, інший поступається (підказка — ключ ui.cfg.h)
  function hfix(C, k) {
    var hint = '', i, r;
    var R = [
      function () { if (C.s === 'aframe' && C.m !== 'frame') return k === 'm' ? ['s', 'scandi', 'af2'] : ['m', 'frame', 'af']; },
      function () { if (C.s === 'aframe' && (C.g || C.r)) return k === 'g' || k === 'r' ? ['s', 'scandi', 'af3'] : [C.g ? 'g' : 'r', C.g ? '' : 0, 'af3']; },
      function () { if (C.s === 'aframe' && C.a > 160) return k === 'a' ? ['s', 'scandi', 'af4'] : ['a', 160, 'af4']; },
      function () { if (C.s === 'aframe' && C.t !== 'attic') return k === 't' ? ['s', 'scandi', 'af5'] : ['t', 'attic', '']; },
      function () { if (C.s === 'minimal' && C.m === 'brus') return k === 'm' ? ['s', 'scandi', 'br'] : ['m', 'block', 'br']; },
      function () { if (C.s === 'minimal' && C.t === 'attic') return k === 't' ? ['s', 'scandi', 'at'] : ['t', 'two', 'at']; },
      function () { if (C.r && C.s !== 'minimal') return k === 'r' ? ['s', 'minimal', 'ter'] : ['r', 0, 'ter2']; },
      function () { if (C.t === 'two' && C.a < 120) return k === 'a' ? ['t', C.s === 'minimal' ? 'one' : 'attic', 'two'] : ['a', 120, 'two']; },
      function () { if (C.t === 'one' && C.a > 220) return k === 'a' ? ['t', 'two', 'one'] : ['a', 220, 'one']; }
    ];
    for (var n = 0; n < 6; n++) {
      var ch = 0;
      for (i = 0; i < R.length; i++) { r = R[i](); if (r) { C[r[0]] = r[1]; if (r[2]) hint = r[2]; ch = 1; } }
      if (!ch) break;
    }
    return hint;
  }

  /* ---------- сцена «будинок»: частини в порядку малювання (painter), кожна — етап (ключ + частка), режим, коли зникає ---------- */
  function house(C, S, ui) {
    var mat = C.m, L = [], H = hder(C), Y = H.Y;
    function A(key, fr, v, o) { // key — етап; fr — частка етапу; v — svg або function(k) для «росту»; o: {m:'f'|'d'|'g', h:[ключ, частка], c:'клас'}
      var i = typeof key === 'number' ? key : S(key); if (i < 0 || !v) return;
      o = o || {};
      var e = -1; if (o.h) { var j = S(o.h[0]); if (j >= 0) e = j + (o.h[1] || 0) * 0.6; }
      L.push({ s: i + (fr || 0) * 0.6, v: v, m: typeof v === 'function' ? 'g' : (o.m || 'f'), e: e, c: o.c || '' });
    }
    function B(v, c) { L.push({ s: -9, v: v, m: 'f', e: -1, c: c || '' }); }
    var plate = mat === 'block' || mat === 'frame', brus = mat === 'brus', frame = mat === 'frame', brick = mat === 'brick';
    var AF = H.AF, FL = H.FL, HIP = H.RF === 'hip', two = H.TY === 'two', attic = H.TY === 'attic', one = H.TY === 'one', CL = H.FS === 'clad' || H.FS === 'c';
    var Kk = {
      w1: { block: 'b_w1', brick: 'k_w1', frame: 'f_studs', brus: 'r_walls' }[mat], bl: { block: 'belt1', brick: 'k_belt', frame: 'f_osb', brus: 'r_slab' }[mat],
      sl: { block: 'slab', brick: 'slab', frame: 'f_osb', brus: 'r_slab' }[mat], w2: { block: 'b_w2', brick: 'k_w2', frame: 'f_w2', brus: 'r_w2' }[mat],
      raf: brus ? 'r_rafters' : 'rafters', win: brus ? 'r_win' : 'win', fac: { block: 'fac_b', brick: 'fac_k', frame: 'fac_f', brus: 'r_fin' }[mat],
      fd: plate ? 'pour' : 's_pour', scr: { block: 'screed', brick: 'screed', frame: 'f_fin', brus: 'r_fin' }[mat]
    };
    var gw = C.g ? 4.4 : 0, X0 = 3 + gw, X1 = X0 + H.W, Y0 = 3, Y1 = Y0 + H.D, GX = Math.max(X1 + 3, 20), GY = Math.max(Y1 + 3.5, 15), GZ = -1.2, T = frame ? 0.25 : 0.35;
    var ZP = 0.25, ZB1 = 3.0, ZM = 3.25, ZF2 = 3.5, ZB2 = two ? 5.75 : attic ? ZF2 + 1.0 : ZF2, ZT = two ? 6.0 : attic ? ZB2 + 0.25 : ZF2;
    var O = Y.o, pt = Math.tan((attic && !AF ? Math.max(Y.p, 40) : Y.p) * Math.PI / 180), RY = (Y0 + Y1) / 2, MZ = ZT + 0.15;
    var RZ = FL ? MZ : MZ + (RY - Y0) * pt, tg = pt, EZ = MZ - O * tg;
    if (AF) { EZ = ZP + 0.12; RZ = EZ + (RY - Y0 + O) * pt; MZ = EZ; }
    var zr = function (y) { return y < RY ? MZ + (y - Y0) * tg : MZ + (Y1 - y) * tg; };
    var cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    // вікна: фасад y = Y1 (OY, двері — п'ятий елемент), бічний фасад x = X1 (OX); осі — за довжиною фасаду
    var OY = [], OX = [], GWN = [];
    if (!AF) {
      var n = Math.max(2, Math.round(H.W / (C.s === 'minimal' ? 3.4 : 2.7))); if (C.s === 'classic' && n % 2 === 0) n++; var sp = H.W / n, ww = Math.min(Y.w[0], sp - 0.6), di = C.s === 'classic' ? Math.floor(n / 2) : n > 2 ? 1 : 0;
      [ZP].concat(two ? [ZF2] : []).forEach(function (z, f) {
        var top = Math.min(z + Y.w[2], (f ? ZB2 : ZB1) - 0.3);
        for (var i = 0; i < n; i++) {
          var c = X0 + sp * (i + 0.5);
          if (!f && i === di) OY.push([c - 0.6, c + 0.6, ZP, ZP + 2.25, 1]);
          else OY.push([c - ww / 2, c + ww / 2, z + (f && C.s === 'minimal' ? 0.6 : Y.w[1]), top]);
        }
      });
      var n2 = Math.max(1, Math.round(H.D / 3.4)), s2 = H.D / n2, w2 = Math.min(Y.w[0], 1.6, s2 - 0.6);
      [ZP].concat(two ? [ZF2] : []).forEach(function (z, f) { for (var i = 0; i < n2; i++) { var c = Y0 + s2 * (i + 0.5); OX.push([c - w2 / 2, c + w2 / 2, z + Math.max(Y.w[1], C.s === 'minimal' ? 0.6 : 0), Math.min(z + Y.w[2], (f ? ZB2 : ZB1) - 0.3)]); } });
      if (attic && RZ - MZ > 1.9) GWN.push([RY - 0.65, RY + 0.65, MZ + 0.15, MZ + Math.min(1.6, RZ - MZ - 0.6)]); // вікно у фронтоні мансарди
    }
    var IX0 = X0 + T, IX1 = X1 - T, IY0 = Y0 + T, IY1 = Y1 - T, Sx0 = X0 - 0.3, Sx1 = X1 + 0.3, Sy0 = Y0 - 0.3, Sy1 = Y1 + 0.3;
    var WC = { block: 'wb', brick: 'wk', frame: 'wf', brus: 'wr' }[mat]; // клас стін за матеріалом
    var snap = { block: 0.25, brick: 0.25, frame: 0.25, brus: 0.2 }[mat];
    var dc = (OY.filter(function (o) { return o[4]; })[0] || [cx - 0.6, cx + 0.6]), dX = (dc[0] + dc[1]) / 2; // вхід
    var GA = C.g === 'g' ? [X0 - gw + 0.3, X0 - 0.12, Math.max(Y0, Y1 - 6.5), Y1, 3.0] : null; // гараж
    var CP = C.g === 'c' ? [X0 - gw + 0.3, X0 - 0.15, Math.max(Y0, Y1 - 6), Y1 + 0.2] : null; // навіс

    /* ── ділянка-діорама: ґрунт у розрізі, сітка */
    var grid = '';
    for (var g = 2; g < GX; g += 2) grid += pl('gd', [g, 0, 0, g, GY, 0]);
    for (g = 2; g < GY; g += 2) grid += pl('gd', [0, g, 0, GX, g, 0]);
    B(pg('so r', rx(GX, 0, GY, GZ, 0)) + pg('so l', ry(GY, 0, GX, GZ, 0)) + pl('st', [GX, 0, -0.3, GX, GY, -0.3, 0, GY, -0.3]) + pl('st', [GX, 0, -0.85, GX, GY, -0.85, 0, GY, -0.85]) +
      pg('gr', rz(0, 0, GX, 0, GY)) + grid);
    var ghr = AF ? pg('gh', [X0 - O, RY, RZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ, X0 - O, Y1 + O, EZ]) + pg('gh', [X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ]) :
      FL ? box('gh', X0, X1, Y0, Y1, ZT, ZT + 0.6) : pg('gh', [X0 - O, RY, RZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ, X0 - O, Y1 + O, EZ]) + pg('gh', [X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ]);
    B('<g class="ghost">' + box('gh', Sx0, Sx1, Sy0, Sy1, 0, ZP) + (AF ? '' : box('gh', X0, X1, Y0, Y1, ZP, ZT)) + ghr + (GA ? box('gh', GA[0], GA[1], GA[2], GA[3], 0, GA[4]) : '') + '</g>');

    /* ── котлован / траншеї і шари під фундаментом */
    var PD = -0.8, PX0 = X0 - 1, PX1 = X1 + 1, PY0 = Y0 - 1, PY1 = Y1 + 1;
    if (plate) {
      A('pit', 0, pg('pf', rz(PD, PX0, PX1, PY0, PY1)) + pg('pi r', rx(PX0, PY0, PY1, PD, 0)) + pg('pi l', ry(PY0, PX0, PX1, PD, 0)) + pl('st', [PX0, PY0, -0.3, PX0, PY1, -0.3]) + pl('st', [PX0, PY0, -0.3, PX1, PY0, -0.3]));
      A('base', 0, pg('geo', rz(PD + 0.01, PX0, PX1, PY0, PY1)));
      A('base', 0.3, pg('sand', rz(-0.5, X0 - 0.8, X1 + 0.8, Y0 - 0.8, Y1 + 0.8)));
      A('base', 0.6, pg('grv', rz(-0.3, X0 - 0.7, X1 + 0.7, Y0 - 0.7, Y1 + 0.7)));
      if (!frame) {
        var hs = ''; range(X0, X1, 1).forEach(function (x) { hs += pl('hsm', [x, Y0 - 0.55, -0.2, x, Y1 + 0.55, -0.2]); });
        A('hydro', 0, pg('prep', rz(-0.23, X0 - 0.6, X1 + 0.6, Y0 - 0.6, Y1 + 0.6)));
        A('hydro', 0.35, pg('hyd', rz(-0.2, X0 - 0.55, X1 + 0.55, Y0 - 0.55, Y1 + 0.55)) + hs);
        var xg = ''; range(Sx0 + 1.2, Sx1 - 0.1, 1.2).forEach(function (x) { xg += pl('xg', [x, Sy0, -0.05, x, Sy1, -0.05]); }); range(Sy0 + 0.6, Sy1 - 0.1, 0.6).forEach(function (y) { xg += pl('xg', [Sx0, y, -0.05, Sx1, y, -0.05]); });
        A('hydro', 0.65, pg('xps', rz(-0.05, Sx0, Sx1, Sy0, Sy1)) + xg);
      } else { // УШП: XPS по дну, L-блоки по краях, труби теплої підлоги й вводи — до бетону
        A('ushp', 0, pg('xps', rz(-0.05, Sx0, Sx1, Sy0, Sy1)));
        A('ushp', 0.35, pl('loop', zig(Sx0 + 0.6, Sx1 - 0.6, Sy0 + 0.6, Sy1 - 0.6, 0, 0.35)) + pl('cwp', [X0 + 3, Sy0 + 0.5, 0, X0 + 3, Sy1 + 1.4, 0]) + pl('sw', [X0 + 6.6 < X1 ? X0 + 6.6 : cx, Sy0 + 1.2, 0, X0 + 6.6 < X1 ? X0 + 6.6 : cx, Sy1 + 1.6, 0]));
      }
      var m1 = '', m2 = '', vy = '';
      range(Sy0 + 0.15, Sy1 - 0.15, 0.4).forEach(function (y) { m1 += pl('rb', [Sx0 + 0.1, y, 0.02, Sx1 - 0.1, y, 0.02]); m2 += pl('rb', [Sx0 + 0.1, y, 0.19, Sx1 - 0.1, y, 0.19]); });
      range(Sx0 + 0.15, Sx1 - 0.15, 0.4).forEach(function (x) { m1 += pl('rb', [x, Sy0 + 0.1, 0.02, x, Sy1 - 0.1, 0.02]); m2 += pl('rb', [x, Sy0 + 0.1, 0.19, x, Sy1 - 0.1, 0.19]); });
      if (!frame) {
        range(X0 + 0.5, X1 - 0.5, 1).forEach(function (x) { vy += pl('vy', [x, Y0 + T / 2, 0.2, x, Y0 + T / 2, 0.95]) + pl('vy', [x, Y1 - T / 2, 0.2, x, Y1 - T / 2, 0.95]); });
        range(Y0 + 0.5, Y1 - 0.5, 1).forEach(function (y) { vy += pl('vy', [X0 + T / 2, y, 0.2, X0 + T / 2, y, 0.95]) + pl('vy', [X1 - T / 2, y, 0.2, X1 - T / 2, y, 0.95]); });
      }
      var fwF = pg('fw r', rx(Sx0 - 0.04, Sy0, Sy1, -0.05, ZP + 0.08)) + pg('fw l', ry(Sy0 - 0.04, Sx0, Sx1, -0.05, ZP + 0.08));
      var fwN = box('fw', Sx1, Sx1 + 0.05, Sy0 - 0.04, Sy1 + 0.05, -0.05, ZP + 0.08) + box('fw', Sx0 - 0.04, Sx1, Sy1, Sy1 + 0.05, -0.05, ZP + 0.08);
      if (frame) { var lb = ring('xpe', Sx0, Sx1, Sy0, Sy1, 0.2, -0.05, ZP, [], []); A('ushp', 0, lb.i); A('ushp', 0.6, m2); }
      else { A('rebar', 0, fwF, { h: [Kk.w1, 0] }); A('rebar', 0, m1); A('rebar', 0.35, m2); }
      A(Kk.fd, 0, function (k) { if (k <= 0) return ''; var z = -0.05 + (ZP + 0.05) * k; return frame ? pg('fd t', rz(Math.max(z, -0.04), Sx0 + 0.2, Sx1 - 0.2, Sy0 + 0.2, Sy1 - 0.2)) : box('fd', Sx0, Sx1, Sy0, Sy1, -0.05, Math.max(z, -0.04)); });
      A(Kk.fd, 0.95, pg('conc', rz(ZP + 0.003, Sx0 + (frame ? 0.2 : 0), Sx1 - (frame ? 0.2 : 0), Sy0 + (frame ? 0.2 : 0), Sy1 - (frame ? 0.2 : 0))), { h: [Kk.scr, 0.5] }); // фактура бетону
      if (frame) A('ushp', 0, lb.o); else { A('rebar', 0.65, vy, { h: [Kk.w1, 0.4] }); A('rebar', 0, fwN, { h: [Kk.w1, 0] }); }
      A(Kk.w1, 0, ph('bf', [rz(0, PX0, PX1, PY0, PY1), rz(0, Sx0, Sx1, Sy0, Sy1)]));
      B(ph('bf', [rz(0, 0, GX, 0, GY), rz(0, 0, PX1, 0, PY1)]) + pl('gd', [PX1, 0, 0, PX1, PY1, 0, 0, PY1, 0])); // ґрунт перед котлованом закриває нижні шари
    } else { // стрічка: траншеї, подушка, опалубка, каркас, бетон, гідроізоляція й XPS по цоколю, засипка
      var R = [X0 - 0.55, X1 + 0.55, Y0 - 0.55, Y1 + 0.55], I = [X0 + 0.55, X1 - 0.55, Y0 + 0.55, Y1 - 0.55], SR = [X0 - 0.25, X1 + 0.25, Y0 - 0.25, Y1 + 0.25];
      A('trench', 0, ph('pf', [rz(0, R[0], R[1], R[2], R[3]), rz(0, I[0], I[1], I[2], I[3])]) + pg('pi r', rx(R[0], R[2], R[3], PD, 0)) + pg('pi l', ry(R[2], R[0], R[1], PD, 0)) +
        pg('pi r', rx(I[1], I[2], I[3], PD, 0)) + pg('pi l', ry(I[3], I[0], I[1], PD, 0)));
      B(ph('bf', [rz(0, 0, GX, 0, GY), rz(0, 0, R[1], 0, R[3])])); // ґрунт перед траншеєю: стінки траншеї не виглядають «трикутниками» за її кінцями
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
    var hx0 = Math.max(0.4, X0 - 2.6);
    var hA = [hx0 + 0.75, Y0 - 0.7, 0.85], hN = [hx0 + 0.75, Y0 - 2.3, 0], hE = [hx0 + 1.55, Y0 - 0.7, 0], hS = [hx0 + 0.75, Y0 + 0.7, 0], hW = [hx0 - 0.05, Y0 - 0.7, 0];
    A(plate ? 'pit' : 'trench', 0, pg('heap3', hW.concat(hS, hA)) + pg('heap2', hN.concat(hE, hA)) + pg('heap', hE.concat(hS, hA)) + pg('soil', hW.concat(hN, hE, hS)), { h: [Kk.w1, 0.5] }); // відвал: горбок, схили в світлі й тіні
    /* ── благоустрій на рівні землі: газон, відмостка, доріжки */
    A('land', 0, ph('lawn', [rz(0.004, 0.1, GX - 0.1, 0.1, GY - 0.1), rz(0.004, X0 - 1.0, X1 + 1.0, Y0 - 1.0, Y1 + 1.0)].concat(GA || CP ? [rz(0.004, X0 - gw + 0.1, X0 - 1.0, Y1 - 6.6 > Y0 - 1 ? Y1 - 6.6 : Y0 - 1, GY - 0.1)] : [])));
    A('land', 0, ph('pave', [rz(0.02, X0 - 0.9, X1 + 0.9, Y0 - 0.9, Y1 + 0.9), rz(0.02, X0 - 0.2, X1 + 0.2, Y0 - 0.2, Y1 + 0.2)]) + pg('pave', rz(0.02, dX - 0.8, dX + 0.8, Y1 + 0.9, GY - 0.05)) +
      (GA || CP ? pg('pave', rz(0.021, X0 - gw + 0.2, X0 - 1.0, Y1 + 0.2, GY - 0.05)) : pg('pave', rz(0.02, dX + 0.8, GX - 1.5, GY - 1.6, GY - 0.6))));
    A(Kk.w1, 0.2, pg('csh', rz(0.006, Sx0 + 0.4, Sx1 + 1.5, Sy1, Sy1 + 1.3)) + pg('csh', rz(0.006, Sx1, Sx1 + 1.5, Sy0 + 0.4, Sy1)));
    A('land', 0.3, tree(Math.max(1.1, X0 - gw - 1.4 > 0.8 ? X0 - gw - 1.4 : 1.1), Y0 + 1.2, 1.2, 16), { m: 'd' }); // дерево за будинком — до стін (painter)

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
    var nm = function (v) { return W.casNum(v, C.lang, 1); };
    A('geo', 0.5, pl('dim', [X0, GY - 0.7, 0, X1, GY - 0.7, 0]) + pl('dim', [X0, GY - 1, 0, X0, GY - 0.4, 0]) + pl('dim', [X1, GY - 1, 0, X1, GY - 0.4, 0]) + txt('dt', cx + 0.3, GY + 0.1, 0, 30, nm(H.W)) +
      pl('dim', [GX - 0.8, Y0, 0, GX - 0.8, Y1, 0]) + pl('dim', [GX - 1.1, Y0, 0, GX - 0.5, Y0, 0]) + pl('dim', [GX - 1.1, Y1, 0, GX - 0.5, Y1, 0]) + txt('dt', GX - 0.1, cy - 0.4, 0, -30, nm(H.D)), { h: ['base', 0] });

    /* ── гараж / навіс збоку (менший x — малюється перед будинком) */
    if (GA) {
      A(Kk.fd, 0.4, box('fd', GA[0] - 0.1, GA[1] + 0.05, GA[2] - 0.1, GA[3] + 0.1, -0.05, ZP), { m: 'd' });
      A(Kk.w1, 0.5, frame ? box('osb', GA[0], GA[1], GA[2], GA[3], ZP, GA[4]) : box(WC, GA[0], GA[1], GA[2], GA[3], ZP, GA[4]), { m: 'd' });
      A(Kk.sl, 0.5, box(frame || brus ? 'jst' : 'sl', GA[0] - 0.1, GA[1] + 0.05, GA[2] - 0.1, GA[3] + 0.1, GA[4], GA[4] + 0.22), { m: 'd' });
      A(Kk.fac, 0.6, pg((CL ? 'clad' : brus ? 'lz' : brick && H.FS === 'r' ? 'fbr' : 'rnd') + ' l', ry(GA[3] + 0.11, GA[0] - 0.1, GA[1] + 0.05, ZP, GA[4])) + pg('mbr', rz(GA[4] + 0.23, GA[0] - 0.1, GA[1] + 0.05, GA[2] - 0.1, GA[3] + 0.1)));
      var gd = (GA[0] + GA[1]) / 2, gdr = pg('gdr', ry(GA[3] + 0.12, gd - 1.3, gd + 1.3, ZP, ZP + 2.2)); range(ZP + 0.37, ZP + 2.1, 0.37).forEach(function (z) { gdr += pl('gdl', [gd - 1.3, GA[3] + 0.12, z, gd + 1.3, GA[3] + 0.12, z]); });
      A(Kk.win, 0.5, gdr);
    }

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
      if (!brus) OY.forEach(function (o) { if (o[3] < ZB1 && z >= o[3] + 0.25) q += pg('lnt l', ry(Y1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
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
    // A-frame: схили до землі (afB — дальній, afF — ближній), рами з кроком 1,2 м
    var afB = [X0 - O, Y0 - O, EZ, X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ], afF = [X0 - O, Y1 + O, EZ, X1 + O, Y1 + O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ];
    var afz = function (y) { return EZ + (y < RY ? y - (Y0 - O) : (Y1 + O) - y) * pt; };
    if (AF) {
      var bp0 = ring('pla', X0, X1, Y0, Y1, T, ZP, ZP + 0.15, [], []);
      A('f_plate', 0, bp0.i + bp0.o);
      var fr = ''; range(X0 + 0.1, X1 - 0.05, 1.2).concat([X1 - 0.1]).forEach(function (x) { fr += pl('afr', [x, Y0 - O + 0.2, EZ + 0.2 * pt, x, RY, RZ - 0.1, x, Y1 + O - 0.2, EZ + 0.2 * pt]) + pl('aft', [x, RY - (ZF2 + 1.1 - EZ) / pt * 0 - 1.6, ZF2 + 0.9, x, RY + 1.6, ZF2 + 0.9]); });
      A('f_studs', 0, fr, { m: 'd' });
      A('f_osb', 0, pg('osbs b', afB));
      A('rafters', 0, pg('mem', afB));
      A('roof', 0.35, pg('rf b', afB.map(function (v, i) { return i % 3 === 2 ? v + 0.1 : v; })));
      A('f_ins', 0, pg('woolS', afB.map(function (v, i) { return i % 3 === 1 ? v + 0.2 * (v < RY ? 1 : -1) : i % 3 === 2 ? v + 0.05 : v; })));
    } else if (frame) {
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
    var ys = [Y0 + 1.4, Y0 + 3.2, Y0 + 5.4].filter(function (y) { return y < IY1 - 0.3; }), xs1 = [X0 + 2, X0 + 4.6, X0 + 7.2].filter(function (x) { return x < IX1 - 0.4; });
    var cab = pl('el', [IX0 + 0.01, IY0 + 0.2, ZP + 2.45, IX0 + 0.01, IY1 - 0.2, ZP + 2.45]) + pl('el', [IX0 + 0.2, IY0 + 0.01, ZP + 2.45, IX1 - 0.2, IY0 + 0.01, ZP + 2.45]);
    ys.forEach(function (y) { cab += pl('el', [IX0 + 0.01, y, ZP + 2.45, IX0 + 0.01, y, ZP + 0.35]); });
    xs1.forEach(function (x, i) { cab += pl('el', [x, IY0 + 0.01, ZP + 2.45, x, IY0 + 0.01, ZP + (i ? 1.1 : 0.35)]); });
    var px = IX1 - 1.0, pipes = pl('hw', [px, IY0 + 0.05, ZP + 1.3, px, IY0 + 0.05, ZP + 0.5, px - 1.1, IY0 + 0.05, ZP + 0.5]) + pl('cwp', [px + 0.25, IY0 + 0.05, ZP + 1.3, px + 0.25, IY0 + 0.05, ZP + 0.35, X0 + 3.2, IY0 + 0.05, ZP + 0.35, X0 + 3.2, IY0 + 0.05, ZP + 1.0]) +
      pl('sw', [X0 + 3.6, IY0 + 0.3, ZP + 0.05, X0 + 3.6, IY1 + 1.2, ZP + 0.05]);
    A('mep', 0, cab + (brus ? '' : pipes), { c: 'net' });
    if (!frame && !brus) A('screed', 0.5, pg('plw r', rx(IX0 + 0.02, IY0 + 0.02, IY1, ZP + 0.07, ZB1)) + pg('plw l', ry(IY0 + 0.02, IX0 + 0.02, IX1, ZP + 0.07, ZB1)));
    if (brus) A('r_fin', 0.3, pg('lz r', rx(IX0 + 0.01, IY0, IY1, ZP + 0.2, ZM)) + pg('lz l', ry(IY0 + 0.01, IX0, IX1, ZP + 0.2, ZM)));
    var dev = box('pan', IX0, IX0 + 0.12, Y0 + 1.2, Y0 + 1.8, ZP + 1.3, ZP + 1.95) + box('blr', IX1 - 1.3, IX1 - 0.5, IY0, IY0 + 0.35, ZP + 1.3, ZP + 2.15) + box('col', IX1 - 2.5, IX1 - 1.7, IY0, IY0 + 0.15, ZP + 0.3, ZP + 0.8);
    if (brus) dev = box('pan', IX0, IX0 + 0.12, Y0 + 1.2, Y0 + 1.8, ZP + 1.3, ZP + 1.95) + box('rad', X0 + 2, X0 + 3.6, IY0, IY0 + 0.1, ZP + 0.3, ZP + 0.8) + box('rad', IX1 - 2.6, IX1 - 1.0, IY0, IY0 + 0.1, ZP + 0.3, ZP + 0.8) + pl('cwp', [X0 + 2, IY0 + 0.12, ZP + 0.25, IX1 - 1.0, IY0 + 0.12, ZP + 0.25]);
    A('mep', 0.3, dev);
    var kx1 = IX1 - 0.4, kx0 = Math.max(IX0 + 2.6, kx1 - 3.0), tx0 = Math.max(IX0 + 3.8, kx0 - 0.6);
    A('int', 0.3, box('kb', kx0, kx1, IY0, IY0 + 0.6, ZP + 0.1, ZP + 0.95) + box('ct', kx0 - 0.05, kx1 + 0.05, IY0, IY0 + 0.65, ZP + 0.95, ZP + 1.0) + box('kw', kx0, kx1, IY0, IY0 + 0.35, ZP + 1.55, ZP + 2.3) +
      box('sf', IX0 + 0.9, IX0 + 3.3, cy + 0.1, cy + 0.9, ZP + 0.1, ZP + 0.45) + box('sf', IX0 + 0.9, IX0 + 3.3, cy - 0.1, cy + 0.1, ZP + 0.1, ZP + 0.85) +
      box('tb', tx0, tx0 + 1.8, cy - 0.5, cy + 0.5, ZP + 0.72, ZP + 0.78) + pl('lg', [tx0 + 0.2, cy + 0.4, ZP + 0.1, tx0 + 0.2, cy + 0.4, ZP + 0.72]) + pl('lg', [tx0 + 1.6, cy + 0.4, ZP + 0.1, tx0 + 1.6, cy + 0.4, ZP + 0.72]));
    // ближні стіни 1 поверху
    if (AF) { /* стін немає — рами й схили */ }
    else if (frame) {
      A('f_plate', 0, bp.o);
      A('f_studs', 0, studs(ZP + 0.15, ZM - 0.15, 1, o1, x1o), { m: 'd', c: 'ow' });
      A('f_studs', 0.6, tp1.o, { m: 'd', c: 'ow' });
      A('f_osb', 0, skin('osb', X0, X1, Y0, Y1, 0.01, ZP, ZM, o1, x1o), { c: 'ow' });
    } else {
      if (brus) A('r_crown', 0, cr.o, { c: 'ow' });
      A(Kk.w1, 0, function (k) { return w1o(k); }, { c: 'ow' });
      if (!brus) A(Kk.bl, 0, ring('blt', X0, X1, Y0, Y1, T, ZB1, ZM, [], []).o, { c: 'ow' });
    }
    /* ── перекриття (у A-frame — антресоль) */
    if (AF) {
      var my0 = Math.max(Y0, RY - 2.2), my1 = Math.min(Y1, RY + 2.2);
      A('f_osb', 0.5, box('jst', X0 + 0.2, X0 + 0.2 + H.W * 0.55, my0, my1, ZF2 - 0.2, ZF2) + pl('glp', [X0 + 0.2 + H.W * 0.55, my0, ZF2, X0 + 0.2 + H.W * 0.55, my1, ZF2]), { m: 'd' });
    } else if (frame) A('f_osb', 0.5, box('jst', X0, X1, Y0, Y1, ZM - 0.15, ZF2) + (function () { var s = ''; range(X0 + 0.6, X1 - 0.3, 0.6).forEach(function (x) { s += pl('jsl', [x, Y0, ZF2, x, Y1, ZF2]); }); return s; })(), { m: 'd' });
    else if (brus) A('r_slab', 0, box('wsl', X0, X1, Y0, Y1, ZM, ZF2) + (function () { var s = ''; range(X0 + 0.8, X1 - 0.4, 0.8).forEach(function (x) { s += pg('bme', ry(Y1 + 0.01, x - 0.1, x + 0.1, ZM + 0.02, ZF2 - 0.03)); }); return s; })(), { m: 'd' });
    else A('slab', 0, box('sl', X0, X1, Y0, Y1, ZM, ZF2) + (function () { var s = ''; range(X0 + 1.2, X1 - 0.2, 1.2).forEach(function (x) { s += pl('slj', [x, Y0, ZF2, x, Y1, ZF2]); }); return s; })(), { m: 'd' });
    /* ── 2 поверх / мансардні стінки / мауерлат (1 поверх) */
    var w2s = Kk.w2, up = !one && !AF;
    if (up && !frame && !brus) { A('screed', 0, pg('scr', rz(ZF2 + 0.06, IX0, IX1, IY0, IY1))); }
    if (up) A('int', 0, pg('flw', rz(ZF2 + 0.08, IX0, IX1, IY0, IY1)));
    var w2i = function (k) { var z = ZF2 + Math.round((ZB2 - ZF2) * k / snap) * snap; return z > ZF2 + 0.01 ? ring(WC, X0, X1, Y0, Y1, T, ZF2, z, OY, OX).i : ''; };
    var w2o = function (k) {
      var z = ZF2 + Math.round((ZB2 - ZF2) * k / snap) * snap; if (z <= ZF2 + 0.01) return '';
      var q = ring(WC, X0, X1, Y0, Y1, T, ZF2, z, OY, OX).o;
      if (!brus) o2.forEach(function (o) { if (z >= o[3] + 0.25) q += pg('lnt l', ry(Y1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
      if (!brus) x2o.forEach(function (o) { if (z >= o[3] + 0.25) q += pg('lnt r', rx(X1 + 0.005, o[0] - 0.25, o[1] + 0.25, o[3], o[3] + 0.25)); });
      if (brus) q += logEnds(ZF2, z);
      return q;
    };
    if (up) {
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
      var cab2 = pl('el', [IX0 + 0.01, IY0 + 0.2, ZF2 + 2.2 * (two ? 1 : 0.4), IX0 + 0.01, IY1 - 0.2, ZF2 + 2.2 * (two ? 1 : 0.4)]) + pl('el', [IX0 + 0.2, IY0 + 0.01, ZF2 + 2.2 * (two ? 1 : 0.4), IX1 - 0.2, IY0 + 0.01, ZF2 + 2.2 * (two ? 1 : 0.4)]);
      A('mep', 0, cab2, { c: 'net' });
      if (!frame && !brus) A('screed', 0.5, pg('plw r', rx(IX0 + 0.02, IY0 + 0.02, IY1, ZF2 + 0.06, ZB2)) + pg('plw l', ry(IY0 + 0.02, IX0 + 0.02, IX1, ZF2 + 0.06, ZB2)));
      if (brus) A('r_fin', 0.3, pg('lz r', rx(IX0 + 0.01, IY0, IY1, ZF2, ZT)) + pg('lz l', ry(IY0 + 0.01, IX0, IX1, ZF2, ZT)));
      // вентиляція: рекуператор і повітроводи під стелею 2 поверху
      if (two) A('mep', 0.45, box('duct', IX0 + 0.6, IX1 - 1.4, IY0, IY0 + 0.3, ZB2 - 0.45, ZB2 - 0.2) + box('rec', IX1 - 1.4, IX1 - 0.4, IY0, IY0 + 0.55, ZB2 - 0.75, ZB2 - 0.15) + box('duct', IX0 + 0.6, IX0 + 0.9, IY0, IY0 + 0.3, ZF2, ZB2 - 0.2), { c: 'net' });
      A('int', 0.3, box('bed', IX0 + 1.3, IX0 + 3.5, cy - 1.2, cy + 1.0, ZF2 + 0.1, ZF2 + 0.5) + box('bed', IX0 + 1.3, IX0 + 1.45, cy - 1.2, cy + 1.0, ZF2 + 0.1, ZF2 + 1.0) + (two ? box('wrd', IX1 - 3.2, IX1 - 0.4, IY0, IY0 + 0.6, ZF2 + 0.1, ZF2 + 2.2) : ''));
    } else if (!AF) A('mep', 0.45, box('rec', IX1 - 1.4, IX1 - 0.4, IY0, IY0 + 0.55, ZB1 - 0.75, ZB1 - 0.15), { c: 'net' });
    if (AF) A('int', 0.3, box('bed', X0 + 0.6, X0 + 2.6, RY - 1.0, RY + 1.0, ZF2 + 0.02, ZF2 + 0.4));
    if (AF) { /* ближні стіни — немає */ }
    else if (frame) {
      if (up) {
        A('f_w2', 0, ring('pla', X0, X1, Y0, Y1, T, ZF2, ZF2 + 0.15, [], []).o, { c: 'ow' });
        A('f_w2', 0, studs(ZF2 + 0.15, ZT - 0.15, 1, o2, x2o), { m: 'd', c: 'ow' });
        A('f_w2', 0.5, skin('osb', X0, X1, Y0, Y1, 0.01, ZF2 - 0.25, ZT, o2, x2o), { c: 'ow' });
      }
      A('f_w2', 0.7, (up ? ring('pla', X0, X1, Y0, Y1, T, ZT - 0.15, ZT, [], []).o : '') + (FL ? '' : box('mlt', X0 + 0.02, X1 - 0.02, Y0 + 0.03, Y0 + 0.23, ZT, MZ) + box('mlt', X0 + 0.02, X1 - 0.02, Y1 - 0.23, Y1 - 0.03, ZT, MZ)), { c: 'ow', m: 'd' });
    } else {
      if (up) A(w2s, 0, function (k) { return w2o(k); }, { c: 'ow' });
      if (!brus) {
        if (up) A(w2s, 0.75, ring('blt', X0, X1, Y0, Y1, T, ZB2, ZT, [], []).o + (FL ? '' : box('pin', X0 + 0.15, X1 - 0.15, Y0 + 0.12, Y0 + 0.14, ZT, ZT + 0.12)), { c: 'ow' });
        else if (!FL) A(w2s, 0.4, box('pin', X0 + 0.15, X1 - 0.15, Y0 + 0.12, Y0 + 0.14, ZT, ZT + 0.12), { c: 'ow' });
        else { var pv = ''; range(X0 + 0.4, X1 - 0.2, 0.8).forEach(function (x) { pv += pl('vy', [x, Y1 - T / 2, ZT, x, Y1 - T / 2, ZT + 0.5]) + pl('vy', [x, Y0 + T / 2, ZT, x, Y0 + T / 2, ZT + 0.5]); }); range(Y0 + 0.4, Y1 - 0.2, 0.8).forEach(function (y) { pv += pl('vy', [X1 - T / 2, y, ZT, X1 - T / 2, y, ZT + 0.5]); }); A(w2s, 0.3, pv, { h: [Kk.raf, 0.3] }); } // випуски під парапет
        if (!FL) A(w2s, 0.9, box('mlt', X0 + 0.02, X1 - 0.02, Y0 + 0.03, Y0 + 0.23, ZT, MZ) + box('mlt', X0 + 0.02, X1 - 0.02, Y1 - 0.23, Y1 - 0.03, ZT, MZ), { m: 'd', c: 'ow' });
      } else A(w2s, 0, function (k) { return k > 0.99 ? (up ? ring('wr', X0, X1, Y0, Y1, T, ZB2, ZT, [], []).o + logEnds(ZB2, ZT) : ring('wr', X0, X1, Y0, Y1, T, ZF2, ZF2 + 0.15, [], []).o) : ''; }, { c: 'ow' });
    }
    // фронтон (грань x = X1) — стіновий матеріал або ОСБ, потім фасад (вальма й плоский дах — без фронтону)
    var gab = [X1, Y0, MZ, X1, Y1, MZ, X1, RY, RZ - 0.15];
    if (!HIP && !FL && !AF) A(Kk.raf, 0, pg((frame ? 'osb' : WC) + ' r', gab), { c: 'ow' });
    if (AF) { // каркас фронтону: стійки до схилів
      var gs = ''; range(Y0 + 0.3, Y1 - 0.2, 0.6).forEach(function (y) { gs += box('stud', X1 - 0.12, X1, y - 0.05, y + 0.05, ZP + 0.15, Math.min(afz(y), RZ) - 0.15); });
      A('f_w2', 0, gs, { m: 'd', c: 'ow' });
    }
    /* ── вікна: склопакети, рами, стрічки теплого монтажу; світло у вікнах */
    var wn = '', tp = '', gw2 = '', ok = '';
    OY.forEach(function (o) {
      if (o[4]) { wn += pg('dr', ry(Y1 + 0.01, o[0], o[1], o[2], o[3])) + pl('mu', [o[1] - 0.2, Y1 + 0.01, o[2] + 1.0, o[1] - 0.2, Y1 + 0.01, o[2] + 1.15]); }
      else { wn += pg('gl', ry(Y1 + 0.01, o[0], o[1], o[2], o[3])) + pl('fr', [o[0], Y1 + 0.01, o[2], o[1], Y1 + 0.01, o[2], o[1], Y1 + 0.01, o[3], o[0], Y1 + 0.01, o[3], o[0], Y1 + 0.01, o[2]]) + (o[1] - o[0] > 1.5 ? pl('mu', [(o[0] + o[1]) / 2, Y1 + 0.01, o[2], (o[0] + o[1]) / 2, Y1 + 0.01, o[3]]) : ''); gw2 += pg('glw', ry(Y1 + 0.02, o[0] + 0.08, o[1] - 0.08, o[2] + 0.08, o[3] - 0.08)); }
      tp += ph('tape', [ry(Y1 + 0.015, o[0] - 0.1, o[1] + 0.1, o[2] - (o[4] ? 0 : 0.1), o[3] + 0.1), ry(Y1 + 0.015, o[0], o[1], o[2], o[3])]);
      ok += ph('oks', [ry(Y1 + 0.02, o[0] - 0.12, o[1] + 0.12, o[2] - (o[4] ? 0 : 0.12), o[3] + 0.16), ry(Y1 + 0.02, o[0], o[1], o[2], o[3])]);
    });
    OX.concat(GWN).forEach(function (o) {
      wn += pg('gl r', rx(X1 + 0.01, o[0], o[1], o[2], o[3])) + pl('fr', [X1 + 0.01, o[0], o[2], X1 + 0.01, o[1], o[2], X1 + 0.01, o[1], o[3], X1 + 0.01, o[0], o[3], X1 + 0.01, o[0], o[2]]) + pl('mu', [X1 + 0.01, (o[0] + o[1]) / 2, o[2], X1 + 0.01, (o[0] + o[1]) / 2, o[3]]);
      gw2 += pg('glw', rx(X1 + 0.02, o[0] + 0.08, o[1] - 0.08, o[2] + 0.08, o[3] - 0.08));
      tp += ph('tape', [rx(X1 + 0.015, o[0] - 0.1, o[1] + 0.1, o[2] - 0.1, o[3] + 0.1), rx(X1 + 0.015, o[0], o[1], o[2], o[3])]);
      ok += ph('oks', [rx(X1 + 0.02, o[0] - 0.12, o[1] + 0.12, o[2] - 0.12, o[3] + 0.16), rx(X1 + 0.02, o[0], o[1], o[2], o[3])]);
    });
    if (AF) { // скляний фронтон: рами, імпости, двері по центру
      var gz = function (y) { return Math.min(afz(y), RZ) - 0.25; }, gp = [X1 + 0.02, Y0 + 0.5, ZP + 0.2, X1 + 0.02, Y1 - 0.5, ZP + 0.2, X1 + 0.02, Y1 - 0.5, gz(Y1 - 0.5), X1 + 0.02, RY, RZ - 0.45, X1 + 0.02, Y0 + 0.5, gz(Y0 + 0.5)];
      wn = pg('gl r', gp); var mm = ''; range(Y0 + 0.5 + 1.0, Y1 - 0.5 - 0.1, 1.0).forEach(function (y) { mm += pl('mu', [X1 + 0.03, y, ZP + 0.2, X1 + 0.03, y, gz(y)]); });
      wn += mm + pl('mu', [X1 + 0.03, Y0 + 0.5, ZF2 + 0.9, X1 + 0.03, Y1 - 0.5, ZF2 + 0.9]) + pg('dr', rx(X1 + 0.03, RY - 0.5, RY + 0.5, ZP + 0.2, ZP + 2.3));
      gw2 = pg('glw', gp.map(function (v, i) { return i % 3 === 0 ? v + 0.01 : v; })); tp = pl('tape', gp.concat(gp.slice(0, 3)));
    }
    if (brus) A('r_win', 0, ok, { c: 'ow' });
    A(Kk.win, brus ? 0.35 : 0, wn, { c: 'ow' });
    A(Kk.win, brus ? 0.6 : 0.4, tp, { c: 'ow', h: [Kk.fac, frame ? 0.45 : 0.1] });
    /* ── фасад: система за технологією й стилем (штукатурка, облицювальна цегла, вентфасад з облицюванням) */
    var D = { block: 0.12, brick: 0.2, frame: 0.1, brus: 0.005 }[mat], gt = HIP || FL ? null : [RY, RZ - 0.3], fz1 = FL ? ZT + 0.6 : MZ;
    if (AF) {
      var gpo = [X1 + 0.06, Y0 - 0.05, ZP, X1 + 0.06, Y1 + 0.05, ZP, X1 + 0.06, Y1 + 0.05, afz(Y1), X1 + 0.06, RY, RZ - 0.15, X1 + 0.06, Y0 - 0.05, afz(Y0)];
      A('fac_f', 0.45, '<path class="clad r" fill-rule="evenodd" d="M' + pp(gpo).replace(/ /g, 'L') + 'ZM' + pp(gp.map(function (v, i) { return i % 3 === 0 ? X1 + 0.06 : v; })).replace(/ /g, 'L') + 'Z"/>', { c: 'ow' });
    } else if (brus) A('r_fin', 0, skin('lz', X0, X1, Y0, Y1, D, ZP, ZT, OY, OX), { c: 'ow' });
    else if (H.FS === 'c' || H.FS === 'clad') { // вентфасад: утеплення (у каркаса — мембрана), контррейка, облицювання
      if (frame) A('f_ins', 0.3, skin('mb', X0, X1, Y0, Y1, 0.04, ZP, fz1, OY, OX, gt), { c: 'ow' });
      else A(Kk.fac, 0, skin(brick ? 'wool' : 'ins', X0, X1, Y0, Y1, 0.1, ZP + (brick ? 0 : 0.3), fz1, OY, OX, gt), { c: 'ow' });
      var bt = '', vd = C.s === 'barn', ztop = FL ? ZT + 0.6 : ZT;
      if (vd) { range(ZP + 0.4, ztop, 0.8).forEach(function (z) { bt += pl('bat', [X1 + 0.07, Y0, z, X1 + 0.07, Y1, z]) + pl('bat', [X0, Y1 + 0.07, z, X1, Y1 + 0.07, z]); }); }
      else { range(Y0 + 0.2, Y1, 0.6).forEach(function (y) { bt += pl('bat', [X1 + 0.07, y, ZP, X1 + 0.07, y, ztop]); }); range(X0 + 0.2, X1, 0.6).forEach(function (x) { bt += pl('bat', [x, Y1 + 0.07, ZP, x, Y1 + 0.07, ztop]); }); }
      A(Kk.fac, frame ? 0 : 0.3, bt, { c: 'ow' });
      A(Kk.fac, 0.45, skin('clad', X0, X1, Y0, Y1, Math.max(D, 0.14), ZP, fz1, OY, OX, gt) + (plate && !frame ? '' : pg('plt r', rx(X1 + D, Y0 - D, Y1 + D, ZP - 0.25, ZP)) + pg('plt l', ry(Y1 + D, X0 - D, X1 + D, ZP - 0.25, ZP))), { c: 'ow' });
      if (!plate || frame) {} else A(Kk.fac, 0.5, pg('xpsv r', rx(X1 + 0.15, Y0 - 0.15, Y1 + 0.15, ZP - 0.25, ZP + 0.05)) + pg('plt l', ry(Y1 + 0.15, X0 - 0.15, X1 + 0.15, ZP - 0.25, ZP + 0.05)) + pg('plt r', rx(X1 + 0.16, Y0 - 0.15, Y1 + 0.15, ZP - 0.25, ZP + 0.05)), { c: 'ow' });
    } else if (frame) { // каркас під штукатурку: мембрана, плити, армувальний шар і штукатурка
      A('f_ins', 0.3, skin('mb', X0, X1, Y0, Y1, 0.04, ZP, fz1, OY, OX, gt), { c: 'ow' });
      A('fac_f', 0.45, skin('rnd', X0, X1, Y0, Y1, D, ZP, fz1, OY, OX, gt) + pg('plt r', rx(X1 + D, Y0 - D, Y1 + D, ZP - 0.25, ZP)) + pg('plt l', ry(Y1 + D, X0 - D, X1 + D, ZP - 0.25, ZP)), { c: 'ow' });
    } else if (mat === 'block') {
      A('fac_b', 0, skin('ins', X0, X1, Y0, Y1, D, ZP + 0.3, fz1, OY, OX, gt) + pg('xpsv r', rx(X1 + D, Y0 - D, Y1 + D, ZP - 0.25, ZP + 0.3)) + pg('xpsv l', ry(Y1 + D, X0 - D, X1 + D, ZP - 0.25, ZP + 0.3)), { c: 'ow' });
      A('fac_b', 0.5, skin('rnd', X0, X1, Y0, Y1, D + 0.01, ZP + 0.3, fz1, OY, OX, gt) + pg('plt r', rx(X1 + D + 0.01, Y0 - D, Y1 + D + 0.01, ZP - 0.25, ZP + 0.3)) + pg('plt l', ry(Y1 + D + 0.01, X0 - D, X1 + D + 0.01, ZP - 0.25, ZP + 0.3)), { c: 'ow' });
    } else if (brick) {
      A('fac_k', 0, skin('wool', X0, X1, Y0, Y1, 0.1, ZP, fz1, OY, OX, gt), { c: 'ow' });
      A('fac_k', 0.45, skin('fbr', X0, X1, Y0, Y1, D, ZP - 0.1, fz1, OY, OX, gt), { c: 'ow' });
    }
    // стильові деталі фасаду: класика — карниз і обрамлення вікон; шале — камінь по цоколю; козирок над входом
    var FD = brus ? 0.01 : CL || H.FS === 'c' ? Math.max(D, 0.14) : D;
    if (C.s === 'classic' && !brus) {
      var sur = ''; OY.forEach(function (o) { if (!o[4]) sur += ph('sur', [ry(Y1 + FD + 0.012, o[0] - 0.14, o[1] + 0.14, o[2] - 0.12, o[3] + 0.2), ry(Y1 + FD + 0.012, o[0], o[1], o[2], o[3])]); });
      OX.forEach(function (o) { sur += ph('sur', [rx(X1 + FD + 0.012, o[0] - 0.14, o[1] + 0.14, o[2] - 0.12, o[3] + 0.2), rx(X1 + FD + 0.012, o[0], o[1], o[2], o[3])]); });
      A(Kk.fac, 0.8, sur + ring('crn', X0 - FD - 0.12, X1 + FD + 0.12, Y0 - FD - 0.12, Y1 + FD + 0.12, 0.3, ZT - 0.05, ZT + 0.18, [], []).o + (two ? ring('crn', X0 - FD - 0.04, X1 + FD + 0.04, Y0 - FD - 0.04, Y1 + FD + 0.04, 0.2, ZF2 - 0.12, ZF2, [], []).o : ''), { c: 'ow' });
    }
    if (C.s === 'chalet') A(Kk.fac, 0.8, skin('stn', X0, X1, Y0, Y1, FD + 0.04, ZP - 0.25, ZP + 1.0, OY, OX), { c: 'ow' });
    if (!AF) A(Kk.fac, 0.9, box('cnp', dc[0] - 0.4, dc[1] + 0.4, Y1 + FD, Y1 + FD + (C.s === 'minimal' ? 1.4 : 1.0), ZP + 2.45, ZP + 2.6) + (C.s === 'classic' ? box('col2', dc[0] - 0.3, dc[0] - 0.12, Y1 + FD + 0.75, Y1 + FD + 0.93, ZP, ZP + 2.45) + box('col2', dc[1] + 0.12, dc[1] + 0.3, Y1 + FD + 0.75, Y1 + FD + 0.93, ZP, ZP + 2.45) : ''), { m: 'd', c: 'ow' });
    // цоколь: оздоблення поверх XPS плити / стрічки (разом із фасадом)
    var cx2 = plate ? Sx1 + (frame ? 0.02 : 0.01) : X1 + 0.35, cy2 = plate ? Sy1 + (frame ? 0.02 : 0.01) : Y1 + 0.35, c0 = plate ? Sx0 : X0 - 0.35, c1 = plate ? Sy0 : Y0 - 0.35;
    if (frame || !plate) A(Kk.fac, 0.5, pg('plt r', rx(cx2, c1, cy2, -0.03, ZP)) + pg('plt l', ry(cy2, c0, cx2, -0.03, ZP)) + pg('plt t', rz(ZP, c0, cx2, cy2 - 0.12, cy2)) + pg('plt t', rz(ZP, cx2 - 0.12, cx2, c1, cy2)), { c: 'ow' });
    // склопакети поверх фасаду (фасад має отвори) — світло інтерʼєру; вікно у фронтоні мансарди — поверх оздоблення фронтону
    A('int', 0.6, gw2);
    if (GWN.length) A(Kk.fac, 0.95, GWN.map(function (o) { return pg('gl r', rx(X1 + FD + 0.02, o[0], o[1], o[2], o[3])) + pl('fr', [X1 + FD + 0.02, o[0], o[2], X1 + FD + 0.02, o[1], o[2], X1 + FD + 0.02, o[1], o[3], X1 + FD + 0.02, o[0], o[3], X1 + FD + 0.02, o[0], o[2]]); }).join(''), { c: 'ow' });
    /* ── дах */
    var seam = { barn: 1, scandi: 1, aframe: 1 }[C.s] || (C.s !== 'classic' && C.s !== 'chalet' && (frame || brus)), prof = '';
    if (FL) { // плоска покрівля: плита (2 пов.), парапет, ухилоутворення й утеплення, мембрана, лійки; тераса — плитка на опорах, скляне огородження, вихід на дах
      var RB = ZT, pr = ring('par', X0 - FD, X1 + FD, Y0 - FD, Y1 + FD, 0.25, RB, RB + 0.6, [], []);
      if (two) A(Kk.raf, 0, box(frame ? 'jst' : 'sl', X0, X1, Y0, Y1, ZB2 + 0.01, ZT), { m: 'd' });
      A(Kk.raf, 0.3, pr.i);
      A(Kk.raf, 0.55, pg('xps', rz(RB + 0.18, X0 - FD + 0.25, X1 + FD - 0.25, Y0 - FD + 0.25, Y1 + FD - 0.25)));
      A(Kk.raf, 0.3, pr.o, { c: 'ow' });
      A('roof', 0.35, pg('mbr', rz(RB + 0.3, X0 - FD + 0.25, X1 + FD - 0.25, Y0 - FD + 0.25, Y1 + FD - 0.25)) + pg('rsh f', rz(RB + 0.301, X0 - FD + 0.25, X1 + FD - 0.25, Y0 - FD + 0.25, Y1 + FD - 0.25)) + circ('drn2', X0 + 1, Y0 + 1, RB + 0.31, 2.5) + circ('drn2', X1 - 1, Y0 + 1, RB + 0.31, 2.5) + ring('cap', X0 - FD - 0.04, X1 + FD + 0.04, Y0 - FD - 0.04, Y1 + FD + 0.04, 0.33, RB + 0.6, RB + 0.66, [], []).o, { c: 'ow' });
      if (C.r) {
        var dk = pg('deck', rz(RB + 0.42, X0 + 0.4, X1 - 0.4, Y0 + 0.4, Y1 - 0.4)); range(X0 + 0.55, X1 - 0.5, 0.15 * 4).forEach(function (x) { dk += pl('dkl2', [x, Y0 + 0.4, RB + 0.42, x, Y1 - 0.4, RB + 0.42]); });
        A('roof', 0.6, dk + box(WC === 'wf' ? 'osb' : WC, X0 + 0.5, X0 + 2.9, Y0 + 0.5, Y0 + 2.9, RB + 0.3, RB + 2.6) + box('sl', X0 + 0.4, X0 + 3.0, Y0 + 0.4, Y0 + 3.0, RB + 2.6, RB + 2.8) + pg('dr', ry(Y0 + 2.91, X0 + 1.1, X0 + 2.0, RB + 0.42, RB + 2.4)), { m: 'd' });
        A('roof', 0.75, pg('glp', rx(X1 + FD - 0.05, Y0 - FD + 0.3, Y1 + FD - 0.3, RB + 0.66, RB + 1.6)) + pg('glp', ry(Y1 + FD - 0.05, X0 - FD + 0.3, X1 + FD - 0.3, RB + 0.66, RB + 1.6)), { c: 'ow' });
      }
    } else if (AF) {
      var rbA = ''; range(X0 - O + 0.1, X1 + O - 0.05, 0.6).forEach(function (x) { rbA += pl('cb', [x, RY, RZ + 0.05, x, Y1 + O, EZ + 0.05]); });
      A('f_osb', 0.2, pg('osbs', afF), { c: 'ow' });
      A('rafters', 0, pg('mem', afF) + rbA, { c: 'ow' });
      range(X0 - O + 0.5, X1 + O - 0.1, 0.5).forEach(function (x) { prof += pl('sm', [x, RY, RZ + 0.1, x, Y1 + O, EZ + 0.1]); });
      A('roof', 0.35, pg('rf f', afF.map(function (v, i) { return i % 3 === 2 ? v + 0.1 : v; })) + prof + pg('rsh', afF.map(function (v, i) { return i % 3 === 2 ? v + 0.11 : v; })) + pl('rk', [X1 + O, Y0 - O, EZ + 0.1, X1 + O, RY, RZ + 0.1, X1 + O, Y1 + O, EZ + 0.1]) + pl('rdg2', [X0 - O, RY, RZ + 0.16, X1 + O, RY, RZ + 0.16]), { m: 'd', c: 'ow' });
    } else {
      var hh = RY - Y0 + O, rb = '', rfr = '', xs = range(X0 - O + 0.1, X1 + O - 0.1, 0.6);
      var back, front, side = null, sideL = null;
      if (HIP) {
        back = [X0 - O, Y0 - O, EZ, X1 + O, Y0 - O, EZ, X1 + O - hh, RY, RZ, X0 - O + hh, RY, RZ]; front = [X0 - O, Y1 + O, EZ, X1 + O, Y1 + O, EZ, X1 + O - hh, RY, RZ, X0 - O + hh, RY, RZ];
        side = [X1 + O, Y0 - O, EZ, X1 + O, Y1 + O, EZ, X1 + O - hh, RY, RZ];
        sideL = [X0 - O, Y1 + O, EZ, X0 - O, Y0 - O, EZ, X0 - O + hh, RY, RZ]; // дальня вальма: при ухилі 30° її видно згори — без неї світилися крокви й карниз
        xs.forEach(function (x) { // крокви ближнього схилу й нарожники: коротші біля вальм
          var a = Math.min(1, Math.min(x - (X0 - O), (X1 + O) - x) / hh), y = Y1 + O - a * hh, z = EZ + a * (RZ - EZ);
          rfr += pl('raf', [x, Y1 + O, EZ, x, y, z]); rb += pl('raf', [x, Y0 - O, EZ, x, Y0 - O + a * hh, z]);
        });
        range(Y0 - O + 0.4, Y1 + O - 0.3, 0.6).forEach(function (y) { var a = Math.min(1, Math.min(y - (Y0 - O), (Y1 + O) - y) / hh); rfr += pl('raf', [X1 + O, y, EZ, X1 + O - a * hh, y, EZ + a * (RZ - EZ)]); });
        rfr += pl('rdg', [X1 + O, Y1 + O, EZ, X1 + O - hh, RY, RZ]) + pl('rdg', [X1 + O, Y0 - O, EZ, X1 + O - hh, RY, RZ]) + pl('rdg', [X0 - O, Y1 + O, EZ, X0 - O + hh, RY, RZ]);
      } else {
        back = [X0 - O, Y0 - O, EZ, X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ]; front = [X0 - O, Y1 + O, EZ, X1 + O, Y1 + O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ];
        xs.forEach(function (x) { rb += pl('raf', [x, Y0 - O, EZ, x, RY, RZ]); rfr += pl('raf', [x, RY, RZ, x, Y1 + O, EZ]); });
      }
      var sup = ''; if (brus) xs.forEach(function (x) { sup += box('sup', x - 0.08, x + 0.08, Y1 - 0.32, Y1 - 0.08, ZT, ZT + 0.1); });
      A(Kk.raf, 0, rb + pl('rdg', [X0 - O + (HIP ? hh : 0), RY, RZ, X1 + O - (HIP ? hh : 0), RY, RZ]) + rfr + sup, { m: 'd', c: 'ow' });
      A(Kk.raf, 0.35, pg('mem', back) + (sideL ? pg('mem', sideL) : '') + pg('mem', front) + (side ? pg('mem', side) : ''), { c: 'ow' });
      var cbt = '';
      if (!HIP) xs.forEach(function (x) { cbt += pl('cb', [x, RY, RZ + 0.05, x, Y1 + O, EZ + 0.05]); });
      range(0.08, 1, 0.12).forEach(function (u) { var y = Y1 + O - u * hh, z = EZ + u * (RZ - EZ) + 0.08, e = HIP ? u * hh : 0; cbt += pl('bttn', [X0 - O + e, y, z, X1 + O - e, y, z]); });
      A(Kk.raf, 0.65, cbt, { c: 'ow' });
      var lift = function (a) { return a.map(function (v, i) { return i % 3 === 2 ? v + 0.1 : v; }); };
      if (seam) range(X0 - O + 0.5, X1 + O - 0.1, 0.5).forEach(function (x) { var a = HIP ? Math.min(1, Math.min(x - (X0 - O), (X1 + O) - x) / hh) : 1; prof += pl('sm', [x, Y1 + O - a * hh, EZ + a * (RZ - EZ) + 0.1, x, Y1 + O, EZ + 0.1]); });
      else range(0.06, 1, 0.075).forEach(function (u) { var y = Y1 + O - u * hh, z = EZ + u * (RZ - EZ) + 0.1, e = HIP ? u * hh : 0; prof += pl('tl', [X0 - O + e, y, z, X1 + O - e, y, z]); if (HIP) prof += pl('tl', [X1 + O - u * hh, Y0 - O + u * hh, z, X1 + O - u * hh, Y1 + O - u * hh, z]); });
      var vx = X0 + 1.0, vz = zr(Y0 + 0.7) + 0.12, rws = '';
      if (attic) range(X0 + 1.4, X1 - 1.0, Math.max(2.6, H.W / 4)).forEach(function (x) { var u0 = 0.3, u1 = 0.55; rws += pg('gl', [x, Y1 + O - u0 * hh, EZ + u0 * (RZ - EZ) + 0.12, x + 0.8, Y1 + O - u0 * hh, EZ + u0 * (RZ - EZ) + 0.12, x + 0.8, Y1 + O - u1 * hh, EZ + u1 * (RZ - EZ) + 0.12, x, Y1 + O - u1 * hh, EZ + u1 * (RZ - EZ) + 0.12]); });
      A('roof', 0.35, pg('rf b', lift(back)) + (sideL ? pg('rf b', lift(sideL)) : '') + box('vent', vx, vx + 0.3, Y0 + 0.55, Y0 + 0.85, vz - 0.4, vz + 0.8) + pg('rf f', lift(front)) + (side ? pg('rf s', lift(side)) : '') + prof + pg('rsh', lift(front)) + (side ? pg('rsh s', lift(side)) : '') + rws +
        (HIP ? '' : pl('rk', [X1 + O, Y0 - O, EZ + 0.1, X1 + O, RY, RZ + 0.1, X1 + O, Y1 + O, EZ + 0.1])) + pl('rdg2', [X0 - O + (HIP ? hh : 0), RY, RZ + 0.16, X1 + O - (HIP ? hh : 0), RY, RZ + 0.16]), { m: 'd', c: 'ow' });
      if (O > 0.2) A('roof', 0.7, pl('gut', [X0 - O, Y1 + O + 0.08, EZ - 0.05, X1 + O, Y1 + O + 0.08, EZ - 0.05]) + pl('gut', [X1 + O - 0.15, Y1 + O + 0.08, EZ - 0.05, X1 + O - 0.15, Y1 + O + 0.08, 0.25]), { c: 'ow' });
    }
    // навіс для авто: стовпи й плоский дах
    if (CP) A('roof', 0.5, box('post', CP[0], CP[0] + 0.15, CP[3] - 0.15, CP[3], ZP, 2.7) + box('post', CP[1] - 0.15, CP[1], CP[3] - 0.15, CP[3], ZP, 2.7) + box('post', CP[0], CP[0] + 0.15, CP[2], CP[2] + 0.15, ZP, 2.7) +
      box('wsl', CP[0] - 0.2, CP[1] + 0.05, CP[2] - 0.2, CP[3] + 0.3, 2.7, 2.92), { m: 'd' });
    /* ── передній план: техніка, дрон, ганок (брус), дерева, світло, людина для масштабу, гарантія */
    var tk = [GX - 1.8, GX - 0.2, GY - 1.6, GY - 0.4];
    var trk = box('trk', tk[0], tk[1], tk[2], tk[3], 0, 0.9) + box('trc', tk[0], tk[0] + 0.7, tk[3], tk[3] + 0.6, 0, 1.2);
    if (plate && !frame) A('pour', 0, trk + pl('boom', [tk[0] + 1, tk[2] + 0.6, 1.2, cx + 4.4, cy + 2.9, 5.6, cx + 0.8, cy + 0.9, 4.2, cx + 0.2, cy + 0.5, 1.2]) + pl('hose', [cx + 0.2, cy + 0.5, 1.2, cx + 0.2, cy + 0.5, 0.4]), { h: ['pour', 0.95] });
    else if (plate) A('pour', 0, trk + pl('boom', [tk[0] + 1, tk[2] + 0.6, 1.2, cx + 4.4, cy + 2.9, 4.4, cx + 0.8, cy + 0.9, 2.8, cx + 0.2, cy + 0.5, 0.9]) + pl('hose', [cx + 0.2, cy + 0.5, 0.9, cx + 0.2, cy + 0.5, 0.35]), { h: ['pour', 0.95] });
    else A('s_pour', 0, trk + pl('boom', [tk[0] + 1, tk[2] + 0.6, 1.2, X1 + 1.2, Y1 + 0.6, 2.6, X1 + 0.4, Y1 + 0.4, 0.9]) + pl('hose', [X1 + 0.4, Y1 + 0.4, 0.9, X1 + 0.4, Y1 + 0.3, 0.35]), { h: ['s_pour', 0.95] });
    if (!frame && !brus) A('slab', 0, box('trk', 0.4, 2.4, GY - 1.8, GY - 0.6, 0, 0.9) + pl('boom', [1.4, GY - 1.2, 1.0, cx + 0.2, cy, ZF2 + 6.1]) + pl('hose', [cx + 0.2, cy, ZF2 + 6.1, cx + 0.2, cy, ZF2 + 1.1]) + box('sl', cx - 0.8, cx + 1.2, cy - 1.3, cy + 1.7, ZF2 + 0.9, ZF2 + 1.12), { h: ['slab', 0.9] });
    A('geo', 0, pl('tri', [GX - 1.6, GY - 1.4, 0, GX - 1.0, GY - 1.1, 1.5, GX - 0.4, GY - 1.5, 0]) + pl('tri', [GX - 1.0, GY - 1.1, 1.5, GX - 0.8, GY - 0.5, 0]) + box('tri-h', GX - 1.2, GX - 0.8, GY - 1.3, GY - 0.9, 1.5, 1.8), { h: ['base', 0] });
    var drone = function () { var q = P(GX - 1.4, 1.6, RZ + 1.5).split(','), x = +q[0], y = +q[1]; return '<g class="drn"><path d="M' + (x - 13) + ' ' + y + 'h26M' + x + ' ' + (y - 5) + 'v10" class="dra"/><rect x="' + (x - 4) + '" y="' + (y - 2.5) + '" width="8" height="5" rx="1.5" class="drb"/>' +
      [[-13, 0], [13, 0], [0, -5], [0, 5]].map(function (q2) { return '<ellipse cx="' + (x + q2[0]) + '" cy="' + (y + q2[1]) + '" rx="5" ry="1.6" class="drr"/>'; }).join('') + '</g>'; };
    A(Kk.sl, 0.2, drone(), { h: [Kk.sl, 0.95] }); A('roof', 0.2, drone(), { h: ['roof', 0.98] });
    if (brus && !AF) {
      var pX = Math.min(X1 - 3.2, dX - 1.4);
      var por = box('post', pX + 0.4, pX + 0.56, Y1 + 1.2, Y1 + 1.36, 0.2, ZB1 - 0.15) + box('post', pX + 2.4, pX + 2.56, Y1 + 1.2, Y1 + 1.36, 0.2, ZB1 - 0.15) + box('jack', pX + 0.38, pX + 0.58, Y1 + 1.18, Y1 + 1.38, ZB1 - 0.15, ZB1) + box('jack', pX + 2.38, pX + 2.58, Y1 + 1.18, Y1 + 1.38, ZB1 - 0.15, ZB1) +
        box('wsl', pX, pX + 3.0, Y1, Y1 + 1.5, ZB1, ZB1 + 0.12);
      A('r_shrink', 0, por, { m: 'd' });
      A('r_shrink', 0.3, pl('arr', [X1 - 0.4, Y1 + 0.3, ZT - 0.3, X1 - 0.4, Y1 + 0.3, ZT - 1.2]) + pl('arr', [X1 - 0.6, Y1 + 0.3, ZT - 0.95, X1 - 0.4, Y1 + 0.3, ZT - 1.2, X1 - 0.2, Y1 + 0.3, ZT - 0.95]) + txt('dt', X1 - 0.1, Y1 + 0.3, ZT - 0.8, 0, ui.shrink), { h: ['r_win', 0.5] });
    }
    A('land', 0.3, tree(1.4, GY - 1.4, 1.4, 20) + tree(GX - 1, 1.4, 1.6, 22) + circ('cr2', X0 + 2, Y1 + 1.5, 0.35, 7) + circ('cr', X0 + 3.3, Y1 + 1.55, 0.35, 8) + circ('cr2', X1 - 1.4, Y1 + 1.5, 0.35, 7), { m: 'd' });
    A('land', 0.6, pl('lp', [dX - 1.2, GY - 0.8, 0, dX - 1.2, GY - 0.8, 1.1]) + circ('lpg', dX - 1.2, GY - 0.8, 1.15, 9) + circ('bulb', dX - 1.2, GY - 0.8, 1.15, 2) + pl('lp', [GX - 1.3, GY - 0.6, 0, GX - 1.3, GY - 0.6, 1.1]) + circ('lpg', GX - 1.3, GY - 0.6, 1.15, 9) + circ('bulb', GX - 1.3, GY - 0.6, 1.15, 2));
    // людина 1,8 м біля входу — масштаб; зʼявляється на благоустрої (раніше стояла перед фасадом на всіх етапах і читалась як артефакт)
    var hp = P(dX + 1.1, Y1 + 1.6, 0).split(','), hq = P(dX + 1.1, Y1 + 1.6, 1.8).split(',');
    A('land', 0.8, '<g class="man"><line x1="' + hp[0] + '" y1="' + hp[1] + '" x2="' + hq[0] + '" y2="' + (+hq[1] + 3.2) + '"/><circle cx="' + hq[0] + '" cy="' + (+hq[1] + 1.6) + '" r="1.7"/></g>');
    A('done', 0, seal(GX - 0.6, Y0 + 0.4, RZ + 0.9, ui), { m: 'd' });
    return { parts: L, xr: S('mep'), th: [], W: H.W, D: H.D };
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
    var num = function (v) { return W.casNum(v, lang); };

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
    f_pq: ['#b58a5a', '#6b8c6e', '#c9c2b5', '#86807a', '#45403a'], f_net: ['#e8b75a', '#b08be0', '#6fa8dc', '#e0705a', '#a8a39b', '#f0a04b', '#7fd3d9'],
    w_block_v: ['#8a6a4e', '#2a2622', '#cfd8dd', '#d8c46a', '#bdb6aa', '#efe9df'], w_brick_v: ['#8a6a4e', '#2a2622', '#cfd8dd', '#d8c46a', '#9a4a30', '#efe9df'],
    roof_flat: ['#4a4d52', '#d8c46a', '#9a948b', '#1f1d1b', '#8f8a82'], roof_ter: ['#a07a52', '#cfd8dd', '#8fb3c9', '#4a4d52', '#9a948b', '#8f8a82'],
    slab_c: ['#d8c46a', '#9fb2bd', '#8f8a82', '#e3dbcd']
  };

  /* ---------- збірка блоку ---------- */
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function enhance(sec, data) {
    if (sec.hasAttribute('data-bz-on')) return;
    sec.setAttribute('data-bz-on', '');
    // блок вище екрана (швидка прокрутка): після збірки він виросте на кілька екранів — тримаємо видимий вміст на місці самі,
    // якщо скрол-якоріння браузера не спрацює (Safari без overflow-anchor, анімовані reveal-вузли), інакше CLS до 1.0
    var above = sec.getBoundingClientRect().bottom <= 0, nxt = sec.nextElementSibling, nxt0 = above && nxt ? nxt.getBoundingClientRect().top : 0;
    var ui = data.ui, scene = sec.getAttribute('data-bz') === 'flat' ? 'flat' : 'house';
    var ol = sec.querySelector('ol.bz-st'), cta = sec.querySelector('.bz-cta'); if (!cta) return;
    if (!ol) { ol = el('ol', 'bz-st'); cta.parentNode.insertBefore(ol, cta); } // сторінка на межі бюджету: список — лише з JSON
    var sx = secs.indexOf(sec) > 0 ? secs.indexOf(sec) + '-' : ''; // кілька блоків на сторінці (styleguide) — унікальні id
    if (!cta.id) cta.id = 'bz-cta' + (sx ? '-' + sx.slice(0, -1) : '');
    var mat = sec.getAttribute('data-bz-m'); if (MATS.indexOf(mat) < 0) mat = 'block';
    var fv = sec.getAttribute('data-bz-v') === 'old' ? 'old' : 'new', xr = false, cpt = sec.hasAttribute('data-bz-c'), hl = '';
    if (data.hs) HS = data.hs;
    // конфігурація будинку: технологія (m), тип (t), стиль (s), площа (a), гараж/навіс (g), тераса на даху (r); стартова — data-bz-cfg="тип,стиль,площа"
    var hd0 = data.hdef || { t: 'two', s: 'scandi', a: 160 }, cf0 = (sec.getAttribute('data-bz-cfg') || '').split(',');
    var C = { m: mat, t: cf0[0] || hd0.t, s: cf0[1] || hd0.s, a: +(cf0[2] || hd0.a), g: '', r: 0, lang: lang }, hint = '', cfgOpen = false;
    hfix(C, 'm'); mat = C.m;
    var seq, n, lis = [], sc, svg, layers = [], ghost, cam, sky, stars, VB, pLast = 0, sPrev = 0, act = -1, cur = 0, raf = 0, top0 = 0, live = false, rm = !!(MQ && MQ.matches), man = 0, pieKey = null, pieSel = 0;
    function S(k) { return seq.indexOf(k); }
    function pieOf(k) {
      var a = data.pieAt[scene][k]; if (a && typeof a === 'object') a = a[mat];
      if (scene === 'house') { // пироги під конфігурацію: вентфасад, плоска покрівля / тераса, горищне перекриття, схили A-frame
        var h = hder(C);
        if (h.AF && (k === 'f_ins' || a === 'w_frame')) a = 'roof';
        if (a === 'w_block' && h.FS === 'clad') a = 'w_block_v'; if (a === 'w_brick' && h.FS === 'clad') a = 'w_brick_v';
        if (a === 'roof' && h.FL) a = C.r ? 'roof_ter' : 'roof_flat';
        if (a === 'slab' && h.TY === 'one') a = h.FL ? null : 'slab_c';
      }
      return a && data.pie[a] ? a : null;
    }
    function stx(st, k, suf) { // текст етапу: квартира — варіант (_n / _o), будинок — заміни за конфігурацією (тип, дах, фасад)
      if (scene === 'flat') return st[k + suf] || st[k];
      var tg = hder(C).tags, o = data.sto || {};
      for (var i = 0; i < tg.length; i++) if (o[tg[i]] && o[tg[i]][k]) return o[tg[i]][k];
      return st[k];
    }
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
        (scene === 'house' ? (ui.cfg ? '<button type="button" class="bz-cb" aria-expanded="' + cfgOpen + '" aria-controls="' + cfg.id + '"><span aria-hidden="true">⚙</span> ' + esc(summ()) + '</button>' : grp(ui.mat, 'm', MATS, mat, ui.m)) :
          ui.fl ? grp(ui.fl.v, 'v', data.fv || ['new', 'old'], fv, ui.fl) : '');
      cfgHtml();
    }
    // конфігуратор будинку: технологія, тип, опції, стиль, площа + підказка про сумісність і орієнтир цін (лише «від» з CLAUDE.md)
    var cfg = el('div', 'bz-cfg'); cfg.id = 'bz-cfg' + sx; cfg.setAttribute('role', 'group'); cfg.setAttribute('aria-label', ui.mat || '');
    var cap = el('p', 'bz-cap'); cap.setAttribute('aria-live', 'polite');
    function flL(h) { var u = ui.cfg; return h.AF ? u.fl.af : u.fl[h.TY]; }
    function summ() { var u = ui.cfg, h = hder(C); return ui.m[C.m] + ' · ' + (h.AF ? '' : u.tn[h.TY] + ' · ') + u.sn[C.s] + ' · ' + C.a + ' ' + u.m2; }
    function cfgHtml() {
      var u = ui.cfg; if (!u) return;
      cfg.hidden = scene !== 'house'; cap.hidden = scene !== 'house';
      if (scene !== 'house') return;
      var h = hder(C), ex = ['g', 'c', 'r'].map(function (k) { var on = k === 'r' ? !!C.r : C.g === k; return '<button type="button" data-x="' + k + '" aria-pressed="' + on + '">' + esc(u.xn[k]) + '</button>'; }).join('');
      var szn = {}; SZ.forEach(function (a) { szn[a] = a + ' ' + u.m2; });
      cfg.innerHTML = '<div class="bz-cr">' + grp(ui.mat, 'm', MATS, C.m, ui.m) + '</div><div class="bz-cr">' + grp(u.t, 't', TYP, h.AF ? '' : h.TY, u.tn) +
        '<span class="bz-g" role="group" aria-label="' + esc(u.x) + '"><span class="bz-gl" aria-hidden="true">' + esc(u.x) + '</span>' + ex + '</span></div>' +
        '<div class="bz-cr">' + grp(u.s, 'c', STY, C.s, u.sn) + '</div><div class="bz-cr">' + grp(u.a, 'a', SZ, C.a, szn) + '</div>' +
        '<p class="bz-hint" aria-live="polite">' + esc(hint && u.h[hint] ? u.h[hint] : '') + '</p><p class="bz-prc">' + esc(u.price) + '</p>' +
        '<button type="button" class="bz-cx">' + esc(u.done) + '</button>';
      var dm = function (v) { return W.casNum(v, lang); };
      cap.textContent = '≈ ' + C.a + ' ' + u.m2 + ' · ' + flL(h) + ' · ' + dm(h.W) + ' × ' + dm(h.D) + ' м'.replace('м', lang === 'en' ? 'm' : 'м') + (C.g ? ' · ' + (C.g === 'g' ? u.gar : u.car) : '') + (C.r ? ' · ' + u.ter : '');
    }
    function setCfgOpen(v) {
      cfgOpen = v; fig.classList.toggle('cfg-open', v);
      var b = mats.querySelector('.bz-cb'); if (b) b.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (v) { var f = cfg.querySelector('button[aria-pressed="true"]'); if (f) try { f.focus({ preventScroll: true }); } catch (x) { } } else if (b) try { b.focus({ preventScroll: true }); } catch (x) { }
    }
    cfg.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.classList.contains('bz-cx')) { setCfgOpen(false); return; }
      var k = '', v, at = '';
      if (b.hasAttribute('data-m')) { k = 'm'; at = 'm'; v = b.getAttribute('data-m'); }
      else if (b.hasAttribute('data-t')) { k = 't'; at = 't'; v = b.getAttribute('data-t'); }
      else if (b.hasAttribute('data-c')) { k = 's'; at = 'c'; v = b.getAttribute('data-c'); }
      else if (b.hasAttribute('data-a')) { k = 'a'; at = 'a'; v = +b.getAttribute('data-a'); }
      else if (b.hasAttribute('data-x')) { at = 'x'; v = b.getAttribute('data-x'); if (v === 'r') { k = 'r'; v = C.r ? 0 : 1; } else { k = 'g'; v = C.g === v ? '' : v; } }
      if (!k || C[k] === v) return;
      var key = b.getAttribute('data-' + at);
      C[k] = v; hint = hfix(C, k); mat = C.m; fade = 1;
      build(); render(cur); placeCfg();
      cl('build_anim_cfg', [C.m, C.t, C.s, C.a, C.g || '-', C.r ? 'ter' : '-'].join('|'));
      var f = cfg.querySelector('button[data-' + at + '="' + key + '"]'); if (f) try { f.focus({ preventScroll: true }); } catch (x) { }
    });
    cfg.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cfgOpen) setCfgOpen(false); });
    function placeCfg() { // десктоп: панель над сценою, сцена — нижче (padding у межах fig, висота блоку та сама); телефон — панель за кнопкою поверх сцени
      var mob = !!(MOB && MOB.matches), on = scene === 'house' && !!ui.cfg && !mob;
      cfg.style.top = on && cpt ? (mats.offsetHeight + 8) + 'px' : '';
      fig.style.paddingTop = on ? (cfg.offsetTop + cfg.offsetHeight + 4) + 'px' : '';
      if (!mob && cfgOpen) setCfgOpen(false);
    }
    mats.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
      if (b.hasAttribute('data-m') && scene === 'house') { C.m = b.getAttribute('data-m'); hint = hfix(C, 'm'); mat = C.m; fade = 1; rebuild(); cl('build_anim_mat', mat); return; }
      if (b.hasAttribute('data-m')) setMat(b.getAttribute('data-m'), 1);
      else if (b.hasAttribute('data-v')) { fv = b.getAttribute('data-v'); rebuild(); cl('build_anim_var', fv); }
      else if (b.hasAttribute('data-s')) {
        var ns = b.getAttribute('data-s');
        W.__casBAd(ns).then(function (d2) { // друга сцена: дані дотягуємо й домішуємо
          ['st', 'pieAt', 'pie'].forEach(function (k) { for (var q in d2[k]) data[k][q] = d2[k][q]; });
          ['flat', 'fv', 'mats', 'hs', 'hdef', 'sto'].forEach(function (k) { if (d2[k] && !data[k]) data[k] = d2[k]; });
          if (data.hs) HS = data.hs;
          scene = ns; fade = 1; rebuild(); placePie(); placeCfg(); cl('build_anim_scene', scene);
        }).catch(function () { });
      }
      else if (b.classList.contains('bz-cb')) { setCfgOpen(!cfgOpen); return; }
      var f = mats.querySelector('button[aria-pressed="true"]' + (b.hasAttribute('data-s') ? '[data-s]' : '')); if (f) try { f.focus({ preventScroll: true }); } catch (x) { }
    });
    function rebuild() { build(); render(cur); }
    side.appendChild(hd); side.appendChild(ol); side.appendChild(pie); side.appendChild(ctl); side.appendChild(goA);
    fig.appendChild(mats); fig.appendChild(cfg); fig.appendChild(cap); fig.appendChild(lg);
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

    var fade = 0;
    function build() { // текст етапів (JSON = той самий текст, що в HTML для стартового матеріалу), кнопки, сцена
      seq = scene === 'flat' ? data.flat : data.mats[mat]; n = seq.length;
      if (scene === 'flat') { SY = K * 0.6; ZK = K * 0.8; } else { SY = K * 0.5; ZK = K; } // квартира — трохи «згори»: низькі перегородки не ховають кімнати
      var st = data.st[scene], suf = fv === 'new' ? '_n' : '_o';
      ol.innerHTML = seq.map(function (k, i) { var s = stx(st, k, suf) || ['', '']; return '<li id="bz-s' + sx + i + '"><div><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div></li>'; }).join('');
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
      C.m = mat; sc = scene === 'flat' ? flat(S, ui, fv, lang) : house(C, S, ui);
      var body = '', nb = '';
      sc.parts.forEach(function (p, i) {
        var v = typeof p.v === 'function' ? '' : p.v;
        if (typeof p.v === 'function') p.v(1); // габарити з урахуванням повної висоти
        var h = p.s < -1 && p.e < 0 && !p.c ? v : '<g class="bz-l' + (p.c ? ' ' + p.c : '') + '" data-i="' + i + '">' + v + '</g>';
        if (p.n) nb += h; else body += h;
      });
      if (scene === 'flat') body = '<g class="bz-sc">' + body + '</g><g class="bz-nt">' + nb + '</g>'; else body += nb;
      var pad = 12, vb = [bb[0] - pad, bb[1] - pad - 30, bb[2] - bb[0] + pad * 2, bb[3] - bb[1] + pad * 2 + 30].map(function (v) { return v.toFixed(0); }).join(' ');
      var h2 = sec.querySelector('h2'), old = fig.querySelector('svg:not(.bz-out)');
      VB = vb.split(' ').map(Number);
      var skyH = '';
      if (scene !== 'flat') { // небо: день → вечір за прокруткою (зорі на останньому етапі)
        skyH = '<rect class="bz-sky" x="' + VB[0] + '" y="' + VB[1] + '" width="' + VB[2] + '" height="' + VB[3] + '" fill="url(#bz-sk-' + scene + ')"/><g class="bz-stars">';
        for (var si = 0; si < 26; si++) { var rr = Math.sin(si * 91.7 + 7.3) * 4375.85, fx = rr - Math.floor(rr), ry2 = Math.sin(si * 37.1 + 1.9) * 9137.3, fy = ry2 - Math.floor(ry2); skyH += '<circle cx="' + (VB[0] + fx * VB[2]).toFixed(0) + '" cy="' + (VB[1] + fy * VB[3] * 0.35).toFixed(0) + '" r="' + (si % 3 ? 0.9 : 1.4) + '" style="animation-delay:' + (si % 7) * 0.4 + 's"/>'; }
        skyH += '</g>';
      }
      var html = '<svg viewBox="' + vb + '" role="img" aria-label="' + esc(ui.fig + (h2 ? h2.textContent : '')) + '" focusable="false" preserveAspectRatio="xMidYMid meet" class="' + (scene === 'flat' ? 'f-' + fv : 'm-' + mat + ' st-' + C.s) + '">' +
        '<defs><linearGradient id="bz-gw-' + scene + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8"/><stop offset="1" stop-color="#e2a24f"/></linearGradient>' +
        '<radialGradient id="bz-rg-' + scene + '"><stop offset="0" stop-color="#f6c978" stop-opacity=".55"/><stop offset="1" stop-color="#f6c978" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="bz-sk-' + scene + '" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#8fb4d4" stop-opacity=".2"/><stop offset="1" stop-color="#8fb4d4" stop-opacity="0"/></radialGradient>' + pats() + '</defs>' + skyH + '<g class="bz-cam">' + body + '</g></svg>';
      var tmp = el('div', '', html), nsvg = tmp.firstChild;
      if (old && fade && !rm) { // перехід між конфігураціями: стара сцена гасне поверх нової (без зсуву макета — absolute у межах fig)
        var fr = fig.getBoundingClientRect(), orc = old.getBoundingClientRect();
        [].forEach.call(fig.querySelectorAll('svg.bz-out'), function (x) { x.parentNode.removeChild(x); });
        old.classList.add('bz-out'); old.style.cssText = 'position:absolute;left:' + (orc.left - fr.left) + 'px;top:' + (orc.top - fr.top) + 'px;width:' + orc.width + 'px;height:' + orc.height + 'px;transform:none';
        fig.insertBefore(nsvg, old); nsvg.classList.add('bz-in');
        W.requestAnimationFrame(function () { old.style.opacity = '0'; });
        setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); nsvg.classList.remove('bz-in'); }, 520);
      } else if (old) fig.replaceChild(nsvg, old); else fig.insertBefore(nsvg, fig.firstChild);
      fade = 0;
      svg = nsvg;
      svg.style.setProperty('--gw', 'url(#bz-gw-' + scene + ')'); svg.style.setProperty('--rg', 'url(#bz-rg-' + scene + ')');
      var gs = svg.querySelectorAll('g.bz-l[data-i]');
      layers = [].map.call(gs, function (g) { var p = sc.parts[+g.getAttribute('data-i')]; return { g: g, p: p, k: -1 }; });
      ghost = svg.querySelector('.ghost'); cam = svg.querySelector('g.bz-cam'); sky = svg.querySelector('.bz-sky'); stars = svg.querySelector('.bz-stars');
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
      var u = ui.cfg, h = hder(C);
      sl.setAttribute('data-msg', scene === 'flat' ? (ui.sc ? ui.sc.flat + ': ' : '') + (ui.fl ? ui.fl[fv] : fv) :
        (ui.sc ? ui.sc.house + ': ' : '') + (u ? [ui.m[C.m], flL(h), u.sn[C.s], '≈' + C.a + ' ' + u.m2].concat(C.g ? [C.g === 'g' ? u.gar : u.car] : [], C.r ? [u.ter] : []).join(' / ') : ui.m[mat]));
    }
    function setMat(m, user) {
      mat = m; build(); render(cur);
      if (user) cl('build_anim_mat', mat);
    }

    // плавна камера: на старті — ближче до землі (фундамент, кладка), далі відʼїжджає до цілого будинку; s уже згладжений rAF
    function camera(s) {
      if (!cam || !VB) return;
      var t = rm ? 1 : clamp(s / (n * 0.5)), z = 1 + 0.12 * (1 - t) * (1 - t), cx = VB[0] + VB[2] / 2, cy = VB[1] + VB[3] * (0.62 - 0.12 * t);
      cam.setAttribute('transform', z > 1.001 ? 'translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ') scale(' + z.toFixed(4) + ') translate(' + (-cx).toFixed(1) + ' ' + (-cy).toFixed(1) + ')' : '');
      if (sky) { var e = clamp((s - (n - 1.8)) / 1.4); sky.style.opacity = (1 - e).toFixed(3); stars.style.opacity = clamp((s - (n - 1)) / 0.8).toFixed(3); }
    }
    // частинки: пил при кладці рядів і появі деталей, іскри — на мережах; лише при прокрутці вперед і без reduced-motion
    function puff(g, kind, row) {
      if (rm || !cam || !g.firstChild) return;
      var now = Date.now(); if (now - pLast < (row ? 70 : 140)) return; pLast = now;
      var b; try { b = g.getBBox(); } catch (e) { return; } if (!b.width) return;
      var cn = kind === 2 ? 'bz-sp' : 'bz-dp', h = '';
      for (var i = 0; i < (row ? 5 : 7); i++) {
        var x = b.x + b.width * (0.15 + 0.7 * Math.random()), y = row ? b.y + 2 : b.y + b.height * (0.2 + 0.5 * Math.random());
        h += '<circle class="' + cn + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (1 + Math.random() * 1.6).toFixed(1) + '" style="--dx:' + ((Math.random() - 0.5) * 22).toFixed(1) + 'px;--dy:' + (-6 - Math.random() * 16).toFixed(1) + 'px;animation-delay:' + (i * 0.04).toFixed(2) + 's"/>';
      }
      var pg2 = d.createElementNS('http://www.w3.org/2000/svg', 'g'); pg2.setAttribute('class', 'bz-pf'); pg2.innerHTML = h; cam.appendChild(pg2);
      setTimeout(function () { if (pg2.parentNode) pg2.parentNode.removeChild(pg2); }, 1300);
    }
    function render(s) {
      for (var j = 0; j < layers.length; j++) {
        var Ly = layers[j], p = Ly.p, k = p.s < -1 ? 1 : clamp((s - p.s) / 0.25);
        if (p.e >= 0) k *= 1 - clamp((s - p.e) / 0.25);
        k = Math.round(k * 100) / 100;
        if (p.e >= 0 && xr && p.n) k = p.s < -1 ? 1 : clamp((s - p.s) / 0.25); // рентген: прокладені мережі видно й під оздобленням
        if (k === Ly.k) continue;
        var was = Ly.k; Ly.k = k;
        if (p.m === 'g') { var h = p.v(k); if (h !== Ly.h) { var grew = Ly.h != null && h.length > Ly.h.length; Ly.h = h; Ly.g.innerHTML = h; if (grew && s > sPrev) puff(Ly.g, 0, 1); } continue; }
        if (was === 0 && k > 0 && s > sPrev) puff(Ly.g, p.n ? 2 : 0, 0);
        Ly.g.style.opacity = p.m === 'd' ? Math.min(1, k * 1.8) : k;
        // монтаж: деталь зʼявляється майже на місці й коротко «сідає» (кран опускає) — не висить над будинком
        if (p.m === 'd') { var dk = 1 - k; Ly.g.setAttribute('transform', k < 1 ? 'translate(0 ' + (-dk * dk * 10).toFixed(1) + ')' : ''); }
      }
      if (ghost) ghost.style.opacity = (0.35 * (1 - clamp(s / (n * 0.16)))).toFixed(3); // контур майбутнього обʼєму — лише на розмітці й котловані, далі не «висить» над будинком
      camera(s); sPrev = s;
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
    W.addEventListener('resize', function () { measure(); placeCfg(); }, { passive: true });
    if (MQ) { if (MQ.addEventListener) MQ.addEventListener('change', mode); else if (MQ.addListener) MQ.addListener(mode); }
    if (MOB) { if (MOB.addEventListener) { MOB.addEventListener('change', placePie); MOB.addEventListener('change', placeCfg); } else if (MOB.addListener) { MOB.addListener(placePie); MOB.addListener(placeCfg); } }
    if ('IntersectionObserver' in W) {
      new IntersectionObserver(function (es) { live = es[0].isIntersecting; if (live) kick(); }).observe(run);
    } else live = true;
    // мікровзаємодії (лише миша, без prefers-reduced-motion): легкий нахил сцени за курсором і «магнітна» кнопка CTA
    if (W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      fig.addEventListener('pointermove', function (e) {
        if (rm || e.target.closest('.bz-mats,.bz-pie,.bz-lg,.bz-cfg')) return;
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
    placeCfg();
    render(0.6);
    mode();
    if (above && nxt) { var dy = nxt.getBoundingClientRect().top - nxt0; if (Math.abs(dy) > 1) W.scrollBy(0, dy); }
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
  function data(sc) { // дані сцени (house / flat) — кожна сторінка тягне лише свою; головна дотягує другу при перемиканні
    dataP = dataP || {};
    if (!dataP[sc]) dataP[sc] = fetch('/assets/build-anim.v1.' + lang + '.' + sc + '.json?v=' + VER[lang + '.' + sc], { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw r; return r.json(); });
    return dataP[sc];
  }
  W.__casBAd = data;
  // CLS = 0: блок перебудовується лише поза кадром. Якщо сторінка відкрилась одразу на ньому (якір, відновлення прокрутки),
  // людина бачить звичайний список етапів, а сцена зʼявиться, щойно блок вийде з кадру (вище/нижче — скрол-якоріння тримає екран).
  function inView(sec) { var r = sec.getBoundingClientRect(); return r.top < (W.innerHeight || 0) && r.bottom > 0; }
  function start(sec) {
    Promise.all([css(), data(sec.getAttribute('data-bz') === 'flat' ? 'flat' : 'house')]).then(function (r) {
      var dt = r[1];
      if (!inView(sec) || sec.hasAttribute('data-sw') || !('IntersectionObserver' in W)) return enhance(sec, dt); // data-sw — перемикач сцен на місці
      var o = new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) { o.disconnect(); enhance(sec, dt); } });
      o.observe(sec);
    }).catch(function () { }); // без даних — лишається звичайний список етапів
  }
  W.__casBA = function (s) { if (!s.__bzs && secs.indexOf(s) < 0) { s.__bzs = 1; start(s); } };
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
