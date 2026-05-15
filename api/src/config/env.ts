import { z } from 'zod'

/**
 * Zod schema for all environment variables.
 * Validated once at Fastify startup. process.exit(1) on any failure.
 *
 * All modules import the `env` singleton — never access process.env directly.
 * [Source: architecture.md#env-var-validation]
 */
const envSchema = z.object({
  // ─── Required ───────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  /** Min 32 bytes to ensure cryptographic strength */
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters'),

  // ─── Session ─────────────────────────────────────────────────────
  /** JWT expiry + Redis cache TTL (seconds). Must stay in sync. */
  SESSION_TTL_SECONDS: z.coerce.number().positive().default(28800),

  // ─── OIDC (optional) ─────────────────────────────────────────────
  OIDC_ISSUER_URL: z.string().default('').transform((v) => v || undefined).pipe(z.string().url().optional()),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),

  // ─── LLM provider (optional at startup; required for analysis) ───
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'openai-compatible']).optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default('').transform((v) => v || undefined).pipe(z.string().url().optional()),
  LLM_MODEL: z.string().default('gpt-5.4-mini'),

  // ─── Scrubbing ───────────────────────────────────────────────────
  SCRUBBER_URL: z.string().url().default('http://scrubber:8001'),
  MAX_LOG_SIZE_MB: z.coerce.number().positive().default(10),
  /**
    * Max input tokens per analysis chunk sent to the LLM.
    * Set to 0 to disable chunking (single prompt for the full scrubbed text).
   */
  ANALYSIS_MAX_CHUNK_TOKENS: z.coerce.number().int().min(0).default(260000),
  SCRUBBER_TIMEOUT_MS: z.coerce.number().positive().default(30000),

  // ─── Auth tuning ─────────────────────────────────────────────────
  /** Max login attempts per minute per IP. High value for dev/test; keep low in prod. */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  /** bcrypt cost factor. Lower for dev/test (faster); keep 12 in prod. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),

  // ─── Security ────────────────────────────────────────────────────
  HTTPS_ONLY: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // ─── Logging ─────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // ─── Node env ────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors
  const messages = Object.entries(errors)
    .map(([field, msgs]) => `  ${field}: ${msgs?.join(', ')}`)
    .join('\n')
  console.error(`Invalid environment variables:\n${messages}`)
  process.exit(1)
}

/** Validated environment singleton. Import this instead of process.env. */
export const env = parsed.data
