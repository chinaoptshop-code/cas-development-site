// Бізнес-логіка: учасники, ліди, підбір і розсилка, «Взяти», згода, розкриття, статуси, комісії.
// Бот (bot.ts), сторінки (pages.ts) і cron (cron.ts) викликають лише ці функції.

import {
  CONSENT_MS, CONSENT_VERSION, DAY, EXCLUSIVE_MS, LEAD_TERMS_VERSION, LEAD_TTL_MS, NEW_MEMBER_MS,
  NEW_MEMBER_TAKES_PER_DAY, OTP_MAX_ATTEMPTS, OTP_TTL_MS, RETENTION_MS,
} from './constants';
import { accrueTranche, dealForecast, fmtUsd, validPct } from './commission';
import { decryptText, hmacHex, otpCode, randomToken, safeEqual } from './crypto';
import {
  type AcceptanceRow, type CommissionRow, type ConsentRow, type DealRow, type LeadRow, type MemberRow,
  all, audit, dealById, leadById, memberById, one, parseList, run, toCandidate,
} from './db';
import { addMs, adminIds, type Env, nowIso } from './env';
import { canReveal } from './gating';
import { dict, fmt, label } from './i18n';
import { match } from './matching';
import { detectPii } from './pii';
import { type Actor, assertTransition, type DealStatus, receiverNext, TERMINAL } from './state';
import type { InlineKeyboard, Telegram } from './telegram';

export interface Ctx { env: Env; db: D1Database; tg: Telegram; now: Date }

const d = dict();

function kyivTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ───────────── OTP ─────────────

export async function issueOtp(ctx: Ctx, tgId: number, purpose: string): Promise<string> {
  const code = otpCode();
  await run(ctx.db, 'UPDATE otps SET used_at = ? WHERE tg_id = ? AND purpose = ? AND used_at IS NULL', nowIso(ctx.now), tgId, purpose);
  await run(ctx.db, 'INSERT INTO otps (tg_id, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)',
    tgId, purpose, await hmacHex(ctx.env.HASH_KEY, `otp:${tgId}:${purpose}:${code}`), nowIso(addMs(ctx.now, OTP_TTL_MS)), nowIso(ctx.now));
  return code;
}

export type OtpResult = { ok: true } | { ok: false; reason: 'expired' } | { ok: false; reason: 'bad'; left: number };

export async function verifyOtp(ctx: Ctx, tgId: number, purpose: string, code: string): Promise<OtpResult> {
  const row = await one<{ id: number; code_hash: string; attempts: number; expires_at: string }>(ctx.db,
    'SELECT id, code_hash, attempts, expires_at FROM otps WHERE tg_id = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', tgId, purpose);
  if (!row || new Date(row.expires_at) < ctx.now || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'expired' };
  const h = await hmacHex(ctx.env.HASH_KEY, `otp:${tgId}:${purpose}:${code.trim()}`);
  if (!safeEqual(h, row.code_hash)) {
    await run(ctx.db, 'UPDATE otps SET attempts = attempts + 1 WHERE id = ?', row.id);
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return left > 0 ? { ok: false, reason: 'bad', left } : { ok: false, reason: 'expired' };
  }
  await run(ctx.db, 'UPDATE otps SET used_at = ? WHERE id = ?', nowIso(ctx.now), row.id);
  return { ok: true };
}

// ───────────── Учасники ─────────────

export interface MemberDraft {
  company: string; edrpou: string; contact_name: string; categories: string[]; regions: string[];
  budget_min: number | null; budget_max: number | null; portfolio_url: string | null; tg_username?: string | null;
}

