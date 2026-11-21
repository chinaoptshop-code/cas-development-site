"""HTML-блок калькулятора вартості (вставляється як "calc": true у сторінки калькулятора, 10 мов).

Кілька позицій одразу (Михайло 20.11.2026): блок «Що порахувати» — плитки-перемикачі (можна позначити кілька), під ним — уточнення
лише вибраних позицій (пакет дизайну; квартира / офіс; коробка / під ключ), одне поле площі на всі позиції за м² і своє поле соток
для ландшафту; результат — сума + рядок на кожну позицію. Позиції (ITEMS) — той самий набір ставок, що й був у списку:
  дизайн інтерʼєру (пакети: планувальний $6 / —, дизайн-проєкт $30 / $45, повний з наглядом $45 / —; мінімум $2 500 / $4 000 — лише на рядок дизайну),
  ремонт (квартира $550 / $850 або офіс $350 / — це варіанти ОДНІЄЇ позиції: одна площа не рахується двома ремонтами),
  меблювання й комплектація $250 / $400, будівництво будинку (коробка $600 / $900 або під ключ $1 100 / $1 700),
  архпроєкт $12 / $18 (за м²), ландшафтний дизайн $50 / — (за сотку = 100 м², своє поле).
Ставки — з tools/site/rates.py (лише CLAUDE.md), [Україна, Європа]; None — для Європи ставки немає → «за кошторисом».
«Ремонт» і «Будівництво будинку» разом не вибираються (EXCL): оздоблення вже є в «під ключ», площа одна — вибір одного знімає інше.
±5% — лише в примітці до ремонту (квартира, офіс), бо діє, лише якщо ремонт робить CAS.
Кнопка «Отримати кошторис» переносить у форму #of: площу (#oArea, м²), регіон, усі вибрані позиції з варіантами й суму (#oMsg) і data-service
(основна позиція — перша вибрана). Посилання з параметром: ?k=remont|office|house|housekey|design|arch|land (старі значення списку) або кілька
через кому (?k=design,remont,furn; ще plan|dz|full|box|key) — вибирає ці позиції замість типової. UI-kit — /styleguide/#calc-sg (пише цей файл).
Тип будинку (Михайло 21.11.2026): коли вибрано «Будівництво будинку», під «Коробка / Під ключ» — ряд «Тип будинку» (#cHt button[data-t], один вибір;
кнопки будує calc.v1.js з конфігу; типово «Ще не визначились» = базові ставки $600 / $1 100, суми як раніше). Типи й їхні ставки — rates.HOUSE (єдине місце; ставки — Михайло
21.11.2026, Європа ×1,5): тип зі ставкою рахує за нею й показує «від $…/м²» на кнопці, без ставки — рядок «за кошторисом», решта позицій
рахується. Назви типів 10 мовами — `hk` у T (ключ = ключ rates.HOUSE; бракує назви — збірка падає). Назва типу йде в рядок результату, #oMsg і
data-service; посилання — ?k=house&t=<ключ типу> (без t або з невідомим t — як раніше).
"""
import json, os, re, sys, html
import i18n  # формат чисел мови: i18n.usd (у JS — casUsd із site-chrome.v1.js)
import rates  # єдине джерело ставок (CLAUDE.md); у JS — блок /*rates*/ у calc.v1.js (CAS_RATES, casCost)

# позиція → ключі ставок rates.RATES (варіанти), індекс типового варіанта
ITEMS = [('design', ['plan', 'dz', 'full'], 1), ('reno', ['reno', 'office'], 0), ('furn', ['furn'], 0),
         ('build', ['box', 'key'], 0), ('arch', ['arch'], 0), ('land', ['land'], 0)]
DEFAULT = ['reno']             # вибрано на старті (як і раніше — ремонт квартири)
EXCL = [['reno', 'build']]     # не поєднуються: одна площа — або ремонт, або будівництво
RATE = {k: rates.RATES[k] for _, ks, _ in ITEMS for k in ks}
PKG = {p: rates.RATES[p] + rates.DMIN for p in rates.DESIGN}  # ставка UA/EU, мінімум UA/EU
FURN = rates.RATES['furn']
MAX = {'m': 100000, 's': 10000}  # межі поля: м² / сотки
RENO = ['reno', 'office']        # ремонт: примітка про чорнові матеріали й ±5%
HT_ITEM = 'build'                # позиція, якій належить ряд «Тип будинку» (її варіанти — rates.HOUSE_KEYS)
HT = list(rates.HOUSE)           # ключі типів будинку в порядку кнопок (ставки типів — rates.HOUSE; None — «за кошторисом»)

