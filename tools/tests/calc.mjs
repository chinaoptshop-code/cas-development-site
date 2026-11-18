// Юніт-тести ставок і математики калькулятора/квізу/сцен (без браузера). Запуск: node tools/tests/calc.mjs (код 1 при помилках)
// Ставки — tools/site/rates.py → rates-блок у JS (calc.v1.js, quiz-core.v1.js, сцени); тут — що блок один і той самий скрізь,
// що ставки збігаються з CLAUDE.md, мінімуми, Європа, розбір поля (кома, пробіли, мінус, сміття), стеля, і що Python (rates.cost) = JS (casCost).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0, n = 0;
const it = (name, fn) => { n++; try { fn(); console.log('  ✓ ' + name); } catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + (e.message || e)); } };
const eq = (a, b, m = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${m} очікували ${B}, маємо ${A}`); };
const read = f => readFileSync(join(ROOT, f), 'utf8');

const CONSUMERS = ['calc', 'quiz-core', 'build-anim', 'land-anim', 'resort-plan', 'restaurant-anim', 'water-house'].map(x => `assets/${x}.v1.js`);
const RX = /\/\*rates\*\/[\s\S]*?\/\*\/rates\*\//g;
const blocks = CONSUMERS.map(f => read(f).match(RX) || []);

it('rates-блок — рівно один у кожному JS і однаковий скрізь', () => {
  blocks.forEach((b, i) => eq(b.length, 1, CONSUMERS[i]));
  blocks.forEach((b, i) => { if (b[0] !== blocks[0][0]) throw new Error(CONSUMERS[i] + ' відрізняється від calc.v1.js'); });
});
it('rates-блок актуальний (python3 tools/site/rates.py --check)', () => { execFileSync('python3', [join(ROOT, 'tools/site/rates.py'), '--check'], { stdio: 'pipe' }); });

// калькулятор цілком (без DOM: init не запускається без document)
const ctx = vm.createContext({});
vm.runInContext(read('assets/calc.v1.js'), ctx);
const { casCost, casParseNum, casCalcArea, casCalcRows } = ctx;
const R = JSON.parse(JSON.stringify(ctx.CAS_RATES));

it('ставки = CLAUDE.md: Україна й Європа (+~50%), null — «за кошторисом»', () => {
  eq(R, { reno: [550, 850], office: [350, null], box: [600, 900], key: [1100, 1700], arch: [12, 18], land: [50, null],
          furn: [250, 400], plan: [6, null], dz: [30, 45], full: [45, null] });
  eq(JSON.parse(JSON.stringify(ctx.CAS_DMIN)), [2500, 4000], 'мінімум дизайну');
});
it('casCost: ставка × площа', () => {
  eq(casCost('reno', 0, 60), 33000); eq(casCost('reno', 1, 60), 51000); eq(casCost('office', 0, 100), 35000);
  eq(casCost('box', 0, 150), 90000); eq(casCost('key', 0, 150), 165000); eq(casCost('key', 1, 150), 255000);
  eq(casCost('arch', 0, 200), 2400); eq(casCost('arch', 1, 200), 3600); eq(casCost('furn', 0, 80), 20000); eq(casCost('furn', 1, 80), 32000);
  eq(casCost('land', 0, 12.5), 625); eq(casCost('land', 0, 0.1), 5);
});
it('дизайн: мінімум $2 500 (усі пакети, Україна) і $4 000 (Європа)', () => {
  eq(casCost('dz', 0, 10), 2500); eq(casCost('dz', 0, 100), 3000); eq(casCost('dz', 1, 10), 4000); eq(casCost('dz', 1, 100), 4500);
  eq(casCost('plan', 0, 100), 2500); eq(casCost('plan', 0, 1000), 6000); eq(casCost('full', 0, 20), 2500); eq(casCost('full', 0, 100), 4500);
});
it('casCost: без ставки (Європа: офіс, ландшафт, планувальний, повний) і площа ≤ 0 / NaN / ∞ → null', () => {
  ['office', 'land', 'plan', 'full'].forEach(k => eq(casCost(k, 1, 100), null, k));
  [0, -5, NaN, Infinity, undefined].forEach(a => eq(casCost('reno', 0, a), null, String(a)));
  eq(casCost('nope', 0, 10), null);
});
it('casParseNum: кома (uk/ru), крапка, пробіли тисяч; сміття → NaN', () => {
  eq(casParseNum('12,5'), 12.5); eq(casParseNum('12.5'), 12.5); eq(casParseNum(' 1 000 '), 1000); eq(casParseNum('1 000'), 1000);
  eq(casParseNum('1 000,5'), 1000.5); eq(casParseNum('-5'), -5); eq(casParseNum(',5'), 0.5);
  ['', 'abc', '1e5', '1,2,3', '12м', '--1', null].forEach(s => { if (!Number.isNaN(casParseNum(s))) throw new Error('не NaN: ' + s); });
});
it('casCalcArea: порожнє — без помилки, мінус/сміття — помилка, округлення, стеля', () => {
  const p = x => JSON.parse(JSON.stringify(x));
  eq(p(casCalcArea('', false, 100000)), { a: 0, bad: false, cut: false });
  eq(p(casCalcArea('abc', false, 100000)), { a: 0, bad: true, cut: false });
  eq(p(casCalcArea('-5', false, 100000)), { a: 0, bad: true, cut: false });
  eq(p(casCalcArea('75,4', false, 100000)), { a: 75, bad: false, cut: false });
  eq(p(casCalcArea('12,55', true, 10000)), { a: 12.6, bad: false, cut: false });
  eq(p(casCalcArea('99999999', false, 100000)), { a: 100000, bad: false, cut: true });
});

// квіз: перемикач «Україна / Європа» (Михайло 17.11.2026) — тексти 10 мов, ставки в нотатках лише з rates-блоку, типовий регіон за мовою
const QZ = read('assets/quiz-core.v1.js'); // ядро квізу (quiz.v1.js — лише завантажувач)
it('квіз: 10 мов мають reg/rg/ne, нотатки й мінімум — шаблони {r}/{m}, без зашитих $', () => {
  ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'pt', 'ar'].forEach(l => {
    const m = QZ.match(new RegExp('\\n    ' + l + ': \\{ (reg: [^\\n]+)\\n([\\s\\S]*?)demo:'));
    if (!m) throw new Error(l + ': немає reg/rg/ne');
    if (!/rg: \['[^']+', '[^']+'\], ne: '[^']+'/.test(m[1])) throw new Error(l + ': rg/ne');
    if (/\$\d/.test(m[2])) throw new Error(l + ': зашита ставка $ у текстах (лише {r}/{m} з rates-блоку)');
    if (!/min: '[^']*\{m\}'/.test(m[2]) || (m[2].match(/\{r\}/g) || []).length !== 2) throw new Error(l + ': шаблони {m}/{r}');
  });
  if (!/DEF_REG = UA \? 0 : 1/.test(QZ) || !/var UA = lang === 'uk' \|\| lang === 'ru'/.test(QZ)) throw new Error('типовий регіон: uk/ru — Україна, решта — Європа');
  if (/CAS_RATES\[[^\]]+\]\[0\]|casCost\([^)]*, 0, a\)/.test(QZ)) throw new Error('квіз рахує лише за Україною (зашитий індекс 0)');
});

// конфіг калькулятора — той, що стоїть на сторінці (uk) і в усіх 9 мовах
const PAGES = ['kalkuliator-remontu', 'ru/kalkulyator-remonta', 'en/renovation-cost-calculator', 'es/calculadora-reforma', 'zh/renovation-calculator',
  'pl/kalkulator-remontu', 'de/renovierungskosten-rechner', 'fr/calculateur-renovation', 'ar/renovation-calculator'];
const cfg = f => JSON.parse(read(f + '.html').match(/<script type="application\/json" id="cCfg">([\s\S]*?)<\/script>/)[1]);
const C = cfg('kalkuliator-remontu');
const rows = o => JSON.parse(JSON.stringify(casCalcRows(C, o)));
it('9 мов: калькулятор на сторінці, конфіг однаковий за структурою (ключі ставок, списки)', () => {
  PAGES.forEach(f => { const c = cfg(f); eq([c.kk, c.wd, c.wf, c.rn, c.mx, c.k.length, c.pn.length], [C.kk, C.wd, C.wf, C.rn, C.mx, 7, 4], f);
    ['bad', 'mxn', 'mn', 'est', 'frm', 'msg'].forEach(k => { if (!c[k]) throw new Error(f + ': немає ' + k); }); });
});
it('ремонт 10 м² + дизайн-проєкт + меблювання (Україна): $5 500 + мін. $2 500 + $2 500 = $10 500', () => {
  const r = rows({ k: 'remont', R: 0, P: 'dz', f: true, a: 10 });
  eq(r.rows.map(x => [x.key, x.v, x.min]), [['reno', 5500, false], ['dz', 2500, true], ['furn', 2500, false]]); eq([r.s, r.est], [10500, false]);
});
it('Європа: ремонт $850, дизайн мін. $4 000, меблювання $400; офіс — за кошторисом', () => {
  const r = rows({ k: 'remont', R: 1, P: 'dz', f: true, a: 10 });
  eq(r.rows.map(x => x.v), [8500, 4000, 4000]); eq(r.s, 16500);
  const o = rows({ k: 'office', R: 1, P: '0', f: false, a: 100 }); eq([o.s, o.est], [0, true]);
  const pl = rows({ k: 'remont', R: 1, P: 'plan', f: false, a: 100 }); eq([pl.s, pl.est], [85000, true]);
});
it('дизайн-проєкт без вибору пакета — береться «Дизайн-проєкт»; коробка — без меблювання; ландшафт у сотках', () => {
  eq(rows({ k: 'design', R: 0, P: '0', f: false, a: 60 }).rows.map(x => [x.key, x.v]), [['dz', 2500]]);
  eq(rows({ k: 'design', R: 0, P: 'full', f: true, a: 100 }).rows.map(x => [x.key, x.v]), [['full', 4500], ['furn', 25000]]);
  eq(rows({ k: 'house', R: 0, P: '0', f: true, a: 150 }).rows.map(x => [x.key, x.v]), [['box', 90000]]);
  eq(rows({ k: 'arch', R: 1, P: 'dz', f: true, a: 200 }).rows.map(x => [x.key, x.v]), [['arch', 3600]]);
  eq(rows({ k: 'land', R: 0, P: '0', f: false, a: 12.5 }).s, 625); eq(rows({ k: 'land', R: 1, P: '0', f: false, a: 10 }).est, true);
});
it('площа 0 / NaN / відʼємна — сума 0, без NaN', () => {
  [0, NaN, -10, Infinity].forEach(a => { const r = rows({ k: 'remont', R: 0, P: 'dz', f: true, a }); eq(r.s, 0, String(a)); });
});
it('Python (rates.cost, calc.py) = JS (casCost) на сітці послуг × регіон × площа', () => {
  const areas = [0, 1, 10, 12.5, 60, 83, 100, 1000, 100000];
  const py = JSON.parse(execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, ${JSON.stringify(join(ROOT, 'tools/site'))})
import rates, calc
assert calc.RATE['remont'] == rates.RATES['reno'] and calc.PKG['dz'][:2] == rates.RATES['dz'] and calc.FURN == rates.RATES['furn']
print(json.dumps({k: [[rates.cost(k, R, a) for a in ${JSON.stringify(areas)}] for R in (0, 1)] for k in rates.RATES}))`]).toString());
  for (const k of Object.keys(R)) for (const Rg of [0, 1]) eq(areas.map(a => casCost(k, Rg, a)), py[k][Rg], `${k}/${Rg}`);
});
it('сцени й квіз не мають власних чисел ставок (лише casCost/CAS_RATES)', () => {
  const bad = [/\b(550|1100|2500)\b\s*[,;)\]]/, /\*\s*(30|50|250|600|1100)\b/, /RATE\s*=\s*\[\s*600/];
  CONSUMERS.slice(1).forEach(f => { const s = read(f).replace(RX, ''); bad.forEach(rx => { const m = s.match(rx); if (m && !/stroke|width|translate/.test(s.slice(m.index - 60, m.index))) throw new Error(f + ': ' + m[0]); }); });
});
console.log(`\n${n - fails}/${n} OK`);
process.exit(fails ? 1 : 0);
