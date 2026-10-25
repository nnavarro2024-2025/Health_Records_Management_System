const express = require('express')
const bcrypt = require('bcryptjs')
const { pool, withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')
const { getPagination, parseRequiredId, paginatedResponse } = require('../pagination')

const router = express.Router()
router.use(authenticate, authorize('Admin'))
const STAFF_TYPE_BY_ROLE = {
  Admin: 'administrator',
  'Records Officer': 'records_officer',
  Physician: 'physician',
  Nurse: 'nurse',
}

router.get('/', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM users')
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.staff_id, u.role_id, u.email, u.account_status,
              u.last_login_at, u.created_at, u.updated_at, r.role_name,
              s.first_name, s.middle_name, s.last_name, s.credentials, s.staff_type, s.license_number
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

router.post('/', async (request, response, next) => {
  try {
    const input = validateCreateUser(request.body)
    const passwordHash = await bcrypt.hash(input.initial_password, 12)
    const user = await withTransaction(async (connection) => {
      const [existing] = await connection.execute('SELECT user_id FROM users WHERE email = ? LIMIT 1', [input.email])
      if (existing[0]) throw new AppError(409, 'EMAIL_IN_USE', 'A user with this email already exists', {
        email: 'A user with this email already exists',
      })
      const [roles] = await connection.execute('SELECT role_id FROM roles WHERE role_name = ? LIMIT 1', [input.role])
      if (!roles[0]) throw new AppError(400, 'VALIDATION_ERROR', 'One or more user fields are invalid', {
        role: 'The selected role does not exist',
      })

      const [staffResult] = await connection.execute(
        `INSERT INTO staff (first_name, middle_name, last_name, credentials, staff_type, license_number)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.first_name, input.middle_name, input.last_name, input.credentials, STAFF_TYPE_BY_ROLE[input.role], input.license_number],
      )
      const [userResult] = await connection.execute(
        `INSERT INTO users (staff_id, role_id, email, password_hash, account_status)
         VALUES (?, ?, ?, ?, 'active')`,
        [staffResult.insertId, roles[0].role_id, input.email, passwordHash],
      )
      await writeAudit(connection, request.user, null, 'USER_CREATED', `Created account ${input.email}`)
      const [rows] = await connection.execute(userSelectSql, [userResult.insertId])
      return rows[0]
    })
    return response.status(201).json({ data: user })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return next(new AppError(409, 'DUPLICATE_USER_DATA', 'Email or staff license number is already in use', {
      email: 'Email or staff license number is already in use',
      license_number: 'Email or staff license number is already in use',
    }))
    return next(error)
  }
})

router.patch('/:id', async (request, response, next) => {
  try {
    const userId = parseRequiredId(request.params.id, 'id')
    const input = validateUserPatch(request.body)
    if (
      String(request.user.userId) === String(userId) &&
      input.account_status !== undefined &&
      input.account_status !== 'active'
    ) {
      throw new AppError(400, 'SELF_DEACTIVATION_DENIED', 'An admin cannot deactivate or lock their own account')
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null
    const user = await withTransaction(async (connection) => {
      const [existing] = await connection.execute('SELECT user_id, staff_id FROM users WHERE user_id = ? FOR UPDATE', [userId])
      if (!existing[0]) throw new AppError(404, 'USER_NOT_FOUND', 'User account was not found')

      if (input.role !== undefined) {
        const [roles] = await connection.execute('SELECT role_id FROM roles WHERE role_name = ? LIMIT 1', [input.role])
        if (!roles[0]) throw new AppError(400, 'VALIDATION_ERROR', 'One or more user fields are invalid', {
          role: 'The selected role does not exist',
        })
        await connection.execute('UPDATE users SET role_id = ? WHERE user_id = ?', [roles[0].role_id, userId])
        await connection.execute(
          'UPDATE staff SET staff_type = ? WHERE staff_id = ?',
          [STAFF_TYPE_BY_ROLE[input.role], existing[0].staff_id],
        )
      }
      if (input.license_number !== undefined) {
        await connection.execute('UPDATE staff SET license_number = ? WHERE staff_id = ?', [input.license_number, existing[0].staff_id])
      }
      if (input.account_status !== undefined) {
        await connection.execute('UPDATE users SET account_status = ? WHERE user_id = ?', [input.account_status, userId])
      }
      if (passwordHash) {
        await connection.execute('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, userId])
      }

      const changes = [
        input.role !== undefined ? 'role' : null,
        input.license_number !== undefined ? 'license number' : null,
        input.account_status !== undefined ? 'account status' : null,
        passwordHash ? 'password reset' : null,
      ].filter(Boolean).join(', ')
      await writeAudit(connection, request.user, null, 'USER_UPDATED', `Updated user ${userId}: ${changes}`)
      const [rows] = await connection.execute(userSelectSql, [userId])
      return rows[0]
    })
    return response.json({ data: user })
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return next(new AppError(409, 'DUPLICATE_USER_DATA', 'The license number is already in use', {
      license_number: 'The license number is already in use',
    }))
    return next(error)
  }
})

const userSelectSql = `SELECT u.user_id, u.staff_id, u.role_id, u.email, u.account_status,
                              u.last_login_at, u.created_at, u.updated_at, r.role_name,
                              s.first_name, s.middle_name, s.last_name, s.credentials, s.staff_type, s.license_number
                       FROM users AS u
                       INNER JOIN roles AS r ON r.role_id = u.role_id
                       LEFT JOIN staff AS s ON s.staff_id = u.staff_id
                       WHERE u.user_id = ? LIMIT 1`

function validateCreateUser(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  for (const field of ['first_name', 'last_name', 'email', 'role', 'initial_password']) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') errors[field] = 'This field is required'
  }
  const role = typeof input.role === 'string' ? input.role.trim() : ''
  if (role && !['Admin', 'Records Officer', 'Physician', 'Nurse'].includes(role)) errors.role = 'Must be an existing role name'
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.email = 'Must be a valid email address'
  if (typeof input.initial_password === 'string' && input.initial_password.length > 0 && input.initial_password.length < 12) {
    errors.initial_password = 'Must be at least 12 characters'
  }
  if (['Physician', 'Nurse'].includes(role) && (typeof input.license_number !== 'string' || !input.license_number.trim())) {
    errors.license_number = 'A license number is required for physicians and nurses'
  }
  if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'One or more user fields are invalid', errors)
  return {
    first_name: input.first_name.trim().slice(0, 80),
    middle_name: typeof input.middle_name === 'string' && input.middle_name.trim() ? input.middle_name.trim().slice(0, 80) : null,
    last_name: input.last_name.trim().slice(0, 80),
    credentials: typeof input.credentials === 'string' && input.credentials.trim() ? input.credentials.trim().slice(0, 80) : null,
    email,
    role,
    license_number: typeof input.license_number === 'string' && input.license_number.trim() ? input.license_number.trim().slice(0, 80) : null,
    initial_password: input.initial_password,
  }
}

function validateUserPatch(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  const result = {}
  if (input.role !== undefined) {
    if (typeof input.role !== 'string' || !['Admin', 'Records Officer', 'Physician', 'Nurse'].includes(input.role.trim())) errors.role = 'Must be an existing role name'
    else result.role = input.role.trim()
  }
  if (input.account_status !== undefined) {
    if (!['active', 'inactive', 'locked'].includes(input.account_status)) errors.account_status = 'Must be active, inactive, or locked'
    else result.account_status = input.account_status
  }
  if (input.license_number !== undefined) {
    if (typeof input.license_number !== 'string' || input.license_number.trim().length > 80) errors.license_number = 'Must be 80 characters or fewer'
    else result.license_number = input.license_number.trim() || null
  }
  if (input.password !== undefined) {
    if (typeof input.password !== 'string' || input.password.length < 12) errors.password = 'Must be at least 12 characters'
    else result.password = input.password
  }
  if (
    ['Physician', 'Nurse'].includes(typeof input.role === 'string' ? input.role.trim() : '') &&
    (typeof input.license_number !== 'string' || !input.license_number.trim())
  ) {
    errors.license_number = 'A license number is required for physicians and nurses'
  }
  if (Object.keys(input).some((key) => !['role', 'account_status', 'password', 'license_number'].includes(key))) {
    errors.body = 'Only role, account status, license number, and password may be changed'
  }
  if (Object.keys(result).length === 0 && Object.keys(errors).length === 0) errors.body = 'At least one change is required'
  if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'One or more user fields are invalid', errors)
  return result
}

module.exports = router
