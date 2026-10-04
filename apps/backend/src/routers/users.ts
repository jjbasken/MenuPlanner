import { TRPCError } from '@trpc/server'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { router, protectedProcedure, adminProcedure } from '../trpc.js'
import { users } from '../db/schema.js'
import { MAX_ID } from '../lib/limits.js'
import { displayNameSchema, hashPassword, passwordSchema, usernameSchema } from './auth.js'

const userColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  isAdmin: users.isAdmin,
  createdAt: users.createdAt,
}

async function otherAdminCount(db: import('../db/index.js').Db, excludingId: string) {
  const [{ value }] = await db.select({ value: count() }).from(users)
    .where(and(eq(users.isAdmin, true), ne(users.id, excludingId)))
  return value
}

export const usersRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db.select(userColumns).from(users).where(eq(users.id, ctx.userId))
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' })
    return user
  }),

  updateMe: protectedProcedure
    .input(z.object({ displayName: displayNameSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set({ displayName: input.displayName }).where(eq(users.id, ctx.userId))
      return { ok: true }
    }),

  list: adminProcedure.query(({ ctx }) =>
    ctx.db.select(userColumns).from(users).orderBy(users.createdAt)
  ),

  create: adminProcedure
    .input(z.object({
      username: usernameSchema,
      displayName: displayNameSchema,
      password: passwordSchema,
      isAdmin: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.username, input.username))
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Username taken' })
      const id = randomUUID()
      await ctx.db.insert(users).values({
        id,
        username: input.username,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        isAdmin: input.isAdmin,
        createdAt: Date.now(),
      })
      return { id }
    }),

  setAdmin: adminProcedure
    .input(z.object({ userId: z.string().max(MAX_ID), isAdmin: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own admin status' })
      }
      await ctx.db.update(users).set({ isAdmin: input.isAdmin }).where(eq(users.id, input.userId))
      return { ok: true }
    }),

  /** Sets a new password and signs the user out everywhere. */
  resetPassword: adminProcedure
    .input(z.object({ userId: z.string().max(MAX_ID), password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select({ tokenVersion: users.tokenVersion }).from(users).where(eq(users.id, input.userId))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.update(users)
        .set({ passwordHash: await hashPassword(input.password), tokenVersion: user.tokenVersion + 1 })
        .where(eq(users.id, input.userId))
      return { ok: true }
    }),

  // Revoke all of a user's outstanding tokens by bumping their tokenVersion.
  revokeSessions: adminProcedure
    .input(z.object({ userId: z.string().max(MAX_ID) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select({ tokenVersion: users.tokenVersion }).from(users).where(eq(users.id, input.userId))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.update(users).set({ tokenVersion: user.tokenVersion + 1 }).where(eq(users.id, input.userId))
      return { ok: true }
    }),

  delete: adminProcedure
    .input(z.object({ userId: z.string().max(MAX_ID) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete your own account' })
      }
      const [user] = await ctx.db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, input.userId))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' })
      if (user.isAdmin && (await otherAdminCount(ctx.db, input.userId)) === 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete the last admin' })
      }
      await ctx.db.delete(users).where(eq(users.id, input.userId))
      return { ok: true }
    }),
})
