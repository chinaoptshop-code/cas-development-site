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
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'


def _ver(path, _c={}):
    """Версія спільного файлу для ?v= (у /assets/* кеш на рік, immutable): перші 8 символів sha1 вмісту."""
    if path not in _c:
        import hashlib
        _c[path] = hashlib.sha1(open(os.path.join(ROOT, path.lstrip('/')), 'rb').read()).hexdigest()[:8]
    return _c[path]


# спільні файли, які підключають сторінки: після зміни файлу всі сторінки отримують новий ?v=
SHARED = ('/assets/site-chrome.v1.css', '/assets/crit.v1.css', '/assets/site-chrome.v1.js', '/assets/lead-form.v1.js', '/assets/ui-polish.v1.js', '/assets/proekt.v1.css',
          '/assets/cas-map.v1.css', '/assets/cas-map.v1.js', '/assets/quiz.v1.js', '/assets/quiz.v1.css', '/assets/media.v1.js', '/assets/media.v1.css',
          '/assets/build-anim.v1.js', '/assets/build-anim.v1.css', '/assets/sections.v1.css', '/assets/calc.v1.js', '/assets/case-gal.v1.js', '/assets/lightbox.v1.js')
SHARED_RX = re.compile(r'(' + '|'.join(re.escape(x) for x in SHARED) + r')(?:\?v=\w+)?(?=")')


def versions(s):
    return SHARED_RX.sub(lambda m: m.group(1) + '?v=' + _ver(m.group(1)), s)


# Стилі (швидкість, 09.11.2026): у <head> блокує рендер лише критичний /assets/crit.v1.css (правила першого екрана —
# tools/site/critcss.py, список — node tools/tests/critcss.mjs); повний /assets/site-chrome.v1.css — останнім у <body>:
# контент Chrome малює з критичним, defer-скрипти виконуються вже після повного файлу, каскад після нього — як раніше.
import critcss  # noqa: E402
import cssbundle  # noqa: E402  спільні інлайн-стилі <head> → /assets/ib-*.css (tools/site/cssbundle.py)
critcss.write()  # критичний файл — з поточного site-chrome.v1.css (до ?v=)
# коротко (rel без лапок, crit.v1.css): сторінки на межі бюджету HTML 64 КБ (tools/ui/ui.py)
CSS_TAG = f'<link rel=stylesheet href="/assets/crit.v1.css?v={_ver("/assets/crit.v1.css")}">'
FULL_TAG = f'<link rel=stylesheet href="/assets/site-chrome.v1.css?v={_ver("/assets/site-chrome.v1.css")}">'
FULL_RX = re.compile(r'<link rel="?stylesheet"? href="/assets/site-chrome\.v1\.css(?:\?v=\w+)?">\n?')
CRIT_RX = re.compile(r'<link rel="?stylesheet"? href="/assets/(?:site-)?crit\.v1\.css(?:\?v=\w+)?">\n?')


def full_css(s):
    """Повний site-chrome.v1.css — останнім у <body> (перед </body>). Ідемпотентно.
    Chrome малює все над ним з критичним CSS; defer-скрипти (і модулі) чекають на нього, хоч і стоять вище (перевірено:
    скрипт бачить повний каскад, DOMContentLoaded — після CSS). Інлайн-скрипти body не міряють верстку."""
    s = FULL_RX.sub('', s)
    e = s.rfind('</body>')
    if e < 0 or s.find('<body') < 0:
        return s
    return s[:e] + FULL_TAG + s[e:]


JS_TAG = f'<script src="/assets/site-chrome.v1.js?v={_ver("/assets/site-chrome.v1.js")}" defer></script>'

PHONE, PHONE_TXT = '+380978667755', '+380 97 866 77 55'
# сторінки, яких не чіпаємо: сторонні юридичні шаблони англійською (власна шапка з H1), верифікація Google
SKIP = {'privacy.html', 'terms.html'}


# Власні шрифти (/fonts/, OFL). Один шрифт на весь публічний сайт — Cormorant Garamond (Михайло 24.11.2026: «чи можна зробити
# весь шрифт однаковий на всьому сайті такий як наприклад шрифт назви компанії cas development» → «Один шрифт на весь сайт»).
# Заголовки й логотип — "Cormorant Garamond" як і раніше; текст (абзаци, кнопки, меню, поля, ціни) — "Cormorant Garamond Text":
# ті самі файли (браузер вантажить їх один раз), але з size-adjust TXT_ADJ — у Cormorant мала x-висота (0.386 em проти 0.54
# у Manrope), тож при тих самих font-size (rem-токени, px сцен) текст інакше став би дрібним. Обчислений font-size не
# змінюється (поля ≥ 16 px, --fs-small ≥ 13 px), більшає лише видимий гліф. Стек тексту — змінна --ff (site-chrome.v1.css).
# Кабінет (/kabinet…) лишається на Manrope: свій блок KAB_FONTS_CSS із --ff = Manrope (рішення координатора 24.11.2026).
# Підмножини cyrillic / latin / latin-ext (pl: ą ć ę ł ń ś ź ż; de/fr/es вміщуються в latin U+0000-00FF). Браузер вантажить
# файл лише коли на сторінці є символи з його unicode-range, тож uk/ru-сторінки latin-ext не тягнуть. Блок <style id="cas-fonts">
# (cyrillic + latin) нормалізує apply() на всіх сторінках; @font-face latin-ext — у /assets/site-chrome.v1.css.
_CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'
_LAT = ('U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, '
        'U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD')
_LATX = ('U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, '
         'U+2020, U+20A0-20AB, U+20AD-20B3, U+20B5-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF')  # без ₴ (U+20B4): інакше uk-сторінки з цінами тягнуть latin-ext
TXT = 'Cormorant Garamond Text'
TXT_ADJ = 118  # %: видимий розмір тексту Cormorant відносно font-size (підібрано по знімках 24.11.2026; та сама цифра — у site-chrome.v1.css latin-ext)


def _face(fam, style, wght, f, rng, adj=''):
    # без format("woff2") і font-style:normal (значення за замовчуванням): −160 Б на кожній сторінці (бюджет HTML 64 КБ у ui.py)
    st = '' if style == 'normal' else f'font-style:{style};'
    return (f'@font-face{{font-family:"{fam}";{st}font-weight:{wght};font-display:swap;'
            f'src:url(/fonts/{f}.woff2);unicode-range:{rng}{adj}}}')


_COR = (('Cormorant Garamond', 'normal', '300 700', 'cormorant', ''), ('Cormorant Garamond', 'italic', '300 700', 'cormorant-italic', ''),
        (TXT, 'normal', '300 700', 'cormorant', f';size-adjust:{TXT_ADJ}%'), (TXT, 'italic', '300 700', 'cormorant-italic', f';size-adjust:{TXT_ADJ}%'))
_COR_FB = ('@font-face{font-family:"Cormorant Fallback";src:local("Times New Roman"),local("Times"),local("Liberation Serif");'
           'size-adjust:96.1%;ascent-override:96.1%;descent-override:29.9%;line-gap-override:0%}'
           # той самий запасний шрифт для тексту, збільшений як "Cormorant Garamond Text" (overrides множаться на size-adjust)
           '@font-face{font-family:"Cormorant Text Fallback";src:local("Times New Roman"),local("Times"),local("Liberation Serif");'
           f'size-adjust:{round(96.1 * TXT_ADJ / 100, 1)}%;ascent-override:96.1%;descent-override:29.9%;line-gap-override:0%}}')
# основний текст — вага 500 (400 Cormorant на темному тлі затонка), цифри — лінійні (у Cormorant типово старого стилю: «$550» скакав)
_TXT_BASE = 'body{font-weight:500;font-variant-numeric:lining-nums}'
FONTS_CSS = ''.join(
    _face(fam, st, w, f'{base}-{sub}', rng, adj)
    for fam, st, w, base, adj in _COR
    for sub, rng in (('cyrillic', _CYR), ('latin', _LAT))
) + _COR_FB + _TXT_BASE
FONTS_TAG = f'<style id="cas-fonts">{FONTS_CSS}</style>'


def _nn_manrope():
    """Грань U+202F 0.2em для Manrope (кабінет): той самий вбудований шрифт, що в блоці /*nn*/ site-chrome.v1.css."""
    try:
        css = open(os.path.join(ROOT, 'assets', 'site-chrome.v1.css'), encoding='utf-8').read()
        m = re.search(r'/\*nn\*/.*?src:(url\(data:font/woff2;base64,[A-Za-z0-9+/=]+\))', css, re.S)
    except OSError:
        m = None
    return f'@font-face{{font-family:"Manrope";font-weight:200 800;src:{m.group(1)};unicode-range:U+202F}}' if m else ''


# Кабінет клієнта, кабінет працівника й адмінка — без змін: Manrope (текст) + Cormorant Garamond (заголовки), --ff = Manrope;
# latin-ext і роздільник тисяч Manrope тут (у спільному site-chrome.v1.css Manrope більше немає)
KAB_FONTS_CSS = ''.join(
    _face(fam, st, w, f'{base}-{sub}', rng)
    for fam, st, w, base in (('Manrope', 'normal', '200 800', 'manrope'), ('Cormorant Garamond', 'normal', '300 700', 'cormorant'),
                             ('Cormorant Garamond', 'italic', '300 700', 'cormorant-italic'))
    for sub, rng in (('cyrillic', _CYR), ('latin', _LAT))
) + _face('Manrope', 'normal', '200 800', 'manrope-latin-ext', _LATX) + _nn_manrope() + (
    '@font-face{font-family:"Manrope Fallback";src:local("Arial"),local("Helvetica"),local("Liberation Sans");size-adjust:96.5%;'
    'ascent-override:110.5%;descent-override:31.1%;line-gap-override:0%}'
    '@font-face{font-family:"Cormorant Fallback";src:local("Times New Roman"),local("Times"),local("Liberation Serif");'
    'size-adjust:96.1%;ascent-override:96.1%;descent-override:29.9%;line-gap-override:0%}'
    ':root:root{--ff:"Manrope","Manrope Fallback",system-ui,sans-serif}')
