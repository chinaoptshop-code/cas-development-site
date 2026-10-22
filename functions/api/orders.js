// Замовлення клієнта: GET — мої замовлення; POST — нове замовлення з кошика Оздоби.
// Ціни перераховуються на сервері з каталогу (/assets/ozdoba/catalog.json), щоб їх не можна було підмінити.
import { STATUSES, bad, currentClient, json, readJSON, str } from '../_lib.js';

const r10 = n => Math.round(n / 10) * 10;

function linePrice(cat, it, ci, si) {
  if (it.price == null) return null;
  const ss = it.ss ? cat.sizesets[it.ss] : null;
  const k = ss ? (ss[si] || ss.find(x => x[1] === 1) || ss[0])[1] : 1;
  const cs = cat.colorsets[it.cs][ci] || cat.colorsets[it.cs][0];
  return r10(it.price * k * (1 + cs[2]));
}

async function nextNumber(env) {
  const d = new Date();
  const pre = `OZD-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}-`;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE number LIKE ?').bind(pre + '%').first();
  return pre + String((row?.n || 0) + 1).padStart(4, '0');
}

export async function onRequestGet({ request, env }) {
  const c = await currentClient(request, env);
  if (!c) return bad('Потрібно увійти', 401);
  const { results } = await env.DB.prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY id DESC LIMIT 100').bind(c.id).all();
  return json({ orders: results.map(o => ({ ...o, items: JSON.parse(o.items), status_label: STATUSES[o.status] || o.status })) });
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await readJSON(request); } catch { return bad('Некоректні дані'); }
  const c = await currentClient(request, env);
  const phone = String(d.phone || c?.phone || '').replace(/[^\d+]/g, '');
  if (phone.replace(/\D/g, '').length < 9) return bad('Вкажіть телефон');
  if (!Array.isArray(d.cart) || !d.cart.length || d.cart.length > 200) return bad('Кошик порожній');

  const cat = await (await fetch(new URL('/assets/ozdoba/catalog.json', request.url))).json();
  const byId = new Map(cat.items.map(i => [i.id, i]));
  const items = [];
  for (const l of d.cart) {
    const it = byId.get(Number(l.id));
    const qty = Math.max(1, Math.min(10000, Number(l.qty) || 1));
    if (!it) continue;
    const ci = Number(l.ci) || 0, si = Number(l.si) || 0;
    const ss = it.ss ? cat.sizesets[it.ss] : null;
    items.push({ id: it.id, name: it.name, color: (cat.colorsets[it.cs][ci] || cat.colorsets[it.cs][0])[0],
      size: ss ? (ss[si] || ss[0])[0] : null, qty, unit: it.unit, price: linePrice(cat, it, ci, si) });
  }
  if (!items.length) return bad('Позицій не знайдено в каталозі');
  const PROMO = { 'ОЗДОБА10': 10, 'КОМПЛЕКТ': 8, 'ДИЗАЙНЕР': 15 };
  const promo = PROMO[String(d.promo || '').toUpperCase()] ? String(d.promo).toUpperCase() : null;
  const goods = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  const disc = promo ? Math.round(goods * PROMO[promo] / 100) : 0;
  const ship = goods - disc > 20000 || goods === 0 ? 0 : 450;
  const total = goods - disc + ship;
  const onReq = items.filter(i => i.price == null).length;
  const number = await nextNumber(env);
  const name = str(d.name, 120) || c?.name || null;
  const payment = ['card', 'parts', 'invoice', 'cod'].includes(d.payment) ? d.payment : 'card';

  const res = await env.DB.prepare(`INSERT INTO orders (number, client_id, name, phone, items, total, on_request, promo, delivery, payment, company, comment)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(number, c?.id || null, name, phone, JSON.stringify(items), total, onReq, promo, str(d.delivery, 200), payment, str(d.company, 200), str(d.comment, 1000)).run();
  await env.DB.prepare("INSERT INTO order_events (order_id, status, author) VALUES (?, 'new', 'client')").bind(res.meta.last_row_id).run();
  if (c) await env.DB.prepare('UPDATE clients SET phone = COALESCE(phone, ?), city = COALESCE(city, ?), company = COALESCE(company, ?) WHERE id = ?')
    .bind(phone, str(d.delivery, 200), str(d.company, 200), c.id).run();

  // сповіщення менеджеру тим самим каналом, що й заявки з сайту (n8n → Telegram)
  const money = n => n == null ? 'за запитом' : new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
  const message = [`Замовлення ${number} з Оздоби${c ? ` · клієнт #${c.id} (${c.provider})` : ''}`,
    ...items.map(i => `• ${i.name} — ${i.color}${i.size ? ', ' + i.size : ''} — ${i.qty} ${i.unit} × ${money(i.price)}`),
    promo ? `Промокод ${promo}: −${money(disc)}` : null, `Доставка: ${ship ? money(ship) : 'безкоштовно'}`,
    `РАЗОМ (орієнтовно): ${money(total)}${onReq ? ` + ${onReq} поз. за запитом` : ''}`, `Оплата: ${payment}`,
    d.delivery ? `Доставка: ${d.delivery}` : null, d.company ? `Компанія: ${d.company}` : null].filter(Boolean).join('\n');
  try {
    await fetch(env.LEAD_WEBHOOK || 'https://n8n.china-opt-shop.pp.ua/webhook/contact-form', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, phone, service: 'Оздоба — замовлення', area: '', message, source: 'cas-develop.com/ozdoba', form: 'ozdoba-order', lang: 'uk', page: '/ozdoba' }),
    });
  } catch (e) { /* замовлення вже збережене — сповіщення не критичне */ }

  return json({ ok: true, number, total, on_request: onReq });
}
