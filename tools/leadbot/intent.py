#!/usr/bin/env python3
"""Запит чи реклама: чи автор повідомлення в групі ШУКАЄ послугу, чи РЕКЛАМУЄ себе (Михайло 23.11.2026).

Бот пошуку заявок оцінював повідомлення за словами «ремонт», «будівництво» — і реклама магазину будматеріалів
ставала «заявкою». Цей модуль — перший крок перед будь-яким скорингом: хто говорить і навіщо.

    from intent import classify
    r = classify(text)          # {'verdict': 'request'|'offer'|'unclear', 'kind', 'offer', 'request', 'reasons'}

verdict:
  request — людина шукає виконавця/послугу для себе → далі скоринг і CRM;
  offer   — реклама, самореклама майстра, продаж/оренда, вакансія → НЕ клієнт (можна зберегти як контакт у «Партнери»);
  unclear — правил замало → другий крок (модель) з питанням із README, і лише її «request» іде в CRM.

Правила — tools/leadbot/rules.json (те саме читає сайт: functions/_leadintent.js, пише gen.py). Приклади — cases.json.
CLI:  python3 tools/leadbot/intent.py "текст"   |   echo "текст" | python3 tools/leadbot/intent.py   (--json)
"""
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
B = r"(?<![a-zа-яёіїєґ0-9])"
E = r"(?![a-zа-яёіїєґ0-9'])"
STRIP = dict.fromkeys(map(ord, "️⃣‍​­"))
APOS = dict.fromkeys(map(ord, "ʼ’‘`′"), "'")


def normalize(text):
    t = unicodedata.normalize("NFKC", str(text or "")).translate(STRIP).translate(APOS).lower()
    t = t.replace("\r", "\n")
    return re.sub(r"[ \t  ]+", " ", t).strip()


def source(rule):
    s = rule["re"]
    if not rule.get("raw"):
        s = s.replace(" ", r"\s+")
    return s.replace("{B}", B).replace("{E}", E)


def load(path=None):
    with open(path or os.path.join(HERE, "rules.json"), encoding="utf-8") as f:
        d = json.load(f)
    return {side: [dict(r, rx=re.compile(source(r))) for r in d[side]] for side in ("offer", "request")}


RULES = load()


def classify(text, rules=None):
    rules = rules or RULES
    t = normalize(text)
    hard = soft = req = 0
    kind = None
    reasons = []
    for r in rules["offer"]:
        if len(r["rx"].findall(t)) >= r.get("min", 1):
            if r.get("hard"):
                hard += r["w"]
            else:
                soft += r["w"]
            kind = kind or r.get("kind")
            if r["why"] not in reasons:
                reasons.append(r["why"])
    asks = []
    for r in rules["request"]:
        if len(r["rx"].findall(t)) >= r.get("min", 1):
            req += r["w"]
            asks.append(r["why"])
    off = hard + soft
    if kind:
        verdict = "offer"
    elif req >= 3:
        if hard == 0:
            verdict = "offer" if soft >= req + 3 else "request"
        else:
            verdict = "request" if req > off else ("offer" if off > req else "unclear")
    else:
        verdict = "offer" if hard >= 3 or off >= 4 else "unclear"
    if verdict == "offer" and not kind:
        kind = "ad"
    return {"verdict": verdict, "kind": kind if verdict == "offer" else None, "offer": off, "request": req,
            "reasons": reasons if verdict == "offer" else asks if verdict == "request" else reasons + asks}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--json"]
    res = classify(" ".join(args) if args else sys.stdin.read())
    if "--json" in sys.argv:
        print(json.dumps(res, ensure_ascii=False))
    else:
        label = {"request": "ЗАПИТ — людина шукає послугу", "offer": "НЕ КЛІЄНТ — реклама / пропозиція", "unclear": "НЕЯСНО — потрібен другий крок"}
        print(f"{label[res['verdict']]}  (пропозиція {res['offer']}, запит {res['request']})")
        for w in res["reasons"]:
            print("  ·", w)
