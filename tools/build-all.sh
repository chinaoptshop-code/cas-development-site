#!/usr/bin/env bash
# Перезбирає сторінки сайту з JSON-джерел у правильному порядку (детерміновано: без змін у JSON — без змін у HTML).
# Запускають .github/workflows/deploy.yml (перед викладкою) і rebuild.yml (комітить результат назад у main).
# Локально: bash tools/build-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/site/ux.py          # тексти кнопок згортання/бейджів і версія спрайту іконок у /assets/site-chrome.v1.{js,css} (до ?v= у сторінках)
LOG="${TMPDIR:-/tmp}/cas-landing.log"
python3 tools/site/landing.py > "$LOG" || { cat "$LOG"; exit 1; }
tail -n 2 "$LOG"
python3 tools/site/fullcase.py  # «Повний проєкт» /proekty/<slug>-povnyi-proekt (uk+ru) з tools/site/cases/*.json
python3 tools/products/build.py
python3 tools/tours/build.py pages
python3 tools/shop/pages.py
python3 tools/blog/build.py --check
python3 tools/blog/build.py
python3 tools/site/leadform.py  # форми заявки: обовʼязковий лише телефон, швидка заявка (ручні сторінки теж)
python3 tools/guide/build.py    # лід-магніт «Гід з цінами» (PDF): місця .gd-slot на сторінках вартості, калькуляторі й у статтях про ціни
python3 tools/site/captions.py  # підписи галерей: обʼєкт, що робили, статус
python3 tools/site/casmap.py    # карти: «Карта проєктів» у /portfolio, офіс у /contact (лендинги контактів — через landing.py)
python3 tools/site/quiz.py      # квіз-калькулятор перед формою заявки (головні uk/ru/en, ремонт, будівництво)
python3 tools/site/media.py     # тур 360° (/tury/<slug>) на сторінках проєктів, відео YouTube, канал у sameAs — з tools/site/media.json
python3 tools/site/buildanim.py # «Будинок з нуля» / «Ремонт з нуля» — scroll-анімація збірки (будівництво, ремонт квартир, головні)
python3 tools/site/landanim.py  # «Ландшафт з нуля» — сцена на сторінках ландшафтного дизайну + перемикач «Будинок / Ландшафт» на будівництві
python3 tools/site/llms.py      # /llms.txt і /llms-full.txt — опис студії для ШІ (факти з CLAUDE.md, сторінки з sitemap)
python3 tools/site/chrome.py
python3 tools/site/chrome.py --check
python3 tools/site/ux.py --check
python3 tools/site/i18n.py --check
python3 tools/site/seo.py --quiet || echo "::warning::SEO-перевірка (tools/site/seo.py) знайшла помилки — деплой не зупиняємо"
