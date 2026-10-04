import { useEffect, useState } from 'react'
import { todayISO } from '@menu/shared'

/** Today's date in the device's calendar, rolling over at midnight (the kitchen tablet stays open for days). */
export function useToday() {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const id = setInterval(() => setToday(t => (t === todayISO() ? t : todayISO())), 60_000)
    return () => clearInterval(id)
  }, [])
  return today
}
