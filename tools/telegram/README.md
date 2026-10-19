# Telegram из Claude Code (личный аккаунт)

`tools/telegram/tg.sh` — инструмент, через который Claude работает с **вашим личным
аккаунтом Telegram**: читает и отправляет сообщения, смотрит и отправляет фото и файлы,
расшифровывает голосовые и отправляет голосовые (из файла или озвучивая текст).

Технически это клиент MTProto на библиотеке [Telethon](https://github.com/LonamiWebs/Telethon),
который входит в аккаунт как ещё одно устройство (в Telegram оно будет видно как
«Claude Code» в разделе *Настройки → Устройства*). В облачных сессиях Claude наружу
выпускают только HTTPS через прокси, поэтому используется HTTPS-транспорт MTProto
(`https://pluto|venus|aurora|vesta|flora.web.telegram.org/apiw1` — так работал старый
Telegram Web). На обычном компьютере без прокси используется стандартный TCP-транспорт.

---

## Настройка (один раз)

### 1. Ключи API Telegram (api_id / api_hash)

1. Откройте https://my.telegram.org и войдите по номеру телефона (код придёт в Telegram).
2. Раздел **API development tools** → создайте приложение (App title: `Claude`,
   Short name: `claude`, Platform: `Other`, остальное можно не заполнять).
3. Скопируйте **App api_id** (число) и **App api_hash** (длинная строка).

Если сайт пишет `ERROR` при создании — это известная причуда my.telegram.org: попробуйте
позже, с другого браузера/сети или с другим Short name.

### 2. Переменные окружения

В Claude (облачная сессия) откройте меню окружения в заголовке сессии → **Edit** и
добавьте переменные (раздел *Network secrets* / *API credentials* или *Environment variables*):

| Переменная           | Значение                                           |
|----------------------|----------------------------------------------------|
| `TELEGRAM_API_ID`    | api_id с my.telegram.org                           |
| `TELEGRAM_API_HASH`  | api_hash с my.telegram.org                         |
| `TELEGRAM_SESSION`   | строка сессии — появится после шага 4 (входа)      |

Новые переменные подхватываются **новой сессией** (текущая их не увидит).

### 3. Сетевой доступ окружения

Там же, в настройках окружения, **Network access**:

- проще всего — уровень с полным доступом;
- либо уровень *Limited* и добавить в *Allowed domains*:
  - `*.web.telegram.org` (если шаблоны не принимаются — пять хостов:
    `pluto.web.telegram.org`, `venus.web.telegram.org`, `aurora.web.telegram.org`,
    `vesta.web.telegram.org`, `flora.web.telegram.org`) — обязательно;
  - `translate.google.com` — для озвучивания текста (команда `say`);
  - `huggingface.co` и `*.hf.co` — для расшифровки голосовых без Telegram Premium
    (скачивание модели Whisper).

Галочку «Allow package managers» оставьте включённой (нужна для установки зависимостей).

Необязательно, но ускоряет первый запуск в каждой сессии — в **Setup script** окружения:

```bash
pip install -r tools/telegram/requirements.txt
```

### 4. Вход в аккаунт

Начните **новую** сессию Claude (чтобы она увидела переменные и сеть) и попросите:
«Войди в мой Telegram, номер +7…». Claude выполнит шаги:

```bash
tools/telegram/tg.sh login --phone +79991234567   # Telegram пришлёт код (в приложение или SMS)
tools/telegram/tg.sh login --code 12345           # вы сообщаете код в чат, Claude его вводит
tools/telegram/tg.sh login --password '…'         # только если включена двухэтапная аутентификация
```

После входа команда печатает **строку сессии**. Добавьте её в настройки окружения как
`TELEGRAM_SESSION` — тогда доступ будет работать во всех новых сессиях без повторного
входа. В текущей сессии всё работает сразу (сессия лежит в `~/.tg-claude/tg.session`
внутри контейнера).

Примечания:
- Код приходит в уже залогиненное приложение Telegram (или SMS). Если у вас включён
  облачный пароль (2FA), его придётся сообщить один раз; если не хотите писать пароль в
  чат — временно добавьте переменную `TELEGRAM_PASSWORD` в окружение и начните новую
  сессию, либо выполните вход на своём компьютере (см. ниже).
- Telegram пришлёт уведомление «Новый вход с устройства Claude Code». Не завершайте эту
  сессию в *Настройки → Устройства*, иначе строка `TELEGRAM_SESSION` перестанет работать.
- Вход с «серверного» IP иногда вызывает у Telegram подозрения; для новых api_id это
  бывает. Используйте свой настоящий номер.

---

## Использование

Чат можно указывать как **имя** (часть названия чата / имени контакта), `@username`,
телефон `+7…`, числовой id из `chats` или `me` (Избранное).

```bash
tools/telegram/tg.sh me                             # кто я, какой транспорт — проверка настройки
tools/telegram/tg.sh chats --limit 30               # чаты: id, тип, непрочитанные, последнее
tools/telegram/tg.sh chats --unread                 # только с непрочитанными
tools/telegram/tg.sh unread                         # что нового (каналы и чаты без звука — с --all)
tools/telegram/tg.sh read "Иван Петров" --limit 20  # сообщения чата (новые внизу)
tools/telegram/tg.sh read @ivan --before 1200       # листать назад (старше сообщения #1200)
tools/telegram/tg.sh search "договор"               # поиск по всем чатам (--chat X — в одном)
tools/telegram/tg.sh send "Иван" "Привет! Документы отправлю завтра."
tools/telegram/tg.sh send "Иван" --reply-to 1234 "Ответ на конкретное сообщение"
tools/telegram/tg.sh send-file "Иван" смета.pdf --caption "Смета"
tools/telegram/tg.sh send-file "Иван" фото1.jpg фото2.jpg    # альбом
tools/telegram/tg.sh download "Иван" 1234 1235      # скачать фото/файлы/голосовые → путь к файлу
tools/telegram/tg.sh transcribe "Иван" 1234         # голосовое → текст
tools/telegram/tg.sh say "Иван" "Текст, который нужно произнести"   # голосовое из текста
tools/telegram/tg.sh send-voice "Иван" запись.mp3   # любой аудиофайл → голосовое (OGG/Opus)
tools/telegram/tg.sh mark-read "Иван"               # отметить прочитанным
tools/telegram/tg.sh contacts --search Петр
tools/telegram/tg.sh find "ремонт Київ" --groups-only   # поиск публичных групп/каналов
tools/telegram/tg.sh join @groupname                # вступить в группу (или t.me/+invite)
tools/telegram/tg.sh --json read "Иван"             # любой вывод в JSON
tools/telegram/tg.sh --help ; tools/telegram/tg.sh read --help
```

Как это выглядит в разговоре с Claude: «посмотри, что нового в Telegram», «прочитай
последние сообщения от Ивана», «что он сказал в голосовом?», «отправь Ивану этот файл»,
«ответь ему голосовым: …», «покажи фото, которое прислала Анна».

Фото и файлы Claude скачивает командой `download` в `tools/telegram/downloads/`
(папка не попадает в git) и открывает их своими средствами — картинки он видит.

### Голосовые

- **Расшифровка** (`transcribe`): сначала пробует встроенную расшифровку Telegram
  (доступна с Premium; без него — несколько пробных в неделю), иначе распознаёт локально
  моделью Whisper (`faster-whisper`, модель `small`; первый запуск скачивает ~250 МБ).
  Язык определяется автоматически, можно задать `--lang ru`, модель — `--model medium`.
- **Отправка** (`say`): текст озвучивается (по умолчанию gTTS через translate.google.com,
  язык `--lang ru`), конвертируется в OGG/Opus и отправляется как обычное голосовое с
  волновой формой. Альтернативные движки: `--engine edge` (edge-tts, лучше качество, но
  не работает через прокси облачной сессии) и `--engine piper` (офлайн, нужна модель).
- `send-voice` отправляет готовую запись (mp3/wav/m4a/ogg) как голосовое.

---

## Безопасность

- **Строка `TELEGRAM_SESSION` = полный доступ к аккаунту.** Храните только в секретах
  окружения, не пересылайте, не коммитьте. Файлы `*.session`, папка `downloads/` и
  `~/.tg-claude/` в git не попадают (см. `.gitignore`).
- Отозвать доступ в любой момент: Telegram → *Настройки → Устройства* → завершить сеанс
  «Claude Code». После этого нужен новый вход (`login … --fresh`) и новая строка сессии.
- `tools/telegram/tg.sh logout` — выйти и удалить локальную сессию в контейнере.
- Claude отправляет сообщения и файлы только по вашей просьбе; формулировку он показывает.

---

## Переменные (все необязательны, кроме первых трёх)

| Переменная           | По умолчанию        | Описание |
|----------------------|---------------------|----------|
| `TELEGRAM_API_ID`    | —                   | api_id |
| `TELEGRAM_API_HASH`  | —                   | api_hash |
| `TELEGRAM_SESSION`   | —                   | строка сессии (иначе файл `~/.tg-claude/tg.session`) |
| `TELEGRAM_PASSWORD`  | —                   | пароль 2FA только для шага `login` |
| `TG_TZ`              | `Europe/Moscow`     | часовой пояс дат в выводе |
| `TG_TRANSPORT`       | `auto`              | `https` (через web.telegram.org) / `tcp`; `auto` = https, если задан HTTPS_PROXY |
| `TG_PROXY`           | из `HTTPS_PROXY`    | http CONNECT-прокси для транспорта `https`; `none` — без прокси |
| `TG_HTTP_PATH`       | `/apiw1`            | путь HTTPS-транспорта (`/apiw`, `/api` — если 404) |
| `TG_HTTP_SERIAL`     | `1`                 | по одному HTTP-запросу за раз (`0` — разрешить конвейер) |
| `TG_HTTP_WAIT`       | `1`                 | добавлять `http_wait(0,0,0)` в каждый пакет (`0` — выключить) |
| `TG_TIMEOUT`         | `600`               | лимит времени на команду, сек |
| `TG_DOWNLOAD_DIR`    | `tools/telegram/downloads` | куда скачивать |
| `TG_STATE_DIR`       | `~/.tg-claude`      | где лежат сессия и состояние входа |
| `TG_WHISPER_MODEL`   | `small`             | модель Whisper: tiny/base/small/medium/large-v3 |
| `TG_TTS_ENGINE`      | `gtts`              | gtts / edge / piper |
| `TG_TTS_LANG`        | `ru`                | язык озвучивания |
| `TG_TTS_VOICE`       | —                   | голос edge-tts или путь к модели piper |
| `TG_CA_FILE`         | —                   | дополнительный CA-сертификат (прокси) |
| `TG_VENV` / `TG_PYTHON` | `~/.tg-claude/venv` | где `tg.sh` держит зависимости / какой python использовать |

---

## Если что-то не работает

| Сообщение | Что делать |
|-----------|------------|
| `Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH` | добавьте переменные в окружение и начните новую сессию |
| `прокси … отказал в CONNECT к …web.telegram.org:443` | в сетевой политике окружения не разрешён `*.web.telegram.org` (шаг 3) |
| `HTTP 404 от …web.telegram.org/apiw1` | попробуйте `TG_HTTP_PATH=/apiw` или `/api` |
| `Нет сессии Telegram` | выполните вход (шаг 4) или задайте `TELEGRAM_SESSION` |
| `Сессия недействительна` / `AuthKeyUnregistered` | сеанс завершён в Telegram — войдите заново: `login --phone … --fresh` |
| `Telegram просит подождать N сек (FloodWait)` | слишком много запросов, подождите |
| `Найдено несколько чатов` | укажите id или @username из списка |
| `Команда не завершилась за … сек` | сервер не отвечает; повторите с `--debug` |

Подробный лог: `tools/telegram/tg.sh --debug <команда>`.

---

## Запуск на своём компьютере

Нужны Python 3.10+ и ffmpeg. В папке репозитория:

```bash
export TELEGRAM_API_ID=…  TELEGRAM_API_HASH=…
tools/telegram/tg.sh login --phone +7…      # затем --code …, при 2FA --password …
tools/telegram/tg.sh me
```

Без прокси используется обычный TCP-транспорт Telegram. Полученную строку сессии можно
скопировать в переменную `TELEGRAM_SESSION` облачного окружения — тогда вводить код и
пароль в чат не придётся вовсе.