export async function createMember(ctx: Ctx, tgId: number, m: MemberDraft): Promise<number> {
  const r = await run(ctx.db,
    `INSERT INTO members (tg_id, tg_username, company, edrpou, contact_name, categories, regions, budget_min, budget_max, portfolio_url, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?)`,
    tgId, m.tg_username ?? null, m.company, m.edrpou, m.contact_name, JSON.stringify(m.categories), JSON.stringify(m.regions),
    m.budget_min, m.budget_max, m.portfolio_url, nowIso(ctx.now));
  await run(ctx.db, 'INSERT INTO acceptances (kind, terms_version, member_id, tg_id, otp_ok, accepted_at) VALUES (?,?,?,?,1,?)',
    'platform', ctx.env.TERMS_VERSION, r.id, tgId, nowIso(ctx.now));
  await audit(ctx.db, `tg:${tgId}`, 'member.apply', 'member', r.id, { terms: ctx.env.TERMS_VERSION });
  await audit(ctx.db, `tg:${tgId}`, 'terms.accept', 'member', r.id, { kind: 'platform', version: ctx.env.TERMS_VERSION, otp: true });
  return r.id;
}

export function memberSummary(m: MemberRow | MemberDraft & { id?: number }) {
  const cats = parseList(typeof m.categories === 'string' ? m.categories : JSON.stringify(m.categories)).map((c) => label(d, 'cat', c)).join(', ');
  const regions = parseList(typeof m.regions === 'string' ? m.regions : JSON.stringify(m.regions)).map((c) => label(d, 'region', c)).join(', ');
  const lo = m.budget_min ?? 0, hi = m.budget_max;
  const budgets = hi === null ? `від $${Math.round(lo / 1000)}k` : `$${Math.round(lo / 1000)}–${Math.round(hi / 1000)}k`;
  return { cats, regions, budgets };
}

export async function notifyAdminsNewMember(ctx: Ctx, memberId: number) {
  const m = await memberById(ctx.db, memberId);
  if (!m) return;
  const s = memberSummary(m);
  const text = fmt(d.admin_new_member, {
    id: m.id, company: m.company, edrpou: m.edrpou, contact: m.contact_name, cats: s.cats, regions: s.regions,
    budgets: s.budgets, portfolio: m.portfolio_url ?? '—', tg: m.tg_username ? '@' + m.tg_username : String(m.tg_id),
  });
  const kb: InlineKeyboard = [[{ text: d.approve_btn, callback_data: `adm:ok:${m.id}` }, { text: d.reject_btn, callback_data: `adm:no:${m.id}` }]];
  for (const a of adminIds(ctx.env)) await ctx.tg.send(a, text, { keyboard: kb });
}

export async function setMemberStatus(ctx: Ctx, memberId: number, status: 'active' | 'rejected' | 'blocked', adminTg: number) {
  const m = await memberById(ctx.db, memberId);
  if (!m) return null;
  await run(ctx.db, `UPDATE members SET status = ?, verified = CASE WHEN ? = 'active' THEN 1 ELSE verified END,
    approved_at = CASE WHEN ? = 'active' THEN ? ELSE approved_at END WHERE id = ?`, status, status, status, nowIso(ctx.now), memberId);
  await audit(ctx.db, `admin:${adminTg}`, `member.${status}`, 'member', memberId);
  if (status === 'active') await ctx.tg.send(m.tg_id, d.member_approved);
  if (status === 'rejected') await ctx.tg.send(m.tg_id, d.member_rejected_msg);
  return status;
}

// ───────────── Ліди ─────────────

export interface LeadDraft {
  category: string; region: string; area: number; area_unit: 'm2' | 'sotka'; budget_band: string; timing: string;
  notes: string; commission_pct: number; contact_enc: string; client_hash: string;
}

export function cardText(lead: Pick<LeadRow, 'id' | 'category' | 'region' | 'area' | 'area_unit' | 'budget_band' | 'timing' | 'notes' | 'commission_pct' | 'expires_at'>, exclusiveUntil?: string | null) {
  let s = fmt(d.card, {
    id: lead.id, cat: label(d, 'cat', lead.category), region: label(d, 'region', lead.region), area: lead.area,
    unit: label(d, 'unit', lead.area_unit), budget: label(d, 'budget', lead.budget_band), timing: label(d, 'timing', lead.timing),
    notes: lead.notes ? `📝 ${lead.notes}\n` : '', pct: lead.commission_pct, expires: kyivTime(lead.expires_at),
  });
  if (exclusiveUntil) s += fmt(d.card_excl, { until: kyivTime(exclusiveUntil) });
  return s;
}

