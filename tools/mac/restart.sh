#!/usr/bin/env bash
# Перезапуск Mac mini (JARVIS) після переїзду на нову локацію / нову мережу / вимкнення світла.
#
#   bash tools/mac/restart.sh            — перевірити і підняти все, звіт у термінал і Михайлу в Telegram
#   bash tools/mac/restart.sh --check    — лише перевірити, нічого не запускати
#   bash tools/mac/restart.sh --no-tg    — без повідомлення в Telegram
#
# Що робить (по черзі):
#   1. Мережа: який інтерфейс активний (Ethernet має бути першим), IP, публічний IP, DNS, доступ до
#      api.anthropic.com, api.telegram.org, github.com, cas-develop.com, huggingface.co.
#   2. Живлення: вимкнений сон і автозапуск після зникнення світла (pmset; лише показує, як увімкнути).
#   3. Зовнішній SSD /Volumes/CAS-Mac: змонтований? якщо ні — пробує змонтувати (diskutil).
#   4. Програми: Docker Desktop (дані на SSD), Ollama (+ список моделей), Tailscale, TeamViewer.
#   5. Служби помічника launchd (com.assistant.* і інші cas/jarvis): перезапускає (kickstart -k).
#   6. Репозиторій сайту: git pull --no-rebase (без force).
#   7. Claude Code: версія, вхід (claude auth), чи працює Remote Control (процес claude remote-control).
#   8. Пульт 127.0.0.1:8787.
#   9. Звіт: термінал + Telegram (tools/assistant/bin/tg-out.sh).
# Секретів не містить і не друкує. Нічого не видаляє.
set -uo pipefail

