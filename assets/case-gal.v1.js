/* Довгі галереї /proekty (tools/site/casegal.py): у HTML — перші 24 мініатюри, решта — JSON з посилання «Показати всі (N)» (a[data-gal]).
   Клік по кнопці або прокрутка до кінця галереї — дописує решту тими самими атрибутами (клітинки 4:3 — без CLS).
   Лайтбокс #lb сторінки: ‹ › , ←/→, свайп — по всіх фото; дійшли до останнього завантаженого — підвантажує JSON. */
(function(){
var d=document,W=window,btn=d.querySelector('a[data-gal]');if(!btn)return;
var g=btn.closest('section').querySelector('.pg'),lb=d.getElementById('lb'),im=d.getElementById('lbi'),N=+btn.getAttribute('data-gal')||0,P=null,cur=-1,op=null;
var L=({uk:['Попереднє фото','Наступне фото'],ru:['Предыдущее фото','Следующее фото']})[(d.documentElement.lang||'').slice(0,2)]||['Previous photo','Next photo'];
function links(){return Array.prototype.slice.call(g.querySelectorAll('a'))}
function load(){
 if(P)return P;
 btn.setAttribute('aria-busy','true');
 P=fetch(btn.getAttribute('href')).then(function(r){if(!r.ok)throw r.status;return r.json()}).then(function(j){
  var f=d.createDocumentFragment();
  j.p.forEach(function(x){var a=d.createElement('a'),i=d.createElement('img');a.href=x[0];
   i.loading='lazy';i.decoding='async';i.width=x[4];i.height=x[5];i.alt=x[6];if(x[3])i.sizes=x[3];if(x[2])i.srcset=x[2];i.src=x[1];a.appendChild(i);f.appendChild(a)});
  g.appendChild(f);var p=btn.parentNode;if(p)p.parentNode.removeChild(p);
 }).catch(function(){P=null;btn.removeAttribute('aria-busy')});
 return P;
}
btn.addEventListener('click',function(e){if(e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();var n=links().length;
 load().then(function(){var a=links()[n];if(a)a.focus()})});
if('IntersectionObserver' in W){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();load()}},{rootMargin:'0px 0px 700px 0px'});io.observe(btn)}
if(!lb||!im)return;
var st=d.createElement('style');
st.textContent='#lb .lb-nv{top:50%;right:auto;transform:translateY(-50%);font-size:28px;line-height:1}#lb .lb-pv{left:12px}#lb .lb-nx{left:auto;right:12px}'+
 '#lb .lb-ct{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);color:#EDE8DF;font-size:13px;letter-spacing:.08em;background:rgba(8,7,9,.6);padding:3px 10px;border-radius:999px}';
d.head.appendChild(st);
function mk(c,t,lab,dir){var b=d.createElement('button');b.type='button';b.className='lb-nv '+c;b.textContent=t;b.setAttribute('aria-label',lab);
 b.addEventListener('click',function(e){e.stopPropagation();go(dir)});lb.appendChild(b)}
mk('lb-pv','‹',L[0],-1);mk('lb-nx','›',L[1],1);
var ct=d.createElement('span');ct.className='lb-ct';ct.setAttribute('aria-live','polite');lb.appendChild(ct);
function show(i){var as=links();if(!as[i])return;cur=i;var m=as[i].querySelector('img');im.src=as[i].href;im.alt=m?m.alt:'';ct.textContent=(i+1)+' / '+Math.max(N,as.length)}
function open(a){op=a;show(links().indexOf(a));lb.classList.add('on');var c=lb.querySelector('button:not(.lb-nv)');if(c)c.focus()}
function go(dir){var n=links().length,i=cur+dir;
 if(i>=n&&n<N){load().then(function(){show(i<links().length?i:0)});return}
 if(i<0&&n<N){load().then(function(){var m=links().length;show(m-1)});return}
 show((i+n)%n)}
g.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a||e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();open(a)});
d.addEventListener('keydown',function(e){if(!lb.classList.contains('on'))return;
 if(e.key==='ArrowRight'){e.preventDefault();go(1)}else if(e.key==='ArrowLeft'){e.preventDefault();go(-1)}});
if(W.MutationObserver)new MutationObserver(function(){if(!lb.classList.contains('on')&&op){var a=op;op=null;try{a.focus({preventScroll:true})}catch(_){}}}).observe(lb,{attributes:true,attributeFilter:['class']});
var x0=null;lb.addEventListener('touchstart',function(e){x0=e.touches[0].clientX},{passive:true});
lb.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)go(dx<0?1:-1)},{passive:true});
})();
