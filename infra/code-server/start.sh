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
#
# ENV должны быть выставлены в pod spec:
#   APP_SLUG=app1..app5

set -e

: "${APP_SLUG:?APP_SLUG must be set}"

WORKDIR="/home/coder/work"

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
