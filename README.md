# LogLens

Privacy-first, AI-native web application for Grafana/Loki log analysis.

## Requirements

- Docker + Docker Compose v2
- Node.js 22+ (for local frontend dev server and running tests)
- 4 GB RAM minimum (NER model requires GPU — CPU mode is not recommended)

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and LLM_PROVIDER/LLM_API_KEY

# 2. Start the full stack
docker compose --profile app up -d

# 3. Open http://localhost — first visit shows the setup wizard
```

## Architecture

Five services on the `loglens_net` Docker network:

| Service    | Tech               | Role                                                       |
|------------|--------------------|------------------------------------------------------------|
| `nginx`    | Nginx              | Reverse proxy, SPA static files, TLS termination           |
| `api`      | Fastify (Node.js)  | REST API, auth, LLM orchestration, SSE streaming           |
| `scrubber` | FastAPI (Python)   | PII/secrets scrubbing (regex + optional NER). Internal only |
| `postgres` | PostgreSQL 17      | Users, settings, analysis metadata. Never stores log content |
| `redis`    | Redis 7            | Scrubbed log session cache. No persistence (no disk writes) |

## Compose Profiles

Services are assigned to profiles so you can start only what you need:

| Profile      | Services started                                   | Use case                        |
|--------------|----------------------------------------------------|---------------------------------|
| *(none)*     | `postgres`, `redis`                                | Infrastructure only (unit tests)|
| `app`        | All 5 services                                     | Production                      |
| `dev`        | All 5 services (with dev overrides)                | Local development               |
| `test`       | All 5 services (with test env)                     | E2E / integration tests         |

## Environment Files

| File           | Committed | Purpose                                                |
|----------------|-----------|--------------------------------------------------------|
| `.env.example` | ✅        | Reference of all variables — not loaded by Compose     |
| `.env.dev`     | ✅        | Dev defaults: fast bcrypt, debug logging, no secrets   |
| `.env.test`    | ✅        | Test defaults: fast bcrypt, warn logging, test DB name |
| `.env`         | ❌        | Your local/production config (create from `.env.example`) |
| `.env.local`   | ❌        | Personal overrides (highest priority)                  |

## Development

### Start the dev stack

```bash
# Start all services with hot-reload (Vite HMR + tsx watch + uvicorn reload)
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml --profile dev up

# Start the Vite frontend dev server on the host (required — nginx proxies to it)
cd frontend && npx vite --host
```

Dev overrides (`docker-compose.dev.yml`):
- **API**: runs `tsx watch` for hot-reload, `NODE_ENV=development`, port 3000 exposed
- **Scrubber**: source mounted, port 8001 exposed
- **Nginx**: proxies `/` to Vite on `host.docker.internal:5173`, port 8080 exposed
- **Postgres**: port 5433 exposed (avoids conflict with local PostgreSQL)
- **Redis**: port 6379 exposed

App is available at **http://localhost:8080** in dev mode.

### Run unit tests

```bash
# API unit tests
cd api && npm test

# Frontend unit tests
cd frontend && npx vitest run

# Watch mode
cd api && npm run test:watch
```

### Run integration tests

Integration tests require real services (Postgres, Redis, scrubber):

```bash
# Start infrastructure
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml --profile dev up -d

# Run integration suite
cd api && npm run test:integration
```

### Run E2E tests

E2E tests use Playwright against the full running stack:

```bash
# 1. Start the full dev stack
docker compose --env-file .env.test -f docker-compose.yml -f docker-compose.dev.yml --profile dev up -d

# 2. Start Vite dev server (nginx proxies to it)
cd frontend && npx vite --host &

# 3. Run all E2E tests
cd e2e && npx playwright test

# Run a specific test file
npx playwright test auth.spec.ts
npx playwright test analysis.spec.ts

# Run a specific test by name
npx playwright test -g "valid credentials log in"

# Interactive UI mode
npx playwright test --ui

# Debug mode (step through)
npx playwright test --debug

# View HTML report
npx playwright show-report
```

E2E test credentials: `admin` / `ValidPassword123!` (created by the first-run wizard test).

### Database commands

```bash
# Generate migration from schema changes
cd api && npm run db:generate

