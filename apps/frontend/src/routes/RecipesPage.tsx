import { useState } from 'react'
import { Link } from 'react-router'
import { AppShell } from '../components/AppShell.js'
import { Icon } from '../components/Icon.js'
import { PlanTabs } from '../components/PlanTabs.js'
import { trpc } from '../lib/trpc.js'

export function RecipesPage() {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [kidFriendly, setKidFriendly] = useState(false)
  const { data: tags = [] } = trpc.recipes.tags.useQuery()
  const { data: recipes, isLoading } = trpc.recipes.list.useQuery({
    q: q.trim() || undefined,
    tag: tag ?? undefined,
    kidFriendly: kidFriendly || undefined,
  })

  return (
    <AppShell title="Recipes">
      <PlanTabs />
      <div className="stack recipes-tools">
        <div className="add-row">
          <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" enterKeyHint="search" />
          <Link className="btn btn-primary" to="/plan/recipes/new"><Icon name="plus" size={18} /> New</Link>
        </div>
        <div className="chip-row">
          <button className={`chip${kidFriendly ? ' chip--on' : ''}`} aria-pressed={kidFriendly} onClick={() => setKidFriendly(k => !k)}>Kid-friendly</button>
          {tags.map(t => (
            <button key={t} className={`chip${tag === t ? ' chip--on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
          ))}
        </div>
      </div>
      {isLoading && <p className="muted">Loading…</p>}
      {recipes && recipes.length === 0 && (
        <p className="muted">{q || tag || kidFriendly ? 'No recipes match.' : 'No recipes yet. Add your family favorites, or ask Claude Code / Codex to add some.'}</p>
      )}
      <ul className="recipe-grid">
        {recipes?.map(r => (
          <li key={r.id}>
            <Link to={`/plan/recipes/${r.id}`} className="card recipe-card">
              <div className="recipe-card-title">{r.title}</div>
              {r.description && <div className="muted recipe-card-desc">{r.description}</div>}
              <div className="recipe-card-meta">
                {[(r.prepMin ?? 0) + (r.cookMin ?? 0) > 0 && `${(r.prepMin ?? 0) + (r.cookMin ?? 0)} min`, `serves ${r.servings}`, `${r.ingredientCount} ingredients`, r.rating && '★'.repeat(r.rating)].filter(Boolean).join(' · ')}
              </div>
              {(r.kidFriendly || r.tags.length > 0) && (
                <div className="tag-row">
                  {r.kidFriendly && <span className="pill pill--leftovers">Kid-friendly</span>}
                  {r.tags.map(t => <span key={t} className="pill pill--flexible">{t}</span>)}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  )
}
