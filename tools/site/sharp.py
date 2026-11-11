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

Слоти: strip (.xs-st; головна — .hx-home), proj (.xs-proj .xs-st, портфоліо — компактно через бюджет HTML),
covers (.xs-cv), svc (.xs-sv, з урахуванням flex-рядів; на головній — карусель), split (.xs-pic), pg (галерея /proekty, компактно), hero (.hx — лише ширші файли),
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


def w_split(vw):
    c = cont(vw)
    if vw <= 767: return c
    if vw <= 1023: return (c - 80) / 2
    return (c - 6.25 * rem(vw)) / 2


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
    k = max(1, int((c + 16) // (13 * rem(vw) + 16)))
    row = i // k; r = min(k, n - row * k)
    w = (c - (r - 1) * 16) / r
    if vw >= 1367: w = min(w, 48 * rem(vw))
    return w, max(1.6, w / (12 * rem(vw)))


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
            'svc': [599, 767, 1099, 1366]}


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
        if 'xs-st' in c: return ('proj' if any('xs-proj' in x for x in anc[k:]) else 'strip'), k
        if 'xs-cv' in c: return 'covers', k
        if 'xs-sv' in c: return 'svc', k
        if 'xs-pic' in c: return 'split', k
        if 'pg' in c: return 'pg', k
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
        return _attr(tag, 'srcset', ', '.join(f'{p} {w}w' for w, p in fam if w >= 400))
    if slot == 'strip': fn = lambda vw: cov(w_strip(vw, home), .8)
    elif slot == 'covers': fn = lambda vw: cov(w_covers(vw), .8)
    elif slot == 'split': fn = w_split
    elif slot == 'svc': fn = lambda vw: cov(*w_svc(vw, i, n, home))
    elif slot == 'proj':  # портфоліо: ~620 фото, бюджет HTML — два кандидати 400/900 і sizes з двох частин
        fn = lambda vw: cov(w_strip(vw, False), .75)
        f = max(1.0, ar / .75)
        cand = [(w, p) for w, p in fam if w in (400, 900)] or fam[-2:]
        return _attr(_attr(tag, 'srcset', ', '.join(f'{p} {w}w' for w, p in cand)), 'sizes', f'(max-width:424px) {_fmt(66 * f)}vw, {math.ceil(280 * f)}px')
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
        return _attr(_attr(tag, 'srcset', ', '.join(f'{p} {w}w' for w, p in cand)), 'sizes',
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
