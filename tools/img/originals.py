#!/usr/bin/env python3
"""Великі копії фото для різкості на ПК/Retina (Михайло 05.11.2026: «покращити якість фото, бо все розмите»).

  python3 tools/img/originals.py img/p/1rJCChE1lDiB_j img/1nqFOoTfr5BD   # бази (шлях без -<ширина>.webp)
  python3 tools/img/originals.py --widths 1200,1600,1920 img/1p_MqveKjiZ1
  python3 tools/img/originals.py --need        # усі бази, яким tools/site/sharp.py бракує ширин (звіт), без завантаження

Оригінал — повнорозмірна мініатюра Google Drive (id з tools/img/drive-ids.json: коротка назва файлу в img/ → повний id),
кеш поза репозиторієм (~/.cache/cas-img). Пише <база>-<ширина>.webp (WebP q81, без апскейлу: ширина ≤ оригіналу),
кадрування — як у наявної копії тієї ж бази (центр, та сама пропорція). Далі — tools/img/build.py (AVIF + lqip).
"""
import io, json, os, sys, urllib.request

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IDS = json.load(open(os.path.join(ROOT, 'tools/img/drive-ids.json')))
CACHE = os.path.expanduser('~/.cache/cas-img')
Q = 81


def original(base):
    fid = IDS.get(base)
    if not fid:
        raise SystemExit(f'{base}: немає id у tools/img/drive-ids.json')
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, fid + '.jpg')
    if not os.path.exists(p):
        url = f'https://drive.google.com/thumbnail?id={fid}&sz=w4000'
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        Image.open(io.BytesIO(data)).verify()
        open(p, 'wb').write(data)
    return ImageOps.exif_transpose(Image.open(p)).convert('RGB')


def ref_ratio(base):
    """Пропорція наявної найбільшої копії бази (без префіксів m/r — мобільні кадри інші)."""
    d, n = os.path.split(os.path.join(ROOT, base))
    best = None
    for f in os.listdir(d):
        if f.startswith(n + '-') and f.endswith('.webp') and f[len(n) + 1:-5].isdigit():
            w, h = Image.open(os.path.join(d, f)).size
            if not best or w > best[0]: best = (w, h)
    return best[0] / best[1] if best else None


def make(base, widths):
    im = original(base)
    ar = ref_ratio(base)
    W, H = im.size
    if ar and abs(W / H - ar) > 0.01:  # центральний кадр тієї ж пропорції, що й наявні копії
        if W / H > ar:
            nw = round(H * ar); im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
        else:
            nh = round(W / ar); im = im.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    W, H = im.size
    out = []
    for w in widths:
        if w > W:
            continue
        p = os.path.join(ROOT, f'{base}-{w}.webp')
        if os.path.exists(p) and Image.open(p).size[0] == w:
            continue
        r = im.resize((w, round(H * w / W)), Image.LANCZOS)
        r.save(p, 'WEBP', quality=Q, method=6)
        out.append((w, os.path.getsize(p) // 1024))
    return W, out


if __name__ == '__main__':
    args = sys.argv[1:]
    widths = [1200, 1600, 2000]
    if '--widths' in args:
        i = args.index('--widths'); widths = [int(x) for x in args[i + 1].split(',')]; del args[i:i + 2]
    for b in args:
        b = b.strip().strip('/')
        W, out = make(b, widths)
        print(f'{b}: оригінал {W}px → ' + (', '.join(f'{w} ({kb} КБ)' for w, kb in out) or 'нічого нового'))
