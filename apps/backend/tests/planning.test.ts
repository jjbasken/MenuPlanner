import { describe, expect, test } from 'bun:test'
import { adminSetup, callerFor, makeUser } from './helpers.js'

const fajitas = {
  title: 'Chicken fajitas',
  servings: 4,
  cookMin: 25,
  prepMin: 10,
  tags: ['Mexican', 'quick', 'mexican'],
  kidFriendly: true,
  ingredients: [
    { name: 'Chicken breast', qty: 2, unit: 'lb' },
    { name: 'Tortillas', qty: 10, unit: '' },
    { name: 'Salt' },
  ],
}

describe('recipes', () => {
  test('create, get, list and filter', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.recipes.create(fajitas)
    await caller.recipes.create({ title: 'Salmon', tags: ['fish'] })

    const r = await caller.recipes.get({ id })
    expect(r.tags).toEqual(['mexican', 'quick'])
    expect(r.ingredients.map(i => [i.name, i.qty, i.unit])).toEqual([['Chicken breast', 2, 'lb'], ['Tortillas', 10, ''], ['Salt', null, '']])

    expect((await caller.recipes.list()).map(x => x.title)).toEqual(['Chicken fajitas', 'Salmon'])
    expect((await caller.recipes.list({ q: 'fajita' })).map(x => x.title)).toEqual(['Chicken fajitas'])
    expect((await caller.recipes.list({ tag: 'fish' })).map(x => x.title)).toEqual(['Salmon'])
    expect((await caller.recipes.list({ kidFriendly: true })).map(x => x.ingredientCount)).toEqual([3])
    expect(await caller.recipes.tags()).toEqual(['fish', 'mexican', 'quick'])
  })

  test('update replaces the ingredient list', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.recipes.create(fajitas)
    await caller.recipes.update({ id, recipe: { ...fajitas, title: 'Steak fajitas', ingredients: [{ name: 'Flank steak', qty: 1.5, unit: 'lb' }] } })
    const r = await caller.recipes.get({ id })
    expect(r.title).toBe('Steak fajitas')
    expect(r.ingredients.map(i => i.name)).toEqual(['Flank steak'])
    await expect(caller.recipes.update({ id: 'nope', recipe: fajitas })).rejects.toThrow('Recipe not found')
  })

  test('deleting a recipe keeps planned meals by title', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.recipes.create(fajitas)
    await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', recipeId: id } })
    await caller.recipes.delete({ id })
    const week = await caller.plans.week({ weekStart: '2026-10-05' })
    expect(week.meals[0]).toMatchObject({ title: 'Chicken fajitas', recipeId: null })
  })
})

