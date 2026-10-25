/* Оздоба — каталог CAS Development. Дані: /assets/ozdoba/catalog.json (tools/products/). */
const S = (b) => '<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + b + '</svg>';
let DATA, ART = {};
const fallback = S('<rect x="20" y="20" width="60" height="42" rx="5"/>');
/* фото товару (вирізаний обʼєкт, webp з прозорістю) або лінійна іконка, поки фото немає */
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function pic(i, big, base){
  const b = base || i.img;
  if (b) return big
    ? `<img src="/${b}-800.webp" width="800" height="800" alt="${esc(i.name)}" decoding="async">`
    : `<img src="/${b}-400.webp" srcset="/${b}-400.webp 400w, /${b}-800.webp 800w" sizes="(min-width:900px) 240px, 46vw" width="400" height="400" alt="${esc(i.name)}" loading="lazy" decoding="async">`;
  return ART[i.art] || fallback;
}

/* ===================== стан ===================== */
let IT = [], BU = [];
let venue='all', tab='catalog', cat='Усе', query='';
const fav = new Set();
let cart = [];                 // {id,ci,si,qty}
let promo = null;              // особистий код партнера: {code,pct} — перевіряє POST /api/promo/check
let promoErr = '';
let payMethod = 'card';
let cur=null, curC=0, curS=0, curQ=1;   // відкритий товар
let bq = {};                   // кількості в комплекті

const byId = id => IT.find(i => i.id === id);
const CS = i => DATA.colorsets[i.cs];
const SS = i => i.ss ? DATA.sizesets[i.ss] : null;
const defS = i => { const s = SS(i); if(!s) return 0; const n = s.findIndex(x=>x[1]===1); return n<0?0:n; };
const r10 = n => Math.round(n/10)*10;
/* price: null — «ціна за запитом» (позиція йде в заявку, сума уточнюється менеджером) */
function price(i, ci=0, si=null){
  if (i.price == null) return null;
  const s = SS(i), k = s ? s[si==null?defS(i):si][1] : 1;
  return r10(i.price * k * (1 + CS(i)[ci][2]));
}
const minP = i => { if(i.price==null) return null; const s=SS(i); return s ? r10(i.price*Math.min(...s.map(x=>x[1]))) : price(i); };
const money = n => n==null ? 'за запитом' : new Intl.NumberFormat('uk-UA').format(Math.round(n)) + ' ₴';

