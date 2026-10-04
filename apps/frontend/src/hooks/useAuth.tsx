import { createContext, useContext, useState, type ReactNode } from 'react'
import { session } from '../lib/session.js'
import { trpc } from '../lib/trpc.js'

type AuthContextType = {
  isLoggedIn: boolean
  login: (username: string, password: string) => Promise<void>
  setup: (input: { bootstrapToken: string; username: string; displayName: string; password: string }) => Promise<void>
  replaceToken: (token: string) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!session.getToken())
  const utils = trpc.useUtils()

  function signedIn(token: string) {
    session.setToken(token)
    void utils.invalidate()
    setIsLoggedIn(true)
  }

  async function login(username: string, password: string) {
    const res = await utils.client.auth.login.mutate({ username, password })
    signedIn(res.token)
  }

  async function setup(input: { bootstrapToken: string; username: string; displayName: string; password: string }) {
    const res = await utils.client.auth.setup.mutate(input)
    signedIn(res.token)
  }

  async function logout() {
    // Revoke the token server-side first. Clearing localStorage alone leaves a
    // year-long token valid for anyone who captured it.
    try {
      await utils.client.auth.logout.mutate()
    } catch {
      // Offline or already-invalid token — clear locally regardless.
    }
    session.clear()
    utils.invalidate()
    setIsLoggedIn(false)
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, setup, replaceToken: session.setToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** The signed-in user's profile, including whether they are an admin. */
export function useMe() {
  return trpc.users.me.useQuery(undefined, { staleTime: 5 * 60_000 })
}
