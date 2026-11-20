// «Контакти» (колишні «Партнери») і бот пошуку заявок (migrations/0013_partners.sql, 0015_contacts.sql): один довідник клієнтів, підрядників,
// партнерів, постачальників, ріелторів, бригад і майстрів; звʼязки з обʼєктами й заявками — contact_links.
// Було: «Партнери» і бот пошуку заявок (migrations/0013_partners.sql). Спільне для бота (/api/bot/*) і адмінки (/api/admin/partners):
// перевірка й обрізання полів (HTML не приймаємо), нормалізація контактів, дедуплікація й upsert, CSV.
// Зберігаємо лише публічні контакти: Telegram @username, телефон, сайт. Опис для власника — tools/admin/README.md, «Партнери і бот пошуку».
import { dict, normalizePhone } from './_lib.js';

export const PARTNER_TYPES = dict({
  client: 'Клієнт', contractor: 'Підрядник', partner: 'Партнер', supplier: 'Постачальник', realtor: 'Ріелтор', crew: 'Бригада', master: 'Майстер',
  builder: 'Будівельна компанія', designer: 'Дизайнер / архітектор', other: 'Інше',
});
// бот пошуку зберігає лише «не клієнтів» — тип client йому заборонено
export const BOT_TYPES = Object.keys(PARTNER_TYPES).filter(k => k !== 'client');
export const PARTNER_STATUSES = dict({ new: 'Новий', interesting: 'Цікавий', working: 'Співпрацюємо', rejected: 'Не цікавий' });

// Помилка перевірки: обробник повертає 400 з цим текстом
export class Invalid extends Error {}

