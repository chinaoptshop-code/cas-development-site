// POST /api/chat/send {sid, token, text?, files?: [file_id]} → {ok, id, state}
// Текст ≤ 4 000 знаків; порожнє без файлів — 422. Файли — лише свої, завантажені (POST /api/chat/upload) і ще не надіслані.
// Ліміти: 40 повідомлень на годину й 200 на добу на розмову, 150 на годину з адреси (429).
// Закрита розмова від нового повідомлення знову відкривається для бота; у стані staff (відповідає людина) лишається staff.
import { idsArg, IN_IDS, json, readJSON } from '../../_lib.js';
import { limited } from '../../_rate.js';
import { ChatError, FILE_RE, L, addMessage, clean, session, wrap } from '../../_chat.js';

export const onRequestPost = ({ request, env }) => wrap(async () => {
  let d;
  try { d = await readJSON(request, 24 * 1024) || {}; } catch { throw new ChatError('Некоректні дані'); }
  if (typeof d !== 'object' || Array.isArray(d)) throw new ChatError('Некоректні дані');
  const s = await session(env, request, d);
  if (d.text != null && typeof d.text !== 'string') throw new ChatError('text: рядок');
  if (typeof d.text === 'string' && d.text.length > L.text + 200) throw new ChatError(`Повідомлення задовге — до ${L.text} знаків`, 413);
  const text = clean(d.text, L.text);
  const ids = d.files == null ? [] : d.files;
  if (!Array.isArray(ids) || ids.length > 10 || !ids.every(x => typeof x === 'string' && FILE_RE.test(x))) throw new ChatError('files: до 10 ідентифікаторів файлів');
  const uniq = [...new Set(ids)];
  if (!text && !uniq.length) throw new ChatError('Порожнє повідомлення', 422);
  if (uniq.length) {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_files WHERE session_id = ? AND role = 'user' AND message_id IS NULL AND id ${IN_IDS}`).bind(s.id, idsArg(uniq)).first();
    if ((r && r.n) !== uniq.length) throw new ChatError('Файл не знайдено — завантажте його ще раз', 404);
  }
  const by = 'chat:' + s.id;
  if (await limited(env, request, 'chat-msg-h', L.msgSessHour, 3600, false, by) || await limited(env, request, 'chat-msg-d', L.msgSessDay, 86400, false, by)
    || await limited(env, request, 'chat-msg-ip', L.msgIpHour)) throw new ChatError('Забагато повідомлень поспіль — зачекайте трохи', 429);
  const id = await addMessage(env, s, 'user', text);
  if (uniq.length) await env.DB.prepare(`UPDATE chat_files SET message_id = ? WHERE session_id = ? AND message_id IS NULL AND id ${IN_IDS}`).bind(id, s.id, idsArg(uniq)).run();
  const state = s.state === 'closed' ? 'bot' : s.state;
  await env.DB.prepare("UPDATE chat_sessions SET last_user_id = ?, last_user_at = datetime('now'), last_at = datetime('now'), msgs = msgs + 1, state = ? WHERE id = ?")
    .bind(id, state, s.id).run();
  return json({ ok: true, id, state });
});
