#!/usr/bin/env python3
"""Меню бота помічника: команди Telegram, постійна клавіатура й inline-кнопки (23.11.2026).

Усе тут — без моделі (ні Claude, ні Ollama): команди й кнопки викликають ту саму логіку, що й наміри
локального режиму (local_mode.py) та локальний брифінг (local_briefing.py). Тому меню однаково працює
і в режимі з Claude, і в локальному — і не витрачає токенів.

  parse(text)                 → (команда, аргументи) або None: «/today», «/today@bot», «📅 Сьогодні» …
  command(cmd, args, t)       → (Reply, очікування|None): відповідь і, для «/remind» без тексту чи «➕ Нова»,
                                що робити з НАСТУПНИМ повідомленням («task» | «remind»)
  awaited(kind, text, t)      → Reply: наступне повідомлення після «➕ Нова» / «/remind»
  button(data, t)             → Button: натискання inline-кнопки «m:…» (повторне — без повторної дії)
  reminder_markup(rid)        → кнопки під нагадуванням, що спрацювало
  COMMANDS / commands_payload() — список для setMyCommands; KEYBOARD / HIDE — reply_markup

Callback-и (≤ 64 байти): m:c:today|tomorrow — календар; m:d:<id> — задача виконана; m:new — нова задача;
m:rh|rt|rd:<id> — нагадування +1 год / завтра 10:00 / готово. id задачі — 8 знаків sha1 від тексту рядка
в «02 Задачі.md» (без окремого стану: рядок знаходимо за хешем, уже закритий — «вже виконано»).
"""
import dataclasses, datetime, hashlib, json, re

import local_mode as L

# ---------- команди ----------
COMMANDS = [   # (команда, опис у меню Telegram)
    ("today", "Що сьогодні: календар, задачі, нагадування"),
    ("tomorrow", "Що завтра"),
    ("inbox", "Вхідні: хто чекає відповіді в Telegram і пошті"),
    ("tasks", "Відкриті задачі з кнопками «Виконано»"),
    ("remind", "Нагадування: /remind завтра о 10 дзвінок"),
    ("money", "Баланс; /money витрати місяць"),
    ("mail", "Непрочитана пошта"),
    ("caps", "Що вмію й які програми встановлені"),
    ("menu", "Показати кнопки під полем вводу"),
    ("help", "Що вміє бот"),
    ("new", "Почати нову розмову"),
    ("status", "Режим і стан бота"),
]
BUTTONS = {"📅 Сьогодні": "today", "📥 Вхідні": "inbox", "✅ Задачі": "tasks", "💰 Гроші": "money"}
KEYBOARD = {"keyboard": [[{"text": "📅 Сьогодні"}, {"text": "📥 Вхідні"}],
                         [{"text": "✅ Задачі"}, {"text": "💰 Гроші"}]],
            "resize_keyboard": True, "is_persistent": True,
            "input_field_placeholder": "Напиши або обери дію"}
HIDE = {"remove_keyboard": True}
LOCAL = {"today", "tomorrow", "inbox", "tasks", "remind", "money", "mail", "menu", "hide", "help", "caps"}   # без моделі
# «що ти вмієш», «які програми встановлені» … (uk/ru/en) — як /caps, без моделі: відповідь із реєстру можливостей,
# а не «з голови» (23.11: бот казав «ace-step не встановлено», хоча генератор стояв на Mac mini)
CAPS_TEXT = re.compile(
    r"^\s*(?:а\s+)?(?:"
    r"що\s+(?:ти\s+)?(?:вмієш|можеш)(?:\s+робити)?|що\s+ти\s+вмієш\s+робити|які\s+(?:в\s+тебе\s+|у\s+тебе\s+)?(?:є\s+)?(?:твої\s+)?функції|"
    r"твої\s+(?:функції|можливості)|які\s+(?:в\s+тебе\s+)?(?:є\s+)?можливості|"
    r"які\s+(?:програми|інструменти)\s+(?:в\s+тебе\s+|у\s+тебе\s+)?(?:є|встановлені|встановлено)(?:\s+на\s+(?:мак\w*|mac\w*|компʼютері|комп'ютері))?|"
    r"що\s+(?:в\s+тебе\s+|у\s+тебе\s+)?встановлено|"
    r"что\s+(?:ты\s+)?(?:умеешь|можешь)(?:\s+делать)?|какие\s+(?:у\s+тебя\s+)?(?:есть\s+)?(?:твои\s+)?(?:функции|возможности)|"
    r"твои\s+(?:функции|возможности)|какие\s+(?:программы|инструменты)\s+(?:у\s+тебя\s+)?(?:есть|установлены|установлено)(?:\s+на\s+\w+)?|"
    r"что\s+(?:у\s+тебя\s+)?установлено|"
    r"what\s+can\s+you\s+do|your\s+(?:capabilities|functions|features)|what(?:'s|\s+is)\s+installed|"
    r"which\s+(?:programs|tools|apps)\s+(?:are\s+)?installed"
    r")\s*[?!.]*\s*$", re.I)
