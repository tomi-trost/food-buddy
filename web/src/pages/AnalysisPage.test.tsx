import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { analysisJob, doneJob, ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { AnalysisPage } from './AnalysisPage'

const routes = (
  <>
    <Route path="/analysis/:id" element={<AnalysisPage />} />
    <Route path="/meals/:id" element={<p>meal page</p>} />
  </>
)
const render = (path = '/analysis/5?type=lunch') => renderAt(path, routes)

function api(over: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  return mockFetch((url, init) => {
    const hit = over(url, init)
    if (hit) return hit
    if (url.endsWith('/photo')) return new Response('img')
    if (url.startsWith('/api/ingredients')) return jsonResponse([ING.soy, ING.oil])
    if (url === '/api/meals') return jsonResponse({ id: 42 }, 201)
    return jsonResponse(doneJob())
  })
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

describe('snap flow', () => {
  it('polls while analyzing, then shows the verdict', async () => {
    let calls = 0
    api((url) => {
      if (url.startsWith('/api/analyses/5') && !url.endsWith('/photo')) {
        calls += 1
        return jsonResponse(calls === 1 ? analysisJob() : doneJob())
      }
    })
    render()
    expect(await screen.findByRole('status', { name: 'Analyzing your meal' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Chicken rice bowl' }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('508') // 247.5 + 260; sauce unknown
  })

  it('blocks continuing until the unknown ingredient is resolved', async () => {
    api()
    render()
    const next = await screen.findByRole('button', { name: 'Looks right' })
    expect(next).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('Pick or remove 1 unknown ingredient')

    fireEvent.click(screen.getByRole('button', { name: /mystery sauce · 30g/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Pick ingredient' })
    expect(within(sheet).getByLabelText('Search ingredients')).toHaveValue('mystery sauce')
    fireEvent.click(await within(sheet).findByText('Soy sauce'))

    expect(screen.getByRole('button', { name: /Soy sauce · 30g/ })).toBeInTheDocument()
    expect(next).toBeEnabled()
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('526') // + 30 g soy sauce (18 kcal)
  })

  it('edits grams, portions eaten and removes items', async () => {
    api()
    render()
    fireEvent.click(await screen.findByRole('button', { name: /Rice \(cooked\) · 200g/ }))
    const sheet = screen.getByRole('dialog', { name: 'Edit ingredient' })
    expect(within(sheet).getByText('Detected as “cooked rice”')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByLabelText('Less grams')) // 175 g
    fireEvent.click(within(sheet).getByText('Done'))
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('475') // 247.5 + 227.5

    fireEvent.click(screen.getByLabelText('More portions eaten'))
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('713') // × 1.5

    fireEvent.click(screen.getByRole('button', { name: /Chicken breast/ }))
    fireEvent.click(screen.getByText('Remove ingredient'))
    expect(screen.queryByRole('button', { name: /Chicken breast/ })).not.toBeInTheDocument()
  })

  it('posts the meal with plate grams, estimated cost and used-up items', async () => {
    const fetch = api()
    render()
    fireEvent.click(await screen.findByRole('button', { name: /mystery sauce/ }))
    fireEvent.click(screen.getByText('Remove “mystery sauce”'))
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))

    expect(screen.getByLabelText('Dish name')).toHaveValue('Chicken rice bowl')
    expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true')
    // plate cost 1.35 + 0.40 = 1.75 × 2 portions = 3.5 → 4 €
    expect(screen.getByRole('group', { name: 'cost' })).toHaveTextContent('4 €')
    fireEvent.click(screen.getByLabelText('More portions made')) // 5.25 → 5 €
    expect(screen.getByRole('group', { name: 'cost' })).toHaveTextContent('5 €')
    fireEvent.click(screen.getByRole('button', { name: /🍚 Rice \(cooked\)/ }))
    expect(screen.getByText(/Prep: wash and chop rice \(cooked\), chicken breast\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Post meal' }))
    expect(await screen.findByText('meal page')).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/meals')!
    const body = JSON.parse(String(init!.body))
    expect(body).toMatchObject({
      name: 'Chicken rice bowl', meal_type: 'lunch', portions: 3, servings_eaten: 1, prep_minutes: 30,
      cost: null, // untouched → server estimates
      items: [{ ingredient_id: 1, grams: 150 }, { ingredient_id: 2, grams: 200 }],
      used_up: [2], analysis_id: 5,
    })
    expect(body.eaten_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('sends a manual cost once the user changes it', async () => {
    const fetch = api()
    render()
    fireEvent.click(await screen.findByRole('button', { name: /mystery sauce/ }))
    fireEvent.click(screen.getByText('Remove “mystery sauce”'))
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))
    fireEvent.click(screen.getByLabelText('More cost'))
    fireEvent.click(screen.getByRole('button', { name: 'Post meal' }))
    await screen.findByText('meal page')
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/meals')!
    expect(JSON.parse(String(init!.body)).cost).toBe(5)
  })

  it('explains a failed analysis and offers another photo', async () => {
    api((url) =>
      url.startsWith('/api/analyses/5') && !url.endsWith('/photo')
        ? jsonResponse(analysisJob({ status: 'failed', error: 'No vision provider succeeded' }))
        : undefined,
    )
    render()
    expect(await screen.findByText("Couldn't analyze this photo")).toBeInTheDocument()
    expect(screen.getByText('No vision provider succeeded')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another photo' })).toHaveAttribute('href', '/snap')
  })
})
