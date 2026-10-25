#!/usr/bin/env python3
"""Збирає сторінку Оздоби (/ozdoba) з каталогу assets/ozdoba/catalog.json.

  python3 tools/products/build.py

Що робить: вставляє в ozdoba.html статичні картки товарів (щоб каталог бачили Google і
користувачі ще до завантаження скрипта), розмітку ItemList для пошуку і нові версії ?v=
для catalog.json та app.js (кеш браузера оновиться одразу після деплою).
Фото товарів додає tools/products/photo.py.
"""
import hashlib, html, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import chrome  # єдина шапка/футер (tools/site/chrome.py)
LASTMOD = time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(os.path.join(ROOT, 'assets/ozdoba/catalog.json'))))  # для sitemap
CAT = os.path.join(ROOT, 'assets/ozdoba/catalog.json')
APP = os.path.join(ROOT, 'assets/ozdoba/app.js')
PAGE = os.path.join(ROOT, 'ozdoba.html')
FIRST = 24  # скільки карток віддаємо в HTML /ozdoba; решту app.js дорендерює частинами (TBT)
S = '<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">{}</svg>'
e = lambda s: html.escape(str(s), quote=True)


def r10(n): return round(n / 10) * 10


def min_price(d, i):
    if i.get('price') is None: return None
    ss = d['sizesets'].get(i['ss']) if i.get('ss') else None
    if ss: return r10(i['price'] * min(k for _, k in ss))
    return r10(i['price'] * (1 + d['colorsets'][i['cs']][0][2]))


def money(n):
    if n is None: return 'ціна за запитом'
    return f'{round(n):,}'.replace(',', ' ') + ' ₴'


def pic(d, i):
    b = i.get('img')
    if b:
        return (f'<img src="/{b}-400.webp" srcset="/{b}-400.webp 400w, /{b}-800.webp 800w" sizes="(min-width:900px) 240px, 46vw" '
                f'width="400" height="400" alt="{e(i["name"])}" loading="lazy" decoding="async">')
    return S.format(d['art'].get(i['art'], '<rect x="20" y="20" width="60" height="42" rx="5"/>'))


def price_html(d, i):
    mp = min_price(d, i)
    if mp is None: return 'Ціна за запитом'
    return f'{"від " if i.get("ss") else ""}{money(mp)} <small>/ {e(i["unit"])}</small>'


def card(d, i):
    frm = 'від ' if i.get('ss') else ''
    sw = ''.join(f'<i style="background:{c[1]}"></i>' for c in d['colorsets'][i['cs']][:5])
    heart = (f'<button type="button" class="heart" data-fav="{i["id"]}" onclick="event.stopPropagation();toggleFav({i["id"]})" aria-label="В обране" aria-pressed="false">'
             '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg></button>')
    return (f'<article class="card" onclick="openItem({i["id"]})"><div class="tile{" ph" if i.get("img") else ""}">{pic(d, i)}{heart}</div>'
            f'<div class="body"><div class="sub">{e(i["sub"])}</div><a class="nm" href="/ozdoba/{i["slug"]}" onclick="if(window.openItem)event.preventDefault()" style="color:inherit;text-decoration:none">{e(i["name"])}</a>'
            f'<div class="sw">{sw}</div><div class="pr">{price_html(d, i)}</div></div></article>')


def main():
    d = json.load(open(CAT, encoding='utf-8'))
    changed = False
    for i in d['items']:
        if not i.get('slug'): i['slug'] = slugify(i['name'], i['id']); changed = True
    if changed: json.dump(d, open(CAT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    ids = [i['id'] for i in d['items']]
    assert len(ids) == len(set(ids)), 'id товарів мають бути унікальні'
    for i in d['items']:
        for b in [i.get('img')] + list(i.get('imgs') or []):
            if b and not os.path.exists(os.path.join(ROOT, b + '-800.webp')):
                raise SystemExit(f'немає фото {b}-800.webp для товару {i["id"]}')
    order = {'A': 0, 'B': 1, 'C': 2}
    items = sorted(d['items'], key=lambda i: (order.get(i['prio'], 3), -(min_price(d, i) or 0)))
    grid = ''.join(card(d, i) for i in items[:FIRST])  # решту карток app.js дорендерює частинами; кожен товар має свою сторінку
    # ItemList — лише картки, які є в HTML (швидкий перший рендер); решта товарів — у категоріях і sitemap
    ld = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': 'Оздоба — каталог меблів, світла й декору',
          'numberOfItems': len(items[:FIRST]),
          'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'name': i['name'], 'url': f'https://cas-develop.com/ozdoba/{i["slug"]}'}
                              for n, i in enumerate(items[:FIRST])]}
    ver = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]
    s = open(PAGE, encoding='utf-8').read()
    s = re.sub(r'<!--ozd:grid-->.*?<!--/ozd:grid-->', lambda m: '<!--ozd:grid-->' + grid + '<!--/ozd:grid-->', s, count=1, flags=re.S)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<!--ozd:ld--><script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script><!--/ozd:ld-->', s, count=1, flags=re.S)
    s = re.sub(r'/assets/ozdoba/catalog\.json\?v=\w+', '/assets/ozdoba/catalog.json?v=' + ver(CAT), s)
    s = re.sub(r'/assets/ozdoba/app\.js\?v=\w+', '/assets/ozdoba/app.js?v=' + ver(APP), s)
    s = re.sub(r'<span class="cnt" id="cnt">[^<]*</span>', f'<span class="cnt" id="cnt">{len(items)} позицій</span>', s, count=1)
    s = re.sub(r'<!--ozd:kits-->.*?<!--/ozd:kits-->', lambda m: '<!--ozd:kits-->' + kits_cards(d) + '<!--/ozd:kits-->', s, count=1, flags=re.S)
    open(PAGE, 'w', encoding='utf-8').write(chrome.apply(s, 'ozdoba.html'))
    pages = product_pages(d)
    cats = category_pages(d)
    nk = kits_page(d)
    photos = sum(1 for i in d['items'] if i.get('img'))
    print(f'Оздоба: {len(items)} товарів, з фото {photos}, сторінок товарів {pages}, категорій {cats}, комплектів під обʼєкт {nk}, версія каталогу {ver(CAT)}')