AWAIT_MIN = 10                              # «➕ Нова» / «/remind» чекають наступне повідомлення 10 хв
TASK_BUTTONS = 5

HELP = ("Кнопки внизу й меню «/» працюють без ШІ — миттєво й без лімітів:\n"
        "/today, /tomorrow — календар, задачі й нагадування\n"
        "/inbox — хто чекає відповіді в Telegram і пошті\n"
        "/tasks — відкриті задачі, «✅» — виконано, «➕ Нова» — додати\n"
        "/remind завтра о 10 дзвінок з підрядником — нагадування\n"
        "/money — баланс, /money витрати місяць — витрати\n"
        "/mail — непрочитана пошта\n"
        "/caps — що вмію й які програми встановлені на Mac (/caps refresh — перевірити заново)\n"
        "/menu — показати кнопки, /hide — сховати\n"
        "Усе інше пиши словами або голосом — відповідає Claude (або локальна модель, коли Claude недоступний).")


def commands_payload():
    return [{"command": c, "description": d} for c, d in COMMANDS]


def parse(text):
    """Команда меню з тексту або None. Звичайний текст (навіть «сьогодні») — не команда: його розуміє модель."""
    s = (text or "").strip()
    if s in BUTTONS:
        return BUTTONS[s], ""
    if len(s) <= 80 and CAPS_TEXT.match(s):
        return "caps", ""
    m = re.match(r"^/([a-z]+)(?:@\w+)?(?:\s+(.*))?$", s, re.S)
    if m and m.group(1) in LOCAL:
        return m.group(1), (m.group(2) or "").strip()
    return None


# ---------- перегляди ----------
def day_view(kind, t):
    """Календар + задачі + нагадування — той самий intent_calendar локального режиму."""
    return L.intent_calendar("що в мене завтра" if kind == "tomorrow" else "що в мене сьогодні", t)


def task_id(text):
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:8]


def _task_lines(t):
    """Відкриті задачі (як open_items: сьогодні, прострочені, «Цей тиждень», «Нагадування»): [(заголовок|None, текст)]."""
    out = []
    for x in L.open_items([t.date()], t, limit=60):
        out.append((None, x.strip()) if x.startswith("  ") else (x, None))
    return out


def tasks_view(t):
    rows, buttons, n = [], [], 0
    for head, text in _task_lines(t):
        if head:
            rows.append(head)
            continue
        n += 1
        rows.append(f"  {n}. {text}")
        if len(buttons) < TASK_BUTTONS:
            buttons.append([{"text": f"✅ {n}. {text[:32]}", "callback_data": f"m:d:{task_id(text)}"}])
    buttons.append([{"text": "➕ Нова", "callback_data": "m:new"}])
    body = "\n".join(rows) if n else "Відкритих задач у памʼяті немає."
    return L.Reply("✅ Задачі\n" + body, markup={"inline_keyboard": buttons})


def mark_done(tid):
    """Закрити рядок «- [ ] …» з цим id. (True, текст) | (False, причина). Повторно — «вже виконано»."""
    lines = L._read_lines()
    for i, l in enumerate(lines):
        s = l.strip()
        if s.startswith("- [ ]") and task_id(s[6:]) == tid:
            lines[i] = l.replace("- [ ]", "- [x]", 1)
            L._write_lines(lines)
            return True, s[6:]
    for l in lines:
        s = l.strip()
        if re.match(r"^- \[[xX]\]", s) and task_id(s[6:]) == tid:
            return False, "Вже виконано"
    return False, "Задачу не знайдено (файл змінився) — онови список"


def inbox_view():
    """Хто чекає відповіді — ті самі блоки, що в ранковому брифінгу (local_briefing.py)."""
    import local_briefing as B
    return L.Reply("📥 Вхідні\n" + B.telegram_block() + "\n\n" + B.mail_block())


def _money(args, t):
    return L.intent_money(args if L.MONEY_RE.search(args or "") else "баланс " + (args or ""), t)


def caps_view(args="", mode_line=""):
    """/caps: згрупований список із реєстру (capabilities.py) — без моделі; довгий — кількома повідомленнями."""
    import capabilities as C
    parts = C.render(refresh=(args or "").strip().lower() in ("refresh", "оновити", "обнови", "r"), mode_line=mode_line)
    return L.Reply(parts[0], extra=parts[1:])


def command(cmd, args="", t=None, mode_line=""):
    """(Reply, очікування) для команди меню."""
    t = t or L.now()
    if cmd == "caps":
        return caps_view(args, mode_line), None
    if cmd in ("today", "tomorrow"):
        return day_view(cmd, t), None
    if cmd == "tasks":
        return tasks_view(t), None
    if cmd == "inbox":
        return inbox_view(), None
    if cmd == "money":
        return _money(args, t), None
    if cmd == "mail":
        return L.intent_mail("пошта", t), None
    if cmd == "remind":
        if args:
            return awaited("remind", args, t), None
        return L.Reply("🔔 Про що й коли нагадати? Напиши одним повідомленням, напр.: «завтра о 10 дзвінок з підрядником», "
                       "«через 30 хв перевірити пошту»."), "remind"
    if cmd == "menu":
        return L.Reply("Кнопки внизу. /hide — сховати.", markup=KEYBOARD), None
    if cmd == "hide":
        return L.Reply("Кнопки сховано. /menu — показати знову.", markup=HIDE), None
    return L.Reply(HELP, markup=KEYBOARD), None


