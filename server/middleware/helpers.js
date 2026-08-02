import net from 'node:net'

export function sendApiError(res, status, code, message) {
  res.status(status).json({ code, message })
}

export function parseOffset(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.floor(numeric))
}

export function parseLimit(value, fallback, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(Math.floor(numeric), 1), max)
}

export function normalizeText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export function getClientIdentifier(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.ip ?? 'unknown'
}

export function parseCookies(req) {
  const raw = req.headers.cookie
  if (typeof raw !== 'string' || !raw.trim()) {
    return {}
  }

  return raw.split(';').reduce((acc, part) => {
    const [rawName, ...rawValueParts] = part.split('=')
    const name = String(rawName ?? '').trim()
    if (!name) {
      return acc
    }

    const value = rawValueParts.join('=')
    acc[name] = decodeURIComponent(value ?? '')
    return acc
  }, {})
}

export function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  if (parts[0] === 0) return true
  return false
}

export function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true
  }
  return false
}

export function isPrivateIp(ip) {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIpv4(ip)
  if (family === 6) return isPrivateIpv6(ip)
  return false
}
