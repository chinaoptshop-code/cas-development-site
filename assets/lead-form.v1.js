/* CAS Development — спільні форми заявки. Обовʼязковий лише телефон (мін. 9 цифр, +380 або міжнародний); імʼя й коментар — за бажанням.
   1) Повна форма form#of: data-service="Назва послуги"  data-source="cas-develop.com/<сторінка>"  data-form="landing"
      поля #oPhone (обовʼязкове), #oName, #oArea, #oMsg (необовʼязкові), #oErr, #oBtn, блок успіху #oOk.
   2) Швидка заявка в один рядок form.lq (телефон + кнопка; ті самі data-service/data-source/data-form), успіх — .lq-ok після форми.
   3) Місця <div class="lq-slot" data-form="quick-prices|quick-portfolio|quick-project|quick-blog-mid|…"> — компактне
      «Номер → передзвонимо» (form.lq) будує цей скрипт — ліниво, за ~1,5 екрана до місця; data-source = джерело сторінки + «#місце» (для CRM і аналітики).
   4) Лід-магніт <div class="gd-slot" data-pdf="…"> (tools/guide/build.py) — «Гід з цінами»: не друга форма, а кнопка «Отримати гід з цінами»
      (.lq-go.gd-go) → єдина форма #zayavka з контекстом (data-form/source …#guide, коментар «Хочу гід з цінами»); після 2xx у #oOk — «Завантажити гід».
   Після 2xx у кожному блоці успіху (#oOk, .lq-ok, .qz-ok) — рядок «Відповідаємо Пн–Пт 10:00–20:00. Якщо терміново — напишіть у Telegram» + кнопка
   Telegram (Михайло 16.11.2026; тексти — AF нижче, їх пише tools/site/leadform.py sync_js з leadform.T[мова]['after'/'gd'/'gd_msg']).
   Сторінка-джерело (попередня сторінка сайту) — окреме поле ref_path (CRM, migrations/0011_lead_ref.sql) і, як раніше, рядок «Перед цим: …» у коментарі.
   Зовнішнє джерело візиту (хост чужого сайту з першого заходу в сесії, sessionStorage «cas_rh») — поле ref_host (migrations/0019_lead_ref_host.sql).
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
          sending: 'Надсилаємо…', again: 'Надіслати ще раз', name: 'Імʼя (необовʼязково)', more: 'Додати коментар', send: 'Отримати розрахунок', ok: 'Дякуємо. Перетелефонуємо найближчим часом.',
          fail: 'Не вдалося надіслати заявку. Напишіть або подзвоніть: +380 97 866 77 55 (Telegram, Viber, WhatsApp).',
          alt: 'Або напишіть:',
          q: 'Залиште номер — ми передзвонимо', like: 'Хочу так само',
          s_prices: 'Потрібна цифра для вашої площі? Залиште номер — передзвонимо й порахуємо',
          s_portfolio: 'Хочете так само? Залиште номер — передзвонимо й обговоримо ваш обʼєкт',
          s_project: 'Хочете так само? Залиште номер — передзвонимо й обговоримо ваш обʼєкт',
          s_services: 'Не знаєте, що саме потрібно? Залиште номер — підкажемо й порахуємо',
          s_blog: 'Плануєте ремонт чи дизайн? Залиште номер — передзвонимо й порахуємо орієнтовну вартість' },
    ru: { empty: 'Укажите номер телефона — мы перезвоним.', phone: 'Проверьте номер: нужно не меньше 9 цифр, напр. 097 123 45 67 или +380 97 123 45 67.',
          sending: 'Отправляем…', again: 'Отправить ещё раз', name: 'Имя (необязательно)', more: 'Добавить комментарий', send: 'Получить расчёт', ok: 'Спасибо. Перезвоним в ближайшее время.',
          fail: 'Не удалось отправить заявку. Напишите или позвоните: +380 97 866 77 55 (Telegram, Viber, WhatsApp).',
          alt: 'Или напишите:',
          q: 'Оставьте номер — мы перезвоним', like: 'Хочу так же',
          s_prices: 'Нужна цифра для вашей площади? Оставьте номер — перезвоним и посчитаем',
          s_portfolio: 'Хотите так же? Оставьте номер — перезвоним и обсудим ваш объект',
          s_project: 'Хотите так же? Оставьте номер — перезвоним и обсудим ваш объект',
          s_services: 'Не знаете, что именно нужно? Оставьте номер — подскажем и посчитаем',
          s_blog: 'Планируете ремонт или дизайн? Оставьте номер — перезвоним и посчитаем ориентировочную стоимость' },
    en: { empty: 'Please enter your phone number — we will call you back.', phone: 'Please check the number: at least 9 digits, with country code, e.g. +44 7700 900123.',
          sending: 'Sending…', again: 'Send again', name: 'Name (optional)', more: 'Add a comment', send: 'Get an estimate', ok: 'Thank you. We will call you back shortly.',
          fail: 'We could not send your request. Please message or call +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Or message us:',
          q: 'Leave your number — we will call you back', like: 'I want the same',
          s_prices: 'Need a figure for your floor area? Leave your number — we will call and estimate',
          s_portfolio: 'Like what you see? Leave your number — we will call to discuss your property',
          s_project: 'Like what you see? Leave your number — we will call to discuss your property',
          s_services: 'Not sure what you need? Leave your number — we will advise and estimate',
          s_blog: 'Planning a renovation or design? Leave your number — we will call with a rough estimate' },
    es: { empty: 'Indique su número de teléfono y le llamamos.', phone: 'Revise el número: al menos 9 dígitos, con el prefijo del país.',
          sending: 'Enviando…', again: 'Enviar de nuevo', name: 'Nombre (opcional)', more: 'Añadir un comentario', send: 'Recibir presupuesto', ok: 'Gracias. Le llamaremos en breve.',
          fail: 'No pudimos enviar su solicitud. Escríbanos o llame al +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'O escríbanos:',
          q: 'Deje su número y le llamamos', like: 'Quiero algo así' },
    zh: { empty: '请填写电话号码，我们会给您回电。', phone: '请检查号码：至少 9 位数字，并带国家区号。',
          sending: '正在提交…', again: '重新提交', name: '姓名（选填）', more: '添加备注', send: '获取估价', ok: '谢谢。我们会尽快给您回电。',
          fail: '提交失败。请通过 Telegram、WhatsApp 或 Viber 联系我们，或致电 +380 97 866 77 55。',
          alt: '或发消息：',
          q: '留下电话，我们给您回电', like: '我也想要' },
    pl: { empty: 'Podaj numer telefonu — oddzwonimy.', phone: 'Sprawdź numer: co najmniej 9 cyfr, z kierunkowym kraju.',
          sending: 'Wysyłamy…', again: 'Wyślij ponownie', name: 'Imię (opcjonalnie)', more: 'Dodaj komentarz', send: 'Otrzymaj wycenę', ok: 'Dziękujemy. Oddzwonimy wkrótce.',
          fail: 'Nie udało się wysłać zapytania. Napisz lub zadzwoń: +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Lub napisz:',
          q: 'Zostaw numer — oddzwonimy', like: 'Chcę tak samo' },
    de: { empty: 'Bitte geben Sie Ihre Telefonnummer ein — wir rufen zurück.', phone: 'Bitte prüfen Sie die Nummer: mindestens 9 Ziffern, mit Ländervorwahl.',
          sending: 'Wird gesendet…', again: 'Erneut senden', name: 'Name (optional)', more: 'Kommentar hinzufügen', send: 'Schätzung erhalten', ok: 'Danke. Wir rufen Sie in Kürze zurück.',
          fail: 'Die Anfrage konnte nicht gesendet werden. Schreiben oder rufen Sie uns an: +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Oder schreiben Sie:',
          q: 'Nummer hinterlassen — wir rufen zurück', like: 'So etwas möchte ich' },
    fr: { empty: 'Indiquez votre numéro de téléphone, nous vous rappelons.', phone: 'Vérifiez le numéro : au moins 9 chiffres, avec l’indicatif du pays.',
          sending: 'Envoi…', again: 'Renvoyer', name: 'Nom (facultatif)', more: 'Ajouter un commentaire', send: 'Recevoir une estimation', ok: 'Merci. Nous vous rappelons rapidement.',
          fail: 'La demande n’a pas pu être envoyée. Écrivez-nous ou appelez le +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Ou écrivez-nous :',
          q: 'Laissez votre numéro, nous vous rappelons', like: 'Je veux la même chose' },
    pt: { empty: 'Indique o seu número de telefone e ligamos-lhe.', phone: 'Verifique o número: pelo menos 9 dígitos, com o indicativo do país.',
          sending: 'A enviar…', again: 'Enviar de novo', name: 'Nome (opcional)', more: 'Acrescentar um comentário', send: 'Receber orçamento', ok: 'Obrigado. Ligaremos em breve.',
          fail: 'Não foi possível enviar o pedido. Escreva-nos ou ligue para +380 97 866 77 55 (Telegram, WhatsApp, Viber).',
          alt: 'Ou escreva-nos:',
          q: 'Deixe o seu número e ligamos-lhe', like: 'Quero algo assim' },
    ar: { empty: 'يرجى إدخال رقم الهاتف وسنعاود الاتصال بك.', phone: 'تحقق من الرقم: 9 أرقام على الأقل مع رمز الدولة.',
          sending: 'جارٍ الإرسال…', again: 'إعادة الإرسال', name: 'الاسم (اختياري)', more: 'إضافة تعليق', send: 'احصل على تقدير', ok: 'شكرًا. سنعاود الاتصال بك قريبًا.',
          fail: 'تعذّر إرسال الطلب. راسلنا أو اتصل على ‎+380 97 866 77 55 (Telegram وWhatsApp وViber).',
          alt: 'أو راسلنا:',
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
    if (on) btn._lfFocus = document.activeElement === btn;
    btn.disabled = on; btn.classList.toggle('lf-busy', on);
    if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    if (text != null) btn.textContent = text;
    // disabled знімає фокус з кнопки (він падає на <body>): після відповіді повертаємо його, щоб клавіатура й зчитувач не губили місце
    if (!on && btn._lfFocus && (!document.activeElement || document.activeElement === document.body)) { btn._lfFocus = false; try { btn.focus({ preventScroll: true }); } catch (x) {} }
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
    var rp = refPath(); if (rp) data.ref_path = rp;
    var rh = refHost(); if (rh) data.ref_host = rh;
    var tr = rp ? 'Перед цим: ' + rp : ''; if (tr && String(data.message || '').indexOf(tr) < 0) data.message = (data.message ? data.message + '\n' : '') + tr; // рядок — для n8n і старих звітів
    var body = JSON.stringify(data);
    [API, HOOK].forEach(function (url) {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, credentials: url === API ? 'same-origin' : 'omit' })
        .then(function (r) { if (r.ok) ok(); else miss(); }, miss);
    });
  }
  // звідки прийшов відвідувач у межах сайту (кейс, тур, стаття → лендинг/контакти): лише той самий сайт і інша сторінка,
  // лише шлях (без query/hash), ≤ 160 символів — сервер перевіряє так само (functions/api/leads.js refPath)
  function refPath() {
    try {
      var r = document.referrer ? new URL(document.referrer) : null;
      if (!r || r.host !== location.host || r.pathname === location.pathname) return '';
      return decodeURIComponent(r.pathname).slice(0, 160);
    } catch (x) { return ''; }
  }
  // зовнішнє джерело візиту: хост чужого сайту, з якого прийшли на першому заході в сесії (запамʼятовує site-chrome.v1.js у sessionStorage
  // «cas_rh»; якщо його ще немає — та сама перевірка тут). Лише хост, ≤ 80 символів — сервер перевіряє (functions/_refhost.js refHost)
  function refHost() {
    try {
      var S = window.sessionStorage, v = S.getItem('cas_rh');
      if (v == null && document.referrer) {
        var r = new URL(document.referrer), hn = r.hostname.toLowerCase().replace(/^www\./, '');
        if (/^https?:$/.test(r.protocol) && r.host !== location.host && !/(^|\.)cas-develop\.com$|\.pages\.dev$/.test(hn) && hn.length <= 80 && /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(hn)) { v = hn; S.setItem('cas_rh', v); }
      }
      return v && v.length <= 80 ? v : '';
    } catch (x) { return ''; }
  }
  /*af*/
  var AF = {
    uk: ["Відповідаємо Пн–Пт 10:00–20:00. Якщо терміново — напишіть у Telegram", "Отримати гід з цінами", "Хочу гід з цінами"],
    ru: ["Отвечаем Пн–Пт 10:00–20:00. Если срочно — напишите в Telegram", "Получить гид по ценам", "Хочу гид по ценам"],
    en: ["We reply Mon–Fri 10:00–20:00. If it is urgent, message us on Telegram", "Get the price guide", "I would like the price guide"],
    es: ["Respondemos de lunes a viernes, 10:00–20:00. Si es urgente, escríbanos por Telegram", "Recibir la guía de precios", "Quiero la guía de precios"],
    zh: ["我们的回复时间：周一至周五 10:00–20:00。如有急事，请通过 Telegram 联系我们", "获取价格指南", "我想要价格指南"],
    pl: ["Odpowiadamy pn–pt 10:00–20:00. Jeśli to pilne — napisz na Telegramie", "Pobierz przewodnik po cenach", "Chcę przewodnik po cenach"],
    de: ["Wir antworten Mo–Fr 10:00–20:00. Wenn es dringend ist, schreiben Sie uns auf Telegram", "Preisleitfaden erhalten", "Ich möchte den Preisleitfaden"],
    fr: ["Nous répondons du lundi au vendredi, 10:00–20:00. En cas d’urgence, écrivez-nous sur Telegram", "Recevoir le guide des prix", "Je souhaite le guide des prix"],
    pt: ["Respondemos de segunda a sexta, 10:00–20:00. Se for urgente, escreva-nos pelo Telegram", "Receber o guia de preços", "Quero o guia de preços"],
    ar: ["نرد من الاثنين إلى الجمعة 10:00–20:00. إذا كان الأمر عاجلًا، راسلنا على Telegram", "احصل على دليل الأسعار", "أريد دليل الأسعار"]
  };
  /*/af*/
  var af = AF[lang] || AF.uk || ['', '', ''];
  // після 2xx: години відповіді + кнопка Telegram (ті самі посилання, що у футері) — один раз у блоці успіху
  function after(ok) {
    if (!ok || !af[0] || ok.querySelector('.lf-after')) return;
    var p = el('p', 'lf-after', af[0] + ' '), a = el('a', 'btn lf-tg');
    a.href = MSG[0][1]; a.target = '_blank'; a.rel = 'noopener';
    var i = el('img'); i.src = '/assets/brand/telegram.svg'; i.width = i.height = 20; i.alt = ''; i.decoding = 'async';
    a.appendChild(i); a.appendChild(document.createTextNode('Telegram'));
    a.addEventListener('click', function () { clarity('lead_msg', 'telegram', 'lead_msg_app'); });
    p.appendChild(a); ok.appendChild(p);
  }
  window.casLeadAfter = after; // квіз (/assets/quiz.v1.js) — для свого .qz-ok
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
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { var x = $(id); return x ? x.value.trim() : ''; };
  var form = $('of');

  /* ---------- 0. місця .lq-slot → компактне «Номер → передзвонимо» (form.lq) ---------- */
  var hero = document.querySelector('form.lq');
  var ref = form || hero;
  var srcBase = (ref && ref.dataset.source) || (location.host + location.pathname);
  var slots = [].slice.call(document.querySelectorAll('.lq-slot:not([data-built])'));
  // форму будуємо, коли місце за ~3 екрани від видимої області (висоту до збірки резервує site-chrome.v1.css): на завантаженні сторінки — нуль роботи (TBT), а вставка
  // далеко під екраном не зсуває видимий вміст (CLS = 0). Без IntersectionObserver — одразу.
  /* Одна форма на сторінку (Михайло 05.11.2026): якщо внизу є form#of (#zayavka), місце .lq-slot — не друга форма, а кнопка,
     що переносить контекст (послугу, конфігурацію сцени) у єдину форму й прокручує до неї (скрол і фокус — обробник 3 нижче). */
  var GO = { uk: ['Залишити номер', 'Порахувати мій будинок', 'Порахувати мою квартиру'], ru: ['Оставить номер', 'Рассчитать мой дом', 'Рассчитать мою квартиру'],
    en: ['Leave your number', 'Estimate my house', 'Estimate my apartment'], es: ['Dejar mi número', 'Presupuestar mi casa', 'Presupuestar mi piso'],
    zh: ['留下电话', '估算我的房子', '估算我的公寓'], pl: ['Zostaw numer', 'Wyceń mój dom', 'Wyceń moje mieszkanie'],
    de: ['Nummer hinterlassen', 'Hauskosten berechnen', 'Wohnungskosten berechnen'], fr: ['Laisser mon numéro', 'Estimer ma maison', 'Estimer mon appartement'],
    pt: ['Deixar o meu número', 'Orçamentar a minha casa', 'Orçamentar o meu apartamento'], ar: ['اترك رقمك', 'احسب تكلفة منزلي', 'احسب تكلفة شقتي'] };
  function goBtn(slot, name) {
    var g = GO[lang] || GO.uk, sc = slot.closest('section.bz[data-bz]'), kind = sc ? (sc.getAttribute('data-bz') === 'flat' ? 2 : 1) : 0;
    var a = el('a', 'btn main lq-go', g[kind]); a.href = '#zayavka'; a.setAttribute('data-form', name);
    a.addEventListener('click', function () {
      var svc = slot.getAttribute('data-service');
      if (svc) form.setAttribute('data-service', svc);
      form.setAttribute('data-form', name); form.setAttribute('data-source', srcBase.replace(/#.*$/, '') + '#' + name.replace(/^quick-/, ''));
      var m = $('oMsg');
      if (sc && m) {
        var cb = sc.querySelector('.bz-cb'), cap = sc.querySelector('.bz-cap'), act = sc.querySelector('.bz-mats [aria-pressed="true"]');
        var cfg = cb ? cb.textContent.replace(/^[\s\u2699]+/, '') : '';
        if (cap && cap.textContent && !cap.hidden) cap.textContent.replace(/^≈\s*/, '').split(' · ').forEach(function (x) { if (x && cfg.indexOf(x) < 0 && !/^\d+\s*(?:м²|m²|م²)$/.test(x)) cfg += (cfg ? ' · ' : '') + x; }); // габарити, гараж/тераса — без повторів
        if (!cfg && act) cfg = act.textContent;
        var es = slot.getAttribute('data-est') || ''; // орієнтир сцени за тими ж ставками, що калькулятор (build-anim: casCost)
        m.value = g[kind] + (cfg ? ': ' + cfg.trim() : '') + (es ? ' · ' + es : '');
        var det = m.closest('details'); if (det) det.open = true;
      }
    });
    slot.appendChild(a);
  }
  function build(slot) {
    if (slot.hasAttribute('data-built')) return;
    var i = slots.indexOf(slot);
    slot.setAttribute('data-built', '1');
    var name = slot.getAttribute('data-form') || 'quick-slot', place = name.replace(/^quick-/, '');
    if (form) { goBtn(slot, name); return; }
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
    var ok = el('div', 'lq-ok', t.ok); ok.setAttribute('role', 'status'); ok.setAttribute('tabindex', '-1'); ok.hidden = true;
    slot.appendChild(f); slot.appendChild(ok);
    wire(f);
  }
  function buildAll() { slots.forEach(build); }
  if (slots.length) {
    if ('IntersectionObserver' in window) {
      var sio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { sio.unobserve(e.target); build(e.target); } });
      }, { rootMargin: '300% 0px 300% 0px' });
      slots.forEach(function (s) { sio.observe(s); });
    } else buildAll();
  }
  // блок сцени, підставлений перемикачем сцен на головній (site-chrome.v1.js), — його місця .lq-slot теж стають кнопкою до єдиної форми
  window.casLqSlots = function (root) { if (!form || !root) return; [].forEach.call(root.querySelectorAll('.lq-slot:not([data-built])'), function (s) { slots.push(s); build(s); }); };

  /* ---------- 0б. лід-магніт «Гід з цінами» (PDF): <div class="gd-slot" data-pdf="/assets/guide/…pdf?v=…"> ставить tools/guide/build.py.
     Одна форма на сторінку (Михайло 16.11.2026): замість другої форми — кнопка «Отримати гід з цінами» (.lq-go.gd-go → #zayavka),
     що переносить контекст у form#of (data-form="guide", data-service «Гід з цінами», source …#guide, коментар «Хочу гід з цінами»);
     після 2xx у #oOk — кнопка «Завантажити гід». Без #of (styleguide) — та сама кнопка на «Заявку» з шапки. Блок будуємо ліниво. */
  var G = {
    uk: { h: 'Гід з цінами на ремонт і дизайн 2026', p: 'PDF: ставки «від» для Києва і Європи, що входить у ремонт від $550/м², пакети дизайну, будинок, етапи, схеми оплати й чекліст прийому ремонту.',
          ok: 'Гід можна завантажити:', dl: 'Завантажити гід' },
    ru: { h: 'Гид по ценам на ремонт и дизайн 2026', p: 'PDF: ставки «от» для Киева и Европы, что входит в ремонт от $550/м², пакеты дизайна, дом, этапы, схемы оплаты и чек-лист приёмки ремонта.',
          ok: 'Гид можно скачать:', dl: 'Скачать гид' }
  };
  var gslots = [].slice.call(document.querySelectorAll('.gd-slot:not([data-built])')), gpdf = '';
  function buildGuide(slot) {
    if (slot.hasAttribute('data-built')) return;
    slot.setAttribute('data-built', '1');
    var g = G[lang] || G.uk, pdf = slot.getAttribute('data-pdf') || '';
    var box = el('div', 'gd');
    box.appendChild(el('p', 'gd-h', g.h)); box.appendChild(el('p', 'gd-p', g.p));
    var a = el('a', 'btn main lq-go gd-go', af[1]); a.setAttribute('data-form', 'guide');
    var cta = document.querySelector('a.sch-cta');
    a.href = form ? '#zayavka' : (cta ? cta.getAttribute('href') : '#zayavka');
    if (form) a.addEventListener('click', function () {
      gpdf = pdf;
      form.setAttribute('data-service', 'Гід з цінами'); form.setAttribute('data-form', 'guide');
      form.setAttribute('data-source', srcBase.replace(/#.*$/, '') + '#guide');
      var m = $('oMsg');
      if (m) { if (!m.value || m.value === af[2]) m.value = af[2]; var det = m.closest('details'); if (det) det.open = true; }
      clarity('guide_go', lang, 'guide_lang');
    });
    box.appendChild(a);
    slot.appendChild(box);
  }
  // після 2xx заявки з контекстом гіда — посилання на PDF у блоці успіху форми
  function guideOk(ok) {
    if (!ok || !gpdf || form.dataset.form !== 'guide' || ok.querySelector('.gd-dl')) return;
    var g = G[lang] || G.uk, p = el('p', 'gd-ok', g.ok + ' ');
    var a = el('a', 'btn main gd-dl', g.dl); a.href = gpdf; a.setAttribute('download', ''); a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', function () { clarity('guide_download', lang, 'guide_lang'); });
    p.appendChild(a); ok.appendChild(p);
  }
  if (gslots.length) {
    if ('IntersectionObserver' in window) {
      var gio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { gio.unobserve(e.target); buildGuide(e.target); } });
      }, { rootMargin: '150% 0px 150% 0px' });
      gslots.forEach(function (s) { gio.observe(s); });
    } else gslots.forEach(buildGuide);
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
        var ok = $('oOk'); if (ok) { guideOk(ok); after(ok); ok.style.display = 'block'; ok.classList.add('lf-ok-in'); focusEl(ok); }
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
      data.name = NONAME; data.phone = '+' + d; data.area = ''; data.form = f.dataset.form || 'quick';
      var cm = f.closest && f.closest('[data-msg]'); data.message = cm ? cm.getAttribute('data-msg').slice(0, 300) : ''; // конфігурація з блоку (напр. «Будинок з нуля»: технологія / тип / стиль / площа)
      post(data, function () {
        busy(btn, false, label);
        var ok = f.nextElementSibling && f.nextElementSibling.classList.contains('lq-ok') ? f.nextElementSibling : null;
        if (!ok) { ok = el('div', 'lq-ok', t.ok); ok.setAttribute('role', 'status'); f.parentNode.insertBefore(ok, f.nextSibling); }
        after(ok); ok.setAttribute('tabindex', '-1'); ok.hidden = false; ok.style.display = 'block'; ok.classList.add('lf-ok-in');
        f.style.display = 'none';
        focusEl(ok);
      }, function () {
        busy(btn, false, t.again || label);
        if (err) err.textContent = t.fail;
      });
    });
  }

  /* ---------- 2б. форма у вікні (Михайло 24.11.2026: «збоку зробити кнопку "Розрахувати проєкт", після натискання якої відкриється вже вікно
     розрахунку»; картку контактів біля форми й ряд іконок під кнопкою прибрано — іконки лише у футері) ----------
     Секцію <section id="zayavka"> з JS ховає CSS («Вікно заявки» у site-chrome.v1.css, є й у crit.v1.css); тут її вміст (H2, form#of, #oOk) переїздить
     у <dialog class="fdl"> у кінці <body> — форма та сама одна (data-service/data-source, успіх лише після 2xx). Вікно відкривають усі посилання
     на #zayavka (обробник 3: кнопка футера, «Заявка» в шапці, «Залишити номер», .lq-go, сцени, калькулятор, «Гід з цінами») і адреса …#zayavka.
     showModal — top layer над шапкою, кружечками й cookies; фокус усередині й назад на кнопку; ✕, Esc, тло, «Назад» браузера (pushState, як лайтбокс).
     Прокрутка сторінки під вікном — без overflow:hidden на <html>: вікно саме — прокручуваний шар на весь екран (вміст на 1 px вищий + overscroll-behavior).
     Без <dialog> — html.nofd: секція на місці, як раніше. Реферальна (data-fd="0"), Оздоба (.ozd-sec) і конфігуратор (свій dialog) — без змін. */
  var XL = { uk: 'Закрити', ru: 'Закрыть', en: 'Close', es: 'Cerrar', zh: '关闭', pl: 'Zamknij', de: 'Schließen', fr: 'Fermer', pt: 'Fechar', ar: 'إغلاق' };
  var H = document.documentElement, sec = $('zayavka'), dlg = null, opener = null, pushed = false, popWait = false, byPop = false;
  var canDlg = !!(window.HTMLDialogElement && typeof HTMLDialogElement.prototype.showModal === 'function');
  var fdOn = !!(form && sec && sec.tagName === 'SECTION' && sec.contains(form) && sec.getAttribute('data-fd') !== '0' && !sec.classList.contains('ozd-sec'));
  if (fdOn && !canDlg) { fdOn = false; H.classList.add('nofd'); }
  function fdPush() { try { if (!pushed) { history.pushState({ fdl: 1 }, ''); pushed = true; } } catch (x) {} }
  if (fdOn) {
    dlg = el('dialog', 'fdl');
    var fin = el('div', 'fdl-in'), card = el('div', 'fdl-c'), fx = el('button', 'fdl-x', '×');
    fx.type = 'button'; fx.setAttribute('aria-label', XL[lang] || XL.en); fx.title = XL[lang] || XL.en;
    var sw = sec.querySelector('.w') || sec, h2 = sw.querySelector('h2');
    if (h2) { if (!h2.id) h2.id = 'fdlT'; dlg.setAttribute('aria-labelledby', h2.id); }
    card.appendChild(fx);
    while (sw.firstChild) card.appendChild(sw.firstChild);
    fin.appendChild(card); dlg.appendChild(fin); document.body.appendChild(dlg);
    fx.addEventListener('click', function () { fdClose(); });
    // тло: клік поза карткою (саме вікно на весь екран або обгортка)
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target === fin) fdClose(); });
    dlg.addEventListener('close', function () {
      H.classList.remove('fdl-on');
      var b = opener && opener.isConnected && opener.offsetParent !== null ? opener : null; opener = null;
      if (b) try { b.focus({ preventScroll: true }); } catch (x) {}
      if (pushed) { pushed = false; if (!byPop) try { popWait = true; history.back(); } catch (x) { popWait = false; } }
      byPop = false;
    });
    window.addEventListener('popstate', function () {
      if (popWait) { popWait = false; if (dlg.open) fdPush(); return; } // наш history.back() після закриття
      if (dlg.open) { pushed = false; byPop = true; dlg.close(); }
    });
  }
  function fdClose() { if (dlg && dlg.open) dlg.close(); }
  // відкрити вікно; фокус — на телефон (як раніше після прокрутки), після успіху — на блок «дякуємо»
  function fdOpen(a) {
    if (!dlg) return false;
    if (!dlg.open) {
      opener = a && a.focus ? a : document.activeElement;
      try { dlg.showModal(); } catch (x) { return false; }
      H.classList.add('fdl-on');
      dlg.scrollTop = 0;
      if (!popWait) fdPush();
      clarity('lead_open', (a && (a.getAttribute('data-form') || a.className)) || 'link', 'lead_open_from');
    }
    var ph = $('oPhone'), ok = $('oOk'), t0 = form.style.display === 'none' && ok ? ok : ph;
    if (t0) try { t0.focus({ preventScroll: true }); } catch (x) { t0.focus(); }
    return true;
  }
  window.casLeadOpen = fdOpen;
  // сторінку відкрито з …#zayavka (кнопка футера сторінки без форми, посилання ззовні) — одразу вікно; якір прибираємо з адреси
  function fromHash() {
    if (!dlg || location.hash !== '#zayavka') return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (x) {}
    fdOpen(null);
  }
  if (dlg) { fromHash(); window.addEventListener('hashchange', fromHash); }

  /* ---------- 3. «Залишити номер» (нижня панель) і кнопки-якорі #zayavka / #lead: прокрутка й фокус на телефоні ---------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest('a.mb-lead, a[href="#zayavka"]:not([data-chat]), a[href="#lead"]:not([data-chat])'); // іконки чату (a[data-chat] → #zayavka лише без JS) відкривають панель
    if (!a && dlg) { // форма цієї ж сторінки повною адресою (/contact#zayavka на /contact)
      a = e.target.closest && e.target.closest('a[href$="#zayavka"]:not([data-chat])');
      if (a && (a.host !== location.host || a.pathname.replace(/\.html$/, '') !== location.pathname.replace(/\.html$/, ''))) a = null;
    }
    if (!a) return;
    if (dlg && !(a.getAttribute('href') === '#lead' && document.querySelector('form.lq'))) { e.preventDefault(); fdOpen(a); return; } // вікно заявки (2б)
    var vis = function (x) { return !!x && x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden'; };
    if (!document.querySelector('form.lq') && !$('oPhone')) buildAll(); // місця .lq-slot ще не зібрані (далеко від екрана)
    var lq = document.querySelector('form.lq input[type="tel"]');
    var target = a.getAttribute('href') === '#lead' && vis(lq) ? lq : (vis($('oPhone')) ? $('oPhone') : null);
    if (!target && vis(lq)) target = lq;
    if (!target && $('oPhone') && typeof window.openQuickForm === 'function') { e.preventDefault(); window.openQuickForm(); setTimeout(function () { focusEl($('oPhone')); }, 350); return; }
    if (!target) return; // форми на сторінці нема — посилання веде на сторінку з формою
    e.preventDefault();
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (x) { target.scrollIntoView(); }
    setTimeout(function () {
      // Safari не має scroll anchoring: збірка сцени вище (її компенсація scrollBy) обриває плавну прокрутку — поле лишалось за екраном. Доводимо до місця.
      var r = target.getBoundingClientRect();
      if (r.bottom < 0 || r.top > (window.innerHeight || 0)) target.scrollIntoView({ block: 'center' });
      try { target.focus({ preventScroll: true }); } catch (x) { target.focus(); }
    }, 400);
  });
})();
