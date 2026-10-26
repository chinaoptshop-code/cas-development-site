/* CAS Development — квіз-калькулятор «4 кроки → телефон» (UI-kit /styleguide/#quiz; розмітку-заготовку ставить tools/site/quiz.py).
   Заготовка: <div class="qz" data-quiz data-obj="kv" data-svc="rem" data-css="/assets/quiz.v1.css?v=…"></div>.
   Ліниво: CSS і кроки будуються, коли блок наближається до екрана (IntersectionObserver).
   Орієнтир «від» — лише за ставками з CLAUDE.md: дизайн $30/м² (мін. $2 500), ремонт $550/м², офіс $350/м², меблювання $250/м²,
   будівництво $600/м², будинок під ключ $1 100/м²; комерційний ремонт — індивідуально (окремої ставки немає).
   Надсилання — ЛИШЕ через спільну форму form#of і /assets/lead-form.v1.js (одна заявка на сторінку): квіз кладе телефон у #oPhone,
   площу в #oArea, відповіді — у #oMsg (українською, для менеджера), data-form="quiz", і викликає form.requestSubmit().
   Успіх — лише після події cas:lead (lead-form шле її після 2xx), помилку дзеркалимо з #oErr. Clarity: quiz_step; lead_submit — lead-form.
   data-demo — режим для /styleguide/: нічого не надсилає. */
