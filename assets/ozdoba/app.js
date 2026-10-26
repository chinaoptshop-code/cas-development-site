/* Оздоба — каталог CAS Development. Дані: /assets/ozdoba/catalog.json (tools/products/).
   Мови: /ozdoba — українська; /en/ozdoba і /pl/ozdoba підключають ще /assets/ozdoba/i18n.<мова>.json (<link id="ozd-i18n">,
   збирає tools/products/intl.py): назви товарів, категорії, одиниці, кольори, комплекти й підписи інтерфейсу.
   Ключ підпису — сам український текст: t('Кошик') → «Cart». {n}, {u}… — підстановки. Кошик і заявка ті самі (/api/orders).
   КП (комерційна пропозиція) — /assets/ozdoba/kp.v1.js, вантажиться лише по кліку «Завантажити КП (PDF)». */
const S = (b) => '<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + b + '</svg>';
let DATA, ART = {};
const fallback = S('<rect x="20" y="20" width="60" height="42" rx="5"/>');
/* ===================== мова ===================== */
const LANG = (document.documentElement.lang || 'uk').slice(0,2);
let L = null;   // словник en/pl (null — українська)
const t = (s, v) => { let r = (L && L.ui && L.ui[s]) || s; if (v) r = r.replace(/\{(\w+)\}/g, (m,k) => k in v ? v[k] : m); return r; };
const nm = i => L ? (L.names[i.id] || (i.en ? i.en[0].toUpperCase() + i.en.slice(1) : i.name)) : i.name;
const catN = c => L ? (L.cats[c] || c) : c;
const unitN = u => L ? (L.units[u] || u) : u;
const subN = i => L ? catN(i.cat) : i.sub;
const colN = c => L ? (L.colors[c] || c) : c;
const sizeN = s => L ? String(s).replace(/см/g,'cm').replace(/(\d) м$/,'$1 m').replace(/персон[иа]?/, L.ui['персон'] || 'pers.') : s;
/* фото товару (вирізаний обʼєкт, webp з прозорістю) або лінійна іконка, поки фото немає */
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function pic(i, big, base){
  const b = base || i.img;
  if (b) return big
    ? `<img src="/${b}-800.webp" width="800" height="800" alt="${esc(nm(i))}" decoding="async">`
    : `<img src="/${b}-400.webp" srcset="/${b}-400.webp 400w, /${b}-800.webp 800w" sizes="(min-width:900px) 240px, 46vw" width="400" height="400" alt="${esc(nm(i))}" loading="lazy" decoding="async">`;
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
let kpCo = '';                 // «Компанія / обʼєкт» для КП (необовʼязково)
let cur=null, curC=0, curS=0, curQ=10;  // відкритий товар
/* мінімум 10 шт (одиниць) кожної позиції — catalog.json min_qty; те саме перевіряє сервер (functions/api/orders.js) */
const MINQ = () => (DATA && DATA.min_qty) || 10;
let bq = {};                   // кількості в комплекті

const byId = id => IT.find(i => i.id === id);
const CS = i => DATA.colorsets[i.cs];
/* колір позиції: -1 — «як на фото» (базове виконання, без доплати); 0… — інший колір під замовлення (catalog.json colorsets) */
const ASIS = ['Як на фото', '#C9A86A', 0];
const col = (i, ci) => ci == null || ci < 0 ? ASIS : (CS(i)[ci] || CS(i)[0]);
/* колір, зафіксований у назві («…, чорний», «біла матова», «латунь», «горіх»; en — «black», «brass»): палітра категорії (colorsets)
   описує категорію, а не цей товар, тому для таких позицій кружечків не показуємо — лише «як на фото» (QA Dell OZ-5).
   Власний список кольорів товару (поле colors у catalog.json) показуємо завжди; палітра категорії — лише коли кольору в назві немає. */
const COLW = /^(чорн|біл|сір|беж|золот|латун|бронз|хром|мідн|срібн|нікел|графіт|антрацит|коричн|горіх|дуб|ясен|венге|тік|тик|бук|бамбук|молочн|крем|слонов|пісочн|теракот|олив|зелен|син|блакит|червон|бордо|рожев|жовт|оранж|фіолет|бузк|димчаст|прозор|натуральн|нержав|стал)/;
const COLE = /^(black|white|grey|gray|beige|gold|golden|brass|bronze|chrome|copper|silver|nickel|graphite|anthracite|brown|walnut|oak|ash|wenge|teak|beech|bamboo|milky|cream|ivory|sand|terracotta|olive|green|blue|red|burgundy|pink|yellow|orange|purple|lilac|smoked|smoky|clear|transparent|natural|stainless|steel)$/;
const namedColor = i => String(i.name).toLowerCase().split(/[^а-яіїєґ'ʼ-]+/).some(w => COLW.test(w) && !/^букле/.test(w))
  || String(i.en||'').toLowerCase().split(/[^a-z-]+/).some(w => COLE.test(w));
const colorsOf = i => i.colors || (namedColor(i) ? [] : CS(i));
const SS = i => i.ss ? DATA.sizesets[i.ss] : null;
/* розмір у назві товару («…, 100 см», «Ø70», «200×300») — той, що відкривається за замовчуванням і показується на картці */
const nz = t => String(t).toLowerCase().replace(/x/g,'×').replace(/[\sØø⌀]|см/g,'');  // ø — бо після toLowerCase «Ø40 см» стає «ø40»
const nameS = i => { const s = SS(i); if(!s) return -1; const nm = nz(i.name);
  return s.findIndex(x => new RegExp('(^|[^\\d×.])' + nz(x[0]).replace(/[.]/g,'\\.') + '($|[^\\d×.])').test(nm)); };
/* розмір за замовчуванням: із назви; інакше — найдешевший, бо картка показує «від <найменша ціна>» і шторка має відкриватись саме з нею */
const defS = i => { const s = SS(i); if(!s) return 0; const k = nameS(i); if(k>=0) return k; let n=0; s.forEach((x,j)=>{ if(x[1]<s[n][1]) n=j; }); return n; };
const r10 = n => Math.round(n/10)*10;
/* українська множина: 1 позиція, 2 позиції, 5 позицій */
const plural = (n, one, few, many) => { const a=n%10, b=n%100; return a===1&&b!==11 ? one : a>=2&&a<=4&&(b<12||b>14) ? few : many; };
/* en/pl: форми множини зі словника (one/few/many/other за Intl.PluralRules) */
const poz = n => { if(L&&L.pos){ let f='other'; try{ f=new Intl.PluralRules(LANG).select(n); }catch(e){} return `${n}\u00a0${L.pos[f]||L.pos.other}`; }
  return `${n}\u00a0${plural(n,'позиція','позиції','позицій')}`; };
/* нерозривний пробіл після однолітерних прийменників і сполучників (з, й, і, у, в, а, о; pl: w, z, i, o, a, u) */
const nb1 = t => L ? (LANG==='pl' ? String(t).replace(/(^|[\s(])([wzioauWZIOAU])\s/g, '$1$2\u00a0') : String(t))
  : String(t).replace(/(^|[\s(«])([зйіувоаЗЙІУВОА])\s/g, '$1$2\u00a0');
/* price: null — «ціна за запитом» (позиція йде в заявку, сума уточнюється менеджером) */
function price(i, ci=0, si=null){
  if (i.price == null) return null;
  const s = SS(i), k = s ? s[si==null?defS(i):si][1] : 1;
  return r10(i.price * k * (1 + col(i, ci)[2]));
}
/* ціна на картці: розмір із назви (якщо є) — інакше найменший розмір «від» */
const minP = i => { if(i.price==null) return null; const s=SS(i); if(!s) return price(i,-1); if(nameS(i)>=0) return price(i,-1,nameS(i)); return r10(i.price*Math.min(...s.map(x=>x[1]))); };
const fromP = i => SS(i) && nameS(i)<0;
/* суми — з пробілом між тисячами для всіх мов (як у текстах сайту: «$2 500», «23 000 ₴») */
const money = n => n==null ? t('за запитом') : new Intl.NumberFormat('uk-UA').format(Math.round(n)).replace(/\s/g,'\u00a0') + '\u00a0₴';

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
      ${VICON[v]}<b>${L&&L.venues[v]||label}</b><em>${poz(venueCount(v))}</em></button>`).join('');
}
function setVenue(v){ venue=v; cat='Усе'; renderVenues(); renderChips(); render(); window.scrollTo({top:0,behavior:'smooth'}); }

function pool(){ return venue==='all' ? IT : IT.filter(i=>i.vn.includes(venue)); }
function cats(){ return ['Усе', ...[...new Set(pool().map(i=>i.cat))]]; }
function renderChips(){
  document.getElementById('chips').innerHTML = cats().map(c=>
    `<button class="chip" aria-pressed="${c===cat}" onclick="setCat('${c}')">${c==='Усе'?t('Усе'):catN(c)}</button>`).join('');
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
  const from = fromP(i) ? t('від')+'\u00a0' : '';
  return `<article class="card" onclick="openItem(${i.id})">
    <div class="tile${i.img?' ph':''}">${pic(i)}
      <button type="button" class="heart ${fav.has(i.id)?'on':''}" data-fav="${i.id}" onclick="event.stopPropagation();toggleFav(${i.id})" aria-label="${t('В обране')}" aria-pressed="${fav.has(i.id)}">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/></svg></button>
    </div>
    <div class="body">
      <div class="sub">${subN(i)}</div>
      <a class="nm" href="/ozdoba/${i.slug}" onclick="event.preventDefault()" style="color:inherit;text-decoration:none">${nb1(nm(i))}</a>
      <div class="pr">${i.price==null?t('Ціна за запитом'):`${from}${money(minP(i))} <small>/ ${unitN(i.unit)}</small>`}</div>
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
  if(query) list = list.filter(i=>(i.name+' '+i.sub+' '+i.en+' '+i.desc+(L?' '+nm(i)+' '+catN(i.cat):'')).toLowerCase().includes(query));
  const s=document.getElementById('sort').value;
  const ord={A:0,B:1,C:2};
  return [...list].sort((a,b)=>
    s==='asc'? (minP(a)??1e12)-(minP(b)??1e12) : s==='desc'? (minP(b)??-1)-(minP(a)??-1) :
    s==='az'?  nm(a).localeCompare(nm(b),LANG) : ((!a.img)-(!b.img))||(ord[a.prio]-ord[b.prio])||((minP(b)??0)-(minP(a)??0)));
}
function renderGrid(){
  LIST = gridList(); shown = 0;
  document.getElementById('cnt').textContent = LIST.length ? poz(LIST.length) : '';
  const g=document.getElementById('grid');
  if(!LIST.length){ g.innerHTML=`<div class="empty" style="grid-column:1/-1">${t('Нічого не знайшли. Спробуйте інше слово або зніміть фільтр приміщення.')}</div>`; syncMore(); return; }
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
  b.textContent = t('Показати ще {a} з {b}', {a:Math.min(left,CHUNK), b:left});
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
    : `<div class="empty" style="grid-column:1/-1">${t('Обране порожнє.')}<br>${t('Тисніть сердечко на картці — позиції збережуться тут, щоб зібрати добірку для клієнта.')}</div>`;
}
function toggleFav(id){
  fav.has(id) ? fav.delete(id) : fav.add(id);
  haptic(); syncBadges(); syncHearts(id); if(tab==='fav') renderFav();
  toast(fav.has(id) ? t('Додано в обране') : t('Прибрано з обраного'));
}

/* ===================== комплекти ===================== */
/* Мінімум 10 шт кожної позиції стосується і комплектів. Комплект — специфікація під обʼєкт: ціна = сума позицій × кількість
   за специфікацією (без тихого «доведення» до 10). Комплект, у якому є позиції менше 10 шт, у кошик не додається
   і кількості в ньому не редагуються — лише «Запит розрахунку» (рішення Михайла 25.10.2026). */
function bundleTotal(b, qty){
  return b.rows.reduce((s,r,n)=>{ const q = qty ? (qty[n] ?? r.q) : r.q; return s + (price(byId(r.id),-1,defS(byId(r.id)))||0)*q; },0);
}
const kitOk = b => b.rows.every(r=>r.q>=MINQ());
const lowRows = () => Object.values(bq).filter(q=>q>0&&q<MINQ()).length;
/* ціна комплекту = сума позицій × кількість; окремої знижки на комплект немає — діє загальна знижка за обсягом у кошику */
function kitPics(b){ return b.rows.map(r=>byId(r.id)).filter(i=>i&&i.img).slice(0,4)
  .map(i=>`<img src="/${i.img}-400.webp" width="400" height="400" alt="${esc(nm(i))}" loading="lazy" decoding="async">`).join(''); }
const bN = b => L&&L.bundles&&L.bundles[b.id] ? L.bundles[b.id][0] : b.name;
const bNote = b => L&&L.bundles&&L.bundles[b.id] ? L.bundles[b.id][1] : b.note;
function renderBundles(){
  const list = venue==='all' ? BU : BU.filter(b=>b.venue===venue);
  document.getElementById('blist').innerHTML = list.length ? list.map(b=>{
    const bt=bundleTotal(b);
    return `<article class="bcard${b.premium?' prem':''}" role="button" tabindex="0" aria-label="${esc(bN(b))}" onclick="openBundle('${b.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openBundle('${b.id}')}">
      <div class="art${b.premium?' kcol':''}">${b.premium?kitPics(b):(ART[b.art]||'')}</div>
      <div class="info"><h3>${esc(bN(b))}</h3><div class="note">${esc(bNote(b))}</div>
        <div class="pr">${money(bt)}</div>${kitOk(b)?'':`<div class="note">${t('Є позиції менше {m} шт — лише запит розрахунку',{m:MINQ()})}</div>`}</div></article>`;
  }).join('') : `<div class="empty">${t('Для цього типу приміщення готового комплекту ще немає. Зберіть з каталогу — або напишіть нам, порахуємо під ваш обʼєкт.')}</div>`;
}
function openBundle(id){
  const b=BU.find(x=>x.id===id); bq={}; b.rows.forEach((r,n)=>bq[n]=r.q);
  renderBundle(id); open('sheetBundle');
}
function renderBundle(id){
  const b=BU.find(x=>x.id===id);
  const bt=bundleTotal(b,bq), vp=volPct(bt), low=lowRows(), req=!kitOk(b);
  const n0=b.rows.filter((r,n)=>bq[n]>0).length;
  const reqHref = L ? '#zayavka' : `/ozdoba/komplekty?kit=${b.id}#zayavka`;
  paint('bundleBody', `
    <div class="sh-head"><h2>${esc(bN(b))}</h2><button type="button" class="x" onclick="closeAll()" aria-label="${t('Закрити')}">✕</button></div>
    <p class="desc">${esc(bNote(b))} ${req?t('Кількості — за специфікацією; у комплекті є позиції менше {m} шт, тому його рахуємо лише за запитом.',{m:MINQ()}):t('Кількості — орієнтовні, міняйте під свій обʼєкт: позиція з нулем у комплект не піде.')} ${t('Мінімум — {m} шт (одиниць) кожної позиції.',{m:MINQ()})}</p>
    ${b.rows.map((r,n)=>{ const i=byId(r.id), q=bq[n]||0; return `
      <div class="ci">
        <div class="art${i.img?' ph':''}">${pic(i)}</div>
        <div class="info"><b>${nm(i)}</b><em>${money(price(i,-1,defS(i)))} / ${unitN(i.unit)}${q>0&&q<MINQ()?` · <span style="color:var(--glow)">${t('менше мінімуму {m}',{m:MINQ()})}</span>`:''}</em></div>
        <div class="right">
          <span class="s">${i.price==null?money(null):money(price(i,-1,defS(i))*q)}</span>
          ${req?`<div class="qty sm"><span>${q} ${unitN(i.unit)}</span></div>`:`<div class="qty sm"><button type="button" onclick="bqSet('${id}',${n},-1)" aria-label="${t('Менше')}: ${esc(nm(i))}">−</button><span aria-live="polite">${q}</span><button type="button" onclick="bqSet('${id}',${n},1)" aria-label="${t('Більше')}: ${esc(nm(i))}">+</button></div>`}
        </div></div>`; }).join('')}
    <div class="sum total"><span>${t('Разом')}, ${poz(n0)}</span><span>${money(bt)}</span></div>
    ${vp?`<div class="sum disc"><span>${t('Знижка за обсягом −{p}% у кошику',{p:vp})}</span><span>−${money(Math.round(bt*vp/100))}</span></div>`:''}
    <p class="note-honest">${t('Ціна — сума позицій каталогу.')} ${VOLTXT} — ${t('рахується в кошику на всю суму товарів.')} ${t('Поставка з Китаю')} <span class="nw">30–60</span>\u00a0${t('днів')}; ${t(SHIPTXT)} ${t('Рахунок для ФОП і ТОВ; рахунки для компаній з ЄС — у процесі підключення.')}${b.premium?' '+t('Точну суму під ваш обʼєкт менеджер підтвердить після заявки.'):''}</p>
    ${req?`<p class="note-honest" style="color:var(--glow)">${t('У комплекті є позиції менше {m} шт — у кошик його не додати. Надішліть запит розрахунку: менеджер порахує комплект під ваш обʼєкт.',{m:MINQ()})}</p>
    <a class="btn" style="text-decoration:none" href="${reqHref}"${L?' onclick="closeAll()"':''}>${t('Запит розрахунку')}</a>`:`
    <button class="btn" onclick="addBundle('${id}')"${low?' disabled aria-disabled="true"':''}>${b.premium?t('Додати весь комплект у кошик'):t('Додати комплект у кошик')}</button>
    <a class="btn ghost" style="text-decoration:none" href="${reqHref}"${L?' onclick="closeAll()"':''}>${t('Запит розрахунку під мій обʼєкт')}</a>`}
    <button type="button" class="btn ghost" onclick="kpDownload('${id}')">${t('КП на комплект (PDF)')}</button>`);
}
/* кількість у комплекті: 0 або ≥ мінімуму; з позиції менше 10 «+» веде до 10, «−» — до 0 */
function bqSet(id,n,dd){ const c=bq[n]||0; let q;
  if(dd>0) q = c<MINQ() ? MINQ() : c+1;
  else q = c<=MINQ() ? 0 : c-1;
  bq[n]=q; renderBundle(id); }
function addBundle(id){
  const b=BU.find(x=>x.id===id); let added=0;
  if(!kitOk(b)){ toast(t('Цей комплект — лише за запитом розрахунку')); return; }
  if(lowRows()){ toast(t('Мінімум — {m} шт кожної позиції',{m:MINQ()})); return; }
  b.rows.forEach((r,n)=>{ const q=bq[n]||0; if(!q) return;
    const i=byId(r.id), si=defS(i);
    const ex=cart.find(c=>c.id===i.id&&c.ci===-1&&c.si===si&&c.kit===b.id);
    ex ? ex.qty+=q : cart.push({id:i.id,ci:-1,si,qty:q,kit:b.id}); added++;
  });
  if(!added){ toast(t('Усі позиції на нулі — нічого додавати')); return; }
  haptic('success'); closeAll(); syncBadges(); toast(b.premium?t('Комплект «{k}» у кошику: {n}',{k:bN(b),n:poz(added)}):t('Комплект додано: {n}',{n:poz(added)}));
}
/* «Додати весь комплект у кошик» із секції /ozdoba і з /ozdoba/komplekty (#kit-k1) — кількості за замовчуванням;
   якщо в комплекті є позиції менше 10 шт — відкриваємо шторку комплекту з кнопкою «Запит розрахунку» */
function addKit(id){
  const b=BU.find(x=>x.id===id); if(!b) return;
  if(!kitOk(b)){ openBundle(id); toast(t('У комплекті є позиції менше {m} шт — лише запит розрахунку',{m:MINQ()})); return; }
  bq={}; b.rows.forEach((r,n)=>bq[n]=r.q); addBundle(id); openCart();
}

/* ===================== картка товару ===================== */
function openItem(id){ cur=byId(id); if(!cur) return; curC=-1; curS=defS(cur); curQ=MINQ(); renderItem();
  const sh=document.getElementById('sheetItem'); sh.scrollTop=0; const g=document.getElementById('gal'); if(g) g.scrollLeft=0;  // нова позиція — з початку (назва й фото)
  open('sheetItem'); try{history.replaceState(null,'','#p-'+id);}catch(e){} }
function renderItem(){
  const i=cur, cs=colorsOf(i), s=SS(i);
  const p=price(i,curC,curS);
  paint('itemBody', `
    <div class="sh-head"><h2>${nm(i)}</h2><button type="button" class="x" onclick="closeAll()" aria-label="${t('Закрити')}">✕</button></div>
    <div class="it-grid"><div class="it-media">
    ${gallery(i, col(i,curC)[1])}
    </div><div class="it-info">
    ${L?`<p class="desc">${t('Колір, розмір, матеріал і оздоблення змінюємо під ваш проєкт. Повний опис і характеристики — на сторінці товару')} <a href="/ozdoba/${i.slug}" lang="uk" style="color:var(--brass)">${t('(українською)')}</a>.</p>`:`<p class="desc">${i.desc}</p>`}
    <div class="meta"><span class="tag">${subN(i)}</span><span class="tag">${t('Ціна за 1 {u}',{u:unitN(i.unit)})}</span><span class="tag">${t('Від {m} {u}',{m:MINQ(),u:unitN(i.unit)})}</span><span class="tag">${t('Поставка')} <span class="nw">30–60</span>\u00a0${t('днів')}</span><span class="tag">OZD-${i.id}</span></div>

    <p class="lbl">${t('Колір і фактура')} <b>${colN(col(i,curC)[0])}</b></p>
    <div class="swatches"><button class="swatch asis" aria-pressed="${curC<0}" aria-label="${t('Як на фото')}" onclick="setC(-1)">${t('як на фото')}</button>${cs.map((c,n)=>`<button class="swatch" style="background:${c[1]}" aria-pressed="${n===curC}" title="${colN(c[0])} — ${t('під замовлення')}" aria-label="${colN(c[0])} — ${t('під замовлення')}" onclick="setC(${n})"></button>`).join('')}</div>
    <p class="hint" style="margin-top:-8px">${cs.length?t('Інші кольори — виготовлення під замовлення')+(cs.some(c=>c[2]>0)?t(', ціна може відрізнятися'):''):t('Колір — як у назві й на фото. Інший колір — під замовлення, уточнить менеджер')}.</p>

    ${s ? `<p class="lbl">${t('Розмір')} <b>${sizeN(s[curS][0])}</b></p>
    <div class="opts">${s.map((x,n)=>`<button class="opt" aria-pressed="${n===curS}" onclick="setS(${n})">${sizeN(x[0])}${i.price==null?'':`<small>${money(price(i,curC,n))}</small>`}</button>`).join('')}</div>` : ''}

    <p class="lbl">${t('Кількість')} <b>${t('мінімум {m} {u}',{m:MINQ(),u:unitN(i.unit)})}</b></p>
    <div class="qty"><button type="button" onclick="setQ(-1)" aria-label="${t('Менше на {m}',{m:MINQ()})}">−</button><input id="qIn" type="number" inputmode="numeric" min="${MINQ()}" step="1" value="${curQ}" aria-label="${t('Кількість, {u} (мінімум {m})',{u:unitN(i.unit),m:MINQ()})}" onchange="typeQ(this.value)"><button type="button" onclick="setQ(1)" aria-label="${t('Більше на {m}',{m:MINQ()})}">+</button></div>

    ${p==null?`<div class="priceline"><span class="big">${t('Ціна за запитом')}</span></div><p class="hint">${t('Додайте в кошик — менеджер назве ціну й строк разом з рештою позицій.')}</p>`
    :`<div class="priceline"><span class="big">${money(p*curQ)}</span>${curQ>1?`<span class="per">${money(p)} × ${curQ}</span>`:''}</div>
    <p class="hint">${t(SHIPTXT)}</p>`}
    <div class="btn2">
      <button type="button" class="btn ghost fav-big" style="flex:0 0 56px" onclick="toggleFav(${i.id});renderItem()" aria-label="${fav.has(i.id)?t('Прибрати з обраного'):t('Додати в обране')}" aria-pressed="${fav.has(i.id)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z" fill="${fav.has(i.id)?'currentColor':'none'}" stroke="currentColor" stroke-width="1.9"/></svg></button>
      <button class="btn" style="flex:1" onclick="addToCart()">${t('Додати в кошик')}</button>
    </div>
    ${!L&&i.specs&&i.specs.length?`<p class="lbl" style="margin-top:20px">Характеристики</p><dl class="specs">${i.specs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:''}
    ${L?'':customHTML(i)}
    <button class="share" onclick="shareItem()">${t('Поділитися позицією')}</button>
    </div></div>`);
}
function gallery(i, col){
  const all = i.img ? [i.img, ...(i.imgs||[])] : [];
  if (!all.length) return `<div class="hero-art"><span style="color:${vis(col)};display:contents">${pic(i,true)}</span></div>`;
  /* власні фото з виставки в Гуанчжоу (photo.py --expo, «-expo-» у шляху) — реальний кадр на всю площу з підписом */
  const fig = b => /-expo-/.test(b)
    ? `<figure class="expo"><img src="/${b}-800.webp" width="800" height="800" alt="${esc(nm(i))} — ${t('фото з виставки в Гуанчжоу')}" loading="lazy" decoding="async"><figcaption>${t('Фото з виставки в Гуанчжоу')}</figcaption></figure>`
    : `<figure>${pic(i,true,b)}</figure>`;
  return `<div class="hero-art ph${all.length>1?' multi':''}" id="gal" tabindex="0" role="region" aria-label="${t('Фото товару')}">${all.map(fig).join('')}</div>`
    + (all.length>1 ? `<div class="dots">${all.map((b,n)=>`<button aria-label="${t('Фото')} ${n+1}" onclick="galGo(${n})"></button>`).join('')}</div>` : '');
}
function galGo(n){ const g=document.getElementById('gal'); if(g) g.scrollTo({left:g.clientWidth*n,behavior:'smooth'}); }
function shareItem(){
  const u = location.origin + location.pathname + '#p-' + cur.id;
  if (navigator.share) navigator.share({title: nm(cur), url: u}).catch(()=>{});
  else if (navigator.clipboard) navigator.clipboard.writeText(u).then(()=>toast(t('Посилання скопійовано')));
}
function setC(n){ curC=n; renderItem(); }
function setS(n){ curS=n; renderItem(); }
function setQ(d){ curQ=Math.max(MINQ(),curQ+d*MINQ()); renderItem(); }
function typeQ(v){ const q=Math.round(Number(v)||0); if(q<MINQ()) toast(t('Мінімум — {m} {u} кожної позиції',{m:MINQ(),u:unitN(cur.unit)})); curQ=Math.max(MINQ(),Math.min(10000,q)); renderItem(); }
/* «Під ваш проєкт»: що можна змінити (catalog.json custom) — товар виготовляється під замовлення */
function customHTML(i){
  const c=i.custom||[]; if(!c.length) return '';
  return `<div class="custom"><p class="lbl" style="margin-top:20px">Під ваш проєкт</p><ul>${c.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    <p class="note-honest" style="margin-top:6px">Виготовляємо під замовлення, поставка <span class="nw">30–60</span>\u00a0днів. Мінімум — ${MINQ()} ${esc(i.unit)} позиції.</p></div>`;
}
function addToCart(){
  const ex=cart.find(c=>c.id===cur.id&&c.ci===curC&&c.si===curS);
  ex ? ex.qty+=curQ : cart.push({id:cur.id,ci:curC,si:curS,qty:curQ});
  haptic(); closeAll(); syncBadges(); toast(`${nm(cur)} — ${t('додано')}`);
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
const usd = n => '$' + new Intl.NumberFormat('uk-UA').format(Math.round(n/46/100)*100).replace(/\s/g,'\u00a0');  // 230 000 ₴ ≈ $5 000
const VOLTXT_ = () => t('Знижка за обсягом') + ': ' + VOL().map(([th,pc])=>`${t('від')}\u00a0${usd(th)}\u00a0— ${pc}%`).join(', ');
let VOLTXT = '';
function disc(){ const g=goods(), v=volPct(g), p=promo?promo.pct:0;
  return p>v ? {kind:'partner',pct:p,code:promo.code} : v ? {kind:'volume',pct:v} : null; }
const discount = () => { const d=disc(); return d ? Math.round(goods()*d.pct/100) : 0; };
const discLabel = d => d.kind==='partner' ? `${t('Знижка партнера')} ${d.code} −${d.pct}%` : `${t('Знижка за обсягом')} −${d.pct}%`;
/* підказка «Ще Y ₴ до знижки Z%», коли до наступного порогу лишилось менше 25% */
function volHint(){ const g=goods(), cur=disc(), n=VOL().find(([t,pc])=>g<t && pc>(cur?cur.pct:0));
  return n && n[0]-g < n[0]*0.25 ? t('Ще {s} до знижки {p}%',{s:money(n[0]-g),p:n[1]}) : ''; }
/* доставка й митні платежі не фіксовані — розраховуємо індивідуально за обсягом (Михайло 25.10.2026); у суму не додаємо */
const SHIPTXT = 'Вартість доставки й митних платежів розраховуємо індивідуально залежно від обсягу замовлення (веземо під замовлення з Китаю).';
const ship = () => 0;
const grand = () => goods()-discount();
/* Оздоба комплектує обʼєкти: поштучно не продаємо, мінімальне замовлення ≈ $500 */
const MIN_ORDER = 23000;
const belowMin = () => !onReq() && goods()-discount() < MIN_ORDER;

function save(){ try{ localStorage.setItem('ozd-cart',JSON.stringify(cart)); localStorage.setItem('ozd-fav',JSON.stringify([...fav])); }catch(e){} }
function syncBadges(){ save();
  const n=count(), f=fav.size;
  const cb=document.getElementById('cartBadge'); cb.hidden=!n; cb.textContent=n;
  const fb=document.getElementById('favBadge'); fb.hidden=!f; fb.textContent=f;
  document.getElementById('barTxt').textContent = n ? `${t('Кошик')} · ${n}\u00a0${t('шт')} · ${money(grand())}` : t('Кошик');
  document.getElementById('bar').classList.toggle('show', n>0);
  if(tg&&tg.MainButton){ if(n){ tg.MainButton.setText(`${t('Кошик')} · ${money(grand())}`); tg.MainButton.show(); } else tg.MainButton.hide(); }
}
function openCart(){ renderCart(); open('sheetCart'); }
function renderCart(){
  const el=document.getElementById('cartBody');
  if(!cart.length){
    paint('cartBody', `<div class="sh-head"><h2>${t('Кошик')}</h2><button type="button" class="x" onclick="closeAll()" aria-label="${t('Закрити')}">✕</button></div>
      <div class="empty">${t('Порожньо. Оберіть позиції в каталозі або візьміть готовий комплект під ваш тип приміщення.')}</div>
      <button class="btn ghost" onclick="closeAll();setTab('bundles')">${t('Дивитись комплекти')}</button>`);
    return;
  }
  paint('cartBody', `
    <div class="sh-head"><h2>${t('Кошик')}</h2><button type="button" class="x" onclick="closeAll()" aria-label="${t('Закрити')}">✕</button></div>
    ${cart.map((c,n)=>{ const i=byId(c.id), s=SS(i), k=c.kit&&BU.find(b=>b.id===c.kit);
      const head = k && (n===0 || cart[n-1].kit!==c.kit) ? (()=>{ const m=cart.filter(x=>x.kit===c.kit).length;
        return `<div class="kit-row"><span>${t('Комплект')} «${esc(bN(k))}» · ${poz(m)}</span><button type="button" class="rm" onclick="rmKit('${c.kit}')">${t('Прибрати комплект')}</button></div>`; })() : '';
      return `${head}<div class="ci${c.kit?' in-kit':''}">
        <div class="art${i.img?' ph':''}"><span style="color:${vis(col(i,c.ci)[1])};display:contents">${pic(i)}</span></div>
        <div class="info"><b>${nm(i)}</b><em>${colN(col(i,c.ci)[0])}${s?' · '+sizeN(s[c.si][0]):''} · ${money(price(i,c.ci,c.si))}/${unitN(i.unit)}</em>
          <div class="qty sm" style="margin-top:6px"><button type="button" onclick="cq(${n},-1)" aria-label="${t('Менше на {m}',{m:MINQ()})}: ${esc(nm(i))}">−</button><input type="number" inputmode="numeric" min="${MINQ()}" value="${c.qty}" aria-label="${t('Кількість')}: ${esc(nm(i))}, ${t('мінімум {m} {u}',{m:MINQ(),u:unitN(i.unit)})}" onchange="cqSet(${n},this.value)"><button type="button" onclick="cq(${n},1)" aria-label="${t('Більше на {m}',{m:MINQ()})}: ${esc(nm(i))}">+</button></div></div>
        <div class="right"><span class="s">${money(lineSum(c))}</span><button class="rm" onclick="rm(${n})">${t('Прибрати')}</button></div>
      </div>`; }).join('')}
    <div class="promo">
      <input id="promoIn" placeholder="${t('Код партнера')}" aria-label="${t('Код партнера (для дизайнерів і архітекторів)')}" autocomplete="off" autocapitalize="characters" value="${promo?esc(promo.code):''}" onkeydown="if(event.key==='Enter')applyPromo()">
      <button type="button" onclick="applyPromo()">${t('Застосувати')}</button>
    </div>
    ${promoErr?`<p class="note-honest" role="alert" style="color:#e07a6a;margin-top:0">${esc(promoErr)}</p>`
      :promo&&disc()&&disc().kind!=='partner'?`<p class="note-honest" style="margin-top:0">${t('Код {c} прийнято (−{p}%). Знижки не сумуються — діє більша, за обсягом.',{c:esc(promo.code),p:promo.pct})}</p>`:''}
    <div class="sum"><span>${t('Товари, {n} шт',{n:count()})}</span><span>${money(goods())}</span></div>
    ${disc()?`<div class="sum disc"><span>${discLabel(disc())}</span><span>−${money(discount())}</span></div>`:''}
    ${volHint()?`<p class="note-honest" style="margin:2px 0 6px;color:var(--glow)">${volHint()}</p>`:''}
    <div class="sum"><span>${t('Доставка й митні платежі')}</span><span>${t('розраховуємо індивідуально')}</span></div>
    ${onReq()?`<div class="sum"><span>${t('Позицій за запитом: {n}',{n:onReq()})}</span><span>${t('ціну назве менеджер')}</span></div>`:''}
    <div class="sum total"><span>${onReq()?t('Сума відомих позицій'):belowMin()?t('Разом'):t('Разом за товари')}</span><span>${money(grand())}</span></div>
    <p class="note-honest" style="margin:2px 0 6px">${t('Мінімум — {m}\u00a0шт (одиниць) кожної позиції. Товари виготовляємо під замовлення, поставка з Китаю',{m:MINQ()})} <span class="nw">30–60</span>\u00a0${t('днів')}. ${t(SHIPTXT)}</p>
    ${belowMin()?`<p class="note-honest" style="color:var(--glow)">${t('До мінімального замовлення залишилось {s}. Мінімальне замовлення — {min} (≈\u00a0$500) і від {m}\u00a0шт кожної позиції: ми комплектуємо обʼєкти й не продаємо поштучно. Додайте позиції або візьміть готовий комплект.',{s:money(MIN_ORDER-(goods()-discount())),min:money(MIN_ORDER),m:MINQ()})}</p>
    <button class="btn ghost" onclick="closeAll();setTab('bundles')">${t('Дивитись комплекти')}</button>`
    :`<button class="btn" onclick="openPay()">${t('Оформити замовлення')}</button>`}
    <div class="kp-box" style="border-top:1px solid var(--line);margin-top:16px;padding-top:12px">
      <div class="field"><label for="kpCo">${t('Компанія / обʼєкт для КП (необовʼязково)')}</label><input id="kpCo" autocomplete="organization" maxlength="120" placeholder="${t('напр. ТОВ «Приклад», ресторан на 60 місць')}" value="${esc(kpCo)}" oninput="kpCo=this.value"></div>
      <button type="button" class="btn ghost" id="kpBtn" onclick="kpDownload()">${t('Завантажити КП (PDF)')}</button>
    </div>
    <button class="btn ghost" onclick="copyEstimate()">${t('Скопіювати кошторис')}</button>
    <button type="button" class="btn ghost clear" onclick="clearCart()">${t('Очистити кошик')}</button>`);
}
function rmKit(id){ const k=BU.find(b=>b.id===id); cart=cart.filter(c=>c.kit!==id); haptic(); syncBadges(); renderCart();
  toast(`${t('Комплект')}${k?' «'+bN(k)+'»':''} — ${t('прибрано з кошика')}`); }
function clearCart(){ if(!cart.length) return; if(!confirm(t('Очистити кошик? Усі позиції буде прибрано.'))) return;
  cart=[]; promo=null; promoErr=''; haptic(); syncBadges(); renderCart(); toast(t('Кошик очищено')); }
function cq(n,d){ const q=cart[n].qty+d*MINQ();
  if(q<MINQ()){ toast(t('Мінімум — {m} {u} кожної позиції. Щоб прибрати, натисніть «Прибрати»',{m:MINQ(),u:unitN(byId(cart[n].id).unit)})); return; }
  cart[n].qty=q; haptic(); syncBadges(); renderCart(); }
function cqSet(n,v){ const q=Math.round(Number(v)||0);
  if(q<MINQ()) toast(t('Мінімум — {m} {u} кожної позиції',{m:MINQ(),u:unitN(byId(cart[n].id).unit)}));
  cart[n].qty=Math.max(MINQ(),Math.min(10000,q)); syncBadges(); renderCart(); }
function rm(n){ cart.splice(n,1); haptic(); syncBadges(); renderCart(); }
/* особистий код партнера (дизайнер, архітектор): перевіряє сервер, список кодів не розкривається */
async function applyPromo(){
  const v=(document.getElementById('promoIn').value||'').trim().toUpperCase();
  promoErr='';
  if(!v){ promo=null; syncBadges(); renderCart(); return; }
  let d=null;
  try{ const r=await fetch('/api/promo/check',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:v})});
       d=await r.json().catch(()=>null); }catch(e){}
  if(d&&d.ok){ promo={code:d.code||v,pct:d.discount}; toast(t('Код партнера прийнято: −{p}%',{p:d.discount})); }
  else { promo=null; promoErr=(d&&d.error&&!L&&d.error)||t('Не вдалося перевірити код — спробуйте пізніше'); toast(promoErr); }
  syncBadges(); renderCart();
}
function copyEstimate(){
  const lines=cart.map(c=>{ const i=byId(c.id), s=SS(i);
    return `OZD-${i.id} ${nm(i)} — ${colN(col(i,c.ci)[0])}${s?', '+sizeN(s[c.si][0]):''} — ${c.qty} ${unitN(i.unit)} × ${money(price(i,c.ci,c.si))} = ${money(lineSum(c))}`; });
  const txt=[t('КОШТОРИС · Оздоба'),'',...lines,'',
    `${t('Товари')}: ${money(goods())}`, disc()?`${discLabel(disc())}: −${money(discount())}`:null,
    `${t('РАЗОМ за товари')}: ${money(grand())}`, `${t('Доставка й митні платежі')}: ${t('розраховуємо індивідуально залежно від обсягу замовлення')}`].filter(Boolean).join('\n');
  const done=()=>toast(t('Кошторис у буфері обміну'));
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,()=>fb());
  else fb();
  function fb(){ const x=document.createElement('textarea'); x.value=txt; document.body.appendChild(x); x.select();
    try{document.execCommand('copy');done();}catch(e){toast(t('Не вдалось скопіювати'));} x.remove(); }
}

/* ===================== оплата ===================== */
function openPay(){ if(belowMin()){ toast(t('Мінімальне замовлення')+' — '+money(MIN_ORDER)); return; } renderPay(); close('sheetCart'); setTimeout(()=>open('sheetPay'),130); }
function renderPay(){
  const g=grand();
  const u=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.user;
  const nm=esc(acct&&acct.name||(u?[u.first_name,u.last_name].filter(Boolean).join(' '):''));
  paint('payBody', `
    <div class="sh-head"><h2>${t('Оформлення заявки')}</h2><button type="button" class="x" onclick="closeAll()" aria-label="${t('Закрити')}">✕</button></div>
    <div class="field"><label for="fPhone">${t('Телефон')} *</label><input id="fPhone" autocomplete="tel" type="tel" inputmode="tel" placeholder="${L?'+48 ___ ___ ___':'+380 __ ___ __ __'}" value="${esc(acct&&acct.phone||'')}"></div>
    <div class="field"><label for="fName">${t('Імʼя (необовʼязково)')}</label><input id="fName" autocomplete="name" value="${nm}"></div>
    <div class="field"><label for="fNp">${t('Місто і відділення Нової Пошти')}</label><input id="fNp" placeholder="${t('Київ, відділення №12')}" value="${esc(acct&&acct.city||'')}"></div>
    ${payMethod==='invoice'?`<div class="field"><label for="fEdr">${t('Назва компанії та ЄДРПОУ')}</label><input id="fEdr" placeholder="${t('ТОВ «Приклад», 12345678')}" value="${esc(acct&&acct.company||kpCo||'')}"></div>`:''}

    <p class="lbl" style="margin-top:18px">${t('Як вам зручніше оплатити')}</p>
    <button class="pay" aria-pressed="${payMethod==='card'}" onclick="setPay('card')"><span class="dot"></span>
      <span><b>${t('Карткою (посилання від менеджера)')}</b><small>${t('Посилання на оплату надішле менеджер після підтвердження наявності.')}</small></span></button>
    <button class="pay" aria-pressed="${payMethod==='invoice'}" onclick="setPay('invoice')"><span class="dot"></span>
      <span><b>${t('Рахунок для ФОП або ТОВ')}</b><small>${t('Безготівковий розрахунок з ПДВ, закривні документи. Відвантаження після зарахування.')}</small></span></button>
    <button class="pay" aria-pressed="${payMethod==='cash'}" onclick="setPay('cash')"><span class="dot"></span>
      <span><b>${t('Готівкою — гривні, долари або євро')}</b><small>${t('Умови й місце оплати узгодить менеджер після підтвердження замовлення.')}</small></span></button>
    <button class="pay" aria-pressed="${payMethod==='usdt'}" onclick="setPay('usdt')"><span class="dot"></span>
      <span><b>${t('USDT (криптовалюта)')}</b><small>${t('Гаманець і мережу для переказу надішле менеджер після підтвердження замовлення.')}</small></span></button>

    <div class="sum total"><span>${t('Орієнтовна сума за товари')}</span><span>${money(g)}</span></div>
    <p class="note-honest" style="margin-top:0">${t(SHIPTXT)}</p>
    <button class="btn" id="sendBtn" onclick="pay()">${t('Надіслати заявку')}</button>
    <p class="note-honest">${t('Це заявка, а не оплата: гроші зараз не списуються. Менеджер зателефонує, підтвердить наявність, ціну й строк поставки і надішле рахунок, посилання на оплату або реквізити.')}</p>`);
}
function setPay(m){ payMethod=['invoice','cash','usdt'].includes(m)?m:'card'; renderPay(); }
async function pay(){
  const v=id=>((document.getElementById(id)||{}).value||'').trim();
  const nm=v('fName'), ph=v('fPhone'), np=v('fNp'), edr=v('fEdr');
  if(!cart.length){ toast(t('Кошик порожній — додайте товари з каталогу')); return; }
  if(cart.some(c=>c.qty<MINQ())){ toast(t('Мінімум — {m} шт кожної позиції',{m:MINQ()})); return; }
  if(ph.replace(/\D/g,'').length<9){ toast(t('Вкажіть номер телефону (щонайменше 9 цифр) — ми передзвонимо')); const f=document.getElementById('fPhone'); if(f) f.focus(); return; }
  const g=grand(), ord='OZD-'+Date.now().toString().slice(-7);
  const PM={invoice:'рахунок ФОП/ТОВ',card:'карткою (посилання від менеджера)',cash:'готівкою (UAH / USD / EUR)',usdt:'USDT (криптовалюта)'};
  const lines=cart.map(c=>{ const i=byId(c.id), s=SS(i);
    return `• ${i.name} — ${col(i,c.ci)[0]}${s?', '+s[c.si][0]:''} — ${c.qty} ${i.unit} × ${money(price(i,c.ci,c.si))} = ${money(lineSum(c))}`; });
  const message=[`Замовлення ${ord} з Оздоби`,...lines,
    `Товари: ${money(goods())}`, disc()?`${discLabel(disc())}: −${money(discount())}`:null,
    promo&&disc()&&disc().kind!=='partner'?`Код партнера ${promo.code} (−${promo.pct}%) — діє більша знижка за обсягом`:null,
    `РАЗОМ за товари (орієнтовно): ${money(g)}`, 'Доставка й митні платежі: розраховуємо індивідуально',
    `Оплата: ${PM[payMethod]||payMethod}`, np?`${L?'Місто / адреса':'Нова Пошта'}: ${np}`:null, edr?`Компанія/ЄДРПОУ: ${edr}`:null,
    kpCo&&kpCo!==edr?`Компанія / обʼєкт: ${kpCo}`:null, L?`Мова сторінки: ${LANG.toUpperCase()} (${location.pathname})`:null].filter(Boolean).join('\n');
  const btn=document.getElementById('sendBtn'); if(btn){ btn.disabled=true; btn.textContent=t('Надсилаємо…'); }
  let ok=false, num=ord;
  try{ // кабінет клієнта: замовлення зберігається в базі (якщо сервер увімкнено)
    const r=await fetch('/api/orders',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({cart,name:nm,phone:ph,delivery:np,company:edr||kpCo,payment:payMethod,promo:promo&&promo.code,lang:LANG})});
    if(r.ok){ const d=await r.json(); if(d.number){ ok=true; num=d.number; } }
    else if(r.status===400){ // сервер відхилив кошик (мінімум 10 шт, мін. сума) — показуємо причину, не обходимо перевірку
      const d=await r.json().catch(()=>null);
      if(d&&d.error){ if(btn){ btn.disabled=false; btn.textContent=t('Надіслати заявку'); } toast(L?t('Заявку не прийнято: перевірте мінімум — {m} шт кожної позиції і замовлення від $500.',{m:MINQ()}):d.error); return; }
    }
  }catch(e){}
  if(!ok) try{
    const r=await fetch('https://n8n.china-opt-shop.pp.ua/webhook/contact-form',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nm||'Без імені',phone:ph,service:'Оздоба — комплектація',area:'',message,source:'cas-develop.com'+location.pathname,form:'ozdoba-cart',lang:LANG,page:location.pathname})});
    ok=r.ok;
  }catch(e){ ok=false; }
  if(!ok){
    if(btn){ btn.disabled=false; btn.textContent=t('Надіслати заявку'); }
    toast(t('Не вдалося надіслати. Подзвоніть +380 97 866 77 55 або напишіть нам у Telegram'));
    return;
  }
  document.getElementById('payBody').innerHTML=`
    <div class="done"><div class="ring">✓</div>
      <h2 style="font-size:25px;margin-bottom:8px">${t('Заявку {n} прийнято',{n:num})}</h2>
      <p style="color:var(--muted);font-size:13.5px;margin:0 auto;max-width:34ch">${t('Менеджер звʼяжеться з вами в робочий час, підтвердить наявність, ціну й строк поставки і надішле рахунок, посилання на оплату або реквізити.')}</p>
      <div class="priceline" style="justify-content:center"><span class="big">${money(g)}</span></div></div>
    ${acct&&!L?'<a class="btn" style="text-decoration:none" href="/kabinet">Мої замовлення</a>':''}
    <button class="btn ghost" onclick="reset()">${t('До каталогу')}</button>`;
  try{ if(window.clarity){ clarity('set','lead_form',L?'ozdoba-cart-'+LANG:'ozdoba-cart'); clarity('event','lead_submit'); } }catch(e){}
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
    const a=document.getElementById('accLink'); if(a){ a.hidden=false; a.title=acct?(acct.name||t('Кабінет')):t('Увійти'); }
  }).catch(()=>{});
}
function boot(d, l){ account();
  if(l&&l.ui) L=l;
  DATA=d; IT=d.items; BU=d.bundles; VOLTXT=VOLTXT_(); for(const k in d.art) ART[k]=S(d.art[k]);
  try{ JSON.parse(localStorage.getItem('ozd-cart')||'[]').forEach(c=>{ if(byId(c.id)) cart.push({...c,qty:Math.max(MINQ(),Math.round(Number(c.qty)||0))}); });
       if(!['card','invoice','cash','usdt'].includes(payMethod)) payMethod='card';
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
/* ===================== КП (комерційна пропозиція, PDF через друк браузера) ===================== */
/* Дані КП: позиції кошика або комплекту (кількості з шторки комплекту). Рендер і друк — /assets/ozdoba/kp.v1.js,
   вантажиться лише по кліку (без бібліотек: окреме вікно-документ з print-CSS → «Зберегти як PDF»). */
function kpData(kitId){
  const b = kitId ? BU.find(x=>x.id===kitId) : null;
  const src = b ? b.rows.map((r,n)=>{ const i=byId(r.id); return {i, ci:-1, si:defS(i), qty: bq[n]!=null ? bq[n] : r.q}; }).filter(r=>r.qty>0)
                : cart.map(c=>({i:byId(c.id), ci:c.ci, si:c.si, qty:c.qty}));
  const lines = src.map(r=>{ const i=r.i, s=SS(i), p=price(i,r.ci,r.si);
    return {sku:'OZD-'+i.id, name:nm(i), url:location.origin+'/ozdoba/'+i.slug, img:i.img?location.origin+'/'+i.img+'-400.webp':'',
      opt:[colN(col(i,r.ci)[0]), s?sizeN(s[r.si][0]):''].filter(Boolean).join(' · '), qty:r.qty, unit:unitN(i.unit),
      price:p, sum:p==null?null:p*r.qty, low:r.qty<MINQ()}; });
  const g = lines.reduce((a,x)=>a+(x.sum||0),0);
  let d = null;
  if(b){ const v=volPct(g); if(v) d={label:`${t('Знижка за обсягом')} −${v}%`, pct:v}; }
  else { const x=disc(); if(x) d={label:discLabel(x), pct:x.pct}; }
  const da = d ? Math.round(g*d.pct/100) : 0;
  return {lang:LANG, kit:b?bN(b):'', company:(kpCo||'').trim(), lines, goods:g, disc:d, discAmount:da, total:g-da,
    onreq:lines.filter(x=>x.price==null).length, low:lines.filter(x=>x.low).length, minq:MINQ(), minOrder:MIN_ORDER,
    vol:VOL(), money, page:location.origin+location.pathname};
}
let kpLoading=null;
function kpDownload(kitId){
  const co=document.getElementById('kpCo'); if(co) kpCo=co.value;
  const data=kpData(kitId);
  if(!data.lines.length){ toast(t('Кошик порожній — додайте товари з каталогу')); return; }
  try{ if(window.clarity) clarity('event','kp_download'); }catch(e){}
  const go=()=>window.OZD_KP ? window.OZD_KP(data) : toast(t('Не вдалося підготувати КП — оновіть сторінку'));
  if(window.OZD_KP){ go(); return; }
  if(!kpLoading) kpLoading=new Promise((ok,no)=>{ const s=document.createElement('script');
    const m=document.querySelector('meta[name="ozd-kp"]'); s.src=m?m.content:'/assets/ozdoba/kp.v1.js'; s.onload=ok; s.onerror=()=>{kpLoading=null;no();}; document.head.appendChild(s); });
  toast(t('Готуємо КП…'));
  kpLoading.then(go, ()=>toast(t('Не вдалося підготувати КП — оновіть сторінку')));
}

const i18nEl=document.getElementById('ozd-i18n');
Promise.all([fetch(document.getElementById('ozd-data').href).then(r=>r.json()),
             i18nEl ? fetch(i18nEl.href).then(r=>r.json()) : null]).then(([d,l])=>boot(d,l))
  .catch(()=>{ const c=document.getElementById('cnt'); if(c) c.textContent=t('Каталог не завантажився — оновіть сторінку'); });
