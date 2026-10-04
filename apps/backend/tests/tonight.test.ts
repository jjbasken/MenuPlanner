import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { planInputSchema } from '@menu/shared'
import { adminSetup } from './helpers.js'
import { savePlan } from '../src/services/plans.js'
import { recipes } from '../src/db/schema.js'
import type { Db } from '../src/db/index.js'

// 2026-10-04 is a Sunday; the plan week runs Mon 10-05 … Sun 10-11.
const TODAY = '2026-10-04'
const WEEK = '2026-10-05'

function addRecipe(db: Db, title: string) {
  const id = randomUUID()
  db.insert(recipes).values({ id, title, createdAt: 0, updatedAt: 0 }).run()
  return id
}

async function withWeek() {
  const s = await adminSetup()
  const fajitas = addRecipe(s.db, 'Chicken fajitas')
  const { mealIds } = savePlan(s.db, WEEK, planInputSchema.parse({
    meals: [
      { date: '2026-10-05', kind: 'flexible', title: 'Frittata or leftovers' },
      { date: '2026-10-06', kind: 'cook', recipeId: fajitas },
      { date: '2026-10-07', kind: 'leftovers', title: 'Leftover fajitas', leftoverOfDate: '2026-10-06' },
      { date: '2026-10-08', kind: 'cook', title: 'Turkey egg roll in a bowl' },
    ],
  }))
  return { ...s, fajitas, mealIds }
}

describe('savePlan', () => {
  test('rejects a week that does not start on Monday', async () => {
    const { db } = await adminSetup()
    expect(() => savePlan(db, '2026-10-06', planInputSchema.parse({ meals: [] }))).toThrow('not a Monday')
  })

  test('rejects meals outside the week', async () => {
    const { db } = await adminSetup()
    expect(() => savePlan(db, WEEK, planInputSchema.parse({ meals: [{ date: '2026-10-12', kind: 'cook', title: 'x' }] }))).toThrow('outside the week')
  })

  test('rejects unknown recipes', async () => {
    const { db } = await adminSetup()
    expect(() => savePlan(db, WEEK, planInputSchema.parse({ meals: [{ date: WEEK, kind: 'cook', recipeId: 'nope' }] }))).toThrow('Unknown recipe')
  })

  test('uses the recipe title and links leftovers to their cook night', async () => {
    const { db, mealIds } = await withWeek()
    const rows = db.$client.query('SELECT id, title, leftover_of FROM plan_meals ORDER BY date').all() as { id: string; title: string; leftover_of: string | null }[]
    expect(rows[1].title).toBe('Chicken fajitas')
    expect(rows[2].leftover_of).toBe(mealIds[1])
  })

  test('saving again replaces the week', async () => {
    const { db } = await withWeek()
    savePlan(db, WEEK, planInputSchema.parse({ meals: [{ date: WEEK, kind: 'flexible', title: 'Pizza night' }] }))
    expect(db.$client.query('SELECT COUNT(*) AS n FROM plan_meals').get()).toEqual({ n: 1 })
    expect(db.$client.query('SELECT COUNT(*) AS n FROM meal_plans').get()).toEqual({ n: 1 })
  })
})

describe('tonight.get', () => {
  test('shows the coming week with cook-night numbering', async () => {
    const { caller } = await withWeek()
    const t = await caller.tonight.get({ today: TODAY })
    expect(t.tonight).toBeNull()
    expect(t.comingUp).toHaveLength(7)
    expect(t.comingUp[0].date).toBe('2026-10-05')
    expect(t.comingUp[1].meal).toMatchObject({ title: 'Chicken fajitas', kind: 'cook', cook: { index: 1, total: 2 } })
    expect(t.comingUp[3].meal?.cook).toEqual({ index: 2, total: 2 })
    expect(t.comingUp[4].meal).toBeNull()
  })

  test('tonight is the meal dated today', async () => {
    const { caller } = await withWeek()
    const t = await caller.tonight.get({ today: '2026-10-06' })
    expect(t.tonight?.title).toBe('Chicken fajitas')
  })

  test('thaw reminders show the night before, and the freezer lists the linked meal', async () => {
    const { caller, mealIds } = await withWeek()
    await caller.freezer.add({ name: 'Chicken breast', amountText: 'about 2 lb', planMealId: mealIds[1] })
    const t = await caller.tonight.get({ today: TODAY })
    expect(t.comingUp[0].thaw.map(r => r.text)).toEqual(['Thaw tonight: the chicken breast (about 2 lb)'])
    expect(t.freezer[0].meal).toMatchObject({ date: '2026-10-06', title: 'Chicken fajitas' })

    const tonightView = await caller.tonight.get({ today: '2026-10-05' })
    expect(tonightView.tonightThaw).toHaveLength(1)
  })

  test('cadence: draft, list, pickup in sequence', async () => {
    const { caller } = await adminSetup()
    const t = await caller.tonight.get({ today: TODAY })
    expect(t.cadence).toEqual({ draft: '2026-10-06', list: '2026-10-08', pickup: '2026-10-11' })
    await caller.settings.updateCadence({ draftDow: 0, listDow: 1, pickupDow: 2 })
    expect((await caller.tonight.get({ today: TODAY })).cadence).toEqual({ draft: '2026-10-04', list: '2026-10-05', pickup: '2026-10-06' })
  })
})

