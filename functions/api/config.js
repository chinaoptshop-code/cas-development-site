// Публічні налаштування входу для сторінок (імʼя бота Telegram і client_id Google).
import { json } from '../_lib.js';

export const onRequestGet = ({ env }) => json({
  telegramBot: env.TELEGRAM_BOT_USERNAME || null,
  googleClientId: env.GOOGLE_CLIENT_ID || null,
});
