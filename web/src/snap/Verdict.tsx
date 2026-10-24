import { useState } from 'react'
import type { DishSuggestion, Nutrients } from '../api/types'
import { scale } from '../lib/macros'
import { NutritionOverride } from '../meals/NutritionOverride'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { Stepper } from '../ui/Stepper'
import { DishSuggestions } from './DishSuggestions'
import { IngredientChips } from './IngredientChips'
import { isResolved, type PlateItem, plateNutrients, unresolved } from './plate'

export function Verdict({ dish, items, setItems, servings, setServings, override, setOverride, onNext, suggestions = [] }: {
  dish: string
  suggestions?: DishSuggestion[] // items that may be one of our dishes
  items: PlateItem[]
  setItems: (f: (items: PlateItem[]) => PlateItem[]) => void
  servings: number
  setServings: (v: number) => void
  override: Nutrients | null // typed-in values for one portion (the plate)
  setOverride: (n: Nutrients | null) => void
  onNext: () => void
}) {
  const [valuesOk, setValuesOk] = useState(true)
  const missing = unresolved(items)
  const totals = scale(override ?? plateNutrients(items), servings * 100)

  return (
    <>
      <h1 style={{ margin: '12px 0 2px' }}>{dish}</h1>
      <div className="sub">We think this is the dish. Tap an ingredient to correct it, or pick one of our dishes. Amounts are for one plate.</div>
      <div style={{ margin: '14px 0' }}>
        <MacroTiles values={totals} label="What you ate" />
      </div>
      <DishSuggestions suggestions={suggestions} items={items} setItems={setItems} />
      <IngredientChips items={items} setItems={setItems} dishes={{ platePortions: 1 }} />
      <div style={{ marginTop: 16 }}>
        <NutritionOverride calculated={plateNutrients(items)} override={override} onChange={setOverride} onValid={setValuesOk} />
      </div>
      <div className="card row">
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
      <button className="btn" disabled={missing > 0 || !items.some(isResolved) || !valuesOk} onClick={onNext}>
        Looks right
      </button>
    </>
  )
}
