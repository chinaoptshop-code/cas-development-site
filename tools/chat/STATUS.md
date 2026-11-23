# Чат на сайті — стан робіт (гілка chat/site-2311; файл приберемо після інтеграції)

- [x] Шар 1: міграція 0021 (після 0020_task_remind з main), публічний API /api/chat/* (status, start, send, upload, poll, contact, file), тести chat.mjs
- [x] Шар 2: API воркера /api/bot/chat (черга з блокуванням, відповідь з estimate/audio, typing, release, handoff + handoff_reason), /file, /ping; очищення й черга «нова розмова» в lead-sla
- [x] Шар 3: адмін-API /api/admin/chat і вкладка «Чат» (assets/admin/chat.v1.{js,css}), права chat.view / chat.reply, ліміт STAFF_LIMITS.chat
- [x] Шар 4: панель assets/chat.v1.{js,css}, завантажувач і іконки ?chat=1 у site-chrome.v1.js, CHAT_PUBLIC у flags.py → chrome.py / leadform.py, Permissions-Policy microphone=(self), Playwright chatui.mjs
- [x] Шар 5: tools/chat/API.md, README розділ 20, tools/chat/privacy-draft.md

Інтегратору: CLAUDE.md (абзац про чат), погодити privacy-draft.md і внести в tools/site/privacy.py, при CHAT_PUBLIC=True — build-all;
tools/chat/ver.py — у build-all (або запускати після правки панелі); прибрати цей файл.

## Воркер Mac mini (гілка chat/worker-2311, `tools/chat/worker/`)

- [x] Шар 1: клієнт API (`api.py`, backoff, ліміт розміру файлу), цикл (`worker.py`: пінг, черга, 1–2 розмови, typing, 409, release), конфіг `~/.cas-chat/env` (`config.py`), фейковий API і тести `test_loop.py`
- [ ] Шар 2: попередній кошторис кодом за rates.py
- [ ] Шар 3: розбір файлів
- [ ] Шар 4: модель, правила, перевірки відповіді
- [ ] Шар 5: голос, дзвінок
- [ ] Шар 6: install.sh, README, --selftest
