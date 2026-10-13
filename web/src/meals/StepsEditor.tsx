/** Recipe steps as editable text: change, reorder, remove, add. Empty steps are dropped on save. */
export function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  const set = (i: number, text: string) => onChange(steps.map((s, j) => (j === i ? text : s)))
  const move = (i: number, by: number) => {
    const next = [...steps]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
  }
  return (
    <div className="steps-edit">
      {steps.map((s, i) => (
        <div key={i} className="step-row">
          <span className="step-n" aria-hidden="true">{i + 1}</span>
          <textarea aria-label={`Step ${i + 1}`} value={s} rows={2} maxLength={500} onChange={(e) => set(i, e.target.value)} />
          <div className="step-tools">
            <button type="button" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button type="button" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, j) => j !== i))}>✕</button>
          </div>
        </div>
      ))}
      {steps.length < 30 && (
        <button type="button" className="btn ghost sm" onClick={() => onChange([...steps, ''])}>+ Add step</button>
      )}
    </div>
  )
}

export const cleanSteps = (steps: string[]) => steps.map((s) => s.trim()).filter(Boolean)
