// Combining a week's recipe ingredients into one shopping list.
//
// Quantities in the same unit family (volume, mass) are converted to a common
// base and summed, so "1 tbsp olive oil" + "1/4 cup olive oil" becomes one line.
// Units that can't be converted (cans, cloves, bunches…) are summed per unit and
// listed side by side: "2 cans + 1 lb".

type Family = 'volume' | 'mass'

type UnitDef = { family: Family; toBase: number; system: 'imperial' | 'metric' }

const UNITS: Record<string, UnitDef> = {
  tsp: { family: 'volume', toBase: 4.92892, system: 'imperial' },
  tbsp: { family: 'volume', toBase: 14.7868, system: 'imperial' },
  'fl oz': { family: 'volume', toBase: 29.5735, system: 'imperial' },
  cup: { family: 'volume', toBase: 236.588, system: 'imperial' },
  pint: { family: 'volume', toBase: 473.176, system: 'imperial' },
  quart: { family: 'volume', toBase: 946.353, system: 'imperial' },
  gallon: { family: 'volume', toBase: 3785.41, system: 'imperial' },
  ml: { family: 'volume', toBase: 1, system: 'metric' },
  l: { family: 'volume', toBase: 1000, system: 'metric' },
  oz: { family: 'mass', toBase: 28.3495, system: 'imperial' },
  lb: { family: 'mass', toBase: 453.592, system: 'imperial' },
  g: { family: 'mass', toBase: 1, system: 'metric' },
  kg: { family: 'mass', toBase: 1000, system: 'metric' },
}

const UNIT_ALIASES: Record<string, string> = {
  t: 'tsp', tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  'fl oz': 'fl oz', 'fl. oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  c: 'cup', cup: 'cup', cups: 'cup',
  pt: 'pint', pint: 'pint', pints: 'pint',
  qt: 'quart', quart: 'quart', quarts: 'quart',
  gal: 'gallon', gallon: 'gallon', gallons: 'gallon',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  '': '', each: '', whole: '', ea: '',
}

/** Canonical form of a unit: known units map to their abbreviation, others are singularized. */
export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ')
  // Capital T conventionally means tablespoon; check before lowercasing loses it.
  if (unit.trim() === 'T') return 'tbsp'
  if (u in UNIT_ALIASES) return UNIT_ALIASES[u]
  return singularize(u)
}

// Words that look plural but aren't (or have no useful singular).
const UNCOUNTABLE = new Set(['molasses', 'asparagus', 'hummus', 'couscous', 'swiss', 'grits', 'series', 'species', 'cheese'])

/** Simple English singularization for the last word — good enough for groceries. */
export function singularize(word: string): string {
  const parts = word.split(' ')
  const last = parts.pop()!
  let s = last
  if (UNCOUNTABLE.has(last)) s = last
  else if (/[^aeiou]ies$/.test(last)) s = last.slice(0, -3) + 'y'
  else if (/(tomato|potato|mango)es$/.test(last)) s = last.slice(0, -2)
  else if (/(ch|sh|x|ss|z)es$/.test(last)) s = last.slice(0, -2)
  else if (/[^s]s$/.test(last) && !/(us|is|ss)$/.test(last)) s = last.slice(0, -1)
  return [...parts, s].join(' ')
}

/** Key used to decide whether two ingredient names are the same item. */
export function ingredientKey(name: string): string {
  return singularize(name.trim().toLowerCase().replace(/[.,;:!]+$/, '').replace(/\s+/g, ' '))
}

export type IngredientLine = {
  name: string
  qty: number | null
  unit: string
  /** Where this line came from, e.g. the meal title. Collected into `sources`. */
  source?: string
}

export type Quantity = { qty: number; unit: string }

export type AggregatedIngredient = {
  key: string
  /** The first spelling seen, so the list reads the way the recipes were written. */
  name: string
  quantities: Quantity[]
  /** True if any contributing line had no quantity ("salt to taste"). */
  hasUnquantified: boolean
  quantityText: string
  sources: string[]
}

