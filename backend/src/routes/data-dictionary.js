const express = require('express')
const { pool } = require('../db')
const { authenticate, authorize } = require('../middleware/auth')
const { getPagination, paginatedResponse } = require('../pagination')

const router = express.Router()
router.use(authenticate, authorize('Admin', 'Records Officer'))

router.get('/', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM data_dictionary')
    const [rows] = await pool.execute(
      `SELECT data_dictionary_id, table_name, column_name, description, data_type, field_length
       FROM data_dictionary
       ORDER BY table_name, column_name
       LIMIT ? OFFSET ?`,
      [limit, offset],
    )
    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

module.exports = router
