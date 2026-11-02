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
JS = 'assets/site-chrome.v1.js'
CSS = 'assets/site-chrome.v1.css'

# підписи: more/less — довгий текст; q — усі питання; s — описи етапів; g — ще картки; l — весь список ({n} — скільки сховано);
# a — бейдж «Анімація реалізації», as — короткий бейдж; go_house / go_flat — кнопка в hero сторінки з анімацією
UX = {
    'uk': dict(more='Читати далі', less='Згорнути', q='Усі питання ({n})', s='Детальніше про кожен етап', g='Показати ще ({n})',
               l='Весь список ({n})', a='Анімація реалізації', **{'as': 'Інтерактив'}, go_house='Дивитись, як ми будуємо',
               go_flat='Дивитись, як ми ремонтуємо'),
    'ru': dict(more='Читать дальше', less='Свернуть', q='Все вопросы ({n})', s='Подробнее о каждом этапе', g='Показать ещё ({n})',
               l='Весь список ({n})', a='Анимация реализации', **{'as': 'Интерактив'}, go_house='Смотреть, как мы строим',
               go_flat='Смотреть, как мы ремонтируем'),
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
    ('gl', r'європ|европ|europe|europa|' + B + r'світ(?!л)|' + B + r'мир(?!\w)|world|international|abroad|кордон|рубеж|全球|欧洲|أوروبا|world'),
    ('gp', r'місто|регіон|регион|gdzie|dónde|' + B + r'wo(?!\w)|міст[аі]|' + B + r'город|район|област|україн|украин|київ|киев|поруч|рядом|де працю|где работ|географ|' + B + r'kyiv|' + B + r'kiev|'
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

STRIP = [re.compile(r'\sdata-i="[a-z0-9]{2}"'), re.compile(r'\sdata-c="[tsqgl]"'), re.compile(r'\sdata-a(?:="[si]")?(?=[\s>])')]
UNWRAP = re.compile(r'<div data-c="l">(<(ul|ol)>.*?</\2>)</div>', re.S)

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
        if len(plain(txt)) > 620 and len(re.findall(r'<p\b', body)) >= 1:
            return 't'
    return None


def _collapse(m):
    def sec(x):
        k = _collapse_type(x.group(2), x.group(3), x.group(5))
        return x.group(1) + (f' data-c="{k}"' if k else '') + x.group(4) + x.group(5) + x.group(6)
    m = SEC_RX.sub(sec, m)
    # ручні сторінки «Про студію» (uk/ru): довгий вступ і «Як ми працюємо»
    m = re.sub(r'<div class="about-txt">(?=(?:(?!</div>).)*?<p class="about-body"[^>]*>(?:(?!</div>).)*?<p class="about-body")',
               '<div class="about-txt" data-c="t">', m, count=1, flags=re.S)
    m = re.sub(r'(<section class="ab-sec" aria-labelledby="ab-steps-h")>', r'\1 data-c="s">', m, count=1)
    return m


def _article_lists(m):
    """Стаття блогу: довгі чеклісти (від 8 пунктів) — перші 5 + «Весь список»."""
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
    s = UNWRAP.sub(r'\1', s)  # спершу обгортки списків (STRIP зняв би з них data-c і лишив порожній <div>)
    for rx in STRIP:
        s = rx.sub('', s)
    return s


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
    m = _icons(m)
    m = _collapse(m)
    if re.match(r'(?:[a-z]{2}/)?blog/', rel):
        m = _article_lists(m)
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


def css_block():
    out = []
    for l in UX:
        code = i18n.meta(l)['html']
        out.append(f':root:lang({code}){{--ux-a:{json.dumps(UX[l]["a"], ensure_ascii=False)};--ux-as:{json.dumps(UX[l]["as"], ensure_ascii=False)}}}')
    return '/*ux:labels*/' + ''.join(out) + '/*/ux:labels*/'


def sync(check=False):
    bad = []
    for path, rx, new in ((JS, r'/\*ux:i18n\*/.*?/\*/ux:i18n\*/', js_block()), (CSS, r'/\*ux:labels\*/.*?/\*/ux:labels\*/', css_block())):
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
