/* Єдина шапка сайту: бургер і повноекранне меню (розмітка — tools/site/chrome.py). */
/* Формат чисел мови сторінки — той самий, що в текстах сайту (tools/site/i18n.py: num, usd): тисячі — «,» лише en ($1,100),
   інші мови — нерозривний пробіл ($1 100, 23 000 ₴); дріб — «.» en, «,» інші; $ — перед числом у всіх мовах.
   Спільні для сцен, квізу, калькулятора й Оздоби: window.casNum(n, мова?, знаків?), window.casUsd(n, мова?). */
(function (W) {
  function lg(l) { return String(l || document.documentElement.lang || 'uk').slice(0, 2).toLowerCase(); }
  W.casNum = function (n, l, dp) {
    var en = lg(l) === 'en', p = (dp == null ? String(Math.round(+n * 1000) / 1000) : (+n).toFixed(dp)).split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, en ? ',' : '\u00a0') + (p[1] ? (en ? '.' : ',') + p[1] : '');
  };
  W.casUsd = function (n, l) { return '$' + W.casNum(Math.round(+n), l); };
})(window);
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
  // «Усі послуги студії» — згорнуто на всіх сторінках і ширинах (Михайло 05.11.2026); посилання лишаються в DOM (SEO)
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
  function $$(s, r) { try { return [].slice.call((r || d).querySelectorAll(s)); } catch (e) { return []; } }
  var main = d.querySelector('main') || d.body;

  // 1. Поява при скролі прибрана (Михайло 06.11.2026, unslop): контент видно одразу, без зсуву й затемнення.

  // 2. Лічильники фактів (150+, 10+, 12 міс.) не анімуємо: count-up від нуля під час прокрутки показував хибні «12+ проєктів»,
  // «3 міс. гарантія». У HTML — одразу фінальне значення (QA 03.11.2026).

  // 3. Стрічки (marquee): галерея фото на головній (.strip) і в «Про нас» (.abg), ряди посилань «Інші послуги» (.rel, від 7),
  // «Статті по темі» (.rel.arts, від 4) і будь-який [data-marquee]. Лише якщо вміст ширший за контейнер.
  // Вимкнути на конкретному ряду: data-marquee="off"; швидкість: data-marquee-speed="40" (px/с).
  var MQ = '[data-marquee],.rel:has(>a:nth-child(7)):not(:has(>a[href^="#"])):not(.xs-all>.rel),.rel.arts:has(>a:nth-child(4)),.strip,.abg'; // «Ще послуги (N)» (.xs-all) — не стрічка, а розгортання з переносом
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

  [marquee, accordion, magnet].forEach(function (f) { try { f(); } catch (e) {} });
})();
// ── Кнопка «Зв'язатися» (.mbar[data-one], tools/site/chrome.py mbar_lead): тап — меню (Подзвонити, Telegram, WhatsApp, Viber, «Залишити номер»);
// закривається повторним тапом, тапом поза меню, Esc і після вибору пункту. «Залишити номер» прокручує до форми — /assets/lead-form.v1.js.
(function () {
  var d = document, bar = d.querySelector('.mbar[data-one]');
  if (!bar) return;
  var tg = bar.querySelector('.mb-tg');
  function set(v) { bar.classList.toggle('open', v); tg.setAttribute('aria-expanded', v ? 'true' : 'false'); }
  tg.addEventListener('click', function () { set(!bar.classList.contains('open')); if (bar.classList.contains('open')) { var a = bar.querySelector('.mb-menu a'); if (a) try { a.focus({ preventScroll: true }); } catch (e) { } } });
  bar.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.mb-menu a')) set(false); });
  d.addEventListener('click', function (e) { if (bar.classList.contains('open') && !bar.contains(e.target)) set(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && bar.classList.contains('open')) { set(false); tg.focus(); } });
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
  var COMPACT = [['main .pg', 6], ['main .gal', 4], ['main .grid:not(#grid)', 6]]; // #grid — каталог Оздоби з власною «Показати ще» (QA5: дві кнопки й CLS)
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
    if (k === 'x') return tile(c);
    if (k === 'h') return lead(c);
    if (k === 'k') return cards(c);
    if (HIDE[k]) {
      var lim = +c.getAttribute('data-cn') || HIDE[k][1]; // data-cn — скільки лишити на виду (FAQ Оздоби — 3)
      cnt = $$(HIDE[k][0], c).filter(function (x) { return k !== 'q' || x.parentNode === c || x.parentNode.parentNode === c; }).length - lim;
      if (k === 'l') cnt = c.querySelectorAll(':scope>*>li').length - HIDE[k][1];
      if (cnt < 1) { c.removeAttribute('data-c'); return; }
    }
    if (k === 't' && !c.querySelector(':scope>p:first-of-type~:is(p,ul,ol,h3,h4,blockquote,dl,.xs-vals)')) { // один абзац, що й так вміщається (широкий екран): кнопка зайва
      var p1 = c.querySelector(':scope>p'); if (p1 && p1.scrollHeight <= p1.clientHeight + 1 && c.getBoundingClientRect().top > (W.innerHeight || 0)) { c.removeAttribute('data-c'); return; }
    }
    lab = function (open) { return open ? T[1] : (k === 't' ? T[0] : k === 's' ? (c.querySelector('ol') ? T[3] : T[0]) : T[{ q: 2, g: 4, l: 5 }[k]].replace('{n}', cnt)); };
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
  // 3. легкі сторінки: плитка [data-c=x] — H2 стає кнопкою (aria-expanded), тап по плитці розгортає її на всю ширину сітки
  function anim(el, h0) {
    if (RM || !el.animate) return;
    var h1 = el.offsetHeight; el.style.overflow = 'hidden';
    var an = el.animate({ height: [h0 + 'px', h1 + 'px'] }, { duration: Math.min(650, 260 + Math.abs(h1 - h0) * 0.2), easing: 'cubic-bezier(.2,.7,.2,1)' });
    an.onfinish = an.oncancel = function () { el.style.overflow = ''; };
  }
  function tile(c) {
    var h2 = c.querySelector('h2');
    if (!h2) { c.removeAttribute('data-c'); return; }
    var id = c.id || ('ux-c' + (++n)); c.id = id;
    var sec = c.tagName === 'SECTION' ? c : c.parentNode, b = d.createElement('button');
    b.type = 'button'; b.className = 'ux-h'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', id);
    while (h2.firstChild) b.appendChild(h2.firstChild);
    h2.appendChild(b);
    c.uxSet = function (open, tap) {
      if (open === c.classList.contains('c-o')) return;
      var h0 = sec.offsetHeight, y0 = b.getBoundingClientRect().top;
      c.classList.toggle('c-o', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
      // тап: плитка на всю ширину сітки переїжджає в інший ряд — тримаємо її заголовок там, де був палець (без стрибка)
      if (tap) { var dy = b.getBoundingClientRect().top - y0; if (Math.abs(dy) > 2) W.scrollTo({ top: W.scrollY + dy, behavior: 'instant' }); }
      anim(sec, h0);
      var r = sec.getBoundingClientRect();
      if (!tap && (r.top < 0 || (open && r.top > W.innerHeight * 0.75))) sec.scrollIntoView({ block: 'start', behavior: RM ? 'auto' : 'smooth' });
      else if (tap && b.getBoundingClientRect().top < 0) b.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    b.addEventListener('click', function () { c.uxSet(!c.classList.contains('c-o'), true); });
  }
  // компактні картки [data-c=k]: назва + перший рядок; кнопка-шеврон (aria-expanded) або тап по картці — деталі
  function cards(g) {
    $$(':scope>.card', g).forEach(function (cd) {
      var h3 = cd.querySelector('h3'); if (!h3 || cd.children.length < 3) return;
      var id = cd.id || ('ux-k' + (++n)); cd.id = id;
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'ux-k'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', id);
      b.setAttribute('aria-label', T[0] + ': ' + h3.textContent.trim());
      cd.appendChild(b); cd.classList.add('ux-kc');
      var t = function () { var o = !cd.classList.contains('c-o'), h0 = cd.offsetHeight; cd.classList.toggle('c-o', o); b.setAttribute('aria-expanded', o ? 'true' : 'false'); anim(cd, h0); };
      b.addEventListener('click', t);
      cd.addEventListener('click', function (e) { if (!e.target.closest('a,button,input,select,textarea')) t(); });
    });
  }
  // лід hero [data-c=h]: один рядок; тап / Enter / Space — увесь текст
  function lead(c) {
    if (!c.closest('.card') && !c.querySelector('.ux-rest,.ux-dup')) return; // лід з одного речення — нічого згортати
    c.setAttribute('role', 'button'); c.tabIndex = 0; c.setAttribute('aria-expanded', 'false');
    var t = function (e) { if (e && e.target.closest && e.target.closest('a')) return; var o = !c.classList.contains('c-o'); c.classList.toggle('c-o', o); c.setAttribute('aria-expanded', o ? 'true' : 'false'); };
    c.addEventListener('click', t);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
  }
  // якір усередині згорнутої плитки (#faq, посилання «детальніше» тощо) — спершу розгорнути
  function reveal(hash) {
    var el = null; try { el = hash && hash.length > 1 && d.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { }
    var c = el && el.closest && el.closest('[data-c=x]');
    if (c && c.uxSet && !c.classList.contains('c-o')) c.uxSet(true);
  }
  d.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) reveal(a.getAttribute('href')); }, true);
  W.addEventListener('hashchange', function () { reveal(location.hash); });
  if (location.hash) reveal(location.hash);
  W.addEventListener('beforeprint', function () { $$('[data-c]').forEach(function (c) { c.classList.add('c-o'); }); });
})();

