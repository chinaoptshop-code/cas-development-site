#!/usr/bin/env python3
"""Шрифт з одного гліфа: вузький нерозривний пробіл U+202F завширшки 0.2em — роздільник тисяч у цінах («$1 100/м²»).

Навіщо: у Manrope гліфа U+202F немає, Chrome (HarfBuzz) підставляє пів звичайного пробілу —
~0.1em (1.6 px при 16 px), і «$1 100» читається як «$1100». Символ у тексті не міняємо (правило власника 16.11.2026):
окремі @font-face з unicode-range:U+202F у ТИХ САМИХ сімействах дають йому свій гліф — font-family ніде не змінюється.

  python3 tools/fonts/nnbsp.py           # пише блок /*nn*/…/*/nn*/ у assets/site-chrome.v1.css (далі — python3 tools/site/critcss.py)
  python3 tools/fonts/nnbsp.py --check   # блок на місці, шрифт у ньому читається, U+202F = 0.2em (код 1, якщо ні)

Шрифт (≈ 0.3 КБ) вбудований у CSS як data:-URI (font-src 'self' data: у _headers): він є вже з критичним CSS, без запиту
й без другого перемальовування цін після завантаження. Правила мусять стояти ПІСЛЯ @font-face Manrope / "Manrope H"
(<style id="cas-fonts"> у <head> — раніше за crit.v1.css): серед граней одного сімейства з перетином unicode-range
виграє оголошена останньою. Арабська (свій системний стек) — сімейство "CAS NN" першим у стеку html:lang(ar).
Вертикальні метрики (0.7 / −0.2) менші за обидва шрифти сайту — гліф не збільшує висоту рядка.
"""
import base64, io, os, re, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = os.path.join(ROOT, 'assets', 'site-chrome.v1.css')
RX = re.compile(r'/\*nn\*/.*?/\*/nn\*/', re.S)
# сімейство, font-style, діапазон font-weight — ті самі, що в основних граней (chrome.FONTS_CSS)
# один шрифт — Manrope (24.11.2026): текст Manrope і заголовки 'Manrope H' (chrome.FONTS_CSS); Cormorant — лише логотип, цін там немає
FACES = (('Manrope', '', '200 800'), ('Manrope H', '', '500 800'), ('CAS NN', '', ''))
UPM, ADV = 1000, 200          # 0.2em — типовий thin space
ASC, DESC = 700, -200


def build():
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'uni202F'])
    fb.setupCharacterMap({0x202F: 'uni202F'})
    empty = TTGlyphPen(None).glyph()
    pen = TTGlyphPen(None)          # .notdef з контуром: порожню таблицю glyf браузер (OTS) відкидає — «glyf: zero-length table»
    for i, pt in enumerate(((20, 0), (20, 500), (180, 500), (180, 0))):
        (pen.lineTo if i else pen.moveTo)(pt)
    pen.closePath()
    fb.setupGlyf({'.notdef': pen.glyph(), 'uni202F': empty})
    fb.setupHorizontalMetrics({'.notdef': (ADV, 20), 'uni202F': (ADV, 0)})
    fb.setupHorizontalHeader(ascent=ASC, descent=DESC, lineGap=0)
    fb.setupNameTable({'familyName': 'CAS NNBSP', 'styleName': 'Regular'})
    fb.setupOS2(version=4, sTypoAscender=ASC, sTypoDescender=DESC, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=-DESC,
                fsSelection=0x40 | 0x80, achVendID='CAS ')   # REGULAR + USE_TYPO_METRICS
    fb.setupPost()
    f = fb.font
    f['head'].created = f['head'].modified = 3_870_000_000   # сталий час (сек. від 1904) — файл відтворюваний
    f.flavor = 'woff2'
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()


def block(data):
    src = 'url(data:font/woff2;base64,' + base64.b64encode(data).decode() + ')'
    out = []
    for fam, style, wght in FACES:
        out.append('@font-face{font-family:"%s";%s%ssrc:%s;unicode-range:U+202F}' % (
            fam, f'font-style:{style};' if style else '', f'font-weight:{wght};' if wght else '', src))
    return '/*nn*/' + ''.join(out) + '/*/nn*/'


def check():
    """Блок у site-chrome.v1.css: усі грані на місці, шрифт розбирається, U+202F = ADV/UPM. Не побайтно — fontTools/brotli
    різних версій стискають по-різному."""
    from fontTools.ttLib import TTFont
    m = RX.search(open(CSS, encoding='utf-8').read())
    if not m:
        return 'у site-chrome.v1.css немає блоку /*nn*/'
    faces = re.findall(r'@font-face\{font-family:"([^"]+)";(?:font-style:(\w+);)?(?:font-weight:([\d ]+);)?src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\);unicode-range:U\+202F\}', m.group(0))
    if [(f, st, w) for f, st, w, _ in faces] != list(FACES):
        return 'грані блоку /*nn*/ не збігаються з FACES'
    for *_, b64 in faces:
        t = TTFont(io.BytesIO(base64.b64decode(b64)))
        g = t.getBestCmap()
        if list(g) != [0x202F] or t['hmtx'][g[0x202F]][0] / t['head'].unitsPerEm != ADV / UPM:
            return 'шрифт у блоці /*nn*/: U+202F не %sem' % (ADV / UPM)
    return ''


if __name__ == '__main__':
    if '--check' in sys.argv:
        err = check()
        print('nnbsp:', err + ' — python3 tools/fonts/nnbsp.py' if err else 'OK')
        sys.exit(1 if err else 0)
    data = build()
    css = open(CSS, encoding='utf-8').read()
    if not RX.search(css):
        sys.exit('у site-chrome.v1.css немає міток /*nn*//*/nn*/')
    if check():   # уже правильний блок не переписуємо (інша версія fontTools дала б інші байти й нову версію CSS)
        new = RX.sub(lambda _: block(data), css, count=1)
        with open(CSS, 'w', encoding='utf-8') as fh:
            fh.write(new)
        print(f'site-chrome.v1.css: блок /*nn*/ оновлено (шрифт {len(data)} Б, U+202F = {ADV / UPM}em) — далі python3 tools/site/critcss.py')
    else:
        print('nnbsp: блок /*nn*/ актуальний')
