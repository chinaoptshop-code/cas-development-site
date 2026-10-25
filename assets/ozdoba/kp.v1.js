/* Оздоба — комерційна пропозиція (КП) з кошика або комплекту. Вантажить app.js лише по кліку «Завантажити КП (PDF)»
   (window.OZD_KP(data), data — kpData() в app.js). Без бібліотек і сервера: документ КП показується поверх сторінки,
   а print-CSS друкує лише його — у діалозі друку «Зберегти як PDF». Мови: uk / en / pl (data.lang).
   Факти — з CLAUDE.md (Михайло 25.10.2026): мін. $500, мін. 10 шт позиції, під замовлення, 30–60 днів,
   доставка й мито — за обсягом, 4 способи оплати, знижка за обсягом 3/5/7 %, ФОП/ТОВ, ЄС — у процесі. */
(function () {
  var K = {
    uk: {
      kp: 'Комерційна пропозиція', no: 'КП №', date: 'Дата', co: 'Компанія / обʼєкт', kit: 'Комплект',
      sub: 'Оздоба — меблі, світло, сантехніка й декор під замовлення з фабрик Китаю',
      th: ['№', 'Фото', 'Позиція', 'К-сть', 'Ціна від, ₴', 'Сума, ₴'], onreq: 'за запитом', low: 'менше мінімуму — підберемо кількість',
      goods: 'Товари', total: 'Разом за товари (орієнтовно)', ship: 'Доставка й митні платежі', shipv: 'розрахунок за обсягом',
      below: 'До мінімального замовлення ($500 ≈ 23 000 ₴) бракує', terms: 'Умови',
      t: ['Мінімальне замовлення — $500 (≈ 23 000 ₴); мінімум {m} шт (одиниць) кожної позиції, поштучно не продаємо.',
        'Виготовлення під замовлення: колір, розмір, матеріал і оздоблення — під ваш проєкт.',
        'Поставка з Китаю — 30–60 днів.',
        'Доставка й митні платежі — не фіксовані, розраховуємо індивідуально залежно від обсягу замовлення.',
        'Оплата: карткою (посилання від менеджера), рахунком для ФОП і ТОВ, готівкою (гривні, долари, євро) або в USDT.',
        '{vol}; з особистим кодом партнера не сумується — діє більша.',
        'Рахунок для ФОП і ТОВ із закривними документами; рахунки для компаній з ЄС — у процесі підключення.'],
      vol: 'Знижка за обсягом на всю суму товарів: від $5 000 — 3%, від $10 000 — 5%, від $20 000 — 7%',
      note: 'Ціни орієнтовні, остаточна пропозиція — після підтвердження менеджером (ціни, наявність і строк поставки).',
      cta: 'Підтвердити ціни й строк', ctat: 'Надішліть номер КП менеджеру — телефон, Telegram, Viber чи WhatsApp — або оформіть заявку в кошику на сайті.',
      scan: 'Каталог Оздоби', print: 'Зберегти PDF / друк', close: 'Закрити', hint: 'У вікні друку оберіть «Зберегти як PDF».',
      phone: 'Телефон', addr: 'вул. Антоновича, 44, Київ', file: 'КП'
    },
    en: {
      kp: 'Commercial proposal', no: 'Quote No.', date: 'Date', co: 'Company / project', kit: 'Package',
      sub: 'Ozdoba — furniture, lighting, sanitaryware and decor made to order at factories in China',
      th: ['#', 'Photo', 'Item', 'Qty', 'Price from, ₴', 'Amount, ₴'], onreq: 'on request', low: 'below minimum — we will adjust the quantity',
      goods: 'Goods', total: 'Total for goods (indicative)', ship: 'Delivery and customs duties', shipv: 'calculated by volume',
      below: 'Left to reach the minimum order ($500 ≈ 23 000 ₴):', terms: 'Terms',
      t: ['Minimum order — $500 (≈ 23 000 ₴); at least {m} pcs (units) of each item, no single-piece sales.',
        'Made to order: colour, size, material and finish tailored to your project.',
        'Lead time from China — 30–60 days.',
        'Delivery and customs duties are not fixed — calculated individually depending on order volume.',
        'Payment: by card (payment link from our manager), bank transfer (invoice for companies registered in Ukraine), cash (UAH, USD, EUR) or USDT.',
        '{vol}; not combined with a personal partner code — the larger discount applies.',
        'Invoices for companies registered in Ukraine with closing documents; invoices for EU companies are being set up.'],
      vol: 'Volume discount on the total goods amount: from $5 000 — 3%, from $10 000 — 5%, from $20 000 — 7%',
      note: 'Prices are indicative; the final proposal (in UAH, USD or EUR) follows after confirmation by our manager — prices, availability and lead time.',
      cta: 'Confirm prices and lead time', ctat: 'Send the quote number to our manager by phone, Telegram, Viber or WhatsApp — or place a request from the cart on our website.',
      scan: 'Ozdoba catalogue', print: 'Save PDF / print', close: 'Close', hint: 'In the print dialog choose “Save as PDF”.',
      phone: 'Phone', addr: '44 Antonovycha St., Kyiv, Ukraine', file: 'Quote'
    },
    pl: {
      kp: 'Oferta handlowa', no: 'Oferta nr', date: 'Data', co: 'Firma / obiekt', kit: 'Zestaw',
      sub: 'Ozdoba — meble, oświetlenie, armatura i dekoracje na zamówienie z fabryk w Chinach',
      th: ['Lp.', 'Zdjęcie', 'Pozycja', 'Ilość', 'Cena od, ₴', 'Wartość, ₴'], onreq: 'na zapytanie', low: 'poniżej minimum — dobierzemy ilość',
      goods: 'Towary', total: 'Razem za towary (orientacyjnie)', ship: 'Dostawa i cło', shipv: 'wycena wg wolumenu',
      below: 'Do minimalnego zamówienia ($500 ≈ 23 000 ₴) brakuje', terms: 'Warunki',
      t: ['Minimalne zamówienie — $500 (≈ 23 000 ₴); co najmniej {m} szt. (jednostek) każdej pozycji, nie sprzedajemy pojedynczych sztuk.',
        'Produkcja na zamówienie: kolor, wymiar, materiał i wykończenie dopasowane do Twojego projektu.',
        'Dostawa z Chin — 30–60 dni.',
        'Koszt dostawy i cła nie jest stały — wyceniamy indywidualnie w zależności od wielkości zamówienia.',
        'Płatność: kartą (link od menedżera), przelewem (faktura dla firm zarejestrowanych na Ukrainie), gotówką (UAH, USD, EUR) lub w USDT.',
        '{vol}; nie łączy się z osobistym kodem partnera — obowiązuje wyższy rabat.',
        'Faktura dla firm zarejestrowanych na Ukrainie z dokumentami rozliczeniowymi; faktury dla firm z UE — w trakcie uruchamiania.'],
      vol: 'Rabat za wolumen od całej wartości towarów: od $5 000 — 3%, od $10 000 — 5%, od $20 000 — 7%',
      note: 'Ceny są orientacyjne; ostateczna oferta (w UAH, USD lub EUR) — po potwierdzeniu przez menedżera: ceny, dostępność i termin dostawy.',
      cta: 'Potwierdź ceny i termin', ctat: 'Wyślij numer oferty menedżerowi — telefon, Telegram, Viber lub WhatsApp — albo złóż zapytanie z koszyka na stronie.',
      scan: 'Katalog Ozdoba', print: 'Zapisz PDF / drukuj', close: 'Zamknij', hint: 'W oknie drukowania wybierz „Zapisz jako PDF”.',
      phone: 'Telefon', addr: 'ul. Antonowycza 44, Kijów, Ukraina', file: 'Oferta'
    }
  };
  var CSS = [
    '#kpDoc{position:fixed;inset:0;z-index:2000;overflow:auto;background:rgba(5,4,6,.82);-webkit-overflow-scrolling:touch}',
    '#kpDoc .kp-bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;padding:10px 12px;background:#100e0c;border-bottom:1px solid rgba(191,145,72,.3)}',
    '#kpDoc .kp-bar button{font:600 14px/1 Manrope,"Manrope Fallback",sans-serif;border-radius:10px;padding:12px 16px;min-height:44px;cursor:pointer;border:1px solid #BF9148;background:#BF9148;color:#1B1408}',
    '#kpDoc .kp-bar button.g{background:none;color:#EDE8DF;border-color:rgba(191,145,72,.4)}',
    '#kpDoc .kp-bar small{flex-basis:100%;text-align:center;color:#938c84;font:12px/1.3 Manrope,"Manrope Fallback",sans-serif}',
    '.kp-page{box-sizing:border-box;width:min(210mm,100%);margin:14px auto 40px;background:#fff;color:#1d1a16;padding:22px 18px;font:13px/1.45 Manrope,"Manrope Fallback",Arial,sans-serif;border-radius:6px}',
    '.kp-page *{box-sizing:border-box}',
    '.kp-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;border-bottom:2px solid #BF9148;padding-bottom:12px;margin-bottom:14px}',
    '.kp-logo{font:600 26px/1 "Cormorant Garamond","Cormorant Fallback",Georgia,serif;letter-spacing:.01em;color:#17120e}.kp-logo em{color:#BF9148;font-style:normal}',
    '.kp-sub{color:#6b635a;font-size:11.5px;margin-top:6px;max-width:42ch}',
    '.kp-ct{font-size:11.5px;color:#3a342d;text-align:right;line-height:1.55}.kp-ct b{color:#17120e}',
    '.kp-page h1{font:600 24px/1.15 "Cormorant Garamond","Cormorant Fallback",Georgia,serif;margin:0 0 8px;color:#17120e}',
    '.kp-meta{display:flex;flex-wrap:wrap;gap:4px 22px;margin:0 0 14px;color:#3a342d;font-size:12.5px}.kp-meta b{color:#17120e}',
    '.kp-tw{overflow-x:auto;margin:0 0 10px}',
    '.kp-t{width:100%;border-collapse:collapse;font-size:12px}',
    '.kp-t th{background:#f3eee6;color:#3a342d;font-weight:600;text-align:left;padding:7px 6px;border-bottom:1px solid #d9cfbf}',
    '.kp-t td{padding:6px;border-bottom:1px solid #ebe4d8;vertical-align:middle}',
    '.kp-t td.n,.kp-t th.n{text-align:right;white-space:nowrap}',
    '.kp-t td.i{width:46px}.kp-t td.i img{display:block;width:40px;height:40px;object-fit:contain;background:#f6f2ec;border-radius:4px}',
    '.kp-t .nm{font-weight:600;color:#17120e}.kp-t .op{color:#6b635a;font-size:11px}.kp-t .lw{color:#a5642a;font-size:11px}',
    '.kp-t tr{break-inside:avoid;page-break-inside:avoid}',
    '.kp-sum{margin:6px 0 16px auto;max-width:360px;font-size:13px}.kp-sum div{display:flex;justify-content:space-between;gap:14px;padding:4px 0}',
    '.kp-sum .d{color:#3f7a2a}.kp-sum .tt{border-top:2px solid #17120e;margin-top:4px;padding-top:8px;font-weight:700;font-size:14.5px;color:#17120e}',
    '.kp-sum .bl{color:#a5642a;font-size:12px}',
    '.kp-page h2{font:600 17px/1.2 "Cormorant Garamond","Cormorant Fallback",Georgia,serif;margin:0 0 6px;color:#17120e}',
    '.kp-terms{margin:0 0 12px;padding-left:18px;font-size:12px;color:#3a342d}.kp-terms li{margin:2px 0}',
    '.kp-note{border-left:3px solid #BF9148;background:#faf6ef;padding:8px 10px;font-size:12px;margin:0 0 14px;color:#3a342d}',
    '.kp-cta{display:flex;gap:14px;align-items:center;border:1px solid #d9cfbf;border-radius:8px;padding:10px 12px;break-inside:avoid}',
    '.kp-cta img{width:96px;height:96px;flex:none}.kp-cta b{display:block;font-size:13.5px;color:#17120e;margin-bottom:3px}.kp-cta p{margin:0 0 4px;font-size:12px;color:#3a342d}.kp-cta a{color:#8a6420}',
    '@media(max-width:520px){.kp-page{padding:16px 12px}.kp-ct{text-align:left}.kp-t .c0{display:none}.kp-cta img{width:72px;height:72px}}',
    '@page{size:A4;margin:12mm}',
    '@media print{html,body{background:#fff!important;padding:0!important;overflow:visible!important}body>*:not(#kpDoc){display:none!important}',
    '#kpDoc{position:static;overflow:visible;background:#fff}#kpDoc .kp-bar{display:none}',
    '.kp-page{width:auto;margin:0;padding:0;border-radius:0;font-size:11.5px}.kp-t{font-size:11px}.kp-t .c0{display:table-cell}.kp-tw{overflow:visible}',
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
  ].join('\n');

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function number() {
    var d = new Date();
    return 'CAS-' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + String(Math.floor(1000 + Math.random() * 9000));
  }

  function close() {
    var el = document.getElementById('kpDoc');
    if (el) el.remove();
    var st = document.getElementById('kpCss'); if (st) st.remove();
    if (close.title != null) { document.title = close.title; close.title = null; }
    document.documentElement.style.overflow = '';
  }

  function printWhenReady(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    var wait = imgs.filter(function (i) { return !i.complete; }).map(function (i) {
      return new Promise(function (ok) { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); });
    });
    var t = new Promise(function (ok) { setTimeout(ok, 2500); });
    Promise.race([Promise.all(wait), t]).then(function () { try { window.print(); } catch (e) {} });
  }

  window.OZD_KP = function (D) {
    close();
    var T = K[D.lang] || K.uk, M = D.money;
    var no = number(), date = new Date().toLocaleDateString({ uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL' }[D.lang] || 'uk-UA');
    var rows = D.lines.map(function (x, n) {
      return '<tr><td class="c0">' + (n + 1) + '</td><td class="i">' + (x.img ? '<img src="' + esc(x.img) + '" width="40" height="40" alt="">' : '') + '</td>'
        + '<td><div class="nm">' + esc(x.name) + '</div><div class="op">' + esc(x.sku) + (x.opt ? ' · ' + esc(x.opt) : '') + '</div>'
        + (x.low ? '<div class="lw">* ' + esc(T.low) + '</div>' : '') + '</td>'
        + '<td class="n">' + x.qty + ' ' + esc(x.unit) + '</td>'
        + '<td class="n">' + (x.price == null ? esc(T.onreq) : M(x.price)) + '</td>'
        + '<td class="n">' + (x.sum == null ? '—' : M(x.sum)) + '</td></tr>';
    }).join('');
    var below = D.total < D.minOrder ? '<div class="bl"><span>' + esc(T.below) + '</span><span>' + M(D.minOrder - D.total) + '</span></div>' : '';
    var terms = T.t.map(function (s) { return '<li>' + esc(s.replace('{m}', D.minq).replace('{vol}', T.vol)) + '</li>'; }).join('');
    var qr = '/assets/ozdoba/qr-' + (K[D.lang] ? D.lang : 'uk') + '.svg';
    var site = D.page.replace(/^https?:\/\//, '');
    var html = '<div class="kp-bar"><button type="button" id="kpPrint">' + esc(T.print) + '</button><button type="button" class="g" id="kpClose">' + esc(T.close) + '</button><small>' + esc(T.hint) + '</small></div>'
      + '<article class="kp-page" lang="' + esc(D.lang) + '">'
      + '<header class="kp-head"><div><div class="kp-logo">CAS<em>.</em>Development</div><div class="kp-sub">' + esc(T.sub) + '</div></div>'
      + '<div class="kp-ct"><b>CAS Development</b><br>' + esc(T.phone) + ': +380 97 866 77 55<br>Telegram · Viber · WhatsApp: +380 97 866 77 55<br>'
      + 'cas-develop.com<br>' + esc(T.addr) + '</div></header>'
      + '<h1>' + esc(T.kp) + (D.kit ? ' — ' + esc(T.kit) + ' «' + esc(D.kit) + '»' : '') + '</h1>'
      + '<div class="kp-meta"><span>' + esc(T.no) + ' <b>' + no + '</b></span><span>' + esc(T.date) + ': <b>' + esc(date) + '</b></span>'
      + (D.company ? '<span>' + esc(T.co) + ': <b>' + esc(D.company) + '</b></span>' : '') + '</div>'
      + '<div class="kp-tw"><table class="kp-t"><thead><tr><th class="c0">' + T.th[0] + '</th><th>' + T.th[1] + '</th><th>' + T.th[2] + '</th><th class="n">' + T.th[3] + '</th><th class="n">' + T.th[4] + '</th><th class="n">' + T.th[5] + '</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>'
      + '<div class="kp-sum"><div><span>' + esc(T.goods) + '</span><span>' + M(D.goods) + '</span></div>'
      + (D.disc ? '<div class="d"><span>' + esc(D.disc.label) + '</span><span>−' + M(D.discAmount) + '</span></div>' : '')
      + '<div><span>' + esc(T.ship) + '</span><span>' + esc(T.shipv) + '</span></div>'
      + '<div class="tt"><span>' + esc(T.total) + '</span><span id="kpTotal">' + M(D.total) + '</span></div>' + below + '</div>'
      + '<h2>' + esc(T.terms) + '</h2><ul class="kp-terms">' + terms + '</ul>'
      + '<p class="kp-note">' + esc(T.note) + '</p>'
      + '<div class="kp-cta"><img src="' + qr + '" width="96" height="96" alt="QR: ' + esc(site) + '">'
      + '<div><b>' + esc(T.cta) + '</b><p>' + esc(T.ctat) + '</p><p>' + esc(T.no) + ' ' + no + ' · +380 97 866 77 55 · <a href="' + esc(D.page) + '">' + esc(site) + '</a></p></div></div>'
      + '</article>';
    var st = document.createElement('style'); st.id = 'kpCss'; st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'kpDoc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', T.kp + ' ' + no); el.innerHTML = html;
    document.body.appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    close.title = document.title; document.title = T.file + ' ' + no + ' — CAS Development';  // назва PDF за замовчуванням
    el.querySelector('#kpPrint').addEventListener('click', function () { try { window.print(); } catch (e) {} });
    el.querySelector('#kpClose').addEventListener('click', close);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    el.querySelector('#kpPrint').focus({ preventScroll: true });
    printWhenReady(el);
    return no;
  };
})();