describe('plan editor', () => {
  test('setDay creates a draft plan and fills in the recipe title', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.recipes.create(fajitas)
    await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', recipeId: id, sideNote: 'Eggs for breakfast.' } })
    const week = await caller.plans.week({ weekStart: '2026-10-05' })
    expect(week.plan?.status).toBe('draft')
    expect(week.meals[0]).toMatchObject({ date: '2026-10-06', title: 'Chicken fajitas', sideNote: 'Eggs for breakfast.', totalMin: 35 })
  })

  test('editing a day keeps the meal id (and its feedback)', async () => {
    const { caller } = await adminSetup()
    const first = await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', title: 'Tacos' } })
    const { id: kid } = await caller.family.create({ name: 'Sam', isKid: true })
    await caller.feedback.set({ planMealId: first.mealId!, familyMemberId: kid, verdict: 'up' })
    const second = await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', title: 'Fish tacos' } })
    expect(second.mealId).toBe(first.mealId)
    const fb = await caller.feedback.recent({ today: '2026-10-06' })
    expect(fb.meals[0].votes[kid]?.verdict).toBe('up')
  })

  test('leftovers link to the cook night, freezer links are replaced', async () => {
    const { caller, db } = await adminSetup()
    const { mealId: cook } = await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', title: 'Fajitas' } })
    const { id: chicken } = await caller.freezer.add({ name: 'Chicken' })
    const { id: peppers } = await caller.freezer.add({ name: 'Peppers' })
    await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', title: 'Fajitas', freezerItemIds: [chicken, peppers] } })
    await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', title: 'Fajitas', freezerItemIds: [peppers] } })
    const week = await caller.plans.week({ weekStart: '2026-10-05' })
    expect(week.meals[0].freezer.map(f => f.name)).toEqual(['Peppers'])

    await caller.plans.setDay({ date: '2026-10-07', meal: { date: '2026-10-07', kind: 'leftovers', title: 'Leftover fajitas', leftoverOfDate: '2026-10-06' } })
    const row = db.$client.query("SELECT leftover_of FROM plan_meals WHERE date = '2026-10-07'").get() as { leftover_of: string }
    expect(row.leftover_of).toBe(cook!)
  })

  test('clearing a day removes its meal', async () => {
    const { caller } = await adminSetup()
    await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'flexible', title: 'Leftovers' } })
    await caller.plans.setDay({ date: '2026-10-06', meal: null })
    expect((await caller.plans.week({ weekStart: '2026-10-05' })).meals).toEqual([])
  })

  test('rejects mismatched dates, unknown recipes and non-Monday weeks', async () => {
    const { caller } = await adminSetup()
    await expect(caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-07', kind: 'cook', title: 'x' } })).rejects.toThrow('does not match')
    await expect(caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'cook', recipeId: 'nope' } })).rejects.toThrow('Unknown recipe')
    await expect(caller.plans.week({ weekStart: '2026-10-06' })).rejects.toThrow()
  })

  test('status and prep tasks', async () => {
    const { caller } = await adminSetup()
    await caller.plans.setStatus({ weekStart: '2026-10-05', status: 'final' })
    // Sunday batch-prep before the week starts belongs to that week.
    const { id } = await caller.plans.addPrepTask({ weekStart: '2026-10-05', date: '2026-10-04', title: 'Marinate chicken', minutes: 10 })
    await caller.plans.addPrepTask({ weekStart: '2026-10-05', date: '2026-10-05', title: 'Chop peppers' })
    await caller.plans.addPrepTask({ weekStart: '2026-10-05', date: '2026-10-05', title: 'Cook rice' })
    let week = await caller.plans.week({ weekStart: '2026-10-05' })
    expect(week.plan?.status).toBe('final')
    expect(week.prepTasks.map(t => t.title)).toEqual(['Marinate chicken', 'Chop peppers', 'Cook rice'])
    await expect(caller.plans.addPrepTask({ weekStart: '2026-10-05', date: '2026-10-03', title: 'Too early' })).rejects.toThrow('Sunday before')
    await caller.plans.setPrepDone({ id, done: true })
    week = await caller.plans.week({ weekStart: '2026-10-05' })
    expect(week.prepTasks[0].done).toBe(true)
    await caller.plans.deletePrepTask({ id })
    expect((await caller.plans.week({ weekStart: '2026-10-05' })).prepTasks).toHaveLength(2)
  })
})

describe('family & feedback', () => {
  test('family CRUD', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.family.create({ name: 'Ava', isKid: true, dislikes: 'mushrooms' })
    await caller.family.create({ name: 'Mom' })
    await caller.family.update({ id, name: 'Ava', isKid: true, dislikes: 'mushrooms, olives', likes: 'tacos', allergies: '', notes: '' })
    const list = await caller.family.list()
    expect(list.map(m => m.name)).toEqual(['Ava', 'Mom'])
    expect(list[0].dislikes).toBe('mushrooms, olives')
    await caller.family.delete({ id })
    expect((await caller.family.list()).map(m => m.name)).toEqual(['Mom'])
  })

  test('votes can be set, changed and cleared; only recent meals are listed', async () => {
    const { caller } = await adminSetup()
    const { mealId } = await caller.plans.setDay({ date: '2026-10-03', meal: { date: '2026-10-03', kind: 'cook', title: 'Pizza' } })
    await caller.plans.setDay({ date: '2026-09-01', meal: { date: '2026-09-01', kind: 'cook', title: 'Old meal' } })
    await caller.plans.setDay({ date: '2026-10-09', meal: { date: '2026-10-09', kind: 'cook', title: 'Future meal' } })
    const { id: kid } = await caller.family.create({ name: 'Leo', isKid: true })

    await caller.feedback.set({ planMealId: mealId!, familyMemberId: kid, verdict: 'down' })
    await caller.feedback.set({ planMealId: mealId!, familyMemberId: kid, verdict: 'meh', comment: 'too spicy' })
    let fb = await caller.feedback.recent({ today: '2026-10-04' })
    expect(fb.meals.map(m => m.title)).toEqual(['Pizza'])
    expect(fb.meals[0].votes[kid]).toEqual({ verdict: 'meh', comment: 'too spicy' })

    await caller.feedback.set({ planMealId: mealId!, familyMemberId: kid, verdict: null })
    fb = await caller.feedback.recent({ today: '2026-10-04' })
    expect(fb.meals[0].votes).toEqual({})
    await expect(caller.feedback.set({ planMealId: mealId!, familyMemberId: 'nope', verdict: 'up' })).rejects.toThrow('Family member not found')
  })

  test('every signed-in user can plan (shared household)', async () => {
    const { db } = await adminSetup()
    const caller = callerFor({ db, userId: await makeUser(db) })
    await caller.recipes.create({ title: 'Grilled cheese' })
    expect((await caller.recipes.list()).length).toBe(1)
  })
})
