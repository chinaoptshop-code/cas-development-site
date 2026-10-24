// Публічні налаштування входу для сторінок (імʼя бота Telegram, client_id Google, вхід за номером).
import { json } from '../_lib.js';

export const onRequestGet = ({ env }) => json({
  telegramBot: env.TELEGRAM_BOT_USERNAME || null,
  googleClientId: env.GOOGLE_CLIENT_ID || null,
  phoneLogin: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME), // підтвердження номера через бота
  smsLogin: !!env.SMS_PROVIDER, // заготовка: SMS ще не реалізовано (functions/_sms.js)
});
