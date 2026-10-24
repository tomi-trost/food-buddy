import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type CSSProperties, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import { MEAL_TYPE_LABEL, todayISO } from '../lib/dates'
import { ago, againLabel, EFFORT_STEPS, FILL_STEPS, fillTip, ORIGIN_LABEL, stepLabel } from '../lib/meals'
import { PhotoInput } from '../add/PhotoInput'
import { AddToPlanSheet } from '../meals/AddToPlanSheet'
import { CookSheet } from '../meals/CookSheet'
import { RateSheet } from '../meals/RateSheet'
import { UndoPost } from '../meals/UndoPost'
import { Avatar } from '../ui/Avatar'
import { Icon, type IconName } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { Photo } from '../ui/Photo'
import { StarNum, Stars } from '../ui/Stars'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'
import { formatAmount } from '../lib/units'
import { KIND_LABEL, perLabel } from '../lib/snacks'

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
  const [planning, setPlanning] = useState(false)

  // Right after posting (?rate=1) the rating sheet opens, like the mock.
  useEffect(() => {
    if (params.get('rate') && meal.data) {
      setRating(true)
      setParams({}, { replace: true })
    }
  }, [params, meal.data, setParams])

  const m = meal.data
  const today = todayISO()
  const qc = useQueryClient()
  const toast = useToast()
  const keep = useMutation({
    mutationFn: () => api.patchMeal(Number(id), { listed: true }),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', id], updated)
      qc.invalidateQueries({ queryKey: ['meals'] })
      toast('Saved to our meals')
    },
  })
  const addPhoto = useMutation({
    mutationFn: (file: File) => api.setMealPhoto(Number(id), file),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', id], updated)
      qc.invalidateQueries({ queryKey: ['meals'] })
      toast('Photo added')
    },
  })
  const notCooked = !!m && m.origin !== 'home' // bought / eaten out: no recipe, rated once saved
  const snackOnly = !!m && (notCooked || m.types.every((t) => t === 'snack')) // eaten, not cooked; never planned
  const noRecipe = !!m && (m.is_product || notCooked)
  const section = (value: Tab, icon: IconName, label: string) => ({ value, label: <><Icon name={icon} size={16} />{label}</> })
  const sections = [
    ...(noRecipe ? [] : [section('recipe', 'book', 'Recipe')]),
    section('nutrition', 'flame', 'Nutrition'),
    ...(m?.listed === false ? [] : [section('ratings', 'star', 'Ratings')]),
  ]
  const shown: Tab = (noRecipe && tab === 'recipe') || (m?.listed === false && tab === 'ratings') ? 'nutrition' : tab

  return (
    <>
      <div className="top">
        <button className="icon" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>
        {m && <span className="sub sp" style={{ textAlign: 'center' }}>{ago(m.last_cooked, today)}</span>}
        {m && (
          <>
            <button className="icon" aria-label="Edit meal" onClick={() => navigate(`/meals/${m.id}/edit`)}><Icon name="settings" /></button>
            {!snackOnly && <button className="btn sm ghost" onClick={() => setPlanning(true)}><Icon name="plan" size={16} /> Add to plan</button>}
          </>
        )}
      </div>
      {meal.isError && <p className="error" role="alert">{meal.error.message}</p>}
      {m && me && (
        <>
          <UndoPost meal={m} />
          <div style={{ position: 'relative' }}>
            <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt={m.name} />
            {!m.photo_url && (
              <PhotoInput label="Add a photo" disabled={addPhoto.isPending} className="photo-add" onFile={(file) => addPhoto.mutate(file)}>
                <Icon name="camera" size={16} /> {addPhoto.isPending ? 'Uploading…' : 'Add photo'}
              </PhotoInput>
            )}
          </div>
          {addPhoto.isError && <p className="error" role="alert">{addPhoto.error.message}</p>}
          <h1 style={{ margin: '12px 0 8px' }}>{m.name}</h1>
          <div className="chips">
            <span className="chip">{m.types.map((t) => MEAL_TYPE_LABEL[t]).join(' / ')}</span>
            {m.snack_kind && <span className="chip">{KIND_LABEL[m.snack_kind]}</span>}
            {m.types.includes('snack') && (
              <span className="chip">{Math.round(m.per_unit.kcal)} kcal / {perLabel(m.per)}{m.per === 'piece' && m.piece_g ? ` (${m.piece_g} g)` : ''}</span>
            )}
            {notCooked && <span className="chip">{ORIGIN_LABEL[m.origin]}{m.place ? ` · ${m.place}` : ''}</span>}
            {notCooked && !m.cost_estimated && <span className="chip">{m.cost.toFixed(2)} € paid</span>}
            {!noRecipe && <span className="chip"><Icon name="clock" size={14} /> {m.prep_minutes} min</span>}
            {!noRecipe && <span className="chip">{m.cost.toFixed(2)} € total · {(m.cost / m.portions).toFixed(2)} € / portion</span>}
            {!noRecipe && <span className="chip"><Icon name="users" size={14} /> {m.portions} portions</span>}
            {m.taste !== null && <span className="chip"><StarNum value={m.taste} /></span>}
          </div>
          <div className="macro" style={{ margin: '14px 0 0', '--n': 3 } as CSSProperties} aria-label="Stats">
            <div><b>{m.cooked_count}×</b><small>{snackOnly ? 'eaten' : 'cooked'}</small></div>
            <div><b>{ago(m.last_cooked, today)}</b><small>{snackOnly ? 'last eaten' : 'last cooked'}</small></div>
            <div><b>{m.taste !== null ? Math.round(m.taste * 10) / 10 : '–'}</b><small>avg taste</small></div>
          </div>
          {!m.listed && (
            <div className="card row" style={{ marginTop: 14 }} aria-label="Not in our meals">
              <div className="sp">
                <h3>Not in our meals</h3>
                <div className="sub">Logged for today only. Save it to rate it and log it again later.</div>
              </div>
              <button className="btn sm ghost" disabled={keep.isPending} onClick={() => keep.mutate()}>Save to our meals</button>
            </div>
          )}
          {keep.isError && <p className="error" role="alert">{keep.error.message}</p>}
          {m.listed && (() => {
            const mine = m.ratings.find((r) => r.user_id === me.id)?.rating
            return (
              <div className="card row" style={{ marginTop: 14 }} aria-label="Your rating">
                <div className="sp">
                  <h3>Your rating</h3>
                  {mine
                    ? <div className="row" style={{ gap: 6, marginTop: 4 }}><Stars value={mine.taste} size={18} /><span className="sub">{mine.taste}</span></div>
                    : <div className="sub">Not rated yet</div>}
                </div>
                <button className="btn sm ghost" onClick={() => setRating(true)}>{mine ? 'Change' : 'Rate'}</button>
              </div>
            )
          })()}
          <div style={{ marginTop: 14 }}>
            <Toggle<Tab> label="Meal sections" value={shown} onChange={setTab} options={sections} />
          </div>

          {shown === 'recipe' && (
            <>
              <div className="card">
                <h3>Ingredients <span className="sub">(for {m.portions} portions)</span></h3>
                <div className="list">
                  {m.ingredients.map(({ ingredient, grams }) => (
                    <div key={ingredient.id}>
                      <span>{ingredient.emoji}</span>
                      <span className="sp">{ingredient.name}</span>
                      <span className="sub">{formatAmount(grams, ingredient)}</span>
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

          {shown === 'nutrition' && (
            <>
              {m.types.includes('snack') && m.per !== 'portion' && (
                <div className="card" aria-label="Values per unit">
                  <div className="sub" style={{ marginBottom: 8 }}>
                    Per {perLabel(m.per)}{m.is_product ? ' · from the pack' : ''}
                  </div>
                  <MacroTiles values={m.per_unit} />
                </div>
              )}
              {m.is_product && (
                <div className="card row">
                  <div className="sp">
                    <h3>Made it yourself?</h3>
                    <div className="sub">Add its ingredients and it becomes a recipe.</div>
                  </div>
                  <button className="btn sm ghost" onClick={() => navigate(`/meals/${m.id}/edit`)}>Add ingredients</button>
                </div>
              )}
              {!m.is_product && <div className="card">
                <div className="sub" style={{ marginBottom: 8 }}>
                  Per portion{m.nutrients_overridden && ` · your values (calculated ${Math.round(m.per_portion_calculated.kcal)} kcal)`}
                </div>
                <MacroTiles values={m.per_portion} />
              </div>}
              {fillTip(m.ratings.map((r) => r.rating)) && (
                <div className="card">
                  <h3>How filling</h3>
                  <div className="sub" style={{ margin: '4px 0' }}>
                    {m.ratings.flatMap((r) => (r.rating && r.rating.fill !== null ? [stepLabel(FILL_STEPS, r.rating.fill)] : [])).join(' · ')}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <Icon name="leaf" size={16} /><span>{fillTip(m.ratings.map((r) => r.rating))}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {shown === 'ratings' && m.ratings.map((r) => {
            const isMe = r.user_id === me.id
            return (
              <div className="card" key={r.user_id}>
                <div className="row">
                  <Avatar name={r.name} color={r.color} size={34} />
                  <h3 className="sp">{isMe ? 'You' : r.name}</h3>
                </div>
                {r.rating ? (
                  <>
                    <div className="row" style={{ margin: '10px 0 4px' }}>
                      <Stars value={r.rating.taste} size={18} /><span className="sub">{r.rating.taste}</span>
                    </div>
                    <div className="sub">
                      {r.rating.effort === null || r.rating.fill === null
                        ? <>Have it again: {againLabel(r.rating.again)}</>
                        : <>Make again: {againLabel(r.rating.again)} · Worth the effort: {stepLabel(EFFORT_STEPS, r.rating.effort).toLowerCase()} · Filling: {stepLabel(FILL_STEPS, r.rating.fill).toLowerCase()}</>}
                    </div>
                  </>
                ) : (
                  <div className="sub" style={{ marginTop: 8 }}>{isMe ? 'Not rated yet' : 'Waiting for rating…'}</div>
                )}
              </div>
            )
          })}

          <button className="btn" onClick={() => setCooking(true)}>
            <Icon name="flame" size={18} /> {snackOnly ? 'I had this again' : 'I cooked this again'}
          </button>
          <RateSheet meal={m} meId={me.id} open={rating} onClose={() => setRating(false)} />
          <CookSheet meal={m} open={cooking} onClose={() => setCooking(false)} initialType={snackOnly ? 'snack' : undefined} />
          <AddToPlanSheet meal={m} open={planning} onClose={() => setPlanning(false)} />
        </>
      )}
    </>
  )
}
