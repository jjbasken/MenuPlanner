import { and, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { idSchema, isoDateSchema, MAX_NAME, MAX_SHORT_TEXT, weekStart } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { shoppingItems } from '../db/schema.js'
import { buildFromPlan, currentOrder, ensureStaples, pushOrder } from '../services/order.js'
import { GroceryListError } from '../lib/groceryClient.js'
import { getSettings } from './tonight.js'

export const shoppingRouter = router({
  /** Everything in the current (unsent) order, including items marked "have" or removed. */
  list: protectedProcedure.query(({ ctx }) => {
    ensureStaples(ctx.db)
    return ctx.db.select().from(shoppingItems).where(currentOrder)
      .orderBy(sql`${shoppingItems.name} COLLATE NOCASE`).all()
  }),

  /** For the nav badge. */
  pendingCount: protectedProcedure.query(({ ctx }) => {
    ensureStaples(ctx.db)
    const [{ value }] = ctx.db.select({ value: count() }).from(shoppingItems)
      .where(and(currentOrder, eq(shoppingItems.status, 'pending'))).all()
    return value
  }),

  buildFromPlan: protectedProcedure
    .input(z.object({ weekStart: isoDateSchema.refine(d => weekStart(d) === d, 'Weeks start on Monday') }))
    .mutation(({ ctx, input }) => buildFromPlan(ctx.db, input.weekStart, ctx.userId)),

  update: protectedProcedure
    .input(z.object({
      id: idSchema,
      name: z.string().trim().min(1).max(MAX_NAME),
      quantityText: z.string().trim().max(50),
      note: z.string().trim().max(MAX_SHORT_TEXT),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input
      const res = ctx.db.update(shoppingItems).set(patch).where(and(eq(shoppingItems.id, id), currentOrder)).returning({ id: shoppingItems.id }).all()
      if (!res.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not in the current order' })
      return { ok: true }
    }),

  /** Whether GroceryList is configured and reachable, and which lists it has. */
  groceryStatus: protectedProcedure.query(async ({ ctx }) => {
    const defaultListId = getSettings(ctx.db).groceryListId
    if (!ctx.grocery) return { configured: false as const, lists: [], defaultListId, error: null }
    try {
      return { configured: true as const, lists: await ctx.grocery.listLists(), defaultListId, error: null }
    } catch (err) {
      return { configured: true as const, lists: [], defaultListId, error: err instanceof GroceryListError ? err.message : 'Could not reach GroceryList' }
    }
  }),

  push: protectedProcedure
    .input(z.object({ listId: z.number().int().positive().nullable(), merge: z.boolean().default(true) }))
    .mutation(({ ctx, input }) => {
      if (!ctx.grocery) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GroceryList is not configured — set GROCERYLIST_URL and GROCERYLIST_TOKEN' })
      }
      return pushOrder(ctx.db, ctx.grocery, input)
    }),

  add: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(MAX_NAME),
      quantityText: z.string().trim().max(50).optional().default(''),
      note: z.string().trim().max(MAX_SHORT_TEXT).optional().default(''),
    }))
    .mutation(({ ctx, input }) => {
      const id = randomUUID()
      ctx.db.insert(shoppingItems).values({ id, ...input, source: 'manual', createdBy: ctx.userId, createdAt: Date.now() }).run()
      return { id }
    }),

  /** ✕ removes an item from this order; "Have it" marks a staple as already stocked. Both are undoable. */
  setStatus: protectedProcedure
    .input(z.object({ id: idSchema, status: z.enum(['pending', 'have', 'removed']) }))
    .mutation(({ ctx, input }) => {
      const res = ctx.db.update(shoppingItems).set({ status: input.status })
        .where(and(eq(shoppingItems.id, input.id), currentOrder)).returning({ id: shoppingItems.id }).all()
      if (res.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not in the current order' })
      return { ok: true }
    }),
})
