#!/usr/bin/env python3
"""Процедурні тайлові текстури для /konfigurator (без сторонніх стоків).

  python3 tools/konfigurator/textures.py      # → assets/konfigurator/tex/*.webp

Кожна текстура — безшовний тайл RGB, який шейдер «фарбує» двома кольорами матеріалу:
  R — маска візерунка (жилки мармуру, волокна дерева, крихта тераццо) → mix(c1, c2, R)
  G — дрібна варіація яскравості (≈0.5 = без змін) → альбедо × (0.7 + 0.6·G)
  B — запас (0)
Так одна текстура дає кілька матеріалів: мармур Calacatta / Nero / Verde, дуб світлий / копчений / горіх тощо.
Потрібні numpy і Pillow (системний python3).
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'konfigurator', 'tex')
RNG = np.random.default_rng(2016)


def spectral(n, beta=2.0, fx=1.0, fy=1.0, lo=1.0, hi=None, seed=None):
    """Безшовний шум 1/f^beta (FFT), анізотропія fx/fy (fx>fy — витягнуто вздовж x). Нормалізовано в [0,1]."""
    r = np.random.default_rng(seed) if seed is not None else RNG
    w = r.standard_normal((n, n))
    ky = np.fft.fftfreq(n)[:, None] * n
    kx = np.fft.fftfreq(n)[None, :] * n
    k = np.sqrt((kx * fx) ** 2 + (ky * fy) ** 2)
    k[0, 0] = 1
    f = 1.0 / k ** (beta / 2)
    f[k < lo] = 0
    if hi:
        f *= np.exp(-(k / hi) ** 2)
    a = np.real(np.fft.ifft2(np.fft.fft2(w) * f))
    a -= a.min(); a /= a.max() + 1e-9
    return a


def sample(tex, u, v):
    """Білінійна вибірка з періодичним загортанням (u, v у пікселях тайла)."""
    n = tex.shape[0]
    u = np.mod(u, n); v = np.mod(v, n)
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int)
    fx = u - x0; fy = v - y0
    x1 = (x0 + 1) % n; y1 = (y0 + 1) % n
    return (tex[y0, x0] * (1 - fx) * (1 - fy) + tex[y0, x1] * fx * (1 - fy)
            + tex[y1, x0] * (1 - fx) * fy + tex[y1, x1] * fx * fy)


Q = {'planks': 62, 'herring': 62, 'linen': 60, 'veneer': 66}


def save(name, r, g, b=None):
    rgb = np.stack([r, g, np.zeros_like(r) if b is None else b], -1)
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255 + .5).astype(np.uint8), 'RGB')
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + '.webp')
    im.save(p, 'WEBP', quality=Q.get(name, 78), method=6)
    print(name, im.size, os.path.getsize(p) // 1024, 'KB')


def hash01(*a):
    h = np.zeros_like(np.asarray(a[0], dtype=np.float64))
    for i, x in enumerate(a):
        h = h + np.asarray(x, dtype=np.float64) * (12.9898 + 78.233 * i)
    return np.mod(np.sin(h) * 43758.5453, 1.0)


# ── дерево: волокна для дощок ──────────────────────────────────────────────
GRAIN_N = 1024
_streak = spectral(GRAIN_N, beta=1.3, fx=0.012, fy=1.0, lo=3, seed=11)      # довгі прямі волокна вздовж x
_streak2 = spectral(GRAIN_N, beta=2.0, fx=0.03, fy=1.0, lo=2, seed=14)
_warp = spectral(GRAIN_N, beta=3.4, fx=1.0, fy=1.0, lo=1, seed=12)          # повільний вигин «соборного» малюнка
_tone = spectral(GRAIN_N, beta=2.6, lo=1, seed=13)


def wood(along, across, pid, width_px, figure=True):
    """Волокна однієї дошки: along/across — координати в пікселях, pid — id дошки (для зсуву)."""
    ox = hash01(pid, 1.0) * GRAIN_N; oy = hash01(pid, 2.0) * GRAIN_N
    t = across / width_px
    bend = (sample(_warp, along * 0.35 + ox, oy) - 0.5) * 2.2   # вигин залежить лише від along → арки
    ph = (t - 0.5) ** 2 * (2 + 3 * hash01(pid, 3.0)) + bend
    arches = 0.5 + 0.5 * np.cos(ph * np.pi * 2 * (2 + 2 * hash01(pid, 5.0)))
    arches = arches ** 4 * (hash01(pid, 6.0) > 0.35) * figure
    streak = sample(_streak, along + ox, across * 1.3 + oy)
    streak2 = sample(_streak2, along * 0.7 + ox, across + oy)
    r = np.clip(0.30 * arches + 0.55 * np.clip((streak - 0.35) * 1.6, 0, 1) ** 1.4 + 0.15 * streak2, 0, 1) * 0.75
    plank_tone = 0.5 + (hash01(pid, 4.0) - 0.5) * 0.30
    g = np.clip(plank_tone + (sample(_tone, along * 0.5 + ox, across * 0.5 + oy) - 0.5) * 0.25, 0, 1)
    return r, g


def planks(n=1024, rows=10, lengths=(2.5, 4.5)):
    """Прямі дошки вздовж x (у шейдері — вздовж глибини), стики врозбіг, тонкі шви."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    rw = n / rows
    row = np.floor(y / rw)
    across = y - row * rw
    # межі дошок у кожному ряду: періодичні по x
    R = np.zeros((n, n)); G = np.zeros((n, n)); gap = np.ones((n, n))
    for ri in range(rows):
        m = row == ri
        off = hash01(ri, 7.0) * n
        # розбивка довжини тайла на дошки
        cuts, pos, k = [], 0.0, 0
        while pos < n - rw * lengths[0]:
            L = rw * (lengths[0] + (lengths[1] - lengths[0]) * hash01(ri, k, 9.0))
            cuts.append(pos); pos += L; k += 1
        cuts = np.array(cuts)
        xx = np.mod(x[m] - off, n)
        idx = np.searchsorted(cuts, xx, side='right') - 1
        start = cuts[idx]
        along = xx - start
        end = np.append(cuts[1:], n)[idx]
        pid = ri * 100 + idx
        r, g = wood(along, across[m], pid, rw)
        R[m] = r; G[m] = g
        d = np.minimum(along, end - xx)
        gap[m] = np.clip(np.minimum(d, np.minimum(across[m], rw - across[m])) / 1.6, 0, 1)
    G = G * (0.55 + 0.45 * gap)
    R = R * gap + (1 - gap) * 0.95
    return R, G


