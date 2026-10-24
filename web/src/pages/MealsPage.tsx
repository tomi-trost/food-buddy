import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { MealCard, MealKind } from '../api/types'
import { MEAL_TYPE_SHORT } from '../lib/dates'
import { useAddFood } from '../add/AddFood'
import { CookMealSheet } from '../meals/CookSheet'
import { feed, type FeedSeg, type FeedSort, type FeedType, NEXT_SORT, ORIGIN_LABEL, SORT_LABEL } from '../lib/meals'
import { KIND_LABEL, perLabel } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { Toggle } from '../ui/Toggle'

const SEGS: [FeedSeg, string][] = [['all', 'Any'], ['top', 'Top rated'], ['quick', '≤ 30 min'], ['cheap', '≤ 4 € / portion']]

/** The meal library; Snacks are meals typed Snack (decision 0025), shown with their own unit. */
export function MealsPage() {
  const [params, setParams] = useSearchParams()
  const type = (params.get('type') ?? 'all') as FeedType | 'snacks'
  const seg = (params.get('seg') ?? 'all') as FeedSeg
  const sort = (params.get('sort') ?? 'rating') as FeedSort
  const set = (key: string, value: string) =>
    setParams((p) => {
      p.set(key, value)
      return p
    }, { replace: true })
  const cards = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const [logging, setLogging] = useState<number | null>(null)
  const addFood = useAddFood()
  const snacks = type === 'snacks'
  const kind: FeedType = snacks ? 'snack' : type
  const list = feed(cards.data ?? [], kind, snacks ? 'all' : seg, sort)

  return (
    <>
      <div className="top">
        <h1>Meals</h1>
        <button className="sortbtn" onClick={() => set('sort', NEXT_SORT[sort])} aria-label={`Sort: ${SORT_LABEL[sort]}`}>
          <Icon name="sort" size={16} /><small>Sort</small><b>{SORT_LABEL[sort]}</b>
        </button>
      </div>
      <Toggle<FeedType | 'snacks'>
        variant="tseg"
        label="Meal type"
        value={type}
        onChange={(v) => set('type', v)}
        options={[
          { value: 'all', label: <><Icon name="grid" size={14} />All</> },
          { value: 'breakfast', label: <><Icon name="sunrise" size={14} />Breakfast</> },
          { value: 'lunch', label: <><Icon name="sun" size={14} />Lunch</> },
          { value: 'dinner', label: <><Icon name="moon" size={14} />Dinner</> },
          { value: 'snacks', label: <><Icon name="gift" size={14} />Snacks</> },
        ]}
      />
      {!snacks && (
        <div className="chips" style={{ marginBottom: 14 }} role="group" aria-label="Filter">
          {SEGS.map(([k, label]) => (
            <button key={k} className={`chip${seg === k ? ' on' : ''}`} aria-pressed={seg === k} onClick={() => set('seg', k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {cards.isError && <p className="error" role="alert">{cards.error.message}</p>}
      <div className="mealgrid">
        {list.map((m) => (
          <div key={m.id} className="mealcard-wrap">
            <Link to={`/meals/${m.id}`} className="mealcard">
              <div style={{ position: 'relative' }}>
                <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt={m.name} />
                <span className="badge" style={{ position: 'absolute', top: 8, right: 8 }}>
                  {m.taste !== null ? <><Icon name="star" size={12} fill /> {Math.round(m.taste * 10) / 10}</> : 'unrated'}
                </span>
                {!snacks && (
                  <span className="badge" style={{ position: 'absolute', top: 8, left: 8 }}>
                    {m.types.map((t: MealKind) => MEAL_TYPE_SHORT[t]).join(' / ')}
                  </span>
                )}
              </div>
              <div className="b">
                <h3>{m.name}</h3>
                {snacks ? <SnackLines m={m} /> : (
                  <>
                    <div className="sub">
                      {m.origin === 'home'
                        ? `${m.prep_minutes} min · ${(m.cost / m.portions).toFixed(2)} €/portion`
                        : `${ORIGIN_LABEL[m.origin]}${m.place ? ` · ${m.place}` : ''}`}
                    </div>
                    <div className="sub">{m.origin === 'home' ? `Cooked ${m.cooked_count}×` : `Had it ${m.cooked_count}×`}</div>
                  </>
                )}
              </div>
            </Link>
            <button className="icon mealcard-log" aria-label={`Log ${m.name}`} onClick={() => setLogging(m.id)}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        ))}
      </div>
      {cards.isSuccess && !list.length && (snacks ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="sub">No snacks yet. Snap a home-made one, or scan a pack and switch on “Save to our snacks”.</p>
          <button className="btn" onClick={() => addFood({ type: 'snack' })}><Icon name="plus" size={18} /> Add a snack</button>
        </div>
      ) : !cards.data.length ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="sub">No meals yet. Snap or type your first plate.</p>
          <button className="btn" onClick={() => addFood()}><Icon name="plus" size={18} /> Add your first meal</button>
        </div>
      ) : <p className="sub">No meals match this filter.</p>)}
      <CookMealSheet mealId={logging} initialType={type === 'all' ? undefined : kind as MealKind} onClose={() => setLogging(null)} />
    </>
  )
}

function SnackLines({ m }: { m: MealCard }) {
  return (
    <>
      <div className="sub">
        {m.snack_kind ? KIND_LABEL[m.snack_kind] : 'Snack'} · {Math.round(m.per_unit.kcal)} kcal / {perLabel(m.per)}
      </div>
      <div className="sub">{`Eaten ${m.cooked_count}×`}</div>
    </>
  )
}
