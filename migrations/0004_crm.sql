-- CRM у /kabinet/admin: замовлення Оздоби й заявки з сайту в одній таблиці orders (kind = order | lead).
-- Воронка (orders.status): new → in_work → quote_sent → paid → production → shipping → delivered | cancelled
-- (підписи — STATUSES у functions/_lib.js). manager_note бачить клієнт у кабінеті, crm_note — лише менеджери.
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'order';   -- order (кошик Оздоби) | lead (заявка: форма, дзвінок, месенджер)
ALTER TABLE orders ADD COLUMN assignee TEXT;                          -- відповідальний менеджер
ALTER TABLE orders ADD COLUMN crm_note TEXT;                          -- внутрішні нотатки
ALTER TABLE orders ADD COLUMN amount INTEGER;                         -- сума угоди (якщо порожньо — total)
ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'UAH';   -- UAH | USD | EUR
ALTER TABLE orders ADD COLUMN next_contact TEXT;                      -- дата наступного контакту, YYYY-MM-DD
ALTER TABLE orders ADD COLUMN source TEXT;                            -- сторінка / канал (cas-develop.com/…, телефон, Instagram)
ALTER TABLE orders ADD COLUMN service TEXT;                           -- послуга із заявки
ALTER TABLE orders ADD COLUMN email TEXT;

-- старі статуси → нова воронка
UPDATE orders SET status = 'in_work' WHERE status IN ('confirmed', 'awaiting_payment');
UPDATE orders SET status = 'production' WHERE status = 'ordered';

CREATE INDEX IF NOT EXISTS orders_kind ON orders(kind, status, created_at);
CREATE INDEX IF NOT EXISTS orders_next ON orders(next_contact);

-- rate-limit прийому заявок (POST /api/leads): sha256 IP і час (unix-секунди)
CREATE TABLE IF NOT EXISTS lead_checks (
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lead_checks_ip ON lead_checks(ip_hash, created_at);
