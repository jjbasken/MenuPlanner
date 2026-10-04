// Plan dates are plain 'YYYY-MM-DD' strings in the household's local calendar.
// They never pass through UTC, so a meal planned for Tuesday stays on Tuesday
// whatever time zone the server runs in. "Today" always comes from the client.

export type ISODate = string

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(s: string): boolean {
  if (!ISO_RE.test(s)) return false
  const d = parseISODate(s)
  return toISODate(d) === s
}

/** Local-midnight Date for an ISO date string. */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(now = new Date()): ISODate {
  return toISODate(now)
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(s: ISODate): number {
  return parseISODate(s).getDay()
}

/** The Monday on or before the given date — plans run Monday to Sunday. */
export function weekStart(s: ISODate): ISODate {
  const dow = dayOfWeek(s)
  return addDays(s, dow === 0 ? -6 : 1 - dow)
}

export function weekDates(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)
}

/** The first date on or after `from` that falls on the given weekday. */
export function nextDow(from: ISODate, dow: number): ISODate {
  return addDays(from, (dow - dayOfWeek(from) + 7) % 7)
}

export const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** "MON" */
export function dowShort(s: ISODate): string {
  return DOW_SHORT[dayOfWeek(s)]
}

/** "Sunday, Oct 4" */
export function longDateLabel(s: ISODate): string {
  return parseISODate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/** "Tue, Oct 6" */
export function shortDateLabel(s: ISODate): string {
  return parseISODate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Day of month, e.g. 5 for 2026-10-05. */
export function dayOfMonth(s: ISODate): number {
  return Number(s.slice(8, 10))
}

/**
 * "Not cooking tonight? Slide the plan later." Every meal on or after `from`
 * moves `days` later; earlier meals stay put. Returns only the meals that move.
 */
export function pushBack<T extends { id: string; date: ISODate }>(meals: T[], from: ISODate, days: number): { id: string; date: ISODate }[] {
  return meals.filter(m => m.date >= from).map(m => ({ id: m.id, date: addDays(m.date, days) }))
}

/** "25 min", "1 hr", "8 hr 15 min" */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
