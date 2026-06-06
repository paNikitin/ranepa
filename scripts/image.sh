#!/usr/bin/env bash
# scripts/image.sh — сгенерировать картинку по описанию (dev-tool агента).
#
# Обращается напрямую к кластерному LiteLLM (Gemini image-модели),
# минуя приложение. Удобно когда нужен proof-of-concept или ассет
# в дев-время, не тратя квоту слота.
#
# Использование:
#   ./scripts/image.sh "описание картинки" [out.png]
#
# Env:
#   LITELLM_URL    — default http://litellm.openclaw.svc.cluster.local:4000
#   LITELLM_KEY    — default litellm-openclaw-master-key
#   IMAGE_MODEL    — default gemini-2.5-flash-image

set -euo pipefail

PROMPT="${1:?usage: image.sh \"prompt\" [out.png]}"
OUT="${2:-image.png}"
URL="${LITELLM_URL:-http://litellm.openclaw.svc.cluster.local:4000}"
KEY="${LITELLM_KEY:-litellm-openclaw-master-key}"
MODEL="${IMAGE_MODEL:-gemini-2.5-flash-image}"

RESP=$(curl -sS -m 120 "$URL/v1/images/generations" \
  -H "Authorization: Bearer $KEY" \
  -H "content-type: application/json" \
  --data "$(jq -nc --arg m "$MODEL" --arg p "$PROMPT" '{model:$m, prompt:$p}')")

B64=$(printf '%s' "$RESP" | jq -r '.data[0].b64_json // empty')
if [[ -n "$B64" ]]; then
  printf '%s' "$B64" | base64 -d > "$OUT"
  printf 'wrote %s (%s bytes)\n' "$OUT" "$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
else
  echo "no image in response:" >&2
  printf '%s\n' "$RESP" | head -c 500 >&2; echo >&2
  exit 1
fi
