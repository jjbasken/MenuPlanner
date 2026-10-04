import { authRouter } from './routers/auth.js'
import { usersRouter } from './routers/users.js'
import { router } from './trpc.js'

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
})

export type AppRouter = typeof appRouter
