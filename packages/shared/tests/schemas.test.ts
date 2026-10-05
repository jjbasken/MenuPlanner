import { describe, expect, test } from 'bun:test'
import { recipeInputSchema } from '../src/schemas.js'

describe('recipe source URLs', () => {
  test('allows web links but rejects executable and non-web schemes', () => {
    for (const url of ['https://example.com/recipe', 'http://example.com/recipe']) {
      expect(recipeInputSchema.safeParse({ title: 'Soup', sourceUrl: url }).success).toBe(true)
    }
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
      expect(recipeInputSchema.safeParse({ title: 'Soup', sourceUrl: url }).success).toBe(false)
    }
  })
})