# ===================== сторінки товарів /ozdoba/<slug> =====================
TR = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюя', ['a', 'b', 'v', 'h', 'g', 'd', 'e', 'ie', 'zh', 'z', 'y', 'i', 'i', 'i', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'iu', 'ia']))
VENUE = {'apt': 'квартира', 'resto': 'ресторан і бар', 'hotel': 'готель', 'office': 'офіс', 'shop': 'магазин і шоурум',
         'cafe': 'кафе і кавʼярня', 'beauty': 'салон краси', 'spa': 'SPA і велнес'}


SITE = 'https://cas-develop.com'
# мінімальний вузол організації (повні дані LocalBusiness — на головній, той самий @id)
ORG = {'@type': 'Organization', '@id': f'{SITE}/#business', 'name': 'CAS Development', 'url': f'{SITE}/', 'logo': f'{SITE}/apple-touch-icon.png'}
T_FULL, T_SHORT = ' — купити в Києві | Оздоба CAS', ' — купити в Києві'


def title_variants(name):
    """Варіанти title товару (≤60): повна назва з брендом → назва до коми з брендом → без бренду → обрізка по словах."""
    segs = [x.strip() for x in name.split(',')]
    pref = [', '.join(segs[:k]) for k in range(len(segs), 0, -1)]
    out = [p + T_FULL for p in pref] + [p + T_SHORT for p in pref]
    w = name.replace(',', '').split()
    out += [' '.join(w[:k]) + T_SHORT for k in range(len(w), 0, -1)]
    return [t for t in dict.fromkeys(out) if len(t) <= 60] or [name[:60 - len(T_SHORT)].rstrip() + T_SHORT]


def product_titles(items):
    """Унікальні title для всіх товарів: якщо короткі варіанти збігаються, беремо довший наступний."""
    var = {i['id']: title_variants(i['name']) for i in items}
    pick = {k: 0 for k in var}
    for _ in range(10):
        seen = {}
        for k in var: seen.setdefault(var[k][pick[k]], []).append(k)
        dup = [k for t, ks in seen.items() if len(ks) > 1 for k in ks]
        if not dup: break
        for k in dup:
            if pick[k] + 1 < len(var[k]): pick[k] += 1
    return {k: var[k][pick[k]] for k in var}


def product_desc(d, i):
    """meta description товару ≤160: ціна, опис (обрізаний по словах), доставка, мін. замовлення."""
    mp = min_price(d, i)
    head = f'Ціна {"від " if i.get("ss") else ""}{money(mp)} за {i["unit"]}. ' if mp is not None else 'Ціна за запитом. '
    tail = ' Доставка по Україні, мін. замовлення $500.'
    room = 160 - len(head) - len(tail)
    body = i['desc'].strip()
    if len(body) > room:
        body = body[:room - 1].rsplit(' ', 1)[0].rstrip(' ,.;:—–-') + '…'
    return head + body + tail


def slugify(name, iid):
    s = ''.join(TR.get(c, c) for c in name.lower().replace('ʼ', '').replace("'", ''))
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return '-'.join(s.split('-')[:6]) + f'-{iid}'


