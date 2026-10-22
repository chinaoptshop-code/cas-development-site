/* CAS Development — вхід клієнтів (Telegram / Google) і доступ до API кабінету.
   window.CASAccount: me(), login(container, onDone), logout(), api(path, opts). */
(function () {
  var cfgP = null, meP = null;
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Помилка ' + r.status));
        return d;
      });
    });
  }
  function config() { return cfgP || (cfgP = api('/api/config').catch(function () { return {}; })); }
  function me(fresh) {
    if (fresh || !meP) meP = api('/api/me').then(function (d) { return d.client; }).catch(function () { return null; });
    return meP;
  }
  function load(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  function login(box, done) {
    box.innerHTML = '<p class="acc-wait">Завантажуємо способи входу…</p>';
    config().then(function (c) {
      box.innerHTML = '';
      var any = false;
      var finish = function (d) { meP = Promise.resolve(d.client); if (done) done(d.client); };
      var fail = function (e) { var p = document.createElement('p'); p.className = 'acc-err'; p.textContent = e.message; box.appendChild(p); };
      if (c.telegramBot) {
        any = true;
        var tg = document.createElement('div'); tg.className = 'acc-tg'; box.appendChild(tg);
        window.casTgAuth = function (u) { api('/api/auth/telegram', { method: 'POST', body: u }).then(finish, fail); };
        var s = document.createElement('script');
        s.async = true; s.src = 'https://telegram.org/js/telegram-widget.js?22';
        s.setAttribute('data-telegram-login', c.telegramBot); s.setAttribute('data-size', 'large');
        s.setAttribute('data-radius', '10'); s.setAttribute('data-onauth', 'casTgAuth(user)'); s.setAttribute('data-request-access', 'write');
        tg.appendChild(s);
      }
      if (c.googleClientId) {
        any = true;
        var g = document.createElement('div'); g.className = 'acc-g'; box.appendChild(g);
        load('https://accounts.google.com/gsi/client').then(function () {
          google.accounts.id.initialize({ client_id: c.googleClientId, callback: function (r) {
            api('/api/auth/google', { method: 'POST', body: { credential: r.credential } }).then(finish, fail);
          } });
          google.accounts.id.renderButton(g, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'uk' });
        });
      }
      if (!any) box.innerHTML = '<p class="acc-wait">Вхід для клієнтів запрацює найближчим часом. Замовлення можна оформити й без входу — менеджер звʼяжеться з вами.</p>';
    });
  }
  function logout() { return api('/api/auth/logout', { method: 'POST' }).then(function () { meP = Promise.resolve(null); }); }
  window.CASAccount = { api: api, me: me, login: login, logout: logout, config: config };
})();
