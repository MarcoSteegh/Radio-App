import 'dotenv/config'
import express from 'express'
import { pool } from './db.js'
import { createCorsMiddleware } from './middleware/cors.js'
import { createRateLimiter } from './middleware/rateLimit.js'
import { createSLAMiddleware } from './middleware/sla.js'
import { createServiceKeyMiddleware } from './middleware/serviceKey.js'
import { createAuthService } from './middleware/auth.js'
import { createImageProxy } from './routes/imageProxy.js'
import { createStationRoutes } from './routes/stations.js'
import { createSubmissionRoutes, createAdminSubmissionRoutes } from './routes/submissions.js'
import { createObservabilityRoutes, createAdminObservabilityRoutes } from './routes/observability.js'
import { createHealthRoute } from './routes/health.js'
import { createAdminAuthRoutes } from './routes/adminAuth.js'
import { createBulkUpsertRoute } from './routes/bulkUpsert.js'
import { createAudioProxy } from './routes/audioProxy.js'

const app = express()

const {
  API_PORT = '3000',
  API_HOST = '127.0.0.1',
  API_CORS_ORIGIN = 'http://localhost:5173',
  SERVICE_KEY = '',
  ADMIN_USERNAME = 'admin',
  ADMIN_PASSWORD = '',
  ADMIN_TOKEN_SECRET = '',
  ADMIN_TOKEN_TTL_SECONDS = '28800',
  SUBMISSION_RATE_LIMIT_WINDOW_MS = '60000',
  SUBMISSION_RATE_LIMIT_MAX = '5',
  IMAGE_PROXY_CACHE_TTL_MS = '600000',
  IMAGE_PROXY_CACHE_MAX_ITEMS = '500',
  IMAGE_PROXY_RATE_LIMIT_WINDOW_MS = '60000',
  IMAGE_PROXY_RATE_LIMIT_MAX = '120',
  IMAGE_PROXY_ALLOWED_HOSTS = '',
  ADMIN_COOKIE_NAME = 'radio_admin_session',
  ADMIN_COOKIE_SECURE = 'false',
  ADMIN_COOKIE_SAME_SITE = 'Lax',
  ADMIN_COOKIE_PATH = '/api/admin',
} = process.env

// ─── CORS ───────────────────────────────────────────────────────────────────
const configuredCorsOrigins = API_CORS_ORIGIN
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const allowedCorsOrigins = new Set(
  [...defaultCorsOrigins, ...configuredCorsOrigins]
    .map((origin) => origin.toLowerCase()),
)

app.use(createCorsMiddleware(allowedCorsOrigins))
app.use(express.json({ limit: '2mb' }))
app.use(createSLAMiddleware())

// ─── Shared State ───────────────────────────────────────────────────────────
const submissionRateState = new Map()
const imageProxyRateState = new Map()
const observabilityRateState = new Map()
const imageProxyCache = new Map()
const imageProxyBlockedLogState = new Map()
const adminLoginRateState = new Map()
const imageProxyAllowedHosts = IMAGE_PROXY_ALLOWED_HOSTS
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean)

// ─── Auth Service ───────────────────────────────────────────────────────────
const authService = createAuthService({
  adminUsername: ADMIN_USERNAME,
  adminPassword: ADMIN_PASSWORD,
  adminTokenSecret: ADMIN_TOKEN_SECRET,
  adminTokenTtlSeconds: ADMIN_TOKEN_TTL_SECONDS,
  adminCookieName: ADMIN_COOKIE_NAME,
  adminCookieSecure: ADMIN_COOKIE_SECURE,
  adminCookieSameSite: ADMIN_COOKIE_SAME_SITE,
  adminCookiePath: ADMIN_COOKIE_PATH,
})

// ─── Rate Limiters ──────────────────────────────────────────────────────────
const enforceSubmissionRateLimit = createRateLimiter({
  stateMap: submissionRateState,
  windowMs: Math.max(1000, Number(SUBMISSION_RATE_LIMIT_WINDOW_MS) || 60000),
  maxRequests: Math.max(1, Number(SUBMISSION_RATE_LIMIT_MAX) || 5),
  errorMessage: 'Too many submissions. Please try again later.',
})

const enforceImageProxyRateLimit = createRateLimiter({
  stateMap: imageProxyRateState,
  windowMs: Math.max(1000, Number(IMAGE_PROXY_RATE_LIMIT_WINDOW_MS) || 60000),
  maxRequests: Math.max(1, Number(IMAGE_PROXY_RATE_LIMIT_MAX) || 120),
  errorMessage: 'Too many image proxy requests. Please try again later.',
})

const enforceObservabilityRateLimit = createRateLimiter({
  stateMap: observabilityRateState,
  windowMs: 60000,
  maxRequests: 240,
  errorMessage: 'Too many observability events. Please try again later.',
})

const enforceAdminLoginRateLimit = createRateLimiter({
  stateMap: adminLoginRateState,
  windowMs: 60000,
  maxRequests: 10,
  errorMessage: 'Too many login attempts. Please try again later.',
})

const requireServiceKey = createServiceKeyMiddleware(SERVICE_KEY)

// ─── Routes ─────────────────────────────────────────────────────────────────
const stationRoutes = createStationRoutes()
const submissionRoutes = createSubmissionRoutes()
const adminSubmissionRoutes = createAdminSubmissionRoutes()
const observabilityRoutes = createObservabilityRoutes()
const adminObservabilityRoutes = createAdminObservabilityRoutes()
const healthRoute = createHealthRoute()
const adminAuthRoutes = createAdminAuthRoutes(authService)
const bulkUpsertRoute = createBulkUpsertRoute()
const imageProxy = createImageProxy({
  imageProxyCache,
  imageProxyBlockedLogState,
  imageProxyAllowedHosts,
  cacheTtlMs: Math.max(30000, Number(IMAGE_PROXY_CACHE_TTL_MS) || 600000),
  cacheMaxItems: Math.max(50, Number(IMAGE_PROXY_CACHE_MAX_ITEMS) || 500),
})

