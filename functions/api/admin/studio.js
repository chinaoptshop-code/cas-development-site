// Майстер-дашборд «вся студія» — лише власник (dashboard.studio). GET → {
//   funnel:   заявки за стадіями (заявка → розрахунок → договір → проєкт → здача → гарантія) з кількістю й сумою,
//   ozdoba:   замовлення Оздоби за статусами,
//   finance:  договори, сплачено, до оплати, прострочені платежі (по валютах), оплачені замовлення Оздоби за 30 днів,
//   workload: навантаження кожного працівника (відкриті заявки, активні обʼєкти, проблеми, прострочки),
//   overdue:  прострочені контакти, нові заявки поза SLA, прострочені платежі, відкриті проблеми, етапи з минулим дедлайном,
//   projects: активні обʼєкти з прогресом }
import { LEAD_STATUSES, ORDER_STATUSES, json } from '../../_lib.js';
import { SLA_MIN, sqlTime } from '../../_alerts.js';
import { ROLES, need, noTable } from '../../_roles.js';
import { progressOf, stageStatus } from '../../_account.js';

const soft = async (p, d) => { try { return (await p).results; } catch (e) { if (noTable(e)) return d; throw e; } };
const today = () => new Date().toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const { error } = await need(request, env, 'dashboard.studio');
  if (error) return error;
  const t = today();
  const O = await soft(env.DB.prepare('SELECT id, number, kind, status, name, service, amount, total, currency, assignee, assignee_staff_id, next_contact, taken_at, created_at, city FROM orders ORDER BY id DESC LIMIT 5000').all(), []);
  const P = await soft(env.DB.prepare(`SELECT p.*, c.name AS client_name FROM projects p LEFT JOIN clients c ON c.id = p.client_id ORDER BY p.id DESC LIMIT 1000`).all(), []);
  const PAY = await soft(env.DB.prepare('SELECT * FROM project_payments').all(), []);
  const ISS = await soft(env.DB.prepare(`SELECT i.*, p.title AS project_title, s.name AS staff_name FROM project_issues i JOIN projects p ON p.id = i.project_id
      LEFT JOIN staff s ON s.id = i.staff_id WHERE i.status = 'open' ORDER BY i.id DESC LIMIT 200`).all(), []);
  const S = await soft(env.DB.prepare('SELECT * FROM staff WHERE active = 1').all(), []);
  const PS = await soft(env.DB.prepare('SELECT * FROM project_staff').all(), []);

  const sum = rs => rs.reduce((m, o) => { const v = o.amount != null ? o.amount : o.total || 0; const c = o.currency || 'UAH'; m[c] = (m[c] || 0) + v; return m; }, {});
  const leads = O.filter(o => o.kind === 'lead'), orders = O.filter(o => o.kind === 'order');
  const funnel = Object.entries(LEAD_STATUSES).map(([k, label]) => { const rs = leads.filter(o => o.status === k); return { key: k, label, n: rs.length, sum: sum(rs) }; });
  const ozdoba = Object.entries(ORDER_STATUSES).map(([k, label]) => { const rs = orders.filter(o => o.status === k); return { key: k, label, n: rs.length, sum: sum(rs) }; });

  const fin = {};
  const add = (cur, k, v) => { fin[cur] = fin[cur] || { contract: 0, paid: 0, due: 0, overdue: 0 }; fin[cur][k] += v || 0; };
  for (const p of P) if (p.contract_amount && p.status !== 'done') add(p.contract_currency || 'USD', 'contract', p.contract_amount);
  const overduePay = [];
  for (const y of PAY) {
    const cur = y.currency || 'USD';
    if (y.status === 'paid') add(cur, 'paid', y.amount);
    else {
      add(cur, 'due', y.amount);
      if (y.due_date && y.due_date < t) { add(cur, 'overdue', y.amount); overduePay.push({ ...y, project: (P.find(p => p.id === y.project_id) || {}).title }); }
    }
  }
  const month = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const ozdPaid = orders.filter(o => ['paid', 'production', 'shipping', 'delivered'].includes(o.status) && o.created_at >= month).reduce((s, o) => s + (o.total || 0), 0);

  const slaCut = sqlTime(new Date(Date.now() - SLA_MIN * 60000));
  const closed = ['delivered', 'cancelled', 'warranty'];
  const openO = O.filter(o => !closed.includes(o.status));
  const lateContact = openO.filter(o => o.next_contact && o.next_contact < t);
  const lateSla = leads.filter(o => o.status === 'new' && !o.taken_at && o.created_at <= slaCut);
  const active = P.filter(p => p.status === 'active');
  const stages = [];
  for (const p of active) for (const s of JSON.parse(p.stages || '[]')) if (s.end && s.end < t && stageStatus(s) !== 'done') stages.push({ project_id: p.id, project: p.title, stage: s.name, end: s.end });
  const onProject = (sid, p) => p.assignee_staff_id === sid || PS.some(r => r.project_id === p.id && r.staff_id === sid);
  const workload = S.map(s => ({
    id: s.id, name: s.name, role: s.role, role_label: ROLES[s.role] ? ROLES[s.role].label : s.role,
    open_leads: openO.filter(o => o.assignee_staff_id === s.id).length,
    late: lateContact.filter(o => o.assignee_staff_id === s.id).length,
    projects: active.filter(p => onProject(s.id, p)).length,
    issues: ISS.filter(i => i.staff_id === s.id).length,
  }));
  return json({
    today: t, funnel, ozdoba, finance: { projects: fin, ozdoba_paid_30d: ozdPaid },
    totals: { leads: leads.length, open_leads: leads.filter(o => !closed.includes(o.status)).length, orders: orders.length, active_projects: active.length, staff: S.length, issues: ISS.length },
    workload,
    overdue: { contacts: lateContact.slice(0, 50), sla: lateSla.slice(0, 50), payments: overduePay.slice(0, 50), issues: ISS.slice(0, 50), stages: stages.slice(0, 50) },
    projects: active.slice(0, 100).map(p => { const st = JSON.parse(p.stages || '[]'); return { id: p.id, title: p.title, client_name: p.client_name, service: p.service, progress: progressOf(st),
      next_step: p.next_step, next_date: p.next_date, assignee_staff_id: p.assignee_staff_id, stage: (st.find(s => stageStatus(s) !== 'done') || {}).name || null }; }),
  });
}
