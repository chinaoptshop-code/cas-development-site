#!/usr/bin/env python3
"""Переклади сторінок проєктів /proekty/<slug> і портфоліо (en, ru) — генеруються з українських сторінок.

  python3 tools/site/caselang.py                 # зібрати <мова>/proekty/<slug>.html (після casetext.py і media.py)
  python3 tools/site/caselang.py portfolio       # tools/site/pages/<мова>-portfolio.json з uk-portfolio.json (до landing.py)
  python3 tools/site/caselang.py --check         # код 1, якщо сторінка/JSON застарілі або бракує перекладу
  python3 tools/site/caselang.py --missing en    # JSON рядків без перекладу (заготовка для tools/site/caselang/en.json)

Джерело — готова uk-сторінка (структура, фото, галереї, факти, «Задача → Рішення → Результат» з casetext.py, тур/відео з media.py).
Переклад — tools/site/caselang/<мова>.json: {"_common": {uk: переклад}, "<slug>": {uk: переклад}, "_portfolio": {…}}.
Ключ — текст блоку (абзац, пункт, заголовок, підпис) з інлайн-тегами, де теги з атрибутами замінено на <a1>, <b2>… (у перекладі
— ті самі мітки, порядок можна міняти); «фото 12» → «фото {n}». Атрибути alt/aria-label/title — так само; data-service лишається
українським (мітка для адмінки, її ставить leadform.py). Бракує перекладу — помилка (сторінку не пишемо).
Посилання — на версію цієї мови з кластерів (tools/site/lang/clusters*.json; /proekty/x → /<мова>/proekty/x, /portfolio → /<мова>/portfolio),
інакше лишається uk з hreflang="uk". Кластери case-<slug> і portfolio — tools/site/lang/clusters-cases.json (пише цей скрипт).
Факти — лише ті, що в uk (без нових чисел; «реалізовано» — лише де є в uk). Шапку/футер/пігулку ставить chrome.apply().
"""
import glob, html, json, os, re, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n  # noqa: E402

ROOT, B = i18n.ROOT, i18n.B
LANGS = ('en', 'ru')
DATA = os.path.join(ROOT, 'tools/site/caselang')
CL = os.path.join(ROOT, 'tools/site/lang/clusters-cases.json')
SKIP = re.compile(r'-povnyi-proekt\.html$')  # «Повний проєкт» збирає fullcase.py (кластер case-<id>)
INLINE = {'a', 'b', 'span', 'small', 'em', 'strong', 'i', 'br', 'bdi', 'sup', 'u', 'abbr', 'time'}
CYR = re.compile(r'[А-Яа-яІіЇїЄєҐґЁёЪъЫыЭэ]')
UK_ONLY = re.compile(r'[ІіЇїЄєҐґʼ]')
ATTRS = ('alt', 'aria-label', 'title', 'data-title', 'data-open', 'data-close', 'placeholder', 'data-more', 'data-place', 'data-st')
NUM = re.compile(r'(?<=[Фф]ото )(\d+)$')


def cases():
    return sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(ROOT, 'proekty/*.html')) if not SKIP.search(f))


def load(lang):
    f = os.path.join(DATA, lang + '.json')
    return json.load(open(f, encoding='utf-8')) if os.path.exists(f) else {}


class Tr:
    """Словник мови: спершу рядки сторінки, далі спільні. Ключі без NBSP (chrome.nbsp_prices ставить їх знову)."""

    def __init__(self, lang, slug):
        d = load(lang)
        self.lang, self.slug = lang, slug
        self.maps = [d.get(slug, {}), d.get('_common', {})]
        self.miss = []

    def __call__(self, key):
        k = key.replace('\u00a0', ' ')
        r = rules(k, self)
        if r is not None:
            return r
        n = None
        m = NUM.search(k)
        if m:
            n, k = m.group(1), k[:m.start()] + '{n}'
        for mp in self.maps:
            if k in mp:
                v = mp[k]
                return v.replace('{n}', n) if n is not None else v
        self.miss.append(k)
        return key


