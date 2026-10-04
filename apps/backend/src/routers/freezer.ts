import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { idSchema, MAX_NAME } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { freezerItems, planMeals } from '../db/schema.js'
import type { Db } from '../db/index.js'

const itemFields = {
  name: z.string().trim().min(1).max(MAX_NAME),
  amountText: z.string().trim().max(60).optional().default(''),
  planMealId: idSchema.nullable().optional(),
  isBackup: z.boolean().optional().default(false),
}

function assertMeal(db: Db, mealId: string | null | undefined) {
  if (mealId && !db.select({ id: planMeals.id }).from(planMeals).where(eq(planMeals.id, mealId)).get()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Meal not found' })
  }
}

export const freezerRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(freezerItems).where(isNull(freezerItems.usedAt)).orderBy(freezerItems.addedAt).all()
  ),

  add: protectedProcedure
    .input(z.object(itemFields))
    .mutation(({ ctx, input }) => {
      assertMeal(ctx.db, input.planMealId)
      const id = randomUUID()
      ctx.db.insert(freezerItems).values({ id, ...input, planMealId: input.planMealId ?? null, addedAt: Date.now() }).run()
      return { id }
    }),

  update: protectedProcedure
    .input(z.object({ id: idSchema, ...itemFields }))
    .mutation(({ ctx, input }) => {
      assertMeal(ctx.db, input.planMealId)
      const { id, ...patch } = input
      const res = ctx.db.update(freezerItems).set({ ...patch, planMealId: patch.planMealId ?? null }).where(eq(freezerItems.id, id)).returning({ id: freezerItems.id }).all()
      if (res.length === 0) throw new TRPCError({ code: 'NOT_FOUND' })
      return { ok: true }
    }),

  /** "Used" — it came out of the freezer. `used: false` undoes it. */
  setUsed: protectedProcedure
    .input(z.object({ id: idSchema, used: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const res = ctx.db.update(freezerItems).set({ usedAt: input.used ? Date.now() : null })
        .where(and(eq(freezerItems.id, input.id), input.used ? isNull(freezerItems.usedAt) : isNotNull(freezerItems.usedAt))).returning({ id: freezerItems.id }).all()
      if (res.length === 0) throw new TRPCError({ code: 'NOT_FOUND' })
      return { ok: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(freezerItems).where(eq(freezerItems.id, input.id)).run()
      return { ok: true }
    }),
})