export async function publishLead(ctx: Ctx, referrer: MemberRow, draft: LeadDraft) {
  if (referrer.status !== 'active') throw new Error('referrer not active');
  if (!validPct(draft.commission_pct)) throw new Error('bad pct');
  if (detectPii(draft.notes).length) throw new Error('pii in notes');
  const dup = await one<{ id: number }>(ctx.db,
    'SELECT id FROM leads WHERE client_hash = ? AND created_at > ? ORDER BY id LIMIT 1', draft.client_hash, nowIso(addMs(ctx.now, -RETENTION_MS)));
  const r = await run(ctx.db,
    `INSERT INTO leads (referrer_id, category, region, area, area_unit, budget_band, timing, notes, commission_pct, status, wave, client_hash, duplicate_of, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?, 'open', 1, ?, ?, ?, ?)`,
    referrer.id, draft.category, draft.region, draft.area, draft.area_unit, draft.budget_band, draft.timing, draft.notes,
    draft.commission_pct, draft.client_hash, dup?.id ?? null, nowIso(addMs(ctx.now, LEAD_TTL_MS)), nowIso(ctx.now));
  await run(ctx.db, 'INSERT INTO lead_contacts (lead_id, enc_payload, created_at, purge_at) VALUES (?,?,?,?)',
    r.id, draft.contact_enc, nowIso(ctx.now), nowIso(addMs(ctx.now, RETENTION_MS)));
  await audit(ctx.db, `tg:${referrer.tg_id}`, 'lead.publish', 'lead', r.id, { pct: draft.commission_pct, duplicate_of: dup?.id ?? null });
  if (dup) for (const a of adminIds(ctx.env)) await ctx.tg.send(a, fmt(d.admin_duplicate, { id: r.id, dup: dup.id }));
  const lead = (await leadById(ctx.db, r.id))!;
  const offered = await offerWave(ctx, lead, 1);
  return { lead, offered, duplicateOf: dup?.id ?? null };
}

/** Розсилка: хвиля 1 — топ-5 з ексклюзивом 24 год; хвиля 2 — усім іншим відповідним. Повертає кількість адресатів. */
export async function offerWave(ctx: Ctx, lead: LeadRow, wave: 1 | 2): Promise<number> {
  const members = (await all<MemberRow>(ctx.db, "SELECT * FROM members WHERE status = 'active'")).map(toCandidate);
  const offered = new Set((await all<{ member_id: number }>(ctx.db, 'SELECT member_id FROM lead_offers WHERE lead_id = ?', lead.id)).map((r) => r.member_id));
  const m = match(lead, members.filter((c) => !offered.has(c.id)), ctx.now);
  const targets = wave === 1 ? m.wave1 : m.all;
  const excl = wave === 1 ? nowIso(addMs(ctx.now, EXCLUSIVE_MS)) : null;
  let rank = offered.size;
  for (const c of targets) {
    rank++;
    const ins = await run(ctx.db, 'INSERT OR IGNORE INTO lead_offers (lead_id, member_id, wave, rank, sent_at, exclusive_until) VALUES (?,?,?,?,?,?)',
      lead.id, c.id, wave, rank, nowIso(ctx.now), excl);
    if (!ins.changes) continue;
    const mem = await memberById(ctx.db, c.id);
    if (mem) await ctx.tg.send(mem.tg_id, cardText(lead, excl), {
      keyboard: [[{ text: d.take_btn, callback_data: `tk:${lead.id}` }, { text: d.pass_btn, callback_data: `tp:${lead.id}` }]],
    });
  }
  // Немає кандидатів для ексклюзиву — одразу «хвиля 2» (лід відкритий для всіх, хто стане відповідним).
  const newWave = wave === 2 || targets.length === 0 ? 2 : 1;
  await run(ctx.db, 'UPDATE leads SET wave = ? WHERE id = ?', newWave, lead.id);
  await audit(ctx.db, 'system', 'lead.offer', 'lead', lead.id, { wave, n: targets.length });
  return targets.length;
}

