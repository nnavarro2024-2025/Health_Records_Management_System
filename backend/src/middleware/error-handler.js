const { AppError } = require('../errors')

function notFound(request, response, next) {
  next(new AppError(404, 'NOT_FOUND', 'The requested endpoint does not exist'))
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error)
  }

  if (error instanceof AppError) {
    return response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    })
  }

  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON' },
    })
  }

  if (error.type === 'entity.too.large') {
    return response.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
    })
  }

  if (error.code === 'ER_DUP_ENTRY') {
    return response.status(409).json({
      error: { code: 'CONFLICT', message: 'A record with one of these unique values already exists' },
    })
  }

  console.error('Unhandled API error:', error.code || error.name || 'Error')
  return response.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred' },
  })
}

module.exports = { notFound, errorHandler }
