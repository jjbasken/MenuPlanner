import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { idSchema, MAX_NAME } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { staples } from '../db/schema.js'

export const staplesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(staples).orderBy(sql`${staples.name} COLLATE NOCASE`).all()
  ),

  add: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(MAX_NAME), inEveryOrder: z.boolean().default(true) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db.select({ id: staples.id }).from(staples).where(sql`${staples.name} = ${input.name} COLLATE NOCASE`).get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: `${input.name} is already a staple` })
      const id = randomUUID()
      ctx.db.insert(staples).values({ id, ...input, createdAt: Date.now() }).run()
      return { id }
    }),

  setInEveryOrder: protectedProcedure
    .input(z.object({ id: idSchema, inEveryOrder: z.boolean() }))
    .mutation(({ ctx, input }) => {
      ctx.db.update(staples).set({ inEveryOrder: input.inEveryOrder }).where(eq(staples.id, input.id)).run()
      return { ok: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(staples).where(eq(staples.id, input.id)).run()
      return { ok: true }
    }),
})
