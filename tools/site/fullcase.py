#!/usr/bin/env python3
"""Сторінки «Повний проєкт» (/proekty/<slug>-povnyi-proekt, /ru/proekty/<slug>-polnyy-proekt, /en/proekty/<slug>-full-project) з tools/site/cases/*.json.

  python3 tools/site/fullcase.py            # зібрати всі кейси (uk, ru, en — мови з JSON)
  python3 tools/site/fullcase.py --check    # лише перевірка (код 1, якщо HTML застарів або дані невірні)

Що на сторінці (лише блоки UI-kit лендингів — шаблон landing.TPL, шапка/футер — chrome.apply, форма — спільна form#of):
  hero (H1 і перше фото без анімації, одна fetchpriority="high"), «Коротко про проєкт», «Візуалізації», «Креслення»
  (підписи аркушів), «Від креслення до реалізації» (лише якщо є фото обʼєкта), «Що входить у повний дизайн-проєкт»
  (пакети landing.packages_html + посилання), «Ще про проєкт», заявка (data-source …#project).
Зум — наявний лайтбокс сторінок проєктів (.lb/#lb/#lbi, як на /proekty/*): посилання на велику копію, без JS сторінка
  просто відкриває файл. JSON-LD: BreadcrumbList, WebPage, CreativeWork, ImageGallery (ImageObject з підписами).
Зображення: img/p/<id>-600.webp (сітка) і <id>-1600.webp / -1280.webp (лайтбокс); AVIF — tools/img/build.py.
Правила матеріалів: креслення — лише поле аркуша без рамки штампа стороннього бюро; без даних клієнтів; «реалізовано»
  — лише з фото обʼєкта; хто будував — лише якщо підтверджено. hreflang — кластер "case-<id>" у tools/site/lang/clusters.json.
Після збірки: tools/blog/build.py (sitemap не чіпає), chrome.py, i18n.py --check — як у tools/build-all.sh.
"""
import glob, json, os, re, sys, datetime

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import landing  # шаблон, екранування, пакети, ORG, sitemap (tools/site/landing.py)
import chrome, i18n, leadform, ux

ROOT, B = landing.ROOT, landing.B
e, a = landing.e, landing.a
CASES = os.path.join(ROOT, 'tools/site/cases')

# лайтбокс як на /proekty/*.html (стилі .lb з /assets/proekt.v1.css + ui-polish) — тут інлайн, бо шаблон лендингу без proekt.v1.css
CSS = ('<style id="case">.gal a{display:block;color:inherit;text-decoration:none}.gal.dw img{object-fit:contain;background:#fff;padding:4px}'
       '.gal figcaption b{color:var(--ac);font-weight:600}.rz{margin:0 0 26px}.rz h3{font-size:var(--fs-h3);margin:0 0 12px}'
       '.hero .cover{display:block;width:100%;height:auto;margin:22px 0 0;border:1px solid var(--ln)}'
       '.lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;visibility:hidden;opacity:0;pointer-events:none;align-items:center;justify-content:center;z-index:10000;transition:opacity .25s ease,visibility 0s linear .25s}'
       '#lb.on{visibility:visible;opacity:1;pointer-events:auto;transition:opacity .25s ease}.lb img{max-width:96vw;max-height:90vh;background:#fff}'
       '.lb button{position:absolute;top:12px;right:12px;min-width:44px;min-height:44px;background:none;border:1px solid var(--ln);color:#EDE8DF;font-size:20px;border-radius:50%;cursor:pointer}'
       # ‹ › і лічильник — гортання всіх фото сторінки (як у галереях /proekty), RTL не потрібен (uk/ru/en)
       '.lb .lb-p,.lb .lb-n{top:50%;right:auto;left:12px;translate:0 -50%;width:48px;height:48px;background:rgba(8,7,9,.6);font-size:28px;line-height:1}.lb .lb-n{left:auto;right:12px}'
       '.lb-c{position:absolute;bottom:14px;left:50%;translate:-50% 0;padding:3px 10px;border-radius:999px;background:rgba(8,7,9,.72);color:#EDE8DF;font-size:var(--fs-small)}'
       '@media(max-width:599px){.lb .lb-p,.lb .lb-n{top:auto;bottom:6px;translate:none}}</style>\n')
