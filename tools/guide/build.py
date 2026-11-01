#!/usr/bin/env python3
"""Лід-магніт «Гід з цінами на ремонт і дизайн 2026» (PDF, uk + ru) і блоки його отримання на сторінках.

  python3 tools/guide/build.py pdf      # HTML (tools/guide/content.py) → PDF через Playwright (Chromium) у assets/guide/
  python3 tools/guide/build.py html     # лише HTML для перегляду: tools/guide/out/guide-<мова>.html (не комітимо)
  python3 tools/guide/build.py          # вставити/оновити блоки на сторінках (деплой: tools/build-all.sh)
  python3 tools/guide/build.py --check  # лише перевірка блоків (код 1, якщо щось не оновлено)

Сторінки: вартість ремонту квартири, дизайну, будинку, офісу, калькулятор (uk + ru) — перед формою <section id="zayavka">;
статті блогу про ціни (slug: skilky-koshtuie|skolko-stoit|biudzhet|byudzhet|koshtorys|smetu) — перед кінцевим CTA.
У HTML — лише місце <div class="gd-slot" data-pdf="/assets/guide/<файл>.pdf?v=<хеш>"></div> (~90 байтів: лендинги на межі
бюджету 64 КБ); форму будує /assets/lead-form.v1.js: лише телефон, data-form="guide", data-service «Гід з цінами»,
data-source …#guide; після 2xx — кнопка «Завантажити гід» і «Менеджер також надішле його в Telegram/Viber». Без поп-апів.
Стилі блоку — /assets/site-chrome.v1.css («Лід-магніт»). PDF у пошук не потрапляє: X-Robots-Tag noindex у _headers.
Шрифти PDF — лише власні з /fonts (Cormorant Garamond + Manrope), фото — з img/p (проєкти CAS).
PDF містить дату створення, тому перегенеровуємо лише після зміни текстів (команда pdf), а ?v= береться з хешу файлу.
"""
import glob, hashlib, html, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from content import C, AREAS, RATES, DESIGN_MIN  # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'guide')
PAGES = {
    'uk': ['vartist-remontu-kvartyry-kyiv.html', 'vartist-dyzainu-interieru-kyiv.html', 'vartist-budivnytstva-budynku-kyiv.html',
           'vartist-remontu-ofisu-kyiv.html', 'kalkuliator-remontu.html'],
    'ru': ['ru/stoimost-remonta-kvartiry-kiev.html', 'ru/stoimost-dizayna-interera-kiev.html', 'ru/stoimost-stroitelstva-doma-kiev.html',
           'ru/stoimost-remonta-ofisa-kiev.html', 'ru/kalkulyator-remonta.html'],
}
BLOG = {'uk': 'blog/*.html', 'ru': 'ru/blog/*.html'}
BLOG_RX = re.compile(r'skilky-koshtuie|skolko-stoit|biudzhet|byudzhet|koshtorys|smetu')
SLOT_RX = re.compile(r'<div class="gd-slot"[^>]*></div>\n?')
COVER = 'img/p/1DL1BY7Tg6L5B5-900.webp'   # Edelweiss — вітальня з кухнею (проєкт CAS)
HOUSE = 'img/p/1F4OovwNYQPfoF-900.webp'   # будинок (проєкт CAS, сторінка вартості будівництва)

# нерозривні пробіли в сумах ($1 100, 150 × $600), щоб цифри не розривались між рядками
e = lambda s: re.sub(r'(\$\d+) (\d{3})|(\d) × ', lambda m: (m.group(1) + '\u00a0' + m.group(2)) if m.group(1) else m.group(3) + '\u00a0× ', html.escape(str(s), quote=False))


def money(n):
    return '$' + f'{n:,}'.replace(',', ' ')


def pdf_url(lang):
    f = os.path.join(OUT, C[lang]['file'])
    v = hashlib.sha1(open(f, 'rb').read()).hexdigest()[:8]
    return f'/assets/guide/{C[lang]["file"]}?v={v}'


# ---------------------------------------------------------------- HTML гіда
FONTS = [('Manrope', 'normal', '200 800', 'manrope-{}.woff2'), ('Cormorant Garamond', 'normal', '300 700', 'cormorant-{}.woff2'),
         ('Cormorant Garamond', 'italic', '300 700', 'cormorant-italic-{}.woff2')]
RANGES = {'cyrillic': 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
          'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
          'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'}


