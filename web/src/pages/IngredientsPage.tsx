import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { StockItem } from '../api/types'
import { todayISO } from '../lib/dates'
import { expiryClass, expiryText, STEP_GRAMS } from '../lib/stock'
import { Icon } from '../ui/Icon'
import { IngredientPicker } from '../ui/IngredientPicker'
import { Photo } from '../ui/Photo'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

type Loc = 'fridge' | 'pantry'

export function IngredientsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()
  const [loc, setLoc] = useState<Loc>('fridge')
  const [adding, setAdding] = useState(false)
  const [zero, setZero] = useState<StockItem | null>(null)
  const stock = useQuery({ queryKey: ['inventory', today], queryFn: () => api.inventory(today) })
  const cookable = useQuery({ queryKey: ['inventory', 'cookable'], queryFn: api.cookable })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inventory'] })
    qc.invalidateQueries({ queryKey: ['shopping'] })
  }
  const change = useMutation({
    mutationFn: ({ id, delta }: { id: number; delta: number }) => api.changeStock(id, delta, today),
    onSuccess: refresh,
  })
  const add = useMutation({
    mutationFn: (id: number) => api.addStock(id, today),
    onSuccess: (item) => {
      setLoc(item.ingredient.location)
      setAdding(false)
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: ({ id, usedUp }: { id: number; usedUp: boolean; name: string }) => api.removeStock(id, usedUp),
    onSuccess: (_, v) => {
      setZero(null)
      refresh()
      toast(v.usedUp ? `${v.name} removed · added to shopping list` : `${v.name} removed`)
    },
  })

  const items = stock.data ?? []
  const count = (l: Loc) => items.filter((i) => i.ingredient.location === l).length
  const shown = items.filter((i) => i.ingredient.location === loc)

  return (
    <>
      <div className="top">
        <h1>Ingredients</h1>
        <button className="icon" aria-label="Add ingredient" onClick={() => setAdding(true)}><Icon name="plus" /></button>
      </div>
      <Toggle<Loc> variant="tabs" label="Storage" value={loc} onChange={setLoc}
        options={[
          { value: 'fridge', label: <>Fridge <span className="sub">{count('fridge')}</span></>, ariaLabel: 'Fridge' },
          { value: 'pantry', label: <>Pantry <span className="sub">{count('pantry')}</span></>, ariaLabel: 'Pantry' },
        ]} />
      {loc === 'fridge' && !!cookable.data?.length && (
        <div className="card">
          <h3>Cook with what you have</h3>
          <div className="list">
            {cookable.data.map((m) => (
              <Link key={m.id} to={`/meals/${m.id}`} className="row" style={{ textDecoration: 'none' }}>
                <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt="" style={{ width: 56, height: 56, aspectRatio: '1', fontSize: 28, flex: 'none' }} />
                <div className="sp"><h3>{m.name}</h3><div className="sub">ingredients mostly in stock</div></div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {stock.isError && <p className="error" role="alert">{stock.error.message}</p>}
      <div className="card">
        {shown.length ? (
          <div className="list">
            {shown.map((item) => {
              const { ingredient: ing } = item
              return (
                <div key={ing.id}>
                  <span style={{ fontSize: 24 }}>{ing.emoji}</span>
                  <div className="sp">
                    <h3>{ing.name}</h3>
                    <div className="sub">
                      <span className={expiryClass(item.days_left)}>{expiryText(item.days_left)}</span> · {ing.category}
                    </div>
                  </div>
                  <div className="stepper" role="group" aria-label={`${ing.name} amount`}>
                    <button aria-label={`Less ${ing.name}`} onClick={() =>
                      item.grams - STEP_GRAMS <= 0 ? setZero(item) : change.mutate({ id: ing.id, delta: -STEP_GRAMS })}>
                      −
                    </button>
                    <b>{Math.round(item.grams)}g</b>
                    <button aria-label={`More ${ing.name}`} onClick={() => change.mutate({ id: ing.id, delta: STEP_GRAMS })}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="sub">Nothing here yet.</span>
        )}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} label="Add ingredient">
        <h1>Add ingredient</h1>
        <div className="sub" style={{ marginBottom: 10 }}>Adds 250 g; adjust with − / + afterwards.</div>
        <IngredientPicker onPick={(i) => add.mutate(i.id)} />
      </Sheet>

      <Sheet open={!!zero} onClose={() => setZero(null)} label="Remove ingredient">
        {zero && (
          <>
            <h1>{zero.ingredient.emoji} Remove {zero.ingredient.name}?</h1>
            <p className="sub">Have you used it up? It will be removed from your ingredients.</p>
            <button className="btn" onClick={() => remove.mutate({ id: zero.ingredient.id, usedUp: true, name: zero.ingredient.name })}>
              Yes, used it up — add to shopping list
            </button>
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => remove.mutate({ id: zero.ingredient.id, usedUp: false, name: zero.ingredient.name })}>
              Just remove (e.g. thrown away)
            </button>
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setZero(null)}>Keep it</button>
          </>
        )}
      </Sheet>
    </>
  )
}
