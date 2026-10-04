import { QueryClient } from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { session } from './session.js'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, err) => !(err instanceof TRPCClientError && err.data?.httpStatus === 401) && failures < 1,
      staleTime: 30_000,
      refetchOnWindowFocus: 'always',
    },
  },
})

// A revoked or expired token surfaces as a 401 on whatever query runs next.
// Drop it and send the user back to the login screen.
queryClient.getQueryCache().subscribe(event => {
  const err = event.query.state.error
  if (err instanceof TRPCClientError && err.data?.httpStatus === 401 && session.getToken()) {
    session.clear()
    window.location.assign('/login')
  }
})
