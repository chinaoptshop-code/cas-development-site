#!/usr/bin/env python3
"""Telegram-бот ↔ Claude Code на Mac mini.

Отримує повідомлення від Михайла через Bot API (long polling, без вебхуків і серверів),
для кожного запускає `claude -p` із сценарієм помічника і відправляє відповідь назад.
Без зовнішніх залежностей: тільки стандартна бібліотека Python 3.9+.

Змінні (див. bot/README.md): ASSISTANT_BOT_TOKEN, ASSISTANT_CHAT_ID, ASSISTANT_MEMORY_DIR,
ASSISTANT_REPO, CLAUDE_BIN, CLAUDE_MODEL, CLAUDE_ALLOWED_TOOLS, CLAUDE_MAX_TURNS.
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.parse, datetime, pathlib, shutil, uuid

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
# Клієнту — без памʼяті й файлів Михайла: лише веб (наш сайт) і читання вкладення з inbox-files.
CLIENT_ALLOWED = "WebFetch,WebSearch,Read(" + str(MEMORY / "inbox-files") + "/**)"
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
Голосове ГОЛОСОМ МИХАЙЛА (комусь із його акаунта чи йому): tools/assistant/bin/voice-clone.sh "текст" → шлях .ogg,
далі tools/telegram/tg.sh send-voice <чат> <файл>. НІКОЛИ не tg.sh say — там чужий жіночий голос Google.
PDF ти вмієш робити сам: запиши текст у Markdown-файл у ~/.assistant/tmp, запусти
tools/assistant/bin/md2pdf.sh <файл.md> (напряму, без «bash» попереду) і додай рядок SEND_FILE з шляхом до PDF. Ніколи не пиши,
що надіслав файл, якщо команда не повернула шлях до нього.

Зараз {datetime.datetime.now():%Y-%m-%d %H:%M} ({['пн','вт','ср','чт','пт','сб','нд'][datetime.datetime.now().weekday()]}). Між 00:00 і 05:00 «завтра» від Михайла = сьогоднішня дата (див. 00-core.md «Дати в задачах»).
Нове повідомлення від Михайла ({kind}): {content}
{('Підпис: ' + caption) if caption else ''}

ВАЖЛИВО про відповідь: НЕ викликай tg-out.sh і tg.sh send — відповідь відправлю я. Останнім у своєму виводі напиши
текст відповіді для Telegram (коротко, до 15 рядків, українською). Обгорни її рядками ===ВІДПОВІДЬ=== і ===КІНЕЦЬ===,
без Markdown (** і ``` Telegram не малює). Якщо щось не вдалось (інструмент, файл) — коротко скажи про це в самій відповіді. Щоб надіслати файл, додай окремий рядок:
SEND_FILE: /повний/шлях/до/файлу"""


