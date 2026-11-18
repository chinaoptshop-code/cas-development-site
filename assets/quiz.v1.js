/* CAS Development — квіз-калькулятор «4 кроки → телефон» (UI-kit /styleguide/#quiz; розмітку-заготовку ставить tools/site/quiz.py).
   Заготовка: <div class="qz" data-quiz data-obj="kv" data-svc="rem" data-css="/assets/quiz.v1.css?v=…"></div>.
   Ліниво: CSS і кроки будуються, коли блок наближається до екрана (IntersectionObserver).
   Ліниво (18.11.2026): цей файл — лише завантажувач (~2 КБ): на DOMContentLoaded ставить секцію з заголовком і заготовкою .qz (висота — резерв
   у site-chrome.v1.css), а ядро /assets/quiz-core.v1.js (кроки, ставки, надсилання) і /assets/quiz.v1.css — коли блок ближче ~1.5 екрана; кроки — після обох.
   Орієнтир «від» — лише за ставками з CLAUDE.md (rates-блок нижче, tools/site/rates.py), перемикач «Україна / Європа» як у калькуляторі
   (Михайло 17.11.2026): типово uk/ru — Україна, інші мови — Європа (data-reg="0|1" на заготовці — примусово). Україна: дизайн $30/м²
   (мін. $2 500), ремонт $550/м², офіс $350/м², меблювання $250/м², будівництво $600/м², під ключ $1 100/м²; Європа: дизайн $45/м²
   (мін. $4 000), ремонт $850/м², меблювання $400/м², будівництво $900/м², під ключ $1 700/м², офіс — за кошторисом.
   Комерційний ремонт — індивідуально (окремої ставки немає). Регіон іде в заявку (data-service і #oMsg).
   Надсилання — ЛИШЕ через спільну форму form#of і /assets/lead-form.v1.js (одна заявка на сторінку): квіз кладе телефон у #oPhone,
   площу в #oArea, відповіді — у #oMsg (українською, для менеджера), data-form="quiz", і викликає form.requestSubmit().
   Успіх — лише після події cas:lead (lead-form шле її після 2xx), помилку дзеркалимо з #oErr. Clarity: quiz_step; lead_submit — lead-form.
   data-demo — режим для /styleguide/: нічого не надсилає. */
