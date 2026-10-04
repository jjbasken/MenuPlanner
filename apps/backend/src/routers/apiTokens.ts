import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { randomBytes, randomUUID } from 'crypto'
import { idSchema } from '@menu/shared'
import { router, adminProcedure } from '../trpc.js'
import { apiTokens, users } from '../db/schema.js'
import { sha256Hex } from '../lib/secrets.js'

/** Tokens for the /api/v1 REST API that Claude Code and Codex use. Shown once; only the hash is kept. */
export const apiTokensRouter = router({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db.select({
      id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt,
      createdBy: users.displayName,
    }).from(apiTokens).leftJoin(users, eq(users.id, apiTokens.createdBy)).orderBy(desc(apiTokens.createdAt)).all()
  ),

  create: adminProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60) }))
    .mutation(({ ctx, input }) => {
      const token = `mp_${randomBytes(32).toString('base64url')}`
      const id = randomUUID()
      ctx.db.insert(apiTokens).values({ id, name: input.name, tokenHash: sha256Hex(token), createdBy: ctx.userId, createdAt: Date.now() }).run()
      return { id, token }
    }),

  revoke: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(apiTokens).where(eq(apiTokens.id, input.id)).run()
      return { ok: true }
    }),
})
