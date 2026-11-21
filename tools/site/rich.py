"""Розширені секції лендингів (landing.py): головна, послуги, про студію, контакти й портфоліо всіх мов — один шаблон.

Стилі — /assets/sections.v1.css (підключає landing.build(), коли на сторінці є hero з фото або секція звідси).
Секції — лише розмітка UI-kit (/styleguide/#sections), без інлайн-JS; текст завжди в DOM.

Сторінка: "hero_img": {"img", "srcset", "sizes", "alt", "m": {"srcset", "w", "h"} (мобільне портретне фото, необовʼязково)},
"kicker" — рядок над H1. Будь-яка секція: "kicker" (рядок над H2), "link": ["/url", "текст →"] (посилання під секцією),
"cls" — клас секції (напр. "home-next": перед нею media.py/quiz.py ставлять відео й квіз).
Типи:
  svc      — послуги: {"h2", "more": [url, текст], "items": [{"h", "href", "img", "srcset", "alt", "price", "p", "li": [...],
              "more_h": "Що входить", "more": [...], "tags": [...], "links": [[url, назва]], "all": ["Ще послуги (N)", [[url, назва]]]}],
              "note": "текст з [посиланнями](/url)"}; фото картки — 16:10 (img/svc-<послуга>-{400,600}.webp), що показує саме цю послугу
  covers   — обкладинки проєктів: {"h2", "more": [url, текст], "items": [{"href", "img", "srcset", "name", "loc", "alt"}]}
  strip    — стрічка фото з прокруткою (scroll-snap): {"h2"?, "label" (aria), "items": [{"img", "srcset", "alt", "label", "href"}]}
              (href — кейс /proekty/<slug>, aria-label — label + ux "open"; стрічка головних — усі кадри посиланнями)
  split    — фото + текст: {"img", "alt", "href"?, "badge": [число, підпис]?, "h2"?, "lead"?, "p": [...], "vals": [[h, p], ...]?, "btn": [url, текст]?}
  facts    — цифри: {"h2", "items": [[значення, підпис], ...], "links": [[url, текст], ...]?} (блок довіри головних — "cls": "xs-trust")
  cta      — заклик: {"h2"?, "score"?, "p": [...], "btns": [[url, текст, "main"?], ...], "msgs": true?}
  contacts — контакти: {"h2", "p", "rows": [[мітка, текст, href, примітка?], ...], "msgs": true}
  team     — команда: {"h2", "items": [{"h", "role", "p"}], "crew": {"h3", "p", "groups": [{"label", "p", "people": [[імʼя, роль]]}]}}
  project  — проєкт портфоліо: {"id", "h2", "href", "status", "meta", "p"?, "items": [{"img", "srcset", "alt"}]}
  pmap     — «Карта проєктів» (tools/site/casmap.py)
  brands   — «Бренди, з якими працюємо»: {"t": "brands"} — заголовок мовою сторінки й один ряд назв (BRANDS нижче), що їде сам
              (marquee() у ui-polish.v1.js); на сервісних лендингах — "brands": true у JSON сторінки (landing.py)
"""
import html, os, re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = 'assets/sections.v1.css'
TYPES = {'svc', 'covers', 'strip', 'split', 'facts', 'cta', 'contacts', 'team', 'project', 'pmap', 'brands'}
e = lambda s: html.escape(s, quote=False)
a = lambda s: html.escape(s, quote=True)
MDLINK = re.compile(r'\[([^\]]+)\]\((/[^)\s]*|https?://[^)\s]+|tel:[^)\s]+|#[^)\s]*)\)')
rich = lambda s: MDLINK.sub(lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', e(s))
PHONE, WA, TG, VB = '+380978667755', 'https://wa.me/380978667755', 'https://t.me/+380978667755', 'viber://chat?number=%2B380978667755'
LI = 'https://www.linkedin.com/in/mykhailo-litovchuk-818846244'
IG, YT, MAPS = 'https://www.instagram.com/cas_development/', 'https://www.youtube.com/@cas_development', 'https://maps.google.com/?cid=15015666645432112566'
_SZ = {}


def size(src):
    src = src.lstrip('/')
    if src not in _SZ:
        _SZ[src] = Image.open(os.path.join(ROOT, src)).size
    return _SZ[src]


def img(x, alt=None, sizes='(max-width:767px) 90vw, 400px', cls='', eager=False):
    """<img> з width/height (з файлу), srcset/sizes і lazy (крім першого екрана)."""
    src = x['img'].lstrip('/')
    w, h = size(src)
    ss = f' srcset="{a(x["srcset"])}" sizes="{a(x.get("sizes") or sizes)}"' if x.get('srcset') else ''
    load = ' fetchpriority="high" loading="eager"' if eager else ' loading="lazy"'
    c = f' class="{cls}"' if cls else ''
    return f'<img{c} src="/{src}"{ss}{load} decoding="async" width="{w}" height="{h}" alt="{a(x.get("alt", "") if alt is None else alt)}">'


# Слайд-шоу фону hero головних (9 мов, Михайло 09.11.2026): перше фото — hero_img (Pidgirland, eager, без анімації),
# далі кожні ~10 с плавна зміна (1.2 с) на рендери проєктів CAS — вітальні, їдальні, кухні, спальні, ресторан, тераса
# (без санвузлів, гардеробних, коридорів). Файли img/hs-<назва>-<w>.webp (ПК, 2:1) і -m-<w>.webp (телефон, 0.6) —
# кадри tools/img/crops.json (tools/img/originals.py). Вантажить ui-polish.v1.js (heroSlides) лише після load/idle.
HERO_SLIDES = ('living', 'dining', 'monpark', 'kitchen', 'bedroom', 'terrace', 'yacht')


def _slides():
    """data-hs="назва:ширини ПК:ширини телефона;…" — лише наявні файли (коротко: бюджет HTML)."""
    import os
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ws = lambda b, xs: '.'.join(str(w) for w in xs if os.path.exists(os.path.join(root, f'img/{b}-{w}.webp')))
    return ';'.join(f'{n}:{ws("hs-" + n, (1280, 1600, 1920, 2400, 2800, 3200))}:{ws("hs-" + n + "-m", (720, 1080, 1440, 1800))}' for n in HERO_SLIDES)


def home_sizes(ar):
    """sizes фото hero головних (9 мов) з поправкою на обрізку object-fit:cover; ar — пропорція файла (ш/в).
    Телефон (портрет, ≤767 px): блок 100vw × (100svh − шапка 64 px) — фото 0.6 займає ширину ≈ 0.6 × висоти.
    ПК (sections.v1.css .hx-home, 09.11.2026): висота hero = 100vh − шапка − кадр стрічки 4:5 (100vw / 4 · 6 · 7 кадрів у ряд) − 16 px, ≥ 20rem;
    фото ширше за блок, коли висота × ar > 100vw. Той самий розрахунок — у heroSlides() (ui-polish.v1.js) для наступних кадрів."""
    if ar < 1:
        return f'max(100vw, calc({ar * 100:g}vh - {64 * ar:g}px))'
    k = lambda n: f'max(100vw, {20 * ar:g}rem, calc({ar * 100:g}vh - {ar * 80:g}px - {ar * 125 / n:.4g}vw))'
    return f'(max-width:767px) 100vw, (max-width:1023px) {k(4)}, (max-width:1599px) {k(6)}, {k(7)}'


def hero_bg(h, full=False):
    """Фото першого екрана (не анімуємо, одна fetchpriority="high").
    full — головні (Михайло 08.11.2026): на телефоні фото на весь екран під легшим затемненням, тому sizes 100vw (різкість)."""
    m = h.get('m')
    ms = '100vw' if full else '60vw'
    if full:  # головні: кадр hero не має пропорції файла (object-fit:cover) — sizes = ширина, яку фото реально займає (різкість без апскейлу)
        m = dict(m, sizes=home_sizes(.6)) if m else m
        h = dict(h, sizes=home_sizes(size(h['img'])[0] / size(h['img'])[1]))
    else:  # послуги/про/контакти/портфоліо: блок ≥ min(80vh, 760px) заввишки (.hx .hero) — альбомне фото ширше за блок
        ar = size(h['img'])[0] / size(h['img'])[1]  # (планшет 820×1180: 2:1 у кадрі 820×760 — потрібно ~1520 px, а не 100vw; аудит фото 16.11.2026)
        if ar > 1:
            h = dict(h, sizes=f'(max-width:767px) {ms}, max(100vw, min({80 * ar:g}vh, {760 * ar:g}px))')
    # m["sizes"] — свій sizes телефонного кадру (послуги/про/контакти/портфоліо: легша копія того ж кадру -m-<w>, sizes як у ПК — 100vw)
    src = (f'<source media="(max-width:767px) and (orientation:portrait)" srcset="{a(m["srcset"])}" sizes="{m.get("sizes", ms)}" width="{m["w"]}" height="{m["h"]}">'
           if m else '')
    # телефон (не головні): фото під темним градієнтом — достатньо ~60vw (менше байтів до LCP)
    hs = f' data-hs="{_slides()}"' if full else ''
    return f'<picture class="hx-bg"{hs}>{src}{img(h, sizes=f"(max-width:767px) {ms}, 100vw", eager=True)}</picture>'


MSGS = [('telegram', 'Telegram', TG), ('viber', 'Viber', VB), ('whatsapp', 'WhatsApp', WA), ('instagram', 'Instagram', IG), ('linkedin', 'LinkedIn', LI),
        ('tiktok', 'TikTok', 'https://www.tiktok.com/@li_mi_tless'), ('behance', 'Behance', 'https://www.behance.net/mykhailol2'),  # Behance Михайла — 21.11.2026
        # WeChat (Михайло 08.11.2026): додають за номером; клік копіює номер (site-chrome.v1.js), на телефоні далі відкриває застосунок; без JS — weixin://
        ('wechat', 'WeChat +380 63 866 77 55', 'weixin://')]


def msgs(label=''):
    """Месенджери й соцмережі — лише іконки, як у футері (Михайло 21.11.2026: без підпису «Месенджери», мінімум тексту); назва — aria-label і title."""
    lab = f' role="group" aria-label="{a(label)}"' if label else ''
    return (f'<p class="xs-msg"{lab}>' + ''.join(
        f'<a class="bi bi-{k}" href="{u}"' + (' target="_blank" rel="noopener"' if u.startswith('http') else '')
        + (' data-wx="+380 63 866 77 55"' if k == 'wechat' else '') + f' aria-label="{n}" title="{n}"></a>' for k, n, u in MSGS) + '</p>')


def btns(bs):
    return '<div class="btns">' + ''.join(
        f'<a class="btn{" main" if len(b) > 2 and b[2] else ""}" href="{a(b[0])}"'
        + (' target="_blank" rel="noopener"' if b[0].startswith('http') else '') + f'>{e(b[1])}</a>' for b in bs) + '</div>'


def head(x, tag='h2'):
    k = f'<p class="kick">{e(x["kicker"])}</p>' if x.get('kicker') else ''
    if x.get('h2_sr'):  # заголовок лише для скрінрідерів і порядку H1→H2→H3 (сітка карток без видимого H2)
        return k + f'<{tag} class="mo-sr">{e(x["h2_sr"])}</{tag}>'
    if not x.get('h2'):
        return k
    h = f'<{tag}>{e(x["h2"])}</{tag}>'
    if x.get('more'):
        return k + f'<div class="xs-head">{h}<a href="{a(x["more"][0])}">{e(x["more"][1])}</a></div>'
    return k + h


def link(x):
    return f'<p class="xs-lnk"><a href="{a(x["link"][0])}">{e(x["link"][1])}</a></p>' if x.get('link') else ''


def wrap(x, inner, cls):
    c = ' '.join(filter(None, [x.get('cls'), cls]))  # спершу власний клас: інструменти шукають '<section class="home-next"'
    sid = f' id="{x["id"]}"' if x.get('id') else ''
    return f'<section class="{c}"{sid}><div class="w">{inner}{link(x)}</div></section>\n'


def svc(x):
    cards = []
    for c in x['items']:
        # картка з фото — посилання цілком (CLAUDE.md «Фото: що відкривається»): без "href" — перше посилання картки
        href = c.get('href') or next((u for u, _ in (c.get('links') or (c.get('all') or [None, []])[1])), None)
        ttl = f'<a href="{a(href)}">{e(c["h"])}</a>' if href else e(c['h'])
        # alt — з "alt" картки (опис фото), інакше порожній
        o = (img(c, None, '(max-width:767px) 92vw, 300px') if c.get('img') else '') + '<div class="xs-cb">' + f'<h3>{ttl}</h3>'
        o += f'<p class="xs-pr">{e(c["price"])}</p>' if c.get('price') else ''
        o += f'<p>{rich(c["p"])}</p>' if c.get('p') else ''
        o += '<ul>' + ''.join(f'<li>{rich(i)}</li>' for i in c['li']) + '</ul>' if c.get('li') else ''
        if c.get('tags') and not c.get('more'):
            # лише теги — показуємо одразу: згортка з підписом «+» і одним тегом усередині виглядала як дві «+» (QA 03.11.2026)
            o += '<p class="xs-tags">' + ''.join(f'<span>{e(t)}</span>' for t in c['tags']) + '</p>'
        elif c.get('more') or c.get('tags'):
            o += (f'<details class="xs-more"><summary>{e(c.get("more_h") or "+")}</summary>'
                  + ('<ul>' + ''.join(f'<li>{rich(i)}</li>' for i in c.get('more', [])) + '</ul>' if c.get('more') else '')
                  + ('<p class="xs-tags">' + ''.join(f'<span>{e(t)}</span>' for t in c['tags']) + '</p>' if c.get('tags') else '')
                  + '</details>')
        links, al = list(c.get('links') or []), c.get('all')
        if links and al:  # картка з «Ще послуги (N)»: додаткові посилання — теж у розгортанні, на картці лише назва, ціна й суть (мінімізація 05.11.2026)
            ls = links + [x for x in al[1] if x[0] not in {u for u, _ in links}]
            al = [re.sub(r'\d+', str(len(ls)), al[0], count=1), ls]
            links = []
        if links:
            o += '<p class="xs-links">' + ''.join(f'<a href="{a(u)}">{e(n)}</a>' for u, n in links) + '</p>'
        if al:
            o += (f'<details class="xs-all"><summary>{e(al[0])}</summary><div class="rel">'
                  + ''.join(f'<a href="{a(u)}">{e(n)}</a>' for u, n in al[1]) + '</div></details>')
        cards.append('<article class="xs-c">' + o + '</div></article>')
    note = f'<p class="xs-note">{rich(x["note"])}</p>' if x.get('note') else ''
    return wrap(x, head(x) + '<div class="xs-sv">' + ''.join(cards) + '</div>' + note, 'xs-svc')


def covers(x):
    it = ''.join(f'<a href="{a(c["href"])}">{img(c, c.get("alt", ""), "(max-width:767px) 46vw, 340px")}'
                 f'<span><b>{e(c["name"])}</b>' + (f'<small>{e(c["loc"])}</small>' if c.get('loc') else '') + '</span></a>' for c in x['items'])
    return wrap(x, head(x) + f'<div class="xs-cv">{it}</div>', 'xs-covers')


def strip(x, lang='uk'):
    # кадр з "href" — посилання на кейс (Михайло 11.11.2026: «щоб можна було клікати й відкривався проєкт»);
    # /proekty/<slug> у JSON усіх мов — сторінку своєї мови підставляє chrome.local_cases; aria-label — «Назва — відкрити проєкт»
    import ux
    op = ux.UX.get(lang, {}).get('open') or ux.UX['uk']['open']
    it = []
    for c in x['items']:
        body = img(c, None, '(max-width:767px) 60vw, 300px') + (f'<span>{e(c["label"])}</span>' if c.get('label') else '')
        lab = f' aria-label="{a(c["label"] + " — " + op)}"' if c.get('label') else ''
        it.append(f'<a href="{a(c["href"])}"{lab}>{body}</a>' if c.get('href') else f'<figure>{body}</figure>')
    lab = f' aria-label="{a(x["label"])}"' if x.get('label') else ''
    lead = f'<p class="xs-sub">{rich(x["p"])}</p>' if x.get('p') else ''
    return wrap(x, head(x) + lead + f'<div class="xs-st" tabindex="0" role="region"{lab}>' + ''.join(it) + '</div>', 'xs-strip')


def split(x):
    pic = img(x, x.get('alt', ''), '(max-width:767px) 92vw, 520px')
    if x.get('href'):
        pic = f'<a href="{a(x["href"])}" tabindex="-1" aria-hidden="true">{pic}</a>'
    if x.get('badge'):
        pic += f'<p class="xs-badge"><b>{e(x["badge"][0])}</b><span>{e(x["badge"][1])}</span></p>'
    t = head(x)
    t += f'<p class="xs-lead">{rich(x["lead"])}</p>' if x.get('lead') else ''
    t += ''.join(f'<p>{rich(p)}</p>' for p in x.get('p', []))
    if x.get('vals'):
        t += '<div class="xs-vals">' + ''.join(f'<div><b>{e(h)}</b><span>{rich(p)}</span></div>' for h, p in x['vals']) + '</div>'
    if x.get('btn'):
        t += btns([x['btn']])
    return wrap(x, f'<div class="xs-sp"><div class="xs-pic">{pic}</div><div class="xs-tx">{t}</div></div>', 'xs-split')


def facts(x):
    # "links" — рядок посилань «Детальніше» під цифрами (блок довіри головних, cls "xs-trust": куди перенесено етапи, гарантії, FAQ, відгуки)
    lk = ('<p class="xs-links">' + ''.join(f'<a href="{a(u)}"' + (' target="_blank" rel="noopener"' if u.startswith('http') else '') + f'>{e(n)} →</a>'
                                           for u, n in x['links']) + '</p>') if x.get('links') else ''
    return wrap(x, head(x) + '<div class="facts">' + ''.join(f'<div><b>{e(b)}</b><span>{e(s)}</span></div>' for b, s in x['items']) + '</div>' + lk, 'xs-facts')


def cta(x):
    o = head(x)
    if x.get('score'):
        o += f'<p class="xs-score">{e(x["score"])} <span aria-hidden="true">★★★★★</span></p>'
    o += ''.join(f'<p>{rich(p)}</p>' for p in x.get('p', []))
    o += btns(x['btns']) if x.get('btns') else ''
    o += msgs() if x.get('msgs') else ''
    return wrap(x, o, 'xs-cta')


GREVIEW = 'https://g.page/r/CbaVqfJBXWLQEAE/review'
STAR = ('M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z')  # Lucide star (ISC)


def contacts(x):
    rows = ''.join(f'<div><span>{e(r[0])}</span><b>' + (f'<a href="{a(r[2])}"' + (' target="_blank" rel="noopener"' if r[2].startswith('http') else '')
                   + f'><bdi>{e(r[1])}</bdi></a>' if r[2] else e(r[1])) + '</b>' + (f'<small>{e(r[3])}</small>' if len(r) > 3 and r[3] else '') + '</div>'
                   for r in x['rows'])
    o = head(x) + (f'<p class="xs-lead">{rich(x["p"])}</p>' if x.get('p') else '') + f'<div class="xs-ct">{rows}</div>'
    if x.get('review'):  # відгук у Google — основний профіль GBP (Михайло 17.11.2026), текст мовою сторінки
        o += (f'<p class="xs-rev"><a href="{GREVIEW}" target="_blank" rel="noopener"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
              f'<path d="{STAR}"/></svg>{e(x["review"])}</a></p>')
    # підпис «Месенджери» (msgs_h) — лише для читачів екрана: aria-label ряду іконок (Михайло 21.11.2026)
    return wrap(x, o + (msgs(x.get('msgs_h', '')) if x.get('msgs') else ''), 'xs-contacts')


def team(x):
    o = head(x) + '<div class="grid">' + ''.join(
        f'<div class="card xs-tm"><span class="xs-av" aria-hidden="true">{e(c["h"][:1])}</span><h3>{e(c["h"])}</h3>'
        f'<p class="xs-role">{e(c["role"])}</p><p>{rich(c["p"])}</p></div>' for c in x['items']) + '</div>'
    if x.get('crew'):
        cr = x['crew']
        if not any(g.get('people') for g in cr['groups']):
            # без імен (Михайло 08.11.2026): лише відділи й групи — компактні плашки, опис у title і в DOM
            return wrap(x, o + f'<h3 class="xs-crew-h">{e(cr["h3"])}</h3><p class="xs-crew-p">{e(cr["p"])}</p><ul class="xs-crew-c">' + ''.join(
                f'<li title="{a(g.get("p", ""))}"><b>{e(g["label"])}</b>' + (f'<span>{e(g["p"])}</span>' if g.get('p') else '') + '</li>' for g in cr['groups']) + '</ul>', 'xs-team')
        o += f'<h3 class="xs-crew-h">{e(cr["h3"])}</h3><p class="xs-crew-p">{e(cr["p"])}</p><div class="xs-crew">' + ''.join(
            f'<div><p class="kick">{e(g["label"])}</p>' + (f'<p>{e(g["p"])}</p>' if g.get('p') else '') + '<ul>'
            + ''.join(f'<li><b>{e(n)}</b>' + (f' <span>{e(r)}</span>' if r else '') + '</li>' for n, r in g['people']) + '</ul></div>' for g in cr['groups']) + '</div>'
    return wrap(x, o, 'xs-team')


def _wd(c):
    """Альбомне фото (≥ 3:2) у стрічці портфоліо займає дві клітинки (.xs-proj a.wd, sections.v1.css): у кадрі 3:4 від 2:1 лишалось ~37 %
    (аудит фото 16.11.2026: обкладинки Hoda Estate, USA House, Edelweiss)."""
    w, h = size(c['img'])
    return ' class="wd"' if w / h >= 1.5 else ''


def project(x):
    meta = (f'<p class="xs-meta"><span class="xs-stat">{e(x["status"])}</span>{e(x["meta"])} · <a href="{a(x["href"])}">{e(x["open"])}</a></p>')
    o = (f'<div class="xs-head"><h2><a href="{a(x["href"])}">{e(x["h2"])}</a></h2>'
         + (f'<a href="{a(x["href"])}">{e(x["btn"])}</a>' if x.get('btn') else '') + '</div>' + meta + ''.join(f'<p>{rich(p)}</p>' for p in x.get('p', [])))
    o += (f'<div class="xs-st" tabindex="0" role="region" aria-label="{a(x["label"])}">'
          + ''.join(f'<a href="{a(x["href"])}"{_wd(c)}>{img(c, None, "(max-width:767px) 60vw, 300px")}</a>' for c in x['items']) + '</div>')
    return wrap(x, o, 'xs-proj')


def pmap(x, lang='uk'):
    import casmap
    return casmap.projects_html(lang).replace('<section class="pmap"', '<section class="pmap xs-pmap"', 1) + '\n'


# «Бренди, з якими працюємо» (Михайло 21.11.2026: «анімаційна лента… 10–20 стандартних компаній з виробництва елементів інтерʼєру»;
# того ж дня: «залишай всіх, додай ще середній клас; лиши де є, на головну не треба; договори/логотипи поки не треба»).
# Список і місця затверджено. Угод про партнерство немає, тому без слів «партнер / офіційний / дилер» і без логотипів: лише назви текстом
# шрифтом сайту. Правити тут (одне місце для всіх мов). Категорія — (преміум, середній клас); на сайті не показуємо: порядок у стрічці —
# brands_order() (преміум і середній клас чергуються, категорії — по колу). Брендів російського походження не додаємо.
# Нова назва латиницею — і в glossary.json (однослівна — latin_ok, з кількох слів — latin_names), інакше i18nlint лається на zh/ar.
BRANDS = (
    ('меблі', ('Poliform', 'Minotti', 'Molteni&C'), ('BoConcept', 'Calligaris')),
    ('фурнітура й плити', ('Blum', 'Egger'), ('Hettich', 'Häfele', 'GTV')),
    ('освітлення', ('Flos', 'Artemide', 'Delta Light'), ('Eglo', 'Nowodvorski', 'TK Lighting')),
    ('розетки й електрика', ('Schneider Electric', 'Legrand', 'Jung', 'Gira'), ('ABB', 'Hager')),
    ('сантехніка', ('Grohe', 'Hansgrohe', 'Geberit', 'Villeroy & Boch'), ('Ideal Standard', 'Roca', 'Cersanit', 'Kolo')),
    ('техніка', ('Miele', 'Bosch'), ('Gorenje', 'Electrolux')),
    ('плитка', ('Porcelanosa', 'Atlas Concorde'), ('Golden Tile', 'Opoczno')),
    ('підлога', (), ('Quick-Step', 'Tarkett')),
    ('фарби й суміші', ('Tikkurila',), ('Caparol', 'Ceresit')),
    ('клімат', ('Daikin',), ()),
)


def _rr(lists):
    """По колу: перша назва кожної категорії, потім друга… — сусідні назви з різних категорій."""
    out, i = [], 0
    while any(i < len(x) for x in lists):
        out += [x[i] for x in lists if i < len(x)]
        i += 1
    return out


def brands_order():
    """Порядок у стрічці: преміум і середній клас чергуються (решта довшого ряду — у кінці), категорії — по колу."""
    p, m = _rr([c[1] for c in BRANDS]), _rr([c[2] for c in BRANDS])
    out = [n for pair in zip(p, m) for n in pair]
    return out + p[len(m):] + m[len(p):]


# заголовок і підписи кнопки паузи (data-mq: «пауза|далі» — marquee() бере їх замість «фото»)
BRANDS_T = {
    'uk': ('Бренди, з якими працюємо', 'Зупинити стрічку брендів', 'Запустити стрічку брендів'),
    'ru': ('Бренды, с которыми работаем', 'Остановить ленту брендов', 'Запустить ленту брендов'),
    'en': ('Brands we work with', 'Pause the brand strip', 'Play the brand strip'),
    'es': ('Marcas con las que trabajamos', 'Pausar la franja de marcas', 'Reanudar la franja de marcas'),
    'zh': ('我们常用的品牌', '暂停品牌滚动', '继续品牌滚动'),
    'pl': ('Marki, z którymi pracujemy', 'Zatrzymaj pasek marek', 'Wznów pasek marek'),
    'de': ('Marken, mit denen wir arbeiten', 'Markenlauf anhalten', 'Markenlauf starten'),
    'fr': ('Les marques avec lesquelles nous travaillons', 'Mettre en pause le défilement des marques', 'Relancer le défilement des marques'),
    'pt': ('Marcas com que trabalhamos', 'Pausar a faixa de marcas', 'Retomar a faixa de marcas'),
    'ar': ('العلامات التجارية التي نعمل بها', 'إيقاف شريط العلامات التجارية', 'تشغيل شريط العلامات التجارية'),
}


def brands(x, lang='uk'):
    """Один ряд назв (без фото, ~0.7 КБ): <ul> у DOM — для читачів екрана й без JS; рух, пауза при наведенні/дотику/фокусі й кнопка ❚❚/▶ —
    marquee() у ui-polish.v1.js (копії назв — aria-hidden, через <template>); reduced-motion — статичний ряд із переносом (sections.v1.css)."""
    h, p0, p1 = BRANDS_T.get(lang) or BRANDS_T['en']
    li = ''.join(f'<li>{e(n)}</li>' for n in brands_order())
    ul = f'<ul class="xs-bl" tabindex="0" aria-label="{a(h)}" data-mq="{a(p0 + "|" + p1)}">{li}</ul>'
    return wrap(x, f'<h2>{e(x.get("h2") or h)}</h2><div class="xs-brw">{ul}</div>', 'xs-brands')


def render(lang, x):
    if x['t'] == 'brands':
        return [brands(x, lang)]
    if x['t'] == 'pmap':
        return [pmap(x, lang)]
    if x['t'] == 'strip':
        return [strip(x, lang)]
    return [globals()[x['t']](x)]


def used(p):
    return bool(p.get('hero_img')) or bool(p.get('brands')) or any(x['t'] in TYPES or x.get('kicker') or x.get('link') for x in p.get('sections', []))


# UI-kit: живий приклад «Бренди, з якими працюємо» у /styleguide/#sections (між <!--brands-sg--> … <!--/brands-sg-->, перед <!--/sg-sections-->);
# стилі й рух — ті самі файли, що на сторінках (sections.v1.css, ui-polish.v1.js — підключаємо в styleguide, якщо їх там немає).
SG = os.path.join(ROOT, 'styleguide', 'index.html')


def styleguide(check=False):
    s = open(SG, encoding='utf-8').read()
    blk = ('<!--brands-sg--><p class="sg-note" id="brands-sg"><code>brands</code> — «Бренди, з якими працюємо»: <code>{"t": "brands"}</code> у секціях '
           '(«Про студію» 10 мов) або <code>"brands": true</code> у JSON лендингу (комплектація, меблювання — перед формою). Назви текстом шрифтом сайту, '
           'без логотипів і слова «партнери» (список — <code>BRANDS</code> у <code>tools/site/rich.py</code>, чекає підтвердження власника); рух — '
           '<code>marquee()</code> у <code>/assets/ui-polish.v1.js</code> (~25 px/с, пауза при наведенні, дотику й фокусі, кнопка ❚❚/▶ у кінці ряду, копії — '
           '<code>aria-hidden</code>), <code>prefers-reduced-motion</code> — статичний ряд із переносом.</p>' + brands({}, 'uk').rstrip('\n') + '<!--/brands-sg-->')
    end = '</div></section><!--/sg-sections-->'  # кінець .sg-demo і секції #sections — приклад іде всередину
    n = re.sub(r'<!--brands-sg-->.*?<!--/brands-sg-->', lambda _: blk, s, count=1, flags=re.S) if '<!--brands-sg-->' in s else s.replace(end, blk + '\n' + end, 1)
    if '<link rel="stylesheet" href="/assets/sections.v1.css' not in n:
        n = n.replace('<link rel="stylesheet" href="/assets/media.v1.css', '<link rel="stylesheet" href="/assets/sections.v1.css"><link rel="stylesheet" href="/assets/media.v1.css', 1)
    if '<script src="/assets/ui-polish.v1.js' not in n:
        n = n.replace('<script src="/assets/site-chrome.v1.js', '<script src="/assets/ui-polish.v1.js" defer></script>\n<script src="/assets/site-chrome.v1.js', 1)
    sp = lambda t: t.replace('\u00a0', ' ').replace('\u202f', ' ')  # нерозривні пробіли ставить chrome.py
    if check:
        return sp(n) == sp(s)
    if sp(n) != sp(s):
        open(SG, 'w', encoding='utf-8').write(n)
        print('rich.py: /styleguide/#sections — приклад «Бренди» оновлено')
    return True


if __name__ == '__main__':
    import sys
    if not styleguide('--check' in sys.argv) and '--check' in sys.argv:
        sys.exit('rich.py: /styleguide/#sections застарів — python3 tools/site/rich.py')
