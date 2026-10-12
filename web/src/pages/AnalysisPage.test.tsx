import { fireEvent, screen, within } from '@testing-library/react'
import { Route, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { AnalysisJob } from '../api/types'
import { analysisJob, doneJob, ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { AnalysisPage } from './AnalysisPage'

function MealStub() {
  const { pathname, search } = useLocation()
  return <><p>meal page</p><p data-testid="at">{pathname + search}</p></>
}

const routes = (
  <>
    <Route path="/" element={<p>home</p>} />
    <Route path="/analysis/:id" element={<AnalysisPage />} />
    <Route path="/meals/:id" element={<MealStub />} />
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

const RATED = { taste: 4.5, again: 5, effort: 3, fill: 'right' } as const
const isJob = (url: string) => url === '/api/analyses/5'

async function postFromVerdict() {
  fireEvent.click(await screen.findByRole('button', { name: /mystery sauce/ }))
  fireEvent.click(screen.getByText('Remove “mystery sauce”'))
  fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))
  fireEvent.click(screen.getByRole('button', { name: 'Post meal' }))
}

describe('waiting in the background', () => {
  it('rates while the model is still working', async () => {
    let job: AnalysisJob = analysisJob({ status: 'running' })
    const fetch = api((url, init) => {
      if (url === '/api/analyses/5/rating') {
        job = { ...job, my_rating: JSON.parse(String(init!.body)) }
        return jsonResponse(job)
      }
      if (isJob(url)) return jsonResponse(job)
    })
    render()
    const card = await screen.findByRole('region', { name: 'Rate it while you wait' })
    fireEvent.click(within(card).getByRole('button', { name: 'Yes' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Save rating' }))
    expect(await screen.findByRole('heading', { name: 'Your rating' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update rating' })).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/analyses/5/rating')!
    expect(init!.method).toBe('PUT')
    expect(JSON.parse(String(init!.body))).toEqual({ taste: 4, again: 5, effort: 3, fill: 'right' })
  })

  it('shows an earlier rating and lets me leave to check later', async () => {
    api((url) => (isJob(url) ? jsonResponse(analysisJob({ my_rating: RATED })) : undefined))
    render()
    expect(await screen.findByRole('heading', { name: 'Your rating' })).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check it later' }))
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('skips the rating step after posting when I rated while waiting', async () => {
    api((url) => (isJob(url) ? jsonResponse({ ...doneJob(), my_rating: RATED }) : undefined))
    render()
    await postFromVerdict()
    expect(await screen.findByTestId('at')).toHaveTextContent(/^\/meals\/42$/)
  })

  it('asks for a rating after posting when I did not rate yet', async () => {
    api()
    render()
    await postFromVerdict()
    expect(await screen.findByTestId('at')).toHaveTextContent('/meals/42?rate=1')
  })

  it("follows to the partner's meal when they posted the photo first", async () => {
    let posted = false
    api((url) => {
      if (url === '/api/meals') {
        posted = true
        return jsonResponse({ detail: 'This photo was already posted' }, 409)
      }
      if (isJob(url)) return jsonResponse(posted ? { ...doneJob(), closed: true, meal_id: 77 } : doneJob())
    })
    render()
    await postFromVerdict()
    expect(await screen.findByTestId('at')).toHaveTextContent('/meals/77')
    expect(screen.getByText('Already posted — here it is')).toBeInTheDocument()
  })

  it('opens the meal right away when the photo was already posted', async () => {
    api((url) => (isJob(url) ? jsonResponse(analysisJob({ status: 'done', closed: true, meal_id: 12 })) : undefined))
    render()
    expect(await screen.findByTestId('at')).toHaveTextContent('/meals/12')
  })

  it('retries a failed analysis', async () => {
    let job: AnalysisJob = analysisJob({ status: 'failed', error: 'model timed out' })
    const fetch = api((url) => {
      if (url === '/api/analyses/5/retry') {
        job = analysisJob({ status: 'queued' })
        return jsonResponse(job, 202)
      }
      if (isJob(url)) return jsonResponse(job)
    })
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('status', { name: 'Analyzing your meal' })).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url, init]) => url === '/api/analyses/5/retry' && init?.method === 'POST')).toBe(true)
  })

  it('discards the photo and goes home', async () => {
    const fetch = api((url) => {
      if (url === '/api/analyses/5/discard') return jsonResponse(analysisJob({ closed: true }))
      if (isJob(url)) return jsonResponse(analysisJob({ status: 'running' }))
    })
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this photo' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(screen.getByText('Photo discarded')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url]) => url === '/api/analyses/5/discard')).toBe(true)
  })

  it('says so when opening a discarded photo', async () => {
    api((url) => (isJob(url) ? jsonResponse(analysisJob({ status: 'done', closed: true })) : undefined))
    render()
    expect(await screen.findByText('This photo was discarded')).toBeInTheDocument()
  })

  it('shows a save error', async () => {
    api((url) => {
      if (url === '/api/analyses/5/rating') return jsonResponse({ detail: 'This photo was discarded' }, 409)
      if (isJob(url)) return jsonResponse(analysisJob())
    })
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Save rating' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This photo was discarded')
  })
})
