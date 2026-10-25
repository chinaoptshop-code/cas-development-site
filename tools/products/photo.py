#!/usr/bin/env python3
"""Фото товару для Оздоби: вирізає фон, центрує обʼєкт і кладе в каталог.

  python3 tools/products/photo.py 12 ~/Downloads/IMG_1234.HEIC          # головне фото товару id=12
  python3 tools/products/photo.py 12 фото2.jpg фото3.jpg --add           # додаткові фото (галерея)
  python3 tools/products/photo.py 12 https://…/lamp.jpg --keep-bg        # без вирізання фону
  python3 tools/products/photo.py 12 --clear                             # прибрати фото, повернути іконку
  python3 tools/products/photo.py 12 фото.jpg --crop 0.1,0,0.9,0.8       # спершу обрізати (частки ширини/висоти: x0,y0,x1,y1)
  python3 tools/products/photo.py 12 дзеркало.jpg --fill-holes           # дзеркала, скло: не робити «дірку» всередині рами
  python3 tools/products/photo.py 12 подушка.jpg --flood                 # білий предмет на білому тлі: заливка тла від країв

PNG/WebP, що вже має прозорий фон (напр. з PDF-каталогу), береться як є — фон не вирізається вдруге.
--no-build — не запускати build.py (коли додаєте фото пачкою; збірку запустіть наприкінці).

Результат: img/products/<id>-<хеш>-400.webp і -800.webp (квадрат, прозорий фон), поле img/imgs
у assets/ozdoba/catalog.json, потім автоматично tools/products/build.py.
Потрібно: pip install rembg onnxruntime pillow (для HEIC з iPhone — ще pillow-heif).
Фото з інтернету беріть лише ті, що можна використовувати (від постачальника/фабрики або свої).
"""
import argparse, hashlib, io, json, os, subprocess, sys, urllib.request

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(ROOT, 'assets/ozdoba/catalog.json')
OUT = os.path.join(ROOT, 'img/products')
SIZES = (800, 400)
MARGIN = 0.06  # поле навколо обʼєкта


def load(src):
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    if src.startswith(('http://', 'https://')):
        req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(req, timeout=30).read()
    else:
        data = open(os.path.expanduser(src), 'rb').read()
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))), data


_SESSION = None


def precut(im):
    """Фото вже з прозорим фоном (щонайменше 3% пікселів прозорі) — вирізати не треба."""
    if im.mode not in ('RGBA', 'LA', 'PA') and not (im.mode == 'P' and 'transparency' in im.info): return False
    a = im.convert('RGBA').getchannel('A')
    hist = a.histogram()
    return sum(hist[:16]) > 0.03 * a.width * a.height


def cutout(im, fill_holes=False):
    global _SESSION
    from rembg import new_session, remove
    if _SESSION is None: _SESSION = new_session('isnet-general-use')
    out = remove(im.convert('RGB'), session=_SESSION).convert('RGBA')
    if fill_holes: out = fill(out, im.convert('RGB'))
    return out


def fill(cut, orig):
    """Заповнює «дірки» в масці (прозорі ділянки, не повʼязані з краєм кадру) пікселями оригіналу."""
    from PIL import ImageDraw
    m = cut.getchannel('A').point(lambda a: 255 if a > 8 else 0)
    pad = Image.new('L', (m.width + 2, m.height + 2), 0); pad.paste(m, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)  # усе зовнішнє тло → 128
    outside = pad.crop((1, 1, m.width + 1, m.height + 1)).point(lambda v: 255 if v == 128 else 0)
    holes = Image.eval(outside, lambda v: 255 - v)  # не зовні = обʼєкт + дірки
    res = orig.convert('RGBA'); res.putalpha(Image.composite(Image.new('L', m.size, 255), cut.getchannel('A'), holes))
    return res


def flood(im, thresh=18):
    """Однотонне світле тло (білий предмет на білому, де нейромережа «зʼїдає» предмет): заливка від країв кадру."""
    from PIL import ImageDraw
    rgb = im.convert('RGB'); W, H = rgb.size
    pad = Image.new('RGB', (W + 2, H + 2), rgb.getpixel((0, 0))); pad.paste(rgb, (1, 1))
    mark = (255, 0, 255)
    ImageDraw.floodfill(pad, (0, 0), mark, thresh=thresh)
    m = pad.crop((1, 1, W + 1, H + 1))
    px = m.load(); a = Image.new('L', (W, H), 255); ap = a.load()
    for y in range(H):
        for x in range(W):
            if px[x, y] == mark: ap[x, y] = 0
    out = rgb.convert('RGBA'); out.putalpha(a)
    return out


def crop(im, box):
    x0, y0, x1, y1 = [float(v) for v in box.split(',')]
    W, H = im.size
    return im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))


def square(im):
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox() if im.mode == 'RGBA' else None
    if bbox: im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * MARGIN))
    bg = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    bg.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im if im.mode == 'RGBA' else None)
    return bg


def save(im, item_id, raw):
    os.makedirs(OUT, exist_ok=True)
    base = f'img/products/{item_id}-{hashlib.sha1(raw).hexdigest()[:6]}'
    for s in SIZES:
        im.resize((s, s), Image.LANCZOS).save(os.path.join(ROOT, f'{base}-{s}.webp'), 'WEBP', quality=82, method=6)
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id', type=int)
    ap.add_argument('src', nargs='*')
    ap.add_argument('--add', action='store_true', help='додати в галерею, а не замінити головне фото')
    ap.add_argument('--keep-bg', action='store_true', help='не вирізати фон')
    ap.add_argument('--clear', action='store_true', help='прибрати всі фото товару')
    ap.add_argument('--crop', help='обрізати перед обробкою: x0,y0,x1,y1 у частках (0–1)')
    ap.add_argument('--fill-holes', action='store_true', help='не вирізати внутрішні ділянки (дзеркала, скло)')
    ap.add_argument('--flood', action='store_true', help='світле однотонне тло прибрати заливкою від країв (білий предмет на білому)')
    ap.add_argument('--no-build', action='store_true', help='не запускати build.py після додавання')
    a = ap.parse_args()
    d = json.load(open(CAT, encoding='utf-8'))
    item = next((i for i in d['items'] if i['id'] == a.id), None)
    if not item: sys.exit(f'товару id={a.id} немає в каталозі')
    if a.clear:
        item['img'], item['imgs'] = None, []
    else:
        if not a.src: sys.exit('вкажіть файл або посилання на фото')
        bases = []
        for src in a.src:
            im, raw = load(src)
            if a.crop: im = crop(im, a.crop); raw += a.crop.encode()
            if a.keep_bg: im = im.convert('RGB')
            elif precut(im): im = im.convert('RGBA')
            elif a.flood: im = flood(im)
            else: im = cutout(im, a.fill_holes)
            bases.append(save(square(im), a.id, raw))
            print('✓', src, '→', bases[-1])
        if a.add or item.get('img'):
            if not a.add: item['img'], bases = bases[0], bases[1:]
            item['imgs'] = list(item.get('imgs') or []) + bases
        else:
            item['img'], item['imgs'] = bases[0], bases[1:]
    json.dump(d, open(CAT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    if not a.no_build: subprocess.run([sys.executable, os.path.join(ROOT, 'tools/products/build.py')], check=True)


if __name__ == '__main__':
    main()
