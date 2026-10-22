// Вхід через Google (Google Identity Services): перевіряємо ID-токен у Google і збіг client_id.
import { bad, json, publicClient, readJSON, sessionCookie, upsertClient } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) return bad('Вхід через Google ще не налаштовано', 503);
  let d;
  try { d = await readJSON(request); } catch { return bad('Некоректні дані'); }
  if (!d.credential) return bad('Немає токена Google');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(d.credential));
  if (!r.ok) return bad('Google не підтвердив вхід', 401);
  const t = await r.json();
  if (t.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) return bad('Токен не для цього сайту', 401);
  if (Number(t.exp) < Date.now() / 1000) return bad('Токен Google застарів', 401);
  if (t.email_verified !== 'true' && t.email_verified !== true) return bad('Пошта Google не підтверджена', 401);
  const c = await upsertClient(env, { provider: 'google', provider_id: t.sub, name: t.name, email: t.email, photo: t.picture });
  return json({ ok: true, client: publicClient(c, env) }, 200, { 'set-cookie': await sessionCookie(env, c.id) });
}
