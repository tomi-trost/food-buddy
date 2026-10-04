import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { tokenStore } from './api/client'
import { AnalysisPage } from './pages/AnalysisPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { SnapPage } from './pages/SnapPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!tokenStore.get()) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/snap" element={<RequireAuth><SnapPage /></RequireAuth>} />
      <Route path="/analysis/:id" element={<RequireAuth><AnalysisPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
