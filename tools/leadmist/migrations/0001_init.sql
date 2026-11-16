-- LeadMist / ЛідМіст — початкова схема D1 (SQLite).
-- Час — ISO-8601 UTC рядки; гроші — цілі центи USD.

-- Учасники клубу (компанії). Один Telegram-акаунт = один учасник у MVP.
CREATE TABLE members (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id            INTEGER NOT NULL UNIQUE,
  tg_username      TEXT,
  company          TEXT NOT NULL,
  edrpou           TEXT,                          -- ЄДРПОУ (8) або РНОКПП ФОП (10)
  contact_name     TEXT,
  categories       TEXT NOT NULL DEFAULT '[]',    -- JSON: коди типів робіт (тип учасника)
  regions          TEXT NOT NULL DEFAULT '[]',    -- JSON: коди регіонів, 'UA' = уся Україна
  budget_min       INTEGER,                       -- USD, нижня межа діапазону бюджетів
  budget_max       INTEGER,                       -- USD, верхня межа; NULL = без обмеження
  portfolio_url    TEXT,
  verified         INTEGER NOT NULL DEFAULT 0,    -- 1 = перевірено модератором (ЄДР, сайт, відгуки)
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','rejected','blocked')),
  lang             TEXT NOT NULL DEFAULT 'uk',
  paused_until     TEXT,                          -- «не беру до …»
  rating_avg       REAL,
  rating_count     INTEGER NOT NULL DEFAULT 0,
  deals_closed     INTEGER NOT NULL DEFAULT 0,
  avg_response_min REAL,                          -- середній час від розсилки до «Взяти»
  responses        INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  approved_at      TEXT
);
CREATE INDEX members_status ON members(status);

-- Анонімна картка ліда.
CREATE TABLE leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id     INTEGER NOT NULL REFERENCES members(id),
  category        TEXT NOT NULL,
  region          TEXT NOT NULL,
  area            REAL NOT NULL,
  area_unit       TEXT NOT NULL CHECK (area_unit IN ('m2','sotka')),
  budget_band     TEXT NOT NULL,
  timing          TEXT NOT NULL,
  notes           TEXT NOT NULL DEFAULT '',
  commission_pct  REAL NOT NULL CHECK (commission_pct >= 5 AND commission_pct <= 15),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','reserved','in_deal','expired','closed','withdrawn')),
  wave            INTEGER NOT NULL DEFAULT 1,     -- 1 = ексклюзив топ-5, 2 = усім відповідним
  client_hash     TEXT,                           -- HMAC телефону/e-mail (дедуплікація, anti-bypass)
  duplicate_of    INTEGER REFERENCES leads(id),
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX leads_status ON leads(status);
CREATE INDEX leads_client_hash ON leads(client_hash);

-- Контакти клієнта: лише шифротекст (AES-GCM, ключ у секретах). Ніколи не показуються до розкриття.
CREATE TABLE lead_contacts (
  lead_id     INTEGER PRIMARY KEY REFERENCES leads(id),
  enc_payload TEXT NOT NULL,                      -- base64(iv || ciphertext)
  created_at  TEXT NOT NULL,
  purge_at    TEXT NOT NULL                       -- строк зберігання (24 міс.), далі — лише хеш
);

-- Розсилка ліда учасникам (підбір).
CREATE TABLE lead_offers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id          INTEGER NOT NULL REFERENCES leads(id),
  member_id        INTEGER NOT NULL REFERENCES members(id),
  wave             INTEGER NOT NULL,
  rank             INTEGER,
  sent_at          TEXT NOT NULL,
  exclusive_until  TEXT,                          -- вікно ексклюзиву 24 год для хвилі 1
  declined_at      TEXT,
  UNIQUE (lead_id, member_id)
);

-- Акцепти: оферта платформи (kind='platform') і додаток до оферти по ліду (kind='lead').
CREATE TABLE acceptances (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT NOT NULL CHECK (kind IN ('platform','lead')),
  terms_version  TEXT NOT NULL,
  member_id      INTEGER NOT NULL REFERENCES members(id),
  tg_id          INTEGER NOT NULL,
  lead_id        INTEGER REFERENCES leads(id),
  otp_ok         INTEGER NOT NULL DEFAULT 0,
  accepted_at    TEXT NOT NULL
);

