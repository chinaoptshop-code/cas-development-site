#!/usr/bin/env python3
"""Бюджет файлів деплою (Михайло 19.11.2026): Cloudflare Pages — до 20 000 файлів на деплой; тримаємо 13–14 тис.,
щоб лишався запас на товари Оздоби й нові сторінки. Попередження з 14 000, помилка (код 1) з 15 000.

  python3 tools/site/filecount.py              # скільки файлів піде на сайт (розбивка за теками) + неприв'язані фото
  python3 tools/site/filecount.py --orphans    # список фото в img/, на які не посилається жоден файл сайту
  python3 tools/site/filecount.py --prune      # (деплой) прибирає з копії все, що не є сайтом (EXCLUDE), і перевіряє бюджет

Що йде на сайт — те саме, що бачить wrangler: усе в корені, крім EXCLUDE (крок «Exclude non-site files» у deploy.yml
викликає --prune) і того, що wrangler не вантажить сам (functions/, _headers, _redirects, .git, node_modules).
Неприв'язане фото — файл img/…, якого немає в жодному HTML/CSS/JS/JSON/XML сайту ні буквально, ні через короткі форми
(data-p / data-pn плиток і портфоліо, data-lb лайтбокса, data-hs слайд-шоу, хвости галерей /proekty/gal/*.json — ширини x[7],
бази фото Оздоби в catalog.json); AVIF рахується разом зі своїм WebP, тури (img/tury) — увесь каталог (мініатюри будує JS).
Такі файли — кандидати на видалення з репозиторію (оригінали — на Google Drive, tools/img/drive-ids.json).
"""
import collections, glob, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WARN, FAIL = 14000, 15000
# не сайт: інструменти, конфіги, службові нотатки й знімки — лишаються в репозиторії, на сайт не йдуть
EXCLUDE = ['tools', '.claude', 'CLAUDE.md', 'migrations', '.github', '.gitignore', 'OWNERS.md',
           'check.txt', 'result.txt', 'domain-status.txt', 'live.txt', 'map-paths.json', 'MAP-402.png', 'MAP-1856.png',
           'img/lqip.json']
WRANGLER_SKIP = {'functions', '_headers', '_redirects', '_routes.json', '_worker.js', '.git', 'node_modules', '.wrangler'}
TXT = ('.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.webmanifest')
RX = re.compile(r'(?<![\w.-])/?(img/[^"\'\s,)<>\\`?#]+?\.(?:webp|avif|jpe?g|png|svg|gif|json|mp4|webm))')
DP = re.compile(r'data-p="([^:"]+):([\w,=]+)(\*?)"')
DPN = re.compile(r'data-pn="([^:"]+):([\d,]+)@')
LB = re.compile(r'<a href="/?(img/[^"]+?)-(\d+)\.webp"[^>]*data-lb="([\d,]*)"')
HS = re.compile(r'data-hs="([^"]+)"')


def deployed(root=ROOT):
    skip = set(EXCLUDE) | WRANGLER_SKIP
    out = []
    for d, ds, fs in os.walk(root):
        rel = os.path.relpath(d, root)
        rel = '' if rel == '.' else rel
        ds[:] = sorted(x for x in ds if os.path.join(rel, x) not in skip and x not in ('.git', 'node_modules'))
        out += [os.path.join(rel, f) for f in fs if os.path.join(rel, f) not in skip and f != '.DS_Store']
    return sorted(out)


