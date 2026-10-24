export type Role = 'Admin' | 'Records Officer' | 'Physician' | 'Nurse'

export const patients = [
  { id: 'HSC-2025-00482', name: 'Maria Teresa Santos', age: 46, sex: 'Female', address: 'Quezon City, Metro Manila', status: 'Admitted', room: 'Ward 3A · 312', lastVisit: 'Jun 18, 2025' },
  { id: 'HSC-2025-00479', name: 'Jose Miguel Reyes', age: 63, sex: 'Male', address: 'Marikina City, Metro Manila', status: 'Discharged', room: '—', lastVisit: 'Jun 18, 2025' },
  { id: 'HSC-2025-00471', name: 'Angelica Dela Cruz', age: 29, sex: 'Female', address: 'Pasig City, Metro Manila', status: 'Outpatient', room: '—', lastVisit: 'Jun 17, 2025' },
  { id: 'HSC-2025-00462', name: 'Roberto Villanueva', age: 71, sex: 'Male', address: 'Cainta, Rizal', status: 'Admitted', room: 'ICU · 04', lastVisit: 'Jun 16, 2025' },
  { id: 'HSC-2025-00451', name: 'Lorna Bautista', age: 38, sex: 'Female', address: 'Mandaluyong City', status: 'Discharged', room: '—', lastVisit: 'Jun 14, 2025' },
]

export const activities = [
  { initials: 'AN', person: 'Ana Navarro, RN', action: 'updated medication list', record: 'Maria Teresa Santos', time: '10 minutes ago' },
  { initials: 'DR', person: 'Dr. Rafael Lim', action: 'completed discharge summary', record: 'Jose Miguel Reyes', time: '32 minutes ago' },
  { initials: 'MC', person: 'Mila Cruz', action: 'registered a new patient', record: 'Angelica Dela Cruz', time: '1 hour ago' },
  { initials: 'JP', person: 'Juan Perez', action: 'approved record correction', record: 'Roberto Villanueva', time: '2 hours ago' },
]

export const auditLogs = [
  { user: 'Dr. Rafael Lim', role: 'Physician', action: 'VIEWED', patient: 'Maria Teresa Santos', id: 'HSC-2025-00482', date: 'Jun 18, 2025 · 10:42 AM' },
  { user: 'Ana Navarro', role: 'Nurse', action: 'UPDATED', patient: 'Maria Teresa Santos', id: 'HSC-2025-00482', date: 'Jun 18, 2025 · 10:31 AM' },
  { user: 'Mila Cruz', role: 'Records Officer', action: 'CREATED', patient: 'Angelica Dela Cruz', id: 'HSC-2025-00471', date: 'Jun 18, 2025 · 9:56 AM' },
  { user: 'Juan Perez', role: 'Admin', action: 'EXPORTED', patient: 'Jose Miguel Reyes', id: 'HSC-2025-00479', date: 'Jun 18, 2025 · 9:20 AM' },
]

export const retentionRecords = [
  { id: 'HSC-2010-00129', patient: 'Carmen Flores', discharged: 'Mar 12, 2010', category: 'Adult inpatient', review: '15 years elapsed' },
  { id: 'HSC-2010-00094', patient: 'Eduardo Garcia', discharged: 'Feb 2, 2010', category: 'Adult inpatient', review: '15 years elapsed' },
  { id: 'HSC-2009-00831', patient: 'Renato Mendoza', discharged: 'Nov 8, 2009', category: 'Outpatient', review: 'Retention exceeded' },
]

export const dictionary = [
  ['hospital_id', 'Unique hospital-assigned patient identifier', 'VARCHAR', '20', 'patients'],
  ['date_of_birth', 'Patient date of birth', 'DATE', '10', 'patients'],
  ['sex', 'Administrative sex at registration', 'ENUM', '20', 'patients'],
  ['race_ethnicity', 'Self-reported race or ethnicity', 'VARCHAR', '80', 'patients'],
  ['admission_date', 'Date and time of inpatient admission', 'DATETIME', '19', 'admissions'],
  ['admission_type', 'Scheduled or unscheduled admission', 'ENUM', '20', 'admissions'],
  ['principal_diagnosis', 'Condition chiefly responsible for admission', 'VARCHAR', '255', 'diagnoses'],
  ['patient_disposition', 'Patient status or destination after discharge', 'VARCHAR', '100', 'discharges'],
  ['total_charges', 'Total charges for the hospital encounter', 'DECIMAL', '12,2', 'discharges'],
]

export const users = [
  { name: 'Juan Perez', email: 'juan.perez@hsc.org.ph', role: 'Admin', status: 'Active', last: 'Today, 8:12 AM' },
  { name: 'Mila Cruz', email: 'mila.cruz@hsc.org.ph', role: 'Records Officer', status: 'Active', last: 'Today, 9:56 AM' },
  { name: 'Dr. Rafael Lim', email: 'rafael.lim@hsc.org.ph', role: 'Physician', status: 'Active', last: 'Today, 10:42 AM' },
  { name: 'Ana Navarro, RN', email: 'ana.navarro@hsc.org.ph', role: 'Nurse', status: 'Active', last: 'Today, 10:31 AM' },
]
