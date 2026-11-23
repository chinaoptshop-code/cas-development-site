"""Синтез голосу — один механізм для Telegram-бота (bot.py, speak) і чату на сайті (tools/chat/worker/voice.py).

Gemini TTS: клон голосу Михайла (TTS_CLONE_VOICE) або голос Algieba ×1,17; ключ — з облікових даних n8n у Docker (не з файлів репозиторію).
synth_ogg(текст, clone) → байти OGG/Opus 48 кбіт/с (як голосові Telegram). Помилка — виняток (викликач вирішує, що робити).
"""
import base64
import json
import os
import pathlib
import re
import shutil
import struct
import subprocess
import tempfile
import time
import urllib.request

TTS_MODEL, TTS_VOICE, TTS_TEMPO, TTS_CRED = "gemini-3.8-flash-tts", "Algieba", 1.17, "JSMl9lvZ1DExgDFd"
FFMPEG = next((f for f in ("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg") if os.path.exists(f)), "ffmpeg")
CLONE_VOICE = os.environ.get("TTS_CLONE_VOICE", "voice_0xudst09wbpu")
_key = {"v": "", "at": 0}


def key():
    if _key["v"] and time.time() - _key["at"] < 3600:
        return _key["v"]
    out = subprocess.run(["docker", "exec", "n8n", "sh", "-c",
                          f"n8n export:credentials --id={TTS_CRED} --decrypted --output=/tmp/g.json >/dev/null 2>&1; cat /tmp/g.json; rm -f /tmp/g.json"],
                         capture_output=True, text=True, timeout=60).stdout
    _key.update(v=json.loads(out[out.index("["):])[0]["data"]["apiKey"], at=time.time())
    return _key["v"]


def synth_ogg(text, clone=True, timeout=90):
    body = {"contents": [{"parts": [{"text": text}]}], "generationConfig": {"responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"voice": CLONE_VOICE} if clone else {"prebuiltVoiceConfig": {"voiceName": TTS_VOICE}}}}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODEL}:generateContent",
                                 data=json.dumps(body).encode(), headers={"x-goog-api-key": key(), "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    part = next(p["inlineData"] for p in d["candidates"][0]["content"]["parts"] if "inlineData" in p)
    raw = base64.b64decode(part["data"])
    tmp = pathlib.Path(tempfile.mkdtemp())
    try:
        src = tmp / "a.wav"
        if raw[:4] != b"RIFF":                                  # сирий PCM 24 кГц моно 16 біт
            rate = int((re.search(r"rate=(\d+)", part.get("mimeType", "")) or [0, 24000])[1])
            raw = b"RIFF" + struct.pack("<I", 36 + len(raw)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(raw)) + raw
        src.write_bytes(raw)
        ogg = tmp / "voice.ogg"
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), *([] if clone else ["-filter:a", f"atempo={TTS_TEMPO}"]), "-c:a", "libopus", "-b:a", "48k", str(ogg)],
                       check=True, timeout=60)
        return ogg.read_bytes()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def ogg_duration(data):
    """Тривалість OGG/Opus за останньою сторінкою (granule / 48 кГц) — без ffprobe. None — не OGG."""
    i = data.rfind(b"OggS")
    if i < 0 or len(data) < i + 14:
        return None
    g = struct.unpack_from("<q", data, i + 6)[0]
    return round(g / 48000, 2) if g > 0 else None
