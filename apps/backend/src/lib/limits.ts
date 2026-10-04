// Upper bounds for user-supplied strings and lists. Everything is written
// straight into SQLite, so an unbounded `z.string()` lets any caller fill the
// volume; on the unauthenticated login path it would also feed an arbitrarily
// large string to Argon2id. The bounds cap abuse — they are not format checks.

export const MAX_ID = 64
export const MAX_USERNAME = 40
export const MAX_DISPLAY_NAME = 60
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 256
export const MAX_BOOTSTRAP_TOKEN = 256

export const MAX_NAME = 200
export const MAX_SHORT_TEXT = 500
export const MAX_LONG_TEXT = 20_000
export const MAX_URL = 2048
