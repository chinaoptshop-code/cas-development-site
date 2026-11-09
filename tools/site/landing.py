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
   "prices": {"h2": "...", "p": "...", "rows": ["design", "repair", "furnish"]} (необовʼязково — таблиця 40/65/80/120 м² × ставка «від»),
   "packages": true (необовʼязково — три пакети дизайн-проєкту, PACKAGES; uk/ru/en),
   у "sections" — також {"t": "prices", ...}, {"t": "packages"}, {"t": "guarantees", "more": false},
   {"t": "ba", "h2", "items": [{"before", "after", "alt_before", "alt_after", "caption"}]} (слайдер «до / після», ba_html),
   "form_html": "<form id=of data-lf=keep …>…<div class=ok id=oOk>…</p></div>" (необовʼязково — власна форма, напр. реферальна).
Ручні сторінки: блоки між <!--cas:guarantees-->, <!--cas:prices-->, <!--cas:packages--> оновлює sync_manual().
   "near": ["h2", [["/url", "назва"], ...]] (необовʼязково — блок посилань перед «Інші послуги»),
   "cluster": ["h2", "вступ", [["/url", "анкор"], ...]] (необовʼязково — сусідні інтенти кластера запитів, tools/site/keywords.json),
   "geo": "kyiv" | "ua" | "hubs" (необовʼязково — блок «Працюємо в Києві та області / по Україні» з посиланнями на міста, GEO),
   "places": ["h2", "вступ", [{"h", "href", "p"}, ...]] (необовʼязково — картки міст з посиланнями, хаби географії),
   "area": [{"@type": "City", "name": "..."}, ...] (необовʼязково — areaServed послуги замість типового Київ/область/Україна/Європа),
   "guarantees": "no5" — блок «Гарантії» без пункту ±5% (регіони поза Київщиною),
   "facts": [["12 міс.", "гарантія"], ...] (необовʼязково — свої факти в hero замість типових),
   "assets": ["assets/<файл>.css", "assets/<файл>.js"] (необовʼязково — стилі/скрипт інтерактивного блоку з "extra", напр. демо /onlain-kontrol)}
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
import rich as richsec  # розширені секції: головна/послуги/про/контакти/портфоліо (tools/site/rich.py)
import ux  # іконки заголовків і згортання (tools/site/ux.py) — знімаємо з шаблону

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
# Блок «Гарантії» (UI-kit: картки .grid/.card). Гарантія 12 міс., своя команда, схеми оплати під клієнта
# і камера 24/7 за доп. оплату — Михайло 26.10.2026; фотозвіти раз на 1–2 тижні — Михайло 25.10.2026.
# Ручні сторінки тримають той самий блок між маркерами — його оновлює sync_manual() під час збірки.
GUAR = {
    'uk': ('Гарантії', [
        ('Гарантія 12 місяців на роботи', 'Здаємо обʼєкт з актом; на виконані роботи діє гарантія 12 місяців.'),
        ('Кошторис ±5%, якщо ремонт робить CAS', 'Кошторис складаємо до старту робіт. Якщо ремонт виконує наша команда, підсумок не відхиляється від нього більше ніж на ±5%.'),
        ('Своя команда', 'Працюють наші штатні працівники, а не субпідряд, — під різну складність і тип робіт.'),
        ('Договір і оплата під вас', 'Ціну, строки й графік платежів фіксуємо в договорі: 50/50, 50/30/20, 50/40/10 або розбивка на етапи; старт — від 10% авансу.'),
        ('Фотозвіти й камера 24/7', 'Раз на 1–2 тижні — фото з обʼєкта в Telegram; за доп. оплату — онлайн-камера на обʼєкті 24/7.')]),
    'ru': ('Гарантии', [
        ('Гарантия 12 месяцев на работы', 'Сдаём объект с актом; на выполненные работы действует гарантия 12 месяцев.'),
        ('Смета ±5%, если ремонт делает CAS', 'Смету составляем до старта работ. Если ремонт выполняет наша команда, итог не отклоняется от неё больше чем на ±5%.'),
        ('Своя команда', 'Работают наши штатные сотрудники, а не субподряд, — под разную сложность и тип работ.'),
        ('Договор и оплата под вас', 'Цену, сроки и график платежей фиксируем в договоре: 50/50, 50/30/20, 50/40/10 или разбивка на этапы; старт — от 10% аванса.'),
        ('Фотоотчёты и камера 24/7', 'Раз в 1–2 недели — фото с объекта в Telegram; за доп. оплату — онлайн-камера на объекте 24/7.')]),
}
# посилання з блоку «Гарантії» на сторінку «Договір, гарантія, оплата» (сторінка є лише uk/ru/en)
GUAR_MORE = {'uk': ('/dogovir-garantiya-oplata', 'Договір на ремонт, гарантія й оплата — докладно'),
             'ru': ('/ru/dogovor-garantiya-oplata', 'Договор на ремонт, гарантия и оплата — подробно'),
             'en': ('/en/contract-warranty-payment', 'Contract, warranty and payment — details')}


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
    'send': '>Отримати розрахунок<', 'ok_h': '>Заявку отримано<', 'ok_p': '>Звʼяжемося найближчим часом.<',
    'mbar': 'aria-label="Швидкий зв\'язок"', 'call': '</svg>Подзвонити</a>',
    'close': "'Закрити'", 'prev': "'Попереднє фото'", 'next': "'Наступне фото'", 'menu': "'Меню'",
}



def _lead_p(p):
    """Лід hero. "line" (головні, Михайло 05.11.2026: «Київ · Україна · Worldwide») — видимий рядок під H1,
    увесь "lead" — після нього; ux._lead_rest ховає його в span.ux-rest (у DOM для SEO, тап — розгортає)."""
    if p.get('line'):
        return f'  <p><span class="ux-ln">{e(p["line"])}</span> {e(p["lead"])}</p>'
    return f'  <p>{e(p["lead"])}</p>'

def translate_tpl(s, lang):
    f = i18n.ui(lang)['form']
    for k, uk in FORM_UK.items():
        if uk not in s and k in ('close', 'prev', 'next', 'menu'):  # підписи лайтбокса — тепер у /assets/ui-polish.v1.js (за мовою)
            continue
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


