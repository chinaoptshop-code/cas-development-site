"""Облік витрат моделі воркера чату (Михайло 23.11.2026: «зроби якісь обмеження в чаті, щоб мені клієнти всі токени не використали»).

Що рахуємо — на добу (за Києвом, скидання о 00:00) і на розмову: виклики моделі, приблизні токени (api — з `usage` відповіді Anthropic;
local — `prompt_eval_count`/`eval_count` Ollama, а без них — оцінка «символи / 3,5»), секунди обчислень, голосові відповіді.
Файл стану — поза репозиторієм: ~/.cas-chat/usage.json (CHAT_USAGE_FILE). Без особистих даних: розмова — перші 8 знаків sid.
Стелі (config.py, README.md «Ліміти») перевіряє llm.Metered до кожного виклику; `run.py --usage` — що витрачено сьогодні.
"""
import contextlib
import datetime
import json
import os
import pathlib
import threading

try:
    from zoneinfo import ZoneInfo
    KYIV = ZoneInfo("Europe/Kyiv")
except Exception:  # pragma: no cover — стара Python без tzdata
    KYIV = datetime.timezone(datetime.timedelta(hours=2))

DEFAULT_FILE = pathlib.Path.home() / ".cas-chat" / "usage.json"
CHARS_PER_TOKEN = 3.5
_local = threading.local()


def approx_tokens(*texts):
    return int(sum(len(t or "") for t in texts) / CHARS_PER_TOKEN) + 1


def _zero():
    return {"calls": 0, "tokens": 0, "seconds": 0.0}


class Usage:
    def __init__(self, path=None, now=None, max_convs=2000):
        self.path = pathlib.Path(path or os.environ.get("CHAT_USAGE_FILE") or DEFAULT_FILE)
        self.now = now or (lambda: datetime.datetime.now(KYIV))
        self.max_convs = max_convs
        self._mx = threading.Lock()
        self._d = None

    # ---------- стан ----------
    def day(self):
        return self.now().astimezone(KYIV).strftime("%Y-%m-%d")

    def _fresh(self):
        return {"day": self.day(), "local": _zero(), "api": _zero(), "voice": 0, "limited": 0, "convs": {}}

    def _state(self):
        if self._d is None:
            try:
                self._d = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                self._d = None
        if not isinstance(self._d, dict) or self._d.get("day") != self.day():
            self._d = self._fresh()      # нова доба за Києвом — лічильники з нуля
        return self._d

    def _save(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._d, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError:
            pass

    # ---------- поточна розмова (потік воркера) ----------
    @contextlib.contextmanager
    def bind(self, sid):
        prev = getattr(_local, "sid", None)
        _local.sid = (sid or "")[:8] or None
        try:
            yield
        finally:
            _local.sid = prev

    @staticmethod
    def current():
        return getattr(_local, "sid", None)

    # ---------- запис ----------
    def record(self, backend, tokens=0, seconds=0.0, calls=1, sid=None):
        backend = "api" if backend == "api" else "local"
        sid = sid or self.current()
        with self._mx:
            d = self._state()
            b = d[backend]
            b["calls"] += calls; b["tokens"] += int(tokens); b["seconds"] = round(b["seconds"] + float(seconds), 1)
            if sid:
                c = d["convs"].setdefault(sid, {"calls": 0, "tokens": 0, "api_tokens": 0, "seconds": 0.0})
                c["calls"] += calls; c["tokens"] += int(tokens); c["seconds"] = round(c["seconds"] + float(seconds), 1)
                if backend == "api":
                    c["api_tokens"] += int(tokens)
                if len(d["convs"]) > self.max_convs:   # обмежений розмір файлу: найменш витратні розмови — геть
                    for k in sorted(d["convs"], key=lambda k: d["convs"][k]["tokens"])[: len(d["convs"]) - self.max_convs]:
                        d["convs"].pop(k, None)
            self._save()

    def bump(self, key):
        with self._mx:
            d = self._state()
            d[key] = d.get(key, 0) + 1
            self._save()

    # ---------- читання ----------
    def today(self):
        with self._mx:
            return json.loads(json.dumps(self._state()))

    def conv(self, sid=None):
        sid = (sid or self.current() or "")[:8]
        with self._mx:
            return dict(self._state()["convs"].get(sid) or {"calls": 0, "tokens": 0, "api_tokens": 0, "seconds": 0.0})


@contextlib.contextmanager
def nothing():
    yield
