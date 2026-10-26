#!/usr/bin/env python3
"""Медіа сайту з tools/site/media.json: тури 360° (Kuula), відео YouTube, соцмережі (YouTube, Kuula) у sameAs і на /contact.

  python3 tools/site/media.py            # оновити сторінки (ідемпотентно)
  python3 tools/site/media.py --check    # лише перевірка: код 1, якщо щось не оновлено або конфіг невірний

Компоненти UI-kit — /styleguide/#media; поведінка — /assets/media.v1.js, стилі — /assets/media.v1.css:
  • tour360[slug] = "https://kuula.co/share/…" → на /proekty/<slug> секція «Віртуальний тур 360°» перед «Фото проєкту»
    (постер — перше фото галереї + кнопка; iframe kuula.co — лише по кліку, у модальному вікні). Порожній URL — секції немає.
  • tours (без "project") → блок «Віртуальні тури 360°» на tour_pages + посилання на профіль Kuula.
  • videos → блок «Відео з обʼєктів» (lite-embed: постер i.ytimg.com, iframe youtube-nocookie.com лише по кліку) на video_pages;
    extra[сторінка] = {"tours": [id], "videos": [...]} — ті самі блоки на окремих сторінках, де назва явно збігається.
  • youtube_channel, kuula_profile → "sameAs" JSON-LD Organization (усі сторінки, де він є) і рядки на /contact;
    посилання-іконки у футері ставить chrome.py (SOCIAL).
Блоки — між <!--tour360-->, <!--tours-->, <!--yt-->, <!--soc--> і відповідними <!--/…-->. CSP (_headers): frame-src
https://kuula.co https://www.youtube-nocookie.com, img-src https: (i.ytimg.com, files.kuula.io).
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CFG = os.path.join(ROOT, 'tools/site/media.json')
KUULA = re.compile(r'^https://kuula\.co/share/[A-Za-z0-9_\-/]+(\?[A-Za-z0-9_\-=&.%]*)?$')
KUULA_ID = re.compile(r'^[A-Za-z0-9]{5,8}$')
KUULA_PROF = re.compile(r'^https://kuula\.co/profile/[A-Za-z0-9_.\-]+$')
UUID = re.compile(r'^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$')
YT_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
YT_CH = re.compile(r'^https://www\.youtube\.com/(@[A-Za-z0-9_.\-]+|channel/UC[A-Za-z0-9_-]{22})$')
BLOCKS = re.compile(r'\n?<!--(tour360|tours|yt|soc)-->.*?<!--/\1-->', re.S)
ASSETS = '<link rel="stylesheet" href="/assets/media.v1.css"><script src="/assets/media.v1.js" defer></script>'

T = {
    'uk': dict(tour='Віртуальний тур 360°', tours='Віртуальні тури 360°', tour_btn='Відкрити тур 360°',
               tour_p='Пройдіться обʼєктом самостійно: панорами 360° відкриваються у вікні на цій сторінці.',
               prof='Усі тури CAS на Kuula →', vid='Відео з обʼєктів', vid_p='Відео з нашого каналу YouTube.',
               chan='Канал CAS на YouTube →', play='Відтворити відео', yt='YouTube', ku='Тури 360° (Kuula)'),
    'ru': dict(tour='Виртуальный тур 360°', tours='Виртуальные туры 360°', tour_btn='Открыть тур 360°',
               tour_p='Пройдитесь по объекту сами: панорамы 360° открываются в окне на этой странице.',
               prof='Все туры CAS на Kuula →', vid='Видео с объектов', vid_p='Видео с нашего канала YouTube.',
               chan='Канал CAS на YouTube →', play='Смотреть видео', yt='YouTube', ku='Туры 360° (Kuula)'),
    'en': dict(tour='Virtual 360° tour', tours='Virtual 360° tours', tour_btn='Open the 360° tour',
               tour_p='Walk through the space yourself: 360° panoramas open in a window on this page.',
               prof='All CAS tours on Kuula →', vid='Videos from our sites', vid_p='Videos from our YouTube channel.',
               chan='CAS on YouTube →', play='Play video', yt='YouTube', ku='360° tours (Kuula)'),
}
e = lambda s: html.escape(s, quote=True)
H2 = 'font-family:\'Cormorant Garamond\',\'Cormorant Fallback\',Georgia,serif;font-weight:300;font-size:var(--fs-h2);line-height:1.15;margin:0 0 10px'
SEC = 'padding:56px 16px;border-top:1px solid var(--ln,rgba(191,145,72,.18))'
LEAD = 'color:var(--mu);margin:0 0 22px;max-width:60ch'


def load():
    c = json.load(open(CFG, encoding='utf-8'))
    errs = []
    for slug, url in (c.get('tour360') or {}).items():
        if url and not KUULA.match(url):
            errs.append(f'tour360.{slug}: не схоже на https://kuula.co/share/… — {url!r}')
        if not os.path.exists(os.path.join(ROOT, 'proekty', slug + '.html')):
            errs.append(f'tour360.{slug}: немає сторінки proekty/{slug}.html')
    ids = set()
    for t in c.get('tours') or []:
        if not KUULA_ID.match(t.get('id', '')) or not UUID.match(t.get('cover', '')):
            errs.append(f'tours: невірний id/cover {t!r}')
        ids.add(t.get('id'))
    vids = list(c.get('videos') or [])
    for rel, x in (c.get('extra') or {}).items():
        if not os.path.exists(os.path.join(ROOT, rel)):
            errs.append(f'extra: немає сторінки {rel}')
        errs += [f'extra.{rel}: невідомий тур {i}' for i in x.get('tours', []) if i not in ids]
        vids += x.get('videos', [])
    errs += [f'videos: невірний ID {v.get("id")!r}' for v in vids if not YT_ID.match(v.get('id', ''))]
    ch, kp = c.get('youtube_channel') or '', c.get('kuula_profile') or ''
    if ch and not YT_CH.match(ch):
        errs.append(f'youtube_channel: очікується https://www.youtube.com/@назва — {ch!r}')
    if kp and not KUULA_PROF.match(kp):
        errs.append(f'kuula_profile: очікується https://kuula.co/profile/назва — {kp!r}')
    return c, errs


def lang_of(s):
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    return m.group(1) if m and m.group(1) in T else 'en'


def h1_name(s):
    return re.sub(r'<[^>]+>', '', (re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S) or [None, ''])[1]).strip()


def tour_card(url, title, src, w, h, t):
    return (f'<a class="lt3" href="{e(url)}" data-kuula data-title="{e(title)}" target="_blank" rel="noopener">'
            f'<img src="{e(src)}" width="{w}" height="{h}" loading="lazy" decoding="async" alt="{e(title)}">'
            f'<span class="lt3-b"><span aria-hidden="true">360°</span>{e(t["tour_btn"])}</span><span class="lt3-c">{e(title)}</span></a>')


def project_tour(s, url, lang):
    t = T[lang]
    m = re.search(r'<h2>Фото проєкту</h2>.*?<img\b([^>]*)>', s, re.S) or re.search(r'<img\b([^>]*\bwidth="\d+"[^>]*)>', s)
    attrs = m.group(1) if m else ''
    g = lambda a, d: (re.search(r'\b' + a + r'="([^"]*)"', attrs) or [None, d])[1]
    src = re.sub(r'-400\.webp$', '-900.webp', g('src', '/img/map/office-800.webp'))
    name = h1_name(s)
    title = f'{t["tour"]} — {name}' if name else t['tour']
    return ('\n<!--tour360--><section id="tur-360"><div class="w">\n'
            f'  <h2>{e(t["tour"])}</h2><p style="{LEAD}">{e(t["tour_p"])}</p>\n'
            f'  <div style="max-width:860px">{tour_card(url, title, src, g("width", "900"), g("height", "600"), t)}</div>\n'
            f'</div></section>{ASSETS}<!--/tour360-->')


def tours_block(tours, lang, prof):
    t = T[lang]
    cards = ''.join(f'<figure>{tour_card("https://kuula.co/share/collection/" + x["id"], x["name"], "https://files.kuula.io/" + x["cover"] + "/01-cover.jpg", 640, 640, t)}</figure>'
                    for x in tours)
    more = f'<p style="margin:18px 0 0"><a href="{e(prof)}" target="_blank" rel="noopener" style="color:var(--ac)">{e(t["prof"])}</a></p>' if prof else ''
    return (f'\n<!--tours--><section id="tury-360" style="{SEC}"><div style="max-width:1080px;margin:0 auto">\n'
            f'  <h2 style="{H2}">{e(t["tours"])}</h2><p style="{LEAD}">{e(t["tour_p"])}</p>\n'
            f'  <div class="vgrid">{cards}</div>{more}\n'
            f'</div></section>{ASSETS}<!--/tours-->')


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


def apply(s, rel, c):
    lang = lang_of(s)
    s = BLOCKS.sub('', s)
    chan = c.get('youtube_channel') if YT_CH.match(c.get('youtube_channel') or '') else ''
    prof = c.get('kuula_profile') if KUULA_PROF.match(c.get('kuula_profile') or '') else ''
    by_id = {x['id']: x for x in c.get('tours') or []}
    extra = (c.get('extra') or {}).get(rel, {})
    # перед квізом / формою заявки / наступним кроком головної / кінцем <main>
    tail = ('<!--quiz-->', '<section id="zayavka"', '<section class="home-next"', '</main>')
    m = re.match(r'proekty/([\w-]+)\.html$', rel)
    url = (c.get('tour360') or {}).get(m.group(1), '') if m else ''
    if url and KUULA.match(url):
        k = s.find('<section><div class="w">\n  <h2>Фото проєкту</h2>')
        blk = project_tour(s, url, lang)
        s = s[:k].rstrip('\n') + blk + '\n' + s[k:] if k >= 0 else insert(s, blk, ('</main>',))
    tours = [x for x in c.get('tours') or [] if not x.get('project')] if rel in (c.get('tour_pages') or []) else []
    tours += [by_id[i] for i in extra.get('tours', []) if i in by_id]
    if tours:
        s = insert(s, tours_block(tours, lang, prof), tail)
    vids = list(c.get('videos') or []) if rel in (c.get('video_pages') or []) else []
    vids += extra.get('videos', [])
    vids = [v for v in vids if YT_ID.match(v.get('id', ''))]
    if vids:
        # відео — перед блоком турів (якщо він є), інакше там само
        s = insert(s, video_block(vids, lang, chan), ('<!--tours-->',) + tail)
    s = dedupe_assets(s)
    # sameAs Organization: Instagram, Google Maps + YouTube і Kuula з конфігу (без дублів і старих адрес)
    def same(mm):
        arr = [x for x in json.loads(mm.group(1)) if 'youtube.com' not in x and 'kuula.co' not in x]
        arr += [x for x in (chan, prof) if x]
        return '"sameAs": ' + json.dumps(arr, ensure_ascii=False)
    s = re.sub(r'"sameAs": (\[[^\]]*\])', same, s)
    # /contact: рядки YouTube і Kuula після Instagram
    if rel == 'contact.html' and (chan or prof):
        t = T[lang]
        rows = ''.join(f'<div><div class="dl">{e(n)}</div><div class="dv"><a href="{e(u)}" target="_blank" rel="noopener">{e(lbl)}</a></div></div>'
                       for n, u, lbl in ((t['yt'], chan, '@' + chan.rsplit('@', 1)[-1] if '@' in chan else 'YouTube'),
                                         (t['ku'], prof, prof.rsplit('/', 1)[-1])) if u)
        mm = re.search(r'<div><div class="dl">Instagram</div>.*?</div></div>', s)
        if mm:
            s = s[:mm.end()] + '\n<!--soc-->' + rows + '<!--/soc-->' + s[mm.end():]
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
    bad = []
    for rel in pages():
        p = os.path.join(ROOT, rel)
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel, c)
        if n != s:
            n = chrome.versions(n)
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Медіа: OK')
        sys.exit(1 if bad else 0)
    print(f'Медіа: оновлено {len(bad)} сторінок; турів 360° на проєктах: {sum(1 for v in (c.get("tour360") or {}).values() if v)}, '
          f'турів у блоці: {len(c.get("tours") or [])}, відео: {len(c.get("videos") or [])}')
