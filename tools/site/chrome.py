#!/usr/bin/env python3
"""Єдина шапка й футер сайту (site chrome) для всіх публічних сторінок.

  python3 tools/site/chrome.py            # оновити шапку/футер на всіх сторінках
  python3 tools/site/chrome.py file ...   # лише вказані файли (шляхи від кореня сайту)
  python3 tools/site/chrome.py --check    # лише перевірка: де шапка/футер застарілі (код 1)

Розмітка шапки — між <!--chrome:h--> і <!--/chrome:h-->, футера — між <!--chrome:f--> і <!--/chrome:f-->.
Стилі — /assets/site-chrome.v1.css, бургер — /assets/site-chrome.v1.js. Генератори (landing.py, blog/build.py,
products/build.py, shop/pages.py, gen-landing.py) викликають apply() перед записом сторінки, тож руками
шапку/футер не правимо — лише тут.

Мова сторінки — з <html lang>, перемикач мови веде на hreflang-пару (якщо є) або на головну мови.
Іконки Оздоби/кабінету (пошук, обране, #accLink, кошик) зберігаються в слоті .sch-tools — їх обслуговує app.js.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'
CSS_TAG = '<link rel="stylesheet" href="/assets/site-chrome.v1.css">'
JS_TAG = '<script src="/assets/site-chrome.v1.js" defer></script>'
PHONE, PHONE_TXT = '+380978667755', '+380 97 866 77 55'
# сторінки, яких не чіпаємо: сторонні юридичні шаблони англійською (власна шапка з H1), верифікація Google
SKIP = {'privacy.html', 'terms.html'}

HOME = {'uk': '/', 'ru': '/ru/', 'en': '/en/', 'es': '/es/'}
LANG_CODE = {'uk': 'UA', 'ru': 'RU', 'en': 'EN', 'es': 'ES'}
LANG_NAME = {'uk': 'Українська', 'ru': 'Русский', 'en': 'English', 'es': 'Español'}
# у шапці: для uk/ru — UA/RU, для en/es — EN/ES/UA
SWITCH = {'uk': ['uk', 'ru'], 'ru': ['uk', 'ru'], 'en': ['en', 'es', 'uk'], 'es': ['en', 'es', 'uk']}
MSG = [('telegram', 'Telegram', 'https://t.me/+380978667755'), ('viber', 'Viber', 'viber://chat?number=%2B380978667755'),
       ('whatsapp', 'WhatsApp', 'https://wa.me/380978667755'), ('instagram', 'Instagram', 'https://www.instagram.com/cas_development/')]
BRAND_IMG = {'instagram': '/assets/brand/instagram-96.png'}  # решта — /assets/brand/<name>.svg

T = {
    'uk': dict(
        nav=[('/services', 'Послуги'), ('/portfolio', 'Портфоліо'), ('/ozdoba', 'Оздоба'), ('/blog', 'Блог'),
             ('/about', 'Про студію'), ('/contact', 'Контакти')],
        nav_label='Головне меню', menu='Меню', skip='Перейти до змісту', menu_open='Відкрити меню', menu_close='Закрити меню', lang_label='Мова сайту',
        cta='Заявка', cta_href='/contact#cForm', home_label='CAS Development — на головну',
        tagline='Студія дизайну інтерʼєру, ремонту й будівництва під ключ. Київ, з 2016 року.',
        contacts='Контакти', address='вул. Антоновича, 44, Київ', msg='Месенджери', lang='Мова',
        privacy=('/konfidentsiinist', 'Політика конфіденційності'), copy='© 2026 CAS Development · Київ, Україна',
        svc='Усі послуги студії', svc_label='Послуги студії',
        groups=[
            ('Ремонт', [('/remont-kvartyr-kyiv', 'Ремонт квартир'), ('/remont-pid-klyuch-kyiv', 'Ремонт під ключ'),
                        ('/remont-novobudovy-kyiv', 'Ремонт у новобудові'), ('/remontna-bryhada-kyiv', 'Ремонтна бригада'),
                        ('/remont-vannoi-kimnaty-kyiv', 'Ремонт ванної'), ('/remont-kukhni-kyiv', 'Ремонт кухні'),
                        ('/remont-ofisu-pid-klyuch-kyiv', 'Ремонт офісу'), ('/remont-komertsiinykh-prymishchen-kyiv', 'Комерційні приміщення')]),
            ('Дизайн', [('/dyzain-interieru-kyiv', 'Дизайн інтерʼєру'), ('/dyzain-interieru-kvartyry-kyiv', 'Дизайн квартири'),
                        ('/dyzainer-interieru-kyiv', 'Дизайнер інтерʼєру'), ('/realizatsiia-dyzain-proektu-kyiv', 'Реалізація дизайн-проєкту'),
                        ('/dyzain-restoranu-kafe-kyiv', 'Дизайн ресторану й кафе'), ('/landshaftnyi-dyzain-kyiv', 'Ландшафтний дизайн')]),
            ('Будинки', [('/budivnytstvo-budynkiv-kyiv', 'Будівництво будинків'), ('/proektuvannia-budynku-kyiv', 'Проєктування будинку'),
                         ('/remont-budynku-pid-klyuch-kyiv', 'Ремонт будинку'), ('/baza-vidpochynku-pid-klyuch', 'База відпочинку')]),
            ('Меблі й корисне', [('/mebliuvannia-kvartyry-kyiv', 'Меблювання під ключ'), ('/komplektatsiia-pid-kliuch-kyiv', 'Комплектація під ключ'),
                                 ('/ozdoba', 'Оздоба — меблі з Китаю'), ('/kalkuliator-remontu', 'Калькулятор вартості'),
                                 ('/pytannya', 'Часті питання'), ('/blog', 'Блог: ціни й поради')]),
        ]),
    'ru': dict(
        nav=[('/ru/', 'Услуги'), ('/portfolio', 'Портфолио'), ('/ozdoba', 'Оздоба'), ('/ru/blog', 'Блог'),
             ('/about', 'О студии'), ('/contact', 'Контакты')],
        nav_label='Главное меню', menu='Меню', skip='Перейти к содержанию', menu_open='Открыть меню', menu_close='Закрыть меню', lang_label='Язык сайта',
        cta='Заявка', cta_href='/ru/#zayavka', home_label='CAS Development — на главную',
        tagline='Студия дизайна интерьера, ремонта и строительства под ключ. Киев, с 2016 года.',
        contacts='Контакты', address='ул. Антоновича, 44, Киев', msg='Мессенджеры', lang='Язык',
        privacy=('/ru/konfidentsialnost', 'Политика конфиденциальности'), copy='© 2026 CAS Development · Киев, Украина',
        svc='Все услуги студии', svc_label='Услуги студии',
        groups=[
            ('Ремонт', [('/ru/remont-kvartir-kiev', 'Ремонт квартир'), ('/ru/remont-pod-klyuch-kiev', 'Ремонт под ключ'),
                        ('/ru/remont-v-novostroyke-kiev', 'Ремонт в новостройке'), ('/ru/remontnaya-brigada-kiev', 'Ремонтная бригада'),
                        ('/ru/remont-vannoy-kiev', 'Ремонт ванной'), ('/ru/remont-kuhni-kiev', 'Ремонт кухни'),
                        ('/ru/remont-ofisa-kiev', 'Ремонт офиса'), ('/ru/remont-kommercheskih-pomeshcheniy-kiev', 'Коммерческие помещения')]),
            ('Дизайн', [('/ru/dizayn-interera-kiev', 'Дизайн интерьера'), ('/ru/dizayn-kvartiry-kiev', 'Дизайн квартиры'),
                        ('/ru/dizayner-interera-kiev', 'Дизайнер интерьера'), ('/ru/realizatsiya-dizayn-proekta-kiev', 'Реализация дизайн-проекта'),
                        ('/ru/dizayn-restorana-kafe-kiev', 'Дизайн ресторана и кафе'), ('/ru/landshaftnyy-dizayn-kiev', 'Ландшафтный дизайн')]),
            ('Дома', [('/ru/stroitelstvo-domov-kiev', 'Строительство домов'), ('/ru/proektirovanie-doma-kiev', 'Проектирование дома'),
                      ('/ru/remont-doma-kiev', 'Ремонт дома'), ('/ru/baza-otdyha-pod-klyuch', 'База отдыха')]),
            ('Мебель и полезное', [('/ru/meblirovka-kvartiry-kiev', 'Меблировка под ключ'), ('/ru/komplektatsiya-pod-klyuch-kiev', 'Комплектация под ключ'),
                                   ('/ozdoba', 'Оздоба — мебель из Китая'), ('/ru/kalkulyator-remonta', 'Калькулятор стоимости'),
                                   ('/ru/voprosy', 'Частые вопросы'), ('/ru/blog', 'Блог: цены и советы')]),
        ]),
    'en': dict(
        nav=[('/en/interior-design', 'Services'), ('/portfolio', 'Portfolio'), ('/en/', 'Studio'), ('/en/#contact', 'Contact')],
        nav_label='Main menu', menu='Menu', skip='Skip to content', menu_open='Open menu', menu_close='Close menu', lang_label='Site language',
        cta='Request', cta_href='/en/#contact', home_label='CAS Development — home',
        tagline='Interior design, renovation and turnkey construction studio. Kyiv, since 2016.',
        contacts='Contacts', address='44 Antonovycha St., Kyiv, Ukraine', msg='Messengers', lang='Language',
        privacy=('/en/privacy-policy', 'Privacy policy'), copy='© 2026 CAS Development · Kyiv, Ukraine',
        svc='All studio services', svc_label='Studio services',
        groups=[('Studio', [('/en/', 'CAS Development in English'), ('/en/interior-design', 'Online interior design'),
                            ('/portfolio', 'Portfolio'), ('/es/', 'En español'), ('/services', 'All services (Ukrainian)')])]),
    'es': dict(
        nav=[('/es/diseno-interiores', 'Servicios'), ('/portfolio', 'Portafolio'), ('/es/', 'Estudio'), ('/es/#contact', 'Contacto')],
        nav_label='Menú principal', menu='Menú', skip='Saltar al contenido', menu_open='Abrir menú', menu_close='Cerrar menú', lang_label='Idioma del sitio',
        cta='Solicitud', cta_href='/es/#contact', home_label='CAS Development — inicio',
        tagline='Estudio de diseño de interiores, reformas y construcción llave en mano. Kiev, desde 2016.',
        contacts='Contacto', address='calle Antonovycha 44, Kiev, Ucrania', msg='Mensajería', lang='Idioma',
        privacy=('/es/privacidad', 'Política de privacidad'), copy='© 2026 CAS Development · Kiev, Ucrania',
        svc='Todos los servicios', svc_label='Servicios del estudio',
        groups=[('Estudio', [('/es/', 'CAS Development en español'), ('/es/diseno-interiores', 'Diseño de interiores online'),
                             ('/portfolio', 'Portafolio'), ('/en/', 'In English'), ('/services', 'Todos los servicios (ucraniano)')])]),
}

LOGO = '<a class="sch-logo" href="{home}" aria-label="{label}">CAS<em>.</em>Development</a>'
BURGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sch-b1" d="M4 7h16"/><path class="sch-b2" d="M4 12h16"/><path class="sch-b3" d="M4 17h16"/></svg>'
PHONE_SVG = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1'
             '-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>')


def rel_to_path(rel):
    """Файл → URL-шлях сторінки: index.html → /, ru/index.html → /ru/, blog/x.html → /blog/x."""
    p = '/' + rel.replace(os.sep, '/')
    if p.endswith('/index.html'):
        return p[:-10]
    return p[:-5] if p.endswith('.html') else p


def page_lang(s):
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    return m.group(1) if m and m.group(1) in T else 'uk'


def alternates(s):
    head = s.split('</head>')[0]
    out = {}
    for m in re.finditer(r'<link rel="alternate" hreflang="([a-z]{2})" href="([^"]+)"', head):
        out[m.group(1)] = m.group(2).replace(B, '') or '/'
    return out


def current(lang, path, href):
    """Чи пункт меню — поточний розділ."""
    if href in ('/ru/', '/en/', '/es/'):  # пункт, що веде на головну мови, не підсвічуємо
        return False
    if href == path:
        return True
    sect = {'/blog': ('/blog/',), '/ru/blog': ('/ru/blog/',), '/portfolio': ('/proekty/',), '/ozdoba': ('/ozdoba/',)}
    return path.startswith(sect.get(href, ('\0',)))


def lang_links(lang, alts, cls, current_lang=True, langs=None):
    out = []
    for l in langs or SWITCH[lang]:
        if l == lang:
            out.append(f'<span class="{cls}-on" aria-current="true" lang="{l}">{LANG_CODE[l] if cls == "sch-lang" else LANG_NAME[l]}</span>')
        else:
            href = alts.get(l, HOME[l])
            out.append(f'<a href="{href}" hreflang="{l}" lang="{l}">{LANG_CODE[l] if cls == "sch-lang" else LANG_NAME[l]}</a>')
    return ''.join(out)


def header(lang, path, alts, tools='', cta_href=None):
    t = T[lang]
    items = ''.join(f'<a href="{h}"' + (' aria-current="page"' if current(lang, path, h) else '') + f'>{n}</a>' for h, n in t['nav'])
    cta = cta_href or t['cta_href']
    tools_html = f'<div class="sch-tools">{tools}</div><!--/sch-tools-->' if tools.strip() else ''
    msg = ''.join(f'<a href="{u}" target="_blank" rel="noopener"><img src="{BRAND_IMG.get(k, f'/assets/brand/{k}.svg')}" width="22" height="22" alt="" loading="lazy" decoding="async">{n}</a>'
                  for k, n, u in MSG)
    return (
        f'<!--chrome:h--><header class="sch{" sch--tools" if tools_html else ""}" id="top">\n'
        '<div class="sch-in">\n'
        f'  {LOGO.format(home=HOME[lang], label=t["home_label"])}\n'
        f'  <nav class="sch-nav" aria-label="{t["nav_label"]}">{items}</nav>\n'
        f'  <div class="sch-act">{tools_html}'
        f'<div class="sch-lang" role="group" aria-label="{t["lang_label"]}">{lang_links(lang, alts, "sch-lang")}</div>'
        f'<a class="sch-tel" href="tel:{PHONE}">{PHONE_SVG}<span>{PHONE_TXT}</span></a>'
        f'<a class="sch-cta" href="{cta}">{t["cta"]}</a>'
        f'<button class="sch-burger" type="button" aria-expanded="false" aria-controls="sch-menu" aria-label="{t["menu_open"]}"'
        f' data-open="{t["menu_open"]}" data-close="{t["menu_close"]}">{BURGER}</button></div>\n'
        '</div>\n'
        f'<div class="sch-menu" id="sch-menu" role="dialog" aria-modal="true" aria-label="{t["menu"]}" hidden><div class="sch-menu-in">\n'
        f'  <nav class="sch-mnav" aria-label="{t["nav_label"]}">{items}</nav>\n'
        f'  <div class="sch-mlang" role="group" aria-label="{t["lang_label"]}">{lang_links(lang, alts, "sch-lang")}</div>\n'
        f'  <div class="sch-mcta"><a class="sch-cta" href="{cta}">{t["cta"]}</a><a class="sch-mtel" href="tel:{PHONE}">{PHONE_SVG}{PHONE_TXT}</a></div>\n'
        f'  <div class="sch-mmsg">{msg}</div>\n'
        '</div></div>\n'
        '</header><!--/chrome:h-->'
    )


def footer(lang, alts):
    t = T[lang]
    msg = ''.join(f'<a href="{u}" target="_blank" rel="noopener"><img src="{BRAND_IMG.get(k, f'/assets/brand/{k}.svg')}" width="20" height="20" alt="" loading="lazy" decoding="async">{n}</a>'
                  for k, n, u in MSG)
    groups = ''.join(f'<div><b>{g}</b>' + ''.join(f'<a href="{h}">{n}</a>' for h, n in links) + '</div>' for g, links in t['groups'])
    langs = lang_links(lang, alts, 'scf-lang', langs=['uk', 'ru', 'en', 'es'])
    return (
        '<!--chrome:f--><footer class="scf">\n'
        '<div class="scf-in">\n'
        '  <div class="scf-top">\n'
        f'    <div class="scf-brand">{LOGO.format(home=HOME[lang], label=t["home_label"])}<p>{t["tagline"]}</p></div>\n'
        f'    <div class="scf-col"><b>{t["contacts"]}</b><address>{t["address"]}</address><a class="scf-tel" href="tel:{PHONE}">{PHONE_TXT}</a></div>\n'
        f'    <div class="scf-col"><b>{t["msg"]}</b><div class="scf-msg">{msg}</div></div>\n'
        '  </div>\n'
        f'  <details class="scf-svc"><summary>{t["svc"]}</summary><nav class="scf-svc-g" aria-label="{t["svc_label"]}">{groups}</nav></details>\n'
        f'  <div class="scf-bot"><div class="scf-langs" role="group" aria-label="{t["lang"]}"><span>{t["lang"]}:</span>{langs}</div>'
        f'<a href="{t["privacy"][0]}">{t["privacy"][1]}</a><span>{t["copy"]}</span></div>\n'
        '</div>\n'
        '</footer><!--/chrome:f-->'
    )


# ── міграція старої розмітки ──────────────────────────────────────────────────
OLD_HEADERS = [
    re.compile(r'<!--chrome:h-->.*?<!--/chrome:h-->', re.S),
    re.compile(r'(?:<!-- NAV -->\n)?<nav>\n.*?</nav>\n<div class="nsb" id="nsb">.*?<div class="nsb-ov"[^>]*></div>', re.S),  # головні
    re.compile(r'(?:<!-- NAV -->\n)?<nav>\n  <a href="/services" class="nav-back">.*?</nav>', re.S),  # service-detail
    re.compile(r'<header class="top" id="top">.*?</header>', re.S),  # Оздоба/кабінет
    re.compile(r'<header><div class="w">.*?</header>', re.S),  # лендинги/блог/проєкти
]
OLD_FOOTERS = [
    re.compile(r'<!--chrome:f-->.*?<!--/chrome:f-->', re.S),
    re.compile(r'(?:<div class="seo-links" role="navigation".*?</details>\s*<script>[^<]*</script>\s*</div>\s*)?<footer><span class="fl">.*?</footer>', re.S),
    re.compile(r'<footer><div class="w">.*?</footer>', re.S),
]
OLD_SEO = re.compile(r'\s*<div class="seo-links" role="navigation".*?</details>\s*<script>[^<]*</script>\s*</div>', re.S)

# селектори старої шапки/футера в інлайн-CSS (лише «голі» елементи nav/header/footer і класи старої шапки)
OLD_SEL = re.compile(
    r'(?:^|[\s>+~(])(?:nav|header|footer)(?=$|[\s>+~:\[)])'
    r'|\.(?:logo|nav-links|nav-back|nav-logo|nav-right|lang-sw|lang-cycle|hbg-btn|theme-btn|nsb|nsb-[\w-]+|snav|mnav|seo-links|sl-g)(?![\w-])')
OZD_SEL = re.compile(r'\.top(?![\w-])')
CURSOR_SEL = re.compile(r'#crf?(?![\w-])')  # кастомний курсор головних сторінок


def _bad_selector(sel, ozd):
    sel = sel.strip()
    if not sel or re.search(r'\.sc[hf]\b|\.sc[hf]-', sel):
        return False
    return bool(OLD_SEL.search(sel) or CURSOR_SEL.search(sel) or (ozd and OZD_SEL.search(sel)))


def prune_css(css, ozd=False):
    """Прибирає з CSS правила старої шапки/футера (у т.ч. всередині @media); змішані списки селекторів — чистить."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            out.append(css[i:]); break
        pre = css[i:j]
        at = re.sub(r'/\*.*?\*/', '', pre, flags=re.S).strip()  # коментарі перед селектором/@media
        if at.startswith('@media') or at.startswith('@supports'):
            depth, k = 1, j + 1
            while k < n and depth:
                if css[k] == '{': depth += 1
                elif css[k] == '}': depth -= 1
                k += 1
            inner = prune_css(css[j + 1:k - 1], ozd)
            if inner.strip():
                out.append(pre + '{' + inner + '}')
            i = k; continue
        if at.startswith('@'):
            depth, k = 1, j + 1
            while k < n and depth:
                if css[k] == '{': depth += 1
                elif css[k] == '}': depth -= 1
                k += 1
            out.append(css[i:k]); i = k; continue
        k = css.find('}', j)
        if k < 0:
            out.append(css[i:]); break
        body = css[j:k + 1]
        lead = re.match(r'\s*(?:/\*.*?\*/\s*)*', pre, re.S).group(0)
        sels = pre[len(lead):]
        parts = [p for p in sels.split(',')]
        keep = [p for p in parts if not _bad_selector(re.sub(r'/\*.*?\*/', '', p, flags=re.S), ozd)]
        if len(keep) == len(parts):
            out.append(pre + body)
        elif keep:
            out.append(lead + ','.join(keep) + body)
        else:
            out.append(lead.rstrip() + ('\n' if lead.strip() else ''))
        i = k + 1
    return ''.join(out)


