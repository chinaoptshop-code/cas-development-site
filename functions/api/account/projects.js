// Проєкти клієнта (дизайн, ремонт, будівництво): етапи з прогресом, фотозвіти, документи, наступний крок.
// GET /api/account/projects → {projects: [{..., stages, progress, reports, documents}], documents: [документи без проєкту]}
// Дані заповнює менеджер: /api/admin/projects.
import { client, json, noTable, progressOf } from '../../_account.js';

const parse = (s, d) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : d; } catch { return d; } };

export async function onRequestGet({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  try {
    const P = (await env.DB.prepare(`SELECT id, title, service, address, area, status, stages, next_step, next_date, manager, created_at, updated_at
        FROM projects WHERE client_id = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, id DESC LIMIT 20`).bind(c.id).all()).results;
    const ids = P.map(p => p.id);
    const R = ids.length ? (await env.DB.prepare(`SELECT id, project_id, date, title, note, photos FROM project_reports
        WHERE project_id IN (${ids.map(() => '?').join(',')}) ORDER BY date DESC, id DESC LIMIT 200`).bind(...ids).all()).results : [];
    const D = (await env.DB.prepare('SELECT id, project_id, order_id, kind, title, url, created_at FROM documents WHERE client_id = ? ORDER BY id DESC LIMIT 200').bind(c.id).all()).results;
    const projects = P.map(p => {
      const stages = parse(p.stages, []);
      return {
        ...p, stages, progress: progressOf(stages),
        reports: R.filter(r => r.project_id === p.id).map(r => ({ ...r, photos: parse(r.photos, []) })),
        documents: D.filter(x => x.project_id === p.id),
      };
    });
    return json({ projects, documents: D.filter(x => !x.project_id || !ids.includes(x.project_id)) });
  } catch (e) {
    if (noTable(e)) return json({ projects: [], documents: [], pending: true });
    throw e;
  }
}
