// Профіль клієнта: GET — хто увійшов (+ роль працівника й «дім» — куди вести після входу); PATCH — телефон, імʼя, доставка, реквізити компанії.
// client.staff = {role, role_label, perms, home, panel} — лише для активного працівника (functions/_roles.js); клієнту — null.
// client.admin лишається для сумісності зі старими сторінками: true = доступ до /kabinet/admin (panel.admin).
import { bad, currentClient, json, publicClient, readJSON, str } from '../_lib.js';
import { ROLES, staffCtx } from '../_roles.js';

async function view(request, env) {
  const x = await staffCtx(request, env);
  if (!x.client) return null;
  const c = publicClient(x.client, env);
  c.admin = x.can('panel.admin');
  c.home = x.role ? ROLES[x.role].home : '/kabinet';
  c.staff = x.role ? { id: x.staffId, name: x.name, role: x.role, role_label: ROLES[x.role].label, perms: [...x.perms], home: c.home, panel: x.can('panel.admin'), owner: x.owner } : null;
  if (x.deactivated) c.staff_disabled = true;
  return c;
}

export async function onRequestGet({ request, env }) {
  return json({ client: await view(request, env) });
}

export async function onRequestPatch({ request, env }) {
  const c = await currentClient(request, env);
  if (!c) return bad('Потрібно увійти', 401);
  let d;
  try { d = await readJSON(request); } catch { return bad('Некоректні дані'); }
  const phone = d.phone != null ? String(d.phone).replace(/[^\d+]/g, '').slice(0, 16) : c.phone;
  await env.DB.prepare('UPDATE clients SET name = ?, phone = ?, city = ?, company = ? WHERE id = ?')
    .bind(str(d.name, 120) ?? c.name, phone || null, str(d.city, 200) ?? c.city, str(d.company, 200) ?? c.company, c.id).run();
  const n = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(c.id).first();
  return json({ client: publicClient(n, env) });
}
