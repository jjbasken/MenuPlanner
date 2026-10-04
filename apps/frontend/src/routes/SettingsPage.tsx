import { useState } from 'react'
import { AppShell } from '../components/AppShell.js'
import { AdminOnly } from '../components/ProtectedRoute.js'
import { useAuth, useMe } from '../hooks/useAuth.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'
import { DOW_NAMES } from '@menu/shared'
import { Icon } from '../components/Icon.js'
import { BottomSheet } from '../components/BottomSheet.js'
import { Link } from 'react-router'
import type { RouterOutputs } from '../lib/types.js'

export function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="settings-grid">
        <FamilySection />
        <StaplesSection />
        <CadenceSection />
        <AccountSection />
        <AdminOnly><UsersSection /></AdminOnly>
        <AdminOnly><ApiTokensSection /></AdminOnly>
      </div>
    </AppShell>
  )
}

function AccountSection() {
  const { data: me } = useMe()
  const { logout, replaceToken } = useAuth()
  const utils = trpc.useUtils()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const updateMe = trpc.users.updateMe.useMutation({ onSuccess: () => utils.users.me.invalidate() })
  const changePassword = trpc.auth.changePassword.useMutation()

  return (
    <section className="card section">
      <h2 className="section-title">Your account</h2>
      <p className="muted">Signed in as <strong>{me?.username}</strong>{me?.isAdmin ? ' · admin' : ''}</p>
      <form className="stack" onSubmit={async e => {
        e.preventDefault()
        if (displayName === null) return
        await updateMe.mutateAsync({ displayName })
        setDisplayName(null)
      }}>
        <label className="field">
          <span className="field-label">Display name</span>
          <input className="input" value={displayName ?? me?.displayName ?? ''} onChange={e => setDisplayName(e.target.value)} />
        </label>
        {displayName !== null && <button className="btn" type="submit" disabled={updateMe.isPending}>Save name</button>}
      </form>

      <form className="stack" onSubmit={async e => {
        e.preventDefault()
        setMsg(null)
        try {
          const res = await changePassword.mutateAsync(pw)
          replaceToken(res.token)
          setPw({ currentPassword: '', newPassword: '' })
          setMsg({ kind: 'ok', text: 'Password changed. Your other devices have been signed out.' })
        } catch (err) {
          setMsg({ kind: 'error', text: errorMessage(err) })
        }
      }}>
        <h3 className="subsection-title">Change password</h3>
        <label className="field">
          <span className="field-label">Current password</span>
          <input className="input" type="password" autoComplete="current-password" value={pw.currentPassword}
            onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} required />
        </label>
        <label className="field">
          <span className="field-label">New password</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={pw.newPassword}
            onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} required />
        </label>
        {msg && <div className={msg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>}
        <button className="btn" type="submit" disabled={changePassword.isPending}>Change password</button>
      </form>

      <button className="btn btn-ghost" onClick={() => logout()}>Sign out</button>
    </section>
  )
}

function UsersSection() {
  const { data: me } = useMe()
  const utils = trpc.useUtils()
  const { data: users = [] } = trpc.users.list.useQuery()
  const refresh = () => utils.users.list.invalidate()
  const create = trpc.users.create.useMutation({ onSuccess: refresh })
  const setAdmin = trpc.users.setAdmin.useMutation({ onSuccess: refresh })
  const revoke = trpc.users.revokeSessions.useMutation()
  const del = trpc.users.delete.useMutation({ onSuccess: refresh })
  const [form, setForm] = useState({ displayName: '', username: '', password: '', isAdmin: false })
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <section className="card section">
      <h2 className="section-title">Family logins</h2>
      <p className="muted">Everyone shares the same plan, recipes and shopping list. Admins can manage logins.</p>
      <ul className="rows">
        {users.map(u => (
          <li key={u.id} className="row row--wrap">
            <div className="row-main">
              <div className="row-title">{u.displayName}</div>
              <div className="row-meta">{u.username}{u.isAdmin ? ' · ADMIN' : ''}</div>
            </div>
            {u.id !== me?.id && (
              <div className="row-actions">
                <button className="btn btn-small" onClick={() => setAdmin.mutate({ userId: u.id, isAdmin: !u.isAdmin })}>
                  {u.isAdmin ? 'Remove admin' : 'Make admin'}
                </button>
                <button className="btn btn-small" onClick={() => revoke.mutate({ userId: u.id })}>Sign out everywhere</button>
                {confirmDelete === u.id
                  ? <button className="btn btn-small btn-danger" onClick={() => { del.mutate({ userId: u.id }); setConfirmDelete(null) }}>Really delete?</button>
                  : <button className="btn btn-small" onClick={() => setConfirmDelete(u.id)}>Delete</button>}
              </div>
            )}
          </li>
        ))}
      </ul>

      <form className="stack" onSubmit={async e => {
        e.preventDefault()
        setError(null)
        try {
          await create.mutateAsync({ ...form, username: form.username.trim() })
          setForm({ displayName: '', username: '', password: '', isAdmin: false })
        } catch (err) {
          setError(errorMessage(err))
        }
      }}>
        <h3 className="subsection-title">Add a login</h3>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} required />
        </label>
        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" value={form.username} autoCapitalize="none" autoCorrect="off"
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
        </label>
        <label className="field">
          <span className="field-label">Temporary password</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.isAdmin} onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))} />
          <span>Admin</span>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>Add login</button>
      </form>
    </section>
  )
}

