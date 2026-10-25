require('./config/env')

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { pool } = require('./db')
const authRoutes = require('./routes/auth')
const patientRoutes = require('./routes/patients')
const { corsOrigin } = require('./config/env')
const { notFound, errorHandler } = require('./middleware/error-handler')

const app = express()

app.use(helmet())
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}))
app.use(express.json({ limit: '10kb' }))

app.get('/api/health', async (request, response, next) => {
  try {
    await pool.execute('SELECT 1')
    return response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    return next(error)
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/patients', patientRoutes)
app.use(notFound)
app.use(errorHandler)

module.exports = app
