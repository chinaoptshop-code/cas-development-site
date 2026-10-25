#!/usr/bin/env python3
"""Запікання сцен /konfigurator: фото, маски зон, згладжена світлотінь і статистика зон.

  python3 tools/konfigurator/bake.py

Вхід:
  img/p/<id>-900.webp                    — оригінальні візуалізації CAS (портфоліо)
  tools/konfigurator/up/<room>_x2.png    — ті самі кадри, збільшені ×2 (EDSR, див. seg.py --upscale), необовʼязково
  tools/konfigurator/masks/m_<room>_<zone>.png — «сирі» мʼякі маски SAM (seg.py), 900 px
  tools/konfigurator/prompts.json        — рамки підказок (маска обрізається рамкою зони)
Вихід (assets/konfigurator/):
  <room>-900.webp, <room>-1800.webp      — фото
  <room>-m.webp                          — атлас масок 900×(3·H), lossless: 3 плитки RGB по вертикалі
        плитка 0: зони 0,1,2 · плитка 1: зони 3,4,5 · плитка 2: R — зона 6, B — зона 7
  <room>-s.webp                          — згладжена в межах зон яскравість (sRGB, 1/3 роздільності) для «світлотіні без візерунка»
  scene.json                             — розміри, середня яскравість, центроїд і рамка кожної зони
Потрібні numpy, scipy, Pillow (системний python3).
"""
import json, os, shutil
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import uniform_filter, gaussian_filter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'assets', 'konfigurator')

# порядок = слот у шейдері; PRIORITY — хто «перекриває» кого (передній план першим)
ROOMS = {
    'living': dict(src='18V9n96tOhjKjh', zones=['wall', 'floor', 'rug', 'sofa', 'table', 'wood', 'metal'],
                   priority=['metal', 'table', 'sofa', 'rug', 'wood', 'floor', 'wall']),
    'kitchen': dict(src='1L6z-fyorw1bnO', zones=['wall', 'floor', 'island', 'top', 'splash', 'stool', 'cab'],
                    priority=['stool', 'top', 'island', 'cab', 'splash', 'floor', 'wall'], opening={'island': 5}),
    'bedroom': dict(src='1Ijh6SNyDO4SON', zones=['wall', 'floor', 'rug', 'bed', 'chair', 'curtain'],
                    priority=['chair', 'bed', 'rug', 'curtain', 'floor', 'wall']),
}


def lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def guided(I, p, r=4, eps=2e-3):
    """Guided filter (He et al.): притискає мʼякий край маски до країв фото."""
    f = lambda x: uniform_filter(x, size=2 * r + 1, mode='reflect')
    mI, mp = f(I), f(p)
    a = (f(I * p) - mI * mp) / (f(I * I) - mI * mI + eps)
    b = mp - a * mI
    return np.clip(f(a) * I + f(b), 0, 1)


