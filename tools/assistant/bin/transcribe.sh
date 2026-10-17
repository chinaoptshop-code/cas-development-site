#!/usr/bin/env bash
# Аудіофайл → текст локально (faster-whisper із venv інструмента Telegram).
#   transcribe.sh запис.ogg [--lang uk] [--model small]
# Встановлення моделі: tools/telegram/tg.sh setup --whisper (перший запуск качає модель).
set -euo pipefail
f="${1:?аудіофайл}"; shift
lang=""; model="${TG_WHISPER_MODEL:-small}"
while [ $# -gt 0 ]; do case "$1" in --lang) lang="$2"; shift 2;; --model) model="$2"; shift 2;; *) shift;; esac; done
PY="${TG_PYTHON:-${TG_VENV:-$HOME/.tg-claude/venv}/bin/python}"
"$PY" - "$f" "$model" "$lang" <<'PY'
import sys
try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.exit("faster-whisper не встановлено: tools/telegram/tg.sh setup --whisper")
path, model, lang = sys.argv[1], sys.argv[2], sys.argv[3] or None
m = WhisperModel(model, device="cpu", compute_type="int8")
segments, info = m.transcribe(path, language=lang, vad_filter=True)
print(" ".join(s.text.strip() for s in segments))
PY
