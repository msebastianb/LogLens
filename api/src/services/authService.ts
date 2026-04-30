/**
 * Auth service — password verification for username/password login mode.
 *
 * verifyPassword: queries users by username, bcrypt-compares password.
 * Returns user object or null — never distinguishes username vs password failure
 * to prevent user enumeration attacks.
 *
 * [Source: architecture.md#authentication-security, story-1.4]
 */
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { env } from '../config/env.js'
import { users } from '../db/schema.js'

// Lazy-init dummy hash with configured cost — used to mask user-not-found timing.
// Generated once on first login attempt to avoid slowing startup.
let _dummyHashPromise: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (!_dummyHashPromise) {
    _dummyHashPromise = bcrypt.hash('__dummy__', env.BCRYPT_ROUNDS)
  }
  return _dummyHashPromise
}

export async function verifyPassword(
  username: string,
  password: string,
): Promise<{ id: number; username: string } | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  const user = rows[0]
  if (!user) {
    // Still run a dummy compare to prevent timing-based user enumeration
    await bcrypt.compare(password, await getDummyHash())
    return null
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  return { id: user.id, username: user.username }
}
