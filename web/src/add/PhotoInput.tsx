import { type ChangeEvent, type ReactNode, useId } from 'react'

/** A tappable area that opens the camera (`camera`) or the photo library and hands over the file.
 *  Without `capture`, iOS offers the library, for photos taken earlier. */
export function PhotoInput({ camera = false, label, disabled = false, onFile, className, children }: {
  camera?: boolean
  label: string
  disabled?: boolean
  onFile: (file: File) => void
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = '' // picking the same photo again still fires onChange
  }
  return (
    <>
      <input id={id} className="visually-hidden" type="file" accept="image/*" capture={camera ? 'environment' : undefined}
        aria-label={label} disabled={disabled} onChange={pick} />
      <label htmlFor={id} className={className} aria-disabled={disabled}>{children}</label>
    </>
  )
}
