// CRM для менеджера: замовлення Оздоби й заявки (orders.kind = order | lead) в одній воронці.
// GET  ?kind=&status=&q=&assignee=&due=1&place=&from=&to=&format=csv — список (CSV — експорт для Excel / Google Таблиць)
//   place: form (основна форма сторінки, source без «#») | #prices | #portfolio | #project | #blog-mid | #services | … (місце
//   компактної форми — частина source після «#», assets/lead-form.v1.js) | manual (внесені вручну, дзвінки) | order (Оздоба);
//   from / to — дати YYYY-MM-DD за Києвом (включно)
// GET  ?stats=1&days=7|30 — дашборд: заявки за період по місцях форм (source після «#»), сторінках, днях, мовах;
//   «конверсія» — частка заявок, що дійшли до КП / оплати (воронка CRM), і час реакції
// GET  ?events=<id> — історія статусів
// POST {name, phone, email, service, source, comment, amount, currency, assignee, next_contact} — нова заявка вручну
// PATCH {id, status, assignee, crm_note, manager_note, amount, currency, next_contact, note}
//   перший перехід із «Нове» = «взяли в роботу»: taken_at, час реакції, сповіщення в Telegram оновлюються (functions/_alerts.js)
import { STATUSES, bad, json, nextLeadNumber, readJSON, requireAdmin, statusLabel, str } from '../../_lib.js';
import { SLA_MIN, kyiv, kyivMidnight, parseUtc, sqlTime, takeLead } from '../../_alerts.js';

