#!/usr/bin/env python3
"""Єдина шапка й футер сайту (site chrome) для всіх публічних сторінок.

  python3 tools/site/chrome.py            # оновити шапку/футер на всіх сторінках
  python3 tools/site/chrome.py file ...   # лише вказані файли (шляхи від кореня сайту)
  python3 tools/site/chrome.py --check    # лише перевірка: де шапка/футер застарілі (код 1)

Розмітка шапки — між <!--chrome:h--> і <!--/chrome:h-->, футера — між <!--chrome:f--> і <!--/chrome:f-->.
Стилі — /assets/site-chrome.v1.css, бургер і діалоги (лайтбокси, шторки) — /assets/site-chrome.v1.js; спільні файли
підключаються з ?v=<хеш вмісту> (versions()), Microsoft Clarity — відкладено (clarity()). Генератори (landing.py, blog/build.py,
products/build.py, shop/pages.py, gen-landing.py) викликають apply() перед записом сторінки, тож руками
шапку/футер не правимо — лише тут.

Мова сторінки — з <html lang>, перемикач мови веде на hreflang-пару (якщо є) або на головну мови.
Іконки Оздоби/кабінету (пошук, обране, #accLink, кошик) зберігаються в слоті .sch-tools — їх обслуговує app.js.
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'


def _ver(path, _c={}):
    """Версія спільного файлу для ?v= (у /assets/* кеш на рік, immutable): перші 8 символів sha1 вмісту."""
    if path not in _c:
        import hashlib
        _c[path] = hashlib.sha1(open(os.path.join(ROOT, path.lstrip('/')), 'rb').read()).hexdigest()[:8]
    return _c[path]


# спільні файли, які підключають сторінки: після зміни файлу всі сторінки отримують новий ?v=
SHARED = ('/assets/site-chrome.v1.css', '/assets/site-chrome.v1.js', '/assets/lead-form.v1.js', '/assets/ui-polish.v1.js', '/assets/proekt.v1.css',
          '/assets/cas-map.v1.css', '/assets/cas-map.v1.js', '/assets/quiz.v1.js', '/assets/quiz.v1.css', '/assets/media.v1.js', '/assets/media.v1.css')
SHARED_RX = re.compile(r'(' + '|'.join(re.escape(x) for x in SHARED) + r')(?:\?v=\w+)?(?=")')


def versions(s):
    return SHARED_RX.sub(lambda m: m.group(1) + '?v=' + _ver(m.group(1)), s)


CSS_TAG = f'<link rel="stylesheet" href="/assets/site-chrome.v1.css?v={_ver("/assets/site-chrome.v1.css")}">'
JS_TAG = f'<script src="/assets/site-chrome.v1.js?v={_ver("/assets/site-chrome.v1.js")}" defer></script>'

PHONE, PHONE_TXT = '+380978667755', '+380 97 866 77 55'
# сторінки, яких не чіпаємо: сторонні юридичні шаблони англійською (власна шапка з H1), верифікація Google
SKIP = {'privacy.html', 'terms.html'}


# Власні шрифти (/fonts/, OFL): Manrope + Cormorant Garamond. Підмножини cyrillic / latin / latin-ext (pl: ą ć ę ł ń ś ź ż;
# de/fr/es вміщуються в latin U+0000-00FF). Браузер вантажить файл лише коли на сторінці є символи з його unicode-range,
# тож uk/ru-сторінки latin-ext не тягнуть. Блок <style id="cas-fonts"> (cyrillic + latin) нормалізує apply() на всіх сторінках;
# @font-face latin-ext (_LATX) — у /assets/site-chrome.v1.css (спільний файл, без зайвих байтів у кожному HTML).
_CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'
_LAT = ('U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, '
        'U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD')
_LATX = ('U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, '
         'U+2020, U+20A0-20AB, U+20AD-20B3, U+20B5-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF')  # без ₴ (U+20B4): інакше uk-сторінки з цінами тягнуть latin-ext


def _face(fam, style, wght, f, rng):
    return (f'@font-face{{font-family:"{fam}";font-style:{style};font-weight:{wght};font-display:swap;'
            f'src:url(/fonts/{f}.woff2) format("woff2");unicode-range:{rng}}}')


FONTS_CSS = ''.join(
    _face(fam, st, w, f'{base}-{sub}', rng)
    for fam, st, w, base in (('Manrope', 'normal', '200 800', 'manrope'), ('Cormorant Garamond', 'normal', '300 700', 'cormorant'),
                             ('Cormorant Garamond', 'italic', '300 700', 'cormorant-italic'))
    for sub, rng in (('cyrillic', _CYR), ('latin', _LAT))
) + ('@font-face{font-family:"Manrope Fallback";src:local("Arial"),local("Helvetica"),local("Liberation Sans");size-adjust:96.5%;'
     'ascent-override:110.5%;descent-override:31.1%;line-gap-override:0%}'
     '@font-face{font-family:"Cormorant Fallback";src:local("Times New Roman"),local("Times"),local("Liberation Serif");'
     'size-adjust:96.1%;ascent-override:96.1%;descent-override:29.9%;line-gap-override:0%}')
FONTS_TAG = f'<style id="cas-fonts">{FONTS_CSS}</style>'
FONTS_RX = re.compile(r'<style id="cas-fonts">.*?</style>', re.S)


# Типографіка цін для всіх мов: суми, валюта й діапазони не розриваються переносом рядка («od $6 / 300», «30– / 60 dni»).
# Лише текст у <body> (не атрибути, не <script>/<style>/<title>/<textarea>/<pre>/<code>), JSON-LD не чіпаємо.
NB = '\u00a0'
_NB_SKIP = ('script', 'style', 'title', 'textarea', 'pre', 'code', 'svg', 'template')
_NB_THOUS = re.compile(r'(?<![\d.,])(\d{1,3})((?: \d{3})+)(?!\d)')
_NB_PREP = re.compile(r'(?<!\w)(від|до|от|около|близько|od|do|from|to|ab|bis|desde|hasta|dès|minimum|min\.|мін\.|≈|~|=|×) (?=[$€₴]|\d)', re.I)
_NB_TIMES = re.compile(r'(\d|m²|м²) ([×=]) ')
_NB_UNIT = re.compile(r'(\d) (₴|грн|zł|PLN|USD|EUR|€|m²|м²|m2|м2|%|dni|dnia|днів|дні|дня|тижні|тижнів|тижня|тиждень|місяців|міс\.|days|weeks|months|días|semanas|meses|jours|semaines|mois|Tage|Wochen|Monate|tygodnie|tygodni|miesięcy|сотку|сотки|соток|шт|szt\.|pcs|cm|см|мм|mm|кг|kg|м|m)(?!\w)')
_NB_RANGE = re.compile(r'(?<![\w–-])(\$?\d+(?:\u00a0\d{3})*[–-]\$?\d+(?:\u00a0\d{3})*)(?![\w–-])')
# однолітерні прийменники й сполучники (uk/ru) не лишаються в кінці рядка: «з Китаю», «і бар»
_NB_ONE = re.compile(r'(?<![\w\u00a0-])([зйіувоаксиЗЙІУВОАКСИ]) (?=\S)')
_NB_ONE_PL = re.compile(r'(?<![\w\u00a0-])([wzioauWZIOAU]) (?=\S)')  # pl: «w Kijowie», «z UE»
_NB_TAG = re.compile(r'<(' + '|'.join(_NB_SKIP) + r')\b[^>]*>.*?</\1\s*>|<!--.*?-->|<[^>]*>', re.S | re.I)


def _nb_text(t, lang=None):
    t = _NB_THOUS.sub(lambda m: m.group(1) + m.group(2).replace(' ', NB), t)
    t = _NB_TIMES.sub(lambda m: m.group(1) + NB + m.group(2) + ' ', t)
    t = _NB_PREP.sub(lambda m: m.group(1) + NB, t)
    t = _NB_UNIT.sub(lambda m: m.group(1) + NB + m.group(2), t)
    t = _NB_ONE.sub(lambda m: m.group(1) + NB, t)
    if lang == 'pl':
        t = _NB_ONE_PL.sub(lambda m: m.group(1) + NB, t)
    return t


def nbsp_prices(s, lang=None):
    """Нерозривні пробіли в сумах/одиницях і <span class="nw"> для діапазонів «30–60» (ідемпотентно)."""
    i = s.find('<body')
    if i < 0:
        return s
    head, body = s[:i], s[i:]
    parts, pos, prev = [], 0, ''
    for m in list(_NB_TAG.finditer(body)) + [None]:
        x = body[pos:m.start() if m else len(body)]
        if x.strip():
            x = _nb_text(x, lang)
            if prev != '<span class="nw">':
                x = _NB_RANGE.sub(lambda r: '<span class="nw">' + r.group(1) + '</span>', x)
        parts.append(x)
        if m:  # тег, коментар або цілий блок <script>/<style>/… — без змін
            parts.append(m.group(0))
            prev, pos = m.group(0), m.end()
    return head + ''.join(parts)


def fonts_block(s):
    """Єдиний блок @font-face (див. FONTS_CSS) на сторінці."""
    return FONTS_RX.sub(lambda m: FONTS_TAG, s, count=1)

import i18n  # реєстр мов, hreflang-кластери (tools/site/i18n.py)

LANGS = i18n.LANGS
HOME = {l: i18n.home(l) for l in LANGS}
LANG_CODE = {l: i18n.meta(l)['code'] for l in LANGS}
LANG_NAME = {l: i18n.meta(l)['name'] for l in LANGS}
MSG = [('telegram', 'Telegram', 'https://t.me/+380978667755'), ('viber', 'Viber', 'viber://chat?number=%2B380978667755'),
       ('whatsapp', 'WhatsApp', 'https://wa.me/380978667755'), ('instagram', 'Instagram', 'https://www.instagram.com/cas_development/')]
BRAND_IMG = {'instagram': '/assets/brand/instagram-96.png'}  # решта — /assets/brand/<name>.svg
# соцмережі у футері (іконки-посилання з aria-label): Instagram + YouTube і Kuula з tools/site/media.json
# (youtube_channel, kuula_profile; порожнє — посилання немає). media.py ставить їх і в sameAs JSON-LD та на /contact.
try:
    _MEDIA = json.load(open(os.path.join(ROOT, 'tools/site/media.json'), encoding='utf-8'))
except (OSError, ValueError):
    _MEDIA = {}
SOCIAL = [('instagram', 'Instagram', 'https://www.instagram.com/cas_development/')]
if re.match(r'^https://www\.youtube\.com/(@[\w.\-]+|channel/UC[\w-]{22})$', _MEDIA.get('youtube_channel') or ''):
    SOCIAL.append(('youtube', 'YouTube', _MEDIA['youtube_channel']))
if re.match(r'^https://kuula\.co/profile/[\w.\-]+$', _MEDIA.get('kuula_profile') or ''):
    SOCIAL.append(('kuula', 'Kuula — 360°', _MEDIA['kuula_profile']))
SOC_LABEL = {'uk': 'Соцмережі', 'ru': 'Соцсети', 'en': 'Social media', 'es': 'Redes sociales', 'zh': '社交媒体', 'pl': 'Media społecznościowe',
             'de': 'Soziale Medien', 'fr': 'Réseaux sociaux', 'ar': 'التواصل الاجتماعي'}

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
                        ('/remont-novobudovy-kyiv', 'Ремонт у новобудові'), ('/remont-kvartyr-zhk-kyiv', 'Ремонт у ЖК Києва'),
                        ('/remontna-bryhada-kyiv', 'Ремонтна бригада'),
                        ('/remont-vannoi-kimnaty-kyiv', 'Ремонт ванної'), ('/remont-kukhni-kyiv', 'Ремонт кухні'),
                        ('/remont-ofisu-pid-klyuch-kyiv', 'Ремонт офісу'), ('/remont-komertsiinykh-prymishchen-kyiv', 'Комерційні приміщення'),
                        ('/biznes-pid-kliuch-kyiv', 'Бізнес під ключ'), ('/heneralnyi-pidriadnyk-kyiv', 'Генеральний підрядник'), ('/remont-premium-klasu-kyiv', 'Ремонт преміум-класу'), ('/remont-restoranu-kafe-kyiv', 'Ремонт ресторану й кафе'), ('/dyzain-remont-kvartyry-pechersk', 'Квартира на Печерську')]),
            ('Дизайн', [('/dyzain-interieru-kyiv', 'Дизайн інтерʼєру'), ('/dyzain-interieru-kvartyry-kyiv', 'Дизайн квартири'),
                        ('/dyzainer-interieru-kyiv', 'Дизайнер інтерʼєру'), ('/realizatsiia-dyzain-proektu-kyiv', 'Реалізація дизайн-проєкту'),
                        ('/dyzain-restoranu-kafe-kyiv', 'Дизайн ресторану й кафе'), ('/landshaftnyi-dyzain-kyiv', 'Ландшафтний дизайн'), ('/dyzain-interieru-premium-kyiv', 'Преміум-дизайн'), ('/dyzain-interieru-budynku-kyiv', 'Дизайн будинку'), ('/dyzain-ofisu-kyiv', 'Дизайн офісу'), ('/dyzain-hotelu-kyiv', 'Дизайн готелю'), ('/avtorskyi-i-tekhnichnyi-nahliad-kyiv', 'Авторський і технагляд')]),
            ('Будинки', [('/budivnytstvo-budynkiv-kyiv', 'Будівництво будинків'), ('/proektuvannia-budynku-kyiv', 'Проєктування будинку'),
                         ('/remont-budynku-pid-klyuch-kyiv', 'Ремонт будинку'), ('/baza-vidpochynku-pid-klyuch', 'База відпочинку'), ('/rekonstruktsiia-budynku-kyiv', 'Реконструкція будинку'), ('/budynok-pid-kliuch-koncha-zaspa', 'Будинок у Конча-Заспі')]),
            ('Меблі й корисне', [('/mebliuvannia-kvartyry-kyiv', 'Меблювання під ключ'), ('/komplektatsiia-pid-kliuch-kyiv', 'Комплектація під ключ'),
                                 ('/ozdoba', 'Оздоба — меблі з Китаю'), ('/kalkuliator-remontu', 'Калькулятор вартості'),
                                 ('/pytannya', 'Часті питання'), ('/blog', 'Блог: ціни й поради')]),
        ]),
    'ru': dict(
        nav=[('/ru/uslugi', 'Услуги'), ('/portfolio', 'Портфолио'), ('/ozdoba', 'Оздоба'), ('/ru/blog', 'Блог'),
             ('/ru/o-nas', 'О студии'), ('/ru/kontakty', 'Контакты')],
        nav_label='Главное меню', menu='Меню', skip='Перейти к содержанию', menu_open='Открыть меню', menu_close='Закрыть меню', lang_label='Язык сайта',
        cta='Заявка', cta_href='/ru/#zayavka', home_label='CAS Development — на главную',
        tagline='Студия дизайна интерьера, ремонта и строительства под ключ. Киев, с 2016 года.',
        contacts='Контакты', address='ул. Антоновича, 44, Киев', msg='Мессенджеры', lang='Язык',
        privacy=('/ru/konfidentsialnost', 'Политика конфиденциальности'), copy='© 2026 CAS Development · Киев, Украина',
        svc='Все услуги студии', svc_label='Услуги студии',
        groups=[
            ('Ремонт', [('/ru/remont-kvartir-kiev', 'Ремонт квартир'), ('/ru/remont-pod-klyuch-kiev', 'Ремонт под ключ'),
                        ('/ru/remont-v-novostroyke-kiev', 'Ремонт в новостройке'), ('/ru/remont-kvartir-zhk-kiev', 'Ремонт в ЖК Киева'),
                        ('/ru/remontnaya-brigada-kiev', 'Ремонтная бригада'),
                        ('/ru/remont-vannoy-kiev', 'Ремонт ванной'), ('/ru/remont-kuhni-kiev', 'Ремонт кухни'),
                        ('/ru/remont-ofisa-kiev', 'Ремонт офиса'), ('/ru/remont-kommercheskih-pomeshcheniy-kiev', 'Коммерческие помещения'),
                        ('/ru/biznes-pod-klyuch-kiev', 'Бизнес под ключ'), ('/ru/generalnyy-podryadchik-kiev', 'Генеральный подрядчик'), ('/ru/remont-premium-klassa-kiev', 'Ремонт премиум-класса'), ('/ru/remont-restorana-kafe-kiev', 'Ремонт ресторана и кафе'), ('/ru/dizayn-remont-kvartiry-pechersk', 'Квартира на Печерске')]),
            ('Дизайн', [('/ru/dizayn-interera-kiev', 'Дизайн интерьера'), ('/ru/dizayn-kvartiry-kiev', 'Дизайн квартиры'),
                        ('/ru/dizayner-interera-kiev', 'Дизайнер интерьера'), ('/ru/realizatsiya-dizayn-proekta-kiev', 'Реализация дизайн-проекта'),
                        ('/ru/dizayn-restorana-kafe-kiev', 'Дизайн ресторана и кафе'), ('/ru/landshaftnyy-dizayn-kiev', 'Ландшафтный дизайн'), ('/ru/dizayn-interera-premium-kiev', 'Премиум-дизайн'), ('/ru/dizayn-interera-doma-kiev', 'Дизайн дома'), ('/ru/dizayn-ofisa-kiev', 'Дизайн офиса'), ('/ru/dizayn-gostinitsy-kiev', 'Дизайн гостиницы'), ('/ru/avtorskiy-i-tehnicheskiy-nadzor-kiev', 'Авторский и технадзор')]),
            ('Дома', [('/ru/stroitelstvo-domov-kiev', 'Строительство домов'), ('/ru/proektirovanie-doma-kiev', 'Проектирование дома'),
                      ('/ru/remont-doma-kiev', 'Ремонт дома'), ('/ru/baza-otdyha-pod-klyuch', 'База отдыха'), ('/ru/rekonstruktsiya-doma-kiev', 'Реконструкция дома'), ('/ru/dom-pod-klyuch-koncha-zaspa', 'Дом в Конча-Заспе')]),
            ('Мебель и полезное', [('/ru/meblirovka-kvartiry-kiev', 'Меблировка под ключ'), ('/ru/komplektatsiya-pod-klyuch-kiev', 'Комплектация под ключ'),
                                   ('/ozdoba', 'Оздоба — мебель из Китая'), ('/ru/kalkulyator-remonta', 'Калькулятор стоимости'),
                                   ('/ru/voprosy', 'Частые вопросы'), ('/ru/blog', 'Блог: цены и советы')]),
        ]),
}
for _l in LANGS:  # нові мови — словник chrome з tools/site/lang/<мова>.json
    if _l not in T and i18n.ui(_l):
        _c = dict(i18n.ui(_l)['chrome'])
        _c['privacy'] = tuple(_c['privacy'])
        T[_l] = _c


def _live(links):
    """Лише посилання на наявні сторінки (зовнішні й #якорі — як є)."""
    return [(h, n) for h, n in links if not h.startswith('/') or h.startswith('/#') or i18n.exists(h)]

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
    for m in re.finditer(r'<link rel="alternate" hreflang="([a-zA-Z-]+)" href="([^"]+)"', head):
        if m.group(1) != 'x-default':
            out[i18n.lang_of_hreflang(m.group(1))] = m.group(2).replace(B, '') or '/'
    return out


def current(lang, path, href):
    """Чи пункт меню — поточний розділ."""
    if href in HOME.values():  # пункт, що веде на головну мови, не підсвічуємо
        return False
    if href == path:
        return True
    sect = {'/portfolio': ('/proekty/',), '/ozdoba': ('/ozdoba/',)}
    if re.fullmatch(r'(?:/[a-z]{2})?/blog', href):  # блог будь-якою мовою: /blog, /ru/blog, /en/blog …
        sect[href] = (href + '/',)
    return path.startswith(sect.get(href, ('\0',)))


def lang_links(lang, alts, cls):
    """Усі мови сайту (з наявною головною): посилання на hreflang-пару, інакше — на головну мови."""
    out = []
    for l in i18n.enabled():
        label = LANG_CODE[l] if cls == 'sch-lang' else LANG_NAME[l]
        if l == lang:
            out.append(f'<span class="{cls}-on" aria-current="true" lang="{i18n.meta(l)["html"]}">{label}</span>')
        else:
            out.append(f'<a href="{alts.get(l, HOME[l])}" hreflang="{i18n.meta(l)["hreflang"]}" lang="{i18n.meta(l)["html"]}">{label}</a>')
    return ''.join(out)


def lang_menu(lang, alts, label):
    """Перемикач у шапці: компактний список (details) — вміщує скільки завгодно мов."""
    items = []
    for l in i18n.enabled():
        m = i18n.meta(l)
        inner = f'<b>{m["code"]}</b>{m["name"]}'
        if l == lang:
            items.append(f'<span class="sch-ld-on" aria-current="true" lang="{m["html"]}">{inner}</span>')
        else:
            items.append(f'<a href="{alts.get(l, HOME[l])}" hreflang="{m["hreflang"]}" lang="{m["html"]}">{inner}</a>')
    return (f'<details class="sch-ld"><summary aria-label="{label}: {LANG_NAME[lang]}">{LANG_CODE[lang]}</summary>'
            f'<div class="sch-ld-m">{"".join(items)}</div></details>')


def header(lang, path, alts, tools='', cta_href=None):
    t = T[lang]
    items = ''.join(f'<a href="{h}"' + (' aria-current="page"' if current(lang, path, h) else '') + f'>{n}</a>' for h, n in _live(t['nav']))
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
        f'<div class="sch-lang" role="group" aria-label="{t["lang_label"]}">{lang_menu(lang, alts, t["lang_label"])}</div>'
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
                  for k, n, u in MSG if k not in dict((x[0], 1) for x in SOCIAL))
    soc_l = t.get('soc') or SOC_LABEL.get(lang, SOC_LABEL['en'])
    soc = ''.join(f'<a href="{u}" target="_blank" rel="noopener" aria-label="{n}"><img src="{BRAND_IMG.get(k, f'/assets/brand/{k}.svg')}" width="22" height="22" alt="" loading="lazy" decoding="async"></a>'
                  for k, n, u in SOCIAL)
    groups = ''.join(f'<div><b>{g}</b>' + ''.join(f'<a href="{h}">{n}</a>' for h, n in links) + '</div>' for g, links in [(g, _live(x)) for g, x in t['groups']] if links)
    langs = lang_links(lang, alts, 'scf-lang')
    return (
        '<!--chrome:f--><footer class="scf">\n'
        '<div class="scf-in">\n'
        '  <div class="scf-top">\n'
        f'    <div class="scf-brand">{LOGO.format(home=HOME[lang], label=t["home_label"])}<p>{t["tagline"]}</p></div>\n'
        f'    <div class="scf-col"><b>{t["contacts"]}</b><address>{t["address"]}</address><a class="scf-tel" href="tel:{PHONE}">{PHONE_TXT}</a></div>\n'
        f'    <div class="scf-col"><b>{t["msg"]}</b><div class="scf-msg">{msg}</div><div class="scf-soc" role="group" aria-label="{soc_l}">{soc}</div></div>\n'
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


MBAR_IMG = {'https://t.me/': ('telegram', 'Telegram'), 'https://wa.me/': ('whatsapp', 'WhatsApp')}


def mbar_logos(s):
    """Нижня панель зв'язку (.mbar): оригінальні кольорові логотипи з /assets/brand/ замість однокольорових SVG."""
    k = s.find('<div class="mbar"')
    if k < 0: return s
    e = s.find('</div>', k)
    blk = s[k:e]
    for pre, (name, label) in MBAR_IMG.items():
        blk = re.sub(r'(<a href="' + re.escape(pre) + r'[^"]*"[^>]*>)\s*<svg\b.*?</svg>',
                     lambda m: m.group(1) + f'<img src="/assets/brand/{name}.svg" width="32" height="32" alt="" decoding="async">', blk, flags=re.S)
    return s[:k] + blk + s[e:]


# «Залишити номер» у нижній панелі (.mbar): веде на найближчу форму сторінки (#zayavka / швидка заявка #lead) або на
# сторінку із заявкою мовою сторінки; /assets/lead-form.v1.js прокручує до поля телефону й ставить у нього фокус.
# Telegram і WhatsApp у панелі з кнопкою — лише логотипи (підпис лишається для читачів екрана).
MB_LEAD_CSS = ('<style id="mb-lead">@media(max-width:767px){.mbar[data-lead]{grid-template-columns:1fr 1.3fr 48px 48px}.mbar[data-lead] a:not([class]){font-size:0;gap:0}'
               '.mbar .mb-lead{background:#bf914829;color:#f3d7a6;border-color:#bf9148;text-align:center;line-height:1.1}}</style>')
MB_LEAD_RX = re.compile(r'<style id="mb-lead">.*?</style>|<a class="mb-lead"[^>]*>.*?</a>\n?')


def mbar_lead(s, lang, rel=''):
    """Кнопка «Залишити номер» у .mbar (ідемпотентно). Індекси блогу — без неї: сторінки на межі бюджету 60 КБ (ui.py)."""
    import leadform  # тексти легкої заявки (tools/site/leadform.py)
    s = MB_LEAD_RX.sub('', s).replace('<div class="mbar" data-lead ', '<div class="mbar" ')
    k = s.find('<!--m-fix--><div class="mbar"')
    if k < 0 or 'class="mb-call"' not in s[k:] or re.search(r'(?:^|/)blog\.html$', rel):
        return s
    if 'id="zayavka"' in s: href = '#zayavka'
    elif 'id="lead"' in s: href = '#lead'
    else: href = T[lang]['cta_href']
    lab = leadform.T.get(lang, leadform.T['uk'])['mb']
    blk = s[k:].replace('<div class="mbar"', '<div class="mbar" data-lead', 1)
    e = blk.find('</a>', blk.find('class="mb-call"')) + 4
    blk = blk[:e] + f'\n<a class="mb-lead" href="{href}">{lab}</a>' + blk[e:]
    return s[:k] + MB_LEAD_CSS + blk


# Microsoft Clarity: вантажимо після першої взаємодії (scroll/pointerdown/keydown/touchstart) або, якщо її нема,
# через 4 с після load у requestIdleCallback — не заважає LCP/TBT. Будь-яку стару вставку замінюємо на цю.
CLARITY_ID = 'z19wl000eu'
CLARITY = ('<script>(function(w,d,i){w.clarity=w.clarity||function(){(w.clarity.q=w.clarity.q||[]).push(arguments)};'
           'var E=["scroll","pointerdown","keydown","touchstart"],o={passive:true},done=0;'
           'function g(){if(done)return;done=1;E.forEach(function(e){w.removeEventListener(e,g,o)});'
           'var t=d.createElement("script");t.async=1;t.src="https://www.clarity.ms/tag/"+i;d.head.appendChild(t)}'
           'E.forEach(function(e){w.addEventListener(e,g,o)});'
           'function l(){setTimeout(function(){w.requestIdleCallback?requestIdleCallback(g,{timeout:4000}):g()},4000)}'
           'd.readyState==="complete"?l():w.addEventListener("load",l)})(window,document,"' + CLARITY_ID + '");</script>')
CLARITY_RX = re.compile(r'<script>\(function\([^<]*?clarity[^<]*?</script>')


def clarity(s):
    return CLARITY_RX.sub(lambda m: CLARITY, s)


# Миттєві переходи: Speculation Rules — prefetch внутрішньої сторінки при наведенні/натисканні (eagerness moderate:
# ~200 мс hover на десктопі, pointerdown на телефоні). Без prerender: він виконує JS (аналітика) і важчий для телефонів.
# Кабінет, API, URL з ?параметрами і посилання з target/download/data-no-prefetch — не чіпаємо.
# Браузери без підтримки (Safari, Firefox) ігнорують. Разом з @view-transition у site-chrome.v1.css перехід — без «білого кадру».
_SPEC_WHERE = {'and': [
    {'href_matches': '/*'},
    {'not': {'href_matches': ['/kabinet*', '/api/*', '/*\\?*']}},
    {'not': {'selector_matches': '[target],[download],[data-no-prefetch]'}}]}
SPEC = ('<script type="speculationrules">'
        + json.dumps({'prefetch': [{'where': _SPEC_WHERE, 'eagerness': 'moderate'}]}, separators=(',', ':'))
        + '</script>')
SPEC_RX = re.compile(r'<script type="speculationrules">.*?</script>\n?', re.S)
# LCP-фото (img з fetchpriority="high"): preload у <head>, щоб браузер почав вантажити його разом зі шрифтами,
# не чекаючи розбору інлайн-стилів. Атрибути (srcset/sizes) — ті самі, що в <img>, тож подвійного завантаження немає.
LCP_RX = re.compile(r'<link rel="preload" as="image" data-lcp[^>]*>\n?')


def _attr(tag, name):
    m = re.search(r'\s' + name + r'="([^"]*)"', tag)
    return m.group(1) if m else None


def head_extras(s):
    """Speculation Rules і preload LCP-фото одразу після <meta name="viewport"> (ідемпотентно)."""
    i = s.find('</head>')
    if i < 0:
        return s
    head, body = s[:i], s[i:]
    head = LCP_RX.sub('', SPEC_RX.sub('', head))
    add = SPEC + '\n'
    vis = re.sub(r'<script\b.*?</script>|<template\b.*?</template>|<noscript\b.*?</noscript>', '', body, flags=re.S)
    m = re.search(r'<img\b[^>]*\bfetchpriority="high"[^>]*>', vis)
    if m and _attr(m.group(0), 'src') and '${' not in m.group(0):
        t = m.group(0)
        link = f'<link rel="preload" as="image" data-lcp href="{_attr(t, "src")}"'
        if _attr(t, 'srcset'):
            link += f' imagesrcset="{_attr(t, "srcset")}"' + (f' imagesizes="{_attr(t, "sizes")}"' if _attr(t, 'sizes') else '')
        add += link + '>\n'
    vp = re.search(r'<meta name="viewport"[^>]*>\n', head) or re.search(r'<head\b[^>]*>\n', head)
    if not vp:
        return s
    return head[:vp.end()] + add + head[vp.end():] + body


def apply(s, rel):
    """Ставить єдину шапку/футер у HTML сторінки `rel` (шлях від кореня сайту). Ідемпотентно."""
    rel = rel.replace(os.sep, '/')
    if os.path.basename(rel) in SKIP and '/' not in rel or rel.startswith('google'):
        return s
    if rel.startswith('tury/'):  # повноекранні 3D-тури — без шапки/футера
        return s
    lang, path, alts = page_lang(s), rel_to_path(rel), alternates(s)
    if rel in [i18n.path_to_file(h) for h in HOME.values()]:
        alts.setdefault(lang, HOME[lang])
    # стаття блогу без перекладу якоюсь мовою: перемикач веде на блог тієї мови (якщо він є), а не на головну
    if re.match(r'(?:/[a-z]{2})?/blog(?:/|$)', path):
        for l in LANGS:
            b = '/' + i18n.meta(l)['prefix'] + 'blog'
            if i18n.exists(b):
                alts.setdefault(l, b)
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
    s = mbar_logos(s)
    s = mbar_lead(s, lang, rel)
    s = viewport(s)
    s = mfix_min(s)
    s = clarity(s)
    s = skip_and_main(s, lang)
    s = versions(s)
    s = fonts_block(s)
    s = nbsp_prices(s, lang)
    s = i18n.fonts(s, lang)  # preload: кирилиця лише для uk/ru, латиниця — en/es/…, zh/ar — без preload
    if not rel.startswith('kabinet'):  # кабінет і адмінка — застосунок за логіном: без prefetch/prerender
        s = head_extras(s)  # Speculation Rules (миттєві переходи) і preload LCP-фото
    else:
        s = LCP_RX.sub('', SPEC_RX.sub('', s))
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


# Один viewport на всі сторінки: viewport-fit=cover — сторінка на весь екран iPhone (Dynamic Island, home indicator,
# альбомна орієнтація); відступи від вирізів дають env(safe-area-inset-*) у /assets/site-chrome.v1.css (шапка, футер,
# нижня панель .mbar, шторки, лайтбокси, body padding-inline). Масштабування не забороняємо (доступність).
VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
VIEWPORT_RX = re.compile(r'<meta name="viewport" content="width=device-width,\s*initial-scale=1(?:\.0)?(?:,\s*viewport-fit=cover)?">')


def viewport(s):
    return VIEWPORT_RX.sub(VIEWPORT, s, count=1)


MFIX_RX = re.compile(r'(<style id="m-fix">)(.*?)(</style>)', re.S)


def mfix_min(s):
    """Блок <style id="m-fix"> (нижня панель .mbar, однаковий на всіх сторінках): без CSS-коментарів і відступів —
    ~150 байт менше на кожній сторінці (бюджет HTML у tools/ui/ui.py). Ідемпотентно."""
    return MFIX_RX.sub(lambda m: m.group(1) + re.sub(r'\n[ \t]+', '\n', re.sub(r'[ \t]*/\*.*?\*/\n?', '', m.group(2), flags=re.S)) + m.group(3), s, count=1)


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
