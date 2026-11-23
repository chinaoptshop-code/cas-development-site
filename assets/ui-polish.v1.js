/* UI polish (a11y кнопок-діалогів, розгортання, стрічки, поява фото). Раніше — інлайн-копія на кожній сторінці; тепер один файл (chrome.py ui_polish_ext), підписи — за <html lang>. */
(function(){
var d=document,W=window,RM=W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches;
function $$(s,r){return Array.prototype.slice.call((r||d).querySelectorAll(s))}
function btnify(el,label){
 if(!el||el.tagName==='BUTTON'||el.tagName==='A')return;
 if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');
 if(!el.hasAttribute('role'))el.setAttribute('role','button');
 if(label&&!el.hasAttribute('aria-label'))el.setAttribute('aria-label',label);
 el.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target===el){e.preventDefault();el.click();}});
}
function syncExp(el,target,cls){
 var t=target||el;function u(){el.setAttribute('aria-expanded',t.classList.contains(cls)?'true':'false')}
 u();if(W.MutationObserver)new MutationObserver(u).observe(t,{attributes:true,attributeFilter:['class']});
}
function a11y(){
 var L=({uk:['Закрити','Попереднє фото','Наступне фото','Меню'],ru:['Закрыть','Предыдущее фото','Следующее фото','Меню'],en:['Close','Previous photo','Next photo','Menu'],
  pl:['Zamknij','Poprzednie zdjęcie','Następne zdjęcie','Menu'],de:['Schließen','Vorheriges Foto','Nächstes Foto','Menü'],es:['Cerrar','Foto anterior','Foto siguiente','Menú'],
  fr:['Fermer','Photo précédente','Photo suivante','Menu'],pt:['Fechar','Foto anterior','Foto seguinte','Menu'],zh:['关闭','上一张','下一张','菜单'],ar:['إغلاق','الصورة السابقة','الصورة التالية','القائمة']})[(d.documentElement.lang||'uk').slice(0,2)]||['Close','Previous photo','Next photo','Menu'];
 btnify(d.getElementById('lb-close'),L[0]);
 btnify(d.getElementById('lb-prev'),L[1]);
 btnify(d.getElementById('lb-next'),L[2]);
 btnify(d.getElementById('sdlb-close'),L[0]);
 $$('.hamburger').forEach(function(h){btnify(h,L[3])});
 $$('.sp-card[onclick]').forEach(function(c){var b=c.querySelector('.sp-tog');if(b)syncExp(b,c,'exp');else{btnify(c);syncExp(c,c,'exp')}});
 $$('.ps-tog').forEach(function(b){var p=b.parentElement;if(p)syncExp(b,p,'exp')});
 var hb=d.getElementById('hbgBtn'),nsb=d.getElementById('nsb');
 if(hb&&nsb){hb.setAttribute('aria-controls','nsb');syncExp(hb,nsb,'open');
  d.addEventListener('keydown',function(e){if(e.key==='Escape'&&nsb.classList.contains('open')&&typeof W.closeNav==='function'){W.closeNav();hb.focus();}});}
}
function run(){try{a11y()}catch(e){}}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',run);else run();
})();
(function(){
var d=document,W=window,RM=W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches;
function $$(s,r){return Array.prototype.slice.call((r||d).querySelectorAll(s))}
function expanders(){
 $$('.sv-more,.sp-card-detail,.ps-more').forEach(function(el){
  if(el.classList.contains('xp'))return;
  var w=d.createElement('div');w.className='xp-in';
  while(el.firstChild)w.appendChild(el.firstChild);
  el.appendChild(w);el.classList.add('xp');
 });
}
function scrollers(){
 $$('.proj-row-scroll,.strip,.pf-filter').forEach(function(sc){
  var wr=sc.parentElement;if(!wr||wr.classList.contains('ui-sc'))return;
  wr.classList.add('ui-sc');
  var fl=d.createElement('span'),fr=d.createElement('span');fl.className='ui-fade ui-fade-l';fr.className='ui-fade ui-fade-r';
  fl.setAttribute('aria-hidden','true');fr.setAttribute('aria-hidden','true');wr.appendChild(fl);wr.appendChild(fr);
  var items=Array.prototype.filter.call(sc.children,function(c){return c.nodeType===1});
  var cnt=null;
  if(!sc.classList.contains('pf-filter')&&items.length>3){cnt=d.createElement('span');cnt.className='ui-cnt';cnt.setAttribute('aria-hidden','true');wr.appendChild(cnt);}
  var raf=0;
  function upd(){raf=0;
   var ov=sc.scrollWidth>sc.clientWidth+4,sl=Math.abs(sc.scrollLeft);
   wr.classList.toggle('ui-ov',ov);wr.classList.toggle('ui-start',sl<=4);wr.classList.toggle('ui-end',sl+sc.clientWidth>=sc.scrollWidth-4);
   if(cnt){var r=sc.getBoundingClientRect(),cur=1;
    for(var i=0;i<items.length;i++){var b=items[i].getBoundingClientRect();if(b.right>r.left+b.width/2){cur=i+1;break;}}
    if(sl+sc.clientWidth>=sc.scrollWidth-4)cur=items.length;
    cnt.textContent=cur+' / '+items.length;}
  }
  function q(){if(!raf)raf=(W.requestAnimationFrame||setTimeout)(upd)}
  sc.addEventListener('scroll',q,{passive:true});W.addEventListener('resize',q);
  var used=function(){wr.classList.add('ui-used')};
  sc.addEventListener('scroll',used,{passive:true,once:true});
  wr.addEventListener('touchstart',function(){wr.classList.add('ui-touch')},{passive:true});
  wr.addEventListener('touchend',function(){setTimeout(function(){wr.classList.remove('ui-touch')},1500)},{passive:true});
  if(cnt)cnt.textContent='1 / '+items.length;
  if(!('IntersectionObserver' in W)){upd();return;}
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
   if(!e.isIntersecting)return;io.disconnect();upd();if(RM)return;
   if(!wr.classList.contains('ui-ov')||wr.classList.contains('ui-used'))return;
   wr.classList.add('ui-hint');
   setTimeout(function(){if(!wr.classList.contains('ui-used')){sc.classList.add('ui-nudge');setTimeout(function(){sc.classList.remove('ui-nudge')},1500);}},400);
  })},{threshold:.6});
  io.observe(wr);
 });
}
function imgFade(){
 if(RM)return;
 $$('img[loading="lazy"]').forEach(function(im){
  if(im.complete||im.closest('.proj-row-thumb,.pi,.strip-item,#lb,#plb,.lb'))return;
  im.classList.add('ui-img');
  var done=function(){im.classList.add('ui-img-in');setTimeout(function(){im.classList.remove('ui-img','ui-img-in')},450)};
  im.addEventListener('load',done,{once:true});im.addEventListener('error',done,{once:true});
 });
}
/* Стрічки фото (.xs-st — стрічка під hero й галереї проєктів, .vgrid — «Відео з обʼєктів» на телефоні, .strip): повільна автопрокрутка
   ~25 px/с безшовним колом (копія кадрів — aria-hidden, без фокуса), лише в кадрі (IntersectionObserver) і на видимій вкладці; пауза при дотику, перетягуванні,
   фокусі, тачі/колесі (9 с); кнопки паузи немає ніде (Михайло 23.11.2026: «прибери… з зупинкою анімації»; під hero — з 11.11.2026); prefers-reduced-motion — статично. Висота блоку не змінюється (CLS 0). Михайло 03.11.2026. */
