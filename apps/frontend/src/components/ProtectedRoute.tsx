import { Navigate, Outlet } from 'react-router'
import { useAuth, useMe } from '../hooks/useAuth.js'

export function ProtectedRoute() {
  const { isLoggedIn } = useAuth()
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe()
  return me?.isAdmin ? <>{children}</> : null
}
