import { pool } from '../db.js'
import { sendApiError, normalizeText } from '../middleware/helpers.js'

function sanitizeObservabilityProps(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  const result = {}
  for (const [rawKey, rawValue] of Object.entries(input).slice(0, 40)) {
    const key = normalizeText(rawKey, 80)
    if (!key) continue

    if (
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean' ||
      rawValue === null
    ) {
      result[key] = rawValue
      continue
    }

    result[key] = normalizeText(JSON.stringify(rawValue), 300)
  }

  return result
}

export function createObservabilityRoutes() {
  async function ingestEvent(req, res) {
    const body = req.body ?? {}
    const eventName = normalizeText(body.eventName, 80)
    const sessionId = normalizeText(body.sessionId, 120)
    const page = normalizeText(body.page, 200)
    const occurredAtRaw = Number(body.occurredAt)
    const occurredAtMs = Number.isFinite(occurredAtRaw) ? occurredAtRaw : Date.now()
    const properties = sanitizeObservabilityProps(body.properties)

    if (!eventName || !sessionId) {
      sendApiError(res, 400, 'INVALID_PAYLOAD', 'eventName and sessionId are required.')
      return
    }

    try {
      await pool.query(
        `
        INSERT INTO analytics_events (
          event_name, session_id, page, occurred_at, properties_json
        ) VALUES (
          :event_name, :session_id, :page, FROM_UNIXTIME(:occurred_at_ms / 1000), :properties_json
        )
        `,
        {
          event_name: eventName,
          session_id: sessionId,
          page,
          occurred_at_ms: occurredAtMs,
          properties_json: JSON.stringify(properties),
        },
      )

      res.status(202).json({ accepted: true })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to record analytics event.')
    }
  }

  async function ingestError(req, res) {
    const body = req.body ?? {}
    const source = normalizeText(body.source, 80)
    const message = normalizeText(body.message, 400)
    const stack = normalizeText(body.stack, 3000)
    const context = sanitizeObservabilityProps(body.context)
    const sessionId = normalizeText(body.sessionId, 120)
    const page = normalizeText(body.page, 200)

    if (!source || !message) {
      sendApiError(res, 400, 'INVALID_PAYLOAD', 'source and message are required.')
      return
    }

    try {
      await pool.query(
        `
        INSERT INTO analytics_errors (
          source, message, stack, context_json, session_id, page
        ) VALUES (
          :source, :message, :stack, :context_json, :session_id, :page
        )
        `,
        {
          source,
          message,
          stack,
          context_json: JSON.stringify(context),
          session_id: sessionId,
          page,
        },
      )

      res.status(202).json({ accepted: true })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to record analytics error.')
    }
  }

  return { ingestEvent, ingestError }
}

