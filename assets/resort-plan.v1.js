/* «Комплекс відпочинку» (tools/site/resort.py): генплан; клік/Enter по обʼєкту — zoom і етапи будівництва; ціни — ставки CLAUDE.md × площа.
   CLS 0 — збирається поза кадром; reduced-motion — статично; Esc — до генплану. */
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
  // зупинки: 0 — генплан, далі обʼєкт кожного типу
  var STOPS = ['cabin', 'main', 'pool', 'pergola', 'relax', 'beach', 'bar', 'tech'], NST = STOPS.length + 1, sdU = null, CMP = false;
  function curStop() { return focus ? STOPS.indexOf(focus.getAttribute('data-o')) + 1 : 0; }
  function goStop(i) { i = Math.max(0, Math.min(NST - 1, i)); if (!i) { if (focus) close(1); return; } var g = svg.querySelector('.rp-o[data-o="' + STOPS[i - 1] + '"]'); if (g) open(g, 2); }
  function side() { if (!sdU) return; var k = curStop(), L = steps().length || 1; sdU(k, k ? ((k - 1) + (stage + 1) / L) / (NST - 1) : 0); }
  function cl(ev, v) { try { if (W.clarity) { W.clarity('event', ev); if (v) W.clarity('set', ev, v); } } catch (e) { } }
  function money(n) { return window.casUsd(n, lang); } // формат мови — site-chrome.v1.js ($1 100; en — $1,100)
  function R(c, x, y, w, h, rx) { return '<rect class="' + c + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function C(c, x, y, r) { return '<circle class="' + c + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>'; }
  function Pth(c, dd) { return '<path class="' + c + '" d="' + dd + '"/>'; }
  function G(st, h, c) { return '<g class="rp-p' + (c || '') + '" data-s="' + st + '">' + h + '</g>'; }
  /* обʼєкти — косокутна аксонометрія: земля — план, висота z — вліво-вгору (видно пд. і сх. стіни) */
  function n1(v) { return Math.round(v * 10) / 10; }
  function Us(id, x, y, sc, a) { return '<use href="#rp-' + id + '" transform="translate(' + n1(x) + ' ' + n1(y) + ')' + (sc && sc !== 1 ? ' scale(' + sc + ')' : '') + '"' + (a || '') + '/>'; }
  function P(dd, a) { return '<path d="' + dd + '" ' + a + '/>'; }
  function poly(q) { return 'M' + q.map(function (p) { return n1(p[0]) + ' ' + n1(p[1]); }).join('L') + 'Z'; }
  function Rr(x, y, w, h, a) { return '<rect x="' + n1(x) + '" y="' + n1(y) + '" width="' + n1(w) + '" height="' + n1(h) + '" ' + a + '/>'; }
  function star(k, ro, ri, f) { var q = []; for (var i = 0; i < k * 2; i++) { var r = i % 2 ? ri : ro, t = Math.PI * i / k; q.push([r * Math.cos(t), r * Math.sin(t)]); } return P(poly(q), f); }
  function cub(a, b, c, e, t) { var u = 1 - t; return [0, 1].map(function (j) { return u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * e[j]; }); }
  var KX = -.6, KY = -.72, E = ' stroke="#1d1610" stroke-width=".4" stroke-linejoin="round"';
  function pj(p) { var z = p[2] || 0; return [p[0] + KX * z, p[1] + KY * z]; }
  function hx(c, k) { return '#' + [1, 3, 5].map(function (i) { var v = Math.min(255, Math.round(parseInt(c.substr(i, 2), 16) * k)); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function F(q, c, a) { return P(poly(q.map(pj)), 'fill="' + c + '"' + (a || '')); }
  function V(x, y, dx, dy, z, hz, c, a) { return F([[x, y, z], [x + dx, y + dy, z], [x + dx, y + dy, z + hz], [x, y, z + hz]], c, a); }
  function T(x, y, w, h, z, c, a) { return F([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]], c, a); }
  function L3(a, b, s) { a = pj(a); b = pj(b); return P('M' + n1(a[0]) + ' ' + n1(a[1]) + 'L' + n1(b[0]) + ' ' + n1(b[1]), s); }
  function ci(p, r, c, a) { p = pj(p); return '<circle cx="' + n1(p[0]) + '" cy="' + n1(p[1]) + '" r="' + n1(r) + '" fill="' + c + '"' + (a || '') + '/>'; }
  // t — фактура стін
  function box(x, y, w, h, z0, z1, c, t) { var k = z1 - z0, o = V(x, y + h, w, 0, z0, k, hx(c, .84), E) + V(x + w, y, 0, h, z0, k, hx(c, .64), E); return o + (t ? V(x, y + h, w, 0, z0, k, t) + V(x + w, y, 0, h, z0, k, t) : '') + T(x, y, w, h, z1, c, E); }
  function sd(x, y, w, h, z) { var a = .55 * z, b = .3 * z; return P(poly([[x, y], [x + w, y], [x + w + a, y + b], [x + w + a, y + h + b], [x + a, y + h + b], [x, y + h]]), 'fill="#08120a" opacity=".32"'); }
  function cyl(x, y, r, z0, z1, c, t) { var k = r / .94, nx = -KY * k, ny = KX * k; return ci([x, y, z0], r, hx(c, .6)) + F([[x + nx, y + ny, z0], [x + nx, y + ny, z1], [x - nx, y - ny, z1], [x - nx, y - ny, z0]], hx(c, .74)) + ci([x, y, z1], r, t || c, E); }
  // вікно з рамою вздовж (dx, dy)
  function wn(x, y, dx, dy, z, hz, c) { return V(x, y, dx, dy, z, hz, '#2e241b') + V(x + dx * .14, y + dy * .14, dx * .72, dy * .72, z + hz * .12, hz * .76, c || '#9fc6d4') + L3([x + dx / 2, y + dy / 2, z], [x + dx / 2, y + dy / 2, z + hz], 'stroke="#2e241b" stroke-width=".7"'); }
  // i — відступ гребеня (0 — двосхилий, фронтон g)
  function roof(x, y, w, h, z, r, i, c, g) {
    var m = y + h / 2, a = x + i, b = x + w - i, Z = z + r, q = [[x, y + h, z], [x + w, y + h, z], [b, m, Z], [a, m, Z]];
    return F([[x, y, z], [x + w, y, z], [b, m, Z], [a, m, Z]], hx(c, .72), E) + F([[x, y, z], [a, m, Z], [x, y + h, z]], hx(c, 1.12), E) + F([[x + w, y, z], [b, m, Z], [x + w, y + h, z]], hx(g || c, .62), E)
      + F(q, c, E) + F(q, 'url(#rp-th)') + L3([a, m, Z], [b, m, Z], 'stroke="#241a12" stroke-width="1.3"');
  }

  /* частини обʼєктів за етапами (st[тип]) */
  function cabin(x, y, s) {
    var H = s * .36, r = s * .32, z = 2.5, wc = '#c49a6c', d = s * .32, o = G(0, sd(x - 3, y - 3, s + 6, s + 6, 3) + box(x - 2, y - 2, s + 4, s + 4, 0, z, '#a59d8e', 'url(#rp-cp)')), f = '';
    [[0, 0], [1, 0], [0, 1], [1, 1], [.5, 1], [1, .5]].forEach(function (q) { f += box(x + q[0] * (s - 3), y + q[1] * (s - 3), 3, 3, z, z + H, '#8a6a46'); });
    o += G(1, f + box(x, y, s, 2, z + H - 2, z + H, '#7a5a3a') + box(x + s - 2, y, 2, s, z + H - 2, z + H, '#7a5a3a') + box(x, y + s - 2, s, 2, z + H - 2, z + H, '#7a5a3a'));
    o += G(2, sd(x, y, s + 4, s, H + r) + box(x, y, s, s, z, z + H, wc, 'url(#rp-wg)') + roof(x - 3, y - 3, s + 6, s + 6, z + H - 1, r, 0, '#5d4a3a', wc) + box(x + s * .62, y + s * .26, 4, 4, z + H + r * .6, z + H + r * 1.2, '#8a7666'));
    var t = box(x, y + s, s, d, 0, 2, '#a07850') + T(x, y + s, s, d, 2, 'url(#rp-tv)'), k;
    for (k = 0; k < 5; k++) t += L3([x + s * k / 4, y + s + d, 2], [x + s * k / 4, y + s + d, 7], 'stroke="#5b3c22" stroke-width="1.1"');
    t += L3([x, y + s + d, 7], [x + s, y + s + d, 7], 'stroke="#7a5233" stroke-width="1.4"') + box(x + s * .08, y + s + 3, 5, d - 5, 2, 3.5, '#f2efe6') + box(x + s * .26, y + s + 3, 5, d - 5, 2, 3.5, '#f2efe6') + cyl(x + s * .75, y + s + d / 2, 2.6, 2, 5, '#6b4a2b');
    o += G(3, t);
    o += G(4, ci([x + s / 2, y + s * 1.15], s * .4, 'url(#rp-gl)') + wn(x + s * .1, y + s, s * .24, 0, z + H * .3, H * .5, '#ffd98a') + V(x + s * .42, y + s, s * .16, 0, z, H * .78, '#5b3c22', E) + wn(x + s * .66, y + s, s * .24, 0, z + H * .3, H * .5, '#ffd98a')
      + wn(x + s, y + s * .25, 0, s * .3, z + H * .3, H * .5, '#ffd98a') + ci([x + s / 2, y + s, z + H * .9], 1.5, '#fff3c4'));
    return o;
  }
  function mainB(x, y, w, h) {
    var H = 22, z = 2, i, j, k = '', t = '', p = '', u = '', wc = '#e2dacb', o = sd(x, y, w, h, H + 14) + box(x - 2, y - 2, w + 4, h + 4, 0, z, '#8f8a80', 'url(#rp-cp)');
    ['#5aa0d8', '#e0503c', '#f0b44c'].forEach(function (c, n) { o += L3([x, y + h * (.25 + n * .25), z], [x + w, y + h * (.25 + n * .25), z], 'stroke="' + c + '" stroke-width="2.4"'); });
    o += box(x, y, w, 3, z, H, wc) + box(x, y, 3, h, z, H, wc);
    for (i = 0; i < 5; i++) o += wn(x + 8 + i * w * .19, y + 3, w * .1, 0, z + 6, 10);
    for (i = 0; i < 4; i++) for (j = 0; j < 3; j++) t += cyl(x + w * (.1 + i * .13), y + h * (.25 + j * .26), 3.6, z, z + 4.5, '#6b4a2b');
    k += T(x + w * .62, y + 3, w * .38, h - 3, z, '#e4e2dc') + T(x + w * .62, y + 3, w * .38, h - 3, z, 'url(#rp-th)') + box(x + w * .62, y + 3, 2, h - 3, z, H * .6, wc);
    for (i = 0; i < 3; i++) k += box(x + w * .7, y + 9 + i * (h - 16) / 3, w * .24, (h - 16) / 3 - 4, z, z + 6, '#9aa3a8');
    for (i = 0; i < 5; i++) p += L3([x + w * (.1 + i * .2), y + h + 4 + h * .16, 2], [x + w * (.1 + i * .2), y + h + 4 + h * .16, 13], 'stroke="#5b3c22" stroke-width="1.2"') + Us('ub', x + w * (.1 + i * .2) + KX * 13, y + h + 4 + h * .16 + KY * 13, .75, ' fill="#f2efe6"');
    var a = x + h / 2, b = x + w - h / 2, Y = y + h + 4, D = h / 2 + 4, y0, y1, x0, x1, zs = function (v) { return H + 16 * (Y - v) / D; };
    for (i = 0; i < 6; i++) u += wn(x + 6 + i * (w - 12) / 6, y + h, (w - 12) / 6 - 5, 0, z + 5, 11);
    u = box(x, y, w, h, z, H, wc, 'url(#rp-cp)') + u + wn(x + w, y + h * .2, 0, h * .25, z + 5, 11) + wn(x + w, y + h * .55, 0, h * .25, z + 5, 11) + roof(x - 4, y - 4, w + 8, h + 8, H, 16, D, '#6a7278');
    for (i = 0; i < 4; i++) for (j = 0; j < 2; j++) { y0 = y + h - 4 - j * h / 5; y1 = y0 - h / 5 + 3; x0 = a + (b - a) * i / 4 + 1; x1 = x0 + (b - a) / 4 - 2; u += F([[x0, y0, zs(y0)], [x1, y0, zs(y0)], [x1, y1, zs(y1)], [x0, y1, zs(y1)]], '#1f3550', ' stroke="#7d97b3" stroke-width=".5"'); }
    return G(0, o) + G(1, T(x + 3, y + 3, w * .59, h - 3, z, '#c8b08a') + T(x + 3, y + 3, w * .59, h - 3, z, 'url(#rp-wg)') + t) + G(2, k)
      + G(3, box(x - 4, y + h + 2, w + 8, h * .34, 0, 2, '#a07850') + T(x - 4, y + h + 2, w + 8, h * .34, 2, 'url(#rp-tv)') + p) + G(3, u, ' rp-rf'); // дах — лише на генплані, відкритий — розріз
  }
  function pergola(x, y, w, h) {
    var Z = 16, o = '', l = '', i;
    [[0, 0], [1, 0], [0, 1], [1, 1], [.5, 0], [.5, 1]].forEach(function (q) { o += box(x + q[0] * w - 2, y + q[1] * h - 2, 4, 4, 0, Z, '#5b3c22'); });
    for (i = 1; i < 12; i++) l += Rr(x + w * i / 12 + Z * .55, y + Z * .3, 2.4, h, 'fill="#08120a" opacity=".22"') + box(x + w * i / 12 - 1, y - 3, 2, h + 6, Z + 3, Z + 5, '#c9a57a');
    return G(0, o) + G(1, box(x - 4, y - 2, w + 8, 3, Z, Z + 3, '#7a5233') + box(x - 4, y + h - 1, w + 8, 3, Z, Z + 3, '#7a5233')) + G(2, l)
      + G(3, ci([x + w / 2, y + h / 2], w * .45, 'url(#rp-gl)') + L3([x + w / 2, y + h / 2, Z + 3], [x + w / 2, y + h / 2, 9], 'stroke="#34312c" stroke-width=".6"') + ci([x + w / 2, y + h / 2, 9], 2.2, '#fff3c4'));
  }
  function bar(x, y, w, h) {
    var Z = 18, o = G(0, sd(x - 4, y - 4, w + 8, h + 8, 3) + box(x - 4, y - 4, w + 8, h + 8, 0, 2, '#a59d8e', 'url(#rp-cp)')), p = '', s = '', i;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (q) { p += box(x + q[0] * w - 1.5, y + q[1] * h - 1.5, 3, 3, 2, Z, '#6b4a2b'); }); o += G(1, p);
    for (i = 0; i < 4; i++) s += cyl(x + 12 + (w - 24) * i / 3, y + h - 2, 2.2, 2, 6.5, '#3a2c22') + box(x + 10 + i * 13, y + 4, 3, 2, 10, 14, ['#3f7a4a', '#a0442f', '#d8b25a', '#4f6fa0'][i]);
    o += G(2, box(x + 6, y + 3, w - 12, 4, 2, 10, '#5b3c22') + box(x + 6, y + h - 12, w - 12, 5, 2, 9, '#7a5233') + s);
    var q = [[x - 6, y - 6, Z + 7], [x + w + 6, y - 6, Z + 7], [x + w + 6, y + h * .5, Z], [x - 6, y + h * .5, Z]];
    o += G(3, F(q, '#d8c39a', E) + F(q, 'url(#rp-tv)') + V(x - 6, y + h * .5, w + 12, 0, Z - 1.5, 1.5, '#a8925f'));
    for (s = '', i = 0; i < 9; i++) s += ci([x - 4 + (w + 8) * i / 8, y + h, Z - 2 - Math.sin(i * 1.1) * 1.4], 1.6, '#ffe9a8');
    return o + G(4, ci([x + w / 2, y + h], w * .5, 'url(#rp-gl)') + s);
  }
  function pool(x, y, w, h) {
    var dk = Rr(x - 16, y - 12, w + 32, h + 42, 'rx="6" fill="#d6c9ab"') + Rr(x - 16, y - 12, w + 32, h + 42, 'rx="6" class="rp-cc"'), q, a = 6, b = 11, t = '';
    for (q = 0; q < 6; q++) dk += Us('ls', x + 6 + q * 25 + (q > 2 ? 12 : 0), y + h + 14, 1, ' fill="' + ['#6fb7c9', '#e9b25a'][q % 2] + '"');
    dk += Us('ub', x + w / 2 + 3, y + h + 20, 1.05, ' fill="#bf9148"') + Us('pl', x + 9, y + h + 21, 1, ' fill="#c98a6a"') + Us('pl', x + 121, y + h + 21, 1, ' fill="#5d7fa3"');
    // видно пн. і зх. стінки й дно
    function pit(c, e) { return Rr(x - e, y - e, w + 2 * e, h + 2 * e, 'fill="' + hx(c, .55) + '"') + P(poly([[x, y], [x + w, y], [x + w, y + b], [x + a, y + b]]), 'fill="' + hx(c, .8) + '"') + P(poly([[x, y], [x + a, y + b], [x + a, y + h], [x, y + h]]), 'fill="' + hx(c, .66) + '"') + Rr(x + a, y + b, w - a, h - b, 'fill="' + c + '"'); }
    for (q = 1; q < 10; q++) t += 'M' + n1(x + w * q / 10) + ' ' + y + 'l' + a + ' ' + b + 'V' + (y + h);
    for (q = 1; q < 4; q++) t += 'M' + (x + a) + ' ' + n1(y + b + (h - b) * q / 4) + 'H' + (x + w);
    return G(4, dk) + G(0, pit('#7a5c3c', 6)) + G(1, pit('#a8a397', 3)) + G(2, pit('#5f8494', 3)) + G(3, pit('#cfe7ef', 3) + P(t, 'stroke="#8fbccb" stroke-width=".6" fill="none"'))
      + G(4, R('rp-water', x, y, w, h, 2) + R('rp-wtx', x, y, w, h, 2) + Rr(x - 3, y - 3, w + 6, h + 6, 'rx="3" fill="none" stroke="#efe9dc" stroke-width="4"') + Pth('rp-ripple', 'M' + (x + 10) + ' ' + (y + h * .4) + 'q 10 -5 20 0 t 20 0 t 20 0 t 20 0') + C('rp-ulight', x + 8, y + h / 2, 5) + C('rp-ulight', x + w - 8, y + h / 2, 5)
      + P(poly([[x + 4, y + 3], [x + w * .42, y + 3], [x + w * .2, y + h - 3], [x + 4, y + h - 3]]), 'fill="#fff" opacity=".13"') + L3([x + w - 20, y, 0], [x + w - 20, y, 9], 'stroke="#c7d0d6" stroke-width="1.4" fill="none"') + L3([x + w - 12, y, 0], [x + w - 12, y, 9], 'stroke="#c7d0d6" stroke-width="1.4"')
      + '<circle cx="' + n1(x + w * .66) + '" cy="' + n1(y + h * .62) + '" r="4.5" fill="none" stroke="#e6f8ff" opacity=".6"/>' + Us('pp', x + w * .66, y + h * .62, .9, ' fill="#3f8fb3"'));
  }
  function tech(x, y) {
    var o = G(0, sd(x, y, 58, 48, 22) + box(x, y, 58, 48, 0, 20, '#7a8086', 'url(#rp-tv)') + V(x + 8, y + 48, 10, 0, 0, 14, '#3a3a3a', E) + cyl(x + 46, y + 12, 3.2, 20, 34, '#9aa3a8') + cyl(x + 30, y + 22, 6, 20, 24, '#b04a3a'));
    o += G(1, sd(x + 66, y, 40, 48, 18) + box(x + 66, y, 40, 48, 0, 16, '#8d9296') + V(x + 76, y + 48, 12, 0, 6, 8, '#d1c46a', E) + L3([x + 86, y + 48, 0], [x + 86, y + 70, 0], 'class="rp-cable"'));
    o += G(2, box(x + 114, y, 86, 48, 0, 1.5, '#a59d8e') + cyl(x + 136, y + 24, 14, 1.5, 18, '#5a7f8a', '#7aa0aa') + cyl(x + 176, y + 24, 14, 1.5, 18, '#5a7f8a', '#7aa0aa') + L3([x + 150, y + 24, 8], [x + 162, y + 24, 8], 'stroke="#c7d0d6" stroke-width="2.4"'));
    var p = T(x + 94, y + 58, 106, 62, 0, '#4a4a4a'), i;
    o += G(3, sd(x, y + 58, 86, 62, 20) + box(x, y + 58, 86, 62, 0, 18, '#9a8f7e', 'url(#rp-tv)') + V(x + 22, y + 120, 42, 0, 0, 13, '#5f5a52', E) + V(x + 22, y + 120, 42, 0, 0, 13, 'url(#rp-th)'));
    for (i = 1; i < 5; i++) p += Pth('rp-stripe', 'M' + (x + 94 + 106 * i / 5) + ' ' + (y + 58) + 'v 34');
    [[100, '#c9c2b2'], [142, '#6f8fa8'], [163, '#a0442f']].forEach(function (c) { p += sd(x + c[0], y + 64, 14, 24, 6) + box(x + c[0], y + 64, 14, 24, .5, 5, c[1]) + box(x + c[0] + 1.5, y + 70, 11, 11, 5, 9, '#2b3640') + T(x + c[0] + 2, y + 70.5, 10, 10, 9.1, c[1]); });
    [[96, 60], [196, 60], [96, 92], [196, 92]].forEach(function (c) { p += box(x + c[0] - 1, y + c[1] - 1, 2, 2, 0, 16, '#5b5f63'); });
    return o + G(4, p + T(x + 94, y + 58, 104, 36, 16, '#b7c3c8', E + ' opacity=".55"')); // навіс напівпрозорий
  }
  function relax(x, y) {
    var o = G(0, C('rp-pad', x, y, 46) + C('rp-cc', x, y, 46)), l = '', i, a;
    for (i = 0; i < 4; i++) { a = x - 40 + i * 16; l += box(a, y - 28, 10, 16, 0, 2.5, '#f2efe6') + F([[a, y - 28, 2.5], [a + 10, y - 28, 2.5], [a + 10, y - 33, 9], [a, y - 33, 9]], '#e0d9c6', E); }
    o += G(1, l) + G(2, ci([x - 8, y + 12], 20, 'url(#rp-gl)') + cyl(x - 8, y + 12, 11, 0, 4, '#6b625a', '#3a332c') + ci([x - 8, y + 12, 4], 5, '#ff9b3d', ' class="rp-fire"'));
    return o + G(3, sd(x + 11, y + 1, 26, 26, 7) + cyl(x + 24, y + 14, 13, 0, 7, '#7a5a3a') + ci([x + 24, y + 14, 7], 10, '#7fd3ff'));
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
    LZ = []; // вміст обʼєктів — після землі, доріжок і дерев, по кілька на кадр (fillO): перша збірка без задач > 150 мс на телефоні
    function obj(type, idx, inner) { var k = objs.length; objs.push(type); LZ[k] = inner; return '<g class="rp-o" data-o="' + type + '" data-k="' + k + '" tabindex="0" role="button" aria-label="' + esc(D.o[type]) + (idx ? ' ' + idx : '') + '"></g>'; }
    h += '<rect class="rp-grass" x="0" y="0" width="1000" height="700"/><rect fill="url(#rp-gq)" width="1000" height="590"/><rect class="rp-gtx" x="0" y="0" width="1000" height="700"/>';
    var lk = 'M0 590 C 250 576 750 602 1000 584 V 700 H 0 Z', wv = ' q 25 -6 50 0' + ' t 50 0'.repeat(21);
    h += Pth('rp-lake', lk) + Pth('rp-lktx', lk) + '<g clip-path="url(#rp-lk)"><g class="rp-waves">' + Pth('rp-wave', 'M0 620' + wv) + Pth('rp-wave', 'M-25 652' + wv) + '</g></g>';
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
      + '<clipPath id="rp-lk"><path d="' + lk + '"/></clipPath>'
      + '<pattern id="rp-gp" width="14" height="12" patternUnits="userSpaceOnUse"><path d="M2 9l.6-2.2M8 4l-.5-2M11 11l.7-2" stroke="#7fb05a" opacity=".14" stroke-width=".7"/><circle cx="5" cy="2" r=".8" fill="#1e3317" opacity=".35"/></pattern>'
      + '<pattern id="rp-th" width="6" height="2.6" patternUnits="userSpaceOnUse"><path d="M0 2.3h6" stroke="#1c120b" opacity=".35" stroke-width=".5"/></pattern>'
      + '<pattern id="rp-tv" width="2.6" height="6" patternUnits="userSpaceOnUse"><path d="M2.3 0v6" stroke="#1c120b" opacity=".35" stroke-width=".5"/></pattern>'
      + '<pattern id="rp-wg" width="30" height="4" patternUnits="userSpaceOnUse"><path d="M0 1.2h12M16 1.2h14M0 3.1h6M10 3.1h20" stroke="#3a2614" opacity=".35" stroke-width=".4"/></pattern>'
      + '<pattern id="rp-cp" width="9" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".5" fill="#fff" opacity=".1"/><circle cx="6" cy="4.5" r=".6" fill="#000" opacity=".14"/></pattern>'
      + '<pattern id="rp-sp" width="7" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#a88f5c" opacity=".35"/><circle cx="4.5" cy="4" r=".5" fill="#fff8e0" opacity=".4"/></pattern>'
      + '<pattern id="rp-gq" width="190" height="150" patternUnits="userSpaceOnUse"><ellipse cx="45" cy="35" rx="42" ry="26" fill="#86b25c" opacity=".09"/><ellipse cx="135" cy="100" rx="52" ry="30" fill="#162a10" opacity=".13"/><ellipse cx="140" cy="25" rx="24" ry="16" fill="#9cc46c" opacity=".07"/><ellipse cx="30" cy="120" rx="30" ry="19" fill="#162a10" opacity=".09"/></pattern>'
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
    fillO();
    [].forEach.call(svg.querySelectorAll('.rp-o'), function (g) {
      g.addEventListener('click', function () { open(g); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(g); } });
    });
    // тап ≤24 px поруч — найближчий обʼєкт
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
  var LZ = [], lzT = 0;
  function fo(g) { var k = +g.getAttribute('data-k'); if (LZ[k] != null) { g.innerHTML = LZ[k]; LZ[k] = null; } }
  function fillO() { // порціями ≤ ~6 мс у простої, не більше порції на кадр; обʼєкт, який відкривають раніше, доливає open()
    var t = ++lzT, gs = svg.querySelectorAll('.rp-o'), j = 0;
    function nf(f) { W.requestAnimationFrame(function () { if (W.requestIdleCallback) W.requestIdleCallback(f, { timeout: 150 }); else setTimeout(f, 0); }); }
    function ch() { if (t !== lzT) return; var t0 = Date.now(); while (j < gs.length && Date.now() - t0 < 6) fo(gs[j++]); if (j < gs.length) nf(ch); }
    nf(ch);
  }
  function open(g, auto) {
    fo(g);
    var b = g.getBBox(), pad = 30, w = Math.max(b.width + pad * 2, 180), h = w * 0.7;
    if (b.height + pad * 2 > h) { h = b.height + pad * 2; w = h / 0.7; }
    if (w > 1000) { w = 1000; h = 700; } // не ширше генплану — без порожнечі за краєм
    focus = g; svg.classList.add('rp-zoom'); [].forEach.call(svg.querySelectorAll('.rp-o'), function (x) { x.classList.toggle('rp-act', x === g); });
    cam([Math.max(0, Math.min(1000 - w, b.x + b.width / 2 - w / 2)), Math.max(0, Math.min(700 - h, b.y + b.height / 2 - h / 2)), w, h]); // кадр — у межах генплану
    stage = 0; show(); back.hidden = false; nav.hidden = false;
    clearInterval(timer);
    if (auto === 2) { if (!RM) timer = setInterval(function () { if (stage < steps().length - 1) { stage++; show(); } else clearInterval(timer); }, 950); return; } // жест: етапи самі, без фокуса
    if (auto) return; // casAuto: без фокуса й аналітики
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
    var pb = el('button', '', '‹') /* RTL: ‹ › дзеркаляться самі */, nb = el('button', '', '›');
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
    CMP = !RM && !!d.querySelector('.hx-home'); // головні: кадр + casSide (08.11.2026)
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
    // автопрогравання: обʼєкти по черзі з етапами, наприкінці — генплан і «Ще раз»
    if (W.casAuto) W.casAuto({ root: stage0, view: svg, host: auHost, atEnd: function () { return tourEnd; },
      restart: function () { tourEnd = false; if (focus) close(1); },
      step: function () {
        clearInterval(timer);
        if (focus && stage < steps().length - 1) { stage++; show(); return true; }
        tourI = curStop() + 1;
        if (tourI >= NST) { if (focus) close(1); tourEnd = true; return false; }
        open(svg.querySelector('.rp-o[data-o="' + STOPS[tourI - 1] + '"]'), 1); return true;
      } });
    // жести: генплан → обʼєкти по черзі
    if (W.casGest) W.casGest({ root: stage0, view: svg, go: function (i) { clearInterval(timer); goStop(i); }, cur: curStop, n: NST,
      hint: CMP ? sdHost() : null, before: CMP ? sdNav() : null });
  }
  function sdHost() { return sec.querySelector('.sc-side'); }
  function sdNav() { return sec.querySelector('.sc-side .la-nav'); }
  function css() {
    return new Promise(function (res) {
      // лише після свого CSS і scene-ui (інакше CLS)
      var href = sec.getAttribute('data-css'), ls = [], n, l = href && d.querySelector('link[href="' + href + '"]');
      if (href && !l) { l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; d.head.appendChild(l); }
      if (l) ls.push(l);
      var u = d.querySelector('link[href^="/assets/scene-ui."]'); if (u) ls.push(u);
      n = ls.length; if (!n) return res();
      function one() { if (!--n) res(); }
      ls.forEach(function (x) { if (x.sheet) return one(); var f = 0, k = function () { if (!f) { f = 1; one(); } }; x.addEventListener('load', k); x.addEventListener('error', k); setTimeout(k, 8000); });
    });
  }
  // блок вище екрана стискається — тримаємо вміст самі (інакше CLS)
  function keep() { var b0 = sec.getBoundingClientRect().bottom, up = b0 <= 0; enhance(); if (up) { var dy = sec.getBoundingClientRect().bottom - b0; if (Math.abs(dy) > 1) { var hs = d.documentElement.style; hs.scrollBehavior = 'auto'; W.scrollBy(0, dy); hs.scrollBehavior = ''; } } } // без smooth з CSS — інакше зсув видно
  function inView() { var r = sec.getBoundingClientRect(); return r.top < 0 && r.bottom > 0; } // верх у кадрі — одразу
  css().then(function () {
    if (!inView() || sec.hasAttribute('data-sw') || !('IntersectionObserver' in W)) return keep(); // data-sw — перемикач сцен
    var o = new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) { o.disconnect(); keep(); } });
    o.observe(sec);
  });
})();
