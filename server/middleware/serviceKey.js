import { sendApiError } from './helpers.js'

export function createServiceKeyMiddleware(serviceKey) {
  return (req, res, next) => {
    if (!serviceKey) {
      return sendApiError(res, 503, 'SERVICE_KEY_MISSING', 'SERVICE_KEY is not configured.')
    }

    const authHeader = req.headers['x-service-key']
    const providedKey = Array.isArray(authHeader) ? authHeader[0] : authHeader

    if (providedKey !== serviceKey) {
      sendApiError(res, 401, 'UNAUTHORIZED', 'Unauthorized.')
      return
    }

    next()
  }
}
