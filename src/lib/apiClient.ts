import type { Station } from '../types/station'
import { trackApiOutcome, trackEvent } from './observability'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
  timeoutMs?: number
}

type ApiErrorContext =
  | 'station_search'
  | 'map_geo'
  | 'admin'
  | 'submission'
  | 'generic'

type StationSubmissionPayload = {
  name: string
  url_resolved: string
  country: string
  language: string
  tags: string
  favicon: string
  user_note: string
}

export type AdminSubmission = {
  id: number
  stationuuid: string
  name: string
  country: string
  state: string
  favicon: string
  url_resolved: string
  language: string
  tags: string
  user_note: string
  approved: number
  submitted_at: string
}

export type AdminLoginResponse = {
  authenticated: boolean
  expiresAt: number
}

export type AdminAuthStatusResponse = {
  authenticated: boolean
  expiresAt?: number
  reason?: string
}

export type ObservabilityEventCount = {
  event_name: string
  count: number
}

export type AdminObservabilitySummary = {
  last24h: {
    eventsByName: ObservabilityEventCount[]
    errorCount: number
    activeSessions: number
    funnel?: Array<{
      eventName: string
      sessions: number
      conversionFromPreviousPct: number
      conversionFromStartPct: number
    }>
    funnelCompletenessPct?: number
    previousFunnelCompletenessPct?: number
    funnelCompletenessTrendPct?: number
    funnelCompletenessSeries7d?: Array<{
      day: string
      completenessPct: number
    }>
    endpointErrorRates?: Array<{
      endpoint: string
      totalRequests: number
      errorRequests: number
      errorRatePct: number
    }>
    kpis?: {
      activation: {
        appOpenSessions: number
        activatedSessions: number
        activationRatePct: number | null
      }
      retention: {
        d1: {
          cohortSize: number
          retainedSessions: number
          retentionRatePct: number | null
        }
        d7: {
          cohortSize: number
          retainedSessions: number
          retentionRatePct: number | null
        }
      }
      cast: {
        attempts: number
        successes: number
        failures: number
        cancels: number
        successRatePct: number | null
      }
      streamStart: {
        attempts: number
        successes: number
        successRatePct: number | null
      }
    }
    sla?: {
      target_pct: number
      availability_pct: number | null
      error_budget_remaining_pct: number | null
      p95_latency_ms: number | null
      total_requests_tracked: number
    }
  }
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const DEFAULT_TIMEOUT_MS = 8000
const GEO_TIMEOUT_MS = 12000
const MAX_GET_RETRIES = 2

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL must be set in .env.local')
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE_URL}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function shouldIncludeCredentials(path: string): boolean {
  return path.startsWith('/admin/')
}

