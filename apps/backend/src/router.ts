import { authRouter } from './routers/auth.js'
import { usersRouter } from './routers/users.js'
import { tonightRouter } from './routers/tonight.js'
import { plansRouter } from './routers/plans.js'
import { shoppingRouter } from './routers/shopping.js'
import { freezerRouter } from './routers/freezer.js'
import { staplesRouter } from './routers/staples.js'
import { settingsRouter } from './routers/settings.js'
import { router } from './trpc.js'

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  tonight: tonightRouter,
  plans: plansRouter,
  shopping: shoppingRouter,
  freezer: freezerRouter,
  staples: staplesRouter,
  settings: settingsRouter,
})

export type AppRouter = typeof appRouter