def guarantees_html(lang, more=True, no5=False):
    """no5 — без пункту «Кошторис ±5%» (регіони поза Києвом і областю: ±5% обіцяємо лише в Києві й області)."""
    h, items = GUAR[lang]
    if no5:
        items = [x for x in items if '±5%' not in x[0]]
    m = GUAR_MORE.get(lang) if more else None
    return ('<!--cas:guarantees--><section><div class="w">\n'
            f'  <h2>{h}</h2>\n'
            '  <div class="grid">' + ''.join(f'<div class="card"><h3>{e(t)}</h3><p>{e(x)}</p></div>' for t, x in items) + '</div>\n'
            + (f'  <p style="margin-top:18px"><a href="{m[0]}">{e(m[1])} →</a></p>\n' if m else '')
            + '</div></section><!--/cas:guarantees-->\n')


# Типові площі × базові ставки «від» (CLAUDE.md): дизайн $30/м² (мін. $2 500), ремонт $550/м² (роботи + чорнові),
# меблювання $250/м². Комірки — <b data-est> (ui.py перевіряє розрахунок). UI-kit: /styleguide/ «Таблиця цін для типових площ».
AREAS = (40, 65, 80, 120)
PRICE_ROWS = {'design': 30, 'repair': 550, 'furnish': 250}
PRICES = {
    'uk': dict(pre='від', area='Площа', unit='м²', rows={'design': 'Дизайн-проєкт · від $30/м², мін. $2 500', 'repair': 'Ремонт під ключ · від $550/м²',
               'furnish': 'Меблювання · від $250/м²'},
               note='Орієнтовно, «від»; точно — за кошторисом після заміру. Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо.', design=' Дизайн-проєкт — мінімум $2 500, тому для 40–80 м² це $2 500.'),
    'ru': dict(pre='от', area='Площадь', unit='м²', rows={'design': 'Дизайн-проект · от $30/м², мин. $2 500', 'repair': 'Ремонт под ключ · от $550/м²',
               'furnish': 'Меблировка · от $250/м²'},
               note='Ориентировочно, «от»; точно — по смете после замера. Ремонт от $550/м² — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно.', design=' Дизайн-проект — минимум $2 500, поэтому для 40–80 м² это $2 500.'),
    'en': dict(pre='from', area='Area', unit='m²', rows={'design': 'Design project · from $30/m², min. $2,500', 'repair': 'Turnkey renovation · from $550/m²',
               'furnish': 'Furnishing · from $250/m²'},
               note='Indicative “from” prices; the exact figure comes from the estimate after the site survey. Renovation from $550/m² covers labour and rough materials; '
                    'finishing materials, furniture and appliances are extra.', design=' The design project minimum is $2,500, so for 40–80 m² it is $2,500.'),
}
PRICE_CSS = ('<style>.ptab{overflow-x:auto;margin:0 0 10px}.ptab table{width:100%;border-collapse:collapse;font-size:var(--fs-small);min-width:520px}'
             '.ptab th,.ptab td{padding:10px 8px;border-bottom:1px solid var(--ln);text-align:right;white-space:nowrap}'
             '.ptab :is(th,td):first-child{text-align:left;white-space:normal}.ptab th{color:var(--mu);font-weight:500}</style>')


def money(n, lang='uk'):
    return i18n.usd(n, lang)  # єдиний формат мови ($2 500; en — $2,500), ui.py читає data-est uk/ru


def prices_html(lang, x):
    """Таблиця «типові площі × ставка від»: x = {"h2", "p" (необовʼязково), "rows": ["design", "repair", "furnish"]}."""
    d = PRICES[lang]
    head = f'<tr><th>{e(d["area"])}</th>' + ''.join(f'<th>{a_} {d["unit"]}</th>' for a_ in AREAS) + '</tr>'
    body = ''
    for k in x.get('rows', list(PRICE_ROWS)):
        r = PRICE_ROWS[k]
        body += f'<tr><td>{e(d["rows"][k])}</td>' + ''.join(
            f'<td><b data-est="{ar}x{r}">{d["pre"]} {money(max(ar * r, 2500) if r == 30 else ar * r, lang)}</b></td>' for ar in AREAS) + '</tr>'
    return ('<!--cas:prices--><section><div class="w txt">' + PRICE_CSS + f'<h2>{e(x["h2"])}</h2>' + (f'<p>{rich(x["p"])}</p>' if x.get('p') else '')
            + f'<div class="ptab"><table><thead>{head}</thead><tbody>{body}</tbody></table></div>'
            + f'<p><small>{e(d["note"] + (d["design"] if "design" in x.get("rows", PRICE_ROWS) else ""))}</small></p></div></section><!--/cas:prices-->\n')


# Пакети дизайн-проєкту — порівняння (UI-kit: /styleguide/ «Порівняння пакетів дизайну»; стилі .pk — /assets/site-chrome.v1.css).
# Базовий — від $30/м², мін. $2 500 (Михайло); планувальний від $6/м² і повний від $45/м² — ринкова практика Києва 2026
# (Михайло делегував 27.10.2026); мінімум $2 500 для всіх пакетів — Михайло 31.10.2026. Склад — з попередніх карток пакетів.
# Кожен пункт — (текст, рівень): 0 — у всіх пакетах, 1 — з базового, 2 — лише в повному. Телефон: свайп-картки (scroll-snap).
PACKAGES = {
    'uk': dict(h='Пакети дизайн-проєкту: порівняння',
               pk=[('Планувальний', 'від $6/м²'), ('Базовий дизайн-проєкт', 'від $30/м²'), ('Повний з авторським наглядом', 'від $45/м²')],
               items=[('обмірний план приміщення', 0), ('2–3 варіанти планування', 0), ('план розстановки меблів', 0), ('експлікація приміщень', 0),
                      ('3D-візуалізації всіх приміщень', 1), ('робочі креслення для ремонту', 1),
                      ('специфікації матеріалів і меблів', 1), ('розгортки стін, креслення меблів', 2),
                      ('авторський нагляд під час ремонту', 2), ('підбір меблів, світла й декору', 2)],
               min='мін. $2 500', no='не входить', cta='Обговорити пакет', hint='Гортайте, щоб порівняти →',
               note='Мінімум — $2 500 для будь-якого пакета; точну суму й склад фіксуємо в договорі. Закупівля меблів — окремо (комплектація).'),
    'ru': dict(h='Пакеты дизайн-проекта: сравнение',
               pk=[('Планировочный', 'от $6/м²'), ('Базовый дизайн-проект', 'от $30/м²'), ('Полный с авторским надзором', 'от $45/м²')],
               items=[('обмерный план помещения', 0), ('2–3 варианта планировки', 0), ('план расстановки мебели', 0), ('экспликация помещений', 0),
                      ('3D-визуализации всех помещений', 1), ('рабочие чертежи для ремонта', 1),
                      ('спецификации материалов и мебели', 1), ('развёртки стен, чертежи мебели', 2),
                      ('авторский надзор во время ремонта', 2), ('подбор мебели, света и декора', 2)],
               min='мин. $2 500', no='не входит', cta='Обсудить пакет', hint='Листайте, чтобы сравнить →',
               note='Минимум — $2 500 для любого пакета; точную сумму и состав фиксируем в договоре. Закупка мебели — отдельно (комплектация).'),
    'en': dict(h='Design project packages compared',
               pk=[('Layout', 'from $6/m²'), ('Standard design project', 'from $30/m²'), ('Full, with designer supervision', 'from $45/m²')],
               items=[('measured survey plan', 0), ('2–3 layout options', 0), ('furniture arrangement plan', 0), ('room schedule', 0),
                      ('3D visualisations of every room', 1), ('working drawings for the renovation', 1),
                      ('material and furniture specifications', 1), ('wall elevations, furniture drawings', 2),
                      ('designer supervision during renovation', 2), ('selection of furniture, lighting and decor', 2)],
               min='min. $2,500', no='not included', cta='Discuss this package', hint='Swipe to compare →',
               note='Minimum $2,500 for any package; the exact fee and scope are fixed in the contract. Furniture purchasing is separate (procurement).'),
}


