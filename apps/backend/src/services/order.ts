import { and, eq, isNull, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { Db } from '../db/index.js'
import { shoppingItems, staples } from '../db/schema.js'

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
