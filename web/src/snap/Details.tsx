import type { MealKind, MealPer, SnackKind } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { isTreatKind, KIND_LABEL, SNACK_KINDS } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { templateSteps } from '../lib/recipe'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { byWeight, type PlateItem } from './plate'

export type DetailsState = {
  name: string
  mealType: MealKind
  snackKind: SnackKind | null // snacks: picked by us (treats depend on it)
  per: MealPer // snacks: how it's logged from now on
  pieceG: number // per = piece: one piece weighs this
  eaten: boolean // false = save for later (library only)
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
      <Toggle<'eaten' | 'later'>
        label="Did you eat it?"
        value={state.eaten ? 'eaten' : 'later'}
        onChange={(v) => set({ eaten: v === 'eaten' })}
        options={[{ value: 'eaten', label: 'Ate it today' }, { value: 'later', label: 'Save for later' }]}
      />
      {!state.eaten && (
        <p className="sub" style={{ marginTop: -4 }}>
          Goes to your meals for planning. Not counted as eaten, and your ingredients stay as they are.
        </p>
      )}
      <label className="field" style={{ marginBottom: 14 }}>
        Dish name
        <input value={state.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Toggle<MealKind>
        label="Meal type"
        value={state.mealType}
        onChange={(mealType) => set({ mealType })}
        options={(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }))}
      />
      {state.mealType === 'snack' && <SnackFields state={state} set={set} />}
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
          <Stepper label="cost" value={state.cost} step={1} min={0} max={1000} unit=" €" decimals={2}
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
      {state.eaten && <div className="card">
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
      </div>}
      <div className="card">
        <h3>Auto recipe</h3>
        <ol style={{ paddingLeft: 20, lineHeight: 1.5, fontSize: 14 }}>
          {templateSteps(byWeight(items), state.prepMinutes, state.portions).map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div className="sub">A fuller recipe is written in the background after you {state.eaten ? 'post' : 'save'}.</div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={posting || !state.name.trim() || (state.mealType === 'snack' && !state.snackKind)} onClick={onPost}>
        {state.eaten ? (posting ? 'Posting…' : state.mealType === 'snack' ? 'Post snack' : 'Post meal') : posting ? 'Saving…' : 'Save meal'}
      </button>
      {state.mealType === 'snack' && !state.snackKind && <p className="sub">Pick the snack type first.</p>}
    </>
  )
}

const PER_LABEL: Record<MealPer, string> = { portion: 'Portions', piece: 'Pieces', '100g': 'Grams', '100ml': 'ml' }

/** A snack's type (treats depend on it) and how it's counted when logged again (0025). */
export function SnackFields({ state, set }: {
  state: Pick<DetailsState, 'snackKind' | 'per' | 'pieceG'>
  set: (patch: Partial<DetailsState>) => void
}) {
  return (
    <>
      <Toggle<SnackKind> label="Snack type" value={state.snackKind ?? ('' as SnackKind)} onChange={(snackKind) => set({ snackKind })}
        options={SNACK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      {isTreatKind(state.snackKind) && (
        <div className="sub row" style={{ gap: 6, margin: '-4px 0 12px' }}><Icon name="gift" size={16} /> Counts as a treat for your streak</div>
      )}
      <Toggle<MealPer> label="Count it in" value={state.per} onChange={(per) => set({ per })}
        options={(Object.keys(PER_LABEL) as MealPer[]).map((p) => ({ value: p, label: PER_LABEL[p] }))} />
      {state.per === 'piece' && (
        <div className="card row">
          <div className="sp"><h3>One piece</h3><div className="sub">how much one piece weighs</div></div>
          <Stepper label="piece weight" value={state.pieceG} step={5} min={1} max={2000} unit=" g" decimals={1}
            onChange={(pieceG) => set({ pieceG })} />
        </div>
      )}
    </>
  )
}
