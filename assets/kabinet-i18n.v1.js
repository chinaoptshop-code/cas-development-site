/* CAS Development — мови кабінету клієнта (/kabinet, /kabinet/obiekt, /kabinet/proekty, /kabinet/profil…). Один URL на всі мови.
   Мову визначає інлайн-скрипт у <head> (tools/shop/kabinet_v2.py → HEAD_JS): ?lang=xx → збережена (localStorage 'cas-kab-lang' і cookie cas_lang)
   → сторінка сайту, з якої прийшли (/en/… → en) → мова браузера → uk; він же ставить <html lang dir> і вантажить словник
   /assets/kabinet/l10n/<мова>.js (window.CASKabL10n = {l, t: {uk-текст: переклад}, h: шапка мови, f: футер мови}; збирає kabinet_v2.py
   з tools/shop/kabinet-i18n/<мова>.json — бракує рядка → збірка падає). Тут: window.CASKab = {lang, T, locale, set}; заміна шапки/футера
   на мовні, переклад статичного тексту сторінки, перемикач мов (select#kb-lang і мови в шапці/футері → ця ж сторінка з ?lang=xx).
   Працівники й адмінка (/kabinet/team, /kabinet/admin) — українською, цей файл там не підключено. */
(function () {
  'use strict';
  var d = document, h = d.documentElement, W = window;
  var LANGS = ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'pt', 'ar'];
  var LOC = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-GB', es: 'es-ES', zh: 'zh-CN', pl: 'pl-PL', de: 'de-DE', fr: 'fr-FR', pt: 'pt-PT', ar: 'ar-u-nu-latn' };
  var L10n = W.CASKabL10n || null;
  var lang = (L10n && L10n.l) || h.getAttribute('data-kb-lang') || 'uk';
  if (LANGS.indexOf(lang) < 0) lang = 'uk';
  var dict = (L10n && L10n.t) || {};
  function T(s, v) {
    var r = Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s;
    if (v) r = r.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; });
    return r;
  }
  function set(l) { // вибір мови: запамʼятати й відкрити цю ж сторінку цією мовою
    if (LANGS.indexOf(l) < 0) return;
    try { localStorage.setItem('cas-kab-lang', l); } catch (e) { /* приватний режим */ }
    d.cookie = 'cas_lang=' + l + ';path=/;max-age=31536000;samesite=lax';
    var u = new URL(location.href); u.searchParams.set('lang', l);
    location.href = u.pathname + u.search + u.hash;
  }
  var U = (L10n && L10n.u) || {};
  W.CASKab = { lang: lang, T: T, locale: LOC[lang], set: set, rtl: lang === 'ar', u: function (p) { return U[p] || p; } };

  // переклад статичного тексту (текстові вузли й підписи) — ключ = український текст без зайвих пробілів
  function tr(root) {
    if (!L10n || !root) return;
    var w = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (t) {
      var p = t.parentNode; if (!p || /^(SCRIPT|STYLE|TEMPLATE)$/.test(p.nodeName)) return;
      var s = t.nodeValue, k = s.replace(/\s+/g, ' ').trim();
      if (k && Object.prototype.hasOwnProperty.call(dict, k)) t.nodeValue = s.replace(s.trim(), dict[k]);
    });
    [].forEach.call(root.querySelectorAll('[placeholder],[aria-label],[title],[data-service]'), function (el) {
      ['placeholder', 'aria-label', 'title'].forEach(function (a) {
        var v = el.getAttribute(a); if (v && Object.prototype.hasOwnProperty.call(dict, v)) el.setAttribute(a, dict[v]);
      });
    });
  }
  // мови в шапці, футері й перемикачі → ця ж сторінка кабінету з ?lang=xx (а не головні сторінки мов)
  function langLinks() {
    [].forEach.call(d.querySelectorAll('.sch-ld-m a[hreflang], .sch-mlang a[hreflang], .scf-langs a[hreflang]'), function (a) {
      var hl = a.getAttribute('hreflang') || '', l = hl.slice(0, 2).toLowerCase();
      if (LANGS.indexOf(l) < 0) return;
      var u = new URL(location.href); u.searchParams.set('lang', l);
      a.href = u.pathname + u.search; a.removeAttribute('hreflang');
      a.addEventListener('click', function (e) { e.preventDefault(); set(l); });
    });
    var sel = d.getElementById('kb-lang');
    if (sel) { sel.value = lang; sel.addEventListener('change', function () { set(sel.value); }); }
  }
  function swapChrome() {
    if (!L10n) return;
    var oh = d.querySelector('header.sch'), of = d.querySelector('footer.scf'), tmp = d.createElement('div');
    if (oh && L10n.h) {
      var tools = oh.querySelector('.sch-tools');
      tmp.innerHTML = L10n.h; var nh = tmp.querySelector('header.sch');
      if (nh) { var nt = nh.querySelector('.sch-tools'); if (nt && tools) nt.innerHTML = tools.innerHTML; oh.replaceWith(nh); tr(nh); }
    }
    if (of && L10n.f) { tmp.innerHTML = L10n.f; var nf = tmp.querySelector('footer.scf'); if (nf) of.replaceWith(nf); }
  }
  function run() {
    if (L10n) {
      swapChrome();
      tr(d.querySelector('main'));
      [].forEach.call(d.querySelectorAll('.skip, #kb-toast'), tr);
      var m = d.title.match(/^(.*?)( \| CAS Development)$/); if (m) d.title = T(m[1]) + m[2];
    }
    langLinks();
    h.classList.remove('kb-l10n');
  }
  run();
})();