# JS старої навігації на головних (тема й бічне меню)
OLD_JS = [
    re.compile(r"/\* ═══ THEME ═══ \*/\nfunction toggleTheme\(\)\{.*?\}\n\(function\(\)\{if\(localStorage\.getItem\('cas-theme'\).*?\}\)\(\);\n", re.S),
    re.compile(r"/\* ═══ MOBILE NAV ═══ \*/\nfunction toggleNav\(\)\{[^\n]*\}\nfunction closeNav\(\)\{[^\n]*\}\n"),
    re.compile(r"function toggleTheme\(\)\{[^\n]*\}\n"),
    re.compile(r"\(function\(\)\{if\(localStorage\.getItem\('cas-theme'\)==='light'\)[^\n]*\}\)\(\);\n"),
    re.compile(r"function toggleNav\(\)\{[^\n]*\}\nfunction closeNav\(\)\{[^\n]*\}\n"),
]


def fix_js(s):
    for rx in OLD_JS:
        s = rx.sub('', s)
    # кастомний курсор (body{cursor:none}, #cr/#crf) прибрано разом зі старою шапкою
    s = re.sub(r"/\* ═══ CURSOR ═══ \*/\nconst cr=document\.getElementById\('cr'\).*?\n\}\);\n", '', s, count=1, flags=re.S)
    s = s.replace('<div id="cr"></div><div id="crf"></div>\n', '').replace('<div id="cr"></div><div id="crf"></div>', '')
    s = s.replace("document.getElementById('langCycle').textContent=disp;",
                  "const lc=document.getElementById('langCycle');if(lc)lc.textContent=disp;")
    return s


