#!/usr/bin/env python3
"""Фото товару для Оздоби: вирізає фон, центрує обʼєкт і кладе в каталог.

  python3 tools/products/photo.py 12 ~/Downloads/IMG_1234.HEIC          # головне фото товару id=12
  python3 tools/products/photo.py 12 фото2.jpg фото3.jpg --add           # додаткові фото (галерея)
  python3 tools/products/photo.py 12 https://…/lamp.jpg --keep-bg        # без вирізання фону
  python3 tools/products/photo.py 12 --clear                             # прибрати фото, повернути іконку

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


def cutout(im):
    from rembg import new_session, remove
    return remove(im.convert('RGB'), session=new_session('isnet-general-use')).convert('RGBA')


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
            im = im.convert('RGBA') if a.keep_bg else cutout(im)
            bases.append(save(square(im) if not a.keep_bg else square(im.convert('RGB')), a.id, raw))
            print('✓', src, '→', bases[-1])
        if a.add or item.get('img'):
            if not a.add: item['img'], bases = bases[0], bases[1:]
            item['imgs'] = list(item.get('imgs') or []) + bases
        else:
            item['img'], item['imgs'] = bases[0], bases[1:]
    json.dump(d, open(CAT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools/products/build.py')], check=True)


if __name__ == '__main__':
    main()
