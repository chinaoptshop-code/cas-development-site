"""Фейковий API чату сайту для тестів воркера (поведінка — як functions/api/bot/chat/*.js за контрактом tools/chat/API.md).

Без мережі назовні: http.server на 127.0.0.1 у потоці. Розмови — у памʼяті; тест додає повідомлення відвідувача
(add_user), файли (add_file), перемикає стан (state='staff'), вмикає збої (fail_next = [500, …]).
"""
import base64
import http.server
import json
import threading
import time
import urllib.parse

KEY = "test-key-not-real-0000"


class Conv:
    def __init__(self, sid, lang="uk", page="/", state="bot"):
        self.sid, self.lang, self.page, self.state = sid, lang, page, state
        self.msgs, self.answered, self.lock_until, self.lead = [], 0, 0, None
        self.handoffs = []

    @property
    def last_user_id(self):
        u = [m["id"] for m in self.msgs if m["role"] == "user"]
        return u[-1] if u else 0


class FakeApi:
    def __init__(self, key=KEY):
        self.key, self.convs, self.files, self.n = key, {}, {}, 1000
        self.pings, self.requests, self.replies, self.typing, self.released = 0, [], [], 0, 0
        self.fail_next, self.mx = [], threading.Lock()
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, obj=None, raw=None, ctype="application/json"):
                body = raw if raw is not None else json.dumps(obj or {}).encode()
                self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
                self.end_headers(); self.wfile.write(body)

            def _auth(self):
                with outer.mx:
                    outer.requests.append((self.command, self.path, dict(self.headers)))
                    if outer.fail_next:
                        code = outer.fail_next.pop(0)
                        self._send(code, {"error": "fail"}); return False
                if self.headers.get("X-Bot-Key") != outer.key:
                    self._send(401, {"error": "key"}); return False
                return True

            def do_GET(self):
                if not self._auth():
                    return
                u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
                if u.path == "/api/bot/chat":
                    return self._send(200, {"items": outer._queue(int(q.get("limit", 5)), int(q.get("lock", 120)))})
                if u.path == "/api/bot/chat/file":
                    f = outer.files.get(q.get("id"))
                    return self._send(200, raw=f, ctype="application/octet-stream") if f is not None else self._send(404, {"error": "no"})
                self._send(404, {"error": "path"})

            def do_POST(self):
                if not self._auth():
                    return
                n = int(self.headers.get("Content-Length") or 0)
                d = json.loads(self.rfile.read(n) or b"{}")
                if self.path == "/api/bot/chat/ping":
                    outer.pings += 1; return self._send(200, {"ok": True, "queue": 0, "at": int(time.time())})
                if self.path == "/api/bot/chat":
                    code, obj = outer._post(d); return self._send(code, obj)
                self._send(404, {"error": "path"})

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown(); self.httpd.server_close()

    # ---------- дані тесту ----------
    def conv(self, sid=None, **kw):
        sid = sid or f"{len(self.convs) + 1:032x}"
        self.convs[sid] = Conv(sid, **kw)
        return self.convs[sid]

    def add_user(self, sid, text="", files=()):
        with self.mx:
            self.n += 1
            self.convs[sid].msgs.append({"id": self.n, "role": "user", "text": text, "files": list(files), "at": "2026-11-23 10:00:00"})
            return self.n

    def add_file(self, name, data, kind, mime="application/octet-stream"):
        fid = f"{len(self.files) + 1:024x}"
        self.files[fid] = data
        return {"id": fid, "name": name, "mime": mime, "kind": kind, "size": len(data)}

    # ---------- логіка сервера ----------
    def _queue(self, limit, lock):
        t, out = time.time(), []
        with self.mx:
            for c in self.convs.values():
                if len(out) >= limit:
                    break
                if c.state not in ("bot", "waiting") or c.last_user_id <= c.answered or c.lock_until > t:
                    continue
                c.lock_until = t + lock
                hist = [m for m in c.msgs if not (m["role"] == "user" and m["id"] > c.answered)][-30:]
                pend = [{k: m[k] for k in ("id", "text", "files", "at")} for m in c.msgs if m["role"] == "user" and m["id"] > c.answered]
                out.append({"sid": c.sid, "lang": c.lang, "page": c.page, "state": c.state, "lead": c.lead, "lock_until": int(c.lock_until),
                            "last_user_id": c.last_user_id, "history": hist, "pending": pend})
        return out

    def _post(self, d):
        with self.mx:
            c = self.convs.get(d.get("sid"))
            if not c:
                return 404, {"error": "no conv"}
            if d.get("release") is True:
                c.lock_until = 0; self.released += 1; return 200, {"ok": True, "released": True}
            has = any(k in d for k in ("text", "audio", "estimate"))
            if d.get("typing") is True and not has and not d.get("handoff"):
                if c.state in ("staff", "closed"):
                    return 409, {"state": c.state}
                self.typing += 1; return 200, {"ok": True, "typing": True}
            if c.state in ("staff", "closed"):
                return 409, {"error": "staff", "state": c.state}
            if d.get("reply_to") != c.last_user_id:
                c.lock_until = 0
                return 409, {"conflict": True, "last_user_id": c.last_user_id}
            if d.get("handoff_reason") is not None and d["handoff_reason"] not in ("asks_human", "big_project", "complaint", "complex", "other"):
                return 400, {"error": "handoff_reason"}
            if not (d.get("text") or d.get("audio") or d.get("estimate") or d.get("handoff")):
                return 422, {"error": "empty"}
            if d.get("audio"):
                raw = base64.b64decode(d["audio"]["data"])
                if not raw or len(raw) > 6 * 1024 * 1024:
                    return 413, {"error": "audio"}
            self.n += 1
            m = {"id": self.n, "role": "bot", "text": d.get("text", ""), "files": [], "at": "2026-11-23 10:00:05"}
            if d.get("estimate"):
                m["estimate"] = d["estimate"]
            if d.get("audio"):
                m["audio"] = {"id": "f" * 24, "mime": d["audio"]["mime"], "dur": d["audio"].get("dur")}
            c.msgs.append(m)
            c.answered, c.lock_until = d["reply_to"], 0
            notified = 0
            if d.get("handoff") is True:
                if c.state == "bot" or d.get("renotify"):
                    notified = 2
                c.state = "waiting"
                c.handoffs.append((d.get("handoff_reason"), d.get("reason"), notified))
            self.replies.append(d)
            return 200, {"ok": True, "id": self.n, "state": c.state, "notified": notified}