/* Сцени: спільне керування (Михайло 03.11.2026 — «менш чутливі до колеса» + «самі потрішки прокручуються»).
   casDrive — прогрес sticky-сцени за прокруткою: ≥ ~50vh доріжки на етап (CSS сцен), згладжування (lerp) і обмеження швидкості
   (не швидше за етап / 320 мс), не більше одного етапу за ~330 мс (одне «клацання» колеса — максимум один етап), дрібні дельти
   трекпада (< 0.02 етапу) ігноруються; wheel не перехоплюємо — сторінка гортається як завжди. off — зсув від автопрогравання.
   casAuto — автопрогравання: сцена в кадрі (IntersectionObserver), вкладка видима, людина не чіпає — крок раз на 3.5 с;
   дія в сцені (колесо, клік, тач, клавіша) — пауза 9 с, прокрутка сторінки — 3 с; кнопка ❚❚/▶/↻ (44 px, aria-label; WCAG 2.2.2);
   на останньому етапі — стоп і «Ще раз». prefers-reduced-motion — без автопрогравання й без кнопки. */
(function () {
  var W = window, d = document;
  var RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var T = { uk: ['Пауза анімації', 'Відтворити анімацію', 'Ще раз'], ru: ['Пауза анимации', 'Воспроизвести анимацию', 'Ещё раз'],
    en: ['Pause animation', 'Play animation', 'Replay'], es: ['Pausar animación', 'Reproducir animación', 'Repetir'], zh: ['暂停动画', '播放动画', '重播'],
    pl: ['Wstrzymaj animację', 'Odtwórz animację', 'Jeszcze raz'], de: ['Animation anhalten', 'Animation abspielen', 'Nochmal'],
    fr: ['Mettre l’animation en pause', 'Lire l’animation', 'Rejouer'], ar: ['إيقاف الحركة مؤقتًا', 'تشغيل الحركة', 'إعادة'] };
  function now() { return Date.now(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // o: {n (число або функція), min (старт, напр. 0.6), raw() → прогрес за прокруткою в етапах або null, render(cur, act), view (елемент для IO)}
  W.casDrive = function (o) {
    var min = o.min || 0, cur = min, raw = null, off = 0, act = -1, tAct = 0, raf = 0, last = 0, live = false, snap = true;
    function N() { return typeof o.n === 'function' ? o.n() : o.n; } // n може змінитися (інша технологія стін — інша кількість етапів)
    function tgt() { return clamp((raw == null ? min : raw) + off, min, N() - 0.001); }
    function read() {
      var r = o.raw(); if (r == null) return;
      if (raw == null || snap) { raw = r; return; }
      var dr = r - raw; if (Math.abs(dr) < 0.02) return; // дрібні дельти трекпада
      raw = r;
      if (off) { var k = Math.min(Math.abs(off), Math.abs(dr) * 0.5); off -= off > 0 ? k : -k; } // зсув автопрогравання тане при прокрутці
    }
    function frame(ts) {
      raf = 0; var t = now(), dt = Math.min(64, last ? t - last : 16); last = t;
      read();
      var g = tgt();
      if (snap) { cur = g; snap = false; act = Math.floor(cur); tAct = t; o.render(cur, act); return; }
      var step = (g - cur) * 0.16, cap = dt / 320; step = clamp(step, -cap, cap);
      var c = cur + step;
      if (Math.abs(g - c) < 0.003) c = g;
      var a = Math.floor(c);
      if (a !== act) {
        if (t - tAct < 330) c = clamp(c, act, act + 0.999); // етап щойно змінився — тримаємо
        else { a = clamp(a, act - 1, act + 1); c = clamp(c, a, a + 0.999); act = a; tAct = t; }
      }
      cur = c; o.render(cur, act);
      if (cur !== g) raf = W.requestAnimationFrame(frame); else last = 0;
    }
    function kick() { if (!raf) raf = W.requestAnimationFrame(frame); }
    W.addEventListener('scroll', function () { if (live) kick(); }, { passive: true });
    W.addEventListener('resize', function () { kick(); }, { passive: true });
    if (o.view && 'IntersectionObserver' in W) new IntersectionObserver(function (es) {
      live = es[es.length - 1].isIntersecting;
      if (!live) { off = 0; snap = true; } // поза кадром — без зсуву; на вході стрибаємо одразу в положення за прокруткою
      kick();
    }).observe(o.view); else live = true;
    return {
      kick: kick,
      act: function () { return act; },
      // крок автопрогравання: +1 етап без прокрутки сторінки (зсув off); false — уже останній
      step: function () { var g = tgt(); if (Math.floor(g) >= N() - 1) return false; off += Math.floor(g) + 1.9 - g; kick(); return true; },
      restart: function () { off = min - (raw == null ? min : raw); snap = true; kick(); },
      reset: function () { off = 0; kick(); }, // перед go(): кнопки ←/→ ведуть прокруткою
      atEnd: function () { return act >= N() - 1; }
    };
  };
  // o: {root, view, host (куди кнопку), before?, cls?, step() → bool, restart(), atEnd()}
  W.casAuto = function (o) {
    if (RM || !o.root) return null;
    var lang = (d.documentElement.lang || 'uk').slice(0, 2), t = T[lang] || T.en, user = false, ended = false, live = false, quiet = now() + 3000, lastStep = 0, iv = 0;
    // компактна сцена головної (o.cmp, за замовчуванням — сторінка з .hx-home; QA 06.11: «проскролили за ~2 с — побачили 1–2 етапи»):
    // грає лише коли кадр видно ≥ 60% (від меншого з кадру й екрана), прокрутка сторінки її не ставить на паузу (сцена від прокрутки не залежить),
    // перший крок — через 1.6 с після входу в кадр; повернулися до сцени після ≥ 4 с поза кадром (або вона дограла) і не чіпали її — знову з 1-го етапу
    var cmp = o.cmp != null ? !!o.cmp : !!d.querySelector('.hx-home'), touched = false, outAt = 0;
    var b = d.createElement('button'); b.type = 'button'; b.className = 'sc-ap' + (o.cls ? ' ' + o.cls : '');
    function lab() {
      var k = ended ? 2 : user ? 1 : 0; b.setAttribute('aria-label', t[k]); b.title = t[k];
      b.innerHTML = '<span aria-hidden="true">' + (ended ? '↻' : user ? '▶' : '❚❚') + '</span>'; b.setAttribute('data-st', ended ? 'end' : user ? 'off' : 'on');
    }
    lab();
    if (o.host) o.host.insertBefore(b, o.before || null);
    function poke(ms) { quiet = Math.max(quiet, now() + ms); }
    ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (e) { o.root.addEventListener(e, function () { touched = true; poke(9000); }, { passive: true }); });
    if (!cmp) W.addEventListener('scroll', function () { if (live) poke(3000); }, { passive: true });
    b.addEventListener('click', function () {
      if (ended) { ended = false; user = false; o.restart(); } else user = !user;
      quiet = now() + (user ? 0 : 900); lastStep = now(); lab();
    });
    function loop() {
      if (ended && !o.atEnd()) { ended = false; lab(); }
      if (!live || user || ended || d.hidden) return;
      var t0 = now(); if (t0 < quiet || t0 - lastStep < 3500) return;
      lastStep = t0;
      if (!o.step()) { ended = true; lab(); }
    }
    function run(v) {
      if (v === live) return;
      live = v; clearInterval(iv); iv = 0;
      if (!v) { outAt = now(); return; }
      if (cmp && !touched && !user && (ended || (outAt && now() - outAt > 4000)) && o.restart) { ended = false; o.restart(); lab(); }
      quiet = now() + (cmp ? 1600 : 1500); lastStep = 0; iv = setInterval(loop, 250);
    }
    if ('IntersectionObserver' in W) new IntersectionObserver(function (es) {
      var e = es[es.length - 1], h = e.boundingClientRect.height, vh = e.rootBounds ? e.rootBounds.height : W.innerHeight;
      if (!cmp) return run(e.intersectionRatio >= 0.5);
      run(e.isIntersecting && h > 0 && e.intersectionRect.height / Math.min(h, vh || h) >= 0.6);
    }, { threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] }).observe(o.view || o.root);
    d.addEventListener('visibilitychange', function () { if (!d.hidden) poke(1500); });
    return { poke: poke, btn: b };
  };
  /* casGest — керування сцен мишею й пальцем (Михайло 05.11 «як тут прокручувати анімацію?», 06.11 «коли наводиш — щоб прокручувалось; коли збоку — проклацувати»):
     усі сцени — компактні на головних і повні sticky на сторінках послуг.
     • колесо/трекпад, коли курсор над кадром сцени (o.zone — сам 3D/SVG-кадр; кадр ≥ 60% видимий) — ±1 етап за жест (≥ 450 мс між кроками;
       інерцію трекпада ковтаємо, довга свідома прокрутка — ще етап раз на ≥ 1 с); на першому/останньому етапі колесо не перехоплюємо — сторінка гортається; поза кадром — теж сторінка.
       Повна sticky-сцена: крок — o.go(i), що плавно прокручує сторінку до позиції етапу на доріжці (casDrive далі веде прогрес за прокруткою, тож
       колесо над кадром і прокрутка поруч — один і той самий стан, без боротьби).
     • клік / тап у лівій або правій чверті кадру (≥ 44 px; RTL — дзеркально) — попередній / наступний етап; на миші — курсор-рука й ледь помітний
       шеврон ‹ › біля краю (reduced-motion — без анімації); кнопки, посилання, поля й панелі o.skip поверх кадру не чіпаємо; після перетягування — не клік.
     • свайп / перетягування мишею ←/→ — етап назад/вперед; ←/→ при фокусі в блоці (o.root).
     Підказка мовою сторінки — один раз (o.hint), зникає після першої дії (localStorage, з try/catch).
     o: {root, view (де слухаємо), zone? (елемент або функція → кадр; за замовчуванням view), skip? (селектор панелей поверх кадру), go(i), cur() → етап,
         n() → кількість, hint?, before?} */
  var HINT = { uk: ['Етапи: наведіть і прокрутіть колесом або клацніть збоку · програється сама', 'Етапи: свайп або торкніться краю сцени · програється сама'],
    ru: ['Этапы: наведите и прокрутите колесом или кликните сбоку · проигрывается сама', 'Этапы: свайп или коснитесь края сцены · проигрывается сама'],
    en: ['Stages: hover and scroll the wheel, or click a side · plays by itself', 'Stages: swipe or tap a side of the scene · plays by itself'],
    es: ['Etapas: pasa el cursor y gira la rueda, o haz clic en un lado · se reproduce sola', 'Etapas: desliza o toca un lado de la escena · se reproduce sola'],
    zh: ['阶段：悬停并滚动滚轮，或点击两侧 · 自动播放', '阶段：滑动或轻点场景两侧 · 自动播放'],
    pl: ['Etapy: najedź i przewiń kółkiem lub kliknij z boku · odtwarza się sama', 'Etapy: przesuń lub dotknij boku sceny · odtwarza się sama'],
    de: ['Etappen: Maus darüber und Rad drehen oder seitlich klicken · läuft von selbst', 'Etappen: wischen oder seitlich tippen · läuft von selbst'],
    fr: ['Étapes : survolez et tournez la molette, ou cliquez sur un côté · se lit toute seule', 'Étapes : glissez ou touchez un côté de la scène · se lit toute seule'],
    ar: ['المراحل: مرّر المؤشر وأدر العجلة أو انقر على أحد الجانبين · تعمل تلقائيًا', 'المراحل: اسحب أو المس أحد جانبي المشهد · تعمل تلقائيًا'] };
  var FINE = W.matchMedia && W.matchMedia('(hover: hover) and (pointer: fine)').matches, CTRL = 'button,a,input,select,textarea,label,summary,[role=button]';
  function seen(v) { try { if (v) W.localStorage.setItem('casScHint', '1'); return W.localStorage.getItem('casScHint') === '1'; } catch (e) { return !!v; } }
  var chev = null; // один шеврон на сторінку (position:fixed у body — без зсуву макета)
  function chv(r, side, y, dis) {
    if (!chev) { chev = d.createElement('span'); chev.className = 'sc-chev'; chev.setAttribute('aria-hidden', 'true'); chev.dir = 'ltr'; d.body.appendChild(chev); }
    if (!r) { chev.classList.remove('is-on'); return; }
    chev.textContent = side < 0 ? '‹' : '›'; chev.classList.toggle('is-dis', !!dis);
    chev.style.left = Math.round(side < 0 ? r.left + 10 : r.right - 54) + 'px';
    chev.style.top = Math.round(Math.max(r.top + 8, Math.min(r.bottom - 52, y - 22))) + 'px';
    chev.classList.add('is-on');
  }
  W.casGest = function (o) {
    if (!o || !o.root || !o.view) return null;
    var lang = (d.documentElement.lang || 'uk').slice(0, 2), rtl = d.documentElement.dir === 'rtl', hint = null, x0 = 0, y0 = 0, pid = null, moved = false;
    var tW = 0, tStep = 0, tg = 0, pk = 0, v = o.view;
    function n() { return typeof o.n === 'function' ? o.n() : o.n; }
    function zone() { var z = typeof o.zone === 'function' ? o.zone() : o.zone; return z || v; }
    // поточний етап: одразу після кроку беремо свою ціль (повна сцена ще доїжджає плавною прокруткою — інакше подвійний крок з того самого етапу)
    function cur() { return Date.now() - tStep < 900 ? tg : o.cur(); }
    function step(k) { var c = cur(), t = Math.max(0, Math.min(n() - 1, c + k)); if (t === c) return false; tg = t; tStep = Date.now(); o.go(t); done(); return true; }
    function done() { if (hint) { hint.classList.add('is-off'); var h = hint; hint = null; setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 400); } seen(1); }
    if (o.hint && !seen()) {
      hint = d.createElement('p'); hint.className = 'sc-hint'; hint.textContent = (HINT[lang] || HINT.en)[FINE ? 0 : 1].split(RM ? ' · ' : '\u0000')[0]; // reduced-motion — без «програється сама»
      o.hint.insertBefore(hint, o.before || null);
    }
    function off(t) { return !t || !t.closest || !!t.closest(CTRL) || !!(o.skip && t.closest(o.skip)); }
    function inZone(t) { var z = zone(); return !!(t && (t === z || (z.contains && z.contains(t)))); }
    // −1 / +1 — лівий/правий край кадру (у напрямку етапів: RTL — дзеркально), 0 — середина
    function edge(e) {
      var r = zone().getBoundingClientRect(), w = r.width, ew = Math.max(44, w * 0.25), x = e.clientX - r.left;
      if (w < 120 || x < 0 || x > w || e.clientY < r.top || e.clientY > r.bottom) return [0, r];
      var s = x < ew ? -1 : x > w - ew ? 1 : 0; return [s, r];
    }
    v.style.touchAction = 'pan-y'; // вертикальний свайп — сторінка, горизонтальний — етапи
    v.addEventListener('pointerdown', function (e) { moved = false; if (e.button || off(e.target)) return; pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; });
    function hov(e) {
      var z = zone(), s = 0, q = null;
      if (n() > 1 && inZone(e.target) && !off(e.target)) { q = edge(e); s = q[0]; }
      if (!s) { z.removeAttribute('data-scz'); chv(null); return; }
      var k = rtl ? -s : s, c = cur(), dis = (k < 0 && c <= 0) || (k > 0 && c >= n() - 1);
      z.setAttribute('data-scz', dis ? 'x' : s < 0 ? 'p' : 'n'); chv(q[1], s, e.clientY, dis);
    }
    v.addEventListener('pointermove', function (e) {
      if (pid === e.pointerId && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 10) moved = true;
      if (e.pointerType === 'mouse') hov(e);
    });
    v.addEventListener('pointerleave', function () { zone().removeAttribute('data-scz'); chv(null); });
    W.addEventListener('scroll', function () { if (chev && chev.classList.contains('is-on')) chv(null); }, { passive: true });
    v.addEventListener('pointerup', function (e) {
      if (pid !== e.pointerId) return; pid = null;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      step((dx < 0) !== rtl ? 1 : -1);
    });
    v.addEventListener('pointercancel', function () { pid = null; moved = true; });
    v.addEventListener('dragstart', function (e) { e.preventDefault(); });
    // клік збоку — у фазі захоплення: раніше за обробники обʼєктів у кадрі (Комплекс: клік по обʼєкту відкриває його)
    v.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      if (n() < 2 || off(e.target) || !inZone(e.target)) return;
      var s = edge(e)[0]; if (!s) return;
      e.stopPropagation(); e.preventDefault();
      step(rtl ? -s : s);
      if (FINE) hov(e); // оновити шеврон: на краю етапів — тьмяний
    }, true);
    v.addEventListener('wheel', function (e) {
      if (e.ctrlKey) return; // масштаб сторінки
      var dl = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX * (rtl ? -1 : 1) : e.deltaY; if (!dl) return;
      if (n() < 2 || !inZone(e.target) || (o.skip && e.target.closest && e.target.closest(o.skip))) return; // панелі поверх кадру й поза ним — сторінка
      var r = zone().getBoundingClientRect(), vis = (Math.min(r.bottom, W.innerHeight) - Math.max(r.top, 0)) / Math.max(1, Math.min(r.height, W.innerHeight));
      var t = Date.now(), gap = t - tW, c = cur(), k = dl > 0 ? 1 : -1, ad = Math.abs(dl);
      if (gap > 220) pk = 0; pk = Math.max(pk, ad); // новий жест: пік дельти — щоб відрізнити інерцію (дельти згасають) від довгої свідомої прокрутки
      var tail = gap < 220 && t - tStep < 600; // той самий жест щойно зробив крок (до краю) — доковтуємо його хвіст, щоб сторінка не смикнулась
      if (vis < 0.6 || (!tail && ((k < 0 && c <= 0) || (k > 0 && c >= n() - 1)))) { tW = t; return; } // край — сторінка гортається як завжди
      e.preventDefault(); tW = t;
      if (ad < 4 && gap < 200) return; // інерційний хвіст трекпада
      // один жест — один етап; той самий безперервний жест робить ще крок лише через 1 с і лише якщо дельти не згасають (не інерція)
      if (gap > 220 ? t - tStep >= 450 : (t - tStep > 1000 && ad >= pk * 0.5)) step(k);
    }, { passive: false });
    o.root.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.target.closest && e.target.closest('input,select,textarea,.bz-nav'))) return;
      var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return;
      if (rtl) k = -k;
      if (step(k)) e.preventDefault();
    });
    ['click', 'keydown'].forEach(function (t) { o.root.addEventListener(t, function (e) { if (e.target.closest && e.target.closest('button')) done(); }); });
    return { done: done };
  };
})();

