-- Вхід за номером телефону з підтвердженням через Telegram-бота (див. tools/shop/PHONE_LOGIN.md).
-- Час — unix-секунди. ip_hash — sha256 IP клієнта, лише для rate-limit (5 запитів/год на телефон і на IP).
CREATE TABLE IF NOT EXISTS login_requests (
  token        TEXT PRIMARY KEY,                 -- 32 hex, передається боту як start=login_<token>
  phone        TEXT NOT NULL,                    -- нормалізований номер, який ввів клієнт (+380XXXXXXXXX / E.164)
  browser_hash TEXT NOT NULL,                    -- sha256 секрету з cookie cas_pl (браузер, що почав вхід)
  ip_hash      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | used | expired
  client_id    INTEGER REFERENCES clients(id),
  tg_id        TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_requests_phone ON login_requests(phone, created_at);
CREATE INDEX IF NOT EXISTS login_requests_ip ON login_requests(ip_hash, created_at);
