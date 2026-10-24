import { useState } from 'react'
import { api } from '../api/client'
import type { DishSuggestion } from '../api/types'
import { type PlateItem, replaceWithDish } from './plate'

/** "Pancakes — your Healthy banana pancakes?" for items the photo called by one of our dishes'
 *  aliases (#18). Yes swaps the item for a portion of the dish; No is counted on the server, which
 *  stops asking after three in a row. */
export function DishSuggestions({ suggestions, items, setItems }: {
  suggestions: DishSuggestion[]
  items: PlateItem[]
  setItems: (f: (items: PlateItem[]) => PlateItem[]) => void
}) {
  const [answered, setAnswered] = useState<number[]>([])
  // fromAnalysis keys items by their index in the result
  const open = suggestions.filter((s) => !answered.includes(s.item) && items.some((i) => i.key === `a${s.item}` && !i.dish))
  const answer = (s: DishSuggestion) => setAnswered((a) => [...a, s.item])

  return open.map((s) => (
    <section className="card" key={s.item} aria-label={`Is it our ${s.dish.name}?`}>
      <div className="row">
        <span style={{ fontSize: 26 }} aria-hidden>{s.dish.emoji}</span>
        <div className="sp">
          <h3>{s.name.charAt(0).toUpperCase() + s.name.slice(1)} — your {s.dish.name}?</h3>
          <div className="sub">1 portion · {Math.round(s.dish.per_portion.kcal)} kcal</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn sm" onClick={() => {
          setItems((list) => replaceWithDish(list, `a${s.item}`, s.dish))
          answer(s)
        }}>Yes, swap</button>
        <button className="btn sm ghost" onClick={() => {
          api.declineAlias(s.dish.id, s.name).catch(() => {}) // only stops future questions
          answer(s)
        }}>No</button>
      </div>
    </section>
  ))
}
