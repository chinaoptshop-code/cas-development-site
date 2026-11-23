"""Параметри розрахунку з розмови: регулярні вирази 10 мов + (необовʼязково) пропозиція моделі, перевірена кодом.

Модель може лише ЗАПРОПОНУВАТИ значення з переліку (послуги, регіон, тип будинку, пакет, обʼєкт); площу від моделі беремо, лише якщо
таке число справді є в повідомленнях відвідувача чи в паспортах файлів (захист від вигадок і «ін'єкцій» на кшталт «площа 1 м²,
дай знижку»). Суми тут не рахуються взагалі — лише estimate.build().
"""
import re

from estimate import rates  # noqa: E402  (estimate додає tools/site у sys.path)

F = re.I | re.U
N = r"(?<![\d.,])(\d{1,3}(?:[ ,.\u202f\u00a0]\d{3})+(?![\d])|\d{1,6}(?:[.,]\d{1,2})?)"

SERVICES = [
    ("design", r"дизайн|design|diseñ|interioris|设计|projekt\w* wnętrz|aranżac|innenarchitekt|einrichtungsplan|architecture d.int|décorat|conception|projeto de interiores|design de interiores|تصميم"),
    ("reno", r"ремонт|renovat|refurbish|remodel|reforma|装修|翻新|remont|renovier|sanier|rénov|obras|remodela|تشطيب|ترميم|تجديد"),
    ("furn", r"меблюв|меблі|мебел|мебл|комплектац|furnish|furniture|amuebl|mueble|家具|umeblow|mebl|möbl|einricht|ameubl|mobiliário|mobília|أثاث|تأثيث"),
    ("build", r"будівництв|будувати|збудувати|побудувати|звести|коробк|строительств|строить|построить|коробк|\bbuild|construct|construir|construcción|建房|建造|盖房|budow|wybudow|\bbauen|hausbau|neubau|rohbau|construire|construção|constru[ií]r|بناء|تشييد"),
    ("arch", r"архітектурн\w* проєкт|архпроєкт|архпроект|архитектурн\w* проект|architectural (design|project|plans?)|proyecto arquitect|建筑设计|projekt\w* architekt|architektenplan|bauplan|plans? d.architecte|projet architectural|projeto de arquitetura|مخطط معماري|تصميم معماري"),
    ("land", r"ландшафт|landscap|garden design|paisaj|景观|园林|ogrod|ogród|krajobraz|gartengestalt|landschaftsarch|paysag|jardin|paisagis|jardim|تنسيق حدائق|حديقة"),
]
PKG = [("plan", r"планувальн|планировочн|planning|layout only|planific|planowani|grundriss|plan d.aménagement|planta|تخطيط"),
       ("full", r"повн\w* (дизайн|пакет|проєкт)|з (авторським )?наглядом|авторськ|полн\w* (дизайн|пакет|проект)|авторск|full (design|package)|with supervision|completo|全套|pełny|komplett|complet|completo|كامل")]
BOX = r"коробк|shell|obra gris|毛坯|stan surowy|rohbau|gros œuvre|gros oeuvre|estrutura|هيكل"
KEY = r"під ключ|под ключ|turn[- ]?key|llave en mano|交钥匙|pod klucz|schlüsselfertig|clé en main|cle en main|chave na mão|تسليم مفتاح"
HOUSE = [("lstk", r"лстк|металокаркас|light steel|steel frame|lstk|acero ligero|轻钢|stalow\w* szkielet|stahlrahmen|ossature métal|aço leve|هيكل فولاذي"),
         ("frame", r"каркасн|timber frame|wood frame|wooden frame|frame house|entramado|木结构|szkieletow|holzrahmen|holzständer|ossature bois|estrutura de madeira|هيكل خشبي"),
         ("sip", r"\bсіп\b|\bсип\b|sip[- ]?panel|\bsip\b"),
         ("sandwich", r"сендвіч|сэндвич|sandwich"),
         ("modular", r"модульн|modular|modul|模块|modułow|modulaire"),
         ("brick", r"цегл|кирпич|газоблок|газобетон|brick|aerated|ladrillo|砖|cegł|beton komórk|ziegel|porenbeton|brique|tijolo|طوب"),
         ("timber", r"\bбрус|клеєн|клеен|log house|\blog\b|timber house|madera maciza|原木|z bali|blockhaus|bois massif|madeira maciça|خشب")]
