// База клієнтів — право clients.view (functions/_roles.js).
// GET ?q=     — список з кількістю й сумою замовлень (сума — лише з finance.view, контакти — з clients.contacts)
// GET ?id=N   — картка клієнта з усією історією: заявки й замовлення (за client_id або тим самим телефоном), події статусів,
//               проєкти з етапами, платежі (finance.view), документи, проблеми на обʼєктах, журнал аудиту (audit.view)
import { bad, json, statusLabel } from '../../_lib.js';
import { need, noTable, shapeOrder, shapeProject } from '../../_roles.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const soft = async (p, d) => { try { return await p; } catch (e) { if (noTable(e)) return d; throw e; } };

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, 'clients.view');
  if (error) return error;
  const u = new URL(request.url), q = (u.searchParams.get('q') || '').trim(), id = Number(u.searchParams.get('id')) || 0;
  const contacts = x.can('clients.contacts'), money = x.can('finance.view');
  if (id) return card(env, x, id);
  const cols = ['c.name', 'c.username'].concat(contacts ? ['c.phone', 'c.email'] : []);
  const where = q ? 'WHERE ' + cols.map(c => c + ' LIKE ?1').join(' OR ') : '';
  const st = env.DB.prepare(`SELECT c.id, c.provider, c.name, c.username, c.email, c.phone, c.city, c.company, c.created_at, c.last_login,
      COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS total
    FROM clients c LEFT JOIN orders o ON o.client_id = c.id ${where} GROUP BY c.id ORDER BY c.id DESC LIMIT 500`);
  const { results } = await (q ? st.bind(`%${q}%`) : st).all();
  return json({ clients: results.map(c => ({ ...c, ...(contacts ? {} : { email: undefined, phone: undefined, username: undefined, company: undefined }), ...(money ? {} : { total: undefined }) })) });
}

async function card(env, x, id) {
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!c) return bad('Клієнта не знайдено', 404);
  const contacts = x.can('clients.contacts'), money = x.can('finance.view');
  const client = {
    id: c.id, provider: c.provider, name: c.name, city: c.city, created_at: c.created_at, last_login: c.last_login,
    ...(contacts ? { phone: c.phone, email: c.email, username: c.username, company: c.company } : {}),
  };
  const conds = ['o.client_id = ?'], args = [c.id];
  if (c.phone) { conds.push('o.phone = ?'); args.push(c.phone); }
  const scope = [];
  if (x.can('leads.view_all')) scope.push("o.kind = 'lead'");
  if (x.can('orders.view')) scope.push("o.kind = 'order'");
  const O = scope.length ? (await env.DB.prepare(`SELECT o.* FROM orders o WHERE (${conds.join(' OR ')}) AND (${scope.join(' OR ')}) ORDER BY o.id DESC LIMIT 200`).bind(...args).all()).results : [];
  const oids = O.map(o => o.id);
  const E = oids.length ? (await env.DB.prepare(`SELECT order_id, status, note, author, created_at FROM order_events WHERE order_id IN (${oids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 500`).bind(...oids).all()).results : [];
  const kindOf = new Map(O.map(o => [o.id, o.kind]));
  const P = x.can('projects.view_all') ? (await soft(env.DB.prepare('SELECT * FROM projects WHERE client_id = ? ORDER BY id DESC LIMIT 50').bind(c.id).all(), { results: [] })).results : [];
  const pids = P.map(p => p.id), pq = pids.map(() => '?').join(',');
  const PAY = money && pids.length ? (await soft(env.DB.prepare(`SELECT * FROM project_payments WHERE project_id IN (${pq}) ORDER BY sort, id`).bind(...pids).all(), { results: [] })).results : [];
  const ISS = pids.length ? (await soft(env.DB.prepare(`SELECT * FROM project_issues WHERE project_id IN (${pq}) ORDER BY id DESC LIMIT 100`).bind(...pids).all(), { results: [] })).results : [];
  const D = (await soft(env.DB.prepare('SELECT id, project_id, order_id, kind, title, url, created_at FROM documents WHERE client_id = ? ORDER BY id DESC LIMIT 100').bind(c.id).all(), { results: [] })).results;
  let AUD = [];
  if (x.can('audit.view')) {
    const keys = [...oids.map(i => ['orders', String(i)]), ...pids.map(i => ['projects', String(i)])];
    if (keys.length) AUD = (await soft(env.DB.prepare(`SELECT id, at, actor, role, action, entity, entity_id, before, after FROM audit_log WHERE ${keys.map(() => '(entity = ? AND entity_id = ?)').join(' OR ')} ORDER BY id DESC LIMIT 200`)
      .bind(...keys.flat()).all(), { results: [] })).results;
  }
  return json({
    client,
    orders: O.map(o => shapeOrder({ ...o, items: parse(o.items, []), status_label: statusLabel(o.status, o.kind) }, x)),
    events: E.map(e => ({ ...e, label: statusLabel(e.status, kindOf.get(e.order_id)) })),
    projects: P.map(p => shapeProject({ ...p, stages: parse(p.stages, []), payments: PAY.filter(y => y.project_id === p.id) }, x)),
    issues: ISS, documents: D, audit: AUD,
  });
}
