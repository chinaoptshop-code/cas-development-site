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
   "faq": [["питання", "відповідь"], ...], "rel": [["/url", "назва"], ...], "extra": "<html після hero>",
   "guarantees": true (необовʼязково — блок «Гарантії» після «Як працюємо»; для лендингів ремонту/під ключ),
   "parent": ["/url", "назва"] (необовʼязково — проміжна ланка хлібних крихт замість «Послуги», напр. хаб ЖК),
   "budget": {"area": 100, "h2": "...", "p": "..."} (необовʼязково — орієнтир «площа × ставка» з data-est після about),
   "near": ["h2", [["/url", "назва"], ...]] (необовʼязково — блок посилань перед «Інші послуги»),
   "cluster": ["h2", "вступ", [["/url", "анкор"], ...]] (необовʼязково — сусідні інтенти кластера запитів, tools/site/keywords.json)}
У абзацах "about" і відповідях "faq" можна ставити посилання: [анкор](/url).
Сторінка частих питань (/pytannya): замість cards/steps/faq — "groups": [{"id": "ceny", "h2": "...",
   "faq": [[q, a], ...], "links": [["/url", "назва"], ...]}, ...]; price необовʼязковий.
Після збірки запустіть tools/blog/build.py (блоки «Статті по темі» і sitemap).
"""
import glob, html, json, os, re, sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chrome  # єдина шапка/футер (tools/site/chrome.py)
import i18n  # мови, словники, hreflang-кластери (tools/site/i18n.py)
import captions  # підписи галерей «обʼєкт · статус» (tools/site/captions.py)
import leadform  # легка заявка: лише телефон, швидка заявка в hero (tools/site/leadform.py)
import casmap  # карти: офіс у контактах, «Карта проєктів» (tools/site/casmap.py)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'https://cas-develop.com/'
TPL = {'uk': 'remont-kukhni-kyiv.html', 'ru': 'ru/remont-kvartir-kiev.html'}
L = {
    'uk': dict(home='Головна', home_url='/', svc='Послуги', svc_url='/services', inc='Що входить', proj='Наші проєкти',
               steps='Як працюємо', faq='Питання та відповіді', rel='Інші послуги', alt=' — проєкт CAS Development',
               city='Київ', region='Київська область', country='Україна', europe='Європа', other='На русском',
               cta='Отримати кошторис', all_portfolio='Усе портфоліо', sections='Розділи'),
    'ru': dict(home='Главная', home_url='/ru/', svc='Услуги', svc_url='/ru/uslugi', inc='Что входит', proj='Наши проекты',
               steps='Как мы работаем', faq='Вопросы и ответы', rel='Другие услуги', alt=' — проект CAS Development',
               city='Киев', region='Киевская область', country='Украина', europe='Европа', other='Українською',
               cta='Получить смету', all_portfolio='Всё портфолио', sections='Разделы'),
}
FACTS = {
    'uk': [('150+', 'проєктів'), ('10+ років', 'досвіду, з 2016 року'), ('12 міс.', 'гарантія на роботи'), ('Китай', 'меблі й матеріали напряму')],
    'ru': [('150+', 'проектов'), ('10+ лет', 'опыта, с 2016 года'), ('12 мес.', 'гарантия на работы'), ('Китай', 'мебель и материалы напрямую')],
}
# Блок «Гарантії» (UI-kit: картки .grid/.card). «Оплата етапами» — факт сайту (договір з етапами оплати);
# фотозвіти раз на 1–2 тижні — підтверджено Михайлом 25.10.2026. Ручні сторінки вставляють той самий блок між маркерами.
GUAR = {
    'uk': ('Гарантії', [
        ('Гарантія 12 місяців на роботи', 'Здаємо обʼєкт з актом; на виконані роботи діє гарантія 12 місяців.'),
        ('Кошторис ±5%, якщо ремонт робить CAS', 'Кошторис складаємо до старту робіт. Якщо ремонт виконує наша команда, підсумок не відхиляється від нього більше ніж на ±5%.'),
        ('Договір і оплата етапами', 'Ціну, терміни й етапи оплати фіксуємо в договорі до початку робіт.'),
        ('Фотозвіти раз на 1–2 тижні', 'Раз на 1–2 тижні надсилаємо фото з обʼєкта в Telegram — видно, як іде ремонт, без поїздок.')]),
    'ru': ('Гарантии', [
        ('Гарантия 12 месяцев на работы', 'Сдаём объект с актом; на выполненные работы действует гарантия 12 месяцев.'),
        ('Смета ±5%, если ремонт делает CAS', 'Смету составляем до старта работ. Если ремонт выполняет наша команда, итог не отклоняется от неё больше чем на ±5%.'),
        ('Договор и оплата по этапам', 'Цену, сроки и этапы оплаты фиксируем в договоре до начала работ.'),
        ('Фотоотчёты раз в 1–2 недели', 'Раз в 1–2 недели присылаем фото с объекта в Telegram — видно, как идёт ремонт, без поездок.')]),
}


# нові мови: підписи блоків, факти й гарантії — з tools/site/lang/<мова>.json ("landing"), шаблон — uk з перекладом
# рядків форми й нижньої панелі ("form": ключ → текст, див. FORM_UK)
for _l in i18n.LANGS:
    _d = i18n.ui(_l)
    if _l not in L and _d:
        L[_l] = _d['landing']
        FACTS[_l] = [tuple(x) for x in _d['landing']['facts']]
        GUAR[_l] = (_d['landing']['guar'][0], [tuple(x) for x in _d['landing']['guar'][1]])
        TPL[_l] = TPL['uk']
# рядки uk-шаблону, які перекладаються для нових мов
FORM_UK = {
    'form_h2': '<h2>Розрахувати проєкт</h2>', 'name': '>Імʼя (необовʼязково)<', 'phone': '>Телефон *<', 'area': '>Площа, м²<', 'msg': '>Коментар<',
    'ph_phone': 'placeholder="+380 97 123 45 67"', 'ph_area': 'placeholder="напр. 200"', 'ph_msg': 'placeholder="Що за обʼєкт, де, бажані терміни"',
    'send': '>Передзвоніть мені<', 'ok_h': '>Заявку отримано<', 'ok_p': '>Звʼяжемося найближчим часом.<',
    'mbar': 'aria-label="Швидкий зв\'язок"', 'call': '</svg>Подзвонити</a>',
    'close': "'Закрити'", 'prev': "'Попереднє фото'", 'next': "'Наступне фото'", 'menu': "'Меню'",
}


def translate_tpl(s, lang):
    f = i18n.ui(lang)['form']
    for k, uk in FORM_UK.items():
        assert uk in s, f'шаблон: нема рядка {uk}'
        core = _core(uk)
        if uk.startswith("'"):
            new = f[k].replace("'", '’')
        elif uk.startswith(('placeholder', 'aria')):
            new = a(f[k])
        else:
            new = e(f[k])
        s = s.replace(uk, uk.replace(core, new))
    return s


def _core(uk):
    """Текстова частина рядка шаблону (без тегів/лапок)."""
    if '="' in uk:
        return uk.split('="', 1)[1].rstrip('"')
    m = re.search(r'(?:>|\')([^<>"\']+)(?:<|\')', uk)
    return m.group(1)


def guarantees_html(lang):
    h, items = GUAR[lang]
    return ('<!--cas:guarantees--><section><div class="w">\n'
            f'  <h2>{h}</h2>\n'
            '  <div class="grid">' + ''.join(f'<div class="card"><h3>{e(t)}</h3><p>{e(x)}</p></div>' for t, x in items) + '</div>\n'
            '</div></section><!--/cas:guarantees-->\n')


def area_served(lang):
    """Географія (підтверджено Михайлом): Київ і область, Україна, Європа, світ."""
    t = L[lang]
    return [{'@type': 'City', 'name': t['city']}, {'@type': 'AdministrativeArea', 'name': t['region']},
            {'@type': 'Country', 'name': t['country']}, {'@type': 'Continent', 'name': t['europe']}]


# мінімальний вузол організації замість голого посилання на #business (повні дані LocalBusiness — на головній, той самий @id)
ORG = {'@type': 'Organization', '@id': B + '#business', 'name': 'CAS Development', 'url': B, 'logo': B + 'apple-touch-icon.png'}
e = lambda s: html.escape(s, quote=False)
a = lambda s: html.escape(s, quote=True)
# посилання в тексті абзаців «about» і відповідей FAQ: [анкор](/url) → <a href="/url">анкор</a> (у JSON-LD — лише анкор)
MDLINK = re.compile(r'\[([^\]]+)\]\((/[^)\s]*)\)')
rich = lambda s: MDLINK.sub(lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', e(s))
plain = lambda s: MDLINK.sub(r'\1', s)


def url(lang, slug):
    return B + i18n.meta(lang)['prefix'] + ('' if slug == 'index' else slug)


def path(lang, slug):
    return i18n.meta(lang)['prefix'] + slug + '.html'


def title_tag(t):
    """<title> до 60 символів: якщо з брендом довше — без суфікса « | CAS Development» (og:title лишається повним)."""
    return t if len(t) <= 60 else re.sub(r'\s*[|—–]\s*CAS Development\s*$', '', t)


def faqs(p):
    """Усі пари питання-відповідь: з "faq", з груп "groups" (сторінка частих питань) або з секцій типу faq."""
    return (p.get('faq') or [qa for g in p.get('groups', []) for qa in g['faq']]
            or [qa for x in p.get('sections', []) if x['t'] == 'faq' for qa in x['items']])


def groups_html(p):
    t = L[p['lang']]
    o = ['<section><div class="w">', f'  <h2>{t["sections"]}</h2>',
         '  <div class="rel">' + ''.join(f'<a href="#{g["id"]}">{e(g["h2"])}</a>' for g in p['groups']) + '</div>',
         '</div></section>\n']
    for g in p['groups']:
        o += [f'<section id="{g["id"]}"><div class="w">', f'  <h2>{e(g["h2"])}</h2>',
              '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{rich(x)}</p></details>' for q, x in g['faq'])]
        if g.get('links'):
            o.append('  <div class="rel" style="margin-top:18px">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in g['links']) + '</div>')
        o.append('</div></section>\n')
    if p.get('rel'):
        o += ['<section><div class="w">', f'  <h2>{t["svc"]}</h2>',
              '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['rel']) + '</div>',
              '</div></section>\n']
    return o


def gallery_html(lang, items, h2=None, more=True):
    t = L[lang]
    figs = []
    for g in items:
        src, cap = g[0], g[1]
        alt = g[2] if len(g) > 2 else cap + t['alt']  # 3-й елемент — змістовний alt
        w, h = Image.open(os.path.join(ROOT, src)).size
        figs.append(f'<figure><img src="/{src}" loading="lazy" decoding="async" width="{w}" height="{h}" alt="{a(alt)}"><figcaption>{e(cap)}</figcaption></figure>')
    return ['<section><div class="w">', f'  <h2>{e(h2 or t["proj"])}</h2>', '  <div class="gal">' + ''.join(figs) + '</div>'] + (
        [f'  <p style="margin-top:18px"><a class="btn" href="/portfolio" hreflang="uk">{t["all_portfolio"]}</a></p>'] if more else []) + ['</div></section>\n']


def section_html(lang, x):
    """Секції сторінок без шаблону послуги (головна, послуги, про студію, контакти) — лише блоки UI-kit."""
    t, k = L[lang], x['t']
    h2 = f'  <h2>{e(x["h2"])}</h2>' if x.get('h2') else ''
    sid = f' id="{x["id"]}"' if x.get('id') else ''
    if k == 'cards':  # картки: заголовок (посилання), ціна, роль (картки команди), опис, пункти
        cards = []
        for c in x['items']:
            ttl = f'<a href="{c["href"]}">{e(c["h"])}</a>' if c.get('href') else e(c['h'])
            cards.append('<div class="card">' + f'<h3>{ttl}</h3>'
                         + (f'<p style="color:var(--ac)">{e(c["price"])}</p>' if c.get('price') else '')
                         + (f'<p style="color:var(--ac);font-size:var(--fs-small);letter-spacing:.12em;text-transform:uppercase">{e(c["role"])}</p>' if c.get('role') else '')
                         + (f'<p>{e(c["p"])}</p>' if c.get('p') else '')
                         + ('<ul>' + ''.join(f'<li>{e(i)}</li>' for i in c['li']) + '</ul>' if c.get('li') else '')
                         + (f'<p style="margin-top:10px"><a href="{c["href"]}">{e(c["more"])} →</a></p>' if c.get('more') and c.get('href') else '')
                         + '</div>')
        return [f'<section{sid}><div class="w">', h2, '  <div class="grid">' + ''.join(cards) + '</div>', '</div></section>\n']
    if k == 'text':
        return [f'<section{sid}><div class="w txt">{h2.strip()}' + ''.join(f'<p>{e(p)}</p>' for p in x['p']) + '</div></section>\n']
    if k == 'steps':
        return [f'<section{sid}><div class="w">', h2,
                '  <ol class="steps">' + ''.join(f'<li><div><b>{e(b)}</b><span>{e(s)}</span></div></li>' for b, s in x['items']) + '</ol>',
                '</div></section>\n']
    if k == 'guarantees':
        return [guarantees_html(lang)]
    if k == 'gallery':
        return gallery_html(lang, x['items'], x.get('h2'), x.get('more', True))
    if k == 'faq':
        return [f'<section{sid}><div class="w">', h2,
                '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(v)}</p></details>' for q, v in x['items']), '</div></section>\n']
    if k == 'map':  # карта офісу (tools/site/casmap.py): постер + MapLibre по кліку, «Маршрут» і Google Maps
        return [casmap.office_html(lang, x.get('h2'))]
    if k == 'rel':
        return [f'<section{sid}><div class="w">', h2,
                '  <div class="rel">' + ''.join(f'<a href="{u}"' + (' hreflang="uk"' if u in ('/portfolio',) else '') + f'>{e(n)}</a>' for u, n in x['items']) + '</div>',
                '</div></section>\n']
    raise ValueError(f'невідома секція {k}')


# орієнтир бюджету «площа × базова ставка» (як картка кейсу в /styleguide/): ui.py перевіряє data-est
BUDGET = {
    'uk': dict(pre='від', rows=[('Ремонт під ключ', 550), ('Дизайн-проєкт інтерʼєру', 30), ('Меблювання й комплектація', 250)],
               note='Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали й техніка — окремо, за кошторисом. Орієнтир за базовими ставками студії (дизайн — мінімум $2 500); точна сума — після заміру й кошторису. '
                    'Якщо ремонт робить CAS, підсумок не відхиляється від кошторису більше ніж на ±5%.'),
    'ru': dict(pre='от', rows=[('Ремонт под ключ', 550), ('Дизайн-проект интерьера', 30), ('Меблировка и комплектация', 250)],
               note='Ремонт от $550/м² — работы и черновые материалы; чистовые материалы и техника — отдельно, по смете. Ориентир по базовым ставкам студии (дизайн — минимум $2 500); точная сумма — после замера и сметы. '
                    'Если ремонт делает CAS, итог не отклоняется от сметы больше чем на ±5%.'),
}


def money(n):
    return '$' + f'{n:,}'.replace(',', ' ')


def budget_html(lang, b):
    d, ar = BUDGET[lang], int(b['area'])
    li = []
    for name, r in d['rows']:
        v = max(ar * r, 2500) if r == 30 else ar * r
        li.append(f'<li>{e(name)} · <span style="white-space:nowrap">{ar} м² × {money(r)}/м²</span> — '
                  f'<b data-est="{ar}x{r}" style="color:var(--ac);white-space:nowrap">{d["pre"]} {money(v)}</b></li>')
    return ('<section><div class="w txt">' + f'<h2>{e(b["h2"])}</h2>' + (f'<p>{e(b["p"])}</p>' if b.get('p') else '')
            + '<div class="card" style="margin:0"><ul style="list-style:none;padding:0;margin:0 0 6px">' + ''.join(li) + '</ul>'
            + f'<p style="margin:0"><small>{e(d["note"])}</small></p></div></div></section>\n')


def cluster_html(c):
    """Блок «схожі запити» (кластер інтентів): [h2, вступ, [[url, анкор], ...]] — різні анкори на сусідні сторінки кластера."""
    h, intro, links = c
    return ('<section><div class="w txt">' + f'<h2>{e(h)}</h2>' + (f'<p>{rich(intro)}</p>' if intro else '')
            + '<div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in links) + '</div></div></section>\n')


def hero_html(p):
    t = L[p['lang']]
    if p.get('slug') == 'index':
        crumbs = ''
    elif p.get('groups') or p.get('sections'):
        crumbs = f'<div class="w crumbs"><a href="{t["home_url"]}">{t["home"]}</a> / {e(p["h1"])}</div>\n'
    else:
        mid = p.get('parent') or [t['svc_url'], t['svc']]
        crumbs = f'<div class="w crumbs"><a href="{t["home_url"]}">{t["home"]}</a> / <a href="{mid[0]}">{e(mid[1])}</a> / {e(p["h1"])}</div>\n'
    btn2 = p.get('btn2') or ['tel:+380978667755', '+380 97 866 77 55']
    return [crumbs, '<div class="w hero">', f'  <h1>{e(p["h1"])}</h1>'] + ([f'  <div class="price">{e(p["price"])}</div>'] if p.get('price') else []) + [f'  <p>{e(p["lead"])}</p>',
            '  <div class="btns">',
            f'    <a class="btn main" href="#zayavka">{e(p.get("cta") or t["cta"])}</a>',
            f'    <a class="btn" href="{btn2[0]}">{e(btn2[1])}</a>', '  </div>'] + (
            ['  <div class="facts">' + ''.join(f'<div><b>{e(b)}</b><span>{e(s)}</span></div>' for b, s in p.get('facts', FACTS[p['lang']])) + '</div>']
            if p.get('facts', True) else []) + ['</div>\n']


def main_html(p):
    t = L[p['lang']]
    o = hero_html(p)
    if p.get('calc'):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import calc
        o.append(calc.block(p['lang']) + '\n')
    if p.get('extra'):
        o.append(p['extra'] + '\n')
    if p.get('groups'):
        return '\n'.join(o + groups_html(p))
    if p.get('sections'):
        for x in p['sections']:
            o += section_html(p['lang'], x)
        return '\n'.join(o)
    o += ['<section><div class="w">', f'  <h2>{t["inc"]}</h2>',
          '  <div class="grid">' + ''.join(f'<div class="card"><h3>{e(h)}</h3><ul>' + ''.join(f'<li>{e(i)}</li>' for i in li) + '</ul></div>' for h, li in p['cards']) + '</div>',
          '</div></section>\n']
    for h, ps in p.get('about', []):
        o.append(f'<section><div class="w txt"><h2>{e(h)}</h2>' + ''.join(f'<p>{rich(x)}</p>' for x in ps) + '</div></section>\n')
    if p.get('budget'):
        o.append(budget_html(p['lang'], p['budget']))
    if p.get('gallery'):
        o += gallery_html(p['lang'], p['gallery'])
    o += ['<section><div class="w">', f'  <h2>{t["steps"]}</h2>',
          '  <ol class="steps">' + ''.join(f'<li><div><b>{e(b)}</b><span>{e(s)}</span></div></li>' for b, s in p['steps']) + '</ol>',
          '</div></section>\n'] + ([guarantees_html(p['lang'])] if p.get('guarantees') else []) + [
          '<section><div class="w">', f'  <h2>{t["faq"]}</h2>',
          '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{rich(x)}</p></details>' for q, x in p['faq']),
          '</div></section>\n'] + ([
          '<section><div class="w">', f'  <h2>{e(p["near"][0])}</h2>',
          '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['near'][1]) + '</div>',
          '</div></section>\n'] if p.get('near') else []) + ([cluster_html(p['cluster'])] if p.get('cluster') else []) + [
          '<section><div class="w">', f'  <h2>{t["rel"]}</h2>',
          '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['rel']) + '</div>',
          '</div></section>\n']
    return '\n'.join(o)


def ld(p):
    lang = p['lang']
    t, u, hl = L[lang], url(lang, p['slug']), i18n.meta(lang)['hreflang']
    home = B.rstrip('/') + t['home_url']
    page = {'@type': {'about': 'AboutPage', 'contact': 'ContactPage'}.get(p.get('kind'), 'WebPage'), '@id': u + '#page', 'url': u,
            'name': p['title'], 'inLanguage': hl, 'isPartOf': {'@type': 'WebSite', '@id': B + '#site', 'url': B, 'name': 'CAS Development'}}
    if p.get('slug') == 'index':
        page['about'] = ORG
        g = [page]
    elif p.get('groups') or p.get('sections'):
        g = [{'@type': 'BreadcrumbList', 'itemListElement': [
                 {'@type': 'ListItem', 'position': 1, 'name': t['home'], 'item': home},
                 {'@type': 'ListItem', 'position': 2, 'name': p['h1'], 'item': u}]}, page]
    else:
        g = [{'@type': 'Service', 'name': p['service'], 'serviceType': p['service'], 'areaServed': area_served(lang), 'provider': ORG, 'url': u},
             {'@type': 'BreadcrumbList', 'itemListElement': [
                 {'@type': 'ListItem', 'position': 1, 'name': t['home'], 'item': home},
                 {'@type': 'ListItem', 'position': 2, 'name': (p.get('parent') or [0, t['svc']])[1], 'item': B.rstrip('/') + (p.get('parent') or [t['svc_url']])[0]},
                 {'@type': 'ListItem', 'position': 3, 'name': p['h1'], 'item': u}]}, page]
    qa = faqs(p)
    if qa:
        f = {'@type': 'FAQPage', 'inLanguage': hl, 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': plain(x)}} for q, x in qa]}
        if p.get('groups'):
            f.update({'@id': u + '#faq', 'url': u, 'name': p['h1']})
        g.append(f)
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False)


def build(p):
    lang, slug = p['lang'], p['slug']
    s = leadform.QUICK_RX.sub('', open(os.path.join(ROOT, TPL[lang]), encoding='utf-8').read())  # швидку заявку ставить leadform
    u = url(lang, slug)
    if lang not in ('uk', 'ru'):
        s = translate_tpl(i18n.html_attrs(s, lang), lang)
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
    members = i18n.cluster_of(u.replace(B.rstrip('/'), '') or '/')
    if members is not None:  # сторінка з кластера (усі мови) — hreflang з tools/site/lang/clusters.json
        members[lang] = u.replace(B.rstrip('/'), '') or '/'
        s = i18n.set_alternates(s, members)
    elif p.get('pair'):
        uk_u, ru_u = (u, url('ru', p['pair'])) if lang == 'uk' else (url('uk', p['pair']), u)
        alt = (f'<link rel="alternate" hreflang="uk" href="{uk_u}">\n<link rel="alternate" hreflang="ru" href="{ru_u}">\n'
               f'<link rel="alternate" hreflang="x-default" href="{uk_u}">\n')
        s = s.replace('<meta name="twitter:card"', alt + '<meta name="twitter:card"', 1)
    s = re.sub(r'(<script type="application/ld\+json">\n?).*?(\n?</script>)', lambda m: m.group(1) + ld(p).replace('</', '<\\/') + m.group(2), s, count=1, flags=re.S)
    s, n = re.subn(r'(<main\b[^>]*>)\n.*?(<section id="zayavka">)', lambda m: m.group(1) + '\n' + main_html(p) + m.group(2), s, count=1, flags=re.S)
    assert n == 1, f'{slug}: не знайдено <main>…<section id="zayavka"> у шаблоні'
    if p.get('form_h2'):
        s = re.sub(r'(<section id="zayavka"><div class="w">\s*<h2>)[^<]*', lambda m: m.group(1) + e(p['form_h2']), s, count=1)
    s = re.sub(r'data-service="[^"]*"', f'data-service="{a(p["service"])}"', s, count=1)
    src = 'cas-develop.com/' + i18n.meta(lang)['prefix'] + ('' if slug == 'index' else slug)
    s = re.sub(r'data-source="[^"]*"', f'data-source="{src}"', s, count=1)
    s = leadform.apply(s, path(lang, slug))  # форма: обовʼязковий лише телефон; швидка заявка біля першого CTA
    s = captions.apply(s, path(lang, slug))
    # шапка й футер: мова, перемикач на пару (hreflang) і посилання — з chrome.py
    if any(x['t'] == 'map' for x in p.get('sections', [])):
        s = casmap.assets(s)
    s = chrome.apply(s, path(lang, slug))
    os.makedirs(os.path.dirname(os.path.join(ROOT, path(lang, slug))), exist_ok=True)
    open(os.path.join(ROOT, path(lang, slug)), 'w', encoding='utf-8').write(s)
    return path(lang, slug)


def link_pair(p):
    """Додає hreflang і посилання на мову на парну сторінку, якщо її збирали не цим скриптом."""
    if not p.get('pair') or i18n.cluster_of(url(p['lang'], p['slug']).replace(B.rstrip('/'), '') or '/') is not None:
        return  # сторінки кластерів синхронізує i18n.sync()
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
    ok = {'$30', '$350', '$550', '$250', '$600', '$1 100', '$1,100', '$50', '$2 500', '$2,500', '$500',
          '$5 000', '$5,000'}  # $500 — мін. замовлення Оздоби; $5 000 — поріг знижки за обсягом 3% (Михайло 25.10.2026)
    for m in re.findall(r'\$\s?\d[\d ,.]*\d|\$\d', txt):
        m = m.strip().rstrip(',.')
        if m not in ok and not re.fullmatch(r'\$\d{2,3}[ ,.]\d{3}', m):  # розрахунок площа × ставка
            errs.append('ціна ' + m)
    if len(p['description']) > 160: errs.append('description > 160')
    if p['lang'] not in L: errs.append('мова без словника: ' + p['lang'])
    for g in p.get('gallery', []) + [i for x in p.get('sections', []) if x['t'] == 'gallery' for i in x['items']]:
        src = g[0]
        if not os.path.exists(os.path.join(ROOT, src)): errs.append('нема ' + src)
    for h in re.findall(r'"(/[a-z0-9/-]*)"', txt):  # внутрішні посилання — на наявні сторінки
        if not h.startswith(('/img/', '/assets/', '/fonts/')) and not i18n.exists(h) and h not in PENDING:
            errs.append('посилання на неіснуючу сторінку ' + h)
    return errs


PENDING = set()  # сторінки, що збираються в цьому ж запуску (посилання між новими сторінками)


if __name__ == '__main__':
    only = set(sys.argv[1:])
    bad, built = 0, []
    allp = [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(ROOT, 'tools/site/pages/*.json')))]
    PENDING.update('/' + i18n.meta(p['lang'])['prefix'] + ('' if p['slug'] == 'index' else p['slug']) for p in allp)
    # головні сторінки мов — першими (перемикач мов показує лише мови з наявною головною)
    allp.sort(key=lambda p: p['slug'] != 'index')
    for p in allp:
        if only and p['slug'] not in only: continue
        errs = check(p)
        if errs:
            bad = 1; print('❌', p['lang'], p['slug'], errs); continue
        print('✓', build(p)); link_pair(p); built.append(url(p['lang'], p['slug']))
    i18n.sync()  # повні hreflang-кластери і перемикач мов на всіх сторінках кластерів (у т.ч. ручних)
    import datetime
    sitemap(built, datetime.date.today().isoformat())
    sys.exit(bad)
