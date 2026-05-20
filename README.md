# Movies — подсказчик что посмотреть

Сделано на вайбкодинг-мероприятии РАНХиГС (стенд `app2`).
Один экран: задаёшь параметры (фильм/сериал, жанр, настроение, год),
получаешь 3-5 рекомендаций с описанием сюжета и платформой просмотра.

iOS-look (тёмная тема, safe-area, тапаемые ≥44pt). Работает в Safari,
добавляется на экран Домой как PWA.

## Состав

```
app/                       — фронтенд (React 19 + Vite 6 + TS + Tailwind 4)
  src/routes/Movies.tsx    — единственный экран, форма + список карточек
  src/components/          — Screen / Button / Card (общие блоки)
  src/lib/                 — мини-роутер, обёртка над LocalStorage

api/                       — бекенд (FastAPI + httpx)
  main.py                  — /api/healthz, /api/vlm, /api/llm, /api/pptx
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

1. Пользователь выбирает в форме: фильм/сериал, жанр, настроение, год.
2. JSON с параметрами + system-промпт уходит на `POST /api/llm` —
   серверная ручка из `api/main.py`.
3. Бекенд проксирует в LLM-провайдера, тот возвращает JSON-массив
   рекомендаций.
4. Фронт парсит и рендерит карточки.

## Где живут токены провайдеров

**В браузере — нигде.** Все вызовы идут на `/api/*` — относительный
путь, попадает в nginx этого же приложения, тот проксирует на
FastAPI sidecar (`api/main.py`) на `127.0.0.1:8000`. Ключи провайдеров
лежат в **k8s secret** и пробрасываются sidecar'у через env
(см. `infra/k8s/deployment.yaml` → блок `env:` контейнера `api`).

Movies использует только `/api/llm`. На стенде `app2` (на нашей
инфре) этот endpoint проксирует в внутрикластерный прокси `gpt2giga`
→ **GigaChat-2-Max**. На стенде `deepseek` тот же код работал бы
с DeepSeek-v4-pro — настройка одной env-переменной.

Для собственного деплоя — либо подними свой `gpt2giga` и подложи
токен GigaChat, либо подмени env `VLM_URL` / `VLM_MODEL` в
`api/main.py` на любого Anthropic-совместимого провайдера (DeepSeek,
Claude, GLM/Z.AI).

## Локальный запуск (только UI)

```sh
cd app
npm install
npm run dev
```

UI откроется на `http://localhost:5173/`, но кнопка «Найти» получит
сетевую ошибку — фронт ждёт `/api/llm`. Чтобы ходило по-настоящему:
либо подними локально `api/` через docker compose, либо настрой proxy
на работающую инсталляцию.

## Деплой целиком (k8s + Harbor)

```sh
APP_SLUG=app2 KUBECONFIG=~/.kube/config ./scripts/deploy.sh
```

Скрипт собирает два образа (frontend + api), пушит в Harbor, применяет
`infra/k8s/*.yaml` в namespace `ranepa-${APP_SLUG}`. Подразумевает что
namespace + RBAC + harbor-creds уже настроены — см. `infra/k8s/bootstrap/`
из исходного шаблона.

## Стек

- React 19 + Vite 6 + TypeScript строгий
- Tailwind 4 (CSS-first, через `@tailwindcss/vite`)
- FastAPI 0.115 + httpx 0.27
- Сборка: docker → Harbor → k3s + traefik → edge nginx
