/**
 * runMigrations — applies pending Drizzle migrations at startup.
 *
 * Path resolution strategy (works in both dev tsx and compiled dist/):
 *   tsx watch:  __dirname = src/db/  → src/db/migrations/
 *   compiled:   __dirname = dist/db/ → dist/db/migrations/ (Dockerfile copies them there)
 *
 * Called once in main.ts before app.listen().
 * Any failure throws — caller (main.ts) catches and calls process.exit(1).
 *
 * [Source: story-1.2 dev notes#runmigrations]
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: join(__dirname, 'migrations'),
  })
}