FMT = {'en': dict(m2='m²', frm='from'), 'ru': dict(m2='м²', frm='от')}
EST = re.compile(r'^(.+?) · <span1>([\d ]+) м² × \$([\d ]+)/м²</span> — <b2>від \$([\d ]+)</b>$')
CRUMB = re.compile(r'^<a1>Головна</a> / <a2>Портфоліо</a> / ([^<]+)$')


def rules(k, t):
    """Шаблонні рядки (числа — з uk, формат — мовою): орієнтир бюджету «площа × ставка», площа, хлібні крихти."""
    f = FMT[t.lang]
    n = lambda x: i18n.num(int(x.replace(' ', '')), t.lang)
    m = EST.match(k)
    if m:
        return f'{t(m.group(1))} · <span1>{n(m.group(2))} {f["m2"]} × ${n(m.group(3))}/{f["m2"]}</span> — <b2>{f["frm"]} ${n(m.group(4))}</b>'
    m = re.fullmatch(r'([\d ]+) м²', k)
    if m:
        return f'{n(m.group(1))} {f["m2"]}'
    m = CRUMB.match(k)
    if m:
        return f'<a1>{t("Головна")}</a> / <a2>{t("Портфоліо")}</a> / {m.group(1)}'
    return None


def local(href, lang):
    """uk-посилання → сторінка мови (кластер або /<мова>/proekty/…); None — перекладу нема."""
    if not href.startswith('/') or href.startswith(('/img/', '/assets/', '/fonts/', '//')):
        return href
    p, _, frag = href.partition('#')
    p = p or '/'
    if p.startswith('/' + i18n.meta(lang)['prefix']) and i18n.meta(lang)['prefix']:
        return href
    m = i18n.cluster_of(p) or {}
    if lang in m:
        return m[lang] + ('#' + frag if frag else '')
    mm = re.fullmatch(r'/(proekty/[\w-]+|portfolio)', p)
    if mm and i18n.exists('/' + i18n.meta(lang)['prefix'] + mm.group(1)):
        return '/' + i18n.meta(lang)['prefix'] + mm.group(1) + ('#' + frag if frag else '')
    if p == '/':
        return '/' + i18n.meta(lang)['prefix'] + ('#' + frag if frag else '')
    return None


def fix_links(s, lang):
    def one(m):
        tag = m.group(0)
        h = re.search(r'\shref="([^"]*)"', tag)
        if not h:
            return tag
        new = local(h.group(1), lang)
        if new is None:
            return tag if 'hreflang=' in tag else tag.replace(h.group(0), h.group(0) + ' hreflang="uk"', 1)
        tag = tag.replace(h.group(0), f' href="{new}"', 1)
        return re.sub(r' hreflang="uk"', '', tag) if new != h.group(1) else tag
    return re.sub(r'<a\b[^>]*>', one, s)


def tr_attrs(tag, t):
    def one(m):
        v = m.group(3)
        if not CYR.search(v):
            return m.group(0)
        return m.group(1) + m.group(2) + '="' + html.escape(t(html.unescape(v)), quote=True).replace('&#x27;', "'") + '"'
    return re.sub(r'(\s)(' + '|'.join(ATTRS) + r')="([^"]*)"', one, tag)


TOK = re.compile(r'(<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>|<[^>]+>)', re.S)


def split_top(run):
    """Run з кількох цілих інлайн-елементів без тексту між ними (<b>…</b><span>…</span>, ряд посилань) → окремі частини."""
    parts, cur, depth = [], [], 0
    for x in run:
        if not x.startswith('<'):
            if depth == 0:
                if x.strip():
                    return None
                if cur or parts:
                    (cur if cur else parts[-1]).append(x) if False else None
                continue
            cur.append(x); continue
        cur.append(x)
        if x.startswith('</'):
            depth -= 1
        elif not x.endswith('/>') and not re.match(r'<br\b', x):
            depth += 1
        if depth == 0:
            parts.append(cur); cur = []
    if cur or len(parts) < 2:
        return None
    return parts


