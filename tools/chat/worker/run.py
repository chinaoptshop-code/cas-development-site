#!/usr/bin/env python3
"""Воркер чату на сайті (Mac mini): забирає розмови з /api/bot/chat, розбирає файли, рахує попередньо, відповідає текстом і голосом.

  python3 tools/chat/worker/run.py              # постійна робота (служба launchd com.cas.chatworker, install.sh)
  python3 tools/chat/worker/run.py --selftest   # що вміє на цій машині: формати, модель, API (ping), календар, голос
  python3 tools/chat/worker/run.py --once       # один прохід черги й вихід
  python3 tools/chat/worker/run.py --once --dry # не надсилати відповіді — надрукувати їх (розмова повертається в чергу)

Налаштування — ~/.cas-chat/env (див. README.md). Типово локальні моделі (Ollama); платний API — лише CHAT_LLM=api (рішення власника).
"""
import importlib.util
import json
import os
import pathlib
import signal
import subprocess
import sys
import threading

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from config import REPO, Config  # noqa: E402

PASS_ENV = ("CHAT_OLLAMA_URL", "CHAT_VISION_MODEL", "CHAT_STT_CMD", "CHAT_CAL_CMD", "TG_PYTHON", "TG_VENV", "TG_WHISPER_MODEL",
            "ASSISTANT_GCAL_IDS", "ASSISTANT_TZ", "TTS_CLONE_VOICE")


def export(cfg):
    """Значення з ~/.cas-chat/env → оточення процесу (їх читають модулі й дочірні процеси розбору)."""
    for k in PASS_ENV:
        v = cfg.get(k)
        if v and not os.environ.get(k):
            os.environ[k] = v


def build(cfg, dry=False):
    import llm
    from api import Api
    from brain import Brain
    from voice import Voice
    from worker import Log, Worker
    log = Log(cfg.on("CHAT_DEBUG"))
    api = Api(cfg.base, cfg.key)
    voice = Voice() if (cfg.get("CHAT_TTS") or "on") != "off" else None
    brain = Brain(cfg, llm=llm.backend(cfg), voice=voice, calendar=(cfg.get("CHAT_CALENDAR") or "on") != "off", log=log)
    return Worker(cfg, api, brain, dry=dry, log=log)


# ---------------- самоперевірка ----------------
def has(mod):
    try:
        return importlib.util.find_spec(mod) is not None
    except (ImportError, ValueError):
        return False


