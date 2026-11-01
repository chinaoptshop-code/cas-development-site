// CRM: замовлення Оздоби й заявки студії (orders.kind = order | lead) в одній таблиці. Права — functions/_roles.js:
//   рядки: leads.view_all — усі заявки, leads.view_assigned — лише де assignee_staff_id = я; orders.view — замовлення Оздоби;
//   поля: без finance.view — без сум/оплати, без clients.contacts — без телефону/пошти (shapeOrder).
// GET  ?kind=&status=&q=&assignee=&staff=<id|none>&city=&min=&max=&due=1&overdue=1&place=&from=&to=&format=csv — список
//   (CSV — право export; place — місце форми, див. placeOf; from / to — дати YYYY-MM-DD за Києвом, включно)
// GET  ?stats=1&days=7|30 — аналітика заявок (leads.view_all)
// GET  ?events=<id> — історія статусів (лише видимого рядка)
// POST {name, phone, email, service, source, comment, city, amount, currency, assignee_staff_id, next_contact} — нова заявка вручну (leads.edit)
// PATCH {id, status, crm_note, manager_note, next_contact, note, city} — leads.edit / orders.edit;
//   amount, currency — finance.edit; assignee, assignee_staff_id — leads.assign. Заборонене поле → 403 (без часткового збереження).
//   Перший перехід із «Нове» = «взяли в роботу»: taken_at, час реакції, сповіщення в Telegram (functions/_alerts.js).
//   Кожна зміна — в audit_log (до/після).
import { CLOSED, LEAD_STATUSES, ORDER_STATUSES, STATUSES, bad, json, nextLeadNumber, readJSON, statusLabel, statusesOf, str } from '../../_lib.js';
import { SLA_MIN, escHtml, kyiv, kyivMidnight, notifyStaff, parseUtc, sqlTime, takeLead } from '../../_alerts.js';
import { audit, diff, need, noTable, orderScope, shapeOrder, staffById } from '../../_roles.js';

