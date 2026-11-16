// Щогодинний cron: друга хвиля розсилки, строки лідів, 72 год на згоду, 24 год на контакт, нагадування 14/30 днів, прибирання.

import { CONTACT_MS, STALE_ADMIN_MS, STALE_MEMBER_MS } from './constants';
import { all, type DealRow, type LeadRow, memberById, run } from './db';
import { addMs, adminIds, type Env, nowIso } from './env';
import { dict, fmt } from './i18n';
import { type Ctx, offerWave, setDealStatus } from './services';
import { Telegram } from './telegram';

const d = dict();

export async function runCron(env: Env, now = new Date()) {
  const ctx: Ctx = { env, db: env.DB, tg: new Telegram(env), now };
  const t = nowIso(now);
  const stats = { wave2: 0, expired: 0, consent_timeout: 0, no_contact: 0, remind14: 0, remind30: 0 };

  // 1) Ексклюзив минув, лід не взяли → усім відповідним.
  const wave1 = await all<LeadRow>(ctx.db, `SELECT * FROM leads l WHERE status = 'open' AND wave = 1 AND expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM lead_offers o WHERE o.lead_id = l.id AND o.wave = 1 AND o.exclusive_until > ? AND o.declined_at IS NULL)`, t, t);
  for (const l of wave1) { await offerWave(ctx, l, 2); stats.wave2++; }

  // 2) Строк дії ліда.
  const expired = await all<LeadRow>(ctx.db, "SELECT * FROM leads WHERE status = 'open' AND expires_at <= ?", t);
  for (const l of expired) {
    await run(ctx.db, "UPDATE leads SET status = 'expired' WHERE id = ? AND status = 'open'", l.id);
    const r = await memberById(ctx.db, l.referrer_id);
    if (r) await ctx.tg.send(r.tg_id, fmt(d.lead_expired, { id: l.id }));
    stats.expired++;
  }

  // 3) Без згоди клієнта 72 год → бронювання скасовано, лід — у біржу.
  const noConsent = await all<DealRow>(ctx.db, "SELECT * FROM deals WHERE status = 'reserved' AND active = 1 AND consent_deadline <= ?", t);
  for (const dl of noConsent) {
    const rcv = await memberById(ctx.db, dl.receiver_id);
    await setDealStatus(ctx, dl, 'cancelled', 'system', 'cron', 'consent_timeout');
    if (rcv) await ctx.tg.send(rcv.tg_id, fmt(d.consent_timeout_receiver, { lead: dl.lead_id }));
    stats.consent_timeout++;
  }

  // 4) Контакт розкрито, «Зв'язався» за 24 год не натиснуто → лід повертається.
  const noContact = await all<DealRow>(ctx.db, "SELECT * FROM deals WHERE status = 'revealed' AND active = 1 AND revealed_at <= ?", nowIso(addMs(now, -CONTACT_MS)));
  for (const dl of noContact) {
    const rcv = await memberById(ctx.db, dl.receiver_id);
    await setDealStatus(ctx, dl, 'no_contact', 'system', 'cron', 'no_contact_24h');
    if (rcv) await ctx.tg.send(rcv.tg_id, fmt(d.remind_contact, { lead: dl.lead_id }));
    stats.no_contact++;
  }

  // 5) Статус без змін 14 днів — отримувачу; 30 днів — модераторам.
  const live = "('contacted','meeting','contract','payment','commission_paid')";
  const s14 = await all<DealRow>(ctx.db, `SELECT * FROM deals WHERE active = 1 AND status IN ${live} AND status_changed_at <= ? AND reminded_14_at IS NULL`, nowIso(addMs(now, -STALE_MEMBER_MS)));
  for (const dl of s14) {
    const rcv = await memberById(ctx.db, dl.receiver_id);
    if (rcv) await ctx.tg.send(rcv.tg_id, fmt(d.remind_stale, { id: dl.id, lead: dl.lead_id }));
    await run(ctx.db, 'UPDATE deals SET reminded_14_at = ? WHERE id = ?', t, dl.id);
    stats.remind14++;
  }
  const s30 = await all<DealRow>(ctx.db, `SELECT * FROM deals WHERE active = 1 AND status IN ${live} AND status_changed_at <= ? AND reminded_30_at IS NULL`, nowIso(addMs(now, -STALE_ADMIN_MS)));
  for (const dl of s30) {
    const rcv = await memberById(ctx.db, dl.receiver_id);
    for (const a of adminIds(env)) await ctx.tg.send(a, fmt(d.admin_stale, { id: dl.id, lead: dl.lead_id, company: rcv?.company ?? '?' }));
    await run(ctx.db, 'UPDATE deals SET reminded_30_at = ? WHERE id = ?', t, dl.id);
    stats.remind30++;
  }

  // 6) Прибирання: OTP старші за добу, сесії старші за 2 дні, контакти після строку зберігання (лишається хеш).
  await run(ctx.db, 'DELETE FROM otps WHERE created_at <= ?', nowIso(addMs(now, -24 * 3600_000)));
  await run(ctx.db, 'DELETE FROM bot_sessions WHERE updated_at <= ?', nowIso(addMs(now, -48 * 3600_000)));
  await run(ctx.db, 'DELETE FROM lead_contacts WHERE purge_at <= ?', t);

  return stats;
}
