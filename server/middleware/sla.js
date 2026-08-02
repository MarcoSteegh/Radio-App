// ─── In-memory SLA metrics ring-buffer ───────────────────────────────────────
// Tracks server-side request outcomes (status + duration) for the last
// METRICS_MAX_ENTRIES entries per endpoint. Used to compute p95 latency and
// server-side availability without a DB query.

const METRICS_MAX_ENTRIES = 2000
const METRICS_WINDOW_MS = 24 * 60 * 60 * 1000  // 24 h
const SLA_TARGET_PCT = 99.5

/** @type {Map<string, Array<{ts: number, duration: number, ok: boolean}>>} */
const metricsStore = new Map()

function recordMetric(endpoint, duration, status) {
  const ok = status > 0 && status < 500
  const entry = { ts: Date.now(), duration, ok }
  let entries = metricsStore.get(endpoint)
  if (!entries) {
    entries = []
    metricsStore.set(endpoint, entries)
  }
  entries.push(entry)
  if (entries.length > METRICS_MAX_ENTRIES) {
    entries.splice(0, entries.length - METRICS_MAX_ENTRIES)
  }
}

export function createSLAMiddleware() {
  return (req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      const path = req.path
      if (path.startsWith('/api/observability/')) return
      recordMetric(path, Date.now() - start, res.statusCode)
    })
    next()
  }
}

export function getRecentEntries(endpointFilter) {
  const cutoff = Date.now() - METRICS_WINDOW_MS
  const result = []
  for (const [ep, entries] of metricsStore.entries()) {
    if (endpointFilter && !ep.startsWith(endpointFilter)) continue
    for (const entry of entries) {
      if (entry.ts >= cutoff) result.push(entry)
    }
  }
  return result
}

export function calcP95(entries) {
  if (entries.length === 0) return null
  const sorted = entries.map((e) => e.duration).sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * 0.95)
  return sorted[Math.min(idx, sorted.length - 1)]
}

export function calcAvailability(entries) {
  if (entries.length === 0) return null
  const successCount = entries.filter((e) => e.ok).length
  return Number(((successCount / entries.length) * 100).toFixed(3))
}

export const SLA_TARGET = SLA_TARGET_PCT
