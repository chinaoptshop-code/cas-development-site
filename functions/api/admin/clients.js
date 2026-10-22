// База клієнтів для менеджера: список з кількістю й сумою замовлень.
import { bad, currentClient, isAdmin, json } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  if (!isAdmin(env, await currentClient(request, env))) return bad('Немає доступу', 403);
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  const where = q ? 'WHERE c.name LIKE ?1 OR c.phone LIKE ?1 OR c.email LIKE ?1 OR c.username LIKE ?1' : '';
  const st = env.DB.prepare(`SELECT c.id, c.provider, c.name, c.username, c.email, c.phone, c.city, c.company, c.created_at, c.last_login,
      COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS total
    FROM clients c LEFT JOIN orders o ON o.client_id = c.id ${where} GROUP BY c.id ORDER BY c.id DESC LIMIT 500`);
  const { results } = await (q ? st.bind(`%${q}%`) : st).all();
  return json({ clients: results });
}
