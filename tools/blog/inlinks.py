#!/usr/bin/env python3
"""Аудит вхідних внутрішніх посилань на статті блогу за зібраним HTML (не за JSON).

  python3 tools/blog/inlinks.py            # підсумок: статей, сиріт (0 вхідних), < 3 вхідних, мін/медіана
  python3 tools/blog/inlinks.py --list     # ще й статті з < 3 вхідними
  python3 tools/blog/inlinks.py --check    # код 1, якщо є стаття з < 3 вхідними (контекстними) посиланнями

Вхідне посилання — <a href> з ІНШОЇ сторінки сайту (різні сторінки рахуються один раз), без шапки й футера
(<!--chrome:h-->/<!--chrome:f--> — там лише меню й перемикач мов) — тобто лише контекстні посилання з <main>.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP = ('tools/', 'styleguide/', 'node_modules/', '.claude/', 'kabinet/')
CHROME = re.compile(r'<!--chrome:([hf])-->.*?<!--/chrome:\1-->', re.S)
HREF = re.compile(r'<a\b[^>]*?\bhref="(/[^"#?]*)')


def norm(h):
    h = h.split('#')[0].split('?')[0]
    if h.endswith('.html'): h = h[:-5]
    if h.endswith('/index'): h = h[:-5]
    return h.rstrip('/') or '/'


def page_url(rel):
    return norm('/' + rel)


def stats():
    pages = [os.path.relpath(f, ROOT) for f in glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)]
    pages = [p for p in pages if not p.startswith(SKIP) and not p.endswith('404.html') and not p.startswith('google')]
    arts = {page_url(p) for p in pages if re.match(r'(?:[a-z]{2}/)?blog/[^/]+\.html$', p)}
    inc = {u: set() for u in arts}
    for p in pages:
        src = page_url(p)
        s = CHROME.sub('', open(os.path.join(ROOT, p), encoding='utf-8', errors='ignore').read())
        for h in set(map(norm, HREF.findall(s))):
            if h in inc and h != src:
                inc[h].add(src)
    return inc


def main():
    inc = stats()
    n = sorted(len(v) for v in inc.values())
    low = sorted((len(v), u) for u, v in inc.items() if len(v) < 3)
    orph = sum(1 for x in n if x == 0)
    print(f'Статей: {len(n)} · сиріт (0 вхідних): {orph} · < 3 вхідних: {len(low)} · мін {n[0]} · медіана {n[len(n) // 2]} · макс {n[-1]}')
    if '--list' in sys.argv:
        for c, u in low: print(f'  {c}  {u}')
    if '--check' in sys.argv and low:
        sys.exit(1)


if __name__ == '__main__':
    main()
