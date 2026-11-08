#!/usr/bin/env python3
"""«Менше стіни тексту»: іконки до заголовків, згортання довгих блоків і позначка «Анімація реалізації» (UI-kit /styleguide/#ux).

  python3 tools/site/ux.py            # оновити згенеровані блоки в /assets/site-chrome.v1.{js,css} (тексти мов, версія спрайту)
  python3 tools/site/ux.py --check    # лише перевірка (код 1, якщо блоки застаріли)
  python3 tools/site/ux.py --stats    # покриття іконками: які H2 дістали лише запасну іконку «dm»

Розмітку сторінок ставить apply(s, rel) — його викликає chrome.apply() (тобто всі генератори й ручні сторінки), тому
руками в HTML нічого не пишемо. Усе — атрибутами в кілька байтів (бюджет HTML 64 КБ):
  data-i="<ключ>"  на <h2> секцій і <h3> карток — іконка з /assets/icons.v1.svg (Lucide, ISC). Мапа «тема → іконка» — RULES
                   нижче (усі мови сайту), запасна — «dm» (ромб). <svg><use href> вставляє site-chrome.v1.js; місце під іконку
                   резервує CSS (.js h2[data-i]) — без зсуву макета;
  data-c="t|s|q|g|l" на контейнері — згорнутий блок: t — довгий текст (видно перший абзац, 4 рядки), s — етапи (видно назви,
                   описи сховані), q — FAQ (перші 5 питань), g — сітка карток (перші 6), l — довгий список у статті (перші 5).
                   Текст лишається в DOM (SEO, JSON-LD), ховає лише CSS під .js; кнопку «Читати далі / Показати всі N»
                   (button, aria-expanded) додає site-chrome.v1.js у зарезервоване місце (padding-bottom) — CLS 0;
  data-a / data-a="s" / data-a="i" на посиланнях на сторінки з анімацією «Будинок/Ремонт з нуля» (tools/site/buildanim.py PAGES):
                   картки й заголовки — повний бейдж, ряди посилань «Інші послуги» — короткий, футер «Усі послуги» — лише
                   анімована іконка. Підписи — CSS (--ux-a/--ux-as) за мовою сторінки.
Не чіпаємо: H1, hero, ціни («від», data-est, таблиці), форми, «Коротко», блок build-anim (.bz).
Тексти кнопок і бейджів: uk/ru — UX нижче, решта мов — tools/site/lang/<мова>.json ("ux").
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n  # noqa: E402

SPRITE = '/assets/icons.v1.svg'
SCUI = '/assets/scene-ui.v1.css'  # спільні стилі керування сцен (la-*), версію в site-chrome.v1.js дописує sync()
JS = 'assets/site-chrome.v1.js'
CSS = 'assets/site-chrome.v1.css'

# підписи: more/less — довгий текст; q — усі питання; s — описи етапів; g — ще картки; l — весь список ({n} — скільки сховано);
# a — бейдж «Анімація реалізації», as — короткий бейдж; go_house / go_flat — кнопка в hero сторінки з анімацією
UX = {
    'uk': dict(more='Читати далі', less='Згорнути', q='Усі питання ({n})', s='Детальніше про кожен етап', g='Показати ще ({n})',
               l='Весь список ({n})', a='Анімація реалізації', **{'as': 'Інтерактив'}, go_house='Дивитись, як ми будуємо',
               go_flat='Дивитись, як ми ремонтуємо', calc='Порахувати', trust='150+ проєктів · 12 міс. гарантія · своя команда'),
    'ru': dict(more='Читать дальше', less='Свернуть', q='Все вопросы ({n})', s='Подробнее о каждом этапе', g='Показать ещё ({n})',
               l='Весь список ({n})', a='Анимация реализации', **{'as': 'Интерактив'}, go_house='Смотреть, как мы строим',
               go_flat='Смотреть, как мы ремонтируем', calc='Рассчитать', trust='150+ проектов · 12 мес. гарантия · своя команда'),
}
for _l in i18n.LANGS:
    if _l not in UX and (i18n.ui(_l) or {}).get('ux'):
        UX[_l] = i18n.ui(_l)['ux']

# ── іконки: ключ спрайту → перший збіг правила (текст заголовка в нижньому регістрі, будь-якою мовою сайту) ──
B = r'(?<![\w-])'  # початок слова (короткі основи: «дом», «сад», «plan»)
RULES = [
    ('nf', r'коротко|кратко|in short|summary|en resumen|w skrócie|kurz gesagt|en bref|简介|概要|باختصار'),
    ('fq', r'питан|вопрос|question|' + B + r'faq|pregunt|pytani|fragen|常见问题|问答|疑问|أسئلة|سؤال'),
    ('rf', r'рефера|referral|referid|polecen|empfehlung|parrainage|推荐|إحالة|партнер|партнёр|partner'),
    ('ca', r'калькулят|розрахува|рассчита|порахува|посчита|calculat|calcul|oblicz|kalkulat|berechn|rechner|计算|احسب|حاسب|'
           r'tell us about|cuéntenos|opowiedz|erzählen sie|parlez-nous|提交项目|حدّثنا|замовити схож|заказать похож|order a similar'),
    ('st', r'як (?:ми )?працю|чек-?ліст|чек-?лист|checklist|lista kontrol|как (?:мы )?работа|how (?:we|it) work|cómo trabaj|jak pracuj|so arbeiten|notre méthode|comment nous|合作流程|流程|'
           r'كيف نعمل|етап|этап|' + B + r'stage|' + B + r'step|etap|phase|étape|' + B + r'krok|кроки|шаги|порядок|ablauf|步骤|مراحل'),
    ('gu', r'гарант|warrant|guarant|garant|gwaranc|保修|保障|质保|ضمان'),
    ('do', r'договір|договор|contract|contrato|' + B + r'umow|vertrag|contrat|合同|عقد|документ|document|' + B + r'акт' + r'(?!\w)'),
    ('rc', r'оплат|\d0/\d0|payment|' + B + r'pago|płatno|zahlung|paiement|付款|支付|الدفع|рахун|' + B + r'счёт|' + B + r'счет|invoice|factura|faktur|facture'),
    ('pc', r'знижк|скидк|discount|descuent|rabat|' + B + r'remise|折扣|خصم'),
    ('pr', r'вартіст|стоимост|' + B + r'цін|' + B + r'цен[аыу]|скільки кошт|сколько сто|кошторис|смет|бюджет|' + B + r'price|pric|' + B + r'cost|budget|'
           r'кошту|коштув|' + B + r'стоит|precio|coste|presupuest|' + B + r'cen[ay]|koszt|preis|kosten|' + B + r'prix|coût|tarif|价格|费用|报价|预算|造价|سعر|أسعار|تكلفة|ميزانية'),
    ('ey', r'нагляд|надзор|supervis|nadzór|aufsicht|bauleitung|监理|إشراف'),
    ('in', r'що входить|что входит|what.?s included|included|incluye|incluid|obejmuj|zakres|leistungsumfang|umfang|inclus|服务内容|包含|تشمل|'
           r'склад |состав'),
    ('ti', r'строк|термін|' + B + r'срок|скільки трива|сколько длит|timeline|how long|timing|duration|plazo|' + B + r'tiempo|' + B + r'termin(?!at)|' + B + r'czas|'
           r'dauer|zeitplan|délai|durée|工期|时间|周期|مدة|графік|график|schedule'),
    ('cm', r'камер|kamer|cámara|caméra|摄像|汇报|онлайн|контрол|фотозвіт|фотоотч|звіт|отчёт|отчет|' + B + r'report|camera|control|kontrol|überwach|contrôle|suivi|监控|报告|'
           r'كاميرا|مراقبة|تقارير|прозор|прозрач|transparen'),
    ('te', r'команд|cuadrilla|施工队|فرق|brygad|бригад|прораб|майстр|мастер|' + B + r'team|' + B + r'crew|equipo|ekip|zespół|handwerker|équipe|团队|فريق|хто ми|кто мы|'
           r'хто викон|кто выполн|about us|про нас|о нас|про студ|о студ|who we are|quiénes|o nas|über uns|qui sommes|关于我们|من نحن'),
    ('hf', r'тепл[аи] підлог|тепл(?:ый|ые) пол|опален|отоплен|heating|calefacc|ogrzew|heizung|chauffage|供暖|تدفئة'),
    ('fa', r'вентиляц|кондиц|ventilat|klimat|lüft|climatis|通风|空调|تهوية'),
    ('lp', r'освітл|освещ|' + B + r'світл|' + B + r'свет(?!у|ск)|lighting|ilumin|oświetl|beleucht|éclairage|照明|灯光|إضاءة'),
    ('el', r'електр|інженер|инженер|engineer|ingenier|instalac|haustechnik|ingénierie|工程|هندس|электр|electric|eléctr|elektr|électri|电气|电路|كهرب'),
    ('ba', r'' + B + r'ванн|санвуз|санузл|bathroom|baño|łazien|badsan|' + B + r'bad(?!\w)|salle de bain|浴室|卫生间|حمام'),
    ('pl', r'сантех|водопост|каналіз|канализ|гідроізол|гидроизол|plumb|fontaner|hydraul|sanitär|plomberie|水电|سباكة'),
    ('ki', r'кухн|kitchen|cocina|kuchn|küche|cuisine|厨房|مطبخ|шаф|wardrobe|armario|szaf|schrank|placard|衣柜|خزائن'),
    ('la', r'ландшафт|терас|terrace|terraza|taras|terrasse|благоустр|' + B + r'сад|ділянк|участ(?:ок|ка|ке)|landscap|garden|paisaj|jardín|krajobraz|ogród|garten|paysag|jardin|景观|园林|حديقة|حدائق|تنسيق'),
    ('rs', r'ресторан|' + B + r'кафе|restaurant|café|' + B + r'cafe|restauracj|kawiarn|gastronom|餐厅|مطعم'),
    ('ht', r'готел|гостиниц|hotel|hôtel|酒店|فندق'),
    ('tr', r'баз[аиу] відпоч|баз[аыу] отдых|resort|turístic|ośrod|ferienanlage|base de loisirs|度假|منتجع'),
    ('of', r'офіс|офис|office|oficina|' + B + r'biur|büro|bureau|办公|مكتب|open space|коворк'),
    ('cs', r'магазин|шоурум|бізнес|бизнес|комерц|коммерч|business|commercial|negocio|comercial|biznes|komercyj|gewerb|commerce|商业|商铺|تجاري'),
    ('pm', r'преміум|премиум|люкс|luxury|premium|' + B + r'lujo|luksus|luxus|' + B + r'luxe|高端|豪华|فاخر'),
    ('x3', B + r'3d|360|' + B + r'тур(?!\w)|' + B + r'tour|візуаліз|визуализ|visuali|render|渲染|效果图'),
    ('ac', r'архітект|кресл|чертеж|drawing|rysun|zeichnung|dessin|图纸|مخطط|архитект|проєктуван|проектирован|архпроєкт|architect|arquitect|architekt|建筑设计|معماري'),
    ('pn', r'перепланув|' + B + r'площ|' + B + r'area|superficie|powierzch|fläche|面积|مساحة|planung|układ|distribuci|переплан|планув|планиров|' + B + r'layout|planning|' + B + r'plano|planowan|grundriss|aménagement|规划|平面|تخطيط|'
           r'замір|замер|обмір|обмер|survey|medici|pomiar|aufmaß|' + B + r'mesure|测量|قياس'),
    ('fu', r'мебл|мебел|ausstatt|wyposaż|equipam|меблир|комплектац|декор|furnish|furnitur|muebl|amuebl|equipamiento|' + B + r'mebl|kompletac|möbel|einricht|meubl|ameublement|'
           r'家具|软装|أثاث|تأثيث|оздоба|ozdoba|китай|' + B + r'china|' + B + r'chin[ae]'),
    ('bw', r'' + B + r'стін|' + B + r'стен|газоблок|цегл|кирпич|' + B + r'брус|каркас|модульн|фундамент|коробк|покрівл|кровл|' + B + r'wall|brick|timber|'
           r'' + B + r'frame|modular|foundation|' + B + r'roof|' + B + r'muro|ladrillo|madera|ścian|cegł|szkielet|' + B + r'wand|ziegel|' + B + r'holz|'
           r'brique|ossature|墙|砖|框架|模块|جدران|طوب'),
    ('wa', r'помилк|ошибк|mistake|' + B + r'error|błęd|fehler|erreur|errores|错误|أخطاء|ризик|риск|' + B + r'risk'),
    ('hh', r'реаліз|реализ|realiz|implement|umsetz|ejecuci|exécution|réalisation|实施|تنفيذ|генпідряд|генподряд|contractor|contratista|wykonawc|generalunternehm|entreprise générale|总包|مقاول'),
    ('wr', r'підготов|подготов|preparat|przygotow|vorbereit|preparaci|préparat|准备|تحضير'),
    ('re', r'ремонт|renovier|trabajo|wykończ|демонтаж|оздобл|отделк|renovat|refurb|reform|remont|sanier|umbau|rénov|装修|翻新|تجديد|ترميم|' + B + r'робот|' + B + r'работ|'
           r'' + B + r'works|' + B + r'obras|' + B + r'prace|arbeiten|travaux'),
    ('ho', r'будин|' + B + r'bau(?!\w)|neubau|будівниц|будуєм|строител|строим|' + B + r'дом|котедж|коттедж|' + B + r'house|' + B + r'home|villa|вілл|вилл|' + B + r'casa|'
           r'construc|' + B + r'dom(?!\w)|' + B + r'domu|' + B + r'domy|budow|' + B + r'haus|maison|房屋|别墅|منزل|بناء|فيلا'),
    ('fl', r'квартир|' + B + r'жк|новобуд|новостро|apartment|' + B + r'flat|' + B + r'piso|apartamento|mieszkan|wohnung|appartement|公寓|شقة|شقق|'
           r'пентхаус|penthouse|таунхаус|townhouse'),
    ('de', r'дизайн|design|diseñ|' + B + r'projekt wn|gestalt|conception|décor|设计|تصميم|інтер.?єр|интерьер|interior|interieur|wnętrz|intérieur|室内|ديكور'),
    ('pj', r'проєкт|проект|портфол|' + B + r'фото|кейс|приклад|пример|project|portfolio|photo|' + B + r'case|proyecto|realizac|projekt|projet|réalis|'
           r'项目|案例|مشاريع|مشروع|صور'),
    ('ar', r'' + B + r'стат(?:т|ь)|корисн|полезн|useful|блог|читайте|article|' + B + r'blog|read also|related|artícul|artykuł|czytaj|artikel|weiterlesen|lire aussi|'
           r'文章|阅读|مقالات|اقرأ'),
    ('gl', r'європ|европ|europe|europa|' + B + r'світ(?!л)|' + B + r'мир(?!\w)|world|international|abroad|weltweit|świat|кордон|рубеж|全球|欧洲|أوروبا|world'),
    ('gp', r'місто|регіон|регион|gdzie|dónde|' + B + r'wo(?!\w)|міст[аі]|' + B + r'город|район|област|україн|украин|київ|киев|поруч|рядом|де працю|где работ|географ|' + B + r'kyiv|' + B + r'kiev|kyjiw|kijów|ucrania|'
           r'ukrain|' + B + r'city|region|where|ciudad|miast|' + B + r'stadt|' + B + r'ville|' + B + r'où|地区|城市|基辅|乌克兰|مدينة|منطقة|أين|كييف|أوكرانيا'),
    ('os', r'послуг|услуг|service|servicio|usług|leistung|prestation|服务|خدمات|خدمة'),
    ('ph', r'контакт|telefon|телефон|зв.?яз|связ|консульт|contact|phone|' + B + r'call|contacto|kontakt|anruf|' + B + r'appel|联系|电话|اتصل|اتصال|هاتف'),
    ('cl', r'запис|зустріч|встреч|booking|appointment|' + B + r'cita|spotkan|vereinbar|rendez-vous|预约|موعد'),
    ('rv', r'відгук|отзыв|рейтинг|review|rating|reseña|opini|bewertung|' + B + r'avis|评价|تقييم|آراء'),
    ('wy', r'чому|почему|переваг|преимущ|' + B + r'why|advantage|benefit|por qué|ventaj|dlaczego|zalet|warum|vorteil|pourquoi|avantage|为什么|优势|لماذا|مزايا'),
    ('pv', r'запуск|' + B + r'launch|lanzamiento|uruchom|eröffnung|lancement|开业|إطلاق'),
    ('ky', r'під ключ|под ключ|turnkey|llave en mano|pod klucz|schlüsselfertig|clé en main|交钥匙|تسليم مفتاح'),
    ('tk', r'доставк|логіст|логист|постав|delivery|logistic|shipping|entrega|dostaw|lieferung|livraison|物流|配送|توصيل|شحن'),
    ('mt', r'матеріал|материал|material|materiał|matériau|材料|مواد'),
]
RULES = [(k, re.compile(p, re.I)) for k, p in RULES]
FALLBACK = 'dm'


def plain(t):
    t = re.sub(r'<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t).replace(' ', ' ')).strip().lower()


def icon(text):
    t = plain(text)
    for k, rx in RULES:
        if rx.search(t):
            return k
    return FALLBACK


# ── сторінки з анімацією реалізації (buildanim.PAGES без головних) ──
def _anim_urls():
    import buildanim
    out = {}
    for rel, (scene, compact) in buildanim.PAGES.items():
        if compact or rel.endswith('index.html'):
            continue
        p = '/' + rel[:-5]
        out[p] = scene
    return out


ANIM = _anim_urls()

# ── «Легкі» головні сторінки (Михайло 02.11.2026: «на головних — лише назви, усі деталі — всередині, при натисканні») ──
# Кластери (усі мови, tools/site/lang/clusters*.json) + окремі сторінки з їхніми перекладами. На цих сторінках:
#   hero — H1, рядок ціни, лід згорнутий в один рядок (data-c="h", тап — розгорнути), кнопки «Подзвонити» + «Порахувати»
#          (a.ux-calc → квіз / калькулятор сторінки / калькулятор мови / форма), без рядка довіри (з 08.11.2026), .facts і WhatsApp;
#   секції — плитки (data-c="x" на <div class="w">): іконка + назва (H2) + рядок «від $…» (data-xs); тап — розгортає на місці.
#          Текст лишається в DOM (SEO, FAQPage). Не плитки: форма, калькулятор, квіз, гід, «Будинок з нуля», карта, контакти.
LIGHT_CLUSTERS = ('home', 'services', 'about', 'contact', 'design', 'renovation', 'construction', 'calculator', 'landscape', 'resort', 'restaurant', 'office', 'furnishing')
LIGHT_EXTRA = ('/portfolio', '/remont-kvartyr-kyiv', '/ru/remont-kvartir-kiev', '/vartist-remontu-kvartyry-kyiv', '/ru/stoimost-remonta-kvartiry-kiev')
# ручні uk-сторінки: класи секцій, що стають плитками (h2 — нащадок секції; атрибут — на самій <section>)
LIGHT_CUSTOM = {
}
LIGHT_SKIP = ('ab-cta',)  # заклик з кнопками лишається на виду


def _light_pages():
    c = i18n.clusters()
    paths = set()
    for k in LIGHT_CLUSTERS:
        paths |= set(c.get(k, {}).values())
    for p in LIGHT_EXTRA:
        paths |= set((i18n.cluster_of(p) or {}).values()) | {p}
    return {i18n.path_to_file(p) for p in paths}


LIGHT = _light_pages()
# «Про студію» всіх мов: вступ (rich split, div.xs-tx) — видно лід у 3 рядки, решта абзаців і цінності — за «Читати далі» (data-c="t")
ABOUT = {i18n.path_to_file(p) for p in i18n.clusters().get('about', {}).values()}
CALC = {l: p for l, p in i18n.clusters().get('calculator', {}).items() if os.path.exists(os.path.join(ROOT, i18n.path_to_file(p)))}
QUIZ_ALT = i18n.clusters().get('renovation', {})  # «Порахувати» без калькулятора мови — квіз ремонту під ключ
PRICE_RX = re.compile(r'(?:(?<![\w$])(?:від|от|from|desde|od|ab|à partir de|dès|من)\s+)\$\s?\d+(?:[\s,]\d{3})*(?:\s?/\s?(?:м²|m²|м2|م²|сотку))?'
                      r'|\$\s?\d+(?:[\s,]\d{3})*(?:\s?/\s?(?:m²|㎡))?\s?起', re.I)
CALC_RX = re.compile(r'\n?\s*<a class="btn ux-calc" href="[^"]*">[^<]*</a>')


def _tile_ok(sid, body):
    if re.search(r'zayavka|"calc"|kalkulyator', sid) or not re.match(r'\s*(?:<style>.*?</style>\s*)?<h2\b', body, re.S):
        return False
    return not re.search(r'<form\b|gd-slot|class="bz|data-quiz|class="lq"|href="tel:', body)


def _summary(body):
    """Рядок плитки: перша ціна «від $…» секції (не з FAQ і не та, що вже в назві)."""
    h2 = re.search(r'<h2[^>]*>(.*?)</h2>', body, re.S)
    if body.count('<details') >= 2 or '<table' in body or (h2 and (PRICE_RX.search(plain(h2.group(1))) or KOROTKO.search(plain(h2.group(1))))):
        return ''
    m = PRICE_RX.search(plain(body))
    return html.escape(m.group(0).strip(), quote=True) if m else ''


def _tile_h2(body):
    """data-i на H2 плитки (на головних іконок заголовків немає — плиткам вони потрібні)."""
    return re.sub(r'<h2((?:\s+id="[^"]*")?)>(.*?)</h2>', lambda x: f'<h2{x.group(1)} data-i="{icon(x.group(2))}">{x.group(2)}</h2>', body, count=1, flags=re.S)


def _lead_dup(hp):
    """Лід, що починається з тексту H1 («Вартість ремонту… в Києві: від $550…»): у згорнутому рядку
    видно лише повтор заголовка. Повтор — у span.ux-dup (прихований, поки лід згорнутий; текст лишається в DOM)."""
    if 'ux-dup' in hp:
        return hp
    h = re.search(r'<h1[^>]*>(.*?)</h1>', hp, re.S)
    p = re.search(r'<p data-c="h">', hp)
    if not h or not p:
        return hp
    t = re.sub(r'<[^>]+>', '', h.group(1)).strip()
    k = p.end()
    x = re.match(re.escape(t) + r'(?:\s+(?:в|у|in|at|bei|en|à|w)\s+(?:студії\s+|студии\s+)?CAS Development)?(?:\s*[:—–-]\s*|\s+—\s+|,\s+)', hp[k:], re.I)
    if not t or not x:
        return hp
    return hp[:k] + f'<span class="ux-dup">{hp[k:k + x.end()]}</span>' + hp[k + x.end():]


TEL = 'tel:+380978667755'
SENT_RX = re.compile(r'(?<=[.!?。！？])\s*(?=[0-9A-ZА-ЯІЇЄҐÀ-ÝĄĆĘŁŃÓŚŹŻ¿¡«"\u4e00-\u9fff\u0600-\u06ff])')


def _lead_rest(hp):
    """Мінімалістичний hero (Михайло 04.11.2026): видно лише перше речення ліду (після повтору H1 — span.ux-dup);
    решта — у span.ux-rest (прихована, поки лід згорнутий; тап — увесь текст; у DOM лишається)."""
    p = re.search(r'<p data-c="h">(?:<span class="ux-dup">.*?</span>)?', hp, re.S)
    if not p:
        return hp
    end = hp.find('</p>', p.end())
    body = hp[p.end():end]
    ln = re.match(r'<span class="ux-ln">.*?</span>', body, re.S)  # головні: видимий рядок «Київ · Україна · Worldwide», лід — увесь у ux-rest
    if ln:
        return hp[:p.end()] + body[:ln.end()] + f'<span class="ux-rest">{body[ln.end():]}</span>' + hp[end:]
    for x in SENT_RX.finditer(body):
        k = x.start()
        pre = body[:k]
        if k < 12 or len(re.findall(r'<[a-z]', pre)) != len(re.findall(r'</', pre)):
            continue
        if not body[k:].strip():
            break
        return hp[:p.end()] + body[:k] + f'<span class="ux-rest">{body[k:]}</span>' + hp[end:]
    return hp


def _call_first(m, i, lang):
    """Перша кнопка hero — «Подзвонити» (tel:); якщо її нема — додаємо, інші кнопки лишаються в DOM (CSS ховає з третьої)."""
    k = m.find('<div class="btns">', i)
    e = m.find('</div>', k)
    if k < 0 or e < 0:
        return m
    b = m[k:e]
    anchors = list(re.finditer(r'\n?[ \t]*<a\b[^>]*>.*?</a>', b, re.S))
    if not anchors:
        return m
    tel = next((a for a in anchors if f'href="{TEL}"' in a.group(0) or 'href="tel:' in a.group(0)), None)
    if tel is anchors[0]:
        return m
    if tel is None:
        import leadform
        c = leadform._call(lang)
        if not c:
            return m
        x = f'\n    <a class="btn" href="{TEL}">{html.escape(c[0])}</a>'
    else:
        x = '\n    ' + tel.group(0).strip()
        b = b[:tel.start()] + b[tel.end():]
    j = anchors[0].start()
    b = b[:j] + x + b[j:]
    return m[:k] + b + m[e:]


HERO_SKIP = re.compile(r'(?:[a-z]{2}/)?(?:blog|proekty)/')


def _light_hero(m, rel, lang, full):
    i = m.find('<div class="w hero">')
    if i < 0:
        return m
    end = _close(m, 'div', i)
    k = m.find('<div class="btns">', i)
    home = bool(re.search(r'<div class="hx hx-home">\s*(?:<picture\b(?:(?!</picture>).)*</picture>)?\s*$', m[max(0, i - 4000):i], re.S))
    if k < 0 or k > end:  # кнопки — лише всередині hero
        if not home or end < 0:
            return m
        k = m.rfind('\n', i, end - len('</div>'))  # головна без кнопок: лід — до кінця hero
        if k < 0:
            return m
    hp = m[i:k]
    hp = hp.replace('<p>', '<p data-c="h">', 1) if '<p>' in hp else hp
    hp = _lead_rest(_lead_dup(hp))
    m = m[:i] + hp + m[k:]
    if home:
        # головні (9 мов, Михайло 08.11.2026): hero без кнопок — лише H1 + рядок; дзвінок — у шапці й пігулці «Зв'язатися»
        k = m.find('<div class="btns">', i)
        if 0 <= k < _close(m, 'div', i):
            e = m.find('</div>', k)
            m = m[:k].rstrip(' \t\n') + m[e + 6:]
        return m
    m = _call_first(m, i, lang)
    k = m.find('<div class="btns">', i)
    a = m.find('</a>', k)
    if a < 0:
        return m
    if 'id="calc"' in full:
        href = '#calc'
    elif rel in _quiz_pages():
        href = '#kalkulyator'
    elif CALC.get(lang) and i18n.path_to_file(CALC[lang]) != rel:
        href = CALC[lang]
    elif QUIZ_ALT.get(lang) and i18n.path_to_file(QUIZ_ALT[lang]) in _quiz_pages() and i18n.path_to_file(QUIZ_ALT[lang]) != rel:
        href = QUIZ_ALT[lang] + '#kalkulyator'  # мови без сторінки калькулятора: квіз на «Ремонт під ключ»
    else:
        href = '#zayavka'
    t = UX.get(lang, UX.get('en', UX['uk']))
    btn = f'\n    <a class="btn ux-calc" href="{href}">{html.escape(t.get("calc", UX["uk"]["calc"]))}</a>'
    return m[:a + 4] + btn + m[a + 4:]


def _quiz_pages(_c={}):
    if 'p' not in _c:
        import quiz
        _c['p'] = set(quiz.PAGES)
    return _c['p']


def _close(m, tag, k):
    """Індекс кінця елемента <tag>, що відкривається на k (з урахуванням вкладених однойменних тегів)."""
    depth = 0
    for x in re.compile(r'<(/?)' + tag + r'\b[^>]*>').finditer(m, k):
        depth += -1 if x.group(1) else 1
        if depth == 0:
            return x.end()
    return -1


def _light_custom(m, rel):
    """Ручні uk-сторінки: елементи з LIGHT_CUSTOM ('section.клас', 'div.клас', 'section#id') — плитки (data-c на самому елементі)."""
    for spec in LIGHT_CUSTOM.get(rel, ()):
        tag, kind, name = re.match(r'(\w+)([.#])([\w-]+)', spec).groups()
        attr = r'class="' + re.escape(name) + r'(?:\s[^"]*)?"' if kind == '.' else r'id="' + re.escape(name) + '"'
        out, pos = [], 0
        for x in re.finditer(r'<' + tag + r'\s(?=[^>]*\b' + attr + r')[^>]*>', m):
            if x.start() < pos:
                continue
            e = _close(m, tag, x.start())
            if e < 0:
                continue
            otag, body = x.group(0), m[x.end():e]
            if 'data-c=' in otag or any(c in otag for c in LIGHT_SKIP) or '<form' in body or 'href="tel:' in body or '<h2' not in body:
                continue
            body = re.sub(r'<h2\b((?:(?!data-i=)[^>])*)>(.*?)</h2>', lambda y: f'<h2{y.group(1)} data-i="{icon(y.group(2))}">{y.group(2)}</h2>', body, count=1, flags=re.S)
            sm = _summary(body)
            out.append(m[pos:x.start()] + otag[:-1] + ' data-c="x"' + (f' data-xs="{sm}"' if sm else '') + '>' + body)
            pos = e
        m = ''.join(out) + m[pos:]
    return m


# Самотня плитка-банер (серія з 1 плитки — на всю ширину ряду; Михайло 05.11.2026: «сюди краще наш рендер, гарний»):
# замість FLUX-ілюстрації 480×320 — світлий рендер проєкту CAS (img/p/wide-<назва>-800/1200/1400|1600.webp + AVIF, tools/img/build.py),
# object-position — головне (диван/зал) у кадрі; alt — мовою сторінки. Ключ — тема H2 плитки (data-i), решта тем — WIDE_FB.
WIDE = {
    'dm': ('studio', (800, 1200, 1600), '50% 55%'),
    'os': ('living', (800, 1200, 1400), '35% 60%'),
    'st': ('house', (800, 1200, 1400), '40% 60%'),
    'nf': ('lounge', (800, 1200, 1400), '40% 60%'),
    'fq': ('lounge', (800, 1200, 1400), '40% 60%'),
    'gu': ('living', (800, 1200, 1400), '35% 60%'),
    'pj': ('monpark', (800, 1200, 1600), '50% 55%'),
}
WIDE_FB = 'dm'
WIDE_ALT = {
    'studio': dict(uk='Кухня-їдальня з мармуровим столом і кришталевою люстрою — дизайн-проєкт Hodos Villa, CAS Development',
                   ru='Кухня-столовая с мраморным столом и хрустальной люстрой — дизайн-проект Hodos Villa, CAS Development',
                   en='Kitchen-dining room with a marble table and crystal chandelier — Hodos Villa design project by CAS Development',
                   es='Cocina-comedor con mesa de mármol y lámpara de cristal — proyecto Hodos Villa de CAS Development',
                   zh='大理石餐桌与水晶吊灯的厨房餐厅 —— CAS Development 的 Hodos Villa 设计项目',
                   pl='Kuchnia z jadalnią, marmurowy stół i kryształowy żyrandol — projekt Hodos Villa, CAS Development',
                   de='Wohnküche mit Marmortisch und Kristallleuchter — Projekt Hodos Villa von CAS Development',
                   fr='Cuisine-salle à manger, table en marbre et lustre en cristal — projet Hodos Villa de CAS Development',
                   ar='مطبخ وغرفة طعام بطاولة رخامية وثريا كريستالية — مشروع Hodos Villa من CAS Development'),
    'living': dict(uk='Вітальня з каміном і великим диваном — заміський будинок у Петрівцях, CAS Development',
                   ru='Гостиная с камином и большим диваном — загородный дом в Петровцах, CAS Development',
                   en='Living room with a fireplace and a large sofa — country house in Petrivtsi by CAS Development',
                   es='Salón con chimenea y gran sofá — casa en Petrivtsi de CAS Development',
                   zh='带壁炉和大沙发的客厅 —— CAS Development 设计的 Petrivtsi 别墅',
                   pl='Salon z kominkiem i dużą sofą — dom pod Kijowem (Petrivtsi), CAS Development',
                   de='Wohnzimmer mit Kamin und großem Sofa — Landhaus in Petrivtsi von CAS Development',
                   fr='Salon avec cheminée et grand canapé — maison à Petrivtsi par CAS Development',
                   ar='غرفة معيشة بمدفأة وأريكة كبيرة — منزل في بيتريفتسي من CAS Development'),
    'house': dict(uk='Вітальня зі сходами й каміном у приватному будинку — проєкт CAS Development',
                  ru='Гостиная с лестницей и камином в частном доме — проект CAS Development',
                  en='Living room with a staircase and fireplace in a private house — CAS Development project',
                  es='Salón con escalera y chimenea en una casa privada — proyecto de CAS Development',
                  zh='私人住宅中带楼梯和壁炉的客厅 —— CAS Development 项目',
                  pl='Salon ze schodami i kominkiem w domu jednorodzinnym — projekt CAS Development',
                  de='Wohnzimmer mit Treppe und Kamin in einem Privathaus — Projekt von CAS Development',
                  fr='Salon avec escalier et cheminée dans une maison individuelle — projet CAS Development',
                  ar='غرفة معيشة بدرج ومدفأة في منزل خاص — مشروع CAS Development'),
    'lounge': dict(uk='Світла вітальня з диваном і торшером — інтерʼєр від CAS Development',
                   ru='Светлая гостиная с диваном и торшером — интерьер от CAS Development',
                   en='Bright living room with a sofa and floor lamp — interior by CAS Development',
                   es='Salón luminoso con sofá y lámpara de pie — interiorismo de CAS Development',
                   zh='带沙发和落地灯的明亮客厅 —— CAS Development 室内设计',
                   pl='Jasny salon z sofą i lampą podłogową — wnętrze CAS Development',
                   de='Helles Wohnzimmer mit Sofa und Stehleuchte — Interior von CAS Development',
                   fr='Salon lumineux avec canapé et lampadaire — intérieur CAS Development',
                   ar='غرفة معيشة مشرقة بأريكة ومصباح أرضي — تصميم CAS Development'),
    'monpark': dict(uk='Тераса ресторану Monpark увечері, центр Києва — дизайн і реалізація CAS Development',
                    ru='Терраса ресторана Monpark вечером, центр Киева — дизайн и реализация CAS Development',
                    en='Monpark restaurant terrace in the evening, central Kyiv — designed and built by CAS Development',
                    es='Terraza del restaurante Monpark al atardecer, centro de Kiev — diseño y obra de CAS Development',
                    zh='基辅市中心 Monpark 餐厅的夜间露台 —— CAS Development 设计与施工',
                    pl='Taras restauracji Monpark wieczorem, centrum Kijowa — projekt i realizacja CAS Development',
                    de='Terrasse des Restaurants Monpark am Abend, Kyjiw-Zentrum — Design und Umsetzung CAS Development',
                    fr='Terrasse du restaurant Monpark le soir, centre de Kyiv — conception et réalisation CAS Development',
                    ar='شرفة مطعم Monpark مساءً، وسط كييف — تصميم وتنفيذ CAS Development'),
}
WB_RX = re.compile(r'<img class="ux-wb"[^>]*>')
# реальна ширина плитки-банера (замір Playwright 360…2560: 100vw−34 px до 1079, 1046 px до 1366, далі «Широкі екрани» ~59vw+315):
# 402@3 бере 1200w замість 1600w (−74 КБ), 1440@1 — теж 1200w
WB_SIZES = '(max-width:1079px) calc(100vw - 34px), (max-width:1366px) 1046px, calc(59vw + 315px)'


def _wide_img(body, lang):
    h = re.search(r'<h2[^>]*\bdata-i="(\w+)"', body)
    name, ws, pos = WIDE.get(h.group(1) if h else WIDE_FB, WIDE[WIDE_FB])
    alt = WIDE_ALT[name].get(lang) or WIDE_ALT[name]['en']
    srcset = ', '.join(f'/img/p/wide-{name}-{w}.webp {w}w' for w in ws)
    return (f'<img class="ux-wb" src="/img/p/wide-{name}-{ws[1]}.webp" srcset="{srcset}" sizes="{WB_SIZES}" '
            f'loading="lazy" decoding="async" width="{ws[-1]}" height="{ws[-1] // 2}" alt="{html.escape(alt)}" style="object-position:{pos}">')


SPAN_RX = re.compile(r'\sstyle="(?:--s[2346]:\d+;?)+"')
STRIP = [WB_RX, SPAN_RX, re.compile(r'\sdata-i="[a-z0-9]{2}"'), re.compile(r'\sdata-c="[tsqglxhk]"'), re.compile(r'\sdata-a(?:="[si]")?(?=[\s>])'),
         re.compile(r'\sdata-xs="[^"]*"'), re.compile(r'\sdata-cn="\d+"'), CALC_RX]
UNWRAP = re.compile(r'<div data-c="l">(<(ul|ol)>.*?</\2>)</div>', re.S)
REST_RX = re.compile(r'<span class="ux-rest">(.*?)</span>(?=</p>)', re.S)  # друга частина ліду hero (_lead_rest)

H2_RX = re.compile(r'<h2((?:\s+id="[^"]*")?)>(.*?)</h2>', re.S)
H3_RX = re.compile(r'(<div class="card"><h3)>(.*?</h3>)', re.S)
GUAR_RX = re.compile(r'(<div class="ab-guar">)(.*?)(</div></div>\s*(?:<p|</section>))', re.S)
SEC_RX = re.compile(r'(<section((?:\s+id="[^"]*")?)>\s*<div class="(w(?: txt)?)")(>)(.*?)(</div>\s*</section>)', re.S)
KOROTKO = re.compile(r'коротко|кратко|in short|summary|w skrócie|en bref|kurz', re.I)


def _icons(m):
    """data-i на <h2> секцій (лише без класів/стилів: свої заголовки головних сторінок не чіпаємо) і <h3> карток."""
    def h2(x):
        if 'id="bz-h"' in x.group(1):  # блок «Будинок з нуля» має власну шапку
            return x.group(0)
        return f'<h2{x.group(1)} data-i="{icon(x.group(2))}">{x.group(2)}</h2>'
    m = H2_RX.sub(h2, m)
    m = H3_RX.sub(lambda x: f'{x.group(1)} data-i="{icon(x.group(2))}">{x.group(2)}', m)
    m = GUAR_RX.sub(lambda x: x.group(1) + re.sub(r'<div><h3>(.*?</h3>)', lambda y: f'<div><h3 data-i="{icon(y.group(1))}">{y.group(1)}', x.group(2))
                    + x.group(3), m)
    return m


H2I_RX = re.compile(r'<h2\b[^>]*?( data-i="[a-z0-9]+")[^>]*>')
OPEN_RX = re.compile(r'<(?:section|div class="w(?:\s[^"]*)?")[^>]*>')


def _h2_tiles_only(m):
    """Іконка біля H2 — лише в плитках (контейнер з data-c="x": там вона ж ключ ілюстрації плитки); у звичайних заголовках секцій
    іконок немає, і запасного ромба теж (Михайло 06.11.2026, unslop: «іконки над H2 — лише на плитках»). Іконки карток (h3) лишаються."""
    out, pos = [], 0
    for x in H2I_RX.finditer(m):
        prev = list(OPEN_RX.finditer(m, 0, x.start()))
        if prev and 'data-c="x"' in prev[-1].group(0):
            continue
        out.append(m[pos:x.start()] + x.group(0).replace(x.group(1), '', 1))
        pos = x.end()
    return ''.join(out) + m[pos:]


def _collapse_type(sid, cls, body):
    if 'zayavka' in sid or re.search(r'data-est|<table|<form|gd-slot|class="price"|class="bz', body):
        return None
    h2 = re.search(r'<h2[^>]*>(.*?)</h2>', body, re.S)
    if h2 and KOROTKO.search(plain(h2.group(1))):
        return None
    if len(re.findall(r'<details[ >]', body)) >= 7:
        return 'q'
    st = re.search(r'<ol class="steps">(.*?)</ol>', body, re.S)
    if st and st.group(1).count('</span></div></li>') >= 4 and len(plain(''.join(re.findall(r'<span>(.*?)</span></div></li>', st.group(1))))) > 260:
        return 's'
    if '<div class="grid">' in body and body.count('<div class="card">') >= 8:
        return 'g'
    if cls == 'w txt' and 'class="rel' not in body:
        txt = ''.join(re.findall(r'<(?:p|li)\b[^>]*>(.*?)</(?:p|li)>', body, re.S))
        if len(plain(txt)) > 420 and len(re.findall(r'<p\b', body)) >= 1:
            return 't'
    return None


# ── сітка плиток (03.11.2026, «блочність»): main — 12 колонок, плитка займає 12/N (N = 2 / 3 з 760 px / 4 з 1100 / 6 з 2200,
# CSS — «LIGHT-сітка» в site-chrome.v1.css). Тут — неповний останній ряд кожної серії плиток: його плитки ділять ряд порівну
# (style="--s2:12;--s4:6…" на секції-плитці), щоб не лишалось порожніх смуг і дрібних одиноких плиток.
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
TAG_RX = re.compile(r'<!--.*?-->|<(script|style)\b[^>]*>.*?</\1>|<(/?)([a-zA-Z][\w-]*)\b[^>]*?(/?)>', re.S)


def _spans(m, lang=''):
    k = m.find('>', m.find('<main')) + 1
    kids, depth = [], 0  # (позиція кінця відкривного тегу, тег, чи плитка)
    for x in TAG_RX.finditer(m, k):
        if x.group(1) or not x.group(3):
            if x.group(1) and depth == 0:
                kids.append((x.end(), x.group(1), None))  # script/style — прозорі для сітки
            continue
        tag = x.group(3).lower()
        if x.group(2):
            depth -= 1
            if depth < 0:
                break
            continue
        if depth == 0:
            otag = x.group(0)
            tile = tag in ('section', 'div') and ('data-c="x"' in otag or re.match(r'\s*<div class="w(?:\s[^"]*)?"[^>]*data-c="x"', m[x.end():]))
            kids.append((x.start(), otag, bool(tile)))
        if tag not in VOID and not x.group(4):
            depth += 1
    runs, cur = [], []
    for pos, otag, tile in kids:
        if tile is None:
            continue
        if tile:
            cur.append((pos, otag))
        elif cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    edits = []
    for run in runs:
        n = len(run)
        if n == 1 and lang:  # самотня плитка — банер на всю ширину: рендер проєкту замість FLUX (WIDE)
            pos, otag = run[0]
            at = pos + len(otag)
            if 'data-c="x"' not in otag:
                w = re.compile(r'\s*<div class="w(?:\s[^"]*)?"[^>]*data-c="x"[^>]*>').match(m, at)
                at = w.end() if w else -1
            if at > 0:
                edits.append((at, _wide_img(m[at:at + 4000], lang)))
        for i, (pos, otag) in enumerate(run):
            props = []
            for cols in (2, 3, 4, 6):
                full = n // cols * cols
                r = n - full
                if n > 1 and i >= full and r and 12 % r == 0 and 12 // r != 12 // cols:
                    props.append(f'--s{cols}:{12 // r}')
            if props and 'style=' not in otag:
                edits.append((pos + len(otag) - 1, ' style="' + ';'.join(props) + '"'))
    for at, ins in reversed(edits):
        m = m[:at] + ins + m[at:]
    return m


def _collapse(m, light=False):
    def sec(x):
        body = x.group(5)
        if light and _tile_ok(x.group(2), body):
            sm = _summary(body)
            return x.group(1) + ' data-c="x"' + (f' data-xs="{sm}"' if sm else '') + x.group(4) + _tile_h2(body) + x.group(6)
        if light and body.count('<div class="card">') >= 2 and '<div class="grid">' in body:
            # не плитка (контакти, перелік послуг без H2): картки — компактні (назва + перший рядок), тап — деталі
            return x.group(1) + x.group(4) + body.replace('<div class="grid">', '<div class="grid" data-c="k">', 1) + x.group(6)
        k = _collapse_type(x.group(2), x.group(3), body)
        return x.group(1) + (f' data-c="{k}"' if k else '') + x.group(4) + body + x.group(6)
    m = SEC_RX.sub(sec, m)
    if light:  # команда (rich.py team): імʼя й роль на виду, опис — за шевроном / тапом
        m = m.replace('<div class="grid"><div class="card xs-tm">', '<div class="grid" data-c="k"><div class="card xs-tm">', 1)
    # ручні сторінки «Про студію» (uk/ru): довгий вступ і «Як ми працюємо»
    m = re.sub(r'<div class="about-txt">(?=(?:(?!</div>).)*?<p class="about-body"[^>]*>(?:(?!</div>).)*?<p class="about-body")',
               '<div class="about-txt" data-c="t">', m, count=1, flags=re.S)
    m = re.sub(r'(<section class="ab-sec" aria-labelledby="ab-steps-h")>', r'\1 data-c="s">', m, count=1)
    return m


def _article_lists(m):
    """Стаття блогу: розділи «легкого блогу» (tools/blog/light.py, <div class="bsc">) згорнуті до першого абзацу (data-c="t");
    довгі чеклісти поза ними (від 8 пунктів) — перші 5 + «Весь список»."""
    def bsc(x):
        inner = x.group(1)
        blocks = len(re.findall(r'<(?:p|ul|ol|figure|div class="ag)\b', inner))
        return f'<div class="bsc" data-c="t">{inner}</div></section>' if blocks >= 2 and '<p>' in inner else x.group(0)
    m = re.sub(r'<div class="bsc">(.*?)</div></section>', bsc, m, flags=re.S)
    return re.sub(r'(?<!<div data-c="l">)<(ul|ol)>((?:(?!</?(?:ul|ol)[ >]).)*?)</\1>',
                  lambda x: (f'<div data-c="l">{x.group(0)}</div>' if x.group(2).count('<li') >= 8 and '<a href' not in x.group(2)[:400] else x.group(0)),
                  m, flags=re.S)


def _badges(s):
    if not ANIM:
        return s
    hrefs = '|'.join(re.escape(u) for u in sorted(ANIM, key=len, reverse=True))
    a_rx = re.compile(r'<a href="(?:' + hrefs + r')"(?=[\s>])')

    def mark(seg, val=''):
        return a_rx.sub(lambda x: x.group(0) + (f' data-a="{val}"' if val else ' data-a'), seg)
    s = re.sub(r'<h3\b[^>]*>.*?</h3>', lambda x: mark(x.group(0)), s, flags=re.S)
    s = re.sub(r'<div class="rel(?: [^"]*)?"[^>]*>.*?</div>', lambda x: mark(x.group(0), 's'), s, flags=re.S)
    s = re.sub(r'<a href="(?:' + hrefs + r')" class="sv-toggle"', lambda x: x.group(0) + ' data-a="s"', s)
    s = re.sub(r'<nav class="scf-svc-g".*?</nav>', lambda x: mark(x.group(0), 'i'), s, flags=re.S)
    # головна й /services: картки «Ремонт під ключ» і «Будівництво» (ведуть на /services, тож за id картки)
    s = re.sub(r'<div class="sp-name"(?=><button[^>]*\bid="sp-[rc]-nm")', r'\g<0> data-a', s)
    s = re.sub(r'<h2 class="sv-name" id="sv-[rc]-nm"', r'\g<0> data-a', s)
    return s


def strip(s):
    """Сторінка без атрибутів ux (для генераторів, що беруть живу сторінку за шаблон і шукають у ній точні рядки)."""
    s = REST_RX.sub(r'\1', s)
    s = UNWRAP.sub(r'\1', s)  # спершу обгортки списків (STRIP зняв би з них data-c і лишив порожній <div>)
    for rx in STRIP:
        s = rx.sub('', s)
    return s


OZD_RX = re.compile(r'[a-z]{2}/ozdoba\.html$')  # Оздоба інших мов (tools/products/intl.py); uk /ozdoba — розмітка в ozdoba.html (ux її не чіпає)


def _ozd(m):
    """Нижні інфоблоки Оздоби згорнуті: «Для бізнесу» (.b2b4) і «Як працює замовлення» (ol.steps4) — назви на виду, описи за кнопкою (s);
    один довгий абзац (p.klead) — 3 рядки (t); FAQ — перші 3 питання (q, data-cn)."""
    def sec(x):
        o, body = x.group(1), x.group(2)
        if 'data-c=' in o or 'id=' in o:
            return x.group(0)
        if 'class="b2b4"' in body or 'class="steps4"' in body:
            k = ' data-c="s"'
        elif len(re.findall(r'<details>', body)) >= 4:
            k = ' data-c="q" data-cn="3"'
        elif re.search(r'^\s*<h2[^>]*>.*?</h2>\s*<p class="klead">', body, re.S) and body.count('<p') == 1:
            k = ' data-c="t"'
        else:
            return x.group(0)
        return o[:-1] + k + '>' + body
    return re.sub(r'(<section class="ozd-sec"[^>]*>)(.*?)(?=</section>)', sec, m, flags=re.S)


def apply(s, rel):
    """Ідемпотентно: спершу знімає свої атрибути, потім ставить заново (джерело правди — цей файл)."""
    rel = rel.replace(os.sep, '/')
    if rel.startswith(('kabinet', 'ozdoba', 'tury', 'styleguide', 'konfigurator')) or '/ozdoba/' in rel:
        return s
    i, j = s.find('<main'), s.find('<!--/chrome:f-->')
    if i < 0:
        return s
    if j < 0:
        j = len(s)
    part = s[i:j]
    part = strip(part)
    e = part.find('</main>')
    m, rest = (part[:e], part[e:]) if e >= 0 else (part, '')
    if not re.match(r'(?:[a-z]{2}/)?index\.html$', rel):  # головні — без іконок заголовків (вага й LCP головної)
        m = _icons(m)
    light = rel in LIGHT
    if light or not HERO_SKIP.match(rel):  # мінімалістичний hero — на всіх сторінках з .w.hero, крім статей і проєктів
        lm = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
        m = _light_hero(m, rel, lm.group(1) if lm else 'uk', s)
    if light:
        m = _light_custom(m, rel)
        m = re.sub(r'(<!--cas:tldr-->(?:(?!<!--/cas:tldr-->).)*?)<p style="margin:0">', r'\1<p style="margin:0" data-c="h">', m, count=1, flags=re.S)
    m = _collapse(m, light)
    if OZD_RX.match(rel):
        m = _ozd(m)
    if rel in ABOUT:
        m = re.sub(r'<div class="xs-tx">(?=(?:<h2[^>]*>.*?</h2>)?<p\b)', '<div class="xs-tx" data-c="t">', m, count=1, flags=re.S)
    if light:
        m = _spans(m, lm.group(1) if lm else 'uk')
    if re.match(r'(?:[a-z]{2}/)?blog/', rel):
        m = _article_lists(m)
    m = _h2_tiles_only(m)
    if re.match(r'(?:[a-z]{2}/)?index\.html$', rel):  # головні: без бейджів «Анімація реалізації» — сцена вже на сторінці (Михайло 04.11.2026, «ясність»)
        return s[:i] + m + rest + s[j:]
    return s[:i] + _badges(m + rest) + s[j:]


# ── згенеровані блоки спільних файлів ──
def _ver():
    import hashlib
    return hashlib.sha1(open(os.path.join(ROOT, SPRITE.lstrip('/')), 'rb').read()).hexdigest()[:8]


def js_block():
    keys = ('more', 'less', 'q', 's', 'g', 'l')
    t = {l: [UX[l][k] for k in keys] for l in UX}
    return ('/*ux:i18n*/var UXS = ' + json.dumps(SPRITE + '?v=' + _ver()) + ', UXT = '
            + json.dumps(t, ensure_ascii=False, separators=(',', ':')) + '; /*/ux:i18n*/')


def sc_block():
    """Версія спільних стилів керування сцен (/assets/scene-ui.v1.css) для завантажувача сцен у site-chrome.v1.js."""
    import hashlib
    v = hashlib.sha1(open(os.path.join(ROOT, SCUI.lstrip('/')), 'rb').read()).hexdigest()[:8]
    return '/*sc:ui*/var SCUI = ' + json.dumps(SCUI + '?v=' + v) + '; /*/sc:ui*/'


def css_block():
    out = []
    for l in UX:
        code = i18n.meta(l)['html']
        # --ux-tr (рядок довіри під кнопками hero) більше не виводимо — прибрано 08.11.2026 («менше тексту»)
        out.append(f':root:lang({code}){{--ux-a:{json.dumps(UX[l]["a"], ensure_ascii=False)};--ux-as:{json.dumps(UX[l]["as"], ensure_ascii=False)}}}')
    return '/*ux:labels*/' + ''.join(out) + '/*/ux:labels*/'


# ── Слот ілюстрацій плиток (етап D): tools/site/tiles/<ключ>.webp, 480×320, ≤ 40 КБ (генерує Mac mini, FLUX локально).
# Ключ — тема іконки H2 плитки (data-i: pr, gu, st, de, …; див. RULES). Збірка копіює файл у /img/tiles/ (tools/ не деплоїться)
# і дописує в site-chrome.v1.css правило: згорнута плитка з <h2 data-i="ключ"> показує ілюстрацію над назвою.
# Немає файлу — плитка як була. Невірний розмір/вага — пропускаємо з попередженням (`python3 tools/site/ux.py`).
TILES_SRC, TILES_OUT, TILE_W, TILE_H, TILE_KB = 'tools/site/tiles', 'img/tiles', 480, 320, 40


def tiles(check=False):
    import glob, shutil
    from PIL import Image
    keys, warn = [], []
    for f in sorted(glob.glob(os.path.join(ROOT, TILES_SRC, '*.webp'))):
        key = os.path.basename(f)[:-5]
        if not re.fullmatch(r'[a-z0-9]{2}', key):
            warn.append(f'{key}: ключ — 2 символи теми іконки (data-i)'); continue
        w, h = Image.open(f).size
        kb = os.path.getsize(f) / 1024
        if (w, h) != (TILE_W, TILE_H) or kb > TILE_KB:
            warn.append(f'{key}: {w}×{h}, {kb:.0f} КБ — треба {TILE_W}×{TILE_H}, ≤ {TILE_KB} КБ'); continue
        out = os.path.join(ROOT, TILES_OUT, key + '.webp')
        if not check and (not os.path.exists(out) or open(out, 'rb').read() != open(f, 'rb').read()):
            os.makedirs(os.path.dirname(out), exist_ok=True); shutil.copyfile(f, out)
        keys.append(key)
    for x in warn:
        print('⚠ плитка', x)
    rules = ''.join(f'.js .w[data-c=x]:not(.c-o):has(>h2[data-i={k}])::before,.js [data-c=x]:not(.w,.c-o):has(>h2[data-i={k}])::before{{background-image:url(/{TILES_OUT}/{k}.webp)}}' for k in keys)
    # усі плитки — з ілюстрацією (блочність 04.11.2026: плитка без картинки поруч із плитками з картинками ламала ряд);
    # тема без власної ілюстрації — запасна «dm»
    fb = 'dm' if 'dm' in keys else (keys[0] if keys else '')
    base = (('.js .w[data-c=x]:not(.c-o):has(>h2[data-i])::before,.js [data-c=x]:not(.w,.c-o):has(>h2[data-i])::before'
             f'{{content:"";display:block;aspect-ratio:3/2;margin:-16px -16px 12px;background:var(--bg2,#100e0c) url(/{TILES_OUT}/{fb}.webp) center/cover no-repeat}}') if keys else '')
    return '/*ux:tiles*/' + (base + rules if keys else '') + '/*/ux:tiles*/'


def sync(check=False):
    bad = []
    p = os.path.join(ROOT, CSS)
    if '/*ux:tiles*/' not in open(p, encoding='utf-8').read() and not check:
        open(p, 'a', encoding='utf-8').write('\n/*ux:tiles*//*/ux:tiles*/\n')
    for path, rx, new in ((JS, r'/\*ux:i18n\*/.*?/\*/ux:i18n\*/', js_block()), (CSS, r'/\*ux:labels\*/.*?/\*/ux:labels\*/', css_block()),
                          (CSS, r'/\*ux:tiles\*/.*?/\*/ux:tiles\*/', tiles(check)), (JS, r'/\*sc:ui\*/.*?/\*/sc:ui\*/', sc_block())):
        p = os.path.join(ROOT, path)
        src = open(p, encoding='utf-8').read()
        n = re.sub(rx, lambda m: new, src, count=1, flags=re.S)
        if n != src:
            bad.append(path)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    return bad


def stats():
    import glob, collections
    c = collections.Counter()
    miss = collections.Counter()
    for f in glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(('tools', '.claude', 'kabinet', 'ozdoba', 'styleguide', 'tury')):
            continue
        for k, t in re.findall(r'<h(?:2|3)[^>]*data-i="(\w+)"[^>]*>(.*?)</h[23]>', open(f, encoding='utf-8').read(), re.S):
            c[k] += 1
            if k == FALLBACK:
                miss[plain(t)] += 1
    print(c.most_common())
    for t, n in miss.most_common(60):
        print(n, t)


if __name__ == '__main__':
    if '--stats' in sys.argv:
        stats()
        sys.exit(0)
    chk = '--check' in sys.argv
    b = sync(chk)
    if chk:
        print('\n'.join(b) if b else 'UX: OK')
        sys.exit(1 if b else 0)
    print('UX: оновлено ' + (', '.join(b) if b else 'нічого'))