const CUR = ['UAH', 'USD', 'EUR'];
const date = v => (v == null || v === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined);
const int = v => (v == null || v === '' ? null : Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : undefined);
const SITE = "(o.source LIKE '%cas-develop.com%' OR o.source LIKE '%.pages.dev%')";
// місце форми: «#prices» … з source; основна форма сторінки — «form»; вручну / дзвінок — «manual»; Оздоба — «order»
export const placeOf = o => o.kind === 'order' ? 'order'
  : !/cas-develop\.com|\.pages\.dev/.test(o.source || '') ? 'manual' : (/#([\w-]+)$/.exec(o.source || '') || [, 'form'])[1].replace(/^(?!form$)/, '#');
// сторінка без домену, «#місця» і мовного кореня: cas-develop.com/remont-kvartyr-kyiv#prices → /remont-kvartyr-kyiv
export const pageOf = o => { const m = /(?:cas-develop\.com|\.pages\.dev)(\/[^#?\s]*)?/.exec(o.source || ''); return m ? (m[1] || '/') : null; };
const QUOTE = new Set(['quote_sent', 'contract', 'project', 'handover', 'warranty', 'paid', 'production', 'shipping', 'delivered']);
const PAID = new Set(['contract', 'project', 'handover', 'warranty', 'paid', 'production', 'shipping', 'delivered']);
const CLOSED_SQL = CLOSED.map(s => `'${s}'`).join(', ');

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
    ['next_contact', 'Наступний контакт'], ['reaction_min', 'Реакція, хв'], ['city', 'Місто / область'], ['source', 'Джерело'], ['place', 'Місце форми'], ['form', 'Форма'], ['lang', 'Мова'], ['utm', 'UTM'], ['taken_at', 'Взято в роботу'], ['crm_note', 'Нотатки'], ['comment', 'Коментар клієнта'], ['payment', 'Оплата'], ['delivery', 'Доставка']];
  // CSV-інʼєкція: текст з публічної форми, що починається з = + - @ (або табуляції), Excel/Таблиці виконали б як формулу —
  // додаємо апостроф (числа на кшталт суми лишаються числами)
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.map(c => c[1]).join(';')];
  for (const r of rows) lines.push(cols.map(([k]) => cell(
    k === 'status' ? statusLabel(r.status, r.kind) : k === 'kind' ? (r.kind === 'lead' ? 'Заявка' : 'Замовлення')
      : k === 'amount' ? (r.amount ?? r.total) : k === 'service' ? (r.service || (r.items || []).map(i => `${i.name} × ${i.qty}`).join(', ')) : r[k])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
const FIELDS = ['status', 'assignee', 'assignee_staff_id', 'crm_note', 'manager_note', 'amount', 'currency', 'next_contact', 'city'];
const TEAM_URL = 'https://cas-develop.com/kabinet/team';

// рядок CRM з видимістю для ctx (або null — не існує / чужий)
async function visible(env, x, id) {
  const args = [];
  const w = orderScope(x, args);
  return env.DB.prepare(`SELECT o.* FROM orders o WHERE o.id = ? AND ${w}`).bind(Number(id) || 0, ...args).first();
}

async function staffMap(env) {
  try { return new Map((await env.DB.prepare('SELECT id, name, role, active FROM staff').all()).results.map(s => [s.id, s])); } catch (e) { if (noTable(e)) return new Map(); throw e; }
}

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, ['leads.view_all', 'leads.view_assigned', 'orders.view']);
  if (error) return error;
  const u = new URL(request.url), p = k => (u.searchParams.get(k) || '').trim();
  if (p('events')) {
    if (!await visible(env, x, p('events'))) return bad('Запис не знайдено', 404);
    const { results } = await env.DB.prepare('SELECT o.kind, e.status, e.note, e.author, e.created_at FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.order_id = ? ORDER BY e.id DESC LIMIT 100').bind(+p('events')).all();
    return json({ events: results.map(e => ({ status: e.status, note: e.note, author: e.author, created_at: e.created_at, label: statusLabel(e.status, e.kind) })) });
  }
  if (p('stats')) {
    if (!x.can('leads.view_all')) return bad('Немає права: аналітика — для тих, хто бачить усі заявки', 403);
    return json(await stats(env, p('days') === '30' ? 30 : p('days') === '90' ? 90 : 7));
  }
  if (p('format') === 'csv' && !x.can('export')) return bad('Немає права на експорт', 403);
  if ((p('from') && !date(p('from'))) || (p('to') && !date(p('to')))) return bad('Дата — РРРР-ММ-ДД');
  const args = [];
  let sql = 'SELECT o.*, c.username, c.provider, c.city AS client_city FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE ' + orderScope(x, args) + where(p, args);
  if (p('status') && STATUSES[p('status')]) { sql += ' AND o.status = ?'; args.push(p('status')); }
  if (p('status') === 'open') sql += ` AND o.status NOT IN (${CLOSED_SQL})`;
  if (p('assignee')) { sql += ' AND o.assignee = ?'; args.push(p('assignee')); }
  if (p('staff') === 'none') sql += ' AND o.assignee_staff_id IS NULL';
  else if (/^\d+$/.test(p('staff'))) { sql += ' AND o.assignee_staff_id = ?'; args.push(+p('staff')); }
  if (p('city')) { sql += ' AND (o.city LIKE ? OR c.city LIKE ?)'; args.push(`%${p('city')}%`, `%${p('city')}%`); }
  if (x.can('finance.view')) { // фільтр за сумою — лише тим, хто бачить суми (інакше це спосіб їх вгадати)
    if (/^\d+$/.test(p('min'))) { sql += ' AND COALESCE(o.amount, o.total, 0) >= ?'; args.push(+p('min')); }
    if (/^\d+$/.test(p('max'))) { sql += ' AND COALESCE(o.amount, o.total, 0) <= ?'; args.push(+p('max')); }
  }
  if (p('due') === '1') sql += ` AND o.next_contact IS NOT NULL AND o.next_contact <= date('now') AND o.status NOT IN (${CLOSED_SQL})`;
  if (p('overdue') === '1') { // прострочка: наступний контакт у минулому або нова заявка без реакції довше за SLA
    sql += ` AND o.status NOT IN (${CLOSED_SQL}) AND ((o.next_contact IS NOT NULL AND o.next_contact < date('now'))
      OR (o.status = 'new' AND o.taken_at IS NULL AND o.created_at <= ?))`;
    args.push(sqlTime(new Date(Date.now() - SLA_MIN * 60000)));
  }
  if (p('q')) {
    const cols = ['o.number', 'o.name', 'o.service', 'o.crm_note', 'o.comment', 'o.source'].concat(x.can('clients.contacts') ? ['o.phone', 'o.email'] : []);
    sql += ' AND (' + cols.map(c => c + ' LIKE ?').join(' OR ') + ')';
    for (let i = 0; i < cols.length; i++) args.push(`%${p('q')}%`);
  }
  sql += ' ORDER BY o.id DESC LIMIT 1000';
  let results;
  try { ({ results } = await env.DB.prepare(sql).bind(...args).all()); }
  catch (e) { if (!noTable(e)) throw e; return bad('CRM оновлюється (міграція 0010) — спробуйте за кілька хвилин', 503); }
  const S = await staffMap(env);
  const rows = results.map(o => shapeOrder({ ...o, items: JSON.parse(o.items || '[]'), place: placeOf(o), page: pageOf(o),
    assignee_name: o.assignee_staff_id && S.get(o.assignee_staff_id) ? S.get(o.assignee_staff_id).name : null,
    status_label: statusLabel(o.status, o.kind) }, x));
  if (p('format') === 'csv') {
    await audit(env, request, x, 'crm.export', 'orders', null, null, { rows: rows.length, query: u.search.slice(0, 400) });
    return new Response(csv(rows), { headers: {
      'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="cas-crm-${new Date().toISOString().slice(0, 10)}.csv"`,
    } });
  }
  const assignees = [...new Set(results.map(o => o.assignee).filter(Boolean))].sort();
  return json({
    statuses: STATUSES, lead_statuses: LEAD_STATUSES, order_statuses: ORDER_STATUSES, rows, assignees,
    staff: x.can('staff.view') ? [...S.values()].filter(s => s.active).map(s => ({ id: s.id, name: s.name, role: s.role })) : [],
    me: { staff_id: x.staffId, role: x.role, perms: [...x.perms] },
  });
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'leads.edit');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  const phone = String(d.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (!phone && !str(d.name) && !str(d.email)) return bad('Вкажіть хоча б імʼя, телефон або email');
  if ((d.amount != null && d.amount !== '') && !x.can('finance.edit')) return bad('Немає права змінювати суми', 403);
  let staffId = d.assignee_staff_id ? int(d.assignee_staff_id) : null;
  if (staffId && !x.can('leads.assign')) return bad('Немає права призначати відповідального', 403);
  if (!x.can('leads.view_all')) staffId = x.staffId; // інакше створена заявка зникла б з його ж списку
  const st = staffId ? await staffById(env, staffId) : null;
  if (staffId && (!st || !st.active)) return bad('Працівника не знайдено або вимкнено', 422);
  const amount = int(d.amount), next = date(d.next_contact);
  if (amount === undefined) return bad('Сума — число');
  if (next === undefined) return bad('Дата — РРРР-ММ-ДД');
  const number = await nextLeadNumber(env);
  const r = await env.DB.prepare(`INSERT INTO orders (number, kind, name, phone, email, items, service, source, comment, amount, currency, assignee, next_contact, status)
      VALUES (?, 'lead', ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, 'new')`)
    .bind(number, str(d.name, 120), phone || null, str(d.email, 200), str(d.service, 200), str(d.source, 200) || 'вручну',
      str(d.comment, 2000), amount, CUR.includes(d.currency) ? d.currency : 'UAH', st ? st.name : str(d.assignee, 80), next).run();
  const id = r.meta.last_row_id;
  try { await env.DB.prepare('UPDATE orders SET assignee_staff_id = ?, city = ? WHERE id = ?').bind(staffId, str(d.city, 120), id).run(); } catch (e) { if (!noTable(e)) throw e; }
  await env.DB.prepare("INSERT INTO order_events (order_id, status, note, author) VALUES (?, 'new', 'Створено вручну', ?)").bind(id, x.name).run();
  await audit(env, request, x, 'lead.create', 'orders', id, null, { number, name: str(d.name, 120), service: str(d.service, 200), assignee_staff_id: staffId });
  if (staffId && staffId !== x.staffId) await notifyStaff(env, staffId, `📌 Вам призначено заявку <b>${escHtml(number)}</b>${d.service ? `\nПослуга: ${escHtml(str(d.service, 200))}` : ''}`,
    { inline_keyboard: [[{ text: '📋 Мої задачі', url: TEAM_URL }]] });
  return json({ ok: true, id, number });
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, ['leads.edit', 'orders.edit']);
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  const o = await visible(env, x, d.id);
  if (!o) return bad('Запис не знайдено', 404); // чужий рядок — як неіснуючий: не підтверджуємо, що він є
  if (!x.can(o.kind === 'lead' ? 'leads.edit' : 'orders.edit')) return bad('Немає права змінювати цей запис', 403);
  const changes = k => has(d, k) && String(d[k] ?? '') !== String(o[k] ?? '');
  if ((changes('amount') || (has(d, 'currency') && d.currency !== o.currency)) && !x.can('finance.edit')) return bad('Немає права змінювати суми', 403);
  if ((changes('assignee') || changes('assignee_staff_id')) && !x.can('leads.assign')) return bad('Немає права призначати відповідального', 403);
  const ST = statusesOf(o.kind);
  const status = d.status == null ? o.status : (ST[d.status] ? d.status : null);
  if (!status) return bad('Невідомий статус для ' + (o.kind === 'lead' ? 'заявки' : 'замовлення'));
  const amount = has(d, 'amount') ? int(d.amount) : o.amount, next = has(d, 'next_contact') ? date(d.next_contact) : o.next_contact;
  if (amount === undefined) return bad('Сума — число');
  if (next === undefined) return bad('Дата — РРРР-ММ-ДД');
  let staffId = o.assignee_staff_id ?? null, st = null;
  if (changes('assignee_staff_id')) {
    staffId = d.assignee_staff_id ? int(d.assignee_staff_id) : null;
    st = staffId ? await staffById(env, staffId) : null;
    if (staffId && (!st || !st.active)) return bad('Працівника не знайдено або вимкнено', 422);
  }
  const pick = (k, n) => (has(d, k) ? str(d[k], n) : o[k]);
  const assignee = st ? st.name : (changes('assignee_staff_id') && !staffId ? null : pick('assignee', 80));
  const next_ = { status, assignee, assignee_staff_id: staffId, crm_note: pick('crm_note', 4000), manager_note: pick('manager_note', 2000), amount,
    currency: CUR.includes(d.currency) ? d.currency : o.currency || 'UAH', next_contact: next, city: pick('city', 120) };
  await env.DB.prepare(`UPDATE orders SET status = ?, assignee = ?, crm_note = ?, manager_note = ?, amount = ?, currency = ?, next_contact = ?,
      paid = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, next_.assignee, next_.crm_note, next_.manager_note, amount, next_.currency, next, status === 'paid' ? 1 : o.paid, o.id).run();
  if (has(o, 'assignee_staff_id')) await env.DB.prepare('UPDATE orders SET assignee_staff_id = ?, city = ? WHERE id = ?').bind(staffId, next_.city, o.id).run();
  if (status !== o.status || str(d.note)) await env.DB.prepare('INSERT INTO order_events (order_id, status, note, author) VALUES (?, ?, ?, ?)')
    .bind(o.id, status, str(d.note, 1000), x.name).run();
  if (!o.taken_at && o.status === 'new' && status !== 'new') await takeLead(env, o.id, next_.assignee || x.name, 'CRM', new Date(), x.staffId);
  const dd = diff(o, next_, FIELDS);
  if (dd || str(d.note)) await audit(env, request, x, o.kind === 'lead' ? 'lead.update' : 'order.update', 'orders', o.id, dd && dd.before,
    { ...(dd ? dd.after : {}), ...(str(d.note) ? { note: str(d.note, 1000) } : {}) });
  if (staffId && staffId !== o.assignee_staff_id && staffId !== x.staffId)
    await notifyStaff(env, staffId, `📌 Вам призначено ${o.kind === 'lead' ? 'заявку' : 'замовлення'} <b>${escHtml(o.number)}</b>${o.service ? `\nПослуга: ${escHtml(o.service)}` : ''}\nСтадія: ${escHtml(statusLabel(status, o.kind))}`,
      { inline_keyboard: [[{ text: '📋 Мої задачі', url: TEAM_URL }]] });
  return json({ ok: true, status, status_label: statusLabel(status, o.kind) });
}
