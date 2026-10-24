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
 btnify(d.getElementById('lb-close'),'Закрити');
 btnify(d.getElementById('lb-prev'),'Попереднє фото');
 btnify(d.getElementById('lb-next'),'Наступне фото');
 btnify(d.getElementById('sdlb-close'),'Закрити');
 $$('.hamburger').forEach(function(h){btnify(h,'Меню')});
 $$('.sp-card[onclick]').forEach(function(c){btnify(c);syncExp(c,c,'exp')});
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
function reveal(){
 if(!('IntersectionObserver' in W))return;
 var sel='main section,body>section,.svc-prev,.proj-covers,.pcarousel,.sv-card,.proc-step,.geo-item,.about-vis,.about-txt,.card,.gal figure,.pg a,details,.prod-card,.benefit,.how-step,.cat-tile,.proj-row,.calc-wrap,.ct-layout,article>*';
 var vh=W.innerHeight||800,list=[],seen=new WeakSet();
 $$(sel).forEach(function(el){
  if(el.classList.contains('reveal')||el.querySelector('.reveal')||el.closest('.hero,.ph,#lb,#plb,nav,.nsb'))return;
  list.push(el);
 });
 var io=new IntersectionObserver(function(es){es.forEach(function(e){
  var el=e.target;
  if(!seen.has(el)){seen.add(el);if(e.isIntersecting||e.boundingClientRect.top<vh*.92){io.unobserve(el);return;}el.classList.add('rv');return;}
  if(!e.isIntersecting)return;io.unobserve(el);
  var sib=el.parentElement?Array.prototype.indexOf.call(el.parentElement.children,el)%4:0;
  el.style.transitionDelay=(sib*60)+'ms';el.classList.add('rv-in');
  setTimeout(function(){el.classList.remove('rv','rv-in');el.style.transitionDelay='';},700);
 })},{threshold:.08,rootMargin:'0px 0px -4% 0px'});
 list.forEach(function(el){io.observe(el)});
 setTimeout(function(){list.forEach(function(el){if(el.classList.contains('rv')&&!el.classList.contains('rv-in')){var b=el.getBoundingClientRect();if(b.top<vh&&b.bottom>0)el.classList.add('rv-in');}})},2500);
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
function run(){[expanders,scrollers,reveal,imgFade].forEach(function(f){try{f()}catch(e){}})}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',run);else run();
})();
