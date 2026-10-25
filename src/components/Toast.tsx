import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './ui'

type ToastKind = 'success' | 'error' | 'warning'
type ToastItem = { id: number; kind: ToastKind; message: string }
type ToastContextValue = { showToast: (kind: ToastKind, message: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null)
let nextToastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])
  const showToast = useCallback((kind: ToastKind, message: string) => {
    const id = nextToastId++
    setToasts((current) => [...current, { id, kind, message }].slice(-3))
  }, [])

  return <ToastContext.Provider value={{ showToast }}>
    {children}
    <div aria-label="Notifications" className="fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} dismiss={dismiss}/>)}
    </div>
  </ToastContext.Provider>
}

function Toast({ toast, dismiss }: { toast: ToastItem; dismiss: (id: number) => void }) {
  const timeout = toast.kind === 'success' ? 5000 : toast.kind === 'error' ? 8000 : 6000
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), timeout)
    return () => window.clearTimeout(timer)
  }, [dismiss, timeout, toast.id])

  const styles = {
    success: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    error: 'border-red-300 bg-red-50 text-red-950',
    warning: 'border-amber-300 bg-amber-50 text-amber-950',
  }
  const iconStyles = {
    success: 'bg-emerald-700 text-white',
    error: 'bg-red-700 text-white',
    warning: 'bg-amber-700 text-white',
  }
  const label = toast.kind === 'success' ? 'Success' : toast.kind === 'error' ? 'Error' : 'Warning'

  return <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg ${styles[toast.kind]}`}>
    <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-sm font-bold ${iconStyles[toast.kind]}`}>
      {toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : '⚠'}
    </span>
    <div className="min-w-0 flex-1"><p className="font-bold">{label}</p><p className="mt-0.5 break-words text-sm">{toast.message}</p></div>
    <button type="button" aria-label="Close notification" onClick={() => dismiss(toast.id)} className="grid size-8 shrink-0 place-items-center rounded-md text-lg font-semibold hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-current">×</button>
  </div>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return {
    success: (message: string) => context.showToast('success', message),
    error: (message: string) => context.showToast('error', message),
    warning: (message: string) => context.showToast('warning', message),
  }
}

export function ConfirmDialog({ title, description, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: {
  title: string
  description: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        onCancel()
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-5">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirmation-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
      <h2 id="confirmation-title" className="text-xl font-bold text-slate-950">{title}</h2>
      <div className="mt-3 text-sm text-slate-600">{description}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:opacity-60">Cancel</button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{busy ? 'Saving...' : confirmLabel}</Button>
      </div>
    </div>
  </div>
}
