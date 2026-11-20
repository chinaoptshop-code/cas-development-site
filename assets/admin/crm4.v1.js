/* CAS Development — CRM v4 (20.11.2026) у /kabinet/admin: вкладка «Задачі», блок «Задачі» в картках заявки / обʼєкта / контакту
   і режим «Таблиця» в «Контактах» (сортування, правка клітинки, масові дії, імпорт і експорт CSV).
   API: /api/admin/tasks (functions/_tasks.js), /api/admin/partners. Права перевіряє сервер; тут лише показ.
   Підключається перед cms.v1.js і реєструється через window.CASCrm4 (як studio.v1.js — через window.CASStudio).
   Увесь текст із бази (назви задач, примітки, клітинки контактів) вставляється лише через esc() — tools/tests/xss.mjs. */
(function () {
  'use strict';
  var K = function () { return window.CASAdminKit; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var api = function (p, o) { return K().api(p, o); };
  var toast = function (m, e) { K().toast(m, e); };
  var debounce = function (fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms || 300); }; };
  var LS = { get: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* noop */ } } };
  var kyivDay = function (n) { return new Date(Date.now() + (n || 0) * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }); };
  var plus = function (date, n) { return new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); };
  var dm = function (s) { return s ? String(s).slice(8, 10) + '.' + String(s).slice(5, 7) : ''; };
  var wd = function (s) { return new Date(s + 'T12:00:00Z').toLocaleDateString('uk-UA', { weekday: 'short', timeZone: 'UTC' }); };
  var TAPI = '/api/admin/tasks', PAPI = '/api/admin/partners';
  var nrm = function (v) { return v == null ? '' : String(v).trim(); };

  // ===================== задачі: спільний список (вкладка і блоки в картках) =====================
  function dueChip(t, today) {
    if (!t.due_date) return '';
    var tm = t.due_time ? ' ' + esc(t.due_time) : '', txt;
    if (t.status !== 'open') txt = dm(t.due_date) + tm;
    else if (t.overdue) txt = (t.due_date === today ? 'сьогодні' + tm + ' — прострочено' : 'прострочено з ' + dm(t.due_date));
    else if (t.due_date === today) txt = 'сьогодні' + tm;
    else if (t.due_date === plus(today, 1)) txt = 'завтра' + tm;
    else txt = wd(t.due_date) + ' ' + dm(t.due_date) + tm;
    return '<span class="tk-due' + (t.overdue ? ' err' : '') + '">' + txt + '</span>';
  }
  function linkChips(t, hide) {
    var o = '';
    if (t.project && hide !== 'project') o += '<button type="button" class="pill tk-ln" data-pj="' + t.project.id + '" title="Відкрити обʼєкт">' + esc(t.project.title) + (t.project.stage_name ? ' · ' + esc(t.project.stage_name) : '') + '</button>';
    else if (t.project && t.project.stage_name) o += '<span class="pill">етап «' + esc(t.project.stage_name) + '»</span>';
    if (t.order && hide !== 'order') o += '<span class="pill">Заявка ' + esc(t.order.number) + (t.order.name ? ' · ' + esc(t.order.name) : '') + '</span>';
    if (t.contact && hide !== 'contact') o += '<span class="pill">' + esc(t.contact.name || t.contact.company || 'Контакт') + '</span>';
    return o;
  }
  function rowHtml(t, o) {
    var done = t.status !== 'open', key = esc(t.key);
    return '<li class="tk-row' + (t.overdue ? ' late' : '') + (done ? ' done' : '') + (t.priority === 'high' ? ' high' : '') + '" data-key="' + key + '" data-src="' + (t.src === 'p' ? 'p' : 't') + '">' +
      (o.pick ? '<label class="tk-chk"><input type="checkbox" class="sel" data-sel="' + key + '"' + (o.sel[t.key] ? ' checked' : '') + ' aria-label="Вибрати задачу: ' + esc(t.title) + '"></label>'
        : '<label class="tk-chk"><input type="checkbox" class="tk-cb" data-done="' + key + '"' + (t.status === 'done' ? ' checked' : '') + (t.can.done && t.status !== 'cancelled' ? '' : ' disabled') + ' aria-label="Виконано: ' + esc(t.title) + '"></label>') +
      '<div class="tk-main"><button type="button" class="tk-title" data-edit="' + key + '"' + (t.can.edit ? ' title="Редагувати"' : ' disabled') + '>' + (t.priority === 'high' ? '<span class="tk-hi">важлива</span> ' : '') + '<span data-tt>' + esc(t.title) + '</span></button>' +
      '<div class="tk-meta">' + dueChip(t, o.today) + (o.manage ? '<span class="tk-who">' + (t.assignee_name ? esc(t.assignee_name) : 'без виконавця') + '</span>' : '') + linkChips(t, o.hide) +
      (t.src === 'p' ? '<span class="pill">задача етапу</span>' : '') + (t.status === 'cancelled' ? '<span class="pill warn">скасовано</span>' : '') +
      (t.status === 'done' ? '<span class="tk-who">виконано' + (t.done_by_name ? ': ' + esc(t.done_by_name) : '') + (t.done_at ? ' · ' + dm(t.done_at) : '') + '</span>' : '') + '</div>' +
      (t.note ? '<p class="tk-note">' + esc(t.note) + '</p>' : '') + (t.done_note ? '<p class="tk-note">Коментар: ' + esc(t.done_note) + '</p>' : '') + '</div></li>';
  }
  var GROUPS = [['late', 'Прострочені'], ['today', 'Сьогодні'], ['tomorrow', 'Завтра'], ['week', 'Цього тижня'], ['later', 'Пізніше'], ['none', 'Без строку'], ['closed', 'Виконані й скасовані']];
  function groupOf(t, today) {
    if (t.status !== 'open') return 'closed';
    if (t.overdue) return 'late';
    if (!t.due_date) return 'none';
    return t.due_date <= today ? 'today' : t.due_date === plus(today, 1) ? 'tomorrow' : t.due_date <= plus(today, 6) ? 'week' : 'later';
  }
  function listHtml(rows, o) {
    if (!rows.length) return '<p class="muted tk-empty">' + esc(o.empty || 'Задач немає.') + '</p>';
    if (!o.group) return '<ul class="tk-list">' + rows.map(function (t) { return rowHtml(t, o); }).join('') + '</ul>';
    return GROUPS.map(function (g) {
      var part = rows.filter(function (t) { return groupOf(t, o.today) === g[0]; });
      return part.length ? '<section class="tk-g' + (g[0] === 'late' ? ' late' : '') + '"><h3>' + g[1] + ' <small>' + part.length + '</small></h3><ul class="tk-list">' + part.map(function (t) { return rowHtml(t, o); }).join('') + '</ul></section>' : '';
    }).join('');
  }
  var staffOpts = function (staff, v, none) { return '<option value="">' + (none || '— без виконавця —') + '</option>' + (staff || []).map(function (s) { return '<option value="' + s.id + '"' + (String(s.id) === String(v) ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join(''); };
  var idOf = function (t) { return t.src === 'p' ? t.key : t.id; };

  // сповіщення «Виконано» з кнопкою «Скасувати» (6 с)
  function undoToast(msg, undo) {
    var t = document.createElement('div');
    t.className = 'adm-toast tk-undo'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(msg) + '</span> <button type="button" class="btn sm ghost" data-undo>Скасувати</button>';
    document.body.appendChild(t);
    var tm = setTimeout(function () { t.remove(); }, 6000);
    $('[data-undo]', t).onclick = function () { clearTimeout(tm); t.remove(); undo(); };
  }

  // Привʼязка задачі: заявка / обʼєкт (+ етап) / контакт — пошук у довідниках (лише для тих, хто створює задачі)
  var PROJ = null;
  var projects = function () { return PROJ ? Promise.resolve(PROJ) : api('/api/admin/projects').then(function (d) { PROJ = (d.projects || []).map(function (p) { return { id: p.id, title: p.title, stages: (p.stages || []).filter(function (s) { return s.id; }).map(function (s) { return { id: s.id, name: s.name }; }) }; }); return PROJ; }); };
  function linkPicker(el, cur, onChange) {
    var L = { order_id: cur.order_id || null, project_id: cur.project_id || null, stage_id: cur.stage_id || null, contact_id: cur.contact_id || null };
    var label = { order: cur.order ? 'Заявка ' + cur.order.number + (cur.order.name ? ' · ' + cur.order.name : '') : '', project: cur.project ? cur.project.title : '', contact: cur.contact ? (cur.contact.name || cur.contact.company) : '' };
    var stages = [];
    function draw() {
      var chips = [['order', 'order_id'], ['project', 'project_id'], ['contact', 'contact_id']].filter(function (x) { return L[x[1]]; }).map(function (x) {
        return '<span class="pill on">' + esc(label[x[0]] || '#' + L[x[1]]) + ' <button type="button" class="lnk" data-lx="' + x[1] + '" aria-label="Прибрати привʼязку">✕</button></span>';
      }).join(' ');
      el.innerHTML = '<div class="row tk-lp">' + chips +
        (L.project_id && stages.length ? '<select data-lst aria-label="Етап обʼєкта"><option value="">— без етапу —</option>' + stages.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === L.stage_id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' : '') +
        '<select data-lt aria-label="Привʼязати до"><option value="">Привʼязати до…</option><option value="order">заявки</option><option value="project">обʼєкта</option><option value="contact">контакту</option></select>' +
        '<input type="search" data-lq placeholder="Пошук: назва, імʼя, номер" aria-label="Пошук для привʼязки" hidden></div><div class="ct-res" data-lr></div>';
      $$('[data-lx]', el).forEach(function (b) { b.onclick = function () { L[b.dataset.lx] = null; if (b.dataset.lx === 'project_id') { L.stage_id = null; stages = []; } onChange(L); draw(); }; });
      var st = $('[data-lst]', el); if (st) st.onchange = function () { L.stage_id = st.value || null; onChange(L); };
      var lt = $('[data-lt]', el), lq = $('[data-lq]', el), lr = $('[data-lr]', el);
      lt.onchange = function () { lq.hidden = !lt.value; lr.innerHTML = ''; if (lt.value) { lq.value = ''; lq.focus(); find(); } };
      var pickOne = function (kind, id, text, sts) {
        L[kind + '_id'] = id; label[kind] = text;
        if (kind === 'project') { stages = sts || []; L.stage_id = null; }
        onChange(L); draw();
      };
      var find = debounce(function () {
        var kind = lt.value, v = lq.value.trim(); if (!kind) return;
        var show = function (items) {
          lr.innerHTML = items.length ? items.slice(0, 8).map(function (x, i) { return '<button type="button" class="pill" data-li="' + i + '">' + esc(x.text) + '</button>'; }).join(' ') : '<span class="muted">Не знайдено</span>';
          $$('[data-li]', lr).forEach(function (b) { b.onclick = function () { var x = items[+b.dataset.li]; pickOne(kind, x.id, x.text, x.stages); }; });
        };
        var fail = function (e) { lr.textContent = e.message; };
        if (kind === 'project') projects().then(function (P) { var q = v.toLowerCase(); show(P.filter(function (p) { return !q || String(p.title || '').toLowerCase().indexOf(q) >= 0; }).map(function (p) { return { id: p.id, text: p.title, stages: p.stages }; })); }, fail);
        else if (v.length < 2) lr.innerHTML = '<span class="muted">Введіть щонайменше 2 символи</span>';
        else if (kind === 'order') api('/api/admin/crm?limit=8&q=' + encodeURIComponent(v)).then(function (d) { show((d.rows || []).map(function (r) { return { id: r.id, text: 'Заявка ' + r.number + (r.name ? ' · ' + r.name : '') }; })); }, fail);
        else api(PAPI + '?find=' + encodeURIComponent(v)).then(function (d) { show((d.rows || []).map(function (r) { return { id: r.id, text: r.name || r.company || 'Контакт #' + r.id }; })); }, fail);
      }, 300);
      lq.oninput = find;
      lq.onkeydown = function (e) { if (e.key === 'Enter') e.preventDefault(); };
    }
    if (L.project_id) projects().then(function (P) { var p = P.find(function (x) { return x.id === L.project_id; }); stages = p ? p.stages : []; draw(); }, function () { draw(); });
    draw();
    return { value: function () { return L; } };
  }

  /* Контролер списку задач. o: {el, query(offset) → рядок запиту, group, hide ('order'|'project'|'contact' — не показувати цю привʼязку),
     only ('t' — без задач етапів), pickable, empty, onData(d), onChange()}. Повертає {load, rows, setPick, selected} */
  function taskList(o) {
    var el = o.el, D = null, rows = [], sel = {}, pick = false, editing = null;
    var ctx = function () { return { today: D ? D.today : kyivDay(), manage: !!(D && D.can.manage), pick: pick, sel: sel, group: o.group, hide: o.hide, empty: o.empty }; };
    function draw() {
      el.innerHTML = listHtml(rows, ctx()) + (D && D.more ? '<p><button type="button" class="btn ghost tk-more" data-more>Показати ще</button></p>' : '');
      bind();
      if (o.onDraw) o.onDraw();
    }
    function load(keep) {
      return api(TAPI + '?' + o.query(0)).then(function (d) {
        D = d; rows = o.only ? d.rows.filter(function (t) { return t.src === o.only; }) : d.rows;
        if (!keep) { sel = {}; }
        editing = null; draw(); if (o.onData) o.onData(d);
      }, function (e) { el.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    var find = function (key) { return rows.filter(function (t) { return t.key === key; })[0]; };
    var changed = function () { badge(); if (o.onChange) o.onChange(); };
    function toggle(t, done, cb) {
      api(TAPI, { method: 'PATCH', body: { id: idOf(t), done: done } }).then(function () {
        changed(); load(true);
        if (done) undoToast('Задачу виконано', function () { api(TAPI, { method: 'PATCH', body: { id: idOf(t), done: false } }).then(function () { toast('Повернуто в роботу'); changed(); load(true); }, function (e) { toast(e.message, true); }); });
        else toast('Задачу повернуто в роботу');
      }, function (e) { if (cb) cb.checked = !done; toast(e.message, true); });
    }
    function bind() {
      $$('[data-done]', el).forEach(function (c) { c.onchange = function () { var t = find(c.dataset.done); if (!t) return; c.disabled = true; c.closest('.tk-row').classList.toggle('done', c.checked); toggle(t, c.checked, c); }; });
      $$('[data-sel]', el).forEach(function (c) { c.onchange = function () { if (c.checked) sel[c.dataset.sel] = 1; else delete sel[c.dataset.sel]; if (o.onSelect) o.onSelect(Object.keys(sel)); }; });
      $$('[data-edit]', el).forEach(function (b) { b.onclick = function () { var t = find(b.dataset.edit); if (t && t.can.edit && !pick) edit(t); }; });
      $$('[data-pj]', el).forEach(function (b) { b.onclick = function () { try { sessionStorage.setItem('pjOpen', b.dataset.pj); } catch (e) { /* noop */ } var dl = b.closest('dialog'); if (dl && dl.open) dl.close(); if (location.hash === '#projects') location.reload(); else location.hash = '#projects'; }; });
      var m = $('[data-more]', el);
      if (m) m.onclick = function () {
        m.disabled = true;
        api(TAPI + '?' + o.query(rows.length)).then(function (d) { rows = rows.concat(o.only ? d.rows.filter(function (t) { return t.src === o.only; }) : d.rows); D.more = d.more; draw(); }, function (e) { m.disabled = false; toast(e.message, true); });
      };
    }
    // правка на місці: рядок розгортається у форму; збереження — з версією (409 → діалог, як у картках заявки й контакту)
    var LBL = { title: 'Задача', note: 'Примітка', due_date: 'Строк', due_time: 'Час', assignee_staff_id: 'Виконавець', priority: 'Важливість' };
    function edit(t, carry) {
      var li = $('[data-key="' + t.key + '"]', el); if (!li) return;
      if (editing && editing !== t.key) draw(), li = $('[data-key="' + t.key + '"]', el);
      editing = t.key;
      var stage = t.src === 'p', closed = t.status !== 'open', link = null;
      li.classList.add('editing');
      li.innerHTML = '<div class="tk-edit" data-ef>' + (carry && carry.notes.length ? '<div class="note cf-note" role="status"><b>Ці поля змінив хтось інший — лишили свіже значення:</b><ul>' + carry.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<input data-k="title" maxlength="' + (stage ? 160 : 200) + '" value="' + esc(t.title) + '" aria-label="Задача">' +
        (stage ? '' : '<textarea data-k="note" rows="2" maxlength="2000" placeholder="Примітка (необовʼязково)" aria-label="Примітка">' + esc(t.note || '') + '</textarea>') +
        '<div class="row"><label class="tk-f"><span>Строк</span><input type="date" data-k="due_date" value="' + esc(t.due_date || '') + '"></label>' +
        (stage ? '' : '<label class="tk-f"><span>Час</span><input type="time" data-k="due_time" value="' + esc(t.due_time || '') + '"></label>') +
        '<label class="tk-f"><span>Виконавець</span><select data-k="assignee_staff_id">' + staffOpts(D.staff, t.assignee_staff_id) + '</select></label>' +
        (stage ? '' : '<label class="tk-hi-l"><input type="checkbox" data-k="priority"' + (t.priority === 'high' ? ' checked' : '') + '> Важлива</label>') + '</div>' +
        (stage ? '<p class="muted">Задача етапу обʼєкта — етап і видалення в картці обʼєкта.</p>' : '<div data-lk></div>') +
        '<div class="row tk-act"><button type="button" class="btn" data-save>Зберегти</button><button type="button" class="btn ghost" data-close>Закрити</button>' +
        (stage ? '' : closed ? '<button type="button" class="btn ghost" data-reopen>Повернути в роботу</button><button type="button" class="btn danger" data-del>Видалити назавжди</button>' : '<button type="button" class="btn danger" data-cancel>Скасувати задачу</button>') +
        '<span class="err" data-m role="alert"></span></div></div>';
      var F = $('[data-ef]', li), f = function (k) { return $('[data-k="' + k + '"]', F); };
      if (!stage) link = linkPicker($('[data-lk]', F), t, function () { /* читаємо при збереженні */ });
      if (carry) Object.keys(carry.values).forEach(function (k) { var x = f(k); if (!x) return; if (k === 'priority') x.checked = carry.values[k] === 'high'; else x.value = carry.values[k] == null ? '' : carry.values[k]; });
      var read = function () {
        var b = { title: f('title').value.trim(), due_date: f('due_date').value || null, assignee_staff_id: f('assignee_staff_id').value ? +f('assignee_staff_id').value : null };
        if (!stage) { b.note = f('note').value.trim() || null; b.due_time = b.due_date ? f('due_time').value || null : null; b.priority = f('priority').checked ? 'high' : 'normal'; var l = link.value(); ['order_id', 'project_id', 'stage_id', 'contact_id'].forEach(function (k) { b[k] = l[k] || null; }); }
        Object.keys(b).forEach(function (k) { if (nrm(b[k]) === nrm(t[k])) delete b[k]; }); // лише змінене
        return b;
      };
      var patch = function (body, okMsg) {
        return api(TAPI, { method: 'PATCH', body: Object.assign({ id: idOf(t) }, t.ver ? { ver: t.ver } : {}, body) }).then(function () { toast(okMsg || 'Збережено'); changed(); return load(true); }, function (er) {
          if (!(K().isConflict(er) && er.data.task)) { $('[data-m]', F).textContent = er.message; return; }
          return K().conflictDialog(er.message, er.data.last, 'задачу').then(function (v) {
            if (v === 'cancel') return;
            var fresh = er.data.task, i = rows.indexOf(t);
            if (i >= 0) rows[i] = fresh;
            if (v === 'reload') { draw(); edit(fresh); return; }
            var apply = {}, notes = [];
            Object.keys(body).forEach(function (k) {
              if (nrm(fresh[k]) === nrm(body[k])) return;
              if (nrm(fresh[k]) === nrm(t[k])) apply[k] = body[k]; else notes.push((LBL[k] || k) + ': зараз «' + nrm(fresh[k]) + '», ваше значення «' + nrm(body[k]) + '» не перенесено');
            });
            if (notes.length || !Object.keys(apply).length) { draw(); if (notes.length) edit(fresh, { values: apply, notes: notes }); else toast('Дані оновлено — ваші зміни вже були збережені'); return; }
            return api(TAPI, { method: 'PATCH', body: Object.assign({ id: fresh.id, ver: fresh.ver }, apply) }).then(function () { toast('Збережено — ваші зміни додано до свіжих даних'); changed(); return load(true); }, function (e2) { toast(e2.message, true); draw(); });
          });
        });
      };
      $('[data-save]', F).onclick = function () {
        var b = read();
        if ('title' in b && !b.title) { $('[data-m]', F).textContent = 'Вкажіть, що треба зробити'; return; }
        if (!Object.keys(b).length) { editing = null; draw(); return; }
        patch(b);
      };
      $('[data-close]', F).onclick = function () { editing = null; draw(); };
      F.onkeydown = function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search' && e.target.type !== 'checkbox') { e.preventDefault(); $('[data-save]', F).click(); } };
      var c = $('[data-cancel]', F); if (c) c.onclick = function () { if (confirm('Скасувати задачу «' + t.title + '»? Вона зникне з відкритих (лишиться серед виконаних і скасованих).')) patch({ status: 'cancelled' }, 'Задачу скасовано'); };
      var r = $('[data-reopen]', F); if (r) r.onclick = function () { patch({ status: 'open' }, 'Повернуто в роботу'); };
      var x = $('[data-del]', F); if (x) x.onclick = function () { if (confirm('Видалити задачу назавжди?')) api(TAPI + '?id=' + t.id, { method: 'DELETE' }).then(function () { toast('Видалено'); changed(); load(true); }, function (e) { $('[data-m]', F).textContent = e.message; }); };
      f('title').focus();
    }
    return { load: load, data: function () { return D; }, rows: function () { return rows; }, selected: function () { return Object.keys(sel); }, clear: function () { sel = {}; draw(); },
      setPick: function (v) { pick = !!v; sel = {}; draw(); }, picking: function () { return pick; },
      selectAll: function () { rows.forEach(function (t) { if (t.can.edit) sel[t.key] = 1; }); draw(); } };
  }

  // швидке додавання: назва + Enter; дата, виконавець, «важлива», привʼязка — за бажанням. fixed — привʼязка картки (order_id / project_id / contact_id)
  function quickAdd(el, o) {
    var link = null, extra = {};
    el.innerHTML = '<div class="tk-add" data-qa><input data-qt maxlength="200" placeholder="' + esc(o.placeholder || 'Нова задача — напишіть і натисніть Enter') + '" aria-label="Нова задача" enterkeyhint="done">' +
      '<button type="button" class="btn ghost sm tk-optb" data-qo aria-expanded="false">Строк, виконавець</button><span class="tk-opt">' +
      '<input type="date" data-qd aria-label="Строк">' +
      '<span class="row nc-q tk-days" role="group" aria-label="Швидко: строк">' + [[0, 'Сьогодні'], [1, 'Завтра'], [7, '+тиждень']].map(function (x) { return '<button type="button" class="pill" data-qn="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</span>' +
      '<select data-qs aria-label="Виконавець">' + staffOpts(o.staff, o.me) + '</select>' +
      (o.stages && o.stages.length ? '<select data-qst aria-label="Етап"><option value="">— без етапу —</option>' + o.stages.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select>' : '') +
      '<label class="tk-hi-l"><input type="checkbox" data-qh> Важлива</label>' +
      (o.fixed ? '' : '<button type="button" class="btn ghost sm" data-ql aria-expanded="false">Привʼязка</button>') +
      '</span><button type="button" class="btn" data-qb>Додати</button></div>' + (o.fixed ? '' : '<div data-qlk hidden></div>') + '<p class="err" data-qm role="alert"></p>';
    var t = $('[data-qt]', el), d = $('[data-qd]', el), go = function () {
      var title = t.value.trim(); $('[data-qm]', el).textContent = '';
      if (!title) { t.focus(); return; }
      var s = $('[data-qs]', el), st = $('[data-qst]', el);
      var b = Object.assign({ title: title, due_date: d.value || null, assignee_staff_id: s.value ? +s.value : null, priority: $('[data-qh]', el).checked ? 'high' : 'normal' }, o.fixed || {}, link ? link.value() : {});
      if (st && st.value) b.stage_id = st.value;
      var btn = $('[data-qb]', el); btn.disabled = true;
      api(TAPI, { method: 'POST', body: b }).then(function () { btn.disabled = false; t.value = ''; $('[data-qh]', el).checked = false; toast('Задачу додано'); badge(); o.onAdd(); t.focus(); },
        function (e) { btn.disabled = false; $('[data-qm]', el).textContent = e.message; });
    };
    // Enter у полі назви — додати; усередині картки заявки (dialog-форма) це не має надсилати саму картку
    $('[data-qa]', el).onkeydown = function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); if (e.target === t || e.target === d) go(); } };
    $('[data-qb]', el).onclick = go;
    // на телефоні строк, виконавець і привʼязка сховані за кнопкою — рядок лишається одним полем
    $('[data-qo]', el).onclick = function () { var on = $('[data-qa]', el).classList.toggle('open'); this.setAttribute('aria-expanded', String(on)); };
    $$('[data-qn]', el).forEach(function (b) { b.onclick = function () { d.value = kyivDay(+b.dataset.qn); }; });
    var ql = $('[data-ql]', el);
    if (ql) ql.onclick = function () { var box = $('[data-qlk]', el); box.hidden = !box.hidden; ql.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden && !link) link = linkPicker(box, extra, function () { /* noop */ }); };
  }

  // ---------- вкладка «Задачі» ----------
  var VIEWS = [['mine', 'Мої'], ['all', 'Усі'], ['overdue', 'Прострочені'], ['today', 'Сьогодні'], ['week', 'Тиждень'], ['done', 'Виконані']];
  function tasksTab(L) {
    var S = Object.assign({ view: K().can('tasks.manage') ? 'all' : 'mine', assignee: '', link: '', q: '' }, LS.get('taskFilters', {}));
    if (!VIEWS.some(function (v) { return v[0] === S.view; })) S.view = 'all';
    var save = function () { LS.set('taskFilters', S); };
    L.innerHTML = '<div data-add></div><div class="crm-q c4-q tk-views" role="group" aria-label="Які задачі показати" data-views></div>' +
      '<div class="tb tk-tb"><input class="grow" type="search" data-f="q" placeholder="Пошук у задачах" aria-label="Пошук у задачах"><span data-flt></span></div>' +
      '<div data-list aria-live="polite"><p class="muted">Завантаження…</p></div>' +
      '<div class="crm-bulk row" data-bulk hidden><b data-bn></b><button type="button" class="btn" data-bd>Виконано</button>' +
      '<span class="row"><input type="date" data-bdate aria-label="Нова дата"><button type="button" class="btn ghost" data-bmove>Перенести</button></span>' +
      '<select data-bs aria-label="Змінити виконавця"></select><button type="button" class="btn ghost" data-bx>Скасувати вибір</button></div>';
    var built = false;
    var list = taskList({
      el: $('[data-list]', L), group: true,
      query: function (off) { return 'view=' + S.view + '&assignee=' + encodeURIComponent(S.assignee) + '&link=' + S.link + '&q=' + encodeURIComponent(S.q) + '&offset=' + off; },
      empty: 'Тут порожньо. Додайте задачу в рядку вгорі — назва й Enter.',
      onData: function (d) {
        $('[data-views]', L).innerHTML = VIEWS.filter(function (v) { return d.can.manage || v[0] !== 'all'; }).map(function (v) {
          var n = d.counts[v[0]];
          return '<button type="button" class="pill' + (v[0] === 'overdue' && n ? ' tk-od' : '') + '" data-v="' + v[0] + '" aria-pressed="' + (S.view === v[0]) + '">' + v[1] + (n ? ' <small>' + n + '</small>' : '') + '</button>';
        }).join('');
        $$('[data-v]', L).forEach(function (b) { b.onclick = function () { S.view = b.dataset.v; save(); list.load(); }; });
        if (built) return; built = true;
        if (d.can.manage) {
          quickAdd($('[data-add]', L), { staff: d.staff, me: d.me, onAdd: function () { list.load(true); } });
          $('[data-flt]', L).innerHTML = '<select data-f="assignee" aria-label="Виконавець"><option value="">Усі виконавці</option><option value="none"' + (S.assignee === 'none' ? ' selected' : '') + '>Без виконавця</option>' + (d.staff || []).map(function (s) { return '<option value="' + s.id + '"' + (String(s.id) === String(S.assignee) ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
            '<select data-f="link" aria-label="Привʼязка"><option value="">Будь-яка привʼязка</option>' + [['lead', 'До заявки'], ['project', 'До обʼєкта'], ['contact', 'До контакту'], ['none', 'Без привʼязки']].map(function (x) { return '<option value="' + x[0] + '"' + (S.link === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
            '<button type="button" class="btn ghost" data-pick aria-pressed="false">Вибрати кілька</button>';
          $$('select[data-f]', L).forEach(function (s) { s.onchange = function () { S[s.dataset.f] = s.value; save(); list.load(); }; });
          $('[data-bs]', L).innerHTML = '<option value="">Виконавець…</option><option value="none">— без виконавця —</option>' + (d.staff || []).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
          $('[data-pick]', L).onclick = function () { var on = !list.picking(); list.setPick(on); this.setAttribute('aria-pressed', String(on)); this.textContent = on ? 'Готово' : 'Вибрати кілька'; bulkBar([]); };
        } else $('[data-add]', L).innerHTML = '<p class="muted">Тут задачі, які призначили вам. Відмітьте виконану — автор отримає сповіщення.</p>';
      },
      onSelect: function (keys) { bulkBar(keys); },
    });
    var q = $('[data-f="q"]', L); q.value = S.q || '';
    q.oninput = debounce(function () { S.q = q.value.trim(); save(); list.load(); }, 350);
    var bar = $('[data-bulk]', L);
    function bulkBar(keys) { bar.hidden = !keys.length; $('[data-bn]', bar).textContent = 'Вибрано: ' + keys.length; }
    function bulk(body, what) {
      var keys = list.selected(); if (!keys.length) return;
      if (!confirm(what + ' — ' + keys.length + ' задач(і)?')) return;
      api(TAPI, { method: 'PATCH', body: { bulk: Object.assign({ ids: keys.map(function (k) { return k.charAt(0) === 'p' ? k : +k.slice(1); }) }, body) } }).then(function (r) {
        toast('Змінено: ' + r.changed + (r.skipped ? ' · пропущено: ' + r.skipped : '')); bulkBar([]); badge(); list.load();
      }, function (e) { toast(e.message, true); });
    }
    $('[data-bd]', bar).onclick = function () { bulk({ done: true }, 'Відмітити виконаними'); };
    $('[data-bmove]', bar).onclick = function () { var v = $('[data-bdate]', bar).value; if (!v) { toast('Оберіть нову дату', true); return; } bulk({ due_date: v }, 'Перенести на ' + dm(v)); };
    $('[data-bs]', bar).onchange = function () { var v = this.value; if (!v) return; var name = this.options[this.selectedIndex].text; this.value = ''; bulk({ assignee_staff_id: v === 'none' ? null : +v }, 'Виконавець: ' + name); };
    $('[data-bx]', bar).onclick = function () { list.clear(); bulkBar([]); };
    return list.load();
  }

  // ---------- блок «Задачі» в картці заявки / обʼєкта / контакту ----------
  // link: {order_id} | {project_id} | {contact_id}; o.stages — етапи обʼєкта для вибору; у картці обʼєкта — лише загальні задачі (етапні — вище)
  function taskBlock(el, link, o) {
    o = o || {};
    if (!el || !(K().can('tasks.manage') || K().can('tasks.own'))) return;
    var kind = Object.keys(link)[0], hide = kind.replace('_id', '');
    el.classList.add('tk-block');
    el.innerHTML = '<h3>Задачі <small class="muted" data-tn></small></h3><div data-add></div><div data-list><p class="muted">Завантаження…</p></div>';
    var built = false;
    var list = taskList({
      el: $('[data-list]', el), hide: hide, only: hide === 'project' ? 't' : null,
      query: function (off) { return 'view=any&limit=100&' + kind + '=' + link[kind] + '&offset=' + off; },
      empty: hide === 'order' ? 'Задач за цією заявкою ще немає.' : hide === 'project' ? 'Інших задач за обʼєктом немає — задачі етапів вище.' : 'Задач із цим контактом ще немає.',
      onData: function (d) {
        var open = list.rows().filter(function (t) { return t.status === 'open'; }).length;
        $('[data-tn]', el).textContent = list.rows().length ? '· відкритих ' + open + ' з ' + list.rows().length : '';
        if (built) return; built = true;
        if (d.can.manage) quickAdd($('[data-add]', el), { staff: d.staff, me: d.me, fixed: link, stages: o.stages, placeholder: 'Нова задача — назва й Enter', onAdd: function () { list.load(true); } });
      },
    });
    return list.load();
  }

  // лічильник прострочених на вкладці «Задачі»
  function badge() {
    var b = $('.adm-tabs [data-t="tasks"]'); if (!b) return;
    api(TAPI + '?count=1').then(function (d) {
      var n = d.overdue || 0, i = $('i', b);
      if (!n) { if (i) i.remove(); b.removeAttribute('title'); return; }
      if (!i) { i = document.createElement('i'); i.className = 'tab-n'; b.appendChild(i); }
      i.textContent = n; i.setAttribute('aria-label', 'прострочених: ' + n); b.title = 'Прострочених задач: ' + n;
    }, function () { /* до міграції 0018 — без лічильника */ });
  }

  // ===================== контакти: таблиця =====================
  var COLS = [['name', 'Назва / імʼя', 1], ['company', 'Компанія', 1], ['spec', 'Спеціалізація', 1], ['city', 'Місто', 1], ['phone', 'Телефон', 1], ['tg', 'Месенджер', 1], ['email', 'Пошта', 1],
    ['last_touch', 'Остання взаємодія', 0], ['links', 'Заявки / обʼєкти', 0], ['open_tasks', 'Відкриті задачі', 0], ['rating', 'Оцінка', 1], ['notes', 'Примітка', 1]];
  var CTABS = [['', 'Усі'], ['client', 'Клієнти'], ['supplier', 'Постачальники'], ['contractor', 'Підрядники'], ['partner', 'Партнери'], ['crew', 'Бригади'], ['master', 'Майстри'], ['realtor', 'Ріелтори']];
  var PAGE = 200;
  var stars = function (n) { return n ? '<span class="ct-star" aria-label="Оцінка ' + n + ' з 5">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>' : ''; };
  var digits = function (p) { return String(p || '').replace(/\D/g, ''); };
  var whenK = function (s) { var d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: '2-digit' }); };
  function cellHtml(r, k, all) {
    if (k === 'name') return '<span data-v>' + esc(r.name || '') + '</span>' + (!r.name && r.company ? '<span class="muted">' + esc(r.company) + '</span>' : '') + (all ? ' <small class="pill">' + esc(r.type_label) + '</small>' : '');
    if (k === 'spec') return '<span data-v>' + (r.tags || []).map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join(' ') + '</span>';
    if (k === 'phone') return '<span data-v>' + esc(r.phone || '') + '</span>' + (digits(r.phone).length >= 9 ? ' <a class="ct-go" href="tel:+' + digits(r.phone) + '" aria-label="Подзвонити ' + esc(r.phone) + '" title="Подзвонити">☎</a>' : '');
    if (k === 'tg') return '<span data-v>' + (r.tg ? '@' + esc(r.tg) : '') + '</span>' + (r.tg && /^[a-z][a-z0-9_]{3,31}$/i.test(r.tg) ? ' <a class="ct-go" href="https://t.me/' + esc(r.tg) + '" target="_blank" rel="noopener" aria-label="Написати в Telegram" title="Telegram">↗</a>' : '');
    if (k === 'email') return '<span data-v>' + esc(r.email || '') + '</span>';
    if (k === 'last_touch') return esc(whenK(r.last_touch));
    if (k === 'links') return (r.n_leads ? '<span title="Заявки">заявок ' + r.n_leads + '</span>' : '') + (r.n_leads && r.n_projects ? ' · ' : '') + (r.n_projects ? '<span title="Обʼєкти">обʼєктів ' + r.n_projects + '</span>' : '');
    if (k === 'open_tasks') return r.open_tasks ? '<b>' + r.open_tasks + '</b>' : '';
    if (k === 'rating') return '<span data-v>' + stars(r.rating) + '</span>';
    return '<span data-v>' + esc(r[k] || '') + '</span>';
  }
  var rawOf = function (r, k) { return k === 'spec' ? (r.tags || []).join(', ') : k === 'tg' ? (r.tg ? '@' + r.tg : '') : r[k] == null ? '' : String(r[k]); };
  var fieldOf = function (k) { return k === 'spec' ? 'tags' : k; };

  /* ctx: {back() — до режиму «Список», card(id|null) — відкрити картку контакту} */
  function contactsTable(L, ctx) {
    var S = Object.assign({ type: '', q: '', city: '', tag: '', sort: 'name', dir: 'asc', archived: false, cols: null }, LS.get('contactsTable', {}));
    var vis = function (k) { return !S.cols || S.cols.indexOf(k) >= 0; };
    var save = function () { LS.set('contactsTable', S); };
    var rows = [], D = null, sel = {}, canExport = K().can('export');
    var qs = function (off, csv) {
      return PAPI + '?type=' + S.type + '&q=' + encodeURIComponent(S.q) + '&city=' + encodeURIComponent(S.city) + '&tag=' + encodeURIComponent(S.tag) + '&sort=' + S.sort + '&dir=' + S.dir + (S.archived ? '&archived=1' : '') +
        (csv ? '&format=csv' : '&ver=1&limit=' + PAGE + '&offset=' + (off || 0) + (off ? '' : '&facets=1'));
    };
    function load(keepFocus) {
      return api(qs(0)).then(function (d) { D = d; rows = d.rows; sel = {}; draw(keepFocus); }, function (e) { L.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    var optList = function (items, v, all) { return '<option value="">' + all + '</option>' + (items || []).map(function (x) { return '<option value="' + esc(x.v) + '"' + (x.v === v ? ' selected' : '') + '>' + esc(x.v) + ' · ' + x.n + '</option>'; }).join('') + (v && !(items || []).some(function (x) { return x.v === v; }) ? '<option selected value="' + esc(v) + '">' + esc(v) + '</option>' : ''); };
    function head() {
      return '<tr><th class="ct-s"><input type="checkbox" class="sel" data-all aria-label="Вибрати всі показані"></th>' + COLS.filter(function (c) { return vis(c[0]); }).map(function (c) {
        var on = S.sort === c[0];
        return '<th scope="col" aria-sort="' + (on ? (S.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-s="' + c[0] + '">' + c[1] + (on ? ' <span aria-hidden="true">' + (S.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</button></th>';
      }).join('') + '</tr>';
    }
    function tr(r) {
      return '<tr data-id="' + r.id + '"><td class="ct-s"><input type="checkbox" class="sel" data-sel="' + r.id + '"' + (sel[r.id] ? ' checked' : '') + ' aria-label="Вибрати: ' + esc(r.name || r.company || '#' + r.id) + '"></td>' + COLS.filter(function (c) { return vis(c[0]); }).map(function (c) {
        return '<td data-c="' + c[0] + '"' + (c[2] ? ' data-e tabindex="0"' : '') + '>' + cellHtml(r, c[0], !S.type) + (c[0] === 'name' ? ' <button type="button" class="ct-open" data-open="' + r.id + '" aria-label="Відкрити картку" title="Картка контакту">⋯</button>' : '') + '</td>';
      }).join('') + '</tr>';
    }
    function newRow() {
      if (S.archived) return '';
      var ph = { name: 'Новий контакт: імʼя', company: 'Компанія', spec: 'плитка, електрика', city: 'Місто', phone: '+380…', tg: '@username', email: 'name@…' };
      return '<tr class="ct-new" data-newrow><td class="ct-s"><span aria-hidden="true">+</span></td>' + COLS.filter(function (c) { return vis(c[0]); }).map(function (c) {
        return '<td>' + (ph[c[0]] ? '<input data-n="' + c[0] + '" placeholder="' + ph[c[0]] + '" aria-label="Новий контакт: ' + c[1] + '"' + (c[0] === 'phone' ? ' type="tel" inputmode="tel"' : '') + '>' : c[0] === 'notes' ? '<button type="button" class="btn sm" data-nadd>Додати</button>' : '') + '</td>';
      }).join('') + '</tr>';
    }
    function draw(keepFocus) {
      var tc = D.type_counts || {}, total = Object.keys(tc).reduce(function (s, k) { return s + tc[k]; }, 0);
      L.innerHTML = '<div class="tb ct-tb"><div class="seg" role="group" aria-label="Вигляд контактів"><button type="button" data-mode="list" aria-pressed="false">Список</button><button type="button" data-mode="table" aria-pressed="true">Таблиця</button></div>' +
        '<input class="grow" type="search" data-f="q" placeholder="Пошук: імʼя, компанія, телефон, @username, пошта, тег" aria-label="Пошук у контактах">' +
        '<select data-f="city" aria-label="Місто">' + optList(D.cities, S.city, 'Усі міста') + '</select><select data-f="tag" aria-label="Спеціалізація">' + optList(D.tags, S.tag, 'Усі спеціалізації') + '</select>' +
        '<details class="ct-cols"><summary class="btn ghost">Колонки</summary><div role="group" aria-label="Які колонки показувати">' + COLS.map(function (c) { return '<label><input type="checkbox" data-col="' + c[0] + '"' + (vis(c[0]) ? ' checked' : '') + (c[0] === 'name' ? ' disabled' : '') + '> ' + c[1] + '</label>'; }).join('') + '</div></details>' +
        '<button type="button" class="btn ghost" data-imp>Імпорт CSV</button>' + (canExport ? '<a class="btn ghost" data-csv href="' + esc(qs(0, true)) + '" download>CSV</a>' : '') + '</div>' +
        '<div class="crm-q c4-q" role="group" aria-label="Тип контакту">' + CTABS.map(function (t) { var n = t[0] ? tc[t[0]] : total; return '<button type="button" class="pill" data-ty="' + t[0] + '" aria-pressed="' + (!S.archived && S.type === t[0]) + '">' + t[1] + (n ? ' <small>' + n + '</small>' : '') + '</button>'; }).join('') +
        (D.archive ? '<button type="button" class="pill" data-arch aria-pressed="' + !!S.archived + '">Архів' + (D.archived_count ? ' <small>' + D.archived_count + '</small>' : '') + '</button>' : '') + '</div>' +
        '<p class="muted" data-sum>' + (rows.length < D.total ? 'Показано ' + rows.length + ' з ' + D.total : D.total + ' ' + (D.total === 1 ? 'контакт' : 'контактів')) + (S.archived ? ' в архіві' : '') + '. Клітинку можна змінити на місці: клацніть, виправте, Enter.</p>' +
        '<div class="ct-wrap" tabindex="0" role="region" aria-label="Таблиця контактів (гортається вбік)"><table class="adm ct-tbl" data-ctbl><thead>' + head() + '</thead><tbody>' + newRow() + rows.map(tr).join('') + '</tbody></table></div>' +
        (rows.length ? '' : '<p class="muted">' + (S.archived ? 'В архіві порожньо.' : 'Нічого не знайдено. Додайте контакт у першому рядку таблиці або імпортуйте CSV.') + '</p>') +
        (D.more ? '<p><button type="button" class="btn ghost" data-more>Показати ще ' + PAGE + '</button></p>' : '') +
        '<div class="crm-bulk row" data-bulk hidden><b data-bn></b><select data-bt aria-label="Змінити тип"><option value="">Тип…</option>' + Object.keys(D.types).map(function (k) { return '<option value="' + k + '">' + esc(D.types[k]) + '</option>'; }).join('') + '</select>' +
        '<span class="row"><input data-bcity placeholder="Місто" aria-label="Нове місто"><button type="button" class="btn ghost" data-bcgo>Змінити місто</button></span>' +
        '<button type="button" class="btn ghost" data-barch>' + (S.archived ? 'Повернути з архіву' : 'В архів') + '</button><button type="button" class="btn ghost" data-bx>Скасувати вибір</button></div>';
      bind(keepFocus);
    }
    var byId = function (id) { return rows.filter(function (r) { return r.id === id; })[0]; };
    function bulkBar() { var n = Object.keys(sel).length, bar = $('[data-bulk]', L); bar.hidden = !n; $('[data-bn]', bar).textContent = 'Вибрано: ' + n; }
    function bulk(body, what) {
      var ids = Object.keys(sel).map(Number); if (!ids.length) return;
      if (!confirm(what + ' — ' + ids.length + ' контакт(ів)?')) return;
      api(PAPI, { method: 'PATCH', body: { bulk: Object.assign({ ids: ids }, body) } }).then(function (r) { toast('Змінено: ' + r.changed + (r.skipped ? ' · пропущено: ' + r.skipped : '')); load(); }, function (e) { toast(e.message, true); });
    }
    function bind(keepFocus) {
      var q = $('[data-f="q"]', L); q.value = S.q || '';
      q.oninput = debounce(function () { S.q = q.value.trim(); save(); load(true); }, 350);
      if (keepFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      $$('select[data-f]', L).forEach(function (s) { s.onchange = function () { S[s.dataset.f] = s.value; save(); load(); }; });
      $('[data-mode="list"]', L).onclick = function () { ctx.back(); };
      $$('[data-ty]', L).forEach(function (b) { b.onclick = function () { S.type = b.dataset.ty; S.archived = false; save(); load(); }; });
      var ar = $('[data-arch]', L); if (ar) ar.onclick = function () { S.archived = !S.archived; save(); load(); };
      $$('[data-s]', L).forEach(function (b) { b.onclick = function () { if (S.sort === b.dataset.s) S.dir = S.dir === 'asc' ? 'desc' : 'asc'; else { S.sort = b.dataset.s; S.dir = /^(last_touch|links|open_tasks|rating)$/.test(S.sort) ? 'desc' : 'asc'; } save(); load(); }; });
      $$('[data-col]', L).forEach(function (c) { c.onchange = function () { var on = COLS.map(function (x) { return x[0]; }).filter(function (k) { var el = $('[data-col="' + k + '"]', L); return el && el.checked; }); S.cols = on.length === COLS.length ? null : on; save(); var open = $('.ct-cols', L).open; draw(); $('.ct-cols', L).open = open; }; });
      $$('[data-open]', L).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); ctx.card(+b.dataset.open); }; });
      $$('[data-sel]', L).forEach(function (c) { c.onchange = function () { if (c.checked) sel[c.dataset.sel] = 1; else delete sel[c.dataset.sel]; bulkBar(); }; });
      var all = $('[data-all]', L); all.onchange = function () { sel = {}; if (all.checked) rows.forEach(function (r) { sel[r.id] = 1; }); $$('[data-sel]', L).forEach(function (c) { c.checked = all.checked; }); bulkBar(); };
      var m = $('[data-more]', L);
      if (m) m.onclick = function () { m.disabled = true; api(qs(rows.length)).then(function (d) { rows = rows.concat(d.rows); D.more = d.more; var keep = sel; draw(); sel = keep; $$('[data-sel]', L).forEach(function (c) { c.checked = !!sel[c.dataset.sel]; }); bulkBar(); }, function (e) { m.disabled = false; toast(e.message, true); }); };
      $('[data-bt]', L).onchange = function () { var v = this.value; if (!v) return; this.value = ''; bulk({ type: v }, 'Змінити тип на «' + D.types[v] + '»'); };
      $('[data-bcgo]', L).onclick = function () { var v = $('[data-bcity]', L).value.trim(); if (!v) { toast('Вкажіть місто', true); return; } bulk({ city: v }, 'Змінити місто на «' + v + '»'); };
      $('[data-barch]', L).onclick = function () { bulk({ archive: !S.archived }, S.archived ? 'Повернути з архіву' : 'Перенести в архів (контакти зникнуть зі списку й пошуку, звʼязки лишаться)'); };
      $('[data-bx]', L).onclick = function () { sel = {}; $$('[data-sel],[data-all]', L).forEach(function (c) { c.checked = false; }); bulkBar(); };
      $('[data-imp]', L).onclick = function () { importDialog(D.types, S.type, function () { load(); }); };
      // правка клітинки на місці
      $$('td[data-e]', L).forEach(function (td) {
        td.onclick = function (e) { if (!e.target.closest('a,button,input,select')) editCell(td); };
        td.onkeydown = function (e) { if ((e.key === 'Enter' || e.key === 'F2') && e.target === td) { e.preventDefault(); editCell(td); } };
      });
      // швидке додавання рядка
      var nr = $('[data-newrow]', L);
      if (nr) {
        var add = function () {
          var b = { type: S.type || 'other' };
          $$('[data-n]', nr).forEach(function (i) { var v = i.value.trim(); if (!v) return; if (i.dataset.n === 'spec') b.tags = v.split(',').map(function (t) { return t.trim(); }).filter(Boolean); else b[i.dataset.n] = v; });
          if (Object.keys(b).length < 2) { toast('Вкажіть імʼя, компанію або контакт', true); return; }
          api(PAPI, { method: 'POST', body: b }).then(function () { toast('Контакт додано'); load(); }, function (e) { toast(e.message, true); });
        };
        var ab = $('[data-nadd]', nr); if (ab) ab.onclick = add;
        nr.onkeydown = function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); add(); } };
      }
    }
    var CL = { name: 'Назва / імʼя', company: 'Компанія', tags: 'Спеціалізація', city: 'Місто', phone: 'Телефон', tg: 'Месенджер', email: 'Пошта', rating: 'Оцінка', notes: 'Примітка' };
    function editCell(td) {
      if (td.classList.contains('editing')) return;
      var r = byId(+td.parentNode.dataset.id), k = td.dataset.c; if (!r) return;
      var was = rawOf(r, k), html = td.innerHTML, inp;
      td.classList.add('editing');
      if (k === 'rating') td.innerHTML = '<select aria-label="Оцінка"><option value="">—</option>' + [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '"' + (n === r.rating ? ' selected' : '') + '>' + n + ' ★</option>'; }).join('') + '</select>';
      else td.innerHTML = '<input value="' + esc(was) + '" aria-label="' + esc(CL[fieldOf(k)]) + '"' + (k === 'phone' ? ' type="tel" inputmode="tel"' : k === 'email' ? ' type="email" inputmode="email"' : '') + '>';
      inp = td.firstChild; inp.focus(); if (inp.select) inp.select();
      var done = false;
      var close = function (row) { done = true; td.classList.remove('editing'); if (row) { rows[rows.indexOf(r)] = row; var t = document.createElement('tbody'); t.innerHTML = tr(row); td.parentNode.replaceWith(t.firstChild); bindRow(row.id); } else td.innerHTML = html; };
      var valueOf = function (v) { return k === 'spec' ? v.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : k === 'rating' ? (v ? +v : null) : v.trim(); };
      var commit = function () {
        if (done) return;
        var v = inp.value;
        if (nrm(v) === nrm(was)) { close(); return; }
        var body = { id: r.id, ver: r.ver }; body[fieldOf(k)] = valueOf(v);
        done = true; inp.disabled = true;
        api(PAPI, { method: 'PATCH', body: body }).then(function (d) { toast('Збережено'); close(merge(r, d.partner)); td = null; }, function (er) {
          done = false; inp.disabled = false;
          if (!(K().isConflict(er) && er.data.partner)) { toast(er.message, true); inp.focus(); return; }
          K().conflictDialog(er.message, er.data.last, 'контакт').then(function (c) {
            var fresh = merge(r, er.data.partner);
            if (c === 'cancel') { inp.focus(); return; }
            if (c === 'reload') { close(fresh); return; }
            if (nrm(rawOf(fresh, k)) !== nrm(was)) { close(fresh); toast(CL[fieldOf(k)] + ': це поле вже змінив хтось інший — зараз «' + rawOf(fresh, k) + '», ваше значення не перенесено', true); return; }
            var b2 = { id: r.id, ver: fresh.ver }; b2[fieldOf(k)] = valueOf(v);
            api(PAPI, { method: 'PATCH', body: b2 }).then(function (d2) { toast('Збережено — вашу зміну додано до свіжих даних'); close(merge(r, d2.partner)); }, function (e2) { toast(e2.message, true); close(fresh); });
          });
        });
      };
      inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      inp.onblur = function () { setTimeout(commit, 0); };
      if (k === 'rating') inp.onchange = commit;
    }
    // відповідь PATCH не має лічильників рядка — беремо їх зі старого
    var merge = function (old, p) { return Object.assign({}, p, { n_projects: old.n_projects, n_leads: old.n_leads, open_tasks: old.open_tasks, last_touch: p.updated_at || old.last_touch }); };
    function bindRow(id) {
      var row = $('tr[data-id="' + id + '"]', L); if (!row) return;
      $$('td[data-e]', row).forEach(function (td) {
        td.onclick = function (e) { if (!e.target.closest('a,button,input,select')) editCell(td); };
        td.onkeydown = function (e) { if ((e.key === 'Enter' || e.key === 'F2') && e.target === td) { e.preventDefault(); editCell(td); } };
      });
      var o = $('[data-open]', row); if (o) o.onclick = function (e) { e.stopPropagation(); ctx.card(id); };
      var c = $('[data-sel]', row); if (c) c.onchange = function () { if (c.checked) sel[id] = 1; else delete sel[id]; bulkBar(); };
    }
    L.innerHTML = '<p class="muted">Завантаження…</p>';
    return load();
  }

  // ---------- імпорт CSV: файл → зіставлення колонок → попередній перегляд (сервер перевіряє, нічого не пишучи) → імпорт ----------
  var FIELDS = [['', '— пропустити —'], ['name', 'Імʼя / назва'], ['company', 'Компанія'], ['type', 'Тип'], ['city', 'Місто'], ['phone', 'Телефон'], ['tg', 'Telegram'], ['email', 'Пошта'], ['site', 'Сайт'], ['tags', 'Спеціалізація / теги'], ['notes', 'Примітка'], ['status', 'Статус'], ['rating', 'Оцінка']];
  var GUESS = [['name', /^(імʼ?'?я|имя|name|піб|фио|назва|контакт|contact)/i], ['company', /^(компан|company|фірма|организац|організац)/i], ['type', /^(тип|type|категор)/i], ['city', /^(місто|город|city|регіон|область|region)/i],
    ['phone', /^(тел|phone|моб|номер)/i], ['tg', /^(telegram|телеграм|tg|месенджер|messenger)/i], ['email', /^(e-?mail|пошта|почта|емейл)/i], ['site', /^(сайт|site|url|web)/i],
    ['tags', /^(спеціаліз|специализ|теги|tags|послуг)/i], ['notes', /^(приміт|нотат|комент|заметк|note|comment)/i], ['status', /^(статус|status)/i], ['rating', /^(оцінк|рейтинг|rating|оценк)/i]];
  var IMPORT_MAX = 2000;
  // CSV → масив рядків: роздільник «;», «,» або табуляція (за першим рядком), лапки з подвоєнням, BOM
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', cnt = function (ch) { return first.split(ch).length - 1; };
    var sep = cnt(';') >= cnt(',') && cnt(';') >= cnt('\t') ? ';' : cnt('\t') > cnt(',') ? '\t' : ',';
    var out = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function (x) { return x.trim(); })) out.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(function (x) { return x.trim(); })) out.push(row);
    return out;
  }
  function importDialog(types, defType, onDone) {
    var dlg = document.createElement('dialog'); dlg.className = 'cf-dlg c4-imp'; dlg.setAttribute('aria-labelledby', 'c4impT');
    ($('#adm') || document.body).appendChild(dlg);
    var data = null, map = [], header = true, results = null;
    var close = function () { if (dlg.open) dlg.close(); dlg.remove(); };
    function step1(msg) {
      dlg.innerHTML = '<h2 id="c4impT">Імпорт контактів з CSV</h2><p class="muted">Файл з Excel або Google Таблиць: «Зберегти як → CSV». Перший рядок — назви колонок. До ' + IMPORT_MAX + ' рядків за раз. Спершу покажемо, що буде додано: дублі за телефоном, Telegram чи поштою пропускаються.</p>' +
        '<p><input type="file" accept=".csv,text/csv,text/plain" data-file aria-label="Файл CSV"></p>' + (msg ? '<p class="err" role="alert">' + esc(msg) + '</p>' : '') +
        '<div class="cf-act"><button type="button" class="btn ghost" data-x>Закрити</button></div>';
      $('[data-x]', dlg).onclick = close;
      $('[data-file]', dlg).onchange = function () {
        var f = this.files[0]; if (!f) return;
        if (f.size > 3 * 1024 * 1024) { step1('Файл завеликий (понад 3 МБ). Розділіть його на частини.'); return; }
        f.arrayBuffer().then(function (buf) {
          var t = new TextDecoder('utf-8').decode(buf);
          if (t.indexOf('�') >= 0) { try { t = new TextDecoder('windows-1251').decode(buf); } catch (e) { /* лишаємо UTF-8 */ } } // старий Excel зберігає CSV у Windows-1251
          var rows = parseCsv(t);
          if (rows.length < 1) { step1('У файлі немає рядків.'); return; }
          data = rows; header = true;
          map = rows[0].map(function (h) { var g = GUESS.filter(function (x) { return x[1].test(String(h).trim()); })[0]; return g ? g[0] : ''; });
          map = map.map(function (k, i) { return k && map.indexOf(k) !== i ? '' : k; }); // одне поле — одна колонка
          step2();
        }, function () { step1('Не вдалося прочитати файл.'); });
      };
    }
    var body = function () { return (header ? data.slice(1) : data).slice(0, IMPORT_MAX); };
    var toObj = function (r) { var o = {}; map.forEach(function (k, i) { var v = String(r[i] == null ? '' : r[i]).trim(); if (k && v) o[k] = v; }); return o; };
    function step2() {
      var all = header ? data.length - 1 : data.length, cols = data[0].length, sample = body().slice(0, 5);
      dlg.innerHTML = '<h2 id="c4impT">Імпорт: зіставте колонки</h2><p class="muted">Рядків у файлі: <b>' + all + '</b>' + (all > IMPORT_MAX ? ' — буде оброблено перші ' + IMPORT_MAX : '') + '. Для кожної колонки оберіть, що це за поле.</p>' +
        '<p class="row"><label><input type="checkbox" data-hd' + (header ? ' checked' : '') + '> Перший рядок — назви колонок</label>' +
        '<label>Тип, якщо в рядку не вказано: <select data-dt>' + Object.keys(types).map(function (k) { return '<option value="' + k + '"' + (k === (defType || 'other') ? ' selected' : '') + '>' + esc(types[k]) + '</option>'; }).join('') + '</select></label></p>' +
        '<div class="ct-wrap c4-map"><table class="adm"><thead><tr>' + Array.apply(null, Array(cols)).map(function (_, i) {
          return '<th><select data-m="' + i + '" aria-label="Поле для колонки ' + (i + 1) + '">' + FIELDS.map(function (f) { return '<option value="' + f[0] + '"' + (map[i] === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select>' + (header ? '<br><small>' + esc(String(data[0][i] || '').slice(0, 40)) + '</small>' : '') + '</th>';
        }).join('') + '</tr></thead><tbody>' + sample.map(function (r) { return '<tr>' + Array.apply(null, Array(cols)).map(function (_, i) { return '<td>' + esc(String(r[i] == null ? '' : r[i]).slice(0, 60)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="err" data-m0 role="alert"></p><div class="cf-act"><button type="button" class="btn" data-go>Перевірити й показати, що буде додано</button><button type="button" class="btn ghost" data-back>Інший файл</button><button type="button" class="btn ghost" data-x>Закрити</button></div>';
      $('[data-x]', dlg).onclick = close; $('[data-back]', dlg).onclick = function () { step1(); };
      $('[data-hd]', dlg).onchange = function () { header = this.checked; step2(); };
      $('[data-dt]', dlg).onchange = function () { defType = this.value; };
      $$('[data-m]', dlg).forEach(function (s) { s.onchange = function () { var i = +s.dataset.m; if (s.value) map = map.map(function (k, j) { return j !== i && k === s.value ? '' : k; }); map[i] = s.value; step2(); }; });
      $('[data-go]', dlg).onclick = function () {
        if (!map.some(function (k) { return ['name', 'company', 'phone', 'tg', 'email', 'site'].indexOf(k) >= 0; })) { $('[data-m0]', dlg).textContent = 'Оберіть хоча б одну з колонок: імʼя, компанія, телефон, Telegram, пошта або сайт.'; return; }
        defType = $('[data-dt]', dlg).value; run(true);
      };
    }
    // порції: до 100 рядків і ~45 КБ (сервер приймає до 64 КБ на запит)
    function chunks(list) {
      var out = [], cur = [], size = 0;
      list.forEach(function (o, i) { var s = JSON.stringify(o).length + 2; if (cur.length && (cur.length >= 100 || size + s > 45000)) { out.push(cur); cur = []; size = 0; } cur.push({ i: i, o: o }); size += s; });
      if (cur.length) out.push(cur);
      return out;
    }
    function run(dry) {
      var list = body().map(toObj), parts = chunks(list), res = new Array(list.length), n = 0;
      dlg.innerHTML = '<h2 id="c4impT">' + (dry ? 'Перевіряємо файл…' : 'Імпортуємо…') + '</h2><p role="status" data-pr>0 з ' + list.length + '</p>';
      var next = function () {
        if (n >= parts.length) { results = res; return dry ? step3(list) : done(res); }
        var part = parts[n++];
        return api(PAPI, { method: 'POST', body: { action: 'import', dry: dry, type: defType || 'other', rows: part.map(function (x) { return x.o; }) } }).then(function (d) {
          d.results.forEach(function (r) { res[part[r.i].i] = r; });
          $('[data-pr]', dlg).textContent = Math.min(list.length, part[part.length - 1].i + 1) + ' з ' + list.length;
          return next();
        });
      };
      next().catch(function (e) { step2(); $('[data-m0]', dlg).textContent = e.message + (dry ? '' : ' Частину рядків могло бути додано — перевірте таблицю.'); });
    }
    var count = function (res, st) { return res.filter(function (r) { return r && r.status === st; }).length; };
    var badgeOf = function (r) {
      if (!r) return '';
      if (r.status === 'new') return '<span class="pill on">новий</span>';
      if (r.status === 'dup') return '<span class="pill">дубль — ' + (r.where === 'file' ? 'той самий контакт у рядку ' + (r.row + 1 + (header ? 1 : 0)) + ' файлу' : (r.where === 'archive' ? 'є в архіві' : 'вже є') + (r.name ? ': ' + esc(r.name) : '')) + '</span>';
      return '<span class="pill warn">помилка: ' + esc(String(r.error || '').replace(/^(name|company|phone|tg|email|site|tags|notes|rating|status|type|city):/, function (m, k) { return ({ name: 'Імʼя', company: 'Компанія', phone: 'Телефон', tg: 'Telegram', email: 'Пошта', site: 'Сайт', tags: 'Теги', notes: 'Примітка', rating: 'Оцінка', status: 'Статус', type: 'Тип', city: 'Місто' })[k] + ':'; })) + '</span>';
    };
    function step3(list) {
      var nw = count(results, 'new'), du = count(results, 'dup'), er = count(results, 'error');
      var show = list.map(function (o, i) { return { o: o, r: results[i], i: i }; });
      show = show.filter(function (x) { return x.r && x.r.status !== 'new'; }).concat(show.filter(function (x) { return x.r && x.r.status === 'new'; })).slice(0, 60); // спершу те, що не буде додано
      dlg.innerHTML = '<h2 id="c4impT">Імпорт: попередній перегляд</h2><p data-psum><b>Буде додано: ' + nw + '</b> · дублів (пропустимо): ' + du + ' · з помилками (пропустимо): ' + er + '</p>' +
        '<div class="ct-wrap c4-prev"><table class="adm"><thead><tr><th>Рядок</th><th>Що буде</th><th>Імʼя / компанія</th><th>Телефон</th><th>Telegram</th><th>Пошта</th><th>Місто</th></tr></thead><tbody>' + show.map(function (x) {
          return '<tr><td>' + (x.i + 1 + (header ? 1 : 0)) + '</td><td>' + badgeOf(x.r) + '</td><td>' + esc(x.o.name || x.o.company || '') + '</td><td>' + esc(x.o.phone || '') + '</td><td>' + esc(x.o.tg || '') + '</td><td>' + esc(x.o.email || '') + '</td><td>' + esc(x.o.city || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (list.length > show.length ? '<p class="muted">Показано ' + show.length + ' з ' + list.length + ' рядків (спершу дублі й помилки).</p>' : '') +
        '<div class="cf-act">' + (nw ? '<button type="button" class="btn" data-imp>Імпортувати ' + nw + '</button>' : '') + '<button type="button" class="btn ghost" data-back>Змінити колонки</button><button type="button" class="btn ghost" data-x>Закрити</button></div>';
      $('[data-x]', dlg).onclick = close; $('[data-back]', dlg).onclick = step2;
      var b = $('[data-imp]', dlg); if (b) b.onclick = function () { run(false); };
    }
    function done(res) {
      dlg.innerHTML = '<h2 id="c4impT">Імпорт завершено</h2><p data-pdone><b>Додано: ' + count(res, 'new') + '</b> · пропущено дублів: ' + count(res, 'dup') + ' · з помилками: ' + count(res, 'error') + '</p><div class="cf-act"><button type="button" class="btn" data-x>Готово</button></div>';
      $('[data-x]', dlg).onclick = function () { close(); onDone(); };
    }
    dlg.addEventListener('cancel', function () { setTimeout(function () { dlg.remove(); }, 0); });
    step1(); dlg.showModal();
  }

  window.CASCrm4 = {
    tabs: [{ key: 'tasks', label: 'Задачі', perms: ['tasks.manage', 'tasks.own'], after: 'crm', render: tasksTab }],
    taskBlock: taskBlock, contactsTable: contactsTable, badge: badge, parseCsv: parseCsv,
    started: function () { badge(); setInterval(function () { if (!document.hidden) badge(); }, 5 * 60000); },
  };
})();
