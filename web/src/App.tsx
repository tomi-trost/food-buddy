import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router'
import { AddFoodProvider, useAddFood } from './add/AddFood'
import { AccessBlocked, api, ApiError, tokenStore } from './api/client'
import { AppLayout, BareLayout } from './layout/AppLayout'
import { applyTheme } from './lib/theme'
import { AnalysisPage } from './pages/AnalysisPage'
import { HomePage } from './pages/HomePage'
import { IngredientsPage } from './pages/IngredientsPage'
import { InsightsPage } from './pages/InsightsPage'
import { LoginPage } from './pages/LoginPage'
import { MealEditPage } from './pages/MealEditPage'
import { MealPage } from './pages/MealPage'
import { MealsPage } from './pages/MealsPage'
import { PlanPage } from './pages/PlanPage'
import { SnackPage } from './pages/SnackPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const hasToken = !!tokenStore.get()
  // A stale/invalid token shows up as 401 on /me: the client clears it, we go to login. Offline
  // stays here (the banner says so); Access that won't let us through goes to login with why.
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: hasToken, staleTime: 60_000 })
  useEffect(() => {
    const error = me.error
    if (error instanceof AccessBlocked) navigate('/login', { replace: true, state: { notice: error.message } })
    else if (error instanceof ApiError && error.status === 401) navigate('/login', { replace: true })
  }, [me.error, navigate])

  if (!hasToken) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

/** Old /snap links (bookmarks, the installed app): open the Add food sheet on Home instead. */
function SnapRedirect() {
  const [params] = useSearchParams()
  const open = useAddFood()
  useEffect(() => {
    const type = params.get('type')
    if (params.get('kind') === 'snack') open({ snack: true })
    else open({ type: params.get('save') === '1' ? 'later' : type === 'breakfast' || type === 'lunch' || type === 'dinner' ? type : undefined })
  }, [params, open])
  return <Navigate to="/" replace />
}

export function App() {
  useEffect(() => {
    applyTheme()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', applyTheme)
    return () => mq.removeEventListener('change', applyTheme)
  }, [])

  return (
    <AddFoodProvider>
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
        <Route path="snap" element={<SnapRedirect />} />
        <Route path="analysis/:id" element={<AnalysisPage />} />
        <Route path="snack/:id" element={<SnackPage />} />
        <Route path="meals/:id/edit" element={<MealEditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </AddFoodProvider>
  )
}
