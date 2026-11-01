// Журнал аудиту — лише власник (audit.view). GET ?staff=<id>&action=<префікс>&entity=&entity_id=&from=YYYY-MM-DD&before=<id>
// → {rows, next} по 100 записів, найновіші першими. before/after — JSON змінених полів.
import { bad, json } from '../../_lib.js';
import { need, noTable } from '../../_roles.js';

export async function onRequestGet({ request, env }) {
  const { error } = await need(request, env, 'audit.view');
  if (error) return error;
  const u = new URL(request.url), p = k => (u.searchParams.get(k) || '').trim();
  const w = [], a = [];
  if (/^\d+$/.test(p('staff'))) { w.push('staff_id = ?'); a.push(+p('staff')); }
  if (/^[a-z_.]{1,40}$/.test(p('action'))) { w.push('action LIKE ?'); a.push(p('action') + '%'); }
  if (/^[a-z_]{1,30}$/.test(p('entity'))) { w.push('entity = ?'); a.push(p('entity')); }
  if (p('entity_id')) { w.push('entity_id = ?'); a.push(p('entity_id').slice(0, 40)); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(p('from'))) { w.push('at >= ?'); a.push(p('from')); }
  if (/^\d+$/.test(p('before'))) { w.push('id < ?'); a.push(+p('before')); }
  try {
    const { results } = await env.DB.prepare(`SELECT * FROM audit_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT 101`).bind(...a).all();
    const rows = results.slice(0, 100).map(r => {
      const j = s => { try { return s == null ? null : JSON.parse(s); } catch { return s; } };
      return { ...r, before: j(r.before), after: j(r.after) };
    });
    return json({ rows, next: results.length > 100 ? rows[rows.length - 1].id : null });
  } catch (e) { if (noTable(e)) return json({ rows: [], next: null, pending: true }); throw e; }
}
