# Alaga — Health Records Management System

Alaga supports health-record management, admissions, discharges, and privacy
workflows at Alaga Philippine Medical Center. This repository contains the
React + TypeScript frontend and the Node.js + Express + MySQL API.

## Backend API setup (Windows / XAMPP)

The backend is plain JavaScript (CommonJS), Express, and MySQL via `mysql2`.
Passwords use `bcryptjs`, which generates and verifies standard bcrypt hashes
without requiring a native Node build toolchain on Windows.
The Vite frontend runs separately and proxies `/api` requests to this backend.

### One-time setup

1. Install Node.js 18 or newer (which includes npm).
2. Start **Apache** (optional for API use) and **MySQL** in the XAMPP Control
   Panel.
3. Open phpMyAdmin at `http://localhost/phpmyadmin`.
4. For a new database, import `database/schema.sql`, then
   `database/seed.sql`, then `database/reference-data.sql`. The schema creates
   and selects `health_records_db`; import it into an empty database. The demo
   seed is not safe to rerun. Reference data uses `INSERT IGNORE` and is safe
   to re-import.
   For an existing database made from the previous schema, import
   `database/migrations/001_patient_vitals.sql` once. If its seed has not yet
   been loaded, import `database/seed.sql` next; otherwise do not re-import the
   seed. Finish with `database/reference-data.sql`. Skip the migration if the
   table already exists or if you imported the updated full schema.
6. Open PowerShell in the repository and run:

   ```powershell
   cd backend
   npm install
   ```

   `backend/.env` contains the local XAMPP defaults. If it is missing, copy the
   example and update `JWT_SECRET` with a private random secret of at least 32
   characters:

   ```powershell
   Copy-Item .env.example .env
   ```

   Settings are `DB_HOST=localhost`, `DB_USER=root`, `DB_PASSWORD=`,
   `DB_NAME=health_records_db`, `PORT=5000`, `JWT_SECRET`, and
   `CORS_ORIGIN=http://localhost:5173`. If you set a MySQL root password in
   XAMPP, update `DB_PASSWORD` in `backend/.env`.
7. After importing the seed, hash the demo password for every seeded account:

   ```powershell
   npm run set-demo-passwords
   ```

   The script sets `Demo@2026` and prints the seeded email/role list. Run it
   only after importing the seed data.
8. Start the API:

   ```powershell
   npm run dev
   ```

   For non-development use, run `npm start`. The API listens on
   `http://localhost:5000`.

Run the frontend from the repository root with `npm run dev`. Vite proxies
`/api` to `http://localhost:5000`, so it works on any Vite port.
`VITE_API_URL` remains an optional API base URL override. In non-production,
the API permits `http://localhost:<port>` and `http://127.0.0.1:<port>`.

### Endpoints and access

All successful responses use JSON. Errors use
`{ "error": { "code": "...", "message": "..." } }`.

