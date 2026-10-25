const express = require('express')
const { pool, withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')
const { generateSequentialId } = require('../sequential-id')
const { getPagination, paginatedResponse, parseRequiredId } = require('../pagination')

const router = express.Router()
const patientRoles = ['Admin', 'Records Officer', 'Physician', 'Nurse']
const writablePatientRoles = ['Admin', 'Records Officer']
const allowedStatuses = new Set(['registered', 'admitted', 'outpatient', 'discharged'])

router.use(authenticate, authorize(...patientRoles))

router.get('/', async (request, response, next) => {
  try {
    const search = typeof request.query.search === 'string' ? request.query.search.trim() : ''
    const status = typeof request.query.status === 'string' ? request.query.status.trim() : ''
    const { page, limit, offset } = getPagination(request.query)

    if (search.length > 100) {
      throw new AppError(400, 'INVALID_SEARCH', 'Search must be 100 characters or fewer')
    }
    if (status && !allowedStatuses.has(status)) {
      throw new AppError(400, 'INVALID_STATUS', 'Status filter is not supported')
    }

    const searchPattern = `%${search}%`
    const statusExpression = `CASE
      WHEN latest.admission_id IS NULL THEN 'registered'
      WHEN latest.encounter_type = 'outpatient' THEN 'outpatient'
      WHEN latest.status = 'in_progress' THEN 'admitted'
      ELSE 'discharged' END`
    const joins = `FROM patients AS p
      LEFT JOIN admissions AS latest ON latest.admission_id = (
        SELECT a.admission_id FROM admissions AS a
        WHERE a.patient_id = p.patient_id
        ORDER BY a.admission_datetime DESC, a.admission_id DESC LIMIT 1
      )
      LEFT JOIN patient_addresses AS address ON address.address_id = (
        SELECT pa.address_id FROM patient_addresses AS pa
        WHERE pa.patient_id = p.patient_id AND pa.valid_to IS NULL
        ORDER BY pa.valid_from DESC, pa.address_id DESC LIMIT 1
      )`
    const filterSql = `WHERE (? = '' OR CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) LIKE ? OR p.hospital_id LIKE ?)
      AND (? = '' OR ${statusExpression} = ?)`
    const filterParams = [search, searchPattern, searchPattern, status, status]
    const [[countRows], [rows]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total ${joins} ${filterSql}`, filterParams),
      pool.execute(
        `SELECT p.patient_id, p.hospital_id, p.first_name, p.middle_name, p.last_name,
                p.date_of_birth, p.sex, p.record_status,
                latest.status AS latest_encounter_status,
                ${statusExpression} AS display_status,
                latest.room, latest.admission_datetime AS last_visit,
                CONCAT_WS(', ', address.city_municipality, address.province) AS address
         ${joins} ${filterSql}
         ORDER BY p.last_name, p.first_name, p.patient_id
         LIMIT ? OFFSET ?`,
        [...filterParams, limit, offset],
      ),
    ])

    await withTransaction(async (connection) => {
      for (const patient of rows) {
        await writeAudit(connection, request.user, patient.patient_id, 'PATIENT_LIST_VIEWED', 'Patient record appeared in a viewed patient list')
      }
    })
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.get('/:id/vitals', async (request, response, next) => {
  try {
    const patientId = parseId(request.params.id)
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM patient_vitals WHERE patient_id = ?', [patientId]),
      pool.execute(
        `SELECT vitals_id, patient_id, admission_id, recorded_at, temperature_c, systolic_bp,
                diastolic_bp, pulse_bpm, respiratory_rate, spo2_percent, weight_kg, height_cm,
                recorded_by_user_id
         FROM patient_vitals
         WHERE patient_id = ?
         ORDER BY recorded_at DESC, vitals_id DESC
         LIMIT ? OFFSET ?`,
        [patientId, limit, offset],
      ),
    ])
    if (Number(countRows[0].total) === 0) {
      const [patients] = await pool.execute('SELECT patient_id FROM patients WHERE patient_id = ? LIMIT 1', [patientId])
      if (!patients[0]) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient record was not found')
    }
    await withTransaction(async (connection) => {
      await writeAudit(connection, request.user, patientId, 'PATIENT_VITALS_VIEWED', 'Viewed patient vitals history')
    })
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/vitals', authorize('Nurse', 'Physician'), async (request, response, next) => {
  try {
    const patientId = parseId(request.params.id)
    const values = validateVitals(request.body)
    const vitals = await withTransaction(async (connection) => {
      const [patients] = await connection.execute(
        'SELECT patient_id FROM patients WHERE patient_id = ? LIMIT 1',
        [patientId],
      )
      if (!patients[0]) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient record was not found')
      const [admissions] = await connection.execute(
        `SELECT admission_id FROM admissions
         WHERE patient_id = ? AND status = 'in_progress'
         ORDER BY admission_datetime DESC, admission_id DESC LIMIT 1`,
        [patientId],
      )
      const [result] = await connection.execute(
        `INSERT INTO patient_vitals
          (patient_id, admission_id, temperature_c, systolic_bp, diastolic_bp, pulse_bpm,
           respiratory_rate, spo2_percent, weight_kg, height_cm, recorded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patientId, admissions[0]?.admission_id ?? null, values.temperature_c,
          values.systolic_bp, values.diastolic_bp, values.pulse_bpm,
          values.respiratory_rate, values.spo2_percent, values.weight_kg,
          values.height_cm, request.user.userId,
        ],
      )
      await writeAudit(connection, request.user, patientId, 'VITALS_RECORDED', 'Recorded patient vitals')
      const [rows] = await connection.execute(
        `SELECT vitals_id, patient_id, admission_id, recorded_at, temperature_c, systolic_bp,
                diastolic_bp, pulse_bpm, respiratory_rate, spo2_percent, weight_kg, height_cm,
                recorded_by_user_id
         FROM patient_vitals WHERE vitals_id = ? LIMIT 1`,
        [result.insertId],
      )
      return rows[0]
    })
    return response.status(201).json({ data: vitals })
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
        [recentVitals],
        [latestVitals],
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
                  d.diagnosis_name, pp.recorded_at, pp.resolved_at, pp.notes, pp.recorded_by_user_id,
                  CASE WHEN pp.resolved_at IS NULL THEN 'active' ELSE 'resolved' END AS condition_status
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
                  medication_status, start_date, end_date, notes, recorded_by_user_id, created_at,
                  CASE
                    WHEN medication_status IN ('stopped', 'completed') OR end_date < CURRENT_DATE THEN 'past'
                    WHEN start_date > CURRENT_DATE THEN 'upcoming'
                    ELSE 'active'
                  END AS medication_group
           FROM patient_medications
           WHERE patient_id = ?
           ORDER BY created_at DESC, patient_medication_id DESC`,
          [patientId],
        ),
        connection.execute(
          `SELECT vitals_id, patient_id, admission_id, recorded_at, temperature_c, systolic_bp,
                  diastolic_bp, pulse_bpm, respiratory_rate, spo2_percent, weight_kg, height_cm,
                  recorded_by_user_id
           FROM patient_vitals
           WHERE patient_id = ?
           ORDER BY recorded_at DESC, vitals_id DESC
           LIMIT 10`,
          [patientId],
        ),
        connection.execute(
          `SELECT vitals_id, patient_id, admission_id, recorded_at, temperature_c, systolic_bp,
                  diastolic_bp, pulse_bpm, respiratory_rate, spo2_percent, weight_kg, height_cm,
                  recorded_by_user_id
           FROM patient_vitals
           WHERE patient_id = ?
           ORDER BY recorded_at DESC, vitals_id DESC LIMIT 1`,
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
        conditions: problems,
        problems,
        allergies,
        medications: {
          active: medications.filter((item) => item.medication_group === 'active'),
          upcoming: medications.filter((item) => item.medication_group === 'upcoming'),
          past: medications.filter((item) => item.medication_group === 'past'),
        },
        latest_vitals: latestVitals[0] || null,
        recent_vitals: recentVitals,
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
      if (patient.active_problems.length) {
        const placeholders = patient.active_problems.map(() => '?').join(', ')
        const [diagnoses] = await connection.execute(
          `SELECT diagnosis_id FROM diagnoses WHERE diagnosis_id IN (${placeholders})`,
          patient.active_problems.map((problem) => problem.diagnosis_id),
        )
        if (diagnoses.length !== patient.active_problems.length) {
          throw new AppError(400, 'VALIDATION_ERROR', 'One or more patient fields are invalid', {
            active_problems: 'One or more selected diagnoses do not exist',
          })
        }
      }
      const year = new Date().getFullYear()
      const hospitalId = await generateSequentialId(connection, 'patients', 'hospital_id', `HSC-${year}-`)
      const [result] = await connection.execute(
        `INSERT INTO patients
          (hospital_id, personal_id, first_name, middle_name, last_name, date_of_birth,
           sex, race_ethnicity, mobile_number, record_status, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          hospitalId,
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

      if (patient.emergency_contact) {
        await connection.execute(
          `INSERT INTO patient_emergency_contacts
            (patient_id, contact_name, contact_number, relationship_to_patient)
           VALUES (?, ?, ?, ?)`,
          [result.insertId, patient.emergency_contact.contact_name, patient.emergency_contact.contact_number,
            patient.emergency_contact.relationship_to_patient],
        )
      }

      for (const allergy of patient.allergies) {
        await connection.execute(
          `INSERT INTO patient_allergies
            (patient_id, allergen, reaction, severity, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?)`,
          [result.insertId, allergy.allergen, allergy.reaction, allergy.severity, request.user.userId],
        )
      }

      for (const problem of patient.active_problems) {
        await connection.execute(
          `INSERT INTO patient_problems (patient_id, diagnosis_id, notes, recorded_by_user_id)
           VALUES (?, ?, ?, ?)`,
          [result.insertId, problem.diagnosis_id, problem.notes, request.user.userId],
        )
      }

      for (const medication of patient.active_medications) {
        await connection.execute(
          `INSERT INTO patient_medications
            (patient_id, medication_name, strength, dose, route, frequency, medication_status,
             start_date, end_date, notes, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
          [result.insertId, medication.medication_name, medication.strength, medication.dose,
            medication.route, medication.frequency, medication.start_date, medication.end_date,
            medication.notes, request.user.userId],
        )
      }

      await writeAudit(
        connection,
        request.user,
        String(result.insertId),
        'PATIENT_REGISTERED',
        `Registered patient ${hospitalId} with address and supplied clinical details`,
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

      const [contacts] = await connection.execute(
        `SELECT emergency_contact_id, contact_name, contact_number, relationship_to_patient
         FROM patient_emergency_contacts WHERE patient_id = ? ORDER BY emergency_contact_id`,
        [result.insertId],
      )
      const [allergies] = await connection.execute(
        `SELECT allergy_id, allergen, reaction, severity, allergy_status, recorded_at
         FROM patient_allergies WHERE patient_id = ? ORDER BY allergy_id`,
        [result.insertId],
      )
      const [conditions] = await connection.execute(
        `SELECT pp.patient_problem_id, pp.diagnosis_id, d.diagnosis_code, d.diagnosis_name,
                pp.recorded_at, pp.resolved_at, pp.notes
         FROM patient_problems AS pp
         INNER JOIN diagnoses AS d ON d.diagnosis_id = pp.diagnosis_id
         WHERE pp.patient_id = ? ORDER BY pp.patient_problem_id`,
        [result.insertId],
      )
      const [medications] = await connection.execute(
        `SELECT patient_medication_id, medication_name, strength, dose, route, frequency,
                medication_status, start_date, end_date, notes
         FROM patient_medications WHERE patient_id = ? ORDER BY patient_medication_id`,
        [result.insertId],
      )
      return {
        ...patientRows[0],
        current_address: addressRows[0] || null,
        emergency_contacts: contacts,
        allergies,
        conditions,
        medications,
      }
    })

    return response.status(201).json({ data: created })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return next(new AppError(409, 'DUPLICATE_PATIENT_IDENTIFIER', 'The personal ID is already assigned to a patient', {
        personal_id: 'This personal ID is already assigned to a patient',
      }))
    }
    return next(error)
  }
})

function parseId(value) {
  if (!/^\d+$/.test(value) || value === '0') {
    throw new AppError(400, 'INVALID_PATIENT_ID', 'Patient ID must be a positive integer')
  }
  return value
}

function validatePatient(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  const acceptedFields = new Set([
    'personal_id', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'sex',
    'race_ethnicity', 'mobile_number', 'street_barangay', 'city_municipality',
    'province', 'zip_code', 'emergency_contact', 'allergies', 'active_problems',
    'active_medications',
  ])
  for (const field of Object.keys(input)) {
    if (!acceptedFields.has(field)) errors[field] = field === 'hospital_id'
      ? 'Assigned automatically by the API; do not submit this field'
      : 'This field is not accepted'
  }
  const required = ['first_name', 'last_name', 'date_of_birth', 'sex', 'street_barangay', 'city_municipality', 'province']
  for (const field of required) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') errors[field] = 'This field is required'
  }

  const limits = {
    personal_id: 40, first_name: 80, middle_name: 80, last_name: 80,
    race_ethnicity: 80, mobile_number: 30, street_barangay: 180,
    city_municipality: 100, province: 100, zip_code: 12,
  }
  for (const [field, maxLength] of Object.entries(limits)) {
    const value = input[field]
    if (value !== undefined && value !== null && typeof value !== 'string') errors[field] = 'Must be a string'
    else if (typeof value === 'string' && value.trim().length > maxLength) errors[field] = `Must be ${maxLength} characters or fewer`
  }
  if (typeof input.date_of_birth === 'string' && input.date_of_birth.trim() && !isValidDate(input.date_of_birth)) {
    errors.date_of_birth = 'Must be a valid date in YYYY-MM-DD format'
  } else if (typeof input.date_of_birth === 'string' && input.date_of_birth.trim() && input.date_of_birth >= localDateString()) {
    errors.date_of_birth = 'Date of birth must be before today'
  }
  if (typeof input.mobile_number === 'string' && input.mobile_number.trim()) {
    const normalizedMobile = input.mobile_number.replace(/\s+/g, '')
    if (!/^(?:09\d{9}|\+639\d{9})$/.test(normalizedMobile)) {
      errors.mobile_number = 'Enter a Philippine mobile number in 09XXXXXXXXX or +639XXXXXXXXX format'
    }
  }
  if (typeof input.sex === 'string' && input.sex.trim() && !['female', 'male', 'other', 'unknown'].includes(input.sex)) {
    errors.sex = 'Must be female, male, other, or unknown'
  }

  const emergencyContact = input.emergency_contact
  if (emergencyContact !== undefined && emergencyContact !== null && (typeof emergencyContact !== 'object' || Array.isArray(emergencyContact))) {
    errors.emergency_contact = 'Must be an object'
  }
  let contact = null
  if (emergencyContact && typeof emergencyContact === 'object' && !Array.isArray(emergencyContact)) {
    const name = nullableString(emergencyContact.contact_name)
    const number = nullableString(emergencyContact.contact_number)
    if ((name && !number) || (!name && number)) errors.emergency_contact = 'Name and contact number must both be provided'
    if (name && name.length > 160) errors.emergency_contact = 'Contact name must be 160 characters or fewer'
    if (number && number.length > 30) errors.emergency_contact = 'Contact number must be 30 characters or fewer'
    const relationship = nullableString(emergencyContact.relationship_to_patient)
    if (relationship && relationship.length > 60) errors.emergency_contact = 'Relationship must be 60 characters or fewer'
    if (name && number) contact = { contact_name: name, contact_number: number, relationship_to_patient: relationship }
    if (emergencyContact.contact_name !== undefined && emergencyContact.contact_name !== null && typeof emergencyContact.contact_name !== 'string') {
    errors.emergency_contact = 'Contact name must be a string'
    }
    if (emergencyContact.contact_number !== undefined && emergencyContact.contact_number !== null && typeof emergencyContact.contact_number !== 'string') {
    errors.emergency_contact = 'Contact number must be a string'
    }
    if (emergencyContact.relationship_to_patient !== undefined && emergencyContact.relationship_to_patient !== null && typeof emergencyContact.relationship_to_patient !== 'string') {
    errors.emergency_contact = 'Relationship must be a string'
    }
  }

  const allergies = parseArray(input.allergies, 'allergies', errors, 50).map((item, index) => {
    const allergy = typeof item === 'string' ? { allergen: item } : item
    if (!allergy || typeof allergy !== 'object' || Array.isArray(allergy) || typeof allergy.allergen !== 'string' || !allergy.allergen.trim()) {
    errors[`allergies.${index}`] = 'Each allergy must include an allergen'
    return null
    }
    const severity = allergy.severity || 'unknown'
    if (!['unknown', 'mild', 'moderate', 'severe'].includes(severity)) errors[`allergies.${index}.severity`] = 'Invalid severity'
    if (allergy.allergen.trim().length > 160) errors[`allergies.${index}.allergen`] = 'Must be 160 characters or fewer'
    if (allergy.reaction != null && typeof allergy.reaction !== 'string') errors[`allergies.${index}.reaction`] = 'Must be a string'
    if (typeof allergy.reaction === 'string' && allergy.reaction.trim().length > 255) errors[`allergies.${index}.reaction`] = 'Must be 255 characters or fewer'
    return {
    allergen: allergy.allergen.trim(),
    reaction: nullableString(allergy.reaction),
      severity: ['unknown', 'mild', 'moderate', 'severe'].includes(severity) ? severity : 'unknown',
    }
  }).filter(Boolean)

  const activeProblems = parseArray(input.active_problems, 'active_problems', errors, 50).map((item, index) => {
    try {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Each problem must be an object')
      if (item.notes != null && typeof item.notes !== 'string') throw new Error('Notes must be a string')
      if (typeof item.notes === 'string' && item.notes.trim().length > 500) throw new Error('Notes must be 500 characters or fewer')
      return { diagnosis_id: parseRequiredId(item.diagnosis_id, `active_problems.${index}.diagnosis_id`), notes: nullableString(item.notes) }
    } catch (error) {
      errors[`active_problems.${index}.diagnosis_id`] = error.message
      return null
    }
  }).filter(Boolean)
  if (new Set(activeProblems.map((problem) => problem.diagnosis_id)).size !== activeProblems.length) {
    errors.active_problems = 'Diagnosis IDs must not contain duplicates'
  }

  const activeMedications = parseArray(input.active_medications, 'active_medications', errors, 50).map((item, index) => {
    const medication = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
    const requiredMedicationFields = ['medication_name', 'dose', 'route', 'frequency']
    for (const field of requiredMedicationFields) {
      if (typeof medication[field] !== 'string' || !medication[field].trim()) errors[`active_medications.${index}.${field}`] = 'This field is required'
    }
    const medicationLimits = { medication_name: 180, strength: 80, dose: 80, route: 40, frequency: 100, notes: 500 }
    for (const [field, maxLength] of Object.entries(medicationLimits)) {
      if (medication[field] != null && typeof medication[field] !== 'string') errors[`active_medications.${index}.${field}`] = 'Must be a string'
      else if (typeof medication[field] === 'string' && medication[field].trim().length > maxLength) errors[`active_medications.${index}.${field}`] = `Must be ${maxLength} characters or fewer`
    }
    const date = medication.start_date
    if (date != null && date !== '' && (typeof date !== 'string' || !isValidDate(date))) errors[`active_medications.${index}.start_date`] = 'Must be a valid date'
    const endDate = medication.end_date
    if (endDate != null && endDate !== '' && (typeof endDate !== 'string' || !isValidDate(endDate))) errors[`active_medications.${index}.end_date`] = 'Must be a valid date'
    if (typeof date === 'string' && typeof endDate === 'string' && isValidDate(date) && isValidDate(endDate) && endDate < date) errors[`active_medications.${index}.end_date`] = 'Cannot precede the start date'
    return {
      medication_name: typeof medication.medication_name === 'string' ? medication.medication_name.trim() : '',
      strength: nullableString(medication.strength),
      dose: typeof medication.dose === 'string' ? medication.dose.trim() : '',
      route: typeof medication.route === 'string' ? medication.route.trim() : '',
      frequency: typeof medication.frequency === 'string' ? medication.frequency.trim() : '',
      start_date: date || null,
      end_date: endDate || null,
      notes: nullableString(medication.notes),
    }
  })

  if (Object.keys(errors).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'One or more patient fields are invalid', errors)
  }

  return {
    personal_id: nullableString(input.personal_id),
    first_name: input.first_name.trim(),
    middle_name: nullableString(input.middle_name),
    last_name: input.last_name.trim(),
    date_of_birth: input.date_of_birth,
    sex: input.sex,
    race_ethnicity: typeof input.race_ethnicity === 'string' && input.race_ethnicity.trim() ? input.race_ethnicity.trim() : 'Not stated',
    mobile_number: nullableString(input.mobile_number),
    street_barangay: input.street_barangay.trim(),
    city_municipality: input.city_municipality.trim(),
    province: input.province.trim(),
    zip_code: nullableString(input.zip_code),
    emergency_contact: contact,
    allergies,
    active_problems: activeProblems,
    active_medications: activeMedications,
  }
}

function parseArray(value, field, errors, maxItems) {
  if (value === undefined || value === null || value === '') return []
  if (!Array.isArray(value)) {
    errors[field] = 'Must be an array'
    return []
  }
  if (value.length > maxItems) errors[field] = `Cannot contain more than ${maxItems} entries`
  return value.slice(0, maxItems)
}

function validateVitals(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const acceptedFields = new Set([
    'temperature_c', 'systolic_bp', 'diastolic_bp', 'pulse_bpm',
    'respiratory_rate', 'spo2_percent', 'weight_kg', 'height_cm',
  ])
  const errors = {}
  for (const field of Object.keys(input)) {
    if (!acceptedFields.has(field)) errors[field] = 'This field is not accepted; BMI and admission linkage are calculated by the server'
  }
  const limits = {
    temperature_c: [25, 45], systolic_bp: [40, 300], diastolic_bp: [20, 200],
    pulse_bpm: [20, 250], respiratory_rate: [4, 80], spo2_percent: [0, 100],
    weight_kg: [0.1, 500], height_cm: [20, 250],
  }
  const values = {}
  let measurementCount = 0
  for (const [field, [min, max]] of Object.entries(limits)) {
    const raw = input[field]
    if (raw === undefined || raw === null || raw === '') {
      values[field] = null
      continue
    }
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(value) || value < min || value > max || (['systolic_bp', 'diastolic_bp', 'pulse_bpm', 'respiratory_rate'].includes(field) && !Number.isInteger(value))) {
      errors[field] = `Must be a valid measurement between ${min} and ${max}`
    } else {
      values[field] = value
      measurementCount += 1
    }
  }
  if (measurementCount === 0) errors.measurements = 'At least one measurement is required'
  if (
    values.systolic_bp !== null && values.diastolic_bp !== null &&
    values.systolic_bp <= values.diastolic_bp
  ) {
    errors.systolic_bp = 'Must be greater than the diastolic blood pressure'
    errors.diastolic_bp = 'Must be less than the systolic blood pressure'
  }
  if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'One or more vital measurements are invalid', errors)
  return values
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

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

module.exports = router
