/**
 * Tests for the reliability-sprint additions in apiClient.ts:
 * - getApiErrorUserMessage: error-type to user-text + short-code mapping
 * - request() retry policy: 2 retries with backoff for GET/transient errors
 * - request() no-retry on 4xx and non-GET methods
 * - request() timeout: ApiError with API_TIMEOUT code after timeout fires
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchStations, getApiErrorUserMessage, probeApiHealth } from './apiClient'

// ---------------------------------------------------------------------------
// getApiErrorUserMessage
// ---------------------------------------------------------------------------
describe('getApiErrorUserMessage', () => {
  it('returns E-NET-00 for a non-ApiError (network down before reaching fetch)', () => {
    const msg = getApiErrorUserMessage(new TypeError('Failed to fetch'))
    expect(msg).toContain('E-NET-00')
  })

  it('returns E-NET-00 for unknown error type', () => {
    expect(getApiErrorUserMessage('unknown')).toContain('E-NET-00')
  })

  it('returns E-TIME-01 for API_TIMEOUT code', () => {
    const err = new ApiError('timeout', 0, 'API_TIMEOUT')
    expect(getApiErrorUserMessage(err)).toContain('E-TIME-01')
    expect(getApiErrorUserMessage(err)).toContain('traag')
  })

  it('returns map_geo flavour of E-TIME-01 when context is map_geo', () => {
    const err = new ApiError('timeout', 0, 'API_TIMEOUT')
    const msg = getApiErrorUserMessage(err, 'map_geo')
    expect(msg).toContain('E-TIME-01')
    expect(msg.toLowerCase()).toContain('kaart')
  })

  it('returns E-NET-01 for API_NETWORK_UNAVAILABLE code', () => {
    const err = new ApiError('net', 0, 'API_NETWORK_UNAVAILABLE')
    expect(getApiErrorUserMessage(err)).toContain('E-NET-01')
  })

  it('returns E-RATE-01 for HTTP 429', () => {
    const err = new ApiError('rate limited', 429)
    expect(getApiErrorUserMessage(err)).toContain('E-RATE-01')
  })

  it('returns E-SRV-01 for HTTP 500', () => {
    const err = new ApiError('internal error', 500)
    expect(getApiErrorUserMessage(err)).toContain('E-SRV-01')
  })

  it('returns E-SRV-ADMIN for HTTP 500 in admin context', () => {
    const err = new ApiError('internal error', 500)
    expect(getApiErrorUserMessage(err, 'admin')).toContain('E-SRV-ADMIN')
  })

  it('returns E-SRV-MAP for HTTP 500 in map_geo context', () => {
    const err = new ApiError('internal error', 500)
    expect(getApiErrorUserMessage(err, 'map_geo')).toContain('E-SRV-MAP')
  })

  it('returns E-REQ-404 for HTTP 404', () => {
    const err = new ApiError('not found', 404)
    expect(getApiErrorUserMessage(err)).toContain('E-REQ-404')
  })

  it('returns E-REQ-403 for HTTP 403', () => {
    const err = new ApiError('forbidden', 403)
    expect(getApiErrorUserMessage(err)).toContain('E-REQ-403')
  })
})

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------
describe('probeApiHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when the health endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(probeApiHealth()).resolves.toBe(false)
  })

  it('returns true when the health endpoint responds successfully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await expect(probeApiHealth()).resolves.toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Retry policy – helpers
// ---------------------------------------------------------------------------

type FetchResponseLike = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function okResponse(body: unknown): FetchResponseLike {
  return { ok: true, status: 200, json: async () => body }
}

function errorResponse(status: number, body: unknown = {}): FetchResponseLike {
  return { ok: false, status, json: async () => body }
}

// ---------------------------------------------------------------------------
// Retry policy – GET requests (idempotent)
// ---------------------------------------------------------------------------
describe('request() retry policy — GET', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('succeeds on the first attempt without any retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and succeeds on the second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500, { message: 'down' }))
      .mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries up to MAX_GET_RETRIES (2) times then throws ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(503, { message: 'down' }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    const caught = promise.catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    // 1 initial + 2 retries = 3 calls total
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries on 408 (request timeout from server)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(408))
      .mockResolvedValueOnce(errorResponse(408))
      .mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries on 429 (rate limit)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 404 — throws immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404, { message: 'not found' }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    const caught = promise.catch((e: unknown) => e)
    await vi.runAllTimersAsync()

    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on 400 — throws immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(400, { message: 'bad request' }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    const caught = promise.catch((e: unknown) => e)
    await vi.runAllTimersAsync()

    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on TypeError (network unavailable) and wraps in ApiError', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    const caught = promise.catch((e: unknown) => e)
    await vi.runAllTimersAsync()

    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('API_NETWORK_UNAVAILABLE')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry when caller AbortSignal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    )
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5, signal: controller.signal })
    const caught = promise.catch((e: unknown) => e)
    await vi.runAllTimersAsync()

    const err = await caught
    expect(err).toBeInstanceOf(DOMException)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Timeout — request fires AbortController after timeoutMs
// ---------------------------------------------------------------------------
describe('request() timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('throws ApiError with API_TIMEOUT when the timeout fires before fetch resolves', async () => {
    // fetch hangs indefinitely but honours the AbortSignal (as a real browser fetch would).
    const fetchMock = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      return new Promise<never>((_resolve, reject) => {
        const signal = opts?.signal
        if (signal) {
          const handler = () =>
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
          if (signal.aborted) {
            handler()
          } else {
            signal.addEventListener('abort', handler, { once: true })
          }
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    // Attach catch BEFORE advancing timers to avoid spurious unhandled-rejection reports.
    const caught = promise.catch((e: unknown) => e)

    // Advance past the default 8000 ms timeout (× 3 attempts + jitter)
    await vi.advanceTimersByTimeAsync(8000 * 4)

    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('API_TIMEOUT')
  })
})

// ---------------------------------------------------------------------------
// ApiError code is passed through from server response body
// ---------------------------------------------------------------------------
describe('request() error code extraction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('exposes the server-provided error code on ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      errorResponse(400, { message: 'Duplicate URL', code: 'DUPLICATE_URL' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchStations({ term: '', offset: 0, limit: 5 })
    // Attach catch BEFORE advancing timers to avoid spurious unhandled-rejection reports.
    const caught = promise.catch((e: unknown) => e)
    await vi.runAllTimersAsync()

    const err = await caught
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('DUPLICATE_URL')
    expect((err as ApiError).message).toBe('Duplicate URL')
  })
})
