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
Без Claude (локальний режим) календар і пошту читають `bin/gcal.py` і `bin/gmail.py` через власний OAuth-токен
(розділ «Локальний режим без Claude» нижче).

## Файли з NAS (Synology) на Google Drive

Перенесення великих обсягів (PDF, 3D-моделі) з NAS у Drive найкраще робити на Mac mini
утилітою `rclone`: вона копіює напряму NAS (SFTP або WebDAV) → Google Drive, з докачуванням
і без ручного перетягування. Налаштування: `brew install rclone`, `rclone config` (remote для
NAS і remote для Drive), далі наприклад
`rclone copy nas:/volume1/projects gdrive:"Архів NAS" --include "*.pdf" --progress`.
Паролі від NAS у чат з помічником не писати, тільки в `rclone config`.

## Локальний режим без Claude

Коли ліміти Claude вичерпано, підписку скасовано, `claude` просить `/login` або його взагалі немає, бот і
планові сценарії не мовчать, а переходять у **локальний режим** (`bot/local_mode.py`).

**Як перемикається.** Кожен виклик `claude -p` іде через роутер. Ознаки недоступності: код виходу ≠ 0,
текст «usage limit / rate limit / limit reached / hit your limit / Please run /login / Invalid API key /
credit balance», 401/429, таймаут (15 хв), відсутній бінарник. Тоді бот один раз пише
«⚠️ Claude недоступний — працюю в локальному режимі (простіші відповіді)» і відповідає локально. Раз на
30 хв (`ASSISTANT_CLAUDE_RETRY_MIN`) наступне повідомлення знову пробує Claude. Коли вийшло, бот пише
«✅ Claude знову доступний» і починає нову розмову з контекстом останніх реплік. Стан роутера лежить у
`~/.assistant-state/router.json`, не в репозиторії й не на Drive.

Вручну: `/local on` — завжди локально (економія лімітів), `/local off` — завжди Claude (без запасного
режиму, лише повідомлення про помилку), `/local auto` — автоматично (типово). `/status` показує режим.

**Що працює без ШІ** (ключові слова й регулярні вирази, українською й російською):

| Пишеш | Що робить |
|---|---|
| «додай задачу … [сьогодні / завтра / у пт / 15.11]» | рядок `- [ ] …` у `02 Задачі.md`: розділ дня «## Сьогодні / Пт 30.10» або «## Цей тиждень» |
| «нагадай завтра о 10 …», «нагадай через 30 хв …», «напомни в пятницу …» | `- [ ] 🔔 … (нагадати дд.мм о HH:MM)` у розділі того дня. Якщо вказано час, бот сам надішле «🔔 Нагадування» в цей час. Діє правило ночі: о 00:00–05:00 «завтра» означає сьогоднішню дату |
| «що в мене сьогодні / завтра / на тижні», «розклад» | Google Calendar через `bin/gcal.py` разом із задачами з памʼяті. Без OAuth-токена бот чесно каже, що календар не підключено |
| «пошта», «що в пошті» | непрочитані листи за добу (`bin/gmail.py unread`) |
| «надішли лист на a@b.com, тема: …, текст: …» | показує чернетку з кнопками **Надіслати / Змінити / Скасувати**; лист іде лише після натискання |
| «баланс», «витрати за тиждень / місяць», «… фоп» | `tools/monobank/mono.sh balance` або `summary` |
| «pdf: текст», «зроби pdf» | PDF через `bin/md2pdf.sh`. Без тексту бере останню відповідь помічника |
| голосове | `bin/transcribe.sh`, далі обробляє як текст («Зрозумів: …»). Аудіозапис зберігає як транскрипт у `Вхідні/` |
| усе інше | відповідь Ollama: системний промпт, останні 10 реплік діалогу, відкриті задачі, до 600 токенів, таймаут 120 с. Якщо Ollama теж недоступна, бот так і каже |

**Що не працює локально:** аналіз фото й документів (бот зберігає файл і обробить його, коли повернеться
Claude), конспекти Plaud, пошук у Telegram, сайт і блог, складні документи, правки памʼяті поза
задачами й нагадуваннями. Задачі команди виконує локальна модель, але результат завжди спершу приходить
Михайлу чернеткою. Відповіді клієнтам працюють як раніше (API або Ollama).

**Планові сценарії** (`bin/run-playbook.sh`). Якщо Claude недоступний, запускається
`bot/local_briefing.py <morning|evening|weekly|gym>`. Він збирає дані з `brief-data.sh` (Telegram), календаря,
пошти, задач і нагадувань із памʼяті, звичок (для спортзалу) і Монобанку (для тижня), складає брифінг
за шаблоном без LLM і надсилає його через `tg-out.sh`. Ollama за бажанням додає 2–3 речення резюме
(`ASSISTANT_BRIEF_OLLAMA=0` вимикає).

