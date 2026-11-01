-- Аналітика заявок у CRM (/kabinet/admin → «Аналітика», фільтри за джерелом і датою).
-- Лише нові необовʼязкові колонки й індекс: старі рядки лишаються як є (NULL), functions/api/leads.js пише їх,
-- а якщо міграція ще не застосована — зберігає заявку без них (fallback), тож прийом заявок не ламається.
-- Місце форми на сторінці («#prices», «#portfolio», «#project», «#blog-mid», «#services»…) — уже в orders.source
-- після «#» (assets/lead-form.v1.js), окремої колонки не треба.
ALTER TABLE orders ADD COLUMN form TEXT;   -- назва форми: landing | quick | quick-prices | quiz … (data-form)
ALTER TABLE orders ADD COLUMN lang TEXT;   -- мова сторінки: uk | ru | en | es | zh …
ALTER TABLE orders ADD COLUMN utm TEXT;    -- utm_source / utm_medium / utm_campaign

CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
