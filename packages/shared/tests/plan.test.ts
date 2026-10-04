import { describe, expect, test } from 'bun:test'
import { cookNightIndex, thawReminders } from '../src/plan.js'
import { planInputSchema, recipeInputSchema } from '../src/schemas.js'

const meals = [
  { id: 'a', date: '2026-10-06', kind: 'cook' as const },
  { id: 'b', date: '2026-10-07', kind: 'leftovers' as const },
  { id: 'c', date: '2026-10-08', kind: 'cook' as const },
  { id: 'd', date: '2026-10-10', kind: 'cook' as const },
]

describe('plan helpers', () => {
  test('numbers cook nights in date order', () => {
    const idx = cookNightIndex([...meals].reverse())
    expect(idx.get('a')).toEqual({ index: 1, total: 3 })
    expect(idx.get('d')).toEqual({ index: 3, total: 3 })
    expect(idx.has('b')).toBe(false)
  })

  test('thaw reminders land the night before, skipping used items', () => {
    const reminders = thawReminders(meals, [
      { id: 'f1', name: 'Chicken breast', amountText: 'about 2 lb', planMealId: 'a', usedAt: null },
      { id: 'f2', name: 'Ground turkey', amountText: '', planMealId: 'c', usedAt: null },
      { id: 'f3', name: 'Shrimp', amountText: '1 lb bag', planMealId: 'd', usedAt: Date.now() },
      { id: 'f4', name: 'Peas', amountText: '', planMealId: null, usedAt: null },
    ])
    expect(reminders.get('2026-10-05')).toEqual([{ freezerItemId: 'f1', text: 'Thaw tonight: the chicken breast (about 2 lb)', forMealId: 'a' }])
    expect(reminders.get('2026-10-07')?.[0].text).toBe('Thaw tonight: the ground turkey')
    expect(reminders.has('2026-10-09')).toBe(false)
  })
})

describe('schemas', () => {
  test('recipe defaults', () => {
    const r = recipeInputSchema.parse({ title: 'Chicken fajitas', ingredients: [{ name: 'Chicken breast', qty: 2, unit: 'lb' }] })
    expect(r.servings).toBe(4)
    expect(r.tags).toEqual([])
    expect(r.ingredients[0]).toEqual({ name: 'Chicken breast', qty: 2, unit: 'lb', note: '' })
  })

  test('plan meals need a recipe or a title', () => {
    expect(planInputSchema.safeParse({ meals: [{ date: '2026-10-06', kind: 'cook' }] }).success).toBe(false)
    expect(planInputSchema.safeParse({ meals: [{ date: '2026-10-06', kind: 'flexible', title: 'Eggs or leftovers' }] }).success).toBe(true)
  })

  test('rejects bad dates and kinds', () => {
    expect(planInputSchema.safeParse({ meals: [{ date: '2026-13-01', kind: 'cook', title: 'x' }] }).success).toBe(false)
    expect(planInputSchema.safeParse({ meals: [{ date: '2026-10-06', kind: 'brunch', title: 'x' }] }).success).toBe(false)
  })
})
