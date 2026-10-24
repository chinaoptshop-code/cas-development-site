// Вхід за номером телефону, крок 1: створюємо запит на вхід і віддаємо посилання на Telegram-бота,
// де клієнт підтверджує номер кнопкою «Поділитися номером» (протокол — tools/shop/PHONE_LOGIN.md).
import { bad, clientIp, hexOf, json, normalizePhone, plCookie, readJSON, sha256 } from '../../../_lib.js';

const TTL = 600;          // 10 хв на підтвердження
const LIMIT = 5;          // запитів на годину на телефон і на IP

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_BOT_USERNAME) return bad('Вхід за номером ще не налаштовано', 503);
  let d;
  try { d = await readJSON(request, 4096); } catch { return bad('Некоректні дані'); }
  const phone = normalizePhone(d && d.phone);
  if (!phone) return bad('Перевірте номер: формат 0XX XXX XX XX або +380XXXXXXXXX');

  const now = Math.floor(Date.now() / 1000);
  const ipHash = hexOf(await sha256('ip:' + clientIp(request)));
  // прибираємо старі запити (не частіше, ніж їх створюють) — для rate-limit потрібна лише остання година
  await env.DB.prepare('DELETE FROM login_requests WHERE created_at < ?').bind(now - 86400).run();
  const r = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM login_requests WHERE phone = ?1 AND created_at > ?3) AS byPhone,
      (SELECT COUNT(*) FROM login_requests WHERE ip_hash = ?2 AND created_at > ?3) AS byIp`)
    .bind(phone, ipHash, now - 3600).first();
  if (r.byPhone >= LIMIT || r.byIp >= LIMIT) return bad('Забагато спроб входу. Спробуйте через годину або увійдіть через Telegram чи Google.', 429);

  const token = crypto.randomUUID().replace(/-/g, '');
  const secret = hexOf(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare(`INSERT INTO login_requests (token, phone, browser_hash, ip_hash, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(token, phone, hexOf(await sha256(secret)), ipHash, now, now + TTL).run();

  return json({
    token,
    botUrl: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=login_${token}`,
    expiresIn: TTL,
    sms: false, // TODO(SMS): див. functions/_sms.js
  }, 200, { 'set-cookie': plCookie(secret, TTL) });
}
