"""Попередній кошторис — лише кодом, за tools/site/rates.py (ті самі ставки й правила, що калькулятор сайту assets/calc.v1.js).

Модель і регулярні вирази лише витягують ПАРАМЕТРИ (послуги, площа, сотки, регіон, тип будинку, пакет дизайну, тип обʼєкта);
суми рахує build(). Підписи рядків і примітки — з конфігу калькулятора сайту відповідної мови (cCfg на сторінці калькулятора),
тож назви послуг збігаються з сайтом у всіх 10 мовах.

Відмінності від калькулятора (рішення власника 23.11.2026): «коробка + ремонт» разом — двома рядками з приміткою
(під ключ + ремонт — ремонт уже входить у «під ключ», окремим рядком не рахуємо); комерційні обʼєкти — ставки лише наявні
(офіс $350/м²), ремонт / будівництво ресторану, готелю, магазину — «за кошторисом»; за межами України й Європи — реалізація
«за кошторисом», дизайн — онлайн за київськими ставками.
"""
import json
import pathlib
import re
import sys

from config import REPO

sys.path.insert(0, str(REPO / "tools" / "site"))
import i18n as site_i18n  # noqa: E402
import rates  # noqa: E402

LANGS = site_i18n.LANGS
CALC_PAGES = {"uk": "kalkuliator-remontu", "ru": "ru/kalkulyator-remonta", "en": "en/renovation-cost-calculator",
              "es": "es/calculadora-reforma", "zh": "zh/renovation-calculator", "pl": "pl/kalkulator-remontu",
              "de": "de/renovierungskosten-rechner", "fr": "fr/calculateur-renovation", "pt": "pt/calculadora-obras",
              "ar": "ar/renovation-calculator"}
ITEMS = [("design", ("plan", "dz", "full")), ("reno", ("reno", "office")), ("furn", ("furn",)),
         ("build", ("box", "key")), ("arch", ("arch",)), ("land", ("land",))]   # порядок = калькулятор (C.it)
ITEM_OF = {k: item for item, ks in ITEMS for k in ks}
MAX = {"m": 100000, "s": 10000}
COMMERCIAL = ("commercial", "restaurant", "hotel", "shop", "office", "resort")
NOTE_MAX = 500

# Примітки, яких немає в калькуляторі (10 мов). {x} — підстановки коду.
EXTRA = {
    "combo": {"uk": "Коробка й ремонт — двома рядками на ту саму площу.", "ru": "Коробка и ремонт — двумя строками на ту же площадь.",
              "en": "Shell and renovation are two lines for the same area.", "es": "Obra gris y reforma: dos líneas para la misma superficie.",
              "zh": "毛坯建造与装修按同一面积分两行计算。", "pl": "Stan surowy i remont — dwie pozycje na tę samą powierzchnię.",
              "de": "Rohbau und Renovierung — zwei Positionen für dieselbe Fläche.", "fr": "Gros œuvre et rénovation : deux lignes pour la même surface.",
              "pt": "Estrutura e obras — duas linhas para a mesma área.", "ar": "الهيكل والتشطيب سطران لنفس المساحة."},
    "keyreno": {"uk": "Ремонт уже входить у «під ключ» — окремо не рахуємо.", "ru": "Ремонт уже входит в «под ключ» — отдельно не считаем.",
                "en": "Renovation is already included in turnkey — not counted separately.", "es": "La reforma ya está incluida en «llave en mano».",
                "zh": "装修已包含在交钥匙价格中，不重复计算。", "pl": "Remont jest już w cenie „pod klucz” — nie liczymy osobno.",
                "de": "Die Renovierung ist im schlüsselfertigen Preis enthalten.", "fr": "La rénovation est déjà incluse dans le clé en main.",
                "pt": "As obras já estão incluídas no «chave na mão».", "ar": "التشطيب مشمول في «تسليم مفتاح» ولا يُحتسب منفصلاً."},
    "comm": {"uk": "Комерційний обʼєкт: ремонт і будівництво — за кошторисом, ставки — після брифу.",
             "ru": "Коммерческий объект: ремонт и строительство — по смете, ставки — после брифа.",
             "en": "Commercial property: renovation and construction are quoted individually after a brief.",
             "es": "Local comercial: reforma y construcción según presupuesto tras el briefing.",
             "zh": "商业项目：装修和建造需在沟通需求后按预算报价。",
             "pl": "Obiekt komercyjny: remont i budowa — wg kosztorysu po briefie.",
             "de": "Gewerbeobjekt: Renovierung und Bau laut Kostenvoranschlag nach dem Briefing.",
             "fr": "Local commercial : rénovation et construction sur devis après le brief.",
             "pt": "Espaço comercial: obras e construção por orçamento após o briefing.",
             "ar": "عقار تجاري: التشطيب والبناء حسب التقدير بعد مناقشة المتطلبات."},
    "world": {"uk": "Поза Україною і Європою: дизайн — онлайн; реалізацію з місцевими підрядниками рахуємо індивідуально.",
              "ru": "За пределами Украины и Европы: дизайн — онлайн; реализацию с местными подрядчиками считаем индивидуально.",
              "en": "Outside Ukraine and Europe: design online; implementation with local contractors is quoted individually.",
              "es": "Fuera de Ucrania y Europa: diseño en línea; la ejecución con contratistas locales, de forma individual.",
              "zh": "乌克兰和欧洲以外：设计可在线完成；与当地承包商的施工单独报价。",
              "pl": "Poza Ukrainą i Europą: projekt online; realizację z lokalnymi wykonawcami wyceniamy indywidualnie.",
              "de": "Außerhalb der Ukraine und Europas: Planung online; Umsetzung mit lokalen Firmen individuell.",
              "fr": "Hors Ukraine et Europe : conception en ligne ; réalisation avec des entreprises locales sur devis.",
              "pt": "Fora da Ucrânia e da Europa: projeto online; execução com empreiteiros locais, individualmente.",
              "ar": "خارج أوكرانيا وأوروبا: التصميم عبر الإنترنت؛ التنفيذ مع مقاولين محليين يُحسب بشكل فردي."},
    "prelim": {"uk": "Розрахунок попередній: точна сума — після заміру й кошторису.",
               "ru": "Расчёт предварительный: точная сумма — после замера и сметы.",
               "en": "Preliminary estimate: the exact price comes after measurements and a detailed quote.",
               "es": "Cálculo orientativo: el precio exacto, tras la medición y el presupuesto.",
               "zh": "初步估算：准确价格以测量和预算为准。",
               "pl": "Wycena wstępna: dokładna kwota po pomiarze i kosztorysie.",
               "de": "Vorläufige Kalkulation: der genaue Preis nach Aufmaß und Kostenvoranschlag.",
               "fr": "Calcul indicatif : le prix exact après métré et devis.",
               "pt": "Cálculo indicativo: o valor exato após a medição e o orçamento.",
               "ar": "حساب تقريبي: السعر الدقيق بعد القياس والتقدير."},
}