-- Одноразові коди (зберігаємо лише HMAC коду).
CREATE TABLE otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id       INTEGER NOT NULL,
  purpose     TEXT NOT NULL,                      -- 'platform' | 'lead:<id>'
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX otps_tg ON otps(tg_id, purpose);

-- Угода по ліду (одна активна на лід). Конвеєр: reserved → revealed → contacted → meeting → contract → payment → commission_paid → closed.
CREATE TABLE deals (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id               INTEGER NOT NULL REFERENCES leads(id),
  receiver_id           INTEGER NOT NULL REFERENCES members(id),
  acceptance_id         INTEGER NOT NULL REFERENCES acceptances(id),
  status                TEXT NOT NULL,
  active                INTEGER NOT NULL DEFAULT 1,
  consent_token         TEXT NOT NULL UNIQUE,
  consent_deadline      TEXT NOT NULL,          -- 72 год на згоду клієнта
  revealed_at           TEXT,
  contacted_at          TEXT,
  contract_amount_cents INTEGER,
  currency              TEXT NOT NULL DEFAULT 'USD',
  signed_at             TEXT,
  status_changed_at     TEXT NOT NULL,
  reminded_14_at        TEXT,
  reminded_30_at        TEXT,
  created_at            TEXT NOT NULL
);
CREATE UNIQUE INDEX deals_one_active ON deals(lead_id) WHERE active = 1;
CREATE INDEX deals_status ON deals(status);

CREATE TABLE deal_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id     INTEGER NOT NULL REFERENCES deals(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  note        TEXT,
  at          TEXT NOT NULL
);

-- Згода кінцевого клієнта на передачу даних конкретній компанії.
CREATE TABLE client_consents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id       INTEGER NOT NULL REFERENCES deals(id),
  lead_id       INTEGER NOT NULL REFERENCES leads(id),
  receiver_id   INTEGER NOT NULL REFERENCES members(id),
  method        TEXT NOT NULL CHECK (method IN ('link','manual')),
  text_version  TEXT NOT NULL,
  granted_at    TEXT,
  declined_at   TEXT,
  revoked_at    TEXT,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX consents_deal ON client_consents(deal_id);

-- Оплати клієнта отримувачу (транші).
CREATE TABLE payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id      INTEGER NOT NULL REFERENCES deals(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at      TEXT NOT NULL,
  recorded_by  INTEGER NOT NULL REFERENCES members(id)
);

-- Нарахування: комісія рекомендувачу і плата платформи (15% від комісії, мін. $50 за угоду).
CREATE TABLE commissions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id             INTEGER NOT NULL REFERENCES deals(id),
  payment_id          INTEGER NOT NULL REFERENCES payments(id),
  base_cents          INTEGER NOT NULL,
  pct                 REAL NOT NULL,
  referrer_cents      INTEGER NOT NULL,
  platform_fee_cents  INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','paid','cancelled')),
  receiver_marked_at  TEXT,
  referrer_confirmed_at TEXT,
  created_at          TEXT NOT NULL
);

CREATE TABLE ratings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id     INTEGER NOT NULL REFERENCES deals(id),
  from_member INTEGER NOT NULL REFERENCES members(id),
  to_member   INTEGER NOT NULL REFERENCES members(id),
  score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (deal_id, from_member)
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  actor     TEXT NOT NULL,                        -- 'tg:<id>' | 'client' | 'cron' | 'admin:<id>'
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id INTEGER,
  meta      TEXT,
  at        TEXT NOT NULL
);
CREATE INDEX audit_entity ON audit_log(entity, entity_id);

-- Стан діалогу бота (майстри вступу, створення ліда, введення сум, OTP).
CREATE TABLE bot_sessions (
  tg_id      INTEGER PRIMARY KEY,
  state      TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
