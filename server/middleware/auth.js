import crypto from 'node:crypto'
import { sendApiError, normalizeText, parseCookies } from './helpers.js'

export function createAuthService({
  adminUsername,
  adminPassword,
  adminTokenSecret,
  adminTokenTtlSeconds,
  adminCookieName,
  adminCookieSecure,
  adminCookieSameSite,
  adminCookiePath,
}) {
  const revokedAdminTokens = new Map()

  function cleanupRevokedAdminTokens(now) {
    for (const [signature, expiresAt] of revokedAdminTokens.entries()) {
      if (expiresAt <= now) {
        revokedAdminTokens.delete(signature)
      }
    }
  }

  function toBase64Url(input) {
    return Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  function createAdminToken() {
    const ttlSeconds = Math.max(300, Number(adminTokenTtlSeconds) || 28800)
    const expiresAt = Date.now() + ttlSeconds * 1000
    const payload = {
      sub: adminUsername,
      role: 'admin',
      exp: expiresAt,
    }

    const payloadEncoded = toBase64Url(JSON.stringify(payload))
    const signature = crypto
      .createHmac('sha256', adminTokenSecret)
      .update(payloadEncoded)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

    return {
      token: `${payloadEncoded}.${signature}`,
      expiresAt,
    }
  }

  function verifyAdminToken(token) {
    if (!token || !token.includes('.')) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Missing or invalid token.' }
    }

    const [payloadEncoded, signature] = token.split('.')
    if (!payloadEncoded || !signature) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Missing or invalid token.' }
    }

    const expected = crypto
      .createHmac('sha256', adminTokenSecret)
      .update(payloadEncoded)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

    const expectedBytes = Buffer.from(expected)
    const signatureBytes = Buffer.from(signature)
    if (expectedBytes.length !== signatureBytes.length || !crypto.timingSafeEqual(expectedBytes, signatureBytes)) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid token signature.' }
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'))
      if (payload.sub !== adminUsername || payload.role !== 'admin') {
        return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid token payload.' }
      }

      const expiresAt = Number(payload.exp)
      if (!payload.exp || Date.now() > expiresAt) {
        return { ok: false, code: 'TOKEN_EXPIRED', message: 'Admin token expired.' }
      }

      cleanupRevokedAdminTokens(Date.now())
      if (revokedAdminTokens.has(signature)) {
        return { ok: false, code: 'TOKEN_REVOKED', message: 'Admin token has been revoked.' }
      }

      return { ok: true, payload, signature, expiresAt }
    } catch {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid token payload.' }
    }
  }

  function revokeAdminTokenSignature(signature, expiresAt) {
    if (!signature || !Number.isFinite(expiresAt)) {
      return
    }
    revokedAdminTokens.set(signature, expiresAt)
    cleanupRevokedAdminTokens(Date.now())
  }

  function setAdminSessionCookie(res, token, expiresAt) {
    const ttlSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000))
    const sameSite = ['Strict', 'Lax', 'None'].includes(adminCookieSameSite) ? adminCookieSameSite : 'Lax'
    const secure = String(adminCookieSecure).toLowerCase() === 'true'

    const parts = [
      `${adminCookieName}=${encodeURIComponent(token)}`,
      `Path=${adminCookiePath}`,
      'HttpOnly',
      `SameSite=${sameSite}`,
      `Max-Age=${ttlSeconds}`,
    ]

    if (secure) {
      parts.push('Secure')
    }

    res.setHeader('Set-Cookie', parts.join('; '))
  }

  function clearAdminSessionCookie(res) {
    const sameSite = ['Strict', 'Lax', 'None'].includes(adminCookieSameSite) ? adminCookieSameSite : 'Lax'
    const secure = String(adminCookieSecure).toLowerCase() === 'true'
    const parts = [
      `${adminCookieName}=`,
      `Path=${adminCookiePath}`,
      'HttpOnly',
      `SameSite=${sameSite}`,
      'Max-Age=0',
    ]

    if (secure) {
      parts.push('Secure')
    }

    res.setHeader('Set-Cookie', parts.join('; '))
  }

  function requireAdminAuth(req, res, next) {
    if (!adminPassword || !adminTokenSecret) {
      sendApiError(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Admin auth is not configured on this server.')
      return
    }

    const authHeader = req.headers.authorization
    const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : ''
    const cookies = parseCookies(req)
    const cookieToken = normalizeText(cookies[adminCookieName], 2000)
    const token = bearerToken || cookieToken

    const verification = verifyAdminToken(token)
    if (!verification.ok) {
      sendApiError(res, 401, verification.code, verification.message)
      return
    }

    req.adminAuth = {
      token,
      signature: verification.signature,
      expiresAt: verification.expiresAt,
      payload: verification.payload,
    }

    next()
  }

  function verifyCredentials(username, password) {
    const usernameBuf = Buffer.from(username)
    const adminUsernameBuf = Buffer.from(adminUsername)
    const passwordBuf = Buffer.from(password)
    const adminPasswordBuf = Buffer.from(adminPassword)

    const usernameMatch = usernameBuf.length === adminUsernameBuf.length &&
      crypto.timingSafeEqual(usernameBuf, adminUsernameBuf)
    const passwordMatch = passwordBuf.length === adminPasswordBuf.length &&
      crypto.timingSafeEqual(passwordBuf, adminPasswordBuf)

    return usernameMatch && passwordMatch
  }

  return {
    createAdminToken,
    verifyAdminToken,
    revokeAdminTokenSignature,
    setAdminSessionCookie,
    clearAdminSessionCookie,
    requireAdminAuth,
    verifyCredentials,
    isConfigured: () => Boolean(adminPassword && adminTokenSecret),
  }
}
