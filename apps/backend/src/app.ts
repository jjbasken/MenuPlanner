import { Hono } from 'hono'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from './router.js'
import { createContext } from './context.js'
import { db as defaultDb, type Db } from './db/index.js'
import { createV1 } from './rest/v1.js'

// Built as a factory so tests can drive the real HTTP routes against an
// in-memory database.
export function createApp(dbOverride?: Db) {
  const app = new Hono()

  app.all('/api/trpc/*', c =>
    fetchRequestHandler({
      endpoint: '/api/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: opts => createContext(opts, dbOverride),
    })
  )

  app.route('/api/v1', createV1(dbOverride ?? defaultDb))

  app.get('/health', c => c.json({ ok: true }))

  return app
}
