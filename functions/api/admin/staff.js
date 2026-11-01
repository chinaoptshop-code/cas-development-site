// Персонал студії (migrations/0010, functions/_roles.js).
// GET            — staff.view: активні працівники для призначення (id, імʼя, роль);
//                  staff.manage (лише власник): усі з контактами-запрошеннями, статусом входу, навантаженням; + roles і perms.
// POST {name, role, tg?, email?, phone?, note?}            — додати працівника (staff.manage). Вхід — тим акаунтом, що збігся
//                  з tg / email / phone: перший вхід привʼязує його автоматично (functions/_roles.js findStaff).
// PATCH {id, name?, role?, active?, note?, tg?, email?, phone?, logout?: true} — змінити / деактивувати / «вийти на всіх пристроях».
// Заборонено: призначати роль owner, змінювати власника, змінювати самого себе (ескалація) — 403. Усе — в audit_log.
import { bad, bumpSession, json, normalizePhone, readJSON, str } from '../../_lib.js';
import { ASSIGNABLE, PERMS, ROLES, audit, need, noTable } from '../../_roles.js';

const tgOk = v => (v == null || v === '' ? null : /^\d{1,20}$/.test(String(v).trim()) ? String(v).trim() : undefined);
const emailOk = v => (v == null || v === '' ? null : /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(String(v).trim()) ? String(v).trim().toLowerCase() : undefined);
const phoneOk = v => (v == null || v === '' ? null : normalizePhone(v) || undefined);
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
const pub = s => ({ id: s.id, name: s.name, role: s.role, role_label: ROLES[s.role] ? ROLES[s.role].label : s.role, active: !!s.active });

export async function onRequestGet({ request, env }) {
  const { x, error } = await need(request, env, ['staff.view', 'staff.manage']);
  if (error) return error;
  try {
    if (!x.can('staff.manage')) {
      const { results } = await env.DB.prepare('SELECT id, name, role, active FROM staff WHERE active = 1 ORDER BY name').all();
      return json({ staff: results.map(pub) });
    }
    const { results } = await env.DB.prepare(`SELECT s.*, c.name AS account_name, c.provider, c.last_login,
        (SELECT COUNT(*) FROM orders o WHERE o.assignee_staff_id = s.id AND o.status NOT IN ('delivered', 'cancelled', 'warranty')) AS open_leads,
        (SELECT COUNT(*) FROM projects p WHERE p.status = 'active' AND (p.assignee_staff_id = s.id OR EXISTS (SELECT 1 FROM project_staff ps WHERE ps.project_id = p.id AND ps.staff_id = s.id))) AS active_projects,
        (SELECT COUNT(*) FROM project_issues i WHERE i.staff_id = s.id AND i.status = 'open') AS open_issues
      FROM staff s LEFT JOIN clients c ON c.id = s.client_id ORDER BY s.active DESC, CASE s.role WHEN 'owner' THEN 0 ELSE 1 END, s.name`).all();
    return json({
      staff: results.map(s => ({ ...pub(s), tg_id: s.tg_id, email: s.email, phone: s.phone, note: s.note, linked: !!s.client_id, account_name: s.account_name,
        provider: s.provider, last_login: s.last_login, created_at: s.created_at, deactivated_at: s.deactivated_at,
        open_leads: s.open_leads, active_projects: s.active_projects, open_issues: s.open_issues, me: s.id === x.staffId })),
      roles: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { label: r.label, perms: r.perms, home: r.home }])),
      assignable: ASSIGNABLE, perms: PERMS,
    });
  } catch (e) { if (noTable(e)) return bad('Розділ оновлюється (міграція 0010) — спробуйте за кілька хвилин', 503); throw e; }
}

