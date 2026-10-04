// Client for GroceryList's token-authenticated external API
// (GET /api/external/lists, POST /api/external/items). See the GroceryList README.

export type GroceryList = { id: number; name: string }
export type GroceryItem = { name: string; quantity?: string; notes?: string; section?: 'now' | 'later' }
export type PushResult = { added: number; merged: number }

export class GroceryListError extends Error {}

const TIMEOUT_MS = 10_000

export type GroceryClient = ReturnType<typeof createGroceryClient>

export function createGroceryClient(opts: { url: string; token: string; fetch?: typeof fetch }) {
  const base = opts.url.replace(/\/+$/, '')
  const doFetch = opts.fetch ?? fetch

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response
    try {
      res = await doFetch(`${base}${path}`, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json', ...init.headers },
      })
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'is unreachable'
      throw new GroceryListError(`GroceryList at ${base} ${reason}`)
    }
    if (res.status === 401) throw new GroceryListError('GroceryList rejected the token — check GROCERYLIST_TOKEN matches its EXTERNAL_API_TOKEN')
    if (res.status === 404) throw new GroceryListError('GroceryList has no external API enabled — set EXTERNAL_API_TOKEN there')
    if (res.status >= 300 && res.status < 400) throw new GroceryListError(`GroceryList redirected the request (${res.status}) — use its https:// URL, or http://web:5000 from the same Docker host`)
    const body = await res.json().catch(() => null) as { error?: string } | null
    if (!res.ok) throw new GroceryListError(`GroceryList error: ${body?.error ?? `HTTP ${res.status}`}`)
    return body as T
  }

  return {
    listLists: () => call<GroceryList[]>('/api/external/lists'),

    async pushItems(listId: number | null, items: GroceryItem[], merge = true): Promise<PushResult> {
      const res = await call<{ added: unknown[]; merged: unknown[] }>('/api/external/items', {
        method: 'POST',
        body: JSON.stringify({ ...(listId != null ? { list_id: listId } : {}), merge, items }),
      })
      return { added: res.added.length, merged: res.merged.length }
    },
  }
}

/** The configured client, or null when GROCERYLIST_URL / GROCERYLIST_TOKEN aren't set. */
export function groceryClientFromEnv(env = process.env): GroceryClient | null {
  if (!env.GROCERYLIST_URL || !env.GROCERYLIST_TOKEN) return null
  return createGroceryClient({ url: env.GROCERYLIST_URL, token: env.GROCERYLIST_TOKEN })
}