def product_page(d, i, shell, items, title):
    u = f'https://cas-develop.com/ozdoba/{i["slug"]}'
    mp = min_price(d, i)
    img = i.get('img')
    hero = (f'<img src="/{img}-800.webp" width="800" height="800" alt="{e(i["name"])}" fetchpriority="high">' if img
            else S.format(d['art'].get(i['art'], '')))
    gal = ''.join(f'<img src="/{b}-400.webp" width="400" height="400" alt="{e(i["name"])} — фото {n + 2}" loading="lazy">' for n, b in enumerate(i.get('imgs') or []))
    colors = d['colorsets'][i['cs']]
    sizes = d['sizesets'].get(i['ss']) if i.get('ss') else None
    specs = list(i.get('specs') or [])
    rows = [('Категорія', i['sub']), ('Кольори й фактури', ', '.join(c[0] for c in colors))]
    if sizes: rows.append(('Розміри', ', '.join(s[0] for s in sizes)))
    rows += [(k, v) for k, v in specs] + [('Одиниця', i['unit']), ('Поставка', '30–60 днів'), ('Підходить для', ', '.join(VENUE[v] for v in i['vn'] if v in VENUE))]
    # «Схожі товари»: спершу та сама підкатегорія (sub), далі та сама категорія; ходові (prio) — першими
    po = {'A': 0, 'B': 1, 'C': 2}
    same = sorted((x for x in items if x['cat'] == i['cat'] and x['id'] != i['id']),
                  key=lambda x: (x['sub'] != i['sub'], po.get(x.get('prio'), 3), abs(x['id'] - i['id'])))
    rel = same[:6]
    cslug = CATS[i['cat']][0] if i['cat'] in CATS else None
    rel_html = ''.join(re.sub(r'<button[^>]*class="heart".*?</button>', '', card(d, x), flags=re.S)
                       .replace(f'onclick="openItem({x["id"]})"', f'onclick="location.href=\'/ozdoba/{x["slug"]}\'"') for x in rel)
    images = [f'{SITE}/{b}-800.webp' for b in [img] + list(i.get('imgs') or []) if b]  # без фото — без image (не og-cas.jpg)
    offer = None
    if mp is not None:  # offers лише з ціною; під замовлення → PreOrder; розміри → діапазон цін
        offer = {'@type': 'Offer', 'price': mp, 'priceCurrency': 'UAH', 'availability': 'https://schema.org/PreOrder',
                 'itemCondition': 'https://schema.org/NewCondition', 'url': u, 'seller': ORG}
        if sizes and len(sizes) > 1:
            hi = r10(i['price'] * max(k for _, k in sizes))
            if hi > mp:
                offer = {**offer, '@type': 'AggregateOffer', 'lowPrice': mp, 'highPrice': hi, 'offerCount': len(sizes)}
                del offer['price']
    crumbs = [('Головна', f'{SITE}/'), ('Оздоба', f'{SITE}/ozdoba')]
    if cslug: crumbs.append((i['cat'], f'{SITE}/ozdoba/kategoriia/{cslug}'))
    crumbs.append((i['name'], u))
    # Product — лише для товарів з ціною (Google вимагає offers/review); без ціни — тільки BreadcrumbList.
    # shippingDetails і hasMerchantReturnPolicy не додаємо: підтверджених умов доставки й повернення немає.
    graph = []
    if offer:
        graph.append({'@type': 'Product', 'name': i['name'], 'description': i['desc'], 'sku': f'OZD-{i["id"]}',
                      'category': i['sub'].replace(' / ', ' > '), 'url': u,
                      **({'image': images if len(images) > 1 else images[0]} if images else {}),
                      'brand': {'@type': 'Brand', 'name': 'Оздоба CAS'}, 'offers': offer})
    graph.append({'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': n + 1, 'name': nm, 'item': it} for n, (nm, it) in enumerate(crumbs)]})
    ld = {'@context': 'https://schema.org', '@graph': graph}
    desc = product_desc(d, i)
    body = f'''<div class="w">
  <div class="crumbs"><a href="/">Головна</a> / <a href="/ozdoba">Оздоба</a> / {f'<a href="/ozdoba/kategoriia/{CATS[i["cat"]][0]}">{e(i["cat"])}</a> / ' if i["cat"] in CATS else ''}{e(i["name"])}</div>
  <article class="pp">
    <div class="pp-media"><div class="hero-art{" ph" if img else ""} pp-hero">{hero}</div>{f'<div class="pp-gal">{gal}</div>' if gal else ''}</div>
    <div class="pp-info">
      <p class="sub">{e(i["sub"])}</p>
      <h1>{e(i["name"])}</h1>
      <p class="pp-price">{price_html(d, i)}</p>
      <p class="desc">{e(i["desc"])}</p>
      <div class="sw pp-sw">{''.join(f'<i style="background:{c[1]}" title="{e(c[0])}"></i>' for c in colors)}</div>
      <p class="pp-btns"><a class="btn" href="/ozdoba#p-{i["id"]}">Обрати колір і додати в кошик</a><a class="btn ghost" href="#zayavka">Запитати ціну й наявність</a></p>
      <dl class="specs">{''.join(f'<dt>{e(k)}</dt><dd>{e(v)}</dd>' for k, v in rows)}</dl>
      <p class="note-honest">Ціна орієнтовна: остаточну вартість, наявність і строк менеджер підтверджує після заявки. Рахунок для ФОП і ТОВ; рахунки для компаній з ЄС — незабаром (у процесі підключення).</p>
    </div>
  </article>
</div>
<section class="ozd-sec" id="zayavka">
  <h2>Запитати ціну й наявність</h2>
  <form id="of" class="pp-form" data-form="ozdoba-product" data-service="Оздоба — {e(i["name"])}" data-source="cas-develop.com/ozdoba/{i["slug"]}" novalidate>
    <div class="field"><label for="oName">Імʼя</label><input id="oName" autocomplete="name"></div>
    <div class="field"><label for="oPhone">Телефон *</label><input id="oPhone" aria-describedby="oErr" type="tel" autocomplete="tel" placeholder="097 123 45 67"><div class="err" id="oErr" role="alert" style="color:#e07a6a;font-size:var(--fs-small);margin-top:6px"></div></div>
    <div class="field"><label for="oArea">Кількість</label><input id="oArea" inputmode="numeric" placeholder="напр. 6"></div>
    <div class="field"><label for="oMsg">Коментар</label><input id="oMsg" placeholder="Колір, розмір, обʼєкт, терміни"></div>
    <button class="btn" id="oBtn" type="submit">Надіслати запит</button>
  </form>
  <div class="ok" id="oOk" role="status" tabindex="-1" style="display:none"><h3>Запит отримано</h3><p style="color:var(--muted)">Менеджер звʼяжеться з вами в робочий час.</p></div>
</section>
{f'<section class="ozd-sec"><h2>Схожі товари</h2><div class="grid pp-rel">{rel_html}</div><p class="pp-more">{f'<a class="btn ghost" href="/ozdoba/kategoriia/{cslug}">Уся категорія «{e(i["cat"])}»</a>' if cslug else ''}<a class="btn ghost" href="/ozdoba">Увесь каталог Оздоби</a></p></section>' if rel else ''}
'''
    s = shell
    s = re.sub(r'<title>.*?</title>', f'<title>{e(title)}</title>', s, count=1)
    s = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + e(desc), s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + e(title), s, count=1)
    s = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + e(desc), s, count=1)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'(<meta property="og:type" content=")[^"]*', lambda m: m.group(1) + 'product', s, count=1)
    if img: s = re.sub(r'(<meta property="og:image" content=")[^"]*', lambda m: m.group(1) + f'https://cas-develop.com/{img}-800.webp', s, count=1)
    s = re.sub(r'<link rel="preload" id="ozd-data"[^>]*>\n', '', s)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>', s, count=1, flags=re.S)
    hdr = re.search(r'<button class="ico" id="btnSearch".*?<span class="badge" id="cartBadge" hidden>0</span></button>', s, flags=re.S)
    if hdr:
        cart_svg = re.search(r'aria-label="Кошик">(<svg.*?</svg>)', hdr.group(0), flags=re.S).group(1)
        acc = re.search(r'<a class="ico" id="accLink".*?</a>', hdr.group(0), flags=re.S)
        s = s.replace(hdr.group(0), (acc.group(0) + '\n  ' if acc else '') + f'<a class="ico" href="/ozdoba" aria-label="Кошик">{cart_svg}</a>')
    a, b = s.index('<div class="searchwrap"'), s.index('<!--chrome:f-->')
    s = s[:a] + body + '\n' + s[b:]
    a, b = s.index('<div class="bar" id="bar">'), s.index('<!--ui-polish--><script>')
    s = s[:a] + '<script src="/assets/lead-form.v1.js" defer></script>\n' + s[b:]
    s = s.replace('aria-current="page">Оздоба</a>', 'aria-current="true">Оздоба</a>')
    return s


