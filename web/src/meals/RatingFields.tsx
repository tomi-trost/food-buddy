import type { Rating } from '../api/types'
import { EFFORT_STEPS, FILL_STEPS } from '../lib/meals'
import { StepSlider } from '../ui/Slider'
import { Stars } from '../ui/Stars'

export const DEFAULT_RATING: Rating = { taste: 4, again: 3, effort: 0, fill: 0 }

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

/** Taste, make again, worth the effort, how filling: shared by the rate sheet and the waiting screen.
 *  A snack isn't cooked: taste and "have it again?" only. */
export function RatingFields({ draft, set, snack = false }: { draft: Rating; set: (patch: Partial<Rating>) => void; snack?: boolean }) {
  return (
    <>
      <h2>Taste</h2>
      <div className="row">
        <Stars value={draft.taste} size={40} onChange={(taste) => set({ taste })} />
        <b>{draft.taste}</b>
      </div>
      <div className="sub" style={{ marginTop: 4 }}>Tap the left half of a star for a half point</div>
      <h2>{snack ? 'Have it again?' : 'Make it again?'}</h2>
      <Choice label={snack ? 'Have it again' : 'Make it again'} value={draft.again} onChange={(again) => set({ again })}
        options={[[5, 'Yes'], [3, 'Maybe'], [1, 'No']]} />
      {!snack && (
        <>
          <h2>Worth the effort?</h2>
          <StepSlider label="Worth the effort" value={draft.effort ?? 0} steps={EFFORT_STEPS} onChange={(effort) => set({ effort })} />
          <h2>How filling was it?</h2>
          <StepSlider label="How filling" value={draft.fill ?? 0} steps={FILL_STEPS} onChange={(fill) => set({ fill })} />
          <div className="sub" style={{ marginTop: 6 }}>Helps us tune carbs and fiber in the recipe.</div>
        </>
      )}
    </>
  )
}
