"""HTML-блок калькулятора вартості (вставляється як "extra" у сторінки калькулятора)."""
RATES = {  # підтверджені ставки, $/м² (CLAUDE.md)
    'uk': [('remont', 'Ремонт квартири під ключ', 550), ('office', 'Ремонт офісу', 350),
           ('house', 'Будівництво будинку (коробка)', 600), ('housekey', 'Будинок під ключ з оздобленням', 1100)],
    'ru': [('remont', 'Ремонт квартиры под ключ', 550), ('office', 'Ремонт офиса', 350),
           ('house', 'Строительство дома (коробка)', 600), ('housekey', 'Дом под ключ с отделкой', 1100)],
}
T = {
    'uk': dict(h='Калькулятор вартості', kind='Що потрібно', area='Площа, м²', design='Дизайн-проєкт інтерʼєру (від $30/м², мінімум $2 500)',
               furn='Меблювання й комплектація (від $250/м²)', res='Орієнтовно від', note='Це нижня межа за нашими базовими ставками. Ремонт квартири від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом. Точну суму називаємо після заміру й кошторису; якщо ремонт робимо ми, підсумок не виходить за ±5% від кошторису.',
               send='Отримати точний кошторис', msg='Розрахунок з калькулятора'),
    'ru': dict(h='Калькулятор стоимости', kind='Что нужно', area='Площадь, м²', design='Дизайн-проект интерьера (от $30/м², минимум $2 500)',
               furn='Меблировка и комплектация (от $250/м²)', res='Ориентировочно от', note='Это нижняя граница по нашим базовым ставкам. Ремонт квартиры от $550/м² — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете. Точную сумму называем после замера и сметы; если ремонт делаем мы, итог не выходит за ±5% от сметы.',
               send='Получить точную смету', msg='Расчёт из калькулятора'),
}
# нові мови: ті самі ставки й логіка, перекладені підписи (d/f — рядки розрахунку, frm — «від», m2 — одиниця)
RATES.update({
    'en': [('remont', 'Turnkey apartment renovation', 550), ('office', 'Office renovation', 350),
           ('house', 'House construction (shell)', 600), ('housekey', 'Turnkey house with finishing', 1100)],
    'pl': [('remont', 'Remont mieszkania pod klucz', 550), ('office', 'Remont biura', 350),
           ('house', 'Budowa domu (stan surowy)', 600), ('housekey', 'Dom pod klucz z wykończeniem', 1100)],
    'de': [('remont', 'Wohnungsrenovierung schlüsselfertig', 550), ('office', 'Büroumbau', 350),
           ('house', 'Hausbau (Rohbau)', 600), ('housekey', 'Haus schlüsselfertig mit Ausbau', 1100)],
})
T.update({
    'en': dict(h='Cost calculator', kind='What you need', area='Area, m²', design='Interior design project (from $30/m², minimum $2 500)',
               furn='Furnishing and procurement (from $250/m²)', res='Approximately from', note='This is the lower limit at our base rates. Apartment renovation from $550/m² covers works and rough materials; finishing materials, furniture and appliances are priced separately in the estimate. We give the exact amount after measuring and preparing the estimate; if we do the renovation, the total stays within ±5% of the estimate.',
               send='Get an exact estimate', msg='Calculator result', d='Design project', f='Furnishing', frm='from', m2='m²'),
    'pl': dict(h='Kalkulator kosztów', kind='Czego potrzebujesz', area='Powierzchnia, m²', design='Projekt wnętrza (od $30/m², minimum $2 500)',
               furn='Umeblowanie i kompletacja (od $250/m²)', res='Orientacyjnie od', note='To dolna granica według naszych stawek bazowych. Remont mieszkania od $550/m² obejmuje prace i materiały podstawowe; materiały wykończeniowe, meble i AGD liczymy osobno, według kosztorysu. Dokładną kwotę podajemy po pomiarze i kosztorysie; jeśli remont robimy my, wynik nie wychodzi poza ±5% kosztorysu.',
               send='Poproś o dokładny kosztorys', msg='Wynik z kalkulatora', d='Projekt wnętrza', f='Umeblowanie', frm='od', m2='m²'),
    'de': dict(h='Kostenrechner', kind='Was Sie brauchen', area='Fläche, m²', design='Innenarchitektur-Projekt (ab $30/m², mindestens $2 500)',
               furn='Einrichtung und Ausstattung (ab $250/m²)', res='Ungefähr ab', note='Das ist die Untergrenze nach unseren Basissätzen. Die Wohnungsrenovierung ab $550/m² umfasst die Arbeiten und die Grundmaterialien; Materialien für die Endoberflächen, Möbel und Haushaltsgeräte werden separat im Kostenvoranschlag berechnet. Die genaue Summe nennen wir nach Aufmaß und Kostenvoranschlag; renovieren wir selbst, bleibt die Endsumme innerhalb von ±5 % des Kostenvoranschlags.',
               send='Genauen Kostenvoranschlag anfordern', msg='Ergebnis aus dem Rechner', d='Designprojekt', f='Einrichtung', frm='ab', m2='m²'),
})
RATES.update({
    'es': [('remont', 'Reforma de piso llave en mano', 550), ('office', 'Reforma de oficina', 350),
           ('house', 'Construcción de casa (estructura)', 600), ('housekey', 'Casa llave en mano con acabados', 1100)],
    'fr': [('remont', 'Rénovation d’appartement clé en main', 550), ('office', 'Rénovation de bureau', 350),
           ('house', 'Construction de maison (gros œuvre)', 600), ('housekey', 'Maison clé en main avec finitions', 1100)],
    'zh': [('remont', '公寓交钥匙装修', 550), ('office', '办公室装修', 350),
           ('house', '住宅建造（主体结构）', 600), ('housekey', '含精装的交钥匙住宅', 1100)],
    'ar': [('remont', 'تجديد شقة بنظام تسليم المفتاح', 550), ('office', 'تجديد مكتب', 350),
           ('house', 'بناء منزل (هيكل)', 600), ('housekey', 'منزل متكامل مع التشطيب', 1100)],
})
T.update({
    'es': dict(h='Calculadora de costes', kind='Qué necesita', area='Superficie, m²', design='Proyecto de diseño de interiores (desde $30/m², mínimo $2 500)',
               furn='Amueblamiento y equipamiento (desde $250/m²)', res='Aproximadamente desde', note='Es el límite inferior según nuestras tarifas base. La reforma de piso desde $550/m² incluye la mano de obra y los materiales básicos de obra; los materiales de acabado, los muebles y los electrodomésticos van aparte, según presupuesto. El importe exacto lo damos tras la medición y el presupuesto; si la obra la hacemos nosotros, el total no sale del ±5% del presupuesto.',
               send='Pedir presupuesto exacto', msg='Cálculo de la calculadora', d='Proyecto de diseño', f='Amueblamiento', frm='desde', m2='m²'),
    'fr': dict(h='Calculateur de coût', kind='Votre besoin', area='Surface, m²', design='Projet de design intérieur (dès $30/m², minimum $2 500)',
               furn='Ameublement et équipement (dès $250/m²)', res='À partir d’environ', note='C’est la borne basse selon nos tarifs de base. La rénovation d’appartement dès $550/m² comprend les travaux et les matériaux de base ; les matériaux de finition, le mobilier et l’électroménager sont chiffrés à part dans le devis. Le montant exact est donné après métré et devis ; si nous réalisons les travaux, le total ne sort pas de ±5 % du devis.',
               send='Obtenir un devis précis', msg='Calcul du calculateur', d='Projet de design', f='Ameublement', frm='dès', m2='m²'),
    'zh': dict(h='费用计算器', kind='您的需求', area='面积（m²）', design='室内设计方案（$30/m² 起，最低 $2 500）',
               furn='家具与配套（$250/m² 起）', res='预估起价', note='这是按我们基础单价计算的下限。公寓装修每平方米 $550 起包含施工和基础辅材；饰面主材、家具和家电另行计价，以预算为准。准确金额在测量并出具预算后确定；若由我们施工，最终费用与预算偏差不超过 ±5%。',
               send='获取准确预算', msg='计算器估算结果', d='设计方案', f='家具配套', frm='起价', m2='m²'),
    'ar': dict(h='حاسبة التكلفة', kind='ما تحتاجه', area='المساحة، م²', design='مشروع التصميم الداخلي (من $30/م²، بحد أدنى $2 500)',
               furn='التأثيث والتجهيز (من $250/م²)', res='تقريبًا من', note='هذا هو الحد الأدنى وفق أسعارنا الأساسية. يشمل تجديد الشقة من $550 للمتر المربع الأعمال والمواد الأساسية؛ أما مواد التشطيب النهائي والأثاث والأجهزة فتُحسب بشكل منفصل وفق تقدير التكلفة. نحدد المبلغ الدقيق بعد القياس وتقدير التكلفة؛ وإذا نفّذنا الأعمال لا يخرج الإجمالي عن ±5% من التقدير.',
               send='احصل على تقدير دقيق', msg='حساب من الحاسبة', d='مشروع التصميم', f='التأثيث', frm='من', m2='م²'),
})
for _l, _t in (('uk', ('Дизайн-проєкт', 'Меблювання', 'від')), ('ru', ('Дизайн-проект', 'Меблировка', 'от'))):
    T[_l].update(d=_t[0], f=_t[1], frm=_t[2], m2='м²')


