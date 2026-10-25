#!/usr/bin/env python3
"""Збирає лендинги послуг з tools/site/pages/*.json на основі живих шаблонів UI-kit.

  python3 tools/site/landing.py            # зібрати всі сторінки
  python3 tools/site/landing.py slug ...   # лише вказані (slug без ru/)

Шаблон: uk — remont-kukhni-kyiv.html, ru — ru/remont-kvartir-kiev.html. Стилі, форма і скрипти беруться
з шаблону, шапку й футер ставить tools/site/chrome.py; замінюються мета, JSON-LD і контент <main>.
Формат JSON:
  {"slug": "mebliuvannia-kvartyry-kyiv", "lang": "uk", "pair": "<slug іншою мовою>",
   "title": "...", "description": "...", "h1": "...", "price": "...", "lead": "...", "service": "...",
   "cards": [["Заголовок", ["пункт", ...]], ...], "about": [["h2", ["абзац", ...]], ...],
   "gallery": [["img/p/<id>-900.webp", "Назва проєкту", "alt (необовʼязково)"], ...], "steps": [["Крок", "опис"], ...],
   "faq": [["питання", "відповідь"], ...], "rel": [["/url", "назва"], ...], "extra": "<html після hero>"}
Сторінка частих питань (/pytannya): замість cards/steps/faq — "groups": [{"id": "ceny", "h2": "...",
   "faq": [[q, a], ...], "links": [["/url", "назва"], ...]}, ...]; price необовʼязковий.
Після збірки запустіть tools/blog/build.py (блоки «Статті по темі» і sitemap).
"""
import glob, html, json, os, re, sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chrome  # єдина шапка/футер (tools/site/chrome.py)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com/'
TPL = {'uk': 'remont-kukhni-kyiv.html', 'ru': 'ru/remont-kvartir-kiev.html'}
L = {
    'uk': dict(home='Головна', home_url='/', svc='Послуги', svc_url='/services', inc='Що входить', proj='Наші проєкти',
               steps='Як працюємо', faq='Питання та відповіді', rel='Інші послуги', alt=' — проєкт CAS Development',
               city='Київ', region='Київська область', other='На русском'),
    'ru': dict(home='Главная', home_url='/ru/', svc='Услуги', svc_url='/ru/', inc='Что входит', proj='Наши проекты',
               steps='Как мы работаем', faq='Вопросы и ответы', rel='Другие услуги', alt=' — проект CAS Development',
               city='Киев', region='Киевская область', other='Українською'),
}
FACTS = {
    'uk': [('150+', 'реалізованих проєктів'), ('2016', 'працюємо з цього року'), ('12 міс.', 'гарантія на роботи'), ('Китай', 'меблі й матеріали напряму')],
    'ru': [('150+', 'реализованных проектов'), ('2016', 'работаем с этого года'), ('12 мес.', 'гарантия на работы'), ('Китай', 'мебель и материалы напрямую')],
}
# мінімальний вузол організації замість голого посилання на #business (повні дані LocalBusiness — на головній, той самий @id)
ORG = {'@type': 'Organization', '@id': B + '#business', 'name': 'CAS Development', 'url': B, 'logo': B + 'apple-touch-icon.png'}
e = lambda s: html.escape(s, quote=False)
a = lambda s: html.escape(s, quote=True)


def url(lang, slug):
    return B + ('ru/' if lang == 'ru' else '') + slug


def path(lang, slug):
    return ('ru/' if lang == 'ru' else '') + slug + '.html'


def title_tag(t):
    """<title> до 60 символів: якщо з брендом довше — без суфікса « | CAS Development» (og:title лишається повним)."""
    return t if len(t) <= 60 else re.sub(r'\s*[|—–]\s*CAS Development\s*$', '', t)


def faqs(p):
    """Усі пари питання-відповідь: з "faq" або з груп "groups" (сторінка частих питань)."""
    return p.get('faq') or [qa for g in p.get('groups', []) for qa in g['faq']]


