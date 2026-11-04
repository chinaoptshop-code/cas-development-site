#!/usr/bin/env python3
"""Локальний режим помічника: коли Claude недоступний (ліміт, підписка, вхід, мережа, немає бінарника).

Складові:
  • Router — перемикач «claude ↔ local» зі станом у ~/.assistant-state/router.json (не в репозиторії) і
    кулдауном: у локальному режимі Claude пробуємо знову раз на ASSISTANT_CLAUDE_RETRY_MIN (30) хвилин.
    Ручне керування: /local on (завжди локально) | off (завжди Claude) | auto (типово).
  • handle() — детерміновані інтенти БЕЗ LLM (uk/ru): задачі, нагадування, календар, пошта (надсилання лише
    кнопкою), баланс/витрати, PDF, голосові; усе інше — Ollama (ASSISTANT_LOCAL_MODEL, типово qwen3:8b).
  • CLI для shell-скриптів (bin/run-playbook.sh):
        local_mode.py status | set on|off|auto
        local_mode.py claude-run [--notify] -- claude -p ...   # 0 — вивід Claude у stdout; 10 — Claude недоступний

Лише стандартна бібліотека Python 3.9+. Особисті дані (памʼять, стан, журнал листів) — поза репозиторієм.
"""
import dataclasses, datetime, json, os, pathlib, re, subprocess, sys, time, urllib.error, urllib.request, uuid

HERE = pathlib.Path(__file__).resolve().parent
ENTER_MSG = "⚠️ Claude недоступний — працюю в локальному режимі (простіші відповіді)"
BACK_MSG = "✅ Claude знову доступний"


# ---------- шляхи й налаштування (читаються під час виклику — так їх легко підмінити в тестах) ----------
def repo():
    return pathlib.Path(os.environ.get("ASSISTANT_REPO") or HERE.parents[2])


def bin_dir():
    return repo() / "tools/assistant/bin"


def memory_dir():
    return pathlib.Path(os.environ.get("ASSISTANT_MEMORY_DIR") or pathlib.Path.home() / "assistant-memory")


def state_dir():
    p = pathlib.Path(os.environ.get("ASSISTANT_STATE_DIR") or pathlib.Path.home() / ".assistant-state")
    p.mkdir(parents=True, exist_ok=True)
    return p


def tmp_dir():
    p = pathlib.Path(os.environ.get("ASSISTANT_TMP") or pathlib.Path.home() / ".assistant/tmp")
    p.mkdir(parents=True, exist_ok=True)
    return p


def _read_json(p, default):
    try:
        return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write_json(p, data):
    p = pathlib.Path(p)
    tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)


# ---------- чи Claude недоступний ----------
LIMIT_SIGNS = re.compile(
    r"usage limit|rate limit|rate_limit|limit reached|hit your limit|out of extra usage|"
    r"please run /login|not logged in|invalid api key|credit balance|authentication_error|"
    r"oauth token (?:has )?expired|subscription (?:has )?(?:expired|cancel)|\b401\b|\b429\b", re.I)


def unavailable_reason(rc, out="", err="", exc=None):
    """Причина недоступності Claude або None, якщо відповідь нормальна.
    «Reached max turns» — не недоступність (бот сам просить підсумок)."""
    if isinstance(exc, FileNotFoundError):
        return "бінарник claude не знайдено"
    if isinstance(exc, subprocess.TimeoutExpired):
        return "таймаут"
    if exc is not None:
        return f"помилка запуску: {exc!r}"[:200]
    out, err = out or "", err or ""
    if "Reached max turns" in out:
        return None
    m = LIMIT_SIGNS.search(err) or (LIMIT_SIGNS.search(out) if len(out) < 600 else None)
    if m:
        return f"ознака ліміту/авторизації: «{m.group(0)}»"
    if rc != 0:
        tail = (err.strip() or out.strip())[-160:]
        return f"код виходу {rc}" + (f": {tail}" if tail else "")
    if not out.strip():
        return "порожня відповідь"
    return None


