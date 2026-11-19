-- Підтверджений номер телефону акаунта (аудит безпеки 19.11.2026). Лише додавання.
-- clients.phone клієнт вписує сам (профіль, замовлення) — для прав доступу він не годиться. phone_verified — номер, який бот
-- підтвердив для цього акаунта під час входу за номером (functions/api/auth/phone/confirm.js): за ним привʼязується запрошення
-- працівника (functions/_roles.js findStaff, functions/api/admin/staff.js). Акаунти provider = 'phone' підтверджені самим входом
-- (provider_id = номер), їм колонка не потрібна. Код працює й до застосування міграції (тоді — лише акаунти входу за номером).
ALTER TABLE clients ADD COLUMN phone_verified TEXT;
CREATE INDEX IF NOT EXISTS clients_phone_verified ON clients(phone_verified);