function StaplesSection() {
  const utils = trpc.useUtils()
  const { data: staples = [] } = trpc.staples.list.useQuery()
  const refresh = () => { void utils.staples.list.invalidate(); void utils.tonight.get.invalidate() }
  const add = trpc.staples.add.useMutation({ onSuccess: refresh })
  const toggle = trpc.staples.setInEveryOrder.useMutation({ onSuccess: refresh })
  const del = trpc.staples.delete.useMutation({ onSuccess: refresh })
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <section className="card section">
      <h2 className="section-title">Staples</h2>
      <p className="muted">Things you buy most weeks. They're added to every order — tap <strong>Have it</strong> on the Tonight screen when you're still stocked.</p>
      <form className="add-row" onSubmit={async e => {
        e.preventDefault()
        setError(null)
        try {
          await add.mutateAsync({ name: name.trim(), inEveryOrder: true })
          setName('')
        } catch (err) { setError(errorMessage(err)) }
      }}>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Rice" aria-label="New staple" required />
        <button className="btn btn-primary" type="submit" disabled={add.isPending}>Add</button>
      </form>
      {error && <div className="form-error" role="alert">{error}</div>}
      {staples.length > 0 && (
        <ul className="rows">
          {staples.map(s => (
            <li key={s.id} className="row">
              <div className="row-main"><div className="row-title">{s.name}</div></div>
              <label className="check">
                <input type="checkbox" checked={s.inEveryOrder} onChange={e => toggle.mutate({ id: s.id, inEveryOrder: e.target.checked })} />
                <span>Every order</span>
              </label>
              <button className="icon-btn" aria-label={`Delete ${s.name}`} onClick={() => del.mutate({ id: s.id })}><Icon name="close" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CadenceSection() {
  const utils = trpc.useUtils()
  const { data: settings } = trpc.settings.get.useQuery()
  const update = trpc.settings.updateCadence.useMutation({
    onSuccess: () => { void utils.settings.get.invalidate(); void utils.tonight.get.invalidate() },
  })
  if (!settings) return null
  const current = { draftDow: settings.draftDow, listDow: settings.listDow, pickupDow: settings.pickupDow }
  const field = (key: keyof typeof current, label: string, hint: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="select" value={current[key]} onChange={e => update.mutate({ ...current, [key]: Number(e.target.value) })}>
        {DOW_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
      <span className="field-hint">{hint}</span>
    </label>
  )
  return (
    <section className="card section">
      <h2 className="section-title">Shopping rhythm</h2>
      <p className="muted">Shown at the bottom of the Tonight screen as "Next plan: draft · list · pickup".</p>
      {field('draftDow', 'Draft the next plan on', 'When next week\'s meals get planned.')}
      {field('listDow', 'Send the list on', 'When the grocery list goes out.')}
      {field('pickupDow', 'Pick up on', 'When the groceries arrive.')}
    </section>
  )
}

type Member = RouterOutputs['family']['list'][number]

function FamilySection() {
  const { data: members = [] } = trpc.family.list.useQuery()
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  return (
    <section className="card section">
      <h2 className="section-title">Family</h2>
      <p className="muted">Everyone the plan feeds — kids too. Likes, dislikes and allergies are what plan-week works around, and everyone here can rate dinners on the Feedback tab.</p>
      {members.length > 0 && (
        <ul className="rows">
          {members.map(m => (
            <li key={m.id}>
              <button className="row row-button" onClick={() => setEditing(m)}>
                <div className="row-main">
                  <div className="row-title">{m.name}{m.isKid ? <span className="tag"> · Kid</span> : null}</div>
                  {(m.dislikes || m.allergies) && (
                    <div className="muted small">{[m.allergies && `Allergic: ${m.allergies}`, m.dislikes && `Dislikes: ${m.dislikes}`].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
                <Icon name="chevron" size={18} className="day-chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add family member</button>
      <p className="muted small">Kitchen tablet? Open the <Link to="/kiosk">full-screen display</Link>.</p>
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add family member' : editing?.name ?? ''}>
        {editing && <MemberForm key={editing === 'new' ? 'new' : editing.id} member={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </BottomSheet>
    </section>
  )
}

function MemberForm({ member, onDone }: { member?: Member; onDone: () => void }) {
  const utils = trpc.useUtils()
  const refresh = () => utils.family.list.invalidate()
  const create = trpc.family.create.useMutation({ onSuccess: refresh })
  const update = trpc.family.update.useMutation({ onSuccess: refresh })
  const del = trpc.family.delete.useMutation({ onSuccess: refresh })
  const [form, setForm] = useState({
    name: member?.name ?? '', isKid: member?.isKid ?? false, likes: member?.likes ?? '',
    dislikes: member?.dislikes ?? '', allergies: member?.allergies ?? '', notes: member?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const text = (k: 'name' | 'likes' | 'dislikes' | 'allergies' | 'notes', label: string, placeholder: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={placeholder} required={k === 'name'} />
    </label>
  )
  return (
    <form className="stack" onSubmit={async e => {
      e.preventDefault()
      setError(null)
      try {
        if (member) await update.mutateAsync({ id: member.id, ...form })
        else await create.mutateAsync(form)
        onDone()
      } catch (err) { setError(errorMessage(err)) }
    }}>
      {text('name', 'Name', 'Ava')}
      <label className="check">
        <input type="checkbox" checked={form.isKid} onChange={e => setForm(f => ({ ...f, isKid: e.target.checked }))} />
        <span>Kid</span>
      </label>
      {text('likes', 'Likes', 'tacos, noodles, anything with ranch')}
      {text('dislikes', 'Dislikes', 'mushrooms, spicy food')}
      {text('allergies', 'Allergies', 'tree nuts')}
      {text('notes', 'Notes', 'Eats small portions')}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={create.isPending || update.isPending}>Save</button>
        {member && (confirm
          ? <button type="button" className="btn btn-danger" onClick={async () => { await del.mutateAsync({ id: member.id }); onDone() }}>Really remove?</button>
          : <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>Remove</button>)}
      </div>
    </form>
  )
}

function ApiTokensSection() {
  const utils = trpc.useUtils()
  const { data: tokens = [] } = trpc.apiTokens.list.useQuery()
  const create = trpc.apiTokens.create.useMutation({ onSuccess: () => utils.apiTokens.list.invalidate() })
  const revoke = trpc.apiTokens.revoke.useMutation({ onSuccess: () => utils.apiTokens.list.invalidate() })
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never')

  return (
    <section className="card section">
      <h2 className="section-title">API tokens</h2>
      <p className="muted">For Claude Code and Codex: the <code>plan-week</code> and <code>add-recipe</code> workflows use a token to read and write plans and recipes. Put it in <code>.mp.env</code> as <code>MENUPLANNER_TOKEN</code>.</p>
      {created && (
        <div className="token-reveal" role="status">
          <div className="field-label">Copy this token now — it won't be shown again.</div>
          <code className="token-value">{created}</code>
          <div className="btn-row">
            <button className="btn btn-small" onClick={() => navigator.clipboard?.writeText(created).catch(() => {})}>Copy</button>
            <button className="btn btn-small btn-ghost" onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="rows">
          {tokens.map(t => (
            <li key={t.id} className="row">
              <div className="row-main">
                <div className="row-title">{t.name}</div>
                <div className="muted small">Created {when(t.createdAt)}{t.createdBy ? ` by ${t.createdBy}` : ''} · last used {when(t.lastUsedAt)}</div>
              </div>
              {confirm === t.id
                ? <button className="btn btn-small btn-danger" onClick={() => { revoke.mutate({ id: t.id }); setConfirm(null) }}>Really revoke?</button>
                : <button className="btn btn-small" onClick={() => setConfirm(t.id)}>Revoke</button>}
            </li>
          ))}
        </ul>
      )}
      <form className="add-row" onSubmit={async e => {
        e.preventDefault()
        const res = await create.mutateAsync({ name: name.trim() })
        setCreated(res.token)
        setName('')
      }}>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Claude Code on my laptop" aria-label="Token name" required />
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>Create</button>
      </form>
    </section>
  )
}