def run_claude(prompt, session, resume, tools=ALLOWED, turns=None, _final=False):
    """session — id розмови. Михайло веде одну розмову на день (resume), задачі команди — кожна окремо.
    Раніше тут був --continue, і задача з групи ставала «останньою розмовою» — Михайло продовжив би її."""
    cmd = [CLAUDE, "-p", "--model", MODEL, "--max-turns", str(turns or MAX_TURNS), "--allowedTools", tools, "--output-format", "text"]
    cmd += ["--resume", session] if resume else ["--session-id", session]
    cmd.append(prompt)
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=900)
    out = (r.stdout or "").strip()
    if "Reached max turns" in out and not _final:
        # 20.10: задача про шпон вичерпала кроки на пошуках і віддала «Error: Reached max turns» замість відповіді.
        # Підсумовуємо в тій самій розмові вже знайдене — без нових пошуків.
        LOG("ліміт кроків — прошу підсумок", session[:8])
        return run_claude("Ліміт кроків вичерпано. Нічого більше не шукай і не відкривай — дай підсумкову відповідь "
                          "з того, що вже знайшов, у потрібному форматі; чого не встиг — так і напиши.",
                          session, True, tools, 4, True)
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
    sess = pathlib.Path.home() / ".claude/projects" / str(REPO).replace("/", "-") / f"{state.get('sid')}.jsonl"
    if not fresh and sess.exists() and sess.stat().st_size > 1_500_000:  # >1,5 МБ — відповіді сповільнюються
        LOG("розмова розрослась", sess.stat().st_size // 1024, "КБ — починаю нову (памʼять у файлах)")
        fresh = True
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
    # Михайлу голосом — коли він сам говорив голосом або попросив («голосом», «озвуч»), без ліміту довжини
    # «моїм голосом» / «запиши Сержу голосом» — це про чужі голосові, а не прохання відповісти голосом тобі
    asked = kind == "текст" and re.search(r"(відповідай|відповідь|скажи|розкажи|поясни)\s+голосом|голосом\s+(відповідай|скажи)|^озвуч", content.strip(), re.I)
    if kind == "голосове" or asked:
        import threading                                     # озвучення паралельно — наступне повідомлення не чекає
        threading.Thread(target=speak_owner, args=(split_out(out)[0],), daemon=True).start()


ANSWER_RULE = ("Саму відповідь обгорни рядками ===ВІДПОВІДЬ=== і ===КІНЕЦЬ=== — усе поза ними (хід роботи, "
               "проблеми з інструментами, пояснення для мене) отримувач не побачить. Без Markdown: без ** і ```, "
               "Telegram їх не малює.")


# ---------- відповіді клієнтам без підписки Claude ----------
# Клієнтам відповідаємо через Anthropic API (оплата за використання, як у бота CAS), а якщо API
# недоступний — локальною моделлю Ollama на Mac mini. Підписка Claude (claude -p) — лише для Михайла й команди.
API_ENV = pathlib.Path.home() / "jarvis/projects/quiz/.env"
CLIENT_MODEL = os.environ.get("ASSISTANT_CLIENT_MODEL", "claude-sonnet-5")
# Локальні моделі по черзі: qwen3:8b на SSD (окремий сервер :11435), запас — qwen3:4b на внутрішньому диску (:11434)
LOCAL_MODELS = [("http://127.0.0.1:11435", "qwen3:8b"), ("http://127.0.0.1:11434", os.environ.get("ASSISTANT_LOCAL_MODEL", "qwen3:4b"))]


def api_key():
    for line in (API_ENV.read_text().splitlines() if API_ENV.exists() else []):
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("ANTHROPIC_API_KEY", "")


def client_answer(prompt):
    """Текст відповіді клієнту: API → локальна модель → чесна заглушка."""
    key = api_key()
    if key:
        try:
            body = {"model": CLIENT_MODEL, "max_tokens": 900, "messages": [{"role": "user", "content": prompt}]}
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                         headers={"content-type": "application/json", "x-api-key": key,
                                                  "anthropic-version": "2023-06-01"})
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            text = "".join(c.get("text", "") for c in d.get("content", []) if c.get("type") == "text").strip()
            if text:
                LOG("клієнт: відповідь через API", CLIENT_MODEL)
                return text
        except Exception as e:
            LOG("клієнт: API не відповів:", repr(e)[:200])
    for host, model in LOCAL_MODELS:
        try:
            guard = ("\n\nВАЖЛИВО: не рахуй жодних сум і не переводь у гривні — локальна модель помиляється в арифметиці. "
                     "Називай лише ціни «від» за м² з переліку вище, без підсумків. /no_think")
            body = {"model": model, "prompt": prompt + guard, "stream": False, "options": {"temperature": 0.2}}
            req = urllib.request.Request(host + "/api/generate", data=json.dumps(body).encode(),
                                         headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=240) as r:
                text = re.sub(r"<think>.*?</think>", "", json.load(r).get("response", ""), flags=re.S).strip()
            if text:
                LOG("клієнт: відповідь локальною моделлю", model)
                return "(відповідь локальної моделі — перевір уважніше)\n" + text
        except Exception as e:
            LOG("клієнт: локальна модель", model, "не відповіла:", repr(e)[:150])
    return "===ВІДПОВІДЬ===\nДякую за звернення! Михайло відповість вам особисто найближчим часом.\n===КІНЕЦЬ==="


