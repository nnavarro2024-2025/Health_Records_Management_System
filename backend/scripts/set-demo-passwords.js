require('../src/config/env')

const bcrypt = require('bcrypt')
const { pool, withTransaction } = require('../src/db')

const demoPassword = 'Demo@2026'
const seededEmails = [
  'juan.perez@hsc.org.ph',
  'mila.cruz@hsc.org.ph',
  'rafael.lim@hsc.org.ph',
  'ana.navarro@hsc.org.ph',
]

async function setDemoPasswords() {
  try {
    const [users] = await pool.execute(
      `SELECT u.user_id, u.email, r.role_name
       FROM users AS u
       INNER JOIN roles AS r ON r.role_id = u.role_id
       WHERE u.email IN (?, ?, ?, ?)
       ORDER BY u.user_id`,
      seededEmails,
    )

    if (users.length === 0) {
      throw new Error('No users found. Import database/seed.sql before running this script.')
    }
    if (users.length !== seededEmails.length) {
      throw new Error('Not all seeded users were found. Re-import database/seed.sql before continuing.')
    }

    const usersWithHashes = await Promise.all(
      users.map(async (user) => ({
        ...user,
        passwordHash: await bcrypt.hash(demoPassword, 12),
      })),
    )

    await withTransaction(async (connection) => {
      for (const user of usersWithHashes) {
        await connection.execute(
          'UPDATE users SET password_hash = ? WHERE user_id = ?',
          [user.passwordHash, user.user_id],
        )
      }
    })

    console.log(`Demo password set for ${users.length} user(s).`)
    console.log(`Password: ${demoPassword}`)
    console.log('Accounts:')
    for (const user of users) {
      console.log(`- ${user.email} (${user.role_name})`)
    }
  } finally {
    await pool.end()
  }
}

setDemoPasswords().catch((error) => {
  console.error('Could not set demo passwords:', error.message)
  process.exitCode = 1
})
