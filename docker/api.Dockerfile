FROM python:3.11-slim

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/api/requirements.txt apps/api/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt

COPY alembic.ini alembic.ini
COPY apps/api apps/api
COPY apps/worker apps/worker

EXPOSE 7800

CMD ["uvicorn", "apps.api.app.main:app", "--host", "0.0.0.0", "--port", "7800"]
