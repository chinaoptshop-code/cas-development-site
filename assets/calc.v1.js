/* Калькулятор вартості (9 мов) — логіка; розмітку й конфіг (підписи, ключі ставок) генерує tools/site/calc.py, конфіг — <script type="application/json" id="cCfg">.
   Ставки й математика рядка — rates-блок нижче (ЗГЕНЕРОВАНО tools/site/rates.py, той самий у квізі й сценах). Тести — node tools/tests/calc.mjs.
   Запуск після DOMContentLoaded: casUsd з site-chrome.v1.js (defer) уже є. */
/*rates*/ /* ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити */
var CAS_RATES = {"reno":[550,850],"office":[350,null],"box":[600,900],"key":[1100,1700],"arch":[12,18],"land":[50,null],"furn":[250,400],"plan":[6,null],"dz":[30,45],"full":[45,null]}, CAS_DMIN = [2500, 4000], CAS_DZ = ["plan", "dz", "full"];
/* сума рядка: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає (за кошторисом) або площа ≤ 0 */
function casCost(k, R, a) { var r = CAS_RATES[k], i = R ? 1 : 0, v = r ? r[i] : null; if (v == null || !(a > 0) || !isFinite(a)) return null; var s = v * a; if (CAS_DZ.indexOf(k) >= 0) s = Math.max(s, CAS_DMIN[i]); return Math.round(s); }
/* число з поля вводу: кома або крапка, пробіли між тисячами; NaN — не число */
function casParseNum(s) { s = String(s == null ? '' : s).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'); return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? +s : NaN; }
/*/rates*/

/* Чиста функція розрахунку (без DOM): C — конфіг cCfg, o = {k: послуга, R: 0 Україна | 1 Європа, P: пакет дизайну '0'|'plan'|'dz'|'full', f: меблювання, a: площа (м² або сотки для land)}.
   → {rows: [{id, n: індекс назви, key, r: ставка|null, a, v: сума|null, min: діє мінімум}], s: сума відомих рядків, est: є рядки «за кошторисом»} */
function casCalcRows(C, o) {
  var rows = [], k = o.k, a = o.a > 0 && isFinite(o.a) ? o.a : 0, i = o.R ? 1 : 0;
  function add(id, key, n) {
    var r = CAS_RATES[key][i], v = casCost(key, o.R, a);
    rows.push({ id: id, n: n, key: key, r: r, a: a, v: v, min: v != null && CAS_DZ.indexOf(key) >= 0 && r * a < CAS_DMIN[i] });
  }
  if (C.kk[k]) add('k', C.kk[k], 0);
  var P = k === 'design' && (!o.P || o.P === '0') ? 'dz' : o.P;
  if (C.wd.indexOf(k) >= 0 && P && P !== '0') add('p', P, C.pk.indexOf(P));
  if (C.wf.indexOf(k) >= 0 && o.f) add('f', 'furn', -1);
  var s = 0, est = false;
  rows.forEach(function (x) { if (x.v == null) est = true; else s += x.v; });
  return { rows: rows, s: s, est: est };
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

function casCalcInit() {
  var D = document.getElementById('cCfg'); if (!D) return;
  var C = JSON.parse(D.textContent), $ = function (i) { return document.getElementById(i); }, f = function (n) { return casUsd(n); },
    R = 0, P = '0', mem = { m: '60', s: '10' }, unit = 'm';
  function kind() { return $('cKind').value; }
  function rl(key, u) { var r = CAS_RATES[key][R]; return r == null ? C.est : C.frm + ' ' + f(r) + '/' + u; }
  function sync() {
    var k = kind(), o = $('cKind').options, i, b;
    for (i = 0; i < o.length; i++) { var q = o[i].value; o[i].text = C.k[i] + ' — ' + rl(C.kk[q] || 'dz', q === 'land' ? C.sot : C.m2); }
    $('cDzW').hidden = C.wd.indexOf(k) < 0; $('cFurnW').hidden = C.wf.indexOf(k) < 0;
    if (k === 'design' && P === '0') P = 'dz';
    b = $('cDz').querySelectorAll('button');
    for (i = 0; i < b.length; i++) {
      var p = b[i].getAttribute('data-p'); b[i].hidden = p === '0' && k === 'design'; b[i].setAttribute('aria-pressed', String(p === P));
      var s = b[i].querySelector('small'); if (s) s.textContent = CAS_RATES[p][R] == null ? C.est : f(CAS_RATES[p][R]) + '/' + C.m2;
    }
    b = $('cReg').querySelectorAll('button'); for (i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', String(+b[i].getAttribute('data-r') === R));
    $('cFurnR').textContent = rl('furn', C.m2);
    var u = k === 'land' ? 's' : 'm';
    if (u !== unit) { mem[unit] = $('cArea').value; unit = u; $('cArea').value = mem[u]; $('cAreaL').textContent = u === 's' ? C.as : C.am; $('cAreaU').textContent = u === 's' ? C.ss : C.m2; }
  }
  function line(x, lab) {
    var u = unit === 's' && x.id === 'k' ? C.sot : C.m2, au = unit === 's' && x.id === 'k' ? C.ss : C.m2, an = casNum(x.a);
    if (x.v == null) return [lab, C.est];
    if (x.min) return [lab, C.mn + ' ' + f(x.v)];
    return [lab + ' · ' + an + ' ' + au + ' × ' + f(x.r) + '/' + u, f(x.v)];
  }
  function calc() {
    sync();
    var k = kind(), ki = $('cKind').selectedIndex, ar = casCalcArea($('cArea').value, unit === 's', C.mx[unit]), a = ar.a, notes = [C.nb];
    var res = casCalcRows(C, { k: k, R: R, P: P, f: $('cFurn').checked, a: a }), labs = [];
    res.rows.forEach(function (x) { labs.push(line(x, x.id === 'k' ? C.k[ki] : x.id === 'p' ? C.pn[x.n] : C.fn)); if (x.id === 'p' && x.v != null) notes.push(C.nm.replace('{m}', f(CAS_DMIN[R]))); });
    if (C.rn.indexOf(k) >= 0) { notes.push(C.nr); notes.push(C.n5); } if (k === 'arch') notes.push(C.na); if (R) notes.push(C.ne);
    var s = res.s, ok = !!(a && s), st = !a ? '—' : s ? f(s) : C.est, E = $('cAreaE'), inp = $('cArea');
    inp.setAttribute('aria-invalid', String(ar.bad)); E.hidden = !(ar.bad || ar.cut); E.className = ar.bad ? 'er' : '';
    E.textContent = ar.bad ? C.bad : ar.cut ? C.mxn.replace('{m}', casNum(a) + ' ' + (unit === 's' ? C.ss : C.m2)) : '';
    $('cSumL').hidden = !ok; $('cSum').textContent = st; var X = $('cSumX'); if (!X) { X = document.createElement('span'); X.id = 'cSumX'; $('cSum').parentNode.insertBefore(X, $('cSum').nextSibling); } X.textContent = ok && window.casFx ? casFx(s) : ''; // ≈ €/₴ (fx.py) $('cPlus').hidden = !(ok && res.est);
    var ul = $('cRows'); ul.textContent = '';
    if (a) labs.forEach(function (l) { var li = document.createElement('li'), sp = document.createElement('span'), em = document.createElement('em'); sp.textContent = l[0]; em.textContent = l[1]; li.appendChild(sp); li.appendChild(em); ul.appendChild(li); });
    ul.hidden = !a; $('cNote').textContent = notes.join(' ');
    return { a: a, t: a ? labs.map(function (l) { return l[0] + ': ' + l[1]; }).join(' · ') : '', s: st, ok: ok, est: res.est, k: k, ki: ki };
  }
  $('cReg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { R = +b.getAttribute('data-r'); calc(); } });
  $('cDz').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { P = b.getAttribute('data-p'); calc(); } });
  ['cKind', 'cArea', 'cFurn'].forEach(function (i) { $(i).addEventListener('input', calc); $(i).addEventListener('change', calc); });
  $('cArea').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); calc(); } });
  calc();
  $('cSend').addEventListener('click', function () {
    var c = calc(), ar = $('oArea'), m = $('oMsg'), fo = $('of'), rg = R ? C.eu : C.ua, svc = C.k[c.ki] + ' · ' + rg;
    if (ar && c.a) ar.value = unit === 's' ? Math.round(c.a * 100) : c.a;
    if (fo) { fo.setAttribute('data-service', C.sv + ': ' + svc); fo.setAttribute('data-form', 'calc'); fo.setAttribute('data-source', (fo.getAttribute('data-source') || location.host + location.pathname).replace(/#.*$/, '') + '#calc'); }
    if (m && c.a && (!m.value || m.value.indexOf(C.msg) === 0))
      m.value = C.msg + ' (' + rg + (unit === 's' ? ', ' + c.a + ' ' + C.ss : '') + '): ' + c.t + (c.ok ? ' = ' + C.frm + ' ' + c.s + (c.est ? ' ' + C.pl : '') : '');
    var dt = m && m.closest('details'); if (dt) dt.open = true;
  });
}
if (typeof document !== 'undefined') { if (document.readyState === 'complete') casCalcInit(); else document.addEventListener('DOMContentLoaded', casCalcInit); }
