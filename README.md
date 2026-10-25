# Health Records Management System

## Backend API setup (Windows / XAMPP)

The backend is plain JavaScript (CommonJS), Express, and MySQL via `mysql2`.
The frontend is unchanged and continues to run separately on Vite.

### One-time setup

1. Install Node.js 18 or newer (which includes npm).
2. Start **Apache** (optional for API use) and **MySQL** in the XAMPP Control
   Panel.
3. Open phpMyAdmin at `http://localhost/phpmyadmin`.
4. Import `database/schema.sql` into phpMyAdmin. This creates and selects
   `health_records_db`. Import it into an empty database; it is not a migration
   or safe to rerun over existing tables.
5. Import `database/seed.sql` into phpMyAdmin. This is a separate manual step
   and creates the demo roles, staff, users, and sample records.
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

`GET /api/patients` accepts optional `search`, `status`, `page`, and `limit`
query parameters. Search matches patient name or `hospital_id`. Status filters
use the latest encounter status, falling back to `patients.record_status`.
`limit` is capped at 100. Patient list responses include `latest_encounter_status`
and the latest encounter's `room`.

### Testing with curl.exe in PowerShell

Health check:

```powershell
curl.exe http://localhost:5000/api/health
```

Login (after running the password script; substitute an email from its output):

```powershell
$login = curl.exe -s -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  --data-raw '{"email":"juan.perez@hsc.org.ph","password":"Demo@2026"}' |
  ConvertFrom-Json
$token = $login.token
```

Search/list patients, retrieve a full record, and create a patient:

```powershell
curl.exe "http://localhost:5000/api/patients?search=Santos&page=1&limit=10" `
  -H "Authorization: Bearer $token"

curl.exe http://localhost:5000/api/patients/1 `
  -H "Authorization: Bearer $token"

curl.exe -X POST http://localhost:5000/api/patients `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  --data-raw '{"hospital_id":"HSC-2026-00001","first_name":"Sample","last_name":"Patient","date_of_birth":"1990-01-15","sex":"unknown","street_barangay":"Barangay Sample","city_municipality":"Quezon City","province":"Metro Manila"}'
```

The create request requires `hospital_id`, `first_name`, `last_name`,
`date_of_birth`, `sex`, `street_barangay`, `city_municipality`, and `province`.
The database enforces unique `hospital_id`; use a new value for each test.

### Security and troubleshooting

- Do not commit `backend/.env` or use the demo password/JWT secret outside a
  local demonstration. Change the seeded demo passwords before deployment.
- The seed file has not been run automatically. All database endpoints require
  MySQL running and the schema imported. Demo login and the password script
  additionally require the seed imported after the schema.
- Login failure events are audited even for unknown email addresses. Patient
  list access logs one event per returned record; full-record views and patient
  creation are logged transactionally in `audit_logs`.
- SQL statements use bound parameters; raw database errors are logged on the
  server but are not returned to API clients.
