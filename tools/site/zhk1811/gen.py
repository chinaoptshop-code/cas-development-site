#!/usr/bin/env python3
"""Хаб «Ремонт у ЖК Києва» + 19 сторінок ЖК мовами (en, es, pl, de, fr, pt, zh, ar; гілка i18n/zhk1811, 18.11.2026).

  python3 tools/site/zhk1811/gen.py    # tools/site/zhk1811/<мова>.json → tools/site/pages/<мова>-<slug>.json
                                         # + tools/site/lang/clusters-zhk.json (uk, ru + 8 мов)
  далі — python3 tools/site/landing.py (як для будь-якого лендингу).

Тексти — переклад uk-сторінок (tools/site/pages/uk-remont-kvartyr*-zhk-*.json); факти — лише з CLAUDE.md і з uk-сторінок
(клас, площі, адреса, забудовник — довідково, з відкритих джерел; проєктів CAS у цих ЖК не вигадуємо).
Спільне для мов — тут (ZHK: район, клас, площі, забудовник, картки, сусіди, площа для орієнтиру бюджету);
мовне — у <мова>.json: "t" (шаблони, картки, ярлики), "hub" (хаб), "zhk" (лід, розділ, 2 FAQ, адреса кожного ЖК).
Етапи — з «Ремонту в новобудові» тієї ж мови; фото галереї — ті самі, що на uk-сторінці (підпис alt — мовою, landing.py).
Вхідні посилання: хаб мови → усі ЖК; «Ремонт квартир» мови (кластер /remont-kvartyr-kyiv) → хаб (блок near).
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, SITE)
import i18n  # noqa: E402

PAGES = os.path.join(SITE, 'pages')
UK_HUB = 'remont-kvartyr-zhk-kyiv'
RU_HUB = 'remont-kvartir-zhk-kiev'
D = ('pechersk', 'holosiiv', 'podil', 'shevchenko', 'dnipro')  # порядок районів у хабі (як uk)
# ключ → (uk-slug без «remont-kvartyry-zhk-», назва латиницею, район, клас, площі, забудовник, особливість, картки, площа бюджету)
# площі: (від, до, вид): r — діапазон, f — від, p — «від–до і більші»; клас: b — бізнес, p — преміум, bp — бізнес/преміум, cb — комфорт/бізнес
ZHK = {
    'novopecherski-lypky': ('novopecherski-lypky', 'Novopecherski Lypky', 'pechersk', 'bp', ('50.6', '225.7', 'r'), 'City One Development (Stolitsa Group)', 'many100', ['turnkey', 'duplex', 'large'], 120),
    'edeldorf-hills': ('edeldorf-hills', 'Edeldorf Hills', 'pechersk', 'p', None, 'Futura Hata', None, ['turnkey', 'newbuild', 'design'], 100),
    'triiinity': ('triiinity', 'TRIIINITY', 'pechersk', 'p', ('53', '125', 'r'), 'Seven Hills', None, ['turnkey', 'design', 'furnish'], 90),
    'taryan-towers': ('taryan-towers', 'Taryan Towers', 'pechersk', 'p', ('62', '87', 'p'), 'Taryan Group', None, ['turnkey', 'tower', 'design'], 85),
    'bulvar-fontaniv': ('bulvar-fontaniv', 'Bulvar Fontaniv', 'pechersk', 'p', ('64', '156', 'r'), None, None, ['turnkey', 'large', 'design'], 110),
    'linden-luxury-residences': ('linden-luxury-residences', 'Linden Luxury Residences', 'pechersk', 'p', ('75', '556', 'r'), 'Budhouse Group', None, ['turnkey', 'large', 'design'], 150),
    'greenville-pechersk': ('greenville-na-pechersku', 'Greenville na Pechersku', 'pechersk', 'b', ('73', None, 'f'), None, 'duplex_terr', ['turnkey', 'duplex', 'terrace'], 90),
    'maxima-residence': ('maxima-residence', 'Maxima Residence', 'pechersk', 'b', ('50', '181', 'r'), 'RIEL & Bosphorus Development', None, ['turnkey', 'design', 'furnish'], 80),
    'nordica-residence': ('nordica-residence', 'Nordica Residence', 'pechersk', 'b', None, 'RIEL', None, ['turnkey', 'design', 'furnish'], 75),
    'hvardiiskyi': ('hvardiiskyi', 'Hvardiiskyi', 'pechersk', 'bp', None, 'Kyivmiskbud', None, ['turnkey', 'design', 'furnish'], 90),
    'a136-highlight-tower': ('a136-highlight-tower', 'A136 Highlight Tower', 'holosiiv', 'b', None, None, None, ['turnkey', 'tower', 'design'], 65),
    'montreal-house': ('montreal-house', 'Montreal House', 'holosiiv', 'b', ('51', '78', 'p'), 'Alliance Novobud', None, ['turnkey', 'design', 'furnish'], 65),
    'senat': ('senat', 'Senat', 'holosiiv', 'b', ('34', '94', 'r'), 'GEOS', 'duplex_terr2', ['turnkey', 'duplex', 'terrace'], 60),
    'life-story': ('life-story', 'Life Story', 'holosiiv', 'b', ('49.93', None, 'f'), 'LEV Development', None, ['turnkey', 'design', 'furnish'], 60),
    'respublika': ('respublika', 'Respublika', 'holosiiv', 'cb', None, 'KAN Development', None, ['turnkey', 'design', 'furnish'], 55),
    'podil-hrad': ('podil-hrad', 'Podil Hrad', 'podil', 'b', ('65.5', '79', 'r'), 'Kyivmiskbud', '4room', ['turnkey', 'design', 'furnish'], 75),
    'unit-home': ('unit-home', 'UNIT.Home', 'shevchenko', 'b', None, 'UDP', None, ['turnkey', 'design', 'furnish'], 70),
    'novyi-avtohraf': ('novyi-avtohraf', 'Novyi Avtohraf', 'dnipro', 'b', None, 'DIM', None, ['turnkey', 'tower', 'design'], 70),
    'rusaniv-residence': ('rusaniv-residence', 'Rusaniv Residence', 'dnipro', 'b', ('104', '179', 'r'), 'Citex Development', 'duplex', ['turnkey', 'duplex', 'large'], 140),
}
UK2KEY = {v[0]: k for k, v in ZHK.items()}
REL = ['/remont-kvartyr-kyiv', '/remont-novobudovy-kyiv', '/remont-pid-klyuch-kyiv', '/dyzain-interieru-kyiv', '/mebliuvannia-kvartyry-kyiv', '/kalkuliator-remontu']
HUB_REL = ['/dyzain-remont-kvartyry-pechersk', '/remont-premium-klasu-kyiv', '/dyzain-interieru-premium-kyiv'] + REL


def loc(path, lang):
    m = i18n.cluster_of(path)
    if not m or lang not in m:
        raise SystemExit(f'{lang}: немає сторінки для {path}')
    return m[lang]


def page_of(path, lang):
    slug = loc(path, lang).split('/')[-1]
    f = os.path.join(PAGES, f'{lang}-{slug}.json')
    return f, json.load(open(f, encoding='utf-8'))


def dec(x, lang):
    return x if lang in ('en', 'zh') else x.replace('.', ',')


def area(a, lang, T):
    if not a:
        return ''
    lo, hi, k = a
    u = T['unit']
    if k == 'f':
        return T['area_from'].format(a=dec(lo, lang), u=u)
    s = f'{dec(lo, lang)}–{dec(hi, lang)} {u}'
    return T['area_plus'].format(s=s) if k == 'p' else s


def title(T, n):
    """<title> до 60 символів (seo.py): "title" — рядок або варіанти від повного до короткого; « | CAS» landing.py знімає сам."""
    vs = T['title'] if isinstance(T['title'], list) else [T['title']]
    for v in vs:
        t = v.format(n=n)
        if len(t) <= 60 or len(t.replace(' | CAS', '')) <= 60:
            return t
    return vs[-1].format(n=n)


def dump(p, out):
    json.dump(p, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(out, 'a', encoding='utf-8').write('\n')


def main():
    uk = {UK2KEY[os.path.basename(f)[23:-5]]: json.load(open(f, encoding='utf-8')) for f in glob.glob(os.path.join(PAGES, 'uk-remont-kvartyry-zhk-*.json'))}
    ru_slugs = {k: json.load(open(os.path.join(PAGES, f'uk-remont-kvartyry-zhk-{v[0]}.json'), encoding='utf-8'))['pair'] for k, v in ZHK.items()}
    clusters = {'_': 'Кластери гілки i18n/zhk1811 (18.11.2026): хаб «Ремонт у ЖК Києва» і 19 ЖК — uk, ru + 8 мов (tools/site/zhk1811/gen.py). i18n.py зливає clusters-*.json з clusters.json за ключем.'}
    clusters['zhk-hub'] = {'uk': '/' + UK_HUB, 'ru': '/ru/' + RU_HUB}
    for k, v in ZHK.items():
        clusters['zhk-' + k] = {'uk': '/remont-kvartyry-zhk-' + v[0], 'ru': '/ru/' + ru_slugs[k]}
    uk_hub = json.load(open(os.path.join(PAGES, f'uk-{UK_HUB}.json'), encoding='utf-8'))
    hub_gal = next(x for x in uk_hub['sections'] if x['t'] == 'gallery')['items']
    for f in sorted(glob.glob(os.path.join(HERE, '*.json'))):
        lang = os.path.basename(f)[:-5]
        C = json.load(open(f, encoding='utf-8'))
        T, H, Z = C['t'], C['hub'], C['zhk']
        assert set(Z) == set(ZHK), f'{lang}: ЖК {set(ZHK) ^ set(Z)}'
        pre = f'/{lang}/'
        hub_url = pre + C['slugs']['hub']
        url = {k: pre + C['slugs'][k] for k in ZHK}
        clusters['zhk-hub'][lang] = hub_url
        for k in ZHK:
            clusters['zhk-' + k][lang] = url[k]
        steps = page_of('/remont-novobudovy-kyiv', lang)[1]['steps']
        rel = [[hub_url, T['hub_short']]] + [[loc(u, lang), n] for u, n in zip(REL, T['rel'])]
        name = {k: T['name'].format(n=ZHK[k][1]) for k in ZHK}
        for k, (ukslug, n, dist, cls, ar, dev, feat, cards, barea) in ZHK.items():
            z, u = Z[k], uk[k]
            ref = [T['ref_dev'].format(dev=dev)] if dev else []
            ref += [T['ref_addr'].format(addr=z['addr'])] if z.get('addr') else []
            ref_p = T['ref'].format(x=T['sep'].join(ref)) if ref else T['ref_none']
            desc = T['desc'].format(n=n, svc=T['svc'].format(n=n), d=T['dist'][dist])
            if len(desc) > 160:
                desc = T['desc_short'].format(n=n, svc=T['svc'].format(n=n), d=T['dist'][dist])
            near = [[url[UK2KEY[x[0][21:]]], name[UK2KEY[x[0][21:]]]] for x in u['near'][1]]
            p = {'slug': C['slugs'][k], 'lang': lang, 'service': T['svc'].format(n=n), 'title': title(T, n), 'description': desc,
                 'h1': T['h1'].format(n=n), 'price': T['price'], 'lead': z['lead'], 'parent': [hub_url, T['hub_short']],
                 'cards': [T['cards'][c] for c in cards], 'about': [[z['h2'], z['p'] + [ref_p]]],
                 'budget': {'area': barea, 'h2': T['budget_h2'].format(a=barea), 'p': T['budget_p'].format(a=barea)},
                 'gallery': [g[:2] for g in u['gallery']], 'steps': steps, 'guarantees': True,
                 'faq': [[T['price_q'].format(n=n), T['price_a'].format(a=barea)]] + z['faq'] + T['faq_common'],
                 'near': [T['near'], near], 'rel': rel}
            dump(p, os.path.join(PAGES, f'{lang}-{C["slugs"][k]}.json'))
        # хаб мови: районні картки з посиланнями на всі ЖК мови
        secs = [{'t': 'text', 'h2': H['s1'][0], 'p': H['s1'][1]}]
        for dist in D:
            items = []
            for k, (ukslug, n, dd, cls, ar, dev, feat, cards, barea) in ZHK.items():
                if dd != dist:
                    continue
                s = T['cls_l'] + ': ' + T['cls'][cls] + (', ' + area(ar, lang, T) if ar else '') + (', ' + T['feat'][feat] if feat else '') + '.'
                s += (' ' + T['addr_l'] + ': ' + Z[k]['addr'] + '.' if Z[k].get('addr') else '') + (' ' + T['dev_l'].format(dev=dev) if dev else '')
                items.append({'h': name[k], 'href': url[k], 'p': s, 'more': T['more']})
            secs.append({'t': 'cards', 'h2': T['dist_h2'][dist], 'items': items})
        secs += [{'t': 'text', 'h2': H['s2'][0], 'p': H['s2'][1]}, {'t': 'gallery', 'h2': H['gal'], 'items': [g[:2] for g in hub_gal]},
                 {'t': 'guarantees'}, {'t': 'faq', 'h2': H['faq'][0], 'items': H['faq'][1]},
                 {'t': 'rel', 'h2': H['rel'], 'items': [[loc(u, lang), nm] for u, nm in zip(HUB_REL, H['rel_names'] + T['rel'])]}]
        hub = {'slug': C['slugs']['hub'], 'lang': lang, 'service': H['service'], 'title': H['title'], 'description': H['description'],
               'h1': H['h1'], 'price': T['price'], 'lead': H['lead'], 'sections': secs}
        dump(hub, os.path.join(PAGES, f'{lang}-{C["slugs"]["hub"]}.json'))
        # «Ремонт квартир» мови → хаб ЖК (вхідне посилання)
        af, ap = page_of('/remont-kvartyr-kyiv', lang)
        if ap.get('near') and hub_url not in [x[0] for x in ap['near'][1]]:
            ap['near'][1].append([hub_url, H['apt_link']])
            dump(ap, af)
    dump(clusters, os.path.join(SITE, 'lang', 'clusters-zhk.json'))
    print('ok', len(clusters) - 1, 'кластерів')


if __name__ == '__main__':
    main()
