#!/usr/bin/env python3
"""Шаблонні інлайн-стилі <head> → один зовнішній CSS (бюджет HTML 64 КБ, 22.11.2026).

Кожна сторінка шаблону лендингу/статті несла в <head> ~9 КБ однакових інлайн-блоків <style>: шрифти (cas-fonts),
базові стилі шаблону (:root, body, .hero, section, форма…), нижня панель (m-fix), .rel/.gal, стилі статті й ui-polish
(токени розмірів, фокус). Тепер суцільний ряд таких блоків (між ними — лише інлайн-скрипти, JSON-LD, коментарі) стає одним
render-blocking файлом /assets/ib-<хеш>.css на місці ОСТАННЬОГО блоку ряду — каскад той самий: ті самі правила в тому самому
порядку, перед crit.v1.css і повним site-chrome.v1.css; cas-fonts, як і раніше, раніше за crit.v1.css (блок /*nn*/).
Назва файлу — хеш вмісту (кеш /assets/* — рік, immutable): сторінки з однаковим рядом ділять один файл.

  chrome.apply():  expand(s) на вході (генератори й перевірки бачать сторінку як раніше) → … → bundle(s) останнім кроком.
  python3 tools/site/cssbundle.py              # звіт: які файли ib-*.css використовуються, скільки сторінок, зайві файли
  python3 tools/site/cssbundle.py --prune      # видалити ib-*.css, на які не посилається жодна сторінка (робить chrome.py без аргументів)

Генератор, що читає готову сторінку як шаблон і правит її інлайн-CSS (landing.py — remont-kukhni-kyiv.html,
konfigurator/page.py — kalkuliator-remontu.html), бере її через expand(). Унікальні для сторінки блоки лишаються інлайн.
"""
import glob, hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PREFIX = 'assets/ib-'
MIN = 3072  # ряд менший за 3 КБ (напр. лише cas-fonts) лишається інлайн: окремий запит не вартий
# блоки, спільні для багатьох сторінок (шаблонні): за id або за початком вмісту
IDS = ('cas-fonts', 'm-fix', 'ui-polish')
STARTS = (':root{--bg:#080709;', '.rel{display:flex', '.gal{display:grid', 'article{max-width:760px}')
LINK = '<link rel=stylesheet href="/{f}">'
LINK_RX = re.compile(r'<link rel=stylesheet href="/(assets/ib-[0-9a-f]{10}\.css)">')
MARK = '/*@ib {tag}*/\n'
MARK_RX = re.compile(r'/\*@ib ((?:<!--m-fix-->)?<style[^>]*>)\*/\n')
# у <head>: блоки стилів, зовнішні стилі, скрипти, коментарі
TOK = re.compile(r'(?P<st>(?:<!--m-fix-->)?<style(?P<attr>[^>]*)>(?P<css>.*?)</style>)|(?P<ln><link\b[^>]*>)|(?P<sc><script\b(?P<sa>[^>]*)>.*?</script>)|<!--.*?-->', re.S)


def _shared(attr, css):
    m = re.fullmatch(r'(?: id="([\w-]+)")?', attr)
    if not m:
        return False
    if m.group(1):
        return m.group(1) in IDS
    return css.lstrip().startswith(STARTS)


def _safe(css):
    """Блок можна склеїти з сусідами: дужки й коментарі закриті, без @import/@charset, url() — лише абсолютні/data:."""
    if re.search(r'@import|@charset', css):
        return False
    for u in re.findall(r'url\(\s*["\']?([^"\')]*)', css):
        if not u.startswith(('/', 'data:', '#')):
            return False
    d, i, n = 0, 0, len(css)
    while i < n:
        c = css[i]
        if c in '"\'':
            j = css.find(c, i + 1)
            if j < 0:
                return False
            i = j + 1; continue
        if css.startswith('/*', i):
            j = css.find('*/', i + 2)
            if j < 0:
                return False
            i = j + 2; continue
        if c == '{':
            d += 1
        elif c == '}':
            d -= 1
            if d < 0:
                return False
        i += 1
    return d == 0


