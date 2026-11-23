// GET /api/chat/status → {online, limit: 'day'|null, limits: {file, session, r2, store_full?}, text_max, files_msg, accept, alt} — без розмови (віконце показує «помічник офлайн» і ліміт файлу ще до першого повідомлення;
// розмову створює лише перше надіслане повідомлення, файл чи номер — порожніх розмов у базі немає).
import { json } from '../../_lib.js';
import { ACCEPT, ChatError, L, MSG_LINKS, botOnline, dayFull, hotLimited, limits, storage, wrap } from '../../_chat.js';

export const onRequestGet = ({ request, env }) => wrap(async () => {
  if (hotLimited(request, 'status')) throw new ChatError('Забагато запитів — зачекайте хвилину', 429);
  // добова стеля відповідей бота (CHAT_DAY_ANSWERS) — online: false і limit: 'day': віконце — «залиште номер», як офлайн
  const day = await dayFull(env, 'answers');
  return json({ online: !day && await botOnline(env), limit: day ? 'day' : null, limits: limits(env, (await storage(env)).full), text_max: L.text, files_msg: L.filesMsg, accept: ACCEPT, alt: MSG_LINKS });
});