// ───────────── «Взяти» ─────────────

export type TakeError = { key: 'not_active' | 'take_own' | 'take_unavailable' | 'take_limit' | 'take_exclusive'; until?: string };

export async function takeCheck(ctx: Ctx, member: MemberRow | null, lead: LeadRow | null): Promise<TakeError | null> {
  if (!member || member.status !== 'active') return { key: 'not_active' };
  if (!lead || lead.status !== 'open' || new Date(lead.expires_at) < ctx.now) return { key: 'take_unavailable' };
  if (lead.referrer_id === member.id) return { key: 'take_own' };
  const offer = await one<{ wave: number; exclusive_until: string | null; declined_at: string | null }>(ctx.db,
    'SELECT wave, exclusive_until, declined_at FROM lead_offers WHERE lead_id = ? AND member_id = ?', lead.id, member.id);
  if (!offer || offer.declined_at) return { key: 'take_unavailable' };
  if (offer.wave === 2) {
    const excl = await one<{ until: string }>(ctx.db,
      'SELECT MAX(exclusive_until) AS until FROM lead_offers WHERE lead_id = ? AND wave = 1 AND exclusive_until > ? AND declined_at IS NULL',
      lead.id, nowIso(ctx.now));
    if (excl?.until) return { key: 'take_exclusive', until: kyivTime(excl.until) };
  }
  if (new Date(member.approved_at ?? member.created_at).getTime() > ctx.now.getTime() - NEW_MEMBER_MS) {
    const c = await one<{ n: number }>(ctx.db, "SELECT COUNT(*) AS n FROM acceptances WHERE kind = 'lead' AND member_id = ? AND accepted_at > ?",
      member.id, nowIso(addMs(ctx.now, -DAY)));
    if ((c?.n ?? 0) >= NEW_MEMBER_TAKES_PER_DAY) return { key: 'take_limit' };
  }
  return null;
}

export function takeTermsText(lead: LeadRow) {
  return fmt(d.take_terms, { id: lead.id, version: LEAD_TERMS_VERSION, pct: lead.commission_pct });
}

