#!/usr/bin/env python3
"""3D-тури CAS: тека 360-фото → тур на сайті (/tury/<slug>).

  python3 tools/tours/build.py new <тека-з-фото> <slug> "Назва туру" [--desc "Опис"] [--max 15]
      Новий тур завжди прихований ("hidden": true) — відкрити після ОК Михайла.
      Стискає фото (equirect 2:1) у img/tury/<slug>/ (4096 px — працює на будь-якому телефоні й у VR),
      створює tools/tours/tours/<slug>.json: сцени за іменами файлів, переходи «далі / назад» між сусідніми.
  python3 tools/tours/build.py pages
      Перебудовує сторінки: /tury (список турів) і /tury/<slug> (переглядач) з усіх JSON.
      Під переглядачем відкритого туру — текст із tools/tours/about.json (title/description, лід, «Докладніше» в <details>,
      посилання на /proekty, послуги, /portfolio, «Інші тури» тієї ж групи); ?embed=1 — лише переглядач.
      Новий відкритий тур: текст в about.json і посилання в rel «3D-тури 360°» у tools/site/pages/uk-portfolio.json.

Переходи точно розставляються мишкою: відкрити /tury/<slug>?edit=1 → клік по фото → обрати кімнату →
«Скопіювати JSON» → вставити в tools/tours/tours/<slug>.json → `pages`.
Залежностей немає: стиснення — macOS `sips` (на Linux — Pillow, якщо є).
"""
import html, json, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'tools/tours/tours'
IMG = ROOT / 'img/tury'
OUT = ROOT / 'tury'
SITE = 'https://cas-develop.com'
MAXW = 4096


