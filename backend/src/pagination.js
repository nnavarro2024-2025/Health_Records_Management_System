const { AppError } = require('./errors')

function getPagination(query) {
  const page = parsePositiveInteger(query.page, 1, 'page')
  const limit = Math.min(parsePositiveInteger(query.limit, 20, 'limit'), 100)

  if (page > Math.floor(Number.MAX_SAFE_INTEGER / limit)) {
    throw new AppError(400, 'INVALID_PAGINATION', 'Requested page is too large')
  }

  return { page, limit, offset: (page - 1) * limit }
}

function parsePositiveInteger(value, fallback, fieldName) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(400, 'INVALID_PAGINATION', `${fieldName} must be a positive integer`)
  }
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new AppError(400, 'INVALID_PAGINATION', `${fieldName} must be a positive integer`)
  }
  return number
}

function parseOptionalId(value, fieldName) {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AppError(400, 'INVALID_FILTER', `${fieldName} must be a positive integer`)
  }
  return value
}

function parseRequiredId(value, fieldName) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer`)
  }
  const text = String(value)
  if (!/^[1-9]\d*$/.test(text)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer`)
  }
  return text
}

function validateDateFilter(value, fieldName) {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, 'INVALID_DATE', `${fieldName} must use YYYY-MM-DD format`)
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError(400, 'INVALID_DATE', `${fieldName} must be a valid calendar date`)
  }
  return value
}

function paginatedResponse(response, data, page, limit, total) {
  return response.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

module.exports = {
  getPagination,
  parseOptionalId,
  parseRequiredId,
  validateDateFilter,
  paginatedResponse,
}
