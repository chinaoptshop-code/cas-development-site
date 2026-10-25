// Особисті коди партнерів (дизайнери, архітектори) для менеджера: GET — список; POST — створити; PATCH — вимкнути/увімкнути, змінити знижку чи імʼя.
import { bad, currentClient, isAdmin, json, normCode, readJSON, str } from '../../_lib.js';

const TR = Object.fromEntries([...'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя'].map((c, n) => [c,
  ['A','B','V','H','G','D','E','IE','ZH','Z','Y','I','I','I','K','L','M','N','O','P','R','S','T','U','F','KH','TS','CH','SH','SHCH','','IU','IA'][n]]));
const latin = s => [...String(s || '').toLowerCase()].map(c => TR[c] ?? c).join('').toUpperCase().replace(/[^A-Z0-9]+/g, '');
const pct = v => Math.max(1, Math.min(30, Math.round(Number(v)) || 10));

const admin = async (request, env) => isAdmin(env, await currentClient(request, env));

export async function onRequestGet({ request, env }) {
  if (!await admin(request, env)) return bad('Немає доступу', 403);
  const { results } = await env.DB.prepare('SELECT * FROM partner_codes ORDER BY active DESC, created_at DESC LIMIT 500').all();
  return json({ codes: results });
}

export async function onRequestPost({ request, env }) {
  if (!await admin(request, env)) return bad('Немає доступу', 403);
  let d;
  try { d = await readJSON(request, 4096); } catch { return bad('Некоректні дані'); }
  const name = str(d.name, 120);
  let code;
  if (d.code && String(d.code).trim()) {
    code = normCode(d.code);
    if (!code) return bad('Код: 3–32 символи — літери, цифри, дефіс');
  } else { // генеруємо: DIZ-<прізвище латиницею>, за конфлікту — з випадковим хвостом
    const base = 'DIZ-' + (latin((name || '').split(/\s+/).filter(Boolean).pop()).slice(0, 20) || '');
    code = base.length > 4 ? base : 'DIZ-' + crypto.randomUUID().slice(0, 6).toUpperCase();
    if (await env.DB.prepare('SELECT 1 FROM partner_codes WHERE code = ?').bind(code).first())
      code = code.slice(0, 26) + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
  }
  if (await env.DB.prepare('SELECT 1 FROM partner_codes WHERE code = ?').bind(code).first()) return bad('Такий код уже є', 409);
  await env.DB.prepare('INSERT INTO partner_codes (code, name, discount, active) VALUES (?, ?, ?, 1)').bind(code, name, pct(d.discount ?? 10)).run();
  return json({ ok: true, code: await env.DB.prepare('SELECT * FROM partner_codes WHERE code = ?').bind(code).first() });
}

export async function onRequestPatch({ request, env }) {
  if (!await admin(request, env)) return bad('Немає доступу', 403);
  let d;
  try { d = await readJSON(request, 4096); } catch { return bad('Некоректні дані'); }
  const p = await env.DB.prepare('SELECT * FROM partner_codes WHERE code = ?').bind(normCode(d.code)).first();
  if (!p) return bad('Код не знайдено', 404);
  await env.DB.prepare('UPDATE partner_codes SET active = ?, discount = ?, name = ? WHERE code = ?')
    .bind(d.active == null ? p.active : (d.active ? 1 : 0), d.discount == null ? p.discount : pct(d.discount),
      d.name == null ? p.name : str(d.name, 120), p.code).run();
  return json({ ok: true });
}