export function aggregateIngredients(lines: IngredientLine[]): AggregatedIngredient[] {
  type Acc = {
    name: string
    family: Partial<Record<Family, { base: number; imperial: boolean }>>
    other: Map<string, number>
    hasUnquantified: boolean
    sources: string[]
  }
  const byKey = new Map<string, Acc>()

  for (const line of lines) {
    const key = ingredientKey(line.name)
    if (!key) continue
    let acc = byKey.get(key)
    if (!acc) {
      acc = { name: line.name.trim(), family: {}, other: new Map(), hasUnquantified: false, sources: [] }
      byKey.set(key, acc)
    }
    if (line.source && !acc.sources.includes(line.source)) acc.sources.push(line.source)

    if (line.qty == null || !Number.isFinite(line.qty) || line.qty <= 0) {
      acc.hasUnquantified = true
      continue
    }
    const unit = normalizeUnit(line.unit)
    const def = UNITS[unit]
    if (def) {
      const f = (acc.family[def.family] ??= { base: 0, imperial: false })
      f.base += line.qty * def.toBase
      f.imperial ||= def.system === 'imperial'
    } else {
      acc.other.set(unit, (acc.other.get(unit) ?? 0) + line.qty)
    }
  }

  return [...byKey.entries()].map(([key, acc]) => {
    const quantities: Quantity[] = []
    for (const family of ['mass', 'volume'] as const) {
      const f = acc.family[family]
      if (f) quantities.push(displayQuantity(family, f.base, f.imperial))
    }
    for (const [unit, qty] of acc.other) quantities.push({ qty, unit })
    return {
      key,
      name: acc.name,
      quantities,
      hasUnquantified: acc.hasUnquantified,
      quantityText: quantities.map(formatQuantity).join(' + '),
      sources: acc.sources,
    }
  })
}

/** Picks a readable unit for a summed base amount. Imperial wins if any input was imperial. */
function displayQuantity(family: Family, base: number, imperial: boolean): Quantity {
  if (family === 'mass') {
    if (imperial) return base >= UNITS.lb.toBase ? { qty: base / UNITS.lb.toBase, unit: 'lb' } : { qty: base / UNITS.oz.toBase, unit: 'oz' }
    return base >= 1000 ? { qty: base / 1000, unit: 'kg' } : { qty: base, unit: 'g' }
  }
  if (imperial) {
    const cups = base / UNITS.cup.toBase
    // 0.375 cup reads better as 6 tbsp; only use cups for amounts a measuring cup shows.
    if (cups >= 1 || (cups >= 0.25 - 0.001 && isNiceFraction(cups))) return { qty: cups, unit: 'cup' }
    if (base >= UNITS.tbsp.toBase - 0.01) return { qty: base / UNITS.tbsp.toBase, unit: 'tbsp' }
    return { qty: base / UNITS.tsp.toBase, unit: 'tsp' }
  }
  return base >= 1000 ? { qty: base / 1000, unit: 'l' } : { qty: base, unit: 'ml' }
}

const FRACTIONS: [number, string][] = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']]

function isNiceFraction(qty: number): boolean {
  const frac = qty - Math.floor(qty)
  return frac < 0.04 || frac > 0.96 || FRACTIONS.some(([v]) => Math.abs(frac - v) < 0.04)
}

const METRIC_UNITS = new Set(['g', 'kg', 'ml', 'l'])

/** "1½", "⅓", "2.5" — kitchen-friendly numbers. */
export function formatQty(qty: number): string {
  const whole = Math.floor(qty + 1e-9)
  const frac = qty - whole
  if (frac < 0.04) return String(whole)
  if (frac > 0.96) return String(whole + 1)
  const match = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.04)
  if (match) return whole ? `${whole}${match[1]}` : match[1]
  return String(Math.round(qty * 10) / 10)
}

const PLURALIZE_UNITS = new Set(['cup', 'pint', 'quart', 'gallon', 'can', 'clove', 'bunch', 'package', 'bag', 'jar', 'box', 'slice', 'head', 'sprig', 'stalk', 'bottle', 'piece', 'pinch', 'handful', 'stick', 'block', 'loaf'])

export function formatQuantity({ qty, unit }: Quantity): string {
  // Metric amounts read as decimals: 450 g, 1.1 kg — never "1⅛ kg".
  const n = METRIC_UNITS.has(unit)
    ? String(unit === 'g' || unit === 'ml' ? Math.round(qty) : Math.round(qty * 10) / 10)
    : formatQty(qty)
  if (!unit) return n
  let u = unit
  if (qty > 1 + 1e-9 && PLURALIZE_UNITS.has(unit)) u = /(ch|sh|x|s)$/.test(unit) ? `${unit}es` : `${unit}s`
  return `${n} ${u}`
}

/** Scales a recipe's quantity for a different number of servings. */
export function scaleQty(qty: number | null, recipeServings: number, servings: number | null | undefined): number | null {
  if (qty == null || !servings || !recipeServings) return qty
  return (qty * servings) / recipeServings
}
