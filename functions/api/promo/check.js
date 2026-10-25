// Перевірка особистого коду партнера з кошика Оздоби: POST {code} → {ok, code, discount} або {ok:false, error}.
// Список кодів не розкривається; простий rate-limit — 20 перевірок на годину з одного IP.
import { clientIp, hexOf, json, partnerCode, readJSON, sha256 } from '../../_lib.js';

const LIMIT = 20;

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await readJSON(request, 1024); } catch { return json({ ok: false, error: 'Некоректні дані' }, 400); }
  const now = Math.floor(Date.now() / 1000);
  const ipHash = hexOf(await sha256('promo:' + clientIp(request)));
  await env.DB.prepare('DELETE FROM promo_checks WHERE created_at < ?').bind(now - 3600).run();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM promo_checks WHERE ip_hash = ?').bind(ipHash).first();
  if ((r?.n || 0) >= LIMIT) return json({ ok: false, error: 'Забагато спроб. Спробуйте через годину або напишіть менеджеру.' }, 429);
  await env.DB.prepare('INSERT INTO promo_checks (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now).run();
  const p = await partnerCode(env, d && d.code);
  if (!p) return json({ ok: false, error: 'Код не знайдено або він неактивний' });
  return json({ ok: true, code: p.code, discount: p.discount });
}
