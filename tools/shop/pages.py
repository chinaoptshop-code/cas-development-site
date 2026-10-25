#!/usr/bin/env python3
"""Сторінки кабінету: /kabinet (клієнт) і /kabinet/admin (менеджер). Шапка й стилі — з ozdoba.html.

  python3 tools/shop/pages.py
"""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import chrome  # єдина шапка/футер (tools/site/chrome.py)

CSS = """
.acc{max-width:1100px;margin:0 auto;padding:0 16px 40px}
.acc h1{font-size:clamp(2rem,1.5rem + 2vw,3rem);margin:8px 0 10px}
.acc .lead{color:var(--muted);max-width:60ch;margin:0 0 22px}
.acc-box{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:22px;max-width:520px}
.acc-box>*+*{margin-top:12px}.acc-wait,.acc-err{color:var(--muted);font-size:var(--fs-small)}.acc-err{color:#e07a6a}
.acc-box>h2{font-size:var(--fs-h3);line-height:1.15;margin:0}
.acc-grid{display:grid;gap:18px}@media(min-width:900px){.acc-grid{grid-template-columns:340px 1fr;align-items:start}}
.acc-prof img{width:56px;height:56px;border-radius:50%;object-fit:cover;float:left;margin-right:12px}
.acc-prof b{display:block;font-size:var(--fs-lead)}.acc-prof small{color:var(--muted)}
.acc .field input,.acc .field select,.acc .field textarea{width:100%;background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--cream);font:inherit}
.ord{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--surface)}
.ord+.ord{margin-top:12px}
.ord-h{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;justify-content:space-between}
.ord-h b{font-family:"Cormorant Garamond","Cormorant Fallback",serif;font-size:var(--fs-h3)}
.st{border:1px solid var(--brass);color:var(--glow);border-radius:999px;padding:3px 10px;font-size:var(--fs-small)}
.ord ul{margin:10px 0 0;padding-left:18px;color:var(--muted);font-size:var(--fs-small)}
.ord .tot{margin-top:8px;font-weight:700;color:var(--glow)}
.acc .btn{display:inline-block;width:auto;padding:12px 20px;margin:0;text-decoration:none}
.acc-ph{border-top:1px solid var(--line);padding-top:14px}.acc .acc-ph .btn{display:block;width:100%;text-align:center;margin:10px 0 0}
.acc-ph .field{margin-bottom:0}.acc-ph input:disabled{opacity:.6}.acc-ph .acc-wait{margin:10px 0 0}.acc-ph [hidden]{display:none!important}
.acc .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.tabs2{display:flex;gap:18px;border-bottom:1px solid var(--line);margin:6px 0 16px}
.tabs2 button{padding:8px 0 10px;color:var(--muted);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs2 button[aria-pressed=true]{color:var(--cream);border-bottom-color:var(--brass)}
table.adm{width:100%;border-collapse:collapse;font-size:var(--fs-small)}table.adm td,table.adm th{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}
"""

