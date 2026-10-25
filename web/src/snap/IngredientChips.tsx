import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { Ingredient, MealCard, MealPatch } from '../api/types'
import { formatAmount, isCounted } from '../lib/units'
import { EmojiPicker } from '../meals/EmojiPicker'
import { Icon } from '../ui/Icon'
import { IngredientPicker } from '../ui/IngredientPicker'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { AmountFields } from './AmountFields'
import {
  addDish, addIngredient, addPart, dishOfMeal, dishPortions, portionsLabel, makeDish, type Part, type PlateItem, recipeItems, replaceIngredient,
  replaceWithDish, splitDish, suggestDishName, withDish, withParts,
} from './plate'
import { UnitSwitch } from './UnitSwitch'

type SheetState = { kind: 'edit'; key: string } | { kind: 'replace'; key: string } | { kind: 'add' } | { kind: 'dish'; key: string } | { kind: 'make' } | null

/** Dishes of ours on the plate (bundles): `platePortions` = how many plates the grams are for
 *  (1 on the check screen, the recipe's portions in Edit meal); `exclude` = meals that can't be one. */
export type DishOptions = { platePortions: number; exclude?: number[] }

/** Ingredient chips: tap to change the amount (grams, pieces or ml), replace or remove; "add" picks a new one.
 *  With `dishes`, our meals can go on the plate too, and "Select" makes some ingredients their own dish. */
