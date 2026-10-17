#!/usr/bin/env bash
# Markdown → акуратний PDF (кирилиця, заголовки, таблиці, списки).
#   md2pdf.sh тези.md [вихід.pdf] [--title "Назва"]
# Технологія: pandoc робить HTML, headless Chromium друкує PDF. Без LaTeX і зовнішніх сервісів.
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8
source "$(dirname "${BASH_SOURCE[0]}")/../config.sh"
in="${1:?markdown-файл}"; shift
out="${1:-}"; [ -n "$out" ] && [ "${out#--}" = "$out" ] && shift || out="${in%.*}.pdf"
title=""; [ "${1:-}" = "--title" ] && title="$2"
[ -n "$title" ] || title="$(grep -m1 '^# ' "$in" | sed 's/^# //' || true)"
[ -n "$title" ] || title="$(basename "${in%.*}")"

CHROME="${CHROME:-$(ls /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1)}"
[ -x "$CHROME" ] || CHROME="$(command -v chromium chromium-browser google-chrome 2>/dev/null | head -1)"
[ -x "${CHROME:-}" ] || { echo "❌ Не знайдено Chromium для друку PDF" >&2; exit 2; }

css="$ASSISTANT_DIR/pdf.css"
html="$ASSISTANT_TMP/$(basename "${in%.*}").html"
pandoc "$in" -f markdown -t html5 --standalone --metadata pagetitle="$title" --metadata lang=uk \
  --css "$css" --embed-resources -o "$html"
"$CHROME" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$out" "file://$html" >/dev/null 2>&1
echo "$out"
