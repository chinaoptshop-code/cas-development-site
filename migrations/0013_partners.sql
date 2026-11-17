-- «Партнери» і бот пошуку заявок (Михайло 17.11.2026). Бот пошуку (Mac mini, Telegram-помічник) відсіює з груп і сайтів
-- не клієнтів, а підрядників, бригади, постачальників, ріелторів, будівельні компанії, дизайнерів — їх зберігаємо як базу
-- для майбутньої співпраці. Лише публічні контакти (Telegram @username, телефон, сайт), без приватних даних.
-- Пише POST /api/bot/partners (functions/api/bot/partners.js, ключ X-Bot-Key = LEADBOT_KEY); показ, правка, CSV —
-- /kabinet/admin → «Партнери» (functions/api/admin/partners.js, право partners.base — власник і менеджер).
-- Номер 0013: 0012 займає гілка mac/crm-projects (0012_project_tasks.sql).
CREATE TABLE IF NOT EXISTS partners (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT,                              -- імʼя людини / назва в оголошенні
  company     TEXT,
  type        TEXT NOT NULL DEFAULT 'other',     -- crew | supplier | realtor | builder | designer | other
  city        TEXT,                              -- місто / область
  tg          TEXT,                              -- публічний @username без «@», нижній регістр
  phone       TEXT,                              -- +380… (normalizePhone)
  site        TEXT,                              -- https://host/шлях
  source_name TEXT,                              -- остання група / сайт, де бачили
  source_url  TEXT,                              -- посилання на повідомлення
  sources     TEXT NOT NULL DEFAULT '[]',        -- JSON: останні 20 джерел [{name, url, at}]
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  times_seen  INTEGER NOT NULL DEFAULT 1,
  tags        TEXT NOT NULL DEFAULT '[]',        -- JSON: ["плитка", "Київ-лівий берег"]
  notes       TEXT,                              -- нотатки менеджера (бот не змінює)
  status      TEXT NOT NULL DEFAULT 'new',       -- new | interesting | working | rejected (бот не змінює)
  company_key TEXT,                              -- нормалізована назва компанії для дедуплікації
  site_key    TEXT,                              -- домен сайту без www для дедуплікації
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS partners_tg ON partners(tg);
CREATE INDEX IF NOT EXISTS partners_phone ON partners(phone);
CREATE INDEX IF NOT EXISTS partners_site ON partners(site_key);
CREATE INDEX IF NOT EXISTS partners_company ON partners(company_key);
CREATE INDEX IF NOT EXISTS partners_list ON partners(status, type, last_seen);

-- «Не цікаво» з бота: хеш ліда + причина — бот навчається, що не показувати (GET /api/bot/feedback?since=).
CREATE TABLE IF NOT EXISTS bot_feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_hash  TEXT NOT NULL UNIQUE,
  verdict    TEXT NOT NULL DEFAULT 'not_interested',
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bot_feedback_upd ON bot_feedback(updated_at, id);

-- Заявки з бота (orders.source = 'finder'): хеш ліда (повторне «В CRM» не дублює) і публічний Telegram автора.
ALTER TABLE orders ADD COLUMN ext_hash TEXT;
ALTER TABLE orders ADD COLUMN contact_tg TEXT;
CREATE INDEX IF NOT EXISTS orders_ext_hash ON orders(ext_hash);
