// Обране клієнта (id товарів Оздоби).
// GET    /api/account/favorites         → {ids: [..]}
// POST   /api/account/favorites {id}    — додати;  {ids: [..]} — злити з локальним обраним браузера (до 300)
// DELETE /api/account/favorites?id=N   — прибрати
import { body, client, int, json, bad, noTable, notReady } from '../../_account.js';

const MAX = 300;
const list = async (env, c) => (await env.DB.prepare('SELECT item_id FROM favorites WHERE client_id = ? ORDER BY created_at DESC LIMIT ?').bind(c.id, MAX).all()).results.map(r => r.item_id);
const okId = v => { const n = int(v); return n && n > 0 && n < 1e7 ? n : null; };

export async function onRequestGet({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  try { return json({ ids: await list(env, c) }); } catch (e) { if (noTable(e)) return json({ ids: [], pending: true }); throw e; }
}

export async function onRequestPost({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 8 * 1024);
  if (e1) return e1;
  const ids = (Array.isArray(d.ids) ? d.ids : [d.id]).map(okId).filter(Boolean).slice(0, MAX);
  if (!ids.length) return bad('Немає товару');
  try {
    const have = (await env.DB.prepare('SELECT COUNT(*) AS n FROM favorites WHERE client_id = ?').bind(c.id).first()).n;
    const room = Math.max(0, MAX - have);
    if (!room) return bad(`В обраному до ${MAX} товарів`, 409);
    await env.DB.batch(ids.slice(0, room).map(id => env.DB.prepare('INSERT OR IGNORE INTO favorites (client_id, item_id) VALUES (?, ?)').bind(c.id, id)));
    return json({ ids: await list(env, c) });
  } catch (e) { if (noTable(e)) return notReady(); throw e; }
}

export async function onRequestDelete({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const id = okId(new URL(request.url).searchParams.get('id'));
  if (!id) return bad('Немає товару');
  try {
    await env.DB.prepare('DELETE FROM favorites WHERE client_id = ? AND item_id = ?').bind(c.id, id).run();
    return json({ ids: await list(env, c) });
  } catch (e) { if (noTable(e)) return notReady(); throw e; }
}