def packages_html(lang):
    d = PACKAGES[lang]
    cards = ''
    for i, (name, price) in enumerate(d['pk']):
        yes = ''.join(f'<li>{e(t)}</li>' for t, lvl in d['items'] if lvl <= i)
        no = ''.join(f'<li>{e(t)}</li>' for t, lvl in d['items'] if lvl > i)  # «не входить» — окремим списком з aria-label (бюджет HTML)
        cards += (f'<div class="card pk-c"><h3>{e(name)}</h3><p class="pk-p">{e(price)} · {e(d["min"])}</p><ul class="pk-l">{yes}</ul>'
                  + (f'<ul class="pk-l pk-x" aria-label="{e(d["no"])}">{no}</ul>' if no else '')
                  + f'<a class="btn{" main" if i == 1 else ""}" href="#zayavka">{e(d["cta"])}</a></div>')
    return ('<!--cas:packages--><section><div class="w">\n' f'  <h2>{e(d["h"])}</h2>\n' + (f'  <p class="pk-in">{e(d["intro"])}</p>\n' if d.get('intro') else '')
            + f'  <p class="pk-h" aria-hidden="true">{e(d["hint"])}</p><div class="pk">{cards}</div>\n'
            f'  <p class="pk-m"><small>{e(d["note"])}</small></p>\n'
            '</div></section><!--/cas:packages-->\n')


def _prices_cfg(block):
    """Конфіг таблиці цін з уже вставленого блоку ручної сторінки: h2, вступ (з посиланнями) і рядки."""
    h2 = html.unescape(re.search(r'<h2[^>]*>(.*?)</h2>', block).group(1))
    p = re.search(r'</h2><p>(.*?)</p><div class="ptab">', block)
    p = MDLINK_BACK(html.unescape(p.group(1))) if p else ''
    rates = {int(r) for r in re.findall(r'data-est="\d+x(\d+)"', block)}
    return {'h2': h2, 'p': p, 'rows': [k for k, r in PRICE_ROWS.items() if r in rates]}


MDLINK_BACK = lambda s: re.sub(r'<a href="(/[^"]*)">(.*?)</a>', r'[\2](\1)', s)


def sync_manual(generated):
    """Ручні сторінки (не з pages/*.json): оновлює блоки між маркерами з тих самих джерел, що й лендинги —
    «Гарантії» (стандартна розмітка .grid), «Таблиця цін» і «Пакети дизайну». Мова — з <html lang>."""
    langs = {i18n.meta(l)['hreflang'].split('-')[0]: l for l in GUAR}
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, '*/*.html'))):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(('tools/', '.claude', 'blog/', 'styleguide/')) or '/blog/' in rel or rel in generated:
            continue
        s = open(f, encoding='utf-8').read()
        if '<!--cas:' not in s:
            continue
        m = re.search(r'<html[^>]*\blang="([a-z]+)', s)
        lang = langs.get(m.group(1) if m else 'uk', 'uk')
        n = re.sub(r'<!--cas:guarantees--><section><div class="w"(?: data-c="\w")?>\n.*?<!--/cas:guarantees-->\n?', lambda x: guarantees_html(lang), s, flags=re.S)
        if lang in PACKAGES:
            n = re.sub(r'<!--cas:packages-->.*?<!--/cas:packages-->\n?', lambda x: packages_html(lang), n, flags=re.S)
        if lang in GEO:  # блок «Географія» (посилання на сторінки міст)
            n = re.sub(r'<!--cas:geo:(kyiv|ua|hubs)-->.*?<!--/cas:geo-->\n?', lambda x: geo_html(lang, x.group(1)), n, flags=re.S)
        if lang in PRICES:  # заголовок і вступ — з наявного блоку, рядки — за ставками в data-est
            n = re.sub(r'<!--cas:prices-->.*?<!--/cas:prices-->\n?', lambda x: prices_html(lang, _prices_cfg(x.group(0))), n, flags=re.S)
        if n != s:
            n = chrome.apply(n, rel)  # шапка/футер і типографіка (нерозривні пробіли) — як після chrome.py
            if n != s:
                open(f, 'w', encoding='utf-8').write(n)
                out.append(rel)
    return out


def area_served(lang):
    """Географія (підтверджено Михайлом): Київ і область, Україна, Європа, світ."""
    t = L[lang]
    return [{'@type': 'City', 'name': t['city']}, {'@type': 'AdministrativeArea', 'name': t['region']},
            {'@type': 'Country', 'name': t['country']}, {'@type': 'Continent', 'name': t['europe']}]


