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
  split    — фото + текст: {"img", "alt", "href"?, "badge": [число, підпис]?, "h2"?, "lead"?, "p": [...], "vals": [[h, p], ...]?, "btn": [url, текст]?}
  facts    — цифри: {"h2", "items": [[значення, підпис], ...], "links": [[url, текст], ...]?} (блок довіри головних — "cls": "xs-trust")
  cta      — заклик: {"h2"?, "score"?, "p": [...], "btns": [[url, текст, "main"?], ...], "msgs": true?}
  contacts — контакти: {"h2", "p", "rows": [[мітка, текст, href, примітка?], ...], "msgs": true}
  team     — команда: {"h2", "items": [{"h", "role", "p"}], "crew": {"h3", "p", "groups": [{"label", "p", "people": [[імʼя, роль]]}]}}
  project  — проєкт портфоліо: {"id", "h2", "href", "status", "meta", "p"?, "items": [{"img", "srcset", "alt"}]}
  pmap     — «Карта проєктів» (tools/site/casmap.py)
"""
import html, os, re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = 'assets/sections.v1.css'
TYPES = {'svc', 'covers', 'strip', 'split', 'facts', 'cta', 'contacts', 'team', 'project', 'pmap'}
e = lambda s: html.escape(s, quote=False)
a = lambda s: html.escape(s, quote=True)
MDLINK = re.compile(r'\[([^\]]+)\]\((/[^)\s]*|https?://[^)\s]+|tel:[^)\s]+|#[^)\s]*)\)')
rich = lambda s: MDLINK.sub(lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', e(s))
PHONE, WA, TG, VB = '+380978667755', 'https://wa.me/380978667755', 'https://t.me/+380978667755', 'viber://chat?number=%2B380978667755'
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


def hero_bg(h):
    """Фото першого екрана (не анімуємо, одна fetchpriority="high")."""
    m = h.get('m')
    src = (f'<source media="(max-width:767px) and (orientation:portrait)" srcset="{a(m["srcset"])}" sizes="60vw" width="{m["w"]}" height="{m["h"]}">'
           if m else '')
    # телефон: фото під темним градієнтом — достатньо ~60vw (менше байтів до LCP)
    return f'<picture class="hx-bg">{src}{img(h, sizes="(max-width:767px) 60vw, 100vw", eager=True)}</picture>'


def msgs():
    return ('<p class="xs-msg">'
            f'<a class="bi bi-telegram" href="{TG}" target="_blank" rel="noopener">Telegram</a>'
            f'<a class="bi bi-viber" href="{VB}">Viber</a>'
            f'<a class="bi bi-whatsapp" href="{WA}" target="_blank" rel="noopener">WhatsApp</a>'
            f'<a class="bi bi-instagram" href="{IG}" target="_blank" rel="noopener">Instagram</a></p>')


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
        ttl = f'<a href="{a(c["href"])}">{e(c["h"])}</a>' if c.get('href') else e(c['h'])
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
        if c.get('links'):
            o += '<p class="xs-links">' + ''.join(f'<a href="{a(u)}">{e(n)}</a>' for u, n in c['links']) + '</p>'
        if c.get('all'):
            o += (f'<details class="xs-all"><summary>{e(c["all"][0])}</summary><div class="rel">'
                  + ''.join(f'<a href="{a(u)}">{e(n)}</a>' for u, n in c['all'][1]) + '</div></details>')
        cards.append('<article class="xs-c">' + o + '</div></article>')
    note = f'<p class="xs-note">{rich(x["note"])}</p>' if x.get('note') else ''
    return wrap(x, head(x) + '<div class="xs-sv">' + ''.join(cards) + '</div>' + note, 'xs-svc')


def covers(x):
    it = ''.join(f'<a href="{a(c["href"])}">{img(c, c.get("alt", ""), "(max-width:767px) 46vw, 340px")}'
                 f'<span><b>{e(c["name"])}</b>' + (f'<small>{e(c["loc"])}</small>' if c.get('loc') else '') + '</span></a>' for c in x['items'])
    return wrap(x, head(x) + f'<div class="xs-cv">{it}</div>', 'xs-covers')


def strip(x):
    it = []
    for c in x['items']:
        body = img(c, None, '(max-width:767px) 60vw, 300px') + (f'<span>{e(c["label"])}</span>' if c.get('label') else '')
        it.append(f'<a href="{a(c["href"])}">{body}</a>' if c.get('href') else f'<figure>{body}</figure>')
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


def contacts(x):
    rows = ''.join(f'<div><span>{e(r[0])}</span><b>' + (f'<a href="{a(r[2])}"' + (' target="_blank" rel="noopener"' if r[2].startswith('http') else '')
                   + f'><bdi>{e(r[1])}</bdi></a>' if r[2] else e(r[1])) + '</b>' + (f'<small>{e(r[3])}</small>' if len(r) > 3 and r[3] else '') + '</div>'
                   for r in x['rows'])
    o = head(x) + (f'<p class="xs-lead">{rich(x["p"])}</p>' if x.get('p') else '') + f'<div class="xs-ct">{rows}</div>'
    mh = f'<p class="kick xs-msg-h">{e(x["msgs_h"])}</p>' if x.get('msgs_h') else ''
    return wrap(x, o + (mh + msgs() if x.get('msgs') else ''), 'xs-contacts')


def team(x):
    o = head(x) + '<div class="grid">' + ''.join(
        f'<div class="card xs-tm"><span class="xs-av" aria-hidden="true">{e(c["h"][:1])}</span><h3>{e(c["h"])}</h3>'
        f'<p class="xs-role">{e(c["role"])}</p><p>{rich(c["p"])}</p></div>' for c in x['items']) + '</div>'
    if x.get('crew'):
        cr = x['crew']
        o += f'<h3 class="xs-crew-h">{e(cr["h3"])}</h3><p class="xs-crew-p">{e(cr["p"])}</p><div class="xs-crew">' + ''.join(
            f'<div><p class="kick">{e(g["label"])}</p>' + (f'<p>{e(g["p"])}</p>' if g.get('p') else '') + '<ul>'
            + ''.join(f'<li><b>{e(n)}</b>' + (f' <span>{e(r)}</span>' if r else '') + '</li>' for n, r in g['people']) + '</ul></div>' for g in cr['groups']) + '</div>'
    return wrap(x, o, 'xs-team')


def project(x):
    meta = (f'<p class="xs-meta"><span class="xs-stat">{e(x["status"])}</span>{e(x["meta"])} · <a href="{a(x["href"])}">{e(x["open"])}</a></p>')
    o = (f'<div class="xs-head"><h2><a href="{a(x["href"])}">{e(x["h2"])}</a></h2>'
         + (f'<a href="{a(x["href"])}">{e(x["btn"])}</a>' if x.get('btn') else '') + '</div>' + meta + ''.join(f'<p>{rich(p)}</p>' for p in x.get('p', [])))
    o += (f'<div class="xs-st" tabindex="0" role="region" aria-label="{a(x["label"])}">'
          + ''.join(f'<a href="{a(x["href"])}">{img(c, None, "(max-width:767px) 60vw, 300px")}</a>' for c in x['items']) + '</div>')
    return wrap(x, o, 'xs-proj')


def pmap(x):
    import casmap
    return casmap.projects_html().replace('<section class="pmap"', '<section class="pmap xs-pmap"', 1) + '\n'


def render(lang, x):
    return [globals()[x['t']](x)]


def used(p):
    return bool(p.get('hero_img')) or any(x['t'] in TYPES or x.get('kicker') or x.get('link') for x in p.get('sections', []))
