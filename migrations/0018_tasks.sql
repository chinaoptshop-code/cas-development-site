-- CRM v4 (Михайло 20.11.2026): задачі («виставляти задачі, відмічати виконані») і таблиці контактів. Лише додавання.
-- Код працює й до застосування міграції: вкладка «Задачі» відповідає 503 «оновлюється», довідник контактів — як раніше (без архіву).
--
-- tasks — загальні задачі CRM: будь-яка справа з виконавцем і строком, за бажанням привʼязана до заявки, обʼєкта (+ етап) чи контакту.
-- Задачі по етапах обʼєкта (project_tasks, 0012) лишаються у своїй таблиці — спільний список показує обидві (functions/_tasks.js).
-- Права (functions/_roles.js): tasks.manage (власник, менеджер) — створювати, призначати, бачити всі; tasks.own — лише призначені собі.
CREATE TABLE IF NOT EXISTS tasks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'open',     -- open | done | cancelled
  priority          TEXT NOT NULL DEFAULT 'normal',   -- normal | high («важлива»)
  due_date          TEXT,                             -- YYYY-MM-DD за Києвом; NULL — без строку
  due_time          TEXT,                             -- HH:MM (необовʼязково, лише з датою)
  assignee_staff_id INTEGER REFERENCES staff(id),     -- виконавець; NULL — без виконавця
  created_by        INTEGER REFERENCES staff(id),     -- автор (йому — сповіщення «виконано»)
  done_by           INTEGER REFERENCES staff(id),
  done_at           TEXT,                             -- UTC «YYYY-MM-DD HH:MM:SS»
  done_note         TEXT,                             -- коментар виконавця
  order_id          INTEGER REFERENCES orders(id),    -- привʼязка: заявка
  project_id        INTEGER REFERENCES projects(id),  -- привʼязка: обʼєкт
  stage_id          TEXT,                             -- … і його етап (id з projects.stages)
  contact_id        INTEGER REFERENCES partners(id),  -- привʼязка: контакт довідника
  -- черга сповіщень у Telegram: 0 — ще треба надіслати (поза 10:00–20:00 Київ чекає ранку), 1 — надіслано або не потрібне
  assign_notified   INTEGER NOT NULL DEFAULT 1,
  done_notified     INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_staff_id, status, due_date);
CREATE INDEX IF NOT EXISTS tasks_due ON tasks(status, due_date);
CREATE INDEX IF NOT EXISTS tasks_order ON tasks(order_id);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_contact ON tasks(contact_id);

-- Ранкове зведення «сьогодні й прострочені»: не більше одного на день на працівника (day — київська дата останнього зведення).
CREATE TABLE IF NOT EXISTS task_digest (
  staff_id INTEGER PRIMARY KEY REFERENCES staff(id),
  day      TEXT NOT NULL
);

-- Контакти: архів замість видалення (звʼязки з обʼєктами, заявками й задачами лишаються; дедуплікація бачить і архівні).
ALTER TABLE partners ADD COLUMN archived_at TEXT;
