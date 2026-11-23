// GET /api/chat/file/<id> — файл своєї розмови або аудіо-відповідь бота (sid і token — лише заголовками x-chat-sid / x-chat-token).
// Чужий файл, невірний токен — 404. Віддаємо завжди як вкладення (functions/_chat.js fileResponse): nosniff, CSP sandbox.
import { bad } from '../../../_lib.js';
import { ChatError, FILE_RE, fileResponse, hotLimited, session, wrap } from '../../../_chat.js';

export const onRequestGet = ({ request, env, params }) => wrap(async () => {
  const id = String(params.id || '');
  if (hotLimited(request, 'file')) throw new ChatError('Забагато запитів — зачекайте хвилину', 429);
  const s = await session(env, request);
  if (!FILE_RE.test(id)) return bad('Файл не знайдено', 404);
  const f = await env.DB.prepare('SELECT * FROM chat_files WHERE id = ? AND session_id = ?').bind(id, s.id).first();
  if (!f) return bad('Файл не знайдено', 404);
  return fileResponse(env, f);
});
