import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  addDays, dayOfMonth, dowShort, formatMinutes, MEAL_KINDS, shortDateLabel, weekDates, weekStart as weekStartOf,
  type ISODate, type MealKind,
} from '@menu/shared'
import { AppShell } from '../components/AppShell.js'
import { BottomSheet } from '../components/BottomSheet.js'
import { Icon } from '../components/Icon.js'
import { KindPill } from '../components/MealPills.js'
import { PlanTabs } from '../components/PlanTabs.js'
import { useToday } from '../hooks/useToday.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'
import type { RouterOutputs } from '../lib/types.js'

type Week = RouterOutputs['plans']['week']
type Meal = Week['meals'][number]

const KIND_LABELS: Record<MealKind, string> = { cook: 'Cook night', leftovers: 'Leftovers', flexible: 'Flexible' }

export function PlanPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const week = params.get('week') && weekStartOf(params.get('week')!) === params.get('week') ? params.get('week')! : weekStartOf(today)
  const setWeek = (w: ISODate) => setParams(w === weekStartOf(today) ? {} : { week: w }, { replace: true })
  const utils = trpc.useUtils()
  const { data, isLoading, error } = trpc.plans.week.useQuery({ weekStart: week })
  const setStatus = trpc.plans.setStatus.useMutation({ onSuccess: () => utils.plans.week.invalidate() })
  const [editing, setEditing] = useState<ISODate | null>(null)

  const cookTotal = data?.meals.filter(m => m.kind === 'cook').length ?? 0
  let cookIndex = 0

  return (
    <AppShell title="Plan">
      <PlanTabs />
      <div className="week-bar">
        <button className="icon-btn" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
          <Icon name="chevron" className="flip" />
        </button>
        <div className="week-label">
          <div className="eyebrow">{week === weekStartOf(today) ? 'This week' : week === addDays(weekStartOf(today), 7) ? 'Next week' : 'Week of'}</div>
          <div className="week-range">{shortDateLabel(week)} – {shortDateLabel(addDays(week, 6))}</div>
        </div>
        <button className="icon-btn" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><Icon name="chevron" /></button>
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="form-error">{errorMessage(error)}</p>}
      {data && (
        <div className="plan-grid">
          <section className="col" aria-label="Meals">
            <div className="plan-status">
              <span className={`pill ${data.plan?.status === 'final' ? 'pill--cook' : 'pill--flexible'}`}>{data.plan?.status === 'final' ? 'Final' : 'Draft'}</span>
              <span className="muted">{cookTotal} cook night{cookTotal === 1 ? '' : 's'}</span>
              {data.meals.length > 0 && (
                <button className="btn btn-small" disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ weekStart: week, status: data.plan?.status === 'final' ? 'draft' : 'final' })}>
                  {data.plan?.status === 'final' ? 'Back to draft' : 'Mark final'}
                </button>
              )}
            </div>
            <ol className="card day-list">
              {weekDates(week).map(date => {
                const meal = data.meals.find(m => m.date === date)
                if (meal?.kind === 'cook') cookIndex++
                return (
                  <li key={date}>
                    <button className={`day-row${date === today ? ' day-row--today' : ''}`} onClick={() => setEditing(date)}>
                      <div className="day-date">
                        <span className="day-dow">{dowShort(date)}</span>
                        <span className="day-num">{dayOfMonth(date)}</span>
                      </div>
                      <div className="day-main">
                        {meal ? (
                          <>
                            <div className={`day-title${meal.kind === 'cook' ? ' day-title--cook' : ''}`}>{meal.title}</div>
                            <KindPill kind={meal.kind} cook={meal.kind === 'cook' ? { index: cookIndex, total: cookTotal } : null} />
                            {(meal.sideNote || meal.totalMin || meal.freezer.length > 0) && (
                              <div className="day-meta">
                                {[meal.totalMin && formatMinutes(meal.totalMin), meal.sideNote, meal.freezer.length > 0 && `❄ ${meal.freezer.map(f => f.name).join(', ')}`].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="day-title muted"><Icon name="plus" size={16} /> Add a meal</div>
                        )}
                      </div>
                      <Icon name="chevron" size={18} className="day-chevron" />
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
          <PrepTasks week={week} tasks={data.prepTasks} />
        </div>
      )}
      {data && <DaySheet date={editing} week={data} onClose={() => setEditing(null)} />}
    </AppShell>
  )
}

function PrepTasks({ week, tasks }: { week: ISODate; tasks: Week['prepTasks'] }) {
  const utils = trpc.useUtils()
  const refresh = () => { void utils.plans.week.invalidate() }
  const add = trpc.plans.addPrepTask.useMutation({ onSuccess: refresh })
  const setDone = trpc.plans.setPrepDone.useMutation({ onSuccess: refresh })
  const del = trpc.plans.deletePrepTask.useMutation({ onSuccess: refresh })
  const days = [addDays(week, -1), ...weekDates(week)]
  const [form, setForm] = useState({ date: days[0], title: '', minutes: '' })
  const [error, setError] = useState<string | null>(null)
  const totalMin = tasks.filter(t => !t.done).reduce((n, t) => n + (t.minutes ?? 0), 0)

  return (
    <section className="col" aria-labelledby="prep-title">
      <h2 id="prep-title" className="col-title col-title--split">
        <span>Prep schedule</span>
        {totalMin > 0 && <span className="col-count">{totalMin} min left</span>}
      </h2>
      {tasks.length === 0 && <p className="muted">Batch-prep ahead of the week — marinate, chop, cook grains — so cook nights go quickly.</p>}
      {days.filter(d => tasks.some(t => t.date === d)).map(d => (
        <div key={d} className="prep-day">
          <div className="eyebrow">{shortDateLabel(d)}</div>
          <ul className="card list-card">
            {tasks.filter(t => t.date === d).map(t => (
              <li key={t.id} className="list-row">
                <label className="check prep-check">
                  <input type="checkbox" checked={t.done} onChange={e => setDone.mutate({ id: t.id, done: e.target.checked })} />
                  <span className={t.done ? 'done' : ''}>{t.title}{t.minutes ? <span className="list-qty"> · {t.minutes} min</span> : null}</span>
                </label>
                <button className="icon-btn" aria-label={`Delete ${t.title}`} onClick={() => del.mutate({ id: t.id })}><Icon name="close" /></button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form className="card section prep-form" onSubmit={async e => {
        e.preventDefault()
        setError(null)
        try {
          await add.mutateAsync({ weekStart: week, date: form.date, title: form.title.trim(), minutes: form.minutes ? Number(form.minutes) : null })
          setForm(f => ({ ...f, title: '', minutes: '' }))
        } catch (err) { setError(errorMessage(err)) }
      }}>
        <h3 className="subsection-title">Add a prep task</h3>
        <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Marinate the chicken" required aria-label="Task" />
        <div className="form-row">
          <select className="select" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} aria-label="Day">
            {days.map(d => <option key={d} value={d}>{shortDateLabel(d)}</option>)}
          </select>
          <input className="input input-narrow" value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value.replace(/\D/g, '') }))}
            inputMode="numeric" placeholder="min" aria-label="Minutes" />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={add.isPending}>Add task</button>
      </form>
    </section>
  )
}

function DaySheet({ date, week, onClose }: { date: ISODate | null; week: Week; onClose: () => void }) {
  const meal = date ? week.meals.find(m => m.date === date) : undefined
  return (
    <BottomSheet open={!!date} onClose={onClose} title={date ? shortDateLabel(date) : ''}>
      {date && <DayForm key={`${date}-${meal?.id ?? 'new'}`} date={date} meal={meal} week={week} onDone={onClose} />}
    </BottomSheet>
  )
}

function DayForm({ date, meal, week, onDone }: { date: ISODate; meal?: Meal; week: Week; onDone: () => void }) {
  const utils = trpc.useUtils()
  const { data: recipes = [] } = trpc.recipes.list.useQuery()
  const { data: freezer = [] } = trpc.freezer.list.useQuery()
  const setDay = trpc.plans.setDay.useMutation({
    onSuccess: () => { void utils.plans.week.invalidate(); void utils.tonight.get.invalidate(); void utils.freezer.list.invalidate() },
  })
  const cookDays = week.meals.filter(m => m.kind === 'cook' && m.date < date)
  const leftoverOfDate = meal?.leftoverOf ? week.meals.find(m => m.id === meal.leftoverOf)?.date ?? '' : ''
  const [form, setForm] = useState({
    kind: (meal?.kind ?? 'cook') as MealKind,
    recipeId: meal?.recipeId ?? '',
    title: meal && (!meal.recipeId || recipes.find(r => r.id === meal.recipeId)?.title !== meal.title) ? meal.title : '',
    leftoverOfDate,
    sideNote: meal?.sideNote ?? '',
    freezerItemIds: freezer.filter(f => meal && f.planMealId === meal.id).map(f => f.id),
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    let title = form.title.trim()
    if (form.kind === 'leftovers' && !title && form.leftoverOfDate) {
      const src = week.meals.find(m => m.date === form.leftoverOfDate)
      if (src) title = `Leftover ${src.title.charAt(0).toLowerCase()}${src.title.slice(1)}`
    }
    try {
      await setDay.mutateAsync({
        date,
        meal: {
          date,
          kind: form.kind,
          recipeId: form.kind === 'cook' && form.recipeId ? form.recipeId : null,
          title: title || undefined,
          leftoverOfDate: form.kind === 'leftovers' && form.leftoverOfDate ? form.leftoverOfDate : null,
          sideNote: form.sideNote.trim(),
          freezerItemIds: form.freezerItemIds,
        },
      })
      onDone()
    } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <form className="stack" onSubmit={save}>
      <div className="segmented" role="radiogroup" aria-label="Kind of night">
        {MEAL_KINDS.map(k => (
          <button key={k} type="button" role="radio" aria-checked={form.kind === k}
            className={`segment${form.kind === k ? ' segment--on' : ''}`} onClick={() => set('kind', k)}>{KIND_LABELS[k]}</button>
        ))}
      </div>

      {form.kind === 'cook' && (
        <label className="field">
          <span className="field-label">Recipe</span>
          <select className="select" value={form.recipeId} onChange={e => set('recipeId', e.target.value)}>
            <option value="">No recipe — just a title</option>
            {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          {recipes.length === 0 && <span className="field-hint">No recipes yet — <Link to="/plan/recipes/new">add one</Link>.</span>}
        </label>
      )}
      {form.kind === 'leftovers' && (
        <label className="field">
          <span className="field-label">Leftovers from</span>
          <select className="select" value={form.leftoverOfDate} onChange={e => set('leftoverOfDate', e.target.value)}>
            <option value="">Something else</option>
            {cookDays.map(m => <option key={m.id} value={m.date}>{shortDateLabel(m.date)} — {m.title}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label">{form.kind === 'cook' && form.recipeId ? 'Title (optional)' : 'Title'}</span>
        <input className="input" value={form.title} onChange={e => set('title', e.target.value)}
          placeholder={form.kind === 'flexible' ? 'Frittata, omelets, tuna salad, or leftovers' : form.kind === 'leftovers' ? 'Leftover fajitas' : 'Chicken fajitas'}
          required={!(form.kind === 'cook' && form.recipeId) && !(form.kind === 'leftovers' && form.leftoverOfDate)} />
      </label>
      <label className="field">
        <span className="field-label">Side note</span>
        <input className="input" value={form.sideNote} onChange={e => set('sideNote', e.target.value)} placeholder="Eggs for breakfast." />
      </label>
      {freezer.length > 0 && (
        <fieldset className="field fieldset">
          <legend className="field-label">Thaw from the freezer</legend>
          {freezer.map(f => (
            <label key={f.id} className="check">
              <input type="checkbox" checked={form.freezerItemIds.includes(f.id)}
                onChange={e => set('freezerItemIds', e.target.checked ? [...form.freezerItemIds, f.id] : form.freezerItemIds.filter(id => id !== f.id))} />
              <span>{f.name}{f.amountText ? `, ${f.amountText}` : ''}{f.planMealId && f.planMealId !== meal?.id ? <span className="muted"> (planned for another day)</span> : null}</span>
            </label>
          ))}
          <span className="field-hint">A "Thaw tonight" reminder shows the evening before.</span>
        </fieldset>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={setDay.isPending}>Save</button>
        {meal && (
          <button className="btn" type="button" disabled={setDay.isPending}
            onClick={async () => { try { await setDay.mutateAsync({ date, meal: null }); onDone() } catch (err) { setError(errorMessage(err)) } }}>
            Clear day
          </button>
        )}
      </div>
    </form>
  )
}
