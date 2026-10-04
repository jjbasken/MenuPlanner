import { describe, expect, test } from 'bun:test'
import { adminSetup, callerFor } from './helpers.js'
import type { GroceryClient, GroceryItem } from '../src/lib/groceryClient.js'
import { GroceryListError } from '../src/lib/groceryClient.js'

function fakeGrocery(opts: { fail?: boolean } = {}) {
  const pushes: { listId: number | null; items: GroceryItem[]; merge: boolean }[] = []
  const client: GroceryClient = {
    listLists: async () => [{ id: 1, name: 'Groceries' }],
    pushItems: async (listId, items, merge = true) => {
      if (opts.fail) throw new GroceryListError('GroceryList at http://web:5000 is unreachable')
      pushes.push({ listId, items, merge })
      return { added: items.length, merged: 0 }
    },
  }
  return { client, pushes }
}

async function setupWeek() {
  const s = await adminSetup()
  const { caller } = s
  const fajitas = await caller.recipes.create({
    title: 'Chicken fajitas', servings: 4,
    ingredients: [{ name: 'Chicken breast', qty: 1, unit: 'lb' }, { name: 'Bell peppers', qty: 2 }, { name: 'Rice', qty: 1, unit: 'cup' }, { name: 'Salt' }],
  })
  const lemon = await caller.recipes.create({
    title: 'Lemon chicken', servings: 4,
    ingredients: [{ name: 'chicken breasts', qty: 16, unit: 'oz' }, { name: 'Lemons', qty: 2 }],
  })
  await caller.plans.setDay({ date: '2026-10-05', meal: { date: '2026-10-05', kind: 'cook', recipeId: fajitas.id, servings: 8 } })
  await caller.plans.setDay({ date: '2026-10-06', meal: { date: '2026-10-06', kind: 'leftovers', title: 'Leftover fajitas' } })
  await caller.plans.setDay({ date: '2026-10-07', meal: { date: '2026-10-07', kind: 'cook', recipeId: lemon.id } })
  await caller.plans.setDay({ date: '2026-10-08', meal: { date: '2026-10-08', kind: 'cook', title: 'Takeout pizza' } })
  return { ...s, fajitas, lemon }
}

const pending = (items: { name: string; status: string; quantityText: string; note: string }[]) =>
  items.filter(i => i.status === 'pending').map(i => [i.name, i.quantityText, i.note])

describe('buildFromPlan', () => {
  test('combines, scales and annotates ingredients; skips staples', async () => {
    const { caller } = await setupWeek()
    await caller.staples.add({ name: 'Rice' })
    const res = await caller.shopping.buildFromPlan({ weekStart: '2026-10-05' })
    expect(res).toMatchObject({ added: 4, updated: 0, dropped: 0, recipesUsed: 2, mealsWithoutRecipe: ['Takeout pizza'] })
    expect(pending(await caller.shopping.list())).toEqual([
      ['Bell peppers', '4', 'for Chicken fajitas'],
      ['Chicken breast', '3 lb', 'for Chicken fajitas, Lemon chicken'], // 2 lb doubled for 8 servings + 1 lb
      ['Lemons', '2', 'for Lemon chicken'],
      ['Rice', '', ''], // the staple row, not the recipe's rice
      ['Salt', '', 'for Chicken fajitas'],
    ])
  })

  test('rebuilding updates in place and respects what you removed', async () => {
    const { caller, lemon } = await setupWeek()
    await caller.shopping.buildFromPlan({ weekStart: '2026-10-05' })
    const salt = (await caller.shopping.list()).find(i => i.name === 'Salt')!
    await caller.shopping.setStatus({ id: salt.id, status: 'removed' })

    // Lemon chicken moves off the plan.
    await caller.plans.setDay({ date: '2026-10-07', meal: null })
    const res = await caller.shopping.buildFromPlan({ weekStart: '2026-10-05' })
    expect(res).toMatchObject({ added: 0, updated: 4, dropped: 1 })
    const items = await caller.shopping.list()
    expect(items.find(i => i.name === 'Salt')?.status).toBe('removed')
    expect(items.find(i => i.name === 'Lemons')).toBeUndefined()
    expect(items.find(i => i.name === 'Chicken breast')?.quantityText).toBe('2 lb')
    void lemon
  })

  test('needs a plan', async () => {
    const { caller } = await adminSetup()
    await expect(caller.shopping.buildFromPlan({ weekStart: '2026-10-05' })).rejects.toThrow('no plan')
  })
})

