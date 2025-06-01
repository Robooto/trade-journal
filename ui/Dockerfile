# build step
FROM node:18-buster-slim AS builder
WORKDIR /app

COPY ui/package*.json ./
RUN npm ci
COPY ui/ .
RUN npm run build --configuration=production

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
