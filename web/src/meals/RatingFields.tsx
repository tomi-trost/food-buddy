import type { Fill, Rating } from '../api/types'
import { Stars } from '../ui/Stars'

export const DEFAULT_RATING: Rating = { taste: 4, again: 3, effort: 3, fill: 'right' }

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

/** Taste, make again, worth the effort, how filling: shared by the rate sheet and the waiting screen. */
export function RatingFields({ draft, set }: { draft: Rating; set: (patch: Partial<Rating>) => void }) {
  return (
    <>
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
    </>
  )
}
