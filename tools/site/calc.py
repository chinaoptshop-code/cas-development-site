"""HTML-блок калькулятора вартості (вставляється як "calc": true у сторінки калькулятора, 9 мов).

Ставки — лише підтверджені (CLAUDE.md), [Україна, Європа]; None — для Європи ставки немає → «за кошторисом»:
  ремонт квартири $550 / $850, офіс $350 / —, коробка $600 / $900, під ключ $1 100 / $1 700, архпроєкт $12 / $18 (за м²),
  ландшафтний дизайн $50 / — (за сотку = 100 м², поле — у сотках);
  дизайн-пакети: планувальний $6 / —, дизайн-проєкт $30 / $45, повний з авторським наглядом $45 / — (за м²),
  мінімум дизайну $2 500 (Україна, усі пакети) / $4 000 (Європа, дизайн-проєкт); меблювання $250 / $400.
±5% — лише в примітці до ремонту (квартира, офіс), бо діє, лише якщо ремонт робить CAS.
Кнопка «Отримати кошторис» переносить у форму #of: площу (#oArea, м²), регіон, послугу й розрахунок (#oMsg) і data-service.
"""
import json
import i18n  # формат чисел мови: i18n.usd (у JS — casUsd із site-chrome.v1.js)

KINDS = ['remont', 'office', 'house', 'housekey', 'design', 'arch', 'land']
RATE = {'remont': [550, 850], 'office': [350, None], 'house': [600, 900], 'housekey': [1100, 1700],
        'arch': [12, 18], 'land': [50, None]}
PKG = {'plan': [6, None, 2500, None], 'dz': [30, 45, 2500, 4000], 'full': [45, None, 2500, None]}  # ставка UA/EU, мінімум UA/EU
FURN = [250, 400]
WITH_DZ = ['remont', 'office', 'house', 'housekey', 'design']  # де показуємо вибір дизайну
WITH_FU = ['remont', 'office', 'housekey', 'design']           # де показуємо меблювання
RENO = ['remont', 'office']                                    # ремонт: примітка про чорнові матеріали й ±5%

