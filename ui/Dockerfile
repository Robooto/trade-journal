# build step
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY ui/package*.json ./
RUN npm ci
COPY ui/ .
RUN npm run build -- --configuration=production

FROM builder AS test
CMD ["npm", "test", "--", "--watch=false"]

# Debug: list the dist directory structure
#RUN echo "===== DIST CONTENTS =====" && ls -R /app/dist

# serve step
FROM nginx:stable-alpine
# remove the default nginx site config
RUN rm /etc/nginx/conf.d/default.conf
# render the runtime-configured research upstream into the default server
COPY ui/nginx.conf /etc/nginx/templates/default.conf.template
# copy the built app _contents_ into nginx’s html folder
COPY --from=builder /app/dist/ui/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
