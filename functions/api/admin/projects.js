// Проєкти клієнтів для менеджера (вкладка «Проєкти» в /kabinet/admin). Лише адміни (isAdmin, як admin/orders.js).
// GET    /api/admin/projects[?client_id=N]          → {projects, reports, documents}
// POST   /api/admin/projects {type, ...}            — створити:
//          type 'project':  {client_id, title, service?, address?, area?, status?, stages?, next_step?, next_date?, manager?}
//          type 'report':   {project_id, date, title?, note?, photos: ["https://…"]}
//          type 'document': {client_id, project_id?, order_id?, kind, title, url}
//          type 'partner':  {client_id, code}  — привʼязати особистий код партнера до клієнта (code: null — відвʼязати)
// PATCH  /api/admin/projects {type: 'project'|'report', id, ...поля}  — змінити
// DELETE /api/admin/projects?type=project|report|document&id=N
import { admin, body, date, httpsUrl, int, json, bad, noTable, notReady, txt } from '../../_account.js';
import { normCode } from '../../_lib.js';

const SERVICES = ['design', 'repair', 'build', 'furnish', 'landscape', 'other'];
const STATUS = ['active', 'paused', 'done'];
const KINDS = ['contract', 'estimate', 'invoice', 'act', 'design', 'other'];

function stagesOf(v) {
  if (!Array.isArray(v)) return null;
  return v.slice(0, 20).map(s => ({
    name: txt(s && s.name, 80) || 'Етап', progress: Math.max(0, Math.min(100, int(s && s.progress) || 0)),
    start: date(s && s.start), end: date(s && s.end), note: txt(s && s.note, 300),
  }));
}
const photosOf = v => (Array.isArray(v) ? v.map(httpsUrl).filter(Boolean).slice(0, 30) : []);

function projectFields(d, cur = {}) {
  const has = k => Object.prototype.hasOwnProperty.call(d, k);
  const p = {
    title: has('title') ? txt(d.title, 120) : cur.title,
    service: has('service') ? (SERVICES.includes(d.service) ? d.service : 'other') : (cur.service || 'other'),
    address: has('address') ? txt(d.address, 200) : cur.address,
    area: has('area') ? (Number(d.area) > 0 && Number(d.area) < 1e6 ? Number(d.area) : null) : cur.area,
    status: has('status') ? (STATUS.includes(d.status) ? d.status : 'active') : (cur.status || 'active'),
    stages: has('stages') ? JSON.stringify(stagesOf(d.stages) || []) : (cur.stages || '[]'),
    next_step: has('next_step') ? txt(d.next_step, 300) : cur.next_step,
    next_date: has('next_date') ? date(d.next_date) : cur.next_date,
    manager: has('manager') ? txt(d.manager, 80) : cur.manager,
  };
  return p.title ? { p } : { error: 'Вкажіть назву проєкту' };
}

const run = async fn => { try { return await fn(); } catch (e) { if (noTable(e)) return notReady(); throw e; } };

