import { sendApiError } from './helpers.js'

export function createServiceKeyMiddleware(serviceKey) {
  return (req, res, next) => {
    const authHeader = req.headers['x-service-key']
    const providedKey = Array.isArray(authHeader) ? authHeader[0] : authHeader

    if (!serviceKey) {
      return next()
    }

    if (providedKey !== serviceKey) {
      sendApiError(res, 401, 'UNAUTHORIZED', 'Unauthorized.')
      return
    }

    next()
  }
}
