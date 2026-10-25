#!/usr/bin/env bash
# Налаштування персонального помічника. Файл підключається скриптами з bin/ (source).
# Усі значення можна перевизначити змінними середовища сесії.

# Корінь репозиторію та інструменти
ASSISTANT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$ASSISTANT_DIR/../.." && pwd)"
TG="${TG:-$REPO_DIR/tools/telegram/tg.sh}"   # можна підмінити для тестів

# Хто власник і в якому часовому поясі живе
export ASSISTANT_OWNER="${ASSISTANT_OWNER:-Михайло}"
export ASSISTANT_TZ="${ASSISTANT_TZ:-Europe/Kyiv}"
export TG_TZ="${TG_TZ:-$ASSISTANT_TZ}"

# Канал зв'язку.
#  - ASSISTANT_BOT_TOKEN задано  → помічник пише від імені окремого бота (Bot API),
#    а читає чат з ботом через особистий акаунт (tg.sh). Потрібен дозвіл на api.telegram.org.
#  - не задано → помічник пише й читає у чаті ASSISTANT_INBOX_CHAT особистого акаунта
#    (за замовчуванням «Збережені повідомлення», тобто `me`).
export ASSISTANT_BOT_TOKEN="${ASSISTANT_BOT_TOKEN:-}"
export ASSISTANT_BOT_USERNAME="${ASSISTANT_BOT_USERNAME:-}"   # напр. my_helper_bot (без @)
export ASSISTANT_CHAT_ID="${ASSISTANT_CHAT_ID:-}"             # числовий id Михайла для Bot API (вкажіть, щоб не шукати)
export ASSISTANT_INBOX_CHAT="${ASSISTANT_INBOX_CHAT:-me}"

# Префікс повідомлень помічника, коли він пише з особистого акаунта (щоб відрізняти свої від ваших)
export ASSISTANT_PREFIX="${ASSISTANT_PREFIX:-🤖}"

# Пам'ять (Google Drive): назва папки, у якій лежать документи пам'яті
export ASSISTANT_MEMORY_FOLDER="${ASSISTANT_MEMORY_FOLDER:-Асистент Михайла}"
# Локальний шлях до цієї папки на Mac mini (Google Drive для комп'ютера); у хмарі не потрібен
export ASSISTANT_MEMORY_DIR="${ASSISTANT_MEMORY_DIR:-}"
# Дзеркало памʼяті на Google Drive для компʼютера (Mac mini): bin/memory-sync.sh копіює *.md сюди після кожної відповіді бота й сценарію
export ASSISTANT_MEMORY_DRIVE="${ASSISTANT_MEMORY_DRIVE:-$HOME/Library/CloudStorage/GoogleDrive-china.opt.shop@gmail.com/My Drive/Асистент Михайла}"

# Тимчасові файли (PDF, скачане) — не в репозиторії
export ASSISTANT_TMP="${ASSISTANT_TMP:-$HOME/.assistant/tmp}"
mkdir -p "$ASSISTANT_TMP"

# Чи працюємо через бота
assistant_mode() { [ -n "$ASSISTANT_BOT_TOKEN" ] && echo bot || echo personal; }

# Назва чату, який читаємо як вхідні
assistant_inbox_chat() {
  if [ "$(assistant_mode)" = bot ]; then
    echo "@${ASSISTANT_BOT_USERNAME:?Задайте ASSISTANT_BOT_USERNAME (назва бота без @)}"
  else
    echo "$ASSISTANT_INBOX_CHAT"
  fi
}

# Поточна дата/час у поясі власника
assistant_now() { TZ="$ASSISTANT_TZ" date "+%Y-%m-%d %H:%M (%A)"; }
