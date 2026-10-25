-- Особисті коди партнерів Оздоби (дизайнери, архітектори) замість публічних промокодів.
-- Знижка партнера не сумується зі знижкою за обсягом (catalog.json volume_discounts): діє більша.
CREATE TABLE IF NOT EXISTS partner_codes (
  code       TEXT PRIMARY KEY,                    -- DIZ-IVANENKO (верхній регістр)
  name       TEXT,                                -- партнер: імʼя, студія
  discount   INTEGER NOT NULL DEFAULT 10,         -- %
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  uses       INTEGER NOT NULL DEFAULT 0           -- скільки замовлень оформлено з кодом
);

-- Простий rate-limit перевірки кодів (POST /api/promo/check): sha256 IP і час (unix-секунди), зберігаємо лише останню годину.
CREATE TABLE IF NOT EXISTS promo_checks (
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS promo_checks_ip ON promo_checks(ip_hash, created_at);

-- Знижка в замовленні: сума (грн) і відсоток; promo — код партнера, якщо його вказали.
ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_pct INTEGER NOT NULL DEFAULT 0;
