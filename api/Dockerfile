FROM python:3.11-slim-bookworm

WORKDIR /app

# 1) Install Chromium for Selenium
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# 2) Copy & install your requirements
COPY api/requirements.txt .
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# 3) Copy your application
COPY api/app ./app

# 4) Optionally clean up build tools
# cleanup not needed

# 5) Launch
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
