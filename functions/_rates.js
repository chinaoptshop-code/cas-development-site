// ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити
export const RATES = {"reno":[550,850],"office":[350,null],"box":[600,900],"key":[1100,1700],"arch":[12,18],"land":[50,null],"furn":[250,400],"plan":[6,null],"dz":[30,45],"full":[45,null]};
export const DMIN = [2500, 4000];
export const DESIGN = ["plan", "dz", "full"];
// типи будинку: свої ставки коробки / під ключ [Україна, Європа]; null — за кошторисом (ставки типів чекають підтвердження власника)
export const HOUSE = {"brick":{"box":[null,null],"key":[null,null]},"frame":{"box":[null,null],"key":[null,null]},"lstk":{"box":[null,null],"key":[null,null]},"sip":{"box":[null,null],"key":[null,null]},"sandwich":{"box":[null,null],"key":[null,null]},"modular":{"box":[null,null],"key":[null,null]},"timber":{"box":[null,null],"key":[null,null]}};
// ставка регіону (eu — Європа, ~+50%) або null; t — тип будинку (HOUSE): замінює ставки коробки / під ключ своїми, без типу чи з невідомим — RATES
export const rateOf = (k, eu, t) => { const h = t && Object.hasOwn(HOUSE, t) ? HOUSE[t] : null, r = h && Object.hasOwn(h, k) ? h[k] : (Object.hasOwn(RATES, k) ? RATES[k] : null); const v = r ? r[eu ? 1 : 0] : null; return typeof v === 'number' ? v : null; };
// сума «від»: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає або площа ≤ 0 (як casCost)
export function cost(k, eu, a, t) { const v = rateOf(k, eu, t); if (v == null || !(a > 0) || !Number.isFinite(a)) return null; let s = v * a; if (DESIGN.includes(k)) s = Math.max(s, DMIN[eu ? 1 : 0]); return Math.round(s); }
