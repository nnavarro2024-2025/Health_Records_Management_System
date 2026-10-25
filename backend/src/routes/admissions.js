const express = require('express')
const { pool, withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')
const { parseRequiredId, getPagination, paginatedResponse } = require('../pagination')
const { generateSequentialId } = require('../sequential-id')

const router = express.Router()
const admissionRoles = ['Admin', 'Records Officer', 'Physician']
router.use(authenticate, authorize(...admissionRoles))

router.get('/', async (request, response, next) => {
  try {
    const status = typeof request.query.status === 'string' ? request.query.status.trim() : 'in_progress'
    if (!['in_progress', 'discharged', 'cancelled'].includes(status)) {
      throw new AppError(400, 'INVALID_STATUS', 'Admission status is not supported')
    }
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM admissions WHERE status = ?', [status]),
      pool.execute(
        `SELECT a.admission_id, a.encounter_number, a.patient_id, a.encounter_type,
                a.admission_type, a.admission_datetime, a.room, a.status,
                p.hospital_id, CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) AS patient_name
         FROM admissions AS a
         INNER JOIN patients AS p ON p.patient_id = a.patient_id
         WHERE a.status = ?
         ORDER BY a.admission_datetime DESC, a.admission_id DESC
         LIMIT ? OFFSET ?`,
        [status, limit, offset],
      ),
    ])
    await withTransaction(async (connection) => {
      for (const admission of rows) {
        await writeAudit(connection, request.user, admission.patient_id, 'ADMISSION_LIST_VIEWED', 'Encounter appeared in the admission list')
      }
    })
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.post('/', async (request, response, next) => {
  try {
    const input = validateAdmission(request.body)
    const admission = await withTransaction(async (connection) => {
      const encounterNumber = await generateSequentialId(
        connection,
        'admissions',
        'encounter_number',
        `ENC-${new Date().getFullYear()}-`,
      )
      const [patients] = await connection.execute(
        `SELECT p.patient_id, pa.address_id
         FROM patients AS p
         INNER JOIN patient_addresses AS pa ON pa.patient_id = p.patient_id
         WHERE p.patient_id = ?
           AND p.record_status = 'active'
           AND pa.valid_to IS NULL
         ORDER BY pa.valid_from DESC, pa.address_id DESC
         LIMIT 1`,
        [input.patient_id],
      )
      if (!patients[0]) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Active patient with a current address was not found', {
          patient_id: 'Select an active patient with a current address',
        })
      }

      const [staffRows] = await connection.execute(
        'SELECT staff_id FROM staff WHERE staff_id = ? AND is_active = TRUE AND staff_type = \'physician\' LIMIT 1',
        [input.attending_staff_id],
      )
      const [paymentRows] = await connection.execute(
        'SELECT payment_source_id FROM payment_sources WHERE payment_source_id = ? AND is_active = TRUE LIMIT 1',
        [input.payment_source_id],
      )
      const [diagnosisRows] = await connection.execute(
        'SELECT diagnosis_id FROM diagnoses WHERE diagnosis_id = ? LIMIT 1',
        [input.principal_diagnosis_id],
      )
      const referenceFields = {}
      if (!staffRows[0]) referenceFields.attending_staff_id = 'Select an active physician'
      if (!paymentRows[0]) referenceFields.payment_source_id = 'Select an active payment source'
      if (!diagnosisRows[0]) referenceFields.principal_diagnosis_id = 'Select a valid principal diagnosis'
      if (Object.keys(referenceFields).length) {
        throw new AppError(400, 'VALIDATION_ERROR', 'One or more admission references are invalid', referenceFields)
      }
      if (input.other_diagnosis_ids.includes(input.principal_diagnosis_id)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'One or more admission fields are invalid', {
          other_diagnosis_ids: 'The principal diagnosis cannot also be an other diagnosis',
        })
      }
      if (input.other_diagnosis_ids.length) {
        const placeholders = input.other_diagnosis_ids.map(() => '?').join(', ')
        const [otherDiagnoses] = await connection.execute(
          `SELECT diagnosis_id FROM diagnoses WHERE diagnosis_id IN (${placeholders})`,
          input.other_diagnosis_ids,
        )
        if (otherDiagnoses.length !== input.other_diagnosis_ids.length) {
          throw new AppError(400, 'VALIDATION_ERROR', 'One or more admission fields are invalid', {
            other_diagnosis_ids: 'One or more selected diagnoses do not exist',
          })
        }
      }
      if (input.procedure_ids.length) {
        const placeholders = input.procedure_ids.map(() => '?').join(', ')
        const [procedures] = await connection.execute(
          `SELECT procedure_id FROM procedures WHERE procedure_id IN (${placeholders})`,
          input.procedure_ids,
        )
        if (procedures.length !== input.procedure_ids.length) {
          throw new AppError(400, 'VALIDATION_ERROR', 'One or more admission fields are invalid', {
            procedure_ids: 'One or more selected procedures do not exist',
          })
        }
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO admissions
          (encounter_number, patient_id, residence_address_id, encounter_type, admission_type,
           admission_datetime, attending_staff_id, payment_source_id, principal_diagnosis_id,
           room, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')`,
        [
          encounterNumber,
          patients[0].patient_id,
          patients[0].address_id,
          input.encounter_type,
          input.admission_type,
          input.admission_datetime,
          input.attending_staff_id,
          input.payment_source_id,
          input.principal_diagnosis_id,
          input.room,
        ],
      )

      for (const [index, diagnosisId] of input.other_diagnosis_ids.entries()) {
        await connection.execute(
          `INSERT INTO admission_diagnoses (admission_id, diagnosis_id, sequence_number)
           VALUES (?, ?, ?)`,
          [insertResult.insertId, diagnosisId, index + 1],
        )
      }
      for (const procedureId of input.procedure_ids) {
        await connection.execute(
          `INSERT INTO admission_procedures (admission_id, procedure_id)
           VALUES (?, ?)`,
          [insertResult.insertId, procedureId],
        )
      }

      await writeAudit(
        connection,
        request.user,
        patients[0].patient_id,
        'ADMISSION_CREATED',
        `Created encounter ${encounterNumber}`,
      )

      const [rows] = await connection.execute(
        `SELECT admission_id, encounter_number, patient_id, residence_address_id, encounter_type,
                admission_type, admission_datetime, discharge_datetime, attending_staff_id,
                payment_source_id, principal_diagnosis_id, disposition_id, room,
                total_charges, status, created_at, updated_at
         FROM admissions
         WHERE admission_id = ?
         LIMIT 1`,
        [insertResult.insertId],
      )
      return rows[0]
    })

    return response.status(201).json({ data: admission })
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/discharge', async (request, response, next) => {
  try {
    const admissionId = parseRequiredId(request.params.id, 'id')
    const discharge = validateDischarge(request.body)
    const updated = await withTransaction(async (connection) => {
      const [admissions] = await connection.execute(
        `SELECT admission_id, patient_id, encounter_type, admission_datetime, status
         FROM admissions
         WHERE admission_id = ?
         FOR UPDATE`,
        [admissionId],
      )
      const admission = admissions[0]
      if (!admission) {
        throw new AppError(404, 'ADMISSION_NOT_FOUND', 'Admission was not found')
      }
      if (admission.status !== 'in_progress') {
        throw new AppError(409, 'ADMISSION_NOT_DISCHARGEABLE', 'Only an in-progress admission can be discharged')
      }
      if (discharge.discharge_datetime < admission.admission_datetime) {
        throw new AppError(400, 'VALIDATION_ERROR', 'One or more discharge fields are invalid', {
          discharge_datetime: 'Cannot be before the admission date and time',
        })
      }

      const [dispositions] = await connection.execute(
        'SELECT disposition_id FROM dispositions WHERE disposition_id = ? AND is_active = TRUE LIMIT 1',
        [discharge.disposition_id],
      )
      if (!dispositions[0]) {
        throw new AppError(400, 'VALIDATION_ERROR', 'One or more discharge fields are invalid', {
          disposition_id: 'Select an active disposition',
        })
      }

      const categoryName = admission.encounter_type === 'outpatient' ? 'Outpatient' : 'Adult inpatient'
      const [categories] = await connection.execute(
        `SELECT retention_category_id, retention_years
         FROM retention_categories
         WHERE category_name = ? AND is_active = TRUE
         LIMIT 1`,
        [categoryName],
      )
      if (!categories[0]) {
        throw new AppError(500, 'RETENTION_CATEGORY_MISSING', `Required retention category "${categoryName}" is not configured`)
      }

      await connection.execute(
        `UPDATE admissions
         SET status = 'discharged',
             discharge_datetime = ?,
             total_charges = ?,
             disposition_id = ?
         WHERE admission_id = ?`,
        [
          discharge.discharge_datetime,
          discharge.total_charges,
          discharge.disposition_id,
          admissionId,
        ],
      )
      await connection.execute(
        `INSERT INTO retention_records
          (admission_id, retention_category_id, review_due_date, review_status)
         VALUES (?, ?, DATE_ADD(DATE(?), INTERVAL ? YEAR), 'pending_review')`,
        [admissionId, categories[0].retention_category_id, discharge.discharge_datetime, categories[0].retention_years],
      )
      await writeAudit(
        connection,
        request.user,
        admission.patient_id,
        'ADMISSION_DISCHARGED',
        `Discharged encounter ${admissionId}`,
      )

      const [rows] = await connection.execute(
        `SELECT admission_id, encounter_number, patient_id, residence_address_id, encounter_type,
                admission_type, admission_datetime, discharge_datetime, attending_staff_id,
                payment_source_id, principal_diagnosis_id, disposition_id, room,
                total_charges, status, created_at, updated_at
         FROM admissions
         WHERE admission_id = ?
         LIMIT 1`,
        [admissionId],
      )
      return rows[0]
    })

    return response.json({ data: updated })
  } catch (error) {
    return next(error)
  }
})

