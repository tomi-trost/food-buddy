import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { Ingredient, Meal } from '../api/types'
import { useAddFood } from '../add/AddFood'
import { EntrySheet } from '../day/EntrySheet'
import { usualAmount } from '../meals/CookSheet'
import { AnalysisPage } from '../pages/AnalysisPage'
import { MealEditPage } from '../pages/MealEditPage'
import { MealPage } from '../pages/MealPage'
import { MealsPage } from '../pages/MealsPage'
import { card, doneJob, logEntry, me, meal } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'

// Snacks are meals (decision 0025)
const n = (kcal: number, sugar = 0) => ({ kcal, protein: 1, carbs: 10, fat: 2, fiber: 0, sugar })
const cola: Ingredient = {
  id: 70, name: 'Coca-Cola', emoji: '🥤', category: 'Pantry', location: 'pantry', price_per_100g: 0,
  per100: n(42, 10.6), unit: 'ml', unit_grams: 1,
}
const product = (over: Partial<Meal> = {}): Meal => meal({
  id: 7, name: 'Coca-Cola', emoji: '🥤', types: ['snack'], snack_kind: 'drink', per: '100ml', piece_g: null,
  is_product: true, per_unit: n(42, 10.6), portion_g: 330, steps: [], steps_source: 'ours', prep_minutes: 1, portions: 1,
  ingredients: [{ ingredient: cola, grams: 330 }], per_portion: n(138.6, 35), per_portion_calculated: n(138.6, 35),
  ...over,
})
const pudding = (over: Partial<Meal> = {}): Meal => meal({
  id: 8, name: 'Chia pudding', emoji: '🥣', types: ['snack'], snack_kind: 'sweet', per: 'portion', per_unit: n(250, 12),
  per_portion: n(250, 12), portion_g: 200, portions: 4, ...over,
})

const sent = (fetch: ReturnType<typeof mockFetch>, match: (url: string) => boolean) => {
  const call = fetch.mock.calls.find(([u, i]) => match(String(u)) && i?.method && i.method !== 'GET')
  return call && JSON.parse(String(call[1]!.body))
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

describe('Meals → Snacks', () => {
  const cards = [
    card({ id: 1, name: 'Curry', types: ['dinner'] }),
    card({ id: 7, name: 'Coca-Cola', types: ['snack'], snack_kind: 'drink', per: '100ml', per_unit: n(42), is_product: true, cooked_count: 3 }),
    card({ id: 8, name: 'Oat bars', types: ['breakfast', 'snack'], snack_kind: 'sweet', per: 'piece', per_unit: n(180) }),
  ]

  it('lists snack meals with their unit and how often we had them; All keeps the meals', async () => {
    mockFetch(() => jsonResponse(cards))
    renderAt('/meals?type=snacks', <Route path="/meals" element={<MealsPage />} />)
    const coke = await screen.findByRole('link', { name: /Coca-Cola/ })
    expect(within(coke).getByText('Drink · 42 kcal / 100 ml')).toBeInTheDocument()
    expect(within(coke).getByText('Eaten 3×')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Oat bars/ })).getByText('Sweet · 180 kcal / piece')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Curry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /All/ }))
    expect(screen.getByRole('link', { name: /Curry/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Oat bars/ })).toBeInTheDocument() // a breakfast too
    expect(screen.queryByRole('link', { name: /Coca-Cola/ })).not.toBeInTheDocument()
  })

  it('logs a snack from its card by amount in its unit', async () => {
    const fetch = mockFetch((url) => (url === '/api/meals' ? jsonResponse(cards) : jsonResponse(product())))
    renderAt('/meals?type=snacks', <Route path="/meals" element={<MealsPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log Coca-Cola' }))
    const sheet = await screen.findByRole('dialog', { name: 'Log this snack' })
    expect(within(sheet).getByRole('textbox', { name: 'amount' })).toHaveValue('330')
    expect(within(sheet).queryByRole('button', { name: 'Already made' })).not.toBeInTheDocument() // a product
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log 139 kcal' }))
    await screen.findByText('Logged · ingredients updated')
    expect(sent(fetch, (u) => u.endsWith('/cook'))).toEqual({
      meal_type: 'snack', eaten_on: expect.any(String), amount: 330, cooked: true, used_up: [],
    })
  })

  it('invites the first snack', async () => {
    mockFetch(() => jsonResponse([card({ types: ['dinner'] })]))
    renderAt('/meals?type=snacks', <Route path="/meals" element={<MealsPage />} />)
    expect(await screen.findByRole('button', { name: /Add a snack/ })).toBeInTheDocument()
  })
})

