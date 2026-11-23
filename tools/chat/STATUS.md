# Чат на сайті — стан робіт (гілка chat/site-2311; файл приберемо після інтеграції)

- [x] Шар 1: міграція 0021, публічний API /api/chat/* (start, send, upload, poll, contact, file), тести tools/tests/chat.mjs
- [x] Шар 2: API воркера /api/bot/chat (черга з блокуванням, відповідь, typing, release, handoff), /api/bot/chat/file, /api/bot/chat/ping; очищення в lead-sla
- [x] Адмін-API /api/admin/chat (список, картка, файл, відповідь людини, стан, заявка), права chat.view / chat.reply
- [x] Шар 3: вкладка «Чат» у /kabinet/admin (assets/admin/chat.v1.{js,css}, cms.v1.js, tools/shop/pages.py → kabinet/admin.html)
- [x] «Нова розмова» адмінам (10:00–20:00 Київ одразу, інакше черга lead-sla), handoff_reason, chat_sessions.client_id (на майбутнє — кабінет)
- [x] Шар 4: панель assets/chat.v1.{js,css}, завантажувач у site-chrome.v1.js (?chat=1), іконка за прапорцем CHAT_PUBLIC (flags.chat_icon → chrome.py, leadform.py), GET /api/chat/status, Permissions-Policy microphone=(self), Playwright tools/tests/chatui.mjs
- [ ] Шар 5: tools/chat/API.md, розділ README, privacy-draft.md
