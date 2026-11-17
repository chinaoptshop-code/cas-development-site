"""JSON-LD: спільні поправки для всіх сторінок (крок chrome.apply(), ідемпотентно).

- ImageObject (галереї /proekty усіх мов, «Повний проєкт»): creditText і copyrightNotice — метадані зображень Google
  (фото проєктів CAS Development; без них Google Images не показує «Автор/Права»).
- Service без offers — Offer з цін «від» у meta description сторінки (лише підтверджені суми, offers()).
- {"@graph": [{"@graph": […]}]} — вкладений граф розгортаємо (Google читає лише верхній рівень @graph).
Перевірка — python3 tools/site/ldcheck.py. Генератори, що пишуть ці поля самі, ldfix не чіпає.
"""
import html, json, re

CREDIT = 'CAS Development'
COPY = '© CAS Development'
# ціни «від» за м² (CLAUDE.md): лише ці суми потрапляють в Offer послуги — непідтверджена цифра в рядку ціни розмітки не дає
CONFIRMED_M2 = {6, 12, 18, 30, 45, 250, 350, 400, 550, 600, 850, 900, 1100, 1700}
LANDSCAPE_SOTKA = 50  # ландшафтний дизайн від $50 за сотку (100 м² = 1 ар, UN/CEFACT ARE)
_AMT = re.compile(r'\$\s?(\d{1,3}(?:[ ,\u00a0\u202f]\d{3})+|\d+)|(\d+)\s?(?:دولار|美元)')
_M2 = re.compile(r'(?:m²|м²|م²|米²|m2)')


LD_RX = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)


def _img(o):
    changed = False
    if isinstance(o, list):
        for x in o:
            changed |= _img(x)
    elif isinstance(o, dict):
        t = o.get('@type')
        if (t == 'ImageObject' or (isinstance(t, list) and 'ImageObject' in t)) and not any(k in o for k in ('creditText', 'copyrightNotice', 'license')):
            o['creditText'], o['copyrightNotice'] = CREDIT, COPY
            changed = True
        for v in o.values():
            changed |= _img(v)
    return changed


def offers(price):
    """Рядок ціни лендингу («ремонт від $550 / м² · дизайн від $30 / м²») → Offer з UnitPriceSpecification на кожну суму «від … за м²».
    Мінімум проєкту ($2 500) і суми без одиниці — лише в описі рядка, не окремою ціною."""
    out = []
    for seg in re.split(r'\s[·—–]+\s|[,;.]\s|[，。；]', price or ''):
        m = _AMT.search(seg)
        if not m:
            continue
        n = int(re.sub(r'\D', '', m.group(1) or m.group(2)))
        rest = seg[m.end():m.end() + 16]
        if n in CONFIRMED_M2 and _M2.search(rest):
            unit = {'unitCode': 'MTK'}
        elif n == LANDSCAPE_SOTKA and re.search(r'100\s?m|100\s?م|100平方米|\bar\b|Ar\b|сотк|ар\b', seg):
            unit = {'unitCode': 'ARE'}
        else:
            continue
        # компактно (бюджет HTML 64 КБ): без опису й дублю валюти; «від» — у тексті сторінки й meta description
        out.append({'@type': 'Offer', 'priceSpecification': dict({'@type': 'UnitPriceSpecification', 'price': n, 'priceCurrency': 'USD'}, **unit)})
    return out


def _flat(d):
    g = d.get('@graph') if isinstance(d, dict) else None
    if not isinstance(g, list) or not any(isinstance(x, dict) and set(x) <= {'@context', '@graph'} for x in g):
        return False
    out = []
    for x in g:
        out += x['@graph'] if isinstance(x, dict) and set(x) <= {'@context', '@graph'} else [x]
    d['@graph'] = out
    return True


def _svc(d, desc):
    """Service сторінки без offers (ручні сторінки й лендинги з ціною «за кошторисом» у hero) — ціни «від» з meta description,
    лише підтверджені суми (CONFIRMED_M2); немає ціни в описі — без offers."""
    nodes = d.get('@graph', [d]) if isinstance(d, dict) else d
    ch = False
    for o in nodes if isinstance(nodes, list) else []:
        if isinstance(o, dict) and o.get('@type') == 'Service' and 'offers' not in o:
            of = offers(desc)
            if of:
                o['offers'] = of
                ch = True
    return ch


def fix(body, desc=''):
    raw = body.replace('<\\/', '</')
    try:
        d = json.loads(raw)
    except ValueError:
        return body
    ch = _flat(d)
    ch |= _img(d)
    ch |= _svc(d, desc)
    if not ch:
        return body
    compact = '":"' in raw or '","' in raw
    out = json.dumps(d, ensure_ascii=False, separators=(',', ':') if compact else None)
    return ('\n' + out + '\n' if body.startswith('\n') else out).replace('</', '<\\/')


def apply(s, rel=''):
    if 'application/ld+json' not in s:
        return s
    m = re.search(r'<meta name="description" content="([^"]*)"', s.split('</head>')[0])
    desc = html.unescape(m.group(1)) if m else ''
    return LD_RX.sub(lambda m: m.group(1) + fix(m.group(2), desc) + m.group(3), s)
