import { describe, expect, test } from 'bun:test'
import { adminSetup } from './helpers.js'
import { createApp } from '../src/app.js'

async function setup() {
  const s = await adminSetup()
  const { token } = await s.caller.apiTokens.create({ name: 'Claude Code' })
  const app = createApp(s.db)
  const call = (method: string, path: string, body?: unknown, auth = token) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${auth}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  return { ...s, token, call }
}

const plan = (recipeId: string) => ({
  notes: 'Busy week',
  meals: [
    { date: '2026-10-05', kind: 'flexible', title: 'Frittata or leftovers' },
    { date: '2026-10-06', kind: 'cook', recipeId, sideNote: 'Eggs for breakfast.' },
    { date: '2026-10-07', kind: 'leftovers', title: 'Leftover fajitas', leftoverOfDate: '2026-10-06' },
  ],
  prepTasks: [{ date: '2026-10-04', title: 'Slice peppers', minutes: 15 }],
})

describe('/api/v1 auth', () => {
  test('rejects missing, wrong and revoked tokens', async () => {
    const { call, caller } = await setup()
    expect((await call('GET', '/whoami', undefined, '')).status).toBe(401)
    expect((await call('GET', '/whoami', undefined, 'mp_wrong')).status).toBe(401)
    const ok = await call('GET', '/whoami')
    expect(await ok.json()).toEqual({ token: 'Claude Code', recipes: 0 })
    const [t] = await caller.apiTokens.list()
    expect(t.lastUsedAt).toBeNumber()
    await caller.apiTokens.revoke({ id: t.id })
    expect((await call('GET', '/whoami')).status).toBe(401)
  })

  test('only stores a hash of the token', async () => {
    const { db, token } = await setup()
    const row = db.$client.query('SELECT token_hash FROM api_tokens').get() as { token_hash: string }
    expect(token.startsWith('mp_')).toBe(true)
    expect(row.token_hash).not.toContain(token)
    expect(row.token_hash).toHaveLength(64)
  })
})

describe('/api/v1 recipes and plans', () => {
  test('create a recipe, refuse a duplicate title, write and read a plan', async () => {
    const { call } = await setup()
    const created = await call('POST', '/recipes', { title: 'Chicken fajitas', tags: ['quick'], ingredients: [{ name: 'Chicken breast', qty: 2, unit: 'lb' }] })
    expect(created.status).toBe(201)
    const { id } = await created.json() as { id: string }

    const dup = await call('POST', '/recipes', { title: 'chicken FAJITAS' })
    expect(dup.status).toBe(409)
    expect(await dup.json()).toMatchObject({ id })
    expect((await call('POST', '/recipes?allowDuplicate=true', { title: 'chicken FAJITAS' })).status).toBe(201)

    expect(((await (await call('GET', '/recipes?q=fajitas')).json()) as unknown[]).length).toBe(2)
    expect(await (await call('GET', `/recipes/${id}`)).json()).toMatchObject({ title: 'Chicken fajitas', ingredients: [{ name: 'Chicken breast', qty: 2 }] })

    const put = await call('PUT', '/plans/2026-10-05', plan(id))
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ week: '2026-10-05', url: '/plan?week=2026-10-05' })
    const week = await (await call('GET', '/plans/2026-10-05')).json() as { plan: { status: string; notes: string }; meals: { title: string }[]; prepTasks: { title: string }[] }
    expect(week.plan).toMatchObject({ status: 'draft', notes: 'Busy week' })
    expect(week.meals.map(m => m.title)).toEqual(['Frittata or leftovers', 'Chicken fajitas', 'Leftover fajitas'])
    expect(week.prepTasks.map(t => t.title)).toEqual(['Slice peppers'])
  })

  test('validation errors list the bad fields', async () => {
    const { call } = await setup()
    const res = await call('PUT', '/plans/2026-10-05', { meals: [{ date: '2026-10-05', kind: 'brunch', title: 'x' }] })
    expect(res.status).toBe(400)
    const body = await res.json() as { issues: { path: string }[] }
    expect(body.issues[0].path).toBe('meals.0.kind')
    expect((await call('PUT', '/plans/2026-10-06', { meals: [] })).status).toBe(400)
    expect(await (await call('PUT', '/plans/2026-10-06', { meals: [] })).json()).toMatchObject({ error: expect.stringContaining('not a Monday') })
    expect((await call('PUT', '/plans/2026-10-05', { meals: [{ date: '2026-10-05', kind: 'cook', recipeId: 'nope' }] })).status).toBe(400)
    expect((await call('PUT', '/plans/2026-10-05', { meals: [], prepTasks: [{ date: '2026-10-01', title: 'x' }] })).status).toBe(400)
    expect((await call('PUT', '/plans/2026-10-05', { meals: [{ date: '2026-10-05', kind: 'cook', title: 'x', freezerItemIds: ['nope'] }] })).status).toBe(400)
    const bad = await (await setup()).call('POST', '/recipes', 'not json' as unknown)
    expect(bad.status).toBe(400)
  })

  test('a final plan is protected unless forced', async () => {
    const { call, caller } = await setup()
    await call('PUT', '/plans/2026-10-05', { meals: [{ date: '2026-10-05', kind: 'flexible', title: 'Leftovers' }] })
    await caller.plans.setStatus({ weekStart: '2026-10-05', status: 'final' })
    const res = await call('PUT', '/plans/2026-10-05', { meals: [] })
    expect(res.status).toBe(409)
    expect((await call('PUT', '/plans/2026-10-05?force=true', { status: 'final', meals: [] })).status).toBe(200)
  })

  test('freezer items can be linked from the plan', async () => {
    const { call, caller } = await setup()
    const { id: chicken } = await caller.freezer.add({ name: 'Chicken breast', amountText: 'about 2 lb' })
    await call('PUT', '/plans/2026-10-05', { meals: [{ date: '2026-10-06', kind: 'cook', title: 'Fajitas', freezerItemIds: [chicken] }] })
    const t = await caller.tonight.get({ today: '2026-10-05' })
    expect(t.tonightThaw.map(r => r.text)).toEqual(['Thaw tonight: the chicken breast (about 2 lb)'])
  })
})

