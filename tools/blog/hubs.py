"""Теми (кластери) блогу: тематичні розділи індексу /blog, «Читайте також» спершу з тієї ж теми,
хлібні крихти «Головна → Блог → Тема → Стаття» і блок «Статті по темі» на лендингах (tools/blog/build.py).

Тема статті — перший збіг правила `RULES` у slug (uk-оригінал для ru/en/pl-перекладів, щоб пара була в одній темі),
далі — за URL послуги статті (`service`). Нова тема — рядок у RULES, підписи `LABEL` і посилання `LINKS` мов.
Аудит вхідних посилань за зібраним HTML — `python3 tools/blog/inlinks.py`.
"""
import re

# (ключ, regex slug / URL) — порядок важливий: перший збіг
RULES = [
    ('land', r'landshaft|landscape|krajobraz|ogrod|ogród'),
    ('legal', r'dohovir|dogovor|contract|umow|oplat|payment|platnos|płatno|nahliad|nadzor|supervision|nadzór|pidriad|podryad|podrjad|contractor|wykonawc|bryhad|brigad|\bcrew|ekip'),
    ('cost', r'skilky-koshtu|skolko-stoit|-cost|cost-|koszt|ile-koszt|koshtorys|(?:^|-)smet|kosztorys|pereplat|overpay|przeplac|vartist|stoimost|kalkul|calculator'),
    ('biz', r'ofis|office|biur|restoran|restaurant|restaurac|kafe|cafe|kawiarn|hotel|gostinits|salon|komerts|kommerch|commercial|lokal|baza|resort|osrod|ośrod|otdyh|vidpochynku|biznes|business|fit-out'),
    ('mat', r'materia|hazoblok|gazoblok|keramik|ceramic|ceramik|brus|timber|pyrih|piro[gh]|layers|warstw|tekhnolohi|tehnolog|technolog|shpon|veneer|fornir|akustyk|akustik|acoustic|inzhener|engineering|instalac'),
    ('furn', r'komplekt|mebl|furnish|furniture|procure|umeblow|kompletac|meble|staging'),
    ('design', r'dyzain|dizayn|design|projekt-wnetrz|projektowanie-wnetrz|projektant|wnetrz|interier|interer|interior|minimal|osvitlen|osveshch|lighting|oswietl|planuval|planirovoch|space-plan|bryf|brif|brief'),
    ('build', r'budyn|budivn|\bdom[auy]?\b|-dom-|doma|stroit|house|budow|karkas|szkielet|rekonstr|projekt-domu'),
    ('reno', r'remont|renovat|pereplan|replan|przebud|chorno|chernov|rough'),
]
ORDER = ['design', 'reno', 'build', 'land', 'biz', 'cost', 'mat', 'furn', 'legal']  # порядок розділів на індексі
ANCHOR = {k: 't-' + k for k in ORDER}  # /blog#t-design …

