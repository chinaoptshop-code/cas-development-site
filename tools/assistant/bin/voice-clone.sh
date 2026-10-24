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
body = {"contents": [{"parts": [{"text": text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"voice": voice}}}}
req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
                             data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "content-type": "application/json"})
try:
    d = json.load(urllib.request.urlopen(req, timeout=120))
except urllib.error.HTTPError as e:
    print(f"[voice-clone] API ERROR {e.code}: {e.read().decode()[:300]}", file=__import__('sys').stderr)
    raise
p = next(x["inlineData"] for x in d["candidates"][0]["content"]["parts"] if "inlineData" in x)
raw = base64.b64decode(p["data"])
# Витягуємо PCM з RIFF/WAV
if raw[:4] == b"RIFF":
    rate = struct.unpack_from("<I", raw, 24)[0]
    pos = 12; pcm = None
    while pos + 8 <= len(raw):
        cid = raw[pos:pos+4]; csz = struct.unpack_from("<I", raw, pos+4)[0]
        if cid == b"data": pcm = raw[pos+8:pos+8+csz]; break
        pos += 8 + csz
    if pcm is None: pcm = raw[44:]
else:
    rate = int((re.search(r"rate=(\d+)", p.get("mimeType","")) or [0,24000])[1]); pcm = raw

fmt = 'RIFF' if raw[:4]==b'RIFF' else 'RAW'
print(f"[voice-clone] {fmt} rate={rate} total={len(pcm)/(rate*2):.2f}s", file=sys.stderr)

# 1. Обрізаємо аудіо-тишу на початку (тихий паддінг Gemini)
THRESHOLD = 1500
i = 0
while i + 1 < len(pcm):
    if abs(struct.unpack_from("<h", pcm, i)[0]) > THRESHOLD: break
    i += 2
lookback = int(rate * 0.05) * 2; i = max(0, i - lookback) & ~1
if i > 0:
    print(f"[voice-clone] silence trim: {i/(rate*2):.3f}s", file=sys.stderr)
    pcm = pcm[i:]

# 2. Виявлення вербального преамбули через Whisper (word timestamps)
#    Модель може сказати "Ось ваш дайджест:" перед текстом — обрізаємо це.
import subprocess, os, unicodedata as ud

def _norm(w):
    w = w.lower().strip()
    w = ''.join(c for c in ud.normalize('NFD', w) if ud.category(c) != 'Mn')
    return re.sub(r'[^\w]','',w)

# Беремо перші 5 значущих слів оригінального тексту
text_words = [_norm(w) for w in text.split() if len(_norm(w)) > 2][:5]
probe_py = os.path.expanduser("~/.tg-claude/venv/bin/python")
if text_words and os.path.exists(probe_py):
    # Записуємо перші 12с як probe WAV
    probe_pcm = pcm[:rate*12*2]
    probe_wav = out + ".probe.wav"
    pw = (b"RIFF" + struct.pack("<I", 36+len(probe_pcm)) + b"WAVEfmt " +
          struct.pack("<IHHIIHH",16,1,1,rate,rate*2,2,16) + b"data" +
          struct.pack("<I",len(probe_pcm)) + probe_pcm)
    open(probe_wav,"wb").write(pw)
    whisper_script = r"""
import sys,json,re,unicodedata as ud
from faster_whisper import WhisperModel
def norm(w):
    w=w.lower().strip()
    w=''.join(c for c in ud.normalize('NFD',w) if ud.category(c)!='Mn')
    return re.sub(r'[^\w]','',w)
m=WhisperModel("tiny",device="cpu",compute_type="int8")
segs,_=m.transcribe(sys.argv[1],word_timestamps=True,vad_filter=False)
out=[]
for s in segs:
    for w in (s.words or []):
        nw=norm(w.word)
        if nw: out.append({"w":nw,"s":round(w.start,3)})
print(json.dumps(out))
"""
    try:
        r = subprocess.run([probe_py,"-c",whisper_script,probe_wav],
                           capture_output=True, text=True, timeout=45)
        os.unlink(probe_wav)
        wds = json.loads(r.stdout) if r.returncode==0 and r.stdout.strip() else []
        # Шукаємо перше слово оригінального тексту в транскрипції
        trim_time = None
        for w in wds:
            if w["w"] in text_words:
                trim_time = max(0.0, w["s"] - 0.15)
                break
        if trim_time is not None and trim_time > 0.4:
            trim_bytes = int(trim_time * rate * 2) & ~1
            print(f"[voice-clone] preamble {trim_time:.2f}s → trimmed", file=sys.stderr)
            pcm = pcm[trim_bytes:]
        else:
            print(f"[voice-clone] no preamble (text_start={trim_time})", file=sys.stderr)
    except Exception as ex:
        print(f"[voice-clone] whisper skip: {ex}", file=sys.stderr)
        try: os.unlink(probe_wav)
        except: pass

# Записуємо WAV
raw_out = (b"RIFF" + struct.pack("<I",36+len(pcm)) + b"WAVEfmt " +
           struct.pack("<IHHIIHH",16,1,1,rate,rate*2,2,16) +
           b"data" + struct.pack("<I",len(pcm)) + pcm)
open(out,"wb").write(raw_out)
PY
"$FF" -loglevel warning -y -i "$TMP/a.wav" \
  -af "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-35dB" \
  -c:a libopus -b:a 48k "$OUT"
echo "$OUT"
