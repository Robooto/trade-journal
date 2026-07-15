FROM python:3.11-slim-bookworm AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      python3-dev \
      libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install \
      --target /opt/python \
      --require-hashes \
      -r requirements.txt

FROM python:3.11-slim-bookworm AS runtime

ARG APP_UID=1000
ARG APP_GID=1000

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --gid "$APP_GID" app && \
    useradd --uid "$APP_UID" --gid "$APP_GID" --create-home app

WORKDIR /app
COPY --from=builder /opt/python /usr/local/lib/python3.11/site-packages
COPY --chown=app:app api/app ./app

USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/v1/', timeout=2).read()"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
