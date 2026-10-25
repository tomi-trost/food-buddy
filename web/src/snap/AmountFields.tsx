import { useState } from 'react'
import type { Ingredient } from '../api/types'
import { scale } from '../lib/macros'
import {
  amountStepper, isCounted, rememberedSpoon, rememberSpoon, roundAmount, type Spoon, spoonGrams, spoonsOf, spoonsToGrams, toAmount, toGrams, unitLabel,
} from '../lib/units'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'

const fmt = (g: number) => (g < 10 ? Math.round(g * 10) / 10 : Math.round(g))

/** The amount of an ingredient in its unit, or counted in teaspoons / tablespoons (no scale needed);
 *  the spoon we used last for it opens by itself next time. */
export function AmountFields({ ingredient, grams, onChange }: { ingredient: Ingredient; grams: number; onChange: (grams: number) => void }) {
  const [spoon, setSpoon] = useState<Spoon | null>(() => (isCounted(ingredient) ? null : rememberedSpoon(ingredient.id)))
  const pick = (s: Spoon | null, count?: number) => {
    setSpoon(s)
    rememberSpoon(ingredient.id, s)
    if (s) onChange(spoonsToGrams(count ?? (spoon ? spoonsOf(grams, ingredient, spoon) : 1), ingredient, s))
  }
  return (
    <>
      <div className="card row">
        <span className="sp">Amount</span>
        <Stepper label="amount" {...amountStepper(ingredient)}
          value={roundAmount(toAmount(grams, ingredient), ingredient)}
          unit={` ${unitLabel(ingredient, 2)}`}
          onChange={(a) => onChange(toGrams(a, ingredient))} />
      </div>
      {!isCounted(ingredient) && (spoon ? (
        <div className="card" aria-label="Spoons">
          <div className="row">
            <span className="spoon-pick">
              <Toggle<Spoon> label="Spoon" variant="mini" value={spoon} onChange={(s) => pick(s)}
                options={[{ value: 'tsp', label: 'tsp' }, { value: 'tbsp', label: 'tbsp' }]} />
            </span>
            <span className="sp" />
            <Stepper label="spoons" value={spoonsOf(grams, ingredient, spoon)} step={0.5} min={0.5} max={40} decimals={1}
              unit={` ${spoon}`} onChange={(n) => onChange(spoonsToGrams(n, ingredient, spoon))} />
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            1 level {spoon === 'tsp' ? 'teaspoon' : 'tablespoon'} of {ingredient.name.toLowerCase()} ≈ {fmt(spoonGrams(ingredient, spoon))} g
          </div>
          <button type="button" className="textbtn" style={{ textAlign: 'left', minHeight: 40 }} onClick={() => pick(null)}>Back to {unitLabel(ingredient, 2)}</button>
        </div>
      ) : (
        <button type="button" className="textbtn" style={{ textAlign: 'left' }} onClick={() => pick('tbsp', 1)}>
          No scale? Count it in spoons (tsp / tbsp)
        </button>
      ))}
      <div className="sub" style={{ marginBottom: 12 }}>
        {(ingredient.unit !== 'g' || spoon) && <>≈ {Math.round(grams)} g · </>}
        {Math.round(scale(ingredient.per100, grams).kcal)} kcal
        {isCounted(ingredient) && <> · 1 {unitLabel(ingredient)} ≈ {ingredient.unit_grams} g</>}
      </div>
    </>
  )
}
