import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it } from 'vitest'
import { renderAt } from '../test/utils'
import { AppLayout } from './AppLayout'

const routes = (
  <>
    <Route element={<AppLayout />}>
      <Route index element={<p>home</p>} />
      <Route path="meals" element={<p>meals</p>} />
    </Route>
    <Route path="snap" element={<p>snap page</p>} />
  </>
)

describe('AppLayout', () => {
  it('highlights the active tab and navigates', () => {
    renderAt('/meals', routes)
    expect(screen.getByRole('link', { name: 'Meals' })).toHaveClass('on')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('on')
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('opens the snap flow from the camera button', () => {
    renderAt('/', routes)
    fireEvent.click(screen.getByRole('button', { name: 'Snap meal' }))
    expect(screen.getByText('snap page')).toBeInTheDocument()
  })
})
