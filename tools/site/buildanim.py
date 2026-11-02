#!/usr/bin/env python3
"""«Будинок з нуля» v2 / «Ремонт з нуля» v3 — scroll-анімація технології будівництва й ремонту (UI-kit /styleguide/#build-anim-sg).

  python3 tools/site/buildanim.py            # поставити/оновити блок на сторінках PAGES і JSON для скрипта (ідемпотентно)
  python3 tools/site/buildanim.py --check    # лише перевірка (код 1, якщо щось не оновлено)

Тексти етапів, технологій стін і «пирогів» шарів — tools/site/buildanim_data.py (єдине джерело). Цей скрипт робить:
1) блок між <!--ba--> і <!--/ba-->: <section class="bz" id="build-anim"> зі справжнім текстом етапів стартової технології (<ol class="steps">,
   SEO й читачі екрана; без JS це звичайний список «Етапи» з UI-kit) + факти-лічильники + слот швидкої заявки .lq-slot data-form="quick-build-anim"
   (спільний /assets/lead-form.v1.js → data-source «<сторінка>#build-anim»);
2) /assets/build-anim.v1.<мова>.<сцена>.json — технології, етапи й пироги сцени для скрипта; їхні версії (?v=) — у рядку VER скрипта assets/build-anim.v1.js.
Скрипт (і CSS) вантажить site-chrome.v1.js після першої прокрутки; за ~3 екрани до блоку скрипт бере JSON і малює ізометричну SVG-сцену кодом
(без картинок і бібліотек) і веде її за прокруткою; prefers-reduced-motion — статичні кадри зі степером.
Сцени: house — будинок (19 етапів для кожної технології: block / brick / frame / brus), flat — ремонт квартири ≈86 м² (19 етапів; data-bz-v="old" —
старт із варіанта «Вторинка з демонтажем», інакше «Новобудова з нуля»; рентген мереж); data-bz-c — компактна версія (головна, перемикач «Будинок / Квартира»).

Бюджет лендингу 64 КБ (tools/ui/ui.py): повний текст — лише із запасом RESERVE; далі tier 1 — лише назви етапів, tier 2 — ще й без вступу/команди,
tier 3 — без списку (список будує скрипт із JSON). Не вміщується й так — блок не ставимо (скрипт друкує, де саме).
На ручних сторінках будівництва (budivnytstvo-budynkiv-kyiv, ru/stroitelstvo-domov-kiev) блок замінив розділ «Як працюємо» (01.11.2026, бюджет 64 КБ).
Факти — лише з CLAUDE.md (команда з /about, гарантія 36 міс., фотозвіти раз на 1–2 тижні, 150+ проєктів, 10+ років), без цін і строків.
Генератори (landing.py) блоку не знають: build-all.sh запускає цей скрипт після них, перед chrome.py.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'ui'))
import ui  # noqa: E402  бюджети сторінок (BUDGET, kind)

RESERVE = 1024        # запас байтів після вставки повного тексту, інакше — лише назви етапів

# сторінка: (сцена, компактна) — сторінки будівництва, ремонту квартир і головні
PAGES = {
    'budivnytstvo-budynkiv-kyiv.html': ('house', 0),
    'vartist-budivnytstva-budynku-kyiv.html': ('house', 0),
    'karkasnyi-budynok-pid-kliuch-kyiv.html': ('house', 0),
    'modulnyi-budynok-kyiv.html': ('house', 0),
    'budynok-z-brusa-kyiv.html': ('house', 0),
    'budynok-pid-kliuch-koncha-zaspa.html': ('house', 0),
    'ru/stroitelstvo-domov-kiev.html': ('house', 0),
    'ru/karkasnyy-dom-pod-klyuch-kiev.html': ('house', 0),
    'ru/modulnyy-dom-kiev.html': ('house', 0),
    'ru/dom-iz-brusa-kiev.html': ('house', 0),
    'en/house-construction.html': ('house', 0),
    'remont-kvartyr-kyiv.html': ('flat', 0),
    'remont-pid-klyuch-kyiv.html': ('flat', 0),
    'kapitalnyi-remont-kvartyry-kyiv.html': ('flat', 0),
    'remont-novobudovy-kyiv.html': ('flat', 0),
    'vartist-remontu-kvartyry-kyiv.html': ('flat', 0),
    'ru/remont-kvartir-kiev.html': ('flat', 0),
    'ru/remont-pod-klyuch-kiev.html': ('flat', 0),
    'ru/stoimost-remonta-kvartiry-kiev.html': ('flat', 0),
    'ru/kapitalnyy-remont-kvartiry-kiev.html': ('flat', 0),
    'en/turnkey-renovation.html': ('flat', 0),
    'index.html': ('house', 1),
    'ru/index.html': ('house', 1),
    'en/index.html': ('house', 1),
}

# стартовий матеріал стін у конфігураторі сцени «будинок» (block — газоблок за замовчуванням; brick, frame, brus)
MAT = {'karkasnyi-budynok-pid-kliuch-kyiv.html': 'frame', 'ru/karkasnyy-dom-pod-klyuch-kiev.html': 'frame',
       'modulnyi-budynok-kyiv.html': 'frame', 'ru/modulnyy-dom-kiev.html': 'frame',
       'budynok-z-brusa-kyiv.html': 'brus', 'ru/dom-iz-brusa-kiev.html': 'brus'}
# стартовий варіант сцени «квартира»: вторинка з демонтажем — на сторінках капітального ремонту, інакше новобудова з нуля
# стартова конфігурація будинку (тип, стиль, площа), якщо відрізняється від BD.HOUSE_DEF: модульний — одноповерховий мінімалізм
CFG = {'modulnyi-budynok-kyiv.html': dict(t='one', s='minimal', a=80), 'ru/modulnyy-dom-kiev.html': dict(t='one', s='minimal', a=80)}
VAR = {'kapitalnyi-remont-kvartyry-kyiv.html': 'old', 'ru/kapitalnyy-remont-kvartiry-kiev.html': 'old'}
ABOUT = {'uk': '/about', 'ru': '/ru/o-nas', 'en': '/en/about'}
BUILD = {'uk': '/budivnytstvo-budynkiv-kyiv', 'ru': '/ru/stroitelstvo-domov-kiev', 'en': '/en/house-construction'}

# тексти етапів, матеріалів і «пирогів» шарів — tools/site/buildanim_data.py (єдине джерело для HTML і JSON скрипта)
import buildanim_data as BD  # noqa: E402
FACTS = {'uk': [('150', '150+', 'проєктів з 2016'), ('10', '10+', 'років досвіду'), ('36', '36 міс.', 'гарантія')],
         'ru': [('150', '150+', 'проектов с 2016'), ('10', '10+', 'лет опыта'), ('36', '36 мес.', 'гарантия')],
         'en': [('150', '150+', 'projects since 2016'), ('10', '10+', 'years of experience'), ('36', '36 mo.', 'warranty')]}
JSON_OUT = 'assets/build-anim.v1.{}.{}.json'  # дані для скрипта: окремо мова × сцена (house / flat) — сторінка тягне лише свою сцену (бюджет ≤ 60 КБ gzip)
SCENES = ('house', 'flat')


def stages(lang, scene, mat='', var='new', cfg=None):
    t = BD.T[lang][scene]
    if scene == 'flat':  # варіант квартири: тексти з суфіксом _n (новобудова) / _o (вторинка), якщо відрізняються
        suf = '_n' if var == 'new' else '_o'
        return [t['st'].get(k + suf, t['st'][k]) for k in BD.FLAT]
    c = dict(BD.HOUSE_DEF, **(cfg or {}))  # будинок: тексти етапів — з урахуванням конфігурації (тип, стиль), як у скрипті
    tags = BD.house_tags(mat or 'block', c['t'], c['s'])
    sto = BD.T[lang].get('sto', {})

    def pick(k):
        for g in tags:
            if k in sto.get(g, {}):
                return sto[g][k]
        return t['st'][k]
    return [pick(k) for k in BD.MATS[mat or 'block']]


def data_json(lang, scene):
    """Дані однієї сцени: спільні ui, cta/svc + етапи, пироги й параметри цієї сцени (головна дотягує другу сцену при перемиканні)."""
    import json
    t = BD.T[lang]
    used = set(v for v in BD.PIE_AT['flat'].values()) if scene == 'flat' else set(k for k in t['pie'] if not k.startswith('f_'))
    pie = {k: [v[0], BD.PIE_O[k], [list(x) for x in v[1]]] for k, v in t['pie'].items() if k in used}
    d = dict(ui=t['ui'], pieAt={scene: BD.PIE_AT[scene]}, pie=pie, st={scene: {k: list(v) for k, v in t[scene]['st'].items()}},
             cta={k: t[k]['cta'] for k in SCENES}, svc={'house': t['house']['more'], 'flat': t['flat']['svc']})
    if scene == 'flat':
        d.update(flat=BD.FLAT, fv=BD.FLAT_V)
    else:
        d.update(mats=BD.MATS, hs=BD.HOUSE_STY, hdef=BD.HOUSE_DEF, sto=t.get('sto', {}))
    return json.dumps(d, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'


RX = re.compile(r'\n?<!--ba-->.*?<!--/ba-->', re.S)
e = lambda s: html.escape(s, quote=True)


def block(lang, scene, compact, tier=0, mat='', var='new', cfg=None):
    """tier 0 — повний текст; 1 — лише назви етапів (описи — зі скрипта); 2 — ще й без вступу, фактів і рядка про команду;
    3 — без списку етапів (список будує скрипт із JSON) — лише для сторінок на самій межі бюджету."""
    t = BD.T[lang][scene]
    st = stages(lang, scene, mat, var, cfg)
    li = ''.join((f'<li><div><b>{e(a)}</b><span>{e(b)}</span></div></li>' if tier == 0 else f'<li>{e(a)}</li>') for a, b in st)
    more = f' <a href="{BUILD[lang]}">{e(t["more"])} →</a>' if compact and t['more'] else ''
    c = ' data-bz-c' if compact else ''
    f = f' data-bz-m="{mat}"' if mat else ''  # описи й решту матеріалів підставляє скрипт (JSON)
    f += ' data-bz-v="old"' if scene == 'flat' and var == 'old' else ''
    f += ' data-bz-cfg="{t},{s},{a}"'.format(**cfg) if scene == 'house' and cfg else ''
    lead = f'<p class="bz-p">{e(t["p"])}{more}</p>' if tier < 2 else ''
    svc = f' data-service="{e(t["more"])}"' if compact and t['more'] else ''  # головна: заявка — про будинок, а не «Консультація (головна)»
    team = f'<p class="bz-team">{e(t["team"])} <a href="{ABOUT[lang]}">{e(t["about"])}</a></p>' if tier < 2 else ''
    # факти з CLAUDE.md — лічильники site-chrome.v1.js (data-count): рахуються від нуля, коли блок у кадрі
    facts = ('<p class="bz-facts">' + ''.join(f'<span><b data-count="{n}">{e(v)}</b> {e(x)}</span>' for n, v, x in FACTS[lang]) + '</p>') if tier < 1 else ''
    return (f'\n<!--ba--><section class="bz" id="build-anim" data-bz="{scene}"{c}{f} aria-labelledby="bz-h" data-js="/assets/build-anim.v1.js" data-css="/assets/build-anim.v1.css"><div class="w">'
            f'<h2 id="bz-h">{e(t["hc"] if compact else t["h"])}</h2>{lead}'
            + (f'<ol class="steps bz-st">{li}</ol>' if tier < 3 else '') +
            f'<div class="bz-cta">{facts}<h3>{e(t["cta"])}</h3>'
            f'<div class="lq-slot" data-form="quick-build-anim"{svc}></div>{team}</div>'
            f'</div></section><!--/ba-->')


# де ставимо: перед «Як працюємо», інакше перед «Гарантіями», квізом чи формою; на головній — перед «Наші проєкти»
HOW = re.compile(r'<section><div class="w"(?: data-c="\w")?>\s*<h2(?: data-i="\w+")?>(?:Як працюємо|Как (?:мы )?работаем|How we work)</h2>')
ANCHORS = ('<!--cas:guarantees-->', '<!--quiz-->', '<section id="zayavka"')
HOME = ('<section class="proj-covers"', '<section class="pcarousel"')


GO_RX = re.compile(r'\n?\s*<a class="btn bz-go" href="#build-anim">[^<]*</a>')


def go_btn(lang, scene):
    """Кнопка-якір у hero «Дивитись, як ми будуємо / ремонтуємо» → #build-anim (тексти — tools/site/ux.py UX / lang/*.json "ux")."""
    import ux
    t = ux.UX.get(lang, ux.UX['en'])
    return f'\n    <a class="btn bz-go" href="#build-anim">{e(t["go_" + scene])}</a>'


