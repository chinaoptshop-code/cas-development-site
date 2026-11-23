"""Перевірки тексту моделі перед надсиланням: мова, заборонені теми, суми (лише з estimate), довжина."""
import re

F = re.I | re.U

STOP = {
    "en": r"\b(the|and|you|your|is|are|we|for|with|of|to|in|what|how|much|please|thank|would|can|apartment|house)\b",
    "es": r"\b(el|la|los|las|que|de|para|con|una|un|es|por|cuánto|cuanto|gracias|usted|piso|casa|reforma|también)\b|[ñ¿¡]",
    "pt": r"\b(o|a|os|as|que|de|para|com|uma|um|é|não|obrigad[oa]|quanto|casa|obras|também|você)\b|[ãõ]",
    "fr": r"\b(le|la|les|des|est|et|vous|pour|avec|une|un|merci|combien|maison|appartement|nous|pas)\b|[àâçèêëîïôûœ]",
    "de": r"\b(der|die|das|und|ist|sie|ihr|für|mit|ein|eine|nicht|danke|wie|viel|wohnung|haus|wir|bitte)\b|[äöüß]",
    "pl": r"\b(i|w|na|jest|nie|się|że|dla|ile|kosztuje|dziękuję|mieszkanie|dom|proszę|czy|pan|pani)\b|[ąęłńśźż]",
}


def detect_lang(text):
    """→ код мови або None (коротко / неоднозначно)."""
    t = re.sub(r"https?://\S+|[\d$€₴%.,:;!?()\-–—/«»\"'’]+", " ", text or "")
    if len(t.strip()) < 3:
        return None
    ar = len(re.findall(r"[؀-ۿ]", t)); zh = len(re.findall(r"[一-鿿]", t))
    cyr = len(re.findall(r"[а-яёіїєґ]", t, F)); lat = len(re.findall(r"[a-zà-ÿąęłńśźżœß]", t, F))
    top = max(ar, zh, cyr, lat)
    if top == 0:
        return None
    if top == ar:
        return "ar"
    if top == zh:
        return "zh"
    if top == cyr:
        uk, ru = len(re.findall(r"[іїєґ]|\bі\b", t, F)), len(re.findall(r"[ыэъё]|\b(что|это|как|мне|нужно|сколько|спасибо)\b", t, F))
        return "uk" if uk > ru else "ru" if ru > uk else None
    scores = {k: len(re.findall(rx, t, F)) for k, rx in STOP.items()}
    best = max(scores, key=scores.get)
    second = sorted(scores.values())[-2]
    return best if scores[best] >= 2 and scores[best] > second else None


RULES = [
    ("бригади числом", r"(\b\d+|\b(дв[іеа]|три|чотири|п.ять|пять|two|three|four|five))\s+(бригад|crews?\b|teams?\b)|бригад\w*\s*[—:-]?\s*\d"),
    ("безкоштовний замір", r"безкоштовн\w*\s+(замір|виїзд|вимір)|бесплатн\w*\s+(замер|выезд)|free\s+(measur\w*|site visit|survey|visit)|"
                           r"(замір|виїзд|вимір|замер|выезд)\w*\s*(—|-|–|:|є|буде|будет)?\s*(безкоштовн|бесплатн)|(measurement|site visit|survey)s?\s+(is|are)\s+free|"
                           r"medici[oó]n gratuit|visita gratuit|darmow\w* (pomiar|wizyt)|bezpłatn\w* (pomiar|wizyt)|kostenlos\w* (aufmaß|vor-ort|besichtigung)|"
                           r"métré gratuit|visite gratuite|medição gratuita|visita gratuita|قياس مجاني|免费测量|免费上门"),
    ("інший бренд", r"оздоб|ozdoba|osokor|осокор|aqulla|аквілл|аквилл"),
    ("внутрішнє", r"system prompt|системн\w* (промпт|інструкц)|leadbot|x-bot-key|api[ _-]?key|ключ api|токен доступу"),
    ("КП у PDF від бота", r"(надішлю|надсилаю|відправлю|отправлю|пришлю|i will send|i'll send|te enviaré|wyślę|ich schicke|je vous envoie|vou enviar)\W+(\w+\W+){0,3}(кп|комерційн\w* пропоз|коммерческ\w* предлож|pdf|proposal|quote|presupuesto|ofert\w*|angebot|devis|orçamento)"),
    ("імʼя фахівця", r"(прораб\w*|геодезист\w*|мебляр\w*|мебельщик\w*|foreman|surveyor)\s+[A-ZА-ЯІЇЄҐ][a-zа-яіїєґʼ']{2,}"),
]
DISCOUNT = r"знижк|скидк|discount|descuento|rabat|remise|desconto|خصم|折扣|优惠"
NEG = r"\bне\b|немає|нет\b|\bno\b|\bnot\b|\bsin\b|\bnie\b|\bkein|\bpas\b|\bsem\b|\bnão\b|لا|没有|不"
GUAR = r"(гаранті\w*|гаранти\w*|warrant\w*|guarant\w*|garant\w*|gwarancj\w*|ضمان|保修|质保)[^.\n!?]{0,40}?(\d+)\s*(міс|мес|month|mes|mies|monat|mois|mês|рок|рік|год|лет|year|año|rok|lat\b|jahr|an\b|ans\b|ano|شهر|سن|个月|年)"


