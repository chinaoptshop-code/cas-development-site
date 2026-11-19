// Проєкти клієнта (дизайн, ремонт, будівництво): етапи з прогресом і статусами, фотозвіти, документи (акти етапів),
// графік платежів, камера 24/7, наступний крок. Вкладки /kabinet/proekty і /kabinet/obiekt («Онлайн-контроль»).
// GET /api/account/projects → {projects: [{..., stages, progress, reports, documents, payments, camera}], documents: [документи без проєкту]}
// Клієнт бачить лише свої проєкти (WHERE client_id = сесія). Дані заповнює менеджер: /api/admin/projects.
// Працює й до міграції 0008 (без камери й платежів) і 0005 (порожньо, pending).
// POST /api/account/projects {action: 'approve', project_id, stage_id} — клієнт сам погоджує етап дизайн-проєкту (service 'design'),
//   коли студія виставила його на приймання (status 'review') або вже виконала ('done'): approved_at = сьогодні, approved_by = 'client'.
//   Лише свій проєкт (client_id = сесія), інакше 404; повторне погодження — ok без змін. Студії — Telegram (власник/менеджери +
//   відповідальний), audit_log 'project.approve'. Ліміт — 30/год з IP. Те саме — для архітектурного проєкту (service 'arch').
// POST {action: 'revise', project_id, stage_id, note} — «Є правки» (той самий етап на прийманні, ще не погоджений):
//   revisions + 1, етап → «В роботі», rev_note / rev_at — останній коментар клієнта; понад rev_max (кругів за договором) — over: true.
//   Студії й відповідальному етапу — Telegram, audit_log 'project.revise'.
import { body, cameraOf, client, json, noTable, progressOf, stageStatus, STAGE_STATUS, PAY_STATUS } from '../../_account.js';
import { escHtml, notifyStaff, notifyTeam } from '../../_alerts.js';
import { audit } from '../../_roles.js';
import { limited } from '../../_rate.js';
import { updateStages } from '../../_ver.js';

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
      // відповідальний етапу (staff_id) і журнал етапу (hist) — внутрішні поля команди, клієнту не віддаємо
      const stages = parse(p.stages, []).map(({ staff_id, hist, ...s }) => ({ ...s, status: stageStatus(s), status_label: STAGE_STATUS[stageStatus(s)] }));
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

