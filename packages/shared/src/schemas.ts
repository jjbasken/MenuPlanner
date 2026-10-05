// Input schemas shared by the tRPC routers, the /api/v1 REST API and the
// `mp` CLI used by Claude Code / Codex, so all three validate identically.
import { z } from 'zod'
import { isISODate } from './dates.js'
import { MEAL_KINDS, PLAN_STATUSES } from './types.js'
import {
  MAX_ID, MAX_INGREDIENTS, MAX_LONG_TEXT, MAX_NAME, MAX_PLAN_MEALS, MAX_PREP_TASKS,
  MAX_SHORT_TEXT, MAX_TAGS, MAX_URL,
} from './limits.js'

export const isoDateSchema = z.string().refine(isISODate, 'Expected a date as YYYY-MM-DD')
export const idSchema = z.string().min(1).max(MAX_ID)

export function isWebUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const optionalMinutes = z.number().int().min(0).max(24 * 60).nullable().optional()

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME),
  qty: z.number().positive().max(100_000).nullable().optional(),
  unit: z.string().trim().max(40).optional().default(''),
  note: z.string().trim().max(MAX_SHORT_TEXT).optional().default(''),
})

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_NAME),
  description: z.string().trim().max(MAX_SHORT_TEXT * 4).optional().default(''),
  servings: z.number().int().min(1).max(100).default(4),
  prepMin: optionalMinutes,
  cookMin: optionalMinutes,
  instructions: z.string().max(MAX_LONG_TEXT).optional().default(''),
  sourceUrl: z.string().trim().url().max(MAX_URL)
    .refine(isWebUrl, 'Use an HTTP or HTTPS URL')
    .nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(MAX_TAGS).optional().default([]),
  kidFriendly: z.boolean().optional().default(false),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  prepAheadNotes: z.string().max(MAX_SHORT_TEXT * 4).optional().default(''),
  ingredients: z.array(ingredientInputSchema).max(MAX_INGREDIENTS).optional().default([]),
})
export type RecipeInput = z.input<typeof recipeInputSchema>

export const planMealInputSchema = z.object({
  date: isoDateSchema,
  kind: z.enum(MEAL_KINDS),
  /** An existing recipe. Omit for free-text meals ("Frittata, omelets, or leftovers"). */
  recipeId: idSchema.nullable().optional(),
  /** Shown on the plan. Defaults to the recipe title when a recipe is given. */
  title: z.string().trim().max(MAX_NAME).optional(),
  /** For leftovers: the date of the cook night being eaten up. */
  leftoverOfDate: isoDateSchema.nullable().optional(),
  sideNote: z.string().trim().max(MAX_SHORT_TEXT).optional().default(''),
  servings: z.number().int().min(1).max(100).nullable().optional(),
  notes: z.string().trim().max(MAX_SHORT_TEXT).optional().default(''),
  /** Freezer items to thaw for this meal (reminder shows the night before). */
  freezerItemIds: z.array(idSchema).max(10).optional().default([]),
}).refine(m => m.recipeId || m.title, { message: 'A meal needs a recipeId or a title' })
export type PlanMealInput = z.input<typeof planMealInputSchema>

export const prepTaskInputSchema = z.object({
  date: isoDateSchema,
  title: z.string().trim().min(1).max(MAX_NAME),
  minutes: optionalMinutes,
  recipeId: idSchema.nullable().optional(),
})

/** A whole week, as written by the plan-week agent workflow or the plan editor. */
export const planInputSchema = z.object({
  status: z.enum(PLAN_STATUSES).optional().default('draft'),
  notes: z.string().trim().max(MAX_SHORT_TEXT * 4).optional().default(''),
  meals: z.array(planMealInputSchema).max(MAX_PLAN_MEALS),
  prepTasks: z.array(prepTaskInputSchema).max(MAX_PREP_TASKS).optional().default([]),
})
export type PlanInput = z.input<typeof planInputSchema>
