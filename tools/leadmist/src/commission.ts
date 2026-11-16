// Облік комісій. Гроші — цілі центи.
// Комісія рекомендувачу = оплата клієнта (транш) × % ліда.
// Плата платформи = 15% від комісії рекомендувача, але не менше $50 за угоду; платить отримувач.
// Мінімум застосовується до угоди в цілому: по траншах нараховується різниця
// fee(сумарна комісія після траншу) − fee(до траншу), тож сума по траншах = fee(усієї угоди).

import { COMMISSION_MAX, COMMISSION_MIN } from './constants';

export const PLATFORM_FEE_RATE = 0.15;
export const PLATFORM_FEE_MIN_CENTS = 50_00;

export function validPct(pct: number): boolean {
  return Number.isFinite(pct) && pct >= COMMISSION_MIN && pct <= COMMISSION_MAX && Math.abs(Math.round(pct * 10) - pct * 10) < 1e-9;
}

export function referrerCommission(baseCents: number, pct: number): number {
  if (!validPct(pct)) throw new Error(`commission % out of range: ${pct}`);
  if (!Number.isInteger(baseCents) || baseCents < 0) throw new Error('base must be non-negative integer cents');
  return Math.round((baseCents * pct) / 100);
}

/** Плата платформи за угоду з сумарною комісією рекомендувача commissionCents. */
export function platformFeeTotal(commissionCents: number): number {
  if (commissionCents <= 0) return 0;
  return Math.max(Math.round(commissionCents * PLATFORM_FEE_RATE), PLATFORM_FEE_MIN_CENTS);
}

export interface Accrual { base_cents: number; referrer_cents: number; platform_fee_cents: number }

/**
 * Нарахування за новий транш.
 * @param paidBeforeCents сума попередніх оплат клієнта по угоді
 * @param trancheCents поточна оплата
 */
export function accrueTranche(paidBeforeCents: number, trancheCents: number, pct: number): Accrual {
  if (!Number.isInteger(trancheCents) || trancheCents <= 0) throw new Error('tranche must be positive integer cents');
  const commBefore = referrerCommission(paidBeforeCents, pct);
  const commAfter = referrerCommission(paidBeforeCents + trancheCents, pct);
  return {
    base_cents: trancheCents,
    referrer_cents: commAfter - commBefore,
    platform_fee_cents: platformFeeTotal(commAfter) - platformFeeTotal(commBefore),
  };
}

/** Прогноз для договору (показуємо при «договір підписано»). */
export function dealForecast(contractCents: number, pct: number) {
  const referrer = referrerCommission(contractCents, pct);
  const fee = platformFeeTotal(referrer);
  return { referrer_cents: referrer, platform_fee_cents: fee, receiver_total_cents: referrer + fee };
}

/** «12 345.67» / «12 345» → центи. null — не схоже на суму. */
export function parseUsd(input: string): number | null {
  const s = input.replace(/[\s  $]/g, '').replace(/usd|дол\.?|долар\w*/gi, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 ? cents : null;
}

export function fmtUsd(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `$${w}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
}
