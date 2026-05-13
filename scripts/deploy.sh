#!/usr/bin/env bash
# scripts/deploy.sh — единственная команда, которую агент вызывает,
# чтобы опубликовать изменения участника.
#
# Что делает:
#   1) собирает docker-образ (vite build с base=/$APP_SLUG/),
#   2) пушит в Harbor harbor.parsers360.ru:10443/ranepa/$APP_SLUG,
#   3) применяет k8s манифесты (deployment+service+ingress) в ns ranepa-$APP_SLUG,
#   4) ждёт rollout.
#
# Требует в окружении:
#   APP_SLUG     — идентификатор слота (app1..app5)
#   HARBOR       — host:port регистра, дефолт harbor.parsers360.ru:10443
#   KUBECONFIG   — путь к kubeconfig этого слота
#
# Идемпотентен — можно вызывать после каждой правки.

set -euo pipefail

APP_SLUG="${APP_SLUG:?APP_SLUG must be set, e.g. APP_SLUG=app1}"
HARBOR="${HARBOR:-harbor.parsers360.ru:10443}"

cd "$(dirname "$0")/.."

# Чтобы новые правки участника попали в свежий image и k8s рестартовал
# pod, image tag должен быть уникальным. Тег = git short-sha; если в
# рабочей копии есть незакомиченные изменения — auto-commit'им их перед
# `git rev-parse`, иначе несколько deploy-ев подряд получат одинаковый
# tag и Deployment'у нечего будет роллаутить.
if ! git diff --quiet HEAD 2>/dev/null || [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
  echo "==> Auto-committing pending changes"
  git add -A
  git commit -m "deploy ${APP_SLUG} at $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --author "Slot ${APP_SLUG} <${APP_SLUG}@ranepa.gigaparsers.ru>" \
    --no-gpg-sign \
    --quiet || true
fi

VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${HARBOR}/ranepa/${APP_SLUG}:${VERSION}"

echo "==> Building ${IMAGE}"
docker build \
  --platform linux/amd64 \
  --build-arg "APP_BASE=/${APP_SLUG}/" \
  -f infra/Dockerfile \
  -t "${IMAGE}" \
  .

echo "==> Pushing ${IMAGE}"
docker push "${IMAGE}"

echo "==> Applying k8s manifests to ranepa-${APP_SLUG}"
export APP_SLUG VERSION
for f in infra/k8s/deployment.yaml infra/k8s/service.yaml infra/k8s/ingress.yaml; do
  envsubst < "$f" | kubectl apply -f -
done

# Fallback на случай, когда image tag не сменился (например, кто-то
# вручную запустил deploy.sh подряд без правок): `kubectl apply` тогда
# не триггерит роллаут — принудительно бамп через rollout restart, он
# просто обновит annotation в PodSpec и pod пересоздастся, подтянув
# свежий слой (imagePullPolicy: Always).
echo "==> Forcing rollout"
kubectl -n "ranepa-${APP_SLUG}" rollout restart deploy/ranepa-app

echo "==> Waiting rollout"
kubectl -n "ranepa-${APP_SLUG}" rollout status deploy/ranepa-app --timeout=120s

echo "==> Done. Open: https://ranepa.gigaparsers.ru/${APP_SLUG}/"
