import { eq } from 'drizzle-orm'
import { verifyToken } from './lib/jwt.js'
import { db as defaultDb, type Db } from './db/index.js'
import { revokedTokens, users } from './db/schema.js'

export type AppContext = {
  db: Db
  userId: string | null
  // Present when the request carried a valid token. `logout` uses these to revoke
  // exactly this session. Optional so test callers can build a bare context.
  tokenId?: string | null
  tokenExpiresAt?: number | null
  // Source address for rate limiting, from the reverse proxy. Optional so test
  // callers can build a bare context; limits keyed on an account still apply.
  clientIp?: string | null
}

/**
 * Client address as reported by nginx in front of this server, which overwrites
 * X-Forwarded-For with the real peer address. It is client-controlled if the
 * backend is reachable directly, so nothing that grants access may depend on
 * it — it only ever tightens a rate limit.
 */
export function readClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  return req.headers.get('x-real-ip')?.trim().slice(0, 64) || null
}

export async function createContext({ req }: { req: Request }, dbOverride?: Db): Promise<AppContext> {
  const db = dbOverride ?? defaultDb
  const clientIp = readClientIp(req)
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return { db, userId: null, clientIp }

  const tokenData = await verifyToken(token)
  if (!tokenData) return { db, userId: null, clientIp }

  // Reject tokens that were explicitly logged out. Unlike a tokenVersion bump this
  // ends one session without signing the user out on their other devices.
  const [revoked] = await db.select({ jti: revokedTokens.jti })
    .from(revokedTokens)
    .where(eq(revokedTokens.jti, tokenData.tokenId))
  if (revoked) return { db, userId: null, clientIp }

  // A user's tokenVersion is bumped on password change / admin revoke, which
  // invalidates every outstanding token for that user.
  const [user] = await db.select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, tokenData.userId))
  if (!user || user.tokenVersion !== tokenData.tokenVersion) return { db, userId: null, clientIp }

  return { db, userId: tokenData.userId, tokenId: tokenData.tokenId, tokenExpiresAt: tokenData.expiresAt, clientIp }
}
