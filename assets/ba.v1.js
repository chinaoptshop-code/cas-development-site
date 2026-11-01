/* CAS — слайдер «до / після» (.ba; розмітка — tools/site/landing.py ba_html, документація — /styleguide/#ba).
   Мишею/пальцем — тягнути будь-де по фото (вертикальна прокрутка сторінки лишається: touch-action:pan-y);
   клавіатура на ручці (role="slider"): ←/→ ±5%, PageUp/PageDown ±10%, Home/End — 0/100%. Без бібліотек. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  function init(f) {
    if (f.dataset.baOn) return;
    f.dataset.baOn = '1';
    var h = f.querySelector('.ba-h'), drag = false;
    if (!h) return;
    function set(v, anim) {
      v = Math.max(0, Math.min(100, Math.round(v * 10) / 10));
      f.classList.toggle('ba-anim', !!anim && !(reduce && reduce.matches));
      f.style.setProperty('--p', v + '%');
      h.setAttribute('aria-valuenow', Math.round(v));
      h.setAttribute('aria-valuetext', Math.round(v) + '%');
    }
    function at(e) {
      var r = f.getBoundingClientRect();
      if (r.width) set((e.clientX - r.left) / r.width * 100);
    }
    f.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      drag = true;
      try { f.setPointerCapture(e.pointerId); } catch (x) {}
      at(e);
      try { h.focus({ preventScroll: true }); } catch (x) {}
    });
    f.addEventListener('pointermove', function (e) { if (drag) at(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { f.addEventListener(n, function () { drag = false; }); });
    h.addEventListener('keydown', function (e) {
      var v = +h.getAttribute('aria-valuenow'), k = e.key,
        d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -10, PageUp: 10 }[k];
      if (d != null) set(v + d, true);
      else if (k === 'Home') set(0, true);
      else if (k === 'End') set(100, true);
      else return;
      e.preventDefault();
    });
    set(+h.getAttribute('aria-valuenow') || 50);
  }
  function all() { Array.prototype.forEach.call(document.querySelectorAll('.ba'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
  window.casBA = all; // для блоків, доданих динамічно
})();
