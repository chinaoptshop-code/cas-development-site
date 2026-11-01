// Ролі й права працівників студії (migrations/0010_staff_roles.sql). Таблиця прав — тут, опис для власника —
// tools/admin/README.md, «Персонал і ролі». Сервер перевіряє права на КОЖНОМУ запиті (не лише ховає кнопки):
//   • row-level — працівник бачить лише призначені йому заявки/обʼєкти (assignee_staff_id, project_staff);
//   • field-level — без finance.view суми й платежі вирізаються з відповіді, без clients.contacts — телефони й пошта.
// Деактивація працівника діє миттєво: staff.active перевіряється при кожному запиті (staffCtx), а сесії ще й
// анулюються (clients.session_version += 1, functions/_lib.js).
import { bad, currentClient, isAdmin, isOwner, normalizePhone, sha256, hexOf, clientIp, tgOf } from './_lib.js';

export const PERMS = {
  'panel.admin': 'Панель CRM і сайту (/kabinet/admin)',
  'dashboard.studio': 'Майстер-дашборд «вся студія»',
  'leads.view_all': 'Усі заявки',
  'leads.view_assigned': 'Призначені йому заявки',
  'leads.edit': 'Змінювати статус, нотатки, наступний контакт заявки',
  'leads.assign': 'Призначати відповідального',
  'orders.view': 'Замовлення Оздоби',
  'orders.edit': 'Змінювати замовлення Оздоби',
  'clients.view': 'База клієнтів і картка клієнта',
  'clients.contacts': 'Телефон, пошта й адреса клієнта (своїх обʼєктів)',
  'finance.view': 'Суми, платежі, борги',
  'finance.edit': 'Змінювати суми й платежі',
  'projects.view_all': 'Усі обʼєкти',
  'projects.view_assigned': 'Свої обʼєкти',
  'projects.edit': 'Створювати й редагувати обʼєкти, призначати виконавців',
  'projects.edit_stage': 'Відмічати етап виконаним',
  'reports.upload': 'Фотозвіти',
  'issues.report': '«Проблема на обʼєкті»',
  'partners.manage': 'Коди партнерів',
  'cms.edit': 'Редагування сайту',
  'staff.view': 'Список працівників (для призначення)',
  'staff.manage': 'Додавати й деактивувати працівників, ролі',
  'export': 'Експорт CSV',
  'audit.view': 'Журнал аудиту',
};
const ALL = Object.keys(PERMS);
const FIELD = ['projects.view_assigned', 'projects.edit_stage', 'clients.contacts', 'reports.upload', 'issues.report'];

// home — куди веде вхід. Власник має все; staff.manage, audit.view і dashboard.studio — лише власник.
export const ROLES = {
  owner: { label: 'Власник', home: '/kabinet/admin', perms: ALL },
  manager: { label: 'Менеджер', home: '/kabinet/team', perms: ['panel.admin', 'leads.view_all', 'leads.edit', 'leads.assign', 'orders.view', 'orders.edit',
    'clients.view', 'clients.contacts', 'finance.view', 'finance.edit', 'projects.view_all', 'projects.edit', 'projects.edit_stage',
    'reports.upload', 'issues.report', 'partners.manage', 'cms.edit', 'staff.view', 'export'] },
  designer: { label: 'Дизайнер', home: '/kabinet/team', perms: ['leads.view_assigned', 'leads.edit', ...FIELD] },
  foreman: { label: 'Прораб', home: '/kabinet/team', perms: FIELD },
  furniture: { label: 'Мебляр', home: '/kabinet/team', perms: FIELD },
  surveyor: { label: 'Геодезист', home: '/kabinet/team', perms: FIELD },
  scan3d: { label: '3D-замір', home: '/kabinet/team', perms: FIELD },
  drone: { label: 'Зйомка з дрона', home: '/kabinet/team', perms: FIELD },
  accountant: { label: 'Бухгалтер', home: '/kabinet/team', perms: ['finance.view', 'finance.edit', 'projects.view_all', 'orders.view', 'clients.view', 'export'] },
};
export const ASSIGNABLE = Object.keys(ROLES).filter(r => r !== 'owner');
export const OWNER_ONLY = ['staff.manage', 'audit.view', 'dashboard.studio'];
for (const [k, r] of Object.entries(ROLES)) if (k !== 'owner' && r.perms.some(p => OWNER_ONLY.includes(p))) throw new Error('owner-only perm in ' + k);

export const noTable = e => /no such table|no such column/i.test(String(e && e.message || e));

