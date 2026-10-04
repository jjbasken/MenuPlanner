import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { idSchema, MAX_NAME, recipeInputSchema } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { recipes } from '../db/schema.js'
import { getRecipe, saveRecipe, splitTags } from '../services/recipes.js'

export const recipesRouter = router({
  list: protectedProcedure
    .input(z.object({
      q: z.string().trim().max(MAX_NAME).optional(),
      tag: z.string().trim().max(40).optional(),
      kidFriendly: z.boolean().optional(),
    }).optional())
    .query(({ ctx, input }) => {
      const rows = ctx.db.select({
        id: recipes.id,
        title: recipes.title,
        description: recipes.description,
        servings: recipes.servings,
        prepMin: recipes.prepMin,
        cookMin: recipes.cookMin,
        tags: recipes.tags,
        kidFriendly: recipes.kidFriendly,
        rating: recipes.rating,
        // Spelled out: drizzle renders bare column names inside a subquery, which
        // would resolve `id` against recipe_ingredients instead of recipes.
        ingredientCount: sql<number>`(SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = "recipes"."id")`,
      }).from(recipes).orderBy(sql`${recipes.title} COLLATE NOCASE`).all()

      const q = input?.q?.toLowerCase()
      return rows
        .map(r => ({ ...r, tags: splitTags(r.tags) }))
        .filter(r => !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some(t => t.includes(q)))
        .filter(r => !input?.tag || r.tags.includes(input.tag.toLowerCase()))
        .filter(r => input?.kidFriendly === undefined || r.kidFriendly === input.kidFriendly)
    }),

  tags: protectedProcedure.query(({ ctx }) => {
    const all = ctx.db.select({ tags: recipes.tags }).from(recipes).all().flatMap(r => splitTags(r.tags))
    return [...new Set(all)].sort()
  }),

  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => {
      const recipe = getRecipe(ctx.db, input.id)
      if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' })
      return recipe
    }),

  create: protectedProcedure
    .input(recipeInputSchema)
    .mutation(({ ctx, input }) => saveRecipe(ctx.db, input, { userId: ctx.userId })),

  update: protectedProcedure
    .input(z.object({ id: idSchema, recipe: recipeInputSchema }))
    .mutation(({ ctx, input }) => saveRecipe(ctx.db, input.recipe, { id: input.id })),

  /** Meals that used the recipe keep their title; they just lose the link. */
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(recipes).where(eq(recipes.id, input.id)).run()
      return { ok: true }
    }),
})
