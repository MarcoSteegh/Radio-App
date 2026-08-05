import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter } from '../middleware/rateLimit.js'

describe('createRateLimiter', () => {
  function mockReq(ip = '127.0.0.1', headers = {}) {
    return { ip, headers }
  }

  function mockRes() {
    const res = {
      _status: 0,
      _body: null,
      status(s) { res._status = s; return res },
      json(b) { res._body = b; return res },
    }
    return res
  }

  it('calls next when under limit', () => {
    const stateMap = new Map()
    const middleware = createRateLimiter({ stateMap, windowMs: 60000, maxRequests: 5, errorMessage: 'rate limited' })
    const next = vi.fn()
    middleware(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 429 when over limit', () => {
    const stateMap = new Map()
    const middleware = createRateLimiter({ stateMap, windowMs: 60000, maxRequests: 2, errorMessage: 'too many' })
    const next = vi.fn()
    middleware(mockReq(), mockRes(), next)
    middleware(mockReq(), mockRes(), next)
    const res = mockRes()
    middleware(mockReq(), res, next)
    expect(res._status).toBe(429)
    expect(res._body).toEqual({ code: 'RATE_LIMITED', message: 'too many' })
  })

  it('resets after window expires', () => {
    const stateMap = new Map()
    const middleware = createRateLimiter({ stateMap, windowMs: 100, maxRequests: 1, errorMessage: 'rate limited' })
    const next = vi.fn()
    middleware(mockReq(), mockRes(), next)
    const res = mockRes()
    middleware(mockReq(), res, next)
    expect(res._status).toBe(429)

    // Advance time past window
    const entry = stateMap.get('127.0.0.1')
    entry.windowStart = Date.now() - 200

    const next2 = vi.fn()
    middleware(mockReq(), mockRes(), next2)
    expect(next2).toHaveBeenCalled()
  })
})
