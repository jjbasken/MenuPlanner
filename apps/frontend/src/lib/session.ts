// The bearer token lives in localStorage so the installed PWA stays signed in
// between launches. Logout revokes it server-side and clears it here.

const TOKEN_KEY = 'menu:token'

export const session = {
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  getToken: () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(TOKEN_KEY)
        return null
      }
    } catch { /* malformed token — let the server reject it */ }
    return token
  },
  clear: () => localStorage.removeItem(TOKEN_KEY),
}
