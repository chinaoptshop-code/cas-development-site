#!/usr/bin/env python3
"""PDF-прайс Оздоби для B2B: /ozdoba/prais — усі товари по категоріях з ціною «від» і умовами.

  python3 tools/products/pricelist.py     # (його викликає tools/products/build.py) → ozdoba/prais.html

HTML-сторінка, придатна для друку: кнопка «Зберегти PDF / друк» довантажує мініатюри й відкриває діалог друку
(«Зберегти як PDF»), print-CSS — світлий аркуш A4 без шапки й футера сайту. Ціни — як на картках /ozdoba
(build.min_price: розмір із назви або найменший, колір «як на фото»), «від» — коли розмір обирається.

Індексація: noindex, follow. Сторінка дублює назви й ціни з /ozdoba і 11 сторінок категорій (там — тексти, FAQ і
Product-розмітка), тож у пошуку вона конкурувала б із ними тонким списком без опису; прайс — службовий документ
для друку й пересилання клієнтам, посилання з нього (follow) ведуть на сторінки товарів. У sitemap не додаємо.
Обсяг: компактні рядки без закривних </td>, мініатюри loading=lazy — сторінка в межах бюджету ui.py (HTML ≤ 120 КБ).
"""
import html, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
sys.path.insert(0, HERE)
import chrome  # noqa: E402

OUT = os.path.join(ROOT, 'ozdoba', 'prais.html')
URL = 'https://cas-develop.com/ozdoba/prais'
e = lambda s: html.escape(str(s), quote=True)

TITLE = 'Прайс Оздоби для бізнесу — меблі й світло з Китаю (PDF)'
DESC = 'Прайс Оздоби по категоріях: меблі, світло, сантехніка й декор під замовлення з Китаю для готелів, ресторанів і офісів. Ціни «від», умови, PDF.'

CSS = """:root{--ink:#080709;--surface:#100e0c;--line:rgba(191,145,72,.22);--brass:#BF9148;--glow:#E2C08A;--cream:#EDE8DF;--muted:#938c84;
--bg:#080709;--bg2:#100e0c;--tx:#EDE8DF;--mu:#938c84;--ac:#BF9148;--ln:rgba(191,145,72,.22)}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--ink);color:var(--cream);font-family:"Manrope","Manrope Fallback",system-ui,sans-serif;font-size:var(--fs-body,1rem);line-height:1.5}
h1,h2{font-family:"Cormorant Garamond","Cormorant Fallback",Georgia,serif;font-weight:500;margin:0}
a{color:var(--glow)}
.w{max-width:1100px;margin:0 auto;padding:0 16px}
.crumbs{font-size:var(--fs-small,.8rem);color:var(--muted);padding-top:16px}.crumbs a{color:var(--muted)}
.pr-hero{padding:14px 0 6px}.pr-hero h1{font-size:var(--fs-h1,2.6rem);line-height:1.05;margin:0 0 12px}
.pr-hero p{color:var(--muted);max-width:72ch;margin:0 0 12px}
.pr-act{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 18px}
.pr-act button,.pr-act a{font:inherit;font-weight:700;font-size:var(--fs-small,.85rem);border-radius:12px;padding:14px 20px;min-height:44px;cursor:pointer;text-decoration:none;text-align:center}
.pr-act button{background:var(--brass);color:#1B1408;border:0}.pr-act a{border:1px solid var(--line);color:var(--cream)}
.pr-terms{border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:0 0 18px;background:var(--surface)}
.pr-terms ul{margin:0;padding:0 0 0 18px;color:var(--muted);font-size:var(--fs-small,.85rem);line-height:1.6}
.pr-toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}.pr-toc a{border:1px solid var(--line);border-radius:999px;padding:8px 14px;color:var(--cream);text-decoration:none;font-size:var(--fs-small,.85rem)}
.pr-cat{margin:34px 0 0}.pr-cat h2{font-size:var(--fs-h2,2rem);margin:0 0 10px}.pr-cat h2 small{font:500 var(--fs-small,.8rem) Manrope,"Manrope Fallback",sans-serif;color:var(--muted);margin-left:8px}
.pr-tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:var(--fs-small,.85rem)}
th{text-align:left;color:var(--muted);font-weight:600;padding:8px 6px;border-bottom:1px solid var(--line)}
td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
td:first-child{width:52px}td img{display:block;width:44px;height:44px;object-fit:contain;background:#1f1a14;border-radius:6px}
td:nth-child(2){color:var(--muted);white-space:nowrap}td a{color:var(--cream);text-decoration:none}
td:nth-child(4),th:nth-child(4){white-space:nowrap;color:var(--muted)}
td:last-child,th:last-child{text-align:right;white-space:nowrap}td:last-child{color:var(--glow);font-weight:600}
tr{break-inside:avoid;page-break-inside:avoid}
.pr-note{color:var(--muted);font-size:var(--fs-small,.85rem);margin:24px 0 0;max-width:80ch}
.pr-cta{border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:24px 0 40px;background:var(--surface)}
.pr-cta b{display:block;font-size:1.05em;margin-bottom:4px}.pr-cta p{margin:0;color:var(--muted)}
.pr-print{display:none}
@media(max-width:600px){td:nth-child(2),th:nth-child(2){display:none}.pr-act button,.pr-act a{flex:1 1 100%}}
@page{size:A4;margin:12mm}
@media print{body{background:#fff!important;color:#1d1a16;font-size:10.5pt;padding:0!important}
.sch,.scf,.mbar,.skip,.pr-act,.pr-toc,.crumbs,#cookie,[class*="lq"]{display:none!important}
.w{max-width:none;padding:0}.pr-print{display:block;font:600 18pt "Cormorant Garamond",Georgia,serif;border-bottom:2px solid #BF9148;padding-bottom:6px;margin-bottom:8px}
.pr-print em{color:#BF9148;font-style:normal}.pr-print small{display:block;font:9pt Manrope,Arial,sans-serif;color:#5a534b}
.pr-hero h1{font-size:20pt;color:#17120e}.pr-hero p,.pr-terms ul,.pr-note,.pr-cta p,th,td:nth-child(2),td:nth-child(4){color:#3a342d}
.pr-terms,.pr-cta{background:#faf6ef;border-color:#d9cfbf}.pr-cat{margin-top:14pt}.pr-cat h2{font-size:15pt;color:#17120e;break-after:avoid}
td,th{border-color:#e4dccf;padding:3px 5px}td a{color:#17120e}td:last-child{color:#17120e}td img{width:32px;height:32px;background:#f6f2ec}
a{color:#8a6420}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}"""