function validateAdmission(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  const acceptedFields = new Set([
    'patient_id', 'encounter_type', 'admission_type', 'admission_datetime',
    'attending_staff_id', 'payment_source_id', 'principal_diagnosis_id', 'room',
    'other_diagnosis_ids', 'procedure_ids',
  ])
  for (const field of Object.keys(input)) {
    if (!acceptedFields.has(field)) errors[field] = field === 'encounter_number'
      ? 'Assigned automatically by the API; do not submit this field'
      : 'This field is not accepted'
  }
  const requiredFields = [
    'patient_id', 'encounter_type', 'admission_type', 'admission_datetime',
    'attending_staff_id', 'payment_source_id', 'principal_diagnosis_id',
  ]
  for (const field of requiredFields) {
    if (input[field] === undefined || input[field] === null || String(input[field]).trim() === '') {
      errors[field] = 'This field is required'
    }
  }

  if (input.encounter_type !== undefined && input.encounter_type !== null && String(input.encounter_type).trim() &&
    (typeof input.encounter_type !== 'string' || !['inpatient', 'outpatient', 'emergency'].includes(input.encounter_type))) {
    errors.encounter_type = 'Must be inpatient, outpatient, or emergency'
  }
  if (input.admission_type !== undefined && input.admission_type !== null && String(input.admission_type).trim() &&
    (typeof input.admission_type !== 'string' || !['scheduled', 'unscheduled_emergency'].includes(input.admission_type))) {
    errors.admission_type = 'Must be scheduled or unscheduled_emergency'
  }

  let admissionDatetime
  if (input.admission_datetime !== undefined && input.admission_datetime !== null && String(input.admission_datetime).trim()) {
    try {
      admissionDatetime = parseDateTime(input.admission_datetime, 'admission_datetime')
    } catch (error) {
      errors.admission_datetime = error.message
    }
  }

  let patientId
  let attendingStaffId
  let paymentSourceId
  let principalDiagnosisId
  for (const [field, setter] of [
    ['patient_id', (value) => { patientId = value }],
    ['attending_staff_id', (value) => { attendingStaffId = value }],
    ['payment_source_id', (value) => { paymentSourceId = value }],
    ['principal_diagnosis_id', (value) => { principalDiagnosisId = value }],
  ]) {
    if (input[field] === undefined || input[field] === null || String(input[field]).trim() === '') continue
    try {
      setter(parseRequiredId(input[field], field))
    } catch (error) {
      errors[field] = error.message
    }
  }

  let room = null
  if (input.room !== undefined && input.room !== null) {
    if (typeof input.room !== 'string' || input.room.trim().length > 60) {
      errors.room = 'Must be a string of 60 characters or fewer'
    } else {
      room = input.room.trim() || null
    }
  }

  const otherDiagnosisIds = parseIdArray(input.other_diagnosis_ids, 'other_diagnosis_ids', errors)
  const procedureIds = parseIdArray(input.procedure_ids, 'procedure_ids', errors)
  if (Object.keys(errors).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'One or more admission fields are invalid', errors)
  }

  return {
    patient_id: patientId,
    encounter_type: input.encounter_type,
    admission_type: input.admission_type,
    admission_datetime: admissionDatetime,
    attending_staff_id: attendingStaffId,
    payment_source_id: paymentSourceId,
    principal_diagnosis_id: principalDiagnosisId,
    room,
    other_diagnosis_ids: otherDiagnosisIds,
    procedure_ids: procedureIds,
  }
}

