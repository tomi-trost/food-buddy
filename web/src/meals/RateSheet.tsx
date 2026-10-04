import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Fill, Meal, Rating } from '../api/types'
import { Sheet } from '../ui/Sheet'
import { Stars } from '../ui/Stars'
import { useToast } from '../ui/Toast'

const DEFAULT: Rating = { taste: 4, again: 3, effort: 3, fill: 'right' }

function Choice<T extends string | number>({ label, value, options, onChange }: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} className={`chip${value === v ? ' on' : ''}`} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

export function RateSheet({ meal, meId, open, onClose }: { meal: Meal; meId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = meal.ratings.find((r) => r.user_id === meId)?.rating
  const [draft, setDraft] = useState<Rating>(existing ?? DEFAULT)
  useEffect(() => {
    if (open) setDraft(existing ?? DEFAULT)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.rateMeal(meal.id, draft),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', String(meal.id)], updated)
      qc.invalidateQueries({ queryKey: ['meals'] })
      onClose()
      const partnerDone = updated.ratings.filter((r) => r.user_id !== meId).every((r) => r.rating)
      toast(partnerDone ? 'Rating saved' : 'Rating saved — waiting for partner')
    },
  })
  const set = (patch: Partial<Rating>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Sheet open={open} onClose={onClose} label="Rate meal">
      <h1>Rate {meal.name}</h1>
      <h2>Taste</h2>
      <div className="row">
        <Stars value={draft.taste} size={40} onChange={(taste) => set({ taste })} />
        <b>{draft.taste}</b>
      </div>
      <div className="sub" style={{ marginTop: 4 }}>Tap the left half of a star for a half point</div>
      <h2>Make it again?</h2>
      <Choice label="Make it again" value={draft.again} onChange={(again) => set({ again })}
        options={[[5, 'Yes'], [3, 'Maybe'], [1, 'No']]} />
      <h2>Worth the effort?</h2>
      <Choice label="Worth the effort" value={draft.effort} onChange={(effort) => set({ effort })}
        options={[[5, 'Totally'], [3, 'Meh'], [1, 'Not really']]} />
      <h2>How filling was it?</h2>
      <Choice<Fill> label="How filling" value={draft.fill} onChange={(fill) => set({ fill })}
        options={[['hungry', 'Left us hungry'], ['right', 'Just right'], ['heavy', 'Too heavy']]} />
      <div className="sub" style={{ marginTop: 6 }}>Helps us tune carbs and fiber in the recipe.</div>
      {save.isError && <p className="error" role="alert">{save.error.message}</p>}
      <button className="btn" style={{ marginTop: 20 }} disabled={save.isPending} onClick={() => save.mutate()}>
        Save rating
      </button>
    </Sheet>
  )
}