const CACHE = new WeakMap();
const ctxOf = (client, staff, role, extra = {}) => {
  const perms = new Set(role ? ROLES[role].perms : []);
  return {
    client, staff, role, perms, owner: role === 'owner', staffId: staff ? staff.id : null,
    name: (staff && staff.name) || (client && (client.name || client.email || (client.username && '@' + client.username))) || (client ? `#${client.id}` : ''),
    can: p => perms.has(p),
    home: role ? ROLES[role].home : '/kabinet',
    ...extra,
  };
};

// Запрошення (staff без client_id) → привʼязати до акаунта, яким людина увійшла: Telegram id, пошта Google або телефон.
async function findStaff(env, c) {
  const row = await env.DB.prepare('SELECT * FROM staff WHERE client_id = ?').bind(c.id).first();
  if (row) return row;
  const tg = tgOf(c), email = c.email ? c.email.toLowerCase() : null, phone = normalizePhone(c.phone);
  if (!tg && !email && !phone) return null;
  const inv = await env.DB.prepare(`SELECT * FROM staff WHERE client_id IS NULL AND ((tg_id IS NOT NULL AND tg_id = ?1) OR (email IS NOT NULL AND email = ?2)
      OR (phone IS NOT NULL AND phone = ?3)) ORDER BY id LIMIT 1`).bind(tg, email, phone).first();
  if (!inv) return null;
  const u = await env.DB.prepare("UPDATE staff SET client_id = ?, updated_at = datetime('now') WHERE id = ? AND client_id IS NULL").bind(c.id, inv.id).run();
  return u.meta.changes ? { ...inv, client_id: c.id } : env.DB.prepare('SELECT * FROM staff WHERE client_id = ?').bind(c.id).first();
}

