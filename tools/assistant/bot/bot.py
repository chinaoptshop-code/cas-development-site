#!/usr/bin/env python3
"""Telegram-бот ↔ Claude Code на Mac mini.

Отримує повідомлення від Михайла через Bot API (long polling, без вебхуків і серверів),
для кожного запускає `claude -p` із сценарієм помічника і відправляє відповідь назад.
Без зовнішніх залежностей: тільки стандартна бібліотека Python 3.9+.

Змінні (див. bot/README.md): ASSISTANT_BOT_TOKEN, ASSISTANT_CHAT_ID, ASSISTANT_MEMORY_DIR,
ASSISTANT_REPO, CLAUDE_BIN, CLAUDE_MODEL, CLAUDE_ALLOWED_TOOLS, CLAUDE_MAX_TURNS.
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.parse, datetime, pathlib, shutil

TOKEN = os.environ.get("ASSISTANT_BOT_TOKEN") or sys.exit("Задайте ASSISTANT_BOT_TOKEN")
OWNER = int(os.environ.get("ASSISTANT_CHAT_ID") or sys.exit("Задайте ASSISTANT_CHAT_ID (ваш числовий id)"))
REPO = pathlib.Path(os.environ.get("ASSISTANT_REPO") or pathlib.Path(__file__).resolve().parents[3])
MEMORY = pathlib.Path(os.environ.get("ASSISTANT_MEMORY_DIR") or pathlib.Path.home() / "assistant-memory")
CLAUDE = os.environ.get("CLAUDE_BIN", "claude")
MODEL = os.environ.get("CLAUDE_MODEL", "sonnet")
MAX_TURNS = os.environ.get("CLAUDE_MAX_TURNS", "25")
ALLOWED = os.environ.get("CLAUDE_ALLOWED_TOOLS",
    "Read,Write,Edit,Glob,Grep,Bash(tools/assistant/*),Bash(tools/telegram/*),Bash(pandoc*),Bash(ffmpeg*),Bash(ls*),Bash(cat*),Bash(date*)")
STATE = MEMORY / ".bot-state.json"
INBOX = MEMORY / "inbox-files"
API = f"https://api.telegram.org/bot{TOKEN}/"
LOG = lambda *a: print(datetime.datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def api(method, **params):
    data = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None}).encode()
    with urllib.request.urlopen(urllib.request.Request(API + method, data=data), timeout=70) as r:
        return json.load(r)["result"]


def send_text(text):
    for i in range(0, len(text), 3900):
        api("sendMessage", chat_id=OWNER, text=text[i:i + 3900])


def send_file(path, caption=""):
    boundary = "----assistant" + str(int(time.time()))
    p = pathlib.Path(path)
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{OWNER}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{caption}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{p.name}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + p.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(API + "sendDocument", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["ok"]


def download(file_id, name):
    info = api("getFile", file_id=file_id)
    INBOX.mkdir(parents=True, exist_ok=True)
    target = INBOX / f"{datetime.datetime.now():%Y%m%d-%H%M%S}-{name}"
    with urllib.request.urlopen(f"https://api.telegram.org/file/bot{TOKEN}/{info['file_path']}", timeout=300) as r, open(target, "wb") as f:
        shutil.copyfileobj(r, f)
    return target


def load_state():
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {"offset": 0, "day": ""}


def save_state(s):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s))


def describe(msg):
    """Повертає (тип, текст/шлях) для повідомлення Telegram."""
    if "text" in msg:
        return "текст", msg["text"]
    if "voice" in msg:
        return "голосове", str(download(msg["voice"]["file_id"], "voice.ogg"))
    if "audio" in msg:
        a = msg["audio"]; return "аудіозапис", str(download(a["file_id"], a.get("file_name") or "audio.mp3"))
    if "document" in msg:
        d = msg["document"]; return "файл", str(download(d["file_id"], d.get("file_name") or "file"))
    if "photo" in msg:
        return "фото", str(download(msg["photo"][-1]["file_id"], "photo.jpg"))
    if "video_note" in msg:
        return "відеоповідомлення", str(download(msg["video_note"]["file_id"], "video.mp4"))
    return "інше", json.dumps(msg, ensure_ascii=False)[:500]


def build_prompt(kind, content, caption):
    return f"""Ти персональний помічник Михайла. Ти працюєш на його Mac mini, це режим «локальний бот».
