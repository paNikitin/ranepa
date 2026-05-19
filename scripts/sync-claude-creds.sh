#!/usr/bin/env bash
# scripts/sync-claude-creds.sh — синк OAuth-токена Anthropic между Claude-slots.
#
# Anthropic ротирует refresh-token при каждом access-refresh: один токен
# в нескольких pod'ах → один из них обновит, остальные через ~8ч получат
# 401 при попытке refresh. Скрипт это лечит:
#   1) (опционально) дёргает `claude -p ok` в source-pod'е, чтобы
#      триггернуть refresh и получить свежие токены прямо сейчас;
#   2) забирает обновлённый ~/.claude/.credentials.json из source-pod'а;
#   3) заливает в k8s secret claude-credentials;
#   4) `rollout restart` остальные slots — они подхватят свежий токен
#      при старте (через start.sh, который копирует из /etc/claude-creds).
#
# Использование:
#   ./scripts/sync-claude-creds.sh             # sync из app1 → в app2..5
#   ./scripts/sync-claude-creds.sh --refresh   # принудительно триггернуть refresh
#   SOURCE_SLOT=app3 ./scripts/sync-claude-creds.sh
#
# Env-переменные:
#   SOURCE_SLOT — слот-источник (default: app1)
#   SLOTS       — целевые слоты через пробел (default: "app1 app2 app3 app4 app5")
#   NS          — namespace (default: ranepa-tools)
#   SECRET      — имя secret'а с creds (default: claude-credentials)

set -euo pipefail

NS="${NS:-ranepa-tools}"
SECRET="${SECRET:-claude-credentials}"
SOURCE_SLOT="${SOURCE_SLOT:-app1}"
SLOTS="${SLOTS:-app1 app2 app3 app4 app5}"
DO_REFRESH=0

for arg in "$@"; do
  case "$arg" in
    --refresh|-r) DO_REFRESH=1 ;;
    --help|-h)
      sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

SRC_POD=$(kubectl -n "$NS" get pods -l "slot=$SOURCE_SLOT" \
  --field-selector=status.phase=Running \
  --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | head -1)
[[ -n "$SRC_POD" ]] || { echo "no running pod for slot=$SOURCE_SLOT in ns=$NS" >&2; exit 1; }
echo "==> source: $SOURCE_SLOT ($SRC_POD)"

if [[ "$DO_REFRESH" == "1" ]]; then
  echo "==> triggering refresh inside $SOURCE_SLOT"
  kubectl -n "$NS" exec "$SRC_POD" -c code-server -- bash -c '
    export HTTPS_PROXY="${HTTPS_PROXY:-http://127.0.0.1:1088}" \
           HTTP_PROXY="${HTTP_PROXY:-http://127.0.0.1:1088}" \
           NO_PROXY="localhost,127.0.0.1,kubernetes.default,*.svc,*.cluster.local,*.parsers360.ru,*.gigaparsers.ru"
    timeout 45 claude -p "ok" --output-format text >/dev/null 2>&1 || true
  '
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

kubectl -n "$NS" exec "$SRC_POD" -c code-server -- \
  cat /home/coder/.claude/.credentials.json > "$TMP"
chmod 600 "$TMP"

# Sanity-check + сколько осталось до истечения.
python3 - "$TMP" <<'PY'
import json, sys, time
d = json.load(open(sys.argv[1]))
o = d.get("claudeAiOauth", {})
exp = (o.get("expiresAt") or 0) / 1000
left = int((exp - time.time()) / 60)
if left <= 0:
    print(f"    WARN: token expired {abs(left)} min ago", file=sys.stderr)
    sys.exit(2)
print(f"    token ok, expires in {left} min, sub={o.get('subscriptionType')}")
PY

echo "==> updating secret $NS/$SECRET"
kubectl -n "$NS" create secret generic "$SECRET" \
  --from-file=credentials.json="$TMP" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

for slot in $SLOTS; do
  if [[ "$slot" == "$SOURCE_SLOT" ]]; then
    echo "    skip $slot (source — уже свежее)"
    continue
  fi
  kubectl -n "$NS" rollout restart "deploy/code-server-$slot" >/dev/null
  echo "    rollout restart $slot"
done

echo "==> done. через 60-90 сек проверить:"
echo "    kubectl -n $NS get pods -l app=code-server"
