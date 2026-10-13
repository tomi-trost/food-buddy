import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ING } from '../test/fixtures'
import { IngredientChips } from './IngredientChips'
import type { PlateItem } from './plate'

function Harness() {
  const [items, setItems] = useState<PlateItem[]>([
    { key: 'a', name: 'boiled eggs', grams: 100, ingredient: ING.eggs },
    { key: 'b', name: 'olive oil', grams: 9.1, ingredient: ING.oil },
  ])
  return <><IngredientChips items={items} setItems={setItems} /><output>{items.map((i) => i.grams).join(',')}</output></>
}

describe('IngredientChips units', () => {
  it('counts eggs in pieces and oil in ml, storing grams', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Eggs · 2 pcs/ }))
    const sheet = screen.getByRole('dialog', { name: 'Edit ingredient' })
    expect(within(sheet).getByText(/≈ 100 g/)).toBeInTheDocument()
    expect(within(sheet).getByText(/1 pc ≈ 50 g/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByLabelText('More amount'))
    expect(screen.getByRole('status')).toHaveTextContent('150,9.1') // 3 eggs
    const field = within(sheet).getByRole('textbox', { name: 'amount' })
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.blur(field)
    expect(screen.getByRole('status')).toHaveTextContent('50,9.1')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))

    fireEvent.click(screen.getByRole('button', { name: /Olive oil · 10 ml/ }))
    const oil = within(screen.getByRole('dialog', { name: 'Edit ingredient' })).getByRole('textbox', { name: 'amount' })
    fireEvent.focus(oil)
    fireEvent.change(oil, { target: { value: '15' } })
    fireEvent.blur(oil)
    expect(screen.getByRole('status')).toHaveTextContent('50,13.7') // 15 ml × 0.91
  })
})