def awaited(kind, text, t=None):
    """Наступне повідомлення після «➕ Нова» (kind=task) або «/remind» (kind=remind)."""
    t = t or L.now()
    text = (text or "").strip()
    if kind == "remind":
        return L.intent_remind(text if L.REMIND_RE.match(text) else "нагадай " + text, t)
    return L.intent_task(text if L.TASK_RE.match(text) else "додай задачу " + text, t)


# ---------- нагадування, що спрацювали ----------
def reminder_markup(rid):
    return {"inline_keyboard": [[{"text": "⏰ +1 год", "callback_data": f"m:rh:{rid}"},
                                 {"text": "🌙 Завтра 10:00", "callback_data": f"m:rt:{rid}"},
                                 {"text": "✅ Готово", "callback_data": f"m:rd:{rid}"}]]}


def due_reminders(t=None):
    """Як local_mode.due_reminders, але з id для кнопок: [{"id","text"}]."""
    t = t or L.now()
    rs = L._read_json(L._rem_path(), [])
    due = [r for r in rs if not r.get("sent") and datetime.datetime.fromisoformat(r["at"]) <= t]
    if due:
        for r in due:
            r["sent"] = True
        L._write_json(L._rem_path(), rs)
    return [{"id": r["id"], "text": r["text"]} for r in due]


def _close_reminder_line(text):
    lines = L._read_lines()
    for i, l in enumerate(lines):
        if l.strip().startswith(f"- [ ] 🔔 {text} (нагадати"):
            lines[i] = l.replace("- [ ]", "- [x]", 1)
            L._write_lines(lines)
            return True
    return False


def reminder_action(op, rid, t):
    """op: rh (+1 год), rt (завтра 10:00), rd (готово). (змінено?, текст)."""
    rs = L._read_json(L._rem_path(), [])
    r = next((x for x in rs if x.get("id") == rid), None)
    if not r:
        return False, "Нагадування не знайдено"
    if r.get("acted"):
        return False, "Вже оброблено: " + {"snoozed": "відкладено", "done": "готово"}.get(r["acted"], r["acted"])
    if op == "rd":
        r["acted"] = "done"
        L._write_json(L._rem_path(), rs)
        _close_reminder_line(r["text"])
        return True, f"✅ Готово: {r['text']}"
    at = (t + datetime.timedelta(hours=1)).replace(second=0, microsecond=0) if op == "rh" else \
        datetime.datetime.combine(L._night_tomorrow(t), datetime.time(10, 0))
    r["acted"] = "snoozed"
    L._write_json(L._rem_path(), rs)
    L.schedule_reminder(at, r["text"])
    return True, f"⏰ Нагадаю {L.DAY_ABBR[at.weekday()]} {at:%d.%m} о {at:%H:%M}: {r['text']}"


# ---------- кнопки ----------
@dataclasses.dataclass
class Button:
    toast: str                 # коротко у спливному повідомленні (answerCallbackQuery, ≤ 200 знаків)
    edit: L.Reply = None       # замінити повідомлення з кнопкою (текст + нові кнопки)
    send: L.Reply = None       # нове повідомлення
    await_kind: str = None     # що робити з наступним повідомленням
    note: str = ""             # дописати до старого повідомлення й прибрати кнопки


def button(data, t=None):
    t = t or L.now()
    parts = (data or "").split(":")
    op, arg = (parts + ["", ""])[1], ":".join(parts[2:])
    if op == "c" and arg in ("today", "tomorrow"):
        return Button("Оновлено", edit=day_view(arg, t))
    if op == "d":
        ok, msg = mark_done(arg)
        return Button(("✅ " + msg)[:190] if ok else msg, edit=tasks_view(t) if ok else None)
    if op == "new":
        return Button("Чекаю задачу", send=L.Reply("➕ Напиши задачу одним повідомленням (можна з датою: «завтра …», "
                                                    "«у пт …», «15.12 …»)."), await_kind="task")
    if op in ("rh", "rt", "rd"):
        ok, msg = reminder_action(op, arg, t)
        return Button(msg[:190], note=msg if ok else "")
    return Button("Невідома кнопка")


def valid_markup(m):
    """Перевірка формату reply_markup (тести): серіалізується в JSON і має відомі Telegram поля."""
    json.dumps(m)
    if "inline_keyboard" in m:
        return all(isinstance(r, list) and all("text" in b and len(b.get("callback_data", "x").encode()) <= 64
                                               and ("callback_data" in b or "url" in b) for b in r)
                   for r in m["inline_keyboard"])
    if "keyboard" in m:
        return all(isinstance(r, list) and all(set(b) == {"text"} for b in r) for r in m["keyboard"])
    return m == HIDE