def bake(room, cfg, prompts):
    src = os.path.join(ROOT, 'img', 'p', cfg['src'] + '-900.webp')
    im = Image.open(src).convert('RGB')
    W, H = im.size
    rgb = np.asarray(im).astype(np.float64) / 255
    L = (lin(rgb) @ np.array([0.2126, 0.7152, 0.0722]))
    gray = rgb @ np.array([0.299, 0.587, 0.114])

    raw = {}
    for z in cfg['zones']:
        m = np.asarray(Image.open(os.path.join(HERE, 'masks', f'm_{room}_{z}.png'))).astype(np.float64) / 255
        # обрізати рамками підказок (+8 px): SAM інколи «протікає» за межі обʼєкта
        clip = np.zeros_like(m)
        for part in prompts[room][z]:
            if 'box' in part:
                x0, y0, x1, y1 = part['box']
                clip[max(0, y0 - 8):min(H, y1 + 8), max(0, x0 - 8):min(W, x1 + 8)] = 1
        m = m * clip
        k = cfg.get('opening', {}).get(z)
        if k:  # прибрати тонкі деталі (ніжки стільців перед островом)
            mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
            m = np.asarray(mi).astype(np.float64) / 255
        # невелике розширення: фон (стіни/підлога/штори) заходить під передній план, предмети — на 2 px,
        # щоб між зонами не лишалося світлих «ореолів» оригіналу (пріоритет нижче розводить перекриття)
        g = 9 if z in ('wall', 'floor', 'curtain') else 5
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(g))).astype(np.float64) / 255 * clip
        m = guided(gray, m)
        m = np.clip((m - 0.5) * 1.6 + 0.5, 0, 1)  # трохи чіткіший край після фільтра
        m = np.round(m * 32) / 32  # 33 рівні краю — досить для мʼякого переходу, а lossless стискається краще
        raw[z] = m

    # пріоритети: кожен піксель розподіляється між зонами не більше ніж на 1
    free = np.ones((H, W))
    final = {}
    for z in cfg['priority']:
        m = np.minimum(raw[z], free)
        final[z] = m
        free = free - m

    # згладжена яскравість у межах кожної зони (масковане розмиття), поза зонами — оригінал
    sig = 9.0
    Ls = L.copy() * free
    for z, m in final.items():
        num = gaussian_filter(L * m, sig); den = gaussian_filter(m, sig) + 1e-6
        Ls += (num / den) * m
    Ls = np.clip(Ls, 0, 1)

    zones = []
    tiles = np.zeros((3, H, W, 3))
    for i, z in enumerate(cfg['zones']):
        m = final[z]
        if i < 6:
            tiles[i // 3, :, :, i % 3] = m
        elif i == 6:
            tiles[2, :, :, 0] = m
        else:
            tiles[2, :, :, 2] = m
        w = m.sum() + 1e-6
        ys, xs = np.nonzero(m > 0.5)
        zones.append(dict(id=z, mean=round(float((L * m).sum() / w), 4),
                          cx=round(float((np.arange(W)[None, :] * m).sum() / w / W), 4),
                          cy=round(float((np.arange(H)[:, None] * m).sum() / w / H), 4),
                          box=[round(xs.min() / W, 3), round(ys.min() / H, 3), round(xs.max() / W, 3), round(ys.max() / H, 3)] if len(xs) else [0, 0, 1, 1],
                          area=round(float(m.mean()), 4)))
    # згладжена яскравість — окремим маленьким файлом (вона і так розмита, 1/3 роздільності достатньо)
    sm = Image.fromarray((srgb(Ls) * 255 + 0.5).astype(np.uint8), 'L').resize((W // 3, H // 3), Image.LANCZOS)
    sm.convert('RGB').save(os.path.join(OUT, f'{room}-s.webp'), 'WEBP', quality=90, method=6)
    atlas = (np.concatenate(list(tiles), 0) * 255 + 0.5).astype(np.uint8)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(atlas, 'RGB').save(os.path.join(OUT, f'{room}-m.webp'), 'WEBP', lossless=True, quality=100, method=6)
    shutil.copyfile(src, os.path.join(OUT, f'{room}-900.webp'))
    up = os.path.join(HERE, 'up', f'{room}_x2.png')
    if os.path.exists(up):
        Image.open(up).convert('RGB').save(os.path.join(OUT, f'{room}-1800.webp'), 'WEBP', quality=74, method=6)
    sizes = {f: os.path.getsize(os.path.join(OUT, f)) // 1024 for f in os.listdir(OUT) if f.startswith(room + '-')}
    print(room, W, H, sizes)
    return dict(w=W, h=H, hi=os.path.exists(up), zones=zones)


if __name__ == '__main__':
    prompts = json.load(open(os.path.join(HERE, 'prompts.json')))
    scene = {r: bake(r, c, prompts) for r, c in ROOMS.items()}
    json.dump(scene, open(os.path.join(HERE, 'scene.json'), 'w'), ensure_ascii=False, indent=1)
    print('scene.json:', {r: [z['id'] for z in s['zones']] for r, s in scene.items()})
