import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { SnapPage } from './SnapPage'

beforeEach(() => tokenStore.set('tok'))

describe('SnapPage', () => {
  it('uploads the photo and keeps the meal type for the next step', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 9, status: 'queued' }, 202))
    renderAt('/snap?type=breakfast', (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
      </>
    ))
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    expect(input).toHaveAttribute('capture', 'environment')
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    expect(fetch.mock.calls[0][0]).toBe('/api/analyses')
  })
})

