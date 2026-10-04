// Upper bounds for user-supplied strings and lists. Everything is written
// straight into SQLite, so an unbounded `z.string()` lets any caller fill the
// volume. The bounds cap abuse — they are not format checks.

export const MAX_ID = 64
export const MAX_NAME = 200
export const MAX_SHORT_TEXT = 500
export const MAX_LONG_TEXT = 20_000
export const MAX_URL = 2048
export const MAX_TAGS = 30
export const MAX_INGREDIENTS = 100
export const MAX_PLAN_MEALS = 31
export const MAX_PREP_TASKS = 60
