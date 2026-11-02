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
      batch.forEach(function (el, i) { io.unobserve(el); show(el, Math.min(i, 5) * 80); });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    function show(el, delay) {
      el.style.setProperty('--mo-d', delay + 'ms'); el.classList.add('mo-in');
      setTimeout(function () { el.classList.remove('mo-rv', 'mo-in'); el.style.removeProperty('--mo-d'); }, 950 + delay);
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

  // 2. Лічильники: «150+», «36 міс.» рахуються від нуля, коли блок зʼявляється. Роки (2016) і малі числа не чіпаємо.
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
        var t0 = null, dur = 1600;
        function fmt(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, sep || ''); }
        (function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min((ts - t0) / dur, 1);
          v.textContent = m[1] + fmt(Math.round(n * (1 - Math.pow(1 - p, 4)))) + m[3];
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
      // після завантаження шрифтів: ширина ряду (і тривалість циклу) не зміниться посеред руху — без «смикання»
      var go = function () { if (IO) { var lz = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { lz.disconnect(); mqOn(host); } }, { rootMargin: '300px 0px' }); lz.observe(host); } else mqOn(host); };
      if (d.fonts && d.fonts.status !== 'loaded' && d.fonts.ready) d.fonts.ready.then(go); else go();
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
      var an = dt.animate({ height: [start + 'px', end + 'px'] }, { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' });
      dt._mo = an;
      an.onfinish = an.oncancel = function () { if (!opening) dt.open = false; dt.style.overflow = ''; dt.style.boxSizing = ''; dt._mo = null; };
    });
  }

  // 5. «Магнітні» головні кнопки: лише миша (hover + pointer: fine), без prefers-reduced-motion. Кнопка злегка тягнеться за курсором
  // (CSS translate — не зсуває макет, CLS 0). Автоматично — a.btn.main, a.btn-pulse, кнопка відправки форми заявки; для іншого — data-magnet.
  var MG = '[data-magnet],a.btn.main,a.btn-pulse,form#of button[type="submit"],.lq-slot button[type="submit"]';
  function magnet() {
    if (RM || !W.matchMedia || !W.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var cur = null;
    function off() { if (cur) { cur.style.translate = ''; var c = cur; setTimeout(function () { if (c !== cur) c.classList.remove('mo-mg'); }, 350); cur = null; } }
    d.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var b = e.target.closest && e.target.closest(MG);
      if (b !== cur) { off(); if (b) { cur = b; b.classList.add('mo-mg'); } }
      if (!b) return;
      var r = b.getBoundingClientRect();
      b.style.translate = ((e.clientX - r.left - r.width / 2) * 0.16).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px';
    }, { passive: true });
    d.addEventListener('pointerleave', off);
  }

  [marquee, reveal, counters, accordion, magnet].forEach(function (f) { try { f(); } catch (e) {} });
})();
// ── Пристрої: шапка й нижня панель (.mbar) ховаються при прокрутці вниз і повертаються при прокрутці вгору (телефон ≤767px);
// панель ховається й коли відкрита клавіатура (фокус у полі форми). Стилі — розділ «Пристрої» у site-chrome.v1.css.
(function () {
  var d = document, W = window, h = d.documentElement;
  if (!W.matchMedia) return;
  var mob = W.matchMedia('(max-width:767px)');
  var app = /^\/(?:ozdoba|kabinet|konfigurator)(?:[\/.]|$)/.test(location.pathname); // власні інтерфейси: шапку не ховаємо
  var y0 = W.pageYOffset || 0, acc = 0, raf = 0, hid = false;
  function busy() { // відкрите меню, список мов або діалог — нічого не ховаємо
    return h.classList.contains('sch-lock') || !!d.querySelector('.sch-ld[open],#lb.open,#plb.open,#sdlb.open,.lb.on,.sheet.open,dialog[open]');
  }
  function set(hide) {
    if (hide === hid) return; hid = hide;
    h.classList.toggle('mb-hide', hide);
    if (!app) h.classList.toggle('sch-hide', hide);
  }
  function tick() {
    raf = 0;
    if (!mob.matches) { set(false); return; }
    var y = W.pageYOffset || 0, dy = y - y0, vh = W.innerHeight || 700;
    y0 = y;
    if (y < 80 || busy()) { acc = 0; set(false); return; }
    if (y + vh >= (d.documentElement.scrollHeight || 0) - 120) { acc = 0; set(false); return; } // кінець сторінки — контакти видно
    acc = (dy > 0) === (acc > 0) ? acc + dy : dy; // накопичуємо рух в одному напрямку (без «тремтіння» від інерції)
    if (acc > 24 && y > vh * 0.5) set(true);
    else if (acc < -36) set(false);
  }
  W.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  var on = function () { if (!mob.matches) set(false); };
  mob.addEventListener ? mob.addEventListener('change', on) : mob.addListener(on);
  // фокус у текстовому полі на телефоні = відкрита клавіатура: панель звʼязку не перекриває поле
  var TXT = /^(?:text|tel|email|search|url|number|password|date|datetime-local|month|time|week)$/;
  function isField(el) { return el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && TXT.test(el.type || 'text')) || el.isContentEditable); }
  d.addEventListener('focusin', function (e) { if (isField(e.target)) h.classList.add('mb-kbd'); });
  d.addEventListener('focusout', function () { setTimeout(function () { if (!isField(d.activeElement)) h.classList.remove('mb-kbd'); }, 60); });
  // якір (#zayavka тощо): після переходу шапка й панель видимі
  W.addEventListener('hashchange', function () { acc = 0; set(false); });
})();
// ── Компактні блоки: довгі списки на телефоні згорнуті до N пунктів + кнопка «Показати ще» (плавне розкриття).
// Розмітка: data-compact="6" на контейнері (діти — пункти); також автоматично для списків з COMPACT нижче.
// Без JS і на ширших екранах — усе видно. Приклад — /styleguide/#compact.
(function () {
  var d = document, W = window, h = d.documentElement;
  if (!W.matchMedia || !('classList' in h)) return;
  var LG = (h.lang || 'uk').slice(0, 2);
  var TX = ({ uk: ['Показати ще', 'Згорнути'], ru: ['Показать ещё', 'Свернуть'], en: ['Show more', 'Show less'], es: ['Ver más', 'Ver menos'],
              zh: ['显示更多', '收起'], pl: ['Pokaż więcej', 'Zwiń'], de: ['Mehr anzeigen', 'Weniger'], fr: ['Voir plus', 'Réduire'], ar: ['عرض المزيد', 'عرض أقل'] })[LG] || ['Show more', 'Show less'];
  var mq = W.matchMedia('(max-width:767px)');
  // автоматично (лише телефон): довгі сітки/списки, що займають кілька екранів
  // фото проєкту (.pg — 20–30 фото на всю ширину), галереї лендингів (.gal), довгі сітки карток (.grid — напр. ЖК за районами)
  var COMPACT = [['main .pg', 6], ['main .gal', 4], ['main .grid', 6]];
  var hosts = [];
  [].forEach.call(d.querySelectorAll('[data-compact]'), function (el) { hosts.push([el, parseInt(el.getAttribute('data-compact'), 10) || 6, el.hasAttribute('data-compact-all')]); });
  COMPACT.forEach(function (c) { [].forEach.call(d.querySelectorAll(c[0]), function (el) { if (!el.hasAttribute('data-compact') && !el.closest('[data-c]')) hosts.push([el, c[1], false]); }); });
  if (!hosts.length) return;
  var n = 0;
  function build(host, keep, all) {
    var items = [].filter.call(host.children, function (c) { return c.nodeType === 1 && !/^(SCRIPT|STYLE|TEMPLATE|BUTTON)$/.test(c.tagName) && !c.classList.contains('cmp-more'); });
    if (items.length <= keep + 2) return null; // ховати 1–2 пункти немає сенсу
    var extra = items.slice(keep);
    var id = host.id || ('cmp' + (++n)); host.id = id;
    var b = d.createElement('button');
    b.type = 'button'; b.className = 'cmp-more'; b.setAttribute('aria-controls', id); b.setAttribute('aria-expanded', 'false');
    b.textContent = TX[0] + ' (' + extra.length + ')';
    host.parentNode.insertBefore(b, host.nextSibling);
    var st = { host: host, extra: extra, btn: b, open: false };
    function apply() {
      var cut = (all || mq.matches) && !st.open;
      host.classList.toggle('cmp-cut', cut);
      extra.forEach(function (it) { it.classList.toggle('cmp-x', cut); });
      b.hidden = !(all || mq.matches);
    }
    b.addEventListener('click', function () {
      st.open = !st.open;
      b.setAttribute('aria-expanded', st.open ? 'true' : 'false');
      b.textContent = st.open ? TX[1] : TX[0] + ' (' + extra.length + ')';
      apply();
      if (st.open) {
        extra.forEach(function (it, i) { it.classList.remove('cmp-in'); void it.offsetWidth; it.style.animationDelay = Math.min(i, 8) * 40 + 'ms'; it.classList.add('cmp-in'); });
        var f = extra[0] && extra[0].querySelector('a,button,summary,[tabindex]'); if (f && d.activeElement === b) f.focus({ preventScroll: true });
      } else if (host.getBoundingClientRect().top < 0) host.scrollIntoView({ block: 'start' });
    });
    st.apply = apply; apply();
    return st;
  }
  var list = hosts.map(function (x) { try { return build(x[0], x[1], x[2]); } catch (e) { return null; } }).filter(Boolean);
  var on = function () { list.forEach(function (s) { s.apply(); }); };
  mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
  W.addEventListener('beforeprint', function () { list.forEach(function (s) { s.host.classList.remove('cmp-cut'); }); });
})();

