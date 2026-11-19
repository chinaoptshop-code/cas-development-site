// CRM: замовлення Оздоби й заявки студії (orders.kind = order | lead) в одній таблиці. Права — functions/_roles.js:
//   рядки: leads.view_all — усі заявки, leads.view_assigned — лише де assignee_staff_id = я; orders.view — замовлення Оздоби;
//   поля: без finance.view — без сум/оплати, без clients.contacts — без телефону/пошти (shapeOrder).
// GET  ?kind=&status=&q=&assignee=&staff=<id|none>&city=&min=&max=&due=1&overdue=1&place=&ref=&from=&to=&format=csv — список
//   (CSV — право export; place — місце форми, див. placeOf; from / to — дати YYYY-MM-DD за Києвом, включно;
//   ref — сторінка-джерело orders.ref_path, migrations/0011: поле, фільтр і колонка CSV — лише з leads.view_all, тобто власник і менеджер;
//   source=finder або place=finder — заявки бота пошуку (POST /api/bot/leads, orders.source = 'finder', migrations/0013))
//   Довгі списки (19.11.2026): &limit=<1…1000> (без нього — 1000) і &before=<id останнього рядка> — наступна сторінка (нові зверху);
//   відповідь: rows, total (усього за фільтром), more (є ще), next (id для before), waiting (нових без відповіді за фільтром),
//   by_status {lead: {new: n, …}, order: {…}} — лічильники стадій за тим самим фільтром (канбан показує «12 з 340»). Пошук і всі
//   фільтри — на сервері, тож працюють по всій базі, а не лише по завантажених рядках. CSV — до 20 000 рядків.
//   Кожен рядок має ver (functions/_ver.js): PATCH {id, ver, …} з картки → 409 {conflict: true, row}, якщо заявку відтоді змінили.
// GET  ?stats=1&days=7|30 — аналітика заявок (leads.view_all)
// GET  ?events=<id> — історія статусів (лише видимого рядка)
// POST {name, phone, email, service, source, comment, city, amount, currency, assignee_staff_id, next_contact} — нова заявка вручну (leads.edit)
// PATCH {id, offer: {key, area, region: ua|eu} | null} — пропозиція з заявки (leads.edit, migrations/0014): сервер рахує «від $…» за ставками
//   functions/_rates.js (ЗГЕНЕРОВАНО з CLAUDE.md; дизайн — не менше мінімуму; немає ставки — «за кошторисом»); Нова / В роботі → «Розрахунок»,
//   рядок у історії. Перетворити заявку на проєкт — POST /api/admin/projects {type: 'from_lead', order_id}.
// PATCH {id, status, crm_note, manager_note, next_contact, note, city} — leads.edit / orders.edit;
//   amount, currency — finance.edit; assignee, assignee_staff_id — leads.assign. Заборонене поле → 403 (без часткового збереження).
//   Перший перехід із «Нове» = «взяли в роботу»: taken_at, час реакції, сповіщення в Telegram (functions/_alerts.js).
//   Кожна зміна — в audit_log (до/після). Ліміти записів — на працівника за годину (functions/_rate.js, STAFF_LIMITS): картки й канбан
//   600, журнал «КП надіслано» 120, масові дії 60; далі 429.
import { CLOSED, LEAD_STATUSES, ORDER_STATUSES, STATUSES, bad, dict, json, nextLeadNumber, readJSON, statusLabel, statusesOf, str } from '../../_lib.js';
import { SLA_MIN, escHtml, kyiv, kyivMidnight, notifyStaff, parseUtc, sqlTime, takeLead } from '../../_alerts.js';
import { audit, diff, need, noTable, orderScope, shapeOrder, staffById } from '../../_roles.js';
import { DESIGN, DMIN, RATES, cost, rateOf } from '../../_rates.js';
import { kpText } from '../../_client_msgs.js';
import { TOO_MANY, staffLimited } from '../../_rate.js';
import { conflict, lastChange, leadVer } from '../../_ver.js';