| Method and path | Purpose | Access |
| --- | --- | --- |
| `GET /api/health` | Check API and MySQL connectivity | Public |
| `POST /api/auth/login` | Verify credentials, write login audit event, return JWT and user | Public; rate-limited |
| `GET /api/patients` | Search and paginate patients | Admin, Records Officer, Physician, Nurse |
| `GET /api/patients/:id` | Read demographics, encounters, conditions, allergies, medication groups, and recent vitals; audit the view | Admin, Records Officer, Physician, Nurse |
| `POST /api/patients` | Create a patient with an API-assigned ID, address, contact, allergies, conditions, and medications atomically | Admin, Records Officer |
| `GET /api/patients/:id/vitals` | Paginated vitals history; audit the view | Admin, Records Officer, Physician, Nurse |
| `POST /api/patients/:id/vitals` | Record validated vitals linked to the latest in-progress encounter | Nurse, Physician |
| `GET /api/dashboard/summary` | Dashboard totals and four latest audit events | Admin, Records Officer, Physician, Nurse |
| `GET /api/audit-logs` | Filtered, paginated audit history | Admin, Records Officer |
| `GET /api/audit-logs/actions` | Distinct action codes | Admin, Records Officer |
| `GET /api/retention-records` | Paginated retention queue | Admin |
| `POST /api/retention-records/:id/review` | Approve disposal or retain; records reviewer and audit event | Admin |
| `GET /api/data-dictionary` | Paginated data dictionary | Admin, Records Officer, Physician, Nurse |
| `GET /api/users` | Paginated account list; never returns password hashes | Admin |
| `POST /api/users` | Create staff and user account with a bcryptjs password hash | Admin |
| `PATCH /api/users/:id` | Change role/status or reset password | Admin |
| `GET /api/reference/staff` | Active staff dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/payment-sources` | Active payment-source dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/dispositions` | Active disposition dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/diagnoses` | Diagnosis dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/procedures` | Procedure dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/admissions?status=in_progress` | Paginated active encounters with patient name and hospital ID | Admin, Records Officer, Physician |
| `POST /api/admissions` | Create an encounter with an API-assigned number, diagnoses, procedures, and audit record | Admin, Records Officer, Physician |
| `POST /api/admissions/:id/discharge` | Discharge encounter and create its pending retention record | Admin, Records Officer, Physician |

`GET /api/patients` accepts optional `search`, `status`, `page`, and `limit`.
Search matches patient name or hospital ID. `status` is one of `registered`,
`admitted`, `outpatient`, or `discharged`, derived from the latest encounter.
Patients without encounters have status `registered`. List rows include
`display_status`, the latest encounter room, `last_visit` (the latest
`admission_datetime`), and `date_of_birth`.

`POST /api/patients` generates the next `HSC-YYYY-NNNNN` ID. Optional nested
fields are `emergency_contact: { contact_name, contact_number,
relationship_to_patient }`, `allergies: [{ allergen, reaction?, severity? }]`,
`active_problems: [{ diagnosis_id, notes? }]`, and
`active_medications: [{ medication_name, strength?, dose, route, frequency,
start_date?, end_date?, notes? }]`. The patient, address, and provided clinical
details are saved in one transaction and audited as `PATIENT_REGISTERED`.
`sex` accepts `female`, `male`, `other`, or `unknown`.

`POST /api/admissions` generates the next `ENC-YYYY-NNNNN` number. It accepts
`patient_id`, `encounter_type`, `admission_type`, `admission_datetime`,
`attending_staff_id`, `payment_source_id`, `principal_diagnosis_id`, optional
`room`, `other_diagnosis_ids` (array), and `procedure_ids` (array).
`admission_type` must be `scheduled` or `unscheduled_emergency`.
Discharge accepts only `discharge_datetime`, nonnegative `total_charges`, and
an active `disposition_id`. It adds a `pending_review` retention record:
outpatient encounters use the Outpatient category; inpatient/emergency
encounters use Adult inpatient.

Retention review decisions are `approve_for_disposal` and `retain`; the
persisted review statuses are `approved_for_disposal` and `retain`.

All paginated list endpoints return
`{ "data": [], "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }`,
matching the existing patient-list response. List endpoints accept `page` and
`limit`; the maximum `limit` is 100. The dashboard response includes summary
counts in `data` and uses pagination metadata for its four most recent audit
events.

### Testing with Windows PowerShell

```powershell
# Health check (no seed required; the schema must be imported and MySQL running)
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/health'

# Login (requires database/seed.sql and npm run set-demo-passwords)
$login = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/auth/login' `
  -ContentType 'application/json' `
  -Body (@{
    email = 'juan.perez@hsc.org.ph'
    password = 'Demo@2026'
  } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }

# Dashboard summary (no seed required; counts are zero until records exist)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/dashboard/summary' -Headers $headers

# Patients: search, status filter, and pagination (seed required for sample rows)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/patients?search=Santos&status=admitted&page=1&limit=10' `
  -Headers $headers

# Full patient record (patient ID 1 comes from database/seed.sql)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/patients/1' -Headers $headers

# Create a patient (ID assigned by the API; seed roles/users for login)
$testSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$patient = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/patients' `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    first_name = 'Sample'
    last_name = 'Patient'
    date_of_birth = '1990-01-15'
    sex = 'female'
    personal_id = "PH-EXAMPLE-$testSuffix"
    street_barangay = 'Barangay Sample'
    city_municipality = 'Quezon City'
    province = 'Metro Manila'
    emergency_contact = @{
      contact_name = 'Rosa Patient'
      contact_number = '+63 917 000 0000'
      relationship_to_patient = 'Sister'
    }
    allergies = @(@{ allergen = 'Penicillin'; reaction = 'Rash'; severity = 'mild' })
    active_problems = @(@{ diagnosis_id = 1; notes = 'Existing hypertension' })
    active_medications = @(@{
      medication_name = 'Amlodipine'; strength = '5 mg tablet'; dose = '5 mg'
      route = 'Oral'; frequency = 'Once daily'
    })
  } | ConvertTo-Json -Depth 5)

# Patient summary and paginated vitals history
Invoke-RestMethod -Method Get `
  -Uri "http://localhost:5000/api/patients/$($patient.data.patient_id)" -Headers $headers
Invoke-RestMethod -Method Get `
  -Uri "http://localhost:5000/api/patients/$($patient.data.patient_id)/vitals?page=1&limit=10" -Headers $headers