def selftest(cfg):
    import ollama
    from api import Api, ApiError
    from parsers import stt
    from parsers.common import which
    rows, ok_all = [], True

    def row(name, ok, have, need=""):
        rows.append((name, "так" if ok else ("частково" if ok is None else "ні"), have, need))

    # API
    if not cfg.key:
        row("API сайту (ping)", False, cfg.base, "LEADBOT_KEY у ~/.cas-chat/env або ~/.assistant.env"); ok_all = False
    else:
        try:
            d = Api(cfg.base, cfg.key, retries=0, timeout=15).ping()
            row("API сайту (ping)", True, f"{cfg.base}: черга {d.get('queue', '?')}")
        except ApiError as e:
            row("API сайту (ping)", False, f"{cfg.base}: HTTP {e.status}", {401: "невірний ключ", 503: "на сайті немає ключа або міграції 0021", 0: "немає мережі"}.get(e.status, ""))
            ok_all = False
    # моделі
    installed = ollama.tags()
    model = cfg.get("CHAT_MODEL") or "qwen3:8b"
    mode = (cfg.get("CHAT_LLM") or "local").lower()
    if installed is None:
        row("Локальна модель (Ollama)", False, "Ollama не відповідає на " + ollama.base(), "brew install ollama; ollama serve"); ok_all = False
    else:
        hit = any(n == model or n.split(":")[0] == model.split(":")[0] for n in installed)
        row("Локальна модель (Ollama)", hit, f"{model} " + ("встановлено" if hit else "немає"), "" if hit else f"ollama pull {model}")
        ok_all &= hit
    vm = ollama.vision_model(installed or [])
    row("Vision-модель (фото, кадри, скани)", bool(vm), vm or "немає", "" if vm else "ollama pull qwen2.5vl:7b  (або gemma3:12b)")
    row("Режим відповіді", mode == "local", "local (безкоштовно)" if mode == "local" else "API (ПЛАТНО — увімкнено CHAT_LLM=api)",
        "" if mode == "local" else "рішення власника: «нічого платного зараз»")
    # інструменти
    ff, fp = which("ffmpeg"), which("ffprobe")
    stt_ok, stt_need = stt.available()
    pil, heif = has("PIL"), has("pillow_heif")
    pdf_lib = next((m for m in ("pypdf", "fitz", "pdfplumber") if has(m)), None)
    scan = has("fitz") or bool(which("pdftoppm"))
    oda, lib = which("ODAFileConverter"), which("dwg2dxf")
    # формати
    row("Фото jpeg/png/webp", pil and bool(vm) or (None if pil else False), ("Pillow" if pil else "без Pillow") + (", опис — " + vm if vm else ", без опису"),
        ("" if pil else "pip3 install pillow; ") + ("" if vm else "vision-модель (вище)"))
    row("Фото HEIC (iPhone)", heif and pil, "pillow-heif" if heif else "немає", "" if heif else "pip3 install pillow-heif")
    row("Аудіо / голосові", stt_ok, "faster-whisper (tools/telegram)" if stt_ok else "немає", stt_need)
    row("Відео mp4/mov/webm", (bool(ff and fp) and (bool(vm) or stt_ok)) or (None if ff else False),
        ("ffmpeg" if ff else "без ffmpeg") + (", кадри → " + vm if vm else "") + (", звук → whisper" if stt_ok else ""),
        ("" if ff else "brew install ffmpeg; ") + ("" if vm else "vision-модель; ") + ("" if stt_ok else stt_need))
    row("PDF (текст)", bool(pdf_lib), pdf_lib or "немає", "" if pdf_lib else "pip3 install pypdf")
    row("PDF (скан)", scan and bool(vm), ("pymupdf" if has("fitz") else "pdftoppm" if scan else "немає рендера") + (" + " + vm if vm else ""),
        ("" if scan else "pip3 install pymupdf (або brew install poppler); ") + ("" if vm else "vision-модель"))
    row("Excel .xlsx", has("openpyxl"), "openpyxl" if has("openpyxl") else "немає", "" if has("openpyxl") else "pip3 install openpyxl")
    row("Excel .xls (старий)", has("xlrd"), "xlrd" if has("xlrd") else "немає", "" if has("xlrd") else "pip3 install xlrd")
    row("CSV, DOCX", True, "вбудовано", "")
    row("DXF", True if has("ezdxf") else None, "ezdxf" if has("ezdxf") else "вбудований читач ASCII DXF (без HATCH і бінарного DXF)", "" if has("ezdxf") else "pip3 install ezdxf")
    row("DWG", bool(oda or lib), "ODAFileConverter" if oda else "dwg2dxf (LibreDWG)" if lib else "немає конвертера → менеджеру",
        "" if (oda or lib) else "ODA File Converter (безкоштовно, opendesign.com) або brew install libredwg")
    row("3DS", True, "вбудований читач" + (" + trimesh" if has("trimesh") else ""), "")
    row("SKP, IFC, RVT, ZIP", True, "не розбираємо — менеджеру (handoff complex)", "")
    # голос і календар
    docker = which("docker")
    tts_on = (cfg.get("CHAT_TTS") or "on") != "off"
    row("Голосова відповідь (клон голосу)", (bool(docker) and bool(ff)) if tts_on else None,
        ("вимкнено CHAT_TTS=off" if not tts_on else "Gemini TTS бота (docker знайдено; ключ n8n перевіряється при першому голосовому)" if docker else "немає docker/n8n"),
        "" if (docker and ff) or not tts_on else "той самий TTS, що в боті: docker + n8n, ffmpeg")
    cal = REPO / "tools/assistant/bin/gcal.py"
    code = None
    if (cfg.get("CHAT_CALENDAR") or "on") != "off":
        try:
            code = subprocess.run([sys.executable, str(cal), "week", "--json"], capture_output=True, timeout=60).returncode
        except (OSError, subprocess.TimeoutExpired):
            code = 4
    row("Дзвінок: вільні проміжки", code == 0 if code is not None else None,
        {0: "календар Google підключено", 3: "календар не підключено", 4: "календар недоступний", None: "вимкнено CHAT_CALENDAR=off"}.get(code, f"код {code}"),
        "" if code in (0, None) else "python3 tools/assistant/bin/google_oauth.py login (без нього — «напишіть зручний час»)")
    w = [max(len(r[i]) for r in rows + [("Можливість", "Стан", "Що є", "Що поставити")]) for i in range(3)]
    print(f"{'Можливість':<{w[0]}}  {'Стан':<{w[1]}}  {'Що є':<{w[2]}}  Що поставити")
    print("-" * (sum(w) + 20))
    for r in rows:
        print(f"{r[0]:<{w[0]}}  {r[1]:<{w[1]}}  {r[2]:<{w[2]}}  {r[3]}")
    print("\n" + repr(cfg))
    return 0 if ok_all else 1


def single_instance():
    import fcntl
    d = pathlib.Path.home() / ".cas-chat"
    d.mkdir(exist_ok=True)
    f = open(d / "worker.lock", "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit("Воркер уже запущено (~/.cas-chat/worker.lock)")
    return f


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cfg = Config()
    export(cfg)
    if "--selftest" in argv:
        return selftest(cfg)
    if not cfg.key:
        print("Немає LEADBOT_KEY (~/.cas-chat/env або змінна оточення) — див. tools/chat/worker/README.md", file=sys.stderr)
        return 2
    dry = "--dry" in argv
    w = build(cfg, dry=dry)
    if "--once" in argv:
        res = w.once()
        print(json.dumps({"results": res, "stats": w.stats, "dry": w.printed if dry else None}, ensure_ascii=False, indent=1))
        return 0
    lock = single_instance()  # noqa: F841
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *a: stop.set())
    w.run(stop)
    return 0


if __name__ == "__main__":
    sys.exit(main())
