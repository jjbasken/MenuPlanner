import { eq, inArray, max } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { addDays, idSchema, isoDateSchema, MAX_NAME, MAX_SHORT_TEXT, PLAN_STATUSES, planMealInputSchema, weekStart } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { mealPlans, planMeals, prepTasks, recipes } from '../db/schema.js'
import { ensurePlan, getWeek, moveMeal, pushBackMeals, setDay } from '../services/plans.js'

const mondaySchema = isoDateSchema.refine(d => weekStart(d) === d, 'Weeks start on Monday')

export const plansRouter = router({
  week: protectedProcedure
    .input(z.object({ weekStart: mondaySchema }))
    .query(({ ctx, input }) => {
      const week = getWeek(ctx.db, input.weekStart)
      const recipeIds = [...new Set(week.meals.map(m => m.recipeId).filter((id): id is string => !!id))]
      const titles = recipeIds.length
        ? ctx.db.select({ id: recipes.id, cookMin: recipes.cookMin, prepMin: recipes.prepMin }).from(recipes).where(inArray(recipes.id, recipeIds)).all()
        : []
      return {
        ...week,
        meals: week.meals.map(m => {
          const r = titles.find(t => t.id === m.recipeId)
          return { ...m, totalMin: r ? (r.prepMin ?? 0) + (r.cookMin ?? 0) || null : null }
        }),
      }
    }),

  /** Set or clear one day of the plan (creates the week's draft plan if needed). */
  setDay: protectedProcedure
    .input(z.object({ date: isoDateSchema, meal: planMealInputSchema.nullable() }))
    .mutation(({ ctx, input }) => setDay(ctx.db, input.date, input.meal)),

  setStatus: protectedProcedure
    .input(z.object({ weekStart: mondaySchema, status: z.enum(PLAN_STATUSES) }))
    .mutation(({ ctx, input }) => {
      const plan = ensurePlan(ctx.db, input.weekStart)
      ctx.db.update(mealPlans).set({ status: input.status, updatedAt: Date.now() }).where(eq(mealPlans.id, plan.id)).run()
      return { ok: true }
    }),

  /** Prep tasks belong to a week and may fall on the Sunday before it (batch-prep day). */
  addPrepTask: protectedProcedure
    .input(z.object({
      weekStart: mondaySchema,
      date: isoDateSchema,
      title: z.string().trim().min(1).max(MAX_NAME),
      minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
    }))
    .mutation(({ ctx, input }) => {
      if (input.date < addDays(input.weekStart, -1) || input.date > addDays(input.weekStart, 6)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Prep date must be in the week or the Sunday before it' })
      }
      const plan = ensurePlan(ctx.db, input.weekStart)
      const [{ value }] = ctx.db.select({ value: max(prepTasks.sort) }).from(prepTasks).where(eq(prepTasks.planId, plan.id)).all()
      const id = crypto.randomUUID()
      ctx.db.insert(prepTasks).values({ id, planId: plan.id, date: input.date, title: input.title, minutes: input.minutes ?? null, sort: (value ?? -1) + 1 }).run()
      return { id }
    }),

  setPrepDone: protectedProcedure
    .input(z.object({ id: idSchema, done: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const res = ctx.db.update(prepTasks).set({ done: input.done }).where(eq(prepTasks.id, input.id)).returning({ id: prepTasks.id }).all()
      if (!res.length) throw new TRPCError({ code: 'NOT_FOUND' })
      return { ok: true }
    }),

  deletePrepTask: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(prepTasks).where(eq(prepTasks.id, input.id)).run()
      return { ok: true }
    }),

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
