"""Клієнт API чату сайту для воркера (контракт — tools/chat/API.md). Лише стандартна бібліотека.

Помилки: ApiError(status, data). 409 conflict / state, 4xx — без повтору; мережеві помилки й 5xx/429 — повтор із backoff.
Ключ іде лише в заголовку X-Bot-Key і ніде не друкується.
"""
import json
import random
import time
import urllib.error
import urllib.parse
import urllib.request


class ApiError(Exception):
    def __init__(self, status, data=None, msg=""):
        self.status, self.data = status, data or {}
        super().__init__(f"HTTP {status}: {msg or self.data.get('error', '')}"[:200])

    @property
    def conflict(self):
        return self.status == 409 and bool(self.data.get("conflict"))

    @property
    def limited(self):
        """Стеля сайту: розмова ('conv' — далі людина) або доба ('day'); functions/api/bot/chat/index.js."""
        return self.status == 409 and self.data.get("limit") in ("conv", "day")

    @property
    def taken(self):
        """Розмову веде людина / закрито — бот мовчить."""
        return self.status == 409 and self.data.get("state") in ("staff", "closed")


class Api:
    def __init__(self, base, key, timeout=30, retries=3, sleep=time.sleep, ua="cas-chat-worker/1"):
        self.base, self._key, self.timeout, self.retries, self.sleep, self.ua = base.rstrip("/"), key, timeout, retries, sleep, ua
        self.budget = {}

    def _req(self, method, path, body=None, raw=False, max_bytes=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        headers = {"X-Bot-Key": self._key, "User-Agent": self.ua, "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        delay = 1.0
        for attempt in range(self.retries + 1):
            try:
                req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    if raw:
                        return _read_limited(r, max_bytes)
                    txt = r.read().decode("utf-8", "replace")
                    return json.loads(txt) if txt else {}
            except urllib.error.HTTPError as e:
                try:
                    d = json.loads(e.read().decode("utf-8", "replace") or "{}")
                except Exception:
                    d = {}
                if (e.code >= 500 or e.code == 429) and attempt < self.retries:
                    self.sleep(delay + random.random() * 0.5); delay = min(delay * 2, 30); continue
                raise ApiError(e.code, d if isinstance(d, dict) else {}) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                if attempt < self.retries:
                    self.sleep(delay + random.random() * 0.5); delay = min(delay * 2, 30); continue
                raise ApiError(0, {}, f"мережа: {type(e).__name__}") from None

    # --- контракт ---
    def ping(self):
        return self._req("POST", "/api/bot/chat/ping", {})

    def queue(self, limit=2, lock=180):
        """→ розмови; self.budget — залишок добового бюджету сайту ({day_answers_left, day_answers_max} або {})."""
        q = urllib.parse.urlencode({"limit": max(1, min(10, int(limit))), "lock": max(30, min(600, int(lock)))})
        d = self._req("GET", f"/api/bot/chat?{q}") or {}
        self.budget = d.get("budget") or {}
        return d.get("items", [])

    def file(self, fid, max_bytes):
        if not (isinstance(fid, str) and len(fid) == 24 and all(c in "0123456789abcdef" for c in fid)):
            raise ApiError(400, {}, "id файлу")
        return self._req("GET", f"/api/bot/chat/file?id={fid}", raw=True, max_bytes=max_bytes)

    def typing(self, sid):
        return self._req("POST", "/api/bot/chat", {"sid": sid, "typing": True})

    def release(self, sid):
        return self._req("POST", "/api/bot/chat", {"sid": sid, "release": True})

    def reply(self, sid, reply_to, text=None, audio=None, estimate=None, handoff=None, reason=None, renotify=False):
        body = {"sid": sid, "reply_to": int(reply_to)}
        if text:
            body["text"] = text[:8000]
        if audio:
            body["audio"] = audio
        if estimate:
            body["estimate"] = estimate
        if handoff:
            body.update(handoff=True, handoff_reason=handoff)
            if reason:
                body["reason"] = reason[:200]
            if renotify:
                body["renotify"] = True
        return self._req("POST", "/api/bot/chat", body)


class TooBig(Exception):
    pass


def _read_limited(r, max_bytes):
    n = int(r.headers.get("content-length") or 0)
    if max_bytes and n > max_bytes:
        raise TooBig(n)
    out, total = [], 0
    while True:
        chunk = r.read(1 << 16)
        if not chunk:
            break
        total += len(chunk)
        if max_bytes and total > max_bytes:
            raise TooBig(total)
        out.append(chunk)
    return b"".join(out)