function marquee(){
 if(RM||!('IntersectionObserver' in W)||!W.requestAnimationFrame)return;
 var list=$$('.xs-st,.vgrid,.strip,.xs-cv,.hx-home~.xs-svc .xs-sv,.xs-bl');if(!list.length)return; // .xs-bl — «Бренди, з якими працюємо» (rich.py brands, 21.11.2026)
 var st=d.createElement('style');
 st.textContent='.mq-run{scroll-snap-type:none!important;scroll-behavior:auto!important}';
 d.head.appendChild(st);
 list.forEach(function(sc){
  if(sc.__mq)return;sc.__mq=1;
  var items=Array.prototype.filter.call(sc.children,function(c){return c.nodeType===1});
  if(items.length<3)return;
  var cl=[],half=0,pos=0,live=false,hover=false,hold=0,raf=0,lt=0,tm=0,rtl=((sc.closest('[dir]')||{}).dir||'')==='rtl'; // без getComputedStyle на кожну стрічку (примусовий перерахунок стилів; /portfolio — 21 стрічка)
  function noId(x){if(x.id)x.removeAttribute('id')}
  function setup(){
   if(cl.length)return true;
   if(sc.scrollWidth<=sc.clientWidth+8)return false; // усе й так видно (напр. .vgrid на десктопі) — не крутимо
   // копія через інертний <template> з data-mq-src: cloneNode(true) змушує Chrome тягнути всі lazy-фото копій одразу (30+ запитів);
   // src/srcset повертаємо вже після вставки — тоді працює loading="lazy"
   items.forEach(function(it){var tp=d.createElement('template');tp.innerHTML=it.outerHTML.replace(/<img\b[^>]*>/g,function(t){return t.replace(/\s(src|srcset)=/g,' data-mq-$1=')});
    var c=tp.content.firstElementChild;c.setAttribute('aria-hidden','true');c.classList.add('mq-c');
    noId(c);$$('[id]',c).forEach(noId);
    $$('a,button,[tabindex]',c).concat(c.matches('a,button')?[c]:[]).forEach(function(x){x.setAttribute('tabindex','-1')});
    $$('img',c).forEach(function(im){im.classList.remove('ui-img','ui-img-in')});
    sc.appendChild(c);cl.push(c);
    $$('img',c).forEach(function(im){['srcset','src'].forEach(function(a){var v=im.getAttribute('data-mq-'+a);if(v!=null){im.removeAttribute('data-mq-'+a);im.setAttribute(a,v)}});
     if(W.casLazy&&(im.hasAttribute('data-p')||im.hasAttribute('data-srcset')))W.casLazy(im)})}); // відкладене фото (оригінал ще не підвантажено) — копія теж
   // без кнопки паузи (Михайло 23.11.2026): пауза — при наведенні, дотику й фокусі
   sc.classList.add('mq-run'); // без scroll-snap, поки стрічка рухається й на паузі: інакше на паузі кадр «відскакує» до краю
   return true;
  }
  function measure(){half=Math.abs(cl[0].offsetLeft-items[0].offsetLeft)}
  function sync(){pos=Math.abs(sc.scrollLeft);measure();if(half&&pos>=half)pos-=half}
  function act(){return live&&!hover&&!d.hidden&&Date.now()>=hold}
  function frame(ts){
   raf=0;if(!act()){lt=0;return}
   var dt=lt?Math.min(50,ts-lt):16;lt=ts;
   pos+=dt*0.025;if(half&&pos>=half)pos-=half;
   var r=W.devicePixelRatio||1,v=Math.round(pos*r)/r;sc.scrollLeft=rtl?-v:v;
   raf=W.requestAnimationFrame(frame);
  }
  function go(){clearTimeout(tm);if(act()){if(!raf){sync();raf=W.requestAnimationFrame(frame)}}else if(live&&!hover&&Date.now()<hold)tm=setTimeout(go,hold-Date.now()+50)}
  function pause(ms){hold=Math.max(hold,Date.now()+ms);go()}
  // наведення курсора стрічку НЕ зупиняє (Михайло 24.11.2026: «щоб не зупинялась анімація при наведенні курсора»); пауза — дотик, перетягування,
  // колесо, стрілки (9 с) і фокус із клавіатури (:focus-visible — клік мишею по картці фокус теж дає, але зупиняти через нього не треба)
  ['touchstart','pointerdown','wheel'].forEach(function(n){sc.addEventListener(n,function(){pause(9000)},{passive:true})});
  sc.addEventListener('focusin',function(e){var k=false;try{k=e.target.matches(':focus-visible')}catch(_){k=true}if(k)hover=true});
  sc.addEventListener('focusout',function(){if(hover){hover=false;pause(600)}});
  d.addEventListener('visibilitychange',function(){go()});
  W.addEventListener('resize',function(){if(cl.length){measure();go()}},{passive:true});
  new IntersectionObserver(function(es){live=es[es.length-1].isIntersecting;if(live&&!setup())live=false;go()},{rootMargin:'0px 0px -10% 0px'}).observe(sc);
 });
}
/* Карусель «Наші проєкти» на головних (.xs-cv, Михайло 05.11.2026) і «Що ми робимо» на головних (.hx-home~.xs-svc .xs-sv, Михайло 08.11.2026):
   один ряд, scroll-snap, свайп/тачпад; стрілки ‹ › (44 px, aria-label) — З БОКІВ ряду поверх фото, ліворуч і праворуч (Михайло 23.11.2026:
   «стрілочки перенеси… щоб справа зліва були, а не знизу»; ряду кнопок під каруселлю й кнопки паузи більше немає). .cv-nav — смужка нульової
   висоти ПЕРЕД рядом (висота секції не змінюється), кнопки — absolute на рівні середини фото (--cvy ставить ResizeObserver, без примусової верстки).
   Автопрокрутка — marquee() вище (пауза при наведенні/тачі/фокусі; reduced-motion — статично). Натискання стрілки — пауза 9 с. */
