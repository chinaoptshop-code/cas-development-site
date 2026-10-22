// Профіль клієнта: GET — хто увійшов; PATCH — телефон, імʼя, доставка, реквізити компанії.
import { bad, currentClient, json, publicClient, readJSON, str } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const c = await currentClient(request, env);
  return json({ client: publicClient(c, env) });
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
