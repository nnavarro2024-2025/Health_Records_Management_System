import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, apiRequest, type Role } from '../api'
import { Button, Card, Field, PageTitle, Pagination, Select, StatusBadge, Table } from './ui'
import { useToast } from './Toast'
import { formatCurrency, formatDate, formatDateTime, humanize } from '../lib/format'

type NavigationProps = { go: (screen: 'patients' | 'register' | 'profile' | 'admission' | 'discharge', patientId?: string) => void }
type ListResponse<T> = { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
type ReferenceDiagnosis = { diagnosis_id: number; diagnosis_code: string; diagnosis_name: string }
type PatientOption = { patient_id: number; hospital_id: string; first_name: string; middle_name: string | null; last_name: string }
type StaffOption = { staff_id: number; credentials: string | null; first_name: string; middle_name: string | null; last_name: string }
type NamedOption = { payment_source_id?: number; disposition_id?: number; source_name?: string; disposition_name?: string }
type ProcedureOption = { procedure_id: number; procedure_code: string; procedure_name: string }

const fieldClass = 'mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-slate-900 focus:border-teal-600 focus:ring-4 focus:ring-teal-100'
const multiSelectClass = `${fieldClass} min-h-32`

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError && error.fields ? error.fields : {}
}

function fieldError(errors: Record<string, string>, name: string) {
  return errors[name] || Object.entries(errors).find(([key]) => key.startsWith(`${name}.`))?.[1]
}

function formValue(form: FormData, key: string) {
  return String(form.get(key) || '').trim()
}

function requiredErrors(form: FormData, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => !formValue(form, field)).map((field) => [field, 'This field is required']))
}

function todayDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function MultiSelect({ label, name, required = false, children }: { label: string; name: string; required?: boolean; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{required && <span className="ml-1 text-red-700">*</span>}
    <select name={name} multiple className={multiSelectClass}>{children}</select>
    <span className="mt-1.5 block text-xs font-normal text-slate-500">Use Ctrl or Command to select multiple entries.</span>
  </label>
}

export function PatientRegister({ go }: NavigationProps) {
  const toast = useToast()
  const [diagnoses, setDiagnoses] = useState<ReferenceDiagnosis[]>([])
  const [loading, setLoading] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    apiRequest<ListResponse<ReferenceDiagnosis>>('/api/reference/diagnoses?limit=100')
      .then((result) => { if (active) setDiagnoses(result.data) })
      .catch((reason: unknown) => { if (active) setReferenceError(errorMessage(reason)) })
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setError('')
    setErrors({})
    setLoading(true)
    try {
      const form = new FormData(formElement)
      const missing = requiredErrors(form, ['first_name', 'last_name', 'date_of_birth', 'sex', 'street_barangay', 'city_municipality', 'province'])
      if (Object.keys(missing).length) {
        setErrors(missing)
        return
      }
      const dateOfBirth = formValue(form, 'date_of_birth')
      const mobileNumber = formValue(form, 'mobile_number')
      const clientErrors: Record<string, string> = {}
      if (dateOfBirth >= todayDate()) {
        clientErrors.date_of_birth = 'Date of birth must be before today'
      }
      if (mobileNumber && !/^(?:09\d{9}|\+639\d{9})$/.test(mobileNumber.replace(/\s+/g, ''))) {
        clientErrors.mobile_number = 'Enter a Philippine mobile number in 09XXXXXXXXX or +639XXXXXXXXX format'
      }
      if (Object.keys(clientErrors).length) {
        setErrors(clientErrors)
        return
      }
      const emergencyName = formValue(form, 'emergency_contact_name')
      const emergencyNumber = formValue(form, 'emergency_contact_number')
      const allergyText = formValue(form, 'allergies')
      const allergies = allergyText.toUpperCase() === 'NKDA'
        ? []
        : allergyText.split(',').map((allergen) => allergen.trim()).filter((allergen) => allergen && allergen.toUpperCase() !== 'NKDA')
      const medicationName = formValue(form, 'medication_name')
      const activeMedications = medicationName ? [{
        medication_name: medicationName,
        strength: formValue(form, 'medication_strength') || null,
        dose: formValue(form, 'medication_dose'),
        route: formValue(form, 'medication_route'),
        frequency: formValue(form, 'medication_frequency'),
        start_date: formValue(form, 'medication_start_date') || null,
      }] : []
      const patient = await apiRequest<{ data: { hospital_id: string } }>('/api/patients', {
        method: 'POST',
        body: {
          first_name: formValue(form, 'first_name'),
          middle_name: formValue(form, 'middle_name') || null,
          last_name: formValue(form, 'last_name'),
          personal_id: formValue(form, 'personal_id') || null,
          date_of_birth: dateOfBirth,
          sex: formValue(form, 'sex'),
          race_ethnicity: formValue(form, 'race_ethnicity') || 'Not stated',
          mobile_number: formValue(form, 'mobile_number') || null,
          street_barangay: formValue(form, 'street_barangay'),
          city_municipality: formValue(form, 'city_municipality'),
          province: formValue(form, 'province'),
          zip_code: formValue(form, 'zip_code') || null,
          emergency_contact: emergencyName || emergencyNumber ? {
            contact_name: emergencyName,
            contact_number: emergencyNumber,
            relationship_to_patient: formValue(form, 'relationship_to_patient') || null,
          } : null,
          allergies: allergies.map((allergen) => ({ allergen })),
          active_problems: form.getAll('active_problem_ids').map((diagnosis_id) => ({ diagnosis_id: String(diagnosis_id) })),
          active_medications: activeMedications,
        },
      })
      toast.success(`Patient registered. Hospital ID: ${patient.data.hospital_id}`)
      formElement.reset()
    } catch (reason) {
      setError(errorMessage(reason))
      setErrors(fieldErrors(reason))
    } finally {
      setLoading(false)
    }
  }

  return <>
    <PageTitle title="Register a New Patient" subtitle="Create a permanent hospital record. The hospital ID is assigned automatically."/>
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-6"><h2 className="mb-5 border-b border-slate-200 pb-4 text-lg font-bold">Personal identification</h2><div className="grid gap-5 md:grid-cols-2">
        <Field name="first_name" label="First name" required error={fieldError(errors, 'first_name')}/>
        <Field name="middle_name" label="Middle name" error={fieldError(errors, 'middle_name')}/>
        <Field name="last_name" label="Last name" required error={fieldError(errors, 'last_name')}/>
        <Field name="personal_id" label="PhilHealth number / personal ID" error={fieldError(errors, 'personal_id')}/>
        <Field name="date_of_birth" label="Date of birth" required type="date" error={fieldError(errors, 'date_of_birth')}/>
        <Select name="sex" label="Sex" required error={fieldError(errors, 'sex')}><option value="">Select sex</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Not stated</option></Select>
        <Field name="race_ethnicity" label="Race / ethnicity" defaultValue="Filipino" error={fieldError(errors, 'race_ethnicity')}/>
        <Field name="mobile_number" label="Mobile number" placeholder="+63 9XX XXX XXXX" error={fieldError(errors, 'mobile_number')}/>
      </div></Card>
      <Card className="p-6"><h2 className="mb-5 border-b border-slate-200 pb-4 text-lg font-bold">Residence and contact</h2><div className="grid gap-5 md:grid-cols-2">
        <Field name="street_barangay" label="Street / barangay" required error={fieldError(errors, 'street_barangay')}/>
        <Field name="city_municipality" label="City / municipality" required error={fieldError(errors, 'city_municipality')}/>
        <Field name="province" label="Province" required error={fieldError(errors, 'province')}/>
        <Field name="zip_code" label="ZIP code" error={fieldError(errors, 'zip_code')}/>
        <Field name="emergency_contact_name" label="Emergency contact name" error={fieldError(errors, 'emergency_contact')}/>
        <Field name="emergency_contact_number" label="Emergency contact number" error={fieldError(errors, 'emergency_contact')}/>
        <Field name="relationship_to_patient" label="Relationship" error={fieldError(errors, 'emergency_contact')}/>
      </div></Card>
      <Card className="p-6"><h2 className="mb-2 text-lg font-bold">Clinical alerts</h2><p className="mb-5 text-sm text-slate-500">Allergies are comma-separated. Select active problems from the diagnosis reference list.</p><div className="grid gap-5 md:grid-cols-2">
        <Field name="allergies" label="Known allergies / intolerances" help="Enter NKDA only when the patient has no known allergy." error={fieldError(errors, 'allergies')}/>
        {referenceError && <p role="alert" className="text-sm text-red-800">{referenceError}</p>}
        <MultiSelect name="active_problem_ids" label="Active problem list">{diagnoses.map((diagnosis) => <option key={diagnosis.diagnosis_id} value={diagnosis.diagnosis_id}>{diagnosis.diagnosis_code} — {diagnosis.diagnosis_name}</option>)}</MultiSelect>
        {fieldError(errors, 'active_problems') && <p role="alert" className="text-sm text-red-700">{fieldError(errors, 'active_problems')}</p>}
      </div><div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field name="medication_name" label="Active medication name" error={fieldError(errors, 'active_medications.0.medication_name')}/>
        <Field name="medication_strength" label="Medication strength" error={fieldError(errors, 'active_medications.0.strength')}/>
        <Field name="medication_dose" label="Medication dose" error={fieldError(errors, 'active_medications.0.dose')}/>
        <Field name="medication_route" label="Medication route" error={fieldError(errors, 'active_medications.0.route')}/>
        <Field name="medication_frequency" label="Medication frequency" error={fieldError(errors, 'active_medications.0.frequency')}/>
        <Field name="medication_start_date" label="Medication start date" type="date" error={fieldError(errors, 'active_medications.0.start_date')}/>
      </div></Card>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => go('patients')}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Register patient'}</Button></div>
    </form>
  </>
}

