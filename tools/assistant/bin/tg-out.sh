#!/usr/bin/env bash
# Надіслати Михайлу повідомлення/файл/голосове.
#   tg-out.sh text "Текст"            [--md]        (розмітка Markdown; кнопки — JSON у змінній TG_OUT_MARKUP)
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
      msg="${1:?текст}"; parse=""; [ "${2:-}" = "--md" ] && parse="-d parse_mode=Markdown"
      # Telegram обмежує 4096 символів — ріжемо на частини
      python3 - "$msg" <<'PY' | while IFS= read -r -d '' part; do api sendMessage -d chat_id="$cid" $parse ${TG_OUT_MARKUP:+--data-urlencode "reply_markup=$TG_OUT_MARKUP"} --data-urlencode "text=$part" >/dev/null; done
import sys
t=sys.argv[1]; n=3900
for i in range(0,len(t),n): sys.stdout.write(t[i:i+n]+"\0")
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