const CUR = ['UAH', 'USD', 'EUR'];
const date = v => (v == null || v === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined);
const int = v => (v == null || v === '' ? null : Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : undefined);
const who = a => a.name || a.email || `#${a.id}`;
const SITE = "(o.source LIKE '%cas-develop.com%' OR o.source LIKE '%.pages.dev%')";
// місце форми: «#prices» … з source; основна форма сторінки — «form»; вручну / дзвінок — «manual»; Оздоба — «order»
export const placeOf = o => o.kind === 'order' ? 'order'
  : !/cas-develop\.com|\.pages\.dev/.test(o.source || '') ? 'manual' : (/#([\w-]+)$/.exec(o.source || '') || [, 'form'])[1].replace(/^(?!form$)/, '#');
// сторінка без домену, «#місця» і мовного кореня: cas-develop.com/remont-kvartyr-kyiv#prices → /remont-kvartyr-kyiv
export const pageOf = o => { const m = /(?:cas-develop\.com|\.pages\.dev)(\/[^#?\s]*)?/.exec(o.source || ''); return m ? (m[1] || '/') : null; };
const QUOTE = new Set(['quote_sent', 'paid', 'production', 'shipping', 'delivered']);
const PAID = new Set(['paid', 'production', 'shipping', 'delivered']);

function where(p, args) {
  let sql = '';
  if (p('kind') === 'order' || p('kind') === 'lead') { sql += ' AND o.kind = ?'; args.push(p('kind')); }
  const pl = p('place');
  if (pl === 'order') sql += " AND o.kind = 'order'";
  else if (pl === 'manual') sql += " AND o.kind = 'lead' AND COALESCE(o.source, '') NOT LIKE '%cas-develop.com%' AND COALESCE(o.source, '') NOT LIKE '%.pages.dev%'";
  else if (pl === 'form') sql += ` AND o.kind = 'lead' AND ${SITE} AND o.source NOT LIKE '%#%'`;
  else if (/^#[\w-]{1,40}$/.test(pl)) { sql += ' AND o.source LIKE ?'; args.push('%' + pl); }
  const from = date(p('from')), to = date(p('to'));
  if (from) { sql += ' AND o.created_at >= ?'; args.push(sqlTime(kyivMidnight(from))); }
  if (to) { sql += ' AND o.created_at < ?'; args.push(sqlTime(new Date(kyivMidnight(to).getTime() + 86400000))); }
  return sql;
}

async function stats(env, days) {
  const now = new Date(), start = kyivMidnight(kyiv(new Date(now - (days - 1) * 86400000)).date), prev = new Date(start - days * 86400000);
  const { results } = await env.DB.prepare('SELECT * FROM orders o WHERE o.created_at >= ? ORDER BY o.id DESC LIMIT 20000').bind(sqlTime(prev)).all();
  const cur = results.filter(o => parseUtc(o.created_at) >= start), before = results.length - cur.length;
  const group = (key, limit) => {
    const m = new Map();
    for (const o of cur) {
      const k = key(o); if (k == null) continue;
      const g = m.get(k) || { key: k, n: 0, leads: 0, taken: 0, quote: 0, paid: 0, cancelled: 0 };
      g.n++; if (o.kind === 'lead') g.leads++;
      if (o.taken_at || o.status !== 'new') g.taken++;
      if (QUOTE.has(o.status)) g.quote++;
      if (PAID.has(o.status)) g.paid++;
      if (o.status === 'cancelled') g.cancelled++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, limit || 50);
  };
  const days_ = [];
  for (let i = 0; i < days; i++) days_.push(kyiv(new Date(start.getTime() + i * 86400000 + 3 * 3600000)).date);
  const perDay = Object.fromEntries(days_.map(d => [d, 0]));
  for (const o of cur) { const d = kyiv(parseUtc(o.created_at)).date; if (d in perDay) perDay[d]++; }
  const r = cur.filter(o => o.reaction_min != null).map(o => o.reaction_min);
  return {
    days, from: days_[0], to: days_[days_.length - 1], total: cur.length, previous: before,
    leads: cur.filter(o => o.kind === 'lead').length, orders: cur.filter(o => o.kind === 'order').length,
    open_new: cur.filter(o => o.status === 'new').length,
    reaction: { n: r.length, avg: r.length ? Math.round(r.reduce((s, x) => s + x, 0) / r.length) : null,
      within: r.filter(x => x <= SLA_MIN).length, sla: SLA_MIN },
    funnel: group(() => 'all')[0] || null,
    by_place: group(placeOf), by_page: group(pageOf, 40), by_form: group(o => o.form || null, 20), by_lang: group(o => o.lang || null, 12),
    by_day: days_.map(d => ({ date: d, n: perDay[d] })),
  };
}

function csv(rows) {
  const cols = [['number', 'Номер'], ['kind', 'Тип'], ['created_at', 'Створено'], ['status', 'Статус'], ['name', 'Клієнт'], ['phone', 'Телефон'],
    ['email', 'Email'], ['service', 'Послуга / товари'], ['amount', 'Сума'], ['currency', 'Валюта'], ['assignee', 'Відповідальний'],
    ['next_contact', 'Наступний контакт'], ['reaction_min', 'Реакція, хв'], ['source', 'Джерело'], ['place', 'Місце форми'], ['form', 'Форма'], ['lang', 'Мова'], ['utm', 'UTM'], ['taken_at', 'Взято в роботу'], ['crm_note', 'Нотатки'], ['comment', 'Коментар клієнта'], ['payment', 'Оплата'], ['delivery', 'Доставка']];
  // CSV-інʼєкція: текст з публічної форми, що починається з = + - @ (або табуляції), Excel/Таблиці виконали б як формулу —
  // додаємо апостроф (числа на кшталт суми лишаються числами)
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.map(c => c[1]).join(';')];
  for (const r of rows) lines.push(cols.map(([k]) => cell(
    k === 'status' ? statusLabel(r.status) : k === 'kind' ? (r.kind === 'lead' ? 'Заявка' : 'Замовлення')
      : k === 'amount' ? (r.amount ?? r.total) : k === 'service' ? (r.service || (r.items || []).map(i => `${i.name} × ${i.qty}`).join(', ')) : r[k])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return bad('Немає доступу', 403);
  const u = new URL(request.url), p = k => (u.searchParams.get(k) || '').trim();
  if (p('events')) {
    const { results } = await env.DB.prepare('SELECT status, note, author, created_at FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 100').bind(+p('events')).all();
    return json({ events: results.map(e => ({ ...e, label: statusLabel(e.status) })) });
  }
  if (p('stats')) return json(await stats(env, p('days') === '30' ? 30 : p('days') === '90' ? 90 : 7));
  if ((p('from') && !date(p('from'))) || (p('to') && !date(p('to')))) return bad('Дата — РРРР-ММ-ДД');
  const args = [];
  let sql = 'SELECT o.*, c.username, c.provider FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE 1=1' + where(p, args);
  if (p('status') && STATUSES[p('status')]) { sql += ' AND o.status = ?'; args.push(p('status')); }
  if (p('status') === 'open') sql += " AND o.status NOT IN ('delivered', 'cancelled')";
  if (p('assignee')) { sql += ' AND o.assignee = ?'; args.push(p('assignee')); }
  if (p('due') === '1') sql += " AND o.next_contact IS NOT NULL AND o.next_contact <= date('now') AND o.status NOT IN ('delivered', 'cancelled')";
  if (p('q')) {
    sql += ' AND (o.number LIKE ? OR o.phone LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR o.service LIKE ? OR o.crm_note LIKE ? OR o.comment LIKE ? OR o.source LIKE ?)';
    for (let i = 0; i < 8; i++) args.push(`%${p('q')}%`);
  }
  sql += ' ORDER BY o.id DESC LIMIT 1000';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const rows = results.map(o => ({ ...o, items: JSON.parse(o.items || '[]'), place: placeOf(o), page: pageOf(o) }));
  if (p('format') === 'csv') return new Response(csv(rows), { headers: {
    'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="cas-crm-${new Date().toISOString().slice(0, 10)}.csv"`,
  } });
  const { results: as } = await env.DB.prepare("SELECT DISTINCT assignee FROM orders WHERE assignee IS NOT NULL AND assignee != '' ORDER BY assignee").all();
  return json({ statuses: STATUSES, rows, assignees: as.map(a => a.assignee) });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAdmin(request, env);
  if (!a) return bad('Немає доступу', 403);
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  const phone = String(d.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (!phone && !str(d.name) && !str(d.email)) return bad('Вкажіть хоча б імʼя, телефон або email');
  const amount = int(d.amount), next = date(d.next_contact);
  if (amount === undefined) return bad('Сума — число');
  if (next === undefined) return bad('Дата — РРРР-ММ-ДД');
  const number = await nextLeadNumber(env);
  const r = await env.DB.prepare(`INSERT INTO orders (number, kind, name, phone, email, items, service, source, comment, amount, currency, assignee, next_contact, status)
      VALUES (?, 'lead', ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, 'new')`)
    .bind(number, str(d.name, 120), phone || null, str(d.email, 200), str(d.service, 200), str(d.source, 200) || 'вручну',
      str(d.comment, 2000), amount, CUR.includes(d.currency) ? d.currency : 'UAH', str(d.assignee, 80), next).run();
  await env.DB.prepare("INSERT INTO order_events (order_id, status, note, author) VALUES (?, 'new', 'Створено вручну', ?)").bind(r.meta.last_row_id, who(a)).run();
  return json({ ok: true, id: r.meta.last_row_id, number });
}

export async function onRequestPatch({ request, env }) {
  const a = await requireAdmin(request, env);
  if (!a) return bad('Немає доступу', 403);
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(Number(d.id)).first();
  if (!o) return bad('Запис не знайдено', 404);
  const status = d.status == null ? o.status : STATUSES[d.status] ? d.status : null;
  if (!status) return bad('Невідомий статус');
  const amount = 'amount' in d ? int(d.amount) : o.amount, next = 'next_contact' in d ? date(d.next_contact) : o.next_contact;
  if (amount === undefined) return bad('Сума — число');
  if (next === undefined) return bad('Дата — РРРР-ММ-ДД');
  const pick = (k, n) => (k in d ? str(d[k], n) : o[k]);
  await env.DB.prepare(`UPDATE orders SET status = ?, assignee = ?, crm_note = ?, manager_note = ?, amount = ?, currency = ?, next_contact = ?,
      paid = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, pick('assignee', 80), pick('crm_note', 4000), pick('manager_note', 2000), amount,
      CUR.includes(d.currency) ? d.currency : o.currency || 'UAH', next, status === 'paid' ? 1 : o.paid, o.id).run();
  if (status !== o.status || str(d.note)) await env.DB.prepare('INSERT INTO order_events (order_id, status, note, author) VALUES (?, ?, ?, ?)')
    .bind(o.id, status, str(d.note, 1000), who(a)).run();
  if (!o.taken_at && o.status === 'new' && status !== 'new') await takeLead(env, o.id, pick('assignee', 80) || who(a), 'CRM');
  return json({ ok: true });
}