function carousel(){
 var lg=(d.documentElement.lang||'uk').slice(0,2),
 LP=({uk:['Попередні проєкти','Наступні проєкти'],ru:['Предыдущие проекты','Следующие проекты'],en:['Previous projects','Next projects'],es:['Proyectos anteriores','Proyectos siguientes'],
  zh:['上一组项目','下一组项目'],pl:['Poprzednie projekty','Następne projekty'],de:['Vorherige Projekte','Nächste Projekte'],fr:['Projets précédents','Projets suivants'],pt:['Projetos anteriores','Projetos seguintes'],ar:['المشاريع السابقة','المشاريع التالية']})[lg]||['Previous','Next'],
 LS=({uk:['Попередні послуги','Наступні послуги'],ru:['Предыдущие услуги','Следующие услуги'],en:['Previous services','Next services'],es:['Servicios anteriores','Servicios siguientes'],
  zh:['上一项服务','下一项服务'],pl:['Poprzednie usługi','Następne usługi'],de:['Vorherige Leistungen','Nächste Leistungen'],fr:['Services précédents','Services suivants'],pt:['Serviços anteriores','Serviços seguintes'],ar:['الخدمات السابقة','الخدمات التالية']})[lg]||['Previous','Next'];
 $$('.xs-cv,.hx-home~.xs-svc .xs-sv').forEach(function(sc){
  if(sc.__cv)return;sc.__cv=1;
  var L=sc.classList.contains('xs-sv')?LS:LP;
  var nav=d.createElement('div');nav.className='cv-nav';
  [[-1,'‹',L[0]],[1,'›',L[1]]].forEach(function(x){
   var b=d.createElement('button');b.type='button';b.className='cv-b '+(x[0]<0?'cv-l':'cv-r');b.setAttribute('aria-label',x[2]);b.title=x[2];b.innerHTML='<span aria-hidden="true">'+x[1]+'</span>';
   b.addEventListener('click',function(){
    try{sc.dispatchEvent(new Event('wheel'))}catch(e){} // marquee(): пауза 9 с
    var cs=W.getComputedStyle(sc),it=sc.firstElementChild,step=it?it.getBoundingClientRect().width+(parseFloat(cs.columnGap)||12):sc.clientWidth*.8,rtl=cs.direction==='rtl';
    sc.scrollBy({left:x[0]*step*(rtl?-1:1),behavior:RM?'auto':'smooth'});
   });
   nav.appendChild(b);
  });
  sc.parentNode.insertBefore(nav,sc);sc.classList.add('cv-on');
  // середина фото першої картки відносно верху ряду → --cvy (картка «Що ми робимо» — фото зверху, текст нижче; обкладинка проєкту — фото на всю картку)
  function mid(){var im=sc.querySelector('img'),r=sc.getBoundingClientRect(),q=(im||sc).getBoundingClientRect();if(q.height>0)nav.style.setProperty('--cvy',Math.round(q.top-r.top+q.height/2)+'px')}
  if('ResizeObserver' in W)new ResizeObserver(mid).observe(sc);else W.requestAnimationFrame(mid);
 });
}
/* Слайд-шоу фону hero головних (Михайло 09.11.2026; список — data-hs на picture.hx-bg, ставить tools/site/rich.py HERO_SLIDES):
   перше фото (LCP, fetchpriority) не анімується; інші шари — лише після load + idle, кожен вантажиться перед показом (AVIF/WebP, телефон — кадр 0.6);
   зміна кожні 10 с, перехід opacity 1.2 с; пауза, коли вкладка прихована або hero поза екраном; prefers-reduced-motion — без зміни.
   Додаткові шари декоративні: alt="", aria-hidden. Висота блоку не змінюється (CLS 0). */
