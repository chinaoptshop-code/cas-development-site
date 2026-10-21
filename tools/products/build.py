#!/usr/bin/env python3
"""Збирає сторінку Оздоби (/ozdoba) з каталогу assets/ozdoba/catalog.json.

  python3 tools/products/build.py

Що робить: вставляє в ozdoba.html статичні картки товарів (щоб каталог бачили Google і
користувачі ще до завантаження скрипта), розмітку ItemList для пошуку і нові версії ?v=
для catalog.json та app.js (кеш браузера оновиться одразу після деплою).
Фото товарів додає tools/products/photo.py.
"""
import hashlib, html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(ROOT, 'assets/ozdoba/catalog.json')
APP = os.path.join(ROOT, 'assets/ozdoba/app.js')
PAGE = os.path.join(ROOT, 'ozdoba.html')
S = '<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">{}</svg>'
e = lambda s: html.escape(str(s), quote=True)


def r10(n): return round(n / 10) * 10


def min_price(d, i):
    ss = d['sizesets'].get(i['ss']) if i.get('ss') else None
    if ss: return r10(i['price'] * min(k for _, k in ss))
    return r10(i['price'] * (1 + d['colorsets'][i['cs']][0][2]))


def money(n): return f'{round(n):,}'.replace(',', ' ') + ' ₴'


def pic(d, i):
    b = i.get('img')
    if b:
        return (f'<img src="/{b}-400.webp" srcset="/{b}-400.webp 400w, /{b}-800.webp 800w" sizes="(min-width:900px) 240px, 46vw" '
                f'width="400" height="400" alt="{e(i["name"])}" loading="lazy" decoding="async">')
    return S.format(d['art'].get(i['art'], '<rect x="20" y="20" width="60" height="42" rx="5"/>'))


def card(d, i):
    frm = 'від ' if i.get('ss') else ''
    sw = ''.join(f'<i style="background:{c[1]}"></i>' for c in d['colorsets'][i['cs']][:5])
    heart = (f'<button class="heart" data-fav="{i["id"]}" onclick="event.stopPropagation();toggleFav({i["id"]})" aria-label="В обране">'
             '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg></button>')
    return (f'<article class="card" onclick="openItem({i["id"]})"><div class="tile{" ph" if i.get("img") else ""}">{pic(d, i)}{heart}</div>'
            f'<div class="body"><div class="sub">{e(i["sub"])}</div><a class="nm" href="/ozdoba/{i["slug"]}" onclick="if(window.openItem)event.preventDefault()" style="color:inherit;text-decoration:none">{e(i["name"])}</a>'
            f'<div class="sw">{sw}</div><div class="pr">{frm}{money(min_price(d, i))} <small>/ {e(i["unit"])}</small></div></div></article>')


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
    items = sorted(d['items'], key=lambda i: (order.get(i['prio'], 3), -min_price(d, i)))
    grid = ''.join(card(d, i) for i in items)
    ld = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': 'Оздоба — каталог меблів, світла й декору',
          'numberOfItems': len(items),
          'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'name': i['name'], 'url': f'https://cas-develop.com/ozdoba/{i["slug"]}'}
                              for n, i in enumerate(items)]}
    ver = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]
    s = open(PAGE, encoding='utf-8').read()
    s = re.sub(r'<!--ozd:grid-->.*?<!--/ozd:grid-->', lambda m: '<!--ozd:grid-->' + grid + '<!--/ozd:grid-->', s, count=1, flags=re.S)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<!--ozd:ld--><script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script><!--/ozd:ld-->', s, count=1, flags=re.S)
    s = re.sub(r'/assets/ozdoba/catalog\.json\?v=\w+', '/assets/ozdoba/catalog.json?v=' + ver(CAT), s)
    s = re.sub(r'/assets/ozdoba/app\.js\?v=\w+', '/assets/ozdoba/app.js?v=' + ver(APP), s)
    s = re.sub(r'<span class="cnt" id="cnt">[^<]*</span>', f'<span class="cnt" id="cnt">{len(items)} позицій</span>', s, count=1)
    open(PAGE, 'w', encoding='utf-8').write(s)
    pages = product_pages(d)
    photos = sum(1 for i in d['items'] if i.get('img'))
    print(f'Оздоба: {len(items)} товарів, з фото {photos}, сторінок товарів {pages}, версія каталогу {ver(CAT)}')