def resize(src: Path, dst: Path):
    """Стиснення до 4096 px БЕЗ метаданих (EXIF/GPS 360-камер видає адресу обʼєкта)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    ff = shutil.which('ffmpeg') or '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg'
    if Path(ff).exists():
        for w, q, out in ((MAXW, '4', dst), (640, '6', dst.with_name(dst.stem + '-thumb.jpg'))):
            subprocess.run([ff, '-loglevel', 'error', '-y', '-i', str(src), '-vf', f'scale={w}:-2:flags=lanczos',
                            '-map_metadata', '-1', '-q:v', q, str(out)], check=True)
    else:
        from PIL import Image
        im = Image.open(src).convert('RGB')
        im.thumbnail((MAXW, MAXW // 2)); im.save(dst, quality=82)  # Pillow не переносить EXIF, якщо не передати
        im.thumbnail((640, 320)); im.save(dst.with_name(dst.stem + '-thumb.jpg'), quality=70)


def slugify(s):
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
    return s or 'scene'


def new(folder, slug, title, desc='', maxn=0, names=None):
    files = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.heic'))
    if maxn and len(files) > maxn:
        files = [files[round(i * (len(files) - 1) / (maxn - 1))] for i in range(maxn)]
    if not files:
        raise SystemExit(f'У {folder} немає фото')
    scenes = []
    for i, f in enumerate(files):
        sid = slugify(f.stem)
        if any(s['id'] == sid for s in scenes):
            sid = f'{sid}-{i}'
        resize(f, IMG / slug / f'{sid}.jpg')
        scenes.append({'id': sid, 'name': (names or 'Точка {n}').format(n=i + 1) if names or re.match(r'(?i)img|dji|pano|\d', f.stem) else re.sub(r'[_-]+', ' ', f.stem).strip().capitalize(),
                       'image': f'/img/tury/{slug}/{sid}.jpg', 'yaw': 0, 'hotspots': []})
    for i, s in enumerate(scenes):  # чернетка переходів: далі — попереду, назад — позаду
        if i + 1 < len(scenes):
            s['hotspots'].append({'to': scenes[i + 1]['id'], 'yaw': 0, 'pitch': -15})
        if i > 0:
            s['hotspots'].append({'to': scenes[i - 1]['id'], 'yaw': 180, 'pitch': -15})
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / f'{slug}.json').write_text(json.dumps({'slug': slug, 'title': title, 'description': desc, 'hidden': True,
                                                   'start': scenes[0]['id'], 'scenes': scenes},
                                                  ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Тур {slug}: {len(scenes)} сцен → tools/tours/tours/{slug}.json')
    pages()


VIEW = '''<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{ttag}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{site}{base}/{slug}">{alts}{robots}
<meta property="og:title" content="{ogt}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}{thumb}">
<meta property="og:url" content="{site}{base}/{slug}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg">
<link rel="stylesheet" href="/assets/tours/tour.v1.css?v={vcss}">
<script type="application/ld+json">{crumbs}</script>
<script src="/assets/tours/aframe.min.js"></script>
</head><body class="tp">
<script type="application/json" id="tour-data">{data}</script>
<div class="tv" id="tv">
<a-scene id="scene" embedded cursor="rayOrigin: mouse; fuse: false" raycaster="objects: .spot, .sky-hit" vr-mode-ui="enabled: true" loading-screen="dotsColor:#c8a96a; backgroundColor:#111" renderer="colorManagement:true" xr-mode-ui="enabled: true">
  <a-assets timeout="20000"></a-assets>
  <a-sky id="sky" rotation="0 -90 0"></a-sky>
  <a-entity id="spots" follow-cam></a-entity>
  <a-entity id="rig">
    <a-camera id="cam" camera="userHeight: 0" position="0 0 0" look-controls="reverseMouseDrag:true; magicWindowTrackingEnabled:true" wasd-controls="enabled:false">
      <a-cursor id="cursor" fuse="false" raycaster="objects:.spot" material="color:#fff; shader:flat" visible="false"></a-cursor>
    </a-camera>
    <a-entity laser-controls="hand: right" raycaster="objects:.spot; far: 30"></a-entity>
    <a-entity laser-controls="hand: left" raycaster="objects:.spot; far: 30"></a-entity>
  </a-entity>
</a-scene>
<div class="ui">
  <a class="brand" href="{base}" target="_top">CAS · 3D</a>
  <h1 class="title" id="title" style="margin:0;font-weight:inherit">{title}</h1>
  <button class="btn" id="menuBtn" aria-label="{x[rooms]}" aria-controls="rooms" aria-expanded="false">☰ {x[rooms]}</button>
</div>
<nav class="rooms" id="rooms" aria-label="{x[rooms_nav]}" hidden></nav>
<div class="tnav" id="nav"><button class="ib" id="prevBtn" aria-label="{x[prev]}">‹</button><span class="cnt" id="cnt" aria-live="polite"></span><button class="ib" id="nextBtn" aria-label="{x[next]}">›</button></div>
<div class="tzoom" role="group" aria-label="{x[zoom]}"><button class="ib" id="zoomIn" aria-label="{x[zin]}">+</button><button class="ib" id="zoomOut" aria-label="{x[zout]}">−</button></div>
<div class="hint" id="hint">{x[hint]}</div>
<div class="edit" id="edit" hidden></div>
</div>{info}
<script src="/assets/tours/tour.v1.js?v={vjs}"></script>
</body></html>
'''

INDEX = '''<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{x[i_title]}</title>
<meta name="description" content="{x[i_desc]}">
<link rel="canonical" href="{site}{base}">
{alts}<script type="application/ld+json">{crumbs}</script>
<meta property="og:title" content="{x[i_ogt]}">
<meta property="og:description" content="{x[i_desc]}">
<meta property="og:url" content="{site}{base}">
<meta property="og:type" content="website">
<meta property="og:image" content="{site}{og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg">
<link rel="stylesheet" href="/assets/tours/tour.v1.css?v={vcss}">
</head><body class="list">
<main class="tl">
<section class="tl-hero">
<p class="tl-eye">{x[i_eye]}</p>
<h1>{x[i_h1]}</h1>
<p class="tl-lead">{x[i_lead]}</p>
<ul class="tl-how">
{x[i_how]}
</ul>
</section>
<section class="tl-grid">{cards}</section>
<section class="tl-cta">
<h2>{x[i_cta_h]}</h2>
<p>{x[i_cta_p]}</p>
<div class="tl-btns"><a class="tl-btn" href="{x[contact]}">{x[i_cta_a]}</a><a class="tl-btn ghost" href="tel:+380978667755">+380 97 866 77 55</a></div>
</section>
</main>
</body></html>
'''


# ── текст під переглядачем (tools/tours/about.json; en/ru — about-<мова>.json): що за обʼєкт, що видно, статус, навіщо 360°, посилання ──
ABOUT = ROOT / 'tools/tours/about.json'
LANGS = ('uk', 'en', 'ru')  # uk — основна; en/ru — лише відкриті тури з текстом в about-<мова>.json (/en/tury/<slug>, /ru/tury/<slug>)
CL = ROOT / 'tools/site/lang/clusters-tours.json'  # hreflang-кластери турів (пише pages(); tools/site/i18n.py зливає clusters-*.json)
HOW = {  # спільний абзац «навіщо тур 360°» — чотири варіанти, щоб тексти турів не повторювалися дослівно
    'uk': {
    'A': 'Навіщо тур 360°: дизайн-проєкт можна обійти ще до ремонту й побачити, як кімнати переходять одна в одну. '
         'Планування, кольори й меблі легше погодити на моделі — правки вносимо в проєкт, а не на обʼєкті. '
         'Модель будуємо на реальні розміри: наш фахівець робить 3D-замір приміщення сканером.',
    'B': 'Тур 360° показує проєкт так, як його побачать господарі: з висоти очей і з реальними пропорціями кімнат. '
         'На етапі проєкту зручно перевірити, куди дивляться вікна, як стоять меблі й чи вистачає світла, — і змінити це до початку робіт. '
         'Розміри для моделі дає 3D-замір, який робить наш фахівець.',
    'C': 'Концепт задає напрям: матеріали, світло, настрій кімнат. Обійти його в 360° простіше, ніж розглядати окремі рендери: '
         'одразу зрозуміло, що подобається, а що варто змінити в повному дизайн-проєкті.',
    'D': 'Концепт у 360° — це спосіб обрати стиль до того, як почнеться детальний проєкт: '
         'кімнати видно цілком, а не окремими кадрами, тому порівнювати варіанти й вирішувати простіше.'},
    'en': {
    'A': 'Why a 360° tour: you can walk through a design project before the renovation and see how the rooms flow into one another. '
         'Layout, colours and furniture are easier to agree on the model — changes go into the project, not onto the site. '
         'The model is built to real dimensions: our specialist does a 3D scan of the space.',
    'B': 'A 360° tour shows the project the way the owners will see it: at eye level and with the real proportions of the rooms. '
         'At the design stage it is easy to check where the windows look, how the furniture stands and whether there is enough light — and change it before the works start. '
         'The dimensions for the model come from a 3D scan done by our specialist.',
    'C': 'A concept sets the direction: materials, light, the mood of the rooms. Walking through it in 360° is easier than looking at separate renders: '
         'you immediately see what you like and what is worth changing in the full design project.',
    'D': 'A concept in 360° is a way to choose a style before the detailed project starts: '
         'you see whole rooms rather than single frames, so comparing options and deciding is easier.'},
    'ru': {
    'A': 'Зачем тур 360°: дизайн-проект можно обойти ещё до ремонта и увидеть, как комнаты переходят одна в другую. '
         'Планировку, цвета и мебель проще согласовать на модели — правки вносим в проект, а не на объекте. '
         'Модель строим по реальным размерам: наш специалист делает 3D-замер помещения сканером.',
    'B': 'Тур 360° показывает проект так, как его увидят хозяева: с высоты глаз и с реальными пропорциями комнат. '
         'На этапе проекта удобно проверить, куда смотрят окна, как стоит мебель и хватает ли света, — и изменить это до начала работ. '
         'Размеры для модели даёт 3D-замер, который делает наш специалист.',
    'C': 'Концепт задаёт направление: материалы, свет, настроение комнат. Обойти его в 360° проще, чем рассматривать отдельные рендеры: '
         'сразу понятно, что нравится, а что стоит изменить в полном дизайн-проекте.',
    'D': 'Концепт в 360° — это способ выбрать стиль до того, как начнётся детальный проект: '
         'комнаты видно целиком, а не отдельными кадрами, поэтому сравнивать варианты и решать проще.'},
}
# назви кімнат (uk у JSON туру → мова): «Спальня 2», «Хол, 2 поверх», «Точка 5» — основа + номер
ROOMS = {
    'en': {'Спальня': 'Bedroom', 'Вітальня': 'Living room', 'Кухня': 'Kitchen', 'Передпокій': 'Entrance hall', 'Ванна': 'Bathroom', 'Хол': 'Hall',
           'Їдальня': 'Dining room', 'Гардеробна': 'Walk-in wardrobe', 'Тераса': 'Terrace', 'Коридор': 'Corridor', 'Дитяча': 'Nursery', 'Лазня': 'Bathhouse',
           'Пральня': 'Laundry', 'Гостьова спальня': 'Guest bedroom', 'Душова': 'Shower room', 'Точка': 'Viewpoint'},
    'ru': {'Спальня': 'Спальня', 'Вітальня': 'Гостиная', 'Кухня': 'Кухня', 'Передпокій': 'Прихожая', 'Ванна': 'Ванная', 'Хол': 'Холл',
           'Їдальня': 'Столовая', 'Гардеробна': 'Гардеробная', 'Тераса': 'Терраса', 'Коридор': 'Коридор', 'Дитяча': 'Детская', 'Лазня': 'Баня',
           'Пральня': 'Прачечная', 'Гостьова спальня': 'Гостевая спальня', 'Душова': 'Душевая', 'Точка': 'Точка'},
}
FLOOR = {'en': lambda n: f'{n}{"st" if n == 1 else "nd" if n == 2 else "rd" if n == 3 else "th"} floor', 'ru': lambda n: f'{n} этаж'}
WORDS = {  # kind / place з JSON туру
    'en': {'Дизайн-проєкт': 'Design project', '360-візуалізація': '360 visualisation', 'Концепт': 'Concept', 'Квартира': 'Apartment', 'Київ': 'Kyiv', 'Карпати': 'Carpathians'},
    'ru': {'Дизайн-проєкт': 'Дизайн-проект', '360-візуалізація': '360-визуализация', 'Концепт': 'Концепт', 'Квартира': 'Квартира', 'Київ': 'Киев', 'Карпати': 'Карпаты'},
}


def _pl_slav(n, one, few, many):
    return one if n % 10 == 1 and n % 100 != 11 else few if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else many


X = {  # підписи сторінок мовою
    'uk': dict(rooms='Кімнати', rooms_nav='Кімнати туру', prev='Попередня кімната', next='Наступна кімната', zoom='Масштаб', zin='Наблизити', zout='Віддалити',
               hint='Тягніть, щоб роздивитись · коліщатко або два пальці — масштаб · стрілки — перехід',
               home='Головна', tours='3D-тури', eye='3D-тур 360°', about='Про тур', more='Докладніше про обʼєкт і тур', rel_aria='Повʼязані сторінки',
               case='Сторінка проєкту', portfolio='Портфоліо', all='Усі 3D-тури', others='Інші тури', frame='кадр 3D-туру', contact='/contact',
               cta='Хочете 3D-тур свого обʼєкта або дизайн-проєкт, який можна так само обійти? ', cta_a='Залишити заявку',
               seen=lambda rooms, n: f'Що є в турі: {", ".join(rooms)} — {n} {_pl_slav(n, "точка", "точки", "точок")} огляду. ',
               seen0=lambda n: f'У турі {n} {_pl_slav(n, "точка", "точки", "точок")} огляду. ',
               nav='Перемикайтеся стрілками на фото, кнопками ‹ › або через меню «Кімнати»; у VR-окулярах — кнопка VR.',
               card_n=lambda n: f'{n} точ.', card_go='Відкрити тур →', card_alt='3D-тур 360°',
               i_title='3D-тури обʼєктів — віртуальні прогулянки | CAS Development',
               i_desc='3D-тури CAS Development: реалізовані інтерʼєри й 360-візуалізації дизайн-проєктів. Дивіться на телефоні, ноутбуці або у VR-окулярах.',
               i_ogt='3D-тури обʼєктів — CAS Development', i_eye='Портфоліо · 360°', i_h1='Пройдіться нашими <em>обʼєктами</em>',
               i_lead='360° тури реалізованих інтерʼєрів і 360-візуалізації наших дизайн-проєктів і концептів — тип кожного туру підписаний на картці. Відкрийте тур і рухайтесь між кімнатами стрілками на фото — так, ніби ви всередині.',
               i_how='<li><b>Телефон</b><span>Повертайте телефон або ведіть пальцем</span></li>\n<li><b>Ноутбук</b><span>Тягніть мишкою, клік по стрілці — наступна кімната</span></li>\n<li><b>VR-окуляри</b><span>Кнопка VR у турі — і ви в обʼєкті</span></li>',
               i_cta_h='Хочете 3D-тур <em>свого</em> обʼєкта?', i_cta_p='Знімемо 360° і зберемо тур для продажу, оренди чи портфоліо — або зробимо дизайн-проєкт, який можна буде так само обійти.',
               i_cta_a='Залишити заявку', i_empty='Тури скоро зʼявляться.'),
    'en': dict(rooms='Rooms', rooms_nav='Tour rooms', prev='Previous room', next='Next room', zoom='Zoom', zin='Zoom in', zout='Zoom out',
               hint='Drag to look around · scroll wheel or two fingers to zoom · arrows to move',
               home='Home', tours='3D tours', eye='360° 3D tour', about='About the tour', more='More about the property and the tour', rel_aria='Related pages',
               case='Project page', portfolio='Portfolio', all='All 3D tours', others='Other tours', frame='3D tour frame', contact='/en/contact',
               cta='Want a 3D tour of your property, or a design project you can walk through like this? ', cta_a='Send a request',
               seen=lambda rooms, n: f'In the tour: {", ".join(rooms)} — {n} viewpoint{"" if n == 1 else "s"}. ',
               seen0=lambda n: f'The tour has {n} viewpoint{"" if n == 1 else "s"}. ',
               nav='Switch with the arrows on the photo, the ‹ › buttons or the «Rooms» menu; in a VR headset, use the VR button.',
               card_n=lambda n: f'{n} pts', card_go='Open the tour →', card_alt='360° 3D tour',
               i_title='3D tours of our projects — virtual walkthroughs | CAS',
               i_desc='CAS Development 3D tours: completed interiors and 360 visualisations of design projects. View them on a phone, a laptop or in a VR headset.',
               i_ogt='3D tours of our projects — CAS Development', i_eye='Portfolio · 360°', i_h1='Walk through our <em>projects</em>',
               i_lead='360° tours of completed interiors and 360 visualisations of our design projects and concepts — the type of each tour is shown on its card. Open a tour and move between rooms with the arrows on the photo, as if you were inside.',
               i_how='<li><b>Phone</b><span>Turn the phone or swipe with a finger</span></li>\n<li><b>Laptop</b><span>Drag with the mouse, click an arrow for the next room</span></li>\n<li><b>VR headset</b><span>Press VR in the tour and you are inside</span></li>',
               i_cta_h='Want a 3D tour of <em>your</em> property?', i_cta_p='We will shoot it in 360° and build a tour for sale, rent or a portfolio — or create a design project you can walk through the same way.',
               i_cta_a='Send a request', i_empty='Tours are coming soon.'),
    'ru': dict(rooms='Комнаты', rooms_nav='Комнаты тура', prev='Предыдущая комната', next='Следующая комната', zoom='Масштаб', zin='Приблизить', zout='Отдалить',
               hint='Тяните, чтобы осмотреться · колёсико или два пальца — масштаб · стрелки — переход',
               home='Главная', tours='3D-туры', eye='3D-тур 360°', about='О туре', more='Подробнее об объекте и туре', rel_aria='Связанные страницы',
               case='Страница проекта', portfolio='Портфолио', all='Все 3D-туры', others='Другие туры', frame='кадр 3D-тура', contact='/ru/kontakty',
               cta='Хотите 3D-тур своего объекта или дизайн-проект, который можно так же обойти? ', cta_a='Оставить заявку',
               seen=lambda rooms, n: f'Что есть в туре: {", ".join(rooms)} — {n} {_pl_slav(n, "точка", "точки", "точек")} обзора. ',
               seen0=lambda n: f'В туре {n} {_pl_slav(n, "точка", "точки", "точек")} обзора. ',
               nav='Переключайтесь стрелками на фото, кнопками ‹ › или через меню «Комнаты»; в VR-очках — кнопка VR.',
               card_n=lambda n: f'{n} точ.', card_go='Открыть тур →', card_alt='3D-тур 360°',
               i_title='3D-туры объектов — виртуальные прогулки | CAS Development',
               i_desc='3D-туры CAS Development: реализованные интерьеры и 360-визуализации дизайн-проектов. Смотрите на телефоне, ноутбуке или в VR-очках.',
               i_ogt='3D-туры объектов — CAS Development', i_eye='Портфолио · 360°', i_h1='Пройдитесь по нашим <em>объектам</em>',
               i_lead='360° туры реализованных интерьеров и 360-визуализации наших дизайн-проектов и концептов — тип каждого тура подписан на карточке. Откройте тур и двигайтесь между комнатами стрелками на фото — так, будто вы внутри.',
               i_how='<li><b>Телефон</b><span>Поворачивайте телефон или ведите пальцем</span></li>\n<li><b>Ноутбук</b><span>Тяните мышкой, клик по стрелке — следующая комната</span></li>\n<li><b>VR-очки</b><span>Кнопка VR в туре — и вы в объекте</span></li>',
               i_cta_h='Хотите 3D-тур <em>своего</em> объекта?', i_cta_p='Снимем 360° и соберём тур для продажи, аренды или портфолио — или сделаем дизайн-проект, который можно будет так же обойти.',
               i_cta_a='Оставить заявку', i_empty='Туры скоро появятся.'),
}


def pre(lang):
    return '' if lang == 'uk' else f'/{lang}'


def _md(t):
    """[текст](/шлях) → <a>; решта екранується."""
    out, k = [], 0
    for m in re.finditer(r'\[([^\]]+)\]\((/[^)\s]*)\)', t):
        out += [html.escape(t[k:m.start()]), f'<a href="{html.escape(m.group(2))}">{html.escape(m.group(1))}</a>']
        k = m.end()
    return ''.join(out) + html.escape(t[k:])


def _split(name):
    """«Хол, 2 поверх» → ('Хол', None, 2); «Спальня 2» → ('Спальня', 2, None)."""
    fl = re.search(r',\s*(\d+)\s*поверх$', name)
    b = name[:fl.start()] if fl else name
    nm = re.search(r'\s+(\d+)$', b)
    return (b[:nm.start()] if nm else b).strip(), int(nm.group(1)) if nm else None, int(fl.group(1)) if fl else None


def room_name(name, lang):
    if lang == 'uk':
        return name
    b, n, fl = _split(name.strip())
    if b not in ROOMS[lang]:
        raise SystemExit(f'tools/tours/build.py: немає перекладу кімнати «{b}» ({lang}) у ROOMS')
    return ROOMS[lang][b] + (f' {n}' if n else '') + (f', {FLOOR[lang](fl)}' if fl else '')


def words(v, lang):
    if not v or lang == 'uk':
        return v
    return ' · '.join(WORDS[lang].get(x.strip(), None) or SystemExit(f'немає перекладу «{x}» ({lang}) у WORDS') for x in v.split(' · '))


def _rooms(t, lang):
    """Зони туру з назв кімнат: «Спальня 2» → спальня, «Хол, 2 поверх» → хол; «Точка N» не рахуємо."""
    seen = []
    for sc in t['scenes']:
        b = _split(sc['name'].strip())[0]
        if b and not re.match(r'(?i)точка\b', b):
            r = (b if lang == 'uk' else ROOMS[lang][b]).lower()
            if r not in seen:
                seen.append(r)
    return seen


def _info(t, a, related, lang):
    x, P = X[lang], pre(lang)
    n = len(t['scenes'])
    rooms = _rooms(t, lang)
    seen = (x['seen'](rooms, n) if rooms else x['seen0'](n)) + x['nav']
    ps = [seen] + list(a.get('p', [])) + ([HOW[lang][a['how']]] if a.get('how') else []) + ([a['tail']] if a.get('tail') else [])
    links = ([(a['case'], x['case'])] if a.get('case') else []) + [tuple(y) for y in a.get('links', [])] + \
        [(P + '/portfolio', x['portfolio']), (P + '/tury', x['all'])]
    rel = ''.join(f'<li><a href="{P}/tury/{r["slug"]}"><img src="{r["_thumb"]}" alt="{html.escape(r["_name"][lang])} — {x["frame"]}" loading="lazy" decoding="async" width="640" height="320">'
                  f'<span>{html.escape(r["_name"][lang])}</span></a></li>' for r in related)
    return ('\n<main class="ti" id="pro-tur">\n'
            f'<p class="ti-eye">{html.escape(a.get("eye") or words(t.get("kind"), lang) or x["eye"])}</p>\n'
            f'<h2>{x["about"]}</h2>\n<p class="ti-lead">{_md(a["lead"])}</p>\n'
            f'<details class="ti-more"><summary>{x["more"]}</summary>\n'
            + ''.join(f'<p>{_md(y)}</p>\n' for y in ps) +
            '</details>\n'
            f'<nav class="ti-links" aria-label="{x["rel_aria"]}">' + ''.join(f'<a href="{html.escape(u)}">{html.escape(l)}</a>' for u, l in links) + '</nav>\n'
            + (f'<h2 class="ti-h">{x["others"]}</h2>\n<ul class="ti-rel">{rel}</ul>\n' if rel else '') +
            f'<p class="ti-cta">{x["cta"]}'
            f'<a href="{x["contact"]}">{x["cta_a"]}</a> · <a href="tel:+380978667755">+380 97 866 77 55</a></p>\n'
            '</main>')


def _crumbs(items):
    """JSON-LD BreadcrumbList (для seo.py: на всіх внутрішніх сторінках)."""
    return json.dumps({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(items, 1)]},
        ensure_ascii=False).replace('</', '<\\/')


def _ver(rel):  # хеш файлу для ?v= — /assets кешується на рік (immutable)
    import hashlib
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]


def _alts(members):
    """hreflang для наявних мов (uk, ru, en … у порядку tools/site/i18n.py) + x-default = uk."""
    if len(members) < 2:
        return ''
    order = [l for l in ('uk', 'ru', 'en') if l in members]
    return ''.join(f'\n<link rel="alternate" hreflang="{l}" href="{SITE}{members[l]}">' for l in order) + \
        f'\n<link rel="alternate" hreflang="x-default" href="{SITE}{members["uk"]}">'


def _load_about(lang):
    f = ABOUT if lang == 'uk' else ROOT / f'tools/tours/about-{lang}.json'
    return {k: v for k, v in json.loads(f.read_text(encoding='utf-8')).items() if not k.startswith('_')} if f.exists() else {}


def _check_links(a, lang, slug):
    """Посилання в текстах en/ru — на сторінки цієї мови, що існують."""
    hrefs = re.findall(r'\]\((/[^)\s]*)\)', json.dumps(a, ensure_ascii=False)) + [u for u, _ in a.get('links', [])] + ([a['case']] if a.get('case') else [])
    for h in hrefs:
        p = h.split('#')[0]
        f = ROOT / (p.strip('/') + '.html' if p.strip('/') else 'index.html')
        if lang != 'uk' and not p.startswith(f'/{lang}/'):
            raise SystemExit(f'about-{lang}.json [{slug}]: посилання не на свою мову: {h}')
        if not f.exists() and not (p.startswith(pre(lang) + '/tury/')):
            raise SystemExit(f'about-{lang}.json [{slug}]: немає сторінки {h}')


def pages():
    about = {l: _load_about(l) for l in LANGS}
    tours = [json.loads(f.read_text(encoding='utf-8')) for f in sorted(DATA.glob('*.json'))]
    for t in tours:
        st = next(s for s in t['scenes'] if s['id'] == t['start'])
        t['_thumb'] = st['image'].replace('.jpg', '-thumb.jpg')
        t['_name'] = {'uk': t['title'], **{l: about[l][t['slug']]['name'] for l in LANGS[1:] if t['slug'] in about[l]}}
    opened = [t for t in tours if not t.get('hidden')]
    # мови сторінки туру: uk — усі; en/ru — відкриті тури з текстом мовою (приховані — лише uk, noindex)
    tl = {t['slug']: ['uk'] + [l for l in LANGS[1:] if not t.get('hidden') and t['slug'] in about['uk'] and t['slug'] in about[l]] for t in tours}
    hub = ['uk'] + [l for l in LANGS[1:] if any(l in tl[t['slug']] for t in opened)]
    cl = {'_': 'Генерує tools/tours/build.py pages: 3D-тури /tury мовами (руками не правити).',
          'tury': {l: pre(l) + '/tury' for l in hub}}
    for t in opened:
        if len(tl[t['slug']]) > 1:
            cl['tur-' + t['slug']] = {l: f'{pre(l)}/tury/{t["slug"]}' for l in tl[t['slug']]}
    new = json.dumps(cl, ensure_ascii=False, indent=1) + '\n'
    if not CL.exists() or CL.read_text(encoding='utf-8') != new:
        CL.write_text(new, encoding='utf-8')
    for lang in LANGS:
        if lang != 'uk':
            extra = set(about[lang]) - set(about['uk'])
            if extra:
                raise SystemExit(f'about-{lang}.json: тури без uk-тексту: {", ".join(sorted(extra))}')
            for slug, a in about[lang].items():
                _check_links(a, lang, slug)
        _pages_lang(lang, tours, about, tl, hub, cl)
    paths = ([pre(l) + '/tury' for l in hub] if opened else []) + [f'{pre(l)}/tury/{t["slug"]}' for t in opened for l in tl[t['slug']]]
    sitemap(paths)
    pf = ROOT / 'tools/site/pages/uk-portfolio.json'  # блок «3D-тури 360°» у /portfolio — посилання на кожен відкритий тур
    if pf.exists():
        miss = [t['slug'] for t in opened if f'"/tury/{t["slug"]}"' not in pf.read_text(encoding='utf-8')]
        if miss:
            print('Увага: тури без посилання в /portfolio (rel «3D-тури 360°» у tools/site/pages/uk-portfolio.json):', ', '.join(miss))
    nabout = [t['slug'] for t in opened if t['slug'] not in about['uk']]
    if nabout:
        print('Увага: відкриті тури без тексту в tools/tours/about.json:', ', '.join(nabout))
    for l in LANGS[1:]:
        nl = [t['slug'] for t in opened if t['slug'] in about['uk'] and t['slug'] not in about[l]]
        if nl:
            print(f'Увага: відкриті тури без перекладу в tools/tours/about-{l}.json (лише uk):', ', '.join(nl))
    print('Сторінки: ' + ', '.join(f'{l} — /tury + {sum(l in tl[t["slug"]] for t in opened)}' for l in hub) + ' турів')


def _pages_lang(lang, tours, about, tl, hub, cl):
    x, P = X[lang], pre(lang)
    base = P + '/tury'
    out = ROOT / (lang + '/tury' if lang != 'uk' else 'tury')
    out.mkdir(parents=True, exist_ok=True)
    cards = []
    for t in tours:
        if lang not in tl[t['slug']]:
            continue
        a = about[lang].get(t['slug']) if not t.get('hidden') else None
        if a and lang != 'uk':  # група, порядок, «навіщо 360°» і сторінка проєкту — з uk
            ua = about['uk'][t['slug']]
            a = dict(a, group=ua.get('group'), how=ua.get('how'), **({'case': P + ua['case']} if ua.get('case') else {}))
        thumb = t['_thumb']
        name = t['_name'][lang]
        info, related = '', []
        if a:  # «Інші тури»: наступні 3 відкриті тури тієї ж групи за order (по колу) — у кожного туру ≥ 3 вхідних посилання
            grp = sorted((y for y in tours if not y.get('hidden') and lang in tl[y['slug']] and (about['uk'].get(y['slug']) or {}).get('group') == a.get('group')),
                         key=lambda y: (y.get('order', 99), y['slug']))
            i = [y['slug'] for y in grp].index(t['slug'])
            related = [grp[(i + k) % len(grp)] for k in range(1, min(4, len(grp)))]
            info = _info(t, a, related, lang)
        d = (a or {}).get('description') or t.get('description') or f"Віртуальний 3D-тур «{t['title']}» від CAS Development."
        for tail in (' Тур 360° від CAS Development: телефон, ноутбук або VR-окуляри.', ' Тур 360° від CAS Development.'):
            if not a and len(d) < 70 and len(d + tail) <= 160:
                d += tail
        desc = html.escape(d)
        ttag = html.escape((a or {}).get('title') or next(c for c in (f"{t['title']} — 3D-тур | CAS Development", f"{t['title']} | CAS Development",
                                             f"{t['title']} — 3D-тур", t['title']) if len(c) <= 60 or c == t['title']))
        crumbs = _crumbs([(x['home'], P + '/'), (x['tours'], base), (name, f"{base}/{t['slug']}")])
        td = {k: v for k, v in t.items() if not k.startswith('_')}
        if lang != 'uk':
            td = dict(td, title=name, description=(a or {}).get('description', ''), kind=words(t.get('kind'), lang), place=words(t.get('place'), lang),
                      scenes=[dict(sc, name=room_name(sc['name'], lang)) for sc in t['scenes']])
            td = {k: v for k, v in td.items() if v is not None}
        data = json.dumps(td, ensure_ascii=False).replace('</', '<\\/')
        members = cl.get('tur-' + t['slug'], {})
        (out / f"{t['slug']}.html").write_text(VIEW.format(vcss=_ver("assets/tours/tour.v1.css"), vjs=_ver("assets/tours/tour.v1.js"), title=html.escape(name), ttag=ttag, info=info,
                                                            ogt=html.escape(re.sub(r'\s*\|\s*CAS( Development)?$', '', (a or {}).get('title') or '') + ' | CAS Development' if a else f"{t['title']} — 3D-тур CAS Development"), crumbs=crumbs, desc=desc, site=SITE,
                                                            slug=t['slug'], thumb=thumb, data=data, lang=lang, base=base, x=x, alts=_alts(members),
                                                            robots='\n<meta name="robots" content="noindex">' if t.get('hidden') else ''), encoding='utf-8')
        if not t.get('hidden'):
            meta = ' · '.join(y for y in (words(t.get('kind'), lang), words(t.get('place'), lang), x['card_n'](len(t['scenes']))) if y)
            cards.append((t.get('order', 99), f'<a class="tl-card" href="{base}/{t["slug"]}" style="--pano:url({thumb})">'
                         f'<span class="tl-img"><img src="{thumb}" alt="{html.escape(name)} — {x["card_alt"]}" loading="lazy" width="640" height="320"></span>'
                         f'<span class="tl-badge">360°</span><span class="tl-body"><span class="tl-meta">{html.escape(meta)}</span>'
                         f'<span class="tl-name">{html.escape(name)}</span><span class="tl-go">{x["card_go"]}</span></span></a>', thumb))
    if lang not in hub:
        return
    cards.sort(key=lambda c: c[0])
    og = cards[0][2] if cards else '/img/og/default.jpg'
    cards = [c[1] for c in cards]
    idx = INDEX.format(vcss=_ver("assets/tours/tour.v1.css"), site=SITE, og=og, crumbs=_crumbs([(x['home'], P + '/'), (x['tours'], base)]),
                       cards='\n'.join(cards) or f'<p class="tl-lead">{x["i_empty"]}</p>', lang=lang, base=base, x=x,
                       alts=_alts(cl['tury']).lstrip('\n') + ('\n' if len(cl['tury']) > 1 else ''))
    if not cards:  # поки немає відкритих турів — сторінка-заглушка не індексується
        idx = idx.replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1)
    rel = (lang + '/' if lang != 'uk' else '') + 'tury.html'
    try:  # єдина шапка/футер сайту (tools/site/chrome.py)
        sys.path.insert(0, str(ROOT / 'tools/site')); import chrome
        idx = chrome.apply(idx, rel)
    except Exception as e:
        print('chrome.apply пропущено:', e)
    (ROOT / rel).write_text(idx, encoding='utf-8')


def sitemap(paths):
    """sitemap.xml: /tury, /en/tury, /ru/tury і відкриті тури — додати, приховані (noindex) — прибрати."""
    sm = ROOT / 'sitemap.xml'; s = sm.read_text(encoding='utf-8')
    want = {SITE + p for p in paths}
    n = re.sub(r'  <url><loc>' + re.escape(SITE) + r'(?:/(?:en|ru))?/tury(?:/[a-z0-9-]+)?</loc>.*?</url>\n',
               lambda m: m.group(0) if re.search(r'<loc>([^<]+)</loc>', m.group(0)).group(1) in want else '', s)
    day = __import__('datetime').date.today().isoformat()
    add = ''.join(f'  <url><loc>{u}</loc><lastmod>{day}</lastmod></url>\n' for u in sorted(want) if f'<loc>{u}</loc>' not in n)
    n = n.replace('</urlset>', add + '</urlset>')
    if n != s:
        sm.write_text(n, encoding='utf-8')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('new', 'pages'):
        raise SystemExit(__doc__)
    if a[0] == 'pages':
        pages()
    else:
        opt = lambda k, d='': a[a.index(k) + 1] if k in a else d
        new(a[1], a[2], a[3], opt('--desc'), int(opt('--max', 0)))
