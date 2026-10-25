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
  // «Усі послуги студії»: на десктопі відкрито, на мобільному згорнуто
  var svc = d.querySelector('.scf-svc');
  if (svc && window.matchMedia && window.matchMedia('(min-width:760px)').matches) svc.open = true;
})();
