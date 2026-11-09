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
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{ttag}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{site}/tury/{slug}">{robots}
<meta property="og:title" content="{ogt}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}{thumb}">
<meta property="og:url" content="{site}/tury/{slug}">
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
  <a class="brand" href="/tury" target="_top">CAS · 3D</a>
  <h1 class="title" id="title" style="margin:0;font-weight:inherit">{title}</h1>
  <button class="btn" id="menuBtn" aria-label="Кімнати" aria-controls="rooms" aria-expanded="false">☰ Кімнати</button>
</div>
<nav class="rooms" id="rooms" aria-label="Кімнати туру" hidden></nav>
<div class="tnav" id="nav"><button class="ib" id="prevBtn" aria-label="Попередня кімната">‹</button><span class="cnt" id="cnt" aria-live="polite"></span><button class="ib" id="nextBtn" aria-label="Наступна кімната">›</button></div>
<div class="tzoom" role="group" aria-label="Масштаб"><button class="ib" id="zoomIn" aria-label="Наблизити">+</button><button class="ib" id="zoomOut" aria-label="Віддалити">−</button></div>
<div class="hint" id="hint">Тягніть, щоб роздивитись · коліщатко або два пальці — масштаб · стрілки — перехід</div>
<div class="edit" id="edit" hidden></div>
</div>{info}
<script src="/assets/tours/tour.v1.js?v={vjs}"></script>
</body></html>
'''

INDEX = '''<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>3D-тури обʼєктів — віртуальні прогулянки | CAS Development</title>
<meta name="description" content="3D-тури CAS Development: реалізовані інтерʼєри й 360-візуалізації дизайн-проєктів. Дивіться на телефоні, ноутбуці або у VR-окулярах.">
<link rel="canonical" href="{site}/tury">
<script type="application/ld+json">{crumbs}</script>
<meta property="og:title" content="3D-тури обʼєктів — CAS Development">
<meta property="og:description" content="3D-тури CAS Development: реалізовані інтерʼєри й 360-візуалізації дизайн-проєктів. Дивіться на телефоні, ноутбуці або у VR-окулярах.">
<meta property="og:url" content="{site}/tury">
<meta property="og:type" content="website">
<meta property="og:image" content="{site}{og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg">
<link rel="stylesheet" href="/assets/tours/tour.v1.css?v={vcss}">
</head><body class="list">
<main class="tl">
<section class="tl-hero">
<p class="tl-eye">Портфоліо · 360°</p>
<h1>Пройдіться нашими <em>обʼєктами</em></h1>
<p class="tl-lead">360° тури реалізованих інтерʼєрів і 360-візуалізації наших дизайн-проєктів і концептів — тип кожного туру підписаний на картці. Відкрийте тур і рухайтесь між кімнатами стрілками на фото — так, ніби ви всередині.</p>
<ul class="tl-how">
<li><b>Телефон</b><span>Повертайте телефон або ведіть пальцем</span></li>
<li><b>Ноутбук</b><span>Тягніть мишкою, клік по стрілці — наступна кімната</span></li>
<li><b>VR-окуляри</b><span>Кнопка VR у турі — і ви в обʼєкті</span></li>
</ul>
</section>
<section class="tl-grid">{cards}</section>
<section class="tl-cta">
<h2>Хочете 3D-тур <em>свого</em> обʼєкта?</h2>
<p>Знімемо 360° і зберемо тур для продажу, оренди чи портфоліо — або зробимо дизайн-проєкт, який можна буде так само обійти.</p>
<div class="tl-btns"><a class="tl-btn" href="/contact">Залишити заявку</a><a class="tl-btn ghost" href="tel:+380978667755">+380 97 866 77 55</a></div>
</section>
</main>
</body></html>
'''


# ── текст під переглядачем (tools/tours/about.json): що за обʼєкт, що видно, статус, навіщо 360°, посилання ──
ABOUT = ROOT / 'tools/tours/about.json'
HOW = {  # спільний абзац «навіщо тур 360°» — чотири варіанти, щоб тексти турів не повторювалися дослівно
    'A': 'Навіщо тур 360°: дизайн-проєкт можна обійти ще до ремонту й побачити, як кімнати переходять одна в одну. '
         'Планування, кольори й меблі легше погодити на моделі — правки вносимо в проєкт, а не на обʼєкті. '
         'Модель будуємо на реальні розміри: наш фахівець робить 3D-замір приміщення сканером.',
    'B': 'Тур 360° показує проєкт так, як його побачать господарі: з висоти очей і з реальними пропорціями кімнат. '
         'На етапі проєкту зручно перевірити, куди дивляться вікна, як стоять меблі й чи вистачає світла, — і змінити це до початку робіт. '
         'Розміри для моделі дає 3D-замір, який робить наш фахівець.',
    'C': 'Концепт задає напрям: матеріали, світло, настрій кімнат. Обійти його в 360° простіше, ніж розглядати окремі рендери: '
         'одразу зрозуміло, що подобається, а що варто змінити в повному дизайн-проєкті.',
    'D': 'Концепт у 360° — це спосіб обрати стиль до того, як почнеться детальний проєкт: '
         'кімнати видно цілком, а не окремими кадрами, тому порівнювати варіанти й вирішувати простіше.',
}


def _md(t):
    """[текст](/шлях) → <a>; решта екранується."""
    out, k = [], 0
    for m in re.finditer(r'\[([^\]]+)\]\((/[^)\s]*)\)', t):
        out += [html.escape(t[k:m.start()]), f'<a href="{html.escape(m.group(2))}">{html.escape(m.group(1))}</a>']
        k = m.end()
    return ''.join(out) + html.escape(t[k:])


def _points(n):
    return f'{n} ' + ('точка' if n % 10 == 1 and n % 100 != 11 else 'точки' if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else 'точок')


def _rooms(t):
    """Зони туру з назв кімнат: «Спальня 2» → спальня, «Хол, 2 поверх» → хол; «Точка N» не рахуємо."""
    seen = []
    for sc in t['scenes']:
        b = re.sub(r',\s*\d+\s*поверх$', '', re.sub(r'\s+\d+$', '', sc['name'].strip())).strip()
        if b and not re.match(r'(?i)точка\b', b) and b.lower() not in seen:
            seen.append(b.lower())
    return seen


def _info(t, a, related):
    n = len(t['scenes'])
    rooms = _rooms(t)
    seen = (f'Що є в турі: {", ".join(rooms)} — {_points(n)} огляду. ' if rooms else f'У турі {_points(n)} огляду. ') + \
        'Перемикайтеся стрілками на фото, кнопками ‹ › або через меню «Кімнати»; у VR-окулярах — кнопка VR.'
    ps = [seen] + list(a.get('p', [])) + ([HOW[a['how']]] if a.get('how') else []) + ([a['tail']] if a.get('tail') else [])
    links = ([(a['case'], 'Сторінка проєкту')] if a.get('case') else []) + [tuple(x) for x in a.get('links', [])] + \
        [('/portfolio', 'Портфоліо'), ('/tury', 'Усі 3D-тури')]
    rel = ''.join(f'<li><a href="/tury/{r["slug"]}"><img src="{r["_thumb"]}" alt="{html.escape(r["title"])} — кадр 3D-туру" loading="lazy" decoding="async" width="640" height="320">'
                  f'<span>{html.escape(r["title"])}</span></a></li>' for r in related)
    return ('\n<main class="ti" id="pro-tur">\n'
            f'<p class="ti-eye">{html.escape(a.get("eye") or t.get("kind") or "3D-тур 360°")}</p>\n'
            f'<h2>Про тур</h2>\n<p class="ti-lead">{_md(a["lead"])}</p>\n'
            '<details class="ti-more"><summary>Докладніше про обʼєкт і тур</summary>\n'
            + ''.join(f'<p>{_md(x)}</p>\n' for x in ps) +
            '</details>\n'
            '<nav class="ti-links" aria-label="Повʼязані сторінки">' + ''.join(f'<a href="{html.escape(u)}">{html.escape(l)}</a>' for u, l in links) + '</nav>\n'
            + (f'<h2 class="ti-h">Інші тури</h2>\n<ul class="ti-rel">{rel}</ul>\n' if rel else '') +
            '<p class="ti-cta">Хочете 3D-тур свого обʼєкта або дизайн-проєкт, який можна так само обійти? '
            '<a href="/contact">Залишити заявку</a> · <a href="tel:+380978667755">+380 97 866 77 55</a></p>\n'
            '</main>')


def _crumbs(items):
    """JSON-LD BreadcrumbList (для seo.py: на всіх внутрішніх сторінках)."""
    return json.dumps({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(items, 1)]},
        ensure_ascii=False).replace('</', '<\\/')


def _ver(rel):  # хеш файлу для ?v= — /assets кешується на рік (immutable)
    import hashlib
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]

def pages():
    OUT.mkdir(exist_ok=True)
    cards, open_slugs = [], []
    about = json.loads(ABOUT.read_text(encoding='utf-8')) if ABOUT.exists() else {}
    tours = [json.loads(f.read_text(encoding='utf-8')) for f in sorted(DATA.glob('*.json'))]
    for t in tours:
        st = next(s for s in t['scenes'] if s['id'] == t['start'])
        t['_thumb'] = st['image'].replace('.jpg', '-thumb.jpg')
    for t in tours:
        a = about.get(t['slug']) if not t.get('hidden') else None
        thumb = t['_thumb']
        info, related = '', []
        if a:  # «Інші тури»: наступні 3 відкриті тури тієї ж групи за order (по колу) — у кожного туру ≥ 3 вхідних посилання
            grp = sorted((x for x in tours if not x.get('hidden') and (about.get(x['slug']) or {}).get('group') == a.get('group')),
                         key=lambda x: (x.get('order', 99), x['slug']))
            i = [x['slug'] for x in grp].index(t['slug'])
            related = [grp[(i + k) % len(grp)] for k in range(1, min(4, len(grp)))]
            info = _info(t, a, related)
        d = (a or {}).get('description') or t.get('description') or f"Віртуальний 3D-тур «{t['title']}» від CAS Development."
        for tail in (' Тур 360° від CAS Development: телефон, ноутбук або VR-окуляри.', ' Тур 360° від CAS Development.'):
            if not a and len(d) < 70 and len(d + tail) <= 160:
                d += tail
        desc = html.escape(d)
        ttag = html.escape((a or {}).get('title') or next(c for c in (f"{t['title']} — 3D-тур | CAS Development", f"{t['title']} | CAS Development",
                                             f"{t['title']} — 3D-тур", t['title']) if len(c) <= 60 or c == t['title']))
        crumbs = _crumbs([('Головна', '/'), ('3D-тури', '/tury'), (t['title'], f"/tury/{t['slug']}")])
        data = json.dumps({k: v for k, v in t.items() if not k.startswith('_')}, ensure_ascii=False).replace('</', '<\\/')
        (OUT / f"{t['slug']}.html").write_text(VIEW.format(vcss=_ver("assets/tours/tour.v1.css"), vjs=_ver("assets/tours/tour.v1.js"), title=html.escape(t['title']), ttag=ttag, info=info,
                                                            ogt=html.escape(re.sub(r'\s*\|\s*CAS( Development)?$', '', (a or {}).get('title') or '') + ' | CAS Development' if a else f"{t['title']} — 3D-тур CAS Development"), crumbs=crumbs, desc=desc, site=SITE,
                                                            slug=t['slug'], thumb=thumb, data=data,
                                                            robots='\n<meta name="robots" content="noindex">' if t.get('hidden') else ''), encoding='utf-8')
        if not t.get('hidden'):
            open_slugs.append(t['slug'])
            meta = ' · '.join(x for x in (t.get('kind'), t.get('place'), f"{len(t['scenes'])} точ.") if x)
            cards.append((t.get('order', 99), f'<a class="tl-card" href="/tury/{t["slug"]}" style="--pano:url({thumb})">'
                         f'<span class="tl-img"><img src="{thumb}" alt="{html.escape(t["title"])} — 3D-тур 360°" loading="lazy" width="640" height="320"></span>'
                         f'<span class="tl-badge">360°</span><span class="tl-body"><span class="tl-meta">{html.escape(meta)}</span>'
                         f'<span class="tl-name">{html.escape(t["title"])}</span><span class="tl-go">Відкрити тур →</span></span></a>', thumb))
    cards.sort(key=lambda c: c[0])
    og = cards[0][2] if cards else '/img/og/default.jpg'
    cards = [c[1] for c in cards]
    idx = INDEX.format(vcss=_ver("assets/tours/tour.v1.css"), vjs=_ver("assets/tours/tour.v1.js"), site=SITE, og=og, crumbs=_crumbs([('Головна', '/'), ('3D-тури', '/tury')]), cards='\n'.join(cards) or '<p class="tl-lead">Тури скоро зʼявляться.</p>')
    if not cards:  # поки немає відкритих турів — сторінка-заглушка не індексується
        idx = idx.replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1)
    try:  # єдина шапка/футер сайту (tools/site/chrome.py)
        sys.path.insert(0, str(ROOT / 'tools/site')); import chrome
        idx = chrome.apply(idx, 'tury.html')
    except Exception as e:
        print('chrome.apply пропущено:', e)
    (ROOT / 'tury.html').write_text(idx, encoding='utf-8')
    sitemap(['/tury'] * bool(cards) + [f'/tury/{s}' for s in open_slugs])
    pf = ROOT / 'tools/site/pages/uk-portfolio.json'  # блок «3D-тури 360°» у /portfolio — посилання на кожен відкритий тур
    if pf.exists():
        miss = [x for x in open_slugs if f'"/tury/{x}"' not in pf.read_text(encoding='utf-8')]
        if miss:
            print('Увага: тури без посилання в /portfolio (rel «3D-тури 360°» у tools/site/pages/uk-portfolio.json):', ', '.join(miss))
    nabout = [x for x in open_slugs if x not in about]
    if nabout:
        print('Увага: відкриті тури без тексту в tools/tours/about.json:', ', '.join(nabout))
    print(f'Сторінки: /tury + {len(cards)} турів')


def sitemap(paths):
    """sitemap.xml: /tury і відкриті тури — додати, приховані (noindex) — прибрати."""
    sm = ROOT / 'sitemap.xml'; s = sm.read_text(encoding='utf-8')
    want = {SITE + p for p in paths}
    n = re.sub(r'  <url><loc>' + re.escape(SITE) + r'/tury(?:/[a-z0-9-]+)?</loc>.*?</url>\n',
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
