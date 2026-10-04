import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Meal } from '../api/types'
import { tokenStore } from '../api/client'
import { ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { MealPage } from './MealPage'
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

describe('MealPage', () => {
  it('shows the meal with per-portion nutrition and steps', async () => {
    const meal: Meal = {
      id: 3, name: 'Chicken rice bowl', emoji: '🍚', photo_url: null, types: ['lunch'], tags: [],
      prep_minutes: 20, portions: 2, cost: 3.58, cost_estimated: true, steps: ['Cook rice.', 'Serve.'],
      steps_source: 'template', created_at: '2026-10-04T12:00:00Z',
      per_portion: { kcal: 551.7, protein: 51.9, carbs: 56, fat: 9.9, fiber: 0.8, sugar: 0 },
      ingredients: [{ ingredient: ING.rice, grams: 400 }, { ingredient: ING.chicken, grams: 300 }],
    }
    mockFetch(() => jsonResponse(meal))
    renderAt('/meals/3', <Route path="/meals/:id" element={<MealPage />} />)
    expect(await screen.findByRole('heading', { name: 'Chicken rice bowl' })).toBeInTheDocument()
    expect(screen.getByText('3.58 € total · 1.79 € / portion')).toBeInTheDocument()
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('552')
    expect(screen.getByText('(quick draft)')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Chicken rice bowl' })).toHaveTextContent('🍚') // gradient fallback
  })
})
