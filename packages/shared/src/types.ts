/** What a day in the plan is: a fresh cook, eating up leftovers, or a loose "whatever's easy" night. */
export const MEAL_KINDS = ['cook', 'leftovers', 'flexible'] as const
export type MealKind = (typeof MEAL_KINDS)[number]

export const PLAN_STATUSES = ['draft', 'final'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const SHOPPING_SOURCES = ['manual', 'plan', 'staple'] as const
export type ShoppingSource = (typeof SHOPPING_SOURCES)[number]

export const SHOPPING_STATUSES = ['pending', 'have', 'removed', 'pushed'] as const
export type ShoppingStatus = (typeof SHOPPING_STATUSES)[number]

export const VERDICTS = ['up', 'meh', 'down'] as const
export type Verdict = (typeof VERDICTS)[number]
