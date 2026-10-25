#!/usr/bin/env python3
"""Збирає статті блогу з tools/blog/articles/*.json у сторінки сайту.

  python3 tools/blog/build.py            # зібрати все: статті, індекси блогу, блоки «Статті по темі», sitemap
  python3 tools/blog/build.py --check    # лише перевірити JSON (схема, ціни, Osocor), нічого не писати

Формат статті (tools/blog/articles/<slug>.json):
  {"slug": "...", "lang": "uk"|"ru", "title": "...", "description": "...(до 160 симв.)", "lead": "...",
   "date": "2026-10-22", "service": ["/remont-kvartyr-kyiv", "Ремонт квартир"],
   "photo": "img/p/<id>-900.webp", "pair": "<slug іншою мовою>" (необовʼязково),
   "seo_title": "..." (необовʼязково, ≤60 симв.: іде в <title> як є замість title; H1 і решта — з title),
   "photo_alt": "опис hero-фото" (обовʼязково, якщо є photo; hero виводиться після lead, fetchpriority=high),
   "body": [["h2", "..."], ["p", "..."], ["ul", ["...", "..."]], ["ol", [...]],
            ["img", "/img/p/<id>-900.webp", "alt", "підпис (необовʼязково)"],
            ["gallery", [["/img/p/<id>-900.webp", "alt"], ...]]  (2–3 фото в ряд; на мобільному 2)],
   фото в тексті: ~1 на 300–400 слів, ставити в кінці розділу h2, не два фото-вузли поспіль; без повторів у статті,
   у "p" і пунктах списків можна внутрішнє посилання: [анкор](/шлях-сторінки) — лише на наявну сторінку,
   ru-статті → /ru/..., не більше одного на ту саму сторінку; у заголовках посилань немає
   "faq": [["питання", "відповідь"], ...]}
Ціни й факти — лише підтверджені (CLAUDE.md, розділ «Сайт: UI-kit і правила»).
"""
import glob, html, importlib.util, json, os, re, sys

try:
    from PIL import Image
except ImportError:  # без PIL розміри не прочитати — --check про це скаже
    Image = None

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import chrome  # єдина шапка/футер (tools/site/chrome.py)
ART = os.path.join(ROOT, 'tools/blog/articles')
B = 'https://cas-develop.com/'
TPL_UK = 'tools/blog/template-uk.html'  # заморожена копія статті-шаблону (стаття сама збирається з JSON)
PRICES_OK = ['$30', '$350', '$550', '$250', '$600', '$1 100', '$1100', '$50', '$2 500', '$2500', '$500']  # $500 — мін. замовлення Оздоби
MONTHS = {'uk': ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
          'ru': ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']}
L = {
    'uk': dict(home='Головна', home_url='/', blog='Блог', blog_url='/blog', faq='Питання та відповіді', more='Читайте також',
               cta_h='Порахуємо ваш проєкт', cta_p='Безкоштовна консультація — розкажіть про обʼєкт, і ми назвемо орієнтовну вартість.',
               rel_h='Статті по темі', blog_title='Блог про дизайн інтерʼєру й ремонт', blog_h1='Блог про дизайн і ремонт',
               blog_desc='Корисні статті від CAS Development: ціни на ремонт і дизайн-проєкт у Києві, етапи робіт, поради, меблі з Китаю.',
               blog_lead='Пояснюємо простими словами, скільки коштує дизайн і ремонт, як іде робота і на що звернути увагу.'),
    'ru': dict(home='Главная', home_url='/ru/', blog='Блог', blog_url='/ru/blog', faq='Вопросы и ответы', more='Читайте также',
               cta_h='Посчитаем ваш проект', cta_p='Бесплатная консультация — расскажите об объекте, и мы назовём ориентировочную стоимость.',
               rel_h='Статьи по теме', blog_title='Блог о дизайне интерьера и ремонте', blog_h1='Блог о дизайне и ремонте',
               blog_desc='Полезные статьи от CAS Development: цены на ремонт и дизайн-проект в Киеве, этапы работ, советы, мебель из Китая.',
               blog_lead='Объясняем простыми словами, сколько стоит дизайн и ремонт, как идёт работа и на что обратить внимание.'),
}


def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s):
    if p.endswith('.html'): s = chrome.apply(s, p)  # єдина шапка/футер (мова — з <html lang>, пара — з hreflang)
    os.makedirs(os.path.dirname(os.path.join(ROOT, p)) or ROOT, exist_ok=True)
    open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)