Правила: прочитай tools/assistant/playbooks/00-core.md і tools/assistant/playbooks/inbox.md (та інші сценарії за потреби).
Пам'ять — локальна папка {MEMORY} (Markdown-файли: 00 Профіль.md, 01 Цілі.md, 02 Задачі.md, 03 Звички і спорт.md,
04 Читання.md, 05 Рішення.md, 06 Люди.md, 07 Компанія.md, Журнал YYYY-MM.md, папки Зустрічі/, Тижні/, Документи/).
Редагуй файли напряму, не через Google Drive. Google Drive, Calendar і Plaud доступні лише якщо підключені як MCP (claude mcp list); записи зустрічей бери через інструменти Plaud, якщо вони є.
Голосові/аудіо розшифровуй: tools/assistant/bin/transcribe.sh <файл>. PDF: tools/assistant/bin/md2pdf.sh.

Нове повідомлення від Михайла ({kind}): {content}
{('Підпис: ' + caption) if caption else ''}

ВАЖЛИВО про відповідь: НЕ викликай tg-out.sh і tg.sh send — відповідь відправлю я. Останнім у своєму виводі напиши
текст відповіді для Telegram (коротко, до 15 рядків, українською). Щоб надіслати файл, додай окремий рядок:
SEND_FILE: /повний/шлях/до/файлу"""


def run_claude(prompt, fresh):
    cmd = [CLAUDE, "-p", "--model", MODEL, "--max-turns", MAX_TURNS, "--allowedTools", ALLOWED, "--output-format", "text"]
    if not fresh:
        cmd.append("--continue")
    cmd.append(prompt)
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=900)
    out = (r.stdout or "").strip()
    if r.returncode != 0 and not out:
        out = f"⚠️ Claude завершився з кодом {r.returncode}: {(r.stderr or '')[-800:]}"
    return out


def handle(msg, state):
    text = msg.get("text") or ""
    if text.startswith("/start"):
        send_text("Привіт, Михайле! Я на зв'язку. Пиши текстом або голосовим. Команди: /new — почати нову розмову, /status."); return
    if text.startswith("/status"):
        send_text(f"Працюю. Модель: {MODEL}. Пам'ять: {MEMORY}. Розмова від {state.get('day') or 'ще не починалась'}."); return
    if text.startswith("/new"):
        state["day"] = ""; send_text("Нова розмова. Пам'ять збережена, контекст чату очищено."); return
    kind, content = describe(msg)
    today = datetime.date.today().isoformat()
    fresh = state.get("day") != today          # нова розмова щодня або після /new
    LOG("→", kind, content[:80])
    api("sendChatAction", chat_id=OWNER, action="typing")
    try:
        out = run_claude(build_prompt(kind, content, msg.get("caption", "")), fresh)
    except subprocess.TimeoutExpired:
        out = "⚠️ Не встиг за 15 хвилин. Спробуй ще раз або розбий запит."
    state["day"] = today
    files = re.findall(r"^SEND_FILE:\s*(.+)$", out, flags=re.M)
    reply = re.sub(r"^SEND_FILE:.*$", "", out, flags=re.M).strip()
    # Відповідь = останній абзац(и) виводу; якщо вивід довгий, беремо хвіст до 3000 символів
    if len(reply) > 3000:
        reply = reply[-3000:]
    send_text(reply or "✅ Зроблено.")
    for f in files:
        f = f.strip().strip("`'\"")
        if os.path.isfile(f):
            send_file(f, pathlib.Path(f).name)
        else:
            send_text(f"⚠️ Файл не знайдено: {f}")
    LOG("←", reply[:80])


def main():
    MEMORY.mkdir(parents=True, exist_ok=True)
    state = load_state()
    me = api("getMe"); LOG(f"бот @{me['username']} запущено; власник {OWNER}; пам'ять {MEMORY}")
    while True:
        try:
            updates = api("getUpdates", offset=state["offset"], timeout=50, allowed_updates='["message"]')
        except Exception as e:
            LOG("getUpdates:", e); time.sleep(5); continue
        for u in updates:
            state["offset"] = u["update_id"] + 1
            msg = u.get("message") or {}
            if msg.get("chat", {}).get("id") != OWNER:
                LOG("ігнорую чужий чат", msg.get("chat", {}).get("id")); continue
            try:
                handle(msg, state)
            except Exception as e:
                LOG("помилка:", repr(e))
                try: send_text(f"⚠️ Помилка: {e}")
                except Exception: pass
            save_state(state)


if __name__ == "__main__":
    main()
