const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string
const OBSERVABILITY_DEFAULT_ENABLED = import.meta.env.DEV ? 'false' : 'true'
const OBSERVABILITY_ENABLED =
  String(import.meta.env.VITE_OBSERVABILITY_ENABLED ?? OBSERVABILITY_DEFAULT_ENABLED).toLowerCase() === 'true'
const SESSION_KEY = 'world-radio-explorer-observability-session-id'
let observabilityTransportBlocked = false

function getSessionId() {
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing) {
    return existing
  }

  const next =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  sessionStorage.setItem(SESSION_KEY, next)
  return next
}

function postJson(path: string, payload: unknown) {
  if (!OBSERVABILITY_ENABLED || observabilityTransportBlocked || !API_BASE_URL) {
    return
  }

  const body = JSON.stringify(payload)
  const url = `${API_BASE_URL}${path}`

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    const accepted = navigator.sendBeacon(url, blob)
    if (!accepted) {
      observabilityTransportBlocked = true
    }
    return
  }

  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Observability should never break user flows.
    observabilityTransportBlocked = true
  })
}

export function trackEvent(eventName: string, properties: Record<string, unknown> = {}) {
  if (!eventName) return

  postJson('/observability/events', {
    eventName,
    sessionId: getSessionId(),
    page: window.location.pathname,
    occurredAt: Date.now(),
    properties,
  })
}

export function trackError(params: {
  source: string
  message: string
  stack?: string
  context?: Record<string, unknown>
}) {
  if (!params.source || !params.message) return

  postJson('/observability/errors', {
    source: params.source,
    message: params.message,
    stack: params.stack ?? '',
    context: params.context ?? {},
    sessionId: getSessionId(),
    page: window.location.pathname,
  })
}

function toStatusBucket(status: number): string {
  if (status >= 500) return '5xx'
  if (status >= 400) return '4xx'
  if (status >= 300) return '3xx'
  if (status >= 200) return '2xx'
  if (status >= 100) return '1xx'
  return 'unknown'
}

export function trackApiOutcome(params: {
  path: string
  method: string
  status: number
  code?: string
  message?: string
}) {
  const endpoint = String(params.path ?? '')
  if (!endpoint || endpoint.startsWith('/observability/')) {
    return
  }

  const method = String(params.method ?? 'GET').toUpperCase()
  const status = Number(params.status)
  const statusBucket = toStatusBucket(status)

  trackEvent('api_request', {
    endpoint,
    method,
    status,
    statusBucket,
    ok: status < 400,
  })

  if (status >= 400) {
    trackError({
      source: 'api.http_error',
      message: `${method} ${endpoint} -> ${status}`,
      context: {
        endpoint,
        method,
        status,
        code: params.code ?? '',
        apiMessage: params.message ?? '',
      },
    })
  }
}
