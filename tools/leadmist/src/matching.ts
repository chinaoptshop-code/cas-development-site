// Підбір отримувачів: категорія ∩ регіон ∩ бюджет ∩ активний ∩ не сам рекомендувач ∩ не на паузі.
// Сортування: рейтинг ↓, швидкість реакції ↑ (невідома — в кінець), закриті угоди ↓, id ↑.

import { ALL_UA, BUDGET_BANDS, type BudgetBand, TOP_N } from './constants';

export interface Candidate {
  id: number;
  status: string;
  categories: string[];
  regions: string[];
  budget_min: number | null;
  budget_max: number | null;
  paused_until: string | null;
  rating_avg: number | null;
  avg_response_min: number | null;
  deals_closed: number;
}

export interface LeadForMatch {
  referrer_id: number;
  category: string;
  region: string;
  budget_band: string;
}

export function budgetOverlaps(band: string, min: number | null, max: number | null): boolean {
  const b = BUDGET_BANDS[band as BudgetBand];
  if (!b) return false;
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  const bHi = b.hi ?? Infinity;
  // [b.lo, bHi) ∩ [lo, hi] ≠ ∅
  return b.lo <= hi && lo < bHi;
}

export function isEligible(lead: LeadForMatch, m: Candidate, now: Date): boolean {
  if (m.status !== 'active') return false;
  if (m.id === lead.referrer_id) return false;
  if (m.paused_until && new Date(m.paused_until) > now) return false;
  if (!m.categories.includes(lead.category)) return false;
  if (!(m.regions.includes(lead.region) || m.regions.includes(ALL_UA))) return false;
  return budgetOverlaps(lead.budget_band, m.budget_min, m.budget_max);
}

export function rank(a: Candidate, b: Candidate): number {
  const ra = a.rating_avg ?? 0, rb = b.rating_avg ?? 0;
  if (rb !== ra) return rb - ra;
  const sa = a.avg_response_min ?? Infinity, sb = b.avg_response_min ?? Infinity;
  if (sa !== sb) return sa < sb ? -1 : 1;
  if (b.deals_closed !== a.deals_closed) return b.deals_closed - a.deals_closed;
  return a.id - b.id;
}

/** Повертає відсортований список придатних: перші topN — хвиля 1 (ексклюзив 24 год), решта — хвиля 2. */
export function match(lead: LeadForMatch, members: Candidate[], now = new Date(), topN = TOP_N) {
  const eligible = members.filter((m) => isEligible(lead, m, now)).sort(rank);
  return { wave1: eligible.slice(0, topN), wave2: eligible.slice(topN), all: eligible };
}
