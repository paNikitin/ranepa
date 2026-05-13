"""Минимальный FastAPI-бэкенд приложения участника.

Запускается как sidecar в pod'е приложения, nginx-фронт проксирует
`/api/*` сюда. Зачем существует: даёт фронту публичный endpoint для
вызовов, которые нельзя сделать из браузера напрямую — например,
VLM (нужен серверный ключ к gpt2giga proxy).

Эндпоинты:
  GET  /api/healthz — health check.
  POST /api/vlm     — multipart image + prompt → текст распознавания
                      (через gpt2giga → GigaChat-Vision).

Расширение: если участник просит ручку, которой здесь нет —
добавь её прямо в этот файл, deploy.sh пересоберёт image.
"""

import base64
import logging
import os

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

VLM_URL = os.environ.get(
    "VLM_URL", "http://gpt2giga.ranepa-tools.svc.cluster.local:8090"
)
VLM_MODEL = os.environ.get("VLM_MODEL", "GigaChat-2-Max")
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/gif", "image/webp"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("api")

app = FastAPI(title="ranepa-app api")


@app.get("/api/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/vlm")
async def vlm(
    image: UploadFile = File(...),
    prompt: str = Form("Опиши изображение детально на русском."),
) -> dict[str, str]:
    raw = await image.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "image too large (max 8 MB)")

    media_type = image.content_type or "image/jpeg"
    if media_type not in ALLOWED_MEDIA:
        raise HTTPException(400, f"unsupported media type: {media_type}")

    data = base64.b64encode(raw).decode("ascii")

    payload = {
        "model": VLM_MODEL,
        "max_tokens": 2048,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{VLM_URL}/v1/messages", json=payload)

    if r.status_code != 200:
        log.warning("vlm upstream %s: %s", r.status_code, r.text[:300])
        raise HTTPException(r.status_code, f"vlm upstream: {r.text[:500]}")

    body = r.json()
    text = "".join(
        b.get("text", "") for b in body.get("content", []) if b.get("type") == "text"
    )
    return {"text": text}
