import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'
import { card, me, meal } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { MealPage } from './MealPage'
import { MealsPage } from './MealsPage'

beforeEach(() => tokenStore.set('tok'))

describe('MealsPage', () => {
  it('shows cards, filters and cycles the sort', async () => {
    mockFetch(() => jsonResponse([
      card({ id: 1, name: 'Oats', types: ['breakfast'], score: 4.6, cooked_count: 9 }),
      card({ id: 2, name: 'Curry', types: ['dinner'], score: null, cost: 16, portions: 4 }),
    ]))
    renderAt('/meals', <Route path="/meals" element={<MealsPage />} />)

    const oats = await screen.findByRole('link', { name: /Oats/ })
    expect(oats).toHaveAttribute('href', '/meals/1')
    expect(within(oats).getByText('4.6')).toBeInTheDocument()
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
    expect(await screen.findByText('No meals yet. Snap your first plate.')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Ratings' }))
    expect(screen.getByText('Not rated yet')).toBeInTheDocument()
    expect(screen.getByText(/Make again: yes · Worth the effort: maybe · Filling: left us hungry/)).toBeInTheDocument()
  })

  it('opens the rating sheet after posting and saves half stars', async () => {
    let saved: unknown
    mealApi((b) => (saved = b))
    renderMeal('/meals/3?rate=1')
    const sheet = await screen.findByRole('dialog', { name: 'Rate meal' })
    fireEvent.click(within(sheet).getByLabelText('3.5 stars'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'No' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Too heavy' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save rating' }))
    await screen.findByText('Rating saved')
    expect(saved).toEqual({ taste: 3.5, again: 1, effort: 3, fill: 'heavy' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('logs a cook with used-up ingredients', async () => {
    let cooked: { meal_type: string; used_up: number[] } | undefined
    mealApi(undefined, (b) => (cooked = b as typeof cooked))
    renderMeal()
    fireEvent.click(await screen.findByRole('button', { name: /I cooked this again/ }))
    const sheet = screen.getByRole('dialog', { name: 'Log this cook' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dinner' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /Rice \(cooked\)/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Logged · ingredients updated')
    expect(cooked).toMatchObject({ meal_type: 'dinner', used_up: [2] })
  })
})