# мінімальний вузол організації замість голого посилання на #business (повні дані LocalBusiness — на головній, той самий @id)
ORG = {'@type': 'Organization', '@id': B + '#business', 'name': 'CAS Development', 'url': B, 'logo': B + 'apple-touch-icon.png'}
# профілі бренду для головних сторінок мов (Knowledge Graph): Instagram, Google Maps (cid), YouTube — Kuula не додаємо;
# YouTube media.py підставляє з tools/site/media.json (youtube_channel)
SAME_AS = ['https://www.instagram.com/cas_development/', 'https://maps.google.com/?cid=15015666645432112566',
           'https://www.youtube.com/@cas_development']
# офіс і години роботи — з Google Business Profile (09.11.2026): вул. Антоновича, 44, 03186; Пн–Пт 10:00–20:00, Сб–Нд вихідні (онлайн 24/7)
HOURS = [{'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          'opens': '10:00', 'closes': '20:00'}]
STREET = {'uk': 'вул. Антоновича, 44', 'ru': 'ул. Антоновича, 44'}  # інші мови — латиницею
LB_GEO = {'@type': 'GeoCoordinates', 'latitude': 50.4335971, 'longitude': 30.5131241}
MAP = 'https://maps.google.com/?cid=15015666645432112566'


def business(lang, **extra):
    """Повний вузол LocalBusiness (той самий @id, що на головній) для «Контактів» і «Про студію» всіх мов."""
    t = L[lang]
    return dict({'@type': ['HomeAndConstructionBusiness', 'GeneralContractor'], '@id': B + '#business', 'name': 'CAS Development', 'url': B,
                 'logo': B + 'apple-touch-icon.png', 'image': B + 'img/og-cas.jpg', 'telephone': '+380978667755', 'priceRange': '$$$',
                 'address': {'@type': 'PostalAddress', 'streetAddress': STREET.get(lang, '44 Antonovycha St'), 'addressLocality': t['city'],
                             'postalCode': '03186', 'addressCountry': 'UA'},
                 'geo': LB_GEO, 'hasMap': MAP, 'openingHoursSpecification': HOURS, 'sameAs': SAME_AS}, **extra)
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
    """Секції сторінок без шаблону послуги (головна, послуги, про студію, контакти) — лише блоки UI-kit.
    Розширені типи (svc, covers, strip, split, facts, cta, contacts, team, project, pmap) — tools/site/rich.py;
    "kicker" (рядок над H2), "link" (посилання під секцією) і "cls" (клас секції) — для будь-якого типу."""
    if x['t'] in richsec.TYPES:
        return richsec.render(lang, x)
    o = _section_html(lang, x)
    if x.get('kicker') or x.get('link') or x.get('cls'):
        s = ''.join(o)
        if x.get('kicker'):
            s = s.replace('<h2', f'<p class="kick">{e(x["kicker"])}</p><h2', 1)
        if x.get('link'):
            k = s.rfind('</div></section>')
            s = s[:k] + richsec.link(x) + s[k:]
        if x.get('cls'):
            s = s.replace('<section', f'<section class="{x["cls"]}"', 1)
        o = [s]
    return o


def _section_html(lang, x):
    t, k = L[lang], x['t']
    h2 = f'  <h2>{e(x["h2"])}</h2>' if x.get('h2') else ''
    sid = f' id="{x["id"]}"' if x.get('id') else ''
    if k == 'cards':  # картки: заголовок (посилання), ціна, роль (картки команди), опис, пункти
        cards = []
        for c in x['items']:
            ttl = f'<a href="{c["href"]}">{e(c["h"])}</a>' if c.get('href') else e(c['h'])
            # c["ico"] (емодзі) не виводимо: лінійну іконку картці ставить ux.py (data-i) — без емодзі в інтерфейсі (unslop)
            cards.append('<div class="card">' + f'<h3>{ttl}</h3>'
                         + (f'<p style="color:var(--ac)">{e(c["price"])}</p>' if c.get('price') else '')
                         + (f'<p style="color:var(--ac);font-size:var(--fs-small)">{e(c["role"])}</p>' if c.get('role') else '')
                         + (f'<p>{e(c["p"])}</p>' if c.get('p') else '')
                         + ('<ul>' + ''.join(f'<li>{e(i)}</li>' for i in c['li']) + '</ul>' if c.get('li') else '')
                         + (f'<p style="margin-top:10px"><a href="{c["href"]}">{e(c["more"])} →</a></p>' if c.get('more') and c.get('href') else '')
                         + '</div>')
        return [f'<section{sid}><div class="w">', h2, '  <div class="grid">' + ''.join(cards) + '</div>', '</div></section>\n']
    if k == 'text':
        return [f'<section{sid}><div class="w txt">{h2.strip()}' + ''.join(f'<p>{rich(p)}</p>' for p in x['p']) + '</div></section>\n']
    if k == 'steps':
        return [f'<section{sid}><div class="w">', h2,
                '  <ol class="steps">' + ''.join(f'<li><div><b>{e(b)}</b><span>{e(s)}</span></div></li>' for b, s in x['items']) + '</ol>',
                '</div></section>\n']
    if k == 'guarantees':
        return [guarantees_html(lang, x.get('more', True))]
    if k == 'prices':
        return [prices_html(lang, x)]
    if k == 'packages':
        return [packages_html(lang)]
    if k == 'gallery':
        return gallery_html(lang, x['items'], x.get('h2'), x.get('more', True))
    if k == 'faq':
        return [f'<section{sid}><div class="w">', h2,
                '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{rich(v)}</p></details>' for q, v in x['items']), '</div></section>\n']
    if k == 'map':  # карта офісу (tools/site/casmap.py): постер + MapLibre по кліку, «Маршрут» і Google Maps
        return [casmap.office_html(lang, x.get('h2'))]
    if k == 'ba':  # «до / після» (/assets/ba.v1.js + .css; підключає build()): лише реальні фото одного обʼєкта
        return [ba_html(lang, x)]
    if k == 'rel':
        return [f'<section{sid}><div class="w">', h2,
                '  <div class="rel">' + ''.join(f'<a href="{u}"' + (' hreflang="uk"' if u in ('/portfolio',) else '') + f'>{e(n)}</a>' for u, n in x['items']) + '</div>',
                '</div></section>\n']
    raise ValueError(f'невідома секція {k}')


# Компонент «до / після» (UI-kit: /styleguide/#ba). Секція {"t": "ba", "h2": "...", "items": [{"before": "img/...webp",
# "after": "img/...webp", "alt_before": "...", "alt_after": "...", "caption": "..."}]} — обидва фото одного ракурсу й розміру.
# Фото «до» не вигадуємо: лише справжні знімки обʼєкта. Без JS видно розріз 50/50; JS — /assets/ba.v1.js (pointer, ←/→, aria).
BA = {'uk': ('До', 'Після', 'Порівняти до і після'), 'ru': ('До', 'После', 'Сравнить до и после')}


def ba_html(lang, x):
    t0, t1, lab = BA.get(lang, ('Before', 'After', 'Compare before and after'))
    o = '<section><div class="w">' + (f'<h2>{e(x["h2"])}</h2>' if x.get('h2') else '')
    for it in x['items']:
        w, h = Image.open(os.path.join(ROOT, it['after'])).size
        o += (f'<figure class="ba-w"><div class="ba" style="aspect-ratio:{w}/{h}">'
              f'<img src="/{it["after"]}" loading="lazy" decoding="async" width="{w}" height="{h}" alt="{a(it.get("alt_after", t1))}">'
              f'<div class="ba-b"><img src="/{it["before"]}" loading="lazy" decoding="async" width="{w}" height="{h}" alt="{a(it.get("alt_before", t0))}"></div>'
              f'<span class="ba-t ba-t0" aria-hidden="true">{e(t0)}</span><span class="ba-t ba-t1" aria-hidden="true">{e(t1)}</span>'
              f'<div class="ba-h" role="slider" tabindex="0" aria-label="{a(lab)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div></div>'
              + (f'<figcaption>{e(it["caption"])}</figcaption>' if it.get('caption') else '') + '</figure>')
    return o + '</div></section>\n'


# орієнтир бюджету «площа × базова ставка» (як картка кейсу в /styleguide/): ui.py перевіряє data-est
BUDGET = {
    'uk': dict(pre='від', rows=[('Ремонт під ключ', 550), ('Дизайн-проєкт інтерʼєру', 30), ('Меблювання й комплектація', 250)],
               note='Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали й техніка — окремо, за кошторисом. Орієнтир за базовими ставками студії (дизайн — мінімум $2 500); точна сума — після заміру й кошторису. '
                    'Якщо ремонт робить CAS, підсумок не відхиляється від кошторису більше ніж на ±5%.'),
    'ru': dict(pre='от', rows=[('Ремонт под ключ', 550), ('Дизайн-проект интерьера', 30), ('Меблировка и комплектация', 250)],
               note='Ремонт от $550/м² — работы и черновые материалы; чистовые материалы и техника — отдельно, по смете. Ориентир по базовым ставкам студии (дизайн — минимум $2 500); точная сумма — после замера и сметы. '
                    'Если ремонт делает CAS, итог не отклоняется от сметы больше чем на ±5%.'),
}


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


def places_html(x):
    """Картки міст/регіонів з посиланнями (хаби географії): ["h2", "вступ", [{"h", "href", "p"}, ...]] — UI-kit .grid/.card."""
    h, intro, items = x
    return ('<section><div class="w">' + f'<h2>{e(h)}</h2>' + (f'<p style="color:var(--mu);max-width:62ch;margin:0 0 22px">{rich(intro)}</p>' if intro else '')
            + '<div class="grid">' + ''.join(f'<div class="card"><h3><a href="{c["href"]}">{e(c["h"])}</a></h3><p>{e(c["p"])}</p></div>' for c in items)
            + '</div></div></section>\n')


# Блок «Географія» на головних сторінках послуг: "geo": "kyiv" (ремонт/будівництво — Київ і область) або "ua" (дизайн,
# комплектація — по Україні). Ручні сторінки тримають блок між <!--cas:geo:kyiv--> / <!--cas:geo:ua--> і <!--/cas:geo--> (sync_manual).
# Ремонт і будівництво власними бригадами — у всіх областях і в Європі (Михайло 01.11.2026); ±5% — лише Київ і область.
GEO_KYIV = [('irpin', 'Ірпінь', 'irpen', 'Ирпень'), ('bucha', 'Буча', 'bucha', 'Буча'), ('hostomel', 'Гостомель', 'gostomel', 'Гостомель'),
            ('vyshneve', 'Вишневе', 'vishnevoe', 'Вишнёвое'), ('boiarka', 'Боярка', 'boyarka', 'Боярка'), ('brovary', 'Бровари', 'brovary', 'Бровары'),
            ('boryspil', 'Бориспіль', 'borispol', 'Борисполь'), ('vyshhorod', 'Вишгород', 'vyshgorod', 'Вышгород'), ('obukhiv', 'Обухів', 'obuhov', 'Обухов'),
            ('vasylkiv', 'Васильків', 'vasilkov', 'Васильков'), ('fastiv', 'Фастів', 'fastov', 'Фастов'), ('bila-tserkva', 'Біла Церква', 'belaya-tserkov', 'Белая Церковь')]
GEO_UA = [('lviv', 'Львів', 'lvov', 'Львов'), ('odesa', 'Одеса', 'odessa', 'Одесса'), ('dnipro', 'Дніпро', 'dnepr', 'Днепр'),
          ('vinnytsia', 'Вінниця', 'vinnitsa', 'Винница'), ('zhytomyr', 'Житомир', 'zhitomir', 'Житомир'), ('chernihiv', 'Чернігів', 'chernigov', 'Чернигов'),
          ('cherkasy', 'Черкаси', 'cherkassy', 'Черкассы'), ('poltava', 'Полтава', 'poltava', 'Полтава'), ('ivano-frankivsk', 'Івано-Франківськ', 'ivano-frankovsk', 'Ивано-Франковск'),
          ('ternopil', 'Тернопіль', 'ternopol', 'Тернополь'), ('uzhhorod', 'Ужгород', 'uzhgorod', 'Ужгород'), ('rivne', 'Рівне', 'rovno', 'Ровно'),
          ('lutsk', 'Луцьк', 'lutsk', 'Луцк'), ('khmelnytskyi', 'Хмельницький', 'hmelnitskiy', 'Хмельницкий'), ('chernivtsi', 'Чернівці', 'chernovtsy', 'Черновцы'),
          ('kropyvnytskyi', 'Кропивницький', 'kropivnitskiy', 'Кропивницкий')]
GEO_HUB = {'uk': {'kyiv': ('/dyzain-i-remont-kyivska-oblast', 'Київська область — усі міста'), 'ua': ('/dyzain-i-remont-ukraina', 'Дизайн і ремонт по Україні'),
                  'eu': ('/remont-i-budivnytstvo-yevropa', 'Ремонт і будівництво в Європі')},
           'ru': {'kyiv': ('/ru/dizayn-i-remont-kievskaya-oblast', 'Киевская область — все города'), 'ua': ('/ru/dizayn-i-remont-ukraina', 'Дизайн и ремонт по Украине'),
                  'eu': ('/ru/remont-i-stroitelstvo-evropa', 'Ремонт и строительство в Европе')}}
GEO = {
    'uk': {'kyiv': ('Працюємо в Києві та області', 'Ремонт, будівництво й дизайн ведемо в Києві та містах Київщини власними штатними бригадами, '
                    'а в інших областях і в Європі — за домовленістю. Окремі сторінки — про житло й логістику кожного міста:'),
           'ua': ('Працюємо в Києві, області й по Україні', 'Дизайн-проєкт робимо в Києві та області, а для інших міст — дистанційно або з виїздом; '
                  'ремонт і будівництво беремо й в обласних центрах — умови й вартість виїзду індивідуально. Сторінки міст:'),
           'hubs': ('Де будуємо', '')},
    'ru': {'kyiv': ('Работаем в Киеве и области', 'Ремонт, строительство и дизайн ведём в Киеве и городах Киевщины собственными штатными бригадами, '
                    'а в других областях и в Европе — по договорённости. Отдельные страницы — о жилье и логистике каждого города:'),
           'ua': ('Работаем в Киеве, области и по Украине', 'Дизайн-проект делаем в Киеве и области, а для других городов — дистанционно или с выездом; '
                  'ремонт и строительство берём и в областных центрах — условия и стоимость выезда индивидуально. Страницы городов:'),
           'hubs': ('Где строим', '')},
}


def geo_links(lang, kind):
    """Посилання блоку «Географія»: хаб, міста (Київщина або обласні центри), інші хаби."""
    i = 2 if lang == 'ru' else 0
    pre = '/ru/dizayn-i-remont-' if lang == 'ru' else '/dyzain-i-remont-'
    hubs = GEO_HUB[lang]
    if kind == 'hubs':  # компактний варіант (сторінки на межі бюджету HTML): лише три хаби
        return [hubs['kyiv'], hubs['ua'], hubs['eu']]
    cities = GEO_KYIV if kind == 'kyiv' else GEO_UA
    other = 'ua' if kind == 'kyiv' else 'kyiv'
    return [hubs[kind]] + [(pre + c[i], c[i + 1]) for c in cities] + [hubs[other], hubs['eu']]


def geo_html(lang, kind):
    h, intro = GEO[lang][kind]
    return (f'<!--cas:geo:{kind}--><section><div class="w txt"><h2>{e(h)}</h2>' + (f'<p>{e(intro)}</p>' if intro else '') + '<div class="rel">'
            + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in geo_links(lang, kind)) + '</div></div></section><!--/cas:geo-->\n')


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
    if p.get('hero_img'):  # перший екран з фото (rich.hero_bg): .hx — фон, текст поверх
        hx = 'hx hx-home' if p['slug'] == 'index' else 'hx'  # головні: нижчий hero без рядка довіри (Михайло 05.11.2026)
        o = [crumbs, f'<div class="{hx}">' + richsec.hero_bg(p['hero_img'], full=p['slug'] == 'index'), '<div class="w hero">']
        if p['slug'] == 'index':  # головна (9 мов): лише H1 + рядок; .btns після обробки ліду прибирає ux._light_hero (Михайло 08.11.2026 — hero без кнопок)
            o += [f'  <h1>{e(p["h1"])}</h1>'] + ([f'  <div class="price">{e(p["price"])}</div>'] if p.get('price') else []) + [_lead_p(p), '  <div class="btns">',
                  f'    <a class="btn" href="tel:+380978667755">{e(leadform._call(p["lang"])[0])}</a>', '  </div>']
            return o + ['</div></div>\n']
        o += ([f'  <p class="kick">{e(p["kicker"])}</p>'] if p.get('kicker') else []) + [f'  <h1>{e(p["h1"])}</h1>']
        o += ([f'  <div class="price">{e(p["price"])}</div>'] if p.get('price') else []) + [_lead_p(p), '  <div class="btns">',
              f'    <a class="btn main" href="{p.get("cta_href", "#zayavka")}">{e(p.get("cta") or t["cta"])}</a>',
              f'    <a class="btn" href="{btn2[0]}">{e(btn2[1])}</a>', '  </div>']
        o += (['  <div class="facts">' + ''.join(f'<div><b>{e(b)}</b><span>{e(s)}</span></div>' for b, s in p.get('facts', FACTS[p['lang']])) + '</div>']
              if p.get('facts', True) else [])
        return o + ['</div></div>\n']
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
    if p.get('cards'):  # регіональні сторінки — без типових карток (унікальний зміст, tools/site/pages/*-dyzain-i-remont-*)
        o += ['<section><div class="w">', f'  <h2>{t["inc"]}</h2>',
              '  <div class="grid">' + ''.join(f'<div class="card"><h3>{e(h)}</h3><ul>' + ''.join(f'<li>{e(i)}</li>' for i in li) + '</ul></div>' for h, li in p['cards']) + '</div>',
              '</div></section>\n']
    if p.get('places'):
        o.append(places_html(p['places']))
    for h, ps in p.get('about', []):
        o.append(f'<section><div class="w txt"><h2>{e(h)}</h2>' + ''.join(f'<p>{rich(x)}</p>' for x in ps) + '</div></section>\n')
    if p.get('packages'):
        o.append(packages_html(p['lang']))
    if p.get('budget'):
        o.append(budget_html(p['lang'], p['budget']))
    if p.get('prices'):
        o.append(prices_html(p['lang'], p['prices']))
    if p.get('gallery'):
        o += gallery_html(p['lang'], p['gallery'])
    o += (['<section><div class="w">', f'  <h2>{t["steps"]}</h2>',
          '  <ol class="steps">' + ''.join(f'<li><div><b>{e(b)}</b><span>{e(s)}</span></div></li>' for b, s in p['steps']) + '</ol>',
          '</div></section>\n'] if p.get('steps') else []) + ([guarantees_html(p['lang'], no5=p['guarantees'] == 'no5')] if p.get('guarantees') else []) + [
          '<section><div class="w">', f'  <h2>{t["faq"]}</h2>',
          '  ' + ''.join(f'<details><summary>{e(q)}</summary><p>{rich(x)}</p></details>' for q, x in p['faq']),
          '</div></section>\n'] + ([geo_html(p['lang'], p['geo'])] if p.get('geo') else []) + ([
          '<section><div class="w">', f'  <h2>{e(p["near"][0])}</h2>',
          '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['near'][1]) + '</div>',
          '</div></section>\n'] if p.get('near') else []) + ([cluster_html(p['cluster'])] if p.get('cluster') else []) + [
          '<section><div class="w">', f'  <h2>{t["rel"]}</h2>',
          '  <div class="rel">' + ''.join(f'<a href="{u}">{e(n)}</a>' for u, n in p['rel']) + '</div>',
          '</div></section>\n']
    return '\n'.join(o)


