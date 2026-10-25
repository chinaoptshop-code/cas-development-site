// Спільний rate-limit для API (таблиця rate_hits — migrations/0007_security.sql).
// Ключ — хеш IP (для IPv6 — мережа /64, щоб не обходили ліміт зміною адреси в межах одного підключення).
// Якщо міграція ще не застосована — ліміт не блокує (fail-open): краще пропустити заявку, ніж втратити клієнта.
import { hexOf, sha256 } from './_lib.js';

// IP клієнта → рядок для ключа ліміту: IPv4 як є, IPv6 — перші 4 групи (/64)
export function ipKey(request) {
  const ip = (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim();
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return full.slice(0, 4).map(x => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export const ipHash = async (request, salt) => hexOf(await sha256(salt + '|' + ipKey(request)));

// Зареєструвати спробу в кошику bucket; true — ліміт перевищено (спробу не записуємо).
export async function limited(env, request, bucket, limit, windowS = 3600) {
  try {
    const now = Math.floor(Date.now() / 1000), key = await ipHash(request, bucket);
    // прибирання: лише старі записи цього кошика — швидко за індексом
    await env.DB.prepare('DELETE FROM rate_hits WHERE bucket = ? AND created_at < ?').bind(bucket, now - 86400).run();
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE bucket = ? AND ip_hash = ? AND created_at > ?')
      .bind(bucket, key, now - windowS).first();
    if ((r?.n || 0) >= limit) return true;
    await env.DB.prepare('INSERT INTO rate_hits (bucket, ip_hash, created_at) VALUES (?, ?, ?)').bind(bucket, key, now).run();
    return false;
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return false;
    throw e;
  }
}
