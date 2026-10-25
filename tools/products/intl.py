#!/usr/bin/env python3
"""Оздоба англійською й польською: /en/ozdoba і /pl/ozdoba (для клієнтів з ЄС).

  python3 tools/products/intl.py          # (викликає tools/products/build.py) — сторінки, словники, sitemap
  python3 tools/products/intl.py --check  # лише перевірка перекладів (код 1 — чогось бракує)

Що робить:
  • assets/ozdoba/i18n.<мова>.json — словник для app.js: назви товарів (tools/products/lang/names.tsv; нема рядка →
    поле "en" з catalog.json), категорії, одиниці, кольори, комплекти, форми множини й підписи інтерфейсу (lang/<мова>.json → ui;
    ключі — українські тексти t('…') з assets/ozdoba/app.js — бракує перекладу → попередження, у браузері лишиться українською);
  • <мова>/ozdoba.html — з української /ozdoba (той самий каталог, кошик, заявка й КП): перекладені тексти, 24 статичні картки,
    JSON-LD (ItemList, FAQPage, BreadcrumbList), hreflang-кластер uk/en/pl (tools/site/lang/clusters-ozdoba.json), sitemap.
Сторінки товарів і категорій лишаються українськими (331 + 11 сторінок ×2 мови роздули б репозиторій і дублювали б
український контент машинним перекладом опису): у шторці товару — назва, ціна, кольори й розміри мовою сторінки та
посилання «(in Ukrainian)/(po ukraińsku)» на повну сторінку.
"""
import hashlib, html, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import chrome, i18n  # noqa: E402

CAT = os.path.join(ROOT, 'assets/ozdoba/catalog.json')
APP = os.path.join(ROOT, 'assets/ozdoba/app.js')
KP = os.path.join(ROOT, 'assets/ozdoba/kp.v1.js')
PAGE = os.path.join(ROOT, 'ozdoba.html')
SITE = 'https://cas-develop.com'
LANGS = ('en', 'pl')
FIRST = 24
OG_LOCALE = {'en': 'en_GB', 'pl': 'pl_PL'}
e = lambda s: html.escape(str(s), quote=True)
ver = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]


def names():
    out = {}
    for line in open(os.path.join(HERE, 'lang/names.tsv'), encoding='utf-8'):
        if not line.strip() or line.startswith('#'):
            continue
        iid, en, pl = line.rstrip('\n').split('\t')
        out[int(iid)] = {'en': en, 'pl': pl}
    return out


def app_keys():
    """Ключі t('…') з app.js (\\u00a0 → нерозривний пробіл) + SHIPTXT (його передають змінною)."""
    s = open(APP, encoding='utf-8').read()
    keys = []
    for m in re.finditer(r"\bt\('((?:[^'\\]|\\.)*)'", s):
        k = m.group(1).replace('\\u00a0', ' ')
        if k not in keys:
            keys.append(k)
    m = re.search(r"const SHIPTXT = '([^']*)'", s)
    if m and m.group(1) not in keys:
        keys.append(m.group(1))
    return keys


def load(lang):
    return json.load(open(os.path.join(HERE, f'lang/{lang}.json'), encoding='utf-8'))


def ui_map(lang, warn):
    """Словник підписів рівно з ключами app.js; у JSON мови пробіли можуть бути звичайні замість нерозривних."""
    src = load(lang)['ui']
    norm = {k.replace(' ', ' '): v for k, v in src.items()}
    out, miss = {}, []
    for k in app_keys():
        v = src.get(k) or norm.get(k.replace(' ', ' '))
        if v is None:
            miss.append(k)
        else:
            out[k] = v
    out['персон'] = src.get('персон', 'pers.')
    if miss and warn:
        print(f'  ⚠ {lang}: немає перекладу для {len(miss)} підписів app.js: ' + '; '.join(m[:50] for m in miss[:8]))
    return out, miss


def item_name(i, lang, nm):
    t = nm.get(i['id'], {}).get(lang)
    if t:
        return t
    en = i.get('en') or i['name']
    return en[:1].upper() + en[1:]


def dictionary(d, lang, nm, warn=True):
    L = load(lang)
    ui, miss = ui_map(lang, warn)
    return {
        'lang': lang, 'pos': L['pos'], 'cats': L['cats'], 'units': L['units'], 'venues': L['venues'], 'colors': L['colors'],
        'bundles': L['bundles'], 'names': {str(i['id']): item_name(i, lang, nm) for i in d['items']}, 'ui': ui,
    }, miss