def tr_html(s, t):
    """Текстові блоки між блоковими тегами → переклад (інлайн-теги — мітки <a1>…)."""
    toks = [x for x in TOK.split(s) if x != '']
    out, run = [], []

    def name(x):
        m = re.match(r'</?([a-zA-Z][\w-]*)', x)
        return m.group(1).lower() if m else None

    def flush():
        if not run:
            return
        raw = ''.join(run)
        parts = split_top(run)
        if parts:
            items = run[:]
            run.clear()
            for part in parts:
                run.extend(part); flush()
            return
        if len(run) == 3 and run[0].startswith('<') and not run[0].startswith('</') and run[2].startswith('</') and not run[1].startswith('<'):
            o, x, c = run
            run.clear()
            out.append(tr_attrs(o, t)); run.append(x); flush(); out.append(c)
            return
        if not CYR.search(re.sub(r'<[^>]+>', '', raw)):
            out.append(''.join(tr_attrs(x, t) if x.startswith('<') else x for x in run)); run.clear(); return
        lead = re.match(r'\s*', raw).group(0)
        trail = re.search(r'\s*$', raw).group(0)
        tags, key, j = {}, '', 0
        for x in run:
            if x.startswith('<') and not x.startswith('</') and re.search(r'\s[\w-]+=', x):
                j += 1
                lab = f'<{name(x)}{j}>'
                tags[lab] = tr_attrs(x, t)
                key += lab
            else:
                key += x
        key = key.strip()
        v = t(key)
        for lab, tag in tags.items():
            v = v.replace(lab, tag)
        out.append(lead + v + trail)
        run.clear()

    for x in toks:
        if x.startswith('<!--') or x.startswith('<script') or x.startswith('<style'):
            flush(); out.append(x); continue
        if x.startswith('<'):
            if name(x) in INLINE:
                run.append(x); continue
            flush(); out.append(tr_attrs(x, t)); continue
        run.append(x)
    flush()
    return ''.join(out)


def tr_json(o, t, lang, slug):
    if isinstance(o, dict):
        r = {k: tr_json(v, t, lang, slug) for k, v in o.items()}
        if 'inLanguage' in r:
            r['inLanguage'] = i18n.meta(lang)['hreflang']
        return r
    if isinstance(o, list):
        return [tr_json(v, t, lang, slug) for v in o]
    if isinstance(o, str):
        if o.startswith(B + '/') and not o.startswith(B + '/img/'):
            p = o[len(B):]
            path, _, frag = p.partition('#')
            if frag and path == '/':  # @id організації (/#business) — один на всі мови
                return o
            new = local(path, lang) or path
            return B + new + ('#' + frag if frag else '')
        return t(o) if CYR.search(o) else o
    return o


CALL = {'en': 'Call', 'ru': 'Позвонить'}


def page_path(lang, slug):
    return '/' + i18n.meta(lang)['prefix'] + 'proekty/' + slug


def build(slug, lang):
    import chrome
    t = Tr(lang, slug)
    s = open(os.path.join(ROOT, 'proekty', slug + '.html'), encoding='utf-8').read()
    u = B + page_path(lang, slug)
    head, body = s.split('</head>', 1)
    head = re.sub(r'<title>(.*?)</title>', lambda m: '<title>' + html.escape(t(html.unescape(m.group(1))), quote=False) + '</title>', head, count=1)
    for k in ('name="description"', 'property="og:title"', 'property="og:description"', 'name="twitter:title"', 'name="twitter:description"', 'property="og:image:alt"'):
        head = re.sub(r'(<meta ' + k + r' content=")([^"]*)', lambda m: m.group(1) + html.escape(t(html.unescape(m.group(2))), quote=True).replace('&#x27;', "'"), head, count=1)
    head = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, head, count=1)
    head = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + u, head, count=1)
    head = re.sub(r'(<meta property="og:locale" content=")[^"]*', lambda m: m.group(1) + {'en': 'en_US', 'ru': 'ru_RU'}[lang], head, count=1)
    head = re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)',
                  lambda m: m.group(1) + json.dumps(tr_json(json.loads(m.group(2)), t, lang, slug), ensure_ascii=False).replace('</', '<\\/') + m.group(3), head, flags=re.S)
    # тіло: шапку/футер/пігулку перебудує chrome.apply — їх не перекладаємо
    keep = {}

    def hold(m):
        keep[f'\x00{len(keep)}\x00'] = m.group(0)
        return f'\x00{len(keep) - 1}\x00'
    body = re.sub(r'<!--m-fix--><div class="mbar".*?</div><!--/mb-menu-->', lambda m: m.group(0).replace('>Подзвонити</a>', '>' + CALL[lang] + '</a>'), body, flags=re.S)
    body = re.sub(r'<!--chrome:h-->.*?<!--/chrome:h-->|<!--chrome:f-->.*?<!--/chrome:f-->|<!--chrome:skip-->.*?<!--/chrome:skip-->|<!--m-fix--><div class="mbar".*?</div><!--/mb-menu-->', hold, body, flags=re.S)
    body = tr_html(body, t)
    for k, v in keep.items():
        body = body.replace(k, v)
    body = fix_links(body, lang)
    s = head + '</head>' + body
    s = i18n.html_attrs(s, lang)
    if t.miss:
        return None, t.miss
    rel = i18n.path_to_file(page_path(lang, slug))
    members = i18n.cluster_of(page_path(lang, slug)) or {}
    members = dict(members, **{lang: page_path(lang, slug)})
    s = i18n.set_alternates(s, members)
    return chrome.apply(s, rel), []


