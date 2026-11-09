"""Умови використання сайту (9 мов) — /umovy-korystuvannia, /ru/usloviya-ispolzovaniya, /en/terms-of-use …

Редакція від 09.11.2026 (Михайло). Шаблон сторінки — політика конфіденційності тієї ж мови (head, стилі .pp, шапка/футер),
замінюються title/description/canonical/og, hreflang (кластер "terms" у tools/site/lang/clusters.json) і вміст <main>.
Факти — лише з CLAUDE.md. /terms (англ. умови застосунку для TikTok) — окрема стара сторінка, не чіпаємо.
Запуск: python3 tools/site/terms.py (у build-all перед chrome.py). Посилання «Умови» у футері — `terms` у chrome.py / lang/*.json.
"""
import html, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import i18n  # noqa: E402
import chrome  # noqa: E402

ROOT = i18n.ROOT
B = i18n.B
DATE = '2026-11-09'
PHONE = '+380 97 866 77 55'

# {privacy} {contact} {ozdoba} — посилання тієї ж мови; {addr} — адреса з футера; {phone}
T = {
    'uk': dict(
        title='Умови використання сайту | CAS Development',
        desc='Умови використання cas-develop.com: інформація не є офертою, ціни «від» орієнтовні, замовлення Оздоби, заявки, права на фото й рендери.',
        h1='Умови використання сайту', date='Редакція від 09.11.2026',
        body=[
            ('Хто ми', ['Сайт cas-develop.com належить студії дизайну інтерʼєру, ремонту й будівництва CAS Development ({addr}). Телефон, Telegram, Viber, WhatsApp: {phone}. Користуючись сайтом, ви погоджуєтеся з цими умовами.']),
            ('Інформація на сайті — не оферта', ['Тексти, ціни, калькулятор і приклади проєктів на сайті — довідкові й не є публічною офертою. Роботи виконуємо за письмовим договором; обсяг, вартість, строки й гарантія — у договорі.']),
            ('Ціни «від»', ['Ціни з позначкою «від» і результат калькулятора — орієнтовна нижня межа за нашими базовими ставками. Остаточну вартість фіксують кошторис і договір після заміру (замір платний) та узгодження обсягу робіт і матеріалів.',
                            'Гарантія 12 місяців діє лише на роботи, які CAS Development виконує за договором.']),
            ('Заявки й персональні дані', ['Надсилаючи форму, ви погоджуєтеся, що ми звʼяжемося з вами щодо заявки. Заявка ні до чого не зобовʼязує ні вас, ні нас. Які дані ми отримуємо і як їх обробляємо — у <a href="{privacy}">Політиці конфіденційності</a>.']),
            ('Замовлення Оздоби', ['Мінімальне замовлення в <a href="{ozdoba}">Оздобі</a> — від $10 000; кожної позиції — від 10 шт., поштучно не продаємо. Ціни в каталозі орієнтовні: наявність, ціну й строк менеджер підтверджує після заявки, заявка — не оплата. Можливе виготовлення під замовлення (колір, розмір, матеріал, оздоблення).',
                                   'Поставка з Китаю — 35–70 днів. Вартість доставки й митних платежів не фіксована — розраховуємо індивідуально залежно від обсягу замовлення.',
                                   'Оплата — карткою за посиланням від менеджера, рахунком для ФОП і ТОВ (з ПДВ або без — індивідуально), готівкою (гривні, долари, євро) або в USDT. Розстрочки й накладеного платежу немає.']),
            ('Фото, рендери й тексти', ['Фото проєктів, рендери, тексти, сцени й інші матеріали сайту належать CAS Development. Копіювати їх або використовувати в комерційних цілях можна лише з нашого письмового дозволу; цитувати — з посиланням на сайт.',
                                        'Анімовані сцени, візуалізації й калькулятор — ілюстрації. Реальні рішення, матеріали й строки визначають проєкт і договір.']),
            ('Відповідальність', ['Ми стежимо, щоб інформація на сайті була точною, але можемо помилятися й оновлювати її без попередження. Не відповідаємо за перебої в роботі сайту й за вміст сторонніх сайтів і сервісів, на які ведуть посилання (месенджери, карти, соцмережі). Наші зобовʼязання щодо робіт і поставок визначає договір.']),
            ('Право й спори', ['До цих умов застосовується право України. Спори спершу вирішуємо переговорами, а якщо не вийде — у порядку, встановленому законодавством України.']),
            ('Зміни умов', ['Ми можемо змінювати ці умови. Нова редакція діє з дати, указаної вгорі сторінки.']),
            ('Контакти', ['{phone} (дзвінок, Telegram, Viber, WhatsApp), {addr}. Усі способи звʼязку — на сторінці <a href="{contact}">Контакти</a>.']),
        ]),
    'ru': dict(
        title='Условия использования сайта | CAS Development',
        desc='Условия использования cas-develop.com: информация не является офертой, цены «от» ориентировочные, заказы Оздобы, заявки, права на фото и рендеры.',
        h1='Условия использования сайта', date='Редакция от 09.11.2026',
        body=[
            ('Кто мы', ['Сайт cas-develop.com принадлежит студии дизайна интерьера, ремонта и строительства CAS Development ({addr}). Телефон, Telegram, Viber, WhatsApp: {phone}. Пользуясь сайтом, вы соглашаетесь с этими условиями.']),
            ('Информация на сайте — не оферта', ['Тексты, цены, калькулятор и примеры проектов на сайте — справочные и не являются публичной офертой. Работы выполняем по письменному договору; объём, стоимость, сроки и гарантия — в договоре.']),
            ('Цены «от»', ['Цены с пометкой «от» и результат калькулятора — ориентировочная нижняя граница по нашим базовым ставкам. Окончательную стоимость фиксируют смета и договор после замера (замер платный) и согласования объёма работ и материалов.',
                           'Гарантия 12 месяцев действует только на работы, которые CAS Development выполняет по договору.']),
            ('Заявки и персональные данные', ['Отправляя форму, вы соглашаетесь, что мы свяжемся с вами по заявке. Заявка ни к чему не обязывает ни вас, ни нас. Какие данные мы получаем и как их обрабатываем — в <a href="{privacy}">Политике конфиденциальности</a>.']),
            ('Заказы Оздобы', ['Минимальный заказ в <a href="{ozdoba}">Оздобе</a> — от $10 000; каждой позиции — от 10 шт., поштучно не продаём. Цены в каталоге ориентировочные: наличие, цену и срок менеджер подтверждает после заявки, заявка — не оплата. Возможно изготовление под заказ (цвет, размер, материал, отделка).',
                               'Поставка из Китая — 35–70 дней. Стоимость доставки и таможенных платежей не фиксирована — рассчитываем индивидуально в зависимости от объёма заказа.',
                               'Оплата — картой по ссылке от менеджера, счётом для ФЛП и ООО (с НДС или без — индивидуально), наличными (гривны, доллары, евро) или в USDT. Рассрочки и наложенного платежа нет.']),
            ('Фото, рендеры и тексты', ['Фото проектов, рендеры, тексты, сцены и другие материалы сайта принадлежат CAS Development. Копировать их или использовать в коммерческих целях можно только с нашего письменного разрешения; цитировать — со ссылкой на сайт.',
                                        'Анимированные сцены, визуализации и калькулятор — иллюстрации. Реальные решения, материалы и сроки определяют проект и договор.']),
            ('Ответственность', ['Мы следим, чтобы информация на сайте была точной, но можем ошибаться и обновлять её без предупреждения. Не отвечаем за перебои в работе сайта и за содержимое сторонних сайтов и сервисов, на которые ведут ссылки (мессенджеры, карты, соцсети). Наши обязательства по работам и поставкам определяет договор.']),
            ('Право и споры', ['К этим условиям применяется право Украины. Споры сначала решаем переговорами, а если не получится — в порядке, установленном законодательством Украины.']),
            ('Изменения условий', ['Мы можем изменять эти условия. Новая редакция действует с даты, указанной вверху страницы.']),
            ('Контакты', ['{phone} (звонок, Telegram, Viber, WhatsApp), {addr}. Все способы связи — на странице <a href="{contact}">Контакты</a>.']),
        ]),
    'en': dict(
        title='Terms of Use | CAS Development',
        desc='Terms of use of cas-develop.com: site information is not an offer, “from” prices are indicative, Ozdoba orders, enquiries, rights to photos and renders.',
        h1='Terms of Use', date='Version of 9 November 2026',
        body=[
            ('Who we are', ['The website cas-develop.com belongs to CAS Development, an interior design, renovation and construction studio ({addr}). Phone, Telegram, Viber, WhatsApp: {phone}. By using the website you agree to these terms.']),
            ('Website information is not an offer', ['Texts, prices, the calculator and project examples on the website are for information only and are not a public offer. We carry out work under a written contract; scope, cost, timing and warranty are set in the contract.']),
            ('“From” prices', ['Prices marked “from” and calculator results are an indicative lower limit at our base rates. The final cost is fixed by the estimate and the contract after on-site measurement (measurement is paid) and agreement on the scope of works and materials.',
                               'The 12-month warranty applies only to works that CAS Development carries out under a contract.']),
            ('Enquiries and personal data', ['By sending a form you agree that we will contact you about your enquiry. An enquiry does not oblige either you or us. What data we receive and how we process it is described in the <a href="{privacy}">Privacy policy</a>.']),
            ('Ozdoba orders', ['The minimum order in <a href="{ozdoba}">Ozdoba</a> is $10,000; at least 10 pcs of each item — we do not sell single pieces. Catalogue prices are indicative: our manager confirms availability, price and lead time after your request, and a request is not a payment. Made-to-order production is possible (colour, size, material, finish).',
                               'Lead time from China is 35–70 days. Delivery and customs costs are not fixed — we calculate them individually depending on the order volume.',
                               'Payment: by card via a link from our manager, by invoice for companies registered in Ukraine (with or without VAT, individually), in cash (UAH, USD, EUR) or in USDT. No instalments and no cash on delivery.']),
            ('Photos, renders and texts', ['Project photos, renders, texts, scenes and other website materials belong to CAS Development. You may copy them or use them commercially only with our written permission; quoting is allowed with a link to the website.',
                                           'Animated scenes, visualisations and the calculator are illustrations. Actual solutions, materials and timing are defined by the project and the contract.']),
            ('Liability', ['We make every effort to keep the information on the website accurate, but it may contain errors and may be updated without notice. We are not liable for interruptions of the website or for the content of third-party websites and services we link to (messengers, maps, social media). Our obligations regarding works and supplies are defined by the contract.']),
            ('Governing law and disputes', ['These terms are governed by the law of Ukraine. We first try to settle disputes by negotiation; failing that, in the manner established by the legislation of Ukraine.']),
            ('Changes to these terms', ['We may change these terms. A new version applies from the date shown at the top of the page.']),
            ('Contact', ['{phone} (call, Telegram, Viber, WhatsApp), {addr}. All ways to reach us are on the <a href="{contact}">Contact</a> page.']),
        ]),
    'es': dict(
        title='Condiciones de uso | CAS Development',
        desc='Condiciones de uso de cas-develop.com: la información no es una oferta, precios «desde» orientativos, pedidos de Ozdoba, solicitudes y derechos sobre fotos.',
        h1='Condiciones de uso', date='Versión del 9 de noviembre de 2026',
        body=[
            ('Quiénes somos', ['El sitio web cas-develop.com pertenece a CAS Development, estudio de diseño de interiores, reformas y construcción ({addr}). Teléfono, Telegram, Viber, WhatsApp: {phone}. Al usar el sitio, acepta estas condiciones.']),
            ('La información del sitio no es una oferta', ['Los textos, precios, la calculadora y los ejemplos de proyectos son informativos y no constituyen una oferta pública. Trabajamos con contrato por escrito; el alcance, el coste, los plazos y la garantía se fijan en el contrato.']),
            ('Precios «desde»', ['Los precios marcados «desde» y el resultado de la calculadora son un límite inferior orientativo según nuestras tarifas base. El coste final lo fijan el presupuesto y el contrato tras la medición (la medición es de pago) y el acuerdo sobre el alcance de las obras y los materiales.',
                                 'La garantía de 12 meses se aplica solo a las obras que CAS Development realiza por contrato.']),
            ('Solicitudes y datos personales', ['Al enviar un formulario, acepta que nos pongamos en contacto con usted sobre su solicitud. La solicitud no obliga ni a usted ni a nosotros. Qué datos recibimos y cómo los tratamos se explica en la <a href="{privacy}">Política de privacidad</a>.']),
            ('Pedidos de Ozdoba', ['El pedido mínimo en <a href="{ozdoba}">Ozdoba</a> es de $10 000, con al menos 10 uds. de cada artículo; no vendemos unidades sueltas. Los precios del catálogo son orientativos: el gestor confirma disponibilidad, precio y plazo tras la solicitud, y la solicitud no es un pago. Es posible la fabricación a medida (color, tamaño, material, acabado).',
                                   'El plazo de entrega desde China es de 35–70 días. El coste de envío y aduanas no es fijo: lo calculamos de forma individual según el volumen del pedido.',
                                   'Pago: con tarjeta mediante enlace del gestor, con factura para empresas registradas en Ucrania (con IVA o sin IVA, de forma individual), en efectivo (UAH, USD, EUR) o en USDT. Sin pago a plazos ni contra reembolso.']),
            ('Fotos, renders y textos', ['Las fotos de proyectos, renders, textos, escenas y demás materiales del sitio pertenecen a CAS Development. Solo pueden copiarse o usarse con fines comerciales con nuestro permiso por escrito; se pueden citar con un enlace al sitio.',
                                         'Las escenas animadas, visualizaciones y la calculadora son ilustraciones. Las soluciones, materiales y plazos reales los definen el proyecto y el contrato.']),
            ('Responsabilidad', ['Procuramos que la información del sitio sea exacta, pero puede contener errores y actualizarse sin previo aviso. No respondemos de interrupciones del sitio ni del contenido de sitios y servicios de terceros a los que enlazamos (mensajería, mapas, redes sociales). Nuestras obligaciones sobre obras y suministros las define el contrato.']),
            ('Ley aplicable y controversias', ['Estas condiciones se rigen por la legislación de Ucrania. Primero intentamos resolver las controversias mediante negociación y, si no es posible, conforme a la legislación de Ucrania.']),
            ('Cambios en las condiciones', ['Podemos modificar estas condiciones. La nueva versión rige desde la fecha indicada al principio de la página.']),
            ('Contacto', ['{phone} (llamada, Telegram, Viber, WhatsApp), {addr}. Todas las formas de contacto, en la página <a href="{contact}">Contacto</a>.']),
        ]),
    'zh': dict(
        title='网站使用条款 | CAS Development',
        desc='cas-develop.com 使用条款：网站信息不构成要约，“起价”仅供参考，Ozdoba 订单、咨询申请、照片与效果图版权。',
        h1='网站使用条款', date='2026 年 11 月 9 日版',
        body=[
            ('关于我们', ['网站 cas-develop.com 属于室内设计、装修与建造工作室 CAS Development（{addr}）。电话、Telegram、Viber、WhatsApp：{phone}。使用本网站即表示您同意本条款。']),
            ('网站信息不构成要约', ['网站上的文字、价格、计算器和项目案例仅供参考，不构成公开要约。我们依据书面合同施工；范围、费用、工期和保修以合同为准。']),
            ('“起价”', ['标有“起”的价格和计算器结果是按我们基础单价得出的参考下限。最终费用在测量（测量收费）并商定工程和材料范围后，以预算和合同为准。',
                       '12 个月保修仅适用于 CAS Development 依据合同完成的工程。']),
            ('咨询申请与个人数据', ['提交表单即表示您同意我们就申请与您联系。申请对您和我们均无约束力。我们收集哪些数据以及如何处理，请见<a href="{privacy}">隐私政策</a>。']),
            ('Ozdoba 订单', ['<a href="{ozdoba}">Ozdoba</a> 最低订单 $10 000 起；每款至少 10 件，不单件销售。目录价格仅供参考：申请后由经理确认库存、价格和交期，申请不等于付款。可按需定制（颜色、尺寸、材质、饰面）。',
                            '从中国发货需 35–70 天。运费和关税不固定，根据订单量单独计算。',
                            '付款方式：经理发送的链接刷卡支付、向在乌克兰注册的公司开具发票（含或不含增值税，视具体情况而定）、现金（格里夫纳、美元、欧元）或 USDT。不提供分期付款和货到付款。']),
            ('照片、效果图与文字', ['网站上的项目照片、效果图、文字、动画场景及其他资料归 CAS Development 所有。未经我们书面许可，不得复制或用于商业用途；引用时请注明网站链接。',
                                   '动画场景、可视化和计算器仅为示意。实际方案、材料和工期以设计方案和合同为准。']),
            ('责任', ['我们尽力确保网站信息准确，但信息可能有误，也可能在不另行通知的情况下更新。对于网站中断以及所链接的第三方网站和服务（即时通讯、地图、社交媒体）的内容，我们不承担责任。我们在工程和供货方面的义务以合同为准。']),
            ('适用法律与争议', ['本条款适用乌克兰法律。争议首先通过协商解决；协商不成的，依照乌克兰法律规定的程序解决。']),
            ('条款变更', ['我们可能修改本条款。新版本自页面顶部注明的日期起生效。']),
            ('联系方式', ['{phone}（电话、Telegram、Viber、WhatsApp），{addr}。全部联系方式见<a href="{contact}">联系我们</a>页面。']),
        ]),
    'pl': dict(
        title='Regulamin korzystania ze strony | CAS Development',
        desc='Regulamin cas-develop.com: informacje nie są ofertą, ceny „od” są orientacyjne, zamówienia Ozdoba, zapytania, prawa do zdjęć i wizualizacji.',
        h1='Regulamin korzystania ze strony', date='Wersja z 9 listopada 2026 r.',
        body=[
            ('Kim jesteśmy', ['Strona cas-develop.com należy do CAS Development — studia projektowania wnętrz, remontów i budowy ({addr}). Telefon, Telegram, Viber, WhatsApp: {phone}. Korzystając ze strony, akceptujesz ten regulamin.']),
            ('Informacje na stronie nie są ofertą', ['Teksty, ceny, kalkulator i przykłady projektów na stronie mają charakter informacyjny i nie stanowią oferty w rozumieniu przepisów. Prace wykonujemy na podstawie pisemnej umowy; zakres, koszt, terminy i gwarancję określa umowa.']),
            ('Ceny „od”', ['Ceny oznaczone „od” i wynik kalkulatora to orientacyjna dolna granica według naszych stawek bazowych. Ostateczny koszt ustalają kosztorys i umowa po pomiarze (pomiar jest płatny) i uzgodnieniu zakresu prac i materiałów.',
                           'Gwarancja 12 miesięcy obejmuje wyłącznie prace wykonane przez CAS Development na podstawie umowy.']),
            ('Zapytania i dane osobowe', ['Wysyłając formularz, zgadzasz się, że skontaktujemy się z Tobą w sprawie zapytania. Zapytanie nie zobowiązuje ani Ciebie, ani nas. Jakie dane otrzymujemy i jak je przetwarzamy — w <a href="{privacy}">Polityce prywatności</a>.']),
            ('Zamówienia Ozdoba', ['Minimalne zamówienie w <a href="{ozdoba}">Ozdoba</a> — od $10 000; każdej pozycji — od 10 szt., nie sprzedajemy pojedynczych sztuk. Ceny w katalogu są orientacyjne: dostępność, cenę i termin menedżer potwierdza po zapytaniu, a zapytanie nie jest płatnością. Możliwa produkcja na zamówienie (kolor, rozmiar, materiał, wykończenie).',
                                   'Dostawa z Chin — 35–70 dni. Koszt dostawy i cła nie jest stały — liczymy go indywidualnie w zależności od wielkości zamówienia.',
                                   'Płatność: kartą przez link od menedżera, fakturą dla firm zarejestrowanych na Ukrainie (z VAT lub bez, indywidualnie), gotówką (UAH, USD, EUR) lub w USDT. Bez rat i bez płatności przy odbiorze.']),
            ('Zdjęcia, wizualizacje i teksty', ['Zdjęcia projektów, wizualizacje, teksty, sceny i inne materiały strony należą do CAS Development. Kopiowanie ich lub wykorzystanie w celach komercyjnych wymaga naszej pisemnej zgody; cytowanie — z linkiem do strony.',
                                                'Animowane sceny, wizualizacje i kalkulator są ilustracjami. Rzeczywiste rozwiązania, materiały i terminy określają projekt i umowa.']),
            ('Odpowiedzialność', ['Dbamy o to, by informacje na stronie były dokładne, ale mogą zawierać błędy i być aktualizowane bez uprzedzenia. Nie odpowiadamy za przerwy w działaniu strony ani za treść stron i usług osób trzecich, do których prowadzą linki (komunikatory, mapy, media społecznościowe). Nasze zobowiązania dotyczące prac i dostaw określa umowa.']),
            ('Prawo i spory', ['Do regulaminu stosuje się prawo Ukrainy. Spory rozwiązujemy najpierw w drodze negocjacji, a jeśli to się nie uda — w trybie przewidzianym przez prawo Ukrainy.']),
            ('Zmiany regulaminu', ['Możemy zmieniać ten regulamin. Nowa wersja obowiązuje od daty podanej na górze strony.']),
            ('Kontakt', ['{phone} (telefon, Telegram, Viber, WhatsApp), {addr}. Wszystkie sposoby kontaktu — na stronie <a href="{contact}">Kontakt</a>.']),
        ]),
    'de': dict(
        title='Nutzungsbedingungen | CAS Development',
        desc='Nutzungsbedingungen von cas-develop.com: Angaben sind kein Angebot, „ab“-Preise sind Richtwerte, Ozdoba-Bestellungen, Anfragen, Rechte an Fotos und Renderings.',
        h1='Nutzungsbedingungen', date='Fassung vom 9. November 2026',
        body=[
            ('Wer wir sind', ['Die Website cas-develop.com gehört CAS Development, einem Studio für Innenarchitektur, Renovierung und Bau ({addr}). Telefon, Telegram, Viber, WhatsApp: {phone}. Mit der Nutzung der Website stimmen Sie diesen Bedingungen zu.']),
            ('Angaben auf der Website sind kein Angebot', ['Texte, Preise, der Rechner und Projektbeispiele dienen der Information und sind kein verbindliches Angebot. Wir arbeiten auf Grundlage eines schriftlichen Vertrags; Umfang, Kosten, Fristen und Gewährleistung regelt der Vertrag.']),
            ('„Ab“-Preise', ['Preise mit „ab“ und Ergebnisse des Rechners sind eine unverbindliche Untergrenze nach unseren Basissätzen. Die endgültigen Kosten legen Kostenvoranschlag und Vertrag nach dem Aufmaß (das Aufmaß ist kostenpflichtig) und der Abstimmung von Leistungsumfang und Materialien fest.',
                             'Die Gewährleistung von 12 Monaten gilt nur für Arbeiten, die CAS Development im Rahmen eines Vertrags ausführt.']),
            ('Anfragen und personenbezogene Daten', ['Mit dem Absenden eines Formulars stimmen Sie zu, dass wir Sie zu Ihrer Anfrage kontaktieren. Eine Anfrage verpflichtet weder Sie noch uns. Welche Daten wir erhalten und wie wir sie verarbeiten, steht in der <a href="{privacy}">Datenschutzerklärung</a>.']),
            ('Ozdoba-Bestellungen', ['Der Mindestbestellwert bei <a href="{ozdoba}">Ozdoba</a> beträgt $10 000; je Artikel mindestens 10 Stück — Einzelstücke verkaufen wir nicht. Katalogpreise sind Richtwerte: Verfügbarkeit, Preis und Lieferzeit bestätigt unser Manager nach der Anfrage, eine Anfrage ist keine Zahlung. Anfertigung nach Wunsch ist möglich (Farbe, Größe, Material, Oberfläche).',
                                     'Lieferzeit aus China: 35–70 Tage. Versand- und Zollkosten sind nicht fest — wir berechnen sie individuell je nach Bestellumfang.',
                                     'Zahlung: per Karte über einen Link unseres Managers, per Rechnung für in der Ukraine registrierte Firmen (mit oder ohne MwSt., individuell), in bar (UAH, USD, EUR) oder in USDT. Keine Ratenzahlung und keine Nachnahme.']),
            ('Fotos, Renderings und Texte', ['Projektfotos, Renderings, Texte, Szenen und andere Inhalte der Website gehören CAS Development. Kopieren oder kommerzielle Nutzung nur mit unserer schriftlichen Erlaubnis; Zitieren mit Link auf die Website ist erlaubt.',
                                             'Animierte Szenen, Visualisierungen und der Rechner sind Illustrationen. Tatsächliche Lösungen, Materialien und Fristen bestimmen Projekt und Vertrag.']),
            ('Haftung', ['Wir achten auf korrekte Angaben, sie können jedoch Fehler enthalten und ohne Vorankündigung aktualisiert werden. Für Unterbrechungen der Website und für Inhalte verlinkter Websites und Dienste Dritter (Messenger, Karten, soziale Medien) haften wir nicht. Unsere Pflichten zu Arbeiten und Lieferungen regelt der Vertrag.']),
            ('Anwendbares Recht und Streitigkeiten', ['Für diese Bedingungen gilt ukrainisches Recht. Streitigkeiten lösen wir zunächst durch Verhandlungen, andernfalls nach dem in der Ukraine gesetzlich vorgesehenen Verfahren.']),
            ('Änderungen', ['Wir können diese Bedingungen ändern. Eine neue Fassung gilt ab dem oben auf der Seite genannten Datum.']),
            ('Kontakt', ['{phone} (Anruf, Telegram, Viber, WhatsApp), {addr}. Alle Kontaktwege finden Sie auf der Seite <a href="{contact}">Kontakt</a>.']),
        ]),
    'fr': dict(
        title='Conditions d’utilisation | CAS Development',
        desc='Conditions d’utilisation de cas-develop.com : informations sans valeur d’offre, prix « dès » indicatifs, commandes Ozdoba, demandes, droits sur les photos.',
        h1='Conditions d’utilisation', date='Version du 9 novembre 2026',
        body=[
            ('Qui nous sommes', ['Le site cas-develop.com appartient à CAS Development, studio de design d’intérieur, de rénovation et de construction ({addr}). Téléphone, Telegram, Viber, WhatsApp : {phone}. En utilisant le site, vous acceptez ces conditions.']),
            ('Les informations du site ne sont pas une offre', ['Les textes, prix, le calculateur et les exemples de projets sont donnés à titre informatif et ne constituent pas une offre. Nous travaillons sur contrat écrit ; périmètre, coût, délais et garantie sont fixés dans le contrat.']),
            ('Prix « dès »', ['Les prix marqués « dès » et le résultat du calculateur sont une borne basse indicative selon nos tarifs de base. Le coût final est fixé par le devis et le contrat après métré (le métré est payant) et accord sur le périmètre des travaux et des matériaux.',
                             'La garantie de 12 mois s’applique uniquement aux travaux réalisés par CAS Development dans le cadre d’un contrat.']),
            ('Demandes et données personnelles', ['En envoyant un formulaire, vous acceptez que nous vous recontactions au sujet de votre demande. Une demande n’engage ni vous ni nous. Les données que nous recevons et leur traitement sont décrits dans la <a href="{privacy}">Politique de confidentialité</a>.']),
            ('Commandes Ozdoba', ['La commande minimale chez <a href="{ozdoba}">Ozdoba</a> est de $10 000, avec au moins 10 pièces par article ; nous ne vendons pas à l’unité. Les prix du catalogue sont indicatifs : le responsable confirme disponibilité, prix et délai après la demande, qui n’est pas un paiement. Fabrication sur mesure possible (couleur, dimensions, matériau, finition).',
                                  'Délai de livraison depuis la Chine : 30 à 60 jours. Les frais de livraison et de douane ne sont pas fixes : nous les calculons au cas par cas selon le volume de la commande.',
                                  'Paiement : par carte via un lien du responsable, sur facture pour les entreprises enregistrées en Ukraine (avec ou sans TVA, au cas par cas), en espèces (UAH, USD, EUR) ou en USDT. Pas de paiement échelonné ni de paiement à la livraison.']),
            ('Photos, rendus et textes', ['Les photos de projets, rendus, textes, scènes et autres contenus du site appartiennent à CAS Development. Toute copie ou utilisation commerciale nécessite notre autorisation écrite ; la citation est permise avec un lien vers le site.',
                                          'Les scènes animées, visualisations et le calculateur sont des illustrations. Les solutions, matériaux et délais réels sont définis par le projet et le contrat.']),
            ('Responsabilité', ['Nous veillons à l’exactitude des informations du site, mais elles peuvent contenir des erreurs et être mises à jour sans préavis. Nous ne sommes pas responsables des interruptions du site ni du contenu des sites et services tiers vers lesquels nous renvoyons (messageries, cartes, réseaux sociaux). Nos obligations concernant les travaux et livraisons sont définies par le contrat.']),
            ('Droit applicable et litiges', ['Ces conditions sont régies par le droit ukrainien. Nous cherchons d’abord à régler les litiges à l’amiable, à défaut selon la procédure prévue par la législation ukrainienne.']),
            ('Modifications', ['Nous pouvons modifier ces conditions. La nouvelle version s’applique à partir de la date indiquée en haut de la page.']),
            ('Contact', ['{phone} (appel, Telegram, Viber, WhatsApp), {addr}. Tous nos moyens de contact sur la page <a href="{contact}">Contact</a>.']),
        ]),
    'ar': dict(
        title='شروط الاستخدام | CAS Development',
        desc='شروط استخدام cas-develop.com: معلومات الموقع ليست عرضًا ملزمًا، والأسعار «من» تقريبية، وطلبات Ozdoba، والطلبات، وحقوق الصور والتصاميم.',
        h1='شروط استخدام الموقع', date='نسخة 9 نوفمبر 2026',
        body=[
            ('من نحن', ['الموقع cas-develop.com مملوك لاستوديو CAS Development للتصميم الداخلي والتجديد والبناء ({addr}). الهاتف وTelegram وViber وWhatsApp: <bdi dir="ltr" class="nw" style="white-space:nowrap">{phone}</bdi>. باستخدامك الموقع فإنك توافق على هذه الشروط.']),
            ('معلومات الموقع ليست عرضًا', ['النصوص والأسعار والحاسبة وأمثلة المشاريع على الموقع للاطلاع فقط ولا تُعد عرضًا عامًا ملزمًا. ننفّذ الأعمال بموجب عقد مكتوب؛ ويحدد العقد النطاق والتكلفة والمدة والضمان.']),
            ('الأسعار «من»', ['الأسعار المسبوقة بكلمة «من» ونتيجة الحاسبة حدٌّ أدنى تقريبي وفق أسعارنا الأساسية. تُحدَّد التكلفة النهائية في المقايسة والعقد بعد القياس (القياس مدفوع) والاتفاق على نطاق الأعمال والمواد.',
                              'يسري ضمان 12 شهرًا فقط على الأعمال التي تنفذها CAS Development بموجب عقد.']),
            ('الطلبات والبيانات الشخصية', ['بإرسال النموذج توافق على أن نتواصل معك بشأن طلبك. الطلب لا يُلزمك ولا يُلزمنا بشيء. البيانات التي نتلقاها وكيفية معالجتها موضّحة في <a href="{privacy}">سياسة الخصوصية</a>.']),
            ('طلبات Ozdoba', ['الحد الأدنى للطلب في <a href="{ozdoba}">Ozdoba</a> هو $10 000، وبحد أدنى 10 قطع من كل صنف؛ لا نبيع بالقطعة. أسعار الكتالوج تقريبية: يؤكد المدير التوفر والسعر والمدة بعد الطلب، والطلب ليس دفعًا. يمكن التصنيع حسب الطلب (اللون والمقاس والمادة والتشطيب).',
                               'مدة التوريد من الصين 35–70 يومًا. تكلفة الشحن والرسوم الجمركية غير ثابتة، ونحسبها بشكل فردي حسب حجم الطلب.',
                               'الدفع: بالبطاقة عبر رابط من المدير، أو بفاتورة للشركات المسجلة في أوكرانيا (مع ضريبة القيمة المضافة أو بدونها، حسب كل حالة)، أو نقدًا (هريفنيا، دولار، يورو) أو بعملة USDT. لا يوجد تقسيط ولا دفع عند الاستلام.']),
            ('الصور والتصاميم والنصوص', ['صور المشاريع والتصاميم المرئية والنصوص والمشاهد وغيرها من مواد الموقع مملوكة لـ CAS Development. لا يجوز نسخها أو استخدامها تجاريًا إلا بإذن كتابي منا؛ ويجوز الاقتباس مع رابط إلى الموقع.',
                                       'المشاهد المتحركة والتصورات المرئية والحاسبة للتوضيح فقط. يحدد المشروع والعقد الحلول والمواد والمدد الفعلية.']),
            ('المسؤولية', ['نحرص على دقة المعلومات على الموقع، لكنها قد تحتوي على أخطاء وقد تُحدَّث دون إشعار. لا نتحمل المسؤولية عن انقطاع عمل الموقع ولا عن محتوى المواقع والخدمات الخارجية التي نرتبط بها (تطبيقات المراسلة والخرائط ووسائل التواصل). يحدد العقد التزاماتنا بشأن الأعمال والتوريدات.']),
            ('القانون الواجب التطبيق والنزاعات', ['تخضع هذه الشروط لقانون أوكرانيا. نسعى أولًا إلى حل النزاعات بالتفاوض، وإلا فوفق الإجراءات التي يحددها تشريع أوكرانيا.']),
            ('تعديل الشروط', ['يجوز لنا تعديل هذه الشروط. تسري النسخة الجديدة من التاريخ المذكور أعلى الصفحة.']),
            ('التواصل', ['<bdi dir="ltr" class="nw" style="white-space:nowrap">{phone}</bdi> (اتصال، Telegram، Viber، WhatsApp)، {addr}. جميع وسائل التواصل في صفحة <a href="{contact}">اتصل بنا</a>.']),
        ]),
}
ADDR = {'uk': 'вул. Антоновича, 44, Київ, Україна', 'ru': 'ул. Антоновича, 44, Киев, Украина'}
OZD = {'uk': '/ozdoba', 'ru': '/ozdoba', 'pl': '/pl/ozdoba'}  # Оздоба є uk/en/pl; решта мов — англійська версія