def ld(p):
    if p.get('ld_raw'):  # збережена розмітка ручної сторінки (головна, про, контакти, портфоліо): обʼєкти без "@context" — у @graph
        g = [{k: v for k, v in o.items() if k != '@context'} for o in p['ld_raw']]
        return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False, separators=(',', ':'))
    lang = p['lang']
    t, u, hl = L[lang], url(lang, p['slug']), i18n.meta(lang)['hreflang']
    home = B.rstrip('/') + t['home_url']
    page = {'@type': {'about': 'AboutPage', 'contact': 'ContactPage'}.get(p.get('kind'), 'WebPage'), '@id': u + '#page', 'url': u,
            'name': p['title'], 'inLanguage': hl, 'isPartOf': {'@type': 'WebSite', '@id': B + '#site', 'url': B, 'name': 'CAS Development'}}
    if p.get('kind') == 'about':  # сутність студії — та сама, що на головній (@id), для Knowledge Graph і відповідей ШІ
        page['mainEntity'] = business(lang, foundingDate='2016', foundingLocation={'@type': 'Place', 'name': t['city']}, areaServed=area_served(lang))
    if p.get('kind') == 'contact':  # адреса з індексом і години роботи (Google Business Profile) — для локального пошуку
        page['mainEntity'] = business(lang, areaServed=area_served(lang))
    if p.get('slug') == 'index':
        page['about'] = dict(ORG, telephone='+380978667755', sameAs=SAME_AS)
        g = [page]
    elif p.get('groups') or p.get('sections'):
        g = [{'@type': 'BreadcrumbList', 'itemListElement': [
                 {'@type': 'ListItem', 'position': 1, 'name': t['home'], 'item': home},
                 {'@type': 'ListItem', 'position': 2, 'name': p['h1'], 'item': u}]}, page]
    else:
        g = [{'@type': 'Service', 'name': p['service'], 'serviceType': p['service'], 'areaServed': p.get('area') or area_served(lang), 'provider': ORG, 'url': u},
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
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False, separators=(',', ':'))  # компактно: байти бюджету 64 КБ


