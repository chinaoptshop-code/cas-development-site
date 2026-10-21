"""HTML-блок калькулятора вартості (вставляється як "extra" у сторінки калькулятора)."""
RATES = {  # підтверджені ставки, $/м² (CLAUDE.md)
    'uk': [('remont', 'Ремонт квартири під ключ', 550), ('office', 'Ремонт офісу', 350),
           ('house', 'Будівництво будинку (коробка)', 600), ('housekey', 'Будинок під ключ з оздобленням', 1100)],
    'ru': [('remont', 'Ремонт квартиры под ключ', 550), ('office', 'Ремонт офиса', 350),
           ('house', 'Строительство дома (коробка)', 600), ('housekey', 'Дом под ключ с отделкой', 1100)],
}
T = {
    'uk': dict(h='Калькулятор вартості', kind='Що потрібно', area='Площа, м²', design='Дизайн-проєкт інтерʼєру (від $30/м², мінімум $2 500)',
               furn='Меблювання й комплектація (від $250/м²)', res='Орієнтовно від', note='Це нижня межа за нашими базовими ставками. Точну суму називаємо після заміру й кошторису; якщо ремонт робимо ми, підсумок не виходить за ±5% від кошторису.',
               send='Отримати точний кошторис', msg='Розрахунок з калькулятора'),
    'ru': dict(h='Калькулятор стоимости', kind='Что нужно', area='Площадь, м²', design='Дизайн-проект интерьера (от $30/м², минимум $2 500)',
               furn='Меблировка и комплектация (от $250/м²)', res='Ориентировочно от', note='Это нижняя граница по нашим базовым ставкам. Точную сумму называем после замера и сметы; если ремонт делаем мы, итог не выходит за ±5% от сметы.',
               send='Получить точную смету', msg='Расчёт из калькулятора'),
}


def block(lang):
    t = T[lang]
    opts = ''.join(f'<option value="{r}" data-k="{k}">{n} — от ${r:,}/м²</option>'.replace(',', ' ').replace('от $', 'від $' if lang == 'uk' else 'от $')
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
if($('cDesign').checked)rows.push(['{"Дизайн-проєкт" if lang == "uk" else "Дизайн-проект"}',Math.max(30*a,2500)]);
if($('cFurn').checked)rows.push(['{"Меблювання" if lang == "uk" else "Меблировка"}',250*a]);
var s=0;rows.forEach(function(x){{s+=x[1]}});$('cSum').textContent=a?f(s):'—';$('cRows').textContent=a?rows.map(function(x){{return x[0]+': '+f(x[1])}}).join(' · '):'';return{{a:a,t:$('cRows').textContent,s:f(s)}}}}
['cKind','cArea','cDesign','cFurn'].forEach(function(i){{$(i).addEventListener('input',calc);$(i).addEventListener('change',calc)}});calc();
$('cSend').addEventListener('click',function(){{var c=calc(),ar=$('oArea'),m=$('oMsg');if(ar&&c.a)ar.value=c.a;if(m&&!m.value)m.value='{t["msg"]}: '+c.t+' = {"від" if lang == "uk" else "от"} '+c.s}});}})();</script>
</div></section>'''
