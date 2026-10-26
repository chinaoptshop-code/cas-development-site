// Проєкти клієнтів для менеджера (вкладка «Проєкти» в /kabinet/admin). Лише адміни (isAdmin, як admin/orders.js).
// GET    /api/admin/projects[?client_id=N]          → {projects, reports, documents, payments, online}
// POST   /api/admin/projects {type, ...}            — створити:
//          type 'project':  {client_id, title, service?, address?, area?, status?, stages?, next_step?, next_date?, manager?, camera_url?, camera_note?}
//                           stages: [{id?, name, status?, progress, start?, end?, note?}] — id етапу сервер ставить сам (короткий ключ)
//          type 'report':   {project_id, date, title?, note?, photos: ["https://…"], stage_id?}
//          type 'document': {client_id, project_id?, order_id?, kind, title, url, stage_id?}   — акт етапу: kind 'act' + stage_id
//          type 'payment':  {project_id, title, stage_id?, pct?, amount?, currency?, due_date?, paid_date?, status?, note?, sort?}
//          type 'partner':  {client_id, code}  — привʼязати особистий код партнера до клієнта (code: null — відвʼязати)
// PATCH  /api/admin/projects {type: 'project'|'report'|'payment', id, ...поля}  — змінити
// DELETE /api/admin/projects?type=project|report|document|payment&id=N
// Камера (camera_url, міграція 0008): https без логіна/пароля в адресі; YouTube вбудовується (youtube-nocookie), кадр .jpg — картинкою,
// решта — посилання в новій вкладці (functions/_account.js cameraOf). Записи — не частіше 600/год з IP (functions/_rate.js);
// CSRF, JSON-only і розмір тіла — functions/api/_middleware.js.
import {
  admin, body, cameraOf, CURRENCIES, date, httpsUrl, int, json, bad, newStageKey, noTable, notReady,
  PAY_STATUS, STAGE_STATUS, stageKey, stageStatus, txt,
} from '../../_account.js';
import { normCode } from '../../_lib.js';
import { limited } from '../../_rate.js';

const SERVICES = ['design', 'repair', 'build', 'furnish', 'landscape', 'other'];
const STATUS = ['active', 'paused', 'done'];
const KINDS = ['contract', 'estimate', 'invoice', 'act', 'design', 'other'];

function stagesOf(v) {
  if (!Array.isArray(v)) return null;
  const seen = new Set();
  return v.slice(0, 20).map(s => {
    let id = stageKey(s && s.id);
    if (!id || seen.has(id)) id = newStageKey();
    seen.add(id);
    const progress = Math.max(0, Math.min(100, int(s && s.progress) || 0));
    const status = s && STAGE_STATUS[s.status] ? s.status : stageStatus({ progress });
    return {
      id, name: txt(s && s.name, 80) || 'Етап', status, progress: status === 'done' ? 100 : progress,
      start: date(s && s.start), end: date(s && s.end), note: txt(s && s.note, 300),
    };
  });
}
const photosOf = v => (Array.isArray(v) ? v.map(httpsUrl).filter(Boolean).slice(0, 30) : []);
// етап за id — лише з етапів цього проєкту, інакше null
function stageIn(stagesJson, v) {
  const k = stageKey(v);
  if (!k) return null;
  try { return JSON.parse(stagesJson || '[]').some(s => s && s.id === k) ? k : null; } catch { return null; }
}
const num = (v, max = 1e9) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > max ? null : Math.round(Number(v) * 100) / 100);
const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);

function projectFields(d, cur = {}) {
  const h = k => has(d, k);
  const p = {
    title: h('title') ? txt(d.title, 120) : cur.title,
    service: h('service') ? (SERVICES.includes(d.service) ? d.service : 'other') : (cur.service || 'other'),
    address: h('address') ? txt(d.address, 200) : cur.address,
    area: h('area') ? (Number(d.area) > 0 && Number(d.area) < 1e6 ? Number(d.area) : null) : cur.area,
    status: h('status') ? (STATUS.includes(d.status) ? d.status : 'active') : (cur.status || 'active'),
    stages: h('stages') ? JSON.stringify(stagesOf(d.stages) || []) : (cur.stages || '[]'),
    next_step: h('next_step') ? txt(d.next_step, 300) : cur.next_step,
    next_date: h('next_date') ? date(d.next_date) : cur.next_date,
    manager: h('manager') ? txt(d.manager, 80) : cur.manager,
  };
  return p.title ? { p } : { error: 'Вкажіть назву проєкту' };
}

