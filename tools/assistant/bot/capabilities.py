#!/usr/bin/env python3
"""Реєстр можливостей помічника: що бот уміє, що встановлено на цій машині й що платне (23.11.2026).

Навіщо: бот відповідав «з голови» моделі («ace-step не встановлено», «відкрий suno.com»), хоча генератор
стояв на Mac mini, а іншим разом сам пішов у платний хмарний інструмент. Тепер знання бота про себе —
з фактичної перевірки, а не з памʼяті моделі.

Джерела записів:
  • BUILTIN — те, що є в цьому репозиторії (наміри local_mode.py/menu.py, скрипти bin/, TTS, Whisper, Ollama);
  • машинні — JSON у теці ASSISTANT_CAPS_DIR (типово ~/.assistant/capabilities.d/*.json), поза репозиторієм:
    Mac mini описує там локально встановлені інструменти (ACE-Step, FLUX, Real-ESRGAN…). Формат — README бота,
    розділ «Що бот уміє й знає про себе»; приклад — capabilities.example/music-ace-step.json;
  • PAID — платні й хмарні генератори (Higgsfield тощо): не перевіряються, лише з явного дозволу Михайла.

Перевірки дешеві: PATH, файл, змінна оточення, Python-модуль (окремий python — тайм-аут 3 с), модель Ollama
(GET /api/tags, 2 с), HTTP (2 с). Результат кешується на ASSISTANT_CAPS_TTL (600) с.

CLI (для діагностики на Mac):
  capabilities.py                    таблиця (✅ / ⚠️ причина / 💳)
  capabilities.py --json             те саме машиночитаємо
  capabilities.py --check <ключ>     код 0 — є, 1 — немає (причина в stdout)
  capabilities.py --allowlist        рекомендований CLAUDE_ALLOWED_TOOLS: поточний + локальні, без платних
  capabilities.py --prompt           блок, який бачить модель
  capabilities.py --run <ключ> [--arg імʼя=значення …] [--bg]
                                     запустити інструмент із записом "run" (напр. генератор пісень); --bg — у фоні,
                                     готовий файл надсилає Михайлу tg-out.sh (так його запускає Claude з бота)
Лише стандартна бібліотека Python 3.9+. Жодних особистих шляхів у коді: усе — через змінні оточення.
"""
import concurrent.futures, dataclasses, datetime, glob, json, os, pathlib, re, shlex, shutil, subprocess, sys, threading, time, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
SELF = "python3 tools/assistant/bot/capabilities.py"
CATEGORIES = ["текст", "голос", "календар", "пошта", "гроші", "PDF", "документи", "зображення", "музика", "відео",
              "файли", "telegram", "сайт", "інше"]
CHECK_KINDS = ("cmd", "file", "dir", "env", "module", "ollama", "http", "script", "any")
KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_warnings = []
_cache = {}
_lock = threading.Lock()


def _default_log(*a):
    print(datetime.datetime.now().strftime("%H:%M:%S"), "[caps]", *a, file=sys.stderr, flush=True)


LOG = _default_log          # bot.py підставляє свій журнал


def warn(msg):
    with _lock:
        new = msg not in _warnings
        if new:
            _warnings.append(msg)
    if new:                                     # у журнал — один раз (до /caps refresh), не на кожен запит
        LOG("⚠️", msg)


def warnings():
    return list(_warnings)


# ---------- шляхи ----------
def repo():
    return pathlib.Path(os.environ.get("ASSISTANT_REPO") or HERE.parents[2])


def caps_dir():
    return pathlib.Path(os.path.expanduser(os.environ.get("ASSISTANT_CAPS_DIR") or "~/.assistant/capabilities.d"))


def tmp_dir():
    p = pathlib.Path(os.environ.get("ASSISTANT_TMP") or pathlib.Path.home() / ".assistant/tmp")
    p.mkdir(parents=True, exist_ok=True)
    return p


def ttl():
    try:
        return float(os.environ.get("ASSISTANT_CAPS_TTL", "600"))
    except ValueError:
        return 600.0


_VAR = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")


def expand(s):
    """«${VAR}», «${VAR:-типово}», «~» → (рядок, [незадані змінні]). Підставляє лише змінні оточення."""
    missing = []

    def sub(m):
        v = os.environ.get(m.group(1))
        if v:
            return v
        if m.group(2) is not None:
            return m.group(2)
        missing.append(m.group(1))
        return ""
    out = _VAR.sub(sub, str(s))
    if out.startswith("~"):
        out = os.path.expanduser(out)
    return out, missing