# ===================== сторінки товарів /ozdoba/<slug> =====================
TR = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюя', ['a', 'b', 'v', 'h', 'g', 'd', 'e', 'ie', 'zh', 'z', 'y', 'i', 'i', 'i', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'iu', 'ia']))
VENUE = {'apt': 'квартира', 'resto': 'ресторан і бар', 'hotel': 'готель', 'office': 'офіс', 'shop': 'магазин і шоурум',
         'cafe': 'кафе і кавʼярня', 'beauty': 'салон краси', 'spa': 'SPA і велнес'}


def slugify(name, iid):
    s = ''.join(TR.get(c, c) for c in name.lower().replace('ʼ', '').replace("'", ''))
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return '-'.join(s.split('-')[:6]) + f'-{iid}'


def product_page(d, i, shell, items):
    u = f'https://cas-develop.com/ozdoba/{i["slug"]}'
    mp = min_price(d, i)
    frm = 'від ' if i.get('ss') else ''
    img = i.get('img')
    hero = (f'<img src="/{img}-800.webp" width="800" height="800" alt="{e(i["name"])}" fetchpriority="high">' if img
            else S.format(d['art'].get(i['art'], '')))
    gal = ''.join(f'<img src="/{b}-400.webp" width="400" height="400" alt="{e(i["name"])} — фото {n + 2}" loading="lazy">' for n, b in enumerate(i.get('imgs') or []))
    colors = d['colorsets'][i['cs']]
    sizes = d['sizesets'].get(i['ss']) if i.get('ss') else None
    specs = list(i.get('specs') or [])
    rows = [('Категорія', i['sub']), ('Кольори й фактури', ', '.join(c[0] for c in colors))]
    if sizes: rows.append(('Розміри', ', '.join(s[0] for s in sizes)))
    rows += [(k, v) for k, v in specs] + [('Одиниця', i['unit']), ('Поставка', '35–50 днів'), ('Підходить для', ', '.join(VENUE[v] for v in i['vn'] if v in VENUE))]
    rel = [x for x in items if x['cat'] == i['cat'] and x['id'] != i['id']][:4]
    rel_html = ''.join(re.sub(r'<button class="heart".*?</button>', '', card(d, x), flags=re.S)
                       .replace(f'onclick="openItem({x["id"]})"', f'onclick="location.href=\'/ozdoba/{x["slug"]}\'"') for x in rel)
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Product', 'name': i['name'], 'description': i['desc'], 'category': i['sub'], 'url': u,
         'image': f'https://cas-develop.com/{img}-800.webp' if img else 'https://cas-develop.com/img/og-cas.jpg',
         'brand': {'@type': 'Brand', 'name': 'Оздоба · CAS Development'},
         'offers': {'@type': 'Offer', 'price': mp, 'priceCurrency': 'UAH', 'availability': 'https://schema.org/PreOrder',
                    'url': u, 'seller': {'@id': 'https://cas-develop.com/#business'}}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Головна', 'item': 'https://cas-develop.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Оздоба', 'item': 'https://cas-develop.com/ozdoba'},
            {'@type': 'ListItem', 'position': 3, 'name': i['name'], 'item': u}]}]}
    title = f'{i["name"]} — {frm}{money(mp)} | Оздоба CAS Development'
    desc = f'{i["desc"]} {i["sub"]}, {frm}{money(mp)} за {i["unit"]}. Поставка з Китаю 35–50 днів, доставка по Україні.'
    body = f'''<div class="w">
  <div class="crumbs"><a href="/">Головна</a> / <a href="/ozdoba">Оздоба</a> / {e(i["name"])}</div>
  <article class="pp">
    <div class="pp-media"><div class="hero-art{" ph" if img else ""} pp-hero">{hero}</div>{f'<div class="pp-gal">{gal}</div>' if gal else ''}</div>
    <div class="pp-info">
      <p class="sub">{e(i["sub"])}</p>
      <h1>{e(i["name"])}</h1>
      <p class="pp-price">{frm}{money(mp)} <small>/ {e(i["unit"])}</small></p>
      <p class="desc">{e(i["desc"])}</p>
      <div class="sw pp-sw">{''.join(f'<i style="background:{c[1]}" title="{e(c[0])}"></i>' for c in colors)}</div>
      <p class="pp-btns"><a class="btn" href="/ozdoba#p-{i["id"]}">Обрати колір і додати в кошик</a><a class="btn ghost" href="#zayavka">Запитати ціну й наявність</a></p>
      <dl class="specs">{''.join(f'<dt>{e(k)}</dt><dd>{e(v)}</dd>' for k, v in rows)}</dl>
      <p class="note-honest">Ціна орієнтовна: остаточну вартість, наявність і строк менеджер підтверджує після заявки. Рахунок для ФОП і ТОВ.</p>
    </div>
  </article>
</div>
<section class="ozd-sec" id="zayavka">
  <h2>Запитати ціну й наявність</h2>
  <form id="of" class="pp-form" data-form="ozdoba-product" data-service="Оздоба — {e(i["name"])}" data-source="cas-develop.com/ozdoba/{i["slug"]}" novalidate>
    <div class="field"><label for="oName">Імʼя</label><input id="oName" autocomplete="name"></div>
    <div class="field"><label for="oPhone">Телефон *</label><input id="oPhone" type="tel" autocomplete="tel" placeholder="097 123 45 67"><div class="err" id="oErr" style="color:#e08a7a;font-size:var(--fs-small);margin-top:6px"></div></div>
    <div class="field"><label for="oArea">Кількість</label><input id="oArea" inputmode="numeric" placeholder="напр. 6"></div>
    <div class="field"><label for="oMsg">Коментар</label><input id="oMsg" placeholder="Колір, розмір, обʼєкт, терміни"></div>
    <button class="btn" id="oBtn" type="submit">Надіслати запит</button>
  </form>
  <div class="ok" id="oOk" style="display:none"><h3>Запит отримано</h3><p style="color:var(--muted)">Менеджер звʼяжеться з вами в робочий час.</p></div>
</section>
{f'<section class="ozd-sec"><h2>Схожі позиції</h2><div class="grid pp-rel">{rel_html}</div><p style="margin-top:16px"><a class="btn ghost" style="display:inline-block;width:auto;padding:13px 22px" href="/ozdoba">Увесь каталог Оздоби</a></p></section>' if rel else ''}
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
    s = re.sub(r'<button class="ico" id="btnSearch".*?</button>\n  <button class="ico" onclick="setTab\(\'fav\'\)".*?</button>\n  <button class="ico" onclick="openCart\(\)"', '<a class="ico" href="/ozdoba" aria-label="Кошик"', s, count=1, flags=re.S)
    s = s.replace('<span class="badge" id="cartBadge" hidden>0</span></button>', '</a>', 1)
    a, b = s.index('<div class="searchwrap"'), s.index('<footer>')
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
"""


def product_pages(d):
    shell = open(PAGE, encoding='utf-8').read()
    shell = shell.replace('</style>\n<!--ozd:ld-->', PP_CSS + '</style>\n<!--ozd:ld-->', 1)
    os.makedirs(os.path.join(ROOT, 'ozdoba'), exist_ok=True)
    keep = set()
    for i in d['items']:
        f = os.path.join(ROOT, 'ozdoba', i['slug'] + '.html'); keep.add(f)
        open(f, 'w', encoding='utf-8').write(product_page(d, i, shell, d['items']))
    for f in os.listdir(os.path.join(ROOT, 'ozdoba')):  # прибрати сторінки видалених товарів
        p = os.path.join(ROOT, 'ozdoba', f)
        if p not in keep and f.endswith('.html'): os.remove(p)
    sm = os.path.join(ROOT, 'sitemap.xml'); s = open(sm, encoding='utf-8').read()
    s = re.sub(r'  <url><loc>https://cas-develop\.com/ozdoba/[^<]+</loc>.*?</url>\n', '', s)
    add = ''.join(f'  <url><loc>https://cas-develop.com/ozdoba/{i["slug"]}</loc></url>\n' for i in d['items'])
    open(sm, 'w', encoding='utf-8').write(s.replace('</urlset>', add + '</urlset>'))
    return len(d['items'])


if __name__ == '__main__':
    main()