function heroSlides(){
 var pic=d.querySelector('.hx-home>picture.hx-bg[data-hs]');if(!pic||RM||!('IntersectionObserver' in W))return;
 var hx=pic.parentNode,list=pic.getAttribute('data-hs').split(';').map(function(x){var p=x.split(':');return{n:p[0],d:(p[1]||'').split('.').filter(Boolean),m:(p[2]||'').split('.').filter(Boolean)}}).filter(function(x){return x.d.length&&x.m.length});
 if(!list.length)return;
 var st=d.createElement('style');
 st.textContent='.hx-home>.hs-l img{opacity:0;transition:opacity 1.2s ease}.hx-home>.hs-l.hs-on img{opacity:1}'; // на img: деплой ставить picture{display:contents}
 d.head.appendChild(st);
 var layers=[pic],cur=0,vis=true,tm=0,busy=false;
 function set(n,ws,m,ext){return ws.map(function(w){return '/img/hs-'+n+m+'-'+w+'.'+ext+' '+w+'w'}).join(', ')}
 function make(i){
  var x=list[i-1],P=d.createElement('picture');P.className='hx-bg hs-l';P.setAttribute('aria-hidden','true');
  var q='(max-width:767px) and (orientation:portrait)',
   // sizes — ширина, яку кадр реально займає в блоці (object-fit:cover): телефон 0.6, ПК 2:1 (як home_sizes() у tools/site/rich.py)
   bw=hx.offsetWidth,bh=hx.offsetHeight,zm=Math.ceil(Math.max(bw,bh*.6))+'px',zd=Math.ceil(Math.max(bw,bh*2))+'px';
  P.innerHTML='<source type="image/avif" media="'+q+'" srcset="'+set(x.n,x.m,'-m','avif')+'" sizes="'+zm+'">'+
   '<source media="'+q+'" srcset="'+set(x.n,x.m,'-m','webp')+'" sizes="'+zm+'">'+
   '<source type="image/avif" srcset="'+set(x.n,x.d,'','avif')+'" sizes="'+zd+'">'+
   '<img src="/img/hs-'+x.n+'-'+x.d[0]+'.webp" srcset="'+set(x.n,x.d,'','webp')+'" sizes="'+zd+'" alt="" decoding="async" width="2400" height="1200">';
  return P;
 }
 function show(i){
  var L=layers[i];
  if(!L){L=layers[i]=make(i);hx.insertBefore(L,layers[i-1].nextSibling)}
  var im=L.querySelector('img');busy=true;
  var go=function(){busy=false;
   var old=layers.filter(function(x,k){return k&&k!==i&&x.classList.contains('hs-on')});
   if(i){L.classList.add('hs-on');setTimeout(function(){old.forEach(function(x){x.classList.remove('hs-on')})},1300)} // новий шар вище — старі гасимо після переходу
   else old.forEach(function(x){x.classList.remove('hs-on')}); // назад до першого фото: верхній шар тане
   cur=i;arm()};
  if(im.complete&&im.naturalWidth)go();
  else{im.addEventListener('load',function(){(im.decode?im.decode():Promise.resolve()).then(go,go)},{once:true});im.addEventListener('error',function(){busy=false;cur=i;arm()},{once:true})}
 }
 function arm(){clearTimeout(tm);if(vis&&!d.hidden&&!busy)tm=setTimeout(function(){show((cur+1)%(list.length+1))},10000)}
 new IntersectionObserver(function(e){vis=e[0].isIntersecting;if(vis)arm();else clearTimeout(tm)},{threshold:.15}).observe(hx);
 d.addEventListener('visibilitychange',function(){if(d.hidden)clearTimeout(tm);else arm()});
 var start=function(){(W.requestIdleCallback||function(f){setTimeout(f,200)})(arm)};
 if(d.readyState==='complete')start();else W.addEventListener('load',start,{once:true});
}
/* Кадри-посилання стрічки (.xs-st a; на головних — кейси проєктів, Михайло 11.11.2026): відкриває лише тап/клік; свайп чи перетягування
   (зсув пальця/миші або прокрутки > 8 px між pointerdown і click) перехід скасовує. Працює й без автопрокрутки (reduced-motion). */
