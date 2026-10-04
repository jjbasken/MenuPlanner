import { TRPCError } from '@trpc/server'
import { count, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { router, publicProcedure, protectedProcedure } from '../trpc.js'
import { revokedTokens, users } from '../db/schema.js'
import { signToken } from '../lib/jwt.js'
import { clearHits, recordHit, withinLimits, type RateLimit } from '../lib/rateLimit.js'
import { secretsEqual } from '../lib/secrets.js'
import {
  MAX_BOOTSTRAP_TOKEN, MAX_DISPLAY_NAME, MAX_PASSWORD, MAX_USERNAME, MIN_PASSWORD,
} from '../lib/limits.js'

const WINDOW_MS = 15 * 60 * 1000
/** Failed logins tolerated per account before the account is locked out for the window. */
const MAX_FAILURES_PER_USERNAME = 10
/** Failed logins tolerated per source address, across all accounts. */
const MAX_FAILURES_PER_IP = 30
/** Failed setup attempts tolerated per source address. */
const MAX_SETUP_FAILURES_PER_IP = 10

export const usernameSchema = z.string().trim().min(2).max(MAX_USERNAME).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only')
export const passwordSchema = z.string().min(MIN_PASSWORD).max(MAX_PASSWORD)
export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME)

// Keyed on the *submitted* username, never on whether that account exists, so
// the presence of a lockout does not reveal which usernames are real.
function loginLimits(username: string, clientIp: string | null | undefined): RateLimit[] {
  const limits: RateLimit[] = [
    { key: `login:user:${username.toLowerCase()}`, limit: MAX_FAILURES_PER_USERNAME, windowMs: WINDOW_MS },
  ]
  if (clientIp) limits.push({ key: `login:ip:${clientIp}`, limit: MAX_FAILURES_PER_IP, windowMs: WINDOW_MS })
  return limits
}

/** Built per throw — a shared Error instance would carry one stale stack across every caller. */
function tooManyRequests(): TRPCError {
  return new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many failed attempts. Try again later.' })
}

// Argon2id hash of a random value, verified against when the username is unknown so
// a failed login costs the same work whether or not the account exists.
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= Bun.password.hash(randomUUID(), { algorithm: 'argon2id' })
  return dummyHash
}

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' })
}

async function userCount(db: import('../db/index.js').Db): Promise<number> {
  const [{ value }] = await db.select({ value: count() }).from(users)
  return value
}

function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, username: u.username, displayName: u.displayName, isAdmin: u.isAdmin }
}

export const authRouter = router({
  /** Whether the first-run setup screen should be shown, and whether it can be completed. */
  status: publicProcedure.query(async ({ ctx }) => {
    return {
      needsSetup: (await userCount(ctx.db)) === 0,
      setupEnabled: !!process.env.BOOTSTRAP_TOKEN,
    }
  }),

  /**
   * Create the first (admin) account. Requires BOOTSTRAP_TOKEN so that whoever
   * reaches a fresh deployment first — possibly over the public tunnel — cannot
   * claim it. Closed for good once any user exists.
   */
  setup: publicProcedure
    .input(z.object({
      bootstrapToken: z.string().max(MAX_BOOTSTRAP_TOKEN),
      username: usernameSchema,
      displayName: displayNameSchema,
      password: passwordSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const limits: RateLimit[] = ctx.clientIp
        ? [{ key: `setup:ip:${ctx.clientIp}`, limit: MAX_SETUP_FAILURES_PER_IP, windowMs: WINDOW_MS }]
        : []
      if (!withinLimits(limits)) throw tooManyRequests()
      if ((await userCount(ctx.db)) > 0) throw new TRPCError({ code: 'FORBIDDEN', message: 'Setup is already complete' })
      const expected = process.env.BOOTSTRAP_TOKEN
      if (!expected) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'BOOTSTRAP_TOKEN is not configured on the server' })
      if (!secretsEqual(input.bootstrapToken, expected)) {
        recordHit(limits)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid setup token' })
      }
      const user = {
        id: randomUUID(),
        username: input.username,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        isAdmin: true,
        tokenVersion: 0,
        createdAt: Date.now(),
      }
      await ctx.db.insert(users).values(user)
      return { token: await signToken(user.id, 0), user: publicUser(user) }
    }),

  login: publicProcedure
    .input(z.object({
      username: z.string().max(MAX_USERNAME),
      password: z.string().max(MAX_PASSWORD),
    }))
    .mutation(async ({ ctx, input }) => {
      // Checked before any hashing: every attempt costs a full Argon2id
      // verification, so an unmetered login is a CPU-exhaustion lever too.
      const limits = loginLimits(input.username, ctx.clientIp)
      if (!withinLimits(limits)) throw tooManyRequests()

      const [user] = await ctx.db.select().from(users).where(eq(users.username, input.username))
      if (!user) {
        await Bun.password.verify(input.password, await getDummyHash())
        recordHit(limits)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Wrong username or password' })
      }
      if (!(await Bun.password.verify(input.password, user.passwordHash))) {
        recordHit(limits)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Wrong username or password' })
      }
      clearHits(limits)
      return { token: await signToken(user.id, user.tokenVersion), user: publicUser(user) }
    }),

  // Revokes the calling session's own token. Clearing localStorage alone leaves a
  // year-long token valid for anyone who captured it.
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.tokenId) return { ok: true }
    const now = Date.now()
    await ctx.db.delete(revokedTokens).where(lt(revokedTokens.expiresAt, now))
    await ctx.db
      .insert(revokedTokens)
      .values({ jti: ctx.tokenId, expiresAt: ctx.tokenExpiresAt ?? now })
      .onConflictDoNothing()
    return { ok: true }
  }),

  /** Signs out every other session and hands this one a fresh token. */
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().max(MAX_PASSWORD), newPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.userId))
      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' })
      if (!(await Bun.password.verify(input.currentPassword, user.passwordHash))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Current password is incorrect' })
      }
      const tokenVersion = user.tokenVersion + 1
      await ctx.db.update(users)
        .set({ passwordHash: await hashPassword(input.newPassword), tokenVersion })
        .where(eq(users.id, user.id))
      return { token: await signToken(user.id, tokenVersion) }
    }),
})