def build(p):
    lang, slug = p['lang'], p['slug']
    s = leadform.QUICK_RX.sub('', open(os.path.join(ROOT, TPL[lang]), encoding='utf-8').read())  # швидку заявку ставить leadform
    s = ux.strip(s)  # іконки/згортання шаблону ставить chrome.apply() заново
    u = url(lang, slug)
    if lang not in ('uk', 'ru'):
        s = translate_tpl(i18n.html_attrs(s, lang), lang)
    if '.hero h1+p{' not in s:  # лід без ціни під H1 не має «злипатися» з заголовком
        s = s.replace('.hero p{color:var(--mu);max-width:34.2em;margin:0 0 28px}', '.hero p{color:var(--mu);max-width:34.2em;margin:0 0 28px}\n.hero h1+p{margin-top:14px}', 1)
    s = re.sub(r'<title>.*?</title>', f'<title>{e(title_tag(p["title"]))}</title>', s, count=1)
    for k, v in (('name="description"', p['description']), ('property="og:title"', p['title']),
                 ('property="og:description"', p['description']), ('property="og:url"', u)):
        s = re.sub(r'(<meta ' + k + r' content=")[^"]*', lambda m: m.group(1) + a(v), s, count=1)
    # og:image — завжди явно (шаблон remont-kukhni-kyiv.html має власну картку): "og" з JSON, картка лендингу або загальна
    og = p.get('og') or og_card(lang, slug, p['h1'], first_photo(p)) or 'img/og-cas.jpg'
    s = re.sub(r'(<meta property="og:image" content=")[^"]*', lambda m: m.group(1) + B + og.lstrip('/'), s, count=1)
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
        s = re.sub(r'(<section id="zayavka"><div class="w">\s*<h2(?: data-i="\w+")?>)[^<]*', lambda m: m.group(1) + e(p['form_h2']), s, count=1)
    s = re.sub(r'data-service="[^"]*"', f'data-service="{a(p["service"])}"', s, count=1)
    src = 'cas-develop.com/' + i18n.meta(lang)['prefix'] + ('' if slug == 'index' else slug)
    s = re.sub(r'data-source="[^"]*"', f'data-source="{src}"', s, count=1)
    if p.get('form_html'):  # власна форма замість типової (/referalna-prohrama): з data-lf="keep" — leadform.py її не переписує
        s, n = re.subn(r'<form\b[^>]*\bid="of".*?<div class="ok" id="oOk".*?</p></div>', lambda m: p['form_html'], s, count=1, flags=re.S)
        assert n == 1, f'{slug}: не знайдено form#of і #oOk у шаблоні'
    if richsec.used(p) and richsec.CSS not in p.get('assets', []):
        p.setdefault('assets', []).insert(0, richsec.CSS)
    if any(x['t'] == 'ba' for x in p.get('sections', [])):
        p.setdefault('assets', []).extend(f for f in ('assets/ba.v1.css', 'assets/ba.v1.js') if f not in p.get('assets', []))
    s = leadform.apply(s, path(lang, slug))  # форма: обовʼязковий лише телефон; швидка заявка біля першого CTA
    s = captions.apply(s, path(lang, slug))
    # шапка й футер: мова, перемикач на пару (hreflang) і посилання — з chrome.py
    if any(x['t'] == 'map' for x in p.get('sections', [])):
        s = casmap.assets(s)
    elif any(x['t'] == 'pmap' for x in p.get('sections', [])):  # карта проєктів унизу сторінки — стилі не блокують рендер
        s = casmap.assets(s, lazy=True)
    s = page_assets(s, p.get('assets', []))
    s = chrome.apply(s, path(lang, slug))
    os.makedirs(os.path.dirname(os.path.join(ROOT, path(lang, slug))), exist_ok=True)
    open(os.path.join(ROOT, path(lang, slug)), 'w', encoding='utf-8').write(s)
    return path(lang, slug)


