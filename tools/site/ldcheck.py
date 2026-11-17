#!/usr/bin/env python3
"""Локальна перевірка JSON-LD на всіх індексованих сторінках (schema.org + вимоги Google rich results).

  python3 tools/site/ldcheck.py            # звіт: помилки (E) і попередження (W) за типами, приклади сторінок
  python3 tools/site/ldcheck.py --strict   # код 1, якщо є помилки (крок перед пушем)
  python3 tools/site/ldcheck.py --file en/about.html   # усі зауваження однієї сторінки

Помилка — те, через що Google відкидає розмітку або schema.org-тип/властивість невалідні (немає обовʼязкової властивості,
невідомий тип, відносний URL, дата не ISO 8601, два FAQPage на сторінці, ціна без валюти). Попередження — рекомендовані властивості.
Правити — у генераторах (landing.py, rich.py, blog/build.py, caselang.py…), не в HTML.
"""
import json, os, re, sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP_DIRS = {'.git', 'tools', 'node_modules', '.claude', 'assets', 'img', 'fonts', 'functions', 'migrations', 'styleguide', 'kabinet'}
# типи schema.org, які сайт використовує (решта — помилка: опечатка або вигаданий тип)
KNOWN = {'Organization', 'LocalBusiness', 'HomeAndConstructionBusiness', 'GeneralContractor', 'ProfessionalService', 'WebSite', 'WebPage',
         'AboutPage', 'ContactPage', 'CollectionPage', 'FAQPage', 'Question', 'Answer', 'BreadcrumbList', 'ListItem', 'ItemList', 'Service',
         'Offer', 'AggregateOffer', 'OfferCatalog', 'PriceSpecification', 'UnitPriceSpecification', 'QuantitativeValue', 'ImageObject',
         'ImageGallery', 'VideoObject', 'CreativeWork', 'Article', 'BlogPosting', 'Blog', 'Person', 'Place', 'City', 'Country', 'Continent',
         'AdministrativeArea', 'State', 'PostalAddress', 'GeoCoordinates', 'OpeningHoursSpecification', 'ContactPoint', 'Product', 'Brand',
         'AggregateRating', 'Review', 'Rating', 'SearchAction', 'EntryPoint', 'HowTo', 'HowToStep', 'Residence', 'House', 'Apartment',
         'Accommodation', 'SpeakableSpecification', 'DefinedRegion', 'GeoShape', 'MonetaryAmount', 'Thing', 'Language', 'ProfilePage',
         '3DModel', 'MediaObject', 'TouristAttraction', 'Restaurant', 'Hotel', 'Event', 'Course'}
BUSINESS = {'LocalBusiness', 'HomeAndConstructionBusiness', 'GeneralContractor', 'ProfessionalService'}
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$')
URL_KEYS = {'url', 'item', 'logo', 'image', 'contentUrl', 'thumbnailUrl', 'embedUrl', 'sameAs', 'hasMap', 'mainEntityOfPage', 'license', 'acquireLicensePage'}


def types_of(o):
    t = o.get('@type')
    return set(t if isinstance(t, list) else [t]) if t else set()


def is_ref(o):
    """Посилання на вузол за @id (без власних даних) — перевіряємо лише наявність @id."""
    return set(o) <= {'@id', '@type', 'name', 'url'} and '@id' in o


