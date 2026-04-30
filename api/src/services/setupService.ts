/**
 * Setup service — first-run wizard business logic.
 *
 * isFirstRunComplete: queries system_settings for first_run_complete key.
 * createAdminUser: bcrypt-hashes password, inserts user + sets flag atomically.
 *
 * [Source: architecture.md#authentication-security, story-1.3]
 */
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { env } from '../config/env.js'
import { users, systemSettings } from '../db/schema.js'

const FIRST_RUN_KEY = 'first_run_complete'

export async function isFirstRunComplete(): Promise<boolean> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, FIRST_RUN_KEY))
    .limit(1)
  return rows[0]?.value === 'true'
}

export async function createAdminUser(
  username: string,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS)
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ username, passwordHash })
    await tx
      .insert(systemSettings)
      .values({ key: FIRST_RUN_KEY, value: 'true' })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: 'true' },
      })
  })
}
