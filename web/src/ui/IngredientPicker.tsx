import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Ingredient, MealCard } from '../api/types'
import { ScanIngredient } from '../meals/ScanIngredient'
import { Icon } from './Icon'

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const OURS_EMPTY_QUERY = 5 // most cooked, before typing

/** Meals of ours that can be a dish on a plate: cooked by us, not a product, holding no dishes. */
export function dishOptions(meals: MealCard[], query: string, exclude: number[]): MealCard[] {
  const q = query.toLowerCase()
  const ok = meals.filter((m) => m.origin === 'home' && m.listed && !m.is_product && !m.bundle && !exclude.includes(m.id))
  if (!q) return [...ok].sort((a, b) => b.cooked_count - a.cooked_count).slice(0, OURS_EMPTY_QUERY)
  return ok.filter((m) => m.name.toLowerCase().includes(q))
}

/** Search the food database; `hint` pre-fills the box (e.g. the model's name for an unknown item).
 *  With `onPickDish`, our own meals show first under "Ours" (one portion of it goes on the plate). */
export function IngredientPicker({ onPick, hint = '', exclude = [], onPickDish, excludeDishes = [] }: {
  onPick: (ingredient: Ingredient) => void
  hint?: string
  exclude?: number[]
  onPickDish?: (meal: MealCard) => void
  excludeDishes?: number[]
}) {
  const [q, setQ] = useState(hint)
  const [scanning, setScanning] = useState(false)
  const query = useDebounced(q.trim())
  const results = useQuery({ queryKey: ['ingredients', query], queryFn: () => api.searchIngredients(query) })
  const meals = useQuery({ queryKey: ['meals'], queryFn: api.meals, enabled: !!onPickDish })
  const list = (results.data ?? []).filter((i) => !exclude.includes(i.id))
  const ours = onPickDish ? dishOptions(meals.data ?? [], query, excludeDishes) : []

  if (scanning) return <ScanIngredient onPick={onPick} onCancel={() => setScanning(false)} />
  return (
    <>
      <div className="sheet-sticky row" style={{ gap: 8 }}>
        <label className="row card sp" style={{ padding: '4px 12px', margin: 0 }}>
          <Icon name="search" size={18} />
          <input
            className="input"
            style={{ border: 0, padding: 0 }}
            placeholder="Search ingredients"
            aria-label="Search ingredients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </label>
        <button type="button" className="icon" aria-label="Scan a barcode" onClick={() => setScanning(true)}><Icon name="barcode" size={20} /></button>
      </div>
      {ours.length > 0 && (
        <>
          <h3 style={{ margin: '10px 0 0' }}>Ours</h3>
          <div className="list" aria-label="Our meals">
            {ours.map((m) => (
              <button key={m.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => onPickDish!(m)}>
                <span style={{ fontSize: 22 }}>{m.emoji}</span>
                <span className="sp">{m.name}</span>
                <span className="sub">1 portion · {Math.round(m.per_portion.kcal)} kcal</span>
              </button>
            ))}
          </div>
          <h3 style={{ margin: '10px 0 0' }}>Ingredients</h3>
        </>
      )}
      <div className="list">
        {list.map((i) => (
          <button key={i.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick(i)}>
            <span style={{ fontSize: 22 }}>{i.emoji}</span>
            <span className="sp">{i.name}</span>
            <span className="sub">{Math.round(i.per100.kcal)} kcal/100g</span>
          </button>
        ))}
      </div>
      {results.isSuccess && !list.length && !ours.length && <p className="sub">Nothing found for “{query}”.</p>}
    </>
  )
}