def check_node(o, E, W, ctx):
    ts = types_of(o)
    for t in ts:
        if t not in KNOWN:
            E(f'невідомий тип {t}')
    has = lambda k: o.get(k) not in (None, '', [], {})
    for k in URL_KEYS & set(o):
        vals = o[k] if isinstance(o[k], list) else [o[k]]
        for v in vals:
            if isinstance(v, str) and not v.startswith(('http://', 'https://')):
                E(f'{"/".join(sorted(ts)) or "?"}.{k}: відносний URL «{v[:60]}»')
    for k in ('datePublished', 'dateModified', 'uploadDate', 'dateCreated', 'foundingDate', 'validFrom'):
        if k in o and not (isinstance(o[k], str) and (ISO.match(o[k]) or (k == 'foundingDate' and re.match(r'^\d{4}$', o[k])))):
            E(f'{k} не ISO 8601: {o[k]!r}')
    if is_ref(o) and not (ts & {'ListItem'}):
        return
    if ts & ({'Organization'} | BUSINESS):
        for k in ('name', 'url'):
            if not has(k):
                E(f'Organization без {k}')
        if not has('logo') and not ctx.get('nested'):
            W('Organization без logo')
    if ts & BUSINESS:
        a = o.get('address')
        if not isinstance(a, dict) or not all(a.get(k) for k in ('streetAddress', 'addressLocality', 'addressCountry')):
            E('LocalBusiness: address без streetAddress/addressLocality/addressCountry')
        for k in ('telephone', 'openingHoursSpecification', 'priceRange', 'geo', 'image', 'sameAs', 'areaServed'):
            if not has(k):
                W(f'LocalBusiness без {k}')
    if 'Service' in ts and ctx.get('parent_key') == 'itemOffered':  # послуга в OfferCatalog студії: постачальник — сама студія
        if not has('name'):
            E('Service без name')
    elif 'Service' in ts:
        for k in ('name', 'provider'):
            if not has(k):
                E(f'Service без {k}')
        for k in ('offers', 'areaServed', 'url'):
            if not has(k):
                W(f'Service без {k}')
    if ts & {'Offer', 'AggregateOffer'}:
        ps = o.get('priceSpecification')
        ps = ps if isinstance(ps, list) else [ps] if ps else []
        if 'AggregateOffer' in ts:
            if not (has('lowPrice') and has('priceCurrency')):
                E('AggregateOffer без lowPrice/priceCurrency')
        elif not (has('price') or ps or has('itemOffered')):
            E('Offer без price і priceSpecification')
        if has('price') and not has('priceCurrency'):
            E('Offer: price без priceCurrency')
    if ts & {'PriceSpecification', 'UnitPriceSpecification'}:
        if not (has('price') or has('minPrice')):
            E('PriceSpecification без price/minPrice')
        if not has('priceCurrency'):
            E('PriceSpecification без priceCurrency')
        for k in ('price', 'minPrice', 'maxPrice'):
            if k in o and not isinstance(o[k], (int, float)) and not re.match(r'^\d+(\.\d+)?$', str(o[k])):
                E(f'PriceSpecification.{k} не число: {o[k]!r}')
    if 'FAQPage' in ts:
        me = o.get('mainEntity') or []
        if not me:
            E('FAQPage без mainEntity')
        for q in me if isinstance(me, list) else [me]:
            if not (isinstance(q, dict) and q.get('name') and isinstance(q.get('acceptedAnswer'), dict) and q['acceptedAnswer'].get('text')):
                E('FAQPage: Question без name або acceptedAnswer.text')
                break
    if 'BreadcrumbList' in ts:
        it = o.get('itemListElement') or []
        if len(it) < 1:
            E('BreadcrumbList без itemListElement')
        for i, li in enumerate(it, 1):
            if not isinstance(li, dict) or li.get('position') != i:
                E('BreadcrumbList: position не 1..N')
                break
            if not li.get('name') and not (isinstance(li.get('item'), dict) and li['item'].get('name')):
                E('BreadcrumbList: ListItem без name')
                break
            if i < len(it) and not li.get('item'):
                E('BreadcrumbList: ListItem (не останній) без item')
                break
    if ts & {'Article', 'BlogPosting'} and ctx.get('parent_key') in ('blogPost', 'itemListElement', 'hasPart'):
        for k in ('headline', 'url'):  # анонс у списку блогу: повні дані — на сторінці статті
            if not has(k):
                E(f'BlogPosting у списку без {k}')
    elif ts & {'Article', 'BlogPosting'}:
        for k in ('headline', 'datePublished', 'author', 'image'):
            if not has(k):
                E(f'Article без {k}')
        if has('headline') and len(o['headline']) > 110:
            W('Article.headline > 110 символів')
        for k in ('dateModified', 'publisher', 'mainEntityOfPage', 'inLanguage'):
            if not has(k):
                W(f'Article без {k}')
        au = o.get('author')
        for x in au if isinstance(au, list) else [au] if au else []:
            if not (isinstance(x, dict) and x.get('name') and x.get('@type') in ('Person', 'Organization')):
                E('Article.author без @type Person/Organization або name')
            elif not x.get('url'):
                W('Article.author без url')
        pub = o.get('publisher')
        if isinstance(pub, dict) and not is_ref(pub) and not pub.get('logo'):
            W('Article.publisher без logo')
    if 'ImageObject' in ts:
        if not (has('contentUrl') or has('url')):
            E('ImageObject без contentUrl/url')
        elif not has('contentUrl'):
            W('ImageObject без contentUrl')
        if not any(has(k) for k in ('creator', 'creditText', 'copyrightNotice', 'license')):
            W('ImageObject без creator/creditText/copyrightNotice/license (метадані зображень Google)')
    if 'VideoObject' in ts:
        for k in ('name', 'thumbnailUrl', 'uploadDate'):
            if not has(k):
                E(f'VideoObject без {k}')
        if not has('description'):
            W('VideoObject без description')
    if 'Question' in ts and not ctx.get('in_faq') and not has('acceptedAnswer'):
        W('Question поза FAQPage без acceptedAnswer')
    if 'Person' in ts and not has('name'):
        E('Person без name')
    if 'ItemList' in ts and not has('itemListElement'):
        E('ItemList без itemListElement')
    if ts & {'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'} and not has('name'):
        W('WebPage без name')


