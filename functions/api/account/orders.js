// Замовлення клієнта для кабінету v2: етап (stage) з orders.status, історія статусів з order_events (лише статус і дата — внутрішні нотатки не віддаємо).
// GET /api/account/orders            — список (без заявок kind = 'lead')
// GET /api/account/orders?number=X   — одне замовлення з історією
import { STAGES, client, json, bad, stageLabel, stageOf } from '../../_account.js';

const shape = o => {
  let items = [];
  try { items = JSON.parse(o.items) || []; } catch { /* пошкоджений JSON — порожній список */ }
  const stage = stageOf(o.status);
  return {
    id: o.id, number: o.number, created_at: o.created_at, updated_at: o.updated_at, items,
    total: o.total, discount: o.discount || 0, discount_pct: o.discount_pct || 0, on_request: o.on_request,
    delivery: o.delivery, payment: o.payment, company: o.company, comment: o.comment, promo: o.promo,
    manager_note: o.manager_note, paid: o.paid, stage, stage_label: stageLabel(stage),
  };
};

export async function onRequestGet({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const number = new URL(request.url).searchParams.get('number');
  if (number) {
    const o = await env.DB.prepare('SELECT * FROM orders WHERE client_id = ? AND number = ?').bind(c.id, String(number).slice(0, 40)).first();
    if (!o || o.kind === 'lead') return bad('Замовлення не знайдено', 404);
    const { results } = await env.DB.prepare('SELECT status, created_at FROM order_events WHERE order_id = ? ORDER BY id LIMIT 100').bind(o.id).all();
    const events = results.map(e => ({ stage: stageOf(e.status), created_at: e.created_at }));
    return json({ stages: STAGES, order: { ...shape(o), events } });
  }
  const { results } = await env.DB.prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY id DESC LIMIT 100').bind(c.id).all();
  return json({ stages: STAGES, orders: results.filter(o => o.kind !== 'lead').map(shape) });
}