describe('push to GroceryList', () => {
  test('sends pending items, closes the order and remembers the list', async () => {
    const { db, userId, caller: _ } = await setupWeek()
    const { client, pushes } = fakeGrocery()
    const caller = callerFor({ db, userId, grocery: client })
    await caller.staples.add({ name: 'Coffee' })
    await caller.shopping.buildFromPlan({ weekStart: '2026-10-05' })
    await caller.shopping.add({ name: 'Gallon freezer bags' })
    const coffee = (await caller.shopping.list()).find(i => i.name === 'Coffee')!
    await caller.shopping.setStatus({ id: coffee.id, status: 'have' })
    expect(await caller.shopping.pendingCount()).toBe(6)

    const res = await caller.shopping.push({ listId: 1, merge: true })
    expect(res).toEqual({ sent: 6, added: 6, merged: 0 })
    expect(pushes[0].listId).toBe(1)
    expect(pushes[0].items.find(i => i.name === 'Chicken breast')).toEqual({ name: 'Chicken breast', quantity: '3 lb', notes: 'for Chicken fajitas, Lemon chicken', section: 'now' })
    expect(pushes[0].items.find(i => i.name === 'Gallon freezer bags')).toEqual({ name: 'Gallon freezer bags', section: 'now' })

    // New order: staples come back (including the one marked "have"), everything else is gone.
    expect((await caller.shopping.list()).map(i => i.name)).toEqual(['Coffee'])
    expect((await caller.shopping.groceryStatus()).defaultListId).toBe(1)
    // Rebuilding after a push starts a fresh set of plan rows.
    expect((await caller.shopping.buildFromPlan({ weekStart: '2026-10-05' })).added).toBe(5)
  })

  test('a failed push leaves the order untouched', async () => {
    const { db, userId } = await setupWeek()
    const caller = callerFor({ db, userId, grocery: fakeGrocery({ fail: true }).client })
    await caller.shopping.add({ name: 'Milk' })
    await expect(caller.shopping.push({ listId: null, merge: true })).rejects.toThrow('unreachable')
    expect(await caller.shopping.pendingCount()).toBe(1)
  })

  test('not configured / empty order', async () => {
    const { db, userId } = await adminSetup()
    await expect(callerFor({ db, userId, grocery: null }).shopping.push({ listId: null, merge: true })).rejects.toThrow('not configured')
    expect((await callerFor({ db, userId, grocery: null }).shopping.groceryStatus()).configured).toBe(false)
    await expect(callerFor({ db, userId, grocery: fakeGrocery().client }).shopping.push({ listId: null, merge: true })).rejects.toThrow('order is empty')
  })

  test('groceryStatus reports lists or a readable error', async () => {
    const { db, userId } = await adminSetup()
    expect((await callerFor({ db, userId, grocery: fakeGrocery().client }).shopping.groceryStatus()).lists).toEqual([{ id: 1, name: 'Groceries' }])
    const broken: GroceryClient = { ...fakeGrocery().client, listLists: async () => { throw new GroceryListError('GroceryList rejected the token') } }
    expect((await callerFor({ db, userId, grocery: broken }).shopping.groceryStatus()).error).toBe('GroceryList rejected the token')
  })

  test('editing an item in the order', async () => {
    const { caller } = await adminSetup()
    const { id } = await caller.shopping.add({ name: 'Milk' })
    await caller.shopping.update({ id, name: 'Whole milk', quantityText: '1 gal', note: 'organic' })
    expect((await caller.shopping.list()).find(i => i.id === id)).toMatchObject({ name: 'Whole milk', quantityText: '1 gal', note: 'organic' })
  })
})
