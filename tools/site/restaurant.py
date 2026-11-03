#!/usr/bin/env python3
"""«Ресторан з нуля» — scroll-анімація будівництва ресторану в розрізі (етап H): 14 етапів (замір і 3D-скан, коробка ряд за рядом,
вітрини, вентиляція, каналізація з жироуловлювачами, електрика кухні, підлога, зал, бар, відкрита кухня, меблі, тераса,
світло день → вечір, гості), площа 150/300/500 м², стиль (сучасний / лофт / класичний), рентген (вентиляція / каналізація / електрика),
CTA «Порахувати мій ресторан» → форма заявки. Ціна — лише «дизайн від $30/м², мін. $2 500»; ремонт, обладнання кухні, меблі — за кошторисом.

  python3 tools/site/restaurant.py           # блок на сторінках дизайну й ремонту ресторанів усіх мов, тизер — на послугах
  python3 tools/site/restaurant.py --check   # лише перевірка (код 1, якщо щось застаріло)

Сцена — /assets/restaurant-anim.v1.{js,css} (SVG, без бібліотек), вантажить site-chrome.v1.js після першої прокрутки
(section.bz[data-js]). Тексти етапів — у HTML (ol.bz-st, видно без JS), підписи — script.rs-ui; тексти — tools/site/restaurant_i18n.py.
Блок стоїть перед «Комплексом відпочинку» (resort.py), якщо він є на сторінці, інакше — перед «Як працюємо». UI-kit — /styleguide/#build-anim-sg.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n  # noqa: E402
from restaurant_i18n import T  # noqa: E402
e = lambda s: html.escape(s, quote=True)
JS, CSS = '/assets/restaurant-anim.v1.js', '/assets/restaurant-anim.v1.css'
RX = re.compile(r'\n?<!--rs-->.*?<!--/rs-->', re.S)
TRX = re.compile(r'\n?<!--rs:t-->.*?<!--/rs:t-->', re.S)
CASE = {'ru': '/ru/proekty/monpark-polnyy-proekt'}  # кейс Monpark; інші мови — українська сторінка кейсу


def _cl(uk):
    return i18n.cluster_of(uk) or {'uk': uk}


DESIGN = _cl('/dyzain-restoranu-kafe-kyiv')
PAGES = {}  # файл → мова
for _uk in ('/dyzain-restoranu-kafe-kyiv', '/remont-restoranu-kafe-kyiv'):
    for _l, _u in _cl(_uk).items():
        PAGES[i18n.path_to_file(_u)] = _l
TEASE = {i18n.path_to_file(u): l for l, u in _cl('/services').items()}


def block(lang):
    import chrome
    t = T[lang]
    li = ''.join(f'<li><div><b>{e(a)}</b><span>{e(b)}</span></div></li>' for a, b in t['st'])
    ui = json.dumps(t['ui'], ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (f'\n<!--rs--><section class="bz rs" id="restaurant-anim" data-rs aria-labelledby="rs-h" data-js="{JS}?v={chrome._ver(JS)}" data-css="{CSS}?v={chrome._ver(CSS)}">'
            f'<div class="w"><h2 id="rs-h">{e(t["h"])}</h2><p class="bz-p">{e(t["p"])}</p><ol class="steps bz-st">{li}</ol>'
            f'<p class="rs-price">{e(t["price"])} {e(t["rest"])}</p>'
            f'<p class="rs-case"><a href="{CASE.get(lang, "/proekty/monpark")}">{e(t["case"])}</a></p>'
            f'<script type="application/json" class="rs-ui">{ui}</script></div></section><!--/rs-->')


def teaser(lang):
    h, p, b = T[lang]['teaser']
    u = DESIGN.get(lang) or DESIGN['uk']
    return (f'\n<!--rs:t--><section class="rp-teaser rs-teaser"><div class="w"><h2>{e(h)}</h2><p>{e(p)}</p>'
            f'<p><a class="btn" href="{u}#restaurant-anim">{e(b)}</a></p></div></section><!--/rs:t-->')


ANCHORS = ('<!--cas:guarantees-->', '<!--quiz-->', '<section id="zayavka"')


def apply(s, rel):
    import buildanim
    s = TRX.sub('', RX.sub('', s))
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m else 'uk'
    if lang not in T:
        return s
    if rel in PAGES:
        add, k = block(lang), s.find('<!--rp-->')  # перед «Комплексом відпочинку» — стабільний порядок з resort.py
        if k < 0:
            mh = buildanim.HOW.search(s)
            k = mh.start() if mh else next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
    elif rel in TEASE:
        add, k = teaser(lang), s.find('<!--rp:t-->')
        if k < 0:
            k = next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
    else:
        return s
    if k >= 0:
        s = s[:k].rstrip('\n') + add + '\n' + s[k:]
    return s


def main():
    import chrome
    check = '--check' in sys.argv
    bad = []
    rels = set(PAGES) | set(TEASE)
    for rel in sorted(rels):
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel)
        if n != s:
            m = re.search(r'<html[^>]*\blang="([a-z]{2})', n)
            n = chrome.apply(chrome.versions(chrome.nbsp_prices(n, m.group(1) if m else None)), rel)
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Ресторан з нуля: OK'); sys.exit(1 if bad else 0)
    print(f'Ресторан з нуля: оновлено {len(bad)} з {len(rels)} сторінок')


if __name__ == '__main__':
    main()