export function IngredientChips({ items, setItems, amountLabel = 'on the plate', dishes }: {
  items: PlateItem[]
  setItems: (f: (items: PlateItem[]) => PlateItem[]) => void
  amountLabel?: string
  dishes?: DishOptions
}) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const [selected, setSelected] = useState<string[] | null>(null) // null = not selecting
  const open = sheet && 'key' in sheet ? items.find((i) => i.key === sheet.key) : undefined
  const exclude = items.flatMap((i) => (i.ingredient ? [i.ingredient.id] : []))
  const excludeDishes = [...(dishes?.exclude ?? []), ...items.flatMap((i) => (i.dish?.id ? [i.dish.id] : []))]
  const platePortions = dishes?.platePortions ?? 1
  const pickDish = dishes && ((meal: MealCard) => {
    if (sheet?.kind === 'replace') setItems((list) => replaceWithDish(list, sheet.key, meal, platePortions))
    else setItems((list) => addDish(list, meal, platePortions))
    setSheet(null)
  })

  const update = (key: string, patch: Partial<PlateItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const pickReplacement = (ingredient: Ingredient) => {
    if (sheet?.kind !== 'replace') return
    setItems((list) => replaceIngredient(list, sheet.key, ingredient))
    setSheet(null)
  }

  if (selected) {
    const toggle = (key: string) => setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
    return (
      <>
        <div className="sub" style={{ marginBottom: 8 }}>Tap what goes into the dish.</div>
        <div className="chips" role="group" aria-label="Select ingredients">
          {items.filter((i) => i.ingredient && !i.dish).map((i) => {
            const on = selected.includes(i.key)
            return (
              <button key={i.key} className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(i.key)}>
                {on && <Icon name="check" size={14} />}{i.ingredient!.emoji} {i.ingredient!.name} · {formatAmount(i.grams, i.ingredient!)}
              </button>
            )
          })}
        </div>
        <button className="btn" style={{ marginTop: 12 }} disabled={!selected.length} onClick={() => setSheet({ kind: 'make' })}>
          <Icon name="layers" size={18} /> Make it its own dish{selected.length ? ` (${selected.length})` : ''}
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setSelected(null)}>Cancel</button>
        <Sheet open={sheet?.kind === 'make'} onClose={() => setSheet(null)} label="Make it its own dish">
          {sheet?.kind === 'make' && (
            <MakeDishForm selected={items.filter((i) => selected.includes(i.key))} platePortions={platePortions}
              onCancel={() => setSheet(null)}
              onMake={(name, made) => {
                setItems((list) => makeDish(list, selected, name, made, platePortions))
                setSheet(null)
                setSelected(null)
              }} />
          )}
        </Sheet>
      </>
    )
  }

  return (
    <>
      <div className="chips">
        {items.map((i) => (
          <button
            key={i.key}
            className={`chip${i.dish ? ' dish' : i.ingredient ? '' : ' warn'}`}
            onClick={() => setSheet(i.dish ? { kind: 'dish', key: i.key } : i.ingredient ? { kind: 'edit', key: i.key } : { kind: 'replace', key: i.key })}
          >
            {i.dish
              ? <>{i.dish.emoji} {i.dish.name} · {portionsLabel(dishPortions(i))}</>
              : <>{i.ingredient ? `${i.ingredient.emoji} ${i.ingredient.name}` : <><Icon name="alert" size={14} /> {i.name}</>} · {i.ingredient ? formatAmount(i.grams, i.ingredient) : `${Math.round(i.grams)} g`}</>}
          </button>
        ))}
        <button className="chip on" onClick={() => setSheet({ kind: 'add' })}>
          <Icon name="plus" size={14} /> add
        </button>
      </div>
      {dishes && items.some((i) => i.ingredient && !i.dish) && (
        <button type="button" className="textbtn" style={{ textAlign: 'left' }} onClick={() => setSelected([])}>
          Select ingredients to make them their own dish
        </button>
      )}
      <Sheet open={sheet?.kind === 'dish' && !!open?.dish} onClose={() => setSheet(null)} label="Edit dish">
        {open?.dish && (
          <DishForm item={open} update={(patch) => update(open.key, patch)} onClose={() => setSheet(null)}
            onSplit={() => { setItems((list) => splitDish(list, open.key)); setSheet(null) }}
            onRemove={() => { setItems((list) => list.filter((i) => i.key !== open.key)); setSheet(null) }} />
        )}
      </Sheet>
      <Sheet open={sheet?.kind === 'edit' && !!open} onClose={() => setSheet(null)} label="Edit ingredient">
        {open?.ingredient && (
          <>
            <h1>{open.ingredient.emoji} {open.ingredient.name}</h1>
            {open.name.toLowerCase() !== open.ingredient.name.toLowerCase() && (
              <div className="sub">Detected as “{open.name}”</div>
            )}
            <div style={{ marginTop: 12 }}>
              <UnitSwitch ingredient={open.ingredient}
                onChange={(updated) => setItems((list) => list.map((i) => (i.ingredient?.id === updated.id ? { ...i, ingredient: updated } : i)))} />
            </div>
            <AmountFields key={open.key} ingredient={open.ingredient} grams={open.grams} onChange={(grams) => update(open.key, { grams })} />
            <button className="btn ghost" onClick={() => setSheet({ kind: 'replace', key: open.key })}>
              <Icon name="swap" size={18} /> Replace with another ingredient
            </button>
            <button className="btn danger" style={{ marginTop: 8 }} onClick={() => {
              setItems((list) => list.filter((i) => i.key !== open.key))
              setSheet(null)
            }}>
              Remove ingredient
            </button>
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setSheet(null)}>Done</button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === 'replace' && !!open} onClose={() => setSheet(null)} label="Pick ingredient">
        {open && (
          <>
            <h1>Which ingredient is “{open.name}”?</h1>
            <div className="sub" style={{ marginBottom: 10 }}>{open.ingredient ? formatAmount(open.grams, open.ingredient) : `${Math.round(open.grams)} g`} {amountLabel}</div>
            <IngredientPicker hint={open.ingredient ? '' : open.name} exclude={exclude} onPick={pickReplacement}
              onPickDish={pickDish || undefined} excludeDishes={excludeDishes} />
            {!open.ingredient && (
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => {
                setItems((list) => list.filter((i) => i.key !== open.key))
                setSheet(null)
              }}>
                Remove “{open.name}”
              </button>
            )}
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === 'add'} onClose={() => setSheet(null)} label="Add ingredient">
        <h1>Add ingredient</h1>
        <IngredientPicker exclude={exclude} onPick={(ingredient) => {
          const next = addIngredient(items, ingredient)
          setItems(() => next)
          setSheet({ kind: 'edit', key: next.find((i) => i.ingredient?.id === ingredient.id)!.key })
        }} onPickDish={pickDish || undefined} excludeDishes={excludeDishes} />
      </Sheet>
    </>
  )
}

