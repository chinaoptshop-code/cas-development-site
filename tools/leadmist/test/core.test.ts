import { describe, expect, it } from 'vitest';
import { accrueTranche, dealForecast, fmtUsd, parseUsd, platformFeeTotal, referrerCommission, validPct } from '../src/commission';
import { canReveal } from '../src/gating';
import { budgetOverlaps, type Candidate, match } from '../src/matching';
import { canTransition, DEAL_STATUSES, receiverNext } from '../src/state';

describe('commission math', () => {
  it('spec example: $44 000 × 10% → $4 400, platform $660', () => {
    expect(dealForecast(44_000_00, 10)).toEqual({ referrer_cents: 4_400_00, platform_fee_cents: 660_00, receiver_total_cents: 5_060_00 });
  });
  it('spec example: $165 000 × 7% → $11 550, platform $1 732.50', () => {
    const f = dealForecast(165_000_00, 7);
    expect(f.referrer_cents).toBe(11_550_00);
    expect(f.platform_fee_cents).toBe(1_732_50);
  });
  it('applies $50 minimum', () => {
    expect(platformFeeTotal(100_00)).toBe(50_00);        // 15% = $15 → $50
    expect(platformFeeTotal(333_33)).toBe(50_00);        // 15% = $50.00
    expect(platformFeeTotal(340_00)).toBe(51_00);
    expect(platformFeeTotal(0)).toBe(0);
    expect(dealForecast(2_000_00, 5)).toEqual({ referrer_cents: 100_00, platform_fee_cents: 50_00, receiver_total_cents: 150_00 });
  });
  it('tranches sum to the whole-deal amounts (minimum charged once)', () => {
    const tranches = [5_000_00, 3_000_00, 12_000_00];
    let before = 0, ref = 0, fee = 0;
    for (const t of tranches) { const a = accrueTranche(before, t, 5); ref += a.referrer_cents; fee += a.platform_fee_cents; before += t; }
    const whole = dealForecast(20_000_00, 5);
    expect(ref).toBe(whole.referrer_cents);            // $1 000
    expect(fee).toBe(whole.platform_fee_cents);        // $150
    const first = accrueTranche(0, 1_000_00, 10);       // комісія $100 → мінімум $50 одразу
    expect(first.platform_fee_cents).toBe(50_00);
    const second = accrueTranche(1_000_00, 1_000_00, 10); // разом $200 → 15% = $30 < $50 → доплата 0
    expect(second.platform_fee_cents).toBe(0);
  });
  it('validates commission %', () => {
    expect(validPct(5)).toBe(true);
    expect(validPct(15)).toBe(true);
    expect(validPct(12.5)).toBe(true);
    expect(validPct(4.9)).toBe(false);
    expect(validPct(15.1)).toBe(false);
    expect(validPct(NaN)).toBe(false);
    expect(() => referrerCommission(100, 20)).toThrow();
  });
  it('parses and formats USD', () => {
    expect(parseUsd('44 000')).toBe(44_000_00);
    expect(parseUsd('$12500.5')).toBe(12_500_50);
    expect(parseUsd('1,5')).toBe(150);
    expect(parseUsd('abc')).toBeNull();
    expect(parseUsd('0')).toBeNull();
    expect(fmtUsd(4_400_00)).toBe('$4 400');
    expect(fmtUsd(1_732_50)).toBe('$1 732.50');
  });
});

const cand = (o: Partial<Candidate> & { id: number }): Candidate => ({
  status: 'active', categories: ['renovation'], regions: ['kyiv'], budget_min: 0, budget_max: null, paused_until: null,
  rating_avg: null, avg_response_min: null, deals_closed: 0, ...o,
});

describe('matching', () => {
  const lead = { referrer_id: 1, category: 'renovation', region: 'kyiv', budget_band: '30_80' };
  const now = new Date('2026-11-16T12:00:00Z');
  it('filters by category ∩ region ∩ budget ∩ active ∩ not self ∩ not paused', () => {
    const ms = [
      cand({ id: 1 }),                                             // сам рекомендувач
      cand({ id: 2 }),                                             // ok
      cand({ id: 3, status: 'pending' }),
      cand({ id: 4, categories: ['design'] }),
      cand({ id: 5, regions: ['lviv'] }),
      cand({ id: 6, regions: ['UA'] }),                            // уся Україна — ok
      cand({ id: 7, budget_min: 80_000, budget_max: null }),      // замалий бюджет для нього
      cand({ id: 8, budget_min: 0, budget_max: 30_000 }),         // межа: [30k,80k) ∩ [0,30k] — дотик, ok
      cand({ id: 9, paused_until: '2026-12-01T00:00:00Z' }),
      cand({ id: 10, paused_until: '2026-11-01T00:00:00Z' }),     // пауза минула — ok
    ];
    expect(match(lead, ms, now).all.map((m) => m.id).sort((a, b) => a - b)).toEqual([2, 6, 8, 10]);
  });
  it('ranks by rating, then response speed, then closed deals; top-5 exclusive', () => {
    const ms = [
      cand({ id: 2, rating_avg: 4.0 }), cand({ id: 3, rating_avg: 4.9 }), cand({ id: 4, rating_avg: 4.9, avg_response_min: 30 }),
      cand({ id: 5, rating_avg: 4.9, avg_response_min: 10 }), cand({ id: 6 }), cand({ id: 7, deals_closed: 5 }), cand({ id: 8, rating_avg: 3 }),
    ];
    const r = match(lead, ms, now);
    expect(r.all.map((m) => m.id)).toEqual([5, 4, 3, 2, 8, 7, 6]);
    expect(r.wave1.map((m) => m.id)).toEqual([5, 4, 3, 2, 8]);
    expect(r.wave2.map((m) => m.id)).toEqual([7, 6]);
  });
  it('budget overlap', () => {
    expect(budgetOverlaps('80p', 0, 50_000)).toBe(false);
    expect(budgetOverlaps('80p', 50_000, null)).toBe(true);
    expect(budgetOverlaps('lt10', 10_000, 30_000)).toBe(false);
    expect(budgetOverlaps('nope', 0, null)).toBe(false);
  });
});

