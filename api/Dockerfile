# Stage 1: Build TypeScript
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# Migration SQL files are not compiled by tsc — copy alongside dist.
# migrate.ts resolves: __dirname = dist/db/ → dist/db/migrations/ ✅
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

EXPOSE 3000

CMD ["node", "dist/main.js"]