SCRIPT = {"uk": "cyr", "ru": "cyr", "ar": "ar", "zh": "zh"}


def script(text):
    t = text or ""
    n = {"ar": len(re.findall(r"[\u0600-\u06ff]", t)), "zh": len(re.findall(r"[\u4e00-\u9fff]", t)),
         "cyr": len(re.findall(r"[а-яёіїєґ]", t, F)), "lat": len(re.findall(r"[a-zà-ÿąęłńśźżœß]", t, F))}
    best = max(n, key=n.get)
    return best if n[best] else None


def lang_mismatch(text, lang):
    """Текст іншою мовою, ніж треба: інша писемність або впізнана інша мова."""
    sc = script(re.sub(r"CAS Development|CAS|cas-develop\.com|https?://\S+|Google|Telegram|WhatsApp|Viber|WeChat|USDT|SWIFT", "", text or ""))
    if sc and sc != SCRIPT.get(lang, "lat"):
        return sc
    lg = detect_lang(text)
    return lg if lg and lg != lang else None


def sentences(text):
    return [s for s in re.split(r"(?<=[.!?。！？…])\s+|\n+", text or "") if s.strip()]


def problems(text):
    """→ список порушень (назви правил)."""
    out = [name for name, rx in RULES if re.search(rx, text or "", F)]
    for s in sentences(text):
        if re.search(DISCOUNT, s, F) and not re.search(NEG, s, F):
            out.append("знижка")
        for m in re.finditer(GUAR, s, F):
            n, unit = int(m.group(2)), m.group(3).lower()
            if not ((n == 12 and not re.match(r"рок|рік|год|лет|year|año|rok|lat|jahr|an|ano|سن|年", unit)) or
                    (n == 1 and re.match(r"рок|рік|год|year|año|rok|jahr|an|ano|سن|年", unit))):
                out.append("гарантія не 12 міс.")
    return sorted(set(out))


CUR = r"[$€₴]|\b(usd|eur|uah|грн|гривень|гривн\w*|долар\w*|доллар\w*|dollars?|dólares|dolar\w*|euros?|євро|евро|złotych)\b|دولار|美元|欧元"
NUMRX = r"\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?"


def _n(s):
    s = s.replace(" ", " ").replace(" ", " ")
    if re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+", s):
        return float(re.sub(r"\D", "", s))
    try:
        return float(s.replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def strip_money(text, allowed):
    """Викинути речення з сумами/цінами, яких немає серед дозволених чисел (estimate + публічні ставки). → (текст, скільки викинуто)."""
    keep, dropped = [], 0
    for s in sentences(text):
        if re.search(CUR, s, F) or re.search(r"\d\s*%", s):
            nums = [_n(x) for x in re.findall(NUMRX, s)]
            if any(v is None or (v not in allowed and v not in (12.0, 1.0, 10.0, 2.0, 5.0)) for v in nums) or re.search(r"\d\s*%", s) and not re.search(r"(±|\+/-)\s*5\s*%|10\s*%", s):
                dropped += 1; continue
        keep.append(s.strip())
    return " ".join(keep).strip(), dropped


def shorten(text, max_chars=700, max_lines=8):
    out = []
    for s in sentences(text):
        if len(" ".join(out + [s])) > max_chars or len(out) >= max_lines:
            break
        out.append(s.strip())
    return " ".join(out)


def clean_markup(text):
    t = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m.group(1) or m.group(2), text or "")
    t = re.sub(r"^#+\s*", "", t, flags=re.M)
    t = re.sub(r"```.*?```", "", t, flags=re.S)
    t = re.sub(r"<[^>]{1,40}>", "", t)
    return t.strip()
