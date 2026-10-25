const express = require('express')
const { pool } = require('../db')
const { authenticate, authorize } = require('../middleware/auth')
const { getPagination, paginatedResponse } = require('../pagination')

const router = express.Router()
router.use(authenticate, authorize('Admin'))

router.get('/', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM users')
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.staff_id, u.role_id, u.email, u.account_status,
              u.last_login_at, u.created_at, u.updated_at, r.role_name,
              s.first_name, s.middle_name, s.last_name, s.credentials, s.staff_type
       FROM users AS u
       INNER JOIN roles AS r ON r.role_id = u.role_id
       LEFT JOIN staff AS s ON s.staff_id = u.staff_id
       ORDER BY s.last_name, s.first_name, u.email
       LIMIT ? OFFSET ?`,
      [limit, offset],
    )
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

module.exports = router