export function consentLink(env: Env, token: string) {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/c/${token}`;
}

/** Після правильного OTP: акцепт додатка по ліду, бронювання, створення угоди, посилання на згоду. */
export async function acceptLeadTerms(ctx: Ctx, member: MemberRow, leadId: number): Promise<{ ok: true; deal: DealRow } | { ok: false; error: TakeError }> {
  const lead = await leadById(ctx.db, leadId);
  const err = await takeCheck(ctx, member, lead);
  if (err) return { ok: false, error: err };
  const reserved = await run(ctx.db, "UPDATE leads SET status = 'reserved' WHERE id = ? AND status = 'open'", leadId);
  if (!reserved.changes) return { ok: false, error: { key: 'take_unavailable' } };
  const acc = await run(ctx.db, 'INSERT INTO acceptances (kind, terms_version, member_id, tg_id, lead_id, otp_ok, accepted_at) VALUES (?,?,?,?,?,1,?)',
    'lead', LEAD_TERMS_VERSION, member.id, member.tg_id, leadId, nowIso(ctx.now));
  const token = randomToken();
  const dl = await run(ctx.db,
    `INSERT INTO deals (lead_id, receiver_id, acceptance_id, status, active, consent_token, consent_deadline, status_changed_at, created_at)
     VALUES (?,?,?, 'reserved', 1, ?, ?, ?, ?)`,
    leadId, member.id, acc.id, token, nowIso(addMs(ctx.now, CONSENT_MS)), nowIso(ctx.now), nowIso(ctx.now));
  await run(ctx.db, 'INSERT INTO deal_events (deal_id, from_status, to_status, actor, at) VALUES (?,?,?,?,?)', dl.id, null, 'reserved', `tg:${member.tg_id}`, nowIso(ctx.now));
  // швидкість реакції
  const offer = await one<{ sent_at: string }>(ctx.db, 'SELECT sent_at FROM lead_offers WHERE lead_id = ? AND member_id = ?', leadId, member.id);
  if (offer) {
    const min = Math.max(0, (ctx.now.getTime() - new Date(offer.sent_at).getTime()) / 60000);
    await run(ctx.db, `UPDATE members SET avg_response_min = (COALESCE(avg_response_min, 0) * responses + ?) / (responses + 1), responses = responses + 1 WHERE id = ?`, min, member.id);
  }
  await audit(ctx.db, `tg:${member.tg_id}`, 'terms.accept', 'lead', leadId, { kind: 'lead', version: LEAD_TERMS_VERSION, otp: true, deal: dl.id });
  const deal = (await dealById(ctx.db, dl.id))!;
  const referrer = await memberById(ctx.db, lead!.referrer_id);
  await ctx.tg.send(member.tg_id, fmt(d.take_done_receiver, { id: leadId }));
  if (referrer) {
    await ctx.tg.send(referrer.tg_id, fmt(d.take_done_referrer, { id: leadId, company: member.company, link: consentLink(ctx.env, token) }), {
      keyboard: [[{ text: d.manual_consent_btn, callback_data: `mc:${deal.id}` }]],
    });
  }
  return { ok: true, deal };
}

export async function declineOffer(ctx: Ctx, member: MemberRow, leadId: number) {
  await run(ctx.db, 'UPDATE lead_offers SET declined_at = ? WHERE lead_id = ? AND member_id = ? AND declined_at IS NULL', nowIso(ctx.now), leadId, member.id);
}

// ───────────── Згода клієнта й розкриття ─────────────

export async function dealByToken(db: D1Database, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return one<DealRow>(db, 'SELECT * FROM deals WHERE consent_token = ?', token);
}

export async function latestConsent(db: D1Database, dealId: number) {
  return one<ConsentRow>(db, 'SELECT * FROM client_consents WHERE deal_id = ? ORDER BY id DESC LIMIT 1', dealId);
}

export async function grantConsent(ctx: Ctx, deal: DealRow, method: 'link' | 'manual', meta: { ip?: string | null; ua?: string | null; actor: string }) {
  if (!deal.active || deal.status !== 'reserved') return { ok: false as const, reason: 'inactive' };
  await run(ctx.db,
    `INSERT INTO client_consents (deal_id, lead_id, receiver_id, method, text_version, granted_at, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    deal.id, deal.lead_id, deal.receiver_id, method, CONSENT_VERSION, nowIso(ctx.now), meta.ip ?? null, meta.ua ?? null, nowIso(ctx.now));
  await audit(ctx.db, meta.actor, method === 'link' ? 'consent.grant' : 'consent.manual', 'deal', deal.id, { version: CONSENT_VERSION });
  return tryReveal(ctx, deal.id);
}

