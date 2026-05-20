#!/usr/bin/env bash
# scripts/pptx.sh — собрать .pptx из JSON-описания на стороне dev-pod'а.
#
# Использование:
#   ./scripts/pptx.sh <spec.json> [out.pptx]
#
# spec.json формат:
#   {
#     "title": "...",
#     "subtitle": "...",
#     "slides": [
#       {"heading": "...", "bullets": ["...", "..."]},
#       ...
#     ]
#   }
#
# Скрипт шлёт POST на FastAPI sidecar (если он рядом), либо стучит
# в любой работающий слот через ingress (нужно явно задать SLOT).
# По умолчанию: SLOT=app1 → https://ranepa.gigaparsers.ru/app1/api/pptx.

set -euo pipefail

SPEC="${1:?usage: pptx.sh <spec.json> [out.pptx]}"
OUT="${2:-presentation.pptx}"
SLOT="${SLOT:-app1}"
BASE="${PPTX_BASE:-https://ranepa.gigaparsers.ru/${SLOT}}"

[[ -f "$SPEC" ]] || { echo "error: $SPEC not found" >&2; exit 1; }

curl -sS -X POST "${BASE}/api/pptx" \
  -H "content-type: application/json" \
  --data @"$SPEC" \
  --output "$OUT"

# Проверяем что получили валидный .pptx (он начинается с PK\x03\x04).
if head -c 4 "$OUT" | xxd -p -c 4 | grep -q '^504b0304'; then
  printf 'wrote %s (%s bytes)\n' "$OUT" "$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
else
  echo "error: response is not a valid .pptx" >&2
  head -c 500 "$OUT" >&2; echo >&2
  rm -f "$OUT"
  exit 1
fi
