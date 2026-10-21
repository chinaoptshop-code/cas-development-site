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
let promo = null;              // {code,pct}
let payMethod = 'card';
let cur=null, curC=0, curS=0, curQ=1;   // відкритий товар
let bq = {};                   // кількості в комплекті

const byId = id => IT.find(i => i.id === id);
const CS = i => DATA.colorsets[i.cs];
const SS = i => i.ss ? DATA.sizesets[i.ss] : null;
const defS = i => { const s = SS(i); if(!s) return 0; const n = s.findIndex(x=>x[1]===1); return n<0?0:n; };
const r10 = n => Math.round(n/10)*10;
function price(i, ci=0, si=null){
  const s = SS(i), k = s ? s[si==null?defS(i):si][1] : 1;
  return r10(i.price * k * (1 + CS(i)[ci][2]));
}
const minP = i => { const s=SS(i); return s ? r10(i.price*Math.min(...s.map(x=>x[1]))) : price(i); };
const money = n => new Intl.NumberFormat('uk-UA').format(Math.round(n)) + ' ₴';

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
  render();
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
      <button class="heart ${fav.has(i.id)?'on':''}" data-fav="${i.id}" onclick="event.stopPropagation();toggleFav(${i.id})" aria-label="В обране">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg></button>
    </div>
    <div class="body">
      <div class="sub">${i.sub}</div>
      <a class="nm" href="#p-${i.id}" style="color:inherit;text-decoration:none">${i.name}</a>
      <div class="sw">${CS(i).slice(0,5).map(c=>`<i style="background:${c[1]}"></i>`).join('')}</div>
      <div class="pr">${from}${money(minP(i))} <small>/ ${i.unit}</small></div>
    </div></article>`;
}
function renderGrid(){
  let list = pool();
  if(cat!=='Усе') list = list.filter(i=>i.cat===cat);
  if(query) list = list.filter(i=>(i.name+' '+i.sub+' '+i.en+' '+i.desc).toLowerCase().includes(query));
  const s=document.getElementById('sort').value;
  const ord={A:0,B:1,C:2};
  list=[...list].sort((a,b)=>
    s==='asc'? minP(a)-minP(b) : s==='desc'? minP(b)-minP(a) :
    s==='az'?  a.name.localeCompare(b.name,'uk') : (ord[a.prio]-ord[b.prio])||(minP(b)-minP(a)));
  document.getElementById('cnt').textContent = list.length ? `${list.length} позицій` : '';
  document.getElementById('grid').innerHTML = list.length ? list.map(cardHTML).join('')
    : `<div class="empty" style="grid-column:1/-1">Нічого не знайшли. Спробуйте інше слово або зніміть фільтр приміщення.</div>`;
}
function renderFav(){
  const list = IT.filter(i=>fav.has(i.id));
  document.getElementById('favGrid').innerHTML = list.length ? list.map(cardHTML).join('')
    : `<div class="empty" style="grid-column:1/-1">Обране порожнє.<br>Тисніть сердечко на картці — позиції збережуться тут, щоб зібрати добірку для клієнта.</div>`;
}
function toggleFav(id){
  fav.has(id) ? fav.delete(id) : fav.add(id);
  haptic(); syncBadges(); renderGrid(); renderFav();
  toast(fav.has(id) ? 'Додано в обране' : 'Прибрано з обраного');
}

/* ===================== комплекти ===================== */
function bundleTotal(b, qty){
  return b.rows.reduce((s,r,n)=>{ const q = qty ? (qty[n] ?? r.q) : r.q; return s + price(byId(r.id),0,defS(byId(r.id)))*q; },0);
}
function renderBundles(){
  const list = venue==='all' ? BU : BU.filter(b=>b.venue===venue);
  document.getElementById('blist').innerHTML = list.length ? list.map(b=>{
    const t=bundleTotal(b), d=Math.round(t*.92);
    return `<article class="bcard" onclick="openBundle('${b.id}')">
      <div class="art">${ART[b.art]||''}</div>
      <div class="info"><h3>${b.name}</h3><div class="note">${b.note}</div>
        <div class="pr">${money(d)} <s>${money(t)}</s></div></div></article>`;
  }).join('') : `<div class="empty">Для цього типу приміщення готового комплекту ще немає. Зберіть з каталогу — або напишіть нам, порахуємо під ваш обʼєкт.</div>`;
}
function openBundle(id){
  const b=BU.find(x=>x.id===id); bq={}; b.rows.forEach((r,n)=>bq[n]=r.q);
  renderBundle(id); open('sheetBundle');
}
function renderBundle(id){
  const b=BU.find(x=>x.id===id);
  const t=bundleTotal(b,bq), d=Math.round(t*.92);
  const n0=b.rows.filter((r,n)=>bq[n]>0).length;
  document.getElementById('bundleBody').innerHTML = `
    <div class="sh-head"><h2>${b.name}</h2><button class="x" onclick="closeAll()">✕</button></div>
    <p class="desc">${b.note} Кількості — орієнтовні, міняйте під свій обʼєкт: позиція з нулем у комплект не піде.</p>
    ${b.rows.map((r,n)=>{ const i=byId(r.id); return `
      <div class="ci">
        <div class="art${i.img?' ph':''}">${pic(i)}</div>
        <div class="info"><b>${i.name}</b><em>${money(price(i,0,defS(i)))} / ${i.unit}</em></div>
        <div class="right">
          <span class="s">${money(price(i,0,defS(i))*(bq[n]||0))}</span>
          <div class="qty sm"><button onclick="bqSet('${id}',${n},-1)">−</button><span>${bq[n]||0}</span><button onclick="bqSet('${id}',${n},1)">+</button></div>
        </div></div>`; }).join('')}
    <div class="sum"><span>${n0} позицій, без знижки</span><span>${money(t)}</span></div>
    <div class="sum disc"><span>Знижка за комплект, 8%</span><span>−${money(t-d)}</span></div>
    <div class="sum total"><span>Разом</span><span>${money(d)}</span></div>
    <button class="btn" onclick="addBundle('${id}')">Додати комплект у кошик</button>`;
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
  promo={code:'КОМПЛЕКТ',pct:8};
  haptic('success'); closeAll(); syncBadges(); toast(`Комплект додано: ${added} позицій, знижка 8%`);
}

/* ===================== картка товару ===================== */
function openItem(id){ cur=byId(id); if(!cur) return; curC=0; curS=defS(cur); curQ=1; renderItem(); open('sheetItem'); try{history.replaceState(null,'','#p-'+id);}catch(e){} }
function renderItem(){
  const i=cur, cs=CS(i), s=SS(i);
  const p=price(i,curC,curS), part=Math.ceil(p*curQ/4);
  document.getElementById('itemBody').innerHTML = `
    <div class="sh-head"><h2>${i.name}</h2><button class="x" onclick="closeAll()">✕</button></div>
    <div class="it-grid"><div class="it-media">
    ${gallery(i, cs[curC][1])}
    </div><div class="it-info">
    <p class="desc">${i.desc}</p>
    <div class="meta"><span class="tag">${i.sub}</span><span class="tag">Ціна за 1 ${i.unit}</span><span class="tag">Поставка 35–50 днів</span></div>

    <p class="lbl">Колір і фактура <b>${cs[curC][0]}</b></p>
    <div class="swatches">${cs.map((c,n)=>`<button class="swatch" style="background:${c[1]}" aria-pressed="${n===curC}" title="${c[0]}" aria-label="${c[0]}" onclick="setC(${n})"></button>`).join('')}</div>

    ${s ? `<p class="lbl">Розмір <b>${s[curS][0]}</b></p>
    <div class="opts">${s.map((x,n)=>`<button class="opt" aria-pressed="${n===curS}" onclick="setS(${n})">${x[0]}<small>${money(price(i,curC,n))}</small></button>`).join('')}</div>` : ''}

    <p class="lbl">Кількість</p>
    <div class="qty"><button onclick="setQ(-1)">−</button><span>${curQ}</span><button onclick="setQ(1)">+</button></div>

    <div class="priceline"><span class="big">${money(p*curQ)}</span>${curQ>1?`<span class="per">${money(p)} × ${curQ}</span>`:''}</div>
    <p class="hint">Або ${money(part)} × 4 платежі без переплати</p>
    <div class="btn2">
      <button class="btn ghost" style="flex:0 0 56px" onclick="toggleFav(${i.id});renderItem()" aria-label="В обране">${fav.has(i.id)?'♥':'♡'}</button>
      <button class="btn" style="flex:1" onclick="addToCart()">Додати в кошик</button>
    </div>
    ${i.specs&&i.specs.length?`<p class="lbl" style="margin-top:20px">Характеристики</p><dl class="specs">${i.specs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:''}
    <button class="share" onclick="shareItem()">Поділитися позицією</button>
    </div></div>`;
}
function gallery(i, col){
  const all = i.img ? [i.img, ...(i.imgs||[])] : [];
  if (!all.length) return `<div class="hero-art"><span style="color:${vis(col)};display:contents">${pic(i,true)}</span></div>`;
  return `<div class="hero-art ph${all.length>1?' multi':''}" id="gal">${all.map(b=>`<figure>${pic(i,true,b)}</figure>`).join('')}</div>`
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
const lineSum = c => price(byId(c.id),c.ci,c.si)*c.qty;
const goods = () => cart.reduce((s,c)=>s+lineSum(c),0);
const count = () => cart.reduce((s,c)=>s+c.qty,0);
const discount = () => promo ? Math.round(goods()*promo.pct/100) : 0;
const ship = () => (goods()-discount()) > 20000 ? 0 : 450;
const grand = () => goods()-discount()+ship();

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
    el.innerHTML=`<div class="sh-head"><h2>Кошик</h2><button class="x" onclick="closeAll()">✕</button></div>
      <div class="empty">Порожньо. Оберіть позиції в каталозі або візьміть готовий комплект під ваш тип приміщення.</div>
      <button class="btn ghost" onclick="closeAll();setTab('bundles')">Дивитись комплекти</button>`;
    return;
  }
  el.innerHTML=`
    <div class="sh-head"><h2>Кошик</h2><button class="x" onclick="closeAll()">✕</button></div>
    ${cart.map((c,n)=>{ const i=byId(c.id), s=SS(i);
      return `<div class="ci">
        <div class="art${i.img?' ph':''}"><span style="color:${vis(CS(i)[c.ci][1])};display:contents">${pic(i)}</span></div>
        <div class="info"><b>${i.name}</b><em>${CS(i)[c.ci][0]}${s?' · '+s[c.si][0]:''} · ${money(price(i,c.ci,c.si))}/${i.unit}</em>
          <div class="qty sm" style="margin-top:6px"><button onclick="cq(${n},-1)">−</button><span>${c.qty}</span><button onclick="cq(${n},1)">+</button></div></div>
        <div class="right"><span class="s">${money(lineSum(c))}</span><button class="rm" onclick="rm(${n})">Прибрати</button></div>
      </div>`; }).join('')}
    <div class="promo">
      <input id="promoIn" placeholder="Промокод" value="${promo?promo.code:''}">
      <button onclick="applyPromo()">Застосувати</button>
    </div>
    <div class="sum"><span>Товари, ${count()} шт</span><span>${money(goods())}</span></div>
    ${promo?`<div class="sum disc"><span>Знижка ${promo.code}, ${promo.pct}%</span><span>−${money(discount())}</span></div>`:''}
    <div class="sum"><span>Доставка по Україні</span><span>${ship()?money(ship()):'безкоштовно'}</span></div>
    <div class="sum total"><span>До сплати</span><span>${money(grand())}</span></div>
    <button class="btn" onclick="openPay()">Оформити замовлення</button>
    <button class="btn ghost" onclick="copyEstimate()">Скопіювати кошторис</button>`;
}
function cq(n,d){ cart[n].qty+=d; if(cart[n].qty<1) cart.splice(n,1); haptic(); syncBadges(); renderCart(); }
function rm(n){ cart.splice(n,1); haptic(); syncBadges(); renderCart(); }
function applyPromo(){
  const v=(document.getElementById('promoIn').value||'').trim().toUpperCase();
  const codes={'ОЗДОБА10':10,'КОМПЛЕКТ':8,'ДИЗАЙНЕР':15};
  if(codes[v]){ promo={code:v,pct:codes[v]}; toast(`Промокод застосовано: −${codes[v]}%`); }
  else { promo=null; toast('Такого промокоду немає'); }
  syncBadges(); renderCart();
}
function copyEstimate(){
  const lines=cart.map(c=>{ const i=byId(c.id), s=SS(i);
    return `${i.name} — ${CS(i)[c.ci][0]}${s?', '+s[c.si][0]:''} — ${c.qty} ${i.unit} × ${money(price(i,c.ci,c.si))} = ${money(lineSum(c))}`; });
  const txt=['КОШТОРИС · Оздоба','',...lines,'',
    `Товари: ${money(goods())}`, promo?`Знижка ${promo.code}: −${money(discount())}`:null,
    `Доставка: ${ship()?money(ship()):'безкоштовно'}`,`РАЗОМ: ${money(grand())}`].filter(Boolean).join('\n');
  const done=()=>toast('Кошторис у буфері обміну');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,()=>fb());
  else fb();
  function fb(){ const t=document.createElement('textarea'); t.value=txt; document.body.appendChild(t); t.select();
    try{document.execCommand('copy');done();}catch(e){toast('Не вдалось скопіювати');} t.remove(); }
}

