import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api/client'
import type { Meal, MealKind, MealPatch, MealPer, Nutrients, SnackKind } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { scale } from '../lib/macros'
import { NutritionOverride } from '../meals/NutritionOverride'
import { EmojiPicker } from '../meals/EmojiPicker'
import { cleanSteps, StepsEditor } from '../meals/StepsEditor'
import { SnackFields } from '../snap/Details'
import { IngredientChips } from '../snap/IngredientChips'
import { NutrientFields } from '../ui/NutrientFields'
import { type PlateItem, plateNutrients, recipeCost } from '../snap/plate'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { useToast } from '../ui/Toast'

const TYPES: MealKind[] = ['breakfast', 'lunch', 'dinner', 'snack']

const resolvedIds = (items: PlateItem[]) => items.filter((i) => i.ingredient && i.grams > 0).map((i) => i.ingredient!.id)

export function MealEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const meal = useQuery({ queryKey: ['meal', id], queryFn: () => api.meal(id) })
  const close = <button className="icon" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>
  return (
    <>
      {meal.isError && <><div className="top">{close}</div><p className="error" role="alert">{meal.error.message}</p></>}
      {meal.data && <EditForm meal={meal.data} close={close} />}
    </>
  )
}

function EditForm({ meal, close }: { meal: Meal; close: React.ReactNode }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(meal.name)
  const [emoji, setEmoji] = useState(meal.emoji)
  const startFamily = meal.family_picked ? meal.family : '' // '' = guessed
  const [family, setFamily] = useState(startFamily)
  const library = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const families = [...new Set([...(library.data ?? []).map((c) => c.family), meal.family])].filter((f) => f !== 'Other').sort()
  const [picking, setPicking] = useState(false)
  const [types, setTypes] = useState<MealKind[]>(meal.types)
  const [snack, setSnack] = useState<{ snackKind: SnackKind | null; per: MealPer; pieceG: number }>({
    snackKind: meal.snack_kind, per: meal.per, pieceG: meal.piece_g ?? 30,
  })
  const product = meal.is_product ? meal.ingredients[0]?.ingredient : undefined
  const [pack, setPack] = useState<Nutrients | null>(product?.per100 ?? null) // the pack's values per 100 g / ml
  const [prepFriendly, setPrepFriendly] = useState(meal.tags.includes('prep-friendly'))
  const [prepMinutes, setPrepMinutes] = useState(meal.prep_minutes)
  const [portions, setPortions] = useState(meal.portions)
  const [items, setItems] = useState<PlateItem[]>(() =>
    meal.ingredients.map(({ ingredient, grams }) => ({ key: `m${ingredient.id}`, name: ingredient.name, grams, ingredient })))
  const [cost, setCost] = useState<number | null>(meal.cost_estimated ? null : meal.cost) // null = estimate
  const [override, setOverride] = useState<Nutrients | null>(meal.nutrients_overridden ? meal.per_portion : null)
  const [valuesOk, setValuesOk] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [steps, setSteps] = useState<string[]>(meal.steps.length ? meal.steps : [''])
  const stepsChanged = JSON.stringify(cleanSteps(steps)) !== JSON.stringify(meal.steps)

  const isSnack = types.includes('snack')
  // a product until other ingredients are added (then it's a recipe of its own)
  const stillProduct = !!product && resolvedIds(items).join() === String(product.id)
  const estimate = Math.round(recipeCost(items, 1) * 100) / 100
  const calculated = scale(plateNutrients(items), 100 / portions)
  const resolved = items.filter((i) => i.ingredient && i.grams > 0)

  const changed = () => {
    qc.invalidateQueries({ queryKey: ['meals'] })
    qc.invalidateQueries({ queryKey: ['families'] }) // a picked family teaches the guesser
    qc.invalidateQueries({ queryKey: ['day'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
    qc.invalidateQueries({ queryKey: ['plan'] })
  }
  const save = useMutation({
    mutationFn: () => {
      const patch: MealPatch = {
        name: name.trim(), ...(emoji !== meal.emoji ? { emoji } : {}), ...(family.trim() !== startFamily ? { family: family.trim() } : {}), types, prep_friendly: prepFriendly, prep_minutes: prepMinutes, portions, cost,
        items: resolved.map((i) => ({ ingredient_id: i.ingredient!.id, grams: i.grams })),
        per_portion: override,
        ...(stepsChanged ? { steps: cleanSteps(steps) } : {}), // untouched: the model may still write them
        ...(isSnack ? { snack_kind: snack.snackKind ?? 'savory', per: snack.per, ...(snack.per === 'piece' ? { piece_g: snack.pieceG } : {}) } : {}),
        ...(product && pack && stillProduct ? { product_per100: pack } : {}),
      }
      return api.patchMeal(meal.id, patch)
    },
    onSuccess: (m) => {
      qc.setQueryData(['meal', String(meal.id)], m)
      changed()
      navigate(-1)
      toast('Meal updated')
    },
  })

  return (
    <>
      <div className="top">{close}<span className="sub">Edit meal</span><span style={{ width: 44 }} /></div>
      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
        <button type="button" className="emoji-pick" aria-label={`Emoji ${emoji}, change`} onClick={() => setPicking(true)}>{emoji}</button>
        <label className="field sp" style={{ margin: 0 }}>
          Name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <EmojiPicker open={picking} value={emoji} onPick={setEmoji} onClose={() => setPicking(false)} />

      <label className="field" style={{ marginBottom: 6 }}>
        Dish family
        <input value={family} maxLength={40} list="families" placeholder={meal.family_picked ? 'Guess from the name' : `${meal.family} (guessed)`}
          onChange={(e) => setFamily(e.target.value)} />
        <datalist id="families">{families.map((f) => <option key={f} value={f} />)}</datalist>
      </label>
      <div className="sub" style={{ marginBottom: 14 }}>
        Groups variations together in Meals (pasta with any sauce is Pasta). Leave it empty and we guess.
      </div>

      <h2>Good for</h2>
      <div className="chips" role="group" aria-label="Meal types">
        {TYPES.map((t) => {
          const on = types.includes(t)
          return (
            <button key={t} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} disabled={on && types.length === 1}
              onClick={() => setTypes(on ? types.filter((x) => x !== t) : TYPES.filter((x) => x === t || types.includes(x)))}>
              {MEAL_TYPE_LABEL[t]}
            </button>
          )
        })}
      </div>

      {isSnack && <div style={{ marginTop: 14 }}><SnackFields state={snack} set={(patch) => setSnack((s) => ({ ...s, ...patch }))} /></div>}

      {stillProduct && pack && (
        <section className="card" aria-label="Pack values">
          <h3>Values per {snack.per === '100ml' ? '100 ml' : '100 g'}</h3>
          <div className="sub" style={{ marginBottom: 8 }}>as printed on the pack</div>
          <NutrientFields initial={pack} onChange={(n) => { setValuesOk(n !== null); if (n) setPack(n) }} />
        </section>
      )}

      <h2>Ingredients <span className="sub">{stillProduct ? '(add some to make it a recipe)' : `(for ${portions} portions)`}</span></h2>
      <IngredientChips items={items} setItems={(f) => setItems(f)} amountLabel="in the recipe" />

      {!stillProduct && (
        <div style={{ marginTop: 14 }}>
          <NutritionOverride calculated={calculated} override={override} onChange={setOverride} onValid={setValuesOk} showTiles />
        </div>
      )}

      {!stillProduct && (
        <>
          <div className="card row">
            <h3 className="sp">Portions made</h3>
            <Stepper label="portions made" value={portions} min={1} max={20} onChange={setPortions} />
          </div>
          <div className="card row">
            <h3 className="sp">Prep time</h3>
            <Stepper label="prep time" value={prepMinutes} step={5} min={5} max={600} unit=" min" onChange={setPrepMinutes} />
          </div>
        </>
      )}
      <div className="card">
        <div className="row">
          <div className="sp">
            <h3>Ingredient cost</h3>
            <div className="sub">{cost === null ? 'estimated from prices' : 'your amount'}</div>
          </div>
          <Stepper label="cost" value={cost ?? Math.round(estimate)} step={1} min={0} max={1000} unit=" €" decimals={2} onChange={setCost} />
        </div>
        {cost !== null && <button type="button" className="textbtn" onClick={() => setCost(null)}>Use the estimate ({estimate.toFixed(2)} €)</button>}
      </div>
      {!stillProduct && <><h2>Steps</h2><StepsEditor steps={steps} onChange={setSteps} /></>}

      {!stillProduct && <div className="card row">
        <div className="sp">
          <h3>Prep-friendly</h3>
          <div className="sub">Keeps well for a few days — the planner uses it for "Prep" slots.</div>
        </div>
        <button type="button" className={`chip${prepFriendly ? ' on' : ''}`} aria-pressed={prepFriendly} onClick={() => setPrepFriendly(!prepFriendly)}>
          {prepFriendly ? 'Yes' : 'No'}
        </button>
      </div>}

      {save.isError && <p className="error" role="alert">{save.error.message}</p>}
      <button className="btn" disabled={save.isPending || !name.trim() || resolved.length === 0 || !valuesOk || (stepsChanged && !cleanSteps(steps).length)} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
      {resolved.length === 0 && <p className="sub">A meal needs at least one ingredient.</p>}
      <p className="sub" style={{ marginTop: 10 }}>Days you already ate it are updated too. Your ingredients at home stay as they are.</p>

      <button type="button" className="btn ghost" style={{ marginTop: 24, color: 'var(--bad)' }} onClick={() => setDeleting(true)}>
        Delete meal
      </button>
      <DeleteSheet meal={meal} open={deleting} onClose={() => setDeleting(false)} onDeleted={changed} />
    </>
  )
}

function DeleteSheet({ meal, open, onClose, onDeleted }: { meal: Meal; open: boolean; onClose: () => void; onDeleted: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Delete meal">
      <DeleteForm meal={meal} onClose={onClose} onDeleted={onDeleted} /> {/* fresh state on each open */}
    </Sheet>
  )
}

function DeleteForm({ meal, onClose, onDeleted }: { meal: Meal; onClose: () => void; onDeleted: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [alsoLog, setAlsoLog] = useState(true)
  const remove = useMutation({
    mutationFn: () => api.deleteMeal(meal.id, !alsoLog),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['meal', String(meal.id)] })
      onDeleted()
      navigate('/meals', { replace: true })
      toast('Meal deleted')
    },
  })
  const times = meal.logged_count === 1 ? 'once' : `${meal.logged_count} times`

  return (
    <>
      <h1>Delete “{meal.name}”?</h1>
      <p className="sub">Its ratings and recipe go too, and it leaves any plan it's in. This can't be undone.</p>
      {meal.logged_count > 0 && (
        <label className="card row" style={{ gap: 10 }}>
          <input type="checkbox" checked={alsoLog} onChange={(e) => setAlsoLog(e.target.checked)} style={{ width: 22, height: 22 }} />
          <span className="sp">Also remove it from what we ate <span className="sub">(logged {times})</span></span>
        </label>
      )}
      {remove.isError && <p className="error" role="alert">{remove.error.message}</p>}
      <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate()}>Delete meal</button>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
    </>
  )
}
