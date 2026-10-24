# Заметки для Claude Code

Пользователь пишет по-русски или по-украински. Отвечай на языке его последнего сообщения.

## Репозиторий

Статический сайт (HTML в корне), деплоится на Cloudflare Pages из корня репозитория
(`.github/workflows/deploy.yml`). Папка `tools/`, `.claude/` и этот файл перед деплоем
удаляются шагом «Exclude non-site files» — они не попадают на сайт.

## Сайт: UI-kit і правила (з 22.10.2026)

- Код сайту в `main` викладає лише хмарна сесія; інші сесії дають гілки або файли через Drive.
- Перед комітом: `python3 tools/ui/ui.py scan` (звіт `tools/ui/report.md`) і `python3 tools/ui/ui.py budget`.
- Каталог компонентів — `/styleguide/` (noindex). Нові сторінки — лише з цих блоків.
- Шрифти — тільки власні з `/fonts/` (Cormorant Garamond + Manrope), без Google Fonts.
- Форма заявки — спільний `/assets/lead-form.v1.js` з `data-service`/`data-source` на `form#of`; успіх лише після 2xx.
- H1 і перше фото не анімувати; одна `fetchpriority="high"` на сторінку; у кожного `<img>` — width/height і alt.
- Навігація — лише `<a href>`. Osocor/Osokorky на сайті не показувати.
- Ціни й факти — лише підтверджені (дизайн від $30/м², мін. $2 500; ремонт від $550/м²; офіс від $350/м²;
  меблювання від $250/м²; будівництво від $600/м², під ключ від $1 100/м²; ±5% — лише якщо ремонт робить CAS;
  гарантія 12 міс.; 150+ проєктів з 2016; рахунок для ФОП і ТОВ; Оздоба: мін. замовлення від $500 (≈23 000 ₴),
  поштучно не продаємо, поставка з Китаю 30–60 днів — підтверджено Михайлом 25.10.2026).
- Блог: статті — JSON у `tools/blog/articles/`, збирає `python3 tools/blog/build.py` (спершу `--check`).
  Правила й порядок — `tools/blog/WRITE.md`, беклог тем — `tools/blog/topics.json`. Публікація — лише після ОК Михайла.
- Нові лендинги послуг — JSON у `tools/site/pages/`, збирає `python3 tools/site/landing.py` (шаблон, hreflang, sitemap, JSON-LD);
  потім `python3 tools/blog/build.py` для блоків «Статті по темі».
- Оздоба (/ozdoba, «Продукти»): товари, ціни й характеристики — `assets/ozdoba/catalog.json`; фото з вирізаним фоном —
  `python3 tools/products/photo.py <id> <файл|url>`; після правок — `python3 tools/products/build.py` (оновлює /ozdoba, сторінки товарів /ozdoba/<slug> і sitemap).

- Зображення: AVIF-копії робить `tools/img/build.py` (нові фото в img/ — запустити його); `<picture>` з AVIF підставляє
  деплой (`tools/img/picture.py`), у репозиторії HTML лишається з простими `<img>` .webp.

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
tools/telegram/tg.sh draft "Иван" "Текст"        # сохранить черновик в чате, НЕ отправляя
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
  текст показывай ему в ответе. Личные письма/сообщения по умолчанию — черновиком (`draft`)
  на проверку Михайлу, а не отправкой.
- Новые полезные функции инструментов, согласованные с Михайлом, сразу коммить в `main`.
- Никогда не коммить `*.session`, `tools/telegram/downloads/`, строку `TELEGRAM_SESSION`
  и не печатай её без необходимости (только при `login`).
- Если команда падает с «прокси отказал в CONNECT» — в настройках окружения не разрешён
  домен `*.web.telegram.org`; если «Нет сессии» — нужен `login` (см. README).
- Настройки через переменные окружения: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`,
  `TELEGRAM_SESSION` (строка сессии), опционально `TG_TZ` (по умолчанию Europe/Moscow).

## Monobank (лише читання) — `tools/monobank/`

`tools/monobank/mono.sh` — баланси, виписки, підсумки витрат і курси через особистий API Монобанку
(токен у змінній `MONOBANK_TOKEN`). Подробиці: `tools/monobank/README.md`.

```bash
tools/monobank/mono.sh balance                    # баланси всіх рахунків і банок
tools/monobank/mono.sh statement -a fop --days 7  # операції ФОП за тиждень (--search, --income, --expense)
tools/monobank/mono.sh summary --days 30          # надходження/витрати за категоріями
tools/monobank/mono.sh rates                      # курси (без токена)
```

Токен не друкувати й не комітити; суми й операції — тільки Михайлу і в пам'ять на Drive, не в репозиторій.
Банк дозволяє 1 запит на хвилину — скрипт чекає сам, не запускай кілька копій паралельно.

## Персональний помічник Михайла — `tools/assistant/`

Користувач (Михайло) має персонального AI-помічника, який працює в цих сесіях через
Telegram. Усе описано в `tools/assistant/README.md`; правила поведінки, пам'ять і
безпека — у `tools/assistant/playbooks/00-core.md`. Сценарії (ранок, вечір, тиждень,
спортзал, вхідні, зустрічі/Plaud, читання, PDF, компанія) — у `tools/assistant/playbooks/`.

Коли планова задача або користувач просить виконати сценарій помічника:
1. прочитай `tools/assistant/playbooks/00-core.md` і потрібний сценарій;
2. пам'ять читай/оновлюй у Google Drive, папка «Асистент Михайла» (конектор Google Drive);
3. відповідай Михайлу через `tools/assistant/bin/tg-out.sh`, нові вхідні — `tools/assistant/bin/inbox.sh`;
4. PDF — `tools/assistant/bin/md2pdf.sh`.

Репозиторій публічний: ніколи не записуй сюди особисті дані, нотатки, імена клієнтів,
фінанси; усе таке — тільки в пам'ять на Drive.