describe('/api/v1/context', () => {
  test('gathers family, recipes, history with feedback, freezer and staples; defaults to next week', async () => {
    const { call, caller } = await setup()
    const { id: kid } = await caller.family.create({ name: 'Ava', isKid: true, dislikes: 'mushrooms' })
    const { id: recipeId } = await caller.recipes.create({ title: 'Mushroom risotto', prepMin: 10, cookMin: 30, ingredients: [{ name: 'Mushrooms', qty: 8, unit: 'oz' }] })
    const { mealId } = await caller.plans.setDay({ date: '2026-09-30', meal: { date: '2026-09-30', kind: 'cook', recipeId } })
    await caller.feedback.set({ planMealId: mealId!, familyMemberId: kid, verdict: 'down', comment: 'mushrooms' })
    await caller.staples.add({ name: 'Rice' })
    await caller.freezer.add({ name: 'Salmon fillets', isBackup: true })

    const ctx = await (await call('GET', '/context?today=2026-10-04')).json() as any
    expect(ctx.week).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(ctx.existingPlan).toBeNull()
    expect(ctx.family[0]).toMatchObject({ name: 'Ava', isKid: true, dislikes: 'mushrooms' })
    expect(ctx.recipes[0]).toMatchObject({ title: 'Mushroom risotto', totalMin: 40, ingredients: ['Mushrooms'] })
    expect(ctx.recentMeals[0]).toMatchObject({ date: '2026-09-30', title: 'Mushroom risotto', feedback: [{ who: 'Ava', verdict: 'down', comment: 'mushrooms' }] })
    expect(ctx.freezer[0]).toMatchObject({ name: 'Salmon fillets', isBackup: true, plannedFor: null })
    expect(ctx.staples).toEqual(['Rice'])

    const explicit = await (await call('GET', '/context?today=2026-10-04&week=2026-09-28')).json() as any
    expect(explicit.existingPlan.meals[0].title).toBe('Mushroom risotto')
    expect((await call('GET', '/context?week=2026-09-29')).status).toBe(400)
  })
})

describe('api tokens', () => {
  test('are admin-only', async () => {
    const { db } = await setup()
    const { callerFor, makeUser } = await import('./helpers.js')
    const caller = callerFor({ db, userId: await makeUser(db) })
    await expect(caller.apiTokens.create({ name: 'x' })).rejects.toThrow('Admin access required')
  })
})