class Router:
    """Стан перемикача. mode: claude|local; manual: auto|on|off."""

    def __init__(self, path=None, cooldown_min=None, clock=time.time):
        self.path = pathlib.Path(path) if path else state_dir() / "router.json"
        self.cooldown = 60 * float(cooldown_min if cooldown_min is not None
                                   else os.environ.get("ASSISTANT_CLAUDE_RETRY_MIN", "30"))
        self.clock = clock

    def load(self):
        s = _read_json(self.path, {})
        s.setdefault("mode", "claude"); s.setdefault("manual", "auto")
        return s

    def save(self, s):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(self.path, s)

    def mode(self):
        s = self.load()
        return "local" if s["manual"] == "on" else "claude" if s["manual"] == "off" else s["mode"]

    def use_claude(self):
        """Чи пробувати Claude зараз (у локальному режимі — раз на кулдаун)."""
        s = self.load()
        if s["manual"] in ("on", "off"):
            return s["manual"] == "off"
        if s["mode"] == "claude":
            return True
        return self.clock() - s.get("last_fail", 0) >= self.cooldown

    def failure(self, reason):
        """Записати невдачу. True — щойно перейшли в локальний режим (треба одне повідомлення Михайлу)."""
        s = self.load()
        entered = s["mode"] != "local"
        s.update(mode="local", last_fail=self.clock(), reason=str(reason)[:300])
        if entered:
            s["since"] = self.clock()
        self.save(s)
        return entered and s["manual"] == "auto"

    def success(self):
        """Записати успіх Claude. True — щойно повернулися з локального режиму."""
        s = self.load()
        back = s["mode"] == "local"
        if back or "reason" in s:
            s.update(mode="claude"); s.pop("reason", None); s.pop("since", None)
            self.save(s)
        return back and s["manual"] == "auto"

    def set_manual(self, value):
        if value not in ("on", "off", "auto"):
            raise ValueError(value)
        s = self.load(); s["manual"] = value
        if value == "auto":            # одразу дати шанс Claude
            s["last_fail"] = 0
        self.save(s)

    def describe(self):
        s = self.load()
        txt = {"on": "локальний (вручну, /local on)", "off": "Claude (вручну, /local off)"}.get(s["manual"])
        if not txt:
            if s["mode"] == "local":
                left = max(0, int((s.get("last_fail", 0) + self.cooldown - self.clock()) / 60))
                txt = f"локальний (авто): {s.get('reason', '?')}; наступна спроба Claude за ~{left} хв"
            else:
                txt = "Claude (авто)"
        return txt


def run_claude_cmd(cmd, cwd=None, timeout=900):
    """Запустити claude. Повертає (ok, stdout, причина_недоступності)."""
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as e:
        return False, "", unavailable_reason(None, exc=e)
    reason = unavailable_reason(r.returncode, r.stdout, r.stderr)
    return reason is None, (r.stdout or "").strip(), reason


# ---------- відповідь локального режиму ----------
@dataclasses.dataclass
class Reply:
    text: str
    files: list = dataclasses.field(default_factory=list)
    markup: dict = None


DAY_ABBR = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]
WEEKDAYS = [  # (основа слова, номер дня) — uk/ru
    (r"понеділ\w*|понедельн\w*", 0), (r"вівтор\w*|вторн\w*", 1), (r"серед[уиа]|сред[уаы]", 2),
    (r"четвер\w*|четверг\w*", 3), (r"п[’'`ʼ]?ятниц\w*|пятниц\w*", 4), (r"субот\w*|суббот\w*", 5),
    (r"неділ\w*|воскресен\w*", 6)]
TASKS = "02 Задачі.md"


def now():
    return datetime.datetime.now()


def _night_tomorrow(t):
    """00:00–05:00 «завтра» = сьогоднішня календарна дата (00-core.md, «Дати в задачах»)."""
    return t.date() if t.hour < 5 else t.date() + datetime.timedelta(days=1)


