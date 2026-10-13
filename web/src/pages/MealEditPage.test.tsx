import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'
import type { Meal } from '../api/types'
import { ING, meal } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { MealEditPage } from './MealEditPage'

const routes = (
  <>
    <Route path="/meals" element={<p>meals list</p>} />
    <Route path="/meals/:id" element={<p>meal page</p>} />
    <Route path="/meals/:id/edit" element={<MealEditPage />} />
  </>
)

function api(current: Meal = meal()) {
  return mockFetch((url, init) => {
    if (url.startsWith('/api/ingredients')) return jsonResponse([ING.soy, ING.oil])
    if (init?.method === 'PATCH') return jsonResponse(current)
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return jsonResponse(current)
  })
}

const bodyOf = (fetch: ReturnType<typeof api>, method: string) => {
  const call = fetch.mock.calls.find(([, i]) => i?.method === method)
  return call && { url: call[0], body: call[1]!.body ? JSON.parse(String(call[1]!.body)) : null }
}

// meal(): rice 400 g + chicken 300 g for 2 portions → (520 + 495) / 2 = 507.5 kcal per portion
const render = () => renderAt(['/meals', '/meals/3', '/meals/3/edit'], routes)

beforeEach(() => tokenStore.set('tok'))

describe('MealEditPage', () => {
  it('saves every field, ingredients included', async () => {
    const fetch = api()
    render()
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Rice bowl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }))
    expect(screen.getByRole('button', { name: 'Lunch' })).toBeEnabled() // two types now
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // prep-friendly
    fireEvent.click(screen.getByLabelText('More portions made'))
    fireEvent.click(screen.getByLabelText('More prep time'))

    fireEvent.click(screen.getByRole('button', { name: /Chicken breast · 300 g/ }))
    fireEvent.click(screen.getByLabelText('Less amount'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: /add/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Olive oil/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('meal page')).toBeInTheDocument()
    expect(bodyOf(fetch, 'PATCH')!.body).toEqual({
      name: 'Rice bowl', types: ['lunch', 'dinner'], prep_friendly: true, prep_minutes: 25, portions: 3,
      cost: null, // estimated before and untouched
      items: [{ ingredient_id: 2, grams: 400 }, { ingredient_id: 1, grams: 275 }, { ingredient_id: 5, grams: 100 }],
      per_portion: null,
    })
  })

  it('edits, reorders, removes and adds recipe steps', async () => {
    const fetch = api()
    render()
    const first = await screen.findByLabelText('Step 1')
    expect(first).toHaveValue('Cook rice.')
    fireEvent.change(first, { target: { value: 'Cook the rice for 12 min.' } })
    fireEvent.click(screen.getByLabelText('Move step 2 up'))
    expect(screen.getByLabelText('Step 1')).toHaveValue('Serve.')
    expect(screen.getByLabelText('Move step 1 up')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '+ Add step' }))
    fireEvent.change(screen.getByLabelText('Step 3'), { target: { value: '  Add sesame.  ' } })
    fireEvent.click(screen.getByLabelText('Remove step 1'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add step' })) // left empty: dropped

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('meal page')).toBeInTheDocument()
    expect(bodyOf(fetch, 'PATCH')!.body.steps).toEqual(['Cook the rice for 12 min.', 'Add sesame.'])
  })

  it('needs at least one step with text', async () => {
    api(meal({ steps: ['Only step.'] }))
    render()
    expect(await screen.findByLabelText('Remove step 1')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('recalculates per portion as ingredients and portions change, and saves typed-in values', async () => {
    const fetch = api()
    render()
    const card = (await screen.findByText('Calculated from the ingredients')).closest('section')!
    expect(within(card).getByTestId('macro-kcal')).toHaveTextContent('508')
    fireEvent.click(screen.getByLabelText('More portions made')) // 3 portions
    expect(within(card).getByTestId('macro-kcal')).toHaveTextContent('338')

    fireEvent.click(within(card).getByRole('button', { name: 'Edit values' }))
    fireEvent.change(within(card).getByLabelText('kcal'), { target: { value: '400' } })
    expect(within(card).getByTestId('macro-kcal')).toHaveTextContent('400')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('meal page')
    expect(bodyOf(fetch, 'PATCH')!.body.per_portion).toMatchObject({ kcal: 400 })
  })

  it('starts from the typed-in values and can reset them', async () => {
    const fetch = api(meal({ nutrients_overridden: true, per_portion: { ...meal().per_portion, kcal: 700 } }))
    render()
    expect(await screen.findByText('Your values · calculated 508 kcal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use the calculated values' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('meal page')
    expect(bodyOf(fetch, 'PATCH')!.body.per_portion).toBeNull()
  })

  it('keeps a manual cost and can go back to the estimate', async () => {
    const fetch = api(meal({ cost: 9, cost_estimated: false }))
    render()
    expect(await screen.findByText('your amount')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Use the estimate/ }))
    expect(screen.getByText('estimated from prices')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('meal page')
    expect(bodyOf(fetch, 'PATCH')!.body.cost).toBeNull()
  })

  it("can't save without a name or ingredients", async () => {
    api()
    render()
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bowl' } })
    for (const name of [/Rice \(cooked\) · 400 g/, /Chicken breast · 300 g/]) {
      fireEvent.click(screen.getByRole('button', { name }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove ingredient' }))
    }
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByText('A meal needs at least one ingredient.')).toBeInTheDocument()
  })

  it('deletes the meal and its log entries by default', async () => {
    const fetch = api(meal({ logged_count: 2 }))
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete meal' }))
    const sheet = screen.getByRole('dialog', { name: 'Delete meal' })
    expect(within(sheet).getByText('(logged 2 times)')).toBeInTheDocument()
    expect(within(sheet).getByRole('checkbox')).toBeChecked()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete meal' }))
    expect(await screen.findByText('meals list')).toBeInTheDocument()
    expect(bodyOf(fetch, 'DELETE')!.url).toBe('/api/meals/3?keep_log=false')
    expect(screen.getByText('Meal deleted')).toBeInTheDocument()
  })

  it('can keep the log entries when deleting', async () => {
    const fetch = api()
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete meal' }))
    const sheet = screen.getByRole('dialog', { name: 'Delete meal' })
    expect(within(sheet).getByText('(logged once)')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('checkbox'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete meal' }))
    await screen.findByText('meals list')
    expect(bodyOf(fetch, 'DELETE')!.url).toBe('/api/meals/3?keep_log=true')
  })

  it('cancelling the delete changes nothing', async () => {
    const fetch = api(meal({ logged_count: 0 }))
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete meal' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument() // never eaten: nothing to keep
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodyOf(fetch, 'DELETE')).toBeUndefined()
  })
})
