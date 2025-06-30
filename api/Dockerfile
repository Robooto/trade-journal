# 1) Base image with Python
FROM mcr.microsoft.com/playwright/python:v1.52.0-noble
WORKDIR /app

# 2) Install dependencies
COPY api/requirements.txt .
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# 3) Bundle the app
COPY api/app ./app


# 4) Launch with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
