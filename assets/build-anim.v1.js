/* CAS — «Будинок з нуля» / «Ремонт з нуля»: збірка ізометричної SVG-сцени за прокруткою. UI-kit: /styleguide/#build-anim.
   Розмітку (section.ba з текстом етапів, слот заявки) ставить tools/site/buildanim.py; цей файл:
   1) коли блок за ~1,5 екрана — вантажить CSS (data-css), малює сцену кодом (без картинок і бібліотек) і вмикає режим «закріплена сцена + доріжка прокрутки»;
   2) прокрутка → прогрес 0…N етапів; шари сцени зʼявляються плавно (opacity/translate, згладжування rAF), підпис і степер — за активним етапом;
   3) prefers-reduced-motion — без доріжки й руху: статичні кадри, перемикання кнопками степера;
   4) клавіатура: «Пропустити анімацію», кнопки етапів (Tab, стрілки ←/→, Home/End). CTA — спільний /assets/lead-form.v1.js (.lq-slot → data-source «#build-anim»).
   Слухач прокрутки працює лише поки блок у кадрі. На LCP не впливає: усе — нижче першого екрана й після завантаження. */
(function () {
  var d = document, W = window, S = d.currentScript;
  if (W.__casBA) return; W.__casBA = 1;
  var secs = [].slice.call(d.querySelectorAll('section.ba[data-ba]'));
  if (!secs.length) return;
  var MQ = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)');
  var lang = (d.documentElement.lang || 'uk').slice(0, 2);
  // описи етапів для сторінок, де через бюджет HTML у розмітці лише назви (data-ba-d); той самий текст, що в tools/site/buildanim.py
  var D = {
    uk: { house: ['Геодезист Микола знімає рельєф і виносить осі будинку.', 'Прораб і власна бригада армують і бетонують основу.', 'Газоблок, цегла, каркас чи брус — за обраною технологією.', 'Бригада робить перекриття між поверхами й над другим.', 'Крокви, утеплення й покрівля; хід робіт знімаємо з дрона.', 'Ставимо вікна й вхідні двері — коробка закрита від погоди.', 'Утеплення й оздоблення фасаду, водостоки, відмостка.', 'Інженерія, оздоблення, меблі від наших меблярів — і світло у вікнах.'],
          flat: ['Владислав робить 3D-замір, прораб складає план робіт.', 'Зводимо стіни за планувальним рішенням дизайн-проєкту.', 'Розводимо кабелі й труби до кожної точки за проєктом.', 'Вирівнюємо підлогу й стіни під чистове оздоблення.', 'Плитка, фарба, підлога — за матеріалами з проєкту.', 'Ставимо двері, вікна, світильники, розетки й вимикачі.', 'Меблярі Сергій, Андрій і Олег монтують кухню й шафи.', 'Прибирання, перевірка, ключі — і гарантія 36 місяців.'] },
    ru: { house: ['Геодезист Николай снимает рельеф и выносит оси дома.', 'Прораб и собственная бригада армируют и бетонируют основание.', 'Газоблок, кирпич, каркас или брус — по выбранной технологии.', 'Бригада делает перекрытия между этажами и над вторым.', 'Стропила, утепление и кровля; ход работ снимаем с дрона.', 'Ставим окна и входные двери — коробка закрыта от погоды.', 'Утепление и отделка фасада, водостоки, отмостка.', 'Инженерия, отделка, мебель от наших мебельщиков — и свет в окнах.'],
          flat: ['Владислав делает 3D-замер, прораб составляет план работ.', 'Возводим стены по планировочному решению дизайн-проекта.', 'Разводим кабели и трубы к каждой точке по проекту.', 'Выравниваем пол и стены под чистовую отделку.', 'Плитка, краска, пол — по материалам из проекта.', 'Ставим двери, окна, светильники, розетки и выключатели.', 'Мебельщики Сергей, Андрей и Олег монтируют кухню и шкафы.', 'Уборка, проверка, ключи — и гарантия 36 месяцев.'] },
    en: { house: ['Our surveyor Mykola maps the terrain and sets out the house axes.', 'The site manager and our own crew reinforce and pour the base.', 'Aerated block, brick, timber frame or beam — per the chosen method.', 'The crew builds the slabs between and above the floors.', 'Rafters, insulation and roofing; we film progress by drone.', 'Windows and the entrance door go in — the shell is weathertight.', 'Insulation and facade finish, gutters and the perimeter path.', 'Services, finishes, furniture by our joiners — and the lights come on.'],
          flat: ['Vladyslav makes a 3D scan, the site manager draws up the work plan.', 'We build the walls to the layout from the design project.', 'Cables and pipes are run to every point in the project.', 'Floors and walls are levelled for the finishing coat.', 'Tiles, paint and flooring — the materials from the project.', 'Doors, windows, light fittings, sockets and switches go in.', 'Our joiners Serhii, Andrii and Oleh install the kitchen and wardrobes.', 'Cleaning, inspection, keys — and a 36-month warranty.'] }
  };
  var L = {
    uk: { skip: 'Пропустити анімацію', nav: 'Етапи', st: 'Етап', fig: 'Ілюстрація: ', mat: 'Стіни', m: ['Газоблок', 'Цегла', 'Каркас', 'Брус'] },
    ru: { skip: 'Пропустить анимацию', nav: 'Этапы', st: 'Этап', fig: 'Иллюстрация: ', mat: 'Стены', m: ['Газоблок', 'Кирпич', 'Каркас', 'Брус'] },
    en: { skip: 'Skip the animation', nav: 'Stages', st: 'Stage', fig: 'Illustration: ', mat: 'Walls', m: ['Block', 'Brick', 'Frame', 'Timber'] }
  };
  var MATS = ['block', 'brick', 'frame', 'brus'];
  function cl(ev, v) { try { if (W.clarity) W.clarity('event', ev); if (v && W.clarity) W.clarity('set', ev, v); } catch (e) { } } // аналітика: дійшли до кінця, CTA, матеріал
  // візерунки матеріалів стін в ізометрії: l — грань уздовж x (skewY 30°), r — уздовж y (skewY −30°)
  function pats() {
    var o = '';
    function p(id, w, h, fills, d, st) {
      ['l', 'r'].forEach(function (f, i) {
        o += '<pattern id="ba-' + id + '-' + f + '" width="' + w + '" height="' + h + '" patternUnits="userSpaceOnUse" patternTransform="skewY(' + (f === 'l' ? 30 : -30) + ')">' +
          '<rect width="' + w + '" height="' + h + '" fill="' + fills[i] + '"/><path d="' + d + '" stroke="' + st + '" stroke-width=".6" fill="none"/></pattern>';
      });
    }
    p('block', 21.6, 9, ['#857d73', '#6e675f'], 'M0 4.5H21.6M0 9H21.6M0 0V4.5M10.8 4.5V9', 'rgba(8,7,9,.3)');
    p('brick', 10, 5, ['#9a4a30', '#7d3b26'], 'M0 2.5H10M0 5H10M2 0V2.5M7 2.5V5', 'rgba(232,218,198,.75)');
    p('wood', 400, 6.5, ['#b07d45', '#8f6236'], 'M0 6H400', 'rgba(52,28,10,.75)');
    p('board', 400, 4.5, ['#d9d3c9', '#bfb8ad'], 'M0 4.2H400', 'rgba(8,7,9,.22)');
    return o;
  }
  if (!L[lang]) lang = 'uk';
  var t = L[lang];

  /* ---------- ізометрія: x → вправо-вниз, y → вліво-вниз, z → вгору ---------- */
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
  // прямокутник у площині x=X (грань «r») або y=Y (грань «l»)
  function rx(X, y0, y1, z0, z1) { return [X, y0, z0, X, y1, z0, X, y1, z1, X, y0, z1]; }
  function ry(Y, x0, x1, z0, z1) { return [x0, Y, z0, x1, Y, z0, x1, Y, z1, x0, Y, z1]; }
  function rz(Z, x0, x1, y0, y1) { return [x0, y0, Z, x1, y0, Z, x1, y1, Z, x0, y1, Z]; }
  function box(c, x0, x1, y0, y1, z0, z1) { return pg(c + ' t', rz(z1, x0, x1, y0, y1)) + pg(c + ' r', rx(x1, y0, y1, z0, z1)) + pg(c + ' l', ry(y1, x0, x1, z0, z1)); }
  function circ(c, x, y, z, r) { var q = P(x, y, z).split(','); return '<circle class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + r + '"/>'; }
  function txt(c, x, y, z, rot, s) { var q = P(x, y, z).split(','); return '<text class="' + c + '" transform="translate(' + q[0] + ' ' + q[1] + ') rotate(' + rot + ')">' + s + '</text>'; }
  function tree(x, y, h, r) { return pl('tk', [x, y, 0, x, y, h]) + circ('cr', x, y, h + r / K * 0.9, r) + circ('cr2', x - 0.25, y + 0.25, h + r / K * 1.2, r * 0.55); }
  function clip(o, z1) { return o[3] > z1 ? [o[0], o[1], o[2], Math.max(o[2], z1)] : o; }

  /* ---------- сцена «будинок»: [етап, svg, режим] — режим: d — падає згори, f — лише проявляється; x:N — зникає після етапу N ---------- */
  function house() {
    var X0 = 3, X1 = 13, Y0 = 3, Y1 = 10, T = 0.35, Z0 = 0.5, ZM = 3.3, ZT = 6.4, ZS = 6.7, RY = 6.5, RZ = 8.9, O = 0.45;
    var tg = (RZ - ZS) / (RY - Y0), EZ = ZS - O * tg;
    var OY = [[4, 7, 1, 3], [8.4, 9.6, Z0, 2.75], [10.4, 12.2, 1.3, 2.9], [4, 6.2, 4.3, 6], [7.4, 12.2, 4.7, 5.9]]; // отвори на грані y=Y1 (x0,x1,z0,z1)
    var OX = [[4.2, 6.6, 1.2, 2.9], [4.8, 8.4, 4.4, 6]];                                                      // на грані x=X1 (y0,y1,z0,z1)
    function facesY(z1) { return OY.map(function (o) { o = clip(o, z1); return ry(Y1, o[0], o[1], o[2], o[3]); }); }
    function facesX(z1) { return OX.map(function (o) { o = clip(o, z1); return rx(X1, o[0], o[1], o[2], o[3]); }); }
    var c = [];
    // ділянка, сітка, привид проєкту
    var grid = '';
    for (var g = 2; g < 16; g += 2) grid += pl('gd', [g, 0, 0, g, 13, 0]);
    for (g = 2; g < 13; g += 2) grid += pl('gd', [0, g, 0, 16, g, 0]);
    c.push([-1, pg('gr', rz(0, 0, 16, 0, 13)) + grid]);
    c.push([7, pg('lawn', rz(0, 0.2, 15.8, 0.2, 12.8)), 'f']);
    c.push([6, ph('pave', [rz(0.01, X0 - 1.1, X1 + 1.1, Y0 - 1.1, Y1 + 1.1), rz(0.01, X0 - 0.3, X1 + 0.3, Y0 - 0.3, Y1 + 0.3)]) + pg('pave', rz(0.01, 8.2, 9.8, Y1 + 1.1, 12.8)), 'f']);
    c.push([7, pg('pool', rz(0.02, 3.6, 7.4, Y1 + 0.6, Y1 + 2.6)) + pg('pool', rz(0.02, 10.2, 12.4, Y1 + 0.6, Y1 + 2)) + pg('pool', [X1 + 0.6, 4, 0.02, X1 + 2.4, 3.8, 0.02, X1 + 2.4, 6.8, 0.02, X1 + 0.6, 6.6, 0.02]), 'f']);
    var gh = box('gh', X0 - 0.3, X1 + 0.3, Y0 - 0.3, Y1 + 0.3, 0, Z0) + box('gh', X0, X1, Y0, Y1, Z0, ZS) +
      pg('gh', [X0 - O, RY, RZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ, X0 - O, Y1 + O, EZ]) + pg('gh', [X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ]);
    c.push([-2, '<g class="ghost">' + gh + '</g>']);
    // 0 геодезія: осі, кілки, нівелір, розміри
    var g0 = '';
    [X0, X1].forEach(function (x) { g0 += pl('ax', [x, 0.4, 0, x, 12.6, 0]); });
    [Y0, Y1].forEach(function (y) { g0 += pl('ax', [0.4, y, 0, 15.6, y, 0]); });
    c.push([0, g0, 'x3']);
    var g0b = '';
    [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]].forEach(function (p) {
      g0b += pl('stk', [p[0], p[1], 0, p[0], p[1], 1.1]) + pg('flg', [p[0], p[1], 1.1, p[0] + 0.7, p[1], 0.95, p[0], p[1], 0.8]);
    });
    g0b += pl('tri', [14, 11.4, 0, 14.6, 11.7, 1.5, 15.2, 11.3, 0]) + pl('tri', [14.6, 11.7, 1.5, 14.8, 12.3, 0]) + box('tri-h', 14.4, 14.8, 11.5, 11.9, 1.5, 1.8);
    g0b += pl('dim', [X0, 11.6, 0, X1, 11.6, 0]) + pl('dim', [X0, 11.3, 0, X0, 11.9, 0]) + pl('dim', [X1, 11.3, 0, X1, 11.9, 0]) + txt('dt', 7.4, 12.5, 0, 30, '10,0');
    g0b += pl('dim', [14.4, Y0, 0, 14.4, Y1 - 1.2, 0]) + txt('dt', 15.3, 5.6, 0, -30, '7,0');
    c.push([0, g0b, 'x2']);
    // 1 фундамент (плита) — з арматурою, що ховається під бетоном
    c.push([1, box('fd', X0 - 0.3, X1 + 0.3, Y0 - 0.3, Y1 + 0.3, 0, Z0), 'd']);
    // 2 стіни ростуть (дінамічно), 3 перекриття
    c.push([2, '<g class="walls"></g>', 'w']);
    c.push([3, pg('sl r', rx(X1, Y0, Y1, ZM, ZM + 0.3)) + pg('sl l', ry(Y1, X0, X1, ZM, ZM + 0.3)) + box('sl', X0, X1, Y0, Y1, ZT, ZS), 'd']);
    // 6 фасад: штукатурка з отворами, цоколь, дерево навколо стрічкового вікна
    c.push([6, ph('fa r', [rx(X1, Y0, Y1, Z0 + 0.4, ZS)].concat(facesX(9))) + ph('fa l', [ry(Y1, X0, X1, Z0 + 0.4, ZS)].concat(facesY(9))) +
      pg('pl r', rx(X1 + 0.02, Y0, Y1 + 0.02, Z0, Z0 + 0.4)) + pg('pl l', ry(Y1 + 0.02, X0, X1 + 0.02, Z0, Z0 + 0.4)) +
      ph('wd', [ry(Y1, 7.1, 12.5, 4.4, 6.2), ry(Y1, 7.4, 12.2, 4.7, 5.9)]) + pl('gut', [X0, Y1 + 0.3, ZS - 0.1, X1 + 0.3, Y1 + 0.3, ZS - 0.1, X1 + 0.3, Y1 + 0.3, 0.4]), 'f']);
    // 5 вікна й двері
    var w5 = '';
    OY.forEach(function (o, i) { w5 += pg(i === 1 ? 'dr' : 'gl', ry(Y1, o[0], o[1], o[2], o[3])); if (o[1] - o[0] > 2) w5 += pl('mu', [(o[0] + o[1]) / 2, Y1, o[2], (o[0] + o[1]) / 2, Y1, o[3]]); });
    OX.forEach(function (o) { w5 += pg('gl r', rx(X1, o[0], o[1], o[2], o[3])) + pl('mu', [X1, (o[0] + o[1]) / 2, o[2], X1, (o[0] + o[1]) / 2, o[3]]); });
    c.push([5, w5, 'f']);
    // 7 світло у вікнах
    var w7 = '';
    OY.forEach(function (o, i) { if (i !== 1) w7 += pg('glw', ry(Y1, o[0] + 0.08, o[1] - 0.08, o[2] + 0.08, o[3] - 0.08)); });
    OX.forEach(function (o) { w7 += pg('glw', rx(X1, o[0] + 0.08, o[1] - 0.08, o[2] + 0.08, o[3] - 0.08)); });
    w7 += pg('lamp', ry(Y1 + 0.02, 9.7, 9.85, 2.1, 2.4));
    c.push([7, w7, 'f']);
    // 4 дах: фронтон, задній і передній схили, димар, торцеві планки
    var zr = function (y) { return ZS + (y - Y0) * tg; };
    var r4 = pg('gb', [X1, Y0, ZS, X1, Y1, ZS, X1, RY, RZ]) +
      pg('rf b', [X0 - O, Y0 - O, EZ, X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ]) +
      pg('ch t', rz(RZ + 0.5, 5, 5.7, 4.6, 5.3)) + pg('ch r', [5.7, 4.6, zr(4.6), 5.7, 5.3, zr(5.3), 5.7, 5.3, RZ + 0.5, 5.7, 4.6, RZ + 0.5]) + pg('ch l', ry(5.3, 5, 5.7, zr(5.3), RZ + 0.5)) +
      pg('rf f', [X0 - O, Y1 + O, EZ, X1 + O, Y1 + O, EZ, X1 + O, RY, RZ, X0 - O, RY, RZ]) +
      pl('rk', [X1 + O, Y0 - O, EZ, X1 + O, RY, RZ, X1 + O, Y1 + O, EZ]) + pl('rk', [X0 - O, Y1 + O, EZ, X1 + O, Y1 + O, EZ]) + pl('rk', [X0 - O, RY, RZ, X1 + O, RY, RZ]);
    c.push([4, r4, 'd']);
    c.push([7, tree(1.6, 11.6, 1.4, 20) + tree(15, 1.4, 1.6, 22), 'd']);
    // дінаміка стін: висота за k (0…1)
    function walls(k) {
      var z = Z0 + (ZT - Z0) * k; if (k <= 0) return '';
      return pg('w ir', rx(X0 + T, Y0 + T, Y1, Z0, z)) + pg('w il', ry(Y0 + T, X0 + T, X1, Z0, z)) +
        ph('w t', [rz(z, X0, X1, Y0, Y1), rz(z, X0 + T, X1 - T, Y0 + T, Y1 - T)]) +
        ph('w r', [rx(X1, Y0, Y1, Z0, z)].concat(facesX(z))) + ph('w l', [ry(Y1, X0, X1, Z0, z)].concat(facesY(z)));
    }
    return { c: c, dyn: walls, finAt: 7 };
  }

  /* ---------- сцена «квартира» (розріз): обміри → перегородки → інженерія → стяжка → оздоблення → двері й світло → меблі → здача ---------- */
  function flat() {
    var WX = 12, WY = 9, H = 3, PX = 7, PT = 0.2, PY = 5.2, DY0 = 3.4, DY1 = 4.4, DZ = 2.1, WIN = [2, 5.2, 0.9, 2.6];
    var c = [], wallA = [ry(0, -0.3, WX, 0, H), ry(0, WIN[0], WIN[1], WIN[2], WIN[3])], wallB = [rx(0, 0, WY, 0, H)];
    c.push([-1, box('cut', -0.3, WX, -0.3, WY, -0.35, 0) + pg('flr', rz(0, 0, WX, 0, WY)) + pg('sky', ry(-0.3, WIN[0], WIN[1], WIN[2], WIN[3])) +
      pg('cut t', rz(H, -0.3, WX, -0.3, 0)) + ph('cw l', wallA) + pg('cut r', rx(WX, -0.3, 0, 0, H)) +
      pg('cut t', rz(H, -0.3, 0, 0, WY)) + ph('cw r', wallB) + pg('cut l', ry(WY, -0.3, 0, 0, H))]);
    var gh = box('gh', PX, PX + PT, 0, PY, 0, H) + box('gh', 0, 0.65, 0.4, 4.6, 0, 0.95) + box('gh', 2.6, 5.8, 6.6, 7.85, 0, 0.85);
    c.push([-2, '<g class="ghost">' + gh + '</g>']);
    // 2 інженерія: штроби з кабелем, підрозетники, труби в підлозі, стояк
    var e2 = pl('el', [0.6, 0, 2.7, 11.6, 0, 2.7]) + pl('el', [1.2, 0, 2.7, 1.2, 0, 0.35]) + pl('el', [6.3, 0, 2.7, 6.3, 0, 1]) + pl('el', [9.4, 0, 2.7, 9.4, 0, 1.2]) +
      pl('el', [0, 0.6, 2.7, 0, 8.6, 2.7]) + pl('el', [0, 2.5, 2.7, 0, 2.5, 1.05]) + pl('el', [0, 7, 2.7, 0, 7, 0.35]);
    [[1.2, 0.35], [6.3, 1], [9.4, 1.2]].forEach(function (p) { e2 += pg('sb', ry(0.01, p[0] - 0.12, p[0] + 0.12, p[1] - 0.12, p[1] + 0.12)); });
    [[2.5, 1.05], [7, 0.35]].forEach(function (p) { e2 += pg('sb', rx(0.01, p[0] - 0.12, p[0] + 0.12, p[1] - 0.12, p[1] + 0.12)); });
    e2 += pl('pc', [11.5, 0.35, 0.03, 11.5, 5.7, 0.03, 0.5, 5.7, 0.03, 0.5, 3.3, 0.03]) + pl('ph', [11.2, 0.35, 0.03, 11.2, 5.45, 0.03, 0.75, 5.45, 0.03, 0.75, 3.3, 0.03]) +
      pl('pc', [11.5, 0.6, 0.03, 10.5, 0.6, 0.03]) + pl('pc', [11.5, 1.6, 0.03, 8.2, 1.6, 0.03]) + pl('ph', [11.2, 1.3, 0.03, 8.2, 1.3, 0.03]) +
      pl('pc', [11.7, 0.25, 0, 11.7, 0.25, H]) + pl('ph', [11.45, 0.25, 0, 11.45, 0.25, H]);
    c.push([2, e2, 'f']);
    // 3 стяжка й штукатурка
    c.push([3, pg('scr', rz(0.05, 0, WX, 0, WY)) + ph('pls l', wallA) + ph('pls r', wallB), 'f']);
    // 4 оздоблення: паркет, плитка, фарба
    var pq = '';
    for (var x = 0.6; x < WX; x += 0.6) pq += pl(x > PX && x < WX ? 'pqb' : 'pq', x > PX + PT ? [x, PY, 0.07, x, WY, 0.07] : [x, 0, 0.07, x, WY, 0.07]);
    var tl = '';
    for (var tx = PX + PT + 0.6; tx < WX; tx += 0.6) tl += pl('tg', [tx, 0.01, 0, tx, 0.01, 2.4]) + pl('tg', [tx, 0, 0.07, tx, PY, 0.07]);
    for (var tz = 0.6; tz < 2.4; tz += 0.6) tl += pl('tg', [PX + PT, 0.01, tz, WX, 0.01, tz]);
    for (var ty = 0.6; ty < PY; ty += 0.6) tl += pl('tg', [PX + PT, ty, 0.07, WX, ty, 0.07]);
    c.push([4, pg('pqf', rz(0.07, 0, WX, 0, WY)) + pq + pg('tlf', rz(0.07, PX + PT, WX, 0, PY)) + ph('pt l', wallA) + ph('pt r', wallB) +
      pg('tw', ry(0.01, PX + PT, WX, 0, 2.4)) + tl, 'f']);
    // 1 перегородка росте (дінамічно)
    c.push([1, '<g class="walls"></g>', 'w']);
    // 7 килим під меблями
    c.push([7, pg('rug', rz(0.08, 2, 6.4, 4.8, 8.4)), 'f']);
    // 5 вікно, двері, світильники
    var l5 = pg('gl gd-l', ry(0.01, WIN[0], WIN[1], WIN[2], WIN[3])) + pl('mu', [3.6, 0.01, WIN[2], 3.6, 0.01, WIN[3]]) +
      pg('dr', [PX + PT, DY0, 0.07, PX + PT + 0.9, DY0 - 0.1, 0.07, PX + PT + 0.9, DY0 - 0.1, DZ, PX + PT, DY0, DZ]);
    [[3.6, 3.1], [9.6, 2.6], [4.2, 7.2]].forEach(function (p) { l5 += pl('cab', [p[0], p[1], H, p[0], p[1], 2.25]) + pg('lmp', [p[0] - 0.35, p[1], 2.05, p[0] + 0.35, p[1], 2.05, p[0] + 0.12, p[1], 2.3, p[0] - 0.12, p[1], 2.3]); });
    c.push([5, l5, 'd']);
    // 6 меблі: кухня, стіл, шафа, умивальник, душ, диван
    var f6 = box('kw', 0, 0.38, 0.4, 4.6, 1.6, 2.4) + box('kb', 0, 0.65, 0.4, 4.6, 0, 0.88) + box('ct', 0, 0.7, 0.35, 4.65, 0.88, 0.95) +
      box('wr', 0, 0.62, 5.4, 8.6, 0, 2.4) + pg('vn t', rz(0.85, 9.8, 11.2, 0, 0.5)) + pg('vn r', rx(11.2, 0, 0.5, 0.5, 0.85)) + pg('vn l', ry(0.5, 9.8, 11.2, 0.5, 0.85)) +
      pg('mir', ry(0.02, 10, 11, 1.2, 2)) + pg('glp', ry(1.8, PX + PT, 9, 0.07, 2.1)) +
      pl('lg', [2.8, 2.8, 0, 2.8, 2.8, 0.72]) + pl('lg', [4.4, 3.4, 0, 4.4, 3.4, 0.72]) + box('tb', 2.6, 4.6, 2.6, 3.6, 0.72, 0.78) +
      box('sf', 2.6, 5.8, 6.6, 7.5, 0.1, 0.45) + box('sf', 2.6, 5.8, 7.5, 7.85, 0.1, 0.85) + box('sf', 5.5, 5.8, 6.6, 7.5, 0.1, 0.62);
    c.push([6, f6, 'd']);
    // 7 здача: світло, рослина
    var l7 = '';
    [[3.6, 3.1], [9.6, 2.6], [4.2, 7.2]].forEach(function (p) { l7 += circ('glo', p[0], p[1], 1.9, 16) + circ('bulb', p[0], p[1], 2.02, 3); });
    l7 += box('pot', 10.6, 11.1, 7.6, 8.1, 0.07, 0.55) + circ('cr', 10.85, 7.85, 1.15, 13) + circ('cr2', 10.65, 8.05, 1.35, 8);
    c.push([7, l7, 'f']);
    // 0 3D-замір: сканер і промені (зникають на етапі інженерії)
    var s0 = pl('tri', [5.6, 5, 0, 6, 5.2, 1.4, 6.4, 4.8, 0]) + pl('tri', [6, 5.2, 1.4, 6.1, 5.7, 0]) + box('tri-h', 5.85, 6.15, 5.05, 5.35, 1.4, 1.65);
    [[0, 0, H], [WX, 0, H], [0, WY, H], [0, 0, 0], [WX, 0, 0.6], [0, WY, 0.6], [WIN[0], 0, WIN[3]], [WIN[1], 0, WIN[2]]].forEach(function (q) { s0 += pl('lz', [6, 5.2, 1.55].concat(q)) + circ('dot', q[0], q[1], q[2], 2.2); });
    s0 += pl('dim', [0, WY + 0.6, 0, WX, WY + 0.6, 0]) + txt('dt', 5.4, WY + 1.5, 0, 30, '12,0') + pl('dim', [WX + 0.6, 0, 0, WX + 0.6, WY, 0]) + txt('dt', WX + 1.4, 3.8, 0, -30, '9,0');
    c.push([0, s0, 'x2']);
    function part(k) {
      var z = H * k; if (k <= 0) return '';
      var hole = z > 0.05 ? [rx(PX + PT, DY0, DY1, 0, Math.min(z, DZ))] : [];
      return ph('pw r', [rx(PX + PT, 0, PY, 0, z)].concat(hole)) + pg('pw l', ry(PY, PX, PX + PT, 0, z)) +
        (z > DZ ? pg('pw t', rz(z, PX, PX + PT, 0, PY)) : pg('pw t', rz(z, PX, PX + PT, 0, DY0)) + pg('pw t', rz(z, PX, PX + PT, DY1, PY)));
    }
    return { c: c, dyn: part, finAt: 4 };
  }

  /* ---------- збірка блоку ---------- */
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function enhance(sec) {
    if (sec.hasAttribute('data-ba-on')) return;
    sec.setAttribute('data-ba-on', '');
    var scene = sec.getAttribute('data-ba') === 'flat' ? 'flat' : 'house';
    var ol = sec.querySelector('ol.ba-st'); if (!ol) return;
    var lis = [].slice.call(ol.children), n = lis.length;
    var desc = (D[lang] || D.uk)[scene];
    lis.forEach(function (li, i) {
      li.classList.remove('mo-rv', 'mo-in'); li.style.removeProperty('--mo-d');
      if (!li.querySelector('span') && desc[i]) { var sp = el('span'); sp.textContent = desc[i]; (li.querySelector('div') || li).appendChild(sp); }
      li.id = li.id || ('ba-s' + i);
    });
    ol.classList.remove('steps');
    bb = [1e9, 1e9, -1e9, -1e9];
    var sc = scene === 'flat' ? flat() : house();
    var body = sc.c.map(function (ch) {
      var m = ch[2] || '';
      return ch[0] < 0 ? ch[1] : '<g class="ba-l" data-l="' + ch[0] + '"' + (m ? ' data-m="' + m + '"' : '') + '>' + ch[1] + '</g>';
    }).join('');
    sc.dyn(1); // габарити з урахуванням повної висоти стін
    var pad = 14, vb = [bb[0] - pad, bb[1] - pad - 24, bb[2] - bb[0] + pad * 2, bb[3] - bb[1] + pad * 2 + 24].map(function (v) { return v.toFixed(0); }).join(' ');
    var h2 = sec.querySelector('h2');
    var fig = el('div', 'ba-fig');
    fig.innerHTML = '<svg viewBox="' + vb + '" role="img" aria-label="' + (t.fig + (h2 ? h2.textContent : '')).replace(/"/g, '') + '" focusable="false" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="ba-gw-' + scene + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8"/><stop offset="1" stop-color="#e2a24f"/></linearGradient>' +
      '<radialGradient id="ba-rg-' + scene + '"><stop offset="0" stop-color="#f6c978" stop-opacity=".55"/><stop offset="1" stop-color="#f6c978" stop-opacity="0"/></radialGradient>' + (scene === 'house' ? pats() : '') + '</defs>' + body + '</svg>';
    var svg = fig.firstChild;
    // конфігуратор матеріалу стін (лише будинок): газоблок / цегла / каркас / брус — стіни й фасад змінюють вигляд
    var mats = null, mat = sec.getAttribute('data-ba-m');
    function setMat(m, user) {
      mat = MATS.indexOf(m) < 0 ? 'block' : m;
      MATS.forEach(function (x) { svg.classList.toggle('m-' + x, x === mat); });
      if (mats) [].forEach.call(mats.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === mat ? 'true' : 'false'); });
      if (user) cl('build_anim_mat', mat);
    }
    if (scene === 'house') {
      mats = el('div', 'ba-mats'); mats.setAttribute('role', 'group'); mats.setAttribute('aria-label', t.mat);
      mats.innerHTML = '<span aria-hidden="true">' + t.mat + ':</span>' + MATS.map(function (m, i) { return '<button type="button" data-m="' + m + '" aria-pressed="false">' + t.m[i] + '</button>'; }).join('');
      mats.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-m]'); if (b) setMat(b.getAttribute('data-m'), 1); });
    }
    setMat(mat);
    svg.style.setProperty('--gw', 'url(#ba-gw-' + scene + ')'); svg.style.setProperty('--rg', 'url(#ba-rg-' + scene + ')');
    var layers = [].map.call(svg.querySelectorAll('g.ba-l'), function (g) {
      var m = g.getAttribute('data-m') || '';
      return { g: g, i: +g.getAttribute('data-l'), m: m.charAt(0), x: m.charAt(0) === 'x' ? +m.slice(1) : -1, k: -1 };
    });
    var ghost = svg.querySelector('.ghost');

    var run = el('div', 'ba-run'), pin = el('div', 'ba-pin'), side = el('div', 'ba-side');
    var skip = el('a', 'ba-skip'); skip.href = '#ba-cta'; skip.textContent = t.skip;
    var ct = el('p', 'ba-ct'); ct.setAttribute('aria-hidden', 'true');
    var bar = el('div', 'ba-bar', '<i></i>'), bi = bar.firstChild;
    var nav = el('div', 'ba-nav'); nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', t.nav);
    var btns = lis.map(function (li, i) {
      var b = el('button', 'ba-b'); b.type = 'button';
      b.innerHTML = '<span>' + (i + 1) + '</span>';
      b.setAttribute('aria-label', t.st + ' ' + (i + 1) + ': ' + (li.querySelector('b') || li).textContent);
      b.setAttribute('aria-controls', li.id);
      b.addEventListener('click', function () { go(i); });
      nav.appendChild(b);
      return b;
    });
    nav.addEventListener('keydown', function (e) {
      var i = btns.indexOf(d.activeElement); if (i < 0) return;
      var j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (j < 0 || j >= n) return;
      e.preventDefault(); btns[j].focus(); go(j);
    });
    var cta = sec.querySelector('.ba-cta'), ch3 = cta && cta.querySelector('h3');
    var goA = el('a', 'ba-go'); goA.href = '#ba-cta'; goA.textContent = (ch3 ? ch3.textContent : '') + ' →'; goA.tabIndex = -1;
    goA.addEventListener('click', function () { // після переходу до якоря — фокус на телефон у слоті заявки
      cl('build_anim_cta');
      setTimeout(function () { var i = cta.querySelector('input[type="tel"]'); if (i) try { i.focus({ preventScroll: true }); } catch (e) { i.focus(); } }, rm ? 0 : 700);
    });
    side.appendChild(ct); side.appendChild(ol); side.appendChild(bar); side.appendChild(nav); if (mats) side.appendChild(mats); side.appendChild(goA);
    pin.appendChild(skip); pin.appendChild(fig); pin.appendChild(side);
    run.appendChild(pin);
    cta.parentNode.insertBefore(run, cta);
    run.style.setProperty('--n', n);
    sec.classList.add('ba-on');

    var dynG = svg.querySelector('g.walls'), dynK = -1;
    var cur = 0, act = -1, raf = 0, top0 = 0, live = false, rm = !!(MQ && MQ.matches), man = 0;
    function render(s) {
      for (var j = 0; j < layers.length; j++) {
        var Ly = layers[j], k = clamp((s - Ly.i) / 0.7);
        if (Ly.x >= 0) k *= 1 - clamp((s - Ly.x) / 0.7);
        k = Math.round(k * 1000) / 1000;
        if (k === Ly.k) continue;
        Ly.k = k;
        if (Ly.m === 'w') { if (k !== dynK) { dynK = k; dynG.innerHTML = sc.dyn(k); } continue; }
        Ly.g.style.opacity = k;
        if (Ly.m === 'd') Ly.g.setAttribute('transform', 'translate(0 ' + (-(1 - k) * 34).toFixed(1) + ')');
      }
      if (ghost) ghost.style.opacity = (0.55 * (1 - clamp(s / n))).toFixed(3);
      svg.classList.toggle('fin', s >= sc.finAt + 0.7);
      var end = s >= n - 0.35;
      if (end !== sec.classList.contains('ba-end')) {
        sec.classList.toggle('ba-end', end); goA.tabIndex = end || rm ? 0 : -1;
        if (end && !rm && !sec.__baSeen) { sec.__baSeen = 1; cl('build_anim_end'); }
      }
      bi.style.transform = 'scaleX(' + clamp(s / n).toFixed(4) + ')';
      var a = Math.min(n - 1, Math.max(0, Math.floor(s)));
      if (a !== act) {
        act = a;
        ct.innerHTML = '<b>' + ('0' + (a + 1)).slice(-2) + '</b> / ' + ('0' + n).slice(-2);
        lis.forEach(function (li, i) { li.classList.toggle('is-on', i === a); li.classList.toggle('is-done', i < a); });
        btns.forEach(function (b, i) { b.classList.toggle('is-done', i < a); if (i === a) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      }
    }
    function span() { return run.offsetHeight - pin.offsetHeight; }
    function target() {
      if (rm) return man;
      var sp = span(); if (sp <= 0) return n;
      return clamp((top0 - run.getBoundingClientRect().top) / sp) * n;
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
      if (rm) { man = i + 0.999; cur = man; render(cur); return; }
      var r = run.getBoundingClientRect(), y = W.pageYOffset + r.top - top0 + span() * Math.min(1, (i + 0.8) / n);
      W.scrollTo({ top: Math.round(y), behavior: 'smooth' });
    }
    function mode() {
      rm = !!(MQ && MQ.matches);
      sec.classList.toggle('ba-rm', rm);
      if (rm) { if (!man) man = n - 0.001; cur = man; render(cur); } else { cur = target(); render(cur); }
      measure();
    }
    W.addEventListener('scroll', function () { if (live && !rm) kick(); }, { passive: true });
    W.addEventListener('resize', measure, { passive: true });
    if (MQ) { if (MQ.addEventListener) MQ.addEventListener('change', mode); else if (MQ.addListener) MQ.addListener(mode); }
    if ('IntersectionObserver' in W) {
      new IntersectionObserver(function (es) { live = es[0].isIntersecting; if (live) kick(); }).observe(run);
    } else live = true;
    // мікровзаємодії (лише миша, без prefers-reduced-motion): легкий нахил сцени за курсором і «магнітна» кнопка CTA
    if (W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      fig.addEventListener('pointermove', function (e) {
        if (rm) return;
        var r = fig.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        svg.style.transform = 'perspective(1600px) rotateX(' + (-y * 6).toFixed(2) + 'deg) rotateY(' + (x * 8).toFixed(2) + 'deg)';
      });
      fig.addEventListener('pointerleave', function () { svg.style.transform = ''; });
      goA.addEventListener('pointermove', function (e) {
        if (rm) return;
        var r = goA.getBoundingClientRect();
        goA.style.translate = ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px';
      });
      goA.addEventListener('pointerleave', function () { goA.style.translate = ''; });
    }
    render(0);
    mode();
  }

  /* ---------- ліниве завантаження: CSS → сцена, за ~1,5 екрана до блоку ---------- */
  var cssP = null;
  function css() {
    if (!cssP) cssP = new Promise(function (res) {
      var href = (S && S.getAttribute('data-css')) || '/assets/build-anim.v1.css';
      if (d.querySelector('link[href="' + href + '"]')) return res();
      var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href;
      l.onload = l.onerror = function () { res(); };
      d.head.appendChild(l);
    });
    return cssP;
  }
  function start(sec) { css().then(function () { enhance(sec); }); }
  if ('IntersectionObserver' in W) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } });
    }, { rootMargin: '150% 0px 150% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  } else secs.forEach(start);
})();
