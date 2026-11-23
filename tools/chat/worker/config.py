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
    "CHAT_MAX_FILE_MB": "12",         # з R2 сайт приймає до 10 МБ на файл (functions/_chat.js L.fileR2), без R2 — 1,5 МБ
    "CHAT_FILE_TIMEOUT": "240",       # с на розбір одного файлу (відео/DWG — найдовші)
}


# ---------------- ліміти (Михайло 23.11.2026: «щоб клієнти всі токени не використали») ----------------
# Однакові для обох бекендів (local і api). Значення — у ~/.cas-chat/env або змінних оточення; межі [min, max] — захист від описок.
# Таблиця з поясненнями — README.md, розділ «Ліміти». Сайт має свої стелі (functions/_chat.js L: відповідей на розмову й на добу) —
# воркер бачить залишок у черзі (budget) і нічого не витрачає понад нього.
LIMITS = {
    # ключ: (типово, min, max, що це)
    "CHAT_MAX_TOKENS":        (600, 100, 2000, "токенів у відповіді моделі (max output)"),
    "CHAT_EXTRACT_TOKENS":    (400, 100, 1000, "токенів у JSON витягу параметрів"),
    "CHAT_HISTORY_LINES":     (12, 2, 40, "останніх реплік історії в запиті"),
    "CHAT_HISTORY_CHARS":     (6000, 1000, 30000, "знаків історії й нових повідомлень у запиті (найстаріше відкидається)"),
    "CHAT_PASSPORT_CHARS":    (1500, 200, 6000, "знаків витягу з одного файлу в запиті"),
    "CHAT_PASSPORTS":         (8, 1, 12, "паспортів файлів у запиті"),
    "CHAT_VIDEO_FRAMES":      (6, 1, 8, "кадрів відео в vision-модель"),
    "CHAT_PDF_VISION_PAGES":  (3, 1, 6, "сторінок скану PDF у vision-модель"),
    "CHAT_VISION_IMAGES":     (6, 1, 8, "зображень в одному виклику vision-моделі"),
    "CHAT_VOICE_PER_CONV":    (2, 0, 10, "голосових відповідей на розмову (далі — лише текст; Михайло 23.11.2026)"),
    "CHAT_CONV_TOKENS":       (40000, 2000, 400000, "приблизних токенів на розмову за добу (обидва бекенди)"),
    "CHAT_LOCAL_DAY_CALLS":   (3000, 50, 50000, "викликів локальної моделі на добу"),
    "CHAT_LOCAL_DAY_SECONDS": (21600, 600, 86400, "секунд обчислень локальної моделі на добу (6 год)"),
    "CHAT_API_DAY_TOKENS":    (None, 1000, 5000000, "ОБОВʼЯЗКОВО для CHAT_LLM=api: токенів платного API на добу (рекомендовано 200000)"),
    "CHAT_API_CONV_TOKENS":   (20000, 1000, 200000, "токенів платного API на розмову за добу"),
}


def limits(cfg):
    """→ {ключ: int|None} з межами; CHAT_API_DAY_TOKENS без значення — None (api тоді не вмикається)."""
    out = {}
    for k, (dflt, lo, hi, _) in LIMITS.items():
        raw = cfg.get(k) if cfg is not None else None
        try:
            v = int(float(raw)) if raw not in (None, "") else dflt
        except (TypeError, ValueError):
            v = dflt
        out[k] = None if v is None else max(lo, min(hi, v))
    return out


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
