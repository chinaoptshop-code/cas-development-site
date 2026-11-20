// «Контакти» в /kabinet/admin (з 18.11.2026; раніше «Партнери») — один довідник: клієнти, підрядники, партнери, постачальники, ріелтори,
// бригади, майстри, будівельні компанії, дизайнери. Бот пошуку додає «не клієнтів» (POST /api/bot/partners), менеджер — будь-кого вручну.
// Права (functions/_roles.js): partners.base (власник і менеджер) — усе; CSV — ще й export; кожна зміна й експорт — у audit_log.
// Читання контактів, привʼязаних до своїх обʼєктів (дизайнер, прораби… — contacts.linked), — через GET /api/admin/projects і /api/team/today,
// не тут. Клієнтам контакти не віддаються ніде. Таблиці — migrations/0013_partners.sql, 0015_contacts.sql (email, rating, client_id, contact_links).
// GET   ?type=&status=&city=&q=&tag=&rating=<1–5, не нижче>&format=csv — список (до 2000, нові зверху за last_seen)
//       таблиця (CRM v4, 20.11.2026): &sort=name|company|spec|type|city|phone|tg|email|rating|status|last_touch|links|open_tasks&dir=asc|desc
//       &limit=<1…2000>&offset=&archived=1 (лише архів)&ver=1 (версія в кожному рядку — для правки клітинки)&facets=1 (міста й спеціалізації
//       для фільтрів) → rows[] + n_projects, n_leads, open_tasks, last_touch; total, more, type_counts (без архіву), archived_count.
//       Без права clients.contacts телефон, Telegram і пошта не віддаються ні в рядках, ні в CSV. CSV — усе за фільтром (до 20 000), UTF-8 з BOM.
// GET   ?id=<id> — картка: + links (обʼєкти й заявки, привʼязані явно) і leads (заявки з тим самим телефоном / Telegram)
// GET   ?find=<текст> — до 20 контактів для швидкого вибору (картка обʼєкта: «Привʼязати контакт»)
// POST  {name, company, type, city, tg, phone, email, site, tags, notes, status, rating} — додати (той самий контакт/компанія → 409 з id)
// POST  {action: 'link', contact_id, project_id | order_id, role?, note?} — привʼязати до обʼєкта або заявки (повтор — оновлює роль)
// PATCH {id, ver?, …поля} — змінити (контакт іншого запису → 409); ver — версія картки з GET ?id= (functions/_ver.js): картку відтоді
//       змінив інший менеджер → 409 {conflict: true, partner} без змін
// PATCH {id, archived: true|false} — в архів / з архіву (міграція 0018; архівні не показуються в списку й пошуку, звʼязки лишаються)
// PATCH {bulk: {ids: [до 100], type | city | archive: true|false}} — масова дія → {changed, skipped}; до 60 на годину
// POST  {action: 'import', rows: [до 100 рядків {name, company, type, city, phone, tg, email, site, tags, notes, status, rating}], type?, dry?}
//       — імпорт з CSV порціями: dry — лише перевірка (попередній перегляд), інакше запис. Дублі за телефоном / Telegram / поштою / сайтом /
//       компанією (та сама findPartner, і в базі, і в межах порції) пропускаються → results: [{i, status: 'new'|'dup'|'error', id?, error?}];
//       до 120 порцій на годину. Лише partners.base (власник і менеджер).
// Записи (POST / PATCH / DELETE) — до 600 на годину на працівника (functions/_rate.js), далі 429.
// DELETE ?link=<id> — відвʼязати
import { bad, dict, json, readJSON } from '../../_lib.js';
import { Invalid, PARTNER_STATUSES, PARTNER_TYPES, findPartner, hasArchive, hasEmail, hideContacts, partnerInput, partnersCsv, shapePartner, statusKey, text, typeKey } from '../../_partners.js';
import { audit, diff, need, noTable } from '../../_roles.js';
import { TOO_MANY, staffLimited } from '../../_rate.js';
import { conflict, contactVer, lastChange } from '../../_ver.js';
import { tasksReady } from '../../_tasks.js';

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
  const shape = r => (x.can('clients.contacts') ? r : hideContacts(r));
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
      return json({ partner: shape({ ...shapePartner(r), ver: await contactVer(r) }), links, leads, types: PARTNER_TYPES, statuses: PARTNER_STATUSES });
    }
    if (p('find')) {
      const q = p('find').replace(/^@/, '');
      const cols = ['name', 'company', 'tg', 'phone', 'tags', 'city'];
      const live = await hasArchive(env) ? ' AND archived_at IS NULL' : '';
      const { results } = await env.DB.prepare(`SELECT * FROM partners WHERE (${cols.map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})${live} ORDER BY CASE status WHEN 'working' THEN 0 ELSE 1 END, last_seen DESC LIMIT 20`)
        .bind(...cols.map(() => like(q))).all();
      return json({ rows: results.map(shapePartner).map(shape) });
    }
    const csv = p('format') === 'csv';
    if (csv && !x.can('export')) return bad('Немає права на експорт', 403);
    const ready = await hasEmail(env), arch = await hasArchive(env), tasks = ready && await tasksReady(env);
    // скільки обʼєктів, заявок і відкритих задач у контакту та остання взаємодія — підзапитами (без списків id: D1 приймає до 100 параметрів)
    const nP = ready ? '(SELECT COUNT(l.project_id) FROM contact_links l WHERE l.contact_id = p.id)' : '0';
    const nO = ready ? '(SELECT COUNT(l.order_id) FROM contact_links l WHERE l.contact_id = p.id)' : '0';
    const nT = tasks ? "(SELECT COUNT(*) FROM tasks t WHERE t.contact_id = p.id AND t.status = 'open')" : '0';
    const touch = `MAX(COALESCE(p.updated_at, ''), COALESCE(p.last_seen, '')${ready ? ", COALESCE((SELECT MAX(l.created_at) FROM contact_links l WHERE l.contact_id = p.id), '')" : ''}${tasks ? ", COALESCE((SELECT MAX(t.updated_at) FROM tasks t WHERE t.contact_id = p.id), '')" : ''})`;
    let where = ' WHERE 1=1';
    const args = [];
    if (arch) where += p('archived') === '1' ? ' AND p.archived_at IS NOT NULL' : ' AND p.archived_at IS NULL';
    else if (p('archived') === '1') where += ' AND 0=1';
    const live = where; // лічильники вкладок типів: без архіву, без інших фільтрів
    if (PARTNER_TYPES[p('type')]) { where += ' AND p.type = ?'; args.push(p('type')); }
    if (PARTNER_STATUSES[p('status')]) { where += ' AND p.status = ?'; args.push(p('status')); }
    if (p('city')) { where += " AND p.city LIKE ? ESCAPE '\\'"; args.push(like(p('city'))); }
    if (p('tag')) { where += " AND p.tags LIKE ? ESCAPE '\\'"; args.push(like('"' + p('tag').toLowerCase() + '"')); }
    if (/^[1-5]$/.test(p('rating'))) { where += ' AND p.rating >= ?'; args.push(+p('rating')); }
    if (p('q')) {
      const q = p('q').replace(/^@/, '');
      const cols = ['name', 'company', 'city', 'tg', 'phone', 'site', 'source_name', 'tags', 'notes'].concat(ready ? ['email'] : []);
      where += ' AND (' + cols.map(c => `p.${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')';
      for (const _ of cols) args.push(like(q));
    }
    // сортування — лише з цього списку (у SQL потрапляє вираз звідси, не текст запиту); порожні значення — в кінці
    const SORT = dict({ name: "COALESCE(NULLIF(p.name, ''), p.company)", company: 'p.company', spec: "NULLIF(p.tags, '[]')", type: 'p.type', city: 'p.city', phone: 'p.phone', tg: 'p.tg',
      ...(ready ? { email: 'p.email', rating: 'p.rating' } : {}), status: 'p.status', last_touch: 'last_touch', links: 'n_links', open_tasks: 'open_tasks' });
    const se = SORT[p('sort')], dir = p('dir') === 'desc' ? 'DESC' : 'ASC';
    const order = se ? ` ORDER BY (${se} IS NULL OR ${se} = '' OR ${se} = 0), ${se} COLLATE NOCASE ${dir}, p.id DESC` : ' ORDER BY p.last_seen DESC, p.id DESC';
    const limit = csv ? 20000 : Math.min(2000, Math.max(1, +p('limit') || 2000)), offset = csv ? 0 : Math.max(0, +p('offset') || 0);
    const { results } = await env.DB.prepare(`SELECT p.*, ${nP} AS n_projects, ${nO} AS n_leads, ${nP} + ${nO} AS n_links, ${nT} AS open_tasks, ${touch} AS last_touch FROM partners p${where}${order} LIMIT ? OFFSET ?`)
      .bind(...args, limit + 1, offset).all();
    const more = results.length > limit, page = results.slice(0, limit);
    if (csv) {
      await audit(env, request, x, 'pbase.export', 'partners', null, null, { rows: page.length, query: u.search.slice(0, 400) });
      return new Response(partnersCsv(x.can('clients.contacts') ? page : page.map(hideContacts)), { headers: {
        'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="cas-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      } });
    }
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM partners p${where}`).bind(...args).first()).n;
    const { results: cnt } = await env.DB.prepare(`SELECT p.status, COUNT(*) AS n FROM partners p${live} GROUP BY p.status`).all();
    const { results: tcnt } = await env.DB.prepare(`SELECT p.type, COUNT(*) AS n FROM partners p${live} GROUP BY p.type`).all();
    const out = { types: PARTNER_TYPES, statuses: PARTNER_STATUSES, ready, archive: arch, tasks_ready: tasks, total, more,
      counts: Object.fromEntries(cnt.map(c => [c.status, c.n])), type_counts: Object.fromEntries(tcnt.map(c => [c.type, c.n])),
      archived_count: arch ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM partners WHERE archived_at IS NOT NULL').first()).n : 0 };
    const withVer = p('ver') === '1';
    out.rows = [];
    for (const r of page) {
      const { n_links, ...row } = r;
      out.rows.push(shape({ ...shapePartner(row), ...(withVer ? { ver: await contactVer(r) } : {}) }));
    }
    if (p('facets') === '1') { // значення для фільтрів таблиці: міста й спеціалізації (теги), найчастіші зверху
      out.cities = (await env.DB.prepare(`SELECT p.city AS v, COUNT(*) AS n FROM partners p${live} AND p.city IS NOT NULL AND p.city != '' GROUP BY p.city ORDER BY n DESC, v LIMIT 80`).all()).results;
      out.tags = (await env.DB.prepare(`SELECT j.value AS v, COUNT(*) AS n FROM partners p, json_each(p.tags) j${live} GROUP BY j.value ORDER BY n DESC, v LIMIT 80`).all()).results;
    }
    return json(out);
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

// Імпорт з CSV: порція до 100 рядків. Кожен рядок — ті самі перевірки, що й ручне додавання (телефон → +380…, @username, пошта, сайт,
// HTML не приймаємо). Дубль — той самий контакт уже є в базі (і в архіві) або вище в цій же порції. dry — нічого не пишемо.
const IMPORT_MAX = 100;
async function importRows(env, request, x, d) {
  const rows = Array.isArray(d.rows) ? d.rows : null;
  if (!rows || !rows.length || rows.length > IMPORT_MAX) return bad(`rows: від 1 до ${IMPORT_MAX} рядків у порції`);
  const defType = typeKey(d.type) || 'other', dry = !!d.dry, ready = await hasEmail(env);
  const seen = new Map(), results = [];
  let created = 0, dups = 0, errors = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Invalid('Очікуємо рядок-обʼєкт');
      const p = partnerInput({ ...row, type: typeKey(row.type) || defType, source_name: undefined, source_url: undefined, source: undefined, contacts: undefined });
      const e2 = extra({ status: statusKey(row.status) || undefined, notes: row.notes, ...(row.rating == null || row.rating === '' ? {} : { rating: Number(row.rating) }) });
      if (!ready) { p.email = null; e2.rating = undefined; }
      const keys = [['tg', p.tg], ['phone', p.phone], ['email', p.email], ['site', p.site_key], ['company', p.company_key]].filter(k => k[1]).map(k => k.join(':'));
      const inFile = keys.find(k => seen.has(k));
      if (inFile) { dups++; results.push({ i, status: 'dup', where: 'file', row: seen.get(inFile) }); continue; }
      const dup = await findPartner(env, p);
      if (dup) { dups++; for (const k of keys) seen.set(k, i); results.push({ i, status: 'dup', where: dup.archived_at ? 'archive' : 'base', id: dup.id, name: dup.name || dup.company || null }); continue; }
      for (const k of keys) seen.set(k, i);
      if (dry) { created++; results.push({ i, status: 'new' }); continue; }
      const r = await env.DB.prepare(`INSERT INTO partners (name, company, type, city, tg, phone, site, tags, notes, status, company_key, site_key, source_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'імпорт CSV')`)
        .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, JSON.stringify(p.tags), e2.notes ?? null, e2.status || 'new', p.company_key, p.site_key).run();
      if (ready) await env.DB.prepare('UPDATE partners SET email = ?, rating = ? WHERE id = ?').bind(p.email, e2.rating ?? null, r.meta.last_row_id).run();
      created++; results.push({ i, status: 'new', id: r.meta.last_row_id });
    } catch (e) {
      if (!(e instanceof Invalid)) throw e;
      errors++; results.push({ i, status: 'error', error: e.message });
    }
  }
  if (!dry) await audit(env, request, x, 'pbase.import', 'partners', null, null, { rows: rows.length, created, dups, errors });
  return json({ ok: true, dry, created, dups, errors, results });
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 62 * 1024); } catch { return bad('Некоректні дані'); }
  if (await staffLimited(env, request, x, d && d.action === 'import' ? 'import' : 'contacts')) return bad(TOO_MANY, 429);
  try {
    if (d && d.action === 'link') return await link(env, request, x, d);
    if (d && d.action === 'import') return await importRows(env, request, x, d);
    let p, e2;
    try { p = partnerInput(d); e2 = extra(d); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
    if ((p.email || e2.rating != null) && !await hasEmail(env)) return migrating();
    const dup = await findPartner(env, p);
    if (dup) return json({ error: 'Такий контакт уже є' + (dup.archived_at ? ' в архіві' : '') + ' (той самий телефон, Telegram, пошта, сайт або компанія)', id: dup.id, archived: !!dup.archived_at }, 409);
    const r = await env.DB.prepare(`INSERT INTO partners (name, company, type, city, tg, phone, site, tags, notes, status, company_key, site_key, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'вручну')`)
      .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, JSON.stringify(p.tags), e2.notes ?? null, e2.status || 'new', p.company_key, p.site_key).run();
    const id = r.meta.last_row_id;
    if (await hasEmail(env)) await env.DB.prepare('UPDATE partners SET email = ?, rating = ? WHERE id = ?').bind(p.email, e2.rating ?? null, id).run();
    await audit(env, request, x, 'pbase.create', 'partners', id, null, { name: p.name, company: p.company, type: p.type });
    return json({ ok: true, id });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}

