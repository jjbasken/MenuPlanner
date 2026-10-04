import { and, eq, gte, inArray } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { addDays, planInputSchema, pushBack, weekStart as weekStartOf, type ISODate } from '@menu/shared'
import type { z } from 'zod'
import type { Db } from '../db/index.js'
import { freezerItems, mealPlans, planMeals, prepTasks, recipes } from '../db/schema.js'

export type PlanInputParsed = z.output<typeof planInputSchema>

/**
 * Replaces a week's plan (meals and prep tasks) in one transaction. Used by the
 * plan editor and by the agent API. Meal dates must fall inside the week.
 */
export function savePlan(db: Db, weekStart: ISODate, input: PlanInputParsed) {
  if (weekStartOf(weekStart) !== weekStart) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${weekStart} is not a Monday` })
  }
  const weekEnd = addDays(weekStart, 6)
  for (const m of input.meals) {
    if (m.date < weekStart || m.date > weekEnd) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Meal date ${m.date} is outside the week of ${weekStart}` })
    }
  }
  const recipeIds = [...new Set([...input.meals, ...input.prepTasks].map(m => m.recipeId).filter((id): id is string => !!id))]
  const recipeRows = recipeIds.length
    ? db.select({ id: recipes.id, title: recipes.title }).from(recipes).where(inArray(recipes.id, recipeIds)).all()
    : []
  const titleById = new Map(recipeRows.map(r => [r.id, r.title]))
  const missing = recipeIds.filter(id => !titleById.has(id))
  if (missing.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown recipe id(s): ${missing.join(', ')}` })

  const now = Date.now()
  return db.transaction(tx => {
    let plan = tx.select().from(mealPlans).where(eq(mealPlans.weekStart, weekStart)).get()
    if (plan) {
      tx.update(mealPlans).set({ status: input.status, notes: input.notes, updatedAt: now }).where(eq(mealPlans.id, plan.id)).run()
      tx.delete(planMeals).where(eq(planMeals.planId, plan.id)).run()
      tx.delete(prepTasks).where(eq(prepTasks.planId, plan.id)).run()
    } else {
      plan = { id: randomUUID(), weekStart, status: input.status, notes: input.notes, createdAt: now, updatedAt: now }
      tx.insert(mealPlans).values(plan).run()
    }

    // Cook nights first, so leftovers can point at them by date.
    const idByCookDate = new Map<string, string>()
    const meals = input.meals.map(m => ({ ...m, id: randomUUID() }))
    for (const m of meals) if (m.kind === 'cook') idByCookDate.set(m.date, m.id)

    for (const m of meals) {
      tx.insert(planMeals).values({
        id: m.id,
        planId: plan.id,
        date: m.date,
        kind: m.kind,
        recipeId: m.recipeId ?? null,
        title: m.title || titleById.get(m.recipeId ?? '') || 'Untitled',
        leftoverOf: m.leftoverOfDate ? idByCookDate.get(m.leftoverOfDate) ?? null : null,
        sideNote: m.sideNote,
        servings: m.servings ?? null,
        notes: m.notes,
      }).run()
      if (m.freezerItemIds.length) {
        tx.update(freezerItems).set({ planMealId: m.id }).where(inArray(freezerItems.id, m.freezerItemIds)).run()
      }
    }
    input.prepTasks.forEach((t, i) => {
      tx.insert(prepTasks).values({
        id: randomUUID(), planId: plan.id, date: t.date, title: t.title,
        minutes: t.minutes ?? null, recipeId: t.recipeId ?? null, sort: i,
      }).run()
    })
    return { planId: plan.id, mealIds: meals.map(m => m.id) }
  })
}

/** Slides tonight's meal and everything after it (and their prep tasks) later by `days`. */
export function pushBackMeals(db: Db, from: ISODate, days: number) {
  return db.transaction(tx => {
    const meals = tx.select({ id: planMeals.id, date: planMeals.date }).from(planMeals).where(gte(planMeals.date, from)).all()
    for (const m of pushBack(meals, from, days)) {
      tx.update(planMeals).set({ date: m.date }).where(eq(planMeals.id, m.id)).run()
    }
    const tasks = tx.select({ id: prepTasks.id, date: prepTasks.date }).from(prepTasks)
      .where(and(gte(prepTasks.date, from), eq(prepTasks.done, false))).all()
    for (const t of pushBack(tasks, from, days)) {
      tx.update(prepTasks).set({ date: t.date }).where(eq(prepTasks.id, t.id)).run()
    }
    return { moved: meals.length }
  })
}

/** Moves one meal to another date, swapping with whatever was planned there. */
export function moveMeal(db: Db, mealId: string, toDate: ISODate) {
  return db.transaction(tx => {
    const meal = tx.select().from(planMeals).where(eq(planMeals.id, mealId)).get()
    if (!meal) throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal not found' })
    if (meal.date === toDate) return { swappedWith: null }
    const other = tx.select({ id: planMeals.id }).from(planMeals).where(eq(planMeals.date, toDate)).get()
    tx.update(planMeals).set({ date: toDate }).where(eq(planMeals.id, mealId)).run()
    if (other) tx.update(planMeals).set({ date: meal.date }).where(eq(planMeals.id, other.id)).run()
    return { swappedWith: other?.id ?? null }
  })
}
