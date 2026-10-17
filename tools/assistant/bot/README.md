# Бот помічника на Mac mini

Mac mini стає постійно увімкненим вузлом помічника: Telegram-бот приймає ваші повідомлення
і на кожне запускає Claude Code локально (`claude -p`), за вашою підпискою Claude. Відповідь
приходить за секунди, токени витрачаються лише на ваші повідомлення і 4 планові сценарії на
день. Хмарні планові задачі при цьому не потрібні.

Пам'ять: папка **«Асистент Михайла»** у Google Drive, синхронізована на Mac застосунком
Google Drive для комп'ютера. Для бота це звичайні Markdown-файли, Drive сам синхронізує їх у
хмару, тож ті самі файли бачать і хмарні сесії Claude через конектор Google Drive.

## Встановлення (один раз, 15 хвилин)

1. **Claude Code** на Mac: у Терміналі `curl -fsSL https://claude.ai/install.sh | bash`, потім
   `claude` і вхід у свій акаунт Claude. Перевірка: `claude -p "скажи ok"`.
2. **Репозиторій**: `git clone https://github.com/chinaoptshop-code/cas-development-site ~/cas-development-site`.
3. **Google Drive для комп'ютера** (якщо ще не стоїть): увійти своїм Google-акаунтом,
   режим «Потік» (Stream) або «Дзеркало». Папка з'явиться за шляхом на кшталт
   `~/Library/CloudStorage/GoogleDrive-<пошта>/My Drive/Асистент Михайла`
   (назва «My Drive» може бути «Мій диск»). Знайдіть точний шлях у Finder.
4. **Бот у Telegram**: у @BotFather команда `/newbot`, назва, username. Скопіюйте токен.
   Відкрийте свого бота і натисніть Start.
5. **Telegram особистого акаунта** (для читання чатів, голосових і пошуку): або покладіть
   рядок сесії з хмарної сесії у файл з кроку 6, або увійдіть заново в Терміналі:
   ```bash
   cd ~/cas-development-site
   tools/telegram/tg.sh login --phone +380...     # далі --code, --password
   tools/telegram/tg.sh setup --whisper           # розшифровка голосових офлайн
   ```
6. **Конфіг**: створіть файл `~/.assistant.env` (значення в лапках, якщо є пробіли):
   ```bash
   ASSISTANT_BOT_TOKEN=...            # токен з BotFather
   ASSISTANT_BOT_USERNAME=...         # username бота без @
   ASSISTANT_CHAT_ID=...              # ваш числовий Telegram id (tg.sh me його показує)
   ASSISTANT_MEMORY_DIR="/Users/<ви>/Library/CloudStorage/GoogleDrive-<пошта>/My Drive/Асистент Михайла"
   ASSISTANT_REPO=/Users/<ви>/cas-development-site
   TELEGRAM_API_ID=...                # з my.telegram.org
   TELEGRAM_API_HASH=...
   TELEGRAM_SESSION=...               # рядок сесії (або пропустіть і зробіть login на кроці 5)
   CLAUDE_MODEL=sonnet                # sonnet — дешево і швидко; opus — для складного
   ```
7. **Запуск як служби** (автостарт, перезапуск при падінні):
   ```bash
   tools/assistant/bot/install.sh
   ```
   Скрипт створює launchd-задачі: бот (постійно) і сценарії ранок 07:30, вечір 21:00,
   неділя 18:00, спортзал Пн/Ср/Пт 17:30. Логи: `~/Library/Logs/assistant/`.
   Зупинити все: `tools/assistant/bot/install.sh --remove`.

Перевірка: напишіть боту «привіт». Далі: «додай задачу …», голосове, файл Plaud, «зроби тези
у PDF», «що в мене на тижні».

## Як це працює

- `bot/bot.py`: long polling Bot API, приймає тільки повідомлення від `ASSISTANT_CHAT_ID`.
  Голосові, аудіо, файли, фото скачує в `<пам'ять>/inbox-files/` і передає шлях Claude.
  Для кожного повідомлення: `claude -p --continue` (одна розмова на день, `/new` починає
  нову). Відповідь = останній абзац виводу Claude; рядок `SEND_FILE: /шлях` = надіслати файл.
- `bin/run-playbook.sh <morning|evening|weekly|gym>`: те саме для планових сценаріїв.
- `bin/transcribe.sh`: голос → текст локально (faster-whisper).
- Інструменти Claude обмежені списком `CLAUDE_ALLOWED_TOOLS` (читання/запис файлів, скрипти
  помічника і Telegram, pandoc, ffmpeg). Розширювати обережно.

## Економія токенів

- Модель за замовчуванням `sonnet`; `opus` вмикайте для складних документів (`CLAUDE_MODEL`).
- Одна розмова на день з `--continue`: сценарії та пам'ять читаються один раз, далі з кешу.
- Планові сценарії: 4 на день замість 15 хмарних запусків. Зайві вимикайте в `install.sh`.
- Короткі відповіді та короткі сценарії. Великі файли пам'яті (журнал) ділити по місяцях.
- Хмарні сесії Claude лишаються для великих задач (сайт, довгі документи), не для чату.

## Календар і пошта на Mac

Конектори claude.ai у локальному Claude Code недоступні. Варіанти: додати MCP-сервер Google
Calendar (`claude mcp add` + сервер на зразок `@cocal/google-calendar-mcp`), або лишити
календар і пошту хмарним сесіям. Бот про це знає і не вигадує події, якщо інструмента немає.

## Файли з NAS (Synology) на Google Drive

Перенесення великих обсягів (PDF, 3D-моделі) з NAS у Drive найкраще робити на Mac mini
утилітою `rclone`: вона копіює напряму NAS (SFTP або WebDAV) → Google Drive, з докачуванням
і без ручного перетягування. Налаштування: `brew install rclone`, `rclone config` (remote для
NAS і remote для Drive), далі наприклад
`rclone copy nas:/volume1/projects gdrive:"Архів NAS" --include "*.pdf" --progress`.
Паролі від NAS у чат з помічником не писати, тільки в `rclone config`.
