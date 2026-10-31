/* CAS Development — спільні форми заявки. Обовʼязковий лише телефон (мін. 9 цифр, +380 або міжнародний); імʼя й коментар — за бажанням.
   1) Повна форма form#of: data-service="Назва послуги"  data-source="cas-develop.com/<сторінка>"  data-form="landing"
      поля #oPhone (обовʼязкове), #oName, #oArea, #oMsg (необовʼязкові), #oErr, #oBtn, блок успіху #oOk.
   2) Швидка заявка в один рядок form.lq (телефон + кнопка; ті самі data-service/data-source/data-form), успіх — .lq-ok після форми.
   3) Місця <div class="lq-slot" data-form="quick-prices|quick-portfolio|quick-project|quick-blog-mid|…"> — компактне
      «Номер → передзвонимо» (form.lq) будує цей скрипт — ліниво, за ~1,5 екрана до місця; data-source = джерело сторінки + «#місце» (для CRM і аналітики).
   Розмітку й тексти ставить tools/site/leadform.py; стилі — /assets/site-chrome.v1.css («Легка заявка»);
   сторінки без розмітки leadform.py (кабінет, динамічні) скрипт дооформлює сам.
   Мова повідомлень — з <html lang>. Надсилаємо в /api/leads (CRM + Telegram) і в n8n; успіх — лише після 2xx хоча б від одного;
   тоді ж подія Clarity `lead_submit`. Також `lead_start` (перший фокус у полі телефону) і `lead_msg` (клік на месенджер біля форми).
   Кнопка «Залишити номер» у нижній панелі (.mbar .mb-lead): якщо на сторінці є форма — прокрутка до неї й фокус на телефоні. */
