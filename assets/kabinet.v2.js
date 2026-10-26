/* CAS Development — кабінет клієнта v2. Сторінки /kabinet, /kabinet/zamovlennia, /kabinet/obrane, /kabinet/proekty, /kabinet/profil
   (генерує tools/shop/pages.py → kabinet_v2.py). Вхід — window.CASAccount (/assets/account.v1.js); API — /api/account/*.
   Кошик і обране Оздоби — localStorage 'ozd-cart' [{id, ci, si, qty}] і 'ozd-fav' [id] (як у /assets/ozdoba/app.js). */
(function () {
  'use strict';
  var main = document.querySelector('main.kb');
  if (!main) return;
  var TAB = main.getAttribute('data-kb');
  var box = document.getElementById('kb');
  var A = window.CASAccount;
  var PHONE = '+380978667755', PHONE_TXT = '+380 97 866 77 55';
  var STAGES = [['new', 'Нове'], ['in_work', 'В роботі'], ['quote_sent', 'КП надіслано'], ['paid', 'Оплачено'],
    ['production', 'У виробництві'], ['shipping', 'В дорозі'], ['delivered', 'Доставлено']];
  var STAGE_NOTE = {
    new: 'Ми отримали замовлення. Менеджер перевірить позиції й звʼяжеться з вами.',
    in_work: 'Менеджер уточнює деталі, кольори, розміри й наявність.',
    quote_sent: 'Комерційну пропозицію надіслано — перевірте Telegram або пошту.',
    paid: 'Оплату отримано, дякуємо! Передаємо замовлення у виробництво.',
    production: 'Замовлення виготовляється на фабриці.',
    shipping: 'Замовлення в дорозі — поставка з Китаю 30–60 днів від підтвердження.',
    delivered: 'Замовлення доставлено. Гарантія — 36 місяців.',
    cancelled: 'Замовлення скасовано. Якщо це помилка — напишіть менеджеру.'
  };

  /* ---------- утиліти ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return new Intl.NumberFormat('uk-UA').format(Math.round(n)); };
  var money = function (n) { return n == null ? 'за запитом' : fmt(n) + ' ₴'; };
  var usd = function (uah) { return '$' + fmt(Math.round(uah / 46 / 100) * 100); };
  var safeUrl = function (u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; };
  var parseDate = function (s) { if (!s) return null; var d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) || /^\d{4}-\d\d-\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? null : d; };
  var dfmt = function (s, opt) { var d = s instanceof Date ? s : parseDate(s); return d ? d.toLocaleDateString('uk-UA', opt || { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  var addDays = function (d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  var ls = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватний режим */ } }
  };
  var svg = function (p, cls) { return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '>' + p + '</svg>'; };
  var IC = {
    box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    heart: '<path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/>',
    plan: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 10h17M9 10v10M14 15h6.5"/>',
    phone: '<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'
  };

  var toastT = null;
  function toast(msg, isErr) {
    var t = document.getElementById('kb-toast'); if (!t) return;
    t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  function api(path, opts) { return A.api(path, opts); }
  var soft = function (p, d) { return p.catch(function () { return d; }); };
  function paint(html) {
    box.innerHTML = html; box.setAttribute('aria-busy', 'false');
    var n = 0; box.querySelectorAll('.kb-in').forEach(function (el) { el.style.setProperty('--i', n++); });
    // анімація смуг прогресу: ширина з data-w після першого кадру
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      box.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; });
      box.querySelectorAll('circle[data-off]').forEach(function (el) { el.style.strokeDashoffset = el.getAttribute('data-off'); });
    }); });
    avatars();
  }
  function avatars() { // фото з Telegram/Google не завантажилось → ініціали
    box.querySelectorAll('.kb-ava img').forEach(function (img) {
      img.addEventListener('error', function () { var p = img.parentNode; p.textContent = p.getAttribute('data-ini') || '•'; });
    });
  }
  function bar(pct) { return '<div class="kb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:0" data-w="' + pct + '"></i></div>'; }
  function ring(pct) {
    var c = 2 * Math.PI * 36;
    return '<div class="kb-ring" role="img" aria-label="Профіль заповнено на ' + pct + '%"><svg viewBox="0 0 84 84"><circle class="t" cx="42" cy="42" r="36"/>' +
      '<circle class="v" cx="42" cy="42" r="36" stroke-dasharray="' + c.toFixed(1) + '" style="stroke-dashoffset:' + c.toFixed(1) + '" data-off="' + (c * (1 - pct / 100)).toFixed(1) + '"/></svg><b>' + pct + '%</b></div>';
  }
  function empty(icon, title, text, cta) {
    return '<div class="kb-card kb-empty kb-in"><div class="art">' + svg(icon) + '</div><h2>' + title + '</h2><p>' + text + '</p>' + (cta || '') + '</div>';
  }
  var initials = function (name) { return String(name || 'К').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || 'К'; };
  function ava(c, sm) {
    var ini = esc(initials(c.name)), ph = safeUrl(c.photo);
    return '<div class="kb-ava' + (sm ? ' sm' : '') + '" data-ini="' + ini + '">' + (ph ? '<img src="' + esc(ph) + '" width="72" height="72" alt="" referrerpolicy="no-referrer">' : ini) + '</div>';
  }

  /* ---------- каталог Оздоби, кошик, обране ---------- */
  var catP = null;
  function catalog() {
    return catP || (catP = fetch('/assets/ozdoba/catalog.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
      d.byId = {}; d.items.forEach(function (i) { d.byId[i.id] = i; }); return d;
    }).catch(function () { return null; }));
  }
  var r10 = function (n) { return Math.round(n / 10) * 10; };
  function defS(D, i) { var s = i.ss ? D.sizesets[i.ss] : null; if (!s) return 0; var n = s.findIndex(function (x) { return x[1] === 1; }); return n < 0 ? 0 : n; }
  function price(D, i, ci, si) { // та сама формула, що й у app.js
    if (i.price == null) return null;
    var s = i.ss ? D.sizesets[i.ss] : null, k = s ? (s[si == null ? defS(D, i) : si] || s[defS(D, i)])[1] : 1;
    var cs = D.colorsets[i.cs] || [], c = cs[ci || 0] || cs[0] || [0, 0, 0];
    return r10(i.price * k * (1 + c[2]));
  }
  function minPrice(D, i) { if (i.price == null) return null; var s = i.ss ? D.sizesets[i.ss] : null; return s ? r10(i.price * Math.min.apply(null, s.map(function (x) { return x[1]; }))) : price(D, i, 0); }
  var cart = function () { return ls.get('ozd-cart', []).filter(function (c) { return c && c.id; }); };
  function cartGoods(D) { return cart().reduce(function (s, c) { var i = D.byId[c.id]; var p = i ? price(D, i, c.ci, c.si) : null; return s + (p == null ? 0 : p * c.qty); }, 0); }
  var img = function (i, size) { return i.img ? '/' + i.img + '-' + (size || 400) + '.webp' : ''; };
  var url = function (i) { return i.slug ? '/ozdoba/' + i.slug : '/ozdoba#p-' + i.id; };
  function artSvg(D, key) { var a = D.art && D.art[key]; return a ? '<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + a + '</svg>' : ''; }
  function prodCard(D, i, opts) {
    opts = opts || {};
    var p = minPrice(D, i), ph = img(i);
    return '<div class="kb-prod kb-in"><a href="' + esc(url(i)) + '" style="display:contents;color:inherit;text-decoration:none"><div class="ph">' +
      (ph ? '<img src="' + esc(ph) + '" width="400" height="400" alt="' + esc(i.name) + '" loading="lazy" decoding="async">' : artSvg(D, i.art)) +
      '</div><div class="tx"><b>' + esc(i.name) + '</b><span>' + (p == null ? 'Ціна за запитом' : 'від ' + money(p)) + ' <small class="muted">/ ' + esc(i.unit) + '</small></span><small class="muted">' + esc(i.cat || '') + '</small></div></a>' +
      (opts.remove ? '<button type="button" class="x" data-unfav="' + i.id + '" aria-label="Прибрати з обраного">' + svg(IC.heart) + '</button>' : '') + '</div>';
  }

  // обране: сервер + локальне (браузер) — зливаємо один раз за сесію й записуємо обʼєднання в 'ozd-fav'
  var favP = null;
  function favorites() {
    if (favP) return favP;
    var local = ls.get('ozd-fav', []).map(Number).filter(Boolean);
    favP = api('/api/account/favorites').then(function (d) {
      var srv = d.ids || [], miss = local.filter(function (id) { return srv.indexOf(id) < 0; });
      var p = miss.length && !d.pending ? api('/api/account/favorites', { method: 'POST', body: { ids: miss } }).then(function (r) { return r.ids; }, function () { return srv.concat(miss); }) : Promise.resolve(srv.concat(d.pending ? miss : []));
      return p.then(function (ids) { ls.set('ozd-fav', ids); return ids; });
    }).catch(function () { return local; });
    return favP;
  }
  function unfav(id) {
    var ids = ls.get('ozd-fav', []).map(Number).filter(function (x) { return x !== id; });
    ls.set('ozd-fav', ids);
    return api('/api/account/favorites?id=' + id, { method: 'DELETE' }).then(function (d) { ls.set('ozd-fav', d.ids); favP = Promise.resolve(d.ids); return d.ids; }, function () { favP = Promise.resolve(ids); return ids; });
  }

  /* ---------- спільні блоки ---------- */
  function managerCard(cls, name) {
    return '<section class="kb-card ' + (cls || '') + ' kb-in" aria-labelledby="kb-mgr"><div class="kb-ch"><div><p class="kb-eyebrow">Ваш менеджер</p><h2 id="kb-mgr">' + esc(name || 'Менеджер CAS Development') + '</h2></div></div>' +
      '<p class="muted" style="font-size:var(--fs-small)">Питання щодо замовлення, кольорів, доставки чи проєкту — пишіть у зручний месенджер. Консультація по телефону — безкоштовна.</p>' +
      '<div class="kb-msg">' +
      '<a href="https://t.me/' + PHONE + '" target="_blank" rel="noopener"><img src="/assets/brand/telegram.svg" width="22" height="22" alt="">Telegram</a>' +
      '<a href="viber://chat?number=%2B380978667755"><img src="/assets/brand/viber.svg" width="22" height="22" alt="">Viber</a>' +
      '<a href="https://wa.me/380978667755" target="_blank" rel="noopener"><img src="/assets/brand/whatsapp.svg" width="22" height="22" alt="">WhatsApp</a>' +
      '<a href="tel:' + PHONE + '">' + svg(IC.phone) + PHONE_TXT + '</a></div></section>';
  }
  function stageIdx(k) { return STAGES.findIndex(function (s) { return s[0] === k; }); }
  function dots(stage) {
    var n = stageIdx(stage);
    return '<div class="kb-dots" aria-hidden="true">' + STAGES.map(function (s, i) { return '<i class="' + (i < n ? 'on' : i === n ? 'cur' : '') + '"></i>'; }).join('') + '</div>';
  }
  function stBadge(o) { return '<span class="kb-st' + (o.stage === 'cancelled' ? ' x' : o.stage === 'delivered' ? ' ok' : '') + '">' + esc(o.stage_label) + '</span>'; }
  var active = function (o) { return o.stage !== 'delivered' && o.stage !== 'cancelled'; };
  function eta(o) { // орієнтовна поставка: 30–60 днів від підтвердження (дата оплати/запуску або створення)
    if (!active(o)) return '';
    var ev = (o.events || []).filter(function (e) { return ['paid', 'production'].indexOf(e.stage) >= 0; })[0];
    var d0 = parseDate(ev ? ev.created_at : o.created_at); if (!d0) return '';
    return dfmt(addDays(d0, 30), { day: 'numeric', month: 'short' }) + ' – ' + dfmt(addDays(d0, 60), { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function volumeBlock(D, partner) {
    var VOL = (D && D.volume_discounts) || [], g = D ? cartGoods(D) : 0;
    var cur = VOL.reduce(function (p, t) { return g >= t[0] ? Math.max(p, t[1]) : p; }, 0);
    var next = VOL.filter(function (t) { return g < t[0]; })[0];
    var pct = next ? Math.round(g / next[0] * 100) : 100;
    var h = '<p class="kb-eyebrow">Знижка за обсягом</p>';
    if (!g) h += '<p>Кошик Оздоби порожній. Знижка рахується від суми товарів:</p>';
    else h += '<div class="row" style="justify-content:space-between"><span>У кошику: <b>' + money(g) + '</b></span>' + (cur ? '<span class="kb-st ok">−' + cur + '%</span>' : '') + '</div>' + bar(pct) +
      '<p style="font-size:var(--fs-small)">' + (next ? 'Ще <b>' + money(next[0] - g) + '</b> до знижки ' + next[1] + '%' : 'Максимальна знижка за обсягом — ' + cur + '%') + '</p>';
    h += '<ul class="kb-todo">' + VOL.map(function (t) { return '<li class="' + (g >= t[0] ? 'ok' : '') + '">' + t[1] + '% — від ' + money(t[0]) + ' (≈' + usd(t[0]) + ')</li>'; }).join('') + '</ul>';
    if (partner) h += '<div class="kb-note">Ваш код партнера <b>' + esc(partner.code) + '</b> (−' + partner.discount + '%) не сумується зі знижкою за обсягом — діє більша.</div>';
    return h;
  }

  /* ---------- гість ---------- */
  function guest() {
    var perks = [
      [IC.box, 'Статуси замовлень', 'Від «Нове» до «Доставлено», орієнтовна дата поставки й друк замовлення.'],
      [IC.heart, 'Обране на всіх пристроях', 'Зберігайте товари Оздоби й повертайтесь до них з телефону чи компʼютера.'],
      [IC.plan, 'Ваш проєкт онлайн', 'Етапи, фотозвіти раз на 1–2 тижні, договір, кошторис і рахунки в одному місці.'],
      [IC.shield, 'Без паролів', 'Вхід через Telegram, Google або номер телефону.']
    ];
    paint('<div class="kb-guest"><section class="kb-card glow kb-in"><p class="kb-eyebrow">Особистий кабінет</p><h2>Усе про ваші замовлення й проєкти — в одному місці</h2>' +
      '<ul class="kb-perks">' + perks.map(function (p) { return '<li>' + svg(p[0]) + '<div><b>' + p[1] + '</b><span>' + p[2] + '</span></div></li>'; }).join('') + '</ul></section>' +
      '<section class="kb-card kb-in" aria-labelledby="kb-login-h"><h2 id="kb-login-h">Увійти</h2><div id="kb-login"></div></section></div>');
    A.login(document.getElementById('kb-login'), function () { location.reload(); });
    var lead = document.getElementById('kb-lead'); if (lead) lead.hidden = false;
  }

  /* ---------- огляд ---------- */
  function greet() { var h = new Date().getHours(); return h < 5 ? 'Доброї ночі' : h < 12 ? 'Доброго ранку' : h < 18 ? 'Добрий день' : h < 23 ? 'Добрий вечір' : 'Доброї ночі'; }
  function completion(c, P) {
    var s = P.settings || {}, items = [
      ['Імʼя', !!c.name], ['Телефон', !!c.phone], ['Адреса доставки', (P.addresses || []).length > 0],
      ['Email для документів', !!(s.docs_email || c.email)],
      ['Реквізити для рахунку', s.client_type === 'private' ? !!(P.settings && P.settings.client_type) && !P.pending : !!(s.company_name && s.company_code)]
    ];
    var done = items.filter(function (x) { return x[1]; }).length;
    return { pct: Math.round(done / items.length * 100), items: items };
  }
  function overview(c) {
    Promise.all([
      soft(api('/api/account/profile'), { settings: {}, addresses: [] }),
      soft(api('/api/account/orders'), { orders: [] }),
      favorites(),
      soft(api('/api/account/projects'), { projects: [] }),
      catalog()
    ]).then(function (r) {
      var P = r[0], O = (r[1].orders || []), F = r[2] || [], PR = (r[3].projects || []), D = r[4];
      var act = O.filter(active), comp = completion(c, P);
      var since = parseDate(P.created_at);
      var h = '<div class="kb-grid">';
      // привітання
      h += '<section class="kb-card glow s6 kb-in"><div class="kb-hero">' + ava(c) + '<div class="kb-hero-t"><h2>' + greet() + ', ' + esc((c.name || 'клієнте').split(/\s+/)[0]) + '</h2>' +
        '<p>' + (since ? 'З нами з ' + dfmt(since, { month: 'long', year: 'numeric' }) + ' · ' : '') + esc(c.provider === 'telegram' ? (c.username ? '@' + c.username : 'Telegram') : c.provider === 'phone' ? (c.phone || '') : (c.email || '')) + '</p>' +
        '<div class="kb-stats"><a class="kb-chip" href="/kabinet/zamovlennia"><b>' + act.length + '</b> активн' + (act.length === 1 ? 'е' : 'их') + ' замовлен' + (act.length === 1 ? 'ня' : 'ь') + '</a>' +
        '<a class="kb-chip" href="/kabinet/obrane"><b>' + F.length + '</b> в обраному</a><a class="kb-chip" href="/kabinet/proekty"><b>' + PR.length + '</b> проєкт' + (PR.length === 1 ? '' : PR.length > 1 && PR.length < 5 ? 'и' : 'ів') + '</a></div></div>' +
        (c.admin ? '<a class="btn ghost sm" href="/kabinet/admin">Облік замовлень</a>' : '') + '</div></section>';
      // замовлення
      var o = act[0] || O[0];
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-w-o"><div class="kb-ch"><h2 id="kb-w-o">Замовлення</h2><a class="lnk" href="/kabinet/zamovlennia">Усі →</a></div>';
      if (o) {
        h += '<a class="kb-ord" href="/kabinet/zamovlennia?n=' + encodeURIComponent(o.number) + '" style="padding:14px"><div class="kb-ord-h"><b>' + esc(o.number) + '</b>' + stBadge(o) + '</div>' +
          (o.stage !== 'cancelled' ? dots(o.stage) : '') + '<div class="kb-ord-m"><span>' + esc(dfmt(o.created_at)) + '</span><span>' + o.items.length + ' поз.</span><strong>' + money(o.total) + '</strong></div>' +
          (active(o) && eta(o) ? '<small class="muted">Орієнтовна поставка: ' + eta(o) + '</small>' : '') + '</a>';
        if (act.length > 1) h += '<p class="muted" style="font-size:var(--fs-small)">Ще ' + (act.length - 1) + ' активн' + (act.length === 2 ? 'е' : 'их') + ' — у розділі «Замовлення».</p>';
      } else h += '<p class="muted">Замовлень ще немає. Комплектуйте обʼєкт в Оздобі: освітлення, меблі, декор і сантехніка з поставкою 30–60 днів.</p><a class="btn" href="/ozdoba">До каталогу Оздоби</a>';
      h += '</section>';
      // профіль
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-w-p"><div class="kb-ch"><h2 id="kb-w-p">Профіль</h2><a class="lnk" href="/kabinet/profil">Заповнити →</a></div>' +
        '<div class="row" style="gap:18px;align-items:center;flex-wrap:nowrap">' + ring(comp.pct) + '<ul class="kb-todo">' +
        comp.items.map(function (x) { return '<li class="' + (x[1] ? 'ok' : '') + '">' + x[0] + '</li>'; }).join('') + '</ul></div>' +
        (comp.pct < 100 ? '<p class="muted" style="font-size:var(--fs-small)">Заповнений профіль — швидше оформлення й рахунок без уточнень.</p>' : '') + '</section>';
      // проєкти
      var pj = PR.filter(function (p) { return p.status === 'active'; })[0] || PR[0];
      h += '<section class="kb-card s2 kb-in" aria-labelledby="kb-w-pr"><div class="kb-ch"><h2 id="kb-w-pr">Проєкт</h2><a class="lnk" href="/kabinet/proekty">' + (pj ? 'Відкрити →' : 'Детальніше →') + '</a></div>';
      if (pj) h += '<p><b>' + esc(pj.title) + '</b></p>' + bar(pj.progress) + '<p class="muted" style="font-size:var(--fs-small)">Готовність ' + pj.progress + '%' + (pj.next_step ? ' · Далі: ' + esc(pj.next_step) : '') + '</p>';
      else h += '<p class="muted">Дизайн, ремонт чи будівництво з CAS — етапи, фотозвіти раз на 1–2 тижні й документи будуть тут.</p><a class="btn ghost" href="/kabinet/proekty#kb-lead">Обговорити проєкт</a>';
      h += '</section>';
      // обране
      h += '<section class="kb-card s2 kb-in" aria-labelledby="kb-w-f"><div class="kb-ch"><h2 id="kb-w-f">Обране</h2><a class="lnk" href="/kabinet/obrane">Усе →</a></div>';
      var fi = D ? F.map(function (id) { return D.byId[id]; }).filter(Boolean) : [];
      if (fi.length) h += '<p class="kb-big">' + fi.length + '</p><div class="kb-thumbs">' + fi.slice(0, 4).map(function (i) {
        return '<a href="' + esc(url(i)) + '" title="' + esc(i.name) + '">' + (i.img ? '<img src="' + esc(img(i)) + '" width="56" height="56" alt="' + esc(i.name) + '" loading="lazy">' : '<span class="art">' + artSvg(D, i.art) + '</span>') + '</a>';
      }).join('') + '</div>';
      else h += '<p class="muted">Натискайте ♡ на товарах Оздоби — вони збережуться тут на всіх ваших пристроях.</p><a class="btn ghost" href="/ozdoba">Обрати товари</a>';
      h += '</section>';
      // знижка
      h += '<section class="kb-card s2 kb-in">' + volumeBlock(D, P.partner) + '</section>';
      // рекомендації
      if (D) {
        var kits = (D.bundles || []).filter(function (b) { return b.premium; }).slice(0, 3);
        var recs = D.items.filter(function (i) { return i.prio === 'A' && i.img && F.indexOf(i.id) < 0; });
        var off = new Date().getDate() % Math.max(1, recs.length - 4);
        recs = recs.slice(off, off + 4);
        h += '<section class="kb-card s4 kb-in" aria-labelledby="kb-w-r"><div class="kb-ch"><h2 id="kb-w-r">Рекомендуємо з Оздоби</h2><a class="lnk" href="/ozdoba/komplekty">Усі комплекти →</a></div>' +
          '<div class="kb-kits">' + kits.map(function (b) {
            return '<a class="kb-kit" href="/ozdoba/komplekty#k-' + esc(b.id) + '"><span class="ic">' + artSvg(D, b.art) + '</span><span><b>' + esc(b.name) + '</b><small class="muted">Комплект під ключ</small></span></a>';
          }).join('') + '</div><div class="kb-prods">' + recs.map(function (i) { return prodCard(D, i); }).join('') + '</div>' +
          '<p class="muted" style="font-size:12px">Мінімальне замовлення — від $500 (≈23 000 ₴), від 10 шт кожної позиції. Поставка з Китаю 30–60 днів.</p></section>';
      }
      h += managerCard('s2', pj && pj.manager);
      paint(h + '</div>');
    });
  }

  /* ---------- замовлення ---------- */
  function orders() {
    var n = new URLSearchParams(location.search).get('n');
    if (n) return orderDetail(n);
    api('/api/account/orders').then(function (d) {
      var O = d.orders || [];
      if (!O.length) return paint(empty(IC.box, 'Замовлень ще немає', 'Додайте товари в кошик Оздоби або візьміть готовий комплект для ресторану, готелю чи офісу — оформлене замовлення зʼявиться тут зі статусом і датою поставки.',
        '<div class="row" style="justify-content:center"><a class="btn" href="/ozdoba">До каталогу</a><a class="btn ghost" href="/ozdoba/komplekty">Комплекти</a></div>') + '<div class="kb-grid" style="margin-top:16px">' + managerCard('s6') + '</div>');
      var filt = 'active';
      function draw() {
        var L = O.filter(function (o) { return filt === 'all' ? true : filt === 'active' ? active(o) : !active(o); });
        var cnt = { active: O.filter(active).length, done: O.filter(function (o) { return !active(o); }).length, all: O.length };
        paint('<div class="kb-filter kb-noprint" role="group" aria-label="Фільтр замовлень">' + [['active', 'Активні'], ['done', 'Завершені'], ['all', 'Усі']].map(function (f) {
          return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (filt === f[0]) + '">' + f[1] + ' · ' + cnt[f[0]] + '</button>';
        }).join('') + '</div><div class="kb-list">' + (L.length ? L.map(function (o) {
          return '<a class="kb-ord kb-in" href="/kabinet/zamovlennia?n=' + encodeURIComponent(o.number) + '"><div class="kb-ord-h"><b>' + esc(o.number) + '</b>' + stBadge(o) + '</div>' +
            (o.stage !== 'cancelled' ? dots(o.stage) : '') +
            '<div class="kb-ord-m"><span>' + esc(dfmt(o.created_at)) + '</span><span>' + o.items.length + ' поз. · ' + o.items.reduce(function (s, i) { return s + (i.qty || 0); }, 0) + ' од.</span>' +
            (active(o) && eta(o) ? '<span>Поставка: ' + eta(o) + '</span>' : '') + '<strong>' + money(o.total) + (o.on_request ? ' + ' + o.on_request + ' за запитом' : '') + '</strong></div>' +
            '<small class="muted">' + esc(o.items.slice(0, 3).map(function (i) { return i.name; }).join(' · ')) + (o.items.length > 3 ? ' …' : '') + '</small></a>';
        }).join('') : '<p class="muted">Тут поки порожньо.</p>') + '</div>');
        box.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { filt = b.getAttribute('data-f'); draw(); }; });
      }
      if (!O.filter(active).length) filt = 'all';
      draw();
    }, function (e) { paint('<p class="acc-err">' + esc(e.message) + '</p>'); });
  }
  function orderDetail(number) {
    Promise.all([api('/api/account/orders?number=' + encodeURIComponent(number)), catalog()]).then(function (r) {
      var o = r[0].order, D = r[1], n = stageIdx(o.stage), ev = {};
      (o.events || []).forEach(function (e) { if (!ev[e.stage]) ev[e.stage] = e.created_at; });
      ev.new = ev.new || o.created_at;
      var tl = o.stage === 'cancelled'
        ? '<ol class="kb-tl"><li class="on"><span class="d"></span><div><b>Нове</b><small>' + esc(dfmt(o.created_at)) + '</small></div></li><li class="cur"><span class="d"></span><div><b>Скасовано</b><small>' + esc(dfmt(ev.cancelled || o.updated_at)) + '</small></div></li></ol>'
        : '<ol class="kb-tl h">' + STAGES.map(function (s, i) {
          return '<li class="' + (i < n || (i === n && s[0] === 'delivered') ? 'on' : i === n ? 'cur' : '') + '"' + (i === n ? ' aria-current="step"' : '') + '><span class="d"></span><div><b>' + s[1] + '</b><small>' + (ev[s[0]] ? esc(dfmt(ev[s[0]], { day: 'numeric', month: 'short' })) : i === n ? 'зараз' : '') + '</small></div></li>';
        }).join('') + '</ol>';
      var goods = o.items.reduce(function (s, i) { return s + (i.price || 0) * i.qty; }, 0);
      var ship = Math.max(0, (o.total || 0) - (goods - (o.discount || 0)));
      var et = eta(o);
      var h = '<a class="kb-back kb-noprint" href="/kabinet/zamovlennia">← Усі замовлення</a>' +
        '<p class="kb-print-h">CAS Development · Оздоба · cas-develop.com · ' + PHONE_TXT + '</p>' +
        '<div class="kb-grid"><section class="kb-card s6 kb-in"><div class="kb-ord-h"><div><p class="kb-eyebrow">Замовлення</p><h2 style="font-size:clamp(1.8rem,1.4rem + 1.2vw,2.4rem)">' + esc(o.number) + '</h2>' +
        '<small class="muted">від ' + esc(dfmt(o.created_at)) + '</small></div>' + stBadge(o) + '</div>' + tl +
        '<div class="kb-note">' + esc(STAGE_NOTE[o.stage] || '') + (et ? ' Орієнтовна поставка: <b>' + et + '</b> (30–60 днів).' : '') + '</div>' +
        (o.manager_note ? '<p><b>Менеджер:</b> ' + esc(o.manager_note) + '</p>' : '') +
        '<div class="row kb-noprint"><button class="btn" type="button" id="kb-repeat">Повторити замовлення</button><button class="btn ghost" type="button" id="kb-print">Завантажити PDF / друк</button>' +
        '<a class="btn ghost" href="https://t.me/' + PHONE + '" target="_blank" rel="noopener">Питання менеджеру</a></div></section>' +
        '<section class="kb-card s6 kb-in" aria-labelledby="kb-oi"><h2 id="kb-oi">Позиції</h2><div class="kb-scroll"><table class="kb-items"><thead><tr><th>Товар</th><th class="hm">Колір / розмір</th><th class="n">К-сть</th><th class="n hm">Ціна</th><th class="n">Сума</th></tr></thead><tbody>' +
        o.items.map(function (i) {
          var it = D && D.byId[i.id];
          return '<tr><td>' + (it ? '<a href="' + esc(url(it)) + '">' + esc(i.name) + '</a>' : esc(i.name)) + '<small class="muted so" style="display:block">' + esc([i.color, i.size].filter(Boolean).join(', ')) + '</small></td>' +
            '<td class="hm">' + esc([i.color, i.size].filter(Boolean).join(', ')) + '</td><td class="n">' + i.qty + ' ' + esc(i.unit || '') + '</td><td class="n hm">' + money(i.price) + '</td><td class="n">' + (i.price == null ? 'за запитом' : money(i.price * i.qty)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<dl class="kb-sum"><dt>Товари</dt><dd>' + money(goods) + '</dd>' +
        (o.discount ? '<dt>Знижка −' + o.discount_pct + '%' + (o.promo ? ' (код ' + esc(o.promo) + ')' : '') + '</dt><dd>−' + money(o.discount) + '</dd>' : '') +
        (ship ? '<dt>Доставка</dt><dd>' + money(ship) + '</dd>' : '') +
        '<dt class="t">Разом</dt><dd class="t">' + money(o.total) + (o.on_request ? ' + ' + o.on_request + ' поз. за запитом' : '') + '</dd></dl>' +
        '<div class="kb-ord-m">' + (o.delivery ? '<span>Доставка: <strong>' + esc(o.delivery) + '</strong></span>' : '') + (o.payment ? '<span>Оплата: <strong>' + esc({ card: 'карткою', parts: 'частинами', invoice: 'рахунок для ФОП/ТОВ', cod: 'при отриманні', cash: 'готівкою (UAH / USD / EUR)', usdt: 'USDT' }[o.payment] || o.payment) + '</strong></span>' : '') +
        (o.company ? '<span>Компанія: <strong>' + esc(o.company) + '</strong></span>' : '') + '</div>' + (o.comment ? '<p class="muted" style="font-size:var(--fs-small)">Коментар: ' + esc(o.comment) + '</p>' : '') + '</section>' +
        managerCard('s6 kb-noprint') + '</div>';
      paint(h);
      document.title = o.number + ' — замовлення | CAS Development';
      document.getElementById('kb-print').onclick = function () { window.print(); };
      document.getElementById('kb-repeat').onclick = function () { repeat(o, D); };
    }, function (e) {
      paint(empty(IC.box, 'Замовлення не знайдено', esc(e.message) + '. Перевірте посилання або відкрийте список замовлень.', '<a class="btn" href="/kabinet/zamovlennia">Мої замовлення</a>'));
    });
  }
  function repeat(o, D) { // ті самі позиції → кошик Оздоби ('ozd-cart', формат app.js)
    if (!D) return toast('Каталог не завантажився — спробуйте ще раз', true);
    var c = cart(), added = 0, miss = 0;
    o.items.forEach(function (it) {
      var i = D.byId[it.id]; if (!i) { miss++; return; }
      var cs = D.colorsets[i.cs] || [], ss = i.ss ? D.sizesets[i.ss] : null;
      var ci = Math.max(0, cs.findIndex(function (x) { return x[0] === it.color; }));
      var si = ss ? (it.size ? ss.findIndex(function (x) { return x[0] === it.size; }) : -1) : 0;
      if (si < 0) si = defS(D, i);
      var qty = Math.max(1, Math.min(10000, Number(it.qty) || 1));
      var ex = c.filter(function (x) { return x.id === i.id && x.ci === ci && x.si === si; })[0];
      if (ex) ex.qty += qty; else c.push({ id: i.id, ci: ci, si: si, qty: qty });
      added++;
    });
    ls.set('ozd-cart', c);
    if (!added) return toast('Цих товарів уже немає в каталозі', true);
    toast('Додано в кошик: ' + added + ' поз.' + (miss ? ' (' + miss + ' немає в каталозі)' : '') + ' — відкриваємо Оздобу…');
    setTimeout(function () { location.href = '/ozdoba'; }, 1200);
  }

  /* ---------- обране ---------- */
  function fav() {
    Promise.all([favorites(), catalog()]).then(function (r) {
      var D = r[1];
      function draw(ids) {
        var L = D ? ids.map(function (id) { return D.byId[id]; }).filter(Boolean) : [];
        if (!L.length) return paint(empty(IC.heart, 'В обраному порожньо', 'Натискайте ♡ на картках товарів в Оздобі — збережені позиції будуть тут на всіх ваших пристроях. Зручно, щоб показати дизайнеру чи партнеру.',
          '<a class="btn" href="/ozdoba">Перейти в Оздобу</a>'));
        var sum = L.reduce(function (s, i) { var p = minPrice(D, i); return s + (p || 0); }, 0);
        paint('<div class="row kb-in" style="justify-content:space-between;margin-bottom:14px"><p class="muted">' + L.length + ' товар' + (L.length === 1 ? '' : L.length < 5 ? 'и' : 'ів') + (sum ? ' · від ' + money(sum) + ' за одиницю кожного' : '') + '</p>' +
          '<a class="btn ghost sm" href="/ozdoba">Додати ще</a></div><div class="kb-prods">' + L.map(function (i) { return prodCard(D, i, { remove: true }); }).join('') + '</div>' +
          '<p class="muted kb-in" style="font-size:var(--fs-small);margin-top:14px">Щоб замовити, відкрийте товар, оберіть колір і розмір. Мінімум — 10 шт кожної позиції, замовлення від $500 (≈23 000 ₴). Можливе виготовлення під замовлення: колір, розмір, матеріал.</p>');
        box.querySelectorAll('[data-unfav]').forEach(function (b) {
          b.onclick = function () { var id = +b.getAttribute('data-unfav'); b.disabled = true; unfav(id).then(function (ids) { toast('Прибрано з обраного'); draw(ids); }); };
        });
      }
      draw(r[0] || []);
    });
  }

  /* ---------- проєкти ---------- */
  var SERV = { design: 'Дизайн інтерʼєру', repair: 'Ремонт', build: 'Будівництво', furnish: 'Комплектація й меблювання', landscape: 'Ландшафтний дизайн', other: 'Проєкт' };
  var DOCK = { contract: ['Договір', 'DOC'], estimate: ['Кошторис', 'EST'], invoice: ['Рахунок', 'INV'], act: ['Акт', 'ACT'], design: ['Дизайн-проєкт', 'PDF'], other: ['Документ', 'FILE'] };
  function docs(L) {
    return '<ul class="kb-docs">' + L.map(function (d) {
      var u = safeUrl(d.url); if (!u) return '';
      var k = DOCK[d.kind] || DOCK.other;
      return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"><span class="ic">' + k[1] + '</span><span><b>' + esc(d.title) + '</b><small class="muted">' + k[0] + ' · ' + esc(dfmt(d.created_at)) + '</small></span>' + svg(IC.arrow) + '</a></li>';
    }).join('') + '</ul>';
  }
  function projects(c) {
    var lead = document.getElementById('kb-lead');
    api('/api/account/projects').then(function (d) {
      var P = d.projects || [];
      if (lead) {
        lead.hidden = false;
        var nm = document.getElementById('oName'), ph = document.getElementById('oPhone');
        if (nm && !nm.value) nm.value = c.name || '';
        if (ph && !ph.value) ph.value = c.phone || '';
      }
      if (!P.length) {
        var svc = [['/dyzain-interieru-kyiv', 'Дизайн інтерʼєру', 'від $30/м²'], ['/remont-kvartyr-kyiv', 'Ремонт квартири', 'від $550/м²'],
          ['/budivnytstvo-budynkiv-kyiv', 'Будівництво будинку', 'від $600/м²'], ['/remont-ofisu-pid-klyuch-kyiv', 'Ремонт офісу', 'від $350/м²'],
          ['/dyzain-restoranu-kafe-kyiv', 'Ресторан і кафе', 'під ключ'], ['/dyzain-hotelu-kyiv', 'Готель', 'під ключ']];
        paint(empty(IC.plan, 'Тут житиме ваш проєкт', 'Коли ми почнемо дизайн, ремонт чи будівництво, тут зʼявляться етапи з прогресом, фотозвіти з обʼєкта раз на 1–2 тижні, договір, кошторис і рахунки. 150+ проєктів з 2016 року, гарантія 36 місяців.',
          '<a class="btn" href="#kb-lead">Обговорити проєкт</a><div class="kb-services">' + svc.map(function (s) { return '<a href="' + s[0] + '">' + s[1] + '<span>' + s[2] + '</span></a>'; }).join('') + '</div>' +
          '<p class="muted" style="font-size:12px">Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.</p>') +
          (d.documents && d.documents.length ? '<section class="kb-card kb-in" style="margin-top:16px"><h2>Документи</h2>' + docs(d.documents) + '</section>' : ''));
        return;
      }
      var h = '<div class="kb-proj">';
      P.forEach(function (p) {
        var stIdx = p.stages.findIndex(function (s) { return (s.progress || 0) < 100; });
        h += '<section class="kb-card glow kb-in"><div class="kb-ch"><div><p class="kb-eyebrow">' + esc(SERV[p.service] || 'Проєкт') + (p.area ? ' · ' + esc(p.area) + ' м²' : '') + '</p><h2>' + esc(p.title) + '</h2>' +
          (p.address ? '<small class="muted">' + esc(p.address) + '</small>' : '') + '</div><span class="kb-st' + (p.status === 'done' ? ' ok' : '') + '">' + ({ active: 'Триває', paused: 'На паузі', done: 'Завершено' }[p.status] || '') + '</span></div>' +
          '<div class="row" style="justify-content:space-between"><span>Загальна готовність</span><b class="kb-big" style="font-size:2rem">' + p.progress + '%</b></div>' + bar(p.progress) +
          (p.next_step ? '<div class="kb-next">' + svg(IC.flag) + '<div><p class="kb-eyebrow">Наступний крок' + (p.next_date ? ' · ' + esc(dfmt(p.next_date, { day: 'numeric', month: 'long' })) : '') + '</p><p>' + esc(p.next_step) + '</p></div></div>' : '') +
          (p.stages.length ? '<h3>Етапи</h3><div class="kb-stages">' + p.stages.map(function (s, i) {
            var pc = Math.max(0, Math.min(100, s.progress || 0));
            return '<div class="kb-stage' + (pc >= 100 ? ' done' : '') + '"><div class="kb-stage-h"><b>' + (i + 1) + '. ' + esc(s.name) + (i === stIdx ? ' <span class="kb-st" style="padding:1px 8px;font-size:11px">зараз</span>' : '') + '</b><span class="muted">' +
              [s.start && dfmt(s.start, { day: 'numeric', month: 'short' }), s.end && dfmt(s.end, { day: 'numeric', month: 'short' })].filter(Boolean).join(' – ') + ' · ' + pc + '%</span></div>' + bar(pc) +
              (s.note ? '<small class="muted">' + esc(s.note) + '</small>' : '') + '</div>';
          }).join('') + '</div>' : '') + '</section>';
        h += '<div class="kb-grid"><section class="kb-card s4 kb-in" aria-label="Фотозвіти"><div class="kb-ch"><h2>Фотозвіти</h2><small class="muted">раз на 1–2 тижні</small></div>' +
          (p.reports.length ? p.reports.map(function (r) {
            var ph = r.photos.map(safeUrl).filter(Boolean);
            return '<div class="kb-rep"><div class="kb-rep-h"><b>' + esc(r.title || 'Звіт') + '</b><span class="muted">' + esc(dfmt(r.date)) + '</span></div>' + (r.note ? '<p class="muted" style="font-size:var(--fs-small);margin-bottom:8px">' + esc(r.note) + '</p>' : '') +
              (ph.length ? '<div class="kb-gal">' + ph.map(function (u, k) { return '<button type="button" data-lb="' + esc(u) + '" data-cap="' + esc((r.title || 'Фотозвіт') + ' · ' + dfmt(r.date)) + '"><img src="' + esc(u) + '" width="320" height="240" alt="' + esc((r.title || 'Фотозвіт') + ', фото ' + (k + 1)) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>'; }).join('') + '</div>' : '') + '</div>';
          }).join('') : '<p class="muted">Перший фотозвіт зʼявиться після старту робіт на обʼєкті.</p>') + '</section>' +
          '<section class="kb-card s2 kb-in" aria-label="Документи"><h2>Документи</h2>' + (p.documents.length ? docs(p.documents) : '<p class="muted">Договір, кошторис і рахунки зʼявляться тут.</p>') + '</section></div>';
        if (!h.includes('id="kb-mgr"')) h += '<div class="kb-grid">' + managerCard('s6', p.manager) + '</div>';
      });
      if (d.documents && d.documents.length) h += '<section class="kb-card kb-in"><h2>Інші документи</h2>' + docs(d.documents) + '</section>';
      paint(h + '</div>');
      if (lead) { var hh = document.getElementById('kb-lead-h'); if (hh) hh.textContent = 'Новий проєкт'; }
      lightbox();
    }, function (e) { paint('<p class="acc-err">' + esc(e.message) + '</p>'); });
  }
  function lightbox() {
    var dlg = null;
    box.querySelectorAll('[data-lb]').forEach(function (b) {
      b.onclick = function () {
        if (!dlg) {
          dlg = document.createElement('dialog'); dlg.className = 'kb-lb';
          dlg.innerHTML = '<button type="button" aria-label="Закрити">✕</button><img alt="" width="1200" height="900"><p></p>';
          document.body.appendChild(dlg);
          dlg.querySelector('button').onclick = function () { dlg.close(); };
          dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
        }
        var im = dlg.querySelector('img'); im.src = b.getAttribute('data-lb'); im.alt = b.getAttribute('data-cap');
        dlg.querySelector('p').textContent = b.getAttribute('data-cap');
        if (dlg.showModal) dlg.showModal(); else window.open(b.getAttribute('data-lb'), '_blank', 'noopener');
      };
    });
  }

  /* ---------- профіль ---------- */
  var KIND = { np_branch: 'Нова Пошта — відділення', np_locker: 'Нова Пошта — поштомат', object: 'Адреса обʼєкта' };
  function profile(c) {
    Promise.all([api('/api/account/profile'), catalog()]).then(function (r) {
      var P = r[0], D = r[1], s = P.settings || {}, cl = P.client || c;
      var h = '<div class="kb-grid">';
      if (P.pending) h += '<div class="kb-note s6">Розділ оновлюється: адреси й реквізити можна буде зберегти за кілька хвилин. Імʼя й телефон зберігаються вже зараз.</div>';
      // особисті дані
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-pd"><div class="kb-ch"><h2 id="kb-pd">Особисті дані</h2>' + ava(cl, true) + '</div><form id="kb-pf" novalidate>' +
        '<div class="field"><label for="pf-name">Імʼя</label><input id="pf-name" name="name" autocomplete="name" maxlength="120" value="' + esc(cl.name) + '" data-auto></div>' +
        '<div class="field"><label for="pf-phone">Телефон</label><input id="pf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="097 123 45 67" value="' + esc(cl.phone) + '" data-auto aria-describedby="pf-phone-e"><div class="err" id="pf-phone-e" role="alert"></div></div>' +
        '<div class="field"><label for="pf-mail">Email для рахунків і документів</label><input id="pf-mail" name="docs_email" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(cl.email || 'name@company.ua') + '" value="' + esc(s.docs_email) + '" data-auto aria-describedby="pf-mail-e"><div class="err" id="pf-mail-e" role="alert"></div></div>' +
        '<div class="field"><label for="pf-lang">Мова спілкування</label><select id="pf-lang" name="lang" data-auto>' + [['uk', 'Українська'], ['ru', 'Русский'], ['en', 'English']].map(function (l) { return '<option value="' + l[0] + '"' + (s.lang === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></div>' +
        '<label class="kb-sw field"><span>Сповіщення про статуси в Telegram<small class="muted" style="display:block">Нове → в роботі → … → доставлено</small></span><input type="checkbox" name="notify_tg" data-auto' + (s.notify_tg !== 0 ? ' checked' : '') + '></label>' +
        '<p class="muted" style="font-size:12px">Зберігається автоматично. Вхід: ' + esc(cl.provider === 'telegram' ? 'Telegram' + (cl.username ? ' @' + cl.username : '') : cl.provider === 'google' ? 'Google · ' + (cl.email || '') : 'номер телефону') + '</p></form></section>';
      // реквізити
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-rq"><h2 id="kb-rq">Реквізити для рахунку</h2><form id="kb-rf" novalidate>' +
        '<div class="field"><span class="muted" style="display:block;font-size:var(--fs-small);margin-bottom:6px" id="rf-tl">Хто платить</span><div class="kb-seg" role="radiogroup" aria-labelledby="rf-tl">' +
        [['private', 'Приватна особа'], ['fop', 'ФОП'], ['tov', 'ТОВ'], ['eu', 'Компанія з ЄС']].map(function (t) {
          return '<label><input type="radio" name="client_type" value="' + t[0] + '"' + ((s.client_type || 'private') === t[0] ? ' checked' : '') + ' data-auto><span>' + t[1] + '</span></label>';
        }).join('') + '</div></div><div id="rf-co">' +
        '<div class="field"><label for="rf-name">Назва компанії / ПІБ ФОП</label><input id="rf-name" name="company_name" maxlength="200" autocomplete="organization" value="' + esc(s.company_name) + '" data-auto></div>' +
        '<div class="field"><label for="rf-code" id="rf-code-l">ЄДРПОУ</label><input id="rf-code" name="company_code" inputmode="numeric" maxlength="20" value="' + esc(s.company_code) + '" data-auto aria-describedby="rf-code-h rf-code-e"><div class="hint" id="rf-code-h"></div><div class="err" id="rf-code-e" role="alert"></div></div></div>' +
        '<div class="kb-note" id="rf-note"></div></form></section>';
      // адреси
      h += '<section class="kb-card s6 kb-in" aria-labelledby="kb-ad"><div class="kb-ch"><h2 id="kb-ad">Адреси доставки</h2><button class="btn ghost sm" type="button" id="ad-add">+ Додати адресу</button></div><div id="ad-list" class="kb-addr"></div><div id="ad-form"></div></section>';
      // партнерам і знижки
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-pt"><h2 id="kb-pt">Партнерам</h2>' + (P.partner
        ? '<p class="muted" style="font-size:var(--fs-small)">Ваш особистий код партнера:</p><div class="kb-code"><b>' + esc(P.partner.code) + '</b><button class="btn ghost sm" type="button" id="pt-copy" data-code="' + esc(P.partner.code) + '">Скопіювати</button></div>' +
          '<p>Знижка <b>' + P.partner.discount + '%</b> · замовлень з кодом: ' + (P.partner.uses || 0) + '</p><div class="kb-note">Код не сумується зі знижкою за обсягом — діє більша. Вводьте його в кошику Оздоби або передайте клієнту.</div>'
        : '<p class="muted">Дизайнерам, архітекторам і студіям — особистий код партнера зі знижкою на товари Оздоби для ваших обʼєктів. Публічних промокодів немає.</p><a class="btn ghost" href="https://t.me/' + PHONE + '" target="_blank" rel="noopener">Стати партнером</a>') + '</section>';
      h += '<section class="kb-card s3 kb-in">' + volumeBlock(D, null) + '</section>';
      h += '<section class="kb-card s6 kb-in kb-noprint"><div class="row" style="justify-content:space-between"><p class="muted">Вийти з кабінету на цьому пристрої</p><div class="row">' + (cl.admin ? '<a class="btn ghost sm" href="/kabinet/admin">Облік замовлень</a>' : '') + '<button class="btn ghost sm" type="button" id="kb-out">Вийти</button></div></div></section>';
      paint(h + '</div>');
      bindProfile(P);
    }, function (e) { paint('<p class="acc-err">' + esc(e.message) + '</p>'); });
  }
  // валідація: телефон UA, ЄДРПОУ 8 цифр / ІПН 10, email
  function phoneOk(v) { var d = String(v).replace(/[^\d+]/g, '').replace(/^\+/, ''); if (/^0\d{9}$/.test(d)) d = '38' + d; return !v.trim() || /^380\d{9}$/.test(d); }
  var mailOk = function (v) { return !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); };
  function codeErr(type, v) {
    v = String(v || '').replace(/\s/g, '');
    if (!v || type === 'eu' || type === 'private') return '';
    if (type === 'tov' && !/^\d{8}$/.test(v)) return 'ЄДРПОУ — 8 цифр';
    if (type === 'fop' && !/^\d{10}$/.test(v)) return 'ІПН — 10 цифр';
    return '';
  }
  function bindProfile(P) {
    var pf = document.getElementById('kb-pf'), rf = document.getElementById('kb-rf');
    var setErr = function (id, msg, inp) { var e = document.getElementById(id); if (e) e.textContent = msg || ''; if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); } };
    function rfSync() {
      var t = (rf.querySelector('[name=client_type]:checked') || {}).value || 'private';
      document.getElementById('rf-co').hidden = t === 'private';
      document.getElementById('rf-code-l').textContent = t === 'fop' ? 'ІПН (РНОКПП)' : t === 'eu' ? 'VAT / реєстраційний номер' : 'ЄДРПОУ';
      document.getElementById('rf-code-h').textContent = t === 'fop' ? '10 цифр' : t === 'tov' ? '8 цифр' : '';
      document.getElementById('rf-note').innerHTML = t === 'eu' ? 'Рахунки для компаній з ЄС — у процесі підключення. Збережіть дані — менеджер повідомить, щойно це запрацює.'
        : t === 'private' ? 'Оплата карткою за посиланням від менеджера. Для рахунку оберіть ФОП чи ТОВ.' : 'Виставляємо рахунок для ФОП і ТОВ — дані підставимо автоматично під час оформлення.';
      return t;
    }
    rfSync();
    var timers = {};
    function save(field, value, inp) {
      var b = {}; b[field] = value;
      return api('/api/account/profile', { method: 'PATCH', body: b }).then(function (d) {
        P = d; var f = inp && inp.closest('.field');
        if (f) { f.classList.add('saved'); setTimeout(function () { f.classList.remove('saved'); }, 1400); }
        if (field === 'phone' && d.client && inp) inp.value = d.client.phone || '';
        toast('Збережено');
      }, function (e) { toast(e.message, true); });
    }
    function auto(form) {
      form.addEventListener('input', function (e) { schedule(e.target, 900); });
      form.addEventListener('change', function (e) { schedule(e.target, 0); });
      form.addEventListener('submit', function (e) { e.preventDefault(); });
    }
    function schedule(inp, ms) {
      if (!inp.hasAttribute('data-auto')) return;
      var name = inp.name, val = inp.type === 'checkbox' ? inp.checked : inp.value;
      clearTimeout(timers[name]);
      timers[name] = setTimeout(function () {
        if (name === 'phone') { if (!phoneOk(val)) return setErr('pf-phone-e', 'Номер у форматі 097 123 45 67 або +380…', inp); setErr('pf-phone-e', '', inp); }
        if (name === 'docs_email') { if (!mailOk(val)) return setErr('pf-mail-e', 'Перевірте email', inp); setErr('pf-mail-e', '', inp); }
        if (name === 'name' && !String(val).trim()) return;
        if (name === 'client_type') {
          var t = rfSync(), code = document.getElementById('rf-code'), ce = codeErr(t, code.value);
          setErr('rf-code-e', ce, code);
          if (ce) { // тип змінився, а код ще під старий — збережемо тип разом з очищеним кодом лише після виправлення
            return api('/api/account/profile', { method: 'PATCH', body: { client_type: t, company_code: '' } }).then(function () { toast('Тип збережено — вкажіть ' + (t === 'fop' ? 'ІПН' : 'ЄДРПОУ')); }, function (e) { toast(e.message, true); });
          }
        }
        if (name === 'company_code') {
          var t2 = rfSync(), ce2 = codeErr(t2, val); setErr('rf-code-e', ce2, inp); if (ce2) return;
        }
        if (name === 'company_name' || name === 'company_code' || name === 'client_type' || name === 'docs_email' || name === 'lang' || name === 'notify_tg') {
          if (P.pending) return toast('Реквізити можна буде зберегти за кілька хвилин', true);
        }
        save(name, val, inp);
      }, ms);
    }
    auto(pf); auto(rf);
    // адреси
    var list = document.getElementById('ad-list'), fbox = document.getElementById('ad-form');
    function drawAddr() {
      var L = P.addresses || [];
      list.innerHTML = L.length ? L.map(function (a) {
        return '<div class="kb-addr-i' + (a.is_default ? ' def' : '') + '"><div class="tx"><b>' + esc(a.label || KIND[a.kind]) + (a.is_default ? ' <span class="kb-st" style="padding:1px 8px;font-size:11px">основна</span>' : '') + '</b>' +
          esc(a.city) + (a.kind === 'object' ? ', ' + esc(a.address) : ', ' + (a.kind === 'np_locker' ? 'поштомат' : 'відділення') + ' №' + esc(a.branch)) +
          (a.recipient || a.phone ? '<br><span class="muted">' + esc([a.recipient, a.phone].filter(Boolean).join(' · ')) + '</span>' : '') + '<br><small class="muted">' + KIND[a.kind] + '</small></div>' +
          '<div class="act">' + (a.is_default ? '' : '<button class="btn ghost sm" type="button" data-def="' + a.id + '">Основна</button>') + '<button class="btn ghost sm" type="button" data-ed="' + a.id + '">Змінити</button><button class="btn ghost sm" type="button" data-del="' + a.id + '" aria-label="Видалити адресу">✕</button></div></div>';
      }).join('') : '<p class="muted">Додайте відділення Нової Пошти або адресу обʼєкта — підставимо їх під час оформлення замовлення.</p>';
      list.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (!confirm('Видалити адресу?')) return; addrReq('DELETE', null, '?id=' + b.getAttribute('data-del')); }; });
      list.querySelectorAll('[data-def]').forEach(function (b) { b.onclick = function () { addrReq('PATCH', { id: +b.getAttribute('data-def'), is_default: true }); }; });
      list.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { form(L.filter(function (a) { return a.id === +b.getAttribute('data-ed'); })[0]); }; });
    }
    function addrReq(method, body, q) {
      return api('/api/account/addresses' + (q || ''), { method: method, body: body }).then(function (d) { P.addresses = d.addresses; drawAddr(); fbox.innerHTML = ''; toast(method === 'DELETE' ? 'Адресу видалено' : 'Адресу збережено'); return true; },
        function (e) { toast(e.message, true); var er = document.getElementById('ad-e'); if (er) er.textContent = e.message; return false; });
    }
    function form(a) {
      a = a || { kind: 'np_branch' };
      fbox.innerHTML = '<form class="kb-addr-f" id="ad-f" novalidate style="margin-top:12px"><div class="field"><div class="kb-seg" role="radiogroup" aria-label="Тип адреси">' +
        Object.keys(KIND).map(function (k) { return '<label><input type="radio" name="kind" value="' + k + '"' + (a.kind === k ? ' checked' : '') + '><span>' + KIND[k].replace('Нова Пошта — ', 'НП: ') + '</span></label>'; }).join('') + '</div></div>' +
        '<div class="kb-f2"><div class="field"><label for="ad-city">Місто *</label><input id="ad-city" name="city" required maxlength="80" autocomplete="address-level2" value="' + esc(a.city) + '"></div>' +
        '<div class="field" id="ad-br-w"><label for="ad-br" id="ad-br-l">Номер відділення *</label><input id="ad-br" name="branch" inputmode="numeric" maxlength="6" value="' + esc(a.branch) + '"></div>' +
        '<div class="field" id="ad-adr-w"><label for="ad-adr">Адреса обʼєкта *</label><input id="ad-adr" name="address" maxlength="200" autocomplete="street-address" value="' + esc(a.address) + '"></div>' +
        '<div class="field"><label for="ad-lab">Назва (необовʼязково)</label><input id="ad-lab" name="label" maxlength="60" placeholder="Офіс, ресторан, дача" value="' + esc(a.label) + '"></div>' +
        '<div class="field"><label for="ad-rec">Отримувач</label><input id="ad-rec" name="recipient" maxlength="120" autocomplete="name" value="' + esc(a.recipient) + '"></div>' +
        '<div class="field"><label for="ad-ph">Телефон отримувача</label><input id="ad-ph" name="phone" type="tel" inputmode="tel" placeholder="097 123 45 67" value="' + esc(a.phone) + '"></div></div>' +
        '<label class="kb-sw field" style="max-width:340px"><span>Основна адреса</span><input type="checkbox" name="is_default"' + (a.is_default ? ' checked' : '') + '></label>' +
        '<p class="err" id="ad-e" role="alert"></p><div class="row"><button class="btn" type="submit">Зберегти адресу</button><button class="btn ghost" type="button" id="ad-x">Скасувати</button></div></form>';
      var f = document.getElementById('ad-f');
      function kindSync() {
        var k = f.kind.value;
        document.getElementById('ad-br-w').hidden = k === 'object';
        document.getElementById('ad-adr-w').hidden = k !== 'object';
        document.getElementById('ad-br-l').textContent = k === 'np_locker' ? 'Номер поштомату *' : 'Номер відділення *';
      }
      kindSync();
      f.addEventListener('change', function (e) { if (e.target.name === 'kind') kindSync(); });
      document.getElementById('ad-x').onclick = function () { fbox.innerHTML = ''; };
      f.onsubmit = function (e) {
        e.preventDefault();
        var er = document.getElementById('ad-e'), k = f.kind.value;
        var b = { kind: k, city: f.city.value, branch: f.branch.value, address: f.address.value, label: f.label.value, recipient: f.recipient.value, phone: f.phone.value, is_default: f.is_default.checked };
        if (!b.city.trim()) { er.textContent = 'Вкажіть місто'; f.city.focus(); return; }
        if (k === 'object' ? !b.address.trim() : !/^\d{1,6}$/.test(b.branch.trim())) { er.textContent = k === 'object' ? 'Вкажіть адресу обʼєкта' : 'Номер відділення чи поштомату — цифрами'; return; }
        if (!phoneOk(b.phone)) { er.textContent = 'Телефон отримувача: 097 123 45 67'; f.phone.focus(); return; }
        if (P.pending) { er.textContent = 'Адреси можна буде зберегти за кілька хвилин'; return; }
        if (a.id) b.id = a.id;
        addrReq(a.id ? 'PATCH' : 'POST', b);
      };
      f.city.focus();
    }
    document.getElementById('ad-add').onclick = function () { form(null); };
    drawAddr();
    var cp = document.getElementById('pt-copy');
    if (cp) cp.onclick = function () {
      var code = cp.getAttribute('data-code');
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { toast('Код скопійовано'); }, function () { toast(code); });
    };
    document.getElementById('kb-out').onclick = function () { A.logout().then(function () { location.href = '/kabinet'; }); };
  }

  /* ---------- старт ---------- */
  function start() {
    if (!A) { paint('<p class="acc-err">Не вдалося завантажити кабінет. Оновіть сторінку.</p>'); return; }
    A.me().then(function (c) {
      if (!c) return guest();
      if (TAB === 'orders') orders(c);
      else if (TAB === 'fav') fav(c);
      else if (TAB === 'projects') projects(c);
      else if (TAB === 'profile') profile(c);
      else overview(c);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
