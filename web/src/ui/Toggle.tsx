import type { ReactNode } from 'react'

type Option<T extends string> = { value: T; label: ReactNode; ariaLabel?: string }

/** One component for the mock's three toggle styles: seg (pill), tabs (underline), mini, tseg (dark pills). */
export function Toggle<T extends string>({ value, options, onChange, variant = 'seg', label }: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  variant?: 'seg' | 'tabs' | 'mini' | 'tseg'
  label: string
}) {
  return (
    <div className={variant} role="group" aria-label={label}>
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
