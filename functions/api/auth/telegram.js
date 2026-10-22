// Вхід через Telegram Login Widget: перевірка підпису за https://core.telegram.org/widgets/login#checking-authorization
import { bad, hmac, json, publicClient, readJSON, same, sessionCookie, sha256, upsertClient } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN) return bad('Вхід через Telegram ще не налаштовано', 503);
  let d;
  try { d = await readJSON(request); } catch { return bad('Некоректні дані'); }
  const { hash, ...fields } = d || {};
  if (!hash || !fields.id || !fields.auth_date) return bad('Некоректні дані');
  const check = Object.keys(fields).filter(k => fields[k] != null).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const expected = await hmac(await sha256(env.TELEGRAM_BOT_TOKEN), check);
  if (!same(expected, String(hash))) return bad('Підпис Telegram не збігся', 401);
  if (Date.now() / 1000 - Number(fields.auth_date) > 86400) return bad('Сесія Telegram застаріла, увійдіть ще раз', 401);
  const name = [fields.first_name, fields.last_name].filter(Boolean).join(' ');
  const c = await upsertClient(env, { provider: 'telegram', provider_id: fields.id, name, username: fields.username, photo: fields.photo_url });
  return json({ ok: true, client: publicClient(c, env) }, 200, { 'set-cookie': await sessionCookie(env, c.id) });
}
