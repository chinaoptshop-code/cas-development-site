// Профіль і реквізити клієнта (кабінет v2).
// GET   /api/account/profile → {client, settings, addresses, partner}
// PATCH /api/account/profile {name?, phone?, client_type?, company_name?, company_code?, docs_email?, lang?, notify_tg?}
//        — часткове оновлення (автозбереження поля), з валідацією.
import { normalizePhone, publicClient } from '../../_lib.js';
import { body, client, json, bad, noTable, notReady, txt } from '../../_account.js';

const TYPES = ['private', 'fop', 'tov', 'eu'];
const LANGS = ['uk', 'ru', 'en'];
const DEF = { client_type: 'private', company_name: null, company_code: null, docs_email: null, lang: 'uk', notify_tg: 1 };

async function load(env, c) {
  let settings = { ...DEF }, addresses = [], partner = null, pending = false;
  try {
    const s = await env.DB.prepare('SELECT client_type, company_name, company_code, docs_email, lang, notify_tg FROM client_settings WHERE client_id = ?').bind(c.id).first();
    if (s) settings = s;
    addresses = (await env.DB.prepare('SELECT id, kind, label, city, branch, address, recipient, phone, is_default FROM addresses WHERE client_id = ? ORDER BY is_default DESC, id LIMIT 20').bind(c.id).all()).results;
    partner = await env.DB.prepare('SELECT code, discount, uses FROM partner_codes WHERE client_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1').bind(c.id).first();
  } catch (e) { if (!noTable(e)) throw e; pending = true; }
  return { client: publicClient(c, env), created_at: c.created_at, settings, addresses, partner, pending };
}

export async function onRequestGet({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  return json(await load(env, c));
}

export async function onRequestPatch({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 8 * 1024);
  if (e1) return e1;
  const has = k => Object.prototype.hasOwnProperty.call(d, k);

  // поля clients
  const upd = {};
  if (has('name')) {
    const n = txt(d.name, 120);
    if (!n) return bad('Вкажіть імʼя', 422);
    upd.name = n;
  }
  if (has('phone')) {
    const raw = String(d.phone || '').trim();
    if (!raw) upd.phone = null;
    else {
      const p = normalizePhone(raw);
      if (!p || !/^\+380\d{9}$/.test(p)) return bad('Телефон у форматі 0XX XXX XX XX або +380XXXXXXXXX', 422);
      upd.phone = p;
    }
  }

  // налаштування й реквізити
  let cur;
  try { cur = await env.DB.prepare('SELECT * FROM client_settings WHERE client_id = ?').bind(c.id).first(); }
  catch (e) { if (!noTable(e)) throw e; cur = undefined; }
  const s = { ...DEF, ...(cur || {}) };
  let sChanged = false;
  const set = (k, v) => { s[k] = v; sChanged = true; };
  if (has('client_type')) { if (!TYPES.includes(d.client_type)) return bad('Невідомий тип клієнта', 422); set('client_type', d.client_type); }
  if (has('company_name')) set('company_name', txt(d.company_name, 200));
  if (has('company_code')) {
    const v = String(d.company_code || '').replace(/\s/g, '');
    if (v && !/^\d{8}$|^\d{10}$/.test(v) && s.client_type !== 'eu') return bad('ЄДРПОУ — 8 цифр, ІПН — 10 цифр', 422);
    if (v.length > 20) return bad('Код задовгий', 422);
    set('company_code', v || null);
  }
  if (has('docs_email')) {
    const v = String(d.docs_email || '').trim().toLowerCase();
    if (v && (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))) return bad('Перевірте email', 422);
    set('docs_email', v || null);
  }
  if (has('lang')) { if (!LANGS.includes(d.lang)) return bad('Невідома мова', 422); set('lang', d.lang); }
  if (has('notify_tg')) set('notify_tg', d.notify_tg ? 1 : 0);
  // перевірка коду відносно типу: ТОВ — ЄДРПОУ (8), ФОП — ІПН (10)
  if (sChanged && s.company_code && s.client_type === 'tov' && !/^\d{8}$/.test(s.company_code)) return bad('Для ТОВ — ЄДРПОУ з 8 цифр', 422);
  if (sChanged && s.company_code && s.client_type === 'fop' && !/^\d{10}$/.test(s.company_code)) return bad('Для ФОП — ІПН з 10 цифр', 422);

  if (sChanged) {
    if (cur === undefined) return notReady();
    await env.DB.prepare(`INSERT INTO client_settings (client_id, client_type, company_name, company_code, docs_email, lang, notify_tg, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(client_id) DO UPDATE SET client_type = excluded.client_type, company_name = excluded.company_name,
          company_code = excluded.company_code, docs_email = excluded.docs_email, lang = excluded.lang, notify_tg = excluded.notify_tg,
          updated_at = excluded.updated_at`)
      .bind(c.id, s.client_type, s.company_name, s.company_code, s.docs_email, s.lang, s.notify_tg).run();
    // clients.company — короткий рядок для менеджера й форми замовлення (як у v1)
    const typ = { fop: 'ФОП', tov: 'ТОВ', eu: 'Компанія з ЄС' }[s.client_type];
    upd.company = typ ? [typ, s.company_name, s.company_code].filter(Boolean).join(' ').slice(0, 200) : null;
  }
  const keys = Object.keys(upd);
  if (keys.length) {
    await env.DB.prepare(`UPDATE clients SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map(k => upd[k]), c.id).run();
  }
  const n = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(c.id).first();
  return json(await load(env, n));
}
