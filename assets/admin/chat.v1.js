/* CAS Development — «Чат на сайті» у /kabinet/admin (23.11.2026): список розмов відвідувачів і картка розмови з відповіддю людини.
   API: /api/admin/chat (functions/api/admin/chat.js), права chat.view / chat.reply (власник, менеджер). Реєструється через window.CASChatAdm
   (як crm4.v1.js — через window.CASCrm4), підключається перед cms.v1.js. Посилання з Telegram «потрібна людина» — /kabinet/admin?cs=<id>#chat.
   Увесь текст відвідувача, імена файлів і рядки розрахунку вставляються лише через esc() / textContent — tools/tests/xss.mjs. */
(function () {
  'use strict';
  var K = function () { return window.CASAdminKit; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var api = function (p, o) { return K().api(p, o); };
  var toast = function (m, e) { K().toast(m, e); };
  var CAPI = '/api/admin/chat';
  var ST = { bot: 'Бот', waiting: 'Чекає людину', staff: 'Відповідає людина', closed: 'Закрито' };
  var ROLE = { user: 'Відвідувач', bot: 'Помічник', staff: 'Менеджер', system: 'Система' };
  var FILTERS = [['', 'Усі'], ['unread', 'Непрочитані'], ['waiting', 'Чекають людину'], ['staff', 'Людина'], ['bot', 'Бот'], ['closed', 'Закриті']];
  var KIND = { image: 'фото', video: 'відео', audio: 'аудіо', pdf: 'PDF', sheet: 'таблиця', doc: 'документ', cad: 'креслення', model: '3D / BIM', archive: 'архів' };
  var utc = function (s) { return new Date(String(s || '').replace(' ', 'T') + 'Z'); };
  var when = function (s) { var d = utc(s); return isNaN(d) ? '' : d.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
  var size = function (n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ'; };
  // $1 100 — тисячі вузьким нерозривним пробілом (формат цін CLAUDE.md)
  var usd = function (n, cur) { if (n == null) return 'за кошторисом'; var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return cur === 'EUR' ? '€' + s : cur === 'UAH' ? s + ' ₴' : '$' + s; };
  var LS = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } } };

  function estimateHtml(e) {
    if (!e || !e.lines) return '';
    return '<table class="ch-est"><caption>Попередній розрахунок' + (e.region === 'eu' ? ' · Європа' : '') + '</caption><tbody>' +
      e.lines.map(function (l) {
        var q = l.qty != null ? esc(String(l.qty).replace('.', ',')) + (l.unit ? ' ' + esc(l.unit) : '') : '';
        var r = l.rate != null ? usd(l.rate, e.currency) + (l.unit ? '/' + esc(l.unit) : '') : '';
        return '<tr><th scope="row">' + esc(l.label) + (l.note ? '<small>' + esc(l.note) + '</small>' : '') + '</th><td>' + [q, r].filter(Boolean).join(' × ') + '</td><td>' + (l.from != null ? 'від ' + usd(l.from, e.currency) : 'за кошторисом') + '</td></tr>';
      }).join('') + '</tbody>' + (e.total_from != null ? '<tfoot><tr><th scope="row" colspan="2">Разом</th><td>від ' + usd(e.total_from, e.currency) + '</td></tr></tfoot>' : '') + '</table>' +
      (e.note ? '<p class="ch-note">' + esc(e.note) + '</p>' : '');
  }
  // байти файлу — через fetch з cookie (адресу з правами не віддаємо стороннім), далі blob: — завантажити або відтворити
  function blobOf(id) {
    return fetch(CAPI + '?file=' + encodeURIComponent(id), { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Файл недоступний (' + r.status + ')'); return r.blob(); });
  }
  function download(f) {
    blobOf(f.id).then(function (b) {
      var u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = f.name || 'file'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
    }, function (e) { toast(e.message, true); });
  }

  function msgHtml(m) {
    var files = (m.files || []).map(function (f, i) {
      return '<button type="button" class="ch-file" data-f="' + i + '"><b>' + esc(f.name) + '</b> <small>' + esc(KIND[f.kind] || f.kind) + ' · ' + size(f.size) + '</small></button>';
    }).join('');
    return '<li class="ch-m ch-' + esc(m.role) + '" data-id="' + m.id + '"><div class="ch-h"><b>' + esc(m.role === 'staff' && m.author ? m.author : ROLE[m.role] || m.role) + '</b> <time>' + when(m.at) + '</time></div>' +
      (m.text ? '<p class="ch-t">' + esc(m.text) + '</p>' : '') + (files ? '<div class="ch-files">' + files + '</div>' : '') +
      (m.audio ? '<button type="button" class="btn sm ghost ch-play" data-a="' + esc(m.audio.id) + '">▶ Аудіо-відповідь' + (m.audio.dur ? ' · ' + Math.round(m.audio.dur) + ' с' : '') + '</button>' : '') +
      estimateHtml(m.estimate) + '</li>';
  }

  // ===================== список =====================
  function listTab(L) {
    var S = { state: LS.get('chatF'), q: '' }, timer = null, rows = [];
    var open = parseInt(new URLSearchParams(location.search).get('cs'), 10);
    if (open > 0) {
      try { var u = new URL(location.href); u.searchParams.delete('cs'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* noop */ }
      return card(L, open);
    }
    L.innerHTML = '<div class="ch-top"><div class="seg" role="group" aria-label="Фільтр розмов">' + FILTERS.map(function (f) {
      return '<button type="button" data-st="' + f[0] + '" aria-pressed="' + (S.state === f[0]) + '">' + f[1] + ' <small data-n="' + (f[0] || 'all') + '"></small></button>';
    }).join('') + '</div><input type="search" data-q placeholder="Пошук: текст, файл, номер заявки" aria-label="Пошук у розмовах"><span class="ch-on" data-on></span></div>' +
      '<ul class="ch-list" data-list aria-live="polite"><li class="ch-empty">Завантажуємо…</li></ul><div data-more></div>';
    function load(before) {
      var q = '?limit=50' + (S.state ? '&state=' + S.state : '') + (S.q ? '&q=' + encodeURIComponent(S.q) : '') + (before ? '&before=' + before : '');
      return api(CAPI + q).then(function (d) {
        rows = before ? rows.concat(d.rows) : d.rows;
        Object.keys(d.counts || {}).forEach(function (k) { var n = $('[data-n="' + k + '"]', L); if (n) n.textContent = d.counts[k] || ''; });
        var on = $('[data-on]', L); on.className = 'ch-on' + (d.online ? ' ok' : ''); on.textContent = d.online ? 'Помічник на звʼязку' : 'Помічник офлайн (Mac mini не пінгує)';
        tabBadge(d.counts && d.counts.unread);
        var ul = $('[data-list]', L);
        ul.innerHTML = rows.length ? rows.map(function (r) {
          return '<li><button type="button" class="ch-row' + (r.unread ? ' unread' : '') + '" data-id="' + r.id + '">' +
            '<span class="ch-r1"><span class="pill st-' + esc(r.state) + '">' + esc(ST[r.state] || r.state) + '</span> <b>#' + r.id + '</b> · ' + esc((r.lang || '').toUpperCase()) +
            ' · <span class="ch-page">' + esc(r.page || '/') + '</span>' + (r.lead ? ' · <span class="pill on">' + esc(r.lead.number) + '</span>' : '') +
            (r.files ? ' · 📎 ' + r.files : '') + (r.waiting_reply && r.state !== 'closed' ? ' · <span class="pill warn">без відповіді</span>' : '') + '<time>' + when(r.last_at) + '</time></span>' +
            '<span class="ch-r2">' + (r.last_role ? '<i>' + esc(ROLE[r.last_role] || r.last_role) + ':</i> ' : '') + esc(r.last_text || '') + '</span></button></li>';
        }).join('') : '<li class="ch-empty">Розмов немає.</li>';
        $$('.ch-row', ul).forEach(function (b) { b.onclick = function () { stop(); card(L, +b.dataset.id); }; });
        var mo = $('[data-more]', L);
        mo.innerHTML = d.more ? '<button type="button" class="btn ghost cmp-more">Показати ще</button>' : '';
        if (d.more) $('button', mo).onclick = function () { load(d.next); };
      }, function (e) { $('[data-list]', L).innerHTML = '<li class="err">' + esc(e.message) + '</li>'; });
    }
    function stop() { clearInterval(timer); }
    $$('[data-st]', L).forEach(function (b) { b.onclick = function () { S.state = b.dataset.st; LS.set('chatF', S.state); $$('[data-st]', L).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); load(); }; });
    var t; $('[data-q]', L).oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { S.q = v.trim(); load(); }, 300); };
    load();
    timer = setInterval(function () { if (!document.contains(L)) { stop(); return; } if (!document.hidden) load(); }, 30000);
  }

  // ===================== картка розмови =====================
  function card(L, id) {
    var timer = null, last = 0, s = null;
    L.innerHTML = '<button type="button" class="lnk" data-back>← До списку розмов</button><div data-card><p class="acc-wait">Завантажуємо…</p></div>';
    $('[data-back]', L).onclick = function () { clearInterval(timer); listTab(L); };
    function render(d) {
      s = d.session;
      var box = $('[data-card]', L), lead = s.lead;
      var keep = $('[data-reply]', box) ? $('[data-reply]', box).value : '';
      box.innerHTML = '<div class="ch-head"><h2>Розмова #' + s.id + '</h2><span class="pill st-' + esc(s.state) + '">' + esc(ST[s.state] || s.state) + '</span>' +
        '<span>' + esc((s.lang || '').toUpperCase()) + ' · ' + esc(s.page || '/') + (s.ref_host ? ' · з ' + esc(s.ref_host) : '') + ' · почали ' + when(s.created_at) + '</span>' +
        (lead ? '<span class="pill on">Заявка ' + esc(lead.number || '#' + lead.id) + '</span>' : '') + '</div>' +
        '<ol class="ch-msgs" data-msgs>' + d.messages.map(msgHtml).join('') + '</ol>' +
        (d.can_reply ? '<form class="ch-reply" data-form><label for="chReply">Відповідь людини (бот у цій розмові замовкне, доки не повернете йому)</label>' +
          '<textarea id="chReply" data-reply rows="3" maxlength="8000" placeholder="Напишіть відповідь відвідувачу…"></textarea>' +
          '<div class="row"><button class="btn main" type="submit">Надіслати</button>' +
          (s.state !== 'bot' ? '<button type="button" class="btn ghost" data-state="bot">Повернути боту</button>' : '') +
          (s.state !== 'closed' ? '<button type="button" class="btn ghost" data-state="closed">Закрити розмову</button>' : '') +
          (!lead ? '<button type="button" class="btn ghost" data-lead>Створити заявку</button>' : '') + '</div></form>' : '<p class="muted">Відповідати можуть власник і менеджер (право «Чат на сайті: відповідати»).</p>');
      var ms = d.messages;
      $$('.ch-m', box).forEach(function (li, i) {
        var m = ms[i];
        $$('[data-f]', li).forEach(function (b) { b.onclick = function () { download(m.files[+b.dataset.f]); }; });
        var p = $('[data-a]', li);
        if (p) p.onclick = function () {
          p.disabled = true;
          blobOf(p.dataset.a).then(function (b) { var a = document.createElement('audio'); a.controls = true; a.src = URL.createObjectURL(b); p.replaceWith(a); a.play().catch(function () { /* без автозапуску — є кнопки */ }); },
            function (e) { p.disabled = false; toast(e.message, true); });
        };
      });
      last = ms.length ? ms[ms.length - 1].id : 0;
      var list = $('[data-msgs]', box); list.scrollTop = list.scrollHeight;
      var f = $('[data-form]', box);
      if (!f) return;
      var ta = $('[data-reply]', f); ta.value = keep;
      f.onsubmit = function (ev) {
        ev.preventDefault();
        var text = ta.value.trim(); if (!text) { ta.focus(); return; }
        var b = $('button[type=submit]', f); b.disabled = true;
        api(CAPI, { method: 'POST', body: { id: s.id, text: text } }).then(function () { ta.value = ''; toast('Відповідь надіслано'); reload(); }, function (e) { toast(e.message, true); }).then(function () { b.disabled = false; });
      };
      $$('[data-state]', f).forEach(function (b) { b.onclick = function () {
        api(CAPI, { method: 'PATCH', body: { id: s.id, state: b.dataset.state } }).then(function () { toast(b.dataset.state === 'bot' ? 'Розмову повернуто боту' : 'Розмову закрито'); reload(); }, function (e) { toast(e.message, true); });
      }; });
      var lb = $('[data-lead]', f);
      if (lb) lb.onclick = function () {
        var phone = prompt('Телефон відвідувача (необовʼязково — можна створити заявку й без нього):', '');
        if (phone === null) return;
        api(CAPI, { method: 'POST', body: { id: s.id, action: 'lead', phone: phone.trim() || undefined } }).then(function (r) { toast('Заявку ' + r.number + ' створено — вона в CRM'); reload(); }, function (e) { toast(e.message, true); });
      };
    }
    function reload() {
      return api(CAPI + '?id=' + id).then(function (d) {
        var ta = $('[data-reply]', L);
        // не перемальовуємо, поки людина друкує, якщо нового немає
        var nl = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
        if (s && nl === last && s.state === d.session.state && ta && document.activeElement === ta) return;
        render(d);
      }, function (e) { $('[data-card]', L).innerHTML = '<p class="err">' + esc(e.message) + '</p>'; clearInterval(timer); });
    }
    reload();
    timer = setInterval(function () { if (!document.contains(L)) { clearInterval(timer); return; } if (!document.hidden) reload(); }, 10000);
  }

  function tabBadge(n) {
    var b = document.querySelector('.adm-tabs button[data-t="chat"]');
    if (!b) return;
    var i = b.querySelector('.tab-n');
    if (!n) { if (i) i.remove(); return; }
    if (!i) { i = document.createElement('i'); i.className = 'tab-n'; b.appendChild(i); }
    i.textContent = n; i.setAttribute('aria-label', 'непрочитаних: ' + n);
  }

  window.CASChatAdm = {
    tabs: [{ key: 'chat', label: 'Чат', perms: ['chat.view'], after: 'crm', render: listTab }],
    estimateHtml: estimateHtml,
    started: function () {
      var tick = function () { if (!document.hidden) api(CAPI + '?limit=1').then(function (d) { tabBadge(d.counts && d.counts.unread); }, function () { /* noop */ }); };
      tick(); setInterval(tick, 60000);
    },
  };
})();
