-- Зовнішнє джерело візиту (22.11.2026): домен сайту, з якого людина прийшла на cas-develop.com (Google, ChatGPT, Instagram…),
-- навіть без UTM. Лише хост — без шляху й параметрів (нижній регістр, без «www.», ≤ 80 символів); браузер тримає його в
-- sessionStorage від першого заходу в сесії (site-chrome.v1.js / lead-form.v1.js) і шле разом із заявкою, яку людина сама надіслала.
-- Пише functions/api/leads.js (refHost у functions/_refhost.js, інакше — null); без міграції заявка зберігається без поля.
-- Показ (людська назва), фільтр ?rh= і CSV — /kabinet/admin → CRM (functions/api/admin/crm.js), лише для leads.view_all (власник, менеджер).
ALTER TABLE orders ADD COLUMN ref_host TEXT;

CREATE INDEX IF NOT EXISTS orders_ref_host ON orders(ref_host);
