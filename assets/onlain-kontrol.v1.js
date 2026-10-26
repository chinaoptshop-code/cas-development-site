/* CAS Development — вкладки демо «Онлайн-контроль» (/onlain-kontrol). Без JS видно всі панелі; з JS — одна, ← → між вкладками. */
(function () {
  'use strict';
  document.querySelectorAll('.okd').forEach(function (d) {
    var tabs = [].slice.call(d.querySelectorAll('[role=tab]'));
    if (!tabs.length) return;
    d.classList.add('js');
    function show(t, focus) {
      tabs.forEach(function (x) {
        var on = x === t, p = document.getElementById(x.getAttribute('aria-controls'));
        x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        if (p) p.hidden = !on;
      });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(t); });
      t.addEventListener('keydown', function (e) {
        var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!k) return;
        e.preventDefault(); show(tabs[(i + k + tabs.length) % tabs.length], true);
      });
    });
    show(tabs[0]);
    // демо-годинник камери
    var tm = d.querySelector('[data-okd-time]');
    if (tm) {
      var tick = function () { tm.textContent = new Date().toLocaleTimeString(document.documentElement.lang || 'uk', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
      tick(); setInterval(tick, 1000);
    }
  });
})();
