async function writeAudit(connection, actor, patientId, actionCode, description) {
  await connection.execute(
    `INSERT INTO audit_logs
      (actor_user_id, actor_role_id, patient_id, action_code, description, occurred_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [actor?.userId ?? null, actor?.roleId ?? null, patientId ?? null, actionCode, description],
  )
}

module.exports = { writeAudit }
