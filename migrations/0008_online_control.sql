-- «Онлайн-контроль обʼєкта» (/kabinet/obiekt): камера 24/7, графік платежів по етапах, привʼязка звітів і актів до етапу.
-- Етапи лишаються JSON у projects.stages ([{id, name, status, progress, start, end, note}]); id етапу — короткий ключ,
-- який сервер ставить сам (functions/api/admin/projects.js), щоб звіти/документи/платежі не «з'їжджали» при зміні порядку.
-- Особисті дані й суми — лише в D1, не в репозиторії.

-- Камера на обʼєкті (за доп. оплату). camera_url — https-посилання: YouTube (трансляція з доступом за посиланням —
-- вбудовуємо через youtube-nocookie.com, уже дозволений у CSP) або хмара камери (Hik-Connect, Ezviz, Imou, Ivideon…) —
-- відкривається в новій вкладці. Бачить лише власник проєкту й адміни.
ALTER TABLE projects ADD COLUMN camera_url TEXT;
ALTER TABLE projects ADD COLUMN camera_note TEXT;          -- підказка клієнту: «логін у застосунку Ezviz — ваш номер»

-- Звіт і документ (акт етапу) можуть належати етапу
ALTER TABLE project_reports ADD COLUMN stage_id TEXT;
ALTER TABLE documents ADD COLUMN stage_id TEXT;

-- Графік платежів: схема в кожного клієнта своя (50/50, 50/30/20, 50/40/10, розбивка, аванс від 10%) — лише рядки бази, без хардкоду
CREATE TABLE IF NOT EXISTS project_payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  stage_id   TEXT,                                -- етап, до якого привʼязаний платіж (або NULL)
  title      TEXT NOT NULL,                       -- «Аванс», «Після чорнових робіт»
  pct        REAL,                                -- частка від суми договору, % (необовʼязково)
  amount     REAL,                                -- сума (необовʼязково)
  currency   TEXT NOT NULL DEFAULT 'USD',         -- USD | UAH | EUR
  due_date   TEXT,                                -- YYYY-MM-DD, план
  paid_date  TEXT,                                -- YYYY-MM-DD, факт
  status     TEXT NOT NULL DEFAULT 'planned',     -- planned | due | paid
  note       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS project_payments_project ON project_payments(project_id, sort);