# ---------------------------------------------------------------- сторінка
def money(n):
    return f'{round(n):,}'.replace(',', ' ') + ' ₴'


def card(d, i, lang, L, nm, b):
    """Статична картка (та сама розмітка, що й у app.js cardHTML) мовою сторінки."""
    name = item_name(i, lang, nm)
    mp = b.min_price(d, i)
    ui = L['ui']
    pr = ui['Ціна за запитом'] if mp is None else (f'{ui["від"] + chr(160) if b.is_from(d, i) else ""}{money(mp)} <small>/ {e(L["units"].get(i["unit"], i["unit"]))}</small>')
    img = i.get('img')
    pic = (f'<img src="/{img}-400.webp" srcset="/{img}-400.webp 400w, /{img}-800.webp 800w" sizes="(min-width:900px) 240px, 46vw" '
           f'width="400" height="400" alt="{e(name)}" loading="lazy" decoding="async">') if img else b.S.format(d['art'].get(i['art'], '<rect x="20" y="20" width="60" height="42" rx="5"/>'))
    heart = (f'<button type="button" class="heart" data-fav="{i["id"]}" onclick="event.stopPropagation();toggleFav({i["id"]})" aria-label="{e(ui["В обране"])}" aria-pressed="false">'
             '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg></button>')
    return (f'<article class="card" onclick="openItem({i["id"]})"><div class="tile{" ph" if img else ""}">{pic}{heart}</div>'
            f'<div class="body"><div class="sub">{e(L["cats"].get(i["cat"], i["cat"]))}</div><a class="nm" href="/ozdoba/{i["slug"]}" hreflang="uk" onclick="if(window.openItem)event.preventDefault()" style="color:inherit;text-decoration:none">{e(name)}</a>'
            f'<div class="pr">{pr}</div></div></article>')


EXTRA_CSS = """
/* ===== /en/ozdoba, /pl/ozdoba ===== */
.ozd-cur{font-size:var(--fs-small);color:var(--muted);margin:-8px 0 18px;max-width:70ch}
.b2b4{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.b2b4 div{border:1px solid var(--line);background:var(--surface);padding:16px 18px;border-radius:12px}
.b2b4 b{display:block;margin-bottom:4px;color:var(--glow)}.b2b4 span{color:var(--muted);font-size:var(--fs-small)}
.terms{margin:0;padding:0 0 0 18px;color:var(--muted);line-height:1.6;max-width:80ch}.terms li{margin:4px 0}
.ozd-note{color:var(--muted);font-size:var(--fs-small);margin:10px 0 0}
"""


