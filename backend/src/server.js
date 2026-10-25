const app = require('./app')
const { pool } = require('./db')
const { port } = require('./config/env')

const server = app.listen(port, () => {
  console.log(`Health Records API listening on http://localhost:${port}`)
})

async function shutdown(signal) {
  console.log(`${signal} received; shutting down API`)
  server.close(async (serverError) => {
    try {
      await pool.end()
      if (serverError) {
        console.error('HTTP server shutdown failed:', serverError.message)
        process.exitCode = 1
      }
    } catch (error) {
      console.error('Database pool shutdown failed:', error.code || error.name)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