def _runs(head):
    """Ряди спільних блоків: [(start, end, [match, …])]; ряд рвуть інші <style>, <link rel=stylesheet>, <script src>."""
    runs, cur = [], []
    for m in TOK.finditer(head):
        if m.group('st'):
            if _shared(m.group('attr'), m.group('css')) and _safe(m.group('css')):
                cur.append(m)
                continue
        elif m.group('ln'):
            if not re.search(r'rel="?stylesheet', m.group('ln')):
                continue
        elif m.group('sc'):
            if not re.search(r'\ssrc=', m.group('sa')):
                continue
        else:
            continue  # коментар
        if cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    return runs


def _css(blocks):
    return ''.join(MARK.format(tag=m.group('st')[:m.group('st').index('>', m.group('st').index('<style')) + 1]) + m.group('css') + '\n' for m in blocks)


def _file(css):
    return PREFIX + hashlib.sha1(css.encode()).hexdigest()[:10] + '.css'


def bundle(s, write=True):
    """Ряди спільних блоків <head> (≥ MIN байт) → <link> на /assets/ib-<хеш>.css на місці останнього блоку ряду. Ідемпотентно."""
    e = s.find('</head>')
    if e < 0:
        return s
    head = s[:e]
    cut = []
    for run in _runs(head):
        if sum(len(m.group('st')) for m in run) < MIN:
            continue
        css = _css(run)
        f = _file(css)
        p = os.path.join(ROOT, f)
        if write and (not os.path.exists(p) or open(p, encoding='utf-8').read() != css):
            with open(p, 'w', encoding='utf-8') as fh:
                fh.write(css)
        for m in run[:-1]:
            a, b = m.span('st')
            if head[b:b + 1] == '\n':
                b += 1
            cut.append((a, b, ''))
        cut.append((*run[-1].span('st'), LINK.format(f=f)))
    for a, b, t in sorted(cut, reverse=True):
        head = head[:a] + t + head[b:]
    return head + s[e:]


def expand(s):
    """Зворотне до bundle(): <link> на /assets/ib-*.css → інлайн-блоки (усі — на місці посилання). Ідемпотентно."""
    if 'assets/ib-' not in s:
        return s
    e = s.find('</head>')
    head = s[:e]

    def one(m):
        p = os.path.join(ROOT, m.group(1))
        if not os.path.exists(p):
            raise SystemExit(f'cssbundle: немає {m.group(1)} (сторінка посилається) — перезбери сторінку з генератора')
        css = open(p, encoding='utf-8').read()
        parts = MARK_RX.split(css)  # ['', tag, css, tag, css, …]
        return '\n'.join(parts[i] + parts[i + 1][:-1] + '</style>' for i in range(1, len(parts), 2))
    return LINK_RX.sub(one, head) + s[e:]


def used():
    """Файл ib-*.css → кількість сторінок, що на нього посилаються."""
    out = {}
    for f in glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(('tools', 'node_modules', '.')):
            continue
        s = open(f, encoding='utf-8', errors='ignore').read(65536 * 4)
        for x in LINK_RX.findall(s[:s.find('</head>')]):
            out[x] = out.get(x, 0) + 1
    return out


def prune():
    u = used()
    gone = [os.path.relpath(f, ROOT) for f in glob.glob(os.path.join(ROOT, PREFIX + '*.css')) if os.path.relpath(f, ROOT) not in u]
    for f in gone:
        os.remove(os.path.join(ROOT, f))
    return gone


if __name__ == '__main__':
    if '--prune' in sys.argv:
        g = prune()
        print(f'cssbundle: видалено {len(g)} зайвих ib-*.css' + (': ' + ', '.join(g) if g else ''))
        sys.exit(0)
    u = used()
    for f, n in sorted(u.items(), key=lambda x: -x[1]):
        print(f'{n:5}  {f}  {os.path.getsize(os.path.join(ROOT, f)) if os.path.exists(os.path.join(ROOT, f)) else "НЕМАЄ"}')
    extra = [os.path.relpath(f, ROOT) for f in glob.glob(os.path.join(ROOT, PREFIX + '*.css')) if os.path.relpath(f, ROOT) not in u]
    print(f'cssbundle: {len(u)} файлів, {sum(u.values())} сторінок; без посилань: {len(extra)}')
    sys.exit(1 if any(not os.path.exists(os.path.join(ROOT, f)) for f in u) else 0)
