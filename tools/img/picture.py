#!/usr/bin/env python3
"""Підключає AVIF-копії (tools/img/build.py) до сторінок: <img src=".webp"> → <picture><source avif><img></picture>.

  python3 tools/img/picture.py          # усі *.html, повторний запуск безпечний

Пропускає: перше фото з fetchpriority=high, зображення з id (їх src міняє JS — лайтбокси), уже обгорнуті в <picture>, вміст <script>,
файли без .avif поруч. Браузер без AVIF бере WebP з <img>.
"""
import glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = re.compile(r'<img\b[^>]*>')
SKIP_DIRS = ('tools/', 'styleguide/', 'node_modules/')


def avif(url):
    if not url.startswith('/img/') or not url.endswith('.webp'): return None
    a = url[:-5] + '.avif'
    return a if os.path.exists(os.path.join(ROOT, a.lstrip('/'))) else None


def wrap(tag):
    if re.search(r'\bid="', tag): return None
    if 'fetchpriority="high"' in tag: return None  # перше фото (LCP): WebP декодується швидше на слабких телефонах
    src = re.search(r'\bsrc="([^"]+)"', tag)
    if not src or not avif(src.group(1)): return None
    ss = re.search(r'\bsrcset="([^"]+)"', tag)
    if ss:
        parts = []
        for p in ss.group(1).split(','):
            u, *d = p.strip().split()
            a = avif(u)
            if not a: return None
            parts.append(' '.join([a] + d))
        # srcset лише з x-дескрипторами (напр. "x-400.webp 2x"): src — це кандидат 1x, у <source> його теж треба дати
        if all(len(p.split()) > 1 and p.split()[1].endswith('x') for p in parts) and not any(p.split()[1] == '1x' for p in parts):
            parts.insert(0, avif(src.group(1)))
        av = ', '.join(parts)
    else:
        av = avif(src.group(1))
    sizes = re.search(r'\bsizes="([^"]+)"', tag)
    return f'<picture><source type="image/avif" srcset="{av}"' + (f' sizes="{sizes.group(1)}"' if sizes else '') + f'>{tag}</picture>'


def process(text):
    out, n, pos = [], 0, 0
    # працюємо лише поза <script>…</script> і не чіпаємо вже обгорнуті
    for m in re.finditer(r'<script\b.*?</script>', text, re.S):
        out.append(text[pos:m.start()]); out.append(m.group(0)); pos = m.end()
    out.append(text[pos:])
    for k in range(0, len(out), 2):
        seg = out[k]
        def rep(m):
            nonlocal n
            if seg.startswith('</picture>', m.end()): return m.group(0)  # уже обгорнуте
            w = wrap(m.group(0))
            if w: n += 1; return w
            return m.group(0)
        out[k] = IMG.sub(rep, seg)
    return ''.join(out), n


if __name__ == '__main__':
    total = files = 0
    for f in glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(SKIP_DIRS): continue
        s = open(f, encoding='utf-8').read()
        t, n = process(s)
        if n and 'id="pic-css"' not in t:  # <picture> не впливає на верстку — стилі як у голого <img>
            t = t.replace('</head>', '<style id="pic-css">picture{display:contents}</style>\n</head>', 1)
        if n:
            open(f, 'w', encoding='utf-8').write(t); total += n; files += 1
    print(f'AVIF: обгорнуто {total} зображень у {files} файлах')
