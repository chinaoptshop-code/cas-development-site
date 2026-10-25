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
