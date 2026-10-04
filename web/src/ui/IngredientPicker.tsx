import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Ingredient } from '../api/types'
import { Icon } from './Icon'

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Search the food database; `hint` pre-fills the box (e.g. the model's name for an unknown item). */
export function IngredientPicker({ onPick, hint = '', exclude = [] }: {
  onPick: (ingredient: Ingredient) => void
  hint?: string
  exclude?: number[]
}) {
  const [q, setQ] = useState(hint)
  const query = useDebounced(q.trim())
  const results = useQuery({ queryKey: ['ingredients', query], queryFn: () => api.searchIngredients(query) })
  const list = (results.data ?? []).filter((i) => !exclude.includes(i.id))

  return (
    <>
      <label className="row card" style={{ padding: '4px 12px' }}>
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
      <div className="list">
        {list.map((i) => (
          <button key={i.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick(i)}>
            <span style={{ fontSize: 22 }}>{i.emoji}</span>
            <span className="sp">{i.name}</span>
            <span className="sub">{Math.round(i.per100.kcal)} kcal/100g</span>
          </button>
        ))}
      </div>
      {results.isSuccess && !list.length && <p className="sub">Nothing found for “{query}”.</p>}
    </>
  )
}
