import { createApp } from './app.js'
import { assertUsableJwtSecret } from './lib/jwt.js'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'

// Validate configuration before touching the database, so a misconfigured
// deployment fails at boot rather than after it has started serving.
assertUsableJwtSecret()
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — using an in-memory database; nothing will be saved.')
}
migrate(db)

export default { port: Number(process.env.PORT ?? 3001), fetch: createApp().fetch }