JS = """<script>function prPrint(b){var im=[].slice.call(document.querySelectorAll('img[loading=lazy]'));b&&(b.disabled=true);
im.forEach(function(i){i.loading='eager'});var w=im.filter(function(i){return!i.complete}).map(function(i){return new Promise(function(r){i.onload=i.onerror=r})});
Promise.race([Promise.all(w),new Promise(function(r){setTimeout(r,6000)})]).then(function(){b&&(b.disabled=false);try{if(window.clarity)clarity('event','pricelist_print')}catch(e){}window.print()})}</script>"""


def build(b=None):
    if b is None:
        import build as b  # tools/products/build.py — ціни й категорії
    d = json.load(open(b.CAT, encoding='utf-8'))
    items = d['items']
    unit = lambda i: e(i['unit'])
    toc, secs = [], []
    order = list(b.CATS)
    for cat in order:
        rows = [i for i in items if i['cat'] == cat]
        if not rows:
            continue
        slug = b.CATS[cat][0]
        rows.sort(key=lambda i: (i['sub'], b.min_price(d, i) is None, b.min_price(d, i) or 0, i['name']))
        trs = []
        for i in rows:
            mp = b.min_price(d, i)
            price = 'за запитом' if mp is None else ('від ' if b.is_from(d, i) else '') + b.money(mp)
            img = f'<img src="/{i["img"]}-400.webp" width=44 height=44 alt="" loading=lazy>' if i.get('img') else ''
            trs.append(f'<tr><td>{img}<td>OZD-{i["id"]}<td><a href="/ozdoba/{i["slug"]}">{e(i["name"])}</a><td>{unit(i)}<td>{price}')
        toc.append(f'<a href="#{slug}">{e(cat)}</a>')
        secs.append(f'<section class="pr-cat" id="{slug}"><h2>{e(cat)}<small>{b.plural(len(rows))}</small></h2>'
                    f'<div class="pr-tw"><table><thead><tr><th>Фото<th>Артикул<th>Назва<th>Од.<th>Ціна, ₴</thead><tbody>\n'
                    + '\n'.join(trs) + '\n</tbody></table></div></section>')
    date = time.strftime('%d.%m.%Y', time.strptime(b.LASTMOD, '%Y-%m-%d'))
    vol = b.vol_text(d)
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'WebPage', 'name': TITLE, 'url': URL, 'description': DESC, 'inLanguage': 'uk'},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Головна', 'item': 'https://cas-develop.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Оздоба', 'item': 'https://cas-develop.com/ozdoba'},
            {'@type': 'ListItem', 'position': 3, 'name': 'Прайс', 'item': URL}]}]}
    s = f'''<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{chrome.CLARITY}
<title>{e(TITLE)}</title>
<meta name="description" content="{e(DESC)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="{URL}">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(TITLE)}">
<meta property="og:description" content="{e(DESC)}">
<meta property="og:image" content="https://cas-develop.com/img/og-cas.jpg">
<meta property="og:url" content="{URL}">
<meta property="og:locale" content="uk_UA">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/cormorant-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<style id="cas-fonts"></style>
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<main id="main">
<div class="w">
  <div class="crumbs"><a href="/">Головна</a> / <a href="/ozdoba">Оздоба</a> / Прайс</div>
  <div class="pr-print">CAS<em>.</em>Development · Оздоба<small>+380 97 866 77 55 (телефон, Telegram, Viber, WhatsApp) · cas-develop.com/ozdoba · вул. Антоновича, 44, Київ</small></div>
  <div class="pr-hero">
    <h1>Прайс Оздоби для бізнесу</h1>
    <p>Меблі, світло, сантехніка, оздоблення й декор під замовлення з фабрик Китаю — для готелів, ресторанів, кафе, офісів і забудовників. {b.plural(len(items))} по категоріях, ціни «від» у гривнях станом на {date}. Колір, розмір, матеріал і оздоблення — під ваш проєкт.</p>
    <div class="pr-act"><button type="button" onclick="prPrint(this)">Зберегти PDF / друк</button><a href="/ozdoba">Зібрати кошик і КП</a></div>
  </div>
  <div class="pr-terms"><ul>
    <li>Мінімальне замовлення — $500 (≈ 23 000 ₴); мінімум 10 шт (одиниць) кожної позиції, поштучно не продаємо.</li>
    <li>Виготовлення під замовлення: колір, розмір, матеріал і оздоблення. Поставка з Китаю — 30–60 днів.</li>
    <li>Доставка й митні платежі — не фіксовані, розраховуємо індивідуально залежно від обсягу замовлення.</li>
    <li>Оплата: карткою (посилання від менеджера), рахунком для ФОП і ТОВ, готівкою (гривні, долари, євро) або в USDT. Рахунки для компаній з ЄС — у процесі підключення.</li>
    <li>{e(vol)} — на всю суму товарів; з особистим кодом партнера не сумується, діє більша.</li>
  </ul></div>
  <nav class="pr-toc" aria-label="Категорії прайсу">{"".join(toc)}</nav>
  {"".join(secs)}
  <p class="pr-note">Ціни орієнтовні: «від» — найменший розмір або розмір із назви, колір «як на фото»; інші кольори й розміри — за кошторисом. Остаточна пропозиція — після підтвердження менеджером (ціни, наявність і строк поставки). Ціна в USD/EUR — у комерційній пропозиції.</p>
  <div class="pr-cta"><b>Потрібна комерційна пропозиція під обʼєкт?</b><p>Додайте позиції в кошик на <a href="/ozdoba">/ozdoba</a> і натисніть «Завантажити КП (PDF)» — з фото, кількостями й знижкою за обсягом. Або подзвоніть: <a href="tel:+380978667755">+380 97 866 77 55</a>. Комплектація обʼєкта під ключ — <a href="/komplektatsiia-pid-kliuch-kyiv">комплектація під ключ</a>.</p></div>
</div>
</main>
{JS}
</body>
</html>
'''
    s = chrome.apply(s, 'ozdoba/prais.html')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write(s)
    return len(items), round(len(s.encode()) / 1024, 1)


if __name__ == '__main__':
    n, kb = build()
    print(f'Прайс Оздоби: {n} позицій, ozdoba/prais.html {kb} КБ')
