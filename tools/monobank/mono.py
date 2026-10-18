#!/usr/bin/env python3
"""Monobank з Claude Code: баланси, виписки, підсумки витрат, курси валют.

Працює через особистий API Монобанку (https://api.monobank.ua/docs/), тільки читання.
Токен — у змінній середовища MONOBANK_TOKEN (отримати: https://api.monobank.ua/ → QR у застосунку).
Без залежностей, лише стандартна бібліотека Python 3.8+.

    mono.sh rates                         курси USD/EUR/PLN (без токена)
    mono.sh me                            рахунки, картки, банки (баланси)
    mono.sh balance                       коротко: баланс кожного рахунку
    mono.sh statement --days 7            операції за 7 днів (рахунок за замовчуванням)
    mono.sh statement --account fop --from 2026-10-01 --to 2026-10-18 --search "Епіцентр"
    mono.sh summary --days 30             надходження/витрати, категорії, найбільші контрагенти
    mono.sh --json <команда> ...          машиночитаний вивід

Обмеження банку: /personal/* — не частіше 1 разу на 60 с, виписка — до 31 доби й 500
операцій за запит. Скрипт сам чекає між запитами й ділить довгі періоди на частини.
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from zoneinfo import ZoneInfo

API = os.environ.get("MONO_API", "https://api.monobank.ua")  # MONO_API — для тестів
STATE_DIR = os.path.expanduser(os.environ.get("MONO_STATE_DIR", "~/.mono-claude"))
TZ = ZoneInfo(os.environ.get("MONO_TZ", os.environ.get("ASSISTANT_TZ", "Europe/Kyiv")))
CUR = {980: "UAH", 840: "USD", 978: "EUR", 826: "GBP", 985: "PLN", 756: "CHF", 203: "CZK"}
PERSONAL_GAP = int(os.environ.get("MONO_GAP", 61))  # секунд між запитами до /personal/*
MAX_SPAN = 31 * 86400  # максимальний період однієї виписки

# Грубі категорії за MCC — для підсумків
MCC_GROUPS = [
    ("Продукти", [(5411, 5411), (5422, 5422), (5441, 5441), (5451, 5451), (5462, 5462), (5499, 5499)]),
    ("Кафе й ресторани", [(5811, 5814)]),
    ("Пальне й авто", [(5172, 5172), (5541, 5542), (5531, 5533), (7511, 7549), (5511, 5599)]),
    ("Таксі й транспорт", [(4111, 4131), (4121, 4121), (4784, 4789)]),
    ("Будматеріали й інструмент", [(5200, 5200), (5211, 5211), (5231, 5231), (5251, 5251), (5261, 5261), (5039, 5039), (5072, 5072)]),
    ("Меблі й дім", [(5712, 5722), (5021, 5021)]),
    ("Техніка й зв'язок", [(4812, 4816), (4899, 4899), (5732, 5734), (5045, 5045)]),
    ("Онлайн-сервіси", [(5815, 5818), (5968, 5968), (7372, 7372)]),
    ("Здоров'я й спорт", [(5912, 5912), (8011, 8099), (5940, 5941), (7997, 7997)]),
    ("Одяг", [(5611, 5699)]),
    ("Подорожі", [(3000, 3999), (4511, 4511), (4722, 4722), (7011, 7011)]),
    ("Комунальні й податки", [(4900, 4900), (9311, 9311), (9399, 9399)]),
    ("Перекази й готівка", [(4829, 4829), (6010, 6012), (6538, 6540)]),
]


def mcc_group(mcc):
    for name, ranges in MCC_GROUPS:
        if any(a <= mcc <= b for a, b in ranges):
            return name
    return "Інше"


class MonoError(Exception):
    pass


def token():
    t = os.environ.get("MONOBANK_TOKEN", "").strip()
    if not t:
        raise MonoError(
            "Немає MONOBANK_TOKEN. Отримайте токен на https://api.monobank.ua/ (QR у застосунку) "
            "і додайте змінну MONOBANK_TOKEN у налаштування середовища (див. tools/monobank/README.md).")
    return t


def _wait_gap():
    """Тримає паузу ≥60 с між запитами /personal/* (і між запусками скрипта)."""
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    stamp = os.path.join(STATE_DIR, "last_call")
    try:
        last = float(open(stamp).read().strip())
    except (OSError, ValueError):
        last = 0
    wait = last + PERSONAL_GAP - time.time()
    if wait > 0:
        print(f"[mono] чекаю {int(wait)} с (ліміт банку: 1 запит на хвилину)…", file=sys.stderr)
        time.sleep(wait)
    with open(stamp, "w") as f:
        f.write(str(time.time()))


def request(path, personal=True, retries=2):
    headers = {"User-Agent": "cas-assistant/1.0"}
    if personal:
        headers["X-Token"] = token()
        _wait_gap()
    req = urllib.request.Request(API + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        if e.code == 429 and retries > 0:
            print("[mono] банк просить зачекати (429), повторюю за хвилину…", file=sys.stderr)
            time.sleep(PERSONAL_GAP)
            return request(path, personal, retries - 1)
        if e.code in (401, 403):
            raise MonoError("Банк відхилив токен (невірний або відкликаний). Створіть новий на https://api.monobank.ua/")
        raise MonoError(f"HTTP {e.code}: {body[:300]}")
    except urllib.error.URLError as e:
        raise MonoError(f"Немає зв'язку з api.monobank.ua ({e.reason}). Перевірте мережевий дозвіл для api.monobank.ua.")


# ---------- форматування

def money(minor, cur=980):
    v = minor / 100
    s = f"{v:,.2f}".replace(",", " ")
    return f"{s} {CUR.get(cur, cur)}"


def account_label(a):
    kind = {"black": "чорна", "white": "біла", "platinum": "platinum", "iron": "iron", "yellow": "дитяча",
            "fop": "ФОП", "eAid": "єПідтримка", "madeInUkraine": "Зроблено в Україні", "rebuilding": "Відновлення"}
    pan = (a.get("maskedPan") or [""])[0]
    tail = pan[-4:] if pan else (a.get("iban") or "")[-4:]
    return f"{kind.get(a.get('type'), a.get('type', '?'))} {CUR.get(a.get('currencyCode'), '')} …{tail}".strip()


def fmt_time(ts):
    return dt.datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d %H:%M")


# ---------- рахунки

def client_info():
    return request("/personal/client-info")


def resolve_account(info, sel):
    """sel: '0'/порожньо — рахунок за замовчуванням; id; IBAN або його кінець; тип (fop, black…); 'usd'/'eur'."""
    accs = info.get("accounts", [])
    if not sel or sel == "0":
        return "0", "рахунок за замовчуванням"
    s = sel.lower()
    for a in accs:
        if s == a.get("id", "").lower() or s == (a.get("iban") or "").lower():
            return a["id"], account_label(a)
    hits = [a for a in accs if (a.get("iban") or "").lower().endswith(s)
            or any(p.endswith(s) for p in a.get("maskedPan") or [])]
    if not hits:
        cur = {v.lower(): k for k, v in CUR.items()}.get(s)
        hits = [a for a in accs if a.get("type", "").lower() == s or (cur and a.get("currencyCode") == cur)]
        if cur and len(hits) > 1:  # для валюти беремо основну (чорну) картку
            hits = [a for a in hits if a.get("type") == "black"] or hits
        if len(hits) > 1 and s in ("fop", "black", "white"):
            hits = [a for a in hits if a.get("currencyCode") == 980] or hits
    if len(hits) == 1:
        return hits[0]["id"], account_label(hits[0])
    for j in info.get("jars", []):
        if s == j.get("id", "").lower() or s in j.get("title", "").lower():
            return j["id"], "банка «" + j.get("title", "") + "»"
    if hits:
        raise MonoError("Під «%s» підходить кілька рахунків: %s. Уточніть (кінець IBAN або id)."
                        % (sel, ", ".join(account_label(a) for a in hits)))
    raise MonoError(f"Рахунок «{sel}» не знайдено. Подивіться список: mono.sh me")


# ---------- виписка

def parse_date(s, end=False):
    d = dt.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=TZ)
    if end:
        d += dt.timedelta(days=1) - dt.timedelta(seconds=1)
    return int(d.timestamp())


def period(args):
    now = int(time.time())
    if args.from_:
        frm = parse_date(args.from_)
        to = parse_date(args.to, end=True) if args.to else now
    else:
        days = args.days or 7
        start = dt.datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(days=days - 1)
        frm, to = int(start.timestamp()), now
    return frm, min(to, now)


def statement(acc_id, frm, to):
    """Усі операції за період: ділить на шматки по 31 добі та догортає, якщо банк віддав 500."""
    out, seen = [], set()
    chunk_end = to
    while chunk_end > frm:
        chunk_start = max(frm, chunk_end - MAX_SPAN + 1)
        upper = chunk_end
        while True:
            items = request(f"/personal/statement/{acc_id}/{chunk_start}/{upper}")
            for it in items:
                if it["id"] not in seen:
                    seen.add(it["id"])
                    out.append(it)
            if len(items) < 500:
                break
            upper = min(it["time"] for it in items) - 1  # банк повертає від нових до старих
            if upper <= chunk_start:
                break
        chunk_end = chunk_start - 1
    out.sort(key=lambda x: x["time"], reverse=True)
    return out


def counterparty(it):
    return (it.get("counterName") or it.get("description") or "—").strip()


# ---------- команди

def cmd_rates(args):
    data = request("/bank/currency", personal=False)
    want = [(840, 980), (978, 980), (985, 980), (826, 980), (978, 840)]
    rows = []
    for a, b in want:
        for r in data:
            if r.get("currencyCodeA") == a and r.get("currencyCodeB") == b:
                rows.append({"pair": f"{CUR[a]}/{CUR[b]}", "buy": r.get("rateBuy"), "sell": r.get("rateSell"),
                             "cross": r.get("rateCross"), "date": fmt_time(r["date"])})
    if args.json:
        return rows
    lines = ["Курси Монобанку:"]
    for r in rows:
        if r["buy"]:
            lines.append(f"  {r['pair']}: купівля {r['buy']}, продаж {r['sell']}  ({r['date']})")
        else:
            lines.append(f"  {r['pair']}: крос {r['cross']}  ({r['date']})")
    return "\n".join(lines)


def cmd_me(args, short=False):
    info = client_info()
    if args.json:
        for a in info.get("accounts", []):
            a["label"] = account_label(a)
        return info if not short else [{"id": a["id"], "label": a["label"], "balance": a["balance"] / 100,
                                        "currency": CUR.get(a["currencyCode"])} for a in info.get("accounts", [])]
    lines = [] if short else [f"Клієнт: {info.get('name', '?')}"]
    lines.append("Рахунки:")
    total = defaultdict(int)
    for a in info.get("accounts", []):
        own = a["balance"] - a.get("creditLimit", 0)
        total[a["currencyCode"]] += a["balance"]
        extra = ""
        if a.get("creditLimit"):
            extra = f" (власні {money(own, a['currencyCode'])}, кредитний ліміт {money(a['creditLimit'], a['currencyCode'])})"
        iban = "" if short else f"  IBAN …{(a.get('iban') or '')[-6:]}  id {a['id']}"
        lines.append(f"  • {account_label(a)}: {money(a['balance'], a['currencyCode'])}{extra}{iban}")
    jars = info.get("jars", [])
    if jars:
        lines.append("Банки:")
        for j in jars:
            goal = f" / ціль {money(j['goal'], j['currencyCode'])}" if j.get("goal") else ""
            lines.append(f"  • {j.get('title', '?')}: {money(j['balance'], j['currencyCode'])}{goal}"
                         + ("" if short else f"  id {j['id']}"))
    lines.append("Разом на рахунках: " + ", ".join(money(v, k) for k, v in total.items()))
    return "\n".join(lines)


def cmd_statement(args):
    info = client_info() if args.account not in (None, "", "0") else {}
    acc_id, label = resolve_account(info, args.account)
    frm, to = period(args)
    items = statement(acc_id, frm, to)
    if args.search:
        q = args.search.lower()
        items = [i for i in items if q in (i.get("description", "") + " " + i.get("comment", "") + " "
                                           + i.get("counterName", "")).lower()]
    if args.income:
        items = [i for i in items if i["amount"] > 0]
    if args.expense:
        items = [i for i in items if i["amount"] < 0]
    if args.min:
        items = [i for i in items if abs(i["amount"]) >= args.min * 100]
    if args.limit:
        items = items[: args.limit]
    if args.json:
        return {"account": label, "from": fmt_time(frm), "to": fmt_time(to), "items": items}
    lines = [f"Виписка: {label}, {fmt_time(frm)[:10]} — {fmt_time(to)[:10]}, операцій: {len(items)}"]
    for i in items:
        cur = i.get("currencyCode", 980)
        orig = ""
        if i.get("operationAmount") and i["operationAmount"] != i["amount"]:
            orig = f" (у валюті операції {i['operationAmount'] / 100:,.2f})".replace(",", " ")
        hold = " ⏳" if i.get("hold") else ""
        comment = f" — «{i['comment']}»" if i.get("comment") else ""
        edr = f" [ЄДРПОУ {i['counterEdrpou']}]" if i.get("counterEdrpou") else ""
        lines.append(f"  {fmt_time(i['time'])}  {'+' if i['amount'] > 0 else ''}{money(i['amount'], cur)}{orig}{hold}"
                     f"  {counterparty(i)}{edr}{comment}  · залишок {money(i.get('balance', 0), cur)}")
    return "\n".join(lines)


def cmd_summary(args):
    info = client_info() if args.account not in (None, "", "0") else {}
    acc_id, label = resolve_account(info, args.account)
    frm, to = period(args)
    items = [i for i in statement(acc_id, frm, to) if not i.get("hold") or args.with_hold]
    inc = sum(i["amount"] for i in items if i["amount"] > 0)
    exp = -sum(i["amount"] for i in items if i["amount"] < 0)
    cats, who_in, who_out = defaultdict(int), defaultdict(int), defaultdict(int)
    for i in items:
        if i["amount"] < 0:
            cats[mcc_group(i.get("mcc", 0))] += -i["amount"]
            who_out[counterparty(i)] += -i["amount"]
        else:
            who_in[counterparty(i)] += i["amount"]
    top = lambda d, n: sorted(d.items(), key=lambda kv: -kv[1])[:n]
    res = {"account": label, "from": fmt_time(frm), "to": fmt_time(to), "operations": len(items),
           "income": inc / 100, "expense": exp / 100, "net": (inc - exp) / 100,
           "categories": {k: v / 100 for k, v in top(cats, 20)},
           "top_income": {k: v / 100 for k, v in top(who_in, args.top)},
           "top_expense": {k: v / 100 for k, v in top(who_out, args.top)}}
    if args.json:
        return res
    lines = [f"Підсумок: {label}, {fmt_time(frm)[:10]} — {fmt_time(to)[:10]} ({len(items)} операцій)",
             f"  Надходження: {money(inc)}", f"  Витрати:     {money(exp)}", f"  Різниця:     {money(inc - exp)}",
             "Витрати за категоріями:"]
    lines += [f"  • {k}: {money(v)} ({v * 100 // max(exp, 1)}%)" for k, v in top(cats, 20)]
    lines.append(f"Найбільші надходження (топ-{args.top}):")
    lines += [f"  • {k}: {money(v)}" for k, v in top(who_in, args.top)]
    lines.append(f"Найбільші витрати (топ-{args.top}):")
    lines += [f"  • {k}: {money(v)}" for k, v in top(who_out, args.top)]
    return "\n".join(lines)


def main(argv=None):
    p = argparse.ArgumentParser(prog="mono.sh", description="Monobank: баланси, виписки, підсумки (лише читання)")
    p.add_argument("--json", action="store_true", help="вивід у JSON")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("rates", help="курси валют (без токена)")
    sub.add_parser("me", help="рахунки, картки, банки")
    sub.add_parser("balance", help="коротко: баланси")

    def per(sp):
        sp.add_argument("--account", "-a", default="0",
                        help="0 (за замовчуванням) | fop | black | usd | eur | кінець IBAN/картки | id | назва банки")
        sp.add_argument("--days", type=int, help="останні N днів (за замовчуванням 7)")
        sp.add_argument("--from", dest="from_", help="з дати YYYY-MM-DD")
        sp.add_argument("--to", help="по дату YYYY-MM-DD (включно)")

    st = sub.add_parser("statement", help="операції за період")
    per(st)
    st.add_argument("--search", help="пошук в описі/коментарі/контрагенті")
    st.add_argument("--income", action="store_true", help="лише надходження")
    st.add_argument("--expense", action="store_true", help="лише витрати")
    st.add_argument("--min", type=float, help="сума від, грн")
    st.add_argument("--limit", type=int, help="не більше N рядків")
    sm = sub.add_parser("summary", help="надходження/витрати, категорії, топ контрагентів")
    per(sm)
    sm.add_argument("--top", type=int, default=7)
    sm.add_argument("--with-hold", action="store_true", help="враховувати заблоковані (hold) суми")
    args = p.parse_args(argv)
    try:
        if args.cmd == "rates":
            out = cmd_rates(args)
        elif args.cmd == "me":
            out = cmd_me(args)
        elif args.cmd == "balance":
            out = cmd_me(args, short=True)
        elif args.cmd == "statement":
            out = cmd_statement(args)
        else:
            out = cmd_summary(args)
    except MonoError as e:
        print(f"[mono] помилка: {e}", file=sys.stderr)
        return 1
    print(json.dumps(out, ensure_ascii=False, indent=1) if args.json else out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