function isIdempotentMethod(method: string): boolean {
  return method === 'GET'
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function getDefaultTimeoutMs(path: string): number {
  if (path.startsWith('/stations/geo')) {
    return GEO_TIMEOUT_MS
  }
  return DEFAULT_TIMEOUT_MS
}

function getMaxRetries(method: string): number {
  if (!isIdempotentMethod(method)) {
    return 0
  }
  return MAX_GET_RETRIES
}

function isAbortError(value: unknown): value is DOMException {
  return value instanceof DOMException && value.name === 'AbortError'
}

function isTimeoutError(value: unknown): value is DOMException {
  return value instanceof DOMException && value.name === 'TimeoutError'
}

function createCombinedAbortSignal(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const valid = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  if (valid.length === 0) {
    return undefined
  }
  if (valid.length === 1) {
    return valid[0]
  }

  const controller = new AbortController()
  const abortOnce = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  for (const signal of valid) {
    if (signal.aborted) {
      abortOnce()
      break
    }
    signal.addEventListener('abort', abortOnce, { once: true })
  }

  return controller.signal
}

function backoffDelayMs(attempt: number): number {
  const base = 300 * 2 ** attempt
  const jitter = Math.floor(Math.random() * 120)
  return base + jitter
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function getApiErrorUserMessage(error: unknown, context: ApiErrorContext = 'generic'): string {
  if (!(error instanceof ApiError)) {
    if (context === 'map_geo') {
      return 'Kaartgegevens zijn tijdelijk niet bereikbaar. Probeer opnieuw. (E-NET-00)'
    }
    return 'De server is tijdelijk niet bereikbaar. Probeer het zo opnieuw. (E-NET-00)'
  }

  if (error.code === 'API_TIMEOUT') {
    if (context === 'map_geo') {
      return 'Het laden van kaartgegevens duurt te lang. Probeer opnieuw. (E-TIME-01)'
    }
    return 'De server reageert te traag. Probeer het over een paar seconden opnieuw. (E-TIME-01)'
  }

  if (error.code === 'API_NETWORK_UNAVAILABLE') {
    return 'Geen verbinding met de server. Controleer netwerk/API en probeer opnieuw. (E-NET-01)'
  }

  if (error.status === 429) {
    return 'Te veel verzoeken tegelijk. Wacht even en probeer opnieuw. (E-RATE-01)'
  }

  if (error.status >= 500) {
    if (context === 'admin') {
      return 'Admin-service tijdelijk niet beschikbaar. Probeer opnieuw. (E-SRV-ADMIN)'
    }
    if (context === 'map_geo') {
      return 'Kaartservice tijdelijk niet beschikbaar. Probeer opnieuw. (E-SRV-MAP)'
    }
    return 'De server heeft tijdelijk een probleem. Probeer het zo opnieuw. (E-SRV-01)'
  }

  if (error.status >= 400) {
    return `${error.message} (E-REQ-${error.status})`
  }

  return 'Er ging iets mis bij het laden. Probeer opnieuw. (E-APP-01)'
}

async function request<T>(path: string, options: RequestOptions = {}, query?: Record<string, string | number | undefined>): Promise<T> {
  const method = options.method ?? 'GET'
  const hasBody = options.body !== undefined
  const timeoutMs = options.timeoutMs ?? getDefaultTimeoutMs(path)
  const maxRetries = getMaxRetries(method)
  const requestHeaders: Record<string, string> = {
    ...(options.headers ?? {}),
  }
  if (hasBody) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const timeoutController = new AbortController()
    const timeoutId = window.setTimeout(() => {
      timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'))
    }, timeoutMs)

    try {
      const response = await fetch(buildUrl(path, query), {
        method,
        credentials: shouldIncludeCredentials(path) ? 'include' : 'same-origin',
        headers: requestHeaders,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: createCombinedAbortSignal([options.signal, timeoutController.signal]),
      })

      if (!response.ok) {
        let message = `API request failed with status ${response.status}`
        let code: string | undefined

        try {
          const parsed = await response.json() as { message?: string; code?: string }
          if (parsed.message) {
            message = parsed.message
          }
          if (parsed.code) {
            code = parsed.code
          }
        } catch {
          // Use fallback message when body is not JSON.
        }

        const canRetry = attempt < maxRetries && shouldRetryStatus(response.status)
        if (canRetry) {
          const delayMs = backoffDelayMs(attempt)
          trackEvent('api_retry_scheduled', {
            path,
            method,
            status: response.status,
            attempt: attempt + 1,
            retryInMs: delayMs,
          })
          await wait(delayMs)
          continue
        }

        trackApiOutcome({
          path,
          method,
          status: response.status,
          code,
          message,
        })

        throw new ApiError(message, response.status, code)
      }

      trackApiOutcome({
        path,
        method,
        status: response.status,
      })

      return response.json() as Promise<T>
    } catch (error) {
      if (options.signal?.aborted && isAbortError(error)) {
        throw error
      }

      // Re-throw ApiError instances that originated from HTTP error handling above
      // (they were thrown inside the try block and must not be re-wrapped).
      if (error instanceof ApiError) {
        throw error
      }

      const timeoutHappened = timeoutController.signal.aborted && isTimeoutError(timeoutController.signal.reason)
      const transientNetworkError = error instanceof TypeError || timeoutHappened || isTimeoutError(error)
      const canRetry = attempt < maxRetries && transientNetworkError

      if (canRetry) {
        const delayMs = backoffDelayMs(attempt)
        trackEvent('api_retry_scheduled', {
          path,
          method,
          status: 0,
          attempt: attempt + 1,
          retryInMs: delayMs,
          reason: timeoutHappened ? 'timeout' : 'network',
        })
        await wait(delayMs)
        continue
      }

      const code = timeoutHappened ? 'API_TIMEOUT' : 'API_NETWORK_UNAVAILABLE'
      const message = timeoutHappened
        ? 'Request timed out while contacting API'
        : 'Unable to reach API service'

      trackApiOutcome({
        path,
        method,
        status: 0,
        code,
        message,
      })

      throw new ApiError(message, 0, code)
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  throw new ApiError('Request failed after retries', 0, 'API_RETRY_EXHAUSTED')
}

export async function fetchStations(params: {
  term: string
  offset: number
  limit: number
  signal?: AbortSignal
}): Promise<Station[]> {
  return request<Station[]>('/stations/search', { signal: params.signal }, {
    q: params.term,
    offset: params.offset,
    limit: params.limit,
  })
}

export async function fetchGeoCount(): Promise<number> {
  const result = await request<{ count: number }>('/stations/geo-count')
  return result.count ?? 0
}

export async function fetchGeoStations(params: { offset: number; limit: number }): Promise<Station[]> {
  return request<Station[]>('/stations/geo', {}, {
    offset: params.offset,
    limit: params.limit,
  })
}

export async function findStationByUrl(url: string): Promise<{ stationuuid: string } | null> {
  return request<{ stationuuid: string } | null>('/stations/by-url', {}, { url })
}

export async function submitStation(payload: StationSubmissionPayload): Promise<{ id: number; stationuuid: string }> {
  return request<{ id: number; stationuuid: string }>('/submissions', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchAdminSubmissions(params: {
  status?: 'pending' | 'approved' | 'all'
  offset?: number
  limit?: number
}): Promise<AdminSubmission[]> {
  return request<AdminSubmission[]>(
    '/admin/submissions',
    {},
    {
      status: params.status ?? 'pending',
      offset: params.offset ?? 0,
      limit: params.limit ?? 100,
    },
  )
}

export async function updateAdminSubmission(params: {
  id: number
  approved: boolean
}): Promise<AdminSubmission | null> {
  return request<AdminSubmission | null>(
    `/admin/submissions/${params.id}`,
    {
      method: 'PATCH',
      body: { approved: params.approved },
    },
  )
}

export async function fetchAdminSubmissionsCount(params: {
  status?: 'pending' | 'approved' | 'all'
}): Promise<number> {
  const result = await request<{ count: number }>(
    '/admin/submissions/count',
    {},
    {
      status: params.status ?? 'pending',
    },
  )

  return Number(result.count ?? 0)
}

export async function fetchAdminAuthStatus(): Promise<AdminAuthStatusResponse> {
  return request<AdminAuthStatusResponse>('/admin/auth-status')
}

export async function loginAdmin(params: {
  username: string
  password: string
}): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>('/admin/login', {
    method: 'POST',
    body: {
      username: params.username,
      password: params.password,
    },
  })
}

export async function refreshAdminToken(): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>('/admin/refresh', {
    method: 'POST',
  })
}

export async function logoutAdmin(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/admin/logout', {
    method: 'POST',
  })
}

export async function fetchAdminObservabilitySummary(): Promise<AdminObservabilitySummary> {
  return request<AdminObservabilitySummary>('/admin/observability/summary')
}