(function () {
  var d = document, lang = (d.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var L = {
    uk: { step: 'Крок {n} з {t}', next: 'Далі', back: 'Назад', again: 'Змінити відповіді',
      q: ['Що за обʼєкт?', 'Яка послуга потрібна?', 'Яка площа?', 'Коли плануєте почати?'],
      obj: { kv: 'Квартира', dim: 'Будинок', kom: 'Комерція', of: 'Офіс' },
      svc: { dyz: 'Дизайн-проєкт', rem: 'Ремонт', bud: 'Будівництво', meb: 'Меблювання', kl: 'Під ключ' },
      when: { now: 'Якнайшвидше', m3: 'Протягом 1–3 місяців', m6: 'Через 3–6 місяців', calc: 'Поки рахую бюджет' },
      area: 'Площа, м²', m2: 'м²', est: 'Орієнтовно', from: 'від', ind: 'Розрахуємо індивідуально',
      line: { dyz: 'дизайн-проєкт', rem: 'ремонт', of: 'ремонт офісу', bud: 'будівництво', meb: 'меблювання', kl: 'будинок під ключ' },
      min: 'мін. $2 500',
      note: { rem: 'Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.',
        of: 'Офіс від $350/м² — роботи й чорнові матеріали.', kom: 'Для комерційних приміщень окремої ставки немає — рахуємо за кошторисом.' },
      disc: 'Це орієнтир за базовими ставками студії. Точну суму фіксуємо в кошторисі після заміру.',
      phone: 'Телефон для розрахунку *', ph: '+380 97 123 45 67', send: 'Отримати розрахунок', sending: 'Надсилаємо…',
      tip: 'Перетелефонуємо найближчим часом. Консультація по телефону — безкоштовна.',
      empty: 'Вкажіть номер телефону — ми передзвонимо.', bad: 'Перевірте номер: потрібно щонайменше 9 цифр, напр. 097 123 45 67.',
      fail: 'Не вдалося надіслати. Подзвоніть або напишіть: +380 97 866 77 55.', ok: 'Дякуємо! Перетелефонуємо найближчим часом і уточнимо розрахунок.',
      demo: 'Демо: заявку не надіслано.' },
    ru: { step: 'Шаг {n} из {t}', next: 'Далее', back: 'Назад', again: 'Изменить ответы',
      q: ['Какой объект?', 'Какая услуга нужна?', 'Какая площадь?', 'Когда планируете начать?'],
      obj: { kv: 'Квартира', dim: 'Дом', kom: 'Коммерция', of: 'Офис' },
      svc: { dyz: 'Дизайн-проект', rem: 'Ремонт', bud: 'Строительство', meb: 'Меблировка', kl: 'Под ключ' },
      when: { now: 'Как можно скорее', m3: 'В течение 1–3 месяцев', m6: 'Через 3–6 месяцев', calc: 'Пока считаю бюджет' },
      area: 'Площадь, м²', m2: 'м²', est: 'Ориентировочно', from: 'от', ind: 'Рассчитаем индивидуально',
      line: { dyz: 'дизайн-проект', rem: 'ремонт', of: 'ремонт офиса', bud: 'строительство', meb: 'меблировка', kl: 'дом под ключ' },
      min: 'мин. $2 500',
      note: { rem: 'Ремонт от $550/м² — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете.',
        of: 'Офис от $350/м² — работы и черновые материалы.', kom: 'Для коммерческих помещений отдельной ставки нет — считаем по смете.' },
      disc: 'Это ориентир по базовым ставкам студии. Точную сумму фиксируем в смете после замера.',
      phone: 'Телефон для расчёта *', ph: '+380 97 123 45 67', send: 'Получить расчёт', sending: 'Отправляем…',
      tip: 'Перезвоним в ближайшее время. Консультация по телефону — бесплатная.',
      empty: 'Укажите номер телефона — мы перезвоним.', bad: 'Проверьте номер: нужно не меньше 9 цифр, напр. 097 123 45 67.',
      fail: 'Не удалось отправить. Позвоните или напишите: +380 97 866 77 55.', ok: 'Спасибо! Перезвоним в ближайшее время и уточним расчёт.',
      demo: 'Демо: заявка не отправлена.' },
    en: { step: 'Step {n} of {t}', next: 'Next', back: 'Back', again: 'Change answers',
      q: ['What is the property?', 'Which service do you need?', 'What is the area?', 'When do you plan to start?'],
      obj: { kv: 'Apartment', dim: 'House', kom: 'Commercial', of: 'Office' },
      svc: { dyz: 'Design project', rem: 'Renovation', bud: 'Construction', meb: 'Furnishing', kl: 'Turnkey' },
      when: { now: 'As soon as possible', m3: 'Within 1–3 months', m6: 'In 3–6 months', calc: 'Still planning the budget' },
      area: 'Area, m²', m2: 'm²', est: 'Estimate', from: 'from', ind: 'We will price it individually',
      line: { dyz: 'design project', rem: 'renovation', of: 'office renovation', bud: 'construction', meb: 'furnishing', kl: 'turnkey house' },
      min: 'min. $2,500',
      note: { rem: 'Renovation from $550/m² covers labour and rough materials; finishing materials, furniture and appliances are extra, per estimate.',
        of: 'Office from $350/m² covers labour and rough materials.', kom: 'There is no flat rate for commercial premises — we price them per estimate.' },
      disc: 'This is a guide based on the studio’s base rates. The exact sum is fixed in the estimate after the site survey.',
      phone: 'Phone for the estimate *', ph: '+44 7700 900123', send: 'Get my estimate', sending: 'Sending…',
      tip: 'We will call you back shortly. Phone consultation is free.',
      empty: 'Please enter your phone number — we will call you back.', bad: 'Please check the number: at least 9 digits, with country code.',
      fail: 'We could not send it. Please call or message +380 97 866 77 55.', ok: 'Thank you! We will call you back shortly to refine the estimate.',
      demo: 'Demo: nothing was sent.' }
  };
  var t = L[lang] || L.uk, U = L.uk;
  var UA = lang === 'uk' || lang === 'ru';
  var RATE = { dyz: 30, rem: 550, of: 350, meb: 250, bud: 600, kl: 1100 }, DMIN = 2500;
  var SVC = ['dyz', 'rem', 'bud', 'meb', 'kl'], OBJ = ['kv', 'dim', 'kom', 'of'], WHEN = ['now', 'm3', 'm6', 'calc'];
  var DEF_AREA = { kv: 70, dim: 150, kom: 120, of: 150 };

  function clarity(k, v) { try { if (window.clarity) { window.clarity('set', k, String(v)); window.clarity('event', k); } } catch (x) {} }
  function money(n) {
    var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : ' ');
    return '$' + s;
  }
  // той самий розбір номера, що й у lead-form.v1.js (щоб невірний номер не «стрибав» до основної форми)
  function normPhone(v) {
    var x = String(v || '').replace(/\D/g, '');
    if (/^0\d{9}$/.test(x)) x = '38' + x;
    else if (/^80\d{9}$/.test(x)) x = '3' + x;
    else if (/^3800\d{9}$/.test(x)) x = '380' + x.slice(4);
    else if (UA && /^[1-9]\d{8}$/.test(x)) x = '380' + x;
    if (/^380/.test(x) && x.length !== 12) return null;
    return x.length >= 9 && x.length <= 15 ? x : null;
  }

  /* Розрахунок: [{k: рядок, v: сума|null, r: ставка}], нотатки. Лише ставки CLAUDE.md. */
  function estimate(o, s, a) {
    var lines = [], notes = [];
    var dz = function () { lines.push({ k: 'dyz', v: Math.max(a * RATE.dyz, DMIN), r: '$30/' + t.m2 + ', ' + t.min }); };
    var rm = function () {
      if (o === 'kom') { lines.push({ k: 'rem', v: null }); notes.push(t.note.kom); }
      else if (o === 'of') { lines.push({ k: 'of', v: a * RATE.of, r: '$350/' + t.m2 }); notes.push(t.note.of); }
      else { lines.push({ k: 'rem', v: a * RATE.rem, r: '$550/' + t.m2 }); notes.push(t.note.rem); }
    };
    var mb = function () { lines.push({ k: 'meb', v: a * RATE.meb, r: '$250/' + t.m2 }); };
    if (s === 'dyz') dz();
    else if (s === 'rem') rm();
    else if (s === 'meb') mb();
    else if (s === 'bud') lines.push(o === 'dim' ? { k: 'bud', v: a * RATE.bud, r: '$600/' + t.m2 } : { k: 'bud', v: null });
    else if (s === 'kl') {
      if (o === 'dim') lines.push({ k: 'kl', v: a * RATE.kl, r: '$1' + (lang === 'en' ? ',' : ' ') + '100/' + t.m2 });
      else { dz(); rm(); mb(); }
    }
    var sum = 0, known = 0, unknown = 0;
    lines.forEach(function (l) { if (l.v == null) unknown++; else { sum += l.v; known++; } });
    return { lines: lines, notes: notes, sum: known ? sum : null, partial: !!unknown };
  }

  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  var uid = 0;
  function build(root) {
    if (root.dataset.ready) return; root.dataset.ready = '1';
    var id = 'qz' + (++uid), demo = root.hasAttribute('data-demo');
    var st = { obj: OBJ.indexOf(root.dataset.obj) >= 0 ? root.dataset.obj : '', svc: SVC.indexOf(root.dataset.svc) >= 0 ? root.dataset.svc : '',
      area: 0, when: '' };
    var TOTAL = 4, cur = 0, first = true, areaSet = false;
    root.textContent = '';
    var head = el('div', 'qz-hd'), prog = el('p', 'qz-pg'), bar = el('div', 'qz-bar'), fill = el('i');
    prog.id = id + 'pg'; prog.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-hidden', 'true'); bar.appendChild(fill); head.appendChild(prog); head.appendChild(bar); root.appendChild(head);
    var steps = [], body = el('div', 'qz-bd'); root.appendChild(body);

    function radios(i, name, keys, labels, key) {
      var fs = el('fieldset', 'qz-st'), lg = el('legend', 'qz-q', t.q[i]); lg.tabIndex = -1; fs.appendChild(lg);
      var grid = el('div', 'qz-os');
      keys.forEach(function (k) {
        var lb = el('label', 'qz-o'), inp = el('input'); inp.type = 'radio'; inp.name = id + name; inp.value = k;
        if (st[key] === k) inp.checked = true;
        inp.addEventListener('change', function () { st[key] = k; if (key === 'obj') syncSvc(); navState(); });
        // мишею/дотиком — одразу далі; клавіатурою (стрілки) — лише вибір, далі кнопкою
        lb.addEventListener('click', function (e) { if (e.detail > 0 && e.target === inp) setTimeout(function () { go(i + 1); }, 160); });
        lb.appendChild(inp); lb.appendChild(el('span', '', labels[k])); grid.appendChild(lb);
      });
      fs.appendChild(grid); return fs;
    }
    steps.push(radios(0, 'o', OBJ, t.obj, 'obj'));
    var svcStep = radios(1, 's', SVC, t.svc, 'svc'); steps.push(svcStep);
    function syncSvc() { // «Будівництво» — лише для будинку
      var b = svcStep.querySelector('input[value="bud"]'), on = st.obj === 'dim';
      b.closest('label').hidden = !on; b.disabled = !on;
      if (!on && st.svc === 'bud') { st.svc = ''; b.checked = false; }
    }
    // площа: повзунок + число
    var fa = el('fieldset', 'qz-st'), la = el('legend', 'qz-q', t.q[2]); la.tabIndex = -1; fa.appendChild(la);
    var row = el('div', 'qz-ar'), rg = el('input'), nb = el('input'), nl = el('label', 'qz-al', t.area);
    rg.type = 'range'; rg.min = 10; rg.max = 1000; rg.step = 5; rg.setAttribute('aria-label', t.area);
    nb.type = 'number'; nb.min = 10; nb.max = 20000; nb.step = 1; nb.inputMode = 'numeric'; nb.id = id + 'a'; nl.htmlFor = nb.id;
    function setArea(v, from) {
      v = Math.round(+v || 0); st.area = v; if (from) areaSet = true;
      if (from !== rg) rg.value = Math.min(1000, Math.max(10, v));
      if (from !== nb) nb.value = v;
      rg.setAttribute('aria-valuetext', v + ' ' + t.m2); navState();
    }
    rg.addEventListener('input', function () { setArea(rg.value, rg); });
    nb.addEventListener('input', function () { setArea(nb.value, nb); });
    var nw = el('div', 'qz-an'); nw.appendChild(nl); nw.appendChild(nb);
    row.appendChild(rg); row.appendChild(nw); fa.appendChild(row); steps.push(fa);
    steps.push(radios(3, 'w', WHEN, t.when, 'when'));
    // результат + телефон
    var res = el('div', 'qz-st qz-res'), rh = el('p', 'qz-q'); rh.tabIndex = -1; res.appendChild(rh);
    var ul = el('ul', 'qz-ls'), nt = el('p', 'qz-nt'), ds = el('p', 'qz-nt', t.disc);
    res.appendChild(ul); res.appendChild(nt); res.appendChild(ds);
    var pl = el('label', 'qz-pl', t.phone), pr = el('div', 'qz-pr'), ph = el('input'), sb = el('button', 'qz-b qz-send', t.send), er = el('div', 'qz-er'), tip = el('p', 'qz-nt', t.tip);
    ph.type = 'tel'; ph.inputMode = 'tel'; ph.autocomplete = 'tel'; ph.placeholder = t.ph; ph.id = id + 'p'; pl.htmlFor = ph.id;
    er.id = id + 'e'; er.setAttribute('role', 'alert'); ph.setAttribute('aria-describedby', er.id); ph.setAttribute('aria-required', 'true');
    sb.type = 'button';
    pr.appendChild(ph); pr.appendChild(sb); res.appendChild(pl); res.appendChild(pr); res.appendChild(er); res.appendChild(tip);
    steps.push(res);
    var ok = el('div', 'qz-ok', t.ok); ok.setAttribute('role', 'status'); ok.tabIndex = -1; ok.hidden = true;
    steps.forEach(function (s) { s.hidden = true; body.appendChild(s); });
    root.appendChild(ok);
    var nav = el('div', 'qz-nv'), bb = el('button', 'qz-b qz-bk', t.back), nx = el('button', 'qz-b qz-nx', t.next);
    bb.type = nx.type = 'button'; nav.appendChild(bb); nav.appendChild(nx); root.appendChild(nav);

    function valid(i) { return i === 0 ? !!st.obj : i === 1 ? !!st.svc : i === 2 ? st.area >= 10 : i === 3 ? !!st.when : true; }
    function navState() { nx.disabled = !valid(cur); }
    function render() {
      var e = estimate(st.obj, st.svc, st.area);
      rh.textContent = t.est + ': ' + (e.sum != null ? t.from + ' ' + money(e.sum) : t.ind);
      ul.textContent = '';
      e.lines.forEach(function (l) {
        var li = el('li'); li.appendChild(d.createTextNode((t.line[l.k] || l.k) + (l.r ? ' · ' + st.area + ' ' + t.m2 + ' × ' + l.r : '') + ' — '));
        li.appendChild(el('b', '', l.v != null ? t.from + ' ' + money(l.v) : t.ind)); ul.appendChild(li);
      });
      nt.textContent = e.notes.join(' '); nt.hidden = !e.notes.length;
      return e;
    }
    function go(i) {
      if (i > cur && !valid(cur)) { navState(); return; }
      i = Math.max(0, Math.min(TOTAL, i));
      if (i === 2 && !areaSet) setArea(DEF_AREA[st.obj] || 70);
      cur = i;
      steps.forEach(function (s, k) { s.hidden = k !== i; });
      if (i === TOTAL) render();
      prog.textContent = i < TOTAL ? t.step.replace('{n}', i + 1).replace('{t}', TOTAL) : t.est;
      fill.style.width = Math.round((i + (i < TOTAL ? 0 : 1)) / TOTAL * 100) + '%';
      bb.hidden = i === 0; nx.hidden = i === TOTAL; bb.textContent = i === TOTAL ? t.again : t.back;
      navState();
      var f = steps[i].querySelector('.qz-q'); if (f && !first) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }
      first = false;
      clarity('quiz_step', i + 1);
    }
    bb.addEventListener('click', function () { go(cur === TOTAL ? 0 : cur - 1); });
    nx.addEventListener('click', function () { go(cur + 1); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (cur === TOTAL) send(); else go(cur + 1);
    });

    function summary(e) { // для менеджера — завжди українською
      var parts = ['Квіз: ' + U.obj[st.obj], U.svc[st.svc], st.area + ' м²', 'старт: ' + U.when[st.when]];
      parts.push('орієнтир: ' + (e.sum != null ? 'від $' + Math.round(e.sum) + (e.partial ? ' + кошторис' : '') : 'індивідуально'));
      return parts.join(' · ');
    }
    function fail(msg) { sb.disabled = false; sb.textContent = t.send; er.textContent = msg; }
    function send() {
      var raw = ph.value.trim(), n = normPhone(raw);
      if (!n) { er.textContent = raw ? t.bad : t.empty; ph.setAttribute('aria-invalid', 'true'); ph.focus(); return; }
      ph.removeAttribute('aria-invalid'); er.textContent = '';
      if (demo) { er.textContent = t.demo; return; }
      var f = d.getElementById('of'), oP = d.getElementById('oPhone');
      if (!f || !oP || typeof f.requestSubmit !== 'function') { fail(t.fail); return; }
      var oA = d.getElementById('oArea'), oM = d.getElementById('oMsg'), oE = d.getElementById('oErr');
      var keep = { form: f.dataset.form, service: f.dataset.service, area: oA ? oA.value : '', msg: oM ? oM.value : '', phone: oP.value };
      var e = estimate(st.obj, st.svc, st.area), done = false, mo;
      sb.disabled = true; sb.textContent = t.sending;
      function restore() {
        if (mo) mo.disconnect(); d.removeEventListener('cas:lead', onLead);
        f.dataset.form = keep.form || 'landing'; f.dataset.service = keep.service || '';
        if (oA) oA.value = keep.area; if (oM) oM.value = keep.msg; oP.value = keep.phone;
      }
      function onLead(ev) {
        if (done || !ev.detail || ev.detail.form !== 'quiz') return; done = true; restore();
        steps.forEach(function (s) { s.hidden = true; }); nav.hidden = true; head.hidden = true;
        ok.hidden = false; try { ok.focus({ preventScroll: true }); } catch (x) { ok.focus(); }
      }
      d.addEventListener('cas:lead', onLead);
      if (oE && window.MutationObserver) {
        oE.textContent = '';
        mo = new MutationObserver(function () { if (!done && oE.textContent.trim()) { done = true; restore(); oE.textContent = ''; fail(t.fail); } });
        mo.observe(oE, { childList: true, characterData: true, subtree: true });
      }
      oP.value = '+' + n;
      if (oA) oA.value = String(st.area);
      if (oM) oM.value = summary(e) + (keep.msg ? '\n' + keep.msg : '');
      f.dataset.form = 'quiz';
      f.dataset.service = U.svc[st.svc] + ' · ' + U.obj[st.obj] + (keep.service ? ' (' + keep.service + ')' : '');
      f.requestSubmit();
    }
    sb.addEventListener('click', send);
    syncSvc();
    go(0);
  }

  function css(root) {
    var href = root.dataset.css; if (!href || d.querySelector('link[data-qz]')) return;
    var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-qz', ''); d.head.appendChild(l);
  }
  function init() {
    var left = [].slice.call(d.querySelectorAll('[data-quiz]')); if (!left.length) return;
    var start = function (r) { css(r); build(r); };
    // ліниво: коли блок ближче ніж 600 px до екрана (IntersectionObserver + запасна перевірка на scroll/resize)
    var near = function (r) { var b = r.getBoundingClientRect(); return b.bottom > -600 && b.top < (window.innerHeight || 800) + 600; };
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) check(); });
    }, { rootMargin: '600px 0px' }) : null;
    function check() {
      left = left.filter(function (r) { if (r.dataset.ready) return false; if (near(r)) { if (io) io.unobserve(r); start(r); return false; } return true; });
      if (!left.length) { removeEventListener('scroll', check); removeEventListener('resize', check); }
    }
    if (io) left.forEach(function (r) { io.observe(r); });
    addEventListener('scroll', check, { passive: true }); addEventListener('resize', check, { passive: true });
    check();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
