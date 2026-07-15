# build step
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY ui/package*.json ./
RUN npm ci
COPY ui/ .
RUN npm run build -- --configuration=production

FROM builder AS test
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/*
CMD ["npm", "test", "--", "--watch=false", "--browsers=ChromeHeadlessNoSandbox"]

# Debug: list the dist directory structure
#RUN echo "===== DIST CONTENTS =====" && ls -R /app/dist

# serve step
FROM nginx:stable-alpine
# remove the default nginx site config
RUN rm /etc/nginx/conf.d/default.conf
# put your custom config in its place
COPY ui/nginx.conf /etc/nginx/conf.d/
# copy the built app _contents_ into nginx’s html folder
COPY --from=builder /app/dist/ui/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