(function () {
  var API = '/api/leads';
  var HOOK = 'https://n8n.china-opt-shop.pp.ua/webhook/contact-form';
  var NONAME = 'Без імені'; // для менеджера (Telegram/CRM) — завжди українською
  var PL = { prices: 'після цін', portfolio: 'після портфоліо', project: 'сторінка проєкту', services: 'послуги', 'blog-mid': 'стаття блогу', 'blog-end': 'стаття блогу, кінець' };
  var MSG = [['Telegram', 'https://t.me/+380978667755'], ['Viber', 'viber://chat?number=%2B380978667755'], ['WhatsApp', 'https://wa.me/380978667755']];
  // q — підпис компактної заявки; s_<місце> — підпис для конкретного місця (якщо нема — q); like — кнопка на сторінці проєкту
  var T = {
    uk: { empty: 'Вкажіть номер телефону — ми передзвонимо.', phone: 'Перевірте номер: потрібно щонайменше 9 цифр, напр. 097 123 45 67 або +380 97 123 45 67.',
          sending: 'Надсилаємо…', again: 'Надіслати ще раз', name: 'Імʼя (необовʼязково)', more: 'Додати коментар', send: 'Отримати розрахунок',
          note: 'Передзвонимо й порахуємо орієнтовну вартість. Консультація по телефону — безкоштовна.', ok: 'Дякуємо! Перетелефонуємо найближчим часом.',
          fail: 'Не вдалося надіслати заявку. Напишіть або подзвоніть: +380 97 866 77 55 (Telegram, Viber, WhatsApp).',
          alt: 'Або напишіть:', tr: '150+ проєктів з 2016 · гарантія 36 міс. · власні бригади · Google\u00a04,8★',
          q: 'Залиште номер — ми передзвонимо', like: 'Хочу так само',
          s_prices: 'Потрібна цифра для вашої площі? Залиште номер — передзвонимо й порахуємо',
          s_portfolio: 'Хочете так само? Залиште номер — передзвонимо й обговоримо ваш обʼєкт',
          s_project: 'Хочете так само? Залиште номер — передзвонимо й обговоримо ваш обʼєкт',
          s_services: 'Не знаєте, що саме потрібно? Залиште номер — підкажемо й порахуємо',
          s_blog: 'Плануєте ремонт чи дизайн? Залиште номер — передзвонимо й порахуємо орієнтовну вартість' },
    ru: { empty: 'Укажите номер телефона — мы перезвоним.', phone: 'Проверьте номер: нужно не меньше 9 цифр, напр. 097 123 45 67 или +380 97 123 45 67.',
          sending: 'Отправляем…', again: 'Отправить ещё раз', name: 'Имя (необязательно)', more: 'Добавить комментарий', send: 'Получить расчёт',
          note: 'Перезвоним и посчитаем ориентировочную стоимость. Консультация по телефону — бесплатная.', ok: 'Спасибо! Перезвоним в ближайшее время.',
          fail: 'Не удалось отправить заявку. Напишите или позвоните: +380 97 866 77 55 (Telegram, Viber, WhatsApp).',
          alt: 'Или напишите:', tr: '150+ проектов с 2016 · гарантия 36 мес. · собственные бригады · Google\u00a04,8★',
          q: 'Оставьте номер — мы перезвоним', like: 'Хочу так же',
          s_prices: 'Нужна цифра для вашей площади? Оставьте номер — перезвоним и посчитаем',
          s_portfolio: 'Хотите так же? Оставьте номер — перезвоним и обсудим ваш объект',
          s_project: 'Хотите так же? Оставьте номер — перезвоним и обсудим ваш объект',
          s_services: 'Не знаете, что именно нужно? Оставьте номер — подскажем и посчитаем',
          s_blog: 'Планируете ремонт или дизайн? Оставьте номер — перезвоним и посчитаем ориентировочную стоимость' },
    en: { empty: 'Please enter your phone number — we will call you back.', phone: 'Please check the number: at least 9 digits, with country code, e.g. +44 7700 900123.',
          sending: 'Sending…', again: 'Send again', name: 'Name (optional)', more: 'Add a comment', send: 'Get an estimate',
          note: 'We will call you back with a rough cost estimate. Phone consultation is free.', ok: 'Thank you! We will call you back shortly.',
          fail: 'We could not send your request. Please message or call +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Or message us:', tr: '150+ projects since 2016 · 36-month warranty · in-house crews · Google\u00a04.8★',
          q: 'Leave your number — we will call you back', like: 'I want the same',
          s_prices: 'Need a figure for your floor area? Leave your number — we will call and estimate',
          s_portfolio: 'Like what you see? Leave your number — we will call to discuss your property',
          s_project: 'Like what you see? Leave your number — we will call to discuss your property',
          s_services: 'Not sure what you need? Leave your number — we will advise and estimate',
          s_blog: 'Planning a renovation or design? Leave your number — we will call with a rough estimate' },
    es: { empty: 'Indique su número de teléfono y le llamamos.', phone: 'Revise el número: al menos 9 dígitos, con el prefijo del país.',
          sending: 'Enviando…', again: 'Enviar de nuevo', name: 'Nombre (opcional)', more: 'Añadir un comentario', send: 'Recibir presupuesto',
          note: 'Le llamamos y le damos un coste orientativo. La consulta por teléfono es gratuita.', ok: '¡Gracias! Le llamaremos en breve.',
          fail: 'No pudimos enviar su solicitud. Escríbanos o llame al +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'O escríbanos:', tr: '150+ proyectos desde 2016 · garantía de 36 meses · equipos propios · Google\u00a04,8★',
          q: 'Deje su número y le llamamos', like: 'Quiero algo así' },
    zh: { empty: '请填写电话号码，我们会给您回电。', phone: '请检查号码：至少 9 位数字，并带国家区号。',
          sending: '正在提交…', again: '重新提交', name: '姓名（选填）', more: '添加备注', send: '获取估价',
          note: '我们会回电并估算大致费用。电话咨询免费。', ok: '谢谢！我们会尽快给您回电。',
          fail: '提交失败。请通过 Telegram、WhatsApp 或 Viber 联系我们，或致电 +380 97 866 77 55。',
          alt: '或发消息：', tr: '自2016年起150+个项目 · 36个月保修 · 自有施工队 · Google\u00a04.8★',
          q: '留下电话，我们给您回电', like: '我也想要' },
    pl: { empty: 'Podaj numer telefonu — oddzwonimy.', phone: 'Sprawdź numer: co najmniej 9 cyfr, z kierunkowym kraju.',
          sending: 'Wysyłamy…', again: 'Wyślij ponownie', name: 'Imię (opcjonalnie)', more: 'Dodaj komentarz', send: 'Otrzymaj wycenę',
          note: 'Oddzwonimy i podamy orientacyjny koszt. Konsultacja telefoniczna jest bezpłatna.', ok: 'Dziękujemy! Oddzwonimy wkrótce.',
          fail: 'Nie udało się wysłać zapytania. Napisz lub zadzwoń: +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Lub napisz:', tr: '150+ projektów od 2016 · gwarancja 36 mies. · własne ekipy · Google\u00a04,8★',
          q: 'Zostaw numer — oddzwonimy', like: 'Chcę tak samo' },
    de: { empty: 'Bitte geben Sie Ihre Telefonnummer ein — wir rufen zurück.', phone: 'Bitte prüfen Sie die Nummer: mindestens 9 Ziffern, mit Ländervorwahl.',
          sending: 'Wird gesendet…', again: 'Erneut senden', name: 'Name (optional)', more: 'Kommentar hinzufügen', send: 'Schätzung erhalten',
          note: 'Wir rufen zurück und nennen die ungefähren Kosten. Die telefonische Beratung ist kostenlos.', ok: 'Danke! Wir rufen Sie in Kürze zurück.',
          fail: 'Die Anfrage konnte nicht gesendet werden. Schreiben oder rufen Sie uns an: +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Oder schreiben Sie:', tr: '150+ Projekte seit 2016 · 36 Monate Garantie · eigene Teams · Google\u00a04,8★',
          q: 'Nummer hinterlassen — wir rufen zurück', like: 'So etwas möchte ich' },
    fr: { empty: 'Indiquez votre numéro de téléphone, nous vous rappelons.', phone: 'Vérifiez le numéro : au moins 9 chiffres, avec l’indicatif du pays.',
          sending: 'Envoi…', again: 'Renvoyer', name: 'Nom (facultatif)', more: 'Ajouter un commentaire', send: 'Recevoir une estimation',
          note: 'Nous vous rappelons avec une estimation indicative. La consultation par téléphone est gratuite.', ok: 'Merci ! Nous vous rappelons rapidement.',
          fail: 'La demande n’a pas pu être envoyée. Écrivez-nous ou appelez le +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Ou écrivez-nous :', tr: '150+ projets depuis 2016 · garantie 36 mois · équipes internes · Google\u00a04,8★',
          q: 'Laissez votre numéro, nous vous rappelons', like: 'Je veux la même chose' },
    ar: { empty: 'يرجى إدخال رقم الهاتف وسنعاود الاتصال بك.', phone: 'تحقق من الرقم: 9 أرقام على الأقل مع رمز الدولة.',
          sending: 'جارٍ الإرسال…', again: 'إعادة الإرسال', name: 'الاسم (اختياري)', more: 'إضافة تعليق', send: 'احصل على تقدير',
          note: 'سنتصل بك ونقدّم تقديرًا تقريبيًا للتكلفة. الاستشارة الهاتفية مجانية.', ok: 'شكرًا! سنعاود الاتصال بك قريبًا.',
          fail: 'تعذّر إرسال الطلب. راسلنا أو اتصل على ‎+380 97 866 77 55 (Telegram وWhatsApp وViber).',
          alt: 'أو راسلنا:', tr: '+150 مشروعًا منذ 2016 · ضمان 36 شهرًا · فرق عمل خاصة بنا · \u2066Google\u00a04.8★\u2069',
          q: 'اترك رقمك وسنتصل بك', like: 'أريد مثل هذا' }
  };
  var lang = (document.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var t = T[lang] || T.uk;
  var UA = lang === 'uk' || lang === 'ru';
  var q = new URLSearchParams(location.search);
  var T0 = Date.now(); // антиспам: сервер відкидає заявки, надіслані швидше ніж за 1,5 с після відкриття сторінки
  function clarity(k, v, tag) { try { if (window.clarity) { if (tag) window.clarity('set', tag, String(v)); window.clarity('event', k); } } catch (x) {} }

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
  var started = false;
  function mask(inp, formName) {
    if (!inp || inp.dataset.lfMask) return;
    inp.dataset.lfMask = '1';
    // iPhone: type=tel + inputmode=tel — цифрова клавіатура; autocomplete=tel — підставляє власний номер
    if (inp.type !== 'tel') try { inp.type = 'tel'; } catch (x) {}
    if (!inp.getAttribute('inputmode')) inp.setAttribute('inputmode', 'tel');
    if (!inp.getAttribute('autocomplete')) inp.setAttribute('autocomplete', 'tel');
    inp.addEventListener('focus', function () { if (!started) { started = true; clarity('lead_start', formName ? formName() : '', 'lead_start_form'); } });
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
  // стан кнопки: «надсилаємо…» зі спінером (CSS .lf-busy) і назад
  function busy(btn, on, text) {
    if (!btn) return;
    btn.disabled = on; btn.classList.toggle('lf-busy', on);
    if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    if (text != null) btn.textContent = text;
  }

  // заявка йде паралельно в CRM сайту (/api/leads → D1 + миттєве сповіщення в Telegram) і в n8n (старий ланцюжок);
  // успіх — коли хоч один із двох відповів 2xx, помилка — коли обидва не змогли (або 12 с тиші)
  function post(data, onOk, onFail) {
    var done = false, left = 2;
    var fail = function () { if (done) return; done = true; onFail(); };
    var ok = function () {
      if (done) return;
      done = true; clearTimeout(timer);
      try { if (window.clarity) { window.clarity('set', 'lead_form', data.form); window.clarity('event', 'lead_submit'); } } catch (x) {}
      try { document.dispatchEvent(new CustomEvent('cas:lead', { detail: { form: data.form, service: data.service } })); } catch (x) {}
      onOk();
    };
    var miss = function () { if (--left === 0) { clearTimeout(timer); fail(); } };
    var timer = setTimeout(fail, 12000);
    data.t_ms = Date.now() - T0;
    var body = JSON.stringify(data);
    [API, HOOK].forEach(function (url) {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, credentials: url === API ? 'same-origin' : 'omit' })
        .then(function (r) { if (r.ok) ok(); else miss(); }, miss);
    });
  }
  // приховане поле-пастка: людина його не бачить і не заповнює, боти, що заповнюють усе, — так
  function trap(form) {
    if (form.querySelector('input[name="hp"]')) return;
    var hp = document.createElement('input');
    hp.type = 'text'; hp.name = 'hp'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
    // не left:-9999px: на RTL-сторінках (ar) це давало горизонтальну прокрутку на 10 000 px
    hp.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;padding:0;border:0;overflow:hidden;clip-path:inset(50%);opacity:0;pointer-events:none';
    form.appendChild(hp);
  }
  function base(form) {
    var hp = form.querySelector('input[name="hp"]');
    return {
      hp: hp && hp.value ? hp.value.slice(0, 100) : undefined,
      service: form.dataset.service || '', source: form.dataset.source || location.host + location.pathname,
      lang: lang, page: location.href,
      utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '', utm_campaign: q.get('utm_campaign') || ''
    };
  }
  function focusEl(el) { if (!el) return; try { el.focus({ preventScroll: false }); } catch (x) { el.focus(); } }
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  // «Або напишіть: Telegram · Viber · WhatsApp» (+ рядок довіри) — для форм, які будує скрипт
  function extras(trust) {
    var f = document.createDocumentFragment(), p = el('p', 'lq-alt', t.alt + ' ');
    MSG.forEach(function (m, i) {
      var a = el('a', '', m[0]); a.href = m[1];
      if (/^https:/.test(m[1])) { a.target = '_blank'; a.rel = 'noopener'; }
      if (i) p.appendChild(document.createTextNode(' · '));
      p.appendChild(a);
    });
    f.appendChild(p);
    if (trust) f.appendChild(el('p', 'lq-tr', t.tr));
    return f;
  }
  // клік на месенджер біля форми — теж контакт: рахуємо в Clarity
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.lq-alt a');
    if (a) clarity('lead_msg', a.textContent.trim().toLowerCase(), 'lead_msg_app');
  });

  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { var x = $(id); return x ? x.value.trim() : ''; };
  var form = $('of');

  /* ---------- 0. місця .lq-slot → компактне «Номер → передзвонимо» (form.lq) ---------- */
  var hero = document.querySelector('form.lq');
  var ref = form || hero;
  var srcBase = (ref && ref.dataset.source) || (location.host + location.pathname);
  var slots = [].slice.call(document.querySelectorAll('.lq-slot:not([data-built])'));
  // форму будуємо, коли місце за ~1,5 екрана від видимої області: на завантаженні сторінки — нуль роботи (TBT), а вставка
  // далеко під екраном не зсуває видимий вміст (CLS = 0). Без IntersectionObserver — одразу.
  function build(slot) {
    if (slot.hasAttribute('data-built')) return;
    var i = slots.indexOf(slot);
    slot.setAttribute('data-built', '1');
    var name = slot.getAttribute('data-form') || 'quick-slot', place = name.replace(/^quick-/, '');
    var key = 's_' + place.replace(/-(mid|end)$/, '');
    var id = 'lqs' + i, f = el('form', 'lq');
    f.noValidate = true;
    f.setAttribute('data-form', name);
    f.setAttribute('data-service', slot.getAttribute('data-service') || (ref && ref.dataset.service) || 'Консультація (' + (PL[place] || place) + ')');
    f.setAttribute('data-source', srcBase.replace(/#.*$/, '') + '#' + place);
    var end = /-end$/.test(place); // кінцевий CTA статті: вигода й месенджери вже є в самому блоці — лише номер
    var lb = el('label', 'lq-l', end ? t.q : t[key] || t.q); lb.htmlFor = id + 'P';
    var row = el('div', 'lq-r'), inp = el('input');
    inp.id = id + 'P'; inp.type = 'tel'; inp.setAttribute('inputmode', 'tel'); inp.setAttribute('autocomplete', 'tel');
    inp.placeholder = '+380 97 123 45 67';
    inp.setAttribute('aria-describedby', id + 'E');
    var b = el('button', 'lq-b', place === 'project' ? t.like : t.send); b.type = 'submit';
    row.appendChild(inp); row.appendChild(b);
    var er = el('div', 'lq-e'); er.id = id + 'E'; er.setAttribute('role', 'alert');
    f.appendChild(lb); f.appendChild(row); f.appendChild(er);
    if (!end) { f.appendChild(el('p', 'o-note', t.note)); f.appendChild(extras(true)); }
    var ok = el('div', 'lq-ok', t.ok); ok.setAttribute('role', 'status'); ok.setAttribute('tabindex', '-1'); ok.hidden = true;
    slot.appendChild(f); slot.appendChild(ok);
    wire(f);
  }
  function buildAll() { slots.forEach(build); }
  if (slots.length) {
    if ('IntersectionObserver' in window) {
      var sio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { sio.unobserve(e.target); build(e.target); } });
      }, { rootMargin: '150% 0px 150% 0px' });
      slots.forEach(function (s) { sio.observe(s); });
    } else buildAll();
  }

  /* ---------- 1. повна форма form#of ---------- */
  if (form) {
    trap(form);
    var err0 = $('oErr'), ok0 = $('oOk'), ph0 = $('oPhone'), btn0 = $('oBtn');
    // сторінки без розмітки leadform.py (кабінет, динамічні): імʼя «необовʼязково», коментар згорнуто, кнопка й примітка
    if (!form.hasAttribute('data-lf')) {
      var ln = form.querySelector('label[for="oName"]'); if (ln && !/\(/.test(ln.textContent)) ln.textContent = t.name;
      var nm = $('oName'); if (nm) nm.removeAttribute('required');
      var wrapOf = function (id) {
        var x = $(id); if (!x) return null;
        var w = x; while (w.parentNode && w.parentNode !== form) w = w.parentNode;
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
      if (btn0 && !form.querySelector('.o-note')) { var nt = el('p', 'o-note', t.note); btn0.insertAdjacentElement('afterend', nt); }
    }
    if (btn0) btn0.dataset.label = btn0.textContent;
    // доступність: помилка — role=alert і привʼязана до поля телефону; успіх — role=status, отримує фокус
    if (err0 && !err0.getAttribute('role')) err0.setAttribute('role', 'alert');
    if (ok0) { if (!ok0.getAttribute('role')) ok0.setAttribute('role', 'status'); if (!ok0.hasAttribute('tabindex')) ok0.setAttribute('tabindex', '-1'); }
    if (ph0) {
      mask(ph0, function () { return form.dataset.form || 'landing'; });
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
      busy(btn, true, t.sending);
      var data = base(form);
      data.name = val('oName') || NONAME; data.phone = '+' + d; data.area = val('oArea'); data.message = val('oMsg');
      data.form = form.dataset.form || 'landing';
      post(data, function () {
        busy(btn, false);
        form.style.display = 'none';
        var ok = $('oOk'); if (ok) { ok.style.display = 'block'; ok.classList.add('lf-ok-in'); focusEl(ok); }
      }, function () {
        busy(btn, false, t.again);
        if (err) err.textContent = t.fail;
      });
    });
  }

  /* ---------- 2. швидка заявка в один рядок form.lq ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('form.lq'), wire);
  function wire(f) {
    if (f.dataset.lfWired) return;
    f.dataset.lfWired = '1';
    var inp = f.querySelector('input[type="tel"]'), err = f.querySelector('.lq-e'), btn = f.querySelector('button[type="submit"]');
    trap(f);
    mask(inp, function () { return f.dataset.form || 'quick'; });
    if (inp) inp.setAttribute('aria-required', 'true');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = inp ? inp.value.trim() : '', d = normPhone(raw);
      if (!d) { if (err) err.textContent = raw ? t.phone : t.empty; if (inp) { inp.setAttribute('aria-invalid', 'true'); focusEl(inp); } return; }
      if (err) err.textContent = ''; if (inp) inp.removeAttribute('aria-invalid');
      var label = btn ? btn.textContent : '';
      busy(btn, true, t.sending);
      var data = base(f);
      data.name = NONAME; data.phone = '+' + d; data.area = ''; data.message = ''; data.form = f.dataset.form || 'quick';
      post(data, function () {
        busy(btn, false, label);
        var ok = f.nextElementSibling && f.nextElementSibling.classList.contains('lq-ok') ? f.nextElementSibling : null;
        if (!ok) { ok = el('div', 'lq-ok', t.ok); ok.setAttribute('role', 'status'); f.parentNode.insertBefore(ok, f.nextSibling); }
        ok.setAttribute('tabindex', '-1'); ok.hidden = false; ok.style.display = 'block'; ok.classList.add('lf-ok-in');
        f.style.display = 'none';
        focusEl(ok);
      }, function () {
        busy(btn, false, t.again || label);
        if (err) err.textContent = t.fail;
      });
    });
  }

  /* ---------- 3. «Залишити номер» (нижня панель) і кнопки-якорі #zayavka / #lead: прокрутка й фокус на телефоні ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.mb-lead, a[href="#zayavka"], a[href="#lead"]');
    if (!a) return;
    var vis = function (x) { return !!x && x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden'; };
    if (!document.querySelector('form.lq') && !$('oPhone')) buildAll(); // місця .lq-slot ще не зібрані (далеко від екрана)
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