LABEL = {
    'uk': dict(design='Дизайн інтерʼєру', reno='Ремонт квартир', build='Будівництво будинків', land='Ландшафт',
               biz='Офіси, ресторани, комерція', cost='Вартість і кошториси', mat='Матеріали й технології',
               furn='Меблі й комплектація', legal='Договір і контроль'),
    'ru': dict(design='Дизайн интерьера', reno='Ремонт квартир', build='Строительство домов', land='Ландшафт',
               biz='Офисы, рестораны, коммерция', cost='Стоимость и сметы', mat='Материалы и технологии',
               furn='Мебель и комплектация', legal='Договор и контроль'),
    'en': dict(design='Interior design', reno='Renovation', build='House construction', land='Landscape',
               biz='Offices, restaurants, commercial', cost='Costs and estimates', mat='Materials and technology',
               furn='Furniture and procurement', legal='Contract and supervision'),
    'pl': dict(design='Projektowanie wnętrz', reno='Remonty', build='Budowa domów', land='Ogrody',
               biz='Biura, restauracje, lokale', cost='Koszty i kosztorysy', mat='Materiały i technologie',
               furn='Meble i kompletacja', legal='Umowa i nadzór'),
    'es': dict(design='Diseño de interiores', reno='Reformas', build='Construcción de casas', land='Paisajismo',
               biz='Oficinas, restaurantes, locales', cost='Costes y presupuestos', mat='Materiales y tecnología',
               furn='Mobiliario y equipamiento', legal='Contrato y supervisión'),
    'de': dict(design='Innenarchitektur', reno='Renovierung', build='Hausbau', land='Gartengestaltung',
               biz='Büros, Restaurants, Gewerbe', cost='Kosten und Kalkulation', mat='Materialien und Technik',
               furn='Möbel und Einrichtung', legal='Vertrag und Bauüberwachung'),
    'fr': dict(design='Architecture d’intérieur', reno='Rénovation', build='Construction de maisons', land='Paysage',
               biz='Bureaux, restaurants, commerces', cost='Coûts et devis', mat='Matériaux et techniques',
               furn='Mobilier et équipement', legal='Contrat et suivi'),
    'pt': dict(design='Design de interiores', reno='Remodelação', build='Construção de moradias', land='Paisagismo',
               biz='Escritórios, restaurantes, comércio', cost='Custos e orçamentos', mat='Materiais e tecnologia',
               furn='Mobiliário e equipamento', legal='Contrato e fiscalização'),
    'zh': dict(design='室内设计', reno='装修', build='房屋建造', land='景观',
               biz='办公室、餐厅与商业空间', cost='费用与预算', mat='材料与工艺',
               furn='家具与配套', legal='合同与监理'),
    'ar': dict(design='التصميم الداخلي', reno='التجديد', build='بناء المنازل', land='تنسيق الحدائق',
               biz='المكاتب والمطاعم والمحلات التجارية', cost='التكاليف والتقديرات', mat='المواد والتقنيات',
               furn='الأثاث والتجهيز', legal='العقد والإشراف'),
}
UI = {  # aria-label рядка тем, «Тема», «Калькулятор», «Усі статті теми»
    'uk': dict(nav='Теми блогу', topic='Тема', calc='Калькулятор ремонту', svc='Послуга'),
    'ru': dict(nav='Темы блога', topic='Тема', calc='Калькулятор ремонта', svc='Услуга'),
    'en': dict(nav='Blog topics', topic='Topic', calc='Renovation cost calculator', svc='Service'),
    'pl': dict(nav='Tematy bloga', topic='Temat', calc='Kalkulator remontu', svc='Usługa'),
    'es': dict(nav='Temas del blog', topic='Tema', calc='Calculadora de reforma', svc='Servicio'),
    'de': dict(nav='Blog-Themen', topic='Thema', calc='Renovierungskosten-Rechner', svc='Leistung'),
    'fr': dict(nav='Thèmes du blog', topic='Thème', calc='Calculateur de rénovation', svc='Service'),
    'pt': dict(nav='Temas do blog', topic='Tema', calc='Calculadora de obras', svc='Serviço'),
    'zh': dict(nav='博客主题', topic='主题', calc='装修费用计算器', svc='服务'),
    'ar': dict(nav='مواضيع المدونة', topic='الموضوع', calc='حاسبة تكلفة التجديد', svc='الخدمة'),
}
CALC = {'uk': '/kalkuliator-remontu', 'ru': '/ru/kalkulyator-remonta', 'en': '/en/renovation-cost-calculator', 'pl': '/pl/kalkulator-remontu',
        'es': '/es/calculadora-reforma', 'de': '/de/renovierungskosten-rechner', 'fr': '/fr/calculateur-renovation',
        'pt': '/pt/calculadora-obras', 'zh': '/zh/renovation-calculator', 'ar': '/ar/renovation-calculator'}
