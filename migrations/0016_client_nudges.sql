-- Нагадування клієнту й прохання про відгук (CRM v2, Михайло 18.11.2026). Лише додавання.
-- Нагадування «етап чекає погодження» — поля в JSON етапу (review_at, remind_at, remind_n, hist), без міграції.
-- Відгук у Google: через ~2 доби після статусу «Завершено» — один раз (Telegram-бот, якщо клієнт привʼязаний; інакше — кнопка
-- «Попросити відгук» в адмінці з готовим текстом). Логіка — functions/_nudges.js, запуск — /api/admin/lead-sla (кожні 5 хв).
ALTER TABLE projects ADD COLUMN done_at TEXT;            -- коли проєкт став «Завершено» (YYYY-MM-DD HH:MM:SS, UTC); інший статус — NULL
ALTER TABLE projects ADD COLUMN review_asked_at TEXT;    -- коли попросили відгук (будь-яким каналом); NULL — ще ні
ALTER TABLE projects ADD COLUMN review_channel TEXT;     -- telegram (бот) | telegram_manual | viber | whatsapp | copy
