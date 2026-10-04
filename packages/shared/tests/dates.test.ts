import { describe, expect, test } from 'bun:test'
import {
  addDays, dayOfWeek, daysBetween, dowShort, isISODate, longDateLabel, nextDow, pushBack, toISODate, weekDates, weekStart,
} from '../src/dates.js'

describe('dates', () => {
  test('validation', () => {
    expect(isISODate('2026-10-04')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-1-4')).toBe(false)
  })

  test('arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02') // US DST ends Nov 1 2026
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09') // US DST starts Mar 8 2026
    expect(daysBetween('2026-10-04', '2026-10-11')).toBe(7)
  })

  test('weeks start on Monday', () => {
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // Sunday belongs to the week before
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
    expect(weekStart('2026-10-08')).toBe('2026-10-05')
    expect(weekDates('2026-10-05')).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ])
  })

  test('labels', () => {
    expect(dayOfWeek('2026-10-04')).toBe(0)
    expect(dowShort('2026-10-05')).toBe('MON')
    expect(longDateLabel('2026-10-04')).toBe('Sunday, Oct 4')
  })

  test('next occurrence of a weekday', () => {
    expect(nextDow('2026-10-04', 2)).toBe('2026-10-06') // next Tuesday
    expect(nextDow('2026-10-04', 0)).toBe('2026-10-04') // today counts
  })

  test('toISODate uses the local calendar', () => {
    expect(toISODate(new Date(2026, 9, 4, 23, 59))).toBe('2026-10-04')
  })
})

describe('pushBack', () => {
  const meals = [
    { id: 'sun', date: '2026-10-04' },
    { id: 'mon', date: '2026-10-05' },
    { id: 'tue', date: '2026-10-06' },
  ]

  test('slides tonight and everything after it', () => {
    expect(pushBack(meals, '2026-10-05', 1)).toEqual([
      { id: 'mon', date: '2026-10-06' },
      { id: 'tue', date: '2026-10-07' },
    ])
  })

  test('two days', () => {
    expect(pushBack(meals, '2026-10-04', 2).map(m => m.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08'])
  })
})

describe('formatMinutes', () => {
  test('reads naturally', async () => {
    const { formatMinutes } = await import('../src/dates.js')
    expect(formatMinutes(25)).toBe('25 min')
    expect(formatMinutes(60)).toBe('1 hr')
    expect(formatMinutes(495)).toBe('8 hr 15 min')
  })
})
