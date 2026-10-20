#!/usr/bin/env python3
"""Telegram-бот ↔ Claude Code на Mac mini.

Отримує повідомлення від Михайла через Bot API (long polling, без вебхуків і серверів),
для кожного запускає `claude -p` із сценарієм помічника і відправляє відповідь назад.
Без зовнішніх залежностей: тільки стандартна бібліотека Python 3.9+.

Змінні (див. bot/README.md): ASSISTANT_BOT_TOKEN, ASSISTANT_CHAT_ID, ASSISTANT_MEMORY_DIR,
ASSISTANT_REPO, CLAUDE_BIN, CLAUDE_MODEL, CLAUDE_ALLOWED_TOOLS, CLAUDE_MAX_TURNS.
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.parse, datetime, pathlib, shutil, uuid

TOKEN = os.environ.get("ASSISTANT_BOT_TOKEN") or sys.exit("Задайте ASSISTANT_BOT_TOKEN")
OWNER = int(os.environ.get("ASSISTANT_CHAT_ID") or sys.exit("Задайте ASSISTANT_CHAT_ID (ваш числовий id)"))
REPO = pathlib.Path(os.environ.get("ASSISTANT_REPO") or pathlib.Path(__file__).resolve().parents[3])
MEMORY = pathlib.Path(os.environ.get("ASSISTANT_MEMORY_DIR") or pathlib.Path.home() / "assistant-memory")
CLAUDE = os.environ.get("CLAUDE_BIN", "claude")
MODEL = os.environ.get("CLAUDE_MODEL", "sonnet")
MAX_TURNS = os.environ.get("CLAUDE_MAX_TURNS", "25")
ALLOWED = os.environ.get("CLAUDE_ALLOWED_TOOLS",
    "Read,Write,Edit,Glob,Grep,Bash(tools/assistant/*),Bash(tools/telegram/*),Bash(pandoc*),Bash(ffmpeg*),Bash(ls*),Bash(cat*),Bash(date*)")
# Робочі групи команди: бот відповідає там, лише коли його тегнули або відповіли на його повідомлення.
# Задачу виконує тільки після кнопки «В роботу» від Михайла. Типово — CAS Design.
GROUPS = {int(x) for x in os.environ.get("ASSISTANT_GROUPS", "-1003501825627").split(",") if x.strip()}
# У групі відповідь бачить уся команда — тому без пошти й особистого Telegram Михайла.
GROUP_ALLOWED = ",".join(t for t in re.split(r",\s*", ALLOWED)
                         if t and not t.startswith("mcp__claude_ai_Gmail") and "tools/telegram" not in t)
TEAM_TASKS = MEMORY / "02 Задачі команди.md"
STATE = MEMORY / ".bot-state.json"
INBOX = MEMORY / "inbox-files"
API = f"https://api.telegram.org/bot{TOKEN}/"
LOG = lambda *a: print(datetime.datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def api(method, **params):
    data = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None}).encode()
    with urllib.request.urlopen(urllib.request.Request(API + method, data=data), timeout=70) as r:
        return json.load(r)["result"]


def send_text(text, chat=None, reply_to=None, markup=None):
    chunks = [text[i:i + 3900] for i in range(0, len(text), 3900)] or [""]
    sent = None
    for n, part in enumerate(chunks):
        last = n == len(chunks) - 1
        sent = api("sendMessage", chat_id=chat or OWNER, text=part,
                   reply_to_message_id=reply_to if n == 0 else None,
                   allow_sending_without_reply="true" if reply_to else None,
                   reply_markup=json.dumps(markup) if markup and last else None)
    return sent


def send_file(path, caption="", chat=None):
    boundary = "----assistant" + str(int(time.time()))
    p = pathlib.Path(path)
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat or OWNER}\r\n"
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
Голосові/аудіо розшифровуй: tools/assistant/bin/transcribe.sh <файл>.
PDF ти вмієш робити сам: запиши текст у Markdown-файл у ~/.assistant/tmp, запусти
tools/assistant/bin/md2pdf.sh <файл.md> і додай рядок SEND_FILE з шляхом до PDF. Ніколи не пиши,
що надіслав файл, якщо команда не повернула шлях до нього.

Нове повідомлення від Михайла ({kind}): {content}
{('Підпис: ' + caption) if caption else ''}

ВАЖЛИВО про відповідь: НЕ викликай tg-out.sh і tg.sh send — відповідь відправлю я. Останнім у своєму виводі напиши
текст відповіді для Telegram (коротко, до 15 рядків, українською). Щоб надіслати файл, додай окремий рядок:
SEND_FILE: /повний/шлях/до/файлу"""


