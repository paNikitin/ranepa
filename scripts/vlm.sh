#!/usr/bin/env bash
# scripts/vlm.sh — инструмент разработки: распознать изображение через
# GigaChat-Vision (GigaChat-2-Max).
#
# Использовать, когда участник:
#   - присылает скриншот и просит «что тут» / «извлеки данные»;
#   - кладёт фото этикетки и просит «прочитай штрихкод/состав»;
#   - даёт схему/диаграмму и просит «опиши логику»;
#   - вообще любой запрос, для которого нужен глаз на картинку.
#
# Использование:
#   ./scripts/vlm.sh <path-to-image> ["вопрос/инструкция"]
#
# Без второго аргумента — общее описание изображения на русском.
#
# Скрипт работает в любом слоте независимо от Claude-провайдера —
# обращается напрямую к gpt2giga-сервису в ns ranepa-tools, который
# делает Anthropic-API ↔ GigaChat-маппинг и держит креды для нас.

set -euo pipefail

IMG_PATH="${1:?usage: vlm.sh <image-path> [\"prompt\"]}"
PROMPT="${2:-Опиши изображение детально, на русском. Если есть текст — приведи его дословно.}"
VLM_URL="${VLM_URL:-http://gpt2giga.ranepa-tools.svc.cluster.local:8090}"
MODEL="${VLM_MODEL:-GigaChat-2-Max}"

[[ -f "$IMG_PATH" ]] || { echo "error: $IMG_PATH not found" >&2; exit 1; }

MEDIA_TYPE=$(file --mime-type -b "$IMG_PATH")
case "$MEDIA_TYPE" in
  image/jpeg|image/png|image/gif|image/webp) ;;
  *) echo "error: unsupported media type $MEDIA_TYPE (need JPEG/PNG/GIF/WebP)" >&2; exit 1 ;;
esac

DATA=$(base64 -w0 "$IMG_PATH" 2>/dev/null || base64 "$IMG_PATH" | tr -d '\n')

PAYLOAD=$(jq -n \
  --arg model "$MODEL" \
  --arg media "$MEDIA_TYPE" \
  --arg data "$DATA" \
  --arg prompt "$PROMPT" \
  '{
    model: $model,
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [
        {type: "image", source: {type: "base64", media_type: $media, data: $data}},
        {type: "text",  text: $prompt}
      ]
    }]
  }')

RESP=$(curl -sS -X POST "$VLM_URL/v1/messages" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  --data "$PAYLOAD")

TEXT=$(printf '%s' "$RESP" | jq -r '.content[0].text // empty')
if [[ -n "$TEXT" ]]; then
  printf '%s\n' "$TEXT"
else
  # Если что-то пошло не так — выводим тело ответа целиком, агент
  # прочитает и поправит вызов / запрос.
  echo "VLM returned non-text response:" >&2
  printf '%s\n' "$RESP" >&2
  exit 1
fi
