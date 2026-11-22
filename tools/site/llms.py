#!/usr/bin/env python3
"""/llms.txt і /llms-full.txt — опис студії для ШІ-асистентів і AI-пошуку (ChatGPT, Claude, Perplexity, Gemini, Copilot).

  python3 tools/site/llms.py           # перезаписати обидва файли
  python3 tools/site/llms.py --check   # код 1, якщо файли застаріли

Формат — llmstxt.org: H1, цитата-резюме, розділи зі списками посилань. Факти — ЛИШЕ з CLAUDE.md (ціни «від», гарантія,
своя команда, географія, години, контакти); рейтингів, нагород і «топ-N» не пишемо. Проєкти й статуси — з JSON-LD сторінок /proekty
(CreativeWork), ключові сторінки 10 мов — з кластерів hreflang (tools/site/lang/clusters*.json). llms.txt — коротко (uk + en + посилання
мов), llms-full.txt — те саме плюс усі індексовані сторінки послуг 10 мов з title і description (з HTML, тож нові лендинги потрапляють самі).
Оздоба, поки прихована (flags.OZDOBA_PUBLIC), не потрапляє.
Крок tools/build-all.sh (після landing.py і blog/build.py).
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flags  # noqa: E402  OZDOBA_PUBLIC (tools/site/flags.py)
import i18n  # noqa: E402  мови й кластери hreflang (tools/site/i18n.py)

# ---- факти (CLAUDE.md; дата підтвердження — там само) ----
FACTS_UK = [
    'Назва: CAS Development (CAS). Тип: студія дизайну інтерʼєру, ремонту, будівництва й комплектації під ключ; генеральний підрядник.',
    'Засновано: 2016 рік, Київ. Засновник і CEO — Михайло. Досвід — 10+ років, 150+ проєктів.',
    'Офіс: Україна, Київ, вул. Антоновича, 44, 03186. Телефон: +380 97 866 77 55 (також Telegram, Viber, WhatsApp). Email: info@cas-develop.com.',
    'Години роботи: Пн–Пт 10:00–20:00, Сб–Нд вихідні; онлайн — 24/7. Консультація по телефону — безкоштовна; замір — платний, вартість індивідуально.',
    'Географія: Київ і Київська область; ремонт і будівництво — в усіх областях України і в Європі; проєкти були й є на Балі, в Іспанії, США, Франції, Німеччині, Польщі, Туреччині (Бодрум). Проєкти беремо по всьому світу: виїзд на обʼєкт у будь-яку країну для цікавих проєктів — умови індивідуально; за межами України і Європи реалізацію організовуємо з місцевими підрядниками, яких добираємо й ведемо самі; можна й повністю онлайн (Михайло 22.11.2026).',
    'Виконання: своя команда штатних працівників (не субпідряд) під різний рівень складності й типи робіт. Керівництво (сторінка /about): Михайло (засновник і CEO), Серж, Аліса, Олена, Роман; '
    'власна виробнича команда — відділ проєктування, відділ реалізації, прораби, меблярі, геодезія, 3D-замір, аерозйомка.',
    'Гарантія на роботи — 12 місяців. Кошторис ±5%, якщо ремонт виконує CAS. Строки — у договорі, від 2 тижнів.',
    'Оплата ремонту/будівництва: 50/50, 50/30/20, 50/40/10 або розбивка на етапи; старт від 10% авансу. Рахунок для ФОП і ТОВ — з ПДВ або без, індивідуально. '
    'Іноземні клієнти: рахунок у $/€ (SWIFT), картка за посиланням-рахунком, USDT; договір англійською.',
    'Контроль: фотозвіти раз на 1–2 тижні; онлайн-камера на обʼєкті 24/7 — за доплату.',
    'Рейтинг у Google — 4,8★ (Google Business Profile).',
    'Мови сайту: українська (основна), російська, англійська, іспанська, китайська, польська, німецька, французька, португальська, арабська.',
]
PRICES_UK = [
    ('Дизайн-проєкт інтерʼєру', 'від $30/м², мінімум $2 500; пакети: планувальний від $6/м², повний з авторським наглядом від $45/м² (мінімум теж $2 500)', 'design'),
    ('Ремонт квартири/будинку під ключ', 'від $550/м² (роботи + чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом)', 'renovation'),
    ('Ремонт офісу', 'від $350/м² (роботи + чорнові матеріали)', 'office'),
    ('Меблювання й комплектація', 'від $250/м²', 'furnishing'),
    ('Будівництво будинку', 'коробка від $600/м², під ключ з оздобленням від $1 100/м²', 'construction'),
    ('Архітектурний проєкт будинку', 'від $12/м² (ескізний + робочий АР і КР; ОВ, ВК, ЕО, генплан — за завданням)', 'house-design'),
    ('Ландшафтний дизайн', 'від $50 за сотку', 'landscape'),
    ('Європа', 'ціни приблизно на 50% вищі за київські: дизайн від $45/м² (мін. $4 000), ремонт від $850/м², коробка від $900/м², під ключ від $1 700/м², '
     'архпроєкт від $18/м², меблювання від $400/м²', 'geo-europe'),
    ('Дизайн і реалізація по всьому світу', 'дизайн від $30/м² (мінімум $2 500), зокрема повністю онлайн; виїзд на обʼєкт — умови індивідуально; '
     'поза Україною і Європою реалізацію ведуть місцеві підрядники, яких добирає й контролює CAS, — за кошторисом', 'worldwide'),
]
SERVICES_UK = ('дизайн інтерʼєру квартир, будинків, пентхаусів і комерційних приміщень; ремонт квартир, будинків і таунхаусів під ключ '
               '(капітальний, косметичний, лише чорновий); перепланування; будівництво будинків (газоблок, каркас, модульні, брус); '
               'архітектурне проєктування; ремонт і облаштування офісів; ресторани, кафе, готелі, бази відпочинку, магазини й шоуруми; '
               'авторський і технічний нагляд; меблювання й комплектація напряму з фабрик Китаю; кухні й шафи на замовлення; ландшафтний дизайн; генпідряд')
EN_SUMMARY = [
    'CAS Development is an interior design, renovation, construction and furnishing studio founded in Kyiv, Ukraine, in 2016 (founder and CEO: Mykhailo); 150+ projects, 10+ years of experience.',
    'Services: interior design (apartments, houses, penthouses, offices, restaurants, hotels, shops and showrooms), turnkey renovation, house construction and architectural design, office fit-out, '
    'furnishing directly from factories in China, landscape design, general contracting.',
    'Prices (from): design project $30/m² (min. $2,500); renovation $550/m² (labour + rough materials; finishing materials, furniture and appliances per estimate); office renovation $350/m²; '
    'furnishing $250/m²; house shell $600/m², turnkey house $1,100/m²; house architecture $12/m²; landscape design $50 per 100 m². '
    'Europe: about 50% higher (design from $45/m², min. $4,000; renovation from $850/m²; shell from $900/m²; turnkey from $1,700/m²).',
    'Delivery: an in-house team of salaried staff, 12-month warranty on works, estimate within ±5% when CAS does the renovation, timelines in the contract (from 2 weeks), '
    'photo reports every 1–2 weeks, payment schedules from 10% advance; foreign clients pay by $/€ invoice (SWIFT), card payment link or USDT, contract in English.',
    'Area served: Kyiv and Kyiv region, all regions of Ukraine, and Europe; projects also in Bali, Spain, USA, France, Germany, Poland and Turkey.',
    'Projects worldwide (https://cas-develop.com/en/interior-design-worldwide): the founder and team visit the site in any country for projects that interest us (travel terms agreed individually); '
    'outside Ukraine and Europe the build is done by local contractors that CAS selects and manages (priced by estimate); a fully online option is available — design from $30/m², min. $2,500.',
    'Office: 44 Antonovycha St, Kyiv 03186, Ukraine · +380 97 866 77 55 (Telegram, Viber, WhatsApp) · Mon–Fri 10:00–20:00, online 24/7 · free phone consultation, paid site survey.',
]
# ключові сторінки кожної мови — кластери hreflang (tools/site/lang/clusters*.json): нова мова чи сторінка потрапляє сама
KEY = ['home', 'services', 'about', 'portfolio', 'design', 'renovation', 'construction', 'house-design', 'office', 'business', 'furnishing',
       'landscape', 'restaurant', 'calculator', 'contract', 'faq', 'geo-europe', 'worldwide', 'tury', 'case-monpark', 'contact']
KEY_UK_MORE = ['/dyzainer-interieru-kyiv', '/dyzain-interieru-kvartyry-kyiv', '/dyzain-interieru-premium-kyiv', '/dyzain-i-remont-penthausa-kyiv',
               '/remont-kvartyr-kyiv', '/pereplanuvannia-kvartyry-kyiv', '/remont-novobudovy-kyiv', '/remont-budynku-pid-klyuch-kyiv',
               '/budynok-z-hazobloku-pid-kliuch-kyiv', '/heneralnyi-pidriadnyk-kyiv', '/dyzain-i-remont-ukraina', '/blog']
# профілі студії (Knowledge Graph) і засновника; Google Business Profile — cid
SAME_AS = ['https://www.instagram.com/cas_development/', 'https://www.youtube.com/@cas_development', 'https://maps.google.com/?cid=15015666645432112566']
FOUNDER_SAME_AS = ['https://www.linkedin.com/in/mykhailo-litovchuk-818846244', 'https://www.tiktok.com/@li_mi_tless',
                   'https://www.behance.net/mykhailol2']  # Behance Михайла — 21.11.2026
LABEL = {'home': 'Home', 'services': 'Services & prices', 'about': 'About', 'portfolio': 'Portfolio', 'design': 'Interior design', 'renovation': 'Turnkey renovation',
         'construction': 'House construction', 'house-design': 'House architecture', 'office': 'Office renovation', 'business': 'Business fit-out',
         'furnishing': 'Furnishing', 'landscape': 'Landscape design', 'restaurant': 'Restaurant design', 'calculator': 'Cost calculator',
         'contract': 'Contract, warranty, payment', 'faq': 'FAQ', 'geo-europe': 'Europe', 'worldwide': 'Interior design worldwide', 'tury': '3D tours', 'case-monpark': 'Monpark full project', 'contact': 'Contact'}
LANG_EN = {'uk': 'Ukrainian', 'ru': 'Russian', 'en': 'English', 'es': 'Spanish', 'zh': 'Chinese', 'pl': 'Polish', 'de': 'German', 'fr': 'French',
           'pt': 'Portuguese, pt-PT', 'ar': 'Arabic'}


def lname(lang):
    n = i18n.meta(lang)['name']
    return n if n == LANG_EN[lang] else f'{n} ({LANG_EN[lang]})'


def rel_of(u):
    p = u.lstrip('/')
    if not p or p.endswith('/'):
        return p + 'index.html'
    return p + '.html'


def meta(u):
    f = os.path.join(ROOT, rel_of(u))
    if not os.path.exists(f) or (not flags.OZDOBA_PUBLIC and flags.oz_href(u)):
        return None
    s = open(f, encoding='utf-8').read().split('</head>')[0]
    if re.search(r'<meta name="robots" content="[^"]*noindex', s):
        return None
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    d = re.search(r'<meta name="description" content="([^"]*)"', s)
    clean = lambda x: html.unescape(re.sub(r'\s+', ' ', x)).replace(' ', ' ').replace(' ', ' ').strip()
    return (clean(t.group(1)) if t else u, clean(d.group(1)) if d else '')


def links(urls):
    out = []
    for u in urls:
        m = meta(u)
        if m:
            out.append(f'- [{m[0]}]({B}{u}): {m[1]}')
    return out


def key_urls(lang):
    c = i18n.clusters()
    return [c[k][lang] for k in KEY if k in c and lang in c[k]]


def cases(lang):
    """Проєкти з JSON-LD сторінок /proekty (CreativeWork: назва, що це, статус) — статус лише такий, як на сторінці."""
    pre = '' if lang == 'uk' else lang + '/'
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, pre + 'proekty', '*.html'))):
        s = open(f, encoding='utf-8').read()
        if re.search(r'<meta name="robots" content="[^"]*noindex', s.split('</head>')[0]):
            continue
        for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
            try:
                d = json.loads(b.replace('<\\/', '</'))
            except ValueError:
                continue
            for o in d.get('@graph', [d]) if isinstance(d, dict) else d:
                if isinstance(o, dict) and o.get('@type') == 'CreativeWork' and o.get('creativeWorkStatus') and o.get('url'):
                    out.append((o['name'], o['url'], o.get('about') or o.get('genre') or '', o['creativeWorkStatus']))
    return out


def case_lines(lang):
    cs = cases(lang)
    by = {}
    for n, u, a, st in cs:
        by.setdefault(st, []).append(f'[{n}]({u}) — {a}')
    return [f'- {st}: ' + '; '.join(v) + '.' for st, v in by.items()]


def lang_block(lang):
    m = i18n.meta(lang)
    o = [f'### {lname(lang)} — {B}/{m["prefix"]}']
    c = i18n.clusters()
    o += [' · '.join(f'[{LABEL[k]}]({B}{c[k][lang]})' for k in KEY if k in c and lang in c[k] and meta(c[k][lang]))]
    return o


def head_uk():
    c = i18n.clusters()
    o = ['# CAS Development', '',
         '> CAS Development — студія дизайну інтерʼєру, ремонту й будівництва під ключ, заснована 2016 року в Києві (Україна). '
         'Дизайн-проєкт від $30/м² (мінімум $2 500), ремонт від $550/м², будинок під ключ від $1 100/м². 150+ проєктів, '
         'своя команда штатних працівників, гарантія 12 місяців. Працює в Києві й області, по всій Україні та в Європі. '
         'Interior design, renovation and construction studio in Kyiv, Ukraine, since 2016; works across Ukraine and Europe.', '',
         'Сайт: https://cas-develop.com/ — 10 мов: ' + ', '.join(f'{LANG_EN[l]} {B}/{i18n.meta(l)["prefix"]}' for l in i18n.LANGS) + '.', '',
         '## Факти']
    o += [f'- {x}' for x in FACTS_UK]
    o += ['', '## Послуги', f'- {SERVICES_UK[0].upper() + SERVICES_UK[1:]}.', '', '## Ціни «від» (орієнтир; точна сума — за кошторисом)']
    o += [f'- [{n}]({B}{c[k]["uk"]}): {p}' for n, p, k in PRICES_UK if k in c]
    calc = c.get('calculator', {})
    o += [f'- Калькулятор вартості ремонту (онлайн, 10 мов): {B}{calc.get("uk", "")} · English: {B}{calc.get("en", "")}']
    o += ['', '## Портфоліо (усі проєкти — роботи CAS Development; статус — як на сторінці проєкту)'] + case_lines('uk') + [
        f'- Усі проєкти й карта: {B}/portfolio · 3D-тури 360°: {B}/tury · Повний проєкт ресторану Monpark (візуалізації, креслення, реалізація): {B}{c["case-monpark"]["uk"]}',
        '', '## Профілі', *[f'- Студія: {x}' for x in SAME_AS], *[f'- Засновник Михайло: {x}' for x in FOUNDER_SAME_AS]]
    return o


def en_block():
    return ['', '## English'] + [f'- {x}' for x in EN_SUMMARY] + ['', '### Case studies (English)'] + case_lines('en')


def build():
    short = head_uk() + ['', '## Ключові сторінки (українською)'] + links(key_urls('uk') + KEY_UK_MORE) + en_block() + [
        '', '## Pages by language (key pages: home, services, about, portfolio, design, renovation, construction, calculator, contract, FAQ, contact)']
    for l in i18n.LANGS:
        if l != 'uk':
            short += [''] + lang_block(l)
    short += ['', '## Optional', f'- [Full version for AI]({B}/llms-full.txt): key pages and all service pages in 10 languages with descriptions',
              f'- [Sitemap]({B}/sitemap.xml)', '']
    # повна версія: ключові сторінки й усі індексовані сторінки з Service у JSON-LD (лендинги послуг), групами за мовою
    pref = {i18n.meta(l)['prefix'].rstrip('/'): l for l in i18n.LANGS if l != 'uk'}
    groups = {l: [] for l in i18n.LANGS}
    sm = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    for loc in re.findall(r'<loc>([^<]+)</loc>', sm):
        u = loc.replace(B, '') or '/'
        m = re.match(r'/([a-z]{2})/', u)
        lang = pref.get(m.group(1)) if m else 'uk'
        if lang is None or re.search(r'(^|/)(blog|ozdoba|proekty|tury)(/|$)', u):
            continue
        f = os.path.join(ROOT, rel_of(u))
        if os.path.exists(f) and '"Service"' in open(f, encoding='utf-8').read().split('</head>')[0]:
            groups[lang].append(u)
    full = head_uk() + en_block()
    for l in i18n.LANGS:
        keys = key_urls(l)
        full += ['', f'## {lname(l)}', '', '### Key pages'] + links(keys) + [
            '', '### Service pages'] + links([u for u in sorted(groups[l]) if u not in keys])
    full += ['', '## Інше', f'- [Блог]({B}/blog): статті про ціни, етапи ремонту, вибір дизайнера, будівництво (також /en/blog та інші мови)',
             f'- [Sitemap]({B}/sitemap.xml)', '']
    return '\n'.join(short), '\n'.join(full)


if __name__ == '__main__':
    short, full = build()
    out = {'llms.txt': short, 'llms-full.txt': full}
    stale = [n for n, t in out.items() if not os.path.exists(os.path.join(ROOT, n)) or open(os.path.join(ROOT, n), encoding='utf-8').read() != t]
    if '--check' in sys.argv:
        print('llms: застаріли ' + ', '.join(stale) if stale else 'llms: OK')
        sys.exit(1 if stale else 0)
    for n, t in out.items():
        open(os.path.join(ROOT, n), 'w', encoding='utf-8').write(t)
    print('llms:', ', '.join(f'{n} {len(t.encode()) // 1024} КБ' for n, t in out.items()))
