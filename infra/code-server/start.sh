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

# Wait for DinD sidecar to be ready. Docker socket в emptyDir
# /var/run/docker.sock появляется когда dockerd готов принимать команды.
echo "==> Waiting for DinD sidecar"
for i in $(seq 1 60); do
  if [[ -S /var/run/docker.sock ]] && docker info >/dev/null 2>&1; then
    echo "    DinD ready"
    break
  fi
  sleep 1
done

# Harbor docker login через смонтированный k8s secret harbor-creds-ranepa.
# Secret type docker-registry имеет ключ .dockerconfigjson — это ровно тот
# формат, который docker CLI ожидает в ~/.docker/config.json.
if [[ -f /etc/harbor-creds/.dockerconfigjson ]]; then
  mkdir -p /home/coder/.docker
  install -m 600 /etc/harbor-creds/.dockerconfigjson /home/coder/.docker/config.json
  echo "==> Harbor docker login configured"
fi

# Copy Claude OAuth-кред из секрета (mount /etc/claude-creds, owner=root)
# в ~/.claude/.credentials.json (writable, owner=coder). Иначе директория
# /home/coder/.claude/ остаётся root-owned после k8s subPath mount, и
# Claude Code не может писать туда state-файлы (последний-чек, статсиг,
# session id) → ведёт себя так, будто это первый запуск, и просит /login.
mkdir -p /home/coder/.claude
# Два варианта аутентификации:
#   а) credentials.json в секрете → OAuth Max 5x (через Keychain/Anthropic);
#   б) settings.json в секрете    → env-based провайдер (DeepSeek/Z.AI/…).
# Оба mount'а живут в /etc/claude-creds/, мы копируем в правильное место.
if [[ -f /etc/claude-creds/credentials.json ]]; then
  install -m 600 /etc/claude-creds/credentials.json /home/coder/.claude/.credentials.json
  echo "==> Claude OAuth creds installed (subscriptionType=$(jq -r '.claudeAiOauth.subscriptionType' /home/coder/.claude/.credentials.json))"
fi
if [[ -f /etc/claude-creds/settings.json ]]; then
  install -m 600 /etc/claude-creds/settings.json /home/coder/.claude/settings.json
  PROVIDER=$(jq -r '.env.ANTHROPIC_BASE_URL // "anthropic"' /home/coder/.claude/settings.json)
  echo "==> Claude env-provider settings installed (base=$PROVIDER)"
fi

# Pre-seed ~/.claude.json чтобы Claude не показывал участнику onboarding-
# wizard'ов и trust-диалогов на /home/coder/work (для участников экран —
# это чат, не set-up визард). Если файл не существует — создаём минимальный;
# если уже есть — патчим только наши флаги, остальные данные сохраняем.
CLAUDE_STATE=/home/coder/.claude.json
if [[ ! -f "$CLAUDE_STATE" ]]; then
  echo '{}' > "$CLAUDE_STATE"
fi
jq '
  .hasCompletedOnboarding = true |
  .bypassPermissionsModeAccepted = true |
  .projects = ((.projects // {}) + {
    "/home/coder/work": ((.projects["/home/coder/work"] // {}) + {
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true
    })
  })
' "$CLAUDE_STATE" > "$CLAUDE_STATE.tmp" && mv "$CLAUDE_STATE.tmp" "$CLAUDE_STATE"
chmod 600 "$CLAUDE_STATE"
echo "==> Claude state: onboarding done, /home/coder/work trusted"

# 1. Стартуем sing-box в фоне для туннеля к api.anthropic.com.
#    api.anthropic.com заблокирован из РФ; sing-box разворачивает
#    inbound mixed на 127.0.0.1:1088 (одновременно SOCKS5 и HTTP).
#    Outbound — vless+reality, конфиг приходит через k8s secret.
#    Для слотов с прямым доступом (DeepSeek и т.п.) секрет отсутствует
#    → mount пустой → sing-box не стартует, proxy envs не выставляются.
if [[ -f /etc/sing-box/config.json ]] && sing-box check -c /etc/sing-box/config.json 2>/dev/null; then
  mkdir -p /tmp/sb
  cp /etc/sing-box/config.json /tmp/sb/config.json

  # Эмпирически: ПЕРВЫЙ sing-box после старта pod'а через VLESS+REALITY
  # к api.anthropic.com входит в degraded state — всякий запрос
  # multi-step CLI (Claude Code) возвращает 403 Request not allowed
  # (прямой curl POST через тот же proxy при этом работает).
  # Отдельный sing-box, поднятый ПОЗЖЕ через тот же конфиг — работает
  # стабильно. Гипотеза: первое REALITY-handshake к Anthropic происходит
  # до того, как Anthropic-CDN успел проинициализировать TLS-сессию
  # для нашего исходящего IP, и кэшируется как «degraded».
  # Workaround: bootstrap-фаза 5 секунд → kill → fresh start.
  echo "==> sing-box bootstrap (will be replaced after warmup)"
  sing-box run -c /tmp/sb/config.json > /tmp/sing-box-bootstrap.log 2>&1 &
  BOOTSTRAP_PID=$!
  sleep 5
  kill -TERM "$BOOTSTRAP_PID" 2>/dev/null || true
  wait "$BOOTSTRAP_PID" 2>/dev/null || true
  sleep 1

  echo "==> sing-box fresh start"
  nohup sing-box run -c /tmp/sb/config.json > /tmp/sing-box.log 2>&1 &
  SB_PID=$!
  disown
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
  echo "==> No VLESS proxy mounted — using direct connection."
  echo "    (OK для слотов с провайдером, который доступен из РФ — DeepSeek и т.п.)"
fi

# Шаблон в /home/coder/work на ветке main. На каждом старте pod'а
# делаем hard reset к origin/main — участник всегда стартует с самой
# свежей версии шаблона. Если он попросил агента поменять файлы и они
# не задеплоились (== не закоммичены и пушнуты), при рестарте pod'а они
# потеряются — это намеренно: deploy.sh — единственный путь сохранить
# работу. Деплой пакует образ в Harbor с git-sha как тегом, k8s
# подхватывает из ns ranepa-${APP_SLUG}.
if [[ ! -d "$WORKDIR/.git" ]]; then
  echo "==> Cloning template into $WORKDIR (slot=$APP_SLUG)"
  mkdir -p "$WORKDIR"
  git clone https://github.com/paNikitin/ranepa.git "$WORKDIR"
  cd "$WORKDIR"
  ( cd app && npm install --no-audit --no-fund )
else
  cd "$WORKDIR"
  echo "==> Updating repo to latest origin/main"
  git fetch origin main 2>&1 | tail -3 || true
  git reset --hard origin/main 2>&1 | tail -2 || true
  git checkout main 2>&1 | tail -2 || true
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

# Shared-сессия: все, кто открыл стенд, видят ОДИН терминал и могут
# печатать. Достигается через tmux — ttyd на каждого клиента запускает
# `tmux new-session -A -s ranepa`, который при первом заходе создаёт
# сессию с claude внутри, а на втором/третьем — просто attach'ится к
# уже живой. Сессия переживает disconnect: участник вернулся — увидел
# тот же экран и историю.
cat > /home/coder/.tmux.conf <<'TMUX'
set -g mouse on
set -g window-size largest
set -g history-limit 50000
set -g status off
set -g escape-time 10
TMUX

exec ttyd \
  --port 7681 \
  --interface 0.0.0.0 \
  --writable \
  -t titleFixed="Slot ${APP_SLUG}" \
  -t fontSize=16 \
  -- tmux new-session -A -s ranepa "cd $WORKDIR && exec claude --dangerously-skip-permissions"