def parse_when(text, t):
    """Знайти дату/час у тексті. Повертає (date|None, (h, m)|None, at_datetime|None, решта_тексту)."""
    rest = " " + text + " "
    date = hm = at = None

    def cut(m):
        nonlocal rest
        rest = rest[:m.start()] + " " + rest[m.end():]

    m = re.search(r"\sчерез\s+(?:(\d+)\s*|(пів|пол)\s*)?(хв\w*|мин\w*|год\w*|час\w*|дн\w*|день|дня|дней)", rest, re.I)
    if m:
        n = int(m.group(1)) if m.group(1) else (0.5 if m.group(2) else 1)
        unit = m.group(3).lower()
        delta = (datetime.timedelta(minutes=n) if unit.startswith(("хв", "мин")) else
                 datetime.timedelta(days=n) if unit.startswith(("дн", "ден", "дня", "дней")) else
                 datetime.timedelta(hours=n))
        at = t + delta
        date, hm = at.date(), (at.hour, at.minute)
        cut(m)
        return date, hm, at, rest.strip()
    for pat in (r"\s(?:о|об|at)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:годин\w*|час\w*))?(?:\s*(ранку|утра|дня|вечора|вечера|ночі|ночи))?(?=[\s,.!?]|$)",
                r"\s(?:в|во|на)\s+(\d{1,2}):(\d{2})(?:\s*(ранку|утра|дня|вечора|вечера|ночі|ночи))?(?=[\s,.!?]|$)",
                r"\s(?:в|во)\s+(\d{1,2})()\s*(?:годин\w*|час\w*)?\s*(ранку|утра|дня|вечора|вечера)(?=[\s,.!?]|$)",
                r"\s(?:в|во)\s+(\d{1,2})()\s*(?:годин\w*|час\w*)()(?=[\s,.!?]|$)"):
        m = re.search(pat, rest, re.I)
        if m and int(m.group(1)) < 24 and int(m.group(2) or 0) < 60:
            h, mi = int(m.group(1)), int(m.group(2) or 0)
            if m.group(3) and m.group(3).lower() in ("дня", "вечора", "вечера") and h < 12:
                h += 12
            hm = (h, mi); cut(m)
            break
    for pat, fn in ((r"\s(?:післязавтра|послезавтра)\b", lambda: t.date() + datetime.timedelta(days=2)),
                    (r"\s(?:сьогодні|сегодня)\b", lambda: t.date()),
                    (r"\s(?:на\s+)?завтра\b", lambda: _night_tomorrow(t))):
        m = re.search(pat, rest, re.I)
        if m:
            date = fn(); cut(m); break
    if date is None:
        for pat, wd in WEEKDAYS:
            m = re.search(rf"\s(?:у|в|во|на)?\s*(?:{pat})\b", rest, re.I)
            if m:
                ahead = (wd - t.weekday()) % 7 or 7
                date = t.date() + datetime.timedelta(days=ahead); cut(m); break
    if date is None:
        m = re.search(r"\s(?:на\s+|до\s+)?(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b", rest)
        if m:
            y = int(m.group(3)) if m.group(3) else t.year
            y = y + 2000 if y < 100 else y
            try:
                date = datetime.date(y, int(m.group(2)), int(m.group(1)))
                if not m.group(3) and date < t.date():
                    date = date.replace(year=y + 1)
                cut(m)
            except ValueError:
                pass
    if hm and date is None:
        date = t.date() if (hm[0], hm[1]) > (t.hour, t.minute) else t.date() + datetime.timedelta(days=1)
    if hm and date:
        at = datetime.datetime.combine(date, datetime.time(*hm))
    return date, hm, at, re.sub(r"\s{2,}", " ", rest).strip()


def _clean_what(s):
    s = re.sub(r"^\s*(?:мені|мне|будь ласка|пожалуйста)[\s,]+", "", s, flags=re.I)
    s = re.sub(r"^\s*(?:що|что|про те,? що|о том,? что|про|о том)\s+", "", s, flags=re.I)
    s = re.sub(r"\s+(?:до|на|у|в|о|об|к)\s*$", "", s.strip(), flags=re.I)
    s = re.sub(r"^[\s,:;—-]+|[\s,;—-]+$", "", s)
    return s[:1].upper() + s[1:] if s else s


# ---------- памʼять: 02 Задачі.md ----------
def day_heading(d):
    return f"## Сьогодні / {DAY_ABBR[d.weekday()]} {d:%d.%m}"


def _tasks_path():
    return memory_dir() / TASKS


def _read_lines():
    p = _tasks_path()
    return p.read_text(encoding="utf-8").splitlines() if p.exists() else ["# Задачі", ""]


def _write_lines(lines):
    p = _tasks_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")


def _insert_in_section(lines, idx, line):
    end = next((j for j in range(idx + 1, len(lines)) if lines[j].startswith("## ")), len(lines))
    last = idx
    for j in range(idx + 1, end):
        if lines[j].strip():
            last = j
    lines.insert(last + 1, line)


def add_to_day(d, line):
    """Рядок у розділ «## Сьогодні / <День дд.мм>» дати d (розділ створюється одразу після шапки)."""
    lines = _read_lines()
    key = re.compile(rf"^## .*\b{d:%d\.%m}\b")
    idx = next((i for i, l in enumerate(lines) if key.match(l)), None)
    if idx is None:
        first = next((i for i, l in enumerate(lines) if l.startswith("## ")), len(lines))
        block = [day_heading(d), line, ""]
        if first == len(lines) and lines and lines[-1].strip():
            block = [""] + block
        lines[first:first] = block
    else:
        _insert_in_section(lines, idx, line)
    _write_lines(lines)
    return line in _tasks_path().read_text(encoding="utf-8")


def add_to_section(title, line):
    lines = _read_lines()
    idx = next((i for i, l in enumerate(lines) if l.strip() == f"## {title}"), None)
    if idx is None:
        if lines and lines[-1].strip():
            lines.append("")
        lines += [f"## {title}", line]
    else:
        _insert_in_section(lines, idx, line)
    _write_lines(lines)
    return line in _tasks_path().read_text(encoding="utf-8")