// Пропозиція з заявки: тип послуги → ставка «від». Порядок — пріоритетні напрями студії (Михайло 18.11.2026): дизайн-проєкт,
// ремонт під ключ, будівництво будинку, комерція; далі — решта. service — тип проєкту при конверсії (functions/api/admin/projects.js).
export const OFFER = {
  dz: { label: 'Дизайн-проєкт інтерʼєру', unit: 'м²', service: 'design' },
  reno: { label: 'Ремонт під ключ (роботи + чорнові матеріали)', unit: 'м²', service: 'repair' },
  key: { label: 'Будинок під ключ', unit: 'м²', service: 'build' },
  box: { label: 'Будинок: коробка', unit: 'м²', service: 'build' },
  office: { label: 'Комерція: ремонт офісу (роботи + чорнові матеріали)', unit: 'м²', service: 'repair' },
  plan: { label: 'Дизайн: планувальний пакет', unit: 'м²', service: 'design' },
  full: { label: 'Дизайн: повний пакет з авторським наглядом', unit: 'м²', service: 'design' },
  arch: { label: 'Архітектурний проєкт будинку', unit: 'м²', service: 'arch' },
  furn: { label: 'Меблювання й комплектація', unit: 'м²', service: 'furnish' },
  land: { label: 'Ландшафтний дизайн', unit: 'сотка', service: 'landscape' },
};
// $1 100 — тисячі вузьким нерозривним пробілом U+202F (формат цін CLAUDE.md, uk)
export const usd = n => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
export function offerOf(d, by) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'Пропозиція: очікуємо {key, area, region}' };
  const key = String(d.key || ''), o = Object.prototype.hasOwnProperty.call(OFFER, key) ? OFFER[key] : null;
  if (!o) return { error: 'Пропозиція: невідомий тип послуги' };
  const area = Number(String(d.area ?? '').replace(',', '.').replace(/\s/g, ''));
  if (!(area > 0) || area > 100000) return { error: `Пропозиція: площа — число більше 0 (${o.unit})` };
  const eu = d.region === 'eu', a = Math.round(area * 10) / 10;
  return { offer: { key, label: o.label, service: o.service, area: a, unit: o.unit, region: eu ? 'eu' : 'ua', rate: rateOf(key, eu),
    min: DESIGN.includes(key) ? DMIN[eu ? 1 : 0] : null, from: cost(key, eu, a), at: new Date().toISOString().slice(0, 10), by: by || null } };
}
// «Дизайн-проєкт інтерʼєру: 85 м² — від $2 550 ($30/м²)»; без ставки — «за кошторисом»
export const offerLine = f => `${f.label}: ${String(f.area).replace('.', ',')} ${f.unit} — ` + (f.from == null ? 'за кошторисом'
  : `від ${usd(f.from)} (${usd(f.rate)}/${f.unit}${f.min && f.from === f.min && f.rate * f.area < f.min ? `, мінімум ${usd(f.min)}` : ''})`) + (f.region === 'eu' ? ', Європа' : '');
