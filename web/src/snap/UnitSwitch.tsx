import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { Ingredient } from '../api/types'
import { isCounted, unitLabel } from '../lib/units'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'

type Choice = 'g' | 'pc' | 'ml'

/** Count an ingredient in grams, pieces or ml, for our household everywhere. Pieces of something
 *  we never counted ask once what one weighs; ml use its density (else 1 g per ml). */
export function UnitSwitch({ ingredient, onChange }: { ingredient: Ingredient; onChange: (updated: Ingredient) => void }) {
  const qc = useQueryClient()
  const current: Choice = isCounted(ingredient) ? 'pc' : ingredient.unit === 'ml' ? 'ml' : 'g'
  const [askPiece, setAskPiece] = useState(false)
  const [pieceG, setPieceG] = useState(50)
  const save = useMutation({
    mutationFn: ({ unit, grams }: { unit: Choice; grams: number }) => api.setIngredientUnit(ingredient.id, unit, grams),
    onSuccess: (updated) => {
      setAskPiece(false)
      for (const key of ['ingredients', 'meal', 'meals', 'inventory', 'shopping']) qc.invalidateQueries({ queryKey: [key] })
      onChange(updated)
    },
  })
  const pick = (unit: Choice) => {
    if (unit === current) return setAskPiece(false)
    if (unit === 'pc') return setAskPiece(true)
    save.mutate({ unit, grams: unit === 'ml' && ingredient.unit === 'ml' ? ingredient.unit_grams : 1 })
  }

  return (
    <>
      <Toggle<Choice> label="Count in" value={askPiece ? 'pc' : current} onChange={pick}
        options={[
          { value: 'g', label: 'Grams' },
          { value: 'pc', label: isCounted(ingredient) ? unitLabel(ingredient, 2).replace(/^./, (c) => c.toUpperCase()) : 'Pieces' },
          { value: 'ml', label: 'ml' },
        ]} />
      {askPiece && (
        <div className="card" aria-label="Weight of one piece">
          <div className="row">
            <div className="sp"><h3>One piece weighs</h3><div className="sub">asked once, then counted in pieces everywhere</div></div>
            <Stepper label="piece weight" value={pieceG} step={5} min={1} max={2000} unit=" g" decimals={1} onChange={setPieceG} />
          </div>
          <button className="btn" style={{ marginTop: 10 }} disabled={save.isPending} onClick={() => save.mutate({ unit: 'pc', grams: pieceG })}>
            Count in pieces
          </button>
        </div>
      )}
      {save.error && <p className="error" role="alert">{save.error.message}</p>}
    </>
  )
}