def open_items(dates=None, t=None, limit=40, overdue=True):
    """Незакриті пункти: розділи вказаних дат (і прострочені), «Цей тиждень», «Нагадування»."""
    t = t or now()
    dates = dates or [t.date()]
    lines = _read_lines()
    out, take, head = [], False, ""
    for l in lines:
        if l.startswith("## "):
            head = l[3:].strip()
            m = re.search(r"\b(\d{2})\.(\d{2})\b", head)
            if m:
                try:
                    d = datetime.date(t.year, int(m.group(2)), int(m.group(1)))
                except ValueError:
                    d = None
                take = bool(d) and (d in dates or (overdue and d < dates[0]))
                head = head + (" (перенесено)" if d and d < dates[0] else "")
            else:
                take = overdue and head.startswith(("Цей тиждень", "Нагадування", "Завтра"))
            if take:
                out.append(head)
            continue
        if take and l.strip().startswith("- [ ]"):
            out.append("  " + l.strip()[6:])
    out = [x for i, x in enumerate(out) if x.startswith("  ") or (i + 1 < len(out) and out[i + 1].startswith("  "))]
    return out[:limit]


# ---------- нагадування з часом: окремий стан, бот надсилає їх сам ----------
def _rem_path():
    return state_dir() / "reminders.json"


def schedule_reminder(at, text):
    rs = _read_json(_rem_path(), [])
    rs.append({"id": uuid.uuid4().hex[:8], "at": at.isoformat(timespec="minutes"), "text": text, "sent": False})
    _write_json(_rem_path(), rs[-200:])


def due_reminders(t=None):
    """Тексти нагадувань, час яких настав (позначає надісланими). Викликає головний цикл бота."""
    t = t or now()
    rs = _read_json(_rem_path(), [])
    due = [r for r in rs if not r.get("sent") and datetime.datetime.fromisoformat(r["at"]) <= t]
    if due:
        for r in due:
            r["sent"] = True
        _write_json(_rem_path(), rs)
    return [r["text"] for r in due]


# ---------- зовнішні скрипти ----------
def run_tool(args, timeout=120):
    """(код, вивід) скрипта; код 127 — скрипта немає."""
    try:
        r = subprocess.run([str(a) for a in args], capture_output=True, text=True, timeout=timeout, cwd=repo())
        return r.returncode, ((r.stdout or "").strip() or (r.stderr or "").strip())
    except FileNotFoundError:
        return 127, "скрипт не знайдено"
    except subprocess.TimeoutExpired:
        return 124, "не відповів вчасно"


def _py():
    return sys.executable or "python3"


# ---------- пошта: чернетки й кнопки ----------
def _mail_state_path():
    return state_dir() / "mail-pending.json"


def _gmail():
    sys.path.insert(0, str(bin_dir()))
    import gmail  # noqa: E402
    return gmail


def default_mail_sender(draft):
    """Справжнє надсилання — лише через gmail.py з --confirmed (виклик тільки з кнопки)."""
    f = tmp_dir() / f"mail-{draft['id']}.txt"
    f.write_text(draft["body"], encoding="utf-8")
    code, out = run_tool([_py(), bin_dir() / "gmail.py", "send", "--to", draft["to"], "--subject", draft["subject"],
                          "--body-file", f, "--confirmed", draft["id"]], timeout=60)
    f.unlink(missing_ok=True)
    return code == 0, out


MAIL_SENDER = default_mail_sender   # тести підміняють


def mail_markup(did):
    return {"inline_keyboard": [[{"text": "📤 Надіслати", "callback_data": f"mail:send:{did}"},
                                 {"text": "✏️ Змінити", "callback_data": f"mail:edit:{did}"},
                                 {"text": "🚫 Скасувати", "callback_data": f"mail:drop:{did}"}]]}


def _show_draft(d):
    return Reply(f"📧 Чернетка листа\nКому: {d['to']}\nТема: {d['subject']}\n\n{d['body']}\n\n"
                 "Надіслати? Без натискання кнопки лист не піде.", markup=mail_markup(d["id"]))


def mail_draft(to, subject, body):
    g = _gmail()
    if g.blocked(to):
        return Reply(f"⛔ {to} у списку do-not-contact — лист не готую.")
    if g.sent_today() >= g.daily_limit():
        return Reply(f"⛔ Денний ліміт {g.daily_limit()} листів вичерпано — спробуй завтра.")
    st = _read_json(_mail_state_path(), {"drafts": {}})
    did = uuid.uuid4().hex[:8]
    d = {"id": did, "to": to, "subject": subject or body.split("\n")[0][:60], "body": body,
         "status": "pending", "created": now().isoformat(timespec="minutes")}
    st["drafts"][did] = d
    st["drafts"] = dict(list(st["drafts"].items())[-30:])
    _write_json(_mail_state_path(), st)
    return _show_draft(d)


