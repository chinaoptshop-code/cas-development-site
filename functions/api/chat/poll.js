// GET /api/chat/poll?after=<id> (sid і token — лише заголовками x-chat-sid / x-chat-token) →
//   {messages: [{id, role: user|bot|staff|system, text, files: [{id, name, mime, kind, size}], audio?: {id, mime, dur}, estimate?, author?, at}],
//    state: bot|waiting|staff|closed, typing, online, lead: {number}|null, last_id}
// Лише повідомлення цієї розмови (до 100 за раз, далі — наступний запит з after). Віконце опитує 2 → 5 → 10 с, на прихованій вкладці — пауза.
import { json } from '../../_lib.js';
import { ChatError, botOnline, hotLimited, messages, now, session, wrap } from '../../_chat.js';

export const onRequestGet = ({ request, env }) => wrap(async () => {
  if (hotLimited(request, 'poll')) throw new ChatError('Забагато запитів — зачекайте хвилину', 429);
  const s = await session(env, request);
  const after = Math.max(0, parseInt(new URL(request.url).searchParams.get('after'), 10) || 0);
  const list = await messages(env, s.id, 'm.id > ?', [after], 100);
  const t = now();
  const lead = s.order_id ? await env.DB.prepare('SELECT number FROM orders WHERE id = ?').bind(s.order_id).first() : null;
  const typing = (s.state === 'bot' || s.state === 'waiting') && ((s.lock_until || 0) > t || (s.typing_until || 0) > t) && s.last_user_id > s.answered_upto;
  return json({ messages: list, state: s.state, typing: !!typing, online: await botOnline(env, t), lead: lead ? { number: lead.number } : null,
    last_id: list.length ? list[list.length - 1].id : after });
});