# Open Graph-картки лендингів uk/ru: img/og/svc-[ru-]<slug>.jpg (1200×630, фото з галереї сторінки + H1, генератор tools/og/make-og.py).
# Картку робимо один раз (якщо файлу немає) — збірка детермінована; без фото лишається загальна img/og-cas.jpg.
OG_LABEL = {'uk': 'ПОСЛУГИ', 'ru': 'УСЛУГИ'}
OG_MAX = 80 * 1024
_MKOG = {}


def first_photo(p):
    items = p.get('gallery') or [i for x in p.get('sections', []) if x['t'] == 'gallery' for i in x['items']]
    return items[0][0].lstrip('/') if items else None


def og_card(lang, slug, title, photo):
    """Шлях img/og/svc-…jpg (створює файл, якщо його ще немає) або None."""
    if lang not in OG_LABEL or not photo or not os.path.exists(os.path.join(ROOT, photo)):
        return None
    rel = f'img/og/svc-{"ru-" if lang == "ru" else ""}{slug}.jpg'
    out = os.path.join(ROOT, rel)
    if not os.path.exists(out):
        if 'm' not in _MKOG:
            import importlib.util
            spec = importlib.util.spec_from_file_location('mkog', os.path.join(ROOT, 'tools/og/make-og.py'))
            m = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(m)
            except Exception as ex:  # немає шрифту/Pillow — лишаємо загальну картинку
                print('OG пропущено:', ex)
                return None
            m.MAX_BYTES = OG_MAX
            _MKOG['m'], _MKOG['ov'] = m, m.overlay()
        m = _MKOG['m']
        img = m.render({'kind': 'landing', 'slug': slug, 'title': title, 'photo': photo, 'label': OG_LABEL[lang]}, *_MKOG['ov'])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        m.save(img, m.Path(out))
        print('OG', rel)
    return rel