/* Сцени (section.bz[data-js]: «Будинок з нуля», «Ландшафт», «Комплекс», «Ресторан», «Будинок на воді»; префікс bz — .ba зайнятий слайдером «до/після»):
   скрипти сцен і спільні стилі керування /assets/scene-ui.v1.css вантажимо лише після першої прокрутки (0 байтів на завантаженні).
   Перемикач сцен nav.la-tab — на місці: клік підтягує блок сцени з її сторінки (fetch + DOMParser, той самий origin), ставить його замість
   поточного, переносить перемикач і вантажить JS/CSS сцени; <a href> лишаються для SEO й без JS. Показані сцени живуть у пам'яті — повернення миттєве. */
(function () {
  var W = window, d = document, ss = d.querySelectorAll('section.bz[data-js]'); // кілька сцен на сторінці — кожна свій скрипт
  if (!ss.length) return;
  /*sc:ui*/var SCUI = "/assets/scene-ui.v1.css?v=34360f40"; /*/sc:ui*/
  var on = 0;
  function css(h) { if (!h || d.querySelector('link[href="' + h + '"]')) return; var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = h; d.head.appendChild(l); }
  function js(s) { var j = d.createElement('script'); j.src = s; j.async = true; j.onerror = function () { [].forEach.call(d.querySelectorAll('section.bz[data-js]'), function (x) { if (x.getAttribute('data-js') === s) x.classList.add('bz-no'); }); }; d.head.appendChild(j); } // скрипт сцени не завантажився — без резерву висоти
  function go() {
    W.removeEventListener('scroll', go);
    if (on) return; on = 1;
    W.__casBAs = 1;
    css(SCUI);
    var seen = {};
    [].forEach.call(ss, function (s) {
      var src = s.getAttribute('data-js'); if (seen[src]) return; seen[src] = 1;
      js(src);
      css(s.getAttribute('data-css')); // стилі — одразу разом зі скриптом, щоб сцена була готова задовго до блоку
    });
  }
  if ((W.pageYOffset || 0) > 0) go(); else W.addEventListener('scroll', go, { passive: true });

  var keep = {}; // url#id → блок сцени (живий: після повернення працює без повторного запуску)
  function key(u) { return u.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') + '#' + u.hash.slice(1); }
  function load(u) {
    var k = key(u);
    if (keep[k]) return Promise.resolve(keep[k]);
    return fetch(u.pathname, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
      var x = new DOMParser().parseFromString(t, 'text/html').getElementById(u.hash.slice(1));
      if (!x || !x.matches('section.bz[data-js]')) throw 0;
      x = d.importNode(x, true); x.setAttribute('data-sw', ''); x.__new = 1;
      return (keep[k] = x);
    });
  }
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('nav.la-tab a');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !W.fetch || !W.DOMParser || !W.Promise) return;
    var nav = a.parentNode, sec = nav.closest('section'), u = new URL(a.href, location.href);
    if (!sec || u.origin !== location.origin || !u.hash) return;
    e.preventDefault();
    if (a.hasAttribute('aria-current') || nav.getAttribute('aria-busy') === 'true') return;
    var here = new URL(location.href); here.hash = sec.id;
    if (!keep[key(here)]) keep[key(here)] = sec; // блок, з яким прийшла сторінка — для кнопки «назад» у перемикачі
    if (u.pathname.replace(/\.html$/, '') === here.pathname.replace(/\.html$/, '') && !keep[key(u)]) { var own = d.getElementById(u.hash.slice(1)); if (own && own.matches('section.bz[data-js]')) keep[key(u)] = own; }
    nav.setAttribute('aria-busy', 'true');
    go();
    load(u).then(function (x) {
      var top = nav.getBoundingClientRect().top;
      var old = x.querySelector('nav.la-tab'); if (old && old !== nav) old.remove();
      var w = x.querySelector('.w') || x; w.insertBefore(nav, w.firstChild);
      [].forEach.call(nav.querySelectorAll('a'), function (b) { if (b === a) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      if (x !== sec) { sec.parentNode.replaceChild(x, sec); x.classList.remove('la-sw'); void x.offsetWidth; x.classList.add('la-sw'); }
      W.scrollBy({ top: nav.getBoundingClientRect().top - top, behavior: 'instant' }); // перемикач лишається на тому ж місці екрана
      if (x.__new) { x.__new = 0; css(x.getAttribute('data-css')); js(x.getAttribute('data-js')); }
      try { if (W.clarity) W.clarity('event', 'scene_tab'); } catch (er) { }
    }).catch(function () { location.href = a.href; }).then(function () { nav.removeAttribute('aria-busy'); });
  });
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
