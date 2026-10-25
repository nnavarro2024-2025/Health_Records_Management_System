import { useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../api'
import { Button, Card, Field, Select } from './ui'

export function UserCreateForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setError('')
    const form = new FormData(event.currentTarget)
    const required = ['first_name', 'last_name', 'email', 'role', 'initial_password']
    const missing = Object.fromEntries(required.filter((field) => !String(form.get(field) || '').trim()).map((field) => [field, 'This field is required']))
    const licenseNumber = String(form.get('license_number') || '').trim()
    if (['Physician', 'Nurse'].includes(String(form.get('role') || '')) && !licenseNumber) {
      missing.license_number = 'A license number is required for physicians and nurses'
    }
    if (Object.keys(missing).length) {
      setErrors(missing)
      return
    }

    setLoading(true)
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: Object.fromEntries([...form.entries()].filter(([key]) => key !== 'license_number' || String(form.get(key) || '').trim())),
      })
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The user could not be created.')
      if (reason instanceof ApiError && reason.fields) setErrors(reason.fields)
    } finally {
      setLoading(false)
    }
  }

  return <Card className="mb-5 p-6">
    <h2 className="mb-4 text-lg font-bold">Create user account</h2>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="first_name" label="First name" required error={errors.first_name}/>
        <Field name="middle_name" label="Middle name" error={errors.middle_name}/>
        <Field name="last_name" label="Last name" required error={errors.last_name}/>
        <Field name="credentials" label="Credentials" error={errors.credentials}/>
        <Field name="email" label="Email" type="email" required error={errors.email}/>
        <Select name="role" label="Role" required error={errors.role} value={role} onChange={setRole}><option value="">Select role</option><option>Admin</option><option>Records Officer</option><option>Physician</option><option>Nurse</option></Select>
        {(role === 'Physician' || role === 'Nurse') && <Field name="license_number" label="License number" required error={errors.license_number}/>}
        <Field name="initial_password" label="Initial password" type="password" required error={errors.initial_password}/>
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Create account'}</Button></div>
    </form>
  </Card>
}