/** Name the new dish and how many portions we made of it; the selection is one plate's worth. */
function MakeDishForm({ selected, platePortions, onMake, onCancel }: {
  selected: PlateItem[]
  platePortions: number
  onMake: (name: string, made: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(() => suggestDishName(selected))
  const [made, setMade] = useState(platePortions)
  return (
    <>
      <h1>Make it its own dish</h1>
      <p className="sub">
        {selected.map((i) => i.ingredient!.name).join(', ')} become a meal of ours with its own recipe.
        This {platePortions === 1 ? 'plate holds one portion' : `recipe holds ${platePortions} portions`} of it.
      </p>
      <label className="field" style={{ marginBottom: 14 }}>
        Dish name
        <input value={name} maxLength={120} placeholder="e.g. Banana pancakes" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="card row">
        <div className="sp">
          <h3>Portions made</h3>
          <div className="sub">how many portions the batch makes</div>
        </div>
        <Stepper label="dish portions made" value={made} min={1} max={20} onChange={setMade} />
      </div>
      <button className="btn" disabled={!name.trim()} onClick={() => onMake(name, made)}>Make dish</button>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onCancel}>Cancel</button>
    </>
  )
}

/** A forgotten ingredient starts at one piece, else one tablespoon, a portion. */
const startGrams = (i: Ingredient) => (isCounted(i) ? i.unit_grams : i.tbsp_g)

type DishMode = { kind: 'view' } | { kind: 'pick' } | { kind: 'amount'; ingredient: Ingredient; grams: number }

/** A dish on the plate: how many portions, what's in it (add one we forgot, take one out), its emoji;
 *  a new one can still be renamed or split. One of our meals changes for every plate holding it. */
function DishForm({ item, update, onSplit, onRemove, onClose }: {
  item: PlateItem
  update: (patch: Partial<PlateItem>) => void
  onSplit: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const dish = item.dish!
  const portions = dishPortions(item)
  const isNew = dish.id === null
  const [mode, setMode] = useState<DishMode>({ kind: 'view' })
  const [picking, setPicking] = useState(false)
  const ours = useQuery({ queryKey: ['meal', String(dish.id)], queryFn: () => api.meal(dish.id!), enabled: !isNew })
  const parts = isNew ? dish.parts : ours.data ? dishOfMeal(ours.data).parts : dish.parts
  const save = useMutation({
    mutationFn: (patch: MealPatch) => api.patchMeal(dish.id!, patch),
    onSuccess: (m) => {
      qc.setQueryData(['meal', String(m.id)], m)
      for (const key of ['meals', 'day', 'insights', 'plan']) qc.invalidateQueries({ queryKey: [key] })
      update(withDish(item, dishOfMeal(m, dish.detected)))
      setMode({ kind: 'view' })
    },
  })
  const setParts = (next: Part[]) => {
    if (isNew) {
      update(withDish(item, withParts(dish, next)))
      setMode({ kind: 'view' })
    } else if (ours.data) save.mutate({ items: recipeItems(next, ours.data.portions) })
  }
  const setEmoji = (emoji: string) => (isNew ? update({ dish: { ...dish, emoji } }) : save.mutate({ emoji }))

  if (mode.kind === 'pick') {
    return (
      <>
        <h1>Add to {dish.name}</h1>
        <IngredientPicker exclude={parts.map((p) => p.ingredient.id)}
          onPick={(ingredient) => setMode({ kind: 'amount', ingredient, grams: startGrams(ingredient) * portions })} />
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMode({ kind: 'view' })}>Cancel</button>
      </>
    )
  }
  if (mode.kind === 'amount') {
    const { ingredient, grams } = mode
    return (
      <>
        <h1>{ingredient.emoji} {ingredient.name}</h1>
        <div className="sub" style={{ marginBottom: 12 }}>How much went into the {portionsLabel(portions)} of {dish.name} on this plate</div>
        <AmountFields ingredient={ingredient} grams={grams} onChange={(g) => setMode({ ...mode, grams: g })} />
        {!isNew && <p className="sub">Changes {dish.name} in all our meals.</p>}
        {save.isError && <p className="error" role="alert">{save.error.message}</p>}
        <button className="btn" disabled={save.isPending || grams <= 0} onClick={() => setParts(addPart(parts, ingredient, grams / portions))}>
          {save.isPending ? 'Saving…' : `Add to ${dish.name}`}
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMode({ kind: 'pick' })}>Back</button>
      </>
    )
  }
  return (
    <>
      <div className="row" style={{ alignItems: 'center' }}>
        <button type="button" className="emoji-pick" aria-label={`Emoji ${dish.emoji}, change`} disabled={save.isPending} onClick={() => setPicking(true)}>{dish.emoji}</button>
        <h1 className="sp" style={{ margin: 0 }}>{dish.name}</h1>
      </div>
      <EmojiPicker open={picking} value={dish.emoji} onPick={setEmoji} onClose={() => setPicking(false)} />
      <div className="sub" style={{ marginTop: 6 }}>{isNew ? `New dish · ${dish.made} portions made · saved with this meal` : 'One of our meals'}</div>
      {isNew && (
        <label className="field" style={{ margin: '12px 0' }}>
          Dish name
          <input value={dish.name} maxLength={120} onChange={(e) => update({ name: e.target.value, dish: { ...dish, name: e.target.value } })} />
        </label>
      )}
      <div className="card row" style={{ marginTop: 12 }}>
        <span className="sp">Portions</span>
        <Stepper label="dish portions" value={Math.round(portions * 100) / 100} step={0.5} min={0.5} max={40}
          onChange={(p) => update({ grams: p * dish.portionG })} />
      </div>
      <div className="sub" style={{ marginBottom: 12 }}>
        ≈ {Math.round(item.grams)} g · {Math.round(dish.perPortion.kcal * portions)} kcal
      </div>
      <h3>What's in it</h3>
      <div className="list" aria-label={`What's in ${dish.name}`}>
        {parts.map((p) => (
          <div key={p.ingredient.id}>
            <span>{p.ingredient.emoji}</span>
            <span className="sp">{p.ingredient.name}</span>
            <span className="sub">{formatAmount(p.grams * portions, p.ingredient)}</span>
            {parts.length > 1 && (
              <button type="button" className="icon" style={{ width: 36, height: 36 }} aria-label={`Take ${p.ingredient.name} out of ${dish.name}`}
                disabled={save.isPending} onClick={() => setParts(parts.filter((x) => x !== p))}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
        <button type="button" style={{ width: '100%', textAlign: 'left', color: 'var(--accent)' }} disabled={!isNew && !ours.data}
          onClick={() => setMode({ kind: 'pick' })}>
          <Icon name="plus" size={18} /><span className="sp">Add an ingredient</span>
        </button>
      </div>
      {!isNew && ours.isPending && <p className="sub">Loading its recipe…</p>}
      {!isNew && <p className="sub">Adding or taking out changes {dish.name} in all our meals.</p>}
      {save.isError && <p className="error" role="alert">{save.error.message}</p>}
      {dish.parts.length > 0 && (
        <button className="btn ghost" onClick={onSplit}><Icon name="swap" size={18} /> Back to separate ingredients</button>
      )}
      <button className="btn danger" style={{ marginTop: 8 }} onClick={onRemove}>Remove dish</button>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
    </>
  )
}
