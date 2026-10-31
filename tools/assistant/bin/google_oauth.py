#!/usr/bin/env python3
"""Google OAuth для помічника на Mac mini (локальний режим без Claude): календар і пошта напряму через Google API.

Без зовнішніх залежностей. Секрети лише в теці ~/.assistant-google/ (або ASSISTANT_GOOGLE_DIR), не в репозиторії:
  client_secret.json — OAuth-клієнт типу «Desktop app» з Google Cloud Console;
  token.json         — створює команда login (refresh-токен; права файлу 600).

  python3 tools/assistant/bin/google_oauth.py login     # один раз: відкриє браузер, дозвіл на календар і пошту
  python3 tools/assistant/bin/google_oauth.py status    # чи є токен і чи оновлюється

Інструкція з налаштування: tools/assistant/bot/README.md, розділ «Локальний режим без Claude».
"""
import json, os, pathlib, secrets, sys, time, urllib.parse, urllib.request, webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send"]
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


class NotConfigured(Exception):
    """Немає client_secret.json / token.json — інтеграцію ще не налаштовано."""


def gdir():
    return pathlib.Path(os.environ.get("ASSISTANT_GOOGLE_DIR") or pathlib.Path.home() / ".assistant-google")


def _client():
    p = gdir() / "client_secret.json"
    if not p.exists():
        raise NotConfigured(f"немає {p}")
    d = json.loads(p.read_text())
    d = d.get("installed") or d.get("web") or d
    return d["client_id"], d["client_secret"]


def _save(tok):
    p = gdir() / "token.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(tok))
    os.chmod(tmp, 0o600)
    tmp.replace(p)


def access_token():
    """Чинний access-токен (оновлює за refresh-токеном). NotConfigured, якщо токена немає."""
    p = gdir() / "token.json"
    if not p.exists():
        raise NotConfigured(f"немає {p} — запустіть google_oauth.py login")
    tok = json.loads(p.read_text())
    if tok.get("access_token") and tok.get("expiry", 0) > time.time() + 60:
        return tok["access_token"]
    cid, csec = tok.get("client_id"), tok.get("client_secret")
    if not (cid and csec):
        cid, csec = _client()
    body = urllib.parse.urlencode({"client_id": cid, "client_secret": csec,
                                   "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=body), timeout=30) as r:
        d = json.load(r)
    tok.update(access_token=d["access_token"], expiry=time.time() + int(d.get("expires_in", 3600)))
    _save(tok)
    return tok["access_token"]


def api(url, method="GET", body=None, timeout=30):
    """Запит до Google API з авторизацією. Повертає JSON."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": "Bearer " + access_token(),
                                          **({"Content-Type": "application/json"} if data else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def login():
    cid, csec = _client()
    state = secrets.token_urlsafe(16)
    got = {}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] == state:
                got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("Готово. Вікно можна закрити.".encode())

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    redirect = f"http://127.0.0.1:{srv.server_port}"
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": " ".join(SCOPES),
        "access_type": "offline", "prompt": "consent", "state": state})
    print("Відкрийте у браузері (якщо не відкрилось саме):\n" + url, flush=True)
    webbrowser.open(url)
    while "code" not in got and "error" not in got:
        srv.handle_request()
    if "error" in got:
        sys.exit("Відмовлено: " + got["error"])
    body = urllib.parse.urlencode({"code": got["code"], "client_id": cid, "client_secret": csec,
                                   "redirect_uri": redirect, "grant_type": "authorization_code"}).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=body), timeout=30) as r:
        d = json.load(r)
    if not d.get("refresh_token"):
        sys.exit("Google не видав refresh_token — відкличте доступ у myaccount.google.com/permissions і повторіть login")
    _save({"client_id": cid, "client_secret": csec, "refresh_token": d["refresh_token"],
           "access_token": d["access_token"], "expiry": time.time() + int(d.get("expires_in", 3600)),
           "scope": d.get("scope", "")})
    print(f"✅ Токен збережено: {gdir() / 'token.json'}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    try:
        if cmd == "login":
            login()
        elif cmd == "status":
            access_token()
            print("✅ Google підключено (токен оновлюється)")
        else:
            sys.exit(__doc__)
    except NotConfigured as e:
        print("❌ Google не налаштовано:", e, file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
