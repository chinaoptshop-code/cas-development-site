-- Заявка → пропозиція → проєкт (CRM v2, Михайло 18.11.2026). Лише додавання; старі заявки лишаються як були.
-- Код працює й до застосування: без міграції пропозиція не зберігається (503 «оновлюється»), конверсія — без orders.project_id.
-- Ставки — functions/_rates.js (ЗГЕНЕРОВАНО tools/site/rates.py з CLAUDE.md), розрахунок і підписи — functions/api/admin/crm.js (OFFER).

-- Попередній розрахунок «від $…»: JSON {key, label, area, unit, region: ua|eu, rate, min, from, at, by}; from = null — «за кошторисом».
ALTER TABLE orders ADD COLUMN offer TEXT;
-- Проєкт, створений із заявки однією кнопкою (POST /api/admin/projects {type: 'from_lead'}); повторна конверсія → 409 з id.
ALTER TABLE orders ADD COLUMN project_id INTEGER REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS orders_project ON orders(project_id);