def herringbone(n=1024, N=5):
    """Ялинка 1:N, повернута на 45° (класична «ялинка»), безшовна: тайл = √2·N ширин дошки."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    S = np.sqrt(2) * N
    px = x / n * S; py = y / n * S
    u = (px + py) / np.sqrt(2); v = (py - px) / np.sqrt(2)
    cx = np.floor(u); cy = np.floor(v)
    s = np.floor((cx - cy + N) / (2 * N))
    mp = cx - (cy - N) - 2 * N * s
    horiz = mp >= N
    along = np.where(horiz, (cx - (cy + 2 * N * s)) + (u - cx), 0.0)
    k = cx - 2 * N * s
    along = np.where(horiz, along, v - (k + 1))
    across = np.where(horiz, v - cy, u - cx)
    pid = np.where(horiz, cy * 3.1 + s * 17.3, k * 5.7 + s * 23.9 + 0.5)
    pw = n / S  # пікселів на ширину дошки
    r, g = wood(along * pw, across * pw, pid, pw)
    dl = np.minimum(along, N - along) * pw; dc = np.minimum(across, 1 - across) * pw
    gap = np.clip(np.minimum(dl, dc) / 1.4, 0, 1)
    g = g * (0.55 + 0.45 * gap)
    r = r * gap + (1 - gap) * 0.95
    return r, g


def veneer(n=512):
    """Шпон для фасадів: вертикальні волокна без швів."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    r, g = wood(y * 2, x * 2, np.zeros_like(x) + 3, n / 2, figure=False)
    return r, g


