#!/bin/bash
# Голосове ГОЛОСОМ МИХАЙЛА (клон Gemini voice_0xudst09wbpu) → OGG/Opus для Telegram.
#   voice-clone.sh "Текст" [вихід.ogg]      → друкує шлях до готового .ogg
# Далі надіслати: tools/telegram/tg.sh send-voice <чат> <файл.ogg>   (з акаунта Михайла)
#            або: tools/assistant/bin/tg-out.sh voice <файл.ogg>       (Михайлу від бота)
# НЕ використовувати tg.sh say — там жіночий голос Google (21.10 так помилково пішло Сержу).
# Ключ Gemini — з облікових даних n8n (docker), тому скрипт і існує: Claude напряму docker не запускає.
set -euo pipefail
TEXT="${1:?текст}"
OUT="${2:-$HOME/.assistant/tmp/voice-$(date +%s).ogg}"
mkdir -p "$(dirname "$OUT")"
VOICE="${TTS_CLONE_VOICE:-voice_0xudst09wbpu}"
FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg; [ -x "$FF" ] || FF=/opt/homebrew/bin/ffmpeg
KEY=$(/usr/local/bin/docker exec n8n sh -c 'n8n export:credentials --id=JSMl9lvZ1DExgDFd --decrypted --output=/tmp/g.json >/dev/null 2>&1; cat /tmp/g.json; rm -f /tmp/g.json' 2>/dev/null \
  | /opt/homebrew/bin/python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["data"]["apiKey"])')
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SAY=$(/opt/homebrew/bin/python3 -c 'import re,sys;t=sys.argv[1];t=re.sub(r"CAS\s*Development","КАС Девелопмент",t,flags=re.I).replace("CAS","КАС");print(t)' "$TEXT")
/opt/homebrew/bin/python3 - "$KEY" "$VOICE" "$SAY" "$TMP/a.wav" <<'PY'
import json, sys, base64, struct, re, urllib.request
key, voice, text, out = sys.argv[1:5]
body = {"contents": [{"parts": [{"text": "Озвуч природно, як жива людина в розмові. Текст: " + text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"voice": voice}}}}
req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
                             data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "content-type": "application/json"})
d = json.load(urllib.request.urlopen(req, timeout=120))
p = next(x["inlineData"] for x in d["candidates"][0]["content"]["parts"] if "inlineData" in x)
raw = base64.b64decode(p["data"])
if raw[:4] != b"RIFF":
    rate = int((re.search(r"rate=(\d+)", p.get("mimeType", "")) or [0, 24000])[1])
    raw = b"RIFF" + struct.pack("<I", 36 + len(raw)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(raw)) + raw
open(out, "wb").write(raw)
PY
"$FF" -loglevel error -y -i "$TMP/a.wav" -c:a libopus -b:a 48k "$OUT"
echo "$OUT"
