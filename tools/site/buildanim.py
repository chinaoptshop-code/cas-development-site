#!/usr/bin/env python3
"""«Будинок з нуля» / «Ремонт з нуля» — scroll-анімація збірки (UI-kit /styleguide/#build-anim).

  python3 tools/site/buildanim.py            # поставити/оновити блок на сторінках PAGES (ідемпотентно)
  python3 tools/site/buildanim.py --check    # лише перевірка (код 1, якщо щось не оновлено)

Блок — між <!--ba--> і <!--/ba-->: <section class="bz" id="build-anim"> зі справжнім текстом етапів (<ol class="steps">,
SEO й читачі екрана; без JS це звичайний список «Етапи» з UI-kit) + слот швидкої заявки .lq-slot data-form="quick-build-anim"
(спільний /assets/lead-form.v1.js → data-source «<сторінка>#build-anim») ; сам скрипт (data-js) вантажить /assets/site-chrome.v1.js лише після першої прокрутки — на завантаженні 0 байтів і 0 мс.
Скрипт (і CSS) вантажить site-chrome.v1.js після першої прокрутки; за ~3 екрани до блоку скрипт малює ізометричну SVG-сцену кодом
(без картинок і бібліотек) і веде її за прокруткою; prefers-reduced-motion — статичні кадри зі степером.
Сцени: house — будинок (8 етапів), flat — ремонт квартири (8 етапів); data-bz-c — компактна версія (головна).

Бюджет лендингу 64 КБ (tools/ui/ui.py): якщо повний текст не вміщується із запасом, на сторінку йдуть лише назви етапів,
а описи підставляє скрипт (той самий текст — словник D у build-anim.v1.js; тримати синхронно з T нижче).
На ручних сторінках будівництва (budivnytstvo-budynkiv-kyiv, ru/stroitelstvo-domov-kiev) блок замінив розділ «Як працюємо»
(01.11.2026, бюджет 64 КБ): там блок стоїть перед «Гарантіями». Сторінки «Вартість …» без блоку — не вміщуються в бюджет.
Факти — лише з CLAUDE.md (команда з /about, гарантія 36 міс., фотозвіти раз на 1–2 тижні), без цін.
Генератори (landing.py) блоку не знають: build-all.sh запускає цей скрипт після них, перед chrome.py.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'ui'))
import ui  # noqa: E402  бюджети сторінок (BUDGET, kind)

RESERVE = 1024        # запас байтів після вставки повного тексту, інакше — лише назви етапів

# сторінка: (сцена, компактна) — сторінки будівництва, ремонту квартир і головні
PAGES = {
    'budivnytstvo-budynkiv-kyiv.html': ('house', 0),
    'vartist-budivnytstva-budynku-kyiv.html': ('house', 0),
    'karkasnyi-budynok-pid-kliuch-kyiv.html': ('house', 0),
    'modulnyi-budynok-kyiv.html': ('house', 0),
    'budynok-z-brusa-kyiv.html': ('house', 0),
    'budynok-pid-kliuch-koncha-zaspa.html': ('house', 0),
    'ru/stroitelstvo-domov-kiev.html': ('house', 0),
    'ru/karkasnyy-dom-pod-klyuch-kiev.html': ('house', 0),
    'ru/modulnyy-dom-kiev.html': ('house', 0),
    'ru/dom-iz-brusa-kiev.html': ('house', 0),
    'en/house-construction.html': ('house', 0),
    'remont-kvartyr-kyiv.html': ('flat', 0),
    'remont-pid-klyuch-kyiv.html': ('flat', 0),
    'kapitalnyi-remont-kvartyry-kyiv.html': ('flat', 0),
    'remont-novobudovy-kyiv.html': ('flat', 0),
    'vartist-remontu-kvartyry-kyiv.html': ('flat', 0),
    'ru/remont-kvartir-kiev.html': ('flat', 0),
    'ru/kapitalnyy-remont-kvartiry-kiev.html': ('flat', 0),
    'en/turnkey-renovation.html': ('flat', 0),
    'index.html': ('house', 1),
    'ru/index.html': ('house', 1),
    'en/index.html': ('house', 1),
}

# стартовий матеріал стін у конфігураторі сцени «будинок» (block — газоблок за замовчуванням; brick, frame, brus)
MAT = {'karkasnyi-budynok-pid-kliuch-kyiv.html': 'frame', 'ru/karkasnyy-dom-pod-klyuch-kiev.html': 'frame',
       'modulnyi-budynok-kyiv.html': 'frame', 'ru/modulnyy-dom-kiev.html': 'frame',
       'budynok-z-brusa-kyiv.html': 'brus', 'ru/dom-iz-brusa-kiev.html': 'brus'}
ABOUT = {'uk': '/about', 'ru': '/ru/o-nas', 'en': '/en/about'}
BUILD = {'uk': '/budivnytstvo-budynkiv-kyiv', 'ru': '/ru/stroitelstvo-domov-kiev', 'en': '/en/house-construction'}

# (назва, опис) — опис починається з того, хто робить етап (команда — на /about)
T = {
    'uk': {
        'house': dict(
            h='Будинок з нуля: 8 етапів', hc='Будинок з нуля — за 8 кроків',
            p='Прокручуйте — і будинок збереться так само, як на ділянці. Фотозвіти з обʼєкта — раз на 1–2 тижні.',
            cta='Порахувати мій будинок', team='Хто ці люди — на сторінці', about='Про нас', more='Будівництво будинків',
            st=[('Ділянка й геодезія', 'Геодезист Микола знімає рельєф і виносить осі будинку.'),
                ('Фундамент', 'Прораб і власна бригада армують і бетонують основу.'),
                ('Стіни й каркас', 'Газоблок, цегла, каркас чи брус — за обраною технологією.'),
                ('Перекриття', 'Бригада робить перекриття між поверхами й над другим.'),
                ('Дах', 'Крокви, утеплення й покрівля; хід робіт знімаємо з дрона.'),
                ('Вікна й двері', 'Ставимо вікна й вхідні двері — коробка закрита від погоди.'),
                ('Фасад', 'Утеплення й оздоблення фасаду, водостоки, відмостка.'),
                ('Інтерʼєр і світло', 'Інженерія, оздоблення, меблі від наших меблярів — і світло у вікнах.')]),
        'flat': dict(
            h='Ремонт з нуля: 8 етапів', hc='Ремонт з нуля — за 8 кроків',
            p='Прокручуйте — і квартира пройде шлях від бетону до ключів. Фотозвіти з обʼєкта — раз на 1–2 тижні.',
            cta='Порахувати мій ремонт', team='Хто ці люди — на сторінці', about='Про нас', more='',
            st=[('Обміри й 3D-замір', 'Владислав робить 3D-замір, прораб складає план робіт.'),
                ('Перегородки', 'Зводимо стіни за планувальним рішенням дизайн-проєкту.'),
                ('Електрика й сантехніка', 'Розводимо кабелі й труби до кожної точки за проєктом.'),
                ('Стяжка й штукатурка', 'Вирівнюємо підлогу й стіни під чистове оздоблення.'),
                ('Оздоблення', 'Плитка, фарба, підлога — за матеріалами з проєкту.'),
                ('Двері й світло', 'Ставимо двері, вікна, світильники, розетки й вимикачі.'),
                ('Меблі на замовлення', 'Меблярі Сергій, Андрій і Олег монтують кухню й шафи.'),
                ('Здача й гарантія', 'Прибирання, перевірка, ключі — і гарантія 36 місяців.')]),
    },
    'ru': {
        'house': dict(
            h='Дом с нуля: 8 этапов', hc='Дом с нуля — за 8 шагов',
            p='Прокручивайте — и дом соберётся так же, как на участке. Фотоотчёты с объекта — раз в 1–2 недели.',
            cta='Рассчитать мой дом', team='Кто эти люди — на странице', about='О нас', more='Строительство домов',
            st=[('Участок и геодезия', 'Геодезист Николай снимает рельеф и выносит оси дома.'),
                ('Фундамент', 'Прораб и собственная бригада армируют и бетонируют основание.'),
                ('Стены и каркас', 'Газоблок, кирпич, каркас или брус — по выбранной технологии.'),
                ('Перекрытия', 'Бригада делает перекрытия между этажами и над вторым.'),
                ('Крыша', 'Стропила, утепление и кровля; ход работ снимаем с дрона.'),
                ('Окна и двери', 'Ставим окна и входные двери — коробка закрыта от погоды.'),
                ('Фасад', 'Утепление и отделка фасада, водостоки, отмостка.'),
                ('Интерьер и свет', 'Инженерия, отделка, мебель от наших мебельщиков — и свет в окнах.')]),
        'flat': dict(
            h='Ремонт с нуля: 8 этапов', hc='Ремонт с нуля — за 8 шагов',
            p='Прокручивайте — и квартира пройдёт путь от бетона до ключей. Фотоотчёты с объекта — раз в 1–2 недели.',
            cta='Рассчитать мой ремонт', team='Кто эти люди — на странице', about='О нас', more='',
            st=[('Обмеры и 3D-замер', 'Владислав делает 3D-замер, прораб составляет план работ.'),
                ('Перегородки', 'Возводим стены по планировочному решению дизайн-проекта.'),
                ('Электрика и сантехника', 'Разводим кабели и трубы к каждой точке по проекту.'),
                ('Стяжка и штукатурка', 'Выравниваем пол и стены под чистовую отделку.'),
                ('Отделка', 'Плитка, краска, пол — по материалам из проекта.'),
                ('Двери и свет', 'Ставим двери, окна, светильники, розетки и выключатели.'),
                ('Мебель на заказ', 'Мебельщики Сергей, Андрей и Олег монтируют кухню и шкафы.'),
                ('Сдача и гарантия', 'Уборка, проверка, ключи — и гарантия 36 месяцев.')]),
    },
    'en': {
        'house': dict(
            h='A house from scratch: 8 stages', hc='A house from scratch in 8 steps',
            p='Scroll and the house comes together the way it does on site. Photo reports from the site every 1–2 weeks.',
            cta='Estimate my house', team='Meet the people behind each stage on the', about='About page', more='House construction',
            st=[('Plot and survey', 'Our surveyor Mykola maps the terrain and sets out the house axes.'),
                ('Foundation', 'The site manager and our own crew reinforce and pour the base.'),
                ('Walls and frame', 'Aerated block, brick, timber frame or beam — per the chosen method.'),
                ('Floor slabs', 'The crew builds the slabs between and above the floors.'),
                ('Roof', 'Rafters, insulation and roofing; we film progress by drone.'),
                ('Windows and doors', 'Windows and the entrance door go in — the shell is weathertight.'),
                ('Facade', 'Insulation and facade finish, gutters and the perimeter path.'),
                ('Interior and light', 'Services, finishes, furniture by our joiners — and the lights come on.')]),
        'flat': dict(
            h='A renovation from scratch: 8 stages', hc='A renovation from scratch in 8 steps',
            p='Scroll and the apartment goes from bare concrete to keys. Photo reports from the site every 1–2 weeks.',
            cta='Estimate my renovation', team='Meet the people behind each stage on the', about='About page', more='',
            st=[('Survey and 3D scan', 'Vladyslav makes a 3D scan, the site manager draws up the work plan.'),
                ('Partitions', 'We build the walls to the layout from the design project.'),
                ('Wiring and plumbing', 'Cables and pipes are run to every point in the project.'),
                ('Screed and plaster', 'Floors and walls are levelled for the finishing coat.'),
                ('Finishes', 'Tiles, paint and flooring — the materials from the project.'),
                ('Doors and lighting', 'Doors, windows, light fittings, sockets and switches go in.'),
                ('Custom furniture', 'Our joiners Serhii, Andrii and Oleh install the kitchen and wardrobes.'),
                ('Handover and warranty', 'Cleaning, inspection, keys — and a 36-month warranty.')]),
    },
}
RX = re.compile(r'\n?<!--ba-->.*?<!--/ba-->', re.S)
e = lambda s: html.escape(s, quote=True)


def block(lang, scene, compact, tier=0, mat=''):
    """tier 0 — повний текст; 1 — лише назви етапів (описи — зі скрипта); 2 — ще й без вступу та рядка про команду."""
    t = T[lang][scene]
    li = ''.join((f'<li><div><b>{e(a)}</b><span>{e(b)}</span></div></li>' if tier == 0 else f'<li><b>{e(a)}</b></li>') for a, b in t['st'])
    more = f' <a href="{BUILD[lang]}">{e(t["more"])} →</a>' if compact and t['more'] else ''
    c = ' data-bz-c' if compact else ''
    f = (' data-bz-d' if tier else '') + (f' data-bz-m="{mat}"' if mat else '')  # data-bz-d: описи підставляє скрипт
    lead = f'<p class="bz-p">{e(t["p"])}{more}</p>' if tier < 2 else ''
    svc = f' data-service="{e(t["more"])}"' if compact and t['more'] else ''  # головна: заявка — про будинок, а не «Консультація (головна)»
    team = f'<p class="bz-team">{e(t["team"])} <a href="{ABOUT[lang]}">{e(t["about"])}</a></p>' if tier < 2 else ''
    return (f'\n<!--ba--><section class="bz" id="build-anim" data-bz="{scene}"{c}{f} aria-labelledby="bz-h" data-js="/assets/build-anim.v1.js" data-css="/assets/build-anim.v1.css"><div class="w">'
            f'<h2 id="bz-h">{e(t["hc"] if compact else t["h"])}</h2>{lead}'
            f'<ol class="steps bz-st">{li}</ol>'
            f'<div class="bz-cta" id="bz-cta"><h3>{e(t["cta"])}</h3>'
            f'<div class="lq-slot" data-form="quick-build-anim"{svc}></div>{team}</div>'
            f'</div></section><!--/ba-->')


# де ставимо: перед «Як працюємо», інакше перед «Гарантіями», квізом чи формою; на головній — перед «Наші проєкти»
HOW = re.compile(r'<section><div class="w">\s*<h2>(?:Як працюємо|Как (?:мы )?работаем|How we work)</h2>')
ANCHORS = ('<!--cas:guarantees-->', '<!--quiz-->', '<section id="zayavka"')
HOME = ('<section class="proj-covers"', '<section class="pcarousel"')


def apply(s, rel):
    s = RX.sub('', s)
    if rel not in PAGES:
        return s
    scene, compact = PAGES[rel]
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m and m.group(1) in T else 'uk'
    k = next((s.find(a) for a in HOME if s.find(a) >= 0), -1) if compact else -1
    if k < 0:
        mh = HOW.search(s)
        k = mh.start() if mh else next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
    if k < 0:
        return s
    # бюджет HTML за типом сторінки (tools/ui/ui.py): повний текст — лише із запасом RESERVE, далі — коротші варіанти;
    # не вміщується навіть найкоротший — блок не ставимо (скрипт друкує, де саме)
    limit = ui.BUDGET['html_kb'][ui.kind(rel, s)] * 1024
    for tier in (0, 1, 2):
        b = block(lang, scene, compact, tier, MAT.get(rel, ''))
        if len(s.encode()) + len(b.encode()) + 40 <= limit - (RESERVE if tier == 0 else 0):  # +40 — ?v= від chrome.versions
            return s[:k].rstrip('\n') + b + '\n' + s[k:]
    return s


def main():
    import chrome
    check = '--check' in sys.argv
    bad = []
    for rel in PAGES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel)
        if n != s:  # та сама типографіка, що ставить chrome.py (нерозривні пробіли, <span class="nw">), і ?v= файлів
            m = re.search(r'<html[^>]*\blang="([a-z]{2})', n)
            n = chrome.versions(chrome.nbsp_prices(n, m.group(1) if m else None))
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Будинок з нуля: OK')
        sys.exit(1 if bad else 0)
    got = {r: open(os.path.join(ROOT, r), encoding='utf-8').read() for r in PAGES if os.path.exists(os.path.join(ROOT, r))}
    short = [r for r, s in got.items() if 'data-bz-d' in s]
    none = [r for r, s in got.items() if '<!--ba-->' not in s]
    print(f'Будинок з нуля: оновлено {len(bad)} з {len(PAGES)} сторінок'
          + (f'; коротко (бюджет HTML): {", ".join(short)}' if short else '') + (f'; без блоку (бюджет): {", ".join(none)}' if none else ''))


if __name__ == '__main__':
    main()
