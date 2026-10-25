import { useState } from 'react'
import { FOOD } from '../lib/emoji'
import { Sheet } from '../ui/Sheet'


/** Pick the emoji for a meal's card: tap one, search by word, or type any emoji. */
export function EmojiPicker({ open, value, onPick, onClose }: { open: boolean; value: string; onPick: (emoji: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const typed = query && !/^[\x00-\x7f]*$/.test(query) ? q.trim() : null // an emoji from the keyboard
  const shown = query && !typed ? FOOD.filter(([, words]) => words.includes(query)) : FOOD
  const pick = (emoji: string) => { onPick(emoji); setQ(''); onClose() }
  return (
    <Sheet open={open} onClose={onClose} label="Choose an emoji">
      <h1>Choose an emoji</h1>
      <label className="field" style={{ marginBottom: 12 }}>
        Search, or type any emoji
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. pancakes" autoComplete="off" />
      </label>
      {typed && <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => pick(typed)}>Use {typed}</button>}
      <div className="emoji-grid" role="group" aria-label="Food emoji">
        {shown.map(([emoji, words]) => (
          <button key={emoji} type="button" aria-label={words.split(' ')[0]} aria-pressed={emoji === value} onClick={() => pick(emoji)}>{emoji}</button>
        ))}
      </div>
      {!shown.length && !typed && <p className="sub">Nothing for “{q}”. Type the emoji itself from your keyboard.</p>}
    </Sheet>
  )
}