KAB_FONTS_TAG = f'<style id="cas-fonts">{KAB_FONTS_CSS}</style>'
FONTS_RX = re.compile(r'<style id="cas-fonts">.*?</style>', re.S)


# Типографіка цін для всіх мов: суми, валюта й діапазони не розриваються переносом рядка («od $6 / 300», «30– / 60 dni»).
# Лише текст у <body> (не атрибути, не <script>/<style>/<title>/<textarea>/<pre>/<code>), JSON-LD не чіпаємо.
NB = '\u00a0'
_NB_SKIP = ('script', 'style', 'title', 'textarea', 'pre', 'code', 'svg', 'template')
_NB_THOUS = re.compile(r'(?<![\d.,])(\d{1,3})((?: \d{3})+)(?!\d)')
_NB_PREP = re.compile(r'(?<!\w)(від|до|от|около|близько|od|do|from|to|ab|bis|desde|hasta|dès|minimum|min\.|мін\.|≈|~|=|×) (?=[$€₴]|\d)', re.I)
_NB_TIMES = re.compile(r'(\d|m²|м²) ([×=]) ')
_NB_UNIT = re.compile(r'(\d) (₴|грн|zł|PLN|USD|EUR|€|m²|м²|m2|м2|%|dni|dnia|днів|дні|дня|тижні|тижнів|тижня|тиждень|місяців|міс\.|days|weeks|months|días|semanas|meses|jours|semaines|mois|Tage|Wochen|Monate|tygodnie|tygodni|miesięcy|сотку|сотки|соток|шт|szt\.|pcs|cm|см|мм|mm|кг|kg|м|m)(?!\w)')
# час «10:00–20:00» — цілий діапазон (раніше ловилось «00–20» посеред часу, і рядок рвався на «10:» / «00–20» / «:00»)
_NB_RANGE = re.compile(r'(?<![\w–-])(?<!\d:)(\$?\d+(?::\d\d)?(?:[\u00a0\u202f,]\d{3})*[–-]\$?\d+(?::\d\d)?(?:[\u00a0\u202f,]\d{3})*)(?![\w–-]|:\d)')
# однолітерні прийменники й сполучники (uk/ru) не лишаються в кінці рядка: «з Китаю», «і бар»
_NB_ONE = re.compile(r'(?<![\w\u00a0-])([зйіувоаксиЗЙІУВОАКСИ]) (?=\S)')
_NB_ONE_PL = re.compile(r'(?<![\w\u00a0-])([wzioauWZIOAU]) (?=\S)')  # pl: «w Kijowie», «z UE»
_NB_TAG = re.compile(r'<(' + '|'.join(_NB_SKIP) + r')\b[^>]*>.*?</\1\s*>|<!--.*?-->|<[^>]*>', re.S | re.I)


_NB_ARROW = re.compile(r' ([→←])(?=\s*$)')


# Єдиний формат цін (Михайло 16.11.2026): «від $1 100/м²» — тисячі вузьким нерозривним пробілом (U+202F; en, zh — «$1,100»),
# одиниця через «/» без пробілів («$30 / м²», «$30 за м²», «$30 per m²» → «$30/м²»). Суми не змінюються.
NN = '\u202f'
_PR_SEP = '[ \u00a0\u202f,]'
_PR_NUM = re.compile(r'(?<=\$)(\d{1,3}(?:' + _PR_SEP + r'\d{3})+)(?![\d,]\d)|(?<=\d[–-])(\d{1,3}(?:' + _PR_SEP + r'\d{3})+)(?![\d,]\d)')
_PR_UNIT = re.compile(r'(\$\d[\d,\u202f]*(?:[–-]\$?\d[\d,\u202f]*)?)[ \u00a0\u202f]*(?:/|(?:за|za|per|pro|par|por)(?=[ \u00a0\u202f]))[ \u00a0\u202f]*'
                      r'(м²|m²|м2|m2|م²|сотку|сотки|соток|ar(?![\w]))')


def price_fmt(t, lang=None):
    """«$1 100 за м²» → «$1 100/м²» (U+202F; en/zh — «$1,100/m²»). Ідемпотентно; суми не змінюються."""
    if '$' not in t:
        return t
    sep = ',' if lang in ('en', 'zh') else NN
    t = _PR_NUM.sub(lambda m: re.sub(_PR_SEP, sep, m.group(0)), t)
    return _PR_UNIT.sub(r'\1/\2', t)


_PR_ATTR = re.compile(r'(\s(?:alt|title|aria-label|content|data-xs)=")([^"]*\$[^"]*)(")')

# ar (RTL): «$2 500» — в ізоляті LTR (U+2066 … U+2069), інакше алгоритм bidi після арабських літер ставить «$» праворуч
# від числа («2 500$»). Лише видимий текст <body> і data-xs плиток (content:attr()); title/meta/alt/JSON-LD — без ізоляції.
# Те саме, що iso() у /assets/calc.v1.js; ідемпотентно (старі ізоляти прибираємо й ставимо заново).
_ISO_NUM = r'\d(?:[\d\u202f\u00a0,.]*\d)?'
_ISO_RX = re.compile(r'\$' + _ISO_NUM + r'(?:[–-]\$?' + _ISO_NUM + ')?')


def price_iso(t):
    t = t.replace('\u2066', '').replace('\u2069', '')
    return _ISO_RX.sub(lambda m: '\u2066' + m.group(0) + '\u2069', t) if '$' in t else t


def prices_all(s, lang=None):
    """Формат цін поза текстом <body>: <title>, атрибути (meta description, alt, data-xs…), JSON-LD."""
    if '$' not in s:
        return s
    s = re.sub(r'(<title>)(.*?)(</title>)', lambda m: m.group(1) + price_fmt(m.group(2), lang) + m.group(3), s, count=1, flags=re.S)
    s = re.sub(r'<script type="application/ld\+json">.*?</script>|<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<[a-zA-Z][^<>]*\$[^<>]*>',
               lambda m: price_fmt(m.group(0), lang) if m.group(0).startswith('<script type="application/ld+json">')
               else _PR_ATTR.sub(lambda a: a.group(1) + _attr_price(a, lang) + a.group(3), m.group(0))
               if m.group(0)[1:2].isalpha() and not m.group(0).startswith(('<script', '<style')) else m.group(0), s, flags=re.S)
    return s


def _attr_price(a, lang):
    t = price_fmt(a.group(2), lang)
    return price_iso(t) if lang == 'ar' and a.group(1).endswith('data-xs="') else t


def _nb_text(t, lang=None):
    t = price_fmt(t, lang)
    t = _NB_THOUS.sub(lambda m: m.group(1) + m.group(2).replace(' ', NB), t)
    t = _NB_TIMES.sub(lambda m: m.group(1) + NB + m.group(2) + ' ', t)
    t = _NB_PREP.sub(lambda m: m.group(1) + NB, t)
    t = _NB_UNIT.sub(lambda m: m.group(1) + NB + m.group(2), t)
    t = _NB_ONE.sub(lambda m: m.group(1) + NB, t)
    t = _NB_ARROW.sub(NB + r'\1', t)  # «сторінка проєкту →»: стрілка не переноситься сама на новий рядок
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
            if lang == 'ar':
                x = price_iso(x)
        parts.append(x)
        if m:  # тег, коментар або цілий блок <script>/<style>/… — без змін
            parts.append(m.group(0))
            prev, pos = m.group(0), m.end()
    return head + ''.join(parts)


def fonts_block(s, rel=''):
    """Єдиний блок @font-face (див. FONTS_CSS) на сторінці; кабінет — свій (KAB_FONTS_CSS, Manrope)."""
    tag = KAB_FONTS_TAG if rel.startswith('kabinet') else FONTS_TAG
    return FONTS_RX.sub(lambda m: tag, s, count=1)

import i18n  # реєстр мов, hreflang-кластери (tools/site/i18n.py)
import oztext  # тексти про Оздобу, поки вона прихована (tools/site/oztext.py)
import flags  # перемикачі сайту: OZDOBA_PUBLIC — Оздоба прихована з 12.11.2026 (tools/site/flags.py)
OZDOBA_PUBLIC = flags.OZDOBA_PUBLIC

LANGS = i18n.LANGS
HOME = {l: i18n.home(l) for l in LANGS}
LANG_CODE = {l: i18n.meta(l)['code'] for l in LANGS}
LANG_NAME = {l: i18n.meta(l)['name'] for l in LANGS}
MSG = [('telegram', 'Telegram', 'https://t.me/+380978667755'), ('viber', 'Viber', 'viber://chat?number=%2B380978667755'),
       ('whatsapp', 'WhatsApp', 'https://wa.me/380978667755'), ('instagram', 'Instagram', 'https://www.instagram.com/cas_development/')]
# іконки месенджерів і соцмереж у шапці/футері — фоном через CSS (.bi-<name> у /assets/site-chrome.v1.css), без <img> у HTML
BRAND_IMG = {'instagram': '/assets/brand/instagram-96.png'}  # решта — /assets/brand/<name>.svg
# соцмережі у футері (іконки-посилання з aria-label): Instagram + YouTube з tools/site/media.json
# (youtube_channel; порожнє — посилання немає). media.py ставить канал і в sameAs JSON-LD та на /contact.
try:
    _MEDIA = json.load(open(os.path.join(ROOT, 'tools/site/media.json'), encoding='utf-8'))
