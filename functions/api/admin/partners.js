// «Контакти» в /kabinet/admin (з 18.11.2026; раніше «Партнери») — один довідник: клієнти, підрядники, партнери, постачальники, ріелтори,
// бригади, майстри, будівельні компанії, дизайнери. Бот пошуку додає «не клієнтів» (POST /api/bot/partners), менеджер — будь-кого вручну.
// Права (functions/_roles.js): partners.base (власник і менеджер) — усе; CSV — ще й export; кожна зміна й експорт — у audit_log.
// Читання контактів, привʼязаних до своїх обʼєктів (дизайнер, прораби… — contacts.linked), — через GET /api/admin/projects і /api/team/today,
// не тут. Клієнтам контакти не віддаються ніде. Таблиці — migrations/0013_partners.sql, 0015_contacts.sql (email, rating, client_id, contact_links).
// GET   ?type=&status=&city=&q=&tag=&rating=<1–5, не нижче>&format=csv — список (до 2000, нові зверху за last_seen)
// GET   ?id=<id> — картка: + links (обʼєкти й заявки, привʼязані явно) і leads (заявки з тим самим телефоном / Telegram)
// GET   ?find=<текст> — до 20 контактів для швидкого вибору (картка обʼєкта: «Привʼязати контакт»)
// POST  {name, company, type, city, tg, phone, email, site, tags, notes, status, rating} — додати (той самий контакт/компанія → 409 з id)
// POST  {action: 'link', contact_id, project_id | order_id, role?, note?} — привʼязати до обʼєкта або заявки (повтор — оновлює роль)
// PATCH {id, ver?, …поля} — змінити (контакт іншого запису → 409); ver — версія картки з GET ?id= (functions/_ver.js): картку відтоді
//       змінив інший менеджер → 409 {conflict: true, partner} без змін
// Записи (POST / PATCH / DELETE) — до 600 на годину на працівника (functions/_rate.js), далі 429.
// DELETE ?link=<id> — відвʼязати
import { bad, json, readJSON } from '../../_lib.js';
import { Invalid, PARTNER_STATUSES, PARTNER_TYPES, findPartner, hasEmail, partnerInput, partnersCsv, shapePartner, text } from '../../_partners.js';
import { audit, diff, need, noTable } from '../../_roles.js';
import { TOO_MANY, staffLimited } from '../../_rate.js';
import { conflict, contactVer, lastChange } from '../../_ver.js';

