"""«Легкий блог» (Михайло 02.11.2026): картка «Коротко» з іконками, зміст-плитки, розділи згорнуті до 2–3 рядків,
чеклісти з іконками, у технічних статтях — компактний «пиріг шарів» (дані — tools/site/buildanim_data.py).

Викликає tools/blog/build.py (render_body → body()). Текст лишається в DOM: згортання — атрибут data-c="t" на
<div class="bsc"> (ставить tools/site/ux.py; «Читати далі» — /assets/site-chrome.v1.js), без JS усе відкрито.
Стилі — /assets/blog-light.v1.css. Schema (Article, FAQPage) не змінюється. UI-kit — /styleguide/#blog-light.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
CSS = 'assets/blog-light.v1.css'
esc = lambda s: html.escape(s, quote=True)

T = {
    'uk': dict(k='Коротко', toc='Зміст', read='хв читання', parts='Розділів', q='питань', price='Ціни', svc='Послуга', min=1),
    'ru': dict(k='Коротко', toc='Содержание', read='мин чтения', parts='Разделов', q='вопросов', price='Цены', svc='Услуга'),
    'en': dict(k='In short', toc='Contents', read='min read', parts='Sections', q='questions', price='Prices', svc='Service'),
    'pl': dict(k='W skrócie', toc='Spis treści', read='min czytania', parts='Rozdziałów', q='pytań', price='Ceny', svc='Usługa'),
    'es': dict(k='En breve', toc='Contenido', read='min de lectura', parts='Secciones', q='preguntas', price='Precios', svc='Servicio'),
    'de': dict(k='Kurz gesagt', toc='Inhalt', read='Min. Lesezeit', parts='Abschnitte', q='Fragen', price='Preise', svc='Leistung'),
    'fr': dict(k='En bref', toc='Sommaire', read='min de lecture', parts='Sections', q='questions', price='Prix', svc='Service'),
    'zh': dict(k='要点', toc='目录', read='分钟阅读', parts='章节', q='问题', price='价格', svc='服务'),
    'ar': dict(k='باختصار', toc='المحتويات', read='دقائق للقراءة', parts='الأقسام', q='الأسئلة', price='الأسعار', svc='الخدمة'),
}
PRICE = re.compile(r'(?:від|от|from|od|desde|ab|dès|à partir de)\s+\$\s?\d+(?:[  ,]\d{3})*(?:\s?(?:за|per|/|za)\s?(?:м²|m²|сотку))?', re.I)
# технічні статті → пиріг шарів (ключ T[lang]['pie'] у buildanim_data); перший збіг у назві/slug
PIES = [(r'покрівл|кровл|дах|крыш|roof|dach', 'roof'), (r'фундамент|плит[аиу] фундам|foundation|fundament', 'fplate'),
        (r'газоблок|цегл|кирпич|стін|стен|wall|ścian', 'w_block'), (r'каркас|frame|szkielet', 'w_frame'), (r'брус|timber|bali', 'w_brus'),
        (r'\bванн|санвуз|санузл|bathroom|łazien|гідроізол|гидроизол', 'f_wet'), (r'стяжк|підлог|пол[уа]? |floor|podłog|паркет', 'f_floor'),
        (r'перекрит|перекрыт', 'slab'), (r'вікн|окна|window|okna', 'win'), (r'будинок|будівництв|дом|строит|house|budow', 'w_block')]


# Контекстний блок послуги (Михайло/GSC 10.11.2026: читачі блогу приходять зі статей, шлях до заявки слабкий):
# один рядок + одна кнопка на лендинг послуги за темою статті + (необовʼязково) друге текстове посилання.
# Стоїть після 2-го розділу (≤ 2 розділів — одразу після «Коротко»); форми посеред статті немає — заявка лише в #zayavka внизу.
# Тема — перший збіг у slug + назві; якщо послуга статті ("service") з тієї ж «родини», кнопка веде на неї (вона точніша).
# Ціни й факти — лише з CLAUDE.md; замір не обіцяємо безкоштовним, безкоштовна — консультація по телефону.
TOPICS = [  # (тема, regex slug статті — перекриває послугу; regex URL послуги статті, що теж дає цю тему)
    ('nadzor', r'nahliad|nadzor|supervision', r'nahliad|nadzor'),
    ('smeta', r'koshtorys|smet|kosztorys|skilky-koshtuie-remont|skolko-stoit-remont|renovation-cost|koszt-remontu', r'vartist-remontu-kv|stoimost-remonta-kv|kalk|calculator'),
    ('own', None, r'ofis|office|biur|restoran|restaur|kafe|biznes|business|baza|resort|osrod|komerts|kommerch|commercial|lokali|yevropa|evropa|premium|realiz|implementation|dogov|contract|bryhad|brigad|crew|ekipa|pidriad|podryad|contractor'),
    ('furn', None, r'mebl|komplekt|ozdoba|furnish|procure|umeblow|kompletac'),
    ('build', None, r'budivnytstvo|stroitelstvo|house-construction|budowa|proektuvannia-budynku|proektirovanie-doma|house-design|projekt-domu|rekonstr'),
    ('design', None, r'dyzain|dizayn|interior-design|apartment-interior|interior-designer|projekt-wnetrza|projektowanie-wnetrz|projektant'),
]
# smeta з конкретною послугою (ванна, кухня, новобудова, будинок, капітальний) — кнопка лишається на ній
SMETA_KEEP = r'vartist|stoimost|vann|bathroom|lazien|kukh|kuhn|kitchen|novobud|novostro|new-build|budyn|doma|house|domu|kapital'
TP = {  # тема → (рядок, [основний href, підпис кнопки], [друге посилання або None])
    'uk': {
        'nadzor': ('Технічний і авторський нагляд CAS — і коли ремонт робить інший підрядник: умови й вартість індивідуально. Консультація по телефону безкоштовна.',
                   ['/avtorskyi-i-tekhnichnyi-nahliad-kyiv', 'Авторський і технічний нагляд'], None),
        'furn': ('Меблювання під ключ — від $250/м²; меблі, світло й декор під замовлення з Китаю — каталог Оздоба. Консультація по телефону безкоштовна.',
                 ['/mebliuvannia-kvartyry-kyiv', 'Меблювання квартири'], ['/ozdoba', 'Каталог Оздоба']),
        'build': ('Будівництво будинку — від $600/м², під ключ — від $1 100/м²; архпроєкт — від $12/м². Консультація по телефону безкоштовна.',
                  ['/budivnytstvo-budynkiv-kyiv', 'Будівництво будинків'], ['/budivnytstvo-budynkiv-kyiv#build-anim', 'Дивитись, як ми будуємо']),
        'smeta': ('Ремонт — від $550/м²: роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом. Консультація по телефону безкоштовна.',
                  ['/vartist-remontu-kvartyry-kyiv', 'Вартість ремонту квартири'], ['/kalkuliator-remontu', 'Калькулятор ремонту']),
        'design': ('Дизайн-проєкт — від $30/м² (мін. $2 500), планувальне рішення — від $6/м². Консультація по телефону безкоштовна.',
                   ['/dyzain-interieru-kyiv', 'Дизайн інтерʼєру'], ['/kalkuliator-remontu', 'Калькулятор вартості']),
        'own': ('Розкажіть про обʼєкт — назвемо орієнтовну вартість. Консультація по телефону безкоштовна.', None, None),
    },
    'ru': {
        'nadzor': ('Технический и авторский надзор CAS — и когда ремонт делает другой подрядчик: условия и стоимость индивидуально. Консультация по телефону бесплатная.',
                   ['/ru/avtorskiy-i-tehnicheskiy-nadzor-kiev', 'Авторский и технический надзор'], None),
        'furn': ('Меблировка под ключ — от $250/м²; мебель, свет и декор под заказ из Китая. Консультация по телефону бесплатная.',
                 ['/ru/meblirovka-kvartiry-kiev', 'Меблировка квартиры'], ['/ru/komplektatsiya-pod-klyuch-kiev', 'Комплектация под ключ']),
        'build': ('Строительство дома — от $600/м², под ключ — от $1 100/м²; архпроект — от $12/м². Консультация по телефону бесплатная.',
                  ['/ru/stroitelstvo-domov-kiev', 'Строительство домов'], ['/ru/stroitelstvo-domov-kiev#build-anim', 'Смотреть, как мы строим']),
        'smeta': ('Ремонт — от $550/м²: работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете. Консультация по телефону бесплатная.',
                  ['/ru/stoimost-remonta-kvartiry-kiev', 'Стоимость ремонта квартиры'], ['/ru/kalkulyator-remonta', 'Калькулятор ремонта']),
        'design': ('Дизайн-проект — от $30/м² (мин. $2 500), планировочное решение — от $6/м². Консультация по телефону бесплатная.',
                   ['/ru/dizayn-interera-kiev', 'Дизайн интерьера'], ['/ru/kalkulyator-remonta', 'Калькулятор стоимости']),
        'own': ('Расскажите об объекте — назовём ориентировочную стоимость. Консультация по телефону бесплатная.', None, None),
    },
    'en': {
        'nadzor': ('CAS technical and author supervision, also when another contractor does the renovation: terms and cost are agreed individually. Phone consultation is free.',
                   ['/en/design-implementation', 'Design implementation'], None),
        'furn': ('Turnkey furnishing from $250/m²; custom furniture, lighting and decor from China — the Ozdoba catalogue. Phone consultation is free.',
                 ['/en/turnkey-furnishing', 'Turnkey furnishing'], ['/en/ozdoba', 'Ozdoba catalogue']),
        'build': ('House construction from $600/m², turnkey from $1,100/m²; architectural design from $12/m². Phone consultation is free.',
                  ['/en/house-construction', 'House construction'], ['/en/house-construction#build-anim', 'See how we build']),
        'smeta': ('Renovation from $550/m²: labour and rough materials; finishing materials, furniture and appliances are estimated separately. Phone consultation is free.',
                  ['/en/turnkey-renovation', 'Turnkey renovation'], ['/en/renovation-cost-calculator', 'Renovation cost calculator']),
        'design': ('Interior design from $30/m² (min. $2,500), space planning from $6/m². Phone consultation is free.',
                   ['/en/interior-design', 'Interior design'], ['/en/renovation-cost-calculator', 'Cost calculator']),
        'own': ('Tell us about your property and we will give you a rough cost. Phone consultation is free.', None, None),
    },
    'pl': {
        'nadzor': ('Nadzór techniczny i autorski CAS, także gdy remont prowadzi inny wykonawca: warunki i koszt ustalamy indywidualnie. Konsultacja telefoniczna jest bezpłatna.',
                   ['/pl/realizacja-projektu', 'Realizacja projektu'], None),
        'furn': ('Umeblowanie pod klucz od $250/m²; meble, oświetlenie i dekoracje na zamówienie z Chin — katalog Ozdoba. Konsultacja telefoniczna jest bezpłatna.',
                 ['/pl/umeblowanie-pod-klucz', 'Umeblowanie pod klucz'], ['/pl/ozdoba', 'Katalog Ozdoba']),
        'build': ('Budowa domu od $600/m², pod klucz od $1 100/m²; projekt architektoniczny od $12/m². Konsultacja telefoniczna jest bezpłatna.',
                  ['/pl/budowa-domow', 'Budowa domów'], ['/pl/budowa-domow#build-anim', 'Zobacz, jak budujemy']),
        'smeta': ('Remont od $550/m²: robocizna i materiały stanu surowego; materiały wykończeniowe, meble i AGD — osobno, wg kosztorysu. Konsultacja telefoniczna jest bezpłatna.',
                  ['/pl/remont-pod-klucz', 'Remont pod klucz'], ['/pl/kalkulator-remontu', 'Kalkulator remontu']),
        'design': ('Projekt wnętrza od $30/m² (min. $2 500), układ funkcjonalny od $6/m². Konsultacja telefoniczna jest bezpłatna.',
                   ['/pl/projektowanie-wnetrz', 'Projektowanie wnętrz'], ['/pl/kalkulator-remontu', 'Kalkulator kosztów']),
        'own': ('Opowiedz o obiekcie — podamy orientacyjny koszt. Konsultacja telefoniczna jest bezpłatna.', None, None),
    },
}
TP_ARIA = {'uk': 'Послуга за темою статті', 'ru': 'Услуга по теме статьи', 'en': 'Related service', 'pl': 'Usługa związana z artykułem'}


def _exists(href):
    p = href.split('#')[0].strip('/')
    return bool(p) and (os.path.exists(os.path.join(ROOT, p + '.html')) or os.path.exists(os.path.join(ROOT, p, 'index.html')))


def topic(a):
    """Тема: спершу slug (надзор/нагляд, кошторис — кнопка на свою послугу), далі — родина URL послуги статті."""
    for k, rx, _ in TOPICS:
        if rx and re.search(rx, a['slug']):
            own = next(f for t, _, f in TOPICS if t == 'own')
            return 'own' if k == 'smeta' and re.search(own, a['service'][0]) else k  # кошторис комплексу/офісу — своя послуга й ставки
    return next((k for k, _, f in TOPICS if re.search(f, a['service'][0])), 'own')


def cta_html(a):
    """<aside class="bcta">: рядок + кнопка на лендинг за темою (+ друге посилання). Порожньо, якщо мови немає в TP."""
    lang = a['lang']
    if lang not in TP:
        return ''
    k = topic(a)
    line, main, sec = TP[lang][k]
    fam = next(f for t, _, f in TOPICS if t == k)
    su, sl = a['service']
    sl = re.sub(r'\s+(?:від|от|from|od)\s+\$.*$', '', sl)
    if not main or k not in ('nadzor', 'smeta') or re.search(fam, su) or (k == 'smeta' and re.search(SMETA_KEEP, su)):
        main = [su, sl]  # послуга статті точніша; тему перекриваємо лише для нагляду й кошторису
    if not _exists(main[0]):
        main = [su, sl]
    if sec and (not _exists(sec[0]) or (sec[0].split('#')[0] == main[0] and '#' not in sec[0])):
        sec = None
    o = (f'<aside class="bcta" data-t="{k}" aria-label="{esc(TP_ARIA.get(lang, ""))}"><p>{esc(line)}</p><p class="bcta-a">'
         f'<a class="btn main" href="{main[0]}">{esc(main[1])}</a>')
    if sec:
        o += f'<a class="bcta-2" href="{sec[0]}">{esc(sec[1])} →</a>'
    return o + '</p></aside>'


def _icon(i, ver):
    return f'<svg class="ic" aria-hidden="true"><use href="/assets/icons.v1.svg?v={ver}#{i}"/></svg>'


def _words(body):
    n = 0
    for node in body:
        if node[0] == 'p':
            n += len(node[1].split())
        elif node[0] in ('ul', 'ol'):
            n += sum(len(x.split()) for x in node[1])
    return n


def pie_key(a):
    if a['lang'] not in ('uk', 'ru', 'en', 'pl', 'es', 'de', 'fr', 'zh', 'ar'):
        return None
    src = (a['slug'] + ' ' + a['title']).lower()
    # лише технічні статті: будівництво, конструкції, «мокрі» зони, підлоги, покрівля
    if not re.search(r'будівництв|будинк|будинок|строительств|\bдом[аы]?\b|house|budow|\bванн|bathroom.renovation|łazienk|стяжк|покрівл|кровл|фундамент|пиріг|пирог|технолог|каркас|газоблок|брус|roof', src):
        return None
    for rx, k in PIES:
        if re.search(rx, src):
            return k
    return None


def pie_html(lang, key):
    import buildanim_data as BD
    t = BD.T.get(lang) or BD.T['en']
    title, rows = t['pie'][key]
    typ = t['ui'].get('typ', '')
    li = ''.join(f'<li style="--i:{n}"><b>{esc(a)}</b><span class="bp-t">{esc(th)}</span><span class="bp-n">{esc(no)}</span></li>' for n, (a, th, no) in enumerate(rows))
    return f'<figure class="bpie" aria-label="{esc(title)}"><figcaption>{esc(title)} <small>{esc(typ)}</small></figcaption><ol>{li}</ol></figure>'


def body(a, render_node, inline, ver):
    """HTML статті: «Коротко» → зміст-плитки → розділи (h2 + .bsc) з чеклістами; пиріг — у кінці розділу, де йдеться про тему."""
    lang, t = a['lang'], T.get(a['lang'], T['en'])
    secs, cur = [], None
    pre = []
    for node in a['body']:
        if node[0] == 'h2':
            cur = [node[1], []]; secs.append(cur)
        elif cur is None:
            pre.append(node)
        else:
            cur[1].append(node)
    pk = pie_key(a)
    pie_at = None
    if pk:
        words = {'roof': r'покрівл|кровл|дах|roof', 'fplate': r'фундамент|foundation', 'f_wet': r'гідроізол|гидроизол|waterproof|ванн',
                 'f_floor': r'стяжк|підлог|пол|floor', 'slab': r'перекрит|перекрыт|slab', 'win': r'вікн|окн|window'}.get(pk, r'стін|стен|wall|кладк|газоблок')
        pie_at = next((i for i, (h, nodes) in enumerate(secs) if re.search(words, (h + ' ' + ' '.join(str(n[1]) for n in nodes)).lower())), 0 if secs else None)
    o = [render_node(pre)] if pre else []
    # «Коротко»: час читання, ціни зі статті, розділи й питання, послуга
    mins = max(1, round(_words(a['body']) / 200))
    text = ' '.join(str(n[1]) for n in a['body'] if n[0] in ('p', 'ul', 'ol'))
    prices = []
    for m in PRICE.finditer(text):
        p = re.sub(r'\s+', ' ', m.group(0)).strip()
        if p.lower() not in [x.lower() for x in prices]:
            prices.append(p)
    rows = [('ti', f'≈ {mins} {t["read"]}'), ('st', f'{t["parts"]}: {len(secs)} · {t["q"]}: {len(a.get("faq", []))}')]
    if prices:
        rows.insert(1, ('pr', f'{t["price"]}: ' + ', '.join(prices[:3])))
    su, sl = a['service']
    k = (f'<aside class="bk" aria-label="{esc(t["k"])}"><p class="bk-h">{esc(t["k"])}</p><ul>'
         + ''.join(f'<li>{_icon(i, ver)}<span>{esc(x)}</span></li>' for i, x in rows)
         + f'<li>{_icon("ho", ver)}<span>{esc(t["svc"])}: <a href="{su}">{esc(sl)}</a></span></li></ul></aside>')
    o.append(k)
    if len(secs) >= 3:
        o.append(f'<nav class="btoc" aria-label="{esc(t["toc"])}">' + ''.join(
            f'<a href="#s{i + 1}"><b>{i + 1:02d}</b><span>{esc(h)}</span></a>' for i, (h, _) in enumerate(secs)) + '</nav>')
    cta = cta_html(a)
    at = 1 if len(secs) >= 3 else -1  # після 2-го розділу; коротка стаття — одразу після «Коротко»
    if at < 0 and cta:
        o.append(cta)
    for i, (h, nodes) in enumerate(secs):
        inner = render_node(nodes)
        inner = re.sub(r'<ul>', '<ul class="chk">', inner)  # чеклісти з іконками (CSS ::before)
        if i == pie_at:
            inner += '\n' + pie_html(lang, pk)
        o.append(f'<section class="bsec" id="s{i + 1}" aria-labelledby="s{i + 1}h"><h2 id="s{i + 1}h">{esc(h)}</h2><div class="bsc">{inner}</div></section>')
        if i == at and cta:
            o.append(cta)
    return '\n'.join(o)
