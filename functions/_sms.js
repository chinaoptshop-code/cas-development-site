// Заготовка під вхід за SMS-кодом. Поки не реалізовано: /api/config віддає smsLogin = !!env.SMS_PROVIDER,
// а /api/auth/phone/start завжди відповідає sms: false і веде клієнта в Telegram-бота.
//
// TODO(SMS): коли зʼявиться провайдер (TurboSMS, Twilio, Vonage…):
//   1. env.SMS_PROVIDER = назва провайдера, env.SMS_API_KEY / SMS_SENDER — секрети (додати в deploy.yml);
//   2. реалізувати sendSms нижче (POST до API провайдера, кинути помилку на не-2xx);
//   3. у phone/start при SMS-вході: згенерувати 6-значний код, зберегти sha256(код) у login_requests
//      (нова міграція: колонки code_hash, attempts), надіслати sendSms(env, phone, `Код входу CAS: ${code}`);
//   4. новий POST /api/auth/phone/verify {token, code}: cookie cas_pl ↔ browser_hash, ≤5 спроб,
//      same(sha256(code), code_hash) → status 'confirmed' → далі той самий /api/auth/phone/status.

/**
 * Надіслати SMS.
 * @param {object} env   середовище Pages Functions (SMS_PROVIDER, SMS_API_KEY, SMS_SENDER)
 * @param {string} phone номер у форматі E.164 (+380XXXXXXXXX)
 * @param {string} text  текст повідомлення
 * @returns {Promise<void>}
 */
export async function sendSms(env, phone, text) { // eslint-disable-line no-unused-vars
  throw new Error('SMS не налаштовано');
}
