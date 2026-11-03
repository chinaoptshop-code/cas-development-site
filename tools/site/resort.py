#!/usr/bin/env python3
"""«Комплекс відпочинку» — інтерактивний генплан (етап G): будиночки 4/8/12 по 30/45/60 м², головний корпус/ресторан 150–300 м²,
пляж і пляж-бар, перголи, зона релаксу, басейн, тех-зона, доріжки, ландшафт. Клік/тап по обʼєкту — плавний zoom і поетапне
будівництво саме цього обʼєкта; «Назад до генплану». Панель «що скільки коштує, орієнтовно» — лише ставки CLAUDE.md × обрана площа,
решта — «за кошторисом»; CTA переносить конфігурацію у форму заявки.

  python3 tools/site/resort.py           # повна версія — база відпочинку й ресторан (усі мови кластерів), тизер — послуги й будівництво,
                                         # перемикач «Будинок / Квартира / Ландшафт / Комплекс» — над сценою на головних
  python3 tools/site/resort.py --check

Сцена — /assets/resort-plan.v1.{js,css} (SVG, без бібліотек), вантажить site-chrome.v1.js після першої прокрутки (section.bz[data-js]).
Тексти — tools/site/resort_i18n.py; назви обʼєктів і етапів — у HTML (видно без JS). UI-kit — /styleguide/#build-anim-sg.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n  # noqa: E402
from resort_i18n import T, O  # noqa: E402
e = lambda s: html.escape(s, quote=True)
JS, CSS = '/assets/resort-plan.v1.js', '/assets/resort-plan.v1.css'
RX = re.compile(r'\n?<!--rp-->.*?<!--/rp-->', re.S)
TRX = re.compile(r'\n?<!--rp:t-->.*?<!--/rp:t-->', re.S)
HRX = re.compile(r'<!--rp:tabs-->.*?<!--/rp:tabs-->', re.S)


def _cl(uk):
    return i18n.cluster_of(uk) or {}


RESORT = _cl('/baza-vidpochynku-pid-klyuch')
FULL = {}  # файл → мова
for _uk in ('/baza-vidpochynku-pid-klyuch', '/dyzain-restoranu-kafe-kyiv', '/remont-restoranu-kafe-kyiv'):
    for _l, _u in _cl(_uk).items():
        FULL[i18n.path_to_file(_u)] = _l
if 'remont-restoranu-kafe-kyiv.html' not in FULL:
    FULL['remont-restoranu-kafe-kyiv.html'] = 'uk'
TEASE = {}
for _uk in ('/services', '/budivnytstvo-budynkiv-kyiv'):
    for _l, _u in _cl(_uk).items():
        TEASE[i18n.path_to_file(_u)] = _l
HOME = {l: i18n.path_to_file(u) for l, u in _cl('/').items()}


def resort_url(lang):
    return RESORT.get(lang) or RESORT['uk']


def block(lang):
    import chrome
    t = T[lang]
    li = ''.join(f'<li data-o="{k}"><b>{e(t["o"][k])}</b>' + (f' — {e(" → ".join(t["st"][k]))}' if k in t['st'] else '') + '</li>' for k in O)
    data = json.dumps(dict(ui=t['ui'], o=t['o'], st=t['st']), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (f'\n<!--rp--><section class="bz rp" id="resort" data-rp aria-labelledby="rp-h" data-js="{JS}?v={chrome._ver(JS)}" data-css="{CSS}?v={chrome._ver(CSS)}">'
            f'<div class="w"><h2 id="rp-h">{e(t["h"])}</h2><p class="bz-p">{e(t["p"])}</p><ul class="rp-list">{li}</ul>'
            f'<p class="rp-rates">{e(t["rates"])}</p><script type="application/json" class="rp-ui">{data}</script></div></section><!--/rp-->')


def teaser(lang):
    h, p, b = T[lang]['teaser']
    return (f'\n<!--rp:t--><section class="rp-teaser"><div class="w"><h2>{e(h)}</h2><p>{e(p)}</p>'
            f'<p><a class="btn" href="{resort_url(lang)}#resort">{e(b)}</a></p></div></section><!--/rp:t-->')


def tabs(lang):
    import buildanim, landanim
    flat = _cl('/remont-pid-klyuch-kyiv').get(lang) or '/remont-pid-klyuch-kyiv'
    names = T[lang]['tabs']
    links = [('#build-anim', 1), (flat + '#build-anim', 0), (landanim.LAND.get(lang, landanim.LAND['uk']) + '#build-anim', 0), (resort_url(lang) + '#resort', 0)]
    return ('<!--rp:tabs--><nav class="la-tab" aria-label="' + e(' / '.join(names)) + '">'
            + ''.join(f'<a href="{u}"' + (' aria-current="true"' if cur else '') + f'>{e(n)}</a>' for (u, cur), n in zip(links, names))
            + __import__('waterhouse').tab_link(lang) + __import__('restaurant').tab_link(lang) + '</nav><!--/rp:tabs-->')


ANCHORS = ('<!--cas:guarantees-->', '<!--quiz-->', '<section id="zayavka"')


def apply(s, rel):
    import buildanim
    s = HRX.sub('', TRX.sub('', RX.sub('', s)))
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m else 'uk'
    if lang not in T:
        return s
    if rel in FULL:
        mh = buildanim.HOW.search(s)
        k = mh.start() if mh else next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
        if k >= 0:
            s = s[:k].rstrip('\n') + block(lang) + '\n' + s[k:]
    elif rel in TEASE:
        k = next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
        if k >= 0:
            s = s[:k].rstrip('\n') + teaser(lang) + '\n' + s[k:]
    if HOME.get(lang) == rel:  # головна: перемикач сцен над «Будинок з нуля»
        s = re.sub(r'(<section class="bz" id="build-anim"[^>]*><div class="w">)', lambda x: x.group(1) + tabs(lang), s, count=1)
    return s


def main():
    import chrome
    check = '--check' in sys.argv
    bad = []
    rels = set(FULL) | set(TEASE) | set(HOME.values())
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
        print('\n'.join(bad) if bad else 'Комплекс відпочинку: OK'); sys.exit(1 if bad else 0)
    print(f'Комплекс відпочинку: оновлено {len(bad)} з {len(rels)} сторінок')


if __name__ == '__main__':
    main()
