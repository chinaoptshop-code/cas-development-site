-- Клієнти, замовлення й історія статусів Оздоби / CAS Development (Cloudflare D1).
CREATE TABLE IF NOT EXISTS clients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,              -- telegram | google
  provider_id TEXT NOT NULL,              -- id у Telegram або sub у Google
  name        TEXT,
  username    TEXT,                       -- @username у Telegram
  email       TEXT,
  phone       TEXT,
  photo       TEXT,
  city        TEXT,                       -- місто й відділення доставки за замовчуванням
  company     TEXT,                       -- назва й ЄДРПОУ для рахунку
  role        TEXT NOT NULL DEFAULT 'client', -- client | admin
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_login  TEXT,
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      TEXT NOT NULL UNIQUE,       -- OZD-2610-0001
  client_id   INTEGER REFERENCES clients(id),
  name        TEXT,
  phone       TEXT,
  items       TEXT NOT NULL,              -- JSON: [{id, name, color, size, qty, unit, price}]
  total       INTEGER,                    -- грн, сума відомих позицій
  on_request  INTEGER NOT NULL DEFAULT 0, -- скільки позицій «за запитом»
  promo       TEXT,
  delivery    TEXT,
  payment     TEXT,                       -- card | parts | invoice | cod
  company     TEXT,
  comment     TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  manager_note TEXT,
  paid        INTEGER NOT NULL DEFAULT 0, -- для майбутньої онлайн-оплати
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS orders_client ON orders(client_id, created_at);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  status     TEXT NOT NULL,
  note       TEXT,
  author     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