function parseIdArray(value, field, errors) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) {
    errors[field] = 'Must be an array of at most 100 IDs'
    return []
  }
  const ids = []
  for (const [index, item] of value.entries()) {
    try {
      ids.push(parseRequiredId(item, `${field}.${index}`))
    } catch (error) {
      errors[`${field}.${index}`] = error.message
    }
  }
  if (new Set(ids).size !== ids.length) errors[field] = 'IDs must not contain duplicates'
  return ids
}

function validateDischarge(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  for (const field of Object.keys(input)) {
    if (!['discharge_datetime', 'total_charges', 'disposition_id'].includes(field)) {
      errors[field] = 'This field is not accepted by the discharge endpoint'
    }
  }
  let dischargeDatetime
  let dispositionId

  if (input.discharge_datetime === undefined || input.discharge_datetime === null || String(input.discharge_datetime).trim() === '') {
    errors.discharge_datetime = 'This field is required'
  } else {
    try {
      dischargeDatetime = parseDateTime(input.discharge_datetime, 'discharge_datetime')
    } catch (error) {
      errors.discharge_datetime = error.message
    }
  }
  if (input.disposition_id === undefined || input.disposition_id === null || String(input.disposition_id).trim() === '') {
    errors.disposition_id = 'This field is required'
  } else {
    try {
      dispositionId = parseRequiredId(input.disposition_id, 'disposition_id')
    } catch (error) {
      errors.disposition_id = error.message
    }
  }

  const totalCharges = input.total_charges
  if (totalCharges === undefined || totalCharges === null || String(totalCharges).trim() === '') {
    errors.total_charges = 'This field is required'
  } else if (
    (typeof totalCharges !== 'number' && typeof totalCharges !== 'string') ||
    String(totalCharges).trim() === '' ||
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(String(totalCharges))
  ) {
    errors.total_charges = 'Must be a non-negative amount with up to 10 integer and 2 decimal digits'
  }

  if (Object.keys(errors).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'One or more discharge fields are invalid', errors)
  }

  return {
    discharge_datetime: dischargeDatetime,
    disposition_id: dispositionId,
    total_charges: String(totalCharges),
  }
}

function parseDateTime(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a valid local date/time`)
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) {
    throw new Error(`${fieldName} must use YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm:ss format`)
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(`${fieldName} must be a valid local date/time`)
  }
  return `${yearText}-${monthText}-${dayText} ${hourText}:${minuteText}:${secondText}`
}

module.exports = router
