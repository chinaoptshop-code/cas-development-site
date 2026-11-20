// Юніт-тести ставок і математики калькулятора (кілька позицій одразу)/квізу/сцен (без браузера). Запуск: node tools/tests/calc.mjs (код 1 при помилках)
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

// конфіг калькулятора — той, що стоїть на сторінці (uk) і в усіх 10 мовах. Кілька позицій одразу (Михайло 20.11.2026):
// sel = {позиція: ключ ставки варіанта}, a — площа м² (усі, крім ландшафту), s — сотки (ландшафт); кожна позиція — один рядок
const PAGES = ['kalkuliator-remontu', 'ru/kalkulyator-remonta', 'en/renovation-cost-calculator', 'es/calculadora-reforma', 'zh/renovation-calculator',
  'pl/kalkulator-remontu', 'de/renovierungskosten-rechner', 'fr/calculateur-renovation', 'pt/calculadora-obras', 'ar/renovation-calculator'];
const html = f => read(f + '.html');
const cfg = f => JSON.parse(html(f).match(/<script type="application\/json" id="cCfg">([\s\S]*?)<\/script>/)[1]);
const C = cfg('kalkuliator-remontu');
const { casCalcPick } = ctx;
const rows = o => JSON.parse(JSON.stringify(casCalcRows(C, o)));
const pick = q => JSON.parse(JSON.stringify(casCalcPick(C, q)));
const brief = r => r.rows.map(x => [x.key, x.v, x.min]);
it('головний сценарій: дизайн + ремонт + меблювання на одну площу — 3 рядки, сума = сума рядків, мінімум $2 500 лише на дизайн', () => {
  const r = rows({ R: 0, sel: { design: 'dz', reno: 'reno', furn: 'furn' }, a: 60, s: 0 });
  eq(brief(r), [['dz', 2500, true], ['reno', 33000, false], ['furn', 15000, false]]);
  eq([r.s, r.est, r.n], [50500, false, 3]); eq(r.s, r.rows.reduce((t, x) => t + x.v, 0), 'сума рядків');
  const big = rows({ R: 0, sel: { design: 'dz', reno: 'reno', furn: 'furn' }, a: 100, s: 0 }); // 100 м²: дизайн $3 000 — мінімум не діє
  eq(brief(big), [['dz', 3000, false], ['reno', 55000, false], ['furn', 25000, false]]); eq(big.s, 83000);
  const tiny = rows({ R: 0, sel: { design: 'dz', reno: 'reno', furn: 'furn' }, a: 4, s: 0 }); // мінімум не «підтягує» всю суму: 2 500 + 2 200 + 1 000
  eq([tiny.s, tiny.rows.filter(x => x.min).map(x => x.id)], [5700, ['design']]);
});
it('10 мов: калькулятор на сторінці, конфіг однаковий за структурою; плитки, уточнення й поля — у розмітці', () => {
  PAGES.forEach(f => { const c = cfg(f), h = html(f);
    eq([c.it, c.df, c.x, c.rn, c.mx], [C.it, C.df, C.x, C.rn, C.mx], f);
    eq(Object.keys(c.rl).sort(), ['arch', 'box', 'dz', 'full', 'furn', 'key', 'land', 'office', 'plan', 'reno'], f + ': назви рядків');
    ['bad', 'mxn', 'mn', 'est', 'frm', 'msg', 'sv', 'pl', 'nb', 'nm'].forEach(k => { if (!c[k]) throw new Error(f + ': немає ' + k); });
    eq((h.match(/<button type="button" data-k="/g) || []).length, 6, f + ': плитки');
    eq((h.match(/<button type="button" data-p="/g) || []).length, 7, f + ': варіанти (3 пакети + 2 ремонти + 2 будівництва)');
    eq((h.match(/data-k="reno" aria-pressed="true"/g) || []).length, 1, f + ': типовий вибір — ремонт');
    if (/<select|id="cFurn"|id="cKind"/.test(h.slice(h.indexOf('<section id="calc"'), h.indexOf('id="cCfg"')))) throw new Error(f + ': лишився список/прапорець');
    ['id="cArea"', 'id="cLand"', 'id="cPick"', 'id="cIt"', 'id="cV"'].forEach(x => { if (!h.includes(x)) throw new Error(f + ': немає ' + x); });
    const tiles = h.slice(h.indexOf('id="cIt"'), h.indexOf('id="cV"'));
    if (/≈/.test(tiles) || (tiles.match(/<small data-nofx>/g) || []).length !== 6) throw new Error(f + ': на плитках друга валюта (JS показує лише $ — текст стрибне) або немає data-nofx');
  });
  eq(C.it.map(t => t[0]), ['design', 'reno', 'furn', 'build', 'arch', 'land']);
  eq(C.it.flatMap(t => t[1]).sort(), Object.keys(R).sort(), 'позиції покривають рівно ставки rates.py — нічого зайвого');
});
it('Європа: ремонт $850, дизайн мін. $4 000, меблювання $400; офіс, планувальний, повний, ландшафт — за кошторисом', () => {
  const r = rows({ R: 1, sel: { design: 'dz', reno: 'reno', furn: 'furn' }, a: 10, s: 0 });
  eq(brief(r), [['dz', 4000, true], ['reno', 8500, false], ['furn', 4000, false]]); eq(r.s, 16500);
  const o = rows({ R: 1, sel: { reno: 'office' }, a: 100, s: 0 }); eq([o.s, o.est, o.rows.length], [0, true, 1]);
  const pl = rows({ R: 1, sel: { design: 'plan', reno: 'reno' }, a: 100, s: 0 }); eq([pl.s, pl.est], [85000, true]);
  const h = rows({ R: 1, sel: { build: 'key', arch: 'arch', land: 'land' }, a: 150, s: 10 }); eq([brief(h), h.s, h.est], [[['key', 255000, false], ['arch', 2700, false], ['land', null, false]], 257700, true]);
});
it('варіанти — у межах однієї позиції: один пакет дизайну, квартира АБО офіс, коробка АБО під ключ', () => {
  eq(brief(rows({ R: 0, sel: { design: 'full', furn: 'furn' }, a: 100, s: 0 })), [['full', 4500, false], ['furn', 25000, false]]);
  eq(brief(rows({ R: 0, sel: { design: 'plan' }, a: 100, s: 0 })), [['plan', 2500, true]]);
  eq(brief(rows({ R: 0, sel: { reno: 'office' }, a: 100, s: 0 })), [['office', 35000, false]]);
  eq(brief(rows({ R: 0, sel: { build: 'box' }, a: 150, s: 0 })), [['box', 90000, false]]);
  eq(brief(rows({ R: 0, sel: { reno: 'nope', design: 'reno' }, a: 100, s: 0 })), [], 'чужий ключ варіанта — рядка немає');
});
it('ремонт і будівництво разом не рахуються (одна площа): із групи — лише перша позиція', () => {
  const r = rows({ R: 0, sel: { reno: 'reno', build: 'key', furn: 'furn' }, a: 100, s: 0 });
  eq([brief(r), r.s, r.n], [[['reno', 55000, false], ['furn', 25000, false]], 80000, 2]);
});
it('ландшафт у сотках разом із позиціями за м²: своя площа, сума — разом', () => {
  const r = rows({ R: 0, sel: { build: 'key', arch: 'arch', design: 'dz', furn: 'furn', land: 'land' }, a: 120, s: 12.5 });
  eq(r.rows.map(x => [x.key, x.u, x.a, x.v]), [['dz', 'm', 120, 3600], ['furn', 'm', 120, 30000], ['key', 'm', 120, 132000], ['arch', 'm', 120, 1440], ['land', 's', 12.5, 625]]);
  eq([r.s, r.n], [167665, 5]);
  eq(brief(rows({ R: 0, sel: { land: 'land' }, a: 60, s: 12.5 })), [['land', 625, false]], 'лише ландшафт — площа м² не враховується');
  eq(rows({ R: 0, sel: { land: 'land', reno: 'reno' }, a: 60, s: 0 }).rows.map(x => x.key), ['reno'], 'сотки порожні — рядка ландшафту немає');
});
it('нічого не вибрано — жодного рядка й суми; площа 0 / NaN / відʼємна — сума 0, без NaN', () => {
  eq(rows({ R: 0, sel: {}, a: 60, s: 10 }), { rows: [], s: 0, est: false, n: 0 });
  eq(rows({ R: 0, a: 60, s: 10 }).n, 0);
  [0, NaN, -10, Infinity].forEach(a => { const r = rows({ R: 0, sel: { design: 'dz', reno: 'reno', furn: 'furn' }, a, s: a }); eq([r.s, r.rows.length, r.n], [0, 0, 3], String(a)); });
});
it('поля площі: дріб через кому (м² — ціле, сотки — 0,1), межі 100 000 м² і 10 000 соток', () => {
  const p = x => JSON.parse(JSON.stringify(x));
  eq(p(casCalcArea('75,6', false, C.mx.m)).a, 76); eq(p(casCalcArea('12,55', true, C.mx.s)).a, 12.6);
  eq(p(casCalcArea('500000', false, C.mx.m)), { a: 100000, bad: false, cut: true }); eq(p(casCalcArea('20000', true, C.mx.s)), { a: 10000, bad: false, cut: true });
  const a = casCalcArea('75,6', false, C.mx.m).a, s = casCalcArea('12,5', true, C.mx.s).a;
  eq(rows({ R: 0, sel: { reno: 'reno', land: 'land' }, a, s }).s, 76 * 550 + 625);
});
it('посилання ?k=…: старі значення списку вибирають одну позицію; кілька — через кому; сміття — типовий вибір', () => {
  eq(pick('remont'), { reno: 'reno' }); eq(pick('office'), { reno: 'office' }); eq(pick('house'), { build: 'box' }); eq(pick('housekey'), { build: 'key' });
  eq(pick('design'), { design: 'dz' }); eq(pick('arch'), { arch: 'arch' }); eq(pick('land'), { land: 'land' });
  eq(pick('design,remont,furn'), { design: 'dz', reno: 'reno', furn: 'furn' }); eq(pick(' Full , office '), { design: 'full', reno: 'office' });
  eq(pick('plan,design'), { design: 'plan' }, 'варіант важливіший за назву позиції'); eq(pick('remont,housekey'), { reno: 'reno' }, 'несумісні — лишається перша');
  eq(pick(''), {}); eq(pick(null), {}); eq(pick('<script>,__proto__,constructor'), {});
});
it('Python (rates.cost, calc.py) = JS (casCost) на сітці послуг × регіон × площа', () => {
  const areas = [0, 1, 10, 12.5, 60, 83, 100, 1000, 100000];
  const py = JSON.parse(execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, ${JSON.stringify(join(ROOT, 'tools/site'))})
import rates, calc
assert calc.RATE == rates.RATES and calc.PKG['dz'][:2] == rates.RATES['dz'] and calc.FURN == rates.RATES['furn']
print(json.dumps({k: [[rates.cost(k, R, a) for a in ${JSON.stringify(areas)}] for R in (0, 1)] for k in rates.RATES}))`]).toString());
  for (const k of Object.keys(R)) for (const Rg of [0, 1]) eq(areas.map(a => casCost(k, Rg, a)), py[k][Rg], `${k}/${Rg}`);
});
it('сцени й квіз не мають власних чисел ставок (лише casCost/CAS_RATES)', () => {
  const bad = [/\b(550|1100|2500)\b\s*[,;)\]]/, /\*\s*(30|50|250|600|1100)\b/, /RATE\s*=\s*\[\s*600/];
  CONSUMERS.slice(1).forEach(f => { const s = read(f).replace(RX, ''); bad.forEach(rx => { const m = s.match(rx); if (m && !/stroke|width|translate/.test(s.slice(m.index - 60, m.index))) throw new Error(f + ': ' + m[0]); }); });
});
console.log(`\n${n - fails}/${n} OK`);
process.exit(fails ? 1 : 0);
