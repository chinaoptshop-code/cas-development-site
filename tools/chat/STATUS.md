# Чат на сайті — стан робіт (гілка chat/site-2311; файл приберемо після інтеграції)

- [x] Шар 1: міграція 0021, публічний API /api/chat/* (start, send, upload, poll, contact, file), тести tools/tests/chat.mjs
- [x] Шар 2: API воркера /api/bot/chat (черга з блокуванням, відповідь, typing, release, handoff), /api/bot/chat/file, /api/bot/chat/ping; очищення в lead-sla
- [x] Адмін-API /api/admin/chat (список, картка, файл, відповідь людини, стан, заявка), права chat.view / chat.reply
- [ ] Шар 3: вкладка «Чат» у /kabinet/admin (assets/admin/chat.v1.js)
- [ ] Шар 4: віконце assets/chat.v1.{js,css}, завантажувач у site-chrome.v1.js, іконка за прапорцем CHAT_PUBLIC, Playwright
- [ ] Шар 5: tools/chat/API.md, розділ README, privacy-draft.md
