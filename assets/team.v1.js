/* CAS Development — кабінет працівника /kabinet/team (генерує tools/shop/pages.py). Mobile-first: прораб з телефона на обʼєкті.
   API: GET /api/team/today (задачі, мої обʼєкти, заявки), POST /api/team/action (етап / фотозвіт / проблема),
   POST /api/team/upload (фото → /api/media/<id>), PATCH /api/admin/crm (стадія заявки — лише з правом leads.edit).
   Сервер сам фільтрує рядки й поля за роллю (functions/_roles.js) — тут лише показуємо те, що прийшло. */
(function () {
  'use strict';
  var root = document.getElementById('tm');
  if (!root) return;
  var A = window.CASAccount;
  var D = null, VIEW = 'today', ME = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var swap = function (fn) { if (document.startViewTransition && !reduced()) document.startViewTransition(fn); else fn(); };
  var fmt = function (n) { return new Intl.NumberFormat('uk-UA').format(Math.round(n || 0)); };
  var CUR = { USD: '$', EUR: '€', UAH: '₴' };
  var digits = function (p) { return String(p || '').replace(/\D/g, ''); };
  var dmy = function (s) { return s ? String(s).slice(0, 10).split('-').reverse().join('.') : ''; };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var SVG = {
    cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    ok: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17.5v.5"/>',
    phone: '<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/>',
    map: '<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
    today: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/>',
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
  };
  var ic = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + SVG[k] + '</svg>'; };

  var toastT;
  function toast(msg, err) {
    var t = $('#tm-toast'); if (!t) return;
    t.textContent = msg; t.className = 'tm-toast on' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'tm-toast'; }, err ? 6000 : 3000);
  }
  var api = function (p, o) { return A.api(p, o); };

  /* ---------- вхід і доступ ---------- */
  function boot() {
    A.me(true).then(function (c) {
      if (!c) {
        root.innerHTML = '<section class="tm-card tm-login"><h2>Вхід для команди CAS</h2><p class="muted">Увійдіть тим Telegram, поштою Google або номером, який ви дали власнику студії.</p><div id="tmLogin"></div></section>';
        A.login($('#tmLogin'), function () { boot(); });
        return;
      }
      if (!c.staff) {
        root.innerHTML = '<section class="tm-card"><h2>Цей кабінет — для працівників студії</h2><p class="muted">' +
          (c.staff_disabled ? 'Ваш доступ працівника вимкнено. Якщо це помилка — звʼяжіться з власником студії.' : 'Ви увійшли як клієнт.') +
          '</p><p><a class="tm-btn" href="/kabinet">Перейти в мій кабінет</a></p></section>';
        return;
      }
      ME = c.staff;
      load();
    });
  }

  function skeleton() {
    root.innerHTML = '<div class="tm-skel" aria-hidden="true"><i class="h"></i><i></i><i></i><i></i></div><p class="sr" role="status">Завантажуємо задачі…</p>';
  }
  function load(keepView) {
    if (!D) skeleton();
    root.setAttribute('aria-busy', 'true');
    return api('/api/team/today').then(function (d) {
      D = d; root.removeAttribute('aria-busy');
      if (!keepView) VIEW = (location.hash.slice(1) || 'today');
      render();
    }, function (e) {
      root.removeAttribute('aria-busy');
      root.innerHTML = '<section class="tm-card"><p class="err">' + esc(e.message) + '</p><button class="tm-btn" type="button" id="tmRetry">Спробувати ще</button></section>';
      $('#tmRetry').onclick = function () { load(); };
    });
  }

  /* ---------- каркас ---------- */
  function tabs() {
    var t = [['today', 'Сьогодні', 'today', D.tasks.length], ['objects', 'Обʼєкти', 'home', D.projects.length]];
    if (D.leads && (ME.perms.indexOf('leads.view_all') >= 0 || ME.perms.indexOf('leads.view_assigned') >= 0)) t.push(['leads', 'Заявки', 'list', D.leads.length]);
    if (ME.perms.indexOf('finance.view') >= 0) t.push(['money', 'Платежі', 'money', 0]);
    t.push(['more', 'Ще', 'more', 0]);
    return t;
  }
  function render() {
    var T = tabs();
    if (!T.some(function (t) { return t[0] === VIEW; })) VIEW = 'today';
    var hour = new Date().getHours(), hi = hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Добрий день' : 'Добрий вечір';
    var urgent = D.tasks.filter(function (t) { return t.urgent; }).length;
    root.innerHTML = '<header class="tm-hello"><div><p class="muted">' + new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>' +
      '<h2>' + hi + ', ' + esc(String(D.me.name || '').split(' ')[0]) + '</h2><p><span class="tm-role">' + esc(D.me.role_label) + '</span>' +
      (D.me.panel ? ' <a class="tm-link" href="/kabinet/admin">Панель CRM →</a>' : '') + '</p></div>' +
      '<div class="tm-chips"><span><b>' + D.tasks.length + '</b> задач' + (urgent ? ' · <em>' + urgent + ' термінових</em>' : '') + '</span><span><b>' + D.projects.length + '</b> обʼєкт(ів)</span></div></header>' +
      '<nav class="tm-nav" aria-label="Розділи кабінету працівника">' + T.map(function (t) {
        return '<a href="#' + t[0] + '" data-v="' + t[0] + '"' + (t[0] === VIEW ? ' aria-current="page"' : '') + '>' + ic(t[2]) + '<span>' + t[1] + '</span>' + (t[3] ? '<i>' + t[3] + '</i>' : '') + '</a>';
      }).join('') + '</nav><div id="tmView" class="tm-view"></div>';
    $$('.tm-nav a', root).forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); go(a.dataset.v); };
    });
    draw();
  }
  function go(v) {
    VIEW = v;
    try { history.replaceState(null, '', '#' + v); } catch (e) { /* noop */ }
    $$('.tm-nav a', root).forEach(function (a) { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    swap(draw);
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }
  function draw() {
    var v = $('#tmView');
    v.innerHTML = VIEW === 'objects' ? objects() : VIEW === 'leads' ? leads() : VIEW === 'money' ? money() : VIEW === 'more' ? more() : todayView();
    bind(v);
  }
  var proj = function (id) { return D.projects.find(function (p) { return p.id === id; }); };

  /* ---------- Сьогодні ---------- */
  var KIND = { report: ['cam', 'Фотозвіт'], stage: ['ok', 'Етап'], next: ['today', 'Наступний крок'], issue: ['warn', 'Проблема'], lead: ['list', 'Заявка'], contact: ['phone', 'Звʼязатися'], payment: ['money', 'Платіж'] };
  function todayView() {
    if (!D.tasks.length) return '<section class="tm-card tm-empty"><p class="big">🎉</p><h3>На сьогодні все</h3><p class="muted">Нових задач немає. Обʼєкти — у вкладці «Обʼєкти».</p></section>';
    return '<ul class="tm-tasks">' + D.tasks.map(function (t, i) {
      var k = KIND[t.kind] || ['today', ''], p = t.project_id ? proj(t.project_id) : null, o = t.order_id ? (D.leads || []).find(function (x) { return x.id === t.order_id; }) : null;
      var btn = '';
      if (t.kind === 'report' && can('reports.upload')) btn = '<button class="tm-btn" data-act="report" data-p="' + t.project_id + '">' + ic('cam') + 'Зробити фотозвіт</button>';
      else if (t.kind === 'stage' && can('projects.edit_stage')) btn = '<button class="tm-btn" data-act="stage" data-p="' + t.project_id + '" data-s="' + esc(t.stage_id) + '">' + ic('ok') + 'Етап виконано</button>';
      else if (t.kind === 'issue' || t.kind === 'next') btn = '<button class="tm-btn ghost" data-open="' + t.project_id + '">Відкрити обʼєкт</button>';
      else if ((t.kind === 'lead' || t.kind === 'contact') && o) btn = (o.phone ? '<a class="tm-btn" href="tel:+' + digits(o.phone) + '">' + ic('phone') + 'Подзвонити</a>' : '') +
        (t.kind === 'lead' && can('leads.edit') ? '<button class="tm-btn ghost" data-take="' + o.id + '">Взяв у роботу</button>' : '');
      return '<li class="tm-task' + (t.urgent ? ' urgent' : '') + '" style="--i:' + i + '"><span class="tm-ic">' + ic(k[0]) + '</span><div class="tm-tx"><small>' + esc(k[1]) + (t.due ? ' · ' + (t.due < today() ? 'прострочено з ' : '') + dmy(t.due) : '') + '</small>' +
        '<b>' + esc(t.title) + '</b>' + (t.sub ? '<span class="muted">' + esc(t.sub) + '</span>' : '') + (p && p.address ? '<span class="muted">' + ic('map') + esc(p.address) + '</span>' : '') + '<div class="tm-row">' + btn + '</div></div></li>';
    }).join('') + '</ul>';
  }
  var can = function (p) { return ME && ME.perms.indexOf(p) >= 0; };

  /* ---------- Обʼєкти ---------- */
  function objects() {
    if (!D.projects.length) return '<section class="tm-card tm-empty"><h3>Обʼєктів поки немає</h3><p class="muted">Коли власник або менеджер призначить вас на обʼєкт, він зʼявиться тут, а в Telegram прийде сповіщення.</p></section>';
    return D.projects.map(function (p) {
      var mapUrl = p.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.address) : '';
      return '<article class="tm-obj" id="obj-' + p.id + '"><header><div><h3>' + esc(p.title) + '</h3><p class="muted">' + esc(p.client_name || '') + (p.my_task ? ' · ваша задача: <b>' + esc(p.my_task) + '</b>' : '') + '</p></div>' +
        '<span class="tm-pct" style="--p:' + p.progress + '"><b>' + p.progress + '%</b></span></header>' +
        (p.current ? '<p class="tm-now">Зараз: <b>' + esc(p.current.name) + '</b> · ' + esc(p.current.status_label) + (p.current.end ? ' · до ' + dmy(p.current.end) : '') + '</p>' : '') +
        (p.next_step ? '<p class="tm-next">Наступний крок: <b>' + esc(p.next_step) + '</b>' + (p.next_date ? ' · ' + dmy(p.next_date) : '') + '</p>' : '') +
        '<div class="tm-contacts">' + (p.address ? '<a class="tm-btn ghost" href="' + esc(mapUrl) + '" target="_blank" rel="noopener">' + ic('map') + esc(p.address) + '</a>' : '') +
        (p.client_phone ? '<a class="tm-btn ghost" href="tel:+' + digits(p.client_phone) + '">' + ic('phone') + 'Клієнт: ' + esc(p.client_phone) + '</a>' : '') + '</div>' +
        '<div class="tm-actions">' + (can('reports.upload') ? '<button class="tm-btn" data-act="report" data-p="' + p.id + '">' + ic('cam') + 'Фотозвіт</button>' : '') +
        (can('projects.edit_stage') && p.stages.length ? '<button class="tm-btn" data-act="stage" data-p="' + p.id + '">' + ic('ok') + 'Етап виконано</button>' : '') +
        (can('issues.report') ? '<button class="tm-btn warn" data-act="issue" data-p="' + p.id + '">' + ic('warn') + 'Проблема</button>' : '') + '</div>' +
        (p.issues && p.issues.length ? '<div class="tm-issues">' + p.issues.map(function (i) { return '<p>⚠ ' + esc(i.note) + ' <small class="muted">' + esc(i.staff_name || '') + ' · ' + dmy(i.created_at) + '</small></p>'; }).join('') + '</div>' : '') +
        '<details class="tm-more"><summary>Етапи, команда, звіти</summary>' +
          '<ol class="tm-stages">' + p.stages.map(function (s) { return '<li class="st-' + s.status + '"><span>' + esc(s.name) + '</span><small>' + esc(s.status_label) + (s.end ? ' · ' + dmy(s.end) : '') + '</small><i style="--w:' + (+s.progress || 0) + '%"></i></li>'; }).join('') + '</ol>' +
          (p.lead ? '<p class="muted">Відповідальний: <b>' + esc(p.lead.name) + '</b> (' + esc(p.lead.role_label) + ')</p>' : '') +
          (p.team && p.team.length ? '<p class="muted">Команда: ' + p.team.map(function (t) { return esc(t.name) + ' — ' + esc(t.task || t.role_label); }).join('; ') + '</p>' : '') +
          (p.reports.length ? '<div class="tm-reps">' + p.reports.map(function (r) { return '<div><small>' + dmy(r.date) + ' · ' + esc(r.title || '') + '</small><div class="tm-ph">' + r.photos.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Фото з обʼєкта" width="88" height="66" loading="lazy"></a>'; }).join('') + '</div></div>'; }).join('') + '</div>' : '<p class="muted">Фотозвітів ще не було.</p>') +
        '</details></article>';
    }).join('');
  }

  /* ---------- Заявки (менеджер, дизайнер) ---------- */
  var LST = { new: 'Нова заявка', in_work: 'В роботі', quote_sent: 'Розрахунок', contract: 'Договір', project: 'Проєкт: етапи', handover: 'Здача', warranty: 'Гарантія', cancelled: 'Скасовано' };
  function leads() {
    if (!D.leads.length) return '<section class="tm-card tm-empty"><h3>Відкритих заявок немає</h3></section>';
    return '<ul class="tm-leads">' + D.leads.map(function (o) {
      var d = digits(o.phone);
      return '<li class="tm-lead" data-id="' + o.id + '"><div class="tm-lead-h"><b>' + esc(o.number) + '</b><small class="muted">' + dmy(o.created_at) + '</small></div>' +
        '<p><b>' + esc(o.name || 'Без імені') + '</b>' + (o.service ? ' · ' + esc(o.service) : '') + (o.city ? ' · ' + esc(o.city) : '') + '</p>' +
        (o.amount != null ? '<p class="muted">Сума: ' + fmt(o.amount) + ' ' + esc(CUR[o.currency] || o.currency || '') + '</p>' : '') +
        (o.comment ? '<p class="muted tm-cm">' + esc(String(o.comment).slice(0, 240)) + '</p>' : '') +
        '<div class="tm-row">' + (d.length >= 9 ? '<a class="tm-btn" href="tel:+' + d + '">' + ic('phone') + 'Подзвонити</a><a class="tm-btn ghost" href="https://t.me/+' + d + '" target="_blank" rel="noopener">Telegram</a>' : '') +
        (can('leads.edit') ? '<label class="tm-sel"><span class="sr">Стадія ' + esc(o.number) + '</span><select data-st="' + o.id + '">' + Object.keys(LST).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + LST[k] + '</option>'; }).join('') + '</select></label>' : '<span class="tm-role">' + esc(o.status_label) + '</span>') +
        '</div>' + (o.next_contact ? '<p class="' + (o.next_contact < today() ? 'err' : 'muted') + '">Наступний контакт: ' + dmy(o.next_contact) + '</p>' : '') + '</li>';
    }).join('') + '</ul>' + (D.me.panel ? '<p><a class="tm-btn ghost" href="/kabinet/admin#crm">Відкрити повний канбан CRM →</a></p>' : '');
  }

  /* ---------- Платежі (бухгалтер) ---------- */
  function money() {
    var rows = [];
    D.projects.forEach(function (p) { (p.payments || []).forEach(function (y) { rows.push(Object.assign({ project: p.title }, y)); }); });
    rows.sort(function (a, b) { return String(a.due_date || '9').localeCompare(String(b.due_date || '9')); });
    if (!rows.length) return '<section class="tm-card tm-empty"><h3>Неоплачених платежів немає</h3></section>';
    return '<ul class="tm-tasks">' + rows.map(function (y) {
      var late = y.due_date && y.due_date < today();
      return '<li class="tm-task' + (late ? ' urgent' : '') + '"><span class="tm-ic">' + ic('money') + '</span><div class="tm-tx"><small>' + (y.due_date ? (late ? 'прострочено · ' : 'до ') + dmy(y.due_date) : 'без дати') + '</small><b>' + esc(y.title) + ' — ' + fmt(y.amount) + ' ' + esc(CUR[y.currency] || y.currency) + '</b><span class="muted">' + esc(y.project) + '</span></div></li>';
    }).join('') + '</ul>';
  }

  /* ---------- Ще ---------- */
  function more() {
    var labels = D.me.perm_labels || {};
    return '<section class="tm-card"><h3>' + esc(D.me.name) + '</h3><p class="muted">Роль: ' + esc(D.me.role_label) + '</p>' +
      '<details><summary>Що мені доступно</summary><ul class="tm-perms">' + D.me.perms.map(function (p) { return '<li>' + esc(labels[p] || p) + '</li>'; }).join('') + '</ul></details>' +
      '<p class="muted">Сповіщення про призначені вам заявки й обʼєкти приходять у Telegram від бота сайту — натисніть у ньому «Start», якщо ще не зробили.</p>' +
      '<div class="tm-row"><button class="tm-btn ghost" type="button" data-out>Вийти</button><button class="tm-btn ghost" type="button" data-out-all>Вийти на всіх пристроях</button></div></section>';
  }

  /* ---------- дії ---------- */
  function bind(v) {
    $$('[data-act]', v).forEach(function (b) { b.onclick = function () { sheet(b.dataset.act, +b.dataset.p, b.dataset.s); }; });
    $$('[data-open]', v).forEach(function (b) { b.onclick = function () { go('objects'); setTimeout(function () { var el = $('#obj-' + b.dataset.open); if (el) { el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); el.classList.add('flash'); } }, 60); }; });
    $$('[data-take]', v).forEach(function (b) { b.onclick = function () { setLead(+b.dataset.take, 'in_work', b); }; });
    $$('[data-st]', v).forEach(function (s) { s.onchange = function () { setLead(+s.dataset.st, s.value, s); }; });
    var o = $('[data-out]', v); if (o) o.onclick = function () { A.logout().then(function () { location.href = '/kabinet'; }); };
    var oa = $('[data-out-all]', v); if (oa) oa.onclick = function () { if (confirm('Вийти з усіх пристроїв? Доведеться увійти заново.')) api('/api/auth/logout', { method: 'POST', body: { all: true } }).then(function () { location.href = '/kabinet'; }); };
  }
  // оптимістично: стадія змінюється одразу, при помилці — повертаємо як було
  function setLead(id, status, el) {
    var o = D.leads.find(function (x) { return x.id === id; }); if (!o) return;
    var prev = o.status; o.status = status; o.status_label = LST[status];
    if (status === 'in_work') D.tasks = D.tasks.filter(function (t) { return !(t.kind === 'lead' && t.order_id === id); });
    el.disabled = true;
    api('/api/admin/crm', { method: 'PATCH', body: { id: id, status: status } }).then(function () {
      toast(o.number + ': ' + LST[status]); el.disabled = false; if (VIEW === 'today') swap(draw);
    }, function (e) {
      o.status = prev; el.disabled = false; toast('Не збережено: ' + e.message, true); load(true);
    });
  }

  // ---------- нижня шторка для дій ----------
  function sheet(kind, pid, stageId) {
    var p = proj(pid); if (!p) return;
    var dlg = $('#tmSheet');
    var stOpt = '<option value="">— без етапу —</option>' + p.stages.map(function (s) { return '<option value="' + esc(s.id) + '"' + ((stageId ? s.id === stageId : p.current && s.id === p.current.id) ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
    var head = '<div class="tm-sh-h"><div><small class="muted">' + esc(p.title) + '</small><h3>' + (kind === 'report' ? 'Фотозвіт для клієнта' : kind === 'issue' ? 'Проблема на обʼєкті' : 'Етап виконано') + '</h3></div><button class="tm-x" type="button" data-close aria-label="Закрити">✕</button></div>';
    if (kind === 'stage') {
      dlg.innerHTML = head + '<p class="muted">Позначте етап, роботи на якому завершено. Власник і менеджер отримають сповіщення.</p><ul class="tm-pick">' + p.stages.map(function (s) {
        return '<li><button type="button" class="tm-btn ' + (s.status === 'done' ? 'ghost' : '') + '" data-done="' + esc(s.id) + '"' + (s.status === 'done' ? ' disabled' : '') + '>' + (s.status === 'done' ? '✓ ' : '') + esc(s.name) + '<small>' + esc(s.status_label) + '</small></button>' +
          (s.status !== 'done' && s.status !== 'review' ? '<button type="button" class="tm-btn ghost sm" data-review="' + esc(s.id) + '">На приймання</button>' : '') + '</li>';
      }).join('') + '</ul>';
    } else {
      dlg.innerHTML = head + '<form class="tm-form" novalidate>' +
        '<label class="tm-photo"><input type="file" accept="image/*" capture="environment" multiple data-file><span>' + ic('cam') + '<b>' + (kind === 'report' ? 'Зняти або вибрати фото' : 'Додати фото (необовʼязково)') + '</b><small>До 15 фото, стискаються автоматично</small></span></label>' +
        '<div class="tm-prev" data-prev></div>' +
        '<label class="tm-f"><span>Етап</span><select name="stage_id">' + stOpt + '</select></label>' +
        '<label class="tm-f"><span>' + (kind === 'report' ? 'Що зроблено (бачить клієнт)' : 'Що сталося') + '</span><textarea name="note" rows="3" ' + (kind === 'issue' ? 'required ' : '') + 'placeholder="' + (kind === 'report' ? 'Залили стяжку, завели електрику в кухні' : 'Протікає стояк у ванній, потрібен сантехнік') + '"></textarea></label>' +
        (kind === 'issue' ? '<p class="muted">Клієнт це не бачить — лише власник і менеджери (одразу в Telegram).</p>' : '') +
        '<p class="err" data-e role="alert"></p><button class="tm-btn big ' + (kind === 'issue' ? 'warn' : '') + '" type="submit">' + (kind === 'report' ? 'Надіслати фотозвіт' : 'Повідомити про проблему') + '</button></form>';
    }
    $('[data-close]', dlg).onclick = function () { close(dlg); };
    dlg.onclick = function (e) { if (e.target === dlg) close(dlg); };
    if (!dlg.open) dlg.showModal();
    if (kind === 'stage') {
      var mark = function (sid, status, btn) {
        var s = p.stages.find(function (x) { return x.id === sid; }), prev = { status: s.status, status_label: s.status_label, progress: s.progress };
        s.status = status; s.status_label = status === 'done' ? 'Виконано' : 'Приймання'; s.progress = status === 'done' ? 100 : Math.max(90, s.progress || 0);
        btn.disabled = true; close(dlg); swap(draw);
        api('/api/team/action', { method: 'POST', body: { type: 'stage', project_id: pid, stage_id: sid, status: status } }).then(function () {
          toast('«' + s.name + '» — ' + s.status_label.toLowerCase() + '. Власник отримав сповіщення.'); load(true);
        }, function (e) { Object.assign(s, prev); swap(draw); toast('Не збережено: ' + e.message, true); });
      };
      $$('[data-done]', dlg).forEach(function (b) { b.onclick = function () { mark(b.dataset.done, 'done', b); }; });
      $$('[data-review]', dlg).forEach(function (b) { b.onclick = function () { mark(b.dataset.review, 'review', b); }; });
      return;
    }
    var files = [], f = $('form', dlg), prevBox = $('[data-prev]', dlg);
    $('[data-file]', dlg).onchange = function () {
      Array.prototype.slice.call(this.files || []).slice(0, 15 - files.length).forEach(function (file) {
        var item = { file: file, url: null, state: 'wait' }; files.push(item);
        item.preview = URL.createObjectURL(file);
      });
      this.value = '';
      drawPrev();
    };
    function drawPrev() {
      prevBox.innerHTML = files.map(function (it, i) { return '<figure class="' + it.state + '"><img src="' + esc(it.preview) + '" alt="Фото ' + (i + 1) + '" width="84" height="84"><button type="button" data-rm="' + i + '" aria-label="Прибрати фото">✕</button>' + (it.state === 'up' ? '<i class="spin" aria-hidden="true"></i>' : it.state === 'err' ? '<em>!</em>' : '') + '</figure>'; }).join('');
      $$('[data-rm]', prevBox).forEach(function (b) { b.onclick = function () { files.splice(+b.dataset.rm, 1); drawPrev(); }; });
    }
    f.onsubmit = function (e) {
      e.preventDefault();
      var note = f.note.value.trim(), err = $('[data-e]', dlg);
      if (kind === 'issue' && !note) { err.textContent = 'Опишіть проблему'; f.note.focus(); return; }
      if (kind === 'report' && !note && !files.length) { err.textContent = 'Додайте фото або опис'; return; }
      err.textContent = '';
      var btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = files.length ? 'Завантажуємо фото…' : 'Надсилаємо…';
      // фото по черзі (на мобільному інтернеті надійніше): стиснення → /api/team/upload; невдалі можна повторити
      var chain = Promise.resolve();
      files.forEach(function (it) {
        if (it.url) return;
        chain = chain.then(function () {
          it.state = 'up'; drawPrev();
          return compress(it.file).then(function (c) { return api('/api/team/upload', { method: 'POST', body: { project_id: pid, mime: c.mime, data: c.b64 } }); })
            .then(function (r) { it.url = r.url; it.state = 'done'; drawPrev(); }, function (e2) { it.state = 'err'; drawPrev(); throw e2; });
        });
      });
      chain.then(function () {
        return api('/api/team/action', { method: 'POST', body: { type: kind, project_id: pid, stage_id: f.stage_id.value || null, note: note, photos: files.map(function (x) { return x.url; }) } });
      }).then(function () {
        close(dlg); toast(kind === 'report' ? 'Фотозвіт надіслано — клієнт побачить його в кабінеті' : 'Проблему передано власнику й менеджеру'); load(true);
      }, function (e3) {
        btn.disabled = false; btn.textContent = 'Спробувати ще раз'; err.textContent = 'Не вдалося: ' + e3.message + (files.some(function (x) { return x.state === 'err'; }) ? ' (фото з «!» не завантажились — натисніть ще раз)' : '');
      });
    };
  }
  function close(dlg) {
    if (reduced() || !dlg.animate) { dlg.close(); return; }
    var a = dlg.animate([{ transform: 'none' }, { transform: 'translateY(30px)', opacity: 0 }], { duration: 160, easing: 'ease-in' });
    a.onfinish = function () { dlg.close(); };
  }
  // фото → до 1600 px, WebP (Safari не кодує WebP — тоді JPEG), ≤ 1,5 МБ
  function compress(file) {
    var load = window.createImageBitmap ? createImageBitmap(file).catch(img) : img();
    function img() { return new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { no(new Error('Не вдалося прочитати фото')); }; i.src = URL.createObjectURL(file); }); }
    return load.then(function (bm) {
      var tryQ = function (q, max) {
        var k = Math.min(1, max / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
        c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
        c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
        return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, 'image/webp', q); }).then(function (b) {
          if (b && b.type === 'image/webp') return b;
          return new Promise(function (ok) { c.toBlob(function (b2) { ok(b2); }, 'image/jpeg', q); });
        }).then(function (b) { return b.size > 1.45 * 1024 * 1024 && max > 900 ? tryQ(q - 0.1, max - 400) : b; });
      };
      return tryQ(0.82, 1600);
    }).then(function (b) {
      return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok({ mime: b.type, b64: String(r.result).split(',')[1] }); }; r.onerror = no; r.readAsDataURL(b); });
    });
  }

  addEventListener('hashchange', function () { var v = location.hash.slice(1); if (D && v && v !== VIEW) go(v); });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
})();
