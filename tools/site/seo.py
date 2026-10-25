#!/usr/bin/env python3
"""Технічне SEO всього сайту: перевірка всіх публічних HTML, sitemap.xml і robots.txt.

  python3 tools/site/seo.py            # звіт: помилки (код 1) і попередження
  python3 tools/site/seo.py --strict   # попередження теж дають код 1
  python3 tools/site/seo.py --quiet    # лише підсумок

Перевіряє на кожній індексованій сторінці (без noindex):
  • <title> є, до 60 символів, унікальний; meta description є, до 160 символів (для zh/ar — від 25), унікальний;
  • рівно один <h1>; canonical — на саму себе; og:url = canonical;
  • JSON-LD: json.loads кожного блоку, обовʼязкові поля типів (LocalBusiness, Organization, BreadcrumbList, FAQPage,
    Article, Product/Offer/AggregateOffer, Service, CollectionPage, ItemList); aggregateRating/review — заборонені
    (власні відгуки Google не показує й може покарати); BreadcrumbList — на всіх внутрішніх сторінках;
    Service — на лендингах послуг (areaServed); FAQPage — де на сторінці є <details>-FAQ у JSON;
  • <img>: alt є (порожній лише для декоративних), width/height, loading="lazy" у всіх, крім першого фото;
    fetchpriority="high" — не більше одного;
  • sitemap.xml: усі індексовані сторінки є, noindex-сторінок і неіснуючих URL немає, у кожного <url> є <lastmod>;
  • robots.txt: є Sitemap:, не закрито весь сайт;
  • сирітські сторінки: на сторінку немає жодного посилання з вмісту інших сторінок (шапка/футер не рахуються).
"""
import collections, glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com'
SKIP_FILES = {'privacy.html', 'terms.html'}  # сторонні юридичні шаблони (noindex)
# політики конфіденційності: посилання лише з футера/форм, хлібні крихти не потрібні
LEGAL = {'konfidentsiinist.html', 'ru/konfidentsialnost.html', 'en/privacy-policy.html', 'es/privacidad.html'}
CJK = ('zh', 'ar')

ERR, WARN = [], []


def err(page, msg): ERR.append(f'{page}: {msg}')
def warn(page, msg): WARN.append(f'{page}: {msg}')


def url_of(rel):
    p = '/' + rel
    if p.endswith('/index.html'):
        p = p[:-10] or '/'
    elif p.endswith('.html'):
        p = p[:-5]
    return p


def pages():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if rel.startswith(('tools/', 'node_modules/', '.')) or os.path.basename(rel).startswith('google'):
            continue
        out.append(rel)
    return out


def text(s):
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s))).strip()


# ---------- JSON-LD ----------
def types(o):
    t = o.get('@type')
    return set(t if isinstance(t, list) else [t]) if t else set()


def nodes(d):
    """Усі вузли з @type (рекурсивно)."""
    if isinstance(d, dict):
        if '@type' in d:
            yield d
        for v in d.values():
            yield from nodes(v)
    elif isinstance(d, list):
        for v in d:
            yield from nodes(v)


LB = {'LocalBusiness', 'HomeAndConstructionBusiness', 'GeneralContractor', 'ProfessionalService'}


