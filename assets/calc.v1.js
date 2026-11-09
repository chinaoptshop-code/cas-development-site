/* Калькулятор вартості (9 мов) — логіка; розмітку й конфіг (ставки, підписи) генерує tools/site/calc.py, конфіг — <script type="application/json" id="cCfg">.
   Запуск після DOMContentLoaded: casUsd з site-chrome.v1.js (defer) уже є. */
function casCalcInit(){var D=document.getElementById('cCfg');if(!D)return;var C=JSON.parse(D.textContent),$=function(i){return document.getElementById(i)},f=function(n){return casUsd(n)},R=0,P='0',mem={m:'60',s:'10'},unit='m';
function kind(){return $('cKind').value}
function rate(r,v){return r==null?C.est:C.frm+' '+f(r)+'/'+v}
function sync(){var k=kind(),o=$('cKind').options,i,b;
for(i=0;i<o.length;i++){var q=o[i].value,n=C.k[i];o[i].text=q==='design'?n+' — '+C.frm+' '+f(R?C.p.dz[1]:C.p.plan[0])+'/'+C.m2:n+' — '+rate(C.r[q][R],q==='land'?C.sot:C.m2)}
$('cDzW').hidden=C.wd.indexOf(k)<0;$('cFurnW').hidden=C.wf.indexOf(k)<0;
if(k==='design'&&P==='0')P='dz';
b=$('cDz').querySelectorAll('button');for(i=0;i<b.length;i++){var p=b[i].getAttribute('data-p');b[i].hidden=p==='0'&&k==='design';b[i].setAttribute('aria-pressed',String(p===P));
var s=b[i].querySelector('small');if(s)s.textContent=C.p[p][R]==null?C.est:f(C.p[p][R])+'/'+C.m2}
b=$('cReg').querySelectorAll('button');for(i=0;i<b.length;i++)b[i].setAttribute('aria-pressed',String(+b[i].getAttribute('data-r')===R));
$('cFurnR').textContent=C.frm+' '+f(C.fu[R])+'/'+C.m2;
var u=k==='land'?'s':'m';if(u!==unit){mem[unit]=$('cArea').value;unit=u;$('cArea').value=mem[u];$('cAreaL').textContent=u==='s'?C.as:C.am}}
function calc(){sync();var k=kind(),ki=$('cKind').selectedIndex,v=+String($('cArea').value).replace(',','.')||0,
a=unit==='s'?Math.min(10000,Math.max(0,Math.round(v*10)/10)):Math.min(100000,Math.max(0,Math.round(v))),rows=[],s=0,est=0,notes=[C.nb];
if(k!=='design')rows.push([C.k[ki],C.r[k][R]==null?null:C.r[k][R]*a]);
if(C.wd.indexOf(k)>=0&&P!=='0'){var q=C.p[P],pi=C.pk.indexOf(P);rows.push([C.pn[pi],q[R]==null?null:Math.max(q[R]*a,q[2+R])]);if(q[R]!=null)notes.push(C.nm.replace('{m}',f(q[2+R])))}
if(C.wf.indexOf(k)>=0&&$('cFurn').checked)rows.push([C.fn,C.fu[R]*a]);
rows.forEach(function(x){if(x[1]==null)est=1;else s+=x[1]});
if(C.rn.indexOf(k)>=0){notes.push(C.nr);notes.push(C.n5)}if(k==='arch')notes.push(C.na);if(R)notes.push(C.ne);
var t=a?rows.map(function(x){return x[0]+': '+(x[1]==null?C.est:f(x[1]))}).join(' · '):'',st=!a?'—':s?f(s):C.est;
$('cSumL').hidden=!(a&&s);$('cSum').textContent=st;$('cPlus').hidden=!(a&&s&&est);$('cRows').textContent=t;$('cNote').textContent=notes.join(' ');
return{a:a,t:t,s:st,ok:!!(a&&s),k:k,ki:ki}}
$('cReg').addEventListener('click',function(e){var b=e.target.closest('button');if(b){R=+b.getAttribute('data-r');calc()}});
$('cDz').addEventListener('click',function(e){var b=e.target.closest('button');if(b){P=b.getAttribute('data-p');calc()}});
['cKind','cArea','cFurn'].forEach(function(i){$(i).addEventListener('input',calc);$(i).addEventListener('change',calc)});
calc();
$('cSend').addEventListener('click',function(){var c=calc(),ar=$('oArea'),m=$('oMsg'),fo=$('of'),rg=R?C.eu:C.ua,svc=C.k[c.ki]+' · '+rg;
if(ar&&c.a)ar.value=unit==='s'?Math.round(c.a*100):c.a;
if(fo)fo.setAttribute('data-service',C.sv+': '+svc);
if(m&&(!m.value||m.value.indexOf(C.msg)===0))m.value=C.msg+' ('+rg+(unit==='s'?', '+c.a+' '+C.ss:'')+'): '+c.t+(c.ok?' = '+C.frm+' '+c.s+($('cPlus').hidden?'':' '+C.pl):'')})}
if(document.readyState==='complete')casCalcInit();else document.addEventListener('DOMContentLoaded',casCalcInit);