CHECK_ONLY=0; NO_TG=0
for a in "$@"; do case "$a" in --check) CHECK_ONLY=1;; --no-tg) NO_TG=1;; -h|--help) sed -n 2,20p "$0"; exit 0;; esac; done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SSD="${CAS_SSD:-/Volumes/CAS-Mac}"
DASH="${CAS_DASH:-http://127.0.0.1:8787}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"  # як у remote-control/start-rc.sh: homebrew-claude новіший за ~/.local/bin
OK=(); WARN=(); BAD=()
ok()   { OK+=("$1");   printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { WARN+=("$1"); printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { BAD+=("$1");  printf '  \033[31m✗\033[0m %s\n' "$1"; }
run()  { [ "$CHECK_ONLY" = 1 ] && return 0; "$@"; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
wait_for() { local n=$1; shift; for _ in $(seq 1 "$n"); do "$@" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }

[ "$(uname)" = Darwin ] || { echo "Скрипт для macOS (Mac mini)."; exit 2; }

# ---------- 1. Мережа ----------
hdr "1. Мережа"
wait_for 30 route -n get default || bad "Немає маршруту за замовчуванням — перевір кабель/Wi-Fi"
IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
SVC=$(networksetup -listallhardwareports 2>/dev/null | awk -v i="$IF" '/Hardware Port/{p=substr($0,index($0,$3))} $2==i{print p}')
FIRST=$(networksetup -listnetworkserviceorder 2>/dev/null | awk -F') ' '/^\([0-9]+\)/{print $2; exit}')
if [ -n "$IF" ]; then
  IP=$(ipconfig getifaddr "$IF" 2>/dev/null || true)
  case "$SVC" in *Ethernet*|*LAN*|*Thunderbolt*) ok "Інтерфейс: $SVC ($IF), IP $IP";;
    *) warn "Інтерфейс: ${SVC:-$IF}, IP $IP — не Ethernet. Встав кабель від роутера; Ethernet має стояти першим у Системні параметри → Мережа → … → Порядок служб";; esac
fi
[ -n "$FIRST" ] && { case "$FIRST" in *Ethernet*|*LAN*) ok "Порядок служб: першим $FIRST";; *) warn "Порядок служб: першим «$FIRST», краще Ethernet";; esac; }
PUB=$(curl -s -m 8 https://api.ipify.org || true); [ -n "$PUB" ] && ok "Публічний IP: $PUB" || bad "Немає інтернету (api.ipify.org недоступний)"
for h in api.anthropic.com api.telegram.org github.com cas-develop.com huggingface.co; do
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://$h" || echo 000)
  [ "$code" != 000 ] && ok "$h доступний ($code)" || bad "$h недоступний — DNS/фаєрвол провайдера?"
done

# ---------- 2. Живлення ----------
hdr "2. Живлення і сон"
SLEEP=$(pmset -g 2>/dev/null | awk '$1=="sleep"{print $2}')
AR=$(pmset -g 2>/dev/null | awk '$1=="autorestart"{print $2}')
[ "${SLEEP:-1}" = 0 ] && ok "Сон вимкнено" || warn "Сон: ${SLEEP:-?} хв. Вимкнути: sudo pmset -a sleep 0 disksleep 0"
[ "${AR:-0}" = 1 ] && ok "Автозапуск після зникнення світла увімкнено" || warn "Автозапуск після світла вимкнено. Увімкнути: sudo pmset -a autorestart 1"

# ---------- 3. SSD ----------
hdr "3. Зовнішній SSD"
if [ ! -d "$SSD" ]; then
  warn "$SSD не змонтовано — пробую змонтувати"
  run diskutil mount "$(basename "$SSD")" >/dev/null 2>&1 || true
  wait_for 10 test -d "$SSD" || true
fi
if [ -d "$SSD" ]; then
  FREE=$(df -h "$SSD" | awk 'NR==2{print $4}'); ok "SSD $SSD змонтовано, вільно $FREE"
else bad "SSD $SSD не знайдено — перевір кабель USB/Thunderbolt (Docker і моделі лежать там)"; fi

# ---------- 4. Програми ----------
hdr "4. Програми"
app_up() { # назва програми, команда перевірки
  local app="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$app працює"; return; fi
  if [ -d "/Applications/$app.app" ]; then
    run open -ga "$app"; if [ "$CHECK_ONLY" = 0 ] && wait_for 45 "$@"; then ok "$app запущено"; else warn "$app не відповідає"; fi
  else warn "$app не встановлено"; fi
}
[ -d "$SSD" ] && app_up Docker docker info || warn "Docker не запускаю без SSD (дані на SSD)"
app_up Ollama curl -sf -m 3 http://127.0.0.1:11434/api/tags
if curl -sf -m 3 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  M=$(curl -s -m 5 http://127.0.0.1:11434/api/tags | python3 -c 'import sys,json;print(", ".join(m["name"] for m in json.load(sys.stdin)["models"]))' 2>/dev/null)
  ok "Моделі Ollama: ${M:-немає}"
elif command -v ollama >/dev/null && [ "$CHECK_ONLY" = 0 ]; then
  (nohup ollama serve >/tmp/ollama.log 2>&1 &); wait_for 20 curl -sf http://127.0.0.1:11434/api/tags && ok "ollama serve запущено" || bad "Ollama не стартує (/tmp/ollama.log)"
fi
if command -v tailscale >/dev/null || [ -d /Applications/Tailscale.app ]; then
  app_up Tailscale sh -c 'tailscale status >/dev/null 2>&1 || /Applications/Tailscale.app/Contents/MacOS/Tailscale status >/dev/null 2>&1'
fi
[ -d /Applications/TeamViewer.app ] && app_up TeamViewer pgrep -xq TeamViewer

# ---------- 5. Служби launchd ----------
hdr "5. Служби помічника (launchd)"
# Постійні служби (KeepAlive: бот, пульт) перезапускаємо; планові (ранок, вечір, нічна черга) лише
# завантажуємо — їх НЕ запускаємо зараз, щоб не надіслати зайвий ранковий бриф.
UIDN=$(id -u); FOUND=0
for f in "$HOME"/Library/LaunchAgents/*.plist; do
  [ -f "$f" ] || continue
  l=$(defaults read "$f" Label 2>/dev/null || basename "$f" .plist)
  echo "$l" | grep -Eqi 'assistant|cas|jarvis|pult|night|ollama' || continue
  FOUND=1
  launchctl list "$l" >/dev/null 2>&1 || { run launchctl bootstrap "gui/$UIDN" "$f" 2>/dev/null || run launchctl load "$f" 2>/dev/null; }
  keep=$(defaults read "$f" KeepAlive 2>/dev/null || echo 0)
  if [ "$keep" = 1 ]; then
    pid=$(launchctl list 2>/dev/null | awk -v l="$l" '$3==l{print $1}')
    { [ -z "$pid" ] || [ "$pid" = "-" ]; } && run launchctl kickstart -k "gui/$UIDN/$l" >/dev/null 2>&1 && sleep 2
    pid=$(launchctl list 2>/dev/null | awk -v l="$l" '$3==l{print $1}')
    [ -n "$pid" ] && [ "$pid" != "-" ] && ok "$l працює (pid $pid)" || bad "$l не стартує (логи ~/Library/Logs/assistant/)"
  else
    launchctl list "$l" >/dev/null 2>&1 && ok "$l — за розкладом" || warn "$l не завантажено"
  fi
done
[ "$FOUND" = 0 ] && warn "Служб помічника не знайдено — встановити: bash tools/assistant/bot/install.sh"

# ---------- 6. Репозиторій ----------
hdr "6. Репозиторій сайту"
if git -C "$REPO" rev-parse >/dev/null 2>&1; then
  BR=$(git -C "$REPO" branch --show-current)
  if [ -n "$(git -C "$REPO" status --porcelain)" ]; then warn "У $REPO є незакомічені зміни — pull не роблю"
  elif [ "$CHECK_ONLY" = 1 ]; then ok "Репозиторій чистий ($BR), pull пропущено (--check)"
  else run git -C "$REPO" pull -q --no-rebase origin "$BR" && ok "git pull ($BR) — $(git -C "$REPO" log -1 --format='%h %s' | cut -c1-70)" || bad "git pull не вдався"; fi
fi

# ---------- 7. Claude ----------
hdr "7. Claude Code"
if command -v claude >/dev/null; then
  ok "claude $(claude --version 2>/dev/null | head -1)"
  { tmux has-session -t claude-rc 2>/dev/null || pgrep -fq "claude.*remote-control"; } && ok "Remote Control працює"  # процес RC перейменовує себе на «claude»; на Mac mini він у tmux claude-rc || warn "Remote Control не запущено: у теці проєкту — claude remote-control (або Claude desktop → Settings → Remote Control)"
else bad "claude не знайдено (PATH: ~/.local/bin)"; fi

# ---------- 8. Пульт ----------
hdr "8. Пульт"
curl -sf -m 5 "$DASH" >/dev/null && ok "Пульт $DASH відповідає" || warn "Пульт $DASH не відповідає"

# ---------- 9. Звіт ----------
hdr "Підсумок"
SUM="Mac mini перезапуск ($(date '+%d.%m %H:%M')): ✓ ${#OK[@]} · ! ${#WARN[@]} · ✗ ${#BAD[@]}"
echo "$SUM"
MSG="$SUM"
[ ${#BAD[@]} -gt 0 ] && MSG="$MSG"$'\n\nПроблеми:\n'"$(printf '✗ %s\n' "${BAD[@]}")"
[ ${#WARN[@]} -gt 0 ] && MSG="$MSG"$'\n\nУвага:\n'"$(printf '! %s\n' "${WARN[@]}")"
[ ${#BAD[@]} -eq 0 ] && [ ${#WARN[@]} -eq 0 ] && MSG="$MSG"$'\nУсе працює.'
if [ "$NO_TG" = 0 ] && [ -x "$REPO/tools/assistant/bin/tg-out.sh" ] && [ -f "$HOME/.assistant.env" ]; then
  ( set -a; source "$HOME/.assistant.env"; set +a; "$REPO/tools/assistant/bin/tg-out.sh" text "$MSG" ) >/dev/null 2>&1 \
    && echo "Звіт надіслано в Telegram." || echo "Telegram: не вдалось надіслати (перевір мережу/токен)."
fi
[ ${#BAD[@]} -eq 0 ]