def esc(s): return html.escape(s, quote=True)
def path_of(a): return f"blog/{a['slug']}.html" if a['lang'] == 'uk' else f"ru/blog/{a['slug']}.html"
def url_of(a): return B + path_of(a)[:-5]
def title_tag(t):
    """<title>: з брендом, якщо вміщається в 60 символів, інакше лише заголовок (бренд обрізався б у видачі)."""
    full = f'{t} | CAS Development'
    return full if len(full) <= 60 else t


def load():
    arts = []
    for f in sorted(glob.glob(os.path.join(ART, '*.json'))):
        a = json.load(open(f, encoding='utf-8'))
        a['_file'] = os.path.relpath(f, ROOT)
        arts.append(a)
    return arts


def check(a):
    errs = []
    for k in ('slug', 'lang', 'title', 'description', 'lead', 'date', 'service', 'body', 'faq'):
        if k not in a: errs.append(f'немає поля {k}')
    if errs: return errs
    if a['lang'] not in L: errs.append('lang має бути uk або ru')
    if not re.fullmatch(r'[a-z0-9-]+', a['slug']): errs.append('slug: лише a-z, 0-9, -')
    if len(a['description']) > 170: errs.append('description довший за 170 символів')
    if len(a.get('seo_title') or title_tag(a['title'])) > 60: errs.append('<title> довший за 60 символів — додати "seo_title" (≤60)')
    txt = json.dumps(a, ensure_ascii=False)
    if re.search(r'osocor|осокор|osokork', txt, re.I): errs.append('Osocor заборонено')
    for p in re.findall(r'\$\s?\d[\d ]*\d|\$\d', txt):
        p = p.strip()
        if not any(p == ok or p.startswith(ok + ' ') for ok in PRICES_OK) and not re.fullmatch(r'\$\d{1,3}( \d{3})+', p):
            errs.append(f'ціна {p} — перевірити (дозволені лише підтверджені ставки або розрахунок із них)')
    words = sum(len(str(v).split()) for k, v, *_ in a['body'] if k not in PHOTO_KINDS for v in (v if isinstance(v, list) else [v]))
    if words < 450: errs.append(f'замало тексту: {words} слів (мінімум 450)')
    if a.get('photo') and not os.path.exists(os.path.join(ROOT, a['photo'])): errs.append(f"фото {a['photo']} не знайдено")
    if a.get('photo') and not (a.get('photo_alt') or '').strip(): errs.append('немає photo_alt для hero-фото')
    errs += check_photos(a)
    errs += check_links(a)
    return errs


def fmt_date(d, lang):
    y, m, dd = d.split('-')
    return f'{int(dd)} {MONTHS[lang][int(m) - 1]} {y}'


LINK = re.compile(r'\[([^\[\]]+)\]\((/[a-z0-9/_-]*)\)')


