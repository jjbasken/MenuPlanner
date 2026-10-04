import { describe, expect, test } from 'bun:test'
import { aggregateIngredients, formatQty, ingredientKey, normalizeUnit, parseQty, scaleQty, singularize } from '../src/ingredients.js'

const byName = (rows: ReturnType<typeof aggregateIngredients>, key: string) => rows.find(r => r.key === key)!

describe('normalization', () => {
  test('singularizes common grocery plurals', () => {
    expect(singularize('tomatoes')).toBe('tomato')
    expect(singularize('berries')).toBe('berry')
    expect(singularize('tortillas')).toBe('tortilla')
    expect(singularize('green onions')).toBe('green onion')
    expect(singularize('peaches')).toBe('peach')
    expect(singularize('hummus')).toBe('hummus')
    expect(singularize('molasses')).toBe('molasses')
    expect(singularize('asparagus')).toBe('asparagus')
  })

  test('ingredient keys ignore case, spacing, plurals and trailing punctuation', () => {
    expect(ingredientKey('  Yellow  Onions, ')).toBe(ingredientKey('yellow onion'))
  })

  test('unit aliases', () => {
    expect(normalizeUnit('Tablespoons')).toBe('tbsp')
    expect(normalizeUnit('T')).toBe('tbsp')
    expect(normalizeUnit('t')).toBe('tsp')
    expect(normalizeUnit('lbs.')).toBe('lb')
    expect(normalizeUnit('cans')).toBe('can')
    expect(normalizeUnit('cloves')).toBe('clove')
    expect(normalizeUnit('')).toBe('')
    expect(normalizeUnit('each')).toBe('')
  })
})

describe('aggregateIngredients', () => {
  test('sums the same item across meals and remembers which meals need it', () => {
    const rows = aggregateIngredients([
      { name: 'Chicken breast', qty: 1, unit: 'lb', source: 'Fajitas' },
      { name: 'chicken breasts', qty: 16, unit: 'oz', source: 'Lemon chicken' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Chicken breast')
    expect(rows[0].quantityText).toBe('2 lb')
    expect(rows[0].sources).toEqual(['Fajitas', 'Lemon chicken'])
  })

  test('converts volumes and picks a readable unit', () => {
    const rows = aggregateIngredients([
      { name: 'olive oil', qty: 2, unit: 'tbsp' },
      { name: 'olive oil', qty: 0.25, unit: 'cup' },
    ])
    expect(rows[0].quantityText).toBe('6 tbsp')
  })

  test('clean cup amounts stay in cups', () => {
    expect(aggregateIngredients([{ name: 'milk', qty: 1, unit: 'cup' }, { name: 'milk', qty: 8, unit: 'tbsp' }])[0].quantityText).toBe('1½ cups')
    expect(aggregateIngredients([{ name: 'flour', qty: 0.5, unit: 'cup' }])[0].quantityText).toBe('½ cup')
  })

  test('small volumes stay in spoons', () => {
    expect(aggregateIngredients([{ name: 'cumin', qty: 1, unit: 'tsp' }, { name: 'cumin', qty: 2, unit: 'tsp' }])[0].quantityText).toBe('1 tbsp')
    expect(aggregateIngredients([{ name: 'salt', qty: 0.5, unit: 'tsp' }])[0].quantityText).toBe('½ tsp')
  })

  test('metric-only inputs stay metric', () => {
    const rows = aggregateIngredients([
      { name: 'rice', qty: 600, unit: 'g' },
      { name: 'rice', qty: 0.5, unit: 'kg' },
    ])
    expect(rows[0].quantityText).toBe('1.1 kg')
    expect(aggregateIngredients([{ name: 'feta', qty: 200, unit: 'g' }])[0].quantityText).toBe('200 g')
  })

  test('mixing metric into imperial reports imperial', () => {
    const rows = aggregateIngredients([
      { name: 'ground turkey', qty: 1, unit: 'lb' },
      { name: 'ground turkey', qty: 227, unit: 'g' },
    ])
    expect(rows[0].quantityText).toBe('1½ lb')
  })

  test('non-convertible units are summed per unit and listed side by side', () => {
    const rows = aggregateIngredients([
      { name: 'black beans', qty: 1, unit: 'can' },
      { name: 'black beans', qty: 1, unit: 'cans' },
      { name: 'black beans', qty: 8, unit: 'oz' },
    ])
    expect(rows[0].quantityText).toBe('8 oz + 2 cans')
  })

  test('counts without a unit', () => {
    const rows = aggregateIngredients([
      { name: 'eggs', qty: 6, unit: '' },
      { name: 'egg', qty: 2, unit: 'each' },
    ])
    expect(rows[0].quantityText).toBe('8')
  })

  test('unquantified lines are flagged but do not add a number', () => {
    const rows = aggregateIngredients([
      { name: 'salt', qty: null, unit: '' },
      { name: 'Limes', qty: 2, unit: '' },
      { name: 'lime', qty: null, unit: '' },
    ])
    expect(byName(rows, 'salt')).toMatchObject({ quantityText: '', hasUnquantified: true })
    expect(byName(rows, 'lime')).toMatchObject({ quantityText: '2', hasUnquantified: true })
  })

  test('mass and volume of the same item are both kept', () => {
    const rows = aggregateIngredients([
      { name: 'cheddar', qty: 8, unit: 'oz' },
      { name: 'cheddar', qty: 1, unit: 'cup' },
    ])
    expect(rows[0].quantityText).toBe('8 oz + 1 cup')
  })

  test('skips blank names', () => {
    expect(aggregateIngredients([{ name: '  ', qty: 1, unit: '' }])).toEqual([])
  })
})

describe('formatting', () => {
  test('kitchen fractions', () => {
    expect(formatQty(1.5)).toBe('1½')
    expect(formatQty(0.333)).toBe('⅓')
    expect(formatQty(2)).toBe('2')
    expect(formatQty(1.98)).toBe('2')
    expect(formatQty(2.4)).toBe('2.4')
  })

  test('scales by servings', () => {
    expect(scaleQty(2, 4, 6)).toBe(3)
    expect(scaleQty(2, 4, null)).toBe(2)
    expect(scaleQty(null, 4, 6)).toBeNull()
  })
})

describe('parseQty', () => {
  test('accepts what people type', () => {
    expect(parseQty('2')).toBe(2)
    expect(parseQty(' 1.5 ')).toBe(1.5)
    expect(parseQty('1/2')).toBe(0.5)
    expect(parseQty('1 1/2')).toBe(1.5)
    expect(parseQty('1½')).toBe(1.5)
    expect(parseQty('½')).toBe(0.5)
    expect(parseQty('')).toBeNull()
  })
  test('rejects nonsense', () => {
    expect(parseQty('a few')).toBeNaN()
    expect(parseQty('1/0')).toBeNaN()
  })
})
