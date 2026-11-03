/* «Будинок на воді» (tools/site/waterhouse.py): ізометрична SVG-сцена, 12 етапів за прокруткою — промір глибин, палі або понтони,
   обвʼязка, настил, місток, каркас, покрівля, мережі з берега (рентген), фасад і вікна, тераса над водою, вечір з відблисками, здача.
   Вода — напівпрозора поверхня: під нею видно дно, підводні частини паль/понтонів і віддзеркалення будинку (z → −z).
   Вантажить site-chrome.v1.js після першої прокрутки (section.bz[data-js]). Тексти етапів — з DOM (ol.bz-st), підписи — script.wh-ui.
   CLS 0: сцена будується, коли блок поза кадром; reduced-motion — статичні кадри з кнопками; клавіатура ←/→. */
(function () {
  'use strict';
  var W = window, d = document, sec = d.querySelector('section.wh[data-wh]');
  if (!sec || sec.__wh) return; sec.__wh = 1;
  var RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ui = {}; try { ui = JSON.parse(sec.querySelector('script.wh-ui').textContent); } catch (e) { return; }
  var ST = [].map.call(sec.querySelectorAll('ol.bz-st > li'), function (li) { var b = li.querySelector('b'), s = li.querySelector('span'); return [b ? b.textContent : li.textContent, s ? s.textContent : '']; });
  var N = ST.length || 12, AR = [60, 100, 150], RATE = [600, 1100];
  var cfg = { a: 100, f: 0, l: 0, xr: [0, 0, 0] }, prog = 0, shown = -1, svg, els = [], nodes = [], ptr = 0, vb = null, vbT = null, raf = 0, run, cap, cnt, live, night, FULL, FOC = [];
  var CLAD = 8, DUSK = 10;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function cl(ev, v) { try { if (W.clarity) { W.clarity('event', ev); if (v) W.clarity('set', ev, v); } } catch (e) { } }

  /* ── геометрія: ізометрія, метри; вода — z = 0 ── */
  var K = 10;
  function P(x, y, z) { return [((x - y) * 0.8660254 * K).toFixed(1), (((x + y) * 0.5 - (z || 0)) * K).toFixed(1)]; }
  function pts(a) { var o = []; for (var i = 0; i < a.length; i += 3) o.push(P(a[i], a[i + 1], a[i + 2]).join(',')); return o.join(' '); }
  function pth(a) { return 'M' + pts(a).split(' ').join(' L'); }
  function mir(a) { return a.map(function (v, i) { return i % 3 === 2 ? -v : v; }); }
  var L;
  function add(layer, html, s, o, until, ux, dp) { L[layer].push({ h: html, k: s < 0 ? -1 : s + Math.min(o, 0.999), u: until, x: ux, d: dp || 0 }); }
  function poly(c, a) { return '<polygon class="' + c + '" points="' + pts(a) + '"/>'; }
  function line(c, a) { return '<polyline class="' + c + '" points="' + pts(a) + '"/>'; }
  function rect(x0, x1, y0, y1, z) { z = z || 0; return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]; }
  function circ(c, x, y, z, r) { var q = P(x, y, z); return '<ellipse class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" rx="' + (r * K * 1.22).toFixed(1) + '" ry="' + (r * K * 0.7).toFixed(1) + '"/>'; }
  function dot(c, x, y, z, r) { var q = P(x, y, z); return '<circle class="' + c + '" cx="' + q[0] + '" cy="' + q[1] + '" r="' + r + '"/>'; }
  function box(c, x0, x1, y0, y1, z0, z1) { return poly(c + ' t', rect(x0, x1, y0, y1, z1)) + poly(c + ' r', [x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1]) + poly(c + ' l', [x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1]); }
  function wx(c, x, y0, y1, z0, z1) { return poly(c, [x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1]); }
  function wy(c, y, x0, x1, z0, z1) { return poly(c, [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]); }
  function flow(c, a, n, dur) { if (RM) return ''; var p = pth(a), o = ''; for (var i = 0; i < n; i++) o += '<circle r="2.2" class="' + c + '"><animateMotion dur="' + dur + 's" begin="' + (i * dur / n).toFixed(2) + 's" repeatCount="indefinite" path="' + p + '"/></circle>'; return '<g>' + o + '</g>'; }
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function build() {
    var A = cfg.a, hw = Math.sqrt(A * 1.3), hd = A / hw, PW = hw + 2, PD = hd + 5, Z = 1.1, i, x, y, n;
    var hx0 = 1, hx1 = 1 + hw, hy0 = 1, hy1 = 1 + hd, HT = 3, zt = Z + HT, yc = (hy0 + hy1) / 2, zr = zt + Math.min(2.4, hd * 0.22);
    var SH = -4, bx = PW * 0.35; // берег: y < SH; місток — від берега до платформи
    L = { sky: [], bed: [], deep: [], refl: [], water: [], shore: [], pile: [], plat: [], net: [], house: [], terr: [], ppl: [], night: [], glow: [] };
    add('sky', '<rect class="wh-day" x="-9999" y="-9999" width="19999" height="19999"/>', -1, 0);
    add('bed', poly('wh-bed', rect(-10, PW + 12, SH, PD + 12, -2.6)), -1, 0);
    add('water', poly('wh-water', rect(-10, PW + 12, SH, PD + 12, 0)), -1, 0);
    var gl = ''; for (i = 0; i < 34; i++) { var gx = -8 + rnd(i) * (PW + 18), gy = SH + 1 + rnd(i + 50) * (PD + 10); if (gx > -0.5 && gx < PW + 0.5 && gy > -0.5 && gy < PD + 1.5) continue; var a = P(gx, gy, 0), b = P(gx + 0.9, gy - 0.9, 0); gl += '<line class="wh-glint" style="animation-delay:' + (rnd(i + 9) * 4).toFixed(2) + 's" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }
    add('water', poly('wh-ripple', rect(-10, PW + 12, SH, PD + 12, 0)), -1, 0);
    add('water', '<g>' + gl + '</g>', -1, 0);
    add('shore', box('wh-shore', -10, PW + 12, SH - 10, SH, -2.6, 0.5) + poly('wh-grass', rect(-10, PW + 12, SH - 10, SH - 0.6, 0.52)), -1, 0);
    [[-6, SH - 3], [-2, SH - 6], [PW + 4, SH - 4], [PW + 8, SH - 7], [PW * 0.75, SH - 7]].forEach(function (t, k) { add('shore', line('wh-trunk', [t[0], t[1], 0.5, t[0], t[1], 2.6]) + circ('wh-crown', t[0], t[1], 3.4, 1.3), -1, 0, null, null, k); });
    // 1 промір глибин: геодезист на березі, точки проміру на воді, контур платформи
    add('night', line('wh-tri', [bx - 3.4, SH - 1.6, 0.5, bx - 3, SH - 1.6, 1.9, bx - 2.6, SH - 1.6, 0.5]) + dot('wh-dev', bx - 3, SH - 1.6, 2, 3.5), 0, 0.05, 2);
    for (i = 0, n = 0; i <= 4; i++) for (var j = 0; j <= 4; j++, n++) { x = PW * i / 4; y = PD * j / 4; add('night', circ('wh-sound', x, y, 0, 0.35) + dot('wh-sp', x, y, 0, 1.6), 0, 0.15 + 0.6 * n / 25, 2); }
    add('night', poly('wh-plan', rect(0, PW, 0, PD, 0.02)), 0, 0.8, 3);
    // 2 фундамент: палі (забиваємо одну за одною, сплеск) або понтони
    var piles = [];
    if (cfg.f === 0) {
      for (x = 0.3; x <= PW - 0.2; x += Math.max(2.4, (PW - 0.6) / Math.round((PW - 0.6) / 2.6))) for (y = 0.3; y <= PD - 0.2; y += Math.max(2.4, (PD - 0.6) / Math.round((PD - 0.6) / 2.6))) piles.push([x, y]);
      piles.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
      piles.forEach(function (p, k) {
        var o = 0.05 + 0.85 * k / piles.length;
        add('deep', box('wh-pile u', p[0] - 0.14, p[0] + 0.14, p[1] - 0.14, p[1] + 0.14, -2.6, 0), 1, o);
        add('pile', '<g class="wh-drv">' + box('wh-pile', p[0] - 0.14, p[0] + 0.14, p[1] - 0.14, p[1] + 0.14, 0, Z - 0.2) + '</g>' + circ('wh-splash', p[0], p[1], 0, 0.6) + (k % 3 ? '' : circ('wh-rip', p[0], p[1], 0, 0.5)), 1, o, null, null, p[0] + p[1]);
      });
    } else {
      for (y = 0.4; y < PD - 0.6; y += 2.6) for (x = 0.2; x < PW - 0.3; x += 6.2) piles.push([x, Math.min(x + 6, PW - 0.2), y, Math.min(y + 1.8, PD - 0.2)]);
      piles.forEach(function (p, k) {
        var o = 0.05 + 0.85 * k / piles.length;
        add('deep', box('wh-pont u', p[0], p[1], p[2], p[3], -0.7, 0), 1, o);
        add('pile', '<g class="wh-slide">' + box('wh-pont', p[0], p[1], p[2], p[3], 0, 0.45) + '</g>' + circ('wh-rip', (p[0] + p[1]) / 2, p[3], 0, 0.9), 1, o, null, null, p[0] + p[2]);
      });
    }
    add('refl', poly('wh-shade', rect(0.6, PW + 1.4, 0.6, PD + 1.2, 0)), 2, 0.5); // мʼяка тінь платформи на воді
    // 3 обвʼязка: поздовжні й поперечні балки
    var bm = [];
    for (y = 0; y <= PD + 0.01; y += PD / Math.ceil(PD / 2.6)) bm.push(['y', y]);
    for (x = 0; x <= PW + 0.01; x += PW / Math.ceil(PW / 3)) bm.push(['x', x]);
    bm.forEach(function (b, k) { add('plat', b[0] === 'y' ? box('wh-beam', 0, PW, b[1] - 0.1, b[1] + 0.1, Z - 0.3, Z - 0.05) : box('wh-beam', b[1] - 0.1, b[1] + 0.1, 0, PD, Z - 0.3, Z - 0.05), 2, 0.05 + 0.9 * k / bm.length); });
    // 4 настил: дошка за дошкою
    for (x = 0, n = 0; x < PW - 0.01; x += 0.32, n++) add('plat', poly('wh-board b' + (n % 2), rect(x, Math.min(PW, x + 0.29), 0, PD, Z)) + wx('wh-edge', Math.min(PW, x + 0.29), PD - 0.01, PD, Z - 0.2, Z), 3, 0.05 + 0.9 * x / PW);
    add('plat', wy('wh-fascia', PD, 0, PW, Z - 0.3, Z) + wx('wh-fascia r', PW, 0, PD, Z - 0.3, Z), 3, 0.97);
    add('plat', poly('wh-grain', rect(0, PW, 0, PD, Z)), 3, 0.97); // волокна дерева — ненавʼязливо, одним шаром поверх дошок
    // 5 місток до берега: опори, прогони, дошки
    add('plat', box('wh-beam', bx - 0.1, bx + 0.1, SH, 0, Z - 0.3, Z - 0.1) + box('wh-beam', bx + 1.3, bx + 1.5, SH, 0, Z - 0.3, Z - 0.1), 4, 0.1);
    for (y = SH, n = 0; y < 0; y += 0.3, n++) add('plat', poly('wh-board b' + (n % 2), rect(bx - 0.1, bx + 1.5, y, Math.min(0, y + 0.27), Z)), 4, 0.25 + 0.6 * (y - SH) / -SH);
    var bp = ''; for (y = SH; y <= 0.01; y += -SH / 3) bp += line('wh-bal', [bx - 0.1, y, Z, bx - 0.1, y, Z + 1]) + line('wh-bal', [bx + 1.5, y, Z, bx + 1.5, y, Z + 1]);
    add('plat', bp + line('wh-rail', [bx - 0.1, SH, Z + 1, bx - 0.1, 0, Z + 1]) + line('wh-rail', [bx + 1.5, SH, Z + 1, bx + 1.5, 0, Z + 1]), 4, 0.9);
    // 6 каркас: нижня обвʼязка по периметру → стійки стін (подвійні біля прорізів, ригелі над вікнами) → верхня обвʼязка; без окремих «палиць»
    var tb = 0.12, zs = Z + tb, zp = zt - tb, frm = [];
    function sill(c, z0, z1, side) { return side === 'b' ? box(c, hx0, hx1, hy0 - 0.06, hy0 + 0.06, z0, z1) + box(c, hx0 - 0.06, hx0 + 0.06, hy0, hy1, z0, z1)
      : box(c, hx1 - 0.06, hx1 + 0.06, hy0, hy1, z0, z1) + box(c, hx0, hx1 + 0.06, hy1 - 0.06, hy1 + 0.06, z0, z1); }
    add('house', sill('wh-plt', Z, zs, 'b'), 5, 0.02);
    add('house', sill('wh-plt', Z, zs, 'f'), 5, 0.06);
    var nx = Math.max(2, Math.round(hw / 0.9)), ny = Math.max(2, Math.round(hd / 0.9));
    for (i = 0; i <= nx; i++) { x = hx0 + hw * i / nx; frm.push([x, hy0]); frm.push([x, hy1]); }
    for (i = 1; i < ny; i++) { y = hy0 + hd * i / ny; frm.push([hx0, y]); frm.push([hx1, y]); }
    frm.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
    frm.forEach(function (q, k) { add('house', box('wh-stud', q[0] - 0.07, q[0] + 0.07, q[1] - 0.07, q[1] + 0.07, zs, zp), 5, 0.08 + 0.37 * k / frm.length); });
    // ригелі прорізів (на фасадах до води) — ті самі ділянки, що потім стануть склом
    for (y = hy0, n = 0; y < hy1 - 0.01; y += 1.2, n++) { var y2 = Math.min(hy1, y + 1.2); if (y > hy0 + 0.6 && y2 < hy1 - 0.6 && n % 2) add('house', box('wh-plt', hx1 - 0.05, hx1 + 0.05, y, y2, zp - 0.5, zp - 0.4) + box('wh-plt', hx1 - 0.05, hx1 + 0.05, y, y2, Z + 0.5, Z + 0.6), 5, 0.58); }
    for (x = hx0, n = 0; x < hx1 - 0.01; x += 1.2, n++) { var x2 = Math.min(hx1, x + 1.2); if (x > hx0 + 0.5 && x2 < hx1 - 0.5 && n % 4 !== 3) add('house', box('wh-plt', x, x2, hy1 - 0.05, hy1 + 0.05, zp - 0.5, zp - 0.4), 5, 0.62); }
    add('house', sill('wh-plt', zp, zt, 'b') + sill('wh-plt', zp, zt, 'f'), 5, 0.48);
    // 7 покрівля: двосхилий дах листами (ближній схил — смугами), фронтон
    var ov = 0.5, rs = (hx1 - hx0 + 2 * ov) / Math.ceil((hx1 - hx0) / 1.2);
    add('house', poly('wh-gab', [hx1, hy0, zt, hx1, hy1, zt, hx1, yc, zr]), 6, 0.05);
    for (x = hx0 - ov, n = 0; x < hx1 + ov - 0.01; x += rs, n++) {
      var x1 = Math.min(hx1 + ov, x + rs);
      add('house', poly('wh-roofb', [x, hy0 - ov, zt - 0.1, x1, hy0 - ov, zt - 0.1, x1, yc, zr, x, yc, zr]), 6, 0.1 + 0.4 * n * rs / (hx1 - hx0 + 2 * ov));
      add('house', poly('wh-roof s' + (n % 2), [x, yc, zr, x1, yc, zr, x1, hy1 + ov, zt - 0.1, x, hy1 + ov, zt - 0.1]), 6, 0.5 + 0.45 * n * rs / (hx1 - hx0 + 2 * ov));
    }
    add('refl', poly('wh-refl', mir([hx1, hy0, zt, hx1, hy1, zt, hx1, yc, zr])) + poly('wh-refl', mir([hx0 - ov, yc, zr, hx1 + ov, yc, zr, hx1 + ov, hy1 + ov, zt - 0.1, hx0 - ov, hy1 + ov, zt - 0.1])), 6, 0.6);
    add('refl', wx('wh-refl', hx1, hy0, hy1, -zt, -Z) + wy('wh-refl', hy1, hx0, hx1, -zt, -Z) + wy('wh-refl d', PD, 0, PW, -Z, -Z + 0.3), 5, 0.5);
    // 8 мережі з берега (рентген): вода, каналізація до очисної на березі, електрика від опори; потоки
    var sx = bx + 0.4, ex = bx + 1.1;
    add('shore', box('wh-tank', bx - 3, bx - 1.2, SH - 3.6, SH - 1.8, 0.5, 1.2) + circ('wh-hatch', bx - 2.1, SH - 2.7, 1.22, 0.35), 7, 0.4);
    add('shore', line('wh-polel', [ex + 2.6, SH - 2, 0.5, ex + 2.6, SH - 2, 5]) + line('wh-polel', [ex + 2.1, SH - 2, 4.6, ex + 3.1, SH - 2, 4.6]), 7, 0.6);
    var wtr = [bx - 4, SH - 1, 0.5, sx, SH, Z - 0.35, sx, hy0 + 1.5, Z - 0.35, hx0 + 2, hy0 + 1.5, Z - 0.35, hx0 + 2, hy0 + 1.5, Z + 0.9];
    var sew = [hx0 + 3.2, hy0 + 2.5, Z + 0.4, hx0 + 3.2, hy0 + 2.5, Z - 0.45, sx + 0.35, hy0 + 2.5, Z - 0.45, sx + 0.35, SH, Z - 0.45, bx - 2.1, SH - 2.7, 0.9];
    var pwr = [ex + 2.6, SH - 2, 4.6, ex, SH, Z - 0.25, ex, hy0 + 0.6, Z - 0.25, hx0 + 0.3, hy0 + 0.6, Z - 0.25, hx0 + 0.3, hy0 + 0.6, Z + 1.4];
    add('net', line('wh-pw', wtr) + flow('wh-fw', wtr, 4, 3.4), 7, 0.1, null, 0);
    add('net', line('wh-ps', sew) + flow('wh-fs', sew, 4, 4), 7, 0.35, null, 1);
    add('net', line('wh-pe', pwr) + box('wh-box', hx0 + 0.1, hx0 + 0.35, hy0 + 0.3, hy0 + 0.9, Z + 1.2, Z + 1.9) + flow('wh-fe', pwr, 3, 2.4), 7, 0.6, null, 2);
    // 9 фасад і вікна: обшивка дошками, панорамне скління до води
    for (y = hy0, n = 0; y < hy1 - 0.01; y += 1.2, n++) { var yy = Math.min(hy1, y + 1.2), win = y > hy0 + 0.6 && yy < hy1 - 0.6 && n % 2; add('house', wx('wh-clad' + (win ? ' gw' : ''), hx1, y, yy, Z, zt), 8, 0.05 + 0.4 * (y - hy0) / hd); }
    for (x = hx0, n = 0; x < hx1 - 0.01; x += 1.2, n++) { var xx = Math.min(hx1, x + 1.2), w2 = x > hx0 + 0.5 && xx < hx1 - 0.5 && n % 4 !== 3; add('house', wy('wh-clad l' + (w2 ? ' gw' : ''), hy1, x, xx, Z, zt) + (w2 ? line('wh-mul', [xx, hy1, Z, xx, hy1, zt]) : ''), 8, 0.45 + 0.45 * (x - hx0) / hw); }
    add('house', wy('wh-door', hy1, hx0 + hw * 0.08, hx0 + hw * 0.08 + 1, Z, Z + 2.2), 8, 0.95);
    add('refl', wx('wh-refl w', hx1, hy0 + 1, hy1 - 1, -zt + 0.4, -Z - 0.3) + wy('wh-refl w', hy1, hx0 + 1, hx1 - 1, -zt + 0.4, -Z - 0.3), DUSK, 0.3);
    // 10 тераса над водою: консоль, поручні, сходи у воду, шезлонги
    var ty0 = hy1 + 0.6, tx1 = PW;
    add('terr', box('wh-tdeck', -1.2, 0, 0, PD, Z - 0.25, Z) , 9, 0.05);
    for (y = 0; y < PD; y += 1.2) add('terr', box('wh-post', -1.2, -1.1, y, y + 0.1, Z, Z + 1), 9, 0.2 + 0.3 * y / PD);
    add('terr', line('wh-rail', [-1.15, 0, Z + 1, -1.15, PD, Z + 1, PW, PD, Z + 1]), 9, 0.55);
    for (x = 0.4; x < PW; x += 1.2) add('terr', line('wh-bal', [x, PD, Z, x, PD, Z + 1]), 9, 0.35 + 0.2 * x / PW);
    add('terr', line('wh-lad', [PW - 1.6, PD, Z, PW - 1.6, PD + 0.4, -0.6]) + line('wh-lad', [PW - 1, PD, Z, PW - 1, PD + 0.4, -0.6]) + [0.6, 0.1, -0.4].map(function (z) { return line('wh-lad', [PW - 1.6, PD + 0.4 * (Z - z) / (Z + 0.6), z, PW - 1, PD + 0.4 * (Z - z) / (Z + 0.6), z]); }).join(''), 9, 0.65);
    [[hx0 + 1.5, ty0 + 1.4], [hx0 + 4, ty0 + 1.4]].forEach(function (q, k) { if (q[0] < PW - 2.5) add('terr', box('wh-lng', q[0], q[0] + 0.7, q[1], q[1] + 1.9, Z, Z + 0.35) + poly('wh-lngb', [q[0], q[1], Z + 0.35, q[0] + 0.7, q[1], Z + 0.35, q[0] + 0.7, q[1] + 0.3, Z + 1, q[0], q[1] + 0.3, Z + 1]), 9, 0.75 + k * 0.1); });
    add('terr', box('wh-pot', PW - 1.2, PW - 0.5, ty0 + 0.2, ty0 + 0.9, Z, Z + 0.6) + circ('wh-bush', PW - 0.85, ty0 + 0.55, Z + 0.9, 0.45), 9, 0.9);
    // 11 вечір: ніч, вікна світяться, світильники тераси, доріжки світла на воді
    add('night', '<rect class="wh-night" x="-9999" y="-9999" width="19999" height="19999"/>', DUSK, 0.02);
    var lamps = []; for (x = 1; x < PW; x += 3) lamps.push([x, PD]); for (y = 2; y < PD; y += 3.5) lamps.push([-1.15, y]);
    lamps.forEach(function (q, k) {
      var a = P(q[0], q[1] + 0.6, 0), b = P(q[0], q[1] + 0.6, -1.6); // доріжка світла — лише від ближнього краю (за дальнім її закриває настил)
      add('glow', dot('wh-lamp', q[0], q[1], Z + 1.05, 2.2) + circ('wh-gl', q[0], q[1], Z + 1, 0.9) + (q[0] < 0 ? '' : '<line class="wh-streak" style="animation-delay:' + (k * 0.37).toFixed(2) + 's" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'), DUSK, 0.3 + 0.5 * k / lamps.length);
    });
    // 12 здача: господарі на терасі, човен на воді
    add('ppl', person('p0', hx0 + 2.5, ty0 + 0.6, Z) + person('p1', hx0 + 3.3, ty0 + 0.4, Z), 11, 0.2);
    if (!RM) { var c0 = P(PW + 9, PD + 3, 0), c1 = P(-6, PD + 7, 0); add('ppl', '<g class="wh-boat"><animateMotion dur="26s" repeatCount="indefinite" path="M' + c0.join(',') + ' L' + c1.join(',') + '"/>' + '<path class="wh-hull" d="M-14,0 q14,7 28,0 l-4,-3 h-20z"/>' + person('p2', 0, 0, 0.1) + '</g>', 11, 0.5); }
    // збірка
    ['shore', 'pile'].forEach(function (k) { L[k].sort(function (a, b) { return a.d - b.d; }); });
    var order = ['sky', 'bed', 'deep', 'refl', 'water', 'shore', 'pile', 'plat', 'house', 'terr', 'net', 'ppl', 'night', 'glow'], html = '', id = 0;
    els = [];
    order.forEach(function (ly) { L[ly].forEach(function (o) { o.id = id++; html += '<g class="wh-e' + (o.k < 0 ? ' on' : '') + (o.x != null ? ' ux ux' + o.x : '') + '">' + o.h + '</g>'; if (o.k >= 0) els.push(o); }); });
    els.sort(function (a, b) { return a.k - b.k; });
    var c = [P(-1.5, SH - 3, zr), P(PW + 3, SH, 0), P(-1.5, PD + 2, 0), P(PW + 1, PD + 2, -2), P(PW + 4, 0, 0), P(-4, PD, 0)], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    FULL = [Math.min.apply(0, xs) - 14, Math.min.apply(0, ys) - 14, Math.max.apply(0, xs) - Math.min.apply(0, xs) + 28, Math.max.apply(0, ys) - Math.min.apply(0, ys) + 28];
    FOC = [0, [0, 0, PW, PD, -2.6, Z], [0, 0, PW, PD, 0, Z], [0, 0, PW, PD, 0, Z], [bx - 3, SH - 2, bx + 3, 2, 0, Z + 1], [hx0, hy0, hx1, hy1, Z, zt], [hx0, hy0, hx1, hy1, Z, zr], 0, 0, [-1.5, hy1 - 1, PW, PD + 1, -0.6, Z + 1.5], 0, 0];
    svg.innerHTML = '<defs><linearGradient id="wh-wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6f8f" stop-opacity=".78"/><stop offset="1" stop-color="#1b4a66" stop-opacity=".84"/></linearGradient>'
      + '<pattern id="wh-wd" width="40" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(150)"><path d="M0 1.5h17M21 1.5h19M0 4.2h9M13 4.2h27" stroke="#3a2614" stroke-width=".5" stroke-opacity=".5"/></pattern>'
      + '<pattern id="wh-rp" width="46" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M2 8q6-4 12 0M24 18q7-4 14 0" stroke="#cfe8f5" stroke-width=".7" fill="none" stroke-opacity=".13"/></pattern>'
      + '<radialGradient id="wh-sh"><stop offset=".55" stop-color="#06131c" stop-opacity=".45"/><stop offset="1" stop-color="#06131c" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="wh-gw"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>' + html;
    nodes = [].slice.call(svg.querySelectorAll('g.wh-e'));
    night = svg.querySelector('.wh-night');
    ptr = 0; shown = -1; vb = null;
    els.forEach(function (o) { o.n = nodes[o.id]; });
    apply(true);
  }
  function person(c, x, y, z) { var a = P(x, y, z), b = P(x, y, z + 1.0), h = P(x, y, z + 1.32); return '<g class="wh-man ' + c + '"><line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/><circle cx="' + h[0] + '" cy="' + h[1] + '" r="2.6"/></g>'; }
  function target(i) {
    var f = FOC[i]; if (!f) return FULL;
    var c = [P(f[0], f[1], f[5]), P(f[2], f[1], f[4]), P(f[0], f[3], f[4]), P(f[2], f[3], f[4]), P(f[2], f[1], f[5]), P(f[0], f[3], f[5])], xs = c.map(function (q) { return +q[0]; }), ys = c.map(function (q) { return +q[1]; });
    var w = Math.max.apply(0, xs) - Math.min.apply(0, xs) + 50, h = Math.max.apply(0, ys) - Math.min.apply(0, ys) + 50, ar = FULL[2] / FULL[3];
    if (w / h < ar) w = h * ar; else h = w / ar;
    w = Math.min(w, FULL[2]); h = Math.min(h, FULL[3]);
    return [(Math.min.apply(0, xs) + Math.max.apply(0, xs)) / 2 - w / 2, (Math.min.apply(0, ys) + Math.max.apply(0, ys)) / 2 - h / 2, w, h];
  }
  function apply(force) {
    var p = prog;
    while (ptr < els.length && els[ptr].k <= p) { els[ptr].n.classList.add('on'); ptr++; }
    while (ptr > 0 && els[ptr - 1].k > p) { ptr--; els[ptr].n.classList.remove('on'); }
    els.forEach(function (o) { if (o.u != null) o.n.classList.toggle('gone', p >= o.u); });
    svg.classList.toggle('wh-closed', p >= CLAD + 0.6);
    svg.classList.toggle('wh-dusk', p >= DUSK + 0.3);
    if (night) night.style.opacity = p < DUSK ? 0 : (Math.min(1, (p - DUSK) / 0.7) * 0.55).toFixed(2);
    var i = Math.min(N - 1, Math.floor(p));
    if (i !== shown || force) {
      shown = i;
      cap.innerHTML = '<b>' + esc(ST[i][0]) + '</b><span>' + esc(ST[i][1]) + '</span>';
      cnt.textContent = (i + 1) + ' ' + ui.of + ' ' + N;
      live.textContent = (i + 1) + '/' + N + ': ' + ST[i][0];
      vbT = target(i);
      if (i === N - 1) cl('wh_end');
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
  function onScroll() {
    if (!run) return;
    var r = run.getBoundingClientRect(), vh = W.innerHeight, span = r.height - vh;
    var p = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) * N : 0;
    if (Math.abs(p - prog) > 0.004) { prog = Math.min(N - 0.001, p); apply(); }
  }
  function go(i) {
    i = Math.max(0, Math.min(N - 1, i));
    if (RM || !run) { prog = i + 0.999; apply(); return; }
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
  function est() { return ui.est.replace('{n}', cfg.a).replace('{l}', ui.lvls[cfg.l]).replace('{v}', money(cfg.a * RATE[cfg.l])); }
  function enhance() {
    var list = sec.querySelector('ol.bz-st'), box0 = el('div', 'la-box'), ctr = el('div', 'la-ctl'), estEl = el('p', 'la-est');
    ctr.appendChild(seg(ui.area, AR.map(function (n) { return n + ' ' + ui.unit; }), 1, function (i) { cfg.a = AR[i]; build(); estEl.textContent = est(); cl('wh_area', cfg.a); }));
    ctr.appendChild(seg(ui.fnd, ui.fnds, 0, function (i) { cfg.f = i; build(); cl('wh_fnd', i); }));
    ctr.appendChild(seg(ui.lvl, ui.lvls, 0, function (i) { cfg.l = i; estEl.textContent = est(); cl('wh_lvl', i); }));
    var xr = el('div', 'la-seg la-xr'); xr.setAttribute('role', 'group'); xr.setAttribute('aria-label', ui.xray); xr.appendChild(el('span', 'la-lab', esc(ui.xray)));
    ui.xr.forEach(function (t, i) {
      var b = el('button', 'x' + i, esc(t)); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { cfg.xr[i] = cfg.xr[i] ? 0 : 1; b.setAttribute('aria-pressed', cfg.xr[i] ? 'true' : 'false'); svg.classList.toggle('xr' + i, !!cfg.xr[i]); cl('wh_xray', i); });
      xr.appendChild(b);
    });
    ctr.appendChild(xr);
    var stick = el('div', 'la-stick');
    svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'la-svg wh-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', sec.querySelector('h2').textContent);
    var rtl = d.documentElement.dir === 'rtl', nav = el('div', 'la-nav'), pb = el('button', 'la-prev', rtl ? '›' : '‹'), nb = el('button', 'la-next', rtl ? '‹' : '›');
    pb.type = nb.type = 'button'; pb.setAttribute('aria-label', ui.prev); nb.setAttribute('aria-label', ui.next);
    pb.addEventListener('click', function () { go(shown - 1); }); nb.addEventListener('click', function () { go(shown + 1); });
    cnt = el('span', 'la-cnt'); cap = el('p', 'la-cap'); live = el('span', 'la-live'); live.setAttribute('aria-live', 'polite');
    nav.appendChild(pb); nav.appendChild(cnt); nav.appendChild(nb);
    stick.appendChild(svg); stick.appendChild(cap); stick.appendChild(nav); stick.appendChild(live);
    estEl.textContent = est();
    var cta = el('a', 'btn main la-cta', esc(ui.calc)); cta.href = '#zayavka';
    cta.addEventListener('click', function () {
      var f = d.getElementById('of'), m = d.getElementById('oMsg'), msg = ui.msg.replace('{n}', cfg.a).replace('{f}', ui.fnds[cfg.f]).replace('{l}', ui.lvls[cfg.l]);
      if (f) f.setAttribute('data-service', ui.svc);
      if (m) { m.value = msg; var det = m.closest('details'); if (det) det.open = true; }
      setTimeout(function () { var ph = d.getElementById('oPhone'); if (ph) ph.focus({ preventScroll: true }); }, 500);
      cl('wh_cta', cfg.a + '/' + cfg.f + '/' + cfg.l);
    });
    var foot = el('div', 'la-foot'); foot.appendChild(estEl); foot.appendChild(cta); stick.appendChild(foot);
    if (RM) { box0.appendChild(ctr); box0.appendChild(stick); }
    else { run = el('div', 'la-run'); run.style.height = 'calc(100vh + ' + (N * 38) + 'vh)'; box0.appendChild(ctr); run.appendChild(stick); box0.appendChild(run); }
    list.parentNode.insertBefore(box0, list);
    list.classList.add('la-sr');
    sec.classList.add('la-on');
    svg.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(shown + 1); if (e.key === 'ArrowLeft') go(shown - 1); });
    svg.setAttribute('tabindex', '0');
    prog = RM ? N - 0.001 : 0;
    build();
    if (!RM) { W.addEventListener('scroll', onScroll, { passive: true }); W.addEventListener('resize', onScroll); onScroll(); }
  }
  function css() {
    return new Promise(function (res) {
      var href = sec.getAttribute('data-css'); if (!href || d.querySelector('link[href="' + href + '"]')) return res();
      var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = function () { res(); }; d.head.appendChild(l);
    });
  }
  function inView() { var r = sec.getBoundingClientRect(); return r.top < (W.innerHeight || 0) && r.bottom > 0; }
  css().then(function () {
    if (!inView() || sec.hasAttribute('data-sw') || !('IntersectionObserver' in W)) return enhance(); // data-sw — показана перемикачем сцен на місці: одразу
    var o = new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) { o.disconnect(); enhance(); } });
    o.observe(sec);
  });
})();
