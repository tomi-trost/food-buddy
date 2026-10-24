import { act, fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { card, me, meal } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { MealPage } from './MealPage'
import { MealsPage } from './MealsPage'

beforeEach(() => tokenStore.set('tok'))

describe('MealsPage', () => {
  it('shows cards, filters and cycles the sort', async () => {
    mockFetch(() => jsonResponse([
      card({ id: 1, name: 'Oats', types: ['breakfast'], score: 4.2, taste: 4.6, cooked_count: 9 }),
      card({ id: 2, name: 'Curry', types: ['dinner'], score: null, cost: 16, portions: 4 }),
    ]))
    renderAt('/meals', <Route path="/meals" element={<MealsPage />} />)

    const oats = await screen.findByRole('link', { name: /Oats/ })
    expect(oats).toHaveAttribute('href', '/meals/1')
    expect(within(oats).getByText('4.6')).toBeInTheDocument() // the stars: taste, not the score
    expect(within(oats).getByText('Cooked 9×')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Curry/ })).getByText('unrated')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Curry/ })).getByText('30 min · 4.00 €/portion')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Breakfast/ }))
    expect(screen.queryByRole('link', { name: /Curry/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sort: Top rated' }))
    expect(screen.getByRole('button', { name: 'Sort: Most recent' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Top rated' }))
    fireEvent.click(screen.getByRole('button', { name: /Dinner/ }))
    expect(screen.getByText('No meals match this filter.')).toBeInTheDocument()
  })

  it('invites the first snap when there are no meals', async () => {
    mockFetch(() => jsonResponse([]))
    renderAt('/meals', <Route path="/meals" element={<MealsPage />} />)
    expect(await screen.findByText('No meals yet. Snap or type your first plate.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add your first meal/ }))
    expect(screen.getByRole('dialog', { name: 'Add food' })).toBeInTheDocument()
  })
})

function mealApi(onPut?: (body: unknown) => void, onCook?: (body: unknown) => void) {
  return mockFetch((url, init) => {
    if (url === '/api/auth/me') return jsonResponse(me())
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      onPut?.(body)
      return jsonResponse(meal({
        score: 4,
        ratings: [
          { user_id: 1, name: 'Tomi', color: '#b9532f', rating: body },
          meal().ratings[1],
        ],
      }))
    }
    if (url.endsWith('/cook')) {
      onCook?.(JSON.parse(String(init!.body)))
      return jsonResponse(meal({ cooked_count: 2 }))
    }
    return jsonResponse(meal())
  })
}

const renderMeal = (path = '/meals/3') => renderAt(path, <Route path="/meals/:id" element={<MealPage />} />)

describe('MealPage', () => {
  it('switches between recipe, nutrition and ratings', async () => {
    mealApi()
    renderMeal()
    expect(await screen.findByRole('heading', { name: 'Chicken rice bowl' })).toBeInTheDocument()
    expect(screen.getByText('3.58 € total · 1.79 € / portion')).toBeInTheDocument()
    expect(screen.getByText('(quick draft)')).toBeInTheDocument()
    expect(screen.getByLabelText('Stats')).toHaveTextContent('1×cooked')

    fireEvent.click(screen.getByRole('button', { name: 'Nutrition' }))
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('552')
    expect(screen.getByText(/^Left us hungry\. Try \+50 g/)).toBeInTheDocument()

    expect(within(screen.getByLabelText('Your rating')).getByText('Not rated yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ratings' }))
    expect(screen.getAllByText('Not rated yet')).toHaveLength(2) // my card on top and in the tab
    expect(screen.getByText(/Make again: yes · Worth the effort: meh · Filling: left us hungry/)).toBeInTheDocument()
  })

  it('opens the rating sheet after posting and saves half stars', async () => {
    let saved: unknown
    mealApi((b) => (saved = b))
    renderMeal('/meals/3?rate=1')
    const sheet = await screen.findByRole('dialog', { name: 'Rate meal' })
    fireEvent.click(within(sheet).getByLabelText('3.5 stars'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'No' }))
    const effort = within(sheet).getByRole('slider', { name: 'Worth the effort' })
    expect(effort).toHaveValue('0')
    expect(effort).toHaveAttribute('aria-valuetext', 'Meh')
    fireEvent.change(effort, { target: { value: '2' } })
    expect(effort).toHaveAttribute('aria-valuetext', 'Mostly')
    fireEvent.change(within(sheet).getByRole('slider', { name: 'How filling' }), { target: { value: '3' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save rating' }))
    await screen.findByText('Rating saved')
    expect(saved).toEqual({ taste: 3.5, again: 1, effort: 2, fill: 3 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the average taste, and rates a snack on taste and "have it again" only', async () => {
    const snack = meal({
      types: ['snack'], snack_kind: 'sweet', score: 4.25, taste: 4.5,
      ratings: [{ user_id: 2, name: 'Partner', color: '#5d8582', rating: { taste: 4.5, again: 5, effort: null, fill: null } }, { user_id: 1, name: 'Tomi', color: '#b9532f', rating: null }],
    })
    let saved: unknown
    mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(me())
      if (init?.method === 'PUT') saved = JSON.parse(String(init.body))
      return jsonResponse(snack)
    })
    renderMeal()
    expect(await screen.findByLabelText('Stats')).toHaveTextContent('4.5avg taste')
    fireEvent.click(screen.getByRole('button', { name: 'Ratings' }))
    expect(screen.getByText('Have it again: yes')).toBeInTheDocument()

    fireEvent.click(within(screen.getByLabelText('Your rating')).getByRole('button', { name: 'Rate' }))
    const sheet = screen.getByRole('dialog', { name: 'Rate meal' })
    expect(within(sheet).queryByRole('slider')).not.toBeInTheDocument()
    expect(within(sheet).queryByText('How filling was it?')).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Yes' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save rating' }))
    await vi.waitFor(() => expect(saved).toMatchObject({ taste: 4, again: 5 }))
  })

  it('shows eaten-out food as not in our meals and saves it there', async () => {
    const out = meal({ origin: 'out', listed: false, place: 'Trattoria Rosa', cost: 14.5, cost_estimated: false, portions: 1, prep_minutes: 0, steps: [] })
    let patched: unknown
    mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(me())
      if (init?.method === 'PATCH') {
        patched = JSON.parse(String(init.body))
        return jsonResponse({ ...out, listed: true })
      }
      return jsonResponse(out)
    })
    renderMeal()
    expect(await screen.findByText('🍽️ Ate out · Trattoria Rosa')).toBeInTheDocument()
    expect(screen.getByText('14.50 € paid')).toBeInTheDocument()
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Your rating')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recipe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ratings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to plan/ })).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByLabelText('Not in our meals')).getByRole('button', { name: 'Save to our meals' }))
    expect(await screen.findByText('Saved to our meals')).toBeInTheDocument()
    expect(patched).toEqual({ listed: true })
    expect(screen.getByLabelText('Your rating')).toBeInTheDocument() // rate it once it's ours
  })

  it('removes my rating', async () => {
    const rated = meal({ ratings: [{ user_id: 1, name: 'Tomi', color: '#b9532f', rating: { taste: 4, again: 5, effort: 3, fill: 0 } }, meal().ratings[1]] })
    const fetch = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(me())
      if (init?.method === 'DELETE') return jsonResponse(meal())
      return jsonResponse(rated)
    })
    renderMeal()
    const card = await screen.findByLabelText('Your rating')
    expect(within(card).getByRole('img', { name: '4 of 5 stars' })).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Change' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Rate meal' })).getByRole('button', { name: 'Remove my rating' }))
    expect(await screen.findByText('Rating removed')).toBeInTheDocument()
    expect(fetch.mock.calls.find(([, i]) => i?.method === 'DELETE')![0]).toBe('/api/meals/3/rating')
    expect(within(screen.getByLabelText('Your rating')).getByText('Not rated yet')).toBeInTheDocument()
  })

  it('offers no removal before I rated', async () => {
    mealApi()
    renderMeal()
    fireEvent.click(within(await screen.findByLabelText('Your rating')).getByRole('button', { name: 'Rate' }))
    expect(screen.getByRole('dialog', { name: 'Rate meal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove my rating' })).not.toBeInTheDocument()
  })

  it('opens the edit page and notes typed-in nutrition', async () => {
    mockFetch((url) => (url === '/api/auth/me' ? jsonResponse(me()) : jsonResponse(meal({
      nutrients_overridden: true, per_portion: { ...meal().per_portion, kcal: 700 },
    }))))
    renderAt('/meals/3', (
      <>
        <Route path="/meals/:id" element={<MealPage />} />
        <Route path="/meals/:id/edit" element={<p>edit page</p>} />
      </>
    ))
    fireEvent.click(await screen.findByRole('button', { name: 'Nutrition' }))
    expect(screen.getByText(/your values \(calculated 552 kcal\)/)).toBeInTheDocument()
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('700')
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    expect(screen.getByText('edit page')).toBeInTheDocument()
  })

  it('logs a cook with used-up ingredients', async () => {
    let cooked: { meal_type: string; used_up: number[] } | undefined
    mealApi(undefined, (b) => (cooked = b as typeof cooked))
    renderMeal()
    fireEvent.click(await screen.findByRole('button', { name: /I cooked this again/ }))
    const sheet = screen.getByRole('dialog', { name: 'Log this meal' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dinner' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /Rice \(cooked\)/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'More portions eaten' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log 828 kcal' }))
    await screen.findByText('Logged · ingredients updated')
    expect(cooked).toEqual({ meal_type: 'dinner', eaten_on: expect.any(String), servings_eaten: 1.5, cooked: true, used_up: [2] })
  })

  it('logs leftovers without touching stock or used-up ingredients', async () => {
    let cooked: unknown
    mealApi(undefined, (b) => (cooked = b))
    renderMeal()
    fireEvent.click(await screen.findByRole('button', { name: /I cooked this again/ }))
    const sheet = screen.getByRole('dialog', { name: 'Log this meal' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Rice \(cooked\)/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Already made' }))
    expect(within(sheet).queryByText('Used up an ingredient?')).not.toBeInTheDocument()
    expect(within(sheet).getByText(/Stock stays as it is/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log 552 kcal' }))
    await screen.findByText('Logged')
    expect(cooked).toMatchObject({ meal_type: 'lunch', servings_eaten: 1, cooked: false, used_up: [] })
  })
})

describe('MealPage undo', () => {
  const routes = (
    <>
      <Route path="/meals/:id" element={<MealPage />} />
      <Route path="/analysis/:id" element={<p>check photo</p>} />
      <Route path="/" element={<p>home</p>} />
    </>
  )
  const undoApi = (undo: Response | (() => Response), current = meal({ undo_until: new Date(Date.now() + 5 * 60_000).toISOString() })) =>
    mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(me())
      if (url === '/api/meals/3/undo' && init?.method === 'POST') return typeof undo === 'function' ? undo() : undo
      return jsonResponse(current)
    })

  it('takes the post back and returns to the photo', async () => {
    const fetch = undoApi(() => jsonResponse({ analysis_id: 5 }))
    renderAt('/meals/3', routes)
    const card = await screen.findByRole('region', { name: 'Undo post' })
    fireEvent.click(within(card).getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('check photo')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/meals/3/undo', expect.objectContaining({ method: 'POST' }))
  })

  it('goes home for a meal without photo', async () => {
    undoApi(() => jsonResponse({ analysis_id: null }))
    renderAt('/meals/3', routes)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Undo post' })).getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
  })

  it('explains a refused undo', async () => {
    undoApi(() => jsonResponse({ detail: 'Ana logged it too, so it stays' }, 409))
    renderAt('/meals/3', routes)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Undo post' })).getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ana logged it too, so it stays')
  })

  it('has no undo once the time is up or for the partner', async () => {
    undoApi(jsonResponse({}), meal({ undo_until: null }))
    renderAt('/meals/3', routes)
    expect(await screen.findByRole('heading', { name: 'Chicken rice bowl' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Undo post' })).not.toBeInTheDocument()
  })

  it('hides the undo when the time runs out while looking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    undoApi(jsonResponse({}), meal({ undo_until: new Date(Date.now() + 1000).toISOString() }))
    renderAt('/meals/3', routes)
    expect(await screen.findByRole('region', { name: 'Undo post' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(1500) })
    expect(screen.queryByRole('region', { name: 'Undo post' })).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('MealsPage log button', () => {
  it('logs a meal straight from its card for the filtered meal type', async () => {
    let cooked: unknown
    mockFetch((url, init) => {
      if (url === '/api/meals') return jsonResponse([card({ id: 3, name: 'Chicken rice bowl', types: ['lunch'] })])
      if (url.endsWith('/cook')) {
        cooked = JSON.parse(String(init!.body))
        return jsonResponse(meal({ cooked_count: 2 }))
      }
      return jsonResponse(meal())
    })
    renderAt('/meals?type=dinner&seg=all', <Route path="/meals" element={<MealsPage />} />)
    fireEvent.click(screen.getByRole('button', { name: /Lunch/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Log Chicken rice bowl' }))
    const sheet = await screen.findByRole('dialog', { name: 'Log this meal' })
    expect(within(sheet).getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log 552 kcal' }))
    await screen.findByText('Logged · ingredients updated')
    expect(cooked).toMatchObject({ meal_type: 'lunch', cooked: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
