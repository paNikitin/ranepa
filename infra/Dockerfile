# Multi-stage build:
#   stage 1 (build):   node 20-alpine — npm ci + vite build → dist/
#   stage 2 (runtime): nginx 1.27-alpine — serves the static SPA
#
# Build context должен быть КОРЕНЬ репы (а не app/), чтобы Dockerfile мог
# взять и app/, и infra/nginx.conf одной командой COPY. Скрипт
# scripts/deploy.sh уже это делает. Если будешь собирать руками —
# `docker build -f infra/Dockerfile .` из корня.

FROM node:20-alpine AS builder

ARG APP_BASE=/
ENV APP_BASE=${APP_BASE}

WORKDIR /build

COPY app/package.json app/package-lock.json* ./
RUN npm ci || npm install

COPY app/ .
RUN npm run build

FROM nginx:1.27-alpine

COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80