# k — повні назви для рядків результату: ремонт квартири, офісу, коробка, під ключ, дизайн-проєкт, архпроєкт, ландшафт; p — пакети дизайну:
# планувальний, дизайн-проєкт, повний з наглядом; it — назви плиток: дизайн, ремонт, будівництво (меблювання — furn, архпроєкт — k[5],
# ландшафт — k[6]); vr / vb — варіанти ремонту (квартира, офіс) і будівництва (коробка, під ключ);
# ht — підпис ряду «Тип будинку», hn — «ще не визначились» (типово: базові ставки), hk — назви типів (ключі rates.HOUSE; терміни — lang/glossary.json)
T = {
    'uk': dict(excl='Ремонт і будівництво рахуємо окремо — лишили «{k}».', h='Калькулятор вартості', reg='Де обʼєкт', ua='Україна', eu='Європа', what='Що порахувати', pick='Оберіть, що порахувати',
               it=['Дизайн інтерʼєру', 'Ремонт', 'Будівництво будинку'], vr=['Квартира', 'Офіс'], vb=['Коробка', 'Під ключ'],
               ht='Тип будинку', hn='Ще не визначились',
               hk=dict(brick='Цегла / газоблок', frame='Каркасний деревʼяний', lstk='Каркасний металевий (ЛСТК)', sip='СІП-панелі', sandwich='Сендвіч-панелі', modular='Модульний', timber='З бруса'),
               k=['Ремонт квартири під ключ', 'Ремонт офісу', 'Будівництво будинку (коробка)', 'Будинок під ключ з оздобленням',
                  'Дизайн-проєкт інтерʼєру', 'Архітектурний проєкт будинку', 'Ландшафтний дизайн'],
               dz='Дизайн', p=['Планувальний', 'Дизайн-проєкт', 'Повний з наглядом'],
               furn='Меблювання й комплектація', area='Площа, м²', area_s='Ділянка, соток (1 сотка = 100 м²)', sot='сотку', sots='сот.',
               est='за кошторисом', res='Орієнтовно від', plus='+ позиції за кошторисом',
               n_base='Це нижня межа за нашими базовими ставками; точну суму називаємо після заміру й кошторису.',
               n_rem='Ремонт — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.',
               n_5='Якщо ремонт робимо ми, підсумок не виходить за ±5% від кошторису.',
               n_arch='Архпроєкт — ескізний і робочий (АР, КР); інженерні розділи й генплан — за завданням.',
               n_min='Мінімум за дизайн — {m}.',
               n_eu='Європа: ставки приблизно на 50% вищі за київські.',
               send='Отримати точний кошторис', msg='Розрахунок з калькулятора', svc='Калькулятор', frm='від', m2='м²',
               bad='Вкажіть площу числом, наприклад 75 або 12,5.', mx='Порахували для максимуму: {m}.', mn='мінімум'),
    'ru': dict(excl='Ремонт и строительство считаем отдельно — оставили «{k}».', h='Калькулятор стоимости', reg='Где объект', ua='Украина', eu='Европа', what='Что посчитать', pick='Выберите, что посчитать',
               it=['Дизайн интерьера', 'Ремонт', 'Строительство дома'], vr=['Квартира', 'Офис'], vb=['Коробка', 'Под ключ'],
               ht='Тип дома', hn='Ещё не определились',
               hk=dict(brick='Кирпич / газоблок', frame='Каркасный деревянный', lstk='Каркасный металлический (ЛСТК)', sip='СИП-панели', sandwich='Сэндвич-панели', modular='Модульный', timber='Из бруса'),
               k=['Ремонт квартиры под ключ', 'Ремонт офиса', 'Строительство дома (коробка)', 'Дом под ключ с отделкой',
                  'Дизайн-проект интерьера', 'Архитектурный проект дома', 'Ландшафтный дизайн'],
               dz='Дизайн', p=['Планировочный', 'Дизайн-проект', 'Полный с надзором'],
               furn='Меблировка и комплектация', area='Площадь, м²', area_s='Участок, соток (1 сотка = 100 м²)', sot='сотку', sots='сот.',
               est='по смете', res='Ориентировочно от', plus='+ позиции по смете',
               n_base='Это нижняя граница по нашим базовым ставкам; точную сумму называем после замера и сметы.',
               n_rem='Ремонт — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете.',
               n_5='Если ремонт делаем мы, итог не выходит за ±5% от сметы.',
               n_arch='Архпроект — эскизный и рабочий (АР, КР); инженерные разделы и генплан — по заданию.',
               n_min='Минимум за дизайн — {m}.',
               n_eu='Европа: ставки примерно на 50% выше киевских.',
               send='Получить точную смету', msg='Расчёт из калькулятора', svc='Калькулятор', frm='от', m2='м²',
               bad='Укажите площадь числом, например 75 или 12,5.', mx='Посчитали для максимума: {m}.', mn='минимум'),
    'en': dict(excl='Renovation and construction are estimated separately — kept “{k}”.', h='Cost calculator', reg='Project location', ua='Ukraine', eu='Europe', what='What to include', pick='Choose what to include',
               it=['Interior design', 'Renovation', 'House construction'], vr=['Apartment', 'Office'], vb=['Shell', 'Turnkey'],
               ht='House type', hn='Not decided yet',
               hk=dict(brick='Brick / aerated concrete', frame='Timber frame', lstk='Light steel frame', sip='SIP panels', sandwich='Sandwich panels', modular='Modular', timber='Solid timber'),
               k=['Turnkey apartment renovation', 'Office renovation', 'House construction (shell)', 'Turnkey house with finishing',
                  'Interior design project', 'House architectural design', 'Landscape design'],
               dz='Design', p=['Space planning', 'Design project', 'Full, with supervision'],
               furn='Furnishing and procurement', area='Area, m²', area_s='Plot, ares (1 are = 100 m²)', sot='are', sots='ares',
               est='per estimate', res='Approximately from', plus='+ items per estimate',
               n_base='This is the lower limit at our base rates; we give the exact amount after measuring and preparing the estimate.',
               n_rem='Renovation covers works and rough materials; finishing materials, furniture and appliances are priced separately in the estimate.',
               n_5='If we do the renovation, the total stays within ±5% of the estimate.',
               n_arch='Architectural design: concept and working drawings (architecture, structure); engineering sections and site plan as specified.',
               n_min='Design minimum: {m}.',
               n_eu='Europe: rates are about 50% higher than in Kyiv.',
               send='Get an exact estimate', msg='Calculator result', svc='Calculator', frm='from', m2='m²',
               bad='Enter the area as a number, e.g. 75 or 12.5.', mx='Calculated for the maximum: {m}.', mn='minimum'),
    'es': dict(excl='La reforma y la construcción se calculan por separado: dejamos «{k}».', h='Calculadora de costes', reg='Ubicación', ua='Ucrania', eu='Europa', what='Qué calcular', pick='Elija qué calcular',
               it=['Diseño de interiores', 'Reforma', 'Construcción de casa'], vr=['Piso', 'Oficina'], vb=['Obra gris', 'Llave en mano'],
               ht='Tipo de casa', hn='Aún sin decidir',
               hk=dict(brick='Ladrillo / hormigón celular', frame='Entramado de madera', lstk='Entramado de acero ligero', sip='Paneles SIP', sandwich='Paneles sándwich', modular='Modular', timber='Madera maciza'),
               k=['Reforma de piso llave en mano', 'Reforma de oficina', 'Construcción de casa (estructura)', 'Casa llave en mano con acabados',
                  'Proyecto de diseño de interiores', 'Proyecto arquitectónico de casa', 'Paisajismo'],
               dz='Diseño', p=['Distribución', 'Proyecto de diseño', 'Completo con supervisión'],
               furn='Amueblamiento y equipamiento', area='Superficie, m²', area_s='Parcela, áreas (1 área = 100 m²)', sot='área', sots='áreas',
               est='según presupuesto', res='Aproximadamente desde', plus='+ partidas según presupuesto',
               n_base='Es el límite inferior según nuestras tarifas base; el importe exacto lo damos tras la medición y el presupuesto.',
               n_rem='La reforma incluye la mano de obra y los materiales básicos; acabados, muebles y electrodomésticos van aparte, según presupuesto.',
               n_5='Si la obra la hacemos nosotros, el total no sale del ±5% del presupuesto.',
               n_arch='Proyecto arquitectónico: básico y de ejecución (arquitectura, estructura); instalaciones y plano de parcela según encargo.',
               n_min='Mínimo por el diseño: {m}.',
               n_eu='Europa: tarifas aproximadamente un 50% más altas que en Kiev.',
               send='Pedir presupuesto exacto', msg='Cálculo de la calculadora', svc='Calculadora', frm='desde', m2='m²',
               bad='Indique la superficie con un número, p. ej. 75 o 12,5.', mx='Calculado para el máximo: {m}.', mn='mínimo'),
    'zh': dict(excl='装修和建房需分开估算，已保留“{k}”。', h='费用计算器', reg='项目所在地', ua='乌克兰', eu='欧洲', what='计算内容', pick='请选择要计算的项目',
               it=['室内设计', '装修', '住宅建造'], vr=['公寓', '办公室'], vb=['主体结构', '交钥匙'],
               ht='房屋类型', hn='尚未确定',
               hk=dict(brick='砖 / 加气块', frame='木框架', lstk='轻钢框架', sip='SIP 板', sandwich='夹芯板', modular='模块化', timber='原木'),
               k=['公寓交钥匙装修', '办公室装修', '住宅建造（主体结构）', '含精装的交钥匙住宅', '室内设计方案', '住宅建筑设计', '景观设计'],
               dz='设计', p=['平面布局', '设计方案', '全案含设计监督'],
               furn='家具与配套', area='面积（m²）', area_s='地块（公亩，1 公亩 = 100 m²）', sot='公亩', sots='公亩',
               est='按预算', res='预估起价', plus='+ 按预算计价的项目',
               n_base='这是按我们基础单价计算的下限；准确金额在测量并出具预算后确定。',
               n_rem='装修包含施工和基础辅材；饰面主材、家具和家电另行计价，以预算为准。',
               n_5='若由我们施工，最终费用与预算偏差不超过 ±5%。',
               n_arch='建筑设计：方案与施工图（建筑、结构）；机电专业和总平面按任务书。',
               n_min='设计最低收费：{m}。',
               n_eu='欧洲：单价约比基辅高 50%。',
               send='获取准确预算', msg='计算器估算结果', svc='计算器', frm='起价', m2='m²',
               bad='请输入数字面积，例如 75 或 12.5。', mx='已按上限计算：{m}。', mn='最低'),
    'pl': dict(excl='Remont i budowę liczymy osobno — zostawiliśmy „{k}”.', h='Kalkulator kosztów', reg='Lokalizacja', ua='Ukraina', eu='Europa', what='Co policzyć', pick='Wybierz, co policzyć',
               it=['Projektowanie wnętrz', 'Remont', 'Budowa domu'], vr=['Mieszkanie', 'Biuro'], vb=['Stan surowy', 'Pod klucz'],
               ht='Typ domu', hn='Jeszcze nie wybrano',
               hk=dict(brick='Cegła / beton komórkowy', frame='Szkielet drewniany', lstk='Szkielet stalowy', sip='Płyty SIP', sandwich='Płyty warstwowe', modular='Modułowy', timber='Z bali'),
               k=['Remont mieszkania pod klucz', 'Remont biura', 'Budowa domu (stan surowy)', 'Dom pod klucz z wykończeniem',
                  'Projekt wnętrza', 'Projekt architektoniczny domu', 'Projekt ogrodu'],
               dz='Projekt', p=['Układ funkcjonalny', 'Projekt wnętrza', 'Pełny z nadzorem'],
               furn='Umeblowanie i kompletacja', area='Powierzchnia, m²', area_s='Działka, ary (1 ar = 100 m²)', sot='ar', sots='arów',
               est='według kosztorysu', res='Orientacyjnie od', plus='+ pozycje według kosztorysu',
               n_base='To dolna granica według naszych stawek bazowych; dokładną kwotę podajemy po pomiarze i kosztorysie.',
               n_rem='Remont obejmuje prace i materiały podstawowe; materiały wykończeniowe, meble i AGD — osobno, według kosztorysu.',
               n_5='Jeśli remont robimy my, wynik nie wychodzi poza ±5% kosztorysu.',
               n_arch='Projekt architektoniczny: koncepcja i projekt wykonawczy (architektura, konstrukcja); branże instalacyjne i plan działki — według zadania.',
               n_min='Minimum za projekt: {m}.',
               n_eu='Europa: stawki ok. 50% wyższe niż w Kijowie.',
               send='Poproś o dokładny kosztorys', msg='Wynik z kalkulatora', svc='Kalkulator', frm='od', m2='m²',
               bad='Podaj powierzchnię liczbą, np. 75 lub 12,5.', mx='Policzono dla maksimum: {m}.', mn='minimum'),
    'de': dict(excl='Renovierung und Hausbau berechnen wir getrennt – ausgewählt bleibt „{k}“.', h='Kostenrechner', reg='Standort', ua='Ukraine', eu='Europa', what='Leistungen wählen', pick='Wählen Sie, was berechnet werden soll',
               it=['Innenarchitektur', 'Renovierung', 'Hausbau'], vr=['Wohnung', 'Büro'], vb=['Rohbau', 'Schlüsselfertig'],
               ht='Haustyp', hn='Noch offen',
               hk=dict(brick='Ziegel / Porenbeton', frame='Holzrahmenhaus', lstk='Stahlleichtbau', sip='SIP-Paneele', sandwich='Sandwichpaneele', modular='Modulhaus', timber='Holzbalkenhaus'),
               k=['Wohnungsrenovierung schlüsselfertig', 'Büroumbau', 'Hausbau (Rohbau)', 'Haus schlüsselfertig mit Ausbau',
                  'Innenarchitektur-Projekt', 'Architekturplanung Haus', 'Gartengestaltung'],
               dz='Design', p=['Grundrissplanung', 'Designprojekt', 'Komplett mit Bauüberwachung'],
               furn='Einrichtung und Ausstattung', area='Fläche, m²', area_s='Grundstück, Ar (1 Ar = 100 m²)', sot='Ar', sots='Ar',
               est='nach Kostenvoranschlag', res='Ungefähr ab', plus='+ Posten nach Kostenvoranschlag',
               n_base='Das ist die Untergrenze nach unseren Basissätzen; die genaue Summe nennen wir nach Aufmaß und Kostenvoranschlag.',
               n_rem='Die Renovierung umfasst Arbeiten und Grundmaterialien; Endoberflächen, Möbel und Geräte werden separat im Kostenvoranschlag berechnet.',
               n_5='Renovieren wir selbst, bleibt die Endsumme innerhalb von ±5 % des Kostenvoranschlags.',
               n_arch='Architekturplanung: Entwurfs- und Ausführungsplanung (Architektur, Tragwerk); Haustechnik und Lageplan nach Aufgabenstellung.',
               n_min='Mindestbetrag für das Design: {m}.',
               n_eu='Europa: Sätze rund 50 % über Kyjiw.',
               send='Genauen Kostenvoranschlag anfordern', msg='Ergebnis aus dem Rechner', svc='Rechner', frm='ab', m2='m²',
               bad='Geben Sie die Fläche als Zahl an, z. B. 75 oder 12,5.', mx='Berechnet für das Maximum: {m}.', mn='Minimum'),
    'fr': dict(excl='Rénovation et construction se calculent séparément : nous avons gardé « {k} ».', h='Calculateur de coût', reg='Localisation', ua='Ukraine', eu='Europe', what='Prestations à chiffrer', pick='Choisissez les prestations à chiffrer',
               it=['Design intérieur', 'Rénovation', 'Construction de maison'], vr=['Appartement', 'Bureau'], vb=['Gros œuvre', 'Clé en main'],
               ht='Type de maison', hn='Pas encore décidé',
               hk=dict(brick='Brique / béton cellulaire', frame='Ossature bois', lstk='Ossature métallique légère', sip='Panneaux SIP', sandwich='Panneaux sandwich', modular='Modulaire', timber='Bois massif'),
               k=['Rénovation d’appartement clé en main', 'Rénovation de bureau', 'Construction de maison (gros œuvre)', 'Maison clé en main avec finitions',
                  'Projet de design intérieur', 'Projet architectural de maison', 'Aménagement paysager'],
               dz='Design', p=['Plan d’aménagement', 'Projet de design', 'Complet avec suivi'],
               furn='Ameublement et équipement', area='Surface, m²', area_s='Terrain, ares (1 are = 100 m²)', sot='are', sots='ares',
               est='sur devis', res='À partir d’environ', plus='+ postes sur devis',
               n_base='C’est la borne basse selon nos tarifs de base ; le montant exact est donné après relevé et devis.',
               n_rem='La rénovation comprend les travaux et les matériaux de base ; finitions, mobilier et électroménager sont chiffrés à part dans le devis.',
               n_5='Si nous réalisons les travaux, le total ne sort pas de ±5 % du devis.',
               n_arch='Projet architectural : esquisse et plans d’exécution (architecture, structure) ; lots techniques et plan de masse selon la mission.',
               n_min='Minimum pour le design : {m}.',
               n_eu='Europe : tarifs environ 50 % plus élevés qu’à Kyiv.',
               send='Obtenir un devis précis', msg='Calcul du calculateur', svc='Calculateur', frm='dès', m2='m²',
               bad='Indiquez la surface en chiffres, par ex. 75 ou 12,5.', mx='Calculé pour le maximum : {m}.', mn='minimum'),
    'pt': dict(excl='A remodelação e a construção são calculadas em separado — mantivemos «{k}».', h='Calculadora de custos', reg='Localização', ua='Ucrânia', eu='Europa', what='O que calcular', pick='Escolha o que calcular',
               it=['Design de interiores', 'Remodelação', 'Construção de moradia'], vr=['Apartamento', 'Escritório'], vb=['Estrutura', 'Chave na mão'],
               ht='Tipo de moradia', hn='Ainda por decidir',
               hk=dict(brick='Tijolo / betão celular', frame='Estrutura de madeira', lstk='Estrutura metálica leve', sip='Painéis SIP', sandwich='Painéis sandwich', modular='Modular', timber='Troncos de madeira'),
               k=['Remodelação de apartamento chave na mão', 'Remodelação de escritório', 'Construção de moradia (estrutura)', 'Moradia chave na mão com acabamentos',
                  'Projeto de design de interiores', 'Projeto de arquitetura de moradia', 'Arquitetura paisagista'],
               dz='Design', p=['Planta', 'Projeto de design', 'Completo com acompanhamento'],
               furn='Mobiliário e equipamento', area='Área, m²', area_s='Terreno, ares (1 are = 100 m²)', sot='are', sots='ares',
               est='segundo orçamento', res='Aproximadamente a partir de', plus='+ rubricas segundo orçamento',
               n_base='É o limite inferior segundo as nossas tarifas base; o valor exato é dado após a medição e o orçamento.',
               n_rem='A remodelação inclui os trabalhos e os materiais de obra bruta; materiais de acabamento, móveis e eletrodomésticos são orçamentados à parte.',
               n_5='Se a obra for feita por nós, o total fica dentro dos ±5% do orçamento.',
               n_arch='Projeto de arquitetura: estudo prévio e projeto de execução (arquitetura, estruturas); especialidades e planta de implantação segundo o caderno de encargos.',
               n_min='Mínimo do design: {m}.',
               n_eu='Europa: tarifas cerca de 50% mais altas do que em Kyiv.',
               send='Pedir um orçamento exato', msg='Resultado da calculadora', svc='Calculadora', frm='a partir de', m2='m²',
               bad='Indique a área em números, p. ex. 75 ou 12,5.', mx='Calculado para o máximo: {m}.', mn='mínimo'),
    'ar': dict(excl='نحسب التجديد والبناء كلًّا على حدة — أبقينا «{k}».', h='حاسبة التكلفة', reg='موقع المشروع', ua='أوكرانيا', eu='أوروبا', what='ما المطلوب حسابه', pick='اختر ما تريد حسابه',
               it=['التصميم الداخلي', 'التجديد', 'بناء منزل'], vr=['شقة', 'مكتب'], vb=['الهيكل', 'تسليم المفتاح'],
               ht='نوع المنزل', hn='لم يُحدَّد بعد',
               hk=dict(brick='طوب / خرسانة خلوية', frame='هيكل خشبي', lstk='هيكل فولاذي خفيف', sip='ألواح SIP', sandwich='ألواح ساندويتش', modular='معياري', timber='خشب مصمت'),
               k=['تجديد شقة بنظام تسليم المفتاح', 'تجديد مكتب', 'بناء منزل (هيكل)', 'منزل متكامل مع التشطيب',
                  'مشروع التصميم الداخلي', 'التصميم المعماري للمنزل', 'تنسيق الحدائق'],
               dz='التصميم', p=['تخطيط المساحات', 'مشروع التصميم', 'كامل مع الإشراف'],
               furn='التأثيث والتجهيز', area='المساحة، م²', area_s='الأرض، آر (1 آر = 100 م²)', sot='آر', sots='آر',
               est='وفق المقايسة', res='تقريبًا من', plus='+ بنود وفق المقايسة',
               n_base='هذا هو الحد الأدنى وفق أسعارنا الأساسية؛ نحدد المبلغ الدقيق بعد القياس وتقدير التكلفة.',
               n_rem='يشمل التجديد الأعمال والمواد الأساسية؛ أما مواد التشطيب والأثاث والأجهزة فتُحسب بشكل منفصل وفق التقدير.',
               n_5='إذا نفّذنا الأعمال لا يخرج الإجمالي عن ±5% من التقدير.',
               n_arch='التصميم المعماري: المخطط الأولي ومخططات التنفيذ (معماري وإنشائي)؛ الأقسام الهندسية والمخطط العام حسب المهمة.',
               n_min='الحد الأدنى للتصميم: {m}.',
               n_eu='أوروبا: الأسعار أعلى بنحو 50% من كييف.',
               send='احصل على تقدير دقيق', msg='حساب من الحاسبة', svc='الحاسبة', frm='من', m2='م²',
               bad='أدخل المساحة رقمًا، مثل 75 أو 12.5.', mx='حُسبت للحد الأقصى: {m}.', mn='الحد الأدنى'),
}