def groups_html(p):
    t = L[p['lang']]
    o = ['<section><div class="w">', f'  <h2>{"Розділи" if p["lang"] == "uk" else "Разделы"}</h2>',
         '  <div class="rel">' + ''.join(f'<a href="#{g["id"]}">{e(g["h2"])}</a>' for g in p['groups']) + '</div>',
         '</div></section>\n']
    for g in p['groups']:
        o += [f'<section id="{g["id"]}"><div class="w">', f'  <h2>{e(g["h2"])}</h2>',
              '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(x)}</p></details>' for q, x in g['faq'])]
        if g.get('links'):
            o.append('  <div class="rel" style="margin-top:18px">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in g['links']) + '</div>')
        o.append('</div></section>\n')
    if p.get('rel'):
        o += ['<section><div class="w">', f'  <h2>{t["svc"]}</h2>',
              '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['rel']) + '</div>',
              '</div></section>\n']
    return o


def main_html(p):
    t = L[p['lang']]
    crumb = '' if p.get('groups') else f' / <a href="{t["svc_url"]}">{t["svc"]}</a>'
    o = [f'<div class="w crumbs"><a href="{t["home_url"]}">{t["home"]}</a>{crumb} / {e(p["h1"])}</div>\n',
         '<div class="w hero">', f'  <h1>{e(p["h1"])}</h1>'] + ([f'  <div class="price">{e(p["price"])}</div>'] if p.get('price') else []) + [f'  <p>{e(p["lead"])}</p>',
         '  <div class="btns">',
         f'    <a class="btn main" href="#zayavka">{"Отримати кошторис" if p["lang"] == "uk" else "Получить смету"}</a>',
         '    <a class="btn" href="tel:+380978667755">+380 97 866 77 55</a>', '  </div>',
         '  <div class="facts">' + ''.join(f'<div><b>{e(b)}</b><span>{e(s)}</span></div>' for b, s in p.get('facts', FACTS[p['lang']])) + '</div>',
         '</div>\n']
    if p.get('calc'):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import calc
        o.append(calc.block(p['lang']) + '\n')
    if p.get('extra'):
        o.append(p['extra'] + '\n')
    if p.get('groups'):
        return '\n'.join(o + groups_html(p))
    o += ['<section><div class="w">', f'  <h2>{t["inc"]}</h2>',
          '  <div class="grid">' + ''.join(f'<div class="card"><h3>{e(h)}</h3><ul>' + ''.join(f'<li>{e(i)}</li>' for i in li) + '</ul></div>' for h, li in p['cards']) + '</div>',
          '</div></section>\n']
    for h, ps in p.get('about', []):
        o.append(f'<section><div class="w txt"><h2>{e(h)}</h2>' + ''.join(f'<p>{e(x)}</p>' for x in ps) + '</div></section>\n')
    if p.get('gallery'):
        figs = []
        for g in p['gallery']:
            src, cap = g[0], g[1]
            alt = g[2] if len(g) > 2 else cap + t['alt']  # 3-й елемент — змістовний alt
            w, h = Image.open(os.path.join(ROOT, src)).size
            figs.append(f'<figure><img src="/{src}" loading="lazy" decoding="async" width="{w}" height="{h}" alt="{a(alt)}"><figcaption>{e(cap)}</figcaption></figure>')
        o += ['<section><div class="w">', f'  <h2>{t["proj"]}</h2>', '  <div class="gal">' + ''.join(figs) + '</div>',
              f'  <p style="margin-top:18px"><a class="btn" href="/portfolio">{"Усе портфоліо" if p["lang"] == "uk" else "Всё портфолио"}</a></p>',
              '</div></section>\n']
    o += ['<section><div class="w">', f'  <h2>{t["steps"]}</h2>',
          '  <ol class="steps">' + ''.join(f'<li><div><b>{e(b)}</b><span>{e(s)}</span></div></li>' for b, s in p['steps']) + '</ol>',
          '</div></section>\n',
          '<section><div class="w">', f'  <h2>{t["faq"]}</h2>',
          '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(x)}</p></details>' for q, x in p['faq']),
          '</div></section>\n',
          '<section><div class="w">', f'  <h2>{t["rel"]}</h2>',
          '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['rel']) + '</div>',
          '</div></section>\n']
    return '\n'.join(o)


