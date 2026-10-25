#!/usr/bin/env bash
# Дзеркало памʼяті помічника на Google Drive («Асистент Михайла»), одностороннє: Mac mini — джерело правди.
# Копіює лише *.md (і теки Зустрічі/Тижні/Документи), без службових файлів (.bot-state.json, .dialog.jsonl), tmp/ та inbox-files/.
# Запускається після кожної відповіді бота (bot.py), після сценаріїв (run-playbook.sh) і launchd com.assistant.memory-sync кожні 15 хв.
# 25.10.2026: памʼять жила лише в ~/assistant-memory, на Drive лежали копії від 17–22.10 — хмарні сесії не бачили нових записів.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../config.sh"
SRC="${ASSISTANT_MEMORY_DIR:-$HOME/assistant-memory}"; DST="$ASSISTANT_MEMORY_DRIVE"
[ -d "$SRC" ] || { echo "немає памʼяті: $SRC" >&2; exit 0; }
[ -d "$DST" ] || { echo "Drive-тека недоступна (Google Drive не запущений?): $DST" >&2; exit 0; }
# rsync: тільки .md, рекурсивно; час файлів на CloudStorage може не виставлятись — такі попередження не помилка
rsync -r --size-only --no-perms --no-owner --no-group --omit-dir-times \
  --exclude='.*' --exclude='tmp/' --exclude='inbox-files/' --include='*/' --include='*.md' --exclude='*' \
  "$SRC/" "$DST/" 2>/dev/null
echo "памʼять → Drive: $(date '+%H:%M') $(find "$SRC" -maxdepth 2 -name '*.md' | wc -l | tr -d ' ') файлів"