PP_CSS = """
/* ===== сторінка товару ===== */
.pp{display:grid;gap:28px;padding:18px 0 8px}
@media(min-width:900px){.pp{grid-template-columns:1.05fr 1fr;align-items:start}.pp-media{position:sticky;top:80px}}
.pp-hero{aspect-ratio:1/1;margin:0;border:1px solid var(--line)}
.pp-hero svg{width:56%;height:56%;color:var(--brass)}
.pp-hero img{padding:7%}
.pp-gal{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
.pp-gal img{width:100%;height:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6%}
.pp-info .sub{color:var(--muted);font-size:var(--fs-small);margin:0 0 6px}
.pp-info h1{font-size:clamp(2rem,1.5rem + 2vw,3rem);line-height:1.08;margin:0 0 12px}
.pp-price{font-family:"Cormorant Garamond","Cormorant Fallback",serif;font-size:var(--fs-h2);color:var(--glow);margin:0 0 10px}
.pp-price small{font-family:"Manrope","Manrope Fallback",sans-serif;font-size:var(--fs-small);color:var(--muted)}
.pp-sw i{width:22px;height:22px}
.pp-btns{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 22px}
.pp-btns .btn{width:auto;margin:0;padding:15px 22px;text-decoration:none}
.pp-form{display:grid;gap:4px;max-width:560px}
.pp-form .btn{width:auto;justify-self:start;padding:15px 26px}
.pp-rel{padding:0}
.pp-more{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.pp-more .btn{display:inline-block;width:auto;margin:0;padding:13px 22px;text-decoration:none}
.ozd-intro p{color:var(--muted);max-width:70ch;margin:0 0 12px}
.ozd-intro a,.ozd-sec details a{color:var(--brass)}
"""


def product_pages(d):
    shell = open(PAGE, encoding='utf-8').read()
    shell = shell.replace('</style>\n<!--ozd:ld-->', PP_CSS + '</style>\n<!--ozd:ld-->', 1)
    os.makedirs(os.path.join(ROOT, 'ozdoba'), exist_ok=True)
    keep = set()
    titles = product_titles(d['items'])
    for i in d['items']:
        f = os.path.join(ROOT, 'ozdoba', i['slug'] + '.html'); keep.add(f)
        open(f, 'w', encoding='utf-8').write(chrome.apply(product_page(d, i, shell, d['items'], titles[i['id']]), 'ozdoba/' + i['slug'] + '.html'))
    for f in os.listdir(os.path.join(ROOT, 'ozdoba')):  # прибрати сторінки видалених товарів
        p = os.path.join(ROOT, 'ozdoba', f)
        if p not in keep and f.endswith('.html') and f != 'komplekty.html': os.remove(p)
    sm = os.path.join(ROOT, 'sitemap.xml'); s = open(sm, encoding='utf-8').read()
    s = re.sub(r'  <url><loc>https://cas-develop\.com/ozdoba/[^<]+</loc>.*?</url>\n', '', s)
    add = ''.join(f'  <url><loc>https://cas-develop.com/ozdoba/{i["slug"]}</loc><lastmod>{LASTMOD}</lastmod></url>\n' for i in d['items'])
    open(sm, 'w', encoding='utf-8').write(s.replace('</urlset>', add + '</urlset>'))
    return len(d['items'])



# ===================== сторінки категорій /ozdoba/kategoriia/<slug> =====================
CATS = {
    'Освітлення': ('osvitlennia', 'Освітлення для інтерʼєру: люстри, бра, торшери, споти', 'Люстри, підвісні світильники, бра, торшери, настільні лампи, трекові системи, LED-профілі й вуличне світло для квартир, ресторанів, готелів і офісів. Напряму з фабрик Китаю, під ваш дизайн-проєкт.'),
    'Меблі': ('mebli', 'Меблі для квартири, ресторану й офісу', 'Дивани, крісла, стільці, обідні й журнальні столи, ліжка, шафи, комоди, офісні меблі й стійки ресепшн. Меблі на замовлення й з фабрик Китаю — для житла й комерції.'),
    'Сантехніка': ('santekhnika', 'Сантехніка: унітази, ванни, раковини, змішувачі', 'Підвісні унітази й інсталяції, окремостоячі ванни, раковини з каменю й кераміки, душові системи, змішувачі, рушникосушки й аксесуари для ванної.'),
    'Оздоблення': ('ozdoblennia', 'Оздоблення: плитка, паркет, стінові панелі', 'Керамограніт, мозаїка, плитка, інженерна дошка «ялинка», SPC, рейкові й 3D-панелі, молдинги, рейкові стелі й акустичні панелі.'),
    'Двері': ('dveri', 'Двері: міжкімнатні, приховані, розсувні, вхідні', 'Міжкімнатні двері, приховані двері під фарбування, скляні перегородки й розсувні системи, вхідні двері й фурнітура.'),
    'Кухня': ('kukhnia', 'Кухня: мийки, змішувачі, витяжки, острови', 'Кухонні мийки з кварцу й сталі, змішувачі, острівні витяжки, кухонні острови, модульні кухні й системи зберігання.'),
    'Текстиль': ('tekstyl', 'Текстиль: килими, штори, пледи, подушки', 'Килими, штори, покривала, пледи, постільна білизна й декоративні подушки — фінальний шар інтерʼєру.'),
    'Декор': ('dekor', 'Декор для інтерʼєру: дзеркала, вази, рослини', 'Дзеркала, картини, скульптури, вази, кашпо й штучні рослини, свічники й годинники.'),
    'Сервіровка': ('servirovka', 'Сервіровка для ресторанів і дому', 'Тарілки, келихи, декантери, столові прибори й текстиль для сервірування.'),
    'Каміни': ('kaminy', 'Каміни: біокаміни й електрокаміни', 'Біокаміни, електрокаміни з паровим полумʼям і настільні каміни для квартир, ресторанів і готелів.'),
    'Тераса й сад': ('terasa-i-sad', 'Тераса й сад: вуличні меблі, перголи, парасолі', 'Вуличні дивани й крісла, шезлонги, столи для тераси, перголи, парасолі, кашпо й підвісні крісла.'),
}


