#!/usr/bin/env bash
# Запустити сценарій помічника локально (Mac mini) і надіслати результат у Telegram.
#   run-playbook.sh morning | evening | weekly | gym
# Використовується launchd-задачами (див. bot/README.md). Потрібні ті самі змінні, що й для bot.py.
set -euo pipefail
name="${1:?morning|evening|weekly|gym}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; REPO="$(cd "$DIR/../.." && pwd)"
MEMORY="${ASSISTANT_MEMORY_DIR:-$HOME/assistant-memory}"
CLAUDE="${CLAUDE_BIN:-claude}"; MODEL="${CLAUDE_MODEL:-sonnet}"
ALLOWED="${CLAUDE_ALLOWED_TOOLS:-Read,Write,Edit,Glob,Grep,Bash(tools/assistant/*),Bash(tools/telegram/*),Bash(pandoc*),Bash(ffmpeg*),Bash(ls*),Bash(cat*),Bash(date*)}"
prompt="Ти персональний помічник Михайла, режим «локальний бот» на Mac mini. Прочитай tools/assistant/playbooks/00-core.md і tools/assistant/playbooks/$name.md та виконай сценарій. Пам'ять — локальна папка $MEMORY (Markdown-файли, редагуй напряму; Google Drive/Calendar недоступні, якщо не підключені як MCP). Вхідні повідомлення обробляє бот окремо, тож крок «вхідні» пропусти. НЕ викликай tg-out.sh: текст повідомлення для Telegram напиши останнім у виводі, файл для відправки познач окремим рядком SEND_FILE: /шлях."
cd "$REPO"
out="$("$CLAUDE" -p --model "$MODEL" --max-turns "${CLAUDE_MAX_TURNS:-25}" --allowedTools "$ALLOWED" --output-format text "$prompt")"
reply="$(printf '%s\n' "$out" | grep -v '^SEND_FILE:' | tail -c 3000)"
"$DIR/bin/tg-out.sh" text "$reply"
# Файлів у відповіді зазвичай немає, і тоді grep повертає 1. Через set -e
# це робило останній рядок скрипта «падінням»: launchd щоразу бачив код 1,
# хоч повідомлення пішло. Справжня поломка на такому тлі була б непомітна.
files="$(printf '%s\n' "$out" | grep '^SEND_FILE:' | sed 's/^SEND_FILE:[[:space:]]*//' || true)"
if [ -n "$files" ]; then
  printf '%s\n' "$files" | while IFS= read -r f; do
    [ -f "$f" ] && "$DIR/bin/tg-out.sh" file "$f" "$(basename "$f")"
  done
fi
exit 0
