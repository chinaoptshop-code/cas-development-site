// Обробник оновлень Telegram: майстри (вступ, лід), кнопки «Взяти», статуси, адмін-команди.

import { exportCsv, EXPORTS } from './admin';
import { BUDGET_BAND_KEYS, BUDGET_BANDS, type BudgetBand, CATEGORIES, COMMISSION_DEFAULT, DAY, REGIONS, ALL_UA, TIMINGS, LEAD_TTL_MS } from './constants';
import { fmtUsd, parseUsd, validPct } from './commission';
import { encryptText, hmacHex } from './crypto';
import { all, dealById, type DealRow, type LeadRow, leadById, type MemberRow, memberByTg, one, run } from './db';
import { isAdmin, nowIso, addMs, type Env } from './env';
import { dict, fmt, label } from './i18n';
import { contactKey, detectPii } from './pii';
import {
  acceptLeadTerms, cardText, confirmCommission, createMember, type Ctx, dealCard, dealKeyboard, declineOffer,
  grantConsent, issueOtp, memberSummary, notifyAdminsNewMember, publishLead, recordContract, recordPayment,
  setDealStatus, setMemberStatus, takeCheck, takeTermsText, verifyOtp,
} from './services';
import { canTransition, type DealStatus, needsAmount } from './state';
import { type InlineKeyboard, mainMenu, Telegram, type TgCallback, type TgMessage, type TgUpdate } from './telegram';

const d = dict();
type Data = Record<string, unknown>;
interface Session { state: string; data: Data }

async function getSession(db: D1Database, tgId: number): Promise<Session | null> {
  const r = await one<{ state: string; data: string }>(db, 'SELECT state, data FROM bot_sessions WHERE tg_id = ?', tgId);
  return r ? { state: r.state, data: JSON.parse(r.data) as Data } : null;
}
async function setSession(db: D1Database, tgId: number, state: string, data: Data) {
  await run(db, `INSERT INTO bot_sessions (tg_id, state, data, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(tg_id) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at`,
    tgId, state, JSON.stringify(data), new Date().toISOString());
}
async function clearSession(db: D1Database, tgId: number) {
  await run(db, 'DELETE FROM bot_sessions WHERE tg_id = ?', tgId);
}

