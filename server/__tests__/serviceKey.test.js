import { describe, it, expect, vi } from 'vitest'
import { createServiceKeyMiddleware } from '../middleware/serviceKey.js'

describe('createServiceKeyMiddleware', () => {
  function mockReq(key) {
    return { headers: key ? { 'x-service-key': key } : {} }
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

  it('returns 503 when service key is not configured', () => {
    const middleware = createServiceKeyMiddleware('')
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq('secret'), res, next)
    expect(res._status).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when key does not match', () => {
    const middleware = createServiceKeyMiddleware('correct-key')
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq('wrong-key'), res, next)
    expect(res._status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when key is missing', () => {
    const middleware = createServiceKeyMiddleware('correct-key')
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq(null), res, next)
    expect(res._status).toBe(401)
  })

  it('calls next when key matches', () => {
    const middleware = createServiceKeyMiddleware('correct-key')
    const next = vi.fn()
    middleware(mockReq('correct-key'), mockRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('handles array header', () => {
    const middleware = createServiceKeyMiddleware('correct-key')
    const next = vi.fn()
    middleware({ headers: { 'x-service-key': ['correct-key'] } }, mockRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })
})