# Record vitals (Physician or Nurse token required; at least one measurement)
$nurseLogin = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/auth/login' `
  -ContentType 'application/json' `
  -Body (@{ email = 'ana.navarro@hsc.org.ph'; password = 'Demo@2026' } | ConvertTo-Json)
$nurseHeaders = @{ Authorization = "Bearer $($nurseLogin.token)" }
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:5000/api/patients/$($patient.data.patient_id)/vitals" `
  -Headers $nurseHeaders -ContentType 'application/json' `
  -Body (@{
    temperature_c = 36.8
    systolic_bp = 120
    diastolic_bp = 80
    pulse_bpm = 72
    respiratory_rate = 16
    spo2_percent = 98
    weight_kg = 64.5
    height_cm = 165.0
  } | ConvertTo-Json)

# Audit action codes and filters including general actor/patient/hospital ID search
# (Admin or Records Officer token required)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/audit-logs/actions' -Headers $headers
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/audit-logs?q=Santos&action=PATIENT_RECORD_VIEWED&dateFrom=2025-06-01&dateTo=2025-06-30&patient=1&user=3&page=1&limit=10' `
  -Headers $headers

# Retention queue and a review (Admin token required; retention ID 1 is seeded)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/retention-records?status=pending_review&page=1&limit=10' `
  -Headers $headers
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/retention-records/1/review' `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{ decision = 'retain' } | ConvertTo-Json)

# Data dictionary (requires schema; seeded rows are in database/seed.sql)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/data-dictionary?page=1&limit=10' -Headers $headers

# Users (Admin token required; password_hash is never returned)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/users?page=1&limit=10' -Headers $headers

# Create a staff user (Admin token; use a unique email and license number)
$newUser = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/users' `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    first_name = 'Lina'; last_name = 'Santos'
    email = "lina.$testSuffix@example.org"; role = 'Nurse'
    staff_type = 'nurse'; license_number = "RN-$testSuffix"
    initial_password = 'InitialPassword@2026'
  } | ConvertTo-Json)

# Change a role/status or reset password (Admin cannot deactivate their own account)
Invoke-RestMethod -Method Patch `
  -Uri "http://localhost:5000/api/users/$($newUser.data.user_id)" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{ account_status = 'active'; password = 'ResetPassword@2026' } | ConvertTo-Json)

# Dropdown/reference endpoints (seed reference rows before using these for forms)
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/staff?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/payment-sources?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/dispositions?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/diagnoses?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/procedures?page=1&limit=100' -Headers $headers

# Create an encounter and then discharge that same encounter.
# IDs 1 (patient), 3 (staff), 1 (payment source), and 1 (diagnosis)
# are supplied by database/seed.sql.
$now = Get-Date
$admissionTime = $now.AddHours(-2).ToString('yyyy-MM-ddTHH:mm')
$dischargeTime = $now.ToString('yyyy-MM-ddTHH:mm')
$admission = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/admissions' `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    patient_id = 1
    encounter_type = 'inpatient'
    admission_type = 'scheduled'
    admission_datetime = $admissionTime
    attending_staff_id = 3
    payment_source_id = 1
    principal_diagnosis_id = 1
    room = 'Ward 1A'
    other_diagnosis_ids = @(2, 3)
    procedure_ids = @(1, 2)
  } | ConvertTo-Json)

# Discharge queue (same endpoint used to select the encounter)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/admissions?status=in_progress&page=1&limit=10' -Headers $headers

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:5000/api/admissions/$($admission.data.admission_id)/discharge" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    discharge_datetime = $dischargeTime
    total_charges = 12500.00
    disposition_id = 1
  } | ConvertTo-Json)
```

Patient registration requires `first_name`, `last_name`, `date_of_birth`,
`sex`, `street_barangay`, `city_municipality`, and `province`; the server
generates its hospital ID. Admissions similarly generate the encounter number.
The seed is required for demo users, staff, patients, and payment/disposition
references. Import `database/reference-data.sql` for additional diagnoses and
procedures.

### Security and troubleshooting

- Do not commit `backend/.env` or use the demo password/JWT secret outside a
  local demonstration. Change the seeded demo passwords before deployment.
- The seed file has not been run automatically. All endpoints require MySQL
  running and the schema imported. Login, non-empty reference/dropdown data,
  demo users, admissions, and retention-review examples also require importing
  `database/seed.sql` after the schema and running `npm run set-demo-passwords`.
  If a seed import stopped partway and some tables already contain rows, do not
  blindly import it again; on a disposable school-project database, recreate
  the database from the schema and then import the full seed once.
- Login failure events are audited even for unknown email addresses. Patient
  list access logs one event per returned record; full-record views and patient
  creation are logged transactionally in `audit_logs`.
- SQL statements use bound parameters; raw database errors are logged on the
  server but are not returned to API clients.