def run_claude(prompt, session, resume, tools=ALLOWED):
    """session — id розмови. Михайло веде одну розмову на день (resume), задачі команди — кожна окремо.
    Раніше тут був --continue, і задача з групи ставала «останньою розмовою» — Михайло продовжив би її."""
    cmd = [CLAUDE, "-p", "--model", MODEL, "--max-turns", MAX_TURNS, "--allowedTools", tools, "--output-format", "text"]
    cmd += ["--resume", session] if resume else ["--session-id", session]
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
        state["day"] = ""; state.pop("sid", None); send_text("Нова розмова. Пам'ять збережена, контекст чату очищено."); return
    kind, content = describe(msg)
    t = state.get("tasks", {}).get(str(state.get("editing") or ""))
    if t and t.get("status") == "draft":                    # Михайло пише правки до чернетки для групи
        state.pop("editing", None)
        revise_task(t, kind, content, state); return
    today = datetime.date.today().isoformat()
    fresh = state.get("day") != today or not state.get("sid")   # нова розмова щодня або після /new
    if fresh:
        state["sid"] = str(uuid.uuid4())
    LOG("→", kind, content[:80])
    api("sendChatAction", chat_id=OWNER, action="typing")
    try:
        out = run_claude(build_prompt(kind, content, msg.get("caption", "")), state["sid"], not fresh)
    except subprocess.TimeoutExpired:
        out = "⚠️ Не встиг за 15 хвилин. Спробуй ще раз або розбий запит."
    state["day"] = today
    deliver(out)


def split_out(out):
    files = [f.strip().strip("`'\"") for f in re.findall(r"^SEND_FILE:\s*(.+)$", out, flags=re.M)]
    reply = re.sub(r"^SEND_FILE:.*$", "", out, flags=re.M).strip()
    # Відповідь = останній абзац(и) виводу; якщо вивід довгий, беремо хвіст до 3000 символів
    return (reply[-3000:] if len(reply) > 3000 else reply), files


def deliver(out, chat=None, reply_to=None):
    reply, files = split_out(out)
    send_text(reply or "✅ Зроблено.", chat, reply_to)
    for f in files:
        if os.path.isfile(f):
            send_file(f, pathlib.Path(f).name, chat)
        else:
            send_text(f"⚠️ Файл не знайдено: {f}", chat)
    LOG("←", reply[:80])


# ---------- робоча група команди ----------
ME = {}
HELP_RE = re.compile(r"(команд|що ти (вмієш|можеш)|що вмієш|що можеш|допомог|help|/start|/help)", re.I)


def help_text():
    u = ME.get("username", "бот")
    return f"""Я — AI-асистент Михайла. Ось що можу для команди:

• знайти й порівняти постачальників, підрядників, ціни (інтернет, наші контакти)
• підготувати документ: лист, ТЗ, порівняльну таблицю, PDF
• прочитати файл чи фото, розшифрувати голосове — надішліть його з тегом у підписі
• зібрати інфо по обʼєкту з наших нотаток
• поставити зустріч чи нагадування в календар Михайла

Як поставити задачу: @{u} + що зробити одним повідомленням.
Наприклад: @{u} знайди 3 постачальники травертину для фасаду, ціна за м²

Кожну задачу спершу погоджує Михайло — після його ОК беру в роботу.
Готову відповідь він теж переглядає, і лише потім вона зʼявляється тут
у відповідь на ваше повідомлення.
Питання на кшталт «що ти вмієш» — відповідаю одразу, без погодження."""


