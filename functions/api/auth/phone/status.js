// Вхід за номером телефону, крок 3: сторінка опитує статус кожні 2 с. Лише браузер з cookie cas_pl,
// який почав вхід, може забрати сесію; після цього запит одноразово переходить у 'used'.
import { PL_COOKIE, bad, hexOf, json, plCookie, publicClient, readCookie, same, sessionCookie, sha256 } from '../../../_lib.js';

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[0-9a-f]{32}$/.test(token)) return bad('Некоректний запит');
  const secret = readCookie(request, PL_COOKIE);
  if (!secret) return bad('Почніть вхід у цьому браузері ще раз', 403);
  const req = await env.DB.prepare('SELECT * FROM login_requests WHERE token = ?').bind(token).first();
  if (!req || !same(hexOf(await sha256(secret)), req.browser_hash)) return bad('Почніть вхід у цьому браузері ще раз', 403);

  const now = Math.floor(Date.now() / 1000);
  if (req.status === 'expired' || (req.status !== 'used' && req.expires_at < now)) {
    if (req.status !== 'expired') await env.DB.prepare("UPDATE login_requests SET status = 'expired' WHERE token = ? AND status IN ('pending','confirmed')").bind(token).run();
    return json({ status: 'expired' }, 200, { 'set-cookie': plCookie('', 0) });
  }
  if (req.status === 'pending') return json({ status: 'pending' });
  if (req.status === 'used') return json({ status: 'used' }, 200, { 'set-cookie': plCookie('', 0) });

  // confirmed → used (атомарно: сесію видаємо рівно один раз)
  const u = await env.DB.prepare("UPDATE login_requests SET status = 'used' WHERE token = ? AND status = 'confirmed'").bind(token).run();
  if (!u.meta.changes) return json({ status: 'used' });
  await env.DB.prepare("UPDATE clients SET last_login = datetime('now') WHERE id = ?").bind(req.client_id).run();
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(req.client_id).first();
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  h.append('set-cookie', await sessionCookie(env, c));
  h.append('set-cookie', plCookie('', 0));
  return new Response(JSON.stringify({ status: 'ok', client: publicClient(c, env) }), { headers: h });
}
