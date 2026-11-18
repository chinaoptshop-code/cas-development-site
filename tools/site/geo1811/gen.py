#!/usr/bin/env python3
"""Генератор сторінок «Київська область», Львів, Одеса, Дніпро мовами (en, pl, de, es, fr, pt, zh, ar; гілка i18n/p2-1811, 18.11.2026)
і ще 25 міст (13 обласних центрів + 12 міст Київщини, гілка i18n/p3-1811) — дані `cities/<мова>.json`:
`tpl` (шаблони розділів, заголовків, FAQ-банк `fq`) + `cities` (місцеві тексти: назва, «у місті», опис, лід, перший розділ,
речення про дизайн і роботи, свої FAQ, ключі FAQ-банку). Факти — з uk-сторінок і CLAUDE.md; title ≤ 60, description ≤ 155 (перевіряє скрипт).

  python3 tools/site/geo1811/gen.py    # tools/site/geo1811/<мова>.json → tools/site/pages/<мова>-<slug>.json + tools/site/lang/clusters-geo1811.json
  далі — python3 tools/site/landing.py (як для будь-якого лендингу).

Тексти — переклад uk-сторінок (tools/site/pages/uk-dyzain-i-remont-{kyivska-oblast,lviv,odesa,dnipro}.json), факти — лише з CLAUDE.md.
Картки «Що робимо», етапи, рядок ціни й «Інші послуги» — з «По Україні» тієї ж мови (geo-ukraine). У текстах «{/uk-шлях}» → сторінка цієї мови з кластера.
Міста Київщини без сторінки мовою — картки без посилання (places без href).
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, SITE)
import i18n  # noqa: E402

IDS = {'hub': 'geo-kyiv-oblast', 'lviv': 'geo-lviv', 'odesa': 'geo-odesa', 'dnipro': 'geo-dnipro'}
CENTRES = ['vinnytsia', 'zhytomyr', 'chernihiv', 'cherkasy', 'poltava', 'ivano-frankivsk', 'ternopil', 'uzhhorod', 'rivne', 'lutsk',
           'khmelnytskyi', 'chernivtsi', 'kropyvnytskyi']
UKC = {k: json.load(open(os.path.join(SITE, 'pages', f'uk-dyzain-i-remont-{k}.json'), encoding='utf-8'))
       for k in CENTRES + ['irpin', 'bucha', 'hostomel', 'vyshneve', 'boiarka', 'brovary', 'boryspil', 'vyshhorod', 'obukhiv', 'vasylkiv', 'fastiv', 'bila-tserkva']}
UK = {k: json.load(open(os.path.join(SITE, 'pages', f'uk-dyzain-i-remont-{s}.json'), encoding='utf-8'))
      for k, s in (('hub', 'kyivska-oblast'), ('lviv', 'lviv'), ('odesa', 'odesa'), ('dnipro', 'dnipro'))}
KYIV_TOWNS = ['irpin', 'bucha', 'hostomel', 'vyshneve', 'boiarka', 'brovary', 'boryspil', 'vyshhorod', 'obukhiv', 'vasylkiv', 'fastiv', 'bila-tserkva']


def loc(path, lang):
    m = i18n.cluster_of(path)
    if not m or lang not in m:
        raise SystemExit(f'{lang}: немає сторінки для {path}')
    return m[lang]


ERR = []
NEW = {}  # uk-шлях міста → шлях мови (міста цього скрипта; кластери ще не записані)


def loc(path, lang, _loc=loc):
    if path in NEW.get(lang, {}):
        return NEW[lang][path]
    return _loc(path, lang)


def links(x, lang, slugs):
    """«{/uk-шлях}» → шлях мови; «{@lviv}» → нова сторінка цієї мови."""
    if isinstance(x, list):
        return [links(i, lang, slugs) for i in x]
    if isinstance(x, dict):
        return {k: links(v, lang, slugs) for k, v in x.items()}
    if isinstance(x, str):
        x = re.sub(r'\{@(\w+)\}', lambda m: slugs[m.group(1)], x)
        return re.sub(r'\{(/[a-z0-9/-]*)\}', lambda m: loc(m.group(1), lang), x)
    return x


def dump(p, out):
    json.dump(p, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(out, 'a', encoding='utf-8').write('\n')


def city_page(k, lang, C, X, geo, rel, slugs):
    """Сторінка міста з cities/<мова>.json: місцеві тексти + шаблони мови."""
    T, c = X['tpl'], X['cities'][k]
    town = k not in CENTRES
    f = {'n': c['n'], 'in': c['in']}
    title = next((t.format(**f) for t in T['title_t' if town else 'title_c'] if len(t.format(**f)) <= 60), None)
    if not title:
        ERR.append(f'{lang}/{k}: title > 60')
        title = T['title_t' if town else 'title_c'][-1].format(**f)
    if len(c['d']) > 155:
        ERR.append(f'{lang}/{k}: description {len(c["d"])} > 155')
    h1 = T['h1_t' if town else 'h1_c'].format(**f)
    p = {'slug': X['slugs'][k], 'lang': lang, 'service': h1, 'title': title, 'description': c['d'], 'h1': h1, 'price': geo['price'], 'lead': c['lead']}
    if town:
        p['parent'] = [slugs['hub'], C['hub']['area']]
        region = C['hub']['area']
    else:
        p['parent'] = [loc('/dyzain-i-remont-ukraina', lang), C['ua_short']]
        region = c.get('reg') or T['reg'].format(**f)
    p['area'] = [{'@type': 'City', 'name': c['n'], 'containedInPlace': {'@type': 'AdministrativeArea', 'name': region}}]
    names = {**{o: X['cities'][o]['n'] for o in X['cities']}, **{o: C[o]['name'] for o in ('lviv', 'odesa', 'dnipro')}}
    uk = UKC[k]
    near = []
    for path, _ in uk['near'][1]:
        o = path.rsplit('dyzain-i-remont-', 1)[-1] if 'dyzain-i-remont-' in path else None
        if o in names:
            near.append([loc(path, lang), names[o]])
        elif o == 'kyivska-oblast':
            near.append([slugs['hub'], T['all_t']])
        elif o == 'ukraina':
            near.append([loc(path, lang), C['all']])
        else:
            near.append([loc(path, lang), C['hub']['koncha'][0]])
    p['near'] = [C['near'], near]
    p['cards'] = geo['cards']
    p['about'] = [[c['h'], c['p']],
                  [T['des_h'].format(**f), [c['des'] + ' ' + T['des_tail']]],
                  [T['ren_h'], [c['bld'], T['ren_t' if town else 'ren_c']]],
                  [T['log_h'], [T['log_t' if town else 'log_c']]]]
    p['gallery'] = [g[:2] for g in uk['gallery']]
    p['steps'] = geo['steps']
    p['faq'] = [list(q) for q in c.get('faq', [])] + [[T['fq'][q][0].format(**f), T['fq'][q][1].format(**f)] for q in c['fk']]
    p['rel'] = rel
    return p


def main():
    clusters = {'_': 'Кластери гілок i18n/p2-1811 і i18n/p3-1811 (18.11.2026): Київська область, обласні центри й міста Київщини мовами (tools/site/geo1811/gen.py). i18n.py зливає clusters-*.json з clusters.json за ключем.'}
    for f in sorted(glob.glob(os.path.join(HERE, '*.json'))):
        lang = os.path.basename(f)[:-5]
        C = json.load(open(f, encoding='utf-8'))
        xf = os.path.join(HERE, 'cities', f'{lang}.json')
        X = json.load(open(xf, encoding='utf-8')) if os.path.exists(xf) else {'slugs': {}, 'cities': {}, 'tpl': {}}
        geo = next(json.load(open(g, encoding='utf-8')) for g in glob.glob(os.path.join(SITE, 'pages', f'{lang}-*.json'))
                   if os.path.basename(g)[3:-5] == loc('/dyzain-i-remont-ukraina', lang).split('/')[-1])
        slugs = {k: f'/{lang}/{v}' for k, v in {**C['slugs'], **X['slugs']}.items()}
        NEW[lang] = {f'/dyzain-i-remont-{k}': slugs[k] for k in X['cities']}
        rel = geo['rel'][:4] + [[loc('/portfolio', lang), C['portfolio']]]
        for k, cid in IDS.items():
            clusters.setdefault(cid, {})[lang] = slugs[k]
            c = C[k]
            p = {'slug': C['slugs'][k], 'lang': lang, 'service': c['service'], 'title': c['title'], 'description': c['description'],
                 'h1': c['h1'], 'price': geo['price'], 'lead': c['lead']}
            if k == 'hub':
                towns = [{'h': h, 'p': t} for h, t in c['towns']]
                for t, o in zip(towns, KYIV_TOWNS):
                    if o in X['cities']:
                        t['href'] = slugs[o]
                towns.append({'h': c['koncha'][0], 'href': loc('/budynok-pid-kliuch-koncha-zaspa', lang), 'p': c['koncha'][1]})
                p['places'] = [c['places'][0], c['places'][1], towns]
                p['area'] = [{'@type': 'AdministrativeArea', 'name': c['area']}]
                p['guarantees'] = True
                near = [[loc('/dyzain-i-remont-ukraina', lang), C['ua']], [loc('/remont-i-budivnytstvo-yevropa', lang), C['eu']]]
                near += [[slugs[o], C[o]['name']] for o in ('lviv', 'odesa', 'dnipro')]
                p['near'] = [C['other'], near]
            else:
                p['parent'] = [loc('/dyzain-i-remont-ukraina', lang), C['ua_short']]
                p['area'] = [{'@type': 'City', 'name': c['name'], 'containedInPlace': {'@type': 'AdministrativeArea', 'name': c['region']}}]
                near = [[slugs[o], C[o]['name']] for o in ('lviv', 'odesa', 'dnipro') if o != k]
                near += [[slugs['hub'], C['hub']['area']], [loc('/dyzain-i-remont-ukraina', lang), C['all']]]
                p['near'] = [C['near'], near]
            p['cards'] = geo['cards']
            p['about'] = c['about']
            p['gallery'] = [g[:2] for g in UK[k]['gallery']]
            p['steps'] = geo['steps']
            p['faq'] = c['faq']
            p['rel'] = rel
            p = links(p, lang, slugs)
            out = os.path.join(SITE, 'pages', f'{lang}-{C["slugs"][k]}.json')
            dump(p, out)
            print(out)
        for k in X['cities']:
            clusters.setdefault(f'geo-{k}', {})[lang] = slugs[k]
            p = links(city_page(k, lang, C, X, geo, rel, slugs), lang, slugs)
            out = os.path.join(SITE, 'pages', f'{lang}-{X["slugs"][k]}.json')
            dump(p, out)
            print(out)
        # «По Україні» цієї мови: картки нових сторінок (вхідні посилання) і підпис портфоліо мовою сторінки
        gf = next(g for g in glob.glob(os.path.join(SITE, 'pages', f'{lang}-*.json'))
                  if os.path.basename(g)[3:-5] == loc('/dyzain-i-remont-ukraina', lang).split('/')[-1])
        h2, intro, ps = C['uahub']
        cards = [{'h': C['hub']['area'] if k == 'hub' else C[k]['name'], 'href': slugs[k], 'p': ps[k]} for k in IDS]
        cards += [{'h': X['cities'][k]['n'], 'href': slugs[k], 'p': X['cities'][k]['tag']} for k in CENTRES if k in X['cities']]
        geo['places'] = [h2, intro, cards]
        geo['rel'] = [r if r[0] != loc('/portfolio', lang) else [r[0], C['portfolio']] for r in geo['rel']]
        dump(geo, gf)
    cf = os.path.join(SITE, 'lang', 'clusters-geo1811.json')
    dump(clusters, cf)
    if ERR:
        raise SystemExit('\n'.join(ERR))


if __name__ == '__main__':
    main()
