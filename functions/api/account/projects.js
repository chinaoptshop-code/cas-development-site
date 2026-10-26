// Проєкти клієнта (дизайн, ремонт, будівництво): етапи з прогресом і статусами, фотозвіти, документи (акти етапів),
// графік платежів, камера 24/7, наступний крок. Вкладки /kabinet/proekty і /kabinet/obiekt («Онлайн-контроль»).
// GET /api/account/projects → {projects: [{..., stages, progress, reports, documents, payments, camera}], documents: [документи без проєкту]}
// Клієнт бачить лише свої проєкти (WHERE client_id = сесія). Дані заповнює менеджер: /api/admin/projects.
// Працює й до міграції 0008 (без камери й платежів) і 0005 (порожньо, pending).
import { cameraOf, client, json, noTable, progressOf, stageStatus, STAGE_STATUS, PAY_STATUS } from '../../_account.js';
import { limited } from '../../_rate.js';

const parse = (s, d) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : d; } catch { return d; } };
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] ?? null]));
const P_KEYS = ['id', 'title', 'service', 'address', 'area', 'status', 'next_step', 'next_date', 'manager', 'created_at', 'updated_at'];

export async function onRequestGet({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  if (await limited(env, request, 'account-projects', 600)) return json({ error: 'Забагато запитів — спробуйте за кілька хвилин' }, 429);
  try {
    // SELECT * — щоб camera_url/camera_note (0008) підхопились, щойно міграцію застосують, і не ламали запит до неї
    const P = (await env.DB.prepare(`SELECT * FROM projects WHERE client_id = ?
        ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, id DESC LIMIT 20`).bind(c.id).all()).results;
    const ids = P.map(p => p.id), q = ids.map(() => '?').join(',');
    const R = ids.length ? (await env.DB.prepare(`SELECT * FROM project_reports
        WHERE project_id IN (${q}) ORDER BY date DESC, id DESC LIMIT 300`).bind(...ids).all()).results : [];
    const D = (await env.DB.prepare('SELECT * FROM documents WHERE client_id = ? ORDER BY id DESC LIMIT 200').bind(c.id).all()).results;
    let PAY = [];
    if (ids.length) {
      try {
        PAY = (await env.DB.prepare(`SELECT id, project_id, stage_id, title, pct, amount, currency, due_date, paid_date, status, note, sort
            FROM project_payments WHERE project_id IN (${q}) ORDER BY sort, COALESCE(due_date, '9999'), id LIMIT 500`).bind(...ids).all()).results;
      } catch (e) { if (!noTable(e)) throw e; }
    }
    const doc = x => pick(x, ['id', 'project_id', 'order_id', 'kind', 'title', 'url', 'stage_id', 'created_at']);
    const projects = P.map(p => {
      const stages = parse(p.stages, []).map(s => ({ ...s, status: stageStatus(s), status_label: STAGE_STATUS[stageStatus(s)] }));
      const cam = cameraOf(p.camera_url);
      return {
        ...pick(p, P_KEYS), stages, progress: progressOf(stages),
        camera: cam ? { ...cam, note: p.camera_note || null } : null,
        reports: R.filter(r => r.project_id === p.id).map(r => ({ ...pick(r, ['id', 'date', 'title', 'note', 'stage_id']), photos: parse(r.photos, []) })),
        documents: D.filter(x => x.project_id === p.id).map(doc),
        payments: PAY.filter(x => x.project_id === p.id).map(x => ({ ...x, status_label: PAY_STATUS[x.status] || x.status })),
      };
    });
    return json({ projects, documents: D.filter(x => !x.project_id || !ids.includes(x.project_id)).map(doc) });
  } catch (e) {
    if (noTable(e)) return json({ projects: [], documents: [], pending: true });
    throw e;
  }
}