except (OSError, ValueError):
    _MEDIA = {}
SOCIAL = [('instagram', 'Instagram', 'https://www.instagram.com/cas_development/')]
if re.match(r'^https://www\.youtube\.com/(@[\w.\-]+|channel/UC[\w-]{22})$', _MEDIA.get('youtube_channel') or ''):
    SOCIAL.append(('youtube', 'YouTube', _MEDIA['youtube_channel']))
# LinkedIn Михайла (CEO) — Михайло 09.11.2026
SOCIAL.append(('linkedin', 'LinkedIn', 'https://www.linkedin.com/in/mykhailo-litovchuk-818846244'))
# TikTok Михайла «Міша під ключ» — Михайло 09.11.2026
SOCIAL.append(('tiktok', 'TikTok', 'https://www.tiktok.com/@li_mi_tless'))
# Behance Михайла — Михайло 21.11.2026
SOCIAL.append(('behance', 'Behance', 'https://www.behance.net/mykhailol2'))
# WeChat (Михайло 08.11.2026, у футері — 21.11.2026): веб-посилання на чат за номером немає — клік копіює номер і показує підказку
# (обробник a[data-wx] у site-chrome.v1.js), на телефоні далі відкриває застосунок; без JS — weixin://
WECHAT = '+380 63 866 77 55'
SOCIAL.append(('wechat', f'WeChat {WECHAT}', 'weixin://'))
SOCIAL_K = {x[0] for x in SOCIAL}
SOC_LABEL = {'uk': 'Соцмережі', 'ru': 'Соцсети', 'en': 'Social media', 'es': 'Redes sociales', 'zh': '社交媒体', 'pl': 'Media społecznościowe',
             'de': 'Soziale Medien', 'fr': 'Réseaux sociaux', 'pt': 'Redes sociais', 'ar': 'التواصل الاجتماعي'}

T = {
    'uk': dict(
        nav=[('/services', 'Послуги'), ('/portfolio', 'Портфоліо'), ('/ozdoba', 'Оздоба'), ('/blog', 'Блог'),
             ('/about', 'Про студію'), ('/contact', 'Контакти')],
        nav_label='Головне меню', menu='Меню', skip='Перейти до змісту', menu_open='Відкрити меню', menu_close='Закрити меню', lang_label='Мова сайту',
        cta='Заявка', cta_href='/contact#zayavka', home_label='CAS Development — на головну', kab='Кабінет', kab_full='Кабінет клієнта',
        tagline='Студія дизайну інтерʼєру, ремонту й будівництва під ключ. Київ, з 2016 року.',
        contacts='Контакти', address='вул. Антоновича, 44, Київ', msg='Месенджери', lang='Мова',
        privacy=('/konfidentsiinist', 'Політика конфіденційності'), terms=('/umovy-korystuvannia', 'Умови'), copy='© 2026 CAS Development · Київ, Україна',
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
                                 ('/pytannya', 'Часті питання'), ('/dogovir-garantiya-oplata', 'Договір, гарантія, оплата'), ('/referalna-prohrama', 'Реферальна програма'), ('/blog', 'Блог: ціни й поради')]),
            ('Географія', [('/dyzain-i-remont-kyivska-oblast', 'Київська область'), ('/dyzain-i-remont-ukraina', 'Дизайн і ремонт по Україні'),
                           ('/remont-i-budivnytstvo-yevropa', 'Ремонт і будівництво в Європі'), ('/dyzain-interieru-po-vsomu-svitu', 'По всьому світу')]),
        ]),
    'ru': dict(
        nav=[('/ru/uslugi', 'Услуги'), ('/ru/portfolio', 'Портфолио'), ('/ozdoba', 'Оздоба'), ('/ru/blog', 'Блог'),
             ('/ru/o-nas', 'О студии'), ('/ru/kontakty', 'Контакты')],
        nav_label='Главное меню', menu='Меню', skip='Перейти к содержанию', menu_open='Открыть меню', menu_close='Закрыть меню', lang_label='Язык сайта',
        cta='Заявка', cta_href='/ru/#zayavka', home_label='CAS Development — на главную', kab='Кабинет', kab_full='Кабинет клиента',
        tagline='Студия дизайна интерьера, ремонта и строительства под ключ. Киев, с 2016 года.',
        contacts='Контакты', address='ул. Антоновича, 44, Киев', msg='Мессенджеры', lang='Язык',
        privacy=('/ru/konfidentsialnost', 'Политика конфиденциальности'), terms=('/ru/usloviya-ispolzovaniya', 'Условия'), copy='© 2026 CAS Development · Киев, Украина',
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
                                   ('/ru/voprosy', 'Частые вопросы'), ('/ru/dogovor-garantiya-oplata', 'Договор, гарантия, оплата'), ('/ru/referalnaya-programma', 'Реферальная программа'), ('/ru/blog', 'Блог: цены и советы')]),
            ('География', [('/ru/dizayn-i-remont-kievskaya-oblast', 'Киевская область'), ('/ru/dizayn-i-remont-ukraina', 'Дизайн и ремонт по Украине'),
                           ('/ru/remont-i-stroitelstvo-evropa', 'Ремонт и строительство в Европе'), ('/ru/dizayn-interera-po-vsemu-miru', 'По всему миру')]),
        ]),
}
for _l in LANGS:  # нові мови — словник chrome з tools/site/lang/<мова>.json
    if _l not in T and i18n.ui(_l):
        _c = dict(i18n.ui(_l)['chrome'])
        _c['privacy'] = tuple(_c['privacy'])
        if _c.get('terms'):
            _c['terms'] = tuple(_c['terms'])
        T[_l] = _c


def _live(links):
    """Лише посилання на наявні сторінки (зовнішні й #якорі — як є)."""
    return [(h, n) for h, n in links if (not h.startswith('/') or h.startswith('/#') or i18n.exists(h))
            and (OZDOBA_PUBLIC or not flags.oz_href(h))]  # Оздоба прихована — без пунктів меню/футера

LOGO = '<a class="sch-logo" href="{home}" aria-label="{label}">CAS<em>.</em>Development</a>'
BURGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sch-b1" d="M4 7h16"/><path class="sch-b2" d="M4 12h16"/><path class="sch-b3" d="M4 17h16"/></svg>'
# іконки кабінету й калькулятора — CSS-маски (.sch-kab, .sch-mkab, .sch-mcalc у site-chrome.v1.css), не інлайн-SVG: бюджет HTML лендингів
KAB_HREF = '/kabinet'  # кабінет клієнта — один URL на всі мови; мову передає ?lang=xx (kab_lang), далі її памʼятає кабінет
_KAB_A = re.compile(r'(href=")(/kabinet(?:/[\w-]+)*)(\?[^"#]*)?(#[^"]*)?(")')


def kab_lang(s, lang):
    """Посилання на кабінет клієнта зі сторінок мови ≠ uk → /kabinet…?lang=xx (кабінет вибирає мову інтерфейсу,
    tools/shop/kabinet_v2.py). Кабінет працівника й адмінка (/kabinet/team, /kabinet/admin) — українською, без мітки. Ідемпотентно."""
    if lang == 'uk':
        return s

    def one(m):
        q = m.group(3) or ''
        if re.match(r'/kabinet/(?:team|admin)\b', m.group(2)) or re.search(r'[?&;]lang=', q):
            return m.group(0)
        q = (q + '&amp;' if q else '?') + 'lang=' + lang
        return m.group(1) + m.group(2) + q + (m.group(4) or '') + m.group(5)
    i = s.find('<body')
    return s if i < 0 else s[:i] + _KAB_A.sub(one, s[i:])
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
    m = re.fullmatch(r'(/[a-z]{2})/portfolio', href)  # портфоліо мови: її сторінки проєктів /en/proekty/…
    if m:
        sect[href] = (m.group(1) + '/proekty/',)
    if re.fullmatch(r'(?:/[a-z]{2})?/blog', href):  # блог будь-якою мовою: /blog, /ru/blog, /en/blog …
        sect[href] = (href + '/',)
    return path.startswith(sect.get(href, ('\0',)))


def lang_links(lang, alts, cls):
    """Усі мови сайту (з наявною головною): посилання на hreflang-пару, інакше — на головну мови."""
    out = []
    for l in i18n.enabled():
        # шапка й футер — короткі коди (UA RU EN…), повна назва — у title/aria-label (Михайло 08.11.2026)
        label = LANG_CODE[l]
        nm = LANG_NAME[l]
        if l == lang:
            out.append(f'<span class="{cls}-on" aria-current="true" lang="{i18n.meta(l)["html"]}" title="{nm}">{label}</span>')
        else:
            # меню бургера (sch-lang, сенсорні екрани) — без title: підказка при наведенні там не потрібна, aria-label лишається (−~150 Б HTML, 10 мов з pt)
            tt = '' if cls == 'sch-lang' else f' title="{nm}"'
            out.append(f'<a href="{alts.get(l, HOME[l])}" hreflang="{i18n.meta(l)["hreflang"]}" lang="{i18n.meta(l)["html"]}"{tt} aria-label="{nm}">{label}</a>')
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
    return (f'<details class="sch-ld"><summary aria-label="{LANG_CODE[lang]} — {label}: {LANG_NAME[lang]}">{LANG_CODE[lang]}</summary>'
            f'<div class="sch-ld-m">{"".join(items)}</div></details>')


