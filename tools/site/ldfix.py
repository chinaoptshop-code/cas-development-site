"""JSON-LD: спільні поправки для всіх сторінок (крок chrome.apply(), ідемпотентно).

- ImageObject (галереї /proekty усіх мов, «Повний проєкт»): creditText, copyrightNotice, creator (Organization CAS Development),
  license — сторінка «Умови використання» мовою сторінки (розділ «Фото, рендери й тексти»: матеріали належать CAS Development,
  використання — з письмового дозволу), acquireLicensePage — «Контакти» мовою сторінки (кластери terms/contact у clusters.json;
  мови без сторінки — англійська). Метадані зображень Google (Search Console: license / acquireLicensePage / creator).
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


SITE = 'https://cas-develop.com'
CREATOR = {'@type': 'Organization', 'name': CREDIT, 'url': SITE + '/'}
import os as _os
try:
    _CL = json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'lang', 'clusters.json'), encoding='utf-8'))
except (OSError, ValueError):
    _CL = {}
TERMS = _CL.get('terms') or {'uk': '/umovy-korystuvannia', 'en': '/en/terms-of-use'}
CONTACT = _CL.get('contact') or {'uk': '/contact', 'en': '/en/contact'}


def _meta(lang):
    """Поля прав на фото для мови сторінки: creator, license (умови використання), acquireLicensePage (контакти)."""
    lang = lang or 'uk'
    contact = CONTACT.get(lang)
    if not contact:  # мова поза кластером (pt): своя сторінка контактів, якщо є, інакше англійська
        root = _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
        contact = next((f'/{lang}/{n}' for n in ('contact', 'contacto', 'kontakt', 'kontakty')
                        if re.fullmatch(r'[a-z]{2}', lang) and _os.path.isfile(_os.path.join(root, lang, n + '.html'))), CONTACT['en'])
    return {'creator': CREATOR, 'license': SITE + TERMS.get(lang, TERMS['en']), 'acquireLicensePage': SITE + contact}


LD_RX = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)


def _img(o, meta):
    changed = False
    if isinstance(o, list):
        for x in o:
            changed |= _img(x, meta)
    elif isinstance(o, dict):
        t = o.get('@type')
        if t == 'ImageObject' or (isinstance(t, list) and 'ImageObject' in t):
            for k, v in (('creditText', CREDIT), ('copyrightNotice', COPY), *meta.items()):
                if k not in o:  # поля, які генератор поставив сам, не чіпаємо
                    o[k] = dict(v) if isinstance(v, dict) else v
                    changed = True
        for v in o.values():
            changed |= _img(v, meta)
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


def fix(body, desc='', lang='uk'):
    raw = body.replace('<\\/', '</')
    try:
        d = json.loads(raw)
    except ValueError:
        return body
    ch = _flat(d)
    ch |= _img(d, _meta(lang))
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
    lm = re.search(r'<html[^>]*\slang="([a-zA-Z]+)', s[:2000])
    lang = lm.group(1).lower() if lm else 'uk'
    return LD_RX.sub(lambda m: m.group(1) + fix(m.group(2), desc, lang) + m.group(3), s)