def _after_head(s, fn):
    """Застосувати fn лише до частини після </head> (у CSS-коментарях буває слово «<body>»)."""
    i = s.find('</head>')
    return s if i < 0 else s[:i] + fn(s[i:])


def _nocursor(css):
    css = re.sub(r'(body\{[^}]*?);cursor:none\}', r'\1}', css)
    css = re.sub(r'\n?input,textarea,select,button\{cursor:none\}', '', css)
    return css


def skip_and_main(s, lang):
    """Посилання «Перейти до змісту» першим у <body> і id="main" на <main> (де <main> нема — обгортка вмісту)."""
    s = re.sub(r'<!--chrome:skip-->.*?<!--/chrome:skip-->\n?', '', s, flags=re.S)
    s = _after_head(s, lambda t: re.sub(r'(<body(?:\s+[\w-]+(?:="[^"]*")?)*\s*>)\n?', lambda m: m.group(1) + f'\n<!--chrome:skip--><a class="skip" href="#main">{T[lang]["skip"]}</a><!--/chrome:skip-->\n', t, count=1))
    s = re.sub(r'\n?<main id="main"><!--chrome:main-->', '', s)
    s = re.sub(r'<!--/chrome:main--></main>\n?', '', s)
    # <main> лише навколо сітки товарів (Оздоба) → звичайний div, а <main> — увесь вміст між шапкою й футером
    s = re.sub(r'<main( class="grid"[^>]*)>(.*?)</main>', r'<div\1>\2</div>', s, flags=re.S)
    mains = re.findall(r'<main\b[^>]*>', s)
    if mains:
        if 'id=' not in mains[0]:
            s = s.replace(mains[0], mains[0][:-1] + ' id="main">', 1)
    elif '<!--/chrome:h-->' in s and '<!--chrome:f-->' in s:
        s = s.replace('<!--/chrome:h-->', '<!--/chrome:h-->\n<main id="main"><!--chrome:main-->', 1)
        s = s.replace('<!--chrome:f-->', '<!--/chrome:main--></main>\n<!--chrome:f-->', 1)
    return s