function stripTap(){
 $$('.xs-st').forEach(function(sc){
  if(sc.__tap||!sc.querySelector('a[href]'))return;sc.__tap=1;
  var x=0,y=0,l=0,on=false;
  sc.addEventListener('pointerdown',function(e){on=true;x=e.clientX;y=e.clientY;l=sc.scrollLeft},{passive:true,capture:true});
  sc.addEventListener('click',function(e){
   if(!e.target.closest||!e.target.closest('a[href]'))return;
   var moved=on&&(Math.abs(e.clientX-x)>8||Math.abs(e.clientY-y)>8||Math.abs(sc.scrollLeft-l)>8);on=false;
   if(moved){e.preventDefault();e.stopPropagation()}
  },true);
  sc.addEventListener('dragstart',function(e){if(e.target.closest&&e.target.closest('a'))e.preventDefault()});
 });
}
/* Перетягування мишкою (Михайло 24.11.2026: «клацаючи і зажимаючи ліву кнопку миші на всіх анімованих прокрутах… протягнути… і покрутити
   вправо-вліво»): на всіх рядах, що рухаються самі або гортаються (стрічки фото, «Що ми робимо», «Наші проєкти», бренди, відео, перемикач сцен),
   затиснута ліва кнопка + рух тягне ряд за курсором; відпустив з рухом — коротка інерція (reduced-motion — без неї). Клік без руху працює як
   раніше (картка-посилання відкривається), після перетягування клік гаситься. Тач не чіпаємо — там рідний свайп. Один делегований
   pointerdown на документі; слухачі руху — лише на час жесту; у DOM нічого не додаємо, крім класу .dg на ряду. */