def page(d, lang, nm, b, shell):
    L = load(lang)
    P = L['page']
    dic, _ = dictionary(d, lang, nm, warn=False)
    L['ui'] = dic['ui']
    path = f'/{lang}/ozdoba'
    u = SITE + path
    order = {'A': 0, 'B': 1, 'C': 2}
    items = sorted(d['items'], key=lambda i: (not i.get('img'), order.get(i['prio'], 3), -(b.min_price(d, i) or 0)))
    grid = ''.join(card(d, i, lang, L, nm, b) for i in items[:FIRST])
    plural = L['pos']['other'] if lang == 'en' else L['pos']['many']
    cats_links = ''.join(f'<a href="/ozdoba/kategoriia/{slug}" hreflang="uk">{e(L["cats"].get(c, c))}</a>' for c, (slug, *_) in b.CATS.items()
                         if any(i['cat'] == c for i in d['items']))
    faq = ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in P['faq'])
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'ItemList', 'name': P['title'], 'numberOfItems': len(items[:FIRST]),
         'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'name': item_name(i, lang, nm), 'url': f'{SITE}/ozdoba/{i["slug"]}'}
                             for n, i in enumerate(items[:FIRST])]},
        {'@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in P['faq']]},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': P['ld_home'], 'item': f'{SITE}/{lang}/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Ozdoba', 'item': u}]}]}
    A = P['aria']
    tabs = P['tabs']
    body = f'''<div class="searchwrap" id="searchwrap">
  <input id="q" type="search" placeholder="{e(P["search"])}" oninput="onSearch()" aria-label="{e(A["q"])}">
</div>

<div class="w">
  <div class="crumbs"><a href="/{lang}/">{e(P["crumbs"][0])}</a> / {e(P["crumbs"][1])}</div>
  <div class="ozd-hero">
    <h1>{P["h1"]}</h1>
    <p>{e(P["lead"])}</p>
    <ul class="pts">{"".join(f"<li>{e(x)}</li>" for x in P["pts"])}</ul>
    <p class="vol">{e(P["vol"])}</p>
    <p class="ozd-cur">{e(P["cur"])}</p>
  </div>
</div>

<p class="vhead">{e(P["vhead"])}</p>
<nav class="venues" id="venues" aria-label="{e(A["venues"])}"></nav>

<nav class="tabs">
  <button class="tab" id="tabCatalog" onclick="setTab('catalog')" aria-pressed="true">{e(tabs[0])}</button>
  <button class="tab" id="tabBundles" onclick="setTab('bundles')">{e(tabs[1])}</button>
  <button class="tab" id="tabFav" onclick="setTab('fav')">{e(tabs[2])}</button>
</nav>

<div id="viewCatalog">
  <nav class="chips" id="chips" aria-label="{e(A["chips"])}"></nav>
  <div class="sortrow">
    <span class="cnt" id="cnt">{len(items)} {e(plural)}</span>
    <select id="sort" onchange="renderGrid()" aria-label="{e(A["sort"])}">
      <option value="pop">{e(P["sort"][0])}</option>
      <option value="asc">{e(P["sort"][1])}</option>
      <option value="desc">{e(P["sort"][2])}</option>
      <option value="az">{e(P["sort"][3])}</option>
    </select>
  </div>
  <div class="grid" id="grid" aria-live="off">{grid}</div>
  <div class="morewrap"><button type="button" class="btn ghost" id="more" onclick="showMore()" hidden>{e(P["more"])}</button></div>
</div>

<div id="viewBundles" hidden><div class="blist" id="blist"></div></div>
<div id="viewFav" hidden><div class="grid" id="favGrid"></div></div>

<section class="ozd-sec">
  <h2>{e(P["b2b_h"])}</h2>
  <div class="b2b4">{"".join(f"<div><b>{e(h)}</b><span>{e(t)}</span></div>" for h, t in P["b2b"])}</div>
</section>

<section class="ozd-sec">
  <h2>{e(P["steps_h"])}</h2>
  <ol class="steps4">{"".join(f"<li><b>{e(h)}</b><span>{e(t)}</span></li>" for h, t in P["steps"])}</ol>
</section>

<section class="ozd-sec" id="zayavka">
  <h2>{e(P["terms_h"])}</h2>
  <ul class="terms">{"".join(f"<li>{e(x)}</li>" for x in P["terms"])}</ul>
</section>

<section class="ozd-sec">
  <h2>{e(P["price_h"])}</h2>
  <p class="klead">{e(P["price_p"])} <a href="/ozdoba/prais" hreflang="uk">{e(P["price_a"])}</a></p>
</section>

<section class="ozd-sec">
  <h2>{e(P["faq_h"])}</h2>
  {faq}
</section>

<section class="ozd-sec" id="ozd-cats">
  <h2>{e(P["cats_h"])}</h2>
  <div class="rel">{cats_links}</div>
  <p class="ozd-note">{e(P["cats_note"])}</p>
</section>

<section class="ozd-sec">
  <h2>{e(P["rel_h"])}</h2>
  <div class="rel">{"".join(f'<a href="{h}">{e(t)}</a>' for h, t in P["rel"] if i18n.exists(h))}</div>
</section>
'''
    s = shell
    s = i18n.html_attrs(s, lang)
    s = re.sub(r'<title>.*?</title>', f'<title>{e(P["title"])}</title>', s, count=1)
    s = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + e(P['desc']), s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + e(P['og']), s, count=1)
    s = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + e(P['desc']), s, count=1)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'(<meta property="og:locale" content=")[^"]*', lambda m: m.group(1) + OG_LOCALE[lang], s, count=1)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', lambda m: '<!--ozd:ld--><script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script><!--/ozd:ld-->', s, count=1, flags=re.S)
    s = s.replace('</style>\n<!--ozd:ld-->', EXTRA_CSS + '</style>\n<!--ozd:ld-->', 1)
    i18n_href = f'/assets/ozdoba/i18n.{lang}.json?v={ver(os.path.join(ROOT, f"assets/ozdoba/i18n.{lang}.json"))}'
    s = re.sub(r'<link rel="preload" id="ozd-i18n"[^>]*>\n', '', s)
    s = re.sub(r'(<link rel="preload" id="ozd-data"[^>]*>\n)', lambda m: m.group(1) + f'<link rel="preload" id="ozd-i18n" href="{i18n_href}" as="fetch" crossorigin>\n', s, count=1)
    # іконки шапки (пошук, обране, кабінет, кошик)
    for a, k in (('Пошук', 'searchbtn'), ('Обране', 'fav'), ('Кошик', 'cart')):
        s = s.replace(f'aria-label="{a}">', f'aria-label="{e(A[k])}">')
    s = s.replace('aria-label="Кабінет клієнта"', f'aria-label="{e(L["ui"].get("Кабінет", "Account"))}"')
    # вміст сторінки між шапкою й футером
    a, z = s.index('<div class="searchwrap"'), s.index('<!--/chrome:main--></main>')
    s = s[:a] + body + '\n' + s[z:]
    # нижня панель, шторки
    s = s.replace('<button onclick="openCart()" id="barTxt">Кошик</button>', f'<button onclick="openCart()" id="barTxt">{e(P["bar"])}</button>')
    for a, k in (('Товар', 'item'), ('Комплект', 'kit'), ('Кошик', 'cart'), ('Оформлення', 'pay')):
        s = s.replace(f'aria-modal="true" aria-label="{a}">', f'aria-modal="true" aria-label="{e(A[k])}">')
    s = re.sub(r'<script src="/assets/account-fav\.v1\.js\?v=\w+" defer></script>\n?', '', s)  # синхронізація обраного з кабінетом — лише uk
    members = {l: p for l, p in {'uk': '/ozdoba', **{x: f'/{x}/ozdoba' for x in LANGS}}.items()}
    s = i18n.set_alternates(s, members)
    s = chrome.apply(s, f'{lang}/ozdoba.html')
    return s


