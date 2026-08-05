import 'dotenv/config'
import express from 'express'
import https from 'https'
import http from 'http'
import dns from 'node:dns/promises'
import net from 'node:net'
import { URL } from 'url'
import { isPrivateIp } from '../middleware/helpers.js'

const {
  AUDIO_PROXY_RATE_LIMIT_WINDOW_MS = '60000',
  AUDIO_PROXY_RATE_LIMIT_MAX = '30',
} = process.env

const rateState = new Map()
const RATE_STATE_CLEANUP_INTERVAL_MS = 60_000
let lastCleanupAt = Date.now()

function cleanupRateState() {
  const now = Date.now()
  if (now - lastCleanupAt < RATE_STATE_CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  const windowMs = Number(AUDIO_PROXY_RATE_LIMIT_WINDOW_MS) || 60000
  for (const [ip, entry] of rateState) {
    if (now - entry.start > windowMs * 2) {
      rateState.delete(ip)
    }
  }
}

function enforceRateLimit(req, res, next) {
  cleanupRateState()
  const ip = req.ip
  const now = Date.now()
  const windowMs = Number(AUDIO_PROXY_RATE_LIMIT_WINDOW_MS) || 60000
  const max = Number(AUDIO_PROXY_RATE_LIMIT_MAX) || 30

  const entry = rateState.get(ip)
  if (!entry || now - entry.start > windowMs) {
    rateState.set(ip, { start: now, count: 1 })
    return next()
  }
  entry.count++
  if (entry.count > max) {
    return res.status(429).json({ error: 'Too many audio proxy requests.' })
  }
  next()
}

async function validateAudioTarget(parsed) {
  const hostname = parsed.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, message: 'Localhost targets are not allowed.' }
  }

  const ipFamily = net.isIP(hostname)
  if (ipFamily > 0) {
    if (isPrivateIp(hostname)) {
      return { ok: false, message: 'Private network targets are not allowed.' }
    }
    return { ok: true }
  }

  const resolvedIps = new Set()
  try {
    const ipv4 = await dns.resolve4(hostname)
    for (const ip of ipv4) resolvedIps.add(ip)
  } catch { /* ipv6 may still succeed */ }

  try {
    const ipv6 = await dns.resolve6(hostname)
    for (const ip of ipv6) resolvedIps.add(ip)
  } catch { /* ipv4 may have succeeded */ }

  if (resolvedIps.size === 0) {
    return { ok: false, message: 'Target hostname could not be resolved.' }
  }

  for (const ip of resolvedIps) {
    if (isPrivateIp(ip)) {
      return { ok: false, message: 'Private network targets are not allowed.' }
    }
  }

  return { ok: true }
}

function createAudioProxy() {
  const router = express.Router()

  router.get('/audio-proxy', enforceRateLimit, async (req, res) => {
    const streamUrl = req.query.url
    if (!streamUrl || typeof streamUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter.' })
    }

    let parsed
    try {
      parsed = new URL(streamUrl)
    } catch {
      return res.status(400).json({ error: 'Invalid URL.' })
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs allowed.' })
    }

    const validation = await validateAudioTarget(parsed)
    if (!validation.ok) {
      return res.status(403).json({ error: validation.message })
    }

    const client = parsed.protocol === 'https:' ? https : http

    const proxyReq = client.get(
      streamUrl,
      {
        headers: {
          'User-Agent': 'WorldRadioExplorer/1.0',
          'Icy-MetaData': '1',
        },
        timeout: 10000,
      },
      (proxyRes) => {
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          let redirectUrl
          try {
            redirectUrl = new URL(proxyRes.headers.location, streamUrl)
          } catch {
            return res.status(502).json({ error: 'Invalid redirect.' })
          }
          const redirectClient = redirectUrl.protocol === 'https:' ? https : http
          const redirectReq = redirectClient.get(
            redirectUrl.href,
            {
              headers: {
                'User-Agent': 'WorldRadioExplorer/1.0',
                'Icy-MetaData': '1',
              },
              timeout: 10000,
            },
            (redirectRes) => {
              forwardStream(redirectRes, res)
            },
          )
          redirectReq.on('error', (err) => {
            if (!res.headersSent) {
              res.status(502).json({ error: 'Redirect fetch failed.' })
            }
          })
          req.on('close', () => redirectReq.destroy())
          return
        }

        forwardStream(proxyRes, res)
      },
    )

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Upstream fetch failed.' })
      }
    })

    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      if (!res.headersSent) {
        res.status(504).json({ error: 'Upstream timeout.' })
      }
    })

    req.on('close', () => {
      proxyReq.destroy()
    })
  })

  return router
}

function forwardStream(proxyRes, res) {
  const contentType = proxyRes.headers['content-type'] || 'audio/mpeg'
  const icyName = proxyRes.headers['icy-name']
  const icyBr = proxyRes.headers['icy-br']
  const icyGenre = proxyRes.headers['icy-genre']

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Transfer-Encoding': 'chunked',
    ...(icyName ? { 'X-Icy-Name': icyName } : {}),
    ...(icyBr ? { 'X-Icy-Br': icyBr } : {}),
    ...(icyGenre ? { 'X-Icy-Genre': icyGenre } : {}),
  })

  proxyRes.pipe(res)
}

export { createAudioProxy }
