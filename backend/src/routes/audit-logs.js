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

router.get('/actions', async (request, response, next) => {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT action_code FROM audit_logs ORDER BY action_code')
    return response.json({ data: rows.map((row) => row.action_code) })
  } catch (error) {
    return next(error)
  }
})

router.get('/', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const action = typeof request.query.action === 'string' ? request.query.action.trim() : ''
    if (action.length > 64) throw new AppError(400, 'INVALID_FILTER', 'action must be 64 characters or fewer')
    const dateFrom = validateDateFilter(request.query.dateFrom, 'dateFrom')
    const dateTo = validateDateFilter(request.query.dateTo, 'dateTo')
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'dateFrom must be on or before dateTo')
    }
    const patientId = parseOptionalId(request.query.patient, 'patient')
    const userId = parseOptionalId(request.query.user, 'user')
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (q.length > 100) throw new AppError(400, 'INVALID_FILTER', 'q must be 100 characters or fewer')

    const searchPattern = `%${q}%`
    const joins = `FROM audit_logs AS al
      LEFT JOIN users AS u ON u.user_id = al.actor_user_id
      LEFT JOIN staff AS s ON s.staff_id = u.staff_id
      LEFT JOIN roles AS r ON r.role_id = al.actor_role_id
      LEFT JOIN patients AS p ON p.patient_id = al.patient_id`
    const where = `WHERE (? = '' OR al.action_code = ?)
      AND (? IS NULL OR al.occurred_at >= ?)
      AND (? IS NULL OR al.occurred_at < DATE_ADD(?, INTERVAL 1 DAY))
      AND (? IS NULL OR al.patient_id = ?)
      AND (? IS NULL OR al.actor_user_id = ?)
      AND (? = '' OR COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', s.credentials, s.first_name, s.middle_name, s.last_name)), ''),
        u.email, 'System') LIKE ?
        OR CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) LIKE ?
        OR p.hospital_id LIKE ?)`
    const parameters = [
      action, action, dateFrom, dateFrom, dateTo, dateTo,
      patientId, patientId, userId, userId, q,
      searchPattern, searchPattern, searchPattern,
    ]
    const [[countRows], [rows]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total ${joins} ${where}`, parameters),
      pool.execute(
        `SELECT al.audit_log_id, al.actor_user_id, al.actor_role_id, al.patient_id,
                al.action_code, al.description, al.occurred_at,
                COALESCE(
                  NULLIF(TRIM(CONCAT_WS(' ', s.credentials, s.first_name, s.middle_name, s.last_name)), ''),
                  u.email, 'System'
                ) AS actor_name,
                r.role_name AS role,
                p.hospital_id,
                CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) AS patient_name
         ${joins} ${where}
         ORDER BY al.occurred_at DESC, al.audit_log_id DESC
         LIMIT ? OFFSET ?`,
        [...parameters, limit, offset],
      ),
    ])
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

module.exports = router
