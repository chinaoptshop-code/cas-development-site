# Заметки для Claude Code

Пользователь общается по-русски. Отвечай по-русски.

## Репозиторий

Статический сайт (HTML в корне), деплоится на Cloudflare Pages из корня репозитория
(`.github/workflows/deploy.yml`). Папка `tools/`, `.claude/` и этот файл перед деплоем
удаляются шагом «Exclude non-site files» — они не попадают на сайт.

## Telegram (личный аккаунт пользователя) — `tools/telegram/`

Инструмент `tools/telegram/tg.sh` даёт доступ к личному Telegram-аккаунту пользователя
(чтение/отправка сообщений, файлы, фото, голосовые). Подробности: `tools/telegram/README.md`.

Когда пользователь просит что-то сделать в Telegram — используй его через Bash:

```bash
tools/telegram/tg.sh me                          # проверить, что сессия жива
tools/telegram/tg.sh chats --limit 30            # список чатов (id, тип, непрочитанные)
tools/telegram/tg.sh unread                      # что нового (каналы и muted пропущены; --all)
tools/telegram/tg.sh read "Иван" --limit 20      # сообщения чата: имя | @username | +телефон | id | me
tools/telegram/tg.sh search "счёт" --limit 10    # поиск по всем чатам (или --chat X)
tools/telegram/tg.sh send "Иван" "Привет!"       # отправить текст (--reply-to ID, --parse md)
tools/telegram/tg.sh send-file "Иван" путь.pdf --caption "Смета"
tools/telegram/tg.sh download "Иван" 1234 1235   # скачать медиа из сообщений → путь к файлу
tools/telegram/tg.sh transcribe "Иван" 1234      # голосовое → текст
tools/telegram/tg.sh say "Иван" "Текст голосового"   # озвучить текст и отправить голосовым
tools/telegram/tg.sh send-voice "Иван" запись.mp3    # отправить аудио как голосовое
tools/telegram/tg.sh --json <команда> ...        # машиночитаемый вывод
```

Правила:
- Фото и файлы: сначала `download`, затем смотри файл инструментом Read (картинки он показывает).
- Голосовые: `transcribe` (сначала Telegram, при неудаче локальный Whisper — первый запуск
  качает модель, это нормально).
- Перед отправкой сообщений/файлов от имени пользователя убедись, что он именно это просил;
  текст показывай ему в ответе.
- Никогда не коммить `*.session`, `tools/telegram/downloads/`, строку `TELEGRAM_SESSION`
  и не печатай её без необходимости (только при `login`).
- Если команда падает с «прокси отказал в CONNECT» — в настройках окружения не разрешён
  домен `*.web.telegram.org`; если «Нет сессии» — нужен `login` (см. README).
- Настройки через переменные окружения: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`,
  `TELEGRAM_SESSION` (строка сессии), опционально `TG_TZ` (по умолчанию Europe/Moscow).
