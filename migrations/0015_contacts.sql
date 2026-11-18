-- «Контакти» (CRM v2, Михайло 18.11.2026): один довідник клієнтів, підрядників, партнерів, постачальників, ріелторів, бригад і майстрів.
-- Не нова таблиця, а розширення бази «Партнери» (0013): бот пошуку пише туди ж (POST /api/bot/partners), дедуплікація та сама
-- (телефон, Telegram, сайт, компанія, тепер і пошта). Лише додавання; наявні записи лишаються з тими ж типами.
-- Типи (partners.type, TEXT): client | contractor | partner | supplier | realtor | crew | master | builder | designer | other — PARTNER_TYPES у functions/_partners.js.
-- Права: partners.base (власник, менеджер) — усе; contacts.linked (дизайнер, польові ролі) — лише читання контактів своїх обʼєктів.
-- Клієнтам контакти не віддаються ніде.
ALTER TABLE partners ADD COLUMN email TEXT;                          -- нижній регістр
ALTER TABLE partners ADD COLUMN rating INTEGER;                      -- 1–5, оцінка менеджера (бот не змінює)
ALTER TABLE partners ADD COLUMN client_id INTEGER REFERENCES clients(id);   -- для типу «Клієнт»: акаунт кабінету
CREATE INDEX IF NOT EXISTS partners_email ON partners(email);
CREATE INDEX IF NOT EXISTS partners_client ON partners(client_id);

-- Звʼязки контакту з обʼєктами й заявками: «бригада плиточників на обʼєкті X», «клієнт заявки Y».
-- Заявки з тим самим телефоном показуються в картці контакту й без звʼязку (за orders.phone).
CREATE TABLE IF NOT EXISTS contact_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES partners(id),
  project_id INTEGER REFERENCES projects(id),
  order_id   INTEGER REFERENCES orders(id),
  role       TEXT,                                 -- «Плиточник», «Постачальник вікон», «Клієнт»
  note       TEXT,
  created_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_links_cp ON contact_links(contact_id, project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contact_links_co ON contact_links(contact_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_links_project ON contact_links(project_id);
CREATE INDEX IF NOT EXISTS contact_links_order ON contact_links(order_id);
