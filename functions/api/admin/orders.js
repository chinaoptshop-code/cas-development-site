// Облік замовлень для менеджера: GET — список (фільтр status, q); PATCH — статус, нотатка, ціна позицій «за запитом».
import { STATUSES, bad, currentClient, isAdmin, json, readJSON, str } from '../../_lib.js';

async function admin(request, env) {
  const c = await currentClient(request, env);
  return isAdmin(env, c) ? c : null;
}

export async function onRequestGet({ request, env }) {
  if (!await admin(request, env)) return bad('Немає доступу', 403);
  const u = new URL(request.url);
  const st = u.searchParams.get('status'), q = (u.searchParams.get('q') || '').trim();
  let sql = `SELECT o.*, c.provider, c.username, c.email AS client_email FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE 1=1`;
  const args = [];
  if (st && STATUSES[st]) { sql += ' AND o.status = ?'; args.push(st); }
  if (q) { sql += ' AND (o.number LIKE ? OR o.phone LIKE ? OR o.name LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY o.id DESC LIMIT 300';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ statuses: STATUSES, orders: results.map(o => ({ ...o, items: JSON.parse(o.items) })) });
}

export async function onRequestPatch({ request, env }) {
  const a = await admin(request, env);
  if (!a) return bad('Немає доступу', 403);
  let d;
  try { d = await readJSON(request); } catch { return bad('Некоректні дані'); }
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(Number(d.id)).first();
  if (!o) return bad('Замовлення не знайдено', 404);
  const status = d.status && STATUSES[d.status] ? d.status : o.status;
  let items = JSON.parse(o.items), total = o.total;
  if (Array.isArray(d.prices)) { // менеджер проставляє ціну позиціям «за запитом»: [{index, price}]
    for (const p of d.prices) if (items[p.index] && Number(p.price) >= 0) items[p.index].price = Math.round(Number(p.price));
    total = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  }
  const onReq = items.filter(i => i.price == null).length;
  await env.DB.prepare(`UPDATE orders SET status = ?, manager_note = ?, items = ?, total = ?, on_request = ?, paid = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, str(d.manager_note, 2000) ?? o.manager_note, JSON.stringify(items), total, onReq, status === 'paid' ? 1 : o.paid, o.id).run();
  if (status !== o.status || d.note) await env.DB.prepare('INSERT INTO order_events (order_id, status, note, author) VALUES (?, ?, ?, ?)')
    .bind(o.id, status, str(d.note, 1000), a.name || a.email || `#${a.id}`).run();
  return json({ ok: true });
}