# ---------- записи ----------
@dataclasses.dataclass
class Cap:
    key: str
    name: str
    category: str
    check: list = dataclasses.field(default_factory=list)   # усі мають пройти; {"any": […]} — хоч одна
    call: str = ""          # як викликати (для моделі): команда-шаблон або фраза наміру бота
    intent: str = ""        # фраза, на яку бот реагує сам, без моделі
    install: str = ""       # як поставити (підказка, коли немає)
    version: list = None    # команда, перший рядок виводу — версія ("{found}" — шлях, знайдений першою cmd)
    run: list = None        # argv-шаблон запуску ("{prompt}", "{out}" …), без shell
    defaults: dict = dataclasses.field(default_factory=dict)
    out_ext: str = ".wav"
    timeout: int = 1800
    allow: list = None      # шаблони для CLAUDE_ALLOWED_TOOLS (типово — Bash(<перша команда run>*))
    paid: bool = False
    local: bool = True
    note: str = ""
    source: str = "вбудований"


@dataclasses.dataclass
class Status:
    ok: bool
    reasons: list = dataclasses.field(default_factory=list)
    found: str = ""
    version: str = ""
    at: float = 0.0


def _b(key, name, cat, check, call="", **kw):
    return Cap(key=key, name=name, category=cat, check=check, call=call, **kw)


BOT = "tools/assistant/bin"
TG_PY = "${TG_PYTHON:-~/.tg-claude/venv/bin/python}"
FFMPEG_ANY = {"any": [{"cmd": "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"}, {"cmd": "/opt/homebrew/bin/ffmpeg"}, {"cmd": "ffmpeg"}]}
GTOKEN = "${ASSISTANT_GOOGLE_DIR:-~/.assistant-google}/token.json"
JARVIS = "${ASSISTANT_JARVIS_DIR:-~/jarvis}/scripts"

