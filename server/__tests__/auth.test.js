import { describe, it, expect, vi } from 'vitest'
import { createAuthService } from '../middleware/auth.js'

describe('createAuthService', () => {
  function createTestAuth(overrides = {}) {
    return createAuthService({
      adminUsername: 'admin',
      adminPassword: 'secret123',
      adminTokenSecret: 'token-secret-key',
      adminTokenTtlSeconds: 3600,
      adminCookieName: 'radio_admin_session',
      adminCookieSecure: 'false',
      adminCookieSameSite: 'Lax',
      adminCookiePath: '/api/admin',
      ...overrides,
    })
  }

  describe('verifyCredentials', () => {
    const authService = createTestAuth()

    it('returns true for correct credentials', () => {
      expect(authService.verifyCredentials('admin', 'secret123')).toBe(true)
    })

    it('returns false for wrong password', () => {
      expect(authService.verifyCredentials('admin', 'wrong')).toBe(false)
    })

    it('returns false for wrong username', () => {
      expect(authService.verifyCredentials('other', 'secret123')).toBe(false)
    })
  })

  describe('createAdminToken / verifyAdminToken', () => {
    const authService = createTestAuth()

    it('creates and verifies a valid token', () => {
      const { token } = authService.createAdminToken()
      const result = authService.verifyAdminToken(token)
      expect(result.ok).toBe(true)
      expect(result.payload.sub).toBe('admin')
      expect(result.payload.role).toBe('admin')
    })

    it('rejects token with wrong signature', () => {
      const { token } = authService.createAdminToken()
      const [payload] = token.split('.')
      const forged = `${payload}.forged-signature`
      const result = authService.verifyAdminToken(forged)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('UNAUTHORIZED')
    })

    it('rejects empty token', () => {
      const result = authService.verifyAdminToken('')
      expect(result.ok).toBe(false)
    })

    it('rejects token without dot', () => {
      const result = authService.verifyAdminToken('nodothere')
      expect(result.ok).toBe(false)
    })
  })

  describe('revokeAdminTokenSignature', () => {
    it('revokes a token so it fails verification', () => {
      const authService = createTestAuth()
      const { token, expiresAt } = authService.createAdminToken()
      const [, signature] = token.split('.')
      authService.revokeAdminTokenSignature(signature, expiresAt)
      const result = authService.verifyAdminToken(token)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('TOKEN_REVOKED')
    })
  })

  describe('requireAdminAuth', () => {
    function mockReq(authHeader, cookie) {
      return {
        headers: {
          ...(authHeader ? { authorization: authHeader } : {}),
          ...(cookie ? { cookie } : {}),
        },
      }
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

    it('calls next with valid Bearer token', () => {
      const authService = createTestAuth()
      const { token } = authService.createAdminToken()
      const next = vi.fn()
      authService.requireAdminAuth(mockReq(`Bearer ${token}`), mockRes(), next)
      expect(next).toHaveBeenCalled()
    })

    it('returns 503 when not configured', () => {
      const unconfigured = createTestAuth({ adminPassword: '', adminTokenSecret: '' })
      const next = vi.fn()
      const res = mockRes()
      unconfigured.requireAdminAuth(mockReq('Bearer abc'), res, next)
      expect(res._status).toBe(503)
    })

    it('returns 401 for invalid token', () => {
      const authService = createTestAuth()
      const next = vi.fn()
      const res = mockRes()
      authService.requireAdminAuth(mockReq('Bearer invalid.token.here'), res, next)
      expect(res._status).toBe(401)
    })
  })
})
