import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { TRPCError } from '@trpc/server'
import { idSchema, MAX_SHORT_TEXT } from '@menu/shared'
import { router, protectedProcedure } from '../trpc.js'
import { familyMembers } from '../db/schema.js'

const memberFields = z.object({
  name: z.string().trim().min(1).max(60),
  isKid: z.boolean().default(false),
  likes: z.string().trim().max(MAX_SHORT_TEXT).default(''),
  dislikes: z.string().trim().max(MAX_SHORT_TEXT).default(''),
  allergies: z.string().trim().max(MAX_SHORT_TEXT).default(''),
  notes: z.string().trim().max(MAX_SHORT_TEXT).default(''),
})

/** Who the plan feeds. Preferences here are what the plan-week agent workflow plans around. */
export const familyRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(familyMembers).orderBy(familyMembers.sort, familyMembers.createdAt).all()
  ),

  create: protectedProcedure
    .input(memberFields)
    .mutation(({ ctx, input }) => {
      const id = randomUUID()
      const count = ctx.db.select({ id: familyMembers.id }).from(familyMembers).all().length
      ctx.db.insert(familyMembers).values({ id, ...input, sort: count, createdAt: Date.now() }).run()
      return { id }
    }),

  update: protectedProcedure
    .input(memberFields.extend({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input
      const res = ctx.db.update(familyMembers).set(patch).where(eq(familyMembers.id, id)).returning({ id: familyMembers.id }).all()
      if (!res.length) throw new TRPCError({ code: 'NOT_FOUND' })
      return { ok: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(familyMembers).where(eq(familyMembers.id, input.id)).run()
      return { ok: true }
    }),
})
