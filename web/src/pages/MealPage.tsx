import { useQuery } from '@tanstack/react-query'
import { type CSSProperties, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import { MEAL_TYPE_LABEL, todayISO } from '../lib/dates'
import { ago, againLabel, FILL_LABEL, fillTip } from '../lib/meals'
import { CookSheet } from '../meals/CookSheet'
import { RateSheet } from '../meals/RateSheet'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { Photo } from '../ui/Photo'
import { StarNum, Stars } from '../ui/Stars'
import { Toggle } from '../ui/Toggle'

type Tab = 'recipe' | 'nutrition' | 'ratings'

export function MealPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const me = useMe().data
  const meal = useQuery({ queryKey: ['meal', id], queryFn: () => api.meal(id) })
  const [tab, setTab] = useState<Tab>('recipe')
  const [rating, setRating] = useState(false)
  const [cooking, setCooking] = useState(false)

  // Right after posting (?rate=1) the rating sheet opens, like the mock.
  useEffect(() => {
    if (params.get('rate') && meal.data) {
      setRating(true)
      setParams({}, { replace: true })
    }
  }, [params, meal.data, setParams])

  const m = meal.data
  const today = todayISO()

  return (
    <>
      <div className="top">
        <button className="icon" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>
        {m && <span className="sub">{ago(m.last_cooked, today)}</span>}
        <span style={{ width: 44 }} />
      </div>
      {meal.isError && <p className="error" role="alert">{meal.error.message}</p>}
      {m && me && (
        <>
          <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt={m.name} />
          <h1 style={{ margin: '12px 0 8px' }}>{m.name}</h1>
          <div className="chips">
            <span className="chip">{m.types.map((t) => MEAL_TYPE_LABEL[t]).join(' / ')}</span>
            <span className="chip"><Icon name="clock" size={14} /> {m.prep_minutes} min</span>
            <span className="chip">{m.cost.toFixed(2)} € total · {(m.cost / m.portions).toFixed(2)} € / portion</span>
            <span className="chip"><Icon name="users" size={14} /> {m.portions} portions</span>
            {m.score !== null && <span className="chip"><StarNum value={m.score} /></span>}
          </div>
          <div className="macro" style={{ margin: '14px 0 0', '--n': 3 } as CSSProperties} aria-label="Stats">
            <div><b>{m.cooked_count}×</b><small>cooked</small></div>
            <div><b>{ago(m.last_cooked, today)}</b><small>last cooked</small></div>
            <div><b>{m.score !== null ? Math.round(m.score * 10) / 10 : '–'}</b><small>avg rating</small></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Toggle<Tab> label="Meal sections" value={tab} onChange={setTab}
              options={[{ value: 'recipe', label: 'Recipe' }, { value: 'nutrition', label: 'Nutrition' }, { value: 'ratings', label: 'Ratings' }]} />
          </div>

          {tab === 'recipe' && (
            <>
              <div className="card">
                <h3>Ingredients <span className="sub">(for {m.portions} portions)</span></h3>
                <div className="list">
                  {m.ingredients.map(({ ingredient, grams }) => (
                    <div key={ingredient.id}>
                      <span>{ingredient.emoji}</span>
                      <span className="sp">{ingredient.name}</span>
                      <span className="sub">{Math.round(grams)} g</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3>Steps {m.steps_source === 'template' && <span className="sub">(quick draft)</span>}</h3>
                <ol style={{ paddingLeft: 20, lineHeight: 1.5 }}>
                  {m.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            </>
          )}

          {tab === 'nutrition' && (
            <>
              <div className="card">
                <div className="sub" style={{ marginBottom: 8 }}>Per portion</div>
                <MacroTiles values={m.per_portion} />
              </div>
              {fillTip(m.ratings.map((r) => r.rating)) && (
                <div className="card">
                  <h3>How filling</h3>
                  <div className="sub" style={{ margin: '4px 0' }}>
                    {m.ratings.flatMap((r) => (r.rating ? [FILL_LABEL[r.rating.fill]] : [])).join(' · ')}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <Icon name="leaf" size={16} /><span>{fillTip(m.ratings.map((r) => r.rating))}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'ratings' && m.ratings.map((r) => {
            const isMe = r.user_id === me.id
            return (
              <div className="card" key={r.user_id}>
                <div className="row">
                  <Avatar name={r.name} color={r.color} size={34} />
                  <h3 className="sp">{isMe ? 'You' : r.name}</h3>
                  {isMe && <button className="btn sm ghost" onClick={() => setRating(true)}>{r.rating ? 'Edit' : 'Rate'}</button>}
                </div>
                {r.rating ? (
                  <>
                    <div className="row" style={{ margin: '10px 0 4px' }}>
                      <Stars value={r.rating.taste} size={18} /><span className="sub">{r.rating.taste}</span>
                    </div>
                    <div className="sub">
                      Make again: {againLabel(r.rating.again)} · Worth the effort: {againLabel(r.rating.effort)} · Filling: {FILL_LABEL[r.rating.fill]}
                    </div>
                  </>
                ) : (
                  <div className="sub" style={{ marginTop: 8 }}>{isMe ? 'Not rated yet' : 'Waiting for rating…'}</div>
                )}
              </div>
            )
          })}

          <button className="btn" onClick={() => setCooking(true)}><Icon name="flame" size={18} /> I cooked this again</button>
          <RateSheet meal={m} meId={me.id} open={rating} onClose={() => setRating(false)} />
          <CookSheet meal={m} open={cooking} onClose={() => setCooking(false)} />
        </>
      )}
    </>
  )
}
