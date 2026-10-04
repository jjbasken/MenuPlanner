import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { addDays, aggregateIngredients, ingredientKey, scaleQty, type IngredientLine, type ISODate } from '@menu/shared'
import type { Db } from '../db/index.js'
import { mealPlans, planMeals, recipeIngredients, recipes, settings, shoppingItems, staples } from '../db/schema.js'
import { GroceryListError, type GroceryClient, type GroceryItem } from '../lib/groceryClient.js'

// The "next order" is every shopping item not yet pushed to GroceryList
// (pushed_at IS NULL). Items marked "have" or removed stay in the order as
// closed rows until the push, so a staple marked "Have it" isn't re-added.

export const currentOrder = isNull(shoppingItems.pushedAt)

/** Adds every in-every-order staple that this order doesn't mention yet. */
export function ensureStaples(db: Db) {
  const missing = db.select({ name: staples.name }).from(staples)
    .where(and(
      eq(staples.inEveryOrder, true),
      sql`NOT EXISTS (SELECT 1 FROM shopping_items s WHERE s.pushed_at IS NULL AND s.name = ${staples.name} COLLATE NOCASE)`,
    )).all()
  const now = Date.now()
  for (const s of missing) {
    db.insert(shoppingItems).values({ id: randomUUID(), name: s.name, source: 'staple', createdAt: now }).run()
  }
}

export function pendingItems(db: Db) {
  return db.select().from(shoppingItems)
    .where(and(currentOrder, eq(shoppingItems.status, 'pending')))
    .orderBy(sql`${shoppingItems.source} = 'staple'`, shoppingItems.createdAt)
    .all()
}

const MAX_NOTE = 500
const MAX_QTY = 50

/** "for Chicken fajitas, Egg roll bowls" */
function sourcesNote(sources: string[]): string {
  return sources.length ? `for ${sources.join(', ')}`.slice(0, MAX_NOTE) : ''
}

/**
 * Adds a week's recipe ingredients to the next order, combined across meals and
 * scaled to each meal's servings. Re-running it updates the plan's rows in place:
 * quantities are refreshed, rows for meals no longer in the plan are dropped, and
 * anything you marked removed or "have" stays that way. Ingredients that match a
 * staple are left to the staple row.
 */
export function buildFromPlan(db: Db, weekStart: ISODate, userId: string | null) {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.weekStart, weekStart)).get()
  if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'There is no plan for that week yet' })

  const meals = db.select({ title: planMeals.title, recipeId: planMeals.recipeId, servings: planMeals.servings })
    .from(planMeals)
    .where(and(gte(planMeals.date, weekStart), lte(planMeals.date, addDays(weekStart, 6)), eq(planMeals.kind, 'cook')))
    .orderBy(asc(planMeals.date)).all()
  const recipeIds = [...new Set(meals.map(m => m.recipeId).filter((id): id is string => !!id))]
  const recipeRows = recipeIds.length ? db.select({ id: recipes.id, servings: recipes.servings }).from(recipes).where(inArray(recipes.id, recipeIds)).all() : []
  const ingRows = recipeIds.length ? db.select().from(recipeIngredients).where(inArray(recipeIngredients.recipeId, recipeIds)).orderBy(asc(recipeIngredients.sort)).all() : []

  const lines: IngredientLine[] = []
  for (const meal of meals) {
    const recipe = recipeRows.find(r => r.id === meal.recipeId)
    if (!recipe) continue
    for (const ing of ingRows.filter(i => i.recipeId === recipe.id)) {
      lines.push({ name: ing.name, qty: scaleQty(ing.qty, recipe.servings, meal.servings), unit: ing.unit, source: meal.title })
    }
  }

  const stapleKeys = new Set(db.select({ name: staples.name }).from(staples).all().map(s => ingredientKey(s.name)))
  const wanted = aggregateIngredients(lines).filter(a => !stapleKeys.has(a.key))

  const existing = db.select().from(shoppingItems)
    .where(and(currentOrder, eq(shoppingItems.source, 'plan'), eq(shoppingItems.planId, plan.id))).all()
  const existingByKey = new Map(existing.map(e => [ingredientKey(e.name), e]))
  const now = Date.now()
  let added = 0, updated = 0, dropped = 0

  db.transaction(tx => {
    for (const item of wanted) {
      const fields = { quantityText: item.quantityText.slice(0, MAX_QTY), note: sourcesNote(item.sources) }
      const prev = existingByKey.get(item.key)
      if (prev) {
        tx.update(shoppingItems).set(fields).where(eq(shoppingItems.id, prev.id)).run()
        existingByKey.delete(item.key)
        updated++
      } else {
        tx.insert(shoppingItems).values({ id: randomUUID(), name: item.name, ...fields, source: 'plan', planId: plan.id, createdBy: userId, createdAt: now }).run()
        added++
      }
    }
    // Ingredients no longer needed (meal changed or removed) go, unless the user already acted on them.
    for (const stale of existingByKey.values()) {
      if (stale.status === 'pending') {
        tx.delete(shoppingItems).where(eq(shoppingItems.id, stale.id)).run()
        dropped++
      }
    }
  })
  return { added, updated, dropped, recipesUsed: recipeIds.length, mealsWithoutRecipe: meals.filter(m => !m.recipeId).map(m => m.title) }
}

/**
 * Sends every pending item to GroceryList and closes the current order: pending
 * rows become "pushed", and "have"/removed rows are archived with it so staples
 * come back fresh in the next order. GroceryList's endpoint is all-or-nothing,
 * so a failure leaves the order untouched.
 */
export async function pushOrder(db: Db, client: GroceryClient, opts: { listId: number | null; merge: boolean }) {
  const pending = pendingItems(db)
  if (!pending.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nothing to send — the order is empty' })
  const items: GroceryItem[] = pending.map(i => ({
    name: i.name.slice(0, 200),
    ...(i.quantityText ? { quantity: i.quantityText.slice(0, MAX_QTY) } : {}),
    ...(i.note ? { notes: i.note.slice(0, MAX_NOTE) } : {}),
    section: 'now',
  }))
  let result
  try {
    result = await client.pushItems(opts.listId, items, opts.merge)
  } catch (err) {
    if (err instanceof GroceryListError) throw new TRPCError({ code: 'BAD_GATEWAY', message: err.message })
    throw err
  }
  const now = Date.now()
  db.transaction(tx => {
    tx.update(shoppingItems).set({ status: 'pushed', pushedAt: now })
      .where(and(currentOrder, eq(shoppingItems.status, 'pending'))).run()
    tx.update(shoppingItems).set({ pushedAt: now }).where(currentOrder).run()
    if (opts.listId != null) tx.update(settings).set({ groceryListId: opts.listId }).where(eq(settings.id, 'household')).run()
  })
  return { sent: items.length, ...result }
}
