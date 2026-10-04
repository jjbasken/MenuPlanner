import { useState } from 'react'
import { addDays, dayOfMonth, dowShort, shortDateLabel, type ISODate } from '@menu/shared'
import type { RouterOutputs } from '../lib/types.js'
import { AppShell } from '../components/AppShell.js'
import { BottomSheet } from '../components/BottomSheet.js'
import { Icon } from '../components/Icon.js'
import { KindPill } from '../components/MealPills.js'
import { useToday } from '../hooks/useToday.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'

type Tonight = RouterOutputs['tonight']['get']
type Meal = NonNullable<Tonight['tonight']>
type OrderItem = Tonight['nextOrder'][number]
type FreezerItem = Tonight['freezer'][number]

/**
 * Mutations that edit the Tonight view patch the cached query immediately and
 * roll back if the server refuses, so taps feel instant on a slow connection.
 */
function useOptimisticTonight(today: ISODate) {
  const utils = trpc.useUtils()
  const key = { today }
  return {
    async patch(fn: (t: Tonight) => Tonight) {
      await utils.tonight.get.cancel(key)
      const prev = utils.tonight.get.getData(key)
      if (prev) utils.tonight.get.setData(key, fn(prev))
      return { prev }
    },
    rollback(ctx: { prev?: Tonight } | undefined) {
      if (ctx?.prev) utils.tonight.get.setData(key, ctx.prev)
    },
    refresh: () => { void utils.tonight.get.invalidate(key); void utils.shopping.invalidate() },
  }
}

export function TonightPage({ kiosk = false }: { kiosk?: boolean }) {
  const today = useToday()
  const { data, isLoading, error } = trpc.tonight.get.useQuery({ today }, { refetchInterval: kiosk ? 60_000 : 5 * 60_000 })
  const [openMeal, setOpenMeal] = useState<Meal | null>(null)

  return (
    <AppShell title="Tonight" kiosk={kiosk}>
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="form-error">{errorMessage(error)}</p>}
      {data && (
        <div className="tonight-grid">
          <div className="col col-tonight">
            <TonightCard data={data} onOpen={setOpenMeal} />
            <PushBack today={today} hasMeals={!!data.tonight || data.comingUp.some(d => d.meal)} />
          </div>
          <section className="col col-coming" aria-labelledby="coming-up">
            <h2 id="coming-up" className="col-title">Coming up</h2>
            <ComingUp days={data.comingUp} onOpen={setOpenMeal} />
          </section>
          <div className="col col-order">
            <NextOrder today={today} items={data.nextOrder} />
            <Freezer today={today} items={data.freezer} meals={data.comingUp} />
            <p className="cadence">
              Next plan: draft {shortDateLabel(data.cadence.draft)} · list {shortDateLabel(data.cadence.list)} · pickup {shortDateLabel(data.cadence.pickup)}
            </p>
          </div>
        </div>
      )}
      <MealSheet meal={openMeal} today={today} onClose={() => setOpenMeal(null)} />
    </AppShell>
  )
}

function TonightCard({ data, onOpen }: { data: Tonight; onOpen: (m: Meal) => void }) {
  const meal = data.tonight
  if (!meal) {
    return (
      <div className="card tonight-card tonight-card--empty">
        <h2 className="tonight-title">Nothing planned</h2>
        <p className="muted">There's no meal on the plan for tonight.</p>
        <ThawList items={data.tonightThaw} />
      </div>
    )
  }
  return (
    <button className="card tonight-card" onClick={() => onOpen(meal)}>
      <KindPill kind={meal.kind} cook={meal.cook} />
      <h2 className="tonight-title">{meal.title}</h2>
      {meal.sideNote && <p className="tonight-side">{meal.sideNote}</p>}
      <ThawList items={data.tonightThaw} />
      <p className="tonight-hint">Tap for notes, rating, or to move it</p>
    </button>
  )
}

function ThawList({ items }: { items: { freezerItemId: string; text: string }[] }) {
  if (!items.length) return null
  return (
    <ul className="thaw-list">
      {items.map(t => (
        <li key={t.freezerItemId} className="thaw"><Icon name="snowflake" size={16} /> <span>{t.text}</span></li>
      ))}
    </ul>
  )
}