# k — назви послуг у порядку KINDS; p — пакети дизайну: без, планувальний, дизайн-проєкт, повний з наглядом
T = {
    'uk': dict(h='Калькулятор вартості', reg='Де обʼєкт', ua='Україна', eu='Європа', kind='Що потрібно',
               k=['Ремонт квартири під ключ', 'Ремонт офісу', 'Будівництво будинку (коробка)', 'Будинок під ключ з оздобленням',
                  'Дизайн-проєкт інтерʼєру', 'Архітектурний проєкт будинку', 'Ландшафтний дизайн'],
               dz='Дизайн', p=['Без дизайну', 'Планувальний', 'Дизайн-проєкт', 'Повний з наглядом'],
               furn='Меблювання й комплектація', area='Площа, м²', area_s='Ділянка, соток (1 сотка = 100 м²)', sot='сотку', sots='сот.',
               est='за кошторисом', res='Орієнтовно від', plus='+ позиції за кошторисом',
               n_base='Це нижня межа за нашими базовими ставками; точну суму називаємо після заміру й кошторису.',
               n_rem='Ремонт — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.',
               n_5='Якщо ремонт робимо ми, підсумок не виходить за ±5% від кошторису.',
               n_arch='Архпроєкт — ескізний і робочий (АР, КР); інженерні розділи й генплан — за завданням.',
               n_min='Мінімум за дизайн — {m}.',
               n_eu='Європа: ставки приблизно на 50% вищі за київські.',
               send='Отримати точний кошторис', msg='Розрахунок з калькулятора', svc='Калькулятор', frm='від', m2='м²'),
    'ru': dict(h='Калькулятор стоимости', reg='Где объект', ua='Украина', eu='Европа', kind='Что нужно',
               k=['Ремонт квартиры под ключ', 'Ремонт офиса', 'Строительство дома (коробка)', 'Дом под ключ с отделкой',
                  'Дизайн-проект интерьера', 'Архитектурный проект дома', 'Ландшафтный дизайн'],
               dz='Дизайн', p=['Без дизайна', 'Планировочный', 'Дизайн-проект', 'Полный с надзором'],
               furn='Меблировка и комплектация', area='Площадь, м²', area_s='Участок, соток (1 сотка = 100 м²)', sot='сотку', sots='сот.',
               est='по смете', res='Ориентировочно от', plus='+ позиции по смете',
               n_base='Это нижняя граница по нашим базовым ставкам; точную сумму называем после замера и сметы.',
               n_rem='Ремонт — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете.',
               n_5='Если ремонт делаем мы, итог не выходит за ±5% от сметы.',
               n_arch='Архпроект — эскизный и рабочий (АР, КР); инженерные разделы и генплан — по заданию.',
               n_min='Минимум за дизайн — {m}.',
               n_eu='Европа: ставки примерно на 50% выше киевских.',
               send='Получить точную смету', msg='Расчёт из калькулятора', svc='Калькулятор', frm='от', m2='м²'),
    'en': dict(h='Cost calculator', reg='Project location', ua='Ukraine', eu='Europe', kind='What you need',
               k=['Turnkey apartment renovation', 'Office renovation', 'House construction (shell)', 'Turnkey house with finishing',
                  'Interior design project', 'House architectural design', 'Landscape design'],
               dz='Design', p=['No design', 'Space planning', 'Design project', 'Full, with supervision'],
               furn='Furnishing and procurement', area='Area, m²', area_s='Plot, ares (1 are = 100 m²)', sot='are', sots='ares',
               est='per estimate', res='Approximately from', plus='+ items per estimate',
               n_base='This is the lower limit at our base rates; we give the exact amount after measuring and preparing the estimate.',
               n_rem='Renovation covers works and rough materials; finishing materials, furniture and appliances are priced separately in the estimate.',
               n_5='If we do the renovation, the total stays within ±5% of the estimate.',
               n_arch='Architectural design: concept and working drawings (architecture, structure); engineering sections and site plan as specified.',
               n_min='Design minimum: {m}.',
               n_eu='Europe: rates are about 50% higher than in Kyiv.',
               send='Get an exact estimate', msg='Calculator result', svc='Calculator', frm='from', m2='m²'),
    'es': dict(h='Calculadora de costes', reg='Ubicación', ua='Ucrania', eu='Europa', kind='Qué necesita',
               k=['Reforma de piso llave en mano', 'Reforma de oficina', 'Construcción de casa (estructura)', 'Casa llave en mano con acabados',
                  'Proyecto de diseño de interiores', 'Proyecto arquitectónico de casa', 'Paisajismo'],
               dz='Diseño', p=['Sin diseño', 'Distribución', 'Proyecto de diseño', 'Completo con supervisión'],
               furn='Amueblamiento y equipamiento', area='Superficie, m²', area_s='Parcela, áreas (1 área = 100 m²)', sot='área', sots='áreas',
               est='según presupuesto', res='Aproximadamente desde', plus='+ partidas según presupuesto',
               n_base='Es el límite inferior según nuestras tarifas base; el importe exacto lo damos tras la medición y el presupuesto.',
               n_rem='La reforma incluye la mano de obra y los materiales básicos; acabados, muebles y electrodomésticos van aparte, según presupuesto.',
               n_5='Si la obra la hacemos nosotros, el total no sale del ±5% del presupuesto.',
               n_arch='Proyecto arquitectónico: básico y de ejecución (arquitectura, estructura); instalaciones y plano de parcela según encargo.',
               n_min='Mínimo por el diseño: {m}.',
               n_eu='Europa: tarifas aproximadamente un 50% más altas que en Kiev.',
               send='Pedir presupuesto exacto', msg='Cálculo de la calculadora', svc='Calculadora', frm='desde', m2='m²'),
    'zh': dict(h='费用计算器', reg='项目所在地', ua='乌克兰', eu='欧洲', kind='您的需求',
               k=['公寓交钥匙装修', '办公室装修', '住宅建造（主体结构）', '含精装的交钥匙住宅', '室内设计方案', '住宅建筑设计', '景观设计'],
               dz='设计', p=['不含设计', '平面布局', '设计方案', '全案含设计监理'],
               furn='家具与配套', area='面积（m²）', area_s='地块（公亩，1 公亩 = 100 m²）', sot='公亩', sots='公亩',
               est='按预算', res='预估起价', plus='+ 按预算计价的项目',
               n_base='这是按我们基础单价计算的下限；准确金额在测量并出具预算后确定。',
               n_rem='装修包含施工和基础辅材；饰面主材、家具和家电另行计价，以预算为准。',
               n_5='若由我们施工，最终费用与预算偏差不超过 ±5%。',
               n_arch='建筑设计：方案与施工图（建筑、结构）；机电专业和总平面按任务书。',
               n_min='设计最低收费：{m}。',
               n_eu='欧洲：单价约比基辅高 50%。',
               send='获取准确预算', msg='计算器估算结果', svc='计算器', frm='起价', m2='m²'),
    'pl': dict(h='Kalkulator kosztów', reg='Lokalizacja', ua='Ukraina', eu='Europa', kind='Czego potrzebujesz',
               k=['Remont mieszkania pod klucz', 'Remont biura', 'Budowa domu (stan surowy)', 'Dom pod klucz z wykończeniem',
                  'Projekt wnętrza', 'Projekt architektoniczny domu', 'Projekt ogrodu'],
               dz='Projekt', p=['Bez projektu', 'Układ funkcjonalny', 'Projekt wnętrza', 'Pełny z nadzorem'],
               furn='Umeblowanie i kompletacja', area='Powierzchnia, m²', area_s='Działka, ary (1 ar = 100 m²)', sot='ar', sots='arów',
               est='według kosztorysu', res='Orientacyjnie od', plus='+ pozycje według kosztorysu',
               n_base='To dolna granica według naszych stawek bazowych; dokładną kwotę podajemy po pomiarze i kosztorysie.',
               n_rem='Remont obejmuje prace i materiały podstawowe; materiały wykończeniowe, meble i AGD — osobno, według kosztorysu.',
               n_5='Jeśli remont robimy my, wynik nie wychodzi poza ±5% kosztorysu.',
               n_arch='Projekt architektoniczny: koncepcja i projekt wykonawczy (architektura, konstrukcja); branże instalacyjne i plan działki — według zadania.',
               n_min='Minimum za projekt: {m}.',
               n_eu='Europa: stawki ok. 50% wyższe niż w Kijowie.',
               send='Poproś o dokładny kosztorys', msg='Wynik z kalkulatora', svc='Kalkulator', frm='od', m2='m²'),
    'de': dict(h='Kostenrechner', reg='Standort', ua='Ukraine', eu='Europa', kind='Was Sie brauchen',
               k=['Wohnungsrenovierung schlüsselfertig', 'Büroumbau', 'Hausbau (Rohbau)', 'Haus schlüsselfertig mit Ausbau',
                  'Innenarchitektur-Projekt', 'Architekturplanung Haus', 'Gartengestaltung'],
               dz='Design', p=['Ohne Design', 'Grundrissplanung', 'Designprojekt', 'Komplett mit Bauaufsicht'],
               furn='Einrichtung und Ausstattung', area='Fläche, m²', area_s='Grundstück, Ar (1 Ar = 100 m²)', sot='Ar', sots='Ar',
               est='nach Kostenvoranschlag', res='Ungefähr ab', plus='+ Posten nach Kostenvoranschlag',
               n_base='Das ist die Untergrenze nach unseren Basissätzen; die genaue Summe nennen wir nach Aufmaß und Kostenvoranschlag.',
               n_rem='Die Renovierung umfasst Arbeiten und Grundmaterialien; Endoberflächen, Möbel und Geräte werden separat im Kostenvoranschlag berechnet.',
               n_5='Renovieren wir selbst, bleibt die Endsumme innerhalb von ±5 % des Kostenvoranschlags.',
               n_arch='Architekturplanung: Entwurfs- und Ausführungsplanung (Architektur, Tragwerk); Haustechnik und Lageplan nach Aufgabenstellung.',
               n_min='Mindestbetrag für das Design: {m}.',
               n_eu='Europa: Sätze rund 50 % über Kyjiw.',
               send='Genauen Kostenvoranschlag anfordern', msg='Ergebnis aus dem Rechner', svc='Rechner', frm='ab', m2='m²'),
    'fr': dict(h='Calculateur de coût', reg='Localisation', ua='Ukraine', eu='Europe', kind='Votre besoin',
               k=['Rénovation d’appartement clé en main', 'Rénovation de bureau', 'Construction de maison (gros œuvre)', 'Maison clé en main avec finitions',
                  'Projet de design intérieur', 'Projet architectural de maison', 'Aménagement paysager'],
               dz='Design', p=['Sans design', 'Plan d’aménagement', 'Projet de design', 'Complet avec suivi'],
               furn='Ameublement et équipement', area='Surface, m²', area_s='Terrain, ares (1 are = 100 m²)', sot='are', sots='ares',
               est='sur devis', res='À partir d’environ', plus='+ postes sur devis',
               n_base='C’est la borne basse selon nos tarifs de base ; le montant exact est donné après métré et devis.',
               n_rem='La rénovation comprend les travaux et les matériaux de base ; finitions, mobilier et électroménager sont chiffrés à part dans le devis.',
               n_5='Si nous réalisons les travaux, le total ne sort pas de ±5 % du devis.',
               n_arch='Projet architectural : esquisse et plans d’exécution (architecture, structure) ; lots techniques et plan de masse selon la mission.',
               n_min='Minimum pour le design : {m}.',
               n_eu='Europe : tarifs environ 50 % plus élevés qu’à Kyiv.',
               send='Obtenir un devis précis', msg='Calcul du calculateur', svc='Calculateur', frm='dès', m2='m²'),
    'ar': dict(h='حاسبة التكلفة', reg='موقع المشروع', ua='أوكرانيا', eu='أوروبا', kind='ما تحتاجه',
               k=['تجديد شقة بنظام تسليم المفتاح', 'تجديد مكتب', 'بناء منزل (هيكل)', 'منزل متكامل مع التشطيب',
                  'مشروع التصميم الداخلي', 'التصميم المعماري للمنزل', 'تنسيق الحدائق'],
               dz='التصميم', p=['بدون تصميم', 'تخطيط المساحات', 'مشروع التصميم', 'كامل مع الإشراف'],
               furn='التأثيث والتجهيز', area='المساحة، م²', area_s='الأرض، آر (1 آر = 100 م²)', sot='آر', sots='آر',
               est='وفق المقايسة', res='تقريبًا من', plus='+ بنود وفق المقايسة',
               n_base='هذا هو الحد الأدنى وفق أسعارنا الأساسية؛ نحدد المبلغ الدقيق بعد القياس وتقدير التكلفة.',
               n_rem='يشمل التجديد الأعمال والمواد الأساسية؛ أما مواد التشطيب والأثاث والأجهزة فتُحسب بشكل منفصل وفق التقدير.',
               n_5='إذا نفّذنا الأعمال لا يخرج الإجمالي عن ±5% من التقدير.',
               n_arch='التصميم المعماري: المخطط الأولي ومخططات التنفيذ (معماري وإنشائي)؛ الأقسام الهندسية والمخطط العام حسب المهمة.',
               n_min='الحد الأدنى للتصميم: {m}.',
               n_eu='أوروبا: الأسعار أعلى بنحو 50% من كييف.',
               send='احصل على تقدير دقيق', msg='حساب من الحاسبة', svc='الحاسبة', frm='من', m2='م²'),
}

