// Адреси доставки клієнта (до 10): Нова Пошта — відділення / поштомат, або адреса обʼєкта.
// GET    /api/account/addresses                         → {addresses}
// POST   /api/account/addresses {kind, city, branch?, address?, label?, recipient?, phone?, is_default?}
// PATCH  /api/account/addresses {id, ...ті самі поля}
// DELETE /api/account/addresses?id=N
import { normalizePhone } from '../../_lib.js';
import { body, client, int, json, bad, noTable, notReady, txt } from '../../_account.js';

const KINDS = ['np_branch', 'np_locker', 'object'];
const MAX = 10;
const COLS = 'id, kind, label, city, branch, address, recipient, phone, is_default';
const all = async (env, c) => (await env.DB.prepare(`SELECT ${COLS} FROM addresses WHERE client_id = ? ORDER BY is_default DESC, id LIMIT 20`).bind(c.id).all()).results;

function clean(d) {
  const kind = KINDS.includes(d.kind) ? d.kind : null;
  if (!kind) return { error: 'Оберіть тип адреси' };
  const a = {
    kind, label: txt(d.label, 60), city: txt(d.city, 80), branch: txt(d.branch, 20),
    address: txt(d.address, 200), recipient: txt(d.recipient, 120), phone: null, is_default: d.is_default ? 1 : 0,
  };
  if (!a.city) return { error: 'Вкажіть місто' };
  if (kind === 'object') { if (!a.address) return { error: 'Вкажіть адресу обʼєкта' }; a.branch = null; }
  else {
    if (!a.branch || !/^\d{1,6}$/.test(a.branch.replace(/^№\s*/, ''))) return { error: 'Номер відділення чи поштомату — цифрами' };
    a.branch = a.branch.replace(/^№\s*/, '');
  }
  if (d.phone) {
    const p = normalizePhone(d.phone);
    if (!p || !/^\+380\d{9}$/.test(p)) return { error: 'Телефон отримувача: 0XX XXX XX XX' };
    a.phone = p;
  }
  return { a };
}

// clients.city — адреса за замовчуванням коротким рядком (для форми замовлення й менеджера, як у v1)
async function syncCity(env, c) {
  const d = await env.DB.prepare('SELECT * FROM addresses WHERE client_id = ? ORDER BY is_default DESC, id LIMIT 1').bind(c.id).first();
  const s = !d ? null : d.kind === 'object' ? `${d.city}, ${d.address}` : `${d.city}, НП ${d.kind === 'np_locker' ? 'поштомат' : 'відділення'} №${d.branch}`;
  await env.DB.prepare('UPDATE clients SET city = ? WHERE id = ?').bind(s ? s.slice(0, 200) : c.city, c.id).run();
}

async function wrap(fn) {
  try { return await fn(); } catch (e) { if (noTable(e)) return notReady(); throw e; }
}

export async function onRequestGet({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  try { return json({ addresses: await all(env, c) }); } catch (e) { if (noTable(e)) return json({ addresses: [], pending: true }); throw e; }
}

export async function onRequestPost({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 4096);
  if (e1) return e1;
  const { a, error: e2 } = clean(d);
  if (e2) return bad(e2, 422);
  return wrap(async () => {
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM addresses WHERE client_id = ?').bind(c.id).first()).n;
    if (n >= MAX) return bad(`Можна зберегти до ${MAX} адрес`, 409);
    if (!n) a.is_default = 1;
    if (a.is_default) await env.DB.prepare('UPDATE addresses SET is_default = 0 WHERE client_id = ?').bind(c.id).run();
    await env.DB.prepare('INSERT INTO addresses (client_id, kind, label, city, branch, address, recipient, phone, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.id, a.kind, a.label, a.city, a.branch, a.address, a.recipient, a.phone, a.is_default).run();
    await syncCity(env, c);
    return json({ addresses: await all(env, c) });
  });
}

export async function onRequestPatch({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const { d, error: e1 } = await body(request, 4096);
  if (e1) return e1;
  return wrap(async () => {
    const cur = await env.DB.prepare('SELECT * FROM addresses WHERE id = ? AND client_id = ?').bind(int(d.id), c.id).first();
    if (!cur) return bad('Адресу не знайдено', 404);
    const { a, error: e2 } = clean({ ...cur, ...d, is_default: d.is_default == null ? cur.is_default : d.is_default });
    if (e2) return bad(e2, 422);
    if (a.is_default && !cur.is_default) await env.DB.prepare('UPDATE addresses SET is_default = 0 WHERE client_id = ?').bind(c.id).run();
    await env.DB.prepare(`UPDATE addresses SET kind = ?, label = ?, city = ?, branch = ?, address = ?, recipient = ?, phone = ?, is_default = ?, updated_at = datetime('now') WHERE id = ? AND client_id = ?`)
      .bind(a.kind, a.label, a.city, a.branch, a.address, a.recipient, a.phone, a.is_default, cur.id, c.id).run();
    await syncCity(env, c);
    return json({ addresses: await all(env, c) });
  });
}

export async function onRequestDelete({ request, env }) {
  const { c, error } = await client(request, env);
  if (error) return error;
  const id = int(new URL(request.url).searchParams.get('id'));
  return wrap(async () => {
    const cur = await env.DB.prepare('SELECT is_default FROM addresses WHERE id = ? AND client_id = ?').bind(id, c.id).first();
    if (!cur) return bad('Адресу не знайдено', 404);
    await env.DB.prepare('DELETE FROM addresses WHERE id = ? AND client_id = ?').bind(id, c.id).run();
    if (cur.is_default) await env.DB.prepare('UPDATE addresses SET is_default = 1 WHERE id = (SELECT id FROM addresses WHERE client_id = ? ORDER BY id LIMIT 1)').bind(c.id).run();
    await syncCity(env, c);
    return json({ addresses: await all(env, c) });
  });
}
