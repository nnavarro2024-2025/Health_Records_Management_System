const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { rateLimit } = require('express-rate-limit')
const { pool, withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { jwtSecret } = require('../config/env')
const { AppError } = require('../errors')

const router = express.Router()
const dummyPasswordHash = bcrypt.hashSync('not-a-real-account-password', 10)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts; try again later' },
  },
  handler: async (request, response, next, options) => {
    try {
      await writeFailedLogin('', null, 'Login failed: rate limit exceeded')
      return response.status(options.statusCode).json(options.message)
    } catch (error) {
      return next(error)
    }
  },
})

router.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''

    if (!email || !password || email.length > 254 || password.length > 1024) {
      await writeFailedLogin(email)
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
    }

    const [rows] = await pool.execute(
      `SELECT u.user_id, u.email, u.password_hash, u.account_status, u.role_id,
              r.role_name, s.first_name, s.middle_name, s.last_name
       FROM users AS u
       INNER JOIN roles AS r ON r.role_id = u.role_id
       LEFT JOIN staff AS s ON s.staff_id = u.staff_id
       WHERE u.email = ?
       LIMIT 1`,
      [email],
    )

    const account = rows[0]
    const passwordMatches = account
      ? await bcrypt.compare(password, account.password_hash)
      : await bcrypt.compare(password, dummyPasswordHash)

    if (!account || !passwordMatches || account.account_status !== 'active') {
      await writeFailedLogin(email, account)
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
    }

    const user = {
      id: String(account.user_id),
      name: [account.first_name, account.middle_name, account.last_name].filter(Boolean).join(' ') || account.email,
      email: account.email,
      role: account.role_name,
    }
    const token = jwt.sign(
      { roleId: account.role_id, role: account.role_name },
      jwtSecret,
      { subject: user.id, expiresIn: '1h' },
    )

    await withTransaction(async (connection) => {
      await connection.execute(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [user.id],
      )
      await writeAudit(
        connection,
        { userId: user.id, roleId: account.role_id },
        null,
        'LOGIN_SUCCESS',
        'User login succeeded',
      )
    })

    return response.json({ token, user })
  } catch (error) {
    return next(error)
  }
})

async function writeFailedLogin(email, account = null, description) {
  await withTransaction(async (connection) => {
    await writeAudit(
      connection,
      account ? { userId: String(account.user_id), roleId: account.role_id } : null,
      null,
      'LOGIN_FAILURE',
      description || (email ? 'User login failed' : 'Login failed: required credentials were not provided'),
    )
  })
}

module.exports = router
