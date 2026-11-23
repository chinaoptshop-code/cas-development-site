// GET /api/chat/file/<id> — файл своєї розмови або аудіо-відповідь бота (sid і token — заголовками або ?sid&token).
// Чужий файл, невірний токен — 404. Віддаємо завжди як вкладення (functions/_chat.js fileResponse): nosniff, CSP sandbox.
import { bad } from '../../../_lib.js';
import { FILE_RE, fileResponse, session, wrap } from '../../../_chat.js';

export const onRequestGet = ({ request, env, params }) => wrap(async () => {
  const id = String(params.id || '');
  const s = await session(env, request);
  if (!FILE_RE.test(id)) return bad('Файл не знайдено', 404);
  const f = await env.DB.prepare('SELECT * FROM chat_files WHERE id = ? AND session_id = ?').bind(id, s.id).first();
  if (!f) return bad('Файл не знайдено', 404);
  return fileResponse(env, f);
});