def clusters():
    """case-<slug> і portfolio: uk + мови з перекладом (рядок у словнику)."""
    old = json.load(open(os.path.join(i18n.HERE, 'lang', 'clusters.json'), encoding='utf-8'))
    c = {'_': 'Генерує tools/site/caselang.py: сторінки проєктів /proekty/<slug> і портфоліо мовами (руками не правити).'}
    c['portfolio'] = {'uk': '/portfolio', **{l: f'/{i18n.meta(l)["prefix"]}portfolio' for l in LANGS if load(l).get('_portfolio')}}
    for slug in cases():
        cid = 'case-' + slug
        if cid in old:  # уже є (напр. case-monpark — «Повний проєкт»): не змішуємо
            cid = 'proekt-' + slug
        c[cid] = {'uk': '/proekty/' + slug, **{l: page_path(l, slug) for l in LANGS if slug in load(l)}}
    return c


def write_clusters(check):
    c = clusters()
    new = json.dumps(c, ensure_ascii=False, indent=1) + '\n'
    old = open(CL, encoding='utf-8').read() if os.path.exists(CL) else None
    if old != new:
        if check:
            return ['tools/site/lang/clusters-cases.json застарів']
        open(CL, 'w', encoding='utf-8').write(new)
        i18n.clusters.__defaults__[0].clear()
    return []


# ── портфоліо ─────────────────────────────────────────────────────────────────────────────────────────────
PF_SKIP = {'img', 'srcset', 'sizes', 'id', 'slug', 'lang', 'service', 't'}


def md_links(v, lang):
    return re.sub(r'\]\((/[^)\s]*)\)', lambda m: '](' + (local(m.group(1), lang) or m.group(1)) + ')', v)


def tr_pf(o, t, lang, name=None, key=None):
    if isinstance(o, dict):
        nm = o.get('h2') if o.get('t') == 'project' else name
        r = {}
        for k, v in o.items():
            r[k] = v if k in PF_SKIP else tr_pf(v, t, lang, nm, k)
        if o.get('t') == 'project':
            r['href'] = local(o['href'], lang) or o['href']
        return r
    if isinstance(o, list):
        if len(o) == 2 and all(isinstance(x, str) for x in o) and o[0].startswith(('/', '#', 'tel:')):  # [href, текст]
            return [local(o[0], lang) or o[0], tr_pf(o[1], t, lang, name)]
        return [tr_pf(v, t, lang, name, key) for v in o]
    if isinstance(o, str):
        if o.startswith(B + '/') and not o.startswith(B + '/img/'):
            p, _, frag = o[len(B):].partition('#')
            return B + (local(p, lang) or p) + ('#' + frag if frag else '')
        if key == 'href':
            return local(o, lang) or o
        if not CYR.search(o):
            return o
        if name and name in o and key == 'alt':
            return t(o.replace(name, '{N}')).replace('{N}', name)
        return md_links(t(o), lang)
    return o