CATX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'categories.json')
LINK = re.compile(r'\[([^\]]+)\]\((/[^)\s]*)\)')


def md(t):
    """Текст з categories.json → HTML: екранування + посилання [текст](/url) (лише внутрішні)."""
    return LINK.sub(lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', e(t))


def plain(t): return LINK.sub(lambda m: m.group(1), t)


def load_catx():
    x = json.load(open(CATX_PATH, encoding='utf-8'))
    for cat in CATS:
        c = x.get(cat)
        assert c, f'categories.json: немає тексту для категорії «{cat}»'
        assert len(c['title']) <= 60, f'{cat}: title {len(c["title"])} > 60'
        assert len(c['desc']) <= 160, f'{cat}: description {len(c["desc"])} > 160'
        n = len(plain(c['intro']).split())
        assert 80 <= n <= 150, f'{cat}: вступ {n} слів (треба 80–150)'
        assert 3 <= len(c['faq']) <= 4, f'{cat}: FAQ має бути 3–4 питання'
        assert all(r in CATS and r != cat for r in c.get('related', [])), f'{cat}: невідома сусідня категорія'
    return x


def category_pages(d):
    catx = load_catx()
    shell = open(PAGE, encoding='utf-8').read()
    shell = shell.replace('</style>\n<!--ozd:ld-->', PP_CSS + '</style>\n<!--ozd:ld-->', 1)
    os.makedirs(os.path.join(ROOT, 'ozdoba/kategoriia'), exist_ok=True)
    out = []
    present = {i['cat'] for i in d['items']}
    for cat, (slug, h1, lead) in CATS.items():
        items = [i for i in d['items'] if i['cat'] == cat]
        if not items: continue
        cx = catx[cat]
        u = f'https://cas-develop.com/ozdoba/kategoriia/{slug}'
        cards = ''.join(re.sub(r'<button[^>]*class="heart".*?</button>', '', card(d, x), flags=re.S)
                        .replace(f'onclick="openItem({x["id"]})"', f'onclick="location.href=\'/ozdoba/{x["slug"]}\'"') for x in items)
        near = [c for c in cx.get('related', []) if c in present]
        rest = [c for c in CATS if c != cat and c in present and c not in near]
        other = ''.join(f'<a href="/ozdoba/kategoriia/{CATS[c][0]}">{e(c)}</a>' for c in near + rest)
        title, desc = cx['title'], cx['desc']
        intro = ''.join(f'<p>{md(p)}</p>' for p in cx['intro'].split('\n\n'))
        faq = ''.join(f'<details><summary>{e(q)}</summary><p>{md(a)}</p></details>' for q, a in cx['faq'])
        ld = {'@context': 'https://schema.org', '@graph': [
            {'@type': 'CollectionPage', 'name': h1, 'url': u, 'description': desc},
            {'@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': plain(a)}} for q, a in cx['faq']]},
            {'@type': 'ItemList', 'numberOfItems': len(items), 'itemListElement': [
                {'@type': 'ListItem', 'position': n + 1, 'name': x['name'], 'url': f'https://cas-develop.com/ozdoba/{x["slug"]}'} for n, x in enumerate(items)]},
            {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Головна', 'item': 'https://cas-develop.com/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'Оздоба', 'item': 'https://cas-develop.com/ozdoba'},
                {'@type': 'ListItem', 'position': 3, 'name': cat, 'item': u}]}]}
        body = f'''<div class="w">
  <div class="crumbs"><a href="/">Головна</a> / <a href="/ozdoba">Оздоба</a> / {e(cat)}</div>
  <div class="ozd-hero"><h1>{e(h1)}</h1><p>{e(lead)}</p>
  <ul class="pts"><li>{len(items)} позицій</li><li>Напряму з фабрик Китаю</li><li>Замовлення від $500</li><li>Рахунок для ФОП і ТОВ</li><li>Доставка по Україні</li></ul></div>
</div>
<main class="grid">{cards}</main>
<section class="ozd-sec ozd-intro"><h2>{e(cat)} під замовлення: що входить і для кого</h2>{intro}</section>
<section class="ozd-sec"><h2>Як замовити</h2><p style="color:var(--muted);max-width:70ch">Додайте позиції в кошик у <a href="/ozdoba" style="color:var(--brass)">каталозі Оздоби</a> або надішліть список і креслення — менеджер підтвердить ціну, наявність і строк поставки. Мінімальне замовлення — $500 (≈ 23 000 ₴), позиції з різних категорій можна поєднувати. Комплектація квартири під ключ — <a href="/mebliuvannia-kvartyry-kyiv" style="color:var(--brass)">від $250 за м²</a>, обʼєкта — <a href="/komplektatsiia-pid-kliuch-kyiv" style="color:var(--brass)">комплектація під ключ</a>.</p></section>
<section class="ozd-sec"><h2>Питання та відповіді</h2>{faq}</section>
<section class="ozd-sec"><h2>Сусідні категорії</h2><div class="rel">{other}</div></section>
'''
        s = shell
        s = re.sub(r'<title>.*?</title>', f'<title>{e(title)}</title>', s, count=1)
        s = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + e(desc), s, count=1)
        s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, s, count=1)
        s = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + e(title), s, count=1)
        s = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + e(desc), s, count=1)
        s = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + u, s, count=1)
        s = re.sub(r'<link rel="preload" id="ozd-data"[^>]*>\n', '', s)
        s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>', s, count=1, flags=re.S)
        hdr = re.search(r'<button class="ico" id="btnSearch".*?<span class="badge" id="cartBadge" hidden>0</span></button>', s, flags=re.S)
        if hdr:
            cart_svg = re.search(r'aria-label="Кошик">(<svg.*?</svg>)', hdr.group(0), flags=re.S).group(1)
            s = s.replace(hdr.group(0), f'<a class="ico" href="/ozdoba" aria-label="Кошик">{cart_svg}</a>')
        a, b = s.index('<div class="searchwrap"'), s.index('<!--chrome:f-->')
        s = s[:a] + body + '\n' + s[b:]
        a, b = s.index('<div class="bar" id="bar">'), s.index('<!--ui-polish--><script>')
        s = s[:a] + s[b:]
        open(os.path.join(ROOT, 'ozdoba/kategoriia', slug + '.html'), 'w', encoding='utf-8').write(chrome.apply(s, f'ozdoba/kategoriia/{slug}.html'))
        out.append(u)
    sm = os.path.join(ROOT, 'sitemap.xml'); t = open(sm, encoding='utf-8').read()
    t = re.sub(r'  <url><loc>https://cas-develop\.com/ozdoba/kategoriia/[^<]+</loc>.*?</url>\n', '', t)
    t = t.replace('</urlset>', ''.join(f'  <url><loc>{x}</loc><lastmod>{LASTMOD}</lastmod></url>\n' for x in out) + '</urlset>')
    open(sm, 'w', encoding='utf-8').write(t)
    return len(out)


