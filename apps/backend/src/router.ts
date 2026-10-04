import { authRouter } from './routers/auth.js'
import { usersRouter } from './routers/users.js'
import { tonightRouter } from './routers/tonight.js'
import { plansRouter } from './routers/plans.js'
import { shoppingRouter } from './routers/shopping.js'
import { freezerRouter } from './routers/freezer.js'
import { staplesRouter } from './routers/staples.js'
import { settingsRouter } from './routers/settings.js'
import { recipesRouter } from './routers/recipes.js'
import { familyRouter } from './routers/family.js'
import { feedbackRouter } from './routers/feedback.js'
import { apiTokensRouter } from './routers/apiTokens.js'
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
  recipes: recipesRouter,
  family: familyRouter,
  feedback: feedbackRouter,
  apiTokens: apiTokensRouter,
})

export type AppRouter = typeof appRouter
