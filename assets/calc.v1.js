/* Калькулятор вартості (10 мов) — логіка; розмітку й конфіг (підписи, позиції, ключі ставок) генерує tools/site/calc.py, конфіг — <script type="application/json" id="cCfg">.
   Кілька позицій одразу (Михайло 20.11.2026): плитки #cIt (aria-pressed, можна кілька) → уточнення вибраних #cV → площа (м²) і сотки для ландшафту → сума й рядки.
   Ставки й математика рядка — rates-блок нижче (ЗГЕНЕРОВАНО tools/site/rates.py, той самий у квізі й сценах). Тести — node tools/tests/calc.mjs, interact.mjs.
   Запуск після DOMContentLoaded: casUsd з site-chrome.v1.js (defer) уже є. */
/*rates*/ /* ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити */
var CAS_RATES = {"reno":[550,850],"office":[350,null],"box":[600,900],"key":[1100,1700],"arch":[12,18],"land":[50,null],"furn":[250,400],"plan":[6,null],"dz":[30,45],"full":[45,null]}, CAS_DMIN = [2500, 4000], CAS_DZ = ["plan", "dz", "full"];
/* сума рядка: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає (за кошторисом) або площа ≤ 0 */
function casCost(k, R, a) { var r = CAS_RATES[k], i = R ? 1 : 0, v = r ? r[i] : null; if (v == null || !(a > 0) || !isFinite(a)) return null; var s = v * a; if (CAS_DZ.indexOf(k) >= 0) s = Math.max(s, CAS_DMIN[i]); return Math.round(s); }
/* число з поля вводу: кома або крапка, пробіли між тисячами; NaN — не число */
function casParseNum(s) { s = String(s == null ? '' : s).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'); return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? +s : NaN; }
/*/rates*/

/* Чиста функція розрахунку (без DOM). C — конфіг cCfg: it = [[позиція, [ключі ставок-варіанти], типовий], …], x — групи позицій, що не поєднуються.
   o = {R: 0 Україна | 1 Європа, sel: {позиція: ключ ставки вибраного варіанта}, a: площа м² (усі позиції, крім ландшафту), s: сотки (ландшафт)}.
   Кожна позиція — один рядок (варіанти взаємовиключні); із групи x рахується лише перша (одна площа — не два ремонти/будівництва); мінімум дизайну — лише на його рядок.
   → {rows: [{id, key, u: 'm'|'s', r: ставка|null, a, v: сума|null, min: діє мінімум}], s: сума відомих рядків, est: є рядки «за кошторисом», n: вибрано позицій} */
function casCalcRows(C, o) {
  var rows = [], i = o.R ? 1 : 0, sel = o.sel || {}, n = 0, s = 0, est = false, off = {};
  (C.x || []).forEach(function (g) { var got = false; g.forEach(function (id) { if (sel[id]) { if (got) off[id] = 1; got = true; } }); });
  C.it.forEach(function (t) {
    var id = t[0], key = sel[id]; if (!key || off[id] || t[1].indexOf(key) < 0) return;
    n++;
    var u = id === 'land' ? 's' : 'm', a = u === 's' ? o.s : o.a; if (!(a > 0) || !isFinite(a)) return;
    var r = CAS_RATES[key][i], v = casCost(key, o.R, a);
    rows.push({ id: id, key: key, u: u, r: r, a: a, v: v, min: v != null && CAS_DZ.indexOf(key) >= 0 && r * a < CAS_DMIN[i] });
    if (v == null) est = true; else s += v;
  });
  return { rows: rows, s: s, est: est, n: n };
}
/* Поле площі: кома/крапка; NaN або < 0 — помилка; округлення (м² — ціле, сотки — 0,1) і стеля. → {a, bad, cut} */
function casCalcArea(raw, sot, max) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { a: 0, bad: false, cut: false };
  var v = casParseNum(s);
  if (!isFinite(v) || v < 0) return { a: 0, bad: true, cut: false };
  v = sot ? Math.round(v * 10) / 10 : Math.round(v);
  return v > max ? { a: max, bad: false, cut: true } : { a: v, bad: false, cut: false };
}
/* Параметр посилання ?k=…: старі значення списку (remont, office, house, housekey, design, arch, land) або кілька через кому
   (позиції design, reno, furn, build, arch, land чи варіанти plan, dz, full, box, key). → {позиція: ключ ставки} у порядку параметра; сміття ігнорується */
function casCalcPick(C, q) {
  var OLD = { remont: 'reno', house: 'box', housekey: 'key' }, sel = {};
  String(q == null ? '' : q).split(',').forEach(function (t) {
    t = t.trim().toLowerCase(); t = OLD[t] || t; if (!t) return;
    C.it.forEach(function (it) { if (it[1].indexOf(t) >= 0) sel[it[0]] = t; else if (it[0] === t && !sel[t]) sel[t] = it[1][it[2]]; });
  });
  (C.x || []).forEach(function (g) { var got = false; g.forEach(function (id) { if (sel[id]) { if (got) delete sel[id]; got = true; } }); });
  return sel;
}

