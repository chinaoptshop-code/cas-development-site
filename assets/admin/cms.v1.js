/* CAS Development — адмінка /kabinet/admin: CRM, замовлення, клієнти, коди партнерів і редактор контенту сайту.
   Дані CRM — D1 (/api/admin/crm, orders, clients, partner-codes). Контент — файли репозиторію через /api/admin/repo
   (сервер пише в GitHub одним комітом; після коміту GitHub Actions перезбирає й викладає сайт за 2–4 хв).
   Інструкція для власника — tools/admin/README.md. */
(function () {
  'use strict';
  var A, box, REPO = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (n, cur) { return n == null ? 'за запитом' : new Intl.NumberFormat('uk-UA').format(n) + ' ' + ({ USD: '$', EUR: '€' }[cur] || '₴'); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var val = function (sel, root) { var e = (root || document).querySelector(sel); return e ? e.value : ''; };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var rand = function (n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, n); };
  var debounce = function (fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms || 300); }; };

  function toast(msg, err) {
    var t = document.createElement('div');
    t.className = 'adm-toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, err ? 7000 : 4000);
  }
  function api(path, opts) { return A.api(path, opts); }

  // ===================== репозиторій (GitHub через сервер) =====================
  var repo = {
    status: function () { return REPO ? Promise.resolve(REPO) : api('/api/admin/repo?op=status').then(function (d) { REPO = d; return d; }, function (e) { REPO = { token: false, message: e.message }; return REPO; }); },
    list: function (dir) { return api('/api/admin/repo?op=list&dir=' + encodeURIComponent(dir)); },
    file: function (path) { return api('/api/admin/repo?op=file&path=' + encodeURIComponent(path)); },
    save: function (message, files, deletes, expect) {
      return api('/api/admin/repo', { method: 'POST', body: { op: 'save', message: message, files: files || [], deletes: deletes || [], expect: expect || {} } })
        .then(function (d) {
          toast(d.unchanged ? 'Змін немає — нічого не збережено' : 'Збережено. Сайт оновиться за 2–4 хвилини (вкладка «Історія» — статус).');
          return d;
        }, function (e) { toast(e.message, true); throw e; });
    },
    raw: function (path) { return REPO && REPO.head ? 'https://raw.githubusercontent.com/' + REPO.repo + '/' + REPO.head + '/' + path : '/' + path; },
  };
  function needToken(L) {
    return repo.status().then(function (s) {
      if (s.token) return true;
      L.innerHTML = '<div class="note"><b>Редагування сайту вимкнене — потрібен токен GitHub.</b><br>' + esc(s.message || '') +
        '<br>Покрокова інструкція: <code>tools/admin/README.md</code>, розділ «Токен GitHub». CRM, замовлення й клієнти працюють і без нього.</div>';
      return false;
    });
  }
  // JSON у тому ж форматі, що й файл (компактний / з відступом, перенос рядка в кінці) — щоб у Git була видна лише суть змін
  function stringifyLike(orig, obj) {
    var nl = /\n$/.test(orig || '');
    if (orig && !/\n/.test(orig.trim())) return JSON.stringify(obj) + (nl ? '\n' : '');
    var m = (orig || '').match(/\n( +)"/), ind = m ? m[1].length : 1;
    return JSON.stringify(obj, null, ind) + (nl || !orig ? '\n' : '');
  }

  // ===================== зображення: canvas → WebP =====================
  function readB64(blob) {
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = no; r.readAsDataURL(blob); });
  }
  function bitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { no(new Error('Не вдалося прочитати фото')); }; i.src = URL.createObjectURL(file); });
  }
  // opts: {width} — до цієї ширини без збільшення; {square, margin} — квадрат з прозорим полем (фото товарів)
  function toWebp(img, opts) {
    var w = img.width, h = img.height, c = document.createElement('canvas'), x = c.getContext('2d');
    if (opts.square) {
      var S = opts.square, inner = S * (1 - 2 * (opts.margin || 0)), k = Math.min(inner / w, inner / h, 1e9);
      c.width = c.height = S;
      x.drawImage(img, (S - w * k) / 2, (S - h * k) / 2, w * k, h * k);
    } else {
      var k2 = Math.min(1, opts.width / w);
      c.width = Math.round(w * k2); c.height = Math.round(h * k2);
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, c.width, c.height);
    }
    return new Promise(function (ok, no) {
      c.toBlob(function (b) {
        if (!b || b.type !== 'image/webp') return no(new Error('Браузер не вміє зберігати WebP — відкрийте адмінку в Chrome, Edge або Firefox'));
        readB64(b).then(function (b64) { ok({ b64: b64, w: c.width, h: c.height, url: URL.createObjectURL(b) }); });
      }, 'image/webp', opts.q || 0.84);
    });
  }
  var slugName = function (s) {
    var tr = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '' };
    return String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').split('').map(function (c) { return tr[c] != null ? tr[c] : c; }).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'foto';
  };
  // Фото для сторінок/статей: <dir>/<name>-<hash>-900.webp і -400.webp
  function makePhoto(file, dir) {
    return bitmap(file).then(function (img) {
      var base = dir + '/' + slugName(file.name) + '-' + rand(6);
      return Promise.all([toWebp(img, { width: 900 }), toWebp(img, { width: 400 })]).then(function (r) {
        return { base: base, src: '/' + base + '-900.webp', w: r[0].w, h: r[0].h, preview: r[0].url,
          files: [{ path: base + '-900.webp', content: r[0].b64, encoding: 'base64' }, { path: base + '-400.webp', content: r[1].b64, encoding: 'base64' }] };
      });
    });
  }
  // Фото товару: квадрат 800/400, прозорий фон, поле 6% (як tools/products/photo.py, але без вирізання фону)
  function makeProductPhoto(file, id) {
    return bitmap(file).then(function (img) {
      var base = 'img/products/' + id + '-' + rand(6);
      return Promise.all([toWebp(img, { square: 800, margin: 0.06 }), toWebp(img, { square: 400, margin: 0.06 })]).then(function (r) {
        return { base: base, preview: r[0].url, files: [{ path: base + '-800.webp', content: r[0].b64, encoding: 'base64' }, { path: base + '-400.webp', content: r[1].b64, encoding: 'base64' }] };
      });
    });
  }
  function pickFiles(multiple, accept) {
    return new Promise(function (ok) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = accept || 'image/jpeg,image/png,image/webp,image/avif'; i.multiple = !!multiple;
      i.onchange = function () { ok(Array.prototype.slice.call(i.files)); }; i.click();
    });
  }

  // ===================== JSON-редактор (форма для будь-якої структури) =====================
  function jsonEditor(root, data, onChange) {
    var changed = function () { if (onChange) onChange(); };
    function input(val, set) {
      var long = typeof val === 'string' && (val.length > 70 || /\n/.test(val));
      var el = document.createElement(long ? 'textarea' : 'input');
      if (typeof val === 'number') { el.type = 'number'; el.step = 'any'; }
      el.value = val == null ? '' : val;
      if (long) el.rows = Math.min(10, Math.max(2, Math.ceil(String(val).length / 90)));
      el.oninput = function () { set(typeof val === 'number' ? (el.value === '' ? null : +el.value) : el.value); changed(); };
      return el;
    }
    function node(val, set) {
      if (val === null) { var n = input('', function (v) { set(v === '' ? null : v); }); n.placeholder = 'порожньо (null)'; return n; }
      if (typeof val === 'boolean') {
        var l = document.createElement('label'); l.className = 'chk'; l.innerHTML = '<input type="checkbox"' + (val ? ' checked' : '') + '> так';
        l.firstChild.onchange = function () { set(l.firstChild.checked); changed(); }; return l;
      }
      if (Array.isArray(val)) return arr(val);
      if (typeof val === 'object') return obj(val);
      return input(val, set);
    }
    function tools(onUp, onDown, onDel) {
      var t = document.createElement('span'); t.className = 'je-tools';
      [['↑', onUp, 'Вище'], ['↓', onDown, 'Нижче'], ['✕', onDel, 'Видалити']].forEach(function (b) {
        if (!b[1]) return; var x = document.createElement('button'); x.type = 'button'; x.textContent = b[0]; x.title = b[2]; x.onclick = b[1]; t.appendChild(x);
      });
      return t;
    }
    function blank(v) {
      if (Array.isArray(v)) return v.length ? [blank(v[0])].concat(v.slice(1).map(blank)).slice(0, v.length) : [];
      if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = blank(v[k]); }); return o; }
      return typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : v === null ? null : '';
    }
    function arr(a) {
      var w = document.createElement('div'); w.className = 'je-a';
      function draw() {
        w.innerHTML = '';
        a.forEach(function (v, i) {
          var r = document.createElement('div'); r.className = 'je-i';
          var n = document.createElement('i'); n.textContent = i + 1; r.appendChild(n);
          r.appendChild(node(v, function (x) { a[i] = x; }));
          r.appendChild(tools(i > 0 ? function () { a.splice(i - 1, 0, a.splice(i, 1)[0]); draw(); changed(); } : null,
            i < a.length - 1 ? function () { a.splice(i + 1, 0, a.splice(i, 1)[0]); draw(); changed(); } : null,
            function () { if (typeof a[i] !== 'object' || a[i] === null || confirm('Видалити цей елемент?')) { a.splice(i, 1); draw(); changed(); } }));
          w.appendChild(r);
        });
        var add = document.createElement('button'); add.type = 'button'; add.className = 'je-add'; add.textContent = '+ додати';
        add.onclick = function () { a.push(a.length ? blank(a[a.length - 1]) : ''); draw(); changed(); };
        w.appendChild(add);
      }
      draw(); return w;
    }
    function obj(o) {
      var w = document.createElement('div'); w.className = 'je-o';
      function draw() {
        w.innerHTML = '';
        Object.keys(o).forEach(function (k) {
          var r = document.createElement('div'); r.className = 'je-k';
          var b = document.createElement('b'); b.textContent = k; r.appendChild(b);
          var holder = document.createElement('div'); holder.appendChild(node(o[k], function (x) { o[k] = x; })); r.appendChild(holder);
          r.appendChild(tools(null, null, function () { if (confirm('Видалити поле «' + k + '»?')) { delete o[k]; draw(); changed(); } }));
          w.appendChild(r);
        });
        var add = document.createElement('button'); add.type = 'button'; add.className = 'je-add'; add.textContent = '+ поле';
        add.onclick = function () { var k = prompt('Назва поля (латиницею, як у інших сторінках):'); if (k && !(k in o)) { o[k] = ''; draw(); changed(); } };
        w.appendChild(add);
      }
      draw(); return w;
    }
    root.innerHTML = ''; root.classList.add('je');
    root.appendChild(node(data, function () {}));
  }
  // Редактор JSON-файлу: форма ↔ сирий JSON, перевірка перед збереженням
  function fileEditor(L, path, opts) {
    opts = opts || {};
    L.innerHTML = '<p class="muted">Завантаження ' + esc(path) + '…</p>';
    return repo.file(path).then(function (f) {
      if (f.content == null) { L.innerHTML = '<p class="err">Файл не знайдено</p>'; return; }
      var data = JSON.parse(f.content), mode = 'form';
      L.innerHTML = '<div class="tb"><button class="btn ghost sm" data-back>← До списку</button><b class="grow">' + esc(path) + '</b>' +
        '<span class="seg"><button aria-pressed="true" data-m="form">Форма</button><button aria-pressed="false" data-m="raw">JSON</button></span></div>' +
        (opts.hint ? '<div class="note">' + opts.hint + '</div>' : '') +
        '<div data-ed></div><div class="stick row"><input class="grow" data-msg placeholder="Що змінено (для історії), напр. «ціна на ремонт кухні»">' +
        (opts.extra || '') + '<button class="btn" data-save>Зберегти</button><span data-st class="muted"></span></div>';
      var ed = $('[data-ed]', L), st = $('[data-st]', L);
      function draw() {
        if (mode === 'form') jsonEditor(ed, data, function () { st.textContent = 'є незбережені зміни'; });
        else {
          ed.innerHTML = '<textarea class="code" spellcheck="false"></textarea><p class="err" data-je></p>';
          var ta = $('textarea', ed); ta.value = JSON.stringify(data, null, 1);
          ta.oninput = function () { try { data = JSON.parse(ta.value); $('[data-je]', ed).textContent = ''; } catch (e) { $('[data-je]', ed).textContent = 'Помилка JSON: ' + e.message; } st.textContent = 'є незбережені зміни'; };
        }
      }
      draw();
      $$('[data-m]', L).forEach(function (b) { b.onclick = function () {
        if (mode === 'raw' && $('[data-je]', ed).textContent) return toast('Спершу виправте помилку JSON', true);
        mode = b.dataset.m; $$('[data-m]', L).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); draw();
      }; });
      $('[data-back]', L).onclick = function () { if (!/незбережені/.test(st.textContent) || confirm('Вийти без збереження?')) opts.back(); };
      $('[data-save]', L).onclick = function () {
        if (mode === 'raw' && $('[data-je]', ed).textContent) return toast('Спершу виправте помилку JSON', true);
        var err = opts.validate && opts.validate(data);
        if (err) return toast(err, true);
        var e = {}; e[path] = f.sha;
        var btn = this; btn.disabled = true;
        repo.save((val('[data-msg]', L) || 'правка ' + path.split('/').pop()), [{ path: path, content: stringifyLike(f.content, data) }], [], e)
          .then(function () { st.textContent = 'збережено'; return fileEditor(L, path, opts); }, function () { btn.disabled = false; });
      };
      if (opts.after) opts.after(L, function () { return data; }, f);
    });
  }

  // ===================== вкладки =====================
  var TABS = [
    ['crm', 'CRM'], ['orders', 'Замовлення Оздоби'], ['clients', 'Клієнти'], ['codes', 'Коди партнерів'],
    ['products', 'Товари'], ['blog', 'Блог'], ['landings', 'Лендинги'], ['lang', 'Меню й футер'], ['pages', 'Сторінки'], ['media', 'Медіа'], ['history', 'Історія'],
  ];
  var RENDER = {};

  function start() {
    box.className = 'adm';
    box.innerHTML = '<nav class="adm-tabs" aria-label="Розділи адмінки">' + TABS.map(function (t) { return '<button type="button" data-t="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>'; }).join('') + '</nav><div id="admView"></div>';
    var view = $('#admView');
    function open(t) {
      if (!RENDER[t]) t = 'crm';
      $$('.adm-tabs button', box).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.t === t); });
      try { history.replaceState(null, '', '#' + t); } catch (e) { /* noop */ }
      view.innerHTML = '';
      var L = document.createElement('div'); view.appendChild(L);
      Promise.resolve(RENDER[t](L)).catch(function (e) { L.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    $$('.adm-tabs button', box).forEach(function (b) { b.onclick = function () { open(b.dataset.t); }; });
    open(location.hash.slice(1) || 'crm');
  }

  // ---------- CRM ----------
  RENDER.crm = function (L) {
    var S = { view: localStorage.getItem('crmView') || 'kanban', kind: '', status: '', assignee: '', due: false, q: '' }, ST = {}, rows = [], AS = [];
    L.innerHTML = '<div class="tb">' +
      '<span class="seg"><button data-v="kanban">Канбан</button><button data-v="table">Таблиця</button></span>' +
      '<select data-f="kind" aria-label="Тип"><option value="">Замовлення й заявки</option><option value="order">Лише замовлення</option><option value="lead">Лише заявки</option></select>' +
      '<select data-f="status" aria-label="Статус"><option value="">Усі статуси</option><option value="open">Відкриті</option></select>' +
      '<select data-f="assignee" aria-label="Відповідальний"><option value="">Усі відповідальні</option></select>' +
      '<label class="chk"><input type="checkbox" data-f="due"> звʼязатися сьогодні</label>' +
      '<input class="grow" data-f="q" placeholder="Пошук: номер, телефон, імʼя, нотатки">' +
      '<button class="btn" data-new>+ Заявка</button><a class="btn ghost" data-csv href="#">CSV</a></div><div data-list></div>' +
      '<dialog data-dlg></dialog><datalist id="crmAs"></datalist>';
    var list = $('[data-list]', L), dlg = $('[data-dlg]', L);
    function qs(csv) {
      return '/api/admin/crm?kind=' + S.kind + '&status=' + S.status + '&assignee=' + encodeURIComponent(S.assignee) + '&due=' + (S.due ? 1 : '') + '&q=' + encodeURIComponent(S.q) + (csv ? '&format=csv' : '');
    }
    function segs() { $$('[data-v]', L).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === S.view); }); $('[data-csv]', L).href = qs(true); }
    $$('[data-v]', L).forEach(function (b) { b.onclick = function () { S.view = b.dataset.v; try { localStorage.setItem('crmView', S.view); } catch (e) { /* noop */ } segs(); draw(); }; });
    $$('[data-f]', L).forEach(function (el) {
      var k = el.dataset.f;
      el[k === 'q' ? 'oninput' : 'onchange'] = (k === 'q' ? debounce : function (f) { return f; })(function () { S[k] = el.type === 'checkbox' ? el.checked : el.value; segs(); load(); });
    });
    $('[data-new]', L).onclick = function () { edit(null); };
    var isDue = function (r) { return r.next_contact && r.next_contact <= today() && r.status !== 'delivered' && r.status !== 'cancelled'; };
    var label = function (r) { return r.name || r.phone || r.email || '—'; };
    var what = function (r) { return r.service || (r.items || []).map(function (i) { return i.name + ' × ' + i.qty; }).join(', '); };
    function load() {
      return api(qs()).then(function (d) {
        ST = d.statuses; rows = d.rows; AS = d.assignees;
        var fs = $('[data-f=status]', L);
        if (fs.options.length < 3) Object.keys(ST).forEach(function (k) { fs.add(new Option(ST[k], k)); });
        var fa = $('[data-f=assignee]', L), cur = fa.value;
        fa.length = 1; AS.forEach(function (a) { fa.add(new Option(a, a)); }); fa.value = cur;
        $('#crmAs').innerHTML = AS.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
        draw();
      });
    }
    function card(r) {
      return '<div class="kn-card" draggable="true" data-id="' + r.id + '"><span class="row" style="justify-content:space-between"><b>' + esc(r.number) + '</b><span class="pill' + (r.kind === 'lead' ? '' : ' on') + '">' + (r.kind === 'lead' ? 'заявка' : 'замовлення') + '</span></span>' +
        '<span>' + esc(label(r)) + (r.phone && r.name ? ' · ' + esc(r.phone) : '') + '</span>' +
        (what(r) ? '<small>' + esc(what(r).slice(0, 90)) + '</small>' : '') +
        '<span>' + ((r.amount != null || r.total != null) ? '<b>' + money(r.amount != null ? r.amount : r.total, r.currency) + '</b> ' : '') + (r.assignee ? '· ' + esc(r.assignee) : '') + '</span>' +
        (r.next_contact ? '<small class="' + (isDue(r) ? 'due' : '') + '">↻ ' + esc(r.next_contact) + '</small>' : '') + '</div>';
    }
    function draw() {
      if (!rows.length) { list.innerHTML = '<p class="muted">Записів немає. Нові замовлення з Оздоби зʼявляються тут автоматично; заявки — з форм сайту (див. README) або кнопкою «+ Заявка».</p>'; return; }
      if (S.view === 'table') {
        list.innerHTML = '<div class="tscroll"><table class="adm"><tr><th>Номер</th><th>Дата</th><th>Клієнт</th><th>Що</th><th>Сума</th><th>Статус</th><th>Відповідальний</th><th>Контакт</th></tr>' + rows.map(function (r) {
          return '<tr class="clk" data-id="' + r.id + '"><td><b>' + esc(r.number) + '</b><br><small>' + (r.kind === 'lead' ? 'заявка' : 'замовлення') + '</small></td><td><small>' + esc(r.created_at) + '</small></td>' +
            '<td>' + esc(label(r)) + '<br><small>' + esc(r.phone) + ' ' + esc(r.email) + '</small></td><td><small>' + esc(what(r).slice(0, 120)) + '</small></td>' +
            '<td>' + (r.amount != null || r.total != null ? money(r.amount != null ? r.amount : r.total, r.currency) : '') + '</td>' +
            '<td><select data-st aria-label="Статус">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></td>' +
            '<td>' + esc(r.assignee) + '</td><td class="' + (isDue(r) ? 'err' : '') + '">' + esc(r.next_contact) + '</td></tr>';
        }).join('') + '</table></div>';
        $$('tr.clk', list).forEach(function (tr) {
          tr.onclick = function (e) { if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') edit(+tr.dataset.id); };
          $('[data-st]', tr).onchange = function () { patch({ id: +tr.dataset.id, status: this.value }); };
        });
        return;
      }
      var cols = S.status && ST[S.status] ? [S.status] : Object.keys(ST);
      list.innerHTML = '<div class="kn">' + cols.map(function (k) {
        var rs = rows.filter(function (r) { return r.status === k || (!ST[r.status] && k === 'new'); });
        var sum = rs.reduce(function (s, r) { return s + ((r.currency || 'UAH') === 'UAH' ? (r.amount != null ? r.amount : r.total || 0) : 0); }, 0);
        return '<section class="kn-col" data-col="' + k + '"><h3><span>' + ST[k] + ' · ' + rs.length + '</span><small>' + (sum ? money(sum) : '') + '</small></h3>' + rs.map(card).join('') + '</section>';
      }).join('') + '</div>';
      $$('.kn-card', list).forEach(function (c) {
        c.onclick = function () { edit(+c.dataset.id); };
        c.ondragstart = function (e) { e.dataTransfer.setData('text/plain', c.dataset.id); };
      });
      $$('.kn-col', list).forEach(function (col) {
        col.ondragover = function (e) { e.preventDefault(); col.classList.add('over'); };
        col.ondragleave = function () { col.classList.remove('over'); };
        col.ondrop = function (e) { e.preventDefault(); col.classList.remove('over'); var id = +e.dataTransfer.getData('text/plain'); if (id) patch({ id: id, status: col.dataset.col }); };
      });
    }
    function patch(body) { return api('/api/admin/crm', { method: 'PATCH', body: body }).then(load, function (e) { toast(e.message, true); }); }
    function edit(id) {
      var r = id ? rows.find(function (x) { return x.id === id; }) : { kind: 'lead', status: 'new', currency: 'UAH' };
      var f = function (k) { return esc(r[k] == null ? '' : r[k]); };
      dlg.innerHTML = '<form method="dialog" class="form two"><h2 class="full">' + (id ? esc(r.number) + ' · ' + (r.kind === 'lead' ? 'заявка' : 'замовлення') : 'Нова заявка') + '</h2>' +
        (id ? '<p class="full muted">' + esc(r.created_at) + (r.source ? ' · ' + esc(r.source) : '') + (r.username ? ' · @' + esc(r.username) : '') + '</p>' +
          (what(r) ? '<p class="full">' + esc(what(r)) + '</p>' : '') + (r.comment ? '<p class="full muted" style="white-space:pre-wrap">' + esc(r.comment) + '</p>' : '') +
          (r.kind === 'order' ? '<p class="full muted">Сума замовлення: ' + money(r.total) + (r.on_request ? ' + ' + r.on_request + ' поз. за запитом' : '') + ' · оплата: ' + esc(r.payment) + (r.delivery ? ' · ' + esc(r.delivery) : '') + '</p>' : '')
          : '<label class="f"><span>Імʼя</span><input name="name"></label><label class="f"><span>Телефон</span><input name="phone" type="tel"></label>' +
          '<label class="f"><span>Email</span><input name="email" type="email"></label><label class="f"><span>Джерело</span><input name="source" placeholder="дзвінок, Instagram, рекомендація"></label>' +
          '<label class="f full"><span>Послуга / що потрібно</span><input name="service"></label><label class="f full"><span>Коментар</span><textarea name="comment"></textarea></label>') +
        '<label class="f"><span>Статус</span><select name="status">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></label>' +
        '<label class="f"><span>Відповідальний</span><input name="assignee" list="crmAs" value="' + f('assignee') + '"></label>' +
        '<label class="f"><span>Сума угоди</span><span class="row"><input name="amount" type="number" min="0" step="1" class="grow" value="' + f('amount') + '" placeholder="' + (r.total != null ? r.total : '') + '">' +
        '<select name="currency">' + ['UAH', 'USD', 'EUR'].map(function (c) { return '<option' + (c === (r.currency || 'UAH') ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></span></label>' +
        '<label class="f"><span>Наступний контакт</span><input name="next_contact" type="date" value="' + f('next_contact') + '"></label>' +
        '<label class="f full"><span>Нотатки (бачать лише менеджери)</span><textarea name="crm_note">' + f('crm_note') + '</textarea></label>' +
        (r.kind === 'order' ? '<label class="f full"><span>Нотатка для клієнта (видно в його кабінеті)</span><input name="manager_note" value="' + f('manager_note') + '"></label>' : '') +
        (id ? '<label class="f full"><span>Коментар до зміни (в історію)</span><input name="note"></label>' : '') +
        '<div class="full row"><button class="btn" value="save">Зберегти</button><button class="btn ghost" value="cancel" formnovalidate>Закрити</button><span class="err" data-e></span></div>' +
        (id ? '<ul class="ev full" data-ev><li>Історія…</li></ul>' : '') + '</form>';
      var form = $('form', dlg);
      form.onsubmit = function (e) {
        if (e.submitter && e.submitter.value === 'cancel') return;
        e.preventDefault();
        var b = {}; new FormData(form).forEach(function (v, k) { b[k] = v; });
        var p = id ? api('/api/admin/crm', { method: 'PATCH', body: Object.assign({ id: id }, b) })
          : api('/api/admin/crm', { method: 'POST', body: b }).then(function (d) { if (b.status !== 'new') return api('/api/admin/crm', { method: 'PATCH', body: { id: d.id, status: b.status } }); });
        p.then(function () { dlg.close(); load(); }, function (er) { $('[data-e]', dlg).textContent = er.message; });
      };
      if (id) api('/api/admin/crm?events=' + id).then(function (d) {
        $('[data-ev]', dlg).innerHTML = d.events.map(function (e) { return '<li>' + esc(e.created_at) + ' — ' + esc(e.label) + (e.note ? ': ' + esc(e.note) : '') + ' <small>(' + esc(e.author) + ')</small></li>'; }).join('') || '<li>Подій немає</li>';
      });
      dlg.showModal();
    }
    segs();
    return load();
  };

  // ---------- Замовлення Оздоби (ціни «за запитом», статус, нотатка клієнту) ----------
  RENDER.orders = function (L) {
    var ST = {};
    L.innerHTML = '<div class="tb"><input class="grow" data-q placeholder="Пошук: номер, телефон, імʼя"><select data-s><option value="">Усі статуси</option></select></div><div data-l></div>';
    var LL = $('[data-l]', L);
    $('[data-q]', L).oninput = debounce(load); $('[data-s]', L).onchange = load;
    function load() {
      return api('/api/admin/orders?q=' + encodeURIComponent($('[data-q]', L).value) + '&status=' + $('[data-s]', L).value).then(function (d) {
        ST = d.statuses; var fs = $('[data-s]', L);
        if (fs.options.length < 2) Object.keys(ST).forEach(function (k) { fs.add(new Option(ST[k], k)); });
        var orders = d.orders.filter(function (o) { return o.kind !== 'lead'; });
        if (!orders.length) { LL.innerHTML = '<p class="muted">Замовлень немає.</p>'; return; }
        LL.innerHTML = orders.map(function (o) {
          return '<div class="ord" data-id="' + o.id + '"><div class="ord-h"><b>' + esc(o.number) + '</b><span>' + esc(o.name) + ' · ' + esc(o.phone) + (o.username ? ' · @' + esc(o.username) : '') + '</span><small class="muted">' + esc(o.created_at) + '</small></div><ul>' +
            o.items.map(function (i, n) { return '<li>' + esc(i.name) + ' — ' + esc(i.color) + (i.size ? ', ' + esc(i.size) : '') + ' — ' + i.qty + ' ' + esc(i.unit) + ' × ' + (i.price == null ? '<input data-ix="' + n + '" placeholder="ціна, ₴" style="width:110px">' : money(i.price)) + '</li>'; }).join('') +
            '</ul><div class="tot">Разом: ' + money(o.total) + (o.on_request ? ' + ' + o.on_request + ' за запитом' : '') + (o.discount ? ' · знижка −' + o.discount_pct + '%: −' + money(o.discount) : '') + (o.promo ? ' · код партнера ' + esc(o.promo) : '') + ' · оплата: ' + esc(o.payment) + (o.delivery ? ' · ' + esc(o.delivery) : '') + (o.company ? ' · ' + esc(o.company) : '') + '</div>' +
            '<div class="row" style="margin-top:10px"><select class="s">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select>' +
            '<input class="n grow" placeholder="Нотатка для клієнта" value="' + esc(o.manager_note) + '"><button class="btn sv">Зберегти</button></div></div>';
        }).join('');
        $$('.sv', LL).forEach(function (b) { b.onclick = function () {
          var el = b.closest('.ord'), prices = [];
          $$('[data-ix]', el).forEach(function (i) { if (i.value) prices.push({ index: +i.dataset.ix, price: +i.value }); });
          b.textContent = '…';
          api('/api/admin/orders', { method: 'PATCH', body: { id: +el.dataset.id, status: $('.s', el).value, manager_note: $('.n', el).value, prices: prices } })
            .then(load, function (e) { b.textContent = e.message; });
        }; });
      });
    }
    return load();
  };

  // ---------- Клієнти ----------
  RENDER.clients = function (L) {
    L.innerHTML = '<div class="tb"><input class="grow" data-q placeholder="Пошук: імʼя, телефон, email"></div><div data-l></div>';
    function load() {
      return api('/api/admin/clients?q=' + encodeURIComponent($('[data-q]', L).value)).then(function (d) {
        $('[data-l]', L).innerHTML = '<div class="tscroll"><table class="adm"><tr><th>#</th><th>Клієнт</th><th>Контакти</th><th>Замовлень</th><th>Сума</th><th>Створено</th></tr>' + d.clients.map(function (x) {
          return '<tr><td>' + x.id + '</td><td>' + esc(x.name) + '<br><small>' + esc(x.provider) + (x.username ? ' @' + esc(x.username) : '') + '</small></td><td>' + esc(x.phone) + '<br>' + esc(x.email) + '<br><small>' + esc(x.city) + ' ' + esc(x.company) + '</small></td><td>' + x.orders + '</td><td>' + money(x.total) + '</td><td><small>' + esc(x.created_at) + '</small></td></tr>';
        }).join('') + '</table></div>';
      });
    }
    $('[data-q]', L).oninput = debounce(load);
    return load();
  };

  // ---------- Коди партнерів ----------
  RENDER.codes = function (L) {
    return api('/api/admin/partner-codes').then(function (d) {
      L.innerHTML = '<form class="tb" data-f><input name="name" class="grow" placeholder="Партнер: імʼя, студія" aria-label="Партнер" required>' +
        '<input name="code" placeholder="Код: авто або свій" aria-label="Код" style="text-transform:uppercase">' +
        '<input name="discount" type="number" min="1" max="30" value="10" aria-label="Знижка, %" style="width:80px">' +
        '<button class="btn" type="submit">Створити код</button><span class="err" data-m></span></form>' +
        '<p class="muted">Знижка партнера не сумується зі знижкою за обсягом — діє більша.</p>' +
        (d.codes.length ? '<div class="tscroll"><table class="adm"><tr><th>Код</th><th>Партнер</th><th>Знижка</th><th>Замовлень</th><th>Створено</th><th></th></tr>' + d.codes.map(function (x) {
          return '<tr' + (x.active ? '' : ' style="opacity:.55"') + '><td><b>' + esc(x.code) + '</b></td><td>' + esc(x.name) + '</td><td>' + x.discount + '%</td><td>' + x.uses + '</td><td><small>' + esc(x.created_at) + '</small></td>' +
            '<td><button class="btn ghost sm" data-code="' + esc(x.code) + '" data-on="' + (x.active ? 0 : 1) + '">' + (x.active ? 'Вимкнути' : 'Увімкнути') + '</button></td></tr>';
        }).join('') + '</table></div>' : '<p class="muted">Кодів ще немає.</p>');
      $('[data-f]', L).onsubmit = function (e) {
        e.preventDefault(); var f = e.target;
        api('/api/admin/partner-codes', { method: 'POST', body: { name: f.name.value, code: f.code.value, discount: +f.discount.value } })
          .then(function () { RENDER.codes(L); }, function (er) { $('[data-m]', L).textContent = er.message; });
      };
      $$('[data-code]', L).forEach(function (b) { b.onclick = function () {
        api('/api/admin/partner-codes', { method: 'PATCH', body: { code: b.dataset.code, active: b.dataset.on === '1' } }).then(function () { RENDER.codes(L); });
      }; });
    });
  };

  // ---------- Товари Оздоби ----------
  var CAT = 'assets/ozdoba/catalog.json', ARCH = 'tools/products/archive.json';
  RENDER.products = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      L.innerHTML = '<p class="muted">Завантаження каталогу…</p>';
      return Promise.all([repo.file(CAT), repo.file(ARCH)]).then(function (r) {
        var st = { cat: r[0], arch: r[1], d: JSON.parse(r[0].content), a: r[1].content ? JSON.parse(r[1].content) : { _doc: 'Приховані товари Оздоби (адмінка /kabinet/admin → Товари → «Приховати»). Не публікуються; «Показати» повертає товар у assets/ozdoba/catalog.json.', items: [] } };
        productList(L, st);
      });
    });
  };
  function bundlesUsing(d, id) { return (d.bundles || []).filter(function (b) { return (b.rows || []).some(function (x) { return x.id === id; }); }).map(function (b) { return b.name; }); }
  function saveCatalog(st, msg, extraFiles) {
    var files = [{ path: CAT, content: stringifyLike(st.cat.content, st.d) }], expect = {};
    expect[CAT] = st.cat.sha;
    var archText = stringifyLike(st.arch.content || '', st.a);
    if (st.arch.content ? archText !== st.arch.content : st.a.items.length) { files.push({ path: ARCH, content: archText }); expect[ARCH] = st.arch.sha; }
    return repo.save(msg, files.concat(extraFiles || []), [], expect);
  }
  function productList(L, st) {
    var d = st.d, cats = [];
    d.items.concat(st.a.items).forEach(function (i) { if (cats.indexOf(i.cat) < 0) cats.push(i.cat); });
    L.innerHTML = '<div class="tb"><input class="grow" data-q placeholder="Пошук: назва, id, опис"><select data-c><option value="">Усі категорії</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<label class="chk"><input type="checkbox" data-h> приховані</label><button class="btn" data-new>+ Товар</button></div>' +
      '<p class="muted">' + d.items.length + ' на сайті · ' + st.a.items.length + ' приховано. Зміни зʼявляться на /ozdoba після перезбірки (2–4 хв).</p><div data-l></div>';
    function draw() {
      if (!$('[data-q]', L)) return; // користувач уже відкрив редактор
      var q = $('[data-q]', L).value.toLowerCase(), c = $('[data-c]', L).value, hid = $('[data-h]', L).checked;
      var src = hid ? st.a.items : d.items;
      var rows = src.filter(function (i) { return (!c || i.cat === c) && (!q || (i.id + ' ' + i.name + ' ' + (i.en || '') + ' ' + (i.desc || '') + ' ' + i.sub).toLowerCase().indexOf(q) >= 0); });
      $('[data-l]', L).innerHTML = '<div class="tscroll"><table class="adm"><tr><th></th><th>id</th><th>Назва</th><th>Категорія</th><th>Ціна</th><th></th></tr>' + rows.slice(0, 400).map(function (i) {
        return '<tr class="clk" data-id="' + i.id + '"><td>' + (i.img ? '<img class="thumb" loading="lazy" src="/' + esc(i.img) + '-400.webp" alt="" width="48" height="48" onerror="this.src=\'' + esc(repo.raw(i.img + '-400.webp')) + '\';this.onerror=null">' : '') + '</td><td>' + i.id + '</td><td>' + esc(i.name) + '<br><small>' + esc(i.sub) + '</small></td><td>' + esc(i.cat) + '</td><td>' + (i.price == null ? 'за запитом' : money(i.price) + ' / ' + esc(i.unit)) + '</td><td>' + (hid ? '<span class="pill warn">приховано</span>' : '') + '</td></tr>';
      }).join('') + '</table></div>' + (rows.length > 400 ? '<p class="muted">Показано 400 — уточніть пошук.</p>' : '');
      $$('tr.clk', L).forEach(function (tr) { tr.onclick = function () { productForm(L, st, +tr.dataset.id); }; });
    }
    $('[data-q]', L).oninput = debounce(draw, 150); $('[data-c]', L).onchange = draw; $('[data-h]', L).onchange = draw;
    $('[data-new]', L).onclick = function () { productForm(L, st, null); };
    draw();
  }
  var KNOWN = ['id', 'cat', 'sub', 'name', 'en', 'unit', 'price', 'art', 'prio', 'desc', 'cs', 'ss', 'vn', 'img', 'imgs', 'specs', 'slug'];
  function productForm(L, st, id) {
    var d = st.d, inCat = d.items.find(function (i) { return i.id === id; }), inArch = st.a.items.find(function (i) { return i.id === id; });
    var orig = inCat || inArch, it;
    if (orig) { it = clone(orig); it.imgs = it.imgs || []; }
    else {
      var max = d.items.concat(st.a.items).reduce(function (m, i) { return Math.max(m, i.id); }, 0);
      it = { id: max + 1, cat: d.items[0].cat, sub: '', name: '', en: '', unit: 'шт', price: null, art: d.items[0].art, prio: 'B', desc: '', cs: Object.keys(d.colorsets)[0], ss: null, vn: [], imgs: [], specs: [] };
    }
    var newFiles = [], cats = [], subs = [];
    d.items.concat(st.a.items).forEach(function (i) { if (cats.indexOf(i.cat) < 0) cats.push(i.cat); if (subs.indexOf(i.sub) < 0) subs.push(i.sub); });
    var opt = function (list, v) { return list.map(function (x) { var k = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x; return '<option value="' + esc(k) + '"' + (k === v ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(''); };
    var extra = {}; Object.keys(it).forEach(function (k) { if (KNOWN.indexOf(k) < 0) extra[k] = it[k]; });
    var hasCustom = d.items.some(function (i) { return 'custom' in i; });
    if (hasCustom && !('custom' in extra)) extra.custom = null;
    L.innerHTML = '<div class="tb"><button class="btn ghost sm" data-back>← До списку</button><b class="grow">' + (orig ? 'Товар #' + it.id : 'Новий товар #' + it.id) + (inArch ? ' <span class="pill warn">прихований</span>' : '') + '</b>' +
      (orig && !inArch ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="/ozdoba/' + esc(it.slug || '') + '">На сайті ↗</a>' : '') + '</div>' +
      '<form class="form two" data-f>' +
      '<label class="f full"><span>Назва</span><input name="name" required value="' + esc(it.name) + '"></label>' +
      '<label class="f"><span>Категорія</span><input name="cat" list="pCats" required value="' + esc(it.cat) + '"><datalist id="pCats">' + opt(cats) + '</datalist></label>' +
      '<label class="f"><span>Підкатегорія (фільтр)</span><input name="sub" list="pSubs" value="' + esc(it.sub) + '"><datalist id="pSubs">' + opt(subs) + '</datalist></label>' +
      '<label class="f"><span>Ціна, ₴ (базова)</span><span class="row"><input name="price" type="number" min="0" step="10" class="grow" value="' + (it.price == null ? '' : it.price) + '"><label class="chk"><input type="checkbox" name="onreq"' + (it.price == null ? ' checked' : '') + '> за запитом</label></span></label>' +
      '<label class="f"><span>Одиниця</span><input name="unit" list="pUnits" required value="' + esc(it.unit) + '"><datalist id="pUnits">' + opt(['шт', 'компл', 'набір', 'м', 'пог. м', 'м²']) + '</datalist></label>' +
      '<label class="f full"><span>Опис</span><textarea name="desc" rows="3">' + esc(it.desc) + '</textarea></label>' +
      '<label class="f"><span>Набір кольорів</span><select name="cs">' + opt(Object.keys(d.colorsets).map(function (k) { return [k, k + ' — ' + d.colorsets[k].map(function (c) { return c[0]; }).slice(0, 3).join(', ') + '…']; }), it.cs) + '</select></label>' +
      '<label class="f"><span>Набір розмірів</span><select name="ss"><option value="">— без розмірів —</option>' + opt(Object.keys(d.sizesets).map(function (k) { return [k, k + ' — ' + d.sizesets[k].map(function (c) { return c[0]; }).join(', ')]; }), it.ss || '') + '</select></label>' +
      '<label class="f"><span>Пріоритет у каталозі</span><select name="prio">' + opt([['A', 'A — ходові, першими'], ['B', 'B'], ['C', 'C — наприкінці']], it.prio) + '</select></label>' +
      '<label class="f"><span>Іконка, поки немає фото</span><select name="art">' + opt(Object.keys(d.art), it.art) + '</select></label>' +
      '<label class="f"><span>Пошук англійською</span><input name="en" value="' + esc(it.en || '') + '"></label>' +
      '<label class="f"><span>Адреса сторінки (slug)</span><input name="slug" value="' + esc(it.slug || '') + '" placeholder="порожньо — створиться з назви"' + (orig && it.slug ? ' readonly title="Не міняйте адресу наявного товару — зламаються посилання"' : '') + '></label>' +
      '<fieldset class="f full" style="border:0;padding:0;margin:0"><span>Тип приміщень</span><div>' + d.venues.filter(function (v) { return v[0] !== 'all'; }).map(function (v) { return '<label class="chk"><input type="checkbox" name="vn" value="' + v[0] + '"' + ((it.vn || []).indexOf(v[0]) >= 0 ? ' checked' : '') + '> ' + esc(v[1]) + '</label>'; }).join('') + '</div></fieldset>' +
      '<div class="f full"><span>Характеристики</span><div data-specs></div></div>' +
      '<div class="f full"><span>Фото <small>(квадрат 800×800, прозорий фон; фон не вирізається — краще фото на білому/прозорому)</small></span><div class="photos" data-ph></div><div class="row"><button type="button" class="btn ghost sm" data-addph>+ Фото</button></div></div>' +
      (Object.keys(extra).length ? '<div class="f full"><span>Додаткові поля' + ('custom' in extra ? ' (custom — опції адаптації: колір, розмір, матеріал під замовлення)' : '') + '</span><div data-extra></div></div>' : '') +
      '</form><div class="stick row">' +
      '<button class="btn" data-save>Зберегти</button>' +
      (orig ? (inArch ? '<button class="btn ghost" data-show>Показати на сайті</button>' : '<button class="btn ghost" data-hide>Приховати</button>') + '<button class="btn danger" data-del>Видалити</button>' : '') +
      '<span class="muted" data-st></span></div>';
    var form = $('[data-f]', L);
    // характеристики
    it.specs = it.specs || [];
    var specs = $('[data-specs]', L);
    function drawSpecs() {
      specs.innerHTML = it.specs.map(function (s, i) { return '<div class="row" style="margin-bottom:6px"><input data-sk="' + i + '" value="' + esc(s[0]) + '" placeholder="Назва (Матеріал)"><input class="grow" data-sv="' + i + '" value="' + esc(s[1]) + '" placeholder="Значення"><button type="button" class="je-add" data-sd="' + i + '">✕</button></div>'; }).join('') + '<button type="button" class="je-add" data-sa>+ характеристика</button>';
      $$('[data-sk]', specs).forEach(function (x) { x.oninput = function () { it.specs[+x.dataset.sk][0] = x.value; }; });
      $$('[data-sv]', specs).forEach(function (x) { x.oninput = function () { it.specs[+x.dataset.sv][1] = x.value; }; });
      $$('[data-sd]', specs).forEach(function (x) { x.onclick = function () { it.specs.splice(+x.dataset.sd, 1); drawSpecs(); }; });
      $('[data-sa]', specs).onclick = function () { it.specs.push(['', '']); drawSpecs(); };
    }
    drawSpecs();
    // фото
    var previews = {};
    var src = function (b) { return previews[b] || '/' + b + '-400.webp'; };
    function drawPh() {
      var all = (it.img ? [it.img] : []).concat(it.imgs || []);
      $('[data-ph]', L).innerHTML = all.map(function (b, i) {
        return '<figure><img src="' + esc(src(b)) + '" alt="" width="110" height="110" onerror="this.src=\'' + esc(repo.raw(b + '-400.webp')) + '\';this.onerror=null"><figcaption>' + (i === 0 ? '<span class="pill on">головне</span>' : '<button type="button" class="je-add" data-main="' + i + '">головне</button>') + '<button type="button" class="je-add" data-rm="' + i + '">✕</button></figcaption></figure>';
      }).join('') || '<p class="muted">Фото немає — на сайті показується іконка.</p>';
      $$('[data-main]', L).forEach(function (b) { b.onclick = function () { var all2 = [it.img].concat(it.imgs), k = +b.dataset.main, x = all2.splice(k, 1)[0]; all2.unshift(x); it.img = all2[0]; it.imgs = all2.slice(1); drawPh(); }; });
      $$('[data-rm]', L).forEach(function (b) { b.onclick = function () { var all2 = [it.img].concat(it.imgs || []).filter(Boolean); all2.splice(+b.dataset.rm, 1); it.img = all2[0] || undefined; it.imgs = all2.slice(1); if (!it.img) delete it.img; drawPh(); }; });
    }
    drawPh();
    $('[data-addph]', L).onclick = function () {
      pickFiles(true).then(function (fs) {
        $('[data-st]', L).textContent = 'Обробка фото…';
        return fs.reduce(function (p, f) { return p.then(function () { return makeProductPhoto(f, it.id).then(function (ph) {
          newFiles = newFiles.concat(ph.files); previews[ph.base] = ph.preview;
          if (!it.img) it.img = ph.base; else (it.imgs = it.imgs || []).push(ph.base);
        }); }); }, Promise.resolve()).then(function () { $('[data-st]', L).textContent = 'Фото додано — натисніть «Зберегти»'; drawPh(); });
      }).catch(function (e) { toast(e.message, true); });
    };
    if ($('[data-extra]', L)) jsonEditor($('[data-extra]', L), extra);
    $('[data-back]', L).onclick = function () { productList(L, st); };
    function collect() {
      var fd = new FormData(form);
      ['name', 'cat', 'sub', 'unit', 'desc', 'cs', 'prio', 'art', 'en'].forEach(function (k) { it[k] = String(fd.get(k) || '').trim(); });
      it.ss = fd.get('ss') || null;
      it.price = fd.get('onreq') || fd.get('price') === '' ? null : Math.round(+fd.get('price'));
      it.vn = fd.getAll('vn');
      var sl = String(fd.get('slug') || '').trim(); if (sl) it.slug = sl; else delete it.slug;
      it.specs = it.specs.filter(function (s) { return s[0].trim() && s[1].trim(); });
      if (!it.imgs) it.imgs = [];
      Object.keys(extra).forEach(function (k) { if (extra[k] === null || extra[k] === '') delete it[k]; else it[k] = extra[k]; });
      if (!it.name) return 'Вкажіть назву';
      if (!it.cat || !it.unit) return 'Вкажіть категорію й одиницю';
      if (it.slug && !/^[a-z0-9-]+$/.test(it.slug)) return 'Адреса (slug) — лише латиниця, цифри й дефіс';
      if (it.slug && d.items.concat(st.a.items).some(function (x) { return x.id !== it.id && x.slug === it.slug; })) return 'Така адреса вже є в іншого товару';
      return null;
    }
    $('[data-save]', L).onclick = function () {
      var err = collect(); if (err) return toast(err, true);
      var list = inArch ? st.a.items : d.items, i = list.findIndex(function (x) { return x.id === it.id; });
      if (i >= 0) list[i] = it; else d.items.push(it);
      this.disabled = true;
      saveCatalog(st, (orig ? 'товар #' + it.id + ' ' : 'новий товар #' + it.id + ' ') + it.name, newFiles).then(function () { RENDER.products(L); }, function () { RENDER.products(L); });
    };
    var move = function (from, to, msg) {
      var used = bundlesUsing(d, it.id);
      if (from === d.items && used.length) return toast('Товар входить у комплекти: ' + used.join(', ') + '. Спершу приберіть його з комплектів (вкладка «Лендинги» не підходить — правка catalog.json → bundles через розробника або JSON).', true);
      var i = from.findIndex(function (x) { return x.id === it.id; }); if (i < 0) return;
      var x = from.splice(i, 1)[0]; if (to) to.push(x);
      return saveCatalog(st, msg + ' #' + it.id + ' ' + it.name).then(function () { RENDER.products(L); }, function () { RENDER.products(L); });
    };
    if ($('[data-hide]', L)) $('[data-hide]', L).onclick = function () { if (confirm('Прибрати «' + it.name + '» з сайту? Його можна буде повернути («приховані»).')) move(d.items, st.a.items, 'приховано товар'); };
    if ($('[data-show]', L)) $('[data-show]', L).onclick = function () { move(st.a.items, d.items, 'повернуто на сайт товар'); };
    if ($('[data-del]', L)) $('[data-del]', L).onclick = function () {
      if (prompt('Видалити товар назавжди? Напишіть «так», щоб підтвердити.\n' + it.name) !== 'так') return;
      move(inArch ? st.a.items : d.items, null, 'видалено товар');
    };
  }

  // ---------- Блог ----------
  var LANGS = ['uk', 'ru', 'en', 'pl', 'es', 'zh', 'de', 'fr', 'ar'];
  var AD = 'tools/blog/articles', DD = 'tools/blog/drafts';
  RENDER.blog = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      L.innerHTML = '<p class="muted">Завантаження статей…</p>';
      return Promise.all([repo.list(AD), repo.list(DD)]).then(function (r) {
        var items = r[1].files.filter(function (f) { return /\.json$/.test(f.name); }).map(function (f) { return { path: f.path, name: f.name, draft: true }; })
          .concat(r[0].files.filter(function (f) { return /\.json$/.test(f.name); }).map(function (f) { return { path: f.path, name: f.name, draft: false }; }));
        L.innerHTML = '<div class="tb"><input class="grow" data-q placeholder="Пошук за назвою"><select data-l><option value="">Усі мови</option>' + LANGS.map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select><button class="btn" data-new>+ Стаття</button></div>' +
          '<div class="note">Чернетки (<code>tools/blog/drafts/</code>) на сайт не потрапляють. «Опублікувати» переносить статтю в <code>tools/blog/articles/</code> — сайт перезбирається сам. Ціни й факти — лише підтверджені (правила — <code>tools/blog/WRITE.md</code>).</div><div data-list></div>';
        var meta = {};
        function langOf(it) { var m = it.name.match(/^([a-z]{2})-/); return meta[it.path] ? meta[it.path].lang : m && LANGS.indexOf(m[1]) > 1 ? m[1] : ''; }
        function draw() {
          if (!$('[data-q]', L)) return; // користувач уже відкрив редактор
          var q = $('[data-q]', L).value.toLowerCase(), lg = $('[data-l]', L).value;
          var rows = items.filter(function (it) { var t = (meta[it.path] && meta[it.path].title || it.name).toLowerCase(); return (!q || t.indexOf(q) >= 0 || it.name.indexOf(q) >= 0) && (!lg || langOf(it) === lg); });
          $('[data-list]', L).innerHTML = '<div class="tscroll"><table class="adm"><tr><th>Стаття</th><th>Мова</th><th>Дата</th><th>Стан</th></tr>' + rows.map(function (it) {
            var m = meta[it.path] || {};
            return '<tr class="clk" data-p="' + esc(it.path) + '"><td>' + esc(m.title || it.name) + '<br><small>' + esc(it.name) + '</small></td><td>' + esc(m.lang || langOf(it)) + '</td><td>' + esc(m.date || '') + '</td><td>' + (it.draft ? '<span class="pill warn">чернетка</span>' : '<span class="pill on">опубліковано</span>') + '</td></tr>';
          }).join('') + '</table></div>';
          $$('tr.clk', L).forEach(function (tr) { tr.onclick = function () { articleForm(L, tr.dataset.p); }; });
        }
        $('[data-q]', L).oninput = debounce(draw, 150); $('[data-l]', L).onchange = draw;
        $('[data-new]', L).onclick = function () { articleForm(L, null); };
        draw();
        // заголовки — з публічного репозиторію за конкретним комітом (не кешується між версіями)
        var queue = items.slice(), busy = 0;
        (function pump() {
          while (busy < 6 && queue.length) {
            var it = queue.shift(); busy++;
            (function (it) {
              fetch(repo.raw(it.path)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) meta[it.path] = { title: j.title, lang: j.lang, date: j.date }; }, function () {})
                .then(function () { busy--; if (!queue.length && !busy) draw(); else if (queue.length % 20 === 0) draw(); pump(); });
            })(it);
          }
        })();
      });
    });
  };
  // body статті ↔ простий текст: ## h2, ### h3, «- » список, «1. » нумерований, ![alt](/img/… "підпис") фото (2–3 підряд = галерея)
  var IMG_RE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/;
  function bodyToText(body) {
    return body.map(function (n) {
      var k = n[0];
      if (k === 'h2') return '## ' + n[1];
      if (k === 'h3') return '### ' + n[1];
      if (k === 'p') return n[1];
      if (k === 'ul') return n[1].map(function (x) { return '- ' + x; }).join('\n');
      if (k === 'ol') return n[1].map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n');
      var im = function (src, alt, cap) { return '![' + (alt || '') + '](' + src + (cap ? ' "' + cap + '"' : '') + ')'; };
      if (k === 'img') return im(n[1], n[2], n[3]);
      if (k === 'gallery') return n[1].map(function (x) { return im(x[0], x[1], x[2]); }).join('\n');
      return null;
    }).join('\n\n');
  }
  function textToBody(t) {
    return String(t || '').replace(/\r/g, '').split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean).map(function (b) {
      var lines = b.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (/^### /.test(b)) return ['h3', b.slice(4).trim()];
      if (/^## /.test(b)) return ['h2', b.slice(3).trim()];
      if (lines.every(function (l) { return /^[-•*] /.test(l); })) return ['ul', lines.map(function (l) { return l.slice(2).trim(); })];
      if (lines.every(function (l) { return /^\d+[.)] /.test(l); })) return ['ol', lines.map(function (l) { return l.replace(/^\d+[.)] /, '').trim(); })];
      if (lines.every(function (l) { return IMG_RE.test(l); })) {
        var ph = lines.map(function (l) { var m = l.match(IMG_RE); return m[3] ? [m[2], m[1], m[3]] : [m[2], m[1]]; });
        return ph.length === 1 ? ['img'].concat(ph[0]) : ['gallery', ph];
      }
      return ['p', lines.join(' ')];
    });
  }
  function articleErrors(a, publish) {
    var e = [];
    if (!a.slug || !/^[a-z0-9-]+$/.test(a.slug)) e.push('slug — латиниця, цифри, дефіс');
    if (!a.title) e.push('заголовок');
    if (!publish) return e;
    ['description', 'lead', 'date'].forEach(function (k) { if (!a[k]) e.push(k); });
    if (a.description && a.description.length > 160) e.push('опис довший за 160 символів');
    if (!a.service || !a.service[0] || !a.service[1]) e.push('послуга (посилання й назва)');
    if (!a.body.length) e.push('текст');
    if (a.photo && !a.photo_alt) e.push('опис фото (alt)');
    if (!a.faq.length) e.push('хоча б одне питання FAQ');
    var t = (a.seo_title || a.title) + (a.seo_title ? '' : '');
    if (t.length > 60 && !a.seo_title) e.push('заголовок довший за 60 символів — додайте SEO-заголовок до 60');
    return e;
  }
  function articleForm(L, path) {
    L.innerHTML = '<p class="muted">Завантаження…</p>';
    (path ? repo.file(path) : Promise.resolve({ content: null, sha: null })).then(function (f) {
      var a = f.content ? JSON.parse(f.content) : { slug: '', lang: 'uk', title: '', description: '', lead: '', date: today(), service: ['', ''], body: [], faq: [] };
      var draft = !path || path.indexOf(DD + '/') === 0, newFiles = [];
      var bodyText = bodyToText(a.body || []), roundTrip = JSON.stringify(textToBody(bodyText)) === JSON.stringify(a.body || []);
      var known = ['slug', 'lang', 'title', 'seo_title', 'description', 'lead', 'date', 'service', 'photo', 'photo_alt', 'pair', 'translation_of', 'body', 'faq'];
      var extra = {}; Object.keys(a).forEach(function (k) { if (known.indexOf(k) < 0) extra[k] = a[k]; });
      L.innerHTML = '<div class="tb"><button class="btn ghost sm" data-back>← До списку</button><b class="grow">' + esc(a.title || 'Нова стаття') + '</b>' + (draft ? '<span class="pill warn">чернетка</span>' : '<span class="pill on">опубліковано</span>') + '</div>' +
        '<form class="form two" data-f>' +
        '<label class="f full"><span>Заголовок (H1)</span><input name="title" value="' + esc(a.title) + '"></label>' +
        '<label class="f full"><span>SEO-заголовок (необовʼязково, до 60 символів) <small data-cnt="seo_title"></small></span><input name="seo_title" value="' + esc(a.seo_title || '') + '"></label>' +
        '<label class="f full"><span>Опис для Google (до 160 символів) <small data-cnt="description"></small></span><textarea name="description" rows="2">' + esc(a.description) + '</textarea></label>' +
        '<label class="f full"><span>Лід — перший абзац</span><textarea name="lead" rows="3">' + esc(a.lead) + '</textarea></label>' +
        '<label class="f"><span>Адреса (slug)</span><input name="slug" value="' + esc(a.slug) + '"' + (path ? ' readonly' : '') + ' placeholder="napr-yak-vybraty-dyzainera"></label>' +
        '<label class="f"><span>Мова</span><select name="lang">' + LANGS.map(function (l) { return '<option' + (l === a.lang ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></label>' +
        '<label class="f"><span>Дата</span><input name="date" type="date" value="' + esc(a.date) + '"></label>' +
        '<label class="f"><span>Пара іншою мовою (slug, uk↔ru)</span><input name="pair" value="' + esc(a.pair || '') + '"></label>' +
        '<label class="f"><span>Послуга: посилання</span><input name="svc0" value="' + esc((a.service || [])[0] || '') + '" placeholder="/remont-kvartyr-kyiv"></label>' +
        '<label class="f"><span>Послуга: назва</span><input name="svc1" value="' + esc((a.service || [])[1] || '') + '" placeholder="Ремонт квартир"></label>' +
        '<label class="f"><span>Переклад статті (slug uk, для en/pl/…)</span><input name="translation_of" value="' + esc(a.translation_of || '') + '"></label>' +
        '<div class="f full"><span>Головне фото</span><div class="row"><input class="grow" name="photo" value="' + esc(a.photo || '') + '" placeholder="img/p/…-900.webp"><button type="button" class="btn ghost sm" data-up="photo">Завантажити</button></div>' +
        '<input name="photo_alt" value="' + esc(a.photo_alt || '') + '" placeholder="Опис фото (alt): що на ньому"></div>' +
        '<div class="f full"><span>Текст статті</span><div class="note">Порожній рядок — новий блок. <b>## Заголовок</b> · <b>### Підзаголовок</b> · <b>- пункт</b> · <b>1. пункт</b> · посилання <b>[текст](/remont-kvartyr-kyiv)</b> · фото <b>![опис](/img/p/….webp "підпис")</b>, 2–3 фото підряд без порожнього рядка — галерея. Фото — не на початку і не два блоки поспіль.</div>' +
        (roundTrip ? '' : '<p class="err">Текст містить нестандартні блоки — редагуйте у вкладці JSON нижче, щоб нічого не втратити.</p>') +
        '<textarea name="body" rows="22"' + (roundTrip ? '' : ' disabled') + '>' + esc(bodyText) + '</textarea><div class="row"><button type="button" class="btn ghost sm" data-up="body">+ Фото в текст</button></div></div>' +
        '<div class="f full"><span>Питання й відповіді (FAQ)</span><div data-faq></div></div>' +
        '<div class="f full"><span>Інші поля / JSON</span><details><summary>Показати</summary><div data-extra></div></details></div>' +
        '</form><div class="stick row"><input class="grow" data-msg placeholder="Що змінено (для історії)">' +
        '<button class="btn ghost" data-draft>Зберегти як чернетку</button><button class="btn" data-pub>' + (draft ? 'Опублікувати' : 'Зберегти й опублікувати') + '</button>' +
        (path ? '<button class="btn danger" data-del>Видалити</button>' : '') + '<span class="muted" data-st></span></div>';
      var form = $('[data-f]', L);
      $$('[data-cnt]', L).forEach(function (s) { var i = form.elements[s.dataset.cnt], up = function () { s.textContent = i.value.length + ' симв.'; }; i.addEventListener('input', up); up(); });
      a.faq = a.faq || [];
      var fq = $('[data-faq]', L);
      function drawFaq() {
        fq.innerHTML = a.faq.map(function (x, i) { return '<div style="margin-bottom:10px"><div class="row"><input class="grow" data-q="' + i + '" value="' + esc(x[0]) + '" placeholder="Питання"><button type="button" class="je-add" data-d="' + i + '">✕</button></div><textarea data-a="' + i + '" rows="2" placeholder="Відповідь">' + esc(x[1]) + '</textarea></div>'; }).join('') + '<button type="button" class="je-add" data-add>+ питання</button>';
        $$('[data-q]', fq).forEach(function (x) { x.oninput = function () { a.faq[+x.dataset.q][0] = x.value; }; });
        $$('[data-a]', fq).forEach(function (x) { x.oninput = function () { a.faq[+x.dataset.a][1] = x.value; }; });
        $$('[data-d]', fq).forEach(function (x) { x.onclick = function () { a.faq.splice(+x.dataset.d, 1); drawFaq(); }; });
        $('[data-add]', fq).onclick = function () { a.faq.push(['', '']); drawFaq(); };
      }
      drawFaq();
      var rawBody = clone(a.body || []);
      if (!roundTrip) extra.body = rawBody;
      jsonEditor($('[data-extra]', L), extra);
      $$('[data-up]', L).forEach(function (b) { b.onclick = function () {
        pickFiles(false).then(function (fs) { if (!fs[0]) return; $('[data-st]', L).textContent = 'Обробка фото…'; return makePhoto(fs[0], 'img/uploads'); }).then(function (ph) {
          if (!ph) return;
          newFiles = newFiles.concat(ph.files);
          if (b.dataset.up === 'photo') form.elements.photo.value = ph.src.slice(1);
          else { var ta = form.elements.body; ta.value = ta.value.replace(/\s*$/, '') + '\n\n![ОПИШІТЬ ФОТО](' + ph.src + ')\n'; }
          $('[data-st]', L).textContent = 'Фото підготовлено (' + ph.w + '×' + ph.h + ') — збережеться разом зі статтею';
        }).catch(function (e) { toast(e.message, true); });
      }; });
      $('[data-back]', L).onclick = function () { RENDER.blog(L); };
      function collect() {
        var fd = new FormData(form), o = {};
        o.slug = String(fd.get('slug') || '').trim(); o.lang = fd.get('lang');
        ['title', 'seo_title', 'description', 'lead', 'date'].forEach(function (k) { o[k] = String(fd.get(k) || '').trim(); });
        if (!o.seo_title) delete o.seo_title;
        o.service = [String(fd.get('svc0') || '').trim(), String(fd.get('svc1') || '').trim()];
        var ph = String(fd.get('photo') || '').trim().replace(/^\//, ''); if (ph) { o.photo = ph; o.photo_alt = String(fd.get('photo_alt') || '').trim(); }
        ['pair', 'translation_of'].forEach(function (k) { var v = String(fd.get(k) || '').trim(); if (v) o[k] = v; });
        o.body = roundTrip ? textToBody(form.elements.body.value) : extra.body;
        o.faq = a.faq.filter(function (x) { return x[0].trim() && x[1].trim(); });
        Object.keys(extra).forEach(function (k) { if (k !== 'body') o[k] = extra[k]; });
        return o;
      }
      function fileName(o) { return (o.lang === 'uk' || o.lang === 'ru' ? '' : o.lang + '-') + o.slug + '.json'; }
      function save(publish) {
        var o = collect(), errs = articleErrors(o, publish);
        if (errs.length) return toast((publish ? 'Для публікації потрібно: ' : 'Потрібно: ') + errs.join(', '), true);
        var name = path ? path.split('/').pop() : fileName(o);
        var target = (publish ? AD : DD) + '/' + name, files = [{ path: target, content: stringifyLike(f.content || '', o) }], dels = [], expect = {};
        expect[target] = target === path ? f.sha : null;
        if (path && path !== target) { dels.push(path); expect[path] = f.sha; }
        var msg = val('[data-msg]', L) || ((publish ? (draft ? 'публікація статті ' : 'стаття ') : 'чернетка статті ') + o.slug);
        repo.save(msg, files.concat(newFiles), dels, expect).then(function () { articleForm(L, target); });
      }
      $('[data-draft]', L).onclick = function () { save(false); };
      $('[data-pub]', L).onclick = function () { if (draft && !confirm('Опублікувати статтю на сайті? (Михайло, переконайтеся, що ціни й факти — підтверджені)')) return; save(true); };
      if ($('[data-del]', L)) $('[data-del]', L).onclick = function () {
        if (prompt('Видалити статтю назавжди? Напишіть «так».') !== 'так') return;
        var e = {}; e[path] = f.sha;
        repo.save('видалено статтю ' + a.slug, [], [path], e).then(function () { RENDER.blog(L); });
      };
    }).catch(function (e) { L.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  // ---------- Лендинги ----------
  RENDER.landings = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      return repo.list('tools/site/pages').then(function (d) {
        var files = d.files.filter(function (f) { return /\.json$/.test(f.name); });
        L.innerHTML = '<div class="tb"><input class="grow" data-q placeholder="Пошук: адреса сторінки"><select data-l><option value="">Усі мови</option>' + LANGS.map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select></div>' +
          '<div class="note">Лендинги послуг і сторінки мов (en, es, pl…) збираються з цих JSON-файлів (<code>tools/site/landing.py</code>). Ціни й факти — лише підтверджені. Нова сторінка — відкрийте схожу й натисніть «Створити копію».</div><div data-list></div>';
        function draw() {
          if (!$('[data-q]', L)) return; // користувач уже відкрив редактор
          var q = $('[data-q]', L).value.toLowerCase(), lg = $('[data-l]', L).value;
          $('[data-list]', L).innerHTML = '<div class="tscroll"><table class="adm"><tr><th>Сторінка</th><th>Мова</th><th>Адреса на сайті</th></tr>' + files.filter(function (f) { return (!q || f.name.indexOf(q) >= 0) && (!lg || f.name.slice(0, 2) === lg); }).map(function (f) {
            var lg2 = f.name.slice(0, 2), slug = f.name.slice(3, -5), url = '/' + (lg2 === 'uk' ? '' : lg2 + '/') + (slug === 'index' ? '' : slug);
            return '<tr class="clk" data-p="' + esc(f.path) + '"><td>' + esc(slug) + '</td><td>' + lg2 + '</td><td><a href="' + esc(url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(url) + '</a></td></tr>';
          }).join('') + '</table></div>';
          $$('tr.clk', L).forEach(function (tr) { tr.onclick = function () { landingEdit(L, tr.dataset.p); }; });
        }
        $('[data-q]', L).oninput = debounce(draw, 150); $('[data-l]', L).onchange = draw; draw();
      });
    });
  };
  function landingEdit(L, path) {
    fileEditor(L, path, {
      back: function () { RENDER.landings(L); },
      hint: 'Поля: <b>title</b> — заголовок вкладки, <b>description</b> — опис для Google (до 160 симв.), <b>h1</b>, <b>price</b>, <b>lead</b>, <b>cards</b> / <b>sections</b> — блоки сторінки, <b>faq</b> — питання. Довгі тексти розгортаються в поле. Видалення блоку — ✕, порядок — ↑ ↓.',
      validate: function (d) { if (!d.slug || !d.lang || !d.title) return 'Потрібні slug, lang і title'; if (d.description && d.description.length > 170) return 'description довший за 170 символів'; return null; },
      extra: '<button class="btn ghost" data-copy type="button">Створити копію</button>',
      after: function (L2, get) {
        $('[data-copy]', L2).onclick = function () {
          var data = get();
          var slug = prompt('Адреса нової сторінки (латиниця, дефіси), напр. remont-kvartyr-obolon:');
          if (!slug || !/^[a-z0-9-]+$/.test(slug)) return slug && toast('Лише латиниця, цифри й дефіс', true);
          var c = clone(data); c.slug = slug; delete c.pair;
          var np = 'tools/site/pages/' + data.lang + '-' + slug + '.json', e = {}; e[np] = null;
          repo.save('новий лендинг ' + data.lang + '/' + slug + ' (копія ' + data.slug + ')', [{ path: np, content: JSON.stringify(c, null, 1) + '\n' }], [], e)
            .then(function () { landingEdit(L, np); });
        };
      },
    });
  }

  // ---------- Меню й футер (tools/site/lang/*.json) ----------
  RENDER.lang = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      return repo.list('tools/site/lang').then(function (d) {
        L.innerHTML = '<div class="note">Тексти шапки, меню, футера й форми для кожної мови (<b>chrome</b> — шапка й футер, <b>form</b> — форма заявки, <b>landing</b> — підписи блоків). Українські пункти меню — у <code>tools/site/chrome.py</code> (через розробника). <b>clusters*.json</b> — звʼязки перекладів сторінок, міняйте обережно.</div>' +
          '<div class="tscroll"><table class="adm"><tr><th>Файл</th></tr>' + d.files.filter(function (f) { return /\.json$/.test(f.name); }).map(function (f) { return '<tr class="clk" data-p="' + esc(f.path) + '"><td>' + esc(f.name) + '</td></tr>'; }).join('') + '</table></div>';
        $$('tr.clk', L).forEach(function (tr) { tr.onclick = function () { fileEditor(L, tr.dataset.p, { back: function () { RENDER.lang(L); } }); }; });
      });
    });
  };

  // ---------- Ручні HTML-сторінки ----------
  RENDER.pages = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      L.innerHTML = '<p class="muted">Завантаження списку сторінок…</p>';
      return api('/api/admin/repo?op=pages').then(function (d) {
        var files = d.files.sort(function (a, b) { return a.generated - b.generated || a.path.localeCompare(b.path); });
        L.innerHTML = '<div class="tb"><input class="grow" data-q placeholder="Пошук сторінки"></div><div class="note">Тут редагується вміст сторінок, зроблених вручну (головна, про студію, контакти, портфоліо, проєкти…): текст усередині <b>&lt;main&gt;</b>, заголовок і опис. Шапку й футер ставить генератор — вони однакові на всьому сайті. Сторінки з позначкою «з JSON» редагуються у вкладках «Лендинги» / «Блог» / «Товари».</div><div data-list></div>';
        function draw() {
          if (!$('[data-q]', L)) return; // користувач уже відкрив редактор
          var q = $('[data-q]', L).value.toLowerCase();
          $('[data-list]', L).innerHTML = '<div class="tscroll"><table class="adm"><tr><th>Сторінка</th><th></th></tr>' + files.filter(function (f) { return !q || f.path.indexOf(q) >= 0; }).map(function (f) {
            return '<tr' + (f.generated ? ' style="opacity:.55"' : ' class="clk"') + ' data-p="' + esc(f.path) + '"><td>' + esc(f.path) + '</td><td>' + (f.generated ? '<span class="pill">з JSON</span>' : '') + '</td></tr>';
          }).join('') + '</table></div>';
          $$('tr.clk', L).forEach(function (tr) { tr.onclick = function () { htmlEdit(L, tr.dataset.p); }; });
        }
        $('[data-q]', L).oninput = debounce(draw, 150); draw();
      });
    });
  };
  var MAIN_RE = /(<main\b[^>]*>)([\s\S]*)(<\/main>)/;
  var RAW_EL = /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|TEMPLATE|TITLE)$/;
  function textNodes(root) {
    var out = [], w = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) { var p = n.parentNode, skip = false; while (p && p !== root) { if (RAW_EL.test(p.nodeName)) { skip = true; break; } p = p.parentNode; } if (!skip) out.push(n); }
    return out;
  }
  // Текстові шматки HTML-коду в тому ж порядку, що й текстові вузли DOM: [{start, end, raw}]
  function textTokens(src) {
    var re = /<!--[\s\S]*?-->|<(script|style|textarea|noscript|template|title)\b[\s\S]*?<\/\1\s*>|<[^>]*>|[^<]+/gi, m, out = [];
    while ((m = re.exec(src))) if (m[0][0] !== '<') out.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
    return out;
  }
  var escText = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;'); };
  // Точкова заміна змінених текстів у коді <main>; null — якщо структура змінилась або код не зіставляється з DOM
  function patchText(src, base, now) {
    if (!base || base.length !== now.length || base.some(function (b, i) { return b.node !== now[i]; })) return null;
    var tk = textTokens(src);
    if (tk.length !== base.length || tk.some(function (t, i) { return unesc(t.raw) !== base[i].text; })) return null;
    var out = '', pos = 0;
    tk.forEach(function (t, i) {
      if (now[i].data === base[i].text) return;
      out += src.slice(pos, t.start) + escText(now[i].data); pos = t.end;
    });
    return out + src.slice(pos);
  }
  var unesc = function (s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  function htmlEdit(L, path) {
    L.innerHTML = '<p class="muted">Завантаження…</p>';
    repo.file(path).then(function (f) {
      var src = f.content, m = src.match(MAIN_RE);
      if (!m) { L.innerHTML = '<p class="err">На сторінці немає &lt;main&gt; — редагувати тут не можна.</p>'; return; }
      var main = m[2], mode = 'visual', dirty = false;
      var title = unesc((src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''), desc = unesc((src.match(/<meta name="description" content="([^"]*)">/) || [])[1] || '');
      var dir = path.indexOf('/') > 0 ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      L.innerHTML = '<div class="tb"><button class="btn ghost sm" data-back>← До списку</button><b class="grow">' + esc(path) + '</b><a class="btn ghost sm" target="_blank" rel="noopener" href="/' + esc(path.replace(/(index)?\.html$/, '')) + '">На сайті ↗</a></div>' +
        '<div class="form"><label class="f"><span>Заголовок вкладки (title) <small data-tc></small></span><input data-title value="' + esc(title) + '"></label>' +
        '<label class="f"><span>Опис для Google (description) <small data-dc></small></span><textarea data-desc rows="2">' + esc(desc) + '</textarea></label></div>' +
        '<div class="tb" style="margin-top:14px"><span class="seg"><button data-m="visual" aria-pressed="true">Текст на сторінці</button><button data-m="code" aria-pressed="false">Код HTML</button><button data-m="preview" aria-pressed="false">Перегляд</button></span>' +
        '<small class="muted">«Текст на сторінці»: клікніть у текст і правте як у Word. Анімації й скрипти в режимі редагування вимкнені.</small></div><div data-ed></div>' +
        '<div class="stick row"><input class="grow" data-msg placeholder="Що змінено (для історії)"><button class="btn" data-save>Зберегти</button><span class="muted" data-st></span></div>';
      var ed = $('[data-ed]', L), frame = null, scripts = [], base = null;
      var cnt = function () { $('[data-tc]', L).textContent = $('[data-title]', L).value.length + ' симв.'; $('[data-dc]', L).textContent = $('[data-desc]', L).value.length + ' симв.'; };
      $('[data-title]', L).oninput = $('[data-desc]', L).oninput = function () { cnt(); $('[data-st]', L).textContent = 'є незбережені зміни'; };
      cnt();
      function sync() { // забрати правки з поточного режиму
        if (mode === 'visual' && frame && dirty) {
          var mm = frame.contentDocument.querySelector('main');
          if (!mm) return;
          // лише текст змінено → міняємо в коді тільки ці шматки тексту (решта HTML лишається байт у байт);
          // змінено структуру (Enter, вставка) → беремо HTML з редактора цілком
          var patched = patchText(main, base, textNodes(mm));
          main = patched != null ? patched : mm.innerHTML.replace(/<!--cas-script-(\d+)-->/g, function (_, i) { return scripts[+i]; });
          if (patched == null) toast('Структуру блоку змінено — збережеться HTML з редактора (перевірте «Перегляд»)');
          base = null; // після sync рендер перебудовується
        }
        if (mode === 'code') main = $('textarea', ed).value;
      }
      function pageWith(inner, noScripts) {
        var h = src.replace(MAIN_RE, function (_, a, __, c) { return a + inner + c; });
        h = h.replace(/<head>/i, '<head><base href="' + location.origin + '/' + dir + '">');
        if (noScripts) h = h.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<head>/i, '<head><style>main[contenteditable]{outline:2px dashed #BF9148;outline-offset:4px}.reveal,.rv,.au{opacity:1!important;transform:none!important;translate:none!important}</style>');
        return h;
      }
      function draw() {
        ed.innerHTML = ''; frame = null;
        if (mode === 'code') { ed.innerHTML = '<textarea class="code" spellcheck="false"></textarea>'; var ta = $('textarea', ed); ta.value = main; ta.oninput = function () { $('[data-st]', L).textContent = 'є незбережені зміни'; }; return; }
        frame = document.createElement('iframe'); frame.className = 'pv'; frame.title = 'Сторінка';
        if (mode === 'visual') {
          scripts = [];
          var inner = main.replace(/<script\b[\s\S]*?<\/script>/gi, function (s) { scripts.push(s); return '<!--cas-script-' + (scripts.length - 1) + '-->'; });
          frame.srcdoc = pageWith(inner, true);
          frame.onload = function () {
            var doc = frame.contentDocument, mm = doc.querySelector('main');
            if (!mm) return;
            mm.contentEditable = 'true';
            base = textNodes(mm).map(function (n) { return { node: n, text: n.data }; });
            doc.addEventListener('click', function (e) { if (e.target.closest('a')) e.preventDefault(); }, true);
            mm.addEventListener('input', function () { dirty = true; $('[data-st]', L).textContent = 'є незбережені зміни'; });
          };
        } else frame.srcdoc = pageWith(main, false);
        ed.appendChild(frame);
      }
      draw();
      $$('[data-m]', L).forEach(function (b) { b.onclick = function () { sync(); dirty = false; mode = b.dataset.m; $$('[data-m]', L).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); draw(); }; });
      $('[data-back]', L).onclick = function () { if (!/незбережені/.test($('[data-st]', L).textContent) || confirm('Вийти без збереження?')) RENDER.pages(L); };
      $('[data-save]', L).onclick = function () {
        sync();
        var t = $('[data-title]', L).value.trim(), dsc = $('[data-desc]', L).value.trim().replace(/\s+/g, ' ');
        if (!t) return toast('Заголовок не може бути порожнім', true);
        var escT = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }, escA = function (s) { return escT(s).replace(/"/g, '&quot;'); };
        var out = src.replace(MAIN_RE, function (_, a, __, c) { return a + main + c; });
        if (unesc((src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '') !== t) out = out.replace(/<title>[\s\S]*?<\/title>/, function () { return '<title>' + escT(t) + '</title>'; });
        if (desc !== dsc) out = out.replace(/<meta name="description" content="[^"]*">/, function () { return '<meta name="description" content="' + escA(dsc) + '">'; });
        if (out === src) return toast('Змін немає');
        var e = {}; e[path] = f.sha;
        repo.save(val('[data-msg]', L) || 'текст сторінки ' + path, [{ path: path, content: out }], [], e).then(function () { htmlEdit(L, path); });
      };
    }).catch(function (e) { L.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  // ---------- Медіа ----------
  RENDER.media = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      L.innerHTML = '<div class="drop" data-drop tabindex="0" role="button">Перетягніть фото сюди або натисніть, щоб вибрати (JPG, PNG, WebP).<br><small>Фото стискаються у WebP просто в браузері: 900 px і 400 px завширшки; AVIF-копії зробить збірка.</small></div>' +
        '<div class="media" data-new></div><h3 style="margin-top:24px">Завантажені раніше (img/uploads)</h3><div class="media" data-old><p class="muted">Завантаження…</p></div>';
      var drop = $('[data-drop]', L);
      function snippet(src, w, h) {
        var small = src.replace(/-900\.webp$/, '-400.webp');
        return '<img src="' + src + '" srcset="' + small + ' 400w, ' + src + ' ' + w + 'w" sizes="(max-width:900px) 100vw, 900px" width="' + w + '" height="' + h + '" alt="ОПИС ФОТО" loading="lazy" decoding="async">';
      }
      function fig(src, preview, w, h) {
        return '<figure><img src="' + esc(preview) + '" alt="" width="200" height="140" loading="lazy"><figcaption><code>' + esc(src) + '</code>' + (w ? '<small>' + w + '×' + h + '</small>' : '') +
          '<span class="row"><button type="button" class="btn ghost sm" data-copy="' + esc(src) + '">Шлях</button>' + (w ? '<button type="button" class="btn ghost sm" data-html="' + esc(snippet(src, w, h)) + '">HTML</button>' : '') + '</span></figcaption></figure>';
      }
      function bindCopy(root) {
        $$('[data-copy],[data-html]', root).forEach(function (b) { b.onclick = function () { var t = b.dataset.copy || b.dataset.html; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Скопійовано'); }, function () { prompt('Скопіюйте:', t); }); }; });
      }
      function upload(fs) {
        fs = fs.filter(function (f) { return /^image\//.test(f.type); }).slice(0, 10);
        if (!fs.length) return;
        drop.textContent = 'Обробка ' + fs.length + ' фото…';
        Promise.all(fs.map(function (f) { return makePhoto(f, 'img/uploads'); })).then(function (ps) {
          var files = []; ps.forEach(function (p) { files = files.concat(p.files); });
          return repo.save('медіа: ' + ps.length + ' фото', files, [], {}).then(function () {
            $('[data-new]', L).insertAdjacentHTML('afterbegin', ps.map(function (p) { return fig(p.src, p.preview, p.w, p.h); }).join(''));
            bindCopy($('[data-new]', L));
          });
        }).catch(function (e) { toast(e.message, true); }).then(function () { drop.textContent = 'Перетягніть ще фото або натисніть, щоб вибрати.'; });
      }
      drop.onclick = drop.onkeydown = function (e) { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; pickFiles(true).then(upload); };
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); upload(Array.prototype.slice.call(e.dataTransfer.files)); };
      return repo.list('img/uploads').then(function (d) {
        var big = d.files.filter(function (f) { return /-900\.webp$/.test(f.name); }).reverse();
        $('[data-old]', L).innerHTML = big.map(function (f) { return fig('/' + f.path, repo.raw(f.path)); }).join('') || '<p class="muted">Поки порожньо.</p>';
        bindCopy($('[data-old]', L));
      });
    });
  };

  // ---------- Історія змін ----------
  RENDER.history = function (L) {
    return needToken(L).then(function (ok) {
      if (!ok) return;
      L.innerHTML = '<p class="muted">Завантаження історії…</p>';
      return api('/api/admin/repo?op=history').then(function (d) {
        var run = function (sha) { return (d.runs || []).filter(function (r) { return r.sha === sha; }); };
        L.innerHTML = '<div class="note">Кожне збереження — окремий запис («коміт»). Після нього GitHub перезбирає сайт (2–4 хв). «Відкотити» повертає файли цього запису до попереднього стану новим записом — нічого не губиться.' +
          (d.runs ? '' : '<br><small>Статус збірки не видно: додайте токену право «Actions: read» (необовʼязково).</small>') + '</div>' +
          '<div class="tscroll"><table class="adm"><tr><th>Коли</th><th>Що</th><th>Хто</th><th>Збірка</th><th></th></tr>' + d.commits.map(function (c) {
            var first = c.message.split('\n')[0], auto = /\[rebuild\]/.test(first), rs = run(c.sha);
            var b = rs.map(function (r) { return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" class="pill ' + (r.conclusion === 'success' ? 'on' : r.conclusion === 'failure' ? 'warn' : '') + '">' + esc(r.name.replace(/^\W+/, '').slice(0, 22)) + ': ' + (r.conclusion === 'success' ? 'ок' : r.conclusion === 'failure' ? 'помилка' : r.status === 'completed' ? (r.conclusion || '—') : 'йде…') + '</a>'; }).join(' ');
            return '<tr><td><small>' + esc(new Date(c.date).toLocaleString('uk-UA')) + '</small></td><td>' + esc(first) + (auto ? ' <span class="pill">авто</span>' : '') + '<div data-files="' + c.sha + '"></div></td><td><small>' + esc(c.author) + '</small></td><td>' + b + '</td>' +
              '<td class="row"><button class="btn ghost sm" data-f="' + c.sha + '">Файли</button>' + (auto ? '' : '<button class="btn ghost sm" data-r="' + c.sha + '">Відкотити</button>') + '</td></tr>';
          }).join('') + '</table></div>';
        $$('[data-f]', L).forEach(function (b) { b.onclick = function () {
          api('/api/admin/repo?op=commit&sha=' + b.dataset.f).then(function (x) {
            $('[data-files="' + b.dataset.f + '"]', L).innerHTML = '<small>' + x.files.map(function (f) { return esc(f.status) + ': ' + esc(f.path); }).slice(0, 40).join('<br>') + (x.files.length > 40 ? '<br>… ще ' + (x.files.length - 40) : '') + '</small>';
          });
        }; });
        $$('[data-r]', L).forEach(function (b) { b.onclick = function () {
          if (!confirm('Відкотити цю зміну? Файли повернуться до стану перед нею, сайт перезбереться.')) return;
          b.disabled = true;
          api('/api/admin/repo', { method: 'POST', body: { op: 'revert', sha: b.dataset.r } }).then(function () { toast('Відкочено. Сайт оновиться за 2–4 хвилини.'); RENDER.history(L); }, function (e) { b.disabled = false; toast(e.message, true); });
        }; });
      });
    });
  };

  // ===================== старт =====================
  addEventListener('DOMContentLoaded', function () {
    A = window.CASAccount; box = document.getElementById('adm');
    if (!A || !box) return;
    A.me().then(function (c) {
      if (!c) { box.innerHTML = '<div class="acc-box"><h2>Увійдіть як менеджер</h2><div id="login"></div></div>'; A.login(document.getElementById('login'), function () { location.reload(); }); return; }
      if (!c.admin) { box.innerHTML = '<p class="acc-err">Немає доступу. Попросіть адміністратора додати ваш Telegram або пошту.</p>'; return; }
      start();
    });
  });
  // для перевірок (tools/admin/test): перетворення тексту статті
  window.CASAdminText = { bodyToText: bodyToText, textToBody: textToBody, stringifyLike: stringifyLike };
})();
