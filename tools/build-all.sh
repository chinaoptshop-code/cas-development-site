#!/usr/bin/env bash
# Перезбирає сторінки сайту з JSON-джерел у правильному порядку (детерміновано: без змін у JSON — без змін у HTML).
# Запускають .github/workflows/deploy.yml (перед викладкою) і rebuild.yml (комітить результат назад у main).
# Локально: bash tools/build-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."

LOG="${TMPDIR:-/tmp}/cas-landing.log"
python3 tools/site/landing.py > "$LOG" || { cat "$LOG"; exit 1; }
tail -n 2 "$LOG"
python3 tools/products/build.py
python3 tools/shop/pages.py
python3 tools/blog/build.py --check
python3 tools/blog/build.py
python3 tools/site/chrome.py
python3 tools/site/chrome.py --check
python3 tools/site/i18n.py --check
python3 tools/site/seo.py --quiet || echo "::warning::SEO-перевірка (tools/site/seo.py) знайшла помилки — деплой не зупиняємо"
