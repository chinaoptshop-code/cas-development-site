"""Голосова відповідь на голосове відвідувача — тим самим механізмом, що бот у Telegram (tools/assistant/bot/tts.py, клонований
голос Михайла). Формат для API: audio/ogg (opus), ≤ 6 МБ, тривалість у секундах. Текст для озвучення — коротший (~30 с мовлення):
без посилань, списку проміжків і службових рядків. TTS недоступний → None (відповідь лише текстом).
"""
import base64
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "assistant" / "bot"))
import tts  # noqa: E402

MAX_CHARS = 420          # ≈ 30 с мовлення
MAX_BYTES = 6 * 1024 * 1024


def speakable(text, lang):
    t = re.sub(r"https?://\S+", "", text or "")
    t = re.sub(r"^\s*[1-9]\)\s.*$", "", t, flags=re.M)          # список проміжків — лише в тексті
    t = re.sub(r"[⁦-⁩]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if lang in ("uk", "ru"):
        t = re.sub(r"CAS\s*Development", "КАС Девелопмент", t, flags=re.I).replace("CAS", "КАС")
    if len(t) <= MAX_CHARS:
        return t
    out = ""
    for s in re.split(r"(?<=[.!?。！？])\s+", t):
        if len(out) + len(s) + 1 > MAX_CHARS:
            break
        out = (out + " " + s).strip()
    return out or t[:MAX_CHARS]


class Voice:
    def __init__(self, synth=None, clone=True):
        self.synth = synth or (lambda text: tts.synth_ogg(text, clone=clone))

    def __call__(self, text, lang):
        say = speakable(text, lang)
        if not say:
            return None
        try:
            data = self.synth(say)
        except Exception:
            return None
        if not data or len(data) > MAX_BYTES:
            return None
        dur = tts.ogg_duration(data)
        return {"mime": "audio/ogg", "data": base64.b64encode(data).decode(), "dur": min(dur, 600) if dur else None}