CALC_SHORT = {'uk': 'Калькулятор', 'ru': 'Калькулятор', 'en': 'Calculator', 'es': 'Calculadora', 'pl': 'Kalkulator',
              'fr': 'Calculateur', 'pt': 'Calculadora', 'de': 'Rechner', 'zh': '计算器', 'ar': 'الحاسبة'}


def header(lang, path, alts, tools='', cta_href=None):
    t = T[lang]
    items = ''.join(f'<a href="{h}"' + (' aria-current="page"' if current(lang, path, h) else '') + f'>{n}</a>' for h, n in _live(t['nav']))
    cta = cta_href or t['cta_href']
    tools_html = f'<div class="sch-tools">{tools}</div><!--/sch-tools-->' if tools.strip() else ''
    # месенджери мобільного меню — лише іконки, як у футері (Михайло 21.11.2026): назва — aria-label і title, іконки — CSS (.bi-*);
    # + WeChat (клік копіює номер — a[data-wx] у site-chrome.v1.js; без JS — weixin://)
    mrow = MSG[:3] + [x for x in SOCIAL if x[0] == 'wechat'] + MSG[3:]
    msg = ''.join(f'<a class="bi bi-{k}" href="{u}"' + (' target="_blank"' if u.startswith('http') else '')
                  + (f' data-wx="{WECHAT}"' if k == 'wechat' else '') + f' aria-label="{n}"></a>' for k, n, u in mrow)  # без title: меню лише на тачі, а бюджет HTML 64 КБ
    msg += flags.chat_icon(lang, title=False)  # чат на сайті — лише іконкою, коли CHAT_PUBLIC (tools/site/flags.py)
    kab_cur = ' aria-current="page"' if path == KAB_HREF or path.startswith(KAB_HREF + '/') else ''
    kab = f'<a class="sch-kab" href="{KAB_HREF}" title="{t["kab_full"]}"{kab_cur}><span>{t["kab"]}</span></a>'
    # швидкі кнопки мобільного меню: кабінет і калькулятор вартості (якщо сторінка калькулятора цією мовою є)
    calc = next(((h, n) for _, links in t['groups'] for h, n in _live(links) if re.search(r'kalk|calc', h)), None)
    quick = f'<a class="sch-mkab" href="{KAB_HREF}"{kab_cur}>{t["kab_full"]}</a>'
    # калькулятор — і в десктопному меню (Михайло 26.10.2026), коротким підписом після «Оздоби»
    nav_items = items
    if calc and lang in ('uk', 'ru'):  # у довших мовах меню вже на межі ширини шапки
        cl = CALC_SHORT.get(lang, calc[1])
        ca = f'<a href="{calc[0]}"' + (' aria-current="page"' if calc[0] == path else '') + f'>{cl}</a>'
        k = nav_items.find('href="/ozdoba')
        if k < 0:  # Оздоба прихована (flags.OZDOBA_PUBLIC) — калькулятор після «Портфоліо»
            k = nav_items.find('portfolio"')
        k = nav_items.find('</a>', k) + 4 if k >= 0 else len(nav_items)
        nav_items = nav_items[:k] + ca + nav_items[k:]
    if calc:
        quick += f'<a class="sch-mcalc" href="{calc[0]}"' + (' aria-current="page"' if calc[0] == path else '') + f'>{calc[1]}</a>'
    return (
        f'<!--chrome:h--><header class="sch{" sch--tools" if tools_html else ""}" id="top">\n'
        '<div class="sch-in">\n'
        f'  {LOGO.format(home=HOME[lang], label=t["home_label"])}\n'
        f'  <nav class="sch-nav" aria-label="{t["nav_label"]}">{nav_items}</nav>\n'
        f'  <div class="sch-act">{tools_html}'
        f'<div class="sch-lang" role="group" aria-label="{t["lang_label"]}">{lang_menu(lang, alts, t["lang_label"])}</div>{kab}'
        f'<a class="sch-tel" href="tel:{PHONE}">{PHONE_SVG}<span>{PHONE_TXT}</span></a>'
        f'<a class="sch-cta" href="{cta}">{t["cta"]}</a>'
        f'<button class="sch-burger" type="button" aria-expanded="false" aria-controls="sch-menu" aria-label="{t["menu_open"]}"'
        f' data-open="{t["menu_open"]}" data-close="{t["menu_close"]}">{BURGER}</button></div>\n'
        '</div>\n'
        f'<div class="sch-menu" id="sch-menu" role="dialog" aria-modal="true" aria-label="{t["menu"]}" hidden><div class="sch-menu-in">\n'
        f'  <div class="sch-mq">{quick}</div>\n'
        f'  <nav class="sch-mnav" aria-label="{t["nav_label"]}">{items}</nav>\n'
        f'  <div class="sch-mlang" role="group" aria-label="{t["lang_label"]}">{lang_links(lang, alts, "sch-lang")}</div>\n'
        f'  <div class="sch-mcta"><a class="sch-cta" href="{cta}">{t["cta"]}</a><a class="sch-mtel" href="tel:{PHONE}">{PHONE_SVG}{PHONE_TXT}</a></div>\n'
        f'  <div class="sch-mmsg" role="group" aria-label="{t["msg"]}">{msg}</div>\n'
        '</div></div>\n'
        '</header><!--/chrome:h-->'
    )


# Кнопка «Розрахувати проєкт» у футері (Михайло 24.11.2026: «збоку зробити кнопку "Розрахувати проєкт", після натискання якої відкриється
# вже вікно розрахунку»): форма заявки — вікно (lead-form.v1.js, dialog.fdl), кнопка — посилання на #zayavka цієї сторінки або форми мови
FOOT_CTA = {'uk': 'Розрахувати проєкт', 'ru': 'Рассчитать проект', 'en': 'Estimate your project', 'es': 'Calcular su proyecto',
            'zh': '估算项目费用', 'pl': 'Wyceń projekt', 'de': 'Projekt kalkulieren', 'fr': 'Chiffrer votre projet',
            'pt': 'Orçamentar o projeto', 'ar': 'احسب تكلفة مشروعك'}


