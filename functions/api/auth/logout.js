// Вихід. POST {} — лише цей пристрій (стираємо cookie); POST {all: true} — «Вийти на всіх пристроях»:
// clients.session_version += 1, усі видані сесії цього акаунта недійсні (functions/_lib.js currentClient).
import { bumpSession, clearCookie, currentClient, json, readJSON } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  let d = {};
  try { d = await readJSON(request, 1024); } catch { d = {}; }
  if (d && d.all === true) {
    const c = await currentClient(request, env);
    if (c) await bumpSession(env, c.id);
  }
  return json({ ok: true }, 200, { 'set-cookie': clearCookie });
}
