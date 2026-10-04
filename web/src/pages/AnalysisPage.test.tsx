import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisJob } from '../api/types'
import { tokenStore } from '../api/client'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { AnalysisPage } from './AnalysisPage'

const per100 = {
  chicken: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 },
  rice: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0 },
}

const job = (over: Partial<AnalysisJob>): AnalysisJob => ({
  id: 5, status: 'queued', photo_url: '/api/analyses/5/photo', provider: null, result: null,
  error: null, created_at: '2026-10-04T12:00:00Z', finished_at: null, ...over,
})

const done = job({
  status: 'done',
  provider: 'local',
  result: {
    dish: 'Chicken rice bowl', meal_type: 'dinner', servings: 1, unmatched: 1,
    totals: { kcal: 507.5, protein: 51.9, carbs: 56, fat: 6, fiber: 0.8, sugar: 0 },
    items: [
      { name: 'grilled chicken', grams: 150, confidence: 0.9, nutrients: null,
        ingredient: { id: 1, name: 'Chicken breast', per100: per100.chicken, score: 1 } },
      { name: 'cooked rice', grams: 200, confidence: 0.8, nutrients: null,
        ingredient: { id: 2, name: 'Rice (cooked)', per100: per100.rice, score: 1 } },
      { name: 'mystery sauce', grams: 30, confidence: 0.2, ingredient: null, nutrients: null },
    ],
  },
})

const render = () => renderAt('/analysis/5', <Route path="/analysis/:id" element={<AnalysisPage />} />)

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

describe('AnalysisPage', () => {
  it('shows totals and recalculates them when grams change', async () => {
    mockFetch((url) => (url.endsWith('/photo') ? new Response('img') : jsonResponse(done)))
    render()

    expect(await screen.findByRole('heading', { name: 'Chicken rice bowl' })).toBeInTheDocument()
    expect(screen.getByTestId('total-kcal')).toHaveTextContent('508') // 247.5 + 260
    expect(screen.getByText(/“mystery sauce” isn't in the food database/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Grams of Rice (cooked)'), { target: { value: '100' } })
    expect(screen.getByTestId('total-kcal')).toHaveTextContent('378') // 247.5 + 130
    expect(screen.getByTestId('total-carbs')).toHaveTextContent('28 g')
  })

  it('polls while the job is queued, then shows the result', async () => {
    let calls = 0
    mockFetch((url) => {
      if (url.endsWith('/photo')) return new Response('img')
      calls += 1
      return jsonResponse(calls === 1 ? job({ status: 'queued' }) : done)
    })
    render()

    expect(await screen.findByRole('status')).toHaveTextContent('Analyzing your meal')
    expect(
      await screen.findByRole('heading', { name: 'Chicken rice bowl' }, { timeout: 4000 }),
    ).toBeInTheDocument()
  })

  it('explains a failed analysis and offers another photo', async () => {
    mockFetch((url) =>
      url.endsWith('/photo')
        ? new Response('img')
        : jsonResponse(job({ status: 'failed', error: 'No vision provider succeeded' })),
    )
    render()

    expect(await screen.findByText("Couldn't analyze this photo")).toBeInTheDocument()
    expect(screen.getByText('No vision provider succeeded')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another photo' })).toHaveAttribute('href', '/snap')
  })
})