// ─── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', healthRoute.getHealth)

// ─── Observability Ingest ───────────────────────────────────────────────────
app.post('/api/observability/events', enforceObservabilityRateLimit, observabilityRoutes.ingestEvent)
app.post('/api/observability/errors', enforceObservabilityRateLimit, observabilityRoutes.ingestError)

// ─── Admin Auth ─────────────────────────────────────────────────────────────
app.post('/api/admin/login', enforceAdminLoginRateLimit, adminAuthRoutes.login)
app.get('/api/admin/auth-status', adminAuthRoutes.authStatusUnprotected)
app.post('/api/admin/refresh', authService.requireAdminAuth, adminAuthRoutes.refresh)
app.post('/api/admin/logout', authService.requireAdminAuth, adminAuthRoutes.logout)

// ─── Audio Proxy ─────────────────────────────────────────────────────────────
const audioProxy = createAudioProxy()
app.use('/api', audioProxy)

// ─── Image Proxy ────────────────────────────────────────────────────────────
app.get('/api/image-proxy', enforceImageProxyRateLimit, imageProxy.handleImageProxy)

// ─── Station Queries ────────────────────────────────────────────────────────
app.get('/api/stations/search', stationRoutes.searchStations)
app.get('/api/stations/geo-count', stationRoutes.getGeoStationCount)
app.get('/api/stations/geo', stationRoutes.getGeoStations)
app.get('/api/stations/by-url', stationRoutes.getStationByUrl)

// ─── Submissions ────────────────────────────────────────────────────────────
app.post('/api/submissions', enforceSubmissionRateLimit, submissionRoutes.submitStation)

// ─── Admin Submissions ──────────────────────────────────────────────────────
app.get('/api/admin/submissions', authService.requireAdminAuth, adminSubmissionRoutes.getSubmissions)
app.get('/api/admin/submissions/count', authService.requireAdminAuth, adminSubmissionRoutes.getSubmissionsCount)
app.patch('/api/admin/submissions/:id', authService.requireAdminAuth, adminSubmissionRoutes.updateSubmission)

// ─── Admin Observability ────────────────────────────────────────────────────
app.get('/api/admin/observability/summary', authService.requireAdminAuth, async (_req, res) => {
  // Inject SLA data before delegating
  const { getRecentEntries, calcAvailability, calcP95, SLA_TARGET } = await import('./middleware/sla.js')
  const allServerEntries = getRecentEntries()
  const serverAvailabilityPct = calcAvailability(allServerEntries)
  const serverP95LatencyMs = calcP95(allServerEntries)
  const errorBudgetRemainingPct = serverAvailabilityPct === null
    ? null
    : Number((Math.max(0, serverAvailabilityPct - SLA_TARGET) / (100 - SLA_TARGET) * 100).toFixed(2))

  // Override res.json to inject SLA data
  const originalJson = res.json.bind(res)
  res.json = (data) => {
    if (data?.last24h) {
      data.last24h.sla = {
        target_pct: SLA_TARGET,
        availability_pct: serverAvailabilityPct,
        error_budget_remaining_pct: errorBudgetRemainingPct,
        p95_latency_ms: serverP95LatencyMs,
        total_requests_tracked: allServerEntries.length,
      }
    }
    return originalJson(data)
  }

  adminObservabilityRoutes.getSummary(_req, res)
})

// ─── Bulk Upsert ────────────────────────────────────────────────────────────
app.post('/api/admin/stations/bulk-upsert', requireServiceKey, bulkUpsertRoute.bulkUpsert)

// ─── Initialize & Start ─────────────────────────────────────────────────────
async function initializeObservabilityTables() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGINT NOT NULL AUTO_INCREMENT,
      event_name VARCHAR(80) NOT NULL,
      session_id VARCHAR(120) NOT NULL,
      page VARCHAR(200) NOT NULL DEFAULT '',
      occurred_at DATETIME NOT NULL,
      properties_json TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_analytics_events_occurred_at (occurred_at),
      INDEX idx_analytics_events_name (event_name),
      INDEX idx_analytics_events_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  )

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS analytics_errors (
      id BIGINT NOT NULL AUTO_INCREMENT,
      source VARCHAR(80) NOT NULL,
      message VARCHAR(400) NOT NULL,
      stack TEXT NOT NULL,
      context_json TEXT NOT NULL,
      session_id VARCHAR(120) NOT NULL DEFAULT '',
      page VARCHAR(200) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_analytics_errors_created_at (created_at),
      INDEX idx_analytics_errors_source (source)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  )

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS admin_moderation_audit_log (
      id BIGINT NOT NULL AUTO_INCREMENT,
      submission_id BIGINT NOT NULL,
      stationuuid VARCHAR(80) NOT NULL,
      action VARCHAR(20) NOT NULL,
      previous_approved TINYINT NOT NULL,
      next_approved TINYINT NOT NULL,
      admin_username VARCHAR(120) NOT NULL,
      ip_address VARCHAR(120) NOT NULL DEFAULT '',
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_admin_audit_submission (submission_id),
      INDEX idx_admin_audit_created_at (created_at),
      INDEX idx_admin_audit_admin (admin_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  )
}

void initializeObservabilityTables()
  .catch((error) => {
    console.warn('Observability tables unavailable; continuing without them:', error.message)
  })
  .finally(() => {
    app.listen(Number(API_PORT), API_HOST, () => {
      console.log(`API listening on http://${API_HOST}:${API_PORT}`)
    })
  })
