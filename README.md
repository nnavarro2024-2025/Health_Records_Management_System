# Health Records Management System

## Backend API setup (Windows / XAMPP)

The backend is plain JavaScript (CommonJS), Express, and MySQL via `mysql2`.
Passwords use `bcryptjs`, which generates and verifies standard bcrypt hashes
without requiring a native Node build toolchain on Windows.
The frontend is unchanged and continues to run separately on Vite.

### One-time setup

1. Install Node.js 18 or newer (which includes npm).
2. Start **Apache** (optional for API use) and **MySQL** in the XAMPP Control
   Panel.
3. Open phpMyAdmin at `http://localhost/phpmyadmin`.
4. Import `database/schema.sql` into phpMyAdmin. This creates and selects
   `health_records_db`. Import it into an empty database; it is not a migration
   or safe to rerun over existing tables.
5. Import `database/seed.sql` into phpMyAdmin once. This is a separate manual
   step and creates the demo roles, staff, users, and sample records. The seed
   is not idempotent; do not re-import it over rows that were already inserted.
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

Run the existing frontend separately from the repository root with `npm run dev`;
Vite normally listens on `http://localhost:5173`, which is the only
allowed browser origin by default.

### Endpoints and access

All successful responses use JSON. Errors use
`{ "error": { "code": "...", "message": "..." } }`.

| Method and path | Purpose | Access |
| --- | --- | --- |
| `GET /api/health` | Check API and MySQL connectivity | Public |
| `POST /api/auth/login` | Verify credentials, write login audit event, return JWT and user | Public; rate-limited |
| `GET /api/patients` | Search and paginate patients | Admin, Records Officer, Physician, Nurse |
| `GET /api/patients/:id` | Read a full patient record and write view audit event | Admin, Records Officer, Physician, Nurse |
| `POST /api/patients` | Create patient and address in one transaction; write audit event | Admin, Records Officer |
| `GET /api/dashboard/summary` | Dashboard totals and four latest audit events | Admin, Records Officer, Physician, Nurse |
| `GET /api/audit-logs` | Filtered, paginated audit history | Admin, Records Officer |
| `GET /api/retention-records` | Paginated retention queue | Admin |
| `POST /api/retention-records/:id/review` | Approve disposal or retain; records reviewer and audit event | Admin |
| `GET /api/data-dictionary` | Paginated data dictionary | Admin, Records Officer, Physician, Nurse |
| `GET /api/users` | Paginated account list; never returns password hashes | Admin |
| `GET /api/reference/staff` | Active staff dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/payment-sources` | Active payment-source dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/dispositions` | Active disposition dropdown values | Admin, Records Officer, Physician, Nurse |
| `GET /api/reference/diagnoses` | Diagnosis dropdown values | Admin, Records Officer, Physician, Nurse |
| `POST /api/admissions` | Create an encounter for an existing patient | Admin, Records Officer, Physician |
| `POST /api/admissions/:id/discharge` | Discharge an in-progress encounter | Admin, Records Officer, Physician |

`GET /api/patients` accepts optional `search`, `status`, `page`, and `limit`
query parameters. Search matches patient name or `hospital_id`. Status filters
use the latest encounter status, falling back to `patients.record_status`.
`limit` is capped at 100. Patient list responses include `latest_encounter_status`
and the latest encounter's `room`.

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
  -Uri 'http://localhost:5000/api/patients?search=Santos&status=in_progress&page=1&limit=10' `
  -Headers $headers

# Full patient record (patient ID 1 comes from database/seed.sql)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/patients/1' -Headers $headers

# Create a patient (requires seed roles/users so login is available)
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/patients' `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    hospital_id = "HSC-2026-$((Get-Date).ToString('yyyyMMddHHmmss'))"
    first_name = 'Sample'
    last_name = 'Patient'
    date_of_birth = '1990-01-15'
    sex = 'unknown'
    street_barangay = 'Barangay Sample'
    city_municipality = 'Quezon City'
    province = 'Metro Manila'
  } | ConvertTo-Json)

# Audit filters: action, inclusive date range, patient ID, and user ID
# (Admin or Records Officer token required)
Invoke-RestMethod -Method Get `
  -Uri 'http://localhost:5000/api/audit-logs?action=PATIENT_RECORD_VIEWED&dateFrom=2025-06-01&dateTo=2025-06-30&patient=1&user=3&page=1&limit=10' `
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

# Dropdown/reference endpoints (seed reference rows before using these for forms)
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/staff?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/payment-sources?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/dispositions?page=1&limit=100' -Headers $headers
Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/api/reference/diagnoses?page=1&limit=100' -Headers $headers

# Create an encounter and then discharge that same encounter.
# IDs 1 (patient), 3 (staff), 1 (payment source), and 1 (diagnosis)
# are supplied by database/seed.sql.
$now = Get-Date
$admissionTime = $now.AddHours(-2).ToString('yyyy-MM-ddTHH:mm')
$dischargeTime = $now.ToString('yyyy-MM-ddTHH:mm')
$encounterNumber = "ENC-TEST-$($now.ToString('yyyyMMddHHmmss'))"
$admission = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:5000/api/admissions' `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    encounter_number = $encounterNumber
    patient_id = 1
    encounter_type = 'inpatient'
    admission_type = 'scheduled'
    admission_datetime = $admissionTime
    attending_staff_id = 3
    payment_source_id = 1
    principal_diagnosis_id = 1
    room = 'Ward 1A'
  } | ConvertTo-Json)

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:5000/api/admissions/$($admission.data.admission_id)/discharge" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{
    discharge_datetime = $dischargeTime
    total_charges = 12500.00
    disposition_id = 1
  } | ConvertTo-Json)
```

The patient create request requires `hospital_id`, `first_name`, `last_name`,
`date_of_birth`, `sex`, `street_barangay`, `city_municipality`, and `province`.
The database enforces unique `hospital_id`; use a new value for each test.
Admission requests require `encounter_number`, existing `patient_id`,
`encounter_type`, `admission_type`, `admission_datetime`, `attending_staff_id`,
`payment_source_id`, and `principal_diagnosis_id`. A discharge must set its
date/time, non-negative `total_charges`, and active `disposition_id` together
with `status = discharged`, satisfying the schema's checks and triggers.

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
