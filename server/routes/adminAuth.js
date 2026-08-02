import { sendApiError, normalizeText, parseCookies } from '../middleware/helpers.js'

export function createAdminAuthRoutes(authService) {
  async function login(req, res) {
    if (!authService.isConfigured()) {
      sendApiError(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Admin auth is not configured on this server.')
      return
    }

    const body = req.body ?? {}
    const username = normalizeText(body.username, 120)
    const password = normalizeText(body.password, 200)

    if (!username || !password) {
      sendApiError(res, 400, 'INVALID_PAYLOAD', 'username and password are required.')
      return
    }

    if (!authService.verifyCredentials(username, password)) {
      sendApiError(res, 401, 'UNAUTHORIZED', 'Invalid admin credentials.')
      return
    }

    const token = authService.createAdminToken()
    authService.setAdminSessionCookie(res, token.token, token.expiresAt)
    res.json({ authenticated: true, expiresAt: token.expiresAt })
  }

  function authStatus(req, res) {
    if (!authService.isConfigured()) {
      res.json({ authenticated: false, reason: 'ADMIN_AUTH_NOT_CONFIGURED' })
      return
    }

    const verification = authService.verifyAdminToken(req.adminAuth?.token ?? '')
    if (!verification.ok) {
      res.json({ authenticated: false, reason: verification.code })
      return
    }

    res.json({ authenticated: true, expiresAt: verification.expiresAt })
  }

  function refresh(req, res) {
    const { signature, expiresAt } = req.adminAuth ?? {}
    authService.revokeAdminTokenSignature(signature, expiresAt)

    const nextToken = authService.createAdminToken()
    authService.setAdminSessionCookie(res, nextToken.token, nextToken.expiresAt)
    res.json({ authenticated: true, expiresAt: nextToken.expiresAt })
  }

  function logout(req, res) {
    const { signature, expiresAt } = req.adminAuth ?? {}
    authService.revokeAdminTokenSignature(signature, expiresAt)
    authService.clearAdminSessionCookie(res)

    res.json({ ok: true })
  }

  function authStatusUnprotected(req, res) {
    if (!authService.isConfigured()) {
      res.json({ authenticated: false, reason: 'ADMIN_AUTH_NOT_CONFIGURED' })
      return
    }

    const allCookies = parseCookies(req)
    const cookieToken = normalizeText(allCookies['radio_admin_session'], 2000)
    const verification = authService.verifyAdminToken(cookieToken)

    if (!verification.ok) {
      res.json({ authenticated: false, reason: verification.code })
      return
    }

    res.json({ authenticated: true, expiresAt: verification.expiresAt })
  }

  return {
    login,
    authStatus,
    authStatusUnprotected,
    refresh,
    logout,
  }
}
