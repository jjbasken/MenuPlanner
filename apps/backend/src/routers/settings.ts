import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc.js'
import { settings } from '../db/schema.js'
import { getSettings } from './tonight.js'

const dow = z.number().int().min(0).max(6)

export const settingsRouter = router({
  get: protectedProcedure.query(({ ctx }) => getSettings(ctx.db)),

  /** The weekly shopping rhythm: when the next plan is drafted, the list sent, and the order picked up. */
  updateCadence: protectedProcedure
    .input(z.object({ draftDow: dow, listDow: dow, pickupDow: dow }))
    .mutation(({ ctx, input }) => {
      ctx.db.update(settings).set(input).where(eq(settings.id, 'household')).run()
      return { ok: true }
    }),
})
