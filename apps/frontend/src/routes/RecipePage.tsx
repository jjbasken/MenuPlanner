import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatMinutes, formatQuantity, scaleQty } from '@menu/shared'
import { AppShell } from '../components/AppShell.js'
import { PlanTabs } from '../components/PlanTabs.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'

export function RecipePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data: r, error } = trpc.recipes.get.useQuery({ id })
  const del = trpc.recipes.delete.useMutation({ onSuccess: () => { void utils.recipes.invalidate(); navigate('/plan/recipes') } })
  const [servings, setServings] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)

  if (error) return <AppShell title="Recipe"><PlanTabs /><p className="form-error">{errorMessage(error)}</p></AppShell>
  if (!r) return <AppShell title="Recipe"><PlanTabs /><p className="muted">Loading…</p></AppShell>
  const serves = servings ?? r.servings

  return (
    <AppShell title={r.title}>
      <PlanTabs />
      <div className="recipe-layout">
        <section className="card section">
          {r.description && <p className="recipe-desc">{r.description}</p>}
          <div className="recipe-facts">
            {r.prepMin != null && <span><strong>{formatMinutes(r.prepMin)}</strong> prep</span>}
            {r.cookMin != null && <span><strong>{formatMinutes(r.cookMin)}</strong> cook</span>}
            {r.rating && <span>{'★'.repeat(r.rating)}</span>}
            {r.kidFriendly && <span className="pill pill--leftovers">Kid-friendly</span>}
            {r.tags.map(t => <span key={t} className="pill pill--flexible">{t}</span>)}
          </div>
          <div className="servings">
            <span className="field-label">Servings</span>
            <button className="icon-btn stepper" aria-label="Fewer servings" onClick={() => setServings(Math.max(1, serves - 1))}>−</button>
            <span className="servings-n" aria-live="polite">{serves}</span>
            <button className="icon-btn stepper" aria-label="More servings" onClick={() => setServings(serves + 1)}>+</button>
          </div>
          <h2 className="subsection-title">Ingredients</h2>
          <ul className="ingredients">
            {r.ingredients.map(i => {
              const qty = scaleQty(i.qty, r.servings, serves)
              return (
                <li key={i.id}>
                  {qty != null && <strong>{formatQuantity({ qty, unit: i.unit })} </strong>}
                  {i.name}{i.note && <span className="muted">, {i.note}</span>}
                </li>
              )
            })}
          </ul>
          {r.prepAheadNotes && (<><h2 className="subsection-title">Prep ahead</h2><p className="prewrap">{r.prepAheadNotes}</p></>)}
        </section>
        <section className="card section">
          <h2 className="subsection-title">Instructions</h2>
          {r.instructions ? <div className="prewrap">{r.instructions}</div> : <p className="muted">No instructions yet.</p>}
          {r.sourceUrl && <p><a href={r.sourceUrl} target="_blank" rel="noreferrer noopener">Original recipe ↗</a></p>}
          <div className="btn-row">
            <Link className="btn" to={`/plan/recipes/${r.id}/edit`}>Edit</Link>
            {confirm
              ? <button className="btn btn-danger" onClick={() => del.mutate({ id: r.id })}>Really delete?</button>
              : <button className="btn btn-ghost" onClick={() => setConfirm(true)}>Delete</button>}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
