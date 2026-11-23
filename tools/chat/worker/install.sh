#!/usr/bin/env bash
# Воркер чату на сайті як служба launchd на Mac mini (у стилі tools/assistant/bot/install.sh).
#   tools/chat/worker/install.sh            — створити й запустити службу com.cas.chatworker
#   tools/chat/worker/install.sh --remove   — зупинити й видалити
# Налаштування — ~/.cas-chat/env (права 600; див. README.md). Журнал — ~/Library/Logs/cas-chat/worker.log (.err).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../../.." && pwd)"
NAME=com.cas.chatworker
PL="$HOME/Library/LaunchAgents/$NAME.plist"
LOGS="$HOME/Library/Logs/cas-chat"
ENVF="$HOME/.cas-chat/env"

if [ "${1:-}" = "--remove" ]; then
  launchctl unload "$PL" 2>/dev/null || true
  rm -f "$PL" "$DIR/run-with-env.sh"
  echo "✗ $NAME зупинено й видалено (налаштування ~/.cas-chat/env лишились)"
  exit 0
fi

mkdir -p "$LOGS" "$HOME/Library/LaunchAgents" "$HOME/.cas-chat"
if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<'E'
# Воркер чату на сайті (tools/chat/worker/README.md). Цей файл — поза репозиторієм, не комітити.
CHAT_BASE=https://cas-develop.com
# LEADBOT_KEY=…           # той самий ключ, що в бота пошуку; якщо він уже є в ~/.assistant.env — тут не потрібен
CHAT_LLM=local            # local — безкоштовно (Ollama); api — ПЛАТНО, лише з окремого «так» власника
CHAT_MODEL=qwen3:8b
# CHAT_VISION_MODEL=qwen2.5vl:7b
CHAT_TTS=on
CHAT_CALENDAR=on
E
  echo "Створено $ENVF — перевірте його (ключ LEADBOT_KEY)."
fi
chmod 600 "$ENVF"
[ -f "$HOME/.assistant.env" ] && chmod 600 "$HOME/.assistant.env" || true

PY="$(command -v python3)"
WRAP="$DIR/run-with-env.sh"
cat > "$WRAP" <<'W'
#!/usr/bin/env bash
# ЗГЕНЕРОВАНО install.sh: оточення для launchd (PATH Homebrew; ключі читає сам воркер з ~/.cas-chat/env і ~/.assistant.env)
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/ffmpeg-full/bin:/Applications/ODAFileConverter.app/Contents/MacOS:$PATH"
exec "$@"
W
chmod +x "$WRAP"

"$PY" "$DIR/run.py" --selftest || echo "⚠️  Самоперевірка показала, чого бракує (таблиця вище) — воркер працюватиме з тим, що є."

cat > "$PL" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$NAME</string>
<key>ProgramArguments</key><array><string>$WRAP</string><string>$PY</string><string>$DIR/run.py</string></array>
<key>WorkingDirectory</key><string>$REPO</string>
<key>StandardOutPath</key><string>$LOGS/worker.log</string><key>StandardErrorPath</key><string>$LOGS/worker.err</string>
<key>KeepAlive</key><true/><key>RunAtLoad</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
</dict></plist>
P
launchctl unload "$PL" 2>/dev/null || true
launchctl load "$PL"
echo "✓ $NAME запущено. Журнал: $LOGS/worker.log. Перевірка: https://cas-develop.com/?chat=1"
