#!/usr/bin/env bash
# Markdown → акуратний PDF (кирилиця, заголовки, таблиці, списки).
#   md2pdf.sh тези.md [вихід.pdf] [--title "Назва"]
# Технологія: pandoc (або вбудований md2html.py, якщо pandoc немає) робить HTML,
# headless Chrome/Chromium друкує PDF. Без LaTeX і зовнішніх сервісів. Працює в хмарі й на Mac.
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8
source "$(dirname "${BASH_SOURCE[0]}")/../config.sh"
in="${1:?markdown-файл}"; shift
out="${1:-}"; [ -n "$out" ] && [ "${out#--}" = "$out" ] && shift || out="${in%.*}.pdf"
title=""; [ "${1:-}" = "--title" ] && title="$2"
[ -n "$title" ] || title="$(grep -m1 '^# ' "$in" | sed 's/^# //' || true)"
[ -n "$title" ] || title="$(basename "${in%.*}")"

# Chromium/Chrome: хмарний контейнер, Linux (PATH) або macOS (Mac mini)
CHROME="${CHROME:-$(ls /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1)}"
[ -x "${CHROME:-}" ] || CHROME="$(command -v chromium chromium-browser google-chrome google-chrome-stable 2>/dev/null | head -1)"
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Chromium.app/Contents/MacOS/Chromium" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  [ -x "${CHROME:-}" ] || { [ -x "$c" ] && CHROME="$c"; }
done
[ -x "${CHROME:-}" ] || { echo "❌ Не знайдено Chrome/Chromium для друку PDF (на Mac встановіть Google Chrome)" >&2; exit 2; }

css="$ASSISTANT_DIR/pdf.css"
html="$ASSISTANT_TMP/$(basename "${in%.*}").html"
if command -v pandoc >/dev/null 2>&1; then
  pandoc "$in" -f markdown -t html5 --standalone --metadata pagetitle="$title" --metadata lang=uk \
    --css "$css" --embed-resources -o "$html"
else
  # pandoc не встановлений (напр. на Mac mini) — вбудований конвертер без залежностей
  python3 "$(dirname "${BASH_SOURCE[0]}")/md2html.py" "$in" "$html" --title "$title" --css "$css"
fi
"$CHROME" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$out" "file://$html" >/dev/null 2>&1
echo "$out"