/* світлішаємо темні кольори, щоб лінійна графіка лишалась читаною на темному тлі */
function vis(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  const L=(.299*r+.587*g+.114*b)/255;
  if(L>=.38) return hex;
  const m=t=>Math.round(t+(168-t)*(.38-L)/.38);
  return '#'+[m(r),m(g),m(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

/* ===================== іконки приміщень ===================== */
const V = b => '<svg viewBox="0 0 24 24">'+b+'</svg>';
const VICON = {
 all:    V('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
 resto:  V('<path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10"/><path d="M17 3c-2 2-2 8 0 8v10"/>'),
 hotel:  V('<path d="M3 18v-7h18v7M3 18v2M21 18v2M3 11V7"/><path d="M7 11V9h5v2"/><circle cx="6" cy="6.5" r="1.5"/>'),
 apt:    V('<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>'),
 office: V('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3"/>'),
 shop:   V('<path d="M4 8h16l-1.4 12H5.4z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
 cafe:   V('<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 3v2M12 3v2"/>'),
 beauty: V('<circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.7 16 18 4M15.3 16 6 4"/>'),
 spa:    V('<path d="M12 21c-4 0-7-3-7-7 0-4 7-11 7-11s7 7 7 11c0 4-3 7-7 7z"/><path d="M12 17c-1.7 0-3-1.3-3-3"/>')
};

/* ===================== Telegram ===================== */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg){ try{ tg.ready(); tg.expand(); tg.setHeaderColor && tg.setHeaderColor('#17120E'); }catch(e){} }
function haptic(t){ try{ if(!tg||!tg.HapticFeedback) return;
  t==='success' ? tg.HapticFeedback.notificationOccurred('success') : tg.HapticFeedback.impactOccurred('light'); }catch(e){} }

/* ===================== рендер каркаса ===================== */
function venueCount(v){ return v==='all' ? IT.length : IT.filter(i=>i.vn.includes(v)).length; }
function renderVenues(){
  document.getElementById('venues').innerHTML = DATA.venues.map(([v,label])=>`
    <button class="venue" aria-pressed="${v===venue}" onclick="setVenue('${v}')">
      ${VICON[v]}<b>${label}</b><em>${venueCount(v)} позицій</em></button>`).join('');
}
function setVenue(v){ venue=v; cat='Усе'; renderVenues(); renderChips(); render(); window.scrollTo({top:0,behavior:'smooth'}); }

function pool(){ return venue==='all' ? IT : IT.filter(i=>i.vn.includes(venue)); }
function cats(){ return ['Усе', ...[...new Set(pool().map(i=>i.cat))]]; }
function renderChips(){
  document.getElementById('chips').innerHTML = cats().map(c=>
    `<button class="chip" aria-pressed="${c===cat}" onclick="setCat('${c}')">${c}</button>`).join('');
}
function setCat(c){ cat=c; renderChips(); renderGrid(); }

function setTab(t){
  tab=t;
  ['catalog','bundles','fav'].forEach(k=>{
    document.getElementById('view'+k[0].toUpperCase()+k.slice(1)).hidden = (k!==t);
    document.getElementById('tab'+k[0].toUpperCase()+k.slice(1)).setAttribute('aria-pressed', k===t);
  });
  render(); syncMore();
}

function toggleSearch(){
  const w=document.getElementById('searchwrap'), on=w.classList.toggle('on');
  document.getElementById('btnSearch').classList.toggle('on', on);
  if(on) document.getElementById('q').focus();
  else { query=''; document.getElementById('q').value=''; render(); }
}
function onSearch(){ query=document.getElementById('q').value.trim().toLowerCase(); if(tab!=='catalog') setTab('catalog'); else renderGrid(); }

/* ===================== картки ===================== */
function cardHTML(i){
  const s=SS(i), from = s ? 'від ' : '';
  return `<article class="card" onclick="openItem(${i.id})">
    <div class="tile${i.img?' ph':''}">${pic(i)}
      <button type="button" class="heart ${fav.has(i.id)?'on':''}" data-fav="${i.id}" onclick="event.stopPropagation();toggleFav(${i.id})" aria-label="В обране" aria-pressed="${fav.has(i.id)}">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg></button>
    </div>
    <div class="body">
      <div class="sub">${i.sub}</div>
      <a class="nm" href="/ozdoba/${i.slug}" onclick="event.preventDefault()" style="color:inherit;text-decoration:none">${i.name}</a>
      <div class="sw">${CS(i).slice(0,5).map(c=>`<i style="background:${c[1]}"></i>`).join('')}</div>
      <div class="pr">${i.price==null?'Ціна за запитом':`${from}${money(minP(i))} <small>/ ${i.unit}</small>`}</div>
    </div></article>`;
}
/* Сітка рендериться частинами по CHUNK карток: перші 24 вже є в HTML (tools/products/build.py), решту
   дорендерюємо, коли користувач підходить до кінця сітки (IntersectionObserver, у простої — requestIdleCallback),
   або кнопкою «Показати ще». Так головний потік не блокується відмальовуванням усіх 235 карток. */
const CHUNK = 24;
let LIST = [], shown = 0, moreIO = null;
function gridList(){
  let list = pool();
  if(cat!=='Усе') list = list.filter(i=>i.cat===cat);
  if(query) list = list.filter(i=>(i.name+' '+i.sub+' '+i.en+' '+i.desc).toLowerCase().includes(query));
  const s=document.getElementById('sort').value;
  const ord={A:0,B:1,C:2};
  return [...list].sort((a,b)=>
    s==='asc'? (minP(a)??1e12)-(minP(b)??1e12) : s==='desc'? (minP(b)??-1)-(minP(a)??-1) :
    s==='az'?  a.name.localeCompare(b.name,'uk') : (ord[a.prio]-ord[b.prio])||((minP(b)??0)-(minP(a)??0)));
}
function renderGrid(){
  LIST = gridList(); shown = 0;
  document.getElementById('cnt').textContent = LIST.length ? `${LIST.length} позицій` : '';
  const g=document.getElementById('grid');
  if(!LIST.length){ g.innerHTML=`<div class="empty" style="grid-column:1/-1">Нічого не знайшли. Спробуйте інше слово або зніміть фільтр приміщення.</div>`; syncMore(); return; }
  g.innerHTML=''; showMore();
}
function showMore(){
  const next=LIST.slice(shown, shown+CHUNK);
  if(next.length) document.getElementById('grid').insertAdjacentHTML('beforeend', next.map(cardHTML).join(''));
  shown+=next.length; syncMore();
}
let moreQ=0;
function queueMore(){ // наступна порція — у вільний час браузера
  if(moreQ||shown>=LIST.length) return; moreQ=1;
  const go=()=>{ moreQ=0; showMore(); };
  window.requestIdleCallback ? requestIdleCallback(go,{timeout:600}) : setTimeout(go,60);
}
function syncMore(){
  const b=document.getElementById('more'); if(!b) return;
  const left=LIST.length-shown;
  b.hidden = left<=0 || tab!=='catalog';
  b.textContent = `Показати ще ${Math.min(left,CHUNK)} з ${left}`;
  if(!moreIO && 'IntersectionObserver' in window){
    moreIO=new IntersectionObserver(es=>{ if(es.some(e=>e.isIntersecting)) queueMore(); },{rootMargin:'0px 0px 900px 0px'});
    moreIO.observe(b);
  }
  if(moreIO && !b.hidden){ moreIO.unobserve(b); moreIO.observe(b); } // повторна перевірка після нової порції
}
function syncHearts(id){
  document.querySelectorAll(id==null?'[data-fav]':`[data-fav="${id}"]`).forEach(b=>{
    const on=fav.has(+b.dataset.fav); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
}
function renderFav(){
  const list = IT.filter(i=>fav.has(i.id));
  document.getElementById('favGrid').innerHTML = list.length ? list.map(cardHTML).join('')
    : `<div class="empty" style="grid-column:1/-1">Обране порожнє.<br>Тисніть сердечко на картці — позиції збережуться тут, щоб зібрати добірку для клієнта.</div>`;
}
function toggleFav(id){
  fav.has(id) ? fav.delete(id) : fav.add(id);
  haptic(); syncBadges(); syncHearts(id); if(tab==='fav') renderFav();
  toast(fav.has(id) ? 'Додано в обране' : 'Прибрано з обраного');
}

/* ===================== комплекти ===================== */
function bundleTotal(b, qty){
  return b.rows.reduce((s,r,n)=>{ const q = qty ? (qty[n] ?? r.q) : r.q; return s + price(byId(r.id),0,defS(byId(r.id)))*q; },0);
}
/* ціна комплекту = сума позицій × кількість; окремої знижки на комплект немає — діє загальна знижка за обсягом у кошику */
function kitPics(b){ return b.rows.map(r=>byId(r.id)).filter(i=>i&&i.img).slice(0,4)
  .map(i=>`<img src="/${i.img}-400.webp" width="400" height="400" alt="${esc(i.name)}" loading="lazy" decoding="async">`).join(''); }
function renderBundles(){
  const list = venue==='all' ? BU : BU.filter(b=>b.venue===venue);
  document.getElementById('blist').innerHTML = list.length ? list.map(b=>{
    const t=bundleTotal(b);
    return `<article class="bcard${b.premium?' prem':''}" role="button" tabindex="0" aria-label="${esc(b.name)}" onclick="openBundle('${b.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openBundle('${b.id}')}">
      <div class="art${b.premium?' kcol':''}">${b.premium?kitPics(b):(ART[b.art]||'')}</div>
      <div class="info"><h3>${b.name}</h3><div class="note">${b.note}</div>
        <div class="pr">${money(t)}</div></div></article>`;
  }).join('') : `<div class="empty">Для цього типу приміщення готового комплекту ще немає. Зберіть з каталогу — або напишіть нам, порахуємо під ваш обʼєкт.</div>`;
}
function openBundle(id){
  const b=BU.find(x=>x.id===id); bq={}; b.rows.forEach((r,n)=>bq[n]=r.q);
  renderBundle(id); open('sheetBundle');
}
function renderBundle(id){
  const b=BU.find(x=>x.id===id);
  const t=bundleTotal(b,bq), vp=volPct(t);
  const n0=b.rows.filter((r,n)=>bq[n]>0).length;
  paint('bundleBody', `
    <div class="sh-head"><h2>${b.name}</h2><button type="button" class="x" onclick="closeAll()" aria-label="Закрити">✕</button></div>
    <p class="desc">${b.note} Кількості — орієнтовні, міняйте під свій обʼєкт: позиція з нулем у комплект не піде.</p>
    ${b.rows.map((r,n)=>{ const i=byId(r.id); return `
      <div class="ci">
        <div class="art${i.img?' ph':''}">${pic(i)}</div>
        <div class="info"><b>${i.name}</b><em>${money(price(i,0,defS(i)))} / ${i.unit}</em></div>
        <div class="right">
          <span class="s">${i.price==null?money(null):money(price(i,0,defS(i))*(bq[n]||0))}</span>
          <div class="qty sm"><button type="button" onclick="bqSet('${id}',${n},-1)" aria-label="Менше: ${esc(i.name)}">−</button><span aria-live="polite">${bq[n]||0}</span><button type="button" onclick="bqSet('${id}',${n},1)" aria-label="Більше: ${esc(i.name)}">+</button></div>
        </div></div>`; }).join('')}
    <div class="sum total"><span>Разом, ${n0} позицій</span><span>${money(t)}</span></div>
    ${vp?`<div class="sum disc"><span>Знижка за обсягом −${vp}% у кошику</span><span>−${money(Math.round(t*vp/100))}</span></div>`:''}
    <p class="note-honest">Ціна — сума позицій каталогу. ${VOLTXT} — рахується в кошику на всю суму товарів. Поставка з Китаю 30–60 днів, рахунок для ФОП і ТОВ.${b.premium?' Точну суму під ваш обʼєкт менеджер підтвердить після заявки.':''}</p>
    <button class="btn" onclick="addBundle('${id}')">${b.premium?'Додати весь комплект у кошик':'Додати комплект у кошик'}</button>
    ${b.premium?`<a class="btn ghost" style="text-decoration:none" href="/ozdoba/komplekty?kit=${b.id}#zayavka">Запит розрахунку під мій обʼєкт</a>`:''}`);
}
function bqSet(id,n,dd){ bq[n]=Math.max(0,(bq[n]||0)+dd); renderBundle(id); }
function addBundle(id){
  const b=BU.find(x=>x.id===id); let added=0;
  b.rows.forEach((r,n)=>{ const q=bq[n]||0; if(!q) return;
    const i=byId(r.id), si=defS(i);
    const ex=cart.find(c=>c.id===i.id&&c.ci===0&&c.si===si);
    ex ? ex.qty+=q : cart.push({id:i.id,ci:0,si,qty:q}); added++;
  });
  if(!added){ toast('Усі позиції на нулі — нічого додавати'); return; }
  haptic('success'); closeAll(); syncBadges(); toast(b.premium?`Комплект «${b.name}» у кошику: ${added} позицій`:`Комплект додано: ${added} позицій`);
}
/* «Додати весь комплект у кошик» із секції /ozdoba і з /ozdoba/komplekty (#kit-k1) — кількості за замовчуванням */
function addKit(id){
  const b=BU.find(x=>x.id===id); if(!b) return;
  bq={}; b.rows.forEach((r,n)=>bq[n]=r.q); addBundle(id); openCart();
}

/* ===================== картка товару ===================== */
function openItem(id){ cur=byId(id); if(!cur) return; curC=0; curS=defS(cur); curQ=1; renderItem(); open('sheetItem'); try{history.replaceState(null,'','#p-'+id);}catch(e){} }
function renderItem(){
  const i=cur, cs=CS(i), s=SS(i);
  const p=price(i,curC,curS), part=Math.ceil(p*curQ/4);
  paint('itemBody', `
    <div class="sh-head"><h2>${i.name}</h2><button type="button" class="x" onclick="closeAll()" aria-label="Закрити">✕</button></div>
    <div class="it-grid"><div class="it-media">
    ${gallery(i, cs[curC][1])}
    </div><div class="it-info">
    <p class="desc">${i.desc}</p>
    <div class="meta"><span class="tag">${i.sub}</span><span class="tag">Ціна за 1 ${i.unit}</span><span class="tag">Поставка 30–60 днів</span></div>

    <p class="lbl">Колір і фактура <b>${cs[curC][0]}</b></p>
    <div class="swatches">${cs.map((c,n)=>`<button class="swatch" style="background:${c[1]}" aria-pressed="${n===curC}" title="${c[0]}" aria-label="${c[0]}" onclick="setC(${n})"></button>`).join('')}</div>

    ${s ? `<p class="lbl">Розмір <b>${s[curS][0]}</b></p>
    <div class="opts">${s.map((x,n)=>`<button class="opt" aria-pressed="${n===curS}" onclick="setS(${n})">${x[0]}${i.price==null?'':`<small>${money(price(i,curC,n))}</small>`}</button>`).join('')}</div>` : ''}

    <p class="lbl">Кількість</p>
    <div class="qty"><button type="button" onclick="setQ(-1)" aria-label="Менше">−</button><span aria-live="polite">${curQ}</span><button type="button" onclick="setQ(1)" aria-label="Більше">+</button></div>

    ${p==null?`<div class="priceline"><span class="big">Ціна за запитом</span></div><p class="hint">Додайте в кошик — менеджер назве ціну й строк разом з рештою позицій.</p>`
    :`<div class="priceline"><span class="big">${money(p*curQ)}</span>${curQ>1?`<span class="per">${money(p)} × ${curQ}</span>`:''}</div>
    <p class="hint">Або ${money(part)} × 4 платежі без переплати</p>`}
    <div class="btn2">
      <button type="button" class="btn ghost" style="flex:0 0 56px" onclick="toggleFav(${i.id});renderItem()" aria-label="В обране" aria-pressed="${fav.has(i.id)}">${fav.has(i.id)?'♥':'♡'}</button>
      <button class="btn" style="flex:1" onclick="addToCart()">Додати в кошик</button>
    </div>
    ${i.specs&&i.specs.length?`<p class="lbl" style="margin-top:20px">Характеристики</p><dl class="specs">${i.specs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:''}
    <button class="share" onclick="shareItem()">Поділитися позицією</button>
    </div></div>`);
}
function gallery(i, col){
  const all = i.img ? [i.img, ...(i.imgs||[])] : [];
  if (!all.length) return `<div class="hero-art"><span style="color:${vis(col)};display:contents">${pic(i,true)}</span></div>`;
  return `<div class="hero-art ph${all.length>1?' multi':''}" id="gal" tabindex="0" role="region" aria-label="Фото товару">${all.map(b=>`<figure>${pic(i,true,b)}</figure>`).join('')}</div>`
    + (all.length>1 ? `<div class="dots">${all.map((b,n)=>`<button aria-label="Фото ${n+1}" onclick="galGo(${n})"></button>`).join('')}</div>` : '');
}
function galGo(n){ const g=document.getElementById('gal'); if(g) g.scrollTo({left:g.clientWidth*n,behavior:'smooth'}); }
function shareItem(){
  const u = location.origin + location.pathname + '#p-' + cur.id;
  if (navigator.share) navigator.share({title: cur.name, url: u}).catch(()=>{});
  else if (navigator.clipboard) navigator.clipboard.writeText(u).then(()=>toast('Посилання скопійовано'));
}
function setC(n){ curC=n; renderItem(); }
function setS(n){ curS=n; renderItem(); }
function setQ(d){ curQ=Math.max(1,curQ+d); renderItem(); }
function addToCart(){
  const ex=cart.find(c=>c.id===cur.id&&c.ci===curC&&c.si===curS);
  ex ? ex.qty+=curQ : cart.push({id:cur.id,ci:curC,si:curS,qty:curQ});
  haptic(); closeAll(); syncBadges(); toast(`${cur.name} — додано`);
}

/* ===================== кошик ===================== */
const lineSum = c => { const p=price(byId(c.id),c.ci,c.si); return p==null?null:p*c.qty; };
const onReq = () => cart.filter(c=>byId(c.id).price==null).length;
const goods = () => cart.reduce((s,c)=>s+(lineSum(c)||0),0);
const count = () => cart.reduce((s,c)=>s+c.qty,0);
/* Знижка за обсягом: пороги суми товарів (до доставки) — catalog.json volume_discounts, ті самі перераховує сервер
   (functions/api/orders.js). Особистий код партнера з нею не сумується: діє більша. */
const VOL = () => (DATA && DATA.volume_discounts) || [];
const volPct = g => VOL().reduce((p,[t,pc]) => g>=t ? Math.max(p,pc) : p, 0);
const usd = n => '$' + new Intl.NumberFormat('uk-UA').format(Math.round(n/46/100)*100);  // 230 000 ₴ ≈ $5 000
const VOLTXT_ = () => 'Знижка за обсягом: ' + VOL().map(([t,pc])=>`від ${usd(t)} — ${pc}%`).join(', ');
let VOLTXT = '';
function disc(){ const g=goods(), v=volPct(g), p=promo?promo.pct:0;
  return p>v ? {kind:'partner',pct:p,code:promo.code} : v ? {kind:'volume',pct:v} : null; }
const discount = () => { const d=disc(); return d ? Math.round(goods()*d.pct/100) : 0; };
const discLabel = d => d.kind==='partner' ? `Знижка партнера ${d.code} −${d.pct}%` : `Знижка за обсягом −${d.pct}%`;
/* підказка «Ще Y ₴ до знижки Z%», коли до наступного порогу лишилось менше 25% */
function volHint(){ const g=goods(), cur=disc(), n=VOL().find(([t,pc])=>g<t && pc>(cur?cur.pct:0));
  return n && n[0]-g < n[0]*0.25 ? `Ще ${money(n[0]-g)} до знижки ${n[1]}%` : ''; }
const ship = () => (goods()-discount()) > 20000 ? 0 : 450;
const grand = () => goods()-discount()+ship();
/* Оздоба комплектує обʼєкти: поштучно не продаємо, мінімальне замовлення ≈ $500 */
const MIN_ORDER = 23000;
const belowMin = () => !onReq() && goods()-discount() < MIN_ORDER;

function save(){ try{ localStorage.setItem('ozd-cart',JSON.stringify(cart)); localStorage.setItem('ozd-fav',JSON.stringify([...fav])); }catch(e){} }
function syncBadges(){ save();
  const n=count(), f=fav.size;
  const cb=document.getElementById('cartBadge'); cb.hidden=!n; cb.textContent=n;
  const fb=document.getElementById('favBadge'); fb.hidden=!f; fb.textContent=f;
  document.getElementById('barTxt').textContent = n ? `Кошик · ${n} шт · ${money(grand())}` : 'Кошик';
  document.getElementById('bar').classList.toggle('show', n>0);
  if(tg&&tg.MainButton){ if(n){ tg.MainButton.setText(`Кошик · ${money(grand())}`); tg.MainButton.show(); } else tg.MainButton.hide(); }
}
function openCart(){ renderCart(); open('sheetCart'); }
function renderCart(){
  const el=document.getElementById('cartBody');
  if(!cart.length){
    paint('cartBody', `<div class="sh-head"><h2>Кошик</h2><button type="button" class="x" onclick="closeAll()" aria-label="Закрити">✕</button></div>
      <div class="empty">Порожньо. Оберіть позиції в каталозі або візьміть готовий комплект під ваш тип приміщення.</div>
      <button class="btn ghost" onclick="closeAll();setTab('bundles')">Дивитись комплекти</button>`);
    return;
  }
  paint('cartBody', `
    <div class="sh-head"><h2>Кошик</h2><button type="button" class="x" onclick="closeAll()" aria-label="Закрити">✕</button></div>
    ${cart.map((c,n)=>{ const i=byId(c.id), s=SS(i);
      return `<div class="ci">
        <div class="art${i.img?' ph':''}"><span style="color:${vis(CS(i)[c.ci][1])};display:contents">${pic(i)}</span></div>
        <div class="info"><b>${i.name}</b><em>${CS(i)[c.ci][0]}${s?' · '+s[c.si][0]:''} · ${money(price(i,c.ci,c.si))}/${i.unit}</em>
          <div class="qty sm" style="margin-top:6px"><button type="button" onclick="cq(${n},-1)" aria-label="Менше: ${esc(i.name)}">−</button><span aria-live="polite">${c.qty}</span><button type="button" onclick="cq(${n},1)" aria-label="Більше: ${esc(i.name)}">+</button></div></div>
        <div class="right"><span class="s">${money(lineSum(c))}</span><button class="rm" onclick="rm(${n})">Прибрати</button></div>
      </div>`; }).join('')}
    <div class="promo">
      <input id="promoIn" placeholder="Код партнера" aria-label="Код партнера (для дизайнерів і архітекторів)" autocomplete="off" autocapitalize="characters" value="${promo?esc(promo.code):''}" onkeydown="if(event.key==='Enter')applyPromo()">
      <button type="button" onclick="applyPromo()">Застосувати</button>
    </div>
    ${promoErr?`<p class="note-honest" role="alert" style="color:#e07a6a;margin-top:0">${esc(promoErr)}</p>`
      :promo&&disc()&&disc().kind!=='partner'?`<p class="note-honest" style="margin-top:0">Код ${esc(promo.code)} прийнято (−${promo.pct}%). Знижки не сумуються — діє більша, за обсягом.</p>`:''}
    <div class="sum"><span>Товари, ${count()} шт</span><span>${money(goods())}</span></div>
    ${disc()?`<div class="sum disc"><span>${discLabel(disc())}</span><span>−${money(discount())}</span></div>`:''}
    ${volHint()?`<p class="note-honest" style="margin:2px 0 6px;color:var(--glow)">${volHint()}</p>`:''}
    <div class="sum"><span>Доставка по Україні</span><span>${ship()?money(ship()):'безкоштовно'}</span></div>
    ${onReq()?`<div class="sum"><span>Позицій за запитом: ${onReq()}</span><span>ціну назве менеджер</span></div>`:''}
    <div class="sum total"><span>${onReq()?'Сума відомих позицій':'До сплати'}</span><span>${money(grand())}</span></div>
    ${belowMin()?`<p class="note-honest" style="color:var(--glow)">Мінімальне замовлення — ${money(MIN_ORDER)} (≈ $500): ми комплектуємо обʼєкти й не продаємо поштучно. Додайте позиції або візьміть готовий комплект.</p>
    <button class="btn ghost" onclick="closeAll();setTab('bundles')">Дивитись комплекти</button>`
    :`<button class="btn" onclick="openPay()">Оформити замовлення</button>`}
    <button class="btn ghost" onclick="copyEstimate()">Скопіювати кошторис</button>`);
}
function cq(n,d){ cart[n].qty+=d; if(cart[n].qty<1) cart.splice(n,1); haptic(); syncBadges(); renderCart(); }
function rm(n){ cart.splice(n,1); haptic(); syncBadges(); renderCart(); }
/* особистий код партнера (дизайнер, архітектор): перевіряє сервер, список кодів не розкривається */
async function applyPromo(){
  const v=(document.getElementById('promoIn').value||'').trim().toUpperCase();
  promoErr='';
  if(!v){ promo=null; syncBadges(); renderCart(); return; }
  let d=null;
  try{ const r=await fetch('/api/promo/check',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:v})});
       d=await r.json().catch(()=>null); }catch(e){}
  if(d&&d.ok){ promo={code:d.code||v,pct:d.discount}; toast(`Код партнера прийнято: −${d.discount}%`); }
  else { promo=null; promoErr=(d&&d.error)||'Не вдалося перевірити код — спробуйте пізніше'; toast(promoErr); }
  syncBadges(); renderCart();
}
function copyEstimate(){
  const lines=cart.map(c=>{ const i=byId(c.id), s=SS(i);
    return `${i.name} — ${CS(i)[c.ci][0]}${s?', '+s[c.si][0]:''} — ${c.qty} ${i.unit} × ${money(price(i,c.ci,c.si))} = ${money(lineSum(c))}`; });
  const txt=['КОШТОРИС · Оздоба','',...lines,'',
    `Товари: ${money(goods())}`, disc()?`${discLabel(disc())}: −${money(discount())}`:null,
    `Доставка: ${ship()?money(ship()):'безкоштовно'}`,`РАЗОМ: ${money(grand())}`].filter(Boolean).join('\n');
  const done=()=>toast('Кошторис у буфері обміну');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,()=>fb());
  else fb();
  function fb(){ const t=document.createElement('textarea'); t.value=txt; document.body.appendChild(t); t.select();
    try{document.execCommand('copy');done();}catch(e){toast('Не вдалось скопіювати');} t.remove(); }
}

/* ===================== оплата ===================== */
function openPay(){ if(belowMin()){ toast('Мінімальне замовлення — '+money(MIN_ORDER)); return; } renderPay(); close('sheetCart'); setTimeout(()=>open('sheetPay'),130); }
function renderPay(){
  const g=grand(), part=Math.ceil(g/4);
  const u=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.user;
  const nm=esc(acct&&acct.name||(u?[u.first_name,u.last_name].filter(Boolean).join(' '):''));
  paint('payBody', `
    <div class="sh-head"><h2>Оформлення заявки</h2><button type="button" class="x" onclick="closeAll()" aria-label="Закрити">✕</button></div>
    <div class="field"><label for="fName">Ім'я та прізвище</label><input id="fName" autocomplete="name" value="${nm}" placeholder="Ваше імʼя та прізвище"></div>
    <div class="field"><label for="fPhone">Телефон</label><input id="fPhone" autocomplete="tel" type="tel" inputmode="tel" placeholder="+380 __ ___ __ __" value="${esc(acct&&acct.phone||'')}"></div>
    <div class="field"><label for="fNp">Місто і відділення Нової Пошти</label><input id="fNp" placeholder="Київ, відділення №12" value="${esc(acct&&acct.city||'')}"></div>
    ${payMethod==='invoice'?`<div class="field"><label for="fEdr">Назва компанії та ЄДРПОУ</label><input id="fEdr" placeholder="ТОВ «Приклад», 12345678" value="${esc(acct&&acct.company||'')}"></div>`:''}

    <p class="lbl" style="margin-top:18px">Як вам зручніше оплатити</p>
    <button class="pay" aria-pressed="${payMethod==='card'}" onclick="setPay('card')"><span class="dot"></span>
      <span><b>Карткою онлайн</b><small>Посилання на оплату надішле менеджер після підтвердження наявності.</small></span></button>
    <button class="pay" aria-pressed="${payMethod==='parts'}" onclick="setPay('parts')"><span class="dot"></span>
      <span><b>Оплата частинами</b><small>Орієнтовно ${money(part)} × 4 платежі — умови підтвердить менеджер.</small>
      <span class="banks"><i style="background:#8CC63E"></i><i style="background:#101010"></i><i style="background:#E30613"></i></span></span></button>
    <button class="pay" aria-pressed="${payMethod==='invoice'}" onclick="setPay('invoice')"><span class="dot"></span>
      <span><b>Рахунок для ФОП або ТОВ</b><small>Безготівковий розрахунок з ПДВ, закривні документи. Відвантаження після зарахування.</small></span></button>
    <button class="pay" aria-pressed="${payMethod==='cod'}" onclick="setPay('cod')"><span class="dot"></span>
      <span><b>При отриманні</b><small>Наложений платіж. Комісія перевізника 20 ₴ + 2%. Для замовлень до 20 000 ₴.</small></span></button>

    <div class="sum total"><span>Орієнтовна сума</span><span>${money(g)}</span></div>
    <button class="btn" id="sendBtn" onclick="pay()">Надіслати заявку</button>
    <p class="note-honest">Це заявка, а не оплата: гроші зараз не списуються. Менеджер зателефонує, підтвердить наявність,
      ціну й строк поставки і надішле рахунок або посилання на оплату.</p>`);
}
function setPay(m){ payMethod=m; renderPay(); }
async function pay(){
  const v=id=>((document.getElementById(id)||{}).value||'').trim();
  const nm=v('fName'), ph=v('fPhone'), np=v('fNp'), edr=v('fEdr');
  if(!cart.length){ toast('Кошик порожній — додайте товари з каталогу'); return; }
  if(!nm||ph.replace(/\D/g,'').length<9){ toast('Вкажіть імʼя і телефон — інакше ми не зможемо звʼязатися'); return; }
  const g=grand(), ord='OZD-'+Date.now().toString().slice(-7);
  const PM={cod:'при отриманні',parts:'частинами',invoice:'рахунок ФОП/ТОВ',card:'карткою онлайн'};
  const lines=cart.map(c=>{ const i=byId(c.id), s=SS(i);
    return `• ${i.name} — ${CS(i)[c.ci][0]}${s?', '+s[c.si][0]:''} — ${c.qty} ${i.unit} × ${money(price(i,c.ci,c.si))} = ${money(lineSum(c))}`; });
  const message=[`Замовлення ${ord} з Оздоби`,...lines,
    `Товари: ${money(goods())}`, disc()?`${discLabel(disc())}: −${money(discount())}`:null,
    promo&&disc()&&disc().kind!=='partner'?`Код партнера ${promo.code} (−${promo.pct}%) — діє більша знижка за обсягом`:null,
    `Доставка: ${ship()?money(ship()):'безкоштовно'}`, `РАЗОМ (орієнтовно): ${money(g)}`,
    `Оплата: ${PM[payMethod]||payMethod}`, np?`Нова Пошта: ${np}`:null, edr?`Компанія/ЄДРПОУ: ${edr}`:null].filter(Boolean).join('\n');
  const btn=document.getElementById('sendBtn'); if(btn){ btn.disabled=true; btn.textContent='Надсилаємо…'; }
  let ok=false, num=ord;
  try{ // кабінет клієнта: замовлення зберігається в базі (якщо сервер увімкнено)
    const r=await fetch('/api/orders',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({cart,name:nm,phone:ph,delivery:np,company:edr,payment:payMethod,promo:promo&&promo.code})});
    if(r.ok){ const d=await r.json(); if(d.number){ ok=true; num=d.number; } }
  }catch(e){}
  if(!ok) try{
    const r=await fetch('https://n8n.china-opt-shop.pp.ua/webhook/contact-form',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nm,phone:ph,service:'Оздоба — комплектація',area:'',message,source:'cas-develop.com/ozdoba',form:'ozdoba-cart',lang:'uk',page:location.pathname})});
    ok=r.ok;
  }catch(e){ ok=false; }
  if(!ok){
    if(btn){ btn.disabled=false; btn.textContent='Надіслати заявку'; }
    toast('Не вдалося надіслати. Подзвоніть +380 97 866 77 55 або напишіть нам у Telegram');
    return;
  }
  document.getElementById('payBody').innerHTML=`
    <div class="done"><div class="ring">✓</div>
      <h2 style="font-size:25px;margin-bottom:8px">Заявку ${num} прийнято</h2>
      <p style="color:var(--muted);font-size:13.5px;margin:0 auto;max-width:34ch">Менеджер звʼяжеться з вами в робочий час,
        підтвердить наявність, ціну й строк поставки і надішле рахунок або посилання на оплату.</p>
      <div class="priceline" style="justify-content:center"><span class="big">${money(g)}</span></div></div>
    ${acct?'<a class="btn" style="text-decoration:none" href="/kabinet">Мої замовлення</a>':''}
    <button class="btn ghost" onclick="reset()">До каталогу</button>`;
  haptic('success');
}
function reset(){ cart=[]; promo=null; promoErr=''; syncBadges(); closeAll(); render(); }

/* ===================== службове ===================== */
/* перемальовування вмісту шторки без втрати фокусу (кнопки −/+, колір, розмір, спосіб оплати) */
const FOCS='a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
function paint(id, html){
  const box=document.getElementById(id), a=document.activeElement;
  const idx = box && a && box.contains(a) ? [...box.querySelectorAll(FOCS)].indexOf(a) : -1;
  box.innerHTML=html;
  if(idx>=0){ const f=box.querySelectorAll(FOCS); const t=f[Math.min(idx,f.length-1)]; if(t) t.focus({preventScroll:true}); }
}
function open(id){ document.getElementById('scrim').classList.add('open');
  document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function close(id){ document.getElementById(id).classList.remove('open'); }
function closeAll(){ ['sheetItem','sheetBundle','sheetCart','sheetPay'].forEach(close);
  if(/^#p-/.test(location.hash)) try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  document.getElementById('scrim').classList.remove('open'); document.body.style.overflow=''; }
let tt;
function toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('on');
  clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('on'),2200); }
function render(){ if(tab==='catalog') renderGrid(); else if(tab==='bundles') renderBundles(); else renderFav(); }

if(tg&&tg.MainButton) tg.MainButton.onClick(openCart);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAll(); });
addEventListener('scroll',()=>document.getElementById('top').classList.toggle('stuck',scrollY>8),{passive:true});

let acct=null;
function account(){ // показуємо «Кабінет», лише коли сервер кабінетів працює
  fetch('/api/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{
    if(!d) return; acct=d.client;
    const a=document.getElementById('accLink'); if(a){ a.hidden=false; a.title=acct?(acct.name||'Кабінет'):'Увійти'; }
  }).catch(()=>{});
}
function boot(d){ account();
  DATA=d; IT=d.items; BU=d.bundles; VOLTXT=VOLTXT_(); for(const k in d.art) ART[k]=S(d.art[k]);
  try{ JSON.parse(localStorage.getItem('ozd-cart')||'[]').forEach(c=>{ if(byId(c.id)) cart.push(c); });
       JSON.parse(localStorage.getItem('ozd-fav')||'[]').forEach(id=>{ if(byId(id)) fav.add(id); }); }catch(e){}
  renderVenues(); renderChips();
  // перші картки каталогу вже є в HTML (tools/products/build.py) — не перемальовуємо їх, лише дорендерюємо решту
  const g=document.getElementById('grid');
  const pre=[...g.querySelectorAll('.card [data-fav]')].map(b=>+b.dataset.fav);
  LIST=gridList();
  if(pre.length && pre.every((id,n)=>LIST[n]&&LIST[n].id===id)){
    shown=pre.length; syncHearts(); syncMore();
    document.getElementById('tabCatalog').setAttribute('aria-pressed','true');
  }
  else setTab('catalog');
  syncBadges();
  const m=location.hash.match(/^#p-(\d+)$/); if(m) openItem(+m[1]);
  const k=location.hash.match(/^#kit-(k\d+)$/);
  if(k){ try{history.replaceState(null,'',location.pathname+location.search);}catch(e){} addKit(k[1]); }
}
fetch(document.getElementById('ozd-data').href).then(r=>r.json()).then(boot)
  .catch(()=>{ const c=document.getElementById('cnt'); if(c) c.textContent='Каталог не завантажився — оновіть сторінку'; });
