// REST API for coding agents (Claude Code, Codex) via the `mp` CLI. Plain JSON
// over HTTP so an agent can drive it with nothing but a shell. Authenticated
// with an API token from Settings; only its SHA-256 is stored.
import { Hono, type Context } from 'hono'
import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import { ZodError } from 'zod'
import {
  addDays, isISODate, planInputSchema, recipeInputSchema, todayISO, weekStart, type ISODate,
} from '@menu/shared'
import type { Db } from '../db/index.js'
import {
  apiTokens, familyMembers, freezerItems, mealFeedback, mealPlans, planMeals, recipeIngredients, recipes, staples,
} from '../db/schema.js'
import { sha256Hex } from '../lib/secrets.js'
import { getWeek, savePlan } from '../services/plans.js'
import { getRecipe, saveRecipe, splitTags } from '../services/recipes.js'
import { getSettings } from '../routers/tonight.js'

const HISTORY_WEEKS = 4

type Env = { Variables: { tokenId: string } }

function badRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message })
}

function parseMonday(s: string | undefined): ISODate {
  if (!s || !isISODate(s)) badRequest('Expected a week as YYYY-MM-DD')
  if (weekStart(s) !== s) badRequest(`${s} is not a Monday — weeks start on Monday (try ${weekStart(s)})`)
  return s
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    badRequest('Expected a JSON body')
  }
}

/** Everything an agent needs to plan a week in one call. */
export function planningContext(db: Db, today: ISODate, week: ISODate) {
  const s = getSettings(db)
  const family = db.select().from(familyMembers).orderBy(familyMembers.sort, familyMembers.createdAt).all()
  const nameById = new Map(family.map(m => [m.id, m.name]))

  const recipeRows = db.select().from(recipes).orderBy(sql`${recipes.title} COLLATE NOCASE`).all()
  const ingredients = db.select({ recipeId: recipeIngredients.recipeId, name: recipeIngredients.name })
    .from(recipeIngredients).orderBy(recipeIngredients.sort).all()

  const historyFrom = addDays(week, -7 * HISTORY_WEEKS)
  const history = db.select().from(planMeals)
    .where(and(gte(planMeals.date, historyFrom), lt(planMeals.date, week)))
    .orderBy(planMeals.date).all()
  const feedback = history.length
    ? db.select().from(mealFeedback).where(inArray(mealFeedback.planMealId, history.map(m => m.id))).all()
    : []

  const freezer = db.select().from(freezerItems).where(isNull(freezerItems.usedAt)).orderBy(freezerItems.addedAt).all()
  const linkedMeals = freezer.some(f => f.planMealId)
    ? db.select({ id: planMeals.id, date: planMeals.date, title: planMeals.title }).from(planMeals)
      .where(inArray(planMeals.id, freezer.map(f => f.planMealId).filter((id): id is string => !!id))).all()
    : []

  const existing = getWeek(db, week)

  return {
    today,
    week: { start: week, end: addDays(week, 6) },
    existingPlan: existing.plan
      ? {
          status: existing.plan.status,
          meals: existing.meals.map(m => ({ date: m.date, kind: m.kind, title: m.title, recipeId: m.recipeId, sideNote: m.sideNote })),
          prepTasks: existing.prepTasks.map(t => ({ date: t.date, title: t.title, minutes: t.minutes, done: t.done })),
        }
      : null,
    family: family.map(m => ({
      id: m.id, name: m.name, isKid: m.isKid, likes: m.likes, dislikes: m.dislikes, allergies: m.allergies, notes: m.notes,
    })),
    recipes: recipeRows.map(r => ({
      id: r.id,
      title: r.title,
      servings: r.servings,
      totalMin: (r.prepMin ?? 0) + (r.cookMin ?? 0) || null,
      tags: splitTags(r.tags),
      kidFriendly: r.kidFriendly,
      rating: r.rating,
      prepAheadNotes: r.prepAheadNotes || undefined,
      ingredients: ingredients.filter(i => i.recipeId === r.id).map(i => i.name),
    })),
    recentMeals: history.map(m => ({
      date: m.date,
      kind: m.kind,
      title: m.title,
      recipeId: m.recipeId,
      rating: m.rating,
      notes: m.notes || undefined,
      feedback: feedback.filter(f => f.planMealId === m.id).map(f => ({
        who: nameById.get(f.familyMemberId) ?? 'unknown', verdict: f.verdict, comment: f.comment || undefined,
      })),
    })),
    freezer: freezer.map(f => {
      const meal = linkedMeals.find(m => m.id === f.planMealId)
      return {
        id: f.id, name: f.name, amount: f.amountText, isBackup: f.isBackup,
        plannedFor: meal ? { date: meal.date, title: meal.title } : null,
      }
    }),
    staples: db.select({ name: staples.name }).from(staples).all().map(x => x.name),
    cadence: { draftDow: s.draftDow, listDow: s.listDow, pickupDow: s.pickupDow, note: '0 = Sunday … 6 = Saturday' },
  }
}