def og_manual(generated):
    """Ручні лендинги uk/ru (зі Service у JSON-LD) із загальною og-cas.jpg → власна OG-картка з першого фото /img/p/ і H1."""
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'ru/*.html'))):
        rel = os.path.relpath(f, ROOT)
        if rel in generated:
            continue
        s = open(f, encoding='utf-8').read()
        head = s.split('</head>')[0]
        if 'img/og-cas.jpg' not in head or 'noindex' in head or '"Service"' not in head:
            continue
        mm = re.search(r'<main\b.*?</main>', s, re.S)
        ph = re.search(r'src="/(img/p/[\w-]+?)(?:-\d+)?\.webp"', mm.group(0) if mm else '')
        h1 = re.search(r'<h1\b[^>]*>(.*?)</h1>', s, re.S)
        if not ph or not h1:
            continue
        photo = ph.group(1) + '-900.webp'
        if not os.path.exists(os.path.join(ROOT, photo)):
            continue
        title = html.unescape(re.sub(r'<[^>]+>', '', h1.group(1))).strip()
        og = og_card('ru' if rel.startswith('ru/') else 'uk', os.path.basename(rel)[:-5], title, photo)
        if og:
            n = s.replace('content="https://cas-develop.com/img/og-cas.jpg"', f'content="{B}{og}"', 1)
            if n != s:
                open(f, 'w', encoding='utf-8').write(n)
                out.append(rel)
    return out


def page_assets(s, files):
    """Власні стилі/скрипти сторінки ("assets": ["assets/x.v1.css", "assets/x.v1.js"]) — з ?v=хеш, бо /assets/* кешується назавжди.
    Ставимо перед <link rel="canonical"> (JS — defer): там їх не переставляють leadform.py і chrome.py, що дописують своє перед </head>.
    Лише файли з assets/ (перевіряє check())."""
    import hashlib
    tags = ''
    for f in files:
        v = hashlib.sha256(open(os.path.join(ROOT, f), 'rb').read()).hexdigest()[:8]
        tags += (f'<link rel="stylesheet" href="/{f}?v={v}">\n' if f.endswith('.css') else f'<script src="/{f}?v={v}" defer></script>\n')
    return s.replace('<link rel="canonical"', tags + '<link rel="canonical"', 1) if tags else s


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
    if re.search(r'osocor|осокор|osokork|aqulla', txt, re.I): errs.append('Osocor/Aqulla')
    ok = {'$30', '$350', '$550', '$250', '$600', '$1 100', '$1,100', '$50', '$2 500', '$2,500', '$500',
          '$5 000', '$5,000', '$12', '$6', '$45',
          '$850', '$900', '$1 700', '$1,700', '$18', '$400', '$4 000', '$4,000'}  # Європа: +50% до київських (Михайло 01.11.2026)  # $6/$45 — пакети дизайну (ринкова практика, Михайло делегував 27.10.2026)  # $500 — мін. замовлення Оздоби; $5 000 — поріг знижки за обсягом 3% (Михайло 25.10.2026);
    # $12 — архітектурний проєкт будинку від $12/м² за ринковою практикою (Михайло 26.10.2026, дослідження ринку)
    for m in re.findall(r'\$\s?\d[\d ,.]*\d|\$\d', txt):
        m = m.strip().rstrip(',.')
        if m not in ok and not re.fullmatch(r'\$\d{2,3}[ ,.]\d{3}', m):  # розрахунок площа × ставка
            errs.append('ціна ' + m)
    if len(p['description']) > 160: errs.append('description > 160')
    for f in p.get('assets', []):
        if not re.fullmatch(r'assets/[a-z0-9.-]+\.(css|js)', f) or not os.path.exists(os.path.join(ROOT, f)): errs.append('assets: ' + f)
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
    if not only:  # ручні сторінки: блоки «Гарантії», «Таблиця цін», «Пакети дизайну» між маркерами
        for r in sync_manual({path(p['lang'], p['slug']) for p in allp}):
            print('↻', r)
        for r in og_manual({path(p['lang'], p['slug']) for p in allp}):
            print('OG ↻', r)
    i18n.sync()  # повні hreflang-кластери і перемикач мов на всіх сторінках кластерів (у т.ч. ручних)
    import datetime
    sitemap(built, datetime.date.today().isoformat())
    sys.exit(bad)