_cfg_cache = {}


def calc_cfg(lang):
    """Конфіг калькулятора сайту (cCfg) мови; немає сторінки — uk; немає й uk — мінімальний запасний."""
    lang = lang if lang in CALC_PAGES else "uk"
    if lang not in _cfg_cache:
        c = None
        for lg in (lang, "uk"):
            p = REPO / (CALC_PAGES[lg] + ".html")
            try:
                m = re.search(r'<script type="application/json" id="cCfg">(.*?)</script>', p.read_text(encoding="utf-8"), re.S)
                c = json.loads(m.group(1)) if m else None
            except (OSError, ValueError):
                c = None
            if c:
                break
        _cfg_cache[lang] = c or {"rl": {k: k for k in rates.RATES}, "ht": [], "est": "за кошторисом", "m2": "м²", "ss": "сот.",
                                 "nm": "Мінімум за дизайн — {m}.", "nr": "", "n5": "", "na": "", "ne": "", "hn": ""}
    return _cfg_cache[lang]


def usd(n, lang):
    s = site_i18n.usd(n, lang)
    return s


def iso(s, lang):
    """ar: суми в ізоляті LTR (⁦$44 000⁩), як на сайті."""
    return "⁦" + s + "⁩" if lang == "ar" else s


def clamp_area(v, sot=False):
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if not (v > 0) or v != v or v == float("inf"):
        return None
    v = round(v * 10) / 10 if sot else round(v)
    return min(v, MAX["s" if sot else "m"]) or None