const offerParse = s => { try { const v = JSON.parse(s || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const OFFERS = Object.entries(OFFER).map(([key, v]) => ({ key, ...v, rate: RATES[key], min: DESIGN.includes(key) ? DMIN : null }));

const CUR = ['UAH', 'USD', 'EUR'];
const date = v => (v == null || v === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined);
const int = v => (v == null || v === '' ? null : Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : undefined);
const SITE = "(o.source LIKE '%cas-develop.com%' OR o.source LIKE '%.pages.dev%')";
// місце форми: «#prices» … з source; основна форма сторінки — «form»; вручну / дзвінок — «manual»; Оздоба — «order»
export const placeOf = o => o.kind === 'order' ? 'order' : o.source === 'finder' ? 'finder'
  : !/cas-develop\.com|\.pages\.dev/.test(o.source || '') ? 'manual' : (/#([\w-]+)$/.exec(o.source || '') || [, 'form'])[1].replace(/^(?!form$)/, '#');
// сторінка без домену, «#місця» і мовного кореня: cas-develop.com/remont-kvartyr-kyiv#prices → /remont-kvartyr-kyiv
export const pageOf = o => { const m = /(?:cas-develop\.com|\.pages\.dev)(\/[^#?\s]*)?/.exec(o.source || ''); return m ? (m[1] || '/') : null; };
const QUOTE = new Set(['quote_sent', 'contract', 'project', 'handover', 'warranty', 'paid', 'production', 'shipping', 'delivered']);
const PAID = new Set(['contract', 'project', 'handover', 'warranty', 'paid', 'production', 'shipping', 'delivered']);
const CLOSED_SQL = CLOSED.map(s => `'${s}'`).join(', ');

function where(p, args, x) {
  let sql = '';
  if (p('kind') === 'order' || p('kind') === 'lead') { sql += ' AND o.kind = ?'; args.push(p('kind')); }
  const pl = p('place');
  if (pl === 'order') sql += " AND o.kind = 'order'";
  else if (pl === 'finder' || p('source') === 'finder') sql += " AND o.kind = 'lead' AND o.source = 'finder'";
  else if (pl === 'manual') sql += " AND o.kind = 'lead' AND COALESCE(o.source, '') NOT IN ('finder') AND COALESCE(o.source, '') NOT LIKE '%cas-develop.com%' AND COALESCE(o.source, '') NOT LIKE '%.pages.dev%'";
  else if (pl === 'form') sql += ` AND o.kind = 'lead' AND ${SITE} AND o.source NOT LIKE '%#%'`;
  else if (/^#[\w-]{1,40}$/.test(pl)) { sql += ' AND o.source LIKE ?'; args.push('%' + pl); }
  const ref = p('ref');
  if (ref && x && x.can('leads.view_all')) { // точний шлях або початок («/proekty/» — усі кейси); LIKE-символи екрануємо
    sql += " AND o.ref_path LIKE ? ESCAPE '\\'"; args.push(ref.slice(0, 160).replace(/[\\%_]/g, c => '\\' + c) + (ref.endsWith('/') ? '%' : ''));
  }
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
    by_place: group(placeOf), by_page: group(pageOf, 40), by_ref: group(o => o.ref_path || null, 40), by_form: group(o => o.form || null, 20), by_lang: group(o => o.lang || null, 12),
    by_day: days_.map(d => ({ date: d, n: perDay[d] })),
  };
}

function csv(rows) {
  const cols = [['number', 'Номер'], ['kind', 'Тип'], ['created_at', 'Створено'], ['status', 'Статус'], ['name', 'Клієнт'], ['phone', 'Телефон'],
    ['contact_tg', 'Telegram'], ['email', 'Email'], ['service', 'Послуга / товари'], ['amount', 'Сума'], ['currency', 'Валюта'], ['assignee', 'Відповідальний'],
    ['next_contact', 'Наступний контакт'], ['reaction_min', 'Реакція, хв'], ['city', 'Місто / область'], ['source', 'Джерело'], ['place', 'Місце форми'], ['ref_path', 'Сторінка-джерело'], ['form', 'Форма'], ['lang', 'Мова'], ['utm', 'UTM'], ['taken_at', 'Взято в роботу'], ['crm_note', 'Нотатки'], ['comment', 'Коментар клієнта'], ['payment', 'Оплата'], ['delivery', 'Доставка']];
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

// рядок списку CRM — у тому ж вигляді для GET і для відповіді про конфлікт версій (PATCH → 409 {row})
async function shapeRow(o, x, S) {
  const f = offerParse(o.offer);
  const r = shapeOrder({ ...o, items: JSON.parse(o.items || '[]'), place: placeOf(o), page: pageOf(o), offer: f,
    kp_text: f ? kpText(f, o.lang, o.name) : null, // «Надіслати КП» — мовою заявки (10 мов)
    assignee_name: o.assignee_staff_id && S.get(o.assignee_staff_id) ? S.get(o.assignee_staff_id).name : null,
    status_label: statusLabel(o.status, o.kind), ver: await leadVer(o) }, x);
  if (!x.can('leads.view_all')) delete r.ref_path; // сторінка-джерело — власнику й менеджеру
  return r;
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
  const csvOut = p('format') === 'csv';
  let sql = ' FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE ' + orderScope(x, args) + where(p, args, x);
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
    const cols = ['o.number', 'o.name', 'o.service', 'o.crm_note', 'o.comment', 'o.source'].concat(x.can('clients.contacts') ? ['o.phone', 'o.email', 'o.contact_tg'] : []);
    sql += ' AND (' + cols.map(c => c + ' LIKE ?').join(' OR ') + ')';
    for (let i = 0; i < cols.length; i++) args.push(`%${p('q')}%`);
  }
  // сторінка: limit рядків, старші за before (id); CSV — усе за фільтром (до 20 000)
  const lim = csvOut ? 20000 : Math.max(1, Math.min(1000, /^\d+$/.test(p('limit')) ? +p('limit') : 1000));
  const before = !csvOut && /^\d+$/.test(p('before')) ? +p('before') : 0;
  let results, cnt = [];
  try {
    ({ results } = await env.DB.prepare('SELECT o.*, c.username, c.provider, c.city AS client_city' + sql + (before ? ' AND o.id < ?' : '') + ' ORDER BY o.id DESC LIMIT ' + (lim + 1))
      .bind(...args, ...(before ? [before] : [])).all());
    if (!csvOut) ({ results: cnt } = await env.DB.prepare(`SELECT o.kind AS kind, o.status AS status, COUNT(*) AS n,
        SUM(CASE WHEN o.kind = 'lead' AND o.status = 'new' AND o.taken_at IS NULL THEN 1 ELSE 0 END) AS w` + sql + ' GROUP BY o.kind, o.status').bind(...args).all());
  } catch (e) { if (!noTable(e)) throw e; return bad('CRM оновлюється (міграція 0010) — спробуйте за кілька хвилин', 503); }
  const more = results.length > lim;
  if (more) results.length = lim;
  const S = await staffMap(env);
  const rows = [];
  for (const o of results) rows.push(await shapeRow(o, x, S));
  if (csvOut) {
    await audit(env, request, x, 'crm.export', 'orders', null, null, { rows: rows.length, query: u.search.slice(0, 400) });
    return new Response(csv(rows), { headers: {
      'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="cas-crm-${new Date().toISOString().slice(0, 10)}.csv"`,
    } });
  }
  const assignees = [...new Set(results.map(o => o.assignee).filter(Boolean))].sort();
  const by_status = { lead: {}, order: {} };
  for (const c of cnt) (by_status[c.kind === 'lead' ? 'lead' : 'order'])[c.status] = c.n;
  return json({
    statuses: STATUSES, lead_statuses: LEAD_STATUSES, order_statuses: ORDER_STATUSES, rows, assignees, offers: OFFERS,
    total: cnt.reduce((n, c) => n + c.n, 0), waiting: cnt.reduce((n, c) => n + (c.w || 0), 0), by_status, more, next: more && rows.length ? rows[rows.length - 1].id : null,
    staff: x.can('staff.view') ? [...S.values()].filter(s => s.active).map(s => ({ id: s.id, name: s.name, role: s.role })) : [],
    me: { staff_id: x.staffId, role: x.role, perms: [...x.perms] },
  });
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'leads.edit');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  if (await staffLimited(env, request, x, 'crm')) return bad(TOO_MANY, 429);
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
  // ліміти — на працівника (functions/_rate.js): масова дія, журнал «КП надіслано» і звичайні зміни — окремі кошики
  const kind = d && d.bulk ? 'bulk' : d && has(d, 'offer_sent') ? 'kp' : 'crm';
  if (await staffLimited(env, request, x, kind)) return bad(TOO_MANY, 429);
  if (d && d.bulk) return bulk(env, request, x, d.bulk);
  if (d && has(d, 'offer_sent')) return offerSent(env, request, x, d);
  return patchOne(env, request, x, d);
}

// «Надіслати КП»: менеджер відкрив Telegram / Viber / WhatsApp з готовим текстом (або скопіював) — лише журнал (історія + аудит),
// сервер нічого не надсилає. Потрібна збережена пропозиція. Нова / В роботі → «Розрахунок».
const KP_CH = dict({ telegram: 'Telegram', viber: 'Viber', whatsapp: 'WhatsApp', copy: 'скопійовано' });
async function offerSent(env, request, x, d) {
  const o = await visible(env, x, d.id);
  if (!o || o.kind !== 'lead') return bad('Заявку не знайдено', 404);
  if (!x.can('leads.edit')) return bad('Немає права змінювати цей запис', 403);
  const ch = String(d.offer_sent || '');
  if (!KP_CH[ch]) return bad('Канал: ' + Object.keys(KP_CH).join(' | '));
  const f = offerParse(o.offer);
  if (!f) return bad('Спершу збережіть розрахунок', 409);
  return patchOne(env, request, x, { id: o.id, note: `КП надіслано (${KP_CH[ch]}): ${offerLine(f)}`, ...(['new', 'in_work'].includes(o.status) ? { status: 'quote_sent' } : {}) }, 'lead.offer_sent');
}

// Масові дії зі списку: {ids: [..≤100], status? | assignee_staff_id? | not_interested: 'причина'?} — кожен рядок окремо через ті самі
// перевірки, що й PATCH одного (видимість, leads.edit / orders.edit, leads.assign). «Не цікаво» — заявка «Скасовано» з причиною в історії;
// заявка бота пошуку (ext_hash) ще й у bot_feedback — бот перестане показувати схожі. Відповідь: {ok, done, results: [{id, ok | error}]}.
async function bulk(env, request, x, b) {
  if (!b || typeof b !== 'object' || !Array.isArray(b.ids) || !b.ids.length || b.ids.length > 100) return bad('ids: від 1 до 100');
  const ids = [...new Set(b.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
  const acts = ['status', 'assignee_staff_id', 'not_interested'].filter(k => has(b, k));
  if (acts.length !== 1) return bad('Одна дія: status, assignee_staff_id або not_interested');
  const reason = acts[0] === 'not_interested' ? (str(b.not_interested, 300) || 'без причини') : null;
  const results = [];
  for (const id of ids) {
    const body = acts[0] === 'status' ? { id, status: b.status, note: 'Масова зміна стадії' } : acts[0] === 'assignee_staff_id' ? { id, assignee_staff_id: b.assignee_staff_id }
      : { id, status: 'cancelled', note: 'Не цікаво: ' + reason };
    if (reason) { const o = await visible(env, x, id); if (o && o.kind !== 'lead') { results.push({ id, error: '«Не цікаво» — лише для заявок' }); continue; } }
    const r = await patchOne(env, request, x, body);
    const j = await r.json().catch(() => ({}));
    if (r.status !== 200) { results.push({ id, error: j.error || String(r.status) }); continue; }
    if (reason) {
      const o = await env.DB.prepare('SELECT ext_hash FROM orders WHERE id = ?').bind(id).first().catch(() => null);
      if (o && o.ext_hash) await env.DB.prepare(`INSERT INTO bot_feedback (lead_hash, verdict, reason) VALUES (?, 'not_interested', ?)
          ON CONFLICT(lead_hash) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, updated_at = datetime('now')`).bind(o.ext_hash, reason).run().catch(e => { if (!noTable(e)) throw e; });
    }
    results.push({ id, ok: true });
  }
  await audit(env, request, x, 'crm.bulk', 'orders', null, null, { action: acts[0], value: b[acts[0]] ?? null, ids, done: results.filter(r => r.ok).length });
  return json({ ok: true, done: results.filter(r => r.ok).length, results });
}

async function patchOne(env, request, x, d, action) {
  const o = await visible(env, x, d && d.id);
  if (!o) return bad('Запис не знайдено', 404); // чужий рядок — як неіснуючий: не підтверджуємо, що він є
  if (!x.can(o.kind === 'lead' ? 'leads.edit' : 'orders.edit')) return bad('Немає права змінювати цей запис', 403);
  // картка заявки зберігає з версією: якщо заявку відтоді змінив хтось інший (стадія, нотатки, відповідальний…) — 409 зі свіжим
  // рядком, без змін. Швидкі дії (канбан, «Взяти в роботу», масові) версію не надсилають — вони змінюють одне поле.
  if (d.ver != null && d.ver !== '' && String(d.ver) !== await leadVer(o))
    return conflict(o.kind === 'lead' ? 'Заявку змінили, поки ви редагували' : 'Замовлення змінили, поки ви редагували',
      { row: await shapeRow(o, x, await staffMap(env)), last: await lastChange(env, 'orders', o.id) });
  const changes = k => has(d, k) && String(d[k] ?? '') !== String(o[k] ?? '');
  if ((changes('amount') || (has(d, 'currency') && d.currency !== o.currency)) && !x.can('finance.edit')) return bad('Немає права змінювати суми', 403);
  if ((changes('assignee') || changes('assignee_staff_id')) && !x.can('leads.assign')) return bad('Немає права призначати відповідального', 403);
  let offer; // undefined — не змінюємо, null — прибрати
  if (has(d, 'offer')) {
    if (o.kind !== 'lead') return bad('Пропозиція — лише для заявок студії');
    if (d.offer === null) offer = null;
    else { const r = offerOf(d.offer, x.name); if (r.error) return bad(r.error, 422); offer = r.offer; }
    if (offer && d.status == null && ['new', 'in_work'].includes(o.status)) d.status = 'quote_sent';
    if (offer && !str(d.note)) d.note = 'Розрахунок: ' + offerLine(offer);
  }
  const ST = statusesOf(o.kind);
  const status = d.status == null ? o.status : (typeof d.status === 'string' && ST[d.status] ? d.status : null);
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
  if (offer !== undefined) { // спершу пропозиція: до міграції 0014 — 503 без часткового збереження
    try { await env.DB.prepare('UPDATE orders SET offer = ? WHERE id = ?').bind(offer ? JSON.stringify(offer) : null, o.id).run(); }
    catch (e) { if (noTable(e)) return bad('Пропозиції зʼявляться після міграції 0014 — спробуйте за кілька хвилин', 503); throw e; }
  }
  await env.DB.prepare(`UPDATE orders SET status = ?, assignee = ?, crm_note = ?, manager_note = ?, amount = ?, currency = ?, next_contact = ?,
      paid = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, next_.assignee, next_.crm_note, next_.manager_note, amount, next_.currency, next, status === 'paid' ? 1 : o.paid, o.id).run();
  if (has(o, 'assignee_staff_id')) await env.DB.prepare('UPDATE orders SET assignee_staff_id = ?, city = ? WHERE id = ?').bind(staffId, next_.city, o.id).run();
  if (status !== o.status || str(d.note)) await env.DB.prepare('INSERT INTO order_events (order_id, status, note, author) VALUES (?, ?, ?, ?)')
    .bind(o.id, status, str(d.note, 1000), x.name).run();
  if (!o.taken_at && o.status === 'new' && status !== 'new') await takeLead(env, o.id, next_.assignee || x.name, 'CRM', new Date(), x.staffId);
  const dd = diff(o, next_, FIELDS);
  if (dd || str(d.note) || offer !== undefined) await audit(env, request, x, action || (o.kind === 'lead' ? 'lead.update' : 'order.update'), 'orders', o.id, dd && dd.before,
    { ...(dd ? dd.after : {}), ...(str(d.note) ? { note: str(d.note, 1000) } : {}), ...(offer !== undefined ? { offer } : {}) });
  if (staffId && staffId !== o.assignee_staff_id && staffId !== x.staffId)
    await notifyStaff(env, staffId, `📌 Вам призначено ${o.kind === 'lead' ? 'заявку' : 'замовлення'} <b>${escHtml(o.number)}</b>${o.service ? `\nПослуга: ${escHtml(o.service)}` : ''}\nСтадія: ${escHtml(statusLabel(status, o.kind))}`,
      { inline_keyboard: [[{ text: '📋 Мої задачі', url: TEAM_URL }]] });
  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(o.id).first();
  return json({ ok: true, status, status_label: statusLabel(status, o.kind), ver: await leadVer(fresh || o), ...(offer !== undefined ? { offer, offer_line: offer ? offerLine(offer) : null, kp_text: offer ? kpText(offer, o.lang, o.name) : null } : {}) });
}