export function createAdminObservabilityRoutes() {
  async function getSummary(_req, res) {
    try {
      const buildFunnelStats = async ({
        rangeCondition,
        rangeParams = [],
      }) => {
        const funnelSteps = [
          'app_open',
          'play_start',
          'play_3min',
          'favorite_add',
          'submit_station',
        ]

        const [funnelSessionRows] = await pool.query(
          `
          SELECT event_name, COUNT(DISTINCT session_id) AS session_count
          FROM analytics_events
          WHERE ${rangeCondition}
            AND session_id <> ''
            AND event_name IN (${funnelSteps.map(() => '?').join(', ')})
          GROUP BY event_name
          `,
          [...rangeParams, ...funnelSteps],
        )

        const funnelSessionsByEvent = new Map(
          funnelSessionRows.map((row) => [
            String(row.event_name ?? ''),
            Number(row.session_count ?? 0),
          ]),
        )

        const appOpenSessions = Math.max(0, funnelSessionsByEvent.get('app_open') ?? 0)
        let previousSessions = appOpenSessions
        const funnel = funnelSteps.map((eventName, index) => {
          const sessions = Math.max(0, funnelSessionsByEvent.get(eventName) ?? 0)
          const conversionFromPreviousPct =
            index === 0
              ? 100
              : previousSessions > 0
                ? Number(((sessions / previousSessions) * 100).toFixed(2))
                : 0
          const conversionFromStartPct =
            appOpenSessions > 0
              ? Number(((sessions / appOpenSessions) * 100).toFixed(2))
              : 0

          previousSessions = sessions

          return {
            eventName,
            sessions,
            conversionFromPreviousPct,
            conversionFromStartPct,
          }
        })

        const funnelCompletenessPct =
          appOpenSessions > 0
            ? Number((((funnelSessionsByEvent.get('submit_station') ?? 0) / appOpenSessions) * 100).toFixed(2))
            : 0

        return {
          funnel,
          funnelCompletenessPct,
        }
      }

      const [eventsByName] = await pool.query(
        `
        SELECT event_name, COUNT(*) AS count
        FROM analytics_events
        WHERE occurred_at >= (NOW() - INTERVAL 24 HOUR)
        GROUP BY event_name
        ORDER BY count DESC
        `,
      )

      const [errorCountRows] = await pool.query(
        `
        SELECT COUNT(*) AS count
        FROM analytics_errors
        WHERE created_at >= (NOW() - INTERVAL 24 HOUR)
        `,
      )

      const [activeSessionRows] = await pool.query(
        `
        SELECT COUNT(DISTINCT session_id) AS count
        FROM analytics_events
        WHERE occurred_at >= (NOW() - INTERVAL 24 HOUR)
          AND session_id <> ''
        `,
      )
      const last24hFunnel = await buildFunnelStats({
        rangeCondition: 'occurred_at >= (NOW() - INTERVAL 24 HOUR)',
      })
      const previous24hFunnel = await buildFunnelStats({
        rangeCondition: 'occurred_at >= ? AND occurred_at < ?',
        rangeParams: [
          new Date(Date.now() - (48 * 60 * 60 * 1000)),
          new Date(Date.now() - (24 * 60 * 60 * 1000)),
        ],
      })

      const [activationRows] = await pool.query(
        `
        SELECT
          COUNT(DISTINCT CASE WHEN event_name = 'app_open' AND session_id <> '' THEN session_id END) AS app_open_sessions,
          COUNT(DISTINCT CASE WHEN event_name = 'play_start' AND session_id <> '' THEN session_id END) AS play_start_sessions
        FROM analytics_events
        WHERE occurred_at >= (NOW() - INTERVAL 24 HOUR)
          AND event_name IN ('app_open', 'play_start')
        `,
      )

      const [streamStartRows] = await pool.query(
        `
        SELECT
          SUM(CASE WHEN event_name = 'station_select' THEN 1 ELSE 0 END) AS station_select_count,
          SUM(CASE WHEN event_name = 'play_start' THEN 1 ELSE 0 END) AS play_start_count
        FROM analytics_events
        WHERE occurred_at >= (NOW() - INTERVAL 24 HOUR)
          AND event_name IN ('station_select', 'play_start')
        `,
      )

      const [castRows] = await pool.query(
        `
        SELECT
          SUM(CASE WHEN event_name = 'cast_connect_attempt' THEN 1 ELSE 0 END) AS cast_attempt_count,
          SUM(CASE WHEN event_name = 'cast_connect_success' THEN 1 ELSE 0 END) AS cast_success_count,
          SUM(CASE WHEN event_name = 'cast_connect_failed' THEN 1 ELSE 0 END) AS cast_failed_count,
          SUM(CASE WHEN event_name = 'cast_connect_cancel' THEN 1 ELSE 0 END) AS cast_cancel_count
        FROM analytics_events
        WHERE occurred_at >= (NOW() - INTERVAL 24 HOUR)
          AND event_name IN ('cast_connect_attempt', 'cast_connect_success', 'cast_connect_failed', 'cast_connect_cancel')
        `,
      )

      const [d1CohortRows] = await pool.query(
        `
        SELECT COUNT(*) AS cohort_size
        FROM (
          SELECT DISTINCT session_id
          FROM analytics_events
          WHERE session_id <> ''
            AND event_name = 'app_open'
            AND occurred_at >= (CURDATE() - INTERVAL 1 DAY)
            AND occurred_at < CURDATE()
        ) cohort
        `,
      )

      const [d1RetainedRows] = await pool.query(
        `
        SELECT COUNT(*) AS retained_sessions
        FROM (
          SELECT DISTINCT session_id
          FROM analytics_events
          WHERE session_id <> ''
            AND event_name = 'app_open'
            AND occurred_at >= (CURDATE() - INTERVAL 1 DAY)
            AND occurred_at < CURDATE()
        ) cohort
        INNER JOIN (
          SELECT DISTINCT session_id
          FROM analytics_events
          WHERE session_id <> ''
            AND occurred_at >= CURDATE()
            AND occurred_at < (CURDATE() + INTERVAL 1 DAY)
        ) today USING (session_id)
        `,
      )

      const [d7CohortRows] = await pool.query(
        `
        SELECT COUNT(*) AS cohort_size
        FROM (
          SELECT DISTINCT session_id
          FROM analytics_events
          WHERE session_id <> ''
            AND event_name = 'app_open'
            AND occurred_at >= (CURDATE() - INTERVAL 7 DAY)
            AND occurred_at < (CURDATE() - INTERVAL 6 DAY)
        ) cohort
        `,
      )

      const [d7RetainedRows] = await pool.query(
        `
        SELECT COUNT(*) AS retained_sessions
        FROM (
          SELECT DISTINCT session_id
          FROM analytics_events
          WHERE session_id <> ''
            AND event_name = 'app_open'
            AND occurred_at >= (CURDATE() - INTERVAL 7 DAY)
            AND occurred_at < (CURDATE() - INTERVAL 6 DAY)
        ) cohort
        INNER JOIN (
          SELECT DISTINCT session_id
          FROM analytics_events
          WHERE session_id <> ''
            AND occurred_at >= CURDATE()
            AND occurred_at < (CURDATE() + INTERVAL 1 DAY)
        ) today USING (session_id)
        `,
      )

      const toPct = (numerator, denominator) => {
        const den = Number(denominator ?? 0)
        if (den <= 0) {
          return null
        }
        return Number(((Number(numerator ?? 0) / den) * 100).toFixed(2))
      }

      const activationAppOpenSessions = Number(activationRows[0]?.app_open_sessions ?? 0)
      const activationPlayStartSessions = Number(activationRows[0]?.play_start_sessions ?? 0)
      const streamStartAttempts = Number(streamStartRows[0]?.station_select_count ?? 0)
      const streamStartSuccesses = Number(streamStartRows[0]?.play_start_count ?? 0)
      const castAttempts = Number(castRows[0]?.cast_attempt_count ?? 0)
      const castSuccesses = Number(castRows[0]?.cast_success_count ?? 0)
      const castFailures = Number(castRows[0]?.cast_failed_count ?? 0)
      const castCancels = Number(castRows[0]?.cast_cancel_count ?? 0)
      const d1CohortSize = Number(d1CohortRows[0]?.cohort_size ?? 0)
      const d1Retained = Number(d1RetainedRows[0]?.retained_sessions ?? 0)
      const d7CohortSize = Number(d7CohortRows[0]?.cohort_size ?? 0)
      const d7Retained = Number(d7RetainedRows[0]?.retained_sessions ?? 0)

      const [endpointTotalRows] = await pool.query(
        `
        SELECT
          JSON_UNQUOTE(JSON_EXTRACT(properties_json, '$.endpoint')) AS endpoint,
          COUNT(*) AS total_requests
        FROM analytics_events
        WHERE occurred_at >= (NOW() - INTERVAL 24 HOUR)
          AND event_name = 'api_request'
        GROUP BY JSON_UNQUOTE(JSON_EXTRACT(properties_json, '$.endpoint'))
        `,
      )

      const [endpointErrorRows] = await pool.query(
        `
        SELECT
          JSON_UNQUOTE(JSON_EXTRACT(context_json, '$.endpoint')) AS endpoint,
          COUNT(*) AS error_requests
        FROM analytics_errors
        WHERE created_at >= (NOW() - INTERVAL 24 HOUR)
          AND source = 'api.http_error'
        GROUP BY JSON_UNQUOTE(JSON_EXTRACT(context_json, '$.endpoint'))
        `,
      )

      const [appOpenByDayRows] = await pool.query(
        `
        SELECT DATE(occurred_at) AS day, COUNT(DISTINCT session_id) AS sessions
        FROM analytics_events
        WHERE occurred_at >= (CURDATE() - INTERVAL 6 DAY)
          AND occurred_at < (CURDATE() + INTERVAL 1 DAY)
          AND session_id <> ''
          AND event_name = 'app_open'
        GROUP BY DATE(occurred_at)
        `,
      )

      const [submitByDayRows] = await pool.query(
        `
        SELECT DATE(occurred_at) AS day, COUNT(DISTINCT session_id) AS sessions
        FROM analytics_events
        WHERE occurred_at >= (CURDATE() - INTERVAL 6 DAY)
          AND occurred_at < (CURDATE() + INTERVAL 1 DAY)
          AND session_id <> ''
          AND event_name = 'submit_station'
        GROUP BY DATE(occurred_at)
        `,
      )

      const appOpenByDay = new Map(
        appOpenByDayRows.map((row) => [
          new Date(row.day).toISOString().slice(0, 10),
          Number(row.sessions ?? 0),
        ]),
      )
      const submitByDay = new Map(
        submitByDayRows.map((row) => [
          new Date(row.day).toISOString().slice(0, 10),
          Number(row.sessions ?? 0),
        ]),
      )

      const funnelCompletenessSeries7d = []
      for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
        const day = new Date()
        day.setHours(0, 0, 0, 0)
        day.setDate(day.getDate() - dayOffset)
        const dayKey = day.toISOString().slice(0, 10)

        const appOpenSessionsForDay = Math.max(0, appOpenByDay.get(dayKey) ?? 0)
        const submitSessionsForDay = Math.max(0, submitByDay.get(dayKey) ?? 0)
        const completenessPct = appOpenSessionsForDay > 0
          ? Number(((submitSessionsForDay / appOpenSessionsForDay) * 100).toFixed(2))
          : 0

        funnelCompletenessSeries7d.push({
          day: dayKey,
          completenessPct,
        })
      }

      const endpointTotals = new Map()
      for (const row of endpointTotalRows) {
        const endpoint = normalizeText(row.endpoint, 200)
        if (!endpoint) continue
        endpointTotals.set(endpoint, Number(row.total_requests ?? 0))
      }

      const endpointErrors = new Map()
      for (const row of endpointErrorRows) {
        const endpoint = normalizeText(row.endpoint, 200)
        if (!endpoint) continue
        endpointErrors.set(endpoint, Number(row.error_requests ?? 0))
      }

      const endpointErrorRates = Array.from(endpointTotals.entries())
        .map(([endpoint, totalRequests]) => {
          const errorRequests = endpointErrors.get(endpoint) ?? 0
          const errorRatePct = totalRequests > 0
            ? Number(((errorRequests / totalRequests) * 100).toFixed(2))
            : 0

          return {
            endpoint,
            totalRequests,
            errorRequests,
            errorRatePct,
          }
        })
        .sort((a, b) => b.errorRatePct - a.errorRatePct)

      // SLA fields are computed in the main server file and passed via middleware
      res.json({
        last24h: {
          eventsByName,
          errorCount: Number(errorCountRows[0]?.count ?? 0),
          activeSessions: Number(activeSessionRows[0]?.count ?? 0),
          funnel: last24hFunnel.funnel,
          funnelCompletenessPct: last24hFunnel.funnelCompletenessPct,
          previousFunnelCompletenessPct: previous24hFunnel.funnelCompletenessPct,
          funnelCompletenessTrendPct: Number(
            (last24hFunnel.funnelCompletenessPct - previous24hFunnel.funnelCompletenessPct).toFixed(2),
          ),
          funnelCompletenessSeries7d,
          endpointErrorRates,
          kpis: {
            activation: {
              appOpenSessions: activationAppOpenSessions,
              activatedSessions: activationPlayStartSessions,
              activationRatePct: toPct(activationPlayStartSessions, activationAppOpenSessions),
            },
            retention: {
              d1: {
                cohortSize: d1CohortSize,
                retainedSessions: d1Retained,
                retentionRatePct: toPct(d1Retained, d1CohortSize),
              },
              d7: {
                cohortSize: d7CohortSize,
                retainedSessions: d7Retained,
                retentionRatePct: toPct(d7Retained, d7CohortSize),
              },
            },
            cast: {
              attempts: castAttempts,
              successes: castSuccesses,
              failures: castFailures,
              cancels: castCancels,
              successRatePct: toPct(castSuccesses, castAttempts),
            },
            streamStart: {
              attempts: streamStartAttempts,
              successes: streamStartSuccesses,
              successRatePct: toPct(streamStartSuccesses, streamStartAttempts),
            },
          },
        },
      })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to load observability summary.')
    }
  }

  return { getSummary }
}
