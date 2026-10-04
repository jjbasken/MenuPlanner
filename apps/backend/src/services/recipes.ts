import { asc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { recipeInputSchema } from '@menu/shared'
import type { z } from 'zod'
import type { Db } from '../db/index.js'
import { recipeIngredients, recipes } from '../db/schema.js'

export type RecipeInputParsed = z.output<typeof recipeInputSchema>

/** Tags are stored as a comma-separated column and exposed as an array. */
export function splitTags(tags: string): string[] {
  return tags.split(',').map(t => t.trim()).filter(Boolean)
}

function joinTags(tags: string[]): string {
  return [...new Set(tags.map(t => t.trim().toLowerCase().replace(/,/g, ' ')).filter(Boolean))].join(',')
}

/** Creates a recipe, or replaces one (including its ingredient list) when `id` is given. */
export function saveRecipe(db: Db, input: RecipeInputParsed, opts: { id?: string; userId?: string | null } = {}) {
  const now = Date.now()
  const { ingredients, tags, ...fields } = input
  const row = {
    ...fields,
    prepMin: fields.prepMin ?? null,
    cookMin: fields.cookMin ?? null,
    sourceUrl: fields.sourceUrl ?? null,
    rating: fields.rating ?? null,
    tags: joinTags(tags),
    updatedAt: now,
  }
  return db.transaction(tx => {
    let id = opts.id
    if (id) {
      const updated = tx.update(recipes).set(row).where(eq(recipes.id, id)).returning({ id: recipes.id }).all()
      if (!updated.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' })
      tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).run()
    } else {
      id = randomUUID()
      tx.insert(recipes).values({ id, ...row, createdBy: opts.userId ?? null, createdAt: now }).run()
    }
    ingredients.forEach((ing, sort) => {
      tx.insert(recipeIngredients).values({
        id: randomUUID(), recipeId: id!, name: ing.name, qty: ing.qty ?? null, unit: ing.unit, note: ing.note, sort,
      }).run()
    })
    return { id }
  })
}

export function getRecipe(db: Db, id: string) {
  const recipe = db.select().from(recipes).where(eq(recipes.id, id)).get()
  if (!recipe) return null
  const ingredients = db.select().from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, id)).orderBy(asc(recipeIngredients.sort)).all()
  return { ...recipe, tags: splitTags(recipe.tags), ingredients }
}
