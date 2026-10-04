import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { addDays, idSchema, isoDateSchema, MAX_SHORT_TEXT, VERDICTS } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { familyMembers, mealFeedback, planMeals } from '../db/schema.js'

const LOOKBACK_DAYS = 10

/** Who liked what — kid-sized thumbs on recent meals. Feeds the next plan. */
export const feedbackRouter = router({
  recent: protectedProcedure
    .input(z.object({ today: isoDateSchema }))
    .query(({ ctx, input }) => {
      const meals = ctx.db.select({ id: planMeals.id, date: planMeals.date, title: planMeals.title, kind: planMeals.kind })
        .from(planMeals)
        .where(and(gte(planMeals.date, addDays(input.today, -LOOKBACK_DAYS)), lte(planMeals.date, input.today)))
        .orderBy(planMeals.date).all()
        .reverse()
      const members = ctx.db.select({ id: familyMembers.id, name: familyMembers.name, isKid: familyMembers.isKid })
        .from(familyMembers).orderBy(familyMembers.sort, familyMembers.createdAt).all()
      const feedback = meals.length
        ? ctx.db.select().from(mealFeedback).where(inArray(mealFeedback.planMealId, meals.map(m => m.id))).all()
        : []
      return {
        members,
        meals: meals.map(m => ({
          ...m,
          votes: Object.fromEntries(feedback.filter(f => f.planMealId === m.id).map(f => [f.familyMemberId, { verdict: f.verdict, comment: f.comment }])),
        })),
      }
    }),

  /** Set or clear (verdict: null) one person's verdict on one meal. */
  set: protectedProcedure
    .input(z.object({
      planMealId: idSchema,
      familyMemberId: idSchema,
      verdict: z.enum(VERDICTS).nullable(),
      comment: z.string().trim().max(MAX_SHORT_TEXT).optional(),
    }))
    .mutation(({ ctx, input }) => {
      const where = and(eq(mealFeedback.planMealId, input.planMealId), eq(mealFeedback.familyMemberId, input.familyMemberId))
      if (input.verdict === null) {
        ctx.db.delete(mealFeedback).where(where).run()
        return { ok: true }
      }
      if (!ctx.db.select({ id: planMeals.id }).from(planMeals).where(eq(planMeals.id, input.planMealId)).get()) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal not found' })
      }
      if (!ctx.db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.id, input.familyMemberId)).get()) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Family member not found' })
      }
      ctx.db.insert(mealFeedback)
        .values({ id: randomUUID(), planMealId: input.planMealId, familyMemberId: input.familyMemberId, verdict: input.verdict, comment: input.comment ?? '', createdAt: Date.now() })
        .onConflictDoUpdate({
          target: [mealFeedback.planMealId, mealFeedback.familyMemberId],
          set: { verdict: input.verdict, ...(input.comment !== undefined ? { comment: input.comment } : {}) },
        }).run()
      return { ok: true }
    }),
})
