#!/usr/bin/env bash
# Стартовый скрипт code-server-pod'а. Поднимает рабочую среду и запускает
# ttyd, который обслуживает /dev/app<N>: открывается ровно один TUI —
# чат с Claude Code, без shell-доступа.
#
# Что должно быть смонтировано к моменту старта (см. deployment.yaml):
#   /home/coder/.claude/.credentials.json     — OAuth-токен Claude.ai
#                                              (общий для всех слотов)
#   /home/coder/.kube/config                  — kubeconfig этого слота
#                                              (только на свой ns)
#   /home/coder/.docker/config.json           — Harbor robot creds
#   /home/coder/.ssh/id_ed25519               — github deploy key (RW)
#   /var/run/docker.sock                      — сокет хоста для билдов
#   /etc/sing-box/config.json                 — VLESS+REALITY к Anthropic API
#
# ENV должны быть выставлены в pod spec:
#   APP_SLUG=app1..app5

set -e

: "${APP_SLUG:?APP_SLUG must be set}"

WORKDIR="/home/coder/work"

# 1. Стартуем sing-box в фоне для туннеля к api.anthropic.com.
#    api.anthropic.com заблокирован из РФ; sing-box разворачивает
#    inbound mixed на 127.0.0.1:1088 (одновременно SOCKS5 и HTTP).
#    Outbound — vless+reality, конфиг приходит через k8s secret.
if [[ -f /etc/sing-box/config.json ]]; then
  sing-box check -c /etc/sing-box/config.json
  sing-box run -c /etc/sing-box/config.json &
  SB_PID=$!
  echo "==> sing-box launched (pid=$SB_PID), waiting for inbound..."

  for i in $(seq 1 20); do
    if (echo > /dev/tcp/127.0.0.1/1088) 2>/dev/null; then
      echo "==> sing-box ready"
      break
    fi
    sleep 0.25
  done

  export HTTPS_PROXY="http://127.0.0.1:1088"
  export HTTP_PROXY="http://127.0.0.1:1088"
  export ALL_PROXY="socks5h://127.0.0.1:1088"
  export NO_PROXY="localhost,127.0.0.1,::1,kubernetes.default,*.svc,*.svc.cluster.local,*.cluster.local,*.parsers360.ru,*.gigaparsers.ru,10.42.0.0/16,10.43.0.0/16,5.188.118.125"
  echo "==> Proxy enabled: HTTPS_PROXY=$HTTPS_PROXY"
else
  echo "==> WARN: /etc/sing-box/config.json not mounted, proxy disabled"
  echo "==> Claude API requests will likely fail from this pod (RU blocking)"
fi

# Первый запуск — клонировать шаблон и переключиться на ветку слота.
if [[ ! -d "$WORKDIR/.git" ]]; then
  echo "==> Cloning template into $WORKDIR (slot=$APP_SLUG)"
  mkdir -p "$WORKDIR"
  git clone https://github.com/paNikitin/ranepa.git "$WORKDIR"
  cd "$WORKDIR"
  git checkout -b "$APP_SLUG" 2>/dev/null || git checkout "$APP_SLUG"

  ( cd app && npm install --no-audit --no-fund )
fi

cd "$WORKDIR"

# Инициализируем git config, если PVC чистая.
git config --global --add safe.directory "$WORKDIR"
git config --global user.email "${APP_SLUG}@ranepa.gigaparsers.ru"
git config --global user.name  "Slot ${APP_SLUG}"

# Известные хосты (без интерактивного prompt'а при первом push).
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 600 ~/.ssh/known_hosts

cat <<HELLO

═══════════════════════════════════════════════════════════
   Слот: ${APP_SLUG}
   Превью: https://ranepa.gigaparsers.ru/${APP_SLUG}/
═══════════════════════════════════════════════════════════

Сейчас откроется чат с агентом. Просто напишите, какое приложение
вы хотите. Например: "сделай чек-лист для подготовки к семинару".

Готовые формулировки — в файле examples/prompts.md.

HELLO

exec ttyd \
  --port 7681 \
  --interface 0.0.0.0 \
  --writable \
  --once=false \
  -t titleFixed="Слот ${APP_SLUG} — вайбкодинг" \
  -t fontSize=16 \
  -- bash -lc "cd $WORKDIR && claude"
