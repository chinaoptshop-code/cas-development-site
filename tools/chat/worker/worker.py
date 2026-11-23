"""Цикл воркера: пінг щохвилини, черга кожні 3–5 с, 1–2 розмови одночасно, відповідь, 409 → нічого (розмова повернеться),
мережеві помилки — backoff, помилка обробки — release. Журнал без особистих даних: sid скорочено, без текстів відвідувачів.
"""
import datetime
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from api import ApiError
from usage import nothing


def short(sid):
    return (sid or "?")[:6]


class Log:
    def __init__(self, debug=False, out=None):
        self.debug, self.out = debug, out

    def __call__(self, *a):
        line = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " " + " ".join(str(x) for x in a)
        if self.out is not None:
            self.out.append(line)
        else:
            print(line, flush=True)


class Heartbeat:
    """«Друкую…» кожні ~60 с, поки йде довга обробка (транскрипція, відео, DWG)."""

    def __init__(self, api, sid, every=55.0, log=None):
        self.api, self.sid, self.every, self.log = api, sid, every, log
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.wait(self.every):
            try:
                self.api.typing(self.sid)
            except ApiError as e:
                if e.taken:
                    return
            except Exception:
                pass

    def __enter__(self):
        try:
            self.api.typing(self.sid)
        except Exception:
            pass
        self._t.start()
        return self

    def __exit__(self, *a):
        self._stop.set()


class Worker:
    def __init__(self, cfg, api, brain, dry=False, log=None, clock=time.monotonic, sleep=time.sleep):
        self.cfg, self.api, self.brain, self.dry = cfg, api, brain, dry
        self.log = log or Log(cfg.on("CHAT_DEBUG"))
        self.clock, self.sleep = clock, sleep
        self.parallel = max(1, min(2, int(cfg.num("CHAT_PARALLEL", 2))))
        self.poll_every = max(3.0, min(5.0, cfg.num("CHAT_POLL", 4)))
        self.ping_every = max(30.0, cfg.num("CHAT_PING", 60))
        self.lock = int(cfg.num("CHAT_LOCK", 180))
        self._busy, self._mx = set(), threading.Lock()
        self._last_ping = -1e9
        self.stats = {"replied": 0, "conflict": 0, "taken": 0, "failed": 0, "limited": 0}
        self.usage = getattr(getattr(brain, "llm", None), "usage", None)   # облік витрат (usage.py) — витрати потоку → ця розмова
        self.printed = []      # --dry: що відповіли б

    # ---------- один крок ----------
    def ping_if_due(self, force=False):
        if force or self.clock() - self._last_ping >= self.ping_every:
            try:
                d = self.api.ping()
                self._last_ping = self.clock()
                return d
            except ApiError as e:
                self.log("ping: помилка", e.status)
        return None

    def poll(self):
        with self._mx:
            free = self.parallel - len(self._busy)
        if free <= 0:
            return []
        try:
            items = self.api.queue(limit=free, lock=self.lock)
        except ApiError as e:
            self.log("черга: помилка", e.status)
            return []
        self._last_ping = self.clock()   # GET черги теж оновлює «живий»
        out = []
        with self._mx:
            for it in items:
                if it.get("sid") and it["sid"] not in self._busy:
                    self._busy.add(it["sid"]); out.append(it)
        return out

    def handle(self, conv):
        sid = conv.get("sid", "")
        t0 = time.time()
        try:
            with Heartbeat(self.api, sid, log=self.log) as hb, (self.usage.bind(sid) if self.usage else nothing()):
                out = self.brain.respond(conv, fetch=lambda f: self.api.file(f["id"], int(self.cfg.num("CHAT_MAX_FILE_MB", 12) * 1024 * 1024)))
            if out is None:
                self.api.release(sid); return "released"
            if self.dry:
                self.printed.append({"sid": short(sid), **out.public()})
                self.api.release(sid)
                self.log(short(sid), "dry: відповідь не надіслано")
                return "dry"
            self.api.reply(sid, conv["last_user_id"], text=out.text, audio=out.audio, estimate=out.estimate,
                           handoff=out.handoff, reason=out.reason, renotify=out.renotify)
            self.stats["replied"] += 1
            if out.handoff == "limit":
                self.stats["limited"] += 1
                if self.usage:
                    self.usage.bump("limited")
            if out.audio and self.usage:
                self.usage.bump("voice")
            self.log(short(sid), "відповідь", f"{time.time() - t0:.1f}с", "handoff=" + (out.handoff or "-"),
                     "est" if out.estimate else "", "audio" if out.audio else "")
            return "replied"
        except ApiError as e:
            if e.conflict:
                self.stats["conflict"] += 1; self.log(short(sid), "409: відвідувач написав ще — розмова повернеться в чергу"); return "conflict"
            if e.taken:
                self.stats["taken"] += 1; self.log(short(sid), "409: розмову веде людина"); return "taken"
            if e.limited:   # стеля сайту (розмова або доба) — відповідь не прийнято, нічого більше не витрачаємо
                self.stats["limited"] += 1; self.log(short(sid), "409: ліміт сайту", e.data.get("limit"))
                if e.data.get("limit") == "day":
                    self._release(sid)
                return "limited"
            self.stats["failed"] += 1; self.log(short(sid), "помилка API", e.status)
            self._release(sid); return "failed"
        except Exception as e:  # обробка впала — розмова одразу знову в черзі
            self.stats["failed"] += 1; self.log(short(sid), "помилка обробки", type(e).__name__)
            self._release(sid); return "failed"
        finally:
            with self._mx:
                self._busy.discard(sid)

    def _release(self, sid):
        try:
            self.api.release(sid)
        except Exception:
            pass

    # ---------- режими ----------
    def once(self):
        """Пінг + одне опитування черги, обробка синхронно. → список результатів."""
        self.ping_if_due(force=True)
        return [self.handle(c) for c in self.poll()]

    def run(self, stop=None):
        stop = stop or threading.Event()
        self.log("воркер запущено:", f"паралельно {self.parallel}, черга кожні {self.poll_every:.0f} с")
        with ThreadPoolExecutor(max_workers=self.parallel) as pool:
            while not stop.is_set():
                self.ping_if_due()
                for conv in self.poll():
                    pool.submit(self.handle, conv)
                stop.wait(self.poll_every)
