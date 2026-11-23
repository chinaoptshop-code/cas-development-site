"""Розпізнавання мовлення — тим самим інструментом, що голосові в Telegram: tools/assistant/bin/transcribe.sh
(faster-whisper із venv tools/telegram, `tools/telegram/tg.sh setup --whisper`). Перед цим ffmpeg → wav 16 кГц моно (webm/opus з браузера).
CHAT_STT_CMD — інша команда (тести): отримує шлях до wav і --lang, друкує текст.
"""
import importlib.util
import os
import pathlib
import shlex
import sys

from .common import MAX_AUDIO_S, run, which

REPO = pathlib.Path(__file__).resolve().parents[4]
SCRIPT = REPO / "tools" / "assistant" / "bin" / "transcribe.sh"
WHISPER_LANG = {"uk": "uk", "ru": "ru", "en": "en", "es": "es", "zh": "zh", "pl": "pl", "de": "de", "fr": "fr", "pt": "pt", "ar": "ar"}


def tg_python():
    p = os.environ.get("TG_PYTHON") or os.path.join(os.environ.get("TG_VENV") or os.path.expanduser("~/.tg-claude/venv"), "bin", "python")
    return p if os.path.exists(p) else None


def available():
    """→ (так/ні, чого бракує)."""
    if os.environ.get("CHAT_STT_CMD"):
        return True, ""
    if not which("ffmpeg"):
        return False, "ffmpeg (brew install ffmpeg)"
    if tg_python() or importlib.util.find_spec("faster_whisper"):
        return True, ""
    return False, "faster-whisper (tools/telegram/tg.sh setup --whisper)"


def to_wav(src, dst, max_s=MAX_AUDIO_S, timeout=120):
    ff = which("ffmpeg")
    if not ff:
        return False
    code, _, _ = run([ff, "-nostdin", "-loglevel", "error", "-y", "-i", str(src), "-t", str(max_s), "-vn", "-ac", "1", "-ar", "16000", str(dst)], timeout=timeout)
    return code == 0 and os.path.exists(dst) and os.path.getsize(dst) > 44


def transcribe(src, lang=None, workdir=None, timeout=420):
    """→ (текст або None, причина невдачі)."""
    workdir = workdir or os.path.dirname(str(src))
    wav = os.path.join(workdir, "stt.wav")
    if not to_wav(src, wav):
        return None, "не вдалося перекодувати аудіо (ffmpeg)"
    custom = os.environ.get("CHAT_STT_CMD")
    if custom:
        cmd = shlex.split(custom) + [wav]
    else:
        ok, why = available()
        if not ok:
            return None, "немає розпізнавання: " + why
        cmd = ["bash", str(SCRIPT), wav]
    if lang in WHISPER_LANG:
        cmd += ["--lang", WHISPER_LANG[lang]]
    env_py = tg_python() or (sys.executable if importlib.util.find_spec("faster_whisper") else None)
    old = os.environ.get("TG_PYTHON")
    if env_py and not custom:
        os.environ["TG_PYTHON"] = env_py
    try:
        code, out, err = run(cmd, timeout=timeout, cwd=workdir)
    finally:
        if old is None:
            os.environ.pop("TG_PYTHON", None)
        else:
            os.environ["TG_PYTHON"] = old
    text = out.decode("utf-8", "replace").strip()
    if code != 0 or not text:
        return None, "розпізнавання не вдалося" + (" (тайм-аут)" if code == 124 else "")
    return text[:6000], ""
