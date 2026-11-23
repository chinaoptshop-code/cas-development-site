// POST /api/chat/contact {sid, token, name?, phone} → {ok, number}
// Відвідувач лишив номер у чаті: заявка CRM (orders.kind = lead, source = chat, form = chat, ref_path — сторінка розмови, ref_host)
// і звичайне сповіщення адмінам у Telegram (functions/_alerts.js notifyNew); розмова привʼязується до заявки, у розмові — системне «Дякуємо…».
// Повторно — та сама заявка (номер дописуємо, якщо його не було). Ліміт — 5 на годину з адреси.
import { json, normalizePhone, readJSON, str } from '../../_lib.js';
import { limited } from '../../_rate.js';
import { ChatError, GOT_PHONE, L, addMessage, langOf, leadFromChat, session, wrap } from '../../_chat.js';

export const onRequestPost = ({ request, env, waitUntil }) => wrap(async () => {
  let d;
  try { d = await readJSON(request, 4096) || {}; } catch { throw new ChatError('Некоректні дані'); }
  const s = await session(env, request, d);
  const phone = normalizePhone(d.phone);
  if (!phone) throw new ChatError('Вкажіть телефон', 422);
  if (await limited(env, request, 'chat-contact', L.contactIpHour)) throw new ChatError('Забагато спроб, спробуйте пізніше', 429);
  const r = await leadFromChat(env, s, { phone, name: str(d.name, 120), waitUntil });
  if (r.existing) await env.DB.prepare("UPDATE orders SET phone = COALESCE(NULLIF(phone, ''), ?), updated_at = datetime('now') WHERE id = ?").bind(phone, r.id).run();
  const mid = await addMessage(env, s, 'system', GOT_PHONE[langOf(s.lang)]);
  await env.DB.prepare("UPDATE chat_sessions SET last_at = datetime('now') WHERE id = ?").bind(s.id).run();
  return json({ ok: true, number: r.number, message_id: mid });
});