function dragScroll(){
 if(!W.PointerEvent)return;
 var SEL='.xs-st,.vgrid,.strip,.xs-cv,.xs-sv,.xs-bl,.la-tab',sc=null,x0=0,l0=0,on=false,lx=0,lt=0,v=0,raf=0,kill=0,half=0,sg=1;
 // нескінченні стрічки (marquee(): друга половина — копії .mq-c): на краю перескакуємо на таку саму картинку з іншої половини — тягнути можна без кінця
 function wrap(x){if(!half)return x;var a=x*sg;a=((a%half)+half)%half;return a*sg}
 var st=d.createElement('style');
 st.textContent='.dg{cursor:grabbing!important;scroll-snap-type:none!important;scroll-behavior:auto!important;-webkit-user-select:none;user-select:none}.dg *{cursor:grabbing!important}';
 d.head.appendChild(st);
 function end(){
  d.removeEventListener('pointermove',move,true);d.removeEventListener('pointerup',up,true);d.removeEventListener('pointercancel',up,true);
 }
 function move(e){
  if(!sc)return;
  var dx=e.clientX-x0;
  if(!on){if(Math.abs(dx)<6)return;on=true;sc.classList.add('dg');try{sc.setPointerCapture(e.pointerId)}catch(_){}}
  var t=e.timeStamp||Date.now();if(t>lt){v=(e.clientX-lx)/(t-lt);lx=e.clientX;lt=t}
  sc.scrollLeft=wrap(l0-dx);e.preventDefault();
 }
 function up(e){
  end();var s=sc;sc=null;if(!s)return;
  if(!on)return;
  kill=Date.now();
  try{s.releasePointerCapture(e.pointerId)}catch(_){}
  try{s.dispatchEvent(new Event('wheel'))}catch(_){} // marquee(): пауза 9 с після дії
  var t=e.timeStamp||Date.now();if(t-lt>80)v=0;
  if(RM||Math.abs(v)<0.25){s.classList.remove('dg');return}
  var p=t;(function glide(ts){ // інерція: швидкість гасне ~0.3 с
   var dt=Math.min(32,(ts||p)-p);p=ts||p;s.scrollLeft=wrap(s.scrollLeft-v*dt);v*=Math.pow(0.992,dt*6);
   if(Math.abs(v)>0.02&&!sc)raf=W.requestAnimationFrame(glide);else s.classList.remove('dg');
  })(0);
 }
 d.addEventListener('pointerdown',function(e){
  if(e.pointerType!=='mouse'||e.button!==0||!e.target.closest)return;
  var s=e.target.closest(SEL);if(!s||s.scrollWidth<=s.clientWidth+8)return;
  if(e.target.closest('button,input,select,textarea,[contenteditable]'))return;
  if(raf){W.cancelAnimationFrame(raf);raf=0}
  var c=s.querySelector('.mq-c'),f=s.firstElementChild;half=c&&f&&c.parentNode===s?Math.abs(c.offsetLeft-f.offsetLeft):0;
  sg=((s.closest('[dir]')||{}).dir||'')==='rtl'?-1:1;
  sc=s;on=false;x0=lx=e.clientX;l0=s.scrollLeft;lt=e.timeStamp||Date.now();v=0;
  d.addEventListener('pointermove',move,true);d.addEventListener('pointerup',up,true);d.addEventListener('pointercancel',up,true);
 },true);
 // після перетягування — без переходу за посиланням і без рідного «перетягування» фото чи посилання
 d.addEventListener('click',function(e){if(Date.now()-kill<350&&e.target.closest&&e.target.closest(SEL)){e.preventDefault();e.stopPropagation()}},true);
 d.addEventListener('dragstart',function(e){if(e.target.closest&&e.target.closest(SEL))e.preventDefault()});
}
/* Курсор-супутник (ПК) і хвиля дотику (тач) — Михайло 20.11.2026 «прикольна анімація на мишку… і щоб з телефону теж класно».
   ПК (hover:hover і pointer:fine, вікно ≥ 1024 px): тонке золоте кільце .cur іде за курсором із запізненням (lerp у rAF, лише transform; цикл
   зупиняється, щойно кільце наздогнало курсор); рідний курсор не ховаємо. Над посиланнями й кнопками кільце більшає й заливається; над обкладинками
   й картками-посиланнями (стрічка, «Наші проєкти», «Що ми робимо», галерея лендингу) — «→» (RTL — «←», CSS), над фото з лайтбоксом — «+».
   Над полями форм, відео, картою, 3D, кадром сцени (у нього свої шеврони) кільце зникає; так само — коли курсор іде з вікна. Прокрутка без руху
   миші кільце не рухає (слухаємо лише pointermove). Тач (pointer:coarse): одна хвиля-кільце .tap від точки дотику на кнопках, картках і плитках —
   лише tap (без руху > 10 px; прокрутка дає pointercancel), 350 мс, перехід за посиланням не затримує. prefers-reduced-motion — нічого.
   Обидва елементи — aria-hidden, pointer-events:none, створюються один раз після load в idle (одна вставка в кінець body); далі в DOM нічого
   не додається (Web Animations). Стилі — site-chrome.v1.css (не критичні). /kabinet — без цього. */