def build(p, lang="uk"):
    """p — параметри: items {позиція: ключ ставки}, area (м²), sotky, region ua|eu|world, house_type, object.
    → (estimate за схемою API.md або None, info) ; info: missing (area|sotky|items), big, total, lines_known."""
    C = calc_cfg(lang)
    items = dict(p.get("items") or {})
    region = p.get("region") if p.get("region") in ("ua", "eu", "world") else "ua"
    eu = region == "eu"
    obj = p.get("object") or ""
    comm = obj in COMMERCIAL and obj != "office"
    area, sot = clamp_area(p.get("area")), clamp_area(p.get("sotky"), sot=True)
    ht = p.get("house_type") if p.get("house_type") in rates.HOUSE else None
    info = {"missing": [], "big": False, "total": None, "known": 0, "est": False, "notes": []}
    # нормалізація варіантів: офіс як обʼєкт → ремонт офісу; ключ лише зі свого списку
    for item, ks in ITEMS:
        if item in items and items[item] not in ks:
            items[item] = ks[1] if item == "design" else ks[0]
    if obj == "office" and items.get("reno") == "reno":
        items["reno"] = "office"
    if not items:
        info["missing"].append("items")
        return None, info
    if any(i != "land" for i in items) and not area:
        info["missing"].append("area")
    if "land" in items and not sot:
        info["missing"].append("sotky")
    if info["missing"]:
        return None, info
    notes = []
    if items.get("build") == "key" and "reno" in items:
        items.pop("reno"); notes.append(EXTRA["keyreno"].get(lang, EXTRA["keyreno"]["en"]))
    elif items.get("build") == "box" and "reno" in items:
        notes.append(EXTRA["combo"].get(lang, EXTRA["combo"]["en"]))
    lines, total, est = [], 0, False
    for item, _ks in ITEMS:
        key = items.get(item)
        if not key:
            continue
        sotky = item == "land"
        qty = sot if sotky else area
        t = ht if item == "build" else None
        rate, cost = rates.rate(key, 1 if eu else 0, t), rates.cost(key, 1 if eu else 0, qty, t)
        if region == "world" and item != "design":
            rate = cost = None           # реалізація поза Україною й Європою — індивідуально
        if comm and item in ("reno", "build"):
            rate = cost = None           # ремонт/будівництво ресторану, готелю… — за кошторисом
        label = C["rl"].get(key, key)
        if t:
            name = dict(C.get("ht") or []).get(t)
            if name:
                label = f"{label} — {name}"
        unit = (C.get("ss") or "сот.") if sotky else (C.get("m2") or "м²")
        line = {"label": label[:160], "qty": qty, "unit": unit[:12], "rate": rate, "from": cost}
        if cost is not None and key in rates.DESIGN and rate * qty < rates.DMIN[1 if eu else 0]:
            line["note"] = (C.get("mn") or "мінімум") + " " + usd(rates.DMIN[1 if eu else 0], lang)
        lines.append(line)
        if cost is None:
            est = True
        else:
            total += cost
    known = [l for l in lines if l["from"] is not None]
    if "reno" in items and C.get("nr"):
        notes.append(C["nr"])
    if ("reno" in items or "build" in items) and region != "world" and not comm and C.get("n5"):
        notes.append(C["n5"])
    if "arch" in items and C.get("na"):
        notes.append(C["na"])
    if eu and C.get("ne"):
        notes.append(C["ne"])
    if comm:
        notes.append(EXTRA["comm"].get(lang, EXTRA["comm"]["en"]))
    if region == "world":
        notes.append(EXTRA["world"].get(lang, EXTRA["world"]["en"]))
    notes.append(EXTRA["prelim"].get(lang, EXTRA["prelim"]["en"]))
    last, keep = notes[-1], []           # ≤ 500 знаків; «розрахунок попередній» — завжди
    for n in notes[:-1]:
        if n and n not in keep and len(" ".join(keep + [n, last])) <= NOTE_MAX:
            keep.append(n)
    note = " ".join(keep + [last])
    e = {"currency": "USD", "region": "eu" if eu else "ua", "lines": lines[:20],
         "total_from": total if known else None, "note": note[:NOTE_MAX]}
    info.update(total=e["total_from"], known=len(known), est=est, notes=notes)
    info["big"] = bool("build" in items or comm or obj in ("house", "office") or (area or 0) >= 300 or total >= 100000)
    return e, info


def allowed_numbers(e):
    """Числа, які текст відповіді може містити (усе з estimate + публічні ставки)."""
    out = set()
    for l in (e or {}).get("lines", []):
        for k in ("qty", "rate", "from"):
            if isinstance(l.get(k), (int, float)):
                out.add(float(l[k]))
    if e and isinstance(e.get("total_from"), (int, float)):
        out.add(float(e["total_from"]))
    for r in rates.RATES.values():
        out.update(float(x) for x in r if x)
    for h in rates.HOUSE.values():
        for r in h.values():
            out.update(float(x) for x in r if x)
    out.update(float(x) for x in rates.DMIN)
    return out


def summary(e, lang):
    """Один рядок для тексту відповіді (числа — з estimate, не з моделі)."""
    from texts import T
    if not e:
        return ""
    if e.get("total_from") is None:
        return T("est_none", lang)
    s = T("est_total", lang, total=iso(usd(e["total_from"], lang), lang))
    if any(l["from"] is None for l in e["lines"]):
        s += " " + T("est_partial", lang)
    return s
