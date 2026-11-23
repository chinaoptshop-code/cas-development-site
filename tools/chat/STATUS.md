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
- [x] Шар 2: попередній кошторис кодом (`estimate.py` за rates.py, підписи — cCfg калькулятора 10 мов; коробка + ремонт, комерція, поза Україною й Європою), параметри з розмови (`params.py`, 10 мов, перевірка пропозицій моделі), фрази (`texts.py`), тести `test_estimate.py` (звірка з casCalcRows у node)
- [x] Шар 3: розбір файлів (`parsers/`: фото + vision Ollama, аудіо → transcribe.sh, відео → кадри + звук, PDF текст/скан, Excel/CSV з перерахунком кошторису, DOCX, DXF (ezdxf або свій читач), DWG через ODA/LibreDWG, 3DS — свій читач чанків; SKP/IFC/RVT/ZIP — менеджеру); окремий процес з тайм-аутом і лімітами, zip-бомби, тимчасова тека видаляється; тести `test_parsers.py`
- [x] Шар 4: `brain.py` (файли → паспорти, параметри → кошторис кодом, текст моделі + шаблони 10 мов), `llm.py` (local Ollama типово; api — лише CHAT_LLM=api), `prompts.py` (дані клієнта в окремому блоці), `checks.py` (мова, заборонені теми, суми лише з estimate, 2 спроби → шаблон + complex); спільні факти `tools/assistant/bot/client_rules.py` (PUBLIC + факти 23.11), бот імпортує їх; тести `test_brain.py`
- [x] Шар 5: голос (`voice.py` → спільний `tools/assistant/bot/tts.py`, клон голосу, ogg ≤ 6 МБ, ~30 с; лише на голосове), дзвінок (`slots.py` ← gcal.py `week --json`, додано поле end; 3 проміжки Пн–Пт 10–20 Київ; вибір → handoff asks_human + `renotify` — розширення API з тестом у chat.mjs, API.md)
- [x] Шар 6: `run.py` (`--selftest` — таблиця можливостей, `--once`, `--dry`, служба з блокуванням одного екземпляра), `install.sh` (launchd `com.cas.chatworker`, `~/.cas-chat/env`, журнал `~/Library/Logs/cas-chat`), `README.md`; наскрізний `test_e2e.py` проти стенду `stand.mjs` (справжні functions/ через harness)

На Mac mini: README «Встановлення»; якість відповідей локальної моделі ще не перевірена на живій Ollama (тести — з фейковою моделлю).
