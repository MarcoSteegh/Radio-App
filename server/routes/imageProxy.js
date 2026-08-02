import dns from 'node:dns/promises'
import net from 'node:net'
import { sendApiError, normalizeText, isPrivateIp } from '../middleware/helpers.js'

const IMAGE_PROXY_BLOCK_LOG_TTL_MS = 60000

export function createImageProxy({
  imageProxyCache,
  imageProxyBlockedLogState,
  imageProxyAllowedHosts,
  cacheTtlMs,
  cacheMaxItems,
}) {
  function logBlockedImageProxyTarget(targetUrl, code) {
    const key = `${String(code)}|${targetUrl.toString()}`
    const now = Date.now()
    const lastLoggedAt = imageProxyBlockedLogState.get(key) ?? 0

    if (now - lastLoggedAt < IMAGE_PROXY_BLOCK_LOG_TTL_MS) {
      return
    }

    imageProxyBlockedLogState.set(key, now)
    console.warn(`[image-proxy] blocked target: ${targetUrl.toString()} (${code})`)

    if (imageProxyBlockedLogState.size > 5000) {
      for (const [entryKey, timestamp] of imageProxyBlockedLogState.entries()) {
        if (now - timestamp > IMAGE_PROXY_BLOCK_LOG_TTL_MS * 5) {
          imageProxyBlockedLogState.delete(entryKey)
        }
      }
    }
  }

  function isHostAllowedByAllowlist(hostname) {
    if (imageProxyAllowedHosts.length === 0) {
      return true
    }

    const lowerHost = hostname.toLowerCase()
    for (const pattern of imageProxyAllowedHosts) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1)
        if (lowerHost.endsWith(suffix)) {
          return true
        }
        continue
      }

      if (lowerHost === pattern) {
        return true
      }
    }

    return false
  }

  async function validateImageProxyTarget(targetUrl) {
    const hostname = targetUrl.hostname.toLowerCase()

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return { ok: false, code: 'TARGET_FORBIDDEN', message: 'Localhost targets are not allowed.' }
    }

    if (!isHostAllowedByAllowlist(hostname)) {
      return { ok: false, code: 'TARGET_FORBIDDEN', message: 'Target hostname is not allowed.' }
    }

    const ipFamily = net.isIP(hostname)
    if (ipFamily > 0) {
      if (isPrivateIp(hostname)) {
        return { ok: false, code: 'TARGET_FORBIDDEN', message: 'Private network targets are not allowed.' }
      }
      return { ok: true }
    }

    const resolvedIps = new Set()
    try {
      const ipv4 = await dns.resolve4(hostname)
      for (const ip of ipv4) resolvedIps.add(ip)
    } catch {
      // Ignore; IPv6 resolve may still succeed.
    }

    try {
      const ipv6 = await dns.resolve6(hostname)
      for (const ip of ipv6) resolvedIps.add(ip)
    } catch {
      // Ignore; IPv4 resolve may have succeeded.
    }

    if (resolvedIps.size === 0) {
      return { ok: false, code: 'TARGET_UNRESOLVED', message: 'Target hostname could not be resolved.' }
    }

    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        return { ok: false, code: 'TARGET_FORBIDDEN', message: 'Private network targets are not allowed.' }
      }
    }

    return { ok: true }
  }

  function evictExpiredImageCache(now) {
    for (const [key, value] of imageProxyCache.entries()) {
      if (value.expiresAt <= now) {
        imageProxyCache.delete(key)
      }
    }
  }

  function enforceImageCacheLimit(maxItems) {
    if (imageProxyCache.size <= maxItems) {
      return
    }

    const entries = Array.from(imageProxyCache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)

    while (imageProxyCache.size > maxItems && entries.length > 0) {
      const next = entries.shift()
      if (!next) {
        break
      }
      imageProxyCache.delete(next[0])
    }
  }

  async function handleImageProxy(req, res) {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : ''
    if (!rawUrl) {
      sendApiError(res, 400, 'INVALID_QUERY', 'url query param is required.')
      return
    }

    let targetUrl
    try {
      targetUrl = new URL(rawUrl)
    } catch {
      sendApiError(res, 400, 'INVALID_QUERY', 'url must be a valid absolute URL.')
      return
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      sendApiError(res, 400, 'INVALID_QUERY', 'Only http and https protocols are allowed.')
      return
    }

    const targetValidation = await validateImageProxyTarget(targetUrl)
    if (!targetValidation.ok) {
      logBlockedImageProxyTarget(targetUrl, targetValidation.code)
      sendApiError(res, 403, targetValidation.code, targetValidation.message)
      return
    }

    const now = Date.now()

    evictExpiredImageCache(now)

    const cachedImage = imageProxyCache.get(targetUrl.toString())
    if (cachedImage && cachedImage.expiresAt > now) {
      res.setHeader('Content-Type', cachedImage.contentType)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('X-Image-Cache', 'HIT')
      res.status(200).send(cachedImage.buffer)
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 7000)

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'WorldRadioExplorer/1.0',
        },
      })

      if (!response.ok) {
        sendApiError(res, 502, 'UPSTREAM_ERROR', `Image upstream responded with ${response.status}.`)
        return
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.toLowerCase().startsWith('image/')) {
        sendApiError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Upstream resource is not an image.')
        return
      }

      const contentLength = Number(response.headers.get('content-length') ?? '0')
      if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024) {
        sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Image is too large.')
        return
      }

      const body = await response.arrayBuffer()
      const buffer = Buffer.from(body)

      imageProxyCache.set(targetUrl.toString(), {
        buffer,
        contentType,
        cachedAt: now,
        expiresAt: now + cacheTtlMs,
      })
      enforceImageCacheLimit(cacheMaxItems)

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('X-Image-Cache', 'MISS')
      res.status(200).send(buffer)
    } catch {
      sendApiError(res, 502, 'UPSTREAM_ERROR', 'Failed to fetch image from upstream.')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return { handleImageProxy, validateImageProxyTarget }
}