# Лише те, що справді є в коді бота (bot.py, local_mode.py, menu.py, bin/) — нічого не вигадано.
BUILTIN = [
    _b("claude", "Claude Code (claude -p) — основний режим", "текст", [{"cmd": "${CLAUDE_BIN:-claude}"}],
       "повідомлення Михайла (бот сам запускає claude -p)", install="curl -fsSL https://claude.ai/install.sh | bash, далі claude і вхід",
       local=False, note="за підпискою Claude; без неї бот іде в локальний режим"),   # без --version: claude не запускаємо зайвий раз
    _b("ollama", "Локальна модель Ollama", "текст", [{"ollama": "${ASSISTANT_LOCAL_MODEL:-qwen3:8b}"}],
       "локальний режим: усе, що не команда", install="brew install ollama; ollama pull ${ASSISTANT_LOCAL_MODEL:-qwen3:8b}"),
    _b("knowledge", "База знань CAS (RAG)", "текст", [{"file": JARVIS + "/knowledge.py"}, {"ollama": "bge-m3"}],
       "локальна модель додає фрагменти сама", install="knowledge.py у ~/jarvis/scripts і ollama pull bge-m3"),
    _b("tasks", "Задачі й нагадування (02 Задачі.md)", "файли", [{"dir": "${ASSISTANT_MEMORY_DIR:-~/assistant-memory}"}],
       "Edit/Write у 02 Задачі.md", intent="«додай задачу …», «нагадай завтра о 10 …», /tasks, /remind",
       install="задати ASSISTANT_MEMORY_DIR (тека памʼяті)"),
    _b("pdf", "PDF із Markdown", "PDF", [{"script": "md2pdf.sh"},
       {"any": [{"cmd": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"},
                {"cmd": "/Applications/Chromium.app/Contents/MacOS/Chromium"}, {"cmd": "google-chrome"}, {"cmd": "chromium"},
                {"env": "CHROME"}]}],
       BOT + "/md2pdf.sh <файл.md> → шлях до PDF (рядок SEND_FILE)", intent="«pdf: текст», «зроби pdf»",
       install="встановити Google Chrome (друкує PDF)"),
    _b("pandoc", "pandoc (Markdown → HTML для PDF, необовʼязково)", "документи", [{"cmd": "pandoc"}],
       "pandoc …", install="brew install pandoc", version=["{found}", "--version"]),
    _b("ffmpeg", "ffmpeg (аудіо/відео)", "відео", [FFMPEG_ANY], "ffmpeg …",
       install="brew install ffmpeg", version=["{found}", "-version"]),
    _b("transcribe", "Розпізнавання голосу (faster-whisper, офлайн)", "голос",
       [{"script": "transcribe.sh"}, {"module": "faster_whisper", "python": TG_PY}],
       BOT + "/transcribe.sh <аудіо> → текст", intent="голосове / аудіо", install="tools/telegram/tg.sh setup --whisper"),
    _b("tts", "Голосова відповідь (Gemini TTS, голос Михайла)", "голос", [{"cmd": "docker"}, FFMPEG_ANY],
       "бот сам відповідає голосом на голосове", install="Docker з n8n (ключ Gemini у n8n) і ffmpeg",
       local=False, note="хмарний API Google, уже підключений; ключ — з n8n"),
    _b("voice-clone", "Голосове голосом Михайла комусь", "голос", [{"script": "voice-clone.sh"}, {"cmd": "docker"}],
       BOT + "/voice-clone.sh \"текст\" → .ogg, далі tools/telegram/tg.sh send-voice <чат> <файл>",
       install="Docker з n8n (ключ Gemini)", local=False, note="хмарний API Google, уже підключений"),
    _b("telegram", "Telegram особистого акаунта (чати, пошук, файли)", "telegram",
       [{"file": "${ASSISTANT_REPO:-.}/tools/telegram/tg.sh"}, {"cmd": TG_PY}],
       "tools/telegram/tg.sh read|search|download|send …", install="tools/telegram/tg.sh setup і login (README Telegram)"),
    _b("calendar", "Google Календар", "календар",
       [{"any": [{"file": "${ASSISTANT_CAL_SCRIPT:-~/jarvis/scripts/cal.py}"}, {"file": GTOKEN}]}],
       "python3 ~/jarvis/scripts/cal.py list|add … (додавати — лише після «так»)",
       intent="/today, /tomorrow, «що в мене завтра», «додай у календар …»",
       install="python3 tools/assistant/bin/google_oauth.py login (README, «Google Calendar і Gmail»)"),
    _b("mail", "Gmail (читання; лист — лише кнопкою)", "пошта", [{"script": "gmail.py"}, {"file": GTOKEN}],
       BOT + "/gmail.py unread", intent="/mail, «пошта», «надішли лист на …»",
       install="python3 tools/assistant/bin/google_oauth.py login"),
    _b("money", "Монобанк (лише читання)", "гроші",
       [{"file": "${ASSISTANT_REPO:-.}/tools/monobank/mono.sh"}, {"env": "MONOBANK_TOKEN"}],
       "tools/monobank/mono.sh balance|summary", intent="/money, «баланс», «витрати за місяць»",
       install="задати MONOBANK_TOKEN у ~/.assistant.env"),
    _b("inbox", "Вхідні: хто чекає відповіді", "telegram", [{"script": "brief-data.sh"}],
       BOT + "/brief-data.sh", intent="/inbox, «📥 Вхідні»"),
    _b("blog", "Автоблог (прев'ю, правки, публікація)", "сайт", [{"file": JARVIS + "/blog.sh"}],
       "кнопки під статтею", install="~/jarvis/scripts/blog.sh на Mac mini"),
    _b("ozdoba", "Оздоба: товар з фото", "сайт", [{"file": JARVIS + "/ozdoba.sh"}],
       "підпис «оздоба <id> …» під фото", install="~/jarvis/scripts/ozdoba.sh на Mac mini"),
    _b("review", "Чернетка прохання про відгук у Google", "документи",
       [{"script": "review-request.sh"}, {"file": JARVIS + "/review-request.py"}],
       BOT + "/review-request.sh \"Імʼя\" \"що робили\"", install="~/jarvis/scripts/review-request.py на Mac mini"),
]

# Платні / зовнішні: не викликати й не пропонувати як дію, якщо є локальний аналог; лише з явного дозволу Михайла
# в цьому ж зверненні. patterns — регулярні вирази назв інструментів Claude (MCP), які не йдуть у рекомендований allowlist.
PAID = [
    Cap("higgsfield", "Higgsfield (MCP: відео, зображення, аудіо)", "відео", paid=True, local=False,
        allow=[r"(?i)hig+s?field"], note="кредити Higgsfield"),
    Cap("canva-ai", "Canva AI (generate-design, generate-image, create-video)", "зображення", paid=True, local=False,
        allow=[r"(?i)canva.*(generate|create-video)"]),
    Cap("gamma", "Gamma (генерація презентацій і зображень)", "документи", paid=True, local=False,
        allow=[r"(?i)gamma.*generate"]),
    Cap("figma-ai", "Figma AI (generate_image, weave)", "зображення", paid=True, local=False,
        allow=[r"(?i)figma.*(generate_image|weave_run)"]),
    Cap("adobe-firefly", "Adobe Firefly / генеративні інструменти Adobe", "зображення", paid=True, local=False,
        allow=[r"(?i)firefly|adobe.*(generative|fill_area|generate)"]),
    Cap("anthropic-api", "Anthropic API (оплата за токени)", "текст", paid=True, local=False, allow=[],
        note="вже використовується лише для відповідей клієнтам; для нового — тільки з дозволу"),
    Cap("suno", "suno.com, udio.com та інші сайти генерації музики", "музика", paid=True, local=False, allow=[],
        note="лише як довідка, якщо Михайло сам питає про альтернативи"),
]


# ---------- машинні записи (capabilities.d) ----------
def _validate(d, src):
    """dict → Cap або причина помилки (рядок)."""
    if not isinstance(d, dict):
        return "запис не обʼєкт"
    key, name, cat = d.get("key"), d.get("name"), d.get("category")
    if not isinstance(key, str) or not KEY_RE.match(key):
        return "key: латиниця/цифри/._- (до 64)"
    if not isinstance(name, str) or not name.strip():
        return f"{key}: немає name"
    if not isinstance(cat, str) or not cat.strip():
        return f"{key}: немає category"
    checks = d.get("check", [])
    if not isinstance(checks, list) or not all(_valid_check(c) for c in checks):
        return f"{key}: check — список обʼєктів з одним із ключів {', '.join(CHECK_KINDS)}"
    run = d.get("run")
    if run is not None and (not isinstance(run, list) or not run or not all(isinstance(x, str) for x in run)):
        return f"{key}: run — непорожній список рядків (argv, без shell)"
    for f in ("paid", "local"):
        if f in d and not isinstance(d[f], bool):
            return f"{key}: {f} — true/false"
    if "timeout" in d and (not isinstance(d["timeout"], (int, float)) or isinstance(d["timeout"], bool) or not 1 <= d["timeout"] <= 7200):
        return f"{key}: timeout — секунди 1…7200"
    for f in ("defaults",):
        if f in d and (not isinstance(d[f], dict) or not all(isinstance(v, (str, int, float)) for v in d[f].values())):
            return f"{key}: defaults — обʼєкт рядків/чисел"
    for f in ("version", "allow"):
        if f in d and (not isinstance(d[f], list) or not all(isinstance(x, str) for x in d[f])):
            return f"{key}: {f} — список рядків"
    for f in ("call", "intent", "install", "note", "out_ext"):
        if f in d and not isinstance(d[f], str):
            return f"{key}: {f} — рядок"
    unknown = set(d) - {"key", "name", "category", "check", "call", "intent", "install", "version", "run", "defaults",
                        "out_ext", "timeout", "allow", "paid", "local", "note", "$comment"}
    if unknown:
        return f"{key}: невідомі поля {', '.join(sorted(unknown))}"
    if cat not in CATEGORIES:
        warn(f"{src}: {key} — нестандартна категорія «{cat}» (див. CATEGORIES)")
    return Cap(key=key, name=name.strip(), category=cat, check=checks, call=d.get("call", ""), intent=d.get("intent", ""),
               install=d.get("install", ""), version=d.get("version"), run=run, defaults={k: str(v) for k, v in d.get("defaults", {}).items()},
               out_ext=d.get("out_ext", ".wav"), timeout=int(d.get("timeout", 1800)), allow=d.get("allow"),
               paid=d.get("paid", False), local=d.get("local", not d.get("paid", False)), note=d.get("note", ""), source=src)


def _valid_check(c):
    if not isinstance(c, dict):
        return False
    kinds = [k for k in CHECK_KINDS if k in c]
    if len(kinds) != 1:
        return False
    if kinds[0] == "any":
        return isinstance(c["any"], list) and bool(c["any"]) and all(_valid_check(x) for x in c["any"])
    if not isinstance(c[kinds[0]], str):
        return False
    return set(c) <= {kinds[0], "python", "why"} and (kinds[0] == "module" or "python" not in c)


def machine_caps():
    d = caps_dir()
    out = []
    for f in sorted(glob.glob(str(d / "*.json"))):
        try:
            data = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            warn(f"{pathlib.Path(f).name}: не JSON ({str(e)[:80]}) — пропускаю"); continue
        for item in data if isinstance(data, list) else [data]:
            c = _validate(item, pathlib.Path(f).name)
            if isinstance(c, str):
                warn(f"{pathlib.Path(f).name}: {c} — запис пропущено")
            else:
                out.append(c)
    return out


def registry():
    """Усі записи: вбудовані, машинні (той самий key — машинний замінює вбудований), платні."""
    caps = {c.key: c for c in BUILTIN}
    for c in machine_caps():
        caps[c.key] = c
    for c in PAID:
        caps.setdefault(c.key, c)
    return list(caps.values())


def get(key):
    return next((c for c in registry() if c.key == key), None)


# ---------- перевірка ----------
def _ollama_tags():
    hit = _cache.get("__tags__")
    if hit and time.time() - hit[0] < ttl():
        return hit[1]
    url = os.environ.get("ASSISTANT_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            tags = [m.get("name", "") for m in json.load(r).get("models", [])]
    except Exception as e:
        tags = None if not isinstance(e, ValueError) else []
    _cache["__tags__"] = (time.time(), tags)
    return tags


def _check_one(c):
    """(ok, причина, знайдений шлях)."""
    kind = next(k for k in CHECK_KINDS if k in c)
    why = c.get("why", "")
    if kind == "any":
        res = [_check_one(x) for x in c["any"]]
        hit = next((r for r in res if r[0]), None)
        return hit if hit else (False, why or " / ".join(r[1] for r in res), "")
    val, missing = expand(c[kind])
    if missing:
        return False, f"змінна {missing[0]} не задана", ""
    if kind == "cmd":
        p = val if "/" in val else shutil.which(val)
        if p and os.path.isfile(p) and os.access(p, os.X_OK):
            return True, "", p
        return False, why or f"команду «{val}» не знайдено" + ("" if "/" in val else " у PATH"), ""
    if kind == "script":
        p = repo() / "tools/assistant/bin" / val
        return (True, "", str(p)) if p.is_file() else (False, why or f"скрипта {p.name} немає в tools/assistant/bin", "")
    if kind == "file":
        if not os.path.isabs(val):
            val = str(repo() / val)
        return (True, "", val) if os.path.isfile(val) else (False, why or f"файлу {val} немає", "")
    if kind == "dir":
        return (True, "", val) if os.path.isdir(val) else (False, why or f"теки {val} немає", "")
    if kind == "env":
        return (True, "", "") if os.environ.get(val) else (False, why or f"змінна {val} не задана", "")
    if kind == "module":
        py, miss = expand(c.get("python", "")) if c.get("python") else (sys.executable, [])
        if miss:
            return False, f"змінна {miss[0]} не задана", ""
        if not (os.path.isfile(py) or shutil.which(py)):
            return False, why or f"Python {py} не знайдено (модуль {val})", ""
        try:
            r = subprocess.run([py, "-c", f"import importlib.util,sys; sys.exit(0 if importlib.util.find_spec({val!r}) else 1)"],
                               capture_output=True, timeout=3)
            return (True, "", "") if r.returncode == 0 else (False, why or f"модуль {val} не встановлено в {py}", "")
        except (OSError, subprocess.TimeoutExpired):
            return False, why or f"не вдалося перевірити модуль {val} (тайм-аут 3 с)", ""
    if kind == "ollama":
        tags = _ollama_tags()
        if tags is None:
            return False, "Ollama не відповідає (" + os.environ.get("ASSISTANT_OLLAMA_URL", "http://127.0.0.1:11434") + ")", ""
        want = val
        if want in ("*", "") and tags:
            return True, "", ""
        if any(t == want or t.split(":")[0] == want or t == want + ":latest" for t in tags):
            return True, "", ""
        return False, why or f"моделі {want} немає в Ollama (ollama pull {want})", ""
    if kind == "http":
        try:
            with urllib.request.urlopen(val, timeout=2):
                return True, "", ""
        except Exception as e:
            return False, why or f"{val} не відповідає ({type(e).__name__})", ""
    return False, f"невідома перевірка {kind}", ""


def _version(cap, found):
    if not cap.version:
        if cap.key == "ollama":
            tags = _ollama_tags()
            return ", ".join(tags[:8]) if tags else ""
        return ""
    argv = []
    for a in cap.version:
        v, miss = expand(a.replace("{found}", found or ""))
        if miss:
            return ""
        argv.append(v)
    if not argv or not argv[0]:
        return ""
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=2)
        if r.returncode != 0:                   # помилка версії — не показуємо (traceback ≠ версія)
            return ""
        line = ((r.stdout or r.stderr or "").strip().splitlines() or [""])[0]
        return line[:80]
    except (OSError, subprocess.TimeoutExpired):
        return ""


def check(cap, refresh=False, with_version=False):
    """Status запису (з кешем на ttl() с). Платні не перевіряються: ok=False, причина — «платне»."""
    ck = ("v:" if with_version else "s:") + cap.key + ":" + cap.source
    hit = _cache.get(ck)
    if hit and not refresh and time.time() - hit.at < ttl():
        return hit
    if cap.paid:
        st = Status(False, ["платне — лише з явного дозволу Михайла"], at=time.time())
    else:
        reasons, found = [], ""
        for c in cap.check:
            ok, why, f = _check_one(c)
            if not ok:
                reasons.append(why)
            elif f and not found:
                found = f
        st = Status(not reasons, reasons, found, at=time.time())
        if st.ok and with_version:
            st.version = _version(cap, found)
    _cache[ck] = st
    if with_version:
        _cache["s:" + cap.key + ":" + cap.source] = st
    return st


def clear_cache():
    _cache.clear()
    with _lock:
        _warnings.clear()


def statuses(refresh=False, with_version=False):
    """[(Cap, Status)] — перевірки паралельно (кожна ≤ 2–3 с)."""
    if refresh:
        clear_cache()
    caps = registry()
    if refresh or with_version:
        _ollama_tags()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        sts = list(ex.map(lambda c: check(c, False, with_version), caps))
    return list(zip(caps, sts))


def _order(cat):
    return CATEGORIES.index(cat) if cat in CATEGORIES else len(CATEGORIES)


def how_to_call(cap):
    if cap.run:
        names = sorted({m for a in cap.run for m in re.findall(r"\{(\w+)\}", a)} - {"out", "out_dir"})
        args = " ".join(f'--arg {n}="…"' for n in names)
        return f"{SELF} --run {cap.key} --bg {args}".strip()
    return cap.call


# ---------- /caps ----------
def render(refresh=False, mode_line=""):
    """Тексти повідомлень для /caps (кожне ≤ 3800 знаків)."""
    rows = statuses(refresh, with_version=True)
    lines = ["🧰 Що я вмію й що встановлено на цій машині", f"(перевірено {datetime.datetime.now():%d.%m %H:%M})"]
    for cat in sorted({c.category for c, _ in rows}, key=_order):
        group = [(c, s) for c, s in rows if c.category == cat]
        lines.append("")
        lines.append(f"— {cat} —")
        for c, s in sorted(group, key=lambda x: (x[0].paid, not x[1].ok, x[0].name)):
            if c.paid:
                lines.append(f"💳 {c.name} — платне, лише з дозволу" + (f" ({c.note})" if c.note else ""))
            elif s.ok:
                extra = f" — {s.version}" if s.version else ""
                where = "" if c.local else " · хмарне"
                lines.append(f"✅ {c.name}{extra}{where}" + (f"\n   як: {c.intent}" if c.intent else ""))
            else:
                lines.append(f"⚠️ {c.name} — не знайдено: {'; '.join(s.reasons)}" + (f"\n   поставити: {c.install}" if c.install else ""))
    w = warnings()
    if w:
        lines += ["", "Помилки в описах інструментів (" + str(caps_dir()) + "):"] + [f"• {x}" for x in w[:10]]
    if mode_line:
        lines += ["", mode_line]
    lines += ["", "Оновити список: /caps refresh. Опис нового інструмента — JSON у " + str(caps_dir()) + " (README бота)."]
    return chunk(lines)


def chunk(lines, limit=3800):
    out, cur = [], ""
    for l in lines:
        while len(l) > limit:
            out.append(cur) if cur else None
            cur = ""
            out.append(l[:limit]); l = l[limit:]
        if len(cur) + len(l) + 1 > limit:
            out.append(cur); cur = l
        else:
            cur = (cur + "\n" + l) if cur else l
    if cur:
        out.append(cur)
    return [x for x in out if x.strip()]


# ---------- блок для моделі ----------
RULES = ("ПРАВИЛА ПРО ІНСТРУМЕНТИ:\n"
         "1) Перш ніж сказати «не можу», «не встановлено» чи «немає інструмента» — звірся з цим списком (або "
         f"{SELF} --check <ключ>). Заборонено казати, що інструмента немає, якщо тут він ✅, і навпаки.\n"
         "2) Спершу локальні інструменти. Платні й хмарні генератори (Higgsfield, Canva AI, Gamma, Firefly, платні API) "
         "НЕ викликай і не пропонуй як дію, якщо є локальний аналог. Немає локального — скажи, якого саме й чому "
         "(причина зі списку), і спитай дозволу на платний; сам туди не йди. Сторонні сайти (suno.com тощо) — лише "
         "як довідка, якщо Михайло сам питає про альтернативи.\n"
         "3) Якщо локальний інструмент ✅ — виконай через нього (команда зі списку), а не відмовляйся. Довгі генерації — "
         "з --bg: файл прийде Михайлу сам, ти лише скажи «генерую, надішлю, коли буде готово».")


def prompt_block(mode="claude", max_chars=2600):
    """Короткий блок «Твої можливості на цій машині зараз» для системної частини запиту.
    mode="local" — для Ollama: модель нічого не запускає, тож замість команд — фрази, на які бот реагує сам."""
    if os.environ.get("ASSISTANT_CAPS_PROMPT", "1") == "0":
        return ""
    try:
        rows = statuses()
    except Exception as e:                       # реєстр не має ламати відповідь
        LOG("реєстр можливостей недоступний:", repr(e)[:150])
        return ""
    have, missing, paid = [], [], []
    for c, s in sorted(rows, key=lambda x: (_order(x[0].category), x[0].key)):
        if c.paid:
            paid.append(c.name.split(" (")[0])
        elif s.ok:
            how = (c.intent or ("бот робить сам" if not c.run else f"«згенеруй …» ({c.category})")) if mode == "local" else how_to_call(c)
            have.append(f"- {c.key} [{c.category}{'' if c.local else ', хмарне'}]: {c.name}" + (f" — {how}" if how else ""))
        else:
            missing.append(f"- {c.key} [{c.category}]: {c.name} — немає: {'; '.join(s.reasons)[:140]}")
    head = f"ТВОЇ МОЖЛИВОСТІ НА ЦІЙ МАШИНІ ЗАРАЗ (перевірено автоматично; це факт, а не памʼять моделі):\nЄ:\n"
    body = "\n".join(have) or "- (нічого не знайдено)"
    if missing:
        body += "\nНЕМАЄ:\n" + "\n".join(missing)
    body += "\nПЛАТНІ / ХМАРНІ — не викликати без явного дозволу Михайла в цьому ж повідомленні: " + ", ".join(paid)
    rules = RULES if mode != "local" else (
        "Не кажи «не встановлено», якщо інструмент у списку «Є». Платні сервіси не пропонуй як дію; немає локального — "
        "назви причину зі списку. Повний список — команда /caps.")
    text = head + body
    if len(text) > max_chars:
        text = text[:max_chars].rsplit("\n", 1)[0] + "\n- … (повний список: /caps)"
    return text + "\n" + rules


def short_hint():
    """Один рядок для продовжених розмов, де повний блок уже був."""
    if os.environ.get("ASSISTANT_CAPS_PROMPT", "1") == "0":
        return ""
    return (f"Можливості машини — {SELF} (--check <ключ>); не кажи «не встановлено», не перевіривши. "
            "Спершу локальні інструменти, платні (Higgsfield тощо) — лише з явного дозволу Михайла.")


CAPS_TOPIC = re.compile(r"встанов|установ|програм|інструмент|инструмент|функці|вмієш|умеешь|можеш|можешь|"
                        r"генер|згенер|сгенер|пісн|песн|музик|трек|зображен|картин|відео|видео|голос|"
                        r"ace-?step|flux|esrgan|higgs|suno|install|capabilit|generat|song|music|image", re.I)


def relevant(text):
    return bool(CAPS_TOPIC.search(text or ""))


# ---------- allowlist ----------
def paid_patterns():
    pats = []
    for c in registry():
        if c.paid:
            pats += [re.compile(p) for p in (c.allow or [])]
    return pats


def is_paid_tool(name):
    return any(p.search(name) for p in paid_patterns())


def cap_allow(cap):
    """Шаблони для CLAUDE_ALLOWED_TOOLS одного локального запису (без платних)."""
    if cap.paid or not cap.local:
        return []
    if cap.allow is not None:
        out = []
        for a in cap.allow:
            v, miss = expand(a)
            if not miss:
                out.append(v)
        return out
    if cap.run:
        v, miss = expand(cap.run[0])
        if not miss and v:
            return [f"Bash({v}*)"]
    return []


def recommended_allowlist(base=None):
    """Поточний allowlist + реєстр (сам CLI і локальні інструменти з "run"/"allow"), без платних MCP."""
    base = base if base is not None else os.environ.get("CLAUDE_ALLOWED_TOOLS", "")
    items = [t.strip() for t in re.split(r",(?![^(]*\))", base) if t.strip()]
    items.append(f"Bash({SELF}*)")
    for c in registry():
        items += cap_allow(c)
    out = []
    for t in items:
        if t not in out and not is_paid_tool(t):
            out.append(t)
    return ",".join(out)


# ---------- запуск інструмента з "run" ----------
def fill(cap, args):
    """argv із шаблону: змінні оточення підставляються ДО тексту користувача (його «${…}» не розкривається), без shell."""
    vals = dict(cap.defaults)
    vals.update({k: str(v) for k, v in (args or {}).items() if v not in (None, "")})
    out = tmp_dir() / f"{cap.key}-{datetime.datetime.now():%Y%m%d-%H%M%S}{cap.out_ext}"
    vals.setdefault("out", str(out))
    vals.setdefault("out_dir", str(tmp_dir()))
    argv = []
    for a in cap.run:
        v, miss = expand(a)
        if miss:
            raise ValueError(f"змінна {miss[0]} не задана")
        names = re.findall(r"\{(\w+)\}", v)
        for n in names:
            if n not in vals:
                raise ValueError(f"немає значення для {{{n}}}")
        argv.append(re.sub(r"\{(\w+)\}", lambda m: vals[m.group(1)], v))
    return argv, pathlib.Path(vals["out"])


def run_cap(key, args=None, timeout=None):
    """Запустити інструмент. (ok, шлях_до_файлу|None, повідомлення). Нічого не надсилає."""
    cap = get(key)
    if not cap:
        return False, None, f"інструмента «{key}» немає в реєстрі"
    if cap.paid:
        return False, None, f"{cap.name} — платний, лише з явного дозволу Михайла"
    if not cap.run:
        return False, None, f"у записі «{key}» немає команди run"
    st = check(cap, refresh=True)
    if not st.ok:
        return False, None, "; ".join(st.reasons)
    try:
        argv, out = fill(cap, args)
    except ValueError as e:
        return False, None, str(e)
    t = timeout or cap.timeout
    LOG("запуск", key, shlex.join(argv)[:200])
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=t, cwd=str(repo()))
    except subprocess.TimeoutExpired:
        return False, None, f"не встиг за {t // 60 or 1} хв (тайм-аут із запису {key})"
    except OSError as e:
        return False, None, f"не запустився: {e}"
    if r.returncode != 0:
        return False, None, f"код {r.returncode}: {((r.stderr or r.stdout or '').strip())[-300:]}"
    if out.is_file() and out.stat().st_size > 0:
        return True, str(out), "готово"
    for line in reversed((r.stdout or "").strip().splitlines()):
        p = line.strip().strip("'\"")
        if p and os.path.isfile(p):
            return True, p, "готово"
    return False, None, "команда завершилась, але файлу результату немає"


