import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatQty, parseQty } from '@menu/shared'
import { AppShell } from '../components/AppShell.js'
import { Icon } from '../components/Icon.js'
import { PlanTabs } from '../components/PlanTabs.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'
import type { RouterOutputs } from '../lib/types.js'

type Recipe = RouterOutputs['recipes']['get']
type Row = { key: number; qty: string; unit: string; name: string; note: string }

let rowKey = 0
const emptyRow = (): Row => ({ key: ++rowKey, qty: '', unit: '', name: '', note: '' })

export function RecipeEditPage() {
  const { id } = useParams()
  const { data, isLoading } = trpc.recipes.get.useQuery({ id: id ?? '' }, { enabled: !!id })
  if (id && isLoading) return <AppShell title="Edit recipe"><PlanTabs /><p className="muted">Loading…</p></AppShell>
  return <RecipeForm key={data?.id ?? 'new'} recipe={id ? data : undefined} />
}

function RecipeForm({ recipe }: { recipe?: Recipe }) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const create = trpc.recipes.create.useMutation()
  const update = trpc.recipes.update.useMutation()
  const [form, setForm] = useState({
    title: recipe?.title ?? '',
    description: recipe?.description ?? '',
    servings: String(recipe?.servings ?? 4),
    prepMin: recipe?.prepMin != null ? String(recipe.prepMin) : '',
    cookMin: recipe?.cookMin != null ? String(recipe.cookMin) : '',
    tags: recipe?.tags.join(', ') ?? '',
    kidFriendly: recipe?.kidFriendly ?? false,
    sourceUrl: recipe?.sourceUrl ?? '',
    instructions: recipe?.instructions ?? '',
    prepAheadNotes: recipe?.prepAheadNotes ?? '',
  })
  const [rows, setRows] = useState<Row[]>(() =>
    recipe?.ingredients.length
      ? recipe.ingredients.map(i => ({ key: ++rowKey, qty: i.qty != null ? formatQty(i.qty) : '', unit: i.unit, name: i.name, note: i.note }))
      : [emptyRow(), emptyRow(), emptyRow()]
  )
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setRow = (key: number, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const ingredients = []
    for (const r of rows.filter(r => r.name.trim())) {
      const qty = parseQty(r.qty)
      if (qty !== null && Number.isNaN(qty)) return setError(`Can't read the amount "${r.qty}" for ${r.name}. Try 2, 1.5, 1/2 or 1 1/2.`)
      ingredients.push({ name: r.name.trim(), qty, unit: r.unit.trim(), note: r.note.trim() })
    }
    const input = {
      title: form.title.trim(),
      description: form.description.trim(),
      servings: Math.max(1, Number(form.servings) || 4),
      prepMin: form.prepMin ? Number(form.prepMin) : null,
      cookMin: form.cookMin ? Number(form.cookMin) : null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      kidFriendly: form.kidFriendly,
      sourceUrl: form.sourceUrl.trim() || null,
      instructions: form.instructions,
      prepAheadNotes: form.prepAheadNotes,
      ingredients,
    }
    try {
      const id = recipe ? (await update.mutateAsync({ id: recipe.id, recipe: input }), recipe.id) : (await create.mutateAsync(input)).id
      await utils.recipes.invalidate()
      navigate(`/plan/recipes/${id}`)
    } catch (err) { setError(errorMessage(err)) }
  }

  const numeric = (k: 'servings' | 'prepMin' | 'cookMin') => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }))

  return (
    <AppShell title={recipe ? 'Edit recipe' : 'New recipe'}>
      <PlanTabs />
      <form className="recipe-layout" onSubmit={save}>
        <section className="card section">
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={form.title} onChange={set('title')} required placeholder="Chicken fajitas" />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <input className="input" value={form.description} onChange={set('description')} placeholder="Sheet-pan, 30 minutes, kids build their own" />
          </label>
          <div className="form-row form-row--3">
            <label className="field"><span className="field-label">Serves</span>
              <input className="input" inputMode="numeric" value={form.servings} onChange={numeric('servings')} /></label>
            <label className="field"><span className="field-label">Prep min</span>
              <input className="input" inputMode="numeric" value={form.prepMin} onChange={numeric('prepMin')} /></label>
            <label className="field"><span className="field-label">Cook min</span>
              <input className="input" inputMode="numeric" value={form.cookMin} onChange={numeric('cookMin')} /></label>
          </div>
          <label className="field">
            <span className="field-label">Tags</span>
            <input className="input" value={form.tags} onChange={set('tags')} placeholder="mexican, quick, sheet-pan" autoCapitalize="none" />
            <span className="field-hint">Comma-separated.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.kidFriendly} onChange={e => setForm(f => ({ ...f, kidFriendly: e.target.checked }))} />
            <span>Kid-friendly</span>
          </label>

          <h2 className="subsection-title">Ingredients</h2>
          <ul className="ing-rows">
            {rows.map((r, i) => (
              <li key={r.key} className="ing-row">
                <input className="input ing-name" value={r.name} onChange={e => setRow(r.key, { name: e.target.value })} placeholder="Ingredient" aria-label={`Ingredient ${i + 1}`} />
                <input className="input ing-qty" value={r.qty} onChange={e => setRow(r.key, { qty: e.target.value })} placeholder="1½" inputMode="decimal" aria-label={`Amount ${i + 1}`} />
                <input className="input ing-unit" value={r.unit} onChange={e => setRow(r.key, { unit: e.target.value })} placeholder="cup" autoCapitalize="none" aria-label={`Unit ${i + 1}`} />
                <input className="input ing-note" value={r.note} onChange={e => setRow(r.key, { note: e.target.value })} placeholder="note (diced…)" aria-label={`Note ${i + 1}`} />
                <button type="button" className="icon-btn ing-del" aria-label={`Remove ingredient ${i + 1}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><Icon name="close" /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost add-link" onClick={() => setRows(rs => [...rs, emptyRow()])}><Icon name="plus" size={18} /> Add ingredient</button>
        </section>

        <section className="card section">
          <label className="field">
            <span className="field-label">Instructions</span>
            <textarea className="textarea textarea--tall" value={form.instructions} onChange={set('instructions')} placeholder={'1. Slice the chicken and peppers…\n2. …'} />
          </label>
          <label className="field">
            <span className="field-label">Prep ahead</span>
            <textarea className="textarea" value={form.prepAheadNotes} onChange={set('prepAheadNotes')} placeholder="Marinate the chicken up to a day ahead." />
          </label>
          <label className="field">
            <span className="field-label">Source link</span>
            <input className="input" type="url" value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="https://…" autoCapitalize="none" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="btn-row sticky-actions">
            <button className="btn btn-primary" type="submit" disabled={create.isPending || update.isPending}>Save recipe</button>
            <button className="btn" type="button" onClick={() => navigate(-1)}>Cancel</button>
          </div>
        </section>
      </form>
    </AppShell>
  )
}