def mail_button(rest):
    """Натискання «mail:<дія>:<id>». Лише тут лист може бути надісланий."""
    action, _, did = rest.partition(":")
    st = _read_json(_mail_state_path(), {"drafts": {}})
    d = st["drafts"].get(did)
    if not d or d["status"] not in ("pending", "editing"):
        return Reply("Цю чернетку вже оброблено або не знайдено.")
    if action == "send":
        ok, out = MAIL_SENDER(d)
        d["status"] = "sent" if ok else "pending"
        if st.get("editing") == did:
            st.pop("editing")
        _write_json(_mail_state_path(), st)
        return Reply(f"📤 Надіслано: {d['to']} — «{d['subject']}»" if ok else f"⚠️ Не надіслано: {out[-300:]}")
    if action == "edit":
        d["status"] = "editing"; st["editing"] = did
        _write_json(_mail_state_path(), st)
        return Reply("✏️ Напиши новий текст листа (або «тема: …», щоб змінити тему).")
    d["status"] = "dropped"
    if st.get("editing") == did:
        st.pop("editing")
    _write_json(_mail_state_path(), st)
    return Reply("🚫 Лист скасовано.")


def _mail_edit(text):
    st = _read_json(_mail_state_path(), {"drafts": {}})
    did = st.get("editing")
    d = st["drafts"].get(did) if did else None
    if not d or d["status"] != "editing":
        return None
    m = re.match(r"^\s*(?:тема|subject)\s*[:\-—]\s*(.+)$", text, re.I | re.S)
    if m:
        d["subject"] = m.group(1).strip()
    else:
        d["body"] = text.strip()
    d["status"] = "pending"; st.pop("editing", None)
    _write_json(_mail_state_path(), st)
    return _show_draft(d)


EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def _mail_send_intent(text):
    if not re.search(r"(надішл|надіслат|напиш|відправ|отправ|пошли)\w*\s+(\w+\s+)?(лист|письм|e-?mail|імейл|мейл)", text, re.I):
        return None
    m = EMAIL_RE.search(text)
    if not m:
        return Reply("Вкажи адресу: «надішли лист на name@example.com, тема: …, текст: …».")
    after = text[m.end():]
    subj = re.search(r"тема\s*[:\-—]\s*(.+?)(?=[,;.]?\s*(?:текст|повідомлення|сообщение)\s*[:\-—]|\n|$)", after, re.I | re.S)
    body = re.search(r"(?:текст|повідомлення|сообщение)\s*[:\-—]\s*(.+)$", after, re.I | re.S)
    body_txt = body.group(1).strip() if body else re.sub(r"^[\s,:;—-]+", "", after if not subj else "").strip()
    if not body_txt:
        return Reply("Немає тексту листа. Формат: «надішли лист на name@example.com, тема: …, текст: …».")
    return mail_draft(m.group(0), subj.group(1).strip() if subj else "", body_txt)


# ---------- інтенти ----------
TASK_RE = re.compile(r"^\s*(?:будь ласка[,\s]+|пожалуйста[,\s]+)?(?:додай|добав\w*|запиши|створи|создай|постав)\s+"
                     r"(?:мені\s+|мне\s+)?(?:нову\s+|новую\s+)?задач[уаи]\s*[:\-—,]?\s*(.+)$|^\s*задача\s*[:\-—]\s*(.+)$",
                     re.I | re.S)
REMIND_RE = re.compile(r"^\s*(?:будь ласка[,\s]+|пожалуйста[,\s]+)?(?:нагадай|нагадати|напомни|напомнить)\s+(.+)$", re.I | re.S)
CAL_RE = re.compile(r"(що|які|что|какие)\s+(?:там\s+)?(в|у)\s+(мене|меня)\b|календар|розклад|расписан|"
                    r"план\w*\s+на\s+(сьогодні|сегодня|завтра|тиж|недел)", re.I)
MAILREAD_RE = re.compile(r"пошт|почт|\bлист(и|ів)\b|\bписьм|gmail|e-?mail|імейл|мейл", re.I)
MONEY_RE = re.compile(r"баланс|витрат|расход|трат[иы]|скільки\s+(грошей|на\s+рахун)|сколько\s+денег|виписк|выписк|"
                      r"монобанк|monobank|надходжен|поступлен", re.I)
PDF_RE = re.compile(r"^\s*(?:зроби|зробити|сделай|збережи|сохрани|перетвори|оформи)?\s*(?:це\s+|это\s+|мені\s+|мне\s+)?"
                    r"(?:у|в|як|как)?\s*(?:pdf|пдф)\b", re.I)
HELP_RE = re.compile(r"^\s*(/help|що ти (вмієш|можеш)|что ты (умеешь|можешь)|допомога|помощь)\b", re.I)

