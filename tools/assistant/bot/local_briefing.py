#!/usr/bin/env python3
"""Брифінг без Claude (локальний режим): дані збираються скриптами, текст — ШАБЛОНОМ, без LLM.
Опційно 2–3 речення резюме від Ollama (ASSISTANT_BRIEF_OLLAMA=0 — вимкнути).

  local_briefing.py morning|evening|weekly|gym [--send]     # без --send — лише друкує текст

Джерела: bin/brief-data.sh (Telegram, вхідні), bin/gcal.py, bin/gmail.py, памʼять (02 Задачі.md,
03 Звички і спорт.md), tools/monobank/mono.sh (лише для тижня). Недоступне джерело — чесний рядок, не вигадка.
"""
import datetime, os, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_mode as L  # noqa: E402

TITLES = {"morning": "☀️ Ранок", "evening": "🌙 Вечір", "weekly": "📊 Тиждень", "gym": "🏋️ Спортзал"}
WD_FULL = ["понеділ", "вівтор", "серед", "четвер", "пʼятниц|п'ятниц|пятниц", "субот", "неділ"]


def telegram_block():
    code, out = L.run_tool([L.bin_dir() / "brief-data.sh"], timeout=120)
    if code != 0 and not out:
        return "📩 Telegram: недоступний."
    sect = out.split("=== Нові вхідні")[0]
    if "недоступний" in sect:
        return "📩 Telegram: недоступний (немає сесії чи мережі)."
    chats = re.findall(r"^=== (.+?) \(id .*?непрочитано (\d+)", sect, flags=re.M)
    if not chats:
        return "📩 Telegram: непрочитаних немає."
    names = ", ".join(c[0] for c in chats[:5]) + ("…" if len(chats) > 5 else "")
    return f"📩 Telegram: {len(chats)} чатів з непрочитаним ({names})."


def calendar_block(kind):
    code, out = L.run_tool([L._py(), L.bin_dir() / "gcal.py", kind], timeout=60)
    if code == 0:
        return "📅 " + out.replace("\n", "\n   ")
    if code == 3:
        return "📅 Календар не підключено на Mac mini (немає OAuth-токена)."
    return "📅 Календар недоступний."


def mail_block():
    code, out = L.run_tool([L._py(), L.bin_dir() / "gmail.py", "unread", "--limit", "5"], timeout=90)
    if code == 0:
        return "✉️ Пошта:\n" + out if out.startswith("•") else "✉️ " + out
    if code == 3:
        return "✉️ Пошту не підключено на Mac mini."
    return "✉️ Пошта недоступна."


def tasks_block(days, t, title, overdue=True):
    items = L.open_items(days, t, limit=40, overdue=overdue)
    rem = [i.strip() for i in items if "🔔" in i]
    body = [i for i in items if "🔔" not in i]
    out = []
    if body:
        out.append(title + "\n" + "\n".join(body[:15]))
    if rem:
        out.append("🔔 Нагадування: " + " · ".join(r.replace("🔔", "").strip() for r in rem[:10]))
    return "\n".join(out) or "🗒 Відкритих задач у памʼяті немає."


def gym_block(t):
    p = L.memory_dir() / "03 Звички і спорт.md"
    if not p.exists():
        return "🏋️ Графік спортзалу в памʼяті не знайдено."
    pat = re.compile(rf"({WD_FULL[t.weekday()]})|\b{L.DAY_ABBR[t.weekday()]}\b", re.I)
    lines = [l.strip() for l in p.read_text(encoding="utf-8").splitlines() if pat.search(l)]
    return "🏋️ Сьогодні за графіком:\n" + "\n".join(lines[:6]) if lines else "🏋️ На сьогодні в графіку тренування не знайшов."


def money_block():
    code, out = L.run_tool([L.repo() / "tools/monobank/mono.sh", "summary", "--days", "7"], timeout=180)
    return ("💳 Гроші за тиждень:\n" + out[-1200:]) if code == 0 else "💳 Монобанк недоступний."


def build(kind, t=None):
    t = t or L.now()
    today = t.date()
    head = f"{TITLES[kind]}, {L.DAY_ABBR[today.weekday()]} {today:%d.%m} (локальний режим — Claude недоступний)"
    parts = [head]
    if kind == "morning":
        parts += [calendar_block("today"), tasks_block([today], t, "🎯 Задачі на сьогодні:"), mail_block(), telegram_block()]
    elif kind == "evening":
        tom = today + datetime.timedelta(days=1)
        parts += [tasks_block([today], t, "✅ Що лишилось відкритим сьогодні:"),
                  calendar_block("tomorrow"),
                  tasks_block([tom], t, "📌 Завтра:", overdue=False)]
        parts.append("Підсумок дня й звички запишемо, коли повернеться Claude, або напиши коротко сюди — додам у задачі.")
    elif kind == "weekly":
        parts += [calendar_block("week"),
                  tasks_block([today + datetime.timedelta(days=i) for i in range(7)], t, "🗒 Відкриті задачі на тиждень:"),
                  money_block()]
    elif kind == "gym":
        parts += [gym_block(t)]
    text = "\n\n".join(p for p in parts if p)
    if os.environ.get("ASSISTANT_BRIEF_OLLAMA", "1") != "0" and kind != "gym":
        s = L.ollama_chat("Ось дані мого брифінгу. Дай 2–3 речення резюме: на чому зосередитись. Не додавай фактів, "
                          "яких немає в даних.\n\n" + text, timeout=float(os.environ.get("ASSISTANT_BRIEF_OLLAMA_TIMEOUT", "90")))
        if s:
            text += "\n\n💡 " + s.strip()[:600]
    return text


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    kind = args[0] if args else ""
    if kind not in TITLES:
        sys.exit(__doc__)
    text = build(kind)
    if "--send" in sys.argv:
        tg = os.environ.get("ASSISTANT_TG_OUT") or str(L.bin_dir() / "tg-out.sh")
        code, out = L.run_tool([tg, "text", text], timeout=120)
        if code != 0:
            print("не надіслано:", out, file=sys.stderr)
            sys.exit(1)
    print(text)


if __name__ == "__main__":
    main()
