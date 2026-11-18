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
  // мова інтерфейсу — /assets/kabinet-i18n.v1.js (window.CASKab): T('український текст', {змінні}) → переклад зі словника мови
  var KL = window.CASKab || { lang: 'uk', locale: 'uk-UA', T: function (s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; } };
  var T = KL.T, LOC = KL.locale;
  // Оздоба прихована (tools/site/flags.py OZDOBA_PUBLIC = False → data-oz="0" від tools/shop/kabinet_v2.py): без промо Оздоби,
  // знижки за обсягом і рекомендацій; «Замовлення»/«Обране» — лише якщо в клієнта вже є замовлення чи обране.
  var OZ = main.getAttribute('data-oz') !== '0';
  var PHONE = '+380978667755', PHONE_TXT = '+380 97 866 77 55';
  var STAGES = [['new', T('Нове')], ['in_work', T('В роботі')], ['quote_sent', T('КП надіслано')], ['paid', T('Оплачено')],
    ['production', T('У виробництві')], ['shipping', T('В дорозі')], ['delivered', T('Доставлено')]];
  var STAGE_NOTE = {
    new: T('Ми отримали замовлення. Менеджер перевірить позиції й звʼяжеться з вами.'),
    in_work: T('Менеджер уточнює деталі, кольори, розміри й наявність.'),
    quote_sent: T('Комерційну пропозицію надіслано — перевірте Telegram або пошту.'),
    paid: T('Оплату отримано, дякуємо! Передаємо замовлення у виробництво.'),
    production: T('Замовлення виготовляється на фабриці.'),
    shipping: T('Замовлення в дорозі — поставка з Китаю 35–70 днів від підтвердження.'),
    delivered: T('Замовлення доставлено. Гарантія — 12 місяців.'),
    cancelled: T('Замовлення скасовано. Якщо це помилка — напишіть менеджеру.')
  };

  /* ---------- утиліти ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return new Intl.NumberFormat(LOC).format(Math.round(n)); };
  var money = function (n) { return n == null ? T('за запитом') : fmt(n) + ' ₴'; };
  var usd = function (uah) { return '$' + fmt(Math.round(uah / 46 / 100) * 100); };
  var safeUrl = function (u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; };
  var parseDate = function (s) { if (!s) return null; var d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) || /^\d{4}-\d\d-\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? null : d; };
  var dfmt = function (s, opt) { var d = s instanceof Date ? s : parseDate(s); return d ? d.toLocaleDateString(LOC, opt || { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  var addDays = function (d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  var ls = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватний режим */ } }
  };
  var svg = function (p, cls) { return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '>' + p + '</svg>'; };
  // відгук у Google (основний профіль GBP) — лише для завершеного обʼєкта (status «done»)
  var GREV = 'https://g.page/r/CbaVqfJBXWLQEAE/review';
  function rev(p) { return p.status === 'done' ? '<p class="kb-rev"><a class="lnk" href="' + GREV + '" target="_blank" rel="noopener">' + svg(IC.star) + T('Залишити відгук у Google') + '</a></p>' : ''; }
  var IC = {
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
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
    return '<div class="kb-ring" role="img" aria-label="' + esc(T('Профіль заповнено на {n}%', { n: pct })) + '"><svg viewBox="0 0 84 84"><circle class="t" cx="42" cy="42" r="36"/>' +
      '<circle class="v" cx="42" cy="42" r="36" stroke-dasharray="' + c.toFixed(1) + '" style="stroke-dashoffset:' + c.toFixed(1) + '" data-off="' + (c * (1 - pct / 100)).toFixed(1) + '"/></svg><b>' + pct + '%</b></div>';
  }
  function empty(icon, title, text, cta) {
    return '<div class="kb-card kb-empty kb-in"><div class="art">' + svg(icon) + '</div><h2>' + title + '</h2><p>' + text + '</p>' + (cta || '') + '</div>';
  }
  var initials = function (name) { return String(name || T('К')).trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || T('К'); };
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
      '</div><div class="tx"><b>' + esc(i.name) + '</b><span>' + (p == null ? T('Ціна за запитом') : T('від {p}', { p: money(p) })) + ' <small class="muted">/ ' + esc(i.unit) + '</small></span><small class="muted">' + esc(i.cat || '') + '</small></div></a>' +
      (opts.remove ? '<button type="button" class="x" data-unfav="' + i.id + '" aria-label="' + esc(T('Прибрати з обраного')) + '">' + svg(IC.heart) + '</button>' : '') + '</div>';
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
    return '<section class="kb-card ' + (cls || '') + ' kb-in" aria-labelledby="kb-mgr"><div class="kb-ch"><div><p class="kb-eyebrow">' + T('Ваш менеджер') + '</p><h2 id="kb-mgr">' + esc(name || T('Менеджер CAS Development')) + '</h2></div></div>' +
      '<p class="muted" style="font-size:var(--fs-small)">' + T(OZ ? 'Питання щодо замовлення, кольорів, доставки чи проєкту — пишіть у зручний месенджер. Консультація по телефону — безкоштовна.' : 'Питання щодо проєкту — пишіть у зручний месенджер. Консультація по телефону — безкоштовна.') + '</p>' +
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
  function stBadge(o) { return '<span class="kb-st' + (o.stage === 'cancelled' ? ' x' : o.stage === 'delivered' ? ' ok' : '') + '">' + esc(T(o.stage_label || '')) + '</span>'; }
  var active = function (o) { return o.stage !== 'delivered' && o.stage !== 'cancelled'; };
  function eta(o) { // орієнтовна поставка: 35–70 днів від підтвердження (дата оплати/запуску або створення)
    if (!active(o)) return '';
    var ev = (o.events || []).filter(function (e) { return ['paid', 'production'].indexOf(e.stage) >= 0; })[0];
    var d0 = parseDate(ev ? ev.created_at : o.created_at); if (!d0) return '';
    return dfmt(addDays(d0, 35), { day: 'numeric', month: 'short' }) + ' – ' + dfmt(addDays(d0, 70), { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function volumeBlock(D, partner) {
    var VOL = (D && D.volume_discounts) || [], g = D ? cartGoods(D) : 0;
    var cur = VOL.reduce(function (p, t) { return g >= t[0] ? Math.max(p, t[1]) : p; }, 0);
    var next = VOL.filter(function (t) { return g < t[0]; })[0];
    var pct = next ? Math.round(g / next[0] * 100) : 100;
    var h = '<p class="kb-eyebrow">' + T('Знижка за обсягом') + '</p>';
    if (!g) h += '<p>' + T('Кошик Оздоби порожній. Знижка рахується від суми товарів:') + '</p>';
    else h += '<div class="row" style="justify-content:space-between"><span>' + T('У кошику: {s}', { s: '<b>' + money(g) + '</b>' }) + '</span>' + (cur ? '<span class="kb-st ok">−' + cur + '%</span>' : '') + '</div>' + bar(pct) +
      '<p style="font-size:var(--fs-small)">' + (next ? T('Ще {s} до знижки {p}%', { s: '<b>' + money(next[0] - g) + '</b>', p: next[1] }) : T('Максимальна знижка за обсягом — {p}%', { p: cur })) + '</p>';
    h += '<ul class="kb-todo">' + VOL.map(function (t) { return '<li class="' + (g >= t[0] ? 'ok' : '') + '">' + T('{p}% — від {s}', { p: t[1], s: money(t[0]) }) + ' (≈' + usd(t[0]) + ')</li>'; }).join('') + '</ul>';
    if (partner) h += '<div class="kb-note">' + T('Ваш код партнера {c} (−{p}%) не сумується зі знижкою за обсягом — діє більша.', { c: '<b>' + esc(partner.code) + '</b>', p: partner.discount }) + '</div>';
    return h;
  }

  // після входу — у свій інтерфейс: працівник → /kabinet/team або /kabinet/admin (c.home з /api/me), клієнт — лишається тут
  function goHome() {
    A.me(true).then(function (c) { if (c && c.home && c.home !== '/kabinet' && TAB === 'overview') location.href = c.home; else location.reload(); }, function () { location.reload(); });
  }
  function ozTabs(nOrders, nFav) { // Оздоба прихована: показати вкладки, де є дані
    var t = { orders: nOrders, fav: nFav };
    document.querySelectorAll('.kb-tabs a[data-kb-tab]').forEach(function (a) { if (t[a.getAttribute('data-kb-tab')] > 0) a.hidden = false; });
  }
  function ozCheck() { // для вкладок без власних даних замовлень/обраного
    if (OZ) return;
    Promise.all([soft(api('/api/account/orders'), { orders: [] }), soft(favorites(), [])]).then(function (r) { ozTabs((r[0].orders || []).length, (r[1] || []).length); });
  }
  function outBtn(sm) { // «Вийти / змінити акаунт»: вихід на цьому пристрої → /kabinet з входом (A.logout, /api/auth/logout)
    return '<button class="btn ghost' + (sm ? ' sm' : '') + '" type="button" data-kb-out>' + T('Вийти / змінити акаунт') + '</button>';
  }
  function bindOut() {
    box.querySelectorAll('[data-kb-out]').forEach(function (b) {
      b.onclick = function () { b.disabled = true; A.logout().then(function () { location.href = '/kabinet'; }, function () { b.disabled = false; toast(T('Не вдалося вийти. Спробуйте ще раз.'), true); }); };
    });
  }

  /* ---------- гість ---------- */
  function guest() {
    var perks = [
      [IC.box, T('Статуси замовлень'), T('Від «Нове» до «Доставлено», орієнтовна дата поставки й друк замовлення.')],
      [IC.heart, T('Обране на всіх пристроях'), T('Зберігайте товари Оздоби й повертайтесь до них з телефону чи компʼютера.')],
      [IC.plan, T('Ваш обʼєкт онлайн'), T('Етапи, фотозвіти раз на 1–2 тижні, акти, графік платежів і камера 24/7 (за доп. оплату).') + ' <a href="' + demoUrl() + '">' + T('Демо →') + '</a>'],
      [IC.shield, T('Без паролів'), T('Вхід через Telegram, Google або номер телефону.')]
    ];
    if (!OZ) perks = perks.slice(2); // Оздоба прихована — без замовлень і обраного товарів
    paint('<div class="kb-guest"><section class="kb-card glow kb-in"><p class="kb-eyebrow">' + T('Особистий кабінет') + '</p><h2>' + T(OZ ? 'Усе про ваші замовлення й проєкти — в одному місці' : 'Усе про ваш проєкт — в одному місці') + '</h2>' +
      '<ul class="kb-perks">' + perks.map(function (p) { return '<li>' + svg(p[0]) + '<div><b>' + p[1] + '</b><span>' + p[2] + '</span></div></li>'; }).join('') + '</ul></section>' +
      '<section class="kb-card kb-in" aria-labelledby="kb-login-h"><h2 id="kb-login-h">' + T('Увійти') + '</h2><div id="kb-login"></div></section></div>');
    A.login(document.getElementById('kb-login'), goHome);
    var lead = document.getElementById('kb-lead'); if (lead && TAB !== 'object') lead.hidden = false; // заявка на камеру — лише для обʼєкта клієнта
  }

  /* ---------- огляд ---------- */
  function greet() { var h = new Date().getHours(); return T(h < 5 ? 'Доброї ночі' : h < 12 ? 'Доброго ранку' : h < 18 ? 'Добрий день' : h < 23 ? 'Добрий вечір' : 'Доброї ночі'); }
  // посилання на сторінки сайту мовою кабінету (є не всіма мовами — тоді українська)
  var U = KL.u || function (p) { return p; }; // сторінка сайту мовою кабінету (словник мови, u) — інакше українська
  function demoUrl() { return U('/onlain-kontrol'); }
  function svcUrl(slug) { return U('/' + slug); }
  function completion(c, P) {
    var s = P.settings || {}, items = [
      [T('Імʼя'), !!c.name], [T('Телефон'), !!c.phone], [T('Адреса доставки'), (P.addresses || []).length > 0],
      [T('Email для документів'), !!(s.docs_email || c.email)],
      [T('Реквізити для рахунку'),
 s.client_type === 'private' ? !!(P.settings && P.settings.client_type) && !P.pending : !!(s.company_name && s.company_code)]
    ];
    var done = items.filter(function (x) { return x[1]; }).length;
    return { pct: Math.round(done / items.length * 100), items: items };
  }
  function overview(c) {
    Promise.all([
      soft(api('/api/account/profile'), { settings: {}, addresses: [] }),
      soft(api('/api/account/orders'), { orders: [] }),
      soft(favorites(), []),
      soft(api('/api/account/projects'), { projects: [] }),
      catalog()
    ]).then(function (r) {
      var P = r[0], O = (r[1].orders || []), F = r[2] || [], PR = (r[3].projects || []), D = r[4];
      var act = O.filter(active), comp = completion(c, P);
      var fi = D ? F.map(function (id) { return D.byId[id]; }).filter(Boolean) : [];
      var showO = OZ || O.length > 0, showF = OZ || fi.length > 0;
      if (!OZ) ozTabs(O.length, fi.length);
      var w = OZ ? null : ((showO ? 1 : 0) + (showF ? 1 : 0)) % 2 ? 's3' : 's6'; // ширина менеджера (s3-картки парами, без дірки)
      var since = parseDate(P.created_at);
      var h = '<div class="kb-grid">';
      // привітання
      h += '<section class="kb-card glow s6 kb-in"><div class="kb-hero">' + ava(c) + '<div class="kb-hero-t"><h2>' + greet() + ', ' + esc((c.name || T('клієнте')).split(/\s+/)[0]) + '</h2>' +
        '<p>' + (since ? T('З нами з {d}', { d: dfmt(since, { month: 'long', year: 'numeric' }) }) + ' · ' : '') + esc(c.provider === 'telegram' ? (c.username ? '@' + c.username : 'Telegram') : c.provider === 'phone' ? (c.phone || '') : (c.email || '')) + '</p>' +
        '<div class="kb-stats">' + (showO ? '<a class="kb-chip" href="/kabinet/zamovlennia">' + T('Активні замовлення: {n}', { n: '<b>' + act.length + '</b>' }) + '</a>' : '') +
        (showF ? '<a class="kb-chip" href="/kabinet/obrane">' + T('В обраному: {n}', { n: '<b>' + F.length + '</b>' }) + '</a>' : '') + '<a class="kb-chip" href="/kabinet/proekty">' + T('Проєкти: {n}', { n: '<b>' + PR.length + '</b>' }) + '</a></div></div>' +
        '<div class="kb-hero-a">' + (c.staff ? '<a class="btn ghost sm" href="' + esc(c.staff.home) + '">' + (c.staff.home === '/kabinet/admin' ? 'Майстер-панель' : 'Кабінет працівника') + '</a>' : c.admin ? '<a class="btn ghost sm" href="/kabinet/admin">Облік замовлень</a>' : '') +
        outBtn(true) + '</div></div></section>';
      // замовлення
      var o = act[0] || O[0];
      if (showO) h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-w-o"><div class="kb-ch"><h2 id="kb-w-o">' + T('Замовлення') + '</h2><a class="lnk" href="/kabinet/zamovlennia">' + T('Усі →') + '</a></div>';
      if (o) {
        h += '<a class="kb-ord" href="/kabinet/zamovlennia?n=' + encodeURIComponent(o.number) + '" style="padding:14px"><div class="kb-ord-h"><b>' + esc(o.number) + '</b>' + stBadge(o) + '</div>' +
          (o.stage !== 'cancelled' ? dots(o.stage) : '') + '<div class="kb-ord-m"><span>' + esc(dfmt(o.created_at)) + '</span><span>' + T('{n} поз.', { n: o.items.length }) + '</span><strong>' + money(o.total) + '</strong></div>' +
          (active(o) && eta(o) ? '<small class="muted">' + T('Орієнтовна поставка: {d}', { d: eta(o) }) + '</small>' : '') + '</a>';
        if (act.length > 1) h += '<p class="muted" style="font-size:var(--fs-small)">' + T('Ще активних: {n} — у розділі «Замовлення».', { n: act.length - 1 }) + '</p>';
      } else if (showO) h += '<p class="muted">' + T('Замовлень ще немає. Комплектуйте обʼєкт в Оздобі: освітлення, меблі, декор і сантехніка з поставкою 35–70 днів.') + '</p><a class="btn" href="/ozdoba">' + T('До каталогу Оздоби') + '</a>';
      if (showO) h += '</section>';
      // профіль
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-w-p"><div class="kb-ch"><h2 id="kb-w-p">' + T('Профіль') + '</h2><a class="lnk" href="/kabinet/profil">' + T('Заповнити →') + '</a></div>' +
        '<div class="row" style="gap:18px;align-items:center;flex-wrap:nowrap">' + ring(comp.pct) + '<ul class="kb-todo">' +
        comp.items.map(function (x) { return '<li class="' + (x[1] ? 'ok' : '') + '">' + x[0] + '</li>'; }).join('') + '</ul></div>' +
        (comp.pct < 100 ? '<p class="muted" style="font-size:var(--fs-small)">' + T('Заповнений профіль — швидше оформлення й рахунок без уточнень.') + '</p>' : '') + '</section>';
      // проєкти
      var pj = PR.filter(function (p) { return p.status === 'active'; })[0] || PR[0];
      h += '<section class="kb-card ' + (w ? 's3' : 's2') + ' kb-in" aria-labelledby="kb-w-pr"><div class="kb-ch"><h2 id="kb-w-pr">' + T('Проєкт') + '</h2><a class="lnk" href="' + (pj ? '/kabinet/obiekt?p=' + pj.id : '/kabinet/proekty') + '">' + T(pj ? 'Онлайн-контроль →' : 'Детальніше →') + '</a></div>';
      if (pj) h += '<p><b>' + esc(pj.title) + '</b></p>' + bar(pj.progress) + '<p class="muted" style="font-size:var(--fs-small)">' + T('Готовність {p}%', { p: pj.progress }) + (pj.next_step ? ' · ' + T('Далі:') + ' ' + esc(pj.next_step) : '') + '</p>';
      else h += '<p class="muted">' + T('Дизайн, ремонт чи будівництво з CAS — етапи, фотозвіти раз на 1–2 тижні й документи будуть тут.') + '</p><a class="btn ghost" href="/kabinet/proekty#kb-lead">' + T('Обговорити проєкт') + '</a>';
      h += '</section>';
      // обране
      if (showF) h += '<section class="kb-card ' + (w ? 's3' : 's2') + ' kb-in" aria-labelledby="kb-w-f"><div class="kb-ch"><h2 id="kb-w-f">' + T('Обране') + '</h2><a class="lnk" href="/kabinet/obrane">' + T('Усе →') + '</a></div>';
      if (!showF) { /* Оздоба прихована, обраного немає */ } else if (fi.length) h += '<p class="kb-big">' + fi.length + '</p><div class="kb-thumbs">' + fi.slice(0, 4).map(function (i) {
        return '<a href="' + esc(url(i)) + '" title="' + esc(i.name) + '">' + (i.img ? '<img src="' + esc(img(i)) + '" width="56" height="56" alt="' + esc(i.name) + '" loading="lazy">' : '<span class="art">' + artSvg(D, i.art) + '</span>') + '</a>';
      }).join('') + '</div>';
      else h += '<p class="muted">' + T('Натискайте ♡ на товарах Оздоби — вони збережуться тут на всіх ваших пристроях.') + '</p><a class="btn ghost" href="/ozdoba">' + T('Обрати товари') + '</a>';
      if (showF) h += '</section>';
      // знижка
      if (OZ) h += '<section class="kb-card s2 kb-in">' + volumeBlock(D, P.partner) + '</section>';
      // рекомендації
      if (D && OZ) {
        var kits = (D.bundles || []).filter(function (b) { return b.premium; }).slice(0, 3);
        var recs = D.items.filter(function (i) { return i.prio === 'A' && i.img && F.indexOf(i.id) < 0; });
        var off = new Date().getDate() % Math.max(1, recs.length - 4);
        recs = recs.slice(off, off + 4);
        h += '<section class="kb-card s4 kb-in" aria-labelledby="kb-w-r"><div class="kb-ch"><h2 id="kb-w-r">' + T('Рекомендуємо з Оздоби') + '</h2><a class="lnk" href="/ozdoba/komplekty">' + T('Усі комплекти →') + '</a></div>' +
          '<div class="kb-kits">' + kits.map(function (b) {
            return '<a class="kb-kit" href="/ozdoba/komplekty#k-' + esc(b.id) + '"><span class="ic">' + artSvg(D, b.art) + '</span><span><b>' + esc(b.name) + '</b><small class="muted">' + T('Комплект під ключ') + '</small></span></a>';
          }).join('') + '</div><div class="kb-prods">' + recs.map(function (i) { return prodCard(D, i); }).join('') + '</div>' +
          '<p class="muted" style="font-size:12px">' + T('Мінімальне замовлення — від $10 000 (≈460 000 ₴), від 10 шт кожної позиції. Поставка з Китаю 35–70 днів.') + '</p></section>';
      }
      h += managerCard(w || 's2', pj && pj.manager);
      paint(h + '</div>');
      bindOut();
    });
  }

  /* ---------- замовлення ---------- */
  function orders() {
    var n = new URLSearchParams(location.search).get('n');
    if (n) return orderDetail(n);
    api('/api/account/orders').then(function (d) {
      var O = d.orders || [];
      if (!OZ) ozTabs(O.length, 0);
      if (!O.length && !OZ) return paint(empty(IC.box, T('Замовлень немає'), T('Тут зʼявляться ваші замовлення зі статусом і датою поставки. Питання — менеджеру.'), '') + '<div class="kb-grid" style="margin-top:16px">' + managerCard('s6') + '</div>');
      if (!O.length) return paint(empty(IC.box, T('Замовлень ще немає'), T('Додайте товари в кошик Оздоби або візьміть готовий комплект для ресторану, готелю чи офісу — оформлене замовлення зʼявиться тут зі статусом і датою поставки.'),
        '<div class="row" style="justify-content:center"><a class="btn" href="/ozdoba">' + T('До каталогу') + '</a><a class="btn ghost" href="/ozdoba/komplekty">' + T('Комплекти') + '</a></div>') + '<div class="kb-grid" style="margin-top:16px">' + managerCard('s6') + '</div>');
      var filt = 'active';
      function draw() {
        var L = O.filter(function (o) { return filt === 'all' ? true : filt === 'active' ? active(o) : !active(o); });
        var cnt = { active: O.filter(active).length, done: O.filter(function (o) { return !active(o); }).length, all: O.length };
        paint('<div class="kb-filter kb-noprint" role="group" aria-label="' + esc(T('Фільтр замовлень')) + '">' + [['active', 'Активні'], ['done', 'Завершені'], ['all', 'Усі']].map(function (f) {
          return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (filt === f[0]) + '">' + T(f[1]) + ' · ' + cnt[f[0]] + '</button>';
        }).join('') + '</div><div class="kb-list">' + (L.length ? L.map(function (o) {
          return '<a class="kb-ord kb-in" href="/kabinet/zamovlennia?n=' + encodeURIComponent(o.number) + '"><div class="kb-ord-h"><b>' + esc(o.number) + '</b>' + stBadge(o) + '</div>' +
            (o.stage !== 'cancelled' ? dots(o.stage) : '') +
            '<div class="kb-ord-m"><span>' + esc(dfmt(o.created_at)) + '</span><span>' + T('{n} поз.', { n: o.items.length }) + ' · ' + T('{n} од.', { n: o.items.reduce(function (s, i) { return s + (i.qty || 0); }, 0) }) + '</span>' +
            (active(o) && eta(o) ? '<span>' + T('Поставка: {d}', { d: eta(o) }) + '</span>' : '') + '<strong>' + money(o.total) + (o.on_request ? ' + ' + T('{n} за запитом', { n: o.on_request }) : '') + '</strong></div>' +
            '<small class="muted">' + esc(o.items.slice(0, 3).map(function (i) { return i.name; }).join(' · ')) + (o.items.length > 3 ? ' …' : '') + '</small></a>';
        }).join('') : '<p class="muted">' + T('Тут поки порожньо.') + '</p>') + '</div>');
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
        ? '<ol class="kb-tl"><li class="on"><span class="d"></span><div><b>' + T('Нове') + '</b><small>' + esc(dfmt(o.created_at)) + '</small></div></li><li class="cur"><span class="d"></span><div><b>' + T('Скасовано') + '</b><small>' + esc(dfmt(ev.cancelled || o.updated_at)) + '</small></div></li></ol>'
        : '<ol class="kb-tl h">' + STAGES.map(function (s, i) {
          return '<li class="' + (i < n || (i === n && s[0] === 'delivered') ? 'on' : i === n ? 'cur' : '') + '"' + (i === n ? ' aria-current="step"' : '') + '><span class="d"></span><div><b>' + s[1] + '</b><small>' + (ev[s[0]] ? esc(dfmt(ev[s[0]], { day: 'numeric', month: 'short' })) : i === n ? T('зараз') : '') + '</small></div></li>';
        }).join('') + '</ol>';
      var goods = o.items.reduce(function (s, i) { return s + (i.price || 0) * i.qty; }, 0);
      var ship = Math.max(0, (o.total || 0) - (goods - (o.discount || 0)));
      var et = eta(o);
      var h = '<a class="kb-back kb-noprint" href="/kabinet/zamovlennia">' + T('← Усі замовлення') + '</a>' +
        '<p class="kb-print-h">CAS Development · ' + T('Оздоба') + ' · cas-develop.com · ' + PHONE_TXT + '</p>' +
        '<div class="kb-grid"><section class="kb-card s6 kb-in"><div class="kb-ord-h"><div><p class="kb-eyebrow">' + T('Замовлення') + '</p><h2 style="font-size:clamp(1.8rem,1.4rem + 1.2vw,2.4rem)">' + esc(o.number) + '</h2>' +
        '<small class="muted">' + T('від {d}', { d: esc(dfmt(o.created_at)) }) + '</small></div>' + stBadge(o) + '</div>' + tl +
        '<div class="kb-note">' + esc(STAGE_NOTE[o.stage] || '') + (et ? ' ' + T('Орієнтовна поставка: {d} (35–70 днів).', { d: '<b>' + et + '</b>' }) : '') + '</div>' +
        (o.manager_note ? '<p><b>' + T('Менеджер:') + '</b> ' + esc(o.manager_note) + '</p>' : '') +
        '<div class="row kb-noprint"><button class="btn" type="button" id="kb-repeat">' + T('Повторити замовлення') + '</button><button class="btn ghost" type="button" id="kb-print">' + T('Завантажити PDF / друк') + '</button>' +
        '<a class="btn ghost" href="https://t.me/' + PHONE + '" target="_blank" rel="noopener">' + T('Питання менеджеру') + '</a></div></section>' +
        '<section class="kb-card s6 kb-in" aria-labelledby="kb-oi"><h2 id="kb-oi">' + T('Позиції') + '</h2><div class="kb-scroll"><table class="kb-items"><thead><tr><th>' + T('Товар') + '</th><th class="hm">' + T('Колір / розмір') + '</th><th class="n">' + T('К-сть') + '</th><th class="n hm">' + T('Ціна') + '</th><th class="n">' + T('Сума') + '</th></tr></thead><tbody>' +
        o.items.map(function (i) {
          var it = D && D.byId[i.id];
          return '<tr><td>' + (it ? '<a href="' + esc(url(it)) + '">' + esc(i.name) + '</a>' : esc(i.name)) + '<small class="muted so" style="display:block">' + esc([i.color, i.size].filter(Boolean).join(', ')) + '</small></td>' +
            '<td class="hm">' + esc([i.color, i.size].filter(Boolean).join(', ')) + '</td><td class="n">' + i.qty + ' ' + esc(i.unit || '') + '</td><td class="n hm">' + money(i.price) + '</td><td class="n">' + (i.price == null ? T('за запитом') : money(i.price * i.qty)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<dl class="kb-sum"><dt>' + T('Товари') + '</dt><dd>' + money(goods) + '</dd>' +
        (o.discount ? '<dt>' + T('Знижка') + ' −' + o.discount_pct + '%' + (o.promo ? ' (' + T('код') + ' ' + esc(o.promo) + ')' : '') + '</dt><dd>−' + money(o.discount) + '</dd>' : '') +
        (ship ? '<dt>' + T('Доставка') + '</dt><dd>' + money(ship) + '</dd>' : '') +
        '<dt class="t">' + T('Разом') + '</dt><dd class="t">' + money(o.total) + (o.on_request ? ' + ' + T('{n} поз. за запитом', { n: o.on_request }) : '') + '</dd></dl>' +
        '<div class="kb-ord-m">' + (o.delivery ? '<span>' + T('Доставка') + ': <strong>' + esc(o.delivery) + '</strong></span>' : '') + (o.payment ? '<span>' + T('Оплата') + ': <strong>' + esc(T({ card: 'карткою', parts: 'частинами', invoice: 'рахунок для ФОП/ТОВ', cod: 'при отриманні', cash: 'готівкою (UAH / USD / EUR)', usdt: 'USDT' }[o.payment] || o.payment)) + '</strong></span>' : '') +
        (o.company ? '<span>' + T('Компанія') + ': <strong>' + esc(o.company) + '</strong></span>' : '') + '</div>' + (o.comment ? '<p class="muted" style="font-size:var(--fs-small)">' + T('Коментар') + ': ' + esc(o.comment) + '</p>' : '') + '</section>' +
        managerCard('s6 kb-noprint') + '</div>';
      paint(h);
      document.title = o.number + ' — ' + T('замовлення') + ' | CAS Development';
      document.getElementById('kb-print').onclick = function () { window.print(); };
      document.getElementById('kb-repeat').onclick = function () { repeat(o, D); };
    }, function (e) {
      paint(empty(IC.box, T('Замовлення не знайдено'), esc(e.message) + '. ' + T('Перевірте посилання або відкрийте список замовлень.'), '<a class="btn" href="/kabinet/zamovlennia">' + T('Мої замовлення') + '</a>'));
    });
  }
  function repeat(o, D) { // ті самі позиції → кошик Оздоби ('ozd-cart', формат app.js)
    if (!D) return toast(T('Каталог не завантажився — спробуйте ще раз'), true);
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
    if (!added) return toast(T('Цих товарів уже немає в каталозі'), true);
    toast(T('Додано в кошик: {n} поз.', { n: added }) + (miss ? ' (' + T('{n} немає в каталозі', { n: miss }) + ')' : '') + ' — ' + T('відкриваємо Оздобу…'));
    setTimeout(function () { location.href = '/ozdoba'; }, 1200);
  }

  /* ---------- обране ---------- */
  function fav() {
    Promise.all([favorites(), catalog()]).then(function (r) {
      var D = r[1];
      function draw(ids) {
        var L = D ? ids.map(function (id) { return D.byId[id]; }).filter(Boolean) : [];
        if (!OZ) ozTabs(0, L.length);
        if (!L.length && !OZ) return paint(empty(IC.heart, T('В обраному порожньо'), T('Збережених товарів немає.'), '<a class="btn" href="/kabinet">' + T('До кабінету') + '</a>'));
        if (!L.length) return paint(empty(IC.heart, T('В обраному порожньо'), T('Натискайте ♡ на картках товарів в Оздобі — збережені позиції будуть тут на всіх ваших пристроях. Зручно, щоб показати дизайнеру чи партнеру.'),
          '<a class="btn" href="/ozdoba">' + T('Перейти в Оздобу') + '</a>'));
        var sum = L.reduce(function (s, i) { var p = minPrice(D, i); return s + (p || 0); }, 0);
        paint('<div class="row kb-in" style="justify-content:space-between;margin-bottom:14px"><p class="muted">' + T('Товарів: {n}', { n: L.length }) + (sum ? ' · ' + T('від {s} за одиницю кожного', { s: money(sum) }) : '') + '</p>' +
          '<a class="btn ghost sm" href="/ozdoba">' + T('Додати ще') + '</a></div><div class="kb-prods">' + L.map(function (i) { return prodCard(D, i, { remove: true }); }).join('') + '</div>' +
          '<p class="muted kb-in" style="font-size:var(--fs-small);margin-top:14px">' + T('Щоб замовити, відкрийте товар, оберіть колір і розмір. Мінімум — 10 шт кожної позиції, замовлення від $10 000 (≈460 000 ₴). Можливе виготовлення під замовлення: колір, розмір, матеріал.') + '</p>');
        box.querySelectorAll('[data-unfav]').forEach(function (b) {
          b.onclick = function () { var id = +b.getAttribute('data-unfav'); b.disabled = true; unfav(id).then(function (ids) { toast(T('Прибрано з обраного'));
 draw(ids); }); };
        });
      }
      draw(r[0] || []);
    });
  }

  /* ---------- проєкти ---------- */
  var SERV = { design: T('Дизайн інтерʼєру'), arch: T('Архітектурний проєкт'), repair: T('Ремонт'), build: T('Будівництво'), furnish: T('Комплектація й меблювання'), landscape: T('Ландшафтний дизайн'), other: T('Проєкт') };
  var DOCK = { contract: [T('Договір'), 'DOC'], estimate: [T('Кошторис'), 'EST'], invoice: [T('Рахунок'), 'INV'], act: [T('Акт'), 'ACT'], design: [T('Дизайн-проєкт'), 'PDF'], render: [T('Візуалізації'), '3D'], drawing: [T('Креслення'), 'DWG'], spec: [T('Специфікація'), 'XLS'], other: [T('Документ'), 'FILE'] };
  var PST = function (s) { return T({ active: 'Триває', paused: 'На паузі', done: 'Завершено' }[s] || ''); };
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
        var svc = [['dyzain-interieru-kyiv', 'Дизайн інтерʼєру', 'від $30/м²'], ['remont-kvartyr-kyiv', 'Ремонт квартири', 'від $550/м²'],
          ['budivnytstvo-budynkiv-kyiv', 'Будівництво будинку', 'від $600/м²'], ['remont-ofisu-pid-klyuch-kyiv', 'Ремонт офісу', 'від $350/м²'],
          ['dyzain-restoranu-kafe-kyiv', 'Ресторан і кафе', 'під ключ'], ['dyzain-hotelu-kyiv', 'Готель', 'під ключ']];
        paint(empty(IC.plan, T('Тут житиме ваш проєкт'), T('Коли ми почнемо дизайн, ремонт чи будівництво, тут зʼявляться етапи з прогресом, фотозвіти з обʼєкта раз на 1–2 тижні, договір, кошторис і рахунки. 150+ проєктів з 2016 року, гарантія 12 місяців.'),
          '<a class="btn" href="#kb-lead">' + T('Обговорити проєкт') + '</a><div class="kb-services">' + svc.map(function (s) { return '<a href="' + svcUrl(s[0]) + '">' + T(s[1]) + '<span>' + T(s[2]) + '</span></a>'; }).join('') + '</div>' +
          '<p class="muted" style="font-size:12px">' + T('Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.') + '</p>') +
          (d.documents && d.documents.length ? '<section class="kb-card kb-in" style="margin-top:16px"><h2>' + T('Документи') + '</h2>' + docs(d.documents) + '</section>' : ''));
        return;
      }
      var h = '<div class="kb-proj">';
      P.forEach(function (p) {
        var stIdx = p.stages.findIndex(function (s) { return (s.progress || 0) < 100; });
        h += '<section class="kb-card glow kb-in"><div class="kb-ch"><div><p class="kb-eyebrow">' + esc(SERV[p.service] || T('Проєкт')) + (p.area ? ' · ' + esc(p.area) + ' ' + T('м²') : '') + '</p><h2>' + esc(p.title) + '</h2>' +
          (p.address ? '<small class="muted">' + esc(p.address) + '</small>' : '') + '</div><span class="kb-st' + (p.status === 'done' ? ' ok' : '') + '">' + PST(p.status) + '</span></div>' +
          '<div class="row" style="justify-content:space-between"><span>' + T('Загальна готовність') + '</span><b class="kb-big" style="font-size:2rem">' + p.progress + '%</b></div>' + bar(p.progress) +
          '<div class="row"><a class="btn sm" href="/kabinet/obiekt?p=' + p.id + '">' + T('Онлайн-контроль: етапи, платежі, камера →') + '</a></div>' + rev(p) +
          (p.next_step ?'<div class="kb-next">' + svg(IC.flag) + '<div><p class="kb-eyebrow">' + T('Наступний крок') + (p.next_date ? ' · ' + esc(dfmt(p.next_date, { day: 'numeric', month: 'long' })) : '') + '</p><p>' + esc(p.next_step) + '</p></div></div>' : '') +
          (p.stages.length ? '<h3>' + T('Етапи') + '</h3><div class="kb-stages">' + p.stages.map(function (s, i) {
            var pc = Math.max(0, Math.min(100, s.progress || 0));
            return '<div class="kb-stage' + (pc >= 100 ? ' done' : '') + '"><div class="kb-stage-h"><b>' + (i + 1) + '. ' + esc(s.name) + (i === stIdx ? ' <span class="kb-st" style="padding:1px 8px;font-size:11px">' + T('зараз') + '</span>' : '') + approvedB(s, p) + '</b><span class="muted">' +
              [s.start && dfmt(s.start, { day: 'numeric', month: 'short' }), s.end && dfmt(s.end, { day: 'numeric', month: 'short' })].filter(Boolean).join(' – ') + ' · ' + pc + '%</span></div>' + bar(pc) +
              (s.note ? '<small class="muted">' + esc(s.note) + '</small>' : '') + '</div>';
          }).join('') + '</div>' : '') + '</section>';
        h += '<div class="kb-grid"><section class="kb-card s4 kb-in" aria-label="' + esc(T('Фотозвіти')) + '"><div class="kb-ch"><h2>' + T('Фотозвіти') + '</h2><small class="muted">' + T('раз на 1–2 тижні') + '</small></div>' +
          (p.reports.length ? p.reports.map(function (r) {
            var ph = r.photos.map(safeUrl).filter(Boolean);
            return '<div class="kb-rep"><div class="kb-rep-h"><b>' + esc(r.title || T('Звіт')) + '</b><span class="muted">' + esc(dfmt(r.date)) + '</span></div>' + (r.note ? '<p class="muted" style="font-size:var(--fs-small);margin-bottom:8px">' + esc(r.note) + '</p>' : '') +
              (ph.length ? '<div class="kb-gal">' + ph.map(function (u, k) { return '<button type="button" data-lb="' + esc(u) + '" data-cap="' + esc((r.title || T('Фотозвіт')) + ' · ' + dfmt(r.date)) + '"><img src="' + esc(u) + '" width="320" height="240" alt="' + esc((r.title || T('Фотозвіт')) + ', ' + T('фото {n}', { n: k + 1 })) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>'; }).join('') + '</div>' : '') + '</div>';
          }).join('') : '<p class="muted">' + T('Перший фотозвіт зʼявиться після старту робіт на обʼєкті.') + '</p>') + '</section>' +
          '<section class="kb-card s2 kb-in" aria-label="' + esc(T('Документи')) + '"><h2>' + T('Документи') + '</h2>' + (p.documents.length ? docs(p.documents) : '<p class="muted">' + T('Договір, кошторис і рахунки зʼявляться тут.') + '</p>') + '</section></div>';
        if (!h.includes('id="kb-mgr"')) h += '<div class="kb-grid">' + managerCard('s6', p.manager) + '</div>';
      });
      if (d.documents && d.documents.length) h += '<section class="kb-card kb-in"><h2>' + T('Інші документи') + '</h2>' + docs(d.documents) + '</section>';
      paint(h + '</div>');
      if (lead) { var hh = document.getElementById('kb-lead-h'); if (hh) hh.textContent = T('Новий проєкт'); }
      lightbox();
    }, function (e) { paint('<p class="acc-err">' + esc(e.message) + '</p>'); });
  }
  function lightbox() {
    var dlg = null;
    box.querySelectorAll('[data-lb]').forEach(function (b) {
      b.onclick = function () {
        if (!dlg) {
          dlg = document.createElement('dialog'); dlg.className = 'kb-lb';
          dlg.innerHTML = '<button type="button" aria-label="' + esc(T('Закрити')) + '">✕</button><img alt="" width="1200" height="900"><p></p>';
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

  /* ---------- мій обʼєкт: онлайн-контроль (/kabinet/obiekt) ---------- */
  // Дані — /api/account/projects (лише проєкти цього клієнта). Етапи зі статусами, стрічка фотозвітів, акти етапів,
  // графік платежів (рядки з бази — схема в кожного своя), камера 24/7: YouTube — вбудовано (youtube-nocookie, є в CSP),
  // кадр .jpg — картинкою, інша хмара камери — посиланням у новій вкладці. Немає камери — заявка (form#of, data-service="camera").
  var STS = { planned: T('Заплановано'), in_progress: T('В роботі'), review: T('Приймання'), done: T('Виконано'), paused: T('Пауза') };
  var PAYS = { planned: T('Заплановано'), due: T('До оплати'), paid: T('Оплачено') };
  var CUR = { USD: '$', EUR: '€', UAH: '₴' };
  var cash = function (n, c) { return n == null ? '' : (c === 'UAH' ? fmt(n) + ' ₴' : (CUR[c] || '$') + fmt(n)); };
  var YT = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?[\w=&]*$/;
  var nRepT = function (n) { return T('Фотозвітів: {n}', { n: n }); };
  // дизайн-проєкт: етап погоджено клієнтом (approved_at у JSON етапу, ставить менеджер)
  // етап дизайн-проєкту на прийманні без погодження — кнопка «Погодити етап» (POST /api/account/projects, action approve)
  // дизайн і архітектура: «Погодити етап» або «Є правки» (коментар → етап повертається в роботу, лічильник правок + 1)
  var DESIGN_SVC = ['design', 'arch'];
  function revB(s) { return s.revisions ? ' <small class="muted kb-revs">' + esc(s.rev_max ? T('Правки: {n} з {m}', { n: s.revisions, m: s.rev_max }) : T('Правки: {n}', { n: s.revisions })) + '</small>' : ''; }
  function approvedB(s, p) {
    if (s.approved_at) return ' <span class="kb-ss done" title="' + esc(T('Погоджено')) + ' ' + esc(dfmt(s.approved_at)) + '">✓ ' + esc(T('погоджено')) + ' ' + esc(dfmt(s.approved_at, { day: 'numeric', month: 'short' })) + '</span>' + revB(s);
    if (p && DESIGN_SVC.indexOf(p.service) >= 0 && s.id && (s.status === 'review' || s.status === 'done')) return ' <span class="kb-appr"><small>' + esc(T('чекає вашого погодження')) + '</small>' +
      '<button type="button" class="btn sm" data-appr="' + esc(p.id + ':' + s.id) + '" data-nm="' + esc(s.name) + '">' + esc(T('Погодити етап')) + '</button>' +
      '<button type="button" class="btn sm ghost" data-revq="' + esc(p.id + ':' + s.id) + '">' + esc(T('Є правки')) + '</button></span>' + revB(s);
    return revB(s);
  }
  // результати етапу (візуалізації, креслення, специфікації, акти) — документи з stage_id
  function stageDocs(p, s) {
    return s.id ? (p.documents || []).filter(function (x) { return x.stage_id === s.id; }).map(function (a) {
      var u = safeUrl(a.url), k = DOCK[a.kind] || DOCK.other;
      return u ? '<a class="lnk" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + svg(IC.doc) + esc(a.title) + ' <small class="muted">' + esc(k[0]) + '</small></a>' : '';
    }).join('') : '';
  }
  if (box) box.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-revq]'); if (!b) return;
    e.preventDefault();
    var w = b.closest('.kb-appr'), k = b.getAttribute('data-revq');
    var f = document.createElement('form'); f.className = 'kb-revf';
    f.innerHTML = '<label><span>' + esc(T('Що змінити? Опишіть правки — дизайнер отримає їх одразу.')) + '</span><textarea name="note" rows="3" maxlength="1000" required></textarea></label>' +
      '<div class="row"><button type="submit" class="btn sm">' + esc(T('Надіслати правки')) + '</button><button type="button" class="btn sm ghost" data-x>' + esc(T('Скасувати')) + '</button></div>';
    w.hidden = true; w.parentNode.insertBefore(f, w.nextSibling);
    f.querySelector('textarea').focus();
    f.querySelector('[data-x]').onclick = function () { f.remove(); w.hidden = false; };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var note = f.elements.note.value.trim(), kk = k.split(':'), sb = f.querySelector('[type=submit]');
      if (note.length < 3) { f.elements.note.focus(); return; }
      sb.disabled = true;
      api('/api/account/projects', { method: 'POST', body: { action: 'revise', project_id: +kk[0], stage_id: kk[1], note: note } }).then(function (r) {
        var st = r && r.stage || {};
        f.outerHTML = '<span class="kb-ss in_progress">' + esc(T('правки надіслано')) + '</span>' + revB(st);
        w.remove();
        toast(T('Правки надіслано — етап повернувся в роботу'));
      }, function (er) { sb.disabled = false; toast(er.message, true); });
    };
  });
  if (box) box.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-appr]'); if (!b) return;
    e.preventDefault();
    if (!confirm(T('Погодити етап «{n}»? Студія отримає повідомлення.', { n: b.getAttribute('data-nm') }))) return;
    var k = b.getAttribute('data-appr').split(':'); b.disabled = true;
    api('/api/account/projects', { method: 'POST', body: { action: 'approve', project_id: +k[0], stage_id: k[1] } }).then(function (r) {
      var w = b.closest('.kb-appr'), d = r && r.stage ? r.stage.approved_at : '';
      if (w) w.outerHTML = '<span class="kb-ss done">✓ ' + esc(T('погоджено')) + (d ? ' ' + esc(dfmt(d, { day: 'numeric', month: 'short' })) : '') + '</span>';
      toast(T('Етап погоджено — дякуємо!'));
    }, function (er) { b.disabled = false; toast(er.message, true); });
  });
  function stBadgeS(s) { return '<span class="kb-ss ' + esc(s.status) + '">' + esc(STS[s.status] || s.status_label || '') + '</span>'; }
  function camCard(p) {
    var cam = p.camera, h = '<section class="kb-card kb-cam s6 kb-in" aria-labelledby="kb-cam-h"><div class="kb-ch"><div><p class="kb-eyebrow">' + T('Онлайн-контроль') + '</p><h2 id="kb-cam-h">' + T('Камера 24/7') + '</h2></div>';
    if (!cam || !safeUrl(cam.url)) {
      return h + '<span class="kb-st">' + T('за доп. оплату') + '</span></div><div class="kb-cam-off">' + svg(IC.camera) + '<div><p><b>' + T('Підключити камеру на обʼєкті') + '</b></p>' +
        '<p class="muted" style="font-size:var(--fs-small)">' + T('Встановимо камеру й налаштуємо трансляцію — дивіться обʼєкт у будь-який момент, без поїздок. Фотозвіти раз на 1–2 тижні йдуть як і раніше. Вартість — за запитом.') + '</p></div></div>' +
        '<div class="row"><a class="btn" href="#kb-lead" data-cam-lead>' + T('Підключити камеру 24/7') + '</a></div></section>';
    }
    h += '<span class="kb-st ok"><i class="kb-live" aria-hidden="true"></i>' + T('підключено') + '</span></div>';
    if (cam.kind === 'youtube' && YT.test(cam.embed || '')) {
      h += '<div class="kb-cam-v"><button type="button" class="kb-cam-play" data-yt="' + esc(cam.embed) + '">' + svg('<path d="M8 5.5v13l11-6.5z"/>') + '<span>' + T('Увімкнути трансляцію') + '</span></button></div>';
    } else if (cam.kind === 'snapshot') {
      h += '<div class="kb-cam-v"><img src="' + esc(cam.url) + '" width="1280" height="720" alt="' + esc(T('Кадр з камери на обʼєкті')) + '" loading="lazy" referrerpolicy="no-referrer" data-snap></div>' +
        '<div class="row"><button type="button" class="btn ghost sm" data-snap-r>' + T('Оновити кадр') + '</button><small class="muted" data-snap-t></small></div>';
    } else {
      h += '<p class="muted" style="font-size:var(--fs-small)">' + T('Трансляція відкривається в застосунку чи на сайті камери') + (cam.host ? ' (<b>' + esc(cam.host) + '</b>)' : '') + ' — ' + T('у новій вкладці.') + '</p>';
    }
    h += '<div class="row"><a class="btn' + (cam.kind === 'link' ? '' : ' ghost sm') + '" href="' + esc(cam.url) + '" target="_blank" rel="noopener noreferrer">' + T(cam.kind === 'link' ? 'Відкрити камеру' : 'Відкрити в новій вкладці') + ' ↗</a></div>';
    if (cam.note) h += '<div class="kb-note">' + esc(cam.note) + '</div>';
    return h + '<p class="muted" style="font-size:12px">' + T('Посилання на камеру бачите лише ви. Не пересилайте його стороннім.') + '</p></section>';
  }
  function payBlock(p) {
    var L = p.payments || [];
    var h = '<section class="kb-card s6 kb-in" aria-labelledby="kb-pay-h"><div class="kb-ch"><h2 id="kb-pay-h">' + T('Графік платежів') + '</h2><small class="muted">' + T('за договором') + '</small></div>';
    if (!L.length) return h + '<p class="muted">' + T('Графік платежів по етапах зʼявиться тут після підписання договору. Схему оплати підбираємо під клієнта: 50/50, 50/30/20, 50/40/10 або розбивка платежів — старт від 10% авансу.') + '</p></section>';
    var st = {}; (p.stages || []).forEach(function (s) { st[s.id] = s.name; });
    var tot = {}, paid = {};
    L.forEach(function (x) { if (x.amount == null) return; var c = x.currency || 'USD'; tot[c] = (tot[c] || 0) + x.amount; if (x.status === 'paid') paid[c] = (paid[c] || 0) + x.amount; });
    var cs = Object.keys(tot), nPaid = L.filter(function (x) { return x.status === 'paid'; }).length;
    var pctAll = cs.length === 1 && tot[cs[0]] ? Math.round((paid[cs[0]] || 0) / tot[cs[0]] * 100) : Math.round(nPaid / L.length * 100);
    h += '<div class="row" style="justify-content:space-between"><span>' + T('Оплачено {a} з {b}', { a: nPaid, b: L.length }) + (cs.length ? ': <b>' + cs.map(function (c) { return T('{a} з {b}', { a: cash(paid[c] || 0, c), b: cash(tot[c], c) }); }).join(' · ') + '</b>' : '') + '</span><b>' + pctAll + '%</b></div>' + bar(pctAll);
    h += '<div class="kb-scroll"><table class="kb-items kb-pay"><thead><tr><th>' + T('Платіж') + '</th><th class="hm">' + T('Етап') + '</th><th class="n">' + T('Частка') + '</th><th class="n">' + T('Сума') + '</th><th class="hm">' + T('Дата') + '</th><th>' + T('Статус') + '</th></tr></thead><tbody>' + L.map(function (x) {
      var d = x.status === 'paid' ? x.paid_date : x.due_date;
      return '<tr class="' + esc(x.status) + '"><td><b>' + esc(x.title) + '</b>' + (x.note ? '<small class="muted" style="display:block">' + esc(x.note) + '</small>' : '') +
        '<small class="muted so" style="display:block">' + esc([st[x.stage_id], d && dfmt(d, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')) + '</small></td>' +
        '<td class="hm">' + esc(st[x.stage_id] || '—') + '</td><td class="n">' + (x.pct != null ? esc(x.pct) + '%' : '—') + '</td><td class="n">' + (x.amount != null ? cash(x.amount, x.currency) : '—') + '</td>' +
        '<td class="hm">' + (d ? esc(dfmt(d, { day: 'numeric', month: 'short', year: 'numeric' })) : '—') + '</td><td><span class="kb-ps ' + esc(x.status) + '">' + esc(PAYS[x.status] || x.status) + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
    return h + '<p class="muted" style="font-size:12px">' + T('Рахунки й акти до платежів — у документах. Питання щодо оплати — менеджеру.') + '</p></section>';
  }
  function feed(p, stageId) {
    var st = {}; (p.stages || []).forEach(function (s) { st[s.id] = s.name; });
    var R = (p.reports || []).filter(function (r) { return !stageId || r.stage_id === stageId; });
    if (!R.length) return '<p class="muted">' + T(stageId ? 'Для цього етапу фотозвітів ще немає.' : 'Перший фотозвіт зʼявиться після старту робіт на обʼєкті — далі раз на 1–2 тижні.') + '</p>';
    return '<ol class="kb-feed">' + R.map(function (r) {
      var ph = (r.photos || []).map(safeUrl).filter(Boolean), cap = (r.title || T('Фотозвіт')) + ' · ' + dfmt(r.date);
      return '<li><div class="kb-feed-d"><b>' + esc(dfmt(r.date, { day: 'numeric', month: 'short' })) + '</b><small>' + esc(dfmt(r.date, { year: 'numeric' })) + '</small></div><div class="kb-feed-b">' +
        '<div class="kb-rep-h"><b>' + esc(r.title || T('Фотозвіт')) + '</b>' + (st[r.stage_id] ? '<span class="kb-tag">' + esc(st[r.stage_id]) + '</span>' : '') + '</div>' +
        (r.note ? '<p class="muted" style="font-size:var(--fs-small);margin-bottom:8px;white-space:pre-line">' + esc(r.note) + '</p>' : '') +
        (ph.length ? '<div class="kb-gal">' + ph.map(function (u, k) { return '<button type="button" data-lb="' + esc(u) + '" data-cap="' + esc(cap) + '"><img src="' + esc(u) + '" width="320" height="240" alt="' + esc(cap + ', ' + T('фото {n}', { n: k + 1 })) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>'; }).join('') + '</div>' : '') +
        '</div></li>';
    }).join('') + '</ol>';
  }
  function objectTab(c) {
    var lead = document.getElementById('kb-lead');
    api('/api/account/projects').then(function (d) {
      var P = d.projects || [];
      if (!P.length) {
        return paint(empty(IC.camera, T('Онлайн-контроль зʼявиться зі стартом робіт'), T('Коли ми почнемо ремонт чи будівництво, тут будуть етапи з прогресом і статусами, фотозвіти раз на 1–2 тижні, акти етапів і графік платежів. За доп. оплату — камера 24/7 на обʼєкті.'),
          '<div class="row" style="justify-content:center"><a class="btn" href="' + demoUrl() + '">' + T('Як це працює — демо') + '</a><a class="btn ghost" href="/kabinet/proekty#kb-lead">' + T('Обговорити проєкт') + '</a></div>'));
      }
      var want = +new URLSearchParams(location.search).get('p');
      var p = P.filter(function (x) { return x.id === want; })[0] || P.filter(function (x) { return x.status === 'active'; })[0] || P[0];
      var stages = p.stages || [], R = p.reports || [];
      var cur = stages.filter(function (s) { return s.status === 'in_progress' || s.status === 'review'; })[0] || stages.filter(function (s) { return s.status !== 'done'; })[0];
      var nDone = stages.filter(function (s) { return s.status === 'done'; }).length, last = R[0];
      var acts = (p.documents || []).filter(function (x) { return x.kind === 'act'; });
      var st = {}; stages.forEach(function (s) { st[s.id] = s.name; });
      var withRep = stages.filter(function (s) { return s.id && R.some(function (r) { return r.stage_id === s.id; }); });
      var h = '';
      if (P.length > 1) h += '<nav class="kb-filter kb-in" aria-label="' + esc(T('Обʼєкти')) + '">' + P.map(function (x) { return '<a class="kb-objsw" href="/kabinet/obiekt?p=' + x.id + '"' + (x.id === p.id ? ' aria-current="page"' : '') + '>' + esc(x.title) + '</a>'; }).join('') + '</nav>';
      h += '<div class="kb-grid">';
      // шапка обʼєкта
      h += '<section class="kb-card glow s6 kb-in"><div class="kb-ch"><div><p class="kb-eyebrow">' + esc(SERV[p.service] || T('Проєкт')) + (p.area ? ' · ' + esc(p.area) + ' ' + T('м²') : '') + '</p><h2>' + esc(p.title) + '</h2>' +
        (p.address ? '<small class="muted">' + esc(p.address) + '</small>' : '') + '</div><span class="kb-st' + (p.status === 'done' ? ' ok' : '') + '">' + PST(p.status) + '</span></div>' +
        '<div class="kb-obj-top"><div><span class="muted" style="font-size:var(--fs-small)">' + T('Загальна готовність') + '</span><b class="kb-big" style="display:block">' + p.progress + '%</b></div>' +
        '<div class="kb-stats"><span class="kb-chip">' + T('Етапів виконано: {n}', { n: '<b>' + nDone + '/' + stages.length + '</b>' }) + '</span><a class="kb-chip" href="#kb-feed-h">' + T('Фотозвітів: {n}', { n: '<b>' + R.length + '</b>' }) + '</a>' +
        (last ? '<span class="kb-chip">' + T('останній:') + ' <b>' + esc(dfmt(last.date, { day: 'numeric', month: 'short' })) + '</b></span>' : '') + '<a class="kb-chip" href="#kb-cam-h">' + T('камера:') + ' <b>' + T(p.camera ? 'є' : 'немає') + '</b></a></div></div>' + bar(p.progress) +
        (cur ? '<p style="font-size:var(--fs-small)">' + T('Зараз:') + ' <b>' + esc(cur.name) + '</b> · ' + (cur.progress || 0) + '%</p>' : '') + rev(p) +
        (p.next_step ? '<div class="kb-next">' + svg(IC.flag) + '<div><p class="kb-eyebrow">' + T('Наступний крок') + (p.next_date ? ' · ' + esc(dfmt(p.next_date, { day: 'numeric', month: 'long' })) : '') + '</p><p>' + esc(p.next_step) + '</p></div></div>' : '') + '</section>';
      // етапи
      h += '<section class="kb-card s6 kb-in" aria-labelledby="kb-stg-h"><div class="kb-ch"><h2 id="kb-stg-h">' + T('Етапи робіт') + '</h2><small class="muted">' + T('строки — за договором') + '</small></div>';
      if (stages.length) {
        h += '<ol class="kb-steps">' + stages.map(function (s, i) {
          var pc = Math.max(0, Math.min(100, s.progress || 0));
          var nRep = R.filter(function (r) { return s.id && r.stage_id === s.id; }).length;
          var dates = [s.start && dfmt(s.start, { day: 'numeric', month: 'short' }), s.end && dfmt(s.end, { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' – ');
          return '<li class="' + esc(s.status) + (s === cur ? ' cur' : '') + '"' + (s === cur ? ' aria-current="step"' : '') + '><span class="d" aria-hidden="true">' + (s.status === 'done' ? '' : i + 1) + '</span><div class="kb-step-b">' +
            '<div class="kb-stage-h"><b>' + esc(s.name) + approvedB(s, p) + '</b>' + stBadgeS(s) + '</div>' +
            '<div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1">' + bar(pc) + '</div><small class="muted" style="white-space:nowrap">' + pc + '%</small></div>' +
            '<div class="kb-step-m">' + (dates ? '<span>' + esc(dates) + '</span>' : '') + (nRep ? '<button type="button" class="lnk" data-stg="' + esc(s.id) + '">' + nRepT(nRep) + ' →</button>' : '') +
            stageDocs(p, s) + '</div>' +
            (s.note ? '<small class="muted">' + esc(s.note) + '</small>' : '') +
            (s.rev_note && !s.approved_at ? '<small class="muted kb-revn">' + esc(T('Ваші правки')) + ' (' + esc(dfmt(s.rev_at, { day: 'numeric', month: 'short' })) + '): «' + esc(s.rev_note) + '»</small>' : '') + '</div></li>';
        }).join('') + '</ol>';
      } else h += '<p class="muted">' + T('Етапи зʼявляться після підписання договору.') + '</p>';
      h += '</section>';
      h += camCard(p);
      // фотозвіти
      h += '<section class="kb-card s4 kb-in" aria-labelledby="kb-feed-h"><div class="kb-ch"><h2 id="kb-feed-h">' + T('Фотозвіти') + '</h2><small class="muted">' + T('раз на 1–2 тижні') + '</small></div>' +
        (withRep.length ? '<div class="kb-filter" role="group" aria-label="' + esc(T('Фотозвіти етапу')) + '"><button type="button" data-fs="" aria-pressed="true">' + T('Усі') + '</button>' +
          withRep.map(function (s) { return '<button type="button" data-fs="' + esc(s.id) + '" aria-pressed="false">' + esc(s.name) + '</button>'; }).join('') + '</div>' : '') +
        '<div id="kb-feed">' + feed(p, '') + '</div></section>';
      // документи
      var other = (p.documents || []).filter(function (x) { return x.kind !== 'act'; });
      h += '<section class="kb-card s2 kb-in" aria-labelledby="kb-doc-h"><h2 id="kb-doc-h">' + T('Документи') + '</h2>' +
        (acts.length ? '<h3>' + T('Акти етапів') + '</h3>' + docs(acts.map(function (a) { return st[a.stage_id] ? Object.assign({}, a, { title: a.title + ' · ' + st[a.stage_id] }) : a; })) : '') +
        (other.length ? (acts.length ? '<h3>' + T('Договір, кошторис, рахунки') + '</h3>' : '') + docs(other) : '') +
        (!acts.length && !other.length ? '<p class="muted">' + T('Договір, кошторис, рахунки й акти етапів зʼявляться тут.') + '</p>' : '') +
        '<div class="kb-note">' + T('Гарантія на роботи — 12 місяців.') + '</div></section>';
      h += payBlock(p);
      h += managerCard('s6', p.manager);
      paint(h + '</div>');
      document.title = p.title + ' — ' + T('онлайн-контроль') + ' | CAS Development';
      lightbox();
      // заявка на камеру — лише якщо камери ще немає
      if (lead) {
        lead.hidden = !!p.camera;
        var nm = document.getElementById('oName'), ph = document.getElementById('oPhone'), msg = document.getElementById('oMsg');
        if (nm && !nm.value) nm.value = c.name || '';
        if (ph && !ph.value) ph.value = c.phone || '';
        if (msg && !msg.value) msg.value = p.title + (p.address ? ', ' + p.address : '');
      }
      box.querySelectorAll('[data-cam-lead]').forEach(function (a) {
        a.onclick = function (e) {
          if (!lead) return; e.preventDefault(); lead.hidden = false; lead.scrollIntoView({ behavior: 'smooth', block: 'start' });
          var t = document.getElementById('oPhone'); if (t) setTimeout(function () { t.focus({ preventScroll: true }); }, 400);
        };
      });
      // YouTube вмикаємо лише по кліку: жодних запитів до Google, доки клієнт сам не відкриє трансляцію
      box.querySelectorAll('[data-yt]').forEach(function (b) {
        b.onclick = function () {
          var src = b.getAttribute('data-yt'); if (!YT.test(src)) return;
          var f = document.createElement('iframe');
          f.src = src; f.title = T('Камера на обʼєкті — трансляція'); f.width = 1280; f.height = 720;
          f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); f.setAttribute('allowfullscreen', '');
          f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
          b.replaceWith(f);
        };
      });
      var snap = box.querySelector('[data-snap]'), sr = box.querySelector('[data-snap-r]');
      if (snap && sr) sr.onclick = function () {
        var u = p.camera.url; snap.src = u + (u.indexOf('?') < 0 ? '?' : '&') + '_t=' + Date.now();
        var t = box.querySelector('[data-snap-t]'); if (t) t.textContent = T('Оновлено о {t}', { t: new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }) });
      };
      // фільтр стрічки за етапом
      var fb = document.getElementById('kb-feed');
      function showStage(id) {
        fb.innerHTML = feed(p, id); lightbox();
        box.querySelectorAll('[data-fs]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-fs') === id)); });
      }
      box.querySelectorAll('[data-fs]').forEach(function (b) { b.onclick = function () { showStage(b.getAttribute('data-fs')); }; });
      box.querySelectorAll('[data-stg]').forEach(function (b) { b.onclick = function () { showStage(b.getAttribute('data-stg')); document.getElementById('kb-feed-h').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    }, function (e) { paint('<p class="acc-err">' + esc(e.message) + '</p>'); });
  }

  /* ---------- профіль ---------- */
  var KIND = { np_branch: T('Нова Пошта — відділення'), np_locker: T('Нова Пошта — поштомат'), object: T('Адреса обʼєкта') };
  var KIND_S = { np_branch: T('НП: відділення'), np_locker: T('НП: поштомат'), object: T('Адреса обʼєкта') };
  function profile(c) {
    Promise.all([api('/api/account/profile'), catalog()]).then(function (r) {
      var P = r[0], D = r[1], s = P.settings || {}, cl = P.client || c;
      var h = '<div class="kb-grid">';
      if (P.pending) h += '<div class="kb-note s6">' + T('Розділ оновлюється: адреси й реквізити можна буде зберегти за кілька хвилин. Імʼя й телефон зберігаються вже зараз.') + '</div>';
      // особисті дані
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-pd"><div class="kb-ch"><h2 id="kb-pd">' + T('Особисті дані') + '</h2>' + ava(cl, true) + '</div><form id="kb-pf" novalidate>' +
        '<div class="field"><label for="pf-name">' + T('Імʼя') + '</label><input id="pf-name" name="name" autocomplete="name" maxlength="120" value="' + esc(cl.name) + '" data-auto></div>' +
        '<div class="field"><label for="pf-phone">' + T('Телефон') + '</label><input id="pf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="097 123 45 67" value="' + esc(cl.phone) + '" data-auto aria-describedby="pf-phone-e"><div class="err" id="pf-phone-e" role="alert"></div></div>' +
        '<div class="field"><label for="pf-mail">' + T('Email для рахунків і документів') + '</label><input id="pf-mail" name="docs_email" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(cl.email || 'name@company.ua') + '" value="' + esc(s.docs_email) + '" data-auto aria-describedby="pf-mail-e"><div class="err" id="pf-mail-e" role="alert"></div></div>' +
        '<div class="field"><label for="pf-lang">' + T('Мова спілкування') + '</label><select id="pf-lang" name="lang" data-auto>' + [['uk', 'Українська'], ['ru', 'Русский'], ['en', 'English'], ['es', 'Español'], ['zh', '中文'], ['pl', 'Polski'], ['de', 'Deutsch'], ['fr', 'Français'], ['pt', 'Português'], ['ar', 'العربية']].map(function (l) { return '<option value="' + l[0] + '"' + (s.lang === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></div>' +
        '<label class="kb-sw field"><span>' + T('Сповіщення про статуси в Telegram') + '<small class="muted" style="display:block">' + T(OZ ? 'Нове → в роботі → … → доставлено' : 'Етапи, фотозвіти й документи') + '</small></span><input type="checkbox" name="notify_tg" data-auto' + (s.notify_tg !== 0 ? ' checked' : '') + '></label>' +
        '<p class="muted" style="font-size:12px">' + T('Зберігається автоматично.') + ' ' + T('Вхід:') + ' ' + esc(cl.provider === 'telegram' ? 'Telegram' + (cl.username ? ' @' + cl.username : '') : cl.provider === 'google' ? 'Google · ' + (cl.email || '') : T('номер телефону')) + '</p></form></section>';
      // реквізити
      h += '<section class="kb-card s3 kb-in" aria-labelledby="kb-rq"><h2 id="kb-rq">' + T('Реквізити для рахунку') + '</h2><form id="kb-rf" novalidate>' +
        '<div class="field"><span class="muted" style="display:block;font-size:var(--fs-small);margin-bottom:6px" id="rf-tl">' + T('Хто платить') + '</span><div class="kb-seg" role="radiogroup" aria-labelledby="rf-tl">' +
        [['private', 'Приватна особа'], ['fop', 'ФОП'], ['tov', 'ТОВ'], ['eu', 'Компанія з ЄС']].map(function (t) {
          return '<label><input type="radio" name="client_type" value="' + t[0] + '"' + ((s.client_type || 'private') === t[0] ? ' checked' : '') + ' data-auto><span>' + T(t[1]) + '</span></label>';
        }).join('') + '</div></div><div id="rf-co">' +
        '<div class="field"><label for="rf-name">' + T('Назва компанії / ПІБ ФОП') + '</label><input id="rf-name" name="company_name" maxlength="200" autocomplete="organization" value="' + esc(s.company_name) + '" data-auto></div>' +
        '<div class="field"><label for="rf-code" id="rf-code-l">' + T('ЄДРПОУ') + '</label><input id="rf-code" name="company_code" inputmode="numeric" maxlength="20" value="' + esc(s.company_code) + '" data-auto aria-describedby="rf-code-h rf-code-e"><div class="hint" id="rf-code-h"></div><div class="err" id="rf-code-e" role="alert"></div></div></div>' +
        '<div class="kb-note" id="rf-note"></div></form></section>';
      // адреси
      h += '<section class="kb-card s6 kb-in" aria-labelledby="kb-ad"><div class="kb-ch"><h2 id="kb-ad">' + T('Адреси доставки') + '</h2><button class="btn ghost sm" type="button" id="ad-add">' + T('+ Додати адресу') + '</button></div><div id="ad-list" class="kb-addr"></div><div id="ad-form"></div></section>';
      // партнерам і знижки
      if (OZ || P.partner) h += '<section class="kb-card ' + (OZ ? 's3' : 's6') + ' kb-in" aria-labelledby="kb-pt"><h2 id="kb-pt">' + T('Партнерам') + '</h2>' + (P.partner
        ? '<p class="muted" style="font-size:var(--fs-small)">' + T('Ваш особистий код партнера:') + '</p><div class="kb-code"><b>' + esc(P.partner.code) + '</b><button class="btn ghost sm" type="button" id="pt-copy" data-code="' + esc(P.partner.code) + '">' + T('Скопіювати') + '</button></div>' +
          '<p>' + T('Знижка') + ' <b>' + P.partner.discount + '%</b> · ' + T('замовлень з кодом:') + ' ' + (P.partner.uses || 0) + '</p><div class="kb-note">' + T('Код не сумується зі знижкою за обсягом — діє більша. Вводьте його в кошику Оздоби або передайте клієнту.') + '</div>'
        : '<p class="muted">' + T('Дизайнерам, архітекторам і студіям — особистий код партнера зі знижкою на товари Оздоби для ваших обʼєктів. Публічних промокодів немає.') + '</p><a class="btn ghost" href="https://t.me/' + PHONE + '" target="_blank" rel="noopener">' + T('Стати партнером') + '</a>') + '</section>';
      if (OZ) h += '<section class="kb-card s3 kb-in">' + volumeBlock(D, null) + '</section>';
      h += '<section class="kb-card s6 kb-in kb-noprint" aria-labelledby="kb-ac"><div class="row" style="justify-content:space-between"><div><h2 id="kb-ac">' + T('Акаунт') + '</h2><p class="muted">' + T('Вийти з кабінету на цьому пристрої — і за потреби увійти іншим акаунтом (Telegram, Google чи телефон).') + '</p></div><div class="row">' + (cl.admin ? '<a class="btn ghost sm" href="/kabinet/admin">Облік замовлень</a>' : '') + outBtn(true) + '</div></div></section>';
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
    if (type === 'tov' && !/^\d{8}$/.test(v)) return T('ЄДРПОУ — 8 цифр');
    if (type === 'fop' && !/^\d{10}$/.test(v)) return T('ІПН — 10 цифр');
    return '';
  }
  function bindProfile(P) {
    var pf = document.getElementById('kb-pf'), rf = document.getElementById('kb-rf');
    var setErr = function (id, msg, inp) { var e = document.getElementById(id); if (e) e.textContent = msg || ''; if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); } };
    function rfSync() {
      var t = (rf.querySelector('[name=client_type]:checked') || {}).value || 'private';
      document.getElementById('rf-co').hidden = t === 'private';
      document.getElementById('rf-code-l').textContent = T(t === 'fop' ? 'ІПН (РНОКПП)' : t === 'eu' ? 'VAT / реєстраційний номер' : 'ЄДРПОУ');
      document.getElementById('rf-code-h').textContent = t === 'fop' ? T('10 цифр') : t === 'tov' ? T('8 цифр') : '';
      document.getElementById('rf-note').innerHTML = T(t === 'eu' ? 'Рахунки для компаній з ЄС — у процесі підключення. Збережіть дані — менеджер повідомить, щойно це запрацює.'
        : t === 'private' ? 'Оплата карткою за посиланням від менеджера. Для рахунку оберіть ФОП чи ТОВ.' : 'Виставляємо рахунок для ФОП і ТОВ (з ПДВ або без, індивідуально) — дані підставимо автоматично під час оформлення.');
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
        toast(T('Збережено'));
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
        if (name === 'phone') { if (!phoneOk(val)) return setErr('pf-phone-e', T('Номер у форматі 097 123 45 67 або +380…'), inp); setErr('pf-phone-e', '', inp); }
        if (name === 'docs_email') { if (!mailOk(val)) return setErr('pf-mail-e', T('Перевірте email'), inp); setErr('pf-mail-e', '', inp); }
        if (name === 'name' && !String(val).trim()) return;
        if (name === 'client_type') {
          var t = rfSync(), code = document.getElementById('rf-code'), ce = codeErr(t, code.value);
          setErr('rf-code-e', ce, code);
          if (ce) { // тип змінився, а код ще під старий — збережемо тип разом з очищеним кодом лише після виправлення
            return api('/api/account/profile', { method: 'PATCH', body: { client_type: t, company_code: '' } }).then(function () { toast(T(t === 'fop' ? 'Тип збережено — вкажіть ІПН' : 'Тип збережено — вкажіть ЄДРПОУ')); }, function (e) { toast(e.message, true); });
          }
        }
        if (name === 'company_code') {
          var t2 = rfSync(), ce2 = codeErr(t2, val); setErr('rf-code-e', ce2, inp); if (ce2) return;
        }
        if (name === 'company_name' || name === 'company_code' || name === 'client_type' || name === 'docs_email' || name === 'lang' || name === 'notify_tg') {
          if (P.pending) return toast(T('Реквізити можна буде зберегти за кілька хвилин'), true);
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
        return '<div class="kb-addr-i' + (a.is_default ? ' def' : '') + '"><div class="tx"><b>' + esc(a.label || KIND[a.kind]) + (a.is_default ? ' <span class="kb-st" style="padding:1px 8px;font-size:11px">' + T('основна') + '</span>' : '') + '</b>' +
          esc(a.city) + (a.kind === 'object' ? ', ' + esc(a.address) : ', ' + T(a.kind === 'np_locker' ? 'поштомат' : 'відділення') + ' №' + esc(a.branch)) +
          (a.recipient || a.phone ? '<br><span class="muted">' + esc([a.recipient, a.phone].filter(Boolean).join(' · ')) + '</span>' : '') + '<br><small class="muted">' + KIND[a.kind] + '</small></div>' +
          '<div class="act">' + (a.is_default ? '' : '<button class="btn ghost sm" type="button" data-def="' + a.id + '">' + T('Основна') + '</button>') + '<button class="btn ghost sm" type="button" data-ed="' + a.id + '">' + T('Змінити') + '</button><button class="btn ghost sm" type="button" data-del="' + a.id + '" aria-label="' + esc(T('Видалити адресу')) + '">✕</button></div></div>';
      }).join('') : '<p class="muted">' + T('Додайте відділення Нової Пошти або адресу обʼєкта — підставимо їх під час оформлення замовлення.') + '</p>';
      list.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (!confirm(T('Видалити адресу?'))) return; addrReq('DELETE', null, '?id=' + b.getAttribute('data-del')); }; });
      list.querySelectorAll('[data-def]').forEach(function (b) { b.onclick = function () { addrReq('PATCH', { id: +b.getAttribute('data-def'), is_default: true }); }; });
      list.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { form(L.filter(function (a) { return a.id === +b.getAttribute('data-ed'); })[0]); }; });
    }
    function addrReq(method, body, q) {
      return api('/api/account/addresses' + (q || ''), { method: method, body: body }).then(function (d) { P.addresses = d.addresses; drawAddr(); fbox.innerHTML = ''; toast(T(method === 'DELETE' ? 'Адресу видалено' : 'Адресу збережено')); return true; },
        function (e) { toast(e.message, true); var er = document.getElementById('ad-e'); if (er) er.textContent = e.message; return false; });
    }
    function form(a) {
      a = a || { kind: 'np_branch' };
      fbox.innerHTML = '<form class="kb-addr-f" id="ad-f" novalidate style="margin-top:12px"><div class="field"><div class="kb-seg" role="radiogroup" aria-label="' + esc(T('Тип адреси')) + '">' +
        Object.keys(KIND).map(function (k) { return '<label><input type="radio" name="kind" value="' + k + '"' + (a.kind === k ? ' checked' : '') + '><span>' + KIND_S[k] + '</span></label>'; }).join('') + '</div></div>' +
        '<div class="kb-f2"><div class="field"><label for="ad-city">' + T('Місто *') + '</label><input id="ad-city" name="city" required maxlength="80" autocomplete="address-level2" value="' + esc(a.city) + '"></div>' +
        '<div class="field" id="ad-br-w"><label for="ad-br" id="ad-br-l">' + T('Номер відділення *') + '</label><input id="ad-br" name="branch" inputmode="numeric" maxlength="6" value="' + esc(a.branch) + '"></div>' +
        '<div class="field" id="ad-adr-w"><label for="ad-adr">' + T('Адреса обʼєкта *') + '</label><input id="ad-adr" name="address" maxlength="200" autocomplete="street-address" value="' + esc(a.address) + '"></div>' +
        '<div class="field"><label for="ad-lab">' + T('Назва (необовʼязково)') + '</label><input id="ad-lab" name="label" maxlength="60" placeholder="' + esc(T('Офіс, ресторан, дача')) + '" value="' + esc(a.label) + '"></div>' +
        '<div class="field"><label for="ad-rec">' + T('Отримувач') + '</label><input id="ad-rec" name="recipient" maxlength="120" autocomplete="name" value="' + esc(a.recipient) + '"></div>' +
        '<div class="field"><label for="ad-ph">' + T('Телефон отримувача') + '</label><input id="ad-ph" name="phone" type="tel" inputmode="tel" placeholder="097 123 45 67" value="' + esc(a.phone) + '"></div></div>' +
        '<label class="kb-sw field" style="max-width:340px"><span>' + T('Основна адреса') + '</span><input type="checkbox" name="is_default"' + (a.is_default ? ' checked' : '') + '></label>' +
        '<p class="err" id="ad-e" role="alert"></p><div class="row"><button class="btn" type="submit">' + T('Зберегти адресу') + '</button><button class="btn ghost" type="button" id="ad-x">' + T('Скасувати') + '</button></div></form>';
      var f = document.getElementById('ad-f');
      function kindSync() {
        var k = f.kind.value;
        document.getElementById('ad-br-w').hidden = k === 'object';
        document.getElementById('ad-adr-w').hidden = k !== 'object';
        document.getElementById('ad-br-l').textContent = T(k === 'np_locker' ? 'Номер поштомату *' : 'Номер відділення *');
      }
      kindSync();
      f.addEventListener('change', function (e) { if (e.target.name === 'kind') kindSync(); });
      document.getElementById('ad-x').onclick = function () { fbox.innerHTML = ''; };
      f.onsubmit = function (e) {
        e.preventDefault();
        var er = document.getElementById('ad-e'), k = f.kind.value;
        var b = { kind: k, city: f.city.value, branch: f.branch.value, address: f.address.value, label: f.label.value, recipient: f.recipient.value, phone: f.phone.value, is_default: f.is_default.checked };
        if (!b.city.trim()) { er.textContent = T('Вкажіть місто'); f.city.focus(); return; }
        if (k === 'object' ? !b.address.trim() : !/^\d{1,6}$/.test(b.branch.trim())) { er.textContent = T(k === 'object' ? 'Вкажіть адресу обʼєкта' : 'Номер відділення чи поштомату — цифрами'); return; }
        if (!phoneOk(b.phone)) { er.textContent = T('Телефон отримувача: 097 123 45 67'); f.phone.focus(); return; }
        if (P.pending) { er.textContent = T('Адреси можна буде зберегти за кілька хвилин'); return; }
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
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { toast(T('Код скопійовано')); }, function () { toast(code); });
    };
    bindOut();
  }

  /* ---------- старт ---------- */
  function start() {
    if (!A) { paint('<p class="acc-err">' + T('Не вдалося завантажити кабінет. Оновіть сторінку.') + '</p>'); return; }

    A.me().then(function (c) {
      if (!c) return guest();
      // Працівник на /kabinet одразу потрапляє у свій кабінет (/kabinet/team або /kabinet/admin), а не в клієнтський (16.11).
      // Кабінет клієнта для себе — /kabinet?client=1 (посилання є в кабінеті працівника).
      var asClient = /[?&]client=1\b/.test(location.search);
      try { if (asClient) sessionStorage.setItem('kb-as-client', '1'); else asClient = sessionStorage.getItem('kb-as-client') === '1'; } catch (e) { /* приватний режим */ }
      if (TAB === 'overview' && c.staff && c.staff.home && c.staff.home !== '/kabinet' && !asClient) { location.replace(c.staff.home); return; }
      if (TAB === 'orders') orders(c);
      else if (TAB === 'fav') fav(c);
      else if (TAB === 'projects') { projects(c); ozCheck(); }
      else if (TAB === 'object') { objectTab(c); ozCheck(); }
      else if (TAB === 'profile') { profile(c); ozCheck(); }
      else overview(c);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
