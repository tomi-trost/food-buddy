import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { AppLayout } from './AppLayout'

const routes = (
  <>
    <Route element={<AppLayout />}>
      <Route index element={<p>home</p>} />
      <Route path="meals" element={<p>meals</p>} />
    </Route>
  </>
)

beforeEach(() => {
  mockFetch((url) => jsonResponse(url === '/api/analyses/open' ? [] : { id: 1 }))
})

describe('AppLayout', () => {
  it('highlights the active tab and navigates', () => {
    renderAt('/meals', routes)
    expect(screen.getByRole('link', { name: 'Meals' })).toHaveClass('on')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('on')
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('opens the Add food sheet from the + button', () => {
    renderAt('/', routes)
    fireEvent.click(screen.getByRole('button', { name: 'Add food' }))
    expect(screen.getByRole('dialog', { name: 'Add food' })).toBeInTheDocument()
  })
})