// ── клавіатури ──
function pickKb(prefix: string, codes: readonly string[], group: 'cat' | 'region' | 'budget' | 'timing', selected?: string[], cols = 2, withDone = false): InlineKeyboard {
  const rows: InlineKeyboard = [];
  let row: InlineKeyboard[number] = [];
  for (const c of codes) {
    const mark = selected?.includes(c) ? '✓ ' : '';
    row.push({ text: mark + label(d, group, c), callback_data: `${prefix}:${c}` });
    if (row.length === cols) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  if (withDone) rows.push([{ text: d.done, callback_data: `${prefix}:done` }]);
  return rows;
}
const REGION_PICK = [ALL_UA, ...REGIONS];

export async function handleUpdate(env: Env, update: TgUpdate, now = new Date()): Promise<void> {
  const ctx: Ctx = { env, db: env.DB, tg: new Telegram(env), now };
  if (update.message?.from && update.message.chat.type === 'private') return onMessage(ctx, update.message);
  if (update.callback_query) return onCallback(ctx, update.callback_query);
}

// ───────────── повідомлення ─────────────

async function onMessage(ctx: Ctx, msg: TgMessage) {
  const tgId = msg.from!.id;
  const chat = msg.chat.id;
  const text = (msg.text ?? '').trim();
  const member = await memberByTg(ctx.db, tgId);

  if (text.startsWith('/')) {
    const [cmdRaw, ...args] = text.split(/\s+/);
    const cmd = cmdRaw.split('@')[0].toLowerCase();
    if (cmd === '/start') return start(ctx, tgId, chat, member);
    if (cmd === '/cancel') { await clearSession(ctx.db, tgId); return void ctx.tg.send(chat, d.cancelled, member?.status === 'active' ? { reply: mainMenu(d) } : {}); }
    if (cmd === '/help') return void ctx.tg.send(chat, d.help + (isAdmin(ctx.env, tgId) ? '\n\n' + d.admin_help : ''));
    if (cmd === '/pause' && member) {
      const days = Math.min(Math.max(parseInt(args[0] ?? '7', 10) || 7, 1), 180);
      const until = nowIso(addMs(ctx.now, days * DAY));
      await run(ctx.db, 'UPDATE members SET paused_until = ? WHERE id = ?', until, member.id);
      return void ctx.tg.send(chat, fmt(d.paused, { until: until.slice(0, 10) }));
    }
    if (cmd === '/resume' && member) {
      await run(ctx.db, 'UPDATE members SET paused_until = NULL WHERE id = ?', member.id);
      return void ctx.tg.send(chat, d.resumed);
    }
    if (['/admin', '/pending', '/approve', '/reject', '/block', '/leads', '/deals', '/export'].includes(cmd)) return adminCmd(ctx, tgId, chat, cmd, args);
  }

  if (member?.status === 'active') {
    if (text === d.menu_give) return startLead(ctx, tgId, chat);
    if (text === d.menu_leads) return myLeads(ctx, chat, member);
    if (text === d.menu_deals) return myDeals(ctx, chat, member);
    if (text === d.menu_profile) return profile(ctx, chat, member);
    if (text === d.menu_help) return void ctx.tg.send(chat, d.help);
  }

  const s = await getSession(ctx.db, tgId);
  if (!s) return void ctx.tg.send(chat, member ? d.unknown : d.start_new.split('\n\n')[0] + '\n/start');
  return onText(ctx, tgId, chat, member, s, text, msg);
}

async function start(ctx: Ctx, tgId: number, chat: number, member: MemberRow | null) {
  await clearSession(ctx.db, tgId);
  if (!member) {
    await setSession(ctx.db, tgId, 'ob_company', {});
    return void ctx.tg.send(chat, d.start_new);
  }
  const key = ({ pending: 'start_pending', rejected: 'start_rejected', blocked: 'start_blocked' } as const)[member.status as 'pending'];
  if (key) return void ctx.tg.send(chat, d[key]);
  return void ctx.tg.send(chat, fmt(d.start_active, { company: member.company }), { reply: mainMenu(d) });
}

async function onText(ctx: Ctx, tgId: number, chat: number, member: MemberRow | null, s: Session, text: string, msg: TgMessage) {
  const data = s.data;
  switch (s.state) {
    // ── вступ ──
    case 'ob_company':
      if (text.length < 2 || text.length > 120) return void ctx.tg.send(chat, d.start_new.split('\n\n').pop()!);
      await setSession(ctx.db, tgId, 'ob_edrpou', { ...data, company: text, tg_username: msg.from?.username ?? null });
      return void ctx.tg.send(chat, d.ask_edrpou);
    case 'ob_edrpou': {
      const code = text.replace(/\s/g, '');
      if (!/^(\d{8}|\d{10})$/.test(code)) return void ctx.tg.send(chat, d.bad_edrpou);
      await setSession(ctx.db, tgId, 'ob_contact', { ...data, edrpou: code });
      return void ctx.tg.send(chat, d.ask_contact_name);
    }
    case 'ob_contact':
      await setSession(ctx.db, tgId, 'ob_cats', { ...data, contact_name: text.slice(0, 120), categories: [] });
      return void ctx.tg.send(chat, d.ask_categories, { keyboard: pickKb('oc', CATEGORIES, 'cat', [], 2, true) });
    case 'ob_portfolio':
      await setSession(ctx.db, tgId, 'ob_terms', { ...data, portfolio_url: text.slice(0, 300) });
      return askPlatformTerms(ctx, chat);

    // ── OTP ──
    case 'otp': return onOtp(ctx, tgId, chat, member, data, text);

    // ── лід ──
    case 'ld_area': {
      const n = parseFloat(text.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return void ctx.tg.send(chat, d.bad_number);
      await setSession(ctx.db, tgId, 'ld_budget', { ...data, area: Math.round(n * 10) / 10 });
      return void ctx.tg.send(chat, d.give_budget, { keyboard: pickKb('lb', BUDGET_BAND_KEYS, 'budget', undefined, 2) });
    }
    case 'ld_notes': {
      const notes = text === '-' ? '' : text.slice(0, 600);
      const hits = detectPii(notes);
      if (hits.length) {
        const what = [...new Set(hits.map((h) => ({ phone: 'телефон', email: 'e-mail', link: 'посилання', handle: '@нік', address: 'адреса', name: 'ім’я', id_number: 'номер/код' })[h.kind]))].join(', ');
        return void ctx.tg.send(chat, fmt(d.pii_found, { what }));
      }
      await setSession(ctx.db, tgId, 'ld_pct', { ...data, notes });
      return void ctx.tg.send(chat, d.give_pct, { keyboard: pctKb() });
    }
    case 'ld_pct_custom': {
      const p = parseFloat(text.replace(',', '.').replace('%', ''));
      if (!validPct(p)) return void ctx.tg.send(chat, d.bad_pct);
      return askContact(ctx, tgId, chat, data, p);
    }
    case 'ld_contact': {
      const key = contactKey(text);
      if (!key) return void ctx.tg.send(chat, d.bad_contact);
      const contact_enc = await encryptText(ctx.env.CONTACT_KEY, text.slice(0, 300));
      const client_hash = await hmacHex(ctx.env.HASH_KEY, key);
      const next = { ...data, contact_enc, client_hash };
      await setSession(ctx.db, tgId, 'ld_confirm', next);
      const preview = cardText({
        id: 0, category: String(data.category), region: String(data.region), area: Number(data.area), area_unit: String(data.area_unit),
        budget_band: String(data.budget_band), timing: String(data.timing), notes: String(data.notes ?? ''), commission_pct: Number(data.commission_pct),
        expires_at: nowIso(addMs(ctx.now, LEAD_TTL_MS)),
      }).replace('#0', '#…');
      return void ctx.tg.send(chat, fmt(d.give_summary, { card: preview }, ['card']), {
        keyboard: [[{ text: d.publish_btn, callback_data: 'lpub' }, { text: d.cancel, callback_data: 'lx' }]],
      });
    }

    // ── суми угоди ──
    case 'deal_amount': {
      const cents = parseUsd(text);
      if (!cents) return void ctx.tg.send(chat, d.bad_amount);
      const deal = await dealById(ctx.db, Number(data.deal_id));
      if (!member || !deal || deal.receiver_id !== member.id) { await clearSession(ctx.db, tgId); return void ctx.tg.send(chat, d.illegal); }
      await clearSession(ctx.db, tgId);
      try {
        if (data.kind === 'contract') {
          const f = await recordContract(ctx, deal, member, cents);
          await ctx.tg.send(chat, fmt(d.contract_saved, { amount: fmtUsd(cents), ref: fmtUsd(f.referrer_cents), fee: fmtUsd(f.platform_fee_cents) }));
        } else {
          const a = await recordPayment(ctx, deal, member, cents);
          await ctx.tg.send(chat, fmt(d.payment_saved, { amount: fmtUsd(cents), ref: fmtUsd(a.referrer_cents), fee: fmtUsd(a.platform_fee_cents) }));
        }
      } catch {
        return void ctx.tg.send(chat, d.illegal);
      }
      const fresh = (await dealById(ctx.db, deal.id))!;
      return void ctx.tg.send(chat, dealCard(fresh), { keyboard: dealKeyboard(fresh) });
    }
  }
  return void ctx.tg.send(chat, d.unknown);
}

function pctKb(): InlineKeyboard {
  return [[5, 7, 10, 12, 15].map((p) => ({ text: (p === COMMISSION_DEFAULT ? '★ ' : '') + p + '%', callback_data: `lp:${p}` })),
    [{ text: d.give_pct_custom, callback_data: 'lp:x' }]];
}

async function askContact(ctx: Ctx, tgId: number, chat: number, data: Data, pct: number) {
  await setSession(ctx.db, tgId, 'ld_contact', { ...data, commission_pct: pct });
  return void ctx.tg.send(chat, d.give_contact);
}

async function askPlatformTerms(ctx: Ctx, chat: number) {
  return void ctx.tg.send(chat, fmt(d.terms_platform, { version: ctx.env.TERMS_VERSION, url: `${ctx.env.PUBLIC_URL.replace(/\/$/, '')}/terms` }), {
    keyboard: [[{ text: d.accept_btn, callback_data: 'oterms' }]],
  });
}

async function onOtp(ctx: Ctx, tgId: number, chat: number, member: MemberRow | null, data: Data, text: string) {
  const purpose = String(data.purpose);
  const r = await verifyOtp(ctx, tgId, purpose, text.replace(/\D/g, ''));
  if (!r.ok) {
    if (r.reason === 'bad') return void ctx.tg.send(chat, fmt(d.otp_bad, { left: r.left }));
    await clearSession(ctx.db, tgId);
    return void ctx.tg.send(chat, d.otp_expired);
  }
  await clearSession(ctx.db, tgId);
  if (purpose === 'platform') {
    if (member) return void ctx.tg.send(chat, d.start_pending);
    const draft = data.draft as Record<string, unknown>;
    const id = await createMember(ctx, tgId, {
      company: String(draft.company), edrpou: String(draft.edrpou), contact_name: String(draft.contact_name),
      categories: draft.categories as string[], regions: draft.regions as string[],
      budget_min: draft.budget_min as number | null, budget_max: draft.budget_max as number | null,
      portfolio_url: (draft.portfolio_url as string | null) ?? null, tg_username: (draft.tg_username as string | null) ?? null,
    });
    await ctx.tg.send(chat, d.application_sent);
    return notifyAdminsNewMember(ctx, id);
  }
  if (purpose.startsWith('lead:') && member) {
    const res = await acceptLeadTerms(ctx, member, Number(purpose.slice(5)));
    if (!res.ok) return void ctx.tg.send(chat, fmt(d[res.error.key], { until: res.error.until, n: 3 }));
  }
}

// ───────────── кнопки ─────────────

async function onCallback(ctx: Ctx, cb: TgCallback) {
  const tgId = cb.from.id;
  const chat = cb.message?.chat.id ?? tgId;
  const data = cb.data ?? '';
  const [k, a1, a2] = data.split(':');
  const member = await memberByTg(ctx.db, tgId);
  const s = await getSession(ctx.db, tgId);
  const ack = (t?: string) => ctx.tg.answer(cb.id, t);

  // ── вступ: мультивибір ──
  if ((k === 'oc' || k === 'or' || k === 'ob') && s) {
    const field = k === 'oc' ? 'categories' : k === 'or' ? 'regions' : 'bands';
    const state = k === 'oc' ? 'ob_cats' : k === 'or' ? 'ob_regs' : 'ob_buds';
    if (s.state !== state) return void ack();
    const sel = new Set((s.data[field] as string[]) ?? []);
    if (a1 !== 'done') {
      if (sel.has(a1)) sel.delete(a1); else sel.add(a1);
      if (k === 'or' && a1 === ALL_UA && sel.has(ALL_UA)) { sel.clear(); sel.add(ALL_UA); }
      if (k === 'or' && a1 !== ALL_UA) sel.delete(ALL_UA);
      await setSession(ctx.db, tgId, state, { ...s.data, [field]: [...sel] });
      const kb = k === 'oc' ? pickKb('oc', CATEGORIES, 'cat', [...sel], 2, true)
        : k === 'or' ? pickKb('or', REGION_PICK, 'region', [...sel], 3, true)
          : pickKb('ob', BUDGET_BAND_KEYS, 'budget', [...sel], 2, true);
      if (cb.message) await ctx.tg.editKeyboard(chat, cb.message.message_id, kb);
      return void ack();
    }
    if (!sel.size) return void ack(d.pick_one);
    await ack();
    if (k === 'oc') {
      await setSession(ctx.db, tgId, 'ob_regs', { ...s.data, regions: [] });
      return void ctx.tg.send(chat, d.ask_regions, { keyboard: pickKb('or', REGION_PICK, 'region', [], 3, true) });
    }
    if (k === 'or') {
      await setSession(ctx.db, tgId, 'ob_buds', { ...s.data, bands: [] });
      return void ctx.tg.send(chat, d.ask_budgets, { keyboard: pickKb('ob', BUDGET_BAND_KEYS, 'budget', [], 2, true) });
    }
    const bands = [...sel] as BudgetBand[];
    const budget_min = Math.min(...bands.map((b) => BUDGET_BANDS[b].lo));
    const budget_max = bands.some((b) => BUDGET_BANDS[b].hi === null) ? null : Math.max(...bands.map((b) => BUDGET_BANDS[b].hi as number));
    await setSession(ctx.db, tgId, 'ob_portfolio', { ...s.data, budget_min, budget_max });
    return void ctx.tg.send(chat, d.ask_portfolio, { keyboard: [[{ text: d.skip, callback_data: 'oskip' }]] });
  }
  if (k === 'oskip' && s?.state === 'ob_portfolio') {
    await ack();
    await setSession(ctx.db, tgId, 'ob_terms', { ...s.data, portfolio_url: null });
    return askPlatformTerms(ctx, chat);
  }
  if (k === 'oterms' && s?.state === 'ob_terms') {
    await ack();
    const code = await issueOtp(ctx, tgId, 'platform');
    await setSession(ctx.db, tgId, 'otp', { purpose: 'platform', draft: s.data });
    return void ctx.tg.send(chat, fmt(d.otp_sent, { code }));
  }

  // ── адмін: модерація ──
  if (k === 'adm') {
    if (!isAdmin(ctx.env, tgId)) return void ack(d.admin_only);
    const st = a1 === 'ok' ? 'active' : 'rejected';
    const res = await setMemberStatus(ctx, Number(a2), st, tgId);
    await ack(res ? fmt(d.admin_done, { id: a2, status: st }) : d.admin_none);
    if (cb.message) await ctx.tg.editKeyboard(chat, cb.message.message_id, []);
    return;
  }

  if (!member || member.status !== 'active') return void ack(d.not_active);

  // ── майстер ліда ──
  if (k === 'lc' && s?.state === 'ld_cat') {
    await ack();
    await setSession(ctx.db, tgId, 'ld_region', { category: a1, area_unit: a1 === 'landscape' ? 'sotka' : 'm2' });
    return void ctx.tg.send(chat, d.give_region, { keyboard: pickKb('lr', REGIONS, 'region', undefined, 3) });
  }
  if (k === 'lr' && s?.state === 'ld_region') {
    await ack();
    await setSession(ctx.db, tgId, 'ld_area', { ...s.data, region: a1 });
    return void ctx.tg.send(chat, fmt(d.give_area, { unit: label(d, 'unit', String(s.data.area_unit)) }));
  }
  if (k === 'lb' && s?.state === 'ld_budget') {
    await ack();
    await setSession(ctx.db, tgId, 'ld_timing', { ...s.data, budget_band: a1 });
    return void ctx.tg.send(chat, d.give_timing, { keyboard: pickKb('lt', TIMINGS, 'timing', undefined, 2) });
  }
  if (k === 'lt' && s?.state === 'ld_timing') {
    await ack();
    await setSession(ctx.db, tgId, 'ld_notes', { ...s.data, timing: a1 });
    return void ctx.tg.send(chat, d.give_notes);
  }
  if (k === 'lp' && s?.state === 'ld_pct') {
    await ack();
    if (a1 === 'x') { await setSession(ctx.db, tgId, 'ld_pct_custom', s.data); return void ctx.tg.send(chat, d.ask_pct); }
    return askContact(ctx, tgId, chat, s.data, Number(a1));
  }
  if (k === 'lx') { await ack(); await clearSession(ctx.db, tgId); return void ctx.tg.send(chat, d.cancelled, { reply: mainMenu(d) }); }
  if (k === 'lpub' && s?.state === 'ld_confirm') {
    await ack();
    await clearSession(ctx.db, tgId);
    const x = s.data;
    const res = await publishLead(ctx, member, {
      category: String(x.category), region: String(x.region), area: Number(x.area), area_unit: x.area_unit as 'm2' | 'sotka',
      budget_band: String(x.budget_band), timing: String(x.timing), notes: String(x.notes ?? ''), commission_pct: Number(x.commission_pct),
      contact_enc: String(x.contact_enc), client_hash: String(x.client_hash),
    });
    if (res.duplicateOf) await ctx.tg.send(chat, fmt(d.lead_duplicate, { id: res.duplicateOf }));
    return void ctx.tg.send(chat, res.offered
      ? fmt(d.lead_published, { id: res.lead.id, n: res.offered })
      : fmt(d.lead_published_none, { id: res.lead.id, days: Math.round(LEAD_TTL_MS / DAY) }), { reply: mainMenu(d) });
  }

  // ── «Взяти» ──
  if (k === 'tk' || k === 'ta') {
    const lead = await leadById(ctx.db, Number(a1));
    const err = await takeCheck(ctx, member, lead);
    if (err) { await ack(); return void ctx.tg.send(chat, fmt(d[err.key], { until: err.until, n: 3 })); }
    await ack();
    if (k === 'tk') return void ctx.tg.send(chat, takeTermsText(lead!), { keyboard: [[{ text: d.take_accept_btn, callback_data: `ta:${lead!.id}` }]] });
    const code = await issueOtp(ctx, tgId, `lead:${lead!.id}`);
    await setSession(ctx.db, tgId, 'otp', { purpose: `lead:${lead!.id}` });
    return void ctx.tg.send(chat, fmt(d.otp_sent, { code }));
  }
  if (k === 'tp') {
    await declineOffer(ctx, member, Number(a1));
    await ack(d.declined_ok);
    if (cb.message) await ctx.tg.editKeyboard(chat, cb.message.message_id, []);
    return;
  }

  // ── усна згода (рекомендувач) ──
  if (k === 'mc') {
    const deal = await dealById(ctx.db, Number(a1));
    const lead = deal ? await leadById(ctx.db, deal.lead_id) : null;
    if (!deal || !lead || lead.referrer_id !== member.id) return void ack(d.illegal);
    const r = await grantConsent(ctx, deal, 'manual', { actor: `tg:${tgId}` });
    await ack();
    if (cb.message) await ctx.tg.editKeyboard(chat, cb.message.message_id, []);
    return void ctx.tg.send(chat, 'ok' in r && r.ok ? d.manual_consent_done : d.illegal);
  }

  // ── статуси угоди (отримувач) ──
  if (k === 'ds') {
    const deal = await dealById(ctx.db, Number(a1));
    const to = a2 as DealStatus;
    if (!deal || deal.receiver_id !== member.id || !canTransition(deal.status as DealStatus, to, 'receiver')) return void ack(d.illegal);
    await ack();
    const amt = needsAmount(to);
    if (amt) {
      await setSession(ctx.db, tgId, 'deal_amount', { deal_id: deal.id, kind: amt });
      return void ctx.tg.send(chat, amt === 'contract' ? d.ask_contract_amount : d.ask_payment_amount);
    }
    await setDealStatus(ctx, deal, to, 'receiver', `tg:${tgId}`);
    const fresh = (await dealById(ctx.db, deal.id))!;
    return void ctx.tg.send(chat, fmt(d.status_saved, { status: label(d, 'deal_status', to) }) + '\n\n' + dealCard(fresh), { keyboard: dealKeyboard(fresh) });
  }

  // ── підтвердження виплати комісії (рекомендувач) ──
  if (k === 'cp') {
    const ok = await confirmCommission(ctx, member, Number(a1));
    await ack(ok ? d.commission_confirmed : d.illegal);
    if (ok && cb.message) await ctx.tg.editKeyboard(chat, cb.message.message_id, []);
    return;
  }

  return void ack();
}

async function startLead(ctx: Ctx, tgId: number, chat: number) {
  await setSession(ctx.db, tgId, 'ld_cat', {});
  return void ctx.tg.send(chat, d.give_cat, { keyboard: pickKb('lc', CATEGORIES, 'cat', undefined, 2) });
}

async function myLeads(ctx: Ctx, chat: number, m: MemberRow) {
  const rows = await all<LeadRow>(ctx.db, 'SELECT * FROM leads WHERE referrer_id = ? ORDER BY id DESC LIMIT 20', m.id);
  if (!rows.length) return void ctx.tg.send(chat, d.leads_empty);
  return void ctx.tg.send(chat, rows.map((l) => fmt(d.lead_line, {
    id: l.id, cat: label(d, 'cat', l.category), region: label(d, 'region', l.region), pct: l.commission_pct, status: label(d, 'lead_status', l.status),
  })).join('\n'));
}

async function myDeals(ctx: Ctx, chat: number, m: MemberRow) {
  const rows = await all<DealRow>(ctx.db, 'SELECT * FROM deals WHERE receiver_id = ? ORDER BY active DESC, id DESC LIMIT 10', m.id);
  if (!rows.length) return void ctx.tg.send(chat, d.deals_empty);
  for (const r of rows) await ctx.tg.send(chat, dealCard(r), r.active ? { keyboard: dealKeyboard(r) } : {});
}

async function profile(ctx: Ctx, chat: number, m: MemberRow) {
  const s = memberSummary(m);
  const pause = m.paused_until && new Date(m.paused_until) > ctx.now ? fmt(d.paused, { until: m.paused_until.slice(0, 10) }) + '\n' : '';
  return void ctx.tg.send(chat, fmt(d.profile, {
    company: m.company, status: m.verified ? 'перевірено' : m.status, cats: s.cats, regions: s.regions, budgets: s.budgets,
    rating: m.rating_avg ? m.rating_avg.toFixed(1) : '—', closed: m.deals_closed, pause,
  }, ['pause']));
}

// ───────────── адмін-команди ─────────────

async function adminCmd(ctx: Ctx, tgId: number, chat: number, cmd: string, args: string[]) {
  if (!isAdmin(ctx.env, tgId)) return void ctx.tg.send(chat, d.admin_only);
  if (cmd === '/admin') return void ctx.tg.send(chat, d.admin_help);
  if (cmd === '/pending') {
    const rows = await all<{ id: number }>(ctx.db, "SELECT id FROM members WHERE status = 'pending' ORDER BY id");
    if (!rows.length) return void ctx.tg.send(chat, d.admin_none);
    for (const r of rows) await notifyAdminsNewMemberTo(ctx, r.id, chat);
    return;
  }
  if (cmd === '/approve' || cmd === '/reject' || cmd === '/block') {
    const id = Number(args[0]);
    if (!id) return void ctx.tg.send(chat, d.admin_bad_id);
    const st = cmd === '/approve' ? 'active' : cmd === '/reject' ? 'rejected' : 'blocked';
    const res = await setMemberStatus(ctx, id, st, tgId);
    return void ctx.tg.send(chat, res ? fmt(d.admin_done, { id, status: st }) : d.admin_none);
  }
  if (cmd === '/leads') {
    const st = args[0];
    const rows = st
      ? await all<LeadRow & { company: string }>(ctx.db, 'SELECT l.*, m.company FROM leads l JOIN members m ON m.id = l.referrer_id WHERE l.status = ? ORDER BY l.id DESC LIMIT 30', st)
      : await all<LeadRow & { company: string }>(ctx.db, 'SELECT l.*, m.company FROM leads l JOIN members m ON m.id = l.referrer_id ORDER BY l.id DESC LIMIT 30');
    if (!rows.length) return void ctx.tg.send(chat, d.admin_none);
    return void ctx.tg.send(chat, rows.map((l) => `#${l.id} · ${label(d, 'cat', l.category)} · ${label(d, 'region', l.region)} · ${l.commission_pct}% · ${label(d, 'lead_status', l.status)} · від ${l.company}${l.duplicate_of ? ` · дубль #${l.duplicate_of}` : ''}`).join('\n').replace(/[<>&]/g, ''));
  }
  if (cmd === '/deals') {
    const rows = await all<DealRow & { company: string }>(ctx.db, 'SELECT dl.*, m.company FROM deals dl JOIN members m ON m.id = dl.receiver_id ORDER BY dl.id DESC LIMIT 30');
    if (!rows.length) return void ctx.tg.send(chat, d.admin_none);
    return void ctx.tg.send(chat, rows.map((x) => `#${x.id} · лід #${x.lead_id} · ${x.company} · ${label(d, 'deal_status', x.status)}${x.contract_amount_cents ? ' · ' + fmtUsd(x.contract_amount_cents) : ''}`).join('\n').replace(/[<>&]/g, ''));
  }
  if (cmd === '/export') {
    const what = (args[0] ?? 'leads') as keyof typeof EXPORTS;
    if (!EXPORTS[what]) return void ctx.tg.send(chat, d.admin_help);
    const { csv, n } = await exportCsv(ctx.db, what);
    await ctx.tg.sendDocument(chat, `leadmist-${what}-${ctx.now.toISOString().slice(0, 10)}.csv`, csv, fmt(d.admin_export_caption, { what, n }));
    return;
  }
}

async function notifyAdminsNewMemberTo(ctx: Ctx, memberId: number, chat: number) {
  const m = await one<MemberRow>(ctx.db, 'SELECT * FROM members WHERE id = ?', memberId);
  if (!m) return;
  const s = memberSummary(m);
  await ctx.tg.send(chat, fmt(d.admin_new_member, {
    id: m.id, company: m.company, edrpou: m.edrpou, contact: m.contact_name, cats: s.cats, regions: s.regions, budgets: s.budgets,
    portfolio: m.portfolio_url ?? '—', tg: m.tg_username ? '@' + m.tg_username : String(m.tg_id),
  }), { keyboard: [[{ text: d.approve_btn, callback_data: `adm:ok:${m.id}` }, { text: d.reject_btn, callback_data: `adm:no:${m.id}` }]] });
}