export async function onRequestGet({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const cid = int(new URL(request.url).searchParams.get('client_id'));
  return run(async () => {
    const w = cid ? ' WHERE p.client_id = ?' : '';
    const P = (await env.DB.prepare(`SELECT p.*, c.name AS client_name, c.phone AS client_phone FROM projects p LEFT JOIN clients c ON c.id = p.client_id${w} ORDER BY p.id DESC LIMIT 300`)
      .bind(...(cid ? [cid] : [])).all()).results.map(p => ({ ...p, stages: JSON.parse(p.stages || '[]') }));
    const ids = P.map(p => p.id);
    const R = ids.length ? (await env.DB.prepare(`SELECT * FROM project_reports WHERE project_id IN (${ids.map(() => '?').join(',')}) ORDER BY date DESC LIMIT 1000`).bind(...ids).all())
      .results.map(r => ({ ...r, photos: JSON.parse(r.photos || '[]') })) : [];
    const D = (await env.DB.prepare(`SELECT * FROM documents${cid ? ' WHERE client_id = ?' : ''} ORDER BY id DESC LIMIT 1000`).bind(...(cid ? [cid] : [])).all()).results;
    return json({ projects: P, reports: R, documents: D, services: SERVICES, statuses: STATUS, kinds: KINDS });
  });
}

export async function onRequestPost({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 32 * 1024);
  if (e1) return e1;
  return run(async () => {
    if (d.type === 'project') {
      const cl = await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(int(d.client_id)).first();
      if (!cl) return bad('Клієнта не знайдено', 404);
      const { p, error: e2 } = projectFields(d);
      if (e2) return bad(e2, 422);
      const r = await env.DB.prepare('INSERT INTO projects (client_id, title, service, address, area, status, stages, next_step, next_date, manager) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cl.id, p.title, p.service, p.address ?? null, p.area ?? null, p.status, p.stages, p.next_step ?? null, p.next_date ?? null, p.manager ?? null).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'report') {
      const pr = await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr) return bad('Проєкт не знайдено', 404);
      const dt = date(d.date) || new Date().toISOString().slice(0, 10);
      const photos = photosOf(d.photos);
      if (!photos.length && !txt(d.note, 10)) return bad('Додайте фото (https-посилання) або опис', 422);
      const r = await env.DB.prepare('INSERT INTO project_reports (project_id, date, title, note, photos) VALUES (?, ?, ?, ?, ?)')
        .bind(pr.id, dt, txt(d.title, 120), txt(d.note, 2000), JSON.stringify(photos)).run();
      await env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(pr.id).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'document') {
      const cl = await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(int(d.client_id)).first();
      if (!cl) return bad('Клієнта не знайдено', 404);
      const url = httpsUrl(d.url), title = txt(d.title, 160);
      if (!url || !title) return bad('Потрібні назва й https-посилання', 422);
      const pid = d.project_id ? int(d.project_id) : null, oid = d.order_id ? int(d.order_id) : null;
      if (pid && !await env.DB.prepare('SELECT 1 FROM projects WHERE id = ? AND client_id = ?').bind(pid, cl.id).first()) return bad('Проєкт іншого клієнта', 422);
      if (oid && !await env.DB.prepare('SELECT 1 FROM orders WHERE id = ? AND client_id = ?').bind(oid, cl.id).first()) return bad('Замовлення іншого клієнта', 422);
      const r = await env.DB.prepare('INSERT INTO documents (client_id, project_id, order_id, kind, title, url) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(cl.id, pid, oid, KINDS.includes(d.kind) ? d.kind : 'other', title, url).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'partner') {
      const cid = int(d.client_id);
      if (!await env.DB.prepare('SELECT 1 FROM clients WHERE id = ?').bind(cid).first()) return bad('Клієнта не знайдено', 404);
      await env.DB.prepare('UPDATE partner_codes SET client_id = NULL WHERE client_id = ?').bind(cid).run();
      if (d.code) {
        const code = normCode(d.code);
        const r = code && await env.DB.prepare('UPDATE partner_codes SET client_id = ? WHERE code = ?').bind(cid, code).run();
        if (!r || !r.meta.changes) return bad('Код не знайдено', 404);
      }
      return json({ ok: true });
    }
    return bad('Невідомий type');
  });
}

export async function onRequestPatch({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 32 * 1024);
  if (e1) return e1;
  return run(async () => {
    if (d.type === 'report') {
      const r = await env.DB.prepare('SELECT * FROM project_reports WHERE id = ?').bind(int(d.id)).first();
      if (!r) return bad('Звіт не знайдено', 404);
      await env.DB.prepare('UPDATE project_reports SET date = ?, title = ?, note = ?, photos = ? WHERE id = ?')
        .bind(date(d.date) || r.date, d.title !== undefined ? txt(d.title, 120) : r.title, d.note !== undefined ? txt(d.note, 2000) : r.note,
          d.photos !== undefined ? JSON.stringify(photosOf(d.photos)) : r.photos, r.id).run();
      return json({ ok: true });
    }
    const cur = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(int(d.id)).first();
    if (!cur) return bad('Проєкт не знайдено', 404);
    const { p, error: e2 } = projectFields(d, cur);
    if (e2) return bad(e2, 422);
    await env.DB.prepare(`UPDATE projects SET title = ?, service = ?, address = ?, area = ?, status = ?, stages = ?, next_step = ?, next_date = ?, manager = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(p.title, p.service, p.address ?? null, p.area ?? null, p.status, p.stages, p.next_step ?? null, p.next_date ?? null, p.manager ?? null, cur.id).run();
    return json({ ok: true });
  });
}

export async function onRequestDelete({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const u = new URL(request.url), type = u.searchParams.get('type'), id = int(u.searchParams.get('id'));
  return run(async () => {
    if (type === 'report') await env.DB.prepare('DELETE FROM project_reports WHERE id = ?').bind(id).run();
    else if (type === 'document') await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
    else if (type === 'project') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM project_reports WHERE project_id = ?').bind(id),
        env.DB.prepare('UPDATE documents SET project_id = NULL WHERE project_id = ?').bind(id),
        env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
      ]);
    } else return bad('Невідомий type');
    return json({ ok: true });
  });
}
