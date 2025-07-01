# 1) Base image with Python
FROM python:3.11-slim-bookworm AS base
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3-opencv \
      build-essential \
      python3-dev \
      libssl-dev \
      chromium \
      chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# 2) Install dependencies
COPY api/requirements.txt .
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# 3) Bundle the app
COPY api/app ./app

RUN apt-get purge -y --auto-remove \
      build-essential python3-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 4) Launch with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
