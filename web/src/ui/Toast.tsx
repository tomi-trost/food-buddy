import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'

type ToastState = { msg: string; undo?: () => void; id: number }
type Show = (msg: string, opts?: { undo?: () => void }) => void

const ToastContext = createContext<Show>(() => {})

export const TOAST_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = useCallback<Show>((msg, opts) => {
    clearTimeout(timer.current)
    setToast({ msg, undo: opts?.undo, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span className="sp">{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.()
                setToast(null)
              }}
            >
              <b>Undo</b>
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
