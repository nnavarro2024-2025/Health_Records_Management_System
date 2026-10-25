const mysql = require('mysql2/promise')
const { db } = require('./config/env')
const { releaseSequentialLocks } = require('./sequential-id')

const pool = mysql.createPool({
  ...db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
})

async function withTransaction(callback) {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('Database transaction rollback failed:', rollbackError.code || rollbackError.name)
    }
    throw error
  } finally {
    if (await releaseSequentialLocks(connection)) connection.release()
  }
}

module.exports = { pool, withTransaction }
