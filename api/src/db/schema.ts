/**
 * Drizzle ORM table definitions — single schema file for v1.
 *
 * Naming conventions (architecture.md):
 *   Tables:  snake_case plural  → users, system_settings, data_sources
 *   Columns: snake_case         → password_hash, user_id, created_at
 *   TS fields: camelCase        → Drizzle maps automatically
 *
 * No log content is ever stored here — log cache lives in Redis only.
 * [Source: architecture.md#data-architecture]
 */
import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core'

// ─── users ───────────────────────────────────────────────────────────────────
// Used in password-auth mode only. OIDC users are never persisted here.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── system_settings ─────────────────────────────────────────────────────────
// Key-value store for first-run wizard state and runtime configuration flags.
// Key: PK string (e.g. "first_run_complete", "oidc_configured")
export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── data_sources ─────────────────────────────────────────────────────────────
// Named Loki / file-upload source configurations owned by a user.
// authConfig stores encrypted JSON; populated in Story 2.x.
export const dataSources = pgTable('data_sources', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  authType: text('auth_type').notNull().default('none'),
  authConfig: text('auth_config'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type SystemSetting = typeof systemSettings.$inferSelect
export type NewSystemSetting = typeof systemSettings.$inferInsert
export type DataSource = typeof dataSources.$inferSelect
export type NewDataSource = typeof dataSources.$inferInsert
