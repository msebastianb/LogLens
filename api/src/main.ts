import { buildApp } from './app.js'
import { runMigrations } from './db/migrate.js'

const PORT = 3000
const HOST = '0.0.0.0'

async function start() {
  // Run migrations before accepting traffic.
  // Fastify logger not yet initialised — use console.error for migration failures.
  try {
    await runMigrations()
  } catch (err) {
    console.error('[startup] Migration failed:', err)
    process.exit(1)
  }

  const app = await buildApp()

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`LogLens API listening on ${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
