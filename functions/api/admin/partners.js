// «Партнери» в /kabinet/admin — база підрядників, бригад, постачальників, ріелторів, будівельних компаній і дизайнерів,
// яких бот пошуку відсіяв як «не клієнт» (POST /api/bot/partners) або додали вручну. Право partners.base (власник і менеджер,
// functions/_roles.js); CSV — ще й export. Кожна зміна й експорт — у audit_log. Таблиця — migrations/0013_partners.sql.
// GET   ?type=&status=&city=&q=&tag=&format=csv — список (до 2000, нові зверху за last_seen); ?id=<id> — картка
// POST  {name, company, type, city, tg, phone, site, tags, notes, status} — додати вручну (той самий контакт/компанія → 409 з id)
// PATCH {id, name, company, type, city, tg, phone, site, tags, notes, status} — змінити (контакт іншого партнера → 409)
import { bad, json, readJSON } from '../../_lib.js';
import { Invalid, PARTNER_STATUSES, PARTNER_TYPES, findPartner, partnerInput, partnersCsv, shapePartner, text } from '../../_partners.js';
import { audit, diff, need, noTable } from '../../_roles.js';

const FIELDS = ['name', 'company', 'type', 'city', 'tg', 'phone', 'site', 'tags', 'notes', 'status'];
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
const like = s => '%' + String(s).slice(0, 80).replace(/[\\%_]/g, c => '\\' + c) + '%';
const migrating = () => bad('Розділ «Партнери» оновлюється (міграція 0013) — спробуйте за кілька хвилин', 503);

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  const u = new URL(request.url), p = k => (u.searchParams.get(k) || '').trim();
  try {
    if (p('id')) {
      const r = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(+p('id') || 0).first();
      return r ? json({ partner: shapePartner(r) }) : bad('Партнера не знайдено', 404);
    }
    const csv = p('format') === 'csv';
    if (csv && !x.can('export')) return bad('Немає права на експорт', 403);
    let sql = 'SELECT * FROM partners WHERE 1=1';
    const args = [];
    if (PARTNER_TYPES[p('type')]) { sql += ' AND type = ?'; args.push(p('type')); }
    if (PARTNER_STATUSES[p('status')]) { sql += ' AND status = ?'; args.push(p('status')); }
    if (p('city')) { sql += " AND city LIKE ? ESCAPE '\\'"; args.push(like(p('city'))); }
    if (p('tag')) { sql += " AND tags LIKE ? ESCAPE '\\'"; args.push(like('"' + p('tag').toLowerCase() + '"')); }
    if (p('q')) {
      const q = p('q').replace(/^@/, '');
      const cols = ['name', 'company', 'city', 'tg', 'phone', 'site', 'source_name', 'tags', 'notes'];
      sql += ' AND (' + cols.map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')';
      for (const _ of cols) args.push(like(q));
    }
    sql += ' ORDER BY last_seen DESC, id DESC LIMIT 2000';
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    if (csv) {
      await audit(env, request, x, 'pbase.export', 'partners', null, null, { rows: results.length, query: u.search.slice(0, 400) });
      return new Response(partnersCsv(results), { headers: {
        'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="cas-partners-${new Date().toISOString().slice(0, 10)}.csv"`,
      } });
    }
    const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM partners GROUP BY status').all();
    return json({ types: PARTNER_TYPES, statuses: PARTNER_STATUSES, rows: results.map(shapePartner), counts: Object.fromEntries(cnt.map(c => [c.status, c.n])) });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}

// поля менеджера поверх partnerInput: статус і нотатки
function extra(d) {
  const status = d.status == null || d.status === '' ? undefined : String(d.status);
  if (status !== undefined && !PARTNER_STATUSES[status]) throw new Invalid('status: ' + Object.keys(PARTNER_STATUSES).join(' | '));
  return { status, notes: has(d, 'notes') ? text(d.notes, 4000, 'notes', true) : undefined };
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  let p, e2;
  try { p = partnerInput(d); e2 = extra(d); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
  try {
    const dup = await findPartner(env, p);
    if (dup) return json({ error: 'Такий партнер уже є (той самий контакт або компанія)', id: dup.id }, 409);
    const r = await env.DB.prepare(`INSERT INTO partners (name, company, type, city, tg, phone, site, tags, notes, status, company_key, site_key, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'вручну')`)
      .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, JSON.stringify(p.tags), e2.notes ?? null, e2.status || 'new', p.company_key, p.site_key).run();
    const id = r.meta.last_row_id;
    await audit(env, request, x, 'pbase.create', 'partners', id, null, { name: p.name, company: p.company, type: p.type });
    return json({ ok: true, id });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, 'partners.base');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  try {
    const o = await env.DB.prepare('SELECT * FROM partners WHERE id = ?').bind(Number(d && d.id) || 0).first();
    if (!o) return bad('Партнера не знайдено', 404);
    // незмінені поля беремо з запису: PATCH {id, status} не вимагає повної картки
    const cur = { name: o.name, company: o.company, type: o.type, city: o.city, tg: o.tg, phone: o.phone, site: o.site, tags: JSON.parse(o.tags || '[]') };
    const merged = { ...cur }; for (const k of Object.keys(cur)) if (has(d, k)) merged[k] = d[k];
    let p, e2;
    try { p = partnerInput(merged); e2 = extra(d); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
    const dup = await findPartner(env, p, o.id);
    if (dup) return json({ error: 'Цей контакт або компанія вже є в іншого партнера', id: dup.id }, 409);
    const next = { ...p, tags: JSON.stringify(p.tags), notes: e2.notes === undefined ? o.notes : e2.notes, status: e2.status || o.status };
    await env.DB.prepare(`UPDATE partners SET name = ?, company = ?, type = ?, city = ?, tg = ?, phone = ?, site = ?, tags = ?, notes = ?, status = ?,
        company_key = ?, site_key = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(p.name, p.company, p.type, p.city, p.tg, p.phone, p.site, next.tags, next.notes, next.status, p.company_key, p.site_key, o.id).run();
    const dd = diff(o, next, FIELDS);
    if (dd) await audit(env, request, x, 'pbase.update', 'partners', o.id, dd.before, dd.after);
    return json({ ok: true, partner: shapePartner({ ...o, ...next }) });
  } catch (e) { if (noTable(e)) return migrating(); throw e; }
}
