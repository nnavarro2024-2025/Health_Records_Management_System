const express = require('express')
const { pool } = require('../db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/summary', authenticate, authorize('Admin', 'Records Officer', 'Physician', 'Nurse'), async (request, response, next) => {
  try {
    const [[summaryRows], [recentActivity], [auditCountRows]] = await Promise.all([
      pool.execute(
        `SELECT
           (SELECT COUNT(*) FROM patients) AS total_patients,
           (SELECT COUNT(*) FROM admissions WHERE status = 'in_progress') AS current_admissions,
           (SELECT COUNT(*) FROM admissions
            WHERE status = 'discharged' AND DATE(discharge_datetime) = CURRENT_DATE) AS discharges_today,
           (SELECT COUNT(*) FROM retention_records
            WHERE review_status = 'pending_review'
              AND review_due_date <= CURRENT_DATE) AS retention_pending`,
      ),
      pool.execute(
        `SELECT al.audit_log_id, al.action_code, al.description, al.occurred_at,
                COALESCE(
                  NULLIF(TRIM(CONCAT_WS(' ', s.credentials, s.first_name, s.middle_name, s.last_name)), ''),
                  u.email,
                  'System'
                ) AS actor_name,
                r.role_name AS role,
                p.patient_id, p.hospital_id,
                CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) AS patient_name
         FROM audit_logs AS al
         LEFT JOIN users AS u ON u.user_id = al.actor_user_id
         LEFT JOIN staff AS s ON s.staff_id = u.staff_id
         LEFT JOIN roles AS r ON r.role_id = al.actor_role_id
         LEFT JOIN patients AS p ON p.patient_id = al.patient_id
         ORDER BY al.occurred_at DESC, al.audit_log_id DESC
         LIMIT ?`,
        [4],
      ),
      pool.execute('SELECT COUNT(*) AS total FROM audit_logs'),
    ])

    const row = summaryRows[0]
    return response.json({
      data: {
        totalPatients: Number(row.total_patients),
        currentAdmissions: Number(row.current_admissions),
        dischargesToday: Number(row.discharges_today),
        retentionPending: Number(row.retention_pending),
        recentActivity,
      },
      pagination: {
        page: 1,
        limit: 4,
        total: Number(auditCountRows[0].total),
        totalPages: Math.ceil(Number(auditCountRows[0].total) / 4),
      },
    })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
