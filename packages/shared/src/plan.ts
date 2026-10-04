import { addDays, type ISODate } from './dates.js'
import type { MealKind } from './types.js'

type MealLike = { id: string; date: ISODate; kind: MealKind }

/** Cook nights numbered in date order: Map(mealId → { index, total }) for the "1 of 3" label. */
export function cookNightIndex<T extends MealLike>(meals: T[]): Map<string, { index: number; total: number }> {
  const cooks = meals.filter(m => m.kind === 'cook').sort((a, b) => a.date.localeCompare(b.date))
  return new Map(cooks.map((m, i) => [m.id, { index: i + 1, total: cooks.length }]))
}

type FreezerLike = { id: string; name: string; amountText: string; planMealId: string | null; usedAt: number | null }

export type ThawReminder = { freezerItemId: string; text: string; forMealId: string }

/**
 * Freezer items linked to a meal need pulling out the night before. Returns
 * reminders keyed by the date they should be shown on (the day before the meal).
 */
export function thawReminders(meals: MealLike[], freezer: FreezerLike[]): Map<ISODate, ThawReminder[]> {
  const mealById = new Map(meals.map(m => [m.id, m]))
  const out = new Map<ISODate, ThawReminder[]>()
  for (const item of freezer) {
    if (item.usedAt != null || !item.planMealId) continue
    const meal = mealById.get(item.planMealId)
    if (!meal) continue
    const day = addDays(meal.date, -1)
    const amount = item.amountText ? ` (${item.amountText})` : ''
    const list = out.get(day) ?? []
    list.push({ freezerItemId: item.id, text: `Thaw tonight: the ${item.name.toLowerCase()}${amount}`, forMealId: meal.id })
    out.set(day, list)
  }
  return out
}
