import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import {
  addDays, cookNightIndex, isoDateSchema, nextDow, thawReminders, type ISODate,
} from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { freezerItems, planMeals, settings } from '../db/schema.js'
import { ensureStaples, pendingItems } from '../services/order.js'
import type { Db } from '../db/index.js'

const COMING_UP_DAYS = 7

export function getSettings(db: Db) {
  return db.select().from(settings).where(eq(settings.id, 'household')).get()!
}

/** "Next plan: draft Tue · list Thu · pickup Sun" — each step on or after the previous one. */
export function cadence(db: Db, today: ISODate) {
  const s = getSettings(db)
  const draft = nextDow(today, s.draftDow)
  const list = nextDow(draft, s.listDow)
  const pickup = nextDow(list, s.pickupDow)
  return { draft, list, pickup }
}

/**
 * Everything the home screen needs in one round trip — on a phone over a
 * mobile connection, one request beats six.
 */
export const tonightRouter = router({
  get: protectedProcedure
    .input(z.object({ today: isoDateSchema }))
    .query(({ ctx, input }) => {
      const { db } = ctx
      const today = input.today
      const until = addDays(today, COMING_UP_DAYS)

      const meals = db.select().from(planMeals)
        .where(and(gte(planMeals.date, today), lte(planMeals.date, until)))
        .orderBy(planMeals.date).all()

      // Cook-night numbering is per plan, so look at every meal in the plans involved.
      const planIds = [...new Set(meals.map(m => m.planId))]
      const planMealsAll = planIds.length
        ? db.select({ id: planMeals.id, planId: planMeals.planId, date: planMeals.date, kind: planMeals.kind }).from(planMeals).where(inArray(planMeals.planId, planIds)).all()
        : []
      const cookIdx = new Map<string, { index: number; total: number }>()
      for (const planId of planIds) {
        for (const [id, idx] of cookNightIndex(planMealsAll.filter(m => m.planId === planId))) cookIdx.set(id, idx)
      }

      const freezer = db.select().from(freezerItems).where(isNull(freezerItems.usedAt)).orderBy(freezerItems.addedAt).all()
      // Reminders for meals up to a day past the window still show on its last row.
      const linkedMeals = db.select({ id: planMeals.id, date: planMeals.date, kind: planMeals.kind, title: planMeals.title })
        .from(planMeals).where(gte(planMeals.date, addDays(today, 1))).all()
      const thaw = thawReminders(linkedMeals, freezer)
      const mealById = new Map(linkedMeals.map(m => [m.id, m]))

      const shape = (m: typeof meals[number]) => ({
        id: m.id,
        date: m.date,
        kind: m.kind,
        title: m.title,
        recipeId: m.recipeId,
        sideNote: m.sideNote,
        notes: m.notes,
        rating: m.rating,
        cook: cookIdx.get(m.id) ?? null,
        thaw: thaw.get(m.date) ?? [],
      })

      const tonightMeal = meals.find(m => m.date === today)
      const days = Array.from({ length: COMING_UP_DAYS }, (_, i) => addDays(today, i + 1))
      ensureStaples(db)
      const order = pendingItems(db)

      return {
        today,
        tonight: tonightMeal ? shape(tonightMeal) : null,
        tonightThaw: thaw.get(today) ?? [],
        comingUp: days.map(date => {
          const meal = meals.find(m => m.date === date)
          return { date, meal: meal ? shape(meal) : null, thaw: thaw.get(date) ?? [] }
        }),
        nextOrder: order.map(i => ({ id: i.id, name: i.name, quantityText: i.quantityText, note: i.note, source: i.source })),
        freezer: freezer.map(f => {
          const meal = f.planMealId ? mealById.get(f.planMealId) : undefined
          return {
            id: f.id, name: f.name, amountText: f.amountText, isBackup: f.isBackup,
            meal: meal ? { id: meal.id, date: meal.date, title: meal.title } : null,
          }
        }),
        cadence: cadence(db, today),
      }
    }),
})
