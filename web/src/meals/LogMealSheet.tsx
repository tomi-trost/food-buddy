import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { MealType } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { pickable } from '../lib/meals'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { Sheet } from '../ui/Sheet'
import { CookMealSheet } from './CookSheet'

/** Today's "+" for a meal slot: snap a new plate or pick one of our meals. */
export function LogMealSheet({ mealType, onClose }: { mealType: MealType | null; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const meals = useQuery({ queryKey: ['meals'], queryFn: api.meals, enabled: mealType !== null })
  useEffect(() => {
    if (mealType) setQuery('')
  }, [mealType])

  const label = mealType ? MEAL_TYPE_LABEL[mealType] : ''
  const list = mealType ? pickable(meals.data ?? [], mealType, query) : []
  const done = () => {
    setPicked(null)
    onClose()
  }

  return (
    <>
      <Sheet open={mealType !== null && picked === null} onClose={onClose} label={`Add ${label}`}>
        <h1>Add {label.toLowerCase()}</h1>
        <Link to={`/snap?type=${mealType}`} className="btn"><Icon name="camera" size={18} /> Snap a photo</Link>
        <h2>Or one of your meals</h2>
        <label className="field">
          <input type="search" aria-label="Search meals" placeholder="Search meals" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="list" aria-label="Your meals">
          {list.map((m) => (
            <button key={m.id} className="row" style={{ textAlign: 'left' }} onClick={() => setPicked(m.id)}>
              <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt="" style={{ width: 44, height: 44, aspectRatio: '1', fontSize: 22, flex: 'none' }} />
              <span className="sp">{m.name}<div className="sub">{Math.round(m.kcal_per_portion)} kcal / portion</div></span>
            </button>
          ))}
        </div>
        {meals.isSuccess && !list.length && (
          <p className="sub">{meals.data.length ? 'No meal matches.' : 'No meals yet. Snap your first plate.'}</p>
        )}
      </Sheet>
      <CookMealSheet mealId={picked} initialType={mealType ?? undefined} onClose={done} />
    </>
  )
}