def apply(s, rel):
    s = GO_RX.sub('', RX.sub('', s))
    if rel not in PAGES:
        return s
    scene, compact = PAGES[rel]
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m and m.group(1) in BD.T else 'uk'
    k = next((s.find(a) for a in HOME if s.find(a) >= 0), -1) if compact else -1
    if k < 0:
        mh = HOW.search(s)
        k = mh.start() if mh else next((s.find(a) for a in ANCHORS if s.find(a) >= 0), -1)
    if k < 0:
        return s
    # бюджет HTML за типом сторінки (tools/ui/ui.py): повний текст — лише із запасом RESERVE, далі — коротші варіанти;
    # не вміщується навіть найкоротший — блок не ставимо (скрипт друкує, де саме)
    limit = ui.BUDGET['html_kb'][ui.kind(rel, s)] * 1024
    # hero (не головна): кнопка «Дивитись, як ми будуємо» — після останньої кнопки першого .btns
    go, gk = '', -1
    if not compact:
        mb = re.search(r'<div class="w hero">.*?<div class="btns">(.*?)\n?\s*</div>', s, re.S)
        if mb:
            go, gk = go_btn(lang, scene), mb.end(1)
    for tier in (0, 1, 2, 3):
        b = block(lang, scene, compact, tier, MAT.get(rel, ''), VAR.get(rel, 'new'), CFG.get(rel))
        if len(s.encode()) + len(b.encode()) + len(go.encode()) + 30 <= limit - (RESERVE if tier == 0 else 0):  # +40 — ?v= від chrome.versions
            s = s[:k].rstrip('\n') + b + '\n' + s[k:]
            return s[:gk] + go + s[gk:] if go and gk < k else s
    return s


