-- Сповіщення про заявки й замовлення в Telegram, SLA 15 хв і щоденний звіт (functions/_alerts.js, tools/admin/README.md).
-- SLA-нагадування й звіт — лише для заявок, про які бот сповістив (є рядок у tg_alerts): старі «Нові» й записи,
-- внесені менеджером вручну, не спамлять. Час — як у orders.created_at: UTC, формат datetime('now') «YYYY-MM-DD HH:MM:SS».
ALTER TABLE orders ADD COLUMN taken_at TEXT;               -- коли взяли в роботу (кнопка в Telegram або перший статус ≠ «Нове» в CRM)
ALTER TABLE orders ADD COLUMN reaction_min INTEGER;        -- час реакції, хв: taken_at − created_at
ALTER TABLE orders ADD COLUMN reminders INTEGER NOT NULL DEFAULT 0;  -- скільки SLA-нагадувань надіслано (макс. 2)
ALTER TABLE orders ADD COLUMN reminded_at TEXT;            -- коли надіслано останнє нагадування

-- повідомлення бота про заявку в чатах адмінів — щоб після «Взяв у роботу» відредагувати їх у всіх
CREATE TABLE IF NOT EXISTS tg_alerts (
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  chat_id    TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'new',                  -- new | reminder
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS tg_alerts_order ON tg_alerts(order_id);

-- вхід за номером через вебхук бота (/api/tg/webhook): який login-токен чекає контакт у цьому чаті
CREATE TABLE IF NOT EXISTS tg_login_chats (
  chat_id    TEXT PRIMARY KEY,
  token      TEXT NOT NULL,
  expires_at INTEGER NOT NULL                              -- unix-секунди
);

CREATE INDEX IF NOT EXISTS orders_sla ON orders(status, taken_at, created_at);