CSS = ('#calc .cg{display:grid;gap:16px;max-width:640px}'
       '#calc select{width:100%;background:var(--bg2);border:1px solid var(--ln);color:var(--tx);padding:13px 14px;font:inherit;border-radius:6px}'
       '#calc .cl{display:block;margin-bottom:6px;font-size:var(--fs-small);color:var(--mu)}'
       '#calc .seg{display:flex;flex-wrap:wrap;gap:6px}#calc .seg.g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}'
       '#calc .seg button{min-height:44px;padding:6px 14px;border-radius:999px;border:1px solid var(--ln);background:none;color:var(--tx);font:inherit;font-size:var(--fs-small);line-height:1.25;cursor:pointer}'
       '#calc .seg.g2 button{border-radius:12px;text-align:start}#calc .seg button small{display:block;opacity:.75}'
       '#calc .seg button[aria-pressed=true]{background:var(--ac);border-color:var(--ac);color:#140f08}'
       '#calc .seg button:focus-visible{outline:2px solid var(--ac);outline-offset:2px}'
       '#calc .ck{display:flex;gap:10px;align-items:flex-start;color:var(--tx);min-height:44px}#calc .ck input{width:auto;margin-top:4px}#calc .ck small{color:var(--mu)}'
       '#calc [hidden]{display:none!important}'
       '#calc .sum{border:1px solid var(--ln);background:var(--bg2);padding:20px;margin-top:2px}'
       '#calc .sum b{font-family:"Cormorant Garamond","Cormorant Fallback",serif;font-size:var(--fs-h2);color:var(--ac);display:block;line-height:1.1}'
       '#calc .sum p{color:var(--mu);margin:8px 0 0;font-size:var(--fs-small)}#calc .sum #cPlus{color:var(--tx)}')

