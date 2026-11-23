// GET /api/chat/status → {online, limits: {file, session, r2}, accept, alt} — без розмови (віконце показує «помічник офлайн» і ліміт файлу ще до першого повідомлення;
// розмову створює лише перше надіслане повідомлення, файл чи номер — порожніх розмов у базі немає).
import { json } from '../../_lib.js';
import { ACCEPT, ChatError, MSG_LINKS, botOnline, hotLimited, limits, wrap } from '../../_chat.js';

export const onRequestGet = ({ request, env }) => wrap(async () => {
  if (hotLimited(request, 'status')) throw new ChatError('Забагато запитів — зачекайте хвилину', 429);
  return json({ online: await botOnline(env), limits: limits(env), accept: ACCEPT, alt: MSG_LINKS });
});
