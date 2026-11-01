// Фото з обʼєкта (телефон прораба): POST {project_id, mime: 'image/webp'|'image/jpeg', data: base64} → {id, url}.
// Сторінка стискає фото до 1600 px WebP (assets/team.v1.js), тож одне фото — до ~1,5 МБ. Байти — у R2 (binding MEDIA), якщо
// привʼязано, інакше в D1 (таблиця media). Віддає GET /api/media/<id> лише тим, хто бачить цей обʼєкт (і клієнту-власнику).
// Права: reports.upload або issues.report і видимий обʼєкт.
import { bad, hexOf, json } from '../../_lib.js';
import { int } from '../../_account.js';
import { canSeeProject, need } from '../../_roles.js';
import { limited } from '../../_rate.js';

const MAX = 1.5 * 1024 * 1024;
const MIME = ['image/webp', 'image/jpeg', 'image/png'];
const SIG = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, ['reports.upload', 'issues.report']);
  if (error) return error;
  let d;
  try { const t = await request.text(); if (t.length > 2.2 * 1024 * 1024) return bad('Фото завелике — до 1,5 МБ', 413); d = JSON.parse(t); } catch { return bad('Некоректні дані'); }
  if (await limited(env, request, 'team-upload', 200)) return bad('Забагато фото поспіль — зачекайте', 429);
  const pid = int(d.project_id);
  if (!pid || !await canSeeProject(env, x, pid)) return bad('Обʼєкт не знайдено', 404);
  if (!MIME.includes(d.mime)) return bad('Лише фото: WebP, JPEG або PNG', 415);
  let bytes;
  try { bytes = Uint8Array.from(atob(String(d.data || '')), c => c.charCodeAt(0)); } catch { return bad('Некоректні дані фото'); }
  if (!bytes.length || bytes.length > MAX) return bad('Фото завелике — до 1,5 МБ', 413);
  if (!SIG[d.mime].every((b, i) => bytes[i] === b)) return bad('Файл не схожий на фото', 415);
  const id = hexOf(crypto.getRandomValues(new Uint8Array(12)));
  if (env.MEDIA && typeof env.MEDIA.put === 'function') {
    const key = `projects/${pid}/${id}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: d.mime } });
    await env.DB.prepare('INSERT INTO media (id, project_id, staff_id, mime, size, r2_key) VALUES (?, ?, ?, ?, ?, ?)').bind(id, pid, x.staffId, d.mime, bytes.length, key).run();
  } else {
    await env.DB.prepare('INSERT INTO media (id, project_id, staff_id, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)').bind(id, pid, x.staffId, d.mime, bytes.length, bytes).run();
  }
  return json({ ok: true, id, url: `${new URL(request.url).origin}/api/media/${id}` });
}