JS_SRC = '/assets/calc.v1.js'  # логіка — окремий файл (бюджет HTML лендингів); ?v= ставить chrome.versions (SHARED)


def block(lang):
    t = T[lang]
    usd = lambda n: i18n.usd(n, lang)
    cfg = dict(r=RATE, p={'0': [0, 0, 0, 0], **PKG}, pk=['0', 'plan', 'dz', 'full'], pn=t['p'], fu=FURN, k=t['k'], wd=WITH_DZ, wf=WITH_FU, rn=RENO,
               est=t['est'], frm=t['frm'], m2=t['m2'], sot=t['sot'], ss=t['sots'], am=t['area'], as_=t['area_s'], fn=t['furn'],
               nb=t['n_base'], nr=t['n_rem'], n5=t['n_5'], na=t['n_arch'], nm=t['n_min'], ne=t['n_eu'], ua=t['ua'], eu=t['eu'],
               msg=t['msg'], sv=t['svc'], pl=t['plus'])
    cfg['as'] = cfg.pop('as_')
    js = json.dumps(cfg, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    # без JS — підписи з українськими ставками (JS одразу перемальовує під регіон)
    opts = ''.join(f'<option value="{k}">{n} — ' + (f'{t["frm"]} {usd(PKG["dz"][0])}/{t["m2"]}' if k == 'design' else
                   f'{t["frm"]} {usd(RATE[k][0])}/{t["sot"] if k == "land" else t["m2"]}') + '</option>'
                   for k, n in zip(KINDS, t['k']))
    pk = ''.join(f'<button type="button" data-p="{p}" aria-pressed="{str(p == "0").lower()}">{n}'
                 + ('' if p == '0' else f'<small>{usd(PKG[p][0])}/{t["m2"]}</small>') + '</button>'
                 for p, n in zip(['0', 'plan', 'dz', 'full'], t['p']))
    return f'''<section id="calc"><div class="w">
  <h2>{t["h"]}</h2>
  <style>{CSS}</style>
  <div class="cg">
    <div role="group" aria-labelledby="cRegL"><span class="cl" id="cRegL">{t["reg"]}</span><div class="seg" id="cReg"><button type="button" data-r="0" aria-pressed="true">{t["ua"]}</button><button type="button" data-r="1" aria-pressed="false">{t["eu"]}</button></div></div>
    <div><label for="cKind">{t["kind"]}</label><select id="cKind">{opts}</select></div>
    <div><label for="cArea" id="cAreaL">{t["area"]}</label><input id="cArea" type="number" inputmode="decimal" min="0" max="100000" step="any" value="60"></div>
    <div role="group" aria-labelledby="cDzL" id="cDzW"><span class="cl" id="cDzL">{t["dz"]}</span><div class="seg g2" id="cDz">{pk}</div></div>
    <label class="ck" id="cFurnW"><input type="checkbox" id="cFurn"><span>{t["furn"]} <small id="cFurnR">{t["frm"]} {usd(FURN[0])}/{t["m2"]}</small></span></label>
    <div class="sum" aria-live="polite"><span id="cSumL">{t["res"]}</span><b id="cSum">—</b><p id="cPlus" hidden>{t["plus"]}</p><p id="cRows"></p><p id="cNote">{t["n_base"]}</p></div>
    <p><a class="btn main" id="cSend" href="#zayavka">{t["send"]}</a></p>
  </div>
<script type="application/json" id="cCfg">{js}</script><script src="{JS_SRC}" defer></script>
</div></section>'''
