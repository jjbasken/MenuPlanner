import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { addDays, shortDateLabel, weekStart as weekStartOf, type ISODate } from '@menu/shared'
import { AppShell } from '../components/AppShell.js'
import { BottomSheet } from '../components/BottomSheet.js'
import { Icon } from '../components/Icon.js'
import { useToday } from '../hooks/useToday.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'
import type { RouterOutputs } from '../lib/types.js'

type Item = RouterOutputs['shopping']['list'][number]

const GROUPS: { source: Item['source']; title: string }[] = [
  { source: 'plan', title: 'For the plan' },
  { source: 'manual', title: 'Added by hand' },
  { source: 'staple', title: 'Staples' },
]

export function ShoppingPage() {
  const utils = trpc.useUtils()
  const { data: items = [], isLoading } = trpc.shopping.list.useQuery()
  const [editing, setEditing] = useState<Item | null>(null)
  const refresh = () => { void utils.shopping.invalidate(); void utils.tonight.get.invalidate() }
  const setStatus = trpc.shopping.setStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.shopping.list.cancel()
      const prev = utils.shopping.list.getData()
      utils.shopping.list.setData(undefined, prev?.map(i => (i.id === id ? { ...i, status } : i)))
      return { prev }
    },
    onError: (_e, _v, ctx) => utils.shopping.list.setData(undefined, ctx?.prev),
    onSettled: refresh,
  })
  const pending = items.filter(i => i.status === 'pending')
  const skipped = items.filter(i => i.status !== 'pending')

  return (
    <AppShell title="Shopping">
      <div className="shopping-grid">
        <div className="col">
          <BuildFromPlan onBuilt={refresh} />
          <QuickAdd onAdded={refresh} />
          {isLoading && <p className="muted">Loading…</p>}
          {!isLoading && pending.length === 0 && <p className="muted">The next order is empty.</p>}
          {GROUPS.map(g => {
            const rows = pending.filter(i => i.source === g.source)
            if (!rows.length) return null
            return (
              <section key={g.source} className="stack" aria-label={g.title}>
                <h2 className="col-title col-title--split"><span>{g.title}</span><span className="col-count">{rows.length}</span></h2>
                <ul className="card list-card">
                  {rows.map(i => (
                    <li key={i.id} className="list-row">
                      <button className="list-main list-edit" onClick={() => setEditing(i)}>
                        <span>{i.name}</span>
                        {i.quantityText && <span className="list-qty"> · {i.quantityText}</span>}
                        {i.note && <span className="list-note">{i.note}</span>}
                      </button>
                      {i.source === 'staple'
                        ? <button className="btn btn-small" onClick={() => setStatus.mutate({ id: i.id, status: 'have' })}>Have it</button>
                        : <button className="icon-btn" aria-label={`Remove ${i.name}`} onClick={() => setStatus.mutate({ id: i.id, status: 'removed' })}><Icon name="close" /></button>}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {skipped.length > 0 && (
            <details className="skipped">
              <summary>Not ordering this time ({skipped.length})</summary>
              <ul className="card list-card">
                {skipped.map(i => (
                  <li key={i.id} className="list-row">
                    <div className="list-main muted">{i.name}<span className="tag"> · {i.status === 'have' ? 'Have it' : 'Removed'}</span></div>
                    <button className="btn btn-small" onClick={() => setStatus.mutate({ id: i.id, status: 'pending' })}>Undo</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="col">
          <PushPanel count={pending.length} onPushed={refresh} />
        </div>
      </div>
      <ItemSheet item={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </AppShell>
  )
}

function BuildFromPlan({ onBuilt }: { onBuilt: () => void }) {
  const today = useToday()
  const thisWeek = weekStartOf(today)
  const nextWeek = addDays(thisWeek, 7)
  // Late in the week you're usually shopping for the next one.
  const [week, setWeek] = useState<ISODate>(() => (new Date().getDay() >= 4 || new Date().getDay() === 0 ? nextWeek : thisWeek))
  const build = trpc.shopping.buildFromPlan.useMutation({ onSuccess: onBuilt })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <section className="card section build-card">
      <h2 className="subsection-title">Add ingredients from the plan</h2>
      <p className="muted small">Combines every cook night's recipe ingredients, scaled to servings. Staples are left to their own rows. Run it again after changing the plan — it updates in place.</p>
      <div className="form-row">
        <select className="select" value={week} onChange={e => setWeek(e.target.value)} aria-label="Week">
          <option value={thisWeek}>This week ({shortDateLabel(thisWeek)})</option>
          <option value={nextWeek}>Next week ({shortDateLabel(nextWeek)})</option>
        </select>
        <button className="btn btn-primary" disabled={build.isPending} onClick={async () => {
          setMsg(null)
          try {
            const r = await build.mutateAsync({ weekStart: week })
            const parts = [`${r.added} added`, r.updated && `${r.updated} updated`, r.dropped && `${r.dropped} no longer needed`].filter(Boolean)
            const extra = r.mealsWithoutRecipe.length ? ` No recipe for: ${r.mealsWithoutRecipe.join(', ')} — add those by hand.` : ''
            setMsg({ ok: true, text: `${parts.join(', ')}.${extra}` })
          } catch (err) { setMsg({ ok: false, text: errorMessage(err) }) }
        }}>{build.isPending ? 'Adding…' : 'Add'}</button>
      </div>
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>}
    </section>
  )
}

function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const add = trpc.shopping.add.useMutation({ onSuccess: onAdded })
  return (
    <form className="add-row" onSubmit={e => {
      e.preventDefault()
      if (!name.trim()) return
      add.mutate({ name: name.trim() })
      setName('')
    }}>
      <input className="input" placeholder="Add an item" value={name} onChange={e => setName(e.target.value)} enterKeyHint="done" aria-label="Add an item" />
      <button className="btn btn-primary" type="submit">Add</button>
    </form>
  )
}

function PushPanel({ count, onPushed }: { count: number; onPushed: () => void }) {
  const { data: status, isLoading } = trpc.shopping.groceryStatus.useQuery(undefined, { staleTime: 60_000 })
  const push = trpc.shopping.push.useMutation({ onSuccess: onPushed })
  const [listId, setListId] = useState<number | null>(null)
  const [merge, setMerge] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (status && listId === null) setListId(status.defaultListId ?? status.lists[0]?.id ?? null)
  }, [status, listId])

  return (
    <section className="card section push-card" aria-labelledby="push-title">
      <h2 id="push-title" className="section-title">Send to GroceryList</h2>
      {isLoading && <p className="muted">Checking GroceryList…</p>}
      {status && !status.configured && (
        <p className="muted">GroceryList isn't connected. Set <code>GROCERYLIST_URL</code> and <code>GROCERYLIST_TOKEN</code> on the server (see the README).</p>
      )}
      {status?.error && <div className="form-error" role="alert">{status.error}</div>}
      {status?.configured && !status.error && (
        <>
          <label className="field">
            <span className="field-label">List</span>
            <select className="select" value={listId ?? ''} onChange={e => setListId(Number(e.target.value))}>
              {status.lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={merge} onChange={e => setMerge(e.target.checked)} />
            <span>Combine with items already on the list</span>
          </label>
          <button className="btn btn-primary btn-block btn-big" disabled={push.isPending || count === 0} onClick={async () => {
            setMsg(null)
            try {
              const r = await push.mutateAsync({ listId, merge })
              const listName = status.lists.find(l => l.id === listId)?.name ?? 'GroceryList'
              setMsg({ ok: true, text: `Sent ${r.sent} item${r.sent === 1 ? '' : 's'} to ${listName}${r.merged ? ` (${r.merged} combined with what was already there)` : ''}. A fresh order has started.` })
            } catch (err) { setMsg({ ok: false, text: errorMessage(err) }) }
          }}>
            {push.isPending ? 'Sending…' : count === 0 ? 'Nothing to send' : `Send ${count} item${count === 1 ? '' : 's'}`}
          </button>
        </>
      )}
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>}
      <p className="muted small">Staples marked <strong>Have it</strong> and removed items aren't sent. After sending, the next order starts with your staples again. Manage staples in <Link to="/settings">Settings</Link>.</p>
    </section>
  )
}

function ItemSheet({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: () => void }) {
  return (
    <BottomSheet open={!!item} onClose={onClose} title={item?.name ?? ''}>
      {item && <ItemForm key={item.id} item={item} onDone={() => { onSaved(); onClose() }} />}
    </BottomSheet>
  )
}

function ItemForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const update = trpc.shopping.update.useMutation()
  const [form, setForm] = useState({ name: item.name, quantityText: item.quantityText, note: item.note })
  const [error, setError] = useState<string | null>(null)
  return (
    <form className="stack" onSubmit={async e => {
      e.preventDefault()
      try { await update.mutateAsync({ id: item.id, ...form }); onDone() } catch (err) { setError(errorMessage(err)) }
    }}>
      <label className="field"><span className="field-label">Item</span>
        <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></label>
      <label className="field"><span className="field-label">Quantity</span>
        <input className="input" value={form.quantityText} onChange={e => setForm(f => ({ ...f, quantityText: e.target.value }))} placeholder="2 lb" maxLength={50} /></label>
      <label className="field"><span className="field-label">Note</span>
        <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="for Chicken fajitas" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={update.isPending}>Save</button>
    </form>
  )
}
