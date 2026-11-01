/* CAS Development — майстер-панель власника в /kabinet/admin: «Студія» (дашборд усієї студії), «Персонал» (працівники й ролі),
   «Аудит» (хто що змінив) і картка клієнта з усією історією. API: /api/admin/studio, /api/admin/staff, /api/admin/audit,
   /api/admin/clients?id=. Права перевіряє сервер (functions/_roles.js); вкладки без права cms.v1.js не показує.
   Підключається перед cms.v1.js: реєструє вкладки через window.CASStudio. */
(function () {
  'use strict';
  var K = function () { return window.CASAdminKit; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var fmt = function (n) { return new Intl.NumberFormat('uk-UA').format(Math.round(n || 0)); };
  var CUR = { USD: '$', EUR: '€', UAH: '₴' };
  var sums = function (o) { var k = Object.keys(o || {}).filter(function (c) { return o[c]; }); return k.length ? k.map(function (c) { return fmt(o[c]) + ' ' + (CUR[c] || c); }).join(' · ') : '—'; };
  var when = function (s) { var d = new Date(String(s || '').replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(s) || /^\d{4}-\d\d-\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? esc(s || '') : d.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
  var skel = function (n, cls) { return '<div class="st-skel ' + (cls || '') + '" aria-hidden="true">' + '<i></i>'.repeat(n || 6) + '</div><p class="sr">Завантаження…</p>'; };
  function goCrm(preset) { try { sessionStorage.setItem('crmPreset', JSON.stringify(preset)); } catch (e) { /* noop */ } location.hash = 'crm'; }
  // плавна поява чисел у KPI (без анімації за «менше руху»)
  function countUp(root) {
    $$('[data-count]', root).forEach(function (el) {
      var to = +el.dataset.count || 0;
      if (K().reduced() || to < 2) { el.textContent = fmt(to); return; }
      var t0 = performance.now();
      (function step(t) { var k = Math.min(1, (t - t0) / 600); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
    });
  }

  // ===================== Студія =====================
  function studio(L) {
    L.innerHTML = '<div class="st-head"><h2>Уся студія сьогодні</h2><button class="btn ghost sm" type="button" data-r>Оновити</button></div>' + skel(8, 'kpi') + skel(6);
    $('[data-r]', L).onclick = function () { studio(L); };
    return K().api('/api/admin/studio').then(function (d) {
      var maxF = Math.max.apply(null, d.funnel.map(function (f) { return f.n; }).concat([1]));
      var maxO = Math.max.apply(null, d.ozdoba.map(function (f) { return f.n; }).concat([1]));
      var fin = d.finance.projects || {}, curs = Object.keys(fin);
      var od = d.overdue, odN = od.contacts.length + od.sla.length + od.payments.length + od.stages.length + od.issues.length;
      var maxW = Math.max.apply(null, d.workload.map(function (w) { return w.open_leads + w.projects; }).concat([1]));
      var bar = function (f, max, board) {
        return '<button type="button" class="fn-row" data-go="' + board + ':' + f.key + '"><span class="fn-l">' + esc(f.label) + '</span><span class="fn-b"><i style="--w:' + Math.max(f.n ? 4 : 0, Math.round(f.n * 100 / max)) + '%"></i></span><b>' + f.n + '</b><small>' + sums(f.sum) + '</small></button>';
      };
      L.innerHTML = '<div class="st-head"><h2>Уся студія · ' + esc(d.today.split('-').reverse().join('.')) + '</h2><button class="btn ghost sm" type="button" data-r>Оновити</button></div>' +
        '<div class="kpis">' +
          '<div class="kpi"><small>Відкриті заявки</small><b data-count="' + d.totals.open_leads + '">0</b></div>' +
          '<div class="kpi"><small>Обʼєкти в роботі</small><b data-count="' + d.totals.active_projects + '">0</b></div>' +
          '<div class="kpi' + (odN ? ' warn' : '') + '"><small>Прострочки</small><b data-count="' + odN + '">0</b></div>' +
          '<div class="kpi' + (d.totals.issues ? ' warn' : '') + '"><small>Проблеми на обʼєктах</small><b data-count="' + d.totals.issues + '">0</b></div>' +
          '<div class="kpi"><small>Команда</small><b data-count="' + d.totals.staff + '">0</b></div>' +
          '<div class="kpi"><small>Оздоба: оплачено за 30 днів</small><b>' + fmt(d.finance.ozdoba_paid_30d) + ' ₴</b></div>' +
        '</div>' +
        '<div class="st-grid">' +
          '<section class="st-card s2"><h3>Воронка студії <small>заявка → розрахунок → договір → проєкт → здача → гарантія</small></h3><div class="fn">' + d.funnel.map(function (f) { return bar(f, maxF, 'lead'); }).join('') + '</div></section>' +
          '<section class="st-card"><h3>Замовлення Оздоби</h3><div class="fn sm">' + d.ozdoba.map(function (f) { return bar(f, maxO, 'order'); }).join('') + '</div></section>' +
          '<section class="st-card"><h3>Фінанси обʼєктів</h3>' + (curs.length ? '<table class="adm fin"><tr><th></th><th>Договори</th><th>Сплачено</th><th>До оплати</th><th>Борг</th></tr>' + curs.map(function (c) {
            var f = fin[c]; return '<tr><th>' + c + '</th><td>' + fmt(f.contract) + '</td><td class="ok">' + fmt(f.paid) + '</td><td>' + fmt(f.due) + '</td><td class="' + (f.overdue ? 'err' : '') + '">' + fmt(f.overdue) + '</td></tr>';
          }).join('') + '</table>' : '<p class="muted">Ще немає договорів і платежів. Суму договору й графік платежів задають у картці обʼєкта.</p>') + '</section>' +
          '<section class="st-card s2"><h3>Навантаження команди</h3>' + (d.workload.length ? '<div class="wl">' + d.workload.map(function (w) {
            var t = w.open_leads + w.projects;
            return '<div class="wl-row"><span><b>' + esc(w.name) + '</b><small>' + esc(w.role_label) + '</small></span><span class="fn-b"><i style="--w:' + Math.round(t * 100 / maxW) + '%"></i></span>' +
              '<span class="wl-n"><span title="Відкриті заявки">📋 ' + w.open_leads + '</span><span title="Обʼєкти в роботі">🏗 ' + w.projects + '</span>' + (w.late ? '<span class="err" title="Прострочені контакти">⏰ ' + w.late + '</span>' : '') + (w.issues ? '<span class="err" title="Відкриті проблеми">⚠ ' + w.issues + '</span>' : '') + '</span></div>';
          }).join('') + '</div>' : '<p class="muted">Додайте працівників у вкладці «Персонал».</p>') + '</section>' +
          '<section class="st-card"><h3>Прострочки й ризики</h3>' + (odN ? '<ul class="od">' +
            od.sla.map(function (o) { return '<li class="err"><button type="button" class="lnk" data-go="lead:new">' + esc(o.number) + '</button> нова заявка без реакції · ' + when(o.created_at) + '</li>'; }).join('') +
            od.contacts.map(function (o) { return '<li>⏰ ' + esc(o.number) + ' · ' + esc(o.name || '') + ' — контакт був ' + esc(o.next_contact) + (o.assignee ? ' · ' + esc(o.assignee) : '') + '</li>'; }).join('') +
            od.payments.map(function (y) { return '<li class="err">💸 ' + esc(y.project || '') + ': «' + esc(y.title) + '» ' + fmt(y.amount) + ' ' + esc(CUR[y.currency] || y.currency) + ' — до ' + esc(y.due_date) + '</li>'; }).join('') +
            od.stages.map(function (s) { return '<li>🧱 ' + esc(s.project) + ': етап «' + esc(s.stage) + '» — дедлайн ' + esc(s.end) + '</li>'; }).join('') +
            od.issues.map(function (i) { return '<li class="err">⚠ ' + esc(i.project_title) + ': ' + esc(String(i.note).slice(0, 90)) + ' <small>(' + esc(i.staff_name || '') + ')</small></li>'; }).join('') +
          '</ul>' : '<p class="ok">Прострочок немає 👌</p>') + '</section>' +
          '<section class="st-card s3"><h3>Обʼєкти в роботі</h3>' + (d.projects.length ? '<div class="pj">' + d.projects.map(function (p) {
            return '<div class="pj-row"><span><b>' + esc(p.title) + '</b><small>' + esc(p.client_name || '') + (p.stage ? ' · зараз: ' + esc(p.stage) : '') + '</small></span><span class="pj-bar" role="img" aria-label="Прогрес ' + p.progress + '%"><i style="--w:' + p.progress + '%"></i></span><b>' + p.progress + '%</b><small>' + esc(p.next_step || '') + (p.next_date ? ' · ' + esc(p.next_date) : '') + '</small></div>';
          }).join('') + '</div>' : '<p class="muted">Активних обʼєктів немає.</p>') + '</section>' +
        '</div>';
      $('[data-r]', L).onclick = function () { studio(L); };
      $$('[data-go]', L).forEach(function (b) { b.onclick = function () { var x = b.dataset.go.split(':'); goCrm({ board: x[0], status: x[1], view: 'kanban', kind: '' }); }; });
      countUp(L);
    });
  }

  // ===================== Персонал =====================
  function staff(L) {
    L.innerHTML = skel(5);
    return K().api('/api/admin/staff').then(function (d) {
      var R = d.roles, roleOpt = function (v) { return d.assignable.map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(R[k].label) + '</option>'; }).join(''); };
      var PL = d.perms;
      L.innerHTML = '<div class="st-head"><h2>Персонал і доступ</h2></div>' +
        '<details class="st-card add"' + (d.staff.length < 2 ? ' open' : '') + '><summary><b>+ Додати працівника</b></summary>' +
        '<form class="form two" data-add novalidate><label class="f"><span>Імʼя</span><input name="name" required placeholder="Олег Петренко" autocomplete="off"></label>' +
        '<label class="f"><span>Роль</span><select name="role">' + roleOpt('foreman') + '</select></label>' +
        '<label class="f"><span>Telegram id <small>(цифри; бот @userinfobot)</small></span><input name="tg" inputmode="numeric" placeholder="123456789"></label>' +
        '<label class="f"><span>або пошта Google</span><input name="email" type="email" inputmode="email" placeholder="name@gmail.com"></label>' +
        '<label class="f"><span>або телефон</span><input name="phone" type="tel" inputmode="tel" placeholder="+380 97 123 45 67"></label>' +
        '<label class="f"><span>Примітка</span><input name="note" placeholder="Бригада №2, меблі"></label>' +
        '<p class="full muted">Працівник входить на сайті тим самим Telegram, Google або номером (через бота) — і одразу потрапляє у свій кабінет <b>/kabinet/team</b>. Права — за роллю (таблиця нижче).</p>' +
        '<div class="full row"><button class="btn" type="submit">Додати</button><span class="err" data-e role="alert"></span></div></form></details>' +
        '<div class="tscroll"><table class="adm staff-t"><thead><tr><th>Працівник</th><th>Роль</th><th>Вхід</th><th>Навантаження</th><th>Доступ</th></tr></thead><tbody>' + d.staff.map(function (s) {
          var owner = s.role === 'owner', ro = owner || s.me;
          return '<tr data-id="' + s.id + '" class="' + (s.active ? '' : 'off') + '"><td><b>' + esc(s.name) + '</b>' + (s.me ? ' <span class="pill on">це ви</span>' : '') + '<br><small>' +
            [s.tg_id ? 'TG ' + esc(s.tg_id) : '', esc(s.email || ''), esc(s.phone || '')].filter(Boolean).join(' · ') + (s.note ? '<br>' + esc(s.note) : '') + '</small></td>' +
            '<td>' + (ro ? '<span class="pill on">' + esc(s.role_label) + '</span>' : '<select data-role aria-label="Роль ' + esc(s.name) + '">' + roleOpt(s.role) + '</select>') + '</td>' +
            '<td><small>' + (s.linked ? 'акаунт: ' + esc(s.account_name || '') + (s.last_login ? '<br>вхід ' + when(s.last_login) : '') : 'чекає першого входу') + '</small></td>' +
            '<td><small>📋 ' + (s.open_leads || 0) + ' · 🏗 ' + (s.active_projects || 0) + (s.open_issues ? ' · <span class="err">⚠ ' + s.open_issues + '</span>' : '') + '</small></td>' +
            '<td>' + (ro ? '<small class="muted">' + (owner ? 'власник (змінна OWNER_TG_ID)' : '') + '</small>' :
              '<span class="row"><button type="button" class="btn ' + (s.active ? 'danger' : '') + ' sm" data-act>' + (s.active ? 'Вимкнути' : 'Увімкнути') + '</button>' +
              (s.linked && s.active ? '<button type="button" class="btn ghost sm" data-out title="Анулювати всі сесії">Вийти скрізь</button>' : '') + '</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<h3 style="margin-top:28px">Ролі й права</h3><p class="muted">Сервер перевіряє права на кожному запиті: працівник бачить лише призначені йому заявки й обʼєкти; суми — лише з правом «Суми, платежі, борги».</p>' +
        '<div class="tscroll"><table class="adm perm-t"><thead><tr><th>Право</th>' + Object.keys(R).map(function (k) { return '<th>' + esc(R[k].label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        Object.keys(PL).map(function (p) { return '<tr><td>' + esc(PL[p]) + '<br><small><code>' + esc(p) + '</code></small></td>' + Object.keys(R).map(function (k) { return '<td class="c">' + (R[k].perms.indexOf(p) >= 0 ? '<span class="yes" aria-label="так">●</span>' : '<span class="no" aria-label="ні">·</span>') + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>';
      var f = $('[data-add]', L);
      f.onsubmit = function (e) {
        e.preventDefault();
        var b = {}; new FormData(f).forEach(function (v, k) { b[k] = String(v).trim(); });
        var err = !b.name ? 'Вкажіть імʼя' : !b.tg && !b.email && !b.phone ? 'Вкажіть Telegram id, пошту або телефон' : b.tg && !/^\d{1,20}$/.test(b.tg) ? 'Telegram id — лише цифри' : '';
        if (err) { $('[data-e]', f).textContent = err; return; }
        var btn = $('button[type=submit]', f); btn.disabled = true;
        K().api('/api/admin/staff', { method: 'POST', body: b }).then(function (r) { K().toast(r.linked ? 'Додано — акаунт уже є, доступ діє з наступного входу' : 'Додано — працівник отримає доступ при першому вході'); staff(L); },
          function (er) { btn.disabled = false; $('[data-e]', f).textContent = er.message; });
      };
      var patch = function (id, body, msg) { return K().api('/api/admin/staff', { method: 'PATCH', body: Object.assign({ id: id }, body) }).then(function () { K().toast(msg); staff(L); }, function (e) { K().toast(e.message, true); staff(L); }); };
      $$('tr[data-id]', L).forEach(function (tr) {
        var id = +tr.dataset.id, name = $('b', tr).textContent;
        var r = $('[data-role]', tr); if (r) r.onchange = function () { if (confirm('Змінити роль «' + name + '» на «' + r.options[r.selectedIndex].text + '»? Сесії працівника буде завершено.')) patch(id, { role: r.value }, 'Роль змінено'); else staff(L); };
        var a = $('[data-act]', tr); if (a) a.onclick = function () {
          var on = tr.classList.contains('off');
          if (!on && !confirm('Вимкнути доступ «' + name + '»? Діє миттєво на всіх пристроях; заявки й обʼєкти лишаються за ним, доки не перепризначите.')) return;
          patch(id, { active: on }, on ? 'Доступ увімкнено' : 'Доступ вимкнено');
        };
        var o = $('[data-out]', tr); if (o) o.onclick = function () { if (confirm('Завершити всі сесії «' + name + '»?')) patch(id, { logout: true }, 'Сесії завершено'); };
      });
    });
  }

  // ===================== Аудит =====================
  var ACT = {
    'lead.create': 'Нова заявка', 'lead.update': 'Зміна заявки', 'order.update': 'Зміна замовлення', 'crm.export': 'Експорт CSV',
    'project.create': 'Новий обʼєкт', 'project.update': 'Зміна обʼєкта', 'project.assign': 'Команда обʼєкта', 'project.stage': 'Етап', 'project.delete': 'Видалення обʼєкта',
    'report.create': 'Фотозвіт', 'report.update': 'Зміна звіту', 'report.delete': 'Видалення звіту', 'issue.create': 'Проблема на обʼєкті', 'issue.resolved': 'Проблему вирішено', 'issue.open': 'Проблему відкрито',
    'payment.create': 'Платіж', 'payment.update': 'Зміна платежу', 'payment.delete': 'Видалення платежу', 'document.create': 'Документ', 'document.delete': 'Видалення документа',
    'staff.create': 'Новий працівник', 'staff.update': 'Зміна працівника', 'staff.role': 'Зміна ролі', 'staff.deactivate': 'Доступ вимкнено', 'staff.activate': 'Доступ увімкнено', 'staff.logout': 'Сесії завершено',
    'partner.create': 'Код партнера', 'partner.update': 'Зміна коду', 'partner.link': 'Код → клієнт', 'cms.save': 'Зміна сайту', 'cms.revert': 'Відкат сайту',
  };
  var short = function (v) { if (v == null) return ''; var s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 60 ? s.slice(0, 59) + '…' : s; };
  function changes(r) {
    var b = r.before && typeof r.before === 'object' ? r.before : {}, a = r.after && typeof r.after === 'object' ? r.after : {};
    var keys = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); })).slice(0, 8);
    return keys.map(function (k) { return '<span class="chg"><code>' + esc(k) + '</code> ' + (k in b ? '<del>' + esc(short(b[k])) + '</del> → ' : '') + '<ins>' + esc(short(a[k])) + '</ins></span>'; }).join('');
  }
  function audit(L) {
    var S = { staff: '', action: '' }, next = null, rows = [];
    L.innerHTML = '<div class="st-head"><h2>Аудит: хто, що, коли</h2></div><div class="tb"><select data-s aria-label="Працівник"><option value="">Усі люди</option></select>' +
      '<select data-a aria-label="Дія"><option value="">Усі дії</option><option value="lead">Заявки</option><option value="order">Замовлення</option><option value="project">Обʼєкти</option><option value="report">Фотозвіти</option><option value="issue">Проблеми</option><option value="payment">Платежі</option><option value="staff">Персонал</option><option value="cms">Сайт</option><option value="partner">Коди партнерів</option></select></div>' +
      '<div data-l>' + skel(6) + '</div><button class="btn ghost" type="button" data-more hidden>Показати ще</button>';
    K().api('/api/admin/staff').then(function (d) { var s = $('[data-s]', L); d.staff.forEach(function (x) { s.add(new Option(x.name + ' · ' + x.role_label, x.id)); }); }, function () { /* noop */ });
    function load(more) {
      var q = '/api/admin/audit?staff=' + S.staff + '&action=' + S.action + (more && next ? '&before=' + next : '');
      return K().api(q).then(function (d) {
        rows = more ? rows.concat(d.rows) : d.rows; next = d.next;
        $('[data-more]', L).hidden = !next;
        $('[data-l]', L).innerHTML = rows.length ? '<ol class="aud">' + rows.map(function (r) {
          return '<li><time>' + when(r.at) + '</time><span class="who"><b>' + esc(r.actor || 'система') + '</b><small>' + esc(r.role || '') + '</small></span><span class="what"><b>' + esc(ACT[r.action] || r.action) + '</b>' +
            (r.entity ? ' <small>' + esc(r.entity) + (r.entity_id ? ' #' + esc(r.entity_id) : '') + '</small>' : '') + '<span class="chgs">' + changes(r) + '</span></span></li>';
        }).join('') + '</ol>' : '<p class="muted">Записів немає.</p>';
      });
    }
    $('[data-s]', L).onchange = function () { S.staff = this.value; load(); };
    $('[data-a]', L).onchange = function () { S.action = this.value; load(); };
    $('[data-more]', L).onclick = function () { load(true); };
    return load();
  }

  // ===================== Картка клієнта =====================
  function clientCard(id) {
    var dlg = document.getElementById('clientCard');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'clientCard'; dlg.className = 'cc'; dlg.setAttribute('aria-label', 'Картка клієнта'); document.body.appendChild(dlg); }
    dlg.innerHTML = '<div class="cc-h"><h2>Клієнт</h2><button class="x" type="button" aria-label="Закрити">✕</button></div>' + skel(6);
    $('.x', dlg).onclick = function () { dlg.close(); };
    dlg.onclick = function (e) { if (e.target === dlg) dlg.close(); };
    if (!dlg.open) dlg.showModal();
    K().api('/api/admin/clients?id=' + id).then(function (d) {
      var c = d.client, ev = [];
      d.orders.forEach(function (o) { ev.push({ at: o.created_at, t: (o.kind === 'lead' ? '📋 Заявка ' : '🛒 Замовлення ') + o.number, s: [o.service, o.status_label, o.amount != null ? fmt(o.amount) + ' ' + (CUR[o.currency] || '') : o.total != null ? fmt(o.total) + ' ₴' : ''].filter(Boolean).join(' · ') }); });
      d.events.forEach(function (e) { ev.push({ at: e.created_at, t: '↳ ' + e.label, s: [e.note, e.author].filter(Boolean).join(' · '), minor: true }); });
      d.projects.forEach(function (p) { ev.push({ at: p.created_at, t: '🏗 Обʼєкт «' + p.title + '»', s: (p.stages || []).map(function (s) { return s.name + ' ' + (s.progress || 0) + '%'; }).join(' · ') }); });
      (d.documents || []).forEach(function (x) { ev.push({ at: x.created_at, t: '📄 ' + x.title, s: x.kind, url: x.url }); });
      (d.issues || []).forEach(function (i) { ev.push({ at: i.created_at, t: '⚠ Проблема на обʼєкті', s: i.note + (i.status === 'resolved' ? ' (вирішено)' : '') }); });
      (d.audit || []).forEach(function (a) { ev.push({ at: a.at, t: '🛡 ' + (ACT[a.action] || a.action), s: (a.actor || '') + ' ' + short(a.after), minor: true }); });
      ev.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      var pays = [].concat.apply([], d.projects.map(function (p) { return (p.payments || []).map(function (y) { return Object.assign({ project: p.title }, y); }); }));
      dlg.innerHTML = '<div class="cc-h"><h2>' + esc(c.name || 'Клієнт #' + c.id) + '</h2><button class="x" type="button" aria-label="Закрити">✕</button></div>' +
        '<p class="muted">' + [c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '', c.email ? esc(c.email) : '', c.username ? '@' + esc(c.username) : '', esc(c.city || ''), esc(c.company || ''), 'з ' + esc(String(c.created_at).slice(0, 10))].filter(Boolean).join(' · ') + '</p>' +
        '<div class="kpis sm"><div class="kpi"><small>Заявки й замовлення</small><b>' + d.orders.length + '</b></div><div class="kpi"><small>Обʼєкти</small><b>' + d.projects.length + '</b></div>' +
        (pays.length ? '<div class="kpi"><small>Сплачено / до оплати</small><b>' + sums(pays.filter(function (y) { return y.status === 'paid'; }).reduce(function (m, y) { m[y.currency] = (m[y.currency] || 0) + (y.amount || 0); return m; }, {})) + '</b><small>' + sums(pays.filter(function (y) { return y.status !== 'paid'; }).reduce(function (m, y) { m[y.currency] = (m[y.currency] || 0) + (y.amount || 0); return m; }, {})) + '</small></div>' : '') + '</div>' +
        '<h3>Історія</h3><ol class="tl">' + (ev.map(function (e) { return '<li class="' + (e.minor ? 'minor' : '') + '"><time>' + when(e.at) + '</time><b>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.t) + '</a>' : esc(e.t)) + '</b>' + (e.s ? '<small>' + esc(e.s) + '</small>' : '') + '</li>'; }).join('') || '<li>Подій немає</li>') + '</ol>';
      $('.x', dlg).onclick = function () { dlg.close(); };
    }, function (e) { dlg.innerHTML = '<div class="cc-h"><h2>Клієнт</h2><button class="x" type="button" aria-label="Закрити">✕</button></div><p class="err">' + esc(e.message) + '</p>'; $('.x', dlg).onclick = function () { dlg.close(); }; });
  }

  window.CASStudio = {
    tabs: [
      { key: 'studio', label: 'Студія', perms: ['dashboard.studio'], render: studio },
      { key: 'team', label: 'Персонал', perms: ['staff.manage'], render: staff },
      { key: 'audit', label: 'Аудит', perms: ['audit.view'], render: audit },
    ],
    clientCard: clientCard,
  };
})();
