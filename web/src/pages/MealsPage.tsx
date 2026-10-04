import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { MEAL_TYPE_SHORT } from '../lib/dates'
import { feed, type FeedSeg, type FeedSort, type FeedType, NEXT_SORT, SORT_LABEL } from '../lib/meals'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { Toggle } from '../ui/Toggle'

const SEGS: [FeedSeg, string][] = [['all', 'Any'], ['top', 'Top rated'], ['quick', '≤ 30 min'], ['cheap', '≤ 4 € / portion']]

export function MealsPage() {
  const [params, setParams] = useSearchParams()
  const type = (params.get('type') ?? 'all') as FeedType
  const seg = (params.get('seg') ?? 'all') as FeedSeg
  const sort = (params.get('sort') ?? 'rating') as FeedSort
  const set = (key: string, value: string) =>
    setParams((p) => {
      p.set(key, value)
      return p
    }, { replace: true })
  const cards = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const list = feed(cards.data ?? [], type, seg, sort)

  return (
    <>
      <div className="top">
        <h1>Meals</h1>
        <button className="sortbtn" onClick={() => set('sort', NEXT_SORT[sort])} aria-label={`Sort: ${SORT_LABEL[sort]}`}>
          <Icon name="sort" size={16} /><small>Sort</small><b>{SORT_LABEL[sort]}</b>
        </button>
      </div>
      <Toggle<FeedType>
        variant="tseg"
        label="Meal type"
        value={type}
        onChange={(v) => set('type', v)}
        options={[
          { value: 'all', label: <><Icon name="grid" size={14} />All</> },
          { value: 'breakfast', label: <><Icon name="sunrise" size={14} />Breakfast</> },
          { value: 'lunch', label: <><Icon name="sun" size={14} />Lunch</> },
          { value: 'dinner', label: <><Icon name="moon" size={14} />Dinner</> },
        ]}
      />
      <div className="chips" style={{ marginBottom: 14 }} role="group" aria-label="Filter">
        {SEGS.map(([k, label]) => (
          <button key={k} className={`chip${seg === k ? ' on' : ''}`} aria-pressed={seg === k} onClick={() => set('seg', k)}>
            {label}
          </button>
        ))}
      </div>
      {cards.isError && <p className="error" role="alert">{cards.error.message}</p>}
      <div className="mealgrid">
        {list.map((m) => (
          <Link key={m.id} to={`/meals/${m.id}`} className="mealcard">
            <div style={{ position: 'relative' }}>
              <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt={m.name} />
              <span className="badge" style={{ position: 'absolute', top: 8, right: 8 }}>
                {m.score !== null ? <><Icon name="star" size={12} fill /> {Math.round(m.score * 10) / 10}</> : 'unrated'}
              </span>
              <span className="badge" style={{ position: 'absolute', top: 8, left: 8 }}>
                {m.types.map((t) => MEAL_TYPE_SHORT[t]).join(' / ')}
              </span>
            </div>
            <div className="b">
              <h3>{m.name}</h3>
              <div className="sub">{m.prep_minutes} min · {(m.cost / m.portions).toFixed(2)} €/portion</div>
              <div className="sub">{`Cooked ${m.cooked_count}×`}</div>
            </div>
          </Link>
        ))}
      </div>
      {cards.isSuccess && !cards.data.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="sub">No meals yet. Snap your first plate.</p>
          <Link to="/snap" className="btn"><Icon name="camera" size={18} /> Snap your meal</Link>
        </div>
      )}
      {cards.isSuccess && !!cards.data.length && !list.length && <p className="sub">No meals match this filter.</p>}
    </>
  )
}
