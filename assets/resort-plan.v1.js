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
  function cl(ev, v) { try { if (W.clarity) { W.clarity('event', ev); if (v) W.clarity('set', ev, v); } } catch (e) { } }
  function money(n) { var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, /^(en|zh|ar)$/.test(lang) ? ',' : ' '); return lang === 'fr' ? s + ' $' : '$' + s; }
  function R(c, x, y, w, h, rx, st) { return '<rect class="' + c + '"' + (st != null ? ' data-s="' + st + '"' : '') + ' x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function C(c, x, y, r, st) { return '<circle class="' + c + '"' + (st != null ? ' data-s="' + st + '"' : '') + ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>'; }
  function Pth(c, dd, st) { return '<path class="' + c + '"' + (st != null ? ' data-s="' + st + '"' : '') + ' d="' + dd + '"/>'; }
  function G(st, h) { return '<g class="rp-p" data-s="' + st + '">' + h + '</g>'; }

  /* частини обʼєктів за етапами (st[тип]) */
  function cabin(x, y, s) {
    var o = G(0, R('rp-found', x - 3, y - 3, s + 6, s + 6, 2));
    var f = ''; for (var i = 0; i <= 3; i++) for (var j = 0; j <= 3; j++) if (i % 3 === 0 || j % 3 === 0) f += C('rp-post', x + s * i / 3, y + s * j / 3, 1.6);
    f += Pth('rp-beam', 'M' + x + ' ' + y + 'h' + s + 'v' + s + 'h' + (-s) + 'z M' + x + ' ' + (y + s / 2) + 'h' + s);
    o += G(1, f);
    o += G(2, Pth('rp-roofa', 'M' + (x - 4) + ' ' + (y - 4) + 'L' + (x + s / 2) + ' ' + (y + s / 2) + 'L' + (x - 4) + ' ' + (y + s + 4) + 'Z') + Pth('rp-roofb', 'M' + (x + s + 4) + ' ' + (y - 4) + 'L' + (x + s / 2) + ' ' + (y + s / 2) + 'L' + (x + s + 4) + ' ' + (y + s + 4) + 'Z')
      + Pth('rp-roofc', 'M' + (x - 4) + ' ' + (y - 4) + 'L' + (x + s / 2) + ' ' + (y + s / 2) + 'L' + (x + s + 4) + ' ' + (y - 4) + 'Z') + Pth('rp-roofd', 'M' + (x - 4) + ' ' + (y + s + 4) + 'L' + (x + s / 2) + ' ' + (y + s / 2) + 'L' + (x + s + 4) + ' ' + (y + s + 4) + 'Z'));
    var t = R('rp-deck', x, y + s + 4, s, s * 0.32); for (var k = 1; k < 8; k++) t += Pth('rp-board', 'M' + (x + s * k / 8) + ' ' + (y + s + 4) + 'v' + (s * 0.32));
    o += G(3, t);
    o += G(4, R('rp-win', x + s * 0.18, y + s + 1, s * 0.22, 3) + R('rp-win', x + s * 0.6, y + s + 1, s * 0.22, 3) + C('rp-glow', x + s / 2, y + s * 1.2, s * 0.35) + C('rp-lamp', x + s / 2, y + s * 1.2, 1.6));
    return o;
  }
  function mainB(x, y, w, h) {
    var o = G(0, Pth('rp-duct', 'M' + x + ' ' + (y + h * 0.2) + 'h' + w) + Pth('rp-pipe', 'M' + x + ' ' + (y + h * 0.5) + 'h' + w) + Pth('rp-cable', 'M' + x + ' ' + (y + h * 0.8) + 'h' + w) + R('rp-shell', x, y, w, h, 3));
    var t = ''; for (var i = 0; i < 4; i++) for (var j = 0; j < 3; j++) t += C('rp-table', x + w * (0.12 + i * 0.13), y + h * (0.2 + j * 0.3), 3.5);
    o += G(1, R('rp-hall', x + 2, y + 2, w * 0.6, h - 4, 2) + t);
    var k = R('rp-kitch', x + w * 0.64, y + 2, w * 0.34, h - 4, 2); for (i = 0; i < 3; i++) k += R('rp-steel', x + w * 0.68, y + 6 + i * (h - 12) / 3, w * 0.26, (h - 12) / 3 - 4, 1);
    o += G(2, k);
    var tr = R('rp-deck', x - 4, y + h + 4, w + 8, h * 0.32); for (i = 0; i < 5; i++) tr += C('rp-umb', x + w * (0.1 + i * 0.2), y + h + 4 + h * 0.16, 6);
    o += G(3, tr);
    return o;
  }
  function pergola(x, y, w, h) {
    var o = '', p = ''; [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1]].forEach(function (q) { p += R('rp-pst', x + q[0] * w - 2, y + q[1] * h - 2, 4, 4); });
    o += G(0, p) + G(1, R('rp-bm', x - 3, y - 1, w + 6, 3) + R('rp-bm', x - 3, y + h - 2, w + 6, 3));
    var l = ''; for (var i = 1; i < 12; i++) l += Pth('rp-lv', 'M' + (x + w * i / 12) + ' ' + y + 'v' + h); o += G(2, l);
    o += G(3, C('rp-glow', x + w / 2, y + h / 2, w * 0.45) + C('rp-lamp', x + w / 2, y + h / 2, 2));
    return o;
  }
  function bar(x, y, w, h) {
    var o = G(0, R('rp-found', x - 4, y - 4, w + 8, h + 8, 3));
    o += G(1, C('rp-post', x, y, 2) + C('rp-post', x + w, y, 2) + C('rp-post', x, y + h, 2) + C('rp-post', x + w, y + h, 2));
    o += G(2, Pth('rp-counter', 'M' + (x + 6) + ' ' + (y + h - 6) + 'v' + (-(h - 14)) + 'h' + (w - 12) + 'v' + (h - 14)));
    o += G(3, R('rp-canopy', x - 6, y - 6, w + 12, h * 0.55, 4));
    var s = ''; for (var i = 0; i < 9; i++) s += C('rp-bulb', x - 4 + (w + 8) * i / 8, y + h * 0.55 + Math.sin(i) * 2, 1.6); o += G(4, s + C('rp-glow', x + w / 2, y + h / 2, w * 0.5));
    return o;
  }
  function pool(x, y, w, h) {
    var o = G(0, R('rp-dig', x - 6, y - 6, w + 12, h + 12, 10)) + G(1, R('rp-shellp', x - 3, y - 3, w + 6, h + 6, 9)) + G(2, R('rp-wp', x, y, w, h, 8));
    var t = ''; for (var i = 1; i < 10; i++) t += Pth('rp-tile', 'M' + (x + w * i / 10) + ' ' + y + 'v' + h); for (i = 1; i < 5; i++) t += Pth('rp-tile', 'M' + x + ' ' + (y + h * i / 5) + 'h' + w);
    o += G(3, R('rp-lining', x, y, w, h, 8) + t);
    o += G(4, R('rp-water', x + 2, y + 2, w - 4, h - 4, 7) + Pth('rp-ripple', 'M' + (x + 10) + ' ' + (y + h * 0.4) + 'q 10 -5 20 0 t 20 0 t 20 0 t 20 0') + C('rp-ulight', x + 8, y + h / 2, 5) + C('rp-ulight', x + w - 8, y + h / 2, 5));
    return o;
  }
  function tech(x, y) {
    var o = G(0, R('rp-tb', x, y, 58, 48, 2) + C('rp-boil', x + 18, y + 24, 9) + C('rp-boil', x + 40, y + 24, 9));
    o += G(1, R('rp-tb', x + 66, y, 40, 48, 2) + R('rp-epanel', x + 72, y + 8, 28, 32, 1) + Pth('rp-cable', 'M' + (x + 86) + ' ' + (y + 48) + 'v 20'));
    o += G(2, R('rp-tb', x + 114, y, 86, 48, 6) + C('rp-tank', x + 136, y + 24, 14) + C('rp-tank', x + 176, y + 24, 14));
    o += G(3, R('rp-store', x, y + 58, 86, 62, 2));
    var p = R('rp-park', x + 94, y + 58, 106, 62, 2); for (var i = 1; i < 5; i++) p += Pth('rp-stripe', 'M' + (x + 94 + 106 * i / 5) + ' ' + (y + 58) + 'v 34');
    p += R('rp-car', x + 100, y + 64, 14, 24, 3) + R('rp-car', x + 142, y + 64, 14, 24, 3);
    o += G(4, p);
    return o;
  }
  function relax(x, y) {
    var o = G(0, C('rp-pad', x, y, 46));
    var l = ''; for (var i = 0; i < 4; i++) l += R('rp-lounger', x - 40 + i * 16, y - 34, 10, 22, 3); o += G(1, l);
    o += G(2, C('rp-firering', x - 8, y + 12, 11) + C('rp-fire', x - 8, y + 12, 5) + C('rp-glow', x - 8, y + 12, 20));
    o += G(3, C('rp-tub', x + 24, y + 14, 13) + C('rp-tubw', x + 24, y + 14, 10));
    return o;
  }
  function beach(y) {
    var o = G(0, Pth('rp-sand', 'M0 ' + y + ' C 250 ' + (y - 14) + ' 750 ' + (y + 12) + ' 1000 ' + (y - 6) + ' V ' + (y + 70) + ' H 0 Z'));
    var l = ''; for (var i = 0; i < 8; i++) l += R('rp-lounger', 330 + i * 46, y + 22, 10, 22, 3); o += G(1, l);
    var u = ''; for (i = 0; i < 4; i++) u += C('rp-umb', 352 + i * 92, y + 26, 13); o += G(2, u);
    return o;
  }
  function layout() {
    var h = '', nCab = cfg.n, s = Math.sqrt(cfg.a) * 5.6, mw = Math.sqrt(cfg.r) * 10.5, mh = mw * 0.62;
    objs = [];
    function obj(type, idx, inner) { var k = objs.length; objs.push(type); return '<g class="rp-o" data-o="' + type + '" data-k="' + k + '" tabindex="0" role="button" aria-label="' + esc(D.o[type]) + (idx ? ' ' + idx : '') + '">' + inner + '</g>'; }
    h += '<rect class="rp-grass" x="0" y="0" width="1000" height="700"/>';
    h += Pth('rp-lake', 'M0 590 C 250 576 750 602 1000 584 V 700 H 0 Z') + '<g class="rp-waves">' + Pth('rp-wave', 'M0 620 q 25 -6 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0') + Pth('rp-wave', 'M-25 652 q 25 -6 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0') + '</g>';
    // доріжки
    h += Pth('rp-path', 'M 200 160 C 300 170 380 170 ' + (480 - mw / 2) + ' 170') + Pth('rp-path', 'M 480 ' + (150 + mh / 2 + 34) + ' C 480 280 500 300 500 360 S 520 470 520 540') + Pth('rp-path', 'M 120 380 C 300 345 700 345 900 380') + Pth('rp-path', 'M 160 470 C 240 500 300 520 360 540') + Pth('rp-path', 'M 700 480 C 760 500 800 505 830 510');
    // дерева (ландшафт)
    [[300, 60], [360, 90], [820, 70], [900, 130], [950, 260], [60, 250], [40, 330], [960, 400], [270, 300], [740, 300], [600, 470], [110, 560], [940, 520], [420, 60]].forEach(function (p) { h += C('rp-tree', p[0], p[1], 14) + C('rp-tree2', p[0] - 4, p[1] - 4, 8); });
    h += obj('tech', 0, tech(30, 30));
    h += obj('main', 0, mainB(480 - mw / 2, 150 - mh / 2 + 20, mw, mh));
    h += obj('pool', 0, pool(640 + (mw - 110) / 3, 90, 150, 82));
    h += obj('pergola', 1, pergola(320, 230, 72, 50)) + obj('pergola', 2, pergola(660, 250, 72, 50));
    var rows = nCab <= 4 ? 1 : 2, per = Math.ceil(nCab / rows), k = 0;
    for (var r = 0; r < rows; r++) for (var i = 0; i < per && k < nCab; i++, k++) {
      var x = 90 + (820 - s) * (per === 1 ? 0.5 : i / (per - 1)) - s / 2 + (r ? (820 / per) / 2 * (i < per - 1 ? 1 : -1) : 0), y = 330 + r * 88 + Math.sin(i * 1.3) * 8;
      h += obj('cabin', k + 1, cabin(Math.max(40, Math.min(960 - s, x)), y, s));
    }
    h += obj('relax', 0, relax(150, 490));
    h += obj('beach', 0, beach(520));
    h += obj('bar', 0, bar(800, 500, 70, 38));
    svg.innerHTML = '<defs><radialGradient id="rp-gl"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="rp-wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb2d6"/><stop offset="1" stop-color="#1f6f95"/></linearGradient></defs>' + h;
    [].forEach.call(svg.querySelectorAll('.rp-o'), function (g) {
      g.addEventListener('click', function () { open(g); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(g); } });
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
  function open(g) {
    var b = g.getBBox(), pad = 30, w = Math.max(b.width + pad * 2, 180), h = w * 0.7;
    if (b.height + pad * 2 > h) { h = b.height + pad * 2; w = h / 0.7; }
    focus = g; svg.classList.add('rp-zoom'); [].forEach.call(svg.querySelectorAll('.rp-o'), function (x) { x.classList.toggle('rp-act', x === g); });
    cam([b.x + b.width / 2 - w / 2, b.y + b.height / 2 - h / 2, w, h]);
    stage = 0; show(); back.hidden = false; nav.hidden = false;
    if (!RM) { clearInterval(timer); timer = setInterval(function () { if (stage < steps().length - 1) { stage++; show(); } else clearInterval(timer); }, 950); }
    cl('rp_obj', g.getAttribute('data-o'));
    back.focus({ preventScroll: true });
  }
  function steps() { return focus ? (D.st[focus.getAttribute('data-o')] || []) : []; }
  function show() {
    var st = steps();
    [].forEach.call(focus.querySelectorAll('.rp-p'), function (p) { p.classList.toggle('rp-off', +p.getAttribute('data-s') > stage); });
    cap.innerHTML = '<b>' + esc(D.o[focus.getAttribute('data-o')]) + '</b><span>' + esc(U.step) + ' ' + (stage + 1) + ' ' + esc(U.of) + ' ' + st.length + ': ' + esc(st[stage] || '') + '</span>';
  }
  function close() {
    clearInterval(timer);
    if (focus) [].forEach.call(focus.querySelectorAll('.rp-p'), function (p) { p.classList.remove('rp-off'); });
    var f = focus; focus = null; svg.classList.remove('rp-zoom'); [].forEach.call(svg.querySelectorAll('.rp-act'), function (x) { x.classList.remove('rp-act'); });
    cam([0, 0, 1000, 700]); back.hidden = true; nav.hidden = true; cap.innerHTML = '<span>' + esc(U.tap) + '</span>';
    if (f) f.focus({ preventScroll: true });
  }
  /* ціни */
  function price() {
    var cab = cfg.n * cfg.a, rate = cfg.l ? 1100 : 600, area = cab + cfg.r;
    var rows = [[U.r_cab.replace('{n}', cfg.n).replace('{a}', cfg.a), cab * rate], [U.r_main.replace('{a}', cfg.r), cfg.r * rate],
      [U.r_dz, Math.max(area * 30, 2500)], [U.r_mb, area * 250], [U.r_land.replace('{s}', cfg.s), cfg.s * 50]];
    var sum = rows.reduce(function (a, r) { return a + r[1]; }, 0);
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
  var back, nav;
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
    back = el('button', 'btn rp-back', esc(U.back)); back.type = 'button'; back.hidden = true; back.addEventListener('click', close);
    nav = el('div', 'la-nav rp-nav'); nav.hidden = true;
    var rtl = d.documentElement.dir === 'rtl', pb = el('button', '', rtl ? '›' : '‹'), nb = el('button', '', rtl ? '‹' : '›');
    pb.type = nb.type = 'button'; pb.setAttribute('aria-label', U.step + ' −'); nb.setAttribute('aria-label', U.step + ' +');
    pb.addEventListener('click', function () { clearInterval(timer); if (stage > 0) { stage--; show(); } });
    nb.addEventListener('click', function () { clearInterval(timer); if (stage < steps().length - 1) { stage++; show(); } });
    nav.appendChild(pb); nav.appendChild(nb);
    var tools = el('div', 'rp-tools'); tools.appendChild(back); tools.appendChild(nav);
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
    sec.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && focus) close(); });
    sec.classList.add('rp-on');
    layout(); price();
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
