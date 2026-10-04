import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { idSchema, MAX_NAME, MAX_SHORT_TEXT } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { shoppingItems } from '../db/schema.js'
import { currentOrder } from '../services/order.js'

export const shoppingRouter = router({
  add: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(MAX_NAME),
      quantityText: z.string().trim().max(50).optional().default(''),
      note: z.string().trim().max(MAX_SHORT_TEXT).optional().default(''),
    }))
    .mutation(({ ctx, input }) => {
      const id = randomUUID()
      ctx.db.insert(shoppingItems).values({ id, ...input, source: 'manual', createdBy: ctx.userId, createdAt: Date.now() }).run()
      return { id }
    }),

  /** ✕ removes an item from this order; "Have it" marks a staple as already stocked. Both are undoable. */
  setStatus: protectedProcedure
    .input(z.object({ id: idSchema, status: z.enum(['pending', 'have', 'removed']) }))
    .mutation(({ ctx, input }) => {
      const res = ctx.db.update(shoppingItems).set({ status: input.status })
        .where(and(eq(shoppingItems.id, input.id), currentOrder)).returning({ id: shoppingItems.id }).all()
      if (res.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not in the current order' })
      return { ok: true }
    }),
})
