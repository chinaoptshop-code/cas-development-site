#!/usr/bin/env python3
"""Великі копії фото для різкості на ПК/Retina (Михайло 05.11.2026: «покращити якість фото, бо все розмите»).

  python3 tools/img/originals.py img/p/1rJCChE1lDiB_j img/1nqFOoTfr5BD   # бази (шлях без -<ширина>.webp)
  python3 tools/img/originals.py --widths 1200,1600,1920 img/1p_MqveKjiZ1
  python3 tools/img/originals.py --need        # усі бази, яким tools/site/sharp.py бракує ширин (звіт), без завантаження

Оригінал — повнорозмірна мініатюра Google Drive (id з tools/img/drive-ids.json: коротка назва файлу в img/ → повний id),
кеш поза репозиторієм (~/.cache/cas-img). Пише <база>-<ширина>.webp (WebP q81, без апскейлу: ширина ≤ оригіналу),
кадрування — як у наявної копії тієї ж бази (центр, та сама пропорція). Далі — tools/img/build.py (AVIF + lqip).

Похідні кадри (банери ux-wb, фото hero лендингів — tools/site/ux.py WIDE/HERO): tools/img/crops.json —
  "<нова база>": {"src": "<база з drive-ids>", "ratio": W/H, "x": 0…1, "y": 0…1, "q": якість WebP, "blur": px}  (центр кадру; найбільший кадр цієї пропорції;
  hero під градієнтом — q62, щоб LCP на телефоні не важчав)
  python3 tools/img/originals.py --widths 1200,1600,1920,2400 img/p/hx-int
Копії ≥ 2000w (Михайло 09.11.2026, різкість на 1920@2 / 2560+): без blur, q ≤ 78 у межах 450 КБ; --force-big переписує наявні.
  python3 tools/img/originals.py --widths 2400,2800,3200,3840 --force-big img/1nqFOoTfr5BD
"""
import io, json, os, sys, urllib.request

from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IDS = json.load(open(os.path.join(ROOT, 'tools/img/drive-ids.json')))
CROPS = json.load(open(os.path.join(ROOT, 'tools/img/crops.json')))
CACHE = os.path.expanduser('~/.cache/cas-img')
FORCE = False
Q = 81
BIG_W, BIG_MAX = 2000, 450 * 1024  # копії ≥ 2000w: q ≤ 78 без згладжування, ≤ 450 КБ (Михайло 09.11.2026)


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
    if base in CROPS:  # похідний кадр: пропорція й центр — з crops.json
        c = CROPS[base]
        im = original(c['src'])
        W, H = im.size
        ar = c['ratio']
        cw, ch = (round(H * ar), H) if W / H > ar else (W, round(W / ar))
        x0 = min(max(0, round(W * c.get('x', .5) - cw / 2)), W - cw)
        y0 = min(max(0, round(H * c.get('y', .5) - ch / 2)), H - ch)
        im = im.crop((x0, y0, x0 + cw, y0 + ch))
        W, H = im.size
        return _write(base, im, widths, c.get('q', Q), c.get('blur', 0))
    im = original(base)
    ar = ref_ratio(base)
    W, H = im.size
    if ar and abs(W / H - ar) > 0.01:  # центральний кадр тієї ж пропорції, що й наявні копії
        if W / H > ar:
            nw = round(H * ar); im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
        else:
            nh = round(W / ar); im = im.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    return _write(base, im, widths, Q)


def _write(base, im, widths, q=Q, blur=0):
    W, H = im.size
    out = []
    for w in widths:
        if w > W:
            continue
        p = os.path.join(ROOT, f'{base}-{w}.webp')
        if os.path.exists(p) and Image.open(p).size[0] == w and not (FORCE and w >= BIG_W):
            continue
        r = im.resize((w, round(H * w / W)), Image.LANCZOS)
        if w >= BIG_W:  # великі копії (лише великі екрани): без згладжування, якість ≤ 78, що влазить у BIG_MAX (як tools/img/build.py)
            for qq in range(78, 39, -4):
                b = io.BytesIO(); r.save(b, 'WEBP', quality=qq, method=6)
                if b.tell() <= BIG_MAX:
                    break
            open(p, 'wb').write(b.getvalue())
            out.append((w, os.path.getsize(p) // 1024))
            continue
        if blur:  # легке згладжування шуму фото під градієнтом hero: −25–35 % ваги LCP, на DPR 2–3 непомітно
            r = r.filter(ImageFilter.GaussianBlur(blur))
        r.save(p, 'WEBP', quality=q, method=6)
        out.append((w, os.path.getsize(p) // 1024))
    return W, out


if __name__ == '__main__':
    args = sys.argv[1:]
    widths = [1200, 1600, 2000]
    if '--q' in args:  # якість WebP (за замовчуванням 81); великі копії шумних фото — нижче, щоб байт/піксель ≈ як у меншої копії
        i = args.index('--q'); Q = int(args[i + 1]); del args[i:i + 2]
    FORCE = '--force-big' in args  # переписати й наявні копії ≥ 2000w (нова політика: без згладжування, ≤ 450 КБ)
    if FORCE: args.remove('--force-big')
    if '--widths' in args:
        i = args.index('--widths'); widths = [int(x) for x in args[i + 1].split(',')]; del args[i:i + 2]
    for b in args:
        b = b.strip().strip('/')
        W, out = make(b, widths)
        print(f'{b}: оригінал {W}px → ' + (', '.join(f'{w} ({kb} КБ)' for w, kb in out) or 'нічого нового'))
