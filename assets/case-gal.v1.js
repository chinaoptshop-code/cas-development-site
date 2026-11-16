/* Довгі галереї /proekty (tools/site/casegal.py): у HTML — перші 24 мініатюри, решта — JSON з посилання «Показати всі (N)» (a[data-gal]).
   Клік по кнопці або наближення прокрутки до кінця галереї (кнопка ще нижче екрана) — дописує решту тими самими атрибутами (клітинки 4:3 — без CLS).
   Лайтбокс — спільний /assets/lightbox.v1.js (tools/site/lbox.py): дійшли до останнього завантаженого фото — window.casGalMore() дописує JSON. */
(function(){
var d=document,W=window,btn=d.querySelector('a[data-gal]');if(!btn)return;
var g=btn.closest('section').querySelector('.pg'),N=+btn.getAttribute('data-gal')||0,P=null;
function links(){return Array.prototype.slice.call(g.querySelectorAll('a'))}
function load(){
 if(P)return P;
 btn.setAttribute('aria-busy','true');
 P=fetch(btn.getAttribute('href')).then(function(r){if(!r.ok)throw r.status;return r.json()}).then(function(j){
  var f=d.createDocumentFragment();
  j.p.forEach(function(x){var a=d.createElement('a'),i=d.createElement('img');a.href=x[0];a.setAttribute('data-lb',x[7]||'');
   i.loading='lazy';i.decoding='async';i.width=x[4];i.height=x[5];i.alt=x[6];if(x[3])i.sizes=x[3];if(x[2])i.srcset=x[2];i.src=x[1];a.appendChild(i);f.appendChild(a)});
  g.appendChild(f);var p=btn.parentNode;if(p)p.parentNode.removeChild(p);
 }).catch(function(){P=null;btn.removeAttribute('aria-busy')});
 return P;
}
btn.addEventListener('click',function(e){if(e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();var n=links().length;
 load().then(function(){var a=links()[n];if(a)a.focus()})});
// дозавантаження лише поки кнопка нижче екрана: швидка прокрутка вже показала CTA/«Інші проєкти» під галереєю — хвіст зсунув би їх (CLS 0,6–0,8; аудит 16.11.2026), тоді — кнопкою
if('IntersectionObserver' in W){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting&&x.boundingClientRect.top>=(W.innerHeight||d.documentElement.clientHeight)})){io.disconnect();load()}},{rootMargin:'0px 0px 700px 0px'});io.observe(btn)}
// лайтбокс — спільний /assets/lightbox.v1.js: гортає всі a[data-lb] сторінки, у кінці завантаженого — дописує хвіст через casGalMore()
W.casGalN=N;W.casGalMore=function(){return load()||Promise.resolve()};
})();
