// POST /api/chat/send {sid, token, text?, files?: [file_id]} → {ok, id, state}
// Текст ≤ 2 000 знаків (довше — 413 {too_long, max}); порожнє без файлів — 422. Файли — лише свої, завантажені (POST /api/chat/upload)
// і ще не надіслані, до 5 на повідомлення. Ліміти: 40 повідомлень на годину й 200 на добу на розмову, 150 на годину й 300 на добу з адреси (429).
// Стеля розмови (functions/_chat.js L.convMsgs / convAnswers, CHAT_CONV_MSGS / CHAT_CONV_ANSWERS): повідомлення понад неї зберігаємо для менеджера,
// розмова — waiting з причиною limit (бот більше не отримує її в черзі), системне «Далі відповість менеджер…» і одне сповіщення адмінам.
// Перше повідомлення → «нова розмова» адмінам у Telegram (10:00–20:00 Київ одразу, поза вікном — черга, runChatNotices).
// Закрита розмова від нового повідомлення знову відкривається для бота; у стані staff (відповідає людина) лишається staff.
import { idsArg, IN_IDS, json, readJSON } from '../../_lib.js';
import { limited } from '../../_rate.js';
import { ChatError, FILE_RE, L, addMessage, botCounts, capConversation, clean, isCapped, lim, notifyNewChat, session, workHours, wrap } from '../../_chat.js';

export const onRequestPost = ({ request, env, waitUntil }) => wrap(async () => {
  let d;
  try { d = await readJSON(request, 24 * 1024) || {}; } catch { throw new ChatError('Некоректні дані'); }
  if (typeof d !== 'object' || Array.isArray(d)) throw new ChatError('Некоректні дані');
  const s = await session(env, request, d);
  if (d.text != null && typeof d.text !== 'string') throw new ChatError('text: рядок');
  // межа — після очищення (керівні символи й пробіли по краях не рахуються); довше — помилка у віконці, а не тихе обрізання
  const text = clean(d.text, L.text + 1000);
  if (text.length > L.text) throw new ChatError(`Повідомлення задовге — до ${L.text} знаків`, 413, { too_long: true, max: L.text });
  const ids = d.files == null ? [] : d.files;
  if (!Array.isArray(ids) || ids.length > L.filesMsg || !ids.every(x => typeof x === 'string' && FILE_RE.test(x))) throw new ChatError(`files: до ${L.filesMsg} файлів в одному повідомленні`, 400, { too_many_files: true, max: L.filesMsg });
  const uniq = [...new Set(ids)];
  if (!text && !uniq.length) throw new ChatError('Порожнє повідомлення', 422);
  if (uniq.length) {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_files WHERE session_id = ? AND role = 'user' AND message_id IS NULL AND id ${IN_IDS}`).bind(s.id, idsArg(uniq)).first();
    if ((r && r.n) !== uniq.length) throw new ChatError('Файл не знайдено — завантажте його ще раз', 404);
  }
  const by = 'chat:' + s.id;
  if (await limited(env, request, 'chat-msg-h', L.msgSessHour, 3600, false, by) || await limited(env, request, 'chat-msg-d', L.msgSessDay, 86400, false, by)
    || await limited(env, request, 'chat-msg-ip', L.msgIpHour) || await limited(env, request, 'chat-msg-ipd', lim(env).msgIpDay, 86400)) throw new ChatError('Забагато повідомлень поспіль — зачекайте трохи', 429);
  const id = await addMessage(env, s, 'user', text);
  if (uniq.length) await env.DB.prepare(`UPDATE chat_files SET message_id = ? WHERE session_id = ? AND message_id IS NULL AND id ${IN_IDS}`).bind(id, s.id, idsArg(uniq)).run();
  const state = s.state === 'closed' && !isCapped(s) ? 'bot' : s.state === 'closed' ? 'waiting' : s.state;
  await env.DB.prepare("UPDATE chat_sessions SET last_user_id = ?, last_user_at = datetime('now'), last_at = datetime('now'), msgs = msgs + 1, state = ? WHERE id = ?")
    .bind(id, state, s.id).run();
  // стеля розмови: повідомлень відвідувача понад convMsgs або бот уже дав convAnswers відповідей — далі людина
  let limit = isCapped(s) ? 'conv' : null;
  if (!limit && state !== 'staff') {
    const X = lim(env), n = s.msgs + 1;
    if (n > X.convMsgs || (await botCounts(env, s.id)).answers >= X.convAnswers) {
      await capConversation(env, s, n > X.convMsgs ? `відвідувач надіслав понад ${X.convMsgs} повідомлень` : `бот дав ${X.convAnswers} відповідей`);
      limit = 'conv';
    }
  }
  // перше повідомлення розмови → «нова розмова» адмінам у Telegram: 10:00–20:00 Київ — одразу, інакше — черга розкладу (functions/_chat.js)
  if (!s.notified_at && workHours(new Date())) {
    const p = notifyNewChat(env, s.id).catch(e => console.log('chat notify', e && e.message));
    if (typeof waitUntil === 'function') waitUntil(p); else await p;
  }
  return json({ ok: true, id, state: limit ? (state === 'staff' ? 'staff' : 'waiting') : state, limit });
});
