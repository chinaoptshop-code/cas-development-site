#!/usr/bin/env bash
# Нові вхідні повідомлення від Михайла, які помічник ще не обробив (JSON-масив).
#   inbox.sh            — нові повідомлення
#   inbox.sh --all 50   — останні 50 повідомлень чату без фільтра (для контексту)
# Логіка «обробленості» без окремого стану:
#  - режим бота: усе, що Михайло написав після останнього повідомлення бота;
#  - режим personal: усе після останнього повідомлення з префіксом ASSISTANT_PREFIX
#    (а якщо те повідомлення було відповіддю, то після повідомлення, на яке воно відповідало).
# Тому КОЖНА обробка має закінчуватися відповіддю через tg-out.sh (у режимі personal — з --reply-to
# на останнє оброблене повідомлення, це робить tg.sh send ... --reply-to ID).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../config.sh"
chat="$(assistant_inbox_chat)"
limit=50
if [ "${1:-}" = "--all" ]; then
  "$TG" --json read "$chat" --limit "${2:-50}"; exit 0
fi
"$TG" --json read "$chat" --limit "$limit" | python3 -c '
import sys, json, os
mode = sys.argv[1]; prefix = sys.argv[2]
data = json.load(sys.stdin); msgs = data.get("messages", [])
def mine(m):
    if mode == "bot":
        return not m.get("out")              # повідомлення бота — вхідні для мого акаунта
    return (m.get("text") or "").startswith(prefix)
last = 0
for m in msgs:
    if mine(m):
        last = max(last, m.get("reply_to") or m["id"]) if mode != "bot" else max(last, m["id"])
new = [m for m in msgs if not mine(m) and m["id"] > last]
print(json.dumps({"chat": data.get("chat"), "mode": mode, "processed_up_to": last, "new": new}, ensure_ascii=False, indent=2))
' "$(assistant_mode)" "$ASSISTANT_PREFIX"