def block(lang):
    t = T[lang]
    opts = ''.join(f'<option value="{r}" data-k="{k}">{n} — {t["frm"]} ${r:,}/{t["m2"]}</option>'.replace(',', ' ')
                   for k, n, r in RATES[lang])
    return f'''<section id="calc"><div class="w">
  <h2>{t["h"]}</h2>
  <style>#calc .cg{{display:grid;gap:14px;max-width:640px}}#calc select{{width:100%;background:var(--bg2);border:1px solid var(--ln);color:var(--tx);padding:13px 14px;font:inherit;border-radius:6px}}#calc .ck{{display:flex;gap:10px;align-items:flex-start;color:var(--tx)}}#calc .ck input{{width:auto;margin-top:4px}}#calc .sum{{border:1px solid var(--ln);background:var(--bg2);padding:20px;margin-top:6px}}#calc .sum b{{font-family:"Cormorant Garamond","Cormorant Fallback",serif;font-size:var(--fs-h2);color:var(--ac);display:block;line-height:1.1}}#calc .sum p{{color:var(--mu);margin:8px 0 0;font-size:var(--fs-small)}}</style>
  <div class="cg">
    <div><label for="cKind">{t["kind"]}</label><select id="cKind">{opts}</select></div>
    <div><label for="cArea">{t["area"]}</label><input id="cArea" type="number" inputmode="numeric" min="1" value="60"></div>
    <label class="ck"><input type="checkbox" id="cDesign">{t["design"]}</label>
    <label class="ck"><input type="checkbox" id="cFurn">{t["furn"]}</label>
    <div class="sum" aria-live="polite"><span>{t["res"]}</span><b id="cSum">—</b><p id="cRows"></p><p>{t["note"]}</p></div>
    <p><a class="btn main" id="cSend" href="#zayavka">{t["send"]}</a></p>
  </div>
<script>(function(){{var $=function(i){{return document.getElementById(i)}},f=function(n){{return '$'+Math.round(n).toLocaleString('uk-UA').replace(/\\u00a0|,/g,' ')}};
function calc(){{var a=Math.max(0,+$('cArea').value||0),o=$('cKind').selectedOptions[0],r=+o.value,rows=[[o.text.split(' — ')[0],r*a]];
if($('cDesign').checked)rows.push(['{t["d"]}',Math.max(30*a,2500)]);
if($('cFurn').checked)rows.push(['{t["f"]}',250*a]);
var s=0;rows.forEach(function(x){{s+=x[1]}});$('cSum').textContent=a?f(s):'—';$('cRows').textContent=a?rows.map(function(x){{return x[0]+': '+f(x[1])}}).join(' · '):'';return{{a:a,t:$('cRows').textContent,s:f(s)}}}}
['cKind','cArea','cDesign','cFurn'].forEach(function(i){{$(i).addEventListener('input',calc);$(i).addEventListener('change',calc)}});calc();
$('cSend').addEventListener('click',function(){{var c=calc(),ar=$('oArea'),m=$('oMsg');if(ar&&c.a)ar.value=c.a;if(m&&!m.value)m.value='{t["msg"]}: '+c.t+' = {t["frm"]} '+c.s}});}})();</script>
</div></section>'''
