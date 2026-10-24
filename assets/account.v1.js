/* CAS Development — вхід клієнтів (Telegram / Google / номер телефону через бота) і доступ до API кабінету.
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
      if (c.phoneLogin) { any = true; phoneLogin(box, finish); }
      if (!any) box.innerHTML = '<p class="acc-wait">Вхід для клієнтів запрацює найближчим часом. Замовлення можна оформити й без входу — менеджер звʼяжеться з вами.</p>';
    });
  }
  // Вхід за номером: start → посилання на бота (клієнт ділиться контактом) → опитування status кожні 2 с.
  function phoneLogin(box, finish) {
    var w = document.createElement('form'); w.className = 'acc-ph'; w.noValidate = true;
    w.innerHTML = '<div class="field"><label for="accPhone">Номер телефону</label>' +
      '<input id="accPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 XX XXX XX XX" required></div>' +
      '<button class="btn" type="submit">Увійти за номером</button><div class="acc-ph-step" hidden></div><p class="acc-err" role="alert" hidden></p>';
    box.appendChild(w);
    var inp = w.querySelector('input'), btn = w.querySelector('button'), step = w.querySelector('.acc-ph-step'), err = w.querySelector('.acc-err'), timer = null;
    function msg(t) { err.textContent = t || ''; err.hidden = !t; }
    function reset(t) {
      clearTimeout(timer); timer = null; step.hidden = true; step.innerHTML = '';
      inp.disabled = false; btn.disabled = false; btn.hidden = false; msg(t);
    }
    w.onsubmit = function (e) {
      e.preventDefault(); msg('');
      if (!inp.value.trim()) { msg('Введіть номер телефону'); inp.focus(); return; }
      btn.disabled = true;
      api('/api/auth/phone/start', { method: 'POST', body: { phone: inp.value } }).then(function (d) {
        inp.disabled = true; btn.hidden = true; step.hidden = false;
        step.innerHTML = '<a class="btn" target="_blank" rel="noopener"></a>' +
          '<p class="acc-wait">Відкрийте бота і натисніть «Поділитися номером». Чекаємо підтвердження…</p>' +
          '<button class="btn ghost" type="button">Інший номер</button>';
        var a = step.querySelector('a'); a.href = d.botUrl; a.textContent = 'Підтвердити в Telegram';
        step.querySelector('button').onclick = function () { reset(''); inp.focus(); };
        var until = Date.now() + (d.expiresIn || 600) * 1000;
        (function poll() {
          if (Date.now() > until) return reset('Час на підтвердження минув. Спробуйте ще раз.');
          timer = setTimeout(function () {
            api('/api/auth/phone/status?token=' + encodeURIComponent(d.token)).then(function (r) {
              if (!timer) return;
              if (r.status === 'ok') { reset(''); finish(r); }
              else if (r.status === 'pending') poll();
              else reset(r.status === 'used' ? 'Цей вхід уже використано. Спробуйте ще раз.' : 'Час на підтвердження минув. Спробуйте ще раз.');
            }, function (e2) { if (timer) reset(e2.message); });
          }, 2000);
        })();
      }, function (e1) { btn.disabled = false; msg(e1.message); });
    };
  }
  function logout() { return api('/api/auth/logout', { method: 'POST' }).then(function () { meP = Promise.resolve(null); }); }
  window.CASAccount = { api: api, me: me, login: login, logout: logout, config: config };
})();
