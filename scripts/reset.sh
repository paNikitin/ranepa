#!/usr/bin/env bash
# scripts/reset.sh — «отменить всё, вернуть к шаблону».
#
# Используется, когда AI наломал так, что не починить за пару правок.
# Сбрасывает рабочую копию ветки участника к origin/main, пересобирает
# зависимости. Не трогает запущенный в кластере деплой — для этого
# отдельно вызвать deploy.sh после reset.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Сбрасываю локальные изменения к origin/main"
git fetch origin main
git reset --hard origin/main

echo "==> Удаляю node_modules и переустанавливаю зависимости"
rm -rf app/node_modules
( cd app && npm install )

echo "==> Готово. Шаблон в исходном состоянии."
echo "    Чтобы опубликовать чистую версию — APP_SLUG=\$APP_SLUG ./scripts/deploy.sh"
