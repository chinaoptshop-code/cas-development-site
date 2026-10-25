/* Єдина шапка сайту: бургер і повноекранне меню (розмітка — tools/site/chrome.py). */
(function () {
  var d = document, h = d.documentElement;
  var btn = d.querySelector('.sch-burger'), menu = d.getElementById('sch-menu');
  var inerted = [];
  function setInert(on) { // решта сторінки недоступна, поки відкрите меню (aria-modal)
    if (!on) { inerted.forEach(function (el) { el.inert = false; }); inerted = []; return; }
    var hdr = btn.closest('.sch'), list = [].slice.call(d.body.children);
    if (hdr) list = list.concat([].slice.call(hdr.querySelectorAll('.sch-logo,.sch-nav,.sch-tools,.sch-lang,.sch-tel,.sch-act > .sch-cta')));
    list.forEach(function (el) { if (el === hdr || el.contains(btn) || el.tagName === 'SCRIPT' || el.inert) return; el.inert = true; inerted.push(el); });
  }
  function isOpen() { return btn && btn.getAttribute('aria-expanded') === 'true'; }
  function set(open, focusBack) {
    if (!btn || !menu) return;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? (btn.dataset.close || 'Close') : (btn.dataset.open || 'Menu'));
    menu.hidden = !open;
    h.classList.toggle('sch-lock', open);
    setInert(open);
    if (open) { var a = menu.querySelector('a'); if (a) a.focus({ preventScroll: true }); }
    else if (focusBack) btn.focus();
  }
  if (btn && menu) {
    btn.addEventListener('click', function () { set(!isOpen()); });
    menu.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) set(false); });
    d.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); set(false, true); return; }
      if (e.key === 'Tab') { // фокус лишається в меню і на кнопці закриття
        var f = [btn].concat([].slice.call(menu.querySelectorAll('a,button')));
        var i = f.indexOf(d.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    var mq = window.matchMedia && window.matchMedia('(min-width:1080px)');
    if (mq) { var on = function (e) { if (e.matches) set(false); }; mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on); }
    window.addEventListener('pageshow', function () { if (isOpen()) set(false); });
  }
  // ── Діалоги: лайтбокси (#lb, #plb, #sdlb, .lb) і шторки Оздоби (.sheet) ─────────────────────────
  // role=dialog + aria-modal; закритий — inert; при відкритті фокус усередину, Tab не виходить за межі,
  // Esc закриває, після закриття фокус повертається туди, звідки відкрили. Alt великого фото — з мініатюри.
  var LG = (h.lang || 'uk').slice(0, 2);
  var TX = ({ uk: { close: 'Закрити', photo: 'Перегляд фото' }, ru: { close: 'Закрыть', photo: 'Просмотр фото' },
              en: { close: 'Close', photo: 'Photo viewer' }, es: { close: 'Cerrar', photo: 'Visor de fotos' },
              zh: { close: '关闭', photo: '查看照片' }, pl: { close: 'Zamknij', photo: 'Podgląd zdjęcia' }, de: { close: 'Schließen', photo: 'Fotoansicht' },
              fr: { close: 'Fermer', photo: 'Visionneuse de photos' }, ar: { close: 'إغلاق', photo: 'عارض الصور' } })[LG] ||
           { close: 'Закрити', photo: 'Перегляд фото' };
  var FOC = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var CLOSE = '[data-close],.x,#lb-close,#plb-close,#sdlb-close,button[aria-label="' + TX.close + '"]';
  var stack = [];
  function shown(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function focusables(dl) { return [].slice.call(dl.querySelectorAll(FOC)).filter(shown); }
  function isOn(dl) { return dl.classList.contains('open') || dl.classList.contains('on'); }
  function stem(u) {
    u = (u || '').split(/[?#]/)[0]; u = u.slice(u.lastIndexOf('/') + 1).replace(/\.\w+$/, '');
    return u.replace(/-(?:r?\d+|bg\d+)$/, '');
  }
  function altFor(dl) {
    var big = dl.querySelector('img'); if (!big) return;
    var s = stem(big.getAttribute('src')); if (!s) return;
    for (var i = 0, im; (im = d.images[i]); i++) {
      if (!dl.contains(im) && im.alt && stem(im.getAttribute('src')) === s) { big.alt = im.alt; return; }
    }
    if (!big.alt) big.alt = TX.photo;
  }
  function dialog(dl) {
    if (dl._dlg) return; dl._dlg = 1;
    if (!dl.getAttribute('role')) dl.setAttribute('role', 'dialog');
    dl.setAttribute('aria-modal', 'true');
    if (!dl.hasAttribute('aria-label') && !dl.hasAttribute('aria-labelledby')) dl.setAttribute('aria-label', TX.photo);
    if (!dl.hasAttribute('tabindex')) dl.setAttribute('tabindex', '-1');
    var was = isOn(dl), back = null;
    dl.inert = !was;
    function sync() {
      var on = isOn(dl); if (on === was) return; was = on;
      if (on) {
        back = d.activeElement; dl.inert = false; dl.removeAttribute('aria-hidden'); stack.push(dl); altFor(dl);
        var tries = 0;
        (function focusIn() { // діалог може зʼявлятися з анімацією visibility — пробуємо, доки фокус не опиниться всередині
          if (!isOn(dl) || dl.contains(d.activeElement)) return;
          var c = dl.querySelector(CLOSE); if (!c || !shown(c)) c = focusables(dl)[0] || dl;
          c.focus({ preventScroll: true });
          if (!dl.contains(d.activeElement) && ++tries < 8) setTimeout(focusIn, 60);
        })();
      } else {
        dl.inert = true; stack = stack.filter(function (x) { return x !== dl; });
        if (back && back !== d.body && back.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
        back = null;
      }
    }
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.target === dl && m.attributeName === 'class') sync();
        else if (m.attributeName === 'src' && m.target.tagName === 'IMG') altFor(dl);
      });
    }).observe(dl, { attributes: true, subtree: true, attributeFilter: ['class', 'src'] });
  }
  [].forEach.call(d.querySelectorAll('#lb,#plb,#sdlb,.lb,.sheet'), dialog);
  d.addEventListener('keydown', function (e) {
    var dl = stack[stack.length - 1];
    if (!dl || !isOn(dl)) return;
    if (e.key === 'Escape') {
      var c = dl.querySelector(CLOSE);
      if (c) c.click(); else { dl.classList.remove('open'); dl.classList.remove('on'); }
      e.preventDefault(); return;
    }
    if (e.key === 'Tab') {
      var f = focusables(dl), i = f.indexOf(d.activeElement);
      if (!f.length) { e.preventDefault(); dl.focus(); return; }
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  // «Усі послуги студії»: на десктопі відкрито, на мобільному згорнуто
  var svc = d.querySelector('.scf-svc');
  if (svc && window.matchMedia && window.matchMedia('(min-width:760px)').matches) svc.open = true;
})();
// Перемикач мов у шапці (details.sch-ld): закривається кліком поза ним, Esc і після вибору мови
(function () {
  var d = document, ld = d.querySelector('.sch-ld');
  if (!ld) return;
  d.addEventListener('click', function (e) { if (ld.open && !ld.contains(e.target)) ld.open = false; });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ld.open) { ld.open = false; ld.querySelector('summary').focus(); } });
})();
// ── Motion (UI-kit): поява блоків при скролі, лічильники цифр, стрічки-marquee, плавний акордеон ──────────
// Стилі — розділ «Motion» у site-chrome.v1.css, приклади — /styleguide/#motion. Доповнює reveal з блоку ui-polish
// (секції й картки), не дублює його. H1, перше фото й те, що видно при завантаженні, не ховаємо ніколи.
// prefers-reduced-motion: reduce — нічого не рухається (стрічки — звичайний горизонтальний скрол).
(function () {
  var d = document, W = window, h = d.documentElement;
  if (/^\/(?:ozdoba|kabinet)(?:[\/.]|$)/.test(location.pathname)) return; // Оздоба й кабінет — власні інтерфейси
  h.classList.add('mo');
  var RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IO = 'IntersectionObserver' in W;
  var vh = W.innerHeight || 800;
  function $$(s, r) { try { return [].slice.call((r || d).querySelectorAll(s)); } catch (e) { return []; } }
  function seen(el) { var b = el.getBoundingClientRect(); return b.top < vh * 0.95 && b.bottom > 0; } // уже на екрані
  var main = d.querySelector('main') || d.body;
  var h1 = main.querySelector('h1'), img1 = main.querySelector('img');
  function guarded(el) { // H1 і перше фото сторінки не анімуємо
    return (h1 && (el === h1 || el.contains(h1))) || (img1 && (el === img1 || el.contains(img1)));
  }

  // 1. Поява при скролі: елементи, яких не бере reveal з ui-polish (етапи, факти, картки статей, блоки статті блогу)
  var RV = '[data-reveal],ol.steps>li,.facts>div,.ab-facts>div,.ab-guar>div,.ab-steps>li,.cards>a,.hero>article>:is(h2,figure,.ag,details,.cta)';
  function reveal() {
    if (RM || !IO) return;
    var list = $$(RV, main).filter(function (el) {
      return !guarded(el) && !seen(el) && !el.closest('.rv,.reveal,.au,form,#lb,#plb,.lb,[aria-hidden="true"]');
    });
    if (!list.length) return;
    var io = new IntersectionObserver(function (es) {
      var batch = es.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      batch.sort(function (a, b) { var p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return p.top - q.top || p.left - q.left; });
      batch.forEach(function (el, i) { io.unobserve(el); show(el, Math.min(i, 6) * 70); });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    function show(el, delay) {
      el.style.setProperty('--mo-d', delay + 'ms'); el.classList.add('mo-in');
      setTimeout(function () { el.classList.remove('mo-rv', 'mo-in'); el.style.removeProperty('--mo-d'); }, 700 + delay);
    }
    list.forEach(function (el) { el.classList.add('mo-rv'); io.observe(el); });
    W.addEventListener('beforeprint', function () { list.forEach(function (el) { el.classList.remove('mo-rv'); }); });
    // швидкий скрол (якір, Home/End) може «перестрибнути» блок — те, що вже вище екрана, показуємо без анімації
    var raf = 0;
    function skipped() {
      raf = 0;
      list = list.filter(function (el) {
        if (!el.classList.contains('mo-rv') || el.classList.contains('mo-in')) return false;
        if (el.getBoundingClientRect().bottom < 0) { io.unobserve(el); el.classList.remove('mo-rv'); return false; }
        return true;
      });
      if (!list.length) W.removeEventListener('scroll', onScroll);
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(skipped); }
    W.addEventListener('scroll', onScroll, { passive: true });
  }

  // 2. Лічильники: «150+», «12 міс.» рахуються від нуля, коли блок зʼявляється. Роки (2016) і малі числа не чіпаємо.
  // Справжнє значення лишається для скрінрідерів (.mo-sr), цифри, що біжать, — aria-hidden.
  var CN = '[data-count],.facts b,.ab-facts b';
  function counters() {
    if (RM || !IO) return;
    $$(CN, main).forEach(function (el) {
      if (el.children.length || seen(el)) return;
      var t = el.textContent.trim(), m = /^(\D*?)(\d{1,3}(?:[\s  ]\d{3})+|\d+)(.*)$/.exec(t);
      if (!m) return;
      var n = parseInt(el.getAttribute('data-count') || m[2].replace(/\D/g, ''), 10);
      if (!(n >= 10) || (/^\d{4}$/.test(m[2]) && n > 1900 && n < 2100)) return;
      var sep = (/[\s  ]/.exec(m[2]) || [''])[0];
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return; io.disconnect();
        el.textContent = '';
        var sr = d.createElement('span'), v = d.createElement('span');
        sr.className = 'mo-sr'; sr.textContent = t; v.className = 'mo-cnt'; v.setAttribute('aria-hidden', 'true');
        el.appendChild(sr); el.appendChild(v);
        var t0 = null, dur = 1300;
        function fmt(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, sep || ''); }
        (function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min((ts - t0) / dur, 1);
          v.textContent = m[1] + fmt(Math.round(n * (1 - Math.pow(1 - p, 3)))) + m[3];
          if (p < 1) requestAnimationFrame(step); else el.textContent = t;
        })(performance.now());
      }, { threshold: 0.6 });
      io.observe(el);
    });
  }

  // 3. Стрічки (marquee): галерея фото на головній (.strip) і в «Про нас» (.abg), ряди посилань «Інші послуги» (.rel, від 7),
  // «Статті по темі» (.rel.arts, від 4) і будь-який [data-marquee]. Лише якщо вміст ширший за контейнер.
  // Вимкнути на конкретному ряду: data-marquee="off"; швидкість: data-marquee-speed="40" (px/с).
  var MQ = '[data-marquee],.rel:has(>a:nth-child(7)):not(:has(>a[href^="#"])),.rel.arts:has(>a:nth-child(4)),.strip,.abg';
  var LG = (h.lang || 'uk').slice(0, 2);
  var TX = ({ uk: ['Зупинити стрічку', 'Запустити стрічку'], ru: ['Остановить ленту', 'Запустить ленту'], en: ['Pause carousel', 'Play carousel'],
              es: ['Pausar carrusel', 'Reanudar carrusel'], zh: ['暂停滚动', '继续滚动'], pl: ['Zatrzymaj pasek', 'Wznów pasek'],
              de: ['Laufband anhalten', 'Laufband starten'], fr: ['Mettre en pause', 'Relancer le défilement'], ar: ['إيقاف الشريط', 'تشغيل الشريط'] })[LG] ||
           ['Pause', 'Play'];
  var FOCUS = 'a,button,input,select,textarea,[tabindex],[onclick],[role=button]';
  function mqOn(host) {
    if (host._mq || host.getAttribute('data-marquee') === 'off' || host.closest('[aria-hidden="true"]')) return;
    var items = [].filter.call(host.children, function (c) { return c.nodeType === 1 && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(c.tagName); });
    if (items.length < 2 || host.scrollWidth < host.clientWidth * 1.15) return; // усе й так видно — стрічка не потрібна
    var cs = getComputedStyle(host), gap = parseFloat(cs.columnGap) || 0;
    var st = { items: items, css: items.map(function (it) { return it.getAttribute('style'); }), w: host.clientWidth };
    // ширини у % (фото-стрічки) фіксуємо в px: у треку max-content відсотки не працюють. Спершу всі читання, потім запис —
    // без примусових перерахунків макета на кожному елементі
    var ws = items.map(function (it) { return /%/.test(getComputedStyle(it).flexBasis) ? it.getBoundingClientRect().width : 0; });
    items.forEach(function (it, i) { if (ws[i]) { it.style.flex = '0 0 ' + ws[i] + 'px'; it.style.width = ws[i] + 'px'; it.style.minWidth = '0'; } });
    var vp = d.createElement('div'), tr = d.createElement('div'), g1 = d.createElement('div');
    vp.className = 'mq-vp'; tr.className = 'mq-track'; g1.className = 'mq-g';
    items.forEach(function (it) { g1.appendChild(it); });
    var g2 = g1.cloneNode(true);
    g2.setAttribute('aria-hidden', 'true');
    $$(FOCUS, g2).forEach(function (x) { x.setAttribute('tabindex', '-1'); });
    $$('[id]', g2).forEach(function (x) { x.removeAttribute('id'); });
    $$('img', g2).forEach(function (x) { x.setAttribute('loading', 'lazy'); x.removeAttribute('fetchpriority'); });
    // клік по копії = клік по оригіналу (лайтбокс, кнопки); звичайні посилання працюють і так
    g2.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest(FOCUS);
      if (!t || !g2.contains(t) || (t.tagName === 'A' && t.getAttribute('href'))) return;
      var o = $$(FOCUS, g1)[$$(FOCUS, g2).indexOf(t)];
      if (o) { e.preventDefault(); e.stopPropagation(); o.click(); }
    }, true);
    tr.appendChild(g1); tr.appendChild(g2); vp.appendChild(tr);
    host.insertBefore(vp, host.firstChild);
    var b = d.createElement('button');
    b.type = 'button'; b.className = 'mq-btn'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', TX[0]); b.textContent = '❚❚';
    b.addEventListener('click', function () {
      var p = host.classList.toggle('mq-paused');
      b.setAttribute('aria-pressed', p ? 'true' : 'false'); b.setAttribute('aria-label', TX[p ? 1 : 0]); b.textContent = p ? '▶' : '❚❚';
    });
    host.appendChild(b);
    host.style.setProperty('--mq-gap', gap + 'px');
    var speed = parseFloat(host.getAttribute('data-marquee-speed')) || (host.querySelector('img') ? 32 : 38);
    function dur() { host.style.setProperty('--mq-dur', Math.max(12, Math.round(g1.getBoundingClientRect().width / speed)) + 's'); }
    dur();
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(dur);
    host.classList.add('mq-on');
    st.vp = vp; st.btn = b; st.g1 = g1; host._mq = st;
  }
  function mqOff(host) {
    var st = host._mq; if (!st) return;
    st.items.forEach(function (it, i) { if (st.css[i] == null) it.removeAttribute('style'); else it.setAttribute('style', st.css[i]); host.insertBefore(it, st.vp); });
    host.removeChild(st.vp); host.removeChild(st.btn);
    host.classList.remove('mq-on', 'mq-paused', 'mq-touch', 'mq-off');
    host._mq = null;
  }
  function marquee() {
    if (RM) return;
    var hosts = $$(MQ, main);
    if (!hosts.length) hosts = $$('[data-marquee],.strip,.abg', main); // браузер без :has()
    hosts.forEach(function (host) {
      // стрічку збираємо, лише коли ряд підходить до екрана (не навантажуємо завантаження сторінки)
      if (IO) { var lz = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { lz.disconnect(); mqOn(host); } }, { rootMargin: '300px 0px' }); lz.observe(host); }
      else mqOn(host);
      var tt;
      host.addEventListener('touchstart', function () { clearTimeout(tt); host.classList.add('mq-touch'); }, { passive: true });
      host.addEventListener('touchend', function () { clearTimeout(tt); tt = setTimeout(function () { host.classList.remove('mq-touch'); }, 2500); }, { passive: true });
      if (IO) new IntersectionObserver(function (es) { host.classList.toggle('mq-off', !es[0].isIntersecting); }, { rootMargin: '100px' }).observe(host);
      if ('ResizeObserver' in W) {
        var rt, w0 = host.clientWidth;
        new ResizeObserver(function () {
          var w = host.clientWidth; if (Math.abs(w - w0) < 2 || !host._mq) return; w0 = w;
          clearTimeout(rt); rt = setTimeout(function () { var p = host.classList.contains('mq-paused'); mqOff(host); mqOn(host); if (p && host._mq) host._mq.btn.click(); }, 200);
        }).observe(host);
      }
    });
  }

  // 4. Акордеон FAQ: у Chrome 131+ висоту плавно анімує CSS (interpolate-size, блок ui-polish); тут — те саме для решти браузерів
  function accordion() {
    if (RM || !W.Element || !Element.prototype.animate) return;
    if (W.CSS && CSS.supports && CSS.supports('interpolate-size', 'allow-keywords')) return;
    d.addEventListener('click', function (e) {
      var s = e.target.closest && e.target.closest('summary'), dt = s && s.parentElement;
      if (!dt || dt.tagName !== 'DETAILS' || !main.contains(dt) || dt._mo) return;
      e.preventDefault();
      var cs = getComputedStyle(dt), start = dt.offsetHeight, opening = !dt.open, end;
      dt.style.overflow = 'hidden'; dt.style.boxSizing = 'border-box';
      if (opening) { dt.open = true; end = dt.offsetHeight; }
      else end = s.offsetHeight + ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(function (a, k) { return a + (parseFloat(cs[k]) || 0); }, 0);
      var an = dt.animate({ height: [start + 'px', end + 'px'] }, { duration: 300, easing: 'ease' });
      dt._mo = an;
      an.onfinish = an.oncancel = function () { if (!opening) dt.open = false; dt.style.overflow = ''; dt.style.boxSizing = ''; dt._mo = null; };
    });
  }

  [marquee, reveal, counters, accordion].forEach(function (f) { try { f(); } catch (e) {} });
})();
