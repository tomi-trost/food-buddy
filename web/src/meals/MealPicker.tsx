import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { MealType } from '../api/types'
import { pickable } from '../lib/meals'
import { Photo } from '../ui/Photo'

/** Search our meals; the ones made for `mealType` come first. */
export function MealPicker({ mealType, onPick }: { mealType: MealType; onPick: (id: number) => void }) {
  const [query, setQuery] = useState('')
  const meals = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const list = pickable(meals.data ?? [], mealType, query)
  return (
    <>
      <label className="field">
        <input type="search" aria-label="Search meals" placeholder="Search meals" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="list" aria-label="Your meals">
        {list.map((m) => (
          <button key={m.id} className="row" style={{ textAlign: 'left' }} onClick={() => onPick(m.id)}>
            <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt="" style={{ width: 44, height: 44, aspectRatio: '1', fontSize: 22, flex: 'none' }} />
            <span className="sp">{m.name}<div className="sub">{Math.round(m.kcal_per_portion)} kcal / portion</div></span>
          </button>
        ))}
      </div>
      {meals.isSuccess && !list.length && (
        <p className="sub">{meals.data.length ? 'No meal matches.' : 'No meals yet. Snap your first plate.'}</p>
      )}
    </>
  )
}
