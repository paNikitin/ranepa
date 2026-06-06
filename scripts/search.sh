#!/usr/bin/env bash
# scripts/search.sh — поиск в интернете через Tavily (dev-tool агента).
#
# Когда применять: нужны актуальные факты/данные/новости которых нет в
# знаниях модели — курсы валют, свежие события, цены, расписания.
# Агент использует ответ как seed-данные или контент приложения.
#
# Использование:
#   ./scripts/search.sh "запрос" [кол-во-результатов]
#
# По умолчанию печатает выжимку-ответ + источники. Голый JSON: RAW=1.
#
# Env:
#   TAVILY_KEY — обязателен (ключ Tavily)

set -euo pipefail

QUERY="${1:?usage: search.sh \"query\" [max_results]}"
N="${2:-5}"
KEY="${TAVILY_KEY:?TAVILY_KEY env must be set}"

RESP=$(curl -sS -m 30 https://api.tavily.com/search \
  -H "content-type: application/json" \
  --data "$(jq -nc --arg k "$KEY" --arg q "$QUERY" --argjson n "$N" \
    '{api_key:$k, query:$q, max_results:$n, include_answer:true, search_depth:"basic"}')")

if [[ "${RAW:-0}" == "1" ]]; then
  printf '%s\n' "$RESP" | jq .
else
  printf '%s\n' "$RESP" | jq -r '
    "ОТВЕТ:\n" + (.answer // "—") + "\n\nИСТОЧНИКИ:",
    (.results[]? | "• \(.title)\n  \(.url)")'
fi
