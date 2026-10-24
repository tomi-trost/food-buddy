import type { Ingredient, MealKind, MealPer, Origin, SnackKind } from '../api/types'
import { isTreatKind, KIND_LABEL, SNACK_KINDS } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { templateSteps } from '../lib/recipe'
import { Stepper } from '../ui/Stepper'
import { typeOption } from '../ui/mealTypes'
import { Toggle } from '../ui/Toggle'
import { byWeight, type PlateItem, usableIngredients } from './plate'

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
  origin: Origin // home = cooked by us; bought / out: logged for the nutrition only
  place: string // bought / out: shop or restaurant (optional)
  price: number // bought / out: what we paid, 0 = don't know
}

export function Details({ items, state, set, onPost, posting, error }: {
  items: PlateItem[]
  state: DetailsState
  set: (patch: Partial<DetailsState>) => void
  onPost: () => void
  posting: boolean
  error?: string
}) {
  const usable = usableIngredients(items)
  const perPortion = state.cost / state.portions
  const cooked = state.origin === 'home'
  const snackReady = state.mealType !== 'snack' || !!state.snackKind

  return (
    <>
      <h1 style={{ marginBottom: 12 }}>{cooked ? 'Meal details' : 'Log it'}</h1>
      <Toggle<Origin>
        label="Where's it from?"
        value={state.origin}
        onChange={(origin) => set({ origin })}
        options={[{ value: 'home', label: '🍳 Cooked' }, { value: 'bought', label: '🛒 Bought' }, { value: 'out', label: '🍽️ Ate out' }]}
      />
      {cooked ? <CookedDetails items={items} usable={usable} perPortion={perPortion} state={state} set={set} /> : <NotCookedDetails state={state} set={set} />}
      {error && <p className="error" role="alert">{error}</p>}
      {cooked ? (
        <button className="btn" disabled={posting || !state.name.trim() || !snackReady} onClick={onPost}>
          {state.eaten ? (posting ? 'Posting…' : state.mealType === 'snack' ? 'Post snack' : 'Post meal') : posting ? 'Saving…' : 'Save meal'}
        </button>
      ) : (
        <button className="btn" disabled={posting || !state.name.trim() || !snackReady} onClick={onPost}>{posting ? 'Logging…' : 'Log it'}</button>
      )}
      {!snackReady && <p className="sub">Pick the snack type first.</p>}
    </>
  )
}

/** Bought in a shop or eaten out: what it was and (if we like) where and what we paid. No recipe,
 *  stock or rating, and it stays out of our meals. */
function NotCookedDetails({ state, set }: { state: DetailsState; set: (patch: Partial<DetailsState>) => void }) {
  const out = state.origin === 'out'
  return (
    <>
      <p className="sub" style={{ marginTop: -4 }}>
        Counted for today. It isn't added to our meals and nothing leaves our ingredients. You can still save it later.
      </p>
      <label className="field" style={{ marginBottom: 14 }}>
        What was it?
        <input value={state.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Toggle<MealKind>
        label="Meal type"
        value={state.mealType}
        onChange={(mealType) => set({ mealType })}
        stack
        options={(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((t) => typeOption(t))}
      />
      {state.mealType === 'snack' && <SnackFields state={state} set={set} countIn={false} />}
      <div className="card">
        <label className="field" style={{ marginBottom: 12 }}>
          {out ? 'Where? (optional)' : 'Which shop? (optional)'}
          <input value={state.place} maxLength={80} placeholder={out ? 'e.g. Trattoria Rosa' : 'e.g. Lidl'}
            onChange={(e) => set({ place: e.target.value })} />
        </label>
        <div className="row">
          <div className="sp">
            <h3>Price paid</h3>
            <div className="sub">optional, for the eating-out total</div>
          </div>
          <Stepper label="price paid" value={state.price} step={1} min={0} max={1000} unit=" €" decimals={2}
            onChange={(price) => set({ price })} />
        </div>
      </div>
    </>
  )
}

function CookedDetails({ items, usable, perPortion, state, set }: {
  items: PlateItem[]
  usable: Ingredient[] // the plate's ingredients and its new dishes''
  perPortion: number
  state: DetailsState
  set: (patch: Partial<DetailsState>) => void
}) {
  return (
    <>
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
        stack
        options={(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((t) => typeOption(t))}
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
          {usable.map((i) => {
            const id = i.id
            const on = state.usedUp.includes(id)
            return (
              <button key={id} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                onClick={() => set({ usedUp: on ? state.usedUp.filter((x) => x !== id) : [...state.usedUp, id] })}>
                {i.emoji} {i.name}{on ? ' · used up' : ''}
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
    </>
  )
}

const PER_LABEL: Record<MealPer, string> = { portion: 'Portions', piece: 'Pieces', '100g': 'Grams', '100ml': 'ml' }

/** A snack's type (treats depend on it) and how it's counted when logged again (0025). */
export function SnackFields({ state, set, countIn = true }: {
  state: Pick<DetailsState, 'snackKind' | 'per' | 'pieceG'>
  set: (patch: Partial<DetailsState>) => void
  countIn?: boolean // false: logged once (bought / eaten out), so how it's counted later doesn't matter
}) {
  return (
    <>
      <Toggle<SnackKind> label="Snack type" value={state.snackKind ?? ('' as SnackKind)} onChange={(snackKind) => set({ snackKind })}
        options={SNACK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      {isTreatKind(state.snackKind) && (
        <div className="sub row" style={{ gap: 6, margin: '-4px 0 12px' }}><Icon name="gift" size={16} /> Counts as a treat for your streak</div>
      )}
      {countIn && <Toggle<MealPer> label="Count it in" value={state.per} onChange={(per) => set({ per })}
        options={(Object.keys(PER_LABEL) as MealPer[]).map((p) => ({ value: p, label: PER_LABEL[p] }))} />}
      {countIn && state.per === 'piece' && (
        <div className="card row">
          <div className="sp"><h3>One piece</h3><div className="sub">how much one piece weighs</div></div>
          <Stepper label="piece weight" value={state.pieceG} step={5} min={1} max={2000} unit=" g" decimals={1}
            onChange={(pieceG) => set({ pieceG })} />
        </div>
      )}
    </>
  )
}
