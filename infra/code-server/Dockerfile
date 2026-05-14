# Среда участника: web-terminal с Claude Code CLI.
#
# Запуск: ttyd обслуживает HTTP/WebSocket → запускает `claude` в TUI.
# Участник открывает https://ranepa.gigaparsers.ru/dev/app<N> — видит
# ровно один интерфейс: чат с агентом. Никаких IDE, файловых деревьев,
# терминалов с shell — потому что цель «общается только с чатом».
#
# Образ грузит, как зависимости:
#   - claude code CLI (через @anthropic-ai/claude-code) — основной агент
#   - kubectl, docker CLI, git, gh — нужны агенту, чтобы выполнять deploy.sh
#   - bash, curl, openssh-client — utility
#
# Билдить и пушить:
#   docker build --platform linux/amd64 -t harbor.parsers360.ru:10443/ranepa/code-server:0.1.0 -f infra/code-server/Dockerfile .
#   docker push harbor.parsers360.ru:10443/ranepa/code-server:0.1.0

FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive
# UTF-8 locale обязателен: без него tmux считает ширину символов
# по байтам, а Claude Code TUI скатывается в ASCII-fallback
# (рамки рисуются как _____, логотип — чёрными блоками).
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Системные тулы. docker-cli без daemon — daemon берём с хоста через
# монтированный сокет (см. deployment.yaml). Это даёт code-server'у
# root-уровень доступа к k3s узлу — приемлемо для разового мероприятия,
# но не для long-running production окружения.
RUN apt-get update && apt-get install -y --no-install-recommends \
        bash curl ca-certificates git gnupg openssh-client \
        sudo gettext-base jq vim less procps tini tmux ncurses-term \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && curl -fsSL "https://dl.k8s.io/release/v1.30.5/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl \
    && chmod +x /usr/local/bin/kubectl \
    && curl -fsSL https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz -o /tmp/gh.tgz \
    && tar -xzf /tmp/gh.tgz -C /usr/local/bin --strip-components=2 gh_2.62.0_linux_amd64/bin/gh \
    && rm -f /tmp/gh.tgz \
    && rm -rf /var/lib/apt/lists/*

# ttyd v1.7+ — web-обёртка над любой команды. Терминал в браузере.
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

# sing-box — клиент VLESS+REALITY. Нужен потому что api.anthropic.com
# из РФ напрямую недоступен. Запускается в фоне в start.sh, выставляет
# mixed (SOCKS5+HTTP) inbound на 127.0.0.1:1088, claude ходит через
# HTTPS_PROXY. Конфиг с реальными ключами — k8s secret vless-config.
RUN curl -fsSL https://github.com/SagerNet/sing-box/releases/download/v1.10.7/sing-box-1.10.7-linux-amd64.tar.gz -o /tmp/sb.tgz \
    && tar -xzf /tmp/sb.tgz -C /tmp \
    && mv /tmp/sing-box-*/sing-box /usr/local/bin/sing-box \
    && chmod +x /usr/local/bin/sing-box \
    && rm -rf /tmp/sb.tgz /tmp/sing-box-*

# Claude Code CLI — главный инструмент.
RUN npm install -g @anthropic-ai/claude-code

# Пользователь без root-прав. UID 1000 совпадает с типичным
# host docker.sock (если хост — debian/ubuntu сервер).
# В node:20-bookworm уже есть user `node` с uid 1000 — убираем его
# чтобы освободить uid и не плодить путаницу.
RUN userdel -r node 2>/dev/null || true \
    && useradd -m -u 1000 -s /bin/bash coder \
    && echo "coder ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/coder

USER coder
WORKDIR /home/coder

# Стартовый скрипт ставит окружение и стартует ttyd.
COPY --chown=coder:coder infra/code-server/start.sh /home/coder/start.sh
RUN chmod +x /home/coder/start.sh

EXPOSE 7681
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/home/coder/start.sh"]
