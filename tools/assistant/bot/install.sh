#!/usr/bin/env bash
# Встановити/видалити launchd-служби помічника на macOS.
#   bot/install.sh            — створити і запустити бота та планові сценарії
#   bot/install.sh --remove   — зупинити і видалити
set -euo pipefail
ENVF="$HOME/.assistant.env"; [ -f "$ENVF" ] || { echo "Створіть $ENVF (див. bot/README.md)"; exit 2; }
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
LOGS="$HOME/Library/Logs/assistant"; AGENTS="$HOME/Library/LaunchAgents"; mkdir -p "$LOGS" "$AGENTS"
PY="$(command -v python3)"
command -v claude >/dev/null || { echo "Не знайдено claude. Встановіть Claude Code (bot/README.md, крок 1)"; exit 2; }
WRAP="$DIR/bot/run-with-env.sh"
cat > "$WRAP" <<'W'
#!/usr/bin/env bash
set -a; source "$HOME/.assistant.env"; set +a
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
exec "$@"
W
chmod +x "$WRAP"

plist() { # name, розклад (xml) або порожньо = постійно, команда...
  local name="$1" sched="$2"; shift 2
  local f="$AGENTS/com.assistant.$name.plist"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "<key>Label</key><string>com.assistant.$name</string><key>ProgramArguments</key><array>"
    for a in "$WRAP" "$@"; do echo "<string>$a</string>"; done
    echo "</array><key>WorkingDirectory</key><string>$REPO</string>"
    echo "<key>StandardOutPath</key><string>$LOGS/$name.log</string><key>StandardErrorPath</key><string>$LOGS/$name.err</string>"
    if [ -n "$sched" ]; then echo "$sched"; else echo "<key>KeepAlive</key><true/><key>RunAtLoad</key><true/>"; fi
    echo '</dict></plist>'
  } > "$f"
  launchctl unload "$f" 2>/dev/null || true
  launchctl load "$f"
  echo "✓ $name"
}
cal() { echo "<key>StartCalendarInterval</key><array>$1</array>"; }
at() { echo "<dict><key>Hour</key><integer>$1</integer><key>Minute</key><integer>$2</integer>${3:-}</dict>"; }
wd() { echo "<key>Weekday</key><integer>$1</integer>"; }

if [ "${1:-}" = "--remove" ]; then
  for n in bot morning evening weekly gym memory-sync; do
    f="$AGENTS/com.assistant.$n.plist"
    [ -f "$f" ] && { launchctl unload "$f" 2>/dev/null || true; rm -f "$f"; echo "✗ $n"; }
  done
  exit 0
fi

plist bot     ""                                   "$PY" "$DIR/bot/bot.py"
plist morning "$(cal "$(at 7 30)")"                "$DIR/bin/run-playbook.sh" morning
plist evening "$(cal "$(at 21 0)")"                "$DIR/bin/run-playbook.sh" evening
plist weekly  "$(cal "$(at 18 0 "$(wd 0)")")"      "$DIR/bin/run-playbook.sh" weekly
plist gym     "$(cal "$(at 17 30 "$(wd 1)")$(at 17 30 "$(wd 3)")$(at 17 30 "$(wd 5)")")" "$DIR/bin/run-playbook.sh" gym
plist memory-sync "<key>StartInterval</key><integer>900</integer>" "$DIR/bin/memory-sync.sh"   # дзеркало памʼяті на Drive кожні 15 хв
echo "Готово. Логи: $LOGS. Напишіть боту «привіт»."