function casCalcInit() {
  var D = document.getElementById('cCfg'); if (!D) return;
  var C = JSON.parse(D.textContent), $ = function (i) { return document.getElementById(i); }, f = function (n) { return casUsd(n); },
    R = 0, S = {}, V = {}, ord = [], IT = $('cIt'), VV = $('cV');
  /* RTL (ar): «$2 500» одразу після арабських літер bidi показує як «2 500$» (цифри стають «арабським числом», «$» — нейтральний).
     У видимих рядках результату й примітці ціна йде в ізоляті LTR (U+2066…U+2069) — «$» ліворуч від числа, як у casUsd і на плитках; у заявку — без них. */
  var RTL = (document.documentElement.getAttribute('dir') || '') === 'rtl';
  function iso(s) { return RTL ? String(s).replace(/\$\d[\d\u202f\u00a0,.]*\d|\$\d/g, function (m) { return '\u2066' + m + '\u2069'; }) : s; }
  C.it.forEach(function (t) { V[t[0]] = t[1][t[2]]; });
  function on(id, key) { /* вибрати позицію; несумісні з нею (C.x) — зняти */
    if (key) V[id] = key; S[id] = V[id]; if (ord.indexOf(id) < 0) ord.push(id);
    C.x.forEach(function (g) { if (g.indexOf(id) >= 0) g.forEach(function (o) { if (o !== id) off(o); }); });
  }
  function off(id) { delete S[id]; var i = ord.indexOf(id); if (i >= 0) ord.splice(i, 1); }
  var q = '', pk; try { q = new URLSearchParams(location.search).get('k') || ''; } catch (e) {}
  pk = casCalcPick(C, q); if (!Object.keys(pk).length) { pk = {}; C.df.forEach(function (id) { pk[id] = V[id]; }); }
  Object.keys(pk).forEach(function (id) { on(id, pk[id]); });
  function rl(key, u) { var r = CAS_RATES[key][R]; return r == null ? C.est : C.frm + '\u00a0' + f(r) + '/' + u; } /* нерозривний пробіл — як у розмітці (chrome.price_fmt): текст плитки не змінюється після старту */
  function sync() {
    var b = IT.querySelectorAll('button'), i, j, id, g, vb, p, sm;
    for (i = 0; i < b.length; i++) {
      id = b[i].getAttribute('data-k'); b[i].setAttribute('aria-pressed', String(!!S[id]));
      sm = b[i].querySelector('small'); if (sm) sm.textContent = rl(V[id], id === 'land' ? C.sot : C.m2);
    }
    g = VV.children; var vis = false;
    for (i = 0; i < g.length; i++) {
      id = g[i].getAttribute('data-k'); g[i].hidden = !S[id]; if (S[id]) vis = true; vb = g[i].querySelectorAll('button');
      for (j = 0; j < vb.length; j++) {
        p = vb[j].getAttribute('data-p'); vb[j].setAttribute('aria-pressed', String(p === V[id]));
        sm = vb[j].querySelector('small'); if (sm) sm.textContent = CAS_RATES[p][R] == null ? C.est : f(CAS_RATES[p][R]) + '/' + C.m2;
      }
    }
    VV.hidden = !vis; /* порожній блок уточнень не лишає зайвого проміжку */
    b = $('cReg').querySelectorAll('button'); for (i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', String(+b[i].getAttribute('data-r') === R));
    var m2 = false, any = false; for (id in S) { any = true; if (id !== 'land') m2 = true; }
    $('cLandW').hidden = !S.land; $('cAreaW').hidden = any && !m2; /* лише ландшафт — лише поле соток */
  }
  function area(inp, E, sot, use) { /* поле → площа; помилка й стеля — під полем */
    var ar = casCalcArea(inp.value, sot, C.mx[sot ? 's' : 'm']), show = use && (ar.bad || ar.cut);
    inp.setAttribute('aria-invalid', String(use && ar.bad)); E.hidden = !show; E.className = 'ce' + (ar.bad ? ' er' : '');
    E.textContent = !show ? '' : ar.bad ? C.bad : C.mxn.replace('{m}', casNum(ar.a) + ' ' + (sot ? C.ss : C.m2));
    return ar.a;
  }
  function line(x) {
    var lab = C.rl[x.key], u = x.u === 's' ? C.sot : C.m2, au = x.u === 's' ? C.ss : C.m2;
    if (x.v == null) return [lab, C.est];
    if (x.min) return [lab, C.mn + ' ' + f(x.v)];
    return [lab + ' · ' + casNum(x.a) + ' ' + au + ' × ' + f(x.r) + '/' + u, f(x.v)];
  }
  function calc() {
    sync();
    var a = area($('cArea'), $('cAreaE'), false, !$('cAreaW').hidden), sq = area($('cLand'), $('cLandE'), true, !!S.land), notes = [C.nb];
    var res = casCalcRows(C, { R: R, sel: S, a: a, s: sq }), labs = res.rows.map(line), has = res.rows.length > 0;
    res.rows.forEach(function (x) { if (x.id === 'design' && x.v != null) notes.push(C.nm.replace('{m}', f(CAS_DMIN[R]))); });
    if (S.reno) { notes.push(C.nr); notes.push(C.n5); } if (S.arch) notes.push(C.na); if (R) notes.push(C.ne);
    var s = res.s, ok = !!s, st = !has ? '—' : s ? f(s) : C.est;
    $('cSumL').hidden = !ok; $('cSum').hidden = !res.n; $('cPick').hidden = !!res.n; $('cSum').textContent = st;
    var X = $('cSumX'); if (!X) { X = document.createElement('span'); X.id = 'cSumX'; $('cSum').parentNode.insertBefore(X, $('cSum').nextSibling); } X.textContent = ok && window.casFx ? casFx(s) : ''; /* ≈ €/₴ — fx.py */ $('cPlus').hidden = !(ok && res.est);
    var ul = $('cRows'); ul.textContent = '';
    labs.forEach(function (l) { var li = document.createElement('li'), sp = document.createElement('span'), em = document.createElement('em'); sp.textContent = iso(l[0]); em.textContent = iso(l[1]); li.appendChild(sp); li.appendChild(em); ul.appendChild(li); });
    ul.hidden = !has; $('cNote').textContent = iso(notes.join(' '));
    var main = null; ord.forEach(function (id) { if (!main && S[id]) main = id; });
    return { a: a, sq: sq, rows: res.rows, t: labs.map(function (l) { return l[0] + ': ' + l[1]; }).join(' · '), s: st, ok: ok, est: res.est, has: has, n: res.n, main: main };
  }
  $('cReg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { R = +b.getAttribute('data-r'); calc(); } });
  /* пояснення під плитками: вибір однієї з несумісних позицій (C.x) зняв іншу — «… рахуємо окремо — лишили “…”» (місце в розмітці зарезервоване,
     висота блоку не змінюється; #cEx — aria-live для читача екрана). Наступна дія з плитками чи варіантами його прибирає. */
  function excl(id) {
    var ps = document.querySelectorAll('#calc .cx>[data-x]'), L = $('cEx'), i, t = '';
    for (i = 0; i < ps.length; i++) { var hit = ps[i].getAttribute('data-x') === id; ps[i].classList.toggle('on', hit); if (hit) t = ps[i].textContent; }
    if (L && L.textContent !== t) L.textContent = t;
  }
  IT.addEventListener('click', function (e) {
    var b = e.target.closest('button'), id, ex = ''; if (!b) return;
    id = b.getAttribute('data-k');
    if (S[id]) off(id);
    else { C.x.forEach(function (g) { if (g.indexOf(id) >= 0) g.forEach(function (o) { if (o !== id && S[o]) ex = id; }); }); on(id); }
    excl(ex); calc();
  });
  VV.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { on(b.closest('[data-k]').getAttribute('data-k'), b.getAttribute('data-p')); excl(''); calc(); } });
  ['cArea', 'cLand'].forEach(function (i) {
    $(i).addEventListener('input', calc); $(i).addEventListener('change', calc);
    $(i).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); calc(); } });
  });
  calc();
  $('cSend').addEventListener('click', function () {
    var c = calc(), ar = $('oArea'), m = $('oMsg'), fo = $('of'), rg = R ? C.eu : C.ua, names = [], svc;
    /* послуга заявки: основна позиція — перша вибрана, далі решта; задовге — «основна +N» (сервер бере ≤ 200 знаків) */
    if (c.main) names.push(C.rl[S[c.main]]);
    C.it.forEach(function (t) { if (S[t[0]] && t[0] !== c.main) names.push(C.rl[S[t[0]]]); });
    svc = names.join(' + '); if (svc.length > 150) svc = names[0] + ' +' + (names.length - 1);
    var m2 = c.rows.some(function (x) { return x.u === 'm'; });
    if (ar && c.has) ar.value = m2 ? c.a : Math.round(c.sq * 100); /* лише ландшафт — сотки в м² */
    if (fo) { fo.setAttribute('data-service', C.sv + ': ' + (svc ? svc + ' · ' : '') + rg); fo.setAttribute('data-form', 'calc'); fo.setAttribute('data-source', (fo.getAttribute('data-source') || location.host + location.pathname).replace(/#.*$/, '') + '#calc'); }
    if (m && c.has && (!m.value || m.value.indexOf(C.msg) === 0))
      m.value = C.msg + ' (' + rg + '): ' + c.t + (c.ok ? ' = ' + C.frm + ' ' + c.s + (c.est ? ' ' + C.pl : '') : '');
    var dt = m && m.closest('details'); if (dt) dt.open = true;
  });
}
if (typeof document !== 'undefined') { if (document.readyState === 'complete') casCalcInit(); else document.addEventListener('DOMContentLoaded', casCalcInit); }