def inline(s):
    """Текст абзацу/пункту: екранування + внутрішні посилання [анкор](/шлях)."""
    return LINK.sub(lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', esc(s))


PHOTO_KINDS = ('img', 'gallery')


def photos_of(node):
    """[(src, alt, caption)] вузла img/gallery."""
    kind, *rest = node
    if kind == 'img': return [(rest[0], rest[1] if len(rest) > 1 else '', rest[2] if len(rest) > 2 else '')]
    if kind == 'gallery': return [(x[0], x[1] if len(x) > 1 else '', x[2] if len(x) > 2 else '') for x in (rest[0] if rest else [])]
    return []


def check_photos(a):
    errs, seen, prev = [], set(), None
    if a.get('photo'): seen.add('/' + a['photo'].lstrip('/'))
    if Image is None and any(k in PHOTO_KINDS for k, *_ in a['body']): errs.append('немає PIL (pip install pillow) — розміри фото не прочитати')
    for i, node in enumerate(a['body']):
        kind = node[0]
        if kind not in PHOTO_KINDS: prev = kind; continue
        if prev in PHOTO_KINDS: errs.append(f'два фото-вузли поспіль (body[{i}]) — між ними має бути текст')
        if i == 0: errs.append('фото на початку body — спершу текст розділу')
        prev = kind
        ph = photos_of(node)
        if kind == 'gallery' and not 2 <= len(ph) <= 3: errs.append(f'gallery body[{i}]: має бути 2–3 фото, а не {len(ph)}')
        for src, alt, _ in ph:
            if not re.fullmatch(r'/img/[\w/.-]+\.webp', src or ''): errs.append(f'фото {src}: шлях має бути /img/….webp'); continue
            if not os.path.exists(os.path.join(ROOT, src.lstrip('/'))): errs.append(f'фото {src} не знайдено')
            if not alt.strip(): errs.append(f'фото {src}: порожній alt')
            if src in seen: errs.append(f'фото {src} повторюється в статті')
            seen.add(src)
    return errs


def img_tag(src, alt, sizes, hero=False):
    """<img> з width/height із файлу, srcset із -400 копії, lazy (hero — eager + fetchpriority=high)."""
    w, h = Image.open(os.path.join(ROOT, src.lstrip('/'))).size
    small = re.sub(r'-(900|800)\.webp$', '-400.webp', src)
    srcset = ''
    if small != src and os.path.exists(os.path.join(ROOT, small.lstrip('/'))):
        srcset = f' srcset="{small} 400w, {src} {w}w" sizes="{sizes}"'
    load = ' fetchpriority="high"' if hero else ' loading="lazy"'
    return f'<img src="{src}"{srcset} width="{w}" height="{h}" alt="{esc(alt)}"{load} decoding="async">'


def fig(src, alt, cap='', sizes='(max-width:800px) 100vw, 760px', cls='af', hero=False):
    cut = ' cut' if '/img/products/' in src else ''
    return (f'<figure class="{cls}{cut}">' + img_tag(src, alt, sizes, hero)
            + (f'<figcaption>{esc(cap)}</figcaption>' if cap else '') + '</figure>')


def check_links(a):
    errs, seen = [], set()
    for kind, val, *_ in a['body']:
        if kind in PHOTO_KINDS: continue
        for v in (val if isinstance(val, list) else [val]):
            if kind in ('h2', 'h3') and '](' in v: errs.append(f'посилання в заголовку: {v[:40]}')
            for anchor, href in LINK.findall(v):
                p = href.strip('/')
                if not (os.path.exists(os.path.join(ROOT, p + '.html')) or os.path.exists(os.path.join(ROOT, p, 'index.html'))):
                    errs.append(f'посилання {href}: сторінки немає')
                if (a['lang'] == 'ru') != href.startswith('/ru/'): errs.append(f'посилання {href}: інша мова')
                if href in seen: errs.append(f'посилання {href} повторюється')
                seen.add(href)
    return errs


def render_body(body):
    out = []
    for node in body:
        kind, val = node[0], node[1]
        if kind == 'img':
            (src, alt, cap), = photos_of(node); out.append(fig(src, alt, cap))
        elif kind == 'gallery':
            ph = photos_of(node)
            out.append(f'<div class="ag ag{len(ph)}">' + ''.join(fig(src, alt, cap, '(max-width:560px) 50vw, 250px', 'agf') for src, alt, cap in ph) + '</div>')
        elif kind in ('h2', 'h3'): out.append(f'<{kind}>{esc(val)}</{kind}>')
        elif kind == 'p': out.append(f'<p>{inline(val)}</p>')
        elif kind in ('ul', 'ol'): out.append(f'<{kind}>' + ''.join(f'<li>{inline(x)}</li>' for x in val) + f'</{kind}>')
    return '\n'.join(out)


def ru_shell(s):
    """Перетворює український шаблон статті на російський (шапка, футер, панель, мова)."""
    ru = rd('ru/remont-kvartir-kiev.html')
    s = s.replace('<html lang="uk">', '<html lang="ru">')  # шапку й футер мовою сторінки ставить chrome.apply у wr()
    mb_ru = ru[ru.index('<!--m-fix--><div class="mbar"'):ru.index('</div>', ru.index('<!--m-fix--><div class="mbar"')) + 6]
    i = s.index('<!--m-fix--><div class="mbar"'); s = s[:i] + mb_ru + s[s.index('</div>', i) + 6:]
    return s


def build_article(a, arts):
    lang, t = a['lang'], L[a['lang']]
    s = rd(TPL_UK)
    if lang == 'ru': s = ru_shell(s)
    url = url_of(a)
    og = f"img/og/{a['slug']}.jpg"
    og_url = B + og if os.path.exists(os.path.join(ROOT, og)) else B + 'img/og-cas.jpg'
    s = re.sub(r'<title>.*?</title>', f"<title>{esc(a.get('seo_title') or title_tag(a['title']))}</title>", s, count=1, flags=re.S)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(a["description"])}">', s, count=1)
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', s, count=1)
    s = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(a["title"])} | CAS Development">', s, count=1)
    s = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(a["description"])}">', s, count=1)
    s = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', s, count=1)
    s = re.sub(r'<meta property="og:image" content="[^"]*">', f'<meta property="og:image" content="{og_url}">', s, count=1)
    s = re.sub(r'<meta name="twitter:image" content="[^"]*">', f'<meta name="twitter:image" content="{og_url}">', s, count=1)
    s = re.sub(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">\s*', '', s)
    pair = next((p for p in arts if p['slug'] == a.get('pair')), None)
    if pair:
        uk_u, ru_u = (url, url_of(pair)) if lang == 'uk' else (url_of(pair), url)
        alts = f'<link rel="alternate" hreflang="uk" href="{uk_u}">\n<link rel="alternate" hreflang="ru" href="{ru_u}">\n<link rel="alternate" hreflang="x-default" href="{uk_u}">\n'
        s = s.replace('<link rel="canonical"', alts + '<link rel="canonical"', 1)
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": a['title'], "description": a['description'], "datePublished": a['date'], "dateModified": a.get('modified', a['date']),
         "author": {"@type": "Organization", "name": "CAS Development", "url": B}, "publisher": {"@type": "Organization", "@id": B + "#business", "name": "CAS Development", "url": B, "logo": B + "apple-touch-icon.png"},
         "image": og_url, "mainEntityOfPage": url, "inLanguage": lang},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": t['home'], "item": B + t['home_url'].lstrip('/')},
            {"@type": "ListItem", "position": 2, "name": t['blog'], "item": B + t['blog_url'].lstrip('/')},
            {"@type": "ListItem", "position": 3, "name": a['title'], "item": url}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in a['faq']]}]}
    s = re.sub(r'<script type="application/ld\+json">.*?</script>', '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>', s, count=1, flags=re.S)
    s = re.sub(r'<div class="w crumbs">.*?</div>',
               f'<div class="w crumbs"><a href="{t["home_url"]}">{t["home"]}</a> / <a href="{t["blog_url"]}">{t["blog"]}</a> / {esc(a["title"])}</div>', s, count=1, flags=re.S)
    same = [p for p in arts if p['lang'] == lang and p['slug'] != a['slug']]
    same = sorted(same, key=lambda p: p['date'], reverse=True)[:6]
    links = ''.join(f'<li><a href="/{path_of(p)[:-5]}">{esc(p["title"])}</a></li>' for p in same)
    if lang == 'uk':
        links += ''.join(f'<li><a href="/blog/{x["slug"]}">{esc(x["title"])}</a></li>' for x in legacy_uk()[:max(0, 6 - len(same))] if x['slug'] != a['slug'])
    svc_url, svc_label = a['service']
    art = f'''
  <h1 style="font-size:var(--fs-h1)">{esc(a["title"])}</h1>
  <p class="date">CAS Development · <time datetime="{a["date"]}">{fmt_date(a["date"], lang)}</time></p>
  <p style="font-size:19px">{esc(a["lead"])}</p>
  {fig('/' + a['photo'].lstrip('/'), a.get('photo_alt') or a['title'], hero=True) if a.get('photo') else ''}
  {render_body(a["body"])}
  <h2>{t["faq"]}</h2>
  {''.join(f'<details><summary>{esc(q)}</summary><p>{esc(ans)}</p></details>' for q, ans in a["faq"])}
  <div class="cta"><h2 style="margin-top:0">{t["cta_h"]}</h2><p style="margin:0 0 16px">{t["cta_p"]}</p>
  <div class="btns"><a class="btn main" href="{svc_url}">{esc(svc_label)}</a><a class="btn" href="tel:+380978667755">+380 97 866 77 55</a></div></div>
  <h2>{t["more"]}</h2><ul>{links}</ul>
'''
    i = s.index('<article>') + 9; j = s.index('</article>')
    s = s[:i] + art + s[j:]
    wr(path_of(a), s)