export async function declineConsent(ctx: Ctx, deal: DealRow, meta: { ip?: string | null; ua?: string | null }) {
  if (!deal.active || deal.status !== 'reserved') return false;
  await run(ctx.db,
    `INSERT INTO client_consents (deal_id, lead_id, receiver_id, method, text_version, declined_at, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    deal.id, deal.lead_id, deal.receiver_id, 'link', CONSENT_VERSION, nowIso(ctx.now), meta.ip ?? null, meta.ua ?? null, nowIso(ctx.now));
  await audit(ctx.db, 'client', 'consent.decline', 'deal', deal.id);
  await setDealStatus(ctx, deal, 'client_declined', 'client', 'client');
  return true;
}

export async function revokeConsent(ctx: Ctx, deal: DealRow) {
  const c = await latestConsent(ctx.db, deal.id);
  if (!c || !c.granted_at || c.revoked_at) return false;
  await run(ctx.db, 'UPDATE client_consents SET revoked_at = ? WHERE id = ?', nowIso(ctx.now), c.id);
  await audit(ctx.db, 'client', 'consent.revoke', 'deal', deal.id);
  const receiver = await memberById(ctx.db, deal.receiver_id);
  if (receiver && deal.revealed_at) await ctx.tg.send(receiver.tg_id, fmt(d.consent_revoked_receiver, { id: deal.lead_id }));
  return true;
}

/** Перевіряє «акцепт + згода» і, якщо обидві умови є, надсилає контакт отримувачу. */
export async function tryReveal(ctx: Ctx, dealId: number): Promise<{ ok: boolean; reason?: string }> {
  const deal = await dealById(ctx.db, dealId);
  if (!deal) return { ok: false, reason: 'no_deal' };
  const acc = await one<AcceptanceRow>(ctx.db, 'SELECT * FROM acceptances WHERE id = ?', deal.acceptance_id);
  const consent = await latestConsent(ctx.db, deal.id);
  const gate = canReveal(deal, acc, consent);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  const upd = await run(ctx.db, "UPDATE deals SET status = 'revealed', revealed_at = ?, status_changed_at = ? WHERE id = ? AND status = 'reserved' AND active = 1",
    nowIso(ctx.now), nowIso(ctx.now), deal.id);
  if (!upd.changes) return { ok: false, reason: 'race' };
  await run(ctx.db, "UPDATE leads SET status = 'in_deal' WHERE id = ?", deal.lead_id);
  await run(ctx.db, 'INSERT INTO deal_events (deal_id, from_status, to_status, actor, at) VALUES (?,?,?,?,?)', deal.id, 'reserved', 'revealed', 'system', nowIso(ctx.now));
  const contact = await one<{ enc_payload: string }>(ctx.db, 'SELECT enc_payload FROM lead_contacts WHERE lead_id = ?', deal.lead_id);
  const plain = contact ? await decryptText(ctx.env.CONTACT_KEY, contact.enc_payload) : '—';
  const receiver = (await memberById(ctx.db, deal.receiver_id))!;
  await audit(ctx.db, 'system', 'contact.reveal', 'lead', deal.lead_id, { deal: deal.id, to_member: receiver.id, consent: consent!.method });
  await ctx.tg.send(receiver.tg_id, fmt(d.reveal_receiver, { id: deal.lead_id, contact: plain }), { keyboard: dealKeyboard({ ...deal, status: 'revealed' }) });
  const lead = (await leadById(ctx.db, deal.lead_id))!;
  const referrer = await memberById(ctx.db, lead.referrer_id);
  if (referrer) await ctx.tg.send(referrer.tg_id, fmt(d.reveal_referrer, { id: lead.id, company: receiver.company }));
  return { ok: true };
}

// ───────────── Статуси угоди ─────────────

export function dealKeyboard(deal: Pick<DealRow, 'id' | 'status'>): InlineKeyboard {
  const next = receiverNext(deal.status as DealStatus);
  return next.map((s) => [{ text: (d.deal_btn as Record<string, string>)[s] ?? s, callback_data: `ds:${deal.id}:${s}` }]);
}

export function dealCard(deal: DealRow) {
  const amount = deal.contract_amount_cents ? ` · договір ${fmtUsd(deal.contract_amount_cents)}` : '';
  return fmt(d.deal_card, { id: deal.id, lead: deal.lead_id, status: label(d, 'deal_status', deal.status), amount });
}

/** Повертає лід у біржу (після скасування бронювання / відсутності контакту) і дорозсилає тим, кому ще не надсилали. */
export async function returnLead(ctx: Ctx, leadId: number, exceptMemberId?: number) {
  const lead = await leadById(ctx.db, leadId);
  // попередній отримувач лід повторно не бере
  if (exceptMemberId) await run(ctx.db, 'UPDATE lead_offers SET declined_at = COALESCE(declined_at, ?) WHERE lead_id = ? AND member_id = ?', nowIso(ctx.now), leadId, exceptMemberId);
  if (!lead || !['reserved', 'in_deal'].includes(lead.status)) return;
  if (new Date(lead.expires_at) < ctx.now) {
    await run(ctx.db, "UPDATE leads SET status = 'expired' WHERE id = ?", leadId);
    return;
  }
  await run(ctx.db, "UPDATE leads SET status = 'open' WHERE id = ?", leadId);
  const referrer = await memberById(ctx.db, lead.referrer_id);
  if (referrer) await ctx.tg.send(referrer.tg_id, fmt(d.lead_returned, { id: leadId }));
  await offerWave(ctx, { ...lead, status: 'open' }, 2);
}

export async function setDealStatus(ctx: Ctx, deal: DealRow, to: DealStatus, actor: Actor, actorTag: string, note?: string) {
  assertTransition(deal.status as DealStatus, to, actor);
  const terminal = TERMINAL.has(to);
  const upd = await run(ctx.db,
    `UPDATE deals SET status = ?, status_changed_at = ?, reminded_14_at = NULL, reminded_30_at = NULL,
       contacted_at = CASE WHEN ? = 'contacted' THEN ? ELSE contacted_at END,
       active = CASE WHEN ? THEN 0 ELSE active END
     WHERE id = ? AND status = ?`,
    to, nowIso(ctx.now), to, nowIso(ctx.now), terminal ? 1 : 0, deal.id, deal.status);
  if (!upd.changes) throw new Error('concurrent deal update');
  await run(ctx.db, 'INSERT INTO deal_events (deal_id, from_status, to_status, actor, note, at) VALUES (?,?,?,?,?,?)', deal.id, deal.status, to, actorTag, note ?? null, nowIso(ctx.now));
  await audit(ctx.db, actorTag, 'deal.status', 'deal', deal.id, { from: deal.status, to, note });
  const lead = (await leadById(ctx.db, deal.lead_id))!;
  const referrer = await memberById(ctx.db, lead.referrer_id);
  const receiver = await memberById(ctx.db, deal.receiver_id);
  if (to === 'client_declined') {
    await run(ctx.db, "UPDATE leads SET status = 'closed' WHERE id = ?", lead.id);
    if (deal.status === 'reserved') {
      if (referrer) await ctx.tg.send(referrer.tg_id, fmt(d.consent_declined_referrer, { id: lead.id }));
      if (receiver) await ctx.tg.send(receiver.tg_id, fmt(d.consent_declined_receiver, { id: lead.id }));
      return;
    }
  } else if (to === 'no_contact' || (to === 'cancelled' && ['reserved', 'revealed'].includes(deal.status))) {
    await returnLead(ctx, lead.id, deal.receiver_id);
  } else if (to === 'closed') {
    await run(ctx.db, "UPDATE leads SET status = 'closed' WHERE id = ?", lead.id);
    await run(ctx.db, 'UPDATE members SET deals_closed = deals_closed + 1 WHERE id IN (?, ?)', deal.receiver_id, lead.referrer_id);
  }
  if (referrer && actor !== 'system') await ctx.tg.send(referrer.tg_id, fmt(d.status_referrer, { lead: lead.id, status: label(d, 'deal_status', to) }));
}

export async function recordContract(ctx: Ctx, deal: DealRow, receiver: MemberRow, cents: number) {
  if (deal.receiver_id !== receiver.id) throw new Error('not receiver');
  await setDealStatus(ctx, deal, 'contract', 'receiver', `tg:${receiver.tg_id}`, `amount=${cents}`);
  await run(ctx.db, 'UPDATE deals SET contract_amount_cents = ?, signed_at = ? WHERE id = ?', cents, nowIso(ctx.now), deal.id);
  const lead = (await leadById(ctx.db, deal.lead_id))!;
  return dealForecast(cents, lead.commission_pct);
}

export async function recordPayment(ctx: Ctx, deal: DealRow, receiver: MemberRow, cents: number) {
  if (deal.receiver_id !== receiver.id) throw new Error('not receiver');
  await setDealStatus(ctx, deal, 'payment', 'receiver', `tg:${receiver.tg_id}`, `tranche=${cents}`);
  const lead = (await leadById(ctx.db, deal.lead_id))!;
  const before = (await one<{ s: number | null }>(ctx.db, 'SELECT SUM(amount_cents) AS s FROM payments WHERE deal_id = ?', deal.id))?.s ?? 0;
  const p = await run(ctx.db, 'INSERT INTO payments (deal_id, amount_cents, paid_at, recorded_by) VALUES (?,?,?,?)', deal.id, cents, nowIso(ctx.now), receiver.id);
  const a = accrueTranche(before, cents, lead.commission_pct);
  const c = await run(ctx.db,
    `INSERT INTO commissions (deal_id, payment_id, base_cents, pct, referrer_cents, platform_fee_cents, status, receiver_marked_at, created_at)
     VALUES (?,?,?,?,?,?, 'accrued', NULL, ?)`,
    deal.id, p.id, a.base_cents, lead.commission_pct, a.referrer_cents, a.platform_fee_cents, nowIso(ctx.now));
  await audit(ctx.db, `tg:${receiver.tg_id}`, 'commission.accrue', 'commission', c.id, a);
  const referrer = await memberById(ctx.db, lead.referrer_id);
  if (referrer) await ctx.tg.send(referrer.tg_id,
    fmt(d.payment_referrer, { lead: lead.id, amount: fmtUsd(cents), ref: fmtUsd(a.referrer_cents) }),
    { keyboard: [[{ text: fmt(d.commission_got_btn, { ref: fmtUsd(a.referrer_cents) }), callback_data: `cp:${c.id}` }]] });
  return { ...a, commission_id: c.id };
}

export async function confirmCommission(ctx: Ctx, referrer: MemberRow, commissionId: number) {
  const c = await one<CommissionRow>(ctx.db, 'SELECT * FROM commissions WHERE id = ?', commissionId);
  if (!c || c.status !== 'accrued') return false;
  const deal = (await dealById(ctx.db, c.deal_id))!;
  const lead = (await leadById(ctx.db, deal.lead_id))!;
  if (lead.referrer_id !== referrer.id) return false;
  await run(ctx.db, "UPDATE commissions SET status = 'paid', referrer_confirmed_at = ? WHERE id = ?", nowIso(ctx.now), c.id);
  await audit(ctx.db, `tg:${referrer.tg_id}`, 'commission.paid', 'commission', c.id, { referrer_cents: c.referrer_cents });
  const left = await one<{ n: number }>(ctx.db, "SELECT COUNT(*) AS n FROM commissions WHERE deal_id = ? AND status = 'accrued'", deal.id);
  if (!left?.n && deal.status === 'payment') await setDealStatus(ctx, deal, 'commission_paid', 'referrer', `tg:${referrer.tg_id}`);
  const receiver = await memberById(ctx.db, deal.receiver_id);
  if (receiver) {
    const fresh = (await dealById(ctx.db, deal.id))!;
    await ctx.tg.send(receiver.tg_id, fmt(d.commission_confirmed_receiver, { ref: fmtUsd(c.referrer_cents), lead: lead.id }), { keyboard: dealKeyboard(fresh) });
  }
  return true;
}
