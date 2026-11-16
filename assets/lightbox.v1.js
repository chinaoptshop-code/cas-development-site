/* CAS — один лайтбокс фото на весь сайт (tools/site/lbox.py ставить розмітку й підключає цей файл; руками не підключати).
   Правило (CLAUDE.md, «Фото: що відкривається»): фото-посилання на велику копію (a[data-lb], href — файл фото, без JS — відкриває файл)
   відкриває цей лайтбокс; обкладинки проєктів, стрічки й плитки — звичайні посилання на сторінки; hero й фон — не клікабельні.
   • Послідовність — усі a[data-lb] сторінки в порядку DOM (копії каруселей aria-hidden — пропускаємо); довга галерея /proekty
     (case-gal.v1.js) дописує хвіст: дійшли до останнього завантаженого — window.casGalMore().
   • Відкриття/закриття — transform/opacity ≤ 240 мс від мініатюри (FLIP), prefers-reduced-motion — без руху.
   • Велике фото — srcset з data-lb (усі ширини на диску), sizes = реальна ширина кадру: браузер бере ≥ кадр × DPR; поки вантажиться —
     мініатюра; сусідні кадри підвантажуються заздалегідь.
   • ‹ › (44+ px), ←/→, свайп (RTL — дзеркально), Esc, ✕, тап по тлу, свайп униз (тач), «Назад» браузера (history.pushState);
     лічильник «n / N»; фокус усередині (Tab по колу) і повернення на мініатюру; прокрутка сторінки під шаром заблокована (дотики, колесо, клавіші) без зміни макета сторінки.
   • Зум: щипок двома пальцями (з точкою під пальцями), подвійний тап / подвійний клік (×2.5 у точці), Ctrl+колесо; збільшене фото
     тягнеться в межах кадру; перехід до іншого фото — скидає зум. */