/* ===================== оплата ===================== */
function openPay(){ renderPay(); close('sheetCart'); setTimeout(()=>open('sheetPay'),130); }
function renderPay(){
  const g=grand(), part=Math.ceil(g/4);
  const u=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.user;
  const nm=u?[u.first_name,u.last_name].filter(Boolean).join(' '):'';
  document.getElementById('payBody').innerHTML=`
    <div class="sh-head"><h2>Оформлення заявки</h2><button class="x" onclick="closeAll()">✕</button></div>
    <div class="field"><label>Ім'я та прізвище</label><input id="fName" value="${nm}" placeholder="Ваше імʼя та прізвище"></div>
    <div class="field"><label>Телефон</label><input id="fPhone" type="tel" inputmode="tel" placeholder="+380 __ ___ __ __"></div>
    <div class="field"><label>Місто і відділення Нової Пошти</label><input id="fNp" placeholder="Київ, відділення №12"></div>
    ${payMethod==='invoice'?`<div class="field"><label>Назва компанії та ЄДРПОУ</label><input id="fEdr" placeholder="ТОВ «Приклад», 12345678"></div>`:''}

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
      ціну й строк поставки і надішле рахунок або посилання на оплату.</p>`;
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
    `Товари: ${money(goods())}`, promo?`Знижка ${promo.code}: −${money(discount())}`:null,
    `Доставка: ${ship()?money(ship()):'безкоштовно'}`, `РАЗОМ (орієнтовно): ${money(g)}`,
    `Оплата: ${PM[payMethod]||payMethod}`, np?`Нова Пошта: ${np}`:null, edr?`Компанія/ЄДРПОУ: ${edr}`:null].filter(Boolean).join('\n');
  const btn=document.getElementById('sendBtn'); if(btn){ btn.disabled=true; btn.textContent='Надсилаємо…'; }
  let ok=false;
  try{
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
      <h2 style="font-size:25px;margin-bottom:8px">Заявку ${ord} прийнято</h2>
      <p style="color:var(--muted);font-size:13.5px;margin:0 auto;max-width:34ch">Менеджер звʼяжеться з вами в робочий час,
        підтвердить наявність, ціну й строк поставки і надішле рахунок або посилання на оплату.</p>
      <div class="priceline" style="justify-content:center"><span class="big">${money(g)}</span></div></div>
    <button class="btn ghost" onclick="reset()">До каталогу</button>`;
  haptic('success');
}
function reset(){ cart=[]; promo=null; syncBadges(); closeAll(); render(); }

/* ===================== службове ===================== */
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

function boot(d){
  DATA=d; IT=d.items; BU=d.bundles; for(const k in d.art) ART[k]=S(d.art[k]);
  try{ JSON.parse(localStorage.getItem('ozd-cart')||'[]').forEach(c=>{ if(byId(c.id)) cart.push(c); });
       JSON.parse(localStorage.getItem('ozd-fav')||'[]').forEach(id=>{ if(byId(id)) fav.add(id); }); }catch(e){}
  renderVenues(); renderChips();
  // картки каталогу вже є в HTML (tools/products/build.py) — не перемальовуємо їх без потреби
  const g=document.getElementById('grid');
  if(g.querySelector('.card')){ g.querySelectorAll('[data-fav]').forEach(b=>b.classList.toggle('on',fav.has(+b.dataset.fav)));
    document.getElementById('tabCatalog').setAttribute('aria-pressed','true'); }
  else setTab('catalog');
  syncBadges();
  const m=location.hash.match(/^#p-(\d+)$/); if(m) openItem(+m[1]);
}
fetch(document.getElementById('ozd-data').href).then(r=>r.json()).then(boot)
  .catch(()=>{ const c=document.getElementById('cnt'); if(c) c.textContent='Каталог не завантажився — оновіть сторінку'; });
