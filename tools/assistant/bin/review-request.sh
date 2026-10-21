#!/bin/bash
# Чернетка прохання про відгук у Google Михайлу (нікому не надсилає): review-request.sh "Імʼя" "що робили" [--ru]
exec /opt/homebrew/bin/python3 "$HOME/jarvis/scripts/review-request.py" "$@"