# стилі — блок «Калькулятор вартості #calc» у /assets/site-chrome.v1.css (інлайн коштував ~2 КБ бюджету HTML кожної сторінки)

JS_SRC = '/assets/calc.v1.js'  # логіка — окремий файл (бюджет HTML лендингів); ?v= ставить chrome.versions (SHARED)


def names(t):
    """Назви плиток, варіантів і рядків результату мови."""
    tile = dict(design=t['it'][0], reno=t['it'][1], furn=t['furn'], build=t['it'][2], arch=t['k'][5], land=t['k'][6])
    var = dict(plan=t['p'][0], dz=t['p'][1], full=t['p'][2], reno=t['vr'][0], office=t['vr'][1], box=t['vb'][0], key=t['vb'][1])
    row = dict(plan=f'{t["dz"]}: {t["p"][0]}', dz=t['k'][4], full=f'{t["dz"]}: {t["p"][2]}', reno=t['k'][0], office=t['k'][1],
               box=t['k'][2], key=t['k'][3], furn=t['furn'], arch=t['k'][5], land=t['k'][6])
    return tile, var, row


def house(t):
    """Ряд «Тип будинку» в уточненнях #cV (видно, коли вибрано будівництво): один вибір, типово — «ще не визначились» (базові ставки).
    У розмітці — лише підпис і порожній #cHt: кнопки (data-t, назва, підпис «від $…/м²» або «за кошторисом» — data-nofx) будує calc.v1.js
    з конфігу (ht, hn) — блок на старті прихований, а назви двічі (розмітка + конфіг) не вміщались у бюджет HTML 64 КБ сторінок вартості.
    data-h (не data-k) — щоб `#cV [data-k="build"]` лишався одним блоком «Коробка / Під ключ»."""
    if not HT:
        return ''
    return (f'<div role="group" aria-labelledby="cHtL" data-h="{HT_ITEM}"{"" if HT_ITEM in DEFAULT else " hidden"}><span class="cl" id="cHtL">{t["ht"]}</span>'
            f'<div class="seg g2 g3" id="cHt"></div></div>')