describe('logging a home-made snack', () => {
  it('is from the jar by default, counted in portions', async () => {
    const fetch = mockFetch(() => jsonResponse(pudding()))
    renderAt('/meals/8', <Route path="/meals/:id" element={<MealPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: /I had this again/ }))
    const sheet = screen.getByRole('dialog', { name: 'Log this snack' })
    expect(within(sheet).getByRole('button', { name: 'Already made' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).queryByText('Used up an ingredient?')).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByLabelText('More amount'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log 375 kcal' }))
    await screen.findByText('Logged')
    expect(sent(fetch, (u) => u.endsWith('/cook'))).toMatchObject({ meal_type: 'snack', amount: 1.5, cooked: false })
  })

  it('starts from a usual portion in the snack’s unit', () => {
    expect(usualAmount({ per: 'portion', piece_g: null, portion_g: 200 })).toBe(1)
    expect(usualAmount({ per: 'piece', piece_g: 12, portion_g: 36 })).toBe(3)
    expect(usualAmount({ per: '100g', piece_g: null, portion_g: 187.4 })).toBe(187)
    expect(usualAmount({ per: '100ml', piece_g: null, portion_g: 0 })).toBe(1)
  })
})

describe('a product’s page', () => {
  it('is a simple view: values from the pack, ratings, and a way to make it a recipe', async () => {
    mockFetch((url) => (url === '/api/auth/me' ? jsonResponse(me()) : jsonResponse(product())))
    renderAt('/meals/7', <Route path="/meals/:id" element={<MealPage />} />)
    expect(await screen.findByRole('heading', { name: 'Coca-Cola' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recipe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to plan/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/€ total/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Stats')).toHaveTextContent('1×eaten')
    expect(within(screen.getByLabelText('Values per unit')).getByText('Per 100 ml · from the pack')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add ingredients' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ratings' })).toBeInTheDocument()
  })
})

describe('editing a snack', () => {
  const editApi = (current: Meal) => mockFetch((url, init) => {
    if (url.startsWith('/api/ingredients') || url === '/api/meals') return jsonResponse([])
    if (init?.method === 'PATCH') return jsonResponse(current)
    return jsonResponse(current)
  })
  const routes = (
    <>
      <Route path="/meals/:id" element={<p>meal page</p>} />
      <Route path="/meals/:id/edit" element={<MealEditPage />} />
    </>
  )

  it('changes the type and how it’s counted', async () => {
    const fetch = editApi(pudding())
    renderAt(['/meals/8', '/meals/8/edit'], routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Savory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pieces' }))
    expect(screen.getByRole('textbox', { name: 'piece weight' })).toHaveValue('30')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('meal page')).toBeInTheDocument()
    expect(sent(fetch, (u) => u === '/api/meals/8')).toMatchObject({ types: ['snack'], snack_kind: 'savory', per: 'piece', piece_g: 30 })
  })

  it('edits a product’s pack values, without recipe steps', async () => {
    const fetch = editApi(product())
    renderAt(['/meals/7', '/meals/7/edit'], routes)
    const pack = await screen.findByRole('region', { name: 'Pack values' })
    expect(within(pack).getByRole('heading', { name: 'Values per 100 ml' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Steps' })).not.toBeInTheDocument()
    expect(screen.queryByText('Portions made')).not.toBeInTheDocument()
    fireEvent.change(within(pack).getByLabelText('kcal'), { target: { value: '0,3' } }) // the zero one
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('meal page')).toBeInTheDocument()
    const body = sent(fetch, (u) => u === '/api/meals/7')
    expect(body.product_per100.kcal).toBe(0.3)
    expect(body).not.toHaveProperty('steps')
    expect(body).toMatchObject({ snack_kind: 'drink', per: '100ml' })
  })

  it('becomes a meal again without the Snack type', async () => {
    const fetch = editApi(pudding({ types: ['breakfast', 'snack'] }))
    renderAt(['/meals/8', '/meals/8/edit'], routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Snack' }))
    expect(screen.queryByRole('button', { name: 'Sweet' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('meal page')
    const body = sent(fetch, (u) => u === '/api/meals/8')
    expect(body.types).toEqual(['breakfast'])
    expect(body).not.toHaveProperty('snack_kind')
  })
})

describe('posting a snack from its photo', () => {
  const snackJob = () => {
    const job = { ...doneJob(), meal_type: 'snack' as const }
    return { ...job, result: { ...job.result!, items: job.result!.items.filter((i) => i.ingredient) } }
  }
  const render = (fetch = mockFetch((url) => {
    if (url.endsWith('/photo')) return new Response('img')
    if (url === '/api/meals') return jsonResponse({ id: 42 }, 201)
    return jsonResponse(snackJob())
  })) => {
    renderAt('/analysis/5', (
      <>
        <Route path="/analysis/:id" element={<AnalysisPage />} />
        <Route path="/meals/:id" element={<p>meal page</p>} />
      </>
    ))
    return fetch
  }

  it('needs the snack type, then posts it with how it’s counted', async () => {
    const fetch = render()
    fireEvent.click(await screen.findByRole('button', { name: 'Looks right' }))
    expect(screen.getByRole('button', { name: 'Snack' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'portions made' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Post snack' })).toBeDisabled()
    expect(screen.getByText('Pick the snack type first.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    expect(screen.getByText('Counts as a treat for your streak')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grams' }))
    fireEvent.click(screen.getByRole('button', { name: 'Post snack' }))
    expect(await screen.findByText('meal page')).toBeInTheDocument()
    expect(sent(fetch, (u) => u === '/api/meals')).toMatchObject({ meal_type: 'snack', snack_kind: 'sweet', per: '100g', piece_g: null })
  })
})

describe('one of our snacks on the day', () => {
  it('changes the amount; its values are edited on the snack', async () => {
    const entry = logEntry({
      id: 4, meal_type: 'snack', kind: 'snack', snack_kind: 'drink', name: 'Coca-Cola', emoji: '🥤', meal_id: 7,
      per: '100ml', servings: 330, per_unit: n(42, 10.6), nutrients: n(138.6, 35),
    })
    const fetch = mockFetch(() => jsonResponse(entry))
    renderAt('/', <Route path="/" element={<EntrySheet entry={entry} onClose={() => {}} />} />)
    expect(screen.queryByRole('button', { name: 'Edit values' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the snack' })).toHaveAttribute('href', '/meals/7')
    fireEvent.click(screen.getByLabelText('More amount'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sent(fetch, (u) => u === '/api/log/4')).toEqual({ servings: 335 }))
  })
})

describe('Log a snack sheet', () => {
  function Opener() {
    const open = useAddFood()
    return <button onClick={() => open({ snack: true })}>open</button>
  }
  const setup = (handler: Parameters<typeof mockFetch>[0]) => {
    const fetch = mockFetch(handler)
    renderAt('/', (
      <>
        <Route path="/" element={<Opener />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
      </>
    ))
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    return { fetch, sheet: screen.getByRole('dialog', { name: 'Log a snack' }) }
  }

  it('lists our snacks and logs one through its own sheet', async () => {
    const { fetch, sheet } = setup((url) => {
      if (url === '/api/meals') return jsonResponse([card({ id: 1, name: 'Curry' }), card({ id: 8, name: 'Chia pudding', types: ['snack'], snack_kind: 'sweet', per_unit: n(250) })])
      if (url === '/api/snacks/catalog') return jsonResponse([])
      return jsonResponse(pudding())
    })
    const ours = await within(sheet).findByLabelText('Our snacks')
    expect(within(ours).queryByText('Curry')).not.toBeInTheDocument()
    fireEvent.click(within(ours).getByRole('button', { name: /Chia pudding/ }))
    const log = await screen.findByRole('dialog', { name: 'Log this snack' })
    fireEvent.click(within(log).getByRole('button', { name: 'Log 250 kcal' }))
    await waitFor(() => expect(sent(fetch, (u) => u === '/api/meals/8/cook')).toMatchObject({ meal_type: 'snack', amount: 1 }))
  })

  it('saves a picked snack to our snacks when asked', async () => {
    const { fetch, sheet } = setup((url) => {
      if (url === '/api/meals') return jsonResponse([])
      if (url === '/api/snacks/catalog') return jsonResponse([{ key: 'cookie', name: 'Cookie', emoji: '🍪', kind: 'sweet', per_unit: n(140, 10) }])
      return jsonResponse({ id: 1, name: 'Cookie', kcal: 140, sugar: 10, treat: true, meal_id: 9 }, 201)
    })
    fireEvent.click(await within(sheet).findByRole('button', { name: /Cookie/ }))
    fireEvent.click(within(sheet).getByRole('switch', { name: /Save to our snacks/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log snack' }))
    expect(await screen.findByText(/Cookie logged · in our snacks/)).toBeInTheDocument()
    expect(sent(fetch, (u) => u === '/api/snacks')).toMatchObject({ name: 'Cookie', save: true, source: 'list' })
  })

  it('sends a snack photo for its ingredients', async () => {
    const { fetch, sheet } = setup((url) => (url === '/api/analyses' ? jsonResponse({ id: 9, status: 'queued' }, 202) : jsonResponse([])))
    fireEvent.change(within(sheet).getByLabelText('Snack photo'), { target: { files: [new File(['x'], 'p.jpg')] } })
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    const form = fetch.mock.calls.find(([u]) => u === '/api/analyses')![1]!.body as FormData
    expect([form.get('kind'), form.get('meal_type')]).toEqual(['meal', 'snack'])
  })
})