def apply(s, rel):
    """Ставить єдину шапку/футер у HTML сторінки `rel` (шлях від кореня сайту). Ідемпотентно."""
    rel = rel.replace(os.sep, '/')
    if os.path.basename(rel) in SKIP and '/' not in rel or rel.startswith('google'):
        return s
    lang, path, alts = page_lang(s), rel_to_path(rel), alternates(s)
    if rel in ('index.html', 'ru/index.html', 'en/index.html', 'es/index.html'):
        alts.setdefault(lang, HOME[lang])
    # іконки Оздоби/кабінету
    tools = ''
    m = re.search(r'<div class="sch-tools">(.*?)</div><!--/sch-tools-->', s, re.S)
    if m:
        tools = m.group(1)
    else:
        m = re.search(r'<header class="top" id="top">.*?</header>', s, re.S)
        if m:
            tools = ''.join(x.group(0) for x in re.finditer(r'<(button|a) class="ico".*?</\1>', m.group(0), re.S))
    ozd = bool(re.search(r'<header class="top" id="top">', s)) or bool(tools)
    if 'id="zayavka"' in s:
        cta = '#zayavka'
    elif lang in ('en', 'es') and 'id="contact"' in s:
        cta = '#contact'
    elif 'id="cForm"' in s:
        cta = '#cForm'
    else:
        cta = None
    h = header(lang, path, alts, tools, cta)
    f = footer(lang, alts)
    # шапка
    for rx in OLD_HEADERS:
        m = rx.search(s)
        if m:
            s = s[:m.start()] + h + s[m.end():]
            break
    else:
        s = _after_head(s, lambda t: re.sub(r'(<body(?:\s+[\w-]+(?:="[^"]*")?)*\s*>\n?)', lambda m: m.group(1) + h + '\n', t, count=1))
    # футер
    s = OLD_SEO.sub('', s)
    s = re.sub(r'\n?<div data-pp-link[^>]*><a [^>]*>[^<]*</a></div>', '', s)  # старий окремий рядок «Політика конфіденційності»
    for rx in OLD_FOOTERS:
        m = rx.search(s)
        if m:
            s = s[:m.start()].rstrip(' ') + s[m.end():]
            pos = m.start()
            break
    else:
        pos = None
    mi, me = s.find('<main'), s.find('</main>')
    if pos is None or (mi >= 0 and me >= 0 and mi < pos <= me):
        # футер — завжди поза <main>: одразу після </main> (або перед нижньою панеллю / </body>)
        if me >= 0 and (pos is None or pos <= me):
            pos = me + len('</main>')
            s = s[:pos] + '\n' + f + s[pos:]
        else:
            k = s.find('<!--m-fix--><div class="mbar"')
            if k < 0: k = s.rfind('</body>')
            s = s[:k] + f + '\n' + s[k:]
    else:
        s = s[:pos] + f + s[pos:]
    # інлайн-CSS старої шапки/футера
    def _st(m):
        if re.search(r'id="(?:cas-fonts|m-fix|ui-polish)"', m.group(1)):
            return m.group(0)  # спільні блоки (шрифти, мобільна панель .mbar, ui-polish) не чіпаємо
        return m.group(1) + prune_css(m.group(2), ozd) + '</style>'
    s = re.sub(r'(<style[^>]*>)(.*?)</style>', _st, s, flags=re.S)
    s = fix_js(s)
    s = re.sub(r'(<style[^>]*>)(.*?)</style>', lambda m: m.group(1) + _nocursor(m.group(2)) + '</style>', s, flags=re.S)
    s = skip_and_main(s, lang)
    # підключення стилів і скрипта
    if CSS_TAG not in s:
        s = s.replace('</head>', CSS_TAG + '\n</head>', 1)
    else:  # стилі мають іти після всіх інлайн-стилів head
        head = s.split('</head>')[0]
        if not head.rstrip().endswith(CSS_TAG):
            s = s.replace(CSS_TAG + '\n', '', 1).replace('</head>', CSS_TAG + '\n</head>', 1)
    if JS_TAG not in s:
        s = s.replace('</body>', JS_TAG + '\n</body>', 1)
    return s


def pages():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if rel.startswith(('tools/', 'node_modules/', '.')) or os.path.basename(rel).startswith('google'):
            continue
        if rel in SKIP:
            continue
        out.append(rel)
    return out


def apply_file(rel):
    p = os.path.join(ROOT, rel)
    s = open(p, encoding='utf-8').read()
    n = apply(s, rel)
    if n != s:
        open(p, 'w', encoding='utf-8').write(n)
        return True
    return False


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    files = args or pages()
    if '--check' in sys.argv:
        bad = [r for r in files if apply(open(os.path.join(ROOT, r), encoding='utf-8').read(), r) != open(os.path.join(ROOT, r), encoding='utf-8').read()]
        print('\n'.join(bad) if bad else 'Шапка/футер: OK')
        sys.exit(1 if bad else 0)
    n = sum(apply_file(r) for r in files)
    print(f'Шапка/футер оновлено: {n} з {len(files)} сторінок')
