import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'

export function LoginPage() {
  const { login, isLoggedIn } = useAuth()
  const { data: status } = trpc.auth.status.useQuery()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (isLoggedIn) return <Navigate to="/" replace />
  if (status?.needsSetup) return <Navigate to="/setup" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/')
    } catch (err) {
      setError(errorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to see what's for dinner.">
      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none" autoCorrect="off" enterKeyHint="next" required autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" enterKeyHint="go" required />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {status?.needsSetup && <p className="muted center"><Link to="/setup">First time? Set up MenuPlanner</Link></p>}
    </AuthLayout>
  )
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div className="tablecloth" aria-hidden="true" />
      <div className="auth-card card">
        <div className="eyebrow">MenuPlanner</div>
        <h1 className="auth-title">{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}
