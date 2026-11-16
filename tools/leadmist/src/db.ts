// Тонкі хелпери над D1 і типи рядків.

import type { Candidate } from './matching';

export interface MemberRow {
  id: number; tg_id: number; tg_username: string | null; company: string; edrpou: string | null;
  contact_name: string | null; categories: string; regions: string; budget_min: number | null; budget_max: number | null;
  portfolio_url: string | null; verified: number; status: string; lang: string; paused_until: string | null;
  rating_avg: number | null; rating_count: number; deals_closed: number; avg_response_min: number | null; responses: number;
  created_at: string; approved_at: string | null;
}
export interface LeadRow {
  id: number; referrer_id: number; category: string; region: string; area: number; area_unit: string;
  budget_band: string; timing: string; notes: string; commission_pct: number; status: string; wave: number;
  client_hash: string | null; duplicate_of: number | null; expires_at: string; created_at: string;
}
export interface DealRow {
  id: number; lead_id: number; receiver_id: number; acceptance_id: number; status: string; active: number;
  consent_token: string; consent_deadline: string; revealed_at: string | null; contacted_at: string | null;
  contract_amount_cents: number | null; currency: string; signed_at: string | null; status_changed_at: string;
  reminded_14_at: string | null; reminded_30_at: string | null; created_at: string;
}
export interface AcceptanceRow { id: number; kind: string; terms_version: string; member_id: number; tg_id: number; lead_id: number | null; otp_ok: number; accepted_at: string }
export interface ConsentRow { id: number; deal_id: number; lead_id: number; receiver_id: number; method: string; text_version: string; granted_at: string | null; declined_at: string | null; revoked_at: string | null; ip: string | null; user_agent: string | null; created_at: string }
export interface CommissionRow { id: number; deal_id: number; payment_id: number; base_cents: number; pct: number; referrer_cents: number; platform_fee_cents: number; status: string; receiver_marked_at: string | null; referrer_confirmed_at: string | null; created_at: string }

export async function one<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...args).first<T>()) ?? null;
}
export async function all<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...args).all<T>()).results ?? [];
}
export async function run(db: D1Database, sql: string, ...args: unknown[]): Promise<{ changes: number; id: number }> {
  const r = await db.prepare(sql).bind(...args).run();
  return { changes: r.meta?.changes ?? 0, id: Number(r.meta?.last_row_id ?? 0) };
}

export function parseList(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

export function toCandidate(m: MemberRow): Candidate {
  return {
    id: m.id, status: m.status, categories: parseList(m.categories), regions: parseList(m.regions),
    budget_min: m.budget_min, budget_max: m.budget_max, paused_until: m.paused_until,
    rating_avg: m.rating_avg, avg_response_min: m.avg_response_min, deals_closed: m.deals_closed,
  };
}

export async function audit(db: D1Database, actor: string, action: string, entity: string, entityId: number | null, meta?: unknown) {
  await run(db, 'INSERT INTO audit_log (actor, action, entity, entity_id, meta, at) VALUES (?,?,?,?,?,?)',
    actor, action, entity, entityId, meta === undefined ? null : JSON.stringify(meta), new Date().toISOString());
}

export const memberByTg = (db: D1Database, tgId: number) => one<MemberRow>(db, 'SELECT * FROM members WHERE tg_id = ?', tgId);
export const memberById = (db: D1Database, id: number) => one<MemberRow>(db, 'SELECT * FROM members WHERE id = ?', id);
export const leadById = (db: D1Database, id: number) => one<LeadRow>(db, 'SELECT * FROM leads WHERE id = ?', id);
export const dealById = (db: D1Database, id: number) => one<DealRow>(db, 'SELECT * FROM deals WHERE id = ?', id);
