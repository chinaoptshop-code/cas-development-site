#!/usr/bin/env python3
"""«Ландшафт з нуля» — scroll-анімація облаштування ділянки (етап E): 16 етапів, конфігуратор (6/10/15/25 соток,
стиль саду), рентген (дренаж, полив, кабелі), 4 «пироги» шарів, день → вечір, CTA «Порахувати мій ландшафт» → форма заявки.

  python3 tools/site/landanim.py           # поставити/оновити блок на сторінках ландшафтного дизайну всіх мов і перемикач на будівництві
  python3 tools/site/landanim.py --check   # лише перевірка (код 1, якщо щось застаріло)

Сцена — /assets/land-anim.v1.{js,css} (SVG, без бібліотек), вантажить її site-chrome.v1.js після першої прокрутки
(section.bz[data-js], як «Будинок з нуля»). Тексти етапів і пирогів — у HTML (список етапів і <details> з пирогами видно без JS),
скрипт бере їх із DOM; підписи кнопок — словник у скрипті. Ціна — лише «ландшафтний дизайн від $50/сотку» (CLAUDE.md).
Фахівці — з CLAUDE.md: без імен (Михайло 08.11.2026): «наш геодезист», «наш фахівець». Строків не обіцяємо. UI-kit — /styleguide/#build-anim-sg.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
e = lambda s: html.escape(s, quote=True)
RX = re.compile(r'\n?<!--la-->.*?<!--/la-->', re.S)
TAB_RX = re.compile(r'<!--la:tab-->.*?<!--/la:tab-->', re.S)
JS, CSS = '/assets/land-anim.v1.js', '/assets/land-anim.v1.css'

LAND = {'uk': '/landshaftnyi-dyzain-kyiv', 'ru': '/ru/landshaftnyy-dizayn-kiev', 'en': '/en/landscape-design', 'es': '/es/paisajismo',
        'zh': '/zh/landscape-design', 'pl': '/pl/projektowanie-ogrodow', 'de': '/de/gartengestaltung', 'fr': '/fr/architecture-paysagere', 'ar': '/ar/landscape-design'}

T = {
 'uk': dict(h='Ландшафт з нуля — 16 етапів облаштування ділянки', p='Прокручуйте — і ділянка перетвориться на сад: від геодезії до вечірнього світла. Оберіть площу й стиль, увімкніть рентген, щоб побачити дренаж, полив і кабелі під газоном.',
            tab=('Будинок', 'Ландшафт'), pies='Пироги шарів',
            st=[('Геодезія', 'Наш геодезист знімає рельєф і межі ділянки, виносить осі доріжок і тераси, ставить репери.'),
                ('Зйомка з дрона', 'Михайло знімає ділянку з дрона: ортофото й висоти — основа для проєкту на реальній ділянці.'),
                ('Проєкт на ділянці', 'Розмічаємо зони за проєктом: доріжки, терасу, газон, квітники й місця дерев — до першої лопати.'),
                ('Рельєф', 'Вирівнюємо ділянку й задаємо ухили від будинку, щоб вода йшла туди, куди потрібно.'),
                ('Дренаж', 'Траншеї з геотекстилем, щебінь і перфорована труба з ухилом до колодязя: зайва вода не стоїть на газоні.'),
                ('Автополив', 'Магістраль від насоса, роторні форсунки для газону й крапельні лінії для квітників і кущів.'),
                ('Кабелі освітлення', 'Кабель у гофрі на глибині, виводи під світильники вздовж доріжок, біля тераси й дерев.'),
                ('Бордюри', 'Бордюри фіксують межі доріжок і квітників: бруківка не розповзається, газон не заходить у клумби.'),
                ('Доріжки', 'Подушка зі щебеню з ущільненням, геотекстиль, піщано-цементна постіль — і бруківка камінь за каменем, з перевʼязкою швів.'),
                ('Тераса', 'Лаги на опорах з ухилом і дошка ДПК або дерева з рівними зазорами для вентиляції.'),
                ('Ґрунт і рулонний газон', 'Родючий ґрунт, прикочування — і газон смугами вразбіг, шви щільно один до одного.'),
                ('Дерева', 'Посадкова яма з дренажем і родючим ґрунтом, кріплення, приствольне коло з мульчею — дерево приживається.'),
                ('Кущі', 'Групи кущів і живоплоти за планом посадок, з крапельним поливом під кожен кущ.'),
                ('Квітники', 'Шар дренажу, родючий ґрунт, багаторічники за схемою цвітіння і мульча з кори зверху.'),
                ('Зона відпочинку', 'Вогнище або альтанка на підготовленій основі, лавки й світло — місце, куди хочеться вийти ввечері.'),
                ('Світло й здача', 'Вечірнє світло вмикається за сценаріями; здаємо сад з актом і показуємо, як керувати поливом і світлом.')],
            pie=dict(path=('Пиріг доріжки', [('Бруківка або камінь', '60–80 мм', 'Укладання з перевʼязкою швів, шви заповнені піском'), ('Піщано-цементна постіль', '30–50 мм', 'Вирівнює й тримає кожен камінь'),
                                             ('Щебінь', '150–200 мм', 'Несуча подушка, ущільнена шарами'), ('Геотекстиль', '—', 'Не дає щебеню змішатися з ґрунтом'), ('Ущільнений ґрунт', '—', 'Основа з ухилом для стоку води')]),
                     lawn=('Пиріг газону з дренажем', [('Рулонний газон', '20–30 мм', 'Смугами вразбіг, шви щільно'), ('Родючий ґрунт', '100–150 мм', 'Прикочений, без грудок'),
                                                      ('Пісок', '50–100 мм', 'Вирівнює й пропускає воду'), ('Дренажний щебінь з трубою', '100–200 мм', 'Перфорована труба з ухилом до колодязя'), ('Геотекстиль', '—', 'Обгортає дренаж, щоб не замулився')]),
                     terrace=('Пиріг тераси', [('Дошка ДПК або дерево', '20–28 мм', 'Зазори для вентиляції й стоку'), ('Лаги', '40×60 мм', 'Крок за інструкцією дошки'),
                                               ('Регульовані опори', '—', 'Ухил і рівень без бетонування всього майданчика'), ('Щебінь', '100 мм', 'Тверда дренуюча основа'), ('Геотекстиль', '—', 'Проти бурʼянів і просідання')]),
                     bed=('Пиріг квітника', [('Мульча з кори', '50–70 мм', 'Тримає вологу, стримує бурʼяни'), ('Родючий ґрунт', '250–400 мм', 'Під коріння багаторічників'),
                                             ('Дренаж', '50–100 мм', 'Щебінь або керамзит, якщо ґрунт важкий'), ('Бордюр', '—', 'Тримає межу клумби й газону')])),
            ui=dict(sot='Площа', unit='соток', style='Стиль саду', styles=['Сучасний', 'Природний', 'Регулярний'], xray='Рентген', xr=['Дренаж', 'Полив', 'Кабелі'],
                    prev='Попередній етап', next='Наступний етап', of='з', price='Ландшафтний дизайн — від $50/сотку', est='для {n} соток — від ${v}',
                    calc='Порахувати мій ландшафт', msg='Ландшафт: {n} соток, стиль — {s}. Хочу кошторис.', svc='Ландшафтний дизайн (конфігуратор)', play='Переглянути всі етапи')),
 'ru': dict(h='Ландшафт с нуля — 16 этапов благоустройства участка', p='Прокручивайте — и участок превратится в сад: от геодезии до вечернего света. Выберите площадь и стиль, включите рентген, чтобы увидеть дренаж, полив и кабели под газоном.',
            tab=('Дом', 'Ландшафт'), pies='Пироги слоёв',
            st=[('Геодезия', 'Наш геодезист снимает рельеф и границы участка, выносит оси дорожек и террасы, ставит реперы.'),
                ('Съёмка с дрона', 'Михаил снимает участок с дрона: ортофото и высоты — основа для проекта на реальном участке.'),
                ('Проект на участке', 'Размечаем зоны по проекту: дорожки, террасу, газон, цветники и места деревьев — до первой лопаты.'),
                ('Рельеф', 'Выравниваем участок и задаём уклоны от дома, чтобы вода уходила туда, куда нужно.'),
                ('Дренаж', 'Траншеи с геотекстилем, щебень и перфорированная труба с уклоном к колодцу: лишняя вода не стоит на газоне.'),
                ('Автополив', 'Магистраль от насоса, роторные форсунки для газона и капельные линии для цветников и кустов.'),
                ('Кабели освещения', 'Кабель в гофре на глубине, выводы под светильники вдоль дорожек, у террасы и деревьев.'),
                ('Бордюры', 'Бордюры фиксируют границы дорожек и цветников: брусчатка не расползается, газон не заходит в клумбы.'),
                ('Дорожки', 'Подушка из щебня с уплотнением, геотекстиль, песчано-цементная постель — и брусчатка камень за камнем, с перевязкой швов.'),
                ('Терраса', 'Лаги на опорах с уклоном и доска ДПК или дерево с ровными зазорами для вентиляции.'),
                ('Грунт и рулонный газон', 'Плодородный грунт, прикатка — и газон полосами вразбежку, швы плотно друг к другу.'),
                ('Деревья', 'Посадочная яма с дренажем и плодородным грунтом, крепление, приствольный круг с мульчей — дерево приживается.'),
                ('Кустарники', 'Группы кустов и живые изгороди по плану посадок, с капельным поливом под каждый куст.'),
                ('Цветники', 'Слой дренажа, плодородный грунт, многолетники по схеме цветения и мульча из коры сверху.'),
                ('Зона отдыха', 'Очаг или беседка на подготовленном основании, скамьи и свет — место, куда хочется выйти вечером.'),
                ('Свет и сдача', 'Вечерний свет включается по сценариям; сдаём сад с актом и показываем, как управлять поливом и светом.')],
            pie=dict(path=('Пирог дорожки', [('Брусчатка или камень', '60–80 мм', 'Укладка с перевязкой швов, швы заполнены песком'), ('Песчано-цементная постель', '30–50 мм', 'Выравнивает и держит каждый камень'),
                                             ('Щебень', '150–200 мм', 'Несущая подушка, уплотнённая слоями'), ('Геотекстиль', '—', 'Не даёт щебню смешаться с грунтом'), ('Уплотнённый грунт', '—', 'Основание с уклоном для стока воды')]),
                     lawn=('Пирог газона с дренажем', [('Рулонный газон', '20–30 мм', 'Полосами вразбежку, швы плотно'), ('Плодородный грунт', '100–150 мм', 'Прикатан, без комьев'),
                                                      ('Песок', '50–100 мм', 'Выравнивает и пропускает воду'), ('Дренажный щебень с трубой', '100–200 мм', 'Перфорированная труба с уклоном к колодцу'), ('Геотекстиль', '—', 'Оборачивает дренаж, чтобы не заилился')]),
                     terrace=('Пирог террасы', [('Доска ДПК или дерево', '20–28 мм', 'Зазоры для вентиляции и стока'), ('Лаги', '40×60 мм', 'Шаг по инструкции доски'),
                                               ('Регулируемые опоры', '—', 'Уклон и уровень без бетонирования всей площадки'), ('Щебень', '100 мм', 'Твёрдое дренирующее основание'), ('Геотекстиль', '—', 'Против сорняков и проседания')]),
                     bed=('Пирог цветника', [('Мульча из коры', '50–70 мм', 'Держит влагу, сдерживает сорняки'), ('Плодородный грунт', '250–400 мм', 'Под корни многолетников'),
                                             ('Дренаж', '50–100 мм', 'Щебень или керамзит, если грунт тяжёлый'), ('Бордюр', '—', 'Держит границу клумбы и газона')])),
            ui=dict(sot='Площадь', unit='соток', style='Стиль сада', styles=['Современный', 'Природный', 'Регулярный'], xray='Рентген', xr=['Дренаж', 'Полив', 'Кабели'],
                    prev='Предыдущий этап', next='Следующий этап', of='из', price='Ландшафтный дизайн — от $50/сотку', est='для {n} соток — от ${v}',
                    calc='Посчитать мой ландшафт', msg='Ландшафт: {n} соток, стиль — {s}. Хочу смету.', svc='Ландшафтный дизайн (конфигуратор)', play='Посмотреть все этапы')),
 'en': dict(h='Landscape from scratch — 16 stages of a garden', p='Scroll and the plot turns into a garden: from the survey to evening light. Choose the size and style, switch on the X-ray to see drainage, irrigation and cables under the lawn.',
            tab=('House', 'Landscape'), pies='Layer build-ups',
            st=[('Land survey', 'Our surveyor maps the terrain and boundaries, sets out the paths and terrace and fixes benchmarks.'),
                ('Drone survey', 'Mykhailo films the plot from a drone: an orthophoto and heights become the base for the design on the real site.'),
                ('Design on the plot', 'We mark out the zones from the design — paths, terrace, lawn, beds and tree positions — before the first spade.'),
                ('Grading', 'We level the plot and set falls away from the house so water goes where it should.'),
                ('Drainage', 'Trenches lined with geotextile, gravel and a perforated pipe falling to a soakaway: no standing water on the lawn.'),
                ('Irrigation', 'A main line from the pump, rotor sprinklers for the lawn and drip lines for beds and shrubs.'),
                ('Lighting cables', 'Cable in conduit at depth, with outlets for lights along the paths, by the terrace and the trees.'),
                ('Edging', 'Edging fixes the borders of paths and beds: pavers stay put and the lawn stays out of the flowers.'),
                ('Paths', 'A compacted gravel base, geotextile, a sand-cement bed — then pavers laid stone by stone with staggered joints.'),
                ('Terrace', 'Joists on adjustable pedestals with a fall, then composite or timber decking with even ventilation gaps.'),
                ('Soil and roll-out lawn', 'Topsoil, rolling — then turf laid in staggered strips with tight seams.'),
                ('Trees', 'A planting pit with drainage and good soil, staking and a mulched tree circle — the tree takes root.'),
                ('Shrubs', 'Shrub groups and hedges to the planting plan, with a drip line to every shrub.'),
                ('Flower beds', 'A drainage layer, fertile soil, perennials to a flowering plan and bark mulch on top.'),
                ('Relaxation area', 'A fire pit or gazebo on a prepared base, benches and light — a place you want to go out to in the evening.'),
                ('Lighting and handover', 'Evening light switches on in scenes; we hand over the garden with a certificate and show how to run irrigation and lights.')],
            pie=dict(path=('Path build-up', [('Pavers or stone', '60–80 mm', 'Laid with staggered joints, joints filled with sand'), ('Sand-cement bed', '30–50 mm', 'Levels and holds every stone'),
                                             ('Crushed stone', '150–200 mm', 'Load-bearing base compacted in layers'), ('Geotextile', '—', 'Keeps the gravel out of the soil'), ('Compacted subgrade', '—', 'Base with a fall for run-off')]),
                     lawn=('Lawn with drainage', [('Roll-out turf', '20–30 mm', 'Staggered strips, tight seams'), ('Topsoil', '100–150 mm', 'Rolled, no clods'),
                                                  ('Sand', '50–100 mm', 'Levels and lets water through'), ('Drainage gravel with pipe', '100–200 mm', 'Perforated pipe falling to a soakaway'), ('Geotextile', '—', 'Wraps the drain so it does not silt up')]),
                     terrace=('Terrace build-up', [('Composite or timber decking', '20–28 mm', 'Gaps for ventilation and run-off'), ('Joists', '40×60 mm', 'Spacing per the board maker'),
                                                   ('Adjustable pedestals', '—', 'Fall and level without concreting the whole area'), ('Crushed stone', '100 mm', 'Firm free-draining base'), ('Geotextile', '—', 'Against weeds and settlement')]),
                     bed=('Flower bed build-up', [('Bark mulch', '50–70 mm', 'Holds moisture, keeps weeds down'), ('Fertile soil', '250–400 mm', 'For perennial roots'),
                                                  ('Drainage', '50–100 mm', 'Gravel or expanded clay on heavy soil'), ('Edging', '—', 'Keeps the line between bed and lawn')])),
            ui=dict(sot='Plot size', unit='ares (100 m²)', style='Garden style', styles=['Modern', 'Natural', 'Formal'], xray='X-ray', xr=['Drainage', 'Irrigation', 'Cables'],
                    prev='Previous stage', next='Next stage', of='of', price='Landscape design — from $50 per are (100 m²)', est='for {n} ares — from ${v}',
                    calc='Estimate my landscape', msg='Landscape: {n} ares, style — {s}. I would like an estimate.', svc='Landscape design (configurator)', play='Show all stages')),
}
# es, zh, pl, de, fr, ar — tools/site/landanim_i18n.py (той самий формат)
from landanim_i18n import T as _T2  # noqa: E402
T.update(_T2)
SOT = (6, 10, 15, 25)
PIE_KEYS = ('path', 'lawn', 'terrace', 'bed')
PAGES = {}  # файл → мова (сторінки ландшафтного дизайну)
for _l, _u in LAND.items():
    PAGES[(_u.lstrip('/') + '.html')] = _l


def block(lang):
    t = T[lang]
    li = ''.join(f'<li><div><b>{e(a)}</b><span>{e(b)}</span></div></li>' for a, b in t['st'])
    pies = ''.join(f'<details class="la-pie" data-pie="{k}"><summary>{e(t["pie"][k][0])}</summary><ol>'
                   + ''.join(f'<li><b>{e(a)}</b> <span>{e(b)}</span> — {e(c)}</li>' for a, b, c in t['pie'][k][1]) + '</ol></details>' for k in PIE_KEYS)
    import json
    ui = json.dumps(t['ui'], ensure_ascii=False, separators=(',', ':'))
    import chrome
    return (f'\n<!--la--><section class="bz la" id="build-anim" data-la aria-labelledby="la-h" data-js="{JS}?v={chrome._ver(JS)}" data-css="{CSS}?v={chrome._ver(CSS)}">'
            f'<div class="w"><h2 id="la-h">{e(t["h"])}</h2><p class="bz-p">{e(t["p"])}</p>'
            f'<ol class="steps bz-st">{li}</ol>'
            f'<div class="la-pies"><p class="la-pies-h">{e(t["pies"])}</p>{pies}</div>'
            f'<p class="la-price">{e(t["ui"]["price"])}</p>'
            f'<script type="application/json" class="la-ui">{ui.replace("</", "<\\/")}</script>'
            f'</div></section><!--/la-->')


def tab(lang, active):
    """Перемикач «Будинок / Ландшафт / Будинок на воді» над сценою на сторінці будівництва (посилання на сторінку ландшафту зі сценою)."""
    import buildanim
    t = T[lang]['tab']
    return (f'<!--la:tab--><nav class="la-tab" aria-label="{e(t[0])} / {e(t[1])}"><a href="{buildanim.BUILD[lang]}#build-anim"'
            + (' aria-current="page"' if active == 'house' else '') + f'>{e(t[0])}</a><a href="{LAND[lang]}#build-anim"'
            + (' aria-current="page"' if active == 'land' else '') + f'>{e(t[1])}</a>' + __import__('waterhouse').tab_link(lang) + '</nav><!--/la:tab-->')


ANCHORS = ('<!--cas:guarantees-->', '<!--quiz-->', '<section id="zayavka"')


def apply(s, rel):
    s = TAB_RX.sub('', RX.sub('', s))
    import buildanim
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m else 'uk'
    if rel in PAGES and lang in T:
        mh = buildanim.HOW.search(s)
        k = mh.start() if mh else next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
        if k >= 0:
            b = block(lang).replace('<div class="w"><h2 id="la-h">', '<div class="w">' + tab(lang, 'land') + '<h2 id="la-h">', 1)
            s = s[:k].rstrip('\n') + b + '\n' + s[k:]
    elif lang in T and buildanim.BUILD.get(lang, '').lstrip('/') + '.html' == rel and '<section class="bz" id="build-anim"' in s:
        s = re.sub(r'(<section class="bz" id="build-anim"[^>]*><div class="w">)', lambda x: x.group(1) + tab(lang, 'house'), s, count=1)
    return s


def main():
    import chrome
    check = '--check' in sys.argv
    bad = []
    rels = set(PAGES) | {b.lstrip('/') + '.html' for b in __import__('buildanim').BUILD.values()}
    for rel in sorted(rels):
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel)
        if n != s:
            m = re.search(r'<html[^>]*\blang="([a-z]{2})', n)
            n = chrome.apply(chrome.versions(chrome.nbsp_prices(n, m.group(1) if m else None)), rel)  # як після chrome.py (іконки, згортання)
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Ландшафт з нуля: OK'); sys.exit(1 if bad else 0)
    print(f'Ландшафт з нуля: оновлено {len(bad)} з {len(rels)} сторінок')


if __name__ == '__main__':
    main()