CLIENT = """<main class="acc">
  <div class="crumbs"><a href="/">Головна</a> / <a href="/ozdoba">Оздоба</a> / Кабінет</div>
  <h1>Кабінет клієнта</h1>
  <p class="lead">Ваші замовлення з Оздоби, статуси й дані для доставки. Вхід — через Telegram, Google або номер телефону, без паролів.</p>
  <div id="acc"></div>
</main>
<script src="/assets/account.v1.js?v=__ACCV__" defer></script>
<script>
addEventListener('DOMContentLoaded', function () {
  var A = CASAccount, box = document.getElementById('acc');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var money = function (n) { return n == null ? 'за запитом' : new Intl.NumberFormat('uk-UA').format(n) + ' ₴'; };
  function guest() {
    box.innerHTML = '<div class="acc-box"><h2>Увійти</h2><div id="login"></div></div>';
    A.login(document.getElementById('login'), render);
  }
  function render(c) {
    if (!c) return guest();
    box.innerHTML = '<div class="acc-grid"><div class="acc-box acc-prof">' + (c.photo ? '<img src="' + esc(c.photo) + '" width="56" height="56" alt="" loading="lazy">' : '') +
      '<b>' + esc(c.name || 'Клієнт') + '</b><small>' + esc(c.provider === 'telegram' ? (c.username ? '@' + c.username : 'Telegram') : c.provider === 'phone' ? c.phone : c.email) + '</small>' +
      '<form id="pf" style="clear:both;padding-top:12px">' +
      '<div class="field"><label for="pf-name">Імʼя</label><input id="pf-name" name="name" value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label for="pf-phone">Телефон</label><input id="pf-phone" name="phone" type="tel" value="' + esc(c.phone) + '" placeholder="+380…"></div>' +
      '<div class="field"><label for="pf-city">Місто й відділення Нової Пошти</label><input id="pf-city" name="city" value="' + esc(c.city) + '"></div>' +
      '<div class="field"><label for="pf-company">Компанія й ЄДРПОУ (для рахунку)</label><input id="pf-company" name="company" value="' + esc(c.company) + '"></div>' +
      '<div class="row"><button class="btn" type="submit">Зберегти</button><button class="btn ghost" type="button" id="lo">Вийти</button>' +
      (c.admin ? '<a class="btn ghost" href="/kabinet/admin">Облік замовлень</a>' : '') + '</div><p class="acc-wait" id="pfm"></p></form></div>' +
      '<div><h2 style="font-size:var(--fs-h3);margin:0 0 12px">Мої замовлення</h2><div id="ol"><p class="acc-wait">Завантажуємо…</p></div>' +
      '<p style="margin-top:16px"><a class="btn" href="/ozdoba">До каталогу</a></p></div></div>';
    document.getElementById('lo').onclick = function () { A.logout().then(function () { render(null); }); };
    document.getElementById('pf').onsubmit = function (e) {
      e.preventDefault(); var f = e.target, m = document.getElementById('pfm');
      A.api('/api/me', { method: 'PATCH', body: { name: f.name.value, phone: f.phone.value, city: f.city.value, company: f.company.value } })
        .then(function () { m.textContent = 'Збережено'; }, function (er) { m.textContent = er.message; });
    };
    A.api('/api/orders').then(function (d) {
      var ol = document.getElementById('ol');
      if (!d.orders.length) { ol.innerHTML = '<p class="acc-wait">Замовлень ще немає. Додайте товари в кошик в Оздобі й оформіть заявку — вона з’явиться тут.</p>'; return; }
      ol.innerHTML = d.orders.map(function (o) {
        return '<div class="ord"><div class="ord-h"><b>' + esc(o.number) + '</b><span class="st">' + esc(o.status_label) + '</span><small style="color:var(--muted)">' + esc(o.created_at) + '</small></div><ul>' +
          o.items.map(function (i) { return '<li>' + esc(i.name) + ' — ' + esc(i.color) + (i.size ? ', ' + esc(i.size) : '') + ' — ' + i.qty + ' ' + esc(i.unit) + ' × ' + money(i.price) + '</li>'; }).join('') +
          '</ul><div class="tot">Разом: ' + money(o.total) + (o.on_request ? ' + ' + o.on_request + ' поз. за запитом' : '') + '</div>' +
          (o.manager_note ? '<p class="acc-wait">Менеджер: ' + esc(o.manager_note) + '</p>' : '') + '</div>';
      }).join('');
    });
  }
  A.me().then(render);
});
</script>
"""

ADMIN = """<main class="acc">
  <div class="crumbs"><a href="/kabinet">Кабінет</a> / Облік</div>
  <h1>Облік замовлень і клієнтів</h1>
  <div id="adm"><p class="acc-wait">Перевіряємо доступ…</p></div>
</main>
<script src="/assets/account.v1.js?v=__ACCV__" defer></script>
<script>
addEventListener('DOMContentLoaded', function () {
  var A = CASAccount, box = document.getElementById('adm'), ST = {};
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var money = function (n) { return n == null ? 'за запитом' : new Intl.NumberFormat('uk-UA').format(n) + ' ₴'; };
  A.me().then(function (c) {
    if (!c) { box.innerHTML = '<div class="acc-box"><h2>Увійдіть як менеджер</h2><div id="login"></div></div>'; A.login(document.getElementById('login'), function () { location.reload(); }); return; }
    if (!c.admin) { box.innerHTML = '<p class="acc-err">Немає доступу. Попросіть адміністратора додати ваш Telegram або пошту.</p>'; return; }
    box.innerHTML = '<div class="tabs2"><button aria-pressed="true" data-t="o">Замовлення</button><button aria-pressed="false" data-t="c">Клієнти</button></div>' +
      '<div class="row" style="margin-bottom:14px"><input id="q" placeholder="Пошук: номер, телефон, імʼя" style="flex:1;min-width:200px;background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:11px;color:var(--cream)">' +
      '<select id="fs" style="background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:11px;color:var(--cream)"><option value="">Усі статуси</option></select></div><div id="list"></div>';
    var tab = 'o';
    box.querySelectorAll('.tabs2 button').forEach(function (b) { b.onclick = function () { tab = b.dataset.t; box.querySelectorAll('.tabs2 button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); document.getElementById('fs').hidden = tab !== 'o'; load(); }; });
    document.getElementById('q').oninput = function () { clearTimeout(window._t); window._t = setTimeout(load, 300); };
    document.getElementById('fs').onchange = load;
    function load() {
      var q = encodeURIComponent(document.getElementById('q').value), L = document.getElementById('list');
      if (tab === 'c') return A.api('/api/admin/clients?q=' + q).then(function (d) {
        L.innerHTML = '<table class="adm"><tr><th>#</th><th>Клієнт</th><th>Контакти</th><th>Замовлень</th><th>Сума</th><th>Створено</th></tr>' + d.clients.map(function (x) {
          return '<tr><td>' + x.id + '</td><td>' + esc(x.name) + '<br><small>' + esc(x.provider) + (x.username ? ' @' + esc(x.username) : '') + '</small></td><td>' + esc(x.phone) + '<br>' + esc(x.email) + '<br><small>' + esc(x.city) + ' ' + esc(x.company) + '</small></td><td>' + x.orders + '</td><td>' + money(x.total) + '</td><td><small>' + esc(x.created_at) + '</small></td></tr>';
        }).join('') + '</table>';
      });
      A.api('/api/admin/orders?q=' + q + '&status=' + document.getElementById('fs').value).then(function (d) {
        ST = d.statuses; var fs = document.getElementById('fs');
        if (fs.options.length < 2) Object.keys(ST).forEach(function (k) { fs.add(new Option(ST[k], k)); });
        if (!d.orders.length) { L.innerHTML = '<p class="acc-wait">Замовлень немає.</p>'; return; }
        L.innerHTML = d.orders.map(function (o) {
          return '<div class="ord" data-id="' + o.id + '"><div class="ord-h"><b>' + esc(o.number) + '</b><span>' + esc(o.name) + ' · ' + esc(o.phone) + (o.username ? ' · @' + esc(o.username) : '') + '</span><small style="color:var(--muted)">' + esc(o.created_at) + '</small></div><ul>' +
            o.items.map(function (i, n) { return '<li>' + esc(i.name) + ' — ' + esc(i.color) + (i.size ? ', ' + esc(i.size) : '') + ' — ' + i.qty + ' ' + esc(i.unit) + ' × ' + (i.price == null ? '<input data-ix="' + n + '" placeholder="ціна, ₴" style="width:110px;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:4px 8px;color:var(--cream)">' : money(i.price)) + '</li>'; }).join('') +
            '</ul><div class="tot">Разом: ' + money(o.total) + (o.on_request ? ' + ' + o.on_request + ' за запитом' : '') + ' · оплата: ' + esc(o.payment) + (o.delivery ? ' · ' + esc(o.delivery) : '') + (o.company ? ' · ' + esc(o.company) : '') + '</div>' +
            '<div class="row" style="margin-top:10px"><select class="s" style="background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px;color:var(--cream)">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select>' +
            '<input class="n" placeholder="Нотатка для клієнта" value="' + esc(o.manager_note) + '" style="flex:1;min-width:180px;background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px;color:var(--cream)"><button class="btn sv">Зберегти</button></div></div>';
        }).join('');
        L.querySelectorAll('.sv').forEach(function (b) { b.onclick = function () {
          var el = b.closest('.ord'), prices = [];
          el.querySelectorAll('[data-ix]').forEach(function (i) { if (i.value) prices.push({ index: +i.dataset.ix, price: +i.value }); });
          b.textContent = '…';
          A.api('/api/admin/orders', { method: 'PATCH', body: { id: +el.dataset.id, status: el.querySelector('.s').value, manager_note: el.querySelector('.n').value, prices: prices } })
            .then(load, function (e) { b.textContent = e.message; });
        }; });
      });
    }
    load();
  });
});
</script>
"""