export async function onRequestPost({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  if (await limited(env, request, 'account-approve', 30)) return json({ error: 'Забагато запитів — спробуйте за кілька хвилин' }, 429);
  const { d, error: e2 } = await body(request, 4 * 1024);
  if (e2) return e2;
  if (!d || !['approve', 'revise'].includes(d.action)) return json({ error: 'Некоректний запит' }, 400);
  const pid = Number.parseInt(d.project_id, 10), sid = String(d.stage_id || '');
  if (!Number.isInteger(pid)) return json({ error: 'Етап не знайдено' }, 404);
  const who = c.name || c.phone || 'Клієнт';
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
  // Зміна — «порівняй і заміни» (functions/_ver.js, updateStages): якщо менеджер у цю ж мить зберіг картку, погодження
  // застосовується до свіжих етапів, а не затирає його зміни. Перевірки стану етапу — усередині, на тих самих свіжих даних.
  let r;
  try {
    r = await updateStages(env, pid, (stages, p) => {
      const i = DESIGN.includes(p.service) ? stages.findIndex(s => s && s.id === sid) : -1;
      if (i < 0) return { error: 'Етап не знайдено', status: 404 };
      const s = stages[i];
      if (d.action === 'revise') return reviseStage(stages, i, d, who, day);
      if (s.approved_at) return { skip: true, already: true, s };
      if (!['review', 'done'].includes(stageStatus(s))) return { error: 'Етап ще не готовий до погодження', status: 409 };
      const next = stages.slice();
      next[i] = { ...s, approved_at: day, approved_by: 'client', hist: [...(Array.isArray(s.hist) ? s.hist : []), { act: 'approve', at: stamp(), by: who }].slice(-30) };
      return { stages: next, s };
    }, { where: ' AND client_id = ?', args: [c.id] });
  } catch (e) { if (!noTable(e)) throw e; r = { missing: true }; }
  if (r.missing) return json({ error: 'Етап не знайдено' }, 404);
  if (r.error) return json({ error: r.error }, r.status || 409);
  const p = r.project, s = r.s;
  if (d.action === 'revise') return revised(request, env, c, p, r, who);
  if (r.already) return json({ ok: true, already: true, stage: { id: s.id, approved_at: s.approved_at } });
  await audit(env, request, { client: c, staffId: null, name: who, role: 'client' }, 'project.approve', 'projects', pid, { stage_id: s.id, approved_at: null }, { stage_id: s.id, approved_at: day, by: 'client' });
  const text = `✅ Клієнт погодив етап <b>${escHtml(s.name)}</b>\nОбʼєкт: ${escHtml(p.title)}\nКлієнт: ${escHtml(who)}`;
  await notifyTeam(env, text, 'https://cas-develop.com/kabinet/admin#projects');
  await toStaff(env, p, s, text);
  return json({ ok: true, stage: { id: s.id, approved_at: day } });
}

const DESIGN = ['design', 'arch'];
// «YYYY-MM-DD HH:MM» за Києвом — для історії етапу
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv' }).slice(0, 16);
const TEAM_KB = { inline_keyboard: [[{ text: '📋 Мої задачі', url: 'https://cas-develop.com/kabinet/team' }]] };
// відповідальному за обʼєкт і за етап (без повтору)
async function toStaff(env, p, s, text) {
  for (const id of new Set([p.assignee_staff_id, s.staff_id].filter(Boolean))) await notifyStaff(env, id, text, TEAM_KB);
}

// «Є правки»: клієнт повертає етап у роботу з коментарем; лічильник правок + 1
function reviseStage(stages, i, d, who, day) {
  const s = stages[i];
  if (s.approved_at) return { error: 'Етап уже погоджено', status: 409 };
  if (!['review', 'done'].includes(stageStatus(s))) return { error: 'Етап ще не готовий до погодження', status: 409 };
  const note = String(d.note == null ? '' : d.note).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 1000);
  if (note.length < 3) return { error: 'Опишіть, що змінити', status: 422 };
  const revisions = Math.min(99, (Number(s.revisions) || 0) + 1), over = !!(s.rev_max && revisions > s.rev_max);
  const next = stages.slice();
  next[i] = { ...s, status: 'in_progress', progress: Math.min(Number(s.progress) || 0, 90), revisions, rev_note: note, rev_at: day,
    hist: [...(Array.isArray(s.hist) ? s.hist : []), { act: 'revise', at: stamp(), by: who, note }].slice(-30) };
  return { stages: next, s, note, revisions, over };
}
async function revised(request, env, c, p, r, who) {
  const { s, note, revisions, over } = r;
  await audit(env, request, { client: c, staffId: null, name: who, role: 'client' }, 'project.revise', 'projects', p.id,
    { stage_id: s.id, revisions: s.revisions || 0, status: stageStatus(s) }, { stage_id: s.id, revisions, status: 'in_progress', note });
  const text = `✏️ Клієнт просить правки: етап <b>${escHtml(s.name)}</b> (правка ${revisions}${s.rev_max ? ' з ' + s.rev_max : ''}${over ? ' — понад договір' : ''})\n` +
    `Обʼєкт: ${escHtml(p.title)}\nКлієнт: ${escHtml(who)}\n«${escHtml(note)}»`;
  await notifyTeam(env, text, 'https://cas-develop.com/kabinet/admin#projects');
  await toStaff(env, p, s, text);
  return json({ ok: true, stage: { id: s.id, status: 'in_progress', revisions, rev_max: s.rev_max || null, over } });
}
