// POST /api/chat/start {lang, page, ref_host?} → {sid, token, hello, online, state, limits, accept, alt}
// Нова розмова: sid (128 біт) + token (256 біт) — браузер тримає їх у localStorage; у D1 — лише sha256 токена й хеш IP.
// Ліміти: 10 нових розмов на годину з адреси, 600 на годину на весь сайт (далі 429).
import { json, readJSON } from '../../_lib.js';
import { ipHash, limited } from '../../_rate.js';
import { refHost } from '../../_refhost.js';
import { ACCEPT, ChatError, HELLO, L, MSG_LINKS, botOnline, langOf, limits, newSid, newToken, pagePath, tokenHash, wrap } from '../../_chat.js';

export const onRequestPost = ({ request, env }) => wrap(async () => {
  let d;
  try { d = await readJSON(request, 4096) || {}; } catch { throw new ChatError('Некоректні дані'); }
  if (typeof d !== 'object' || Array.isArray(d)) throw new ChatError('Некоректні дані');
  if (await limited(env, request, 'chat-start', L.startIpHour)) throw new ChatError('Забагато нових розмов, спробуйте пізніше', 429);
  if (await limited(env, request, 'chat-start-all', L.startAllHour, 3600, false, 'all')) throw new ChatError('Чат перевантажено, спробуйте пізніше', 429);
  const lang = langOf(d.lang), sid = newSid(), token = newToken();
  await env.DB.prepare('INSERT INTO chat_sessions (sid, token_hash, lang, page, ref_host, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sid, await tokenHash(token), lang, pagePath(d.page), refHost(d.ref_host), (await ipHash(request, 'chat')).slice(0, 32)).run();
  return json({ ok: true, sid, token, hello: HELLO[lang], online: await botOnline(env), state: 'bot', limits: limits(env), accept: ACCEPT, alt: MSG_LINKS });
});
