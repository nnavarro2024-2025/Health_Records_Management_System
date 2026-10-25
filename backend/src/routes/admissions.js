const express = require('express')
const { withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')
const { parseRequiredId } = require('../pagination')

const router = express.Router()
const admissionRoles = ['Admin', 'Records Officer', 'Physician']
router.use(authenticate, authorize(...admissionRoles))

router.post('/', async (request, response, next) => {
  try {
    const input = validateAdmission(request.body)
    const admission = await withTransaction(async (connection) => {
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
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Active patient with a current address was not found')
      }

      const [staffRows] = await connection.execute(
        'SELECT staff_id FROM staff WHERE staff_id = ? AND is_active = TRUE LIMIT 1',
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
      if (!staffRows[0] || !paymentRows[0] || !diagnosisRows[0]) {
        throw new AppError(400, 'INVALID_REFERENCE', 'Attending staff, payment source, or principal diagnosis was not found or is inactive')
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO admissions
          (encounter_number, patient_id, residence_address_id, encounter_type, admission_type,
           admission_datetime, attending_staff_id, payment_source_id, principal_diagnosis_id,
           room, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')`,
        [
          input.encounter_number,
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

      await writeAudit(
        connection,
        request.user,
        patients[0].patient_id,
        'ADMISSION_CREATED',
        `Created encounter ${input.encounter_number}`,
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
        `SELECT admission_id, patient_id, admission_datetime, status
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
        throw new AppError(400, 'INVALID_DISCHARGE_DATE', 'Discharge time cannot be before admission time')
      }

      const [dispositions] = await connection.execute(
        'SELECT disposition_id FROM dispositions WHERE disposition_id = ? AND is_active = TRUE LIMIT 1',
        [discharge.disposition_id],
      )
      if (!dispositions[0]) {
        throw new AppError(400, 'INVALID_DISPOSITION', 'An active disposition was not found')
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
  const requiredStrings = [
    'encounter_number',
    'encounter_type',
    'admission_type',
    'admission_datetime',
  ]
  for (const field of requiredStrings) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      errors[field] = 'This field is required'
    }
  }

  const encounterNumber = typeof input.encounter_number === 'string' ? input.encounter_number.trim() : ''
  if (encounterNumber.length > 30) errors.encounter_number = 'Must be 30 characters or fewer'
  if (
    typeof input.encounter_type === 'string' &&
    !['inpatient', 'outpatient', 'emergency'].includes(input.encounter_type)
  ) {
    errors.encounter_type = 'Must be inpatient, outpatient, or emergency'
  }
  if (
    typeof input.admission_type === 'string' &&
    !['scheduled', 'unscheduled_emergency'].includes(input.admission_type)
  ) {
    errors.admission_type = 'Must be scheduled or unscheduled_emergency'
  }

  let admissionDatetime
  try {
    admissionDatetime = parseDateTime(input.admission_datetime, 'admission_datetime')
  } catch (error) {
    errors.admission_datetime = error.message
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

  if (Object.keys(errors).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'One or more admission fields are invalid', errors)
  }

  return {
    encounter_number: encounterNumber,
    patient_id: patientId,
    encounter_type: input.encounter_type,
    admission_type: input.admission_type,
    admission_datetime: admissionDatetime,
    attending_staff_id: attendingStaffId,
    payment_source_id: paymentSourceId,
    principal_diagnosis_id: principalDiagnosisId,
    room,
  }
}

function validateDischarge(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  let dischargeDatetime
  let dispositionId

  try {
    dischargeDatetime = parseDateTime(input.discharge_datetime, 'discharge_datetime')
  } catch (error) {
    errors.discharge_datetime = error.message
  }
  try {
    dispositionId = parseRequiredId(input.disposition_id, 'disposition_id')
  } catch (error) {
    errors.disposition_id = error.message
  }

  const totalCharges = input.total_charges
  if (
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
