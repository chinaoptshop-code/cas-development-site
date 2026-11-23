"""Налаштування воркера чату — лише змінні оточення й файл поза репозиторієм (~/.cas-chat/env).

Файл — рядки KEY=value (як .env; коментарі #). Змінні оточення процесу важливіші за файл.
Ключ LEADBOT_KEY шукаємо так само, як бот пошуку на Mac mini: змінна оточення процесу; якщо її немає —
~/.cas-chat/env, далі ~/.assistant.env (там його тримає launchd-обгортка помічника). Ключ ніколи не логуємо.
"""
import os
import pathlib

HOME = pathlib.Path.home()
ENV_FILES = [HOME / ".cas-chat" / "env", HOME / ".assistant.env"]
WORKER_DIR = pathlib.Path(__file__).resolve().parent
REPO = WORKER_DIR.parents[2]

DEFAULTS = {
    "CHAT_BASE": "https://cas-develop.com",
    "CHAT_LLM": "local",              # local (Ollama) | api (платний Anthropic API — лише явно, рішення власника 23.11.2026)
    "CHAT_OLLAMA_URL": "http://127.0.0.1:11434",
    "CHAT_MODEL": "qwen3:8b",         # та сама модель, що в бота (ASSISTANT_LOCAL_MODEL)
    "CHAT_VISION_MODEL": "",          # порожньо — автовизначення зі встановлених (qwen2.5vl, qwen3-vl, gemma3, llava…)
    "CHAT_API_MODEL": "claude-sonnet-5",
    "CHAT_POLL": "4",                 # с між опитуваннями черги (3–5)
    "CHAT_PING": "60",                # с між пінгами
    "CHAT_PARALLEL": "2",             # розмов одночасно (1–2)
    "CHAT_LOCK": "180",               # с блокування розмови при видачі
    "CHAT_TTS": "on",                 # on | off — голосова відповідь на голосове (клонований голос, механізм бота)
    "CHAT_CALENDAR": "on",            # on | off — пропонувати вільні проміжки з календаря
    "CHAT_DEBUG": "0",                # 1 — у журнал і тексти (лише для налагодження на Mac mini)
    "CHAT_TMP": "",                   # тека для тимчасових файлів (типово — системна)
    "CHAT_MAX_FILE_MB": "60",
    "CHAT_FILE_TIMEOUT": "240",       # с на розбір одного файлу (відео/DWG — найдовші)
}


def _read_file(p):
    out = {}
    try:
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip().removeprefix("export ").strip()
            out[k] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


class Config:
    def __init__(self, env=None, files=None):
        env = os.environ if env is None else env
        merged = {}
        for p in reversed(files if files is not None else ENV_FILES):
            merged.update(_read_file(pathlib.Path(p)))
        merged.update({k: v for k, v in env.items() if k.startswith(("CHAT_", "LEADBOT_KEY", "ASSISTANT_", "TG_", "TTS_"))})
        self._v = {**DEFAULTS, **merged}

    def get(self, k, default=None):
        v = self._v.get(k)
        return default if v in (None, "") and default is not None else v

    def num(self, k, default=0.0):
        try:
            return float(self._v.get(k) or default)
        except ValueError:
            return float(default)

    def on(self, k):
        return str(self._v.get(k, "")).lower() in ("1", "on", "yes", "true")

    @property
    def key(self):
        return self._v.get("LEADBOT_KEY", "")

    @property
    def base(self):
        return str(self._v.get("CHAT_BASE") or DEFAULTS["CHAT_BASE"]).rstrip("/")

    def __repr__(self):  # без ключа
        return f"Config(base={self.base!r}, llm={self.get('CHAT_LLM')!r}, model={self.get('CHAT_MODEL')!r}, key={'set' if self.key else 'missing'})"