def legacy_uk():
    """Наявні статті блогу, зроблені до build.py (без JSON) — для індексу й «Читайте також»."""
    out = []
    jsons = {json.load(open(f, encoding='utf-8'))['slug'] for f in glob.glob(os.path.join(ART, '*.json'))}
    for f in sorted(glob.glob(os.path.join(ROOT, 'blog/*.html'))):
        slug = os.path.basename(f)[:-5]
        if slug in jsons: continue
        s = open(f, encoding='utf-8').read()
        title = re.sub(r'\s*\|\s*CAS Development\s*$', '', html.unescape(re.search(r'<title>(.*?)</title>', s, re.S).group(1)))
        desc = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
        date = (re.search(r'"datePublished": "([^"]+)"', s) or re.search(r'datetime="([^"]+)"', s)).group(1)
        cta = re.search(r'<a class="btn main" href="(/[^"]+)">', s)
        out.append({'slug': slug, 'lang': 'uk', 'title': title, 'description': desc, 'date': date, 'service': [cta.group(1) if cta else '', '']})
    return sorted(out, key=lambda x: x['date'], reverse=True)


def build_index(lang, items):
    t = L[lang]
    s = rd('blog.html')
    if lang == 'ru': s = ru_shell(s)
    url = B + t['blog_url'].lstrip('/')
    s = re.sub(r'<title>.*?</title>', f'<title>{esc(title_tag(t["blog_title"]))}</title>', s, count=1, flags=re.S)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{t["blog_desc"]}">', s, count=1)
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', s, count=1)
    s = re.sub(r'<meta property="og:(title|description|url)" content="[^"]*">\s*', '', s)
    s = re.sub(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">\s*', '', s)
    alts = f'<link rel="alternate" hreflang="uk" href="{B}blog">\n<link rel="alternate" hreflang="ru" href="{B}ru/blog">\n<link rel="alternate" hreflang="x-default" href="{B}blog">\n'
    s = s.replace('<link rel="canonical"', alts + '<link rel="canonical"', 1)
    s = s.replace('<link rel="canonical"', f'<meta property="og:title" content="{t["blog_title"]} | CAS Development">\n<meta property="og:description" content="{t["blog_desc"]}">\n<meta property="og:url" content="{url}">\n<link rel="canonical"', 1)
    ld = {"@context": "https://schema.org", "@type": "Blog", "name": f"{t['blog']} CAS Development", "url": url, "inLanguage": lang,
          "blogPost": [{"@type": "BlogPosting", "headline": x['title'], "url": B + ('blog/' if lang == 'uk' else 'ru/blog/') + x['slug'], "datePublished": x['date']} for x in items]}
    s = re.sub(r'<script type="application/ld\+json">.*?</script>', '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>', s, count=1, flags=re.S)
    s = re.sub(r'<div class="w crumbs">.*?</div>', f'<div class="w crumbs"><a href="{t["home_url"]}">{t["home"]}</a> / {t["blog"]}</div>', s, count=1, flags=re.S)
    s = re.sub(r'<div class="w hero"><h1>.*?</div>', f'<div class="w hero"><h1>{t["blog_h1"]}</h1><p>{t["blog_lead"]}</p></div>', s, count=1, flags=re.S)
    pre = '/blog/' if lang == 'uk' else '/ru/blog/'
    cards = ''.join(f'<a href="{pre}{x["slug"]}"><h2>{esc(x["title"])}</h2><p>{esc(x["description"])}</p></a>' for x in items)
    s = re.sub(r'<div class="cards">.*?</div></div></section>', f'<div class="cards">{cards}</div></div></section>', s, count=1, flags=re.S)
    wr('blog.html' if lang == 'uk' else 'ru/blog.html', s)


def related_blocks(items_by_lang):
    """Блок «Статті по темі» на сторінках послуг (між маркерами <!--cas:articles-->)."""
    by_svc = {}
    for lang, items in items_by_lang.items():
        pre = '/blog/' if lang == 'uk' else '/ru/blog/'
        for x in items:
            u = x['service'][0]
            if u: by_svc.setdefault(u, []).append((lang, pre + x['slug'], x['title']))
    n = 0
    for u, lst in by_svc.items():
        f = u.lstrip('/') + '.html'
        if not os.path.exists(os.path.join(ROOT, f)): continue
        s = rd(f)
        lang = 'ru' if f.startswith('ru/') else 'uk'
        mine = [x for x in lst if x[0] == lang][:6]
        if not mine: continue
        block = (f'<!--cas:articles--><section><div class="w"><h2>{L[lang]["rel_h"]}</h2><div class="rel arts">'
                 + ''.join(f'<a href="{h}">{esc(tt)}</a>' for _, h, tt in mine) + '</div></div></section><!--/cas:articles-->\n')
        if '<!--cas:articles-->' in s:
            s = re.sub(r'<!--cas:articles-->.*?<!--/cas:articles-->\n?', block, s, count=1, flags=re.S)
        else:
            anchor = re.search(r'<section><div class="w">\s*<h2>(Інші послуги|Другие услуги)</h2>', s) or re.search(r'<section id="zayavka">', s)
            if not anchor: continue
            s = s[:anchor.start()] + block + s[anchor.start():]
        wr(f, s); n += 1
    return n


def og_images(arts):
    p = os.path.join(ROOT, 'tools/og/make-og.py')
    try:
        spec = importlib.util.spec_from_file_location('mkog', p); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    except Exception as e:
        print('OG пропущено:', e); return
    black, mask = m.overlay()
    for a in arts:
        out = os.path.join(ROOT, f"img/og/{a['slug']}.jpg")
        if os.path.exists(out) or not a.get('photo'): continue
        img = m.render({'kind': 'blog', 'slug': a['slug'], 'title': a['title'], 'photo': a['photo']}, black, mask)
        m.save(img, m.Path(out) if hasattr(m, 'Path') else __import__('pathlib').Path(out))
        print('OG', a['slug'])


def sitemap(arts):
    s = rd('sitemap.xml'); add = ''
    urls = [url_of(a) for a in arts] + [B + 'ru/blog']
    for u in urls:
        if f'<loc>{u}</loc>' not in s:
            add += f'  <url><loc>{u}</loc><lastmod>{max(a["date"] for a in arts)}</lastmod></url>\n'
    if add: wr('sitemap.xml', s.replace('</urlset>', add + '</urlset>'))
    return add.count('<url>')


def main():
    arts = load()
    bad = {a['_file']: check(a) for a in arts}
    bad = {k: v for k, v in bad.items() if v}
    if bad:
        for k, v in bad.items(): print('❌', k, '—', '; '.join(v))
        sys.exit(1)
    if '--check' in sys.argv:
        print(f'OK: {len(arts)} статей'); return
    og_images(arts)
    for a in arts: build_article(a, arts)
    uk = sorted([a for a in arts if a['lang'] == 'uk'] + legacy_uk(), key=lambda x: x['date'], reverse=True)
    ru = sorted([a for a in arts if a['lang'] == 'ru'], key=lambda x: x['date'], reverse=True)
    build_index('uk', uk)
    if ru: build_index('ru', ru)
    n = related_blocks({'uk': uk, 'ru': ru})
    m = sitemap(arts)
    print(f'Готово: {len(arts)} статей із JSON, індекс uk {len(uk)}, ru {len(ru)}, блоків «по темі» {n}, нових URL у sitemap {m}')


if __name__ == '__main__':
    main()
