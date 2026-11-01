// Дії працівника на обʼєкті (/kabinet/team). Лише видимий йому обʼєкт (canSeeProject), інакше 404.
// POST {type: 'stage', project_id, stage_id, status: 'in_progress' | 'review' | 'done'}  — «етап виконано» (projects.edit_stage)
// POST {type: 'report', project_id, stage_id?, title?, note?, photos: [url]}          — фотозвіт для клієнта (reports.upload)
// POST {type: 'issue', project_id, stage_id?, note, photos?: [url]}                     — «проблема на обʼєкті» (issues.report),
//      лише для команди; власнику й менеджерам — Telegram.
// photos — адреси /api/media/<id> цього ж обʼєкта (POST /api/team/upload) або https-посилання.
import { bad, json, readJSON } from '../../_lib.js';
import { escHtml, notifyTeam } from '../../_alerts.js';
import { STAGE_STATUS, date, httpsUrl, int, stageStatus, txt } from '../../_account.js';
import { audit, canSeeProject, need } from '../../_roles.js';
import { limited } from '../../_rate.js';

const PERM = { stage: 'projects.edit_stage', report: 'reports.upload', issue: 'issues.report' };
const MEDIA = /\/api\/media\/([0-9a-f]{24})$/;

async function photosOf(env, request, projectId, v) {
  if (!Array.isArray(v)) return [];
  const origin = new URL(request.url).origin, out = [];
  for (const raw of v.slice(0, 30)) {
    const u = httpsUrl(raw) || (typeof raw === 'string' && raw.startsWith('/api/media/') ? origin + raw : null);
    if (!u) continue;
    const m = MEDIA.exec(u);
    if (m) { // своє фото — лише з цього обʼєкта (чуже id не прикріпити)
      const row = await env.DB.prepare('SELECT project_id FROM media WHERE id = ?').bind(m[1]).first();
      if (!row || row.project_id !== projectId) continue;
    }
    out.push(u);
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await readJSON(request, 32 * 1024); } catch { return bad('Некоректні дані'); }
  const perm = PERM[d.type];
  if (!perm) return bad('Невідома дія');
  const { x, error } = await need(request, env, perm);
  if (error) return error;
  if (await limited(env, request, 'team-action', 300)) return bad('Забагато дій поспіль — зачекайте кілька хвилин', 429);
  const pid = int(d.project_id);
  if (!pid || !await canSeeProject(env, x, pid)) return bad('Обʼєкт не знайдено', 404);
  const pr = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(pid).first();
  const stages = (() => { try { return JSON.parse(pr.stages || '[]'); } catch { return []; } })();
  const stageId = d.stage_id && stages.some(s => s.id === d.stage_id) ? String(d.stage_id) : null;

  if (d.type === 'stage') {
    if (!['in_progress', 'review', 'done'].includes(d.status)) return bad('Невідомий статус етапу', 422);
    const i = stages.findIndex(s => s.id === d.stage_id);
    if (i < 0) return bad('Етап не знайдено', 404);
    const before = { ...stages[i], status: stageStatus(stages[i]) };
    stages[i] = { ...stages[i], status: d.status, progress: d.status === 'done' ? 100 : Math.max(Number(stages[i].progress) || 0, d.status === 'review' ? 90 : 10),
      ...(d.status === 'done' && !stages[i].end ? { end: new Date().toISOString().slice(0, 10) } : {}) };
    await env.DB.prepare("UPDATE projects SET stages = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(stages), pid).run();
    await audit(env, request, x, 'project.stage', 'projects', pid, { stage_id: before.id, status: before.status, progress: before.progress }, { stage_id: before.id, status: d.status, progress: stages[i].progress });
    if (d.status === 'done' || d.status === 'review')
      await notifyTeam(env, `${d.status === 'done' ? '✅ Етап виконано' : '👀 Етап на прийманні'}: <b>${escHtml(stages[i].name)}</b>\nОбʼєкт: ${escHtml(pr.title)}\nВідмітив: ${escHtml(x.name)}`);
    return json({ ok: true, stage: { ...stages[i], status_label: STAGE_STATUS[d.status] } });
  }

  const photos = await photosOf(env, request, pid, d.photos);
  if (d.type === 'report') {
    if (!photos.length && !txt(d.note, 10)) return bad('Додайте фото або опис', 422);
    const dt = date(d.date) || new Date().toISOString().slice(0, 10);
    const r = await env.DB.prepare('INSERT INTO project_reports (project_id, date, title, note, photos, stage_id, author_staff_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(pid, dt, txt(d.title, 120) || 'Фотозвіт', txt(d.note, 2000), JSON.stringify(photos), stageId, x.staffId).run();
    await env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(pid).run();
    await audit(env, request, x, 'report.create', 'projects', pid, null, { report_id: r.meta.last_row_id, photos: photos.length, stage_id: stageId });
    return json({ ok: true, id: r.meta.last_row_id });
  }
  // issue
  const note = txt(d.note, 2000);
  if (!note) return bad('Опишіть проблему', 422);
  const r = await env.DB.prepare('INSERT INTO project_issues (project_id, staff_id, stage_id, note, photos) VALUES (?, ?, ?, ?, ?)')
    .bind(pid, x.staffId, stageId, note, JSON.stringify(photos)).run();
  await audit(env, request, x, 'issue.create', 'projects', pid, null, { issue_id: r.meta.last_row_id, note, photos: photos.length });
  await notifyTeam(env, `⚠️ <b>Проблема на обʼєкті</b> «${escHtml(pr.title)}»\n${escHtml(note.slice(0, 800))}\n${photos.length ? `📷 ${photos.length} фото\n` : ''}Від: ${escHtml(x.name)}`);
  return json({ ok: true, id: r.meta.last_row_id });
}
