import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { UpdatePrompt } from './layout/UpdatePrompt'
import { WhatsNew } from './layout/WhatsNew'
import { disablePinchZoom } from './lib/noZoom'
import { ToastProvider } from './ui/Toast'
import './styles.css'

disablePinchZoom()

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          {/* in the page flow above every screen: pushes it down instead of covering it */}
          <div className="notices">
            <UpdatePrompt />
            <WhatsNew />
          </div>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