(function () {
  'use strict';
  var d = document, W = window, H = d.documentElement;
  if (W.casLb) return;
  var LG = (H.lang || 'uk').slice(0, 2), RTL = H.dir === 'rtl';
  var TX = ({
    uk: ['Перегляд фото', 'Закрити', 'Попереднє фото', 'Наступне фото'],
    ru: ['Просмотр фото', 'Закрыть', 'Предыдущее фото', 'Следующее фото'],
    en: ['Photo viewer', 'Close', 'Previous photo', 'Next photo'],
    es: ['Visor de fotos', 'Cerrar', 'Foto anterior', 'Foto siguiente'],
    zh: ['查看照片', '关闭', '上一张', '下一张'],
    pl: ['Podgląd zdjęcia', 'Zamknij', 'Poprzednie zdjęcie', 'Następne zdjęcie'],
    de: ['Fotoansicht', 'Schließen', 'Vorheriges Foto', 'Nächstes Foto'],
    fr: ['Visionneuse de photos', 'Fermer', 'Photo précédente', 'Photo suivante'],
    ar: ['عارض الصور', 'إغلاق', 'الصورة السابقة', 'الصورة التالية']
  })[LG] || ['Photo viewer', 'Close', 'Previous photo', 'Next photo'];
  var RM = W.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  function still() { return RM && RM.matches; }
  var T = 220; // мс анімації відкриття/закриття
  var SEL = 'a[data-lb]';

  var CSS = '.clb{position:fixed;inset:0;z-index:10050;display:none;color:#EDE8DF;-webkit-tap-highlight-color:transparent;overscroll-behavior:contain}' +
    '.clb.on{display:block}.clb-bg{position:absolute;inset:0;background:rgba(8,7,9,.94);opacity:0;transition:opacity ' + T + 'ms ease}.clb.vis .clb-bg{opacity:1}' +
    '.clb-st{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:zoom-in}.clb.zm .clb-st{cursor:grab}.clb.zm.drag .clb-st{cursor:grabbing}' +
    '.clb-im{position:absolute;left:0;top:0;max-width:none;max-height:none;transform-origin:0 0;will-change:transform;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;background:#141215}' +
    '.clb-im.an{transition:transform ' + T + 'ms cubic-bezier(.2,.7,.2,1),opacity ' + T + 'ms ease}' +
    '.clb button{position:absolute;display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:0;margin:0;border:1px solid rgba(237,232,223,.28);border-radius:50%;' +
    'background:rgba(8,7,9,.62);color:#EDE8DF;font:400 26px/1 system-ui,sans-serif;cursor:pointer;opacity:0;transition:opacity ' + T + 'ms ease,background-color .15s ease}' +
    '.clb.vis button{opacity:1}.clb button:hover{background:rgba(191,145,72,.35)}.clb button:focus-visible{outline:2px solid #BF9148;outline-offset:2px}' +
    '.clb-x{top:max(12px,env(safe-area-inset-top,0px));right:max(12px,env(safe-area-inset-right,0px));font-size:20px!important}' +
    '.clb-p,.clb-n{top:50%;margin-top:-24px!important}.clb-p{left:max(12px,env(safe-area-inset-left,0px))}.clb-n{right:max(12px,env(safe-area-inset-right,0px))}' +
    '[dir=rtl] .clb-x{right:auto;left:max(12px,env(safe-area-inset-left,0px))}[dir=rtl] .clb-p{left:auto;right:max(12px,env(safe-area-inset-right,0px))}[dir=rtl] .clb-n{right:auto;left:max(12px,env(safe-area-inset-left,0px))}' +
    '.clb-c{position:absolute;bottom:max(14px,calc(env(safe-area-inset-bottom,0px) + 8px));left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:999px;' +
    'background:rgba(8,7,9,.72);font:500 13px/1.3 system-ui,sans-serif;letter-spacing:.06em;font-variant-numeric:tabular-nums;opacity:0;transition:opacity ' + T + 'ms ease;pointer-events:none}.clb.vis .clb-c{opacity:1}' +
    '.clb.one .clb-p,.clb.one .clb-n,.clb.one .clb-c{display:none}' +
    '@media (max-width:599px),(pointer:coarse) and (max-height:500px){.clb-p,.clb-n{top:auto;margin-top:0!important;bottom:max(6px,env(safe-area-inset-bottom,0px))}}' +
    '@media (prefers-reduced-motion:reduce){.clb-bg,.clb button,.clb-c,.clb-im.an{transition:none!important}}' +
    '';

  var root, bg, st, im, bx, bp, bn, ct, list = [], cur = -1, opener = null, pushed = false, popWait = false, isOpen = false;
  // геометрія кадру: базовий розмір (вписане фото) + зум/зсув
  var nat = { w: 4, h: 3 }, base = { x: 0, y: 0, w: 0, h: 0 }, z = 1, px = 0, py = 0, sx = 0, sy = 0;

  function build() {
    if (root) return;
    var s = d.createElement('style'); s.id = 'clb-css'; s.textContent = CSS; d.head.appendChild(s);
    root = d.createElement('div'); root.className = 'clb'; root.id = 'clb';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', TX[0]);
    root.innerHTML = '<div class="clb-bg"></div><div class="clb-st"><img class="clb-im" alt="" decoding="async" draggable="false"></div>' +
      '<button type="button" class="clb-x">✕</button><button type="button" class="clb-p"></button><button type="button" class="clb-n"></button>' +
      '<span class="clb-c" aria-live="polite"></span>';
    d.body.appendChild(root);
    bg = root.firstChild; st = bg.nextSibling; im = st.firstChild;
    bx = root.querySelector('.clb-x'); bp = root.querySelector('.clb-p'); bn = root.querySelector('.clb-n'); ct = root.querySelector('.clb-c');
    bx.setAttribute('aria-label', TX[1]); bp.setAttribute('aria-label', TX[2]); bn.setAttribute('aria-label', TX[3]);
    bp.textContent = RTL ? '›' : '‹'; bn.textContent = RTL ? '‹' : '›';
    bx.addEventListener('click', function () { close(); });
    bp.addEventListener('click', function () { go(-1); });
    bn.addEventListener('click', function () { go(1); });
    root.addEventListener('keydown', key);
    root.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false }); // колесо над тлом/кнопками — не гортає сторінку
    root.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false }); // iOS: без прокрутки сторінки під шаром
    gestures();
    W.addEventListener('resize', function () { if (isOpen) { fit(); reset(false); } });
  }

  function links() {
    return [].slice.call(d.querySelectorAll(SEL)).filter(function (a) { return !a.closest('[aria-hidden="true"]'); });
  }
  function total() { return Math.max(list.length, +W.casGalN || 0); }
  function thumb(a) { return a && a.querySelector('img'); }
  // data-lb="600,900,1600" — ширини тієї ж бази на диску (lbox.py): <база>-<w>.webp <w>w
  function hiSet(a) {
    var w = (a.getAttribute('data-lb') || '').match(/\d+/g), h = a.getAttribute('href') || '', m = h.match(/^(.*)-\d+\.webp$/);
    if (!w || !m) return '';
    return w.map(function (x) { return m[1] + '-' + x + '.webp ' + x + 'w'; }).join(',');
  }

  // вписати фото у вікно (з полями під кнопки на ПК)
  function fit() {
    var vw = W.innerWidth, vh = W.innerHeight, pad = vw >= 600 ? 72 : 0, padV = vw >= 600 ? 56 : 64;
    var mw = Math.max(1, vw - pad * 2), mh = Math.max(1, vh - padV * 2), r = nat.w / nat.h;
    var w = Math.min(mw, mh * r), h = w / r;
    base = { w: w, h: h, x: (vw - w) / 2, y: (vh - h) / 2 };
    im.style.width = w + 'px'; im.style.height = h + 'px';
    return base;
  }
  function apply(anim) {
    im.classList.toggle('an', !!anim && !still());
    im.style.transform = 'translate(' + (base.x + px + sx) + 'px,' + (base.y + py + sy) + 'px) scale(' + z + ')';
    root.classList.toggle('zm', z > 1.01);
  }
  function clamp() {
    var vw = W.innerWidth, vh = W.innerHeight, w = base.w * z, h = base.h * z;
    // фото більше за вікно — краї не відходять від країв вікна; менше — по центру
    var minX = w > vw ? vw - w - base.x : (vw - w) / 2 - base.x, maxX = w > vw ? -base.x : minX;
    var minY = h > vh ? vh - h - base.y : (vh - h) / 2 - base.y, maxY = h > vh ? -base.y : minY;
    px = Math.min(maxX, Math.max(minX, px)); py = Math.min(maxY, Math.max(minY, py));
  }
  function reset(anim) { z = 1; px = py = sx = sy = 0; apply(anim); }
  // зум у точці (cx, cy) вікна
  function zoomAt(nz, cx, cy, anim) {
    nz = Math.max(1, Math.min(5, nz));
    var ox = base.x + px, oy = base.y + py; // лівий верх фото
    px = cx - (cx - ox) * nz / z - base.x; py = cy - (cy - oy) * nz / z - base.y;
    z = nz; clamp(); apply(anim);
  }

  function setImg(a, i) {
    var t = thumb(a), lo = t && (t.currentSrc || t.src), ss = hiSet(a);
    nat = { w: +(t && t.getAttribute('width')) || (t && t.naturalWidth) || 4, h: +(t && t.getAttribute('height')) || (t && t.naturalHeight) || 3 };
    fit();
    var sizes = Math.ceil(base.w) + 'px';
    im.alt = t ? t.alt : '';
    im.removeAttribute('srcset');
    // мініатюра (уже в кеші) одразу, велика копія — коли завантажиться (без порожнього кадру й без старого фото)
    if (lo && t.complete) im.src = lo; else im.removeAttribute('src');
    var hi = new Image(); hi.decoding = 'async';
    if (ss) { hi.sizes = sizes; hi.srcset = ss; }
    hi.src = a.href;
    var done = function () { if (cur !== i || !isOpen) return; im.sizes = sizes; if (ss) im.srcset = ss; im.src = a.href; };
    if (hi.decode) hi.decode().then(done, done); else hi.onload = done;
    if (ss) { im.sizes = sizes; }
  }
  function preload(i) {
    var a = list[i]; if (!a) return;
    var r = nat.w / nat.h, t = thumb(a), q = t ? (+t.getAttribute('width') || 4) / (+t.getAttribute('height') || 3) : r;
    var vw = W.innerWidth, vh = W.innerHeight, pad = vw >= 600 ? 72 : 0, padV = vw >= 600 ? 56 : 64;
    var w = Math.min(vw - pad * 2, (vh - padV * 2) * q);
    var p = new Image(); p.decoding = 'async'; var ss = hiSet(a);
    if (ss) { p.sizes = Math.ceil(w) + 'px'; p.srcset = ss; } p.src = a.href;
  }
  function count() { ct.textContent = (cur + 1) + ' / ' + total(); root.classList.toggle('one', total() < 2); }
  function show(i, dir) {
    var n = list.length; if (!n) return;
    cur = (i + n) % n;
    reset(false);
    setImg(list[cur], cur);
    count();
    if (dir && !still()) { // короткий зсув нового кадру з боку свайпу
      var dx = (dir > 0 ? 1 : -1) * (RTL ? -1 : 1) * 60;
      im.style.opacity = '0'; px = dx; apply(false);
      im.getBoundingClientRect();
      px = 0; im.style.opacity = '1'; apply(true);
    } else im.style.opacity = '1';
    preload(cur + 1 < n ? cur + 1 : 0); preload(cur > 0 ? cur - 1 : n - 1);
  }
  function go(dir) {
    if (!isOpen) return;
    var n = list.length, i = cur + dir;
    if ((i >= n || i < 0) && n < total() && W.casGalMore) {
      W.casGalMore().then(function () {
        list = links(); var m = list.length;
        show(i >= n ? (i < m ? i : 0) : m - 1, dir);
      });
      return;
    }
    show(i, dir);
  }

  // прокрутка сторінки під лайтбоксом: шар на весь екран ловить дотики (touch-action:none), колесо й клавіші прокрутки —
  // без overflow:hidden на <html> (той перебудовував би стилі й макет усієї сторінки — довге завдання на телефоні, і стрибок смуги прокрутки)
  function open(a) {
    build();
    list = links();
    var i = list.indexOf(a);
    if (i < 0) { // копія з каруселі — оригінал з тим самим href
      for (var k = 0; k < list.length; k++) if (list[k].href === a.href) { i = k; break; }
      if (i < 0) return false;
    }
    opener = a; isOpen = true; cur = i;
    var t = thumb(list[i]), r = t && t.getBoundingClientRect(); // до змін DOM — без примусового перерахунку макета
    root.classList.add('on');
    reset(false);
    setImg(list[i], i); count();
    im.style.opacity = '1';
    if (r && r.width && !still()) { // FLIP: з мініатюри у кадр (наступний кадр — анімація transform)
      var s = r.width / base.w;
      im.classList.remove('an');
      im.style.transform = 'translate(' + r.left + 'px,' + (r.top + (r.height - base.h * s) / 2) + 'px) scale(' + s + ')';
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (isOpen && z === 1) apply(true); }); });
    } else apply(false);
    // кадр нижче/вище — додатковий запис в історії, щоб «Назад» (жест iOS/Android) закривав фото, а не сторінку
    if (!popWait) push(); // ще чекаємо на «Назад» від попереднього закриття — запис додасть popstate
    requestAnimationFrame(function () { root.classList.add('vis'); });
    setTimeout(function () { try { bx.focus({ preventScroll: true }); } catch (e) { bx.focus(); } }, 30);
    preload(i + 1 < list.length ? i + 1 : 0); if (list.length > 1) preload(i > 0 ? i - 1 : list.length - 1);
    return true;
  }
  function close(fromPop) {
    if (!isOpen) return;
    isOpen = false;
    var a = list[cur] || opener, t = thumb(a), r = t && t.getBoundingClientRect();
    root.classList.remove('vis');
    var vis = r && r.width && r.bottom > 0 && r.top < W.innerHeight;
    if (vis && !still() && z <= 1.01) {
      var s = r.width / base.w;
      sx = sy = 0; px = r.left - base.x; py = r.top + (r.height - base.h * s) / 2 - base.y; z = s;
      im.classList.add('an'); im.style.transform = 'translate(' + (base.x + px) + 'px,' + (base.y + py) + 'px) scale(' + s + ')';
    } else { im.classList.toggle('an', !still()); im.style.opacity = '0'; }
    setTimeout(function () { if (isOpen) return; root.classList.remove('on', 'zm'); im.removeAttribute('srcset'); im.removeAttribute('src'); }, still() ? 0 : T);
    var back = a && a.isConnected ? a : opener;
    if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) {}
    if (pushed) { pushed = false; if (!fromPop) try { popWait = true; history.back(); } catch (e) { popWait = false; } }
  }
  function push() { try { if (!pushed) { history.pushState({ clb: 1 }, ''); pushed = true; } } catch (e) {} }
  W.addEventListener('popstate', function () {
    if (popWait) { popWait = false; if (isOpen) push(); return; } // це наш history.back() після закриття
    if (isOpen) { pushed = false; close(true); }
  });

  function key(e) {
    if (!isOpen) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); close(); }
    else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); go((k === 'ArrowRight') !== RTL ? 1 : -1); }
    else if (k === 'Home') { e.preventDefault(); show(0); } else if (k === 'End') { e.preventDefault(); show(list.length - 1); }
    else if (k === ' ' || k === 'PageDown' || k === 'PageUp' || k === 'ArrowDown' || k === 'ArrowUp') { if (e.target === d.body || !root.contains(e.target) || k !== ' ') e.preventDefault(); }
    else if (k === '+' || k === '=') { zoomAt(z * 1.5, W.innerWidth / 2, W.innerHeight / 2, true); }
    else if (k === '-') { zoomAt(z / 1.5, W.innerWidth / 2, W.innerHeight / 2, true); }
    else if (k === 'Tab') { // фокус — лише всередині
      var f = [bx, bp, bn].filter(function (b) { return b.offsetParent !== null; }), i = f.indexOf(d.activeElement);
      e.preventDefault(); (f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length] || bx).focus();
    }
  }
  d.addEventListener('keydown', function (e) { if (isOpen && !root.contains(e.target)) key(e); });

  // ── жести: свайп ←/→, свайп униз — закрити, щипок, подвійний тап, тягнути збільшене ──
  function gestures() {
    var P = {}, n = 0, start = null, pinch = null, lastTap = 0, lastXY = null, moved = false, t0 = 0;
    function pts() { var a = []; for (var k in P) a.push(P[k]); return a; }
    st.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      P[e.pointerId] = { x: e.clientX, y: e.clientY }; n = pts().length;
      if (n === 1) { start = { x: e.clientX, y: e.clientY, px: px, py: py }; moved = false; t0 = Date.now(); pinch = null; }
      else if (n === 2) {
        var p = pts(), dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
        sx = sy = 0; pinch = { dist: Math.hypot(dx, dy) || 1, z: z, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, px: px, py: py }; moved = true;
      }
    });
    st.addEventListener('pointermove', function (e) {
      if (!P[e.pointerId]) return;
      P[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch && pts().length >= 2) {
        var p = pts(), dx = p[1].x - p[0].x, dy = p[1].y - p[0].y, cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
        var nz = Math.max(1, Math.min(5, pinch.z * Math.hypot(dx, dy) / pinch.dist));
        // точка під пальцями лишається під пальцями (+ зсув центру щипка)
        var ox = base.x + pinch.px, oy = base.y + pinch.py;
        px = pinch.cx - (pinch.cx - ox) * nz / pinch.z - base.x + (cx - pinch.cx);
        py = pinch.cy - (pinch.cy - oy) * nz / pinch.z - base.y + (cy - pinch.cy);
        z = nz; apply(false); return;
      }
      if (!start) return;
      var mx = e.clientX - start.x, my = e.clientY - start.y;
      if (!moved && Math.hypot(mx, my) > 8) moved = true;
      if (!moved) return;
      if (z > 1.01) { root.classList.add('drag'); px = start.px + mx; py = start.py + my; clamp(); apply(false); }
      else if (Math.abs(mx) > Math.abs(my) || sx) { sx = mx; sy = 0; apply(false); }
      else if (my > 0 && e.pointerType !== 'mouse') { sy = my; bg.style.opacity = String(Math.max(.25, 1 - my / 400)); apply(false); }
    });
    function end(e) {
      if (!P[e.pointerId]) return;
      delete P[e.pointerId];
      var left = pts().length;
      root.classList.remove('drag');
      if (pinch) {
        if (left < 2) { pinch = null; clamp(); apply(true); if (left === 1) { var q = pts()[0]; start = { x: q.x, y: q.y, px: px, py: py }; } else start = null; }
        return;
      }
      if (!start) return;
      var mx = e.clientX - start.x, my = e.clientY - start.y, dt = Date.now() - t0;
      start = null;
      if (e.type === 'pointercancel') { sx = sy = 0; bg.style.opacity = ''; apply(true); return; }
      if (!moved) { // тап / клік
        var now = Date.now(), xy = { x: e.clientX, y: e.clientY };
        if (now - lastTap < 300 && lastXY && Math.hypot(xy.x - lastXY.x, xy.y - lastXY.y) < 40) {
          lastTap = 0; clearTimeout(st._t);
          if (z > 1.01) reset(true); else zoomAt(2.5, xy.x, xy.y, true);
          return;
        }
        lastTap = now; lastXY = xy;
        var onImg = e.target === im && z <= 1.01;
        if (!onImg && z <= 1.01) { // тап по тлу — закрити (після паузи: це може бути перший тап подвійного)
          clearTimeout(st._t); st._t = setTimeout(function () { if (lastTap === now) close(); }, e.pointerType === 'mouse' ? 0 : 260);
        }
        return;
      }
      if (z > 1.01) return;
      var fast = dt < 300;
      if (sx && (Math.abs(mx) > 60 || (fast && Math.abs(mx) > 30)) && list.length > 1) {
        sx = 0; go((mx < 0) !== RTL ? 1 : -1); return;
      }
      if (sy && (my > 110 || (fast && my > 50))) { sy = 0; bg.style.opacity = ''; close(); return; }
      sx = sy = 0; bg.style.opacity = ''; apply(true);
    }
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    st.addEventListener('dblclick', function (e) { e.preventDefault(); });
    st.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey || z > 1.01) { // Ctrl+колесо / щипок трекпада — зум; збільшене — колесо тягне
        if (e.ctrlKey) zoomAt(z * Math.exp(-e.deltaY / 200), e.clientX, e.clientY, false);
        else { px -= e.deltaX; py -= e.deltaY; clamp(); apply(false); }
      }
    }, { passive: false });
  }

  // делегування: клік (тап) по фото-посиланню — лайтбокс; Ctrl/⌘/Shift/середня — як звичайне посилання (файл фото)
  d.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest(SEL);
    if (!a) return;
    if (open(a)) e.preventDefault();
  });
  // розмітку й стилі — заздалегідь, у простої після load: відкриття без перерахунку стилів усього документа (довге завдання на телефоні)
  function idle() { (W.requestIdleCallback || function (f) { setTimeout(f, 200); })(function () { if (d.querySelector(SEL)) build(); }, { timeout: 3000 }); }
  if (d.readyState === 'complete') idle(); else W.addEventListener('load', idle);
  W.casLb = { open: open, close: close, go: go, state: function () { return { open: isOpen, i: cur, n: total(), z: z, src: im && (im.currentSrc || im.src) }; } };
})();
