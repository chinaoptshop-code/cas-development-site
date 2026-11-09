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
  fr:['Fermer','Photo précédente','Photo suivante','Menu'],zh:['关闭','上一张','下一张','菜单'],ar:['إغلاق','الصورة السابقة','الصورة التالية','القائمة']})[(d.documentElement.lang||'uk').slice(0,2)]||['Close','Previous photo','Next photo','Menu'];
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
   ~25 px/с безшовним колом (копія кадрів — aria-hidden, без фокуса), лише в кадрі (IntersectionObserver) і на видимій вкладці; пауза при наведенні,
   фокусі, тачі/колесі (9 с), кнопка ❚❚/▶ (44 px, aria-label); prefers-reduced-motion — статично. Висота блоку не змінюється (CLS 0). Михайло 03.11.2026. */
function marquee(){
 if(RM||!('IntersectionObserver' in W)||!W.requestAnimationFrame)return;
 var L=({uk:['Пауза прокрутки фото','Прокручувати фото'],ru:['Пауза прокрутки фото','Прокручивать фото'],en:['Pause photo scrolling','Play photo scrolling'],
  es:['Pausar desplazamiento de fotos','Reanudar desplazamiento de fotos'],zh:['暂停照片滚动','继续照片滚动'],pl:['Wstrzymaj przewijanie zdjęć','Wznów przewijanie zdjęć'],
  de:['Foto-Lauf anhalten','Foto-Lauf starten'],fr:['Mettre le défilement en pause','Relancer le défilement'],ar:['إيقاف تمرير الصور','تشغيل تمرير الصور']})[(d.documentElement.lang||'uk').slice(0,2)]||['Pause','Play'];
 var list=$$('.xs-st,.vgrid,.strip,.xs-cv,.hx-home~.xs-svc .xs-sv');if(!list.length)return;
 var st=d.createElement('style');
 st.textContent='.mq-bar{position:relative;height:0;z-index:3}.mq-ap{position:absolute;top:8px;inset-inline-end:8px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(191,145,72,.7);background:rgba(8,7,9,.62);color:#EDE8DF;font:600 13px/1 system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}.mq-ap:focus-visible{outline:2px solid #BF9148;outline-offset:2px}.mq-run{scroll-snap-type:none!important;scroll-behavior:auto!important}';
 d.head.appendChild(st);
 list.forEach(function(sc){
  if(sc.__mq)return;sc.__mq=1;
  var items=Array.prototype.filter.call(sc.children,function(c){return c.nodeType===1});
  if(items.length<3)return;
  var cl=[],half=0,pos=0,live=false,stop=false,hover=false,hold=0,raf=0,lt=0,tm=0,bar=null,btn=null,rtl=W.getComputedStyle(sc).direction==='rtl';
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
    $$('img',c).forEach(function(im){['srcset','src'].forEach(function(a){var v=im.getAttribute('data-mq-'+a);if(v!=null){im.removeAttribute('data-mq-'+a);im.setAttribute(a,v)}})})});
   bar=d.createElement('div');bar.className='mq-bar';btn=d.createElement('button');btn.type='button';btn.className='mq-ap';bar.appendChild(btn);
   sc.parentNode.insertBefore(bar,sc);lab();
   sc.classList.add('mq-run'); // без scroll-snap, поки стрічка рухається й на паузі: інакше на паузі кадр «відскакує» до краю
   btn.addEventListener('click',function(){stop=!stop;lab();if(!stop){hold=0;sync()}go()});
   return true;
  }
  function lab(){btn.setAttribute('aria-label',L[stop?1:0]);btn.title=L[stop?1:0];btn.innerHTML='<span aria-hidden="true">'+(stop?'▶':'❚❚')+'</span>';btn.setAttribute('aria-pressed',stop?'true':'false')}
  function measure(){half=Math.abs(cl[0].offsetLeft-items[0].offsetLeft)}
  function sync(){pos=Math.abs(sc.scrollLeft);measure();if(half&&pos>=half)pos-=half}
  function act(){return live&&!stop&&!hover&&!d.hidden&&Date.now()>=hold}
  function frame(ts){
   raf=0;if(!act()){lt=0;return}
   var dt=lt?Math.min(50,ts-lt):16;lt=ts;
   pos+=dt*0.025;if(half&&pos>=half)pos-=half;
   var r=W.devicePixelRatio||1,v=Math.round(pos*r)/r;sc.scrollLeft=rtl?-v:v;
   raf=W.requestAnimationFrame(frame);
  }
  function go(){clearTimeout(tm);if(act()){if(!raf){sync();raf=W.requestAnimationFrame(frame)}}else if(live&&!stop&&!hover&&Date.now()<hold)tm=setTimeout(go,hold-Date.now()+50)}
  function pause(ms){hold=Math.max(hold,Date.now()+ms);go()}
  sc.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse')hover=true});
  sc.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){hover=false;pause(600)}});
  ['touchstart','pointerdown','wheel'].forEach(function(n){sc.addEventListener(n,function(){pause(9000)},{passive:true})});
  sc.addEventListener('focusin',function(){hover=true});sc.addEventListener('focusout',function(){hover=false;pause(600)});
  d.addEventListener('visibilitychange',function(){go()});
  W.addEventListener('resize',function(){if(cl.length){measure();go()}},{passive:true});
  new IntersectionObserver(function(es){live=es[es.length-1].isIntersecting;if(live&&!setup())live=false;go()},{rootMargin:'0px 0px -10% 0px'}).observe(sc);
 });
}
/* Карусель «Наші проєкти» на головних (.xs-cv, Михайло 05.11.2026) і «Що ми робимо» на головних (.hx-home~.xs-svc .xs-sv, Михайло 08.11.2026):
   один ряд, scroll-snap, свайп/тачпад, кнопки ←/→ (44 px, aria-label) під рядом; автопрокрутка — marquee() вище (пауза при наведенні/тачі,
   кнопка ❚❚/▶; reduced-motion — статично). Натискання стрілки — пауза 9 с. Клас .cv-on знімає резерв місця під кнопки (sections.v1.css). */
