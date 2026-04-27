FROM python:3.11-slim

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/api/requirements.txt apps/api/requirements.txt
COPY apps/worker/requirements.txt apps/worker/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt -r apps/worker/requirements.txt

COPY alembic.ini alembic.ini
COPY apps/api apps/api
COPY apps/worker apps/worker

CMD ["python", "-m", "apps.worker.worker.main"]
