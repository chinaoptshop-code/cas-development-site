// ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити
export const RATES = {"reno":[550,850],"office":[350,null],"box":[600,900],"key":[1100,1700],"arch":[12,18],"land":[50,null],"furn":[250,400],"plan":[6,null],"dz":[30,45],"full":[45,null]};
export const DMIN = [2500, 4000];
export const DESIGN = ["plan", "dz", "full"];
// ставка регіону (eu — Європа, ~+50%) або null
export const rateOf = (k, eu) => { const r = RATES[k]; return r ? r[eu ? 1 : 0] : null; };
// сума «від»: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає або площа ≤ 0 (як casCost)
export function cost(k, eu, a) { const v = rateOf(k, eu); if (v == null || !(a > 0) || !Number.isFinite(a)) return null; let s = v * a; if (DESIGN.includes(k)) s = Math.max(s, DMIN[eu ? 1 : 0]); return Math.round(s); }