def footer(lang, alts, cta=None):
    """cta — href кнопки «Розрахувати проєкт» (None — без кнопки: кабінет, Оздоба)."""
    # target="_blank" без rel="noopener": браузери ставлять noopener для _blank самі (HTML, 2021+), а бюджет HTML 64 КБ (22.11.2026)
    t = T[lang]
    # месенджери й соцмережі — один ряд однакових кнопок-іконок (Михайло 08.11.2026); назва — aria-label і title;
    # без видимого підпису «Месенджери» — лише іконки (Михайло 21.11.2026), підпис лишається в aria-label групи
    soc_l = t.get('soc') or SOC_LABEL.get(lang, SOC_LABEL['en'])
    row = [x for x in MSG if x[0] not in SOCIAL_K] + SOCIAL
    soc = ''.join(f'<a class="bi bi-{k}" href="{u}"' + (' target="_blank"' if u.startswith('http') else '')
                  + (f' data-wx="{WECHAT}"' if k == 'wechat' else '') + f' aria-label="{n}" title="{n}"></a>' for k, n, u in row)
    soc += flags.chat_icon(lang)  # чат на сайті — ще одна іконка ряду, коли CHAT_PUBLIC (tools/site/flags.py)
    groups = ''.join(f'<div><b>{g}</b>' + ''.join(f'<a href="{h}">{n}</a>' for h, n in links) + '</div>' for g, links in [(g, _live(x)) for g, x in t['groups']] if links)
    langs = lang_links(lang, alts, 'scf-lang')
    # «Умови використання» — поруч із політикою, коротка назва (Михайло 09.11.2026); посилання — лише коли сторінка є
    terms = ''.join(f'<a href="{h}">{n}</a>' for h, n in _live([t['terms']])) if t.get('terms') else ''
    # «Cookies» (Михайло 22.11.2026): плашка вибору аналітики (site-chrome.v1.js, a[data-ck]); без JS — розділ #cookies політики
    ck = f'<a href="{t["privacy"][0]}#cookies" data-ck>Cookies</a>'
    return (
        '<!--chrome:f--><footer class="scf">\n'
        '<div class="scf-in">\n'
        '  <div class="scf-top">\n'
        # без підпису студії й заголовка «Контакти» (Михайло 24.11.2026): логотип, адреса й телефон — один блок, «Контакти» — aria-label групи
        f'    <div class="scf-brand">{LOGO.format(home=HOME[lang], label=t["home_label"])}'
        f'<div class="scf-col" role="group" aria-label="{t["contacts"]}"><address>{t["address"]}</address><a class="scf-tel" href="tel:{PHONE}">{PHONE_TXT}</a></div></div>\n'
        + (f'    <a class="btn main scf-cta" href="{cta}">{FOOT_CTA.get(lang, FOOT_CTA["en"])}</a>\n' if cta else '')
        + f'    <div class="scf-col scf-ms"><div class="scf-soc" role="group" aria-label="{t["msg"]} · {soc_l}">{soc}</div></div>\n'
        '  </div>\n'
        f'  <details class="scf-svc"><summary>{t["svc"]}</summary><nav class="scf-svc-g" aria-label="{t["svc_label"]}">{groups}</nav></details>\n'
        f'  <div class="scf-bot"><div class="scf-langs" role="group" aria-label="{t["lang"]}">{langs}</div>'
        f'<div class="scf-legal"><a href="{t["privacy"][0]}">{t["privacy"][1]}</a>{terms}{ck}<span>{t["copy"].split(" · ")[0]}</span></div></div>\n'
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


def prune_css(css, ozd=False, bad=None):
    """Прибирає з CSS правила старої шапки/футера (у т.ч. всередині @media); змішані списки селекторів — чистить.
    bad(селектор) → True — свій критерій «мертвого» селектора (legacy_css)."""
    bad = bad or (lambda sel: _bad_selector(sel, ozd))
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
            inner = prune_css(css[j + 1:k - 1], ozd, bad)
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
        keep = [p for p in parts if not bad(re.sub(r'/\*.*?\*/', '', p, flags=re.S))]
        if len(keep) == len(parts):
            out.append(pre + body)
        elif keep:
            out.append(lead + ','.join(keep) + body)
        else:
            out.append(lead.rstrip() + ('\n' if lead.strip() else ''))
        i = k + 1
    return ''.join(out)


# Спільні інлайн-блоки <style id="ui-polish"> і <style id="m-fix"> писались для старої головної: світла тема (body.light),
# інлайн-лайтбокси #lb/#plb/#sdlb/.lb, бічне меню .nsb, поява .reveal/.rv, картки .sv-card/.sp-card, стрічки .strip із .ui-sc…
# Цієї розмітки на сайті вже немає (тему й reveal прибрано, лайтбокс — /assets/lightbox.v1.js, шапка — chrome.py), а правила
# їхали в кожній сторінці: ~2,7 КБ з бюджету HTML 64 КБ. legacy_css() знімає правило лише тоді, коли його клас/id не трапляється
# ні в розмітці сторінки, ні в її інлайн-скриптах (19.11.2026); класи, які ставить ui-polish.v1.js (.xp, .ui-sc, .ui-fade…),
# живі, лише якщо на сторінці є блок, який він обгортає. Каскад решти правил не змінюється. Короткі назви, що збігаються
# з класами SVG сцен (.slab, .lbl, .sl, .fl, .fc), не чіпаємо.
_LEG_ID = ('lb', 'plb', 'sdlb', 'quickForm')
_LEG_CLS = ('light', 'lb', 'strip-nav', 'strip-nav-l', 'strip-nav-r', 'hdesc', 'pf-fnav', 'pf-fnav-l', 'pf-fnav-r', 'sv-card', 'sv-toggle', 'sv-more',
            'spc-cta', 'pcarousel-nav', 'proj-row-btn', 'proj-row-head', 'pf-view-btn', 'hbtns', 'prod-soon-sub', 'reveal', 'rv', 'rv-in', 'au',
            'sp-card', 'sp-card-detail', 'proc-step', 'ps-more', 'nsb', 'nsb-ov', 'prs-nav', 'prs-nav-l', 'prs-nav-r', 'sp-card-hint', 'spc-time',
            'pc-item-label', 'qf-sub', 'proj-cover-loc', 'sv-more-tag', 'mob-ct-lbl', 'ab-l', 'cr-label', 'sec-s', 'hbg-btn', 'lang-cycle',
            'nsb-close', 'qf-close', 'calc-tab', 'ps-tog', 'splink', 'mob-contacts', 'mob-ct-btn')
# класи, які додає /assets/ui-polish.v1.js: живі, якщо на сторінці є хоч один блок, який він шукає
_LEG_JS = {('sv-more', 'sp-card-detail', 'ps-more'): ('xp', 'xp-in'),
           ('proj-row-scroll', 'strip', 'pf-filter'): ('ui-sc', 'ui-fade', 'ui-fade-l', 'ui-fade-r', 'ui-ov', 'ui-cnt', 'ui-start', 'ui-end',
                                                       'ui-nudge', 'ui-hint', 'ui-used', 'ui-touch')}
_LEG_BLOCK = re.compile(r'(<style id="(?:ui-polish|m-fix)">)(.*?)(</style>)', re.S)
_LEG_TOK = re.compile(r'([.#])([A-Za-z_][\w-]*)')
_LEG_KF = re.compile(r'@keyframes ([\w-]+)\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}')


def legacy_css(s):
    """Знімає зі спільних блоків ui-polish / m-fix правила для розмітки, якої на сторінці немає (див. вище). Ідемпотентно."""
    if not _LEG_BLOCK.search(s):
        return s
    rest = _LEG_BLOCK.sub('', s)
    words = set(re.findall(r'[A-Za-z_][\w-]*', ' '.join(re.findall(r'\b(?:class|id)="([^"]*)"', rest))))
    for js in re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>(.*?)</script>', rest, re.S):
        words |= set(re.findall(r'[A-Za-z_][\w-]*', js))  # розмітка з інлайн-скриптів (ручні сторінки)
    dead = {('#', t) for t in _LEG_ID if t not in words} | {('.', t) for t in _LEG_CLS if t not in words}
    for need, cls in _LEG_JS.items():
        if not any(t in words for t in need):
            dead |= {('.', t) for t in cls if t not in words}
    if not dead:
        return s

    def bad(sel):
        return any((a, b) in dead for a, b in _LEG_TOK.findall(sel))

    def fix(m):
        css = prune_css(m.group(2), bad=bad)
        # @keyframes, на які після чистки ніщо не посилається
        css = _LEG_KF.sub(lambda k: k.group(0) if re.search(r'animation(?:-name)?:[^;}]*\b' + re.escape(k.group(1)) + r'\b', css) else '', css)
        css = re.sub(r'@media[^{}]*\{\s*\}', '', css)
        return m.group(1) + css + m.group(3)
    return _LEG_BLOCK.sub(fix, s)


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
                     lambda m: m.group(1) + f'<img src="/assets/brand/{name}.svg" width="32" height="32" alt="" loading="lazy" decoding="async">', blk, flags=re.S)
    # меню пігулки сховане (display:none) до тапу: lazy — логотипи не ділять канал з LCP-фото на першому завантаженні
    blk = blk.replace('width="32" height="32" alt="" decoding="async">', 'width="32" height="32" alt="" loading="lazy" decoding="async">')
    return s[:k] + blk + s[e:]


# Нижня панель → ОДНА компактна кнопка «Зв'язатися» в куті (Михайло 05.11.2026: «зменш "Залишити заявку" — до одного знизу»);
# з 23.11.2026 — круглі кнопки без тексту: кружечок дзвінка (меню нижче) і поруч кружечок бота-помічника (a.mb-bot[data-chat], лише CHAT_PUBLIC).
# Тап по кружечку дзвінка відкриває невелике меню: ряд іконок Подзвонити (tel:), Telegram, WhatsApp, Viber, WeChat (лише іконки, Михайло 21.11.2026 — mb_icons) і «Залишити номер» (до єдиної форми #zayavka;
# /assets/lead-form.v1.js прокручує до поля телефону й ставить фокус). Посилання панелі з усіма атрибутами лишаються як були.
# Стилі — «Кнопка Зв'язатися» в site-chrome.v1.css (.mbar[data-one]; на ПК панелі немає — у шапці телефон і «Заявка»),
# відкриття/закриття — site-chrome.v1.js. Ідемпотентно: згенеровані частини (кнопка, обгортка, Viber, «Залишити номер») знімаємо й ставимо заново.
MB_ONE = dict(uk=("Зв'язатися",), ru=('Связаться',), en=('Contact',), es=('Contactar',), zh=('联系我们',), pl=('Kontakt',), de=('Kontakt',), fr=('Contact',), pt=('Contactar',), ar=('تواصل معنا',))
VIBER = 'viber://chat?number=%2B380978667755'
MB_LEAD_RX = re.compile(r'<style id="mb-lead">.*?</style>|<a class="mb-(?:lead|vb|wx|chat|bot)"[^>]*>.*?</a>\n?|<button type="button" class="mb-tg"[^>]*>.*?</button>\n?|<div class="mb-menu"[^>]*>\n?|</div><!--/mb-menu-->\n?', re.S)


# Базова панель .mbar (стилі m-fix + посилання) для сторінок, що будуються без неї (каталог 3D-турів /tury і /<мова>/tury,
# Михайло 16.11.2026: лише пігулка «Звʼязатися», без форми). mbar_lead() перетворює її на пігулку з меню, як на решті сайту.
MBAR_CSS = ('<!--m-fix--><style id="m-fix">\n.mbar{display:none}\n@media(max-width:767px){\n'
            'body{padding-bottom:calc(64px + env(safe-area-inset-bottom))}\n'
            '.mbar{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:8px;position:fixed;left:0;right:0;bottom:0;top:auto;height:auto;width:auto;z-index:9990;'
            'padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(14,13,12,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);'
            'border-top:1px solid rgba(191,145,72,.25)}\n'
            '.mbar a{display:flex;align-items:center;justify-content:center;gap:7px;min-height:46px;border-radius:12px;'
            'font:600 var(--fs-small)/1 var(--ff);text-decoration:none;color:#f3eee6;border:1px solid rgba(191,145,72,.35)}\n'
            '.mbar a.mb-call{background:#bf9148;color:#14120f;border-color:#bf9148}\n.mbar svg{width:18px;height:18px;flex:none}\n.mbar img{width:32px;height:32px;flex:none}\n}\n</style>')
_PHONE_SVG = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 '
              '.6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>')


def mbar_add(s, lang):
    """Сторінка без панелі .mbar → базова панель (стилі в <head>, посилання перед </body>); далі mbar_lead(). Ідемпотентно."""
    if '<div class="mbar"' in s:
        return s
    import leadform
    c = leadform._call(lang)
    call = html.escape(c[0] if c else 'Подзвонити')
    img = lambda n: f'<img src="/assets/brand/{n}.svg" width="32" height="32" alt="" loading="lazy" decoding="async">'
    bar = (f'<!--m-fix--><div class="mbar">\n<a class="mb-call" href="tel:+380978667755">{_PHONE_SVG}{call}</a>\n'
           f'<a href="https://t.me/+380978667755" target="_blank" rel="noopener">{img("telegram")}Telegram</a>\n'
           f'<a href="https://wa.me/380978667755" target="_blank" rel="noopener">{img("whatsapp")}WhatsApp</a>\n</div>\n')
    if 'id="m-fix"' not in s:
        s = s.replace('</head>', MBAR_CSS + '\n</head>', 1)
    k = s.rfind('</body>')
    return s[:k] + bar + s[k:] if k >= 0 else s


