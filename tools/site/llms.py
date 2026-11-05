#!/usr/bin/env python3
"""/llms.txt і /llms-full.txt — опис студії для ШІ-асистентів і AI-пошуку (ChatGPT, Claude, Perplexity, Gemini, Copilot).

  python3 tools/site/llms.py           # перезаписати обидва файли
  python3 tools/site/llms.py --check   # код 1, якщо файли застаріли

Формат — llmstxt.org: H1, цитата-резюме, розділи зі списками посилань. Факти — ЛИШЕ з CLAUDE.md (ціни «від», гарантія,
бригади, географія, портфоліо); рейтингів, нагород і «топ-N» не пишемо. llms.txt — коротко (uk + en), llms-full.txt — те саме
плюс усі індексовані сторінки послуг uk/ru/en з title і description (беруться з HTML, тож нові лендинги потрапляють самі).
Крок tools/build-all.sh (після landing.py і blog/build.py).
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'

# ---- факти (CLAUDE.md; дата підтвердження — там само) ----
FACTS_UK = [
    'Назва: CAS Development (CAS). Тип: студія дизайну інтерʼєру, ремонту, будівництва й комплектації під ключ; генеральний підрядник.',
    'Засновано: 2016 рік, Київ. Засновник і CEO — Михайло. Досвід — 10+ років, 150+ проєктів.',
    'Офіс: Україна, Київ, вул. Антоновича, 44. Телефон: +380 97 866 77 55 (також Telegram, Viber, WhatsApp). Email: china.opt.shop@gmail.com.',
    'Географія: Київ і Київська область; ремонт і будівництво — в усіх областях України і в Європі; проєкти були й є на Балі, в Іспанії, США, Франції, Німеччині, Польщі, Туреччині (Бодрум).',
    'Виконання: своя команда штатних працівників (не субпідряд) під різний рівень складності й типи робіт. Команда (сторінка /about): засновник і CEO Михайло, проєктний менеджер, дизайнер інтерʼєру, проєктувальник, '
    'пʼять прорабів, меблярі, геодезист, спеціаліст 3D-заміру, зйомка з дрона.',
    'Гарантія на роботи — 12 місяців. Кошторис ±5%, якщо ремонт виконує CAS. Строки — у договорі, від 2 тижнів.',
    'Оплата ремонту/будівництва: 50/50, 50/30/20, 50/40/10 або розбивка на етапи; старт від 10% авансу. Рахунок для ФОП і ТОВ.',
    'Контроль: фотозвіти раз на 1–2 тижні; онлайн-камера на обʼєкті 24/7 — за доплату.',
    'Консультація по телефону — безкоштовна; замір — платний, вартість індивідуально.',
    'Рейтинг у Google — 4,8★ (Google Business Profile).',
]
PRICES_UK = [
    ('Дизайн-проєкт інтерʼєру', 'від $30/м², мінімум $2 500; пакети: планувальний від $6/м², повний з авторським наглядом від $45/м² (мінімум теж $2 500)', '/dyzain-interieru-kyiv'),
    ('Ремонт квартири/будинку під ключ', 'від $550/м² (роботи + чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом)', '/remont-kvartyr-kyiv'),
    ('Ремонт офісу', 'від $350/м² (роботи + чорнові матеріали)', '/remont-ofisu-pid-klyuch-kyiv'),
    ('Меблювання й комплектація', 'від $250/м²', '/mebliuvannia-kvartyry-kyiv'),
    ('Будівництво будинку', 'коробка від $600/м², під ключ з оздобленням від $1 100/м²', '/budivnytstvo-budynkiv-kyiv'),
    ('Архітектурний проєкт будинку', 'від $12/м² (ескізний + робочий АР і КР; ОВ, ВК, ЕО, генплан — за завданням)', '/proektuvannia-budynku-kyiv'),
    ('Ландшафтний дизайн', 'від $50 за сотку', '/landshaftnyi-dyzain-kyiv'),
    ('Комплектація «Оздоба» (меблі, світло, сантехніка, декор з Китаю)', 'замовлення від $500, від 10 шт кожної позиції, поставка 30–60 днів', '/ozdoba'),
    ('Європа', 'ціни приблизно на 50% вищі за київські: дизайн від $45/м² (мін. $4 000), ремонт від $850/м², коробка від $900/м², під ключ від $1 700/м²', '/remont-i-budivnytstvo-yevropa'),
]
SERVICES_UK = ('дизайн інтерʼєру квартир, будинків, пентхаусів і комерційних приміщень; ремонт квартир, будинків і таунхаусів під ключ '
               '(капітальний, косметичний, лише чорновий); перепланування; будівництво будинків (газоблок, каркас, модульні, брус); '
               'архітектурне проєктування; ремонт і облаштування офісів; ресторани, кафе, готелі, бази відпочинку, магазини й шоуруми; '
               'авторський і технічний нагляд; меблювання й комплектація; кухні й шафи на замовлення; ландшафтний дизайн; генпідряд')
# портфоліо — усі проєкти на сайті є проєктами CAS Development (Михайло 01.11.2026); статус — як на сторінках /proekty/
REALIZED = [('Tetris Hall', 'tetris-hall', 'квартира: дизайн, ремонт і комплектація'), ('Monpark', 'monpark', 'ресторан у центрі Києва: дизайн і реалізація'),
            ('Dolls Salon', 'dolls-salon', 'салон краси: дизайн і ремонт під ключ'), ('Office Chicago', 'office-chicago', 'офіс у ЖК Chicago, Київ: дизайн і реалізація')]
DESIGN = [('Linden Penthouse', 'linden-penthouse', 'пентхаус 210 м², Київ'), ('Hodos Villa', 'hodos-villa', 'вілла 500 м² у неокласиці, Київ'),
          ('Petrivtsi House', 'petrivtsi-house', 'будинок 320 м², Петрівці'), ('Kitana Beach', 'kitana-beach', 'пляжний комплекс, Бодрум (Туреччина)'),
          ('Dubai Villa', 'dubai-villa', 'вілла в Дубаї'), ('USA House', 'usa-house', 'будинок 420 м², США')]
KEY_UK = ['/services', '/about', '/portfolio', '/pytannya', '/dyzain-interieru-kyiv', '/dyzainer-interieru-kyiv', '/dyzain-interieru-kvartyry-kyiv',
          '/dyzain-interieru-premium-kyiv', '/dyzain-i-remont-penthausa-kyiv', '/dyzain-interieru-neoklasyka-kyiv', '/remont-kvartyr-kyiv',
          '/remont-pid-klyuch-kyiv', '/pereplanuvannia-kvartyry-kyiv', '/remont-novobudovy-kyiv', '/remont-budynku-pid-klyuch-kyiv', '/remont-taunkhausa-kyiv',
          '/budivnytstvo-budynkiv-kyiv', '/budynok-z-hazobloku-pid-kliuch-kyiv', '/proektuvannia-budynku-kyiv', '/remont-ofisu-pid-klyuch-kyiv',
          '/oblashtuvannia-ofisu-pid-kliuch-kyiv', '/dyzain-ofisu-kyiv', '/dyzain-i-remont-mahazynu-shourumu-kyiv', '/dyzain-restoranu-kafe-kyiv',
          '/heneralnyi-pidriadnyk-kyiv', '/mebliuvannia-kvartyry-kyiv', '/komplektatsiia-pid-kliuch-kyiv', '/dogovir-garantiya-oplata',
          '/kalkuliator-remontu', '/dyzain-i-remont-ukraina', '/remont-i-budivnytstvo-yevropa', '/ozdoba', '/blog', '/contact']

EN_SUMMARY = [
    'CAS Development is an interior design, renovation, construction and furnishing studio founded in Kyiv, Ukraine, in 2016 (founder and CEO: Mykhailo); 150+ projects, 10+ years of experience.',
    'Services: interior design (apartments, houses, penthouses, offices, restaurants, hotels, shops and showrooms), turnkey renovation, house construction and architectural design, office fit-out, furniture procurement directly from China, landscape design, general contracting.',
    'Prices (from): design project $30/m² (min. $2,500); renovation $550/m² (labour + rough materials); office renovation $350/m²; furnishing $250/m²; house shell $600/m², turnkey house $1,100/m²; house architecture $12/m²; landscape design $50 per 100 m². Europe: about 50% higher (design from $45/m², renovation from $850/m²).',
    'Delivery: an in-house team of salaried staff, 12-month warranty on works, estimate within ±5% when CAS does the renovation, photo reports every 1–2 weeks, flexible payment schedules from 10% advance.',
    'Area served: Kyiv and Kyiv region, all regions of Ukraine, and Europe; projects also in Bali, Spain, USA, France, Germany, Poland and Turkey.',
    'Office: 44 Antonovycha St, Kyiv, Ukraine · +380 97 866 77 55 · https://cas-develop.com/en/',
]
KEY_EN = ['/en/', '/en/services', '/en/about', '/en/interior-design', '/en/turnkey-renovation', '/en/house-construction', '/en/office-renovation',
          '/en/business-fit-out', '/en/contract-warranty-payment', '/en/faq', '/en/contact']
SAME_AS = ['https://www.instagram.com/cas_development/', 'https://www.youtube.com/@cas_development', 'https://maps.google.com/?cid=15015666645432112566']


def rel_of(u):
    p = u.lstrip('/')
    if not p or p.endswith('/'):
        return p + 'index.html'
    return p + '.html'


def meta(u):
    f = os.path.join(ROOT, rel_of(u))
    if not os.path.exists(f):
        return None
    s = open(f, encoding='utf-8').read().split('</head>')[0]
    if re.search(r'<meta name="robots" content="[^"]*noindex', s):
        return None
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    d = re.search(r'<meta name="description" content="([^"]*)"', s)
    clean = lambda x: html.unescape(re.sub(r'\s+', ' ', x)).replace(' ', ' ').strip()
    return (clean(t.group(1)) if t else u, clean(d.group(1)) if d else '')


def links(urls):
    out = []
    for u in urls:
        m = meta(u)
        if m:
            out.append(f'- [{m[0]}]({B}{u}): {m[1]}')
    return out


def head_uk():
    o = ['# CAS Development', '',
         '> CAS Development — студія дизайну інтерʼєру, ремонту й будівництва під ключ, заснована 2016 року в Києві (Україна). '
         'Дизайн-проєкт від $30/м² (мінімум $2 500), ремонт від $550/м², будинок під ключ від $1 100/м². 150+ проєктів, '
         'своя команда штатних працівників, гарантія 12 місяців. Працює в Києві й області, по всій Україні та в Європі.', '',
         'Сайт: https://cas-develop.com/ (українська — основна мова; також /ru/, /en/, /es/, /zh/, /pl/, /de/, /fr/, /ar/).', '',
         '## Факти']
    o += [f'- {x}' for x in FACTS_UK]
    o += ['', '## Послуги', f'- {SERVICES_UK[0].upper() + SERVICES_UK[1:]}.', '', '## Ціни «від» (орієнтир; точна сума — за кошторисом)']
    o += [f'- [{n}]({B}{u}): {p}' for n, p, u in PRICES_UK]
    o += ['', '## Портфоліо (усі проєкти — роботи CAS Development)', '- Реалізовано: ' + '; '.join(f'[{n}]({B}/proekty/{s}) — {d}' for n, s, d in REALIZED) + '.',
          '- Дизайн-проєкти: ' + '; '.join(f'[{n}]({B}/proekty/{s}) — {d}' for n, s, d in DESIGN) + '.',
          f'- Усі проєкти й карта: {B}/portfolio', '', '## Профілі', *[f'- {x}' for x in SAME_AS]]
    return o


def build():
    short = head_uk() + ['', '## Ключові сторінки'] + links(KEY_UK) + ['', '## English'] + [f'- {x}' for x in EN_SUMMARY] + [''] + links(KEY_EN) + [
        '', '## Optional', f'- [Повна версія для ШІ]({B}/llms-full.txt): усі сторінки послуг українською, російською й англійською',
        f'- [Sitemap]({B}/sitemap.xml)', '']
    # повна версія: усі індексовані сторінки з Service у JSON-LD (лендинги послуг), групами за мовою
    groups = {'uk': [], 'ru': [], 'en': []}
    sm = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    for loc in re.findall(r'<loc>([^<]+)</loc>', sm):
        u = loc.replace(B, '') or '/'
        lang = 'ru' if u.startswith('/ru/') else 'en' if u.startswith('/en/') else 'uk' if not re.match(r'/[a-z]{2}/', u) else None
        if lang is None or u.startswith(('/blog', '/ru/blog', '/en/blog', '/ozdoba/', '/proekty/', '/tury/')):
            continue
        f = os.path.join(ROOT, rel_of(u))
        if os.path.exists(f) and '"Service"' in open(f, encoding='utf-8').read().split('</head>')[0]:
            groups[lang].append(u)
    full = head_uk() + ['', '## Сторінки послуг (українською)'] + links(sorted(groups['uk'])) + [
        '', '## Страницы услуг (на русском)'] + links(sorted(groups['ru'])) + ['', '## English'] + [f'- {x}' for x in EN_SUMMARY] + [
        '', '## Service pages (English)'] + links(sorted(groups['en'])) + [
        '', '## Інше', f'- [Портфоліо]({B}/portfolio)', f'- [Блог]({B}/blog): статті про ціни, етапи ремонту, вибір дизайнера, будівництво',
        f'- [Часті питання]({B}/pytannya)', f'- [Контакти]({B}/contact)', '']
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
