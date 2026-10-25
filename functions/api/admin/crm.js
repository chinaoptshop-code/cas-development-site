// CRM для менеджера: замовлення Оздоби й заявки (orders.kind = order | lead) в одній воронці.
// GET  ?kind=&status=&q=&assignee=&due=1&format=csv — список (CSV — експорт для Excel / Google Таблиць)
// GET  ?events=<id> — історія статусів
// POST {name, phone, email, service, source, comment, amount, currency, assignee, next_contact} — нова заявка вручну
// PATCH {id, status, assignee, crm_note, manager_note, amount, currency, next_contact, note}
import { STATUSES, bad, json, nextLeadNumber, readJSON, requireAdmin, statusLabel, str } from '../../_lib.js';

const CUR = ['UAH', 'USD', 'EUR'];
const date = v => (v == null || v === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined);
const int = v => (v == null || v === '' ? null : Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : undefined);
const who = a => a.name || a.email || `#${a.id}`;

function csv(rows) {
  const cols = [['number', 'Номер'], ['kind', 'Тип'], ['created_at', 'Створено'], ['status', 'Статус'], ['name', 'Клієнт'], ['phone', 'Телефон'],
    ['email', 'Email'], ['service', 'Послуга / товари'], ['amount', 'Сума'], ['currency', 'Валюта'], ['assignee', 'Відповідальний'],
    ['next_contact', 'Наступний контакт'], ['source', 'Джерело'], ['crm_note', 'Нотатки'], ['comment', 'Коментар клієнта'], ['payment', 'Оплата'], ['delivery', 'Доставка']];
  const cell = v => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
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
  let sql = 'SELECT o.*, c.username, c.provider FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE 1=1';
  const args = [];
  if (p('kind') === 'order' || p('kind') === 'lead') { sql += ' AND o.kind = ?'; args.push(p('kind')); }
  if (p('status') && STATUSES[p('status')]) { sql += ' AND o.status = ?'; args.push(p('status')); }
  if (p('status') === 'open') sql += " AND o.status NOT IN ('delivered', 'cancelled')";
  if (p('assignee')) { sql += ' AND o.assignee = ?'; args.push(p('assignee')); }
  if (p('due') === '1') sql += " AND o.next_contact IS NOT NULL AND o.next_contact <= date('now') AND o.status NOT IN ('delivered', 'cancelled')";
  if (p('q')) {
    sql += ' AND (o.number LIKE ? OR o.phone LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR o.service LIKE ? OR o.crm_note LIKE ? OR o.comment LIKE ?)';
    for (let i = 0; i < 7; i++) args.push(`%${p('q')}%`);
  }
  sql += ' ORDER BY o.id DESC LIMIT 1000';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const rows = results.map(o => ({ ...o, items: JSON.parse(o.items || '[]') }));
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
  return json({ ok: true });
}
