import { Icon } from './Icon'

/** Half-star rating (0.5–5). Read-only without onChange. */
export function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} role={onChange ? 'group' : 'img'} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 100 : value >= i - 0.5 ? 50 : 0
        return (
          <span key={i} className="starw" style={{ width: size, height: size }}>
            <span className="sb"><Icon name="star" size={size} /></span>
            <span className="sf" style={{ width: `${fill}%` }}><Icon name="star" size={size} fill /></span>
            {onChange && (
              <>
                <button type="button" className="hz l" aria-label={`${i - 0.5} stars`} onClick={() => onChange(i - 0.5)} />
                <button type="button" className="hz r" aria-label={`${i} stars`} onClick={() => onChange(i)} />
              </>
            )}
          </span>
        )
      })}
    </span>
  )
}

export function StarNum({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <Icon name="star" size={13} fill />
      {Math.round(value * 10) / 10}
    </span>
  )
}