def check_node(page, n):
    t = types(n)
    has = lambda *k: all(n.get(x) not in (None, '', [], {}) for x in k)
    if 'aggregateRating' in n or 'review' in n:
        err(page, f'JSON-LD {"/".join(sorted(t))}: aggregateRating/review заборонені (власні відгуки)')
    if t & LB and not has('name', 'address', 'telephone', 'url'):
        err(page, 'LocalBusiness без name/address/telephone/url')
    if t & LB and not n.get('image'):
        warn(page, 'LocalBusiness без image')
    if 'BreadcrumbList' in t:
        items = n.get('itemListElement') or []
        if not items:
            err(page, 'BreadcrumbList порожній')
        for i, it in enumerate(items, 1):
            if it.get('position') != i or not it.get('name'):
                err(page, f'BreadcrumbList: пункт {i} без position/name')
            if i < len(items) and not it.get('item'):
                err(page, f'BreadcrumbList: пункт {i} без item')
            if it.get('item') and not str(it['item']).startswith(B):
                err(page, f'BreadcrumbList: item не абсолютний {it["item"]}')
    if 'FAQPage' in t:
        qs = n.get('mainEntity') or []
        if not qs:
            err(page, 'FAQPage без mainEntity')
        for q in qs:
            if not q.get('name') or not (q.get('acceptedAnswer') or {}).get('text'):
                err(page, 'FAQPage: питання без name/acceptedAnswer.text')
    if t & {'Article', 'BlogPosting'} and n.get('mainEntityOfPage'):  # повна стаття (у списку Blog.blogPost — лише посилання)
        if not has('headline', 'image', 'datePublished', 'author', 'publisher'):
            err(page, 'Article без headline/image/datePublished/author/publisher')
        elif len(n['headline']) > 110:
            warn(page, 'Article.headline > 110')
    if 'Product' in t:
        if not has('name', 'image'):
            err(page, 'Product без name/image')
        if not n.get('offers'):
            err(page, 'Product без offers')
    if 'Offer' in t and not (n.get('itemOffered') and not n.get('price')):
        if not (n.get('price') is not None or n.get('priceSpecification')) and not n.get('itemOffered'):
            err(page, 'Offer без price')
        if n.get('price') is not None and not n.get('priceCurrency'):
            err(page, 'Offer без priceCurrency')
    if 'AggregateOffer' in t and not has('lowPrice', 'priceCurrency'):
        err(page, 'AggregateOffer без lowPrice/priceCurrency')
    if 'Service' in t and n.get('provider') is not None and not has('name', 'areaServed'):
        err(page, 'Service без name/areaServed')
    if t & {'CollectionPage', 'WebPage', 'AboutPage', 'ContactPage', 'ItemList', 'CreativeWork'} and not n.get('name'):
        warn(page, f'{"/".join(sorted(t))} без name')


