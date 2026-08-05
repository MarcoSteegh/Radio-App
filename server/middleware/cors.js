import { sendApiError } from './helpers.js'

export function createCorsMiddleware(allowedCorsOrigins, { allowLocalhostDev = true } = {}) {
  function isLoopbackDevOrigin(origin) {
    if (!allowLocalhostDev) return false
    try {
      const parsed = new URL(origin)
      const isHttp = parsed.protocol === 'http:'
      const isLoopbackHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      return isHttp && isLoopbackHost
    } catch {
      return false
    }
  }

  return (req, res, next) => {
    const origin = req.headers.origin

    if (!origin) {
      if (req.method === 'OPTIONS') {
        res.status(204).end()
        return
      }
      next()
      return
    }

    const isAllowed =
      allowedCorsOrigins.has(String(origin).toLowerCase()) ||
      isLoopbackDevOrigin(String(origin))

    if (!isAllowed) {
      if (req.method === 'OPTIONS') {
        res.status(403).end()
        return
      }
      sendApiError(res, 403, 'FORBIDDEN', 'CORS origin not allowed')
      return
    }

    const ALLOWED_HEADERS = 'Content-Type,Authorization,x-service-key'

    const requestHeaders = req.headers['access-control-request-headers']
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin, Access-Control-Request-Headers')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  }
}
