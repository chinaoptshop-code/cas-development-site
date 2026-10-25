// Вебхук бота сайту (TELEGRAM_BOT_TOKEN). Ставить його POST /api/admin/lead-sla (ensureWebhook у functions/_alerts.js).
// Telegram підписує кожен запит заголовком X-Telegram-Bot-Api-Secret-Token (= webhookSecret, виводиться з токена бота).
//  • callback_query «take:<id>» — кнопка «✅ Взяв у роботу» в сповіщенні про заявку; приймаємо лише від ADMIN_TG_IDS;
//  • повідомлення — вхід на сайт за номером (протокол tools/shop/PHONE_LOGIN.md): /start login_<token> → кнопка
//    «📱 Поділитися номером» → contact → та сама перевірка, що й POST /api/auth/phone/confirm (викликаємо її напряму).
// Відповідаємо Telegram завжди 200 (інакше він повторює апдейт), помилки — лише в лог.
import { bad, botSignature, json, readJSON, same } from '../../_lib.js';
import { adminIds, adminName, fmtMin, takeLead, tg, webhookSecret } from '../../_alerts.js';
import { onRequestPost as confirmPhone } from '../auth/phone/confirm.js';

const LOGIN_TTL = 600;

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN) return bad('Бот не налаштовано', 503);
  if (!same(request.headers.get('x-telegram-bot-api-secret-token') || '', await webhookSecret(env))) return bad('Немає доступу', 403);
  let u;
  try { u = await readJSON(request, 64 * 1024); } catch { return json({ ok: true }); }
  try {
    if (u.callback_query) await onCallback(env, u.callback_query);
    else if (u.message) await onMessage(request, env, u.message);
  } catch (e) {
    console.log('tg webhook', e && e.message);
  }
  return json({ ok: true });
}

async function onCallback(env, cq) {
  const answer = (text, alert = false) => tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: alert });
  const from = cq.from || {};
  if (!adminIds(env).includes(String(from.id))) return answer('Немає доступу', true);
  const m = /^take:(\d{1,12})$/.exec(String(cq.data || ''));
  if (!m) return answer('');
  const r = await takeLead(env, Number(m[1]), await adminName(env, from), 'Telegram');
  if (r.error) return answer('Заявку не знайдено', true);
  if (r.already) return answer(`Уже взяв ${r.o.assignee || 'інший менеджер'}${r.o.reaction_min != null ? ` (за ${fmtMin(r.o.reaction_min)})` : ''}`, true);
  return answer(`Заявка ваша. Час реакції — ${fmtMin(r.min)}`);
}

async function onMessage(request, env, msg) {
  const chat = String(msg.chat && msg.chat.id), from = msg.from || {};
  const say = (text, extra = {}) => tg(env, 'sendMessage', { chat_id: chat, text, ...extra });
  const now = Math.floor(Date.now() / 1000);
  const text = String(msg.text || '').trim();

  const s = /^\/start login_([0-9a-f]{32})$/.exec(text);
  if (s) {
    await env.DB.prepare(`INSERT INTO tg_login_chats (chat_id, token, expires_at) VALUES (?1, ?2, ?3)
        ON CONFLICT(chat_id) DO UPDATE SET token = ?2, expires_at = ?3`).bind(chat, s[1], now + LOGIN_TTL).run();
    return say('Щоб увійти на сайт CAS Development, натисніть «📱 Поділитися номером».', { reply_markup: {
      keyboard: [[{ text: '📱 Поділитися номером', request_contact: true }]], one_time_keyboard: true, resize_keyboard: true } });
  }

  const c = msg.contact;
  if (c) {
    if (String(c.user_id) !== String(from.id)) return say('Надішліть, будь ласка, свій номер кнопкою нижче.');
    const row = await env.DB.prepare('SELECT token, expires_at FROM tg_login_chats WHERE chat_id = ?').bind(chat).first();
    if (!row || row.expires_at < now) return say('Почніть вхід на сайті ще раз.', { reply_markup: { remove_keyboard: true } });
    const phone = '+' + String(c.phone_number || '').replace(/\D/g, ''), tgId = String(from.id);
    const res = await confirmPhone({ env, request: new Request(new URL('/api/auth/phone/confirm', request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-signature': await botSignature(env, row.token, phone, tgId) },
      body: JSON.stringify({ token: row.token, phone, tg_id: tgId, name: [from.first_name, from.last_name].filter(Boolean).join(' '), username: from.username }),
    }) });
    const d = await res.json().catch(() => ({}));
    let reply;
    if (res.status === 200) reply = 'Готово, поверніться на сайт.';
    else if (res.status === 401 || res.status >= 500) reply = 'Не вдалося підтвердити вхід. Спробуйте пізніше.';
    else reply = (d.error || 'Не вдалося підтвердити вхід') + '. Почніть вхід на сайті ще раз.';
    // номер не збігся — клієнт може виправити його на сайті й надіслати контакт ще раз; інакше токен більше не потрібен
    if (!(res.status === 409 && /не збігається/.test(d.error || ''))) await env.DB.prepare('DELETE FROM tg_login_chats WHERE chat_id = ?').bind(chat).run();
    return say(reply, { reply_markup: { remove_keyboard: true } });
  }

  if (/^\/start\b/.test(text) && adminIds(env).includes(String(from.id)))
    return say('Готово: сюди приходитимуть нові заявки з сайту й замовлення Оздоби, нагадування й щоденний звіт.');
}
