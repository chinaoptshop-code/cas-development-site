"""«Легкий блог» (Михайло 02.11.2026): картка «Коротко» з іконками, зміст-плитки, розділи згорнуті до 2–3 рядків,
чеклісти з іконками, у технічних статтях — компактний «пиріг шарів» (дані — tools/site/buildanim_data.py).

Викликає tools/blog/build.py (render_body → body()). Текст лишається в DOM: згортання — атрибут data-c="t" на
<div class="bsc"> (ставить tools/site/ux.py; «Читати далі» — /assets/site-chrome.v1.js), без JS усе відкрито.
Стилі — /assets/blog-light.v1.css. Schema (Article, FAQPage) не змінюється. UI-kit — /styleguide/#blog-light.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import flags  # noqa: E402  OZDOBA_PUBLIC (tools/site/flags.py)
import oztext  # noqa: E402  тексти без Оздоби й мінімального замовлення, поки вона прихована
CSS = 'assets/blog-light.v1.css'
esc = lambda s: html.escape(s, quote=True)

T = {
    'uk': dict(k='Коротко', toc='Зміст', read='хв читання', parts='Розділів', q='питань', price='Ціни', svc='Послуга', min=1),
    'ru': dict(k='Коротко', toc='Содержание', read='мин чтения', parts='Разделов', q='вопросов', price='Цены', svc='Услуга'),
    'en': dict(k='In short', toc='Contents', read='min read', parts='Sections', q='questions', price='Prices', svc='Service'),
    'pl': dict(k='W skrócie', toc='Spis treści', read='min czytania', parts='Rozdziałów', q='pytań', price='Ceny', svc='Usługa'),
    'es': dict(k='En breve', toc='Contenido', read='min de lectura', parts='Secciones', q='preguntas', price='Precios', svc='Servicio'),
    'de': dict(k='Kurz gesagt', toc='Inhalt', read='Min. Lesezeit', parts='Abschnitte', q='Fragen', price='Preise', svc='Leistung'),
    'fr': dict(k='En bref', toc='Sommaire', read='min de lecture', parts='Sections', q='questions', price='Prix', svc='Service'),
    'pt': dict(k='Em resumo', toc='Índice', read='min de leitura', parts='Secções', q='perguntas', price='Preços', svc='Serviço'),
    'zh': dict(k='要点', toc='目录', read='分钟阅读', parts='章节', q='问题', price='价格', svc='服务'),
    'ar': dict(k='باختصار', toc='المحتويات', read='دقائق للقراءة', parts='الأقسام', q='الأسئلة', price='الأسعار', svc='الخدمة'),
}
PRICE = re.compile(r'(?:від|от|from|od|desde|ab|dès|à partir de|a partir de)\s+\$\s?\d+(?:[  ,]\d{3})*(?:\s?(?:за|per|/|za)\s?(?:м²|m²|сотку))?', re.I)
# технічні статті → пиріг шарів (ключ T[lang]['pie'] у buildanim_data); перший збіг у назві/slug
PIES = [(r'покрівл|кровл|дах|крыш|roof|dach', 'roof'), (r'фундамент|плит[аиу] фундам|foundation|fundament', 'fplate'),
        (r'газоблок|цегл|кирпич|стін|стен|wall|ścian', 'w_block'), (r'каркас|frame|szkielet', 'w_frame'), (r'брус|timber|bali', 'w_brus'),
        (r'\bванн|санвуз|санузл|bathroom|łazien|гідроізол|гидроизол', 'f_wet'), (r'стяжк|підлог|пол[уа]? |floor|podłog|паркет', 'f_floor'),
        (r'перекрит|перекрыт', 'slab'), (r'вікн|окна|window|okna', 'win'), (r'будинок|будівництв|дом|строит|house|budow', 'w_block')]


# Контекстний блок послуги (Михайло/GSC 10.11.2026: читачі блогу приходять зі статей, шлях до заявки слабкий):
# один рядок + одна кнопка на лендинг послуги за темою статті + (необовʼязково) друге текстове посилання.
# Стоїть після 2-го розділу (≤ 2 розділів — одразу після «Коротко»); форми посеред статті немає — заявка лише в #zayavka внизу.
# Тема — перший збіг у slug + назві; якщо послуга статті ("service") з тієї ж «родини», кнопка веде на неї (вона точніша).
# Ціни й факти — лише з CLAUDE.md; замір не обіцяємо безкоштовним, безкоштовна — консультація по телефону.
TOPICS = [  # (тема, regex slug статті — перекриває послугу; regex URL послуги статті, що теж дає цю тему)
    ('nadzor', r'nahliad|nadzor|supervision', r'nahliad|nadzor'),
    ('smeta', r'koshtorys|smet|kosztorys|skilky-koshtuie-remont|skolko-stoit-remont|renovation-cost|koszt-remontu', r'vartist-remontu-kv|stoimost-remonta-kv|kalk|calculator|calculadora|rechner|calculateur'),
    ('own', None, r'ofis|office|biur|restoran|restaur|kafe|biznes|business|baza|resort|osrod|komerts|kommerch|commercial|lokali|yevropa|evropa|premium|realiz|implementation|dogov|contract|bryhad|brigad|crew|ekipa|pidriad|podryad|contractor|oficina|buero|bureau|escritorio|negocio|gewerbe|commerce|comercia|complejo|ferienanlage|loisirs|complexo|ejecucion|umsetzung|realisation|execucao|vertrag'),
    ('furn', None, r'mebl|komplekt|ozdoba|furnish|procure|umeblow|kompletac|amueblamiento|equipamiento|einrichtung|ameublement|equipement|mobiliario|equipamento'),
    ('build', None, r'budivnytstvo|stroitelstvo|house-construction|budowa|proektuvannia-budynku|proektirovanie-doma|house-design|projekt-domu|rekonstr|construccion-de-casas|proyecto-de-casa|hausbau|hausplanung|construction-maison|conception-maison|construcao-de-moradias|projeto-de-moradia'),
    ('design', None, r'dyzain|dizayn|interior-design|apartment-interior|interior-designer|projekt-wnetrza|projektowanie-wnetrz|projektant|diseno|innenarchitektur|wohnungsdesign|architecture-interieur|design-appartement|design-de-interiores|apartment-design'),
]
# smeta з конкретною послугою (ванна, кухня, новобудова, будинок, капітальний) — кнопка лишається на ній
SMETA_KEEP = r'vartist|stoimost|vann|bathroom|lazien|kukh|kuhn|kitchen|novobud|novostro|new-build|budyn|doma|house|domu|kapital'
TP = {  # тема → (рядок, [основний href, підпис кнопки], [друге посилання або None])
    'uk': {
        'nadzor': ('Технічний і авторський нагляд CAS — і коли ремонт робить інший підрядник: умови й вартість індивідуально. Консультація по телефону безкоштовна.',
                   ['/avtorskyi-i-tekhnichnyi-nahliad-kyiv', 'Авторський і технічний нагляд'], None),
        'furn': ('Меблювання під ключ — від $250/м²; меблі, світло й декор під замовлення з Китаю — каталог Оздоба. Консультація по телефону безкоштовна.',
                 ['/mebliuvannia-kvartyry-kyiv', 'Меблювання квартири'], ['/ozdoba', 'Каталог Оздоба']),
        'build': ('Будівництво будинку — від $600/м², під ключ — від $1 100/м²; архпроєкт — від $12/м². Консультація по телефону безкоштовна.',
                  ['/budivnytstvo-budynkiv-kyiv', 'Будівництво будинків'], ['/budivnytstvo-budynkiv-kyiv#build-anim', 'Дивитись, як ми будуємо']),
        'smeta': ('Ремонт — від $550/м²: роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом. Консультація по телефону безкоштовна.',
                  ['/vartist-remontu-kvartyry-kyiv', 'Вартість ремонту квартири'], ['/kalkuliator-remontu', 'Калькулятор ремонту']),
        'design': ('Дизайн-проєкт — від $30/м² (мін. $2 500), планувальне рішення — від $6/м². Консультація по телефону безкоштовна.',
                   ['/dyzain-interieru-kyiv', 'Дизайн інтерʼєру'], ['/kalkuliator-remontu', 'Калькулятор вартості']),
        'own': ('Розкажіть про обʼєкт — назвемо орієнтовну вартість. Консультація по телефону безкоштовна.', None, None),
    },
    'ru': {
        'nadzor': ('Технический и авторский надзор CAS — и когда ремонт делает другой подрядчик: условия и стоимость индивидуально. Консультация по телефону бесплатная.',
                   ['/ru/avtorskiy-i-tehnicheskiy-nadzor-kiev', 'Авторский и технический надзор'], None),
        'furn': ('Меблировка под ключ — от $250/м²; мебель, свет и декор под заказ из Китая. Консультация по телефону бесплатная.',
                 ['/ru/meblirovka-kvartiry-kiev', 'Меблировка квартиры'], ['/ru/komplektatsiya-pod-klyuch-kiev', 'Комплектация под ключ']),
        'build': ('Строительство дома — от $600/м², под ключ — от $1 100/м²; архпроект — от $12/м². Консультация по телефону бесплатная.',
                  ['/ru/stroitelstvo-domov-kiev', 'Строительство домов'], ['/ru/stroitelstvo-domov-kiev#build-anim', 'Смотреть, как мы строим']),
        'smeta': ('Ремонт — от $550/м²: работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете. Консультация по телефону бесплатная.',
                  ['/ru/stoimost-remonta-kvartiry-kiev', 'Стоимость ремонта квартиры'], ['/ru/kalkulyator-remonta', 'Калькулятор ремонта']),
        'design': ('Дизайн-проект — от $30/м² (мин. $2 500), планировочное решение — от $6/м². Консультация по телефону бесплатная.',
                   ['/ru/dizayn-interera-kiev', 'Дизайн интерьера'], ['/ru/kalkulyator-remonta', 'Калькулятор стоимости']),
        'own': ('Расскажите об объекте — назовём ориентировочную стоимость. Консультация по телефону бесплатная.', None, None),
    },
    'en': {
        'nadzor': ('CAS technical and designer supervision, also when another contractor does the renovation: terms and cost are agreed individually. Phone consultation is free.',
                   ['/en/design-implementation', 'Design implementation'], None),
        'furn': ('Turnkey furnishing from $250/m²; custom furniture, lighting and decor from China — the Ozdoba catalogue. Phone consultation is free.',
                 ['/en/turnkey-furnishing', 'Turnkey furnishing'], ['/en/ozdoba', 'Ozdoba catalogue']),
        'build': ('House construction from $600/m², turnkey from $1,100/m²; architectural design from $12/m². Phone consultation is free.',
                  ['/en/house-construction', 'House construction'], ['/en/house-construction#build-anim', 'See how we build']),
        'smeta': ('Renovation from $550/m²: labour and rough materials; finishing materials, furniture and appliances are estimated separately. Phone consultation is free.',
                  ['/en/turnkey-renovation', 'Turnkey renovation'], ['/en/renovation-cost-calculator', 'Renovation cost calculator']),
        'design': ('Interior design from $30/m² (min. $2,500), space planning from $6/m². Phone consultation is free.',
                   ['/en/interior-design', 'Interior design'], ['/en/renovation-cost-calculator', 'Cost calculator']),
        'own': ('Tell us about your property and we will give you a rough cost. Phone consultation is free.', None, None),
    },
    'pl': {
        'nadzor': ('Nadzór techniczny i autorski CAS, także gdy remont prowadzi inny wykonawca: warunki i koszt ustalamy indywidualnie. Konsultacja telefoniczna jest bezpłatna.',
                   ['/pl/realizacja-projektu', 'Realizacja projektu'], None),
        'furn': ('Umeblowanie pod klucz od $250/m²; meble, oświetlenie i dekoracje na zamówienie z Chin — katalog Ozdoba. Konsultacja telefoniczna jest bezpłatna.',
                 ['/pl/umeblowanie-pod-klucz', 'Umeblowanie pod klucz'], ['/pl/ozdoba', 'Katalog Ozdoba']),
        'build': ('Budowa domu od $600/m², pod klucz od $1 100/m²; projekt architektoniczny od $12/m². Konsultacja telefoniczna jest bezpłatna.',
                  ['/pl/budowa-domow', 'Budowa domów'], ['/pl/budowa-domow#build-anim', 'Zobacz, jak budujemy']),
        'smeta': ('Remont od $550/m²: robocizna i materiały stanu surowego; materiały wykończeniowe, meble i AGD — osobno, wg kosztorysu. Konsultacja telefoniczna jest bezpłatna.',
                  ['/pl/remont-pod-klucz', 'Remont pod klucz'], ['/pl/kalkulator-remontu', 'Kalkulator remontu']),
        'design': ('Projekt wnętrza od $30/m² (min. $2 500), układ funkcjonalny od $6/m². Konsultacja telefoniczna jest bezpłatna.',
                   ['/pl/projektowanie-wnetrz', 'Projektowanie wnętrz'], ['/pl/kalkulator-remontu', 'Kalkulator kosztów']),
        'own': ('Opowiedz o obiekcie — podamy orientacyjny koszt. Konsultacja telefoniczna jest bezpłatna.', None, None),
    },
    'es': {
        'nadzor': ('Supervisión técnica y de autor de CAS, también cuando la reforma la hace otro contratista: condiciones y coste, de forma individual. La consulta por teléfono es gratuita.',
                   ['/es/ejecucion-proyecto-diseno', 'Ejecución del proyecto de diseño'], None),
        'furn': ('Amueblamiento llave en mano desde $250/m²; muebles, iluminación y decoración a medida. La consulta por teléfono es gratuita.',
                 ['/es/amueblamiento-llave-en-mano', 'Amueblamiento llave en mano'], ['/es/equipamiento-llave-en-mano', 'Equipamiento llave en mano']),
        'build': ('Construcción de casas desde $600/m², llave en mano desde $1 100/m²; proyecto arquitectónico desde $12/m². La consulta por teléfono es gratuita.',
                  ['/es/construccion-de-casas', 'Construcción de casas'], ['/es/construccion-de-casas#build-anim', 'Mira cómo construimos']),
        'smeta': ('Reforma desde $550/m²: mano de obra y materiales de obra gruesa; acabados, muebles y electrodomésticos, aparte, según presupuesto. La consulta por teléfono es gratuita.',
                  ['/es/reforma-llave-en-mano', 'Reforma llave en mano'], ['/es/calculadora-reforma', 'Calculadora de reforma']),
        'design': ('Proyecto de diseño desde $30/m² (mín. $2 500), distribución desde $6/m². La consulta por teléfono es gratuita.',
                   ['/es/diseno-interiores', 'Diseño de interiores'], ['/es/calculadora-reforma', 'Calculadora de costes']),
        'own': ('Cuéntanos sobre tu inmueble y te daremos un coste orientativo. La consulta por teléfono es gratuita.', None, None),
    },
    'de': {
        'nadzor': ('Technische und gestalterische Bauaufsicht von CAS, auch wenn ein anderes Unternehmen renoviert: Bedingungen und Kosten individuell. Die telefonische Beratung ist kostenlos.',
                   ['/de/umsetzung-designprojekt', 'Umsetzung des Designprojekts'], None),
        'furn': ('Schlüsselfertige Einrichtung ab $250/m²; Möbel, Licht und Dekor nach Maß. Die telefonische Beratung ist kostenlos.',
                 ['/de/einrichtung-schluesselfertig', 'Einrichtung schlüsselfertig'], ['/de/objekteinrichtung', 'Objekteinrichtung']),
        'build': ('Hausbau ab $600/m², schlüsselfertig ab $1 100/m²; Architekturplanung ab $12/m². Die telefonische Beratung ist kostenlos.',
                  ['/de/hausbau', 'Hausbau'], ['/de/hausbau#build-anim', 'So bauen wir']),
        'smeta': ('Renovierung ab $550/m²: Arbeit und Rohbaumaterial; Ausbaumaterial, Möbel und Geräte separat nach Kostenvoranschlag. Die telefonische Beratung ist kostenlos.',
                  ['/de/renovierung-schluesselfertig', 'Schlüsselfertige Renovierung'], ['/de/renovierungskosten-rechner', 'Renovierungskosten-Rechner']),
        'design': ('Designprojekt ab $30/m² (mind. $2 500), Grundrissplanung ab $6/m². Die telefonische Beratung ist kostenlos.',
                   ['/de/innenarchitektur', 'Innenarchitektur'], ['/de/renovierungskosten-rechner', 'Kostenrechner']),
        'own': ('Erzählen Sie uns von Ihrem Objekt – wir nennen einen Richtwert. Die telefonische Beratung ist kostenlos.', None, None),
    },
    'fr': {
        'nadzor': ('Suivi technique et suivi de conception CAS, y compris quand un autre entrepreneur réalise les travaux : conditions et coût au cas par cas. La consultation téléphonique est gratuite.',
                   ['/fr/realisation-projet', 'Réalisation du projet'], None),
        'furn': ('Ameublement clé en main à partir de $250/m² ; mobilier, luminaires et décoration sur mesure. La consultation téléphonique est gratuite.',
                 ['/fr/ameublement-cle-en-main', 'Ameublement clé en main'], ['/fr/equipement-cle-en-main', 'Équipement clé en main']),
        'build': ('Construction de maison à partir de $600/m², clé en main à partir de $1 100/m² ; projet d’architecture à partir de $12/m². La consultation téléphonique est gratuite.',
                  ['/fr/construction-maison', 'Construction de maison'], ['/fr/construction-maison#build-anim', 'Voir comment nous construisons']),
        'smeta': ('Rénovation à partir de $550/m² : main-d’œuvre et matériaux de gros œuvre ; finitions, mobilier et électroménager à part, sur devis. La consultation téléphonique est gratuite.',
                  ['/fr/renovation-cle-en-main', 'Rénovation clé en main'], ['/fr/calculateur-renovation', 'Calculateur de rénovation']),
        'design': ('Projet de design à partir de $30/m² (min. $2 500), plan d’aménagement à partir de $6/m². La consultation téléphonique est gratuite.',
                   ['/fr/architecture-interieur', 'Architecture d’intérieur'], ['/fr/calculateur-renovation', 'Calculateur de coût']),
        'own': ('Parlez-nous de votre bien : nous vous donnerons un coût indicatif. La consultation téléphonique est gratuite.', None, None),
    },
    'pt': {
        'nadzor': ('Fiscalização técnica e acompanhamento de autor da CAS, também quando a obra é feita por outro empreiteiro: condições e custo definidos caso a caso. A consulta por telefone é gratuita.',
                   ['/pt/execucao-projeto-design', 'Execução do projeto de design'], None),
        'furn': ('Mobiliário chave na mão desde $250/m²; móveis, iluminação e decoração por medida. A consulta por telefone é gratuita.',
                 ['/pt/mobiliario-chave-na-mao', 'Mobiliário chave na mão'], ['/pt/equipamento-chave-na-mao', 'Equipamento chave na mão']),
        'build': ('Construção de moradias desde $600/m², chave na mão desde $1 100/m²; projeto de arquitetura desde $12/m². A consulta por telefone é gratuita.',
                  ['/pt/construcao-de-moradias', 'Construção de moradias'], ['/pt/construcao-de-moradias#build-anim', 'Veja como construímos']),
        'smeta': ('Remodelação desde $550/m²: mão de obra e materiais de base; acabamentos, móveis e eletrodomésticos à parte, por orçamento. A consulta por telefone é gratuita.',
                  ['/pt/remodelacao-chave-na-mao', 'Remodelação chave na mão'], ['/pt/calculadora-obras', 'Calculadora de obras']),
        'design': ('Projeto de design desde $30/m² (mín. $2 500), estudo de layout desde $6/m². A consulta por telefone é gratuita.',
                   ['/pt/design-de-interiores', 'Design de interiores'], ['/pt/calculadora-obras', 'Calculadora de custos']),
        'own': ('Fale-nos do seu imóvel e indicamos um custo aproximado. A consulta por telefone é gratuita.', None, None),
    },
    'zh': {
        'nadzor': ('CAS 提供技术监理和设计师监理，其他承包商施工时也可以：条件和费用单独商定。电话咨询免费。',
                   ['/zh/design-implementation', '设计方案落地'], None),
        'furn': ('交钥匙家具配置每平方米 $250 起；家具、灯具和装饰均可定制。电话咨询免费。',
                 ['/zh/furnishing', '交钥匙家具配置'], ['/zh/turnkey-procurement', '交钥匙配套采购']),
        'build': ('房屋建造每平方米 $600 起，交钥匙每平方米 $1,100 起；建筑设计每平方米 $12 起。电话咨询免费。',
                  ['/zh/house-construction', '房屋建造'], ['/zh/house-construction#build-anim', '看看我们如何建造']),
        'smeta': ('装修每平方米 $550 起：人工和基础材料；饰面材料、家具和电器另按预算计算。电话咨询免费。',
                  ['/zh/turnkey-renovation', '交钥匙装修'], ['/zh/renovation-calculator', '装修费用计算器']),
        'design': ('设计方案每平方米 $30 起（最低 $2,500），平面布局方案每平方米 $6 起。电话咨询免费。',
                   ['/zh/interior-design', '室内设计'], ['/zh/renovation-calculator', '费用计算器']),
        'own': ('告诉我们您的物业情况，我们会给出大致费用。电话咨询免费。', None, None),
    },
    'ar': {
        'nadzor': ('إشراف فني وإشراف المصمم من CAS، حتى عندما ينفذ التجديد مقاول آخر: الشروط والتكلفة تُحدَّد لكل حالة. الاستشارة الهاتفية مجانية.',
                   ['/ar/design-implementation', 'تنفيذ مشروع التصميم'], None),
        'furn': ('التأثيث الجاهز للتسليم من $250/م²؛ أثاث وإضاءة وديكور حسب الطلب. الاستشارة الهاتفية مجانية.',
                 ['/ar/furnishing', 'التأثيث الجاهز للتسليم'], ['/ar/turnkey-procurement', 'التجهيز الجاهز للتسليم']),
        'build': ('بناء المنازل من $600/م²، والجاهز للتسليم من $1 100/م²؛ التصميم المعماري من $12/م². الاستشارة الهاتفية مجانية.',
                  ['/ar/house-construction', 'بناء المنازل'], ['/ar/house-construction#build-anim', 'شاهد كيف نبني']),
        'smeta': ('التجديد من $550/م²: الأعمال ومواد الأعمال الأولية؛ مواد التشطيب والأثاث والأجهزة منفصلة حسب التقدير. الاستشارة الهاتفية مجانية.',
                  ['/ar/turnkey-renovation', 'التجديد الجاهز للتسليم'], ['/ar/renovation-calculator', 'حاسبة تكلفة التجديد']),
        'design': ('مشروع التصميم من $30/م² (الحد الأدنى $2 500)، والمخطط الوظيفي من $6/م². الاستشارة الهاتفية مجانية.',
                   ['/ar/interior-design', 'التصميم الداخلي'], ['/ar/renovation-calculator', 'حاسبة التكلفة']),
        'own': ('أخبرنا عن عقارك وسنعطيك تكلفة تقديرية. الاستشارة الهاتفية مجانية.', None, None),
    },
}
TP_ARIA = {'uk': 'Послуга за темою статті', 'ru': 'Услуга по теме статьи', 'en': 'Related service', 'pl': 'Usługa związana z artykułem',
           'es': 'Servicio relacionado', 'de': 'Passende Leistung', 'fr': 'Service associé', 'pt': 'Serviço relacionado', 'zh': '相关服务', 'ar': 'خدمة ذات صلة'}


def _exists(href):
    p = href.split('#')[0].strip('/')
    return bool(p) and (os.path.exists(os.path.join(ROOT, p + '.html')) or os.path.exists(os.path.join(ROOT, p, 'index.html')))


def topic(a):
    """Тема: спершу slug (надзор/нагляд, кошторис — кнопка на свою послугу), далі — родина URL послуги статті."""
    for k, rx, _ in TOPICS:
        if rx and re.search(rx, a['slug']):
            own = next(f for t, _, f in TOPICS if t == 'own')
            return 'own' if k == 'smeta' and re.search(own, a['service'][0]) else k  # кошторис комплексу/офісу — своя послуга й ставки
    return next((k for k, _, f in TOPICS if re.search(f, a['service'][0])), 'own')


def cta_html(a):
    """<aside class="bcta">: рядок + кнопка на лендинг за темою (+ друге посилання). Порожньо, якщо мови немає в TP."""
    lang = a['lang']
    if lang not in TP:
        return ''
    k = topic(a)
    line, main, sec = TP[lang][k]
    fam = next(f for t, _, f in TOPICS if t == k)
    su, sl = a['service']
    sl = re.sub(r'\s+(?:від|от|from|od)\s+\$.*$', '', sl)
    if not main or k not in ('nadzor', 'smeta') or re.search(fam, su) or (k == 'smeta' and re.search(SMETA_KEEP, su)):
        main = [su, sl]  # послуга статті точніша; тему перекриваємо лише для нагляду й кошторису
    if not _exists(main[0]):
        main = [su, sl]
    if not flags.OZDOBA_PUBLIC:  # Оздоба прихована (tools/site/flags.py): без кнопок і згадки каталогу в заклику
        dm = TP[lang]['furn'][1]
        if flags.oz_href(main[0]) and dm and not flags.oz_href(dm[0]):
            main = dm
        if sec and flags.oz_href(sec[0]):
            sec = None
        line = re.sub(r'\s*[—–-]\s*[^.;—]*?(?:Оздоб|Ozdoba)[^.;—]*', '', line)
    if sec and (not _exists(sec[0]) or (sec[0].split('#')[0] == main[0] and '#' not in sec[0])):
        sec = None
    o = (f'<aside class="bcta" data-t="{k}" aria-label="{esc(TP_ARIA.get(lang, ""))}"><p>{esc(line)}</p><p class="bcta-a">'
         f'<a class="btn main" href="{main[0]}">{esc(main[1])}</a>')
    if sec:
        o += f'<a class="bcta-2" href="{sec[0]}">{esc(sec[1])} →</a>'
    return o + '</p></aside>'


def _icon(i, ver):
    return f'<svg class="ic" aria-hidden="true"><use href="/assets/icons.v1.svg?v={ver}#{i}"/></svg>'


_CJK = re.compile(r'[\u3400-\u9fff]')


def _wc(s):
    """Слова; для китайської — ієрогліфи / 2 (≈ слово), щоб «хв читання» й мінімум тексту були співмірні."""
    c = len(_CJK.findall(s))
    return len(s.split()) + c // 2 if c else len(s.split())


def _words(body):
    n = 0
    for node in body:
        if node[0] == 'p':
            n += _wc(node[1])
        elif node[0] in ('ul', 'ol'):
            n += sum(_wc(x) for x in node[1])
    return n


def pie_key(a):
    if a.get('pie') is False:  # стаття не технічна, хоч у назві «будівництво» (напр. міні-готель) — без пирога
        return None
    if a['lang'] not in ('uk', 'ru', 'en', 'pl', 'es', 'de', 'fr', 'pt', 'zh', 'ar'):
        return None
    src = (a['slug'] + ' ' + a['title']).lower()
    # лише технічні статті: будівництво, конструкції, «мокрі» зони, підлоги, покрівля
    if not re.search(r'будівництв|будинк|будинок|строительств|\bдом[аы]?\b|house|budow|\bванн|bathroom.renovation|łazienk|стяжк|покрівл|кровл|фундамент|пиріг|пирог|технолог|каркас|газоблок|брус|roof', src):
        return None
    for rx, k in PIES:
        if re.search(rx, src):
            return k
    return None


def pie_html(lang, key):
    import buildanim_data as BD
    t = BD.T.get(lang) or BD.T['en']
    title, rows = t['pie'][key]
    typ = t['ui'].get('typ', '')
    li = ''.join(f'<li style="--i:{n}"><b>{esc(a)}</b><span class="bp-t">{esc(th)}</span><span class="bp-n">{esc(no)}</span></li>' for n, (a, th, no) in enumerate(rows))
    return f'<figure class="bpie" aria-label="{esc(title)}"><figcaption>{esc(title)} <small>{esc(typ)}</small></figcaption><ol>{li}</ol></figure>'


def body(a, render_node, inline, ver):
    """HTML статті: «Коротко» → зміст-плитки → розділи (h2 + .bsc) з чеклістами; пиріг — у кінці розділу, де йдеться про тему."""
    lang, t = a['lang'], T.get(a['lang'], T['en'])
    secs, cur = [], None
    pre = []
    for node in a['body']:
        if node[0] == 'h2':
            cur = [node[1], []]; secs.append(cur)
        elif cur is None:
            pre.append(node)
        else:
            cur[1].append(node)
    pk = pie_key(a)
    pie_at = None
    if pk:
        words = {'roof': r'покрівл|кровл|дах|roof', 'fplate': r'фундамент|foundation', 'f_wet': r'гідроізол|гидроизол|waterproof|ванн',
                 'f_floor': r'стяжк|підлог|пол|floor', 'slab': r'перекрит|перекрыт|slab', 'win': r'вікн|окн|window'}.get(pk, r'стін|стен|wall|кладк|газоблок')
        pie_at = next((i for i, (h, nodes) in enumerate(secs) if re.search(words, (h + ' ' + ' '.join(str(n[1]) for n in nodes)).lower())), 0 if secs else None)
    o = [render_node(pre)] if pre else []
    # «Коротко»: час читання, ціни зі статті, розділи й питання, послуга
    mins = max(1, round(_words(a['body']) / 200))
    text = ' '.join(str(n[1]) for n in a['body'] if n[0] in ('p', 'ul', 'ol'))
    if not flags.OZDOBA_PUBLIC:  # «Ціни:» — без мінімального замовлення Оздоби ($10 000) і порогів її знижок
        text = re.sub(r'\d+ ?% — \S+ \$[\d  ,]+\d', '', oztext.text(text, lang))  # пороги знижок за обсягом Оздоби
    prices = []
    for m in PRICE.finditer(text):
        p = re.sub(r'\s+', ' ', m.group(0)).strip()
        if p.lower() not in [x.lower() for x in prices]:
            prices.append(p)
    rows = [('ti', f'≈ {mins} {t["read"]}'), ('st', f'{t["parts"]}: {len(secs)} · {t["q"]}: {len(a.get("faq", []))}')]
    if prices:
        rows.insert(1, ('pr', f'{t["price"]}: ' + ', '.join(prices[:3])))
    su, sl = a['service']
    k = (f'<aside class="bk" aria-label="{esc(t["k"])}"><p class="bk-h">{esc(t["k"])}</p><ul>'
         + ''.join(f'<li>{_icon(i, ver)}<span>{esc(x)}</span></li>' for i, x in rows)
         + f'<li>{_icon("ho", ver)}<span>{esc(t["svc"])}: <a href="{su}">{esc(sl)}</a></span></li></ul></aside>')
    o.append(k)
    if len(secs) >= 3:
        o.append(f'<nav class="btoc" aria-label="{esc(t["toc"])}">' + ''.join(
            f'<a href="#s{i + 1}"><b>{i + 1:02d}</b><span>{esc(h)}</span></a>' for i, (h, _) in enumerate(secs)) + '</nav>')
    cta = cta_html(a)
    at = 1 if len(secs) >= 3 else -1  # після 2-го розділу; коротка стаття — одразу після «Коротко»
    if at < 0 and cta:
        o.append(cta)
    for i, (h, nodes) in enumerate(secs):
        inner = render_node(nodes)
        inner = re.sub(r'<ul>', '<ul class="chk">', inner)  # чеклісти з іконками (CSS ::before)
        if i == pie_at:
            inner += '\n' + pie_html(lang, pk)
        o.append(f'<section class="bsec" id="s{i + 1}" aria-labelledby="s{i + 1}h"><h2 id="s{i + 1}h">{esc(h)}</h2><div class="bsc">{inner}</div></section>')
        if i == at and cta:
            o.append(cta)
    return '\n'.join(o)
