import { initTRPC, TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import type { AppContext } from './context.js'
import { users } from './db/schema.js'

const t = initTRPC.context<AppContext>().create()

export const router = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const [user] = await ctx.db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, ctx.userId))
  if (!user?.isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  return next()
})
