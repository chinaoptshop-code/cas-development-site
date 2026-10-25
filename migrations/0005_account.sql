-- Кабінет клієнта v2: обране, адреси доставки, налаштування й реквізити, проєкти (етапи, фотозвіти), документи.
-- Не залежить від 0004_crm.sql. Особисті дані — лише в D1, не в репозиторії.

-- Обране: id товарів Оздоби (assets/ozdoba/catalog.json items[].id)
CREATE TABLE IF NOT EXISTS favorites (
  client_id  INTEGER NOT NULL REFERENCES clients(id),
  item_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_id, item_id)
);

-- Адреси доставки: Нова Пошта (відділення / поштомат) або адреса обʼєкта
CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id),
  kind       TEXT NOT NULL DEFAULT 'np_branch',   -- np_branch | np_locker | object
  label      TEXT,                                -- «Офіс», «Ресторан на Подолі»
  city       TEXT,
  branch     TEXT,                                -- номер відділення / поштомату
  address    TEXT,                                -- вулиця, будинок (для обʼєкта)
  recipient  TEXT,
  phone      TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS addresses_client ON addresses(client_id);

-- Налаштування й реквізити клієнта (1:1 з clients)
CREATE TABLE IF NOT EXISTS client_settings (
  client_id    INTEGER PRIMARY KEY REFERENCES clients(id),
  client_type  TEXT NOT NULL DEFAULT 'private',   -- private | fop | tov | eu
  company_name TEXT,
  company_code TEXT,                              -- ЄДРПОУ (8 цифр) або ІПН (10 цифр)
  docs_email   TEXT,                              -- email для рахунків і документів
  lang         TEXT NOT NULL DEFAULT 'uk',        -- uk | ru | en
  notify_tg    INTEGER NOT NULL DEFAULT 1,        -- сповіщення про статуси в Telegram
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Проєкти дизайну / ремонту / будівництва (заповнює менеджер через /api/admin/projects)
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id),
  title      TEXT NOT NULL,
  service    TEXT,                                -- design | repair | build | furnish | landscape | other
  address    TEXT,
  area       REAL,                                -- м²
  status     TEXT NOT NULL DEFAULT 'active',      -- active | paused | done
  stages     TEXT NOT NULL DEFAULT '[]',          -- JSON: [{name, progress 0–100, start, end, note}]
  next_step  TEXT,
  next_date  TEXT,                                -- YYYY-MM-DD
  manager    TEXT,                                -- імʼя відповідального
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS projects_client ON projects(client_id, status);

-- Фотозвіти (раз на 1–2 тижні): дата, підпис і до 30 посилань на фото
CREATE TABLE IF NOT EXISTS project_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  date       TEXT NOT NULL,                       -- YYYY-MM-DD
  title      TEXT,
  note       TEXT,
  photos     TEXT NOT NULL DEFAULT '[]',          -- JSON: ["https://…"]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS project_reports_project ON project_reports(project_id, date);

-- Документи: договір, кошторис, рахунки, акти — посилання на файли
CREATE TABLE IF NOT EXISTS documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id),
  project_id INTEGER REFERENCES projects(id),
  order_id   INTEGER REFERENCES orders(id),
  kind       TEXT NOT NULL DEFAULT 'other',       -- contract | estimate | invoice | act | design | other
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,                       -- https://…
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS documents_client ON documents(client_id, project_id);

-- Особистий код партнера, привʼязаний до клієнта (показуємо в кабінеті)
ALTER TABLE partner_codes ADD COLUMN client_id INTEGER REFERENCES clients(id);
CREATE INDEX IF NOT EXISTS partner_codes_client ON partner_codes(client_id);
