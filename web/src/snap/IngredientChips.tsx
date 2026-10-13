import { useState } from 'react'
import type { Ingredient } from '../api/types'
import { scale } from '../lib/macros'
import { amountStepper, formatAmount, isCounted, roundAmount, toAmount, toGrams, unitLabel } from '../lib/units'
import { Icon } from '../ui/Icon'
import { IngredientPicker } from '../ui/IngredientPicker'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { addIngredient, type PlateItem, replaceIngredient } from './plate'

type SheetState = { kind: 'edit'; key: string } | { kind: 'replace'; key: string } | { kind: 'add' } | null

/** Ingredient chips: tap to change the amount (grams, pieces or ml), replace or remove; "add" picks a new one. */
export function IngredientChips({ items, setItems, amountLabel = 'on the plate' }: {
  items: PlateItem[]
  setItems: (f: (items: PlateItem[]) => PlateItem[]) => void
  amountLabel?: string
}) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const open = sheet && 'key' in sheet ? items.find((i) => i.key === sheet.key) : undefined
  const exclude = items.flatMap((i) => (i.ingredient ? [i.ingredient.id] : []))

  const update = (key: string, patch: Partial<PlateItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const pickReplacement = (ingredient: Ingredient) => {
    if (sheet?.kind !== 'replace') return
    setItems((list) => replaceIngredient(list, sheet.key, ingredient))
    setSheet(null)
  }

  return (
    <>
      <div className="chips">
        {items.map((i) => (
          <button
            key={i.key}
            className={`chip${i.ingredient ? '' : ' warn'}`}
            onClick={() => setSheet(i.ingredient ? { kind: 'edit', key: i.key } : { kind: 'replace', key: i.key })}
          >
            {i.ingredient ? `${i.ingredient.emoji} ${i.ingredient.name}` : <><Icon name="alert" size={14} /> {i.name}</>} · {i.ingredient ? formatAmount(i.grams, i.ingredient) : `${Math.round(i.grams)} g`}
          </button>
        ))}
        <button className="chip on" onClick={() => setSheet({ kind: 'add' })}>
          <Icon name="plus" size={14} /> add
        </button>
      </div>
      <Sheet open={sheet?.kind === 'edit' && !!open} onClose={() => setSheet(null)} label="Edit ingredient">
        {open?.ingredient && (
          <>
            <h1>{open.ingredient.emoji} {open.ingredient.name}</h1>
            {open.name.toLowerCase() !== open.ingredient.name.toLowerCase() && (
              <div className="sub">Detected as “{open.name}”</div>
            )}
            <div className="card row" style={{ marginTop: 12 }}>
              <span className="sp">Amount</span>
              <Stepper label="amount" {...amountStepper(open.ingredient)}
                value={roundAmount(toAmount(open.grams, open.ingredient), open.ingredient)}
                unit={` ${unitLabel(open.ingredient, 2)}`}
                onChange={(a) => update(open.key, { grams: toGrams(a, open.ingredient!) })} />
            </div>
            <div className="sub" style={{ marginBottom: 12 }}>
              {open.ingredient.unit !== 'g' && <>≈ {Math.round(open.grams)} g · </>}
              {Math.round(scale(open.ingredient.per100, open.grams).kcal)} kcal
              {isCounted(open.ingredient) && <> · 1 {unitLabel(open.ingredient)} ≈ {open.ingredient.unit_grams} g</>}
            </div>
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
            <IngredientPicker hint={open.ingredient ? '' : open.name} exclude={exclude} onPick={pickReplacement} />
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
        }} />
      </Sheet>
    </>
  )
}