JS = ("<script>function lbL(){return[].slice.call(document.querySelectorAll('.gal a[href^=\"/img/\"]'))}"
      "function lbs(l){var i=document.getElementById('lbi'),m=l.querySelector('img'),L=lbL(),c=document.getElementById('lbc');i.src=l.href;i.alt=m?m.alt:'';lb.o=l;"
      "if(c)c.textContent=(L.indexOf(l)+1)+' / '+L.length}"
      "function lb(l){var b=document.getElementById('lb');lbs(l);b.classList.add('on');b.querySelector('button').focus();return false}"
      "function lbg(d){var L=lbL(),k=L.indexOf(lb.o);if(k<0||!L.length)return;lbs(L[(k+d+L.length)%L.length])}"
      "function lbx(){var b=document.getElementById('lb');b.classList.remove('on');if(lb.o)lb.o.focus()}"
      "document.addEventListener('keydown',function(e){if(!document.getElementById('lb').classList.contains('on'))return;"
      "if(e.key==='Escape')lbx();else if(e.key==='ArrowLeft')lbg(-1);else if(e.key==='ArrowRight')lbg(1)});"
      "(function(){var x=null,b=document.getElementById('lb');if(!b)return;b.addEventListener('touchstart',function(e){x=e.touches[0].clientX},{passive:true});"
      "b.addEventListener('touchend',function(e){if(x===null)return;var d=e.changedTouches[0].clientX-x;x=null;if(Math.abs(d)>40)lbg(d<0?1:-1)},{passive:true})})();"
      "document.addEventListener('click',function(e){var l=e.target.closest&&e.target.closest('.gal a[href^=\"/img/\"]');"
      "if(l&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();lb(l)}});</script>\n")
NAV = {'uk': ('Попереднє фото', 'Наступне фото'), 'ru': ('Предыдущее фото', 'Следующее фото'), 'en': ('Previous photo', 'Next photo')}


def big(i):
    for w in (1600, 1280):
        if os.path.exists(os.path.join(ROOT, f'img/p/{i}-{w}.webp')):
            return f'img/p/{i}-{w}.webp'
    raise SystemExit(f'немає великої копії img/p/{i}-1600.webp')


def size(rel):
    return Image.open(os.path.join(ROOT, rel)).size


def fig(i, cap, alt, label=None):
    th = f'img/p/{i}-600.webp'
    w, h = size(th)
    lab = f'<b>{e(label)}</b> · ' if label else ''
    return (f'<figure><a href="/{big(i)}"><img src="/{th}" loading="lazy" width="{w}" height="{h}" alt="{a(alt)}"></a>'
            f'<figcaption>{lab}{e(cap)}</figcaption></figure>')


def path(c, lang):
    return i18n.meta(lang)['prefix'] + c[lang]['slug'] + '.html'


def url(c, lang):
    return B + i18n.meta(lang)['prefix'] + c[lang]['slug']


LANGS = ('uk', 'ru', 'en')  # мови кейсу — ті, що є в JSON (c[lang])


def k(lang):
    return LANGS.index(lang) + 1  # індекс підпису в [id, uk, ru, en]


def langs(c):
    return [l for l in LANGS if l in c]


