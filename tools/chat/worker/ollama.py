"""Локальні моделі Ollama на Mac mini: список встановлених, чат (текст / JSON / зображення). Лише стандартна бібліотека."""
import json
import os
import re
import urllib.error
import time
import urllib.request

# облік витрат (usage.Usage.record): run.py ставить METER = usage.record — кожен виклик Ollama (текст і vision) рахується
# у добовий і по-розмовний бюджет (tools/chat/worker/usage.py). None — без обліку (тести, разові запуски).
METER = None
VISION_HINTS = ("qwen2.5vl", "qwen2.5-vl", "qwen3-vl", "qwen3vl", "gemma3", "llava", "minicpm-v", "llama3.2-vision", "moondream", "granite3.2-vision", "mistral-small3.1")


def base():
    return (os.environ.get("CHAT_OLLAMA_URL") or "http://127.0.0.1:11434").rstrip("/")


def tags(timeout=5):
    try:
        with urllib.request.urlopen(base() + "/api/tags", timeout=timeout) as r:
            return [m.get("name", "") for m in json.load(r).get("models", [])]
    except Exception:
        return None


def vision_model(installed=None):
    """CHAT_VISION_MODEL або перша встановлена vision-модель зі списку підказок; None — немає."""
    want = os.environ.get("CHAT_VISION_MODEL", "").strip()
    installed = tags() if installed is None else installed
    if installed is None:
        return None
    if want:
        return want if any(n == want or n.split(":")[0] == want.split(":")[0] for n in installed) else None
    for hint in VISION_HINTS:
        for n in installed:
            if n.lower().startswith(hint):
                return n
    return None


def strip_think(s):
    s = re.sub(r"<think>.*?</think>", "", s or "", flags=re.S)
    s = re.sub(r"^.*?</think>", "", s, flags=re.S)
    return re.sub(r"<think>.*$", "", s, flags=re.S).strip()


def _meter(d, messages, out, seconds):
    if METER is None:
        return
    try:
        tok = int(d.get("prompt_eval_count") or 0) + int(d.get("eval_count") or 0)
        if not tok:   # стара Ollama без лічильників — оцінка за символами
            tok = int((sum(len(str(m.get("content") or "")) for m in messages) + len(out or "")) / 3.5) + 1
        METER("local", tokens=tok, seconds=seconds)
    except Exception:
        pass


def chat(model, messages, fmt=None, timeout=180, temperature=0.2, max_tokens=700):
    """→ текст відповіді або None (Ollama недоступна / помилка). fmt="json" — JSON-режим Ollama."""
    body = {"model": model, "messages": messages, "stream": False, "think": False,
            "options": {"temperature": temperature, "num_predict": max_tokens}}
    if fmt:
        body["format"] = fmt
    for attempt in (0, 1):
        t0 = time.monotonic()
        try:
            req = urllib.request.Request(base() + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            t0 = time.monotonic()
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.load(r)
            out = strip_think((d.get("message") or {}).get("content", "")) or None
            _meter(d, messages, out, time.monotonic() - t0)
            return out
        except urllib.error.HTTPError as e:
            if attempt == 0 and e.code == 400 and "think" in body:   # стара Ollama не знає think
                body.pop("think"); continue
            return None
        except Exception:
            _meter({}, messages, None, time.monotonic() - t0)   # тайм-аут теж зʼїв час Mac mini — рахуємо
            return None
    return None
