#!/usr/bin/env bash
# Обгортка для mono.py (Monobank, лише читання). Використання: tools/monobank/mono.sh <команда> [...]
#   tools/monobank/mono.sh --help
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$DIR/mono.py" "$@"
