// Облік замовлень Оздоби: GET — список (orders.view; фільтр status, q); PATCH — статус, нотатка (orders.edit),
// ціна позицій «за запитом» (finance.edit). Поля — shapeOrder (functions/_roles.js), зміни — в audit_log.
import { ORDER_STATUSES, bad, json, readJSON, str } from '../../_lib.js';
import { audit, need, shapeOrder } from '../../_roles.js';

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, 'orders.view');
  if (error) return error;
  const u = new URL(request.url);
  const st = u.searchParams.get('status'), q = (u.searchParams.get('q') || '').trim();
  let sql = `SELECT o.*, c.provider, c.username, c.email AS client_email FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE o.kind != 'lead'`;
  const args = [];
  if (st && ORDER_STATUSES[st]) { sql += ' AND o.status = ?'; args.push(st); }
  if (q) { sql += ' AND (o.number LIKE ? OR o.name LIKE ?' + (x.can('clients.contacts') ? ' OR o.phone LIKE ?' : '') + ')'; args.push(`%${q}%`, `%${q}%`); if (x.can('clients.contacts')) args.push(`%${q}%`); }
  sql += ' ORDER BY o.id DESC LIMIT 300';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ statuses: ORDER_STATUSES, orders: results.map(o => shapeOrder({ ...o, items: JSON.parse(o.items) }, x)).map(o => (x.can('clients.contacts') ? o : { ...o, client_email: undefined })) });
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, 'orders.edit');
  if (error) return error;
  let d;
  try { d = await readJSON(request); } catch { return bad('Некоректні дані'); }
  const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND kind != 'lead'").bind(Number(d.id)).first();
  if (!o) return bad('Замовлення не знайдено', 404);
  if (Array.isArray(d.prices) && d.prices.length && !x.can('finance.edit')) return bad('Немає права змінювати ціни', 403);
  const status = d.status && ORDER_STATUSES[d.status] ? d.status : o.status;
  let items = JSON.parse(o.items), total = o.total, discount = o.discount || 0;
  if (Array.isArray(d.prices)) { // менеджер проставляє ціну позиціям «за запитом»: [{index, price}]
    const sum = () => items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
    const ship = Math.max(0, (o.total || 0) - (sum() - discount)); // доставка, порахована при оформленні
    for (const p of d.prices) if (items[p.index] && Number(p.price) >= 0) items[p.index].price = Math.round(Number(p.price));
    discount = Math.round(sum() * (o.discount_pct || 0) / 100); // відсоток знижки замовлення лишається тим самим
    total = sum() - discount + ship;
  }
  const onReq = items.filter(i => i.price == null).length;
  const note = str(d.manager_note, 2000) ?? o.manager_note;
  await env.DB.prepare(`UPDATE orders SET status = ?, manager_note = ?, items = ?, total = ?, discount = ?, on_request = ?, paid = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, note, JSON.stringify(items), total, discount, onReq, status === 'paid' ? 1 : o.paid, o.id).run();
  if (status !== o.status || d.note) await env.DB.prepare('INSERT INTO order_events (order_id, status, note, author) VALUES (?, ?, ?, ?)')
    .bind(o.id, status, str(d.note, 1000), x.name).run();
  await audit(env, request, x, 'order.update', 'orders', o.id, { status: o.status, total: o.total, manager_note: o.manager_note }, { status, total, manager_note: note });
  return json({ ok: true });
}