const FIELDS = ['name', 'company', 'type', 'city', 'tg', 'phone', 'email', 'site', 'tags', 'notes', 'status', 'rating'];
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
const like = s => '%' + String(s).slice(0, 80).replace(/[\\%_]/g, c => '\\' + c) + '%';
const migrating = () => bad('Розділ «Контакти» оновлюється (міграція 0013/0015) — спробуйте за кілька хвилин', 503);
const int = v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// заявки контакту: явні звʼязки + ті самі телефон чи Telegram (до 30)
async function contactLeads(env, r) {
  const conds = [], args = [];
  // телефон у заявках зберігається як ввели (0XX…, +380…) — порівнюємо за останніми 9 цифрами
  if (r.phone && r.phone.length >= 10) { conds.push('o.phone LIKE ?'); args.push('%' + r.phone.slice(-9)); }
  if (r.tg) { conds.push('o.contact_tg = ?'); args.push(r.tg); }
  let byContact = [];
  if (conds.length) {
    try {
      byContact = (await env.DB.prepare(`SELECT o.id, o.number, o.status, o.service, o.created_at FROM orders o WHERE o.kind = 'lead' AND (${conds.join(' OR ')}) ORDER BY o.id DESC LIMIT 30`)
        .bind(...args).all()).results;
    } catch (e) { if (!noTable(e)) throw e; }
  }
  return byContact;
}

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  const u = new URL(request.url), p = k => (u.searchParams.get(k) || '').trim();
  try {
    if (p('id')) {
      const r = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(+p('id') || 0).first();
      if (!r) return bad('Контакт не знайдено', 404);
      let links = [];
      try {
        links = (await env.DB.prepare(`SELECT l.id, l.project_id, l.order_id, l.role, l.note, l.created_at, p.title AS project_title, p.status AS project_status,
            o.number AS order_number, o.status AS order_status, o.service AS order_service
            FROM contact_links l LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN orders o ON o.id = l.order_id WHERE l.contact_id = ? ORDER BY l.id DESC LIMIT 100`).bind(r.id).all()).results;
      } catch (e) { if (!noTable(e)) throw e; }
      const linked = new Set(links.map(l => l.order_id).filter(Boolean));
      const leads = (await contactLeads(env, r)).filter(o => !linked.has(o.id));
      return json({ partner: { ...shapePartner(r), ver: await contactVer(r) }, links, leads, types: PARTNER_TYPES, statuses: PARTNER_STATUSES });
    }
    if (p('find')) {
      const q = p('find').replace(/^@/, '');
      const cols = ['name', 'company', 'tg', 'phone', 'tags', 'city'];
      const { results } = await env.DB.prepare(`SELECT * FROM partners WHERE ${cols.map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')} ORDER BY CASE status WHEN 'working' THEN 0 ELSE 1 END, last_seen DESC LIMIT 20`)
        .bind(...cols.map(() => like(q))).all();
      return json({ rows: results.map(shapePartner) });
    }
    const csv = p('format') === 'csv';
    if (csv && !x.can('export')) return bad('Немає права на експорт', 403);
    let sql = 'SELECT * FROM partners WHERE 1=1';
    const args = [];
    if (PARTNER_TYPES[p('type')]) { sql += ' AND type = ?'; args.push(p('type')); }
    if (PARTNER_STATUSES[p('status')]) { sql += ' AND status = ?'; args.push(p('status')); }
    if (p('city')) { sql += " AND city LIKE ? ESCAPE '\\'"; args.push(like(p('city'))); }
    if (p('tag')) { sql += " AND tags LIKE ? ESCAPE '\\'"; args.push(like('"' + p('tag').toLowerCase() + '"')); }
    if (/^[1-5]$/.test(p('rating'))) { sql += ' AND rating >= ?'; args.push(+p('rating')); }
    if (p('q')) {
      const q = p('q').replace(/^@/, '');
      const cols = ['name', 'company', 'city', 'tg', 'phone', 'site', 'source_name', 'tags', 'notes'].concat(await hasEmail(env) ? ['email'] : []);
      sql += ' AND (' + cols.map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')';
      for (const _ of cols) args.push(like(q));
    }
    sql += ' ORDER BY last_seen DESC, id DESC LIMIT 2000';
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    if (csv) {
      await audit(env, request, x, 'pbase.export', 'partners', null, null, { rows: results.length, query: u.search.slice(0, 400) });
      return new Response(partnersCsv(results), { headers: {
        'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="cas-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      } });
    }
    const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM partners GROUP BY status').all();
    const { results: tcnt } = await env.DB.prepare('SELECT type, COUNT(*) AS n FROM partners GROUP BY type').all();
    let nl = {};
    try { // скільки обʼєктів і заявок у кожного контакту
      const ids = results.map(r => r.id);
      if (ids.length) for (const r of (await env.DB.prepare(`SELECT contact_id, COUNT(project_id) AS p, COUNT(order_id) AS o FROM contact_links WHERE contact_id IN (${ids.map(() => '?').join(',')}) GROUP BY contact_id`).bind(...ids).all()).results) nl[r.contact_id] = r;
    } catch (e) { if (!noTable(e)) throw e; }
    return json({ types: PARTNER_TYPES, statuses: PARTNER_STATUSES, ready: await hasEmail(env),
      rows: results.map(r => ({ ...shapePartner(r), n_projects: (nl[r.id] || {}).p || 0, n_leads: (nl[r.id] || {}).o || 0 })),
      counts: Object.fromEntries(cnt.map(c => [c.status, c.n])), type_counts: Object.fromEntries(tcnt.map(c => [c.type, c.n])) });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}

// поля менеджера поверх partnerInput: статус, нотатки, оцінка 1–5 (порожньо — без оцінки)
function extra(d) {
  const status = d.status == null || d.status === '' ? undefined : String(d.status);
  if (status !== undefined && !PARTNER_STATUSES[status]) throw new Invalid('status: ' + Object.keys(PARTNER_STATUSES).join(' | '));
  let rating;
  if (has(d, 'rating')) {
    rating = d.rating == null || d.rating === '' || d.rating === 0 ? null : Number(d.rating);
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new Invalid('rating: 1–5');
  }
  return { status, notes: has(d, 'notes') ? text(d.notes, 4000, 'notes', true) : undefined, rating };
}

async function link(env, request, x, d) {
  const cid = int(d.contact_id), pid = d.project_id != null ? int(d.project_id) : null, oid = d.order_id != null ? int(d.order_id) : null;
  if (!cid || (!pid === !oid)) return bad('Потрібні contact_id і один з project_id / order_id');
  let role, note;
  try { role = text(d.role, 80, 'role'); note = text(d.note, 300, 'note'); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
  const c = await env.DB.prepare('SELECT id, name, company FROM partners WHERE id = ?').bind(cid).first();
  if (!c) return bad('Контакт не знайдено', 404);
  if (pid && !await env.DB.prepare('SELECT 1 FROM projects WHERE id = ?').bind(pid).first()) return bad('Обʼєкт не знайдено', 404);
  if (oid && !await env.DB.prepare("SELECT 1 FROM orders WHERE id = ? AND kind = 'lead'").bind(oid).first()) return bad('Заявку не знайдено', 404);
  const col = pid ? 'project_id' : 'order_id', ref = pid || oid;
  const cur = await env.DB.prepare(`SELECT id FROM contact_links WHERE contact_id = ? AND ${col} = ?`).bind(cid, ref).first();
  let id;
  if (cur) { await env.DB.prepare('UPDATE contact_links SET role = ?, note = ? WHERE id = ?').bind(role, note, cur.id).run(); id = cur.id; }
  else id = (await env.DB.prepare(`INSERT INTO contact_links (contact_id, ${col}, role, note, created_by) VALUES (?, ?, ?, ?, ?)`).bind(cid, ref, role, note, x.staffId).run()).meta.last_row_id;
  await audit(env, request, x, 'contact.link', pid ? 'projects' : 'orders', ref, null, { contact_id: cid, role, link_id: id });
  return json({ ok: true, id, updated: !!cur });
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  if (await staffLimited(env, request, x, 'contacts')) return bad(TOO_MANY, 429);
  try {
    if (d && d.action === 'link') return await link(env, request, x, d);
    let p, e2;
    try { p = partnerInput(d); e2 = extra(d); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
    if ((p.email || e2.rating != null) && !await hasEmail(env)) return migrating();
    const dup = await findPartner(env, p);
    if (dup) return json({ error: 'Такий контакт уже є (той самий телефон, Telegram, пошта, сайт або компанія)', id: dup.id }, 409);
    const r = await env.DB.prepare(`INSERT INTO partners (name, company, type, city, tg, phone, site, tags, notes, status, company_key, site_key, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'вручну')`)
      .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, JSON.stringify(p.tags), e2.notes ?? null, e2.status || 'new', p.company_key, p.site_key).run();
    const id = r.meta.last_row_id;
    if (await hasEmail(env)) await env.DB.prepare('UPDATE partners SET email = ?, rating = ? WHERE id = ?').bind(p.email, e2.rating ?? null, id).run();
    await audit(env, request, x, 'pbase.create', 'partners', id, null, { name: p.name, company: p.company, type: p.type });
    return json({ ok: true, id });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  if (await staffLimited(env, request, x, 'contacts')) return bad(TOO_MANY, 429);
  try {
    const o = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(Number(d && d.id) || 0).first();
    if (!o) return bad('Контакт не знайдено', 404);
    if (d.ver != null && d.ver !== '' && String(d.ver) !== await contactVer(o))
      return conflict('Контакт змінили, поки ви редагували', { partner: { ...shapePartner(o), ver: await contactVer(o) }, last: await lastChange(env, 'partners', o.id) });
    const ready = await hasEmail(env);
    // незмінені поля беремо з запису: PATCH {id, status} не вимагає повної картки
    const cur = { name: o.name, company: o.company, type: o.type, city: o.city, tg: o.tg, phone: o.phone, site: o.site, email: o.email ?? null, tags: JSON.parse(o.tags || '[]') };
    const merged = { ...cur }; for (const k of Object.keys(cur)) if (has(d, k)) merged[k] = d[k];
    let p, e2;
    try { p = partnerInput(merged); e2 = extra(d); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
    if (!ready && ((p.email && p.email !== cur.email) || e2.rating != null)) return migrating();
    const dup = await findPartner(env, p, o.id);
    if (dup) return json({ error: 'Цей контакт або компанія вже є в іншому записі', id: dup.id }, 409);
    const next = { ...p, tags: JSON.stringify(p.tags), notes: e2.notes === undefined ? o.notes : e2.notes, status: e2.status || o.status,
      rating: e2.rating === undefined ? (o.rating ?? null) : e2.rating };
    await env.DB.prepare(`UPDATE partners SET name = ?, company = ?, type = ?, city = ?, tg = ?, phone = ?, site = ?, tags = ?, notes = ?, status = ?,
        company_key = ?, site_key = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, next.tags, next.notes, next.status, p.company_key, p.site_key, o.id).run();
    if (ready) await env.DB.prepare('UPDATE partners SET email = ?, rating = ? WHERE id = ?').bind(p.email, next.rating, o.id).run();
    const dd = diff(o, next, FIELDS);
    if (dd) await audit(env, request, x, 'pbase.update', 'partners', o.id, dd.before, dd.after);
    const saved = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(o.id).first();
    return json({ ok: true, partner: { ...shapePartner(saved), ver: await contactVer(saved) } });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}

export async function onRequestDelete({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  const id = int(new URL(request.url).searchParams.get('link'));
  if (!id) return bad('Потрібен link');
  if (await staffLimited(env, request, x, 'contacts')) return bad(TOO_MANY, 429);

  try {
    const l = await env.DB.prepare('SELECT * FROM contact_links WHERE id = ?').bind(id).first();
    if (!l) return bad('Звʼязок не знайдено', 404);
    await env.DB.prepare('DELETE FROM contact_links WHERE id = ?').bind(id).run();
    await audit(env, request, x, 'contact.unlink', l.project_id ? 'projects' : 'orders', l.project_id || l.order_id, l, null);
    return json({ ok: true });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}