function carousel(){
 var lg=(d.documentElement.lang||'uk').slice(0,2),
 LP=({uk:['Попередні проєкти','Наступні проєкти'],ru:['Предыдущие проекты','Следующие проекты'],en:['Previous projects','Next projects'],es:['Proyectos anteriores','Proyectos siguientes'],
  zh:['上一组项目','下一组项目'],pl:['Poprzednie projekty','Następne projekty'],de:['Vorherige Projekte','Nächste Projekte'],fr:['Projets précédents','Projets suivants'],ar:['المشاريع السابقة','المشاريع التالية']})[lg]||['Previous','Next'],
 LS=({uk:['Попередні послуги','Наступні послуги'],ru:['Предыдущие услуги','Следующие услуги'],en:['Previous services','Next services'],es:['Servicios anteriores','Servicios siguientes'],
  zh:['上一项服务','下一项服务'],pl:['Poprzednie usługi','Następne usługi'],de:['Vorherige Leistungen','Nächste Leistungen'],fr:['Services précédents','Services suivants'],ar:['الخدمات السابقة','الخدمات التالية']})[lg]||['Previous','Next'];
 $$('.xs-cv,.hx-home~.xs-svc .xs-sv').forEach(function(sc){
  if(sc.__cv)return;sc.__cv=1;
  var L=sc.classList.contains('xs-sv')?LS:LP;
  var nav=d.createElement('div');nav.className='cv-nav';
  [[-1,'←',L[0]],[1,'→',L[1]]].forEach(function(x){
   var b=d.createElement('button');b.type='button';b.className='cv-b';b.setAttribute('aria-label',x[2]);b.title=x[2];b.innerHTML='<span aria-hidden="true">'+x[1]+'</span>';
   b.addEventListener('click',function(){
    try{sc.dispatchEvent(new Event('wheel'))}catch(e){} // marquee(): пауза 9 с
    var cs=W.getComputedStyle(sc),it=sc.firstElementChild,step=it?it.getBoundingClientRect().width+(parseFloat(cs.columnGap)||12):sc.clientWidth*.8,rtl=cs.direction==='rtl';
    sc.scrollBy({left:x[0]*step*(rtl?-1:1),behavior:RM?'auto':'smooth'});
   });
   nav.appendChild(b);
  });
  sc.parentNode.insertBefore(nav,sc.nextSibling);sc.classList.add('cv-on');
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
  var q='(max-width:767px) and (orientation:portrait)';
  P.innerHTML='<source type="image/avif" media="'+q+'" srcset="'+set(x.n,x.m,'-m','avif')+'" sizes="100vw">'+
   '<source media="'+q+'" srcset="'+set(x.n,x.m,'-m','webp')+'" sizes="100vw">'+
   '<source type="image/avif" srcset="'+set(x.n,x.d,'','avif')+'" sizes="100vw">'+
   '<img src="/img/hs-'+x.n+'-'+x.d[0]+'.webp" srcset="'+set(x.n,x.d,'','webp')+'" sizes="100vw" alt="" decoding="async" width="2400" height="1200">';
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
function run(){[expanders,scrollers,imgFade,carousel,marquee,heroSlides].forEach(function(f){try{f()}catch(e){}})}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',run);else run();
})();