export async function onRequestPost({ request, env }) {
  const { x, error } = await need(request, env, 'staff.manage');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 8 * 1024); } catch { return bad('Некоректні дані'); }
  const name = str(d.name, 80);
  if (!name) return bad('Вкажіть імʼя працівника', 422);
  if (d.role === 'owner') return bad('Роль «Власник» — лише одна, її не призначають', 403);
  if (!ASSIGNABLE.includes(d.role)) return bad('Невідома роль', 422);
  const tg = tgOk(d.tg), email = emailOk(d.email), phone = phoneOk(d.phone);
  if (tg === undefined) return bad('Telegram id — лише цифри (дізнатися: бот @userinfobot)', 422);
  if (email === undefined) return bad('Некоректна пошта', 422);
  if (phone === undefined) return bad('Некоректний номер телефону', 422);
  if (!tg && !email && !phone) return bad('Вкажіть Telegram id, пошту Google або телефон — за ним працівник увійде', 422);
  const dup = await env.DB.prepare(`SELECT s.id, s.name FROM staff s LEFT JOIN clients c ON c.id = s.client_id
      WHERE (?1 IS NOT NULL AND (s.tg_id = ?1 OR (c.provider = 'telegram' AND c.provider_id = ?1) OR c.tg_id = ?1))
         OR (?2 IS NOT NULL AND (s.email = ?2 OR lower(c.email) = ?2)) OR (?3 IS NOT NULL AND (s.phone = ?3 OR c.phone = ?3)) LIMIT 1`).bind(tg, email, phone).first();
  if (dup) return bad(`Такий працівник уже є: ${dup.name}`, 409);
  // акаунт уже існує (людина входила як клієнт) — привʼязуємо одразу
  const acc = await env.DB.prepare(`SELECT id FROM clients WHERE (?1 IS NOT NULL AND ((provider = 'telegram' AND provider_id = ?1) OR tg_id = ?1))
      OR (?2 IS NOT NULL AND lower(email) = ?2) OR (?3 IS NOT NULL AND phone = ?3) ORDER BY id LIMIT 1`).bind(tg, email, phone).first();
  const r = await env.DB.prepare('INSERT INTO staff (client_id, name, role, tg_id, email, phone, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(acc ? acc.id : null, name, d.role, tg, email, phone, str(d.note, 300), x.staffId).run();
  const id = r.meta.last_row_id;
  if (acc) await bumpSession(env, acc.id); // клієнтська сесія (30 днів) → увійти заново, вже як працівник (7 днів)
  await audit(env, request, x, 'staff.create', 'staff', id, null, { name, role: d.role, tg, email, phone, linked: !!acc });
  return json({ ok: true, id, linked: !!acc });
}

export async function onRequestPatch({ request, env }) {
  const { x, error } = await need(request, env, 'staff.manage');
  if (error) return error;
  let d;
  try { d = await readJSON(request, 8 * 1024); } catch { return bad('Некоректні дані'); }
  const s = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(Number(d.id) || 0).first();
  if (!s) return bad('Працівника не знайдено', 404);
  if (s.role === 'owner') return bad('Власника змінити не можна (задається змінною OWNER_TG_ID / OWNER_EMAIL)', 403);
  if (s.id === x.staffId) return bad('Змінювати власну роль і доступ не можна', 403);
  if (has(d, 'role') && (d.role === 'owner' || !ASSIGNABLE.includes(d.role))) return bad(d.role === 'owner' ? 'Роль «Власник» не призначають' : 'Невідома роль', 403);
  const n = {
    name: has(d, 'name') ? str(d.name, 80) || s.name : s.name,
    role: has(d, 'role') ? d.role : s.role,
    active: has(d, 'active') ? (d.active ? 1 : 0) : s.active,
    note: has(d, 'note') ? str(d.note, 300) : s.note,
    tg_id: has(d, 'tg') ? tgOk(d.tg) : s.tg_id,
    email: has(d, 'email') ? emailOk(d.email) : s.email,
    phone: has(d, 'phone') ? phoneOk(d.phone) : s.phone,
  };
  if (n.tg_id === undefined || n.email === undefined || n.phone === undefined) return bad('Некоректний Telegram id, пошта або телефон', 422);
  await env.DB.prepare(`UPDATE staff SET name = ?, role = ?, active = ?, note = ?, tg_id = ?, email = ?, phone = ?, updated_at = datetime('now'),
      deactivated_at = CASE WHEN ? = 0 THEN COALESCE(deactivated_at, datetime('now')) ELSE NULL END WHERE id = ?`)
    .bind(n.name, n.role, n.active, n.note, n.tg_id, n.email, n.phone, n.active, s.id).run();
  // деактивація, зміна ролі або «вийти на всіх пристроях» — усі сесії працівника недійсні негайно
  const kill = s.client_id && ((s.active && !n.active) || n.role !== s.role || d.logout === true);
  if (kill) await bumpSession(env, s.client_id);
  const before = {}, after = {};
  for (const k of Object.keys(n)) if (String(n[k] ?? '') !== String(s[k] ?? '')) { before[k] = s[k]; after[k] = n[k]; }
  if (d.logout === true) after.logout = true;
  const action = s.active && !n.active ? 'staff.deactivate' : !s.active && n.active ? 'staff.activate' : n.role !== s.role ? 'staff.role' : d.logout ? 'staff.logout' : 'staff.update';
  await audit(env, request, x, action, 'staff', s.id, before, after);
  return json({ ok: true, sessions_revoked: !!kill });
}
