const jwt = require('jsonwebtoken')
const { jwtSecret } = require('../config/env')
const { AppError } = require('../errors')

function authenticate(request, response, next) {
  const authorization = request.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)

  if (!match) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required'))
  }

  try {
    const payload = jwt.verify(match[1], jwtSecret)
    if (
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string' ||
      !/^\d+$/.test(payload.sub) ||
      !Number.isInteger(payload.roleId) ||
      typeof payload.role !== 'string'
    ) {
      throw new Error('Invalid token claims')
    }

    request.user = {
      userId: payload.sub,
      roleId: payload.roleId,
      role: payload.role,
    }
    return next()
  } catch {
    return next(new AppError(401, 'INVALID_TOKEN', 'Authentication token is invalid or expired'))
  }
}

function authorize(...allowedRoles) {
  return (request, response, next) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'))
    }
    return next()
  }
}

module.exports = { authenticate, authorize }