// HTML / розмітку не приймаємо: «<тег», «</», «<!», «<?» і HTML-сутності «&#…;» / «&lt;» → 400 (не тихе вирізання — бот має знати)
const HTML_RE = /<\s*[a-z!\/?]|&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/i;
// Текст: рядок/число, без керівних символів (крім \n у довгих полях), обрізаний до n символів; порожнє → null
export function text(v, n, field, multiline = false) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' && typeof v !== 'number') throw new Invalid(`${field}: очікуємо текст`);
  let s = String(v).replace(multiline ? /[\x00-\x09\x0b-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (HTML_RE.test(s)) throw new Invalid(`${field}: HTML не приймаємо`);
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  return s.slice(0, n) || null;
}
// Telegram @username: 5–32 символи, латиниця, цифри, «_», з літери; зберігаємо без «@», у нижньому регістрі.
// Також приймаємо https://t.me/<username>.
export function tgUser(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\//i, '').replace(/^@/, '');
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s)) throw new Invalid('tg: очікуємо @username (5–32 символи: латиниця, цифри, _)');
  return s.toLowerCase();
}
export function emailOf(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s.length > 200 || !/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[a-z]{2,}$/.test(s)) throw new Invalid('email: некоректна адреса');
  return s;
}
export function phoneOf(v) {
  if (v == null || v === '') return null;
  const p = normalizePhone(v);
  if (!p) throw new Invalid('phone: некоректний номер');
  return p;
}
// Посилання: лише http(s), без логіна/пароля в адресі, ≤ n символів
export function url(v, n, field) {
  if (v == null || v === '') return null;
  let u;
  try { u = new URL(String(v).trim()); } catch { throw new Invalid(`${field}: некоректне посилання`); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes('.')) throw new Invalid(`${field}: лише http(s)-посилання`);
  const s = u.href;
  if (s.length > n) throw new Invalid(`${field}: задовге посилання (макс. ${n})`);
  if (/[<>"'`\s]/.test(s)) throw new Invalid(`${field}: некоректне посилання`);
  return s;
}
export const siteKey = s => (s ? new URL(s).hostname.toLowerCase().replace(/^www\./, '') : null);
// Компанія для дедуплікації: нижній регістр, без лапок, організаційно-правових форм і розділових знаків
export const companyKey = s => {
  if (!s) return null;
  const k = String(s).toLowerCase().replace(/[«»"'„“”`’]/g, ' ')
    .replace(/(^|[\s,.])(тов|фоп|пп|ат|прат|ooo|ооо|ип|llc|ltd|inc|gmbh|sp\.?\s?z\s?o\.?o\.?)(?=$|[\s,.])/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return k.length >= 3 ? k.slice(0, 120) : null;
};
export function tags(v) {
  if (v == null || v === '') return [];
  const list = Array.isArray(v) ? v : String(v).split(',');
  if (list.length > 50) throw new Invalid('tags: забагато (макс. 20)');
  const out = [];
  for (const t of list) { const s = text(t, 40, 'tags'); if (s && !out.includes(s.toLowerCase())) out.push(s.toLowerCase()); }
  return out.slice(0, 20);
}
const parseList = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

// Поля партнера з тіла запиту (бот або адмінка). Хоча б одне: імʼя, компанія або контакт.
export function partnerInput(d, { bot = false } = {}) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Invalid('Очікуємо JSON-обʼєкт');
  const c = d.contacts && typeof d.contacts === 'object' ? d.contacts : {};
  const type = d.type == null || d.type === '' ? 'other' : String(d.type);
  const allowed = bot ? BOT_TYPES : Object.keys(PARTNER_TYPES);
  if (!allowed.includes(type)) throw new Invalid('type: ' + allowed.join(' | '));
  const p = {
    name: text(d.name, 120, 'name'), company: text(d.company, 160, 'company'), type, city: text(d.city, 120, 'city'),
    tg: tgUser(d.tg ?? c.tg ?? d.username), phone: phoneOf(d.phone ?? c.phone), site: url(d.site ?? c.site, 200, 'site'), email: emailOf(d.email ?? c.email),
    source_name: text(d.source_name ?? (d.source && d.source.name), 160, 'source_name'),
    source_url: url(d.source_url ?? (d.source && d.source.url), 300, 'source_url'),
    tags: tags(d.tags),
  };
  if (!p.name && !p.company && !p.tg && !p.phone && !p.site && !p.email) throw new Invalid('Потрібне імʼя, компанія або контакт (tg, phone, site, email)');
  p.company_key = companyKey(p.company);
  p.site_key = siteKey(p.site);
  return p;
}

// Той самий контакт: збіг Telegram, телефону, пошти, домену сайту або назви компанії (перший за id). Пошта — з міграції 0015:
// до неї колонки немає, тож її в умову не додаємо (hasEmail перевіряє один раз на запит).
export async function findPartner(env, p, exceptId = 0) {
  const conds = [], args = [];
  const em = p.email && await hasEmail(env) ? p.email : null;
  for (const [col, v] of [['tg', p.tg], ['phone', p.phone], ['email', em], ['site_key', p.site_key], ['company_key', p.company_key]]) if (v) { conds.push(`${col} = ?`); args.push(v); }
  if (!conds.length) return null;
  return env.DB.prepare(`SELECT * FROM partners WHERE (${conds.join(' OR ')}) AND id != ? ORDER BY id LIMIT 1`).bind(...args, exceptId).first();
}

const EMAIL_COL = new WeakMap();
export async function hasEmail(env) {
  if (!EMAIL_COL.has(env)) {
    try { await env.DB.prepare('SELECT email FROM partners LIMIT 1').first(); EMAIL_COL.set(env, true); } catch { EMAIL_COL.set(env, false); }
  }
  return EMAIL_COL.get(env);
}

// Колонка partners.archived_at (migrations/0018): архів замість видалення. Кешуємо лише «так» — після міграції вмикається без перезапуску.
const ARCH_COL = new WeakMap();
export async function hasArchive(env) {
  if (ARCH_COL.get(env)) return true;
  try { await env.DB.prepare('SELECT archived_at FROM partners LIMIT 1').first(); ARCH_COL.set(env, true); return true; } catch { return false; }
}
// Тип / статус з імпорту: ключ («supplier») або підпис українською («Постачальник», будь-який регістр); невідоме → null
const byLabel = dictn => v => {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (dictn[s]) return s;
  return Object.keys(dictn).find(k => dictn[k].toLowerCase() === s) || null;
};
// множина й короткі назви з таблиць Excel; dict() — щоб «constructor» / «__proto__» з файлу не знаходились у прототипі
const TYPE_ALIASES = dict({ клієнти: 'client', підрядники: 'contractor', партнери: 'partner', постачальники: 'supplier', ріелтори: 'realtor', бригади: 'crew', майстри: 'master', дизайнер: 'designer', архітектор: 'designer' });
export const typeKey = v => byLabel(PARTNER_TYPES)(v) || TYPE_ALIASES[String(v ?? '').trim().toLowerCase()] || null;
export const statusKey = v => byLabel(PARTNER_STATUSES)(v);
// Без права «Телефон, пошта й адреса клієнта» (clients.contacts) контактні поля не віддаються ні в таблиці, ні в CSV
const CONTACT_FIELDS = ['phone', 'tg', 'email'];
export const hideContacts = r => { const o = { ...r }; for (const k of CONTACT_FIELDS) if (k in o) o[k] = null; return o; };

// Upsert з бота: новий → вставка; існуючий → дописуємо порожні поля, теги й джерело, last_seen = зараз, times_seen + 1.
// Статус і нотатки — справа менеджера, бот їх не змінює; тип замінюємо лише якщо був «Інше».
export async function upsertPartner(env, p) {
  const src = p.source_name || p.source_url ? [{ name: p.source_name, url: p.source_url, at: new Date().toISOString().slice(0, 19).replace('T', ' ') }] : [];
  const old = await findPartner(env, p);
  if (!old) {
    const r = await env.DB.prepare(`INSERT INTO partners (name, company, type, city, tg, phone, site, source_name, source_url, sources, tags, company_key, site_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, p.source_name, p.source_url, JSON.stringify(src), JSON.stringify(p.tags), p.company_key, p.site_key).run();
    if (p.email && await hasEmail(env)) await env.DB.prepare('UPDATE partners SET email = ? WHERE id = ?').bind(p.email, r.meta.last_row_id).run();
    return { id: r.meta.last_row_id, created: true, times_seen: 1 };
  }
  const keep = (k) => old[k] ?? p[k] ?? null;
  const tg = await free(env, 'tg', old.tg, p.tg, old.id), phone = await free(env, 'phone', old.phone, p.phone, old.id);
  const site = old.site || (p.site && !(await findPartner(env, { site_key: p.site_key }, old.id)) ? p.site : null) || null;
  const company = old.company || p.company || null;
  if (p.email && !old.email && await hasEmail(env) && !(await env.DB.prepare('SELECT 1 FROM partners WHERE email = ? AND id != ?').bind(p.email, old.id).first()))
    await env.DB.prepare('UPDATE partners SET email = ? WHERE id = ?').bind(p.email, old.id).run();
  const tagList = [...new Set([...parseList(old.tags), ...p.tags])].slice(0, 20);
  const sources = [...src, ...parseList(old.sources)].slice(0, 20);
  await env.DB.prepare(`UPDATE partners SET name = ?, company = ?, type = ?, city = ?, tg = ?, phone = ?, site = ?, source_name = COALESCE(?, source_name),
      source_url = COALESCE(?, source_url), sources = ?, tags = ?, company_key = ?, site_key = ?, last_seen = datetime('now'), times_seen = times_seen + 1,
      updated_at = datetime('now') WHERE id = ?`)
    .bind(keep('name'), company, old.type === 'other' ? p.type : old.type, keep('city'), tg, phone, site, p.source_name, p.source_url,
      JSON.stringify(sources), JSON.stringify(tagList), companyKey(company), siteKey(site), old.id).run();
  return { id: old.id, created: false, times_seen: old.times_seen + 1 };
}
// контакт дописуємо, лише якщо в цього партнера його ще немає і він не належить іншому партнеру
async function free(env, col, cur, v, id) {
  if (cur || !v) return cur || null;
  return (await env.DB.prepare(`SELECT 1 FROM partners WHERE ${col} = ? AND id != ?`).bind(v, id).first()) ? null : v;
}

export const shapePartner = r => ({ ...r, tags: parseList(r.tags), sources: parseList(r.sources), company_key: undefined, site_key: undefined,
  type_label: PARTNER_TYPES[r.type] || r.type, status_label: PARTNER_STATUSES[r.status] || r.status });

// CSV (Excel, «;»): захист від CSV-інʼєкції — як у CRM
export function partnersCsv(rows) {
  const cols = [['id', 'ID'], ['name', 'Імʼя'], ['company', 'Компанія'], ['type', 'Тип'], ['city', 'Місто / область'], ['tg', 'Telegram'], ['phone', 'Телефон'],
    ['site', 'Сайт'], ['source_name', 'Джерело'], ['source_url', 'Посилання на повідомлення'], ['first_seen', 'Вперше'], ['last_seen', 'Востаннє'],
    ['times_seen', 'Разів'], ['tags', 'Теги'], ['status', 'Статус'], ['email', 'Email'], ['rating', 'Оцінка'], ['notes', 'Нотатки'], ['archived_at', 'В архіві з']];
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.map(c => c[1]).join(';')];
  for (const r of rows) lines.push(cols.map(([k]) => cell(k === 'type' ? PARTNER_TYPES[r.type] || r.type : k === 'status' ? PARTNER_STATUSES[r.status] || r.status
    : k === 'tg' ? (r.tg ? '@' + r.tg : '') : k === 'tags' ? parseList(r.tags).join(', ') : r[k])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Контакти, привʼязані до обʼєктів (contact_links, 0015): {project_id: [{link_id, role, note, contact}]}. Хто бачить: partners.base — усе;
// contacts.linked — ті самі обʼєкти, що й так видно працівнику (ids уже відфільтровані projectScope), без оцінки й нотаток менеджера;
// без clients.contacts — без телефону, пошти й Telegram. Клієнтам не віддається. До міграції 0015 — {}.
export async function projectContacts(env, x, ids) {
  if (!ids.length || !(x.can('partners.base') || x.can('contacts.linked'))) return {};
  let rows = [];
  try {
    rows = (await env.DB.prepare(`SELECT l.id AS link_id, l.project_id, l.role, l.note AS link_note, c.* FROM contact_links l JOIN partners c ON c.id = l.contact_id
        WHERE l.project_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.id LIMIT 1000`).bind(...ids).all()).results;
  } catch (e) { if (/no such table|no such column/i.test(String(e && e.message))) return {}; throw e; }
  const full = x.can('partners.base'), cts = x.can('clients.contacts');
  const out = {};
  for (const r of rows) {
    const c = { id: r.id, name: r.name, company: r.company, type: r.type, type_label: PARTNER_TYPES[r.type] || r.type, city: r.city,
      tags: parseList(r.tags), ...(cts ? { phone: r.phone, tg: r.tg, email: r.email ?? null, site: r.site } : {}), ...(full ? { rating: r.rating ?? null, status: r.status } : {}) };
    (out[r.project_id] = out[r.project_id] || []).push({ link_id: r.link_id, role: r.role, note: r.link_note, contact: c });
  }
  return out;
}

// Заявка → проєкт: клієнт заявки в довіднику (тип «Клієнт», той самий запис за телефоном/Telegram/поштою) + звʼязки з обʼєктом і заявкою.
// До міграції 0015 — нічого (null). Некоректні дані заявки (напр. старий формат телефону) — пропускаємо поле, а не конверсію.
export async function leadContact(env, o, clientId, projectId, staffId) {
  if (!await hasEmail(env)) return null;
  const pick = (f, v) => { try { return f(v); } catch (e) { if (e instanceof Invalid) return null; throw e; } };
  const p = { name: pick(v => text(v, 120, 'name'), o.name), company: null, type: 'client', city: pick(v => text(v, 120, 'city'), o.city),
    tg: pick(tgUser, o.contact_tg), phone: pick(phoneOf, o.phone), site: null, email: pick(emailOf, o.email), tags: [], company_key: null, site_key: null };
  if (!p.name && !p.tg && !p.phone && !p.email) return null;
  let c = await findPartner(env, p), id;
  if (c) {
    id = c.id;
    await env.DB.prepare("UPDATE partners SET type = CASE WHEN type = 'other' THEN 'client' ELSE type END, client_id = COALESCE(client_id, ?), updated_at = datetime('now') WHERE id = ?").bind(clientId, id).run();
  } else {
    id = (await env.DB.prepare(`INSERT INTO partners (name, type, city, tg, phone, email, client_id, source_name, sources, tags, status)
        VALUES (?, 'client', ?, ?, ?, ?, ?, ?, '[]', '[]', 'working')`).bind(p.name, p.city, p.tg, p.phone, p.email, clientId, 'заявка ' + o.number).run()).meta.last_row_id;
  }
  for (const [col, ref] of [['project_id', projectId], ['order_id', o.id]])
    if (ref && !await env.DB.prepare(`SELECT 1 FROM contact_links WHERE contact_id = ? AND ${col} = ?`).bind(id, ref).first())
      await env.DB.prepare(`INSERT INTO contact_links (contact_id, ${col}, role, created_by) VALUES (?, ?, 'Клієнт', ?)`).bind(id, ref, staffId).run();
  return id;
}
