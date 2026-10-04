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
import { TonightPage } from './routes/TonightPage.js'
import { KioskPage } from './routes/KioskPage.js'
import { PlanPage } from './routes/PlanPage.js'
import { RecipesPage } from './routes/RecipesPage.js'
import { RecipePage } from './routes/RecipePage.js'
import { RecipeEditPage } from './routes/RecipeEditPage.js'
import { FeedbackPage } from './routes/FeedbackPage.js'
import { ShoppingPage } from './routes/ShoppingPage.js'

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
                <Route path="/" element={<TonightPage />} />
                <Route path="/kiosk" element={<KioskPage />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/plan/recipes" element={<RecipesPage />} />
                <Route path="/plan/recipes/new" element={<RecipeEditPage />} />
                <Route path="/plan/recipes/:id" element={<RecipePage />} />
                <Route path="/plan/recipes/:id/edit" element={<RecipeEditPage />} />
                <Route path="/shopping" element={<ShoppingPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
