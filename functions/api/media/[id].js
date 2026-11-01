// Приватне фото з обʼєкта (migrations/0010 media): віддаємо лише клієнту-власнику проєкту або працівнику, що бачить обʼєкт.
// Чужим — 404 (не підтверджуємо, що фото існує). Кеш лише приватний.
import { bad } from '../../_lib.js';
import { canSeeProject, noTable, staffCtx } from '../../_roles.js';

export async function onRequestGet({ request, env, params }) {
  const id = String(params.id || '');
  if (!/^[0-9a-f]{24}$/.test(id)) return bad('Не знайдено', 404);
  const x = await staffCtx(request, env);
  if (!x.client) return bad('Потрібно увійти', 401);
  let m;
  try { m = await env.DB.prepare('SELECT m.*, p.client_id FROM media m JOIN projects p ON p.id = m.project_id WHERE m.id = ?').bind(id).first(); }
  catch (e) { if (noTable(e)) return bad('Не знайдено', 404); throw e; }
  if (!m) return bad('Не знайдено', 404);
  const ok = m.client_id === x.client.id || (x.role && await canSeeProject(env, x, m.project_id));
  if (!ok) return bad('Не знайдено', 404);
  let body = m.data;
  if (m.r2_key && env.MEDIA) { const o = await env.MEDIA.get(m.r2_key); if (!o) return bad('Не знайдено', 404); body = o.body; }
  if (body == null) return bad('Не знайдено', 404);
  if (body instanceof ArrayBuffer === false && Array.isArray(body)) body = new Uint8Array(body);
  return new Response(body, { headers: { 'content-type': m.mime, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; img-src 'self'; sandbox" } });
}