HELP_TEXT = ("Зараз локальний режим (Claude недоступний). Працює без ШІ:\n"
             "• «додай задачу … [сьогодні/завтра/у пт/дд.мм]»\n"
             "• «нагадай завтра о 10 …», «нагадай через 30 хв …»\n"
             "• «що в мене сьогодні / завтра / на тижні» — календар і задачі\n"
             "• «пошта» — непрочитане; «надішли лист на адреса, тема: …, текст: …» — лише кнопкою\n"
             "• «баланс», «витрати за місяць» — Монобанк\n"
             "• «pdf: текст» — PDF; голосові розшифровую\n"
             "Решту відповідає локальна модель — простіше, ніж Claude. /local auto|on|off — режим.")


def intent_task(text, t):
    m = TASK_RE.match(text)
    if not m:
        return None
    body = (m.group(1) or m.group(2) or "").strip()
    date, hm, _, rest = parse_when(body, t)
    what = _clean_what(rest)
    if not what:
        return Reply("Яку задачу записати? Напиши: «додай задачу …».")
    if hm:
        what += f" (о {hm[0]:02d}:{hm[1]:02d})"
    line = f"- [ ] {what}"
    try:
        ok = add_to_day(date, line) if date else add_to_section("Цей тиждень", line)
    except OSError as e:
        return Reply(f"⚠️ Не вдалося записати задачу: {e}")
    where = f"{DAY_ABBR[date.weekday()]} {date:%d.%m}" if date else "цей тиждень"
    return Reply(f"✅ Записав задачу ({where}): {what}" if ok else "⚠️ Не вдалося записати задачу у файл.")


def intent_remind(text, t):
    m = REMIND_RE.match(text)
    if not m:
        return None
    date, hm, at, rest = parse_when(m.group(1), t)
    what = _clean_what(rest)
    if not what:
        return Reply("Про що нагадати? Напиши: «нагадай завтра о 10 подзвонити …».")
    date = date or t.date()
    when = f"{date:%d.%m}" + (f" о {hm[0]:02d}:{hm[1]:02d}" if hm else "")
    line = f"- [ ] 🔔 {what} (нагадати {when})"
    try:
        ok = add_to_day(date, line)
    except OSError as e:
        return Reply(f"⚠️ Не вдалося записати нагадування: {e}")
    if not ok:
        return Reply("⚠️ Не вдалося записати нагадування у файл.")
    if at and at > t:
        schedule_reminder(at, what)
        return Reply(f"🔔 Записав і нагадаю {DAY_ABBR[date.weekday()]} {when}: {what}")
    return Reply(f"🔔 Записав на {DAY_ABBR[date.weekday()]} {when}: {what} (буде в ранковому брифінгу)")


def intent_calendar(text, t):
    if not CAL_RE.search(text):
        return None
    kind = "week" if re.search(r"тиж|недел", text, re.I) else "tomorrow" if re.search(r"завтра", text, re.I) else "today"
    code, out = run_tool([_py(), bin_dir() / "gcal.py", kind], timeout=60)
    if code == 0:
        cal = "📅 " + out
    elif code == 3:
        cal = "📅 Календар не підключено на Mac mini (немає OAuth-токена в ~/.assistant-google/) — показую лише задачі з памʼяті."
    else:
        cal = f"📅 Календар зараз недоступний ({out[-150:]})."
    d0 = t.date() + datetime.timedelta(days=1 if kind == "tomorrow" else 0)
    days = [d0 + datetime.timedelta(days=i) for i in range(7 if kind == "week" else 1)]
    items = open_items(days, t)
    tasks = ("\n🗒 Задачі:\n" + "\n".join(items)) if items else "\n🗒 Відкритих задач на цей період у памʼяті немає."
    return Reply(cal + "\n" + tasks)


def intent_mail(text, t):
    r = _mail_send_intent(text)
    if r:
        return r
    if not MAILREAD_RE.search(text):
        return None
    code, out = run_tool([_py(), bin_dir() / "gmail.py", "unread", "--limit", "8"], timeout=90)
    if code == 0:
        return Reply("📩 Пошта (непрочитане за добу):\n" + out)
    if code == 3:
        return Reply("📩 Пошту не підключено на Mac mini (немає OAuth-токена в ~/.assistant-google/).")
    return Reply(f"📩 Пошта зараз недоступна ({out[-150:]}).")


def intent_money(text, t):
    if not MONEY_RE.search(text):
        return None
    mono = repo() / "tools/monobank/mono.sh"
    acc = ["-a", "fop"] if re.search(r"\bфоп\b|\bfop\b", text, re.I) else []
    if re.search(r"витрат|расход|трат|надходжен|поступлен|виписк|выписк", text, re.I):
        days = "30" if re.search(r"місяц|месяц|30", text, re.I) else "7"
        code, out = run_tool([mono, "summary", *acc, "--days", days], timeout=180)
    else:
        code, out = run_tool([mono, "balance"], timeout=180)
    if code != 0:
        return Reply(f"💳 Монобанк недоступний ({out[-200:]}).")
    return Reply("💳 " + out[-3000:])