function pointerFx(){
 if(RM||!W.matchMedia||!W.requestAnimationFrame||/^\/(?:[a-z]{2}\/)?(?:kabinet|tury\/)/.test(location.pathname))return;
 var fine=W.matchMedia('(hover:hover) and (pointer:fine)').matches,coarse=W.matchMedia('(pointer:coarse)').matches;
 if(!fine&&!coarse)return;
 var HIDE='input,textarea,select,video,iframe,canvas,[contenteditable],.maplibregl-map,.cmap,[data-cas-map],section.bz .bz-fig,section.bz svg,.clb,dialog',
  GO='.xs-st a[href],.xs-cv a[href],.xs-svc .xs-c,.gal figure',LINK='a[href],button,summary,label,[role=button]',
  TAP='.btn,.lq-go,.lq-b,.c-b,.cmp-more,.sch-cta,.mbar a,.mbar button,.la-tab a,.rel a,.xs-st a,.xs-cv a,.xs-svc .xs-c,.gal figure,[data-c="x"]';
 function mk(c){var e=d.createElement('div');e.className=c;e.setAttribute('aria-hidden','true');e.appendChild(d.createElement('i'));d.body.appendChild(e);return e}
 function kind(t){
  if(!t||!t.closest)return'';
  if(t.closest(HIDE))return'h';
  if(t.closest('a[data-lb]'))return'p';
  var g=t.closest(GO),a=t.closest(LINK);
  if(g){
   if(g.tagName==='A')return'g';
   var m=g.querySelector('h3>a[href],figcaption a[href]'); // картка «Що ми робимо» / фігура галереї: посилання розтягнуте на всю картку
   if(m&&(!a||a===m))return'g';
  }
  return a?'a':'';
 }
 function ring(){
  var el=mk('cur'),x=0,y=0,tx=0,ty=0,raf=0,on=0,st='',tg=null,dirty=0;
  function frame(){
   raf=0;
   if(dirty){dirty=0;var k=kind(tg);if(k!==st){st=k;el.classList.toggle('is-a',k==='a'||k==='g'||k==='p');if(k==='g'||k==='p')el.setAttribute('data-g',k);else el.removeAttribute('data-g');show(k!=='h')}}
   var dx=tx-x,dy=ty-y;
   if(Math.abs(dx)<.1&&Math.abs(dy)<.1){x=tx;y=ty}else{x+=dx*.22;y+=dy*.22;raf=W.requestAnimationFrame(frame)}
   el.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0)';
  }
  function show(v){if(v!==!!on){on=v?1:0;el.classList.toggle('is-on',v)}}
  d.addEventListener('pointermove',function(e){
   if(e.pointerType!=='mouse'||W.innerWidth<1024){if(on)show(false);return}
   tx=e.clientX;ty=e.clientY;tg=e.target;dirty=1;
   if(!on&&st!=='h'){x=tx;y=ty;show(true)} // перша поява — одразу під курсором, без «прильоту» з кута
   if(!raf)raf=W.requestAnimationFrame(frame);
  },{passive:true});
  function off(){show(false);st=''}
  d.documentElement.addEventListener('mouseleave',off);W.addEventListener('blur',off);
  d.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse')off()},{passive:true}); // дотик на гібридному екрані — кільце не лишається висіти
 }
 function ripple(){
  var el=mk('tap'),ri=el.firstChild,tg=null,sx=0,sy=0,id=-1;
  if(!ri.animate)return;
  d.documentElement.classList.add('tfx'); // натискання картки-посилання (site-chrome.v1.css) — разом із хвилею
  d.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse'||!e.isPrimary){tg=null;return}tg=e.target.closest?e.target.closest(TAP):null;sx=e.clientX;sy=e.clientY;id=e.pointerId},{passive:true});
  d.addEventListener('pointermove',function(e){if(tg&&e.pointerId===id&&(Math.abs(e.clientX-sx)>10||Math.abs(e.clientY-sy)>10))tg=null},{passive:true});
  d.addEventListener('pointercancel',function(){tg=null},{passive:true});
  d.addEventListener('pointerup',function(e){
   if(!tg||e.pointerId!==id)return;tg=null;
   el.style.transform='translate3d('+e.clientX.toFixed(0)+'px,'+e.clientY.toFixed(0)+'px,0)';
   ri.animate([{opacity:.95,transform:'scale(.3)'},{opacity:.7,transform:'scale(.78)',offset:.45},{opacity:0,transform:'scale(1)'}],{duration:350,easing:'ease-out'});
  },{passive:true});
 }
 function start(){(W.requestIdleCallback||function(f){setTimeout(f,200)})(function(){try{if(fine)ring();if(coarse)ripple()}catch(e){}},{timeout:2500})}
 if(d.readyState==='complete')start();else W.addEventListener('load',start);
}
/* Safari без scroll anchoring (20.11.2026): секції з content-visibility:auto (sections.v1.css) до першого показу мають висоту-заглушку
   (contain-intrinsic-size 640 px); справжня зʼявлялась, коли секція наближалась до екрана, — і вміст нижче стрибав на 90–240 px
   (перехід на якір, прокрутка вгору з низу сторінки). Після load кожну таку секцію міряємо окремою задачею й записуємо справжню висоту вмісту
   в contain-intrinsic-height; секція вище екрана — у тій самій задачі компенсуємо прокрутку (як keep() сцен). Зміна ширини вікна — перемір. */
