const express = require('express')
const { pool } = require('../db')
const { authenticate, authorize } = require('../middleware/auth')
const { getPagination, paginatedResponse } = require('../pagination')

const router = express.Router()
router.use(authenticate, authorize('Admin', 'Records Officer', 'Physician'))

router.get('/staff', async (request, response, next) => {
  try {
    const staffType = typeof request.query.staff_type === 'string' ? request.query.staff_type.trim() : ''
    if (staffType && !['administrator', 'records_officer', 'physician', 'nurse', 'other'].includes(staffType)) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'One or more reference filters are invalid',
          fields: { staff_type: 'Select a valid staff type' },
        },
      })
    }
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM staff WHERE is_active = TRUE AND (? = \'\' OR staff_type = ?)', [staffType, staffType]),
      pool.execute(
        `SELECT staff_id, first_name, middle_name, last_name, credentials, staff_type
         FROM staff
         WHERE is_active = TRUE AND (? = '' OR staff_type = ?)
         ORDER BY last_name, first_name, staff_id
         LIMIT ? OFFSET ?`,
        [staffType, staffType, limit, offset],
      ),
    ])
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.get('/payment-sources', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM payment_sources WHERE is_active = TRUE'),
      pool.execute(
        `SELECT payment_source_id, source_name
         FROM payment_sources
         WHERE is_active = TRUE
         ORDER BY source_name, payment_source_id
         LIMIT ? OFFSET ?`,
        [limit, offset],
      ),
    ])
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.get('/dispositions', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM dispositions WHERE is_active = TRUE'),
      pool.execute(
        `SELECT disposition_id, disposition_name
         FROM dispositions
         WHERE is_active = TRUE
         ORDER BY disposition_name, disposition_id
         LIMIT ? OFFSET ?`,
        [limit, offset],
      ),
    ])
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.get('/diagnoses', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM diagnoses'),
      pool.execute(
        `SELECT diagnosis_id, coding_system, diagnosis_code, diagnosis_name
         FROM diagnoses
         ORDER BY diagnosis_name, diagnosis_id
         LIMIT ? OFFSET ?`,
        [limit, offset],
      ),
    ])
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.get('/procedures', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [[countRows], [rows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM procedures'),
      pool.execute(
        `SELECT procedure_id, coding_system, procedure_code, procedure_name
         FROM procedures
         ORDER BY procedure_name, procedure_id
         LIMIT ? OFFSET ?`,
        [limit, offset],
      ),
    ])
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

module.exports = router
