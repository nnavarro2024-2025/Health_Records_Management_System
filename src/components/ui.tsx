import type { ReactNode } from 'react'
import { humanize } from '../lib/format'

export function Button({ children, variant = 'primary', onClick, type = 'button', disabled = false }: { children: ReactNode; variant?: 'primary'|'secondary'|'danger'|'ghost'; onClick?: () => void; type?: 'button'|'submit'; disabled?: boolean }) {
  const styles = { primary: 'bg-teal-700 text-white hover:bg-teal-800', secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50', danger: 'bg-red-700 text-white hover:bg-red-800', ghost: 'text-teal-700 hover:bg-teal-50' }
  return <button type={type} disabled={disabled} onClick={onClick} className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:opacity-60 ${styles[variant]}`}>{children}</button>
}

export function Field({ label, required, help, error, type = 'text', placeholder, defaultValue, value, onChange, name, min, max, step, pattern }: { label: string; required?: boolean; help?: string; error?: string; type?: string; placeholder?: string; defaultValue?: string; value?: string; onChange?: (value: string) => void; name?: string; min?: string | number; max?: string | number; step?: string | number; pattern?: string }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{required && <span className="ml-1 text-red-700">*</span>}<input name={name} type={type} aria-required={required || undefined} min={min} max={max} step={step} pattern={pattern} aria-invalid={error ? true : undefined} placeholder={placeholder} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={event => onChange?.(event.target.value)} className={`mt-2 min-h-11 w-full rounded-lg border bg-white px-3.5 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-4 ${error ? 'border-red-600 focus:ring-red-100' : 'border-slate-300 focus:border-teal-600 focus:ring-teal-100'}`}/>{help && <span className="mt-1.5 block text-xs font-normal text-slate-500">{help}</span>}{error && <span className="mt-1.5 block text-xs font-medium text-red-700">{error}</span>}</label>
}

export function Select({ label, required, children, defaultValue, value, onChange, name, error }: { label: string; required?: boolean; children: ReactNode; defaultValue?: string; value?: string; onChange?: (value: string) => void; name?: string; error?: string }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{required && <span className="ml-1 text-red-700">*</span>}<select name={name} aria-required={required || undefined} aria-invalid={error ? true : undefined} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={e => onChange?.(e.target.value)} className={`mt-2 min-h-11 w-full rounded-lg border bg-white px-3.5 text-slate-900 outline-none focus:ring-4 ${error ? 'border-red-600 focus:ring-red-100' : 'border-slate-300 focus:border-teal-600 focus:ring-teal-100'}`}>{children}</select>{error && <span className="mt-1.5 block text-xs font-medium text-red-700">{error}</span>}</label>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success'|'warning'|'info'|'neutral' }) {
  const s = { success: 'bg-emerald-50 text-emerald-800 ring-emerald-200', warning: 'bg-amber-50 text-amber-900 ring-amber-200', info: 'bg-blue-50 text-blue-800 ring-blue-200', neutral: 'bg-slate-100 text-slate-700 ring-slate-200' }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${s[tone]}`}><span className="size-1.5 rounded-full bg-current"/>{children}</span>
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status || ''
  const tone = ['active', 'in_progress', 'registered', 'retain'].includes(value)
    ? 'success'
    : ['pending_review', 'upcoming', 'moderate'].includes(value)
      ? 'warning'
      : ['locked', 'severe', 'approved_for_disposal'].includes(value)
        ? 'info'
        : 'neutral'
  return <Badge tone={tone}>{humanize(value)}</Badge>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div> }

export function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-600">{subtitle}</p></div>{action}</div>
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>{headers.map(h => <th key={h} className="border-b border-slate-200 px-5 py-3.5 font-bold">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>
}

export function Pagination({ page, limit, total, onPageChange }: { page: number; limit: number; total: number; onPageChange: (page: number) => void }) {
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-600"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button></div></div>
}
