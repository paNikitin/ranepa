# Cook — сканер еды + генератор рецептов

Сделано на вайбкодинг-мероприятии РАНХиГС (стенд `app1`).
Один экран: открываешь камеру, фотографируешь продукты на столе,
получаешь 3-5 готовых рецептов с инструкцией.

iOS-look (тёмная тема, safe-area, тапаемые ≥44pt). Работает в Safari,
добавляется на экран Домой как PWA.

## Состав

```
app/                       — фронтенд (React 19 + Vite 6 + TS + Tailwind 4)
  src/routes/Cook.tsx      — единственный экран, вся UI-логика
  src/components/          — Screen / Button / Card (общие блоки)
  src/lib/                 — мини-роутер, обёртка над LocalStorage

api/                       — бекенд (FastAPI + httpx)
  main.py                  — /api/healthz, /api/vlm, /api/llm
  Dockerfile               — sidecar-образ

infra/                     — сборка + публикация
  Dockerfile               — multi-stage vite build → nginx
  nginx.conf               — SPA + проксирование /api/* в backend sidecar
  k8s/                     — deployment + service + ingress

scripts/
  deploy.sh                — build → push → kubectl apply
  vlm.sh, llm.sh, pptx.sh  — dev-инструменты (для агента в чате)
  reset.sh                 — откатить локально к origin/main
```

## Как это работает (поток данных)

1. Пользователь нажимает «Сфотографировать», Safari открывает камеру.
2. Снимок улетает на `POST /api/vlm` — это серверная ручка из
   `api/main.py`, которая живёт в том же pod'е что фронт-nginx.
3. Бекенд проксирует картинку в VLM-провайдера → распознаёт продукты
   (текстом).
4. Текстовый список + system-промпт идёт `POST /api/llm` → LLM
   возвращает JSON-массив рецептов.
5. Фронт парсит и рендерит карточки.

## Где живут токены провайдеров

**В браузере — нигде.** Все вызовы идут на `/api/*` — относительный
путь, попадает в nginx этого же приложения, тот проксирует на
FastAPI sidecar (`api/main.py`) на `127.0.0.1:8000`. Ключи провайдеров
лежат в **k8s secret** и пробрасываются sidecar'у через env
(см. `infra/k8s/deployment.yaml` → блок `env:` контейнера `api`).

В этом конкретном развёртывании (стенд `app1` на ranepa.gigaparsers.ru)
sidecar смотрит на внутрикластерный прокси `gpt2giga` →
**GigaChat-2-Max** (и VLM, и LLM).

Для собственного деплоя — либо подними свой `gpt2giga` и подложи
токен GigaChat в `gpt2giga-creds` secret, либо подмени `VLM_URL` /
`VLM_MODEL` env переменные (см. `api/main.py`, переменная `VLM_URL` в
начале файла) на любого другого Anthropic-совместимого провайдера
(DeepSeek, Claude, GLM/Z.AI).

## Локальный запуск (только UI)

```sh
cd app
npm install
npm run dev
```

UI откроется на `http://localhost:5173/`, но кнопка «Распознать»
получит сетевую ошибку — фронт ждёт `/api/vlm` / `/api/llm`. Чтобы
ходило по-настоящему: либо подними локально `api/` через docker compose,
либо настрой proxy на работающую инсталляцию.

## Деплой целиком (k8s + Harbor)

```sh
APP_SLUG=app1 KUBECONFIG=~/.kube/config ./scripts/deploy.sh
```

Скрипт собирает два образа (frontend + api), пушит в Harbor, применяет
`infra/k8s/*.yaml` в namespace `ranepa-${APP_SLUG}`. Подразумевает что
namespace + RBAC + harbor-creds уже настроены — см. `infra/k8s/bootstrap/`
из исходного шаблона.

## Стек

- React 19 + Vite 6 + TypeScript строгий
- Tailwind 4 (CSS-first, через `@tailwindcss/vite`)
- FastAPI 0.115 + httpx 0.27 + python-pptx 1.0 (последнее не используется
  в Cook, осталось от шаблона — можно вычистить из `api/requirements.txt`)
- Сборка: docker → Harbor → k3s + traefik → edge nginx