// Графік платежів: схема в кожного клієнта своя — лише рядки бази
function paymentFields(d, cur = {}, stagesJson) {
  const h = k => has(d, k);
  const p = {
    title: h('title') ? txt(d.title, 120) : cur.title,
    stage_id: h('stage_id') ? stageIn(stagesJson, d.stage_id) : (cur.stage_id ?? null),
    pct: h('pct') ? num(d.pct, 100) : (cur.pct ?? null),
    amount: h('amount') ? num(d.amount) : (cur.amount ?? null),
    currency: h('currency') ? (CURRENCIES.includes(d.currency) ? d.currency : 'USD') : (cur.currency || 'USD'),
    due_date: h('due_date') ? date(d.due_date) : (cur.due_date ?? null),
    paid_date: h('paid_date') ? date(d.paid_date) : (cur.paid_date ?? null),
    status: h('status') ? (PAY_STATUS[d.status] ? d.status : 'planned') : (cur.status || 'planned'),
    note: h('note') ? txt(d.note, 300) : (cur.note ?? null),
    sort: h('sort') ? (int(d.sort) || 0) : (cur.sort || 0),
  };
  if (p.status === 'paid' && !p.paid_date) p.paid_date = new Date().toISOString().slice(0, 10);
  return p.title ? { p } : { error: 'Вкажіть назву платежу (напр. «Аванс»)' };
}

// Камера: '' — прибрати; інакше лише коректне https-посилання без логіна/пароля
function cameraFields(d) {
  if (!has(d, 'camera_url') && !has(d, 'camera_note')) return null;
  const raw = String(d.camera_url == null ? '' : d.camera_url).trim();
  const cam = raw ? cameraOf(raw) : null;
  if (raw && !cam) return { error: 'Посилання на камеру — лише https://…, без логіна й пароля в адресі' };
  return { url: cam ? cam.url : null, note: txt(d.camera_note, 300) };
}

const run = async fn => { try { return await fn(); } catch (e) { if (noTable(e)) return notReady(); throw e; } };
const tolerant = p => p.catch(e => { if (!noTable(e)) throw e; }); // колонка/таблиця 0008 ще не створена — не заважає основній зміні
const tooMany = () => bad('Забагато змін поспіль — зачекайте кілька хвилин', 429);
const touch = (env, id) => env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(id).run();

