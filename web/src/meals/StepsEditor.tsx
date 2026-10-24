import { useLayoutEffect, useRef } from 'react'
import { Icon } from '../ui/Icon'

/** A textarea as tall as its text (no inner scrolling). */
function GrowingText({ value, onChange, label }: { value: string; onChange: (text: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px` // + borders
  }, [value])
  return (
    <textarea ref={ref} aria-label={label} value={value} rows={2} maxLength={500} onChange={(e) => onChange(e.target.value)} />
  )
}

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
        <div key={i} className="step-card">
          <div className="step-head">
            <span className="step-n">Step {i + 1}</span>
            <div className="step-tools" role="group" aria-label={`Step ${i + 1} actions`}>
              <button type="button" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="del" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, j) => j !== i))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
          <GrowingText label={`Step ${i + 1}`} value={s} onChange={(text) => set(i, text)} />
        </div>
      ))}
      {steps.length < 30 && (
        <button type="button" className="btn ghost sm" onClick={() => onChange([...steps, ''])}>+ Add step</button>
      )}
    </div>
  )
}

export const cleanSteps = (steps: string[]) => steps.map((s) => s.trim()).filter(Boolean)
