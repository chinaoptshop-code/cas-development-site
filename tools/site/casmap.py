#!/usr/bin/env python3
"""Карти сайту (блок UI-kit «Карта», /styleguide/#map): «Карта проєктів» у /portfolio і карта офісу в контактах.

  python3 tools/site/casmap.py             # вставити/оновити блоки в ручних сторінках (portfolio.html, contact.html)
  python3 tools/site/casmap.py --check     # лише перевірка (код 1, якщо блоки застарілі)
  python3 tools/site/casmap.py --posters   # перезняти статичні постери img/map/*.webp (Playwright + мережа; лише локально)

Лендинги контактів інших мов (tools/site/pages/*-contact*.json) мають секцію {"t": "map"} — її рендерить landing.py через office_html().
Логіка — /assets/cas-map.v1.js (MapLibre GL JS 5.24.0, BSD-3, self-hosted у /assets/vendor/, вантажиться ліниво),
стилі — /assets/cas-map.v1.css. Тайли — OpenFreeMap (без ключа, комерційне використання дозволене; атрибуція
«OpenFreeMap © OpenMapTiles Data from OpenStreetMap» — показує карта). Без JS/WebGL — постер (img/map/) і звичайні посилання.

Правила для точок проєктів: лише центр міста/регіону, відомий з тексту сторінки проєкту, — точних адрес клієнтів не показуємо;
«Реалізовано» — лише Tetris Hall, Dolls Salon, Office Chicago (решта — «Дизайн-проєкт»). Проєкти без відомої локації на карту не ставимо.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
e = html.escape

OFFICE = dict(lat=50.4335971, lng=30.5131241, z=16, cid='https://maps.google.com/?cid=15015666645432112566')
ROUTE = f'https://www.google.com/maps/dir/?api=1&amp;destination={OFFICE["lat"]}%2C{OFFICE["lng"]}'
REALIZED = {'tetris-hall', 'dolls-salon', 'office-chicago'}

# slug, назва, місце (як на сторінці проєкту), [lng, lat] — центр міста/регіону (у Києві — розведені на ~1 км, щоб кластер розкривався),
# zoom для flyTo (місто — 11, регіон — 7, країна — 4), фото для попапу
PROJECTS = [
    ('linden-penthouse', 'Linden Penthouse', 'Київ', (30.5320, 50.4470), 11, '/img/p/1MslU7S5X8gIEp-400.webp'),
    ('hodos-villa', 'Hodos Villa', 'Київ', (30.5050, 50.4580), 11, '/img/p/1Grj8_m7MJwsbE-400.webp'),
    ('office-chicago', 'Office Chicago', 'ЖК Chicago, Київ', (30.5160, 50.4380), 11, '/img/p/16fKqdFifd2emf-400.webp'),
    ('petrivtsi-house', 'Petrivtsi House', 'Петрівці, Київська обл.', (30.4400, 50.6100), 10, '/img/p/1NVeaQcV2TZSN5-400.webp'),
    ('pidgirland', 'Pidgirland', 'Київська обл.', (30.3000, 50.3000), 8, '/img/p/1FiLI9kKE-C87h-400.webp'),
    ('hoda-estate', 'Hoda Estate', 'Карпати', (24.4000, 48.4000), 7, '/img/p/1FRa0FI6iMHK5L-400.webp'),
    ('kitana-beach', 'Kitana Beach', 'Бодрум, Туреччина', (27.4292, 37.0383), 9, '/img/p/1A9yy4nI-gf9h3-400.webp'),
    ('dubai-villa', 'Dubai Villa', 'Дубай, ОАЕ', (55.2708, 25.2048), 9, '/img/p/1uBxYPk7W36Rp0-400.webp'),
    ('usa-house', 'USA House', 'США', (-98.5800, 39.8300), 4, '/img/p/18V9n96tOhjKjh-400.webp'),
]

PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/></svg>'

# тексти блоку офісу за мовами (адреса — з картки «Офіс» сторінки контактів)
T = {
    'uk': dict(h2='Як нас знайти', addr='Київ, вул. Антоновича, 44', route='Маршрут', open='Відкрити в Google Maps', go='Інтерактивна карта',
               alt='Карта: офіс CAS Development — Київ, вул. Антоновича, 44'),
    'ru': dict(h2='Как нас найти', addr='Киев, ул. Антоновича, 44', route='Маршрут', open='Открыть в Google Maps', go='Интерактивная карта',
               alt='Карта: офис CAS Development — Киев, ул. Антоновича, 44'),
    'en': dict(h2='How to find us', addr='44 Antonovycha St., Kyiv, Ukraine', route='Directions', open='Open in Google Maps', go='Interactive map',
               alt='Map: CAS Development office, 44 Antonovycha St., Kyiv'),
    'es': dict(h2='Cómo llegar', addr='Calle Antonovycha 44, Kiev, Ucrania', route='Cómo llegar', open='Abrir en Google Maps', go='Mapa interactivo',
               alt='Mapa: oficina de CAS Development, calle Antonovycha 44, Kiev'),
    'zh': dict(h2='如何找到我们', addr='乌克兰基辅 Antonovycha 街 44 号', route='路线', open='在 Google 地图中打开', go='互动地图',
               alt='地图：CAS Development 办公室，基辅 Antonovycha 街 44 号'),
    'pl': dict(h2='Jak do nas trafić', addr='ul. Antonowycza 44, Kijów, Ukraina', route='Trasa', open='Otwórz w Google Maps', go='Mapa interaktywna',
               alt='Mapa: biuro CAS Development, ul. Antonowycza 44, Kijów'),
    'de': dict(h2='So finden Sie uns', addr='Antonowytscha-Str. 44, Kyjiw, Ukraine', route='Route', open='In Google Maps öffnen', go='Interaktive Karte',
               alt='Karte: Büro von CAS Development, Antonowytscha-Str. 44, Kyjiw'),
    'fr': dict(h2='Comment nous trouver', addr='44, rue Antonovytcha, Kyiv, Ukraine', route='Itinéraire', open='Ouvrir dans Google Maps', go='Carte interactive',
               alt='Carte : bureau de CAS Development, 44 rue Antonovytcha, Kyiv'),
    'ar': dict(h2='كيف تصل إلينا', addr='شارع أنتونوفيتشا 44، كييف، أوكرانيا', route='الاتجاهات', open='فتح في خرائط Google', go='خريطة تفاعلية',
               alt='خريطة: مكتب CAS Development، شارع أنتونوفيتشا 44، كييف'),
}


def office_map(lang, sizes='(max-width:767px) 100vw, 640px'):
    """Сама карта офісу (постер + кнопка «Інтерактивна карта») і кнопки «Маршрут» / Google Maps. Вантажиться по кліку."""
    t = T[lang]
    return (f'<div class="cmap" data-cas-map="office" data-load="click" data-lang="{lang}" data-ll="{OFFICE["lng"]},{OFFICE["lat"]}" data-z="{OFFICE["z"]}" '
            f'data-title="CAS Development" data-addr="{e(t["addr"])}" data-route="{ROUTE}" data-route-t="{e(t["route"])} →">'
            f'<img class="cmap-poster" src="/img/map/office-800.webp" srcset="/img/map/office-800.webp 800w, /img/map/office-1280.webp 1280w" sizes="{sizes}" '
            f'width="800" height="600" loading="lazy" decoding="async" alt="{e(t["alt"])}">'
            f'<button type="button" class="cmap-go" hidden>{e(t["go"])}</button></div>'
            f'<div class="cmap-acts"><a class="main" href="{ROUTE}" target="_blank" rel="noopener">{e(t["route"])}</a>'
            f'<a href="{OFFICE["cid"]}" target="_blank" rel="noopener">{e(t["open"])}</a></div>')


def office_html(lang, h2=None):
    """Секція лендингу (landing.py, {"t": "map"}): заголовок, адреса, карта."""
    t = T[lang]
    return (f'<section id="karta"><div class="w"><h2>{e(h2 or t["h2"])}</h2><p>{e(t["addr"])}</p>'
            + office_map(lang, '(max-width:1180px) 100vw, 1100px') + '</div></section>\n')


def projects_html():
    li = []
    for slug, name, place, (lng, lat), z, img in PROJECTS:
        ok = slug in REALIZED
        st = 'Реалізовано' if ok else 'Дизайн-проєкт'
        li.append(f'<li><a href="/proekty/{slug}" data-ll="{lng},{lat}" data-z="{z}" data-img="{img}" data-st="{st}" data-place="{e(place)}"'
                  + (' data-ok' if ok else '') + f'><b>{e(name)}</b><span>{e(place)} · {st}</span></a>'
                  f'<button type="button" class="cmap-fly" hidden aria-label="Показати на карті: {e(name)}">{PIN}</button></li>')
    return ('<section class="pmap" id="karta" aria-labelledby="pmap-h"><div class="lbl">Географія</div>'
            '<h2 class="pmap-h" id="pmap-h">Карта проєктів</h2>'
            '<p class="pmap-sub">Київ, Київщина, Карпати, Бодрум, Дубай і США. Натисніть на точку або на значок поруч із проєктом у списку — карта покаже місто, '
            'а в картці буде фото й посилання на сторінку проєкту.</p>'
            '<div class="pmap-grid"><div class="cmap" data-cas-map="projects" data-load="visible" data-lang="uk" data-list="pmap-list" data-more="Сторінка проєкту →">'
            '<picture><source media="(max-width:899px)" srcset="/img/map/projects-sq.webp" width="800" height="800">'
            '<img class="cmap-poster" src="/img/map/projects-1280.webp" width="1280" height="800" loading="lazy" decoding="async" '
            'alt="Карта проєктів CAS Development: Київ і Київщина, Карпати, Бодрум (Туреччина), Дубай (ОАЕ), США"></picture></div>'
            '<ul class="cmap-list" id="pmap-list" aria-label="Проєкти на карті">' + ''.join(li) + '</ul></div>'
            '<p class="pmap-note">На карті — центр міста або регіону; точних адрес приватних обʼєктів не показуємо. '
            'Інші проєкти — у списку вище.</p></section>')


CSS = '<link rel="stylesheet" href="/assets/cas-map.v1.css">'
JS = '<script src="/assets/cas-map.v1.js" defer></script>'


CSS_LAZY = ('<link rel="stylesheet" href="/assets/cas-map.v1.css" media="print" onload="this.media=\'all\'">'
            '<noscript><link rel="stylesheet" href="/assets/cas-map.v1.css"></noscript>')


def assets(s, lazy=False):
    """Підключає стилі (у <head>) і скрипт (перед </body>) блоку карти, якщо їх ще немає.
    lazy=True — стилі не блокують рендер (карта далеко внизу сторінки, як у /portfolio): мінус один RTT до LCP."""
    if 'href="/assets/cas-map.v1.css' not in s:
        s = s.replace('</head>', (CSS_LAZY if lazy else CSS) + '\n</head>', 1)
    if 'src="/assets/cas-map.v1.js' not in s:
        s = s.replace('</body>', JS + '\n</body>', 1)
    return s


def block(s, name, inner, anchor_rx=None):
    """Замінює вміст між <!--cas:NAME--> і <!--/cas:NAME--> або вставляє блок після anchor_rx."""
    tag = f'<!--cas:{name}-->{inner}<!--/cas:{name}-->'
    rx = re.compile(rf'<!--cas:{name}-->.*?<!--/cas:{name}-->', re.S)
    if rx.search(s):
        return rx.sub(lambda m: tag, s, count=1)
    m = re.search(anchor_rx, s, re.S)
    assert m, f'не знайдено місце для блоку {name}'
    return s[:m.start()] + tag + s[m.start():] if anchor_rx.startswith('(?=') else s[:m.end()] + tag + s[m.end():]


def manual():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import chrome  # шапка/футер, ?v= і нерозривні пробіли — щоб результат збігався з chrome.py --check
    out = {}
    f = os.path.join(ROOT, 'portfolio.html'); s = open(f, encoding='utf-8').read()
    s = block(s, 'map', projects_html(), r'</div><!-- /pfRowsWrap -->\n')
    s = block(s, 'mapchip', '<a class="filt" href="#karta">Карта проєктів</a>', r'<button class="filt on" onclick="filt\(this,\'all\'\)">Всі проєкти</button>\n')
    s = re.sub(r'<link rel="stylesheet" href="/assets/cas-map\.v1\.css[^"]*">\n', '', s)  # блокуючий варіант → неблокуючий
    out['portfolio.html'] = chrome.apply(assets(s, lazy=True), 'portfolio.html')
    f = os.path.join(ROOT, 'contact.html'); s = open(f, encoding='utf-8').read()
    # стара вставка Google Maps (iframe: ~0,5 МБ стороннього JS і Google Fonts одразу при завантаженні) → власна карта з постером, що вантажиться по кліку
    s = re.sub(r'<div class="ct-map"[^>]*>\s*<iframe[^>]*></iframe>\s*</div>', '<div class="ct-map" style="margin-top:18px"><!--cas:map--><!--/cas:map--></div>', s)
    s = block(s, 'map', office_map('uk', '(max-width:767px) 100vw, 400px'), None)
    out['contact.html'] = chrome.apply(assets(s), 'contact.html')
    return out


def posters():
    """Знімає постери з живої карти (тимчасова сторінка + локальний сервер + Playwright). Атрибуція (OpenFreeMap © OpenMapTiles,
    дані © OpenStreetMap) лишається розгорнутою на знімку — так вимагає ліцензія ODbL/OpenFreeMap."""
    import http.server, threading, functools
    from playwright.sync_api import sync_playwright
    from PIL import Image
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    os.makedirs(os.path.join(ROOT, 'img/map'), exist_ok=True)
    tmp_html = os.path.join(ROOT, 'img/map/_poster.html')
    shots = [('projects', 1280, 800, 'projects-1280'), ('projects', 800, 800, 'projects-sq'),
             ('office', 1280, 960, 'office-1280'), ('office', 800, 600, 'office-800')]
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for kind, w, h, name in shots:
            body = projects_html() if kind == 'projects' else office_map('uk')
            open(tmp_html, 'w', encoding='utf-8').write(
                f'<!doctype html><html lang="uk"><head><meta charset="utf-8">{CSS}<style>body{{margin:0;background:#0d0c0b}}'
                f'.cmap{{position:fixed!important;left:0;top:0;width:{w}px;height:{h}px;aspect-ratio:auto!important;max-height:none!important;border:0!important;border-radius:0!important}}'
                '.cmap-poster,.cmap-go,.maplibregl-ctrl-top-right,.cmap-acts,.pmap>:not(.pmap-grid),.cmap-list{display:none!important}'
                '.maplibregl-ctrl-attrib-inner{display:block!important}.maplibregl-ctrl-attrib-button{display:none!important}'
                '.maplibregl-ctrl-attrib.maplibregl-compact{padding:2px 8px!important;border-radius:3px 0 0 0!important;margin:0!important}'
                f'</style></head><body>{body}{JS}</body></html>')
            pg = b.new_page(viewport={'width': w, 'height': h}, reduced_motion='reduce')
            pg.goto(f'http://127.0.0.1:{port}/img/map/_poster.html', wait_until='load')
            if kind == 'office':
                pg.evaluate("document.querySelector('.cmap-go').click()")
            pg.wait_for_selector('.cmap.cmap-ready', timeout=60000)
            pg.wait_for_timeout(7000)
            png = os.path.join(ROOT, f'img/map/{name}.png')
            pg.screenshot(path=png, clip={'x': 0, 'y': 0, 'width': w, 'height': h})
            Image.open(png).convert('RGB').save(os.path.join(ROOT, f'img/map/{name}.webp'), 'WEBP', quality=74, method=6)
            os.remove(png)
            print('✓ img/map/' + name + '.webp')
            pg.close()
        b.close()
    os.remove(tmp_html)
    srv.shutdown()


if __name__ == '__main__':
    if '--posters' in sys.argv:
        posters(); sys.exit(0)
    stale = []
    for rel, s in manual().items():
        f = os.path.join(ROOT, rel)
        if open(f, encoding='utf-8').read() != s:
            stale.append(rel)
            if '--check' not in sys.argv:
                open(f, 'w', encoding='utf-8').write(s)
    if '--check' in sys.argv:
        print('Карти: застарілі ' + ', '.join(stale) if stale else 'Карти: OK'); sys.exit(1 if stale else 0)
    print('✓ карти: ' + (', '.join(stale) if stale else 'без змін'))
