# Backend-sidecar для приложения участника. Минимальный FastAPI +
# uvicorn. nginx из фронт-контейнера проксирует /api/* на 8000.
#
# Сборка идёт из корня репо (контекст в scripts/deploy.sh уже выставлен).
FROM python:3.13-slim

WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/main.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
