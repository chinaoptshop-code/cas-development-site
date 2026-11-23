// Вебхук бота сайту (TELEGRAM_BOT_TOKEN). Ставить його POST /api/admin/lead-sla (ensureWebhook у functions/_alerts.js).
// Telegram підписує кожен запит заголовком X-Telegram-Bot-Api-Secret-Token (= webhookSecret, виводиться з токена бота).
//  • callback_query — кнопки керування (functions/_bot.js, README розділ 19): «take:<id>» («✅ Взяв у роботу»), «l:<id>:<дія>» (заявка),
//    «k:<id>:<дія>» (задача). Приймаємо лише від працівника, якого сервер упізнав за Telegram id (staffCtxTg), з правами як у CRM;
//  • команди працівника в особистому чаті (/today /leads /tasks /lead /task /stats /help, кнопки «Сьогодні · Заявки · Задачі») — functions/_bot.js;
//    у групах — лише /help (без даних); чужим — нічого;
//  • повідомлення — вхід на сайт за номером (протокол tools/shop/PHONE_LOGIN.md): /start login_<token> → кнопка
//    «📱 Поділитися номером» → contact → та сама перевірка, що й POST /api/auth/phone/confirm (викликаємо її напряму).
// Відповідаємо Telegram завжди 200 (інакше він повторює апдейт), помилки — лише в лог.
import { bad, botSignature, json, readJSON, same } from '../../_lib.js';
import { tg, webhookSecret } from '../../_alerts.js';
import { GROUP_HELP, onCallback, onCommand } from '../../_bot.js';
import { onRequestPost as confirmPhone } from '../auth/phone/confirm.js';

const LOGIN_TTL = 600;

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN) return bad('Бот не налаштовано', 503);
  if (!same(request.headers.get('x-telegram-bot-api-secret-token') || '', await webhookSecret(env))) return bad('Немає доступу', 403);
  let u;
  try { u = await readJSON(request, 64 * 1024); } catch { return json({ ok: true }); }
  try {
    if (u.callback_query) await onCallback(env, request, u.callback_query);
    else if (u.message) await onMessage(request, env, u.message);
  } catch (e) {
    console.log('tg webhook', e && e.message);
  }
  return json({ ok: true });
}

async function onMessage(request, env, msg) {
  const chat = String(msg.chat && msg.chat.id), from = msg.from || {};
  const say = (text, extra = {}) => tg(env, 'sendMessage', { chat_id: chat, text, ...extra });
  const now = Math.floor(Date.now() / 1000);
  const text = String(msg.text || '').trim();
  if (msg.chat && msg.chat.type && msg.chat.type !== 'private') { // групи: лише /help, без жодних даних
    if (/^\/help(@\w+)?$/i.test(text)) await say(GROUP_HELP);
    return;
  }

  const s = /^\/start login_([0-9a-f]{32})$/.exec(text);
  if (s) {
    await env.DB.prepare(`INSERT INTO tg_login_chats (chat_id, token, expires_at) VALUES (?1, ?2, ?3)
        ON CONFLICT(chat_id) DO UPDATE SET token = ?2, expires_at = ?3`).bind(chat, s[1], now + LOGIN_TTL).run();
    // попередження: посилання на вхід може надіслати й стороння людина — номером ділиться лише той, хто сам почав вхід
    return say('Щоб увійти на сайт CAS Development, натисніть «📱 Поділитися номером».\n\n'
      + 'Натискайте, лише якщо ви самі щойно почали вхід на cas-develop.com. Якщо це посилання вам надіслав хтось інший — не діліться номером: ця людина отримає доступ до вашого кабінету.', { reply_markup: {
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

  if (text) await onCommand(env, request, msg); // працівнику — команди; чужим — нічого
}