def _last_assistant_reply():
    for j in reversed(_dialog(40)):
        if j.get("who") != "Михайло" and len(j.get("text", "")) > 40:
            return j["text"]
    return ""


def intent_pdf(text, t):
    m = PDF_RE.search(text)
    if not m:
        return None
    body = text[m.end():].lstrip(" :—-\n")
    if len(body) < 20:
        body = _last_assistant_reply()
    if not body:
        return Reply("Що покласти в PDF? Напиши «pdf: текст» або спершу отримай відповідь, яку зберегти.")
    md = tmp_dir() / f"local-{t:%Y%m%d-%H%M%S}.md"
    title = body.strip().split("\n")[0][:80]
    md.write_text(f"# {title}\n\n{body}\n", encoding="utf-8")
    code, out = run_tool([bin_dir() / "md2pdf.sh", md], timeout=180)
    pdf = out.strip().splitlines()[-1] if out.strip() else ""
    if code == 0 and pdf and os.path.isfile(pdf):
        return Reply("📄 PDF готовий.", files=[pdf])
    return Reply(f"⚠️ PDF не вийшов ({out[-200:]}).")


# ---------- Ollama ----------
def _dialog(n=10):
    p = memory_dir() / ".dialog.jsonl"
    try:
        lines = p.read_text(encoding="utf-8").splitlines()[-n:]
    except OSError:
        return []
    out = []
    for l in lines:
        try:
            out.append(json.loads(l))
        except ValueError:
            pass
    return out


SYSTEM = ("Ти персональний помічник Михайла (засновник студії дизайну інтерʼєру). Зараз працює локальна модель на "
          "його Mac mini, бо Claude недоступний. Відповідай коротко (до 8 рядків), мовою питання (типово українською), "
          "на «ти», без Markdown. Не вигадуй фактів, подій календаря, листів, сум чи дат — якщо не знаєш, так і скажи. "
          "Ти НЕ можеш виконувати дії (надсилати, записувати, шукати в інтернеті) — лише відповідати текстом; для дій "
          "підкажи команди: «додай задачу …», «нагадай завтра о 10 …», «що в мене сьогодні», «пошта», «баланс», "
          "«pdf: …». /no_think")


def strip_think(s):
    s = re.sub(r"<think>.*?</think>", "", s or "", flags=re.S)
    s = re.sub(r"^.*?</think>", "", s, flags=re.S)      # якщо відкривального тега немає
    return re.sub(r"<think>.*$", "", s, flags=re.S).strip()


def ollama_chat(text, history=None, system_extra="", timeout=None):
    """Відповідь локальної моделі або None, якщо Ollama недоступна.
    Адреси пробуємо по черзі: ASSISTANT_OLLAMA_URL (одна Ollama :11434, моделі на SSD — з 04.11), далі
    ASSISTANT_OLLAMA_FALLBACK_URLS (типово порожньо; друга копія :11435 прибрана)."""
    urls = [os.environ.get("ASSISTANT_OLLAMA_URL", "http://127.0.0.1:11434")]
    urls += [u for u in os.environ.get("ASSISTANT_OLLAMA_FALLBACK_URLS", "").split(",") if u.strip()]
    for u in dict.fromkeys(x.strip().rstrip("/") for x in urls):
        ans = _ollama_chat_at(u + "/api/chat", text, history, system_extra, timeout)
        if ans:
            return ans
    return None


def _ollama_chat_at(url, text, history=None, system_extra="", timeout=None):
    model = os.environ.get("ASSISTANT_LOCAL_MODEL", "qwen3:8b")
    timeout = timeout or float(os.environ.get("ASSISTANT_OLLAMA_TIMEOUT", "120"))
    msgs = [{"role": "system", "content": SYSTEM + ("\n\n" + system_extra if system_extra else "")}]
    msgs += history or []
    msgs.append({"role": "user", "content": text})
    body = {"model": model, "messages": msgs, "stream": False, "think": False,
            "options": {"temperature": 0.3, "num_predict": int(os.environ.get("ASSISTANT_OLLAMA_MAX_TOKENS", "600"))}}
    for attempt in (0, 1):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.load(r)
            ans = strip_think((d.get("message") or {}).get("content", ""))
            return ans[:3500] or None
        except urllib.error.HTTPError as e:
            # стара Ollama не знає поля think — повторюємо без нього
            if attempt == 0 and e.code == 400:
                body.pop("think", None); continue
            return None
        except Exception:
            return None
    return None