# ---------- голос (як у бота CAS) ----------
# Голосом — лише у відповідь на голосове і лише коротке (≈15 с), щоб не «жерло». Gemini TTS, голос Algieba,
# темп ×1,17, «CAS» вимовляється «КАС Девелопмент». Ключ — з облікових даних n8n (не з файлів).
VOICE_MAX = 220
TTS_MODEL, TTS_VOICE, TTS_TEMPO, TTS_CRED = "gemini-3.8-flash-tts", "Algieba", 1.17, "JSMl9lvZ1DExgDFd"
FFMPEG = next((f for f in ("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg") if os.path.exists(f)), "ffmpeg")
_tts_key = {"v": "", "at": 0}
# Клон голосу Михайла — у розмовах із ним і з Сержем (197958492), природний темп; решті — Algieba ×1,17
CLONE_VOICE = os.environ.get("TTS_CLONE_VOICE", "voice_0xudst09wbpu")
OWN_CHATS = {int(x) for x in os.environ.get("TTS_CLONE_CHATS", "439131779,197958492").split(",") if x.strip()}
CLONE_ON = os.environ.get("TTS_CLONE", "all") != "off"   # Михайло 21.10: його голосом з усіма, клієнтам — як AI-помічник
AI_INTRO = "Вітаю! Я AI-помічник КАС Девелопмент. "
INTRO_FILE = MEMORY / ".voice-intro.json"


def needs_intro(chat):
    if chat in OWN_CHATS:
        return False
    try:
        seen = set(json.loads(INTRO_FILE.read_text()))
    except Exception:
        seen = set()
    if chat in seen:
        return False
    seen.add(chat); INTRO_FILE.write_text(json.dumps(sorted(seen)))
    return True


def tts_key():
    if _tts_key["v"] and time.time() - _tts_key["at"] < 3600:
        return _tts_key["v"]
    out = subprocess.run(["docker", "exec", "n8n", "sh", "-c",
                          f"n8n export:credentials --id={TTS_CRED} --decrypted --output=/tmp/g.json >/dev/null 2>&1; cat /tmp/g.json; rm -f /tmp/g.json"],
                         capture_output=True, text=True, timeout=60).stdout
    _tts_key.update(v=json.loads(out[out.index("["):])[0]["data"]["apiKey"], at=time.time())
    return _tts_key["v"]


def speak_owner(text):
    """Михайлу — без обмеження довжини: довге ділимо по реченнях на голосові до ~800 знаків."""
    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()
    parts, cur = [], ""
    for sent in re.split(r"(?<=[.!?…])\s+", plain):
        if cur and len(cur) + len(sent) > 800:
            parts.append(cur); cur = sent
        else:
            cur = (cur + " " + sent).strip()
    if cur:
        parts.append(cur)
    return all([speak(p, limit=None) for p in parts])


