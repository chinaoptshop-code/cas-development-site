/* CAS Development — адмінка /kabinet/admin: CRM, замовлення, клієнти, коди партнерів і редактор контенту сайту.
   Дані CRM — D1 (/api/admin/crm, orders, clients, partner-codes). Контент — файли репозиторію через /api/admin/repo
   (сервер пише в GitHub одним комітом; після коміту GitHub Actions перезбирає й викладає сайт за 2–4 хв).
   Інструкція для власника — tools/admin/README.md. */
(function () {
  'use strict';
  var A, box, REPO = null, ME = null; // ME — працівник з /api/me: {role, perms, owner, panel}
  var can = function (p) { return !!(ME && ME.perms && ME.perms.indexOf(p) >= 0); };
  var reduced = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  // плавна зміна вмісту (View Transitions), без анімації — якщо браузер не вміє або «менше руху»
  var transition = function (fn) {
    if (!document.startViewTransition || reduced()) { fn(); return; }
    var t = document.startViewTransition(fn); // перерваний перехід (поворот екрана, зміна розміру) — не помилка
    [t.ready, t.finished, t.updateCallbackDone].forEach(function (p) { if (p && p.catch) p.catch(function () { /* noop */ }); });
  };
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

  // ===================== незбережені зміни: вкладки панелі, «← До списку», закриття сторінки =====================
  // Редактор (картка проєкту, контакт, стаття, товар, файл…) реєструє «сторожа»: функцію, що повертає текст попередження, поки у формі
  // є незбережені зміни. Перемикання вкладки панелі й закриття сторінки спершу питають. Сторож сам зникає разом із формою.
  var GUARD = null;
  function guardMsg() { try { return GUARD ? GUARD() || '' : ''; } catch (e) { return ''; } }
  function canLeave() {
    var m = guardMsg();
    if (!m) { GUARD = null; return true; }
    if (!confirm(m + '\n\nПерейти без збереження?')) return false;
    GUARD = null; return true;
  }
  // root — форма (зміни в ній = «є що зберігати»), what — «контакті», «статті»… Повертає {dirty(), set(v), leave()}
  // marker — елемент самого редактора (напр. кнопка «← До списку»): коли його вже немає на сторінці, сторож мовчить
  function watchForm(root, what, skip, marker) {
    var st = { v: false }, mk = marker || root;
    var mark = function (e) { if (document.contains(mk) && (!skip || !e.target.closest(skip))) st.v = true; };
    root.addEventListener('input', mark); root.addEventListener('change', mark);
    GUARD = function () { return document.contains(mk) && st.v ? 'У ' + what + ' є незбережені зміни.' : ''; };
    return { dirty: function () { return st.v; }, set: function (v) { st.v = !!v; }, leave: function () { if (!st.v || confirm('У ' + what + ' є незбережені зміни. Вийти без збереження?')) { st.v = false; return true; } return false; } };
  }
  addEventListener('beforeunload', function (e) { if (guardMsg()) { e.preventDefault(); e.returnValue = ''; } });

  // ===================== одночасне редагування (версія картки, functions/_ver.js) =====================
  // Сервер відхилив збереження (409 conflict): запис змінили, поки форма була відкрита. Питаємо, що робити:
  //   retry  — «Оновити й повторити мої зміни»: свіжі дані + мої незбережені правки там, де вони не перетинаються з чужими;
  //   reload — «Оновити без моїх змін»; cancel — лишитись у формі (напр. щоб скопіювати текст).
  var isConflict = function (e) { return !!(e && e.status === 409 && e.data && e.data.conflict); };
  function conflictDialog(title, last, what) {
    var d = document.createElement('dialog'); d.className = 'cf-dlg'; d.setAttribute('aria-labelledby', 'cfT');
    var who = last && (last.by || last.what) ? '<p class="cf-who">Остання зміна' + (last.at ? ' ' + when(last.at) : '') + ': <b>' + esc(last.by || 'інший користувач') + '</b>' + (last.what ? ' — ' + esc(last.what) : '') + '.</p>' : '';
    d.innerHTML = '<form method="dialog"><h2 id="cfT">' + esc(title) + '</h2>' + who +
      '<p class="muted">Ваші зміни ще не збережено. Можна оновити ' + esc(what) + ' і повторити свої зміни: там, де їх ніхто не чіпав, вони збережуться; якщо те саме поле змінив хтось інший — покажемо обидва значення.</p>' +
      '<div class="cf-act"><button class="btn" value="retry">Оновити й повторити мої зміни</button><button class="btn ghost" value="reload">Оновити без моїх змін</button><button class="btn ghost" value="cancel">Повернутись до форми</button></div></form>';
    (box || document.body).appendChild(d);
    return new Promise(function (ok) {
      d.addEventListener('close', function () { var v = d.returnValue || 'cancel'; d.parentNode.removeChild(d); ok(v); });
      d.showModal(); var b = $('button[value=retry]', d); if (b) b.focus();
    });
  }
  // Тристороннє злиття полів: base — що було у формі при відкритті, mine — що у формі зараз, fresh — свіжі дані.
  // → {apply: {поле: моє значення, яке можна перенести}, clash: [{k, mine, fresh}] — поле змінили і я, і хтось інший (лишається свіже)}
  function merge3(keys, base, mine, fresh, norm) {
    var n = norm || function (v) { return String(v == null ? '' : v).trim(); }, out = { apply: {}, clash: [] };
    keys.forEach(function (k) {
      if (!(k in mine) || n(mine[k], k) === n(base[k], k)) return; // я цього поля не змінював
      if (n(fresh[k], k) === n(mine[k], k)) return;                 // вже таке саме
      if (n(fresh[k], k) === n(base[k], k)) out.apply[k] = mine[k]; else out.clash.push({ k: k, mine: mine[k], fresh: fresh[k] });
    });
    return out;
  }
  var clashNote = function (label, c) { return esc(label) + ': зараз «' + esc(c.fresh == null ? '' : c.fresh) + '», ваше значення «' + esc(c.mine == null ? '' : c.mine) + '» не перенесено'; };
  var clashBox = function (list) { return '<div class="note cf-note" role="status" data-cfn><b>Ці поля змінив хтось інший — лишили свіже значення. Перевірте й за потреби виправте вручну:</b><ul>' + list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; };

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
      GUARD = function () { return document.contains(st) && /незбережені/.test(st.textContent) ? 'У файлі ' + path.split('/').pop() + ' є незбережені зміни.' : ''; };
      $('[data-save]', L).onclick = function () {
        if (mode === 'raw' && $('[data-je]', ed).textContent) return toast('Спершу виправте помилку JSON', true);
        var err = opts.validate && opts.validate(data);
        if (err) { st.textContent = err; st.className = 'err'; return toast(err, true); }
        st.className = 'muted';
        if (!confirmIssues(lintText(strings(data)).concat(data && typeof data === 'object' && !Array.isArray(data) && ('title' in data || 'description' in data) ? seoIssues(data.title, data.description) : []))) return;
        var e = {}; e[path] = f.sha;
        var btn = this; btn.disabled = true;
        repo.save((val('[data-msg]', L) || 'правка ' + path.split('/').pop()), [{ path: path, content: stringifyLike(f.content, data) }], [], e)
          .then(function () { st.textContent = 'збережено'; return fileEditor(L, path, opts); }, function () { btn.disabled = false; });
      };
      if (opts.after) opts.after(L, function () { return data; }, f);
    });
  }

  // ===================== перевірка тексту перед комітом =====================
  // Підтверджені ціни й факти — CLAUDE.md (дублюються в tools/ui/ui.py PRICES_OK). Попередження не блокують збереження:
  // показуємо список і питаємо «зберегти попри це?». Помилки (порожній заголовок, битий JSON) — блокують.
  var PRICES_OK = ['$30', '$350', '$550', '$250', '$600', '$1 100', '$1100', '$50', '$2 500', '$2500', '$500', '$5 000', '$10 000', '$20 000', '$12', '$6', '$45'];
  var FACTS_BAD = [[/безкоштовн\S* (замір|виїзд)|бесплатн\S* (замер|выезд)|free (measur|site visit)/i, '«безкоштовний замір/виїзд» не обіцяємо — замір платний'],
    [/osocor|осокор|osokork/i, 'Osocor/Osokorky на сайті не показуємо'],
    [/гаранті\S* (36 міс|24 міс|2 роки|3 роки)|(24|36) міс\S* гаранті/i, 'гарантія — 12 міс. (Михайло 05.11.2026)'],
    [/(\b3|три|трьома) (власн\S* |собствен\S* |наш\S* )?(штатн\S* )?бригад/i, 'кількість бригад не пишемо — «своя команда» (Михайло 05.11.2026)'],
    [/\b(158|200|214)\+ проєкт/i, 'кількість проєктів — «150+»'],
    [/реалізован\S*[^.]{0,40}дуба|дуба[^.]{0,40}реалізован/i, 'вілла в Дубаї — дизайн-проєкт, не «реалізовано»'],
    [/http:\/\//, 'посилання http:// — краще https://'],
    [/(Lorem ipsum|TODO|XXX)/, 'чернетковий текст (Lorem / TODO)']];
  function lintText(text) {
    var out = [], t = String(text || '').replace(/\u00a0/g, ' ');
    var bad = (t.match(/\$\s?\d[\d ]*\d|\$\d/g) || []).map(function (x) { return x.trim(); })
      .filter(function (x, i, a) { return a.indexOf(x) === i && PRICES_OK.indexOf(x) < 0 && !/^\$1 /.test(x); });
    if (bad.length) out.push('ціни, яких немає в підтверджених: ' + bad.slice(0, 8).join(', ') + ' — перевірте (приклади розрахунку в статтях — ок)');
    FACTS_BAD.forEach(function (f) { if (f[0].test(t)) out.push(f[1]); });
    return out;
  }
  function seoIssues(title, desc) {
    var out = [];
    if (title != null && title.length > 70) out.push('title ' + title.length + ' симв. — Google обріже після ~60–65');
    if (desc != null && desc && (desc.length < 70 || desc.length > 165)) out.push('description ' + desc.length + ' симв. — краще 70–160');
    return out;
  }
  // true — можна зберігати
  function confirmIssues(list) {
    if (!list.length) return true;
    return confirm('Перед збереженням перевірте:\n\n• ' + list.join('\n• ') + '\n\nЗберегти попри це?');
  }
  var strings = function (o) { var a = []; (function w(x) { if (typeof x === 'string') a.push(x); else if (x && typeof x === 'object') Object.keys(x).forEach(function (k) { w(x[k]); }); })(o); return a.join('\n'); };

  // ===================== вкладки =====================
  // [ключ, підпис, права (досить одного)] — вкладки без права не показуємо (сервер однаково перевіряє кожен запит).
  // Вкладки майстер-панелі власника (Студія, Персонал, Аудит) додає assets/admin/studio.v1.js через window.CASStudio.
  var TABS = [
    ['crm', 'CRM', ['leads.view_all', 'orders.view']], ['stats', 'Аналітика', ['leads.view_all']], ['orders', 'Замовлення Оздоби', ['orders.view']],
    ['clients', 'Клієнти', ['clients.view']], ['projects', 'Обʼєкти', ['projects.view_all']], ['partners', 'Контакти', ['partners.base']], ['codes', 'Коди партнерів', ['partners.manage']],
    ['products', 'Товари', ['cms.edit']], ['blog', 'Блог', ['cms.edit']], ['landings', 'Лендинги', ['cms.edit']], ['lang', 'Меню й футер', ['cms.edit']],
    ['pages', 'Сторінки', ['cms.edit']], ['media', 'Медіа', ['cms.edit']], ['history', 'Історія', ['cms.edit']],
  ];
  var RENDER = {};

  function start() {
    var ext = window.CASStudio;
    if (ext && ext.tabs) ext.tabs.slice().reverse().forEach(function (t) { TABS.unshift([t.key, t.label, t.perms]); RENDER[t.key] = t.render; });
    // CRM v4 (assets/admin/crm4.v1.js): вкладка «Задачі» — одразу після CRM
    var ext4 = window.CASCrm4;
    if (ext4 && ext4.tabs) ext4.tabs.forEach(function (t) {
      var i = TABS.findIndex(function (x) { return x[0] === t.after; });
      TABS.splice(i < 0 ? TABS.length : i + 1, 0, [t.key, t.label, t.perms]); RENDER[t.key] = t.render;
    });
    var tabs = TABS.filter(function (t) { return !t[2] || t[2].some(can); });
    var first = tabs[0] ? tabs[0][0] : 'crm';
    box.className = 'adm';
    document.body.classList.add(ME && ME.owner ? 'adm-owner' : 'adm-manager');
    var h1 = document.querySelector('main.acc h1');
    if (h1) h1.textContent = ME && ME.owner ? 'Майстер-панель студії' : 'Робоча панель: CRM і сайт';
    box.innerHTML = '<div class="adm-who"><span class="adm-badge">' + esc(ME ? ME.role_label : '') + '</span> <b>' + esc(ME ? ME.name : '') + '</b>' +
      (ME && !ME.owner ? ' · <a href="/kabinet/team">Мій кабінет працівника</a>' : ' · <a href="/kabinet/team">Вигляд працівника</a>') +
      ' · <button type="button" class="lnk" data-out-all>Вийти на всіх пристроях</button></div>' +
      '<nav class="adm-tabs" aria-label="Розділи панелі">' + tabs.map(function (t) { return '<button type="button" data-t="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>'; }).join('') + '</nav><div id="admView"></div>';
    $('[data-out-all]', box).onclick = function () {
      if (!confirm('Вийти з усіх пристроїв (телефон, ноутбук…)? Доведеться увійти заново.')) return;
      A.api('/api/auth/logout', { method: 'POST', body: { all: true } }).then(function () { location.href = '/kabinet'; });
    };
    var view = $('#admView');
    var curTab = null;
    function open(t) {
      if (!RENDER[t] || !tabs.some(function (x) { return x[0] === t; })) t = first;
      // незбережені зміни у відкритій формі — спершу питаємо; «ні» — лишаємось на вкладці (і адресу повертаємо)
      if (curTab && !canLeave()) { try { history.replaceState(null, '', '#' + curTab); } catch (e) { /* noop */ } return; }
      curTab = t;
      $$('.adm-tabs button', box).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.t === t); });
      try { history.replaceState(null, '', '#' + t); } catch (e) { /* noop */ }
      transition(function () {
        view.innerHTML = '';
        var L = document.createElement('div'); L.className = 'adm-view'; view.appendChild(L);
        Promise.resolve(RENDER[t](L)).catch(function (e) { L.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
      });
    }
    $$('.adm-tabs button', box).forEach(function (b) { b.onclick = function () { open(b.dataset.t); if (curTab === b.dataset.t) b.scrollIntoView({ block: 'nearest', inline: 'center' }); }; });
    addEventListener('hashchange', function () { open(location.hash.slice(1)); }); // переходи з «Аналітики» в CRM з фільтром
    open(location.hash.slice(1) || first);
    if (ext4 && ext4.started && tabs.some(function (t) { return t[0] === 'tasks'; })) ext4.started(); // лічильник прострочених на вкладці
  }
  // для studio.v1.js: спільні помічники
  window.CASAdminKit = { esc: esc, money: money, toast: toast, api: function (p, o) { return api(p, o); }, can: can, transition: transition, reduced: reduced,
    isConflict: function (e) { return isConflict(e); }, conflictDialog: function (t, l, w) { return conflictDialog(t, l, w); },
    openClient: function (id) { if (window.CASStudio && window.CASStudio.clientCard) window.CASStudio.clientCard(id); } };

  // Надіслати клієнту готовий текст зі свого месенджера (сервер нічого не шле): текст копіюється в буфер, відкривається чат.
  // Telegram: чат за @username або номером (текст вставити), Viber — чернетка, WhatsApp — текст у полі. onSent(канал) — записати в журнал.
  function shareBar(text, phone, tgu, onSent) {
    var d = digits(phone), e = encodeURIComponent(text), u = tgu && /^[a-z][a-z0-9_]{3,31}$/i.test(tgu) ? tgu : '';
    var L = [['telegram', 'Telegram', u ? 'https://t.me/' + u : d.length >= 9 ? 'https://t.me/+' + d : 'https://t.me/share/url?url=' + encodeURIComponent('https://cas-develop.com') + '&text=' + e],
      ['viber', 'Viber', d.length >= 9 ? 'viber://chat?number=%2B' + d + '&draft=' + e : ''], ['whatsapp', 'WhatsApp', d.length >= 9 ? 'https://wa.me/' + d + '?text=' + e : '']];
    var w = document.createElement('div'); w.className = 'row share-bar';
    w.innerHTML = L.filter(function (x) { return x[2]; }).map(function (x) { return '<a class="btn sm ghost" data-sh="' + x[0] + '" href="' + esc(x[2]) + '" target="_blank" rel="noopener">' + x[1] + '</a>'; }).join('') +
      '<button type="button" class="btn sm ghost" data-sh="copy">Скопіювати</button>';
    $$('[data-sh]', w).forEach(function (b) { b.onclick = function (ev) {
      var t = (w.previousElementSibling && w.previousElementSibling.tagName === 'TEXTAREA') ? w.previousElementSibling.value : text;
      if (b.tagName === 'A' && t !== text) b.href = b.href.replace(e, encodeURIComponent(t));
      try { navigator.clipboard.writeText(t); } catch (er) { /* noop */ }
      if (b.dataset.sh === 'copy') { ev.preventDefault(); toast('Текст скопійовано'); }
      if (onSent) onSent(b.dataset.sh === 'telegram' ? 'telegram' : b.dataset.sh);
    }; });
    return w;
  }
  // ---------- CRM ----------
  // Джерело заявки: місце форми — частина source після «#» (assets/lead-form.v1.js), основна форма сторінки — «form»,
  // внесені вручну — «manual», Оздоба — «order» (functions/api/admin/crm.js, placeOf).
  var PLACES = [['form', 'Форма сторінки'], ['#prices', 'Після цін (#prices)'], ['#portfolio', 'Після портфоліо (#portfolio)'],
    ['#project', 'Сторінка проєкту (#project)'], ['#services', 'Послуги (#services)'], ['#blog-mid', 'Стаття, середина (#blog-mid)'],
    ['#blog-end', 'Стаття, кінець (#blog-end)'], ['manual', 'Вручну / дзвінок'], ['finder', 'Бот пошуку'], ['order', 'Замовлення Оздоби']];
  var placeLabel = function (k) { var p = PLACES.find(function (x) { return x[0] === k; }); return p ? p[1].replace(/ \(#.*\)$/, '') : k; };
  var SLA = 15; // хв, як SLA_MIN у functions/_alerts.js
  var utc = function (s) { return new Date(String(s || '').replace(' ', 'T') + 'Z'); };
  // created_at у D1 — UTC; показуємо за київським часом
  var when = function (s, full) {
    var d = utc(s); if (isNaN(d)) return esc(s || '');
    var o = { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
    if (full) o.year = 'numeric';
    return d.toLocaleString('uk-UA', o).replace(',', '');
  };
  var kyivDate = function (d) { return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }); };
  var digits = function (p) { return String(p || '').replace(/\D/g, ''); };
  // швидкі дії: дзвінок, Telegram, Viber, WhatsApp (номер з заявки)
  function quick(r) {
    var d = digits(r.phone);
    // заявка бота пошуку часто лише з публічним Telegram автора (orders.contact_tg)
    var tgu = r.contact_tg && /^[a-z][a-z0-9_]{3,31}$/i.test(r.contact_tg) ? '<a href="https://t.me/' + esc(r.contact_tg) + '" target="_blank" rel="noopener" aria-label="Telegram @' + esc(r.contact_tg) + '" title="Telegram @' + esc(r.contact_tg) + '">@TG</a>' : '';
    if (d.length < 9) return tgu ? '<span class="qa" data-qa>' + tgu + '</span>' : '';
    return '<span class="qa" data-qa>' + tgu +
      '<a href="tel:+' + d + '" aria-label="Подзвонити ' + esc(r.phone) + '" title="Подзвонити">📞</a>' +
      '<a href="https://t.me/+' + d + '" target="_blank" rel="noopener" aria-label="Telegram" title="Telegram">TG</a>' +
      '<a href="viber://chat?number=%2B' + d + '" aria-label="Viber" title="Viber">Vb</a>' +
      '<a href="https://wa.me/' + d + '" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp">WA</a></span>';
  }
  // SLA: нова заявка без «Взяв у роботу» — скільки лишилось до 15 хв або наскільки прострочено (оновлюється щохвилини)
  function slaText(created) {
    var m = Math.floor((Date.now() - utc(created)) / 60000), left = SLA - m;
    if (left > 0) return { cls: 'sla', t: '⏳ ' + left + ' хв до SLA' };
    var over = -left;
    return { cls: 'sla over', t: '⚠ без відповіді ' + (over + SLA < 60 ? (over + SLA) + ' хв' : Math.floor((over + SLA) / 60) + ' год ' + ((over + SLA) % 60) + ' хв') };
  }
  function slaBadge(r) {
    if (r.kind !== 'lead' || r.status !== 'new' || r.taken_at) return '';
    if (Date.now() - utc(r.created_at) > 7 * 86400000) return '';
    var s = slaText(r.created_at);
    return '<span class="' + s.cls + '" data-sla="' + esc(r.created_at) + '">' + s.t + '</span>';
  }
  function tickSla(root) {
    var t = setInterval(function () {
      if (!document.contains(root)) { clearInterval(t); return; }
      $$('[data-sla]', root).forEach(function (el) { var s = slaText(el.dataset.sla); el.className = s.cls; el.textContent = s.t; });
    }, 30000);
  }

  RENDER.crm = function (L) {
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('crmFilters') || '{}') || {}; } catch (e) { /* noop */ }
    var preset = null; try { preset = JSON.parse(sessionStorage.getItem('crmPreset') || 'null'); sessionStorage.removeItem('crmPreset'); } catch (e) { /* noop */ }
    var narrow = window.matchMedia && matchMedia('(max-width: 700px)').matches;
    var S = Object.assign({ view: localStorage.getItem('crmView') || (narrow ? 'table' : 'kanban'), board: can('leads.view_all') ? 'lead' : 'order', kind: '', status: '', assignee: '', staff: '', city: '', min: '', max: '', overdue: false, due: false, q: '', place: '', ref: '', period: '', from: '', to: '' }, saved, preset || {}), ST = {}, LST = {}, OST = {}, rows = [], AS = [], STAFF = [], OFFERS = [];
    if (!can('leads.view_all')) S.board = 'order'; if (!can('orders.view')) S.board = 'lead';
    // довгі списки: сервер віддає сторінками (нові зверху), решта — «Показати ще» / саме під час прокрутки списку; пошук і фільтри —
    // на сервері, тож шукають по всій базі. TOTAL — усього за фільтром, BYST — лічильники стадій (канбан: «12 з 340»).
    var PAGE = 200, TOTAL = 0, MORE = false, NEXT = null, BYST = { lead: {}, order: {} }, lastQ = '', PICK = false;
    var stOf = function (r) { return r.kind === 'lead' ? LST : OST; };
    var FKEYS = ['kind', 'status', 'assignee', 'staff', 'city', 'min', 'max', 'place', 'ref', 'period'];
    var nActive = function () { return FKEYS.filter(function (k) { return S[k]; }).length + (S.due ? 1 : 0) + (S.overdue ? 1 : 0); };
    var myId = ME && ME.id ? String(ME.id) : '';
    // власник і менеджер: «Мої» — одразу після «Усі» (призначені мені), решта — швидкі стани
    var QUICK = [['all', 'Усі']].concat(myId && can('leads.view_all') ? [['mine', 'Мої']] : []).concat([['new', 'Нові'], ['due', 'Звʼязатися сьогодні'], ['overdue', 'Прострочені']]);
    var QSET = { all: {}, new: { status: 'new' }, due: { due: true }, overdue: { overdue: true }, mine: { staff: myId } };
    var clearF = function () { FKEYS.concat(['from', 'to']).forEach(function (k) { S[k] = ''; }); S.due = false; S.overdue = false; };
    // активний швидкий фільтр: задано рівно його поля (пошук не враховуємо)
    var qActive = function (k) { var w = QSET[k], n = Object.keys(w).length; return n === nActive() && Object.keys(w).every(function (x) { return S[x] === w[x]; }); };
    L.innerHTML = '<div class="tb crm-tb">' +
      '<span class="seg"><button type="button" data-v="kanban">Канбан</button><button type="button" data-v="table">' + (narrow ? 'Список' : 'Таблиця') + '</button></span>' +
      (can('leads.view_all') && can('orders.view') ? '<span class="seg" data-boards><button type="button" data-b="lead">Заявки студії</button><button type="button" data-b="order">Оздоба</button></span>' : '') +
      '<input class="grow" data-f="q" type="search" enterkeyhint="search" placeholder="Пошук: номер, телефон, імʼя, сторінка, нотатки" aria-label="Пошук">' +
      '<button class="btn" type="button" data-new>+ Заявка</button><a class="btn ghost" data-csv href="#" download>CSV</a>' +
      '<details class="crm-more"' + (!narrow && nActive() ? ' open' : '') + '><summary>Фільтри <span data-fc></span></summary><div class="tb">' +
      '<select data-f="kind" aria-label="Тип"><option value="">Замовлення й заявки</option><option value="order">Лише замовлення</option><option value="lead">Лише заявки</option></select>' +
      '<select data-f="status" aria-label="Статус"><option value="">Усі статуси</option><option value="open">Відкриті</option></select>' +
      '<select data-f="place" aria-label="Джерело"><option value="">Усі джерела</option>' + PLACES.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select>' +
      '<select data-f="period" aria-label="Період"><option value="">За весь час</option><option value="today">Сьогодні</option><option value="7">7 днів</option><option value="30">30 днів</option><option value="custom">Свої дати…</option></select>' +
      '<span class="row" data-dates hidden><input type="date" data-f="from" aria-label="Від"><span>—</span><input type="date" data-f="to" aria-label="До"></span>' +
      '<select data-f="assignee" aria-label="Відповідальний (текст)"' + (can('staff.view') ? ' hidden' : '') + '><option value="">Усі відповідальні</option></select>' +
      '<select data-f="staff" aria-label="Працівник"' + (can('staff.view') ? '' : ' hidden') + '><option value="">Усі працівники</option><option value="none">Не призначено</option></select>' +
      '<input data-f="city" type="search" placeholder="Область / місто" aria-label="Область або місто" class="w-city">' +
      // сторінка-джерело (попередня сторінка сайту перед заявкою, orders.ref_path) — лише тим, хто бачить усі заявки (власник, менеджер)
      (can('leads.view_all') ? '<input data-f="ref" type="search" placeholder="Сторінка-джерело: /proekty/…" aria-label="Сторінка-джерело" class="w-city">' : '') +
      (can('finance.view') ? '<span class="row"><input data-f="min" type="number" inputmode="numeric" min="0" placeholder="Сума від" aria-label="Сума від" class="w-num"><input data-f="max" type="number" inputmode="numeric" min="0" placeholder="до" aria-label="Сума до" class="w-num"></span>' : '') +
      '<label class="chk"><input type="checkbox" data-f="overdue"> прострочені</label>' +
      '<label class="chk"><input type="checkbox" data-f="due"> звʼязатися сьогодні</label>' +
      '<button class="btn ghost sm" type="button" data-reset>Скинути</button></div></details></div>' +
      // швидкі фільтри: один дотик замість розгортання панелі (ставлять ті самі S.*, що й панель)
      '<div class="crm-q" role="group" aria-label="Швидкі фільтри">' + QUICK.map(function (q) { return '<button type="button" class="pill" data-qf="' + q[0] + '" aria-pressed="false">' + q[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted crm-sum" data-sum aria-live="polite"></p><div data-list></div>' +
      '<div class="crm-bulk row" data-bulk hidden role="region" aria-label="Масові дії"><span>Вибрано: <b data-bn>0</b></span><select data-bs aria-label="Стадія для вибраних"></select>' +
      '<select data-ba aria-label="Відповідальний для вибраних"></select><button type="button" class="btn sm ghost" data-bni>Не цікаво</button><button type="button" class="btn sm ghost" data-bx>Скасувати вибір</button></div>' +
      '<dialog data-dlg aria-label="Заявка"></dialog><datalist id="crmAs"></datalist>';
    var list = $('[data-list]', L), dlg = $('[data-dlg]', L);
    // період → from/to (дати за Києвом)
    function range() {
      if (S.period === 'custom') return { from: S.from, to: S.to };
      if (!S.period) return { from: '', to: '' };
      var t = kyivDate(Date.now());
      if (S.period === 'today') return { from: t, to: t };
      return { from: kyivDate(Date.now() - (+S.period - 1) * 86400000), to: t };
    }
    function qs(csv, limit, before) {
      var r = range();
      return '/api/admin/crm?kind=' + S.kind + '&status=' + S.status + '&assignee=' + encodeURIComponent(S.assignee) + '&due=' + (S.due ? 1 : '') +
        '&staff=' + encodeURIComponent(S.staff) + '&city=' + encodeURIComponent(S.city) + '&min=' + encodeURIComponent(S.min) + '&max=' + encodeURIComponent(S.max) + '&overdue=' + (S.overdue ? 1 : '') +
        '&place=' + encodeURIComponent(S.place) + '&ref=' + encodeURIComponent(S.ref || '') + '&from=' + r.from + '&to=' + r.to + '&q=' + encodeURIComponent(S.q) + (csv ? '&format=csv' : '') + (limit ? '&limit=' + limit : '') + (before ? '&before=' + before : '');
    }
    function segs() {
      $$('[data-v]', L).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === S.view); });
      $$('[data-b]', L).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.b === S.board); });
      var bs = $('[data-boards]', L); if (bs) bs.hidden = S.view !== 'kanban';
      $('[data-csv]', L).href = qs(true); $('[data-csv]', L).hidden = !can('export');
      $('[data-dates]', L).hidden = S.period !== 'custom';
      var n = nActive();
      $('[data-fc]', L).textContent = n ? '· ' + n : '';
      $$('[data-qf]', L).forEach(function (b) { b.setAttribute('aria-pressed', qActive(b.dataset.qf)); });
      try { localStorage.setItem('crmFilters', JSON.stringify({ board: S.board, kind: S.kind, status: S.status, assignee: S.assignee, staff: S.staff, city: S.city, min: S.min, max: S.max, overdue: S.overdue, due: S.due, place: S.place, ref: S.ref, period: S.period, from: S.from, to: S.to })); } catch (e) { /* noop */ }
    }
    $$('[data-v]', L).forEach(function (b) { b.onclick = function () { S.view = b.dataset.v; try { localStorage.setItem('crmView', S.view); } catch (e) { /* noop */ } segs(); transition(draw); }; });
    $$('[data-b]', L).forEach(function (b) { b.onclick = function () { S.board = b.dataset.b; segs(); transition(draw); }; });
    function syncF() { $$('[data-f]', L).forEach(function (el) { var k = el.dataset.f; if (el.type === 'checkbox') el.checked = !!S[k]; else el.value = S[k] || ''; }); }
    $$('[data-qf]', L).forEach(function (b) { b.onclick = function () { clearF(); Object.assign(S, QSET[b.dataset.qf]); syncF(); segs(); load(); }; });
    $$('[data-f]', L).forEach(function (el) {
      var k = el.dataset.f;
      if (el.type === 'checkbox') el.checked = !!S[k]; else el.value = S[k] || '';
      el[k === 'q' || k === 'city' || k === 'ref' || k === 'min' || k === 'max' ? 'oninput' : 'onchange'] = (k === 'q' || k === 'city' || k === 'ref' || k === 'min' || k === 'max' ? debounce : function (f) { return f; })(function () { S[k] = el.type === 'checkbox' ? el.checked : el.value; segs(); load(); });
    });
    $('[data-reset]', L).onclick = function () {
      clearF(); S.q = ''; syncF();
      segs(); load();
    };
    $('[data-new]', L).onclick = function () { edit(null); };
    $('[data-new]', L).hidden = !can('leads.edit');
    var CLOSED = ['delivered', 'cancelled', 'warranty'];
    var isDue = function (r) { return r.next_contact && r.next_contact <= today() && CLOSED.indexOf(r.status) < 0; };
    var amountOf = function (r) { return r.amount != null ? r.amount : r.total; };
    var label = function (r) { return r.name || r.phone || r.email || '—'; };
    var what = function (r) { return r.service || (r.items || []).map(function (i) { return i.name + ' × ' + i.qty; }).join(', '); };
    // час реакції (functions/_alerts.js): скільки хвилин від заявки до «Взяв у роботу» (Telegram або перший статус ≠ «Нове»)
    var mins = function (n) { return n < 60 ? n + ' хв' : Math.floor(n / 60) + ' год' + (n % 60 ? ' ' + (n % 60) + ' хв' : ''); };
    var react = function (r) { return r.reaction_min != null ? '<small class="' + (r.reaction_min > SLA ? 'due' : '') + '" title="Час реакції">⏱ ' + mins(r.reaction_min) + '</small>' : ''; };
    var src = function (r) { return r.place ? '<span class="pill src" title="' + esc(r.source || '') + '">' + esc(placeLabel(r.place)) + (r.page && r.page !== '/' ? ' · ' + esc(r.page.length > 34 ? r.page.slice(0, 33) + '…' : r.page) : '') + '</span>' + refp(r) : ''; };
    // сторінка-джерело: звідки відвідувач перейшов на сторінку з формою (кейс, тур, стаття); клік — фільтр за нею
    var refp = function (r) { return r.ref_path ? ' <button type="button" class="pill src" data-ref="' + esc(r.ref_path) + '" title="Сторінка-джерело — показати всі заявки з неї">← ' + esc(r.ref_path.length > 34 ? r.ref_path.slice(0, 33) + '…' : r.ref_path) + '</button>' : ''; };
    L.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-ref]'); if (!b) return;
      e.preventDefault(); e.stopPropagation(); if (dlg.open) dlg.close(); S.ref = b.dataset.ref; var fi = $('[data-f=ref]', L); if (fi) fi.value = S.ref; segs(); load();
    }, true);
    function sum() {
      var waiting = TOTAL ? WAIT : 0;
      $('[data-sum]', L).innerHTML = (rows.length < TOTAL ? 'Показано ' + rows.length + ' з ' + TOTAL : TOTAL + ' запис(ів)') + (waiting ? ' · <b class="err">нових без відповіді: ' + waiting + '</b>' : '');
    }
    var WAIT = 0;
    // наступна сторінка: дописуємо рядки до вже показаних (вибір, прокрутка й відкриті фільтри лишаються)
    function loadMore(btn) {
      if (!MORE || !NEXT || list.getAttribute('aria-busy')) return;
      list.setAttribute('aria-busy', 'true'); if (btn) { btn.disabled = true; btn.textContent = 'Завантаження…'; }
      var q = qs();
      return api(qs(false, PAGE, NEXT)).then(function (d) {
        list.removeAttribute('aria-busy');
        if (q !== qs()) return; // фільтр змінили, поки вантажилось
        var have = {}; rows.forEach(function (r) { have[r.id] = 1; });
        rows = rows.concat(d.rows.filter(function (r) { return !have[r.id]; }));
        TOTAL = d.total; MORE = d.more; NEXT = d.next; WAIT = d.waiting || 0; BYST = d.by_status || BYST;
        // екран лишається на місці: нові рядки зʼявляються нижче (інакше браузер «тримає» підвал і стрибає в кінець списку,
        // а там знову кнопка — і список довантажився б увесь одразу)
        var y = window.pageYOffset, kn = $('.kn', list), x = kn ? kn.scrollLeft : 0;
        sum(); draw();
        var kn2 = $('.kn', list); if (kn2 && x) kn2.scrollLeft = x;
        window.scrollTo(0, y);
      }, function (e) { list.removeAttribute('aria-busy'); toast(e.message, true); if (btn) { btn.disabled = false; btn.textContent = 'Показати ще'; } });
    }
    function moreRow() {
      if (!MORE) return '';
      var left = Math.max(0, TOTAL - rows.length);
      return '<p class="crm-pg"><button type="button" class="cmp-more" data-more>Показати ще ' + Math.min(PAGE, left || PAGE) + '</button> <small class="muted">лишилось ' + left + ' · пошук і фільтри шукають по всіх ' + TOTAL + '</small></p>';
    }
    var moreIO = null;
    function bindMore() {
      var b = $('[data-more]', list); if (moreIO) { moreIO.disconnect(); moreIO = null; }
      if (!b) return;
      b.onclick = function () { loadMore(b); };
      // список / таблиця: догортали до кінця — наступна сторінка вантажиться сама; канбан — лише кнопкою
      if (S.view !== 'kanban' && window.IntersectionObserver) { moreIO = new IntersectionObserver(function (en) { if (en[0].isIntersecting) loadMore(b); }, { rootMargin: '300px' }); moreIO.observe(b); }
    }
    function load() {
      list.setAttribute('aria-busy', 'true');
      if (!rows.length) list.innerHTML = '<div class="skel-kn" aria-hidden="true">' + '<i></i>'.repeat(narrow ? 3 : 6) + '</div>';
      // той самий фільтр (оновлення після зміни заявки) — стільки ж рядків, скільки вже показано; новий фільтр — перша сторінка
      var q = qs(), n = q === lastQ ? Math.min(1000, Math.max(PAGE, rows.length)) : PAGE;
      lastQ = q;
      return api(qs(false, n)).then(function (d) {
        TOTAL = d.total == null ? d.rows.length : d.total; MORE = !!d.more; NEXT = d.next || null; WAIT = d.waiting || 0; BYST = d.by_status || { lead: {}, order: {} };
        ST = d.statuses; LST = d.lead_statuses || ST; OST = d.order_statuses || ST; rows = d.rows; AS = d.assignees; STAFF = d.staff || []; OFFERS = d.offers || [];
        var fs = $('[data-f=status]', L);
        if (fs.options.length < 3) {
          var g1 = document.createElement('optgroup'); g1.label = 'Заявки студії'; Object.keys(LST).forEach(function (k) { g1.appendChild(new Option(LST[k], k)); });
          var g2 = document.createElement('optgroup'); g2.label = 'Оздоба'; Object.keys(OST).forEach(function (k) { if (!LST[k]) g2.appendChild(new Option(OST[k], k)); });
          fs.appendChild(g1); fs.appendChild(g2); fs.value = S.status;
        }
        var fst = $('[data-f=staff]', L);
        if (fst.options.length < 3) { STAFF.forEach(function (x) { fst.add(new Option(x.name, x.id)); }); fst.value = S.staff; }
        var fa = $('[data-f=assignee]', L), cur = S.assignee;
        fa.length = 1; AS.forEach(function (a) { fa.add(new Option(a, a)); }); fa.value = cur;
        $('#crmAs').innerHTML = AS.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
        sum();
        draw();
      }).then(function () { list.removeAttribute('aria-busy'); }, function (e) { list.removeAttribute('aria-busy'); list.innerHTML = '<p class="err">' + esc(e.message) + ' <button class="btn ghost sm" type="button" data-retry>Повторити</button></p>'; $('[data-retry]', list).onclick = load; });
    }
    // pick — режим вибору на канбані: прапорець на картці, дотик до картки — вибрати / зняти (картка не відкривається й не перетягується)
    function card(r, pick) {
      return '<div class="kn-card' + (r.kind === 'lead' && r.status === 'new' && !r.taken_at ? ' fresh' : '') + (pick && SEL[r.id] ? ' picked' : '') + '" draggable="' + (pick ? 'false' : 'true') + '" data-id="' + r.id + '" tabindex="0" role="button" aria-label="' + esc(r.number + ' ' + label(r)) + '">' +
        '<span class="row sp">' + (pick ? '<label class="sel-l">' + selBox(r) + '</label>' : '') + '<b>' + esc(r.number) + '</b><small>' + when(r.created_at) + '</small></span>' +
        '<span>' + esc(label(r)) + (r.phone && r.name ? ' · ' + esc(r.phone) : '') + '</span>' +
        (what(r) ? '<small>' + esc(what(r).slice(0, 90)) + '</small>' : '') + src(r) +
        '<span>' + (amountOf(r) != null ? '<b>' + money(amountOf(r), r.currency) + '</b> ' : '') + ((r.assignee_name || r.assignee) ? '<span class="who">· ' + esc(r.assignee_name || r.assignee) + '</span>' : '') + (r.city ? ' <small>· ' + esc(r.city) + '</small>' : '') + '</span>' +
        (r.next_contact ? '<small class="' + (isDue(r) ? 'due' : '') + '">↻ ' + esc(r.next_contact) + '</small>' : '') + react(r) + slaBadge(r) + quick(r) + takeB(r) + '</div>';
    }
    // нова заявка, яку ще ніхто не взяв: один дотик — «В роботі», відповідальний — я, час реакції (functions/api/admin/crm.js → takeLead)
    var fresh = function (r) { return r.kind === 'lead' && r.status === 'new' && !r.taken_at; };
    function takeB(r) { return fresh(r) && can('leads.edit') ? '<button type="button" class="btn sm crm-take" data-take="' + r.id + '">Взяти в роботу</button>' : ''; }
    function take(id, b) {
      if (b) { b.disabled = true; b.textContent = 'Беремо…'; }
      return api('/api/admin/crm', { method: 'PATCH', body: { id: id, status: 'in_work' } }).then(function () {
        var r = rows.find(function (x) { return x.id === id; });
        toast((r ? r.number + ': ' : '') + 'взято в роботу — ви відповідальний'); if (dlg.open) dlg.close(); return load();
      }, function (e) { if (b) { b.disabled = false; b.textContent = 'Взяти в роботу'; } toast(e.message, true); });
    }
    L.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-take]'); if (!b) return; e.preventDefault(); e.stopPropagation(); take(+b.dataset.take, b); }, true);
    function bindCards(root) {
      $$('.kn-card', root).forEach(function (c) {
        var pick = function () { var cb = $('[data-sel]', c); if (!cb) return false; cb.checked = !cb.checked; setSel(cb); return true; };
        c.onclick = function (e) { if (e.target.closest('[data-qa],select,[data-take],.sel-l')) return; if (PICK && S.view === 'kanban' && pick()) return; edit(+c.dataset.id); };
        c.onkeydown = function (e) {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); if (PICK && S.view === 'kanban' && pick()) return; edit(+c.dataset.id); return; }
          // клавіатура: Alt/Shift + ← / → — перемістити картку на сусідню стадію
          if ((e.altKey || e.shiftKey) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && c.closest('.kn') && !PICK) {
            e.preventDefault();
            var r = rows.find(function (x) { return x.id === +c.dataset.id; }), keys = Object.keys(stOf(r)), i = keys.indexOf(r.status) + (e.key === 'ArrowRight' ? 1 : -1);
            if (i >= 0 && i < keys.length) move(r.id, keys[i], true);
          }
        };
        c.ondragstart = function (e) { if (PICK) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); };
        c.ondragend = function () { c.classList.remove('drag'); };
      });
    }
    function stSelect(r) { var T = stOf(r); return '<select data-st aria-label="Статус ' + esc(r.number) + '"' + (can(r.kind === 'lead' ? 'leads.edit' : 'orders.edit') ? '' : ' disabled') + '>' + Object.keys(T).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + T[k] + '</option>'; }).join('') + '</select>'; }
    // Оптимістичне переміщення: картка одразу на новій стадії (FLIP-анімація), сервер підтверджує; помилка — повертаємо назад.
    function flip(fn) {
      if (reduced() || S.view !== 'kanban') { fn(); return; }
      var before = {}; $$('.kn-card', list).forEach(function (c) { before[c.dataset.id] = c.getBoundingClientRect(); });
      fn();
      $$('.kn-card', list).forEach(function (c) {
        var b = before[c.dataset.id]; if (!b) { c.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' }); return; }
        var a = c.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
        if (dx || dy) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
    function move(id, status, keyFocus) {
      var r = rows.find(function (x) { return x.id === id; });
      if (!r || r.status === status) return;
      if (!can(r.kind === 'lead' ? 'leads.edit' : 'orders.edit')) { toast('Немає права змінювати цей запис', true); return; }
      var prev = r.status;
      flip(function () { r.status = status; draw(); });
      var live = $('[data-live]', L); if (live) live.textContent = r.number + ': ' + stOf(r)[status];
      if (keyFocus) { var c = $('.kn-card[data-id="' + id + '"]', list); if (c) c.focus(); }
      return api('/api/admin/crm', { method: 'PATCH', body: { id: id, status: status } }).then(function () {
        toast(r.number + ' → ' + stOf(r)[status]);
        var c2 = $('.kn-card[data-id="' + id + '"]', list); if (c2 && !reduced()) c2.animate([{ boxShadow: '0 0 0 3px var(--brass)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700 });
      }, function (e) {
        flip(function () { r.status = prev; draw(); }); // відкат
        toast('Не збережено: ' + e.message, true);
        if (keyFocus) { var c3 = $('.kn-card[data-id="' + id + '"]', list); if (c3) c3.focus(); }
      });
    }
    function draw() {
      if (!rows.length) { list.innerHTML = '<p class="muted">Записів немає' + (S.place || S.period || S.status || S.kind || S.q || S.due || S.assignee ? ' за цими фільтрами. <button class="btn ghost sm" type="button" data-clr>Скинути фільтри</button>' : '. Нові замовлення з Оздоби зʼявляються тут автоматично; заявки — з форм сайту або кнопкою «+ Заявка».') + '</p>'; var c = $('[data-clr]', list); if (c) c.onclick = function () { $('[data-reset]', L).click(); }; return; }
      if (S.view === 'table' && narrow) { // телефон: список карток зі статусом — без горизонтальної прокрутки
        // нова — лише «Взяти в роботу», стадія — після; ліворуч — вибір для масових дій
        list.innerHTML = '<div class="crm-list">' + rows.map(function (r) { return (takeB(r) ? card(r) : card(r).replace(/<\/div>$/, '<div class="crm-st">' + stSelect(r) + '</div></div>')).replace('<span class="row sp">', '<span class="row sp"><label class="sel-l">' + selBox(r) + '</label>'); }).join('') + '</div>' + moreRow();
        bindCards(list); bindSel(list); bindMore();
        $$('[data-st]', list).forEach(function (s) { s.onchange = function () { patch({ id: +s.closest('.kn-card').dataset.id, status: s.value }); }; });
        tickSla(list);
        return;
      }
      if (S.view === 'table') {
        list.innerHTML = '<div class="tscroll"><table class="adm"><thead><tr><th><input type="checkbox" class="sel" data-all aria-label="Вибрати всі"></th><th>Номер</th><th>Дата</th><th>Клієнт</th><th>Що</th><th>Джерело</th><th>Сума</th><th>Статус</th><th>Відповідальний</th><th>Реакція / SLA</th><th>Контакт</th></tr></thead><tbody>' + rows.map(function (r) {
          return '<tr class="clk" data-id="' + r.id + '"><td>' + selBox(r) + '</td><td><b>' + esc(r.number) + '</b><br><small>' + (r.kind === 'lead' ? 'заявка' : 'замовлення') + '</small></td><td><small>' + when(r.created_at) + '</small></td>' +
            '<td>' + esc(label(r)) + '<br><small>' + esc(r.phone) + ' ' + esc(r.email) + '</small>' + quick(r) + '</td><td><small>' + esc(what(r).slice(0, 120)) + '</small></td><td>' + src(r) + '</td>' +
            '<td>' + (amountOf(r) != null ? money(amountOf(r), r.currency) : '') + '</td>' +
            '<td>' + stSelect(r) + takeB(r) + '</td>' +
            '<td>' + esc(r.assignee_name || r.assignee) + '</td><td>' + react(r) + slaBadge(r) + '</td><td class="' + (isDue(r) ? 'err' : '') + '">' + esc(r.next_contact) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + moreRow();
        $$('tr.clk', list).forEach(function (tr) {
          tr.onclick = function (e) { if (e.target.closest('select,input,[data-qa],[data-take]')) return; edit(+tr.dataset.id); };
          $('[data-st]', tr).onchange = function () { patch({ id: +tr.dataset.id, status: this.value }); };
        });
        bindSel(list); bindMore();
        tickSla(list);
        return;
      }
      var BT = S.board === 'order' ? OST : LST, br = rows.filter(function (r) { return r.kind === S.board; });
      var cols = S.status && BT[S.status] ? [S.status] : Object.keys(BT);
      var canBulk = can(S.board === 'lead' ? 'leads.edit' : 'orders.edit');
      // масові дії на канбані: «Вибрати кілька» → прапорці на картках і «вся колонка»; далі — та сама панель, що в таблиці
      list.innerHTML = '<div class="row kn-top">' + (canBulk ? '<button type="button" class="pill kn-pick" data-pick aria-pressed="' + PICK + '">' + (PICK ? 'Готово' : 'Вибрати кілька') + '</button>' : '') +
        '<p class="kn-help muted">' + (PICK ? 'Торкніться карток, які треба змінити разом, — унизу зʼявляться дії: стадія, відповідальний, «Не цікаво».'
          : 'Перетягніть картку або виберіть її й натисніть <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>, щоб змінити стадію. <kbd>/</kbd> — пошук, <kbd>N</kbd> — нова заявка.') + '</p></div><p class="sr" data-live aria-live="polite"></p>' +
        '<div class="kn kn-' + S.board + (PICK ? ' pick' : '') + '">' + cols.map(function (k) {
        var rs = br.filter(function (r) { return r.status === k || (!BT[r.status] && k === 'new'); });
        var sum = rs.reduce(function (s, r) { return s + ((r.currency || 'UAH') === 'UAH' ? (amountOf(r) || 0) : 0); }, 0);
        var all = (BYST[S.board] || {})[k], cnt = all > rs.length ? rs.length + ' з ' + all : rs.length; // завантажено не все — «12 з 340»
        return '<section class="kn-col" data-col="' + k + '" aria-label="' + esc(BT[k]) + '"><h3><span>' + (PICK && rs.length ? '<label class="sel-l"><input type="checkbox" class="sel" data-colall="' + k + '"' + (rs.every(function (r) { return SEL[r.id]; }) ? ' checked' : '') + ' aria-label="Вибрати всю колонку «' + esc(BT[k]) + '»"></label>' : '') + BT[k] + ' · ' + cnt + '</span><small>' + (sum ? money(sum) : '') + '</small></h3>' +
          (rs.length ? rs.map(function (r) { return card(r, PICK); }).join('') : '<p class="kn-empty">—</p>') + '</section>';
      }).join('') + '</div>' + moreRow();
      bindCards(list); bindMore();
      var pb = $('[data-pick]', list);
      if (pb) pb.onclick = function () { PICK = !PICK; if (!PICK) SEL = {}; draw(); var nb = $('[data-pick]', list); if (nb) nb.focus(); };
      if (PICK) {
        bindSel(list);
        $$('[data-colall]', list).forEach(function (c) { c.onclick = function (e) { e.stopPropagation(); var on = c.checked; $$('[data-sel]', c.closest('.kn-col')).forEach(function (x) { x.checked = on; setSel(x, true); }); c.checked = on; bulkBar(); }; });
      } else bulkBar();
      $$('.kn-col', list).forEach(function (col) {
        col.ondragover = function (e) { e.preventDefault(); col.classList.add('over'); };
        col.ondragleave = function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); };
        col.ondrop = function (e) { e.preventDefault(); col.classList.remove('over'); var id = +e.dataTransfer.getData('text/plain'); if (id) move(id, col.dataset.col); };
      });
      tickSla(list);
    }
    // ---------- Масові дії (список / таблиця): вибрати кілька → стадія / відповідальний / «Не цікаво» з підтвердженням ----------
    // Сервер перевіряє кожен рядок окремо (видимість і права), відповідь — скільки змінено й що ні (functions/api/admin/crm.js, bulk).
    var SEL = {};
    var selBox = function (r) { return '<input type="checkbox" class="sel" data-sel="' + r.id + '"' + (SEL[r.id] ? ' checked' : '') + ' aria-label="Вибрати ' + esc(r.number) + '">'; };
    // позначити / зняти один запис (прапорець у списку, таблиці чи на картці канбану)
    function setSel(c, quiet) {
      if (c.checked) SEL[c.dataset.sel] = 1; else delete SEL[c.dataset.sel];
      var k = c.closest('.kn-card'); if (k && k.closest('.kn')) k.classList.toggle('picked', c.checked);
      var col = c.closest('.kn-col'), ca = col && $('[data-colall]', col); if (ca) ca.checked = $$('[data-sel]', col).every(function (x) { return x.checked; });
      if (!quiet) bulkBar();
    }
    function bulkBar() {
      var ids = Object.keys(SEL).map(Number), bar = $('[data-bulk]', L);
      if (!bar) return;
      var picking = PICK && S.view === 'kanban';
      bar.hidden = !ids.length && !picking; $('[data-bn]', bar).textContent = ids.length;
      bar.classList.toggle('idle', !ids.length);
      var lead = ids.every(function (id) { var r = rows.find(function (x) { return x.id === id; }); return r && r.kind === 'lead'; });
      var T = lead ? LST : OST;
      $('[data-bs]', bar).innerHTML = '<option value="">Змінити стадію…</option>' + Object.keys(T).map(function (k) { return '<option value="' + k + '">' + esc(T[k]) + '</option>'; }).join('');
      var ba = $('[data-ba]', bar); ba.hidden = !can('leads.assign') || !STAFF.length;
      ba.innerHTML = '<option value="">Відповідальний…</option><option value="none">— зняти —</option>' + STAFF.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('');
      $('[data-bni]', bar).hidden = !lead;
      $('[data-bs]', bar).disabled = ba.disabled = $('[data-bni]', bar).disabled = !ids.length;
      $('[data-bx]', bar).textContent = picking && !ids.length ? 'Вийти з вибору' : 'Скасувати вибір';
    }
    function bulkRun(body, what) {
      var ids = Object.keys(SEL).map(Number);
      if (!ids.length || !confirm(what + ' — ' + ids.length + ' запис(ів)?')) { bulkBar(); return; }
      api('/api/admin/crm', { method: 'PATCH', body: { bulk: Object.assign({ ids: ids }, body) } }).then(function (d) {
        var bad = d.results.filter(function (x) { return !x.ok; });
        toast('Змінено: ' + d.done + (bad.length ? ' · не змінено ' + bad.length + ' (' + bad[0].error + ')' : ''), !!bad.length);
        SEL = {}; PICK = false; load();
      }, function (e) { toast(e.message, true); });
    }
    function bindSel(root) {
      $$('[data-sel]', root).forEach(function (c) { c.onclick = function (e) { e.stopPropagation(); setSel(c); }; });
      var all = $('[data-all]', root); if (all) all.onclick = function () { $$('[data-sel]', root).forEach(function (c) { c.checked = all.checked; if (all.checked) SEL[c.dataset.sel] = 1; else delete SEL[c.dataset.sel]; }); bulkBar(); };
      var bar = $('[data-bulk]', L);
      if (bar && !bar.dataset.on) {
        bar.dataset.on = 1;
        $('[data-bs]', bar).onchange = function () { var v = this.value; if (v) bulkRun({ status: v }, 'Стадія «' + ($('[data-bs] option:checked', bar).textContent) + '»'); };
        $('[data-ba]', bar).onchange = function () { var v = this.value; if (v) bulkRun({ assignee_staff_id: v === 'none' ? null : +v }, v === 'none' ? 'Зняти відповідального' : 'Відповідальний — ' + $('[data-ba] option:checked', bar).textContent); };
        $('[data-bni]', bar).onclick = function () { var why = prompt('«Не цікаво» → стадія «Скасовано». Причина (для історії; заявки бота — бот більше не покаже схожі):', 'не наш профіль'); if (why !== null) { var ids = Object.keys(SEL); if (ids.length) api('/api/admin/crm', { method: 'PATCH', body: { bulk: { ids: ids.map(Number), not_interested: why || 'без причини' } } }).then(function (d) { toast('«Не цікаво»: ' + d.done + (d.done < ids.length ? ' з ' + ids.length : '')); SEL = {}; PICK = false; load(); }, function (e) { toast(e.message, true); }); } };
        $('[data-bx]', bar).onclick = function () { var had = Object.keys(SEL).length; SEL = {}; if (PICK && (!had || S.view !== 'kanban')) PICK = false; if (S.view === 'kanban') draw(); else { $$('[data-sel],[data-all]', L).forEach(function (c) { c.checked = false; }); bulkBar(); } };
      }
      bulkBar();
    }
    function patch(body) { return api('/api/admin/crm', { method: 'PATCH', body: body }).then(function () { toast('Збережено'); return load(); }, function (e) { toast(e.message, true); load(); }); }
    window.addEventListener('keydown', function onK(e) { if (!document.contains(L)) { window.removeEventListener('keydown', onK); return; } if (e.ctrlKey || e.metaKey || e.altKey || dlg.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === '/') { e.preventDefault(); $('[data-f=q]', L).focus(); }
      else if ((e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') && can('leads.edit')) { e.preventDefault(); edit(null); } });
    // ---------- Пропозиція з заявки: послуга × площа → «від $…» (ставки з сервера, functions/_rates.js) → проєкт однією кнопкою ----------
    var usd = function (n) { return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    function offerCalc(key, area, eu) {
      var o = OFFERS.find(function (x) { return x.key === key; }); if (!o) return null;
      var rate = o.rate ? o.rate[eu ? 1 : 0] : null, a = +String(area || '').replace(',', '.'), min = o.min ? o.min[eu ? 1 : 0] : null;
      var from = rate == null || !(a > 0) ? null : Math.round(min ? Math.max(rate * a, min) : rate * a);
      return { o: o, rate: rate, area: a, min: min, from: from };
    }
    function offerText(c, eu) {
      if (!c || !(c.area > 0)) return '<span class="muted">Вкажіть площу — порахуємо «від».</span>';
      if (c.rate == null) return '<b>За кошторисом</b> <span class="muted">— для ' + (eu ? 'Європи' : 'цієї послуги') + ' ставки «від» немає</span>';
      return '<b>від ' + usd(c.from) + '</b> <span class="muted">' + usd(c.rate) + '/' + c.o.unit + ' × ' + String(c.area).replace('.', ',') + ' ' + c.o.unit +
        (c.min && c.from === c.min && c.rate * c.area < c.min ? ' · мінімум ' + usd(c.min) : '') + '</span>';
    }
    // підказка без збереженої пропозиції: тип — за текстом послуги, площа — з «Площа: 85 м²» (бот пошуку, коментар)
    function offerGuess(r) {
      var t = String((r.service || '') + ' ' + (r.comment || '')).toLowerCase(), m = /площа:\s*([\d]+(?:[.,]\d+)?)/i.exec(r.comment || '');
      var key = /архіт/.test(t) ? 'arch' : /ландшафт/.test(t) ? 'land' : /дизайн|інтерʼ?єр/.test(t) ? 'dz' : /офіс|комерц|магазин|ресторан/.test(t) ? 'office'
        : /будинок|будів|котедж/.test(t) ? 'key' : /меблю|комплект/.test(t) ? 'furn' : /ремонт/.test(t) ? 'reno' : '';
      return { key: key, area: m ? m[1].replace(',', '.') : '' };
    }
    function offerBlock(r) {
      if (!OFFERS.length || !r.id) return '';
      var f = r.offer || offerGuess(r), ed = can('leads.edit');
      return '<section class="full crm-offer" data-offer aria-label="Пропозиція"><h3>Пропозиція' + (r.offer && f.at ? ' <small class="muted">· ' + esc(String(f.at).split('-').reverse().join('.')) + (f.by ? ', ' + esc(f.by) : '') + '</small>' : '') + '</h3>' +
        '<div class="row of-row"><select data-ok aria-label="Послуга"' + (ed ? '' : ' disabled') + '>' + OFFERS.map(function (o) { return '<option value="' + o.key + '"' + (o.key === (f.key || OFFERS[0].key) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>' +
        '<label class="row of-a"><input data-oa type="number" inputmode="decimal" min="0" step="0.1" value="' + esc(f.area || '') + '" placeholder="Площа" aria-label="Площа"' + (ed ? '' : ' disabled') + '><span data-ou>м²</span></label>' +
        '<span class="seg" role="group" aria-label="Регіон"><button type="button" data-rg="ua" aria-pressed="' + (f.region !== 'eu') + '">Україна</button><button type="button" data-rg="eu" aria-pressed="' + (f.region === 'eu') + '">Європа</button></span></div>' +
        '<p class="of-sum" data-os aria-live="polite"></p>' +
        '<div class="row of-act">' + (ed ? '<button type="button" class="btn sm" data-osave>' + (r.offer ? 'Оновити розрахунок' : 'Зберегти розрахунок') + '</button>' : '') +
        (r.project_id ? '<button type="button" class="btn ghost sm" data-opj="' + r.project_id + '">Відкрити проєкт →</button>'
          : can('projects.edit') ? '<button type="button" class="btn ghost sm" data-oconv>Створити проєкт</button>' : '') + '</div>' +
        '<div data-osend></div></section>';
    }
    // «Надіслати КП»: текст мовою заявки (functions/_client_msgs.js) → Telegram / Viber / WhatsApp / копія; кожне надсилання — в історії заявки
    function offerSend(r, B) {
      var box = $('[data-osend]', B); if (!box) return;
      box.innerHTML = '';
      if (!r.kp_text || !can('leads.edit')) return;
      box.innerHTML = '<h4>Надіслати КП клієнту</h4><textarea class="kp-text" rows="5" aria-label="Текст КП">' + esc(r.kp_text) + '</textarea>';
      box.appendChild(shareBar(r.kp_text, r.phone, r.contact_tg, function (ch) {
        api('/api/admin/crm', { method: 'PATCH', body: { id: r.id, offer_sent: ch === 'telegram' ? 'telegram' : ch } }).then(function () { toast('КП: записано в історію заявки'); }, function (e) { toast(e.message, true); });
      }));
    }
    function offerBind(r, form) {
      var B = $('[data-offer]', form); if (!B) return;
      var eu = (r.offer || {}).region === 'eu';
      var calc = function () {
        var c = offerCalc($('[data-ok]', B).value, $('[data-oa]', B).value, eu);
        $('[data-ou]', B).textContent = c ? c.o.unit : 'м²';
        $('[data-os]', B).innerHTML = offerText(c, eu);
        return c;
      };
      $('[data-ok]', B).onchange = calc; $('[data-oa]', B).oninput = calc;
      $$('[data-rg]', B).forEach(function (b) { b.onclick = function () { eu = b.dataset.rg === 'eu'; $$('[data-rg]', B).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); calc(); }; });
      calc();
      if (typeof offerSend === 'function') offerSend(r, B);
      var sv = $('[data-osave]', B);
      if (sv) sv.onclick = function () {
        var c = calc(); if (!c || !(c.area > 0)) { $('[data-oa]', B).focus(); return; }
        sv.disabled = true;
        api('/api/admin/crm', { method: 'PATCH', body: { id: r.id, offer: { key: c.o.key, area: c.area, region: eu ? 'eu' : 'ua' } } }).then(function (x) {
          r.offer = x.offer; r.kp_text = x.kp_text; if (x.status) { r.status = x.status; var se = form.elements.status; if (se) se.value = x.status; }
          sv.disabled = false; sv.textContent = 'Оновити розрахунок'; toast('Розрахунок збережено: ' + (x.offer_line || ''));
          if (typeof offerSend === 'function') offerSend(r, B);
          load();
        }, function (e) { sv.disabled = false; toast(e.message, true); });
      };
      var cv = $('[data-oconv]', B);
      if (cv) cv.onclick = function () {
        if (!confirm('Створити проєкт із заявки ' + r.number + '? Клієнт, контакт, джерело, тип і площа перейдуть у проєкт; етапи — за шаблоном.')) return;
        cv.disabled = true;
        api('/api/admin/projects', { method: 'POST', body: { type: 'from_lead', order_id: r.id } }).then(function (x) { toast('Проєкт створено'); openProject(x.id); },
          function (e) { cv.disabled = false; toast(e.message, true); });
      };
      var op = $('[data-opj]', B); if (op) op.onclick = function () { openProject(+op.dataset.opj); };
    }
    function openProject(pid) {
      try { sessionStorage.setItem('pjOpen', String(pid)); } catch (e) { /* noop */ }
      if (dlg.open) dlg.close();
      location.hash = '#projects';
    }
    // carry — після конфлікту версій: {values: мої зміни, які можна перенести на свіжу заявку, notes: що не перенесено}
    var LLBL = { status: 'Стадія', assignee_staff_id: 'Відповідальний', assignee: 'Відповідальний', amount: 'Сума угоди', currency: 'Валюта', city: 'Область / місто', next_contact: 'Наступний контакт', crm_note: 'Нотатки', manager_note: 'Нотатка для клієнта' };
    function edit(id, carry) {
      var r = id ? rows.find(function (x) { return x.id === id; }) : { kind: 'lead', status: 'new', currency: 'UAH' };
      if (!r) return;
      var f = function (k) { return esc(r[k] == null ? '' : r[k]); };
      var site = r.page ? 'https://cas-develop.com' + r.page : '';
      dlg.innerHTML = '<form method="dialog" class="form two" novalidate><div class="full row sp"><h2>' + (id ? esc(r.number) + ' · ' + (r.kind === 'lead' ? 'заявка' : 'замовлення') : 'Нова заявка') + '</h2><button class="x" type="submit" value="cancel" formnovalidate aria-label="Закрити">✕</button></div>' +
        (id ? '<p class="full muted">' + when(r.created_at, true) + ' (Київ)' + (r.username ? ' · @' + esc(r.username) : '') +
          (r.reaction_min != null ? ' · час реакції: ' + mins(r.reaction_min) : '') + ' ' + slaBadge(r) + '</p>' +
          (fresh(r) && can('leads.edit') ? '<p class="full">' + takeB(r) + '</p>' : '') +
          (r.phone ? '<p class="full"><b>' + esc(r.phone) + '</b> ' + quick(r) + '</p>' : '') +
          (r.place ? '<p class="full muted">Джерело: ' + src(r) + (site ? ' <a href="' + esc(site) + '" target="_blank" rel="noopener">відкрити сторінку ↗</a>' : '') + (r.form ? ' · форма ' + esc(r.form) : '') + (r.lang ? ' · ' + esc(r.lang) : '') + (r.utm ? ' · UTM ' + esc(r.utm) : '') + '</p>' : '') +
          (r.ref_path ? '<p class="full muted">Сторінка-джерело: <a href="https://cas-develop.com' + esc(r.ref_path) + '" target="_blank" rel="noopener">' + esc(r.ref_path) + ' ↗</a></p>' : '') +
          (what(r) ? '<p class="full">' + esc(what(r)) + '</p>' : '') + (r.comment ? '<p class="full muted" style="white-space:pre-wrap">' + esc(r.comment) + '</p>' : '') +
          (r.kind === 'lead' ? offerBlock(r) : '') +
          (r.kind === 'order' ? '<p class="full muted">Сума замовлення: ' + money(r.total) + (r.on_request ? ' + ' + r.on_request + ' поз. за запитом' : '') + ' · оплата: ' + esc(r.payment) + (r.delivery ? ' · ' + esc(r.delivery) : '') + '</p>' : '')
          : '<label class="f"><span>Імʼя</span><input name="name" autocomplete="off"></label><label class="f"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" placeholder="+380 97 123 45 67"></label>' +
          '<label class="f"><span>Email</span><input name="email" type="email" inputmode="email"></label><label class="f"><span>Джерело</span><input name="source" placeholder="дзвінок, Instagram, рекомендація"></label>' +
          '<label class="f full"><span>Послуга / що потрібно</span><input name="service"></label><label class="f full"><span>Коментар</span><textarea name="comment"></textarea></label>') +
        '<label class="f"><span>Стадія</span><select name="status">' + Object.keys(stOf(r)).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + stOf(r)[k] + '</option>'; }).join('') + '</select></label>' +
        (can('leads.assign') ? (STAFF.length ? '<label class="f"><span>Відповідальний</span><select name="assignee_staff_id"><option value="">— не призначено —</option>' +
          STAFF.map(function (x) { return '<option value="' + x.id + '"' + (x.id === r.assignee_staff_id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>'
          : '<label class="f"><span>Відповідальний</span><input name="assignee" list="crmAs" value="' + f('assignee') + '"></label>') : '') +
        (can('finance.view') ? '<label class="f"><span>Сума угоди</span><span class="row"><input name="amount" type="number" inputmode="numeric" min="0" step="1" class="grow" value="' + f('amount') + '" placeholder="' + (r.total != null ? r.total : '') + '"' + (can('finance.edit') ? '' : ' disabled') + '>' +
        '<select name="currency" aria-label="Валюта"' + (can('finance.edit') ? '' : ' disabled') + '>' + ['UAH', 'USD', 'EUR'].map(function (c) { return '<option' + (c === (r.currency || 'UAH') ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></span></label>' : '') +
        '<label class="f"><span>Область / місто</span><input name="city" value="' + f('city') + '" placeholder="Київ, Львівська обл."></label>' +
        (id && r.client_id && can('clients.view') ? '<p class="f"><button type="button" class="btn ghost sm" data-client="' + r.client_id + '">Картка клієнта →</button></p>' : '') +
        '<div class="f"><label class="f"><span>Наступний контакт</span><input name="next_contact" type="date" value="' + f('next_contact') + '"></label>' +
          '<span class="row nc-q" role="group" aria-label="Швидко: наступний контакт">' + [[0, 'Сьогодні'], [1, 'Завтра'], [3, '+3 дні'], [7, '+тиждень']].map(function (x) { return '<button type="button" class="pill" data-nc="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</span></div>' +
        '<label class="f full"><span>Нотатки (бачать лише менеджери)</span><textarea name="crm_note">' + f('crm_note') + '</textarea></label>' +
        (r.kind === 'order' ? '<label class="f full"><span>Нотатка для клієнта (видно в його кабінеті)</span><input name="manager_note" value="' + f('manager_note') + '"></label>' : '') +
        (id ? '<label class="f full"><span>Коментар до зміни (в історію)</span><input name="note"></label>' : '') +
        '<div class="full row stick-d"><button class="btn" type="submit" value="save">Зберегти</button><button class="btn ghost" type="submit" value="cancel" formnovalidate>Закрити</button><span class="err" data-e role="alert"></span></div>' +
        (id && window.CASCrm4 ? '<div class="full" data-tasks></div>' : '') +
        (id ? '<ul class="ev full" data-ev><li>Історія…</li></ul>' : '') + '</form>';
      var form = $('form', dlg), dirty = false;
      if (carry) { // мої зміни зі старої форми — на свіжу заявку
        Object.keys(carry.values).forEach(function (k) { var el = form.elements[k]; if (el) { el.value = carry.values[k] == null ? '' : carry.values[k]; dirty = true; } });
        if (carry.notes.length) form.firstElementChild.insertAdjacentHTML('afterend', '<div class="full">' + clashBox(carry.notes) + '</div>');
      }
      // блоки «Пропозиція» і «Задачі» зберігаються самі — не позначають форму зміненою
      var mark = function (e) { if (!e.target.closest('[data-offer],[data-tasks]')) dirty = true; };
      form.addEventListener('input', mark); form.addEventListener('change', mark);
      if (id && window.CASCrm4) window.CASCrm4.taskBlock($('[data-tasks]', form), { order_id: id });
      if (r.kind === 'lead' && id) offerBind(r, form);
      $$('[data-nc]', form).forEach(function (b) { b.onclick = function () { form.elements.next_contact.value = kyivDate(Date.now() + (+b.dataset.nc) * 86400000); dirty = true; }; });
      var leave = function () { return !dirty || confirm('Закрити без збереження змін?'); };
      dlg.oncancel = function (e) { if (!leave()) e.preventDefault(); }; // Esc
      var cb = $('[data-client]', dlg); if (cb) cb.onclick = function () { dlg.close(); window.CASAdminKit.openClient(+cb.dataset.client); };
      form.onsubmit = function (e) {
        if (e.submitter && e.submitter.value === 'cancel') { if (!leave()) e.preventDefault(); return; }
        e.preventDefault();
        var b = {}; new FormData(form).forEach(function (v, k) { b[k] = v; });
        if ('assignee_staff_id' in b) b.assignee_staff_id = b.assignee_staff_id ? +b.assignee_staff_id : null;
        if (id) Object.keys(b).forEach(function (k) { if (k !== 'note' && String(b[k] == null ? '' : b[k]) === String(r[k] == null ? '' : r[k])) delete b[k]; }); // лише змінене
        // перевірка до запиту — зрозуміле повідомлення замість помилки сервера
        var err = '';
        if (!id && !b.name.trim() && !b.phone.trim() && !b.email.trim()) err = 'Вкажіть хоча б імʼя, телефон або email';
        else if (b.phone && digits(b.phone).length < 9) err = 'Телефон: щонайменше 9 цифр, напр. +380 97 123 45 67';
        else if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) err = 'Перевірте email';
        else if (b.amount !== '' && b.amount != null && !(+b.amount >= 0)) err = 'Сума — додатне число';
        if (err) { $('[data-e]', dlg).textContent = err; return; }
        var sv = $('button[value=save]', form); sv.disabled = true; sv.textContent = 'Зберігаємо…';
        // картка зберігає з версією заявки (r.ver): якщо її за цей час змінив інший менеджер — 409 зі свіжим рядком, далі — діалог
        var p = id ? api('/api/admin/crm', { method: 'PATCH', body: Object.assign({ id: id, ver: r.ver }, b) })
          : api('/api/admin/crm', { method: 'POST', body: b }).then(function (d) { if (b.status !== 'new') return api('/api/admin/crm', { method: 'PATCH', body: { id: d.id, status: b.status } }); });
        p.then(function () { dlg.close(); toast('Збережено'); load(); }, function (er) {
          sv.disabled = false; sv.textContent = 'Зберегти';
          if (!(id && isConflict(er) && er.data.row)) { $('[data-e]', dlg).textContent = er.message; return; }
          conflictDialog(er.message, er.data.last, 'заявку').then(function (v) {
            if (v === 'cancel') return;
            var fresh = er.data.row, i = rows.findIndex(function (x) { return x.id === id; });
            if (i >= 0) rows[i] = fresh;
            if (v === 'reload') { edit(id); return; }
            var m = merge3(Object.keys(b).filter(function (k) { return k !== 'note'; }), r, b, fresh), mine = Object.assign({}, m.apply);
            if (b.note) mine.note = b.note;
            var show = function (k, x) { return k === 'status' ? (stOf(fresh)[x] || x) : k === 'assignee_staff_id' ? ((STAFF.find(function (y) { return String(y.id) === String(x); }) || {}).name || (x ? '#' + x : '— не призначено —')) : x; };
            if (m.clash.length) { edit(id, { values: mine, notes: m.clash.map(function (c) { return clashNote(LLBL[c.k] || c.k, { fresh: show(c.k, c.fresh), mine: show(c.k, c.mine) }); }) }); return; }
            if (!Object.keys(mine).length) { dlg.close(); toast('Дані оновлено — ваші зміни вже були збережені'); load(); return; }
            api('/api/admin/crm', { method: 'PATCH', body: Object.assign({ id: id, ver: fresh.ver }, mine) }).then(function () { dlg.close(); toast('Збережено — ваші зміни додано до свіжих даних'); load(); },
              function (e2) { toast(e2.message, true); edit(id, { values: mine, notes: [] }); });
          });
        });
      };
      if (id) api('/api/admin/crm?events=' + id).then(function (d) {
        $('[data-ev]', dlg).innerHTML = d.events.map(function (e) { return '<li>' + when(e.created_at, true) + ' — ' + esc(e.label) + (e.note ? ': ' + esc(e.note) : '') + ' <small>(' + esc(e.author) + ')</small></li>'; }).join('') || '<li>Подій немає</li>';
      }, function () { var ev = $('[data-ev]', dlg); if (ev) ev.innerHTML = '<li>Історію не вдалося завантажити</li>'; });
      if (!dlg.open) dlg.showModal();
    }
    segs();
    // картка заявки за посиланням із «Задач» (crm4.v1.js ставить crmOpen = {id, n: номер}): є в завантаженому списку — відкриваємо; немає
    // (фільтри, інша сторінка списку) — шукаємо за номером тим самим /api/admin/crm, тобто лише в межах прав на заявки
    var want = null; try { want = JSON.parse(sessionStorage.getItem('crmOpen') || 'null'); sessionStorage.removeItem('crmOpen'); } catch (e) { /* noop */ }
    return load().then(function () {
      if (!want || !want.id) return;
      if (rows.some(function (x) { return x.id === want.id; })) return edit(want.id);
      var miss = function () { toast('Заявку ' + (want.n || '') + ' не знайдено або немає доступу', true); };
      if (!want.n) return miss();
      return api('/api/admin/crm?q=' + encodeURIComponent(want.n) + '&limit=20').then(function (d) {
        var r = (d.rows || []).filter(function (x) { return x.id === want.id; })[0];
        if (!r) return miss();
        rows.push(r); edit(r.id);
      }, miss);
    });
  };

  // ---------- Аналітика: заявки за 7/30/90 днів по джерелах, сторінках, днях (GET /api/admin/crm?stats=1) ----------
  RENDER.stats = function (L) {
    var days = +(localStorage.getItem('statsDays') || 7);
    var pct = function (a, b) { return b ? Math.round(a * 100 / b) + '%' : '—'; };
    function go(place) {
      var pr = days === 90 ? { period: 'custom', from: kyivDate(Date.now() - 89 * 86400000), to: kyivDate(Date.now()) } : { period: String(days) };
      try { sessionStorage.setItem('crmPreset', JSON.stringify(Object.assign({ place: place, status: '', kind: '', q: '', due: false, assignee: '' }, pr))); } catch (e) { /* noop */ }
      location.hash = 'crm';
    }
    function table(title, rows, keyName, labelFn, link) {
      if (!rows.length) return '';
      return '<h3 class="st-h">' + title + '</h3><div class="tscroll"><table class="adm st-t"><thead><tr><th>' + keyName + '</th><th>Заявок</th><th>Взято</th><th>КП</th><th>Оплачено</th><th title="Частка заявок, що дійшли до КП">→ КП</th><th title="Частка заявок, що дійшли до оплати">→ оплата</th></tr></thead><tbody>' +
        rows.map(function (g) {
          return '<tr' + (link ? ' class="clk" data-place="' + esc(g.key) + '"' : '') + '><td>' + labelFn(g.key) + '</td><td><b>' + g.n + '</b></td><td>' + g.taken + '</td><td>' + g.quote + '</td><td>' + g.paid + '</td><td>' + pct(g.quote, g.n) + '</td><td>' + pct(g.paid, g.n) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function draw() {
      L.innerHTML = '<div class="tb"><span class="seg">' + [7, 30, 90].map(function (n) { return '<button type="button" data-d="' + n + '" aria-pressed="' + (n === days) + '">' + n + ' днів</button>'; }).join('') + '</span><span class="muted" data-per></span></div><div data-st><p class="muted">Завантаження…</p></div>';
      $$('[data-d]', L).forEach(function (b) { b.onclick = function () { days = +b.dataset.d; try { localStorage.setItem('statsDays', days); } catch (e) { /* noop */ } draw(); }; });
      api('/api/admin/crm?stats=1&days=' + days).then(function (s) {
        $('[data-per]', L).textContent = s.from.split('-').reverse().join('.') + ' — ' + s.to.split('-').reverse().join('.');
        var max = Math.max.apply(null, s.by_day.map(function (d) { return d.n; }).concat(1));
        var diff = s.previous ? Math.round((s.total - s.previous) * 100 / s.previous) : null;
        var f = s.funnel || { n: 0, taken: 0, quote: 0, paid: 0 };
        $('[data-st]', L).innerHTML =
          '<div class="kpi">' +
          '<div><b>' + s.total + '</b><span>заявок і замовлень' + (diff != null ? ' <em class="' + (diff >= 0 ? 'ok' : 'err') + '">' + (diff >= 0 ? '+' : '') + diff + '%</em>' : '') + '</span><small>заявок ' + s.leads + ' · Оздоба ' + s.orders + ' · попередні ' + days + ' дн.: ' + s.previous + '</small></div>' +
          '<div><b class="' + (s.open_new ? 'err' : '') + '">' + s.open_new + '</b><span>у статусі «Нове»</span><small>' + (s.open_new ? 'потребують реакції' : 'усі розібрані') + '</small></div>' +
          '<div><b>' + (s.reaction.avg != null ? mins0(s.reaction.avg) : '—') + '</b><span>середній час реакції</span><small>у межах ' + s.reaction.sla + ' хв: ' + pct(s.reaction.within, s.reaction.n) + ' (' + s.reaction.within + ' з ' + s.reaction.n + ')</small></div>' +
          '<div><b>' + pct(f.quote, f.n) + '</b><span>дійшли до КП</span><small>оплачено: ' + pct(f.paid, f.n) + ' (' + f.paid + ')</small></div></div>' +
          '<h3 class="st-h">По днях</h3><div class="bars" role="img" aria-label="Заявки по днях">' + s.by_day.map(function (d) {
            return '<span title="' + d.date.split('-').reverse().join('.') + ': ' + d.n + '"><i style="height:' + Math.round(d.n * 100 / max) + '%"></i><small>' + (days <= 30 ? d.date.slice(8) : '') + '</small></span>';
          }).join('') + '</div>' +
          table('По джерелах (місце форми)', s.by_place, 'Джерело', function (k) { return esc(placeLabel(k)) + (/^#/.test(k) ? ' <small>' + esc(k) + '</small>' : ''); }, true) +
          table('По сторінках', s.by_page, 'Сторінка', function (k) { return '<a href="https://cas-develop.com' + esc(k) + '" target="_blank" rel="noopener">' + esc(k) + '</a>'; }) +
          (s.by_ref && s.by_ref.length ? table('По сторінках-джерелах (звідки перейшли на сторінку з формою)', s.by_ref, 'Сторінка-джерело', function (k) { return '<a href="https://cas-develop.com' + esc(k) + '" target="_blank" rel="noopener">' + esc(k) + '</a>'; }) : '') +
          table('По формах', s.by_form, 'Форма', esc) + table('По мовах', s.by_lang, 'Мова', esc) +
          '<p class="muted"><small>«Конверсія» тут — частка заявок, що дійшли до КП / оплати у воронці CRM (відвідування сторінок рахує Clarity, не адмінка). ' +
          'Місце форми — з адреси, яку пише форма: «#prices», «#portfolio» тощо. Форма, мова й UTM — для заявок після застосування міграції 0009. Клік по рядку джерела відкриває ці заявки в CRM.</small></p>';
        $$('tr[data-place]', L).forEach(function (tr) { tr.onclick = function () { go(tr.dataset.place); }; });
      }, function (e) { $('[data-st]', L).innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    var mins0 = function (n) { return n < 60 ? n + ' хв' : Math.floor(n / 60) + ' год ' + (n % 60) + ' хв'; };
    draw();
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
    L.innerHTML = '<div class="tb"><input class="grow" data-q type="search" placeholder="Пошук: імʼя, телефон, email"></div><p class="muted">Натисніть на клієнта — картка з усією історією: заявки, замовлення, обʼєкти, платежі, документи.</p><div data-l></div>';
    function load() {
      return api('/api/admin/clients?q=' + encodeURIComponent($('[data-q]', L).value)).then(function (d) {
        $('[data-l]', L).innerHTML = '<div class="tscroll"><table class="adm"><tr><th>#</th><th>Клієнт</th><th>Контакти</th><th>Замовлень</th><th>Сума</th><th>Створено</th></tr>' + d.clients.map(function (x) {
          return '<tr class="clk" data-cid="' + x.id + '" tabindex="0"><td>' + x.id + '</td><td>' + esc(x.name) + '<br><small>' + esc(x.provider) + (x.username ? ' @' + esc(x.username) : '') + '</small></td><td>' + esc(x.phone) + '<br>' + esc(x.email) + '<br><small>' + esc(x.city) + ' ' + esc(x.company) + '</small></td><td>' + x.orders + '</td><td>' + (x.total != null ? money(x.total) : '—') + '</td><td><small>' + esc(x.created_at) + '</small></td></tr>';
        }).join('') + '</table></div>';
        $$('tr[data-cid]', L).forEach(function (tr) { tr.onclick = tr.onkeydown = function (e) { if (e.type === 'keydown' && e.key !== 'Enter') return; window.CASAdminKit.openClient(+tr.dataset.cid); }; });
      });
    }
    $('[data-q]', L).oninput = debounce(load);
    return load();
  };

  // ---------- Проєкти клієнтів (/api/admin/projects, migrations/0005_account.sql) ----------
  // Клієнт бачить їх у /kabinet/proekty і /kabinet/obiekt («Онлайн-контроль», міграція 0008): етапи зі статусами й прогресом,
  // фотозвіти (з привʼязкою до етапу), документи й акти етапів, графік платежів, камера 24/7, особистий код партнера.
  var SVC = { design: 'Дизайн-проєкт', arch: 'Архітектурний проєкт', repair: 'Ремонт', build: 'Будівництво', furnish: 'Комплектація меблями', landscape: 'Ландшафт', other: 'Інше' };
  var PST = { active: 'Триває', paused: 'На паузі', done: 'Завершено' };
  var DKIND = { contract: 'Договір', estimate: 'Кошторис', invoice: 'Рахунок', act: 'Акт етапу', design: 'Дизайн-проєкт', render: 'Візуалізації', drawing: 'Креслення', spec: 'Специфікація', other: 'Інше' };
  var HACT = { approve: '✓ погодив етап', unapprove: '✕ погодження знято', revise: '✏️ попросив правки', remind: '🔔 нагадування клієнту' };
  var DESIGN_SVC = ['design', 'arch']; // проєктування: погодження клієнтом, правки, результати етапів
  var SST = { planned: 'Заплановано', in_progress: 'В роботі', review: 'Приймання', done: 'Виконано', paused: 'Пауза' };
  var PAYST = { planned: 'Заплановано', due: 'До оплати', paid: 'Оплачено' };
  var SCHEMES = { '50/50': [50, 50], '50/30/20': [50, 30, 20], '50/40/10': [50, 40, 10] }; // лише підказка-заготовка: рядки потім редагуються
  // вкладки списку: проєктування окремо від робіт на обʼєкті (комплектація, ландшафт, інше — у «Усі»)
  var PGROUP = [['all', 'Усі', null], ['design', 'Проєктування', ['design', 'arch']], ['works', 'Ремонт і будівництво', ['repair', 'build']]];
  var PF = { group: 'all', service: '', status: '', staff: '', late: false, q: '' }; // фільтри списку (до перезавантаження сторінки)
  var progressOf = function (st) { return st && st.length ? Math.round(st.reduce(function (s, x) { return s + (+x.progress || 0); }, 0) / st.length) : 0; };
  var curStage = function (st) { st = st || []; return st.filter(function (s) { return s.status === 'in_progress' || s.status === 'review'; })[0] || st.filter(function (s) { return s.status !== 'done'; })[0] || null; };
  var isLate = function (dt, status) { return !!(dt && dt < today() && status !== 'done'); };
  var payLate = function (y) { return y.status !== 'paid' && !!y.due_date && y.due_date < today(); };
  var dmy = function (s) { return s ? String(s).slice(0, 10).split('-').reverse().join('.') : ''; };
  var PAPI = '/api/admin/projects';
  RENDER.projects = function (L, cid, openId, carry) {
    if (!openId) try { openId = +sessionStorage.getItem('pjOpen') || null; sessionStorage.removeItem('pjOpen'); } catch (e) { /* noop */ } // з картки заявки
    L.innerHTML = '<p class="muted">Завантаження…</p>';
    return Promise.all([api('/api/admin/clients'), api(PAPI + (cid ? '?client_id=' + cid : '')), api('/api/admin/partner-codes').catch(function () { return { codes: [] }; }),
      can('staff.view') ? api('/api/admin/staff').catch(function () { return { staff: [] }; }) : Promise.resolve({ staff: [] })]).then(function (r) {
      var clients = r[0].clients, d = r[1], codes = r[2].codes || [];
      d._staff = (r[3].staff || []).filter(function (x) { return x.active; });
      d._clients = clients;
      var clName = function (c) { return (c.name || 'Клієнт #' + c.id) + (c.phone ? ' · ' + c.phone : c.email ? ' · ' + c.email : ''); };
      var canEdit = !d.can || d.can.edit !== false;
      L.innerHTML = '<div class="tb"><select data-c class="grow" aria-label="Клієнт"><option value="">Усі клієнти</option>' + clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(clName(c)) + '</option>'; }).join('') + '</select>' +
        (canEdit ? '<button class="btn" data-new>+ Новий проєкт</button>' : '') + '</div>' +
        '<div class="note">Проєкти, етапи, фотозвіти, документи, платежі й камеру бачить лише цей клієнт у своєму кабінеті (<b>/kabinet/proekty</b>, <b>/kabinet/obiekt</b> — «Онлайн-контроль»). Клієнт має хоча б раз увійти на сайт (Telegram, Google або телефон), щоб зʼявитися у списку.' +
        (d.online === false ? '<br><b>Камера й графік платежів зʼявляться після застосування міграції 0008 (автоматично під час деплою).</b>' : '') +
        (d.tasks_ready === false ? '<br><b>Дата здачі й задачі зʼявляться після застосування міграції 0012 (автоматично під час деплою).</b>' : '') + '</div>' +
        (cid ? '<div class="tb" data-pc><b>Особистий код партнера клієнта:</b><input data-code list="pcList" placeholder="DIZ-…" style="text-transform:uppercase" value="' + esc((codes.find(function (x) { return x.client_id === cid; }) || {}).code || '') + '"><datalist id="pcList">' + codes.map(function (x) { return '<option value="' + esc(x.code) + '">' + esc(x.name || '') + '</option>'; }).join('') + '</datalist><button class="btn ghost sm" data-bind>Привʼязати</button><button class="btn ghost sm" data-unbind>Відвʼязати</button></div>' : '') +
        '<div class="tb pj-filters"><div class="seg" role="group" aria-label="Група проєктів" data-grp></div>' +
        '<select data-fs aria-label="Тип проєкту"><option value="">Усі типи</option>' + Object.keys(SVC).map(function (k) { return '<option value="' + k + '"' + (PF.service === k ? ' selected' : '') + '>' + SVC[k] + '</option>'; }).join('') + '</select>' +
        '<select data-fst aria-label="Стан"><option value="">Будь-який стан</option>' + Object.keys(PST).map(function (k) { return '<option value="' + k + '"' + (PF.status === k ? ' selected' : '') + '>' + PST[k] + '</option>'; }).join('') + '</select>' +
        '<select data-fa aria-label="Відповідальний"></select>' +
        '<label class="row pj-late"><input type="checkbox" data-fl' + (PF.late ? ' checked' : '') + '> Лише прострочені</label>' +
        '<input type="search" class="grow" data-fq placeholder="Пошук: назва, клієнт, адреса" aria-label="Пошук проєктів" value="' + esc(PF.q) + '"></div>' +
        '<div data-list></div>';
      $('[data-c]', L).onchange = function () { RENDER.projects(L, +this.value || null); };
      if (cid) {
        var pc = function (code) { api(PAPI, { method: 'POST', body: { type: 'partner', client_id: cid, code: code } }).then(function () { toast(code ? 'Код привʼязано' : 'Код відвʼязано'); RENDER.projects(L, cid); }, function (e) { toast(e.message, true); }); };
        $('[data-bind]', L).onclick = function () { var v = $('[data-code]', L).value.trim(); if (v) pc(v); };
        $('[data-unbind]', L).onclick = function () { pc(null); };
      }
      var nb = $('[data-new]', L); if (nb) nb.onclick = function () { newProjectForm(L, d, cid); };
      // відповідальні: з довідника персоналу або з самих проєктів (без staff.view)
      var heads = {};
      d._staff.forEach(function (x) { heads[x.id] = x.name; });
      d.projects.forEach(function (p) { if (p.assignee_staff_id && !heads[p.assignee_staff_id]) heads[p.assignee_staff_id] = p.assignee_name || '#' + p.assignee_staff_id; });
      $('[data-fa]', L).innerHTML = '<option value="">Усі відповідальні</option><option value="none"' + (PF.staff === 'none' ? ' selected' : '') + '>Без відповідального</option>' +
        Object.keys(heads).map(function (k) { return '<option value="' + k + '"' + (String(PF.staff) === k ? ' selected' : '') + '>' + esc(heads[k]) + '</option>'; }).join('');
      var lateP = function (p) { return p.overdue || isLate(p.deadline, p.status) || (d.payments || []).some(function (y) { return y.project_id === p.id && payLate(y); }) ||
        (d.tasks || []).some(function (t) { return t.project_id === p.id && !t.done && isLate(t.due_date); }); };
      var hay = function (p) { var c = clients.find(function (x) { return x.id === p.client_id; }) || {}; return [p.title, p.client_name, c.name, c.phone, c.email, p.address].join(' ').toLowerCase(); };
      var inGroup = function (p, g) { var G = PGROUP.filter(function (x) { return x[0] === g; })[0]; return !G || !G[2] || G[2].indexOf(p.service) >= 0; };
      var pass = function (p) {
        if (!inGroup(p, PF.group)) return false;
        if (PF.service && p.service !== PF.service) return false;
        if (PF.status && p.status !== PF.status) return false;
        if (PF.staff === 'none' ? p.assignee_staff_id : PF.staff && String(p.assignee_staff_id) !== String(PF.staff)) return false;
        if (PF.late && !lateP(p)) return false;
        return !PF.q || hay(p).indexOf(PF.q.toLowerCase()) >= 0;
      };
      var list = $('[data-list]', L);
      function draw() {
        $('[data-grp]', L).innerHTML = PGROUP.map(function (g) { var n = d.projects.filter(function (p) { return inGroup(p, g[0]); }).length; return '<button type="button" data-g="' + g[0] + '" aria-pressed="' + (PF.group === g[0]) + '">' + g[1] + ' <small>' + n + '</small></button>'; }).join('');
        $$('[data-g]', L).forEach(function (b) { b.onclick = function () { PF.group = b.dataset.g; draw(); }; });
        var rows = d.projects.filter(pass);
        if (!d.projects.length) { list.innerHTML = '<p class="muted">Проєктів немає.' + (canEdit ? ' Натисніть «+ Новий проєкт» — етапи підставляться за типом.' : '') + '</p>'; return; }
        if (!rows.length) { list.innerHTML = '<p class="muted">За цими фільтрами нічого немає.</p>'; return; }
        list.innerHTML = '<div class="tscroll"><table class="adm pj-list"><tr><th>Проєкт</th><th>Тип</th><th>Поточний етап</th><th>Здача</th><th>Задачі</th><th>Стан</th></tr>' + rows.map(function (p) {
          var pr = progressOf(p.stages), cs = curStage(p.stages), late = isLate(p.deadline, p.status);
          var lp = (d.payments || []).filter(function (y) { return y.project_id === p.id && payLate(y); }).length;
          var lt = (d.tasks || []).filter(function (t) { return t.project_id === p.id && !t.done && isLate(t.due_date); }).length;
          return '<tr class="clk" data-id="' + p.id + '" tabindex="0"><td><b>' + esc(p.title) + '</b><br><small>' + esc(p.client_name || '#' + p.client_id) + (p.address ? ' · ' + esc(p.address) : '') + '</small>' +
            (p.assignee_name ? '<br><small class="muted">Відповідальний: ' + esc(p.assignee_name) + '</small>' : '') + (lp ? ' <span class="pill warn">💸 прострочено платежів: ' + lp + '</span>' : '') + '</td>' +
            '<td><small>' + esc(SVC[p.service] || p.service || '') + '</small></td>' +
            '<td>' + (cs ? esc(cs.name) + '<br><small class="muted">' + esc(SST[cs.status] || '') + (cs.approved_at ? ' · ✓ погоджено' : '') + '</small>' : p.stages && p.stages.length ? '<small class="ok">усі етапи виконано</small>' : '<small class="muted">—</small>') +
            '<br><progress max="100" value="' + pr + '" style="width:90px" aria-label="Прогрес ' + pr + '%"></progress> <small>' + pr + '%</small></td>' +
            '<td>' + (p.deadline ? '<span class="' + (late ? 'err' : '') + '">' + dmy(p.deadline) + '</span>' + (late ? '<br><span class="pill warn">прострочено</span>' : '') : '<small class="muted">—</small>') + '</td>' +
            '<td>' + (p.tasks_total ? '<b>' + (p.tasks_done || 0) + '/' + p.tasks_total + '</b>' + (lt ? '<br><small class="err">прострочено: ' + lt + '</small>' : '') : '<small class="muted">—</small>') + '</td>' +
            '<td><span class="pill' + (p.status === 'active' ? ' on' : '') + '">' + esc(PST[p.status] || p.status) + '</span>' + (p.next_step ? '<br><small>' + esc(p.next_step) + (p.next_date ? ' · ' + dmy(p.next_date) : '') + '</small>' : '') + '</td></tr>';
        }).join('') + '</table></div><p class="muted">Показано ' + rows.length + ' з ' + d.projects.length + '.</p>';
        $$('tr.clk', list).forEach(function (tr) { tr.onclick = tr.onkeydown = function (e) { if (e.type === 'keydown' && e.key !== 'Enter') return; projectForm(L, d, +tr.dataset.id, cid); }; });
      }
      $('[data-fs]', L).onchange = function () { PF.service = this.value; draw(); };
      $('[data-fst]', L).onchange = function () { PF.status = this.value; draw(); };
      $('[data-fa]', L).onchange = function () { PF.staff = this.value; draw(); };
      $('[data-fl]', L).onchange = function () { PF.late = this.checked; draw(); };
      $('[data-fq]', L).oninput = debounce(function () { PF.q = $('[data-fq]', L).value.trim(); draw(); }, 200);
      draw();
      if (openId) projectForm(L, d, openId, cid, carry);
    }, function (e) { L.innerHTML = '<p class="err">' + esc(e.message) + (/оновлюється/.test(e.message) ? ' (міграція 0005 ще не застосована — зʼявиться після деплою)' : '') + '</p>'; });
  };
  // «Новий проєкт»: тип → шаблон етапів (з сервера, d.templates), клієнт, адреса, площа, договір, здача, відповідальний, графік платежів
  function newProjectForm(L, d, cid) {
    var T = d.templates || {}, clients = d._clients || [], STF = d._staff || [];
    var defSvc = PF.group === 'design' ? 'design' : PF.service || 'repair';
    var fin = can('finance.edit') && d.online !== false;
    L.innerHTML = '<div class="tb"><button class="btn ghost sm" data-back>← До списку</button><b class="grow">Новий проєкт</b></div>' +
      '<form class="form two" data-nf><label class="f"><span>Тип проєкту</span><select name="service" required>' + Object.keys(SVC).map(function (k) { return '<option value="' + k + '"' + (k === defSvc ? ' selected' : '') + '>' + SVC[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Клієнт</span><select name="client_id" required><option value="">— оберіть клієнта —</option>' + clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc((c.name || 'Клієнт #' + c.id) + (c.phone ? ' · ' + c.phone : '')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f full"><span>Назва</span><input name="title" required maxlength="120" placeholder="Дизайн квартири, ЖК … / Ремонт офісу на …"></label>' +
      '<label class="f"><span>Адреса обʼєкта</span><input name="address" maxlength="200"></label><label class="f"><span>Площа, м²</span><input name="area" type="number" min="0" step="0.1"></label>' +
      (can('finance.edit') ? '<label class="f"><span>Сума договору</span><span class="row"><input name="contract_amount" type="number" min="0" step="1" class="grow"><select name="contract_currency" aria-label="Валюта"><option>USD</option><option>UAH</option><option>EUR</option></select></span></label>' : '') +
      '<label class="f"><span>Дата здачі (за договором)</span><input name="deadline" type="date"' + (d.tasks_ready === false ? ' disabled title="Після міграції 0012"' : '') + '></label>' +
      (STF.length ? '<label class="f"><span>Відповідальний</span><select name="assignee_staff_id"><option value="">— пізніше —</option>' + STF.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + ' · ' + esc(x.role_label || '') + '</option>'; }).join('') + '</select></label>' : '') +
      (fin ? '<label class="f"><span>Графік платежів</span><select name="scheme"><option value="">Без графіка (додати пізніше)</option>' + Object.keys(SCHEMES).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('') + '</select>' +
        '<small class="muted">Аванс — до першого етапу, проміжний — до середнього, останній — до останнього; суми — від суми договору.</small></label>' : '') +
      '<div class="f full"><span>Етапи за шаблоном <small class="muted">(після створення можна перейменувати, додати чи прибрати)</small></span><ol class="pj-tpl" data-tpl></ol></div>' +
      '<p class="err full" data-e role="alert"></p><div class="full row"><button class="btn" type="submit">Створити проєкт</button></div></form>';
    var f = $('[data-nf]', L);
    var tpl = function () { var a = T[f.service.value] || []; $('[data-tpl]', L).innerHTML = a.length ? a.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') : '<li class="muted">Без шаблону — етапи додасте в картці проєкту</li>'; };
    f.service.onchange = tpl; tpl();
    var wf = watchForm(f, 'формі нового проєкту');
    $('[data-back]', L).onclick = function () { if (wf.leave()) RENDER.projects(L, cid); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var F = f.elements, err = $('[data-e]', L);
      if (!F.client_id.value) { err.textContent = 'Оберіть клієнта (клієнт має хоча б раз увійти на сайт)'; F.client_id.focus(); return; }
      if (!F.title.value.trim()) { err.textContent = 'Вкажіть назву проєкту'; F.title.focus(); return; }
      var b = { type: 'project', client_id: +F.client_id.value, title: F.title.value.trim(), service: F.service.value, address: F.address.value, area: F.area.value };
      if (F.deadline && !F.deadline.disabled && F.deadline.value) b.deadline = F.deadline.value;
      if (F.assignee_staff_id && F.assignee_staff_id.value) b.assignee_staff_id = +F.assignee_staff_id.value;
      if (F.contract_amount && F.contract_amount.value !== '') { b.contract_amount = F.contract_amount.value; b.contract_currency = F.contract_currency.value; }
      if (F.scheme && F.scheme.value) b.scheme = F.scheme.value;
      var btn = $('button[type=submit]', f); btn.disabled = true; err.textContent = '';
      api(PAPI, { method: 'POST', body: b }).then(function (x) { toast('Проєкт створено — етапи за шаблоном «' + SVC[b.service] + '»'); RENDER.projects(L, cid && b.client_id !== cid ? null : cid, x.id); },
        function (e2) { btn.disabled = false; err.textContent = e2.message; });
    };
  }
  // carry — мої незбережені зміни зі старої форми (після конфлікту версій): переносимо на свіжі дані те, що не перетинається з чужими змінами
  function projectForm(L, d, id, cid, carry) {
    var p = d.projects.find(function (x) { return x.id === id; }); if (!p) return;
    var stages = clone(p.stages || []), reports = d.reports.filter(function (r) { return r.project_id === id; }), docs = d.documents.filter(function (x) { return x.client_id === p.client_id && (!x.project_id || x.project_id === id); });
    var pays = (d.payments || []).filter(function (x) { return x.project_id === id; });
    // незбережені зміни форми проєкту (поля, етапи, команда): «Зберегти» внизу екрана з позначкою; вихід/перезавантаження після
    // додавання задачі, платежу, звіту чи документа не губить їх мовчки — спершу питаємо
    var dirty = false;
    var setDirty = function (v) { dirty = v; var m = $('[data-dirty]', L); if (m) m.hidden = !v; var sb = $('[data-save]', L); if (sb) sb.classList.toggle('ghost', !v); };
    var back = function () { if (!dirty || confirm('Є незбережені зміни проєкту. Вийти без збереження?')) { dirty = false; RENDER.projects(L, cid); } };
    var reload = function () { if (dirty && confirm('У формі проєкту є незбережені зміни. Зберегти їх зараз?')) return save(); dirty = false; RENDER.projects(L, cid, id); };
    var opt = function (o, v) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + o[k] + '</option>'; }).join(''); };
    // етапи зі збереженим id (нові етапи отримують id після «Зберегти проєкт»)
    var stOpt = function (v) { return '<option value="">— без етапу —</option>' + (p.stages || []).filter(function (s) { return s.id; }).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === v ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join(''); };
    var stName = function (sid) { var s = (p.stages || []).find(function (x) { return x.id === sid; }); return s ? s.name : ''; };
    L.innerHTML = '<div class="tb"><button class="btn ghost sm" data-back>← До списку</button><b class="grow">' + esc(p.title) + ' <small>· ' + esc(p.client_name || '#' + p.client_id) + '</small></b>' +
      '<span class="pj-prog" title="Загальна готовність — середнє етапів"><progress max="100" value="' + progressOf(p.stages) + '" aria-label="Готовність ' + progressOf(p.stages) + '%"></progress> <b>' + progressOf(p.stages) + '%</b></span><button class="btn danger sm" data-del>Видалити проєкт</button></div>' +
      (p.status === 'done' && can('projects.edit') ? '<div class="row pj-review">' + (p.review_asked_at ? '<span class="pill on">★ Відгук попросили ' + esc(String(p.review_asked_at).slice(0, 16)) + (p.review_channel ? ' · ' + esc(p.review_channel) : '') + '</span>'
        : '<button type="button" class="btn sm" data-review>Попросити відгук у Google</button><small class="muted">' + (p.done_at ? 'автоматично — через 2 доби після завершення, якщо клієнт у Telegram' : 'один раз; текст мовою клієнта') + '</small>') + '</div><div data-reviewb></div>' : '') +
      (p.lead ? '<p class="muted pj-lead">З заявки <b>' + esc(p.lead.number) + '</b>' + (p.lead.source ? ' · ' + esc(p.lead.source) : '') + (p.lead.ref_path ? ' · сторінка-джерело ' + esc(p.lead.ref_path) : '') + '</p>' : '') +
      '<form class="form two" data-f><label class="f full"><span>Назва</span><input name="title" value="' + esc(p.title) + '"></label>' +
      '<label class="f"><span>Послуга</span><select name="service">' + opt(SVC, p.service) + '</select></label><label class="f"><span>Стан</span><select name="status">' + opt(PST, p.status) + '</select></label>' +
      '<label class="f"><span>Адреса обʼєкта</span><input name="address" value="' + esc(p.address || '') + '"></label><label class="f"><span>Площа, м²</span><input name="area" type="number" min="0" step="0.1" value="' + esc(p.area == null ? '' : p.area) + '"></label>' +
      '<label class="f"><span>Наступний крок (бачить клієнт)</span><input name="next_step" value="' + esc(p.next_step || '') + '"></label><label class="f"><span>Дата наступного кроку</span><input name="next_date" type="date" value="' + esc(p.next_date || '') + '"></label>' +
      '<label class="f"><span>Дата здачі (за договором)' + (isLate(p.deadline, p.status) ? ' <b class="err">— прострочено</b>' : '') + '</span><input name="deadline" type="date" value="' + esc(p.deadline || '') + '"' + (d.tasks_ready === false ? ' disabled title="Після міграції 0012"' : '') + '></label>' +
      '<label class="f"><span>Відповідальний менеджер (текст для клієнта)</span><input name="manager" value="' + esc(p.manager || '') + '"></label>' +
      '<label class="f full"><span>Камера 24/7 — посилання (за доп. оплату; порожньо — клієнт бачить «Підключити камеру»)</span><input name="camera_url" type="url" inputmode="url" placeholder="https://youtube.com/live/… або посилання хмари камери (Ezviz, Hik-Connect, Imou…)" value="' + esc(p.camera_url || '') + '"' + (d.online === false ? ' disabled' : '') + '>' +
      '<small class="muted">YouTube-трансляція (доступ «за посиланням») вбудовується в кабінет; пряме посилання на кадр .jpg — показується картинкою; інше — кнопкою «Відкрити камеру» в новій вкладці. Лише https, без логіна й пароля в адресі. Бачить тільки цей клієнт.</small></label>' +
      '<label class="f full"><span>Підказка до камери (бачить клієнт)</span><input name="camera_note" maxlength="300" placeholder="Напр.: вхід у застосунок Ezviz — за вашим номером телефону" value="' + esc(p.camera_note || '') + '"' + (d.online === false ? ' disabled' : '') + '></label>' +
      (can('finance.view') ? '<label class="f"><span>Сума договору</span><span class="row"><input name="contract_amount" type="number" min="0" step="1" class="grow" value="' + esc(p.contract_amount == null ? '' : p.contract_amount) + '"' + (can('finance.edit') ? '' : ' disabled') + '>' +
        '<select name="contract_currency" aria-label="Валюта"' + (can('finance.edit') ? '' : ' disabled') + '>' + ['USD', 'UAH', 'EUR'].map(function (c) { return '<option' + (c === (p.contract_currency || 'USD') ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></span></label>' : '') +
      '<fieldset class="f full team-fs" data-team><legend>Команда обʼєкта (бачать обʼєкт у своєму кабінеті /kabinet/team)</legend><p class="muted">Завантаження…</p></fieldset>' +
      '<div class="f full"><span>Етапи: статус і прогрес <small data-pr></small></span><div data-st></div></div></form>' +
      '<div class="row pj-save"><button class="btn ghost" data-save>Зберегти проєкт</button><span class="err" data-dirty hidden>є незбережені зміни</span></div>' +
      '<h3>Задачі по етапах <small class="muted" data-tkn></small></h3><div data-tk></div>' +
      (window.CASCrm4 ? '<div data-gtk></div>' : '') +
      '<h3>Контакти обʼєкта <small class="muted">(бригади, майстри, постачальники — бачить команда обʼєкта, не клієнт)</small></h3><div data-pct></div>' +
      ((d.issues || []).some(function (i) { return i.project_id === id; }) ? '<h3>Проблеми на обʼєкті (бачить лише команда)</h3><div data-iss></div>' : '') +
      '<h3>Фотозвіти</h3><div data-rep></div>' +
      '<form class="form two" data-rf style="margin-top:10px"><label class="f"><span>Дата</span><input name="date" type="date" value="' + today() + '"></label><label class="f"><span>Заголовок</span><input name="title" placeholder="Тиждень 5: стяжка й електрика"></label>' +
      '<label class="f"><span>Етап</span><select name="stage_id">' + stOpt('') + '</select></label>' +
      '<label class="f full"><span>Опис</span><textarea name="note" rows="2"></textarea></label>' +
      '<label class="f full"><span>Фото — https-посилання, по одному в рядку (Google Drive, Telegram, сайт) або кнопка «Завантажити фото»</span><textarea name="photos" rows="3" placeholder="https://…"></textarea></label>' +
      '<div class="full row"><button type="button" class="btn ghost sm" data-upl>Завантажити фото</button><button class="btn" type="submit">Додати фотозвіт</button><span class="muted" data-us></span></div></form>' +
      '<h3 style="margin-top:24px">Документи</h3><div data-docs></div>' +
      '<form class="tb" data-df style="margin-top:10px"><select name="kind" aria-label="Тип">' + opt(DKIND, 'contract') + '</select><select name="stage_id" aria-label="Етап (для акта)">' + stOpt('') + '</select><input name="title" placeholder="Назва: Договір №12 / Акт етапу 2" required><input name="url" class="grow" type="url" placeholder="https://… (Google Drive, PDF)" required><button class="btn" type="submit">Додати документ</button></form>' +
      '<h3 style="margin-top:24px">Графік платежів</h3><p class="muted">Схема — під клієнта (50/50, 50/30/20, 50/40/10, розбивка, аванс від 10%). Клієнт бачить таблицю в «Онлайн-контролі».</p><div data-pay></div>' +
      (d.online === false ? '<p class="muted">Платежі — після міграції 0008.</p>' :
      '<form class="tb" data-pf style="margin-top:10px;flex-wrap:wrap"><input name="title" placeholder="Аванс / Після чорнових робіт" required style="min-width:180px"><select name="stage_id" aria-label="Етап">' + stOpt('') + '</select>' +
      '<input name="pct" type="number" min="0" max="100" step="0.5" placeholder="%" aria-label="Частка, %" style="width:70px"><input name="amount" type="number" min="0" step="1" placeholder="Сума" aria-label="Сума" style="width:110px">' +
      '<select name="currency" aria-label="Валюта"><option>USD</option><option>UAH</option><option>EUR</option></select><input name="due_date" type="date" aria-label="Дата за планом">' +
      '<select name="status" aria-label="Статус">' + opt(PAYST, 'planned') + '</select><input name="note" placeholder="Примітка" class="grow"><button class="btn" type="submit">Додати платіж</button></form>' +
      '<div class="tb"><span class="muted">Заготовка схеми (додасть рядки з %):</span>' + Object.keys(SCHEMES).map(function (k) { return '<button type="button" class="btn ghost sm" data-sch="' + k + '">' + k + '</button>'; }).join('') + '</div>');
    var stEl = $('[data-st]', L);
    var isDesign = function () { return DESIGN_SVC.indexOf(val('[name=service]', L)) >= 0; };
    var STG = d._staff || [];
    // результати етапу — документи цього проєкту з stage_id (візуалізації, креслення, специфікації, акти); клієнт бачить їх у кабінеті
    var stDocs = function (sid) { return sid ? docs.filter(function (x) { return x.project_id === id && x.stage_id === sid; }) : []; };
    // дизайн-проєкт: «Погоджено клієнтом» (дата) і лічильник правок — у JSON етапу; клієнт бачить «погоджено» в кабінеті
    // погодження й лічильник правок веде сервер (їх змінює і клієнт у кабінеті): форма надсилає лише дію — _approve (true / false)
    // і _rd (скільки правок додати чи відняти), а не готові значення
    var revOf = function (s) { return Math.max(0, Math.min(99, (+s.revisions || 0) + (+s._rd || 0))); };
    var apprRow = function (s, i) {
      if (!isDesign()) return '';
      return '<div class="row pj-appr">' + (s.approved_at ? '<span class="pill on">✓ Погоджено клієнтом ' + dmy(s.approved_at) + (s.approved_by === 'client' ? ' (у кабінеті)' : '') + '</span><button type="button" class="btn ghost sm" data-unap="' + i + '">Скасувати погодження</button>'
        : '<button type="button" class="btn ghost sm" data-ap="' + i + '"' + (s.id ? '' : ' disabled title="Спершу збережіть проєкт"') + '>Погоджено клієнтом</button>') +
        '<span class="muted">Правки:</span><button type="button" class="btn ghost sm" data-rv="' + i + '" data-dv="-1" aria-label="Менше правок">−</button><b data-rvn="' + i + '">' + revOf(s) + '</b>' +
        '<button type="button" class="btn ghost sm" data-rv="' + i + '" data-dv="1" aria-label="Ще одна правка">+</button>' +
        '<label class="row pj-rmax"><span class="muted">з</span><input type="number" min="0" max="20" data-k="rev_max" data-i="' + i + '" value="' + esc(s.rev_max || '') + '" placeholder="∞" aria-label="Кругів правок за договором"></label>' +
        (s.rev_max && revOf(s) > s.rev_max ? '<span class="pill warn">понад договір</span>' : '') + '</div>' +
        (s.rev_note && !s.approved_at ? '<p class="pj-revn"><b>Правки від клієнта ' + dmy(s.rev_at) + ':</b> «' + esc(s.rev_note) + '»</p>' : '') +
        (s.id && !s.approved_at && (s.status === 'review' || s.status === 'done') && can('projects.edit') ? '<div class="row pj-rem"><button type="button" class="btn ghost sm" data-rem="' + esc(s.id) + '">Нагадати клієнту</button>' +
          '<small class="muted">' + (s.remind_at ? 'нагадували ' + esc(s.remind_at) + ' · не частіше 1 разу на 48 год' : 'чекає погодження' + (s.review_at ? ' з ' + esc(s.review_at) : '') + '; автоматично — через добу, якщо клієнт у Telegram') + '</small></div><div data-remb="' + esc(s.id) + '"></div>' : '') +
        (s.hist && s.hist.length ? '<details class="pj-hist"><summary>Історія етапу · ' + s.hist.length + '</summary><ul>' + s.hist.slice().reverse().map(function (h) {
          return '<li><small class="muted">' + esc(h.at) + '</small> ' + esc(HACT[h.act] || h.act) + (h.by ? ' — ' + esc(h.by) : '') + (h.note ? ': «' + esc(h.note) + '»' : '') + '</li>'; }).join('') + '</ul></details>' : '') +
        (function () { var L2 = stDocs(s.id); return L2.length ? '<p class="pj-dlv"><span class="muted">Результати етапу:</span> ' + L2.map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(DKIND[x.kind] || '') + ': ' + esc(x.title) + '</a>'; }).join(' · ') + '</p>'
          : ''; })(); // результати додаються у «Документи» нижче (тип Візуалізації / Креслення / Специфікація + етап)
    };
    function drawStages() {
      stEl.innerHTML = stages.map(function (s, i) {
        return '<div class="pj-stage"><div class="row" style="margin-bottom:8px"><input class="grow" data-k="name" data-i="' + i + '" value="' + esc(s.name) + '" placeholder="Етап"><select data-k="status" data-i="' + i + '" aria-label="Статус етапу">' + opt(SST, s.status || (+s.progress >= 100 ? 'done' : +s.progress > 0 ? 'in_progress' : 'planned')) + '</select><input type="range" min="0" max="100" step="5" data-k="progress" data-i="' + i + '" value="' + (+s.progress || 0) + '" aria-label="Прогрес"><b data-pv="' + i + '" style="width:44px">' + (+s.progress || 0) + '%</b>' +
          '<input type="date" data-k="start" data-i="' + i + '" value="' + esc(s.start || '') + '" aria-label="Початок"><input type="date" data-k="end" data-i="' + i + '" value="' + esc(s.end || '') + '" aria-label="Термін етапу"' + (isLate(s.end, s.status) ? ' class="late" title="Термін етапу минув"' : '') + '>' +
          (STG.length ? '<select data-k="staff_id" data-i="' + i + '" aria-label="Відповідальний за етап"><option value="">— відповідальний —</option>' + STG.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === String(s.staff_id || '') ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' : '') + '<input data-k="note" data-i="' + i + '" value="' + esc(s.note || '') + '" placeholder="Примітка"><button type="button" class="je-add" data-sd="' + i + '" aria-label="Прибрати етап">✕</button></div>' + apprRow(s, i) + '</div>';
      }).join('') + '<button type="button" class="je-add" data-sa>+ етап</button>' + (isDesign() ? '<p class="muted">«Погоджено клієнтом» зберігається одразу; лічильник правок — кнопкою «Зберегти проєкт».</p>' : '');
      $('[data-pr]', L).textContent = '· загалом ' + progressOf(stages) + '%';
      $$('[data-k]', stEl).forEach(function (x) { x.oninput = x.onchange = function () { var s = stages[+x.dataset.i]; s[x.dataset.k] = ['progress', 'staff_id', 'rev_max'].indexOf(x.dataset.k) >= 0 ? (+x.value || (x.dataset.k === 'progress' ? 0 : null)) : x.value;
        if (x.dataset.k === 'status' && x.value === 'done' && +s.progress < 100) { s.progress = 100; drawStages(); return; }
        if (x.dataset.k === 'progress') { $('[data-pv="' + x.dataset.i + '"]', stEl).textContent = x.value + '%'; $('[data-pr]', L).textContent = '· загалом ' + progressOf(stages) + '%'; } }; });
      $$('[data-sd]', stEl).forEach(function (x) { x.onclick = function () {
        var s = stages[+x.dataset.sd];
        if (s.id && !confirm('Прибрати етап «' + (s.name || '') + '»? Фотозвіти, акти й платежі етапу залишаться без етапу. Зміна — після «Зберегти проєкт».')) return;
        stages.splice(+x.dataset.sd, 1); drawStages(); setDirty(true); }; });
      $('[data-sa]', stEl).onclick = function () { stages.push({ name: '', progress: 0 }); drawStages(); setDirty(true); var n = $$('[data-k=name]', stEl).pop(); if (n) n.focus(); };
      $$('[data-rem]', stEl).forEach(function (x) { x.onclick = function () { nudge({ type: 'remind', project_id: id, stage_id: x.dataset.rem }, $('[data-remb="' + x.dataset.rem + '"]', stEl)); }; });
      var op = function (s, v, msg) { s._approve = v; save(msg).then(function (ok) { if (!ok) delete s._approve; }); };
      $$('[data-ap]', stEl).forEach(function (x) { x.onclick = function () { op(stages[+x.dataset.ap], true, 'Етап погоджено клієнтом'); }; });
      $$('[data-unap]', stEl).forEach(function (x) { x.onclick = function () { if (confirm('Зняти позначку «погоджено»?')) op(stages[+x.dataset.unap], false, 'Погодження знято'); }; });
      $$('[data-rv]', stEl).forEach(function (x) { x.onclick = function () { var s = stages[+x.dataset.rv], was = revOf(s); s._rd = (+s._rd || 0) + (+x.dataset.dv); if (revOf(s) === was) s._rd -= +x.dataset.dv; $('[data-rvn="' + x.dataset.rv + '"]', stEl).textContent = revOf(s); setDirty(true); }; });
    }
    var formEl = $('[data-f]', L);
    var snap = function () { var o = {}; new FormData(formEl).forEach(function (v, k) { o[k] = v; }); return o; };
    var baseF = snap(); // поля, як їх показали при відкритті, — основа для злиття після конфлікту версій
    var SK = ['name', 'status', 'progress', 'start', 'end', 'note', 'staff_id', 'rev_max'];
    var SLBL = { name: 'назва', status: 'статус', progress: 'прогрес, %', start: 'початок', end: 'термін', note: 'примітка', staff_id: 'відповідальний', rev_max: 'кругів правок' };
    var notes = [], carried = false;
    if (carry) {
      var showV = function (k, v) { return k === 'status' ? (SST[v] || v) : k === 'staff_id' ? ((STG.find(function (x) { return String(x.id) === String(v); }) || {}).name || (v ? '#' + v : '—')) : v; };
      var nS = function (v, k) { return k === 'progress' ? String(+v || 0) : String(v == null ? '' : v).trim(); };
      var fm = merge3(Object.keys(carry.mineF), carry.baseF, carry.mineF, baseF);
      Object.keys(fm.apply).forEach(function (k) { var el = formEl.elements[k]; if (el) { el.value = fm.apply[k]; carried = true; } });
      fm.clash.forEach(function (c) { var el = formEl.elements[c.k], lb = el && el.closest('label') && $('span', el.closest('label')); notes.push(clashNote(lb ? lb.textContent.replace(/\s*\(.*$/, '') : c.k, c)); });
      var bSt = {}, mineIds = {};
      (carry.baseSt || []).forEach(function (b) { if (b.id) bSt[b.id] = b; });
      carry.mineSt.forEach(function (m) {
        if (!m.id) { if (String(m.name || '').trim()) { stages.push(m); carried = true; } return; } // мій новий етап
        mineIds[m.id] = 1;
        var f = stages.find(function (x) { return x.id === m.id; }), b = bSt[m.id] || {};
        if (!f) { notes.push('Етап «' + esc(m.name) + '» прибрав інший користувач — ваші зміни до нього не перенесено'); return; }
        var r = merge3(SK, b, m, f, nS);
        Object.keys(r.apply).forEach(function (k) { f[k] = r.apply[k]; carried = true; });
        r.clash.forEach(function (c) { notes.push('Етап «' + esc(f.name) + '» — ' + clashNote(SLBL[c.k], { fresh: showV(c.k, c.fresh), mine: showV(c.k, c.mine) })); });
        if (m._rd) { f._rd = m._rd; carried = true; }
        if (m._approve === true && !f.approved_at) { f._approve = true; carried = true; }
        if (m._approve === false && f.approved_at) { if (f.approved_by === 'client' && b.approved_by !== 'client') notes.push('Етап «' + esc(f.name) + '»: його щойно погодив клієнт — погодження не знято'); else { f._approve = false; carried = true; } }
      });
      (carry.baseSt || []).forEach(function (b) { // етапи, які я прибрав у старій формі
        if (!b.id || mineIds[b.id]) return;
        var i = stages.findIndex(function (x) { return x.id === b.id; }); if (i < 0) return;
        var f = stages[i];
        if (SK.every(function (k) { return nS(f[k], k) === nS(b[k], k); }) && (f.approved_at || '') === (b.approved_at || '') && (+f.revisions || 0) === (+b.revisions || 0)) { stages.splice(i, 1); carried = true; }
        else notes.push('Етап «' + esc(f.name) + '» ви прибрали, але його змінив інший користувач (або клієнт) — етап залишено');
      });
    }
    drawStages();
    $('[name=service]', L).onchange = function () { drawStages(); setDirty(true); };
    ['input', 'change'].forEach(function (ev) { formEl.addEventListener(ev, function (e) { if (!e.target.closest('[data-ap],[data-unap]')) setDirty(true); }); });
    GUARD = function () { return document.contains(stEl) && dirty ? 'У картці проєкту «' + p.title + '» є незбережені зміни.' : ''; }; // вкладки панелі й закриття сторінки
    $('[data-back]', L).onclick = back;
    var fail = function (e) { toast(e.message, true); };
    // команда: відповідальний + виконавці з задачею (project_staff); працівник отримує Telegram і бачить обʼєкт у /kabinet/team
    var team = (p.team || []).map(function (t) { return { id: t.staff_id, task: t.task || '' }; }), lead = p.assignee_staff_id || '', STF = [];
    var baseTeam = clone(team), baseLead = lead;
    if (carry) {
      var tn = function (t) { return JSON.stringify((t || []).filter(function (x) { return x.id; }).map(function (x) { return [+x.id, x.task || '']; }).sort()); };
      if (tn(carry.mineTeam) !== tn(carry.baseTeam)) {
        if (tn(team) === tn(carry.baseTeam)) { team = clone(carry.mineTeam); carried = true; }
        else if (tn(team) !== tn(carry.mineTeam)) notes.push('Команда обʼєкта: її змінив інший користувач — ваші зміни команди не перенесено');
      }
      if (String(carry.mineLead || '') !== String(carry.baseLead || '')) {
        if (String(lead || '') === String(carry.baseLead || '')) { lead = carry.mineLead; carried = true; }
        else if (String(lead || '') !== String(carry.mineLead || '')) notes.push('Відповідальний за обʼєкт: його змінив інший користувач — ваш вибір не перенесено');
      }
    }
    // після конфлікту версій: без перетинів — одразу зберігаємо мої зміни поверх свіжих даних; з перетинами — показуємо, що не перенесено
    var afterCarry = function () {
      if (!carry) return;
      if (notes.length) { formEl.insertAdjacentHTML('beforebegin', clashBox(notes)); setDirty(carried); toast('Дані оновлено. Частину ваших змін не перенесено — перевірте позначені поля й натисніть «Зберегти проєкт»', true); var cn = $('[data-cfn]', L); if (cn && cn.scrollIntoView) cn.scrollIntoView({ block: 'center' }); }
      else if (carried) { setDirty(true); save('Проєкт збережено — ваші зміни додано до свіжих даних'); }
      else toast('Дані оновлено — незбережених змін не було');
    };
    function drawTeam() {
      var fs = $('[data-team]', L); if (!fs) return;
      var opts = function (v) { return '<option value="">— оберіть —</option>' + STF.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === String(v) ? ' selected' : '') + '>' + esc(x.name) + ' · ' + esc(x.role_label) + '</option>'; }).join(''); };
      fs.innerHTML = '<legend>Команда обʼєкта (бачать обʼєкт у своєму кабінеті /kabinet/team)</legend>' +
        '<label class="f"><span>Відповідальний</span><select data-lead>' + opts(lead) + '</select></label>' +
        team.map(function (t, i) { return '<div class="row"><select data-tm="' + i + '" aria-label="Виконавець">' + opts(t.id) + '</select><input data-tt="' + i + '" value="' + esc(t.task) + '" placeholder="Задача: чорнові роботи, замір 3D, зйомка з дрона" class="grow"><button type="button" class="je-add" data-tx="' + i + '" aria-label="Прибрати">✕</button></div>'; }).join('') +
        '<button type="button" class="je-add" data-ta>+ виконавець</button>';
      $('[data-lead]', fs).onchange = function () { lead = this.value; };
      $$('[data-tm]', fs).forEach(function (x) { x.onchange = function () { team[+x.dataset.tm].id = +x.value || null; }; });
      $$('[data-tt]', fs).forEach(function (x) { x.oninput = function () { team[+x.dataset.tt].task = x.value; }; });
      $$('[data-tx]', fs).forEach(function (x) { x.onclick = function () { team.splice(+x.dataset.tx, 1); drawTeam(); setDirty(true); }; });
      $('[data-ta]', fs).onclick = function () { team.push({ id: null, task: '' }); drawTeam(); setDirty(true); };
    }
    if (can('staff.view')) api('/api/admin/staff').then(function (r) { STF = r.staff.filter(function (x) { return x.active; }); drawTeam(); }, function () { var fs = $('[data-team]', L); if (fs) fs.hidden = true; }).then(afterCarry);
    else { var tfs = $('[data-team]', L); if (tfs) tfs.hidden = true; afterCarry(); }
    var iss = $('[data-iss]', L);
    if (iss) {
      iss.innerHTML = d.issues.filter(function (i) { return i.project_id === id; }).map(function (i) {
        return '<div class="ord issue' + (i.status === 'open' ? ' open' : '') + '"><div class="ord-h"><b>' + esc(i.created_at.slice(0, 16)) + ' · ' + esc(i.staff_name || '') + '</b>' +
          (i.status === 'open' ? '<button class="btn ghost sm" data-ir="' + i.id + '">Вирішено</button>' : '<span class="pill">вирішено</span>') + '</div><p style="white-space:pre-wrap">' + esc(i.note) + '</p>' +
          '<div class="row">' + (i.photos || []).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" width="96" height="72" loading="lazy" style="width:96px;height:72px;object-fit:cover;border-radius:8px"></a>'; }).join('') + '</div></div>';
      }).join('');
      $$('[data-ir]', iss).forEach(function (b) { b.onclick = function () { api(PAPI, { method: 'PATCH', body: { type: 'issue', id: +b.dataset.ir, status: 'resolved' } }).then(function () { toast('Позначено вирішеним'); reload(); }, function (e) { toast(e.message, true); }); }; });
    }
    // Зберегти: разом із версією картки (p.ver). Якщо проєкт за цей час змінився (клієнт погодив етап чи попросив правки, зберіг
    // інший менеджер) — сервер нічого не пише (409), а ми питаємо: оновити й повторити мої зміни / оновити без них / лишитись у формі.
    function save(msg) {
      var b = { type: 'project', id: id, ver: p.ver, stages: stages.filter(function (s) { return String(s.name || '').trim(); }).map(function (s) {
        var o = {}; ['id'].concat(SK).forEach(function (k) { if (s[k] != null && s[k] !== '') o[k] = s[k]; });
        if (s._approve != null) o.approve = s._approve;
        if (s._rd) o.rev_delta = s._rd;
        return o;
      }) };
      new FormData(formEl).forEach(function (v, k) { b[k] = v; });
      if (STF.length) { b.assignee_staff_id = lead ? +lead : null; b.staff = team.filter(function (t) { return t.id; }); }
      if (!can('finance.edit')) { delete b.contract_amount; delete b.contract_currency; }
      return api(PAPI, { method: 'PATCH', body: b }).then(function () { dirty = false; toast(msg || 'Проєкт збережено'); reload(); return true; }, function (e) {
        if (!isConflict(e)) { fail(e); return false; }
        return conflictDialog('Проєкт змінився, поки ви редагували', e.data.last, 'картку проєкту').then(function (v) {
          if (v === 'retry') { dirty = false; RENDER.projects(L, cid, id, { baseF: baseF, mineF: snap(), baseSt: p.stages || [], mineSt: stages, baseTeam: baseTeam, mineTeam: team, baseLead: baseLead, mineLead: lead }); }
          else if (v === 'reload') { dirty = false; RENDER.projects(L, cid, id); }
          return false;
        });
      });
    }
    $('[data-save]', L).onclick = function () { save(); };
    projectContactsBlock(L, p, reload);
    var rvb = $('[data-review]', L); if (rvb) rvb.onclick = function () { nudge({ type: 'review_request', project_id: id }, $('[data-reviewb]', L)); };
    // нагадування / відгук: спершу Telegram-бот; без привʼязки — готовий текст і кнопки месенджерів, канал — у журнал
    function nudge(body, slot) {
      api(PAPI, { method: 'POST', body: body }).then(function (r) {
        if (r.sent) { toast('Надіслано клієнту в Telegram'); reload(); return; }
        if (!slot) return;
        slot.innerHTML = '<p class="muted">Клієнт не привʼязав Telegram — надішліть зі свого месенджера (текст мовою клієнта, можна змінити):</p><textarea class="kp-text" rows="4">' + esc(r.text) + '</textarea>';
        slot.appendChild(shareBar(r.text, r.phone || p.client_phone, null, function (ch) {
          api(PAPI, { method: 'POST', body: Object.assign({}, body, { channel: ch === 'telegram' ? 'telegram_manual' : ch }) }).then(function () { toast('Записано в журнал'); }, function (e) { toast(e.message, true); });
        }));
      }, function (e) { toast(e.message, true); });
    }
    // загальні задачі CRM, привʼязані до обʼєкта (вкладка «Задачі», migrations/0018) — окремо від чекліста етапів нижче
    if (window.CASCrm4) window.CASCrm4.taskBlock($('[data-gtk]', L), { project_id: id }, { stages: (p.stages || []).filter(function (x) { return x.id; }).map(function (x) { return { id: x.id, name: x.name }; }) });
    // чекліст задач (migrations/0012): по етапах, виконавець, термін; працівник бачить свої в /kabinet/team («Сьогодні»)
    var tkEl = $('[data-tk]', L), TKS = (d.tasks || []).filter(function (t) { return t.project_id === id; }), TSTF = d._staff || [];
    if (d.tasks_ready === false) tkEl.innerHTML = '<p class="muted">Задачі зʼявляться після застосування міграції 0012 (автоматично під час деплою).</p>';
    else {
      var tkRow = function (t) {
        var late = !t.done && isLate(t.due_date);
        return '<li class="pj-task' + (t.done ? ' done' : '') + (late ? ' late' : '') + '"><label class="row"><input type="checkbox" data-tkd="' + t.id + '"' + (t.done ? ' checked' : '') + '><span>' + esc(t.title) + '</span></label>' +
          '<small class="muted">' + (t.staff_name ? esc(t.staff_name) : 'без виконавця') + (t.due_date ? ' · <span class="' + (late ? 'err' : '') + '">до ' + dmy(t.due_date) + (late ? ' — прострочено' : '') + '</span>' : '') + (t.done && t.done_at ? ' · виконано ' + dmy(t.done_at) : '') + '</small>' +
          (can('projects.edit') ? '<button type="button" class="je-add" data-tkx="' + t.id + '" aria-label="Видалити задачу">✕</button>' : '') + '</li>';
      };
      var groups = (p.stages || []).filter(function (s) { return s.id; }).map(function (s) { return [s.name, TKS.filter(function (t) { return t.stage_id === s.id; })]; })
        .concat([['Без етапу', TKS.filter(function (t) { return !t.stage_id || !(p.stages || []).some(function (s) { return s.id === t.stage_id; }); })]])
        .filter(function (g) { return g[1].length; });
      $('[data-tkn]', L).textContent = TKS.length ? '· виконано ' + TKS.filter(function (t) { return t.done; }).length + ' з ' + TKS.length : '';
      tkEl.innerHTML = (groups.length ? groups.map(function (g) { return '<div class="pj-tg"><b>' + esc(g[0]) + '</b><ul class="pj-tasks">' + g[1].map(tkRow).join('') + '</ul></div>'; }).join('') : '<p class="muted">Задач ще немає — додайте, що зробити на кожному етапі (напр. «Погодити розкладку плитки»).</p>') +
        (d.can && d.can.task ? '<form class="tb" data-tkf style="margin-top:10px;flex-wrap:wrap"><input name="title" class="grow" required maxlength="160" placeholder="Задача: замовити плитку, погодити світло…" aria-label="Задача" style="min-width:200px">' +
          '<select name="stage_id" aria-label="Етап">' + stOpt('') + '</select>' +
          (can('projects.edit') ? '<select name="staff_id" aria-label="Виконавець"><option value="">— виконавець —</option>' + TSTF.map(function (x) { return '<option value="' + x.id + '"' + (x.id === p.assignee_staff_id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' : '') +
          '<input name="due_date" type="date" aria-label="Термін"><button class="btn" type="submit">Додати задачу</button></form>' : '');
      $$('[data-tkd]', tkEl).forEach(function (c) { c.onchange = function () { c.disabled = true; api(PAPI, { method: 'PATCH', body: { type: 'task', id: +c.dataset.tkd, done: c.checked } }).then(function () { toast(c.checked ? 'Задачу виконано' : 'Задачу повернуто в роботу'); reload(); }, function (e) { c.disabled = false; c.checked = !c.checked; fail(e); }); }; });
      $$('[data-tkx]', tkEl).forEach(function (b) { b.onclick = function () { if (confirm('Видалити задачу?')) api(PAPI + '?type=task&id=' + b.dataset.tkx, { method: 'DELETE' }).then(reload, fail); }; });
      var tkf = $('[data-tkf]', tkEl);
      if (tkf) tkf.onsubmit = function (e) {
        e.preventDefault(); var F = tkf.elements;
        var b = { type: 'task', project_id: id, title: F.title.value, stage_id: F.stage_id.value || null, due_date: F.due_date.value || null, sort: TKS.length };
        if (F.staff_id) b.staff_id = F.staff_id.value ? +F.staff_id.value : null;
        api(PAPI, { method: 'POST', body: b }).then(function () { toast('Задачу додано'); reload(); }, fail);
      };
    }
    $('[data-del]', L).onclick = function () {
      if (prompt('Видалити проєкт разом із фотозвітами? Напишіть «так».') !== 'так') return;
      api(PAPI + '?type=project&id=' + id, { method: 'DELETE' }).then(back, fail);
    };
    var img = function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" width="96" height="72" loading="lazy" style="width:96px;height:72px;object-fit:cover;border-radius:8px"></a>'; };
    $('[data-rep]', L).innerHTML = reports.map(function (r) {
      return '<div class="ord" style="margin-bottom:10px"><div class="ord-h"><b>' + esc(r.date) + (r.title ? ' · ' + esc(r.title) : '') + (stName(r.stage_id) ? ' <small>· етап «' + esc(stName(r.stage_id)) + '»</small>' : '') + '</b><button class="btn ghost sm" data-rd="' + r.id + '">Видалити</button></div>' + (r.note ? '<p class="muted" style="white-space:pre-wrap">' + esc(r.note) + '</p>' : '') + '<div class="row">' + r.photos.map(img).join('') + '</div></div>';
    }).join('') || '<p class="muted">Фотозвітів ще немає (раз на 1–2 тижні).</p>';
    $$('[data-rd]', L).forEach(function (b) { b.onclick = function () { if (confirm('Видалити фотозвіт?')) api(PAPI + '?type=report&id=' + b.dataset.rd, { method: 'DELETE' }).then(reload, fail); }; });
    var rf = $('[data-rf]', L);
    // фото для звіту: WebP у img/uploads через GitHub (потрібен токен); на сайті зʼявляться після деплою (2–4 хв)
    $('[data-upl]', L).onclick = function () {
      repo.status().then(function (s) {
        if (!s.token) return toast('Для завантаження потрібен токен GitHub (README). Або вставте https-посилання на фото.', true);
        return pickFiles(true).then(function (fs) {
          fs = fs.slice(0, 12); if (!fs.length) return;
          $('[data-us]', L).textContent = 'Обробка ' + fs.length + ' фото…';
          return Promise.all(fs.map(function (f) { return makePhoto(f, 'img/uploads'); })).then(function (ps) {
            var files = []; ps.forEach(function (x) { files = files.concat(x.files); });
            return repo.save('фотозвіт: ' + ps.length + ' фото', files, [], {}).then(function () {
              rf.elements.photos.value = (rf.elements.photos.value.trim() + '\n' + ps.map(function (x) { return 'https://cas-develop.com' + x.src; }).join('\n')).trim();
              $('[data-us]', L).textContent = 'Фото завантажено — зʼявляться на сайті за 2–4 хв. Натисніть «Додати фотозвіт».';
            });
          });
        });
      }).catch(fail);
    };
    rf.onsubmit = function (e) {
      e.preventDefault();
      api(PAPI, { method: 'POST', body: { type: 'report', project_id: id, date: rf.elements.date.value, title: rf.elements.title.value, note: rf.elements.note.value, stage_id: rf.elements.stage_id.value || null,
        photos: rf.elements.photos.value.split(/\s+/).filter(Boolean) } }).then(function () { toast('Фотозвіт додано'); reload(); }, fail);
    };
    $('[data-docs]', L).innerHTML = docs.length ? '<table class="adm">' + docs.map(function (x) {
      return '<tr><td>' + esc(DKIND[x.kind] || x.kind) + '</td><td><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a>' + (x.project_id ? '' : ' <small>(для клієнта загалом)</small>') + (stName(x.stage_id) ? ' <small>· етап «' + esc(stName(x.stage_id)) + '»</small>' : '') + '</td><td><small>' + esc(x.created_at) + '</small></td><td><button class="btn ghost sm" data-dd="' + x.id + '">Видалити</button></td></tr>';
    }).join('') + '</table>' : '<p class="muted">Документів немає.</p>';
    $$('[data-dd]', L).forEach(function (b) { b.onclick = function () { if (confirm('Видалити документ?')) api(PAPI + '?type=document&id=' + b.dataset.dd, { method: 'DELETE' }).then(reload, fail); }; });
    $('[data-df]', L).onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      api(PAPI, { method: 'POST', body: { type: 'document', client_id: p.client_id, project_id: id, kind: f.kind.value, title: f.title.value, url: f.url.value, stage_id: f.stage_id.value || null } }).then(function () { toast('Документ додано'); reload(); }, fail);
    };
    // графік платежів (migrations/0008): рядки бази, статус міняється одразу зі списку
    var payEl = $('[data-pay]', L);
    payEl.innerHTML = pays.length ? '<div class="tscroll"><table class="adm"><tr><th>Платіж</th><th>Етап</th><th>%</th><th>Сума</th><th>План</th><th>Статус</th><th>Факт</th><th></th></tr>' + pays.map(function (x) {
      var pl = payLate(x);
      return '<tr' + (pl ? ' class="late"' : '') + '><td><b>' + esc(x.title) + '</b>' + (pl ? ' <span class="pill warn">' + (x.status === 'due' ? 'до оплати · ' : '') + 'прострочено</span>' : '') + (x.note ? '<br><small>' + esc(x.note) + '</small>' : '') + '</td><td><small>' + esc(stName(x.stage_id) || '—') + '</small></td><td>' + (x.pct != null ? esc(x.pct) + '%' : '—') + '</td>' +
        '<td>' + (x.amount != null ? money(x.amount, x.currency) : '—') + '</td><td><input type="date" data-pd="' + x.id + '" value="' + esc(x.due_date || '') + '" aria-label="Дата за планом"></td>' +
        '<td><select data-ps="' + x.id + '" aria-label="Статус">' + opt(PAYST, x.status) + '</select></td><td><small>' + esc(x.paid_date || '') + '</small></td>' +
        '<td><button class="btn ghost sm" data-pe="' + x.id + '">Сума</button> <button class="btn ghost sm" data-px="' + x.id + '" aria-label="Видалити платіж">✕</button></td></tr>';
    }).join('') + '</table></div>' : '<p class="muted">Платежів ще немає.</p>';
    var patchPay = function (pid, b) { b.type = 'payment'; b.id = pid; return api(PAPI, { method: 'PATCH', body: b }).then(function () { toast('Платіж оновлено'); reload(); }, fail); };
    $$('[data-ps]', payEl).forEach(function (s) { s.onchange = function () { patchPay(+s.dataset.ps, { status: s.value }); }; });
    $$('[data-pd]', payEl).forEach(function (s) { s.onchange = function () { patchPay(+s.dataset.pd, { due_date: s.value }); }; });
    $$('[data-pe]', payEl).forEach(function (b) { b.onclick = function () {
      var x = pays.find(function (y) { return y.id === +b.dataset.pe; }); var v = prompt('Сума платежу (' + (x.currency || 'USD') + '), порожньо — прибрати:', x.amount == null ? '' : x.amount);
      if (v !== null) patchPay(x.id, { amount: v.trim() === '' ? null : +v.replace(/\s/g, '').replace(',', '.') });
    }; });
    $$('[data-px]', payEl).forEach(function (b) { b.onclick = function () { if (confirm('Видалити платіж?')) api(PAPI + '?type=payment&id=' + b.dataset.px, { method: 'DELETE' }).then(reload, fail); }; });
    var pf = $('[data-pf]', L);
    if (pf) pf.onsubmit = function (e) {
      e.preventDefault(); var F = pf.elements;
      api(PAPI, { method: 'POST', body: { type: 'payment', project_id: id, title: F.title.value, stage_id: F.stage_id.value || null, pct: F.pct.value, amount: F.amount.value,
        currency: F.currency.value, due_date: F.due_date.value, status: F.status.value, note: F.note.value, sort: pays.length } }).then(function () { toast('Платіж додано'); reload(); }, fail);
    };
    $$('[data-sch]', L).forEach(function (b) { b.onclick = function () {
      var parts = SCHEMES[b.dataset.sch];
      if (pays.length && !confirm('Платежі вже є. Додати ще ' + parts.length + ' рядки схеми ' + b.dataset.sch + '?')) return;
      var names = parts.length === 2 ? ['Аванс', 'Після завершення робіт'] : ['Аванс', 'Проміжний платіж', 'Після завершення робіт'];
      parts.reduce(function (pr, pc, i) {
        return pr.then(function () { return api(PAPI, { method: 'POST', body: { type: 'payment', project_id: id, title: names[i] + ' ' + pc + '%', pct: pc, status: 'planned', sort: pays.length + i } }); });
      }, Promise.resolve()).then(function () { toast('Схему ' + b.dataset.sch + ' додано — вкажіть суми, дати й етапи'); reload(); }, fail);
    }; });
  }

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

  // ---------- Контакти (/api/admin/partners, functions/_partners.js; migrations/0013 + 0015) ----------
  // Один довідник: клієнти, підрядники, партнери, постачальники, ріелтори, бригади, майстри (+ будівельні компанії, дизайнери).
  // Бот пошуку додає «не клієнтів»; заявка → проєкт додає клієнта. Звʼязки з обʼєктами й заявками — у картці контакту й у картці обʼєкта.
  // Права — partners.base (власник, менеджер), CSV — export; працівники бачать контакти своїх обʼєктів у картці обʼєкта (contacts.linked).
  var stars = function (n) { return n ? '<span class="ct-star" title="Оцінка ' + n + ' з 5" aria-label="Оцінка ' + n + ' з 5">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>' : ''; };
  var ctLinks = function (r) {
    var d = digits(r.phone);
    return [r.phone ? '<a href="tel:+' + d + '">' + esc(r.phone) + '</a>' : '', r.tg ? '<a href="https://t.me/' + esc(r.tg) + '" target="_blank" rel="noopener">@' + esc(r.tg) + '</a>' : '',
      r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : ''].filter(Boolean).join('<br>');
  };
  RENDER.partners = function (L) {
    var S = { type: '', status: '', city: '', q: '', rating: '' };
    try { Object.assign(S, JSON.parse(localStorage.getItem('partnerFilters') || '{}') || {}); } catch (e) { /* noop */ }
    var TYPES = {}, STS = {}, READY = true;
    var QT = [['', 'Усі'], ['client', 'Клієнти'], ['contractor', 'Підрядники'], ['crew', 'Бригади'], ['master', 'Майстри'], ['supplier', 'Постачальники'], ['partner', 'Партнери']];
    var opts = function (o, v) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(o[k]) + '</option>'; }).join(''); };
    var qs = function (csv) { return '/api/admin/partners?type=' + S.type + '&status=' + S.status + '&rating=' + S.rating + '&city=' + encodeURIComponent(S.city) + '&q=' + encodeURIComponent(S.q) + (csv ? '&format=csv' : ''); };
    var save = function () { try { localStorage.setItem('partnerFilters', JSON.stringify(S)); } catch (e) { /* noop */ } };
    // режим «Таблиця» (CRM v4, assets/admin/crm4.v1.js): сортування, правка клітинки, масові дії, імпорт CSV; вибір запамʼятовується
    var X4 = window.CASCrm4, MODE = 'list';
    try { MODE = localStorage.getItem('contactsMode') === 'table' && X4 ? 'table' : 'list'; } catch (e) { /* noop */ }
    var setMode = function (m) { MODE = m; try { localStorage.setItem('contactsMode', m); } catch (e) { /* noop */ } return list(); };
    function table() {
      var ready = Object.keys(TYPES).length ? Promise.resolve() : api('/api/admin/partners?limit=1').then(function (d) { TYPES = d.types; STS = d.statuses; READY = d.ready !== false; });
      return ready.then(function () { return X4.contactsTable(L, { back: function () { setMode('list'); }, card: function (id) { if (id) open(id); else card(null); } }); });
    }
    function list() {
      if (MODE === 'table') return table();
      return api(qs()).then(function (d) {
        TYPES = d.types; STS = d.statuses; READY = d.ready !== false;
        var tc = d.type_counts || {};
        L.innerHTML = '<div class="tb">' + (X4 ? '<div class="seg" role="group" aria-label="Вигляд контактів"><button type="button" data-mode="list" aria-pressed="true">Список</button><button type="button" data-mode="table" aria-pressed="false">Таблиця</button></div>' : '') +
          '<input class="grow" type="search" data-f="q" placeholder="Пошук: імʼя, компанія, @username, телефон, пошта, тег, нотатки" aria-label="Пошук">' +
          '<select data-f="type" aria-label="Тип"><option value="">Усі типи</option>' + opts(TYPES, S.type) + '</select>' +
          '<select data-f="status" aria-label="Статус"><option value="">Усі статуси</option>' + opts(STS, S.status) + '</select>' +
          '<select data-f="rating" aria-label="Оцінка"><option value="">Будь-яка оцінка</option>' + [5, 4, 3].map(function (n) { return '<option value="' + n + '"' + (String(n) === String(S.rating) ? ' selected' : '') + '>від ' + n + '★</option>'; }).join('') + '</select>' +
          '<input data-f="city" type="search" placeholder="Регіон / місто" aria-label="Регіон або місто" class="w-city">' +
          '<button class="btn" type="button" data-new>+ Контакт</button>' + (can('export') ? '<a class="btn ghost" data-csv href="' + qs(true) + '" download>CSV</a>' : '') + '</div>' +
          '<div class="crm-q" role="group" aria-label="Тип контакту">' + QT.map(function (q) { return '<button type="button" class="pill" data-qt="' + q[0] + '" aria-pressed="' + (S.type === q[0]) + '">' + q[1] + (q[0] && tc[q[0]] ? ' <small>' + tc[q[0]] + '</small>' : '') + '</button>'; }).join('') + '</div>' +
          '<p class="muted">' + d.rows.length + (d.rows.length >= 2000 ? '+' : '') + ' у списку · ' + Object.keys(STS).map(function (k) { return esc(STS[k]) + ': ' + (d.counts[k] || 0); }).join(' · ') +
          '. Бот пошуку додає підрядників і постачальників; «Створити проєкт» із заявки — клієнта.' + (READY ? '' : ' <b>Пошта й оцінка — після міграції 0015 (автоматично під час деплою).</b>') + '</p>' +
          (d.rows.length ? '<div class="tscroll"><table class="adm" data-ptbl><tr><th>Контакт</th><th>Тип</th><th>Регіон</th><th>Звʼязок</th><th>Оцінка</th><th>Обʼєкти</th><th>Статус</th></tr>' + d.rows.map(function (r) {
            return '<tr class="clk" data-id="' + r.id + '" tabindex="0"><td><b>' + esc(r.name || r.company || '—') + '</b>' + (r.name && r.company ? '<br><small>' + esc(r.company) + '</small>' : '') +
              (r.tags.length ? '<br>' + r.tags.slice(0, 5).map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join(' ') : '') + '</td>' +
              '<td>' + esc(r.type_label) + '</td><td>' + esc(r.city || '') + '</td><td><small>' + ctLinks(r) + (r.site ? '<br>' + esc(String(r.site).replace(/^https?:\/\//, '').slice(0, 40)) : '') + '</small></td>' +
              '<td>' + stars(r.rating) + '</td><td>' + (r.n_projects ? '🏗 ' + r.n_projects : '') + (r.n_leads ? ' 📋 ' + r.n_leads : '') + '</td>' +
              '<td><span class="pill' + (r.status === 'working' ? ' on' : r.status === 'rejected' ? ' warn' : '') + '">' + esc(r.status_label) + '</span></td></tr>';
          }).join('') + '</table></div>' : '<p class="muted">Поки порожньо. Додайте контакт кнопкою «+ Контакт».</p>');
        $$('[data-f]', L).forEach(function (el) {
          var go = function () { S[el.dataset.f] = el.value.trim(); save(); list(); };
          if (el.tagName === 'SELECT') el.onchange = go; else { el.value = S[el.dataset.f] || ''; el.oninput = debounce(go, 350); }
        });
        $$('[data-qt]', L).forEach(function (b) { b.onclick = function () { S.type = b.dataset.qt; save(); list(); }; });
        var q = $('[data-f="q"]', L); if (q && S.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        $('[data-new]', L).onclick = function () { card(null); };
        var mt = $('[data-mode="table"]', L); if (mt) mt.onclick = function () { setMode('table'); };
        $$('tr.clk', L).forEach(function (tr) {
          var openCard = function () { open(+tr.dataset.id); };
          tr.onclick = openCard; tr.onkeydown = function (e) { if (e.key === 'Enter') openCard(); };
        });
      });
    }
    function open(id, carry) { return api('/api/admin/partners?id=' + id).then(function (x) { card(x.partner, x, carry); }, function (e) { toast(e.message, true); }); }
    var CLBL = { name: 'Імʼя', company: 'Компанія', type: 'Тип', status: 'Статус', city: 'Регіон / місто', phone: 'Телефон', tg: 'Telegram', email: 'Пошта', site: 'Сайт', rating: 'Оцінка', tags: 'Теги', notes: 'Нотатки' };
    // carry — після конфлікту версій: {values, notes} (як у картці заявки)
    function card(r, x, carry) {
      var n = !r; r = r || { type: S.type || 'other', status: 'new', tags: [], sources: [] }; x = x || { links: [], leads: [] };
      var f = function (k, label, type, ph) { return '<label class="fld"><span>' + label + '</span><input name="' + k + '" type="' + (type || 'text') + '" value="' + esc(k === 'tg' && r.tg ? '@' + r.tg : r[k] || '') + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '></label>'; };
      var pl = x.links.filter(function (l) { return l.project_id; }), ol = x.links.filter(function (l) { return l.order_id; });
      L.innerHTML = '<div class="tb"><button class="btn ghost sm" type="button" data-back>← До списку</button><b class="grow">' + (n ? 'Новий контакт' : esc(r.name || r.company || 'Контакт #' + r.id)) + '</b>' + (n ? '' : stars(r.rating)) + '</div>' +
        '<form class="pform" data-pf>' + f('name', 'Імʼя') + f('company', 'Компанія') +
        '<label class="fld"><span>Тип</span><select name="type">' + opts(TYPES, r.type) + '</select></label>' +
        '<label class="fld"><span>Статус</span><select name="status">' + opts(STS, r.status) + '</select></label>' +
        f('city', 'Регіон / місто') + f('phone', 'Телефон', 'tel', '+380…') + f('tg', 'Telegram', 'text', '@username') + f('email', 'Пошта', 'email', 'name@…') + f('site', 'Сайт', 'url', 'https://…') +
        '<label class="fld"><span>Оцінка</span><select name="rating"><option value="">— без оцінки —</option>' + [5, 4, 3, 2, 1].map(function (k) { return '<option value="' + k + '"' + (k === r.rating ? ' selected' : '') + '>' + '★'.repeat(k) + ' ' + k + '</option>'; }).join('') + '</select></label>' +
        '<label class="fld"><span>Спеціалізація, теги (через кому)</span><input name="tags" value="' + esc(r.tags.join(', ')) + '" placeholder="плитка, електрика, гіпсокартон"></label>' +
        '<label class="fld"><span>Нотатки (бачать власник і менеджер)</span><textarea name="notes" rows="4">' + esc(r.notes || '') + '</textarea></label>' +
        '<p><button class="btn" type="submit">' + (n ? 'Додати' : 'Зберегти') + '</button> <span class="err" data-m></span></p></form>' +
        (n ? '' : '<div data-ctk></div>' + (r.archived_at ? '<p class="note">Контакт в архіві з ' + esc(String(r.archived_at).slice(0, 10)) + ' — у списку й пошуку не показується. <button type="button" class="btn sm ghost" data-unarch>Повернути з архіву</button></p>' : '') +
          '<h3>Обʼєкти' + (pl.length ? ' · ' + pl.length : '') + '</h3>' + (pl.length ? '<ul class="plist ct-links">' + pl.map(function (l) {
            return '<li><button type="button" class="lnk" data-pj="' + l.project_id + '">' + esc(l.project_title || 'Обʼєкт #' + l.project_id) + '</button>' + (l.role ? ' — ' + esc(l.role) : '') +
              ' <button type="button" class="je-add" data-ul="' + l.id + '" aria-label="Відвʼязати">✕</button></li>'; }).join('') + '</ul>' : '<p class="muted">Ще не привʼязано. Привʼязати — у картці обʼєкта, блок «Контакти обʼєкта».</p>') +
          '<h3>Заявки</h3>' + (ol.length || x.leads.length ? '<ul class="plist">' + ol.map(function (l) { return '<li>' + esc(l.order_number || '#' + l.order_id) + ' · ' + esc(l.order_service || '') + (l.role ? ' — ' + esc(l.role) : '') + '</li>'; }).join('') +
            x.leads.map(function (o) { return '<li>' + esc(o.number) + ' · ' + esc(o.service || '') + ' <small class="muted">(той самий номер / Telegram)</small></li>'; }).join('') + '</ul>' : '<p class="muted">Заявок немає.</p>') +
          '<p class="muted">Вперше: ' + esc(r.first_seen) + ' · востаннє: ' + esc(r.last_seen) + ' · разів: ' + r.times_seen + '</p>' +
          (r.sources.length ? '<h3>Де бачили</h3><ul class="plist">' + r.sources.map(function (s) {
            return '<li><small>' + esc(String(s.at || '').slice(0, 16)) + '</small> ' + esc(s.name || '') + (s.url && /^https?:\/\//.test(s.url) ? ' — <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer nofollow">повідомлення</a>' : '') + '</li>';
          }).join('') + '</ul>' : ''));
      var pfm = $('[data-pf]', L), wf = watchForm(pfm, 'картці контакту');
      if (carry) {
        Object.keys(carry.values).forEach(function (k) { var el = pfm.elements[k], v = carry.values[k]; if (el) { el.value = k === 'tags' ? (v || []).join(', ') : v == null ? '' : v; wf.set(true); } });
        if (carry.notes.length) pfm.insertAdjacentHTML('beforebegin', clashBox(carry.notes));
      }
      $('[data-back]', L).onclick = function () { if (wf.leave()) list(); };
      if (!n && X4) X4.taskBlock($('[data-ctk]', L), { contact_id: r.id });
      var un = $('[data-unarch]', L); if (un) un.onclick = function () { api('/api/admin/partners', { method: 'PATCH', body: { id: r.id, archived: false } }).then(function () { toast('Контакт повернуто з архіву'); open(r.id); }, function (e) { toast(e.message, true); }); };
      $$('[data-pj]', L).forEach(function (b) { b.onclick = function () { try { sessionStorage.setItem('pjOpen', b.dataset.pj); } catch (e) { /* noop */ } location.hash = '#projects'; }; });
      $$('[data-ul]', L).forEach(function (b) { b.onclick = function () {
        if (!confirm('Відвʼязати контакт від обʼєкта?')) return;
        api('/api/admin/partners?link=' + b.dataset.ul, { method: 'DELETE' }).then(function () { toast('Відвʼязано'); open(r.id); }, function (e) { toast(e.message, true); });
      }; });
      $('[data-pf]', L).onsubmit = function (e) {
        e.preventDefault(); var F = e.target, b = {};
        ['name', 'company', 'type', 'status', 'city', 'tg', 'phone', 'email', 'site', 'notes'].forEach(function (k) { b[k] = F[k].value.trim(); });
        if (!READY && !b.email) delete b.email;
        b.rating = F.rating.value ? +F.rating.value : null; if (!READY && b.rating == null) delete b.rating;
        b.tags = F.tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        if (!n) { b.id = r.id; b.ver = r.ver; } // версія картки: якщо контакт за цей час змінив інший менеджер — 409 і діалог
        api('/api/admin/partners', { method: n ? 'POST' : 'PATCH', body: b }).then(function () { wf.set(false); toast(n ? 'Контакт додано' : 'Збережено'); list(); }, function (er) {
          if (!(!n && isConflict(er) && er.data.partner)) { $('[data-m]', L).textContent = er.message; return; }
          conflictDialog(er.message, er.data.last, 'картку контакту').then(function (v) {
            if (v === 'cancel') return;
            wf.set(false);
            if (v === 'reload') { open(r.id); return; }
            var fresh = er.data.partner, nrm = function (x, k) { return k === 'tags' ? (x || []).join(', ') : k === 'tg' ? String(x || '').replace(/^@/, '') : String(x == null ? '' : x).trim(); };
            var m = merge3(Object.keys(CLBL), r, b, fresh, nrm);
            var show = function (k, x) { return k === 'type' ? (TYPES[x] || x) : k === 'status' ? (STS[x] || x) : k === 'tags' ? (x || []).join(', ') : x; };
            if (m.clash.length) { open(r.id, { values: m.apply, notes: m.clash.map(function (c) { return clashNote(CLBL[c.k], { fresh: show(c.k, c.fresh), mine: show(c.k, c.mine) }); }) }); return; }
            if (!Object.keys(m.apply).length) { toast('Дані оновлено — ваші зміни вже були збережені'); list(); return; }
            api('/api/admin/partners', { method: 'PATCH', body: Object.assign({ id: r.id, ver: fresh.ver }, m.apply) }).then(function () { toast('Збережено — ваші зміни додано до свіжих даних'); list(); },
              function (e2) { toast(e2.message, true); open(r.id, { values: m.apply, notes: [] }); });
          });
        });
      };
    }
    return list();
  };
  // Картка обʼєкта → «Контакти обʼєкта»: бригади, майстри, постачальники (звʼязки contact_links). Власник і менеджер привʼязують
  // з довідника (пошук ?find=), працівники обʼєкта лише бачать (contacts.linked) — список приходить у GET /api/admin/projects (contacts).
  function projectContactsBlock(L, p, reload) {
    var el = $('[data-pct]', L); if (!el) return;
    var C = p.contacts || [], edit = can('partners.base');
    el.innerHTML = (C.length ? '<ul class="plist ct-links">' + C.map(function (c) {
      var k = c.contact;
      return '<li><b>' + esc(k.name || k.company || '—') + '</b> <small class="muted">' + esc(k.type_label) + (c.role ? ' · ' + esc(c.role) : '') + '</small>' + (k.rating ? ' ' + stars(k.rating) : '') +
        (ctLinks(k) ? '<br><small>' + ctLinks(k).replace(/<br>/g, ' · ') + '</small>' : '') + (edit ? ' <button type="button" class="je-add" data-ctx="' + c.link_id + '" aria-label="Відвʼязати">✕</button>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">Контактів ще немає' + (edit ? ' — знайдіть у довіднику й привʼяжіть (бригада, майстер, постачальник).' : '.') + '</p>') +
      (edit ? '<div class="tb ct-add"><input type="search" class="grow" data-ctq placeholder="Знайти контакт: імʼя, @username, телефон, тег" aria-label="Знайти контакт"><input data-ctr placeholder="Роль на обʼєкті: плиточник…" aria-label="Роль на обʼєкті"></div><div data-ctres class="ct-res"></div>' : '');
    $$('[data-ctx]', el).forEach(function (b) { b.onclick = function () {
      if (!confirm('Відвʼязати контакт від обʼєкта?')) return;
      api('/api/admin/partners?link=' + b.dataset.ctx, { method: 'DELETE' }).then(function () { toast('Відвʼязано'); reload(); }, function (e) { toast(e.message, true); });
    }; });
    var q = $('[data-ctq]', el); if (!q) return;
    q.oninput = debounce(function () {
      var v = q.value.trim(), res = $('[data-ctres]', el);
      if (v.length < 2) { res.innerHTML = ''; return; }
      api('/api/admin/partners?find=' + encodeURIComponent(v)).then(function (d) {
        res.innerHTML = d.rows.length ? d.rows.map(function (k) { return '<button type="button" class="pill" data-ctl="' + k.id + '">' + esc(k.name || k.company) + ' · ' + esc(k.type_label) + '</button>'; }).join(' ') : '<span class="muted">Не знайдено — додайте у «Контакти».</span>';
        $$('[data-ctl]', res).forEach(function (b) { b.onclick = function () {
          api('/api/admin/partners', { method: 'POST', body: { action: 'link', contact_id: +b.dataset.ctl, project_id: p.id, role: $('[data-ctr]', el).value.trim() || null } })
            .then(function () { toast('Контакт привʼязано'); reload(); }, function (e) { toast(e.message, true); });
        }; });
      }, function (e) { res.textContent = e.message; });
    }, 300);
  }

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
    var wf = watchForm(L, 'картці товару', null, $('[data-back]', L));
    $('[data-back]', L).onclick = function () { if (wf.leave()) productList(L, st); };
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
  var LANGS = ['uk', 'ru', 'en', 'pl', 'es', 'zh', 'de', 'fr', 'pt', 'ar'];
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
      var wf = watchForm(L, 'статті', null, $('[data-back]', L));
      $('[data-back]', L).onclick = function () { if (wf.leave()) RENDER.blog(L); };
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
        if (publish && !confirmIssues(lintText(strings(o)))) return;
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
      var hst = $('[data-st]', L);
      GUARD = function () { return document.contains(hst) && /незбережені/.test(hst.textContent) ? 'На сторінці ' + path + ' є незбережені зміни.' : ''; };
      $('[data-save]', L).onclick = function () {
        sync();
        var t = $('[data-title]', L).value.trim(), dsc = $('[data-desc]', L).value.trim().replace(/\s+/g, ' ');
        if (!t) return toast('Заголовок не може бути порожнім', true);
        var escT = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }, escA = function (s) { return escT(s).replace(/"/g, '&quot;'); };
        var out = src.replace(MAIN_RE, function (_, a, __, c) { return a + main + c; });
        if (unesc((src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '') !== t) out = out.replace(/<title>[\s\S]*?<\/title>/, function () { return '<title>' + escT(t) + '</title>'; });
        if (desc !== dsc) out = out.replace(/<meta name="description" content="[^"]*">/, function () { return '<meta name="description" content="' + escA(dsc) + '">'; });
        if (out === src) return toast('Змін немає');
        if (!/<h1\b/i.test(main) && /<h1\b/i.test(m[2])) return toast('На сторінці зник заголовок H1 — поверніть його (вкладка «Код HTML»)', true);
        if ((main.match(/<h1\b/gi) || []).length > 1) return toast('На сторінці має бути один H1', true);
        if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(main)) return toast('У кожного фото має бути alt (опис) — додайте у «Код HTML»', true);
        if (!confirmIssues(lintText(main.replace(/<[^>]+>/g, ' ')).concat(seoIssues(t, dsc)))) return;
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
      if (!c.admin) {
        box.innerHTML = '<div class="acc-box"><h2>Ця панель — для власника й менеджерів студії</h2><p class="acc-wait">' +
          (c.staff ? 'Ваш робочий кабінет — <a href="' + esc(c.staff.home) + '">' + esc(c.staff.home) + '</a>.' : c.staff_disabled ? 'Доступ працівника вимкнено. Звʼяжіться з власником студії.' : 'Ваш кабінет клієнта — <a href="/kabinet">/kabinet</a>.') + '</p></div>';
        return;
      }
      ME = c.staff || { role: 'manager', role_label: 'Менеджер', perms: [], owner: false, name: c.name };
      ME.name = ME.name || c.name;
      start();
    });
  });
  // для перевірок (tools/admin/test): перетворення тексту статті
  window.CASAdminText = { bodyToText: bodyToText, textToBody: textToBody, stringifyLike: stringifyLike };
})();