export function AdmissionForm({ go }: NavigationProps) {
  const toast = useToast()
  const [patients, setPatients] = useState<PatientOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [payments, setPayments] = useState<NamedOption[]>([])
  const [diagnoses, setDiagnoses] = useState<ReferenceDiagnosis[]>([])
  const [procedures, setProcedures] = useState<ProcedureOption[]>([])
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest<ListResponse<PatientOption>>('/api/patients?limit=100'),
      apiRequest<ListResponse<StaffOption>>('/api/reference/staff?staff_type=physician&limit=100'),
      apiRequest<ListResponse<NamedOption>>('/api/reference/payment-sources?limit=100'),
      apiRequest<ListResponse<ReferenceDiagnosis>>('/api/reference/diagnoses?limit=100'),
      apiRequest<ListResponse<ProcedureOption>>('/api/reference/procedures?limit=100'),
    ]).then(([patientsResult, staffResult, paymentsResult, diagnosesResult, proceduresResult]) => {
      if (!active) return
      setPatients(patientsResult.data)
      setStaff(staffResult.data)
      setPayments(paymentsResult.data)
      setDiagnoses(diagnosesResult.data)
      setProcedures(proceduresResult.data)
    }).catch((reason: unknown) => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setErrors({})
    const form = new FormData(event.currentTarget)
    const missing = requiredErrors(form, ['patient_id', 'encounter_type', 'admission_type', 'admission_datetime', 'attending_staff_id', 'payment_source_id', 'principal_diagnosis_id'])
    if (Object.keys(missing).length) {
      setErrors(missing)
      return
    }
    setLoading(true)
    try {
      const response = await apiRequest<{ data: { admission_id: number; encounter_number: string } }>('/api/admissions', {
        method: 'POST',
        body: {
          patient_id: formValue(form, 'patient_id'),
          encounter_type: formValue(form, 'encounter_type'),
          admission_type: formValue(form, 'admission_type'),
          admission_datetime: formValue(form, 'admission_datetime'),
          attending_staff_id: formValue(form, 'attending_staff_id'),
          payment_source_id: formValue(form, 'payment_source_id'),
          principal_diagnosis_id: formValue(form, 'principal_diagnosis_id'),
          room: formValue(form, 'room') || null,
          other_diagnosis_ids: form.getAll('other_diagnosis_ids').map(String),
          procedure_ids: form.getAll('procedure_ids').map(String),
        },
      })
      toast.success(`Encounter ${response.data.encounter_number} created.`)
      go('patients')
    } catch (reason) {
      setError(errorMessage(reason))
      setErrors(fieldErrors(reason))
    } finally {
      setLoading(false)
    }
  }

  return <>
    <PageTitle title="New Admission / Encounter" subtitle="The encounter number is assigned automatically."/>
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-6"><h2 className="mb-5 border-b border-slate-200 pb-4 text-lg font-bold">Patient and encounter</h2><div className="grid gap-5 md:grid-cols-2">
        <Select name="patient_id" label="Patient" required error={fieldError(errors, 'patient_id')}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.hospital_id} — {patient.first_name} {patient.middle_name ? `${patient.middle_name} ` : ''}{patient.last_name}</option>)}</Select>
        <Select name="encounter_type" label="Encounter type" required error={fieldError(errors, 'encounter_type')}><option value="">Select type</option><option value="inpatient">Inpatient</option><option value="outpatient">Outpatient</option><option value="emergency">Emergency</option></Select>
        <Field name="admission_datetime" label="Admission date and time" required type="datetime-local" error={fieldError(errors, 'admission_datetime')}/>
        <Select name="admission_type" label="Type of admission" required error={fieldError(errors, 'admission_type')}><option value="">Select type</option><option value="scheduled">Scheduled</option><option value="unscheduled_emergency">Unscheduled / Emergency</option></Select>
        <Select name="attending_staff_id" label="Attending physician" required error={fieldError(errors, 'attending_staff_id')}><option value="">Select physician</option>{staff.map((member) => <option key={member.staff_id} value={member.staff_id}>{[member.credentials, member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ')}</option>)}</Select>
        <Select name="payment_source_id" label="Expected source of payment" required error={fieldError(errors, 'payment_source_id')}><option value="">Select payment source</option>{payments.map((payment) => <option key={payment.payment_source_id} value={payment.payment_source_id}>{payment.source_name}</option>)}</Select>
        <Field name="room" label="Room" error={fieldError(errors, 'room')}/>
      </div></Card>
      <Card className="p-6"><h2 className="mb-5 border-b border-slate-200 pb-4 text-lg font-bold">Clinical details</h2><div className="grid gap-5 md:grid-cols-2">
        <Select name="principal_diagnosis_id" label="Principal diagnosis" required error={fieldError(errors, 'principal_diagnosis_id')}><option value="">Select diagnosis</option>{diagnoses.map((diagnosis) => <option key={diagnosis.diagnosis_id} value={diagnosis.diagnosis_id}>{diagnosis.diagnosis_code} — {diagnosis.diagnosis_name}</option>)}</Select>
        <MultiSelect name="other_diagnosis_ids" label="Other diagnoses">{diagnoses.map((diagnosis) => <option key={diagnosis.diagnosis_id} value={diagnosis.diagnosis_id}>{diagnosis.diagnosis_code} — {diagnosis.diagnosis_name}</option>)}</MultiSelect>
        <MultiSelect name="procedure_ids" label="Significant procedures">{procedures.map((procedure) => <option key={procedure.procedure_id} value={procedure.procedure_id}>{procedure.procedure_code} — {procedure.procedure_name}</option>)}</MultiSelect>
        {fieldError(errors, 'other_diagnosis_ids') && <p role="alert" className="text-sm text-red-700">{fieldError(errors, 'other_diagnosis_ids')}</p>}
        {fieldError(errors, 'procedure_ids') && <p role="alert" className="text-sm text-red-700">{fieldError(errors, 'procedure_ids')}</p>}
      </div></Card>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => go('patients')}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Create admission'}</Button></div>
    </form>
  </>
}

export function DischargeForm({ go }: NavigationProps) {
  const toast = useToast()
  const [admissions, setAdmissions] = useState<Array<{ admission_id: number; encounter_number: string; patient_name: string; hospital_id: string }>>([])
  const [dispositions, setDispositions] = useState<NamedOption[]>([])
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)
  useEffect(() => {
    let active = true
    setLoadingOptions(true)
    Promise.allSettled([
      apiRequest<ListResponse<{ admission_id: number; encounter_number: string; patient_name: string; hospital_id: string }>>('/api/admissions?status=in_progress&limit=100'),
      apiRequest<ListResponse<NamedOption>>('/api/reference/dispositions?limit=100'),
    ]).then(([encountersResult, dispositionsResult]) => {
      if (!active) return
      if (encountersResult.status === 'fulfilled') setAdmissions(encountersResult.value.data)
      else setError(errorMessage(encountersResult.reason))
      if (dispositionsResult.status === 'fulfilled') setDispositions(dispositionsResult.value.data)
      else setError(errorMessage(dispositionsResult.reason))
    }).finally(() => { if (active) setLoadingOptions(false) })
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setErrors({})
    const form = new FormData(event.currentTarget)
    const missing = requiredErrors(form, ['admission_id', 'discharge_datetime', 'disposition_id', 'total_charges'])
    if (Object.keys(missing).length) {
      setErrors(missing)
      return
    }
    setLoading(true)
    try {
      const admissionId = formValue(form, 'admission_id')
      await apiRequest(`/api/admissions/${admissionId}/discharge`, {
        method: 'POST',
        body: {
          discharge_datetime: formValue(form, 'discharge_datetime'),
          total_charges: Number(formValue(form, 'total_charges')),
          disposition_id: formValue(form, 'disposition_id'),
        },
      })
      toast.success('Patient discharged and added to the retention review queue.')
      go('patients')
    } catch (reason) {
      setError(errorMessage(reason))
      setErrors(fieldErrors(reason))
    } finally {
      setLoading(false)
    }
  }

  return <>
    <PageTitle title="Discharge Patient" subtitle="Discharge an in-progress encounter. Completing discharge creates its retention record."/>
    <form onSubmit={submit} className="space-y-5"><Card className="p-6"><h2 className="mb-5 border-b border-slate-200 pb-4 text-lg font-bold">Discharge details</h2>{!loadingOptions && admissions.length === 0 && <p className="mb-4 text-sm text-slate-600">No patients are currently admitted</p>}{loadingOptions && <p role="status" className="mb-4 text-sm text-slate-600">Loading discharge options…</p>}<div className="grid gap-5 md:grid-cols-2">
      <Select name="admission_id" label="Patient / encounter" required error={fieldError(errors, 'admission_id')}><option value="">Select an in-progress encounter</option>{admissions.map((admission) => <option key={admission.admission_id} value={admission.admission_id}>{admission.patient_name} — {admission.hospital_id} ({admission.encounter_number})</option>)}</Select>
      <Field name="discharge_datetime" label="Discharge date and time" required type="datetime-local" error={fieldError(errors, 'discharge_datetime')}/>
      <Select name="disposition_id" label="Patient disposition" required error={fieldError(errors, 'disposition_id')}><option value="">Select disposition</option>{dispositions.map((item) => <option key={item.disposition_id} value={item.disposition_id}>{item.disposition_name}</option>)}</Select>
      <Field name="total_charges" label="Total charges (PHP)" required type="number" step="any" placeholder="0.00" error={fieldError(errors, 'total_charges')}/>
    </div></Card>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => go('patients')}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Complete discharge'}</Button></div>
    </form>
  </>
}

type PatientListItem = PatientOption & {
  date_of_birth: string
  sex: string
  display_status: 'registered' | 'admitted' | 'outpatient' | 'discharged'
  room: string | null
  last_visit: string | null
  address: string | null
}

type PatientSummary = {
  patient_id: number; hospital_id: string; first_name: string; middle_name: string | null; last_name: string
  personal_id: string | null; date_of_birth: string; sex: string; race_ethnicity: string; mobile_number: string | null
  record_status: string; created_at: string
  current_address: { street_barangay: string; city_municipality: string; province: string; zip_code: string | null } | null
  emergency_contacts: Array<{ contact_name: string; contact_number: string; relationship_to_patient: string | null }>
  encounters: Array<Record<string, unknown>>
  diagnoses: Array<Record<string, unknown>>
  procedures: Array<Record<string, unknown>>
  conditions: Array<Record<string, unknown>>
  allergies: Array<Record<string, unknown>>
  medications: { active: Array<Record<string, unknown>>; upcoming: Array<Record<string, unknown>>; past: Array<Record<string, unknown>> }
  latest_vitals: Record<string, unknown> | null
  recent_vitals: Array<Record<string, unknown>>
}

const PATIENT_PAGE_SIZE = 10
const VITALS_PAGE_SIZE = 10
const DEMO_VITAL_THRESHOLDS = {
  temperature_c: { min: 35, max: 38, label: 'Temperature', unit: '°C' },
  systolic_bp: { min: 90, max: 140, label: 'Systolic blood pressure', unit: 'mmHg' },
  diastolic_bp: { min: 60, max: 90, label: 'Diastolic blood pressure', unit: 'mmHg' },
  pulse_bpm: { min: 60, max: 100, label: 'Pulse', unit: 'bpm' },
  respiratory_rate: { min: 12, max: 20, label: 'Respiratory rate', unit: '/min' },
  spo2_percent: { min: 95, max: 100, label: 'Oxygen saturation', unit: '%' },
  weight_kg: { min: 0.1, max: 500, label: 'Weight', unit: 'kg' },
  height_cm: { min: 20, max: 250, label: 'Height', unit: 'cm' },
} as const

export function PatientList({ go, canRegister }: NavigationProps & { canRegister: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), limit: String(PATIENT_PAGE_SIZE) })
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)
    apiRequest<ListResponse<PatientListItem>>(`/api/patients?${params.toString()}`)
      .then((result) => {
        if (!active) return
        setPatients(result.data)
        setTotal(result.pagination.total)
      })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, search, status])

  const statuses = [
    { value: '', label: 'All' },
    { value: 'registered', label: 'Registered' },
    { value: 'admitted', label: 'Admitted' },
    { value: 'outpatient', label: 'Outpatient' },
    { value: 'discharged', label: 'Discharged' },
  ]

  return <>
    <PageTitle title="Patient Records" subtitle="Search patient records by name or hospital ID." action={canRegister ? <Button onClick={() => go('register')}>Register new patient</Button> : undefined}/>
    <Card>
      <div className="space-y-4 border-b border-slate-200 p-4">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} aria-label="Search patients" placeholder="Search name or hospital ID…" className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 focus:outline-none focus:ring-4 focus:ring-teal-100"/>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter patients by status">
          {statuses.map((item) => <button key={item.value} type="button" role="tab" aria-selected={status === item.value} onClick={() => { setStatus(item.value); setPage(1) }} className={`min-h-10 rounded-lg px-3.5 text-sm font-semibold ${status === item.value ? 'bg-teal-700 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{item.label}</button>)}
        </div>
      </div>
      {loading ? <p className="p-8 text-center text-sm text-slate-600" role="status">Loading patient records…</p>
        : error ? <p className="p-8 text-center text-sm text-red-800" role="alert">{error}</p>
          : patients.length === 0 ? <p className="p-8 text-center text-sm text-slate-600">No patient records found.</p>
            : <>
              <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>{['Patient', 'Hospital ID', 'Details', 'Status', 'Room', 'Last visit', 'Action'].map((heading) => <th key={heading} className="border-b border-slate-200 px-5 py-3.5 font-bold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
                {patients.map((patient) => <tr key={patient.patient_id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 font-semibold text-slate-950">{[patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ')}<span className="block text-xs font-normal text-slate-500">{patient.address || 'Address not recorded'}</span></td>
                  <td className="px-5 py-4 font-mono text-xs">{patient.hospital_id}</td>
                  <td className="px-5 py-4">{calculateAge(patient.date_of_birth)} yrs · {formatSex(patient.sex)}</td>
                  <td className="px-5 py-4"><StatusBadge status={patient.display_status}/></td>
                  <td className="px-5 py-4">{patient.room || '—'}</td>
                  <td className="px-5 py-4">{formatDate(patient.last_visit)}</td>
                  <td className="px-5 py-4"><Button variant="ghost" onClick={() => go('profile', String(patient.patient_id))}>View record</Button></td>
                </tr>)}
              </tbody></table></div>
              <Pagination page={page} limit={PATIENT_PAGE_SIZE} total={total} onPageChange={setPage}/>
            </>}
    </Card>
  </>
}

export function PatientProfile({ go, initialPatientId, role }: NavigationProps & { initialPatientId?: string; role: Role }) {
  const toast = useToast()
  const [patients, setPatients] = useState<PatientOption[]>([])
  const [selectedId, setSelectedId] = useState(initialPatientId || '')
  const [record, setRecord] = useState<PatientSummary | null>(null)
  const [tab, setTab] = useState('Summary')
  const [conditionStatus, setConditionStatus] = useState<'all' | 'active' | 'resolved'>('all')
  const [error, setError] = useState('')
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [vitalsPage, setVitalsPage] = useState(1)
  const [vitalsRows, setVitalsRows] = useState<Array<Record<string, unknown>>>([])
  const [vitalsTotal, setVitalsTotal] = useState(0)
  const [vitalsLoading, setVitalsLoading] = useState(false)
  const [vitalsError, setVitalsError] = useState('')
  const [vitalsSaveError, setVitalsSaveError] = useState('')
  const [vitalsFieldErrors, setVitalsFieldErrors] = useState<Record<string, string>>({})
  const [savingVitals, setSavingVitals] = useState(false)
  const canRecordVitals = role === 'Nurse' || role === 'Physician'
  const canCreateAdmission = role !== 'Nurse'
  const canDischarge = role !== 'Nurse'

  useEffect(() => { setSelectedId(initialPatientId || '') }, [initialPatientId])

  useEffect(() => {
    let active = true
    apiRequest<ListResponse<PatientOption>>('/api/patients?limit=100')
      .then((result) => { if (active) setPatients(result.data) })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setRecord(null)
      return
    }
    let active = true
    setLoadingRecord(true)
    apiRequest<{ data: PatientSummary }>(`/api/patients/${selectedId}`)
      .then((result) => { if (active) { setRecord(result.data); setError('') } })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)) })
      .finally(() => { if (active) setLoadingRecord(false) })
    return () => { active = false }
  }, [selectedId, refreshKey])

  useEffect(() => {
    if (!selectedId || tab !== 'Vitals') return
    let active = true
    setVitalsLoading(true)
    setVitalsError('')
    apiRequest<ListResponse<Record<string, unknown>>>(`/api/patients/${selectedId}/vitals?page=${vitalsPage}&limit=${VITALS_PAGE_SIZE}`)
      .then((result) => {
        if (!active) return
        setVitalsRows(result.data)
        setVitalsTotal(result.pagination.total)
      })
      .catch((reason: unknown) => { if (active) setVitalsError(errorMessage(reason)) })
      .finally(() => { if (active) setVitalsLoading(false) })
    return () => { active = false }
  }, [selectedId, tab, vitalsPage, refreshKey])

  const tabs = ['Summary', 'Vitals', 'Conditions', 'Medications', 'Allergies', 'Encounters']
  const fullName = record ? [record.first_name, record.middle_name, record.last_name].filter(Boolean).join(' ') : ''
  const latestEncounter = record?.encounters[0]
  const displayStatus = latestEncounter
    ? latestEncounter.encounter_type === 'outpatient' ? 'outpatient' : latestEncounter.status === 'in_progress' ? 'admitted' : 'discharged'
    : 'registered'
  const activeAllergies = record?.allergies.filter((allergy) => allergy.allergy_status === 'active') || []

  async function submitVitals(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault()
    setVitalsSaveError('')
    setVitalsFieldErrors({})
    const form = new FormData(event.currentTarget)
    const measurementFields = Object.keys(DEMO_VITAL_THRESHOLDS)
    const hasMeasurement = measurementFields.some((field) => formValue(form, field) !== '')
    if (!hasMeasurement) {
      setVitalsFieldErrors({ measurements: 'Enter at least one measurement' })
      return false
    }
    setSavingVitals(true)
    try {
      const body: Record<string, number> = {}
      for (const field of measurementFields) {
        const value = formValue(form, field)
        if (value) body[field] = Number(value)
      }
      await apiRequest(`/api/patients/${selectedId}/vitals`, { method: 'POST', body })
      setVitalsPage(1)
      toast.success('Vitals recorded successfully.')
      setRefreshKey((value) => value + 1)
      return true
    } catch (reason) {
      setVitalsSaveError(errorMessage(reason))
      setVitalsFieldErrors(fieldErrors(reason))
      return false
    } finally {
      setSavingVitals(false)
    }
  }

  return <>
    <PageTitle title="Patient Summary" subtitle="Select a patient to review their current health record."/>
    <div className="mb-5 max-w-xl">
      <Select label="Patient" value={selectedId} onChange={(value) => { setSelectedId(value); setVitalsPage(1); setTab('Summary') }}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.hospital_id} — {patient.first_name} {patient.last_name}</option>)}</Select>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loadingRecord && <p role="status" className="mb-4 text-sm text-slate-600">Loading patient summary…</p>}
    {!selectedId && <EmptyState message="Select a patient to view their summary."/>}
    {record && <>
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-2xl font-bold text-slate-950">{fullName}</h2><p className="mt-1 text-sm text-slate-600">{formatSex(record.sex)} · {calculateAge(record.date_of_birth)} years · DOB {formatDate(record.date_of_birth)} · <span className="font-mono">{record.hospital_id}</span></p><p className="mt-2"><StatusBadge status={displayStatus}/></p></div>
          <div className="flex gap-2">{canDischarge && <Button variant="secondary" onClick={() => go('discharge')}>Start discharge</Button>}{canCreateAdmission && <Button onClick={() => go('admission')}>New encounter</Button>}</div>
        </div>
        {activeAllergies.length > 0 ? <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Allergy alert:</strong> {activeAllergies.map((allergy) => String(allergy.allergen)).join(', ')}</div> : <p className="mt-4 text-sm text-slate-600">No active allergy alerts recorded.</p>}
      </Card>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Patient summary sections">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === item ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{item}</button>)}</div>
      {tab === 'Summary' && <div className="space-y-5">
        <Card className="space-y-6 p-6">
          <h3 className="text-lg font-bold">Patient details</h3>
          <section><h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Demographics</h4><dl className="grid gap-4 sm:grid-cols-2">
            <ProfileValue label="Full name" value={fullName}/><ProfileValue label="Sex" value={formatSex(record.sex)}/><ProfileValue label="Age" value={`${calculateAge(record.date_of_birth)} years`}/><ProfileValue label="Date of birth" value={formatDate(record.date_of_birth)}/><ProfileValue label="Hospital ID" value={record.hospital_id}/><ProfileValue label="PhilHealth / personal ID" value={record.personal_id || '—'}/><ProfileValue label="Race / ethnicity" value={humanize(record.race_ethnicity)}/>
          </dl></section>
          <section><h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Contact</h4><dl className="grid gap-4 sm:grid-cols-2">
            <ProfileValue label="Mobile number" value={record.mobile_number || '—'}/><ProfileValue label="Address" value={record.current_address ? [record.current_address.street_barangay, record.current_address.city_municipality, record.current_address.province, record.current_address.zip_code].filter(Boolean).join(', ') : '—'}/>
          </dl></section>
          <section><h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Emergency contact</h4>{record.emergency_contacts.length ? <dl className="grid gap-4 sm:grid-cols-2">{record.emergency_contacts.map((contact, index) => <div key={index} className="contents"><ProfileValue label="Name" value={contact.contact_name}/><ProfileValue label="Relationship" value={contact.relationship_to_patient || '—'}/><ProfileValue label="Number" value={contact.contact_number}/></div>)}</dl> : <EmptyState message="No emergency contact recorded."/>}</section>
          <section><h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Record</h4><dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-bold uppercase text-slate-500">Status</dt><dd className="mt-1"><StatusBadge status={record.record_status}/></dd></div><ProfileValue label="Registered on" value={formatDateTime(record.created_at)}/>
          </dl></section>
        </Card>
        <LatestVitals vitals={record.latest_vitals}/>
        <Card className="p-6"><h3 className="font-bold">Active conditions</h3><RecordTable records={record.conditions.filter((condition) => !condition.resolved_at)} kind="conditions" emptyMessage="No active conditions recorded."/></Card>
      </div>}
      {tab === 'Vitals' && <div className="space-y-5">
        <LatestVitals vitals={record.latest_vitals}/>
        {canRecordVitals && <VitalsForm onSubmit={submitVitals} saving={savingVitals} error={vitalsSaveError} errors={vitalsFieldErrors}/>}
        <Card><div className="p-5"><h3 className="mb-4 font-bold">Vitals history</h3>{vitalsLoading ? <p className="mt-3 text-sm text-slate-600">Loading vitals…</p> : vitalsError ? <p role="alert" className="mt-3 text-sm text-red-800">{vitalsError}</p> : vitalsRows.length ? <VitalsHistoryTable records={vitalsRows.map(withBmi)}/> : <EmptyState message="No vitals recorded yet."/>}</div>{!vitalsLoading && !vitalsError && <Pagination page={vitalsPage} limit={VITALS_PAGE_SIZE} total={vitalsTotal} onPageChange={setVitalsPage}/>}</Card>
      </div>}
      {tab === 'Conditions' && <Card className="p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Conditions</h3><div className="flex gap-2" aria-label="Filter conditions">{(['all', 'active', 'resolved'] as const).map((value) => <button key={value} type="button" aria-pressed={conditionStatus === value} onClick={() => setConditionStatus(value)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${conditionStatus === value ? 'bg-teal-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{humanize(value)}</button>)}</div></div><RecordTable records={record.conditions.filter((condition) => conditionStatus === 'all' || condition.condition_status === conditionStatus)} kind="conditions" emptyMessage={conditionStatus === 'all' ? 'No conditions recorded.' : `No ${conditionStatus} conditions recorded.`}/></Card>}
      {tab === 'Medications' && <div className="space-y-5">{(['active', 'upcoming', 'past'] as const).map((group) => <Card key={group} className="p-6"><h3 className="mb-3 font-bold">{humanize(group)} medications</h3><RecordTable records={record.medications[group]} kind="medications" emptyMessage={`No ${group} medications recorded.`}/></Card>)}</div>}
      {tab === 'Allergies' && <Card className="p-6"><h3 className="mb-3 font-bold">Allergies</h3><RecordTable records={record.allergies} kind="allergies" emptyMessage="No allergies recorded."/></Card>}
      {tab === 'Encounters' && <Card className="p-6"><h3 className="mb-3 font-bold">Encounters</h3><RecordTable records={record.encounters} kind="encounters" emptyMessage="No encounters recorded."/></Card>}
    </>}
  </>
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">{message}</p>
}

function LatestVitals({ vitals }: { vitals: Record<string, unknown> | null }) {
  if (!vitals) return <Card className="p-6"><h3 className="mb-3 font-bold">Latest vitals</h3><EmptyState message="No vitals recorded yet."/></Card>
  const display = withBmi(vitals)
  const measurements = [
    ['Temperature', display.temperature_c, '°C'],
    ['Blood pressure', display.systolic_bp && display.diastolic_bp ? `${display.systolic_bp}/${display.diastolic_bp}` : null, 'mmHg'],
    ['Pulse', display.pulse_bpm, 'bpm'],
    ['Respiratory rate', display.respiratory_rate, '/min'],
    ['SpO₂', display.spo2_percent, '%'],
    ['Weight', display.weight_kg, 'kg'],
    ['Height', display.height_cm, 'cm'],
    ['BMI (calculated)', display.bmi, ''],
  ]
  return <Card className="p-6"><h3 className="mb-1 font-bold">Latest vitals</h3><p className="mb-4 text-xs text-slate-500">{formatDateTime(vitals.recorded_at)}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{measurements.map(([label, value, unit]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{String(label)}</p><p className="mt-1 text-lg font-bold text-slate-950">{value == null ? '—' : `${String(value)}${unit ? ` ${String(unit)}` : ''}`}</p></div>)}</div></Card>
}

function VitalsForm({ onSubmit, saving, error, errors }: { onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>; saving: boolean; error: string; errors: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const fields = [
    { key: 'temperature_c', label: 'Temperature (°C)' },
    { key: 'systolic_bp', label: 'Systolic BP (mmHg)' },
    { key: 'diastolic_bp', label: 'Diastolic BP (mmHg)' },
    { key: 'pulse_bpm', label: 'Pulse (bpm)' },
    { key: 'respiratory_rate', label: 'Respiratory rate (/min)' },
    { key: 'spo2_percent', label: 'SpO₂ (%)' },
    { key: 'weight_kg', label: 'Weight (kg)' },
    { key: 'height_cm', label: 'Height (cm)' },
  ]
  return <Card className="p-6"><h3 className="font-bold">Record vitals</h3><p className="mt-1 text-xs text-slate-600">At least one measurement is required. Demo ranges are visual prompts, not clinical guidance; database validation uses plausible measurement bounds.</p>
    <form onSubmit={async (event) => { if (await onSubmit(event)) setValues({}) }} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => {
        const numeric = Number(values[field.key])
        const threshold = DEMO_VITAL_THRESHOLDS[field.key as keyof typeof DEMO_VITAL_THRESHOLDS]
        const outsideDemoRange = threshold && values[field.key] !== '' && values[field.key] !== undefined && (numeric < threshold.min || numeric > threshold.max)
        const validationError = fieldError(errors, field.key)
        return <div key={field.key}>
          <Field name={field.key} label={field.label} type="number" step="any" value={values[field.key] || ''} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} error={validationError}/>
          {outsideDemoRange && <p className="mt-1 text-xs font-semibold text-amber-900">{threshold.label} is outside the demo range ({threshold.min}–{threshold.max} {threshold.unit}).</p>}
        </div>
      })}</div>
      {errors.measurements && <p role="alert" className="text-sm text-red-700">{errors.measurements}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Record vitals'}</Button></div>
    </form>
  </Card>
}

type RecordTableKind = 'conditions' | 'medications' | 'allergies' | 'encounters'

function RecordTable({ records, kind, emptyMessage }: { records: Array<Record<string, unknown>>; kind: RecordTableKind; emptyMessage: string }) {
  if (!records.length) return <EmptyState message={emptyMessage}/>
  if (kind === 'conditions') return <Table headers={['Condition','ICD-10 code','Recorded on','Status','Notes']}>{records.map((record, index) => <tr key={String(record.patient_problem_id ?? index)}>
    <td className="px-4 py-3 font-semibold">{String(record.diagnosis_name ?? '—')}</td>
    <td className="px-4 py-3">{String(record.diagnosis_code ?? '—')}</td>
    <td className="px-4 py-3">{formatDateTime(record.recorded_at)}</td>
    <td className="px-4 py-3"><StatusBadge status={String(record.condition_status ?? (record.resolved_at ? 'resolved' : 'active'))}/></td>
    <td className="px-4 py-3">{String(record.notes ?? '—')}</td>
  </tr>)}</Table>
  if (kind === 'medications') return <Table headers={['Medication','Strength','Dose','Route','Frequency','Start date','Status']}>{records.map((record, index) => <tr key={String(record.patient_medication_id ?? index)}>
    <td className="px-4 py-3 font-semibold">{String(record.medication_name ?? '—')}</td><td className="px-4 py-3">{String(record.strength ?? '—')}</td>
    <td className="px-4 py-3">{String(record.dose ?? '—')}</td><td className="px-4 py-3">{humanize(record.route)}</td><td className="px-4 py-3">{String(record.frequency ?? '—')}</td>
    <td className="px-4 py-3">{formatDate(record.start_date)}</td><td className="px-4 py-3"><StatusBadge status={String(record.medication_status ?? record.medication_group ?? '—')}/></td>
  </tr>)}</Table>
  if (kind === 'allergies') return <Table headers={['Allergen','Reaction','Severity','Status','Recorded on']}>{records.map((record, index) => <tr key={String(record.allergy_id ?? index)}>
    <td className="px-4 py-3 font-semibold">{String(record.allergen ?? '—')}</td><td className="px-4 py-3">{String(record.reaction ?? '—')}</td>
    <td className="px-4 py-3"><StatusBadge status={String(record.severity ?? 'unknown')}/></td><td className="px-4 py-3"><StatusBadge status={String(record.allergy_status ?? 'active')}/></td>
    <td className="px-4 py-3">{formatDateTime(record.recorded_at)}</td>
  </tr>)}</Table>
  return <div className="overflow-x-auto"><Table headers={['Encounter no.','Type','Admission type','Admitted','Discharged','Attending physician','Payment source','Room','Total charges','Status','Disposition']}>{records.map((record, index) => <tr key={String(record.admission_id ?? index)}>
    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{String(record.encounter_number ?? '—')}</td><td className="px-4 py-3">{humanize(record.encounter_type)}</td>
    <td className="px-4 py-3">{humanize(record.admission_type)}</td><td className="whitespace-nowrap px-4 py-3">{formatDateTime(record.admission_datetime)}</td>
    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(record.discharge_datetime)}</td><td className="px-4 py-3">{String(record.attending_physician ?? '—')}</td>
    <td className="px-4 py-3">{String(record.payment_source ?? '—')}</td><td className="px-4 py-3">{String(record.room ?? '—')}</td>
    <td className="whitespace-nowrap px-4 py-3">{formatCurrency(record.total_charges)}</td><td className="px-4 py-3"><StatusBadge status={String(record.status ?? '')}/></td>
    <td className="px-4 py-3">{String(record.disposition_name ?? '—')}</td>
  </tr>)}</Table></div>
}

function VitalsHistoryTable({ records }: { records: Array<Record<string, unknown>> }) {
  return <div className="overflow-x-auto"><Table headers={['Recorded','Temperature (°C)','Systolic BP (mmHg)','Diastolic BP (mmHg)','Pulse (bpm)','Respiratory rate (/min)','SpO₂ (%)','Weight (kg)','Height (cm)','BMI']}>{records.map((record, index) => <tr key={String(record.vitals_id ?? index)}>
    <td className="whitespace-nowrap px-3 py-3">{formatDateTime(record.recorded_at)}</td>
    {['temperature_c','systolic_bp','diastolic_bp','pulse_bpm','respiratory_rate','spo2_percent','weight_kg','height_cm','bmi'].map((field) => <td key={field} className="px-3 py-3">{record[field] == null ? '—' : String(record[field])}</td>)}
  </tr>)}</Table></div>
}

function calculateAge(dateOfBirth: string) {
  const birth = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '—'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1
  return age
}

function formatSex(sex: string) {
  return ({ female: 'Female', male: 'Male', other: 'Other', unknown: 'Not stated' } as Record<string, string>)[sex] || humanize(sex)
}

function withBmi(vitals: Record<string, unknown>) {
  const weight = Number(vitals.weight_kg)
  const height = Number(vitals.height_cm) / 100
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return vitals
  return { ...vitals, bmi: (weight / (height * height)).toFixed(1) }
}