MB_NAMES = (('tel:', None), ('https://t.me/', 'Telegram'), ('https://wa.me/', 'WhatsApp'), ('viber://', 'Viber'), ('weixin://', 'WeChat ' + WECHAT))


def mb_icons(body, lang):
    """Меню пігулки — ряд іконок (Михайло 21.11.2026): з посилань панелі прибираємо видимий текст, назва — aria-label і title
    (дзвінок — «Подзвонити» мовою сторінки, leadform._call; решта — назва месенджера за адресою). Ідемпотентно."""
    import leadform
    c = leadform._call(lang)
    call = c[0] if c else 'Подзвонити'

    def one(m):
        tag, inner = m.group(1), m.group(2)
        href = _attr(tag, 'href') or ''
        name = next((call if n is None else n for pre, n in MB_NAMES if href.startswith(pre)), None)
        if not name:
            return m.group(0)
        tag = re.sub(r'\s(?:aria-label|title)="[^"]*"', '', tag)[:-1] + f' aria-label="{html.escape(name)}">'  # без title: пігулка лише на телефоні (бюджет HTML)
        inner = ''.join(x.group(0) for x in re.finditer(r'<svg\b.*?</svg>|<img\b[^>]*>', inner, re.S))  # лише іконка
        return tag + inner + '</a>'
    return re.sub(r'(<a\b(?![^>]*class="mb-lead")[^>]*>)(.*?)</a>', one, body, flags=re.S)


def mbar_lead(s, lang, rel=''):
    """Панель .mbar → кнопка «Зв'язатися» + меню (ідемпотентно)."""
    import leadform  # тексти легкої заявки (tools/site/leadform.py)
    k = s.find('<!--m-fix--><div class="mbar"')
    if k < 0:
        return MB_LEAD_RX.sub('', s)
    e = s.find('</div>', s.find('>', k))
    e2 = s.find('</div><!--/mb-menu-->', k)
    if 0 <= e2 <= e:  # уже згенеровано: кінець панелі — після обгортки меню
        e = s.find('</div>', e2 + len('</div><!--/mb-menu-->'))
    head = s[:k]
    blk = MB_LEAD_RX.sub('', s[k:e])
    head = MB_LEAD_RX.sub('', head)
    k = len(head)
    if 'class="mb-call"' not in blk:
        return head + blk + s[e:]
    if 'id="zayavka"' in s: href = '#zayavka'
    elif 'id="lead"' in s: href = '#lead'
    else: href = T[lang]['cta_href']
    lab = leadform.T.get(lang, leadform.T['uk'])['mb']
    one = MB_ONE.get(lang, MB_ONE['en'])[0]
    m = re.match(r'(<!--m-fix--><div class="mbar")[^>]*>\n?', blk)  # aria-label панелі — «Швидкий зв'язок» мовою сторінки (landing.py FORM_UK шукає його в шаблоні)
    body = blk[m.end():].strip('\n')
    img = lambda n: f'<img src="/assets/brand/{n}.svg" width="32" height="32" alt="" loading="lazy" decoding="async">'
    vb = '' if 'viber://' in body else f'<a class="mb-vb" href="{VIBER}" target="_blank" rel="noopener">{img("viber")}</a>\n'
    wx = f'<a class="mb-wx" href="weixin://" data-wx="{WECHAT}" aria-label="WeChat {WECHAT}">{img("wechat")}</a>\n'
    body = mb_icons(body, lang)
    aria = ((i18n.ui(lang) or {}).get('form') or {}).get('mbar') or {'ru': 'Быстрая связь'}.get(lang, "Швидкий зв'язок")
    # два кружечки (Михайло 23.11.2026: «кружечок "подзвонити"… а біля нього кружечок з ботом-асистентом»): видимого тексту немає,
    # назва — aria-label/title; іконки — CSS-маски (.mb-tg — слухавка, .mb-bot — чат), бот — перед дзвінком (дзвінок у самому куті)
    one = one.replace('"', '&quot;')
    out = (f'{m.group(1)} data-one role="navigation" aria-label="{aria}">\n{flags.chat_icon(lang, circle=True, href=href)}'
           f'<button type="button" class="mb-tg" aria-expanded="false" aria-controls="mb-menu" aria-label="{one}" title="{one}"></button>\n'
           f'<div class="mb-menu" id="mb-menu">\n{body}\n{mb_icons(vb, lang)}{wx}<a class="mb-lead" href="{href}">{lab}</a>\n</div><!--/mb-menu-->\n')
    return head + out + s[e:]


def chat_href(s, lang):
    """Іконки чату (a[data-chat]) без JS ведуть до форми заявки: на сторінці без #zayavka — до форми мови (T[lang]['cta_href'])."""
    if 'data-chat' not in s or 'id="zayavka"' in s:
        return s
    to = T.get(lang, T['uk'])['cta_href'] if 'id="lead"' not in s else '#lead'
    return re.sub(r'href="#(?:zayavka|chat)"(?= data-chat)', f'href="{to}"', s)


# Microsoft Clarity: вантажимо ЛИШЕ після першої дії відвідувача (scroll/pointerdown/keydown/touchstart), без таймера
# (Михайло 03.11.2026) — не заважає LCP/TBT і не рахує ботів/відмови без дій. Будь-яку стару вставку замінюємо на цю.
# Cookies (Михайло 22.11.2026: «додавай, але Clarity нехай і без згоди працює відразу»): Clarity для всіх — після першої дії, згоди
# не чекає; не вантажиться лише, якщо людина відмовилась (localStorage cas_ck = "0|дата"). Плашка-повідомлення «Добре / Відхилити»
# поза Україною (часовий пояс браузера; Europe/Kyiv|Kiev|Uzhgorod|Zaporozhye — без плашки) і посилання «Cookies» у футері — site-chrome.v1.js.
# window.casCk — {ua, v, n — чи вже вантажили, g() — завантажити, f('add'|'remove') — слухачі першої дії}; сигнали згоди Clarity
# (consentv2 лише після «Добре») — у site-chrome.v1.js. Сніпет мінімальний — бюджет HTML 64 КБ. Без «<» у коді (CLARITY_RX).
CLARITY_ID = 'z19wl000eu'
CLARITY = ('<script>(function(w,d,i){var q=w.clarity=w.clarity||function(){(q.q=q.q||[]).push(arguments)},c="",z="",'
           'E=["scroll","pointerdown","keydown","touchstart"],o={passive:true},k=w.casCk={n:0};'
           'try{c=localStorage.cas_ck||""}catch(e){}try{z=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}'
           'k.v=c=c[0]||"";k.ua=/^Europe\\/(Kiev|Kyiv|Uzh|Zap)/.test(z);'
           'k.f=function(a){E.forEach(function(e){w[a+"EventListener"](e,k.g,o)})};'
           'k.g=function(){if(k.n++)return;k.f("remove");var t=d.createElement("script");t.async=1;t.src="https://www.clarity.ms/tag/"+i;d.head.appendChild(t)};'
           'if(c!="0")k.f("add")})(window,document,"' + CLARITY_ID + '");</script>')
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
# fetchpriority="high" і на preload: без нього Chrome вантажить preload-фото з пріоритетом Low (як звичайне <img> до розкладки)
# і ділить канал зі шрифтами й фото нижче — на телефоні 1.6 Мбіт/с LCP лендингів 2.4–2.5 с (аудит 16.11.2026).
LCP_RX = re.compile(r'<link rel="preload" as="image" data-lcp[^>]*>\n?')


def _attr(tag, name):
    m = re.search(r'\s' + name + r'="([^"]*)"', tag)
    return m.group(1) if m else None


def head_extras(s):
    """Speculation Rules і preload LCP-фото одразу після <meta name="viewport"> (ідемпотентно);
    twitter:card там, де є og:image, але картки немає (юридичні й ручні сторінки)."""
    i = s.find('</head>')
    if i < 0:
        return s
    head, body = s[:i], s[i:]
    if 'name="twitter:card"' not in head:
        head = re.sub(r'(<meta property="og:image" content="[^"]+">\n?)', lambda m: m.group(1) + ('' if m.group(1).endswith('\n') else '\n') + '<meta name="twitter:card" content="summary_large_image">\n', head, count=1)
    head = LCP_RX.sub('', SPEC_RX.sub('', head))
    add = SPEC + '\n'
    vis = re.sub(r'<script\b.*?</script>|<template\b.*?</template>|<noscript\b.*?</noscript>', '', body, flags=re.S)
    m = re.search(r'<img\b[^>]*\bfetchpriority="high"[^>]*>', vis)
    if m and _attr(m.group(0), 'src') and '${' not in m.group(0):
        t = m.group(0)
        # <picture><source media="…"> перед фото (окремий кадр для телефона): preload кожного джерела зі своїм media,
        # а <img> — лише поза цими media, щоб телефон не тягнув зайве десктопне фото
        pic = max(vis.rfind('<picture>', 0, m.start()), vis.rfind('<picture ', 0, m.start()))  # і <picture class="hx-bg"> (головні)
        srcs = re.findall(r'<source\b[^>]*>', vis[pic:m.start()]) if pic >= 0 and '</picture>' not in vis[pic:m.start()] else []
        medias = []
        for src in srcs:
            if _attr(src, 'media') and _attr(src, 'srcset') and not _attr(src, 'type'):
                medias.append(_attr(src, 'media'))
                add += (f'<link rel="preload" as="image" data-lcp fetchpriority="high" imagesrcset="{_attr(src, "srcset")}"'
                        + (f' imagesizes="{_attr(src, "sizes")}"' if _attr(src, 'sizes') else '') + f' media="{_attr(src, "media")}">\n')
        link = f'<link rel="preload" as="image" data-lcp fetchpriority="high" href="{_attr(t, "src")}"'
        if _attr(t, 'srcset'):
            link += f' imagesrcset="{_attr(t, "srcset")}"' + (f' imagesizes="{_attr(t, "sizes")}"' if _attr(t, 'sizes') else '')
        if len(medias) == 1:
            link += f' media="not all and {medias[0]}"'
        add += link + '>\n'
    vp = re.search(r'<meta name="viewport"[^>]*>\n', head) or re.search(r'<head\b[^>]*>\n', head)
    if not vp:
        return s
    return head[:vp.end()] + add + head[vp.end():] + body


