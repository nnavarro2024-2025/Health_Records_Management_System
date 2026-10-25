const { AppError } = require('./errors')
const heldLocks = new WeakMap()

async function generateSequentialId(connection, table, column, prefix) {
  const allowedColumns = {
    patients: 'hospital_id',
    admissions: 'encounter_number',
  }
  if (allowedColumns[table] !== column) {
    throw new Error('Unsupported sequential identifier target')
  }

  const lockName = `health_records:${column}:${prefix}`
  const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName])
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new AppError(503, 'ID_GENERATION_BUSY', 'Could not reserve the next record number; please retry')
  }

  const locks = heldLocks.get(connection) || []
  locks.push(lockName)
  heldLocks.set(connection, locks)
  try {
    const [rows] = await connection.execute(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(${column}, ?) AS UNSIGNED)), 0) AS last_number
       FROM ${table}
       WHERE ${column} LIKE ?`,
      [prefix.length + 1, `${prefix}%`],
    )
    const nextNumber = Number(rows[0].last_number) + 1
    return `${prefix}${String(nextNumber).padStart(5, '0')}`
  } catch (error) {
    heldLocks.set(connection, locks.filter((name) => name !== lockName))
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName])
    throw error
  }
}

async function releaseSequentialLocks(connection) {
  const locks = heldLocks.get(connection) || []
  heldLocks.delete(connection)
  for (const lockName of locks) {
    try {
      const [rows] = await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName])
      if (Number(rows[0]?.released) !== 1) {
        console.error(`Failed to release sequential ID lock ${lockName}`)
        connection.destroy()
        return false
      }
    } catch (error) {
      console.error('Failed to release sequential ID lock:', error.code || error.name)
      connection.destroy()
      return false
    }
  }
  return true
}

module.exports = { generateSequentialId, releaseSequentialLocks }