def refs(files, root=ROOT):
    ref = set()
    def scan(s):
        ref.update(m.group(1) for m in RX.finditer(s))
        for m in DP.finditer(s):
            pid = m.group(1)
            ref.update(f'img/p/{pid}-{w.split("=")[0]}.webp' for w in m.group(2).split(','))
            if m.group(3): ref.update(f'img/p/{pid.removeprefix("tl-")}-{w}.webp' for w in (600, 900, 1200))
        for m in DPN.finditer(s):
            ref.update(f'img/p/{m.group(1)}-{w}.webp' for w in m.group(2).split(','))
        for m in LB.finditer(s):
            ref.update(f'{m.group(1)}-{w}.webp' for w in m.group(3).split(',') if w)
        for m in HS.finditer(s):
            for x in m.group(1).split(';'):
                p = x.split(':') + ['', '']
                ref.update(f'img/hs-{p[0]}-{w}.webp' for w in p[1].split('.') if w)
                ref.update(f'img/hs-{p[0]}-m-{w}.webp' for w in p[2].split('.') if w)
    texts = [f for f in files if f.endswith(TXT)] + [f for f in ('_headers', '_redirects') if os.path.exists(os.path.join(root, f))]
    texts += [os.path.relpath(p, root) for p in glob.glob(os.path.join(root, 'functions', '**', '*.js'), recursive=True)]
    for f in texts:
        scan(open(os.path.join(root, f), encoding='utf-8', errors='replace').read())
    cat = os.path.join(root, 'assets/ozdoba/catalog.json')
    if os.path.exists(cat):  # фото товарів: база без -400/-800.webp (tools/products/photo.py)
        for m in re.finditer(r'"(img/products/[^".]+)"', open(cat, encoding='utf-8').read()):
            ref.update(f'{m.group(1)}-{w}.webp' for w in (400, 800, 1200))
    for g in glob.glob(os.path.join(root, '**', 'gal', '*.json'), recursive=True):  # хвости галерей: ширини лайтбокса — x[7]
        try: items = json.load(open(g, encoding='utf-8')).get('p', [])
        except Exception: continue
        for x in items:
            if len(x) > 7 and x[7]:
                b = re.sub(r'-\d+\.webp$', '', x[0]).lstrip('/')
                ref.update(f'{b}-{w}.webp' for w in str(x[7]).split(','))
    ref.update(f for f in files if f.startswith('img/tury/'))  # тури: мініатюри сцен будує tour.v1.js з назви панорами
    ref.update(r[:-5] + '.avif' for r in list(ref) if r.endswith('.webp'))  # AVIF — разом зі своїм WebP (picture.py / data-av)
    return ref


def orphans(files=None, root=ROOT):
    files = files if files is not None else deployed(root)
    ref = refs(files, root)
    return [f for f in files if f.startswith('img/') and f not in ref]


def group(f):
    p = f.split('/')
    if len(p) == 1: return '(корінь) ' + (p[0].rsplit('.', 1)[-1] if '.' in p[0] else p[0])
    if p[0] == 'img': return 'img/' + (p[1] if len(p) > 2 else '*') + ' ' + f.rsplit('.', 1)[-1]
    if p[0] in ('en', 'ru', 'es', 'zh', 'pl', 'de', 'fr', 'pt', 'ar'): return p[0] + '/' + (p[1] if len(p) > 2 else '*.html')
    return p[0]


def main():
    args = sys.argv[1:]
    if '--prune' in args:  # деплой: копія репозиторію в CI, видаляємо лише не-сайт
        for x in EXCLUDE:
            p = os.path.join(ROOT, x)
            if x == 'tools': continue  # tools прибирає сам крок деплою після цього скрипта
            if os.path.isdir(p): shutil.rmtree(p)
            elif os.path.exists(p): os.remove(p)
    files = deployed()
    if '--orphans' in args:
        print('\n'.join(orphans(files))); return 0
    n = len(files)
    if '--quiet' not in args and '--prune' not in args:
        for k, v in sorted(collections.Counter(group(f) for f in files).items(), key=lambda kv: -kv[1])[:25]:
            print(f'{v:6}  {k}')
        o = orphans(files)
        if o: print(f'неприв\'язаних фото в img/: {len(o)} (список — --orphans; кандидати на видалення)')
    msg = f'Файлів на сайт: {n} (бюджет: попередження {WARN}, межа {FAIL}; Cloudflare Pages — 20 000)'
    if n >= FAIL:
        print('✗ ' + msg + ' — прибрати неприв\'язані фото (--orphans) або зайві ширини', file=sys.stderr); return 1
    if n >= WARN:
        print('::warning::' + msg); return 0
    print('✓ ' + msg)
    return 0


if __name__ == '__main__':
    sys.exit(main())
