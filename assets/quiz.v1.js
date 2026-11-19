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
  /*qz:core*/var CORE = "/assets/quiz-core.v1.js?v=3509c149"; /*/qz:core*/
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
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
