#!/usr/bin/env python3
"""Різкі фото на ПК, Retina і телефонах (Михайло 05.11.2026: «покращити якість фото на сторінці для ПК, бо все розмите»).

Викликає chrome.apply() (як ux.py) — тож працює для всіх генераторів і ручних сторінок; ідемпотентно.
Для кожного <img> у відомому слоті (за класами предків) ставить:
  srcset — усі ширини тієї ж бази на диску з тією ж пропорцією (img/p/<id>-<w>.webp, img/<id>-<w|r w>.webp, img/svc-<x>-<w>.webp),
           лише ті, що можуть знадобитися (від потрібного на 1x до потрібного на 2x ПК / 3x телефон);
  sizes  — реальна ширина слота на кожному брейкпоінті (модель CSS: sections.v1.css + «Широкі екрани» в site-chrome.v1.css:
           корінь 16 px до 1366, далі clamp(16px, .5025vw + 9.14px, 24px), --cw = clamp(1080px, 60vw + 336px, 2400px)),
           помножена на коефіцієнт обрізки object-fit:cover (альбомне фото в портретній клітинці 4:5 потребує ширшого файла).
Браузер бере файл ≥ ширина слота × DPR. Нові великі копії — tools/img/originals.py, AVIF — tools/img/build.py,
<source type="image/avif"> з тими самими srcset/sizes — деплой (tools/img/picture.py).

Слоти: strip (.xs-st; головна — .hx-home), proj (.xs-proj .xs-st, портфоліо: коротко data-p — лише ширини для ПК 1x/2x і телефона 3x, відкладено site-chrome.v1.js),
covers (.xs-cv), sp (.xs-cvsp — простора карусель головних), svc (.xs-sv, з урахуванням flex-рядів; на головній — карусель), split (.xs-pic), pg (галерея /proekty, компактно), hero (.hx — лише ширші файли),
gal (.gal лендингів), af / agf (фото статей блогу), tph (фото на сторінках дизайнера, captions.py),
hxl (hero лендингів, tools/site/ux.py _hero_photo: телефон — кадр 4:5 у блоці ≤125vw заввишки, ПК — 2:1 у блоці ≤50vw; слот = 100vw, srcset ставить ux.py).
Перевірка: python3 tools/site/sharp.py --check (сторінки, де apply() щось змінив би).
"""
import math, os, re, sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VOID = {'img', 'br', 'hr', 'meta', 'link', 'input', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track', 'base'}
TAG = re.compile(r'<!--.*?-->|<(script|style)\b.*?</\1\s*>|<(/?)([a-zA-Z][\w:-]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>', re.S)
CLS = re.compile(r'\bclass="([^"]*)"')
_SZ, _FAM = {}, {}
_CASE = False  # сторінка /proekty (proekt.v1.css) — ставить apply()


# ---------- модель верстки (px CSS) ----------
def rem(vw):
    return 16.0 if vw <= 1366 else min(24.0, max(16.0, .005025 * vw + 9.14))


def cont(vw):
    """Ширина вмісту .w (без бокових відступів)."""
    if vw <= 767: return vw - 32
    if vw <= 1366: return min(vw - 34, 1046)
    cw = min(2400, max(1080, .6 * vw + 336))
    return cw - 2 * min(40, max(16, 1.5 * rem(vw)))


def _grid(vw, c):
    if vw <= 1023: return None
    if vw <= 1366: return (c - 30) / 4
    if vw <= 2199: return (c - 48) / 5
    return (c - 70) / 6


def w_strip(vw, home):
    c = cont(vw)
    if vw <= 767: return .46 * c if home else min(.66 * vw, 280)
    if home:  # головні на ПК (sections.v1.css, 09.11.2026): стрічка на всю ширину вікна, 4 / 6 (з 1024) / 7 (з 1600) кадрів у ряд
        n, g = (4, 10) if vw <= 1023 else (6, 12) if vw <= 1599 else (7, 12 if vw <= 2199 else 14)
        return (vw - (n - 1) * g) / n
    return _grid(vw, c) or 280


def w_covers(vw):
    c = cont(vw)
    if vw <= 767: return .8 * c
    if vw <= 1099: return (c - 24) / 3
    if vw <= 1699: return (c - 36) / 4
    return (c - 48) / 5


def w_sp(vw):
    """«Простора» карусель проєктів головних (sections.v1.css .xs-cvsp, 24.11.2026): телефон — кадр на всю ширину вікна × 72svh (типовий телефон —
    висота ≈ 2.17 × ширина, кадр ≈ 0.62:1); планшет — 44 % ряду, кадр ≈ 0.5:1; ПК — 44 % × 68svh ≈ 1:1. → (ширина, пропорція слота);
    обрізку object-fit:cover за пропорцією файла рахує cov() (альбомне фото в книжковому кадрі — ширший файл). × 1.08 — запас під Ken Burns."""
    if vw <= 767: return vw, .62
    return .44 * (vw - 32), (.5 if vw < 1200 else 1.05)  # планшети (книжкова орієнтація, вікно ≈ 1.3 × ширина) — кадр вужчий; ПК — ≈ 1:1


def w_split(vw):
    """Фото + текст (sections.v1.css, 24.11.2026): з 768 px — дві рівні колонки 50/50 з gap 2rem, фото object-fit:cover на всю висоту
    блоку (≥ clamp(18rem, 30vw, 32rem)) — ширина слота = половина ряду."""
    c = cont(vw)
    if vw <= 767: return c
    return (c - 2 * rem(vw)) / 2


def w_svc(vw, i, n, home):
    """Ширина й пропорція клітинки картки i з n (flex-wrap: basis 13rem, gap 16px; телефон — 2 колонки, головна — ряд зі свайпом)."""
    c = cont(vw)
    if home and vw <= 767: return .44 * c, 4 / 3
    if home:  # головна — карусель (sections.v1.css): 3 картки в ряду до 1099 px, далі 4; gap 1rem; img max-height 12rem
        w = (c - 2 * rem(vw)) / 3 if vw <= 1099 else (c - 3 * rem(vw)) / 4
        return w, max(1.6, w / (12 * rem(vw)))
    if vw <= 599:
        if n % 2 and i == n - 1: return c, 16 / 7
        return (c - 10) / 2, 4 / 3
    k = 5 if n == 5 and vw >= 1367 else 3  # sections.v1.css (11.11.2026): 5 карток — 3 + 2, з 1367 — 5 в ряд; 6 — 3 + 3
    row = i // k; r = min(k, n - row * k)
    w = (c - (r - 1) * 16) / r
    if vw >= 1367: w = min(w, 48 * rem(vw))
    return w, max(1.6, w / (12 * rem(vw)))


def w_gal(vw):
    """Галерея лендингів (.gal: auto-fill minmax(240px,1fr), gap 10; до 599 — 2 колонки, gap 6; рамка 1 px), кадр 4:3."""
    c = cont(vw)
    if vw <= 599: return (c - 6) / 2 - 2
    n = max(1, int((c + 10) // 250))
    return (c - (n - 1) * 10) / n - 2


def w_af(vw):
    """Фото статті блогу (figure.af — колонка тексту ~47.9rem) і пара фото (.ag2 .agf, gap 12)."""
    return min(vw - 34, 47.9 * rem(vw))


def w_pg(vw):
    c = cont(vw)
    if vw <= 599: return (c - 6) / 2
    if vw <= 767: return c
    return 360


# ---------- файли ----------
def size(rel):
    if rel not in _SZ:
        p = os.path.join(ROOT, rel)
        _SZ[rel] = Image.open(p).size if os.path.exists(p) else None
    return _SZ[rel]


def family(src):
    """[(ширина, '/шлях')] тієї ж бази й пропорції, що й src (без мобільних кадрів m…)."""
    m = re.match(r'/(img/(?:p/)?[^/]+?)-r?\d+\.webp$', src)
    if not m or not size(src[1:]): return []
    base = m.group(1)
    if base not in _FAM:
        d, n = os.path.split(os.path.join(ROOT, base))
        out = {}
        for f in sorted(os.listdir(d)):
            mm = re.fullmatch(re.escape(n) + r'-(r?)(\d+)\.webp', f)
            if not mm: continue
            rel = os.path.relpath(os.path.join(d, f), ROOT)
            w, h = size(rel)
            out.setdefault((w, h), '/' + rel.replace(os.sep, '/')) if not mm.group(1) else out.setdefault((w, h), '/' + rel.replace(os.sep, '/'))
        _FAM[base] = out
    w0, h0 = size(src[1:])
    return sorted({w: p for (w, h), p in _FAM[base].items() if abs(w / h - w0 / h0) < .02}.items())


# ---------- sizes ----------
BPS = [424, 599, 767, 1023, 1099, 1366, 1699, 2199]
SLOT_BPS = {'strip': [767, 1023, 1366, 2199], 'covers': [767, 1099, 1366, 1699], 'split': [767, 1023, 1366],
            'af': [800, 1366], 'agf': [800, 1366], 'tph': [767],
            'svc': [599, 767, 1099, 1366], 'sp': [767]}


def _fmt(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')


def sizes(fn, bps=BPS):
    """fn(vw) → потрібна ширина файла в CSS px. Інтервали між брейкпоінтами (і точками зміни рядів) — px або calc(a·vw + b)."""
    xs = sorted(set(range(320, 3841, 4)) | set(bps) | {b + 1 for b in bps})
    ys = [fn(x) for x in xs]
    cuts = set(bps)
    for k in range(1, len(xs)):  # стрибки (зміна кількості в ряду) — теж межа інтервалу; точна межа — бісекцією
        if abs(ys[k] - ys[k - 1]) > max(6, .04 * ys[k - 1]):
            a, b = xs[k - 1], xs[k]
            while b - a > 1:
                c = (a + b) // 2
                if abs(fn(c) - ys[k - 1]) <= max(6, .04 * ys[k - 1]): a = c
                else: b = c
            cuts.add(a)
    cuts = sorted(c for c in cuts if c < 3840)
    parts, lo = [], 320
    for hi in cuts + [3840]:
        seg = [(x, y) for x, y in zip(xs, ys) if lo <= x <= hi]
        if seg:
            vs = [y for _, y in seg]
            if max(vs) - min(vs) <= .05 * max(vs):
                val = f'{math.ceil(max(vs))}px'
            else:
                (x0, y0), (x1, y1) = seg[0], seg[-1]
                a = (y1 - y0) / (x1 - x0) if x1 != x0 else 0
                b = max(y - a * x for x, y in seg)
                av = a * 100
                val = (f'{_fmt(math.ceil(av * 10) / 10)}vw' if abs(b) < 4 else
                       f'calc({_fmt(round(av, 1))}vw {"+" if b >= 0 else "-"} {math.ceil(abs(b))}px)')
            parts.append([hi if hi < 3840 else None, val])
        lo = hi + 1
    out = []
    for hi, val in parts:  # зливаємо сусідні однакові
        if out and out[-1][1] == val: out[-1][0] = hi
        else: out.append([hi, val])
    return ', '.join((f'(max-width:{hi}px) {v}' if hi else v) for hi, v in out)


def need(fn):
    """(мінімум на 1x, максимум на 2x ПК / 3x телефон) — ширини файла, що можуть знадобитися."""
    lo = min(fn(x) for x in range(320, 3841, 8))
    hi = max(max(fn(x) * (3 if x <= 767 else 2 if x <= 2560 else 1) for x in range(320, 3841, 8)), 1)
    return lo, hi


def pick(fam, lo, hi):
    ws = [w for w, _ in fam]
    a = max([w for w in ws if w <= lo] or ws[:1])
    b = min([w for w in ws if w >= hi] or ws[-1:])
    return [(w, p) for w, p in fam if a <= w <= b]


# ---------- розмітка ----------
def _slot(anc):
    """anc — класи предків від найближчого. → (слот, індекс предка-контейнера)"""
    for k, c in enumerate(anc):
        if 'xs-st' in c: return (('projw' if 'wd' in anc[0] else 'proj') if any('xs-proj' in x for x in anc[k:]) else 'strip'), k
        if 'xs-cvsp' in c: return 'sp', k
        if 'xs-cv' in c: return 'covers', k
        if 'xs-sv' in c: return 'svc', k
        if 'xs-pic' in c: return 'split', k
        if 'pg' in c: return 'pg', k
        if 'gal' in c: return 'gal', k  # warn-fix 16.11.2026: галереї лендингів, фото статей, фото «Про дизайнера» — без srcset були розмиті на 768@2 / 2560
        if 'agf' in c: return 'agf', k
        if 'af' in c: return 'af', k
        if 'tph' in c: return 'tph', k
        if 'hx-bg' in c or 'hx' in c or 'hxl' in c: return ('hxl' if any('hxl' in x for x in anc[k:]) else 'hero'), k
        if k == 0 and {'w', 'hero'} <= c: return 'hero', k  # головне фото /proekty (img — пряма дитина .w.hero): ширші копії для ПК/телефона 3x
    return None, None


def _scan(s):
    """[(start, end, tag, slot, container_pos)] для <img> у слотах."""
    stack, out = [], []
    for m in TAG.finditer(s):
        if m.group(1) or m.group(0).startswith('<!--'): continue
        close, name, attrs = m.group(2), m.group(3).lower(), m.group(4)
        if close:
            for j in range(len(stack) - 1, -1, -1):
                if stack[j][0] == name:
                    del stack[j:]; break
            continue
        cl = set((CLS.search(attrs) or [None, ''])[1].split()) if 'class=' in attrs else set()
        if name == 'img':
            anc = [x[1] for x in reversed(stack)]
            slot, k = _slot(anc)
            if slot: out.append((m.start(), m.end(), m.group(0), slot, stack[len(stack) - 1 - k][2]))
            continue
        if name in VOID or attrs.rstrip().endswith('/'): continue
        stack.append((name, cl, m.start()))
    return out


def _attr(tag, name, val):
    rx = re.compile(r'\s' + name + r'="[^"]*"')
    if val is None: return rx.sub('', tag)
    if rx.search(tag): return rx.sub(lambda _: f' {name}="{val}"', tag, count=1)
    return re.sub(r'\s(loading|decoding|width|alt)=', lambda m: f' {name}="{val}"' + m.group(0), tag, count=1)


def fix(tag, slot, home, i=0, n=1):
    if re.search(r'\sid="', tag): return tag
    src = re.search(r'\ssrc="([^"]+)"', tag)
    if not src: return tag
    fam = family(src.group(1))
    if not fam: return tag
    iw, ih = fam[-1][0], fam[-1][0] * size(src.group(1)[1:])[1] / size(src.group(1)[1:])[0]
    ar = iw / ih
    cov = lambda w, sar: w * max(1.0, ar / sar)
    if slot == 'hxl':  # hero лендингів (ux.py _hero_photo): кадр ≤ пропорції файла (CSS .hxl), тож слот = 100vw без обрізки — sizes за замовчуванням
        return tag
    if slot == 'hero':  # перше фото: sizes лишаємо (100vw / 60vw), додаємо ширші файли тієї ж пропорції
        if not re.search(r'\ssrcset="', tag): return tag
        tag = _attr(tag, 'srcset', ', '.join(f'{p} {w}w' for w, p in fam if w >= 400))
        if _CASE and 'max-width:900px' in tag:
            # головне фото /proekty (proekt.v1.css: width:auto, max-width:100%, max-height:min(80svh,56rem)): слот = min(вміст .w, ширина з атрибута + рамка,
            # 0.8 × висота вікна × пропорція). Було «100vw, 900px»: 402@3 → 1206 px → файл 1600w замість 1200w (Monpark 208 → 134 КБ),
            # портретне фото на ПК 2x — 1920w замість 1200w; LCP телефона 2.4–4.2 с (аудит 20.11.2026). Без min() — щоб розумів і старий Safari.
            wa = min(int((re.search(r'\swidth="(\d+)"', tag) or [0, 900])[1]), 900) + 2
            vh = 80 * ar
            desk = (f'{wa}px' if 480 * ar >= wa else
                    f'{_fmt(math.ceil(vh * 10) / 10)}vh' if 1400 * .8 * ar <= wa else
                    f'(max-height:{math.floor(wa / (.8 * ar))}px) {_fmt(math.ceil(vh * 10) / 10)}vh, {wa}px')
            tag = _attr(tag, 'sizes', f'(max-width:767px) calc(100vw - 32px), {desk}')
        return tag
    if slot == 'strip': fn = lambda vw: cov(w_strip(vw, home), .8)
    elif slot == 'covers': fn = lambda vw: cov(w_covers(vw), .8)
    elif slot == 'sp': fn = lambda vw: cov(*w_sp(vw)) * 1.08
    elif slot == 'split': fn = w_split
    elif slot == 'svc': fn = lambda vw: cov(*w_svc(vw, i, n, home))
    elif slot == 'gal':  # коротко (бюджет HTML лендингів 64 КБ): srcset лише коли src (900) замалий — «900w, найменша достатня»; × обрізка 4:3
        f = max(1.0, ar / (4 / 3))
        cur = size(src.group(1)[1:])[0]
        hi = max(cov(w_gal(vw), 4 / 3) * (3 if vw <= 430 else 2) for vw in range(320, 3841, 8))  # DPR 3 — телефони ≤ 430, далі 2
        if cur >= .95 * hi or not [w for w, _ in fam if w > cur]:
            return _attr(_attr(tag, 'srcset', None), 'sizes', None)
        big = next(((w, p) for w, p in fam if w >= .95 * hi), fam[-1])
        cand = [(w, p) for w, p in fam if w == cur] + [big]
        return _attr(_attr(tag, 'srcset', ', '.join(f'{p} {w}w' for w, p in cand)), 'sizes', f'(max-width:773px) {_fmt(50 * f)}vw, {math.ceil(322 * f)}px')
    elif slot == 'af': fn = w_af
    elif slot == 'agf': fn = lambda vw: cov((w_af(vw) - 12) / 2, .8)
    elif slot == 'tph': fn = lambda vw: cov(min(cont(vw), 760) - 2, 1.5)
    elif slot in ('proj', 'projw'):  # портфоліо: ~620 фото, бюджет HTML — sizes з двох частин і лише ті ширини, що справді потрібні
        # клітинка .xs-proj .xs-st: min(66vw, 280px), кадр 3:4; a.wd (альбомне, rich._wd) — дві клітинки + gap 10, та сама висота.
        # Файл має покрити cover: max(ширина кадру, висота × пропорція фото). Кандидати — найменші файли ≥ 0.95 × потреба
        # на ПК 1x / 2x і телефоні 3x (клітинка ≤ 280 px: 402@3 → 265 px), тож телефон 3x бере велику копію, ПК 1x — малу (аудит 18.11.2026:
        # раніше лише 400/900 за назвою — на 402@3 альбомні кадри й «900» без апскейлу (762 px) були розмиті).
        wd = slot == 'projw'
        need_px = lambda c: max(2 * c + 10 if wd else c, c * 4 / 3 * ar)
        cand = []
        for t in (need_px(280), 2 * need_px(280), 3 * need_px(280)):
            x = next(((w, p) for w, p in fam if w >= .95 * t and w >= 380), fam[-1])
            if x not in cand: cand.append(x)
        cand.sort()
        cand = [x for k, x in enumerate(cand) if k == len(cand) - 1 or cand[k + 1][0] > 1.25 * x[0]]  # сусідні ширини (1600/1685, 1600/1920) — лише більша: коротше
        ph = max(1.32 if wd else .66, .88 * ar) * 100  # телефон ≤ 424: потреба в vw (+10 px gap для широкого кадру)
        phs = f'calc({_fmt(math.ceil(ph * 10) / 10)}vw + 10px)' if wd and ph <= 132.05 else f'{_fmt(math.ceil(ph * 10) / 10)}vw'
        sz = f'(max-width:424px) {phs}, {math.ceil(need_px(280))}px'
        # відкладено (як плитки LIGHT): data-p="<id>:<назва>[=<ширина>],…" — site-chrome.v1.js ставить srcset за ~350 px до кадру,
        # а не нативний lazy (на повільній мережі Chrome тягне за ~2500 px — великі копії 3x забирали смугу в LCP); src — мала копія (без JS)
        ids = {re.match(r'/img/p/(.+)-(r?\d+)\.webp$', p).group(1) if re.match(r'/img/p/(.+)-(r?\d+)\.webp$', p) else None for _, p in cand}
        if len(ids) == 1 and None not in ids:
            pid = ids.pop()
            tok = []
            for w, p in cand:
                n = p.rsplit('-', 1)[1][:-5]
                tok.append(n if n == str(w) else f'{n}={w}')
            return _attr(_attr(_attr(tag, 'srcset', None), 'data-p', f'{pid}:{",".join(tok)}'), 'sizes', sz)
        return _attr(_attr(_attr(tag, 'data-p', None), 'srcset', ', '.join(f'{p} {w}w' for w, p in cand)), 'sizes', sz)
    elif slot == 'pg':  # /proekty: галерея 4:3, компактно
        f = max(1.0, ar / (4 / 3))
        # компактно: мала копія (~400) + найменша, що покриває ПК (360 px × обрізка × DPR 2); «900» без апскейлу буває 789 px —
        # тож беремо за фактичною шириною, а не за назвою (інакше в srcset лишалася сама 400 і фото на ПК було розмите)
        big = [x for x in fam if x[0] >= 380]
        if big:
            needw = math.ceil(360 * f * 2)
            hi = next((x for x in big if x[0] >= needw), big[-1])
            mid = [x for x in big if x[0] == 900 and big[0][0] < 900 < hi[0]]
            cand = sorted({big[0], *mid, hi})
        else:
            cand = fam[-2:]
        # відкладено (20.11.2026): srcset — у data-srcset, src — мала копія (без JS і для пошуковиків). З JS мініатюра прихована (proekt.v1.css:
        # html.js .pg img[data-srcset]{display:none}, клітинка a — 4:3), тож нативний lazy її не тягне; site-chrome.v1.js ставить srcset за ~350 px до кадру.
        # Раніше Chrome на повільній мережі тягнув перший ряд галереї (2 × 65–80 КБ) одразу й ділив канал з головним фото (LCP).
        return _attr(_attr(_attr(tag, 'srcset', None), 'data-srcset', ', '.join(f'{p} {w}w' for w, p in cand)), 'sizes',
                     f'(max-width:599px) {_fmt(47 * f)}vw, (max-width:767px) {_fmt(96 * f)}vw, {math.ceil(360 * f)}px')
    else:
        return tag
    lo, hi = need(fn)
    cand = pick(fam, lo, hi)
    bps = [767, 1023, 1599, 2199] if slot == 'strip' and home else SLOT_BPS[slot]  # головні: стрічка на всю ширину (6 → 7 кадрів з 1600)
    return _attr(_attr(tag, 'srcset', ', '.join(f'{p} {w}w' for w, p in cand)), 'sizes', sizes(fn, bps))


def apply(s, rel=''):
    items = _scan(s)
    if not items: return s
    home = 'hx-home' in s
    global _CASE
    _CASE = '/assets/proekt.v1.css' in s
    cnt = {}
    for it in items:
        if it[3] == 'svc': cnt[it[4]] = cnt.get(it[4], 0) + 1
    seen, out, pos = {}, [], 0
    for a, b, tag, slot, cp in items:
        i = seen.get(cp, 0); seen[cp] = i + 1
        out.append(s[pos:a]); out.append(fix(tag, slot, home, i, cnt.get(cp, 1))); pos = b
    out.append(s[pos:])
    return ''.join(out)


if __name__ == '__main__':
    import glob
    files = [os.path.relpath(f, ROOT) for f in glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)
             if not os.path.relpath(f, ROOT).startswith(('tools/', 'node_modules/', '.'))]
    bad = []
    for r in sorted(files):
        t = open(os.path.join(ROOT, r), encoding='utf-8').read()
        n = apply(t, r)
        if n != t:
            bad.append(r)
            if '--check' not in sys.argv: open(os.path.join(ROOT, r), 'w', encoding='utf-8').write(n)
    if '--check' in sys.argv:
        print('\n'.join(bad) if bad else 'Різкість фото (srcset/sizes): OK'); sys.exit(1 if bad else 0)
    print(f'srcset/sizes оновлено: {len(bad)} сторінок')
