const express = require('express')
const { pool, withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')

const router = express.Router()
const patientRoles = ['Admin', 'Records Officer', 'Physician', 'Nurse']
const writablePatientRoles = ['Admin', 'Records Officer']
const allowedStatuses = new Set([
  'active',
  'inactive',
  'merged',
  'deceased',
  'in_progress',
  'discharged',
  'cancelled',
])

router.use(authenticate, authorize(...patientRoles))

router.get('/', async (request, response, next) => {
  try {
    const search = typeof request.query.search === 'string' ? request.query.search.trim() : ''
    const status = typeof request.query.status === 'string' ? request.query.status.trim() : ''
    const page = parsePositiveInteger(request.query.page, 1, 'page')
    const limit = parsePositiveInteger(request.query.limit, 20, 'limit')
    if (page > Math.floor(Number.MAX_SAFE_INTEGER / limit)) {
      throw new AppError(400, 'INVALID_PAGINATION', 'Requested page is too large')
    }

    if (search.length > 100) {
      throw new AppError(400, 'INVALID_SEARCH', 'Search must be 100 characters or fewer')
    }
    if (status && !allowedStatuses.has(status)) {
      throw new AppError(400, 'INVALID_STATUS', 'Status filter is not supported')
    }

    const searchPattern = `%${search}%`
    const offset = (page - 1) * limit

    const result = await withTransaction(async (connection) => {
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS total
         FROM patients AS p
         WHERE (? = ''
                OR CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) LIKE ?
                OR p.hospital_id LIKE ?)
           AND (? = '' OR COALESCE(
                (SELECT a.status
                 FROM admissions AS a
                 WHERE a.patient_id = p.patient_id
                 ORDER BY a.admission_datetime DESC, a.admission_id DESC
                 LIMIT 1),
                p.record_status
              ) = ?)`,
        [search, searchPattern, searchPattern, status, status],
      )

      const [patients] = await connection.execute(
        `SELECT p.patient_id, p.hospital_id, p.first_name, p.middle_name, p.last_name,
                p.date_of_birth, p.sex, p.record_status,
                (SELECT a.status
                 FROM admissions AS a
                 WHERE a.patient_id = p.patient_id
                 ORDER BY a.admission_datetime DESC, a.admission_id DESC
                 LIMIT 1) AS latest_encounter_status,
                COALESCE(
                  (SELECT a.status
                   FROM admissions AS a
                   WHERE a.patient_id = p.patient_id
                   ORDER BY a.admission_datetime DESC, a.admission_id DESC
                   LIMIT 1),
                  p.record_status
                ) AS status,
                (SELECT a.room
                 FROM admissions AS a
                 WHERE a.patient_id = p.patient_id
                 ORDER BY a.admission_datetime DESC, a.admission_id DESC
                 LIMIT 1) AS room,
                (SELECT a.admission_datetime
                 FROM admissions AS a
                 WHERE a.patient_id = p.patient_id
                 ORDER BY a.admission_datetime DESC, a.admission_id DESC
                 LIMIT 1) AS last_visit,
                CONCAT_WS(', ', address.city_municipality, address.province) AS address
         FROM patients AS p
         LEFT JOIN patient_addresses AS address
           ON address.patient_id = p.patient_id
          AND address.valid_to IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM patient_addresses AS newer_address
            WHERE newer_address.patient_id = address.patient_id
              AND newer_address.valid_to IS NULL
              AND (
                newer_address.valid_from > address.valid_from
                OR (
                  newer_address.valid_from = address.valid_from
                  AND newer_address.address_id > address.address_id
                )
              )
          )
         WHERE (? = ''
                OR CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) LIKE ?
                OR p.hospital_id LIKE ?)
           AND (? = '' OR COALESCE(
                (SELECT a.status
                 FROM admissions AS a
                 WHERE a.patient_id = p.patient_id
                 ORDER BY a.admission_datetime DESC, a.admission_id DESC
                 LIMIT 1),
                p.record_status
              ) = ?)
         ORDER BY p.last_name, p.first_name, p.patient_id
         LIMIT ? OFFSET ?`,
        [search, searchPattern, searchPattern, status, status, limit, offset],
      )

      for (const patient of patients) {
        await writeAudit(
          connection,
          request.user,
          patient.patient_id,
          'PATIENT_LIST_VIEWED',
          'Patient record appeared in a viewed patient list',
        )
      }

      return { patients, total: Number(countRows[0].total) }
    })

    return response.json({
      data: result.patients,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', async (request, response, next) => {
  try {
    const patientId = parseId(request.params.id)
    const record = await withTransaction(async (connection) => {
      const [patientRows] = await connection.execute(
        `SELECT patient_id, hospital_id, personal_id, first_name, middle_name, last_name,
                date_of_birth, sex, race_ethnicity, mobile_number, record_status,
                created_by_user_id, created_at, updated_at
         FROM patients
         WHERE patient_id = ?
         LIMIT 1`,
        [patientId],
      )

      if (patientRows.length === 0) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient record was not found')
      }

      const [
        [addressRows],
        [contacts],
        [encounters],
        [diagnoses],
        [procedures],
        [problems],
        [allergies],
        [medications],
      ] = await Promise.all([
        connection.execute(
          `SELECT address_id, street_barangay, city_municipality, province, zip_code, valid_from, valid_to
           FROM patient_addresses
           WHERE patient_id = ? AND valid_to IS NULL
           ORDER BY valid_from DESC, address_id DESC
           LIMIT 1`,
          [patientId],
        ),
        connection.execute(
          `SELECT emergency_contact_id, contact_name, contact_number, relationship_to_patient
           FROM patient_emergency_contacts
           WHERE patient_id = ?
           ORDER BY emergency_contact_id`,
          [patientId],
        ),
        connection.execute(
          `SELECT a.admission_id, a.encounter_number, a.encounter_type, a.admission_type,
                  a.admission_datetime, a.discharge_datetime, a.room, a.total_charges,
                  a.status, a.attending_staff_id, a.payment_source_id, a.principal_diagnosis_id,
                  a.disposition_id, ps.source_name AS payment_source,
                  d.disposition_name,
                  CONCAT_WS(' ', s.credentials, s.first_name, s.middle_name, s.last_name) AS attending_physician
           FROM admissions AS a
           INNER JOIN payment_sources AS ps ON ps.payment_source_id = a.payment_source_id
           INNER JOIN staff AS s ON s.staff_id = a.attending_staff_id
           LEFT JOIN dispositions AS d ON d.disposition_id = a.disposition_id
           WHERE a.patient_id = ?
           ORDER BY a.admission_datetime DESC, a.admission_id DESC`,
          [patientId],
        ),
        connection.execute(
          `SELECT a.admission_id, d.diagnosis_id, d.coding_system, d.diagnosis_code,
                  d.diagnosis_name, 'principal' AS diagnosis_type, 0 AS sequence_number
           FROM admissions AS a
           INNER JOIN diagnoses AS d ON d.diagnosis_id = a.principal_diagnosis_id
           WHERE a.patient_id = ?
           UNION ALL
           SELECT a.admission_id, d.diagnosis_id, d.coding_system, d.diagnosis_code,
                  d.diagnosis_name, 'other' AS diagnosis_type, ad.sequence_number
           FROM admissions AS a
           INNER JOIN admission_diagnoses AS ad ON ad.admission_id = a.admission_id
           INNER JOIN diagnoses AS d ON d.diagnosis_id = ad.diagnosis_id
           WHERE a.patient_id = ?
           ORDER BY admission_id, sequence_number, diagnosis_id`,
          [patientId, patientId],
        ),
        connection.execute(
          `SELECT a.admission_id, ap.procedure_id, pr.coding_system, pr.procedure_code,
                  pr.procedure_name, ap.performed_at, ap.notes
           FROM admissions AS a
           INNER JOIN admission_procedures AS ap ON ap.admission_id = a.admission_id
           INNER JOIN procedures AS pr ON pr.procedure_id = ap.procedure_id
           WHERE a.patient_id = ?
           ORDER BY ap.performed_at, pr.procedure_name`,
          [patientId],
        ),
        connection.execute(
          `SELECT pp.patient_problem_id, pp.diagnosis_id, d.coding_system, d.diagnosis_code,
                  d.diagnosis_name, pp.recorded_at, pp.resolved_at, pp.notes, pp.recorded_by_user_id
           FROM patient_problems AS pp
           INNER JOIN diagnoses AS d ON d.diagnosis_id = pp.diagnosis_id
           WHERE pp.patient_id = ?
           ORDER BY pp.recorded_at DESC, pp.patient_problem_id DESC`,
          [patientId],
        ),
        connection.execute(
          `SELECT allergy_id, allergen, reaction, severity, allergy_status, recorded_at, recorded_by_user_id
           FROM patient_allergies
           WHERE patient_id = ?
           ORDER BY recorded_at DESC, allergy_id DESC`,
          [patientId],
        ),
        connection.execute(
          `SELECT patient_medication_id, medication_name, strength, dose, route, frequency,
                  medication_status, start_date, end_date, notes, recorded_by_user_id, created_at
           FROM patient_medications
           WHERE patient_id = ?
           ORDER BY created_at DESC, patient_medication_id DESC`,
          [patientId],
        ),
      ])

      await writeAudit(
        connection,
        request.user,
        patientId,
        'PATIENT_RECORD_VIEWED',
        'Viewed full patient record',
      )

      return {
        ...patientRows[0],
        current_address: addressRows[0] || null,
        emergency_contacts: contacts,
        encounters,
        diagnoses,
        procedures,
        problems,
        allergies,
        medications,
      }
    })

    return response.json({ data: record })
  } catch (error) {
    return next(error)
  }
})

router.post('/', authorize(...writablePatientRoles), async (request, response, next) => {
  try {
    const patient = validatePatient(request.body)
    const created = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO patients
          (hospital_id, personal_id, first_name, middle_name, last_name, date_of_birth,
           sex, race_ethnicity, mobile_number, record_status, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          patient.hospital_id,
          patient.personal_id,
          patient.first_name,
          patient.middle_name,
          patient.last_name,
          patient.date_of_birth,
          patient.sex,
          patient.race_ethnicity,
          patient.mobile_number,
          request.user.userId,
        ],
      )

      await connection.execute(
        `INSERT INTO patient_addresses
          (patient_id, street_barangay, city_municipality, province, zip_code, valid_from)
         VALUES (?, ?, ?, ?, ?, CURRENT_DATE)`,
        [
          result.insertId,
          patient.street_barangay,
          patient.city_municipality,
          patient.province,
          patient.zip_code,
        ],
      )

      await writeAudit(
        connection,
        request.user,
        String(result.insertId),
        'PATIENT_CREATED',
        'Created patient record and current address',
      )

      const [patientRows] = await connection.execute(
        `SELECT patient_id, hospital_id, personal_id, first_name, middle_name, last_name,
                date_of_birth, sex, race_ethnicity, mobile_number, record_status,
                created_by_user_id, created_at, updated_at
         FROM patients
         WHERE patient_id = ?
         LIMIT 1`,
        [result.insertId],
      )
      const [addressRows] = await connection.execute(
        `SELECT address_id, street_barangay, city_municipality, province, zip_code, valid_from, valid_to
         FROM patient_addresses
         WHERE patient_id = ? AND valid_to IS NULL
         ORDER BY valid_from DESC, address_id DESC
         LIMIT 1`,
        [result.insertId],
      )

      return { ...patientRows[0], current_address: addressRows[0] || null }
    })

    return response.status(201).json({ data: created })
  } catch (error) {
    return next(error)
  }
})

function parsePositiveInteger(value, fallback, fieldName) {
  if (value === undefined) return fallback
  const text = String(value)
  if (!/^\d+$/.test(text)) {
    throw new AppError(400, 'INVALID_PAGINATION', `${fieldName} must be a positive integer`)
  }
  const number = Number(text)
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new AppError(400, 'INVALID_PAGINATION', `${fieldName} must be a positive integer`)
  }
  return fieldName === 'limit' ? Math.min(number, 100) : number
}

function parseId(value) {
  if (!/^\d+$/.test(value) || value === '0') {
    throw new AppError(400, 'INVALID_PATIENT_ID', 'Patient ID must be a positive integer')
  }
  return value
}

function validatePatient(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const required = ['hospital_id', 'first_name', 'last_name', 'date_of_birth', 'sex']
  const errors = {}

  for (const field of required) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      errors[field] = 'This field is required'
    }
  }

  const limits = {
    hospital_id: 20,
    personal_id: 40,
    first_name: 80,
    middle_name: 80,
    last_name: 80,
    race_ethnicity: 80,
    mobile_number: 30,
    street_barangay: 180,
    city_municipality: 100,
    province: 100,
    zip_code: 12,
  }

  for (const [field, maxLength] of Object.entries(limits)) {
    const value = input[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors[field] = 'Must be a string'
    } else if (typeof value === 'string' && value.trim().length > maxLength) {
      errors[field] = `Must be ${maxLength} characters or fewer`
    }
  }

  for (const field of ['street_barangay', 'city_municipality', 'province']) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      errors[field] = 'This field is required'
    }
  }

  if (typeof input.date_of_birth === 'string' && !isValidDate(input.date_of_birth)) {
    errors.date_of_birth = 'Must be a valid date in YYYY-MM-DD format'
  } else if (typeof input.date_of_birth === 'string' && input.date_of_birth > new Date().toISOString().slice(0, 10)) {
    errors.date_of_birth = 'Date of birth cannot be in the future'
  }
  if (typeof input.sex === 'string' && !['female', 'male', 'other', 'unknown'].includes(input.sex)) {
    errors.sex = 'Must be female, male, other, or unknown'
  }

  if (Object.keys(errors).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'One or more patient fields are invalid', errors)
  }

  return {
    hospital_id: input.hospital_id.trim(),
    personal_id: nullableString(input.personal_id),
    first_name: input.first_name.trim(),
    middle_name: nullableString(input.middle_name),
    last_name: input.last_name.trim(),
    date_of_birth: input.date_of_birth,
    sex: input.sex,
    race_ethnicity: typeof input.race_ethnicity === 'string' && input.race_ethnicity.trim()
      ? input.race_ethnicity.trim()
      : 'Not stated',
    mobile_number: nullableString(input.mobile_number),
    street_barangay: input.street_barangay.trim(),
    city_municipality: input.city_municipality.trim(),
    province: input.province.trim(),
    zip_code: nullableString(input.zip_code),
  }
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

module.exports = router