def addressed(msg):
    """Повертає текст без тега, якщо звертаються до бота; інакше None."""
    u = "@" + ME.get("username", "").lower()
    text = msg.get("text") or msg.get("caption") or ""
    to_bot = (msg.get("reply_to_message") or {}).get("from", {}).get("id") == ME.get("id")
    if u.lower() in text.lower():
        return re.sub(re.escape(u), "", text, flags=re.I).strip(" ,:—-\n")
    if to_bot or (text.startswith("/") and text.split()[0].split("@")[0] in ("/help", "/start")):
        return text.strip()
    return None


def who(m):
    f = m.get("from", {})
    return (f.get("first_name", "") + " " + f.get("last_name", "")).strip() or f.get("username") or "?"


def handle_group(msg, state):
    text = addressed(msg)
    if text is None:
        return
    chat, mid = msg["chat"]["id"], msg["message_id"]
    if not text or HELP_RE.search(text) and len(text) < 80:
        send_text(help_text(), chat, mid); LOG("група: довідка", who(msg)); return
    tasks = state.setdefault("tasks", {})
    state["task_n"] = n = state.get("task_n", 0) + 1
    att = ""
    if any(k in msg for k in ("photo", "document", "voice", "audio", "video_note")):
        kind, path = describe(msg)
        att = f"{kind}: {path}"
    t = {"n": n, "chat": chat, "mid": mid, "from": who(msg), "text": text, "att": att,
         "group": msg["chat"].get("title", ""), "at": datetime.datetime.now().strftime("%d.%m %H:%M")}
    tasks[str(n)] = t
    for k in sorted(tasks, key=int)[:-50]:               # тримаємо останні 50
        tasks.pop(k)
    with TEAM_TASKS.open("a", encoding="utf-8") as f:
        f.write(f"- №{n} · {t['at']} · {t['from']} ({t['group']}): {text}{' [' + att + ']' if att else ''} — на погодженні\n")
    LOG("група: задача", n, t["from"], text[:60])
    if msg.get("from", {}).get("id") == OWNER:             # задачу ставить сам Михайло — погоджувати нема кого
        t["own"] = True; start_task(t, state); return
    send_text(f"📌 Задача №{n} прийнята: «{text[:200]}»\nПередав Михайлу на погодження — візьму в роботу після його ОК.", chat, mid)
    sent = send_text(f"📌 Задача №{n} від {t['from']} ({t['group']}):\n{text}" + (f"\n📎 {att}" if att else ""),
                     markup={"inline_keyboard": [[{"text": "✅ В роботу", "callback_data": f"ok:{n}"},
                                                  {"text": "❌ Відхилити", "callback_data": f"no:{n}"}]]})
    t["owner_mid"] = sent["message_id"] if sent else None


def on_button(cq, state):
    if cq.get("from", {}).get("id") != OWNER:
        api("answerCallbackQuery", callback_query_id=cq["id"], text="Погоджує лише Михайло"); return
    act, _, n = (cq.get("data") or "").partition(":")
    t = state.get("tasks", {}).get(n)
    if act in ("send", "edit", "drop"):
        draft_button(act, t, cq, state); return
    if not t or t.get("status"):
        api("answerCallbackQuery", callback_query_id=cq["id"], text="Вже оброблено" if t else "Задачу не знайдено"); return
    m = cq.get("message", {})
    if act == "ok":
        api("answerCallbackQuery", callback_query_id=cq["id"], text="Беру в роботу")
        api("editMessageText", chat_id=OWNER, message_id=m.get("message_id"), text=(m.get("text") or "") + "\n\n✅ Погоджено — в роботі")
        start_task(t, state)
    else:
        t["status"] = "rejected"
        api("answerCallbackQuery", callback_query_id=cq["id"], text="Відхилено")
        api("editMessageText", chat_id=OWNER, message_id=m.get("message_id"), text=(m.get("text") or "") + "\n\n❌ Відхилено")
        send_text(f"Задача №{t['n']}: Михайло поки не погодив — він уточнить особисто.", t["chat"], t["mid"])
        mark(t, "відхилено")