def main():
    quiet, strict = '--quiet' in sys.argv, '--strict' in sys.argv
    rows, titles, descs = {}, collections.defaultdict(list), collections.defaultdict(list)
    inbound = collections.defaultdict(set)
    for rel in pages():
        s = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        head = s.split('</head>')[0]
        u = url_of(rel)
        noindex = bool(re.search(r'<meta name="robots" content="[^"]*noindex', head)) or rel.startswith(('kabinet', 'styleguide/'))
        if rel in SKIP_FILES and not noindex:
            warn(rel, 'юридичний шаблон без noindex')
        lang = (re.search(r'<html[^>]*\blang="([a-z]{2})', s) or [None, 'uk'])[1]
        rows[u] = dict(rel=rel, noindex=noindex)
        body = re.sub(r'<!--chrome:h-->.*?<!--/chrome:h-->|<!--chrome:f-->.*?<!--/chrome:f-->', '', s.split('</head>', 1)[-1], flags=re.S)
        for l in set(re.findall(r'<a\b[^>]*href="(?:' + re.escape(B) + r')?(/[^"#?]*)', body)):
            l = l.rstrip('/') or '/'
            if l != (u.rstrip('/') or '/'):
                inbound[l].add(u)
        # JSON-LD — перевіряємо і на noindex-сторінках
        lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
        alltypes = set()
        for x in lds:
            try:
                d = json.loads(x)
            except Exception as e:
                err(rel, f'JSON-LD не парситься: {e}')
                continue
            for n in nodes(d):
                alltypes |= types(n)
                check_node(rel, n)
        if noindex:
            continue
        m = re.search(r'<title>(.*?)</title>', head, re.S)
        t = html.unescape(m.group(1).strip()) if m else ''
        if not t:
            err(rel, 'немає <title>')
        elif len(t) > 60:
            warn(rel, f'title {len(t)} > 60: {t}')
        titles[t].append(rel)
        m = re.search(r'<meta name="description" content="([^"]*)"', head)
        dsc = html.unescape(m.group(1)) if m else ''
        if not dsc:
            err(rel, 'немає meta description')
        elif len(dsc) > 160:
            warn(rel, f'description {len(dsc)} > 160')
        elif len(dsc) < (25 if lang in CJK else 70):
            warn(rel, f'description закороткий ({len(dsc)})')
        descs[dsc].append(rel)
        h1 = len(re.findall(r'<h1\b', s))
        if h1 != 1:
            err(rel, f'<h1>: {h1} (має бути 1)')
        m = re.search(r'<link rel="canonical" href="([^"]+)"', head)
        canon = m.group(1) if m else None
        if canon not in (B + u, B + u.rstrip('/'), B + '/' if u == '/' else None):
            err(rel, f'canonical {canon} ≠ {B + u}')
        og = re.search(r'<meta property="og:url" content="([^"]+)"', head)
        if og and canon and og.group(1).rstrip('/') != canon.rstrip('/'):
            warn(rel, f'og:url {og.group(1)} ≠ canonical')
        if u != '/' and not re.match(r'/[a-z]{2}/?$', u) and rel not in LEGAL and 'BreadcrumbList' not in alltypes:
            warn(rel, 'немає BreadcrumbList')
        if u in ('/',) and not alltypes & LB:
            err(rel, 'на головній немає LocalBusiness (HomeAndConstructionBusiness)')
        # зображення
        vis = re.sub(r'<script\b.*?</script>|<template\b.*?</template>', '', s.split('<!--chrome:f-->')[0], flags=re.S)
        imgs = [i for i in re.findall(r'<img\b[^>]*>', vis) if re.search(r'\bsrc="[^"]', i) and '/assets/brand/' not in i]
        if len(re.findall(r'fetchpriority="high"', s)) > 1:
            err(rel, 'fetchpriority="high" більше одного')
        for k, i in enumerate(imgs):
            src = (re.search(r'\bsrc="([^"]*)"', i) or [0, '?'])[1]
            if not re.search(r'\balt="', i):
                err(rel, f'img без alt: {src}')
            if not ('width=' in i and 'height=' in i) and '${' not in i:
                warn(rel, f'img без width/height: {src}')
            if k > 0 and 'loading="lazy"' not in i and 'fetchpriority' not in i and 'loading="eager"' not in i:
                warn(rel, f'img не lazy: {src}')
    for t, lst in titles.items():
        if t and len(lst) > 1:
            err(lst[0], f'title-дубль ({len(lst)}): {t} — {", ".join(lst[1:4])}')
    for d, lst in descs.items():
        if d and len(lst) > 1:
            err(lst[0], f'description-дубль ({len(lst)}): {", ".join(lst[1:4])}')
    # sitemap
    sm = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    locs = {}
    for blk in re.findall(r'<url>(.*?)</url>', sm, re.S):
        loc = re.search(r'<loc>([^<]+)</loc>', blk).group(1)
        locs[loc.replace(B, '') or '/'] = blk
        if '<lastmod>' not in blk:
            err('sitemap.xml', f'без lastmod: {loc}')
    for u, r in rows.items():
        if r['noindex'] and u in locs:
            err('sitemap.xml', f'noindex-сторінка в sitemap: {u}')
        if not r['noindex'] and u not in locs:
            err('sitemap.xml', f'немає індексованої сторінки: {u}')
    for u in locs:
        if u not in rows:
            err('sitemap.xml', f'URL без файлу: {u}')
    rb = open(os.path.join(ROOT, 'robots.txt'), encoding='utf-8').read()
    if f'Sitemap: {B}/sitemap.xml' not in rb:
        err('robots.txt', 'немає Sitemap:')
    if re.search(r'^Disallow:\s*/\s*$', rb, re.M):
        err('robots.txt', 'Disallow: / закриває весь сайт')
    for u, r in rows.items():
        if not r['noindex'] and u != '/' and r['rel'] not in LEGAL and not inbound[u.rstrip('/') or '/']:
            warn(r['rel'], 'сирітська сторінка (немає посилань з вмісту інших сторінок)')
    idx = sum(1 for r in rows.values() if not r['noindex'])
    if not quiet:
        for x in ERR: print('ПОМИЛКА', x)
        for x in WARN: print('увага  ', x)
    print(f'SEO: {len(rows)} сторінок ({idx} індексованих), помилок {len(ERR)}, попереджень {len(WARN)}')
    sys.exit(1 if ERR or (strict and WARN) else 0)


if __name__ == '__main__':
    main()
