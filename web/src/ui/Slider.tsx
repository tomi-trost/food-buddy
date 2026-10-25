import type { Slider } from '../api/types'

/** A 7-step slider (−3…+3) with the end words under it and the current step's word above.
 *  Dragging it never moves the sheet it's in (`data-no-swipe`). */
export function StepSlider({ label, value, steps, onChange }: {
  label: string
  value: Slider
  steps: readonly string[] // 7 words, −3 … +3
  onChange: (v: Slider) => void
}) {
  return (
    <div className="step-slider" data-no-swipe>
      <div className="step-slider-now" aria-hidden>{steps[value + 3]}</div>
      <input type="range" min={-3} max={3} step={1} value={value} aria-label={label} aria-valuetext={steps[value + 3]}
        style={{ '--pct': `${((value + 3) / 6) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value) as Slider)} />
      <div className="step-slider-ticks" aria-hidden>{steps.map((s) => <span key={s} />)}</div>
      <div className="step-slider-ends" aria-hidden><span>{steps[0]}</span><span>{steps[6]}</span></div>
    </div>
  )
}
