-- CRM обʼєктів: дата здачі проєкту і чекліст задач по етапах (вкладка «Обʼєкти» в /kabinet/admin, кабінет працівника /kabinet/team).
-- Лише додавання. Код працює й до застосування міграції: deadline і задачі просто не зберігаються/не показуються (noTable).
-- Шаблони етапів за типом проєкту — константа TEMPLATES у functions/api/admin/projects.js; погодження етапу клієнтом
-- (approved_at, revisions) — поля в JSON projects.stages, без міграції.

-- Дата здачі обʼєкта за договором (YYYY-MM-DD). Прострочка: deadline < сьогодні і status != 'done'.
ALTER TABLE projects ADD COLUMN deadline TEXT;

-- Задачі проєкту: «замовити плитку», «погодити розкладку» — привʼязка до етапу (id з projects.stages), виконавець і термін.
CREATE TABLE IF NOT EXISTS project_tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  stage_id   TEXT,                                 -- id етапу з projects.stages або NULL
  title      TEXT NOT NULL,
  staff_id   INTEGER REFERENCES staff(id),         -- виконавець; NULL — без виконавця
  due_date   TEXT,                                 -- термін YYYY-MM-DD
  done       INTEGER NOT NULL DEFAULT 0,           -- 0/1
  done_at    TEXT,
  done_by    INTEGER REFERENCES staff(id),
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS project_tasks_staff ON project_tasks(staff_id, done);