// В архів / з архіву: запис і звʼязки лишаються, контакт зникає зі списку, пошуку й вибору в картці обʼєкта
async function setArchived(env, request, x, o, on) {
  if (!!o.archived_at === on) return false;
  await env.DB.prepare(`UPDATE partners SET archived_at = ${on ? "datetime('now')" : 'NULL'}, updated_at = datetime('now') WHERE id = ?`).bind(o.id).run();
  await audit(env, request, x, on ? 'pbase.archive' : 'pbase.restore', 'partners', o.id, { archived_at: o.archived_at ?? null }, { name: o.name, company: o.company });
  return true;
}
// Масова дія над вибраними рядками таблиці: тип, місто або архів. Кожен змінений контакт — окремий запис аудиту.
const BULK_MAX = 100;
async function bulk(env, request, x, b) {
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number))] : [];
  if (!ids.length || ids.length > BULK_MAX || ids.some(n => !Number.isInteger(n) || n <= 0)) return bad(`ids: від 1 до ${BULK_MAX} контактів`);
  const act = ['type', 'city', 'archive'].filter(k => has(b, k));
  if (act.length !== 1) return bad('Одна дія: type | city | archive');
  let v;
  if (act[0] === 'type') { v = String(b.type || ''); if (!PARTNER_TYPES[v]) return bad('type: ' + Object.keys(PARTNER_TYPES).join(' | ')); }
  else if (act[0] === 'city') { try { v = text(b.city, 120, 'city'); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; } }
  else if (!await hasArchive(env)) return migrating();
  let changed = 0, skipped = 0;
  for (const id of ids) {
    const o = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(id).first();
    if (!o) { skipped++; continue; }
    if (act[0] === 'archive') { if (await setArchived(env, request, x, o, !!b.archive)) changed++; else skipped++; continue; }
    if ((o[act[0]] ?? null) === v) { skipped++; continue; }
    await env.DB.prepare(`UPDATE partners SET ${act[0] === 'type' ? 'type' : 'city'} = ?, updated_at = datetime('now') WHERE id = ?`).bind(v, id).run();
    await audit(env, request, x, 'pbase.update', 'partners', id, { [act[0]]: o[act[0]] ?? null }, { [act[0]]: v });
    changed++;
  }
  await audit(env, request, x, 'pbase.bulk', 'partners', null, null, { action: act[0], value: act[0] === 'archive' ? !!b.archive : v, ids: ids.length, changed, skipped });
  return json({ ok: true, changed, skipped });
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  if (await staffLimited(env, request, x, d && d.bulk ? 'bulk' : 'contacts')) return bad(TOO_MANY, 429);
  try {
    if (d && d.bulk && typeof d.bulk === 'object') return await bulk(env, request, x, d.bulk);
    const o = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(Number(d && d.id) || 0).first();
    if (!o) return bad('Контакт не знайдено', 404);
    if (has(d, 'archived') && Object.keys(d).every(k => ['id', 'archived'].includes(k))) {
      if (!await hasArchive(env)) return migrating();
      await setArchived(env, request, x, o, !!d.archived);
      return json({ ok: true, archived: !!d.archived });
    }
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