# Маркери замість :has() у CSS (швидкість, 09.11.2026): правила виду main:has(>section[data-c=x]) і .hero:has(>[data-c=h])
# змушували Chrome перераховувати стилі всього документа (~2 200 елементів) на кожну зміну DOM усередині main — кожен крок
# сцени «Будинок/Ремонт з нуля» (TBT прокрутки 1.5 с → 0.35 с на телефоні CPU ×4). Розмітка статична (data-c ставить ux.py,
# JS їх не змінює), тож стан :has() відомий під час збирання: data-xg — на main і main>div[id^="p-"] з дочірнім
# section[data-c=x] або section>.w[data-c=x]; data-xh — на .hero з дочірнім [data-c=h];
# data-xd — на [data-c=h] з дочірнім .ux-dup (::first-letter з :has() — найдорожче: перерахунок усього документа на кожну зміну DOM).
# CSS (site-chrome.v1.css, sections.v1.css) — ті самі правила з атрибутами й тією самою специфічністю. Ідемпотентно.
_HM_TAG = re.compile(r'<!--.*?-->|<(script|style|template|textarea|svg)\b.*?</\1\s*>|<(/?)([a-zA-Z][\w-]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>', re.S)
_HM_VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
_HM_RM = re.compile(r' data-x[ghpd](?=[\s/>])')


def _hm_cls(attrs):
    m = re.search(r'\sclass="([^"]*)"', attrs)
    return set(m.group(1).split()) if m else set()


def _hm_dc(attrs):
    m = re.search(r'\sdata-c="([^"]*)"', attrs)
    return m.group(1) if m else None


def has_marks(s):
    s = _HM_RM.sub('', s)
    stack, marks = [], {}  # marks: позиція кінця імені тегу → набір атрибутів
    for m in _HM_TAG.finditer(s):
        if not m.group(3):
            continue
        close, name, attrs = m.group(2), m.group(3).lower(), m.group(4)
        if close:
            for j in range(len(stack) - 1, -1, -1):
                if stack[j]['n'] == name:
                    del stack[j:]; break
            continue
        el = {'n': name, 'a': attrs, 'cls': _hm_cls(attrs), 'dc': _hm_dc(attrs), 'pos': m.end(4), 'xg': False}
        par = stack[-1] if stack else None
        if par:
            pn, pc = par['n'], par['cls']
            if par.get('grid') and name == 'section' and el['dc'] == 'x':
                marks.setdefault(par['pos'], set()).add('data-xg')
            if par.get('grid') and name == 'section':
                el['gsec'] = par
            if par.get('gsec') is not None and 'w' in el['cls'] and el['dc'] == 'x':
                marks.setdefault(par['gsec']['pos'], set()).add('data-xg')
            if 'hero' in pc and el['dc'] == 'h':
                marks.setdefault(par['pos'], set()).add('data-xh')
            if par['dc'] == 'h' and 'ux-dup' in el['cls']:
                marks.setdefault(par['pos'], set()).add('data-xd')
        if name == 'main' or (name == 'div' and par and par['n'] == 'main' and re.search(r'\sid="p-', attrs)):
            el['grid'] = True
        if name in _HM_VOID or attrs.rstrip().endswith('/'):
            continue
        stack.append(el)
    if not marks:
        return s
    out, pos = [], 0
    for p in sorted(marks):
        out.append(s[pos:p]); out.append(''.join(' ' + a for a in sorted(marks[p]))); pos = p
    out.append(s[pos:])
    return ''.join(out)


CASE_A = re.compile(r'<a\b[^>]*\shref="/(proekty/[\w-]+|portfolio|tury(?:/[\w-]+)?)(#[^"]*)?"[^>]*>')


def local_cases(s, lang):
    """Посилання на /proekty/<slug> і /portfolio зі сторінки іншої мови → переклад цієї мови, якщо він є
    (tools/site/caselang.py); hreflang="uk" при цьому знімаємо. uk-сторінки й мови без перекладу — без змін."""
    pre = i18n.meta(lang)['prefix']
    if lang == 'uk' or not pre:
        return s

    def one(m):
        tag, p = m.group(0), m.group(1)
        if not i18n.exists('/' + pre + p):
            return tag
        tag = tag.replace(f'href="/{p}', f'href="/{pre}{p}', 1)
        return tag.replace(' hreflang="uk"', '')
    i = s.find('<body')
    return s if i < 0 else s[:i] + CASE_A.sub(one, s[i:])


# ── Оздоба прихована (flags.OZDOBA_PUBLIC = False) ─────────────────────────────
# Посилання на /ozdoba* у текстах сторінок: окремий пункт (між тегами: списки «Інші послуги», кнопки, картки,
# <p>/<li> з одним посиланням) — прибираємо цілком, посилання в реченні — лишаємо текстом. Оригінал — у коментарі
# <!--ozh:base64--> (і <!--/ozh--> замість </a>), тож при OZDOBA_PUBLIC = True oz_show() повертає розмітку як була
# (і на ручних сторінках, які не перезбирає жоден генератор).
_OZ_A = r'<a\b[^>]*\shref="(?:https://cas-develop\.com)?/(?:[a-z]{2}/)?ozdoba(?:[/?#][^"]*)?"[^>]*>(?:(?!</a>).)*?</a>'
_OZ_WRAP = re.compile(r'<(p|li)\b[^>]*>\s*' + _OZ_A + r'\s*</\1>', re.S)
_OZ_ALONE = re.compile(r'(?<=>)(\s*)' + _OZ_A + r'(?=\s*<(?!!--/ozh))', re.S)
_OZ_INLINE = re.compile(r'(<a\b[^>]*\shref="(?:https://cas-develop\.com)?/(?:[a-z]{2}/)?ozdoba(?:[/?#][^"]*)?"[^>]*>)((?:(?!</a>).)*?)</a>', re.S)
_OZ_SKIP = re.compile(r'<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->', re.S)


def _oz_b64(t):
    import base64
    return base64.b64encode(t.encode('utf-8')).decode('ascii')  # без «-»: коментар не закінчується на «--->»


def oz_hide(s):
    """Знімає посилання на Оздобу з <body> сторінки (скрипти, стилі й коментарі не чіпає). Ідемпотентно."""
    i = s.find('<body')
    if i < 0 or 'ozdoba' not in s[i:]:
        return s
    head, body = s[:i], s[i:]
    parts, pos = [], 0
    for m in _OZ_SKIP.finditer(body):  # обробляємо лише розмітку між скриптами/стилями/коментарями
        parts.append((body[pos:m.start()], True)); parts.append((m.group(0), False)); pos = m.end()
    parts.append((body[pos:], True))

    def one(t):
        t = _OZ_WRAP.sub(lambda m: '<!--ozh:' + _oz_b64(m.group(0)) + '-->', t)
        t = _OZ_ALONE.sub(lambda m: m.group(1) + '<!--ozh:' + _oz_b64(m.group(0)[len(m.group(1)):]) + '-->', t)
        return _OZ_INLINE.sub(lambda m: '<!--ozh:' + _oz_b64(m.group(1)) + '-->' + m.group(2) + '<!--/ozh-->', t)
    return head + ''.join(one(t) if ok and 'ozdoba' in t else t for t, ok in parts)


def oz_show(s):
    """Зворотне до oz_hide(): повертає збережені посилання (OZDOBA_PUBLIC = True)."""
    if '<!--ozh:' not in s:
        return s
    import base64
    s = re.sub(r'<!--ozh:([A-Za-z0-9+/=]+)-->', lambda m: base64.b64decode(m.group(1)).decode('utf-8'), s)
    return s.replace('<!--/ozh-->', '</a>')


OZ_ROBOTS = '<meta name="robots" content="noindex, nofollow" data-oz="{}">'
OZ_ROBOTS_RX = re.compile(r'<meta name="robots" content="noindex, nofollow" data-oz="([^"]*)">')


