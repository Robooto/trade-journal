FROM python:3.11-slim-bookworm

WORKDIR /app

# 1) Install build tools + deps for Playwright
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential python3-dev libssl-dev libffi-dev \
      curl nodejs npm cargo \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
      libxss1 libasound2 libgbm1 fontconfig \
    && rm -rf /var/lib/apt/lists/*

# 2) Copy & install your requirements
COPY api/requirements.txt .
#    make sure requirements.txt has:  playwright~=1.43.0
RUN pip install --upgrade pip \
 && pip install --no-binary=playwright --no-cache-dir -r requirements.txt \
 && playwright install --with-deps chromium

# 3) Copy your application
COPY api/app ./app

# 4) Optionally clean up build tools
RUN apt-get purge -y --auto-remove \
      build-essential python3-dev libssl-dev libffi-dev \
      curl nodejs npm cargo \
    && rm -rf /var/lib/apt/lists/*

# 5) Launch
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