function cvSize(){
 var list=$$('.xs-proj,.xs-strip,.xs-covers,.xs-svc');
 if(!list.length||!W.CSS||!CSS.supports||!CSS.supports('content-visibility','auto')||!CSS.supports('contain-intrinsic-height','auto 1px'))return;
 var q=[],busy=0,w0=W.innerWidth,t=0;
 function one(){
  var s=q.shift();if(!s){busy=0;return}
  var st=s.style,b0=s.getBoundingClientRect().bottom;
  st.contentVisibility='visible';
  var r=s.getBoundingClientRect(),cs=W.getComputedStyle(s),
   h=r.height-(parseFloat(cs.paddingTop)||0)-(parseFloat(cs.paddingBottom)||0)-(parseFloat(cs.borderTopWidth)||0)-(parseFloat(cs.borderBottomWidth)||0),dy=r.bottom-b0;
  if(h>0)st.containIntrinsicHeight='auto '+(Math.round(h*100)/100)+'px';
  st.contentVisibility='';
  if(b0<=0&&Math.abs(dy)>1){var hs=d.documentElement.style;hs.scrollBehavior='auto';W.scrollBy(0,dy);hs.scrollBehavior=''}
  setTimeout(one,0);
 }
 function all(){q=list.slice();if(!busy){busy=1;setTimeout(one,0)}}
 if(d.readyState==='complete')all();else W.addEventListener('load',all,{once:true});
 W.addEventListener('resize',function(){if(W.innerWidth===w0)return;w0=W.innerWidth;clearTimeout(t);t=setTimeout(all,250)},{passive:true});
}
// кожен блок — окремою задачею (TBT: на /portfolio одна задача була 140–170 мс на телефоні CPU ×4; аудит швидкості 16.11.2026)
function run(){var fs=[expanders,scrollers,imgFade,carousel,marquee,stripTap,dragScroll,heroSlides,pointerFx,cvSize];(function next(){var f=fs.shift();try{f()}catch(e){}if(fs.length)setTimeout(next,0)})()}
// Safari/WebKit запускає defer-скрипти до повного site-chrome.v1.css у кінці <body>: стрічки й каруселі міряють ширину — чекаємо на CSS (Chrome — одразу)
function css(go){var l=d.querySelector('link[href*="/assets/site-chrome.v1.css"]');if(!l||l.sheet)return go();var k=0,f=function(){if(!k++)go()};l.addEventListener('load',f);l.addEventListener('error',f);W.addEventListener('load',f)}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',function(){css(run)});else css(run);
})();
