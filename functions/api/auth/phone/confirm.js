// Вхід за номером телефону, крок 2: викликає Telegram-бот, коли клієнт поділився контактом.
// Автентифікація: X-Bot-Signature = hex(HMAC-SHA256(sha256(TELEGRAM_BOT_TOKEN), token|phone|tg_id)).
import { bad, botSignature, json, normalizePhone, readJSON, same, str, upsertClient } from '../../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN) return bad('Вхід за номером ще не налаштовано', 503);
  let d;
  try { d = await readJSON(request, 4096); } catch { return bad('Некоректні дані'); }
  const token = String(d.token ?? ''), rawPhone = String(d.phone ?? ''), tgId = String(d.tg_id ?? '');
  if (!/^[0-9a-f]{32}$/.test(token) || !/^\d{1,20}$/.test(tgId) || !rawPhone) return bad('Некоректні дані');
  const sig = (request.headers.get('x-bot-signature') || '').toLowerCase();
  if (!same(sig, await botSignature(env, token, rawPhone, tgId))) return bad('Підпис бота не збігся', 401);

  const req = await env.DB.prepare('SELECT * FROM login_requests WHERE token = ?').bind(token).first();
  if (!req) return bad('Запит на вхід не знайдено', 404);
  const now = Math.floor(Date.now() / 1000);
  if (req.status === 'pending' && req.expires_at < now) {
    await env.DB.prepare("UPDATE login_requests SET status = 'expired' WHERE token = ? AND status = 'pending'").bind(token).run();
    return bad('Час на підтвердження минув — почніть вхід на сайті ще раз', 410);
  }
  if (req.status === 'expired') return bad('Час на підтвердження минув — почніть вхід на сайті ще раз', 410);
  if (req.status !== 'pending') return bad('Цей вхід уже підтверджено', 409);

  const phone = normalizePhone(rawPhone);
  if (!phone || phone !== req.phone) return bad('Номер не збігається з тим, що введено на сайті', 409);

  // клієнт, який уже входив через Telegram-віджет з цим акаунтом, — привʼязуємо телефон до нього
  let c = await env.DB.prepare("SELECT * FROM clients WHERE provider = 'telegram' AND provider_id = ?").bind(tgId).first();
  if (!c) c = await upsertClient(env, { provider: 'phone', provider_id: phone, name: str(d.name, 120), username: str(d.username, 64) });
  await env.DB.prepare('UPDATE clients SET phone = ? WHERE id = ?').bind(phone, c.id).run();

  const u = await env.DB.prepare(`UPDATE login_requests SET status = 'confirmed', client_id = ?, tg_id = ?
      WHERE token = ? AND status = 'pending'`).bind(c.id, tgId, token).run();
  if (!u.meta.changes) return bad('Цей вхід уже підтверджено', 409);
  return json({ ok: true });
}
