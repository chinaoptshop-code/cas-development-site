#!/usr/bin/env bash
# Надіслати Михайлу повідомлення/файл/голосове.
#   tg-out.sh text "Текст"            [--md|--html] (розмітка Markdown або HTML <b>; кнопки — JSON у змінній TG_OUT_MARKUP)
#   tg-out.sh file шлях.pdf ["Підпис"]
#   tg-out.sh voice запис.mp3                      (готовий аудіофайл як голосове)
#   tg-out.sh say "Текст, який озвучити"           (лише режим personal: озвучує tg.sh)
# Режим обирається автоматично: бот (ASSISTANT_BOT_TOKEN) або особистий акаунт (tg.sh).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../config.sh"

kind="${1:?text|file|voice|say}"; shift

api() { curl -sS --fail-with-body -m 60 "https://api.telegram.org/bot${ASSISTANT_BOT_TOKEN}/$1" "${@:2}"; }

bot_chat_id() {
  if [ -n "$ASSISTANT_CHAT_ID" ]; then echo "$ASSISTANT_CHAT_ID"; return; fi
  # Беремо chat_id з останнього апдейту (Михайло має хоча б раз написати боту /start)
  local id
  id=$(api getUpdates -d limit=1 -d offset=-1 | python3 -c 'import sys,json;u=json.load(sys.stdin)["result"];print(u[-1]["message"]["chat"]["id"] if u else "")')
  [ -n "$id" ] || { echo "❌ Не знаю chat_id: напишіть боту /start або задайте ASSISTANT_CHAT_ID" >&2; exit 2; }
  echo "$id"
}

if [ "$(assistant_mode)" = bot ]; then
  cid=$(bot_chat_id)
  case "$kind" in
    text)
      msg="${1:?текст}"; parse=""; [ "${2:-}" = "--md" ] && parse="-d parse_mode=Markdown"; [ "${2:-}" = "--html" ] && parse="-d parse_mode=HTML"
      # Telegram обмежує 4096 символів — ріжемо на частини
      python3 - "$msg" <<'PY' | while IFS= read -r -d '' part; do api sendMessage -d chat_id="$cid" $parse ${TG_OUT_MARKUP:+--data-urlencode "reply_markup=$TG_OUT_MARKUP"} --data-urlencode "text=$part" >/dev/null; done
import sys
t=sys.argv[1]; n=3900
for i in range(0,len(t),n): sys.stdout.write(t[i:i+n]+"\0")
PY
      # 18.11: вихідні з tg-out (сесії Claude Code, скрипти) теж у діалог бота — щоб «так»/«публікуй сам» на них він розумів.
      # Питання (є «?» або «так») → відкрите питання в .pending-questions.jsonl; TG_OUT_ASK=0 — не вважати питанням.
      python3 - "$msg" "${ASSISTANT_MEMORY_DIR:-$HOME/assistant-memory}" "${TG_OUT_ASK:-auto}" <<'PY' || true
import sys, json, datetime, pathlib, re
t, mem, ask = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
now = datetime.datetime.now().isoformat(timespec="minutes")
with (mem / ".dialog.jsonl").open("a", encoding="utf-8") as f:
    f.write(json.dumps({"t": now, "who": "Помічник (tg-out)", "text": t[:1500]}, ensure_ascii=False) + "\n")
if ask == "1" or (ask == "auto" and re.search(r"\?|«так", t)):
    with (mem / ".pending-questions.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps({"id": now, "t": now, "q": t[:1200], "status": "open"}, ensure_ascii=False) + "\n")
PY
      ;;
    file)  api sendDocument -F chat_id="$cid" -F document=@"${1:?файл}" -F caption="${2:-}" >/dev/null ;;
    voice)
      f="${1:?аудіо}"; ogg="$ASSISTANT_TMP/$(basename "${f%.*}").ogg"
      ffmpeg -y -loglevel error -i "$f" -c:a libopus -b:a 48k -ac 1 "$ogg"
      api sendVoice -F chat_id="$cid" -F voice=@"$ogg" >/dev/null ;;
    say)   echo "❌ У режимі бота озвучування недоступне; надішліть текст" >&2; exit 2 ;;
    *) echo "невідомий тип: $kind" >&2; exit 2 ;;
  esac
  echo "✅ надіслано через бота"
else
  chat="$ASSISTANT_INBOX_CHAT"
  case "$kind" in
    text)
      msg="${1:?текст}"; parse=(); [ "${2:-}" = "--md" ] && parse=(--parse md)
      "$TG" send "$chat" "${parse[@]}" "$ASSISTANT_PREFIX $msg" ;;
    file)  "$TG" send-file "$chat" "${1:?файл}" --caption "$ASSISTANT_PREFIX ${2:-}" ;;
    voice) "$TG" send-voice "$chat" "${1:?аудіо}" ;;
    say)   "$TG" say "$chat" "${1:?текст}" --lang uk ;;
    *) echo "невідомий тип: $kind" >&2; exit 2 ;;
  esac
fi
