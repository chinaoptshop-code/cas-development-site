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
            f'<div class="body"><div class="sub">{e(i["sub"])}</div><a class="nm" href="#p-{i["id"]}" style="color:inherit;text-decoration:none">{e(i["name"])}</a>'
            f'<div class="sw">{sw}</div><div class="pr">{frm}{money(min_price(d, i))} <small>/ {e(i["unit"])}</small></div></div></article>')


def main():
    d = json.load(open(CAT, encoding='utf-8'))
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
          'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'name': i['name'], 'url': f'https://cas-develop.com/ozdoba#p-{i["id"]}'}
                              for n, i in enumerate(items)]}
    ver = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]
    s = open(PAGE, encoding='utf-8').read()
    s = re.sub(r'<!--ozd:grid-->.*?<!--/ozd:grid-->', lambda m: '<!--ozd:grid-->' + grid + '<!--/ozd:grid-->', s, count=1, flags=re.S)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<!--ozd:ld--><script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script><!--/ozd:ld-->', s, count=1, flags=re.S)
    s = re.sub(r'/assets/ozdoba/catalog\.json\?v=\w+', '/assets/ozdoba/catalog.json?v=' + ver(CAT), s)
    s = re.sub(r'/assets/ozdoba/app\.js\?v=\w+', '/assets/ozdoba/app.js?v=' + ver(APP), s)
    s = re.sub(r'<span class="cnt" id="cnt">[^<]*</span>', f'<span class="cnt" id="cnt">{len(items)} позицій</span>', s, count=1)
    open(PAGE, 'w', encoding='utf-8').write(s)
    photos = sum(1 for i in d['items'] if i.get('img'))
    print(f'Оздоба: {len(items)} товарів, з фото {photos}, версія каталогу {ver(CAT)}')


if __name__ == '__main__':
    main()
