import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTrpcClient } from './lib/trpc.js'
import { queryClient } from './lib/queryClient.js'
import { session } from './lib/session.js'
import { AuthProvider } from './hooks/useAuth.js'
import { ProtectedRoute } from './components/ProtectedRoute.js'
import { LoginPage } from './routes/LoginPage.js'
import { SetupPage } from './routes/SetupPage.js'
import { SettingsPage } from './routes/SettingsPage.js'

export function App() {
  const [trpcClient] = useState(() => createTrpcClient(() => session.getToken()))
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/settings" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