def speak(text, chat=None, reply_to=None, limit=VOICE_MAX):
    plain = re.sub(r"<[^>]+>", "", text or "").strip()
    if not plain or (limit and (len(plain) > limit or "|" in plain)):
        return False
    say = re.sub(r"CAS\s*Development", "КАС Девелопмент", plain, flags=re.I).replace("CAS", "КАС")
    clone = CLONE_ON
    if clone and needs_intro(int(chat or OWNER)):
        say = AI_INTRO + say
    prompt = ("Озвуч мовою тексту як звичайна жива людина в розмові: вільно, невимушено, з природною інтонацією, "
              "дружньо й впевнено, без рекламного тону. Англійські назви вимовляй англійською. Текст: " + say)
    try:
        body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"voice": CLONE_VOICE} if clone else {"prebuiltVoiceConfig": {"voiceName": TTS_VOICE}}}}}
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODEL}:generateContent",
                                     data=json.dumps(body).encode(), headers={"x-goog-api-key": tts_key(), "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as r:
            d = json.load(r)
        part = next(p["inlineData"] for p in d["candidates"][0]["content"]["parts"] if "inlineData" in p)
        raw = __import__("base64").b64decode(part["data"])
        tmp = pathlib.Path(tempfile.mkdtemp())
        src = tmp / "a.wav"
        if raw[:4] != b"RIFF":                                  # сирий PCM 24 кГц моно 16 біт
            import struct
            rate = int((re.search(r"rate=(\d+)", part.get("mimeType", "")) or [0, 24000])[1])
            raw = b"RIFF" + struct.pack("<I", 36 + len(raw)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(raw)) + raw
        src.write_bytes(raw)
        ogg = tmp / "voice.ogg"
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), *([] if clone else ["-filter:a", f"atempo={TTS_TEMPO}"]), "-c:a", "libopus", "-b:a", "48k", str(ogg)],
                       check=True, timeout=60)
        boundary = "----voice" + str(int(time.time()))
        parts = [f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat or OWNER}\r\n".encode()]
        if reply_to:
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"reply_to_message_id\"\r\n\r\n{reply_to}\r\n".encode())
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"voice\"; filename=\"voice.ogg\"\r\nContent-Type: audio/ogg\r\n\r\n".encode()
                     + ogg.read_bytes() + f"\r\n--{boundary}--\r\n".encode())
        rq = urllib.request.Request(API + "sendVoice", data=b"".join(parts), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urllib.request.urlopen(rq, timeout=120) as r:
            ok = json.load(r).get("ok")
        shutil.rmtree(tmp, ignore_errors=True)
        LOG("голос:", "надіслано" if ok else "не вдалось", len(plain), "зн.")
        return bool(ok)
    except Exception as e:
        LOG("голос: не вдалось", repr(e)[:200])
        return False


def split_out(out):
    files = [f.strip().strip("`'\"") for f in re.findall(r"^SEND_FILE:\s*(.+)$", out, flags=re.M)]
    body = re.sub(r"^SEND_FILE:.*$", "", out, flags=re.M)
    # 20.10: у чернетку для групи потрапили робочі нотатки Claude («Bash заблоковано… Текст відповіді для групи:»).
    # Тепер відповідь — між маркерами; без маркерів — усе після заголовка «Текст відповіді…», якщо він є.
    m = re.findall(r"===ВІДПОВІДЬ===\s*(.*?)\s*(?:===КІНЕЦЬ===|\Z)", body, flags=re.S)
    if m:
        body = m[-1]
    else:
        h = list(re.finditer(r"^\W*(текст )?відповід\w* (для|клієнту|в групу|групі)[^\n]*$", body, flags=re.M | re.I))
        if h:
            body = body[h[-1].end():]
    body = re.sub(r"\*\*(.+?)\*\*", r"\1", body)                      # **жирний** → жирний
    body = re.sub(r"^```\w*\s*$", "", body, flags=re.M)
    body = re.sub(r"^\s*-{3,}\s*$", "", body, flags=re.M)
    reply = re.sub(r"\n{3,}", "\n\n", body).strip()
    # Якщо вивід довгий, беремо хвіст до 3000 символів
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


# ---------- усі, крім Михайла: команда й клієнти ----------
# Підпорядковується бот лише Михайлу. Решті: стандартні відповіді — одразу й локально (без Claude),
# усе інше — задача, яку Михайло погоджує, а відповідь переглядає перед відправкою.
# Команда (учасники робочих груп) отримує робочу інформацію, клієнти — лише клієнтську.
ME = {}
PUBLIC = """CAS Development — дизайн інтерʼєру, ремонт і будівництво під ключ, меблі й комплектація напряму з Китаю.
Київ, вул. Антоновича, 44 · +380 97 866 77 55 · cas-develop.com · Instagram @cas_development
Калькулятор ремонту: https://quiz.china-opt-shop.pp.ua · 150+ реалізованих проєктів, працюємо з 2016 року.
Ціни «від» (як на сайті): дизайн-проєкт від $30/м² (мінімальний бюджет $2 500), ремонт під ключ від $550/м²,
ремонт офісу від $350/м², меблювання від $250/м², будівництво від $600/м², будівництво з ремонтом під ключ від $1 100/м².
Кошторис ремонту ±5%, якщо ремонт за проєктом робить CAS. Гарантія на роботи — 12 місяців."""
STANDARD = [   # (шаблон, кому, відповідь) — перший збіг; повідомлення довші за 120 знаків ідуть у задачу
    (r"(команд|що ти (вмієш|можеш)|що вмієш|що можеш|допомог|help|/help)", "team", "HELP_TEAM"),
    (r"(команд|що ти (вмієш|можеш)|що вмієш|що можеш|допомог|help|/help)", "client", "HELP_CLIENT"),
    (r"^(/start|привіт|вітаю|добр(ий|ого) (день|ранок|вечір|ранку|вечора)|доброго|хай|hello|hi)[\s!.,]*$", "team", "HELP_TEAM"),
    (r"^(/start|привіт|вітаю|добр(ий|ого) (день|ранок|вечір|ранку|вечора)|доброго|хай|hello|hi)[\s!.,]*$", "client", "HELLO_CLIENT"),
    (r"(контакт|телефон|адрес|де ви |де ваш|де знаходит|ваш сайт|інстаграм|instagram)", "*", "CONTACTS"),
    (r"(скільки коштує|вартість|ціна|ціни|прайс|почім|кошторис|розрахун)", "*", "PRICE"),
    (r"^(дякую|спасибі|дяк|thanks|thank you|ок|окей|добре|зрозумів|зрозуміла)[\s!.,👍🙏]*$", "*", "THANKS"),
]


def standard_reply(text, role):
    if len(text) > 120:
        return None
    for pat, who_, key in STANDARD:
        if who_ in ("*", role) and re.search(pat, text, re.I):
            if key == "PRICE" and re.search(r"\d", text):    # з площею чи сумою — це вже запит, не довідка
                continue
            return key
    return None


def reply_text(key, role, in_group):
    u = ME.get("username", "бот")
    tag = f"@{u} " if in_group else ""
    if key == "HELP_TEAM":
        return f"""Я — AI-помічник Михайла. Ось що можу для команди:

• знайти й порівняти постачальників, підрядників, ціни
• підготувати документ: лист, ТЗ, порівняльну таблицю, PDF
• прочитати файл чи фото, розшифрувати голосове — надішліть його {('з тегом у підписі' if in_group else 'сюди')}
• зібрати інфо по обʼєкту з наших нотаток

Як поставити задачу: {tag}+ що зробити одним повідомленням.
Наприклад: {tag}знайди 3 постачальники травертину для фасаду, ціна за м²

Кожну задачу спершу погоджує Михайло, готову відповідь він теж переглядає.
Прості питання (що вмію, контакти, ціни) — відповідаю одразу."""
    if key in ("HELP_CLIENT", "HELLO_CLIENT"):
        return ("Вітаю! Я AI-помічник Михайла, CAS Development.\n\n" + PUBLIC +
                "\n\nНапишіть, що плануєте (обʼєкт, площа, місто, терміни) — передам Михайлу, "
                "і ви отримаєте відповідь після його перегляду.")
    if key == "CONTACTS":
        return PUBLIC
    if key == "PRICE":
        return ("Дизайн-проєкт — від $30/м² (мінімальний бюджет $2 500), ремонт під ключ — від $550/м², офіс — від $350/м².\n"
                "Орієнтовну суму порахуєте за 2 хвилини в калькуляторі: https://quiz.china-opt-shop.pp.ua\n"
                "Точний кошторис робимо після замірів і брифу.\n"
                "Хочете — опишіть обʼєкт (тип, площа, місто), передам Михайлу.")
    return "Будь ласка! Якщо щось ще — пишіть."


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


def role_of(uid, state):
    """team — учасник хоч однієї робочої групи; інакше client. Кеш на добу."""
    if uid == OWNER:
        return "owner"
    cache = state.setdefault("roles", {})
    hit = cache.get(str(uid))
    if hit and time.time() - hit[1] < 86400:
        return hit[0]
    role = "client"
    for g in GROUPS:
        try:
            if api("getChatMember", chat_id=g, user_id=uid).get("status") in ("creator", "administrator", "member", "restricted"):
                role = "team"; break
        except Exception:
            pass
    cache[str(uid)] = [role, time.time()]
    return role


def handle_external(msg, state):
    in_group = msg["chat"].get("type") in ("group", "supergroup")
    text = addressed(msg) if in_group else (msg.get("text") or msg.get("caption") or "").strip()
    if text is None:
        return
    uid = msg.get("from", {}).get("id")
    chat, mid = msg["chat"]["id"], msg["message_id"]
    role = role_of(uid, state)
    has_media = any(k in msg for k in ("photo", "document", "voice", "audio", "video_note"))
    key = "HELP_TEAM" if role in ("team", "owner") and not text and not has_media else \
          "HELLO_CLIENT" if not text and not has_media else (None if has_media else standard_reply(text, "team" if role == "owner" else role))
    if key:
        send_text(reply_text(key, role, in_group), chat, mid if in_group else None)
        LOG("стандартна відповідь", key, role, who(msg)); return
    tasks = state.setdefault("tasks", {})
    if role != "owner" and sum(1 for t in tasks.values() if t.get("uid") == uid and t.get("status") in (None, "work", "draft")) >= 3:
        send_text("Ваші запити вже в Михайла на розгляді — відповім, щойно він перегляне.", chat, mid if in_group else None); return
    state["task_n"] = n = state.get("task_n", 0) + 1
    att = ""
    if has_media:
        kind, path = describe(msg)
        att = f"{kind}: {path}"
    place = msg["chat"].get("title", "") if in_group else "особисто"
    t = {"n": n, "chat": chat, "mid": mid, "uid": uid, "role": role, "from": who(msg), "text": text or "(без тексту)",
         "att": att, "group": place, "at": datetime.datetime.now().strftime("%d.%m %H:%M")}
    tasks[str(n)] = t
    for k in sorted(tasks, key=int)[:-50]:               # тримаємо останні 50
        tasks.pop(k)
    label = {"team": "команда", "client": "клієнт", "owner": "Михайло"}[role]
    with TEAM_TASKS.open("a", encoding="utf-8") as f:
        f.write(f"- №{n} · {t['at']} · {t['from']} ({label}, {place}): {t['text']}{' [' + att + ']' if att else ''} — на погодженні\n")
    LOG("задача", n, label, t["from"], t["text"][:60])
    if role == "owner":                                  # задачу ставить сам Михайло — погоджувати нема кого
        t["own"] = True; start_task(t, state); return
    send_text(f"📌 Запит №{n} прийнято. Передав Михайлу — відповідь буде після його перегляду.", chat, mid if in_group else None)
    sent = send_text(f"📌 №{n} · {label} · {t['from']} ({place}):\n{t['text']}" + (f"\n📎 {att}" if att else ""),
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
        send_text(f"Запит №{t['n']}: Михайло відповість особисто.", t["chat"], t["mid"])
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
    where = "в особистому чаті з працівником" if t["group"] == "особисто" else f"у робочій групі команди «{t['group']}»"
    team = f"""Ти AI-асистент Михайла (CAS Development) {where}.
Правила: прочитай tools/assistant/playbooks/00-core.md. Пам'ять — локальна папка {MEMORY}.
Задачу поставив {t['from']} із команди, Михайло її погодив. Виконай її до кінця.
{('Вкладення (' + t['att'] + ') — прочитай його; голосові розшифровуй tools/assistant/bin/transcribe.sh <файл>.') if t['att'] else ''}
PDF: запиши Markdown у ~/.assistant/tmp, запусти tools/assistant/bin/md2pdf.sh <файл.md> і додай рядок SEND_FILE.
Скрипти запускай НАПРЯМУ шляхом tools/assistant/bin/…, без «bash»/«sh» попереду — інакше дозвіл не спрацює.

ВІДПОВІДЬ ПОБАЧИТЬ УСЯ ГРУПА. Не розкривай особисте Михайла (здоровʼя, сімʼя, фінанси, борги), суми договорів
і контакти клієнтів поза задачею, закупівельні ціни бригад і нашу націнку (price-contractor). Не пиши й не надсилай
листів і повідомлень іншим людям — лише результат сюди. Нічого не вигадуй: чого не знайшов — так і скажи.

Задача №{t['n']}: {t['text']}
Працюй ощадливо: до ~8 пошуків і відкритих сторінок, далі — висновок із того, що є.

НЕ викликай tg-out.sh і tg.sh send — відповідь відправлю я. Останнім у виводі напиши текст відповіді
для групи (до 20 рядків, українською, звертайся до {t['from']}). {ANSWER_RULE} Файл — окремим рядком: SEND_FILE: /повний/шлях"""
    client = f"""Ти AI-помічник Михайла, CAS Development. Представляйся як AI-помічник, не як сам Михайло. Пише КЛІЄНТ ({t['from']}, {t['group']}). Михайло дозволив відповісти.
Відомо про компанію лише це (більше нічого не стверджуй):
{PUBLIC}
Відповідай лише клієнтською інформацією: послуги, як працюємо, етапи, що потрібно від клієнта, контакти.
НІЧОГО внутрішнього: інших клієнтів і обʼєкти, суми договорів, ціни бригад і постачальників, націнку, особисте
Михайла, команду. Можна називати лише ціни «від» з переліку вище; точних сум і термінів не обіцяй —
калькулятор і кошторис після замірів. Не вигадуй. Не пропонуй дзвінків — краще продовжити тут, у Telegram.
{('Вкладення (' + t['att'] + ') — опиши, що бачиш, якщо стосується справи.') if t['att'] else ''}

Повідомлення клієнта: {t['text']}

Останнім у виводі — текст відповіді клієнту (до 12 рядків, українською або мовою клієнта, ввічливо, на «ви»).
{ANSWER_RULE}"""
    prompt, tools = (client, CLIENT_ALLOWED) if t.get("role") == "client" else (team, GROUP_ALLOWED)
    t["sid"] = str(uuid.uuid4())
    if t.get("role") == "client":                          # клієнтам — без підписки (API / локальна модель)
        t["prompt"] = prompt
        out = client_answer(prompt)
    else:
        try:
            out = run_claude(prompt, t["sid"], False, tools, 65)
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
        else:
            send_text(f"⚠️ У чернетці згаданий файл, якого немає: {f}")


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
        if t.get("att", "").startswith("голосове"):
            speak(split_out(t["draft"])[0], t["chat"], t["mid"])
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
Врахуй правки, правила ті самі (відповідь побачить отримувач — група, працівник чи клієнт). Поверни нову ПОВНУ відповідь для групи
останнім у виводі; файли — рядками SEND_FILE. {ANSWER_RULE}"""
    try:
        if t.get("role") == "client":                      # правки до клієнтської відповіді — теж без підписки
            if kind == "голосове":
                r = subprocess.run([str(REPO / "tools/assistant/bin/transcribe.sh"), content], capture_output=True, text=True, timeout=300)
                how = "голосом: " + (r.stdout.strip() or "не розібрав")
            out = client_answer((t.get("prompt") or "") + "\n\nПопередня чернетка:\n" + split_out(t["draft"])[0]
                                + "\n\nПравки Михайла (" + how + "). Поверни нову повну відповідь.")
        else:
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
                elif chat in GROUPS or (chat != OWNER and msg.get("chat", {}).get("type") == "private"):
                    handle_external(msg, state)
                elif chat != OWNER:
                    LOG("ігнорую чужий чат", chat); continue       # групи, яких немає в ASSISTANT_GROUPS
                else:
                    handle(msg, state)
            except Exception as e:
                LOG("помилка:", repr(e))
                try: send_text(f"⚠️ Помилка: {e}")
                except Exception: pass
            save_state(state)


if __name__ == "__main__":
    main()
