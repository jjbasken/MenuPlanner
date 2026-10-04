import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { idSchema, isoDateSchema, MAX_SHORT_TEXT } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { planMeals } from '../db/schema.js'
import { moveMeal, pushBackMeals } from '../services/plans.js'

export const plansRouter = router({
  /** "Not cooking tonight? Slide the plan later." */
  pushBack: protectedProcedure
    .input(z.object({ from: isoDateSchema, days: z.number().int().min(1).max(7) }))
    .mutation(({ ctx, input }) => pushBackMeals(ctx.db, input.from, input.days)),

  moveMeal: protectedProcedure
    .input(z.object({ mealId: idSchema, toDate: isoDateSchema }))
    .mutation(({ ctx, input }) => moveMeal(ctx.db, input.mealId, input.toDate)),

  updateMeal: protectedProcedure
    .input(z.object({
      mealId: idSchema,
      notes: z.string().max(MAX_SHORT_TEXT).optional(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { mealId, ...patch } = input
      const res = ctx.db.update(planMeals).set(patch).where(eq(planMeals.id, mealId)).returning({ id: planMeals.id }).all()
      if (res.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal not found' })
      return { ok: true }
    }),
})
