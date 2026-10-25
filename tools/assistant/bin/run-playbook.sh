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
# DRY=1 — пробний запуск: нічого не пишемо в памʼять і не шлемо в Telegram, текст друкуємо (перевірка сценаріїв)
if [ -n "${DRY:-}" ]; then
  prompt="$prompt Це ПРОБНИЙ запуск: файли памʼяті НЕ змінюй (лише читай), у Журнал нічого не дописуй."
  ALLOWED="Read,Glob,Grep,Bash(tools/assistant/bin/brief-data.sh*),Bash(ls*),Bash(cat*),Bash(date*)"
fi
out="$("$CLAUDE" -p --model "$MODEL" --max-turns "${CLAUDE_MAX_TURNS:-25}" --allowedTools "$ALLOWED" --output-format text "$prompt")"
reply="$(printf '%s\n' "$out" | grep -v '^SEND_FILE:' | tail -c 3000)"
# Telegram не малює Markdown: **жирний** → <b>, # заголовок → <b>, `код` → <code>, решту екрануємо і шлемо як HTML
html="$(printf '%s' "$reply" | python3 -c '
import sys, re, html
t = html.escape(sys.stdin.read(), quote=False)
t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
t = re.sub(r"(?m)^#{1,3}\s+(.+)$", r"<b>\1</b>", t)
t = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", t)
sys.stdout.write(t)')"
if [ -n "${DRY:-}" ]; then printf '%s\n' "$html"; exit 0; fi
"$DIR/bin/tg-out.sh" text "$html" --html
# Файлів у відповіді зазвичай немає, і тоді grep повертає 1. Через set -e
# це робило останній рядок скрипта «падінням»: launchd щоразу бачив код 1,
# хоч повідомлення пішло. Справжня поломка на такому тлі була б непомітна.
files="$(printf '%s\n' "$out" | grep '^SEND_FILE:' | sed 's/^SEND_FILE:[[:space:]]*//' || true)"
if [ -n "$files" ]; then
  printf '%s\n' "$files" | while IFS= read -r f; do
    [ -f "$f" ] && "$DIR/bin/tg-out.sh" file "$f" "$(basename "$f")"
  done
fi
"$DIR/bin/memory-sync.sh" >/dev/null 2>&1 || true   # дзеркало памʼяті на Drive після сценарію
exit 0
