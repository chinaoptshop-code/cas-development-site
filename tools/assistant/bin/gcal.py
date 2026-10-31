#!/usr/bin/env python3
"""Google Calendar напряму (без Claude і MCP) — для локального режиму помічника на Mac mini.

  gcal.py today | tomorrow | week [--json]

Токен: ~/.assistant-google/token.json (див. google_oauth.py login). Календарі: ASSISTANT_GCAL_IDS
(через кому, типово primary). Пояс: ASSISTANT_TZ (Europe/Kyiv).
Коди виходу: 0 — гаразд; 3 — календар не підключено (токена немає); 4 — помилка API/мережі.
"""
import datetime, json, os, sys, urllib.parse
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import google_oauth  # noqa: E402

TZ = ZoneInfo(os.environ.get("ASSISTANT_TZ", "Europe/Kyiv"))
DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"]


def window(kind, now=None):
    now = now or datetime.datetime.now(TZ)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if kind == "tomorrow":
        start += datetime.timedelta(days=1)
        return start, start + datetime.timedelta(days=1)
    if kind == "week":
        return start, start + datetime.timedelta(days=7)
    return start, start + datetime.timedelta(days=1)


def events(kind):
    t0, t1 = window(kind)
    out = []
    for cal in [c.strip() for c in os.environ.get("ASSISTANT_GCAL_IDS", "primary").split(",") if c.strip()]:
        q = urllib.parse.urlencode({"timeMin": t0.isoformat(), "timeMax": t1.isoformat(), "singleEvents": "true",
                                    "orderBy": "startTime", "maxResults": "100", "timeZone": str(TZ)})
        d = google_oauth.api(f"https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(cal)}/events?{q}")
        for e in d.get("items", []):
            if e.get("status") == "cancelled":
                continue
            s = e.get("start", {})
            all_day = "date" in s
            start = (datetime.datetime.fromisoformat(s["date"]).replace(tzinfo=TZ) if all_day
                     else datetime.datetime.fromisoformat(s["dateTime"].replace("Z", "+00:00")).astimezone(TZ))
            out.append({"start": start.isoformat(), "all_day": all_day, "title": e.get("summary") or "(без назви)",
                        "location": e.get("location", "")})
    return sorted(out, key=lambda x: x["start"])


def fmt(evts, kind):
    if not evts:
        return {"today": "Сьогодні подій у календарі немає.", "tomorrow": "Завтра подій у календарі немає.",
                "week": "На тиждень подій у календарі немає."}[kind]
    lines, day = [], None
    for e in evts:
        st = datetime.datetime.fromisoformat(e["start"])
        if kind == "week" and st.date() != day:
            day = st.date()
            lines.append(f"{DAYS[st.weekday()].capitalize()} {st:%d.%m}:")
        when = "весь день" if e["all_day"] else f"{st:%H:%M}"
        lines.append(("  " if kind == "week" else "") + f"{when} {e['title']}" + (f" ({e['location']})" if e["location"] else ""))
    return "\n".join(lines)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    kind = args[0] if args else "today"
    if kind not in ("today", "tomorrow", "week"):
        sys.exit(__doc__)
    try:
        evts = events(kind)
    except google_oauth.NotConfigured as e:
        print(f"Календар не підключено на цьому компʼютері ({e}).", file=sys.stderr)
        sys.exit(3)
    except Exception as e:  # мережа, 401/403, квоти
        print(f"Календар недоступний: {e!r}"[:300], file=sys.stderr)
        sys.exit(4)
    print(json.dumps(evts, ensure_ascii=False, indent=1) if "--json" in sys.argv else fmt(evts, kind))


if __name__ == "__main__":
    main()