# ===================== комплекти під обʼєкт: секція на /ozdoba і сторінка /ozdoba/komplekty =====================
# Комплект = bundles[] з "premium": true у catalog.json. Ціна = сума (ціна позиції за замовчуванням × кількість) —
# так само рахує app.js (bundleTotal). Окремої знижки на комплект немає: діє загальна знижка за обсягом (volume_discounts),
# яку кошик (app.js) і сервер (functions/api/orders.js) рахують від суми товарів. «Додати весь комплект у кошик» на /ozdoba/komplekty веде на /ozdoba#kit-<id> (app.js додає позиції).
KITS_URL = f'{SITE}/ozdoba/komplekty'


def item_price(d, i):
    """Ціна позиції як у app.js price(i, 0, defS(i)): розмір за замовчуванням (множник 1) і перший колір."""
    if i.get('price') is None: return None
    ss = d['sizesets'].get(i['ss']) if i.get('ss') else None
    k = 1
    if ss: k = ss[next((n for n, x in enumerate(ss) if x[1] == 1), 0)][1]
    return r10(i['price'] * k * (1 + d['colorsets'][i['cs']][0][2]))


def vol_pct(d, total):
    """Знижка за обсягом, % — catalog.json volume_discounts [[поріг, грн, %], …] (як volPct в app.js і volumePct на сервері)."""
    return max([pc for t, pc in d.get('volume_discounts', []) if total >= t], default=0)


def vol_text(d):
    """«Знижка за обсягом: від $5 000 — 3%, …» (курс ≈ 46 ₴/$, як у підписах цін Оздоби)."""
    usd = lambda n: '$' + f'{round(n / 46 / 100) * 100:,}'.replace(',', ' ')
    return 'Знижка за обсягом: ' + ', '.join(f'від {usd(t)} — {pc}%' for t, pc in d.get('volume_discounts', []))


def kits(d):
    by = {i['id']: i for i in d['items']}
    out = []
    for b in d.get('bundles', []):
        if not b.get('premium'): continue
        rows = [(by[r['id']], r['q']) for r in b['rows']]
        total = sum((item_price(d, i) or 0) * q for i, q in rows)
        onreq = sum(1 for i, q in rows if item_price(d, i) is None)
        out.append((b, rows, total, onreq))
    return out


def kit_collage(rows):
    pics = [i for i, q in rows if i.get('img')][:4]
    return '<div class="kcol">' + ''.join(
        f'<img src="/{i["img"]}-400.webp" width="400" height="400" alt="{e(i["name"])}" loading="lazy" decoding="async">' for i in pics) + '</div>'


def kit_total(total, onreq, d=None):
    vp = vol_pct(d, total) if d else 0
    return (money(total) + (f' <small>+ {onreq} поз. за запитом</small>' if onreq else '')
            + (f' <small>· зі знижкою за обсягом −{vp}%: {money(total - int(total * vp / 100 + 0.5))}</small>' if vp else ''))