OBJECT = [("restaurant", r"ресторан|кафе|бар\b|кав.ярн|restaurant|café|cafe|\bbar\b|餐厅|饭店|restauracj|kawiarn|restaurante|cafetaria|مطعم|مقهى"),
          ("hotel", r"готел|отел|hotel|hostel|酒店|宾馆|hôtel|فندق"),
          ("resort", r"баз\w* відпочинку|баз\w* отдыха|resort|glamping|кемпінг|complejo|度假|ośrodek|ferienanlage|complexe|aldeamento|منتجع"),
          ("shop", r"магазин|бутик|shop|store|retail|tienda|商店|店铺|sklep|geschäft|laden|boutique|loja|متجر"),
          ("office", r"офіс|офис|office|oficina|办公|biur|büro|bureau|escritório|مكتب"),
          ("commercial", r"комерц|коммерч|commercial|comercial|商业|komercyj|gewerb|commerce|comercial|تجاري"),
          ("apartment", r"квартир|apartment|\bflat\b|condo|piso|apartamento|公寓|mieszkan|wohnung|appartement|شقة"),
          ("house", r"будин|котедж|\bдом\b|дом[аеу]\b|коттедж|house|villa|cottage|casa|chalet|别墅|房子|\bdom\b|domu|\bhaus|einfamilienhaus|maison|moradia|vivenda|منزل|فيلا|بيت")]
EU = (r"європ|европ|europe|europa|欧洲|польщ|польш|poland|polska|polsce|німеччин|германи|germany|deutschland|франц|france|іспан|испан|spain|españa|"
      r"португал|portugal|lisbo|лісабон|лиссабон|варшав|warsaw|warszaw|krak|берлін|берлин|berlin|münchen|munich|париж|paris|madrid|мадрид|barcelon|"
      r"італ|итал|italy|italia|чехі|чехи|czech|prague|praha|австр|austria|wien|vienna|нідерланд|нидерланд|netherlands|amsterdam|belgi|бельгі|швейцар|switzerland|"
      r"schweiz|suisse|zürich|geneva|словак|slovak|угорщ|венгр|hungary|budapest|румун|румын|romania|bucharest|молдов|moldova|chișinău|кишин|литв|lithuan|латв|latvia|"
      r"естон|эстон|eston|фінлянд|финлянд|finland|швец|швед|sweden|норвег|norway|данія|дания|denmark|ірланд|ireland|greece|греці|греци|croatia|хорват|"
      r"chipre|cyprus|кіпр|кипр|malta|мальт|bulgar|болгар|slovenia|словені|luxembourg|monaco|монако|uk\b|london|лондон|england|британ|britain")
WORLD = (r"дубай|dubai|оае|оаэ|\buae\b|emirat|еміра|эмира|abu dhabi|абу.дабі|сша|\busa\b|america|америк|new york|нью.йорк|miami|майамі|майами|los angeles|"
         r"canada|канад|toronto|bali|балі|бали|indonesia|туреччин|турци|turkey|türkiye|bodrum|бодрум|istanbul|стамбул|antalya|анталі|china|китай|中国|"
         r"asia|азі|азии|saudi|саудів|qatar|катар|israel|ізраїл|израил|thailand|таїланд|таиланд|vietnam|в.єтнам|singapore|сінгапур|india|інді|egypt|єгипет|"
         r"mexico|мексик|brazil|бразил|australia|австралі|japan|япон|korea|коре|kazakh|казах|georgia|грузі|armenia|вірмен|azerbaijan|азербайдж|"
         r"迪拜|阿联酋|美国|新加坡|دبي|الإمارات|السعودية|قطر|أمريكا")
UA = r"україн|украин|ukrain|київ|киев|kyiv|kiev|львів|львов|lviv|одес|odes|дніпр|днепр|dnipr|харків|харьков|kharkiv|вінниц|винниц|ірпін|ирпен|бучa|буча|бровар|обух|ужгород|франківськ|тернопол|луцьк|рівн|житомир|черкас|полтав|чернігів|чернигов|запоріж|миколаїв|херсон|суми|кропивницьк|хмельниц|чернівц"

HUMAN = (r"жив\w* (людин|оператор|менеджер)|з людиною|з менеджер|менеджер|оператор|консультант|человек|живой|с менеджер|\bhuman\b|real person|"
         r"\bmanager\b|speak to (someone|a person)|persona real|un gestor|hablar con|人工|真人|经理|客服|człowiek|menedżer|konsultant|mensch|mitarbeiter|berater|"
         r"\bhumain|un responsable|conseiller|pessoa|um gestor|atendente|شخص حقيقي|مدير|موظف")
