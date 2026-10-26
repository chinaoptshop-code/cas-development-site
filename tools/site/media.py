#!/usr/bin/env python3
"""Медіа сайту з tools/site/media.json: тур 360° (власний переглядач /tury), відео YouTube, канал YouTube у sameAs і на /contact.

  python3 tools/site/media.py            # оновити сторінки (ідемпотентно)
  python3 tools/site/media.py --check    # лише перевірка: код 1, якщо щось не оновлено або конфіг невірний

Компоненти UI-kit — /styleguide/#media; поведінка — /assets/media.v1.js, стилі — /assets/media.v1.css:
  • tour360[проєкт] = "<slug туру>" (tools/tours/tours/<slug>.json, не "hidden") → на /proekty/<проєкт> секція
    «Віртуальний тур 360°» перед «Фото проєкту»: постер (перше фото галереї) + кнопка; iframe /tury/<slug>?embed=1 —
    лише по кліку, у модальному вікні. Посилання «Усі тури 360°» → /tury — лише коли є хоч один не прихований тур.
    Сам переглядач — tools/tours (не чіпаємо). Порожній slug — секції немає.
  • videos → блок «Відео з обʼєктів» (lite-embed: постер i.ytimg.com, iframe youtube-nocookie.com лише по кліку) на video_pages;
    extra[сторінка] = {"videos": [...]} — на окремих сторінках, де назва явно збігається.
  • youtube_channel → "sameAs" JSON-LD Organization (усі сторінки, де він є) і рядок на /contact; іконку у футері ставить chrome.py.
Блоки — між <!--tour360-->, <!--yt-->, <!--soc--> і відповідними <!--/…-->. CSP (_headers): frame-src 'self'
https://www.youtube-nocookie.com, img-src https: (i.ytimg.com).
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CFG = os.path.join(ROOT, 'tools/site/media.json')
TOURS = os.path.join(ROOT, 'tools/tours/tours')
SLUG = re.compile(r'^[a-z0-9-]+$')
YT_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
YT_CH = re.compile(r'^https://www\.youtube\.com/(@[A-Za-z0-9_.\-]+|channel/UC[A-Za-z0-9_-]{22})$')
BLOCKS = re.compile(r'\n?<!--(tour360|tours|yt|soc)-->.*?<!--/\1-->', re.S)
ASSETS = '<link rel="stylesheet" href="/assets/media.v1.css"><script src="/assets/media.v1.js" defer></script>'

T = {
    'uk': dict(tour='Віртуальний тур 360°', tour_btn='Відкрити тур 360°', all='Усі тури 360° →',
               tour_p='Пройдіться обʼєктом самостійно: тур 360° відкривається у вікні на цій сторінці.',
               vid='Відео з обʼєктів', vid_p='Відео з нашого каналу YouTube.', chan='Канал CAS на YouTube →', play='Відтворити відео', yt='YouTube'),
    'ru': dict(tour='Виртуальный тур 360°', tour_btn='Открыть тур 360°', all='Все туры 360° →',
               tour_p='Пройдитесь по объекту сами: тур 360° открывается в окне на этой странице.',
               vid='Видео с объектов', vid_p='Видео с нашего канала YouTube.', chan='Канал CAS на YouTube →', play='Смотреть видео', yt='YouTube'),
    'en': dict(tour='Virtual 360° tour', tour_btn='Open the 360° tour', all='All 360° tours →',
               tour_p='Walk through the space yourself: the 360° tour opens in a window on this page.',
               vid='Videos from our sites', vid_p='Videos from our YouTube channel.', chan='CAS on YouTube →', play='Play video', yt='YouTube'),
}
e = lambda s: html.escape(s, quote=True)
H2 = 'font-family:\'Cormorant Garamond\',\'Cormorant Fallback\',Georgia,serif;font-weight:300;font-size:var(--fs-h2);line-height:1.15;margin:0 0 10px'
SEC = 'padding:56px 16px;border-top:1px solid var(--ln,rgba(191,145,72,.18))'
LEAD = 'color:var(--mu);margin:0 0 22px;max-width:34.2em'


def tour_info(slug):
    """Дані туру з tools/tours/tours/<slug>.json або None."""
    p = os.path.join(TOURS, (slug or '') + '.json')
    if not SLUG.match(slug or '') or not os.path.exists(p):
        return None
    return json.load(open(p, encoding='utf-8'))


def public_tours():
    if not os.path.isdir(TOURS):
        return []
    return [f[:-5] for f in sorted(os.listdir(TOURS)) if f.endswith('.json') and not (tour_info(f[:-5]) or {}).get('hidden')]


def load():
    c = json.load(open(CFG, encoding='utf-8'))
    errs = []
    for proj, slug in (c.get('tour360') or {}).items():
        if not os.path.exists(os.path.join(ROOT, 'proekty', proj + '.html')):
            errs.append(f'tour360.{proj}: немає сторінки proekty/{proj}.html')
        if slug and not tour_info(slug):
            errs.append(f'tour360.{proj}: немає туру tools/tours/tours/{slug}.json (python3 tools/tours/build.py new …)')
    vids = list(c.get('videos') or [])
    for rel, x in (c.get('extra') or {}).items():
        if not os.path.exists(os.path.join(ROOT, rel)):
            errs.append(f'extra: немає сторінки {rel}')
        vids += x.get('videos', [])
    errs += [f'videos: невірний ID {v.get("id")!r}' for v in vids if not YT_ID.match(v.get('id', ''))]
    ch = c.get('youtube_channel') or ''
    if ch and not YT_CH.match(ch):
        errs.append(f'youtube_channel: очікується https://www.youtube.com/@назва — {ch!r}')
    return c, errs


def lang_of(s):
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    return m.group(1) if m and m.group(1) in T else 'en'


def h1_name(s):
    return re.sub(r'<[^>]+>', '', (re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S) or [None, ''])[1]).strip()


def project_tour(s, slug, lang, show_all):
    t = T[lang]
    m = re.search(r'<h2>Фото проєкту</h2>.*?<img\b([^>]*)>', s, re.S) or re.search(r'<img\b([^>]*\bwidth="\d+"[^>]*)>', s)
    attrs = m.group(1) if m else ''
    g = lambda a, d: (re.search(r'\b' + a + r'="([^"]*)"', attrs) or [None, d])[1]
    src = re.sub(r'-400\.webp$', '-900.webp', g('src', '/img/map/office-800.webp'))
    name = h1_name(s)
    title = f'{t["tour"]} — {name}' if name else t['tour']
    more = f'<p style="margin:16px 0 0"><a href="/tury" style="color:var(--ac)">{e(t["all"])}</a></p>' if show_all else ''
    return ('\n<!--tour360--><section id="tur-360"><div class="w">\n'
            f'  <h2>{e(t["tour"])}</h2><p style="{LEAD}">{e(t["tour_p"])}</p>\n'
            f'  <div style="max-width:860px"><a class="lt3" href="/tury/{slug}" data-tour data-title="{e(title)}">'
            f'<img src="{e(src)}" width="{g("width", "900")}" height="{g("height", "600")}" loading="lazy" decoding="async" alt="{e(title)}">'
            f'<span class="lt3-b">{e(t["tour_btn"])}</span><span class="lt3-c">{e(name or title)}</span></a></div>{more}\n'
            f'</div></section>{ASSETS}<!--/tour360-->')


def video_block(videos, lang, chan):
    t = T[lang]
    items = []
    for v in videos:
        ti, vid = v.get('title') or 'CAS Development', v['id']
        items.append(f'<figure><a class="lyt" href="https://www.youtube.com/watch?v={vid}" data-yt="{vid}" data-title="{e(ti)}" target="_blank" rel="noopener" aria-label="{e(t["play"])}: {e(ti)}">'
                     f'<img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" width="480" height="360" loading="lazy" decoding="async" alt="{e(ti)}">'
                     f'<span class="lyt-b" aria-hidden="true">▶</span></a><figcaption>{e(ti)}</figcaption></figure>')
    more = f'<p style="margin:18px 0 0"><a href="{e(chan)}" target="_blank" rel="noopener" style="color:var(--ac)">{e(t["chan"])}</a></p>' if chan else ''
    return (f'\n<!--yt--><section id="video" style="{SEC}"><div style="max-width:1080px;margin:0 auto">\n'
            f'  <h2 style="{H2}">{e(t["vid"])}</h2><p style="{LEAD}">{e(t["vid_p"])}</p>\n'
            f'  <div class="vgrid">{"".join(items)}</div>{more}\n'
            f'</div></section>{ASSETS}<!--/yt-->')


def insert(s, blk, marks):
    for mark in marks:
        k = s.find(mark)
        if k >= 0:
            return s[:k].rstrip('\n') + blk + '\n' + s[k:]
    return s


def dedupe_assets(s):
    """Стилі/скрипт медіа — один раз на сторінку (лишаємо в першому блоці)."""
    first = s.find(ASSETS)
    if first < 0:
        return s
    end = first + len(ASSETS)
    return s[:end] + s[end:].replace(ASSETS, '')


def apply(s, rel, c, pub=None):
    lang = lang_of(s)
    s = BLOCKS.sub('', s)
    pub = public_tours() if pub is None else pub
    chan = c.get('youtube_channel') if YT_CH.match(c.get('youtube_channel') or '') else ''
    extra = (c.get('extra') or {}).get(rel, {})
    tail = ('<!--quiz-->', '<section id="zayavka"', '<section class="home-next"', '</main>')
    m = re.match(r'proekty/([\w-]+)\.html$', rel)
    slug = (c.get('tour360') or {}).get(m.group(1), '') if m else ''
    if slug and slug in pub:
        k = s.find('<section><div class="w">\n  <h2>Фото проєкту</h2>')
        blk = project_tour(s, slug, lang, bool(pub))
        s = s[:k].rstrip('\n') + blk + '\n' + s[k:] if k >= 0 else insert(s, blk, ('</main>',))
    vids = list(c.get('videos') or []) if rel in (c.get('video_pages') or []) else []
    vids = [v for v in vids + extra.get('videos', []) if YT_ID.match(v.get('id', ''))]
    if vids:
        s = insert(s, video_block(vids, lang, chan), tail)
    s = dedupe_assets(s)
    # sameAs Organization: Instagram, Google Maps + YouTube з конфігу (без дублів і старих адрес; Kuula не використовуємо)
    def same(mm):
        arr = [x for x in json.loads(mm.group(1)) if 'youtube.com' not in x and 'kuula.co' not in x]
        return '"sameAs": ' + json.dumps(arr + ([chan] if chan else []), ensure_ascii=False)
    s = re.sub(r'"sameAs": (\[[^\]]*\])', same, s)
    # /contact: рядок YouTube після Instagram
    if rel == 'contact.html' and chan:
        t = T[lang]
        row = f'<div><div class="dl">{e(t["yt"])}</div><div class="dv"><a href="{e(chan)}" target="_blank" rel="noopener">@{e(chan.rsplit("@", 1)[-1])}</a></div></div>'
        mm = re.search(r'<div><div class="dl">Instagram</div>.*?</div></div>', s)
        if mm:
            s = s[:mm.end()] + '\n<!--soc-->' + row + '<!--/soc-->' + s[mm.end():]
    return s


def pages():
    out = []
    for d in ('', 'ru/', 'en/', 'es/', 'zh/', 'pl/', 'de/', 'fr/', 'ar/', 'proekty/'):
        p = os.path.join(ROOT, d)
        if os.path.isdir(p):
            out += [d + f for f in sorted(os.listdir(p)) if f.endswith('.html')]
    return out


if __name__ == '__main__':
    c, errs = load()
    if errs:
        print('media.json:\n  ' + '\n  '.join(errs))
        sys.exit(1)
    check = '--check' in sys.argv
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import chrome  # ?v= для /assets/media.v1.* (versions)
    pub = public_tours()
    bad = []
    for rel in pages():
        p = os.path.join(ROOT, rel)
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel, c, pub)
        if n != s:
            n = chrome.versions(n)
        if n != s and n.replace(' ', ' ') == s.replace(' ', ' '):
            n = s  # відрізняється лише нерозривними пробілами (їх ставить chrome.nbsp_prices) — не чіпаємо
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Медіа: OK')
        sys.exit(1 if bad else 0)
    on = [k for k, v in (c.get('tour360') or {}).items() if v and v in pub]
    print(f'Медіа: оновлено {len(bad)} сторінок; турів 360° на проєктах: {len(on)} (відкритих турів у /tury: {len(pub)}), '
          f'відео: {len(c.get("videos") or [])}')
