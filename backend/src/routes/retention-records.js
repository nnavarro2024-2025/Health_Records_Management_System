const express = require('express')
const { pool, withTransaction } = require('../db')
const { writeAudit } = require('../audit')
const { authenticate, authorize } = require('../middleware/auth')
const { AppError } = require('../errors')
const {
  getPagination,
  parseRequiredId,
  paginatedResponse,
} = require('../pagination')

const router = express.Router()
router.use(authenticate, authorize('Admin'))

router.get('/', async (request, response, next) => {
  try {
    const { page, limit, offset } = getPagination(request.query)
    const reviewStatus = typeof request.query.status === 'string' ? request.query.status.trim() : 'pending_review'
    const allowedStatuses = ['', 'pending_review', 'approved_for_disposal', 'retain', 'disposed']
    if (!allowedStatuses.includes(reviewStatus)) {
      throw new AppError(400, 'INVALID_STATUS', 'Retention status filter is not supported')
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM retention_records AS rr
       WHERE (? = '' OR rr.review_status = ?)
         AND (? = 0 OR rr.review_due_date <= CURRENT_DATE)`,
      [reviewStatus, reviewStatus, reviewStatus === 'pending_review' ? 1 : 0],
    )
    const [rows] = await pool.execute(
      `SELECT rr.retention_record_id, rr.admission_id, rr.retention_category_id,
              rr.review_due_date, rr.review_status, rr.reviewed_by_user_id,
              rr.reviewed_at, rr.review_notes, rc.category_name, rc.retention_years,
              a.encounter_number, a.discharge_datetime, a.patient_id, p.hospital_id,
              CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name) AS patient_name,
              reviewer.email AS reviewed_by_email
       FROM retention_records AS rr
       INNER JOIN retention_categories AS rc ON rc.retention_category_id = rr.retention_category_id
       INNER JOIN admissions AS a ON a.admission_id = rr.admission_id
       INNER JOIN patients AS p ON p.patient_id = a.patient_id
       LEFT JOIN users AS reviewer ON reviewer.user_id = rr.reviewed_by_user_id
       WHERE (? = '' OR rr.review_status = ?)
         AND (? = 0 OR rr.review_due_date <= CURRENT_DATE)
       ORDER BY rr.review_due_date, rr.retention_record_id
       LIMIT ? OFFSET ?`,
      [reviewStatus, reviewStatus, reviewStatus === 'pending_review' ? 1 : 0, limit, offset],
    )

    return paginatedResponse(response, rows, page, limit, Number(countRows[0].total))
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/review', async (request, response, next) => {
  try {
    const retentionRecordId = parseRequiredId(request.params.id, 'id')
    const decision = request.body?.decision
    const reviewStatus = decision === 'approve_for_disposal'
      ? 'approved_for_disposal'
      : decision === 'retain'
        ? 'retain'
        : null

    if (!reviewStatus) {
      throw new AppError(400, 'VALIDATION_ERROR', 'decision must be approve_for_disposal or retain')
    }

    const updated = await withTransaction(async (connection) => {
      const [records] = await connection.execute(
        `SELECT rr.retention_record_id, rr.admission_id, rr.review_status,
                a.patient_id, p.hospital_id
         FROM retention_records AS rr
         INNER JOIN admissions AS a ON a.admission_id = rr.admission_id
         INNER JOIN patients AS p ON p.patient_id = a.patient_id
         WHERE rr.retention_record_id = ?
         FOR UPDATE`,
        [retentionRecordId],
      )
      const record = records[0]
      if (!record) {
        throw new AppError(404, 'RETENTION_RECORD_NOT_FOUND', 'Retention record was not found')
      }
      if (record.review_status !== 'pending_review') {
        throw new AppError(409, 'RETENTION_ALREADY_REVIEWED', 'Retention record has already been reviewed')
      }

      await connection.execute(
        `UPDATE retention_records
         SET review_status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE retention_record_id = ?`,
        [reviewStatus, request.user.userId, retentionRecordId],
      )
      await writeAudit(
        connection,
        request.user,
        record.patient_id,
        reviewStatus === 'retain' ? 'RETENTION_RETAINED' : 'RETENTION_DISPOSAL_APPROVED',
        `Retention review recorded for encounter ${record.admission_id}`,
      )

      const [updatedRows] = await connection.execute(
        `SELECT retention_record_id, admission_id, retention_category_id, review_due_date,
                review_status, reviewed_by_user_id, reviewed_at, review_notes
         FROM retention_records
         WHERE retention_record_id = ?
         LIMIT 1`,
        [retentionRecordId],
      )
      return updatedRows[0]
    })

    return response.json({ data: updated })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