def kits_cards(d):
    """Картки комплектів для секції «Комплекти під обʼєкт» на /ozdoba."""
    out = []
    for b, rows, total, onreq in kits(d):
        out.append(f'<article class="kit" id="kit-{b["id"]}">{kit_collage(rows)}<div class="kb"><h3>{e(b["name"])}</h3>'
                   f'<p class="knote">{e(b["note"])}</p><p class="ksum">{len(rows)} позицій · <b>{kit_total(total, onreq, d)}</b></p>'
                   f'<div class="kbtn"><button type="button" class="btn" onclick="window.addKit&amp;&amp;addKit(\'{b["id"]}\')">Додати весь комплект у кошик</button>'
                   f'<a class="btn ghost" href="/ozdoba/komplekty?kit={b["id"]}#zayavka">Запит розрахунку під мій обʼєкт</a></div>'
                   f'<a class="kmore" href="/ozdoba/komplekty#k-{b["id"]}">Склад комплекту</a></div></article>')
    return ''.join(out)


KITS_TITLE = 'Комплектація ресторану, готелю й офісу з Китаю під ключ'
KITS_DESC = 'Готові комплекти меблів, світла й сантехніки з Китаю для ресторану, готелю, офісу й пентхауса: склад, ціни в гривнях, поставка 30–60 днів.'
KITS_FAQ = [
    ('Як порахована ціна комплекту?', 'Це сума позицій каталогу Оздоби: ціна кожної позиції × кількість. Знижка за обсягом рахується в кошику від усієї суми товарів. Ціни орієнтовні — остаточну вартість, наявність і строк менеджер підтверджує після заявки.'),
    ('Чи є знижка на комплект?', 'Так, діє знижка за обсягом на всю суму товарів, включно з комплектами: від $5 000 (≈ 230 000 ₴) — 3%, від $10 000 (≈ 460 000 ₴) — 5%, від $20 000 (≈ 920 000 ₴) — 7%. Кошик рахує її автоматично. Дизайнерам і архітекторам даємо особистий код партнера — знижки не сумуються, діє більша.'),
    ('Можна змінити склад або кількості?', 'Так. Комплект — це стартова специфікація: у кошику міняйте кількості, прибирайте позиції чи додавайте інші з каталогу. Під креслення або дизайн-проєкт порахуємо комплектацію саме вашого обʼєкта.'),
    ('Скільки чекати поставку?', 'Поставка з Китаю — 30–60 днів. Замовлення краще робити паралельно з ремонтом, щоб меблі й світло приїхали до фінішу робіт. Мінімальне замовлення — $500 (≈ 23 000 ₴), поштучно не продаємо.'),
    ('Працюєте з компаніями?', 'Так, виставляємо рахунок для ФОП і ТОВ із закривними документами; рахунки для компаній з ЄС — незабаром (у процесі підключення). Для готелів, ресторанів і офісів можемо взяти обʼєкт повністю — від дизайну й ремонту до розстановки меблів.'),
]


def kit_section(d, b, rows, total, onreq):
    def line(i, q):
        p = item_price(d, i)
        return (f'<tr><td><a href="/ozdoba/{i["slug"]}">{e(i["name"])}</a></td><td>{q} {e(i["unit"])}</td>'
                f'<td>{money(p) if p is not None else "за запитом"}</td><td>{money(p * q) if p is not None else "—"}</td></tr>')
    note = f' (без {onreq} поз. за запитом)' if onreq else ''
    return (f'<section class="ozd-sec kitp" id="k-{b["id"]}">\n  <h2>{e(b["name"])}</h2>\n'
            f'  <div class="kitp-top">{kit_collage(rows)}<div><p class="knote">{e(b["note"])}</p>\n'
            f'  <p class="ksum">{len(rows)} позицій · разом <b>{kit_total(total, onreq, d)}</b></p>\n'
            f'  <div class="kbtn"><a class="btn" href="/ozdoba#kit-{b["id"]}">Додати весь комплект у кошик</a>'
            f'<a class="btn ghost" href="?kit={b["id"]}#zayavka">Запит розрахунку під мій обʼєкт</a></div></div></div>\n'
            f'  <details class="ktbl"><summary>Склад комплекту: {len(rows)} позицій</summary><div class="tscroll"><table>'
            f'<thead><tr><th>Позиція</th><th>К-сть</th><th>Ціна</th><th>Сума</th></tr></thead><tbody>{"".join(line(i, q) for i, q in rows)}</tbody>'
            f'<tfoot><tr><td colspan="3">Разом{note}</td><td>{money(total)}</td></tr></tfoot></table></div></details>\n</section>')


