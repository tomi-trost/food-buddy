import type { CSSProperties, ReactNode } from 'react'

type Option<T extends string> = { value: T; label: ReactNode; ariaLabel?: string }

/** One component for the toggle styles: seg (a switch: grey track, white thumb that slides to the
 *  choice; `stack` puts icons above short labels), tabs (underline), mini, tseg (dark pills). */
export function Toggle<T extends string>({ value, options, onChange, variant = 'seg', label, stack = false }: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  variant?: 'seg' | 'tabs' | 'mini' | 'tseg'
  label: string
  stack?: boolean
}) {
  const at = options.findIndex((o) => o.value === value)
  return (
    <div className={`${variant}${stack ? ' stack' : ''}`} role="group" aria-label={label}
      style={{ '--n': options.length } as CSSProperties}>
      {variant === 'seg' && at >= 0 && (
        <span className="seg-thumb" aria-hidden style={{ transform: `translateX(${at * 100}%)` }} />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