def marble(n=1024):
    """Мармур: мʼякі тонкі жилки з розмитим ореолом (R), хмарність основи (G).
    Без різких «блискавок»: плавніший вигин (менша амплітуда й частота деформації), тонке приглушене ядро,
    широкий напівпрозорий ореол і легка хмарність (Calacatta / Nero Marquina / Verde — одна текстура, QA 25.10)."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    w1 = spectral(n, beta=3.8, lo=1, hi=6, seed=21); w2 = spectral(n, beta=3.2, lo=1, hi=10, seed=22)
    w3 = spectral(n, beta=2.4, lo=3, hi=24, seed=25)
    base = spectral(n, beta=2.8, lo=1, seed=23)
    fine = spectral(n, beta=1.8, lo=6, seed=24)
    t = (x * 1.0 + y * 0.45) / n * 2 * np.pi * 2 + (w1 - 0.5) * 4.2 + (w2 - 0.5) * 1.3 + (w3 - 0.5) * 0.18
    ridge = np.abs(np.sin(t / 2))            # 0 на жилці
    fade = np.clip(0.35 + (w2 - 0.3) * 1.2, 0.25, 1)  # жилка то яскравіша, то майже зникає
    core = np.exp(-(ridge / 0.012) ** 2) * 0.42
    soft = np.exp(-(ridge / 0.05) ** 2) * 0.22
    halo = np.exp(-(ridge / 0.22) ** 2) * 0.14
    t2 = (x * 0.3 - y * 1.0) / n * 2 * np.pi * 3 + (w2 - 0.5) * 6 + (w3 - 0.5) * 0.3
    r2 = np.abs(np.sin(t2 / 2))
    thin = np.exp(-(r2 / 0.009) ** 2) * np.clip((w1 - 0.4) * 2.5, 0, 1) * 0.28
    cloud = np.clip((base - 0.5) * 0.18 + 0.05, 0, 1)
    R = np.clip((core * (0.6 + 0.25 * fine) + soft + halo) * fade + thin + cloud, 0, 1)
    G = np.clip(0.5 + (base - 0.5) * 0.30 + (fine - 0.5) * 0.06, 0, 1)
    return R, G


def travertine(n=512):
    """Травертин: горизонтальні шари (R — темніші прожилки/пори), G — варіація."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    layers = spectral(n, beta=2.2, fx=0.04, fy=1.0, lo=1, seed=31)
    pores = spectral(n, beta=0.8, fx=0.25, fy=1.0, lo=30, seed=32)
    R = np.clip((layers - 0.45) * 2.0, 0, 1) * 0.75 + np.clip((pores - 0.74) * 5, 0, 1) * 0.9
    G = np.clip(0.5 + (spectral(n, beta=2.0, lo=1, seed=33) - 0.5) * 0.3, 0, 1)
    return np.clip(R, 0, 1), G


def terrazzo(n=512):
    """Тераццо: R — маска крихти, G — тон крихти (світла/темна)."""
    R = np.zeros((n, n)); G = np.full((n, n), 0.5)
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    r = np.random.default_rng(41)
    for _ in range(380):
        cx, cy = r.uniform(0, n, 2); rad = r.uniform(1.5, 6) if r.random() < .88 else r.uniform(7, 13)
        ang = r.uniform(0, np.pi); e = r.uniform(.5, 1)
        dx = np.mod(x - cx + n / 2, n) - n / 2; dy = np.mod(y - cy + n / 2, n) - n / 2
        a = dx * np.cos(ang) + dy * np.sin(ang); b = (-dx * np.sin(ang) + dy * np.cos(ang)) / e
        # «гранований» камінчик: суперелліпс із шумом
        d = (np.abs(a) ** 1.3 + np.abs(b) ** 1.3) ** (1 / 1.3)
        m = d < rad
        R[m] = 1; G[m] = r.choice([0.12, 0.35, 0.8, 0.95, 0.6])
    G = np.where(R > 0, G, 0.5 + (spectral(n, beta=1.2, lo=20, seed=42) - 0.5) * 0.12)
    return R, G


def microcement(n=512):
    a = spectral(n, beta=2.8, lo=1, seed=51); b = spectral(n, beta=1.0, lo=40, seed=52)
    return np.clip((a - 0.5) * 1.2 + 0.5, 0, 1) * 0.0, np.clip(0.5 + (a - 0.5) * 0.45 + (b - 0.5) * 0.08, 0, 1)


def boucle(n=512):
    """Букле: петельки — горбики з тінню (G), R не використовується."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    G = np.zeros((n, n))
    r = np.random.default_rng(61)
    big = spectral(n, beta=1.0, lo=24, hi=60, seed=62)
    G = 0.5 + (big - 0.5) * 1.1
    small = spectral(n, beta=0.5, lo=60, hi=140, seed=63)
    G = np.clip(G * 0.7 + small * 0.45 - 0.1, 0, 1)
    return np.zeros((n, n)), G


def velvet(n=512):
    a = spectral(n, beta=2.4, lo=2, seed=71); b = spectral(n, beta=1.0, lo=60, seed=72)
    return np.zeros((n, n)), np.clip(0.5 + (a - 0.5) * 0.28 + (b - 0.5) * 0.06, 0, 1)


def linen(n=512):
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    wx = spectral(n, beta=1.2, fx=0.02, fy=1.0, lo=40, seed=81)
    wy = spectral(n, beta=1.2, fx=1.0, fy=0.02, lo=40, seed=82)
    weave = 0.5 + 0.5 * np.sin(x / n * 2 * np.pi * 128) * np.sin(y / n * 2 * np.pi * 128)
    G = np.clip(0.5 + (wx - 0.5) * 0.5 + (wy - 0.5) * 0.5 + (weave - 0.5) * 0.12, 0, 1)
    return np.zeros((n, n)), G


if __name__ == '__main__':
    save('planks', *planks())
    save('herring', *herringbone())
    save('veneer', *veneer())
    save('marble', *marble())
    save('travertine', *travertine())
    save('terrazzo', *terrazzo())
    save('micro', *microcement())
    save('boucle', *boucle())
    save('velvet', *velvet())
    save('linen', *linen())