// Хто робить запит: {client, staff, role, perms, can(p), owner, home}. role = null — клієнт (або гість, client = null).
// deactivated: true — працівника вимкнено (доступ до команди закрито, як у звичайного клієнта).
export async function staffCtx(request, env) {
  if (CACHE.has(request)) return CACHE.get(request);
  const p = (async () => {
    const c = await currentClient(request, env);
    if (!c) return ctxOf(null, null, null);
    const owner = isOwner(env, c);
    try {
      let row = await findStaff(env, c);
      if (owner) {
        if (!row) {
          const r = await env.DB.prepare("INSERT INTO staff (client_id, name, role, tg_id, email, note) VALUES (?, ?, 'owner', ?, ?, 'Власник (OWNER_TG_ID / OWNER_EMAIL)')")
            .bind(c.id, c.name || 'Власник', tgOf(c), c.email ? c.email.toLowerCase() : null).run();
          row = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(r.meta.last_row_id).first();
        } else if (row.role !== 'owner' || !row.active) {
          await env.DB.prepare("UPDATE staff SET role = 'owner', active = 1, deactivated_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
          row = { ...row, role: 'owner', active: 1 };
        }
        return ctxOf(c, row, 'owner');
      }
      if (row) {
        if (!row.active) return ctxOf(c, null, null, { deactivated: true });
        // роль owner може бути лише в того, кого задано змінною — інакше понижуємо до менеджера (захист від підміни в БД)
        return ctxOf(c, row, ROLES[row.role] && row.role !== 'owner' ? row.role : 'manager');
      }
      if (isAdmin(env, c)) { // перехід: старі адміни (ADMIN_TG_IDS / ADMIN_EMAILS / clients.role) → manager
        await env.DB.prepare("INSERT OR IGNORE INTO staff (client_id, name, role, tg_id, email, note) VALUES (?, ?, 'manager', ?, ?, 'Автоматично: був адміном (ADMIN_TG_IDS / ADMIN_EMAILS)')")
          .bind(c.id, c.name || c.email || `Менеджер #${c.id}`, tgOf(c), c.email ? c.email.toLowerCase() : null).run();
        const r2 = await env.DB.prepare('SELECT * FROM staff WHERE client_id = ?').bind(c.id).first();
        if (r2 && !r2.active) return ctxOf(c, null, null, { deactivated: true });
        return ctxOf(c, r2, r2 && ROLES[r2.role] && r2.role !== 'owner' ? r2.role : 'manager');
      }
      return ctxOf(c, null, null);
    } catch (e) {
      if (!noTable(e)) throw e;
      // міграція 0010 ще не застосована: як раніше — адміни бачать усе (owner/manager без рядка staff)
      return ctxOf(c, null, owner ? 'owner' : isAdmin(env, c) ? 'manager' : null, { legacy: true });
    }
  })();
  CACHE.set(request, p);
  return p;
}

// Перевірка права: повертає ctx або {error: Response}. perm — рядок або масив (досить одного).
export async function need(request, env, perm) {
  const x = await staffCtx(request, env);
  if (!x.client) return { error: bad('Потрібно увійти', 401) };
  if (!x.role) return { error: bad(x.deactivated ? 'Доступ працівника вимкнено' : 'Немає доступу', 403) };
  const list = perm == null ? [] : Array.isArray(perm) ? perm : [perm];
  if (list.length && !list.some(p => x.can(p))) return { error: bad('Немає права: ' + list.map(p => PERMS[p] || p).join(' або '), 403) };
  return { x };
}

// ===== Row-level: обʼєкти й заявки працівника =====
// SQL-умова видимості проєкту p (аліас) для ctx; args дописуються.
export function projectScope(x, args, alias = 'p') {
  if (x.can('projects.view_all')) return '1=1';
  if (!x.can('projects.view_assigned') || !x.staffId) return '0=1';
  args.push(x.staffId, x.staffId);
  return `(${alias}.assignee_staff_id = ? OR EXISTS (SELECT 1 FROM project_staff ps WHERE ps.project_id = ${alias}.id AND ps.staff_id = ?))`;
}
export async function canSeeProject(env, x, projectId) {
  const args = [];
  const w = projectScope(x, args);
  try {
    return !!await env.DB.prepare(`SELECT 1 FROM projects p WHERE p.id = ? AND ${w}`).bind(Number(projectId) || 0, ...args).first();
  } catch (e) { if (noTable(e)) return x.can('projects.view_all'); throw e; }
}
// Заявки (kind=lead) і замовлення Оздоби (kind=order) у CRM
export function orderScope(x, args, alias = 'o') {
  const parts = [];
  if (x.can('leads.view_all')) parts.push(`${alias}.kind = 'lead'`);
  else if (x.can('leads.view_assigned') && x.staffId) { parts.push(`(${alias}.kind = 'lead' AND ${alias}.assignee_staff_id = ?)`); args.push(x.staffId); }
  if (x.can('orders.view')) parts.push(`${alias}.kind = 'order'`);
  return parts.length ? '(' + parts.join(' OR ') + ')' : '0=1';
}

// ===== Field-level =====
const MONEY_O = ['amount', 'total', 'discount', 'discount_pct', 'payment', 'paid', 'promo', 'currency'];
const CONTACT_O = ['phone', 'email', 'username', 'company'];
export function shapeOrder(o, x) {
  const r = { ...o };
  if (!x.can('finance.view')) {
    for (const k of MONEY_O) delete r[k];
    if (Array.isArray(r.items)) r.items = r.items.map(({ price, ...i }) => i);
  }
  if (!x.can('clients.contacts')) for (const k of CONTACT_O) delete r[k];
  return r;
}
export function shapeProject(p, x) {
  const r = { ...p };
  if (!x.can('finance.view')) { delete r.contract_amount; delete r.contract_currency; delete r.payments; }
  if (!x.can('clients.contacts')) { delete r.client_phone; delete r.client_email; delete r.address; delete r.camera_url; delete r.camera_note; }
  return r;
}

// ===== Аудит =====
const clip = v => { if (v == null) return null; const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 8000 ? s.slice(0, 7990) + '…' : s; };
export async function audit(env, request, x, action, entity, entityId, before, after) {
  try {
    const ip = clientIp(request);
    await env.DB.prepare('INSERT INTO audit_log (client_id, staff_id, actor, role, action, entity, entity_id, before, after, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(x && x.client ? x.client.id : null, x ? x.staffId : null, x ? x.name : null, x ? x.role : null, action, entity || null,
        entityId == null ? null : String(entityId), clip(before), clip(after), ip ? hexOf(await sha256('audit|' + ip)).slice(0, 16) : null).run();
  } catch (e) { if (!noTable(e)) console.log('audit', e && e.message); }
}
// лише змінені поля: {before, after}
export function diff(a, b, keys) {
  const before = {}, after = {};
  for (const k of keys) if (String(a[k] ?? '') !== String(b[k] ?? '')) { before[k] = a[k] ?? null; after[k] = b[k] ?? null; }
  return Object.keys(after).length ? { before, after } : null;
}

// ===== Працівники =====
export const staffLabel = r => (ROLES[r] ? ROLES[r].label : r);
export async function staffById(env, id) {
  if (!id) return null;
  try { return await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(Number(id)).first(); } catch (e) { if (noTable(e)) return null; throw e; }
}
// Telegram id працівника для сповіщень: запрошення (tg_id) або акаунт, яким він входить
export async function staffTg(env, s) {
  if (!s || !s.active) return null;
  if (s.tg_id && /^\d{1,20}$/.test(s.tg_id)) return s.tg_id;
  if (!s.client_id) return null;
  const c = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(s.client_id).first();
  return tgOf(c);
}
