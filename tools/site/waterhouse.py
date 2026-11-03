#!/usr/bin/env python3
"""«Будинок на воді» — scroll-анімація (етап I): 12 етапів (промір глибин, палі або понтони, обвʼязка, настил, місток, каркас,
покрівля, мережі з берега — рентген, фасад і вікна, тераса над водою, вечір з відблисками, здача), площа 60/100/150 м²,
основа (палі / понтони), рівень (коробка / під ключ) → «від $…» лише за ставками CLAUDE.md ($600 і $1 100 за м²); палі, понтони
й мережі — за кошторисом. CTA переносить конфігурацію у форму заявки.

  python3 tools/site/waterhouse.py           # повна сцена — сторінки бази відпочинку всіх мов (перед «Комплексом відпочинку»)
  python3 tools/site/waterhouse.py --check   # лише перевірка (код 1, якщо щось застаріло)

Посилання «Будинок на воді» в перемикачах сцен (будівництво — landanim.tab(), головні — resort.tabs()) дає tab_link().
Сцена — /assets/water-house.v1.{js,css} (SVG, без бібліотек), вантажить site-chrome.v1.js після першої прокрутки (section.bz[data-js]).
Тексти — tools/site/waterhouse_i18n.py; етапи — у HTML (ol.bz-st, видно без JS). UI-kit — /styleguide/#build-anim-sg.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n  # noqa: E402
from waterhouse_i18n import T  # noqa: E402
e = lambda s: html.escape(s, quote=True)
JS, CSS = '/assets/water-house.v1.js', '/assets/water-house.v1.css'
RX = re.compile(r'\n?<!--wh-->.*?<!--/wh-->', re.S)
RESORT = i18n.cluster_of('/baza-vidpochynku-pid-klyuch') or {'uk': '/baza-vidpochynku-pid-klyuch'}
PAGES = {i18n.path_to_file(u): l for l, u in RESORT.items()}


def url(lang):
    return (RESORT.get(lang) or RESORT['uk']) + '#water-house'


def tab_link(lang, cur=False):
    """Посилання для перемикачів сцен (nav.la-tab)."""
    t = T.get(lang, T['uk'])['tab']
    return f'<a href="{url(lang)}"' + (' aria-current="page"' if cur else '') + f'>{e(t)}</a>'


def block(lang):
    import chrome
    t = T[lang]
    li = ''.join(f'<li><div><b>{e(a)}</b><span>{e(b)}</span></div></li>' for a, b in t['st'])
    ui = json.dumps(t['ui'], ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (f'\n<!--wh--><section class="bz wh" id="water-house" data-wh aria-labelledby="wh-h" data-js="{JS}?v={chrome._ver(JS)}" data-css="{CSS}?v={chrome._ver(CSS)}">'
            f'<div class="w"><h2 id="wh-h">{e(t["h"])}</h2><p class="bz-p">{e(t["p"])}</p><ol class="steps bz-st">{li}</ol>'
            f'<p class="wh-price">{e(t["price"])}</p>'
            f'<script type="application/json" class="wh-ui">{ui}</script></div></section><!--/wh-->')


ANCHORS = ('<!--cas:guarantees-->', '<!--quiz-->', '<section id="zayavka"')


def apply(s, rel):
    import buildanim
    s = RX.sub('', s)
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m else 'uk'
    if rel not in PAGES or lang not in T:
        return s
    k = s.find('<!--rp-->')  # поруч із «Комплексом відпочинку», перед ним — стабільний порядок з resort.py
    if k < 0:
        mh = buildanim.HOW.search(s)
        k = mh.start() if mh else next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
    if k >= 0:
        s = s[:k].rstrip('\n') + block(lang) + '\n' + s[k:]
    return s


def main():
    import chrome
    check = '--check' in sys.argv
    bad = []
    for rel in sorted(PAGES):
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
        print('\n'.join(bad) if bad else 'Будинок на воді: OK'); sys.exit(1 if bad else 0)
    print(f'Будинок на воді: оновлено {len(bad)} з {len(PAGES)} сторінок')


if __name__ == '__main__':
    main()