(function () {
  var d = document, lang = (d.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var H = {
    uk: ['Порахуйте орієнтовну вартість', '4 питання — і ви побачите орієнтир «від» за ставками студії.'],
    ru: ['Рассчитайте ориентировочную стоимость', '4 вопроса — и вы увидите ориентир «от» по ставкам студии.'],
    en: ['Get a quick cost estimate', 'Four questions and you will see a “from” figure at the studio’s rates.'],
    es: ['Calcule un presupuesto orientativo', 'Cuatro preguntas y verá una cifra «desde» según las tarifas del estudio.'],
    zh: ['估算参考费用', '回答 4 个问题，即可看到按工作室单价计算的“起价”。'],
    pl: ['Oblicz orientacyjny koszt', 'Cztery pytania i zobaczysz kwotę „od” według stawek studia.'],
    de: ['Richtpreis berechnen', 'Vier Fragen, und Sie sehen einen „ab“-Wert nach den Sätzen des Studios.'],
    fr: ['Estimez le coût indicatif', 'Quatre questions et vous verrez un montant « à partir de » selon les tarifs du studio.'],
    pt: ['Calcule um orçamento indicativo', 'Quatro perguntas e verá um valor «a partir de» segundo as tarifas do estúdio.'],
    ar: ['احسب التكلفة التقديرية', 'أربعة أسئلة وسترى مبلغًا «يبدأ من» وفق أسعار الاستوديو.']
  };
  var t = H[lang] || H.uk;
  /*qz:core*/var CORE = "/assets/quiz-core.v1.js?v=43bd1aee"; /*/qz:core*/
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
<<<<<<< HEAD

  var uid = 0;
  function build(root) {
    if (root.dataset.ready) return; root.dataset.ready = '1';
    var id = 'qz' + (++uid), demo = root.hasAttribute('data-demo');
    var st = { obj: OBJ.indexOf(root.dataset.obj) >= 0 ? root.dataset.obj : '', svc: SVC.indexOf(root.dataset.svc) >= 0 ? root.dataset.svc : '',
      area: 0, when: '', reg: root.dataset.reg === '0' || root.dataset.reg === '1' ? +root.dataset.reg : DEF_REG };
    var TOTAL = 4, cur = 0, first = true, areaSet = false;
    root.textContent = '';
    var head = el('div', 'qz-hd'), prog = el('p', 'qz-pg'), bar = el('div', 'qz-bar'), fill = el('i');
    prog.id = id + 'pg'; prog.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-hidden', 'true'); bar.appendChild(fill);
    // регіон «Україна / Європа» — на виду на всіх кроках (як у калькуляторі); нативні радіо: стрілки, Tab, підпис групи
    var rgw = el('div', 'qz-rg'), rgl = el('span', 'qz-rl', t.reg); rgl.id = id + 'rl';
    rgw.setAttribute('role', 'radiogroup'); rgw.setAttribute('aria-labelledby', rgl.id);
    [0, 1].forEach(function (r) {
      var lb = el('label', 'qz-ro'), inp = el('input'); inp.type = 'radio'; inp.name = id + 'r'; inp.value = String(r); inp.checked = st.reg === r;
      inp.addEventListener('change', function () { if (!inp.checked) return; st.reg = r; root.dataset.region = r ? 'eu' : 'ua'; if (cur === TOTAL) render(); clarity('quiz_region', r ? 'eu' : 'ua'); });
      lb.appendChild(inp); lb.appendChild(el('span', '', t.rg[r])); rgw.appendChild(lb);
    });
    root.dataset.region = st.reg ? 'eu' : 'ua';
    var hr = el('div', 'qz-hr'), rgb = el('div', 'qz-rb'); rgb.appendChild(rgl); rgb.appendChild(rgw);
    hr.appendChild(prog); hr.appendChild(rgb); head.appendChild(hr); head.appendChild(bar); root.appendChild(head);
    var steps = [], body = el('div', 'qz-bd'); root.appendChild(body);

    function radios(i, name, keys, labels, key) {
      var fs = el('fieldset', 'qz-st'), lg = el('legend', 'qz-q', t.q[i]); lg.tabIndex = -1; fs.appendChild(lg);
      var grid = el('div', 'qz-os');
      keys.forEach(function (k) {
        var lb = el('label', 'qz-o'), inp = el('input'); inp.type = 'radio'; inp.name = id + name; inp.value = k;
        if (st[key] === k) inp.checked = true;
        inp.addEventListener('change', function () { st[key] = k; if (key === 'obj') syncSvc(); navState(); });
        // мишею/дотиком — одразу далі; клавіатурою (стрілки) — лише вибір, далі кнопкою
        // Safari: клік, який мітка передає в радіо, має detail 0 (Chrome — 1) — тож ловимо сам клік по мітці/радіо (detail > 0), один раз
        var tm = 0;
        lb.addEventListener('click', function (e) { if (e.detail > 0 && !tm) tm = setTimeout(function () { tm = 0; if (inp.checked) go(i + 1); }, 160); });
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
    nb.type = 'text'; nb.inputMode = 'decimal'; nb.autocomplete = 'off'; nb.setAttribute('pattern', '[0-9 .,]*'); nb.id = id + 'a'; nl.htmlFor = nb.id;
    function setArea(v, from) {
      v = casParseNum(v); v = isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v))) : 0; st.area = v; if (from) areaSet = true;
      if (from !== rg) rg.value = Math.min(1000, Math.max(10, v));
      var pv = casParseNum(nb.value); if (from !== nb || pv > 20000 || pv < 0) nb.value = v;
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
      var e = estimate(st.obj, st.svc, st.area, st.reg);
      rh.textContent = t.est + ': ' + (e.sum != null ? t.from + ' ' + money(e.sum) + (window.casFx ? window.casFx(e.sum, lang) : '') : t.ind); // ≈ €/₴ — fx.py
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
      prog.textContent = t.step.replace('{n}', Math.min(i + 1, TOTAL)).replace('{t}', TOTAL);
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
      var parts = ['Квіз: ' + U.obj[st.obj], U.svc[st.svc], st.area + ' м²', 'регіон: ' + U.rg[st.reg], 'старт: ' + U.when[st.when]];
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
      var keep = { form: f.dataset.form, service: f.dataset.service, source: f.dataset.source, area: oA ? oA.value : '', msg: oM ? oM.value : '', phone: oP.value };
      var e = estimate(st.obj, st.svc, st.area, st.reg), done = false, mo;
      sb.disabled = true; sb.textContent = t.sending;
      function restore() {
        if (mo) mo.disconnect(); d.removeEventListener('cas:lead', onLead);
        f.dataset.form = keep.form || 'landing'; f.dataset.service = keep.service || ''; if (keep.source != null) f.dataset.source = keep.source;
        if (oA) oA.value = keep.area; if (oM) oM.value = keep.msg; oP.value = keep.phone;
      }
      function onLead(ev) {
        if (done || !ev.detail || ev.detail.form !== 'quiz') return; done = true; restore();
        steps.forEach(function (s) { s.hidden = true; }); nav.hidden = true; head.hidden = true; root.classList.add('qz-done');
        if (window.casLeadAfter) window.casLeadAfter(ok); // години відповіді + Telegram (lead-form.v1.js)
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
      f.dataset.form = 'quiz'; f.dataset.source = (keep.source || location.host + location.pathname).replace(/#.*$/, '') + '#quiz';
      f.dataset.service = U.svc[st.svc] + ' · ' + U.obj[st.obj] + ' · ' + U.rg[st.reg] + (keep.service ? ' (' + keep.service + ')' : '');
      f.requestSubmit();
    }
    sb.addEventListener('click', send);
    syncSvc();
    go(0);
  }

=======
>>>>>>> origin/main
  var me = d.currentScript, CSS = me && me.src ? me.src.replace(/quiz\.v1\.js(\?v=(\w+))?.*$/, 'quiz.v1.css') : '';
  /* <script src="/assets/quiz.v1.js" data-quiz-obj="kv" data-quiz-svc="rem" defer> (tools/site/quiz.py) — секція квізу перед самим тегом:
     заголовок і заготовку будує JS (бюджет HTML лендингу 64 КБ), кроки — ліниво. */
  function mount() {
    if (!me || !me.hasAttribute('data-quiz-obj') || !me.parentNode) return;
    var sec = el('section', 'qz-s'), w = el('div', 'w qz-w'), h = el('h2', 'qz-h', t[0]), box = el('div', 'qz');
    sec.id = 'kalkulyator'; h.id = 'qzH'; sec.setAttribute('aria-labelledby', 'qzH');
    box.setAttribute('data-quiz', ''); box.dataset.obj = me.getAttribute('data-quiz-obj'); box.dataset.svc = me.getAttribute('data-quiz-svc') || ''; if (me.getAttribute('data-css')) box.dataset.css = me.getAttribute('data-css');
    w.appendChild(h); w.appendChild(el('p', 'qz-lead', t[1])); w.appendChild(box); sec.appendChild(w);
    me.parentNode.insertBefore(sec, me);
  }
  /* кроки будуємо лише після quiz.v1.css (CLS: без стилів кроки вищі за резерв .qz 360 px у site-chrome.v1.css і стрибають) */
  function css(root, done) {
    var href = root.dataset.css || CSS, l = d.querySelector('link[data-qz]');
    if (!href) return done();
    if (l) { if (l.sheet || l.dataset.ok) done(); else { l.addEventListener('load', done); l.addEventListener('error', done); } return; }
    l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-qz', '');
    var fin = function () { l.dataset.ok = '1'; done(); }; l.onload = fin; l.onerror = fin; d.head.appendChild(l);
  }
  var cq = null; // ядро (/assets/quiz-core.v1.js) — один раз на сторінку
  function core(done) {
    if (window.casQuiz) return done();
    if (!cq) { cq = []; var j = d.createElement('script'); j.src = CORE; j.async = true; j.onload = j.onerror = function () { var q = cq; cq = []; q.forEach(function (f) { f(); }); }; d.head.appendChild(j); }
    cq.push(done);
  }
  function init() {
    mount();
    var left = [].slice.call(d.querySelectorAll('[data-quiz]')); if (!left.length) return;
    // CSS і ядро — паралельно; кроки — коли є обидва (ядро не завантажилось — лишається заготовка з резервом висоти)
    var start = function (r) {
      if (r.dataset.qzw) return; r.dataset.qzw = '1';
      var k = 2, fin = function () { if (--k === 0 && window.casQuiz) window.casQuiz(r); };
      css(r, fin); core(fin);
    };
    // ліниво: коли блок ближче ~1.5 екрана (не менше 600 px; IntersectionObserver + запасна перевірка на scroll/resize)
    var near = function (r) { var b = r.getBoundingClientRect(), m = Math.max(600, (window.innerHeight || 800) * 1.5); return b.bottom > -m && b.top < (window.innerHeight || 800) + m; };
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) check(); });
    }, { rootMargin: '150% 0px' }) : null;
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