LINKS = {  # тема → [href лендингу, підпис] (головна послуга теми)
    'uk': dict(design=['/dyzain-interieru-kyiv', 'Дизайн інтерʼєру в Києві'], reno=['/remont-kvartyr-kyiv', 'Ремонт квартир під ключ'],
               build=['/budivnytstvo-budynkiv-kyiv', 'Будівництво будинків під ключ'], land=['/landshaftnyi-dyzain-kyiv', 'Ландшафтний дизайн'],
               biz=['/biznes-pid-kliuch-kyiv', 'Бізнес під ключ'], cost=['/vartist-remontu-kvartyry-kyiv', 'Вартість ремонту квартири'],
               mat=['/proektuvannia-budynku-kyiv', 'Проєктування будинку'], furn=['/komplektatsiia-pid-kliuch-kyiv', 'Комплектація під ключ'],
               legal=['/dogovir-garantiya-oplata', 'Договір, гарантія, оплата']),
    'ru': dict(design=['/ru/dizayn-interera-kiev', 'Дизайн интерьера в Киеве'], reno=['/ru/remont-kvartir-kiev', 'Ремонт квартир под ключ'],
               build=['/ru/stroitelstvo-domov-kiev', 'Строительство домов под ключ'], land=['/ru/landshaftnyy-dizayn-kiev', 'Ландшафтный дизайн'],
               biz=['/ru/biznes-pod-klyuch-kiev', 'Бизнес под ключ'], cost=['/ru/stoimost-remonta-kvartiry-kiev', 'Стоимость ремонта квартиры'],
               mat=['/ru/proektirovanie-doma-kiev', 'Проектирование дома'], furn=['/ru/komplektatsiya-pod-klyuch-kiev', 'Комплектация под ключ'],
               legal=['/ru/dogovor-garantiya-oplata', 'Договор, гарантия, оплата']),
    'en': dict(design=['/en/interior-design', 'Interior design'], reno=['/en/turnkey-renovation', 'Turnkey renovation'],
               build=['/en/house-construction', 'House construction'], land=['/en/landscape-design', 'Landscape design'],
               biz=['/en/business-fit-out', 'Business fit-out'], cost=['/en/turnkey-renovation', 'Turnkey renovation'],
               mat=['/en/house-design', 'House design'], furn=['/en/turnkey-procurement', 'Turnkey procurement'],
               legal=['/en/contract-warranty-payment', 'Contract, warranty, payment']),
    'pl': dict(design=['/pl/projektowanie-wnetrz', 'Projektowanie wnętrz'], reno=['/pl/remont-pod-klucz', 'Remont pod klucz'],
               build=['/pl/budowa-domow', 'Budowa domów'], land=['/pl/projektowanie-ogrodow', 'Projektowanie ogrodów'],
               biz=['/pl/biznes-pod-klucz', 'Biznes pod klucz'], cost=['/pl/remont-pod-klucz', 'Remont pod klucz'],
               mat=['/pl/projekt-domu', 'Projekt domu'], furn=['/pl/kompletacja-wnetrz', 'Kompletacja wnętrz'],
               legal=['/pl/realizacja-projektu', 'Realizacja projektu']),
    'es': dict(design=['/es/diseno-interiores', 'Diseño de interiores'], reno=['/es/reforma-llave-en-mano', 'Reforma llave en mano'],
               build=['/es/construccion-de-casas', 'Construcción de casas'], land=['/es/paisajismo', 'Paisajismo'],
               biz=['/es/negocio-llave-en-mano', 'Negocio llave en mano'], cost=['/es/reforma-llave-en-mano', 'Reforma llave en mano'],
               mat=['/es/proyecto-de-casa', 'Proyecto de casa'], furn=['/es/equipamiento-llave-en-mano', 'Equipamiento llave en mano'],
               legal=['/es/contrato-garantia-pago', 'Contrato, garantía, pago']),
    'de': dict(design=['/de/innenarchitektur', 'Innenarchitektur'], reno=['/de/renovierung-schluesselfertig', 'Schlüsselfertige Renovierung'],
               build=['/de/hausbau', 'Hausbau'], land=['/de/gartengestaltung', 'Gartengestaltung'],
               biz=['/de/gewerbe-schluesselfertig', 'Gewerbe schlüsselfertig'], cost=['/de/renovierung-schluesselfertig', 'Schlüsselfertige Renovierung'],
               mat=['/de/hausplanung', 'Hausplanung'], furn=['/de/objekteinrichtung', 'Objekteinrichtung'],
               legal=['/de/vertrag-gewaehrleistung-zahlung', 'Vertrag, Gewährleistung, Zahlung']),
    'fr': dict(design=['/fr/architecture-interieur', 'Architecture d’intérieur'], reno=['/fr/renovation-cle-en-main', 'Rénovation clé en main'],
               build=['/fr/construction-maison', 'Construction de maison'], land=['/fr/architecture-paysagere', 'Architecture paysagère'],
               biz=['/fr/commerce-cle-en-main', 'Commerce clé en main'], cost=['/fr/renovation-cle-en-main', 'Rénovation clé en main'],
               mat=['/fr/conception-maison', 'Conception de maison'], furn=['/fr/equipement-cle-en-main', 'Équipement clé en main'],
               legal=['/fr/contrat-garantie-paiement', 'Contrat, garantie, paiement']),
    'pt': dict(design=['/pt/design-de-interiores', 'Design de interiores'], reno=['/pt/remodelacao-chave-na-mao', 'Remodelação chave na mão'],
               build=['/pt/construcao-de-moradias', 'Construção de moradias'], land=['/pt/arquitetura-paisagista', 'Arquitetura paisagista'],
               biz=['/pt/espacos-comerciais-chave-na-mao', 'Espaços comerciais chave na mão'], cost=['/pt/remodelacao-chave-na-mao', 'Remodelação chave na mão'],
               mat=['/pt/projeto-de-moradia', 'Projeto de moradia'], furn=['/pt/equipamento-chave-na-mao', 'Equipamento chave na mão'],
               legal=['/pt/execucao-projeto-design', 'Execução do projeto de design']),
    'zh': dict(design=['/zh/interior-design', '室内设计'], reno=['/zh/turnkey-renovation', '交钥匙装修'],
               build=['/zh/house-construction', '房屋建造'], land=['/zh/landscape-design', '景观设计'],
               biz=['/zh/business-fit-out', '商业空间交钥匙工程'], cost=['/zh/turnkey-renovation', '交钥匙装修'],
               mat=['/zh/house-design', '房屋设计'], furn=['/zh/turnkey-procurement', '交钥匙配套采购'],
               legal=['/zh/contract-warranty-payment', '合同、保修、付款']),
    'ar': dict(design=['/ar/interior-design', 'التصميم الداخلي'], reno=['/ar/turnkey-renovation', 'التجديد الجاهز للتسليم'],
               build=['/ar/house-construction', 'بناء المنازل'], land=['/ar/landscape-design', 'تصميم الحدائق'],
               biz=['/ar/business-fit-out', 'تجهيز المشاريع التجارية'], cost=['/ar/turnkey-renovation', 'التجديد الجاهز للتسليم'],
               mat=['/ar/house-design', 'تصميم المنازل'], furn=['/ar/turnkey-procurement', 'التجهيز الجاهز للتسليم'],
               legal=['/ar/contract-warranty-payment', 'العقد والضمان والدفع']),
}


def classify_text(*parts):
    """Перший збіг RULES по черзі в кожній частині (slug, потім URL послуги)."""
    for p in parts:
        for k, rx in RULES:
            if p and re.search(rx, p.lower()):
                return k
    return 'design'


def classify(a, arts=None, group=None):
    """Тема статті: ru/en/pl — тема uk-оригіналу (через group()), інакше — slug, далі URL послуги."""
    src = a
    if arts is not None and group is not None and a['lang'] != 'uk':
        src = group(a, arts).get('uk') or a
    return classify_text(src['slug'], (src.get('service') or [''])[0], a['slug'], (a.get('service') or [''])[0])


def label(lang, k):
    return (LABEL.get(lang) or LABEL['en'])[k]


def ui(lang):
    return UI.get(lang) or UI['en']
