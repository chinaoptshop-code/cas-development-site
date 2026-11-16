// Розкриття контакту клієнта — лише коли виконані ОБИДВІ умови:
//  (а) отримувач акцептував умови ліда з одноразовим кодом;
//  (б) кінцевий клієнт дав згоду саме цій компанії і не відкликав її.

export interface AcceptanceLike { kind: string; member_id: number; lead_id: number | null; otp_ok: number | boolean; terms_version: string }
export interface ConsentLike { lead_id: number; receiver_id: number; granted_at: string | null; declined_at: string | null; revoked_at: string | null }
export interface DealLike { id: number; lead_id: number; receiver_id: number; status: string; active: number | boolean }

export type GateResult = { ok: true } | { ok: false; reason: 'no_acceptance' | 'no_consent' | 'mismatch' | 'inactive' | 'revoked' | 'declined' };

export function canReveal(deal: DealLike, acceptance: AcceptanceLike | null, consent: ConsentLike | null): GateResult {
  if (!deal.active || deal.status !== 'reserved') return { ok: false, reason: 'inactive' };
  if (!acceptance || acceptance.kind !== 'lead' || !acceptance.otp_ok) return { ok: false, reason: 'no_acceptance' };
  if (acceptance.member_id !== deal.receiver_id || acceptance.lead_id !== deal.lead_id) return { ok: false, reason: 'mismatch' };
  if (!consent) return { ok: false, reason: 'no_consent' };
  if (consent.receiver_id !== deal.receiver_id || consent.lead_id !== deal.lead_id) return { ok: false, reason: 'mismatch' };
  if (consent.revoked_at) return { ok: false, reason: 'revoked' };
  if (consent.declined_at) return { ok: false, reason: 'declined' };
  if (!consent.granted_at) return { ok: false, reason: 'no_consent' };
  return { ok: true };
}