WEIGHTS = {('Manrope', 'normal'): (400, 600, 700), ('Cormorant Garamond', 'normal'): (300, 400, 500), ('Cormorant Garamond', 'italic'): (300,)}


def font_css():
    """@font-face зі статичних копій шрифтів /fonts (fontTools instancer): змінні шрифти Chromium вбудовує в PDF як Type 3
    (≈ +900 КБ), статичні — як TrueType-підмножини. Копії — у tools/guide/out/fonts (не комітимо)."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    d = os.path.join(HERE, 'out', 'fonts')
    os.makedirs(d, exist_ok=True)
    o = ''
    for fam, st, _, pat in FONTS:
        for sub, rng in RANGES.items():
            src = os.path.join(ROOT, 'fonts', pat.format(sub))
            if not os.path.exists(src):
                continue
            for w in WEIGHTS[(fam, st)]:
                dst = os.path.join(d, f'{os.path.basename(src)[:-6]}-{w}.ttf')
                if not os.path.exists(dst):
                    f = TTFont(src)
                    f.flavor = None
                    if 'fvar' in f:
                        f = instancer.instantiateVariableFont(f, {'wght': w}, updateFontNames=False)
                    f.save(dst)
                o += f'@font-face{{font-family:"{fam}";font-style:{st};font-weight:{w};src:url("file://{dst}") format("truetype");unicode-range:{rng}}}\n'
    return o


CSS = """
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:Manrope,sans-serif;color:#1d1915;font-size:10.2pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{position:relative;width:210mm;height:297mm;padding:17mm 16mm 20mm;background:#F7F3EC;overflow:hidden;page-break-after:always;break-after:page}
.pg:last-child{page-break-after:auto;break-after:auto}
.dark{background:#080709;color:#EDE8DF}
h1,h2,h3{font-family:"Cormorant Garamond",serif;font-weight:400;line-height:1.08;margin:0}
h2{font-size:30pt;margin:0 0 4mm}
h3{font-size:15pt;font-weight:500;margin:0 0 2.5mm}
p{margin:0 0 3mm}
.k{font-size:7.6pt;letter-spacing:.2em;text-transform:uppercase;color:#9A7334;font-weight:700;margin:0 0 3mm}
.dark .k{color:#BF9148}
.lead{font-size:11pt;color:#4c443c;max-width:160mm;margin-bottom:6mm}
.mu{color:#7a7066}.sm{font-size:8.4pt;line-height:1.45}
.ac{color:#9A7334}
.foot{position:absolute;left:16mm;right:16mm;bottom:9mm;display:flex;justify-content:space-between;font-size:7.6pt;color:#8a8076;border-top:.3mm solid rgba(154,115,52,.35);padding-top:2.5mm}
.dark .foot{color:#938c84;border-color:rgba(191,145,72,.3)}
.logo{font-family:"Cormorant Garamond",serif;font-size:17pt;letter-spacing:.02em}.logo em{color:#BF9148;font-style:normal}
/* обкладинка */
.cv{padding:16mm}
.cv-img{position:absolute;left:0;right:0;top:0;height:150mm;background-size:cover;background-position:center}
.cv-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,7,9,.35) 0%,rgba(8,7,9,0) 35%,rgba(8,7,9,.6) 75%,#080709 100%)}
.cv-top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
.cv-top .k{margin:0;color:#EDE8DF}
.cv-body{position:absolute;left:16mm;right:16mm;top:132mm;z-index:2}
.cv h1{font-size:46pt;line-height:1.0;font-weight:300;margin:0 0 6mm;max-width:170mm}
.cv h1 b{font-weight:300;color:#BF9148;font-style:italic}
.cv-sub{font-size:12pt;color:#cfc7bb;max-width:150mm;margin-bottom:12mm}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;border-top:.3mm solid rgba(191,145,72,.45);padding-top:6mm}
.facts b{display:block;font-family:"Cormorant Garamond",serif;font-weight:400;font-size:24pt;color:#BF9148;line-height:1}
.facts span{display:block;font-size:8.2pt;color:#b7afa4;margin-top:1.5mm}
.cv-ed{position:absolute;left:16mm;right:16mm;bottom:12mm;font-size:8pt;color:#938c84;z-index:2}
/* формула */
.formula{display:flex;align-items:center;gap:4mm;background:#080709;color:#EDE8DF;border-radius:3mm;padding:7mm 8mm;margin:0 0 7mm}
.formula b{font-family:"Cormorant Garamond",serif;font-size:24pt;font-weight:400;color:#BF9148}
.formula .op{font-size:20pt;color:#938c84}
.formula span.t{display:inline-block;border:.3mm solid rgba(191,145,72,.55);border-radius:2mm;padding:2.5mm 4mm;font-size:11pt}
table{width:100%;border-collapse:collapse}
th,td{padding:2.6mm 2.4mm;border-bottom:.3mm solid rgba(154,115,52,.28);text-align:left;vertical-align:top}
th{font-size:7.8pt;letter-spacing:.12em;text-transform:uppercase;color:#7a7066;font-weight:600}
td.n,th.n{text-align:right;white-space:nowrap}
td b{font-weight:700}
.tab-rates td:first-child{font-weight:600;width:44%}
.tab-rates td{font-size:10.5pt}
.tab-rates td.n{white-space:pre-line;color:#1d1915}
.tab-rates td.eu{color:#9A7334}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm}
.box{border:.3mm solid rgba(154,115,52,.35);border-radius:2.5mm;padding:5mm 5.5mm;background:#FBF8F3}
.box.hl{border-color:#BF9148;background:#fff}
ul.l{list-style:none;padding:0;margin:0}
ul.l li{position:relative;padding:1.1mm 0 1.1mm 5.5mm;border-top:.25mm solid rgba(154,115,52,.18)}
ul.l li:first-child{border-top:0}
ul.l li::before{content:"";position:absolute;left:0;top:3.1mm;width:2mm;height:2mm;border-radius:50%;background:#BF9148}
ul.l.no li::before{background:none;border:.35mm solid #9A7334}
.ex{margin-top:6mm}
.ex td{font-size:10pt}
.ex tr.tot td{border-bottom:0;font-weight:700;font-size:11.5pt;color:#9A7334}
.notes{margin-top:6mm;padding-left:0;list-style:none}
.notes li{font-size:8.6pt;color:#5d544b;padding:1.2mm 0 1.2mm 5mm;position:relative}
.notes li::before{content:"—";position:absolute;left:0;color:#9A7334}
/* пакети */
.pkt th{text-align:center;font-family:"Cormorant Garamond",serif;font-size:13pt;letter-spacing:0;text-transform:none;color:#1d1915;font-weight:500;line-height:1.1;vertical-align:bottom}
.pkt th small{display:block;font-family:Manrope,sans-serif;font-size:8.6pt;color:#9A7334;font-weight:700;margin-top:1.5mm}
.pkt th:first-child{width:46%}
.pkt td{font-size:9.6pt}
.pkt td.c{text-align:center;font-weight:700;color:#9A7334;font-size:12pt}
.pkt td.c.o{color:#c4bab0;font-weight:400}
.pkt .mid{background:rgba(191,145,72,.09)}
/* будинок */
.hs-img{height:44mm;border-radius:2.5mm;background-size:cover;background-position:center;margin:0 0 6mm}
.cols3 .box{padding:4mm 4.5mm}.cols3 .box li{font-size:9pt}
.price{font-family:"Cormorant Garamond",serif;font-size:15pt;color:#9A7334;margin:0 0 2.5mm}
/* етапи */
ol.st{list-style:none;padding:0;margin:0 0 7mm;display:grid;grid-template-columns:repeat(3,1fr);gap:3.5mm;counter-reset:s}
ol.st li{counter-increment:s;border:.3mm solid rgba(154,115,52,.35);border-radius:2.5mm;padding:4mm;background:#FBF8F3}
ol.st li::before{content:counter(s,decimal-leading-zero);display:block;font-family:"Cormorant Garamond",serif;font-size:18pt;color:#BF9148;line-height:1;margin-bottom:1.5mm}
ol.st b{display:block;margin-bottom:1mm}
ol.st span{font-size:8.8pt;color:#5d544b}
.pay{display:grid;grid-template-columns:repeat(4,1fr);gap:3.5mm;margin-bottom:7mm}
.pay div{border-top:.6mm solid #BF9148;padding-top:3mm}
.pay b{display:block;font-family:"Cormorant Garamond",serif;font-size:17pt;font-weight:500;margin-bottom:1mm}
.pay span{font-size:8.6pt;color:#5d544b}
.gr{display:grid;grid-template-columns:repeat(4,1fr);gap:3.5mm;background:#080709;border-radius:3mm;padding:6mm}
.gr b{display:block;font-family:"Cormorant Garamond",serif;font-size:19pt;color:#BF9148;font-weight:400;line-height:1.05;margin-bottom:1.5mm}
.gr span{font-size:8.4pt;color:#cfc7bb}
/* чекліст */
.cl{display:grid;grid-template-columns:1fr 1fr;gap:5mm 7mm}
.cl h3{font-size:13.5pt;border-bottom:.4mm solid #BF9148;padding-bottom:1.5mm;margin-bottom:2mm}
.cl ul{list-style:none;padding:0;margin:0}
.cl li{position:relative;padding:1.4mm 0 1.4mm 7mm;font-size:9.4pt}
.cl li::before{content:"";position:absolute;left:0;top:1.9mm;width:3.6mm;height:3.6mm;border:.35mm solid #9A7334;border-radius:.6mm;background:#fff}
/* контакти */
.kt{padding:22mm 16mm}
.kt h2{font-size:44pt;font-weight:300;margin:10mm 0 5mm}
.kt .lead{color:#cfc7bb;font-size:13pt}
.kt table td{border-color:rgba(191,145,72,.25);font-size:12pt;padding:4mm 0;color:#EDE8DF}
.kt table td:first-child{color:#938c84;font-size:9pt;letter-spacing:.14em;text-transform:uppercase;width:62mm}
.kt a{color:#EDE8DF;text-decoration:none}
.kt .ftx{margin-top:12mm;color:#BF9148;font-size:10pt}
.kt .sm{position:absolute;left:16mm;right:16mm;bottom:22mm;color:#938c84}
"""


def foot(d, n):
    return f'<div class="foot"><span>CAS Development · {e(d["title"])}</span><span>{d["page"]} {n}</span></div>'


def li(items, cls='l'):
    return f'<ul class="{cls}">' + ''.join(f'<li>{e(x)}</li>' for x in items) + '</ul>'


def img_url(rel):
    """Фото для PDF — JPEG (Chromium вбудовує JPEG як є; WebP перекодовує без втрат — PDF ×5 більший)."""
    from PIL import Image
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    dst = os.path.join(HERE, 'out', os.path.basename(rel).rsplit('.', 1)[0] + '.jpg')
    Image.open(os.path.join(ROOT, rel)).convert('RGB').save(dst, 'JPEG', quality=72, optimize=True, progressive=True)
    return 'file://' + dst


def render(lang):
    d = C[lang]
    pages = []
    # 1 — обкладинка
    t = e(d['title']).replace(' 2026', ' <b>2026</b>')
    pages.append(
        f'<section class="pg dark cv"><div class="cv-img" style="background-image:url(\'{img_url(COVER)}\')"></div>'
        f'<div class="cv-top"><span class="logo">CAS<em>.</em>Development</span><span class="k">{e(d["cover_kicker"])}</span></div>'
        f'<div class="cv-body"><h1>{t}</h1><p class="cv-sub">{e(d["cover_sub"])}</p><div class="facts">'
        + ''.join(f'<div><b>{e(b)}</b><span>{e(s)}</span></div>' for b, s in d['cover_facts'])
        + f'</div></div><p class="cv-ed">{e(d["edition"])}</p></section>')
    # 2 — формула
    f0, f1, f2 = d['f_formula']
    head = f'<tr><th>{e(d["f_area"])}</th>' + ''.join(f'<th class="n">{a} м²</th>' for a in AREAS) + '</tr>'
    body = ''
    for k, r in RATES.items():
        body += f'<tr><td>{e(d["f_rows"][k])}</td>' + ''.join(
            f'<td class="n">{d["f_pre"]} <b>{money(max(a * r, DESIGN_MIN) if k == "design" else a * r)}</b></td>' for a in AREAS) + '</tr>'
    ex = ''.join(f'<tr><td>{e(a)}</td><td class="mu">{e(b)}</td><td class="n"><b>{e(c)}</b></td></tr>' for a, b, c in d['f_ex'])
    ex += f'<tr class="tot"><td>{e(d["f_ex_total"][0])}</td><td></td><td class="n">{e(d["f_ex_total"][1])}</td></tr>'
    pages.append(
        f'<section class="pg"><p class="k">01</p><h2>{e(d["f_h"])}</h2><p class="lead">{e(d["f_lead"])}</p>'
        f'<div class="formula"><b>{e(f0)}</b><span class="op">≈</span><span class="t">{e(f1)}</span><span class="op">×</span><span class="t">{e(f2)}</span></div>'
        f'<h3>{e(d["f_tab_h"])}</h3><table><thead>{head}</thead><tbody>{body}</tbody></table>'
        f'<div class="cols2 ex"><div><h3>{e(d["f_ex_h"])}</h3><table>{ex}</table><p class="sm mu" style="margin-top:2mm">{e(d["f_ex_note"])}</p></div>'
        f'<div><div class="box" style="margin-bottom:4mm"><h3>{e(d["f_dep_h"])}</h3>{li(d["f_dep"])}</div>'
        f'<div class="box hl"><h3>{e(d["f_how_h"])}</h3>{li(d["f_how"])}</div></div></div>{foot(d, 2)}</section>')
    # 3 — ставки Київ / Європа
    rows = ''.join(f'<tr><td>{e(a)}</td><td class="n">{e(b)}</td><td class="n eu">{e(c)}</td></tr>' for a, b, c in d['r_rows'])
    c0, c1, c2 = d['r_cols']
    pages.append(
        f'<section class="pg"><p class="k">02</p><h2>{e(d["r_h"])}</h2><p class="lead">{e(d["r_lead"])}</p>'
        f'<table class="tab-rates"><thead><tr><th>{e(c0)}</th><th class="n">{e(c1)}</th><th class="n">{e(c2)}</th></tr></thead><tbody>{rows}</tbody></table>'
        f'<ul class="notes">' + ''.join(f'<li>{e(x)}</li>' for x in d['r_notes']) + f'</ul>{foot(d, 3)}</section>')
    # 4 — що входить у ремонт
    pages.append(
        f'<section class="pg"><p class="k">03</p><h2>{e(d["p_h"])}</h2><p class="lead">{e(d["p_lead"])}</p>'
        f'<div class="cols2"><div class="box hl"><h3>{e(d["p_in_h"])}</h3>{li(d["p_in"])}</div>'
        f'<div class="box"><h3>{e(d["p_out_h"])}</h3>{li(d["p_out"], "l no")}</div></div>'
        f'<div class="cols2" style="margin-top:6mm"><div><h3>{e(d["p_also_h"])}</h3>{li(d["p_also"])}</div>'
        f'<div><h3>{e(d["p_save_h"])}</h3>{li(d["p_save"])}</div></div>{foot(d, 4)}</section>')
    # 5 — пакети дизайну
    head = '<tr><th></th>' + ''.join(f'<th{" class=mid" if i == 1 else ""}>{e(n)}<small>{e(p)} · {e(d["d_min"])}</small></th>' for i, (n, p) in enumerate(d['d_pk'])) + '</tr>'
    body = ''.join('<tr><td>' + e(t) + '</td>' + ''.join(
        f'<td class="c{"" if lvl <= i else " o"}{" mid" if i == 1 else ""}">{"✓" if lvl <= i else "—"}</td>' for i in range(3)) + '</tr>' for t, lvl in d['d_items'])
    pages.append(
        f'<section class="pg"><p class="k">04</p><h2>{e(d["d_h"])}</h2><p class="lead">{e(d["d_lead"])}</p>'
        f'<table class="pkt"><thead>{head}</thead><tbody>{body}</tbody></table>'
        f'<ul class="notes">' + ''.join(f'<li>{e(x)}</li>' for x in d['d_notes']) + f'</ul>{foot(d, 5)}</section>')
    # 6 — будинок
    cols = ''.join(f'<div class="box{" hl" if i == 2 else ""}"><h3>{e(n)}</h3><p class="price">{e(p)}</p>{li(xs)}</div>' for i, (n, p, xs) in enumerate(d['h_cols']))
    hex_ = ''.join(f'<tr><td>{e(a)}</td><td class="mu">{e(b)}</td><td class="n"><b>{e(c)}</b></td></tr>' for a, b, c in d['h_ex'])
    pages.append(
        f'<section class="pg"><p class="k">05</p><h2>{e(d["h_h"])}</h2><p class="lead">{e(d["h_lead"])}</p>'
        f'<div class="hs-img" style="background-image:url(\'{img_url(HOUSE)}\')"></div>'
        f'<div class="cols3">{cols}</div>'
        f'<div class="cols2" style="margin-top:6mm"><div><h3>{e(d["h_ex_h"])}</h3><table class="ex" style="margin-top:0">{hex_}</table>'
        f'<h3 style="margin-top:5mm">{e(d["h_tech_h"])}</h3><p class="sm">{e(d["h_tech"])}</p></div>'
        f'<div><h3>{e(d["h_out_h"])}</h3>{li(d["h_out"], "l no")}</div></div>{foot(d, 6)}</section>')
    # 7 — етапи, оплата, гарантія
    pages.append(
        f'<section class="pg"><p class="k">06</p><h2>{e(d["s_h"])}</h2>'
        '<ol class="st">' + ''.join(f'<li><b>{e(a)}</b><span>{e(b)}</span></li>' for a, b in d['s_steps']) + '</ol>'
        f'<h3>{e(d["s_pay_h"])}</h3><div class="pay">' + ''.join(f'<div><b>{e(a)}</b><span>{e(b)}</span></div>' for a, b in d['s_pay']) + '</div>'
        f'<h3>{e(d["s_g_h"])}</h3><div class="gr">' + ''.join(f'<div><b>{e(a)}</b><span>{e(b)}</span></div>' for a, b in d['s_g']) + f'</div>{foot(d, 7)}</section>')
    # 8 — чекліст
    pages.append(
        f'<section class="pg"><p class="k">07</p><h2>{e(d["c_h"])}</h2><p class="lead">{e(d["c_lead"])}</p><div class="cl">'
        + ''.join(f'<div><h3>{e(h)}</h3><ul>' + ''.join(f'<li>{e(x)}</li>' for x in xs) + '</ul></div>' for h, xs in d['c_groups'])
        + f'</div>{foot(d, 8)}</section>')
    # 9 — контакти
    pages.append(
        f'<section class="pg dark kt"><span class="logo">CAS<em>.</em>Development</span><h2>{e(d["k_h"])}</h2><p class="lead">{e(d["k_lead"])}</p><table>'
        + ''.join(f'<tr><td>{e(a)}</td><td><a href="{html.escape(u)}">{e(b)}</a></td></tr>' for a, b, u in d['k_rows'])
        + f'</table><p class="ftx">{e(d["k_facts"])}</p><p class="sm">{e(d["k_small"])}</p>{foot(d, 9)}</section>')
    return (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{e(d["doc_title"])}</title>'
            f'<style>{font_css()}{CSS}</style></head><body>' + ''.join(pages) + '</body></html>')


def write_html():
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    out = {}
    for lang in C:
        p = os.path.join(HERE, 'out', f'guide-{lang}.html')
        open(p, 'w', encoding='utf-8').write(render(lang))
        out[lang] = p
    return out


def make_pdf():
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    files = write_html()
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        for lang, p in files.items():
            pg.goto('file://' + p)
            pg.evaluate('document.fonts.ready')
            pg.wait_for_timeout(300)
            dst = os.path.join(OUT, C[lang]['file'])
            pg.pdf(path=dst, format='A4', print_background=True, prefer_css_page_size=True, tagged=True, outline=False)
            print(f'PDF {os.path.relpath(dst, ROOT)}: {os.path.getsize(dst) // 1024} КБ')
        b.close()


# ---------------------------------------------------------------- блоки на сторінках
def targets():
    out = []
    for lang, files in PAGES.items():
        out += [(lang, f, 'landing') for f in files]
    for lang, pat in BLOG.items():
        for f in sorted(glob.glob(os.path.join(ROOT, pat))):
            if BLOG_RX.search(os.path.basename(f)):
                out.append((lang, os.path.relpath(f, ROOT), 'blog'))
    return out


def apply(s, lang, kind):
    slot = f'<div class="gd-slot" data-pdf="{pdf_url(lang)}"></div>\n'
    s = SLOT_RX.sub('', s)
    if kind == 'landing':
        k = s.find('<section id="zayavka">')
    else:
        art = s.find('<article')
        k = s.find('<div class="cta">', art) if art >= 0 else -1
        if k < 0:
            k = s.find('</article>')
    if k < 0:
        return s
    return s[:k] + slot + s[k:]


def inject(check=False):
    bad, n = [], 0
    for lang, rel, kind in targets():
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        new = apply(s, lang, kind)
        if new != s:
            if check:
                bad.append(rel)
            else:
                open(p, 'w', encoding='utf-8').write(new); n += 1
    if check:
        print('\n'.join(bad) if bad else 'Гід з цінами: OK')
        return 1 if bad else 0
    print(f'Гід з цінами: оновлено {n} сторінок з {len(targets())}')
    return 0


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'pdf':
        make_pdf(); sys.exit(inject())
    if cmd == 'html':
        print('\n'.join(write_html().values())); sys.exit(0)
    sys.exit(inject(check='--check' in sys.argv))
