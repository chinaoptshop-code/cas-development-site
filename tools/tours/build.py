#!/usr/bin/env python3
"""3D-тури CAS: тека 360-фото → тур на сайті (/tury/<slug>).

  python3 tools/tours/build.py new <тека-з-фото> <slug> "Назва туру" [--desc "Опис"] [--max 15]
      Новий тур завжди прихований ("hidden": true) — відкрити після ОК Михайла.
      Стискає фото (equirect 2:1) у img/tury/<slug>/ (4096 px — працює на будь-якому телефоні й у VR),
      створює tools/tours/tours/<slug>.json: сцени за іменами файлів, переходи «далі / назад» між сусідніми.
  python3 tools/tours/build.py pages
      Перебудовує сторінки: /tury (список турів) і /tury/<slug> (переглядач) з усіх JSON.

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
<title>{title} — 3D-тур | CAS Development</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{site}/tury/{slug}">{robots}
<meta property="og:title" content="{title} — 3D-тур CAS Development">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}{thumb}">
<link rel="icon" href="/favicon.svg">
<link rel="stylesheet" href="/assets/tours/tour.v1.css">
<script src="/assets/tours/aframe.min.js"></script>
</head><body>
<script type="application/json" id="tour-data">{data}</script>
<a-scene id="scene" cursor="rayOrigin: mouse; fuse: false" raycaster="objects: .spot, .sky-hit" vr-mode-ui="enabled: true" loading-screen="dotsColor:#c8a96a; backgroundColor:#111" renderer="colorManagement:true" xr-mode-ui="enabled: true">
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
  <a class="brand" href="/tury" target="_top">CAS · 3D-тури</a>
  <div class="title" id="title"></div>
  <button class="btn" id="menuBtn" aria-label="Кімнати">☰ Кімнати</button>
</div>
<nav class="rooms" id="rooms" hidden></nav>
<div class="hint" id="hint">Тягніть, щоб роздивитись · стрілки — перехід · VR — окуляри</div>
<div class="edit" id="edit" hidden></div>
<script src="/assets/tours/tour.v1.js"></script>
</body></html>
'''

INDEX = '''<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>3D-тури обʼєктів — CAS Development</title>
<meta name="description" content="Віртуальні 3D-тури реалізованих обʼєктів CAS Development: пройдіться кімнатами на телефоні, ноутбуці або у VR-окулярах.">
<link rel="canonical" href="{site}/tury">
<link rel="icon" href="/favicon.svg">
<link rel="stylesheet" href="/assets/tours/tour.v1.css">
</head><body class="list">
<main class="wrap">
<h1>3D-тури обʼєктів</h1>
<p class="lead">Пройдіться нашими обʼєктами так, ніби ви всередині: на телефоні — повертайте його, на ноутбуці — тягніть мишкою, у VR-окулярах — натисніть VR. Переходи між кімнатами — кнопками на фото.</p>
<div class="grid">{cards}</div>
<p class="cta">Хочете 3D-тур свого обʼєкта або дизайн-проєкт? <a href="/contact">Напишіть нам</a> · <a href="tel:+380978667755">+380 97 866 77 55</a></p>
</main>
</body></html>
'''


def pages():
    OUT.mkdir(exist_ok=True)
    cards = []
    for f in sorted(DATA.glob('*.json')):
        t = json.loads(f.read_text(encoding='utf-8'))
        start = next(s for s in t['scenes'] if s['id'] == t['start'])
        thumb = start['image'].replace('.jpg', '-thumb.jpg')
        desc = html.escape(t.get('description') or f"Віртуальний 3D-тур «{t['title']}» від CAS Development.")
        data = json.dumps(t, ensure_ascii=False).replace('</', '<\\/')
        (OUT / f"{t['slug']}.html").write_text(VIEW.format(title=html.escape(t['title']), desc=desc, site=SITE,
                                                            slug=t['slug'], thumb=thumb, data=data,
                                                            robots='\n<meta name="robots" content="noindex">' if t.get('hidden') else ''), encoding='utf-8')
        if not t.get('hidden'):
            cards.append(f'<a class="card" href="/tury/{t["slug"]}"><img src="{thumb}" alt="{html.escape(t["title"])} — 3D-тур" '
                         f'loading="lazy" width="640" height="320"><span>{html.escape(t["title"])}</span>'
                         f'<small>{len(t["scenes"])} кімн.</small></a>')
    idx = INDEX.format(site=SITE, cards='\n'.join(cards) or '<p>Тури скоро зʼявляться.</p>')
    if not cards:  # поки немає відкритих турів — сторінка-заглушка не індексується
        idx = idx.replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1)
    try:  # єдина шапка/футер сайту (tools/site/chrome.py)
        sys.path.insert(0, str(ROOT / 'tools/site')); import chrome
        idx = chrome.apply(idx, 'tury.html')
    except Exception as e:
        print('chrome.apply пропущено:', e)
    (ROOT / 'tury.html').write_text(idx, encoding='utf-8')
    print(f'Сторінки: /tury + {len(cards)} турів')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('new', 'pages'):
        raise SystemExit(__doc__)
    if a[0] == 'pages':
        pages()
    else:
        opt = lambda k, d='': a[a.index(k) + 1] if k in a else d
        new(a[1], a[2], a[3], opt('--desc'), int(opt('--max', 0)))