/* ── Менше стіни тексту (tools/site/ux.py, /styleguide/#ux): іконки заголовків [data-i] і згортання [data-c].
   Розмітку — атрибути — ставить ux.apply() через chrome.py; місце під іконку й кнопку резервує CSS (.js …), тож вставка тут не зсуває макет.
   Згорнутий текст лишається в DOM (пошук, читачі екрана після розгортання), кнопка — <button aria-expanded aria-controls>, Enter/Space. */
(function () {
  /*ux:i18n*/var UXS = "/assets/icons.v1.svg?v=0ad217fd", UXT = {"uk":["Читати далі","Згорнути","Усі питання ({n})","Детальніше про кожен етап","Показати ще ({n})","Весь список ({n})"],"ru":["Читать дальше","Свернуть","Все вопросы ({n})","Подробнее о каждом этапе","Показать ещё ({n})","Весь список ({n})"],"en":["Read more","Show less","All questions ({n})","Details of each stage","Show more ({n})","Full list ({n})"],"es":["Leer más","Mostrar menos","Todas las preguntas ({n})","Detalles de cada etapa","Ver más ({n})","Lista completa ({n})"],"zh":["展开全文","收起","全部问题（{n}）","查看每个阶段详情","显示更多（{n}）","完整清单（{n}）"],"pl":["Czytaj dalej","Zwiń","Wszystkie pytania ({n})","Szczegóły każdego etapu","Pokaż więcej ({n})","Cała lista ({n})"],"de":["Weiterlesen","Weniger anzeigen","Alle Fragen ({n})","Details zu jeder Etappe","Mehr anzeigen ({n})","Ganze Liste ({n})"],"fr":["Lire la suite","Réduire","Toutes les questions ({n})","Détail de chaque étape","Voir plus ({n})","Liste complète ({n})"],"ar":["اقرأ المزيد","عرض أقل","كل الأسئلة ({n})","تفاصيل كل مرحلة","عرض المزيد ({n})","القائمة كاملة ({n})"]}; /*/ux:i18n*/
  var d = document, W = window, h = d.documentElement, NS = 'http://www.w3.org/2000/svg';
  var LG = (h.lang || 'uk').slice(0, 2), T = UXT[LG] || UXT.en || ['Read more', 'Show less', 'All questions ({n})', 'Step details', 'Show more ({n})', 'Full list ({n})'];
  var RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $$(s, r) { try { return [].slice.call((r || d).querySelectorAll(s)); } catch (e) { return []; } }
  var n = 0, CS = $$('[data-c]'), PAD = CS.map(function (c) { return getComputedStyle(c).paddingInlineStart; }); // читання — до вставок
  // 1. іконки: <svg class="ic"><use href="спрайт#ключ"> першою дитиною заголовка
  $$('[data-i]').forEach(function (el) {
    if (!/^H[23]$/.test(el.tagName) || (el.firstElementChild && el.firstElementChild.classList.contains('ic'))) return;
    var s = d.createElementNS(NS, 'svg'), u = d.createElementNS(NS, 'use');
    s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    u.setAttribute('href', UXS + '#' + el.getAttribute('data-i'));
    s.appendChild(u); el.insertBefore(s, el.firstChild);
  });
  // 2. згортання: t — довгий текст, s — описи етапів, q — FAQ (5), g — картки (6), l — список у статті (5)
  var HIDE = { q: ['details', 5], g: ['.grid>*', 6], l: ['li', 5] };
  CS.forEach(function (c, ci) {
    var k = c.getAttribute('data-c'), cnt = 0, lab;
    if (HIDE[k]) {
      cnt = $$(HIDE[k][0], c).filter(function (x) { return k !== 'q' || x.parentNode === c || x.parentNode.parentNode === c; }).length - HIDE[k][1];
      if (k === 'l') cnt = c.querySelectorAll(':scope>*>li').length - HIDE[k][1];
      if (cnt < 1) { c.removeAttribute('data-c'); return; }
    }
    lab = function (open) { return open ? T[1] : (k === 't' ? T[0] : k === 's' ? T[3] : T[{ q: 2, g: 4, l: 5 }[k]].replace('{n}', cnt)); };
    var id = c.id || ('ux-c' + (++n)); c.id = id;
    var b = d.createElement('button');
    b.type = 'button'; b.className = 'c-b'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', id);
    b.textContent = lab(false);
    if (PAD[ci]) b.style.insetInlineStart = PAD[ci];
    c.appendChild(b);
    b.addEventListener('click', function () {
      var open = !c.classList.contains('c-o'), h0 = c.offsetHeight;
      c.classList.toggle('c-o', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = lab(open);
      if (!RM && c.animate) {
        var h1 = c.offsetHeight;
        c.style.overflow = 'hidden';
        var an = c.animate({ height: [h0 + 'px', h1 + 'px'] }, { duration: Math.min(700, 280 + Math.abs(h1 - h0) * 0.25), easing: 'cubic-bezier(.2,.7,.2,1)' });
        an.onfinish = an.oncancel = function () { c.style.overflow = ''; };
      }
      if (!open) { var r = c.getBoundingClientRect(); if (r.top < 0) c.scrollIntoView({ block: 'start', behavior: RM ? 'auto' : 'smooth' }); }
    });
  });
  W.addEventListener('beforeprint', function () { $$('[data-c]').forEach(function (c) { c.classList.add('c-o'); }); });
})();

/* «Будинок з нуля» (section.bz[data-js]; префікс bz — .ba зайнятий слайдером «до/після»): скрипт сцени вантажимо лише після першої прокрутки сторінки (0 байтів на завантаженні) */
(function () {
  var W = window, s = document.querySelector('section.bz[data-js]');
  if (!s) return;
  function go() {
    W.removeEventListener('scroll', go);
    W.__casBAs = 1;
    var j = document.createElement('script'); j.src = s.getAttribute('data-js'); j.async = true; document.head.appendChild(j);
    var c = s.getAttribute('data-css'); // стилі — одразу разом зі скриптом, щоб сцена була готова задовго до блоку
    if (c) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = c; document.head.appendChild(l); }
  }
  if ((W.pageYOffset || 0) > 0) go(); else W.addEventListener('scroll', go, { passive: true });
})();

/* Портфоліо: тип переходу між сторінками (cross-document View Transitions, Chrome 125+; інші браузери — звичайний перехід).
   /portfolio → /proekty/<slug> — «pf-in», назад — «pf-out», проєкт → проєкт — «pf-next». Анімації — у site-chrome.v1.css. */
(function () {
  var W = window;
  if (!('onpagereveal' in W)) return;
  function k(u) {
    var p = new URL(u).pathname.replace(/\.html$/, '').replace(/^\/[a-z]{2}(?=\/)/, '');
    return /^\/proekty\/[^/]+$/.test(p) ? 'p' : /^\/portfolio\/?$/.test(p) ? 'l' : '';
  }
  W.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition, a = W.navigation && W.navigation.activation;
    if (!vt || !vt.types || !a || !a.from || !a.entry) return;
    try {
      var f = k(a.from.url), t = k(a.entry.url);
      var ty = f === 'l' && t === 'p' ? 'pf-in' : f === 'p' && t === 'l' ? 'pf-out' : f === 'p' && t === 'p' ? 'pf-next' : '';
      if (ty) vt.types.add(ty);
    } catch (x) { }
  });
})();