def ld(p):
    t, u = L[p['lang']], url(p['lang'], p['slug'])
    if p.get('groups'):
        g = [{'@type': 'BreadcrumbList', 'itemListElement': [
                 {'@type': 'ListItem', 'position': 1, 'name': t['home'], 'item': B.rstrip('/') + t['home_url']},
                 {'@type': 'ListItem', 'position': 2, 'name': p['h1'], 'item': u}]},
             {'@type': 'FAQPage', '@id': u + '#faq', 'url': u, 'name': p['h1'], 'inLanguage': p['lang'],
              'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': x}} for q, x in faqs(p)]}]
        return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False)
    g = [{'@type': 'Service', 'name': p['service'], 'serviceType': p['service'],
          'areaServed': [{'@type': 'City', 'name': t['city']}, {'@type': 'AdministrativeArea', 'name': t['region']}],
          'provider': ORG, 'url': u},
         {'@type': 'BreadcrumbList', 'itemListElement': [
             {'@type': 'ListItem', 'position': 1, 'name': t['home'], 'item': B.rstrip('/') + t['home_url']},
             {'@type': 'ListItem', 'position': 2, 'name': t['svc'], 'item': B.rstrip('/') + t['svc_url']},
             {'@type': 'ListItem', 'position': 3, 'name': p['h1'], 'item': u}]},
         {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': x}} for q, x in p['faq']]}]
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False)


def build(p):
    lang, slug = p['lang'], p['slug']
    s = open(os.path.join(ROOT, TPL[lang]), encoding='utf-8').read()
    u = url(lang, slug)
    if '.hero h1+p{' not in s:  # лід без ціни під H1 не має «злипатися» з заголовком
        s = s.replace('.hero p{color:var(--mu);max-width:60ch;margin:0 0 28px}', '.hero p{color:var(--mu);max-width:60ch;margin:0 0 28px}\n.hero h1+p{margin-top:14px}', 1)
    s = re.sub(r'<title>.*?</title>', f'<title>{e(title_tag(p["title"]))}</title>', s, count=1)
    for k, v in (('name="description"', p['description']), ('property="og:title"', p['title']),
                 ('property="og:description"', p['description']), ('property="og:url"', u)):
        s = re.sub(r'(<meta ' + k + r' content=")[^"]*', lambda m: m.group(1) + a(v), s, count=1)
    if p.get('og'):
        s = re.sub(r'(<meta property="og:image" content=")[^"]*', lambda m: m.group(1) + B + p['og'], s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'<link rel="alternate" hreflang[^>]*>\n', '', s)
    if p.get('pair'):
        other = 'ru' if lang == 'uk' else 'uk'
        uk_u, ru_u = (u, url('ru', p['pair'])) if lang == 'uk' else (url('uk', p['pair']), u)
        alt = (f'<link rel="alternate" hreflang="uk" href="{uk_u}">\n<link rel="alternate" hreflang="ru" href="{ru_u}">\n'
               f'<link rel="alternate" hreflang="x-default" href="{uk_u}">\n')
        s = s.replace('<meta name="twitter:card"', alt + '<meta name="twitter:card"', 1)
    s = re.sub(r'(<script type="application/ld\+json">\n?).*?(\n?</script>)', lambda m: m.group(1) + ld(p) + m.group(2), s, count=1, flags=re.S)
    s, n = re.subn(r'(<main\b[^>]*>)\n.*?(<section id="zayavka">)', lambda m: m.group(1) + '\n' + main_html(p) + m.group(2), s, count=1, flags=re.S)
    assert n == 1, f'{slug}: не знайдено <main>…<section id="zayavka"> у шаблоні'
    s = re.sub(r'data-service="[^"]*"', f'data-service="{a(p["service"])}"', s, count=1)
    s = re.sub(r'data-source="[^"]*"', f'data-source="cas-develop.com/{"ru/" if lang == "ru" else ""}{slug}"', s, count=1)
    # шапка й футер: мова, перемикач на пару (hreflang) і посилання — з chrome.py
    s = chrome.apply(s, path(lang, slug))
    open(os.path.join(ROOT, path(lang, slug)), 'w', encoding='utf-8').write(s)
    return path(lang, slug)


def link_pair(p):
    """Додає hreflang і посилання на мову на парну сторінку, якщо її збирали не цим скриптом."""
    if not p.get('pair'): return
    other = 'ru' if p['lang'] == 'uk' else 'uk'
    f = os.path.join(ROOT, path(other, p['pair']))
    if not os.path.exists(f): return
    s = open(f, encoding='utf-8').read()
    me = url(p['lang'], p['slug'])
    if f'href="{me}"' in s: return
    uk_u, ru_u = (me, url('ru', p['pair'])) if p['lang'] == 'uk' else (url('uk', p['pair']), me)
    s = re.sub(r'<link rel="alternate" hreflang[^>]*>\n', '', s)
    s = s.replace('<meta name="twitter:card"', f'<link rel="alternate" hreflang="uk" href="{uk_u}">\n<link rel="alternate" hreflang="ru" href="{ru_u}">\n'
                  f'<link rel="alternate" hreflang="x-default" href="{uk_u}">\n<meta name="twitter:card"', 1)
    s = chrome.apply(s, path(other, p['pair']))  # перемикач мови в шапці/футері — на нову пару
    open(f, 'w', encoding='utf-8').write(s)


def sitemap(urls, day):
    f = os.path.join(ROOT, 'sitemap.xml'); s = open(f, encoding='utf-8').read()
    add = ''.join(f'  <url><loc>{u}</loc><lastmod>{day}</lastmod></url>\n' for u in urls if f'<loc>{u}</loc>' not in s)
    if add: open(f, 'w', encoding='utf-8').write(s.replace('</urlset>', add + '</urlset>'))


def check(p):
    errs = []
    txt = json.dumps(p, ensure_ascii=False)
    if re.search(r'osocor|осокор|osokork', txt, re.I): errs.append('Osocor')
    ok = {'$30', '$350', '$550', '$250', '$600', '$1 100', '$50', '$2 500', '$500'}  # $500 — мін. замовлення Оздоби
    for m in re.findall(r'\$\s?\d[\d ]*\d|\$\d', txt):
        if m.strip() not in ok and not re.fullmatch(r'\$\d{2,3} \d{3}', m.strip()):  # розрахунок площа × ставка
            errs.append('ціна ' + m)
    if len(p['description']) > 165: errs.append('description > 165')
    for g in p.get('gallery', []):
        src = g[0]
        if not os.path.exists(os.path.join(ROOT, src)): errs.append('нема ' + src)
    return errs


if __name__ == '__main__':
    only = set(sys.argv[1:])
    bad, built = 0, []
    for f in sorted(glob.glob(os.path.join(ROOT, 'tools/site/pages/*.json'))):
        p = json.load(open(f, encoding='utf-8'))
        if only and p['slug'] not in only: continue
        errs = check(p)
        if errs:
            bad = 1; print('❌', f, errs); continue
        print('✓', build(p)); link_pair(p); built.append(url(p['lang'], p['slug']))
    import datetime
    sitemap(built, datetime.date.today().isoformat())
    sys.exit(bad)
