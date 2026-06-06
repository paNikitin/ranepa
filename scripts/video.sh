#!/usr/bin/env bash
# scripts/video.sh — сгенерировать видео по описанию (Veo, dev-tool агента).
#
# Обращается напрямую к кластерному LiteLLM (/v1/videos), минуя приложение.
# Async: submit → poll → fetch. Занимает 1-3 минуты.
#
# Использование:
#   ./scripts/video.sh "описание сцены" [out.mp4]
#
# Env:
#   LITELLM_URL   — default http://litellm.openclaw.svc.cluster.local:4000
#   LITELLM_KEY   — default litellm-openclaw-master-key
#   VIDEO_MODEL   — default veo-3.0-fast (дешевле; veo-3.0 — выше качество)

set -euo pipefail

PROMPT="${1:?usage: video.sh \"prompt\" [out.mp4]}"
OUT="${2:-video.mp4}"
URL="${LITELLM_URL:-http://litellm.openclaw.svc.cluster.local:4000}"
KEY="${LITELLM_KEY:-litellm-openclaw-master-key}"
MODEL="${VIDEO_MODEL:-veo-3.0-fast}"

echo "submit ($MODEL)…"
VID=$(curl -sS -m 60 "$URL/v1/videos" \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  --data "$(jq -nc --arg m "$MODEL" --arg p "$PROMPT" '{model:$m, prompt:$p}')" \
  | jq -r '.id // empty')
[[ -n "$VID" ]] || { echo "submit failed" >&2; exit 1; }

echo "polling (1-3 мин)…"
for i in $(seq 1 60); do
  sleep 5
  ST=$(curl -sS -m 15 "$URL/v1/videos/$VID" -H "Authorization: Bearer $KEY" | jq -r '.status // "?"')
  printf '  [%s] %s\n' "$((i*5))s" "$ST"
  case "$ST" in
    completed|succeeded|done) break ;;
    failed|error) echo "generation failed" >&2; exit 1 ;;
  esac
done

curl -sS -m 60 "$URL/v1/videos/$VID/content" -H "Authorization: Bearer $KEY" -o "$OUT"
printf 'wrote %s (%s bytes)\n' "$OUT" "$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
