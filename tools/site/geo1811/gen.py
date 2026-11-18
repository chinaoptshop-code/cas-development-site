#!/usr/bin/env python3
"""Генератор сторінок «Київська область», Львів, Одеса, Дніпро мовами (en, pl, de, es, fr, pt, zh, ar; гілка i18n/p2-1811, 18.11.2026).

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
UK = {k: json.load(open(os.path.join(SITE, 'pages', f'uk-dyzain-i-remont-{s}.json'), encoding='utf-8'))
      for k, s in (('hub', 'kyivska-oblast'), ('lviv', 'lviv'), ('odesa', 'odesa'), ('dnipro', 'dnipro'))}
KYIV_TOWNS = ['irpin', 'bucha', 'hostomel', 'vyshneve', 'boiarka', 'brovary', 'boryspil', 'vyshhorod', 'obukhiv', 'vasylkiv', 'fastiv', 'bila-tserkva']


def loc(path, lang):
    m = i18n.cluster_of(path)
    if not m or lang not in m:
        raise SystemExit(f'{lang}: немає сторінки для {path}')
    return m[lang]


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


def main():
    clusters = {'_': 'Кластери гілки i18n/p2-1811 (18.11.2026): Київська область, Львів, Одеса, Дніпро мовами (tools/site/geo1811/gen.py). i18n.py зливає clusters-*.json з clusters.json за ключем.'}
    for f in sorted(glob.glob(os.path.join(HERE, '*.json'))):
        lang = os.path.basename(f)[:-5]
        C = json.load(open(f, encoding='utf-8'))
        geo = next(json.load(open(g, encoding='utf-8')) for g in glob.glob(os.path.join(SITE, 'pages', f'{lang}-*.json'))
                   if os.path.basename(g)[3:-5] == loc('/dyzain-i-remont-ukraina', lang).split('/')[-1])
        slugs = {k: f'/{lang}/{v}' for k, v in C['slugs'].items()}
        rel = geo['rel'][:4] + [[loc('/portfolio', lang), C['portfolio']]]
        for k, cid in IDS.items():
            clusters.setdefault(cid, {})[lang] = slugs[k]
            c = C[k]
            p = {'slug': C['slugs'][k], 'lang': lang, 'service': c['service'], 'title': c['title'], 'description': c['description'],
                 'h1': c['h1'], 'price': geo['price'], 'lead': c['lead']}
            if k == 'hub':
                towns = [{'h': h, 'p': t} for h, t in c['towns']]
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
            json.dump(p, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            open(out, 'a', encoding='utf-8').write('\n')
            print(out)
        # «По Україні» цієї мови: картки нових сторінок (вхідні посилання) і підпис портфоліо мовою сторінки
        gf = next(g for g in glob.glob(os.path.join(SITE, 'pages', f'{lang}-*.json'))
                  if os.path.basename(g)[3:-5] == loc('/dyzain-i-remont-ukraina', lang).split('/')[-1])
        h2, intro, ps = C['uahub']
        geo['places'] = [h2, intro, [{'h': C['hub']['area'] if k == 'hub' else C[k]['name'], 'href': slugs[k], 'p': ps[k]} for k in IDS]]
        geo['rel'] = [r if r[0] != loc('/portfolio', lang) else [r[0], C['portfolio']] for r in geo['rel']]
        json.dump(geo, open(gf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        open(gf, 'a', encoding='utf-8').write('\n')
    cf = os.path.join(SITE, 'lang', 'clusters-geo1811.json')
    json.dump(clusters, open(cf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(cf, 'a', encoding='utf-8').write('\n')


if __name__ == '__main__':
    main()
