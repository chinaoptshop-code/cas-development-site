#!/usr/bin/env python3
"""Довгі галереї сторінок проєктів /proekty/<slug> (> 24 фото): у HTML — перші 24 мініатюри, решта — /proekty/gal/<slug>.json.

  python3 tools/site/casegal.py            # оновити uk-сторінки й JSON (ідемпотентно; build-all — після casetext.py, до caselang.py)
  python3 tools/site/casegal.py --check    # код 1, якщо сторінка або JSON застарілі

Навіщо: бюджет HTML сторінки проєкту — 64 КБ (tools/ui/ui.py), а мініатюра з srcset/sizes/alt — ~0,4 КБ (Petrivtsi — 100 фото).
Розмітка: під `.pg` — блок <!--gal:more-->: посилання «Показати всі (N)» на JSON (без JS — відкриває список файлів) і
/assets/case-gal.v1.js (defer): клік або прокрутка до кінця галереї (за ~700 px) — дописує решту мініатюр тими самими атрибутами
(alt, width/height, srcset/sizes — sharp.py рахує їх тут, на повній галереї), клітинки 4:3 (proekt.v1.css) — без CLS;
лайтбокс #lb: ‹ › / ←→ / свайп по всіх фото сторінки (підвантажує JSON, коли дійшли до 24-го), лічильник «n / N».
JSON: {"n": усього, "p": [[href, src, srcset, sizes, w, h, alt], …]} — лише хвіст. Джерело правди хвоста — сам JSON
(сторінка + JSON = повна галерея); en/ru — tools/site/caselang.py (<мова>/proekty/gal/<slug>.json з перекладеними alt).
ALT — описовий alt галереї «<…>, фото N» (замість скороченого під бюджет, коли все було в HTML).
"""
import html, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chrome  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIMIT = 24
JS = 'assets/case-gal.v1.js'
ALT = {'petrivtsi-house': 'Petrivtsi House — приватний будинок 320 м² у Петрівцях'}
GAL = re.compile(r'(<div class="pg"[^>]*>)(.*?)(</div>)', re.S)
ITEM = re.compile(r'<a href="([^"]+)"[^>]*><img\b([^>]*)></a>')
MORE = re.compile(r'\n?<!--gal:more-->.*?<!--/gal:more-->', re.S)
# інлайн-делегування кліку з деяких сторінок — лайтбокс довгих галерей веде case-gal.v1.js (інакше кадр відкривається двічі)
DELEG = "document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.pg a');if(a){e.preventDefault();lb(a.href)}});"
MORE_TXT = 'Показати всі ({n})'


def jpath(slug, prefix=''):
    return f'{prefix}proekty/gal/{slug}.json'


def attr(tag, k):
    m = re.search(r'\s' + k + r'="([^"]*)"', tag)
    return html.unescape(m.group(1)) if m else ''


def parse(body):
    return [[h, attr(t, 'src'), attr(t, 'srcset'), attr(t, 'sizes'), int(attr(t, 'width') or 0), int(attr(t, 'height') or 0), attr(t, 'alt')]
            for h, t in ITEM.findall(body)]


def item(x, oc=False):
    h, src, ss, sz, w, ht, alt = x
    q = lambda v: html.escape(v, quote=True)
    return (f'<a href="{q(h)}"' + (' onclick="return lb(this.href)"' if oc else '') + f'><img src="{q(src)}"' + (f' srcset="{q(ss)}"' if ss else '') + (f' sizes="{q(sz)}"' if sz else '')
            + f' loading="lazy" decoding="async" width="{w}" height="{ht}" alt="{q(alt)}"></a>')


def more_block(slug, n):
    u = '/' + jpath(slug)
    return (f'\n<!--gal:more--><p class="pg-more" style="margin:18px 0 0"><a class="btn" href="{u}" data-gal="{n}">{html.escape(MORE_TXT.format(n=n))}</a></p>'
            f'<script src="/{JS}" defer></script><!--/gal:more-->')  # ?v= ставить chrome.versions()


def full_items(s, slug):
    """Галерея цілком: мініатюри зі сторінки + хвіст з JSON (якщо сторінку вже розділено)."""
    m = GAL.search(s)
    items = parse(m.group(2))
    f = os.path.join(ROOT, jpath(slug))
    if MORE.search(s) and os.path.exists(f):
        items += json.load(open(f, encoding='utf-8'))['p']
    return m, items


def render(s, slug):
    """→ (html, json-текст або None)."""
    rel = f'proekty/{slug}.html'
    m, items = full_items(s, slug)
    if len(items) <= LIMIT and not MORE.search(s):
        return s, None  # коротка галерея — як є
    if slug in ALT:
        for i, x in enumerate(items):
            x[6] = f'{ALT[slug]}, фото {i + 1}'
    s = MORE.sub('', s)
    m = GAL.search(s)
    m0 = re.sub(r' data-compact="\d+"', '', m.group(1))
    short = len(items) <= LIMIT
    s = s[:m.start()] + m0 + ''.join(item(x, short) for x in items) + m.group(3) + s[m.end():]
    if short:
        return chrome.apply(s, rel), None
    s = chrome.apply(s, rel)  # sharp.py: srcset/sizes на всіх фото повної галереї
    m = GAL.search(s)
    items = parse(m.group(2))
    head, tail = items[:LIMIT], items[LIMIT:]
    op = m.group(1) if 'data-compact' in m.group(1) else m.group(1)[:-1] + f' data-compact="{LIMIT}">'  # без «Показати ще» site-chrome на телефоні: одна кнопка
    s = s[:m.start()] + op + ''.join(item(x) for x in head) + m.group(3) + more_block(slug, len(items)) + s[m.end():]
    s = s.replace(DELEG, '')
    data = json.dumps({'n': len(items), 'p': tail}, ensure_ascii=False, separators=(',', ':')) + '\n'
    return chrome.apply(s, rel), data


def pages():
    import glob
    return sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(ROOT, 'proekty/*.html')))


def main():
    check = '--check' in sys.argv
    stale, n = [], 0
    for slug in pages():
        f = os.path.join(ROOT, 'proekty', slug + '.html')
        s = open(f, encoding='utf-8').read()
        if not GAL.search(s):
            continue
        new, data = render(s, slug)
        jf = os.path.join(ROOT, jpath(slug))
        old_j = open(jf, encoding='utf-8').read() if os.path.exists(jf) else None
        n += bool(data)
        if new != s or old_j != data:
            stale.append(slug)
            if check:
                continue
            open(f, 'w', encoding='utf-8').write(new)
            if data:
                os.makedirs(os.path.dirname(jf), exist_ok=True)
                open(jf, 'w', encoding='utf-8').write(data)
            elif old_j is not None:
                os.remove(jf)
    if check and stale:
        print('casegal: застарілі', ', '.join(stale))
        sys.exit(1)
    print(f'casegal: довгих галерей {n}' + (f', оновлено {len(stale)}' if stale and not check else ''))


if __name__ == '__main__':
    main()
