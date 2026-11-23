// POST /api/bot/chat/ping — воркер живий (ключ X-Bot-Key). Зберігаємо час; віконце показує «помічник офлайн», якщо пінгу не було > 3 хв.
// → {ok, queue: <скільки розмов чекають відповіді>, at}. Воркеру — пінгувати щохвилини (і GET черги теж оновлює час).
import { json } from '../../../_lib.js';
import { now, setPing, wrap } from '../../../_chat.js';

export const onRequestPost = ({ env }) => wrap(async () => {
  const t = now();
  await setPing(env, t);
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_sessions WHERE state IN ('bot', 'waiting') AND last_user_id > answered_upto").first();
  return json({ ok: true, queue: r ? r.n : 0, at: t });
});
