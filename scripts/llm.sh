#!/usr/bin/env bash
# scripts/llm.sh — текстовый запрос в GigaChat (LLM) из шелла.
#
# Для агента: справочный канал во время разработки, не тратит
# квоту твоего слота. Например, чтобы спросить:
#   - "Перечисли 10 актуальных трендов российского E-commerce 2026"
#     → агент использует ответ как seed-данные для приложения;
#   - "На каком языке писать описание для аудитории X"
#     → агент принимает решение про i18n;
#   - "Дай JSON-схему для расписания семинаров вуза"
#     → агент копирует схему в TypeScript-типы.
#
# Использование:
#   ./scripts/llm.sh "вопрос/инструкция" ["опциональный system prompt"]
#
# Вывод — голый текст ответа модели на stdout.

set -euo pipefail

PROMPT="${1:?usage: llm.sh \"prompt\" [\"system\"]}"
SYSTEM="${2:-}"
VLM_URL="${VLM_URL:-http://gpt2giga.ranepa-tools.svc.cluster.local:8090}"
MODEL="${VLM_MODEL:-GigaChat-2-Max}"

PAYLOAD=$(jq -n \
  --arg model "$MODEL" \
  --arg prompt "$PROMPT" \
  --arg system "$SYSTEM" \
  '{
    model: $model,
    max_tokens: 2048,
    messages: [{role: "user", content: $prompt}]
  } | if $system != "" then . + {system: $system} else . end')

RESP=$(curl -sS -X POST "$VLM_URL/v1/messages" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  --data "$PAYLOAD")

TEXT=$(printf '%s' "$RESP" | jq -r '.content[0].text // empty')
if [[ -n "$TEXT" ]]; then
  printf '%s\n' "$TEXT"
else
  echo "LLM returned non-text response:" >&2
  printf '%s\n' "$RESP" >&2
  exit 1
fi
