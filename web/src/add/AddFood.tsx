import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useState } from 'react'
import type { MealType } from '../api/types'
import { guessMealType, MEAL_TYPE_LABEL } from '../lib/dates'
import { CookMealSheet } from '../meals/CookSheet'
import { MealPicker } from '../meals/MealPicker'
import { LogSnackSheet } from '../snacks/LogSnackSheet'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import { PhotoInput } from './PhotoInput'
import { type MealChoice, useFoodUpload } from './upload'

type Slot = MealType | 'later'
type View = 'menu' | 'type' | 'meals'
type Open = (opts?: { type?: MealType | 'later'; snack?: boolean }) => void

const AddFoodContext = createContext<Open>(() => {})

/** The center "+" (and Today's "+"): every way to add food in one sheet. */
export const useAddFood = () => useContext(AddFoodContext)

export function AddFoodProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Slot | null>(null) // null = closed
  const [snack, setSnack] = useState(false)
  const open = useCallback<Open>((opts = {}) => {
    if (opts.snack) setSnack(true)
    else setSlot(opts.type ?? guessMealType())
  }, [])
  return (
    <AddFoodContext.Provider value={open}>
      {children}
      <AddFoodSheet slot={slot} setSlot={setSlot} openSnack={() => { setSlot(null); setSnack(true) }} />
      <LogSnackSheet open={snack} onClose={() => setSnack(false)} />
    </AddFoodContext.Provider>
  )
}

function AddFoodSheet({ slot, setSlot, openSnack }: { slot: Slot | null; setSlot: (s: Slot | null) => void; openSnack: () => void }) {
  const [view, setView] = useState<View>('menu')
  const [cooking, setCooking] = useState<{ id: number; type: MealType } | null>(null) // kept after the sheet closes
  const close = () => {
    setSlot(null)
    setView('menu')
  }
  const { photo, text, busy, error } = useFoodUpload(close)
  const mealType = slot && slot !== 'later' ? slot : null
  const meal: MealChoice = { type: mealType, saveOnly: slot === 'later' }
  const back = <button className="textbtn add-back" onClick={() => setView('menu')}><Icon name="back" size={18} /> All options</button>

  let body: ReactNode
  if (view === 'type') {
    body = <><TypeIt busy={busy} onSend={(t, kind) => text.mutate({ text: t, kind, meal })} />{back}</>
  } else if (view === 'meals' && mealType) {
    body = (
      <>
        <h1>{MEAL_TYPE_LABEL[mealType]} from our meals</h1>
        <MealPicker mealType={mealType} onPick={(id) => { setCooking({ id, type: mealType }); close() }} />
        {back}
      </>
    )
  } else {
    body = (
      <>
        <h1>Add food</h1>
        <Toggle<Slot> label="Which meal?" value={slot ?? 'lunch'} onChange={setSlot}
          options={[
            ...(['breakfast', 'lunch', 'dinner'] as const).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] })),
            { value: 'later' as const, label: 'For later' },
          ]} />
        <PhotoInput camera label="Take photo" disabled={busy} className="add-hero"
          onFile={(file) => photo.mutate({ file, kind: 'meal', meal })}>
          <span className="add-ic"><Icon name="camera" size={30} /></span>
          <span className="sp">
            <b>{busy ? 'Uploading photo…' : 'Take a photo'}</b>
            <small>From above, whole plate in view. We find the dish and its macros.</small>
          </span>
        </PhotoInput>
        <div className="add-grid">
          <PhotoInput label="Choose from library" disabled={busy} className="add-opt"
            onFile={(file) => photo.mutate({ file, kind: 'meal', meal })}>
            <Icon name="image" size={22} /><b>Library</b><small>A photo you took earlier</small>
          </PhotoInput>
          <button className="add-opt" disabled={busy} onClick={() => setView('type')}>
            <Icon name="edit" size={22} /><b>Type it</b><small>Just the name of the dish</small>
          </button>
          <button className="add-opt" disabled={busy || !mealType} onClick={() => setView('meals')}>
            <Icon name="meals" size={22} /><b>Our meals</b><small>{mealType ? 'Again, or leftovers' : 'Pick a meal type first'}</small>
          </button>
          <button className="add-opt" disabled={busy} onClick={openSnack}>
            <Icon name="gift" size={22} /><b>Snack</b><small>Sweets, drinks, bites</small>
          </button>
        </div>
        <PhotoInput camera label="Scan a nutrition label" disabled={busy} className="add-row"
          onFile={(file) => photo.mutate({ file, kind: 'label' })}>
          <Icon name="tag" size={20} /><span className="sp"><b>Scan a nutrition label</b><small>Packaged food: we read the table</small></span>
          <Icon name="chev" size={16} />
        </PhotoInput>
      </>
    )
  }

  return (
    <>
      <Sheet open={slot !== null} onClose={close} label="Add food">
        {body}
        {error && <p className="error" role="alert">{error.message}</p>}
      </Sheet>
      <CookMealSheet mealId={cooking?.id ?? null} initialType={cooking?.type} onClose={() => setCooking(null)} />
    </>
  )
}

function TypeIt({ busy, onSend }: { busy: boolean; onSend: (text: string, kind: 'meal' | 'snack') => void }) {
  const [kind, setKind] = useState<'meal' | 'snack'>('meal')
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = String(new FormData(e.currentTarget).get('text') ?? '').trim()
    if (value) onSend(value, kind)
  }
  return (
    <>
      <h1>{kind === 'snack' ? 'What snack was it?' : 'What did you eat?'}</h1>
      <Toggle<'meal' | 'snack'> label="Meal or snack" value={kind} onChange={setKind}
        options={[{ value: 'meal', label: 'Meal' }, { value: 'snack', label: 'Snack' }]} />
      <p className="sub">
        The name is enough, add amounts if you know them. You check the {kind === 'snack' ? 'values' : 'ingredients'} afterwards, like with a photo.
      </p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label className="field">
          {kind === 'snack' ? 'Snack' : 'Dish'}
          <input name="text" required maxLength={200} autoComplete="off"
            placeholder={kind === 'snack' ? 'e.g. 2 slices of tiramisu' : 'e.g. spaghetti carbonara'} />
        </label>
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Estimate it'}</button>
      </form>
    </>
  )
}