describe('cook-night numbering', () => {
  test('is counted within each plan week, not across the window', async () => {
    const { caller, db } = await withWeek()
    // A cook night in the previous week must not inflate this week's "of N".
    savePlan(db, '2026-09-28', planInputSchema.parse({ meals: [{ date: '2026-10-04', kind: 'cook', title: 'Roast chicken' }] }))
    const t = await caller.tonight.get({ today: TODAY })
    expect(t.tonight?.cook).toEqual({ index: 1, total: 1 })
    expect(t.comingUp[1].meal?.cook).toEqual({ index: 1, total: 2 })
  })
})

describe('plans', () => {
  test('pushBack slides today and later meals', async () => {
    const { caller, db } = await withWeek()
    await caller.plans.pushBack({ from: '2026-10-06', days: 1 })
    const dates = (db.$client.query('SELECT date, title FROM plan_meals ORDER BY date').all() as { date: string; title: string }[])
    expect(dates.map(d => d.date)).toEqual(['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09'])
    expect(dates[1].title).toBe('Chicken fajitas')
  })

  test('moveMeal swaps with the meal on the target date', async () => {
    const { caller, db, mealIds } = await withWeek()
    const res = await caller.plans.moveMeal({ mealId: mealIds[0], toDate: '2026-10-08' })
    expect(res.swappedWith).toBe(mealIds[3])
    const row = db.$client.query('SELECT date FROM plan_meals WHERE id = ?').get(mealIds[3]) as { date: string }
    expect(row.date).toBe('2026-10-05')
  })

  test('updateMeal stores notes and rating', async () => {
    const { caller, mealIds } = await withWeek()
    await caller.plans.updateMeal({ mealId: mealIds[1], notes: 'Kids loved it', rating: 5 })
    const t = await caller.tonight.get({ today: '2026-10-06' })
    expect(t.tonight).toMatchObject({ notes: 'Kids loved it', rating: 5 })
    await expect(caller.plans.updateMeal({ mealId: 'nope', rating: 1 })).rejects.toThrow('Meal not found')
  })
})

describe('next order', () => {
  test('manual items and staples show until removed or marked have-it', async () => {
    const { caller } = await adminSetup()
    await caller.staples.add({ name: 'Rice' })
    await caller.shopping.add({ name: 'Gallon freezer bags' })
    let order = (await caller.tonight.get({ today: TODAY })).nextOrder
    expect(order.map(i => [i.name, i.source])).toEqual([['Gallon freezer bags', 'manual'], ['Rice', 'staple']])

    const rice = order.find(i => i.name === 'Rice')!
    await caller.shopping.setStatus({ id: rice.id, status: 'have' })
    order = (await caller.tonight.get({ today: TODAY })).nextOrder
    // Marked "have" — and not re-added on the next load.
    expect(order.map(i => i.name)).toEqual(['Gallon freezer bags'])

    await caller.shopping.setStatus({ id: order[0].id, status: 'removed' })
    expect((await caller.tonight.get({ today: TODAY })).nextOrder).toEqual([])
  })

  test('staples are unique case-insensitively', async () => {
    const { caller } = await adminSetup()
    await caller.staples.add({ name: 'Rice' })
    await expect(caller.staples.add({ name: 'rice' })).rejects.toThrow('already a staple')
  })

  test('staples marked not-in-every-order are not added', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.staples.add({ name: 'Coffee' })
    await caller.staples.setInEveryOrder({ id, inEveryOrder: false })
    expect((await caller.tonight.get({ today: TODAY })).nextOrder).toEqual([])
  })
})

describe('freezer', () => {
  test('used items leave the list and can be restored', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.freezer.add({ name: 'Salmon fillets' })
    await caller.freezer.setUsed({ id, used: true })
    expect((await caller.tonight.get({ today: TODAY })).freezer).toEqual([])
    await expect(caller.freezer.setUsed({ id, used: true })).rejects.toThrow()
    await caller.freezer.setUsed({ id, used: false })
    expect((await caller.freezer.list()).map(f => f.name)).toEqual(['Salmon fillets'])
  })

  test('linking to a missing meal is rejected', async () => {
    const { caller } = await adminSetup()
    await expect(caller.freezer.add({ name: 'Peas', planMealId: 'nope' })).rejects.toThrow('Meal not found')
  })
})
