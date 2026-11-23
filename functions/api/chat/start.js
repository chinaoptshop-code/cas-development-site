// POST /api/chat/start {lang, page, ref_host?} → {sid, token, hello, online, state, limits, accept, alt}
// Нова розмова: sid (128 біт) + token (256 біт) — браузер тримає їх у localStorage; у D1 — лише sha256 токена й хеш IP.
// Ліміти: 10 нових розмов на годину й 5 на добу з адреси, 600 на годину на весь сайт (далі 429); на весь сайт за добу (Київ) — 300
// (CHAT_DAY_STARTS): далі 429 {day_full} — віконце пропонує залишити номер у формі або написати в месенджер. Таблиця — tools/admin/README.md, розділ 21.
import { json, readJSON } from '../../_lib.js';
import { ipHash, limited } from '../../_rate.js';
import { refHost } from '../../_refhost.js';
import { ACCEPT, ChatError, HELLO, L, MSG_LINKS, botOnline, dayFull, dayInc, langOf, lim, limits, newSid, newToken, pagePath, storage, tokenHash, wrap } from '../../_chat.js';

export const onRequestPost = ({ request, env }) => wrap(async () => {
  let d;
  try { d = await readJSON(request, 4096) || {}; } catch { throw new ChatError('Некоректні дані'); }
  if (typeof d !== 'object' || Array.isArray(d)) throw new ChatError('Некоректні дані');
  const X = lim(env);
  if (await dayFull(env, 'starts')) throw new ChatError('Чат на сьогодні зайнятий — залиште номер або напишіть у месенджер', 429, { day_full: true, alt: MSG_LINKS });
  if (await limited(env, request, 'chat-start', L.startIpHour) || await limited(env, request, 'chat-start-d', X.startIpDay, 86400))
    throw new ChatError('Забагато нових розмов, спробуйте пізніше', 429, { ip_full: true, alt: MSG_LINKS });
  if (await limited(env, request, 'chat-start-all', L.startAllHour, 3600, false, 'all')) throw new ChatError('Чат перевантажено, спробуйте пізніше', 429, { alt: MSG_LINKS });
  const lang = langOf(d.lang), sid = newSid(), token = newToken();
  await env.DB.prepare('INSERT INTO chat_sessions (sid, token_hash, lang, page, ref_host, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sid, await tokenHash(token), lang, pagePath(d.page), refHost(d.ref_host), (await ipHash(request, 'chat')).slice(0, 32)).run();
  await dayInc(env, 'starts');
  const day = await dayFull(env, 'answers');
  return json({ ok: true, sid, token, hello: HELLO[lang], online: !day && await botOnline(env), state: 'bot', limits: limits(env, (await storage(env)).full),
    text_max: L.text, files_msg: L.filesMsg, limit: day ? 'day' : null, accept: ACCEPT, alt: MSG_LINKS });
});