export function createV1(db: Db) {
  const v1 = new Hono<Env>()

  v1.use('*', async (c, next) => {
    const auth = c.req.header('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    const row = token
      ? db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.tokenHash, sha256Hex(token))).get()
      : undefined
    if (!row) return c.json({ error: 'Missing or invalid API token. Create one in MenuPlanner → Settings → API tokens.' }, 401)
    db.update(apiTokens).set({ lastUsedAt: Date.now() }).where(eq(apiTokens.id, row.id)).run()
    c.set('tokenId', row.id)
    await next()
  })

  v1.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: 'Invalid input', issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, 400)
    }
    if (err instanceof TRPCError) {
      return c.json({ error: err.message }, getHTTPStatusCodeFromError(err) as 400)
    }
    console.error(err)
    return c.json({ error: 'Internal error' }, 500)
  })

  /** ?today= lets the agent pass the household's date; ?week= defaults to the week after today's. */
  v1.get('/context', c => {
    const today = c.req.query('today') ?? todayISO()
    if (!isISODate(today)) badRequest('today must be YYYY-MM-DD')
    const week = c.req.query('week') ? parseMonday(c.req.query('week')) : addDays(weekStart(today), 7)
    return c.json(planningContext(db, today, week))
  })

  v1.get('/recipes', c => {
    const q = c.req.query('q')?.toLowerCase()
    const rows = db.select({ id: recipes.id, title: recipes.title, tags: recipes.tags, servings: recipes.servings })
      .from(recipes).orderBy(sql`${recipes.title} COLLATE NOCASE`).all()
      .map(r => ({ ...r, tags: splitTags(r.tags) }))
      .filter(r => !q || r.title.toLowerCase().includes(q) || r.tags.includes(q))
    return c.json(rows)
  })

  v1.get('/recipes/:id', c => {
    const r = getRecipe(db, c.req.param('id'))
    return r ? c.json(r) : c.json({ error: 'Recipe not found' }, 404)
  })

  /** Refuses a second recipe with the same title (409, with its id) unless ?allowDuplicate=true. */
  v1.post('/recipes', async c => {
    const input = recipeInputSchema.parse(await jsonBody(c))
    if (c.req.query('allowDuplicate') !== 'true') {
      const dup = db.select({ id: recipes.id }).from(recipes).where(sql`${recipes.title} = ${input.title} COLLATE NOCASE`).get()
      if (dup) return c.json({ error: `A recipe called "${input.title}" already exists`, id: dup.id }, 409)
    }
    return c.json(saveRecipe(db, input), 201)
  })

  v1.put('/recipes/:id', async c => {
    const input = recipeInputSchema.parse(await jsonBody(c))
    return c.json(saveRecipe(db, input, { id: c.req.param('id') }))
  })

  v1.get('/plans/:week', c => {
    const week = parseMonday(c.req.param('week'))
    return c.json(getWeek(db, week))
  })

  /**
   * Writes a whole week (meals + prep tasks), replacing what's there. A plan the
   * family already marked final is protected unless ?force=true, because
   * replacing it also discards that week's feedback.
   */
  v1.put('/plans/:week', async c => {
    const week = parseMonday(c.req.param('week'))
    const input = planInputSchema.parse(await jsonBody(c))
    const existing = db.select({ status: mealPlans.status }).from(mealPlans).where(eq(mealPlans.weekStart, week)).get()
    if (existing?.status === 'final' && c.req.query('force') !== 'true') {
      return c.json({ error: `The plan for ${week} is marked final. Ask the family before replacing it, then retry with ?force=true.` }, 409)
    }
    const freezerIds = [...new Set(input.meals.flatMap(m => m.freezerItemIds))]
    if (freezerIds.length) {
      const found = db.select({ id: freezerItems.id }).from(freezerItems).where(inArray(freezerItems.id, freezerIds)).all()
      const missing = freezerIds.filter(id => !found.some(f => f.id === id))
      if (missing.length) badRequest(`Unknown freezer item id(s): ${missing.join(', ')}`)
    }
    const prepOutOfRange = input.prepTasks.find(t => t.date < addDays(week, -1) || t.date > addDays(week, 6))
    if (prepOutOfRange) badRequest(`Prep task date ${prepOutOfRange.date} must be in the week or the Sunday before it`)
    const res = savePlan(db, week, input)
    return c.json({ ...res, week, url: `/plan?week=${week}` })
  })

  /** Connectivity check for the CLI: which token is in use. */
  v1.get('/whoami', c => {
    const row = db.select({ name: apiTokens.name }).from(apiTokens).where(eq(apiTokens.id, c.get('tokenId'))).get()
    return c.json({ token: row?.name, recipes: db.select({ n: sql<number>`count(*)` }).from(recipes).get()?.n ?? 0 })
  })

  return v1
}