def main_html(c, lang):
    t, n = c[lang], k(lang)
    cover = c['vis'][0][0]
    cw, ch = size(big(cover))
    o = ['<div class="w crumbs">' + ' / '.join(f'<a href="{u}"' + (' hreflang="uk"' if lang != 'uk' and not u.startswith('/' + lang + '/') else '') + f'>{e(x)}</a>'
                                             for u, x in t['crumbs']) + f' / {e(t["crumb"])}</div>',
         '<div class="w hero">', f'  <h1>{e(t["h1"])}</h1>', f'  <div class="price">{e(t["kicker"])}</div>', f'  <p>{e(t["lead"])}</p>',
         '  <div class="btns">', f'    <a class="btn main" href="tel:+380978667755">{e(t["btn_call"])}</a>', f'    <a class="btn" href="#zayavka">{e(t["btn_same"])}</a>', '  </div>',
         '  <div class="facts">' + ''.join(f'<div><b>{e(b)}</b><span>{e(s)}</span></div>' for b, s in t['facts']) + '</div>',
         f'  <img class="cover" src="/{big(cover)}" srcset="/img/p/{cover}-600.webp 600w, /{big(cover)} {cw}w" sizes="(max-width:767px) 100vw, 1100px" '
         f'fetchpriority="high" decoding="async" width="{cw}" height="{ch}" alt="{a(c["vis"][0][n] + t["alt"])}">',
         '</div>\n']
    s = t['short']
    o += ['<section><div class="w">', f'  <h2>{e(s["h2"])}</h2>',
          '  <div class="card">' + ''.join(f'<p><b>{e(x)}:</b> {e(y)}</p>' for x, y in s['rows'])
          + '<ul>' + ''.join(f'<li>{e(x)}</li>' for x in s['li']) + '</ul></div>', '</div></section>\n']
    o += ['<section id="vizualizatsii"><div class="w">', f'  <h2>{e(t["vis_h2"])}</h2>', f'  <p style="color:var(--mu);max-width:62ch;margin:0 0 22px">{e(t["vis_p"])}</p>',
          '  <div class="gal">' + ''.join(fig(x[0], x[n], x[n] + t['alt']) for x in c['vis']) + '</div>', '</div></section>\n']
    o += ['<section id="kreslennia"><div class="w">', f'  <h2>{e(t["dw_h2"])}</h2>', f'  <p style="color:var(--mu);max-width:62ch;margin:0 0 22px">{e(t["dw_p"])}</p>',
          '  <div class="gal dw">' + ''.join(fig(x[0], x[n], f'{t["lbl"]["d"]}: {x[n]}{t["alt"]}') for x in c['dw']) + '</div>', '</div></section>\n']
    if c.get('rz'):
        o += ['<section id="realizatsiia"><div class="w">', f'  <h2>{e(t["rz_h2"])}</h2>', f'  <p style="color:var(--mu);max-width:62ch;margin:0 0 22px">{e(t["rz_p"])}</p>']
        for r in c['rz']:
            o.append(f'  <div class="rz"><h3>{e(r["h"][n - 1])}</h3><div class="gal">'
                     + ''.join(fig(i, it[n + 1], f'{t["lbl"][kind]}: {it[n + 1]}{t["alt"]}', t['lbl'][kind]) for it in r['items'] for kind, i in [(it[0], it[1])]) + '</div></div>')
        if c.get('photos_extra'):
            o.append('  <div class="gal">' + ''.join(fig(x[0], x[n], f'{t["lbl"]["f"]}: {x[n]}{t["alt"]}', t['lbl']['f']) for x in c['photos_extra']) + '</div>')
        o.append('</div></section>\n')
    o += ['<section><div class="w txt">', f'  <h2>{e(t["inc_h2"])}</h2>', f'  <p>{e(t["inc_p"])}</p>',
          '  <div class="rel">' + ''.join(f'<a href="{u}">{e(x)}</a>' for u, x in t['inc_links']) + '</div>', '</div></section>\n']
    o.append(landing.packages_html(lang))
    o += ['<section><div class="w">', f'  <h2>{e(t["rel_h2"])}</h2>',
          '  <div class="rel">' + ''.join(f'<a href="{u}"' + (' hreflang="uk"' if lang != 'uk' and not u.startswith('/' + lang + '/') else '') + f'>{e(x)}</a>' for u, x in t['rel']) + '</div>',
          '</div></section>\n']
    return '\n'.join(o)