describe('deal state machine', () => {
  it('main path is allowed', () => {
    const path = ['reserved', 'revealed', 'contacted', 'meeting', 'contract', 'payment', 'commission_paid', 'closed'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1]), `${path[i]}→${path[i + 1]}`).toBe(true);
  });
  it('rejects skipping steps and leaving terminal states', () => {
    expect(canTransition('reserved', 'contacted')).toBe(false);
    expect(canTransition('revealed', 'contract')).toBe(false);
    expect(canTransition('contract', 'closed')).toBe(false);
    for (const t of ['closed', 'client_declined', 'no_contact', 'cancelled'] as const)
      for (const s of DEAL_STATUSES) expect(canTransition(t, s)).toBe(false);
  });
  it('enforces who may move the deal', () => {
    expect(canTransition('reserved', 'revealed', 'receiver')).toBe(false); // розкриття — лише система після згоди
    expect(canTransition('reserved', 'revealed', 'system')).toBe(true);
    expect(canTransition('payment', 'commission_paid', 'receiver')).toBe(false); // виплату підтверджує рекомендувач
    expect(canTransition('payment', 'commission_paid', 'referrer')).toBe(true);
    expect(canTransition('payment', 'payment', 'receiver')).toBe(true); // наступний транш
    expect(canTransition('commission_paid', 'closed', 'receiver')).toBe(true);
  });
  it('receiver buttons', () => {
    expect(receiverNext('reserved')).toEqual(['client_declined']);
    expect(receiverNext('revealed')).toEqual(['contacted', 'client_declined']);
    expect(receiverNext('contract')).toEqual(['payment']);
  });
});

describe('consent gating', () => {
  const deal = { id: 1, lead_id: 10, receiver_id: 7, status: 'reserved', active: 1 };
  const acc = { kind: 'lead', member_id: 7, lead_id: 10, otp_ok: 1, terms_version: 'v' };
  const consent = { lead_id: 10, receiver_id: 7, granted_at: '2026-11-16T10:00:00Z', declined_at: null, revoked_at: null };
  it('reveals only with acceptance AND consent', () => {
    expect(canReveal(deal, acc, consent)).toEqual({ ok: true });
    expect(canReveal(deal, null, consent)).toEqual({ ok: false, reason: 'no_acceptance' });
    expect(canReveal(deal, acc, null)).toEqual({ ok: false, reason: 'no_consent' });
  });
  it('requires OTP, the same receiver and lead, an active reserved deal', () => {
    expect(canReveal(deal, { ...acc, otp_ok: 0 }, consent).ok).toBe(false);
    expect(canReveal(deal, { ...acc, kind: 'platform' }, consent).ok).toBe(false);
    expect(canReveal(deal, { ...acc, member_id: 8 }, consent)).toEqual({ ok: false, reason: 'mismatch' });
    expect(canReveal(deal, acc, { ...consent, receiver_id: 8 })).toEqual({ ok: false, reason: 'mismatch' });
    expect(canReveal(deal, acc, { ...consent, lead_id: 11 })).toEqual({ ok: false, reason: 'mismatch' });
    expect(canReveal({ ...deal, active: 0 }, acc, consent).ok).toBe(false);
    expect(canReveal({ ...deal, status: 'revealed' }, acc, consent).ok).toBe(false);
  });
  it('ignores declined, revoked or ungranted consent', () => {
    expect(canReveal(deal, acc, { ...consent, revoked_at: '2026-11-16T11:00:00Z' })).toEqual({ ok: false, reason: 'revoked' });
    expect(canReveal(deal, acc, { ...consent, granted_at: null, declined_at: '2026-11-16T11:00:00Z' })).toEqual({ ok: false, reason: 'declined' });
    expect(canReveal(deal, acc, { ...consent, granted_at: null })).toEqual({ ok: false, reason: 'no_consent' });
  });
});