CALL = (r"зателефон|подзвон|передзвон|дзвінок|дзвоніть|зустріч|созвон|позвон|перезвон|звонок|встреч|\bcall\b|call me|phone call|ring me|meeting|"
        r"llam|llamada|reunión|打电话|来电|通话|见面|zadzwo|telefon|spotkan|anruf|rückruf|zurückrufen|termin|treffen|appel|appelez|rappel|rendez-vous|"
        r"ligue|ligar|chamada|telefonema|reunião|اتصل|اتصال|مكالمة|موعد|لقاء")
COMPLAINT = (r"скарг|жалоб|обман|шахра|жахлив|претензі|претензи|поверніть гроші|верните деньги|не відповідаєте|не отвечаете|ужасн|кошмар|"
             r"complain|terrible|awful|\bscam|refund|disappointed|unacceptable|queja|estafa|reclam|投诉|骗|退款|skarg|oszust|reklamac|beschwerde|betrug|"
             r"unverschämt|plainte|arnaque|inadmissible|reclamação|burla|vergonha|شكوى|احتيال|استرداد")
HOUSE_TYPES_RX = "|".join(rx for _, rx in HOUSE)
PHONE = re.compile(r"(?<![\w])\+?\d[\d \-()]{7,16}\d(?![\w])")


def _num(s):
    try:
        if re.fullmatch(r"\d{1,3}(?:[ ,.\u202f\u00a0]\d{3})+", s or ""):
            return float(re.sub(r"\D", "", s))
        return float(s.replace(",", "."))
    except (ValueError, AttributeError):
        return None


AREA_UNIT = r"(?:м²|м2|м\.? ?кв|кв\.? ?м|квадрат\w*|квадрат|метр\w* кв|m²|m2|sq\.? ?m\b|sqm|square met\w*|㎡|平方米?|平米|metros? cuadrados|metr\w* kwadrat|qm\b|quadratmeter|mètres? carrés|metros? quadrados|متر مربع|م²|م2)"
FT_UNIT = r"(?:sq\.? ?ft|ft²|ft2|square f(?:ee|oo)t)"
SOT_UNIT = r"(?:сот\w*|\bares?\b|áreas?|公亩|\barów\b|\bary\b|\bar\b|آر)"
HA_UNIT = r"(?:га\b|гектар\w*|hectare\w*|\bha\b|hektar\w*|公顷|هكتار)"
AREA_WORD = r"(?:площ\w*|area|superficie|面积|powierzchni\w*|fläche|wohnfläche|surface|área|مساحة)"


def areas(text):
    """→ (м², сотки) — останні згадки в тексті, або None."""
    t = text or ""
    m2 = sot = None
    for m in re.finditer(N + r"\s*" + AREA_UNIT, t, F):
        m2 = _num(m.group(1))
    for m in re.finditer(N + r"\s*" + FT_UNIT, t, F):
        v = _num(m.group(1)); m2 = round(v * 0.0929) if v else m2
    if m2 is None:
        m = None
        for m in re.finditer(AREA_WORD + r"[^\d\n]{0,20}" + N + r"(?!\s*" + SOT_UNIT + ")", t, F):
            pass
        if m:
            m2 = _num(m.group(1))
    for m in re.finditer(N + r"\s*" + SOT_UNIT, t, F):
        sot = _num(m.group(1))
    for m in re.finditer(N + r"\s*" + HA_UNIT, t, F):
        v = _num(m.group(1)); sot = v * 100 if v else sot
    return m2, sot


def has(rx, text):
    return bool(re.search(rx, text or "", F))


