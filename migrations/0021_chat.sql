-- Чат на сайті (23.11.2026): відвідувач пише у віконце (assets/chat.v1.js) → Cloudflare Function кладе повідомлення й файли сюди
-- (файли — у R2 binding MEDIA, якщо привʼязано, інакше байти в D1) → воркер на Mac mini забирає чергу через /api/bot/chat
-- (ключ X-Bot-Key) і кладе відповідь назад. Контракт — tools/chat/API.md, логіка — functions/_chat.js.
-- Відвідувач без акаунта й cookie: sid (128 біт випадкових) + token (256 біт) у його браузері; тут — лише sha256 токена.
-- Сирий IP не зберігаємо — лише хеш (як rate_hits). Терміни: розмова без заявки — 30 діб, файли без заявки — 14 діб
-- (runChatCleanup у розкладі /api/admin/lead-sla).

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sid           TEXT NOT NULL UNIQUE,              -- 32 hex, публічний ідентифікатор розмови
  token_hash    TEXT NOT NULL,                     -- hex(sha256('chat|' + token))
  lang          TEXT,                              -- uk ru en es zh pl de fr pt ar
  page          TEXT,                              -- шлях сторінки, з якої почали (/remont-kvartyr-kyiv)
  ref_host      TEXT,                              -- зовнішнє джерело візиту (functions/_refhost.js)
  ip_hash       TEXT,
  state         TEXT NOT NULL DEFAULT 'bot',       -- bot | waiting (чекає людину) | staff (відповідає людина) | closed
  order_id      INTEGER REFERENCES orders(id),     -- заявка CRM, якщо лишили номер або менеджер створив
  client_id     INTEGER REFERENCES clients(id),    -- наступний етап: той самий чат у кабінеті клієнта (/kabinet); на сайті — NULL
  notified_at   TEXT,                              -- коли адмінам пішло «нова розмова» (NULL — ще ні: поза 10:00–20:00 Київ чекає в черзі)
  handoff_reason TEXT,                             -- чому воркер покликав людину: asks_human | big_project | complaint | complex | other
  last_user_id  INTEGER NOT NULL DEFAULT 0,        -- id останнього повідомлення відвідувача
  answered_upto INTEGER NOT NULL DEFAULT 0,        -- до якого повідомлення відвідувача включно вже є відповідь (бот або людина)
  lock_until    INTEGER,                           -- unix-час: воркер узяв розмову в роботу (повторна видача — після)
  typing_until  INTEGER,                           -- unix-час: «помічник друкує…»
  bytes         INTEGER NOT NULL DEFAULT 0,        -- скільки байтів завантажив відвідувач
  msgs          INTEGER NOT NULL DEFAULT 0,
  staff_seen_id INTEGER NOT NULL DEFAULT 0,        -- до якого повідомлення переглянули в адмінці
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_at       TEXT NOT NULL DEFAULT (datetime('now')),  -- остання подія розмови (для списку й терміну зберігання)
  last_user_at  TEXT,
  last_bot_at   TEXT
);
CREATE INDEX IF NOT EXISTS chat_sessions_queue ON chat_sessions(state, last_user_id, answered_upto);
CREATE INDEX IF NOT EXISTS chat_sessions_last ON chat_sessions(last_at);
CREATE INDEX IF NOT EXISTS chat_sessions_order ON chat_sessions(order_id);
CREATE INDEX IF NOT EXISTS chat_sessions_client ON chat_sessions(client_id);
CREATE INDEX IF NOT EXISTS chat_sessions_notify ON chat_sessions(notified_at, last_user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES chat_sessions(id),
  role        TEXT NOT NULL,                       -- user | bot | staff | system
  text        TEXT,
  audio_id    TEXT,                                -- chat_files.id озвученої відповіді бота
  audio_dur   REAL,
  estimate    TEXT,                                -- JSON попереднього розрахунку (схема — tools/chat/API.md)
  author      TEXT,                                -- імʼя працівника (role = staff)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages(session_id, id);

CREATE TABLE IF NOT EXISTS chat_files (
  id          TEXT PRIMARY KEY,                    -- 24 hex
  session_id  INTEGER NOT NULL REFERENCES chat_sessions(id),
  message_id  INTEGER,                             -- NULL — завантажено, але ще не надіслано
  role        TEXT NOT NULL DEFAULT 'user',        -- user | bot (аудіо-відповідь)
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  kind        TEXT NOT NULL,                       -- image video audio pdf sheet doc cad model archive
  size        INTEGER NOT NULL,
  r2_key      TEXT,
  data        BLOB,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_files_session ON chat_files(session_id, message_id);
CREATE INDEX IF NOT EXISTS chat_files_created ON chat_files(created_at);
