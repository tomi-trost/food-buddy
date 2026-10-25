import type { Nutrients } from '../api/types'
import { energySplit } from '../lib/meals'
import { useEntered } from '../ui/charts'

const LABEL = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' } as const
const COLOR = { protein: 'var(--p)', carbs: 'var(--c)', fat: 'var(--f)' } as const

/** A family's average portion: kcal, and where the energy comes from as one bar split in three
 *  (labelled below, so it isn't told by color alone). */
export function FamilyMacros({ family, avg, dishes }: { family: string; avg: Nutrients; dishes: number }) {
  const entered = useEntered()
  const split = energySplit(avg)
  if (!split.length) return null
  const said = split.map((s) => `${LABEL[s.key]} ${s.pct} %`).join(', ')
  return (
    <section className="card family-macros" aria-label={`Average portion of ${family}`}>
      <div className="row">
        <div className="sp">
          <h3>Average portion</h3>
          <div className="sub">{dishes === 1 ? 'of its one dish' : `of its ${dishes} dishes`} · fiber {Math.round(avg.fiber)} g</div>
        </div>
        <b className="family-kcal">{Math.round(avg.kcal)} <small>kcal</small></b>
      </div>
      <div className="macro-split" role="img" aria-label={`Energy from ${said}`}>
        {split.map((s) => s.pct > 0 && (
          <i key={s.key} title={`${LABEL[s.key]} · ${Math.round(s.grams)} g · ${s.pct} % of the energy`}
            style={{ flexGrow: entered ? s.pct : 0.0001, background: COLOR[s.key] }} />
        ))}
      </div>
      <div className="macro-legend" aria-hidden>
        {split.map((s) => (
          <span key={s.key}><i style={{ background: COLOR[s.key] }} />{LABEL[s.key]} <b>{Math.round(s.grams)} g</b> · {s.pct} %</span>
        ))}
      </div>
    </section>
  )
}
