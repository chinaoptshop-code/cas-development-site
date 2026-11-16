-- Сторінка-джерело заявки (Михайло 16.11.2026): попередня сторінка сайту, з якої відвідувач перейшов на сторінку з формою
-- (кейс, тур, стаття → лендинг/контакти). Раніше — лише рядок «Перед цим: /шлях» у коментарі (він лишається для n8n і старих звітів).
-- Пише functions/api/leads.js (лише шлях того самого сайту: «/…», без query/hash, ≤ 160 символів); без міграції заявка зберігається без неї.
-- Показ, фільтр ?ref= і CSV — /kabinet/admin → CRM (functions/api/admin/crm.js), лише для leads.view_all (власник, менеджер).
ALTER TABLE orders ADD COLUMN ref_path TEXT;

CREATE INDEX IF NOT EXISTS orders_ref ON orders(ref_path);
