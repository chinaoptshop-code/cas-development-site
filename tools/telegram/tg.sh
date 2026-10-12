#!/usr/bin/env bash
# Обёртка для tg.py: находит Python с зависимостями (или создаёт venv вне репозитория)
# и запускает команду. Использование: tools/telegram/tg.sh <команда> [...]
#   tools/telegram/tg.sh --help
#   tools/telegram/tg.sh setup [--whisper]   — только установить зависимости
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${TG_VENV:-$HOME/.tg-claude/venv}"

have_deps() { "$1" -c "import telethon, gtts" >/dev/null 2>&1; }

PY=""
if [ -n "${TG_PYTHON:-}" ] && have_deps "$TG_PYTHON"; then
  PY="$TG_PYTHON"
elif [ -x "$VENV/bin/python" ] && have_deps "$VENV/bin/python"; then
  PY="$VENV/bin/python"
elif command -v python3 >/dev/null 2>&1 && have_deps python3; then
  PY="python3"
fi

if [ -z "$PY" ]; then
  echo "[tg] первый запуск: ставлю зависимости в $VENV (около минуты)…" >&2
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q --upgrade pip setuptools wheel
  "$VENV/bin/python" -m pip install -q -r "$DIR/requirements.txt"
  PY="$VENV/bin/python"
fi

if [ "${1:-}" = "setup" ]; then
  shift || true
  if [ "${1:-}" = "--whisper" ]; then
    echo "[tg] ставлю faster-whisper (расшифровка голосовых без Telegram Premium)…" >&2
    "$PY" -m pip install -q -r "$DIR/requirements-whisper.txt"
  fi
  echo "[tg] готово: python = $PY"
  exit 0
fi

exec "$PY" "$DIR/tg.py" "$@"