def ld(c, lang):
    t, n, u = c[lang], k(lang), url(c, lang)
    hl = i18n.meta(lang)['hreflang']
    crumbs = [{'@type': 'ListItem', 'position': j + 1, 'name': x, 'item': B.rstrip('/') + h} for j, (h, x) in enumerate(t['crumbs'])]
    crumbs.append({'@type': 'ListItem', 'position': len(crumbs) + 1, 'name': t['crumb'], 'item': u})
    imgs = [(x[0], x[n]) for x in c['vis']] + [(x[0], x[n]) for x in c['dw']]
    imgs += [(it[1], it[n + 1]) for r in c.get('rz', []) for it in r['items'] if it[0] == 'f'] + [(x[0], x[n]) for x in c.get('photos_extra', [])]
    seen, media = set(), []
    for i, cap in imgs:
        if i in seen: continue
        seen.add(i)  # компактно (бюджет HTML лендингу 64 КБ): автор і права — на рівні галереї
        media.append({'@type': 'ImageObject', 'contentUrl': B + big(i), 'caption': cap})
    g = [{'@type': 'BreadcrumbList', 'itemListElement': crumbs},
         {'@type': 'WebPage', '@id': u + '#page', 'url': u, 'name': t['title'], 'inLanguage': hl, 'description': t['description'],
          'isPartOf': {'@type': 'WebSite', '@id': B + '#site', 'url': B, 'name': 'CAS Development'}, 'primaryImageOfPage': media[0]['contentUrl'],
          'mainEntity': {'@id': u + '#work'}},
         {'@type': 'CreativeWork', '@id': u + '#work', 'name': t['h1'], 'url': u, 'inLanguage': hl, 'description': t['lead'],
          'creator': landing.ORG, 'image': [m['contentUrl'] for m in media[:6]], 'genre': t['kicker'],
          'isBasedOn': B.rstrip('/') + t['crumbs'][-1][0], 'hasPart': {'@id': u + '#gallery'}},
         {'@type': 'ImageGallery', '@id': u + '#gallery', 'name': f'{t["h1"]}: {t["vis_h2"]}, {t["dw_h2"]}', 'url': u, 'inLanguage': hl,
          'creator': {'@id': B + '#business'}, 'copyrightHolder': {'@id': B + '#business'}, 'associatedMedia': media}]
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False)


def og(c):
    """OG-картка 1200×630 з першої візуалізації (JPEG для соцмереж; робимо один раз)."""
    out = os.path.join(ROOT, c['og'])
    if not os.path.exists(out):
        im = Image.open(os.path.join(ROOT, big(c['vis'][0][0]))).convert('RGB')
        r = max(1200 / im.width, 630 / im.height)
        im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        l, t = (im.width - 1200) // 2, (im.height - 630) // 2
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.crop((l, t, l + 1200, t + 630)).save(out, 'JPEG', quality=82, optimize=True, progressive=True)
    return c['og']


