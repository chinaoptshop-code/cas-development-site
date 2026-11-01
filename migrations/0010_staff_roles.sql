-- Ролі й доступ у CRM (/kabinet/admin — майстер-панель, /kabinet/team — кабінет працівника, /kabinet — клієнт).
-- Лише додавання: старі дані й старий текстовий orders.assignee / projects.manager лишаються як були.
-- Права за роллю — константа ROLES у functions/_roles.js; як додати працівника — tools/admin/README.md, «Персонал і ролі».

-- «Вийти на всіх пристроях»: номер версії входить у підпис cookie cas_s; +1 — усі видані сесії стають недійсними.
ALTER TABLE clients ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
-- Telegram id клієнта, що увійшов за номером телефону через бота (provider = 'phone') — щоб упізнати власника/працівника.
ALTER TABLE clients ADD COLUMN tg_id TEXT;

-- Працівники студії. client_id — акаунт, яким людина входить; до першого входу NULL, тоді працівника впізнаємо
-- за tg_id / email / phone (запрошення) і привʼязуємо автоматично.
-- role: owner (лише Михайло, OWNER_TG_ID / OWNER_EMAIL) | manager | designer | foreman | furniture | surveyor | scan3d | drone | accountant
CREATE TABLE IF NOT EXISTS staff (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id      INTEGER UNIQUE REFERENCES clients(id),
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,       -- 0 — доступ закрито миттєво (перевірка при кожному запиті)
  tg_id          TEXT,                             -- запрошення за Telegram id
  email          TEXT,                             -- запрошення за поштою Google (нижній регістр)
  phone          TEXT,                             -- запрошення за номером (+380…)
  note           TEXT,
  created_by     INTEGER REFERENCES staff(id),     -- NULL — створено автоматично (власник, перехід ADMIN_TG_IDS → manager)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deactivated_at TEXT
);
CREATE INDEX IF NOT EXISTS staff_tg ON staff(tg_id);
CREATE INDEX IF NOT EXISTS staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS staff_phone ON staff(phone);

-- Призначення: відповідальний працівник заявки/замовлення і проєкту (+ кілька виконавців проєкту в project_staff).
ALTER TABLE orders ADD COLUMN assignee_staff_id INTEGER REFERENCES staff(id);
ALTER TABLE orders ADD COLUMN city TEXT;                 -- область / місто обʼєкта (фільтр у майстер-панелі)
ALTER TABLE projects ADD COLUMN assignee_staff_id INTEGER REFERENCES staff(id);
ALTER TABLE projects ADD COLUMN order_id INTEGER REFERENCES orders(id);   -- заявка, з якої виріс проєкт (воронка)
ALTER TABLE projects ADD COLUMN contract_amount REAL;    -- сума договору (фінанси, борги)
ALTER TABLE projects ADD COLUMN contract_currency TEXT NOT NULL DEFAULT 'USD';
CREATE INDEX IF NOT EXISTS orders_staff ON orders(assignee_staff_id, status);
CREATE INDEX IF NOT EXISTS projects_staff ON projects(assignee_staff_id, status);

CREATE TABLE IF NOT EXISTS project_staff (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  staff_id   INTEGER NOT NULL REFERENCES staff(id),
  task       TEXT,                                 -- «Чорнові роботи», «Замір 3D», «Зйомка з дрона»
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, staff_id)
);
CREATE INDEX IF NOT EXISTS project_staff_staff ON project_staff(staff_id);

-- Хто завантажив фотозвіт (клієнт це поле не бачить)
ALTER TABLE project_reports ADD COLUMN author_staff_id INTEGER REFERENCES staff(id);

-- «Проблема на обʼєкті» від працівника — лише для команди, клієнт не бачить
CREATE TABLE IF NOT EXISTS project_issues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  staff_id    INTEGER REFERENCES staff(id),
  stage_id    TEXT,
  note        TEXT NOT NULL,
  photos      TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'open',        -- open | resolved
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES staff(id)
);
CREATE INDEX IF NOT EXISTS project_issues_project ON project_issues(project_id, status);

-- Фото з обʼєкта (фотозвіти й проблеми з телефона прораба). Приватні: віддає /api/media/<id> лише власнику проєкту
-- й працівникам з доступом до нього. Якщо привʼязано R2 (binding MEDIA) — байти там, інакше в data (WebP до ~1,5 МБ).
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,                     -- 24 hex
  project_id INTEGER NOT NULL REFERENCES projects(id),
  staff_id   INTEGER REFERENCES staff(id),
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BLOB,
  r2_key     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS media_project ON media(project_id);

-- Аудит: хто, що, коли, до/після (JSON, обрізаний до 8 КБ). Бачить лише власник (audit.view).
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  client_id  INTEGER,                              -- акаунт, що зробив дію
  staff_id   INTEGER,
  actor      TEXT,                                 -- імʼя на момент дії
  role       TEXT,
  action     TEXT NOT NULL,                        -- lead.update, staff.create, project.stage …
  entity     TEXT,                                 -- orders | projects | staff | …
  entity_id  TEXT,
  before     TEXT,
  after      TEXT,
  ip_hash    TEXT
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_staff ON audit_log(staff_id, at);
