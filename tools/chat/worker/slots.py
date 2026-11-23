"""Вільні проміжки для дзвінка: Пн–Пт 10:00–20:00 за Києвом, з календаря Михайла через НАЯВНИЙ інструмент помічника
tools/assistant/bin/gcal.py (`week --json`; токен ~/.assistant-google/token.json на Mac mini). Беремо лише час подій — назви ніде не використовуємо.
Подію в календарі воркер НЕ створює: обраний час іде менеджеру (handoff asks_human).
CHAT_CAL_CMD — інша команда (тести): друкує той самий JSON.
"""
import datetime
import json
import os
import re
import shlex
import subprocess
import sys
from zoneinfo import ZoneInfo

from config import REPO

TZ = ZoneInfo("Europe/Kyiv")
DAYS = {"uk": "Пн Вт Ср Чт Пт Сб Нд", "ru": "Пн Вт Ср Чт Пт Сб Вс", "en": "Mon Tue Wed Thu Fri Sat Sun", "es": "lun mar mié jue vie sáb dom",
        "zh": "周一 周二 周三 周四 周五 周六 周日", "pl": "pon. wt. śr. czw. pt. sob. niedz.", "de": "Mo Di Mi Do Fr Sa So", "fr": "lun. mar. mer. jeu. ven. sam. dim.",
        "pt": "seg. ter. qua. qui. sex. sáb. dom.", "ar": "الاثنين الثلاثاء الأربعاء الخميس الجمعة السبت الأحد"}
LINE = re.compile(r"^\s*([1-9])\)\s.*?(\d{2})\.(\d{2}),\s*(\d{1,2}):(\d{2})", re.M)


def busy(timeout=90):
    """→ список (початок, кінець) або None — календар недоступний."""
    cmd = os.environ.get("CHAT_CAL_CMD")
    cmd = shlex.split(cmd) if cmd else [sys.executable, str(REPO / "tools/assistant/bin/gcal.py"), "week", "--json"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            return None
        evts = json.loads(r.stdout or "[]")
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    out = []
    for e in evts:
        if e.get("all_day"):
            continue
        try:
            s = datetime.datetime.fromisoformat(e["start"]).astimezone(TZ)
            en = datetime.datetime.fromisoformat(e["end"]).astimezone(TZ) if e.get("end") else s + datetime.timedelta(hours=1)
        except (KeyError, ValueError, TypeError):
            continue
        out.append((s, en))
    return out


def free(events, now=None, n=3, minutes=60, lead_hours=2, days=10):
    """Найближчі вільні проміжки в робочі години; по змозі — різні дні."""
    now = (now or datetime.datetime.now(TZ)).astimezone(TZ)
    start = (now + datetime.timedelta(hours=lead_hours)).replace(minute=0, second=0, microsecond=0) + datetime.timedelta(hours=1)
    cands = []
    for d in range(days):
        day = (now + datetime.timedelta(days=d)).date()
        if day.weekday() >= 5:
            continue
        for h in range(10, 20):
            s = datetime.datetime(day.year, day.month, day.day, h, tzinfo=TZ)
            e = s + datetime.timedelta(minutes=minutes)
            if s < start or e.hour > 20 or (e.hour == 20 and e.minute > 0):
                continue
            if any(a < e and b > s for a, b in events):
                continue
            cands.append(s)
    picked = []
    for s in cands:                       # спершу — по одному на день
        if len(picked) < n and all(p.date() != s.date() for p in picked):
            picked.append(s)
    for s in cands:
        if len(picked) >= n:
            break
        if s not in picked:
            picked.append(s)
    return sorted(picked)[:n]


def label(s, lang):
    d = DAYS.get(lang, DAYS["en"]).split()[s.weekday()]
    return f"{d} {s:%d.%m}, {s:%H:%M}"


def block(slots, lang):
    return "\n".join(f"{i}) {label(s, lang)}" for i, s in enumerate(slots, 1))


def offered(bot_text, now=None):
    """Проміжки з нашого попереднього повідомлення («1) Вт 25.11, 12:00») → {номер: datetime}."""
    now = (now or datetime.datetime.now(TZ)).astimezone(TZ)
    out = {}
    for m in LINE.finditer(bot_text or ""):
        i, dd, mm, hh, mi = (int(x) for x in m.groups())
        try:
            s = datetime.datetime(now.year, mm, dd, hh, mi, tzinfo=TZ)
        except ValueError:
            continue
        if s < now - datetime.timedelta(days=30):
            s = s.replace(year=now.year + 1)
        out[i] = s
    return out


PICK = re.compile(r"^\W*(?:(?:варіант|вариант|option|opción|opção|opcja|variante|خيار|选项|номер|№)\s*)?([1-9])\W*$", re.I)


def choose(text, offers):
    """Відповідь клієнта → обраний datetime або None."""
    t = (text or "").strip()
    m = PICK.match(t)
    if m and int(m.group(1)) in offers:
        return offers[int(m.group(1))]
    for s in offers.values():
        if re.search(rf"\b0?{s.day}\.{s.month:02d}\b", t) or (re.search(rf"\b{s.hour}[:.]00\b|\b{s.hour}:{s.minute:02d}\b", t) and len(offers) and
                                                                [x.hour for x in offers.values()].count(s.hour) == 1):
            return s
    return None
