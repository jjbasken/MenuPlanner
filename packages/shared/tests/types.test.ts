import { describe, expect, test } from 'bun:test'
import { MEAL_KINDS, SHOPPING_STATUSES } from '../src/index.js'

describe('shared enums', () => {
  test('meal kinds match the database CHECK constraint', () => {
    expect([...MEAL_KINDS]).toEqual(['cook', 'leftovers', 'flexible'])
  })
  test('shopping statuses', () => {
    expect([...SHOPPING_STATUSES]).toEqual(['pending', 'have', 'removed', 'pushed'])
  })
})
