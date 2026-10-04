import type { MealType } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { templateSteps } from '../lib/recipe'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { byWeight, type PlateItem } from './plate'

export type DetailsState = {
  name: string
  mealType: MealType
  prepMinutes: number
  portions: number
  cost: number
  usedUp: number[]
}

export function Details({ items, state, set, onPost, posting, error }: {
  items: PlateItem[]
  state: DetailsState
  set: (patch: Partial<DetailsState>) => void
  onPost: () => void
  posting: boolean
  error?: string
}) {
  const resolved = items.filter((i) => i.ingredient)
  const perPortion = state.cost / state.portions

  return (
    <>
      <h1 style={{ marginBottom: 12 }}>Meal details</h1>
      <label className="field" style={{ marginBottom: 14 }}>
        Dish name
        <input value={state.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Toggle<MealType>
        label="Meal type"
        value={state.mealType}
        onChange={(mealType) => set({ mealType })}
        options={(['breakfast', 'lunch', 'dinner'] as const).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }))}
      />
      <div className="card row">
        <h3 className="sp">Prep time</h3>
        <Stepper label="prep time" value={state.prepMinutes} step={5} min={5} max={600} unit=" min"
          onChange={(prepMinutes) => set({ prepMinutes })} />
      </div>
      <div className="card">
        <div className="row">
          <div className="sp">
            <h3>Ingredient cost</h3>
            <div className="sub">auto-estimated</div>
          </div>
          <Stepper label="cost" value={state.cost} step={1} min={0} max={1000} unit=" €"
            onChange={(cost) => set({ cost })} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="sp">
            <h3>Portions made</h3>
            <div className="sub">the plate is one portion</div>
          </div>
          <Stepper label="portions made" value={state.portions} min={1} max={20}
            onChange={(portions) => set({ portions })} />
        </div>
        <div className="chip" style={{ marginTop: 12 }}>= {perPortion.toFixed(2)} € per portion</div>
      </div>
      <div className="card">
        <h3>Used up an ingredient?</h3>
        <div className="sub" style={{ margin: '2px 0 10px' }}>
          Tap anything you finished. It leaves your ingredients and goes on your shopping list.
        </div>
        <div className="chips">
          {resolved.map((i) => {
            const id = i.ingredient!.id
            const on = state.usedUp.includes(id)
            return (
              <button key={id} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                onClick={() => set({ usedUp: on ? state.usedUp.filter((x) => x !== id) : [...state.usedUp, id] })}>
                {i.ingredient!.emoji} {i.ingredient!.name}{on ? ' · used up' : ''}
              </button>
            )
          })}
        </div>
      </div>
      <div className="card">
        <h3>Auto recipe</h3>
        <ol style={{ paddingLeft: 20, lineHeight: 1.5, fontSize: 14 }}>
          {templateSteps(byWeight(items), state.prepMinutes, state.portions).map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div className="sub">A fuller recipe is written in the background after you post.</div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={posting || !state.name.trim()} onClick={onPost}>
        {posting ? 'Posting…' : 'Post meal'}
      </button>
    </>
  )
}
