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
<html {hattr}><head><meta charset="utf-8">
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
<html {hattr}><head><meta charset="utf-8">
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
<div class="tl-btns"><a class="tl-btn" href="{x[contact]}#zayavka">{x[i_cta_a]}</a><a class="tl-btn ghost" href="tel:+380978667755">{x[call]}</a></div>
</section>
</main>
</body></html>
'''


# ── текст під переглядачем (tools/tours/about.json; en/ru — about-<мова>.json): що за обʼєкт, що видно, статус, навіщо 360°, посилання ──
ABOUT = ROOT / 'tools/tours/about.json'
LANGS = ('uk', 'en', 'ru', 'es', 'pl', 'de', 'fr', 'pt', 'zh', 'ar')  # uk — основна; інші — лише відкриті тури з текстом в about-<мова>.json (/<мова>/tury/<slug>; ar — RTL)
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
    'es': {
    'A': 'Para qué sirve un tour 360°: un proyecto de diseño se puede recorrer antes de la reforma y ver cómo una estancia da paso a otra. '
         'La distribución, los colores y los muebles se acuerdan más fácilmente sobre el modelo: los cambios se hacen en el proyecto, no en la obra. '
         'El modelo se construye con las medidas reales: nuestro especialista hace un escaneo 3D del espacio.',
    'B': 'Un tour 360° muestra el proyecto tal como lo verán sus dueños: a la altura de los ojos y con las proporciones reales de las estancias. '
         'En la fase de proyecto es fácil comprobar hacia dónde dan las ventanas, cómo queda el mobiliario y si hay suficiente luz, y cambiarlo antes de empezar las obras. '
         'Las medidas del modelo salen de un escaneo 3D que hace nuestro especialista.',
    'C': 'Un concepto marca la dirección: materiales, luz, el ambiente de las estancias. Recorrerlo en 360° es más fácil que mirar renders sueltos: '
         'enseguida se ve qué gusta y qué conviene cambiar en el proyecto de diseño completo.',
    'D': 'Un concepto en 360° es una forma de elegir el estilo antes de empezar el proyecto detallado: '
         'se ven las estancias enteras y no imágenes sueltas, así que comparar opciones y decidir resulta más sencillo.'},
    'pl': {
    'A': 'Po co spacer 360°: projekt wnętrza można obejść jeszcze przed remontem i zobaczyć, jak pomieszczenia przechodzą jedno w drugie. '
         'Układ, kolory i meble łatwiej uzgodnić na modelu — poprawki wprowadzamy w projekcie, a nie na budowie. '
         'Model powstaje według rzeczywistych wymiarów: nasz specjalista wykonuje skan 3D pomieszczenia.',
    'B': 'Spacer 360° pokazuje projekt tak, jak zobaczą go właściciele: z wysokości oczu i z rzeczywistymi proporcjami pomieszczeń. '
         'Na etapie projektu łatwo sprawdzić, na co wychodzą okna, jak stoją meble i czy wystarcza światła — i zmienić to przed rozpoczęciem prac. '
         'Wymiary do modelu pochodzą ze skanu 3D, który wykonuje nasz specjalista.',
    'C': 'Koncepcja wyznacza kierunek: materiały, światło, nastrój pomieszczeń. Obejść ją w 360° jest łatwiej niż oglądać pojedyncze wizualizacje: '
         'od razu widać, co się podoba, a co warto zmienić w pełnym projekcie wnętrza.',
    'D': 'Koncepcja w 360° to sposób na wybór stylu, zanim zacznie się szczegółowy projekt: '
         'pomieszczenia widać w całości, a nie na pojedynczych kadrach, więc łatwiej porównać warianty i podjąć decyzję.'},
    'de': {
    'A': 'Wozu ein 360°-Rundgang: Ein Designprojekt lässt sich schon vor der Renovierung begehen, und man sieht, wie die Räume ineinander übergehen. '
         'Grundriss, Farben und Möbel lassen sich am Modell leichter abstimmen — Änderungen fließen ins Projekt ein, nicht erst auf der Baustelle. '
         'Das Modell entsteht nach realen Maßen: Unser Fachmann erstellt einen 3D-Scan der Räume.',
    'B': 'Ein 360°-Rundgang zeigt das Projekt so, wie die Eigentümer es sehen werden: auf Augenhöhe und mit den echten Proportionen der Räume. '
         'In der Projektphase lässt sich leicht prüfen, wohin die Fenster zeigen, wie die Möbel stehen und ob genug Licht da ist — und das vor Beginn der Arbeiten ändern. '
         'Die Maße für das Modell liefert ein 3D-Scan, den unser Fachmann erstellt.',
    'C': 'Ein Konzept gibt die Richtung vor: Materialien, Licht, die Stimmung der Räume. Es in 360° zu begehen ist einfacher, als einzelne Renderings zu betrachten: '
         'Man erkennt sofort, was gefällt und was im vollständigen Designprojekt geändert werden sollte.',
    'D': 'Ein Konzept in 360° hilft, den Stil zu wählen, bevor das detaillierte Projekt beginnt: '
         'Man sieht ganze Räume statt einzelner Bilder, deshalb fallen der Vergleich der Varianten und die Entscheidung leichter.'},
    'fr': {
    'A': 'Pourquoi une visite à 360° : on peut parcourir un projet de design avant la rénovation et voir comment les pièces s’enchaînent. '
         'Plan, couleurs et mobilier se valident plus facilement sur la maquette : les modifications se font dans le projet, pas sur le chantier. '
         'La maquette est construite aux dimensions réelles : notre spécialiste réalise un relevé 3D des lieux.',
    'B': 'Une visite à 360° montre le projet tel que les propriétaires le verront : à hauteur des yeux et avec les vraies proportions des pièces. '
         'Au stade du projet, il est simple de vérifier l’orientation des fenêtres, la place des meubles et la lumière disponible, et de corriger avant le début des travaux. '
         'Les dimensions de la maquette viennent d’un relevé 3D réalisé par notre spécialiste.',
    'C': 'Un concept donne la direction : matériaux, lumière, ambiance des pièces. Le parcourir à 360° est plus simple que de regarder des rendus séparés : '
         'on voit tout de suite ce qui plaît et ce qu’il vaut mieux changer dans le projet de design complet.',
    'D': 'Un concept à 360° permet de choisir un style avant le début du projet détaillé : '
         'on voit les pièces en entier et non image par image, il est donc plus facile de comparer les options et de décider.'},
    'pt': {
    'A': 'Para que serve uma visita 360°: um projeto de design pode ser percorrido antes da remodelação, para ver como uma divisão dá lugar à outra. '
         'A planta, as cores e os móveis acordam-se mais facilmente sobre o modelo: as alterações fazem-se no projeto, não na obra. '
         'O modelo é construído com as medidas reais: o nosso especialista faz um levantamento 3D do espaço com scanner.',
    'B': 'Uma visita 360° mostra o projeto tal como os donos o vão ver: à altura dos olhos e com as proporções reais das divisões. '
         'Na fase de projeto é fácil verificar para onde dão as janelas, como fica o mobiliário e se há luz suficiente — e mudá-lo antes de começar as obras. '
         'As medidas do modelo vêm de um levantamento 3D feito pelo nosso especialista.',
    'C': 'Um conceito define a direção: materiais, luz, o ambiente das divisões. Percorrê-lo em 360° é mais fácil do que olhar para renders soltos: '
         'percebe-se logo o que agrada e o que vale a pena mudar no projeto de design completo.',
    'D': 'Um conceito em 360° é uma forma de escolher o estilo antes de começar o projeto detalhado: '
         'veem-se as divisões inteiras e não imagens soltas, por isso comparar opções e decidir torna-se mais simples.'},
    'zh': {
    'A': '为什么要做 360° 漫游：装修开始之前，就能在设计方案里走一圈，看清各个房间如何衔接。'
         '布局、配色和家具在模型上更容易确定——修改落在方案里，而不是施工现场。'
         '模型按真实尺寸建立：由我们的专业人员对空间进行 3D 扫描测量。',
    'B': '360° 漫游让方案以业主将来看到的样子呈现：人眼高度，房间的真实比例。'
         '在方案阶段就能方便地检查窗户朝向、家具摆放和采光是否充足，并在开工前调整。'
         '模型尺寸来自我们专业人员完成的 3D 扫描测量。',
    'C': '概念方案确定方向：材料、光线和房间氛围。以 360° 方式浏览比看单张效果图更直观：'
         '立刻就能知道哪些满意、哪些需要在完整设计方案中调整。',
    'D': '360° 概念方案帮助在详细设计开始前选定风格：'
         '看到的是完整的房间而不是单张画面，比较方案、做出决定都更容易。'},
    'ar': {
    'A': 'لماذا جولة 360°: يمكن التجول في مشروع التصميم قبل بدء التشطيب ورؤية كيف تتصل الغرف ببعضها. '
         'يسهل الاتفاق على المخطط والألوان والأثاث على النموذج، فالتعديلات تُجرى في المشروع لا في الموقع. '
         'نبني النموذج وفق الأبعاد الحقيقية: يجري أخصائينا مسحًا ثلاثي الأبعاد للمكان.',
    'B': 'تعرض جولة 360° المشروع كما سيراه أصحابه: من مستوى النظر وبالنسب الحقيقية للغرف. '
         'في مرحلة التصميم يسهل التحقق من اتجاه النوافذ وتوزيع الأثاث وكفاية الإضاءة، وتعديل ذلك قبل بدء الأعمال. '
         'تأتي أبعاد النموذج من مسح ثلاثي الأبعاد يجريه أخصائينا.',
    'C': 'يحدد المفهوم الاتجاه: المواد والإضاءة وأجواء الغرف. التجول فيه بزاوية 360° أسهل من مشاهدة صور منفصلة: '
         'يتضح فورًا ما يعجبك وما يستحق التغيير في مشروع التصميم الكامل.',
    'D': 'المفهوم بزاوية 360° وسيلة لاختيار الطراز قبل بدء المشروع التفصيلي: '
         'ترى الغرف كاملة لا لقطات منفصلة، فتصبح المقارنة بين الخيارات واتخاذ القرار أسهل.'},
}
# назви кімнат (uk у JSON туру → мова): «Спальня 2», «Хол, 2 поверх», «Точка 5» — основа + номер
ROOMS = {
    'en': {'Спальня': 'Bedroom', 'Вітальня': 'Living room', 'Кухня': 'Kitchen', 'Передпокій': 'Entrance hall', 'Ванна': 'Bathroom', 'Хол': 'Hall',
           'Їдальня': 'Dining room', 'Гардеробна': 'Walk-in wardrobe', 'Тераса': 'Terrace', 'Коридор': 'Corridor', 'Дитяча': 'Nursery', 'Лазня': 'Bathhouse',
           'Пральня': 'Laundry', 'Гостьова спальня': 'Guest bedroom', 'Душова': 'Shower room', 'Точка': 'Viewpoint'},
    'ru': {'Спальня': 'Спальня', 'Вітальня': 'Гостиная', 'Кухня': 'Кухня', 'Передпокій': 'Прихожая', 'Ванна': 'Ванная', 'Хол': 'Холл',
           'Їдальня': 'Столовая', 'Гардеробна': 'Гардеробная', 'Тераса': 'Терраса', 'Коридор': 'Коридор', 'Дитяча': 'Детская', 'Лазня': 'Баня',
           'Пральня': 'Прачечная', 'Гостьова спальня': 'Гостевая спальня', 'Душова': 'Душевая', 'Точка': 'Точка'},
    'es': {'Спальня': 'Dormitorio', 'Вітальня': 'Salón', 'Кухня': 'Cocina', 'Передпокій': 'Recibidor', 'Ванна': 'Baño', 'Хол': 'Vestíbulo',
           'Їдальня': 'Comedor', 'Гардеробна': 'Vestidor', 'Тераса': 'Terraza', 'Коридор': 'Pasillo', 'Дитяча': 'Habitación infantil', 'Лазня': 'Sauna',
           'Пральня': 'Lavadero', 'Гостьова спальня': 'Dormitorio de invitados', 'Душова': 'Cuarto de ducha', 'Точка': 'Punto'},
    'pl': {'Спальня': 'Sypialnia', 'Вітальня': 'Salon', 'Кухня': 'Kuchnia', 'Передпокій': 'Przedpokój', 'Ванна': 'Łazienka', 'Хол': 'Hol',
           'Їдальня': 'Jadalnia', 'Гардеробна': 'Garderoba', 'Тераса': 'Taras', 'Коридор': 'Korytarz', 'Дитяча': 'Pokój dziecięcy', 'Лазня': 'Sauna',
           'Пральня': 'Pralnia', 'Гостьова спальня': 'Sypialnia dla gości', 'Душова': 'Łazienka z prysznicem', 'Точка': 'Punkt'},
    'de': {'Спальня': 'Schlafzimmer', 'Вітальня': 'Wohnzimmer', 'Кухня': 'Küche', 'Передпокій': 'Diele', 'Ванна': 'Bad', 'Хол': 'Halle',
           'Їдальня': 'Esszimmer', 'Гардеробна': 'Ankleide', 'Тераса': 'Terrasse', 'Коридор': 'Flur', 'Дитяча': 'Kinderzimmer', 'Лазня': 'Sauna',
           'Пральня': 'Waschküche', 'Гостьова спальня': 'Gästezimmer', 'Душова': 'Duschbad', 'Точка': 'Punkt'},
    'fr': {'Спальня': 'Chambre', 'Вітальня': 'Salon', 'Кухня': 'Cuisine', 'Передпокій': 'Entrée', 'Ванна': 'Salle de bains', 'Хол': 'Hall',
           'Їдальня': 'Salle à manger', 'Гардеробна': 'Dressing', 'Тераса': 'Terrasse', 'Коридор': 'Couloir', 'Дитяча': 'Chambre d’enfant', 'Лазня': 'Sauna',
           'Пральня': 'Buanderie', 'Гостьова спальня': 'Chambre d’amis', 'Душова': 'Salle de douche', 'Точка': 'Point'},
    'pt': {'Спальня': 'Quarto', 'Вітальня': 'Sala de estar', 'Кухня': 'Cozinha', 'Передпокій': 'Entrada', 'Ванна': 'Casa de banho', 'Хол': 'Átrio',
           'Їдальня': 'Sala de jantar', 'Гардеробна': 'Closet', 'Тераса': 'Terraço', 'Коридор': 'Corredor', 'Дитяча': 'Quarto de criança', 'Лазня': 'Sauna',
           'Пральня': 'Lavandaria', 'Гостьова спальня': 'Quarto de hóspedes', 'Душова': 'Casa de banho com duche', 'Точка': 'Ponto'},
    'zh': {'Спальня': '卧室', 'Вітальня': '客厅', 'Кухня': '厨房', 'Передпокій': '玄关', 'Ванна': '卫生间', 'Хол': '大厅',
           'Їдальня': '餐厅', 'Гардеробна': '衣帽间', 'Тераса': '露台', 'Коридор': '走廊', 'Дитяча': '儿童房', 'Лазня': '桑拿房',
           'Пральня': '洗衣房', 'Гостьова спальня': '客卧', 'Душова': '淋浴间', 'Точка': '观景点'},
    'ar': {'Спальня': 'غرفة النوم', 'Вітальня': 'غرفة المعيشة', 'Кухня': 'المطبخ', 'Передпокій': 'المدخل', 'Ванна': 'الحمّام', 'Хол': 'الردهة',
           'Їдальня': 'غرفة الطعام', 'Гардеробна': 'غرفة الملابس', 'Тераса': 'التراس', 'Коридор': 'الممر', 'Дитяча': 'غرفة الأطفال', 'Лазня': 'الساونا',
           'Пральня': 'غرفة الغسيل', 'Гостьова спальня': 'غرفة نوم الضيوف', 'Душова': 'غرفة الاستحمام', 'Точка': 'نقطة'},
}
FLOOR = {'en': lambda n: f'{n}{"st" if n == 1 else "nd" if n == 2 else "rd" if n == 3 else "th"} floor', 'ru': lambda n: f'{n} этаж',
         # «2 поверх» = другий рівень від землі; pl/de/fr/es/ar рахують поверхи інакше (партер/1. Etage), тому — «рівень N»
         'es': lambda n: f'nivel {n}', 'pl': lambda n: f'poziom {n}', 'de': lambda n: f'Ebene {n}', 'fr': lambda n: f'niveau {n}', 'pt': lambda n: f'nível {n}',
         'zh': lambda n: f'{n}层', 'ar': lambda n: f'المستوى {n}'}
SEP = {'zh': '，', 'ar': '، '}  # кома між назвою кімнати й рівнем
WORDS = {  # kind / place з JSON туру
    'en': {'Дизайн-проєкт': 'Design project', '360-візуалізація': '360 visualisation', 'Концепт': 'Concept', 'Квартира': 'Apartment', 'Київ': 'Kyiv', 'Карпати': 'Carpathians'},
    'ru': {'Дизайн-проєкт': 'Дизайн-проект', '360-візуалізація': '360-визуализация', 'Концепт': 'Концепт', 'Квартира': 'Квартира', 'Київ': 'Киев', 'Карпати': 'Карпаты'},
    'es': {'Дизайн-проєкт': 'Proyecto de diseño', '360-візуалізація': 'Visualización 360', 'Концепт': 'Concepto', 'Квартира': 'Piso', 'Київ': 'Kiev', 'Карпати': 'Cárpatos'},
    'pl': {'Дизайн-проєкт': 'Projekt wnętrza', '360-візуалізація': 'Wizualizacja 360', 'Концепт': 'Koncepcja', 'Квартира': 'Mieszkanie', 'Київ': 'Kijów', 'Карпати': 'Karpaty'},
    'de': {'Дизайн-проєкт': 'Designprojekt', '360-візуалізація': '360-Visualisierung', 'Концепт': 'Konzept', 'Квартира': 'Wohnung', 'Київ': 'Kyjiw', 'Карпати': 'Karpaten'},
    'fr': {'Дизайн-проєкт': 'Projet de design', '360-візуалізація': 'Visualisation 360', 'Концепт': 'Concept', 'Квартира': 'Appartement', 'Київ': 'Kyiv', 'Карпати': 'Carpates'},
    'pt': {'Дизайн-проєкт': 'Projeto de design', '360-візуалізація': 'Visualização 360', 'Концепт': 'Conceito', 'Квартира': 'Apartamento', 'Київ': 'Kyiv', 'Карпати': 'Cárpatos'},
    'zh': {'Дизайн-проєкт': '设计方案', '360-візуалізація': '360 效果图', 'Концепт': '概念方案', 'Квартира': '公寓', 'Київ': '基辅', 'Карпати': '喀尔巴阡山'},
    'ar': {'Дизайн-проєкт': 'مشروع تصميم', '360-візуалізація': 'تصور 360', 'Концепт': 'مفهوم', 'Квартира': 'شقة', 'Київ': 'كييف', 'Карпати': 'جبال الكاربات'},
}


def _pl_slav(n, one, few, many):
    return one if n % 10 == 1 and n % 100 != 11 else few if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else many


def _pl_pl(n, one, few, many):  # польська: 1 — one, 2–4 (крім 12–14) — few, решта (і 21, 31…) — many
    return one if n == 1 else few if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else many


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
    'es': dict(rooms='Estancias', rooms_nav='Estancias del tour', prev='Estancia anterior', next='Estancia siguiente', zoom='Zoom', zin='Acercar', zout='Alejar',
               hint='Arrastre para mirar alrededor · rueda o dos dedos para el zoom · flechas para pasar de estancia',
               home='Inicio', tours='Tours 3D', eye='Tour 3D 360°', about='Sobre el tour', more='Más sobre el inmueble y el tour', rel_aria='Páginas relacionadas',
               case='Página del proyecto', portfolio='Portfolio', all='Todos los tours 3D', others='Otros tours', frame='imagen del tour 3D', contact='/es/contacto',
               cta='¿Quiere un tour 3D de su inmueble o un proyecto de diseño que se pueda recorrer así? ', cta_a='Enviar solicitud',
               seen=lambda rooms, n: f'En el tour: {", ".join(rooms)} — {n} {"punto de vista" if n == 1 else "puntos de vista"}. ',
               seen0=lambda n: f'El tour tiene {n} {"punto de vista" if n == 1 else "puntos de vista"}. ',
               nav='Cambie de estancia con las flechas de la foto, los botones ‹ › o el menú «Estancias»; con gafas de RV, use el botón VR.',
               card_n=lambda n: f'{n} puntos', card_go='Abrir el tour →', card_alt='tour 3D 360°',
               i_title='Tours 3D de nuestros proyectos — recorridos virtuales | CAS',
               i_desc='Tours 3D de CAS Development: interiores terminados y visualizaciones 360 de proyectos de diseño. Véalos en el móvil, el portátil o con gafas de RV.',
               i_ogt='Tours 3D de nuestros proyectos — CAS Development', i_eye='Portfolio · 360°', i_h1='Recorra nuestros <em>proyectos</em>',
               i_lead='Tours 360° de interiores terminados y visualizaciones 360 de nuestros proyectos de diseño y conceptos: el tipo de cada tour figura en su tarjeta. Abra un tour y pase de una estancia a otra con las flechas de la foto, como si estuviera dentro.',
               i_how='<li><b>Móvil</b><span>Gire el móvil o deslice el dedo</span></li>\n<li><b>Portátil</b><span>Arrastre con el ratón; clic en una flecha para pasar a la siguiente estancia</span></li>\n<li><b>Gafas de RV</b><span>Pulse VR en el tour y estará dentro</span></li>',
               i_cta_h='¿Quiere un tour 3D de <em>su</em> inmueble?', i_cta_p='Lo fotografiamos en 360° y montamos un tour para venta, alquiler o portfolio, o creamos un proyecto de diseño que se podrá recorrer de la misma forma.',
               i_cta_a='Enviar solicitud', i_empty='Los tours llegarán pronto.'),
    'pl': dict(rooms='Pomieszczenia', rooms_nav='Pomieszczenia spaceru', prev='Poprzednie pomieszczenie', next='Następne pomieszczenie', zoom='Powiększenie', zin='Przybliż', zout='Oddal',
               hint='Przeciągnij, aby się rozejrzeć · kółko myszy lub dwa palce — powiększenie · strzałki — przejście',
               home='Strona główna', tours='Spacery 3D', eye='Spacer 3D 360°', about='O spacerze', more='Więcej o obiekcie i spacerze', rel_aria='Powiązane strony',
               case='Strona projektu', portfolio='Portfolio', all='Wszystkie spacery 3D', others='Inne spacery', frame='kadr spaceru 3D', contact='/pl/kontakt',
               cta='Chcesz spacer 3D po swoim obiekcie albo projekt wnętrza, który można tak samo obejść? ', cta_a='Wyślij zapytanie',
               seen=lambda rooms, n: f'W spacerze: {", ".join(rooms)} — {n} {_pl_pl(n, "punkt widokowy", "punkty widokowe", "punktów widokowych")}. ',
               seen0=lambda n: f'Spacer ma {n} {_pl_pl(n, "punkt widokowy", "punkty widokowe", "punktów widokowych")}. ',
               nav='Przełączaj się strzałkami na zdjęciu, przyciskami ‹ › lub przez menu „Pomieszczenia”; w goglach VR — przyciskiem VR.',
               card_n=lambda n: f'{n} pkt', card_go='Otwórz spacer →', card_alt='spacer 3D 360°',
               i_title='Spacery 3D po naszych projektach — wirtualne wizyty | CAS',
               i_desc='Spacery 3D CAS Development: zrealizowane wnętrza i wizualizacje 360 projektów wnętrz. Oglądaj na telefonie, laptopie lub w goglach VR.',
               i_ogt='Spacery 3D po naszych projektach — CAS Development', i_eye='Portfolio · 360°', i_h1='Przejdź się po naszych <em>projektach</em>',
               i_lead='Spacery 360° po zrealizowanych wnętrzach i wizualizacje 360 naszych projektów i koncepcji — typ każdego spaceru jest podpisany na karcie. Otwórz spacer i przechodź między pomieszczeniami strzałkami na zdjęciu, jakbyś był w środku.',
               i_how='<li><b>Telefon</b><span>Obracaj telefon lub przesuwaj palcem</span></li>\n<li><b>Laptop</b><span>Przeciągaj myszą, kliknij strzałkę — następne pomieszczenie</span></li>\n<li><b>Gogle VR</b><span>Przycisk VR w spacerze — i jesteś w środku</span></li>',
               i_cta_h='Chcesz spacer 3D po <em>swoim</em> obiekcie?', i_cta_p='Wykonamy zdjęcia 360° i złożymy spacer do sprzedaży, wynajmu lub portfolio — albo przygotujemy projekt wnętrza, który będzie można tak samo obejść.',
               i_cta_a='Wyślij zapytanie', i_empty='Spacery wkrótce się pojawią.'),
    'de': dict(rooms='Räume', rooms_nav='Räume des Rundgangs', prev='Vorheriger Raum', next='Nächster Raum', zoom='Zoom', zin='Vergrößern', zout='Verkleinern',
               hint='Ziehen zum Umsehen · Mausrad oder zwei Finger zum Zoomen · Pfeile zum Raumwechsel',
               home='Startseite', tours='3D-Rundgänge', eye='3D-Rundgang 360°', about='Über den Rundgang', more='Mehr über das Objekt und den Rundgang', rel_aria='Verwandte Seiten',
               case='Projektseite', portfolio='Portfolio', all='Alle 3D-Rundgänge', others='Weitere Rundgänge', frame='Bild aus dem 3D-Rundgang', contact='/de/kontakt',
               cta='Sie möchten einen 3D-Rundgang durch Ihr Objekt oder ein Designprojekt, das man genauso begehen kann? ', cta_a='Anfrage senden',
               seen=lambda rooms, n: f'Im Rundgang: {", ".join(rooms)} — {n} {"Standpunkt" if n == 1 else "Standpunkte"}. ',
               seen0=lambda n: f'Der Rundgang hat {n} {"Standpunkt" if n == 1 else "Standpunkte"}. ',
               nav='Wechseln Sie mit den Pfeilen im Bild, den Tasten ‹ › oder über das Menü „Räume“; mit einer VR-Brille über die VR-Taste.',
               card_n=lambda n: f'{n} Pkt.', card_go='Rundgang öffnen →', card_alt='3D-Rundgang 360°',
               i_title='3D-Rundgänge durch unsere Projekte | CAS Development',
               i_desc='3D-Rundgänge von CAS Development: fertige Interieurs und 360-Visualisierungen von Designprojekten. Auf Smartphone, Laptop oder mit VR-Brille ansehen.',
               i_ogt='3D-Rundgänge durch unsere Projekte — CAS Development', i_eye='Portfolio · 360°', i_h1='Gehen Sie durch unsere <em>Projekte</em>',
               i_lead='360°-Rundgänge durch fertige Interieurs und 360-Visualisierungen unserer Designprojekte und Konzepte — die Art jedes Rundgangs steht auf seiner Karte. Öffnen Sie einen Rundgang und wechseln Sie mit den Pfeilen im Bild von Raum zu Raum, als wären Sie vor Ort.',
               i_how='<li><b>Smartphone</b><span>Smartphone drehen oder mit dem Finger wischen</span></li>\n<li><b>Laptop</b><span>Mit der Maus ziehen, Klick auf einen Pfeil — nächster Raum</span></li>\n<li><b>VR-Brille</b><span>VR-Taste im Rundgang drücken — und Sie sind im Objekt</span></li>',
               i_cta_h='Ein 3D-Rundgang durch <em>Ihr</em> Objekt?', i_cta_p='Wir fotografieren in 360° und erstellen einen Rundgang für Verkauf, Vermietung oder Portfolio — oder ein Designprojekt, das sich genauso begehen lässt.',
               i_cta_a='Anfrage senden', i_empty='Rundgänge folgen in Kürze.'),
    'fr': dict(rooms='Pièces', rooms_nav='Pièces de la visite', prev='Pièce précédente', next='Pièce suivante', zoom='Zoom', zin='Zoom avant', zout='Zoom arrière',
               hint='Faites glisser pour regarder autour · molette ou deux doigts pour zoomer · flèches pour changer de pièce',
               home='Accueil', tours='Visites 3D', eye='Visite 3D à 360°', about='À propos de la visite', more='En savoir plus sur le bien et la visite', rel_aria='Pages associées',
               case='Page du projet', portfolio='Portfolio', all='Toutes les visites 3D', others='Autres visites', frame='vue de la visite 3D', contact='/fr/contact',
               cta='Vous souhaitez une visite 3D de votre bien ou un projet de design que l’on peut parcourir de la même façon ? ', cta_a='Envoyer une demande',
               seen=lambda rooms, n: f'Dans la visite : {", ".join(rooms)} — {n} {"point de vue" if n == 1 else "points de vue"}. ',
               seen0=lambda n: f'La visite compte {n} {"point de vue" if n == 1 else "points de vue"}. ',
               nav='Passez d’une pièce à l’autre avec les flèches sur la photo, les boutons ‹ › ou le menu « Pièces » ; avec un casque VR, utilisez le bouton VR.',
               card_n=lambda n: f'{n} pts', card_go='Ouvrir la visite →', card_alt='visite 3D à 360°',
               i_title='Visites 3D de nos projets — visites virtuelles | CAS',
               i_desc='Visites 3D de CAS Development : intérieurs réalisés et visualisations 360 de projets de design. Sur téléphone, ordinateur portable ou casque VR.',
               i_ogt='Visites 3D de nos projets — CAS Development', i_eye='Portfolio · 360°', i_h1='Parcourez nos <em>projets</em>',
               i_lead='Visites à 360° d’intérieurs réalisés et visualisations 360 de nos projets de design et concepts — le type de chaque visite est indiqué sur sa carte. Ouvrez une visite et passez d’une pièce à l’autre avec les flèches sur la photo, comme si vous y étiez.',
               i_how='<li><b>Téléphone</b><span>Tournez le téléphone ou glissez du doigt</span></li>\n<li><b>Ordinateur</b><span>Faites glisser à la souris, cliquez sur une flèche pour la pièce suivante</span></li>\n<li><b>Casque VR</b><span>Bouton VR dans la visite — et vous êtes à l’intérieur</span></li>',
               i_cta_h='Une visite 3D de <em>votre</em> bien ?', i_cta_p='Nous réalisons les prises de vue à 360° et montons une visite pour la vente, la location ou un portfolio — ou un projet de design que l’on pourra parcourir de la même façon.',
               i_cta_a='Envoyer une demande', i_empty='Les visites arrivent bientôt.'),
    'pt': dict(rooms='Divisões', rooms_nav='Divisões da visita', prev='Divisão anterior', next='Divisão seguinte', zoom='Zoom', zin='Aproximar', zout='Afastar',
               hint='Arraste para olhar à volta · roda ou dois dedos para o zoom · setas para mudar de divisão',
               home='Início', tours='Visitas 3D', eye='Visita 3D 360°', about='Sobre a visita', more='Mais sobre o imóvel e a visita', rel_aria='Páginas relacionadas',
               case='Página do projeto', portfolio='Portfólio', all='Todas as visitas 3D', others='Outras visitas', frame='imagem da visita 3D', contact='/pt/contacto',
               cta='Quer uma visita 3D do seu imóvel ou um projeto de design que se possa percorrer assim? ', cta_a='Enviar pedido',
               seen=lambda rooms, n: f'Na visita: {", ".join(rooms)} — {n} {"ponto de vista" if n == 1 else "pontos de vista"}. ',
               seen0=lambda n: f'A visita tem {n} {"ponto de vista" if n == 1 else "pontos de vista"}. ',
               nav='Mude de divisão com as setas na foto, os botões ‹ › ou o menu «Divisões»; com óculos de RV, use o botão VR.',
               card_n=lambda n: f'{n} pontos', card_go='Abrir a visita →', card_alt='visita 3D 360°',
               i_title='Visitas 3D aos nossos projetos — visitas virtuais | CAS',
               i_desc='Visitas 3D da CAS Development: interiores concluídos e visualizações 360 de projetos de design. No telemóvel, no portátil ou com óculos de RV.',
               i_ogt='Visitas 3D aos nossos projetos — CAS Development', i_eye='Portfólio · 360°', i_h1='Percorra os nossos <em>projetos</em>',
               i_lead='Visitas 360° a interiores concluídos e visualizações 360 dos nossos projetos de design e conceitos: o tipo de cada visita está indicado no seu cartão. Abra uma visita e passe de uma divisão para a outra com as setas na foto, como se estivesse lá dentro.',
               i_how='<li><b>Telemóvel</b><span>Rode o telemóvel ou deslize o dedo</span></li>\n<li><b>Portátil</b><span>Arraste com o rato; clique numa seta para passar à divisão seguinte</span></li>\n<li><b>Óculos de RV</b><span>Carregue em VR na visita e fica lá dentro</span></li>',
               i_cta_h='Quer uma visita 3D do <em>seu</em> imóvel?', i_cta_p='Fotografamos em 360° e montamos uma visita para venda, arrendamento ou portfólio, ou criamos um projeto de design que poderá ser percorrido da mesma forma.',
               i_cta_a='Enviar pedido', i_empty='As visitas chegam em breve.'),
    'zh': dict(rooms='房间', rooms_nav='漫游房间', prev='上一个房间', next='下一个房间', zoom='缩放', zin='放大', zout='缩小',
               hint='拖动环视 · 滚轮或双指缩放 · 点击箭头切换房间',
               home='首页', tours='3D 漫游', eye='360° 3D 漫游', about='关于漫游', more='进一步了解项目与漫游', rel_aria='相关页面',
               case='项目页面', portfolio='作品集', all='全部 3D 漫游', others='其他漫游', frame='3D 漫游画面', contact='/zh/contact',
               cta='想为您的房产制作 3D 漫游，或做一个同样可以漫游参观的设计方案？', cta_a='提交需求',
               seen=lambda rooms, n: f'漫游包括：{"、".join(rooms)}——共 {n} 个观景点。',
               seen0=lambda n: f'漫游共有 {n} 个观景点。',
               nav='可通过照片上的箭头、‹ › 按钮或“房间”菜单切换；佩戴 VR 眼镜时请使用 VR 按钮。',
               card_n=lambda n: f'{n} 个点', card_go='打开漫游 →', card_alt='360° 3D 漫游',
               i_title='项目 3D 漫游：在线虚拟参观 | CAS Development',
               i_desc='CAS Development 的 3D 漫游：已完工的室内空间与设计方案的 360 效果图。可在手机、笔记本电脑或 VR 眼镜上观看。',
               i_ogt='项目 3D 漫游 — CAS Development', i_eye='作品集 · 360°', i_h1='走进我们的<em>项目</em>',
               i_lead='已完工室内的 360° 漫游，以及我们设计方案和概念方案的 360 效果图——每个漫游的类型都标注在卡片上。打开漫游，点击照片上的箭头在房间之间移动，如身临其境。',
               i_how='<li><b>手机</b><span>转动手机或用手指滑动</span></li>\n<li><b>笔记本电脑</b><span>用鼠标拖动，点击箭头进入下一个房间</span></li>\n<li><b>VR 眼镜</b><span>在漫游中按 VR 按钮，即可身临其境</span></li>',
               i_cta_h='想为<em>您的</em>房产制作 3D 漫游？', i_cta_p='我们进行 360° 拍摄，制作用于出售、出租或作品集的漫游——也可以做一个同样能漫游参观的设计方案。',
               i_cta_a='提交需求', i_empty='漫游即将上线。'),
    'ar': dict(rooms='الغرف', rooms_nav='غرف الجولة', prev='الغرفة السابقة', next='الغرفة التالية', zoom='التكبير', zin='تكبير', zout='تصغير',
               hint='اسحب للنظر حولك · عجلة الفأرة أو إصبعان للتكبير · الأسهم للانتقال بين الغرف',
               home='الرئيسية', tours='جولات ثلاثية الأبعاد', eye='جولة ثلاثية الأبعاد 360°', about='عن الجولة', more='المزيد عن العقار والجولة', rel_aria='صفحات ذات صلة',
               case='صفحة المشروع', portfolio='معرض الأعمال', all='جميع الجولات ثلاثية الأبعاد', others='جولات أخرى', frame='لقطة من الجولة ثلاثية الأبعاد', contact='/ar/contact',
               cta='هل تريد جولة ثلاثية الأبعاد لعقارك أو مشروع تصميم يمكن التجول فيه بالطريقة نفسها؟ ', cta_a='أرسل طلبًا',
               seen=lambda rooms, n: f'في الجولة: {"، ".join(rooms)} — عدد نقاط المشاهدة: {n}. ',
               seen0=lambda n: f'عدد نقاط المشاهدة في الجولة: {n}. ',
               nav='تنقّل بالأسهم على الصورة أو بالزرين ‹ › أو من قائمة «الغرف»؛ وفي نظارات الواقع الافتراضي استخدم زر VR.',
               card_n=lambda n: f'نقاط المشاهدة: {n}', card_go='افتح الجولة ←', card_alt='جولة ثلاثية الأبعاد 360°',
               i_title='جولات ثلاثية الأبعاد في مشاريعنا | CAS Development',
               i_desc='جولات CAS Development ثلاثية الأبعاد: تصاميم داخلية منفّذة وتصورات 360 لمشاريع التصميم. شاهدها على الهاتف أو الحاسوب المحمول أو بنظارات الواقع الافتراضي.',
               i_ogt='جولات ثلاثية الأبعاد في مشاريعنا — CAS Development', i_eye='معرض الأعمال · 360°', i_h1='تجوّل في <em>مشاريعنا</em>',
               i_lead='جولات 360° في تصاميم داخلية منفّذة وتصورات 360 لمشاريع التصميم والمفاهيم لدينا — نوع كل جولة مكتوب على بطاقتها. افتح الجولة وتنقّل بين الغرف بالأسهم على الصورة كأنك في الداخل.',
               i_how='<li><b>الهاتف</b><span>أدر الهاتف أو اسحب بإصبعك</span></li>\n<li><b>الحاسوب المحمول</b><span>اسحب بالفأرة، وانقر على السهم للانتقال إلى الغرفة التالية</span></li>\n<li><b>نظارات الواقع الافتراضي</b><span>اضغط VR في الجولة وستكون في الداخل</span></li>',
               i_cta_h='هل تريد جولة ثلاثية الأبعاد <em>لعقارك</em>؟', i_cta_p='نصوّر بزاوية 360° ونجهّز جولة للبيع أو الإيجار أو لمعرض الأعمال، أو ننفّذ مشروع تصميم يمكن التجول فيه بالطريقة نفسها.',
               i_cta_a='أرسل طلبًا', i_empty='الجولات قريبًا.'),
}
# «Подзвонити» мовою сторінки замість номера телефону (Михайло 24.11.2026; номер текстом — лише на /contact)
def _call_lbl(lang):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/site')); import leadform
    return html.escape(leadform._call(lang)[0])


for _l in X:
    X[_l].setdefault('call', _call_lbl(_l))


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
    return ROOMS[lang][b] + (f' {n}' if n else '') + (SEP.get(lang, ', ') + FLOOR[lang](fl) if fl else '')


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
            r = b if lang == 'uk' else ROOMS[lang][b]
            r = r if lang == 'de' else r.lower()  # німецькі іменники — з великої
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
            f'<a href="{x["contact"]}#zayavka">{x["cta_a"]}</a> · <a href="tel:+380978667755">{x["call"]}</a>'
            ' · <a href="https://t.me/+380978667755" target="_blank" rel="noopener">Telegram</a> · <a href="https://wa.me/380978667755" target="_blank" rel="noopener">WhatsApp</a>'
            ' · <a href="viber://chat?number=%2B380978667755">Viber</a></p>\n'
            '</main>')


def _crumbs(items):
    """JSON-LD BreadcrumbList (для seo.py: на всіх внутрішніх сторінках)."""
    return json.dumps({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(items, 1)]},
        ensure_ascii=False).replace('</', '<\\/')


def _ver(rel):  # хеш файлу для ?v= — /assets кешується на рік (immutable)
    import hashlib
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]


def _i18n():
    sys.path.insert(0, str(ROOT / 'tools/site')); import i18n
    return i18n


def _html(lang):
    """Атрибути <html>: lang (zh → zh-Hans) і dir="rtl" для ar — з tools/site/i18n.py."""
    m = _i18n().meta(lang)
    return f'lang="{m["html"]}"' + (' dir="rtl"' if m['dir'] == 'rtl' else '')


def _alts(members):
    """hreflang для наявних мов (порядок і коди — tools/site/i18n.py: uk, ru, en, es, zh-Hans …) + x-default = uk."""
    if len(members) < 2:
        return ''
    i18n = _i18n()
    order = [l for l in i18n.LANGS if l in members]
    return ''.join(f'\n<link rel="alternate" hreflang="{i18n.meta(l)["hreflang"]}" href="{SITE}{members[l]}">' for l in order) + \
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
                                                            slug=t['slug'], thumb=thumb, data=data, hattr=_html(lang), base=base, x=x, alts=_alts(members),
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
    # LCP сторінки турів — перша картка (аудит фото 16.11.2026): без lazy, fetchpriority="high"; решта — lazy
    cards[:1] = [c.replace(' loading="lazy"', ' fetchpriority="high"', 1) for c in cards[:1]]
    idx = INDEX.format(vcss=_ver("assets/tours/tour.v1.css"), site=SITE, og=og, crumbs=_crumbs([(x['home'], P + '/'), (x['tours'], base)]),
                       cards='\n'.join(cards) or f'<p class="tl-lead">{x["i_empty"]}</p>', hattr=_html(lang), base=base, x=x,
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
    """sitemap.xml: /tury, /<мова>/tury і відкриті тури — додати, приховані (noindex) — прибрати."""
    sm = ROOT / 'sitemap.xml'; s = sm.read_text(encoding='utf-8')
    want = {SITE + p for p in paths}
    n = re.sub(r'  <url><loc>' + re.escape(SITE) + r'(?:/(?:en|ru|es|pl|de|fr|zh|ar))?/tury(?:/[a-z0-9-]+)?</loc>.*?</url>\n',
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