def _tg_out():
    return os.environ.get("ASSISTANT_TG_OUT") or str(repo() / "tools/assistant/bin/tg-out.sh")


def run_and_notify(key, args):
    ok, path, msg = run_cap(key, args)
    cap = get(key)
    name = cap.name if cap else key
    try:
        if ok:
            subprocess.run([_tg_out(), "file", path, f"🎵 {name}: готово"], capture_output=True, timeout=300)
        else:
            subprocess.run([_tg_out(), "text", f"⚠️ {name}: не вийшло — {msg}"], capture_output=True, timeout=60)
    except Exception as e:
        LOG("tg-out не спрацював:", e)
    return ok


# ---------- CLI ----------
def _parse_args(argv):
    args, rest, i = {}, [], 0
    while i < len(argv):
        if argv[i] == "--arg" and i + 1 < len(argv):
            k, _, v = argv[i + 1].partition("=")
            args[k.strip()] = v; i += 2
        else:
            rest.append(argv[i]); i += 1
    return args, rest


def cli(argv):
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    if not argv or argv[0] in ("--json", "--refresh"):
        rows = statuses(refresh=True, with_version=True)
        if argv and argv[0] == "--json":
            print(json.dumps([{"key": c.key, "name": c.name, "category": c.category, "ok": s.ok, "reasons": s.reasons,
                               "version": s.version, "paid": c.paid, "local": c.local, "call": how_to_call(c),
                               "intent": c.intent, "install": c.install, "source": c.source} for c, s in rows],
                             ensure_ascii=False, indent=1))
        else:
            for c, s in sorted(rows, key=lambda x: (_order(x[0].category), x[0].key)):
                mark = "💳" if c.paid else "✅" if s.ok else "⚠️"
                info = c.note if c.paid else s.version if s.ok else "; ".join(s.reasons)
                print(f"{mark} {c.category:<10} {c.key:<18} {c.name}" + (f" — {info}" if info else ""))
            for w in warnings():
                print("⚠️ опис:", w)
        return 0
    if argv[0] == "--check" and len(argv) > 1:
        c = get(argv[1])
        if not c:
            print(f"немає в реєстрі: {argv[1]}"); return 1
        s = check(c, refresh=True, with_version=True)
        print(("✅ є" + (f" — {s.version}" if s.version else "")) if s.ok else "⚠️ немає: " + "; ".join(s.reasons)
              + (f"\nпоставити: {c.install}" if c.install and not c.paid else ""))
        return 0 if s.ok else 1
    if argv[0] == "--allowlist":
        print(recommended_allowlist(argv[1] if len(argv) > 1 else None)); return 0
    if argv[0] == "--prompt":
        print(prompt_block(argv[1] if len(argv) > 1 else "claude")); return 0
    if argv[0] == "--run" and len(argv) > 1:
        key = argv[1]
        args, rest = _parse_args(argv[2:])
        if "--bg" in rest:
            c = get(key)
            if not c or c.paid or not c.run:
                print(f"⚠️ «{key}»: немає локальної команди в реєстрі"); return 1
            st = check(c, refresh=True)
            if not st.ok:
                print("⚠️ немає: " + "; ".join(st.reasons)); return 1
            cmd = [sys.executable, str(pathlib.Path(__file__).resolve()), "--run", key, "--notify"]
            for k, v in args.items():
                cmd += ["--arg", f"{k}={v}"]
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, cwd=str(repo()))
            print(f"генерую у фоні ({c.name}); файл прийде в Telegram, коли буде готовий (до {c.timeout // 60} хв)")
            return 0
        if "--notify" in rest:
            return 0 if run_and_notify(key, args) else 1
        ok, path, msg = run_cap(key, args)
        print(path if ok else "⚠️ " + msg)
        return 0 if ok else 1
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(cli(sys.argv[1:]))
