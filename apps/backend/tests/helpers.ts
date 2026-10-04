// Must be set before any module that reads them is imported.
process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-production-0123456789'
process.env.BOOTSTRAP_TOKEN ??= 'test-bootstrap-token'

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { randomUUID } from 'crypto'
import * as schema from '../src/db/schema.js'
import { migrate } from '../src/db/migrate.js'
import { resetAllRateLimits } from '../src/lib/rateLimit.js'
import { appRouter } from '../src/router.js'
import { createCallerFactory } from '../src/trpc.js'
import type { AppContext } from '../src/context.js'
import type { Db } from '../src/db/index.js'

export const BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN!

export function makeTestDb(): Db {
  // Rate limit counters are process-global, so a fresh database means a fresh
  // set of counters too — otherwise attempts leak between tests.
  resetAllRateLimits()
  const sqlite = new Database(':memory:')
  sqlite.run('PRAGMA foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db)
  return db
}

const createCaller = createCallerFactory(appRouter)

export function callerFor(ctx: AppContext) {
  return createCaller(ctx)
}

let counter = 0

/** Inserts a user directly (skipping Argon2id unless a password is given). */
export async function makeUser(db: Db, opts: { username?: string; isAdmin?: boolean; password?: string } = {}) {
  const id = randomUUID()
  const username = opts.username ?? `user${++counter}`
  await db.insert(schema.users).values({
    id,
    username,
    displayName: username,
    passwordHash: opts.password ? await Bun.password.hash(opts.password, { algorithm: 'argon2id' }) : 'not-a-real-hash',
    isAdmin: opts.isAdmin ?? false,
    createdAt: Date.now(),
  })
  return id
}

/** A fresh database with one admin, and a caller acting as that admin. */
export async function adminSetup() {
  const db = makeTestDb()
  const userId = await makeUser(db, { username: 'admin', isAdmin: true })
  return { db, userId, caller: callerFor({ db, userId }) }
}
