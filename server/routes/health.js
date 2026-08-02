import { pool } from '../db.js'
import { getRecentEntries, calcAvailability, calcP95, SLA_TARGET } from '../middleware/sla.js'

export function createHealthRoute() {
  async function getHealth(_req, res) {
    const start = Date.now()
    try {
      await pool.query('SELECT 1')
      const dbLatencyMs = Date.now() - start

      const allEntries = getRecentEntries()
      const availabilityPct = calcAvailability(allEntries)
      const p95LatencyMs = calcP95(allEntries)
      const totalRequests = allEntries.length
      const status =
        availabilityPct === null || availabilityPct >= SLA_TARGET ? 'ok' : 'degraded'

      res.json({
        ok: true,
        status,
        db_available: true,
        db_latency_ms: dbLatencyMs,
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        sla_target_pct: SLA_TARGET,
        availability_pct: availabilityPct,
        p95_latency_ms: p95LatencyMs,
        total_requests_tracked: totalRequests,
      })
    } catch {
      res.json({
        ok: true,
        status: 'degraded',
        db_available: false,
        db_latency_ms: null,
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        sla_target_pct: SLA_TARGET,
        availability_pct: null,
        p95_latency_ms: null,
        total_requests_tracked: 0,
      })
    }
  }

  return { getHealth }
}
