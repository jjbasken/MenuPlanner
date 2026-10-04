// Upper bounds for user-supplied strings. Shared bounds (names, notes, lists)
// live in @menu/shared so the CLI and the API agree; these are auth-specific.
// On the unauthenticated login path an unbounded password would feed an
// arbitrarily large string to Argon2id.
export { MAX_ID, MAX_NAME, MAX_SHORT_TEXT, MAX_LONG_TEXT, MAX_URL } from '@menu/shared'

export const MAX_USERNAME = 40
export const MAX_DISPLAY_NAME = 60
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 256
export const MAX_BOOTSTRAP_TOKEN = 256