# Apply pending migrations
cd api && npm run db:migrate

# Open Drizzle Studio (DB browser)
cd api && npm run db:studio
```

## Environment Variables Reference

All variables are validated at startup. The API uses Zod (`api/src/config/env.ts`), the scrubber uses Pydantic (`scrubber/config.py`). Missing required variables cause the service to exit immediately with a clear error message.

### Required

| Variable       | Service | Description                                             |
|----------------|---------|---------------------------------------------------------|
| `DATABASE_URL` | api     | PostgreSQL connection string                            |
| `REDIS_URL`    | api     | Redis connection string                                 |
| `JWT_SECRET`   | api     | Min 32 chars. Generate: `openssl rand -hex 32`          |

### Auth & Sessions

| Variable              | Default | Service | Description                                    |
|-----------------------|---------|---------|------------------------------------------------|
| `SESSION_TTL_SECONDS` | `28800` | api     | JWT expiry + Redis cache TTL (8 hours)          |
| `LOGIN_RATE_LIMIT_MAX`| `5`     | api     | Max login attempts per minute per IP            |
| `BCRYPT_ROUNDS`       | `12`    | api     | bcrypt cost factor. Use 4 for dev/test speed    |

### LLM Provider

| Variable       | Default          | Service | Description                                |
|----------------|------------------|---------|--------------------------------------------|
| `LLM_PROVIDER` | —                | api     | `openai` \| `anthropic` \| `openai-compatible` |
| `LLM_API_KEY`  | —                | api     | API key for the LLM provider               |
| `LLM_BASE_URL` | —                | api     | Required for `openai-compatible` (e.g. `http://localhost:1234`) |
| `LLM_MODEL`    | `gpt-5.4-mini`   | api     | Model name to send in API requests         |

Not required at startup — the API boots without LLM config. Analysis requests will fail until configured.

**Example: Local LM Studio**
```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=not-needed
LLM_BASE_URL=http://host.docker.internal:1234
LLM_MODEL=your-model-name
```

### Scrubbing

| Variable            | Default | Service  | Description                                |
|---------------------|---------|----------|--------------------------------------------|
| `MAX_LOG_SIZE_MB`   | `10`    | api      | Max upload size. Rejects with 413 if exceeded |
| `SCRUBBER_TIMEOUT_MS`| `30000`| api      | Timeout for calls to scrubber service (ms) |
| `NER_ENABLED`       | `false` | scrubber | Enable NER-based PII detection             |

> **NER warning**: The NER model runs at ~130 chars/sec on CPU — a 500 KB log takes over an hour. Only enable with a CUDA-capable GPU or very small log files.

### Security

| Variable     | Default | Service | Description                                     |
|--------------|---------|---------|-------------------------------------------------|
| `HTTPS_ONLY` | `false` | api, nginx | Force HTTPS redirect. Auto-enabled for non-localhost |

### Logging

| Variable    | Default | Service      | Description                                    |
|-------------|---------|--------------|------------------------------------------------|
| `LOG_LEVEL` | `info`  | api, scrubber | `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `NODE_ENV`  | `development` | api    | `development` \| `production` \| `test`        |

### PostgreSQL Container

| Variable           | Default    | Service  | Description            |
|--------------------|------------|----------|------------------------|
| `POSTGRES_USER`    | `loglens`  | postgres | Database user          |
| `POSTGRES_PASSWORD`| `changeme` | postgres | Database password      |
| `POSTGRES_DB`      | `loglens`  | postgres | Database name          |

## Production

```bash
# Create .env from template
cp .env.example .env
# Edit .env — set all Required variables + LLM config

# Start production stack
docker compose --profile app up -d

# Check health
docker compose ps
curl http://localhost/health
```

Production differences from dev:
- Nginx serves built SPA static files (no Vite proxy)
- Ports 80/443 exposed (not 8080)
- `NODE_ENV=production` — Secure cookies, CSRF protection enabled
- No source mounts — uses built images
- `BCRYPT_ROUNDS=12` (slower but secure)
- `LOGIN_RATE_LIMIT_MAX=5` (strict rate limiting)
