#!/usr/bin/env python3
"""Gmail напряму (без Claude і MCP) — для локального режиму помічника на Mac mini.

  gmail.py unread [--limit 10] [--days 1] [--json]     непрочитане у «Вхідних» (лише заголовки)
  gmail.py send --to A --subject S --body-file F --confirmed <id>
                                                       надіслати ОДИН лист; --confirmed ставить лише бот
                                                       після кнопки «Надіслати» в Telegram
  gmail.py send-queue <назва>                          автоматичне надсилання — лише з погодженої черги

Правила надсилання (діють для всіх шляхів, перевіряються тут, перед API):
  • ліміт ASSISTANT_MAIL_DAILY_LIMIT (30) листів на добу;
  • адреса/домен зі списку ~/.assistant-state/do-not-contact.txt — відмова;
  • кожна спроба (надіслано/відмова/помилка) — рядок у журналі ~/.assistant-state/mail-log.jsonl;
  • черга <назва> працює, лише якщо назва є в ~/.assistant-state/mail-approved-queues.txt (погодив Михайло);
    листи черги — ~/.assistant-state/mail-queues/<назва>.jsonl, по рядку {"to","subject","body"}.
Токен: ~/.assistant-google/token.json (google_oauth.py login). Коди: 0 гаразд, 2 відмова за правилами,
3 пошту не підключено, 4 помилка API/мережі.
"""
import base64, datetime, email.message, email.utils, json, os, pathlib, sys, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import google_oauth  # noqa: E402

API = "https://gmail.googleapis.com/gmail/v1/users/me"


def state_dir():
    return pathlib.Path(os.environ.get("ASSISTANT_STATE_DIR") or pathlib.Path.home() / ".assistant-state")


def daily_limit():
    return int(os.environ.get("ASSISTANT_MAIL_DAILY_LIMIT", "30"))


class Refused(Exception):
    """Лист не надсилається за правилами (ліміт, do-not-contact, непогоджена черга)."""


# ---------- правила ----------
def do_not_contact():
    p = state_dir() / "do-not-contact.txt"
    if not p.exists():
        return set()
    return {l.strip().lower() for l in p.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")}


def blocked(addr):
    """True, якщо адреса або її домен (@domain чи domain) у списку do-not-contact."""
    a = email.utils.parseaddr(addr)[1].lower()
    dom = a.rsplit("@", 1)[-1]
    dnc = do_not_contact()
    return a in dnc or dom in dnc or ("@" + dom) in dnc


def log(entry):
    p = state_dir() / "mail-log.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    entry = {"t": datetime.datetime.now().isoformat(timespec="seconds"), **entry}
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def sent_today():
    p = state_dir() / "mail-log.jsonl"
    if not p.exists():
        return 0
    today = datetime.date.today().isoformat()
    n = 0
    for l in p.read_text(encoding="utf-8").splitlines():
        try:
            j = json.loads(l)
        except ValueError:
            continue
        n += j.get("status") == "sent" and j.get("t", "").startswith(today)
    return n


def check(to):
    if not email.utils.parseaddr(to)[1] or "@" not in to:
        raise Refused(f"некоректна адреса: {to}")
    if blocked(to):
        raise Refused(f"{to} у списку do-not-contact")
    if sent_today() >= daily_limit():
        raise Refused(f"денний ліміт {daily_limit()} листів вичерпано")


# ---------- API ----------
def _send_raw(raw):
    return google_oauth.api(API + "/messages/send", "POST", {"raw": raw})


def send(to, subject, body, source):
    """Перевіряє правила, надсилає, пише журнал. Refused — якщо не можна."""
    try:
        check(to)
    except Refused as e:
        log({"status": "refused", "to": to, "subject": subject, "source": source, "why": str(e)})
        raise
    m = email.message.EmailMessage()
    m["To"], m["Subject"] = to, subject
    m.set_content(body)
    raw = base64.urlsafe_b64encode(m.as_bytes()).decode()
    try:
        r = _send_raw(raw)
    except Exception as e:
        log({"status": "error", "to": to, "subject": subject, "source": source, "why": repr(e)[:200]})
        raise
    log({"status": "sent", "to": to, "subject": subject, "source": source, "id": r.get("id", "")})
    return r.get("id", "")


def unread(limit=10, days=1):
    q = urllib.parse.urlencode({"q": f"is:unread in:inbox newer_than:{days}d", "maxResults": str(limit)})
    ids = [m["id"] for m in google_oauth.api(f"{API}/messages?{q}").get("messages", [])]
    out = []
    for i in ids:
        d = google_oauth.api(f"{API}/messages/{i}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date")
        h = {x["name"].lower(): x["value"] for x in d.get("payload", {}).get("headers", [])}
        out.append({"id": i, "from": h.get("from", ""), "subject": h.get("subject", "(без теми)"),
                    "date": h.get("date", ""), "snippet": d.get("snippet", "")[:160]})
    return out


def approved_queues():
    p = state_dir() / "mail-approved-queues.txt"
    return {l.strip() for l in p.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")} if p.exists() else set()


def send_queue(name):
    if name not in approved_queues():
        raise Refused(f"черга «{name}» не погоджена (додайте назву в mail-approved-queues.txt)")
    p = state_dir() / "mail-queues" / f"{name}.jsonl"
    if not p.exists():
        return 0, 0
    rows = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    ok = skipped = 0
    for r in rows:
        if r.get("sent"):
            continue
        try:
            send(r["to"], r["subject"], r["body"], f"queue:{name}")
            r["sent"] = datetime.datetime.now().isoformat(timespec="seconds"); ok += 1
        except Refused as e:
            r["refused"] = str(e); skipped += 1
            if "ліміт" in str(e):
                break
    p.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    return ok, skipped


def _arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if cmd == "unread":
            rows = unread(int(_arg("--limit", 10)), int(_arg("--days", 1)))
            if "--json" in sys.argv:
                print(json.dumps(rows, ensure_ascii=False, indent=1))
            elif not rows:
                print("Непрочитаних листів за добу немає.")
            else:
                for r in rows:
                    print(f"• {email.utils.parseaddr(r['from'])[0] or r['from']}: {r['subject']}")
        elif cmd == "send":
            if not _arg("--confirmed"):
                print("Відмова: лист надсилається лише після кнопки «Надіслати» (--confirmed <id>).", file=sys.stderr)
                sys.exit(2)
            body = pathlib.Path(_arg("--body-file")).read_text(encoding="utf-8")
            mid = send(_arg("--to"), _arg("--subject", ""), body, "button:" + _arg("--confirmed"))
            print(f"надіслано {mid}")
        elif cmd == "send-queue":
            ok, skipped = send_queue(sys.argv[2])
            print(f"черга {sys.argv[2]}: надіслано {ok}, пропущено {skipped}")
        else:
            sys.exit(__doc__)
    except Refused as e:
        print("Відмова:", e, file=sys.stderr)
        sys.exit(2)
    except google_oauth.NotConfigured as e:
        print(f"Пошту не підключено на цьому компʼютері ({e}).", file=sys.stderr)
        sys.exit(3)
    except Exception as e:
        print(f"Пошта недоступна: {e!r}"[:300], file=sys.stderr)
        sys.exit(4)


if __name__ == "__main__":
    main()