KITS_BODY = '''<div class="w">
  <div class="crumbs"><a href="/">Головна</a> / <a href="/ozdoba">Оздоба</a> / Комплекти під обʼєкт</div>
  <div class="ozd-hero"><h1>Комплектація ресторану, готелю й офісу <em>під ключ</em></h1>
  <p>Готові комплекти з каталогу Оздоби під конкретний обʼєкт: ресторанний зал і тераса, лобі й номери готелю, офіс, салон краси, вітальня й спальня в приватному інтерʼєрі. Кожен комплект — стартова специфікація з цінами в гривнях: беріть як є, міняйте кількості або замовляйте розрахунок під свої креслення.</p>
  <ul class="pts"><li>{n} комплектів від {lo}</li><li>Ціна = сума позицій</li><li>Знижка за обсягом до 7%</li><li>Поставка 30–60 днів</li><li>Рахунок для ФОП і ТОВ</li><li>Мін. замовлення $500</li></ul>
  <p class="vol">{vol}.</p></div>
</div>
{sections}
<section class="ozd-sec ozd-intro"><h2>Як працює комплектація обʼєкта</h2>
  <p>Комплект — це не «набір з коробки», а перелік позицій, який ми уточнюємо під ваш обʼєкт: кількість посадкових місць, номерів чи робочих місць, кольори, розміри й оздоблення. Після заявки менеджер підтверджує ціни, наявність і строк поставки, а за потреби погоджуємо зразки тканин і оздоблень до замовлення.</p>
  <p>Якщо обʼєкт ще на стадії ремонту, вигідно вести все разом: <a href="/komplektatsiia-pid-kliuch-kyiv">комплектація під ключ</a> з однією специфікацією або <a href="/biznes-pid-kliuch-kyiv">бізнес під ключ</a> — від дизайну й ремонту до розстановки меблів. Для закладів харчування — <a href="/dyzain-restoranu-kafe-kyiv">дизайн ресторану й кафе</a>.</p></section>
<section class="ozd-sec"><h2>Питання та відповіді</h2>{faq}</section>
<section class="ozd-sec" id="zayavka">
  <h2>Запит розрахунку під мій обʼєкт</h2>
  <p style="color:var(--muted);max-width:70ch">Напишіть, який у вас обʼєкт і скільки місць, номерів чи метрів, — порахуємо комплектацію під ваш проєкт і назвемо строк поставки.</p>
  <form id="of" class="pp-form" data-form="ozdoba-kit" data-service="Оздоба — комплект під обʼєкт" data-source="cas-develop.com/ozdoba/komplekty" novalidate>
    <div class="field"><label for="oName">Імʼя</label><input id="oName" autocomplete="name"></div>
    <div class="field"><label for="oPhone">Телефон *</label><input id="oPhone" aria-describedby="oErr" type="tel" autocomplete="tel" placeholder="097 123 45 67"><div class="err" id="oErr" role="alert" style="color:#e07a6a;font-size:var(--fs-small);margin-top:6px"></div></div>
    <div class="field"><label for="oArea">Площа, місця або номери</label><input id="oArea" placeholder="напр. 120 м² або 40 місць"></div>
    <div class="field"><label for="oMsg">Обʼєкт і комплект</label><input id="oMsg" placeholder="Ресторан, готель, офіс; місто; бажаний строк"></div>
    <button class="btn" id="oBtn" type="submit">Надіслати запит</button>
  </form>
  <div class="ok" id="oOk" role="status" tabindex="-1" style="display:none"><h3>Запит отримано</h3><p style="color:var(--muted)">Менеджер звʼяжеться з вами в робочий час.</p></div>
</section>
<script>(function(){{var k=new URLSearchParams(location.search).get('kit'),m={names},f=document.getElementById('oMsg');if(k&&m[k]&&f&&!f.value)f.value='Комплект «'+m[k]+'»: ';}})();</script>
'''


def kits_page(d):
    ks = kits(d)
    if not ks: return 0
    shell = open(PAGE, encoding='utf-8').read()
    shell = shell.replace('</style>\n<!--ozd:ld-->', PP_CSS + '</style>\n<!--ozd:ld-->', 1)
    u = KITS_URL
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'CollectionPage', 'name': KITS_TITLE, 'url': u, 'description': KITS_DESC},
        {'@type': 'ItemList', 'name': 'Комплекти під обʼєкт — Оздоба', 'numberOfItems': len(ks), 'itemListElement': [
            {'@type': 'ListItem', 'position': n + 1, 'name': b['name'], 'url': f'{u}#k-{b["id"]}', 'description': b['note']} for n, (b, *_) in enumerate(ks)]},
        {'@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in KITS_FAQ]},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Головна', 'item': f'{SITE}/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Оздоба', 'item': f'{SITE}/ozdoba'},
            {'@type': 'ListItem', 'position': 3, 'name': 'Комплекти під обʼєкт', 'item': u}]}]}
    body = KITS_BODY.format(
        n=len(ks), lo=money(min(t for _, _, t, _ in ks)), vol=vol_text(d),
        sections='\n'.join(kit_section(d, *k) for k in ks),
        faq=''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in KITS_FAQ),
        names=json.dumps({b['id']: b['name'] for b, *_ in ks}, ensure_ascii=False))
    s = shell
    s = re.sub(r'<title>.*?</title>', f'<title>{e(KITS_TITLE)}</title>', s, count=1)
    s = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + e(KITS_DESC), s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + e(KITS_TITLE), s, count=1)
    s = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + e(KITS_DESC), s, count=1)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'<link rel="preload" id="ozd-data"[^>]*>\n', '', s)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>', s, count=1, flags=re.S)
    hdr = re.search(r'<button class="ico" id="btnSearch".*?<span class="badge" id="cartBadge" hidden>0</span></button>', s, flags=re.S)
    if hdr:
        cart_svg = re.search(r'aria-label="Кошик">(<svg.*?</svg>)', hdr.group(0), flags=re.S).group(1)
        acc = re.search(r'<a class="ico" id="accLink".*?</a>', hdr.group(0), flags=re.S)
        s = s.replace(hdr.group(0), (acc.group(0) + '\n  ' if acc else '') + f'<a class="ico" href="/ozdoba" aria-label="Кошик">{cart_svg}</a>')
    a, b = s.index('<div class="searchwrap"'), s.index('<!--chrome:f-->')
    s = s[:a] + body + '\n' + s[b:]
    a, b = s.index('<div class="bar" id="bar">'), s.index('<!--ui-polish--><script>')
    s = s[:a] + '<script src="/assets/lead-form.v1.js" defer></script>\n' + s[b:]
    s = s.replace('aria-current="page">Оздоба</a>', 'aria-current="true">Оздоба</a>')
    open(os.path.join(ROOT, 'ozdoba', 'komplekty.html'), 'w', encoding='utf-8').write(chrome.apply(s, 'ozdoba/komplekty.html'))
    sm = os.path.join(ROOT, 'sitemap.xml'); t = open(sm, encoding='utf-8').read()
    t = re.sub(r'  <url><loc>https://cas-develop\.com/ozdoba/komplekty</loc>.*?</url>\n', '', t)
    open(sm, 'w', encoding='utf-8').write(t.replace('</urlset>', f'  <url><loc>{u}</loc><lastmod>{LASTMOD}</lastmod></url>\n</urlset>'))
    return len(ks)


if __name__ == '__main__':
    main()
