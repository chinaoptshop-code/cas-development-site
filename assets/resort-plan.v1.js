/* «Комплекс відпочинку» (tools/site/resort.py): інтерактивний генплан. Клік/тап/Enter по обʼєкту — плавний zoom і поетапне будівництво;
   панель цін — лише ставки CLAUDE.md × обрана площа, решта — «за кошторисом». Вантажить site-chrome.v1.js після першої прокрутки.
   CLS 0 — сцена будується, коли блок поза кадром; reduced-motion — без анімацій, етапи кнопками; Esc — назад до генплану. */
(function () {
  'use strict';
  var W = window, d = document, sec = d.querySelector('section.rp[data-rp]');
  if (!sec || sec.__rp) return; sec.__rp = 1;
  var RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches, NS = 'http://www.w3.org/2000/svg';
  var D; try { D = JSON.parse(sec.querySelector('script.rp-ui').textContent); } catch (e) { return; }
  var U = D.ui, lang = (d.documentElement.lang || 'uk').slice(0, 2);
  var cfg = { n: 8, a: 45, r: 200, s: 100, l: 1 }, svg, vb = [0, 0, 1000, 700], vbT = vb.slice(), raf = 0, focus = null, stage = 0, timer = 0, panel, cap, bar, objs = [];
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  // зупинки сцени (жести, автопрогравання, панель компактної сцени): 0 — генплан, далі по одному обʼєкту кожного типу
  var STOPS = ['cabin', 'main', 'pool', 'pergola', 'relax', 'beach', 'bar', 'tech'], NST = STOPS.length + 1, sdU = null, CMP = false;
  function curStop() { return focus ? STOPS.indexOf(focus.getAttribute('data-o')) + 1 : 0; }
  function goStop(i) { i = Math.max(0, Math.min(NST - 1, i)); if (!i) { if (focus) close(1); return; } var g = svg.querySelector('.rp-o[data-o="' + STOPS[i - 1] + '"]'); if (g) open(g, 2); }
  function side() { if (!sdU) return; var k = curStop(), L = steps().length || 1; sdU(k, k ? ((k - 1) + (stage + 1) / L) / (NST - 1) : 0); }
  function cl(ev, v) { try { if (W.clarity) { W.clarity('event', ev); if (v) W.clarity('set', ev, v); } } catch (e) { } }
  function money(n) { return window.casUsd(n, lang); } // формат мови — site-chrome.v1.js ($1 100; en — $1,100)
  function R(c, x, y, w, h, rx, st) { return '<rect class="' + c + '"' + (st != null ? ' data-s="' + st + '"' : '') + ' x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function C(c, x, y, r, st) { return '<circle class="' + c + '"' + (st != null ? ' data-s="' + st + '"' : '') + ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>'; }
  function Pth(c, dd, st) { return '<path class="' + c + '"' + (st != null ? ' data-s="' + st + '"' : '') + ' d="' + dd + '"/>'; }
  function G(st, h, c) { return '<g class="rp-p' + (c || '') + '" data-s="' + st + '">' + h + '</g>'; }
  /* деталі: <use> символів defs, тверді тіні (світло зліва згори), вальмові дахи */
  function n1(v) { return Math.round(v * 10) / 10; }
  function Us(id, x, y, sc, a) { return '<use href="#rp-' + id + '" transform="translate(' + n1(x) + ' ' + n1(y) + ')' + (sc && sc !== 1 ? ' scale(' + sc + ')' : '') + '"' + (a || '') + '/>'; }
  function P(dd, a) { return '<path d="' + dd + '" ' + a + '/>'; }
  function poly(q) { return 'M' + q.map(function (p) { return n1(p[0]) + ' ' + n1(p[1]); }).join('L') + 'Z'; }
  function Rr(x, y, w, h, a) { return '<rect x="' + n1(x) + '" y="' + n1(y) + '" width="' + n1(w) + '" height="' + n1(h) + '" ' + a + '/>'; }
  function hsh(x, y, w, h, k) { return Rr(x + 4 * k, y + 5 * k, w, h, 'rx="2" fill="#08120a" opacity=".3"'); }
  // дах: [верх, низ, ліво, право, ребра]; i — відступ гребеня
  function hip(x0, y0, x1, y1, i) {
    var cy = (y0 + y1) / 2, a = x0 + i, b = x1 - i;
    return [poly([[x0, y0], [x1, y0], [b, cy], [a, cy]]), poly([[x0, y1], [x1, y1], [b, cy], [a, cy]]), poly([[x0, y0], [a, cy], [x0, y1]]), poly([[x1, y0], [b, cy], [x1, y1]]),
      'M' + n1(x0) + ' ' + n1(y0) + 'L' + n1(a) + ' ' + n1(cy) + 'L' + n1(x0) + ' ' + n1(y1) + 'M' + n1(x1) + ' ' + n1(y0) + 'L' + n1(b) + ' ' + n1(cy) + 'L' + n1(x1) + ' ' + n1(y1) + 'M' + n1(a) + ' ' + n1(cy) + 'H' + n1(b)];
  }
  function star(k, ro, ri, f) { var q = []; for (var i = 0; i < k * 2; i++) { var r = i % 2 ? ri : ro, t = Math.PI * i / k; q.push([r * Math.cos(t), r * Math.sin(t)]); } return P(poly(q), f); }
  function cub(a, b, c, e, t) { var u = 1 - t; return [0, 1].map(function (j) { return u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * e[j]; }); }

  /* частини обʼєктів за етапами (st[тип]) */
  function cabin(x, y, s) {
    var o = G(0, R('rp-found', x - 3, y - 3, s + 6, s + 6, 2) + R('rp-cc', x - 3, y - 3, s + 6, s + 6, 2));
    var f = ''; for (var i = 0; i <= 3; i++) for (var j = 0; j <= 3; j++) if (i % 3 === 0 || j % 3 === 0) f += C('rp-post', x + s * i / 3, y + s * j / 3, 1.6);
    f += Pth('rp-beam', 'M' + x + ' ' + y + 'h' + s + 'v' + s + 'h' + (-s) + 'z M' + x + ' ' + (y + s / 2) + 'h' + s);
    o += G(1, f);
    var hp = hip(x - 4, y - 4, x + s + 4, y + s + 4, s * 0.2), cx = x + s * 0.66, cz = y + s * 0.2;
    o += G(2, R('rp-sh', x + 1, y + 3, s + 10, s + 10, 6) + hsh(x - 4, y - 4, s + 8, s + 8, 1.2) + Pth('rp-roofa', hp[2]) + Pth('rp-roofb', hp[3]) + Pth('rp-roofc', hp[0]) + Pth('rp-roofd', hp[1])
      + Pth('rp-tlh', hp[0] + hp[1]) + Pth('rp-tlv', hp[2] + hp[3]) + P(hp[3], 'fill="#000" opacity=".2"') + P(hp[2], 'fill="#fff" opacity=".06"')
      + P(hp[4], 'fill="none" stroke="#2a1e15" stroke-width="1.1"') + P('M' + n1(x - 4 + s * .2) + ' ' + n1(y + s / 2 - .8) + 'H' + n1(x + s + 4 - s * .2), 'stroke="#c4a888" opacity=".55" stroke-width=".6"')
      + Rr(x - 4, y - 4, s + 8, s + 8, 'fill="none" stroke="#24180f" stroke-width=".8" rx="1"') + Rr(x + s * 0.18, y + s * 0.12, s * 0.16, s * 0.12, 'fill="#9fc6d4" stroke="#2a1e15" stroke-width=".5"')
      + hsh(cx, cz, 4.2, 4.2, .5) + Rr(cx, cz, 4.2, 4.2, 'fill="#8a7666" stroke="#3a2c22" stroke-width=".5"') + Rr(cx + 1, cz + 1, 2.2, 2.2, 'fill="#2a1e15"'));
    var t = R('rp-deck', x, y + s + 4, s, s * 0.32) + R('rp-wdx', x, y + s + 4, s, s * 0.32); for (var k = 1; k < 8; k++) t += Pth('rp-board', 'M' + (x + s * k / 8) + ' ' + (y + s + 4) + 'v' + (s * 0.32));
    o += G(3, t + C('rp-table', x + s * 0.78, y + s * 1.2, 2.4) + R('rp-lounger', x + s * 0.06, y + s + 6, 4.5, s * 0.26, 1.2) + R('rp-lounger', x + s * 0.2, y + s + 6, 4.5, s * 0.26, 1.2));
    o += G(4, R('rp-win', x + s * 0.18, y + s + 1, s * 0.22, 3) + R('rp-win', x + s * 0.6, y + s + 1, s * 0.22, 3) + C('rp-glow', x + s / 2, y + s * 1.2, s * 0.35) + C('rp-lamp', x + s / 2, y + s * 1.2, 1.6));
    return o;
  }
  function mainB(x, y, w, h) {
    var o = G(0, Pth('rp-duct', 'M' + x + ' ' + (y + h * 0.2) + 'h' + w) + Pth('rp-pipe', 'M' + x + ' ' + (y + h * 0.5) + 'h' + w) + Pth('rp-cable', 'M' + x + ' ' + (y + h * 0.8) + 'h' + w) + R('rp-sh', x + 3, y + 5, w + 8, h + 8, 6) + R('rp-shell', x, y, w, h, 3) + R('rp-cc', x, y, w, h, 3));
    var t = ''; for (var i = 0; i < 4; i++) for (var j = 0; j < 3; j++) t += C('rp-table', x + w * (0.12 + i * 0.13), y + h * (0.2 + j * 0.3), 3.5);
    o += G(1, R('rp-hall', x + 2, y + 2, w * 0.6, h - 4, 2) + t);
    var k = R('rp-kitch', x + w * 0.64, y + 2, w * 0.34, h - 4, 2); for (i = 0; i < 3; i++) k += R('rp-steel', x + w * 0.68, y + 6 + i * (h - 12) / 3, w * 0.26, (h - 12) / 3 - 4, 1);
    o += G(2, k);
    var tr = R('rp-deck', x - 4, y + h + 4, w + 8, h * 0.32) + R('rp-wdx', x - 4, y + h + 4, w + 8, h * 0.32); for (i = 0; i < 5; i++) tr += C('rp-umb', x + w * (0.1 + i * 0.2), y + h + 4 + h * 0.16, 6);
    o += G(3, tr);
    var hp = hip(x - 4, y - 4, x + w + 4, y + h + 4, h / 2 + 4), cy = y + h / 2, a = x + h / 2 + 6, b = x + w - h / 2 - 6, pv = '', i2;
    for (i = 0; i < 4; i++) for (i2 = 0; i2 < 2; i2++) pv += Rr(a + (b - a) * i / 4 + 1, cy + 5 + i2 * (h / 4 - 1), (b - a) / 4 - 2, h / 4 - 5, 'fill="#1f3550" stroke="#7d97b3" stroke-width=".5"');
    for (i = 0; i < 3; i++) pv += Rr(a + (b - a) * (0.15 + i * 0.3), cy - h / 4 - 2, 9, 6, 'fill="#bfe1ec" fill-opacity=".85" stroke="#2c3034" stroke-width=".6"');
    o += G(3, hsh(x - 4, y - 4, w + 8, h + 8, 1.6) + P(hp[0], 'fill="#727a80"') + P(hp[1], 'fill="#40464b"') + P(hp[2], 'fill="#5e656b"') + P(hp[3], 'fill="#4a5055"')
      + P(hp[0] + hp[1], 'fill="url(#rp-sv)"') + P(hp[2] + hp[3], 'fill="url(#rp-sn)"') + P(hp[4], 'fill="none" stroke="#2c3034" stroke-width="1.4"')
      + Rr(x - 4, y - 4, w + 8, h + 8, 'fill="none" stroke="#25292c" stroke-width="1"') + pv, ' rp-rf');
    return o;
  }
  function pergola(x, y, w, h) {
    var o = '', p = ''; [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1]].forEach(function (q) { p += R('rp-pst', x + q[0] * w - 2, y + q[1] * h - 2, 4, 4); });
    o += G(0, p) + G(1, R('rp-bm', x - 3, y - 1, w + 6, 3) + R('rp-bm', x - 3, y + h - 2, w + 6, 3));
    var l = R('rp-sh', x + 2, y + 4, w + 6, h + 6, 4); for (var i = 1; i < 12; i++) l += Pth('rp-lv', 'M' + (x + w * i / 12) + ' ' + y + 'v' + h); o += G(2, l);
    o += G(3, C('rp-glow', x + w / 2, y + h / 2, w * 0.45) + C('rp-lamp', x + w / 2, y + h / 2, 2));
    return o;
  }
  function bar(x, y, w, h) {
    var o = G(0, R('rp-found', x - 4, y - 4, w + 8, h + 8, 3));
    o += G(1, C('rp-post', x, y, 2) + C('rp-post', x + w, y, 2) + C('rp-post', x, y + h, 2) + C('rp-post', x + w, y + h, 2));
    var bs = ''; for (var i0 = 0; i0 < 4; i0++) bs += C('rp-table', x + 12 + (w - 24) * i0 / 3, y + h + 1, 2.2);
    o += G(2, bs + Pth('rp-counter', 'M' + (x + 6) + ' ' + (y + h - 6) + 'v' + (-(h - 14)) + 'h' + (w - 12) + 'v' + (h - 14)));
    o += G(3, R('rp-sh', x - 2, y - 1, w + 14, h * 0.55 + 8, 6) + R('rp-canopy', x - 6, y - 6, w + 12, h * 0.55, 4));
    var s = ''; for (var i = 0; i < 9; i++) s += C('rp-bulb', x - 4 + (w + 8) * i / 8, y + h * 0.55 + Math.sin(i) * 2, 1.6); o += G(4, s + C('rp-glow', x + w / 2, y + h / 2, w * 0.5));
    return o;
  }
  function pool(x, y, w, h) {
    var dk = Rr(x - 16, y - 12, w + 32, h + 42, 'rx="6" fill="#d6c9ab"') + Rr(x - 16, y - 12, w + 32, h + 42, 'rx="6" class="rp-cc"'), q;
    for (q = 0; q < 6; q++) dk += Us('ls', x + 6 + q * 25 + (q > 2 ? 12 : 0), y + h + 14, 1, ' fill="' + ['#6fb7c9', '#e9b25a'][q % 2] + '"');
    dk += Us('ub', x + w / 2 + 3, y + h + 20, 1.05, ' fill="#bf9148"') + Us('pl', x + 9, y + h + 21, 1, ' fill="#c98a6a"') + Us('pl', x + 121, y + h + 21, 1, ' fill="#5d7fa3"');
    var o = G(4, dk) + G(0, R('rp-dig', x - 6, y - 6, w + 12, h + 12, 10)) + G(1, R('rp-shellp', x - 3, y - 3, w + 6, h + 6, 9) + R('rp-cc', x - 3, y - 3, w + 6, h + 6, 9)) + G(2, R('rp-wp', x, y, w, h, 8));
    var t = ''; for (var i = 1; i < 10; i++) t += Pth('rp-tile', 'M' + (x + w * i / 10) + ' ' + y + 'v' + h); for (i = 1; i < 5; i++) t += Pth('rp-tile', 'M' + x + ' ' + (y + h * i / 5) + 'h' + w);
    o += G(3, R('rp-lining', x, y, w, h, 8) + t);
    o += G(4, R('rp-water', x + 2, y + 2, w - 4, h - 4, 7) + R('rp-wtx', x + 2, y + 2, w - 4, h - 4, 7) + Pth('rp-ripple', 'M' + (x + 10) + ' ' + (y + h * 0.4) + 'q 10 -5 20 0 t 20 0 t 20 0 t 20 0') + C('rp-ulight', x + 8, y + h / 2, 5) + C('rp-ulight', x + w - 8, y + h / 2, 5)
      + P(poly([[x + 4, y + 3], [x + w * 0.42, y + 3], [x + w * 0.2, y + h - 3], [x + 4, y + h - 3]]), 'fill="#fff" opacity=".13"') + P('M' + n1(x + w * 0.55) + ' ' + n1(y + 10) + 'l12 -3', 'stroke="#fff" opacity=".75" stroke-width="1.4" stroke-linecap="round"')
      + '<circle cx="' + n1(x + w * 0.66) + '" cy="' + n1(y + h * 0.62) + '" r="4.5" fill="none" stroke="#e6f8ff" opacity=".6"/>' + Us('pp', x + w * 0.66, y + h * 0.62, 0.9, ' fill="#3f8fb3"'));
    return o;
  }
  function tech(x, y) {
    var o = G(0, R('rp-tb', x, y, 58, 48, 2) + C('rp-boil', x + 18, y + 24, 9) + C('rp-boil', x + 40, y + 24, 9));
    o += G(1, R('rp-tb', x + 66, y, 40, 48, 2) + R('rp-epanel', x + 72, y + 8, 28, 32, 1) + Pth('rp-cable', 'M' + (x + 86) + ' ' + (y + 48) + 'v 20'));
    o += G(2, R('rp-tb', x + 114, y, 86, 48, 6) + C('rp-tank', x + 136, y + 24, 14) + C('rp-tank', x + 176, y + 24, 14));
    o += G(3, R('rp-store', x, y + 58, 86, 62, 2));
    var p = R('rp-park', x + 94, y + 58, 106, 62, 2); for (var i = 1; i < 5; i++) p += Pth('rp-stripe', 'M' + (x + 94 + 106 * i / 5) + ' ' + (y + 58) + 'v 34');
    [100, 142].forEach(function (c) { p += hsh(x + c, y + 64, 14, 24, .5) + R('rp-car', x + c, y + 64, 14, 24, 3) + Rr(x + c + 2, y + 69, 10, 4.5, 'rx="1" fill="#2b3640"') + Rr(x + c + 2, y + 82, 10, 3, 'rx="1" fill="#2b3640"'); });
    o += G(4, p);
    return o;
  }
  function relax(x, y) {
    var o = G(0, C('rp-pad', x, y, 46) + C('rp-cc', x, y, 46));
    var l = ''; for (var i = 0; i < 4; i++) l += R('rp-lounger', x - 40 + i * 16, y - 34, 10, 22, 3); o += G(1, l);
    o += G(2, C('rp-firering', x - 8, y + 12, 11) + C('rp-fire', x - 8, y + 12, 5) + C('rp-glow', x - 8, y + 12, 20));
    o += G(3, C('rp-tub', x + 24, y + 14, 13) + C('rp-tubw', x + 24, y + 14, 10));
    return o;
  }
  function beach(y) {
    var sd = 'M0 ' + y + ' C 250 ' + (y - 14) + ' 750 ' + (y + 12) + ' 1000 ' + (y - 6) + ' V ' + (y + 70) + ' H 0 Z', o = G(0, Pth('rp-sand', sd) + Pth('rp-stx', sd) + Rr(0, y + 52, 1000, 18, 'fill="url(#rp-ws)"'));
    var l = '', cs = ['#6fb7c9', '#e9b25a', '#c9714f', '#f2efe6']; for (var i = 0; i < 8; i++) l += Us('ls', 330 + i * 46, y + 22, 1.66, ' fill="' + cs[i % 4] + '"'); o += G(1, l);
    var u = ''; for (i = 0; i < 4; i++) u += Us('ub', 352 + i * 92, y + 30, 1.45, ' fill="' + (i % 2 ? '#c9714f' : '#bf9148') + '"');
    [[335, 0], [473, 1], [565, 2]].forEach(function (q) { u += Us('pl', q[0], y + 33, 1.55, ' fill="' + ['#d39a72', '#7a5a8a', '#4f86a8'][q[1]] + '"'); });
    [[300, 48, '#c0643f'], [560, 52, '#3f6f8f'], [575, 49, '#e2c15a'], [690, 60, '#7a9a5a'], [262, 30, '#8a5a7a']].forEach(function (q) { u += Us('pp', q[0], y + q[1], 1.15, ' fill="' + q[2] + '"'); });
    o += G(2, u);
    return o;
  }
  function layout() {
    var h = '', nCab = cfg.n, s = Math.sqrt(cfg.a) * 5.6, mw = Math.sqrt(cfg.r) * 10.5, mh = mw * 0.62;
    objs = [];
    var py = Math.round(nCab > 4 ? (752 + 1.32 * s) / 2 : 352 + 1.32 * s + 12); // доріжка вздовж будиночків — між рядами / під терасами, не крізь них
    function obj(type, idx, inner) { var k = objs.length; objs.push(type); return '<g class="rp-o" data-o="' + type + '" data-k="' + k + '" tabindex="0" role="button" aria-label="' + esc(D.o[type]) + (idx ? ' ' + idx : '') + '">' + inner + '</g>'; }
    h += '<rect class="rp-grass" x="0" y="0" width="1000" height="700"/><rect fill="url(#rp-gq)" width="1000" height="590"/><rect class="rp-gtx" x="0" y="0" width="1000" height="700"/>';
    h += Pth('rp-lake', 'M0 590 C 250 576 750 602 1000 584 V 700 H 0 Z') + Pth('rp-lktx', 'M0 590 C 250 576 750 602 1000 584 V 700 H 0 Z') + '<g clip-path="url(#rp-lk)"><g class="rp-waves">' + Pth('rp-wave', 'M0 620 q 25 -6 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0') + Pth('rp-wave', 'M-25 652 q 25 -6 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0') + '</g></g>';
    // доріжки: бордюр, покриття, шви; ліхтарі
    var e1 = 480 - mw / 2, py2 = 150 + mh / 2 + 34, pt = [[[200, 160], [300, 170], [380, 170], [e1, 170]], [[480, py2], [480, 280], [500, 300], [500, 360]], [[500, 360], [500, 420], [520, 470], [520, 540]],
      [[120, py], [300, py - 4], [700, py - 4], [900, py]], [[160, 470], [240, 500], [300, 520], [360, 540]], [[700, 480], [760, 500], [800, 505], [830, 510]]], pd = '', lp = '';
    pt.forEach(function (c, i) {
      pd += (i === 2 ? 'C' : 'M' + c[0].join(' ') + 'C') + c.slice(1).map(function (q) { return q.map(n1).join(' '); }).join(' ');
      (i === 3 ? [0.12, 0.37, 0.63, 0.88] : [0.55]).forEach(function (t) { var q = cub(c[0], c[1], c[2], c[3], t); lp += Us('lp', q[0] + (i === 3 ? 0 : 8), q[1] + (i === 3 ? 8.5 : 0)); });
    });
    h += P(pd, 'fill="none" stroke="#8b8069" stroke-width="12.5" stroke-linecap="round"') + Pth('rp-path', pd) + P(pd, 'fill="none" stroke="#a89b7e" stroke-width="7" stroke-dasharray=".8 4.2" opacity=".7"') + lp;
    // дерева 3 типів і кущі
    [[300, 60, 'a', 1.1], [360, 92, 'c', .9], [820, 70, 'a', 1.25], [900, 130, 'b', 1.1], [950, 260, 'a', 1], [60, 250, 'b', 1.2], [40, 330, 'a', .9], [960, 400, 'c', 1.1], [270, 300, 'a', .95],
      [740, 300, 'c', .85], [600, 470, 'a', 1.05], [110, 562, 'b', .8], [945, 515, 'b', .85], [420, 60, 'b', 1], [250, 205, 'c', .8], [600, 40, 'a', .9], [700, 40, 'b', .8], [880, 205, 'a', .9],
      [985, 330, 'b', .75], [25, 440, 'c', .9], [575, 255, 'c', .75], [975, 60, 'a', 1], [520, 30, 'c', .8], [240, 40, 'b', .7], [960, 470, 'a', .7]].forEach(function (p) { h += Us('t' + p[2], p[0], p[1], p[3]); });
    [[398, 128], [562, 128], [614, 205], [818, 205], [302, 262], [752, 287], [545, 300], [452, 488], [636, 505], [84, 430], [235, 470], [390, 300], [880, 300], [860, 470], [195, 120], [660, 330]].forEach(function (p, i) { h += Us('bu', p[0], p[1], 0.8 + (i % 3) * 0.2); });
    h += obj('tech', 0, tech(30, 30));
    h += obj('main', 0, mainB(480 - mw / 2, 150 - mh / 2 + 20, mw, mh));
    h += obj('pool', 0, pool(640 + (mw - 110) / 3, 90, 150, 82));
    h += obj('pergola', 1, pergola(320, 230, 72, 50)) + obj('pergola', 2, pergola(660, 250, 72, 50));
    var rows = nCab <= 4 ? 1 : 2, per = Math.ceil(nCab / rows), k = 0;
    for (var r = 0; r < rows; r++) {
      var cnt = Math.min(per, nCab - k), xa = (r ? 220 : 60) + s / 2, xb = 940 - s / 2; // другий ряд — правіше майданчика релаксу, будиночки не накладаються
      for (var i = 0; i < cnt; i++, k++) {
        var x = (cnt === 1 ? (xa + xb) / 2 : xa + (xb - xa) * i / (cnt - 1)) - s / 2, y = 330 + r * 88 + Math.sin(i * 1.3) * 8;
        h += obj('cabin', k + 1, cabin(x, y, s));
      }
    }
    h += obj('relax', 0, relax(150, 490));
    h += obj('beach', 0, beach(520));
    h += obj('bar', 0, bar(800, 500, 70, 38));
    // піна, відблиски, пірс, човни, плавці, люди — поза обʼєктами
    var w = '', fm = 'M0 591q12 3 24 0' + 't24 0'.repeat(41), pl = '';
    w += P(fm, 'fill="none" stroke="#f4fbff" opacity=".75" stroke-width="2.4"') + P(fm.replace('M0 591', 'M-10 598'), 'fill="none" stroke="#e6f8ff" opacity=".35" stroke-width="1.4" stroke-dasharray="22 9 8 12"');
    for (var g = 0; g < 18; g++) w += P('M' + n1((g * 157 + 40) % 990) + ' ' + n1(610 + (g * 37) % 84) + 'h' + (4 + g % 4 * 2), 'stroke="#fff" opacity=".55" stroke-width="1.2" stroke-linecap="round"');
    for (g = 0; g < 26; g++) pl += 'M728 ' + (580 + g * 3) + 'h14';
    w += Rr(732, 584, 14, 80, 'fill="#05202e" opacity=".35"') + Rr(728, 576, 14, 80, 'fill="#a5825a"') + P(pl, 'stroke="#6e5236" stroke-width=".5"') + Rr(722, 640, 26, 14, 'fill="#a5825a"');
    [[728, 600], [742, 600], [728, 624], [742, 624], [722, 654], [748, 654]].forEach(function (q) { w += C('rp-post', q[0], q[1], 1.6); });
    var hb = 'M0-15C6-9 6 9 4.5 15H-4.5C-6 9-6-9 0-15Z', kb = 'M0-16C3-8 3 8 0 16C-3 8-3-8 0-16Z', bs = 'fill="#062634" opacity=".3" transform="translate(3 4)"';
    w += '<g transform="translate(758 626) rotate(8)">' + P(hb, bs) + P(hb, 'fill="#f4f1e8" stroke="#7d8a92" stroke-width=".7"')
      + P('M0-11C4-6 4 8 3 12H-3C-4 8-4-6 0-11Z', 'fill="#a07850"') + Rr(-3.5, -2, 7, 2, 'fill="#e8e1cf"') + Rr(-3, 6, 6, 2, 'fill="#e8e1cf"') + '</g>';
    w += '<g transform="translate(250 655) rotate(68)">' + P(kb, bs) + P(kb, 'fill="#d9783a"') + Us('pp', 0, 0, 0.9, ' fill="#3d5a6e"') + '</g>';
    [[455, 612], [474, 621], [640, 607]].forEach(function (q) { w += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3.6" fill="none" stroke="#fff" opacity=".6"/>' + C('rp-post', q[0], q[1], 1.4); });
    [[430, py, '#bf9148'], [437, py + 2, '#5d7fa3'], [700, py - 3, '#9a5d4a'], [507, 300, '#6f8f5a'], [330, 528, '#e0c068']].forEach(function (q) { w += Us('pp', q[0], q[1], 1, ' fill="' + q[2] + '"'); });
    h += w;
    svg.innerHTML = '<defs><radialGradient id="rp-gl"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="rp-wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb2d6"/><stop offset="1" stop-color="#1f6f95"/></linearGradient>'
      // тіні й фактури — напівпрозорі шари поверх кольору
      + '<radialGradient id="rp-shg"><stop offset=".45" stop-color="#0a1407" stop-opacity=".42"/><stop offset="1" stop-color="#0a1407" stop-opacity="0"/></radialGradient>'
      + '<clipPath id="rp-lk"><path d="M0 590 C 250 576 750 602 1000 584 V 700 H 0 Z"/></clipPath>'
      + '<pattern id="rp-gp" width="14" height="12" patternUnits="userSpaceOnUse"><path d="M2 9l.6-2.2M8 4l-.5-2M11 11l.7-2" stroke="#7fb05a" opacity=".14" stroke-width=".7"/><circle cx="5" cy="2" r=".8" fill="#1e3317" opacity=".35"/></pattern>'
      + '<pattern id="rp-th" width="6" height="2.6" patternUnits="userSpaceOnUse"><path d="M0 2.3h6" stroke="#1c120b" opacity=".35" stroke-width=".5"/></pattern>'
      + '<pattern id="rp-tv" width="2.6" height="6" patternUnits="userSpaceOnUse"><path d="M2.3 0v6" stroke="#1c120b" opacity=".35" stroke-width=".5"/></pattern>'
      + '<pattern id="rp-wg" width="30" height="4" patternUnits="userSpaceOnUse"><path d="M0 1.2h12M16 1.2h14M0 3.1h6M10 3.1h20" stroke="#3a2614" opacity=".35" stroke-width=".4"/></pattern>'
      + '<pattern id="rp-cp" width="9" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".5" fill="#fff" opacity=".1"/><circle cx="6" cy="4.5" r=".6" fill="#000" opacity=".14"/></pattern>'
      + '<pattern id="rp-sp" width="7" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#a88f5c" opacity=".35"/><circle cx="4.5" cy="4" r=".5" fill="#fff8e0" opacity=".4"/></pattern>'
      + '<pattern id="rp-gq" width="190" height="150" patternUnits="userSpaceOnUse"><ellipse cx="45" cy="35" rx="42" ry="26" fill="#86b25c" opacity=".09"/><ellipse cx="135" cy="100" rx="52" ry="30" fill="#162a10" opacity=".13"/><ellipse cx="140" cy="25" rx="24" ry="16" fill="#9cc46c" opacity=".07"/><ellipse cx="30" cy="120" rx="30" ry="19" fill="#162a10" opacity=".09"/></pattern>'
      + '<pattern id="rp-sv" width="4" height="9" patternUnits="userSpaceOnUse"><path d="M.5 0v9" stroke="#c7d0d6" opacity=".28" stroke-width=".6"/></pattern>'
      + '<pattern id="rp-sn" width="9" height="4" patternUnits="userSpaceOnUse"><path d="M0 .5h9" stroke="#c7d0d6" opacity=".22" stroke-width=".6"/></pattern>'
      + '<linearGradient id="rp-ws" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c8150" stop-opacity="0"/><stop offset="1" stop-color="#9c8150" stop-opacity=".5"/></linearGradient>'
      + '<g id="rp-ta"><circle cx="4" cy="6" r="15" fill="url(#rp-shg)"/>' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<circle cx="' + n1(7.5 * Math.cos(i * .9)) + '" cy="' + n1(7.5 * Math.sin(i * .9)) + '" r="5" fill="#29501f"/>'; }).join('')
      + '<circle r="9" fill="#2f5a25"/><circle cx="-2.5" cy="-2.5" r="6.5" fill="#3f7431"/><circle cx="-4.5" cy="-5" r="3" fill="#5e9a47"/></g>'
      + '<g id="rp-tb"><circle cx="4" cy="6" r="13" fill="url(#rp-shg)"/>' + star(8, 11, 6.5, 'fill="#1f4024"') + star(8, 7, 4, 'fill="#2f5d33" transform="rotate(22)"') + '<circle cx="-1" cy="-1" r="2" fill="#5a8a4c"/></g>'
      + '<g id="rp-tc"><circle cx="3" cy="5" r="11" fill="url(#rp-shg)"/><circle r="8" fill="#4f8a3a"/><circle cx="3" cy="2.5" r="4" fill="#447a32"/><circle cx="-2" cy="-2" r="4.6" fill="#6aa64e"/><circle cx="-3.6" cy="-4" r="2" fill="#94c76c"/></g>'
      + '<g id="rp-bu"><circle cx="2" cy="3" r="7" fill="url(#rp-shg)"/><circle cx="-2.6" r="3.3" fill="#36622a"/><circle cx="2.6" cy=".6" r="3.3" fill="#3d6b2e"/><circle cy="-2.4" r="3.2" fill="#4a7c37"/><circle cx="-1" cy="-3.2" r="1.4" fill="#6ea04f"/><circle cx="2" cy="-1" r=".7" fill="#ead9a2"/><circle cx="-3" cy="1" r=".6" fill="#ead9a2"/></g>'
      + '<g id="rp-pp"><ellipse cx="1.4" cy="1.8" rx="3.3" ry="2.1" fill="#000" opacity=".22"/><ellipse rx="3.1" ry="1.9"/><circle r="1.35" fill="#4a3426"/></g>'
      + '<g id="rp-pl"><ellipse cx="1" cy="1.5" rx="1.9" ry="4.4" fill="#000" opacity=".18"/><ellipse cy="1" rx="1.7" ry="4.1"/><circle cy="-3.9" r="1.3" fill="#4a3426"/></g>'
      + '<g id="rp-ls"><rect x="1.4" y="1.8" width="6" height="13" rx="1.5" fill="#000" opacity=".2"/><rect width="6" height="13" rx="1.5" fill="#f4f1e8" stroke="#b8ad95" stroke-width=".4"/><rect width="6" height="4" rx="1.5" fill="#e0d9c6"/><rect x="1" y="5" width="4" height="7" rx=".8"/></g>'
      + '<g id="rp-ub"><circle cx="3" cy="4" r="9" fill="#000" opacity=".2"/><circle r="9"/>' + P([0, 2, 4, 6].map(function (k) { var a = k * Math.PI / 4, b = a + Math.PI / 4; return 'M0 0L' + n1(9 * Math.cos(a)) + ' ' + n1(9 * Math.sin(a)) + 'L' + n1(9 * Math.cos(b)) + ' ' + n1(9 * Math.sin(b)) + 'Z'; }).join(''), 'fill="#fff" opacity=".6"') + '<circle r="1.2" fill="#5b3c22"/></g>'
      + '<g id="rp-lp"><circle r="6" fill="url(#rp-gl)" opacity=".4"/><circle r="1.9" fill="#34312c"/><circle r="1" fill="#fff3c4"/></g>'
      + '<pattern id="rp-rp" width="46" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)"><path d="M2 8q6-4 12 0M24 18q7-4 14 0" stroke="#e6f8ff" stroke-width=".8" fill="none" opacity=".22"/></pattern></defs>' + h;
    [].forEach.call(svg.querySelectorAll('.rp-o'), function (g) {
      g.addEventListener('click', function () { open(g); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(g); } });
    });
    // телефон: тап поруч (≤24 px) відкриває найближчий обʼєкт — зона дотику ≥44 px без зміни малюнка
    svg.addEventListener('click', function (ev) {
      if (focus || (ev.target.closest && ev.target.closest('.rp-o'))) return;
      var best = null, bd = 24;
      [].forEach.call(svg.querySelectorAll('.rp-o'), function (g) {
        var r = g.getBoundingClientRect(), d = Math.hypot(Math.max(r.left - ev.clientX, 0, ev.clientX - r.right), Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom));
        if (d < bd) { bd = d; best = g; }
      });
      if (best) open(best);
    });
  }
  /* камера */
  function tween() {
    raf = 0; var dn = 0;
    for (var j = 0; j < 4; j++) { var dv = vbT[j] - vb[j]; if (Math.abs(dv) > 0.4) { vb[j] += dv * 0.12; dn = 1; } else vb[j] = vbT[j]; }
    svg.setAttribute('viewBox', vb.map(function (v) { return v.toFixed(1); }).join(' '));
    if (dn && !RM) raf = W.requestAnimationFrame(tween);
  }
  function cam(t) { vbT = t; if (RM) { vb = t.slice(); } if (!raf) tween(); }
  function open(g, auto) {
    var b = g.getBBox(), pad = 30, w = Math.max(b.width + pad * 2, 180), h = w * 0.7;
    if (b.height + pad * 2 > h) { h = b.height + pad * 2; w = h / 0.7; }
    if (w > 1000) { w = 1000; h = 700; } // не ширше генплану — без порожнечі за краєм
    focus = g; svg.classList.add('rp-zoom'); [].forEach.call(svg.querySelectorAll('.rp-o'), function (x) { x.classList.toggle('rp-act', x === g); });
    cam([Math.max(0, Math.min(1000 - w, b.x + b.width / 2 - w / 2)), Math.max(0, Math.min(700 - h, b.y + b.height / 2 - h / 2)), w, h]); // кадр — у межах генплану
    stage = 0; show(); back.hidden = false; nav.hidden = false;
    clearInterval(timer);
    if (auto === 2) { if (!RM) timer = setInterval(function () { if (stage < steps().length - 1) { stage++; show(); } else clearInterval(timer); }, 950); return; } // жест / номер етапу: етапи обʼєкта програються самі, без фокуса
    if (auto) return; // автопрогравання (casAuto): етапи — його кроками, без фокуса й аналітики
    tourEnd = false;
    if (!RM) timer = setInterval(function () { if (stage < steps().length - 1) { stage++; show(); } else clearInterval(timer); }, 950);
    cl('rp_obj', g.getAttribute('data-o'));
    back.focus({ preventScroll: true });
  }
  function steps() { return focus ? (D.st[focus.getAttribute('data-o')] || []) : []; }
  function show() {
    var st = steps();
    [].forEach.call(focus.querySelectorAll('.rp-p'), function (p) { p.classList.toggle('rp-off', +p.getAttribute('data-s') > stage || p.classList.contains('rp-rf')); }); // дах корпусу — лише на генплані
    cap.innerHTML = '<b>' + esc(D.o[focus.getAttribute('data-o')]) + '</b><span>' + esc(U.step) + ' ' + (stage + 1) + ' ' + esc(U.of) + ' ' + st.length + ': ' + esc(st[stage] || '') + '</span>';
    side();
  }
  function close(auto) {
    clearInterval(timer);
    if (focus) [].forEach.call(focus.querySelectorAll('.rp-p'), function (p) { p.classList.remove('rp-off'); });
    var f = focus; focus = null; svg.classList.remove('rp-zoom'); [].forEach.call(svg.querySelectorAll('.rp-act'), function (x) { x.classList.remove('rp-act'); });
    cam([0, 0, 1000, 700]); back.hidden = true; nav.hidden = true; cap.innerHTML = (CMP ? '<b>' + esc(planT()) + '</b>' : '') + '<span>' + esc(U.tap) + '</span>'; side();
    if (f && !auto) f.focus({ preventScroll: true });
  }
  function planT() { return sec.querySelector('h2').textContent.split(/ [—–-] /)[0]; }
  /* ціни */
  function price() {
    var cab = cfg.n * cfg.a, rate = cfg.l ? 1100 : 600, area = cab + cfg.r;
    var rows = [[U.r_cab.replace('{n}', cfg.n).replace('{a}', cfg.a), cab * rate], [U.r_main.replace('{a}', cfg.r), cfg.r * rate],
      [U.r_dz, Math.max(area * 30, 2500)], [U.r_mb, area * 250], [U.r_land.replace('{s}', cfg.s), cfg.s * 50]];
    var sum = rows.reduce(function (a, r) { return a + r[1]; }, 0);
    if (estEl) estEl.textContent = U.total + ' ' + money(sum) + ' ' + U.plus;
    panel.innerHTML = '<p class="rp-ph">' + esc(U.prices) + '</p><dl>' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + money(r[1]) + '</dd></div>'; }).join('')
      + '<div class="rp-q"><dt>' + esc(U.r_est) + '</dt><dd>' + esc(U.est) + '</dd></div></dl><p class="rp-sum">' + esc(U.total) + ' <b>' + money(sum) + '</b><br><span>' + esc(U.plus) + '</span></p><p class="rp-note">' + esc(U.note) + '</p>';
  }
  function seg(name, items, cur, fn) {
    var g = el('div', 'la-seg rp-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', name); g.appendChild(el('span', 'la-lab', esc(name)));
    items.forEach(function (t, i) {
      var b = el('button', '', esc(t)); b.type = 'button'; b.setAttribute('aria-pressed', i === cur ? 'true' : 'false');
      b.addEventListener('click', function () { [].forEach.call(g.querySelectorAll('button'), function (x, j) { x.setAttribute('aria-pressed', j === i ? 'true' : 'false'); }); fn(i); });
      g.appendChild(b);
    });
    return g;
  }
  var back, nav, tourI = 0, tourEnd = false, estEl = null;
  function enhance() {
    var w = sec.querySelector('.w'), list = sec.querySelector('.rp-list');
    var ctl = el('div', 'la-ctl rp-ctl'), upd = function () { if (focus) close(); layout(); price(); };
    ctl.appendChild(seg(U.cab, ['4', '8', '12'], 1, function (i) { cfg.n = [4, 8, 12][i]; upd(); cl('rp_n', cfg.n); }));
    ctl.appendChild(seg(U.area, ['30 m²', '45 m²', '60 m²'], 1, function (i) { cfg.a = [30, 45, 60][i]; upd(); }));
    ctl.appendChild(seg(U.main, ['150 m²', '200 m²', '300 m²'], 1, function (i) { cfg.r = [150, 200, 300][i]; upd(); }));
    ctl.appendChild(seg(U.site + ', ' + U.unit, ['50', '100', '200'], 1, function (i) { cfg.s = [50, 100, 200][i]; price(); }));
    ctl.appendChild(seg(U.lvl, U.lvls, 1, function (i) { cfg.l = i; price(); }));
    var grid = el('div', 'rp-grid'), stage0 = el('div', 'rp-stage');
    svg = d.createElementNS(NS, 'svg'); svg.setAttribute('class', 'rp-svg'); svg.setAttribute('viewBox', '0 0 1000 700'); svg.setAttribute('aria-label', sec.querySelector('h2').textContent);
    cap = el('p', 'rp-cap', '<span>' + esc(U.tap) + '</span>'); cap.setAttribute('aria-live', 'polite');
    back = el('button', 'btn rp-back', esc(U.back)); back.type = 'button'; back.hidden = true; back.addEventListener('click', function () { close(); });
    nav = el('div', 'la-nav rp-nav'); nav.hidden = true;
    var pb = el('button', '', '‹') /* RTL: Unicode сам віддзеркалює ‹ › (Bidi_Mirrored), тож символи ті самі, що в LTR */, nb = el('button', '', '›');
    pb.type = nb.type = 'button'; pb.setAttribute('aria-label', U.step + ' −'); nb.setAttribute('aria-label', U.step + ' +');
    pb.addEventListener('click', function () { clearInterval(timer); if (stage > 0) { stage--; show(); } });
    nb.addEventListener('click', function () { clearInterval(timer); if (stage < steps().length - 1) { stage++; show(); } });
    nav.appendChild(pb); nav.appendChild(nb);
    var tools = el('div', 'rp-tools'), apw = el('div', 'la-nav rp-apw'); tools.appendChild(back); tools.appendChild(nav); tools.appendChild(apw);
    stage0.appendChild(svg); stage0.appendChild(cap); stage0.appendChild(tools);
    panel = el('div', 'rp-panel');
    var cta = el('a', 'btn main rp-cta', esc(U.cta)); cta.href = '#zayavka';
    cta.addEventListener('click', function () {
      var f = d.getElementById('of'), m = d.getElementById('oMsg');
      var msg = U.msg.replace('{n}', cfg.n).replace('{a}', cfg.a).replace('{r}', cfg.r).replace('{s}', cfg.s).replace('{l}', U.lvls[cfg.l]);
      if (f) f.setAttribute('data-service', U.svc);
      if (m) { m.value = msg; var det = m.closest('details'); if (det) det.open = true; }
      setTimeout(function () { var ph = d.getElementById('oPhone'); if (ph) ph.focus({ preventScroll: true }); }, 500);
      cl('rp_cta', cfg.n + 'x' + cfg.a + '/' + cfg.r + '/' + cfg.s + '/' + cfg.l);
    });
    var side = el('div', 'rp-side'); side.appendChild(panel); side.appendChild(cta);
    grid.appendChild(stage0); grid.appendChild(side);
    list.parentNode.insertBefore(ctl, list); list.parentNode.insertBefore(grid, list);
    list.classList.add('la-sr');
    CMP = !RM && !!d.querySelector('.hx-home'); // головні: єдиний вигляд компактних сцен — кадр + панель casSide (Михайло 08.11.2026)
    var auHost = apw;
    if (CMP && W.casSide) {
      sec.classList.add('la-cmp', 'rp-cmp'); stage0.classList.add('la-stick');
      var sn = el('div', 'la-nav'), sp = el('button', '', '‹'), sx = el('button', '', '›');
      sp.type = sx.type = 'button'; sp.setAttribute('aria-label', U.step + ' −'); sx.setAttribute('aria-label', U.step + ' +');
      sp.addEventListener('click', function () { goStop(curStop() - 1); }); sx.addEventListener('click', function () { goStop(curStop() + 1); });
      sn.appendChild(sp); sn.appendChild(sx); auHost = sn;
      var foot = el('div', 'la-foot'); estEl = el('p', 'la-est'); foot.appendChild(estEl); foot.appendChild(cta);
      sdU = W.casSide({ stick: stage0, cap: cap, nav: sn, foot: foot, n: NST, go: goStop, title: function (i) { return i < 0 ? sec.querySelector('h2').textContent : i ? D.o[STOPS[i - 1]] : planT(); } });
      cap.innerHTML = '<b>' + esc(planT()) + '</b><span>' + esc(U.tap) + '</span>';
    }
    sec.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && focus) close(); });
    sec.classList.add('rp-on');
    layout(); price();
    // автопрогравання: сцена в кадрі й людина не чіпає — по черзі обʼєкти генплану з етапами будівництва, наприкінці — назад до генплану й «Ще раз»
    if (W.casAuto) W.casAuto({ root: stage0, view: svg, host: auHost, atEnd: function () { return tourEnd; },
      restart: function () { tourEnd = false; if (focus) close(1); },
      step: function () { // по черзі зупинки (обʼєкт кожного типу) з етапами будівництва; наприкінці — назад до генплану й «Ще раз»
        clearInterval(timer);
        if (focus && stage < steps().length - 1) { stage++; show(); return true; }
        tourI = curStop() + 1;
        if (tourI >= NST) { if (focus) close(1); tourEnd = true; return false; }
        open(svg.querySelector('.rp-o[data-o="' + STOPS[tourI - 1] + '"]'), 1); return true;
      } });
    // усі сторінки: колесо над кадром, клік збоку, свайп, ←/→ по відкритому обʼєкту — його етапи (без обʼєкта жести не перехоплюються)
    // жести (усі сторінки): колесо над генпланом, клік збоку, свайп, ←/→ — зупинки: генплан → обʼєкти по черзі (етапи обʼєкта програються самі)
    if (W.casGest) W.casGest({ root: stage0, view: svg, go: function (i) { clearInterval(timer); goStop(i); }, cur: curStop, n: NST,
      hint: CMP ? sdHost() : null, before: CMP ? sdNav() : null });
  }
  function sdHost() { return sec.querySelector('.sc-side'); }
  function sdNav() { return sec.querySelector('.sc-side .la-nav'); }
  function css() {
    return new Promise(function (res) {
      // збираємо лише після свого CSS і scene-ui.v1.css (<link> міг бути доданий, але ще вантажитись) — інакше CLS до 1.0
      var href = sec.getAttribute('data-css'), ls = [], n, l = href && d.querySelector('link[href="' + href + '"]');
      if (href && !l) { l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; d.head.appendChild(l); }
      if (l) ls.push(l);
      var u = d.querySelector('link[href^="/assets/scene-ui."]'); if (u) ls.push(u);
      n = ls.length; if (!n) return res();
      function one() { if (!--n) res(); }
      ls.forEach(function (x) { if (x.sheet) return one(); var f = 0, k = function () { if (!f) { f = 1; one(); } }; x.addEventListener('load', k); x.addEventListener('error', k); setTimeout(k, 8000); });
    });
  }
  // блок вище екрана стискається: тримаємо вміст на місці самі, якщо скрол-якоріння не спрацює (Safari, низ сторінки) — інакше CLS до 1.0
  function keep() { var b0 = sec.getBoundingClientRect().bottom, up = b0 <= 0; enhance(); if (up) { var dy = sec.getBoundingClientRect().bottom - b0; if (Math.abs(dy) > 1) { var hs = d.documentElement.style; hs.scrollBehavior = 'auto'; W.scrollBy(0, dy); hs.scrollBehavior = ''; } } } // без smooth з CSS — інакше зсув видно
  function inView() { var r = sec.getBoundingClientRect(); return r.top < 0 && r.bottom > 0; } // людина всередині блоку; верх блоку в кадрі — збираємо одразу (зсуву над ним немає)
  css().then(function () {
    if (!inView() || sec.hasAttribute('data-sw') || !('IntersectionObserver' in W)) return keep(); // data-sw — показана перемикачем сцен на місці: одразу
    var o = new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) { o.disconnect(); keep(); } });
    o.observe(sec);
  });
})();
