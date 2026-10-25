const express = require('express')
const { pool } = require('../db')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')
const {
  getPagination,
  parseOptionalId,
  validateDateFilter,
  paginatedResponse,
} = require('../pagination')

const router = express.Router()
router.use(authenticate, authorize('Admin', 'Records Officer'))

router.get('/', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const action = typeof request.query.action === 'string' ? request.query.action.trim() : ''
    if (action.length > 64) {
      throw new AppError(400, 'INVALID_FILTER', 'action must be 64 characters or fewer')
    }

    const dateFrom = validateDateFilter(request.query.dateFrom, 'dateFrom')
    const dateTo = validateDateFilter(request.query.dateTo, 'dateTo')
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'dateFrom must be on or before dateTo')
    }

    const patientId = parseOptionalId(request.query.patient, 'patient')
    const userId = parseOptionalId(request.query.user, 'user')
    const parameters = [action, action, dateFrom, dateFrom, dateTo, dateTo, patientId, patientId, userId, userId]
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM audit_logs AS al
       WHERE (? = '' OR al.action_code = ?)
         AND (? IS NULL OR al.occurred_at >= ?)
         AND (? IS NULL OR al.occurred_at < DATE_ADD(?, INTERVAL 1 DAY))
         AND (? IS NULL OR al.patient_id = ?)
         AND (? IS NULL OR al.actor_user_id = ?)`,
      parameters,
    )
    const [rows] = await pool.execute(
      `SELECT al.audit_log_id, al.actor_user_id, al.actor_role_id, al.patient_id,
              al.action_code, al.description, al.occurred_at,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', s.credentials, s.first_name, s.middle_name, s.last_name)), ''),
                u.email,
                'System'
              ) AS actor_name,
              r.role_name AS role,
              p.hospital_id,
              CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) AS patient_name
       FROM audit_logs AS al
       LEFT JOIN users AS u ON u.user_id = al.actor_user_id
       LEFT JOIN staff AS s ON s.staff_id = u.staff_id
       LEFT JOIN roles AS r ON r.role_id = al.actor_role_id
       LEFT JOIN patients AS p ON p.patient_id = al.patient_id
       WHERE (? = '' OR al.action_code = ?)
         AND (? IS NULL OR al.occurred_at >= ?)
         AND (? IS NULL OR al.occurred_at < DATE_ADD(?, INTERVAL 1 DAY))
         AND (? IS NULL OR al.patient_id = ?)
         AND (? IS NULL OR al.actor_user_id = ?)
       ORDER BY al.occurred_at DESC, al.audit_log_id DESC
       LIMIT ? OFFSET ?`,
      [...parameters, limit, offset],
    )

    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

module.exports = router