function PushBack({ today, hasMeals }: { today: ISODate; hasMeals: boolean }) {
  const opt = useOptimisticTonight(today)
  const pushBack = trpc.plans.pushBack.useMutation({
    onMutate: ({ days }) => opt.patch(t => {
      // Shift every planned day (tonight included) `days` later; the fetch fills in exact detail.
      const all = [{ date: today, meal: t.tonight }, ...t.comingUp.map(d => ({ date: d.date, meal: d.meal }))]
      const byDate = new Map(all.map(d => [addDays(d.date, days), d.meal]))
      return {
        ...t,
        tonight: null,
        comingUp: t.comingUp.map(d => ({ ...d, meal: byDate.get(d.date) ? { ...byDate.get(d.date)!, date: d.date } : null })),
      }
    }),
    onError: (_e, _v, ctx) => opt.rollback(ctx),
    onSettled: opt.refresh,
  })
  if (!hasMeals) return null
  return (
    <div className="pushback">
      <p className="muted">Not cooking tonight? Slide the plan later.</p>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={pushBack.isPending} onClick={() => pushBack.mutate({ from: today, days: 1 })}>Push back 1 day</button>
        <button className="btn" disabled={pushBack.isPending} onClick={() => pushBack.mutate({ from: today, days: 2 })}>2 days</button>
      </div>
    </div>
  )
}

function ComingUp({ days, onOpen }: { days: Tonight['comingUp']; onOpen: (m: Meal) => void }) {
  return (
    <ol className="card day-list">
      {days.map(d => {
        const body = (
          <>
            <div className="day-date" aria-label={shortDateLabel(d.date)}>
              <span className="day-dow">{dowShort(d.date)}</span>
              <span className="day-num">{dayOfMonth(d.date)}</span>
            </div>
            <div className="day-main">
              {d.meal ? (
                <>
                  <div className={`day-title${d.meal.kind === 'cook' ? ' day-title--cook' : ''}`}>{d.meal.title}</div>
                  <KindPill kind={d.meal.kind} cook={d.meal.cook} />
                </>
              ) : (
                <div className="day-title muted">Nothing planned</div>
              )}
              <ThawList items={d.thaw} />
            </div>
            {d.meal && <Icon name="chevron" size={18} className="day-chevron" />}
          </>
        )
        return (
          <li key={d.date}>
            {d.meal
              ? <button className="day-row" onClick={() => onOpen(d.meal!)}>{body}</button>
              : <div className="day-row">{body}</div>}
          </li>
        )
      })}
    </ol>
  )
}

function Collapsible({ id, title, count, countLabel, children }: { id: string; title: string; count: number; countLabel: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`collapsible${open ? ' is-open' : ''}`} aria-labelledby={id}>
      <h2 className="col-title col-title--split" id={id}>
        <button className="collapse-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span>{title}</span>
          <Icon name="chevron" size={18} className="collapse-chevron" />
        </button>
        <span className="col-count">{count} {countLabel}</span>
      </h2>
      <div className="collapsible-body">{children}</div>
    </section>
  )
}

