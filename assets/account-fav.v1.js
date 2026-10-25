/* CAS Development — «серце» (обране) на /ozdoba, сторінках категорій і товарів Оздоби, синхронізоване з кабінетом клієнта.
   Сам знаходить картки товарів у DOM:
   • /ozdoba (assets/ozdoba/app.js): серця вже є — обгортаємо window.toggleFav і дублюємо зміну на сервер;
   • article.card з посиланням a[href="/ozdoba/<slug>-<id>"] без власного серця — додаємо кнопку в кут фото;
   • сторінка товару (.pp) — кнопка «В обране» поруч із кнопками.
   Гість — лише localStorage 'ozd-fav' (той самий ключ, що й у app.js); після входу — ще й /api/account/favorites.
   Підключення: <script src="/assets/account-fav.v1.js?v=…" defer></script> перед </body>. */
(function () {
  'use strict';
  if (window.__casFav) return; window.__casFav = 1;
  var KEY = 'ozd-fav', authed = null; // null — ще не знаємо, false — гість
  var get = function () { try { return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).map(Number).filter(Boolean); } catch (e) { return []; } };
  var put = function (ids) { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { /* приватний режим */ } };
  var has = function (id) { return get().indexOf(id) >= 0; };
  function req(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (r.status === 401) { authed = false; throw new Error('guest'); } if (!r.ok) throw new Error('http ' + r.status); authed = true; return r.json(); });
  }
  function remote(id, on) {
    if (authed === false) return;
    (on ? req('POST', '/api/account/favorites', { id: id }) : req('DELETE', '/api/account/favorites?id=' + id)).catch(function () {});
  }
  var idFrom = function (href) { var m = String(href || '').match(/\/ozdoba\/[a-z0-9-]*-(\d+)\/?(?:[?#].*)?$/) || String(href || '').match(/\/ozdoba#p-(\d+)$/); return m ? +m[1] : null; };

  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg>';
  function css() {
    var s = document.createElement('style');
    s.textContent = '.cas-fav{position:absolute;top:8px;right:8px;z-index:2;width:36px;height:36px;border-radius:50%;border:1px solid rgba(191,145,72,.35);background:rgba(8,7,9,.72);display:grid;place-items:center;cursor:pointer;padding:0;transition:transform .15s}' +
      '.cas-fav:active{transform:scale(.9)}.cas-fav svg{width:17px;height:17px;fill:none;stroke:#EDE8DF;stroke-width:1.9}' +
      '.cas-fav[aria-pressed=true] svg{fill:#BF9148;stroke:#BF9148}' +
      '.cas-fav-pp{display:inline-flex;align-items:center;gap:8px;width:auto!important;margin:0!important;padding:15px 22px!important;cursor:pointer;font:inherit}' +
      '.cas-fav-pp svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9}.cas-fav-pp[aria-pressed=true] svg{fill:#BF9148;stroke:#BF9148}' +
      '.cas-fav-t{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;background:#1b1712;border:1px solid #BF9148;color:#EDE8DF;border-radius:999px;padding:9px 16px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}.cas-fav-t.on{opacity:1}';
    document.head.appendChild(s);
  }
  var tt = null;
  function toast(msg) {
    var t = document.querySelector('.cas-fav-t');
    if (!t) { t = document.createElement('div'); t.className = 'cas-fav-t'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function sync(id) {
    var on = has(id);
    document.querySelectorAll('[data-cas-fav="' + id + '"]').forEach(function (b) {
      b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Прибрати з обраного' : 'В обране');
      var l = b.querySelector('span'); if (l) l.textContent = on ? 'В обраному' : 'В обране';
    });
  }
  function toggle(id) {
    var ids = get(), on = ids.indexOf(id) < 0;
    put(on ? [id].concat(ids) : ids.filter(function (x) { return x !== id; }));
    sync(id); remote(id, on);
    toast(on ? 'Додано в обране' + (authed ? ' — є в кабінеті' : '') : 'Прибрано з обраного');
  }
  function button(id, pp) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = pp ? 'btn ghost cas-fav-pp' : 'cas-fav'; b.setAttribute('data-cas-fav', id);
    b.innerHTML = HEART + (pp ? '<span>В обране</span>' : '');
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggle(id); });
    return b;
  }

  // сторінки з app.js: його серця + window.toggleFav
  function wrapApp() {
    var orig = window.toggleFav;
    if (typeof orig !== 'function' || orig.__cas) return false;
    var w = function (id) { var before = has(+id); var r = orig.apply(this, arguments); var after = has(+id); if (before !== after) remote(+id, after); return r; };
    w.__cas = 1; window.toggleFav = w;
    return true;
  }
  function decorate() {
    // картки без власного серця
    document.querySelectorAll('article.card').forEach(function (card) {
      if (card.querySelector('[data-fav],[data-cas-fav]')) return;
      var a = card.querySelector('a[href*="/ozdoba/"]'), id = a && idFrom(a.getAttribute('href'));
      if (!id) return;
      var host = card.querySelector('.tile') || card;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(button(id, false));
    });
    // сторінка товару
    var pp = document.querySelector('.pp');
    if (pp && !pp.querySelector('[data-cas-fav],[data-fav]')) {
      var link = pp.querySelector('a[href^="/ozdoba#p-"]');
      var id = idFrom(link ? link.getAttribute('href') : location.pathname);
      var host = pp.querySelector('.pp-btns') || pp.querySelector('.pp-info');
      if (id && host) host.appendChild(button(id, true));
    }
    get().forEach(sync);
    document.querySelectorAll('[data-cas-fav]').forEach(function (b) { sync(+b.getAttribute('data-cas-fav')); });
  }

  // вхід → зливаємо локальне й серверне обране (сервер — джерело для інших пристроїв)
  function merge() {
    req('GET', '/api/account/favorites').then(function (d) {
      var srv = (d.ids || []).map(Number), loc = get();
      var miss = loc.filter(function (id) { return srv.indexOf(id) < 0; });
      var all = srv.concat(miss);
      put(all); all.forEach(sync);
      if (miss.length && !d.pending) req('POST', '/api/account/favorites', { ids: miss }).catch(function () {});
    }).catch(function () {});
  }

  function start() {
    css();
    if (!wrapApp()) { // app.js ще не підвантажився — чекаємо до 10 с
      var n = 0, t = setInterval(function () { if (wrapApp() || ++n > 50) clearInterval(t); }, 200);
    }
    decorate();
    merge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
