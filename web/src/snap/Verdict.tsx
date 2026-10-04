import { useState } from 'react'
import type { Ingredient } from '../api/types'
import { scale } from '../lib/macros'
import { Icon } from '../ui/Icon'
import { IngredientPicker } from '../ui/IngredientPicker'
import { MacroTiles } from '../ui/Macro'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { addIngredient, type PlateItem, plateNutrients, replaceIngredient, unresolved } from './plate'

type SheetState = { kind: 'edit'; key: string } | { kind: 'replace'; key: string } | { kind: 'add' } | null

export function Verdict({ dish, items, setItems, servings, setServings, onNext }: {
  dish: string
  items: PlateItem[]
  setItems: (f: (items: PlateItem[]) => PlateItem[]) => void
  servings: number
  setServings: (v: number) => void
  onNext: () => void
}) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const open = sheet && 'key' in sheet ? items.find((i) => i.key === sheet.key) : undefined
  const missing = unresolved(items)
  const totals = scale(plateNutrients(items), servings * 100)
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
      <h1 style={{ margin: '12px 0 2px' }}>{dish}</h1>
      <div className="sub">We think this is the dish. Tap an ingredient to correct it. Amounts are for one plate.</div>
      <div style={{ margin: '14px 0' }}>
        <MacroTiles values={totals} label="What you ate" />
      </div>
      <div className="chips">
        {items.map((i) => (
          <button
            key={i.key}
            className={`chip${i.ingredient ? '' : ' warn'}`}
            onClick={() => setSheet(i.ingredient ? { kind: 'edit', key: i.key } : { kind: 'replace', key: i.key })}
          >
            {i.ingredient ? `${i.ingredient.emoji} ${i.ingredient.name}` : <><Icon name="alert" size={14} /> {i.name}</>} · {Math.round(i.grams)}g
          </button>
        ))}
        <button className="chip on" onClick={() => setSheet({ kind: 'add' })}>
          <Icon name="plus" size={14} /> add
        </button>
      </div>
      <div className="card row" style={{ marginTop: 16 }}>
        <div className="sp">
          <h3>Portions you ate</h3>
          <div className="sub">1 = the whole plate in the photo</div>
        </div>
        <Stepper label="portions eaten" value={servings} step={0.5} min={0.5} max={10} onChange={setServings} />
      </div>
      {missing > 0 && (
        <p className="sub" role="note">
          <Icon name="alert" size={14} /> Pick or remove {missing} unknown ingredient{missing > 1 ? 's' : ''} to continue.
        </p>
      )}
      <button className="btn" disabled={missing > 0 || !items.some((i) => i.ingredient)} onClick={onNext}>
        Looks right
      </button>

      <Sheet open={sheet?.kind === 'edit' && !!open} onClose={() => setSheet(null)} label="Edit ingredient">
        {open?.ingredient && (
          <>
            <h1>{open.ingredient.emoji} {open.ingredient.name}</h1>
            {open.name.toLowerCase() !== open.ingredient.name.toLowerCase() && (
              <div className="sub">Detected as “{open.name}”</div>
            )}
            <div className="card row" style={{ marginTop: 12 }}>
              <span className="sp">Amount</span>
              <Stepper label="grams" value={open.grams} step={25} min={5} max={5000} unit="g"
                onChange={(g) => update(open.key, { grams: g })} />
            </div>
            <div className="sub" style={{ marginBottom: 12 }}>
              {Math.round(scale(open.ingredient.per100, open.grams).kcal)} kcal
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
            <div className="sub" style={{ marginBottom: 10 }}>{Math.round(open.grams)} g on the plate</div>
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
