import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Ingredient, Nutrients, Product } from '../api/types'
import { BarcodeScanner } from '../snacks/BarcodeScanner'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { NutrientFields } from '../ui/NutrientFields'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'

const EMPTY: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }

type Draft = { code: string; name: string; per: Product['per']; per100: Nutrients; pieces: boolean; pieceG: number; typed: boolean }

const draftOf = (p: Product): Draft => ({
  code: p.code,
  name: p.brand ? `${p.name} (${p.brand.split(',')[0].trim()})` : p.name,
  per: p.per,
  per100: p.per100 ?? EMPTY,
  pieces: p.piece_g !== null,
  pieceG: p.piece_g ?? p.serving_g ?? 50,
  typed: p.per100 === null,
})

/** Scan a pack (a tortilla, a sauce) to cook with: one of ours goes straight in; a new one is
 *  checked once (name, values per 100 g / ml, counted in pieces?) and becomes our ingredient. */
export function ScanIngredient({ onPick, onCancel }: { onPick: (ingredient: Ingredient) => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [valid, setValid] = useState(true)
  const lookup = useMutation({
    mutationFn: api.product,
    onSuccess: (p) => (p.ingredient ? onPick(p.ingredient) : (setDraft(draftOf(p)), setValid(p.per100 !== null))),
  })
  const save = useMutation({
    mutationFn: (d: Draft) => api.ingredientFromBarcode(d.code, { name: d.name.trim(), per: d.per, per100: d.per100, piece_g: d.pieces ? d.pieceG : null }),
    onSuccess: (ingredient) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      onPick(ingredient)
    },
  })

  if (draft) {
    const unit = draft.per === '100ml' ? 'ml' : 'g'
    return (
      <div aria-label="New ingredient from the pack">
        <h2>{draft.typed ? 'Type it from the pack' : 'Check it once'}</h2>
        <p className="sub" style={{ marginTop: 0 }}>It becomes one of our ingredients: next time the barcode adds it straight away.</p>
        <label className="field" style={{ marginBottom: 12 }}>
          Name
          <input value={draft.name} maxLength={120} placeholder="e.g. Tortilla wraps" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <div className="sub" style={{ marginBottom: 6 }}>Per 100 {unit}</div>
        {draft.typed ? <NutrientFields initial={draft.per100} onChange={(n) => { setValid(n !== null); if (n) setDraft({ ...draft, per100: n }) }} />
          : <MacroTiles values={draft.per100} label={`Per 100 ${unit}`} />}
        {!draft.typed && <button className="textbtn" onClick={() => setDraft({ ...draft, typed: true })}>Fix the values</button>}
        <Toggle<'weighed' | 'pieces'> label="Count it in" value={draft.pieces ? 'pieces' : 'weighed'} onChange={(v) => setDraft({ ...draft, pieces: v === 'pieces' })}
          options={[{ value: 'weighed', label: unit === 'ml' ? 'ml' : 'Grams' }, { value: 'pieces', label: 'Pieces' }]} />
        {draft.pieces && (
          <div className="card row">
            <div className="sp"><h3>One piece</h3><div className="sub">one tortilla, one slice…</div></div>
            <Stepper label="piece weight" value={draft.pieceG} step={5} min={1} max={2000} unit={` ${unit}`} decimals={1}
              onChange={(pieceG) => setDraft({ ...draft, pieceG })} />
          </div>
        )}
        {save.error && <p className="error" role="alert">{save.error.message}</p>}
        <button className="btn" disabled={save.isPending || !valid || !draft.name.trim()} onClick={() => save.mutate(draft)}>
          {save.isPending ? 'Adding…' : `Add ${draft.name.trim() || 'it'}`}
        </button>
        <button className="textbtn" onClick={() => { setDraft(null); lookup.reset() }}>Scan another</button>
      </div>
    )
  }

  const notFound = lookup.error instanceof ApiError && lookup.error.status === 404
  return (
    <div aria-label="Scan an ingredient">
      <BarcodeScanner busy={lookup.isPending} onCode={(code) => lookup.mutate(code)} />
      {lookup.error && (
        <div role="alert" className="card" style={{ marginTop: 12 }}>
          <p className="error" style={{ margin: 0 }}>{notFound ? 'Not in Open Food Facts yet.' : lookup.error.message}</p>
          {notFound && (
            <button className="btn" style={{ marginTop: 10 }}
              onClick={() => { setDraft({ code: lookup.variables!, name: '', per: '100g', per100: EMPTY, pieces: false, pieceG: 50, typed: true }); setValid(false) }}>
              <Icon name="edit" size={18} /> Type the values from the pack
            </button>
          )}
        </div>
      )}
      <button className="textbtn add-back" onClick={onCancel}><Icon name="back" size={18} /> Search instead</button>
    </div>
  )
}