def oz_seo(s):
    """Сторінки самої Оздоби, поки вона прихована: noindex, nofollow (попереднє значення robots — у data-oz),
    без JSON-LD (Product/Offer/ItemList — попередження GSC «Пропозиції від продавців») і без hreflang.
    JSON-LD і hreflang генератор (tools/products/build.py, intl.py) ставить заново на кожній збірці."""
    head, sep, rest = s.partition('</head>')
    if not sep:
        return s
    if not OZDOBA_PUBLIC:
        if not OZ_ROBOTS_RX.search(head):
            m = re.search(r'<meta name="robots" content="([^"]*)">\n?', head)
            prev = m.group(1) if m else ''
            if m:
                head = head[:m.start()] + head[m.end():]
            tag = OZ_ROBOTS.format(prev)
            m = re.search(r'<meta name="viewport"[^>]*>\n?', head) or re.search(r'<meta charset[^>]*>\n?', head)
            head = head[:m.end()] + tag + '\n' + head[m.end():] if m else head.replace('<head>', '<head>\n' + tag, 1)
        head = re.sub(r'<script type="application/ld\+json">.*?</script>', '', head, flags=re.S)
        head = re.sub(r'<link rel="alternate" hreflang="[^"]+" href="[^"]+">\n?', '', head)
        rest = re.sub(r'<script type="application/ld\+json">.*?</script>', '', rest, flags=re.S)
    else:
        head = OZ_ROBOTS_RX.sub(lambda m: f'<meta name="robots" content="{m.group(1)}">' if m.group(1) else '', head)
    return head + sep + rest


_CALL_BTN = re.compile(r'(<div class="btns">(?:(?!</div>).)*?<a class="btn" href="tel:\+380978667755">)\+380[ \u00a0]97[ \u00a0]866[ \u00a0]77[ \u00a0]55(</a>)', re.S)


def call_label(s, lang):
    """Кнопка дзвінка в рядку кнопок (.btns: hero лендингів, «Замовити схожий проєкт») — «Подзвонити» мовою сторінки,
    не номер телефону (Михайло 16.11.2026); tel: той самий. Номер — у шапці, футері й пігулці «Зв'язатися»."""
    if '<div class="btns">' not in s:
        return s
    import leadform
    c = leadform._call(lang)
    return _CALL_BTN.sub(lambda m: m.group(1) + html.escape(c[0]) + m.group(2), s) if c else s


def apply(s, rel):
    """Ставить єдину шапку/футер у HTML сторінки `rel` (шлях від кореня сайту). Ідемпотентно."""
    s = _HM_RM.sub('', s)  # маркери :has() — заново після ux.apply (генератори шукають точні рядки розмітки)
    rel = rel.replace(os.sep, '/')
    if os.path.basename(rel) in SKIP and '/' not in rel:
        return clarity(s)  # сторонні шаблони — лише сніпет Clarity зі згодою (без згоди поза Україною не вантажиться)
    if rel.startswith('google'):
        return s
    if re.match(r'(?:[a-z]{2}/)?tury/', rel):  # повноекранні 3D-тури (uk, en, ru) — без шапки/футера; лише формат цін
        lang = page_lang(s)
        i = s.find('<body')
        if i >= 0:
            body, out, pos = s[i:], [], 0
            for m in _NB_TAG.finditer(body):
                out += [price_fmt(body[pos:m.start()], lang), m.group(0)]
                pos = m.end()
            s = s[:i] + ''.join(out) + price_fmt(body[pos:], lang)
        import fx  # друга валюта біля «від $…» (tools/site/fx.py)
        return prices_all(fx.apply(s, lang, rel), lang)
    # спільні інлайн-стилі <head>, винесені у /assets/ib-*.css (tools/site/cssbundle.py), — назад інлайн: усі кроки нижче бачать
    # сторінку як раніше; останнім кроком (перед fx — бюджет) bundle() виносить їх знову
    s = cssbundle.expand(s)
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
    # «Розрахувати проєкт» у футері: форма цієї сторінки (вікно) або форма мови; Оздоба (прихована, своя форма) і реферальна (своя форма) — без вікна
    fcta = None if ozd or rel.startswith(('ozdoba', 'kabinet')) else (
        '#zayavka' if 'id="zayavka"' in s and 'data-fd="0"' not in s else T[lang]['cta_href'])
    f = footer(lang, alts, fcta)
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
    if re.match(r'(?:[a-z]{2}/)?tury\.html$', rel):  # каталог 3D-турів: лише пігулка «Звʼязатися», без форми (Михайло 16.11.2026)
        s = mbar_add(s, lang)
    s = mbar_logos(s)
    s = mbar_lead(s, lang, rel)
    s = chat_href(s, lang)
    s = viewport(s)
    s = mfix_min(s)
    s = legacy_css(s)
    s = clarity(s)
    s = skip_and_main(s, lang)
    s = ui_polish_ext(s)
    if flags.OZ_FILE.match(rel):
        s = oz_seo(s)
    elif OZDOBA_PUBLIC:
        s = oz_show(oztext.show(s))
    elif not rel.startswith('kabinet'):  # кабінет (замовлення й обране Оздоби) — без змін
        s = oz_hide(s)
        # тексти без назви Оздоби й мінімального замовлення: «комплектація напряму з фабрик Китаю» (tools/site/oztext.py)
        s = oztext.hide(s, lang)
        # JSON-LD інших сторінок (напр. Offer «Комплектація з Китаю» на головній): без url на приховану Оздобу;
        # генератор (landing.py) ставить його знову, коли OZDOBA_PUBLIC = True
        s = re.sub(r',\s*"url":\s*"https://cas-develop\.com/(?:[a-z]{2}/)?ozdoba(?:[/?#][^"]*)?"', '', s)
    import ux  # іконки заголовків, згортання довгих блоків, бейдж «Анімація реалізації» (tools/site/ux.py)
    s = ux.apply(s, rel)
    s = has_marks(s)
    import sharp  # різкі фото: srcset з усіх ширин і sizes під реальний слот (tools/site/sharp.py)
    s = sharp.apply(s, rel)
    import lbox  # один лайтбокс фото (tools/site/lbox.py → /assets/lightbox.v1.js): data-lb з ширинами, без інлайн-лайтбоксів
    s = lbox.apply(s, rel)
    s = versions(s)
    s = fonts_block(s, rel)
    s = call_label(s, lang)
    s = nbsp_prices(s, lang)
    s = prices_all(s, lang)
    import ldfix  # JSON-LD: метадані фото (creditText/copyrightNotice), без графа в графі (tools/site/ldfix.py)
    s = ldfix.apply(s, rel)
    s = local_cases(s, lang)
    if not rel.startswith('kabinet'):
        s = kab_lang(s, lang)
    if i18n.meta(lang).get('dir') == 'rtl':  # RTL: стрілка «далі» дивиться вліво (→ у тексті посилань — назад)
        i = s.find('<body')
        if i >= 0:
            s = s[:i] + re.sub(r'(<script\b.*?</script>)|→', lambda m: m.group(1) or '←', s[i:], flags=re.S)
    s = i18n.fonts(s, lang)  # preload: кирилиця лише для uk/ru, латиниця — en/es/…, zh/ar — без preload
    if not rel.startswith('kabinet'):  # кабінет і адмінка — застосунок за логіном: без prefetch/prerender
        s = head_extras(s)  # Speculation Rules (миттєві переходи) і preload LCP-фото
    else:
        s = LCP_RX.sub('', SPEC_RX.sub('', s))
    # підключення стилів і скрипта
    # критичні стилі — останніми в head (після всіх інлайн-стилів); старі теги (інша версія/назва) — геть
    s = CRIT_RX.sub('', s).replace('</head>', CSS_TAG + '\n</head>', 1)
    if JS_TAG not in s:
        s = s.replace('</body>', JS_TAG + '\n</body>', 1)
    # «від $550/м² (≈ €500/м²)» de/fr/es/pt/pl, «(≈ 25 000 ₴/м²)» uk/ru — курси НБУ з tools/site/fx.json (Михайло 18.11.2026);
    # останнім кроком: сторінка вже повна, і друга валюта не виходить за бюджет HTML (tools/site/fx.py)
    import fx
    # шаблонні інлайн-блоки <head> (шрифти, базові стилі шаблону, m-fix, .rel/.gal, стаття, ui-polish) → один /assets/ib-<хеш>.css
    # на місці останнього блоку (каскад той самий; бюджет HTML 64 КБ, 22.11.2026)
    return fx.apply(cssbundle.bundle(full_css(s)), lang, rel)


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


# UI polish (a11y лайтбоксів, розгортання, стрічки, reveal, поява фото): раніше — інлайн-копія ~6,4 КБ у кожній сторінці;
# тепер один файл /assets/ui-polish.v1.js (defer, кеш на рік) — підписи кнопок він бере з <html lang>. Звільняє бюджет HTML 64 КБ.
UIP_RX = re.compile(r'<script>(?:(?!</script>).)*?function btnify(?:(?!</script>).)*?function imgFade(?:(?!</script>).)*?</script>', re.S)
UIP_TAG = '<script src="/assets/ui-polish.v1.js" defer></script>'


def ui_polish_ext(s):
    if not UIP_RX.search(s):
        return s
    has = '/assets/ui-polish.v1.js' in s
    return UIP_RX.sub(lambda m: '' if has else UIP_TAG, s, count=1)


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
    files = args or pages() + sorted(r for r in SKIP if os.path.exists(os.path.join(ROOT, r)))
    if '--check' in sys.argv:
        bad = [r for r in files if apply(open(os.path.join(ROOT, r), encoding='utf-8').read(), r) != open(os.path.join(ROOT, r), encoding='utf-8').read()]
        print('\n'.join(bad) if bad else 'Шапка/футер: OK')
        sys.exit(1 if bad else 0)
    n = sum(apply_file(r) for r in files)
    print(f'Шапка/футер оновлено: {n} з {len(files)} сторінок')
    if not args:  # повний прогін: прибрати /assets/ib-*.css, на які вже не посилається жодна сторінка
        g = cssbundle.prune()
        if g:
            print(f'cssbundle: видалено {len(g)} зайвих ib-*.css')
