// Наскрізний сценарій через вебхук Worker'а: in-memory D1 (node:sqlite) + підмінений Telegram API.
// Усі дані вигадані.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { runCron } from '../src/cron';
import type { Env } from '../src/env';
import { makeD1 } from './d1-shim';

interface Sent { method: string; chat_id?: number; text?: string; reply_markup?: { inline_keyboard?: { text: string; callback_data?: string }[][] }; doc?: boolean }

let sent: Sent[] = [];
const realFetch = globalThis.fetch;
let env: Env;
let upd = 1;

function mkEnv(): Env {
  return {
    DB: makeD1(),
    PUBLIC_URL: 'https://leadmist.test',
    BOT_USERNAME: 'LeadMistTestBot',
    ADMIN_TG_IDS: '900',
    TERMS_VERSION: 'platform-test',
    TELEGRAM_BOT_TOKEN: 'TEST:TOKEN',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret-0123456789abcdef',
    CONTACT_KEY: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1))),
    HASH_KEY: 'test-hash-key-0123456789abcdef',
    TG_API_BASE: 'https://tg.mock',
  };
}

beforeEach(() => {
  sent = [];
  env = mkEnv();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = url.split('/').pop()!;
    if (init?.body instanceof FormData) sent.push({ method, chat_id: Number(init.body.get('chat_id')), doc: true, text: String(init.body.get('caption')) });
    else sent.push({ method, ...(JSON.parse(String(init?.body ?? '{}')) as object) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const ectx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function hook(update: object, secret = env.TELEGRAM_WEBHOOK_SECRET) {
  const res = await worker.fetch(new Request('https://leadmist.test/tg/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update),
  }), env, ectx);
  return res;
}
const text = (tg: number, t: string) => hook({ update_id: upd++, message: { message_id: upd, chat: { id: tg, type: 'private' }, from: { id: tg, username: `fake${tg}` }, text: t } });
const press = (tg: number, data: string) => hook({ update_id: upd++, callback_query: { id: `cb${upd}`, from: { id: tg }, data, message: { message_id: 1, chat: { id: tg, type: 'private' } } } });
const to = (tg: number) => sent.filter((s) => s.method === 'sendMessage' && s.chat_id === tg);
const last = (tg: number) => to(tg).at(-1)?.text ?? '';
const lastOtp = (tg: number) => [...to(tg)].reverse().map((s) => s.text?.match(/<code>(\d{6})<\/code>/)?.[1]).find(Boolean)!;
const db = () => env.DB as unknown as { raw: { prepare(s: string): { get(...a: unknown[]): any; all(...a: unknown[]): any[] } } };
const q = (sql: string, ...a: unknown[]) => db().raw.prepare(sql).get(...a);

async function onboard(tg: number, company: string, cats: string[], regions: string[], bands: string[]) {
  await text(tg, '/start');
  await text(tg, company);
  await text(tg, '12345678');
  await text(tg, 'Тест Тестович, директор');
  for (const c of cats) await press(tg, `oc:${c}`);
  await press(tg, 'oc:done');
  for (const r of regions) await press(tg, `or:${r}`);
  await press(tg, 'or:done');
  for (const b of bands) await press(tg, `ob:${b}`);
  await press(tg, 'ob:done');
  await press(tg, 'oskip');
  await press(tg, 'oterms');
  await text(tg, lastOtp(tg));
  const m = q('SELECT id, status FROM members WHERE tg_id = ?', tg);
  expect(m.status).toBe('pending');
  await press(900, `adm:ok:${m.id}`);
  expect(q('SELECT status, verified FROM members WHERE id = ?', m.id)).toEqual({ status: 'active', verified: 1 });
  return m.id as number;
}

async function giveLead(tg: number, notes = 'Ремонт трикімнатної квартири, є дизайн-проєкт', contact = 'Тест Тестовий, 067 000 00 01') {
  await text(tg, '➕ Передати клієнта');
  await press(tg, 'lc:renovation');
  await press(tg, 'lr:kyiv');
  await text(tg, '80');
  await press(tg, 'lb:30_80');
  await press(tg, 'lt:now');
  await text(tg, notes);
  await press(tg, 'lp:10');
  await text(tg, contact);
  await press(tg, 'lpub');
  return q('SELECT * FROM leads ORDER BY id DESC LIMIT 1');
}

async function take(tg: number, leadId: number) {
  await press(tg, `tk:${leadId}`);
  await press(tg, `ta:${leadId}`);
  await text(tg, lastOtp(tg));
}

describe('webhook security', () => {
  it('rejects a wrong secret', async () => {
    expect((await hook({ update_id: 1 }, 'nope')).status).toBe(403);
  });
  it('serves landing, terms and 404', async () => {
    const r = await worker.fetch(new Request('https://leadmist.test/'), env, ectx);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('ЛідМіст');
    expect(body).not.toMatch(/CAS/);
    expect((await worker.fetch(new Request('https://leadmist.test/terms'), env, ectx)).status).toBe(200);
    expect((await worker.fetch(new Request('https://leadmist.test/c/' + 'x'.repeat(32)), env, ectx)).status).toBe(404);
  });
});

describe('full flow: onboarding → lead → take → consent → reveal → deal → commissions', () => {
  it('works end to end', async () => {
    const A = 101, B = 102, C = 103, D = 104;
    await onboard(A, 'Тестова Студія А', ['design'], ['kyiv'], ['30_80']);
    const bId = await onboard(B, 'Тест Ремонт Б', ['renovation'], ['kyiv'], ['10_30', '30_80']);
    await onboard(C, 'Тест Будова В', ['renovation', 'construction'], ['UA'], ['80p', '30_80']);
    await onboard(D, 'Тест Сад Г', ['landscape'], ['kyiv'], ['30_80']); // не той профіль
    expect(q("SELECT COUNT(*) AS n FROM acceptances WHERE kind = 'platform' AND otp_ok = 1").n).toBe(4);

    // PII у примітці блокується
    await text(A, '➕ Передати клієнта');
    await press(A, 'lc:renovation'); await press(A, 'lr:kyiv'); await text(A, '80'); await press(A, 'lb:30_80'); await press(A, 'lt:now');
    await text(A, 'Дзвоніть Оксані 067 111 22 33');
    expect(last(A)).toContain('персональні дані');
    await text(A, '/cancel');

    const lead = await giveLead(A);
    expect(lead.status).toBe('open');
    expect(lead.notes).not.toMatch(/067/);
    const contactRow = q('SELECT enc_payload FROM lead_contacts WHERE lead_id = ?', lead.id);
    expect(contactRow.enc_payload).not.toContain('067');           // зашифровано
    expect(q('SELECT COUNT(*) AS n FROM lead_offers WHERE lead_id = ?', lead.id).n).toBe(2); // B і C, без D і самого A
    expect(last(B)).toContain(`Лід #${lead.id}`);
    expect(last(D)).not.toContain(`Лід #${lead.id}`);

    // B бере: умови → OTP → бронювання
    await take(B, lead.id);
    expect(q('SELECT status FROM leads WHERE id = ?', lead.id).status).toBe('reserved');
    const deal = q('SELECT * FROM deals WHERE lead_id = ?', lead.id);
    expect(deal.status).toBe('reserved');
    expect(q('SELECT otp_ok, terms_version FROM acceptances WHERE id = ?', deal.acceptance_id)).toEqual({ otp_ok: 1, terms_version: 'lead-2026-11-16-draft' });
    expect(last(A)).toContain(`/c/${deal.consent_token}`);
    // контакт ще не розкрито
    expect(to(B).some((s) => s.text?.includes('067 000 00 01'))).toBe(false);

    // C не може взяти заброньований лід
    await press(C, `tk:${lead.id}`);
    expect(last(C)).toContain('недоступний');

    // сторінка згоди
    const page = await (await worker.fetch(new Request(`https://leadmist.test/c/${deal.consent_token}`), env, ectx)).text();
    expect(page).toContain('Тест Ремонт Б');
    expect(page).toContain('Тестова Студія А');
    expect(page).toContain('+380 67 *** ** 01');
    expect(page).not.toContain('067 000 00 01');

    const fd = new FormData(); fd.set('action', 'agree');
    const r = await worker.fetch(new Request(`https://leadmist.test/c/${deal.consent_token}`, { method: 'POST', body: fd, headers: { 'cf-connecting-ip': '203.0.113.5' } }), env, ectx);
    expect(r.status).toBe(200);
    expect(q('SELECT status FROM deals WHERE id = ?', deal.id).status).toBe('revealed');
    expect(to(B).some((s) => s.text?.includes('067 000 00 01'))).toBe(true);
    expect(to(C).some((s) => s.text?.includes('067 000 00 01'))).toBe(false);
    expect(q("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'contact.reveal'").n).toBe(1);
    expect(q('SELECT ip FROM client_consents WHERE deal_id = ?', deal.id).ip).toBe('203.0.113.5');

    // статуси: не можна стрибнути одразу на договір
    await press(B, `ds:${deal.id}:contract`);
    expect(q('SELECT status FROM deals WHERE id = ?', deal.id).status).toBe('revealed');
    await press(B, `ds:${deal.id}:contacted`);
    await press(B, `ds:${deal.id}:meeting`);
    await press(B, `ds:${deal.id}:contract`);
    await text(B, '44 000');
    expect(q('SELECT status, contract_amount_cents FROM deals WHERE id = ?', deal.id)).toEqual({ status: 'contract', contract_amount_cents: 44_000_00 });
    expect(to(B).some((s) => s.text?.includes('$4 400'))).toBe(true);

    // два транші по $22 000 → комісія $2 200 + $2 200, платформа $330 + $330
    await press(B, `ds:${deal.id}:payment`); await text(B, '22000');
    await press(B, `ds:${deal.id}:payment`); await text(B, '22000');
    const comms = db().raw.prepare('SELECT referrer_cents, platform_fee_cents, status FROM commissions WHERE deal_id = ? ORDER BY id').all(deal.id);
    expect(comms.map((c) => ({ ...c }))).toEqual([
      { referrer_cents: 2_200_00, platform_fee_cents: 330_00, status: 'accrued' },
      { referrer_cents: 2_200_00, platform_fee_cents: 330_00, status: 'accrued' },
    ]);
    // інший учасник не може підтвердити виплату
    await press(C, 'cp:1');
    expect(q('SELECT status FROM commissions WHERE id = 1').status).toBe('accrued');
    await press(A, 'cp:1');
    expect(q('SELECT status FROM deals WHERE id = ?', deal.id).status).toBe('payment');
    await press(A, 'cp:2');
    expect(q('SELECT status FROM deals WHERE id = ?', deal.id).status).toBe('commission_paid');
    await press(B, `ds:${deal.id}:closed`);
    expect(q('SELECT status, active FROM deals WHERE id = ?', deal.id)).toEqual({ status: 'closed', active: 0 });
    expect(q('SELECT deals_closed FROM members WHERE id = ?', bId).deals_closed).toBe(1);

    // адмін: експорт CSV
    await text(900, '/export commissions');
    expect(sent.some((s) => s.method === 'sendDocument' && s.doc && s.chat_id === 900)).toBe(true);
    await text(B, '/export leads');
    expect(last(B)).toContain('лише для адміністраторів');
  });
});

describe('cron and timeouts', () => {
  it('wave 2 after 24 h exclusivity, expiry after 7 days', async () => {
    const A = 201;
    await onboard(A, 'Тест А', ['design'], ['kyiv'], ['30_80']);
    const ids: number[] = [];
    for (let i = 0; i < 7; i++) ids.push(await onboard(300 + i, `Тест Ремонт ${i}`, ['renovation'], ['kyiv'], ['30_80']));
    const lead = await giveLead(A);
    expect(q('SELECT COUNT(*) AS n FROM lead_offers WHERE lead_id = ? AND wave = 1', lead.id).n).toBe(5);
    // учасник поза топ-5 не може взяти під час ексклюзиву
    const outsider = db().raw.prepare('SELECT m.tg_id FROM members m WHERE m.id NOT IN (SELECT member_id FROM lead_offers WHERE lead_id = ?) AND m.tg_id >= 300').all(lead.id)[0].tg_id;
    await press(outsider, `tk:${lead.id}`);
    expect(last(outsider)).toContain('недоступний');

    const s1 = await runCron(env, new Date(Date.now() + 25 * 3600_000));
    expect(s1.wave2).toBe(1);
    expect(q('SELECT COUNT(*) AS n FROM lead_offers WHERE lead_id = ?', lead.id).n).toBe(7);
    const s2 = await runCron(env, new Date(Date.now() + 8 * 24 * 3600_000));
    expect(s2.expired).toBe(1);
    expect(q('SELECT status FROM leads WHERE id = ?', lead.id).status).toBe('expired');
  });

  it('no consent in 72 h → booking cancelled, lead back to the exchange; consent link dead', async () => {
    const A = 401, B = 402, C = 403;
    await onboard(A, 'Тест А', ['design'], ['kyiv'], ['30_80']);
    await onboard(B, 'Тест Б', ['renovation'], ['kyiv'], ['30_80']);
    await onboard(C, 'Тест В', ['renovation'], ['kyiv'], ['30_80']);
    const lead = await giveLead(A);
    await take(B, lead.id);
    const deal = q('SELECT * FROM deals WHERE lead_id = ?', lead.id);
    const s = await runCron(env, new Date(Date.now() + 73 * 3600_000));
    expect(s.consent_timeout).toBe(1);
    expect(q('SELECT status, active FROM deals WHERE id = ?', deal.id)).toEqual({ status: 'cancelled', active: 0 });
    expect(q('SELECT status FROM leads WHERE id = ?', lead.id).status).toBe('open');
    const fd = new FormData(); fd.set('action', 'agree');
    await worker.fetch(new Request(`https://leadmist.test/c/${deal.consent_token}`, { method: 'POST', body: fd }), env, ectx);
    expect(to(B).some((s) => s.text?.includes('067 000 00 01'))).toBe(false); // розкриття не відбулось
    // B більше не може взяти той самий лід, C — може
    await press(B, `tk:${lead.id}`);
    expect(last(B)).toContain('недоступний');
    await take(C, lead.id);
    expect(q('SELECT COUNT(*) AS n FROM deals WHERE lead_id = ? AND active = 1', lead.id).n).toBe(1);
  });

  it('client declines → lead closed, nothing revealed; manual consent path reveals', async () => {
    const A = 501, B = 502;
    await onboard(A, 'Тест А', ['design'], ['kyiv'], ['30_80']);
    await onboard(B, 'Тест Б', ['renovation'], ['kyiv'], ['30_80']);
    const l1 = await giveLead(A);
    await take(B, l1.id);
    const d1 = q('SELECT * FROM deals WHERE lead_id = ?', l1.id);
    const fd = new FormData(); fd.set('action', 'decline');
    await worker.fetch(new Request(`https://leadmist.test/c/${d1.consent_token}`, { method: 'POST', body: fd }), env, ectx);
    expect(q('SELECT status FROM deals WHERE id = ?', d1.id).status).toBe('client_declined');
    expect(q('SELECT status FROM leads WHERE id = ?', l1.id).status).toBe('closed');

    const l2 = await giveLead(A, 'Косметичний ремонт двокімнатної', 'Тест, fake.client@example.com');
    await take(B, l2.id);
    const d2 = q('SELECT * FROM deals WHERE lead_id = ?', l2.id);
    await press(B, `mc:${d2.id}`); // не рекомендувач — відмова
    expect(q('SELECT status FROM deals WHERE id = ?', d2.id).status).toBe('reserved');
    await press(A, `mc:${d2.id}`);
    expect(q('SELECT status FROM deals WHERE id = ?', d2.id).status).toBe('revealed');
    expect(q('SELECT method FROM client_consents WHERE deal_id = ?', d2.id).method).toBe('manual');
    expect(to(B).some((s) => s.text?.includes('fake.client@example.com'))).toBe(true);
  });

  it('flags a duplicate client', async () => {
    const A = 601;
    await onboard(A, 'Тест А', ['design'], ['kyiv'], ['30_80']);
    await giveLead(A, 'Перший запит', 'Тест, 067 000 00 09');
    const l2 = await giveLead(A, 'Другий запит', '+38 (067) 000-00-09');
    expect(l2.duplicate_of).toBeTruthy();
    expect(to(900).some((s) => s.text?.includes('збігається'))).toBe(true);
  });
});