def block(lang):
    t = T[lang]
    usd = lambda n: i18n.usd(n, lang)
    tile, var, row = names(t)
    miss = [k for k in HT if not t.get('hk', {}).get(k)]
    if miss:
        sys.exit(f'calc.py: мова {lang} — немає назви типу будинку {miss} (hk у T; ключі — rates.HOUSE)')
    cfg = dict(it=[[i, ks, d] for i, ks, d in ITEMS], df=DEFAULT, x=EXCL, rl=row, rn=RENO, mx=MAX,
               hi=HT_ITEM, hn=t['hn'], ht=[[k, t['hk'][k]] for k in HT],  # типи будинку: [ключ, назва], hn — «ще не визначились»; ставки — CAS_HT у rates-блоці
               est=t['est'], frm=t['frm'], m2=t['m2'], sot=t['sot'], ss=t['sots'],
               nb=t['n_base'], nr=t['n_rem'], n5=t['n_5'], na=t['n_arch'], nm=t['n_min'], ne=t['n_eu'], ua=t['ua'], eu=t['eu'],
               msg=t['msg'], sv=t['svc'], pl=t['plus'], bad=t['bad'], mxn=t['mx'], mn=t['mn'])
    js = json.dumps(cfg, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    on = lambda x: str(bool(x)).lower()
    # без JS — підписи з українськими ставками й типовий вибір (JS одразу перемальовує під регіон і параметр ?k=);
    # data-nofx — fx.py не дописує сюди «(≈ ₴/€)»: JS показує на плитках лише $, друга валюта — біля суми (casFx)
    tiles = ''.join(f'<button type="button" data-k="{i}" aria-pressed="{on(i in DEFAULT)}"><span>{tile[i]}</span>'
                    f'<small data-nofx>{t["frm"]} {usd(RATE[ks[d]][0])}/{t["sot"] if i == "land" else t["m2"]}</small></button>' for i, ks, d in ITEMS)
    opts = ''.join(f'<div role="group" aria-labelledby="cVL-{i}" data-k="{i}"{"" if i in DEFAULT else " hidden"}><span class="cl" id="cVL-{i}">{tile[i]}</span>'
                   f'<div class="seg g2{" g3" if len(ks) == 3 else ""}">' + ''.join(f'<button type="button" data-p="{k}" aria-pressed="{on(n == d)}">{var[k]}<small>{usd(RATE[k][0])}/{t["m2"]}</small></button>'
                                                    for n, k in enumerate(ks)) + '</div></div>' + (house(t) if i == HT_ITEM else '')
                   for i, ks, d in ITEMS if len(ks) > 1)
    # пояснення, коли вибір однієї з несумісних позицій (EXCL) знімає іншу: обидва варіанти вже в розмітці (приховані, в одній клітинці сітки) —
    # місце зарезервоване, блок не змінює висоту; текст для читача екрана — у #cEx (aria-live), його ставить calc.v1.js
    excl = '<p class="cx">' + ''.join(f'<span data-x="{i}" aria-hidden="true">{html.escape(t["excl"].replace("{k}", tile[i]))}</span>' for g in EXCL for i in g) \
        + '<span class="cxl" id="cEx" aria-live="polite"></span></p>'
    return f'''<section id="calc"><div class="w">
  <h2>{t["h"]}</h2>
  <div class="cg">
    <div role="group" aria-labelledby="cRegL"><span class="cl" id="cRegL">{t["reg"]}</span><div class="seg" id="cReg"><button type="button" data-r="0" aria-pressed="true">{t["ua"]}</button><button type="button" data-r="1" aria-pressed="false">{t["eu"]}</button></div></div>
    <div role="group" aria-labelledby="cItL"><span class="cl" id="cItL">{t["what"]}</span><div class="ct" id="cIt">{tiles}</div>{excl}</div>
    <div class="cv" id="cV">{opts}</div>
    <div class="ar" id="cAreaW"><label for="cArea">{t["area"]}</label><input id="cArea" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-describedby="cAreaE" value="60"><i aria-hidden="true">{t["m2"]}</i></div>
    <p class="ce" id="cAreaE" aria-live="polite" hidden></p>
    <div class="ar" id="cLandW" hidden><label for="cLand">{t["area_s"]}</label><input id="cLand" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-describedby="cLandE" value="10"><i aria-hidden="true">{t["sots"]}</i></div>
    <p class="ce" id="cLandE" aria-live="polite" hidden></p>
    <div class="sum"><div id="cSumP" aria-live="polite" aria-atomic="true"><span id="cSumL">{t["res"]}</span> <b id="cSum">—</b><span id="cPick" hidden>{t["pick"]}</span></div><p id="cPlus" hidden>{t["plus"]}</p><ul id="cRows"></ul><p id="cNote">{t["n_base"]}</p></div>
    <p><a class="btn main" id="cSend" href="#zayavka">{t["send"]}</a></p>
  </div>
<script type="application/json" id="cCfg">{js}</script><script src="{JS_SRC}" defer></script>
</div></section>'''


SG = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'styleguide', 'index.html')
SG_RX = re.compile(r'<!--calc-sg-->.*?<!--/calc-sg-->', re.S)


def styleguide(check=False):
    """Живий приклад у /styleguide/#calc-sg — той самий блок, що на сторінці калькулятора (uk), між <!--calc-sg--> … <!--/calc-sg-->."""
    s = open(SG, encoding='utf-8').read()
    m = SG_RX.search(s)
    if not m:
        return True
    cur, new = m.group(0), '<!--calc-sg-->' + block('uk') + '<!--/calc-sg-->'
    v = re.search(re.escape(JS_SRC) + r'\?v=[\w.-]+', cur)  # ?v= у src ставить chrome.versions — зберігаємо
    if v:
        new = new.replace(JS_SRC, v.group(0))
    norm = lambda x: x.replace('\u00a0', ' ')  # chrome.price_fmt ставить нерозривний пробіл у «від $…» — це не розбіжність
    if norm(new) == norm(cur):
        return True
    if not check:
        open(SG, 'w', encoding='utf-8').write(s.replace(cur, new))
        print('calc.py: /styleguide/#calc-sg оновлено')
    return False


if __name__ == '__main__':
    if not styleguide('--check' in sys.argv) and '--check' in sys.argv:
        sys.exit('calc.py: /styleguide/#calc-sg застарів — python3 tools/site/calc.py')
