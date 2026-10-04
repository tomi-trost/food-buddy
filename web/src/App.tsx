import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { api, tokenStore } from './api/client'
import { AppLayout, BareLayout } from './layout/AppLayout'
import { applyTheme } from './lib/theme'
import { AnalysisPage } from './pages/AnalysisPage'
import { HomePage } from './pages/HomePage'
import { IngredientsPage } from './pages/IngredientsPage'
import { InsightsPage } from './pages/InsightsPage'
import { LoginPage } from './pages/LoginPage'
import { MealPage } from './pages/MealPage'
import { MealsPage } from './pages/MealsPage'
import { PlanPage } from './pages/PlanPage'
import { SnackPage } from './pages/SnackPage'
import { SnapPage } from './pages/SnapPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const hasToken = !!tokenStore.get()
  // A stale/invalid token shows up as 401 on /me: the client clears it, we go to login.
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: hasToken, staleTime: 60_000 })
  useEffect(() => {
    if (me.isError) navigate('/login', { replace: true })
  }, [me.isError, navigate])

  if (!hasToken) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function App() {
  useEffect(() => {
    applyTheme()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', applyTheme)
    return () => mq.removeEventListener('change', applyTheme)
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="meals" element={<MealsPage />} />
        <Route path="meals/:id" element={<MealPage />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="insights" element={<InsightsPage />} />
      </Route>
      <Route element={<RequireAuth><BareLayout /></RequireAuth>}>
        <Route path="snap" element={<SnapPage />} />
        <Route path="analysis/:id" element={<AnalysisPage />} />
        <Route path="snack/:id" element={<SnackPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
