const VALUE_LABELS: Record<string, string> = {
  unscheduled_emergency: 'Unscheduled / Emergency',
  in_progress: 'In progress',
  approved_for_disposal: 'Approved for disposal',
  pending_review: 'Pending review',
  outpatient: 'Outpatient',
  inpatient: 'Inpatient',
  emergency: 'Emergency',
  scheduled: 'Scheduled',
  discharged: 'Discharged',
  cancelled: 'Cancelled',
  registered: 'Registered',
  admitted: 'Admitted',
  active: 'Active',
  inactive: 'Inactive',
  locked: 'Locked',
  resolved: 'Resolved',
  stopped: 'Stopped',
  completed: 'Completed',
  retain: 'Retain',
  unknown: 'Unknown',
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
  female: 'Female',
  male: 'Male',
  other: 'Other',
}

function parseDate(value: unknown) {
  if (value == null || value === '') return null
  const text = String(value)
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDateTime(value: unknown) {
  const date = parseDate(value)
  if (!date) return '—'
  const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  return `${day}, ${time}`
}

export function formatDate(value: unknown) {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'
}

export function formatCurrency(value: unknown) {
  if (value == null || value === '') return '—'
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
    : '—'
}

export function humanize(value: unknown) {
  if (value == null || value === '') return '—'
  const text = String(value)
  if (VALUE_LABELS[text]) return VALUE_LABELS[text]
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