def ensure_meta_kp(s):
    """<meta name="ozd-kp"> з версією kp.v1.js (assets/* кешуються на рік) — app.js бере звідти адресу скрипта КП."""
    tag = f'<meta name="ozd-kp" content="/assets/ozdoba/kp.v1.js?v={ver(KP)}">'
    s = re.sub(r'<meta name="ozd-kp"[^>]*>\n?', '', s)
    return re.sub(r'(<link rel="preload" id="ozd-data"[^>]*>\n)', lambda m: m.group(1) + tag + '\n', s, count=1)


def sitemap(lastmod):
    sm = os.path.join(ROOT, 'sitemap.xml')
    t = open(sm, encoding='utf-8').read()
    for l in LANGS:
        t = re.sub(rf'  <url><loc>{re.escape(SITE)}/{l}/ozdoba</loc>.*?</url>\n', '', t)
    add = ''.join(f'  <url><loc>{SITE}/{l}/ozdoba</loc><lastmod>{lastmod}</lastmod></url>\n' for l in LANGS)
    open(sm, 'w', encoding='utf-8').write(t.replace('</urlset>', add + '</urlset>'))


def build(b):
    """Викликає tools/products/build.py (модуль b — для спільних функцій цін і карток) після запису ozdoba.html."""
    d = json.load(open(CAT, encoding='utf-8'))
    nm = names()
    for lang in LANGS:
        dic, _ = dictionary(d, lang, nm)
        p = os.path.join(ROOT, f'assets/ozdoba/i18n.{lang}.json')
        txt = json.dumps(dic, ensure_ascii=False, separators=(',', ':'))
        if not os.path.exists(p) or open(p, encoding='utf-8').read() != txt:
            open(p, 'w', encoding='utf-8').write(txt)
    shell = open(PAGE, encoding='utf-8').read()
    for lang in LANGS:
        os.makedirs(os.path.join(ROOT, lang), exist_ok=True)
        open(os.path.join(ROOT, lang, 'ozdoba.html'), 'w', encoding='utf-8').write(page(d, lang, nm, b, shell))
    sitemap(b.LASTMOD)
    miss_n = sum(1 for i in d['items'] if i['id'] not in nm)
    return len(LANGS), miss_n


if __name__ == '__main__':
    d = json.load(open(CAT, encoding='utf-8'))
    nm = names()
    bad = 0
    for lang in LANGS:
        _, miss = dictionary(d, lang, nm)
        bad += len(miss)
    no = [i['id'] for i in d['items'] if i['id'] not in nm]
    if no:
        print(f'  ⚠ немає перекладу назв (names.tsv) для товарів: {no[:20]} — беремо поле "en"')
    if '--check' in sys.argv:
        print('Переклади Оздоби: OK' if not bad else f'Переклади Оздоби: бракує {bad}')
        sys.exit(1 if bad else 0)
    sys.path.insert(0, HERE)
    import build as B
    B.main()