export async function onRequestGet({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const cid = int(new URL(request.url).searchParams.get('client_id'));
  return run(async () => {
    const w = cid ? ' WHERE p.client_id = ?' : '';
    const P = (await env.DB.prepare(`SELECT p.*, c.name AS client_name, c.phone AS client_phone FROM projects p LEFT JOIN clients c ON c.id = p.client_id${w} ORDER BY p.id DESC LIMIT 300`)
      .bind(...(cid ? [cid] : [])).all()).results.map(p => ({ ...p, stages: JSON.parse(p.stages || '[]').map(s => ({ ...s, status: stageStatus(s) })) }));
    const ids = P.map(p => p.id), q = ids.map(() => '?').join(',');
    const R = ids.length ? (await env.DB.prepare(`SELECT * FROM project_reports WHERE project_id IN (${q}) ORDER BY date DESC LIMIT 1000`).bind(...ids).all())
      .results.map(r => ({ ...r, photos: JSON.parse(r.photos || '[]') })) : [];
    const D = (await env.DB.prepare(`SELECT * FROM documents${cid ? ' WHERE client_id = ?' : ''} ORDER BY id DESC LIMIT 1000`).bind(...(cid ? [cid] : [])).all()).results;
    let PAY = [], online = true;
    try {
      PAY = ids.length ? (await env.DB.prepare(`SELECT * FROM project_payments WHERE project_id IN (${q}) ORDER BY sort, COALESCE(due_date, '9999'), id LIMIT 2000`).bind(...ids).all()).results : [];
    } catch (e) { if (!noTable(e)) throw e; online = false; }
    return json({
      projects: P, reports: R, documents: D, payments: PAY, online, services: SERVICES, statuses: STATUS, kinds: KINDS,
      stage_statuses: STAGE_STATUS, pay_statuses: PAY_STATUS, currencies: CURRENCIES,
    });
  });
}

export async function onRequestPost({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 32 * 1024);
  if (e1) return e1;
  if (await limited(env, request, 'admin-projects', 600)) return tooMany();
  return run(async () => {
    if (d.type === 'project') {
      const cl = await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(int(d.client_id)).first();
      if (!cl) return bad('Клієнта не знайдено', 404);
      const { p, error: e2 } = projectFields(d);
      if (e2) return bad(e2, 422);
      const cam = cameraFields(d);
      if (cam && cam.error) return bad(cam.error, 422);
      const r = await env.DB.prepare('INSERT INTO projects (client_id, title, service, address, area, status, stages, next_step, next_date, manager) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cl.id, p.title, p.service, p.address ?? null, p.area ?? null, p.status, p.stages, p.next_step ?? null, p.next_date ?? null, p.manager ?? null).run();
      if (cam) await env.DB.prepare('UPDATE projects SET camera_url = ?, camera_note = ? WHERE id = ?').bind(cam.url, cam.note, r.meta.last_row_id).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'report') {
      const pr = await env.DB.prepare('SELECT id, stages FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr) return bad('Проєкт не знайдено', 404);
      const dt = date(d.date) || new Date().toISOString().slice(0, 10);
      const photos = photosOf(d.photos);
      if (!photos.length && !txt(d.note, 10)) return bad('Додайте фото (https-посилання) або опис', 422);
      const r = await env.DB.prepare('INSERT INTO project_reports (project_id, date, title, note, photos) VALUES (?, ?, ?, ?, ?)')
        .bind(pr.id, dt, txt(d.title, 120), txt(d.note, 2000), JSON.stringify(photos)).run();
      const sid = stageIn(pr.stages, d.stage_id);
      if (sid) await tolerant(env.DB.prepare('UPDATE project_reports SET stage_id = ? WHERE id = ?').bind(sid, r.meta.last_row_id).run());
      await touch(env, pr.id);
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'document') {
      const cl = await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(int(d.client_id)).first();
      if (!cl) return bad('Клієнта не знайдено', 404);
      const url = httpsUrl(d.url), title = txt(d.title, 160);
      if (!url || !title) return bad('Потрібні назва й https-посилання', 422);
      const pid = d.project_id ? int(d.project_id) : null, oid = d.order_id ? int(d.order_id) : null;
      const prj = pid ? await env.DB.prepare('SELECT id, stages FROM projects WHERE id = ? AND client_id = ?').bind(pid, cl.id).first() : null;
      if (pid && !prj) return bad('Проєкт іншого клієнта', 422);
      if (oid && !await env.DB.prepare('SELECT 1 FROM orders WHERE id = ? AND client_id = ?').bind(oid, cl.id).first()) return bad('Замовлення іншого клієнта', 422);
      const r = await env.DB.prepare('INSERT INTO documents (client_id, project_id, order_id, kind, title, url) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(cl.id, pid, oid, KINDS.includes(d.kind) ? d.kind : 'other', title, url).run();
      const sid = prj && stageIn(prj.stages, d.stage_id);
      if (sid) await tolerant(env.DB.prepare('UPDATE documents SET stage_id = ? WHERE id = ?').bind(sid, r.meta.last_row_id).run());
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (d.type === 'payment') {
      const pr = await env.DB.prepare('SELECT id, stages FROM projects WHERE id = ?').bind(int(d.project_id)).first();
      if (!pr) return bad('Проєкт не знайдено', 404);
      const { p, error: e2 } = paymentFields(d, {}, pr.stages);
      if (e2) return bad(e2, 422);
      const r = await env.DB.prepare(`INSERT INTO project_payments (project_id, stage_id, title, pct, amount, currency, due_date, paid_date, status, note, sort)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(pr.id, p.stage_id, p.title, p.pct, p.amount, p.currency, p.due_date, p.paid_date, p.status, p.note, p.sort).run();
      await touch(env, pr.id);
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
  if (await limited(env, request, 'admin-projects', 600)) return tooMany();
  return run(async () => {
    if (d.type === 'report') {
      const r = await env.DB.prepare('SELECT * FROM project_reports WHERE id = ?').bind(int(d.id)).first();
      if (!r) return bad('Звіт не знайдено', 404);
      await env.DB.prepare('UPDATE project_reports SET date = ?, title = ?, note = ?, photos = ? WHERE id = ?')
        .bind(date(d.date) || r.date, d.title !== undefined ? txt(d.title, 120) : r.title, d.note !== undefined ? txt(d.note, 2000) : r.note,
          d.photos !== undefined ? JSON.stringify(photosOf(d.photos)) : r.photos, r.id).run();
      if (d.stage_id !== undefined) {
        const pr = await env.DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(r.project_id).first();
        await env.DB.prepare('UPDATE project_reports SET stage_id = ? WHERE id = ?').bind(stageIn(pr && pr.stages, d.stage_id), r.id).run();
      }
      return json({ ok: true });
    }
    if (d.type === 'payment') {
      const cur = await env.DB.prepare('SELECT * FROM project_payments WHERE id = ?').bind(int(d.id)).first();
      if (!cur) return bad('Платіж не знайдено', 404);
      const pr = await env.DB.prepare('SELECT stages FROM projects WHERE id = ?').bind(cur.project_id).first();
      const { p, error: e2 } = paymentFields(d, cur, pr && pr.stages);
      if (e2) return bad(e2, 422);
      await env.DB.prepare('UPDATE project_payments SET stage_id = ?, title = ?, pct = ?, amount = ?, currency = ?, due_date = ?, paid_date = ?, status = ?, note = ?, sort = ? WHERE id = ?')
        .bind(p.stage_id, p.title, p.pct, p.amount, p.currency, p.due_date, p.paid_date, p.status, p.note, p.sort, cur.id).run();
      await touch(env, cur.project_id);
      return json({ ok: true });
    }
    const cur = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(int(d.id)).first();
    if (!cur) return bad('Проєкт не знайдено', 404);
    const { p, error: e2 } = projectFields(d, cur);
    if (e2) return bad(e2, 422);
    const cam = cameraFields(d);
    if (cam && cam.error) return bad(cam.error, 422);
    await env.DB.prepare(`UPDATE projects SET title = ?, service = ?, address = ?, area = ?, status = ?, stages = ?, next_step = ?, next_date = ?, manager = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(p.title, p.service, p.address ?? null, p.area ?? null, p.status, p.stages, p.next_step ?? null, p.next_date ?? null, p.manager ?? null, cur.id).run();
    // камера — окремо: до міграції 0008 решта проєкту зберігається, а камера — ні (поле порожнє — нічого не ламаємо)
    if (cam && (cam.url || cam.note || cur.camera_url !== undefined)) await env.DB.prepare('UPDATE projects SET camera_url = ?, camera_note = ? WHERE id = ?').bind(cam.url, cam.note, cur.id).run();
    return json({ ok: true });
  });
}

export async function onRequestDelete({ request, env }) {
  const { error } = await admin(request, env);
  if (error) return error;
  const u = new URL(request.url), type = u.searchParams.get('type'), id = int(u.searchParams.get('id'));
  if (await limited(env, request, 'admin-projects', 600)) return tooMany();
  return run(async () => {
    if (type === 'payment') await env.DB.prepare('DELETE FROM project_payments WHERE id = ?').bind(id).run();
    else if (type === 'report') await env.DB.prepare('DELETE FROM project_reports WHERE id = ?').bind(id).run();
    else if (type === 'document') await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
    else if (type === 'project') {
      await tolerant(env.DB.prepare('DELETE FROM project_payments WHERE project_id = ?').bind(id).run());
      await env.DB.batch([
        env.DB.prepare('DELETE FROM project_reports WHERE project_id = ?').bind(id),
        env.DB.prepare('UPDATE documents SET project_id = NULL WHERE project_id = ?').bind(id),
        env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
      ]);
    } else return bad('Невідомий type');
    return json({ ok: true });
  });
}
