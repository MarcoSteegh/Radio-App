import 'dotenv/config'
import express from 'express'
import https from 'https'
import http from 'http'
import { URL } from 'url'

const {
  AUDIO_PROXY_RATE_LIMIT_WINDOW_MS = '60000',
  AUDIO_PROXY_RATE_LIMIT_MAX = '30',
} = process.env

const rateState = new Map()

function enforceRateLimit(req, res, next) {
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

function createAudioProxy() {
  const router = express.Router()

  router.get('/audio-proxy', enforceRateLimit, (req, res) => {
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