def ollama_reply(text, t):
    hist = []
    for j in _dialog(11):
        hist.append({"role": "user" if j.get("who") == "Михайло" else "assistant", "content": str(j.get("text", ""))[:1200]})
    if hist and hist[-1]["role"] == "user" and hist[-1]["content"].strip() == text.strip()[:1200]:
        hist.pop()                                   # бот уже записав поточне повідомлення в діалог
    hist = hist[-10:]
    items = open_items([t.date()], t, limit=25)
    extra = f"Зараз {t:%Y-%m-%d %H:%M} ({DAY_ABBR[t.weekday()]})."
    if items:
        extra += "\nВідкриті задачі з памʼяті:\n" + "\n".join(items)
    ans = ollama_chat(text, hist, extra)
    if ans:
        return Reply(ans)
    return Reply("⚠️ Claude недоступний, і локальна модель (Ollama) теж не відповідає. Працюють лише команди: "
                 "«додай задачу …», «нагадай …», «що в мене сьогодні», «пошта», «баланс», «pdf: …».")


# ---------- головний вхід ----------
INTENTS = [intent_task, intent_remind, intent_pdf, intent_mail, intent_money, intent_calendar]


def handle_text(text, t=None):
    t = t or now()
    text = (text or "").strip()
    if not text:
        return Reply("Порожнє повідомлення.")
    edited = _mail_edit(text)
    if edited:
        return edited
    if HELP_RE.match(text):
        return Reply(HELP_TEXT)
    for fn in INTENTS:
        r = fn(text, t)
        if r:
            return r
    return ollama_reply(text, t)


def handle(kind, content, caption="", t=None):
    """Повідомлення Михайла в локальному режимі. kind — як у bot.describe(): текст/голосове/аудіозапис/файл/фото/…"""
    t = t or now()
    if kind == "текст":
        return handle_text(content, t)
    if kind in ("голосове", "аудіозапис", "відеоповідомлення"):
        code, out = run_tool([bin_dir() / "transcribe.sh", content], timeout=900)
        if code != 0 or not out.strip():
            return Reply(f"⚠️ Не вдалося розшифрувати {kind} локально ({out[-200:]}). Файл збережено: {content}")
        if kind == "аудіозапис":                      # Plaud / довгий запис — транскрипт у Вхідні, конспект зробить Claude
            inbox = memory_dir() / "Вхідні"
            inbox.mkdir(parents=True, exist_ok=True)
            p = inbox / f"{t:%Y-%m-%d %H%M} транскрипт.md"
            p.write_text(f"# Транскрипт {t:%d.%m.%Y %H:%M}\n\nФайл: {content}\n\n{out}\n", encoding="utf-8")
            return Reply(f"🎙 Розшифрував запис ({len(out)} знаків) і зберіг у «Вхідні». Конспект зробить Claude, коли повернеться.",
                         files=[str(p)])
        r = handle_text(out, t)
        r.text = f"Зрозумів: «{out[:300]}»\n\n" + r.text
        return r
    note = f" Підпис: {caption}." if caption else ""
    if caption:
        r = handle_text(caption, t)
        r.text = f"📎 {kind.capitalize()} збережено: {content}\n\n" + r.text
        return r
    return Reply(f"📎 {kind.capitalize()} збережено: {content}.{note} У локальному режимі вміст не аналізую — "
                 "опрацюю, коли Claude повернеться (або напиши, що з ним зробити).")


# ---------- CLI ----------
def notify(text):
    tg = os.environ.get("ASSISTANT_TG_OUT") or str(bin_dir() / "tg-out.sh")
    try:
        subprocess.run([tg, "text", text], capture_output=True, timeout=60)
    except Exception as e:
        print("не вдалося надіслати повідомлення:", e, file=sys.stderr)


def cli(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    r = Router()
    if argv[0] == "status":
        print(r.describe()); return 0
    if argv[0] == "set":
        r.set_manual(argv[1]); print(r.describe()); return 0
    if argv[0] == "claude-run":
        rest = argv[1:]
        notify_on = "--notify" in rest[: rest.index("--")] if "--" in rest else False
        cmd = rest[rest.index("--") + 1:] if "--" in rest else rest
        if not r.use_claude():
            print("локальний режим: " + r.describe(), file=sys.stderr); return 10
        ok, out, reason = run_claude_cmd(cmd, timeout=float(os.environ.get("ASSISTANT_CLAUDE_TIMEOUT", "900")))
        if not ok:
            print("Claude недоступний: " + reason, file=sys.stderr)
            if r.failure(reason) and notify_on:
                notify(ENTER_MSG)
            return 10
        if r.success() and notify_on:
            notify(BACK_MSG)
        print(out)
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(cli(sys.argv[1:]))
