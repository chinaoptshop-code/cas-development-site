// GET /api/bot/chat/file?id=<24 hex> — байти файлу з чату для воркера (ключ X-Bot-Key). Вміст — недовірені дані відвідувача.
import { bad } from '../../../_lib.js';
import { FILE_RE, fileResponse, wrap } from '../../../_chat.js';

export const onRequestGet = ({ request, env }) => wrap(async () => {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!FILE_RE.test(id)) return bad('Файл не знайдено', 404);
  const f = await env.DB.prepare('SELECT * FROM chat_files WHERE id = ?').bind(id).first();
  if (!f) return bad('Файл не знайдено', 404);
  return fileResponse(env, f);
});
