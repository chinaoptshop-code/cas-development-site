#!/usr/bin/env python3
"""Мови сайту: реєстр мов, словники інтерфейсу й hreflang-кластери.

  python3 tools/site/i18n.py            # синхронізувати hreflang у всіх сторінках кластерів (+ шапка/футер)
  python3 tools/site/i18n.py --check    # перевірити: кластери взаємні, файли існують, x-default = uk (код 1 — помилки)

Як додати мову (напр. «it»):
  1. tools/site/lang/it.json — копія en.json з перекладом (chrome — меню/футер, landing — підписи блоків,
     form — форма заявки й нижня панель, meta — код, назва, html lang, dir, шрифти);
  2. додати "it" у LANGS нижче (порядок = порядок у перемикачі мов);
  3. сторінки — tools/site/pages/it-<slug>.json (формат — у landing.py), шляхи — у clusters.json (або окремий clusters-<назва>.json — зливається з ним);
  4. python3 tools/site/landing.py → tools/blog/build.py → tools/products/build.py → tools/shop/pages.py → tools/site/chrome.py.
uk і ru мають свої словники в chrome.py/landing.py (історично); нові мови — лише JSON.

Кластер (tools/site/lang/clusters.json) — одна сторінка різними мовами: {"id": {"uk": "/шлях", "en": "/en/шлях", ...}}.
У hreflang потрапляють лише ті мови, чий файл існує; x-default — завжди uk. Сторінки поза кластерами
(решта пар uk/ru) — як і раніше, через "pair" у JSON лендингу.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'
HERE = os.path.dirname(os.path.abspath(__file__))

# порядок = порядок у перемикачі мов; ru/uk — без JSON-словника (тексти в chrome.py/landing.py)
LANGS = ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'ar']
BASE = {
    'uk': dict(code='UA', name='Українська', html='uk', hreflang='uk', dir='ltr', prefix='', fonts='cyrillic'),
    'ru': dict(code='RU', name='Русский', html='ru', hreflang='ru', dir='ltr', prefix='ru/', fonts='cyrillic'),
}


def _load(lang, _c={}):
    if lang not in _c:
        f = os.path.join(HERE, 'lang', lang + '.json')
        _c[lang] = json.load(open(f, encoding='utf-8')) if os.path.exists(f) else None
    return _c[lang]


def meta(lang):
    """code (у шапці), name, html (атрибут lang), hreflang, dir, prefix (тека), fonts (cyrillic|latin|none)."""
    if lang in BASE:
        return BASE[lang]
    d = _load(lang)
    return d['meta'] if d else dict(code=lang.upper(), name=lang, html=lang, hreflang=lang, dir='ltr', prefix=lang + '/', fonts='latin')


def ui(lang):
    """Повний словник мови (chrome, landing, form) або None для uk/ru."""
    return _load(lang)


def home(lang):
    return '/' + meta(lang)['prefix']


def enabled():
    """Мови, у яких уже є головна (решта в перемикачі не показується)."""
    return [l for l in LANGS if os.path.exists(path_to_file(home(l)))]


def path_to_file(p):
    """URL-шлях → файл від кореня: / → index.html, /en/ → en/index.html, /x → x.html."""
    p = p.split('#')[0].split('?')[0]
    if p.endswith('/'):
        return (p.lstrip('/') + 'index.html')
    return p.lstrip('/') + '.html'


def file_to_path(rel):
    p = '/' + rel.replace(os.sep, '/')
    if p.endswith('/index.html'):
        return p[:-10]
    return p[:-5] if p.endswith('.html') else p


def exists(p):
    return os.path.exists(os.path.join(ROOT, path_to_file(p)))


def lang_of_hreflang(h):
    for l in LANGS:
        if meta(l)['hreflang'] == h:
            return l
    return h.split('-')[0]


def clusters(_c={}):
    """clusters.json + додаткові tools/site/lang/clusters-*.json (напр. від паралельних гілок перекладу).
    Кластер з додаткового файлу зливається з тим, що має той самий ключ або спільний шлях (напр. той самий uk)."""
    if 'c' not in _c:
        import glob
        c = json.load(open(os.path.join(HERE, 'lang', 'clusters.json'), encoding='utf-8'))
        for f in sorted(glob.glob(os.path.join(HERE, 'lang', 'clusters-*.json'))):
            for cid, m in json.load(open(f, encoding='utf-8')).items():
                if cid.startswith('_'):
                    continue
                same = cid if cid in c else next((k for k, v in c.items() if not k.startswith('_')
                                                  and set(v.values()) & set(m.values())), None)
                if same:
                    c[same].update({l: p for l, p in m.items() if l not in c[same]})
                else:
                    c[cid] = dict(m)
        _c['c'] = c
    return _c['c']


def cluster_of(path):
    for cid, m in clusters().items():
        if cid.startswith('_'):
            continue
        if path in m.values():
            return {l: p for l, p in m.items() if exists(p)}
    return None


def alt_links(members):
    """<link rel=alternate> для наявних мов кластера (у порядку LANGS) + x-default (uk, інакше перша)."""
    out = [f'<link rel="alternate" hreflang="{meta(l)["hreflang"]}" href="{B}{members[l]}">' for l in LANGS if l in members]
    xd = members.get('uk') or members[next(l for l in LANGS if l in members)]
    out.append(f'<link rel="alternate" hreflang="x-default" href="{B}{xd}">')
    return '\n'.join(out) + '\n'


ALT_RX = re.compile(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?')


def set_alternates(s, members):
    """Замінює всі hreflang у <head> на кластер; вставляє одразу після canonical."""
    head, sep, rest = s.partition('</head>')
    head = ALT_RX.sub('', head)
    block = alt_links(members) if members and len(members) > 1 else ''
    m = re.search(r'<link rel="canonical" href="[^"]*">\n?', head)
    if m:
        end = m.end() if m.group(0).endswith('\n') else m.end()
        ins = ('' if m.group(0).endswith('\n') else '\n') + block
        head = head[:end] + ins + head[end:]
    else:
        head = head.replace('<meta name="twitter:card"', block + '<meta name="twitter:card"', 1)
    return head + sep + rest


# без type="font/woff2": woff2 підтримують усі браузери з preload; −18 Б на рядок (бюджет HTML 64 КБ у ui.py)
FONT_PRELOAD = '<link rel="preload" href="/fonts/{f}" as="font" crossorigin>\n'
FONT_RX = re.compile(r'<link rel="preload" href="/fonts/[\w.-]+\.woff2" as="font"(?: type="font/woff2")? crossorigin>\n?')


def fonts(s, lang):
    """Preload шрифтів за мовою: кирилиця (uk/ru), латиниця (en/es/pl/de/fr), жодного (zh/ar — системні шрифти)."""
    kind = meta(lang).get('fonts', 'latin')
    if not FONT_RX.search(s):
        return s
    want = {'latin': ['manrope-latin.woff2', 'cormorant-latin.woff2']}.get(kind, [])
    if kind == 'cyrillic':
        # пробіли, цифри й розділові знаки — у латинських файлах (unicode-range), тож вони потрібні кожній uk/ru-сторінці;
        # без preload вони приходять пізніше за кирилицю — текст перебудовується двічі (CLS 0,2–0,6 на /portfolio, аудит 26.10.2026).
        # Курсив кирилиці — лише якщо він є в H1 (<em>): інакше перенесення рядка H1 після підвантаження зсуває всю сторінку.
        want = ['manrope-cyrillic.woff2', 'cormorant-cyrillic.woff2', 'manrope-latin.woff2', 'cormorant-latin.woff2']
        h1 = re.search(r'<h1\b.*?</h1>', s, re.S)
        if h1 and '<em' in h1.group(0):
            want.append('cormorant-italic-cyrillic.woff2')
    first = FONT_RX.search(s).start()
    s = FONT_RX.sub('', s)
    return s[:first] + ''.join(FONT_PRELOAD.format(f=f) for f in want) + s[first:]


def html_attrs(s, lang):
    """<html lang=… dir=…> за мовою."""
    m = meta(lang)
    d = f' dir="{m["dir"]}"' if m['dir'] == 'rtl' else ''
    return re.sub(r'<html\b[^>]*>', f'<html lang="{m["html"]}"{d}>', s, count=1)


def sync(verbose=True):
    """Ставить повний набір hreflang у кожну наявну сторінку кожного кластера і оновлює шапку/футер."""
    sys.path.insert(0, HERE)
    import chrome
    n = 0
    for cid, m in clusters().items():
        if cid.startswith('_'):
            continue
        members = {l: p for l, p in m.items() if exists(p)}
        for l, p in members.items():
            f = os.path.join(ROOT, path_to_file(p))
            s = open(f, encoding='utf-8').read()
            t = chrome.apply(set_alternates(s, members), path_to_file(p))
            if t != s:
                open(f, 'w', encoding='utf-8').write(t); n += 1
    if verbose:
        print(f'hreflang: оновлено {n} сторінок')
    return n


def check():
    """Взаємність hreflang по всіх сторінках сайту (не лише кластерах)."""
    import glob
    errs, graph = [], {}
    for f in sorted(glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(('tools/', 'node_modules/', '.')):
            continue
        head = open(f, encoding='utf-8').read().split('</head>')[0]
        alts = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', head))
        if alts:
            graph[B + file_to_path(rel)] = alts
    for u, alts in graph.items():
        if 'x-default' not in alts:
            errs.append(f'{u}: нема x-default')
        if u not in alts.values():
            errs.append(f'{u}: нема посилання на себе')
        for h, v in alts.items():
            if h == 'x-default':
                continue
            if v not in graph:
                errs.append(f'{u}: {h} → {v} (сторінки нема або без hreflang)')
            elif graph[v] != alts:
                errs.append(f'{u}: {h} → {v} — набір hreflang не збігається')
    for cid, m in clusters().items():
        if cid.startswith('_'):
            continue
        for l, p in m.items():
            if l not in LANGS:
                errs.append(f'кластер {cid}: невідома мова {l}')
    return errs, len(graph)


if __name__ == '__main__':
    if '--check' in sys.argv:
        errs, n = check()
        print('\n'.join(errs) if errs else f'hreflang: OK ({n} сторінок, взаємно)')
        sys.exit(1 if errs else 0)
    sync()
