// «Не цікаво» з бота пошуку — для навчання (migrations/0013_partners.sql, bot_feedback). Ключ — X-Bot-Key.
// POST {hash, reason, verdict?: not_interested|interesting|spam} — записати (повтор того самого hash оновлює причину й час).
// GET  ?since=<РРРР-ММ-ДД[ HH:MM:SS] або ISO>&limit=<1..1000> — записи, змінені ПІСЛЯ since (за updated_at, зростання),
//      відповідь {items: [{hash, verdict, reason, created_at, updated_at}], next} — next передати як since наступного разу.
import { bad, json, readJSON } from '../../_lib.js';
import { Invalid, text } from '../../_partners.js';
import { noTable } from '../../_roles.js';

const VERDICTS = ['not_interested', 'interesting', 'spam'];
export const leadHash = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(v.trim()) ? v.trim() : null);

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await readJSON(request, 8 * 1024); } catch { return bad('Некоректні дані'); }
  const hash = leadHash(d && d.hash);
  if (!hash) return bad('hash: 8–128 символів — латиниця, цифри, _ і -');
  const verdict = d.verdict == null || d.verdict === '' ? 'not_interested' : String(d.verdict);
  if (!VERDICTS.includes(verdict)) return bad('verdict: ' + VERDICTS.join(' | '));
  let reason;
  try { reason = text(d.reason, 500, 'reason', true); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
  try {
    await env.DB.prepare(`INSERT INTO bot_feedback (lead_hash, verdict, reason) VALUES (?, ?, ?)
        ON CONFLICT(lead_hash) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, updated_at = datetime('now')`).bind(hash, verdict, reason).run();
  } catch (e) { if (noTable(e)) return bad('Міграція 0013 ще не застосована', 503); throw e; }
  return json({ ok: true, hash });
}

// since → 'YYYY-MM-DD HH:MM:SS' (UTC, як datetime('now') у D1) або null
export function sinceOf(v) {
  if (!v) return '1970-01-01 00:00:00';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 00:00:00';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 19).replace('T', ' ');
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const since = sinceOf(u.searchParams.get('since'));
  if (!since) return bad('since: РРРР-ММ-ДД, «РРРР-ММ-ДД HH:MM:SS» або ISO');
  const limit = Math.max(1, Math.min(1000, parseInt(u.searchParams.get('limit'), 10) || 500));
  let results;
  try {
    ({ results } = await env.DB.prepare('SELECT lead_hash AS hash, verdict, reason, created_at, updated_at FROM bot_feedback WHERE updated_at > ? ORDER BY updated_at, id LIMIT ?')
      .bind(since, limit).all());
  } catch (e) { if (noTable(e)) return bad('Міграція 0013 ще не застосована', 503); throw e; }
  return json({ items: results, next: results.length ? results[results.length - 1].updated_at : since, more: results.length === limit });
}
