import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Routes } from 'react-router'
import { vi } from 'vitest'
import { AddFoodProvider } from '../add/AddFood'
import { ToastProvider } from '../ui/Toast'

/** `path` can be a history (last entry shown) so navigate(-1) has somewhere to go. */
export function renderAt(path: string | string[], routes: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={Array.isArray(path) ? path : [path]} initialIndex={Array.isArray(path) ? path.length - 1 : 0}>
        <ToastProvider>
          <AddFoodProvider>
            <Routes>{routes}</Routes>
          </AddFoodProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

/** Replace fetch with a handler; returns the mock so tests can inspect calls. */
export function mockFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)))
  vi.stubGlobal('fetch', fn)
  return fn
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
