# Anekdot — генератор анекдотов с голосом + скачивание pptx

Сделано на вайбкодинг-мероприятии РАНХиГС (стенд `app3`). Два экрана:
- **Joke** — диктуешь голосом ключевые слова / темы, ИИ сочиняет анекдот.
- **Pitch** — скачать .pptx-презентацию про приложение одним тапом.

iOS-look (тёмная тема, safe-area, тапаемые ≥44pt). Работает в Safari,
добавляется на экран Домой как PWA.

## Состав

```
app/                       — фронтенд (React 19 + Vite 6 + TS + Tailwind 4)
  src/App.tsx              — switch по route'ам
  src/lib/router.ts        — мини-stack-роутер
  src/routes/
    Home.tsx               — стартовый экран
    Joke.tsx               — диктовка + LLM-генерация
    Pitch.tsx              — кнопка «скачать .pptx»
    List.tsx, Detail.tsx   — экраны из шаблона (можно вычистить)
  src/components/          — Screen / Button / Card

api/                       — бекенд (FastAPI + httpx + python-pptx)
  main.py                  — /api/healthz, /api/vlm, /api/stt,
                              /api/llm, /api/pptx
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

### Joke

1. Пользователь нажимает «Записать», Safari открывает микрофон.
2. Аудио-blob (webm/mp4) уходит на `POST /api/stt` — серверная ручка
   из `api/main.py`, проксирует в STT-провайдера, возвращает текст.
3. Текст добавляется к ключевым словам.
4. Кнопка «Сочинить» → `POST /api/llm` с ключевыми словами в prompt'е,
   LLM возвращает текст анекдота.

### Pitch

1. Кнопка «Скачать .pptx» → `POST /api/pptx` с JSON-структурой
   презентации (title, subtitle, slides[]).
2. Бекенд через `python-pptx` собирает файл и отдаёт `attachment`-ом.
3. Браузер запускает download.

## Где живут токены провайдеров

**В браузере — нигде.** Все вызовы идут на `/api/*` — относительный
путь, попадает в nginx этого же приложения, тот проксирует на
FastAPI sidecar (`api/main.py`) на `127.0.0.1:8000`. Ключи провайдеров
лежат в **k8s secret** и пробрасываются sidecar'у через env
(см. `infra/k8s/deployment.yaml` → блок `env:` контейнера `api`).

В этом конкретном развёртывании (стенд `app3`) sidecar смотрит на
внутрикластерный прокси `gpt2giga` → **GigaChat-2-Max** (для VLM и
LLM). STT-провайдера и точный endpoint смотри в `api/main.py`
(хэндлер `/api/stt`). Сборка .pptx делается полностью на бекенде
через python-pptx, без внешних сервисов.

Для собственного деплоя — либо подними свой `gpt2giga` и подложи
токен GigaChat в `gpt2giga-creds` secret, либо подмени env
`VLM_URL` / `VLM_MODEL` в `api/main.py` на любого Anthropic-
совместимого провайдера (DeepSeek, Claude, GLM/Z.AI).

## Локальный запуск (только UI)

```sh
cd app
npm install
npm run dev
```

UI откроется на `http://localhost:5173/`, но кнопки получат сетевые
ошибки — фронт ждёт `/api/stt` / `/api/llm` / `/api/pptx`. Чтобы
ходило по-настоящему: либо подними локально `api/` через docker compose,
либо настрой proxy на работающую инсталляцию.

## Деплой целиком (k8s + Harbor)

```sh
APP_SLUG=app3 KUBECONFIG=~/.kube/config ./scripts/deploy.sh
```

Скрипт собирает два образа (frontend + api), пушит в Harbor, применяет
`infra/k8s/*.yaml` в namespace `ranepa-${APP_SLUG}`. Подразумевает что
namespace + RBAC + harbor-creds уже настроены — см. `infra/k8s/bootstrap/`
из исходного шаблона.

## Стек

- React 19 + Vite 6 + TypeScript строгий
- Tailwind 4 (CSS-first, через `@tailwindcss/vite`)
- FastAPI 0.115 + httpx 0.27 + python-pptx 1.0
- Сборка: docker → Harbor → k3s + traefik → edge nginx