function NextOrder({ today, items }: { today: ISODate; items: OrderItem[] }) {
  const opt = useOptimisticTonight(today)
  const [name, setName] = useState('')
  const add = trpc.shopping.add.useMutation({
    onMutate: input => opt.patch(t => ({
      ...t,
      nextOrder: [...t.nextOrder.filter(i => i.source !== 'staple'), { id: `tmp-${Date.now()}`, name: input.name, quantityText: '', note: '', source: 'manual' as const }, ...t.nextOrder.filter(i => i.source === 'staple')],
    })),
    onError: (_e, _v, ctx) => opt.rollback(ctx),
    onSettled: opt.refresh,
  })
  const setStatus = trpc.shopping.setStatus.useMutation({
    onMutate: ({ id }) => opt.patch(t => ({ ...t, nextOrder: t.nextOrder.filter(i => i.id !== id) })),
    onError: (_e, _v, ctx) => opt.rollback(ctx),
    onSettled: opt.refresh,
  })

  return (
    <Collapsible id="next-order" title="Next order" count={items.length} countLabel={items.length === 1 ? 'item' : 'items'}>
      <form className="add-row" onSubmit={e => {
        e.preventDefault()
        const n = name.trim()
        if (!n) return
        add.mutate({ name: n })
        setName('')
      }}>
        <input className="input" placeholder="Add an item" value={name} onChange={e => setName(e.target.value)}
          enterKeyHint="done" aria-label="Add an item to the next order" />
        <button className="btn btn-primary" type="submit">Add</button>
      </form>
      {items.length > 0 && (
        <ul className="card list-card">
          {items.map(i => (
            <li key={i.id} className="list-row">
              <div className="list-main">
                <span>{i.name}</span>
                {i.quantityText && <span className="list-qty"> · {i.quantityText}</span>}
                {i.source === 'staple' && <span className="tag"> · Staple</span>}
              </div>
              {i.source === 'staple'
                ? <button className="btn btn-small" onClick={() => setStatus.mutate({ id: i.id, status: 'have' })}>Have it</button>
                : <button className="icon-btn" aria-label={`Remove ${i.name}`} onClick={() => setStatus.mutate({ id: i.id, status: 'removed' })}><Icon name="close" /></button>}
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  )
}

function Freezer({ today, items, meals }: { today: ISODate; items: FreezerItem[]; meals: Tonight['comingUp'] }) {
  const opt = useOptimisticTonight(today)
  const [adding, setAdding] = useState(false)
  const setUsed = trpc.freezer.setUsed.useMutation({
    onMutate: ({ id }) => opt.patch(t => ({
      ...t,
      freezer: t.freezer.filter(f => f.id !== id),
      tonightThaw: t.tonightThaw.filter(r => r.freezerItemId !== id),
      comingUp: t.comingUp.map(d => ({ ...d, thaw: d.thaw.filter(r => r.freezerItemId !== id) })),
    })),
    onError: (_e, _v, ctx) => opt.rollback(ctx),
    onSettled: opt.refresh,
  })

  return (
    <Collapsible id="freezer" title="In the freezer" count={items.length} countLabel={items.length === 1 ? 'item' : 'items'}>
      {items.length > 0 && (
        <ul className="card list-card">
          {items.map(f => (
            <li key={f.id} className="list-row">
              <div className="list-main">
                <span>{f.name}{f.amountText ? `, ${f.amountText}` : ''}</span>
                {(f.meal || f.isBackup) && (
                  <span className="tag"> · {[f.meal && `${dowShort(f.meal.date)} ${f.meal.title}`, f.isBackup && 'or a backup'].filter(Boolean).join(', ')}</span>
                )}
              </div>
              <button className="btn btn-small" onClick={() => setUsed.mutate({ id: f.id, used: true })}>Used</button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-ghost add-link" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add to freezer</button>
      <FreezerSheet open={adding} onClose={() => setAdding(false)} meals={meals} today={today} />
    </Collapsible>
  )
}

function FreezerSheet({ open, onClose, meals, today }: { open: boolean; onClose: () => void; meals: Tonight['comingUp']; today: ISODate }) {
  const opt = useOptimisticTonight(today)
  const [form, setForm] = useState({ name: '', amountText: '', planMealId: '', isBackup: false })
  const [error, setError] = useState<string | null>(null)
  const add = trpc.freezer.add.useMutation({ onSettled: opt.refresh })
  return (
    <BottomSheet open={open} onClose={onClose} title="Add to the freezer">
      <form className="stack" onSubmit={async e => {
        e.preventDefault()
        setError(null)
        try {
          await add.mutateAsync({ ...form, planMealId: form.planMealId || null })
          setForm({ name: '', amountText: '', planMealId: '', isBackup: false })
          onClose()
        } catch (err) {
          setError(errorMessage(err))
        }
      }}>
        <label className="field">
          <span className="field-label">What is it?</span>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Chicken breast" required />
        </label>
        <label className="field">
          <span className="field-label">How much</span>
          <input className="input" value={form.amountText} onChange={e => setForm(f => ({ ...f, amountText: e.target.value }))} placeholder="about 2 lb" />
        </label>
        <label className="field">
          <span className="field-label">For which meal?</span>
          <select className="select" value={form.planMealId} onChange={e => setForm(f => ({ ...f, planMealId: e.target.value }))}>
            <option value="">Not planned yet</option>
            {meals.filter(d => d.meal).map(d => (
              <option key={d.meal!.id} value={d.meal!.id}>{shortDateLabel(d.date)} — {d.meal!.title}</option>
            ))}
          </select>
          <span className="field-hint">You'll get a "Thaw tonight" reminder the evening before.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.isBackup} onChange={e => setForm(f => ({ ...f, isBackup: e.target.checked }))} />
          <span>Keep as a backup meal</span>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={add.isPending}>Add</button>
      </form>
    </BottomSheet>
  )
}

function MealSheet({ meal, today, onClose }: { meal: Meal | null; today: ISODate; onClose: () => void }) {
  const opt = useOptimisticTonight(today)
  const update = trpc.plans.updateMeal.useMutation({ onSettled: opt.refresh })
  const move = trpc.plans.moveMeal.useMutation({ onSettled: opt.refresh })
  // Local edits shown immediately; null/undefined means "as loaded".
  const [notes, setNotes] = useState<string | null>(null)
  const [savedNotes, setSavedNotes] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const close = () => { setNotes(null); setSavedNotes(null); setRating(undefined); setError(null); onClose() }
  const currentRating = rating === undefined ? meal?.rating ?? null : rating
  const currentNotes = savedNotes ?? meal?.notes ?? ''

  return (
    <BottomSheet open={!!meal} onClose={close} title={meal?.title ?? ''}>
      {meal && (
        <div className="stack">
          <div className="meal-sheet-meta">
            <KindPill kind={meal.kind} cook={meal.cook} />
            <span className="muted">{shortDateLabel(meal.date)}</span>
          </div>
          {meal.sideNote && <p className="muted">{meal.sideNote}</p>}

          <div className="field">
            <span className="field-label">Rating</span>
            <div className="stars" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} role="radio" aria-checked={currentRating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  className={`star${(currentRating ?? 0) >= n ? ' star--on' : ''}`}
                  onClick={() => {
                    const next = currentRating === n ? null : n
                    setRating(next)
                    update.mutate({ mealId: meal.id, rating: next }, { onError: err => { setRating(undefined); setError(errorMessage(err)) } })
                  }}>
                  <Icon name="feedback" size={28} />
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">Notes</span>
            <textarea className="textarea" value={notes ?? currentNotes} onChange={e => setNotes(e.target.value)}
              placeholder="Doubled the sauce — kids wanted more." />
          </label>
          {notes !== null && notes !== currentNotes && (
            <button className="btn" disabled={update.isPending} onClick={async () => {
              try {
                await update.mutateAsync({ mealId: meal.id, notes })
                setSavedNotes(notes)
                setNotes(null)
              } catch (err) { setError(errorMessage(err)) }
            }}>Save notes</button>
          )}

          <div className="field">
            <span className="field-label">Move to another day</span>
            <div className="chip-row">
              {Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter(d => d !== meal.date).map(d => (
                <button key={d} className="chip" disabled={move.isPending} onClick={async () => {
                  try { await move.mutateAsync({ mealId: meal.id, toDate: d }); close() } catch (err) { setError(errorMessage(err)) }
                }}>{i18nDay(d, today)}</button>
              ))}
            </div>
            <span className="field-hint">If another meal is planned that day, the two swap.</span>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
      )}
    </BottomSheet>
  )
}

function i18nDay(d: ISODate, today: ISODate) {
  if (d === today) return 'Tonight'
  if (d === addDays(today, 1)) return 'Tomorrow'
  return `${dowShort(d).charAt(0)}${dowShort(d).slice(1).toLowerCase()} ${dayOfMonth(d)}`
}
