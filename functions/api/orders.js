// Замовлення клієнта: GET — мої замовлення; POST — нове замовлення з кошика Оздоби.
// Ціни перераховуються на сервері з каталогу (/assets/ozdoba/catalog.json), щоб їх не можна було підмінити.
import { STATUSES, bad, currentClient, json, partnerCode, readJSON, str, volumePct } from '../_lib.js';

const r10 = n => Math.round(n / 10) * 10;

function linePrice(cat, it, ci, si) {
  if (it.price == null) return null;
  const ss = it.ss ? cat.sizesets[it.ss] : null;
  const k = ss ? (ss[si] || ss.find(x => x[1] === 1) || ss[0])[1] : 1;
  return r10(it.price * k * (1 + color(cat, it, ci)[2]));
}

// колір: ci < 0 — «як на фото» (базове виконання, без доплати), 0… — колір під замовлення з colorsets (як у app.js col())
function color(cat, it, ci) {
  return ci < 0 ? ['Як на фото', '', 0] : (cat.colorsets[it.cs][ci] || cat.colorsets[it.cs][0]);
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
  // мінімум 10 шт (одиниць) кожної позиції — catalog.json min_qty (Михайло 25.10.2026); менше — 400 з поясненням
  const minQty = Number(cat.min_qty) || 10;
  for (const l of d.cart) {
    const it = byId.get(Number(l.id));
    if (!it) continue;
    const q = Math.floor(Number(l.qty));
    if (!(q >= minQty)) return bad(`Мінімальна кількість — ${minQty} ${it.unit} кожної позиції: «${it.name}» (у кошику ${Number.isFinite(q) ? q : 0}). Поштучно не продаємо — збільште кількість або приберіть позицію.`);
    const qty = Math.min(10000, q);
    const ci = Number.isInteger(Number(l.ci)) ? Number(l.ci) : -1, si = Number(l.si) || 0;
    const ss = it.ss ? cat.sizesets[it.ss] : null;
    items.push({ id: it.id, name: it.name, color: color(cat, it, ci)[0],
      size: ss ? (ss[si] || ss[0])[0] : null, qty, unit: it.unit, price: linePrice(cat, it, ci, si) });
  }
  if (!items.length) return bad('Позицій не знайдено в каталозі');
  // знижка: за обсягом (catalog.json volume_discounts) або особистий код партнера (D1 partner_codes) — не сумуються, діє більша
  const goods = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  const partner = d.promo ? await partnerCode(env, d.promo) : null;
  const promo = partner ? partner.code : null;
  const vol = volumePct(cat, goods);
  const pct = Math.max(vol, partner ? partner.discount : 0);
  const byPartner = !!partner && partner.discount > vol;
  const disc = Math.round(goods * pct / 100);
  // доставка й митні платежі не фіксовані — розраховує менеджер залежно від обсягу (Михайло 25.10.2026); у суму не входять
  const ship = 0;
  const total = goods - disc;
  const onReq = items.filter(i => i.price == null).length;
  if (!onReq && goods - disc < 23000) return bad('Мінімальне замовлення — від 23 000 ₴ (≈ $500)');
  const number = await nextNumber(env);
  const name = str(d.name, 120) || c?.name || null;
  const payment = ['card', 'invoice', 'cash', 'usdt'].includes(d.payment) ? d.payment : 'card';

  const res = await env.DB.prepare(`INSERT INTO orders (number, client_id, name, phone, items, total, on_request, promo, discount, discount_pct, delivery, payment, company, comment)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(number, c?.id || null, name, phone, JSON.stringify(items), total, onReq, promo, disc, pct, str(d.delivery, 200), payment, str(d.company, 200), str(d.comment, 1000)).run();
  if (promo) await env.DB.prepare('UPDATE partner_codes SET uses = uses + 1 WHERE code = ?').bind(promo).run();
  await env.DB.prepare("INSERT INTO order_events (order_id, status, author) VALUES (?, 'new', 'client')").bind(res.meta.last_row_id).run();
  if (c) await env.DB.prepare('UPDATE clients SET phone = COALESCE(phone, ?), city = COALESCE(city, ?), company = COALESCE(company, ?) WHERE id = ?')
    .bind(phone, str(d.delivery, 200), str(d.company, 200), c.id).run();

  // сповіщення менеджеру тим самим каналом, що й заявки з сайту (n8n → Telegram)
  const money = n => n == null ? 'за запитом' : new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
  const message = [`Замовлення ${number} з Оздоби${c ? ` · клієнт #${c.id} (${c.provider})` : ''}`,
    ...items.map(i => `• ${i.name} — ${i.color}${i.size ? ', ' + i.size : ''} — ${i.qty} ${i.unit} × ${money(i.price)}`),
    `Товари: ${money(goods)}`,
    pct ? `${byPartner ? `Знижка партнера ${promo}` : 'Знижка за обсягом'} −${pct}%: −${money(disc)}` : null,
    promo ? `Код партнера: ${promo}${partner.name ? ` (${partner.name})` : ''}, −${partner.discount}%${byPartner ? '' : ' — не застосовано, діє більша знижка за обсягом'}` : null,
    'Доставка й митні платежі: розрахувати індивідуально (залежно від обсягу)',
    `РАЗОМ за товари (орієнтовно): ${money(total)}${onReq ? ` + ${onReq} поз. за запитом` : ''}`, `Оплата: ${payment}`,
    d.delivery ? `Доставка: ${d.delivery}` : null, d.company ? `Компанія: ${d.company}` : null].filter(Boolean).join('\n');
  try {
    await fetch(env.LEAD_WEBHOOK || 'https://n8n.china-opt-shop.pp.ua/webhook/contact-form', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, phone, service: 'Оздоба — замовлення', area: '', message, source: 'cas-develop.com/ozdoba', form: 'ozdoba-order', lang: 'uk', page: '/ozdoba' }),
    });
  } catch (e) { /* замовлення вже збережене — сповіщення не критичне */ }

  return json({ ok: true, number, goods, discount: disc, discount_pct: pct, promo, shipping: ship, total, on_request: onReq });
}
