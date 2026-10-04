// Fills an empty database with a believable week so the UI can be tried out:
//   DATABASE_URL=./dev.sqlite bun run seed:demo
// Dates are relative to today. Refuses to touch a database that already has plans.
import { randomUUID } from 'crypto'
import { addDays, planInputSchema, todayISO, weekStart, type PlanMealInput } from '@menu/shared'
import { db } from '../src/db/index.js'
import { migrate } from '../src/db/migrate.js'
import { familyMembers, freezerItems, mealPlans, prepTasks, recipeIngredients, recipes, shoppingItems, staples } from '../src/db/schema.js'
import { savePlan } from '../src/services/plans.js'

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to the SQLite file to seed.')
  process.exit(1)
}
migrate(db)
if (db.select({ id: mealPlans.id }).from(mealPlans).get()) {
  console.error('This database already has plans — not seeding.')
  process.exit(1)
}

const now = Date.now()
const today = todayISO()

function recipe(title: string, servings: number, ingredients: [string, number | null, string][], extra: Partial<typeof recipes.$inferInsert> = {}) {
  const id = randomUUID()
  db.insert(recipes).values({ id, title, servings, kidFriendly: true, createdAt: now, updatedAt: now, ...extra }).run()
  ingredients.forEach(([name, qty, unit], sort) => {
    db.insert(recipeIngredients).values({ id: randomUUID(), recipeId: id, name, qty, unit, sort }).run()
  })
  return id
}

const lemonChicken = recipe('Lemon-herb chicken', 5, [['Chicken thighs', 2.5, 'lb'], ['Lemons', 2, ''], ['Olive oil', 3, 'tbsp'], ['Garlic', 4, 'cloves'], ['Rice', 2, 'cup']], { cookMin: 40 })
const fajitas = recipe('Chicken fajitas', 5, [['Chicken breast', 2, 'lb'], ['Bell peppers', 3, ''], ['Yellow onion', 1, ''], ['Flour tortillas', 1, 'package'], ['Sour cream', 8, 'oz'], ['Olive oil', 2, 'tbsp']], {
  prepMin: 10, cookMin: 25, tags: 'mexican,quick,sheet-pan', rating: 5,
  description: 'Sheet-pan fajitas — the kids build their own.',
  instructions: '1. Heat the oven to 425°F.\n2. Slice the chicken, peppers and onion; toss with oil and fajita seasoning.\n3. Roast on a sheet pan for 20–25 minutes, stirring once.\n4. Serve with warm tortillas and sour cream.',
  prepAheadNotes: 'Slice the peppers and onion up to two days ahead.',
})
const eggRoll = recipe('Turkey egg roll in a bowl', 5, [['Ground turkey', 1.5, 'lb'], ['Coleslaw mix', 2, 'bag'], ['Soy sauce', 0.25, 'cup'], ['Green onions', 1, 'bunch'], ['Rice', 2, 'cup']], { cookMin: 20 })
const stirFry = recipe('Shrimp stir-fry or baked salmon', 5, [['Frozen shrimp', 1, 'lb'], ['Broccoli', 2, 'head'], ['Soy sauce', 2, 'tbsp'], ['Rice', 1.5, 'cup']], { cookMin: 25 })

const meals: (PlanMealInput & { offset: number })[] = [
  { offset: -1, date: '', kind: 'cook', recipeId: lemonChicken },
  { offset: 0, date: '', kind: 'leftovers', title: 'Leftover lemon-herb chicken', sideNote: 'Eggs for breakfast.' },
  { offset: 1, date: '', kind: 'flexible', title: 'Frittata, omelets, tuna salad, or leftovers' },
  { offset: 2, date: '', kind: 'cook', recipeId: fajitas },
  { offset: 3, date: '', kind: 'leftovers', title: 'Leftover fajitas' },
  { offset: 4, date: '', kind: 'cook', recipeId: eggRoll },
  { offset: 5, date: '', kind: 'leftovers', title: 'Leftover egg roll bowls' },
  { offset: 6, date: '', kind: 'cook', recipeId: stirFry },
  { offset: 7, date: '', kind: 'flexible', title: 'Eggs, tuna salad, or leftovers' },
]
for (const m of meals) m.date = addDays(today, m.offset)
for (const m of meals) if (m.kind === 'leftovers' && m.offset > 0) m.leftoverOfDate = addDays(today, m.offset - 1)

const byWeek = new Map<string, PlanMealInput[]>()
for (const { offset: _, ...m } of meals) {
  const wk = weekStart(m.date)
  byWeek.set(wk, [...(byWeek.get(wk) ?? []), m])
}
const mealIdByDate = new Map<string, string>()
for (const [wk, weekMeals] of byWeek) {
  const res = savePlan(db, wk, planInputSchema.parse({ status: 'final', meals: weekMeals }))
  weekMeals.forEach((m, i) => mealIdByDate.set(m.date, res.mealIds[i]))
}

const freezer: [string, string, number, boolean][] = [
  ['Chicken breast', 'about 2 lb', 2, false],
  ['Ground turkey', 'about 1.5 lb', 4, false],
  ['Salmon fillets', 'about 1.5 lb', 6, false],
  ['Frozen shrimp', '1 lb bag', 6, true],
]
for (const [name, amountText, offset, isBackup] of freezer) {
  db.insert(freezerItems).values({ id: randomUUID(), name, amountText, isBackup, planMealId: mealIdByDate.get(addDays(today, offset)) ?? null, addedAt: now }).run()
}

const family: [string, boolean, string, string, string][] = [
  ['Mom', false, 'salmon, anything spicy', '', ''],
  ['Dad', false, 'tacos, stir-fry', 'olives', ''],
  ['Ava', true, 'noodles, tacos', 'mushrooms', ''],
  ['Leo', true, 'chicken, rice', 'spicy food', 'tree nuts'],
  ['June', true, 'eggs, fruit', 'onions', ''],
]
family.forEach(([name, isKid, likes, dislikes, allergies], sort) => {
  db.insert(familyMembers).values({ id: randomUUID(), name, isKid, likes, dislikes, allergies, sort, createdAt: now }).run()
})

const nextWeek = weekStart(addDays(today, 1))
const prepPlan = db.select().from(mealPlans).all().find(p => p.weekStart === nextWeek)
if (prepPlan) {
  const prep: [string, string, number][] = [
    [addDays(nextWeek, -1), 'Slice peppers and onions for fajitas', 15],
    [addDays(nextWeek, -1), 'Cook a big batch of rice', 25],
    [addDays(nextWeek, 2), 'Shred cabbage for egg roll bowls', 10],
  ]
  prep.forEach(([date, title, minutes], sort) => {
    db.insert(prepTasks).values({ id: randomUUID(), planId: prepPlan.id, date, title, minutes, sort }).run()
  })
}

for (const name of ['Rice', 'Protein shakes']) {
  db.insert(staples).values({ id: randomUUID(), name, inEveryOrder: true, createdAt: now }).run()
}
for (const name of ['Gallon freezer bags', 'Olive oil, preferably the terra delyssa drizzle bottle']) {
  db.insert(shoppingItems).values({ id: randomUUID(), name, source: 'manual', createdAt: now }).run()
}

console.log(`Seeded ${meals.length} meals across ${byWeek.size} week(s), 4 recipes, ${family.length} family members, ${freezer.length} freezer items, prep tasks and 2 staples.`)