def mark(t, status):
    try:
        s = TEAM_TASKS.read_text(encoding="utf-8")
        TEAM_TASKS.write_text(re.sub(rf"^(- №{t['n']} · .*) — (на погодженні|в роботі|чернетка у Михайла)$", rf"\1 — {status}", s, flags=re.M), encoding="utf-8")
    except Exception as e:
        LOG("mark:", e)


def start_task(t, state):
    resumed = t.get("status") == "work"
    t["status"] = "work"; save_state(state); mark(t, "в роботі")
    send_text(f"▶️ Задача №{t['n']} — " + ("продовжую після перезапуску." if resumed else "в роботі."), t["chat"], t["mid"])
    api("sendChatAction", chat_id=t["chat"], action="typing")
    prompt = f"""Ти AI-асистент Михайла (CAS Development) у робочій групі команди «{t['group']}».
Правила: прочитай tools/assistant/playbooks/00-core.md. Пам'ять — локальна папка {MEMORY}.
Задачу поставив {t['from']} із команди, Михайло її погодив. Виконай її до кінця.
{('Вкладення (' + t['att'] + ') — прочитай його; голосові розшифровуй tools/assistant/bin/transcribe.sh <файл>.') if t['att'] else ''}
PDF: запиши Markdown у ~/.assistant/tmp, запусти tools/assistant/bin/md2pdf.sh <файл.md> і додай рядок SEND_FILE.

ВІДПОВІДЬ ПОБАЧИТЬ УСЯ ГРУПА. Не розкривай особисте Михайла (здоровʼя, сімʼя, фінанси, борги), суми договорів
і контакти клієнтів поза задачею, закупівельні ціни бригад і нашу націнку (price-contractor). Не пиши й не надсилай
листів і повідомлень іншим людям — лише результат сюди. Нічого не вигадуй: чого не знайшов — так і скажи.

Задача №{t['n']}: {t['text']}

НЕ викликай tg-out.sh і tg.sh send — відповідь відправлю я. Останнім у виводі напиши текст відповіді
для групи (до 20 рядків, українською, звертайся до {t['from']}). Файл — окремим рядком: SEND_FILE: /повний/шлях"""
    t["sid"] = str(uuid.uuid4())
    try:
        out = run_claude(prompt, t["sid"], False, GROUP_ALLOWED)
    except subprocess.TimeoutExpired:
        out = "⚠️ Не встиг за 15 хвилин. Розбийте задачу на менші частини."
    if t.get("own"):                                       # задача самого Михайла — одразу в групу
        deliver(f"✅ Задача №{t['n']}\n\n" + out, t["chat"], t["mid"])
        t["status"] = "done"; mark(t, "виконано"); return
    show_draft(t, out)


def show_draft(t, out):
    """Відповідь для групи спершу йде Михайлу: надіслати, поправити чи не надсилати."""
    t["draft"] = out; t["status"] = "draft"; mark(t, "чернетка у Михайла")
    reply, files = split_out(out)
    send_text(f"📝 Чернетка для {t['group']} · задача №{t['n']} від {t['from']}:\n\n{reply or '(порожньо)'}"
              + (f"\n\n📎 файли: {', '.join(pathlib.Path(f).name for f in files)}" if files else ""),
              markup={"inline_keyboard": [[{"text": "📤 Надіслати", "callback_data": f"send:{t['n']}"},
                                           {"text": "✏️ Редагувати", "callback_data": f"edit:{t['n']}"},
                                           {"text": "🚫 Не надсилати", "callback_data": f"drop:{t['n']}"}]]})
    for f in files:
        if os.path.isfile(f):
            send_file(f, pathlib.Path(f).name)