def main():
    import json
    check = '--check' in sys.argv
    bad = []
    for lang in BD.T:  # дані для скрипта сцени
        for sc in SCENES:
            p = os.path.join(ROOT, JSON_OUT.format(lang, sc))
            j = data_json(lang, sc)
            if not os.path.exists(p) or open(p, encoding='utf-8').read() != j:
                bad.append(JSON_OUT.format(lang, sc))
                if not check:
                    open(p, 'w', encoding='utf-8').write(j)
    # версії JSON (?v=) — у скрипті сцени (рядок /*ver*/): атрибут у кожній сторінці коштував би байтів бюджету 64 КБ
    import chrome
    js = os.path.join(ROOT, 'assets/build-anim.v1.js')
    src = open(js, encoding='utf-8').read()
    ver = 'var VER = ' + json.dumps({l + '.' + sc: chrome._ver('/' + JSON_OUT.format(l, sc)) for l in sorted(BD.T) for sc in SCENES}, separators=(',', ':'), sort_keys=True) + '; /*ver*/'
    new = re.sub(r'var VER = \{[^\n]*?\}; /\*ver\*/', lambda m: ver, src)
    if new != src:
        bad.append('assets/build-anim.v1.js')
        if not check:
            open(js, 'w', encoding='utf-8').write(new)
    for rel in PAGES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel)
        if n != s:  # та сама типографіка, що ставить chrome.py (нерозривні пробіли, <span class="nw">), і ?v= файлів
            m = re.search(r'<html[^>]*\blang="([a-z]{2})', n)
            n = chrome.versions(chrome.nbsp_prices(n, m.group(1) if m else None))
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Будинок з нуля: OK')
        sys.exit(1 if bad else 0)
    got = {r: open(os.path.join(ROOT, r), encoding='utf-8').read() for r in PAGES if os.path.exists(os.path.join(ROOT, r))}
    short = [r + ('' if '<ol class="steps bz-st">' in s.split('<!--ba-->')[1] else ' (без списку)') for r, s in got.items() if '<!--ba-->' in s and '</span></div></li>' not in s]
    none = [r for r, s in got.items() if '<!--ba-->' not in s]
    print(f'Будинок з нуля: оновлено {len([b for b in bad if b in PAGES])} з {len(PAGES)} сторінок'
          + (f'; коротко (бюджет HTML): {", ".join(short)}' if short else '') + (f'; без блоку (бюджет): {", ".join(none)}' if none else ''))


if __name__ == '__main__':
    main()
