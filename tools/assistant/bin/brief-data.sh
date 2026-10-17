#!/usr/bin/env bash
# Сирі дані для брифінгу одним викликом: час, непрочитане в Telegram, нові вхідні.
# Календар, пошту і пам'ять (Google Drive) помічник читає інструментами MCP окремо.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../config.sh"
echo "=== Зараз: $(assistant_now) ($ASSISTANT_TZ) ==="
echo
echo "=== Непрочитане в Telegram (без каналів і беззвучних) ==="
"$TG" unread --limit 10 2>&1 || echo "(Telegram недоступний: $?)"
echo
echo "=== Нові вхідні для помічника ==="
"$(dirname "${BASH_SOURCE[0]}")/inbox.sh" 2>&1 || echo "(вхідні недоступні)"
