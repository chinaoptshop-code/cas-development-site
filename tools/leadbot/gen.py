#!/usr/bin/env python3
"""Пише functions/_leadintent.js з tools/leadbot/rules.json (сайт перевіряє заявки бота тими самими правилами).
python3 tools/leadbot/gen.py   |   --check — код 1, якщо файл застарів."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "functions", "_leadintent.js"))

JS = r'''// ЗГЕНЕРОВАНО tools/leadbot/gen.py з tools/leadbot/rules.json — руками не правити.
// Запит чи реклама: чи автор повідомлення шукає послугу, чи рекламує себе (Михайло 23.11.2026). Та сама логіка, що в
// tools/leadbot/intent.py (бот пошуку на Mac mini); спільні приклади — tools/leadbot/cases.json.
const B = '(?<![a-zа-яёіїєґ0-9])', E = "(?![a-zа-яёіїєґ0-9'])";
const RULES = __RULES__;
const src = r => (r.raw ? r.re : r.re.replace(/ /g, '\\s+')).replaceAll('{B}', B).replaceAll('{E}', E);
for (const side of ['offer', 'request']) for (const r of RULES[side]) r.rx = new RegExp(src(r), 'gu');

export function normalize(text) {
  return String(text ?? '').normalize('NFKC').replace(/[️⃣‍​­]/g, '').replace(/[ʼ’‘`′]/g, "'").toLowerCase()
    .replace(/\r/g, '\n').replace(/[ \t  ]+/g, ' ').trim();
}

// → {verdict: 'request' | 'offer' | 'unclear', kind: 'ad' | 'vacancy' | 'jobseek' | null, offer, request, reasons: [..]}
export function leadIntent(text) {
  const t = normalize(text);
  let hard = 0, soft = 0, req = 0, kind = null;
  const reasons = [], asks = [];
  const hit = r => (t.match(r.rx) || []).length >= (r.min || 1);
  for (const r of RULES.offer) if (hit(r)) {
    if (r.hard) hard += r.w; else soft += r.w;
    kind = kind || r.kind || null;
    if (!reasons.includes(r.why)) reasons.push(r.why);
  }
  for (const r of RULES.request) if (hit(r)) { req += r.w; asks.push(r.why); }
  const off = hard + soft;
  let verdict;
  if (kind) verdict = 'offer';
  else if (req >= 3) verdict = hard === 0 ? (soft >= req + 3 ? 'offer' : 'request') : req > off ? 'request' : off > req ? 'offer' : 'unclear';
  else verdict = hard >= 3 || off >= 4 ? 'offer' : 'unclear';
  if (verdict === 'offer' && !kind) kind = 'ad';
  return { verdict, kind: verdict === 'offer' ? kind : null, offer: off, request: req,
    reasons: verdict === 'offer' ? reasons : verdict === 'request' ? asks : [...reasons, ...asks] };
}
'''


def render():
    with open(os.path.join(HERE, "rules.json"), encoding="utf-8") as f:
        d = json.load(f)
    rules = {side: d[side] for side in ("offer", "request")}
    body = json.dumps(rules, ensure_ascii=False, indent=1)
    return JS.replace("__RULES__", body)


def current():
    if not os.path.exists(OUT):
        return ""
    with open(OUT, encoding="utf-8") as f:
        return f.read()


if __name__ == "__main__":
    new = render()
    old = current()
    if "--check" in sys.argv:
        sys.exit(0 if new == old else print("functions/_leadintent.js застарів: python3 tools/leadbot/gen.py") or 1)
    if new != old:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(new)
    print("functions/_leadintent.js —", "оновлено" if new != old else "без змін")
