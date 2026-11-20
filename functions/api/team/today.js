// Кабінет працівника (/kabinet/team): «Мої задачі на сьогодні», мої обʼєкти зі стадіями й наступним кроком, (для менеджера) заявки.
// GET → {me, tasks, projects, leads, finance?}. Рядки — лише видимі працівнику (projectScope / orderScope), поля — shapeProject / shapeOrder:
// прораб бачить адресу й телефон клієнта, але не суми; бухгалтер — суми, але не телефони.
// Задачі проєкту (project_tasks, міграція 0012): чекліст обʼєкта (projects[].tasks) і мої невиконані — у «Сьогодні» як kind 'task'
// (прострочені — urgent); відмітити — POST /api/team/action {type: 'task'}. До міграції — без задач.
import { CLOSED, IN_IDS, idsArg, json, statusLabel } from '../../_lib.js';
import { SLA_MIN, sqlTime } from '../../_alerts.js';
import { cameraOf, progressOf, stageStatus, STAGE_STATUS } from '../../_account.js';
import { projectContacts } from '../../_partners.js';
import { PERMS, ROLES, need, noTable, orderScope, projectScope, shapeOrder, shapeProject } from '../../_roles.js';

const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const day = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const REPORT_EVERY = 10; // днів: фотозвіти раз на 1–2 тижні

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env);
  if (error) return error;
  const t = day(), soon = day(2);
  const me = { name: x.name, role: x.role, role_label: ROLES[x.role].label, staff_id: x.staffId, perms: [...x.perms], perm_labels: PERMS,
    panel: x.can('panel.admin'), owner: x.owner };
  const tasks = [];
  let projects = [], leads = [], payments = [];
  try {
    // ===== обʼєкти =====
    if (x.can('projects.view_all') || x.can('projects.view_assigned')) {
      const args = [];
      const w = projectScope(x, args);
      const P = (await env.DB.prepare(`SELECT p.*, c.name AS client_name, c.phone AS client_phone FROM projects p LEFT JOIN clients c ON c.id = p.client_id
          WHERE ${w} AND p.status != 'done' ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, COALESCE(p.next_date, '9999'), p.id DESC LIMIT 100`).bind(...args).all()).results;
      const ids = P.map(p => p.id);
      const R = ids.length ? (await env.DB.prepare(`SELECT id, project_id, date, title, note, photos, stage_id, author_staff_id FROM project_reports WHERE project_id ${IN_IDS} ORDER BY date DESC, id DESC LIMIT 400`).bind(idsArg(ids)).all()).results : [];
      const PS = ids.length ? (await env.DB.prepare(`SELECT ps.project_id, ps.staff_id, ps.task, s.name, s.role FROM project_staff ps JOIN staff s ON s.id = ps.staff_id WHERE ps.project_id ${IN_IDS}`).bind(idsArg(ids)).all()).results : [];
      const ISS = ids.length ? (await env.DB.prepare(`SELECT i.id, i.project_id, i.stage_id, i.note, i.photos, i.status, i.created_at, s.name AS staff_name FROM project_issues i
          LEFT JOIN staff s ON s.id = i.staff_id WHERE i.project_id ${IN_IDS} AND i.status = 'open' ORDER BY i.id DESC`).bind(idsArg(ids)).all()).results : [];
      const AS = ids.length ? (await env.DB.prepare(`SELECT id, name, role FROM staff WHERE id IN (SELECT assignee_staff_id FROM projects WHERE id ${IN_IDS})`).bind(idsArg(ids)).all()).results : [];
      let TK = [];
      try {
        TK = ids.length ? (await env.DB.prepare(`SELECT t.id, t.project_id, t.stage_id, t.title, t.staff_id, t.due_date, t.done, t.done_at, s.name AS staff_name FROM project_tasks t
            LEFT JOIN staff s ON s.id = t.staff_id WHERE t.project_id ${IN_IDS} ORDER BY t.done, t.sort, COALESCE(t.due_date, '9999'), t.id LIMIT 1000`).bind(idsArg(ids)).all()).results : [];
      } catch (e) { if (!noTable(e)) throw e; }
      if (x.can('finance.view') && ids.length) payments = (await env.DB.prepare(`SELECT * FROM project_payments WHERE project_id ${IN_IDS} AND status != 'paid' ORDER BY COALESCE(due_date, '9999') LIMIT 200`).bind(idsArg(ids)).all()).results;
      const SN = new Map((await env.DB.prepare('SELECT id, name FROM staff').all()).results.map(r => [r.id, r.name])); // відповідальні етапів
      const CT = await projectContacts(env, x, ids); // контакти обʼєкта (contacts.linked) — бригади, постачальники, майстри
      projects = P.map(p => {
        const stages = parse(p.stages, []).map(s => ({ ...s, status: stageStatus(s), status_label: STAGE_STATUS[stageStatus(s)],
          ...(s.staff_id ? { staff_name: SN.get(s.staff_id) || null, mine: s.staff_id === x.staffId } : {}) }));
        const current = stages.find(s => s.status === 'in_progress' || s.status === 'review') || stages.find(s => s.status !== 'done') || null;
        const reps = R.filter(r => r.project_id === p.id);
        const lead = AS.find(s => s.id === p.assignee_staff_id);
        const cam = cameraOf(p.camera_url);
        return shapeProject({
          id: p.id, title: p.title, service: p.service, address: p.address, area: p.area, status: p.status, next_step: p.next_step, next_date: p.next_date,
          client_name: p.client_name, client_phone: p.client_phone, stages, progress: progressOf(stages), current,
          contract_amount: p.contract_amount, contract_currency: p.contract_currency,
          camera_url: cam ? cam.url : null,
          lead: lead ? { id: lead.id, name: lead.name, role_label: ROLES[lead.role] ? ROLES[lead.role].label : lead.role } : null,
          my_task: (PS.find(s => s.project_id === p.id && s.staff_id === x.staffId) || {}).task || (p.assignee_staff_id === x.staffId ? 'Відповідальний' : null),
          team: PS.filter(s => s.project_id === p.id).map(s => ({ name: s.name, role_label: ROLES[s.role] ? ROLES[s.role].label : s.role, task: s.task })),
          reports: reps.slice(0, 4).map(r => ({ id: r.id, date: r.date, title: r.title, note: r.note, stage_id: r.stage_id, photos: parse(r.photos, []).slice(0, 8), mine: r.author_staff_id === x.staffId })),
          last_report: reps[0] ? reps[0].date : null,
          issues: ISS.filter(i => i.project_id === p.id).map(i => ({ ...i, photos: parse(i.photos, []) })),
          payments: payments.filter(y => y.project_id === p.id),
          deadline: p.deadline || null,
          contacts: CT[p.id] || [],
          tasks: TK.filter(y => y.project_id === p.id).map(y => ({ ...y, done: !!y.done, mine: y.staff_id === x.staffId,
            stage_name: (stages.find(s => s.id === y.stage_id) || {}).name || null })),
        }, x);
      });
      for (const p of projects) {
        if (p.status !== 'active') continue;
        if (p.next_date && p.next_date <= t && p.next_step) tasks.push({ kind: 'next', urgent: p.next_date < t, due: p.next_date, project_id: p.id, title: p.next_step, sub: p.title });
        // етап: термін близько або минув; «мій етап» (відповідальний — я) у роботі чи з правками від клієнта — завжди
        for (const s of p.stages) {
          const mine = s.staff_id && s.staff_id === x.staffId;
          if (s.status !== 'done' && ((s.end && s.end <= soon) || (mine && ['in_progress', 'review'].includes(s.status))))
            tasks.push({ kind: 'stage', urgent: !!(s.end && s.end < t), due: s.end || null, project_id: p.id, stage_id: s.id, mine: !!mine,
              title: `${mine ? 'Мій етап' : 'Етап'} «${s.name}»`, sub: p.title + (s.rev_note && !s.approved_at ? ` · правки клієнта: «${String(s.rev_note).slice(0, 80)}»` : '') });
        }
        if (x.can('reports.upload') && (!p.last_report || p.last_report <= day(-REPORT_EVERY)))
          tasks.push({ kind: 'report', urgent: false, due: t, project_id: p.id, title: 'Фотозвіт для клієнта', sub: p.title + (p.last_report ? ` · останній ${p.last_report}` : ' · ще не було') });
        for (const y of p.tasks) if (!y.done && y.mine)
          tasks.push({ kind: 'task', urgent: !!(y.due_date && y.due_date < t), due: y.due_date || null, project_id: p.id, task_id: y.id, stage_id: y.stage_id,
            title: y.title, sub: p.title + (y.stage_name ? ` · етап «${y.stage_name}»` : '') });
        for (const i of p.issues || []) if (x.can('projects.edit') || i.staff_name === x.name)
          tasks.push({ kind: 'issue', urgent: true, due: i.created_at.slice(0, 10), project_id: p.id, issue_id: i.id, title: 'Проблема: ' + i.note.slice(0, 80), sub: p.title });
      }
      for (const y of payments) if (y.due_date && y.due_date <= soon)
        tasks.push({ kind: 'payment', urgent: y.due_date < t, due: y.due_date, project_id: y.project_id, title: `Платіж «${y.title}»`, sub: (projects.find(p => p.id === y.project_id) || {}).title });
    }
    // ===== заявки =====
    if (x.can('leads.view_all') || x.can('leads.view_assigned')) {
      const args = [];
      const w = orderScope({ ...x, can: p => p !== 'orders.view' && x.can(p) }, args);
      const L = (await env.DB.prepare(`SELECT o.* FROM orders o WHERE ${w} AND o.status NOT IN (${CLOSED.map(() => '?').join(',')}) ORDER BY o.id DESC LIMIT 150`).bind(...args, ...CLOSED).all()).results;
      const slaCut = sqlTime(new Date(Date.now() - SLA_MIN * 60000));
      leads = L.map(o => shapeOrder({ id: o.id, number: o.number, kind: o.kind, status: o.status, status_label: statusLabel(o.status, o.kind), name: o.name, phone: o.phone, email: o.email,
        service: o.service, city: o.city, next_contact: o.next_contact, created_at: o.created_at, taken_at: o.taken_at, assignee_staff_id: o.assignee_staff_id,
        amount: o.amount, total: o.total, currency: o.currency, comment: o.comment, crm_note: o.crm_note }, x));
      for (const o of L) {
        const mine = o.assignee_staff_id === x.staffId || (!o.assignee_staff_id && x.can('leads.view_all'));
        if (!mine) continue;
        if (o.status === 'new' && !o.taken_at) tasks.push({ kind: 'lead', urgent: o.created_at <= slaCut, due: t, order_id: o.id, title: `Нова заявка ${o.number}`, sub: o.service || o.name || '' });
        else if (o.next_contact && o.next_contact <= t) tasks.push({ kind: 'contact', urgent: o.next_contact < t, due: o.next_contact, order_id: o.id, title: `Звʼязатися: ${o.name || o.number}`, sub: o.service || '' });
      }
    }
  } catch (e) {
    if (!noTable(e)) throw e;
    return json({ me, tasks: [], projects: [], leads: [], pending: true });
  }
  tasks.sort((a, b) => (b.urgent - a.urgent) || String(a.due).localeCompare(String(b.due)));
  return json({ me, today: t, tasks, projects, leads });
}
