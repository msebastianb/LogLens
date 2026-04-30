# Stage 1: Build React SPA
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Nginx serving SPA + reverse proxy
FROM nginx:1.27-alpine

# Install envsubst (included in gettext)
RUN apk add --no-cache gettext

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy compiled SPA from build stage
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80 443

# nginx:1.27 alpine processes templates from /etc/nginx/templates/ automatically via docker-entrypoint
CMD ["nginx", "-g", "daemon off;"]