def draft_button(act, t, cq, state):
    if not t or t.get("status") != "draft":
        api("answerCallbackQuery", callback_query_id=cq["id"], text="Вже оброблено" if t else "Задачу не знайдено"); return
    m = cq.get("message", {})
    note = {"send": "📤 Надіслано в групу", "edit": "✏️ Чекаю правки", "drop": "🚫 Не надіслано"}[act]
    api("answerCallbackQuery", callback_query_id=cq["id"], text=note)
    try:
        api("editMessageText", chat_id=OWNER, message_id=m.get("message_id"), text=(m.get("text") or "")[:3900 - 40] + "\n\n" + note)
    except Exception as e:
        LOG("editMessageText:", e)
    if act == "send":
        deliver(f"✅ Задача №{t['n']}\n\n" + t["draft"], t["chat"], t["mid"])
        t["status"] = "done"; mark(t, "виконано")
    elif act == "edit":
        state["editing"] = t["n"]
        send_text(f"Що змінити у відповіді на задачу №{t['n']}? Напиши текстом або голосовим.")
    else:
        t["status"] = "dropped"; mark(t, "не надіслано")
        send_text(f"Задача №{t['n']}: Михайло відповість особисто.", t["chat"], t["mid"])


def revise_task(t, kind, content, state):
    api("sendChatAction", chat_id=OWNER, action="typing")
    how = (f"голосове — спершу розшифруй: tools/assistant/bin/transcribe.sh {content}" if kind == "голосове"
           else f"{kind}: {content}")
    prompt = f"""Михайло прочитав чернетку відповіді для групи і просить змінити її ({how}).
Врахуй правки, правила ті самі (відповідь побачить уся група). Поверни нову ПОВНУ відповідь для групи
останнім у виводі; файли — рядками SEND_FILE."""
    try:
        out = run_claude(prompt, t["sid"], True, GROUP_ALLOWED)
    except subprocess.TimeoutExpired:
        out = t["draft"]; send_text("⚠️ Не встиг переробити за 15 хвилин — лишаю попередню чернетку.")
    show_draft(t, out)


def main():
    MEMORY.mkdir(parents=True, exist_ok=True)
    state = load_state()
    global ME
    ME = api("getMe"); LOG(f"бот @{ME['username']} запущено; власник {OWNER}; групи {sorted(GROUPS)}; пам'ять {MEMORY}")
    for t in [t for t in state.get("tasks", {}).values() if t.get("status") == "work"]:
        LOG("продовжую обірвану задачу", t["n"])                # перезапуск бота посеред роботи
        try:
            start_task(t, state); save_state(state)
        except Exception as e:
            LOG("задача", t["n"], "не відновилась:", repr(e)); t["status"] = "error"; save_state(state)
    while True:
        try:
            updates = api("getUpdates", offset=state["offset"], timeout=50, allowed_updates='["message","callback_query"]')
        except Exception as e:
            LOG("getUpdates:", e); time.sleep(5); continue
        for u in updates:
            state["offset"] = u["update_id"] + 1
            msg = u.get("message") or {}
            chat = msg.get("chat", {}).get("id")
            try:
                if "callback_query" in u:
                    on_button(u["callback_query"], state)
                elif chat in GROUPS:
                    handle_group(msg, state)
                elif chat != OWNER:
                    LOG("ігнорую чужий чат", chat); continue
                else:
                    handle(msg, state)
            except Exception as e:
                LOG("помилка:", repr(e))
                try: send_text(f"⚠️ Помилка: {e}")
                except Exception: pass
            save_state(state)


if __name__ == "__main__":
    main()