def build(c, lang):
    t = c[lang]
    s = leadform.QUICK_RX.sub('', open(os.path.join(ROOT, landing.TPL[lang]), encoding='utf-8').read())
    if lang not in ('uk', 'ru'):  # нові мови: uk-шаблон з перекладом форми/панелі (як landing.build)
        s = landing.translate_tpl(i18n.html_attrs(ux.strip(s), lang), lang)
    u = url(c, lang)
    s = re.sub(r'<title>.*?</title>', f'<title>{e(landing.title_tag(t["title"]))}</title>', s, count=1)
    for key, v in (('name="description"', t['description']), ('property="og:title"', t['title']),
                   ('property="og:description"', t['description']), ('property="og:url"', u)):
        s = re.sub(r'(<meta ' + key + r' content=")[^"]*', lambda m: m.group(1) + a(v), s, count=1)
    s = re.sub(r'(<meta property="og:image" content=")[^"]*', lambda m: m.group(1) + B + og(c), s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + u, s, count=1)
    s = re.sub(r'<link rel="alternate" hreflang[^>]*>\n', '', s)
    members = i18n.cluster_of(u.replace(B.rstrip('/'), ''))
    assert members is not None, f'немає кластера для {u} у tools/site/lang/clusters.json'
    s = i18n.set_alternates(s, members)
    s = re.sub(r'(<script type="application/ld\+json">\n?).*?(\n?</script>)', lambda m: m.group(1) + ld(c, lang).replace('</', '<\\/') + m.group(2), s, count=1, flags=re.S)
    s, nn = re.subn(r'(<main\b[^>]*>)\n.*?(<section id="zayavka">)', lambda m: m.group(1) + '\n' + main_html(c, lang) + m.group(2), s, count=1, flags=re.S)
    assert nn == 1
    s = re.sub(r'(<section id="zayavka"><div class="w">\s*<h2(?: data-i="\w+")?>)[^<]*', lambda m: m.group(1) + e(t['form_h2']), s, count=1)
    s = re.sub(r'data-service="[^"]*"', f'data-service="{a(t["service"])}"', s, count=1)
    s = re.sub(r'data-source="[^"]*"', 'data-source="cas-develop.com/' + i18n.meta(lang)['prefix'] + t['slug'] + '#project"', s, count=1)
    s = leadform.apply(s, path(c, lang))
    s = s.replace('</head>', CSS + '</head>', 1)
    lbox = (f'<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="{a(t["lb_label"])}" onclick="if(event.target===this)lbx()">'
            f'<img id="lbi" alt=""><button type="button" onclick="lbx()" aria-label="{a(t["close"])}">✕</button>'
            f'<button type="button" class="lb-p" onclick="lbg(-1)" aria-label="{a(NAV[lang][0])}">‹</button>'
            f'<button type="button" class="lb-n" onclick="lbg(1)" aria-label="{a(NAV[lang][1])}">›</button><span class="lb-c" id="lbc" aria-live="polite"></span></div>\n' + JS)
    s = s.replace('<!--/chrome:f-->', '<!--/chrome:f-->\n' + lbox, 1) if '<!--/chrome:f-->' in s else s.replace('</body>', lbox + '</body>', 1)
    return chrome.apply(s, path(c, lang))


def check_data(c):
    errs = []
    txt = json.dumps(c, ensure_ascii=False)
    if re.search(r'osocor|осокор|osokork|aqulla', txt, re.I): errs.append('сторонній бренд / Osocor у тексті')
    for lang in langs(c):
        t = c[lang]
        if len(t['description']) > 160: errs.append(f'{lang}: description > 160')
        for h in re.findall(r'"(/[a-z0-9/-]*)"', json.dumps(t, ensure_ascii=False)):
            if not i18n.exists(h): errs.append(f'{lang}: посилання на неіснуючу сторінку {h}')
    for x in c['vis'] + c['dw'] + c.get('photos_extra', []):
        if not os.path.exists(os.path.join(ROOT, f'img/p/{x[0]}-600.webp')): errs.append('нема img/p/' + x[0])
    return errs


def run(check=False):
    bad, built = 0, []
    for f in sorted(glob.glob(os.path.join(CASES, '*.json'))):
        c = json.load(open(f, encoding='utf-8'))
        errs = check_data(c)
        if errs:
            print('❌', c['id'], errs); bad = 1; continue
        for lang in langs(c):
            rel = path(c, lang)
            s = build(c, lang)
            full = os.path.join(ROOT, rel)
            old = open(full, encoding='utf-8').read() if os.path.exists(full) else None
            if check:
                if old != s:
                    print('застаріло:', rel); bad = 1
                continue
            if old != s:
                os.makedirs(os.path.dirname(full), exist_ok=True)
                open(full, 'w', encoding='utf-8').write(s)
                print('✓', rel)
            built.append(url(c, lang))
    if not check and built:
        landing.sitemap(built, datetime.date.today().isoformat())
    return bad


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(run(True))
    run()  # перший прохід створює нові файли кластера,
    sys.exit(run())  # другий — дописує hreflang на щойно створені пари