def members():
    return i18n.clusters()['terms']


def build(lang):
    t, c = T[lang], i18n.clusters()
    priv, me = c['privacy'][lang], members()[lang]
    tpl = open(os.path.join(ROOT, i18n.path_to_file(priv)), encoding='utf-8').read()
    addr = ADDR.get(lang) or i18n.ui(lang)['chrome']['address']
    v = dict(privacy=priv, contact=c['contact'][lang], ozdoba=OZD.get(lang, '/en/ozdoba'), addr=html.escape(addr), phone=PHONE)
    body = ''.join(f'<h2>{h}</h2>' + ''.join(f'<p>{p.format(**v)}</p>' for p in ps) for h, ps in t['body'])
    main = f'<main id="main">\n<div class="w hero pp">\n  <h1 style="font-size:var(--fs-h2)">{t["h1"]}</h1>\n  <p class="date">{t["date"]}</p>\n  {body}\n</div>\n\n</main>'
    s = re.sub(r'<main id="main">.*?</main>', lambda m: main, tpl, count=1, flags=re.S)
    title, desc = html.escape(t['title'], quote=True), html.escape(t['desc'], quote=True)
    s = re.sub(r'<title>[^<]*</title>', lambda m: f'<title>{title}</title>', s, count=1)
    for k, val in (('name="description"', desc), ('property="og:title"', title), ('property="og:description"', desc), ('property="og:url"', B + me)):
        s = re.sub(rf'<meta {k} content="[^"]*">', lambda m: f'<meta {k} content="{val}">', s, count=1)
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{B}{me}">', s, count=1)
    s = re.sub(r'<meta name="twitter:(title|description)" content="[^"]*">\n?', '', s)
    return s


def main():
    m = members()
    for lang in i18n.LANGS:
        if lang not in m:
            continue
        rel = i18n.path_to_file(m[lang])
        out = build(lang)
        out = i18n.set_alternates(out, {l: p for l, p in m.items()})
        f = os.path.join(ROOT, rel)
        out = chrome.apply(out, rel)
        old = open(f, encoding='utf-8').read() if os.path.exists(f) else None
        if old == out:
            continue
        os.makedirs(os.path.dirname(f) or ROOT, exist_ok=True)
        open(f, 'w', encoding='utf-8').write(out)
        print('✓', rel)
    sm = os.path.join(ROOT, 'sitemap.xml')
    s = open(sm, encoding='utf-8').read()
    add = ''.join(f'  <url><loc>{B}{p}</loc><lastmod>{DATE}</lastmod><priority>0.2</priority></url>\n'
                  for l, p in m.items() if f'<loc>{B}{p}</loc>' not in s)
    if add:
        open(sm, 'w', encoding='utf-8').write(s.replace('</urlset>', add + '</urlset>'))


if __name__ == '__main__':
    main()
