import { sendApiError, getClientIdentifier } from './helpers.js'

export function createRateLimiter({ stateMap, windowMs, maxRequests, errorMessage }) {
  return (req, res, next) => {
    const clientId = getClientIdentifier(req)
    const now = Date.now()
    const current = stateMap.get(clientId) ?? { count: 0, windowStart: now }

    if (now - current.windowStart >= windowMs) {
      current.count = 0
      current.windowStart = now
    }

    current.count += 1
    stateMap.set(clientId, current)

    for (const [key, value] of stateMap.entries()) {
      if (now - value.windowStart >= windowMs) {
        stateMap.delete(key)
      }
    }

    if (current.count > maxRequests) {
      sendApiError(res, 429, 'RATE_LIMITED', errorMessage)
      return
    }

    next()
  }
}
