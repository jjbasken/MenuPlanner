import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'
import { AuthLayout } from './LoginPage.js'

export function SetupPage() {
  const { setup } = useAuth()
  const { data: status, isLoading } = trpc.auth.status.useQuery()
  const navigate = useNavigate()
  const [form, setForm] = useState({ bootstrapToken: '', displayName: '', username: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!isLoading && status && !status.needsSetup) return <Navigate to="/login" replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await setup({ ...form, username: form.username.trim() })
      navigate('/')
    } catch (err) {
      setError(errorMessage(err, 'Setup failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Set up MenuPlanner" subtitle="Create the first account. It will be the admin, and can add the rest of the family.">
      {status && !status.setupEnabled && (
        <div className="form-error" role="alert">
          The server has no <code>BOOTSTRAP_TOKEN</code> configured. Set it in <code>.env</code> and restart to finish setup.
        </div>
      )}
      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Setup token</span>
          <input className="input" value={form.bootstrapToken} onChange={set('bootstrapToken')}
            autoComplete="off" autoCapitalize="none" autoCorrect="off" required />
          <span className="field-hint">The <code>BOOTSTRAP_TOKEN</code> value from the server's <code>.env</code>.</span>
        </label>
        <label className="field">
          <span className="field-label">Your name</span>
          <input className="input" value={form.displayName} onChange={set('displayName')} autoComplete="name" required />
        </label>
        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" value={form.username} onChange={set('username')}
            autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" value={form.password} onChange={set('password')}
            autoComplete="new-password" minLength={8} required />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading || !status?.setupEnabled}>
          {loading ? 'Creating…' : 'Create admin account'}
        </button>
      </form>
    </AuthLayout>
  )
}