def portfolio(lang, check):
    src = json.load(open(os.path.join(ROOT, 'tools/site/pages/uk-portfolio.json'), encoding='utf-8'))
    d = load(lang).get('_portfolio')
    if not d:
        return []
    t = Tr(lang, '_portfolio')
    t.maps = [d, load(lang).get('_common', {})]
    p = tr_pf(src, t, lang)
    p['lang'], p['service'] = lang, src['service']
    for x in p.get('ld_raw', []):
        if 'inLanguage' in x:
            x['inLanguage'] = i18n.meta(lang)['hreflang']
    if t.miss:
        return [f'{lang}-portfolio: бракує перекладу: {k!r}' for k in dict.fromkeys(t.miss)]
    f = os.path.join(ROOT, f'tools/site/pages/{lang}-portfolio.json')
    new = json.dumps(p, ensure_ascii=False, indent=1) + '\n'
    old = open(f, encoding='utf-8').read() if os.path.exists(f) else None
    if old != new:
        if check:
            return [f'tools/site/pages/{lang}-portfolio.json застарів']
        open(f, 'w', encoding='utf-8').write(new)
    return []


def check_text(s, lang, rel):
    """Після перекладу в <main>/<head> не лишилося української (ru — літер і/ї/є/ґ/ʼ, en — кирилиці)."""
    vis = re.sub(r'<!--chrome:[hf]-->.*?<!--/chrome:[hf]-->|<script(?! type="application/ld)\b.*?</script>|<style\b.*?</style>', '', s, flags=re.S)
    vis = re.sub(r'data-service="[^"]*"|<link [^>]*>', '', vis)
    rx = CYR if lang == 'en' else UK_ONLY
    bad = sorted(set(m.group(0) for m in re.finditer(r'[^<>"]{0,30}' + rx.pattern + r'[^<>"]{0,30}', vis)))
    return [f'{rel}: лишилось «{b.strip()}»' for b in bad[:5]]


def run(check=False):
    errs = write_clusters(check)
    built = []
    for lang in LANGS:
        have = load(lang)
        for slug in cases():
            if slug not in have:
                continue
            s, miss = build(slug, lang)
            rel = i18n.path_to_file(page_path(lang, slug))
            if miss:
                errs += [f'{rel}: бракує перекладу: {k!r}' for k in dict.fromkeys(miss)]
                continue
            errs += check_text(s, lang, rel)
            f = os.path.join(ROOT, rel)
            old = open(f, encoding='utf-8').read() if os.path.exists(f) else None
            if old != s:
                if check:
                    errs.append(f'{rel} застарів'); continue
                os.makedirs(os.path.dirname(f), exist_ok=True)
                open(f, 'w', encoding='utf-8').write(s)
                print('✓', rel)
            built.append(B + page_path(lang, slug))
    return errs, built


def missing(lang):
    out = {}
    for slug in cases():
        s, miss = build(slug, lang)
        for k in dict.fromkeys(miss):
            out.setdefault(k, []).append(slug)
    t = Tr(lang, '_portfolio')
    t.maps = [load(lang).get('_portfolio', {}), load(lang).get('_common', {})]
    tr_pf(json.load(open(os.path.join(ROOT, 'tools/site/pages/uk-portfolio.json'), encoding='utf-8')), t, lang)
    for k in dict.fromkeys(t.miss):
        out.setdefault(k, []).append('_portfolio')
    res = {}
    for k, v in out.items():
        res.setdefault('_common' if len(set(v)) > 1 else v[0], {})[k] = ''
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    check = '--check' in sys.argv
    if '--missing' in sys.argv:
        missing(sys.argv[sys.argv.index('--missing') + 1]); sys.exit(0)
    if 'portfolio' in sys.argv:
        errs = write_clusters(check)
        for l in LANGS:
            errs += portfolio(l, check)
        print('\n'.join(errs) if errs else 'Портфоліо мовами: OK')
        sys.exit(1 if errs else 0)
    errs, built = run(check)
    if not check:
        import landing
        i18n.sync(verbose=False)  # hreflang на uk-сторінках проєктів і перемикач мов
        errs = run(False)[0]  # після sync — ще раз (ідемпотентно)
        if built:
            landing.sitemap(built, datetime.date.today().isoformat())
    print('\n'.join(dict.fromkeys(errs)) if errs else 'Проєкти мовами: OK')
    sys.exit(1 if errs else 0)
