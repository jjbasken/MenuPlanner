import { useState } from 'react'
import { AppShell } from '../components/AppShell.js'
import { AdminOnly } from '../components/ProtectedRoute.js'
import { useAuth, useMe } from '../hooks/useAuth.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'

export function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="settings-grid">
        <AccountSection />
        <AdminOnly><UsersSection /></AdminOnly>
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