def walk(o, E, W, ctx, seen):
    if isinstance(o, list):
        for x in o:
            walk(x, E, W, ctx, seen)
        return
    if not isinstance(o, dict):
        return
    for t in types_of(o):
        seen[t] += 1
    check_node(o, E, W, ctx)
    sub = dict(ctx, nested=True, in_faq=ctx.get('in_faq') or 'FAQPage' in types_of(o))
    for k, v in o.items():
        if k != '@context':
            walk(v, E, W, dict(sub, parent_key=k), seen)


def page_issues(rel, s):
    errs, warns, seen = [], [], Counter()
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    for b in blocks:
        try:
            d = json.loads(b.replace('<\\/', '</'))
        except ValueError as x:
            errs.append(f'JSON не парситься: {x}')
            continue
        roots = d if isinstance(d, list) else [d]
        for r in roots:
            if isinstance(r, dict) and r.get('@context') not in ('https://schema.org', 'http://schema.org', 'https://schema.org/'):
                errs.append('немає @context https://schema.org')
        for r in roots:
            if isinstance(r, dict) and any(isinstance(x, dict) and '@graph' in x for x in r.get('@graph') or []):
                errs.append('@graph усередині @graph (Google читає лише верхній рівень)')
        walk(d, errs.append, warns.append, {}, seen)
    if seen['FAQPage'] > 1:
        errs.append(f'{seen["FAQPage"]} FAQPage на сторінці (Google — лише один)')
    return blocks, errs, warns, seen


def pages():
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = sorted(d for d in dn if d not in SKIP_DIRS)
        for f in sorted(fn):
            if f.endswith('.html'):
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, ROOT)
                s = open(p, encoding='utf-8').read()
                if re.search(r'<meta name="robots" content="[^"]*noindex', s.split('</head>')[0]) or rel.startswith(('404', 'google')) or '/404.html' in rel:
                    continue
                yield rel, s


def main():
    if '--file' in sys.argv:
        rel = sys.argv[sys.argv.index('--file') + 1]
        _, e, w, seen = page_issues(rel, open(os.path.join(ROOT, rel), encoding='utf-8').read())
        print('типи:', dict(seen))
        for x in e:
            print('E', x)
        for x in w:
            print('W', x)
        return 1 if e else 0
    E, W, ex, total, nold = Counter(), Counter(), defaultdict(list), 0, []
    types = Counter()
    for rel, s in pages():
        total += 1
        blocks, e, w, seen = page_issues(rel, s)
        types.update(seen)
        if not blocks:
            nold.append(rel)
        for x in set(e):
            E[x] += 1
            len(ex[x]) < 3 and ex[x].append(rel)
        for x in set(w):
            W[x] += 1
            len(ex[x]) < 3 and ex[x].append(rel)
    print(f'ldcheck: {total} індексованих сторінок, без JSON-LD — {len(nold)}' + (f' ({", ".join(nold[:6])}…)' if nold else ''))
    print('типи:', ', '.join(f'{t} {n}' for t, n in types.most_common(20)))
    print(f'помилки: {sum(E.values())} ({len(E)} видів)')
    for x, n in E.most_common():
        print(f'  E {n:5}  {x}   напр. {", ".join(ex[x])}')
    print(f'попередження: {sum(W.values())} ({len(W)} видів)')
    for x, n in W.most_common():
        print(f'  W {n:5}  {x}   напр. {", ".join(ex[x])}')
    return 1 if ('--strict' in sys.argv and E) else 0


if __name__ == '__main__':
    sys.exit(main())