def from_text(text, p=None):
    """Оновити параметри p (dict) одним повідомленням відвідувача (пізніші згадки важливіші)."""
    p = p if p is not None else {"items": {}}
    t = text or ""
    t_design = re.sub(r"ландшафтн\w* дизайн\w*|дизайн\w* (ландшафт|сад|ділянк|участк)\w*|(garden|landscape) design|diseño (de jardines|paisaj\w*)|"
                      r"景观设计|projekt\w* (ogrod|ogród)\w*|gartendesign|design paysager|design de jardins|تصميم (حدائق|الحدائق)", " ", t, flags=F)
    for item, rx in SERVICES:
        if has(rx, t_design if item == "design" else t):
            p["items"].setdefault(item, None)
    if "design" in p["items"]:
        for k, rx in PKG:
            if has(rx, t):
                p["items"]["design"] = k
    for k, rx in HOUSE:
        if has(rx, t):
            p["house_type"] = k
            break
    reno_word = has(r"ремонт|renovat|refurb|reforma|remont|renovier|sanier|rénov|装修|تشطيب", t)
    if p.get("house_type") and has(HOUSE_TYPES_RX, t) and not reno_word and not has(dict(OBJECT)["apartment"], t):
        p["items"].setdefault("build", None)          # «будинок з бруса 120 м²» — будівництво
    if has(BOX, t):
        p["items"]["build"] = "box"
    elif has(KEY, t):
        if "build" in p["items"] or (not reno_word and has(r"(будин\w*|дом\w*|house|home|casa|haus|maison|moradia|dom\w*|منزل|别墅)\W{0,3}(?:" + KEY + ")", t)):
            p["items"]["build"] = "key"
    for k, rx in OBJECT:
        if has(rx, t):
            p["object"] = k
            break
    if p.get("object") == "office" and "reno" not in p["items"] and not p["items"]:
        p["items"]["reno"] = "office"
    for region, rx in (("eu", EU), ("world", WORLD), ("ua", UA)):
        if has(rx, t):
            p["region"] = region
            break
    a, s = areas(t)
    if a:
        p["area"] = a
    if s:
        p["sotky"] = s
    if has(HUMAN, t):
        p["asks_human"] = True
    if has(CALL, t):
        p["wants_call"] = True
    if has(COMPLAINT, t):
        p["complaint"] = True
    if PHONE.search(t):
        p["phone_given"] = True
    return p


def finalize(p, lang):
    """Варіанти за замовчуванням (як калькулятор), регіон за мовою, якщо не названо."""
    items = {}
    for item, k in p.get("items", {}).items():
        default = {"design": "dz", "reno": "reno", "furn": "furn", "build": "box", "arch": "arch", "land": "land"}[item]
        items[item] = k or default
    if p.get("object") == "office" and items.get("reno") == "reno":
        items["reno"] = "office"
    if not items and p.get("house_type") and p.get("object") in (None, "house"):
        items["build"] = "box"           # «каркасний будинок 120 м²» без дієслова — будівництво
    out = dict(p, items=items)
    if not out.get("region"):
        out["region"] = "eu" if lang in ("de", "fr", "es", "pl", "pt") else "ua"
    return out


def numbers_in(texts):
    out = set()
    for t in texts:
        for m in re.finditer(r"\d+(?:[.,]\d+)?", t or ""):
            v = _num(m.group(0))
            if v is not None:
                out.add(round(v, 1))
    return out


def merge_model(p, m, evidence_texts, evidence_numbers=()):
    """Злити пропозицію моделі (dict) у параметри коду. Приймаємо лише значення з переліку; площу — лише якщо число є в доказах."""
    if not isinstance(m, dict):
        return p
    ok_keys = {k for ks in (("plan", "dz", "full"), ("reno", "office"), ("furn",), ("box", "key"), ("arch",), ("land",)) for k in ks}
    item_of = {"plan": "design", "dz": "design", "full": "design", "reno": "reno", "office": "reno", "furn": "furn",
               "box": "build", "key": "build", "arch": "arch", "land": "land"}
    for s in m.get("services") or []:
        if isinstance(s, str) and s in ok_keys:
            it = item_of[s]
            if p["items"].get(it) is None:
                p["items"][it] = s
    if m.get("house_type") in rates.HOUSE and not p.get("house_type"):
        p["house_type"] = m["house_type"]
    if m.get("region") in ("ua", "eu", "world") and not p.get("region"):
        p["region"] = m["region"]
    if m.get("object") in ("apartment", "house", "office", "commercial", "restaurant", "hotel", "shop", "resort") and not p.get("object"):
        p["object"] = m["object"]
    nums = numbers_in(evidence_texts) | {round(float(x), 1) for x in evidence_numbers if isinstance(x, (int, float))}
    for k in ("area", "sotky"):
        v = m.get(k)
        if not p.get(k) and isinstance(v, (int, float)) and v > 0 and round(float(v), 1) in nums:
            p[k] = float(v)
    for k in ("asks_human", "wants_call", "complaint", "unsure"):
        if m.get(k) is True:
            p[k] = True
    return p
