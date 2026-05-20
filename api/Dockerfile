# Backend-sidecar для приложения участника. Минимальный FastAPI +
# uvicorn. nginx из фронт-контейнера проксирует /api/* на 8000.
#
# Сборка идёт из корня репо (контекст в scripts/deploy.sh уже выставлен).
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSL -o /tmp/vosk.zip https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip \
    && unzip -q /tmp/vosk.zip -d /app \
    && mv /app/vosk-model-small-ru-0.22 /app/vosk-model \
    && rm /tmp/vosk.zip

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/main.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
