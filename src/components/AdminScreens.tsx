import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../api'
import { Badge, Button, Card, Field, PageTitle, Pagination, Select, StatusBadge, Table } from './ui'
import { ConfirmDialog, useToast } from './Toast'
import { UserCreateForm } from './UserCreateForm'
import { formatDate, formatDateTime, humanize } from '../lib/format'

type PaginationData = { page: number; limit: number; total: number; totalPages: number }
type ListResponse<T> = { data: T[]; pagination: PaginationData }
type AuditRow = {
  audit_log_id: number
  actor_name: string
  role: string | null
  action_code: string
  description: string
  patient_name: string | null
  hospital_id: string | null
  occurred_at: string
}
type RetentionRow = {
  retention_record_id: number
  review_due_date: string
  review_status: string
  category_name: string
  discharge_datetime: string
  hospital_id: string
  patient_name: string
}
type UserRow = {
  user_id: number
  email: string
  account_status: 'active' | 'inactive' | 'locked'
  last_login_at: string | null
  role_name: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  credentials: string | null
  staff_type: string | null
  license_number: string | null
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

function dateTime(value: string | null) {
  return formatDateTime(value)
}

function friendlyAction(code: string) {
  const known: Record<string, string> = {
    PATIENT_REGISTERED: 'Patient registered',
    PATIENT_RECORD_VIEWED: 'Patient record viewed',
    ADMISSION_CREATED: 'Admission created',
    ADMISSION_DISCHARGED: 'Patient discharged',
    VITALS_RECORDED: 'Vitals recorded',
    RETENTION_RETAINED: 'Record retained',
    RETENTION_DISPOSAL_APPROVED: 'Disposal approved',
    USER_CREATED: 'User created',
    USER_UPDATED: 'User updated',
    LOGIN_SUCCESS: 'Login successful',
    LOGIN_FAILURE: 'Login failed',
  }
  return known[code] ?? humanize(code)
}

export function AuditScreen() {
  const [actions, setActions] = useState<string[]>([])
  const [actionsError, setActionsError] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest<{ data: string[] }>('/api/audit-logs/actions')
      .then((result) => { if (active) setActions(result.data) })
      .catch((reason: unknown) => { if (active) setActionsError(messageOf(reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (q.trim()) params.set('q', q.trim())
      if (from) params.set('dateFrom', from)
      if (to) params.set('dateTo', to)
      if (action) params.set('action', action)
      apiRequest<ListResponse<AuditRow>>(`/api/audit-logs?${params}`)
        .then((result) => {
          if (!active) return
          setRows(result.data)
          setPagination(result.pagination)
        })
        .catch((reason: unknown) => { if (active) setError(messageOf(reason)) })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [action, from, page, q, to])

  function changeFilter(update: () => void) {
    setPage(1)
    update()
  }

  return <>
    <PageTitle title="Audit Log" subtitle="Review access and changes to protected health information."/>
    <Card>
      <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
        <input aria-label="Search audit log" placeholder="Search actor, patient, or hospital ID…" value={q} onChange={(event) => changeFilter(() => setQ(event.target.value))} className="min-h-11 min-w-56 flex-1 rounded-lg border border-slate-300 px-3.5"/>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">From<input aria-label="From date" type="date" value={from} onChange={(event) => changeFilter(() => setFrom(event.target.value))} className="min-h-11 rounded-lg border border-slate-300 px-3"/></label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">To<input aria-label="To date" type="date" value={to} onChange={(event) => changeFilter(() => setTo(event.target.value))} className="min-h-11 rounded-lg border border-slate-300 px-3"/></label>
        <select aria-label="Filter by action" value={action} onChange={(event) => changeFilter(() => setAction(event.target.value))} className="min-h-11 rounded-lg border border-slate-300 px-3.5"><option value="">All actions</option>{actions.map((code) => <option key={code} value={code}>{friendlyAction(code)}</option>)}</select>
      </div>
      {actionsError && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Action filters could not be loaded: {actionsError}</p>}
      {error && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading audit entries…</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-slate-600">No audit entries match these filters.</p>
          : <Table headers={['User','Role','Action','Patient record','Date & time']}>{rows.map((row) => <tr key={row.audit_log_id}>
            <td className="px-5 py-4 font-semibold">{row.actor_name}</td><td className="px-5 py-4">{row.role ?? '—'}</td>
            <td className="px-5 py-4"><Badge tone="info">{friendlyAction(row.action_code)}</Badge><span className="mt-1 block text-xs text-slate-500">{row.description}</span></td>
            <td className="px-5 py-4">{row.patient_name ?? '—'}{row.hospital_id && <span className="block font-mono text-xs text-slate-500">{row.hospital_id}</span>}</td>
            <td className="px-5 py-4">{dateTime(row.occurred_at)}</td>
          </tr>)}</Table>}
      {!loading && <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onPageChange={setPage}/>}
    </Card>
  </>
}

export function RetentionScreen() {
  const [rows, setRows] = useState<RetentionRow[]>([])
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<{ row: RetentionRow; decision: 'approve_for_disposal' | 'retain' } | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function loadRecords() {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<ListResponse<RetentionRow>>(`/api/retention-records?status=pending_review&page=${page}&limit=10`)
      setRows(result.data)
      setPagination(result.pagination)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadRecords() }, [page])

  async function review() {
    if (!selected) return
    setSaving(true)
    try {
      await apiRequest(`/api/retention-records/${selected.row.retention_record_id}/review`, {
        method: 'POST',
        body: { decision: selected.decision },
      })
      toast.success(selected.decision === 'retain' ? 'Record marked to retain.' : 'Disposal approved and recorded.')
      setSelected(null)
      await loadRecords()
    } catch (reason) {
      toast.error(messageOf(reason))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageTitle title="Retention & Disposal" subtitle="Admin review queue for records that have met the approved retention period."/>
    <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>{pagination.total} records require review.</strong> Disposal must be authorized and documented according to hospital policy and applicable law.</div>
    <Card>
      {error && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading records due for review…</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-slate-600">No records are due for review</p>
          : <Table headers={['Hospital ID','Patient name','Discharge date','Category','Due date','Status','Decision']}>{rows.map((row) => <tr key={row.retention_record_id}>
            <td className="px-5 py-4 font-mono text-xs">{row.hospital_id}</td><td className="px-5 py-4 font-semibold">{row.patient_name}</td>
            <td className="px-5 py-4">{formatDate(row.discharge_datetime)}</td><td className="px-5 py-4">{humanize(row.category_name)}</td>
            <td className="px-5 py-4">{formatDate(row.review_due_date)}</td><td className="px-5 py-4"><StatusBadge status={row.review_status}/></td>
            <td className="px-5 py-4"><div className="flex flex-wrap gap-2"><Button variant="danger" onClick={() => setSelected({ row, decision: 'approve_for_disposal' })}>Approve disposal</Button><Button variant="secondary" onClick={() => setSelected({ row, decision: 'retain' })}>Retain</Button></div></td>
          </tr>)}</Table>}
      {!loading && rows.length > 0 && <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onPageChange={setPage}/>}
    </Card>
    {selected && <ConfirmDialog
      title={selected.decision === 'retain' ? 'Retain this record?' : 'Approve record disposal?'}
      description={<>This decision for <strong>{selected.row.hospital_id} — {selected.row.patient_name}</strong> will be recorded in the audit log.</>}
      confirmLabel={selected.decision === 'retain' ? 'Confirm retain' : 'Yes, approve disposal'}
      danger={selected.decision === 'approve_for_disposal'}
      busy={saving}
      onConfirm={() => { void review() }}
      onCancel={() => setSelected(null)}
    />}
  </>
}

export function UsersScreen({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<UserRow[]>([])
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [managedRole, setManagedRole] = useState('')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<ListResponse<UserRow>>(`/api/users?page=${page}&limit=10`)
      setRows(result.data)
      setPagination(result.pagination)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadUsers() }, [page])

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setEditError('')
    setEditErrors({})
    const form = new FormData(event.currentTarget)
    const body: Record<string, string> = {}
    for (const key of ['account_status', 'password']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) body[key] = value
    }
    body.role = managedRole
    const licenseNumber = String(form.get('license_number') ?? '').trim()
    if (managedRole === 'Physician' || managedRole === 'Nurse') {
      if (!licenseNumber) {
        setEditErrors({ license_number: 'A license number is required for physicians and nurses' })
        return
      }
      body.license_number = licenseNumber
    }
    if (Object.keys(body).length === 0) {
      setEditErrors({ role: 'Choose a role, status, or enter a new password' })
      return
    }
    setSaving(true)
    try {
      await apiRequest(`/api/users/${selected.user_id}`, { method: 'PATCH', body })
      toast.success('User account updated.')
      setSelected(null)
      await loadUsers()
    } catch (reason) {
      setEditError(messageOf(reason))
      if (reason instanceof ApiError && reason.fields) setEditErrors(reason.fields)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageTitle title="User Management" subtitle="Manage hospital staff access and role-based permissions." action={<Button onClick={() => { setShowCreate((value) => !value); setSelected(null) }}>{showCreate ? 'Close' : 'Add user'}</Button>}/>
    {showCreate && <UserCreateForm onCancel={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); toast.success('User created.'); void loadUsers() }}/>}
    {selected && <Card className="mb-5 p-6">
      <h2 className="mb-1 text-lg font-bold">Manage {selected.first_name} {selected.last_name}</h2><p className="mb-4 text-sm text-slate-600">{selected.email}</p>
      <form onSubmit={updateUser} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Select name="role" label="Role" value={managedRole} onChange={setManagedRole} error={editErrors.role}><option value="">Select role</option><option>Admin</option><option>Records Officer</option><option>Physician</option><option>Nurse</option></Select>
          <Select name="account_status" label="Account status" defaultValue="" error={editErrors.account_status}><option value="">No change</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="locked">Locked</option></Select>
          {['Physician', 'Nurse'].includes(managedRole) && <Field name="license_number" label="License number" required defaultValue={selected.license_number ?? ''} error={editErrors.license_number}/>}
          <Field name="password" label="Reset password (optional)" type="password" error={editErrors.password}/>
        </div>
        {String(selected.user_id) === currentUserId && <p className="text-sm text-slate-600">You can change your own role or reset your password, but cannot deactivate or lock your account.</p>}
        {editError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{editError}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button></div>
      </form>
    </Card>}
    <Card>
      {error && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading users…</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-slate-600">No users found.</p>
          : <Table headers={['User','Email','Role','Status','Last login','Action']}>{rows.map((user) => {
            const displayName = [user.credentials, user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')
            return <tr key={user.user_id}>
              <td className="px-5 py-4 font-semibold">{displayName || user.email}</td><td className="px-5 py-4">{user.email}</td>
              <td className="px-5 py-4"><StatusBadge status={user.role_name}/></td>
              <td className="px-5 py-4"><StatusBadge status={user.account_status}/></td>
              <td className="px-5 py-4">{dateTime(user.last_login_at)}</td>
              <td className="px-5 py-4"><Button variant="ghost" onClick={() => { setShowCreate(false); setSelected(user); setManagedRole(user.role_name); setEditErrors({}); setEditError('') }}>Manage</Button></td>
            </tr>
          })}</Table>}
      {!loading && rows.length > 0 && <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onPageChange={setPage}/>}
    </Card>
  </>
}
