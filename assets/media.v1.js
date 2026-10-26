/* CAS Development — «легкі» вбудовування (UI-kit /styleguide/#media; розмітку ставить tools/site/media.py з tools/site/media.json).
   1) Віртуальний тур 360°: <a class="lt3" href="/tury/<slug>" data-tour>постер + кнопка</a> — по кліку модальне вікно <dialog>
      з iframe власного переглядача /tury/<slug>?embed=1 (tools/tours). До кліку нічого не вантажиться. Без JS — звичайне посилання.
   2) Відео YouTube: <a class="lyt" href="https://www.youtube.com/watch?v=ID" data-yt="ID">постер i.ytimg.com + кнопка</a> —
      по кліку iframe youtube-nocookie.com на місці постера. Без JS — посилання на YouTube.
   data-demo — режим для /styleguide/: iframe не вантажимо. CSS — /assets/media.v1.css (підключається поруч). */
(function () {
  var d = document, lang = (d.documentElement.lang || 'uk').slice(0, 2);
  var T = { uk: { close: 'Закрити', tour: 'Віртуальний тур 360°', demo: 'Демо: тут відкриється тур /tury/<slug> або відео YouTube з tools/site/media.json.' },
    ru: { close: 'Закрыть', tour: 'Виртуальный тур 360°', demo: 'Демо: здесь откроется тур или видео YouTube.' },
    en: { close: 'Close', tour: 'Virtual 360° tour', demo: 'Demo: a 360° tour or a YouTube video opens here.' } };
  var t = T[lang] || T.en;
  var OWN = /^\/tury\/[a-z0-9-]+$/, YT = /^[A-Za-z0-9_-]{11}$/;
  function clarity(ev) { try { if (window.clarity) window.clarity('event', ev); } catch (x) {} }

  var dlg, frame, back;
  function closeDlg() { if (dlg && dlg.open) dlg.close(); }
  function demoNote(box) { var p = d.createElement('p'); p.className = 'lt3-demo'; p.textContent = t.demo; box.appendChild(p); }
  function openTour(a) {
    var url = a.getAttribute('href'), demo = a.hasAttribute('data-demo');
    if (!OWN.test(url) && !demo) return false;
    if (!dlg) {
      dlg = d.createElement('dialog'); dlg.className = 'lt3-d';
      var x = d.createElement('button'); x.type = 'button'; x.className = 'lt3-x'; x.setAttribute('aria-label', t.close); x.textContent = '✕';
      x.addEventListener('click', closeDlg);
      frame = d.createElement('div'); frame.className = 'lt3-f';
      dlg.appendChild(x); dlg.appendChild(frame); d.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDlg(); });
      dlg.addEventListener('close', function () { frame.textContent = ''; if (back) { try { back.focus(); } catch (e) {} } });
    }
    if (typeof dlg.showModal !== 'function') return false;
    var title = a.getAttribute('data-title') || t.tour;
    dlg.setAttribute('aria-label', title);
    frame.textContent = '';
    if (demo) demoNote(frame);
    else {
      var f = d.createElement('iframe');
      f.src = url + '?embed=1'; f.title = title;
      f.allow = 'xr-spatial-tracking; gyroscope; accelerometer; fullscreen'; f.allowFullscreen = true;
      frame.appendChild(f);
    }
    back = a;
    dlg.showModal();
    clarity('tour360_open');
    return true;
  }
  function playYt(a) {
    var id = a.getAttribute('data-yt'), demo = a.hasAttribute('data-demo');
    if (!YT.test(id || '') && !demo) return false;
    var box = d.createElement('div'); box.className = 'lyt lyt-on';
    if (demo) demoNote(box);
    else {
      var f = d.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
      f.title = a.getAttribute('data-title') || 'YouTube';
      f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen'; f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      box.appendChild(f);
    }
    a.replaceWith(box);
    var fr = box.firstChild; if (fr && fr.focus) try { fr.focus(); } catch (e) {}
    clarity('video_play');
    return true;
  }
  d.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest && e.target.closest('a.lt3[data-tour], a.lyt[data-yt]');
    if (!a) return;
    if (a.classList.contains('lt3') ? openTour(a) : playYt(a)) e.preventDefault();
  });
})();