### Модель

```bash
ollama pull qwen3:8b        # ~5 ГБ, для M4 16 ГБ це оптимум; запас — llama3.2 (3B, швидша)
ollama run qwen3:8b "привіт /no_think"        # перевірка
curl -s http://127.0.0.1:11434/api/tags         # модель є у списку
```
Thinking вимкнено (`"think": false` у запиті; стара Ollama без цього поля теж працює), а `<think>…</think>`
бот прибирає з відповіді.

### Змінні (`~/.assistant.env`)

| Змінна | Типово | Що це |
|---|---|---|
| `ASSISTANT_LOCAL_MODEL` | `qwen3:8b` | модель Ollama (її ж бере запасний шлях відповідей клієнтам на :11434) |
| `ASSISTANT_OLLAMA_URL` | `http://127.0.0.1:11434` | адреса Ollama |
| `ASSISTANT_OLLAMA_TIMEOUT` / `ASSISTANT_OLLAMA_MAX_TOKENS` | `120` / `600` | таймаут (с) і довжина відповіді |
| `ASSISTANT_CLAUDE_RETRY_MIN` | `30` | як часто в локальному режимі пробувати Claude |
| `ASSISTANT_CLAUDE_TIMEOUT` | `900` | таймаут Claude у сценаріях (с) |
| `ASSISTANT_STATE_DIR` | `~/.assistant-state` | стан роутера, нагадування з часом, чернетки й журнал листів |
| `ASSISTANT_GOOGLE_DIR` | `~/.assistant-google` | OAuth-клієнт і токен Google |
| `ASSISTANT_GCAL_IDS` | `primary` | календарі через кому |
| `ASSISTANT_MAIL_DAILY_LIMIT` | `30` | максимум листів на добу |
| `ASSISTANT_BRIEF_OLLAMA` | `1` | резюме від Ollama в локальному брифінгу |

### Google Calendar і Gmail на Mac mini (OAuth, один раз)

Секрети лежать лише в `~/.assistant-google/`. Не комітити їх і не надсилати в чат.

1. [console.cloud.google.com](https://console.cloud.google.com): створити проєкт, наприклад «Assistant Mac mini».
2. APIs & Services → Library: увімкнути **Google Calendar API** і **Gmail API**.
3. OAuth consent screen: тип **External**, додати свою пошту в Test users. Scopes:
   `calendar.readonly`, `gmail.readonly`, `gmail.send`. Потім натиснути **Publish app** («In production»)
   без верифікації. У статусі «Testing» refresh-токен живе лише 7 днів. Під час входу Google покаже
   «неперевірений застосунок»: Advanced → перейти. Це нормально, бо застосунок ваш.
4. Credentials → Create credentials → OAuth client ID → тип **Desktop app**. Завантажити JSON і
   зберегти як `~/.assistant-google/client_secret.json` (`chmod 600`).
5. У Терміналі на Mac mini: `python3 tools/assistant/bin/google_oauth.py login`. Відкриється браузер:
   увійти, дозволити, і токен збережеться в `~/.assistant-google/token.json` (права 600).
6. Перевірка: `python3 tools/assistant/bin/google_oauth.py status`, `python3 tools/assistant/bin/gcal.py today`,
   `python3 tools/assistant/bin/gmail.py unread`.

Відкликати доступ: myaccount.google.com/permissions, потім видалити `~/.assistant-google/token.json`.

### Правило листів

- Автоматично (без кнопки) йдуть **лише погоджені черги**: Михайло погоджує чергу, її назва стоїть у
  `~/.assistant-state/mail-approved-queues.txt`, листи лежать у `~/.assistant-state/mail-queues/<назва>.jsonl`
  (`{"to","subject","body"}` на рядок), надсилає `bin/gmail.py send-queue <назва>`.
- Решта листів іде **тільки кнопкою «Надіслати»** під показаною чернеткою. `gmail.py send` без
  `--confirmed` відмовляє.
- Для всіх шляхів: не більше 30 листів на добу. Адреси й домени з `~/.assistant-state/do-not-contact.txt`
  (рядок `name@x.com` або `@domain.com`) блокуються. Кожна спроба (надіслано, відмова, помилка)
  записується в `~/.assistant-state/mail-log.jsonl`.

### Перевірка

```bash
python3 -m unittest tools/assistant/bot/test_local_mode.py -v     # фейкові claude, Ollama і памʼять
python3 tools/assistant/bot/local_mode.py status                   # поточний режим
DRY=1 CLAUDE_BIN=/usr/bin/false tools/assistant/bin/run-playbook.sh morning
                                     # брифінг без Claude: лише друкує, стан роутера не змінює, нічого не шле
```
