const mysql = require('mysql2/promise')
const { db } = require('./config/env')

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
    connection.release()
  }
}

module.exports = { pool, withTransaction }