def shell():
    s = open(os.path.join(ROOT, 'ozdoba.html'), encoding='utf-8').read()
    s = s.replace('</style>\n<!--ozd:ld-->', CSS + '</style>\n<!--ozd:ld-->', 1)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', '', s, count=1, flags=re.S)
    s = re.sub(r'<link rel="preload" id="ozd-data"[^>]*>\n', '', s)
    s = s.replace(' aria-current="page"', '')  # у кабінеті немає активного пункту меню
    s = s.replace('<meta name="twitter:card"', '<meta name="robots" content="noindex, nofollow">\n<meta name="twitter:card"', 1)
    hdr = re.search(r'<button class="ico" id="btnSearch".*?<span class="badge" id="cartBadge" hidden>0</span></button>', s, flags=re.S)
    if hdr:
        cart_svg = re.search(r'aria-label="Кошик">(<svg.*?</svg>)', hdr.group(0), flags=re.S).group(1)
        acc = re.search(r'<a class="ico" id="accLink".*?</a>', hdr.group(0), flags=re.S)
        s = s.replace(hdr.group(0), (acc.group(0) + '\n  ' if acc else '') + f'<a class="ico" href="/ozdoba" aria-label="Кошик">{cart_svg}</a>')
    return s


def page(s, title, body, path):
    s = re.sub(r'<title>.*?</title>', f'<title>{title} | CAS Development</title>', s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + 'https://cas-develop.com/' + path, s, count=1)
    a, b = s.index('<div class="searchwrap"'), s.index('<!--chrome:f-->')
    ver = hashlib.sha256(open(os.path.join(ROOT, 'assets', 'account.v1.js'), 'rb').read()).hexdigest()[:8]
    s = s[:a] + body.replace('__ACCV__', ver) + '\n' + s[b:]
    a, b = s.index('<div class="bar" id="bar">'), s.index('<!--ui-polish--><script>')
    s = s[:a] + s[b:]
    f = os.path.join(ROOT, path + '.html')
    os.makedirs(os.path.dirname(f), exist_ok=True)
    open(f, 'w', encoding='utf-8').write(chrome.apply(s, path + '.html'))
    print('✓', path)


if __name__ == '__main__':
    sh = shell()
    page(sh, 'Кабінет клієнта', CLIENT, 'kabinet')
    page(sh, 'Облік замовлень', ADMIN, 'kabinet/admin')
