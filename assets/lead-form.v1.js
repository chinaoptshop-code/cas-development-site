/* CAS Development — спільна форма заявки (form#of). Налаштування — data-атрибути форми:
   data-service="Назва послуги"  data-source="cas-develop.com/<сторінка>"  data-form="landing"
   Мова повідомлень — з <html lang>. Успіх показуємо лише після відповіді 2xx. */
(function () {
  var form = document.getElementById('of');
  if (!form) return;
  var T = {
    uk: { phone: 'Введіть номер: 0971234567', sending: 'Надсилаємо…', again: 'Надіслати ще раз',
          fail: 'Не вдалося надіслати заявку. Напишіть або подзвоніть: +380 97 866 77 55 (Telegram, Viber, WhatsApp).' },
    ru: { phone: 'Введите номер: 0971234567', sending: 'Отправляем…', again: 'Отправить ещё раз',
          fail: 'Не удалось отправить заявку. Напишите или позвоните: +380 97 866 77 55 (Telegram, Viber, WhatsApp).' },
    en: { phone: 'Please enter a valid phone number with country code', sending: 'Sending…', again: 'Send again',
          fail: 'We could not send your request. Please message or call +380 97 866 77 55 (Telegram, WhatsApp, Viber).' },
    es: { phone: 'Introduzca un número válido con el prefijo del país', sending: 'Enviando…', again: 'Enviar de nuevo',
          fail: 'No pudimos enviar su solicitud. Escríbanos o llame al +380 97 866 77 55 (Telegram, WhatsApp, Viber).' }
  };
  var lang = (document.documentElement.lang || 'uk').slice(0, 2);
  var t = T[lang] || T.uk;
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  var q = new URLSearchParams(location.search);
  // доступність: помилка — role=alert і привʼязана до поля телефону; успіх — role=status, отримує фокус
  var err0 = $('oErr'), ok0 = $('oOk'), ph0 = $('oPhone');
  if (err0 && !err0.getAttribute('role')) err0.setAttribute('role', 'alert');
  if (ok0) { if (!ok0.getAttribute('role')) ok0.setAttribute('role', 'status'); if (!ok0.hasAttribute('tabindex')) ok0.setAttribute('tabindex', '-1'); }
  if (ph0 && err0) {
    var db = (ph0.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (db.indexOf('oErr') < 0) { db.push('oErr'); ph0.setAttribute('aria-describedby', db.join(' ')); }
    ph0.setAttribute('aria-required', 'true');
  }
  var invalid = function (on) { if (ph0) { if (on) ph0.setAttribute('aria-invalid', 'true'); else ph0.removeAttribute('aria-invalid'); } };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('oErr'), btn = $('oBtn');
    var d = val('oPhone').replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (/^0\d{9}$/.test(d)) d = '38' + d;
    if (!/^380\d{9}$/.test(d) && !/^\d{10,15}$/.test(d)) { if (err) err.textContent = t.phone; invalid(true); if (ph0) ph0.focus(); return; }
    if (err) err.textContent = ''; invalid(false);
    if (btn) { btn.disabled = true; btn.textContent = t.sending; }
    var data = {
      name: val('oName'), phone: '+' + d, area: val('oArea'), message: val('oMsg'),
      service: form.dataset.service || '', source: form.dataset.source || location.host + location.pathname,
      form: form.dataset.form || 'landing', lang: lang, page: location.href,
      utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '', utm_campaign: q.get('utm_campaign') || ''
    };
    var done = false;
    var fail = function () {
      if (done) return; done = true;
      if (btn) { btn.disabled = false; btn.textContent = t.again; }
      if (err) err.textContent = t.fail;
    };
    var timer = setTimeout(fail, 10000);
    fetch('https://n8n.china-opt-shop.pp.ua/webhook/contact-form', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    }).then(function (r) {
      clearTimeout(timer);
      if (done) return;
      if (!r.ok) return fail();
      done = true;
      form.style.display = 'none';
      var ok = $('oOk'); if (ok) { ok.style.display = 'block'; try { ok.focus({ preventScroll: false }); } catch (x) { ok.focus(); } }
    }).catch(function () { clearTimeout(timer); fail(); });
  });
})();
