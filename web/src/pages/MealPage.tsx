import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api/client'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { Photo } from '../ui/Photo'

/** Meal detail. S3 adds stats, tabs, ratings and "I cooked this again". */
export function MealPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const meal = useQuery({ queryKey: ['meal', id], queryFn: () => api.meal(id) })
  const m = meal.data

  return (
    <>
      <div className="top">
        <button className="icon" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>
      </div>
      {meal.isError && <p className="error" role="alert">{meal.error.message}</p>}
      {m && (
        <>
          <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt={m.name} />
          <h1 style={{ margin: '12px 0 8px' }}>{m.name}</h1>
          <div className="chips">
            <span className="chip">{m.types.map((t) => MEAL_TYPE_LABEL[t]).join(' / ')}</span>
            <span className="chip"><Icon name="clock" size={14} /> {m.prep_minutes} min</span>
            <span className="chip">{m.cost.toFixed(2)} € total · {(m.cost / m.portions).toFixed(2)} € / portion</span>
            <span className="chip"><Icon name="users" size={14} /> {m.portions} portions</span>
          </div>
          <h2>Per portion</h2>
          <MacroTiles values={m.per_portion} />
          <div className="card" style={{ marginTop: 12 }}>
            <h3>Ingredients</h3>
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
    </>
  )
}
