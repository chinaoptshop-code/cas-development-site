/* CAS Development — спільні форми заявки. Обовʼязковий лише телефон (мін. 9 цифр, +380 або міжнародний); імʼя й коментар — за бажанням.
   1) Повна форма form#of: data-service="Назва послуги"  data-source="cas-develop.com/<сторінка>"  data-form="landing"
      поля #oPhone (обовʼязкове), #oName, #oArea, #oMsg (необовʼязкові), #oErr, #oBtn, блок успіху #oOk.
   2) Швидка заявка в один рядок form.lq (телефон + кнопка; ті самі data-service/data-source/data-form), успіх — .lq-ok після форми.
   Розмітку й тексти ставить tools/site/leadform.py; сторінки без неї (кабінет, динамічні) скрипт дооформлює сам.
   Мова повідомлень — з <html lang>. Успіх показуємо лише після відповіді 2xx; тоді ж подія Clarity `lead_submit`.
   Кнопка «Залишити номер» у нижній панелі (.mbar .mb-lead): якщо на сторінці є форма — прокрутка до неї й фокус на телефоні. */
(function () {
  var HOOK = 'https://n8n.china-opt-shop.pp.ua/webhook/contact-form';
  var NONAME = 'Без імені'; // для менеджера (Telegram/CRM) — завжди українською
  var T = {
    uk: { empty: 'Вкажіть номер телефону — ми передзвонимо.', phone: 'Перевірте номер: потрібно щонайменше 9 цифр, напр. 097 123 45 67 або +380 97 123 45 67.',
          sending: 'Надсилаємо…', again: 'Надіслати ще раз', name: 'Імʼя (необовʼязково)', more: 'Додати коментар', send: 'Передзвоніть мені',
          note: 'Перетелефонуємо найближчим часом. Консультація по телефону — безкоштовна.', ok: 'Дякуємо! Перетелефонуємо найближчим часом.',
          fail: 'Не вдалося надіслати заявку. Напишіть або подзвоніть: +380 97 866 77 55 (Telegram, Viber, WhatsApp).' },
    ru: { empty: 'Укажите номер телефона — мы перезвоним.', phone: 'Проверьте номер: нужно не меньше 9 цифр, напр. 097 123 45 67 или +380 97 123 45 67.',
          sending: 'Отправляем…', again: 'Отправить ещё раз', name: 'Имя (необязательно)', more: 'Добавить комментарий', send: 'Перезвоните мне',
          note: 'Перезвоним в ближайшее время. Консультация по телефону — бесплатная.', ok: 'Спасибо! Перезвоним в ближайшее время.',
          fail: 'Не удалось отправить заявку. Напишите или позвоните: +380 97 866 77 55 (Telegram, Viber, WhatsApp).' },
    en: { empty: 'Please enter your phone number — we will call you back.', phone: 'Please check the number: at least 9 digits, with country code, e.g. +44 7700 900123.',
          sending: 'Sending…', again: 'Send again', name: 'Name (optional)', more: 'Add a comment', send: 'Call me back',
          note: 'We will call you back shortly. Phone consultation is free.', ok: 'Thank you! We will call you back shortly.',
          fail: 'We could not send your request. Please message or call +380 97 866 77 55 (Telegram, WhatsApp, Viber).' },
    es: { empty: 'Indique su número de teléfono y le llamamos.', phone: 'Revise el número: al menos 9 dígitos, con el prefijo del país.',
          sending: 'Enviando…', again: 'Enviar de nuevo', name: 'Nombre (opcional)', more: 'Añadir un comentario', send: 'Llámenme',
          note: 'Le llamaremos en breve. La consulta por teléfono es gratuita.', ok: '¡Gracias! Le llamaremos en breve.',
          fail: 'No pudimos enviar su solicitud. Escríbanos o llame al +380 97 866 77 55 (Telegram, WhatsApp, Viber).' },
    zh: { empty: '请填写电话号码，我们会给您回电。', phone: '请检查号码：至少 9 位数字，并带国家区号。',
          sending: '正在提交…', again: '重新提交', name: '姓名（选填）', more: '添加备注', send: '请回电给我',
          note: '我们会尽快给您回电。电话咨询免费。', ok: '谢谢！我们会尽快给您回电。',
          fail: '提交失败。请通过 Telegram、WhatsApp 或 Viber 联系我们，或致电 +380 97 866 77 55。' },
    pl: { empty: 'Podaj numer telefonu — oddzwonimy.', phone: 'Sprawdź numer: co najmniej 9 cyfr, z kierunkowym kraju.',
          sending: 'Wysyłamy…', again: 'Wyślij ponownie', name: 'Imię (opcjonalnie)', more: 'Dodaj komentarz', send: 'Oddzwońcie do mnie',
          note: 'Oddzwonimy wkrótce. Konsultacja telefoniczna jest bezpłatna.', ok: 'Dziękujemy! Oddzwonimy wkrótce.',
          fail: 'Nie udało się wysłać zapytania. Napisz lub zadzwoń: +380 97 866 77 55 (Telegram, WhatsApp, Viber).' },
    de: { empty: 'Bitte geben Sie Ihre Telefonnummer ein — wir rufen zurück.', phone: 'Bitte prüfen Sie die Nummer: mindestens 9 Ziffern, mit Ländervorwahl.',
          sending: 'Wird gesendet…', again: 'Erneut senden', name: 'Name (optional)', more: 'Kommentar hinzufügen', send: 'Rückruf anfordern',
          note: 'Wir rufen Sie in Kürze zurück. Die telefonische Beratung ist kostenlos.', ok: 'Danke! Wir rufen Sie in Kürze zurück.',
          fail: 'Die Anfrage konnte nicht gesendet werden. Schreiben oder rufen Sie uns an: +380 97 866 77 55 (Telegram, WhatsApp, Viber).' },
    fr: { empty: 'Indiquez votre numéro de téléphone, nous vous rappelons.', phone: 'Vérifiez le numéro : au moins 9 chiffres, avec l’indicatif du pays.',
          sending: 'Envoi…', again: 'Renvoyer', name: 'Nom (facultatif)', more: 'Ajouter un commentaire', send: 'Rappelez-moi',
          note: 'Nous vous rappelons rapidement. La consultation par téléphone est gratuite.', ok: 'Merci ! Nous vous rappelons rapidement.',
          fail: 'La demande n’a pas pu être envoyée. Écrivez-nous ou appelez le +380 97 866 77 55 (Telegram, WhatsApp, Viber).' },
    ar: { empty: 'يرجى إدخال رقم الهاتف وسنعاود الاتصال بك.', phone: 'تحقق من الرقم: 9 أرقام على الأقل مع رمز الدولة.',
          sending: 'جارٍ الإرسال…', again: 'إعادة الإرسال', name: 'الاسم (اختياري)', more: 'إضافة تعليق', send: 'اتصلوا بي',
          note: 'سنعاود الاتصال بك قريبًا. الاستشارة الهاتفية مجانية.', ok: 'شكرًا! سنعاود الاتصال بك قريبًا.',
          fail: 'تعذّر إرسال الطلب. راسلنا أو اتصل على ‎+380 97 866 77 55 (Telegram وWhatsApp وViber).' }
  };
  var lang = (document.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var t = T[lang] || T.uk;
  var UA = lang === 'uk' || lang === 'ru';
  var q = new URLSearchParams(location.search);
  var CSS = '.lq{display:block;margin:22px 0 0;max-width:540px}.lq-l{display:block;margin:0 0 8px;font-size:var(--fs-small,.8125rem);color:var(--mu,#8a837c)}'
    + '.lq-r{display:flex;gap:8px;flex-wrap:wrap}.lq-r input{flex:1 1 160px;min-width:0;width:auto;box-sizing:border-box;min-height:48px;padding:12px 14px;font:inherit;font-size:16px;color:var(--tx,#ede8df);background:var(--bg2,rgba(255,255,255,.04));border:1px solid var(--ln,rgba(191,145,72,.35));border-radius:8px}'
    + '.lq-b{flex:0 0 auto;min-height:48px;padding:12px 22px;border:1px solid var(--ac,#bf9148);border-radius:999px;background:var(--ac,#bf9148);color:#140f08;font-family:inherit;font-size:var(--fs-small,.8125rem);font-weight:600;line-height:1.2;cursor:pointer;white-space:nowrap}.lq-b:disabled{opacity:.6;cursor:wait}'
    + '.lq-e{color:#e07a6a;font-size:var(--fs-small,.8125rem);margin-top:6px}.lq-e:empty{display:none}.lq .o-note{margin:8px 0 0}'
    + '.o-note{color:var(--mu,#8a837c);font-size:var(--fs-small,.8125rem);line-height:1.5;margin:4px 0 0;max-width:52ch}'
    + '.lq-ok{margin:22px 0 0;max-width:540px;padding:14px 18px;border:1px solid var(--ac,#bf9148);border-radius:8px;color:var(--tx,#ede8df)}'
    + 'details.o-more>summary{cursor:pointer;display:inline-block;list-style:none;padding:6px 0;color:var(--ac,#bf9148);font-size:var(--fs-small,.8125rem);font-weight:600}'
    + 'details.o-more>summary::-webkit-details-marker{display:none}details.o-more>summary::after,details.o-more[open]>summary::after{content:none!important;display:none!important}'
    + 'details.o-more>summary::before{content:"+ "}details.o-more[open]>summary::before{content:"− "}details.o-more>*+*{margin-top:12px}';
  if (!document.getElementById('lead-ui')) {
    var st = document.createElement('style'); st.id = 'lead-ui'; st.textContent = CSS; document.head.appendChild(st);
  }

  // телефон: 0XXXXXXXXX / 380… / 9 цифр (uk, ru) → 380XXXXXXXXX; інакше міжнародний 9–15 цифр. null — невірний
  function normPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (/^0\d{9}$/.test(d)) d = '38' + d;
    else if (/^80\d{9}$/.test(d)) d = '3' + d;
    else if (/^3800\d{9}$/.test(d)) d = '380' + d.slice(4);
    else if (UA && /^[1-9]\d{8}$/.test(d)) d = '380' + d;
    if (/^380/.test(d) && d.length !== 12) return null;
    return d.length >= 9 && d.length <= 15 ? d : null;
  }
  // підказка-маска для українських номерів: +380 97 123 45 67 (лише коли курсор у кінці — не заважає редагуванню)
  function fmt(v) {
    var d = v.replace(/\D/g, '');
    if (/^0/.test(d) && !/^\+/.test(v.trim())) return v;
    if (!/^380/.test(d)) return v;
    d = d.slice(0, 12);
    var p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
    return '+' + p.join(' ');
  }
  function mask(inp) {
    if (!inp || inp.dataset.lfMask) return;
    inp.dataset.lfMask = '1';
    if (!inp.getAttribute('inputmode')) inp.setAttribute('inputmode', 'tel');
    inp.addEventListener('input', function (e) {
      if (e.inputType && e.inputType.indexOf('delete') === 0) return;
      if (inp.selectionStart !== inp.value.length) return;
      var f = fmt(inp.value); if (f !== inp.value) inp.value = f;
    });
    inp.addEventListener('blur', function () {
      var d = normPhone(inp.value);
      if (d && /^380/.test(d)) inp.value = fmt('+' + d);
    });
  }

  function post(data, onOk, onFail) {
    var done = false;
    var fail = function () { if (done) return; done = true; onFail(); };
    var timer = setTimeout(fail, 12000);
    fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        clearTimeout(timer);
        if (done) return;
        if (!r.ok) return fail();
        done = true;
        try { if (window.clarity) { window.clarity('set', 'lead_form', data.form); window.clarity('event', 'lead_submit'); } } catch (x) {}
        try { document.dispatchEvent(new CustomEvent('cas:lead', { detail: { form: data.form, service: data.service } })); } catch (x) {}
        onOk();
      })
      .catch(function () { clearTimeout(timer); fail(); });
  }
  function base(form) {
    return {
      service: form.dataset.service || '', source: form.dataset.source || location.host + location.pathname,
      lang: lang, page: location.href,
      utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '', utm_campaign: q.get('utm_campaign') || ''
    };
  }
  function focusEl(el) { if (!el) return; try { el.focus({ preventScroll: false }); } catch (x) { el.focus(); } }

  /* ---------- 1. повна форма form#of ---------- */
  var form = document.getElementById('of');
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  if (form) {
    var err0 = $('oErr'), ok0 = $('oOk'), ph0 = $('oPhone'), btn0 = $('oBtn');
    // сторінки без розмітки leadform.py (кабінет, динамічні): імʼя «необовʼязково», коментар згорнуто, кнопка й примітка
    if (!form.hasAttribute('data-lf')) {
      var ln = form.querySelector('label[for="oName"]'); if (ln && !/\(/.test(ln.textContent)) ln.textContent = t.name;
      var nm = $('oName'); if (nm) nm.removeAttribute('required');
      var wrapOf = function (id) {
        var el = $(id); if (!el) return null;
        var w = el; while (w.parentNode && w.parentNode !== form) w = w.parentNode;
        return w.parentNode === form && !w.querySelector('#oPhone,#oName') ? w : null;
      };
      var wm = wrapOf('oMsg'), wa = wrapOf('oArea');
      if (wm && !form.querySelector('.o-more') && !(val('oMsg'))) {
        var det = document.createElement('details'); det.className = 'o-more';
        var sm = document.createElement('summary'); sm.textContent = t.more; det.appendChild(sm);
        var first = wa && wa.compareDocumentPosition(wm) & 4 ? wa : wm;
        form.insertBefore(det, first);
        if (wa && wa !== wm) det.appendChild(wa);
        det.appendChild(wm);
      }
      if (btn0 && btn0.textContent.trim().length > 0) btn0.textContent = t.send;
      if (btn0 && !form.querySelector('.o-note')) { var nt = document.createElement('p'); nt.className = 'o-note'; nt.textContent = t.note; btn0.insertAdjacentElement('afterend', nt); }
    }
    if (btn0) btn0.dataset.label = btn0.textContent;
    // доступність: помилка — role=alert і привʼязана до поля телефону; успіх — role=status, отримує фокус
    if (err0 && !err0.getAttribute('role')) err0.setAttribute('role', 'alert');
    if (ok0) { if (!ok0.getAttribute('role')) ok0.setAttribute('role', 'status'); if (!ok0.hasAttribute('tabindex')) ok0.setAttribute('tabindex', '-1'); }
    if (ph0) {
      mask(ph0);
      if (err0) {
        var db = (ph0.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        if (db.indexOf('oErr') < 0) { db.push('oErr'); ph0.setAttribute('aria-describedby', db.join(' ')); }
      }
      ph0.setAttribute('aria-required', 'true');
    }
    var invalid = function (on) { if (ph0) { if (on) ph0.setAttribute('aria-invalid', 'true'); else ph0.removeAttribute('aria-invalid'); } };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('oErr'), btn = $('oBtn');
      var raw = val('oPhone'), d = normPhone(raw);
      if (!d) { if (err) err.textContent = raw ? t.phone : t.empty; invalid(true); focusEl(ph0); return; }
      if (err) err.textContent = ''; invalid(false);
      if (btn) { btn.disabled = true; btn.textContent = t.sending; }
      var data = base(form);
      data.name = val('oName') || NONAME; data.phone = '+' + d; data.area = val('oArea'); data.message = val('oMsg');
      data.form = form.dataset.form || 'landing';
      post(data, function () {
        form.style.display = 'none';
        var ok = $('oOk'); if (ok) { ok.style.display = 'block'; focusEl(ok); }
      }, function () {
        if (btn) { btn.disabled = false; btn.textContent = t.again; }
        if (err) err.textContent = t.fail;
      });
    });
  }

  /* ---------- 2. швидка заявка в один рядок form.lq ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('form.lq'), function (f) {
    var inp = f.querySelector('input[type="tel"]'), err = f.querySelector('.lq-e'), btn = f.querySelector('button[type="submit"]');
    mask(inp);
    if (inp) inp.setAttribute('aria-required', 'true');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = inp ? inp.value.trim() : '', d = normPhone(raw);
      if (!d) { if (err) err.textContent = raw ? t.phone : t.empty; if (inp) { inp.setAttribute('aria-invalid', 'true'); focusEl(inp); } return; }
      if (err) err.textContent = ''; if (inp) inp.removeAttribute('aria-invalid');
      var label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = t.sending; }
      var data = base(f);
      data.name = NONAME; data.phone = '+' + d; data.area = ''; data.message = ''; data.form = f.dataset.form || 'quick';
      post(data, function () {
        var ok = f.nextElementSibling && f.nextElementSibling.classList.contains('lq-ok') ? f.nextElementSibling : null;
        if (!ok) { ok = document.createElement('div'); ok.className = 'lq-ok'; ok.setAttribute('role', 'status'); ok.textContent = t.ok; f.parentNode.insertBefore(ok, f.nextSibling); }
        ok.setAttribute('tabindex', '-1'); ok.hidden = false; ok.style.display = 'block';
        f.style.display = 'none';
        focusEl(ok);
      }, function () {
        if (btn) { btn.disabled = false; btn.textContent = t.again || label; }
        if (err) err.textContent = t.fail;
      });
    });
  });

  /* ---------- 3. «Залишити номер» (нижня панель) і кнопки-якорі #zayavka / #lead: прокрутка й фокус на телефоні ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.mb-lead, a[href="#zayavka"], a[href="#lead"]');
    if (!a) return;
    var vis = function (el) { return !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'; };
    var lq = document.querySelector('form.lq input[type="tel"]');
    var target = a.getAttribute('href') === '#lead' && vis(lq) ? lq : (vis($('oPhone')) ? $('oPhone') : null);
    if (!target && vis(lq)) target = lq;
    if (!target && $('oPhone') && typeof window.openQuickForm === 'function') { e.preventDefault(); window.openQuickForm(); setTimeout(function () { focusEl($('oPhone')); }, 350); return; }
    if (!target) return; // форми на сторінці нема — посилання веде на сторінку з формою
    e.preventDefault();
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (x) { target.scrollIntoView(); }
    setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (x) { target.focus(); } }, 400);
  });
})();
